//! Goal summaries, the board's read model. `summaries` builds every goal's
//! in one pass (the phone page reads it every second it is open): what is
//! shared between goals — open Needs-You counts, dependencies, the files
//! unmerged goals change — is read once, not once per goal. `summary`
//! builds one goal's with the same code.

use std::collections::{BTreeSet, HashMap};

use rusqlite::{OptionalExtension, Row};
use tower_core::LifecycleState;
use tower_core::honesty::Progress;
use tower_core::view::{DiffStat, GoalSummary, LiveLine, Overlap};

use crate::goals::{GoalRecord, RECORD_SQL, opt_json_col, row_to_record};
use crate::{Result, Store, StoreError};

/// A goal's row as the board reads it.
struct SummaryRow {
    rec: GoalRecord,
    project_name: String,
    live_line: Option<LiveLine>,
    diffstat: Option<DiffStat>,
    created_at: tower_core::Millis,
    updated_at: tower_core::Millis,
    last_viewed_at: Option<tower_core::Millis>,
    touched: String,
    pr: Option<String>,
    port_base: Option<i64>,
}

fn summary_row(r: &Row<'_>) -> rusqlite::Result<SummaryRow> {
    Ok(SummaryRow {
        rec: row_to_record(r)?,
        project_name: r.get("project_name")?,
        live_line: opt_json_col(r, "live_line")?,
        diffstat: opt_json_col(r, "diffstat")?,
        created_at: r.get("created_at")?,
        updated_at: r.get("updated_at")?,
        last_viewed_at: r.get("last_viewed_at")?,
        touched: r.get("touched")?,
        pr: r.get("pr")?,
        port_base: r.get("port_base")?,
    })
}

/// The files each unmerged goal changes, by project, with an index from
/// file to goals so a goal finds the goals it overlaps without comparing
/// itself with every other goal.
#[derive(Default)]
struct Touching {
    /// `(project, goal)` → (title, files as stored, sorted).
    goals: HashMap<(String, String), (String, Vec<String>)>,
    /// `(project, file)` → the goals that change it.
    by_file: HashMap<(String, String), Vec<String>>,
}

impl Touching {
    /// From `(id, project, title, state, touched)` of a project's goals.
    fn build<'a>(goals: impl Iterator<Item = (&'a str, &'a str, &'a str, LifecycleState, &'a str)>) -> Result<Self> {
        let mut t = Touching::default();
        for (id, project, title, state, touched) in goals {
            if !state.is_unmerged_work() {
                continue;
            }
            let mut files: Vec<String> = serde_json::from_str(touched)?;
            files.sort();
            let mut last = None;
            for f in &files {
                if last != Some(f) {
                    t.by_file.entry((project.to_string(), f.clone())).or_default().push(id.to_string());
                }
                last = Some(f);
            }
            t.goals.insert((project.to_string(), id.to_string()), (title.to_string(), files));
        }
        Ok(t)
    }

    /// Unfinished goals of the same project that change files `rec` changes,
    /// by id, each with the first five shared files (sorted) and their count.
    fn overlaps(&self, rec: &GoalRecord) -> Vec<Overlap> {
        let key = (rec.project_id.clone(), rec.id.clone());
        let Some((_, mine)) = self.goals.get(&key).filter(|_| rec.state.is_unmerged_work()) else {
            return Vec::new();
        };
        let mut others: BTreeSet<&String> = BTreeSet::new();
        let mut file = (rec.project_id.clone(), String::new());
        for f in mine {
            f.clone_into(&mut file.1);
            others.extend(self.by_file.get(&file).into_iter().flatten().filter(|id| **id != rec.id));
        }
        let mut out = Vec::new();
        for id in others {
            let (title, theirs) = &self.goals[&(rec.project_id.clone(), id.clone())];
            // Both sorted: walk them together. Each of theirs that is also
            // mine counts, so the shared files come out sorted.
            let mut j = 0;
            let mut common: Vec<&String> = Vec::new();
            for f in theirs {
                while j < mine.len() && mine[j] < *f {
                    j += 1;
                }
                if j < mine.len() && mine[j] == *f {
                    common.push(f);
                }
            }
            let total = common.len() as u32;
            let files = common.into_iter().take(5).cloned().collect();
            out.push(Overlap { goal_id: id.clone(), title: title.clone(), files, total });
        }
        out
    }
}

/// What summaries share: read once per call.
struct Board {
    touching: Touching,
    needs_you: HashMap<String, u32>,
    /// `None` when the dependencies could not be read: each goal then shows
    /// its contract's.
    depends_on: Option<HashMap<String, Vec<String>>>,
}

impl Store {
    pub fn summaries(&self) -> Result<Vec<GoalSummary>> {
        let mut stmt = self.conn.prepare_cached(&format!("{RECORD_SQL} ORDER BY g.seq DESC"))?;
        let rows: Vec<SummaryRow> = stmt.query_map([], summary_row)?.collect::<rusqlite::Result<_>>()?;
        let touching = Touching::build(rows.iter().map(|r| {
            (r.rec.id.as_str(), r.rec.project_id.as_str(), r.rec.title.as_str(), r.rec.state, r.touched.as_str())
        }))?;
        let board = Board { touching, needs_you: self.needs_you(None)?, depends_on: self.dependencies(None).ok() };
        rows.into_iter().map(|row| self.build_summary(row, &board)).collect()
    }

    pub fn summary(&self, id: &str) -> Result<GoalSummary> {
        let row = self
            .conn
            .prepare_cached(&format!("{RECORD_SQL} WHERE g.id = ?1"))?
            .query_row([id], summary_row)
            .optional()?
            .ok_or_else(|| StoreError::NotFound(format!("goal {id}")))?;
        // Only unmerged work overlaps: other goals need not be read.
        let touching = if row.rec.state.is_unmerged_work() {
            let mut stmt =
                self.conn.prepare_cached("SELECT id, title, state, touched FROM goals WHERE project_id = ?1")?;
            let project: Vec<(String, String, String, String)> = stmt
                .query_map([&row.rec.project_id], |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?, r.get(3)?)))?
                .collect::<rusqlite::Result<_>>()?;
            let pid = row.rec.project_id.as_str();
            Touching::build(project.iter().filter_map(|(id, title, state, touched)| {
                Some((id.as_str(), pid, title.as_str(), LifecycleState::parse(state)?, touched.as_str()))
            }))?
        } else {
            Touching::default()
        };
        let board =
            Board { touching, needs_you: self.needs_you(Some(id))?, depends_on: self.dependencies(Some(id)).ok() };
        self.build_summary(row, &board)
    }

    /// Open Needs-You items per goal (of `goal` only, when given).
    fn needs_you(&self, goal: Option<&str>) -> Result<HashMap<String, u32>> {
        let mut stmt = self.conn.prepare_cached(
            "SELECT goal_id, COUNT(*) FROM inbox WHERE resolved_at IS NULL AND (?1 IS NULL OR goal_id = ?1)
             GROUP BY goal_id",
        )?;
        let rows = stmt.query_map([goal], |r| Ok((r.get(0)?, r.get(1)?)))?;
        Ok(rows.collect::<rusqlite::Result<_>>()?)
    }

    /// Each goal's prerequisites, sorted (of `goal` only, when given).
    fn dependencies(&self, goal: Option<&str>) -> Result<HashMap<String, Vec<String>>> {
        let mut stmt = self.conn.prepare_cached(
            "SELECT goal_id, depends_on_goal_id FROM goal_dependencies WHERE ?1 IS NULL OR goal_id = ?1
             ORDER BY goal_id, depends_on_goal_id",
        )?;
        let mut out: HashMap<String, Vec<String>> = HashMap::new();
        for row in stmt.query_map([goal], |r| Ok((r.get::<_, String>(0)?, r.get::<_, String>(1)?)))? {
            let (g, dep) = row?;
            out.entry(g).or_default().push(dep);
        }
        Ok(out)
    }

    fn build_summary(&self, row: SummaryRow, board: &Board) -> Result<GoalSummary> {
        let SummaryRow { rec, project_name, live_line, diffstat, created_at, updated_at, last_viewed_at, .. } = row;
        let progress = self.progress(&rec)?;
        let depends_on = match &board.depends_on {
            Some(deps) => deps.get(&rec.id).cloned().unwrap_or_default(),
            None => rec.contract.depends_on.clone(),
        };
        Ok(GoalSummary {
            engine: rec.contract.engine.clone(),
            sandbox_tier: rec.contract.sandbox_tier,
            port_base: row.port_base.and_then(|p| u16::try_from(p).ok()),
            depends_on,
            overlaps: board.touching.overlaps(&rec),
            pr: row.pr.map(|p| serde_json::from_str(&p)).transpose()?,
            needs_you: board.needs_you.get(&rec.id).copied().unwrap_or(0),
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
        // A pass under a high-severity finding of the latest verification
        // is not evidence until you have looked (the seal says so too).
        let hits = self.sentinel_hits(&rec.id)?;
        let held = hits.iter().any(|h| h.severity >= tower_core::sentinel::HIGH);
        // Below that severity a finding on the test machinery qualifies a
        // pass instead (`07` §7.10.3): it counts, with the caveat said.
        let mut q = tower_core::honesty::Qualified::default();
        for h in hits.iter().filter(|h| h.severity < tower_core::sentinel::HIGH) {
            match h.sentinel.as_str() {
                "source_patches_tests" | "source_touches_tests" | "runner_patched" => q.test_machinery = true,
                "assertions_unchecked" | "assertion_identity_unchecked" => q.assertions_unchecked = true,
                _ => {}
            }
        }
        // A pass whose must-fail canary passed too is not evidence.
        let mut stmt = self.conn.prepare_cached(
            "SELECT r.criterion, r.passed, r.pin, c.state, c.pin, r.flaky FROM criterion_results r
             LEFT JOIN canary_results c ON c.goal_id = r.goal_id AND c.criterion = r.criterion
             WHERE r.goal_id = ?1",
        )?;
        for row in stmt.query_map([&rec.id], |r| {
            Ok((
                r.get::<_, String>(0)?,
                r.get::<_, bool>(1)?,
                r.get::<_, String>(2)?,
                r.get::<_, Option<String>>(3)?,
                r.get::<_, Option<String>>(4)?,
                r.get::<_, bool>(5)?,
            ))
        })? {
            let (c, passed, pin, canary, canary_pin, flaky) = row?;
            let tampered = canary.as_deref() == Some("tampered") && canary_pin.as_deref() == Some(pin.as_str());
            if passed && (tampered || held) && rec.pin.as_deref() == Some(pin.as_str()) {
                p.not_evidence = Some(true);
            }
            if passed && !tampered && !held && machine.contains(&c.as_str()) && rec.pin.as_deref() == Some(pin.as_str())
            {
                p.verified += 1;
                q.flaky |= flaky;
                q.assertions_unchecked |=
                    canary.as_deref() == Some("not_checked") && canary_pin.as_deref() == Some(pin.as_str());
            }
        }
        if p.verified > 0 && p.not_evidence.is_none() && q.any() {
            p.qualified = Some(q);
        }
        let mut stmt = self.conn.prepare_cached("SELECT criterion, passed FROM observations WHERE goal_id = ?1")?;
        for row in stmt.query_map([&rec.id], |r| Ok((r.get::<_, String>(0)?, r.get::<_, bool>(1)?)))? {
            let (c, passed) = row?;
            if passed && machine.contains(&c.as_str()) {
                p.observed += 1;
            }
        }
        let mut stmt = self.conn.prepare_cached("SELECT criterion, checked FROM human_checks WHERE goal_id = ?1")?;
        for row in stmt.query_map([&rec.id], |r| Ok((r.get::<_, String>(0)?, r.get::<_, bool>(1)?)))? {
            let (c, checked) = row?;
            if checked && human.contains(&c.as_str()) {
                p.human_done += 1;
            }
        }
        Ok(p)
    }
}

#[cfg(test)]
mod tests {
    use tower_core::EventKind;
    use tower_core::contract::Contract;
    use tower_core::lifecycle::Transition;
    use tower_core::view::InboxKind;
    use tower_core::{Lang, PauseReason};

    use super::*;
    use crate::test_support::store;
    use crate::{NewGoal, NewInboxItem, NewProject};

    /// How one goal's overlaps were found before the board was built once
    /// per call: kept as the reference the faster code must match.
    fn overlaps_one_by_one(s: &Store, rec: &GoalRecord) -> Vec<Overlap> {
        if !rec.state.is_unmerged_work() {
            return Vec::new();
        }
        let touched: String =
            s.conn.query_row("SELECT touched FROM goals WHERE id = ?1", [&rec.id], |r| r.get(0)).unwrap();
        let mine: std::collections::HashSet<String> = serde_json::from_str(&touched).unwrap();
        if mine.is_empty() {
            return Vec::new();
        }
        let mut stmt = s
            .conn
            .prepare("SELECT id, title, state, touched FROM goals WHERE project_id = ?1 AND id != ?2 ORDER BY id")
            .unwrap();
        let rows: Vec<(String, String, String, String)> = stmt
            .query_map(rusqlite::params![rec.project_id, rec.id], |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?, r.get(3)?)))
            .unwrap()
            .collect::<rusqlite::Result<_>>()
            .unwrap();
        let mut out = Vec::new();
        for (id, title, state, touched) in rows {
            if !LifecycleState::parse(&state).is_some_and(LifecycleState::is_unmerged_work) {
                continue;
            }
            let theirs: Vec<String> = serde_json::from_str(&touched).unwrap();
            let mut common: Vec<String> = theirs.into_iter().filter(|f| mine.contains(f)).collect();
            if common.is_empty() {
                continue;
            }
            common.sort();
            let total = common.len() as u32;
            common.truncate(5);
            out.push(Overlap { goal_id: id, title, files: common, total });
        }
        out
    }

    fn goal(s: &mut Store, project: &str, title: &str, walk: &[Transition], touched: &[&str]) -> String {
        let contract = Contract::quick("x", Some("true".into()), Lang::En);
        let id = s.create_goal(NewGoal { project_id: project.into(), title: title.into(), contract }).unwrap().id;
        for t in walk {
            s.transition(&id, *t, None, "").unwrap();
        }
        let touched: Vec<String> = touched.iter().map(|f| f.to_string()).collect();
        s.set_touched(&id, &touched).unwrap();
        id
    }

    fn question(s: &mut Store, goal: &str) -> String {
        let item = NewInboxItem {
            goal_id: goal.into(),
            kind: InboxKind::Question,
            title: "?".into(),
            subject: String::new(),
            body: String::new(),
            options: Vec::new(),
            allow_text: true,
            urgency: 1,
            engine_ref: None,
        };
        s.open_inbox(item).unwrap().id
    }

    #[test]
    fn a_pass_the_guards_cannot_fully_vouch_for_counts_with_its_caveats_and_a_high_finding_holds_it() {
        use tower_core::honesty::Qualified;
        let (mut s, _) = store();
        let root =
            NewProject { name: "web".into(), root: "/r/web".into(), base_branch: "main".into(), test_command: None };
        let p = s.add_project(root).unwrap().id;
        let id = goal(&mut s, &p, "g", &[], &[]);
        let pin = || "abc1234".to_string();
        s.append(&id, EventKind::Pinned { pin: pin(), files: 1, additions: 1, deletions: 0 }).unwrap();
        s.append(&id, EventKind::VerifyStarted { pin: pin() }).unwrap();
        let result = EventKind::CriterionResult {
            criterion: "C1".into(),
            pin: pin(),
            passed: true,
            exit_code: Some(0),
            duration_ms: 1,
            output_tail: String::new(),
            held_out: false,
            held_out_proof: None,
        };
        s.append(&id, result).unwrap();
        let read = |s: &Store| {
            let p = s.summary(&id).unwrap().progress;
            (p.verified, p.not_evidence, p.qualified)
        };
        assert_eq!(read(&s), (1, None, None), "a clean pass");

        let state = tower_core::view::CanaryState::NotChecked;
        s.append(&id, EventKind::CanaryChecked { criterion: "C1".into(), pin: pin(), state }).unwrap();
        let unchecked = Qualified { assertions_unchecked: true, ..Default::default() };
        assert_eq!(read(&s), (1, None, Some(unchecked)), "still counted, with the caveat");

        let hit = |sentinel: &str, severity| EventKind::SentinelHit {
            sentinel: sentinel.into(),
            severity,
            title: String::new(),
            detail: String::new(),
        };
        s.append(&id, hit("source_touches_tests", 2)).unwrap();
        s.append(
            &id,
            EventKind::CriterionFlaky { criterion: "C1".into(), pin: pin(), first_output_tail: String::new() },
        )
        .unwrap();
        let all = Qualified { test_machinery: true, assertions_unchecked: true, flaky: true };
        assert_eq!(read(&s), (1, None, Some(all)));

        s.append(&id, hit("source_patches_tests", 3)).unwrap();
        assert_eq!(read(&s), (0, Some(true), None), "held: not evidence, and no caveat said beside it");
    }

    #[test]
    fn the_board_built_once_matches_each_goal_read_on_its_own() {
        use Transition as T;
        let (mut s, _) = store();
        let project = |name: &str| NewProject {
            name: name.into(),
            root: format!("/r/{name}"),
            base_branch: "main".into(),
            test_command: None,
        };
        let (p, q) = (s.add_project(project("web")).unwrap().id, s.add_project(project("api")).unwrap().id);
        let running = [T::Ratify, T::RunStarted];
        let in_review = [T::Ratify, T::RunStarted, T::Submitted, T::VerifyStarted, T::VerifyPassed];
        let accepted = [T::Ratify, T::RunStarted, T::Submitted, T::VerifyStarted, T::VerifyPassed, T::Accept];
        let integrated =
            [T::Ratify, T::RunStarted, T::Submitted, T::VerifyStarted, T::VerifyPassed, T::Accept, T::Integrated];
        let paused = [T::Ratify, T::Pause { reason: PauseReason::Human }];
        let many = ["a", "b", "c", "d", "e", "f", "g", "h"];
        let a = goal(&mut s, &p, "many", &running, &many);
        let b = goal(&mut s, &p, "most", &in_review, &["h", "g", "f", "e", "d", "c", "b", "z"]);
        goal(&mut s, &p, "dup", &paused, &["a", "a", "y"]);
        goal(&mut s, &p, "accepted", &accepted, &["c", "x"]);
        goal(&mut s, &p, "merged", &integrated, &["a", "b"]);
        goal(&mut s, &p, "draft", &[], &["a"]);
        let alone = goal(&mut s, &p, "alone", &running, &["q"]);
        goal(&mut s, &p, "nothing", &running, &[]);
        goal(&mut s, &q, "other project", &running, &many);
        goal(&mut s, &q, "other project too", &paused, &["a", "x"]);
        question(&mut s, &a);
        question(&mut s, &a);
        let answered = question(&mut s, &b);
        s.resolve_inbox(&answered, "yes").unwrap();
        question(&mut s, &b);
        let mut c = Contract::quick("x", Some("true".into()), Lang::En);
        c.depends_on = vec![b.clone(), alone];
        s.append(&a, EventKind::ContractRatified { contract: c }).unwrap();
        s.append(&a, EventKind::PortBlockAllocated { base: 41000, count: 10 }).unwrap();
        let pr_url = Some("https://example.com/pr/1".to_string());
        s.append(&b, EventKind::BranchPushed { remote: "origin".into(), branch: "tower/b".into(), pr_url }).unwrap();

        let all = s.summaries().unwrap();
        assert_eq!(all.len(), 10);
        for g in &all {
            let rec = s.goal(&g.id).unwrap();
            assert_eq!(g.overlaps, overlaps_one_by_one(&s, &rec), "{}", g.title);
            let open: u32 = s
                .conn
                .query_row("SELECT COUNT(*) FROM inbox WHERE goal_id = ?1 AND resolved_at IS NULL", [&g.id], |r| {
                    r.get(0)
                })
                .unwrap();
            assert_eq!(g.needs_you, open, "{}", g.title);
            assert_eq!(g.depends_on, s.goal_dependencies(&g.id).unwrap(), "{}", g.title);
            assert_eq!(&s.summary(&g.id).unwrap(), g, "one goal's summary is its entry on the board");
        }
        let many = all.iter().find(|g| g.id == a).unwrap();
        assert_eq!(many.overlaps.len(), 3, "{:?}", many.overlaps);
        assert_eq!((many.overlaps[0].total, many.overlaps[0].files.len()), (7, 5), "more than five shared files");
        assert_eq!(many.needs_you, 2);
        assert_eq!(many.depends_on.len(), 2);
        assert_eq!(many.port_base, Some(41000));
        let pushed = all.iter().find(|g| g.id == b).unwrap();
        assert_eq!(pushed.pr.as_ref().map(|p| p.url.as_str()), Some("https://example.com/pr/1"));
    }
}
