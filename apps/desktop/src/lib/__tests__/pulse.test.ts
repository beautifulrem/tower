// @vitest-environment jsdom
import { describe, expect, it } from "vitest";

import type { TraceEntry } from "../../gen/TraceEntry";

const { beat, state } = await import("../store");

type Ev = TraceEntry["event"];
const started = (call_id: string, tool: string) => ({ kind: "tool_started", call_id, tool, summary: "" }) as unknown as Ev;
const ended = (call_id: string, tool: string) => ({ kind: "tool_ended", call_id, tool, is_error: false, summary: "", duration_ms: 1 }) as unknown as Ev;

describe("the pulse", () => {
  // Review 16 (record only): one slot for the tool in flight; when one of two calls ended, the run read as idle (and,
  // two minutes on, silent) while the other still ran.
  it("keeps a run busy while any of its calls is in flight, with the oldest one's name and time", () => {
    beat("G-7", started("a", "read"), 1_000);
    beat("G-7", started("b", "bash"), 2_000);
    expect(state.pulse["G-7"].tool).toEqual({ name: "read", since: 1_000 });
    beat("G-7", ended("a", "read"), 3_000);
    expect(state.pulse["G-7"].tool, "the command still runs").toEqual({ name: "bash", since: 2_000 });
    beat("G-7", ended("b", "bash"), 4_000);
    expect(state.pulse["G-7"].tool).toBeNull();
    expect(state.pulse["G-7"].at).toBe(4_000);
  });
  it("lets go of every call when the run ends", () => {
    beat("G-8", started("a", "bash"), 1_000);
    beat("G-8", { kind: "run_ended", run_no: 1, outcome: "settled" } as unknown as Ev, 2_000);
    expect(state.pulse["G-8"].tool).toBeNull();
    beat("G-8", ended("a", "bash"), 3_000);
    expect(state.pulse["G-8"].tool).toBeNull();
  });
});
