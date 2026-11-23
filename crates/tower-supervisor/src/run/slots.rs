//! Slots: which goals are being started or run, so no more than
//! `max_concurrent` hold one, and handing a slot on when a start ends.

use std::sync::{Arc, PoisonError};

use tower_core::lifecycle::Transition;
use tower_core::{EventKind, LifecycleState, Mode, tr};

use super::{Run, schedule};
use crate::inner::Unclaimed;
use crate::{Inner, Result, invalid};

/// Marks a goal as being started; released when dropped.
pub(crate) struct Starting {
    inner: Arc<Inner>,
    goal: String,
}

impl Starting {
    /// Refused when the goal is already being started, or with `max` when
    /// that many goals already run or start: the check and the claim are one
    /// step, so two starts racing for the last slot cannot both get it.
    pub(crate) fn claim(inner: &Arc<Inner>, goal: &str, max: Option<usize>) -> std::result::Result<Self, Unclaimed> {
        inner.claim_start(goal, max).map(|()| Starting { inner: inner.clone(), goal: goal.to_string() })
    }

    pub(super) fn claim_one(inner: &Arc<Inner>, goal: &str) -> Result<Self> {
        Self::claim(inner, goal, None).map_err(|_| already_starting(inner))
    }
}

/// One start at a time per goal: preparing a workspace takes a while, and
/// two callers (the scheduler and a human resume) must not both get through.
pub(crate) fn already_starting(inner: &Inner) -> crate::Error {
    invalid(tr!(inner.lang(), "这个目标正在启动", "This goal is already starting"))
}

impl Starting {}

impl Drop for Starting {
    fn drop(&mut self) {
        self.inner.starting.lock().unwrap_or_else(PoisonError::into_inner).remove(&self.goal);
    }
}

/// A start holds a slot while it runs; one that ended without a run (it
/// failed and paused the goal, or you paused or abandoned it meanwhile)
/// hands the slot to the next ready goal. A start that failed before any
/// step that pauses the goal left it ready: it is paused now, with a card,
/// or the scheduler would only try it again at once and fail the same way.
pub(super) async fn hand_on(inner: &Arc<Inner>, goal: &str, result: &Result<()>) {
    if inner.run_of(goal).is_some() {
        return;
    }
    let ready = inner.store(|s| s.goal(goal)).is_ok_and(|g| g.state == LifecycleState::Ready);
    if ready && let Err(e) = result {
        let detail = tr!(inner.lang(), "启动失败：{e}", "Could not start: {e}");
        if let Err(again) = super::fail_to_start(inner, goal, &detail) {
            tracing::error!(goal, error = %again, "could not pause after a failed start");
        }
    }
    schedule(inner).await;
}

/// Makes `run` the goal's live run, if the goal is still in the state its
/// start began from. Preparing and setting up a workspace can take minutes;
/// a goal you paused or abandoned meanwhile must not start. The check, the
/// transition and the insert happen under the store's lock, so a pause or
/// abandon lands either before (the start gives up) or after (it finds the
/// run and stops it, its `RunEnded` after this `RunStarted`).
pub(super) fn begin(
    inner: &Arc<Inner>,
    run: &Arc<Run>,
    seen: LifecycleState,
    purpose: &str,
    start_pin: Option<String>,
) -> Result<bool> {
    let goal = run.goal_id.as_str();
    let began = inner.store(|s| {
        if s.goal(goal)?.state != seen {
            return Ok(None);
        }
        let mut entries = Vec::new();
        if seen != LifecycleState::Running {
            entries.push(s.transition(goal, Transition::RunStarted, None, purpose)?);
        }
        let run_no = run.run_no;
        entries.push(s.append(goal, EventKind::RunStarted { run_no, purpose: purpose.into(), start_pin })?);
        if s.goal(goal)?.mode != Mode::Starting {
            entries.push(s.append(goal, EventKind::ModeChanged { mode: Mode::Starting })?);
        }
        inner.runs.lock().unwrap_or_else(PoisonError::into_inner).insert(goal.into(), run.clone());
        Ok(Some(entries))
    })?;
    let Some(entries) = began else { return Ok(false) };
    inner.traces.lock().unwrap_or_else(PoisonError::into_inner).extend(entries);
    inner.flush_traces();
    inner.emit_goal_now(goal);
    Ok(true)
}
