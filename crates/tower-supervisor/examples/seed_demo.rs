//! Seeds a Tower data directory with demo goals driven by the demo engine.
//!
//! ```sh
//! tools/demo-engine/make_demo_repo.sh /tmp/tower-demo/shop
//! TOWER_HOME=/tmp/tower-demo/home cargo run -p tower-supervisor --example seed_demo -- /tmp/tower-demo/shop
//! TOWER_HOME=/tmp/tower-demo/home pnpm dev
//! ```

use std::path::PathBuf;
use std::sync::Arc;
use std::time::Duration;

use tower_core::contract::{Contract, Criterion, CriterionKind};
use tower_core::view::{InboxKind, Settings};
use tower_core::{Lang, LifecycleState};
use tower_supervisor::{Config, NewGoalInput, NullSink, Paths, Supervisor};

#[tokio::main]
async fn main() {
    let repo = std::env::args().nth(1).expect("usage: seed_demo <repo>");
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
    sup.save_settings(Settings {
        pi_path: root.join("tools/demo-engine/demo_pi.py").canonicalize().unwrap().display().to_string(),
        max_concurrent: 4,
        ..Settings::default()
    })
    .unwrap();
    let project = match sup.projects().unwrap().into_iter().next() {
        Some(p) => p,
        None => sup.add_project(&repo).await.expect("add project"),
    };

    // The demo speaks the language of the data directory's settings (a new
    // one follows the system, or TOWER_LANG).
    let lang = sup.settings().lang();
    let goal = |title: &str, intent: &str, human: bool| {
        let mut c = Contract::quick(intent, Some("npm test".into()), lang);
        c.criteria[0].title = lang.pick("购物车测试全部通过", "Cart tests pass").into();
        c.criteria.push(Criterion {
            id: "C2".into(),
            title: lang.pick("总价计算的单元测试", "Unit tests for the total").into(),
            kind: CriterionKind::Exec { command: "node --test test/cart.test.js".into(), timeout_secs: 120 },
        });
        if human {
            c.criteria.push(Criterion {
                id: "C3".into(),
                title: lang.pick("在结账页手动核对一次总价", "Check one total by hand on the checkout page").into(),
                kind: CriterionKind::Human,
            });
        }
        c.scope.include = vec!["src/**".into(), "test/**".into()];
        c.scope.readonly = vec!["package.json".into()];
        NewGoalInput { project_id: project.id.clone(), title: title.into(), contract: c, ratify: true }
    };

    // Words in the intent pick the demo engine's script (ask, rework, stall).
    let goals = match lang {
        Lang::Zh => [
            ("修复购物车总价计算", "购物车总价应为单价乘以数量，修复 total()", true),
            ("折扣规则对齐产品文档", "询问折扣顺序后修复 total()，保证折扣不会让总价为负", false),
            ("清理购物车计算的边界情况", "返工演示：先给出不完整的修复，验证失败后再修好", false),
            ("调研结账慢的原因", "卡住演示：调研结账流程为什么慢", false),
        ],
        Lang::En => [
            ("Fix the cart total", "The cart total should be price times quantity; fix total()", true),
            (
                "Align discount rules with the product doc",
                "Ask about the discount order, then fix total() so a discount never makes the total negative",
                false,
            ),
            (
                "Clean up cart edge cases",
                "Rework demo: submit an incomplete fix first, then fix it after verification fails",
                false,
            ),
            ("Find out why checkout is slow", "Stall demo: investigate why the checkout flow is slow", false),
        ],
    };
    for (title, intent, human) in goals {
        let g = sup.create_goal(goal(title, intent, human)).await.expect("create");
        println!("created {} {}", g.id, g.title);
    }

    // Let the demo runs reach their resting states: done as soon as they
    // do, and up to ten minutes on a busy machine (a verification runs the
    // criteria, the canary and the perturbation; the tests check the result).
    for _ in 0..1200 {
        tokio::time::sleep(Duration::from_millis(500)).await;
        let goals = sup.goals().unwrap();
        let inbox = sup.inbox().unwrap();
        let blocked = |id: &str| inbox.iter().any(|i| i.goal_id == id && i.kind == InboxKind::Question);
        let busy = goals
            .iter()
            .filter(|g| {
                matches!(g.state, LifecycleState::Running | LifecycleState::Claimed | LifecycleState::Verifying)
            })
            .filter(|g| !blocked(&g.id))
            .count();
        if busy == 0 {
            break;
        }
    }
    for g in sup.goals().unwrap() {
        println!("{} {:?} {:?} needs_you={}", g.id, g.state, g.pause_reason, g.needs_you);
    }
    sup.shutdown().await;
}
