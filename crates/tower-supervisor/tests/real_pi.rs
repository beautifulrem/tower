//! Tower against the real Pi, with a scripted OpenAI-compatible model.
//!
//! Exercises what the scripted-engine tests cannot: Pi's own RPC events, the
//! tower-goal extension's tools and dialogs, the sandboxed bash (writes outside
//! the workspace and credential reads are refused) and credential scrubbing.
//! Skipped when `pi` is not installed.

use std::io::{BufRead, BufReader};
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};
use std::sync::Arc;
use std::time::Duration;

use tower_core::EventKind;
use tower_core::LifecycleState;
use tower_core::contract::{Contract, Criterion, CriterionKind};
use tower_core::view::{InboxKind, Settings};
use tower_supervisor::shell_env::ShellEnv;
use tower_supervisor::{Config, NewGoalInput, NullSink, Paths, Supervisor};

fn git(dir: &Path, args: &[&str]) {
    let ok = Command::new("git").args(args).current_dir(dir).status().unwrap().success();
    assert!(ok, "git {args:?}");
}

fn which(program: &str) -> Option<PathBuf> {
    std::env::var("PATH").ok()?.split(':').map(|d| Path::new(d).join(program)).find(|p| p.is_file())
}

struct Server(std::process::Child);

impl Drop for Server {
    fn drop(&mut self) {
        let _ = self.0.kill();
    }
}

#[tokio::test(flavor = "multi_thread")]
async fn a_goal_runs_through_the_real_pi() {
    let Some(pi) = which("pi") else {
        eprintln!("skipping: pi is not installed");
        return;
    };

    // The scripted model.
    let mut child = Command::new(PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("tests/fixtures/mock_openai.py"))
        .stdout(Stdio::piped())
        .spawn()
        .unwrap();
    let mut port = String::new();
    BufReader::new(child.stdout.take().unwrap()).read_line(&mut port).unwrap();
    let _server = Server(child);
    let port = port.trim();

    let tmp = tempfile::tempdir_in("/tmp").unwrap();
    let root = std::fs::canonicalize(tmp.path()).unwrap();
    let home = root.join("home");
    std::fs::create_dir_all(home.join(".ssh")).unwrap();
    std::fs::write(home.join(".ssh/id_test"), "SECRET-KEY-MATERIAL").unwrap();
    let agent_dir = root.join("pi-agent");
    std::fs::create_dir_all(&agent_dir).unwrap();
    std::fs::write(
        agent_dir.join("models.json"),
        format!(
            r#"{{"providers":{{"mock":{{"baseUrl":"http://127.0.0.1:{port}/v1","api":"openai-completions","apiKey":"mock","models":[{{"id":"scripted"}}]}}}}}}"#
        ),
    )
    .unwrap();

    let repo = root.join("repo");
    std::fs::create_dir_all(&repo).unwrap();
    git(&repo, &["init", "--quiet", "--initial-branch=main"]);
    git(&repo, &["config", "user.name", "Ada"]);
    git(&repo, &["config", "user.email", "ada@example.com"]);
    std::fs::write(repo.join("README.md"), "hi\n").unwrap();
    git(&repo, &["add", "."]);
    git(&repo, &["commit", "--quiet", "-m", "init"]);

    let env = ShellEnv::from_pairs([
        ("PATH".to_string(), std::env::var("PATH").unwrap()),
        ("HOME".to_string(), home.display().to_string()),
        ("PI_CODING_AGENT_DIR".to_string(), agent_dir.display().to_string()),
        ("DEMO_API_KEY".to_string(), "must-not-reach-the-agent".to_string()),
    ]);
    let sup = Supervisor::start(
        Config {
            paths: Paths::new(root.join("tower")),
            extension_source: PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../../extensions/tower-goal"),
            env: Some(env),
        },
        Arc::new(NullSink),
    )
    .await
    .unwrap();
    sup.save_settings(Settings { pi_path: pi.display().to_string(), language: "en".into(), ..Settings::default() })
        .unwrap();
    let project = sup.add_project(repo.to_str().unwrap()).await.unwrap();

    let mut contract = Contract::quick("按回答写入 result.txt", None, tower_core::Lang::En);
    contract.model = "mock/scripted".into();
    contract.criteria = vec![Criterion {
        id: "C1".into(),
        title: "result.txt 写的是 b".into(),
        kind: CriterionKind::Exec { command: "grep -qx b result.txt".into(), timeout_secs: 30 },
    }];
    let id = sup
        .create_goal(NewGoalInput { project_id: project.id, title: "真实 Pi".into(), contract, ratify: true })
        .await
        .unwrap()
        .id;

    // A one-way door needs approval; the human declines it.
    let mut approval = None;
    for _ in 0..300 {
        approval = sup.inbox().unwrap().into_iter().find(|i| i.kind == InboxKind::Approval);
        if approval.is_some() {
            break;
        }
        tokio::time::sleep(Duration::from_millis(100)).await;
    }
    let approval = approval.unwrap_or_else(|| panic!("no approval; trace: {:#?}", sup.trace(&id, None, 500).unwrap()));
    assert!(approval.body.contains("git push origin main"), "{approval:?}");
    // The extension wrote the card in the settings language.
    assert_eq!(approval.title, "Approval needed: push to a remote (one-way door)");
    assert_eq!(approval.options, ["Allow", "Deny"]);
    // Declined with the Chinese label: it still reaches the extension as "Deny".
    sup.answer(&approval.id, "拒绝").await.unwrap();

    // The question arrives through the extension's dialog.
    let mut question = None;
    for _ in 0..300 {
        question = sup.inbox().unwrap().into_iter().find(|i| i.kind == InboxKind::Question);
        if question.is_some() {
            break;
        }
        tokio::time::sleep(Duration::from_millis(100)).await;
    }
    let trace = || sup.trace(&id, None, 500).unwrap();
    let question = question.unwrap_or_else(|| panic!("no question; trace: {:#?}", trace()));
    assert_eq!(question.title, "写入哪个字母？");
    assert_eq!(question.options, ["a", "b"]);
    sup.answer(&question.id, "b").await.unwrap();

    let mut state = LifecycleState::Running;
    for _ in 0..300 {
        state = sup.goals().unwrap().into_iter().find(|g| g.id == id).unwrap().state;
        if matches!(state, LifecycleState::InReview | LifecycleState::Paused) {
            break;
        }
        tokio::time::sleep(Duration::from_millis(100)).await;
    }
    assert_eq!(state, LifecycleState::InReview, "trace: {:#?}", trace());

    let entries = trace();
    if std::env::var_os("TOWER_TEST_VERBOSE").is_some() {
        for e in entries.iter().rev() {
            if let EventKind::ToolEnded { tool, summary, is_error, .. } = &e.event {
                eprintln!("{tool:>9} {} {summary}", if *is_error { "✕" } else { "·" });
            }
        }
    }
    let tool_output = |needle: &str| {
        entries.iter().any(|e| matches!(&e.event, EventKind::ToolEnded { summary, .. } if summary.contains(needle)))
    };
    assert!(tool_output("hello"), "bash runs in the workspace");
    assert!(
        entries.iter().any(|e| matches!(&e.event, EventKind::ToolEnded { tool, is_error: true, summary, .. } if tool == "bash" && summary.contains("declined"))),
        "the declined push was blocked"
    );
    assert!(tool_output("WRITE_DENIED") || tool_output("Operation not permitted"), "writes outside are refused");
    assert!(!root.join("tower/work/escape.txt").exists());
    assert!(tool_output("Operation not permitted") && tool_output("id_test"), "credential reads are refused");
    assert!(
        !entries
            .iter()
            .any(|e| matches!(&e.event, EventKind::ToolEnded { summary, .. } if summary.contains("SECRET-KEY"))),
        "credentials are unreadable"
    );
    assert!(
        entries.iter().any(|e| matches!(&e.event, EventKind::ToolEnded { tool, summary, .. } if tool == "bash" && summary.trim() == "0")),
        "no *_API_KEY reaches the agent's shell"
    );
    let detail = sup.goal(&id).unwrap();
    assert!(detail.claims.iter().any(|c| c.text == "缺少 result.txt"));
    assert!(detail.criteria[0].verified.as_ref().unwrap().passed);
    sup.shutdown().await;
}
