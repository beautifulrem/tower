//! The supervisor: Tower's single writer (`docs/06` §6.2).
//!
//! It owns the store, the goal engines and the verifier, and is the only
//! place lifecycle transitions are applied. The UI talks to it through the
//! async methods on [`Supervisor`] and receives [`UiUpdate`]s through a
//! [`UiSink`].

mod actions;
pub mod api;
mod caches;
mod control;
mod demo;
mod edits;
mod environment;
mod inner;
mod jail;
pub mod paths;
mod pr;
mod project_check;
pub mod prompts;
mod run;
pub mod sandbox;
pub mod shell_env;
mod summarize;
mod verify;

use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex, PoisonError};
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
use tower_core::{EventKind, Lang, LifecycleState, Mode, PauseReason, tr};
use tower_git::{Git, GitError};
use tower_pi::EngineError;
use tower_store::{NewGoal, NewProject, ProjectPatch, Store, StoreError};

pub use api::{NewGoalInput, NullSink, OpenTarget, ReviewComment, ToastLevel, UiSink, UiUpdate};
pub(crate) use inner::Inner;
pub use paths::Paths;
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
    /// The demo engine script (`tools/demo-engine/demo_pi.py`) to install,
    /// enabling the in-app demo. `None` disables it.
    pub demo_engine: Option<PathBuf>,
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

impl Supervisor {
    /// Opens the store, installs the extension, recovers goals interrupted
    /// by the last exit and starts the background loops.
    pub async fn start(config: Config, sink: Arc<dyn UiSink>) -> Result<Self> {
        config.paths.ensure()?;
        install_extension(&config.extension_source, &config.paths.extension_dir())?;
        if let Some(src) = config.demo_engine.as_deref().filter(|p| p.is_file()) {
            install_demo_engine(src, &config.paths.demo_engine())?;
        }
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
            traces: Mutex::default(),
            models: Mutex::default(),
            keep_awake: Mutex::default(),
        });
        let sup = Self { inner };
        sup.spawn_loops();
        sweep(&sup.inner.paths);
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
        // Overlap radar: which files each unfinished goal changes, so goals
        // of one project that touch the same files can say so early.
        let weak = Arc::downgrade(&self.inner);
        tokio::spawn(async move {
            let mut tick = tokio::time::interval(Duration::from_secs(15));
            loop {
                tick.tick().await;
                let Some(inner) = weak.upgrade() else { break };
                if let Err(e) = inner::refresh_touched(&inner).await {
                    tracing::warn!(error = %e, "overlap radar failed");
                }
            }
        });
        // Integration watcher: accepted goals whose branch reached the base.
        let weak = Arc::downgrade(&self.inner);
        tokio::spawn(async move {
            let mut tick = tokio::time::interval(Duration::from_secs(60));
            loop {
                tick.tick().await;
                let Some(inner) = weak.upgrade() else { break };
                // Snoozed items whose time came show up again.
                inner.emit_inbox();
                if let Err(e) = pr::check_integrations(&inner).await {
                    tracing::warn!(error = %e, "integration check failed");
                }
            }
        });
    }

    /// Brings goals left mid-flight by the previous exit back to a defined
    /// state (`docs/06` §6.1.6).
    async fn recover(&self) {
        let inner = &self.inner;
        let running = inner.store(|s| s.goals_in_state(LifecycleState::Running)).unwrap_or_default();
        let lang = inner.lang();
        for g in running {
            // The process that ran it is gone (crash or forced quit): close the run.
            let _ = inner.append(&g.id, EventKind::RunEnded { run_no: g.run_no, outcome: "interrupted".into() });
            inner.withdraw(
                &g.id,
                &[InboxKind::Question, InboxKind::Approval],
                &tr!(lang, "Tower 重新启动", "Tower restarted"),
            );
            let _ = inner.set_mode(&g.id, Mode::Idle);
            let note = tr!(lang, "上次退出时仍在运行", "Still running when Tower last quit");
            let _ = inner.transition(&g.id, Transition::Pause { reason: PauseReason::AppQuit }, None, &note);
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
            let r = run::resume(inner, &g.id).await;
            run::report(inner, &g.id, r).await;
        }
        run::schedule(inner).await;
    }

    /// Pauses every running goal so it resumes on next launch (`ADR-017`).
    pub async fn shutdown(&self) {
        let runs: Vec<String> =
            self.inner.runs.lock().unwrap_or_else(PoisonError::into_inner).keys().cloned().collect();
        let note = tr!(self.inner.lang(), "Tower 退出", "Tower quit");
        for id in runs {
            let _ = run::pause(&self.inner, &id, PauseReason::AppQuit, &note).await;
        }
        for (_, c) in self.inner.verifications.lock().unwrap_or_else(PoisonError::into_inner).drain() {
            c.cancel();
        }
    }

    // ---- reads --------------------------------------------------------------

    pub fn environment(&self) -> EnvironmentStatus {
        environment::status(&self.inner)
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
        let mut detail = self.inner.store(|s| s.detail(id))?;
        detail.branch_preview = actions::branch_name(&self.inner.store(|s| s.goal(id))?);
        Ok(detail)
    }

    pub fn mark_viewed(&self, id: &str) -> Result<()> {
        self.inner.store(|s| s.mark_viewed(id))?;
        self.inner.emit_goal_now(id);
        Ok(())
    }

    /// One file of a goal as it was on the base commit (`old`) or is in the
    /// reviewed snapshot, for expanding context around a hunk. Large files
    /// are refused.
    pub async fn file_text(&self, id: &str, path: &str, old: bool, pin: Option<String>) -> Result<Option<String>> {
        let rec = self.inner.store(|s| s.goal(id))?;
        let lang = self.inner.lang();
        let (Some(ws), Some(base)) = (rec.workspace.clone(), rec.base_commit.clone()) else {
            return Err(invalid(tr!(lang, "这个目标还没有工作区", "This goal has no workspace yet")));
        };
        let rev = if old { base } else { pin.or(rec.pin).ok_or_else(|| invalid("no snapshot"))? };
        let git = self.inner.git.clone();
        let path = path.to_string();
        let text = tokio::task::spawn_blocking(move || git.file_at(Path::new(&ws), &rev, &path))
            .await
            .map_err(|e| invalid(e.to_string()))?;
        if text.as_ref().is_some_and(|t| t.len() > 2 * 1024 * 1024) {
            return Err(invalid(tr!(lang, "文件太大，无法展开", "The file is too large to expand")));
        }
        Ok(text)
    }

    /// The interface's per-goal state (viewed files, draft comments, last
    /// reviewed snapshot), as stored JSON strings by key.
    pub fn ui_state(&self, id: &str) -> Result<std::collections::BTreeMap<String, String>> {
        self.inner.store(|s| s.ui_state(id))
    }

    pub fn set_ui_state(&self, id: &str, key: &str, value: Option<&str>) -> Result<()> {
        self.inner.store(|s| s.set_ui_state(id, key, value))
    }

    pub fn trace(&self, id: &str, before: Option<i64>, limit: u32) -> Result<Vec<TraceEntry>> {
        self.inner.store(|s| s.trace(id, before, limit.min(500)))
    }

    pub fn inbox(&self) -> Result<Vec<InboxItem>> {
        self.inner.store(|s| s.open_inbox_items())
    }

    /// The diff for review: from the base, or from `since` (an earlier pin)
    /// to show only what changed since the human last reviewed.
    pub async fn review(&self, id: &str, since: Option<String>) -> Result<ReviewView> {
        let rec = self.inner.store(|s| s.goal(id))?;
        let (Some(ws), Some(base)) = (rec.workspace.clone(), rec.base_commit.clone()) else {
            return Err(invalid(tr!(self.inner.lang(), "这个目标还没有工作区", "This goal has no workspace yet")));
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
        let files_and_from = tokio::task::spawn_blocking(move || -> Result<_> {
            let ws = Path::new(&ws);
            // An earlier pin only counts if it still exists in the workspace.
            let from = since.filter(|s| git.resolve(ws, s).is_ok()).unwrap_or(base2);
            Ok((git.diff(ws, &from, &pin2)?, from))
        })
        .await
        .map_err(|e| invalid(e.to_string()))??;
        let (files, from) = files_and_from;
        let stat = tower_core::view::DiffStat {
            files: files.len() as u32,
            additions: files.iter().map(|f| f.additions).sum(),
            deletions: files.iter().map(|f| f.deletions).sum(),
        };
        let units = build_units(&files, Some(&rec.contract.scope), self.inner.lang());
        Ok(ReviewView { goal_id: id.into(), base_commit: base, from, pin, stat, units, files })
    }

    pub fn settings(&self) -> Settings {
        self.inner.settings()
    }

    /// The interface language from the settings.
    pub fn lang(&self) -> Lang {
        self.inner.lang()
    }

    /// Saves settings. A language change applies to everything created from
    /// now on and to everything derived on read; the shell rebuilds its menu.
    pub fn save_settings(&self, settings: Settings) -> Result<()> {
        // Errors speak the language being chosen, so switching reads right.
        let lang = settings.lang();
        if settings.max_concurrent == 0 || settings.max_concurrent > 10 {
            return Err(invalid(tr!(lang, "并发上限必须在 1 到 10 之间", "Concurrent goals must be between 1 and 10")));
        }
        for ext in self.inner.extensions(&settings).iter().skip(1) {
            if !ext.is_file() {
                let path = ext.display();
                return Err(invalid(tr!(lang, "找不到扩展文件：{path}", "Extension file not found: {path}")));
            }
        }
        self.inner.store(|s| s.save_settings(&settings))?;
        *self.inner.models.lock().unwrap_or_else(PoisonError::into_inner) = None;
        let inner = self.inner.clone();
        tokio::spawn(async move { run::schedule(&inner).await });
        Ok(())
    }

    pub async fn models(&self) -> Result<Vec<ModelInfo>> {
        actions::models(&self.inner).await
    }

    pub fn validate_contract(&self, contract: &Contract) -> Vec<ContractIssue> {
        contract.validate(self.inner.lang())
    }

    // ---- projects -----------------------------------------------------------

    /// Starts the in-app demo: creates the demo repository (once), adds it
    /// as a project and starts one goal on the demo engine. Returns the goal.
    pub async fn start_demo(&self) -> Result<GoalSummary> {
        let lang = self.inner.lang();
        if !self.inner.paths.demo_engine().is_file() {
            return Err(invalid(tr!(lang, "这个版本没有附带演示引擎", "This build does not include the demo engine")));
        }
        if self.inner.env.which("node").is_none() {
            return Err(invalid(tr!(
                lang,
                "演示项目的测试需要 Node.js，请先安装 Node",
                "The demo project's tests need Node.js; install Node first"
            )));
        }
        if !environment::usable(&self.inner, "python3") {
            return Err(invalid(tr!(
                lang,
                "演示引擎需要 python3（安装 Xcode 命令行工具即可：xcode-select --install）",
                "The demo engine needs python3 (install the Xcode command line tools: xcode-select --install)"
            )));
        }
        let dir = self.inner.paths.demo_projects().join("shop");
        let inner = self.inner.clone();
        let d = dir.clone();
        tokio::task::spawn_blocking(move || demo::ensure_repo(&inner, &d))
            .await
            .map_err(|e| invalid(e.to_string()))??;
        let root = paths::real(&dir).display().to_string();
        let project = match self.inner.store(|s| s.project_by_root(&root))? {
            Some(p) => p,
            None => {
                let p = self.add_project(&root).await?;
                project_check::spawn(self.inner.clone(), p.id.clone());
                p
            }
        };
        let (title, contract) = demo::goal(lang);
        self.create_goal(NewGoalInput { project_id: project.id, title, contract, ratify: true }).await
    }

    pub async fn add_project(&self, path: &str) -> Result<ProjectView> {
        let git = self.inner.git.clone();
        let p = PathBuf::from(path);
        let lang = self.inner.lang();
        let (root, branch) = tokio::task::spawn_blocking(move || -> Result<(PathBuf, String)> {
            let root = git
                .repo_root(&p)
                .map_err(|_| invalid(tr!(lang, "这个文件夹不是 git 仓库", "This folder is not a git repository")))?;
            let branch = git.current_branch(&root).unwrap_or_else(|_| "main".into());
            git.resolve(&root, &branch)
                .map_err(|_| invalid(tr!(lang, "仓库还没有任何提交", "The repository has no commits yet")))?;
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
        // The base check runs your setup with the network, so it waits for
        // you to ask for it (check_project); the demo asks for itself.
        Ok(project)
    }

    /// Runs the project's test command on its base branch again.
    pub fn check_project(&self, id: &str) -> Result<()> {
        self.inner.store(|s| s.project(id))?;
        project_check::spawn(self.inner.clone(), id.to_string());
        Ok(())
    }

    pub fn update_project(&self, id: &str, patch: &ProjectPatch) -> Result<ProjectView> {
        let lang = self.inner.lang();
        if patch.base_branch.trim().is_empty() {
            return Err(invalid(tr!(lang, "基线分支不能为空", "The base branch cannot be empty")));
        }
        for p in &patch.local_files {
            globset::Glob::new(p).map_err(|e| {
                invalid(tr!(lang, "无效的本地文件模式 {p}：{e}", "Invalid local file pattern {p}: {e}"))
            })?;
        }
        let p = self.inner.store(|s| s.update_project(id, patch))?;
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
            return Err(invalid(tr!(self.inner.lang(), "标题不能为空", "The title cannot be empty")));
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
        let settings = self.inner.settings();
        if intent.is_empty() {
            return Err(invalid(tr!(
                settings.lang(),
                "写一句你想要的结果",
                "Write one sentence about the result you want"
            )));
        }
        let project = self.inner.store(|s| s.project(project_id))?;
        let mut contract = Contract::quick(intent, project.test_command.clone(), settings.lang());
        contract.model = settings.default_model.clone();
        contract.thinking = settings.default_thinking.clone();
        let title = tower_core::text::title_from_intent(intent);
        self.create_goal(NewGoalInput { project_id: project_id.into(), title, contract, ratify: true }).await
    }

    pub fn update_draft(&self, id: &str, title: &str, contract: &Contract) -> Result<()> {
        self.inner.store(|s| s.update_draft(id, title, contract))?;
        self.inner.emit_goal_now(id);
        Ok(())
    }

    pub async fn ratify(&self, id: &str) -> Result<()> {
        let rec = self.inner.store(|s| s.goal(id))?;
        let lang = self.inner.lang();
        if rec.state != LifecycleState::Draft {
            return Err(invalid(tr!(lang, "只有草稿可以批准", "Only a draft can be ratified")));
        }
        let issues = rec.contract.validate(lang);
        if let Some(ContractIssue::Error { message, .. }) =
            issues.iter().find(|i| matches!(i, ContractIssue::Error { .. }))
        {
            return Err(invalid(tr!(
                lang,
                "合同还不能批准：{message}",
                "The contract cannot be ratified yet: {message}"
            )));
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
        let lang = self.inner.lang();
        if rec.state.is_terminal() {
            return Err(invalid(tr!(lang, "已结束的目标不能修订合同", "An ended goal's contract cannot be amended")));
        }
        if !contract.is_ratifiable() {
            return Err(invalid(tr!(lang, "修订后的合同有错误", "The amended contract has errors")));
        }
        contract.version = rec.contract.version + 1;
        self.inner.append(id, EventKind::ContractRatified { contract })?;
        self.inner.emit_goal_now(id);
        Ok(())
    }

    pub async fn pause(&self, id: &str) -> Result<()> {
        let note = tr!(self.inner.lang(), "你暂停了它", "You paused it");
        run::pause(&self.inner, id, PauseReason::Human, &note).await
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

    /// Puts the workspace back to where run `run_no` started.
    pub async fn rollback(&self, id: &str, run_no: u32) -> Result<()> {
        edits::rollback(&self.inner, id, run_no).await
    }

    /// Undoes the latest rollback.
    pub async fn undo_rollback(&self, id: &str) -> Result<()> {
        edits::undo_rollback(&self.inner, id).await
    }

    /// Writes one workspace file with the human's text (an edit in review).
    pub async fn write_file(&self, id: &str, path: &str, text: &str) -> Result<()> {
        edits::write_file(&self.inner, id, path, text).await
    }

    /// Undoes one hunk (0-based, as in the review's base → snapshot diff).
    pub async fn revert_hunk(&self, id: &str, path: &str, hunk: usize) -> Result<()> {
        edits::revert_hunk(&self.inner, id, path, hunk).await
    }

    /// "Remind me later": hides a Needs-You item until `until` (ms since
    /// the epoch); it comes back, and notifies again, then.
    pub fn snooze(&self, inbox_id: &str, until: Option<i64>) -> Result<()> {
        self.inner.store(|s| s.snooze_inbox(inbox_id, until))?;
        self.inner.emit_inbox();
        Ok(())
    }

    pub async fn answer_assumption(&self, inbox_id: &str, approved: bool, note: &str) -> Result<()> {
        actions::answer_assumption(&self.inner, inbox_id, approved, note).await
    }

    pub async fn retry_verify(&self, id: &str) -> Result<()> {
        let rec = self.inner.store(|s| s.goal(id))?;
        let lang = self.inner.lang();
        if !matches!(rec.state, LifecycleState::InReview | LifecycleState::Paused | LifecycleState::Claimed) {
            return Err(invalid(tr!(lang, "现在不能重新验证", "This goal cannot be verified again right now")));
        }
        if self.inner.run_of(id).is_some() {
            return Err(invalid(tr!(lang, "Agent 正在运行，先暂停", "The agent is running; pause it first")));
        }
        self.inner.withdraw(
            id,
            &[InboxKind::Paused, InboxKind::ReviewReady],
            &tr!(lang, "重新验证", "Verifying again"),
        );
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
        let reason = tr!(self.inner.lang(), "已归档", "Archived");
        self.inner.withdraw(id, &[InboxKind::ReviewReady, InboxKind::Assumption, InboxKind::Paused], &reason);
        Ok(())
    }

    pub async fn check_integration(&self) -> Result<()> {
        pr::check_integrations(&self.inner).await
    }

    /// Deletes an ended goal's workspace, verification checkout and scratch
    /// directories. The event log, trace and Pi session stay; nothing in the
    /// user's repository is touched.
    pub async fn remove_workspace(&self, id: &str) -> Result<()> {
        let rec = self.inner.store(|s| s.goal(id))?;
        if !rec.state.is_terminal() {
            return Err(invalid(tr!(
                self.inner.lang(),
                "只有已归档或已放弃的目标可以删除工作区",
                "Only an archived or abandoned goal's workspace can be removed"
            )));
        }
        let paths = self.inner.paths.clone();
        let goal = id.to_string();
        tokio::task::spawn_blocking(move || -> std::io::Result<()> {
            for dir in
                [paths.workspace(&goal), paths.verify(&goal), paths.tmp(&goal), paths.tmp(&format!("{goal}-verify"))]
            {
                if dir.exists() {
                    std::fs::remove_dir_all(&dir)?;
                }
            }
            Ok(())
        })
        .await
        .map_err(|e| invalid(e.to_string()))??;
        if rec.workspace.is_some() {
            self.inner.append(id, EventKind::WorkspaceRemoved)?;
        }
        self.inner.emit_goal_now(id);
        Ok(())
    }

    /// Pushes an accepted goal's branch to `origin`, optionally opening a pull
    /// request with the GitHub CLI. Returns the PR URL when one was opened.
    pub async fn push(&self, id: &str, open_pr: bool) -> Result<Option<String>> {
        pr::push(&self.inner, id, open_pr).await
    }

    /// Opens a goal's workspace in the user's editor, a terminal, or Finder.
    /// Editing while the goal is paused is the "I'll fix it" path: the next resume
    /// tells the agent which files the human changed.
    pub fn open_workspace(&self, id: &str, target: OpenTarget) -> Result<()> {
        let rec = self.inner.store(|s| s.goal(id))?;
        let ws = rec.workspace.ok_or_else(|| self.no_workspace())?;
        let (program, args): (PathBuf, Vec<String>) = match target {
            OpenTarget::Finder => (PathBuf::from("/usr/bin/open"), vec![ws.clone()]),
            OpenTarget::Terminal => (PathBuf::from("/usr/bin/open"), vec!["-a".into(), "Terminal".into(), ws.clone()]),
            OpenTarget::Editor => {
                let configured = self.inner.settings().editor;
                let candidates: Vec<String> = if configured.trim().is_empty() {
                    ["cursor", "code", "zed", "subl"].iter().map(|s| s.to_string()).collect()
                } else {
                    vec![configured.trim().to_string()]
                };
                match candidates.iter().find_map(|c| self.inner.env.which(c)) {
                    Some(p) => (p, vec![ws.clone()]),
                    None => (PathBuf::from("/usr/bin/open"), vec!["-t".into(), ws.clone()]),
                }
            }
        };
        std::process::Command::new(program)
            .args(args)
            .env_clear()
            .envs(self.inner.env.pairs())
            .stdin(std::process::Stdio::null())
            .stdout(std::process::Stdio::null())
            .stderr(std::process::Stdio::null())
            .spawn()?;
        Ok(())
    }

    /// Opens one file of a goal's workspace in the editor, at a line when the
    /// editor supports it (`code`/`cursor -g file:line`, `zed file:line`).
    pub fn open_file(&self, id: &str, path: &str, line: Option<u32>) -> Result<()> {
        let rec = self.inner.store(|s| s.goal(id))?;
        let ws = PathBuf::from(rec.workspace.ok_or_else(|| self.no_workspace())?);
        let file = ws.join(path);
        if !paths::real(&file).starts_with(paths::real(&ws)) {
            return Err(invalid(tr!(self.inner.lang(), "路径不在工作区内", "The path is outside the workspace")));
        }
        let configured = self.inner.settings().editor;
        let candidates: Vec<String> = if configured.trim().is_empty() {
            ["cursor", "code", "zed", "subl"].iter().map(|s| s.to_string()).collect()
        } else {
            vec![configured.trim().to_string()]
        };
        let target = match line {
            Some(l) => format!("{}:{l}", file.display()),
            None => file.display().to_string(),
        };
        let (program, args): (PathBuf, Vec<String>) = match candidates.iter().find_map(|c| self.inner.env.which(c)) {
            Some(p) => {
                let name = p.file_name().map(|n| n.to_string_lossy().into_owned()).unwrap_or_default();
                if matches!(name.as_str(), "code" | "cursor" | "codium") {
                    (p, vec![ws.display().to_string(), "-g".into(), target])
                } else {
                    (p, vec![target])
                }
            }
            None => (PathBuf::from("/usr/bin/open"), vec!["-t".into(), file.display().to_string()]),
        };
        std::process::Command::new(program)
            .args(args)
            .env_clear()
            .envs(self.inner.env.pairs())
            .stdin(std::process::Stdio::null())
            .stdout(std::process::Stdio::null())
            .stderr(std::process::Stdio::null())
            .spawn()?;
        Ok(())
    }

    pub fn human_check(&self, id: &str, criterion: &str, checked: bool) -> Result<()> {
        self.inner.append(id, EventKind::HumanCheck { criterion: criterion.into(), checked })?;
        self.inner.emit_goal_now(id);
        Ok(())
    }

    pub async fn review_claim(&self, id: &str, claim_id: &str, approved: bool, note: &str) -> Result<()> {
        actions::review_claim(&self.inner, id, claim_id, approved, note).await
    }

    fn no_workspace(&self) -> Error {
        invalid(tr!(self.inner.lang(), "这个目标还没有工作区", "This goal has no workspace yet"))
    }
}

/// Removes what an interrupted verification or check left behind (Tower
/// quit or crashed mid-way). Nothing runs yet at this point.
fn sweep(paths: &Paths) {
    for dir in ["verify", "verify-cache", "checks"] {
        let _ = std::fs::remove_dir_all(paths.root.join(dir));
    }
    if let Ok(entries) = std::fs::read_dir(paths.root.join("tmp")) {
        for e in entries.flatten() {
            let name = e.file_name().to_string_lossy().into_owned();
            if name.ends_with("-verify") || name.ends_with("-base") || name.ends_with("-orig") {
                let _ = std::fs::remove_dir_all(e.path());
            }
        }
    }
}

fn install_demo_engine(src: &Path, dst: &Path) -> std::io::Result<()> {
    use std::os::unix::fs::PermissionsExt;
    std::fs::create_dir_all(dst.parent().unwrap_or(Path::new("/")))?;
    std::fs::copy(src, dst)?;
    std::fs::set_permissions(dst, std::fs::Permissions::from_mode(0o755))
}

/// Copies the bundled extension into Tower's data directory, so runs never
/// load code from a location the agent or another tool might change.
fn install_extension(src: &Path, dst: &Path) -> std::io::Result<()> {
    use std::os::unix::fs::PermissionsExt;
    std::fs::create_dir_all(dst)?;
    for name in ["index.ts", "policy.ts", "sandboxfs.ts", "acp.ts", "package.json"] {
        let from = src.join(name);
        if from.exists() {
            std::fs::copy(&from, dst.join(name))?;
        }
    }
    // The ACP bridge is started directly (`#!/usr/bin/env node`).
    if dst.join("acp.ts").exists() {
        std::fs::set_permissions(dst.join("acp.ts"), std::fs::Permissions::from_mode(0o755))?;
    }
    if !dst.join("index.ts").exists() {
        return Err(std::io::Error::new(
            std::io::ErrorKind::NotFound,
            format!("tower-goal extension not found in {}", src.display()),
        ));
    }
    Ok(())
}
