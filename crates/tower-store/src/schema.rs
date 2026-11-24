//! Schema and forward-only migrations, tracked with `PRAGMA user_version`.

use rusqlite::Connection;

const MIGRATIONS: &[&str] = &[
    // 1: initial schema
    r#"
    CREATE TABLE projects (
        id            TEXT PRIMARY KEY,
        name          TEXT NOT NULL,
        root          TEXT NOT NULL UNIQUE,
        base_branch   TEXT NOT NULL,
        test_command  TEXT,
        created_at    INTEGER NOT NULL
    );

    CREATE TABLE goals (
        id              TEXT PRIMARY KEY,
        seq             INTEGER NOT NULL UNIQUE,
        project_id      TEXT NOT NULL REFERENCES projects(id),
        title           TEXT NOT NULL,
        state           TEXT NOT NULL,
        pause_reason    TEXT,
        mode            TEXT NOT NULL DEFAULT 'idle',
        contract        TEXT NOT NULL,
        workspace       TEXT,
        base_commit     TEXT,
        pin             TEXT,
        verified_pin    TEXT,
        branch          TEXT,
        session_file    TEXT,
        submit_summary  TEXT,
        live_line       TEXT,
        diffstat        TEXT,
        run_no          INTEGER NOT NULL DEFAULT 0,
        rework_cycles   INTEGER NOT NULL DEFAULT 0,
        cost_usd        REAL NOT NULL DEFAULT 0,
        run_started_at  INTEGER,
        created_at      INTEGER NOT NULL,
        updated_at      INTEGER NOT NULL,
        last_viewed_at  INTEGER
    );
    CREATE INDEX goals_project ON goals(project_id);

    -- The append-only log. Projections below are derived from it.
    CREATE TABLE events (
        seq      INTEGER PRIMARY KEY AUTOINCREMENT,
        goal_id  TEXT NOT NULL,
        at       INTEGER NOT NULL,
        kind     TEXT NOT NULL,
        source   TEXT NOT NULL,
        payload  TEXT NOT NULL
    );
    CREATE INDEX events_goal ON events(goal_id, seq);

    CREATE TABLE runs (
        goal_id     TEXT NOT NULL,
        run_no      INTEGER NOT NULL,
        purpose     TEXT NOT NULL,
        started_at  INTEGER NOT NULL,
        ended_at    INTEGER,
        outcome     TEXT,
        PRIMARY KEY (goal_id, run_no)
    );

    -- Claim ids come from the engine's tool call ids, which are only unique
    -- within one goal's run; the key is therefore per goal.
    CREATE TABLE claims (
        id         TEXT NOT NULL,
        goal_id    TEXT NOT NULL,
        kind       TEXT NOT NULL,
        text       TEXT NOT NULL,
        criterion  TEXT,
        at         INTEGER NOT NULL,
        run_no     INTEGER NOT NULL,
        approved   INTEGER,
        PRIMARY KEY (goal_id, id)
    );
    CREATE INDEX claims_goal ON claims(goal_id, at);

    -- Latest verifier result per criterion.
    CREATE TABLE criterion_results (
        goal_id      TEXT NOT NULL,
        criterion    TEXT NOT NULL,
        pin          TEXT NOT NULL,
        passed       INTEGER NOT NULL,
        exit_code    INTEGER,
        duration_ms  INTEGER NOT NULL,
        output_tail  TEXT NOT NULL,
        at           INTEGER NOT NULL,
        PRIMARY KEY (goal_id, criterion)
    );

    -- Latest agent-environment observation per criterion.
    CREATE TABLE observations (
        goal_id    TEXT NOT NULL,
        criterion  TEXT NOT NULL,
        passed     INTEGER NOT NULL,
        at         INTEGER NOT NULL,
        PRIMARY KEY (goal_id, criterion)
    );

    CREATE TABLE human_checks (
        goal_id    TEXT NOT NULL,
        criterion  TEXT NOT NULL,
        checked    INTEGER NOT NULL,
        at         INTEGER NOT NULL,
        PRIMARY KEY (goal_id, criterion)
    );

    CREATE TABLE inbox (
        id           TEXT PRIMARY KEY,
        goal_id      TEXT NOT NULL,
        kind         TEXT NOT NULL,
        title        TEXT NOT NULL,
        body         TEXT NOT NULL,
        options      TEXT NOT NULL,
        allow_text   INTEGER NOT NULL,
        urgency      INTEGER NOT NULL,
        -- Correlates with an engine dialog request, when there is one.
        engine_ref   TEXT,
        created_at   INTEGER NOT NULL,
        resolved_at  INTEGER,
        response     TEXT
    );
    CREATE INDEX inbox_open ON inbox(resolved_at, urgency, created_at);

    CREATE TABLE settings (
        key    TEXT PRIMARY KEY,
        value  TEXT NOT NULL
    );
    "#,
    // 2: local files and project memory
    r#"
    ALTER TABLE projects ADD COLUMN local_files TEXT NOT NULL DEFAULT '[]';
    ALTER TABLE projects ADD COLUMN memory TEXT NOT NULL DEFAULT '';
    "#,
    // 3: workspace setup command
    r#"
    ALTER TABLE projects ADD COLUMN setup_command TEXT NOT NULL DEFAULT '';
    "#,
    // 4: criteria on the base commit; review state kept by the interface
    r#"
    CREATE TABLE baseline_results (
        goal_id    TEXT NOT NULL,
        criterion  TEXT NOT NULL,
        command    TEXT NOT NULL,
        base       TEXT NOT NULL,
        passed     INTEGER NOT NULL,
        at         INTEGER NOT NULL,
        PRIMARY KEY (goal_id, criterion)
    );
    CREATE TABLE goal_ui_state (
        goal_id    TEXT NOT NULL,
        key        TEXT NOT NULL,
        value      TEXT NOT NULL,
        PRIMARY KEY (goal_id, key)
    );
    "#,
    // 5: files each goal's workspace changes, for overlap detection
    r#"
    ALTER TABLE goals ADD COLUMN touched TEXT NOT NULL DEFAULT '[]';
    "#,
    // 6: the pull request opened from Tower
    r#"
    ALTER TABLE goals ADD COLUMN pr TEXT;
    "#,
    // 7: the variable part of an inbox title, so titles are written at read time
    r#"
    ALTER TABLE inbox ADD COLUMN subject TEXT NOT NULL DEFAULT '';
    "#,
    // 8: the result of running a project's test command on its base branch
    r#"
    ALTER TABLE projects ADD COLUMN test_check TEXT;
    "#,
    // 9: each run's starting snapshot, for rolling back
    r#"
    ALTER TABLE runs ADD COLUMN start_pin TEXT;
    "#,
    // 10: criteria re-run with the agent's edits to existing tests undone
    r#"
    CREATE TABLE original_results (
        goal_id    TEXT NOT NULL,
        criterion  TEXT NOT NULL,
        pin        TEXT NOT NULL,
        passed     INTEGER NOT NULL,
        PRIMARY KEY (goal_id, criterion)
    );
    "#,
    // 11: "remind me later" on Needs-You items
    r#"
    ALTER TABLE inbox ADD COLUMN snoozed_until INTEGER;
    "#,
    // 12: held-out tests, copied into verification only
    r#"
    ALTER TABLE projects ADD COLUMN holdout_files TEXT NOT NULL DEFAULT '[]';
    "#,
    // 13: screenshots for `look` criteria
    r#"
    CREATE TABLE looks (
        goal_id    TEXT NOT NULL,
        criterion  TEXT NOT NULL,
        side       TEXT NOT NULL,
        pin        TEXT NOT NULL,
        file       TEXT,
        error      TEXT,
        PRIMARY KEY (goal_id, criterion, side)
    );
    "#,
    // 14: "the latest event of a kind" without scanning a long trace
    r#"
    CREATE INDEX events_goal_kind ON events(goal_id, kind, seq);
    "#,
    // 15: a baseline that could not run says why
    r#"
    ALTER TABLE baseline_results ADD COLUMN error TEXT;
    "#,
    // 16: results from runs with the held-out tests present go to the human only
    r#"
    ALTER TABLE criterion_results ADD COLUMN held_out INTEGER NOT NULL DEFAULT 0;
    "#,
    // 17: what the must-fail canary showed, per criterion
    r#"
    CREATE TABLE canary_results (
        goal_id    TEXT NOT NULL,
        criterion  TEXT NOT NULL,
        pin        TEXT NOT NULL,
        state      TEXT NOT NULL,
        PRIMARY KEY (goal_id, criterion)
    );
    "#,
    // 18: loopback opened for a criterion's verification, and a project's
    // standing choice to open it
    r#"
    CREATE TABLE loopback_opened (
        goal_id    TEXT NOT NULL,
        criterion  TEXT NOT NULL,
        command    TEXT NOT NULL,
        why        TEXT NOT NULL,
        PRIMARY KEY (goal_id, criterion)
    );
    ALTER TABLE projects ADD COLUMN loopback_open INTEGER NOT NULL DEFAULT 0;
    "#,
    // 19: which held-out test files each result proved it ran (JSON)
    r#"
    ALTER TABLE criterion_results ADD COLUMN held_out_proof TEXT;
    "#,
    // 20: flaky criterion tag + look console errors & mobile screenshot
    r#"
    ALTER TABLE criterion_results ADD COLUMN flaky INTEGER NOT NULL DEFAULT 0;
    ALTER TABLE looks ADD COLUMN console_errors TEXT NOT NULL DEFAULT '[]';
    ALTER TABLE looks ADD COLUMN mobile_file TEXT;
    "#,
    // 21: learning loop memory ratification queue + calibration scoreboard facts
    r#"
    CREATE TABLE memory_proposals (
        id            TEXT PRIMARY KEY,
        scope         TEXT NOT NULL,
        project_id    TEXT,
        goal_id       TEXT,
        text          TEXT NOT NULL,
        detail        TEXT NOT NULL DEFAULT '',
        origin        TEXT NOT NULL,
        evidence      TEXT NOT NULL DEFAULT '[]',
        taint_level   TEXT NOT NULL,
        taint_classes TEXT NOT NULL DEFAULT '[]',
        status        TEXT NOT NULL DEFAULT 'pending',
        created_at    INTEGER NOT NULL,
        resolved_at   INTEGER
    );
    CREATE INDEX memory_proposals_status ON memory_proposals(status, created_at DESC);

    CREATE TABLE calibration_facts (
        goal_id           TEXT PRIMARY KEY,
        project_id        TEXT NOT NULL,
        engine            TEXT NOT NULL,
        model             TEXT NOT NULL,
        first_pass        INTEGER,
        rework_cycles     INTEGER NOT NULL DEFAULT 0,
        had_high_sentinel INTEGER NOT NULL DEFAULT 0,
        reported_blocked  INTEGER NOT NULL DEFAULT 0,
        cost_usd          REAL NOT NULL DEFAULT 0,
        recorded_at       INTEGER NOT NULL
    );
    CREATE INDEX calibration_facts_group ON calibration_facts(engine, model, project_id);
    "#,
    // 22: scheduled goals, merge queue, multimodal attachments & cross-goal dependencies
    r#"
    CREATE TABLE scheduled_goals (
        id                TEXT PRIMARY KEY,
        project_id        TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
        title             TEXT NOT NULL,
        cron_expr         TEXT NOT NULL,
        contract_template TEXT NOT NULL,
        enabled           INTEGER NOT NULL DEFAULT 1,
        last_run_at       INTEGER,
        next_run_at       INTEGER,
        last_goal_id      TEXT,
        unattended_strict INTEGER NOT NULL DEFAULT 1,
        last_checkpoint   TEXT,
        created_at        INTEGER NOT NULL
    );

    CREATE TABLE merge_queue (
        goal_id        TEXT PRIMARY KEY,
        project_id     TEXT NOT NULL,
        position       INTEGER NOT NULL,
        status         TEXT NOT NULL DEFAULT 'queued',
        conflict_files TEXT NOT NULL DEFAULT '[]',
        updated_at     INTEGER NOT NULL
    );
    CREATE INDEX merge_queue_project ON merge_queue(project_id, position);

    CREATE TABLE goal_attachments (
        id         TEXT PRIMARY KEY,
        goal_id    TEXT NOT NULL,
        name       TEXT NOT NULL,
        mime       TEXT NOT NULL,
        path       TEXT NOT NULL,
        size_bytes INTEGER NOT NULL,
        created_at INTEGER NOT NULL
    );
    CREATE INDEX goal_attachments_goal ON goal_attachments(goal_id, created_at);

    CREATE TABLE goal_dependencies (
        goal_id            TEXT NOT NULL,
        depends_on_goal_id TEXT NOT NULL,
        PRIMARY KEY (goal_id, depends_on_goal_id)
    );
    CREATE INDEX goal_dependencies_dep ON goal_dependencies(depends_on_goal_id);
    "#,
    // 23: fast projections for dynamic port block & escalated model
    r#"
    ALTER TABLE goals ADD COLUMN port_base INTEGER;
    ALTER TABLE goals ADD COLUMN escalated_model TEXT;
    "#,
];

/// Brings the schema up to date. A database a newer Tower wrote (a schema
/// version this Tower does not know) is refused and left untouched: read
/// with an older schema in mind, it would be misread and then written over.
pub fn migrate(conn: &mut Connection) -> crate::Result<()> {
    let current: usize = conn.query_row("PRAGMA user_version", [], |r| r.get::<_, i64>(0))? as usize;
    if current > MIGRATIONS.len() {
        return Err(crate::StoreError::NewerDatabase { found: current, known: MIGRATIONS.len() });
    }
    for (i, sql) in MIGRATIONS.iter().enumerate().skip(current) {
        let tx = conn.transaction()?;
        tx.execute_batch(sql)?;
        tx.pragma_update(None, "user_version", (i + 1) as i64)?;
        tx.commit()?;
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use rusqlite::params;
    use tower_core::view::InboxKind;
    use tower_core::{EventKind, LifecycleState};

    use super::*;
    use crate::{Store, StoreError};

    /// A contract as the first Tower stored it (b8882b9): none of the fields
    /// added since.
    const V1_CONTRACT: &str = r#"{"version":1,"intent":"Fix the checkout","done_when":"","constraints":[],
        "criteria":[{"id":"C1","title":"tests pass","kind":{"type":"exec","command":"npm test","timeout_secs":600}},
                    {"id":"C2","title":"looks right","kind":{"type":"human"}}],
        "scope":{"include":[],"exclude":[],"readonly":[]},
        "budget":{"soft_usd":5.0,"hard_usd":8.0,"wall_minutes":90},
        "autonomy":"standard","max_rework":3,"setup":"","model":"","thinking":""}"#;

    /// A database the first Tower wrote: schema 1, one paused goal with a
    /// trace and an open Needs-You item.
    fn v1_database(path: &std::path::Path) {
        let conn = Connection::open(path).unwrap();
        conn.execute_batch(MIGRATIONS[0]).unwrap();
        conn.pragma_update(None, "user_version", 1).unwrap();
        conn.execute(
            "INSERT INTO projects (id, name, root, base_branch, test_command, created_at)
             VALUES ('prj_1', 'web', '/r/web', 'main', 'npm test', 1000)",
            [],
        )
        .unwrap();
        conn.execute(
            "INSERT INTO goals (id, seq, project_id, title, state, pause_reason, mode, contract, run_no, created_at, updated_at)
             VALUES ('G-0001', 1, 'prj_1', 'Fix the checkout', 'paused', 'human', 'idle', ?1, 1, 1000, 2000)",
            [V1_CONTRACT],
        )
        .unwrap();
        let events = [
            ("goal_created", "human", r#"{"kind":"goal_created","title":"Fix the checkout"}"#.to_string()),
            ("contract_ratified", "human", format!(r#"{{"kind":"contract_ratified","contract":{V1_CONTRACT}}}"#)),
            ("state_changed", "system", r#"{"kind":"state_changed","from":"draft","to":"ready"}"#.to_string()),
            ("run_started", "system", r#"{"kind":"run_started","run_no":1,"purpose":"start"}"#.to_string()),
            ("steered", "human", r#"{"kind":"steered","text":"use Money"}"#.to_string()),
            (
                "state_changed",
                "human",
                r#"{"kind":"state_changed","from":"running","to":"paused","reason":"human"}"#.to_string(),
            ),
        ];
        for (i, (kind, source, payload)) in events.iter().enumerate() {
            conn.execute(
                "INSERT INTO events (goal_id, at, kind, source, payload) VALUES ('G-0001', ?1, ?2, ?3, ?4)",
                params![1000 + i as i64, kind, source, payload],
            )
            .unwrap();
        }
        conn.execute(
            "INSERT INTO inbox (id, goal_id, kind, title, body, options, allow_text, urgency, created_at)
             VALUES ('inb_1', 'G-0001', 'paused', 'Paused: you paused it', '', '[\"Continue\"]', 0, 2, 2000)",
            [],
        )
        .unwrap();
    }

    #[test]
    fn a_database_from_the_first_tower_opens_and_reads() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("tower.db");
        v1_database(&path);

        let s = Store::open(&path).unwrap();

        let all = s.summaries().unwrap();
        assert_eq!(all.len(), 1);
        let g = &all[0];
        assert_eq!((g.id.as_str(), g.state, g.needs_you), ("G-0001", LifecycleState::Paused, 1));
        assert_eq!((g.progress.machine, g.progress.human), (1, 1));
        let detail = s.detail("G-0001").unwrap();
        assert_eq!(detail.contract.intent, "Fix the checkout");
        assert_eq!(detail.criteria.len(), 2);
        let trace = s.trace("G-0001", None, 100).unwrap();
        assert_eq!(trace.len(), 6);
        assert!(trace.iter().any(|e| matches!(&e.event, EventKind::Steered { text } if text == "use Money")));
        let inbox = s.open_inbox_items().unwrap();
        assert_eq!(inbox.len(), 1);
        assert_eq!(inbox[0].kind, InboxKind::Paused);
        let version: usize = s.conn.query_row("PRAGMA user_version", [], |r| r.get::<_, i64>(0)).unwrap() as usize;
        assert_eq!(version, MIGRATIONS.len());
    }

    #[test]
    fn a_database_from_a_newer_tower_is_not_opened() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("tower.db");
        Store::open(&path).unwrap();
        let newer = MIGRATIONS.len() as i64 + 1;
        Connection::open(&path).unwrap().pragma_update(None, "user_version", newer).unwrap();

        let err = Store::open(&path).unwrap_err();

        assert!(matches!(err, StoreError::NewerDatabase { .. }), "{err:?}");
        let version: i64 = Connection::open(&path).unwrap().query_row("PRAGMA user_version", [], |r| r.get(0)).unwrap();
        assert_eq!(version, newer, "left as the newer Tower wrote it");
    }
}
