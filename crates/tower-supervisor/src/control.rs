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
use crate::inner::Unclaimed;
use crate::run::{Starting, Stop, already_starting, human_notes_since_last_run, schedule, start_claimed, stop_engine};
use crate::{Error, Inner, Result, actions, invalid, prompts, verify};

/// Moves a goal whose engine is not running into `paused`, and raises a
/// Needs-You item when leaving the pause needs a decision. A goal already
/// paused stays as it is: a pause you made stands.
pub fn pause_after_stop(inner: &Arc<Inner>, goal: &str, reason: PauseReason, detail: &str) -> Result<()> {
    record_pause(inner, goal, reason, detail, false)
}

/// A start that failed. Recorded even when the goal was already paused (a
/// retry from its card, a continue at launch): the pause then carries the
/// new failure, and there is a card to answer.
pub fn pause_failed_start(inner: &Arc<Inner>, goal: &str, reason: PauseReason, detail: &str) -> Result<()> {
    record_pause(inner, goal, reason, detail, true)
}

fn record_pause(inner: &Arc<Inner>, goal: &str, reason: PauseReason, detail: &str, again: bool) -> Result<()> {
    let rec = inner.store(|s| s.goal(goal))?;
    let lang = inner.lang();
    let mut withdraw = Vec::new();
    if rec.state == LifecycleState::Paused {
        if !again {
            return Ok(());
        }
        // A card still open is for the earlier reason.
        withdraw.push((&[InboxKind::Paused][..], tr!(lang, "又暂停了一次", "Paused again")));
    }
    withdraw.push((&[InboxKind::Question, InboxKind::Approval][..], tr!(lang, "运行已停止", "The run stopped")));
    // The trace keeps the words of the moment; the card is worded on read.
    let note = tower_core::i18n::PauseNote::render(detail, lang);
    let item = reason.needs_human().then(|| {
        let allow_text = matches!(reason, PauseReason::IdleWithoutSubmit | PauseReason::AgentReportedBlocked);
        paused_item(&rec, reason, detail, lang, allow_text)
    });
    settle(inner, goal, &withdraw, Transition::Pause { reason }, &note, item)?;
    if reason == PauseReason::AgentReportedBlocked {
        let _ = crate::learning::record_calibration(inner, goal);
    }
    Ok(())
}

/// Withdraws a goal's cards, idles it, applies the transition and opens
/// the card it raises, in one store transaction: a transition the
/// lifecycle refuses leaves the cards and the mode as they were, and no one
/// (the interface, the phone page) sees half of it.
pub(crate) fn settle(
    inner: &Inner,
    goal: &str,
    withdraw: &[(&[InboxKind], String)],
    t: Transition,
    note: &str,
    item: Option<NewInboxItem>,
) -> Result<()> {
    let (entries, withdrawn, opened) = inner.store(|s| {
        s.atomically(|s| {
            let mut withdrawn = 0;
            for (kinds, why) in withdraw {
                withdrawn += s.withdraw_inbox(goal, kinds, why)?;
            }
            let mut entries = Vec::new();
            if s.goal(goal)?.mode != Mode::Idle {
                entries.push(s.append(goal, EventKind::ModeChanged { mode: Mode::Idle })?);
            }
            entries.push(s.transition(goal, t, None, note)?);
            Ok((entries, withdrawn, item.map(|i| s.open_inbox(i)).transpose()?))
        })
    })?;
    inner.traces.lock().unwrap_or_else(PoisonError::into_inner).extend(entries);
    inner.flush_traces();
    inner.emit_goal_now(goal);
    if withdrawn > 0 || opened.is_some() {
        inner.emit_inbox();
    }
    if let Some(opened) = opened {
        inner.push(&opened);
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
        // A held-out failure or blocked report is answered with a hint in your own words.
        allow_text: allow_text || matches!(reason, PauseReason::HeldOutFailed | PauseReason::AgentReportedBlocked),
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
    // A start that began its run just before this pause was recorded.
    if let Some(run) = inner.run_of(goal) {
        stop_engine(inner, &run, Stop::Pause(reason)).await;
    }
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
    // The slot is claimed in the same step as the check, so a start the
    // scheduler makes meanwhile cannot take it too.
    let starting = match Starting::claim(inner, goal, Some(inner.settings().max_concurrent as usize)) {
        Ok(s) => s,
        Err(Unclaimed::Full) => {
            inner.transition(goal, Transition::Resume, None, &tr!(lang, "等待执行槽位", "Waiting for a free slot"))?;
            return Ok(());
        }
        Err(Unclaimed::Starting) => return Err(already_starting(inner)),
    };
    // Tower quitting is not a new attempt: the same run continues.
    let purpose = if reason == PauseReason::AppQuit { "continue" } else { "resume" };
    start_claimed(inner, goal, purpose, message, starting).await
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
    let cards =
        [InboxKind::Question, InboxKind::Approval, InboxKind::Assumption, InboxKind::Paused, InboxKind::ReviewReady];
    let why = tr!(inner.lang(), "目标已放弃", "The goal was abandoned");
    settle(inner, goal, &[(&cards[..], why)], Transition::Abandon, "", None)?;
    // A start that began its run just before the goal was abandoned.
    if let Some(run) = inner.run_of(goal) {
        stop_engine(inner, &run, Stop::Abandon).await;
    }
    let _ = crate::ports_pool::release_for_root(&inner.paths.root, goal);
    let _ = crate::learning::record_calibration(inner, goal);
    schedule(inner).await;
    Ok(())
}

pub async fn steer(inner: &Arc<Inner>, goal: &str, text: &str) -> Result<String> {
    steer_with_queue(inner, goal, text, false).await
}

/// Sends a steering directive to a goal. When `queue` is `true`, queues the
/// directive for the next turn (via `follow_up` when running) without
/// interrupting an in-flight tool turn.
pub async fn steer_with_queue(inner: &Arc<Inner>, goal: &str, text: &str, queue: bool) -> Result<String> {
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
    if queue {
        inner.append(goal, EventKind::Injected { channel: "follow_up".into(), text: text.into() })?;
        let resp = run.engine.follow_up(text).await.map_err(Error::from)?;
        return Ok(resp.data.get("disposition").and_then(Value::as_str).unwrap_or("queued_for_next_turn").to_string());
    }
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
        // Answered: back to the call still at work, if one runs beside the question (review 17), else thinking.
        crate::run::settle_mode(inner, &run)?;
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use tower_core::contract::Contract;
    use tower_store::NewGoal;

    use super::*;
    use crate::schedule::tests::supervisor;

    /// A goal with an open question and an agent mode, after `before` moved
    /// it through the lifecycle.
    fn thinking_goal_with_a_question(inner: &Inner, project: &str, before: &[Transition]) -> String {
        inner
            .store(|s| {
                let contract = Contract::quick("x", Some("true".into()), Lang::En);
                let g = s.create_goal(NewGoal { project_id: project.into(), title: "x".into(), contract })?.id;
                for t in before {
                    s.transition(&g, *t, None, "")?;
                }
                s.append(&g, EventKind::ModeChanged { mode: Mode::Thinking })?;
                s.open_inbox(NewInboxItem {
                    goal_id: g.clone(),
                    kind: InboxKind::Question,
                    title: "Which id?".into(),
                    subject: String::new(),
                    body: String::new(),
                    options: Vec::new(),
                    allow_text: true,
                    urgency: 2,
                    engine_ref: None,
                })?;
                Ok(g)
            })
            .unwrap()
    }

    /// What a refused step must leave as it was.
    fn state(inner: &Inner, goal: &str) -> (Mode, usize, usize) {
        inner
            .read_store(|s| {
                let open = s.open_inbox_items()?.iter().filter(|i| i.goal_id == goal).count();
                Ok((s.goal(goal)?.mode, open, s.trace(goal, None, 1000)?.len()))
            })
            .unwrap()
    }

    #[tokio::test]
    async fn an_abandon_the_lifecycle_refuses_changes_nothing() {
        let tmp = tempfile::tempdir().unwrap();
        let (sup, pid) = supervisor(&tmp).await;
        let g = thinking_goal_with_a_question(&sup.inner, &pid, &[Transition::Abandon]);
        let before = state(&sup.inner, &g);

        assert!(abandon(&sup.inner, &g).await.is_err());

        assert_eq!(state(&sup.inner, &g), before, "(mode, open cards, trace length)");
    }

    #[tokio::test]
    async fn a_pause_the_lifecycle_refuses_changes_nothing() {
        let tmp = tempfile::tempdir().unwrap();
        let (sup, pid) = supervisor(&tmp).await;
        // A draft cannot pause.
        let g = thinking_goal_with_a_question(&sup.inner, &pid, &[]);
        let before = state(&sup.inner, &g);

        assert!(pause_failed_start(&sup.inner, &g, PauseReason::EngineCrash, "crashed").is_err());

        assert_eq!(state(&sup.inner, &g), before, "(mode, open cards, trace length)");
    }
}
