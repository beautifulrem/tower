#!/bin/sh
# Runs the interface's end-to-end tests in WebKit (apps/desktop/e2e) against
# views dumped from a real supervisor running the demo goals.
set -e
root="$(cd "$(dirname "$0")/.." && pwd)"
work="${TMPDIR:-/tmp}/tower-e2e"
# A verification cut short leaves its guard transcripts append-only.
[ -d "$work" ] && chflags -R nouappnd "$work" 2>/dev/null || true
rm -rf "$work"
mkdir -p "$work"
cd "$root"
# The demo, seeded once per interface language: the supervisor words what it says (pauses, findings, notes) in the
# language it runs in, so the Chinese tests read a Chinese supervisor's views, not English ones under a Chinese UI.
dump() {
  # The repository keeps its name in both: a project is named after its folder.
  mkdir -p "$work/$1"
  "$root/tools/demo-engine/make_demo_repo.sh" "$work/$1/shop" >/dev/null
  PI_DEMO_DELAY=0.05 TOWER_LANG="$1" TOWER_HOME="$work/$1/home" cargo run -q -p tower-supervisor --example seed_demo -- "$work/$1/shop" >/dev/null
  TOWER_LANG="$1" TOWER_HOME="$work/$1/home" cargo run -q -p tower-supervisor --example dump_views -- "$2"
}
dump en "$work/fixtures"
dump zh-CN "$work/fixtures-zh"
cd apps/desktop
NO_PROXY=127.0.0.1,localhost no_proxy=127.0.0.1,localhost E2E_FIXTURES="$work/fixtures" E2E_FIXTURES_ZH="$work/fixtures-zh" ./node_modules/.bin/playwright test "$@"
