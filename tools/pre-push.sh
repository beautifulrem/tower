#!/bin/sh
# The checks CI fails on most often, run before a push (a few seconds when
# nothing changed). Install once:  ln -sf ../../tools/pre-push.sh .git/hooks/pre-push
set -e
cd "$(git rev-parse --show-toplevel)"
# Git sets these for hooks; the tests run git in repositories of their own.
unset GIT_DIR GIT_WORK_TREE GIT_INDEX_FILE GIT_COMMON_DIR GIT_PREFIX GIT_OBJECT_DIRECTORY GIT_QUARANTINE_PATH
echo "pre-push: rustfmt, clippy, types, unit, flow and end-to-end tests"
cargo fmt --all --check
cargo clippy --workspace --all-targets --quiet -- -D warnings
pnpm --silent --dir apps/desktop check
pnpm --silent --dir apps/desktop test >/dev/null
cargo test --workspace --quiet >/dev/null
git diff --quiet -- apps/desktop/src/gen || { echo "pre-push: apps/desktop/src/gen changed when the tests regenerated it; commit it"; exit 1; }
node --test extensions/tower-goal/policy.test.ts extensions/tower-goal/sandboxfs.test.ts >/dev/null
# The interface end to end (WebKit), which no unit test replaces.
if [ -z "$SKIP_E2E" ]; then
  # A port of its own: never a preview server some other checkout left running.
  E2E_PORT=$((20000 + $$ % 20000)) tools/e2e.sh >/tmp/tower-pre-push-e2e.log 2>&1 || { tail -30 /tmp/tower-pre-push-e2e.log; exit 1; }
fi
echo "pre-push: ok"
