//! Persistent storage for Scheduled / Overnight Goals (`docs/18` P2.2).

use rusqlite::{OptionalExtension, Row, params};
use tower_core::Millis;
use tower_core::contract::Contract;
use tower_core::view::ScheduledGoal;

use crate::goals::json_col;
use crate::{Result, Store, StoreError, new_id};

#[derive(Debug, Clone)]
pub struct NewScheduledGoal {
    pub project_id: String,
    pub title: String,
    pub cron_expr: String,
    pub contract_template: Contract,
    pub enabled: bool,
    pub next_run_at: Option<Millis>,
    pub unattended_strict: bool,
}

fn row_to_schedule(r: &Row<'_>) -> rusqlite::Result<ScheduledGoal> {
    Ok(ScheduledGoal {
        id: r.get("id")?,
        project_id: r.get("project_id")?,
        title: r.get("title")?,
        cron_expr: r.get("cron_expr")?,
        contract_template: json_col(r, "contract_template")?,
        enabled: r.get("enabled")?,
        last_run_at: r.get("last_run_at")?,
        next_run_at: r.get("next_run_at")?,
        last_goal_id: r.get("last_goal_id")?,
        unattended_strict: r.get("unattended_strict")?,
        created_at: r.get("created_at")?,
    })
}

impl Store {
    pub fn create_scheduled_goal(&mut self, input: NewScheduledGoal) -> Result<ScheduledGoal> {
        self.project(&input.project_id)?;
        let id = new_id("sch");
        let now = self.now();
        self.conn.execute(
            "INSERT INTO scheduled_goals
                (id, project_id, title, cron_expr, contract_template, enabled, next_run_at, unattended_strict, created_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)",
            params![
                id,
                input.project_id,
                input.title.trim(),
                input.cron_expr.trim(),
                serde_json::to_string(&input.contract_template)?,
                input.enabled,
                input.next_run_at,
                input.unattended_strict,
                now,
            ],
        )?;
        self.scheduled_goal(&id)
    }

    pub fn scheduled_goal(&self, id: &str) -> Result<ScheduledGoal> {
        self.conn
            .query_row("SELECT * FROM scheduled_goals WHERE id = ?1", [id], row_to_schedule)
            .optional()?
            .ok_or_else(|| StoreError::NotFound(format!("scheduled goal {id}")))
    }

    pub fn scheduled_goals(&self) -> Result<Vec<ScheduledGoal>> {
        let mut stmt = self.conn.prepare("SELECT * FROM scheduled_goals ORDER BY created_at DESC")?;
        let rows = stmt.query_map([], row_to_schedule)?;
        Ok(rows.collect::<rusqlite::Result<_>>()?)
    }

    pub fn set_scheduled_goal_enabled(
        &mut self,
        id: &str,
        enabled: bool,
        next_run_at: Option<Millis>,
    ) -> Result<ScheduledGoal> {
        let n = self.conn.execute(
            "UPDATE scheduled_goals SET enabled = ?2, next_run_at = ?3 WHERE id = ?1",
            params![id, enabled, next_run_at],
        )?;
        if n == 0 {
            return Err(StoreError::NotFound(format!("scheduled goal {id}")));
        }
        self.scheduled_goal(id)
    }

    pub fn delete_scheduled_goal(&mut self, id: &str) -> Result<()> {
        let n = self.conn.execute("DELETE FROM scheduled_goals WHERE id = ?1", [id])?;
        if n == 0 {
            return Err(StoreError::NotFound(format!("scheduled goal {id}")));
        }
        Ok(())
    }

    /// Reads the idempotent checkpoint key (`pi-durable` style) for `id` so a
    /// crash/restart within the same cron minute never spawns duplicate goals.
    pub fn schedule_checkpoint(&self, id: &str) -> Result<Option<String>> {
        Ok(self
            .conn
            .query_row("SELECT last_checkpoint FROM scheduled_goals WHERE id = ?1", [id], |r| {
                r.get::<_, Option<String>>(0)
            })
            .optional()?
            .flatten())
    }

    /// Atomically claims a schedule checkpoint; returns `false` if this exact
    /// checkpoint was already executed (preventing duplicate unattended runs).
    pub fn claim_schedule_checkpoint(&mut self, id: &str, checkpoint: &str) -> Result<bool> {
        let n = self.conn.execute(
            "UPDATE scheduled_goals SET last_checkpoint = ?2
             WHERE id = ?1 AND (last_checkpoint IS NULL OR last_checkpoint != ?2)",
            params![id, checkpoint],
        )?;
        Ok(n > 0)
    }

    /// Moves a schedule on to its next slot without recording a run (a
    /// launch that failed, a slot claimed earlier that never ran).
    pub fn set_schedule_next_run(&mut self, id: &str, next_run_at: Option<Millis>) -> Result<()> {
        self.conn.execute("UPDATE scheduled_goals SET next_run_at = ?2 WHERE id = ?1", params![id, next_run_at])?;
        Ok(())
    }

    pub fn record_schedule_run(
        &mut self,
        id: &str,
        run_at: Millis,
        next_run_at: Option<Millis>,
        goal_id: &str,
    ) -> Result<ScheduledGoal> {
        self.conn.execute(
            "UPDATE scheduled_goals SET last_run_at = ?2, next_run_at = ?3, last_goal_id = ?4 WHERE id = ?1",
            params![id, run_at, next_run_at, goal_id],
        )?;
        self.scheduled_goal(id)
    }
}
