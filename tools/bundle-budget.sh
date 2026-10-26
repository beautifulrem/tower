#!/bin/sh
# Fails when the interface's JavaScript grows past its budgets (gzip bytes):
#   start-up  what index.html loads (the entry and its preloaded imports), plus
#             one interface language: the dictionaries are chunks of their own
#             and the first paint needs exactly one, so the larger one counts
#   on demand what loads on first use (review, settings, contract editor, the
#             palette and sheets, native menus) and the other language
#   worker    syntax highlighting (Shiki grammars), loaded in the background
# Run after `pnpm --dir apps/desktop build`.
set -e
start_budget="${1:-73728}"
lazy_budget="${2:-65536}"
worker_budget="${3:-262144}"
dist="$(cd "$(dirname "$0")/.." && pwd)/apps/desktop/dist"
gz() { gzip -9c "$1" | wc -c | tr -d ' '; }
startup_files=$(grep -o '"/assets/[^"]*\.js"' "$dist/index.html" | tr -d '"' | sort -u)
start=0; lazy=0; worker=0; locale_max=0; locale_sum=0
for f in "$dist"/assets/*.js; do
  name="/assets/$(basename "$f")"
  n=$(gz "$f")
  case "$name" in
    *worker*) worker=$((worker + n)) ;;
    /assets/en-*.js|/assets/zh-CN-*.js)
      locale_sum=$((locale_sum + n))
      [ "$n" -gt "$locale_max" ] && locale_max=$n ;;
    *) if echo "$startup_files" | grep -qx "$name"; then start=$((start + n)); else lazy=$((lazy + n)); fi ;;
  esac
done
start=$((start + locale_max)); lazy=$((lazy + locale_sum - locale_max))
echo "start-up JavaScript: $start bytes gzipped (budget $start_budget; one language, $locale_max of it)"
echo "on-demand views:     $lazy bytes gzipped (budget $lazy_budget)"
echo "highlighting worker: $worker bytes gzipped (budget $worker_budget)"
[ "$start" -le "$start_budget" ] && [ "$lazy" -le "$lazy_budget" ] && [ "$worker" -le "$worker_budget" ]
