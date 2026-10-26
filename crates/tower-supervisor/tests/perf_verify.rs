//! What verification costs on a larger repository: 2 000 source files and
//! 200 test files (1 000 assertions), every verification step included
//! (base, snapshot, source-only re-run, canaries). Run with
//! `cargo test -p tower-supervisor --test perf_verify -- --ignored --nocapture`.

use std::path::{Path, PathBuf};
use std::process::Command;
use std::sync::Arc;
use std::time::Duration;

use tower_core::contract::{Contract, Criterion, CriterionKind};
use tower_core::view::Settings;
use tower_core::{EventKind, Lang, LifecycleState};
use tower_supervisor::shell_env::ShellEnv;
use tower_supervisor::{Config, NewGoalInput, NullSink, Paths, Supervisor};

fn git(dir: &Path, args: &[&str]) {
    let out = Command::new("git").args(args).current_dir(dir).output().unwrap();
    assert!(out.status.success(), "git {args:?}");
}

#[tokio::test(flavor = "multi_thread")]
#[ignore = "a measurement, not a check: run it on purpose"]
async fn verification_of_a_larger_repository() {
    let tmp = tempfile::tempdir().unwrap();
    let root = std::fs::canonicalize(tmp.path()).unwrap();
    let repo = root.join("repo");
    std::fs::create_dir_all(repo.join("src")).unwrap();
    std::fs::create_dir_all(repo.join("test")).unwrap();
    for i in 0..2000 {
        std::fs::write(repo.join(format!("src/m{i}.mjs")), format!("export const f{i} = (x) => x + {i}\n")).unwrap();
    }
    for i in 0..200 {
        let mut t = format!(
            "import test from 'node:test'\nimport assert from 'node:assert'\nimport {{ f{i} }} from '../src/m{i}.mjs'\n"
        );
        for k in 0..5 {
            t.push_str(&format!("test('f{i} {k}', () => assert.equal(f{i}({k}), {k} + {i}))\n"));
        }
        std::fs::write(repo.join(format!("test/m{i}.test.mjs")), t).unwrap();
    }
    git(&repo, &["init", "--quiet", "--initial-branch=main"]);
    git(&repo, &["config", "user.name", "Ada"]);
    git(&repo, &["config", "user.email", "ada@example.com"]);
    git(&repo, &["add", "."]);
    git(&repo, &["commit", "--quiet", "-m", "init"]);

    let home = root.join("home");
    std::fs::create_dir_all(&home).unwrap();
    let env = ShellEnv::from_pairs([
        ("PATH".to_string(), std::env::var("PATH").unwrap()),
        ("HOME".to_string(), home.display().to_string()),
        ("PI_FAKE_SCENARIO".to_string(), "pass".to_string()),
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
    let p = sup.add_project(repo.to_str().unwrap()).await.unwrap();
    let mut c = Contract::quick("create done.txt", None, Lang::En);
    c.criteria = vec![Criterion {
        id: "C1".into(),
        title: "done.txt exists and the tests pass".into(),
        kind: CriterionKind::Exec { command: "test -f done.txt && node --test".into(), timeout_secs: 600 },
    }];
    let g = sup
        .create_goal(NewGoalInput { project_id: p.id, title: "perf".into(), contract: c, ratify: true })
        .await
        .unwrap();
    for _ in 0..1200 {
        let s = sup.goals().unwrap().into_iter().find(|x| x.id == g.id).unwrap();
        if matches!(s.state, LifecycleState::InReview | LifecycleState::Paused) {
            break;
        }
        tokio::time::sleep(Duration::from_millis(250)).await;
    }
    let trace = sup.trace(&g.id, None, 2000).unwrap();
    let at = |pred: &dyn Fn(&EventKind) -> bool| trace.iter().find(|e| pred(&e.event)).map(|e| e.at);
    let started = at(&|e| matches!(e, EventKind::VerifyStarted { .. })).expect("verified");
    let finished = at(&|e| matches!(e, EventKind::VerifyFinished { .. })).expect("finished");
    let d = sup.goal(&g.id).unwrap();
    let secs = (finished - started) as f64 / 1000.0;
    println!(
        "verification: {secs:.1} s · state {:?} · canary {:?} · source-only {:?}",
        d.summary.state, d.criteria[0].canary, d.criteria[0].passes_with_source_only
    );
    assert_eq!(d.summary.state, LifecycleState::InReview, "{:?}", d.sentinels);
    assert!(secs < 120.0, "verification took {secs:.1} s");
}
