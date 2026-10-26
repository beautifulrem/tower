import { describe, expect, it } from "vitest";

import { wedgePath } from "../gauge";

describe("runs gauge", () => {
  it("fills a quarter, a half (the running glyph's own disc), and the whole ring", () => {
    expect(wedgePath(0)).toBe("");
    // A quarter turn counter-clockwise from the top ends at the left.
    expect(wedgePath(0.25)).toBe("M5 5 L5 1 A4 4 0 0 0 1 5 Z");
    // Half: the same left half-disc the running glyph draws (`M5 1 A4 4 0 0 0 5 9 Z`), from the centre.
    expect(wedgePath(0.5)).toBe("M5 5 L5 1 A4 4 0 0 0 5 9 Z");
    expect(wedgePath(0.75)).toMatch(/^M5 5 L5 1 A4 4 0 1 0 9 5 Z$/);
    expect(wedgePath(1)).toMatch(/^M5 1 A4 4 0 1 0 5 9 A4 4 0 1 0 5 1 Z$/);
  });

  it("clamps what it is given", () => {
    expect(wedgePath(2)).toBe(wedgePath(1));
    expect(wedgePath(-1)).toBe("");
  });
});
