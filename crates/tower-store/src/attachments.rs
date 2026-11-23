//! Multimodal image attachments and cross-goal dependency edges (`docs/18` P1.4, P2.3).

use rusqlite::{Row, params};
use tower_core::LifecycleState;
use tower_core::contract::AttachmentRef;

use crate::{Result, Store, StoreError};

fn row_to_attachment(r: &Row<'_>) -> rusqlite::Result<AttachmentRef> {
    Ok(AttachmentRef {
        id: r.get("id")?,
        name: r.get("name")?,
        mime: r.get("mime")?,
        path: r.get("path")?,
        size_bytes: r.get::<_, i64>("size_bytes")?.max(0) as u64,
        created_at: r.get("created_at")?,
    })
}

impl Store {
    pub fn add_goal_attachment(&mut self, goal_id: &str, att: &AttachmentRef) -> Result<()> {
        self.conn.execute(
            "INSERT OR REPLACE INTO goal_attachments (id, goal_id, name, mime, path, size_bytes, created_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
            params![att.id, goal_id, att.name, att.mime, att.path, att.size_bytes as i64, att.created_at],
        )?;
        Ok(())
    }

    pub fn goal_attachments(&self, goal_id: &str) -> Result<Vec<AttachmentRef>> {
        let mut stmt =
            self.conn.prepare("SELECT * FROM goal_attachments WHERE goal_id = ?1 ORDER BY created_at ASC")?;
        let rows = stmt.query_map([goal_id], row_to_attachment)?;
        Ok(rows.collect::<rusqlite::Result<_>>()?)
    }

    pub fn delete_goal_attachment(&mut self, goal_id: &str, attachment_id: &str) -> Result<Option<String>> {
        use rusqlite::OptionalExtension;
        let path: Option<String> = self
            .conn
            .query_row(
                "SELECT path FROM goal_attachments WHERE goal_id = ?1 AND id = ?2",
                params![goal_id, attachment_id],
                |r| r.get(0),
            )
            .optional()?;
        let n = self
            .conn
            .execute("DELETE FROM goal_attachments WHERE goal_id = ?1 AND id = ?2", params![goal_id, attachment_id])?;
        if n == 0 {
            return Err(StoreError::NotFound(format!("attachment {attachment_id}")));
        }
        Ok(path)
    }

    pub fn set_goal_dependencies(&mut self, goal_id: &str, depends_on: &[String]) -> Result<()> {
        let tx = self.conn.transaction()?;
        tx.execute("DELETE FROM goal_dependencies WHERE goal_id = ?1", [goal_id])?;
        for dep in depends_on.iter().map(|s| s.trim()).filter(|s| !s.is_empty() && *s != goal_id) {
            tx.execute(
                "INSERT OR IGNORE INTO goal_dependencies (goal_id, depends_on_goal_id) VALUES (?1, ?2)",
                params![goal_id, dep],
            )?;
        }
        tx.commit()?;
        Ok(())
    }

    pub fn goal_dependencies(&self, goal_id: &str) -> Result<Vec<String>> {
        let mut stmt = self.conn.prepare(
            "SELECT depends_on_goal_id FROM goal_dependencies WHERE goal_id = ?1 ORDER BY depends_on_goal_id",
        )?;
        let rows = stmt.query_map([goal_id], |r| r.get(0))?;
        Ok(rows.collect::<rusqlite::Result<_>>()?)
    }

    /// Returns prerequisite goal IDs that have NOT yet reached Accepted, Integrated,
    /// or Archived.
    pub fn unmet_dependencies(&self, goal_id: &str) -> Result<Vec<String>> {
        let deps = self.goal_dependencies(goal_id)?;
        let mut unmet = Vec::new();
        for dep in deps {
            let state: Option<String> = {
                use rusqlite::OptionalExtension;
                self.conn.query_row("SELECT state FROM goals WHERE id = ?1", [&dep], |r| r.get(0)).optional()?
            };
            let met = state.as_deref().and_then(LifecycleState::parse).is_some_and(|s| {
                matches!(s, LifecycleState::Accepted | LifecycleState::Integrated | LifecycleState::Archived)
            });
            if !met {
                unmet.push(dep);
            }
        }
        Ok(unmet)
    }
}
