//! Engine runs: starting, observing, steering and stopping one goal's Pi.

use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};

use serde_json::Value;
use tokio::sync::mpsc;
use tower_core::contract::CriterionKind;
use tower_core::honesty::ClaimKind;
use tower_core::lifecycle::Transition;
use tower_core::view::InboxKind;
use tower_core::{EventKind, LifecycleState, Mode, PauseReason};
use tower_pi::{Engine, EngineConfig, EngineOutput, PiEvent, UiAnswer, UiRequest};
use tower_store::NewInboxItem;

use crate::api::{ToastLevel, UiUpdate};
use crate::paths::real;
use crate::{Error, Inner, Result, actions, invalid, prompts, sandbox, summarize, verify};

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
    submitted: bool,
    nudged: bool,
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
    pub engine: Engine,
    pub workspace: String,
    pub flags: Mutex<Flags>,
}

impl Run {
    pub fn flags(&self) -> std::sync::MutexGuard<'_, Flags> {
        self.flags.lock().expect("flags lock")
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
            ("resume", prompts::resume("等待执行槽位", &human_notes_since_last_run(inner, &g.id)))
        };
        if let Err(e) = start_run(inner, &g.id, purpose, message).await {
            tracing::warn!(goal = %g.id, error = %e, "could not start run");
        }
    }
}

/// Human steering recorded while no engine was running, to carry into the
/// next run's first message.
fn human_notes_since_last_run(inner: &Inner, goal: &str) -> Vec<String> {
    let since = inner
        .store(|s| s.last_event(goal, "run_started"))
        .ok()
        .flatten()
        .map(|e| e.at)
        .unwrap_or(0);
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

fn engine_config(inner: &Inner, goal: &tower_store::GoalRecord, ws: &Path) -> Result<EngineConfig> {
    let program = inner.pi_program().ok_or_else(|| invalid("没有找到 pi，请在设置中指定路径"))?;
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
        ("PI_OFFLINE".into(), "1".into()),
    ]);
    if sandbox::available() {
        let home = inner.env.get("HOME").map(PathBuf::from).unwrap_or_else(|| PathBuf::from("/"));
        let profile = goal_dir.join("sandbox.sb");
        std::fs::write(&profile, sandbox::profile(&ws_real, &tmp_real, &real(&home)))?;
        env.push(("TOWER_SANDBOX_PROFILE".into(), profile.display().to_string()));
    }
    let model = Some(goal.contract.model.clone()).filter(|m| !m.is_empty()).or_else(|| {
        Some(settings.default_model.clone()).filter(|m| !m.is_empty())
    });
    let thinking = Some(goal.contract.thinking.clone()).filter(|m| !m.is_empty()).or_else(|| {
        Some(settings.default_thinking.clone()).filter(|m| !m.is_empty())
    });
    Ok(EngineConfig {
        program,
        cwd: ws.to_path_buf(),
        session_dir: inner.paths.sessions(&goal.id),
        resume_session: goal.session_file.as_ref().map(PathBuf::from).filter(|p| p.exists()),
        extensions: vec![inner.paths.extension_dir().join("index.ts")],
        load_user_extensions: settings.load_user_extensions,
        model,
        thinking,
        append_system_prompt: Some(prompts::system_section(&goal.id)),
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
    if inner.run_of(goal_id).is_some() {
        return Err(invalid("这个目标已经在运行"));
    }
    let mut goal = inner.store(|s| s.goal(goal_id))?;

    if goal.workspace.is_none() {
        inner.set_mode(goal_id, Mode::Starting)?;
        let ws = inner.paths.workspace(goal_id);
        let git = inner.git.clone();
        let (root, branch, ws2, id) = (PathBuf::from(&goal.project_root), goal.base_branch.clone(), ws.clone(), goal.id.clone());
        let prepared = tokio::task::spawn_blocking(move || git.prepare_workspace(&root, &branch, &ws2, &id))
            .await
            .map_err(|e| invalid(e.to_string()))?;
        match prepared {
            Ok(base) => {
                inner.append(
                    goal_id,
                    EventKind::WorkspacePrepared { workspace: ws.display().to_string(), base_commit: base },
                )?;
                goal = inner.store(|s| s.goal(goal_id))?;
            }
            Err(e) => {
                fail_to_start(inner, goal_id, &format!("准备工作区失败：{e}"))?;
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
            fail_to_start(inner, goal_id, &format!("启动 pi 失败：{e}"))?;
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
        engine,
        workspace: real(&ws).display().to_string(),
        flags: Mutex::default(),
    });
    inner.runs.lock().expect("runs lock").insert(goal_id.into(), run.clone());
    tokio::spawn(pump(inner.clone(), run.clone(), rx));

    if let Ok(state) = run.engine.state().await
        && let Some(file) = state.get("sessionFile").and_then(Value::as_str)
            && goal.session_file.as_deref() != Some(file) {
                inner.append(goal_id, EventKind::SessionAttached { session_file: file.into() })?;
            }
    inner.append(goal_id, EventKind::Injected { channel: "prompt".into(), text: message.clone() })?;
    if let Err(e) = run.engine.prompt(&message).await {
        stop_engine(inner, &run, Stop::Pause(PauseReason::PrepareFailed)).await;
        pause_after_stop(inner, goal_id, PauseReason::PrepareFailed, &format!("发送开场消息失败：{e}"))?;
        return Err(e.into());
    }
    inner.set_mode(goal_id, Mode::Thinking)?;
    Ok(())
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
                .append(&run.goal_id, EventKind::EngineError { message: format!("无法解析 pi 的输出：{line}") })
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
                    let msg = error.unwrap_or_else(|| "模型服务返回错误".into());
                    run.flags().last_error = Some(msg.clone());
                    inner.append(g, EventKind::EngineError { message: msg })?;
                }
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
            inner.append(g, EventKind::Note { text: format!("模型服务出错，第 {attempt}/{max_attempts} 次重试：{error}") })?;
        }
        PiEvent::RetryEnd { .. } => inner.set_mode(g, Mode::Thinking)?,
        PiEvent::TurnEnd => on_turn_end(inner, run).await?,
        PiEvent::UiRequest(req) => on_ui_request(inner, run, req)?,
        PiEvent::ExtensionError { extension, event, error } => {
            inner.append(g, EventKind::EngineError { message: format!("扩展错误（{event}，{extension}）：{error}") })?;
        }
        PiEvent::AgentSettled { .. } => on_settled(inner, run).await?,
        PiEvent::AgentEnd { .. } | PiEvent::Other { .. } => {}
    }
    Ok(())
}

fn on_tool_start(inner: &Arc<Inner>, run: &Arc<Run>, call_id: String, tool: String, args: Value) -> Result<()> {
    let g = run.goal_id.as_str();
    let s = |k: &str| args.get(k).and_then(Value::as_str).unwrap_or_default().to_string();
    match tool.as_str() {
        "log" => {
            let kind = ClaimKind::parse(&s("kind")).unwrap_or(ClaimKind::Progress);
            let text = s("text");
            inner.append(g, EventKind::Claim { claim_id: call_id.clone(), claim: kind, text: text.clone(), criterion: None })?;
            if kind.needs_approval() {
                inner.open_inbox(NewInboxItem {
                    goal_id: g.into(),
                    kind: InboxKind::Assumption,
                    title: "Agent 的假设待你确认".into(),
                    body: text,
                    options: vec![actions::APPROVE.into(), actions::REJECT.into()],
                    allow_text: true,
                    urgency: 4,
                    engine_ref: Some(call_id.clone()),
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
                                claim_id: format!("{call_id}/{id}"),
                                claim: ClaimKind::CriterionMet,
                                text: if evidence.is_empty() { format!("{id} 已满足") } else { evidence.to_string() },
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
        EventKind::ToolStarted { call_id: call_id.clone(), tool: tool.clone(), summary: summarize::tool_call(&tool, &args, &run.workspace) },
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
            && !crit.trim().is_empty() && command.contains(crit.trim()) {
                inner.append(goal, EventKind::Observed { criterion: c.id.clone(), passed })?;
            }
    }
    Ok(())
}

async fn on_turn_end(inner: &Arc<Inner>, run: &Arc<Run>) -> Result<()> {
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
    if let Some(reason) = reason
        && run.flags().stopping.is_none() && !run.flags().submitted {
            let inner = inner.clone();
            let g = g.to_string();
            tokio::spawn(async move {
                let _ = pause(&inner, &g, reason, &format!("已花费 ${cost:.2}")).await;
            });
        }
    Ok(())
}

fn on_ui_request(inner: &Arc<Inner>, run: &Arc<Run>, req: UiRequest) -> Result<()> {
    let g = run.goal_id.as_str();
    if !req.is_dialog() {
        if req.method == "notify"
            && let Some(m) = req.message.filter(|m| !m.is_empty()) {
                inner.append(g, EventKind::Note { text: m })?;
            }
        return Ok(());
    }
    let title = req.title.clone().unwrap_or_default();
    let item = match title.strip_prefix("tower:").and_then(|j| serde_json::from_str::<Value>(j).ok()) {
        Some(p) if p.get("tower").and_then(Value::as_str) == Some("approval") => {
            let s = |k: &str| p.get(k).and_then(Value::as_str).unwrap_or_default().to_string();
            NewInboxItem {
                goal_id: g.into(),
                kind: InboxKind::Approval,
                title: format!("需要你批准：{}", s("reason")),
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
            title: if title.is_empty() { "扩展请求你的输入".into() } else { title },
            body: req.message.clone().unwrap_or_default(),
            options: if req.method == "confirm" { vec!["是".into(), "否".into()] } else { req.options.clone() },
            allow_text: matches!(req.method.as_str(), "input" | "editor"),
            urgency: 1,
            engine_ref: Some(req.id.clone()),
        },
    };
    let opened = inner.open_inbox(item)?;
    run.flags().dialogs.insert(req.id, (opened.id, req.method));
    inner.set_mode(g, Mode::WaitingOnYou)?;
    inner.toast(ToastLevel::Warning, format!("{} 需要你：{}", g, opened.title));
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
            let _ = finish_submitted(&inner, &run).await;
        });
        return Ok(());
    }
    if let Some(err) = last_error {
        let inner = inner.clone();
        tokio::spawn(async move {
            let _ = pause(&inner, &g, PauseReason::ProviderError, &err).await;
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
    tokio::spawn(async move {
        let _ = pause(&inner, &g, PauseReason::IdleWithoutSubmit, "提醒过一次后仍未提交").await;
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
    let detail = format!(
        "pi 意外退出（{}）{}",
        code.map(|c| format!("退出码 {c}")).unwrap_or_else(|| "被信号终止".into()),
        if tail.is_empty() { String::new() } else { format!("\n{tail}") }
    );
    let _ = inner.append(g, EventKind::RunEnded { run_no: run.run_no, outcome: "crashed".into() });
    let _ = inner.append(g, EventKind::EngineError { message: detail.clone() });
    let _ = pause_after_stop(inner, g, PauseReason::EngineCrash, &detail);
    schedule(inner).await;
}

fn remove_run(inner: &Inner, run: &Run) {
    let mut runs = inner.runs.lock().expect("runs lock");
    if runs.get(&run.goal_id).is_some_and(|r| r.run_no == run.run_no) {
        runs.remove(&run.goal_id);
    }
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
    inner.withdraw(goal, &[InboxKind::Question, InboxKind::Approval], "运行已停止");
    inner.set_mode(goal, Mode::Idle)?;
    inner.transition(goal, Transition::Pause { reason }, None, detail)?;
    if reason.needs_human() {
        let rec = inner.store(|s| s.goal(goal))?;
        inner.open_inbox(NewInboxItem {
            goal_id: goal.into(),
            kind: InboxKind::Paused,
            title: format!("已暂停：{}", tower_core::briefing::pause_label(reason)),
            body: detail.into(),
            options: actions::pause_options(reason, &rec).iter().map(|s| s.to_string()).collect(),
            allow_text: matches!(reason, PauseReason::IdleWithoutSubmit),
            urgency: 2,
            engine_ref: None,
        })?;
    }
    Ok(())
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
        return Err(invalid(format!("{}状态下不能暂停", tower_core::briefing::state_label(rec.state))));
    }
    if let Some(run) = inner.run_of(goal) {
        stop_engine(inner, &run, Stop::Pause(reason)).await;
    }
    if let Some(c) = inner.verifications.lock().expect("verify lock").remove(goal) {
        c.cancel();
    }
    pause_after_stop(inner, goal, reason, detail)?;
    schedule(inner).await;
    Ok(())
}

/// Continues a paused goal. Each pause reason has one way out
/// (`docs/03` §3.2.1); this is the default "continue" for all of them.
pub async fn resume(inner: &Arc<Inner>, goal: &str) -> Result<()> {
    let rec = inner.store(|s| s.goal(goal))?;
    if rec.state != LifecycleState::Paused {
        return Err(invalid("只有已暂停的目标可以继续"));
    }
    inner.withdraw(goal, &[InboxKind::Paused], "已继续");
    let reason = rec.pause_reason.unwrap_or(PauseReason::Human);
    if reason == PauseReason::VerifyEnvError {
        verify::spawn(inner.clone(), goal.into());
        return Ok(());
    }
    let message = prompts::resume(tower_core::briefing::pause_label(reason), &human_notes_since_last_run(inner, goal));
    if inner.running_count() >= inner.settings().max_concurrent as usize {
        inner.transition(goal, Transition::Resume, None, "等待执行槽位")?;
        return Ok(());
    }
    start_run(inner, goal, "resume", message).await
}

pub async fn abandon(inner: &Arc<Inner>, goal: &str) -> Result<()> {
    if let Some(run) = inner.run_of(goal) {
        stop_engine(inner, &run, Stop::Abandon).await;
    }
    if let Some(c) = inner.verifications.lock().expect("verify lock").remove(goal) {
        c.cancel();
    }
    inner.withdraw(
        goal,
        &[InboxKind::Question, InboxKind::Approval, InboxKind::Assumption, InboxKind::Paused, InboxKind::ReviewReady],
        "目标已放弃",
    );
    inner.set_mode(goal, Mode::Idle)?;
    inner.transition(goal, Transition::Abandon, None, "")?;
    schedule(inner).await;
    Ok(())
}

pub async fn steer(inner: &Arc<Inner>, goal: &str, text: &str) -> Result<String> {
    let text = text.trim();
    if text.is_empty() {
        return Err(invalid("转向内容不能为空"));
    }
    inner.append(goal, EventKind::Steered { text: text.into() })?;
    let Some(run) = inner.run_of(goal) else {
        inner.toast(ToastLevel::Info, "目标没有在运行：这条批注会在下次运行开始时带给 Agent");
        return Ok("queued_for_next_run".into());
    };
    inner.append(goal, EventKind::Injected { channel: "steer".into(), text: text.into() })?;
    let resp = run.engine.steer(text).await.map_err(Error::from)?;
    Ok(resp.data.get("disposition").and_then(Value::as_str).unwrap_or("queued").to_string())
}

/// Answers an engine dialog previously turned into an inbox item.
pub fn answer_dialog(inner: &Arc<Inner>, goal: &str, ui_id: &str, response: &str) -> Result<()> {
    let run = inner.run_of(goal).ok_or_else(|| invalid("Agent 已不在运行，这个问题已失效"))?;
    let method = run.flags().dialogs.remove(ui_id).map(|(_, m)| m).unwrap_or_else(|| "input".into());
    let answer = match method.as_str() {
        "confirm" => UiAnswer::Confirmed(matches!(response, "是" | "允许" | "yes" | "true")),
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
