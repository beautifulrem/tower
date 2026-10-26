#!/bin/sh
# Opens the dev build on a view and captures ONLY Tower's own window (macOS).
#
# The capture is by window id (`screencapture -l`), so nothing else on the
# screen — other apps, notifications, overlays — can end up in the image.
# If Tower's window cannot be found, nothing is captured and the script fails.
#
# Requires the Vite dev server (`pnpm --dir apps/desktop dev`) to be running.
# Usage: TOWER_HOME=... tools/screenshot.sh <route> <out.png> [delay] [key [modifiers]]
#   key/modifiers: one keystroke sent to Tower before capturing, e.g.
#   `k "using command down"` for the command palette (needs Accessibility).
set -e
route="$1"; out="$2"; delay="${3:-4}"; key="$4"; mods="$5"
root="$(cd "$(dirname "$0")/.." && pwd)"
helper="${TMPDIR:-/tmp}/tower-window-id"
if [ ! -x "$helper" ] || [ "$root/tools/window-id.swift" -nt "$helper" ]; then
  swiftc -O "$root/tools/window-id.swift" -o "$helper"
fi
# A sleeping display yields windows that cannot be imaged.
caffeinate -u -t 2 >/dev/null 2>&1 || true

attempt() {
  pkill -f "target/debug/tower-desktop" 2>/dev/null || true
  sleep 0.5
  TOWER_OPEN="$route" "$root/target/debug/tower-desktop" >/tmp/tower-shot.log 2>&1 &
  pid=$!
  sleep "$delay"
  if [ -n "$key" ]; then
    osascript -e "tell application \"System Events\" to tell (first process whose unix id is $pid) to set frontmost to true" \
      -e "delay 0.3" -e "tell application \"System Events\" to keystroke \"$key\" $mods" >/dev/null 2>&1 || true
    sleep 1.2
  fi
  ok=1
  for _ in 1 2 3; do
    # -o: no window shadow; -x: no sound.
    if wid=$("$helper" "$pid") && screencapture -x -o -l "$wid" "$out" 2>/dev/null; then ok=0; break; fi
    sleep 1
  done
  kill "$pid" 2>/dev/null || true
  wait "$pid" 2>/dev/null || true
  return $ok
}

# The first launch after a build sometimes presents a surface that cannot be
# imaged; one relaunch fixes it.
if attempt || attempt; then
  echo "$out"
else
  echo "screenshot: Tower's window not found or not capturable; nothing captured" >&2
  exit 1
fi
