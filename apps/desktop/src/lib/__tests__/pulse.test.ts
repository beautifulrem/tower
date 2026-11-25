// @vitest-environment jsdom
import { describe, expect, it } from "vitest";

import type { TraceEntry } from "../../gen/TraceEntry";

const { beat, state } = await import("../store");

type Ev = TraceEntry["event"];
const started = (call_id: string, tool: string) => ({ kind: "tool_started", call_id, tool, summary: "" }) as unknown as Ev;
const ended = (call_id: string, tool: string) => ({ kind: "tool_ended", call_id, tool, is_error: false, summary: "", duration_ms: 1 }) as unknown as Ev;

describe("the pulse", () => {
  // Review 16 (record only): one slot for the tool in flight; when one of two calls ended, the run read as idle (and,
  // two minutes on, silent) while the other still ran. Review 17: one rule with the supervisor, whose mode and live
  // line follow the newest call still in flight; three calls tell it from the oldest.
  it("keeps a run at work while any of its calls is in flight, on the newest one left", () => {
    beat("G-7", started("a", "read"), 1_000);
    beat("G-7", started("b", "bash"), 2_000);
    beat("G-7", started("c", "ls"), 3_000);
    expect(state.pulse["G-7"].tool).toEqual({ name: "ls", since: 3_000 });
    beat("G-7", ended("c", "ls"), 4_000);
    expect(state.pulse["G-7"].tool, "the command, newest left").toEqual({ name: "bash", since: 2_000 });
    beat("G-7", ended("b", "bash"), 5_000);
    expect(state.pulse["G-7"].tool, "the read still runs").toEqual({ name: "read", since: 1_000 });
    beat("G-7", ended("a", "read"), 6_000);
    expect(state.pulse["G-7"].tool).toBeNull();
    expect(state.pulse["G-7"].at).toBe(6_000);
  });
  it("counts no note, hand-in or question as work, and keeps the calls through an engine's error", () => {
    beat("G-9", started("a", "bash"), 1_000);
    for (const [id, tool] of [["l", "log"], ["s", "submit"], ["q", "ask_user"]]) beat("G-9", started(id, tool), 2_000);
    expect(state.pulse["G-9"].tool).toEqual({ name: "bash", since: 1_000 });
    beat("G-9", { kind: "engine_error", message: "x" } as unknown as Ev, 3_000);
    expect(state.pulse["G-9"].tool, "the supervisor ends no call on an engine error").toEqual({ name: "bash", since: 1_000 });
  });
  it("lets go of every call when the run ends", () => {
    beat("G-8", started("a", "bash"), 1_000);
    beat("G-8", { kind: "run_ended", run_no: 1, outcome: "settled" } as unknown as Ev, 2_000);
    expect(state.pulse["G-8"].tool).toBeNull();
    beat("G-8", ended("a", "bash"), 3_000);
    expect(state.pulse["G-8"].tool).toBeNull();
  });
});
