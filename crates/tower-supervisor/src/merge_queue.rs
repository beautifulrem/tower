//! Lightweight per-project Merge Queue (`docs/18` P2.3).
//!
//! Enqueues accepted goals, predicts sequential merge conflicts against the
//! moving base branch using `git merge-tree`, and supports reordering, removal,
//! and triggering fresh verification.

use std::path::PathBuf;

use tower_core::view::{MergeQueueEntry, MergeQueueStatus};
use tower_core::{LifecycleState, tr};

use crate::{Result, Supervisor, invalid, verify};

impl Supervisor {
    /// Lists queued accepted goals (optionally filtered to one project).
    pub fn merge_queue(&self, project_id: Option<&str>) -> Result<Vec<MergeQueueEntry>> {
        self.inner.read_store(|s| s.merge_queue(project_id))
    }

    /// Enqueues an accepted goal for sequential merge conflict checking.
    pub async fn enqueue_merge(&self, goal_id: &str) -> Result<MergeQueueEntry> {
        let rec = self.inner.store(|s| s.goal(goal_id))?;
        let lang = self.inner.lang();
        if rec.state != LifecycleState::Accepted {
            return Err(invalid(tr!(
                lang,
                "只有已验收的目标可以加入合并队列",
                "Only an accepted goal can be added to the merge queue"
            )));
        }
        if rec.branch.is_none() {
            return Err(invalid(tr!(lang, "该目标还没有写入分支", "This goal does not have a branch yet")));
        }
        self.inner.store(|s| s.enqueue_merge(goal_id, &rec.project_id))?;
        let _ = self.check_merge_queue(&rec.project_id).await;
        self.inner.emit_goal_now(goal_id);
        self.inner.store(|s| s.merge_queue_entry(goal_id))
    }

    /// Reorders queued entries for `project_id` and recomputes sequential conflicts.
    pub async fn reorder_merge_queue(&self, project_id: &str, goal_ids: Vec<String>) -> Result<Vec<MergeQueueEntry>> {
        self.inner.store(|s| s.reorder_merge_queue(project_id, &goal_ids))?;
        self.check_merge_queue(project_id).await
    }

    /// Removes a goal from its project's merge queue.
    pub fn remove_from_merge_queue(&self, goal_id: &str) -> Result<()> {
        self.inner.store(|s| s.remove_from_merge_queue(goal_id))?;
        self.inner.emit_goal_now(goal_id);
        Ok(())
    }

    /// Runs sequential `git merge-tree` conflict prediction across every queued
    /// goal of `project_id` on top of the current `base_branch`.
    pub async fn check_merge_queue(&self, project_id: &str) -> Result<Vec<MergeQueueEntry>> {
        let project = self.inner.store(|s| s.project(project_id))?;
        let entries = self.inner.store(|s| s.merge_queue(Some(project_id)))?;
        if entries.is_empty() {
            return Ok(Vec::new());
        }
        let git = self.inner.git.clone();
        let root = PathBuf::from(&project.root);
        let base = project.base_branch.clone();

        // Filter out already-merged goals and collect active branches in queue order.
        let mut active: Vec<(String, String)> = Vec::new();
        for e in &entries {
            let Some(branch) = e.branch.clone() else {
                let _ = self.inner.store(|s| {
                    s.update_merge_queue_status(&e.goal_id, MergeQueueStatus::Conflict, &["no branch".into()])
                });
                continue;
            };
            let g = self.inner.store(|s| s.goal(&e.goal_id))?;
            if matches!(g.state, LifecycleState::Integrated | LifecycleState::Archived) {
                let _ = self.inner.store(|s| s.update_merge_queue_status(&e.goal_id, MergeQueueStatus::Merged, &[]));
                continue;
            }
            active.push((e.goal_id.clone(), branch));
        }

        if !active.is_empty() {
            let branches: Vec<String> = active.iter().map(|(_, b)| b.clone()).collect();
            let results = tokio::task::spawn_blocking(move || git.merge_queue_check(&root, &base, &branches))
                .await
                .map_err(|e| invalid(e.to_string()))??;
            for ((gid, _), check) in active.iter().zip(results) {
                let status =
                    if check.conflict_files.is_empty() { MergeQueueStatus::Ready } else { MergeQueueStatus::Conflict };
                self.inner.store(|s| s.update_merge_queue_status(gid, status, &check.conflict_files))?;
            }
        }
        self.inner.read_store(|s| s.merge_queue(Some(project_id)))
    }

    /// Marks a queued entry as `retesting` and triggers fresh verification against its snapshot.
    pub async fn reverify_merge_queue_entry(&self, goal_id: &str) -> Result<()> {
        let _entry = self.inner.store(|s| s.merge_queue_entry(goal_id))?;
        let rec = self.inner.store(|s| s.goal(goal_id))?;
        let lang = self.inner.lang();
        if self.inner.run_of(goal_id).is_some() {
            return Err(invalid(tr!(lang, "Agent 正在运行，先暂停", "The agent is running; pause it first")));
        }
        if rec.workspace.is_none() {
            return Err(invalid(tr!(lang, "没有工作区，无法重新验证", "There is no workspace to verify again")));
        }
        self.inner.store(|s| s.update_merge_queue_status(goal_id, MergeQueueStatus::Retesting, &[]))?;
        verify::spawn_asked(self.inner.clone(), goal_id.to_string());
        Ok(())
    }
}
