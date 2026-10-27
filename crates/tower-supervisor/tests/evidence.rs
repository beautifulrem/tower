//! Flows for what a pass is evidence of: held-out tests proven per file,
//! and the canary for criteria whose base did not run. Each repository is a
//! minimal, labelled fixture.

use std::path::{Path, PathBuf};
use std::process::Command;
use std::sync::Arc;
use std::time::Duration;

use tower_core::contract::{Contract, Criterion, CriterionKind};
use tower_core::view::{CanaryState, GoalSummary, Settings};
use tower_core::{Lang, LifecycleState};
use tower_supervisor::shell_env::ShellEnv;
use tower_supervisor::{Config, NewGoalInput, NullSink, Paths, Supervisor};

fn git(dir: &Path, args: &[&str]) {
    let out = Command::new("git").args(args).current_dir(dir).output().unwrap();
    assert!(out.status.success(), "git {args:?}: {}", String::from_utf8_lossy(&out.stderr));
}

struct Harness {
    _tmp: tempfile::TempDir,
    repo: PathBuf,
    sup: Supervisor,
}

/// A repository holding `files`, committed, and a supervisor whose fake
/// engine plays `scenario`.
async fn harness(scenario: &str, files: &[(&str, &str)]) -> Harness {
    let tmp = tempfile::tempdir().unwrap();
    let root = std::fs::canonicalize(tmp.path()).unwrap();
    let repo = root.join("repo");
    std::fs::create_dir_all(&repo).unwrap();
    git(&repo, &["init", "--quiet", "--initial-branch=main"]);
    git(&repo, &["config", "user.name", "Ada"]);
    git(&repo, &["config", "user.email", "ada@example.com"]);
    std::fs::write(repo.join("README.md"), "hello\n").unwrap();
    for (path, text) in files {
        let p = repo.join(path);
        std::fs::create_dir_all(p.parent().unwrap()).unwrap();
        std::fs::write(p, text).unwrap();
    }
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
    let sup = Supervisor::start(
        Config { paths: Paths::new(root.join("tower")), extension_source: ext, env: Some(env), demo_engine: None },
        Arc::new(NullSink),
    )
    .await
    .unwrap();
    let fake = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("tests/fixtures/fake_pi.py");
    sup.save_settings(Settings { pi_path: fake.display().to_string(), language: "en".into(), ..Settings::default() })
        .unwrap();
    Harness { _tmp: tmp, repo, sup }
}

/// Git-ignored held-out files of the repository (`holdout/**`).
async fn held_out(h: &Harness, files: &[(&str, &str)]) {
    std::fs::write(h.repo.join(".gitignore"), "holdout/\n").unwrap();
    git(&h.repo, &["add", ".gitignore"]);
    git(&h.repo, &["commit", "--quiet", "-m", "ignore holdout"]);
    std::fs::create_dir_all(h.repo.join("holdout")).unwrap();
    for (path, text) in files {
        std::fs::write(h.repo.join(path), text).unwrap();
    }
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
}

async fn goal(h: &Harness, command: &str) -> String {
    let p = match h.sup.projects().unwrap().into_iter().next() {
        Some(p) => p,
        None => h.sup.add_project(h.repo.to_str().unwrap()).await.unwrap(),
    };
    let mut c = Contract::quick("fix it", None, Lang::En);
    c.criteria = vec![Criterion {
        id: "C1".into(),
        title: "the tests pass".into(),
        kind: CriterionKind::Exec { command: command.into(), timeout_secs: 60 },
    }];
    h.sup
        .create_goal(NewGoalInput { project_id: p.id, title: "fix".into(), contract: c, ratify: true })
        .await
        .unwrap()
        .id
}

async fn settled(h: &Harness, id: &str) -> GoalSummary {
    for _ in 0..2400 {
        let g = h.sup.goals().unwrap().into_iter().find(|g| g.id == id).unwrap();
        if matches!(g.state, LifecycleState::InReview | LifecycleState::Paused) {
            return g;
        }
        tokio::time::sleep(Duration::from_millis(50)).await;
    }
    panic!("goal {id} never settled: {:#?}", h.sup.trace(id, None, 40).unwrap());
}

fn node_ok() -> bool {
    let ok = Command::new("node")
        .args(["-e", "process.exit(process.getBuiltinModule ? 0 : 1)"])
        .status()
        .is_ok_and(|s| s.success());
    if !ok {
        eprintln!("skipped: needs Node 22.3 or later");
    }
    ok
}

/// R1e class: two held-out files, the criterion runs one. The result is
/// labelled with held-out tests, 1 of 2, and the other is named — for you,
/// under the result; the finding the agent could hear has counts only.
#[tokio::test(flavor = "multi_thread")]
async fn held_out_files_prove_they_ran_one_by_one() {
    let h = harness("pass", &[]).await;
    held_out(
        &h,
        &[
            ("holdout/a.sh", "grep -qx ok done.txt\n"),
            ("holdout/b.sh", "grep -qx ok done.txt\n"),
            ("holdout/c_test.go", "package c\n"),
        ],
    )
    .await;
    let id = goal(&h, "sh holdout/a.sh").await;
    let g = settled(&h, &id).await;
    let d = h.sup.goal(&id).unwrap();
    assert_eq!(g.state, LifecycleState::InReview, "medium findings do not hold the goal: {:?}", d.sentinels);
    let v = d.criteria[0].verified.clone().unwrap();
    let proof = v.held_out_proof.clone().expect("run with the held-out tests present");
    assert!(v.passed && v.held_out, "one file proved it ran: {v:?}");
    assert_eq!(proof.ran, ["holdout/a.sh"]);
    assert_eq!(proof.not_ran, ["holdout/b.sh"]);
    assert_eq!(proof.unprovable, ["holdout/c_test.go"]);
    let partly = d.sentinels.iter().find(|s| s.sentinel == "held_out_partly_run").expect("reported");
    assert!(partly.detail.contains("1 of 2"), "{}", partly.detail);
    assert!(d.sentinels.iter().any(|s| s.sentinel == "held_out_unproven" && s.severity == 1));
    assert!(d.sentinels.iter().all(|s| !s.detail.contains("holdout/")), "no names the agent could hear");
}

/// The proof lines work under the verification sandbox in each language a
/// held-out test is usually written in here: a shell script, a Node test
/// file and a Python script, each proving itself.
#[tokio::test(flavor = "multi_thread")]
async fn held_out_proofs_come_back_from_inside_the_sandbox() {
    if !node_ok() {
        return;
    }
    let h = harness("pass", &[]).await;
    held_out(
        &h,
        &[
            ("holdout/a.sh", "grep -qx ok done.txt\n"),
            ("holdout/b.test.mjs", "import test from 'node:test'\ntest('b', () => {})\n"),
            ("holdout/c_check.py", "assert open('done.txt').read() == 'ok\\n'\n"),
        ],
    )
    .await;
    let id = goal(&h, "sh holdout/a.sh && node --test holdout/b.test.mjs && python3 holdout/c_check.py").await;
    settled(&h, &id).await;
    let d = h.sup.goal(&id).unwrap();
    let v = d.criteria[0].verified.clone().unwrap();
    let proof = v.held_out_proof.clone().unwrap();
    assert!(v.passed, "{}", v.output_tail);
    assert_eq!(proof.ran, ["holdout/a.sh", "holdout/b.test.mjs", "holdout/c_check.py"], "{proof:?}");
    assert!(d.sentinels.iter().all(|s| !s.sentinel.starts_with("held_out")), "{:?}", d.sentinels);
}

/// R1c class: held-out tests no criterion runs. The result is not labelled
/// as one with held-out tests, and says which did not run.
#[tokio::test(flavor = "multi_thread")]
async fn held_out_tests_that_never_ran_do_not_label_the_result() {
    let h = harness("pass", &[]).await;
    held_out(&h, &[("holdout/more.sh", "grep -qx ok done.txt\n")]).await;
    let id = goal(&h, "test -f done.txt").await;
    settled(&h, &id).await;
    let d = h.sup.goal(&id).unwrap();
    let v = d.criteria[0].verified.clone().unwrap();
    assert!(!v.held_out, "no proof, no label: {v:?}");
    let proof = v.held_out_proof.clone().expect("the output was still withheld from the agent");
    assert!(proof.ran.is_empty());
    assert_eq!(proof.not_ran, ["holdout/more.sh"]);
    assert!(v.withheld());
    assert!(d.sentinels.iter().any(|s| s.sentinel == "held_out_not_run"), "{:?}", d.sentinels);
}

/// A criterion whose base did not run (no tests ran there) still gets its
/// must-fail canary, and its row says what it showed.
#[tokio::test(flavor = "multi_thread")]
async fn a_criterion_whose_base_did_not_run_keeps_its_canary() {
    if !node_ok() {
        return;
    }
    let h = harness(
        "pass",
        &[(
            "test/done.test.mjs",
            "import test from 'node:test'\nimport assert from 'node:assert'\nimport { readFileSync } from 'node:fs'\n\
             test('done', () => assert.equal(readFileSync('done.txt', 'utf8'), 'ok\\n'))\n",
        )],
    )
    .await;
    let id = goal(&h, "test -f done.txt && node --test").await;
    settled(&h, &id).await;
    let d = h.sup.goal(&id).unwrap();
    assert!(d.criteria[0].base_error.is_some(), "the base did not run: {:?}", d.criteria[0]);
    assert_eq!(d.criteria[0].canary, Some(CanaryState::Intact), "{:?}", d.sentinels);
}
