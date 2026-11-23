// @vitest-environment jsdom
import { createRoot } from "solid-js";
import { describe, expect, it, vi } from "vitest";

import { activatesTarget, normalizeCombo, useKeys } from "../keys";

const press = (key: string, init: KeyboardEventInit = {}) => window.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true, ...init }));

describe("keys", () => {
  it("leaves Enter and Space to the button, link or row that has focus", () => {
    const button = document.createElement("button");
    const row = document.createElement("div");
    row.setAttribute("role", "treeitem");
    const inner = document.createElement("span");
    button.append(inner);
    expect(activatesTarget("enter", button)).toBe(true);
    expect(activatesTarget("space", inner)).toBe(true);
    expect(activatesTarget("enter", row)).toBe(true);
    // Elsewhere the view's own Enter applies; other keys are never theirs.
    expect(activatesTarget("enter", document.body)).toBe(false);
    expect(activatesTarget("j", button)).toBe(false);
  });

  it("names combos by position", () => {
    expect(normalizeCombo({ key: "√", code: "KeyV", metaKey: false, ctrlKey: false, altKey: true, shiftKey: false })).toBe("alt+v");
    expect(normalizeCombo({ key: "Enter", code: "Enter", metaKey: true, ctrlKey: false, altKey: false, shiftKey: true })).toBe("mod+shift+enter");
  });

  it("fires a held key once, except keys that move through a list", () => {
    const pick = vi.fn();
    const move = vi.fn();
    const dispose = createRoot((d) => {
      useKeys([
        { key: "2", run: pick },
        { key: "j", run: move },
      ]);
      return d;
    });
    // Holding 2 must not arm a destructive option and then confirm it on the auto-repeat.
    press("2");
    press("2", { repeat: true });
    expect(pick).toHaveBeenCalledTimes(1);
    press("j");
    press("j", { repeat: true });
    expect(move).toHaveBeenCalledTimes(2);
    dispose();
  });

  it("keeps the view's keys quiet under a modal layer, except ⌘ chords", () => {
    const viewKey = vi.fn();
    const chord = vi.fn();
    const close = vi.fn();
    const disposeView = createRoot((d) => {
      useKeys([
        { key: "v", run: viewKey },
        { key: "mod+k", run: chord },
      ]);
      return d;
    });
    const disposeModal = createRoot((d) => {
      useKeys([{ key: "escape", run: close }], undefined, { modal: true });
      return d;
    });
    press("v");
    expect(viewKey).not.toHaveBeenCalled();
    press("k", { metaKey: true });
    expect(chord).toHaveBeenCalledTimes(1);
    press("Escape");
    expect(close).toHaveBeenCalledTimes(1);
    disposeModal();
    press("v");
    expect(viewKey).toHaveBeenCalledTimes(1);
    disposeView();
  });
});
