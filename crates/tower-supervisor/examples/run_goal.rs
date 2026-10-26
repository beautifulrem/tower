//! Runs one goal headlessly against your real Pi and prints what happens.
//! Questions and approvals are answered with their first option.
//!
//! ```sh
//! TOWER_HOME=/tmp/tower-live cargo run -p tower-supervisor --example run_goal -- \
//!   <repo> "<intent>" "<criterion command>" [model] [extension...]
//! ```

use std::path::PathBuf;
use std::sync::Arc;
use std::time::{Duration, Instant};

use tower_core::contract::{Contract, Criterion, CriterionKind};
use tower_core::view::{InboxKind, Settings};
use tower_core::{EventKind, LifecycleState};
use tower_supervisor::{Config, NewGoalInput, NullSink, Paths, Supervisor};

#[tokio::main]
async fn main() {
    let args: Vec<String> = std::env::args().skip(1).collect();
    let [repo, intent, command, rest @ ..] = args.as_slice() else {
        eprintln!("usage: run_goal <repo> <intent> <criterion command> [model] [extension...]");
        std::process::exit(2);
    };
    let model = rest.first().cloned().unwrap_or_default();
    let extensions: Vec<String> = rest.iter().skip(1).cloned().collect();

    let root = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../..");
    let sup = Supervisor::start(
        Config {
            paths: Paths::new(Paths::default_root()),
            extension_source: root.join("extensions/tower-goal"),
            env: None,
        },
        Arc::new(NullSink),
    )
    .await
    .expect("start");
    let env = sup.environment();
    println!("pi {} at {}", env.pi_version.unwrap_or_default(), env.pi_path.unwrap_or_default());
    sup.save_settings(Settings { extra_extensions: extensions, ..sup.settings() }).expect("settings");

    let project = match sup.projects().unwrap().into_iter().find(|p| p.root.ends_with(repo.trim_end_matches('/'))) {
        Some(p) => p,
        None => sup.add_project(repo).await.expect("add project"),
    };
    let mut contract = Contract::quick(intent.as_str(), None);
    contract.model = model;
    contract.criteria = vec![Criterion {
        id: "C1".into(),
        title: "验收命令通过".into(),
        kind: CriterionKind::Exec { command: command.clone(), timeout_secs: 300 },
    }];
    let goal = sup
        .create_goal(NewGoalInput {
            project_id: project.id,
            title: intent.chars().take(40).collect(),
            contract,
            ratify: true,
        })
        .await
        .expect("create");
    println!("goal {} started", goal.id);

    let started = Instant::now();
    let mut printed = 0usize;
    loop {
        tokio::time::sleep(Duration::from_millis(500)).await;
        let mut trace = sup.trace(&goal.id, None, 500).unwrap();
        trace.reverse();
        for e in trace.iter().skip(printed) {
            let line = match &e.event {
                EventKind::ToolStarted { tool, summary, .. } => format!("  → {tool} {summary}"),
                EventKind::ToolEnded { is_error: true, summary, .. } => format!("    ✕ {summary}"),
                EventKind::Claim { claim, text, .. } => format!("  Agent 称（{claim:?}）{text}"),
                EventKind::StateChanged { from, to, note, .. } => format!("■ {from:?} → {to:?} {note}"),
                EventKind::CriterionResult { criterion, passed, exit_code, .. } => {
                    format!("⚙ 验证器 {criterion} {} (exit {exit_code:?})", if *passed { "通过" } else { "失败" })
                }
                EventKind::EngineError { message } => format!("! {message}"),
                EventKind::CostUpdated { total_usd } => format!("  $ {total_usd:.4}"),
                _ => continue,
            };
            println!("{line}");
        }
        printed = trace.len();

        for item in sup.inbox().unwrap() {
            if item.goal_id == goal.id && matches!(item.kind, InboxKind::Question | InboxKind::Approval) {
                let answer = item.options.first().cloned().unwrap_or_else(|| "按你的判断继续".into());
                println!("? {} — 回答：{answer}", item.title);
                let _ = sup.answer(&item.id, &answer).await;
            }
        }
        let g = sup.goals().unwrap().into_iter().find(|g| g.id == goal.id).unwrap();
        if matches!(g.state, LifecycleState::InReview | LifecycleState::Paused | LifecycleState::Abandoned) {
            println!(
                "\n结果：{:?} {:?} · 已验证 {}/{} · 返工 {} · ${:.4} · {:.0}s",
                g.state,
                g.pause_reason,
                g.progress.verified,
                g.progress.machine,
                g.rework_cycles,
                g.cost_usd,
                started.elapsed().as_secs_f64()
            );
            let d = sup.goal(&goal.id).unwrap();
            if let Some(s) = d.submit_summary {
                println!("Agent 称（提交说明）：{s}");
            }
            if let Some(ws) = d.workspace {
                println!("工作区：{ws}");
            }
            break;
        }
        if started.elapsed() > Duration::from_secs(900) {
            println!("超时");
            break;
        }
    }
    sup.shutdown().await;
}
