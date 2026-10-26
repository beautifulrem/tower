use rusqlite::{OptionalExtension, Row, params};
use tower_core::briefing;
use tower_core::contract::{Contract, CriterionKind};
use tower_core::honesty::{ClaimKind, Consistency, CriterionFact, Progress, judge_criterion_claim};
use tower_core::view::{
    BriefingItem, ClaimView, CriterionResultView, CriterionView, DiffStat, GoalDetail, GoalSummary, LiveLine,
    ObservationView, RunView,
};
use tower_core::{EventKind, LifecycleState, Millis, Mode, PauseReason};

use crate::{Result, Store, StoreError};

#[derive(Debug, Clone)]
pub struct NewGoal {
    pub project_id: String,
    pub title: String,
    pub contract: Contract,
}

/// Everything the supervisor needs to act on a goal.
#[derive(Debug, Clone)]
pub struct GoalRecord {
    pub id: String,
    pub project_id: String,
    pub project_root: String,
    pub base_branch: String,
    pub title: String,
    pub state: LifecycleState,
    pub pause_reason: Option<PauseReason>,
    pub mode: Mode,
    pub contract: Contract,
    pub workspace: Option<String>,
    pub base_commit: Option<String>,
    pub pin: Option<String>,
    pub verified_pin: Option<String>,
    pub branch: Option<String>,
    pub session_file: Option<String>,
    pub submit_summary: Option<String>,
    pub run_no: u32,
    pub rework_cycles: u32,
    pub cost_usd: f64,
    pub run_started_at: Option<Millis>,
}

pub(crate) fn parse_state(s: &str) -> rusqlite::Result<LifecycleState> {
    LifecycleState::parse(s).ok_or_else(|| bad_value("state", s))
}

pub(crate) fn bad_value(column: &str, value: &str) -> rusqlite::Error {
    rusqlite::Error::FromSqlConversionFailure(
        0,
        rusqlite::types::Type::Text,
        format!("unexpected {column}: {value}").into(),
    )
}

pub(crate) fn json_col<T: serde::de::DeserializeOwned>(r: &Row<'_>, col: &str) -> rusqlite::Result<T> {
    let raw: String = r.get(col)?;
    serde_json::from_str(&raw).map_err(|e| bad_value(col, &e.to_string()))
}

pub(crate) fn opt_json_col<T: serde::de::DeserializeOwned>(r: &Row<'_>, col: &str) -> rusqlite::Result<Option<T>> {
    let raw: Option<String> = r.get(col)?;
    raw.map(|s| serde_json::from_str(&s).map_err(|e| bad_value(col, &e.to_string()))).transpose()
}

pub(crate) fn enum_col<T: serde::de::DeserializeOwned>(r: &Row<'_>, col: &str) -> rusqlite::Result<T> {
    let raw: String = r.get(col)?;
    serde_json::from_value(serde_json::Value::String(raw.clone())).map_err(|_| bad_value(col, &raw))
}

pub(crate) fn opt_enum_col<T: serde::de::DeserializeOwned>(r: &Row<'_>, col: &str) -> rusqlite::Result<Option<T>> {
    let raw: Option<String> = r.get(col)?;
    raw.map(|s| serde_json::from_value(serde_json::Value::String(s.clone())).map_err(|_| bad_value(col, &s)))
        .transpose()
}

pub(crate) fn enum_str<T: serde::Serialize>(v: &T) -> String {
    match serde_json::to_value(v) {
        Ok(serde_json::Value::String(s)) => s,
        other => panic!("enum did not serialize to a string: {other:?}"),
    }
}

const RECORD_SQL: &str = "SELECT g.*, p.root AS project_root, p.base_branch AS base_branch, p.name AS project_name
     FROM goals g JOIN projects p ON p.id = g.project_id";

fn row_to_record(r: &Row<'_>) -> rusqlite::Result<GoalRecord> {
    Ok(GoalRecord {
        id: r.get("id")?,
        project_id: r.get("project_id")?,
        project_root: r.get("project_root")?,
        base_branch: r.get("base_branch")?,
        title: r.get("title")?,
        state: parse_state(&r.get::<_, String>("state")?)?,
        pause_reason: opt_enum_col(r, "pause_reason")?,
        mode: enum_col(r, "mode")?,
        contract: json_col(r, "contract")?,
        workspace: r.get("workspace")?,
        base_commit: r.get("base_commit")?,
        pin: r.get("pin")?,
        verified_pin: r.get("verified_pin")?,
        branch: r.get("branch")?,
        session_file: r.get("session_file")?,
        submit_summary: r.get("submit_summary")?,
        run_no: r.get("run_no")?,
        rework_cycles: r.get("rework_cycles")?,
        cost_usd: r.get("cost_usd")?,
        run_started_at: r.get("run_started_at")?,
    })
}

impl Store {
    /// Creates a goal in `draft`. The contract is stored as a draft and only
    /// becomes binding when ratified.
    pub fn create_goal(&mut self, g: NewGoal) -> Result<GoalRecord> {
        self.project(&g.project_id)?;
        let now = self.now();
        let tx = self.conn.transaction()?;
        let seq: i64 = tx.query_row("SELECT COALESCE(MAX(seq), 0) + 1 FROM goals", [], |r| r.get(0))?;
        let id = format!("G-{seq:04}");
        tx.execute(
            "INSERT INTO goals (id, seq, project_id, title, state, contract, created_at, updated_at)
             VALUES (?1, ?2, ?3, ?4, 'draft', ?5, ?6, ?6)",
            params![id, seq, g.project_id, g.title, serde_json::to_string(&g.contract)?, now],
        )?;
        crate::events::insert_event(&tx, &id, now, &EventKind::GoalCreated { title: g.title.clone() })?;
        tx.commit()?;
        self.goal(&id)
    }

    pub fn goal(&self, id: &str) -> Result<GoalRecord> {
        self.conn
            .query_row(&format!("{RECORD_SQL} WHERE g.id = ?1"), [id], row_to_record)
            .optional()?
            .ok_or_else(|| StoreError::NotFound(format!("goal {id}")))
    }

    pub fn goals_in_state(&self, state: LifecycleState) -> Result<Vec<GoalRecord>> {
        let mut stmt = self.conn.prepare(&format!("{RECORD_SQL} WHERE g.state = ?1 ORDER BY g.seq"))?;
        let rows = stmt.query_map([state.as_str()], row_to_record)?;
        Ok(rows.collect::<rusqlite::Result<_>>()?)
    }

    /// Replaces the draft contract (before ratification) or the title.
    pub fn update_draft(&mut self, id: &str, title: &str, contract: &Contract) -> Result<()> {
        let g = self.goal(id)?;
        if g.state != LifecycleState::Draft {
            return Err(StoreError::Conflict("只有草稿可以直接修改合同；已批准的合同请修订".into()));
        }
        let now = self.now();
        self.conn.execute(
            "UPDATE goals SET title = ?2, contract = ?3, updated_at = ?4 WHERE id = ?1",
            params![id, title, serde_json::to_string(contract)?, now],
        )?;
        Ok(())
    }

    pub fn mark_viewed(&mut self, id: &str) -> Result<()> {
        let now = self.now();
        self.conn.execute("UPDATE goals SET last_viewed_at = ?2 WHERE id = ?1", params![id, now])?;
        Ok(())
    }

    pub fn set_human_check(&mut self, goal_id: &str, criterion: &str, checked: bool) -> Result<()> {
        self.append(goal_id, EventKind::HumanCheck { criterion: criterion.into(), checked })?;
        Ok(())
    }

    pub fn summaries(&self) -> Result<Vec<GoalSummary>> {
        let mut stmt = self.conn.prepare(&format!("{RECORD_SQL} ORDER BY g.seq DESC"))?;
        let rows = stmt.query_map([], |r| {
            Ok((
                row_to_record(r)?,
                r.get::<_, String>("project_name")?,
                opt_json_col::<LiveLine>(r, "live_line")?,
                opt_json_col::<DiffStat>(r, "diffstat")?,
                r.get::<_, Millis>("created_at")?,
                r.get::<_, Millis>("updated_at")?,
                r.get::<_, Option<Millis>>("last_viewed_at")?,
            ))
        })?;
        let mut out = Vec::new();
        for row in rows {
            let (rec, project_name, live_line, diffstat, created_at, updated_at, last_viewed_at) = row?;
            out.push(self.build_summary(rec, project_name, live_line, diffstat, created_at, updated_at, last_viewed_at)?);
        }
        Ok(out)
    }

    pub fn summary(&self, id: &str) -> Result<GoalSummary> {
        let row = self
            .conn
            .query_row(&format!("{RECORD_SQL} WHERE g.id = ?1"), [id], |r| {
                Ok((
                    row_to_record(r)?,
                    r.get::<_, String>("project_name")?,
                    opt_json_col::<LiveLine>(r, "live_line")?,
                    opt_json_col::<DiffStat>(r, "diffstat")?,
                    r.get::<_, Millis>("created_at")?,
                    r.get::<_, Millis>("updated_at")?,
                    r.get::<_, Option<Millis>>("last_viewed_at")?,
                ))
            })
            .optional()?
            .ok_or_else(|| StoreError::NotFound(format!("goal {id}")))?;
        let (rec, project_name, live_line, diffstat, created_at, updated_at, last_viewed_at) = row;
        self.build_summary(rec, project_name, live_line, diffstat, created_at, updated_at, last_viewed_at)
    }

    #[allow(clippy::too_many_arguments)]
    fn build_summary(
        &self,
        rec: GoalRecord,
        project_name: String,
        live_line: Option<LiveLine>,
        diffstat: Option<DiffStat>,
        created_at: Millis,
        updated_at: Millis,
        last_viewed_at: Option<Millis>,
    ) -> Result<GoalSummary> {
        let progress = self.progress(&rec)?;
        let needs_you: u32 = self.conn.query_row(
            "SELECT COUNT(*) FROM inbox WHERE goal_id = ?1 AND resolved_at IS NULL",
            [&rec.id],
            |r| r.get(0),
        )?;
        Ok(GoalSummary {
            id: rec.id,
            project_id: rec.project_id,
            project_name,
            title: rec.title,
            state: rec.state,
            pause_reason: rec.pause_reason,
            mode: rec.mode,
            live_line,
            progress,
            diffstat,
            cost_usd: rec.cost_usd,
            budget: rec.contract.budget,
            run_no: rec.run_no,
            rework_cycles: rec.rework_cycles,
            max_rework: rec.contract.max_rework,
            needs_you,
            verified_pin: rec.verified_pin,
            branch: rec.branch,
            created_at,
            updated_at,
            run_started_at: rec.run_started_at,
            last_viewed_at,
        })
    }

    fn progress(&self, rec: &GoalRecord) -> Result<Progress> {
        let machine: Vec<&str> = rec.contract.machine_criteria().map(|c| c.id.as_str()).collect();
        let human: Vec<&str> = rec.contract.human_criteria().map(|c| c.id.as_str()).collect();
        let mut p = Progress { machine: machine.len() as u32, human: human.len() as u32, ..Default::default() };
        let mut stmt = self.conn.prepare("SELECT criterion, passed, pin FROM criterion_results WHERE goal_id = ?1")?;
        for row in stmt.query_map([&rec.id], |r| Ok((r.get::<_, String>(0)?, r.get::<_, bool>(1)?, r.get::<_, String>(2)?)))? {
            let (c, passed, pin) = row?;
            if passed && machine.contains(&c.as_str()) && rec.pin.as_deref() == Some(pin.as_str()) {
                p.verified += 1;
            }
        }
        let mut stmt = self.conn.prepare("SELECT criterion, passed FROM observations WHERE goal_id = ?1")?;
        for row in stmt.query_map([&rec.id], |r| Ok((r.get::<_, String>(0)?, r.get::<_, bool>(1)?)))? {
            let (c, passed) = row?;
            if passed && machine.contains(&c.as_str()) {
                p.observed += 1;
            }
        }
        let mut stmt = self.conn.prepare("SELECT criterion, checked FROM human_checks WHERE goal_id = ?1")?;
        for row in stmt.query_map([&rec.id], |r| Ok((r.get::<_, String>(0)?, r.get::<_, bool>(1)?)))? {
            let (c, checked) = row?;
            if checked && human.contains(&c.as_str()) {
                p.human_done += 1;
            }
        }
        Ok(p)
    }

    pub fn detail(&self, id: &str) -> Result<GoalDetail> {
        let summary = self.summary(id)?;
        let rec = self.goal(id)?;

        let mut results = std::collections::HashMap::new();
        let mut stmt = self.conn.prepare(
            "SELECT criterion, pin, passed, exit_code, duration_ms, output_tail, at FROM criterion_results WHERE goal_id = ?1",
        )?;
        for row in stmt.query_map([id], |r| {
            Ok((
                r.get::<_, String>(0)?,
                CriterionResultView {
                    pin: r.get(1)?,
                    passed: r.get(2)?,
                    exit_code: r.get(3)?,
                    duration_ms: r.get(4)?,
                    output_tail: r.get(5)?,
                    at: r.get(6)?,
                    stale: false,
                },
            ))
        })? {
            let (c, mut v) = row?;
            v.stale = rec.pin.as_deref() != Some(v.pin.as_str());
            results.insert(c, v);
        }
        let mut observed = std::collections::HashMap::new();
        let mut stmt = self.conn.prepare("SELECT criterion, passed, at FROM observations WHERE goal_id = ?1")?;
        for row in stmt.query_map([id], |r| {
            Ok((r.get::<_, String>(0)?, ObservationView { passed: r.get(1)?, at: r.get(2)? }))
        })? {
            let (c, v) = row?;
            observed.insert(c, v);
        }
        let mut checks = std::collections::HashMap::new();
        let mut stmt = self.conn.prepare("SELECT criterion, checked FROM human_checks WHERE goal_id = ?1")?;
        for row in stmt.query_map([id], |r| Ok((r.get::<_, String>(0)?, r.get::<_, bool>(1)?)))? {
            let (c, v) = row?;
            checks.insert(c, v);
        }

        let criteria = rec
            .contract
            .criteria
            .iter()
            .map(|c| CriterionView {
                criterion: c.clone(),
                verified: match c.kind {
                    CriterionKind::Exec { .. } => results.get(&c.id).cloned(),
                    CriterionKind::Human => None,
                },
                observed: observed.get(&c.id).cloned(),
                human_checked: checks.get(&c.id).copied().unwrap_or(false),
            })
            .collect();

        let mut stmt = self.conn.prepare(
            "SELECT id, kind, text, criterion, at, run_no, approved FROM claims WHERE goal_id = ?1 ORDER BY at, rowid",
        )?;
        let claims = stmt
            .query_map([id], |r| {
                Ok((
                    r.get::<_, String>(0)?,
                    r.get::<_, String>(1)?,
                    r.get::<_, String>(2)?,
                    r.get::<_, Option<String>>(3)?,
                    r.get::<_, Millis>(4)?,
                    r.get::<_, u32>(5)?,
                    r.get::<_, Option<bool>>(6)?,
                ))
            })?
            .collect::<rusqlite::Result<Vec<_>>>()?
            .into_iter()
            .map(|(cid, kind, text, criterion, at, run_no, approved)| {
                let kind = ClaimKind::parse(&kind).unwrap_or(ClaimKind::Progress);
                let fact = criterion.as_ref().and_then(|c| results.get(c));
                let (consistency, evidence) = match (kind, fact) {
                    (ClaimKind::CriterionMet, f) => {
                        let consistency = judge_criterion_claim(
                            f.map(|f| CriterionFact { passed: f.passed, pin: &f.pin }),
                            rec.pin.as_deref(),
                        );
                        let evidence = f.map(|f| {
                            format!(
                                "验证器：{} {} @{}",
                                criterion.as_deref().unwrap_or(""),
                                if f.passed { "通过" } else { "失败" },
                                short(&f.pin)
                            )
                        });
                        (consistency, evidence)
                    }
                    _ => (Consistency::Unsupported, None),
                };
                ClaimView { id: cid, kind, text, criterion, at, run_no, approved, consistency, evidence }
            })
            .collect();

        let mut stmt = self.conn.prepare(
            "SELECT run_no, purpose, started_at, ended_at, outcome FROM runs WHERE goal_id = ?1 ORDER BY run_no",
        )?;
        let runs = stmt
            .query_map([id], |r| {
                Ok(RunView {
                    run_no: r.get(0)?,
                    purpose: r.get(1)?,
                    started_at: r.get(2)?,
                    ended_at: r.get(3)?,
                    outcome: r.get(4)?,
                })
            })?
            .collect::<rusqlite::Result<_>>()?;

        let briefing = match summary.last_viewed_at {
            None => Vec::new(),
            Some(since) => self
                .events_since(id, since)?
                .into_iter()
                .filter_map(|e| {
                    briefing::describe(&e.event).map(|text| BriefingItem { source: e.source, text, at: e.at })
                })
                .collect(),
        };

        Ok(GoalDetail {
            summary,
            contract: rec.contract,
            criteria,
            claims,
            runs,
            workspace: rec.workspace,
            base_commit: rec.base_commit,
            pin: rec.pin,
            session_file: rec.session_file,
            submit_summary: rec.submit_summary,
            briefing,
        })
    }
}

pub(crate) fn short(sha: &str) -> &str {
    &sha[..sha.len().min(7)]
}

#[cfg(test)]
mod tests {
    use tower_core::contract::Contract;

    use super::*;
    use crate::NewProject;
    use crate::test_support::store;

    pub(crate) fn seeded() -> (Store, crate::test_support::TestClock, String) {
        let (mut s, clock) = store();
        let p = s
            .add_project(NewProject {
                name: "web".into(),
                root: "/r/web".into(),
                base_branch: "main".into(),
                test_command: None,
            })
            .unwrap();
        let g = s
            .create_goal(NewGoal {
                project_id: p.id,
                title: "修复重复扣款".into(),
                contract: Contract::quick("同一订单只扣款一次", Some("pnpm test".into())),
            })
            .unwrap();
        (s, clock, g.id)
    }

    #[test]
    fn goals_get_sequential_human_ids() {
        let (mut s, _, id) = seeded();
        assert_eq!(id, "G-0001");
        let g = s.goal(&id).unwrap();
        let g2 = s
            .create_goal(NewGoal { project_id: g.project_id, title: "b".into(), contract: g.contract })
            .unwrap();
        assert_eq!(g2.id, "G-0002");
        assert_eq!(s.summaries().unwrap().len(), 2);
    }

    #[test]
    fn verified_progress_counts_only_results_on_the_current_pin() {
        let (mut s, _, id) = seeded();
        s.append(&id, EventKind::Pinned { pin: "aaa".into(), files: 1, additions: 2, deletions: 0 }).unwrap();
        s.append(
            &id,
            EventKind::CriterionResult {
                criterion: "C1".into(),
                pin: "aaa".into(),
                passed: true,
                exit_code: Some(0),
                duration_ms: 5,
                output_tail: String::new(),
            },
        )
        .unwrap();
        assert_eq!(s.summary(&id).unwrap().progress.verified, 1);

        // The agent kept editing: a new snapshot makes the old result stale.
        s.append(&id, EventKind::Pinned { pin: "bbb".into(), files: 1, additions: 3, deletions: 0 }).unwrap();
        assert_eq!(s.summary(&id).unwrap().progress.verified, 0);
        let d = s.detail(&id).unwrap();
        assert!(d.criteria[0].verified.as_ref().unwrap().stale);
    }

    #[test]
    fn criterion_claims_are_judged_in_the_ledger() {
        let (mut s, _, id) = seeded();
        s.append(
            &id,
            EventKind::Claim {
                claim_id: "c1".into(),
                claim: ClaimKind::CriterionMet,
                text: "C1 已满足".into(),
                criterion: Some("C1".into()),
            },
        )
        .unwrap();
        assert_eq!(s.detail(&id).unwrap().claims[0].consistency, Consistency::Unsupported);

        s.append(&id, EventKind::Pinned { pin: "aaa".into(), files: 1, additions: 1, deletions: 0 }).unwrap();
        s.append(
            &id,
            EventKind::CriterionResult {
                criterion: "C1".into(),
                pin: "aaa".into(),
                passed: false,
                exit_code: Some(1),
                duration_ms: 5,
                output_tail: "1 failed".into(),
            },
        )
        .unwrap();
        let claim = &s.detail(&id).unwrap().claims[0];
        assert_eq!(claim.consistency, Consistency::Contradicted);
        assert!(claim.evidence.as_deref().unwrap().contains("失败"));
    }

    #[test]
    fn claims_with_the_same_engine_id_in_different_goals_do_not_collide() {
        let (mut s, _, a) = seeded();
        let g = s.goal(&a).unwrap();
        let b = s.create_goal(NewGoal { project_id: g.project_id, title: "b".into(), contract: g.contract }).unwrap().id;
        for (goal, text) in [(&a, "a 的原因"), (&b, "b 的原因")] {
            s.append(goal, EventKind::Claim { claim_id: "r1:call_1".into(), claim: ClaimKind::Cause, text: text.into(), criterion: None })
                .unwrap();
        }
        assert_eq!(s.detail(&a).unwrap().claims[0].text, "a 的原因");
        assert_eq!(s.detail(&b).unwrap().claims[0].text, "b 的原因");
    }

    #[test]
    fn briefing_lists_what_changed_since_last_view() {
        let (mut s, clock, id) = seeded();
        s.mark_viewed(&id).unwrap();
        clock.advance(10);
        s.append(&id, EventKind::ToolStarted { call_id: "1".into(), tool: "read".into(), summary: "a".into() })
            .unwrap();
        s.append(&id, EventKind::Submitted { summary: "done".into() }).unwrap();
        let b = s.detail(&id).unwrap().briefing;
        assert_eq!(b.len(), 1);
        assert_eq!(b[0].text, "Agent 称已完成");
    }
}
