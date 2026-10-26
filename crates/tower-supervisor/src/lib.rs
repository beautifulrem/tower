//! The supervisor: Tower's single writer (`docs/06` §6.2).
//!
//! It owns the store, the goal engines and the verifier, and is the only
//! place lifecycle transitions are applied. The UI talks to it through the
//! async methods on [`Supervisor`] and receives [`UiUpdate`]s through a
//! [`UiSink`].

mod actions;
pub mod api;
pub mod paths;
pub mod prompts;
mod run;
pub mod sandbox;
pub mod shell_env;
mod summarize;
mod verify;

use std::collections::{HashMap, HashSet};
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex};
use std::time::Duration;

use serde::Serialize;
use thiserror::Error;
use tower_core::contract::{Contract, ContractIssue};
use tower_core::lifecycle::Transition;
use tower_core::review::build_units;
use tower_core::view::{
    EnvironmentStatus, GoalDetail, GoalSummary, InboxItem, InboxKind, ModelInfo, ProjectView, ReviewView, Settings,
    TraceEntry,
};
use tower_core::{EventKind, LifecycleState, Mode, PauseReason};
use tower_git::{Git, GitError};
use tower_pi::EngineError;
use tower_store::{NewGoal, NewInboxItem, NewProject, Store, StoreError};
use tower_verify::Cancel;

pub use api::{NewGoalInput, NullSink, ReviewComment, ToastLevel, UiSink, UiUpdate};
pub use paths::Paths;
use run::Run;
use shell_env::ShellEnv;

#[derive(Debug, Error)]
pub enum Error {
    #[error(transparent)]
    Store(#[from] StoreError),
    #[error(transparent)]
    Git(#[from] GitError),
    #[error(transparent)]
    Engine(#[from] EngineError),
    #[error("{0}")]
    Io(#[from] std::io::Error),
    #[error("{0}")]
    Invalid(String),
}

impl Serialize for Error {
    fn serialize<S: serde::Serializer>(&self, s: S) -> Result<S::Ok, S::Error> {
        s.serialize_str(&self.to_string())
    }
}

pub type Result<T, E = Error> = std::result::Result<T, E>;

fn invalid(msg: impl Into<String>) -> Error {
    Error::Invalid(msg.into())
}

#[derive(Debug, Clone)]
pub struct Config {
    pub paths: Paths,
    /// Directory containing the tower-goal extension sources to install.
    pub extension_source: PathBuf,
    /// Captured login-shell environment; `None` captures it now.
    pub env: Option<ShellEnv>,
}

/// Cheap to clone; all clones share one supervisor.
#[derive(Clone)]
pub struct Supervisor {
    inner: Arc<Inner>,
}

impl std::fmt::Debug for Supervisor {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("Supervisor").finish_non_exhaustive()
    }
}

pub(crate) struct Inner {
    pub paths: Paths,
    pub env: ShellEnv,
    pub git: Git,
    store: Mutex<Store>,
    pub sink: Arc<dyn UiSink>,
    pub runs: Mutex<HashMap<String, Arc<Run>>>,
    pub verifications: Mutex<HashMap<String, Cancel>>,
    dirty: Mutex<HashSet<String>>,
    models: Mutex<Option<(std::time::Instant, Vec<ModelInfo>)>>,
}

impl Inner {
    /// Runs `f` with the store locked. Never hold across an await.
    pub fn store<T>(&self, f: impl FnOnce(&mut Store) -> Result<T, StoreError>) -> Result<T> {
        let mut s = self.store.lock().expect("store lock");
        Ok(f(&mut s)?)
    }

    pub fn append(&self, goal: &str, e: EventKind) -> Result<TraceEntry> {
        let entry = self.store(|s| s.append(goal, e))?;
        self.sink.emit(UiUpdate::Trace { entry: entry.clone() });
        self.mark_dirty(goal);
        Ok(entry)
    }

    pub fn mark_dirty(&self, goal: &str) {
        self.dirty.lock().expect("dirty lock").insert(goal.to_string());
    }

    pub fn emit_goal_now(&self, goal: &str) {
        self.dirty.lock().expect("dirty lock").remove(goal);
        if let Ok(g) = self.store(|s| s.summary(goal)) {
            self.sink.emit(UiUpdate::Goal { goal: g });
        }
    }

    pub fn emit_inbox(&self) {
        if let Ok(items) = self.store(|s| s.open_inbox_items()) {
            self.sink.emit(UiUpdate::Inbox { items });
        }
    }

    pub fn toast(&self, level: ToastLevel, text: impl Into<String>) {
        self.sink.emit(UiUpdate::Toast { level, text: text.into() });
    }

    fn flush_dirty(&self) {
        let ids: Vec<String> = self.dirty.lock().expect("dirty lock").drain().collect();
        for id in ids {
            if let Ok(g) = self.store(|s| s.summary(&id)) {
                self.sink.emit(UiUpdate::Goal { goal: g });
            }
        }
    }

    /// Applies a lifecycle transition and pushes the result immediately.
    pub fn transition(&self, goal: &str, t: Transition, reason: Option<PauseReason>, note: &str) -> Result<()> {
        let entry = self.store(|s| s.transition(goal, t, reason, note))?;
        self.sink.emit(UiUpdate::Trace { entry });
        self.emit_goal_now(goal);
        Ok(())
    }

    pub fn set_mode(&self, goal: &str, mode: Mode) -> Result<()> {
        let current = self.store(|s| s.goal(goal))?.mode;
        if current != mode {
            self.append(goal, EventKind::ModeChanged { mode })?;
        }
        Ok(())
    }

    pub fn open_inbox(&self, item: NewInboxItem) -> Result<InboxItem> {
        let goal = item.goal_id.clone();
        let opened = self.store(|s| s.open_inbox(item))?;
        self.emit_goal_now(&goal);
        self.emit_inbox();
        Ok(opened)
    }

    pub fn withdraw(&self, goal: &str, kinds: &[InboxKind], reason: &str) {
        if self.store(|s| s.withdraw_inbox(goal, kinds, reason)).unwrap_or(0) > 0 {
            self.emit_goal_now(goal);
            self.emit_inbox();
        }
    }

    pub fn settings(&self) -> Settings {
        self.store(|s| s.settings()).unwrap_or_default()
    }

    pub fn pi_program(&self) -> Option<PathBuf> {
        let configured = self.settings().pi_path;
        if !configured.trim().is_empty() {
            return Some(PathBuf::from(configured.trim()));
        }
        self.env.which("pi")
    }

    pub fn running_count(&self) -> usize {
        self.runs.lock().expect("runs lock").len()
    }

    pub fn run_of(&self, goal: &str) -> Option<Arc<Run>> {
        self.runs.lock().expect("runs lock").get(goal).cloned()
    }
}

impl Supervisor {
    /// Opens the store, installs the extension, recovers goals interrupted
    /// by the last exit and starts the background loops.
    pub async fn start(config: Config, sink: Arc<dyn UiSink>) -> Result<Self> {
        config.paths.ensure()?;
        install_extension(&config.extension_source, &config.paths.extension_dir())?;
        let env = match config.env {
            Some(e) => e,
            None => tokio::task::spawn_blocking(ShellEnv::capture).await.map_err(|e| invalid(e.to_string()))?,
        };
        let git = Git::new(env.which("git").unwrap_or_else(|| PathBuf::from("git")), env.pairs());
        let store = Store::open(&config.paths.db())?;
        let inner = Arc::new(Inner {
            paths: config.paths,
            env,
            git,
            store: Mutex::new(store),
            sink,
            runs: Mutex::default(),
            verifications: Mutex::default(),
            dirty: Mutex::default(),
            models: Mutex::default(),
        });
        let sup = Self { inner };
        sup.spawn_loops();
        sup.recover().await;
        Ok(sup)
    }

    fn spawn_loops(&self) {
        // Coalescer: summaries of busy goals at most 10 times a second.
        let weak = Arc::downgrade(&self.inner);
        tokio::spawn(async move {
            let mut tick = tokio::time::interval(Duration::from_millis(100));
            loop {
                tick.tick().await;
                let Some(inner) = weak.upgrade() else { break };
                inner.flush_dirty();
            }
        });
        // Integration watcher: accepted goals whose branch reached the base.
        let weak = Arc::downgrade(&self.inner);
        tokio::spawn(async move {
            let mut tick = tokio::time::interval(Duration::from_secs(60));
            loop {
                tick.tick().await;
                let Some(inner) = weak.upgrade() else { break };
                let _ = actions::check_integrations(&inner).await;
            }
        });
    }

    /// Brings goals left mid-flight by the previous exit back to a defined
    /// state (`docs/06` §6.1.6).
    async fn recover(&self) {
        let inner = &self.inner;
        let running = inner.store(|s| s.goals_in_state(LifecycleState::Running)).unwrap_or_default();
        for g in running {
            inner.withdraw(&g.id, &[InboxKind::Question, InboxKind::Approval], "Tower 重新启动");
            let _ = inner.set_mode(&g.id, Mode::Idle);
            let _ = inner.transition(&g.id, Transition::Pause { reason: PauseReason::AppQuit }, None, "上次退出时仍在运行");
        }
        for state in [LifecycleState::Claimed, LifecycleState::Verifying] {
            for g in inner.store(|s| s.goals_in_state(state)).unwrap_or_default() {
                verify::spawn(inner.clone(), g.id);
            }
        }
        let quit: Vec<_> = inner
            .store(|s| s.goals_in_state(LifecycleState::Paused))
            .unwrap_or_default()
            .into_iter()
            .filter(|g| g.pause_reason == Some(PauseReason::AppQuit))
            .collect();
        for g in quit {
            let _ = run::resume(inner, &g.id).await;
        }
        run::schedule(inner).await;
    }

    /// Pauses every running goal so it resumes on next launch (`ADR-017`).
    pub async fn shutdown(&self) {
        let runs: Vec<String> = self.inner.runs.lock().expect("runs lock").keys().cloned().collect();
        for id in runs {
            let _ = run::pause(&self.inner, &id, PauseReason::AppQuit, "Tower 退出").await;
        }
        for (_, c) in self.inner.verifications.lock().expect("verify lock").drain() {
            c.cancel();
        }
    }

    // ---- reads --------------------------------------------------------------

    pub fn environment(&self) -> EnvironmentStatus {
        let inner = &self.inner;
        let pi = inner.pi_program();
        let pi_version = pi.as_ref().and_then(|p| {
            let out = std::process::Command::new(p)
                .arg("--version")
                .env_clear()
                .envs(inner.env.pairs())
                .output()
                .ok()?;
            out.status.success().then(|| String::from_utf8_lossy(&out.stdout).trim().to_string())
        });
        let git_version = inner.git.version().ok();
        let mut problems = Vec::new();
        if pi.is_none() {
            problems.push("没有找到 pi。请先安装 Pi（npm i -g @earendil-works/pi-coding-agent），或在设置中指定路径。".into());
        } else if pi_version.is_none() {
            problems.push("pi 无法运行。请检查设置中的路径。".into());
        }
        if git_version.is_none() {
            problems.push("没有找到 git。".into());
        }
        if !sandbox::available() {
            problems.push("这台机器上没有 OS 沙箱：Agent 的命令以你的权限运行。".into());
        }
        EnvironmentStatus {
            pi_path: pi.map(|p| p.display().to_string()),
            pi_version,
            git_version,
            data_dir: inner.paths.root.display().to_string(),
            problems,
        }
    }

    pub fn projects(&self) -> Result<Vec<ProjectView>> {
        self.inner.store(|s| s.projects())
    }

    pub fn goals(&self) -> Result<Vec<GoalSummary>> {
        self.inner.store(|s| s.summaries())
    }

    /// The goal page. Does not mark the goal viewed; call [`Self::mark_viewed`]
    /// when the human leaves the page so the next briefing starts there.
    pub fn goal(&self, id: &str) -> Result<GoalDetail> {
        self.inner.store(|s| s.detail(id))
    }

    pub fn mark_viewed(&self, id: &str) -> Result<()> {
        self.inner.store(|s| s.mark_viewed(id))?;
        self.inner.emit_goal_now(id);
        Ok(())
    }

    pub fn trace(&self, id: &str, before: Option<i64>, limit: u32) -> Result<Vec<TraceEntry>> {
        self.inner.store(|s| s.trace(id, before, limit.min(500)))
    }

    pub fn inbox(&self) -> Result<Vec<InboxItem>> {
        self.inner.store(|s| s.open_inbox_items())
    }

    pub async fn review(&self, id: &str) -> Result<ReviewView> {
        let rec = self.inner.store(|s| s.goal(id))?;
        let (Some(ws), Some(base)) = (rec.workspace.clone(), rec.base_commit.clone()) else {
            return Err(invalid("这个目标还没有工作区"));
        };
        let git = self.inner.git.clone();
        let pin = match rec.pin.clone() {
            Some(p) if !matches!(rec.state, LifecycleState::Running) => p,
            // While running, show the live tree.
            _ => {
                let ws2 = ws.clone();
                let base2 = base.clone();
                let snap = tokio::task::spawn_blocking(move || git.snapshot(Path::new(&ws2), &base2))
                    .await
                    .map_err(|e| invalid(e.to_string()))??;
                snap.pin
            }
        };
        let git = self.inner.git.clone();
        let (base2, pin2) = (base.clone(), pin.clone());
        let files = tokio::task::spawn_blocking(move || git.diff(Path::new(&ws), &base2, &pin2))
            .await
            .map_err(|e| invalid(e.to_string()))??;
        let stat = tower_core::view::DiffStat {
            files: files.len() as u32,
            additions: files.iter().map(|f| f.additions).sum(),
            deletions: files.iter().map(|f| f.deletions).sum(),
        };
        let units = build_units(&files, Some(&rec.contract.scope));
        Ok(ReviewView { goal_id: id.into(), base_commit: base, pin, stat, units, files })
    }

    pub fn settings(&self) -> Settings {
        self.inner.settings()
    }

    pub fn save_settings(&self, settings: Settings) -> Result<()> {
        if settings.max_concurrent == 0 || settings.max_concurrent > 10 {
            return Err(invalid("并发上限必须在 1 到 10 之间"));
        }
        self.inner.store(|s| s.save_settings(&settings))?;
        *self.inner.models.lock().expect("models lock") = None;
        let inner = self.inner.clone();
        tokio::spawn(async move { run::schedule(&inner).await });
        Ok(())
    }

    pub async fn models(&self) -> Result<Vec<ModelInfo>> {
        actions::models(&self.inner).await
    }

    pub fn validate_contract(&self, contract: &Contract) -> Vec<ContractIssue> {
        contract.validate()
    }

    // ---- projects -----------------------------------------------------------

    pub async fn add_project(&self, path: &str) -> Result<ProjectView> {
        let git = self.inner.git.clone();
        let p = PathBuf::from(path);
        let (root, branch) = tokio::task::spawn_blocking(move || -> Result<(PathBuf, String)> {
            let root = git.repo_root(&p).map_err(|_| invalid("这个文件夹不是 git 仓库"))?;
            let branch = git.current_branch(&root).unwrap_or_else(|_| "main".into());
            git.resolve(&root, &branch).map_err(|_| invalid("仓库还没有任何提交"))?;
            Ok((root, branch))
        })
        .await
        .map_err(|e| invalid(e.to_string()))??;
        let name = root.file_name().map(|n| n.to_string_lossy().into_owned()).unwrap_or_else(|| "project".into());
        let test_command = Git::detect_test_command(&root);
        let project = self.inner.store(|s| {
            s.add_project(NewProject { name, root: root.display().to_string(), base_branch: branch, test_command })
        })?;
        self.emit_projects();
        Ok(project)
    }

    pub fn update_project(&self, id: &str, base_branch: &str, test_command: Option<&str>) -> Result<ProjectView> {
        let p = self.inner.store(|s| s.update_project(id, base_branch, test_command.filter(|t| !t.trim().is_empty())))?;
        self.emit_projects();
        Ok(p)
    }

    pub fn remove_project(&self, id: &str) -> Result<()> {
        self.inner.store(|s| s.remove_project(id))?;
        self.emit_projects();
        Ok(())
    }

    fn emit_projects(&self) {
        if let Ok(projects) = self.projects() {
            self.inner.sink.emit(UiUpdate::Projects { projects });
        }
    }

    // ---- goals --------------------------------------------------------------

    pub async fn create_goal(&self, input: NewGoalInput) -> Result<GoalSummary> {
        let title = input.title.trim();
        if title.is_empty() {
            return Err(invalid("标题不能为空"));
        }
        let mut contract = input.contract;
        contract.version = 1;
        let rec = self.inner.store(|s| {
            s.create_goal(NewGoal { project_id: input.project_id.clone(), title: title.into(), contract })
        })?;
        if input.ratify {
            self.ratify(&rec.id).await?;
        }
        self.inner.emit_goal_now(&rec.id);
        self.inner.store(|s| s.summary(&rec.id))
    }

    /// The one-line quick path: intent in, ratified minimal contract out.
    pub async fn quick_goal(&self, project_id: &str, intent: &str) -> Result<GoalSummary> {
        let intent = intent.trim();
        if intent.is_empty() {
            return Err(invalid("写一句你想要的结果"));
        }
        let project = self.inner.store(|s| s.project(project_id))?;
        let settings = self.inner.settings();
        let mut contract = Contract::quick(intent, project.test_command.clone());
        contract.model = settings.default_model.clone();
        contract.thinking = settings.default_thinking.clone();
        let title: String = intent.chars().take(48).collect();
        self.create_goal(NewGoalInput { project_id: project_id.into(), title, contract, ratify: true }).await
    }

    pub fn update_draft(&self, id: &str, title: &str, contract: &Contract) -> Result<()> {
        self.inner.store(|s| s.update_draft(id, title, contract))?;
        self.inner.emit_goal_now(id);
        Ok(())
    }

    pub async fn ratify(&self, id: &str) -> Result<()> {
        let rec = self.inner.store(|s| s.goal(id))?;
        if rec.state != LifecycleState::Draft {
            return Err(invalid("只有草稿可以批准"));
        }
        let issues = rec.contract.validate();
        if let Some(ContractIssue::Error { message, .. }) =
            issues.iter().find(|i| matches!(i, ContractIssue::Error { .. }))
        {
            return Err(invalid(format!("合同还不能批准：{message}")));
        }
        self.inner.append(id, EventKind::ContractRatified { contract: rec.contract })?;
        self.inner.transition(id, Transition::Ratify, None, "")?;
        run::schedule(&self.inner).await;
        Ok(())
    }

    /// Amends a ratified contract (new version). Takes effect on the next run.
    pub fn amend_contract(&self, id: &str, mut contract: Contract) -> Result<()> {
        let rec = self.inner.store(|s| s.goal(id))?;
        if rec.state == LifecycleState::Draft {
            return self.update_draft(id, &rec.title, &contract);
        }
        if rec.state.is_terminal() {
            return Err(invalid("已结束的目标不能修订合同"));
        }
        if !contract.is_ratifiable() {
            return Err(invalid("修订后的合同有错误"));
        }
        contract.version = rec.contract.version + 1;
        self.inner.append(id, EventKind::ContractRatified { contract })?;
        self.inner.emit_goal_now(id);
        Ok(())
    }

    pub async fn pause(&self, id: &str) -> Result<()> {
        run::pause(&self.inner, id, PauseReason::Human, "你暂停了它").await
    }

    pub async fn resume(&self, id: &str) -> Result<()> {
        run::resume(&self.inner, id).await
    }

    pub async fn abandon(&self, id: &str) -> Result<()> {
        run::abandon(&self.inner, id).await
    }

    /// Sends a steering message to a running goal. Returns Pi's disposition
    /// (the delivery receipt).
    pub async fn steer(&self, id: &str, text: &str) -> Result<String> {
        run::steer(&self.inner, id, text).await
    }

    pub async fn answer(&self, inbox_id: &str, response: &str) -> Result<()> {
        actions::answer(&self.inner, inbox_id, response).await
    }

    pub async fn retry_verify(&self, id: &str) -> Result<()> {
        let rec = self.inner.store(|s| s.goal(id))?;
        if !matches!(rec.state, LifecycleState::InReview | LifecycleState::Paused | LifecycleState::Claimed) {
            return Err(invalid("现在不能重新验证"));
        }
        if self.inner.run_of(id).is_some() {
            return Err(invalid("Agent 正在运行，先暂停"));
        }
        self.inner.withdraw(id, &[InboxKind::Paused, InboxKind::ReviewReady], "重新验证");
        verify::spawn(self.inner.clone(), id.to_string());
        Ok(())
    }

    pub async fn request_changes(&self, id: &str, summary: &str, comments: Vec<ReviewComment>) -> Result<()> {
        actions::request_changes(&self.inner, id, summary, comments).await
    }

    pub async fn accept(&self, id: &str) -> Result<String> {
        actions::accept(&self.inner, id).await
    }

    pub fn archive(&self, id: &str) -> Result<()> {
        self.inner.transition(id, Transition::Archive, None, "")?;
        self.inner.withdraw(id, &[InboxKind::ReviewReady, InboxKind::Assumption, InboxKind::Paused], "已归档");
        Ok(())
    }

    pub async fn check_integration(&self) -> Result<()> {
        actions::check_integrations(&self.inner).await
    }

    pub fn human_check(&self, id: &str, criterion: &str, checked: bool) -> Result<()> {
        self.inner.append(id, EventKind::HumanCheck { criterion: criterion.into(), checked })?;
        self.inner.emit_goal_now(id);
        Ok(())
    }

    pub async fn review_claim(&self, id: &str, claim_id: &str, approved: bool, note: &str) -> Result<()> {
        actions::review_claim(&self.inner, id, claim_id, approved, note).await
    }
}

/// Copies the bundled extension into Tower's data directory, so runs never
/// load code from a location the agent or another tool might change.
fn install_extension(src: &Path, dst: &Path) -> std::io::Result<()> {
    std::fs::create_dir_all(dst)?;
    for name in ["index.ts", "policy.ts", "package.json"] {
        let from = src.join(name);
        if from.exists() {
            std::fs::copy(&from, dst.join(name))?;
        }
    }
    if !dst.join("index.ts").exists() {
        return Err(std::io::Error::new(
            std::io::ErrorKind::NotFound,
            format!("tower-goal extension not found in {}", src.display()),
        ));
    }
    Ok(())
}
