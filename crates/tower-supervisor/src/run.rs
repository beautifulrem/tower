//! Engine runs: starting, observing, steering and stopping one goal's Pi.

use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex, PoisonError};
use std::time::{Duration, Instant};

use serde_json::Value;
use tokio::sync::mpsc;
use tower_core::contract::CriterionKind;
use tower_core::honesty::ClaimKind;
use tower_core::i18n::{Choice, pause_label, state_label};
use tower_core::lifecycle::Transition;
use tower_core::view::InboxKind;
use tower_core::{EventKind, Lang, LifecycleState, Mode, PauseReason, tr};
use tower_pi::{Engine, EngineConfig, EngineOutput, PiEvent, UiAnswer, UiRequest};
use tower_store::NewInboxItem;

use crate::api::{ToastLevel, UiUpdate};
use crate::paths::real;
use crate::{Error, Inner, Result, actions, invalid, prompts, sandbox, summarize, verify};

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
            ("initial", prompts::initial(&g.title, &g.contract))
        } else {
            ("resume", prompts::resume("waiting for a free slot", &human_notes_since_last_run(inner, &g.id), &[]))
        };
        if let Err(e) = start_run(inner, &g.id, purpose, message).await {
            tracing::warn!(goal = %g.id, error = %e, "could not start run");
        }
    }
}

/// Human steering recorded while no engine was running, to carry into the
/// next run's first message.
fn human_notes_since_last_run(inner: &Inner, goal: &str) -> Vec<String> {
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

/// The sandbox profile and environment for one process of a goal: the
/// directory it works in, the goal's private TMPDIR and package caches, and
/// whether it may use the network.
pub(crate) struct Jail {
    pub profile: Option<PathBuf>,
    pub env: Vec<(String, String)>,
}

pub(crate) fn jail(
    inner: &Inner,
    goal: &tower_store::GoalRecord,
    dir: &Path,
    tmp: &Path,
    purpose: &str,
    network: bool,
) -> Result<Jail> {
    let home = real(&inner.env.get("HOME").map(PathBuf::from).unwrap_or_else(|| PathBuf::from("/")));
    let goal_dir = inner.paths.goal_dir(&goal.id);
    std::fs::create_dir_all(&goal_dir)?;
    std::fs::create_dir_all(tmp)?;
    let cache = crate::caches::prepare(&goal_dir.join("cache"), &home, dir)?;
    let mut env = crate::caches::env(&cache);
    env.push(("TMPDIR".into(), real(tmp).display().to_string()));
    let profile = if sandbox::available() {
        let path = goal_dir.join(format!("{purpose}.sb"));
        let spec = sandbox::Spec {
            workspace: real(dir),
            tmp: real(tmp),
            cache,
            home,
            read: Vec::new(),
            network,
            proxy_ports: sandbox::proxy_ports(&inner.env.pairs()),
        };
        std::fs::write(&path, sandbox::profile(&spec))?;
        Some(path)
    } else {
        None
    };
    Ok(Jail { profile, env })
}

fn engine_config(inner: &Inner, goal: &tower_store::GoalRecord, ws: &Path) -> Result<EngineConfig> {
    let program = inner.pi_program().ok_or_else(|| {
        invalid(tr!(inner.lang(), "没有找到 pi，请在设置中指定路径", "Pi was not found; set its path in Settings"))
    })?;
    let settings = inner.settings();
    let goal_dir = inner.paths.goal_dir(&goal.id);
    let tmp = inner.paths.tmp(&goal.id);
    std::fs::create_dir_all(&goal_dir)?;
    std::fs::create_dir_all(&tmp)?;
    std::fs::create_dir_all(inner.paths.sessions(&goal.id))?;
    let contract_path = goal_dir.join("contract.json");
    std::fs::write(&contract_path, serde_json::to_vec_pretty(&goal.contract).map_err(|e| invalid(e.to_string()))?)?;

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
        ("PI_OFFLINE".into(), "1".into()),
    ]);
    let jail = jail(inner, goal, ws, &tmp, "agent", goal.contract.network)?;
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
    Box::pin(start_run_inner(inner, goal_id, purpose, message))
}

async fn start_run_inner(inner: &Arc<Inner>, goal_id: &str, purpose: &str, message: String) -> Result<()> {
    let lang = inner.lang();
    if inner.run_of(goal_id).is_some() {
        return Err(invalid(tr!(lang, "这个目标已经在运行", "This goal is already running")));
    }
    let mut goal = inner.store(|s| s.goal(goal_id))?;

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

    let run_no = goal.run_no + 1;
    if goal.state != LifecycleState::Running {
        inner.transition(goal_id, Transition::RunStarted, None, purpose)?;
    }
    inner.append(goal_id, EventKind::RunStarted { run_no, purpose: purpose.into() })?;
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
    let jail = jail(inner, goal, ws, &inner.paths.tmp(&goal.id), "setup", true)?;
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
            let detail = tr!(inner.lang(), "{minutes} 分钟没有任何工具调用", "No tool calls for {minutes} minutes");
            report_stall(&inner, &run, "no_progress", &detail);
        }
    }
}

/// Raises a stall once per detector per run. The run keeps going; the
/// Needs-You item lets the human wait, steer or pause.
fn report_stall(inner: &Arc<Inner>, run: &Arc<Run>, detector: &str, detail: &str) {
    if !run.flags().stalls_reported.insert(detector.to_string()) {
        return;
    }
    let g = run.goal_id.as_str();
    let lang = inner.lang();
    let _ = inner.append(g, EventKind::Stalled { detector: detector.into(), detail: detail.into() });
    let _ = inner.open_inbox(NewInboxItem {
        goal_id: g.into(),
        kind: InboxKind::Stalled,
        title: tr!(lang, "可能卡住：{detail}", "May be stuck: {detail}"),
        body: tr!(
            lang,
            "Agent 仍在运行。你可以继续等待、写一句转向，或者暂停它。",
            "The agent is still running. You can keep waiting, write a steer, or pause it."
        ),
        options: Choice::labels(&[Choice::KeepWaiting, Choice::Pause], lang),
        allow_text: true,
        urgency: 2,
        engine_ref: None,
    });
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
            inner.append(
                g,
                EventKind::ToolEnded {
                    call_id,
                    tool: tool.clone(),
                    is_error,
                    summary: summarize::tool_result(&text),
                    duration_ms,
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
                            &tr!(inner.lang(), "{signature} 连续失败 {n} 次", "{signature} failed {n} times in a row"),
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
            && command.contains(crit.trim())
        {
            inner.append(goal, EventKind::Observed { criterion: c.id.clone(), passed })?;
        }
    }
    Ok(())
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
    inner.toast(ToastLevel::Warning, tr!(lang, "{g} 需要你：{title}", "{g} needs you: {title}"));
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

async fn stop_engine(inner: &Arc<Inner>, run: &Arc<Run>, why: Stop) {
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

/// Moves a goal whose engine is not running into `paused`, and raises a
/// Needs-You item when leaving the pause needs a decision.
pub fn pause_after_stop(inner: &Arc<Inner>, goal: &str, reason: PauseReason, detail: &str) -> Result<()> {
    let state = inner.store(|s| s.goal(goal))?.state;
    if state == LifecycleState::Paused {
        return Ok(());
    }
    let lang = inner.lang();
    inner.withdraw(goal, &[InboxKind::Question, InboxKind::Approval], &tr!(lang, "运行已停止", "The run stopped"));
    inner.set_mode(goal, Mode::Idle)?;
    inner.transition(goal, Transition::Pause { reason }, None, detail)?;
    if reason.needs_human() {
        let rec = inner.store(|s| s.goal(goal))?;
        inner.open_inbox(paused_item(&rec, reason, detail, lang, matches!(reason, PauseReason::IdleWithoutSubmit)))?;
    }
    Ok(())
}

/// The Needs-You card for a pause that needs a way out.
pub fn paused_item(
    rec: &tower_store::GoalRecord,
    reason: PauseReason,
    detail: &str,
    lang: Lang,
    allow_text: bool,
) -> NewInboxItem {
    let why = pause_label(reason, lang);
    NewInboxItem {
        goal_id: rec.id.clone(),
        kind: InboxKind::Paused,
        title: tr!(lang, "已暂停：{why}", "Paused: {why}"),
        body: detail.into(),
        options: Choice::labels(&actions::pause_options(reason, rec), lang),
        allow_text,
        urgency: 2,
        engine_ref: None,
    }
}

/// Pauses a goal: stops its engine or verification, then records the pause.
pub async fn pause(inner: &Arc<Inner>, goal: &str, reason: PauseReason, detail: &str) -> Result<()> {
    let rec = inner.store(|s| s.goal(goal))?;
    if rec.state == LifecycleState::Paused {
        return Ok(());
    }
    if !matches!(
        rec.state,
        LifecycleState::Ready | LifecycleState::Running | LifecycleState::Claimed | LifecycleState::Verifying
    ) {
        let lang = inner.lang();
        let state = state_label(rec.state, lang);
        return Err(invalid(tr!(lang, "{state}状态下不能暂停", "A goal that is {state} cannot be paused")));
    }
    if let Some(run) = inner.run_of(goal) {
        stop_engine(inner, &run, Stop::Pause(reason)).await;
        // The agent's last state, so edits made while paused are the human's.
        let _ = repin(inner, goal).await;
    }
    if let Some(c) = inner.verifications.lock().unwrap_or_else(PoisonError::into_inner).remove(goal) {
        c.cancel();
    }
    pause_after_stop(inner, goal, reason, detail)?;
    schedule(inner).await;
    Ok(())
}

/// Background work must never fail silently and leave a goal stuck: the
/// failure becomes an error in the trace, a toast, and — when the goal can
/// still be paused — a Needs-You card with a way out.
pub(crate) async fn report(inner: &Arc<Inner>, goal: &str, result: Result<()>) {
    let Err(e) = result else { return };
    let lang = inner.lang();
    let detail = tr!(lang, "Tower 内部错误：{e}", "Tower internal error: {e}");
    tracing::error!(goal, error = %e, "background step failed");
    let _ = inner.append(goal, EventKind::EngineError { message: detail.clone() });
    inner.toast(ToastLevel::Error, format!("{goal} · {detail}"));
    if let Err(again) = Box::pin(pause(inner, goal, PauseReason::Internal, &detail)).await {
        tracing::error!(goal, error = %again, "could not pause after an internal error");
    }
}

/// Continues a paused goal. Each pause reason has one way out
/// (`docs/03` §3.2.1); this is the default "continue" for all of them.
pub async fn resume(inner: &Arc<Inner>, goal: &str) -> Result<()> {
    let rec = inner.store(|s| s.goal(goal))?;
    let lang = inner.lang();
    if rec.state != LifecycleState::Paused {
        return Err(invalid(tr!(lang, "只有已暂停的目标可以继续", "Only a paused goal can be resumed")));
    }
    inner.withdraw(goal, &[InboxKind::Paused], &tr!(lang, "已继续", "Resumed"));
    let reason = rec.pause_reason.unwrap_or(PauseReason::Human);
    if reason == PauseReason::VerifyEnvError {
        verify::spawn(inner.clone(), goal.into());
        return Ok(());
    }
    let edits = human_edits(inner, goal).await.unwrap_or_default();
    // The prompt is for the agent, so the reason is in English.
    let message = prompts::resume(pause_label(reason, Lang::En), &human_notes_since_last_run(inner, goal), &edits);
    if inner.running_count() >= inner.settings().max_concurrent as usize {
        inner.transition(goal, Transition::Resume, None, &tr!(lang, "等待执行槽位", "Waiting for a free slot"))?;
        return Ok(());
    }
    start_run(inner, goal, "resume", message).await
}

/// Snapshots the workspace; returns the new pin when it changed.
pub async fn repin(inner: &Arc<Inner>, goal: &str) -> Result<Option<(String, Option<String>)>> {
    let rec = inner.store(|s| s.goal(goal))?;
    let (Some(ws), Some(base)) = (rec.workspace.clone(), rec.base_commit.clone()) else { return Ok(None) };
    let git = inner.git.clone();
    let snap = tokio::task::spawn_blocking(move || git.snapshot(Path::new(&ws), &base))
        .await
        .map_err(|e| invalid(e.to_string()))??;
    if rec.pin.as_deref() == Some(snap.pin.as_str()) {
        return Ok(None);
    }
    inner.append(
        goal,
        EventKind::Pinned {
            pin: snap.pin.clone(),
            files: snap.stat.files,
            additions: snap.stat.additions,
            deletions: snap.stat.deletions,
        },
    )?;
    Ok(Some((snap.pin, rec.pin)))
}

/// Files the human changed in the workspace since the pause snapshot,
/// recorded as a fact and handed to the agent on resume ("I'll fix it").
async fn human_edits(inner: &Arc<Inner>, goal: &str) -> Result<Vec<String>> {
    let Some((new, Some(old))) = repin(inner, goal).await? else { return Ok(Vec::new()) };
    let rec = inner.store(|s| s.goal(goal))?;
    let Some(ws) = rec.workspace else { return Ok(Vec::new()) };
    let git = inner.git.clone();
    let files = tokio::task::spawn_blocking(move || git.changed_between(Path::new(&ws), &old, &new))
        .await
        .map_err(|e| invalid(e.to_string()))??;
    if !files.is_empty() {
        inner.append(goal, EventKind::HumanEdited { files: files.clone() })?;
    }
    Ok(files)
}

pub async fn abandon(inner: &Arc<Inner>, goal: &str) -> Result<()> {
    if let Some(run) = inner.run_of(goal) {
        stop_engine(inner, &run, Stop::Abandon).await;
    }
    if let Some(c) = inner.verifications.lock().unwrap_or_else(PoisonError::into_inner).remove(goal) {
        c.cancel();
    }
    inner.withdraw(
        goal,
        &[InboxKind::Question, InboxKind::Approval, InboxKind::Assumption, InboxKind::Paused, InboxKind::ReviewReady],
        &tr!(inner.lang(), "目标已放弃", "The goal was abandoned"),
    );
    inner.set_mode(goal, Mode::Idle)?;
    inner.transition(goal, Transition::Abandon, None, "")?;
    schedule(inner).await;
    Ok(())
}

pub async fn steer(inner: &Arc<Inner>, goal: &str, text: &str) -> Result<String> {
    let text = text.trim();
    let lang = inner.lang();
    if text.is_empty() {
        return Err(invalid(tr!(lang, "转向内容不能为空", "The steer cannot be empty")));
    }
    inner.append(goal, EventKind::Steered { text: text.into() })?;
    let Some(run) = inner.run_of(goal) else {
        inner.toast(
            ToastLevel::Info,
            tr!(
                lang,
                "目标没有在运行：这条批注会在下次运行开始时带给 Agent",
                "The goal is not running: the agent gets this note when the next run starts"
            ),
        );
        return Ok("queued_for_next_run".into());
    };
    inner.append(goal, EventKind::Injected { channel: "steer".into(), text: text.into() })?;
    let resp = run.engine.steer(text).await.map_err(Error::from)?;
    Ok(resp.data.get("disposition").and_then(Value::as_str).unwrap_or("queued").to_string())
}

/// Answers an engine dialog previously turned into an inbox item.
pub fn answer_dialog(inner: &Arc<Inner>, goal: &str, ui_id: &str, response: &str) -> Result<()> {
    let run = inner.run_of(goal).ok_or_else(|| {
        invalid(tr!(
            inner.lang(),
            "Agent 已不在运行，这个问题已失效",
            "The agent is no longer running; this question has expired"
        ))
    })?;
    let method = run.flags().dialogs.remove(ui_id).map(|(_, m)| m).unwrap_or_else(|| "input".into());
    let answer = match method.as_str() {
        "confirm" => UiAnswer::Confirmed(
            matches!(Choice::parse(response), Some(Choice::Yes | Choice::Allow)) || response.trim() == "true",
        ),
        _ if response.is_empty() => UiAnswer::Cancelled,
        _ => UiAnswer::Value(response.into()),
    };
    run.engine.answer(ui_id, &answer)?;
    if run.flags().dialogs.is_empty() {
        inner.set_mode(goal, Mode::Thinking)?;
    }
    Ok(())
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
