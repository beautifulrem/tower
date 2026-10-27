//! Isolation flows on macOS: what the agent's processes may reach on this
//! machine, that they do not outlive their run, and that `look` evidence
//! comes only from the app the verification started. Each needs the OS
//! sandbox and passes trivially without it (other systems).

use std::net::TcpListener;
use std::path::{Path, PathBuf};
use std::process::Command;
use std::sync::{Arc, Mutex};
use std::time::Duration;

use tower_core::contract::{Contract, Criterion, CriterionKind};
use tower_core::view::{GoalSummary, InboxKind, Settings};
use tower_core::{Lang, LifecycleState};
use tower_supervisor::shell_env::ShellEnv;
use tower_supervisor::{Config, NewGoalInput, Paths, Supervisor, UiSink, UiUpdate};

#[derive(Default)]
struct Collect(Mutex<Vec<UiUpdate>>);

impl UiSink for Collect {
    fn emit(&self, u: UiUpdate) {
        self.0.lock().unwrap().push(u);
    }
}

fn git(dir: &Path, args: &[&str]) {
    let out = Command::new("git").args(args).current_dir(dir).output().unwrap();
    assert!(out.status.success(), "git {args:?}: {}", String::from_utf8_lossy(&out.stderr));
}

struct Harness {
    _tmp: tempfile::TempDir,
    root: PathBuf,
    repo: PathBuf,
    sup: Supervisor,
}

async fn harness(scenario: &str) -> Harness {
    harness_with_home(scenario, None).await
}

/// With `home`, the agent and the verifier see that home (your real one,
/// for toolchains such as rustup that live there).
async fn harness_with_home(scenario: &str, real_home: Option<PathBuf>) -> Harness {
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
    let home = real_home.unwrap_or_else(|| root.join("home"));
    std::fs::create_dir_all(&home).unwrap();
    let env = ShellEnv::from_pairs([
        ("PATH".to_string(), std::env::var("PATH").unwrap()),
        ("HOME".to_string(), home.display().to_string()),
        ("PI_FAKE_SCENARIO".to_string(), scenario.to_string()),
    ]);
    let ext = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../../extensions/tower-goal");
    let sup = Supervisor::start(
        Config { paths: Paths::new(root.join("tower")), extension_source: ext, env: Some(env), demo_engine: None },
        Arc::new(Collect::default()),
    )
    .await
    .unwrap();
    let fake = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("tests/fixtures/fake_pi.py");
    sup.save_settings(Settings { pi_path: fake.display().to_string(), language: "en".into(), ..Settings::default() })
        .unwrap();
    Harness { _tmp: tmp, root, repo, sup }
}

fn contract() -> Contract {
    let mut c = Contract::quick("create done.txt", None, Lang::En);
    c.criteria = vec![Criterion {
        id: "C1".into(),
        title: "done.txt exists".into(),
        kind: CriterionKind::Exec { command: "test -f done.txt".into(), timeout_secs: 30 },
    }];
    c
}

async fn create(h: &Harness, contract: Contract) -> String {
    let p = h.sup.add_project(h.repo.to_str().unwrap()).await.unwrap();
    h.sup
        .create_goal(NewGoalInput { project_id: p.id, title: "isolation".into(), contract, ratify: true })
        .await
        .unwrap()
        .id
}

async fn wait_for(h: &Harness, id: &str, pred: impl Fn(&GoalSummary) -> bool) -> GoalSummary {
    for _ in 0..1200 {
        let g = h.sup.goals().unwrap().into_iter().find(|g| g.id == id).unwrap();
        if pred(&g) {
            return g;
        }
        tokio::time::sleep(Duration::from_millis(50)).await;
    }
    let trace = h.sup.trace(id, None, 50).unwrap();
    panic!("goal never reached the expected state\ntrace: {trace:#?}");
}

async fn wait_question(h: &Harness, id: &str) -> tower_core::view::InboxItem {
    for _ in 0..1200 {
        if let Some(i) = h.sup.inbox().unwrap().into_iter().find(|i| i.goal_id == id && i.kind == InboxKind::Question) {
            return i;
        }
        tokio::time::sleep(Duration::from_millis(25)).await;
    }
    panic!("no question from {id}");
}

/// A free port from the range these tests use (17000–17100), so parallel
/// suites on this machine do not collide.
fn free_port(slot: u16) -> u16 {
    (17000 + slot * 20..17100)
        .find(|p| TcpListener::bind(("127.0.0.1", *p)).is_ok() && !listening(*p))
        .unwrap_or_else(|| TcpListener::bind("127.0.0.1:0").unwrap().local_addr().unwrap().port())
}

fn listening(port: u16) -> bool {
    std::net::TcpStream::connect_timeout(&([127, 0, 0, 1], port).into(), Duration::from_millis(300)).is_ok()
}

fn sandbox() -> bool {
    tower_supervisor::sandbox::available()
}

/// Item 5: a server the agent left in the background (in its own session,
/// outside the workspace) is gone once the run has ended; a program of
/// yours working in the same workspace is not touched.
#[tokio::test(flavor = "multi_thread")]
async fn an_agents_background_listener_does_not_outlive_its_run() {
    if !sandbox() {
        return;
    }
    let port = free_port(0);
    let h = harness(&format!("listener:{port}")).await;
    let id = create(&h, contract()).await;
    let ws = h.root.join("tower/work").join(&id);
    // Yours: unsandboxed, working in the agent's workspace.
    for _ in 0..200 {
        if ws.is_dir() {
            break;
        }
        tokio::time::sleep(Duration::from_millis(25)).await;
    }
    let mut yours = Command::new("/bin/sleep").arg("120").current_dir(&ws).spawn().unwrap();
    let g = wait_for(&h, &id, |g| matches!(g.state, LifecycleState::InReview | LifecycleState::Paused)).await;
    assert_eq!(g.state, LifecycleState::InReview);
    assert!(!listening(port), "the agent's server outlived its run");
    let trace = h.sup.trace(&id, None, 200).unwrap();
    assert!(
        trace.iter().any(|e| matches!(&e.event, tower_core::EventKind::Note { text } if text.contains("left running"))),
        "the trace says what Tower stopped"
    );
    assert!(yours.try_wait().unwrap().is_none(), "your own process keeps running");
    let _ = yours.kill();
}

/// Item 5: pausing a run stops what its agent left running too.
#[tokio::test(flavor = "multi_thread")]
async fn pausing_stops_what_the_agent_left_running() {
    if !sandbox() {
        return;
    }
    let port = free_port(1);
    let h = harness(&format!("listener_ask:{port}")).await;
    let id = create(&h, contract()).await;
    wait_question(&h, &id).await;
    assert!(listening(port), "the agent's server runs while the agent does");
    h.sup.pause(&id).await.unwrap();
    assert!(!listening(port), "and stops with its run");
}

/// Item 13: with the network off, the agent's commands reach a port the
/// contract declares and a server the agent itself left listening, but not
/// a service someone else started after the agent's sandbox was set up.
#[tokio::test(flavor = "multi_thread")]
async fn loopback_reaches_only_the_agents_own_and_declared_ports() {
    if !sandbox() {
        return;
    }
    let declared = TcpListener::bind("127.0.0.1:0").unwrap();
    let declared_port = declared.local_addr().unwrap().port();
    let (foreign_port, own_port) = {
        let a = TcpListener::bind("127.0.0.1:0").unwrap();
        let b = TcpListener::bind("127.0.0.1:0").unwrap();
        (a.local_addr().unwrap().port(), b.local_addr().unwrap().port())
    };
    let h = harness(&format!("loopback:{foreign_port}:{declared_port}:{own_port}")).await;
    let mut c = contract();
    c.ports = vec![declared_port];
    let id = create(&h, c).await;
    let q = wait_question(&h, &id).await;
    // Someone else's service, started after the agent's sandbox was set up.
    let _foreign = TcpListener::bind(("127.0.0.1", foreign_port)).unwrap();
    // Tower follows the agent's own listeners every two seconds.
    tokio::time::sleep(Duration::from_millis(4500)).await;
    h.sup.answer(&q.id, "a").await.unwrap();
    wait_for(&h, &id, |g| matches!(g.state, LifecycleState::InReview | LifecycleState::Paused)).await;
    let seen = std::fs::read_to_string(h.root.join("tower/work").join(&id).join("loopback.txt")).unwrap();
    assert_eq!(seen.trim(), "foreign=closed declared=open own=open");
    drop(declared);
}

/// Item 4: a `look` whose port another program already holds is not
/// photographed; the goal pauses for the environment and says so.
#[tokio::test(flavor = "multi_thread")]
async fn a_look_port_held_by_another_program_pauses_for_the_environment() {
    if !sandbox() {
        return;
    }
    let other = TcpListener::bind("127.0.0.1:0").unwrap();
    let port = other.local_addr().unwrap().port();
    let h = harness("pass").await;
    let mut c = contract();
    c.criteria.push(Criterion {
        id: "C2".into(),
        title: "the page".into(),
        kind: CriterionKind::Look {
            start: format!("python3 -m http.server {port} --bind 127.0.0.1"),
            url: format!("http://localhost:{port}/"),
            timeout_secs: 5,
            steps: None,
        },
    });
    let id = create(&h, c).await;
    wait_for(&h, &id, |g| g.state == LifecycleState::Paused).await;
    let item = h.sup.inbox().unwrap().into_iter().find(|i| i.goal_id == id && i.kind == InboxKind::Paused).unwrap();
    assert!(item.body.contains(&format!("Something else is already listening on port {port}")), "{}", item.body);
    let d = h.sup.goal(&id).unwrap();
    if let Some(look) = d.criteria[1].look.clone() {
        assert!(look.base.is_none() && look.pin.is_none(), "no picture of another program: {look:?}");
    }
    drop(other);
}

/// Item 8: a Rust project with no toolchain file runs in the verification
/// sandbox with the default toolchain your terminal uses (rustup's
/// settings, wherever your rustup keeps them).
#[tokio::test(flavor = "multi_thread")]
async fn rustups_default_toolchain_resolves_in_the_sandbox() {
    if !sandbox() || Command::new("rustup").arg("show").arg("active-toolchain").output().is_err() {
        return;
    }
    let tmp = tempfile::tempdir().unwrap();
    let dir = std::fs::canonicalize(tmp.path()).unwrap();
    let outside = Command::new("rustup").args(["show", "active-toolchain"]).current_dir(&dir).output().unwrap();
    if !outside.status.success() {
        // No default toolchain in your terminal either: nothing to compare.
        return;
    }
    // rustup keeps its toolchains (and its settings) in your real home.
    let h = harness_with_home("pass", std::env::var_os("HOME").map(PathBuf::from)).await;
    let mut c = contract();
    c.criteria[0].kind = CriterionKind::Exec {
        command: "cargo --version && rustc --version && test -f done.txt".into(),
        timeout_secs: 60,
    };
    let id = create(&h, c).await;
    let g = wait_for(&h, &id, |g| matches!(g.state, LifecycleState::InReview | LifecycleState::Paused)).await;
    let d = h.sup.goal(&id).unwrap();
    assert_eq!(g.state, LifecycleState::InReview, "{:?} / {:?}", d.criteria[0].base_error, d.criteria[0].verified);
}

/// Item 8: when the sandbox still cannot resolve a toolchain, the card
/// names the cause and a way out that needs no change to the repository,
/// in the interface's language. (A home without any rustup settings
/// stands in for a sandbox that cannot see them.)
#[tokio::test(flavor = "multi_thread")]
async fn a_toolchain_the_sandbox_cannot_resolve_is_named_on_the_card() {
    if !sandbox() || Command::new("rustup").arg("--version").output().is_err() {
        return;
    }
    let h = harness("ask").await;
    std::fs::write(h.repo.join("Cargo.toml"), "[package]\nname = \"a\"\nversion = \"0.1.0\"\nedition = \"2021\"\n")
        .unwrap();
    std::fs::create_dir_all(h.repo.join("src")).unwrap();
    std::fs::write(h.repo.join("src/lib.rs"), "").unwrap();
    git(&h.repo, &["add", "."]);
    git(&h.repo, &["commit", "--quiet", "-m", "crate"]);
    let mut c = contract();
    c.criteria[0].kind = CriterionKind::Exec { command: "cargo test --offline -q".into(), timeout_secs: 60 };
    let id = create(&h, c).await;
    wait_for(&h, &id, |g| g.state == LifecycleState::Paused).await;
    let card = || h.sup.inbox().unwrap().into_iter().find(|i| i.goal_id == id && i.kind == InboxKind::Paused).unwrap();
    let body = card().body;
    assert!(body.contains("cannot find rustup's default toolchain"), "{body}");
    assert!(body.contains("Nothing in the repository needs to change"), "{body}");
    h.sup.save_settings(Settings { language: "zh-CN".into(), ..h.sup.settings() }).unwrap();
    let body = card().body;
    assert!(body.contains("rustup 的默认工具链"), "the card follows the language: {body}");
}
