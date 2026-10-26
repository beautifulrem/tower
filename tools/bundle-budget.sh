#!/bin/sh
# Fails when the interface's JavaScript grows past its budgets (gzip bytes):
#   start-up  what index.html loads (the entry and its preloaded imports)
#   on demand views loaded on first use (review, settings, contract editor)
#   worker    syntax highlighting (Shiki grammars), loaded in the background
# Run after `pnpm --dir apps/desktop build`.
set -e
start_budget="${1:-81920}"
lazy_budget="${2:-40960}"
worker_budget="${3:-262144}"
dist="$(cd "$(dirname "$0")/.." && pwd)/apps/desktop/dist"
gz() { gzip -9c "$1" | wc -c | tr -d ' '; }
startup_files=$(grep -o '"/assets/[^"]*\.js"' "$dist/index.html" | tr -d '"' | sort -u)
start=0; lazy=0; worker=0
for f in "$dist"/assets/*.js; do
  name="/assets/$(basename "$f")"
  n=$(gz "$f")
  case "$name" in
    *worker*) worker=$((worker + n)) ;;
    *) if echo "$startup_files" | grep -qx "$name"; then start=$((start + n)); else lazy=$((lazy + n)); fi ;;
  esac
done
echo "start-up JavaScript: $start bytes gzipped (budget $start_budget)"
echo "on-demand views:     $lazy bytes gzipped (budget $lazy_budget)"
echo "highlighting worker: $worker bytes gzipped (budget $worker_budget)"
[ "$start" -le "$start_budget" ] && [ "$lazy" -le "$lazy_budget" ] && [ "$worker" -le "$worker_budget" ]
