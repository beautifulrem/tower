//! The append path: event + projections in one transaction.

use rusqlite::{Transaction, params};
use tower_core::lifecycle::{self, Transition};
use tower_core::view::{DiffStat, LiveLine, PrStatus, PrView, TraceEntry};
use tower_core::{EventKind, LifecycleState, Millis, Mode, PauseReason, Source};

use crate::goals::{enum_str, parse_state};
use crate::{Result, Store, StoreError};

pub(crate) fn insert_event(tx: &Transaction<'_>, goal_id: &str, at: Millis, e: &EventKind) -> Result<i64> {
    tx.execute(
        "INSERT INTO events (goal_id, at, kind, source, payload) VALUES (?1, ?2, ?3, ?4, ?5)",
        params![goal_id, at, e.name(), e.source().as_str(), serde_json::to_string(e)?],
    )?;
    Ok(tx.last_insert_rowid())
}

/// Updates the projections an event affects. Kept next to the insert so the
/// two can never disagree.
fn project(tx: &Transaction<'_>, goal_id: &str, at: Millis, e: &EventKind) -> Result<()> {
    match e {
        EventKind::ContractRatified { contract } => {
            tx.execute(
                "UPDATE goals SET contract = ?2 WHERE id = ?1",
                params![goal_id, serde_json::to_string(contract)?],
            )?;
        }
        EventKind::StateChanged { from, to, reason, .. } => {
            let current: String = tx.query_row("SELECT state FROM goals WHERE id = ?1", [goal_id], |r| r.get(0))?;
            let current = parse_state(&current)?;
            if current != *from {
                return Err(StoreError::Conflict(format!(
                    "goal {goal_id} is {} but the transition expected {}",
                    current.as_str(),
                    from.as_str()
                )));
            }
            let reason = (*to == LifecycleState::Paused).then_some(*reason).flatten().map(|r| enum_str(&r));
            tx.execute(
                "UPDATE goals SET state = ?2, pause_reason = ?3,
                    run_started_at = CASE WHEN ?2 = 'running' THEN run_started_at ELSE NULL END
                 WHERE id = ?1",
                params![goal_id, to.as_str(), reason],
            )?;
        }
        EventKind::WorkspacePrepared { workspace, base_commit } => {
            tx.execute(
                "UPDATE goals SET workspace = ?2, base_commit = ?3 WHERE id = ?1",
                params![goal_id, workspace, base_commit],
            )?;
        }
        EventKind::WorkspaceRemoved => {
            tx.execute("UPDATE goals SET workspace = NULL WHERE id = ?1", [goal_id])?;
        }
        EventKind::SessionAttached { session_file } => {
            tx.execute("UPDATE goals SET session_file = ?2 WHERE id = ?1", params![goal_id, session_file])?;
        }
        EventKind::RunStarted { run_no, purpose, start_pin } => {
            tx.execute(
                "INSERT INTO runs (goal_id, run_no, purpose, started_at, start_pin) VALUES (?1, ?2, ?3, ?4, ?5)
                 ON CONFLICT (goal_id, run_no) DO UPDATE SET ended_at = NULL, outcome = NULL",
                params![goal_id, run_no, purpose, at, start_pin],
            )?;
            tx.execute(
                "UPDATE goals SET run_no = ?2, run_started_at = ?3,
                    rework_cycles = rework_cycles + CASE WHEN ?4 = 'rework' THEN 1 ELSE 0 END
                 WHERE id = ?1",
                params![goal_id, run_no, at, purpose],
            )?;
        }
        EventKind::RunEnded { run_no, outcome } => {
            tx.execute(
                "UPDATE runs SET ended_at = ?3, outcome = ?4 WHERE goal_id = ?1 AND run_no = ?2",
                params![goal_id, run_no, at, outcome],
            )?;
        }
        EventKind::ModeChanged { mode } => {
            tx.execute("UPDATE goals SET mode = ?2 WHERE id = ?1", params![goal_id, enum_str(mode)])?;
            if matches!(mode, Mode::Idle | Mode::Settled) {
                tx.execute("UPDATE goals SET live_line = NULL WHERE id = ?1", [goal_id])?;
            }
        }
        EventKind::ToolStarted { tool, summary, .. } => {
            let line = LiveLine { mode: Mode::for_tool(tool), action: tool.clone(), target: summary.clone(), at };
            tx.execute(
                "UPDATE goals SET live_line = ?2 WHERE id = ?1",
                params![goal_id, serde_json::to_string(&line)?],
            )?;
        }
        EventKind::Claim { claim_id, claim, text, criterion } => {
            let run_no: u32 = tx.query_row("SELECT run_no FROM goals WHERE id = ?1", [goal_id], |r| r.get(0))?;
            tx.execute(
                "INSERT OR REPLACE INTO claims (id, goal_id, kind, text, criterion, at, run_no)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
                params![claim_id, goal_id, enum_str(claim), text, criterion, at, run_no],
            )?;
        }
        EventKind::Submitted { summary } => {
            tx.execute("UPDATE goals SET submit_summary = ?2 WHERE id = ?1", params![goal_id, summary])?;
        }
        EventKind::Pinned { pin, files, additions, deletions } => {
            let stat = DiffStat { files: *files, additions: *additions, deletions: *deletions };
            tx.execute(
                "UPDATE goals SET pin = ?2, diffstat = ?3 WHERE id = ?1",
                params![goal_id, pin, serde_json::to_string(&stat)?],
            )?;
        }
        EventKind::CriterionResult { criterion, pin, passed, exit_code, duration_ms, output_tail } => {
            tx.execute(
                "INSERT OR REPLACE INTO criterion_results
                    (goal_id, criterion, pin, passed, exit_code, duration_ms, output_tail, at)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
                params![goal_id, criterion, pin, passed, exit_code, duration_ms, output_tail, at],
            )?;
        }
        EventKind::BranchPushed { pr_url: Some(url), .. } => {
            let pr = PrView {
                url: url.clone(),
                status: PrStatus { state: "open".into(), passed: 0, failed: 0, pending: 0, failing: Vec::new() },
            };
            tx.execute("UPDATE goals SET pr = ?2 WHERE id = ?1", params![goal_id, serde_json::to_string(&pr)?])?;
        }
        EventKind::PrChecked { url, status } => {
            let pr = PrView { url: url.clone(), status: status.clone() };
            tx.execute("UPDATE goals SET pr = ?2 WHERE id = ?1", params![goal_id, serde_json::to_string(&pr)?])?;
        }
        EventKind::OriginalTestsResult { criterion, pin, passed } => {
            tx.execute(
                "INSERT OR REPLACE INTO original_results (goal_id, criterion, pin, passed) VALUES (?1, ?2, ?3, ?4)",
                params![goal_id, criterion, pin, passed],
            )?;
        }
        EventKind::BaselineResult { criterion, command, base, passed } => {
            tx.execute(
                "INSERT OR REPLACE INTO baseline_results (goal_id, criterion, command, base, passed, at)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
                params![goal_id, criterion, command, base, passed, at],
            )?;
        }
        EventKind::VerifyFinished { pin, passed, .. } => {
            let verified = passed.then_some(pin.as_str());
            tx.execute("UPDATE goals SET verified_pin = ?2 WHERE id = ?1", params![goal_id, verified])?;
        }
        EventKind::Observed { criterion, passed } => {
            tx.execute(
                "INSERT OR REPLACE INTO observations (goal_id, criterion, passed, at) VALUES (?1, ?2, ?3, ?4)",
                params![goal_id, criterion, passed, at],
            )?;
        }
        EventKind::HumanCheck { criterion, checked } => {
            tx.execute(
                "INSERT OR REPLACE INTO human_checks (goal_id, criterion, checked, at) VALUES (?1, ?2, ?3, ?4)",
                params![goal_id, criterion, checked, at],
            )?;
        }
        EventKind::ClaimReviewed { claim_id, approved } => {
            tx.execute(
                "UPDATE claims SET approved = ?3 WHERE id = ?2 AND goal_id = ?1",
                params![goal_id, claim_id, approved],
            )?;
        }
        EventKind::CostUpdated { total_usd } => {
            tx.execute("UPDATE goals SET cost_usd = ?2 WHERE id = ?1", params![goal_id, total_usd])?;
        }
        EventKind::BranchWritten { branch, .. } => {
            tx.execute("UPDATE goals SET branch = ?2 WHERE id = ?1", params![goal_id, branch])?;
        }
        _ => {}
    }
    tx.execute("UPDATE goals SET updated_at = ?2 WHERE id = ?1", params![goal_id, at])?;
    Ok(())
}

fn row_to_trace(r: &rusqlite::Row<'_>) -> rusqlite::Result<TraceEntry> {
    let source: String = r.get("source")?;
    let payload: String = r.get("payload")?;
    Ok(TraceEntry {
        seq: r.get("seq")?,
        goal_id: r.get("goal_id")?,
        at: r.get("at")?,
        source: Source::parse(&source).unwrap_or(Source::System),
        event: serde_json::from_str(&payload).map_err(|e| crate::goals::bad_value("payload", &e.to_string()))?,
    })
}

impl Store {
    /// Appends an event and updates projections atomically.
    pub fn append(&mut self, goal_id: &str, event: EventKind) -> Result<TraceEntry> {
        let at = self.now();
        let tx = self.conn.transaction()?;
        let seq = insert_event(&tx, goal_id, at, &event)?;
        project(&tx, goal_id, at, &event)?;
        tx.commit()?;
        Ok(TraceEntry { seq, goal_id: goal_id.into(), at, source: event.source(), event })
    }

    /// Applies a lifecycle transition through the single transition function
    /// and records it. `reason` is required when the result is `paused`.
    pub fn transition(
        &mut self,
        goal_id: &str,
        t: Transition,
        reason: Option<PauseReason>,
        note: impl Into<String>,
    ) -> Result<TraceEntry> {
        let from = self.goal(goal_id)?.state;
        let to = lifecycle::apply(from, t).map_err(|e| StoreError::Conflict(e.to_string()))?;
        let reason = match t {
            Transition::Pause { reason } => Some(reason),
            _ => reason,
        };
        if to == LifecycleState::Paused && reason.is_none() {
            return Err(StoreError::Conflict(format!("transition {t:?} to paused needs a reason")));
        }
        self.append(goal_id, EventKind::StateChanged { from, to, reason, note: note.into() })
    }

    /// Trace page, newest first, before `before_seq` (exclusive).
    pub fn trace(&self, goal_id: &str, before_seq: Option<i64>, limit: u32) -> Result<Vec<TraceEntry>> {
        let mut stmt =
            self.conn.prepare("SELECT * FROM events WHERE goal_id = ?1 AND seq < ?2 ORDER BY seq DESC LIMIT ?3")?;
        let rows = stmt.query_map(params![goal_id, before_seq.unwrap_or(i64::MAX), limit], row_to_trace)?;
        Ok(rows.collect::<rusqlite::Result<_>>()?)
    }

    pub fn events_since(&self, goal_id: &str, since: Millis) -> Result<Vec<TraceEntry>> {
        let mut stmt = self.conn.prepare("SELECT * FROM events WHERE goal_id = ?1 AND at > ?2 ORDER BY seq")?;
        let rows = stmt.query_map(params![goal_id, since], row_to_trace)?;
        Ok(rows.collect::<rusqlite::Result<_>>()?)
    }

    /// Sentinel findings since the latest verification started. Titles of
    /// known sentinels follow the current language.
    pub fn sentinel_hits(&self, goal_id: &str) -> Result<Vec<tower_core::sentinel::SentinelHit>> {
        let since: i64 = self.conn.query_row(
            "SELECT COALESCE(MAX(seq), 0) FROM events WHERE goal_id = ?1 AND kind = 'verify_started'",
            [goal_id],
            |r| r.get(0),
        )?;
        let mut stmt = self
            .conn
            .prepare("SELECT * FROM events WHERE goal_id = ?1 AND kind = 'sentinel_hit' AND seq > ?2 ORDER BY seq")?;
        let rows = stmt.query_map(params![goal_id, since], row_to_trace)?;
        let lang = self.lang();
        let mut out = Vec::new();
        for r in rows {
            if let EventKind::SentinelHit { sentinel, severity, title, detail } = r?.event {
                let title = tower_core::i18n::sentinel_title(&sentinel, lang).map(String::from).unwrap_or(title);
                out.push(tower_core::sentinel::SentinelHit { sentinel, severity, title, detail });
            }
        }
        Ok(out)
    }

    /// The most recent event of a kind, used e.g. to find the last failure.
    pub fn last_event(&self, goal_id: &str, kind: &str) -> Result<Option<TraceEntry>> {
        use rusqlite::OptionalExtension;
        Ok(self
            .conn
            .query_row(
                "SELECT * FROM events WHERE goal_id = ?1 AND kind = ?2 ORDER BY seq DESC LIMIT 1",
                params![goal_id, kind],
                row_to_trace,
            )
            .optional()?)
    }
}

#[cfg(test)]
mod tests {
    use tower_core::contract::Contract;

    use super::*;
    use crate::test_support::store;
    use crate::{NewGoal, NewProject};

    fn goal(s: &mut Store) -> String {
        let p = s
            .add_project(NewProject {
                name: "a".into(),
                root: "/a".into(),
                base_branch: "main".into(),
                test_command: None,
            })
            .unwrap();
        s.create_goal(NewGoal {
            project_id: p.id,
            title: "t".into(),
            contract: Contract::quick("x", None, tower_core::Lang::En),
        })
        .unwrap()
        .id
    }

    #[test]
    fn transitions_go_through_the_state_machine() {
        let (mut s, _) = store();
        let id = goal(&mut s);
        assert!(s.transition(&id, Transition::Submitted, None, "").is_err(), "draft cannot be claimed");
        s.transition(&id, Transition::Ratify, None, "").unwrap();
        s.transition(&id, Transition::Pause { reason: PauseReason::Human }, None, "").unwrap();
        let g = s.goal(&id).unwrap();
        assert_eq!(g.state, LifecycleState::Paused);
        assert_eq!(g.pause_reason, Some(PauseReason::Human));
        s.transition(&id, Transition::RunStarted, None, "").unwrap();
        assert_eq!(s.goal(&id).unwrap().pause_reason, None);
    }

    #[test]
    fn a_stale_state_change_is_rejected() {
        let (mut s, _) = store();
        let id = goal(&mut s);
        let err = s.append(
            &id,
            EventKind::StateChanged {
                from: LifecycleState::Running,
                to: LifecycleState::Claimed,
                reason: None,
                note: String::new(),
            },
        );
        assert!(matches!(err, Err(StoreError::Conflict(_))));
        // Nothing was written: the transaction rolled back.
        assert_eq!(s.trace(&id, None, 10).unwrap().len(), 1);
    }

    #[test]
    fn rework_runs_are_counted() {
        let (mut s, _) = store();
        let id = goal(&mut s);
        s.append(&id, EventKind::RunStarted { run_no: 1, purpose: "initial".into(), start_pin: None }).unwrap();
        s.append(&id, EventKind::RunStarted { run_no: 2, purpose: "rework".into(), start_pin: None }).unwrap();
        let g = s.goal(&id).unwrap();
        assert_eq!((g.run_no, g.rework_cycles), (2, 1));
    }

    #[test]
    fn trace_pages_newest_first() {
        let (mut s, _) = store();
        let id = goal(&mut s);
        for i in 0..5 {
            s.append(&id, EventKind::Note { text: i.to_string() }).unwrap();
        }
        let page = s.trace(&id, None, 3).unwrap();
        assert_eq!(page.len(), 3);
        let next = s.trace(&id, Some(page[2].seq), 10).unwrap();
        assert_eq!(next.len(), 3, "two notes plus goal_created");
    }
}
