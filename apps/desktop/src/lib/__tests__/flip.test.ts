import { describe, expect, it } from "vitest";

import { shifts } from "../flip";

describe("flip", () => {
  it("finds the offset that puts a moved row back where it was, and leaves the still ones alone", () => {
    const before = new Map([
      ["G-0001", { top: 100, left: 0 }],
      ["G-0002", { top: 136, left: 0 }],
      ["G-0003", { top: 172, left: 0 }],
    ]);
    // G-0002 moved from the running group to the verifying one, below G-0003; G-0003 moved up by a row.
    const after = new Map([
      ["G-0001", { top: 100, left: 0 }],
      ["G-0003", { top: 136, left: 0 }],
      ["G-0002", { top: 220, left: 0 }],
      ["G-0004", { top: 256, left: 0 }],
    ]);
    const s = shifts(before, after);
    expect(s.get("G-0002")).toEqual({ top: -84, left: 0 });
    expect(s.get("G-0003")).toEqual({ top: 36, left: 0 });
    expect(s.has("G-0001")).toBe(false);
    // A newcomer has no "before": it arrives, it does not slide.
    expect(s.has("G-0004")).toBe(false);
  });

  it("ignores sub-pixel drift", () => {
    const s = shifts(new Map([["a", { top: 10, left: 0 }]]), new Map([["a", { top: 10.4, left: 0.2 }]]));
    expect(s.size).toBe(0);
  });
});
