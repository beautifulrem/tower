//! End-to-end goal flows against a scripted engine and real git.

use std::path::{Path, PathBuf};
use std::process::Command;
use std::sync::{Arc, Mutex};
use std::time::Duration;

use tower_core::contract::{Contract, Criterion, CriterionKind};
use tower_core::view::{GoalSummary, InboxKind, Settings};
use tower_core::{LifecycleState, PauseReason};
use tower_supervisor::shell_env::ShellEnv;
use tower_supervisor::{Config, NewGoalInput, Paths, Supervisor, UiSink, UiUpdate};

#[derive(Default)]
struct Collect(Mutex<Vec<UiUpdate>>);

impl UiSink for Collect {
    fn emit(&self, u: UiUpdate) {
        self.0.lock().unwrap().push(u);
    }
}

fn git(dir: &Path, args: &[&str]) -> String {
    let out = Command::new("git").args(args).current_dir(dir).output().unwrap();
    assert!(out.status.success(), "git {args:?}: {}", String::from_utf8_lossy(&out.stderr));
    String::from_utf8_lossy(&out.stdout).trim().to_string()
}

struct Harness {
    _tmp: tempfile::TempDir,
    repo: PathBuf,
    sup: Supervisor,
    sink: Arc<Collect>,
}

async fn harness(scenario: &str) -> Harness {
    let tmp = tempfile::tempdir().unwrap();
    let root = std::fs::canonicalize(tmp.path()).unwrap();
    let repo = root.join("repo");
    std::fs::create_dir_all(&repo).unwrap();
    git(&repo, &["init", "--quiet", "--initial-branch=main"]);
    git(&repo, &["config", "user.name", "Ada"]);
    git(&repo, &["config", "user.email", "ada@example.com"]);
    std::fs::write(repo.join("README.md"), "hello\n").unwrap();
    git(&repo, &["add", "."]);
    git(&repo, &["commit", "--quiet", "-m", "init"]);

    let home = root.join("home");
    std::fs::create_dir_all(&home).unwrap();
    let env = ShellEnv::from_pairs([
        ("PATH".to_string(), std::env::var("PATH").unwrap()),
        ("HOME".to_string(), home.display().to_string()),
        ("PI_FAKE_SCENARIO".to_string(), scenario.to_string()),
    ]);
    let ext = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../../extensions/tower-goal");
    let sink = Arc::new(Collect::default());
    let sup = Supervisor::start(
        Config { paths: Paths::new(root.join("tower")), extension_source: ext, env: Some(env) },
        sink.clone(),
    )
    .await
    .unwrap();
    let fake = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("tests/fixtures/fake_pi.py");
    sup.save_settings(Settings { pi_path: fake.display().to_string(), ..Settings::default() }).unwrap();
    Harness { _tmp: tmp, repo, sup, sink }
}

fn contract() -> Contract {
    let mut c = Contract::quick("创建 done.txt", None);
    c.criteria = vec![Criterion {
        id: "C1".into(),
        title: "done.txt 存在".into(),
        kind: CriterionKind::Exec { command: "test -f done.txt".into(), timeout_secs: 30 },
    }];
    c
}

async fn create(h: &Harness) -> String {
    let p = h.sup.add_project(h.repo.to_str().unwrap()).await.unwrap();
    h.sup
        .create_goal(NewGoalInput { project_id: p.id, title: "创建文件".into(), contract: contract(), ratify: true })
        .await
        .unwrap()
        .id
}

async fn wait_for(h: &Harness, id: &str, pred: impl Fn(&GoalSummary) -> bool) -> GoalSummary {
    for _ in 0..200 {
        let g = h.sup.goals().unwrap().into_iter().find(|g| g.id == id).unwrap();
        if pred(&g) {
            return g;
        }
        tokio::time::sleep(Duration::from_millis(50)).await;
    }
    let g = h.sup.goals().unwrap().into_iter().find(|g| g.id == id).unwrap();
    let trace = h.sup.trace(id, None, 50).unwrap();
    panic!("goal never reached the expected state: {g:#?}\ntrace: {trace:#?}");
}

#[tokio::test(flavor = "multi_thread")]
async fn a_goal_goes_from_intent_to_a_branch() {
    let h = harness("pass").await;
    let id = create(&h).await;

    let g = wait_for(&h, &id, |g| g.state == LifecycleState::InReview).await;
    assert_eq!((g.progress.verified, g.progress.machine), (1, 1));
    assert_eq!(g.progress.observed, 0, "touch is not the criterion command");

    let detail = h.sup.goal(&id).unwrap();
    assert!(detail.claims.iter().any(|c| c.text == "缺少 done.txt"));
    assert_eq!(detail.submit_summary.as_deref(), Some("创建了 done.txt"));
    let inbox = h.sup.inbox().unwrap();
    assert!(inbox.iter().any(|i| i.kind == InboxKind::ReviewReady));

    let review = h.sup.review(&id).await.unwrap();
    assert_eq!(review.files.len(), 1);
    assert_eq!(review.files[0].path, "done.txt");

    // The user's checkout is untouched until acceptance, and even then only
    // a branch is added.
    assert!(!h.repo.join("done.txt").exists());
    let branch = h.sup.accept(&id).await.unwrap();
    assert!(branch.starts_with("tower/g-0001"));
    assert_eq!(git(&h.repo, &["log", "-1", "--format=%an", &branch]), "Ada");
    assert!(!h.repo.join("done.txt").exists());
    assert_eq!(git(&h.repo, &["branch", "--show-current"]), "main");

    let g = wait_for(&h, &id, |g| g.state == LifecycleState::Accepted).await;
    assert_eq!(g.branch.as_deref(), Some(branch.as_str()));

    // The human merges it; Tower notices.
    git(&h.repo, &["merge", "--quiet", "--ff-only", &branch]);
    h.sup.check_integration().await.unwrap();
    wait_for(&h, &id, |g| g.state == LifecycleState::Integrated).await;

    assert!(h.sink.0.lock().unwrap().iter().any(|u| matches!(u, UiUpdate::Stream { .. })));
}

#[tokio::test(flavor = "multi_thread")]
async fn failed_verification_is_handed_back_as_rework() {
    let h = harness("fail_then_fix").await;
    let id = create(&h).await;
    let g = wait_for(&h, &id, |g| g.state == LifecycleState::InReview).await;
    assert_eq!(g.rework_cycles, 1);
    assert_eq!(g.run_no, 2);
    let detail = h.sup.goal(&id).unwrap();
    // The first "C1 met" claim was contradicted at the time; the latest result passes.
    assert!(detail.criteria[0].verified.as_ref().unwrap().passed);
}

#[tokio::test(flavor = "multi_thread")]
async fn questions_reach_the_inbox_and_answers_reach_the_agent() {
    let h = harness("ask").await;
    let id = create(&h).await;
    let mut item = None;
    for _ in 0..100 {
        item = h.sup.inbox().unwrap().into_iter().find(|i| i.kind == InboxKind::Question);
        if item.is_some() {
            break;
        }
        tokio::time::sleep(Duration::from_millis(50)).await;
    }
    let item = item.expect("question in inbox");
    assert_eq!(item.title, "写什么？");
    assert_eq!(item.options, ["a", "b"]);
    h.sup.answer(&item.id, "b").await.unwrap();

    wait_for(&h, &id, |g| g.state == LifecycleState::InReview).await;
    let ws = h.sup.goal(&id).unwrap().workspace.unwrap();
    assert_eq!(std::fs::read_to_string(Path::new(&ws).join("done.txt")).unwrap(), "b\n");
}

#[tokio::test(flavor = "multi_thread")]
async fn an_agent_that_stops_without_submitting_is_nudged_then_paused() {
    let h = harness("idle").await;
    let id = create(&h).await;
    let g = wait_for(&h, &id, |g| g.state == LifecycleState::Paused).await;
    assert_eq!(g.pause_reason, Some(PauseReason::IdleWithoutSubmit));
    let trace = h.sup.trace(&id, None, 200).unwrap();
    let nudges = trace
        .iter()
        .filter(|e| matches!(&e.event, tower_core::EventKind::Injected { text, .. } if text.contains("without calling `submit`")))
        .count();
    assert_eq!(nudges, 1);
    assert!(h.sup.inbox().unwrap().iter().any(|i| i.kind == InboxKind::Paused && i.goal_id == id));
}

#[tokio::test(flavor = "multi_thread")]
async fn pausing_stops_the_engine_and_resume_continues() {
    let h = harness("ask").await;
    let id = create(&h).await;
    wait_for(&h, &id, |g| g.needs_you > 0).await;
    h.sup.pause(&id).await.unwrap();
    let g = wait_for(&h, &id, |g| g.state == LifecycleState::Paused).await;
    assert_eq!(g.pause_reason, Some(PauseReason::Human));
    assert!(
        !h.sup.inbox().unwrap().iter().any(|i| i.kind == InboxKind::Question),
        "questions of a stopped engine are withdrawn"
    );
    h.sup.resume(&id).await.unwrap();
    wait_for(&h, &id, |g| g.state == LifecycleState::Running && g.run_no == 2).await;
    h.sup.abandon(&id).await.unwrap();
    wait_for(&h, &id, |g| g.state == LifecycleState::Abandoned).await;
}
