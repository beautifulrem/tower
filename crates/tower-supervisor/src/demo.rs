//! The in-app demo: a small repository with a failing test and one goal run
//! by the demo engine, so a new user sees the whole arc (question, claim,
//! clean verification, review) without Pi or any model credentials.

use std::path::Path;

use tower_core::contract::{Contract, Criterion, CriterionKind};
use tower_core::{Lang, tr};

use crate::{Inner, Result, invalid};

const PACKAGE_JSON: &str = r#"{
  "name": "demo-shop",
  "private": true,
  "type": "commonjs",
  "scripts": { "test": "node --test" }
}
"#;

const CART_JS: &str = "function total(items, discount = 0) {
  const gross = items.reduce((sum, item) => sum + item.price + item.qty, 0);
  return Math.max(0, gross - discount);
}

module.exports = { total };
";

const CART_TEST_JS: &str = r#"const test = require("node:test");
const assert = require("node:assert/strict");
const { total } = require("../src/cart");

test("total multiplies price by quantity", () => {
  assert.equal(total([{ price: 5, qty: 3 }, { price: 2, qty: 1 }]), 17);
});

test("discount never makes the total negative", () => {
  assert.equal(total([{ price: 1, qty: 1 }], 5), 0);
});
"#;

/// Creates the demo repository at `dir` unless it exists.
pub fn ensure_repo(inner: &Inner, dir: &Path) -> Result<()> {
    if dir.join(".git").is_dir() {
        return Ok(());
    }
    std::fs::create_dir_all(dir.join("src"))?;
    std::fs::create_dir_all(dir.join("test"))?;
    std::fs::write(dir.join("package.json"), PACKAGE_JSON)?;
    std::fs::write(dir.join("src/cart.js"), CART_JS)?;
    std::fs::write(dir.join("test/cart.test.js"), CART_TEST_JS)?;
    std::fs::write(dir.join(".gitignore"), "node_modules/\n")?;
    inner.git.init_with_commit(dir, "demo shop").map_err(|e| invalid(e.to_string()))?;
    Ok(())
}

/// The demo goal's title and contract. The intent's wording makes the demo
/// engine ask a question first (see `tools/demo-engine/demo_pi.py`).
pub fn goal(lang: Lang) -> (String, Contract) {
    let intent = tr!(
        lang,
        "询问折扣顺序后修复 total()，保证折扣不会让总价为负",
        "Ask about the discount order, then fix total() so a discount never makes the total negative"
    );
    let mut c = Contract::quick(&intent, Some("npm test".into()), lang);
    c.criteria[0].title = lang.pick("购物车测试全部通过", "Cart tests pass").into();
    c.criteria.push(Criterion {
        id: "C2".into(),
        title: lang.pick("总价计算的单元测试", "Unit tests for the total").into(),
        kind: CriterionKind::Exec { command: "node --test test/cart.test.js".into(), timeout_secs: 120 },
    });
    c.scope.include = vec!["src/**".into(), "test/**".into()];
    c.scope.readonly = vec!["package.json".into()];
    (lang.pick("演示：修复购物车总价", "Demo: fix the cart total").into(), c)
}
