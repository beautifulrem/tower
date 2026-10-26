import { describe, expect, it, vi } from "vitest";

import type { InboxItem } from "../../gen/InboxItem";

vi.mock("../store", () => ({ state: { settings: { language: "en" } } }));

const { heartbeatState, groupOf, modelsFor, effectiveEngine } = await import("../labels");
const { bodyParts, tomorrowAt9 } = await import("../../components/DecisionCard");

describe("heartbeat", () => {
  it("is fine within 30 s, quiet to two minutes, silent after", () => {
    expect(heartbeatState(5_000, false)).toBe("fine");
    expect(heartbeatState(60_000, false)).toBe("quiet");
    expect(heartbeatState(200_000, false)).toBe("silent");
  });
  it("is never silent while a tool call is still running", () => {
    expect(heartbeatState(200_000, true)).toBe("busy");
    expect(heartbeatState(5_000, true)).toBe("fine");
  });
});

describe("groups", () => {
  const goal = (over: Record<string, unknown>) => ({ id: "G-1", state: "running", needs_you: 0, ...over }) as never;
  it("keep the verification line apart from what is ready to accept", () => {
    expect(groupOf(goal({ state: "verifying" }))).toBe("verifying");
    expect(groupOf(goal({ state: "claimed" }))).toBe("verifying");
    expect(groupOf(goal({ state: "in_review" }))).toBe("review");
  });
  it("count a goal as needing you exactly when a blocking card does", () => {
    expect(groupOf(goal({ state: "in_review", needs_you: 2 }), new Set(["G-1"]))).toBe("needs_you");
    expect(groupOf(goal({ state: "in_review", needs_you: 1 }), new Set())).toBe("review");
    expect(groupOf(goal({ state: "running", needs_you: 1 }))).toBe("needs_you");
  });
});

describe("engines", () => {
  const models = [{ provider: "anthropic", id: "x" }, { provider: "claude-code", id: "opus" }];
  it("filter the model list by engine", () => {
    expect(modelsFor(models, "claude-code").map((m) => m.id)).toEqual(["opus"]);
    expect(modelsFor(models, "pi").map((m) => m.id)).toEqual(["x"]);
  });
  it("fall back to the settings default, then Pi", () => {
    expect(effectiveEngine("", "claude-code")).toBe("claude-code");
    expect(effectiveEngine("pi", "claude-code")).toBe("pi");
    expect(effectiveEngine("", undefined)).toBe("pi");
  });
});

describe("decision card body", () => {
  const item = (kind: InboxItem["kind"], subject: string, body: string) => ({ kind, subject, body }) as InboxItem;
  it("drops an assumption's body when it repeats the subject", () => {
    expect(bodyParts(item("assumption", "quantities are 1", "quantities are 1"))).toEqual({ prose: "", tail: "" });
  });
  it("splits the supervisor's prose from the installer's tail", () => {
    const parts = bodyParts(item("paused", "deps", "The agent changed package.json. Setup failed offline.\nnpm ERR! code ENOTFOUND\nnpm ERR! network"));
    expect(parts.prose).toBe("The agent changed package.json. Setup failed offline.");
    expect(parts.tail).toBe("npm ERR! code ENOTFOUND\nnpm ERR! network");
  });
  it("keeps prose as prose and a command as machine text", () => {
    expect(bodyParts(item("ci_failed", "test (node 22)", "You can send the failing check to the agent."))).toEqual({ prose: "You can send the failing check to the agent.", tail: "" });
    expect(bodyParts(item("approval", "run a command", "rm -rf dist")).tail).toBe("rm -rf dist");
    expect(bodyParts(item("paused", "deps", "package.json\npnpm-lock.yaml")).tail).toBe("package.json\npnpm-lock.yaml");
  });
});

describe("snooze", () => {
  it("picks tomorrow at nine", () => {
    const d = new Date(tomorrowAt9(new Date(2026, 9, 27, 15, 30)));
    expect([d.getDate(), d.getHours(), d.getMinutes()]).toEqual([28, 9, 0]);
  });
});
