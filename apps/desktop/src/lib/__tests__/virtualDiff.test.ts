import { describe, expect, it, vi } from "vitest";

import {
  DEFAULT_HEIGHTS,
  type GeometryItem,
  SplitGeometry,
  VIRTUAL_THRESHOLD,
  anchorKey,
  createIdleGate,
} from "../virtualDiff";

function codeItems(count: number, path = "src/big.ts"): GeometryItem[] {
  return Array.from({ length: count }, (_, i) => ({
    kind: "code",
    anchor: { path, line: i + 1, side: "new" as const },
  }));
}

describe("SplitGeometry", () => {
  it("computes deterministic fixed-height prefix sums for large code diffs", () => {
    const g = new SplitGeometry(codeItems(5000));
    expect(g.count).toBe(5000);
    expect(g.totalHeight).toBe(5000 * DEFAULT_HEIGHTS.code);
    expect(g.rowTop(0)).toBe(0);
    expect(g.rowTop(2500)).toBe(2500 * 20);
    expect(g.indexAtY(0)).toBe(0);
    expect(g.indexAtY(2500 * 20)).toBe(2500);
    expect(g.indexAtY(2500 * 20 + 19)).toBe(2500);
    expect(g.indexAtY(2500 * 20 + 20)).toBe(2501);
  });

  it("computes visible viewport window with overscan and accurate spacers", () => {
    const g = new SplitGeometry(codeItems(1000));
    const r = g.range(4000, 600, 10);
    // Row 200 sits at y=4000; viewport covers rows 200..230; overscan 10 -> [190, 241)
    expect(r.start).toBe(190);
    expect(r.end).toBe(241);
    expect(r.topPad).toBe(190 * 20);
    expect(r.bottomPad).toBe((1000 - 241) * 20);
    expect(r.topPad + (r.end - r.start) * 20 + r.bottomPad).toBe(r.totalHeight);
  });

  it("updates variable-height inline comment/composer rows lazily without rebuilding fixed geometry", () => {
    const items: GeometryItem[] = [
      ...codeItems(10),
      { kind: "comment", anchor: { path: "src/big.ts", line: 10, side: "new" } },
      ...codeItems(10).map((it, i) => ({ ...it, anchor: { path: "src/big.ts", line: 11 + i, side: "new" as const } })),
    ];
    const g = new SplitGeometry(items);
    const initialTotal = g.totalHeight;
    expect(g.rowTop(10)).toBe(200);
    expect(g.rowTop(11)).toBe(200 + DEFAULT_HEIGHTS.comment);

    // Comment expands to 120px when measured
    expect(g.measure(10, 120)).toBe(true);
    expect(g.measure(10, 120.2)).toBe(false); // sub-0.5px jitter ignored
    expect(g.rowHeight(10)).toBe(120);
    expect(g.rowTop(11)).toBe(200 + 120);
    expect(g.totalHeight).toBe(initialTotal + (120 - DEFAULT_HEIGHTS.comment));
    expect(g.indexAtY(200 + 119)).toBe(10);
    expect(g.indexAtY(200 + 120)).toBe(11);
  });

  it("anchors scroll by (path, line, side) so inserting or growing a comment above never jumps scroll", () => {
    const base = codeItems(600);
    const g = new SplitGeometry(base);
    // User is scrolled to line 300 (+ 7px into that row)
    const beforeScroll = g.rowTop(299) + 7;
    const captured = g.captureAnchor(beforeScroll);
    expect(captured).not.toBeNull();
    expect(captured!.anchor).toEqual({ path: "src/big.ts", line: 300, side: "new" });
    expect(captured!.offsetPx).toBe(7);

    // Insert a composer at line 50 (well above the viewport)
    const withComposer: GeometryItem[] = [
      ...base.slice(0, 50),
      { kind: "composer", anchor: { path: "src/big.ts", line: 50, side: "new", hunk: 99 } },
      ...base.slice(50),
    ];
    g.reset(withComposer);

    const adjusted = g.resolveScrollTop(captured);
    // Scroll shifts by exact composer height so line 300 stays at identical pixel offset
    expect(adjusted).toBe(beforeScroll + DEFAULT_HEIGHTS.composer);

    // Now the composer grows as the user types multi-line text (96 -> 168px)
    const captured2 = g.captureAnchor(adjusted!);
    g.measure(50, 168);
    const adjusted2 = g.resolveScrollTop(captured2);
    expect(adjusted2).toBe(adjusted! + (168 - DEFAULT_HEIGHTS.composer));
  });

  it("carries measured overrides across resets for unchanged semantic anchors", () => {
    const items: GeometryItem[] = [
      { kind: "code", anchor: { path: "a.ts", line: 1, side: "new" } },
      { kind: "comment", anchor: { path: "a.ts", line: 1, side: "old" } },
      { kind: "code", anchor: { path: "a.ts", line: 2, side: "new" } },
    ];
    const g = new SplitGeometry(items);
    g.measure(1, 144);
    expect(g.rowHeight(1)).toBe(144);

    // Prepend a hunk header — comment moves from index 1 to index 2
    g.reset([{ kind: "head", anchor: { path: "a.ts", line: null, side: "hunk", hunk: 0 } }, ...items]);
    expect(g.rowHeight(2)).toBe(144);
    expect(g.rowTop(3)).toBe(28 + 20 + 144);
  });

  it("produces distinct anchor keys for old vs new side on the same line number", () => {
    const oldK = anchorKey({ path: "a.ts", line: 11, side: "old" });
    const newK = anchorKey({ path: "a.ts", line: 11, side: "new" });
    expect(oldK).not.toBe(newK);
    expect(VIRTUAL_THRESHOLD).toBe(400);
  });
});

describe("createIdleGate", () => {
  it("defers measurement callbacks while scrolling and flushes once idle", () => {
    vi.useFakeTimers();
    const rafs: FrameRequestCallback[] = [];
    const origRaf = globalThis.requestAnimationFrame;
    const origCancel = globalThis.cancelAnimationFrame;
    globalThis.requestAnimationFrame = (cb) => {
      rafs.push(cb);
      return rafs.length;
    };
    globalThis.cancelAnimationFrame = () => {};

    try {
      const gate = createIdleGate(50);
      const run = vi.fn();
      gate.markScrolling();
      gate.schedule(run);
      expect(run).not.toHaveBeenCalled();

      vi.advanceTimersByTime(49);
      expect(rafs).toHaveLength(0);

      vi.advanceTimersByTime(2);
      expect(rafs).toHaveLength(1);
      rafs.shift()!(0);
      expect(run).toHaveBeenCalledTimes(1);
      gate.dispose();
    } finally {
      globalThis.requestAnimationFrame = origRaf;
      globalThis.cancelAnimationFrame = origCancel;
      vi.useRealTimers();
    }
  });
});
