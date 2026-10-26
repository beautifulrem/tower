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

/// Puts the workspace back to where run `run_no` started. What was there
/// is saved first, so the rollback itself can be undone; the undone work
/// also stays in the trace and that run's snapshots. The change is the
/// human's, recorded as such, and needs verifying again.
pub async fn rollback(inner: &Arc<Inner>, goal: &str, run_no: u32) -> Result<()> {
    let (_, ws) = editable_workspace(inner, goal)?;
    let lang = inner.lang();
    let start = inner.store(|s| s.run_start_pin(goal, run_no))?.ok_or_else(|| {
        invalid(tr!(lang, "没有第 {run_no} 次运行开始时的快照", "There is no snapshot from the start of run {run_no}"))
    })?;
    let saved = save_workspace(inner, goal, &ws).await?;
    restore(inner, goal, &ws, &start).await?;
    inner.append(goal, EventKind::RolledBack { run_no, saved })?;
    inner.emit_goal_now(goal);
    Ok(())
}

/// Undoes the latest rollback: the workspace is as it was just before it.
pub async fn undo_rollback(inner: &Arc<Inner>, goal: &str) -> Result<()> {
    let (_, ws) = editable_workspace(inner, goal)?;
    let lang = inner.lang();
    let saved = match inner.store(|s| s.last_event(goal, "rolled_back"))?.map(|e| e.event) {
        Some(EventKind::RolledBack { saved, .. }) => saved,
        _ => return Err(invalid(tr!(lang, "没有可以撤销的回退", "There is no rollback to undo"))),
    };
    restore(inner, goal, &ws, &saved).await?;
    inner.append(goal, EventKind::Note { text: tr!(lang, "你撤销了上一次回退", "You undid the last rollback") })?;
    inner.emit_goal_now(goal);
    Ok(())
}

/// Snapshots the workspace as it is now and keeps it (a ref, so git never
/// collects it).
async fn save_workspace(inner: &Arc<Inner>, goal: &str, ws: &std::path::Path) -> Result<String> {
    let rec = inner.store(|s| s.goal(goal))?;
    let base = rec.base_commit.ok_or_else(|| invalid("no base commit"))?;
    let git = inner.git.clone();
    let ws2 = ws.to_path_buf();
    let at = tower_store::system_now();
    tokio::task::spawn_blocking(move || -> Result<String> {
        let snap = git.snapshot(&ws2, &base)?;
        git.keep(&ws2, &format!("refs/tower/saved/{at}"), &snap.pin)?;
        Ok(snap.pin)
    })
    .await
    .map_err(|e| invalid(e.to_string()))?
}

async fn restore(inner: &Arc<Inner>, goal: &str, ws: &std::path::Path, commit: &str) -> Result<()> {
    let git = inner.git.clone();
    let (ws2, commit2) = (ws.to_path_buf(), commit.to_string());
    tokio::task::spawn_blocking(move || git.restore(&ws2, &commit2)).await.map_err(|e| invalid(e.to_string()))??;
    if let Some((_, Some(old))) = run::repin(inner, goal).await? {
        let git = inner.git.clone();
        let new = inner.store(|s| s.goal(goal))?.pin.unwrap_or_default();
        let ws = ws.to_path_buf();
        if let Ok(Ok(files)) = tokio::task::spawn_blocking(move || git.changed_between(&ws, &old, &new)).await
            && !files.is_empty()
        {
            inner.append(goal, EventKind::HumanEdited { files })?;
        }
    }
    Ok(())
}

/// Replaces one file of the workspace with the human's own text (a small
/// edit made in the review). Recorded as the human's edit.
pub async fn write_file(inner: &Arc<Inner>, goal: &str, path: &str, text: &str) -> Result<()> {
    let (_, ws) = editable_workspace(inner, goal)?;
    let lang = inner.lang();
    let rel = std::path::Path::new(path);
    if rel.is_absolute()
        || rel.components().any(|c| matches!(c, std::path::Component::ParentDir))
        || path.starts_with(".git")
    {
        return Err(invalid(tr!(lang, "只能修改工作区里的文件", "Only files inside the workspace can be edited")));
    }
    let target = ws.join(rel);
    if let Some(parent) = target.parent() {
        std::fs::create_dir_all(parent)?;
    }
    std::fs::write(&target, text)?;
    inner.append(goal, EventKind::HumanEdited { files: vec![path.to_string()] })?;
    run::repin(inner, goal).await?;
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
