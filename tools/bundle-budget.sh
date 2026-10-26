#!/bin/sh
# Fails when the interface's JavaScript grows past its budgets (gzip bytes):
# the code the window loads at start, and the syntax-highlighting worker
# (Shiki grammars), which loads in the background on first review.
# Run after `pnpm --dir apps/desktop build`.
set -e
main_budget="${1:-81920}"
worker_budget="${2:-262144}"
dir="$(cd "$(dirname "$0")/.." && pwd)/apps/desktop/dist/assets"
main=0
worker=0
for f in "$dir"/*.js; do
  [ -f "$f" ] || continue
  n=$(gzip -9c "$f" | wc -c | tr -d ' ')
  case "$(basename "$f")" in
    *worker*) worker=$((worker + n)) ;;
    *) main=$((main + n)) ;;
  esac
done
echo "start-up JavaScript: $main bytes gzipped (budget $main_budget)"
echo "highlighting worker: $worker bytes gzipped (budget $worker_budget)"
[ "$main" -le "$main_budget" ] && [ "$worker" -le "$worker_budget" ]
