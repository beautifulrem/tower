//! Needs-You inbox (`docs/08`). Every item is actionable and belongs to one
//! goal; resolving it records a human event on that goal.

use rusqlite::{OptionalExtension, Row, params};
use tower_core::i18n::{Choice, pause_label};
use tower_core::view::{InboxItem, InboxKind};
use tower_core::{EventKind, Lang, PauseReason, tr};

use crate::goals::{enum_col, enum_str, json_col, opt_enum_col};
use crate::{Result, Store, StoreError, new_id};

#[derive(Debug, Clone)]
pub struct NewInboxItem {
    pub goal_id: String,
    pub kind: InboxKind,
    /// Kept for items whose title the store cannot write itself (questions).
    pub title: String,
    /// The variable part of the title; the store writes the rest in the
    /// interface language when the item is read.
    pub subject: String,
    pub body: String,
    pub options: Vec<String>,
    pub allow_text: bool,
    pub urgency: u8,
    /// The engine dialog this item answers, if any.
    pub engine_ref: Option<String>,
}

const ITEM_SQL: &str = "SELECT i.*, g.title AS goal_title, g.pause_reason AS goal_pause_reason FROM inbox i JOIN goals g ON g.id = i.goal_id";

fn row_to_item(r: &Row<'_>, lang: Lang) -> rusqlite::Result<InboxItem> {
    let kind: InboxKind = enum_col(r, "kind")?;
    let stored: String = r.get("title")?;
    let subject: String = r.get("subject")?;
    let goal_title: String = r.get("goal_title")?;
    let body: String = r.get("body")?;
    // System-written titles follow the current language; the agent's and
    // extensions' words stay as written.
    let (title, subject) = match kind {
        InboxKind::Paused => match opt_enum_col::<PauseReason>(r, "goal_pause_reason")? {
            Some(reason) => {
                let why = pause_label(reason, lang);
                (tr!(lang, "已暂停：{why}", "Paused: {why}"), why.to_string())
            }
            None => (stored.clone(), stored),
        },
        InboxKind::ReviewReady => {
            (tr!(lang, "待验收：{goal_title}", "Ready to accept: {goal_title}"), goal_title.clone())
        }
        InboxKind::Assumption => {
            (tr!(lang, "Agent 的假设待你确认", "An assumption by the agent needs your confirmation"), body.clone())
        }
        InboxKind::Stalled if !subject.is_empty() => {
            (tr!(lang, "可能卡住：{subject}", "May be stuck: {subject}"), subject)
        }
        InboxKind::CiFailed => (tr!(lang, "CI 未通过：{subject}", "CI failed: {subject}"), subject),
        InboxKind::Approval if !subject.is_empty() => {
            (tr!(lang, "需要你批准：{subject}", "Approval needed: {subject}"), subject)
        }
        _ if !subject.is_empty() => (stored, subject),
        _ => (stored.clone(), stored),
    };
    let stored_options: Vec<String> = json_col(r, "options")?;
    // Tower's own choices are shown in the current language (answers are
    // matched by meaning); an agent's suggested answers are left alone.
    let options: Vec<String> = if kind == InboxKind::Question {
        stored_options
    } else {
        stored_options
            .iter()
            .map(|o| Choice::parse(o).map_or_else(|| o.clone(), |c| c.label(lang).to_string()))
            .collect()
    };
    let tones = options
        .iter()
        .map(|o| tower_core::i18n::Choice::parse(o).map_or(tower_core::view::OptionTone::Neutral, |c| c.tone()))
        .collect();
    Ok(InboxItem {
        tones,
        title,
        subject,
        goal_title,
        kind,
        body,
        id: r.get("id")?,
        goal_id: r.get("goal_id")?,
        options,
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
            "INSERT INTO inbox (id, goal_id, kind, title, body, options, allow_text, urgency, engine_ref, created_at, subject)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)",
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
                now,
                n.subject
            ],
        )?;
        self.append(&n.goal_id, EventKind::InboxOpened { item_id: id.clone(), title: n.title })?;
        self.inbox_item(&id)
    }

    pub fn inbox_item(&self, id: &str) -> Result<InboxItem> {
        self.conn
            .query_row(&format!("{ITEM_SQL} WHERE i.id = ?1"), [id], |r| row_to_item(r, self.lang()))
            .optional()?
            .ok_or_else(|| StoreError::NotFound(format!("inbox item {id}")))
    }

    /// Open items, most urgent first, then oldest first.
    pub fn open_inbox_items(&self) -> Result<Vec<InboxItem>> {
        let mut stmt =
            self.conn.prepare(&format!("{ITEM_SQL} WHERE i.resolved_at IS NULL ORDER BY i.urgency, i.created_at"))?;
        let lang = self.lang();
        let rows = stmt.query_map([], |r| row_to_item(r, lang))?;
        Ok(rows.collect::<rusqlite::Result<_>>()?)
    }

    pub fn resolve_inbox(&mut self, id: &str, response: &str) -> Result<Resolved> {
        let item = self.inbox_item(id)?;
        let (resolved_at, engine_ref): (Option<i64>, Option<String>) =
            self.conn.query_row("SELECT resolved_at, engine_ref FROM inbox WHERE id = ?1", [id], |r| {
                Ok((r.get(0)?, r.get(1)?))
            })?;
        if resolved_at.is_some() {
            return Err(StoreError::Conflict(tr!(self.lang(), "这一项已经处理过了", "This item was already handled")));
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
        let lang = self.lang();
        let mut n = 0;
        for (id, kind) in open {
            if kinds.contains(&kind) {
                let now = self.now();
                self.conn.execute(
                    "UPDATE inbox SET resolved_at = ?2, response = ?3 WHERE id = ?1",
                    params![id, now, tr!(lang, "（撤回：{reason}）", "(withdrawn: {reason})")],
                )?;
                let response = tr!(lang, "撤回：{reason}", "Withdrawn: {reason}");
                self.append(goal_id, EventKind::InboxResolved { item_id: id, response })?;
                n += 1;
            }
        }
        Ok(n)
    }
}

#[cfg(test)]
mod tests {
    use tower_core::Lang;
    use tower_core::contract::Contract;

    use super::*;
    use crate::test_support::store;
    use crate::{NewGoal, NewProject};

    fn item(goal_id: &str, kind: InboxKind, urgency: u8) -> NewInboxItem {
        NewInboxItem {
            goal_id: goal_id.into(),
            kind,
            title: "幂等键来源？".into(),
            subject: "幂等键来源？".into(),
            body: String::new(),
            options: vec!["订单号".into(), "请求 ID".into()],
            allow_text: true,
            urgency,
            engine_ref: Some("ui-1".into()),
        }
    }

    #[test]
    fn system_titles_and_choices_follow_the_current_language() {
        use tower_core::i18n::Choice;
        use tower_core::lifecycle::Transition;
        let (mut s, _, id) = crate::goals::tests::seeded();
        s.transition(&id, Transition::Ratify, None, "").unwrap();
        s.transition(&id, Transition::RunStarted, None, "").unwrap();
        s.transition(&id, Transition::Pause { reason: PauseReason::BudgetSoftCap }, None, "").unwrap();
        let mut n = item(&id, InboxKind::Paused, 2);
        n.title = "已暂停：到达预算软上限".into();
        n.subject = String::new();
        n.options = Choice::labels(&[Choice::RaiseSoftCap, Choice::Abandon], Lang::Zh);
        let opened = s.open_inbox(n).unwrap();
        // The store's language is English: the Chinese item reads in English.
        assert_eq!(opened.title, "Paused: Reached the soft budget cap");
        assert_eq!(opened.subject, "Reached the soft budget cap");
        assert_eq!(opened.options[1], "Abandon this goal");
        let mut q = item(&id, InboxKind::Question, 1);
        q.options = vec!["是".into(), "b".into()];
        assert_eq!(s.open_inbox(q).unwrap().options[0], "是", "an agent's own answers stay as written");
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
            .create_goal(NewGoal {
                project_id: p.id,
                title: "t".into(),
                contract: Contract::quick("x", None, Lang::En),
            })
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
