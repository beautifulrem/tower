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
    let mut code = None;
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
            let stall = tower_core::i18n::Stall::decode(&subject);
            code = stall.as_ref().and_then(|s| s.code()).map(String::from);
            let subject = stall.map_or(subject, |s| s.text(lang));
            (tr!(lang, "可能卡住：{subject}", "May be stuck: {subject}"), subject)
        }
        InboxKind::CiFailed => {
            // Each failing check's name is code, whole, the names apart by ", " in the words' face (review 23, record
            // only: "unit-tests, lint" was one code, its comma too, and a name may hold ", " itself, as a matrix job's
            // "test (ubuntu-latest, node 22)" does). Stored a line each (an older item: one line, read as one name).
            // In `code` the names stand apart by a blank line, as long as the ", " between them in the question, so
            // what follows the code in the question starts where it always did.
            let names: Vec<&str> = subject.lines().collect();
            code = Some(names.join("\n\n")).filter(|s| !s.is_empty());
            let subject = names.join(", ");
            (tr!(lang, "CI 未通过：{subject}", "CI failed: {subject}"), subject)
        }
        InboxKind::Approval if !subject.is_empty() => {
            (tr!(lang, "需要你批准：{subject}", "Approval needed: {subject}"), subject)
        }
        _ if !subject.is_empty() => (stored, subject),
        _ => (stored.clone(), stored),
    };
    // Tower's own explanation follows the language too.
    let body = if kind == InboxKind::Paused {
        tower_core::i18n::PauseNote::render(&body, lang)
    } else if kind == InboxKind::Stalled && tower_core::i18n::Stall::decode(&r.get::<_, String>("subject")?).is_some() {
        tr!(
            lang,
            "Agent 仍在运行。你可以继续等待、写一句转向，或者暂停它。",
            "The agent is still running. You can keep waiting, write a steer, or pause it."
        )
    } else {
        body
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
        snoozed_until: r.get("snoozed_until")?,
        code,
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
        self.atomically(|s| s.insert_inbox(n))
    }

    fn insert_inbox(&mut self, n: NewInboxItem) -> Result<InboxItem> {
        // The same thing said again (a check failing on another push) is one card, on the desk and the phone alike: it
        // replaces the goal's open item of its kind and words (review 22, record only: the desk kept the newest of each
        // by itself and the phone showed both). Never an engine's dialog: each is a question the agent waits on, and is
        // answered on its own.
        if n.engine_ref.is_none() {
            let older: Vec<String> = self
                .conn
                .prepare(
                    "SELECT id FROM inbox WHERE goal_id = ?1 AND kind = ?2 AND subject = ?3 AND engine_ref IS NULL
                     AND resolved_at IS NULL",
                )?
                .query_map(params![n.goal_id, enum_str(&n.kind), n.subject], |r| r.get(0))?
                .collect::<rusqlite::Result<_>>()?;
            let lang = self.lang();
            for item_id in older {
                let response =
                    self.closed_by_tower(&item_id, &tr!(lang, "被更新的一项取代", "A newer one replaced it"))?;
                let now = self.now();
                self.conn.execute(
                    "UPDATE inbox SET resolved_at = ?2, response = ?3 WHERE id = ?1",
                    params![item_id, now, tr!(lang, "（被更新的一项取代）", "(replaced by a newer one)")],
                )?;
                self.append(&n.goal_id, EventKind::InboxResolved { item_id, response, auto: true })?;
            }
        }
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

    /// Open items, most urgent first, then oldest first; items snoozed
    /// until later are left out until then.
    pub fn open_inbox_items(&self) -> Result<Vec<InboxItem>> {
        let mut stmt = self.conn.prepare(&format!(
            "{ITEM_SQL} WHERE i.resolved_at IS NULL AND (i.snoozed_until IS NULL OR i.snoozed_until <= ?1)
             ORDER BY i.urgency, i.created_at"
        ))?;
        let lang = self.lang();
        let rows = stmt.query_map([self.now()], |r| row_to_item(r, lang))?;
        Ok(rows.collect::<rusqlite::Result<_>>()?)
    }

    /// Open items put aside until later, soonest first.
    pub fn snoozed_inbox_items(&self) -> Result<Vec<InboxItem>> {
        let mut stmt = self.conn.prepare(&format!(
            "{ITEM_SQL} WHERE i.resolved_at IS NULL AND i.snoozed_until > ?1 ORDER BY i.snoozed_until"
        ))?;
        let lang = self.lang();
        let rows = stmt.query_map([self.now()], |r| row_to_item(r, lang))?;
        Ok(rows.collect::<rusqlite::Result<_>>()?)
    }

    /// Hides an open item until `until` (ms since the epoch), or shows it
    /// again with `None`.
    pub fn snooze_inbox(&mut self, id: &str, until: Option<tower_core::Millis>) -> Result<()> {
        let n = self
            .conn
            .execute("UPDATE inbox SET snoozed_until = ?2 WHERE id = ?1 AND resolved_at IS NULL", params![id, until])?;
        if n == 0 {
            return Err(StoreError::NotFound(format!("open inbox item {id}")));
        }
        Ok(())
    }

    /// A person's answer to an open item.
    pub fn resolve_inbox(&mut self, id: &str, response: &str) -> Result<Resolved> {
        self.close_inbox(id, response, None)
    }

    /// Closes an open item with `response`. `tower` is why, when Tower closed it and no person answered: the trace then
    /// says so in Tower's words (`closed_by_tower`), and the item keeps `response`.
    pub fn close_inbox(&mut self, id: &str, response: &str, tower: Option<&str>) -> Result<Resolved> {
        let item = self.inbox_item(id)?;
        let (resolved_at, engine_ref): (Option<i64>, Option<String>) =
            self.conn.query_row("SELECT resolved_at, engine_ref FROM inbox WHERE id = ?1", [id], |r| {
                Ok((r.get(0)?, r.get(1)?))
            })?;
        if resolved_at.is_some() {
            return Err(StoreError::Conflict(tr!(self.lang(), "这一项已经处理过了", "This item was already handled")));
        }
        let now = self.now();
        let said = match tower {
            Some(why) => self.closed_by_tower(id, why)?,
            None => response.into(),
        };
        self.conn
            .execute("UPDATE inbox SET resolved_at = ?2, response = ?3 WHERE id = ?1", params![id, now, response])?;
        let auto = tower.is_some();
        self.append(&item.goal_id, EventKind::InboxResolved { item_id: id.into(), response: said, auto })?;
        Ok(Resolved { item, engine_ref })
    }

    /// What the trace says when Tower closes an item no person answered: one sentence for every way it happens (the run
    /// stopped, a newer item replaced it, its time ran out), naming the item, so it never reads as a person's answer and
    /// never leaves you to guess which item went (review 23, record only: "Withdrawn: The run stopped", "(timed out: …)"
    /// and "Replaced by a newer one", three ways of saying it and none of them saying what).
    fn closed_by_tower(&self, id: &str, why: &str) -> Result<String> {
        let item = self.inbox_item(id)?;
        let what = if item.title.is_empty() { item.subject } else { item.title };
        Ok(tr!(self.lang(), "Tower 关闭了“{what}”：{why}", "Tower closed “{what}”: {why}"))
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
                let response = self.closed_by_tower(&id, reason)?;
                let now = self.now();
                self.conn.execute(
                    "UPDATE inbox SET resolved_at = ?2, response = ?3 WHERE id = ?1",
                    params![id, now, tr!(lang, "（撤回：{reason}）", "(withdrawn: {reason})")],
                )?;
                self.append(goal_id, EventKind::InboxResolved { item_id: id, response, auto: true })?;
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
    fn snoozed_items_step_aside_until_their_time() {
        let (mut s, clock) = store();
        let p = s
            .add_project(NewProject {
                name: "w".into(),
                root: "/r/w".into(),
                base_branch: "main".into(),
                test_command: None,
            })
            .unwrap();
        let g = s
            .create_goal(NewGoal {
                project_id: p.id,
                title: "t".into(),
                contract: tower_core::contract::Contract::quick("x", None, Lang::En),
            })
            .unwrap();
        let it = s.open_inbox(item(&g.id, InboxKind::Question, 1)).unwrap();
        s.snooze_inbox(&it.id, Some(clock.0.load(std::sync::atomic::Ordering::SeqCst) + 60_000)).unwrap();
        assert!(s.open_inbox_items().unwrap().is_empty());
        assert_eq!(
            s.snoozed_inbox_items().unwrap()[0].snoozed_until,
            Some(clock.0.load(std::sync::atomic::Ordering::SeqCst) + 60_000)
        );
        clock.advance(61_000);
        assert_eq!(s.open_inbox_items().unwrap().len(), 1);
        assert!(s.snoozed_inbox_items().unwrap().is_empty());
    }

    /// Review 22 (record only): the same thing said again was one card on the desk, which kept the newest of each by
    /// itself, and two on the phone. The supervisor's list is the one both read: the newer item replaces the older, and
    /// the goal needs you once. Two dialogs with the same words are two questions the agent waits on: both stay.
    #[test]
    fn the_same_thing_said_again_is_one_item_but_every_dialog_stays() {
        let (mut s, _, id) = crate::goals::tests::seeded();
        let ci = |subject: &str| NewInboxItem {
            kind: InboxKind::CiFailed,
            subject: subject.into(),
            engine_ref: None,
            ..item(&id, InboxKind::CiFailed, 2)
        };
        let first = s.open_inbox(ci("unit-tests")).unwrap();
        let other = s.open_inbox(ci("lint")).unwrap();
        let again = s.open_inbox(ci("unit-tests")).unwrap();
        let ids = |s: &crate::Store| s.open_inbox_items().unwrap().into_iter().map(|i| i.id).collect::<Vec<_>>();
        assert_eq!(ids(&s), vec![other.id.clone(), again.id.clone()]);
        // A failing check's name is code, whole (review 22, record only).
        assert_eq!(again.code.as_deref(), Some("unit-tests"));
        // Review 23 (record only): two failing checks are two codes, the ", " between them the words' (a name may hold
        // ", " itself); the code is as long as the names it stands for in the question.
        let two = s.open_inbox(ci("unit-tests\ntest (ubuntu-latest, node 22)")).unwrap();
        assert_eq!(two.subject, "unit-tests, test (ubuntu-latest, node 22)");
        assert_eq!(two.code.as_deref(), Some("unit-tests\n\ntest (ubuntu-latest, node 22)"));
        assert_eq!(two.code.as_ref().unwrap().len(), two.subject.len());
        assert!(two.title.ends_with("unit-tests, test (ubuntu-latest, node 22)"), "{}", two.title);
        s.resolve_inbox(&two.id, "Leave it").unwrap();
        assert_eq!(s.summary(&id).unwrap().needs_you, 2);
        assert!(s.resolve_inbox(&first.id, "late").is_err(), "the older one is closed, not left to answer");

        let ask = |ui: &str| NewInboxItem { engine_ref: Some(ui.into()), ..item(&id, InboxKind::Approval, 0) };
        let (a, b) = (s.open_inbox(ask("ui-1")).unwrap(), s.open_inbox(ask("ui-2")).unwrap());
        let open = ids(&s);
        assert!(open.contains(&a.id) && open.contains(&b.id), "{open:?}");
        assert_eq!(s.summary(&id).unwrap().needs_you, 4);
    }

    /// Review 22 follow-up: an item Tower closed (replaced by a newer one, withdrawn as the run stopped, timed out) was
    /// in the trace as the person's answer. It is Tower's, in Tower's register; an answer a person gave stays theirs.
    #[test]
    fn an_item_tower_closes_is_never_a_persons_answer() {
        let (mut s, _, id) = crate::goals::tests::seeded();
        let note = |subject: &str| NewInboxItem {
            subject: subject.into(),
            engine_ref: None,
            ..item(&id, InboxKind::CiFailed, 2)
        };
        let replaced = s.open_inbox(note("lint")).unwrap();
        s.open_inbox(note("lint")).unwrap();
        let withdrawn = s.open_inbox(item(&id, InboxKind::ReviewReady, 1)).unwrap();
        s.withdraw_inbox(&id, &[InboxKind::ReviewReady], "the run stopped").unwrap();
        let timed_out = s
            .open_inbox(NewInboxItem { engine_ref: Some("ui-1".into()), ..item(&id, InboxKind::Question, 1) })
            .unwrap();
        s.close_inbox(&timed_out.id, "(timed out)", Some("The asker stopped waiting for an answer")).unwrap();
        let answered = s
            .open_inbox(NewInboxItem { engine_ref: Some("ui-2".into()), ..item(&id, InboxKind::Question, 1) })
            .unwrap();
        s.resolve_inbox(&answered.id, "Before").unwrap();
        let closed: std::collections::HashMap<String, (bool, tower_core::event::Source, String)> = s
            .trace(&id, None, 100)
            .unwrap()
            .into_iter()
            .filter_map(|e| match e.event {
                EventKind::InboxResolved { item_id, auto, response } => Some((item_id, (auto, e.source, response))),
                _ => None,
            })
            .collect();
        use tower_core::event::Source::{Human, System};
        // Review 23 (record only): each said one way, Tower's, naming the item and why it went.
        let said = |it: &InboxItem, why: &str| {
            tr!(s.lang(), "Tower 关闭了“{t}”：{why}", "Tower closed “{t}”: {why}", t = it.title)
        };
        let replaced_why = tr!(s.lang(), "被更新的一项取代", "A newer one replaced it");
        for (it, why) in [
            (&replaced, replaced_why.as_str()),
            (&withdrawn, "the run stopped"),
            (&timed_out, "The asker stopped waiting for an answer"),
        ] {
            assert_eq!(closed[&it.id], (true, System, said(it, why)), "{}", it.subject);
        }
        assert_eq!(closed[&answered.id], (false, Human, "Before".into()));
        // The item itself keeps what it was closed with.
        let kept: String =
            s.conn.query_row("SELECT response FROM inbox WHERE id = ?1", [&timed_out.id], |r| r.get(0)).unwrap();
        assert_eq!(kept, "(timed out)");
    }

    /// Review 22 (record only): "pnpm test (bash) failed 4 times in a row" set the command in the words' face. The item
    /// says which part is code, in the language it is read in; the clients set it so.
    #[test]
    fn a_stalls_command_is_code_in_either_language() {
        let (mut s, _, id) = crate::goals::tests::seeded();
        let stall = tower_core::i18n::Stall::Repeated { tool: "bash".into(), target: "pnpm test".into(), times: 4 };
        s.open_inbox(NewInboxItem {
            kind: InboxKind::Stalled,
            subject: stall.encode(),
            engine_ref: None,
            ..item(&id, InboxKind::Stalled, 2)
        })
        .unwrap();
        for (lang, subject) in
            [("en", "pnpm test (bash) failed 4 times in a row"), ("zh-CN", "pnpm test（bash）连续失败 4 次")]
        {
            let mut cfg = s.settings().unwrap();
            cfg.language = lang.into();
            s.save_settings(&cfg).unwrap();
            let it = s.open_inbox_items().unwrap().pop().unwrap();
            assert_eq!((it.subject.as_str(), it.code.as_deref()), (subject, Some("pnpm test")));
        }
        let quiet = tower_core::i18n::Stall::NoProgress { minutes: 12 };
        let it = s
            .open_inbox(NewInboxItem { subject: quiet.encode(), engine_ref: None, ..item(&id, InboxKind::Stalled, 2) })
            .unwrap();
        assert_eq!(it.code, None);
    }

    #[test]
    fn a_pause_and_its_card_are_written_together_or_not_at_all() {
        use tower_core::lifecycle::Transition;
        let (mut s, _, id) = crate::goals::tests::seeded();
        s.transition(&id, Transition::Ratify, None, "").unwrap();
        s.transition(&id, Transition::RunStarted, None, "").unwrap();
        let events = s.trace(&id, None, 100).unwrap().len();
        let failed: Result<()> = s.atomically(|s| {
            s.transition(&id, Transition::Pause { reason: PauseReason::EngineCrash }, None, "")?;
            s.open_inbox(item(&id, InboxKind::Paused, 2))?;
            Err(StoreError::Conflict("later step failed".into()))
        });
        assert!(failed.is_err());
        assert_eq!(s.goal(&id).unwrap().state, tower_core::LifecycleState::Running);
        assert!(s.open_inbox_items().unwrap().is_empty());
        assert_eq!(s.trace(&id, None, 100).unwrap().len(), events);
        s.atomically(|s| {
            s.transition(&id, Transition::Pause { reason: PauseReason::EngineCrash }, None, "")?;
            s.open_inbox(item(&id, InboxKind::Paused, 2))
        })
        .unwrap();
        assert_eq!(s.goal(&id).unwrap().state, tower_core::LifecycleState::Paused);
        assert_eq!(s.open_inbox_items().unwrap().len(), 1);
    }

    /// The supervisor keeps using the store after a panic (its lock is
    /// taken poisoned or not): a panic inside a transaction must not leave
    /// it open, or nothing written afterwards would ever be committed.
    #[test]
    fn a_panic_inside_a_transaction_rolls_it_back() {
        use tower_core::lifecycle::Transition;
        let (mut s, _, id) = crate::goals::tests::seeded();
        s.transition(&id, Transition::Ratify, None, "").unwrap();
        s.transition(&id, Transition::RunStarted, None, "").unwrap();
        let panicked = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
            let _ = s.atomically(|s| -> Result<()> {
                s.transition(&id, Transition::Pause { reason: PauseReason::EngineCrash }, None, "")?;
                panic!("a bug halfway through");
            });
        }));
        assert!(panicked.is_err());
        assert!(s.conn.is_autocommit(), "the transaction was closed");
        assert_eq!(s.goal(&id).unwrap().state, tower_core::LifecycleState::Running, "and rolled back");
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
