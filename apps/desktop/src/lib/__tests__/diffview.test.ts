import { describe, expect, it } from "vitest";

import type { DiffFile } from "../../gen/DiffFile";
import type { DiffLine } from "../../gen/DiffLine";
import { contextLines, gapsOf, hunkSpan, revealOf, splitLines, splitRows } from "../diffview";

const line = (kind: DiffLine["kind"], text = ""): DiffLine => ({ kind, old_no: null, new_no: null, text });

const file = (hunks: string[], status: DiffFile["status"] = "modified"): DiffFile => ({
  path: "a.ts",
  old_path: null,
  status,
  additions: 0,
  deletions: 0,
  binary: false,
  hunks: hunks.map((header) => ({ header, lines: [] })),
});

describe("hunk spans and gaps", () => {
  it("reads the header, including zero-length sides", () => {
    expect(hunkSpan({ header: "@@ -10,4 +12,6 @@ fn", lines: [] })).toEqual({ oldStart: 10, oldEnd: 13, newStart: 12, newEnd: 17 });
    expect(hunkSpan({ header: "@@ -0,0 +1,3 @@", lines: [] })).toEqual({ oldStart: 1, oldEnd: 0, newStart: 1, newEnd: 3 });
    expect(hunkSpan({ header: "@@ -5 +5 @@", lines: [] })).toEqual({ oldStart: 5, oldEnd: 5, newStart: 5, newEnd: 5 });
    expect(hunkSpan({ header: "garbage", lines: [] })).toBeNull();
  });

  it("finds the hidden regions above, between and below hunks", () => {
    const f = file(["@@ -10,4 +12,6 @@", "@@ -30,2 +34,2 @@"]);
    expect(gapsOf(f, null)).toEqual([
      { index: 0, newFrom: 1, newTo: 11, shift: -2 },
      { index: 1, newFrom: 18, newTo: 33, shift: -4 },
      { index: 2, newFrom: 36, newTo: null, shift: -4 },
    ]);
    expect(gapsOf(f, 40).at(-1)).toEqual({ index: 2, newFrom: 36, newTo: 40, shift: -4 });
    expect(gapsOf(f, 35)).toHaveLength(2);
  });

  it("has no gaps for whole-file changes", () => {
    expect(gapsOf(file(["@@ -0,0 +1,3 @@"], "added"), 3)).toEqual([]);
    expect(gapsOf(file(["@@ -1,3 +0,0 @@"], "deleted"), 0)).toEqual([]);
  });

  it("reveals from either end and keeps the old numbers in step", () => {
    const gap = { index: 1, newFrom: 18, newTo: 33, shift: -4 };
    expect(revealOf(gap, undefined, null)).toEqual({ top: null, bottom: null, hidden: 16 });
    expect(revealOf(gap, { top: 5, bottom: 20 }, null)).toEqual({ top: [18, 22], bottom: [23, 33], hidden: 0 });
    const lines = Array.from({ length: 40 }, (_, i) => `L${i + 1}`);
    const ctx = contextLines(lines, gap, 18, 20);
    expect(ctx.map((l) => [l.old_no, l.new_no, l.text])).toEqual([
      [14, 18, "L18"],
      [15, 19, "L19"],
      [16, 20, "L20"],
    ]);
  });

  it("drops the phantom line after a final newline", () => {
    expect(splitLines("a\nb\n")).toEqual(["a", "b"]);
    expect(splitLines("a\nb")).toEqual(["a", "b"]);
    expect(splitLines("")).toEqual([]);
  });
});

describe("side-by-side pairing", () => {
  it("pairs the k-th deleted line with the k-th added line", () => {
    const rows = splitRows([line("context"), line("del"), line("del"), line("add"), line("context"), line("add"), line("add")]);
    expect(rows).toEqual([
      { left: 0, right: 0 },
      { left: 1, right: 3 },
      { left: 2, right: null },
      { left: 4, right: 4 },
      { left: null, right: 5 },
      { left: null, right: 6 },
    ]);
  });
});
