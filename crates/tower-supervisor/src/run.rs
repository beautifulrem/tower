//! Engine runs: starting, observing, steering and stopping one goal's Pi.

use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex, PoisonError};
use std::time::{Duration, Instant};

use serde_json::Value;
use tokio::sync::mpsc;
use tower_core::contract::CriterionKind;
use tower_core::honesty::ClaimKind;
use tower_core::i18n::Choice;
use tower_core::lifecycle::Transition;
use tower_core::view::InboxKind;
use tower_core::{EventKind, LifecycleState, Mode, PauseReason, tr};
use tower_pi::{Engine, EngineConfig, EngineOutput, PiEvent, UiRequest};
use tower_store::NewInboxItem;

use crate::api::{ToastLevel, UiUpdate};
use crate::paths::real;
use crate::{Inner, Result, invalid, prompts, summarize, verify};

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
            let detail = tr!(inner.lang(), "本次运行已超过 {minutes} 分钟", "This run has passed {minutes} minutes");
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

/// Reads the engine's output until it exits. One task per run, so events of
/// one goal are processed strictly in order.
async fn pump(inner: Arc<Inner>, run: Arc<Run>, mut rx: mpsc::UnboundedReceiver<EngineOutput>) {
    while let Some(out) = rx.recv().await {
        let result = match out {
            EngineOutput::Event(e) => on_event(&inner, &run, e).await,
            EngineOutput::ProtocolError(line) => inner
                .append(
                    &run.goal_id,
                    EventKind::EngineError {
                        message: tr!(inner.lang(), "无法解析 pi 的输出：{line}", "Could not parse Pi's output: {line}"),
                    },
                )
                .map(|_| ()),
            EngineOutput::Exited { code, stderr_tail } => {
                on_exit(&inner, &run, code, &stderr_tail).await;
                break;
            }
        };
        if let Err(e) = result {
            tracing::warn!(goal = %run.goal_id, error = %e, "handling engine event failed");
        }
    }
}

async fn on_event(inner: &Arc<Inner>, run: &Arc<Run>, e: PiEvent) -> Result<()> {
    let g = run.goal_id.as_str();
    match e {
        PiEvent::AgentStart | PiEvent::TurnStart => inner.set_mode(g, Mode::Thinking)?,
        PiEvent::TextDelta { delta } => {
            let text = {
                let mut f = run.flags();
                f.stream.push_str(&delta);
                let due = f.last_stream.is_none_or(|t| t.elapsed() >= Duration::from_millis(150));
                if due {
                    f.last_stream = Some(Instant::now());
                    Some(tail(&f.stream, 1_200).to_string())
                } else {
                    None
                }
            };
            if let Some(text) = text {
                inner.sink.emit(UiUpdate::Stream { goal_id: g.into(), text });
            }
        }
        PiEvent::MessageEnd { role, text, stop_reason, error } => {
            if role == "assistant" {
                run.flags().stream.clear();
                if !text.trim().is_empty() {
                    inner.append(g, EventKind::AssistantMessage { text: head(text.trim(), 8_000).into() })?;
                }
                if stop_reason.as_deref() == Some("error") {
                    let msg = error.unwrap_or_else(|| {
                        tr!(inner.lang(), "模型服务返回错误", "The model provider returned an error")
                    });
                    run.flags().last_error = Some(msg.clone());
                    inner.append(g, EventKind::EngineError { message: msg })?;
                }
                // Cost is known once a message ends; checking here rather than
                // at the end of the turn stops the run before its tool calls
                // (and the next request) when a cap is reached.
                check_budget(inner, run).await?;
            }
        }
        PiEvent::ToolStart { call_id, tool, args } => on_tool_start(inner, run, call_id, tool, args)?,
        PiEvent::ToolEnd { call_id, tool, result, is_error } => {
            let call = run.flags().tools.remove(&call_id);
            let duration_ms = call.as_ref().map(|c| c.started.elapsed().as_millis() as i64).unwrap_or(0);
            let text = tower_pi::result_text(&result);
            let target = call.as_ref().map(|c| summarize::tool_call(&tool, &c.args, &run.workspace));
            // A refusal is a failure, whatever the command's exit status.
            let denied = sandbox_denied(&text);
            let is_error = is_error || denied;
            inner.append(
                g,
                EventKind::ToolEnded {
                    call_id,
                    tool: tool.clone(),
                    is_error,
                    summary: summarize::tool_result(&text),
                    duration_ms,
                    target,
                    denied,
                },
            )?;
            run.flags().last_activity = Some(Instant::now());
            if let Some(call) = &call {
                let signature = format!("{tool} · {}", summarize::tool_call(&tool, &call.args, &run.workspace));
                if is_error {
                    let n = {
                        let mut f = run.flags();
                        let n = f.failures.entry(signature.clone()).or_insert(0);
                        *n += 1;
                        *n
                    };
                    if n == REPEATED_FAILURES {
                        report_stall(
                            inner,
                            run,
                            &format!("repeat:{signature}"),
                            tower_core::i18n::Stall::Repeated { signature: signature.clone(), times: n },
                        );
                    }
                } else {
                    run.flags().failures.remove(&signature);
                }
            }
            if let (Some(call), "bash") = (call, tool.as_str()) {
                observe(inner, g, &call.args, !is_error)?;
            }
            if !matches!(tool.as_str(), "ask_user") {
                inner.set_mode(g, Mode::Thinking)?;
            }
        }
        PiEvent::CompactionStart => inner.set_mode(g, Mode::Compacting)?,
        PiEvent::CompactionEnd => inner.set_mode(g, Mode::Thinking)?,
        PiEvent::RetryStart { attempt, max_attempts, error } => {
            inner.set_mode(g, Mode::Retrying)?;
            inner.append(
                g,
                EventKind::Note {
                    text: tr!(
                        inner.lang(),
                        "模型服务出错，第 {attempt}/{max_attempts} 次重试：{error}",
                        "Model provider error, retry {attempt}/{max_attempts}: {error}"
                    ),
                },
            )?;
        }
        PiEvent::RetryEnd { .. } => inner.set_mode(g, Mode::Thinking)?,
        PiEvent::TurnEnd => check_budget(inner, run).await?,
        PiEvent::UiRequest(req) => on_ui_request(inner, run, req)?,
        PiEvent::ExtensionError { extension, event, error } => {
            let message = tr!(
                inner.lang(),
                "扩展错误（{event}，{extension}）：{error}",
                "Extension error ({event}, {extension}): {error}"
            );
            inner.append(g, EventKind::EngineError { message })?;
        }
        PiEvent::AgentSettled { .. } => on_settled(inner, run).await?,
        PiEvent::AgentEnd { .. } | PiEvent::Other { .. } => {}
    }
    Ok(())
}

fn on_tool_start(inner: &Arc<Inner>, run: &Arc<Run>, call_id: String, tool: String, args: Value) -> Result<()> {
    let g = run.goal_id.as_str();
    // Engine call ids are unique within a run only.
    let claim_id = format!("r{}:{}", run.run_no, call_id);
    let s = |k: &str| args.get(k).and_then(Value::as_str).unwrap_or_default().to_string();
    match tool.as_str() {
        "log" => {
            let kind = ClaimKind::parse(&s("kind")).unwrap_or(ClaimKind::Progress);
            let text = s("text");
            inner.append(
                g,
                EventKind::Claim { claim_id: claim_id.clone(), claim: kind, text: text.clone(), criterion: None },
            )?;
            if kind.needs_approval() {
                inner.open_inbox(NewInboxItem {
                    goal_id: g.into(),
                    kind: InboxKind::Assumption,
                    title: tr!(
                        inner.lang(),
                        "Agent 的假设待你确认",
                        "An assumption by the agent needs your confirmation"
                    ),
                    subject: text.clone(),
                    body: text,
                    options: Choice::labels(&[Choice::Approve, Choice::Reject], inner.lang()),
                    allow_text: true,
                    urgency: 4,
                    engine_ref: Some(claim_id.clone()),
                })?;
            }
        }
        "submit" => {
            inner.append(g, EventKind::Submitted { summary: s("summary") })?;
            if let Some(items) = args.get("criteria").and_then(Value::as_array) {
                for item in items {
                    let id = item.get("id").and_then(Value::as_str).unwrap_or_default();
                    let met = item.get("met").and_then(Value::as_bool).unwrap_or(false);
                    let evidence = item.get("evidence").and_then(Value::as_str).unwrap_or_default();
                    if met && !id.is_empty() {
                        inner.append(
                            g,
                            EventKind::Claim {
                                claim_id: format!("{claim_id}/{id}"),
                                claim: ClaimKind::CriterionMet,
                                text: if evidence.is_empty() {
                                    tr!(inner.lang(), "{id} 已满足", "{id} is met")
                                } else {
                                    evidence.to_string()
                                },
                                criterion: Some(id.to_string()),
                            },
                        )?;
                    }
                }
            }
            run.flags().submitted = true;
        }
        _ => {}
    }
    inner.append(
        g,
        EventKind::ToolStarted {
            call_id: call_id.clone(),
            tool: tool.clone(),
            summary: summarize::tool_call(&tool, &args, &run.workspace),
        },
    )?;
    if tool != "log" && tool != "submit" {
        inner.set_mode(g, Mode::for_tool(&tool))?;
    }
    run.flags().tools.insert(call_id, ToolCall { args, started: Instant::now() });
    Ok(())
}

/// A shell command in the agent's environment that runs a criterion's
/// command is an observation for that criterion. Never a fact.
fn observe(inner: &Inner, goal: &str, args: &Value, passed: bool) -> Result<()> {
    let command = args.get("command").and_then(Value::as_str).unwrap_or_default();
    let contract = inner.store(|s| s.goal(goal))?.contract;
    for c in &contract.criteria {
        if let CriterionKind::Exec { command: crit, .. } = &c.kind
            && !crit.trim().is_empty()
            && same_command(command, crit)
        {
            inner.append(goal, EventKind::Observed { criterion: c.id.clone(), passed })?;
        }
    }
    Ok(())
}

/// Whether the agent ran exactly a criterion's command: after leading
/// `cd …&&` steps, nothing else — a pipe, `;` or `||` can change the exit
/// status, so such a run says nothing about the criterion.
fn same_command(ran: &str, criterion: &str) -> bool {
    let norm = |s: &str| s.split_whitespace().collect::<Vec<_>>().join(" ");
    let mut parts: Vec<&str> = ran.split("&&").map(str::trim).collect();
    while parts.len() > 1 && parts[0].starts_with("cd ") {
        parts.remove(0);
    }
    norm(&parts.join(" && ")) == norm(criterion)
}

async fn check_budget(inner: &Arc<Inner>, run: &Arc<Run>) -> Result<()> {
    let g = run.goal_id.as_str();
    let Ok(stats) = run.engine.session_stats().await else { return Ok(()) };
    let Some(cost) = stats.get("cost").and_then(Value::as_f64) else { return Ok(()) };
    let rec = inner.store(|s| s.goal(g))?;
    if (cost - rec.cost_usd).abs() > 1e-9 {
        inner.append(g, EventKind::CostUpdated { total_usd: cost })?;
    }
    let budget = rec.contract.budget;
    let reason = if cost >= budget.hard_usd {
        Some(PauseReason::BudgetHardCap)
    } else if cost >= budget.soft_usd {
        Some(PauseReason::BudgetSoftCap)
    } else {
        None
    };
    let first = reason.is_some() && {
        let mut f = run.flags();
        f.stopping.is_none() && !f.submitted && !std::mem::replace(&mut f.over_budget, true)
    };
    if let Some(reason) = reason
        && first
    {
        let inner = inner.clone();
        let g = g.to_string();
        let detail = tr!(inner.lang(), "已花费 ${cost:.2}", "Spent ${cost:.2}");
        tokio::spawn(async move {
            let r = pause(&inner, &g, reason, &detail).await;
            report(&inner, &g, r).await;
        });
    }
    Ok(())
}

fn on_ui_request(inner: &Arc<Inner>, run: &Arc<Run>, req: UiRequest) -> Result<()> {
    let g = run.goal_id.as_str();
    if !req.is_dialog() {
        if req.method == "notify"
            && let Some(m) = req.message.filter(|m| !m.is_empty())
        {
            inner.append(g, EventKind::Note { text: m })?;
        }
        return Ok(());
    }
    let title = req.title.clone().unwrap_or_default();
    let lang = inner.lang();
    let item = match title.strip_prefix("tower:").and_then(|j| serde_json::from_str::<Value>(j).ok()) {
        Some(p) if p.get("tower").and_then(Value::as_str) == Some("approval") => {
            let s = |k: &str| p.get(k).and_then(Value::as_str).unwrap_or_default().to_string();
            NewInboxItem {
                goal_id: g.into(),
                kind: InboxKind::Approval,
                title: {
                    let reason = s("reason");
                    tr!(lang, "需要你批准：{reason}", "Approval needed: {reason}")
                },
                subject: s("reason"),
                body: format!("{} · {}", s("tool"), s("target")),
                options: req.options.clone(),
                allow_text: false,
                urgency: 0,
                engine_ref: Some(req.id.clone()),
            }
        }
        Some(p) => {
            let s = |k: &str| p.get(k).and_then(Value::as_str).unwrap_or_default().to_string();
            let options = p
                .get("options")
                .and_then(Value::as_array)
                .map(|a| a.iter().filter_map(Value::as_str).map(String::from).collect())
                .unwrap_or_default();
            NewInboxItem {
                goal_id: g.into(),
                kind: InboxKind::Question,
                title: s("question"),
                subject: s("question"),
                body: s("why"),
                options,
                allow_text: true,
                urgency: 1,
                engine_ref: Some(req.id.clone()),
            }
        }
        // A dialog from one of the user's own extensions.
        None => NewInboxItem {
            goal_id: g.into(),
            kind: InboxKind::Question,
            subject: title.clone(),
            title: if title.is_empty() {
                tr!(lang, "扩展请求你的输入", "An extension asks for your input")
            } else {
                title
            },
            body: req.message.clone().unwrap_or_default(),
            options: if req.method == "confirm" {
                Choice::labels(&[Choice::Yes, Choice::No], lang)
            } else {
                req.options.clone()
            },
            allow_text: matches!(req.method.as_str(), "input" | "editor"),
            urgency: 1,
            engine_ref: Some(req.id.clone()),
        },
    };
    let opened = inner.open_inbox(item)?;
    run.flags().dialogs.insert(req.id, (opened.id, req.method));
    inner.set_mode(g, Mode::WaitingOnYou)?;
    let title = &opened.title;
    inner.toast(g, ToastLevel::Warning, tr!(lang, "{g} 需要你：{title}", "{g} needs you: {title}"));
    Ok(())
}

async fn on_settled(inner: &Arc<Inner>, run: &Arc<Run>) -> Result<()> {
    let g = run.goal_id.clone();
    let (stopping, submitted, nudged, last_error) = {
        let f = run.flags();
        (f.stopping, f.submitted, f.nudged, f.last_error.clone())
    };
    if stopping.is_some() {
        return Ok(());
    }
    if submitted {
        run.flags().stopping = Some(Stop::Submitted);
        inner.set_mode(&g, Mode::Settled)?;
        let inner = inner.clone();
        let run = run.clone();
        tokio::spawn(async move {
            run.engine.shutdown(Duration::from_secs(5)).await;
            let r = finish_submitted(&inner, &run).await;
            report(&inner, &run.goal_id, r).await;
        });
        return Ok(());
    }
    if let Some(err) = last_error {
        let inner = inner.clone();
        tokio::spawn(async move {
            let r = pause(&inner, &g, PauseReason::ProviderError, &err).await;
            report(&inner, &g, r).await;
        });
        return Ok(());
    }
    if !nudged {
        run.flags().nudged = true;
        inner.append(&g, EventKind::Injected { channel: "prompt".into(), text: prompts::NUDGE.into() })?;
        run.engine.prompt(prompts::NUDGE).await?;
        return Ok(());
    }
    let inner = inner.clone();
    let detail = tr!(inner.lang(), "提醒过一次后仍未提交", "Still no submit after one reminder");
    tokio::spawn(async move {
        let r = pause(&inner, &g, PauseReason::IdleWithoutSubmit, &detail).await;
        report(&inner, &g, r).await;
    });
    Ok(())
}

async fn finish_submitted(inner: &Arc<Inner>, run: &Arc<Run>) -> Result<()> {
    let g = run.goal_id.as_str();
    remove_run(inner, run);
    inner.append(g, EventKind::RunEnded { run_no: run.run_no, outcome: "submitted".into() })?;
    inner.transition(g, Transition::Submitted, None, "")?;
    verify::spawn(inner.clone(), g.to_string());
    schedule(inner).await;
    Ok(())
}

async fn on_exit(inner: &Arc<Inner>, run: &Arc<Run>, code: Option<i32>, stderr_tail: &str) {
    let stopping = run.flags().stopping;
    if stopping.is_some() {
        // Tower stopped it; the stopping path records the outcome.
        return;
    }
    let g = run.goal_id.as_str();
    remove_run(inner, run);
    let tail: String = tail(stderr_tail.trim(), 2_000).to_string();
    let lang = inner.lang();
    let how = match code {
        Some(c) => tr!(lang, "退出码 {c}", "exit code {c}"),
        None => tr!(lang, "被信号终止", "killed by a signal"),
    };
    let tail = if tail.is_empty() { String::new() } else { format!("\n{tail}") };
    let detail = tr!(lang, "pi 意外退出（{how}）{tail}", "Pi exited unexpectedly ({how}){tail}");
    let r = inner
        .append(g, EventKind::RunEnded { run_no: run.run_no, outcome: "crashed".into() })
        .and_then(|_| inner.append(g, EventKind::EngineError { message: detail.clone() }))
        .and_then(|_| pause_after_stop(inner, g, PauseReason::EngineCrash, &detail));
    report(inner, g, r).await;
    schedule(inner).await;
}

fn remove_run(inner: &Inner, run: &Run) {
    {
        let mut runs = inner.runs.lock().unwrap_or_else(PoisonError::into_inner);
        if runs.get(&run.goal_id).is_some_and(|r| r.run_no == run.run_no) {
            runs.remove(&run.goal_id);
        }
    }
    inner.update_keep_awake();
}

pub(crate) async fn stop_engine(inner: &Arc<Inner>, run: &Arc<Run>, why: Stop) {
    run.flags().stopping = Some(why);
    let _ = tokio::time::timeout(Duration::from_secs(3), run.engine.abort()).await;
    run.engine.shutdown(Duration::from_secs(5)).await;
    remove_run(inner, run);
    let _ = inner.append(
        &run.goal_id,
        EventKind::RunEnded {
            run_no: run.run_no,
            outcome: match why {
                Stop::Pause(_) => "paused",
                Stop::Submitted => "submitted",
                Stop::Abandon => "abandoned",
            }
            .into(),
        },
    );
}

fn tail(s: &str, n: usize) -> &str {
    let count = s.chars().count();
    if count <= n {
        return s;
    }
    let idx = s.char_indices().nth(count - n).map(|(i, _)| i).unwrap_or(0);
    &s[idx..]
}

fn head(s: &str, n: usize) -> &str {
    match s.char_indices().nth(n) {
        Some((i, _)) => &s[..i],
        None => s,
    }
}

/// Whether a tool's output shows the sandbox refusing an access (the
/// kernel's EPERM, as shells and Node print it).
pub(crate) fn sandbox_denied(text: &str) -> bool {
    let t = text.to_ascii_lowercase();
    t.contains("operation not permitted")
        || t.contains("eperm:")
        || t.contains("sandbox-exec: ")
        || t.contains("deny(1)")
}

#[cfg(test)]
mod tests {
    use super::same_command;

    #[test]
    fn only_the_exact_criterion_command_is_an_observation() {
        assert!(same_command("npm test", "npm test"));
        assert!(same_command("cd /w/G-1 && npm  test", "npm test"));
        assert!(!same_command("npm test | tail -5", "npm test"), "a pipe hides the exit status");
        assert!(!same_command("npm test || true", "npm test"));
        assert!(!same_command("npm test -- --grep cart", "npm test"));
    }
}
