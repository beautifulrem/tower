#!/bin/sh
# Opens the dev build on a view and captures the window (macOS).
# Requires the Vite dev server (`pnpm --dir apps/desktop dev`) to be running.
# Usage: TOWER_HOME=... tools/screenshot.sh <route> <out.png> [delay]
set -e
route="$1"; out="$2"; delay="${3:-4}"
root="$(cd "$(dirname "$0")/.." && pwd)"
pkill -f "target/debug/tower-desktop" 2>/dev/null || true
TOWER_OPEN="$route" "$root/target/debug/tower-desktop" >/tmp/tower-shot.log 2>&1 &
pid=$!
sleep "$delay"
bounds=$(osascript -e 'tell application "System Events" to get {position, size} of window 1 of (first process whose unix id is '"$pid"')' 2>/dev/null | tr -d ' ')
[ -n "$bounds" ] || bounds="240,38,1440,900"
screencapture -x -R "$bounds" "$out"
kill "$pid" 2>/dev/null || true
wait "$pid" 2>/dev/null || true
echo "$out"
