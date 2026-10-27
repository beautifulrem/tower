//! What the engine says while a run goes on: tool calls, dialogs, cost,
//! settling and exit, turned into facts, cards and state changes.

use tokio::sync::mpsc;
use tower_core::contract::CriterionKind;
use tower_core::honesty::ClaimKind;
use tower_pi::{EngineOutput, PiEvent, UiRequest};

use super::*;
use crate::api::{ToastLevel, UiUpdate};
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
            let error = readable_error(&error);
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
    use super::{readable_error, same_command};

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
}
