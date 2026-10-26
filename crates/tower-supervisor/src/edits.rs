//! The human's own edits to a goal's workspace: undoing a hunk, rolling
//! back to the start of a run.

use std::path::PathBuf;
use std::sync::Arc;

use tower_core::{EventKind, LifecycleState, tr};
use tower_store::GoalRecord;

use crate::{Inner, Result, invalid, run};

/// The workspace may be edited by the human only while nothing else is
/// using it: no run and no verification.
fn editable_workspace(inner: &Arc<Inner>, goal: &str) -> Result<(GoalRecord, PathBuf)> {
    let rec = inner.store(|s| s.goal(goal))?;
    let lang = inner.lang();
    if inner.run_of(goal).is_some() || matches!(rec.state, LifecycleState::Running | LifecycleState::Verifying) {
        return Err(invalid(tr!(
            lang,
            "目标正在运行或验证，先暂停",
            "The goal is running or being verified; pause it first"
        )));
    }
    if matches!(
        rec.state,
        LifecycleState::Accepted | LifecycleState::Integrated | LifecycleState::Archived | LifecycleState::Abandoned
    ) {
        return Err(invalid(tr!(lang, "这个目标已经结束", "This goal is finished")));
    }
    let ws = rec
        .workspace
        .clone()
        .map(PathBuf::from)
        .ok_or_else(|| invalid(tr!(lang, "没有工作区", "There is no workspace")))?;
    Ok((rec, ws))
}

/// Puts the workspace back to where run `run_no` started. The undone work
/// stays in the trace and in that run's snapshots; the change is the
/// human's, recorded as such, and needs verifying again.
pub async fn rollback(inner: &Arc<Inner>, goal: &str, run_no: u32) -> Result<()> {
    let (_, ws) = editable_workspace(inner, goal)?;
    let lang = inner.lang();
    let start = inner
        .store(|s| s.trace(goal, None, 10_000))?
        .into_iter()
        .find_map(|e| match e.event {
            EventKind::RunStarted { run_no: n, start_pin: Some(pin), .. } if n == run_no => Some(pin),
            _ => None,
        })
        .ok_or_else(|| {
            invalid(tr!(
                lang,
                "没有第 {run_no} 次运行开始时的快照",
                "There is no snapshot from the start of run {run_no}"
            ))
        })?;
    let git = inner.git.clone();
    let (ws2, start2) = (ws.clone(), start.clone());
    tokio::task::spawn_blocking(move || git.restore(&ws2, &start2)).await.map_err(|e| invalid(e.to_string()))??;
    inner.append(
        goal,
        EventKind::Note {
            text: tr!(
                lang,
                "你把工作区回退到了第 {run_no} 次运行开始时",
                "You rolled the workspace back to the start of run {run_no}"
            ),
        },
    )?;
    if let Some((_, Some(old))) = run::repin(inner, goal).await? {
        let git = inner.git.clone();
        let new = inner.store(|s| s.goal(goal))?.pin.unwrap_or_default();
        if let Ok(Ok(files)) = tokio::task::spawn_blocking(move || git.changed_between(&ws, &old, &new)).await
            && !files.is_empty()
        {
            inner.append(goal, EventKind::HumanEdited { files })?;
        }
    }
    inner.emit_goal_now(goal);
    Ok(())
}

/// Undoes one hunk of the reviewed change in the workspace.
pub async fn revert_hunk(inner: &Arc<Inner>, goal: &str, path: &str, hunk: usize) -> Result<()> {
    let (rec, ws) = editable_workspace(inner, goal)?;
    let lang = inner.lang();
    let (Some(base), Some(pin)) = (rec.base_commit.clone(), rec.pin.clone()) else {
        return Err(invalid(tr!(lang, "没有可撤销的改动", "There is no change to undo")));
    };
    let git = inner.git.clone();
    let (ws2, p) = (ws.clone(), path.to_string());
    tokio::task::spawn_blocking(move || git.revert_hunk(&ws2, &base, &pin, &p, hunk))
        .await
        .map_err(|e| invalid(e.to_string()))?
        .map_err(|e| {
            invalid(tr!(
                lang,
                "撤销失败（文件在快照之后又改过？）：{e}",
                "Could not undo it (did the file change after the snapshot?): {e}"
            ))
        })?;
    inner.append(goal, EventKind::HumanEdited { files: vec![path.to_string()] })?;
    run::repin(inner, goal).await?;
    inner.emit_goal_now(goal);
    Ok(())
}
