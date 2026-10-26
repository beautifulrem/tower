import { describe, expect, it } from "vitest";

import { fuzzy, matchText, segments } from "../fuzzy";
import { initialOf, initialsKey, pinyinAvailable } from "../pinyin";

describe("fuzzy matching", () => {
  it("matches subsequences and rejects non-subsequences", () => {
    expect(fuzzy("ovw", "Open overview")).not.toBeNull();
    expect(fuzzy("xyz", "Open overview")).toBeNull();
    expect(fuzzy("", "anything")).toEqual({ score: 0, positions: [] });
  });

  it("prefers word starts and consecutive runs", () => {
    const acronym = fuzzy("oo", "Open overview")!;
    const scattered = fuzzy("oo", "proportion")!;
    expect(acronym.score).toBeGreaterThan(scattered.score);
    expect(acronym.positions).toEqual([0, 5]);
    const run = fuzzy("view", "Open overview")!;
    expect(run.positions).toEqual([9, 10, 11, 12]);
  });

  it("is case-insensitive and reports positions in code points", () => {
    const m = fuzzy("G3", "G-0003 清理购物车")!;
    expect(m.positions).toEqual([0, 5]);
    expect(segments("G-0003 清理购物车", m.positions)).toEqual([
      ["G", true],
      ["-000", false],
      ["3", true],
      [" 清理购物车", false],
    ]);
  });

  it("ranks an exact prefix above a scattered match", () => {
    const list = ["Pause G-0002", "Open settings", "Open overview"];
    const scored = list.map((s) => [s, fuzzy("open", s)?.score ?? -1] as const).sort((a, b) => b[1] - a[1]);
    expect(scored[0][0].startsWith("Open")).toBe(true);
    expect(scored[2][0]).toBe("Pause G-0002");
  });
});

// Needs ICU's Chinese collation; Node builds without full ICU skip this.
describe.skipIf(!pinyinAvailable())("pinyin initials", () => {
  it("finds the initial of common characters by collation", () => {
    expect([..."购物车"].map(initialOf).join("")).toBe("gwc");
    expect([..."张王李赵"].map(initialOf).join("")).toBe("zwlz");
    expect([..."清理购物车计算的边界情况"].map(initialOf).join("")).toBe("qlgwcjsdbjqk");
    expect(initialOf("a")).toBeNull();
  });

  it("keeps one output character per input character", () => {
    const text = "G-0003 清理购物车";
    expect([...initialsKey(text)].length).toBe([...text].length);
    expect(initialsKey(text)).toBe("g-0003 qlgwc");
  });

  it("lets Latin initials find a Chinese title", () => {
    const m = matchText("gwc", "修复购物车总价计算")!;
    expect(m).not.toBeNull();
    expect(segments("修复购物车总价计算", m.positions).filter(([, hit]) => hit).map(([s]) => s)).toEqual(["购物车"]);
    expect(matchText("购物", "修复购物车总价计算")!.positions).toEqual([2, 3]);
    expect(matchText("zzz", "修复购物车总价计算")).toBeNull();
  });
});
