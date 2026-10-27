#!/bin/sh
# Fails when the interface's JavaScript grows past its budgets (gzip bytes):
#   start-up  what index.html loads (the entry and its preloaded imports), plus
#             the first half of one interface language: the dictionaries are
#             chunks of their own and the first paint needs exactly one, so
#             the larger one counts
#   on demand what loads after the first frame or on first use (the goal
#             page, review, settings, contract editor, the palette and sheets,
#             native menus, the second half of each dictionary — what only
#             those views say) and the other language
#   total     start-up and on demand together: moving code from one to the
#             other must not hide growth
#   goal page the goal page's own chunk, the view opened most after the desk
#   worker    syntax highlighting (Shiki grammars), loaded in the background
# The on-demand budget grew from 64 KB to 96 KB when the goal page and the
# dictionaries' second halves left start-up (start-up fell by 14 KB; on
# demand rose by about 20 KB, since the other language now counts as two
# chunks and the current language's second half is on demand too), with the
# headroom the old budget had. The total (160 KB) and goal-page (12 KB)
# budgets were set at 15% or more over the sizes of 2026-10-27 (139,237 and
# 10,071 bytes). On 2026-10-27 the goal page's words, the criterion notes
# and the palette's words left start-up too (58,334 → 52,661 bytes; the
# total grew by 228): 8 KB of the start-up budget moved to on demand
# (72 → 64 KB, 96 → 104 KB), so the win is kept and the sum is unchanged.
# Run after `pnpm --dir apps/desktop build`.
set -e
start_budget="${1:-65536}"
lazy_budget="${2:-106496}"
worker_budget="${3:-262144}"
total_budget="${4:-163840}"
goal_budget="${5:-12288}"
dist="$(cd "$(dirname "$0")/.." && pwd)/apps/desktop/dist"
gz() { gzip -9c "$1" | wc -c | tr -d ' '; }
startup_files=$(grep -o '"/assets/[^"]*\.js"' "$dist/index.html" | tr -d '"' | sort -u)
start=0; lazy=0; worker=0; locale_max=0; locale_sum=0; goal=""
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
  case "$name" in /assets/GoalPage-*.js) goal=$((${goal:-0} + n)) ;; esac
done
start=$((start + locale_max)); lazy=$((lazy + locale_sum - locale_max))
total=$((start + lazy))
echo "start-up JavaScript: $start bytes gzipped (budget $start_budget; one language, $locale_max of it)"
echo "on-demand views:     $lazy bytes gzipped (budget $lazy_budget)"
echo "all interface JS:    $total bytes gzipped (budget $total_budget; start-up and on demand together)"
echo "goal page chunk:     ${goal:-none} bytes gzipped (budget $goal_budget)"
echo "highlighting worker: $worker bytes gzipped (budget $worker_budget)"
# A renamed goal page would otherwise pass unmeasured.
[ -n "$goal" ] || { echo "no GoalPage-*.js chunk in the build: name the goal page's chunk or update this script"; exit 1; }
[ "$start" -le "$start_budget" ] && [ "$lazy" -le "$lazy_budget" ] && [ "$worker" -le "$worker_budget" ] \
  && [ "$total" -le "$total_budget" ] && [ "$goal" -le "$goal_budget" ]
