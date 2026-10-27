//! Dumps every view the interface reads from a Tower data directory as
//! JSON, for the interface's end-to-end tests (`apps/desktop/e2e`).
//!
//! ```sh
//! TOWER_HOME=/tmp/tower-demo/home cargo run -p tower-supervisor --example dump_views -- <out-dir>
//! ```
//!
//! The demo run that seeded the directory is real, so its outcome can
//! vary with timing. What the end-to-end tests take for granted about it is
//! checked here, when the fixtures are made (see [`premises`]): a seed that
//! came out differently fails with its reason instead of as a test waiting
//! out its timeout on a state the fixtures never had.

use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::Arc;

use tower_core::LifecycleState;
use tower_core::contract::CriterionKind;
use tower_core::view::{CanaryState, GoalDetail, GoalSummary, InboxItem, InboxKind, ReviewView, Settings};
use tower_supervisor::{Config, NullSink, Paths, Supervisor};

fn write(dir: &std::path::Path, name: &str, value: &impl serde::Serialize) {
    std::fs::write(dir.join(format!("{name}.json")), serde_json::to_vec_pretty(value).unwrap()).unwrap();
}

/// The seeded demo as the end-to-end tests and their enrichments
/// (`e2e/rich.ts`) read it; each broken premise, in words.
fn premises(
    settings: &Settings,
    goals: &[GoalSummary],
    inbox: &[InboxItem],
    details: &HashMap<String, GoalDetail>,
    reviews: &HashMap<String, ReviewView>,
) -> Vec<String> {
    let mut broken = Vec::new();
    let mut check = |ok: bool, premise: &str| {
        if !ok {
            broken.push(premise.to_string());
        }
    };
    check(settings.language == "en", "the interface language is English (the tests read English words)");
    let mut ids: Vec<&str> = goals.iter().map(|g| g.id.as_str()).collect();
    ids.sort_unstable();
    check(ids == ["G-0001", "G-0002", "G-0003", "G-0004"], "the four demo goals G-0001…G-0004 exist");
    let state = |id: &str| goals.iter().find(|g| g.id == id).map(|g| g.state);
    let card = |id: &str, kind: InboxKind| inbox.iter().any(|i| i.goal_id == id && i.kind == kind);

    // G-0001: the ready goal every review, accept and honesty test opens.
    check(state("G-0001") == Some(LifecycleState::InReview), "G-0001 is ready to accept");
    check(card("G-0001", InboxKind::ReviewReady), "G-0001 has its ready-to-accept card");
    if let Some(d) = details.get("G-0001") {
        let ids: Vec<&str> = d.criteria.iter().map(|c| c.criterion.id.as_str()).collect();
        check(ids == ["C1", "C2", "C3"], "G-0001's criteria are C1, C2 and C3");
        for c in d.criteria.iter().filter(|c| matches!(c.criterion.kind, CriterionKind::Exec { .. })) {
            let id = &c.criterion.id;
            check(
                c.verified.as_ref().is_some_and(|v| v.passed && !v.stale),
                &format!("G-0001's {id} passed on the current snapshot"),
            );
            check(c.canary == Some(CanaryState::Intact), &format!("G-0001's {id} canary is intact"));
            check(
                c.passed_on_base == Some(false) && c.base_error.is_none(),
                &format!("G-0001's {id} failed on the base (red → green), and its base ran"),
            );
        }
        check(
            d.criteria.iter().any(|c| c.criterion.id == "C3" && c.criterion.kind == CriterionKind::Human),
            "G-0001's C3 is checked by a human",
        );
        check(d.sentinels.is_empty(), "G-0001 has no sentinel findings (the tests add their own)");
        check(!d.has_held_out_tests, "the demo project has no held-out tests");
    } else {
        check(false, "G-0001's detail was dumped");
    }
    check(reviews.get("G-0001").is_some_and(|r| !r.files.is_empty()), "G-0001's review has a diff");
    // G-0003: the second review, which the tests widen to three files.
    check(reviews.get("G-0003").is_some_and(|r| r.files.len() == 1), "G-0003's review has exactly one file");
    // G-0004: the paused goal whose card the tests reword.
    check(state("G-0004") == Some(LifecycleState::Paused), "G-0004 is paused");
    check(card("G-0004", InboxKind::Paused), "G-0004 has its paused card");
    broken
}

#[tokio::main]
async fn main() {
    let out = PathBuf::from(std::env::args().nth(1).expect("usage: dump_views <out-dir>"));
    std::fs::create_dir_all(&out).unwrap();
    let root = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../..");
    let sup = Supervisor::start(
        Config {
            paths: Paths::new(Paths::default_root()),
            extension_source: root.join("extensions/tower-goal"),
            env: None,
            demo_engine: None,
        },
        Arc::new(NullSink),
    )
    .await
    .expect("start");
    // Nothing should move while we read: pause the scheduler's effects by
    // only reading; runs left from seeding were stopped by its shutdown.
    let settings = sup.settings();
    write(&out, "environment", &sup.environment());
    write(&out, "settings", &settings);
    write(&out, "projects", &sup.projects().unwrap());
    let goals = sup.goals().unwrap();
    write(&out, "goals", &goals);
    let inbox = sup.inbox().unwrap();
    write(&out, "inbox", &inbox);
    let mut files = serde_json::Map::new();
    let (mut details, mut reviews) = (HashMap::new(), HashMap::new());
    for g in &goals {
        let detail = sup.goal(&g.id).unwrap();
        write(&out, &format!("goal-{}", g.id), &detail);
        details.insert(g.id.clone(), detail);
        write(&out, &format!("trace-{}", g.id), &sup.trace(&g.id, None, 300).unwrap());
        if let Ok(review) = sup.review(&g.id, None).await {
            for f in &review.files {
                for old in [false, true] {
                    if let Ok(Some(text)) = sup.file_text(&g.id, &f.path, old, None).await {
                        files.insert(format!("{}:{}:{}", g.id, f.path, if old { "old" } else { "new" }), text.into());
                    }
                }
            }
            write(&out, &format!("review-{}", g.id), &review);
            reviews.insert(g.id.clone(), review);
        }
    }
    write(&out, "files", &files);
    sup.shutdown().await;
    let broken = premises(&settings, &goals, &inbox, &details, &reviews);
    if !broken.is_empty() {
        eprintln!("the seeded demo is not what the end-to-end tests expect:");
        for b in &broken {
            eprintln!("  - not true: {b}");
        }
        std::process::exit(1);
    }
    println!("{} goals → {} (premises hold)", goals.len(), out.display());
}
