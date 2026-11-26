//! What the engine says while a run goes on: tool calls, dialogs, cost,
//! anti-probing early stalls, honest blocked exits, settling and exit,
//! turned into facts, cards and state changes.

use tokio::sync::mpsc;
use tower_core::contract::CriterionKind;
use tower_core::honesty::ClaimKind;
use tower_pi::{EngineOutput, PiEvent};

use super::*;
use crate::api::UiUpdate;
use crate::{summarize, verify};

/// Reads the engine's output until it exits. One task per run, so events of
/// one goal are processed strictly in order.
pub(super) async fn pump(inner: Arc<Inner>, run: Arc<Run>, mut rx: mpsc::UnboundedReceiver<EngineOutput>) {
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

pub(super) async fn on_event(inner: &Arc<Inner>, run: &Arc<Run>, e: PiEvent) -> Result<()> {
    let g = run.goal_id.as_str();
    match e {
        PiEvent::AgentStart | PiEvent::TurnStart => {
            // A new turn is a new request: an earlier turn's provider error
            // is no longer why the agent might stop.
            run.flags().last_error = None;
            // Thinking, unless a question is open (it waits on you until answered) or a call is still at work: under
            // the mode's lock, like every write of the mode beside the engine's events (review 20, record only).
            settle_mode(inner, run)?
        }
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
                    let msg = error.map(|e| readable_error(&e)).unwrap_or_else(|| {
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
                    target: target.clone(),
                    denied,
                },
            )?;
            run.flags().last_activity = Some(Instant::now());
            if !is_error && matches!(tool.as_str(), "edit" | "write") {
                run.flags().probe.record_progress(None);
            } else if denied {
                on_sandbox_denial(inner, run, target.clone());
            }
            if let Some(call) = &call {
                let signature = format!("{tool} {}", summarize::tool_call(&tool, &call.args, &run.workspace));
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
                // A call still in flight (the engine ran tools in parallel) keeps the run at work on it.
                settle_mode(inner, run)?;
            }
        }
        PiEvent::TrustGateDenied { engine, trust_level, tool, reason, attempts } => {
            let lang = inner.lang();
            let summary = tr!(
                lang,
                "安全闸门拦截了 {engine}（{trust_level}）对非 Tower 工具 `{tool}` 的调用：{reason}",
                "Trust gate blocked {engine} ({trust_level}) from calling non-Tower tool `{tool}`: {reason}"
            );
            inner.append(
                g,
                EventKind::ToolEnded {
                    call_id: format!("trust-gate-r{}-{attempts}", run.run_no),
                    tool: tool.clone(),
                    is_error: true,
                    summary: summary.clone(),
                    duration_ms: 0,
                    target: Some(format!("{engine}:{tool}")),
                    denied: true,
                },
            )?;
            inner.append(
                g,
                EventKind::SentinelHit {
                    sentinel: "acp_unauthorized_tool".into(),
                    severity: 3,
                    title: tr!(
                        lang,
                        "ACP 引擎尝试调用非 Tower 内置工具",
                        "ACP engine attempted an unauthorized built-in tool"
                    ),
                    detail: summary,
                },
            )?;
            on_sandbox_denial(inner, run, Some(format!("{engine}:{tool}")));
        }
        PiEvent::CompactionStart => report_mode(inner, run, Mode::Compacting)?,
        PiEvent::CompactionEnd => settle_mode(inner, run)?,
        PiEvent::RetryStart { attempt, max_attempts, error } => {
            let error = readable_error(&error);
            report_mode(inner, run, Mode::Retrying)?;
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
        PiEvent::RetryEnd { success } => {
            // A retry that got through leaves no error behind.
            if success {
                run.flags().last_error = None;
            }
            settle_mode(inner, run)?
        }
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
        // The agent's turn is over: a call it never ended is not running any more, and the live line says so.
        PiEvent::AgentEnd { .. } => {
            let _mode = run.lock_mode();
            run.flags().tools.clear();
            inner.store(|s| s.stop_live_line(g))?;
            inner.mark_dirty(g);
        }
        PiEvent::Other { .. } => {}
    }
    Ok(())
}

/// Anti-Probing Early Stall detector: records a sandbox or trust-gate denial
/// and, once the agent accumulates `SANDBOX_PROBE_THRESHOLD` (5) denials
/// without workspace file progress, verifies workspace git state and pauses
/// early instead of wasting a 600s adversarial timeout.
fn on_sandbox_denial(inner: &Arc<Inner>, run: &Arc<Run>, target: Option<String>) {
    let should_check = {
        let mut f = run.flags();
        f.probe.record_denial(target);
        if f.stopping.is_none()
            && !f.submitted
            && f.blocked_report.is_none()
            && f.probe.threshold_reached()
            && !f.probe.check_inflight
        {
            f.probe.check_inflight = true;
            true
        } else {
            false
        }
    };
    if !should_check {
        return;
    }
    let inner = inner.clone();
    let run = run.clone();
    tokio::spawn(async move {
        // Brief grace window so a legitimate run that wrote files right after
        // probing and immediately called `submit` settles cleanly.
        tokio::time::sleep(SANDBOX_PROBE_GRACE).await;
        let snapshot_info = {
            let mut f = run.flags();
            if f.stopping.is_some() || f.submitted || f.blocked_report.is_some() || !f.probe.threshold_reached() {
                f.probe.check_inflight = false;
                return;
            }
            (f.probe.denials_since_progress, f.probe.recent_targets.clone(), f.probe.last_progress_pin.clone())
        };
        let (denials, recent_targets, last_pin) = snapshot_info;
        let g = run.goal_id.clone();

        // Confirm against git whether any workspace file changed since the last
        // progress checkpoint (catches edits made via `bash` too, not only `edit`/`write`).
        if let Ok(rec) = inner.store(|s| s.goal(&g))
            && let (Some(ws), Some(base)) = (rec.workspace.clone(), rec.base_commit.clone())
        {
            let git = inner.git.clone();
            let current_pin =
                tokio::task::spawn_blocking(move || git.snapshot(Path::new(&ws), &base).ok().map(|s| s.pin))
                    .await
                    .ok()
                    .flatten();
            if let Some(pin) = current_pin
                && last_pin.as_deref() != Some(pin.as_str())
            {
                let mut f = run.flags();
                f.probe.record_progress(Some(pin));
                f.probe.check_inflight = false;
                return;
            }
        }

        // Re-check before pausing: still no submission, still active.
        {
            let mut f = run.flags();
            f.probe.check_inflight = false;
            if f.stopping.is_some() || f.submitted || f.blocked_report.is_some() || !f.probe.threshold_reached() {
                return;
            }
        }
        let lang = inner.lang();
        let sample =
            if recent_targets.is_empty() { String::new() } else { format!(" ({})", recent_targets.join(", ")) };
        let detail = tr!(
            lang,
            "持续探测沙箱边界，无实质进展：连续触发 {denials} 次沙箱拒绝且工作区无文件改动{sample}。已提前暂停交由你决定。",
            "Repeated sandbox probing without workspace progress: {denials} sandbox denials with no workspace file changes{sample}. Paused early for your guidance."
        );
        let _ = inner.append(&g, EventKind::Stalled { detector: "sandbox_probing".into(), detail: detail.clone() });
        let r = pause(&inner, &g, SANDBOX_PROBE_PAUSE_REASON, &detail).await;
        report(&inner, &g, r).await;
    });
}

pub(super) fn on_tool_start(
    inner: &Arc<Inner>,
    run: &Arc<Run>,
    call_id: String,
    tool: String,
    args: Value,
) -> Result<()> {
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
            let payload = parse_submit_args(&args);
            if payload.outcome == SubmitOutcome::Blocked {
                let reason = payload.blocker_reason.unwrap_or_else(|| payload.summary.clone());
                let claim_text = if payload.summary.is_empty() || payload.summary == reason {
                    format!("[blocked] {reason}")
                } else {
                    format!("[blocked] {reason} — {}", payload.summary)
                };
                inner
                    .append(g, EventKind::AgentBlocked { reason: reason.clone(), evidence: payload.summary.clone() })?;
                inner.append(
                    g,
                    EventKind::Claim {
                        claim_id: claim_id.clone(),
                        claim: ClaimKind::Cause,
                        text: claim_text,
                        criterion: None,
                    },
                )?;
                run.flags().blocked_report = Some(BlockedReport { summary: payload.summary, blocker_reason: reason });
            } else {
                inner.append(g, EventKind::Submitted { summary: payload.summary })?;
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
        }
        _ => {}
    }
    // Recorded whole under the mode lock: a settle from beside these events never lands between the start and the
    // call's entry among the calls in flight (see `Run::lock_mode`).
    let _mode = run.lock_mode();
    let at = inner
        .append(
            g,
            EventKind::ToolStarted {
                call_id: call_id.clone(),
                tool: tool.clone(),
                summary: summarize::tool_call(&tool, &args, &run.workspace),
            },
        )?
        .at;
    // A note and the hand-in are not work; a call that starts while a question is open leaves the run waiting on you,
    // and one that starts once the run is stopping leaves the stop's mode.
    let quiet = {
        let f = run.flags();
        f.dialogs.is_empty() && f.stopping.is_none()
    };
    if tool != "log" && tool != "submit" && quiet {
        inner.set_mode(g, Mode::for_tool(&tool))?;
    }
    between(run, "call-recording");
    run.flags().tools.insert(call_id, ToolCall { tool, args, started: Instant::now(), at });
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
        f.stopping.is_none()
            && !f.submitted
            && f.blocked_report.is_none()
            && !std::mem::replace(&mut f.over_budget, true)
    };
    if let Some(reason) = reason
        && first
    {
        let inner = inner.clone();
        let g = g.to_string();
        let detail = tower_core::i18n::PauseNote::Spent { cents: (cost * 100.0).round() as u64 }.encode();
        tokio::spawn(async move {
            let r = pause(&inner, &g, reason, &detail).await;
            report(&inner, &g, r).await;
        });
    }
    Ok(())
}

/// The run is stopping, settled: under the mode's lock, so a settle already under way lands before it, and none after.
fn settle_on(inner: &Inner, run: &Run, why: Stop) -> Result<()> {
    let _mode = run.lock_mode();
    run.flags().stopping = Some(why);
    inner.set_mode(&run.goal_id, Mode::Settled)
}

async fn on_settled(inner: &Arc<Inner>, run: &Arc<Run>) -> Result<()> {
    let g = run.goal_id.clone();
    let (stopping, submitted, blocked_report, nudged, last_error) = {
        let f = run.flags();
        (f.stopping, f.submitted, f.blocked_report.clone(), f.nudged, f.last_error.clone())
    };
    if stopping.is_some() {
        return Ok(());
    }
    if let Some(blocked) = blocked_report {
        settle_on(inner, run, Stop::Pause(AGENT_REPORTED_BLOCKED_PAUSE_REASON))?;
        let inner = inner.clone();
        let run = run.clone();
        tokio::spawn(async move {
            run.engine.shutdown(Duration::from_secs(5)).await;
            let r = finish_blocked(&inner, &run, &blocked).await;
            report(&inner, &run.goal_id, r).await;
        });
        return Ok(());
    }
    if submitted {
        settle_on(inner, run, Stop::Submitted)?;
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
    let detail = tower_core::i18n::PauseNote::NoSubmitAfterReminder.encode();
    tokio::spawn(async move {
        let r = pause(&inner, &g, PauseReason::IdleWithoutSubmit, &detail).await;
        report(&inner, &g, r).await;
    });
    Ok(())
}

async fn finish_blocked(inner: &Arc<Inner>, run: &Arc<Run>, blocked: &BlockedReport) -> Result<()> {
    let g = run.goal_id.as_str();
    remove_run(inner, run);
    inner.append(g, EventKind::RunEnded { run_no: run.run_no, outcome: "blocked".into() })?;
    let _ = repin(inner, g).await;
    let detail = format_blocked_detail(blocked, inner.lang());
    pause_after_stop(inner, g, AGENT_REPORTED_BLOCKED_PAUSE_REASON, &detail)?;
    schedule(inner).await;
    Ok(())
}

pub(crate) fn format_blocked_detail(blocked: &BlockedReport, lang: tower_core::Lang) -> String {
    let reason = blocked.blocker_reason.trim();
    let summary = blocked.summary.trim();
    if summary.is_empty() || summary == reason {
        tr!(lang, "Agent 主动上报阻塞（声明）：{reason}", "Agent reported blocked (claim): {reason}")
    } else {
        tr!(
            lang,
            "Agent 主动上报阻塞（声明）：{reason}\n\n{summary}",
            "Agent reported blocked (claim): {reason}\n\n{summary}"
        )
    }
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
    // Every end of a run comes through here (stopped, submitted, blocked,
    // crashed): a profile rewrite already under way finishes before the end
    // releases the goal's ports and folders, and none starts after it
    // (jail::follow_agent_listeners checks the run is still current under
    // the same lock).
    drop(run.profile.lock().unwrap_or_else(PoisonError::into_inner));
    inner.update_keep_awake();
    // Nothing the agent started outlives its run (submitted, paused,
    // abandoned or crashed): a server or watcher it left in the background
    // would keep running agent code while nobody watches.
    let n = crate::procs::stop_agent_leftovers(&inner.paths, &run.goal_id);
    if n > 0 {
        let text = tr!(
            inner.lang(),
            "运行结束时，Tower 停止了 Agent 留在后台的 {n} 个进程",
            "When the run ended, Tower stopped {n} process(es) the agent left running in the background"
        );
        let _ = inner.append(&run.goal_id, EventKind::Note { text });
    }
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

/// A provider's error as a sentence: an HTML error page (a proxy's or a
/// gateway's 429 or 502) becomes its status and title, never markup.
pub(crate) fn readable_error(raw: &str) -> String {
    let lower = raw.to_ascii_lowercase();
    if !(lower.contains("<html") || lower.contains("<!doctype") || lower.contains("<body")) {
        return raw.chars().take(600).collect();
    }
    let title = lower
        .find("<title>")
        .and_then(|s| lower[s + 7..].find("</title>").map(|e| raw[s + 7..s + 7 + e].trim().to_string()))
        .filter(|t| !t.is_empty());
    let status = raw
        .split(|c: char| !c.is_ascii_digit())
        .find(|w| w.len() == 3 && matches!(w.as_bytes()[0], b'4' | b'5'))
        .map(str::to_string);
    // Whatever text is left outside the tags, briefly.
    let mut text = String::new();
    let mut in_tag = false;
    for c in raw.chars() {
        match c {
            '<' => in_tag = true,
            '>' => in_tag = false,
            _ if !in_tag => text.push(c),
            _ => {}
        }
    }
    let text: String = text.split_whitespace().collect::<Vec<_>>().join(" ").chars().take(160).collect();
    match (status, title) {
        (Some(s), Some(t)) if t.contains(&s) => format!("The model provider answered {t}"),
        (Some(s), Some(t)) => format!("The model provider answered {s} ({t})"),
        (Some(s), None) => format!("The model provider answered {s}"),
        (None, Some(t)) => format!("The model provider answered: {t}"),
        (None, None) => format!("The model provider answered with an error page: {text}"),
    }
}

#[cfg(test)]
mod tests {
    use super::{BlockedReport, format_blocked_detail, readable_error, same_command};

    #[test]
    fn provider_error_pages_become_sentences() {
        let page = "<!DOCTYPE html><html><head><title>429 Too Many Requests</title></head><body><h1>429 Too Many Requests</h1><hr><center>nginx</center></body></html>";
        assert_eq!(readable_error(page), "The model provider answered 429 Too Many Requests");
        assert_eq!(readable_error("502 <html><body>Bad gateway</body></html>"), "The model provider answered 502");
        assert_eq!(readable_error("rate limited, retry in 20s"), "rate limited, retry in 20s");
    }

    #[test]
    fn only_the_exact_criterion_command_is_an_observation() {
        assert!(same_command("npm test", "npm test"));
        assert!(same_command("cd /w/G-1 && npm  test", "npm test"));
        assert!(!same_command("npm test | tail -5", "npm test"), "a pipe hides the exit status");
        assert!(!same_command("npm test || true", "npm test"));
        assert!(!same_command("npm test -- --grep cart", "npm test"));
    }

    #[test]
    fn blocked_detail_preserves_claim_register_in_both_languages() {
        let r = BlockedReport {
            summary: "Lockfile cannot be modified".into(),
            blocker_reason: "C1 needs zod but package.json is read-only".into(),
        };
        assert!(format_blocked_detail(&r, tower_core::Lang::En).contains("(claim)"));
        assert!(format_blocked_detail(&r, tower_core::Lang::Zh).contains("（声明）"));
    }
}
