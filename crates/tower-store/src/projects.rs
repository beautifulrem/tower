use rusqlite::{OptionalExtension, Row, params};
use tower_core::view::ProjectView;

use crate::{Result, Store, StoreError, new_id};

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
        created_at: r.get("created_at")?,
    })
}

impl Store {
    pub fn add_project(&mut self, p: NewProject) -> Result<ProjectView> {
        if self.project_by_root(&p.root)?.is_some() {
            return Err(StoreError::Conflict(format!("项目已存在：{}", p.root)));
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
        Ok(self
            .conn
            .query_row("SELECT * FROM projects WHERE root = ?1", [root], row_to_project)
            .optional()?)
    }

    pub fn projects(&self) -> Result<Vec<ProjectView>> {
        let mut stmt = self.conn.prepare("SELECT * FROM projects ORDER BY name COLLATE NOCASE")?;
        let rows = stmt.query_map([], row_to_project)?;
        Ok(rows.collect::<rusqlite::Result<_>>()?)
    }

    pub fn update_project(&mut self, id: &str, base_branch: &str, test_command: Option<&str>) -> Result<ProjectView> {
        let n = self.conn.execute(
            "UPDATE projects SET base_branch = ?2, test_command = ?3 WHERE id = ?1",
            params![id, base_branch, test_command],
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
            return Err(StoreError::Conflict(format!("项目还有 {live} 个未结束的目标")));
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
        assert_eq!(s.projects().unwrap(), vec![created]);
        assert!(matches!(s.add_project(p), Err(StoreError::Conflict(_))));
    }
}
