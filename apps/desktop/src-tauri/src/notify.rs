//! Which system notifications an inbox update sends (docs/08's attention
//! ladder), kept apart from Tauri so it can be tested: the Dock badge counts
//! items that block a goal; a notification goes out only for items that
//! block a run or need a way out, only when Tower is not in front, at most
//! once per item, never for a muted goal, and not during quiet time. Items
//! that waited through a quiet time are announced when it ends, several at
//! once as one digest rather than a burst.
//!
//! Goals ready for review block nothing, so they never interrupt one by one:
//! they roll into one digest, sent once the first of them has waited
//! [`REVIEW_DIGEST_AFTER`] in the background (everything that became ready
//! meanwhile goes in it). Coming to the front first counts them as seen.
//!
//! An item put aside ("remind me later") reminds again when its time comes,
//! whatever its kind — you asked to be reminded — and never twice for the
//! same state: what was announced is remembered by item and by the time it
//! was put aside until, so it reminds again only if put aside again. The
//! shell wakes at [`Announcer::next_wake`] (the next snooze ending, the next
//! digest due) so neither waits for some unrelated update.
//!
//! macOS Focus (Do Not Disturb) is honoured by the system, not here: a
//! Focus silences these notifications and files them in Notification
//! Center. Tower cannot hold them and send a digest when the Focus ends,
//! because it cannot reliably tell that a Focus is on: the Focus status
//! API (`INFocusStatusCenter`) needs the Communication Notifications
//! entitlement, which only a provisioning profile grants and a self-built
//! copy does not have; the Do Not Disturb database needs Full Disk Access
//! and is undocumented; and the notification plugin exposes neither. Quiet
//! hours (Settings) are the schedule Tower can keep, and they get the
//! digest.

use std::collections::{BTreeMap, HashSet};
use std::time::{Duration, Instant};

use tower_core::view::{InboxItem, InboxKind};
use tower_core::{Lang, Millis, tr};

/// Items that hold up a goal until the human acts. Review-ready items wait
/// for you but block nothing; they are counted separately in the interface.
pub fn blocking(kind: InboxKind) -> bool {
    !matches!(kind, InboxKind::ReviewReady)
}

/// The Dock badge: items that block a goal, or nothing.
pub fn badge_count(items: &[InboxItem]) -> Option<i64> {
    let n = items.iter().filter(|i| blocking(i.kind)).count();
    (n > 0).then_some(n as i64)
}

/// Kinds that interrupt: a run is blocked or a goal needs a way out.
fn urgent(kind: InboxKind) -> bool {
    matches!(
        kind,
        InboxKind::Question | InboxKind::Approval | InboxKind::Paused | InboxKind::Stalled | InboxKind::CiFailed
    )
}

/// At most `max` columns (CJK counts two), with an ellipsis when cut.
pub fn clip(s: &str, max: usize) -> String {
    let mut out = String::new();
    let mut w = 0;
    for c in s.chars() {
        let cw = if (c as u32) >= 0x2E80 { 2 } else { 1 };
        if w + cw > max {
            return format!("{}…", out.trim_end());
        }
        out.push(c);
        w += cw;
    }
    out
}

/// What is true when an update arrives.
pub struct Moment<'a> {
    /// Tower's window is in front.
    pub focused: bool,
    /// Quiet hours, or quiet until a time.
    pub quiet: bool,
    pub muted: &'a [String],
    pub lang: Lang,
    /// Now, in milliseconds since the epoch.
    pub now: Millis,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Note {
    pub title: String,
    pub body: String,
    /// Where coming to the front soon after takes you.
    pub route: String,
}

/// An item in one state: put aside until a time, or not. Announcing is
/// remembered per state, so an item reminds again only in a new one.
type ItemState = (String, Option<Millis>);

fn state_of(item: &InboxItem) -> ItemState {
    (item.id.clone(), item.snoozed_until)
}

/// Remembers what was announced, so each item notifies at most once per
/// state, and which goals ready for review wait for their digest.
#[derive(Default)]
pub struct Announcer {
    seen: HashSet<ItemState>,
    /// Review-ready items not yet announced, with when each was first seen.
    ready: BTreeMap<String, Millis>,
}

/// More than this many at once become one digest.
const DIGEST_OVER: usize = 2;

/// How long the first goal ready for review waits for others before one
/// digest announces them all.
pub const REVIEW_DIGEST_AFTER: Duration = Duration::from_secs(10 * 60);

/// Coming to the front within this long of a notification is answering it.
pub const ANSWER_WINDOW: Duration = Duration::from_secs(120);

impl Announcer {
    /// Items open at launch were announced before: they never notify again.
    pub fn already_announced(&mut self, items: &[InboxItem]) {
        self.seen.extend(items.iter().map(state_of));
    }

    /// The notifications for the open items `items`.
    pub fn plan(&mut self, items: &[InboxItem], now: &Moment<'_>) -> Vec<Note> {
        // Forget states no longer open (answered, or put aside): an item put
        // aside comes back in a new state and reminds again.
        self.seen.retain(|s| items.iter().any(|i| state_of(i) == *s));
        self.ready.retain(|id, _| items.iter().any(|i| &i.id == id));
        let mut announce: Vec<&InboxItem> = Vec::new();
        for item in items {
            let state = state_of(item);
            if self.seen.contains(&state) {
                continue;
            }
            // In front or muted, an item counts as seen and stays silent.
            if now.focused || now.muted.contains(&item.goal_id) {
                self.ready.remove(&item.id);
                self.seen.insert(state);
                continue;
            }
            // Back from "remind me later": a reminder, whatever its kind.
            let reminder = item.snoozed_until.is_some();
            if !reminder && item.kind == InboxKind::ReviewReady {
                // Waits for the digest, through a quiet time as well.
                self.ready.entry(item.id.clone()).or_insert(now.now);
                continue;
            }
            // While quiet nothing is marked as announced: items that waited
            // are announced on the first update after the quiet ends.
            if now.quiet {
                continue;
            }
            self.seen.insert(state);
            if reminder || urgent(item.kind) {
                announce.push(item);
            }
        }
        let lang = now.lang;
        let mut notes = if announce.len() > DIGEST_OVER {
            let n = announce.len();
            let goals: Vec<String> = announce.iter().map(|i| clip(&i.goal_title, 24)).collect();
            vec![Note {
                title: tr!(lang, "{n} 件事在等你", "{n} items need you"),
                body: clip(&goals.join(" · "), 120),
                route: "inbox".into(),
            }]
        } else {
            announce.into_iter().map(|item| one(item, lang)).collect()
        };
        if let Some(note) = self.review_digest(items, now) {
            notes.push(note);
        }
        notes
    }

    /// The digest of goals ready for review, once the first has waited long
    /// enough; they then count as announced.
    fn review_digest(&mut self, items: &[InboxItem], now: &Moment<'_>) -> Option<Note> {
        let first = *self.ready.values().min()?;
        if now.quiet || now.focused || now.now - first < REVIEW_DIGEST_AFTER.as_millis() as Millis {
            return None;
        }
        let ready: Vec<&InboxItem> = items.iter().filter(|i| self.ready.contains_key(&i.id)).collect();
        self.ready.clear();
        self.seen.extend(ready.iter().map(|i| state_of(i)));
        let lang = now.lang;
        match ready.as_slice() {
            [] => None,
            [item] => Some(Note {
                title: title_of(item),
                body: tr!(lang, "待验收", "Ready for review").to_string(),
                route: format!("goal/{}", item.goal_id),
            }),
            all => {
                let n = all.len();
                let goals: Vec<String> = all.iter().map(|i| clip(&i.goal_title, 24)).collect();
                Some(Note {
                    title: tr!(lang, "{n} 个目标待验收", "{n} goals ready for review"),
                    body: clip(&goals.join(" · "), 120),
                    route: "inbox".into(),
                })
            }
        }
    }

    /// When the next notification may be due with no update in between: the
    /// earliest end of an item put aside (`snoozed`), or the review digest.
    /// Always after `now`: a snooze the update raced is looked at again in a
    /// second, and an overdue digest waits only for a quiet time to end,
    /// which sends an update of its own.
    pub fn next_wake(&self, snoozed: &[InboxItem], now: Millis) -> Option<Millis> {
        let snoozes = snoozed.iter().filter_map(|i| i.snoozed_until).map(|t| t.max(now + 1000));
        let digest =
            self.ready.values().min().map(|t| t + REVIEW_DIGEST_AFTER.as_millis() as Millis).filter(|t| *t > now);
        snoozes.chain(digest).min()
    }
}

/// People remember goals by what they are about, not by number.
fn title_of(item: &InboxItem) -> String {
    if item.goal_title.trim().is_empty() { item.goal_id.clone() } else { clip(&item.goal_title, 40) }
}

fn one(item: &InboxItem, lang: Lang) -> Note {
    let what = match item.kind {
        InboxKind::Question => tr!(lang, "提问", "Question"),
        InboxKind::Approval => tr!(lang, "需要批准", "Approval"),
        InboxKind::Paused => tr!(lang, "已暂停", "Paused"),
        InboxKind::CiFailed => tr!(lang, "CI 未通过", "CI failed"),
        InboxKind::ReviewReady => tr!(lang, "待验收", "Ready for review"),
        InboxKind::Assumption => tr!(lang, "假设待确认", "Assumption to confirm"),
        _ => tr!(lang, "可能卡住", "May be stuck"),
    };
    let body = if item.snoozed_until.is_some() {
        format!("{} · {what} · {}", tr!(lang, "到时间了", "Reminder"), item.title)
    } else {
        format!("{what} · {}", item.title)
    };
    Note { title: title_of(item), body, route: format!("goal/{}", item.goal_id) }
}

/// The route to open on coming to the front: the latest notification's,
/// if it was sent within [`ANSWER_WINDOW`]; later it is just switching apps.
pub fn route_on_focus(pending: Option<(String, Instant)>, now: Instant) -> Option<String> {
    pending.filter(|(_, at)| now.saturating_duration_since(*at) < ANSWER_WINDOW).map(|(r, _)| r)
}

#[cfg(test)]
mod tests {
    use super::*;

    const MIN: Millis = 60_000;
    const T0: Millis = 1_800_000_000_000;

    fn item(id: &str, goal: &str, kind: InboxKind) -> InboxItem {
        InboxItem {
            id: id.into(),
            goal_id: goal.into(),
            goal_title: format!("Fix {goal}"),
            kind,
            title: "Which database?".into(),
            subject: String::new(),
            body: String::new(),
            options: vec![],
            allow_text: true,
            created_at: 0,
            urgency: 2,
            tones: vec![],
            snoozed_until: None,
        }
    }

    fn snoozed(mut i: InboxItem, until: Millis) -> InboxItem {
        i.snoozed_until = Some(until);
        i
    }

    fn moment(muted: &[String]) -> Moment<'_> {
        Moment { focused: false, quiet: false, muted, lang: Lang::En, now: T0 }
    }

    fn at(now: Millis) -> Moment<'static> {
        Moment { now, ..moment(&[]) }
    }

    #[test]
    fn a_blocking_item_in_the_background_notifies_once_by_goal_title() {
        let mut a = Announcer::default();
        let items = [item("i1", "G-0001", InboxKind::Question)];
        let notes = a.plan(&items, &moment(&[]));
        assert_eq!(
            notes,
            vec![Note {
                title: "Fix G-0001".into(),
                body: "Question · Which database?".into(),
                route: "goal/G-0001".into()
            }]
        );
        assert!(a.plan(&items, &moment(&[])).is_empty(), "never twice");
    }

    #[test]
    fn only_items_that_block_or_need_a_way_out_interrupt() {
        let mut a = Announcer::default();
        let items = [item("r", "G-1", InboxKind::ReviewReady), item("s", "G-2", InboxKind::Assumption)];
        assert!(a.plan(&items, &moment(&[])).is_empty());
        for (kind, word) in [
            (InboxKind::Approval, "Approval"),
            (InboxKind::Paused, "Paused"),
            (InboxKind::Stalled, "May be stuck"),
            (InboxKind::CiFailed, "CI failed"),
        ] {
            let notes = Announcer::default().plan(&[item("x", "G-3", kind)], &moment(&[]));
            assert!(notes[0].body.starts_with(word), "{kind:?}: {}", notes[0].body);
        }
    }

    #[test]
    fn in_front_an_item_is_seen_and_stays_silent_after() {
        let mut a = Announcer::default();
        let items = [item("i1", "G-1", InboxKind::Question)];
        assert!(a.plan(&items, &Moment { focused: true, ..moment(&[]) }).is_empty());
        assert!(a.plan(&items, &moment(&[])).is_empty(), "already seen while in front");
    }

    #[test]
    fn a_muted_goal_never_notifies() {
        let muted = vec!["G-1".to_string()];
        let mut a = Announcer::default();
        let items = [item("i1", "G-1", InboxKind::Paused), item("i2", "G-2", InboxKind::Paused)];
        let notes = a.plan(&items, &moment(&muted));
        assert_eq!(notes.len(), 1);
        assert_eq!(notes[0].route, "goal/G-2");
    }

    #[test]
    fn items_that_waited_through_quiet_time_come_after_it_as_one_digest() {
        let mut a = Announcer::default();
        let items: Vec<InboxItem> =
            (1..=3).map(|n| item(&format!("i{n}"), &format!("G-{n}"), InboxKind::Question)).collect();
        assert!(a.plan(&items[..1], &Moment { quiet: true, ..moment(&[]) }).is_empty());
        assert!(a.plan(&items, &Moment { quiet: true, ..moment(&[]) }).is_empty(), "nothing during the quiet");
        let notes = a.plan(&items, &moment(&[]));
        assert_eq!(
            notes,
            vec![Note {
                title: "3 items need you".into(),
                body: "Fix G-1 · Fix G-2 · Fix G-3".into(),
                route: "inbox".into()
            }]
        );
        assert!(a.plan(&items, &moment(&[])).is_empty(), "the digest announced them all");
    }

    #[test]
    fn two_at_once_are_two_notifications_not_a_digest() {
        let items = [item("a", "G-1", InboxKind::Question), item("b", "G-2", InboxKind::Approval)];
        let notes = Announcer::default().plan(&items, &moment(&[]));
        assert_eq!(notes.iter().map(|n| n.route.as_str()).collect::<Vec<_>>(), ["goal/G-1", "goal/G-2"]);
    }

    #[test]
    fn a_digest_counts_only_what_interrupts() {
        let mut items: Vec<InboxItem> =
            (1..=3).map(|n| item(&format!("i{n}"), &format!("G-{n}"), InboxKind::Paused)).collect();
        items.push(item("r", "G-9", InboxKind::ReviewReady));
        let notes = Announcer::default().plan(&items, &Moment { lang: Lang::Zh, ..moment(&[]) });
        assert_eq!(notes.len(), 1, "the goal ready for review waits for its own digest");
        assert_eq!(notes[0].title, "3 件事在等你");
        assert!(!notes[0].body.contains("G-9"));
    }

    #[test]
    fn an_item_open_at_launch_never_notifies_again() {
        let mut a = Announcer::default();
        let open = [item("old", "G-1", InboxKind::Question), item("r", "G-2", InboxKind::ReviewReady)];
        a.already_announced(&open);
        assert!(a.plan(&open, &moment(&[])).is_empty(), "announced before Tower started");
        assert_eq!(a.next_wake(&[], T0), None, "no review digest is pending for it either");
    }

    #[test]
    fn goals_ready_for_review_roll_into_one_digest() {
        let mut a = Announcer::default();
        let first = [item("r1", "G-1", InboxKind::ReviewReady)];
        assert!(a.plan(&first, &at(T0)).is_empty(), "never one by one");
        assert_eq!(a.next_wake(&[], T0), Some(T0 + 10 * MIN), "the shell wakes for the digest");
        let both = [first[0].clone(), item("r2", "G-2", InboxKind::ReviewReady)];
        assert!(a.plan(&both, &at(T0 + 3 * MIN)).is_empty(), "the second joins the first's digest");
        assert_eq!(a.next_wake(&[], T0), Some(T0 + 10 * MIN), "the window is the first one's");
        assert!(a.plan(&both, &at(T0 + 10 * MIN - 1)).is_empty());
        let notes = a.plan(&both, &at(T0 + 10 * MIN));
        assert_eq!(
            notes,
            vec![Note {
                title: "2 goals ready for review".into(),
                body: "Fix G-1 · Fix G-2".into(),
                route: "inbox".into()
            }]
        );
        assert!(a.plan(&both, &at(T0 + 30 * MIN)).is_empty(), "announced once");
        assert_eq!(a.next_wake(&[], T0), None);
    }

    #[test]
    fn one_goal_ready_for_review_is_named_and_opened() {
        let mut a = Announcer::default();
        let ready = [item("r1", "G-7", InboxKind::ReviewReady)];
        a.plan(&ready, &at(T0));
        let notes = a.plan(&ready, &Moment { lang: Lang::Zh, ..at(T0 + 10 * MIN) });
        assert_eq!(notes, vec![Note { title: "Fix G-7".into(), body: "待验收".into(), route: "goal/G-7".into() }]);
    }

    #[test]
    fn coming_to_the_front_before_the_digest_counts_the_ready_goals_as_seen() {
        let mut a = Announcer::default();
        let ready = [item("r1", "G-1", InboxKind::ReviewReady)];
        a.plan(&ready, &at(T0));
        assert!(a.plan(&ready, &Moment { focused: true, ..at(T0 + MIN) }).is_empty());
        assert_eq!(a.next_wake(&[], T0), None);
        assert!(a.plan(&ready, &at(T0 + 20 * MIN)).is_empty(), "seen in front: no digest");
    }

    #[test]
    fn the_review_digest_waits_out_a_quiet_time() {
        let mut a = Announcer::default();
        let ready = [item("r1", "G-1", InboxKind::ReviewReady)];
        a.plan(&ready, &Moment { quiet: true, ..at(T0) });
        assert!(a.plan(&ready, &Moment { quiet: true, ..at(T0 + 15 * MIN) }).is_empty(), "nothing while quiet");
        assert_eq!(a.plan(&ready, &at(T0 + 16 * MIN)).len(), 1, "it counted from when the goal was ready");
    }

    #[test]
    fn an_item_put_aside_reminds_when_its_time_comes_and_never_twice_for_the_same_state() {
        let mut a = Announcer::default();
        let q = item("q", "G-1", InboxKind::Question);
        assert_eq!(a.plan(std::slice::from_ref(&q), &at(T0)).len(), 1);
        // Put aside until T0 + 60 min: gone from the open items, and the
        // shell is told when to look again.
        let aside = snoozed(q.clone(), T0 + 60 * MIN);
        assert!(a.plan(&[], &at(T0 + MIN)).is_empty());
        assert_eq!(a.next_wake(std::slice::from_ref(&aside), T0 + MIN), Some(T0 + 60 * MIN));
        // Its time comes: one reminder, whatever happens after.
        let notes = a.plan(std::slice::from_ref(&aside), &at(T0 + 60 * MIN));
        assert_eq!(notes.len(), 1);
        assert_eq!(notes[0].body, "Reminder · Question · Which database?");
        assert_eq!(notes[0].route, "goal/G-1");
        for later in [61, 90, 600] {
            assert!(a.plan(std::slice::from_ref(&aside), &at(T0 + later * MIN)).is_empty(), "never twice");
        }
        // Put aside again: a new state, one more reminder when it ends.
        let again = snoozed(q, T0 + 700 * MIN);
        assert!(a.plan(&[], &at(T0 + 601 * MIN)).is_empty());
        assert_eq!(a.plan(std::slice::from_ref(&again), &at(T0 + 700 * MIN)).len(), 1);
        assert!(a.plan(std::slice::from_ref(&again), &at(T0 + 701 * MIN)).is_empty());
    }

    #[test]
    fn any_item_put_aside_reminds_but_not_in_front_muted_or_quiet() {
        let review = snoozed(item("r", "G-1", InboxKind::ReviewReady), T0);
        let notes = Announcer::default().plan(std::slice::from_ref(&review), &at(T0));
        assert_eq!(notes[0].body, "Reminder · Ready for review · Which database?", "you asked to be reminded");
        let assumption = snoozed(item("s", "G-2", InboxKind::Assumption), T0);
        assert_eq!(Announcer::default().plan(std::slice::from_ref(&assumption), &at(T0)).len(), 1);
        let mut a = Announcer::default();
        assert!(a.plan(std::slice::from_ref(&review), &Moment { focused: true, ..at(T0) }).is_empty());
        assert!(a.plan(std::slice::from_ref(&review), &at(T0 + MIN)).is_empty(), "seen when it came back");
        let muted = vec!["G-1".to_string()];
        assert!(Announcer::default().plan(std::slice::from_ref(&review), &moment(&muted)).is_empty());
        let mut a = Announcer::default();
        assert!(a.plan(std::slice::from_ref(&review), &Moment { quiet: true, ..at(T0) }).is_empty());
        assert_eq!(a.plan(std::slice::from_ref(&review), &at(T0 + 30 * MIN)).len(), 1, "after the quiet");
    }

    #[test]
    fn the_next_wake_is_the_earliest_of_a_snooze_ending_and_the_digest() {
        let mut a = Announcer::default();
        assert_eq!(a.next_wake(&[], T0), None);
        a.plan(&[item("r", "G-1", InboxKind::ReviewReady)], &at(T0));
        let soon = snoozed(item("q", "G-2", InboxKind::Question), T0 + 5 * MIN);
        let late = snoozed(item("p", "G-3", InboxKind::Paused), T0 + 50 * MIN);
        assert_eq!(a.next_wake(&[late.clone(), soon], T0), Some(T0 + 5 * MIN));
        assert_eq!(a.next_wake(std::slice::from_ref(&late), T0), Some(T0 + 10 * MIN));
        // Never a wake in the past, which would spin: a digest overdue in a
        // quiet time waits for the quiet's end; a snooze the update raced is
        // looked at again in a second.
        assert_eq!(a.next_wake(&[], T0 + 20 * MIN), None);
        assert_eq!(a.next_wake(&[late], T0 + 60 * MIN), Some(T0 + 60 * MIN + 1000));
    }

    #[test]
    fn titles_fall_back_to_the_id_and_are_clipped_by_width() {
        let mut untitled = item("i", "G-0042", InboxKind::Question);
        untitled.goal_title = "  ".into();
        assert_eq!(Announcer::default().plan(&[untitled], &moment(&[]))[0].title, "G-0042");
        let mut long = item("j", "G-1", InboxKind::Question);
        long.goal_title = "修复".repeat(30);
        let title = &Announcer::default().plan(&[long], &moment(&[]))[0].title;
        assert_eq!(title, &format!("{}…", "修复".repeat(10)));
        assert_eq!(clip("abc def", 5), "abc d…");
        assert_eq!(clip("abc  def", 5), "abc…", "no space before the ellipsis");
        assert_eq!(clip("short", 40), "short");
    }

    #[test]
    fn notifications_speak_the_interface_language() {
        let notes = Announcer::default()
            .plan(&[item("i", "G-1", InboxKind::CiFailed)], &Moment { lang: Lang::Zh, ..moment(&[]) });
        assert_eq!(notes[0].body, "CI 未通过 · Which database?");
        let back = snoozed(item("j", "G-2", InboxKind::Question), T0);
        let notes = Announcer::default().plan(&[back], &Moment { lang: Lang::Zh, ..moment(&[]) });
        assert_eq!(notes[0].body, "到时间了 · 提问 · Which database?");
    }

    #[test]
    fn the_badge_counts_only_blocking_items() {
        assert_eq!(badge_count(&[]), None);
        let items = [item("a", "G-1", InboxKind::ReviewReady), item("b", "G-2", InboxKind::Stalled)];
        assert_eq!(badge_count(&items), Some(1));
        assert_eq!(badge_count(&items[..1]), None);
    }

    #[test]
    fn coming_to_the_front_soon_after_opens_the_notified_goal() {
        let at = Instant::now();
        let pending = || Some(("goal/G-1".to_string(), at));
        assert_eq!(route_on_focus(pending(), at + Duration::from_secs(30)).as_deref(), Some("goal/G-1"));
        assert_eq!(route_on_focus(pending(), at + ANSWER_WINDOW), None, "later it is just switching apps");
        assert_eq!(route_on_focus(None, at), None);
    }
}
