#!/bin/sh
# No source file over 800 lines (a Rust file's inline test module and the
# generated bindings, locales and test files do not count): past that a
# file is doing two jobs.
set -e
cd "$(dirname "$0")/.."
limit=800
over=0
for f in $(find crates apps/desktop/src extensions -type f \( -name '*.rs' -o -name '*.ts' -o -name '*.tsx' \) \
    -not -path '*/gen/*' -not -path '*/tests/*' -not -path '*/__tests__/*' -not -path '*/locales/*' \
    -not -name '*.test.ts' -not -path '*/node_modules/*' -not -path '*/target/*'); do
  n=$(awk '/^#\[cfg\(test\)\]/ { exit } { n++ } END { print n+0 }' "$f")
  if [ "$n" -gt "$limit" ]; then
    echo "$f: $n lines (limit $limit)"
    over=1
  fi
done
exit $over
