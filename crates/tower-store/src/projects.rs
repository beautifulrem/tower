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
        memory: r.get("memory")?,
        setup_command: r.get("setup_command")?,
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
            "UPDATE projects SET base_branch = ?2, test_command = ?3, local_files = ?4, memory = ?5, setup_command = ?6
             WHERE id = ?1",
            params![
                id,
                patch.base_branch,
                patch.test_command.as_deref().filter(|t| !t.trim().is_empty()),
                serde_json::to_string(&patch.local_files)?,
                patch.memory,
                patch.setup_command.trim()
            ],
        )?;
        if n == 0 {
            return Err(StoreError::NotFound(format!("project {id}")));
        }
        self.project(id)
    }

    /// Removes a project. Refused while it still has goals that are not
    /// archived or abandoned.
    pub fn remove_project(&mut self, id: &str) -> Result<()> {
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
        for table in ["events", "runs", "claims", "criterion_results", "observations", "human_checks", "inbox"] {
            tx.execute(
                &format!("DELETE FROM {table} WHERE goal_id IN (SELECT id FROM goals WHERE project_id = ?1)"),
                [id],
            )?;
        }
        tx.execute("DELETE FROM goals WHERE project_id = ?1", [id])?;
        tx.execute("DELETE FROM projects WHERE id = ?1", [id])?;
        tx.commit()?;
        Ok(())
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
        };
        let updated = s.update_project(&created.id, &patch).unwrap();
        assert_eq!(updated.local_files, [".env"]);
        assert_eq!(updated.memory, patch.memory);
    }
}
