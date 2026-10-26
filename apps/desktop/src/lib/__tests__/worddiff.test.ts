import { describe, expect, it } from "vitest";

import type { DiffLine } from "../../gen/DiffLine";
import { changedRanges, hunkWordRanges } from "../worddiff";

const slice = (s: string, rs: [number, number][]) => rs.map(([a, b]) => s.slice(a, b));

describe("word diff", () => {
  it("marks only the changed token", () => {
    const a = "  return sum + item.price + item.qty;";
    const b = "  return sum + item.price * item.qty;";
    const r = changedRanges(a, b)!;
    expect(slice(a, r.old)).toEqual(["+"]);
    expect(slice(b, r.new)).toEqual(["*"]);
  });

  it("leaves lines that are almost entirely different unmarked", () => {
    expect(changedRanges("importLegacyOrders", "renderCheckoutSummary(cart)")).toBeNull();
  });

  it("pairs the k-th deleted line with the k-th added line", () => {
    const line = (kind: DiffLine["kind"], text: string): DiffLine => ({ kind, old_no: null, new_no: null, text });
    const lines = [line("context", "a"), line("del", "x = 1"), line("del", "y = 2"), line("add", "x = 3"), line("add", "y = 2;")];
    const m = hunkWordRanges(lines);
    expect(slice("x = 1", m.get(1)!)).toEqual(["1"]);
    expect(slice("x = 3", m.get(3)!)).toEqual(["3"]);
    expect(m.has(0)).toBe(false);
  });
});
