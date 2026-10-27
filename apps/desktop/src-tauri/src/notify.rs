//! Which system notifications an inbox update sends (docs/08's attention
//! ladder), kept apart from Tauri so it can be tested: the Dock badge counts
//! items that block a goal; a notification goes out only for items that
//! block a run or need a way out, only when Tower is not in front, at most
//! once per item, never for a muted goal, and not during quiet time. Items
//! that waited through a quiet time are announced when it ends, several at
//! once as one digest rather than a burst.
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

use std::collections::HashSet;
use std::time::{Duration, Instant};

use tower_core::view::{InboxItem, InboxKind};
use tower_core::{Lang, tr};

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
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Note {
    pub title: String,
    pub body: String,
    /// Where coming to the front soon after takes you.
    pub route: String,
}

/// Remembers what was announced, so each item notifies at most once.
#[derive(Default)]
pub struct Announcer {
    seen: HashSet<String>,
}

/// More than this many at once become one digest.
const DIGEST_OVER: usize = 2;

/// Coming to the front within this long of a notification is answering it.
pub const ANSWER_WINDOW: Duration = Duration::from_secs(120);

impl Announcer {
    /// Items open at launch were announced before: they never notify again.
    pub fn already_announced(&mut self, items: &[InboxItem]) {
        self.seen.extend(items.iter().map(|i| i.id.clone()));
    }

    /// The notifications for the open items `items`.
    pub fn plan(&mut self, items: &[InboxItem], now: &Moment<'_>) -> Vec<Note> {
        // Forget items no longer open (answered, or snoozed): a snoozed item
        // that comes back is announced again.
        self.seen.retain(|id| items.iter().any(|i| &i.id == id));
        let mut announce: Vec<&InboxItem> = Vec::new();
        for item in items {
            // While quiet nothing is marked as announced: items that waited
            // are announced on the next update after the quiet ends. In front
            // or muted, an item counts as seen and stays silent.
            if now.quiet || !self.seen.insert(item.id.clone()) || now.focused || now.muted.contains(&item.goal_id) {
                continue;
            }
            if urgent(item.kind) {
                announce.push(item);
            }
        }
        let lang = now.lang;
        if announce.len() > DIGEST_OVER {
            let n = announce.len();
            let goals: Vec<String> = announce.iter().map(|i| clip(&i.goal_title, 24)).collect();
            return vec![Note {
                title: tr!(lang, "{n} 件事在等你", "{n} items need you"),
                body: clip(&goals.join(" · "), 120),
                route: "inbox".into(),
            }];
        }
        announce
            .into_iter()
            .map(|item| {
                // People remember goals by what they are about, not by number.
                let title =
                    if item.goal_title.trim().is_empty() { item.goal_id.clone() } else { clip(&item.goal_title, 40) };
                let what = match item.kind {
                    InboxKind::Question => tr!(lang, "提问", "Question"),
                    InboxKind::Approval => tr!(lang, "需要批准", "Approval"),
                    InboxKind::Paused => tr!(lang, "已暂停", "Paused"),
                    InboxKind::CiFailed => tr!(lang, "CI 未通过", "CI failed"),
                    _ => tr!(lang, "可能卡住", "May be stuck"),
                };
                Note { title, body: format!("{what} · {}", item.title), route: format!("goal/{}", item.goal_id) }
            })
            .collect()
    }
}

/// The route to open on coming to the front: the latest notification's,
/// if it was sent within [`ANSWER_WINDOW`]; later it is just switching apps.
pub fn route_on_focus(pending: Option<(String, Instant)>, now: Instant) -> Option<String> {
    pending.filter(|(_, at)| now.saturating_duration_since(*at) < ANSWER_WINDOW).map(|(r, _)| r)
}

#[cfg(test)]
mod tests {
    use super::*;

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

    fn moment(muted: &[String]) -> Moment<'_> {
        Moment { focused: false, quiet: false, muted, lang: Lang::En }
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
        assert_eq!(notes[0].title, "3 件事在等你");
        assert!(!notes[0].body.contains("G-9"));
    }

    #[test]
    fn an_item_that_comes_back_is_announced_again_but_not_one_open_at_launch() {
        let mut a = Announcer::default();
        let open = [item("old", "G-1", InboxKind::Question)];
        a.already_announced(&open);
        assert!(a.plan(&open, &moment(&[])).is_empty(), "announced before Tower started");
        // Snoozed (gone from the open items), then back.
        assert!(a.plan(&[], &moment(&[])).is_empty());
        assert_eq!(a.plan(&open, &moment(&[])).len(), 1);
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
