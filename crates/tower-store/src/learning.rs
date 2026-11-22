//! Persistent storage for the Learning Loop ratification queue and Calibration
//! Scoreboard facts (`docs/09` §9.2–9.8, `docs/18` P1.2 & P2.3).

use rusqlite::{OptionalExtension, Row, params};
use tower_core::view::{CalibrationRow, MemoryProposal, MemoryScope, ProposalStatus, TaintClass, TaintLevel};

use crate::goals::{bad_value, json_col};
use crate::{Result, Store, StoreError, new_id};

/// Minimum goal count before a calibration row is marked `sample_sufficient`.
pub const CALIBRATION_MIN_SAMPLES: u32 = 5;

#[derive(Debug, Clone)]
pub struct NewMemoryProposal {
    pub scope: MemoryScope,
    pub project_id: Option<String>,
    pub goal_id: Option<String>,
    pub text: String,
    pub detail: String,
    pub origin: String,
    pub evidence: Vec<String>,
    pub taint_classes: Vec<TaintClass>,
}

#[derive(Debug, Clone)]
pub struct CalibrationFactInput {
    pub goal_id: String,
    pub project_id: String,
    pub engine: String,
    pub model: String,
    /// `Some(true)` if first verification passed, `Some(false)` if it failed,
    /// `None` for goals without machine criteria.
    pub first_pass: Option<bool>,
    pub rework_cycles: u32,
    pub had_high_sentinel: bool,
    pub reported_blocked: bool,
    pub cost_usd: f64,
}

fn row_to_proposal(r: &Row<'_>) -> rusqlite::Result<MemoryProposal> {
    let scope_s: String = r.get("scope")?;
    let taint_s: String = r.get("taint_level")?;
    let status_s: String = r.get("status")?;
    Ok(MemoryProposal {
        id: r.get("id")?,
        scope: MemoryScope::parse(&scope_s).ok_or_else(|| bad_value("scope", &scope_s))?,
        project_id: r.get("project_id")?,
        goal_id: r.get("goal_id")?,
        text: r.get("text")?,
        detail: r.get("detail")?,
        origin: r.get("origin")?,
        evidence: json_col(r, "evidence")?,
        taint_level: TaintLevel::parse(&taint_s).ok_or_else(|| bad_value("taint_level", &taint_s))?,
        taint_classes: json_col(r, "taint_classes")?,
        status: ProposalStatus::parse(&status_s).ok_or_else(|| bad_value("status", &status_s))?,
        created_at: r.get("created_at")?,
        resolved_at: r.get("resolved_at")?,
    })
}

impl Store {
    /// Persists a candidate memory proposal with reverse-whitelist taint level.
    /// Deduplicates identical normalized pending proposals within the same scope+project.
    pub fn create_memory_proposal(&mut self, p: NewMemoryProposal) -> Result<MemoryProposal> {
        let text = p.text.trim();
        let norm = normalize_text(text);
        for existing in self.memory_proposals(Some(ProposalStatus::Pending))? {
            if existing.scope == p.scope
                && existing.project_id == p.project_id
                && normalize_text(&existing.text) == norm
            {
                // Merge new evidence lines without duplicating.
                let mut merged = existing.evidence.clone();
                for ev in &p.evidence {
                    if !merged.contains(ev) {
                        merged.push(ev.clone());
                    }
                }
                self.conn.execute(
                    "UPDATE memory_proposals SET evidence = ?2 WHERE id = ?1",
                    params![existing.id, serde_json::to_string(&merged)?],
                )?;
                return self.memory_proposal(&existing.id);
            }
        }
        let id = new_id("mem");
        let now = self.now();
        let taint_level = TaintLevel::from_classes(&p.taint_classes);
        self.conn.execute(
            "INSERT INTO memory_proposals
                (id, scope, project_id, goal_id, text, detail, origin, evidence, taint_level, taint_classes, status, created_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, 'pending', ?11)",
            params![
                id,
                p.scope.as_str(),
                p.project_id,
                p.goal_id,
                text,
                p.detail.trim(),
                p.origin,
                serde_json::to_string(&p.evidence)?,
                taint_level.as_str(),
                serde_json::to_string(&p.taint_classes)?,
                now,
            ],
        )?;
        self.memory_proposal(&id)
    }

    pub fn memory_proposal(&self, id: &str) -> Result<MemoryProposal> {
        self.conn
            .query_row("SELECT * FROM memory_proposals WHERE id = ?1", [id], row_to_proposal)
            .optional()?
            .ok_or_else(|| StoreError::NotFound(format!("memory proposal {id}")))
    }

    pub fn memory_proposals(&self, status: Option<ProposalStatus>) -> Result<Vec<MemoryProposal>> {
        let mut out = Vec::new();
        match status {
            Some(st) => {
                let mut stmt =
                    self.conn.prepare("SELECT * FROM memory_proposals WHERE status = ?1 ORDER BY created_at DESC")?;
                for row in stmt.query_map([st.as_str()], row_to_proposal)? {
                    out.push(row?);
                }
            }
            None => {
                let mut stmt = self.conn.prepare("SELECT * FROM memory_proposals ORDER BY created_at DESC")?;
                for row in stmt.query_map([], row_to_proposal)? {
                    out.push(row?);
                }
            }
        }
        Ok(out)
    }

    /// Approves or rejects a pending memory proposal, optionally updating its text
    /// (required for `TaintLevel::High` unless explicitly confirmed).
    pub fn resolve_memory_proposal(
        &mut self,
        id: &str,
        status: ProposalStatus,
        edited_text: Option<&str>,
    ) -> Result<MemoryProposal> {
        let current = self.memory_proposal(id)?;
        if current.status != ProposalStatus::Pending {
            return Err(StoreError::Conflict(format!("memory proposal {id} is already {}", current.status.as_str())));
        }
        let now = self.now();
        let final_text = edited_text.map(str::trim).filter(|s| !s.is_empty()).unwrap_or(&current.text);
        self.conn.execute(
            "UPDATE memory_proposals SET status = ?2, text = ?3, resolved_at = ?4 WHERE id = ?1",
            params![id, status.as_str(), final_text, now],
        )?;
        self.memory_proposal(id)
    }

    /// Upserts persisted calibration facts for one goal (called when a goal finishes
    /// verification, is accepted, reports blocked, or is abandoned).
    pub fn upsert_calibration_fact(&mut self, fact: &CalibrationFactInput) -> Result<()> {
        let now = self.now();
        self.conn.execute(
            "INSERT INTO calibration_facts
                (goal_id, project_id, engine, model, first_pass, rework_cycles, had_high_sentinel, reported_blocked, cost_usd, recorded_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)
             ON CONFLICT(goal_id) DO UPDATE SET
                engine = excluded.engine,
                model = excluded.model,
                first_pass = COALESCE(calibration_facts.first_pass, excluded.first_pass),
                rework_cycles = MAX(calibration_facts.rework_cycles, excluded.rework_cycles),
                had_high_sentinel = MAX(calibration_facts.had_high_sentinel, excluded.had_high_sentinel),
                reported_blocked = MAX(calibration_facts.reported_blocked, excluded.reported_blocked),
                cost_usd = excluded.cost_usd,
                recorded_at = excluded.recorded_at",
            params![
                fact.goal_id,
                fact.project_id,
                fact.engine,
                fact.model,
                fact.first_pass,
                fact.rework_cycles,
                fact.had_high_sentinel,
                fact.reported_blocked,
                fact.cost_usd,
                now,
            ],
        )?;
        Ok(())
    }

    /// Aggregates honest historical calibration facts grouped by `(engine, model)`.
    /// When `project_id` is `Some`, filters to that project; when `None`, aggregates globally.
    pub fn calibration_rows(&self, project_id: Option<&str>) -> Result<Vec<CalibrationRow>> {
        let sql = match project_id {
            Some(_) => {
                "SELECT engine, model,
                        COUNT(*) AS total,
                        SUM(CASE WHEN first_pass = 1 THEN 1 ELSE 0 END) AS fp_yes,
                        SUM(CASE WHEN first_pass IS NOT NULL THEN 1 ELSE 0 END) AS fp_den,
                        AVG(CAST(rework_cycles AS REAL)) AS avg_reworks,
                        AVG(CAST(had_high_sentinel AS REAL)) AS high_sentinel_rate,
                        AVG(CAST(reported_blocked AS REAL)) AS blocked_rate,
                        AVG(cost_usd) AS avg_cost_usd
                 FROM calibration_facts
                 WHERE project_id = ?1
                 GROUP BY engine, model
                 ORDER BY total DESC, engine, model"
            }
            None => {
                "SELECT engine, model,
                        COUNT(*) AS total,
                        SUM(CASE WHEN first_pass = 1 THEN 1 ELSE 0 END) AS fp_yes,
                        SUM(CASE WHEN first_pass IS NOT NULL THEN 1 ELSE 0 END) AS fp_den,
                        AVG(CAST(rework_cycles AS REAL)) AS avg_reworks,
                        AVG(CAST(had_high_sentinel AS REAL)) AS high_sentinel_rate,
                        AVG(CAST(reported_blocked AS REAL)) AS blocked_rate,
                        AVG(cost_usd) AS avg_cost_usd
                 FROM calibration_facts
                 GROUP BY engine, model
                 ORDER BY total DESC, engine, model"
            }
        };
        let map_row = |r: &Row<'_>| -> rusqlite::Result<CalibrationRow> {
            let total: u32 = r.get("total")?;
            let fp_yes: u32 = r.get("fp_yes")?;
            let fp_den: u32 = r.get("fp_den")?;
            let first_pass_rate = if fp_den > 0 { f64::from(fp_yes) / f64::from(fp_den) } else { 0.0 };
            Ok(CalibrationRow {
                engine: r.get("engine")?,
                model: r.get("model")?,
                project_id: project_id.map(String::from),
                goals_total: total,
                first_pass_rate,
                avg_reworks: r.get("avg_reworks")?,
                high_sentinel_rate: r.get("high_sentinel_rate")?,
                blocked_rate: r.get("blocked_rate")?,
                avg_cost_usd: r.get("avg_cost_usd")?,
                sample_sufficient: total >= CALIBRATION_MIN_SAMPLES,
            })
        };
        let mut stmt = self.conn.prepare(sql)?;
        let rows = match project_id {
            Some(pid) => stmt.query_map([pid], map_row)?.collect::<rusqlite::Result<Vec<_>>>()?,
            None => stmt.query_map([], map_row)?.collect::<rusqlite::Result<Vec<_>>>()?,
        };
        Ok(rows)
    }
}

fn normalize_text(s: &str) -> String {
    s.split_whitespace().collect::<Vec<_>>().join(" ").to_ascii_lowercase()
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::test_support::store;

    #[test]
    fn proposals_deduplicate_and_preserve_taint() {
        let (mut s, _) = store();
        let p1 = s
            .create_memory_proposal(NewMemoryProposal {
                scope: MemoryScope::Project,
                project_id: Some("prj_1".into()),
                goal_id: Some("G-0001".into()),
                text: "Use pnpm, never npm".into(),
                detail: String::new(),
                origin: "mined_steering".into(),
                evidence: vec!["steer: Use pnpm, never npm".into()],
                taint_classes: vec![],
            })
            .unwrap();
        assert_eq!(p1.taint_level, TaintLevel::None);

        // Duplicate text in same project merges evidence rather than inserting a second row.
        let p2 = s
            .create_memory_proposal(NewMemoryProposal {
                scope: MemoryScope::Project,
                project_id: Some("prj_1".into()),
                goal_id: Some("G-0002".into()),
                text: "  use   pnpm, never npm ".into(),
                detail: String::new(),
                origin: "mined_steering".into(),
                evidence: vec!["review: pnpm only".into()],
                taint_classes: vec![],
            })
            .unwrap();
        assert_eq!(p1.id, p2.id);
        assert_eq!(p2.evidence.len(), 2);

        let approved = s.resolve_memory_proposal(&p1.id, ProposalStatus::Approved, None).unwrap();
        assert_eq!(approved.status, ProposalStatus::Approved);
        assert!(approved.resolved_at.is_some());
    }

    #[test]
    fn calibration_aggregates_honestly_with_sample_sufficiency() {
        let (mut s, _) = store();
        for i in 0..5 {
            s.upsert_calibration_fact(&CalibrationFactInput {
                goal_id: format!("G-000{}", i + 1),
                project_id: "prj_1".into(),
                engine: "pi".into(),
                model: "anthropic/sonnet".into(),
                first_pass: Some(i < 4),
                rework_cycles: if i < 4 { 0 } else { 2 },
                had_high_sentinel: i == 4,
                reported_blocked: false,
                cost_usd: 1.0,
            })
            .unwrap();
        }
        let rows = s.calibration_rows(Some("prj_1")).unwrap();
        assert_eq!(rows.len(), 1);
        assert_eq!(rows[0].goals_total, 5);
        assert!(rows[0].sample_sufficient);
        assert!((rows[0].first_pass_rate - 0.8).abs() < 1e-6);
        assert!((rows[0].high_sentinel_rate - 0.2).abs() < 1e-6);
    }
}
