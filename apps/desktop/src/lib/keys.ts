/**
 * Keyboard-first (docs/04 §4.17, docs/16 §16.3). Views register bindings
 * while mounted; the most recently registered scope wins. Plain keys are
 * ignored while typing; chords with ⌘ always work.
 *
 * The registry is reactive: the `?` sheet lists exactly the bindings that
 * are live at that moment, grouped by the scope that owns them. A binding
 * without a description is an alias (↓ for j) and stays out of the sheet.
 */
import { createSignal, onCleanup } from "solid-js";

export interface Binding {
  /** e.g. "j", "shift+t", "mod+k", "mod+shift+enter", "escape", "?" */
  key: string;
  run: (e: KeyboardEvent) => void;
  /** Also fire while focus is in a text field. */
  inInputs?: boolean;
  /** What it does, for the shortcut sheet (reactive: translated when read). */
  desc?: () => string;
  /** Keys to show instead of `key`, e.g. "j k" when k is a separate alias. */
  hint?: string;
  /** Live only while this holds (reactive): the sheet hides it and the key does nothing otherwise. */
  when?: () => boolean;
}

export interface Scope {
  /** Where the bindings apply (reactive), e.g. "Review". */
  name: () => string;
  bindings: Binding[];
}

const [scopes, setScopes] = createSignal<Scope[]>([]);

/** The live scopes, outermost first. */
export const activeScopes = scopes;

type KeyLike = Pick<KeyboardEvent, "key" | "code" | "metaKey" | "ctrlKey" | "altKey" | "shiftKey">;

/** A key event as "mod+shift+k": letters by position (so ⌥V is "alt+v" even when the key reads "√"), symbols as typed. */
export function normalizeCombo(e: KeyLike): string {
  const parts: string[] = [];
  let k = e.key.toLowerCase();
  if (k === " ") k = "space";
  if (k === "esc") k = "escape";
  let shift = e.shiftKey;
  // With shift or option, letters and digits arrive changed: use the position.
  if ((shift || e.altKey) && /^Key[A-Z]$/.test(e.code)) k = e.code.slice(3).toLowerCase();
  else if ((shift || e.altKey) && /^Digit\d$/.test(e.code)) k = e.code.slice(5);
  // A shifted symbol ("?", "{") already says shift.
  else if (shift && k.length === 1 && !/[a-z0-9]/.test(k)) shift = false;
  if (e.metaKey || e.ctrlKey) parts.push("mod");
  if (e.altKey) parts.push("alt");
  if (shift) parts.push("shift");
  parts.push(k);
  return parts.join("+");
}

function typing(e: KeyboardEvent): boolean {
  const t = e.target as HTMLElement | null;
  if (!t) return false;
  return t.isContentEditable || t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT";
}

if (typeof window !== "undefined") {
  window.addEventListener("keydown", (e) => {
    if (e.isComposing) return;
    const combo = normalizeCombo(e);
    const inInput = typing(e);
    const list = scopes();
    for (let i = list.length - 1; i >= 0; i--) {
      const hit = list[i].bindings.find((b) => b.key === combo && (!b.when || b.when()));
      if (hit) {
        if (inInput && !hit.inInputs && !combo.startsWith("mod+")) return;
        e.preventDefault();
        hit.run(e);
        return;
      }
    }
  });
}

/** Registers bindings for the lifetime of the calling component. */
export function useKeys(bindings: Binding[], name: () => string = () => "") {
  const scope: Scope = { name, bindings };
  setScopes((s) => [...s, scope]);
  onCleanup(() => setScopes((s) => s.filter((x) => x !== scope)));
}

const GLYPH: Record<string, string> = {
  mod: "⌘",
  shift: "⇧",
  alt: "⌥",
  enter: "↩",
  escape: "Esc",
  arrowup: "↑",
  arrowdown: "↓",
  arrowleft: "←",
  arrowright: "→",
  space: "␣",
  tab: "⇥",
  backspace: "⌫",
};

/** Display form of a binding: ⌘⇧↩ style. */
export function keyHint(key: string): string {
  return key
    .split("+")
    .map((p) => GLYPH[p] ?? p.toUpperCase())
    .join("");
}
