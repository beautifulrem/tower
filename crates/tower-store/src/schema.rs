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
];

pub fn migrate(conn: &mut Connection) -> rusqlite::Result<()> {
    let current: usize = conn.query_row("PRAGMA user_version", [], |r| r.get::<_, i64>(0))? as usize;
    for (i, sql) in MIGRATIONS.iter().enumerate().skip(current) {
        let tx = conn.transaction()?;
        tx.execute_batch(sql)?;
        tx.pragma_update(None, "user_version", (i + 1) as i64)?;
        tx.commit()?;
    }
    Ok(())
}
