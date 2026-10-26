import { describe, expect, it, vi } from "vitest";

import type { EnvIssue } from "../../gen/EnvIssue";
import type { EnvironmentStatus } from "../../gen/EnvironmentStatus";
import type { TraceEntry } from "../../gen/TraceEntry";

vi.mock("../store", () => ({ state: { settings: { language: "en" } } }));

const { envIssueLabel, installHint, engineMark, engineLabel } = await import("../labels");
const { matches } = await import("../../components/Trace");
const { matchGoal } = await import("../../components/Palette");

const env = { pi_version: "1.2.0 (abc)", pi_path: "/usr/bin/pi" } as EnvironmentStatus;
const issue = (kind: EnvIssue["kind"]): EnvIssue => ({ kind, blocking: true, text: "Pi 1.2.0 太旧，Tower 需要 1.4.0 或更新的版本。", fix: null });

describe("environment problems", () => {
  it("are worded in the interface language, not the supervisor's", () => {
    expect(envIssueLabel(issue("pi_too_old"), env)).toBe("Pi 1.2.0 is too old; Tower needs 1.4.0 or newer");
    expect(envIssueLabel(issue("pi_missing"), env)).toBe("Pi not found");
  });
  it("fall back to the supervisor's sentence for an unknown kind", () => {
    expect(envIssueLabel({ ...issue("pi_missing"), kind: "something_new" as EnvIssue["kind"] }, env)).toMatch(/太旧/);
  });
  it("know how to install the demo's programs", () => {
    expect(installHint("python3")).toBe("xcode-select --install");
    expect(installHint("node")).toMatch(/brew/);
  });
});

describe("engine names", () => {
  it("have a two-letter mark for tight columns and a full name for the tooltip", () => {
    expect(engineMark("claude-code")).toBe("CC");
    expect(engineMark("pi")).toBe("Pi");
    expect(engineMark("zed")).toBe("ze");
    expect(engineLabel("claude-code")).toBe("Claude Code");
  });
});

describe("trace filter", () => {
  const entry = (kind: string, source: TraceEntry["source"] = "fact") => ({ seq: 1, goal_id: "G", at: 0, source, event: { kind } }) as unknown as TraceEntry;
  it("hides spend ticks from the full view and keeps them under facts", () => {
    expect(matches(entry("cost_updated"), "all")).toBe(false);
    expect(matches(entry("cost_updated"), "facts")).toBe(true);
    expect(matches(entry("criterion_result"), "all")).toBe(true);
  });
});

describe("palette goal matching", () => {
  it("prefers a run inside the title over borrowing the id's letters", () => {
    const m = matchGoal("gwc", "G-0003", "清理购物车计算的边界情况")!;
    expect(m).not.toBeNull();
    // All positions fall in the title part (after "G-0003 ").
    expect(m.positions.every((p) => p >= 7)).toBe(true);
    expect(m.positions).toHaveLength(3);
  });
  it("still finds a goal by its id", () => {
    const m = matchGoal("g3", "G-0003", "清理购物车")!;
    expect(m.positions).toEqual([0, 5]);
  });
});
