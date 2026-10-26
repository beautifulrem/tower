#!/bin/sh
# Creates a small Node repository with one failing test, for trying Tower
# with the demo engine. Usage: make_demo_repo.sh [dir]
set -e
dir="${1:-$HOME/tower-demo-shop}"
mkdir -p "$dir/src" "$dir/test"
cd "$dir"
cat > package.json <<'JSON'
{
  "name": "demo-shop",
  "private": true,
  "type": "commonjs",
  "scripts": { "test": "node --test" }
}
JSON
cat > src/cart.js <<'JS'
function total(items, discount = 0) {
  const gross = items.reduce((sum, item) => sum + item.price + item.qty, 0);
  return Math.max(0, gross - discount);
}

module.exports = { total };
JS
cat > test/cart.test.js <<'JS'
const test = require("node:test");
const assert = require("node:assert/strict");
const { total } = require("../src/cart");

test("total multiplies price by quantity", () => {
  assert.equal(total([{ price: 5, qty: 3 }, { price: 2, qty: 1 }]), 17);
});

test("discount never makes the total negative", () => {
  assert.equal(total([{ price: 1, qty: 1 }], 5), 0);
});
JS
printf 'node_modules/\n' > .gitignore
git init -q -b main
git add .
git -c user.name=Demo -c user.email=demo@example.com commit -qm "demo shop"
echo "$dir"
