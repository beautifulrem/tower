/**
 * Keyboard-first (docs/04 §4.17, docs/16 §16.3). Views register bindings
 * while mounted; the most recently registered scope wins. Plain keys are
 * ignored while typing; chords with ⌘ always work.
 */
import { onCleanup } from "solid-js";

export interface Binding {
  /** e.g. "j", "shift+t", "mod+k", "mod+shift+enter", "escape" */
  key: string;
  run: (e: KeyboardEvent) => void;
  /** Also fire while focus is in a text field. */
  inInputs?: boolean;
}

const scopes: Binding[][] = [];

function normalize(e: KeyboardEvent): string {
  const parts: string[] = [];
  if (e.metaKey || e.ctrlKey) parts.push("mod");
  if (e.altKey) parts.push("alt");
  if (e.shiftKey) parts.push("shift");
  let k = e.key.toLowerCase();
  if (k === " ") k = "space";
  if (k === "esc") k = "escape";
  // With shift, letters arrive uppercase and symbols shifted: use the code.
  if (e.shiftKey && /^Key[A-Z]$/.test(e.code)) k = e.code.slice(3).toLowerCase();
  if (e.shiftKey && /^Digit\d$/.test(e.code)) k = e.code.slice(5);
  parts.push(k);
  return parts.join("+");
}

function typing(e: KeyboardEvent): boolean {
  const t = e.target as HTMLElement | null;
  if (!t) return false;
  return t.isContentEditable || t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT";
}

window.addEventListener("keydown", (e) => {
  if (e.isComposing) return;
  const combo = normalize(e);
  const inInput = typing(e);
  for (let i = scopes.length - 1; i >= 0; i--) {
    const hit = scopes[i].find((b) => b.key === combo);
    if (hit) {
      if (inInput && !hit.inInputs && !combo.startsWith("mod+")) return;
      e.preventDefault();
      hit.run(e);
      return;
    }
  }
});

/** Registers bindings for the lifetime of the calling component. */
export function useKeys(bindings: Binding[]) {
  scopes.push(bindings);
  onCleanup(() => {
    const i = scopes.lastIndexOf(bindings);
    if (i >= 0) scopes.splice(i, 1);
  });
}

/** Display form of a binding: ⌘⇧↩ style. */
export function keyHint(key: string): string {
  return key
    .split("+")
    .map((p) =>
      ({ mod: "⌘", shift: "⇧", alt: "⌥", enter: "↩", escape: "Esc", arrowup: "↑", arrowdown: "↓", space: "␣" })[p] ??
      p.toUpperCase(),
    )
    .join("");
}
