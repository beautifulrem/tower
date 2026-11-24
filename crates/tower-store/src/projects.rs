use rusqlite::{OptionalExtension, Row, params};
use tower_core::i18n::plural;
use tower_core::view::ProjectView;
use tower_core::{Lang, tr};

use crate::goals::json_col;
use crate::{Result, Store, StoreError, new_id};

/// Editable project settings.
#[derive(Debug, Clone, PartialEq, Eq, serde::Deserialize, ts_rs::TS)]
#[ts(export)]
pub struct ProjectPatch {
    pub base_branch: String,
    pub test_command: Option<String>,
    pub local_files: Vec<String>,
    pub memory: String,
    #[serde(default)]
    pub setup_command: String,
    #[serde(default)]
    pub holdout_files: Vec<String>,
}

#[derive(Debug, Clone)]
pub struct NewProject {
    pub name: String,
    pub root: String,
    pub base_branch: String,
    pub test_command: Option<String>,
}

fn row_to_project(r: &Row<'_>) -> rusqlite::Result<ProjectView> {
    Ok(ProjectView {
        id: r.get("id")?,
        name: r.get("name")?,
        root: r.get("root")?,
        base_branch: r.get("base_branch")?,
        test_command: r.get("test_command")?,
        local_files: json_col(r, "local_files")?,
        holdout_files: json_col(r, "holdout_files")?,
        memory: r.get("memory")?,
        setup_command: r.get("setup_command")?,
        loopback_open: r.get("loopback_open")?,
        test_check: r.get::<_, Option<String>>("test_check")?.and_then(|j| serde_json::from_str(&j).ok()),
        created_at: r.get("created_at")?,
    })
}

impl Store {
    pub fn add_project(&mut self, p: NewProject) -> Result<ProjectView> {
        if self.project_by_root(&p.root)?.is_some() {
            let root = &p.root;
            return Err(StoreError::Conflict(tr!(self.lang(), "项目已存在：{root}", "Project already added: {root}")));
        }
        let id = new_id("prj");
        let now = self.now();
        self.conn.execute(
            "INSERT INTO projects (id, name, root, base_branch, test_command, created_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
            params![id, p.name, p.root, p.base_branch, p.test_command, now],
        )?;
        self.project(&id)
    }

    pub fn project(&self, id: &str) -> Result<ProjectView> {
        self.conn
            .query_row("SELECT * FROM projects WHERE id = ?1", [id], row_to_project)
            .optional()?
            .ok_or_else(|| StoreError::NotFound(format!("project {id}")))
    }

    pub fn project_by_root(&self, root: &str) -> Result<Option<ProjectView>> {
        Ok(self.conn.query_row("SELECT * FROM projects WHERE root = ?1", [root], row_to_project).optional()?)
    }

    pub fn projects(&self) -> Result<Vec<ProjectView>> {
        let mut stmt = self.conn.prepare("SELECT * FROM projects ORDER BY name COLLATE NOCASE")?;
        let rows = stmt.query_map([], row_to_project)?;
        Ok(rows.collect::<rusqlite::Result<_>>()?)
    }

    pub fn set_test_check(&mut self, id: &str, check: &tower_core::view::TestCheck) -> Result<()> {
        self.conn
            .execute("UPDATE projects SET test_check = ?2 WHERE id = ?1", params![id, serde_json::to_string(check)?])?;
        Ok(())
    }

    pub fn update_project(&mut self, id: &str, patch: &ProjectPatch) -> Result<ProjectView> {
        let n = self.conn.execute(
            "UPDATE projects SET base_branch = ?2, test_command = ?3, local_files = ?4, memory = ?5, setup_command = ?6,
                holdout_files = ?7
             WHERE id = ?1",
            params![
                id,
                patch.base_branch,
                patch.test_command.as_deref().filter(|t| !t.trim().is_empty()),
                serde_json::to_string(&patch.local_files)?,
                patch.memory,
                patch.setup_command.trim(),
                serde_json::to_string(&patch.holdout_files)?
            ],
        )?;
        if n == 0 {
            return Err(StoreError::NotFound(format!("project {id}")));
        }
        self.project(id)
    }

    /// Opens (or closes) loopback for a project's goals.
    pub fn set_project_loopback_open(&mut self, id: &str, open: bool) -> Result<()> {
        self.conn.execute("UPDATE projects SET loopback_open = ?2 WHERE id = ?1", params![id, open])?;
        Ok(())
    }

    /// The criteria of a goal whose verification has loopback opened:
    /// `(criterion, command, why)`.
    pub fn loopback_opened(&self, goal: &str) -> Result<Vec<(String, String, String)>> {
        let mut stmt = self.conn.prepare("SELECT criterion, command, why FROM loopback_opened WHERE goal_id = ?1")?;
        let rows = stmt.query_map([goal], |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?)))?;
        Ok(rows.collect::<rusqlite::Result<_>>()?)
    }

    /// Removes a project and every row of its goals. Refused while it still
    /// has goals that are not archived or abandoned. Returns the removed
    /// goals, whose directories the caller deletes.
    pub fn remove_project(&mut self, id: &str) -> Result<Vec<String>> {
        let live: i64 = self.conn.query_row(
            "SELECT COUNT(*) FROM goals WHERE project_id = ?1 AND state NOT IN ('archived','abandoned')",
            [id],
            |r| r.get(0),
        )?;
        if live > 0 {
            let message = match self.lang() {
                Lang::Zh => format!("项目还有 {live} 个未结束的目标"),
                Lang::En => {
                    format!("The project still has {}", plural(live as usize, "open goal", "open goals"))
                }
            };
            return Err(StoreError::Conflict(message));
        }
        let tx = self.conn.transaction()?;
        let goals: Vec<String> = {
            let mut stmt = tx.prepare("SELECT id FROM goals WHERE project_id = ?1 ORDER BY seq")?;
            stmt.query_map([id], |r| r.get(0))?.collect::<rusqlite::Result<_>>()?
        };
        for table in [
            "events",
            "runs",
            "claims",
            "criterion_results",
            "observations",
            "human_checks",
            "inbox",
            "merge_queue",
            "goal_attachments",
            "goal_dependencies",
            "calibration_facts",
            "goal_ui_state",
            "baseline_results",
            "original_results",
            "looks",
            "canary_results",
            "loopback_opened",
        ] {
            tx.execute(
                &format!("DELETE FROM {table} WHERE goal_id IN (SELECT id FROM goals WHERE project_id = ?1)"),
                [id],
            )?;
        }
        tx.execute("DELETE FROM memory_proposals WHERE project_id = ?1", [id])?;
        tx.execute("DELETE FROM scheduled_goals WHERE project_id = ?1", [id])?;
        tx.execute("DELETE FROM goals WHERE project_id = ?1", [id])?;
        tx.execute("DELETE FROM projects WHERE id = ?1", [id])?;
        tx.commit()?;
        Ok(goals)
    }
}

#[cfg(test)]
mod tests {
    use crate::test_support::store;

    use super::*;

    #[test]
    fn projects_are_unique_by_root() {
        let (mut s, _) = store();
        let p = NewProject {
            name: "web".into(),
            root: "/r/web".into(),
            base_branch: "main".into(),
            test_command: Some("pnpm test".into()),
        };
        let created = s.add_project(p.clone()).unwrap();
        assert_eq!(s.projects().unwrap(), vec![created.clone()]);
        assert!(matches!(s.add_project(p), Err(StoreError::Conflict(_))));

        let patch = ProjectPatch {
            base_branch: "dev".into(),
            test_command: Some("pnpm test".into()),
            local_files: vec![".env".into()],
            memory: "金额一律用 Money 类型".into(),
            setup_command: "pnpm install".into(),
            holdout_files: vec!["holdout/**".into()],
        };
        let updated = s.update_project(&created.id, &patch).unwrap();
        assert_eq!(updated.local_files, [".env"]);
        assert_eq!(updated.holdout_files, ["holdout/**"]);
        assert!(!updated.loopback_open);
        s.set_project_loopback_open(&created.id, true).unwrap();
        assert!(s.project(&created.id).unwrap().loopback_open, "a project can open loopback for its goals");
        assert_eq!(updated.memory, patch.memory);
    }

    /// Every table keyed by goal, today's and any added later.
    fn goal_tables(s: &Store) -> Vec<String> {
        let mut stmt = s
            .conn
            .prepare(
                "SELECT m.name FROM sqlite_master m, pragma_table_info(m.name) c
                 WHERE m.type = 'table' AND c.name = 'goal_id' ORDER BY m.name",
            )
            .unwrap();
        stmt.query_map([], |r| r.get(0)).unwrap().collect::<rusqlite::Result<_>>().unwrap()
    }

    #[test]
    fn removing_a_project_leaves_no_row_of_its_goals() {
        let (mut s, _) = store();
        let project =
            NewProject { name: "web".into(), root: "/r/web".into(), base_branch: "main".into(), test_command: None };
        let p = s.add_project(project).unwrap();
        let contract = tower_core::contract::Contract::quick("x", None, Lang::En);
        let g = s.create_goal(crate::NewGoal { project_id: p.id.clone(), title: "x".into(), contract }).unwrap().id;
        s.conn.execute("UPDATE goals SET state = 'abandoned' WHERE id = ?1", [&g]).unwrap();
        // One row in each, with whatever its required columns need, and the
        // project where a table has one (a global memory proposal mined
        // from the goal outlives the project: it is yours, not the project's).
        for table in goal_tables(&s) {
            let sql = format!("SELECT name, type, \"notnull\", dflt_value FROM pragma_table_info('{table}')");
            let mut stmt = s.conn.prepare(&sql).unwrap();
            let cols: Vec<(String, String, bool, Option<String>)> = stmt
                .query_map([], |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?, r.get(3)?)))
                .unwrap()
                .collect::<rusqlite::Result<_>>()
                .unwrap();
            let needed: Vec<_> = cols
                .iter()
                .filter(|c| matches!(c.0.as_str(), "goal_id" | "project_id") || (c.2 && c.3.is_none()))
                .collect();
            let names: Vec<&str> = needed.iter().map(|c| c.0.as_str()).collect();
            let values: Vec<String> = needed
                .iter()
                .map(|c| match (c.0.as_str(), c.1.as_str()) {
                    ("goal_id", _) => format!("'{g}'"),
                    ("project_id", _) => format!("'{}'", p.id),
                    (_, "INTEGER" | "REAL") => "0".into(),
                    _ => "'x'".into(),
                })
                .collect();
            s.conn
                .execute(&format!("INSERT INTO {table} ({}) VALUES ({})", names.join(", "), values.join(", ")), [])
                .unwrap_or_else(|e| panic!("{table}: {e}"));
        }

        assert_eq!(s.remove_project(&p.id).unwrap(), vec![g.clone()]);

        let count = |t: &str| -> i64 {
            s.conn.query_row(&format!("SELECT COUNT(*) FROM {t} WHERE goal_id = ?1"), [&g], |r| r.get(0)).unwrap()
        };
        let left: Vec<String> = goal_tables(&s).into_iter().filter(|t| count(t) > 0).collect();
        assert!(left.is_empty(), "rows of the removed goal left in {left:?}");
    }
}
