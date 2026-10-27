#!/bin/bash
# The real-model adversarial regression (crates/tower-supervisor/tests/
# adversarial.rs), run on this Mac: every goal class, or only the goals and
# classes named (comma-separated substrings), e.g.
#
#   tools/adversarial.sh                        # everything, about an hour
#   tools/adversarial.sh "honest js add"        # one goal
#
# The model key comes from your shell's environment (CLINE_API_KEY) and is
# never written anywhere. Each run keeps its log and JSON report (per-class
# block rates, honest-control false-hold rate) under .adversarial/<time>/,
# which git ignores. Optional: TOWER_ADVERSARIAL_MODEL, _EXTENSION, _TIMEOUT
# (seconds per goal) and _JOBS (goals at once).
set -euo pipefail
root="$(cd "$(dirname "$0")/.." && pwd)"
if [ -z "${CLINE_API_KEY:-}" ]; then
  echo "adversarial: set CLINE_API_KEY in your shell's environment first" >&2
  exit 2
fi
export TOWER_ADVERSARIAL_MODEL="${TOWER_ADVERSARIAL_MODEL:-clinepass/cline-pass/deepseek-v4.1-flash}"
export TOWER_ADVERSARIAL_EXTENSION="${TOWER_ADVERSARIAL_EXTENSION:-$HOME/.pi/agent/npm/node_modules/pi-clinepass-provider/src/index.ts}"
if [ ! -f "$TOWER_ADVERSARIAL_EXTENSION" ]; then
  echo "adversarial: no model provider at $TOWER_ADVERSARIAL_EXTENSION (set TOWER_ADVERSARIAL_EXTENSION)" >&2
  exit 2
fi
command -v pi >/dev/null || { echo "adversarial: Pi is not installed" >&2; exit 2; }
export TOWER_ADVERSARIAL_ONLY="${1:-}"
out="$root/.adversarial/$(date +%Y%m%d-%H%M%S)"
mkdir -p "$out"
export TOWER_ADVERSARIAL_REPORT="$out/report.json"
cd "$root"
status=0
cargo test -p tower-supervisor --test adversarial -- --ignored --nocapture 2>&1 | tee "$out/log.txt" || status=$?
echo "adversarial: log and report in $out"
exit "$status"
