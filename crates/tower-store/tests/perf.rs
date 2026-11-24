//! Performance budgets for the store, on a file database like the app's:
//! a long-running goal (20 000 events) and a busy board (40 goals) must
//! stay instant to read. Bounds are generous so debug builds on CI pass;
//! they catch accidental quadratic work, not micro-regressions.

use std::time::{Duration, Instant};

use tower_core::EventKind;
use tower_core::contract::Contract;
use tower_core::i18n::Lang;
use tower_store::{NewGoal, NewProject, Store};

/// The best of three tries must be within budget: a busy machine (other
/// builds, a test run beside this one) slows one try, not three.
fn timed<T>(what: &str, budget: Duration, mut f: impl FnMut() -> T) -> T {
    let mut best = Duration::MAX;
    for _ in 0..3 {
        let t = Instant::now();
        let out = f();
        let took = t.elapsed();
        if took < budget {
            return out;
        }
        best = best.min(took);
    }
    panic!("{what} took {best:?} at best (budget {budget:?})");
}

#[test]
fn long_traces_and_busy_boards_read_fast() {
    let dir = tempfile::tempdir().unwrap();
    let mut s = Store::open(&dir.path().join("tower.db")).unwrap();
    let p = s
        .add_project(NewProject {
            name: "web".into(),
            root: "/r/web".into(),
            base_branch: "main".into(),
            test_command: None,
        })
        .unwrap();
    let goals: Vec<String> = (0..40)
        .map(|i| {
            s.create_goal(NewGoal {
                project_id: p.id.clone(),
                title: format!("goal {i}"),
                contract: Contract::quick("do it", Some("npm test".into()), Lang::En),
            })
            .unwrap()
            .id
        })
        .collect();
    let busy = &goals[0];
    timed("appending 20 000 events", Duration::from_secs(60), || {
        for i in 0..20_000 {
            let e = EventKind::ToolEnded {
                call_id: format!("c{i}"),
                tool: "bash".into(),
                is_error: i % 7 == 0,
                summary: "ok".into(),
                duration_ms: 12,
                target: None,
                denied: false,
            };
            s.append(busy, e).unwrap();
        }
    });
    let page = timed("a page of the trace", Duration::from_millis(200), || s.trace(busy, None, 200).unwrap());
    assert_eq!(page.len(), 200);
    let older = page.last().unwrap().seq;
    timed("an older page", Duration::from_millis(200), || s.trace(busy, Some(older), 200).unwrap());
    // The first read after 20 000 writes pays for the disk and the write-ahead
    // log; reading it again (every update while you look at it) is the
    // case that must stay instant.
    timed("the goal page, first read", Duration::from_secs(1), || s.detail(busy).unwrap());
    timed("the goal page", Duration::from_millis(50), || s.detail(busy).unwrap());
    let all = timed("every goal summary", Duration::from_millis(500), || s.summaries().unwrap());
    assert_eq!(all.len(), 40);
}

/// A board of 1000 goals, a third of them unmerged and touching files from
/// one shared pool: the phone page reads every summary each second it is
/// open, so this read must not grow with the square of the board.
#[test]
fn a_thousand_goal_board_reads_fast() {
    use tower_core::lifecycle::Transition;
    use tower_core::view::InboxKind;
    use tower_store::NewInboxItem;

    let dir = tempfile::tempdir().unwrap();
    let mut s = Store::open(&dir.path().join("tower.db")).unwrap();
    let p = s
        .add_project(NewProject {
            name: "web".into(),
            root: "/r/web".into(),
            base_branch: "main".into(),
            test_command: None,
        })
        .unwrap();
    for i in 0..1000 {
        let id = s
            .create_goal(NewGoal {
                project_id: p.id.clone(),
                title: format!("goal {i}"),
                contract: Contract::quick("do it", Some("npm test".into()), Lang::En),
            })
            .unwrap()
            .id;
        if i % 3 == 0 {
            s.transition(&id, Transition::Ratify, None, "").unwrap();
            s.transition(&id, Transition::RunStarted, None, "").unwrap();
            let files: Vec<String> = (0..20).map(|k| format!("src/f{}.rs", (i * 7 + k * 13) % 2000)).collect();
            s.set_touched(&id, &files).unwrap();
            s.open_inbox(NewInboxItem {
                goal_id: id.clone(),
                kind: InboxKind::Question,
                title: "q".into(),
                subject: "q".into(),
                body: String::new(),
                options: Vec::new(),
                allow_text: true,
                urgency: 1,
                engine_ref: None,
            })
            .unwrap();
        }
    }
    // Comparing each unmerged goal with every other took 1.5 s in a debug
    // build (230 ms in release), whatever the goals shared.
    let all = timed("1000 goal summaries", Duration::from_millis(500), || s.summaries().unwrap());
    assert_eq!(all.len(), 1000);
    assert!(all.iter().any(|g| !g.overlaps.is_empty()), "some goals share files");
}
