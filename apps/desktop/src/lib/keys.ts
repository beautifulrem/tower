/**
 * Keyboard-first (docs/04 §4.17, docs/16 §16.3). Views register bindings
 * while mounted; the most recently registered scope wins, within its layer: a
 * view mounted while a dialog is open still sits under the dialog. Plain keys
 * are ignored while typing; chords with ⌘ always work.
 *
 * The registry is reactive: the `?` sheet lists exactly the bindings that
 * are live at that moment, grouped by the scope that owns them. A binding
 * without a description is an alias (↓ for j) and stays out of the sheet.
 */
import { createContext, createSignal, onCleanup, useContext } from "solid-js";

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
  /** A modal layer (a dialog, the peek drawer): the keys under it stay quiet, but for the app's own ⌘ chords. */
  modal?: boolean;
  /** The app's own chords (⌘K, ⌘1, ⌘,): the only ones that reach under a modal layer. A view's ⌘↩ must not save
   *  the contract under the palette. */
  shell?: boolean;
  /** How many modal layers it sits inside; a scope never lands above a layer it is not in. */
  depth: number;
}

/** The modal layer depth the components below sit in; a dialog provides its own to its content. */
export const KeyLayer = createContext(0);

/** Keys that may auto-repeat while held: moving through a list. Everything else fires once per press, so holding a
 *  digit can't arm and then confirm a destructive option, and holding ⌘↩ can't create a goal twice. */
const REPEATS = new Set(["j", "k", "arrowup", "arrowdown", "arrowleft", "arrowright", "[", "]", "pageup", "pagedown"]);

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

/** Enter or Space on something that answers them itself (a button, a link, a tree row…): theirs, not a view's shortcut. */
export function activatesTarget(combo: string, target: EventTarget | null): boolean {
  if (combo !== "enter" && combo !== "space") return false;
  const t = target as HTMLElement | null;
  if (!t || typeof t.closest !== "function") return false;
  return !!t.closest(
    'button, a[href], summary, [role="button"], [role="link"], [role="menuitem"], [role="option"], [role="tab"], [role="treeitem"], [role="switch"], [role="checkbox"]',
  );
}

if (typeof window !== "undefined") {
  window.addEventListener("keydown", (e) => {
    if (e.isComposing) return;
    const combo = normalizeCombo(e);
    // Keyboard and screen-reader users press Enter on what has focus.
    if (activatesTarget(combo, e.target)) return;
    const inInput = typing(e);
    const list = scopes();
    let underModal = false;
    for (let i = list.length - 1; i >= 0; i--) {
      const hit = (!underModal || list[i].shell) && list[i].bindings.find((b) => b.key === combo && (!b.when || b.when()));
      if (hit) {
        if (inInput && !hit.inInputs && !combo.startsWith("mod+")) return;
        e.preventDefault();
        if (e.repeat && !REPEATS.has(combo)) return;
        hit.run(e);
        return;
      }
      if (list[i].modal) {
        if (!combo.startsWith("mod+")) return;
        underModal = true;
      }
    }
  });
}

/**
 * Registers bindings for the lifetime of the calling component. Returns the layer depth its content sits in, for a
 * modal scope to provide through `KeyLayer`.
 */
export function useKeys(bindings: Binding[], name: () => string = () => "", opts: { modal?: boolean; shell?: boolean } = {}): number {
  const depth = useContext(KeyLayer) + (opts.modal ? 1 : 0);
  const scope: Scope = { name, bindings, modal: opts.modal, shell: opts.shell, depth };
  setScopes((s) => {
    const above = s.findIndex((x) => x.depth > depth);
    return above < 0 ? [...s, scope] : [...s.slice(0, above), scope, ...s.slice(above)];
  });
  onCleanup(() => setScopes((s) => s.filter((x) => x !== scope)));
  return depth;
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
