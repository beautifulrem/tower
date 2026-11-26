import { describe, expect, it, vi } from "vitest";

const now = Date.now();
vi.mock("../../lib/store", async () => {
  const { createStore } = await import("solid-js/store");
  const [state] = createStore({ settings: { language: "en" }, goals: {}, inbox: [], pulse: {}, now });
  return { state, livenessOf: (g: { updated_at: number }) => ({ at: g.updated_at, tool: null }) };
});

const { liveDetail } = await import("../Live");

// Review 19 (R19-P3-03): a call that had ended was still written as what the run was doing.
describe("the live line's detail", () => {
  const goal = (running: boolean | null, quietFor = 20, more: object = {}) => {
    const at = now - quietFor * 1000;
    const line = running === null ? null : { mode: "executing", action: "bash", target: "pnpm test --filter checkout", at, running };
    return { id: "G-2", state: "running", mode: "thinking", needs_you: 0, run_no: 1, run_started_at: now - 60_000, updated_at: at, live_line: line, ...more } as never;
  };
  const words = (g: never) => [liveDetail(g).action, liveDetail(g).target];

  it("names the call in flight", () => {
    expect(words(goal(true))).toEqual(["bash", "pnpm test --filter checkout"]);
  });
  it("says which run once the call has ended, not the finished command", () => {
    expect(words(goal(false))).toEqual(["Run 1", ""]);
  });
  it("keeps the last call's words once the run has gone quiet: what it went quiet after", () => {
    expect(words(goal(false, 300))).toEqual(["bash", "pnpm test --filter checkout"]);
  });
  it("is getting started before any call", () => {
    expect(words(goal(null))).toEqual(["Getting started", ""]);
  });
  // Review 20 (record only): silent for 22 hours with no call yet, it read "Silent  Getting started".
  it("says which run, not getting started, once a run with no call yet has gone quiet", () => {
    expect(words(goal(null, 300))).toEqual(["Run 1", ""]);
  });
  // Review 20 (R20-P3-02): on the board a call that has just ended keeps its words a beat, so a run reading file after
  // file changes its detail once a call.
  // Review 20 (record only): the goal page said "Run 2" in its header and again on the live line under it. There, and in
  // the peek, the header names the run: the line says how long it has gone.
  it("says how long the run has gone where a header names it", () => {
    expect([liveDetail(goal(false), false, true).action, liveDetail(goal(null, 300), false, true).action]).toEqual(["elapsed 1m", "elapsed 1m"]);
    expect(liveDetail(goal(true), false, true).action).toBe("bash");
  });
  // Review 21 (record only): a run starting read "Starting  Starting" (the badge, then the detail). The badge says it.
  it("says which run while it starts, once", () => {
    for (const run_no of [1, 2]) {
      const g = goal(null, 20, { mode: "starting", run_no });
      expect([liveDetail(g).action, liveDetail(g).target]).toEqual([`Run ${run_no}`, ""]);
      expect(liveDetail(g, false, true).action).toBe("elapsed 1m");
    }
  });
  // Review 21 (record only): with no start time the goal page's line was empty, the shimmer over nothing.
  it("names the run where it cannot say how long it has gone", () => {
    expect(liveDetail(goal(false, 20, { run_started_at: null }), false, true).action).toBe("Run 1");
  });
  it("keeps a call's words while it lingers on the board", () => {
    const lingering = liveDetail(goal(false), true);
    expect([lingering.action, lingering.target]).toEqual(["bash", "pnpm test --filter checkout"]);
  });
});
