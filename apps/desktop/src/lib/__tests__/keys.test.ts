// @vitest-environment jsdom
import { describe, expect, it } from "vitest";

import { activatesTarget, normalizeCombo } from "../keys";

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
});
