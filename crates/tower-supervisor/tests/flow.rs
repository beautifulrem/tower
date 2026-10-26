//! End-to-end goal flows against a scripted engine and real git.

use std::path::{Path, PathBuf};
use std::process::Command;
use std::sync::{Arc, Mutex};
use std::time::Duration;

use tower_core::contract::{Contract, Criterion, CriterionKind};
use tower_core::view::{GoalSummary, InboxKind, Settings};
use tower_core::{EventKind, Lang, LifecycleState, PauseReason};
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
        Config { paths: Paths::new(root.join("tower")), extension_source: ext, env: Some(env), demo_engine: None },
        sink.clone(),
    )
    .await
    .unwrap();
    let fake = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("tests/fixtures/fake_pi.py");
    // English, so the flows do not depend on the machine's language.
    sup.save_settings(Settings { pi_path: fake.display().to_string(), language: "en".into(), ..Settings::default() })
        .unwrap();
    Harness { _tmp: tmp, repo, sup, sink }
}

fn contract() -> Contract {
    let mut c = Contract::quick("创建 done.txt", None, Lang::En);
    c.criteria = vec![Criterion {
        id: "C1".into(),
        title: "done.txt 存在".into(),
        kind: CriterionKind::Exec { command: "test -f done.txt".into(), timeout_secs: 30 },
    }];
    c
}

async fn create(h: &Harness) -> String {
    create_with(h, contract()).await
}

async fn create_with(h: &Harness, contract: Contract) -> String {
    let p = match h.sup.projects().unwrap().into_iter().next() {
        Some(p) => p,
        None => h.sup.add_project(h.repo.to_str().unwrap()).await.unwrap(),
    };
    h.sup
        .create_goal(NewGoalInput { project_id: p.id, title: "创建文件".into(), contract, ratify: true })
        .await
        .unwrap()
        .id
}

#[tokio::test(flavor = "multi_thread")]
async fn sentinels_hold_a_passing_but_suspicious_snapshot() {
    let h = harness("cheat").await;
    let id = create(&h).await;
    let g = wait_for(&h, &id, |g| g.state == LifecycleState::Paused).await;
    assert_eq!(g.pause_reason, Some(PauseReason::SentinelHigh));
    let d = h.sup.goal(&id).unwrap();
    assert!(d.sentinels.iter().any(|s| s.sentinel == "test_skipped"), "{:?}", d.sentinels);
    assert!(d.criteria[0].verified.as_ref().unwrap().passed, "the criteria themselves passed");

    // The card was written in English.
    let item = wait_inbox(&h, &id, InboxKind::Paused).await;
    assert_eq!(item.title, "Paused: Sentinel hit: needs your confirmation");
    assert_eq!(
        item.options,
        ["Have the agent redo it without these changes", "I've checked, go to review", "Abandon this goal"]
    );
    // The human switches the interface to Chinese, looks, and decides it is
    // fine: the Chinese label still picks the option on the English card.
    h.sup.save_settings(Settings { language: "zh-CN".into(), ..h.sup.settings() }).unwrap();
    h.sup.answer(&item.id, "我已确认，进入评审").await.unwrap();
    wait_for(&h, &id, |g| g.state == LifecycleState::InReview).await;
}

#[tokio::test(flavor = "multi_thread")]
async fn repeated_failures_raise_a_stall_without_stopping_the_run() {
    let h = harness("flaky").await;
    let id = create(&h).await;
    wait_for(&h, &id, |g| g.state == LifecycleState::InReview).await;
    let stall = h.sup.trace(&id, None, 200).unwrap().into_iter().find_map(|e| match e.event {
        tower_core::EventKind::Stalled { detail, .. } => Some(detail),
        _ => None,
    });
    assert!(stall.expect("a stall").contains("npm run build"));
}

#[tokio::test(flavor = "multi_thread")]
async fn local_files_reach_the_workspace_and_the_verifier() {
    let h = harness("pass").await;
    std::fs::write(h.repo.join(".gitignore"), ".env\n").unwrap();
    git(&h.repo, &["add", ".gitignore"]);
    git(&h.repo, &["commit", "--quiet", "-m", "ignore env"]);
    std::fs::write(h.repo.join(".env"), "API_TOKEN=local\n").unwrap();
    let p = h.sup.add_project(h.repo.to_str().unwrap()).await.unwrap();
    h.sup
        .update_project(
            &p.id,
            &tower_store::ProjectPatch {
                base_branch: "main".into(),
                test_command: None,
                local_files: vec![".env".into()],
                memory: "回答一律用中文".into(),
                setup_command: "echo ready > .setup-done".into(),
                holdout_files: vec![],
            },
        )
        .unwrap();
    let mut c = contract();
    c.criteria[0].kind =
        CriterionKind::Exec { command: "test -f done.txt && grep -q API_TOKEN .env".into(), timeout_secs: 30 };
    let id = create_with(&h, c).await;
    wait_for(&h, &id, |g| g.state == LifecycleState::InReview).await;
    let d = h.sup.goal(&id).unwrap();
    assert_eq!(d.local_files, [".env"]);
    // The project's setup command ran in the workspace, sandboxed.
    let ws = d.workspace.clone().unwrap();
    assert_eq!(std::fs::read_to_string(Path::new(&ws).join(".setup-done")).unwrap(), "ready\n");
    // Ignored, so never part of a snapshot or the review.
    assert!(h.sup.review(&id, None).await.unwrap().files.iter().all(|f| f.path != ".env"));
}

/// The pause and its Needs-You item are written one after the other.
async fn wait_inbox(h: &Harness, id: &str, kind: InboxKind) -> tower_core::view::InboxItem {
    for _ in 0..200 {
        if let Some(i) = h.sup.inbox().unwrap().into_iter().find(|i| i.goal_id == id && i.kind == kind) {
            return i;
        }
        tokio::time::sleep(Duration::from_millis(25)).await;
    }
    panic!("no {kind:?} item for {id}");
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

    // In the background, the criterion also runs on the base commit: it
    // failed there, so its green result is evidence the change made it pass.
    let mut on_base = None;
    for _ in 0..100 {
        on_base = h.sup.goal(&id).unwrap().criteria[0].passed_on_base;
        if on_base.is_some() {
            break;
        }
        tokio::time::sleep(std::time::Duration::from_millis(50)).await;
    }
    assert_eq!(on_base, Some(false));

    let review = h.sup.review(&id, None).await.unwrap();
    assert_eq!(review.files.len(), 1);
    assert_eq!(review.files[0].path, "done.txt");
    // Whole files on either side, for expanding context around a hunk.
    assert_eq!(h.sup.file_text(&id, "README.md", true, None).await.unwrap().as_deref(), Some("hello\n"));
    assert!(h.sup.file_text(&id, "done.txt", false, None).await.unwrap().is_some());
    assert_eq!(h.sup.file_text(&id, "done.txt", true, None).await.unwrap(), None);

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

    // An ended goal's workspace can be deleted; the record stays.
    let ws = h.sup.goal(&id).unwrap().workspace.unwrap();
    assert!(Path::new(&ws).exists());
    h.sup.remove_workspace(&id).await.unwrap();
    assert!(!Path::new(&ws).exists());
    assert!(h.sup.goal(&id).unwrap().workspace.is_none());
    assert!(!h.sup.trace(&id, None, 10).unwrap().is_empty());
}

/// Verification never uses anything the agent could write: the agent's
/// package cache is not the verifier's.
#[tokio::test(flavor = "multi_thread")]
async fn verification_does_not_see_the_agents_cache() {
    let h = harness("poison_cache").await;
    let mut c = contract();
    c.criteria[0].kind = CriterionKind::Exec {
        command: "test -f done.txt && test ! -e \"$npm_config_cache/poison\"".into(),
        timeout_secs: 30,
    };
    let id = create_with(&h, c).await;
    let g = wait_for(&h, &id, |g| matches!(g.state, LifecycleState::InReview | LifecycleState::Paused)).await;
    assert_eq!(g.state, LifecycleState::InReview, "the verifier's cache is fresh");
}

/// When the agent changes dependency manifests under a contract without
/// the network, verification's setup runs offline; if that fails, the goal
/// asks the human instead of letting the agent's choices reach the network.
#[tokio::test(flavor = "multi_thread")]
async fn changed_dependencies_need_the_human_before_setup_goes_online() {
    let h = harness("deps").await;
    let mut c = contract();
    // Passes on the base (your content), fails on the agent's snapshot.
    c.setup = "if [ -f done.txt ]; then exit 1; fi".into();
    let id = create_with(&h, c).await;
    let g = wait_for(&h, &id, |g| matches!(g.state, LifecycleState::InReview | LifecycleState::Paused)).await;
    assert_eq!(g.pause_reason, Some(PauseReason::DependenciesChanged));
    let card = wait_inbox(&h, &id, InboxKind::Paused).await;
    assert_eq!(card.options[0], "I've checked, install with the network");
    h.sup.answer(&card.id, &card.options[0]).await.unwrap();
    // Approved: setup now runs with the network (and this one still fails,
    // which is an ordinary environment error).
    let g = wait_for(&h, &id, |g| g.pause_reason == Some(PauseReason::VerifyEnvError)).await;
    assert_eq!(g.state, LifecycleState::Paused);
    let trace = h.sup.trace(&id, None, 200).unwrap();
    assert!(trace.iter().any(|e| matches!(e.event, EventKind::SetupNetworkApproved { .. })));
}

/// The human can undo one hunk of the change, or put the workspace back to
/// where a run started; both are recorded as the human's edits and leave
/// the goal needing verification again.
#[tokio::test(flavor = "multi_thread")]
async fn hunks_can_be_undone_and_runs_rolled_back() {
    let h = harness("pass").await;
    let id = create(&h).await;
    wait_for(&h, &id, |g| g.state == LifecycleState::InReview).await;
    let ws = PathBuf::from(h.sup.goal(&id).unwrap().workspace.clone().unwrap());
    assert!(ws.join("done.txt").exists());

    h.sup.revert_hunk(&id, "done.txt", 0).await.unwrap();
    assert!(!ws.join("done.txt").exists(), "the only hunk of done.txt was its creation");
    let trace = h.sup.trace(&id, None, 200).unwrap();
    assert!(trace.iter().any(|e| matches!(&e.event, EventKind::HumanEdited { files } if files == &["done.txt"])));
    assert!(h.sup.accept(&id).await.is_err(), "the reviewed snapshot is no longer what is in the workspace");

    std::fs::write(ws.join("done.txt"), "by hand\n").unwrap();
    std::fs::write(ws.join("scratch.txt"), "x\n").unwrap();
    h.sup.rollback(&id, 1).await.unwrap();
    assert!(!ws.join("done.txt").exists() && !ws.join("scratch.txt").exists(), "back to where run 1 started");
    assert!(ws.join("README.md").exists());

    // The rollback itself can be undone.
    h.sup.undo_rollback(&id).await.unwrap();
    assert_eq!(std::fs::read_to_string(ws.join("done.txt")).unwrap(), "by hand\n");
    assert!(ws.join("scratch.txt").exists());

    // A small edit made in the review is the human's.
    h.sup.write_file(&id, "done.txt", "edited in review\n").await.unwrap();
    assert_eq!(std::fs::read_to_string(ws.join("done.txt")).unwrap(), "edited in review\n");
    assert!(h.sup.write_file(&id, "../escape.txt", "x").await.is_err());
}

/// Claude Code (or any ACP agent) runs behind the ACP bridge: Tower's own
/// tools are its only tools, the gate still applies, and the goal moves
/// through the same lifecycle as with Pi. Uses a scripted ACP agent.
#[tokio::test(flavor = "multi_thread")]
async fn an_acp_agent_runs_through_the_bridge() {
    let node = std::env::var("PATH").unwrap().split(':').any(|d| Path::new(d).join("node").is_file());
    if !node {
        eprintln!("skipping: node is not installed");
        return;
    }
    let h = harness("pass").await;
    let fake = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("tests/fixtures/fake_acp.py");
    h.sup
        .save_settings(Settings {
            engine: "claude-code".into(),
            claude_acp_command: format!("python3 {}", fake.display()),
            ..h.sup.settings()
        })
        .unwrap();
    let id = create(&h).await;
    let g = wait_for(&h, &id, |g| matches!(g.state, LifecycleState::InReview | LifecycleState::Paused)).await;
    let trace = h.sup.trace(&id, None, 300).unwrap();
    assert_eq!(g.state, LifecycleState::InReview, "trace: {trace:#?}");
    let detail = h.sup.goal(&id).unwrap();
    assert!(detail.claims.iter().any(|c| c.text == "done.txt is missing"), "log reached Tower as a claim");
    assert_eq!(detail.submit_summary.as_deref(), Some("created done.txt"));
    assert!(
        trace
            .iter()
            .any(|e| matches!(&e.event, EventKind::AssistantMessage { text } if text.contains("escape: refused"))),
        "the scope gate refused a write outside the workspace"
    );
}

/// A test edited to pass (here: a check script made to exit 0) passes the
/// criterion, but the same criterion fails with the original test restored:
/// the goal is held for the human before it reaches review, and the
/// criterion does not count as red → green evidence.
#[tokio::test(flavor = "multi_thread")]
async fn passing_only_with_edited_tests_holds_the_goal() {
    let h = harness("weaken_test").await;
    std::fs::create_dir_all(h.repo.join("test")).unwrap();
    std::fs::write(h.repo.join("test/check.sh"), "exit 1\n").unwrap();
    git(&h.repo, &["add", "."]);
    git(&h.repo, &["commit", "--quiet", "-m", "a failing check"]);
    let mut c = contract();
    c.criteria[0].kind = CriterionKind::Exec { command: "sh test/check.sh".into(), timeout_secs: 30 };
    let id = create_with(&h, c).await;
    let g = wait_for(&h, &id, |g| matches!(g.state, LifecycleState::InReview | LifecycleState::Paused)).await;
    assert_eq!((g.state, g.pause_reason), (LifecycleState::Paused, Some(PauseReason::SentinelHigh)));
    let d = h.sup.goal(&id).unwrap();
    let crit = &d.criteria[0];
    assert!(crit.verified.as_ref().unwrap().passed, "the edited test passes");
    assert_eq!(crit.passed_on_base, Some(false), "it failed on the base");
    assert_eq!(crit.passes_with_original_tests, Some(false), "and fails with the original test");
    assert!(d.sentinels.iter().any(|s| s.sentinel == "passes_only_with_edited_tests"));
}

/// Held-out tests: git-ignored files of your repository copied into
/// verification only. The agent's workspace never has them, and the
/// criterion that runs them passes only if the code really works.
#[tokio::test(flavor = "multi_thread")]
async fn held_out_tests_run_in_verification_only() {
    let h = harness("pass").await;
    std::fs::write(h.repo.join(".gitignore"), "holdout/\n").unwrap();
    git(&h.repo, &["add", ".gitignore"]);
    git(&h.repo, &["commit", "--quiet", "-m", "ignore holdout"]);
    std::fs::create_dir_all(h.repo.join("holdout")).unwrap();
    std::fs::write(h.repo.join("holdout/check.sh"), "grep -qx ok done.txt\n").unwrap();
    let p = h.sup.add_project(h.repo.to_str().unwrap()).await.unwrap();
    h.sup
        .update_project(
            &p.id,
            &tower_store::ProjectPatch {
                base_branch: "main".into(),
                test_command: None,
                local_files: vec![],
                memory: String::new(),
                setup_command: String::new(),
                holdout_files: vec!["holdout/**".into()],
            },
        )
        .unwrap();
    let mut c = contract();
    c.criteria[0].kind = CriterionKind::Exec { command: "sh holdout/check.sh".into(), timeout_secs: 30 };
    let id = create_with(&h, c).await;
    let g = wait_for(&h, &id, |g| matches!(g.state, LifecycleState::InReview | LifecycleState::Paused)).await;
    assert_eq!(g.state, LifecycleState::InReview);
    let ws = h.sup.goal(&id).unwrap().workspace.unwrap();
    assert!(!Path::new(&ws).join("holdout").exists(), "the agent never had the held-out tests");
}

fn http(port: u16, method: &str, path: &str, token: Option<&str>, body: &str) -> (u16, String) {
    use std::io::{Read, Write};
    let mut s = std::net::TcpStream::connect(("127.0.0.1", port)).unwrap();
    let auth = token.map(|t| format!("Authorization: Bearer {t}\r\n")).unwrap_or_default();
    write!(
        s,
        "{method} {path} HTTP/1.1\r\nHost: x\r\n{auth}Content-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{body}",
        body.len()
    )
    .unwrap();
    let mut out = String::new();
    s.read_to_string(&mut out).unwrap();
    let status = out.split_whitespace().nth(1).unwrap_or("0").parse().unwrap_or(0);
    (status, out.split("\r\n\r\n").nth(1).unwrap_or_default().to_string())
}

/// The phone page: off by default; when on, every API request needs the
/// pairing token, and a question can be answered from it.
#[tokio::test(flavor = "multi_thread")]
async fn the_phone_page_answers_with_the_pairing_token_only() {
    let h = harness("ask").await;
    assert!(!h.sup.remote_info().enabled);
    let port = std::net::TcpListener::bind("127.0.0.1:0").unwrap().local_addr().unwrap().port();
    h.sup.save_settings(Settings { remote_enabled: true, remote_port: port, ..h.sup.settings() }).unwrap();
    let info = h.sup.remote_info();
    assert!(info.enabled && info.qr_svg.contains("<svg"));
    let token = h.sup.settings().remote_token;
    assert!(token.len() >= 64);

    let id = create(&h).await;
    let q = wait_inbox(&h, &id, InboxKind::Question).await;
    let p = port;
    let (status, _) = tokio::task::spawn_blocking(move || http(p, "GET", "/api/state", None, "")).await.unwrap();
    assert_eq!(status, 401, "no token, no data");
    let (status, _) =
        tokio::task::spawn_blocking(move || http(p, "GET", "/api/state", Some("wrong"), "")).await.unwrap();
    assert_eq!(status, 401);
    let t = token.clone();
    let (status, body) = tokio::task::spawn_blocking(move || http(p, "GET", "/api/state", Some(&t), "")).await.unwrap();
    assert_eq!(status, 200);
    assert!(body.contains(&q.id));
    let t = token.clone();
    let answer = format!(r#"{{"inbox_id":"{}","response":"b"}}"#, q.id);
    let (status, body) =
        tokio::task::spawn_blocking(move || http(p, "POST", "/api/answer", Some(&t), &answer)).await.unwrap();
    assert_eq!(status, 200, "{body}");
    let g = wait_for(&h, &id, |g| matches!(g.state, LifecycleState::InReview | LifecycleState::Paused)).await;
    assert_eq!(g.state, LifecycleState::InReview);

    h.sup.save_settings(Settings { remote_enabled: false, ..h.sup.settings() }).unwrap();
    assert!(std::net::TcpStream::connect(("127.0.0.1", port)).is_err() || !h.sup.remote_info().enabled);
}

/// A `look` criterion: the verifier starts the app, waits for its URL and
/// takes a screenshot before (base) and after (the agent's snapshot), for
/// the human to judge. Needs a Chromium-based browser and python3.
#[tokio::test(flavor = "multi_thread")]
async fn look_criteria_get_before_and_after_screenshots() {
    if tower_supervisor_test_support_browser().is_none() {
        eprintln!("skipping: no Chromium-based browser");
        return;
    }
    let h = harness("pass").await;
    let port = std::net::TcpListener::bind("127.0.0.1:0").unwrap().local_addr().unwrap().port();
    let mut c = contract();
    c.criteria.push(Criterion {
        id: "C2".into(),
        title: "done.txt is served".into(),
        kind: CriterionKind::Look {
            start: format!("python3 -m http.server {port} --bind 127.0.0.1"),
            url: format!("http://localhost:{port}/done.txt"),
            timeout_secs: 8,
        },
    });
    let id = create_with(&h, c).await;
    wait_for(&h, &id, |g| matches!(g.state, LifecycleState::InReview | LifecycleState::Paused)).await;
    let d = h.sup.goal(&id).unwrap();
    let look = d.criteria[1].look.clone().expect("a look");
    let after = look.pin.clone().expect("a screenshot of the agent's snapshot");
    assert!(std::fs::metadata(&after).unwrap().len() > 1000);
    assert!(h.sup.look_image(&after).unwrap().starts_with("data:image/png;base64,"));
    assert!(look.base.is_none() && look.base_error.is_some(), "done.txt does not exist on the base: {look:?}");
    assert!(h.sup.look_image("/etc/hosts").is_none(), "only screenshots can be read");
}

fn tower_supervisor_test_support_browser() -> Option<&'static str> {
    [
        "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
        "/Applications/Chromium.app/Contents/MacOS/Chromium",
    ]
    .into_iter()
    .find(|b| Path::new(b).is_file())
}

/// The diagnostics archive for bug reports has no pairing token or secrets.
#[tokio::test(flavor = "multi_thread")]
async fn diagnostics_leave_secrets_out() {
    let h = harness("pass").await;
    h.sup.save_settings(Settings { remote_enabled: true, remote_port: 0, ..h.sup.settings() }).ok();
    let token = h.sup.settings().remote_token;
    let zip = h.sup.export_diagnostics().unwrap();
    let out = Command::new("/usr/bin/unzip").arg("-p").arg(&zip).output().unwrap();
    let text = String::from_utf8_lossy(&out.stdout);
    assert!(text.contains("\"tower\""), "the archive has content");
    assert!(token.is_empty() || !text.contains(&token), "no pairing token");
}
