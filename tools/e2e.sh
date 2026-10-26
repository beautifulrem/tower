#!/bin/sh
# Runs the interface's end-to-end tests in WebKit (apps/desktop/e2e) against
# views dumped from a real supervisor running the demo goals.
set -e
root="$(cd "$(dirname "$0")/.." && pwd)"
work="${TMPDIR:-/tmp}/tower-e2e"
rm -rf "$work"
mkdir -p "$work"
"$root/tools/demo-engine/make_demo_repo.sh" "$work/shop" >/dev/null
cd "$root"
PI_DEMO_DELAY=0.05 TOWER_LANG=en TOWER_HOME="$work/home" cargo run -q -p tower-supervisor --example seed_demo -- "$work/shop" >/dev/null
TOWER_HOME="$work/home" cargo run -q -p tower-supervisor --example dump_views -- "$work/fixtures"
cd apps/desktop
NO_PROXY=127.0.0.1,localhost no_proxy=127.0.0.1,localhost E2E_FIXTURES="$work/fixtures" ./node_modules/.bin/playwright test "$@"
