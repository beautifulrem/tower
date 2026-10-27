//! The in-app demo: a fresh data directory, no Pi, one click to a goal
//! that asks a question, verifies in a clean checkout and waits for review.

use std::path::PathBuf;
use std::sync::Arc;
use std::time::Duration;

use tower_core::LifecycleState;
use tower_core::view::{InboxKind, Settings};
use tower_supervisor::shell_env::ShellEnv;
use tower_supervisor::{Config, NullSink, Paths, Supervisor};

#[tokio::test(flavor = "multi_thread")]
async fn the_demo_runs_without_pi() {
    let has = |p: &str| std::env::var("PATH").unwrap().split(':').any(|d| PathBuf::from(d).join(p).is_file());
    if !has("node") || !has("python3") {
        eprintln!("skipping: the demo needs node and python3");
        return;
    }
    let tmp = tempfile::tempdir().unwrap();
    let root = std::fs::canonicalize(tmp.path()).unwrap();
    let home = root.join("home");
    std::fs::create_dir_all(&home).unwrap();
    let manifest = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
    let sup = Supervisor::start(
        Config {
            paths: Paths::new(root.join("tower")),
            extension_source: manifest.join("../../extensions/tower-goal"),
            env: Some(ShellEnv::from_pairs([
                ("PATH".to_string(), std::env::var("PATH").unwrap()),
                ("HOME".to_string(), home.display().to_string()),
                ("PI_DEMO_DELAY".to_string(), "0".to_string()),
            ])),
            demo_engine: Some(manifest.join("../../tools/demo-engine/demo_pi.py")),
        },
        Arc::new(NullSink),
    )
    .await
    .unwrap();
    // No Pi configured at all.
    sup.save_settings(Settings { pi_path: "/nonexistent/pi".into(), language: "en".into(), ..Settings::default() })
        .unwrap();

    let goal = sup.start_demo().await.unwrap();
    assert_eq!(goal.title, "Demo: fix the cart total");

    let mut question = None;
    for _ in 0..200 {
        question = sup.inbox().unwrap().into_iter().find(|i| i.kind == InboxKind::Question);
        if question.is_some() {
            break;
        }
        tokio::time::sleep(Duration::from_millis(50)).await;
    }
    let question = question.expect("the demo asks a question first");
    sup.answer(&question.id, "Before").await.unwrap();

    let mut state = LifecycleState::Running;
    // Done as soon as it settles; a verification on a busy machine can take minutes.
    for _ in 0..3600 {
        state = sup.goals().unwrap().into_iter().find(|g| g.id == goal.id).unwrap().state;
        if matches!(state, LifecycleState::InReview | LifecycleState::Paused) {
            break;
        }
        tokio::time::sleep(Duration::from_millis(50)).await;
    }
    assert_eq!(state, LifecycleState::InReview, "trace: {:#?}", sup.trace(&goal.id, None, 100).unwrap());
    assert!(sup.goal(&goal.id).unwrap().criteria.iter().all(|c| c.verified.as_ref().is_some_and(|v| v.passed)));

    // Adding the project ran its tests on the base branch: they fail there
    // (that is the demo's bug), and the project says so.
    let mut check = None;
    for _ in 0..400 {
        check = sup.projects().unwrap()[0].test_check.clone().filter(|c| c.passed.is_some());
        if check.is_some() {
            break;
        }
        tokio::time::sleep(Duration::from_millis(50)).await;
    }
    let check = check.expect("the base check finishes");
    assert_eq!((check.passed, check.env_error), (Some(false), false), "{}", check.output_tail);

    // A second click reuses the project.
    sup.start_demo().await.unwrap();
    assert_eq!(sup.projects().unwrap().len(), 1);
    sup.shutdown().await;
}
