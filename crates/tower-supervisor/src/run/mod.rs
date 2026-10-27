//! Engine runs: starting, observing, steering and stopping one goal's Pi.

use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex, PoisonError};
use std::time::{Duration, Instant};

use serde_json::Value;
use tower_core::i18n::Choice;
use tower_core::lifecycle::Transition;
use tower_core::view::InboxKind;
use tower_core::{EventKind, LifecycleState, Mode, PauseReason, tr};
use tower_pi::{Engine, EngineConfig};
use tower_store::NewInboxItem;

use crate::paths::real;
use crate::{Inner, Result, invalid, prompts};

pub(crate) use crate::control::{
    abandon, answer_dialog, pause, pause_after_stop, paused_item, repin, report, resume, steer,
};
pub(crate) use crate::jail::{agent_jail, verifier_jail};

/// The same failing call this many times in one run raises a stall (S1).
const REPEATED_FAILURES: u32 = 4;

/// Why Tower itself is stopping a run, so the exit is not mistaken for a crash.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Stop {
    Pause(PauseReason),
    Submitted,
    Abandon,
}

#[derive(Debug)]
struct ToolCall {
    args: Value,
    started: Instant,
}

#[derive(Debug, Default)]
pub struct Flags {
    pub stopping: Option<Stop>,
    /// Failing tool calls by signature, for the repeated-failure detector.
    failures: HashMap<String, u32>,
    /// Stall detectors already reported in this run (once each).
    stalls_reported: std::collections::HashSet<String>,
    last_activity: Option<Instant>,
    submitted: bool,
    nudged: bool,
    /// A budget pause is already on its way (checked at message and turn end).
    over_budget: bool,
    last_error: Option<String>,
    tools: HashMap<String, ToolCall>,
    stream: String,
    last_stream: Option<Instant>,
    /// Engine dialog id -> (inbox id, dialog method).
    pub dialogs: HashMap<String, (String, String)>,
}

#[derive(Debug)]
pub struct Run {
    pub goal_id: String,
    pub run_no: u32,
    pub started: Instant,
    pub engine: Engine,
    pub workspace: String,
    pub flags: Mutex<Flags>,
}

impl Run {
    pub fn flags(&self) -> std::sync::MutexGuard<'_, Flags> {
        self.flags.lock().unwrap_or_else(PoisonError::into_inner)
    }
}

/// Starts ready goals while slots are free, oldest first.
pub async fn schedule(inner: &Arc<Inner>) {
    let max = inner.settings().max_concurrent as usize;
    let ready = inner.store(|s| s.goals_in_state(LifecycleState::Ready)).unwrap_or_default();
    for g in ready {
        if inner.running_count() >= max {
            break;
        }
        let (purpose, message) = if g.run_no == 0 {
            ("initial", prompts::initial(&g.title, &agent_contract(inner, &g)))
        } else {
            ("resume", prompts::resume("waiting for a free slot", &human_notes_since_last_run(inner, &g.id), &[]))
        };
        // Re-read: the goal may have been paused or abandoned since the list
        // was taken, and the scheduler must never start what a human stopped.
        let still_ready = inner.store(|s| s.goal(&g.id)).is_ok_and(|now| now.state == LifecycleState::Ready);
        if !still_ready {
            continue;
        }
        if let Err(e) = start_scheduled(inner, &g.id, purpose, message).await {
            tracing::warn!(goal = %g.id, error = %e, "could not start run");
        }
    }
}

/// Human steering recorded while no engine was running, to carry into the
/// next run's first message.
pub(crate) fn human_notes_since_last_run(inner: &Inner, goal: &str) -> Vec<String> {
    let since = inner.store(|s| s.last_event(goal, "run_started")).ok().flatten().map(|e| e.at).unwrap_or(0);
    inner
        .store(|s| s.events_since(goal, since))
        .unwrap_or_default()
        .into_iter()
        .filter_map(|e| match e.event {
            EventKind::Steered { text } => Some(text),
            _ => None,
        })
        .collect()
}

/// The contract as the agent sees it: without the criteria that run
/// held-out tests (their commands would say where the tests live).
pub(crate) fn agent_contract(inner: &Inner, goal: &tower_store::GoalRecord) -> tower_core::Contract {
    let holdout = inner.store(|s| s.project(&goal.project_id)).map(|p| p.holdout_files).unwrap_or_default();
    let mut c = goal.contract.clone();
    c.criteria.retain(|cr| match &cr.kind {
        tower_core::CriterionKind::Exec { command, .. } => !crate::verify::names_held_out(&holdout, command),
        _ => true,
    });
    c
}

fn engine_config(inner: &Inner, goal: &tower_store::GoalRecord, ws: &Path) -> Result<EngineConfig> {
    let program = inner.engine_program(goal).ok_or_else(|| {
        invalid(tr!(inner.lang(), "没有找到 pi，请在设置中指定路径", "Pi was not found; set its path in Settings"))
    })?;
    let settings = inner.settings();
    let goal_dir = inner.paths.goal_dir(&goal.id);
    let tmp = inner.paths.tmp(&goal.id);
    std::fs::create_dir_all(&goal_dir)?;
    std::fs::create_dir_all(&tmp)?;
    std::fs::create_dir_all(inner.paths.sessions(&goal.id))?;
    let contract_path = goal_dir.join("contract.json");
    let visible = agent_contract(inner, goal);
    std::fs::write(&contract_path, serde_json::to_vec_pretty(&visible).map_err(|e| invalid(e.to_string()))?)?;

    let ws_real = real(ws);
    let tmp_real = real(&tmp);
    let mut env = inner.env.pairs();
    env.extend([
        ("TOWER_GOAL_ID".to_string(), goal.id.clone()),
        ("TOWER_WORKSPACE".into(), ws_real.display().to_string()),
        ("TOWER_CONTRACT".into(), contract_path.display().to_string()),
        ("TOWER_TMP".into(), tmp_real.display().to_string()),
        // The language of the extension's approval reasons and options.
        ("TOWER_LANG".into(), settings.lang().code().into()),
        // Whether the agent's shell keeps proxy variables (off: stripped).
        ("TOWER_NETWORK".into(), if goal.contract.network { "1" } else { "0" }.into()),
        // The ACP bridge's agent (ignored by Pi).
        ("TOWER_ACP_AGENT".into(), inner.claude_acp_command()),
        ("PI_OFFLINE".into(), "1".into()),
    ]);
    let jail = agent_jail(inner, goal, ws, &tmp, "agent", goal.contract.network)?;
    // The agent's shell and file tools inherit the private caches.
    env.extend(jail.env.into_iter().filter(|(k, _)| k != "TMPDIR"));
    if let Some(profile) = jail.profile {
        env.push(("TOWER_SANDBOX_PROFILE".into(), profile.display().to_string()));
    }
    let model = Some(goal.contract.model.clone())
        .filter(|m| !m.is_empty())
        .or_else(|| Some(settings.default_model.clone()).filter(|m| !m.is_empty()));
    let thinking = Some(goal.contract.thinking.clone())
        .filter(|m| !m.is_empty())
        .or_else(|| Some(settings.default_thinking.clone()).filter(|m| !m.is_empty()));
    Ok(EngineConfig {
        program,
        cwd: ws.to_path_buf(),
        session_dir: inner.paths.sessions(&goal.id),
        resume_session: goal.session_file.as_ref().map(PathBuf::from).filter(|p| p.exists()),
        extensions: inner.extensions(&settings),
        load_user_extensions: settings.load_user_extensions,
        model,
        thinking,
        append_system_prompt: Some({
            let project = inner.store(|s| s.project(&goal.project_id))?;
            prompts::system_section(
                &goal.id,
                &[("User memory", settings.user_memory.as_str()), ("Project memory", project.memory.as_str())],
                settings.agent_language(),
            )
        }),
        env,
    })
}

/// Marks a goal as being started; released when dropped.
struct Starting<'a> {
    inner: &'a Inner,
    goal: String,
}

impl<'a> Starting<'a> {
    fn claim(inner: &'a Inner, goal: &str) -> Option<Self> {
        let fresh = inner.starting.lock().unwrap_or_else(PoisonError::into_inner).insert(goal.to_string());
        fresh.then(|| Starting { inner, goal: goal.to_string() })
    }
}

impl Drop for Starting<'_> {
    fn drop(&mut self) {
        self.inner.starting.lock().unwrap_or_else(PoisonError::into_inner).remove(&self.goal);
    }
}

/// Prepares the workspace if needed, starts Pi and sends the first message.
///
/// Boxed because runs start other runs (a settled run schedules the next
/// ready goal), which would otherwise make the future type recursive.
pub fn start_run<'a>(
    inner: &'a Arc<Inner>,
    goal_id: &'a str,
    purpose: &'a str,
    message: String,
) -> std::pin::Pin<Box<dyn std::future::Future<Output = Result<()>> + Send + 'a>> {
    Box::pin(start_run_inner(inner, goal_id, purpose, message, false))
}

fn start_scheduled<'a>(
    inner: &'a Arc<Inner>,
    goal_id: &'a str,
    purpose: &'a str,
    message: String,
) -> std::pin::Pin<Box<dyn std::future::Future<Output = Result<()>> + Send + 'a>> {
    Box::pin(start_run_inner(inner, goal_id, purpose, message, true))
}

/// `only_if_ready`: the scheduler's starts, which must not start a goal that
/// stopped being ready (a human paused it) after the scheduler looked.
async fn start_run_inner(
    inner: &Arc<Inner>,
    goal_id: &str,
    purpose: &str,
    message: String,
    only_if_ready: bool,
) -> Result<()> {
    let lang = inner.lang();
    // One start at a time per goal: preparing a workspace takes a while, and
    // two callers (the scheduler and a human resume) must not both get through.
    let _starting = match Starting::claim(inner, goal_id) {
        Some(s) => s,
        None => return Err(invalid(tr!(lang, "这个目标正在启动", "This goal is already starting"))),
    };
    if inner.run_of(goal_id).is_some() {
        return Err(invalid(tr!(lang, "这个目标已经在运行", "This goal is already running")));
    }
    let mut goal = inner.store(|s| s.goal(goal_id))?;
    if only_if_ready && goal.state != LifecycleState::Ready {
        return Ok(());
    }

    if goal.workspace.is_none() {
        inner.set_mode(goal_id, Mode::Starting)?;
        let ws = inner.paths.workspace(goal_id);
        let git = inner.git.clone();
        let (root, branch, ws2, id) =
            (PathBuf::from(&goal.project_root), goal.base_branch.clone(), ws.clone(), goal.id.clone());
        let prepared = tokio::task::spawn_blocking(move || git.prepare_workspace(&root, &branch, &ws2, &id))
            .await
            .map_err(|e| invalid(e.to_string()))?;
        match prepared {
            Ok(base) => {
                inner.append(
                    goal_id,
                    EventKind::WorkspacePrepared { workspace: ws.display().to_string(), base_commit: base },
                )?;
                let copied = copy_local_files(inner, &goal, &ws).await?;
                if !copied.is_empty() {
                    inner.append(goal_id, EventKind::LocalFilesCopied { files: copied })?;
                }
                setup_workspace(inner, &goal, &ws).await?;
                goal = inner.store(|s| s.goal(goal_id))?;
            }
            Err(e) => {
                fail_to_start(
                    inner,
                    goal_id,
                    &tr!(lang, "准备工作区失败：{e}", "Could not prepare the workspace: {e}"),
                )?;
                return Err(e.into());
            }
        }
    }
    let ws = PathBuf::from(goal.workspace.clone().expect("workspace prepared"));

    // Claude Code's adapter, installed once from the lockfile Tower ships.
    if inner.engine_of(&goal) == "claude-code"
        && let Err(e) = crate::acp_adapter::ensure(inner).await
    {
        fail_to_start(inner, goal_id, &e.to_string())?;
        return Err(e);
    }

    let cfg = match engine_config(inner, &goal, &ws) {
        Ok(c) => c,
        Err(e) => {
            fail_to_start(inner, goal_id, &e.to_string())?;
            return Err(e);
        }
    };
    let (engine, rx) = match Engine::spawn(&cfg) {
        Ok(x) => x,
        Err(e) => {
            fail_to_start(inner, goal_id, &tr!(lang, "启动 pi 失败：{e}", "Could not start Pi: {e}"))?;
            return Err(e.into());
        }
    };

    // A run interrupted by Tower quitting continues under the same number.
    let continuing = purpose == "continue" && goal.run_no > 0;
    let run_no = if continuing { goal.run_no } else { goal.run_no + 1 };
    // Where this run starts from, kept (as a ref, so git never collects it)
    // for rolling back. Best effort: a run is not refused for want of it.
    let start_pin = match goal.base_commit.clone().filter(|_| !continuing) {
        Some(base) => {
            let git = inner.git.clone();
            let ws2 = ws.clone();
            tokio::task::spawn_blocking(move || -> Option<String> {
                let snap = git.snapshot(&ws2, &base).ok()?;
                git.keep(&ws2, &format!("refs/tower/runs/{run_no}"), &snap.pin).ok()?;
                Some(snap.pin)
            })
            .await
            .ok()
            .flatten()
        }
        None => None,
    };
    if goal.state != LifecycleState::Running {
        inner.transition(goal_id, Transition::RunStarted, None, purpose)?;
    }
    inner.append(goal_id, EventKind::RunStarted { run_no, purpose: purpose.into(), start_pin })?;
    inner.set_mode(goal_id, Mode::Starting)?;

    let run = Arc::new(Run {
        goal_id: goal_id.into(),
        run_no,
        started: Instant::now(),
        engine,
        workspace: real(&ws).display().to_string(),
        flags: Mutex::default(),
    });
    inner.runs.lock().unwrap_or_else(PoisonError::into_inner).insert(goal_id.into(), run.clone());
    inner.update_keep_awake();
    // The criteria on your own code, while the agent starts (once; see
    // `verify::preflight`).
    crate::verify::preflight(inner.clone(), goal_id.to_string());
    tokio::spawn(pump(inner.clone(), run.clone(), rx));
    tokio::spawn(watchdog(inner.clone(), run.clone()));

    if let Ok(state) = run.engine.state().await
        && let Some(file) = state.get("sessionFile").and_then(Value::as_str)
        && goal.session_file.as_deref() != Some(file)
    {
        inner.append(goal_id, EventKind::SessionAttached { session_file: file.into() })?;
    }
    inner.append(goal_id, EventKind::Injected { channel: "prompt".into(), text: message.clone() })?;
    if let Err(e) = run.engine.prompt(&message).await {
        stop_engine(inner, &run, Stop::Pause(PauseReason::PrepareFailed)).await;
        let detail = tr!(lang, "发送开场消息失败：{e}", "Could not send the first message: {e}");
        pause_after_stop(inner, goal_id, PauseReason::PrepareFailed, &detail)?;
        return Err(e.into());
    }
    inner.set_mode(goal_id, Mode::Thinking)?;
    Ok(())
}

/// Copies the project's git-ignored local files (e.g. `.env`) into `dest`.
pub async fn copy_local_files(inner: &Arc<Inner>, goal: &tower_store::GoalRecord, dest: &Path) -> Result<Vec<String>> {
    let project = inner.store(|s| s.project(&goal.project_id))?;
    if project.local_files.is_empty() {
        return Ok(Vec::new());
    }
    let git = inner.git.clone();
    let (root, dest2, patterns) = (PathBuf::from(&project.root), dest.to_path_buf(), project.local_files.clone());
    let copied = tokio::task::spawn_blocking(move || git.copy_local_files(&root, &dest2, &patterns))
        .await
        .map_err(|e| invalid(e.to_string()))??;
    Ok(copied)
}

/// Runs the project's setup command (e.g. `pnpm install`) once in a new
/// workspace, under the agent's sandbox. A failure is recorded and does not
/// block the run: the agent can still install what it needs.
async fn setup_workspace(inner: &Arc<Inner>, goal: &tower_store::GoalRecord, ws: &Path) -> Result<()> {
    let project = inner.store(|s| s.project(&goal.project_id))?;
    let command = project.setup_command.trim().to_string();
    if command.is_empty() {
        return Ok(());
    }
    inner.set_mode(&goal.id, Mode::Starting)?;
    // Setup installs dependencies, so it has the network; it still cannot
    // read the user's files or write outside the workspace and caches.
    let jail = agent_jail(inner, goal, ws, &inner.paths.tmp(&goal.id), "setup", true)?;
    let shell_command = crate::verify::command_for(&command, jail.profile.as_deref());
    let mut env = inner.env.without_credentials();
    env.extend(jail.env);
    let spec = tower_verify::RunSpec::new(shell_command, ws, env, Duration::from_secs(15 * 60));
    let r = tower_verify::run(&spec, &tower_verify::Cancel::default()).await;
    inner.append(
        &goal.id,
        EventKind::SetupFinished { command, ok: r.passed(), exit_code: r.exit_code(), duration_ms: r.duration_ms },
    )?;
    if !r.passed() {
        let tail = &r.output_tail;
        let text = tr!(
            inner.lang(),
            "准备命令失败，Agent 会在没有它的情况下开始：\n{tail}",
            "The setup command failed; the agent starts without it:\n{tail}"
        );
        inner.append(&goal.id, EventKind::Note { text })?;
    }
    Ok(())
}

/// Watches a run for stalls the event stream cannot reveal: no activity for
/// a long time, or the wall-clock cap passing (`docs/07` §7.6).
async fn watchdog(inner: Arc<Inner>, run: Arc<Run>) {
    const QUIET: Duration = Duration::from_secs(10 * 60);
    let mut tick = tokio::time::interval(Duration::from_secs(30));
    loop {
        tick.tick().await;
        if run.flags().stopping.is_some() || inner.run_of(&run.goal_id).is_none_or(|r| r.run_no != run.run_no) {
            break;
        }
        let Ok(goal) = inner.store(|s| s.goal(&run.goal_id)) else { break };
        let cap = Duration::from_secs(u64::from(goal.contract.budget.wall_minutes.max(1)) * 60);
        if run.started.elapsed() > cap {
            let inner2 = inner.clone();
            let g = run.goal_id.clone();
            let minutes = goal.contract.budget.wall_minutes;
            let detail = tower_core::i18n::PauseNote::RanPast { minutes }.encode();
            tokio::spawn(async move {
                let r = pause(&inner2, &g, PauseReason::WallClockCap, &detail).await;
                report(&inner2, &g, r).await;
            });
            break;
        }
        let quiet = run.flags().last_activity.unwrap_or(run.started).elapsed();
        let waiting = !run.flags().dialogs.is_empty();
        if quiet > QUIET && !waiting {
            let minutes = quiet.as_secs() / 60;
            report_stall(&inner, &run, "no_progress", tower_core::i18n::Stall::NoProgress { minutes });
        }
    }
}

/// Raises a stall once per detector per run. The run keeps going; the
/// Needs-You item lets the human wait, steer or pause.
fn report_stall(inner: &Arc<Inner>, run: &Arc<Run>, detector: &str, stall: tower_core::i18n::Stall) {
    if !run.flags().stalls_reported.insert(detector.to_string()) {
        return;
    }
    let g = run.goal_id.as_str();
    let lang = inner.lang();
    let detail = &stall.text(lang);
    let opened =
        inner.append(g, EventKind::Stalled { detector: detector.into(), detail: detail.into() }).and_then(|_| {
            inner.open_inbox(NewInboxItem {
                goal_id: g.into(),
                kind: InboxKind::Stalled,
                title: tr!(lang, "可能卡住：{detail}", "May be stuck: {detail}"),
                subject: stall.encode(),
                body: tr!(
                    lang,
                    "Agent 仍在运行。你可以继续等待、写一句转向，或者暂停它。",
                    "The agent is still running. You can keep waiting, write a steer, or pause it."
                ),
                options: Choice::labels(&[Choice::KeepWaiting, Choice::Pause], lang),
                allow_text: true,
                urgency: 2,
                engine_ref: None,
            })
        });
    // A stall that cannot be shown is still worth a trace line.
    if let Err(e) = opened {
        tracing::error!(goal = g, error = %e, "could not raise a stall");
    }
}

fn fail_to_start(inner: &Arc<Inner>, goal_id: &str, detail: &str) -> Result<()> {
    inner.append(goal_id, EventKind::EngineError { message: detail.into() })?;
    pause_after_stop(inner, goal_id, PauseReason::PrepareFailed, detail)
}

mod events;
use events::pump;
pub(crate) use events::{sandbox_denied, stop_engine};
