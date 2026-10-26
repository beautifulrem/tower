//! Needs-You inbox (`docs/08`). Every item is actionable and belongs to one
//! goal; resolving it records a human event on that goal.

use rusqlite::{OptionalExtension, Row, params};
use tower_core::EventKind;
use tower_core::view::{InboxItem, InboxKind};

use crate::goals::{enum_col, enum_str, json_col};
use crate::{Result, Store, StoreError, new_id};

#[derive(Debug, Clone)]
pub struct NewInboxItem {
    pub goal_id: String,
    pub kind: InboxKind,
    pub title: String,
    pub body: String,
    pub options: Vec<String>,
    pub allow_text: bool,
    pub urgency: u8,
    /// The engine dialog this item answers, if any.
    pub engine_ref: Option<String>,
}

const ITEM_SQL: &str = "SELECT i.*, g.title AS goal_title FROM inbox i JOIN goals g ON g.id = i.goal_id";

fn row_to_item(r: &Row<'_>) -> rusqlite::Result<InboxItem> {
    Ok(InboxItem {
        id: r.get("id")?,
        goal_id: r.get("goal_id")?,
        goal_title: r.get("goal_title")?,
        kind: enum_col(r, "kind")?,
        title: r.get("title")?,
        body: r.get("body")?,
        options: json_col(r, "options")?,
        allow_text: r.get("allow_text")?,
        created_at: r.get("created_at")?,
        urgency: r.get("urgency")?,
    })
}

/// A resolved item, with what the supervisor needs to act on the answer.
#[derive(Debug, Clone)]
pub struct Resolved {
    pub item: InboxItem,
    pub engine_ref: Option<String>,
}

impl Store {
    pub fn open_inbox(&mut self, n: NewInboxItem) -> Result<InboxItem> {
        let id = new_id("inb");
        let now = self.now();
        self.conn.execute(
            "INSERT INTO inbox (id, goal_id, kind, title, body, options, allow_text, urgency, engine_ref, created_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)",
            params![
                id,
                n.goal_id,
                enum_str(&n.kind),
                n.title,
                n.body,
                serde_json::to_string(&n.options)?,
                n.allow_text,
                n.urgency,
                n.engine_ref,
                now
            ],
        )?;
        self.append(&n.goal_id, EventKind::InboxOpened { item_id: id.clone(), title: n.title })?;
        self.inbox_item(&id)
    }

    pub fn inbox_item(&self, id: &str) -> Result<InboxItem> {
        self.conn
            .query_row(&format!("{ITEM_SQL} WHERE i.id = ?1"), [id], row_to_item)
            .optional()?
            .ok_or_else(|| StoreError::NotFound(format!("inbox item {id}")))
    }

    /// Open items, most urgent first, then oldest first.
    pub fn open_inbox_items(&self) -> Result<Vec<InboxItem>> {
        let mut stmt =
            self.conn.prepare(&format!("{ITEM_SQL} WHERE i.resolved_at IS NULL ORDER BY i.urgency, i.created_at"))?;
        let rows = stmt.query_map([], row_to_item)?;
        Ok(rows.collect::<rusqlite::Result<_>>()?)
    }

    pub fn resolve_inbox(&mut self, id: &str, response: &str) -> Result<Resolved> {
        let item = self.inbox_item(id)?;
        let (resolved_at, engine_ref): (Option<i64>, Option<String>) =
            self.conn.query_row("SELECT resolved_at, engine_ref FROM inbox WHERE id = ?1", [id], |r| {
                Ok((r.get(0)?, r.get(1)?))
            })?;
        if resolved_at.is_some() {
            return Err(StoreError::Conflict("这一项已经处理过了".into()));
        }
        let now = self.now();
        self.conn
            .execute("UPDATE inbox SET resolved_at = ?2, response = ?3 WHERE id = ?1", params![id, now, response])?;
        self.append(&item.goal_id, EventKind::InboxResolved { item_id: id.into(), response: response.into() })?;
        Ok(Resolved { item, engine_ref })
    }

    /// Withdraws open items of the given kinds for a goal, e.g. engine
    /// questions when the engine died. Returns how many were withdrawn.
    pub fn withdraw_inbox(&mut self, goal_id: &str, kinds: &[InboxKind], reason: &str) -> Result<usize> {
        let mut stmt = self.conn.prepare("SELECT id, kind FROM inbox WHERE goal_id = ?1 AND resolved_at IS NULL")?;
        let open: Vec<(String, String)> =
            stmt.query_map([goal_id], |r| Ok((r.get(0)?, r.get(1)?)))?.collect::<rusqlite::Result<_>>()?;
        drop(stmt);
        let kinds: Vec<String> = kinds.iter().map(enum_str).collect();
        let mut n = 0;
        for (id, kind) in open {
            if kinds.contains(&kind) {
                let now = self.now();
                self.conn.execute(
                    "UPDATE inbox SET resolved_at = ?2, response = ?3 WHERE id = ?1",
                    params![id, now, format!("（撤回：{reason}）")],
                )?;
                self.append(goal_id, EventKind::InboxResolved { item_id: id, response: format!("撤回：{reason}") })?;
                n += 1;
            }
        }
        Ok(n)
    }
}

#[cfg(test)]
mod tests {
    use tower_core::contract::Contract;

    use super::*;
    use crate::test_support::store;
    use crate::{NewGoal, NewProject};

    fn item(goal_id: &str, kind: InboxKind, urgency: u8) -> NewInboxItem {
        NewInboxItem {
            goal_id: goal_id.into(),
            kind,
            title: "幂等键来源？".into(),
            body: String::new(),
            options: vec!["订单号".into(), "请求 ID".into()],
            allow_text: true,
            urgency,
            engine_ref: Some("ui-1".into()),
        }
    }

    #[test]
    fn inbox_orders_by_urgency_and_resolves_once() {
        let (mut s, clock) = store();
        let p = s
            .add_project(NewProject {
                name: "a".into(),
                root: "/a".into(),
                base_branch: "main".into(),
                test_command: None,
            })
            .unwrap();
        let g = s
            .create_goal(NewGoal { project_id: p.id, title: "t".into(), contract: Contract::quick("x", None) })
            .unwrap();
        let low = s.open_inbox(item(&g.id, InboxKind::ReviewReady, 5)).unwrap();
        clock.advance(1);
        let high = s.open_inbox(item(&g.id, InboxKind::Question, 0)).unwrap();
        let open = s.open_inbox_items().unwrap();
        assert_eq!(open.iter().map(|i| i.id.as_str()).collect::<Vec<_>>(), [high.id.as_str(), low.id.as_str()]);
        assert_eq!(s.summary(&g.id).unwrap().needs_you, 2);

        let r = s.resolve_inbox(&high.id, "订单号").unwrap();
        assert_eq!(r.engine_ref.as_deref(), Some("ui-1"));
        assert!(s.resolve_inbox(&high.id, "again").is_err());

        assert_eq!(s.withdraw_inbox(&g.id, &[InboxKind::ReviewReady], "引擎退出").unwrap(), 1);
        assert!(s.open_inbox_items().unwrap().is_empty());
    }
}
