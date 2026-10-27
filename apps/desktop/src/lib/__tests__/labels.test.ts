import { describe, expect, it, vi } from "vitest";

import type { EnvIssue } from "../../gen/EnvIssue";
import type { EnvironmentStatus } from "../../gen/EnvironmentStatus";
import type { TraceEntry } from "../../gen/TraceEntry";

vi.mock("../store", () => ({ state: { settings: { language: "en" } } }));

const { envIssueLabel, envGauges, installHint, engineLabel } = await import("../labels");
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

describe("the environment gauge strip", () => {
  const full = { pi_version: "1.4.2 (abc)", pi_path: "/opt/homebrew/bin/pi", git_version: "git version 2.56.0", data_dir: "/x", issues: [] as EnvIssue[], min_pi_version: "1.4.0" } as EnvironmentStatus;
  const with_ = (...kinds: EnvIssue["kind"][]) => ({ ...full, issues: kinds.map((k) => ({ ...issue(k), blocking: false })) }) as EnvironmentStatus;
  const reading = (env: EnvironmentStatus, engine = "pi") => envGauges(env, engine).map((g) => `${g.label} ${g.mark} ${g.value}`);

  it("reads Pi's version, git's version without its prefix, the sandbox and the identity, each with a quiet check", () => {
    expect(reading(full)).toEqual(["Pi ok 1.4.2", "git ok 2.56.0", "Sandbox ok on", "Identity ok set"]);
    expect(envGauges(full, "pi")[0].title).toBe("/opt/homebrew/bin/pi");
  });
  it("carries each problem's own mark: ■ for a broken engine, ◆ for a missing identity, ◇ for no sandbox", () => {
    expect(reading(with_("git_identity_missing", "no_sandbox"))).toEqual(["Pi ok 1.4.2", "git ok 2.56.0", "Sandbox notice none", "Identity notice not set"]);
    expect(reading(with_("pi_too_old"))[0]).toBe("Pi danger 1.4.2");
    expect(reading({ ...full, pi_version: null, pi_path: null } as EnvironmentStatus)[0]).toBe("Pi danger Not found");
    expect(reading({ ...full, pi_version: null } as EnvironmentStatus)[0]).toBe("Pi danger can't run");
  });
  it("reads the chosen engine: Claude Code in Pi's place, and no identity gauge without git", () => {
    expect(reading(full, "claude-code")[0]).toBe("Claude Code ok ready");
    expect(reading(with_("claude_missing"), "claude-code")[0]).toBe("Claude Code danger Not found");
    expect(reading({ ...full, git_version: null } as EnvironmentStatus)).toEqual(["Pi ok 1.4.2", "git danger Not found", "Sandbox ok on"]);
    expect(envGauges(null, "pi")).toEqual([]);
  });
});

describe("engine names", () => {
  it("are said in words, everywhere: no two-letter marks", () => {
    expect(engineLabel("claude-code")).toBe("Claude Code");
    expect(engineLabel("pi")).toBe("Pi");
    expect(engineLabel("zed")).toBe("zed");
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
