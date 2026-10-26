//! The state every part of the supervisor shares, and its write paths:
//! every change to a goal goes through here, so updates reach the interface.

use std::collections::{HashMap, HashSet};
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex, PoisonError};

use tower_core::lifecycle::Transition;
use tower_core::view::{InboxItem, InboxKind, ModelInfo, Settings, TraceEntry};
use tower_core::{EventKind, Lang, Mode, PauseReason};
use tower_git::Git;
use tower_store::{NewInboxItem, Store, StoreError};
use tower_verify::Cancel;

use crate::Result;
use crate::api::{ToastLevel, UiSink, UiUpdate};
use crate::paths::{self, Paths};
use crate::run::Run;
use crate::shell_env::ShellEnv;

pub(crate) struct Inner {
    pub paths: Paths,
    pub env: ShellEnv,
    pub git: Git,
    pub(crate) store: Mutex<Store>,
    pub sink: Arc<dyn UiSink>,
    pub runs: Mutex<HashMap<String, Arc<Run>>>,
    pub verifications: Mutex<HashMap<String, Cancel>>,
    pub(crate) dirty: Mutex<HashSet<String>>,
    /// Trace entries not yet sent to the interface.
    pub(crate) traces: Mutex<Vec<TraceEntry>>,
    pub(crate) models: Mutex<Option<(std::time::Instant, Vec<ModelInfo>)>>,
    /// `caffeinate` while any engine runs, so a sleeping Mac does not stall goals.
    pub(crate) keep_awake: Mutex<Option<std::process::Child>>,
    /// The phone page's server, when enabled.
    pub(crate) remote: crate::remote::Remote,
}

impl Inner {
    /// Runs `f` with the store locked. Never hold across an await.
    pub fn store<T>(&self, f: impl FnOnce(&mut Store) -> Result<T, StoreError>) -> Result<T> {
        let mut s = self.store.lock().unwrap_or_else(PoisonError::into_inner);
        Ok(f(&mut s)?)
    }

    pub fn append(&self, goal: &str, e: EventKind) -> Result<TraceEntry> {
        let entry = self.store(|s| s.append(goal, e))?;
        self.traces.lock().unwrap_or_else(PoisonError::into_inner).push(entry.clone());
        self.mark_dirty(goal);
        Ok(entry)
    }

    pub fn mark_dirty(&self, goal: &str) {
        self.dirty.lock().unwrap_or_else(PoisonError::into_inner).insert(goal.to_string());
    }

    pub fn emit_goal_now(&self, goal: &str) {
        self.dirty.lock().unwrap_or_else(PoisonError::into_inner).remove(goal);
        if let Ok(g) = self.store(|s| s.summary(goal)) {
            self.sink.emit(UiUpdate::Goal { goal: g });
        }
    }

    pub fn emit_projects(&self) {
        if let Ok(projects) = self.store(|s| s.projects()) {
            self.sink.emit(UiUpdate::Projects { projects });
        }
    }

    pub fn emit_inbox(&self) {
        if let Ok(items) = self.store(|s| s.open_inbox_items()) {
            self.sink.emit(UiUpdate::Inbox { items });
        }
    }

    /// A transient message about one goal.
    pub fn toast(&self, goal: &str, level: ToastLevel, text: impl Into<String>) {
        self.sink.emit(UiUpdate::Toast { level, text: text.into(), goal_id: Some(goal.into()) });
    }

    /// Sends pending trace entries in one update.
    pub(crate) fn flush_traces(&self) {
        let entries = std::mem::take(&mut *self.traces.lock().unwrap_or_else(PoisonError::into_inner));
        if !entries.is_empty() {
            self.sink.emit(UiUpdate::Traces { entries });
        }
    }

    pub(crate) fn flush_dirty(&self) {
        self.flush_traces();
        let ids: Vec<String> = self.dirty.lock().unwrap_or_else(PoisonError::into_inner).drain().collect();
        for id in ids {
            if let Ok(g) = self.store(|s| s.summary(&id)) {
                self.sink.emit(UiUpdate::Goal { goal: g });
            }
        }
    }

    /// Applies a lifecycle transition and pushes the result immediately.
    pub fn transition(&self, goal: &str, t: Transition, reason: Option<PauseReason>, note: &str) -> Result<()> {
        let entry = self.store(|s| s.transition(goal, t, reason, note))?;
        self.traces.lock().unwrap_or_else(PoisonError::into_inner).push(entry);
        self.flush_traces();
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

    /// The interface language, for text created now (inbox items, notes,
    /// toasts, errors). Stored text keeps the language it was written in.
    pub fn lang(&self) -> Lang {
        self.settings().lang()
    }

    /// The engine for a goal: the demo engine for demo projects, Pi otherwise.
    /// The engine a goal runs on: its contract's, else the settings default.
    pub fn engine_of(&self, goal: &tower_store::GoalRecord) -> String {
        let e = goal.contract.engine.trim();
        if e.is_empty() { self.settings().engine } else { e.to_string() }
    }

    /// The program to start for a goal: the demo engine for demo projects,
    /// the ACP bridge for Claude Code, Pi otherwise.
    pub fn engine_program(&self, goal: &tower_store::GoalRecord) -> Option<PathBuf> {
        if Path::new(&goal.project_root).starts_with(paths::real(&self.paths.demo_projects())) {
            let demo = self.paths.demo_engine();
            return demo.is_file().then_some(demo);
        }
        if self.engine_of(goal) == "claude-code" {
            let bridge = self.paths.extension_dir().join("acp.ts");
            return bridge.is_file().then_some(bridge);
        }
        self.pi_program()
    }

    /// How to start Claude Code's ACP adapter.
    pub fn claude_acp_command(&self) -> String {
        let configured = self.settings().claude_acp_command;
        if !configured.trim().is_empty() {
            return configured;
        }
        match self.env.which("claude-agent-acp") {
            Some(p) => p.display().to_string(),
            None => "npx -y @agentclientprotocol/claude-agent-acp@0.97.0".into(),
        }
    }

    pub fn pi_program(&self) -> Option<PathBuf> {
        let configured = self.settings().pi_path;
        if !configured.trim().is_empty() {
            return Some(PathBuf::from(configured.trim()));
        }
        self.env.which("pi")
    }

    /// Extensions every engine loads: tower-goal first, then the ones the
    /// user listed explicitly (`~` expanded).
    pub fn extensions(&self, settings: &Settings) -> Vec<PathBuf> {
        let home = self.env.get("HOME").map(PathBuf::from);
        let mut list = vec![self.paths.extension_dir().join("index.ts")];
        for raw in settings.extra_extensions.iter().map(|s| s.trim()).filter(|s| !s.is_empty()) {
            let path = match (raw.strip_prefix("~/"), &home) {
                (Some(rest), Some(h)) => h.join(rest),
                _ => PathBuf::from(raw),
            };
            list.push(path);
        }
        list
    }

    /// Keeps the Mac awake exactly while engines run (macOS `caffeinate`,
    /// tied to this process so it never outlives Tower).
    pub fn update_keep_awake(&self) {
        let running = self.running_count() > 0;
        let mut guard = self.keep_awake.lock().unwrap_or_else(PoisonError::into_inner);
        match (running, guard.is_some()) {
            (true, false) if cfg!(target_os = "macos") => {
                *guard = std::process::Command::new("/usr/bin/caffeinate")
                    .args(["-i", "-w", &std::process::id().to_string()])
                    .stdin(std::process::Stdio::null())
                    .stdout(std::process::Stdio::null())
                    .stderr(std::process::Stdio::null())
                    .spawn()
                    .ok();
            }
            (false, true) => {
                if let Some(mut c) = guard.take() {
                    let _ = c.kill();
                    let _ = c.wait();
                }
            }
            _ => {}
        }
    }

    pub fn running_count(&self) -> usize {
        self.runs.lock().unwrap_or_else(PoisonError::into_inner).len()
    }

    pub fn run_of(&self, goal: &str) -> Option<Arc<Run>> {
        self.runs.lock().unwrap_or_else(PoisonError::into_inner).get(goal).cloned()
    }
}

/// Updates the files each unfinished goal changes; when any list changed,
/// every unfinished goal of that project is re-sent (overlaps are mutual).
pub(crate) async fn refresh_touched(inner: &Arc<Inner>) -> Result<()> {
    let goals = inner.store(|s| s.unmerged_goals())?;
    let mut changed_projects = HashSet::new();
    for g in &goals {
        let (Some(ws), Some(base)) = (g.workspace.clone(), g.base_commit.clone()) else { continue };
        if !Path::new(&ws).is_dir() {
            continue;
        }
        let git = inner.git.clone();
        let files = match tokio::task::spawn_blocking(move || git.touched(Path::new(&ws), &base)).await {
            Ok(Ok(f)) => f,
            _ => continue,
        };
        if inner.store(|s| s.set_touched(&g.id, &files))? {
            changed_projects.insert(g.project_id.clone());
        }
    }
    for g in goals.iter().filter(|g| changed_projects.contains(&g.project_id)) {
        inner.mark_dirty(&g.id);
    }
    Ok(())
}
