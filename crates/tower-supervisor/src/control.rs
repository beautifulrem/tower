//! The human's and Tower's controls over a goal outside the engine's event
//! stream: pausing, resuming, abandoning, steering, and reporting failures
//! of background work.

use std::path::Path;
use std::sync::{Arc, PoisonError};

use serde_json::Value;
use tower_core::i18n::{Choice, pause_label, state_label};
use tower_core::lifecycle::Transition;
use tower_core::view::InboxKind;
use tower_core::{EventKind, Lang, LifecycleState, Mode, PauseReason, tr};
use tower_pi::UiAnswer;
use tower_store::NewInboxItem;

use crate::api::ToastLevel;
use crate::run::{Stop, human_notes_since_last_run, schedule, start_run, stop_engine};
use crate::{Error, Inner, Result, actions, invalid, prompts, verify};

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
    // The trace keeps the words of the moment; the card is worded on read.
    let note = tower_core::i18n::PauseNote::render(detail, lang);
    inner.transition(goal, Transition::Pause { reason }, None, &note)?;
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
        subject: why.into(),
        body: detail.into(),
        options: Choice::labels(&actions::pause_options(reason, rec), lang),
        // A held-out failure is answered with a hint in your own words.
        allow_text: allow_text || reason == PauseReason::HeldOutFailed,
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
    inner.toast(goal, ToastLevel::Error, detail.clone());
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
        verify::spawn_asked(inner.clone(), goal.into());
        return Ok(());
    }
    let edits = human_edits(inner, goal).await.unwrap_or_default();
    // The prompt is for the agent, so the reason is in English.
    let message = prompts::resume(pause_label(reason, Lang::En), &human_notes_since_last_run(inner, goal), &edits);
    if inner.running_count() >= inner.settings().max_concurrent as usize {
        inner.transition(goal, Transition::Resume, None, &tr!(lang, "等待执行槽位", "Waiting for a free slot"))?;
        return Ok(());
    }
    // Tower quitting is not a new attempt: the same run continues.
    let purpose = if reason == PauseReason::AppQuit { "continue" } else { "resume" };
    start_run(inner, goal, purpose, message).await
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
            goal,
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
