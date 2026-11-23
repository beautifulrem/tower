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

  it("keeps the keys under a modal layer quiet, except the app's own ⌘ chords", () => {
    const viewKey = vi.fn();
    const viewChord = vi.fn();
    const appChord = vi.fn();
    const close = vi.fn();
    const disposeApp = createRoot((d) => {
      useKeys([{ key: "mod+k", run: appChord }], undefined, { shell: true });
      return d;
    });
    const disposeView = createRoot((d) => {
      useKeys([
        { key: "v", run: viewKey },
        { key: "mod+enter", run: viewChord },
      ]);
      return d;
    });
    const disposeModal = createRoot((d) => {
      useKeys([{ key: "escape", run: close }], undefined, { modal: true });
      return d;
    });
    press("v");
    expect(viewKey).not.toHaveBeenCalled();
    // A view's ⌘↩ (save the contract) must not fire under the palette.
    press("Enter", { metaKey: true });
    expect(viewChord).not.toHaveBeenCalled();
    press("k", { metaKey: true });
    expect(appChord).toHaveBeenCalledTimes(1);
    press("Escape");
    expect(close).toHaveBeenCalledTimes(1);
    disposeModal();
    press("v");
    expect(viewKey).toHaveBeenCalledTimes(1);
    press("Enter", { metaKey: true });
    expect(viewChord).toHaveBeenCalledTimes(1);
    disposeView();
    disposeApp();
  });

  it("keeps a view mounted while a dialog is open under the dialog", () => {
    const close = vi.fn();
    const viewEscape = vi.fn();
    const disposeModal = createRoot((d) => {
      useKeys([{ key: "escape", run: close }], undefined, { modal: true });
      return d;
    });
    // ⌘1 under Activity switches views: the new view's keys register after the dialog's.
    const disposeView = createRoot((d) => {
      useKeys([{ key: "escape", run: viewEscape }]);
      return d;
    });
    press("Escape");
    expect(close).toHaveBeenCalledTimes(1);
    expect(viewEscape).not.toHaveBeenCalled();
    disposeView();
    disposeModal();
  });
});
