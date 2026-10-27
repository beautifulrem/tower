#!/bin/sh
# The sizes the README and docs/17 quote are the ones the build produces:
# the start-up, total and goal-page budgets exactly, the start-up size
# within 1 KB.
# Run after `pnpm --dir apps/desktop build`.
set -e
root="$(cd "$(dirname "$0")/.." && pwd)"
out=$("$root/tools/bundle-budget.sh")
start=$(echo "$out" | sed -n 's/^start-up JavaScript: \([0-9]*\) bytes.*/\1/p')
budget=$(echo "$out" | sed -n 's/^start-up JavaScript: .*(budget \([0-9]*\);.*/\1/p')
total_budget=$(echo "$out" | sed -n 's/^all interface JS: .*(budget \([0-9]*\);.*/\1/p')
goal_budget=$(echo "$out" | sed -n 's/^goal page chunk: .*(budget \([0-9]*\)).*/\1/p')
kb=$(( (start + 512) / 1024 ))
fail=0
for doc in README.md README.zh-CN.md docs/17-implementation.md; do
  quoted=$(grep -o '约 [0-9]* KB\|about [0-9]* KB' "$root/$doc" | head -1 | grep -o '[0-9]*')
  if [ -z "$quoted" ] || [ $((quoted - kb)) -gt 1 ] || [ $((kb - quoted)) -gt 1 ]; then
    echo "$doc quotes ${quoted:-no} KB for start-up JavaScript; the build has $kb KB"
    fail=1
  fi
  for pair in "start-up:$budget" "total:$total_budget" "goal page:$goal_budget"; do
    what=${pair%:*}
    n=$(( ${pair##*:} / 1024 ))
    if ! grep -q "$n KB" "$root/$doc"; then
      echo "$doc does not quote the $what budget of $n KB"
      fail=1
    fi
  done
done
exit $fail
