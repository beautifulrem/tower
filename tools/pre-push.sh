#!/bin/sh
# The checks CI fails on most often, run before a push (a few seconds when
# nothing changed). Install once:  ln -sf ../../tools/pre-push.sh .git/hooks/pre-push
set -e
cd "$(git rev-parse --show-toplevel)"
echo "pre-push: rustfmt, clippy, types, unit tests"
cargo fmt --all --check
cargo clippy --workspace --all-targets --quiet -- -D warnings
pnpm --silent --dir apps/desktop check
pnpm --silent --dir apps/desktop test >/dev/null
cargo test --workspace --lib --quiet >/dev/null
node --test extensions/tower-goal/policy.test.ts extensions/tower-goal/sandboxfs.test.ts >/dev/null
echo "pre-push: ok"
