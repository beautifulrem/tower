#!/bin/sh
# Opens the dev build on a view and captures ONLY Tower's own window (macOS).
#
# The capture is by window id (`screencapture -l`), so nothing else on the
# screen — other apps, notifications, overlays — can end up in the image.
# If Tower's window cannot be found, nothing is captured and the script fails.
#
# Requires the Vite dev server (`pnpm --dir apps/desktop dev`) to be running.
# Usage: TOWER_HOME=... tools/screenshot.sh <route> <out.png> [delay]
set -e
route="$1"; out="$2"; delay="${3:-4}"
root="$(cd "$(dirname "$0")/.." && pwd)"
helper="${TMPDIR:-/tmp}/tower-window-id"
if [ ! -x "$helper" ] || [ "$root/tools/window-id.swift" -nt "$helper" ]; then
  swiftc -O "$root/tools/window-id.swift" -o "$helper"
fi
pkill -f "target/debug/tower-desktop" 2>/dev/null || true
TOWER_OPEN="$route" "$root/target/debug/tower-desktop" >/tmp/tower-shot.log 2>&1 &
pid=$!
sleep "$delay"
if ! wid=$("$helper" "$pid"); then
  kill "$pid" 2>/dev/null || true
  echo "screenshot: Tower's window not found; nothing captured" >&2
  exit 1
fi
# -o: no window shadow; -x: no sound.
screencapture -x -o -l "$wid" "$out"
kill "$pid" 2>/dev/null || true
wait "$pid" 2>/dev/null || true
echo "$out"
