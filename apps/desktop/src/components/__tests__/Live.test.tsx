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
  const goal = (running: boolean | null, quietFor = 20) => {
    const at = now - quietFor * 1000;
    const line = running === null ? null : { mode: "executing", action: "bash", target: "pnpm test --filter checkout", at, running };
    return { id: "G-2", state: "running", mode: "thinking", needs_you: 0, run_no: 1, run_started_at: now - 60_000, updated_at: at, live_line: line } as never;
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
});
