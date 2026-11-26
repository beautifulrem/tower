//! The human's own edits to a goal's workspace: undoing a hunk, rolling
//! back to the start of a run.

use std::path::{Path, PathBuf};
use std::sync::Arc;

use tower_core::review::{attach_unit_claim_summaries, build_units, classify_hunk_noise};
use tower_core::view::{DiffStat, ReviewView, SnapshotPoint};
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
    inner.append(goal, EventKind::tower_note(tr!(lang, "你撤销了上一次回退", "You undid the last rollback")))?;
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
    if path.starts_with(".git") {
        return Err(invalid(tr!(lang, "只能修改工作区里的文件", "Only files inside the workspace can be edited")));
    }
    // The workspace is the agent's: never follow a link it may have planted.
    tower_git::write_inside(&ws, path, text.as_bytes()).map_err(|e| {
        invalid(tr!(lang, "只能修改工作区里的文件（{e}）", "Only files inside the workspace can be edited ({e})"))
    })?;
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

/// Builds the ordered timeline of comparable snapshots for `goal`:
/// base commit, run start pins (`refs/tower/runs/<n>`), verified pin, saved
/// snapshots, and the latest pin.
pub(crate) async fn list_snapshots(inner: &Arc<Inner>, id: &str) -> Result<Vec<SnapshotPoint>> {
    let rec = inner.read_store(|s| s.goal(id))?;
    let detail = inner.read_store(|s| s.detail(id))?;
    let (Some(ws), Some(base)) = (rec.workspace.clone(), rec.base_commit.clone()) else {
        return Ok(Vec::new());
    };
    let git = inner.git.clone();
    let ws2 = ws.clone();
    let git_snaps = tokio::task::spawn_blocking(move || git.list_run_snapshots(Path::new(&ws2)))
        .await
        .map_err(|e| invalid(e.to_string()))?
        .unwrap_or_default();

    let mut out = Vec::new();
    fn short(sha: &str) -> &str {
        &sha[..sha.len().min(7)]
    }
    out.push(SnapshotPoint {
        rev: base.clone(),
        kind: "base".into(),
        label: format!("Base @{}", short(&base)),
        run_no: None,
        at: Some(detail.summary.created_at),
    });

    // Attach run timestamps when git refs match persisted runs.
    let run_times: std::collections::HashMap<u32, i64> = detail.runs.iter().map(|r| (r.run_no, r.started_at)).collect();
    for mut p in git_snaps {
        if let Some(rn) = p.run_no {
            p.at = run_times.get(&rn).copied();
        }
        out.push(p);
    }
    // Include verified pin explicitly if distinct from already-listed snapshots.
    if let Some(vpin) = rec.verified_pin.as_deref()
        && !out.iter().any(|p| p.kind == "verified" && p.rev == vpin)
    {
        out.push(SnapshotPoint {
            rev: vpin.to_string(),
            kind: "verified".into(),
            label: format!("Verified @{}", short(vpin)),
            run_no: None,
            at: Some(detail.summary.updated_at),
        });
    }
    // Ensure current pin appears at the end if not already represented as kind="pin".
    if let Some(pin) = rec.pin.as_deref()
        && !out.iter().any(|p| p.kind == "pin" && p.rev == pin)
    {
        out.push(SnapshotPoint {
            rev: pin.to_string(),
            kind: "pin".into(),
            label: format!("Latest @{}", short(pin)),
            run_no: None,
            at: Some(detail.summary.updated_at),
        });
    }
    Ok(out)
}

/// Builds a `ReviewView` between `from_rev` (defaults to base commit) and
/// `to_rev` (defaults to current pin / live snapshot), including unit claim
/// summaries, moved/formatting hunk noise classification, and the snapshot timeline.
pub(crate) async fn review_range(
    inner: &Arc<Inner>,
    id: &str,
    from_rev: Option<String>,
    to_rev: Option<String>,
) -> Result<ReviewView> {
    let rec = inner.read_store(|s| s.goal(id))?;
    let (Some(ws), Some(base)) = (rec.workspace.clone(), rec.base_commit.clone()) else {
        return Err(invalid(tr!(inner.lang(), "这个目标还没有工作区", "This goal has no workspace yet")));
    };
    let git = inner.git.clone();
    let target_pin = match to_rev {
        Some(rev) if !rev.trim().is_empty() => rev,
        _ => match rec.pin.clone() {
            Some(p) if !matches!(rec.state, LifecycleState::Running) => p,
            _ => {
                let ws2 = ws.clone();
                let base2 = base.clone();
                let snap = tokio::task::spawn_blocking(move || git.snapshot(Path::new(&ws2), &base2))
                    .await
                    .map_err(|e| invalid(e.to_string()))??;
                snap.pin
            }
        },
    };
    let git = inner.git.clone();
    let (ws2, base2, pin2) = (ws.clone(), base.clone(), target_pin.clone());
    let (files, from) = tokio::task::spawn_blocking(move || -> Result<_> {
        let ws = Path::new(&ws2);
        let from = from_rev.filter(|s| !s.trim().is_empty() && git.resolve(ws, s).is_ok()).unwrap_or(base2);
        Ok((git.diff_revs(ws, &from, &pin2)?, from))
    })
    .await
    .map_err(|e| invalid(e.to_string()))??;

    let stat = DiffStat {
        files: files.len() as u32,
        additions: files.iter().map(|f| f.additions).sum(),
        deletions: files.iter().map(|f| f.deletions).sum(),
    };
    let (mut moved_hunks, mut formatting_hunks) = classify_hunk_noise(&files);
    // Augment text-level noise classification with AST-level moved-block and
    // formatting-only hunk detection from `tower-ast`.
    let ast_git = inner.git.clone();
    let (ast_ws, ast_from, ast_pin) = (ws.clone(), from.clone(), target_pin.clone());
    type HunkLineSpan = (Option<(usize, usize)>, Option<(usize, usize)>);
    let ast_files: Vec<(String, Vec<HunkLineSpan>)> = files
        .iter()
        .filter(|f| !f.binary && tower_ast::Language::from_path(&f.path).is_some() && !f.hunks.is_empty())
        .map(|f| {
            let spans = f
                .hunks
                .iter()
                .map(|h| {
                    let old_lines: Vec<usize> = h.lines.iter().filter_map(|l| l.old_no.map(|n| n as usize)).collect();
                    let new_lines: Vec<usize> = h.lines.iter().filter_map(|l| l.new_no.map(|n| n as usize)).collect();
                    let old_span = old_lines.first().zip(old_lines.last()).map(|(&a, &b)| (a, b));
                    let new_span = new_lines.first().zip(new_lines.last()).map(|(&a, &b)| (a, b));
                    (old_span, new_span)
                })
                .collect();
            (f.path.clone(), spans)
        })
        .collect();
    if !ast_files.is_empty()
        && let Ok(ast_noise) = tokio::task::spawn_blocking(move || {
            let ws_p = Path::new(&ast_ws);
            let mut m = Vec::new();
            let mut f = Vec::new();
            for (path, hunk_spans) in ast_files {
                let Some(lang) = tower_ast::Language::from_path(&path) else { continue };
                let (Some(old_src), Some(new_src)) =
                    (ast_git.file_at(ws_p, &ast_from, &path), ast_git.file_at(ws_p, &ast_pin, &path))
                else {
                    continue;
                };
                if old_src.len() > 256 * 1024 || new_src.len() > 256 * 1024 {
                    continue;
                }
                let summary = tower_ast::semantic_moved_hunks(&old_src, &new_src, lang);
                let mut m_idx = Vec::new();
                let mut f_idx = Vec::new();
                for (idx, (old_r, new_r)) in hunk_spans.into_iter().enumerate() {
                    let (is_moved, is_fmt) = summary.classify_hunk(old_r, new_r);
                    if is_moved {
                        m_idx.push(idx);
                    }
                    if is_fmt {
                        f_idx.push(idx);
                    }
                }
                if !m_idx.is_empty() {
                    m.push((path.clone(), m_idx));
                }
                if !f_idx.is_empty() {
                    f.push((path, f_idx));
                }
            }
            (m, f)
        })
        .await
    {
        for (path, indices) in ast_noise.0 {
            let entry = moved_hunks.entry(path).or_default();
            for i in indices {
                if !entry.contains(&i) {
                    entry.push(i);
                }
            }
            entry.sort_unstable();
        }
        for (path, indices) in ast_noise.1 {
            let entry = formatting_hunks.entry(path).or_default();
            for i in indices {
                if !entry.contains(&i) {
                    entry.push(i);
                }
            }
            entry.sort_unstable();
        }
    }
    let mut units = build_units(&files, Some(&rec.contract.scope), inner.lang());
    let hits = inner.read_store(|s| s.sentinel_hits(id))?;
    for u in &mut units {
        for h in &hits {
            let named = h.detail.lines().any(|l| u.files.iter().any(|f| l.starts_with(&format!("{f}:"))));
            if named && !u.risk_reasons.contains(&h.title) {
                let weight = if h.sentinel == "special_cases_test_inputs" { h.severity.clamp(1, 3) } else { 3 };
                u.risk = u.risk.max(weight);
                u.risk_reasons.insert(0, h.title.clone());
            }
        }
    }
    if let Ok(detail) = inner.read_store(|s| s.detail(id)) {
        attach_unit_claim_summaries(&mut units, &detail.claims);
    }
    units.sort_by(|a, b| b.risk.cmp(&a.risk).then(b.lines.cmp(&a.lines)));
    let snapshots = list_snapshots(inner, id).await.unwrap_or_default();
    Ok(ReviewView {
        goal_id: id.into(),
        base_commit: base,
        from,
        pin: target_pin,
        stat,
        units,
        files,
        snapshots,
        moved_hunks,
        formatting_hunks,
    })
}
