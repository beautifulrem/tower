//! Persistent storage for the per-project lightweight Merge Queue (`docs/18` P2.3).

use rusqlite::{OptionalExtension, Row, params};
use tower_core::view::{MergeQueueEntry, MergeQueueStatus};

use crate::goals::{bad_value, json_col};
use crate::{Result, Store, StoreError};

const QUEUE_SQL: &str = "SELECT q.goal_id, q.project_id, g.title AS goal_title, g.branch AS branch,
        q.position, q.status, q.conflict_files, q.updated_at
     FROM merge_queue q
     JOIN goals g ON g.id = q.goal_id";

fn row_to_entry(r: &Row<'_>) -> rusqlite::Result<MergeQueueEntry> {
    let status_s: String = r.get("status")?;
    Ok(MergeQueueEntry {
        goal_id: r.get("goal_id")?,
        project_id: r.get("project_id")?,
        goal_title: r.get("goal_title")?,
        branch: r.get("branch")?,
        position: r.get("position")?,
        status: MergeQueueStatus::parse(&status_s).ok_or_else(|| bad_value("status", &status_s))?,
        conflict_files: json_col(r, "conflict_files")?,
        updated_at: r.get("updated_at")?,
    })
}

impl Store {
    pub fn merge_queue(&self, project_id: Option<&str>) -> Result<Vec<MergeQueueEntry>> {
        let mut out = Vec::new();
        match project_id {
            Some(pid) => {
                let mut stmt = self.conn.prepare(&format!(
                    "{QUEUE_SQL} WHERE q.project_id = ?1 ORDER BY q.position ASC, q.updated_at ASC"
                ))?;
                for row in stmt.query_map([pid], row_to_entry)? {
                    out.push(row?);
                }
            }
            None => {
                let mut stmt = self.conn.prepare(&format!("{QUEUE_SQL} ORDER BY q.project_id ASC, q.position ASC"))?;
                for row in stmt.query_map([], row_to_entry)? {
                    out.push(row?);
                }
            }
        }
        Ok(out)
    }

    pub fn merge_queue_entry(&self, goal_id: &str) -> Result<MergeQueueEntry> {
        self.conn
            .query_row(&format!("{QUEUE_SQL} WHERE q.goal_id = ?1"), [goal_id], row_to_entry)
            .optional()?
            .ok_or_else(|| StoreError::NotFound(format!("merge queue entry {goal_id}")))
    }

    pub fn merge_queue_position(&self, goal_id: &str) -> Result<Option<u32>> {
        Ok(self
            .conn
            .query_row("SELECT position FROM merge_queue WHERE goal_id = ?1", [goal_id], |r| r.get(0))
            .optional()?)
    }

    pub fn enqueue_merge(&mut self, goal_id: &str, project_id: &str) -> Result<MergeQueueEntry> {
        if let Ok(existing) = self.merge_queue_entry(goal_id) {
            return Ok(existing);
        }
        let now = self.now();
        let next_pos: u32 = self.conn.query_row(
            "SELECT COALESCE(MAX(position), 0) + 1 FROM merge_queue WHERE project_id = ?1",
            [project_id],
            |r| r.get(0),
        )?;
        self.conn.execute(
            "INSERT INTO merge_queue (goal_id, project_id, position, status, conflict_files, updated_at)
             VALUES (?1, ?2, ?3, 'queued', '[]', ?4)",
            params![goal_id, project_id, next_pos, now],
        )?;
        self.merge_queue_entry(goal_id)
    }

    pub fn remove_from_merge_queue(&mut self, goal_id: &str) -> Result<()> {
        let project_id: Option<String> = self
            .conn
            .query_row("SELECT project_id FROM merge_queue WHERE goal_id = ?1", [goal_id], |r| r.get(0))
            .optional()?;
        let Some(pid) = project_id else {
            return Err(StoreError::NotFound(format!("merge queue entry {goal_id}")));
        };
        let tx = self.conn.transaction()?;
        tx.execute("DELETE FROM merge_queue WHERE goal_id = ?1", [goal_id])?;
        // Compact positions 1..=N for the project.
        let mut stmt = tx.prepare("SELECT goal_id FROM merge_queue WHERE project_id = ?1 ORDER BY position ASC")?;
        let remaining: Vec<String> = stmt.query_map([&pid], |r| r.get(0))?.collect::<rusqlite::Result<_>>()?;
        drop(stmt);
        for (i, gid) in remaining.iter().enumerate() {
            tx.execute("UPDATE merge_queue SET position = ?2 WHERE goal_id = ?1", params![gid, (i + 1) as u32])?;
        }
        tx.commit()?;
        Ok(())
    }

    pub fn reorder_merge_queue(&mut self, project_id: &str, goal_ids: &[String]) -> Result<Vec<MergeQueueEntry>> {
        let now = self.now();
        let tx = self.conn.transaction()?;
        let mut stmt = tx.prepare("SELECT goal_id FROM merge_queue WHERE project_id = ?1 ORDER BY position ASC")?;
        let current: Vec<String> = stmt.query_map([project_id], |r| r.get(0))?.collect::<rusqlite::Result<_>>()?;
        drop(stmt);

        let mut ordered: Vec<String> = goal_ids.iter().filter(|id| current.contains(*id)).cloned().collect();
        for id in current {
            if !ordered.contains(&id) {
                ordered.push(id);
            }
        }
        for (i, gid) in ordered.iter().enumerate() {
            tx.execute(
                "UPDATE merge_queue SET position = ?2, updated_at = ?3 WHERE goal_id = ?1",
                params![gid, (i + 1) as u32, now],
            )?;
        }
        tx.commit()?;
        self.merge_queue(Some(project_id))
    }

    pub fn update_merge_queue_status(
        &mut self,
        goal_id: &str,
        status: MergeQueueStatus,
        conflict_files: &[String],
    ) -> Result<()> {
        let now = self.now();
        self.conn.execute(
            "UPDATE merge_queue SET status = ?2, conflict_files = ?3, updated_at = ?4 WHERE goal_id = ?1",
            params![goal_id, status.as_str(), serde_json::to_string(conflict_files)?, now],
        )?;
        Ok(())
    }
}
