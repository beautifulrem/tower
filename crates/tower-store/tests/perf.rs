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
