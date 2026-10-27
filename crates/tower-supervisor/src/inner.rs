//! The state every part of the supervisor shares, and its write paths:
//! every change to a goal goes through here, so updates reach the interface.

use std::collections::{HashMap, HashSet};
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex, PoisonError};

use tower_core::lifecycle::Transition;
use tower_core::view::{InboxItem, InboxKind, ModelInfo, Settings, TraceEntry};
use tower_core::{EventKind, Lang, Mode, PauseReason, tr};
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
    /// Goals that asked for verification while one was still winding down
    /// (a quick rework can submit before the last one has cleaned up).
    pub verify_again: Mutex<HashSet<String>>,
    pub(crate) dirty: Mutex<HashSet<String>>,
    /// Trace entries not yet sent to the interface.
    pub(crate) traces: Mutex<Vec<TraceEntry>>,
    pub(crate) models: Mutex<Option<(std::time::Instant, Vec<ModelInfo>)>>,
    /// `caffeinate` while any engine runs, so a sleeping Mac does not stall goals.
    pub(crate) keep_awake: Mutex<Option<std::process::Child>>,
    /// Goals whose run is being started right now.
    pub(crate) starting: Mutex<HashSet<String>>,
    /// The phone page's server, when enabled.
    pub(crate) remote: crate::remote::Remote,
    /// When the current quiet period began (pushes waiting for a digest).
    pub(crate) quiet_since: Mutex<Option<tower_core::Millis>>,
    /// The outcome of the last push.
    pub(crate) push_status: Arc<Mutex<Option<tower_core::view::PushStatus>>>,
    /// The port and token the phone page was last started with.
    pub(crate) remote_applied: Mutex<Option<(u16, String)>>,
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
        if let Ok((items, snoozed)) = self.store(|s| Ok((s.open_inbox_items()?, s.snoozed_inbox_items()?))) {
            self.sink.emit(UiUpdate::Inbox { items, snoozed });
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
        self.push(&opened);
        Ok(opened)
    }

    /// Sends a push (ntfy) for an item that blocks a goal, when configured.
    /// Only Tower's own words leave the machine — the goal's id and title
    /// (yours) and a fixed sentence for the kind of item, never the agent's
    /// text — and the link opens the phone page without its token (a
    /// paired phone keeps it).
    fn push(&self, item: &InboxItem) {
        let s = self.settings();
        if item.kind == InboxKind::Assumption || (item.kind == InboxKind::ReviewReady && !s.push_ready) {
            return;
        }
        let url = s.push_url.trim().to_string();
        if url.is_empty() || crate::is_quiet(&s) || s.muted_goals.contains(&item.goal_id) {
            return;
        }
        let lang = s.lang();
        let title = format!("{} · {}", item.goal_id, item.goal_title);
        let body = push_sentence(item.kind, lang).to_string();
        let click = self.remote.host().and_then(|h| {
            let addr = if h == "0.0.0.0" { crate::remote::addresses(&self.env).into_iter().next()? } else { h };
            Some(format!("http://{addr}:{}/", s.remote_port))
        });
        let status = self.push_status.clone();
        std::thread::spawn(move || {
            let result = send_push(&url, &title, &body, click.as_deref(), lang);
            if let Err(e) = &result {
                tracing::warn!(error = %e, "push failed");
            }
            *status.lock().unwrap_or_else(PoisonError::into_inner) =
                Some(tower_core::view::PushStatus { at: tower_store::system_now(), error: result.err() });
        });
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
        if let Some(p) = self.env.which("claude-agent-acp") {
            return p.display().to_string();
        }
        // The copy Tower installed from its lockfile (`acp_adapter::ensure`
        // runs before every Claude Code run); never a download at run time.
        let installed = crate::acp_adapter::entry(&self.paths);
        let node = self.env.which("node").map_or_else(|| "node".to_string(), |n| n.display().to_string());
        // A shell command line (the bridge runs it with `sh -c`).
        let q = |s: &str| format!("'{}'", s.replace('\'', "'\\''"));
        format!("{} {}", q(&node), q(&installed.display().to_string()))
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

/// When a quiet period ends, one push says how many items waited in it
/// (each was held back while it was quiet).
pub(crate) fn quiet_digest(inner: &Inner, s: &Settings) {
    let quiet = crate::is_quiet(s);
    let mut since = inner.quiet_since.lock().unwrap_or_else(PoisonError::into_inner);
    match (*since, quiet) {
        (None, true) => *since = Some(tower_store::system_now()),
        (Some(start), false) => {
            *since = None;
            // The desk announces what waited (one notification if several).
            inner.emit_inbox();
            let url = s.push_url.trim().to_string();
            if url.is_empty() {
                return;
            }
            let waited = inner
                .store(|st| st.open_inbox_items())
                .unwrap_or_default()
                .into_iter()
                .filter(|i| i.created_at >= start && !matches!(i.kind, InboxKind::Assumption))
                .filter(|i| i.kind != InboxKind::ReviewReady || s.push_ready)
                .filter(|i| !s.muted_goals.contains(&i.goal_id))
                .count();
            if waited == 0 {
                return;
            }
            let lang = s.lang();
            let body =
                tr!(lang, "安静时段里有 {waited} 件事在等你", "{waited} item(s) waited for you while it was quiet");
            let status = inner.push_status.clone();
            std::thread::spawn(move || {
                let result = send_push(&url, "Tower", &body, None, lang);
                *status.lock().unwrap_or_else(PoisonError::into_inner) =
                    Some(tower_core::view::PushStatus { at: tower_store::system_now(), error: result.err() });
            });
        }
        _ => {}
    }
}

/// Minutes after local midnight, now.
pub(crate) fn local_minute() -> Option<u16> {
    let out = std::process::Command::new("/bin/date").arg("+%H %M").output().ok()?;
    let text = String::from_utf8_lossy(&out.stdout);
    let mut it = text.split_whitespace().map(|p| p.parse::<u16>().ok());
    Some(it.next()?? * 60 + it.next()??)
}

/// The fixed sentence a push carries for each kind of item.
fn push_sentence(kind: InboxKind, lang: Lang) -> &'static str {
    match kind {
        InboxKind::Question => lang.pick("Agent 有一个问题等你回答", "The agent has a question for you"),
        InboxKind::Approval => lang.pick("有一个操作等你批准", "An action is waiting for your approval"),
        InboxKind::Paused => lang.pick("目标已暂停，需要你决定", "The goal is paused and needs your decision"),
        InboxKind::Stalled => lang.pick("目标可能卡住了", "The goal may be stuck"),
        InboxKind::CiFailed => lang.pick("CI 没有通过", "CI failed"),
        InboxKind::ReviewReady => lang.pick("可以验收了", "Ready to accept"),
        InboxKind::Assumption => lang.pick("Agent 做了一个假设", "The agent made an assumption"),
    }
}

/// Whether pushes may go to `url`: https, or plain http only to this Mac
/// or a Tailscale address (encrypted underneath).
pub(crate) fn push_url_allowed(url: &str) -> bool {
    if url.starts_with("https://") {
        return true;
    }
    let Some(rest) = url.strip_prefix("http://") else { return false };
    let host = rest.split(['/', '?', '#']).next().unwrap_or_default();
    let host = host.rsplit_once(':').map_or(host, |(h, _)| h);
    host == "localhost"
        || host.starts_with("127.")
        || host.ends_with(".ts.net")
        || host.parse::<std::net::Ipv4Addr>().is_ok_and(|ip| {
            let [a, b, ..] = ip.octets();
            a == 100 && (64..128).contains(&b)
        })
}

/// One push: the text goes to curl on standard input and the headers lose
/// any line breaks, so nothing in them can become an option, a file
/// reference or another header.
pub(crate) fn send_push(url: &str, title: &str, body: &str, click: Option<&str>, lang: Lang) -> Result<(), String> {
    use std::io::Write;
    if !push_url_allowed(url) {
        return Err(tr!(
            lang,
            "推送地址必须是 https（或本机、Tailscale 上的 http）",
            "The push address must use https (or http on this Mac or Tailscale)"
        ));
    }
    let clean = |s: &str| s.chars().filter(|c| !c.is_control()).take(160).collect::<String>();
    let mut cmd = std::process::Command::new("/usr/bin/curl");
    cmd.args(["-sS", "-m", "10", "-o", "/dev/null", "-w", "%{http_code}", "--proto", "=https,http"])
        .arg("-H")
        .arg(format!("Title: {}", clean(title)))
        .args(["-H", "Tags: tower"]);
    if let Some(click) = click {
        cmd.arg("-H").arg(format!("Click: {}", clean(click)));
    }
    cmd.args(["--data-binary", "@-", "--"])
        .arg(url)
        .stdin(std::process::Stdio::piped())
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::piped());
    let mut child = cmd.spawn().map_err(|e| e.to_string())?;
    if let Some(mut stdin) = child.stdin.take() {
        let _ = stdin.write_all(body.as_bytes());
    }
    let out = child.wait_with_output().map_err(|e| e.to_string())?;
    let code = String::from_utf8_lossy(&out.stdout).trim().to_string();
    if out.status.success() && code.starts_with('2') {
        Ok(())
    } else if !out.status.success() {
        Err(String::from_utf8_lossy(&out.stderr).trim().chars().take(200).collect())
    } else {
        Err(tr!(lang, "推送服务返回 {code}", "The push service answered {code}"))
    }
}

#[cfg(test)]
mod push_tests {
    use super::*;

    #[test]
    fn pushes_go_only_to_encrypted_or_private_addresses() {
        assert!(push_url_allowed("https://ntfy.sh/topic"));
        assert!(push_url_allowed("http://localhost:8080/t"));
        assert!(push_url_allowed("http://100.101.1.2/t"));
        assert!(push_url_allowed("http://box.tail1234.ts.net/t"));
        assert!(!push_url_allowed("http://ntfy.sh/topic"));
        assert!(!push_url_allowed("http://100.200.1.2/t"));
        assert!(!push_url_allowed("file:///etc/passwd"));
    }
}
