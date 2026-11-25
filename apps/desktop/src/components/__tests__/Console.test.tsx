import { fireEvent, render, screen } from "@solidjs/testing-library";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { GoalSummary } from "../../gen/GoalSummary";
import type { InboxItem } from "../../gen/InboxItem";
import type { TraceEntry } from "../../gen/TraceEntry";
import type { GoalDetailExt, GoalSummaryExt, LookViewExt } from "../../lib/apiTypes";
import { invoked } from "../../test/setup";

const mockSummary: GoalSummaryExt = {
    id: "G-0001",
    project_id: "p1",
    project_name: "shop",
    title: "Fix retry idempotency",
    state: "running",
    mode: "editing",
    pause_reason: null,
    live_line: { mode: "editing", action: "run", target: "pnpm test", at: Date.now() - 10_000 },
    run_no: 2,
    rework_cycles: 1,
    max_rework: 3,
    cost_usd: 1.4,
    budget: { soft_usd: 5, hard_usd: 15, wall_minutes: 45 },
    progress: { verified: 1, observed: 1, machine: 2, human: 0, human_done: 0 },
    diffstat: { files: 3, additions: 42, deletions: 10 },
    overlaps: [{ goal_id: "G-0002", title: "Cart refactor", files: ["src/cart.ts"], total: 1 }],
    needs_you: 0,
    branch: "tower/g-0001-retry",
    pr: null,
    verified_pin: null,
    created_at: Date.now() - 120_000,
    updated_at: Date.now() - 10_000,
    run_started_at: Date.now() - 60_000,
    last_viewed_at: null,
    engine: "pi",
    sandbox_tier: "micro_vm",
    port_base: 20010,
    depends_on: [],
};

const mockGoalDetail = {
  summary: mockSummary,
  contract: {
    version: 1,
    intent: "Ensure idempotent checkout retries",
    done_when: "",
    constraints: [],
    criteria: [],
    scope: { include: [], exclude: [], readonly: [] },
    budget: { soft_usd: 5, hard_usd: 15, wall_minutes: 45 },
    autonomy: "standard",
    max_rework: 3,
    setup: "",
    model: "",
    thinking: "",
    stop_conditions: [],
    network: false,
    ports: [],
    loopback_open: false,
    engine: "pi",
  },
  criteria: [
    {
      criterion: { id: "C1", title: "Unit tests pass", kind: { type: "exec", command: "pnpm test", timeout_secs: 60 } },
      verified: {
        pin: "abc123456",
        passed: true,
        exit_code: 0,
        duration_ms: 900,
        output_tail: "",
        at: Date.now(),
        stale: false,
        held_out: false,
        held_out_proof: null,
        flaky: true,
      } as GoalDetailExt["criteria"][number]["verified"],
      passed_on_base: false,
      base_error: null,
      look: null,
      passes_with_source_only: true,
      canary: "intact",
      observed: null,
      human_checked: false,
    },
  ],
  claims: [
    {
      id: "cl-1",
      at: Date.now() - 5000,
      run_no: 2,
      criterion: null,
      kind: "next",
      text: "Add retry token check to checkout handler",
      approved: null,
      consistency: "consistent",
      evidence: null,
    },
  ],
  sentinels: [],
  runs: [],
  inbox: [],
  pin: "deadbeef1234",
  submit_summary: null,
  workspace_exists: true,
  branch_preview: "tower/g-0001-retry",
  human_edited: false,
  rolled_back: false,
  can_undo_rollback: false,
  escalated_model: "claude-opus-4",
} as unknown as GoalDetailExt;

vi.mock("../../lib/api", async () => {
  const actual = await vi.importActual<typeof import("../../lib/api")>("../../lib/api");
  return {
    ...actual,
    api: {
      ...actual.api,
      goal: vi.fn(async () => mockGoalDetail),
      lookImage: vi.fn(async (file: string) => `data:image/png;base64,${btoa(file)}`),
      pause: vi.fn(async () => {}),
      resume: vi.fn(async () => {}),
    },
  };
});

vi.mock("../../lib/store", async () => {
  const { createStore } = await import("solid-js/store");
  const g1 = mockGoalDetail.summary as GoalSummary;
  const gBlocked: GoalSummary = {
    ...g1,
    id: "G-0009",
    state: "paused",
    pause_reason: "agent_reported_blocked" as GoalSummary["pause_reason"],
  };
  const [state, setState] = createStore({
    settings: { language: "en", max_concurrent: 4, engine: "pi", remote_enabled: true, muted_goals: [] as string[], quiet_until: null },
    env: { pi_version: "1.0.0", pi_path: "/opt/bin/pi", issues: [] },
    goals: { "G-0001": g1, "G-0009": gBlocked } as Record<string, GoalSummary>,
    inbox: [
      {
        id: "I-blk",
        goal_id: "G-0009",
        goal_title: "Migrate legacy billing",
        kind: "paused",
        title: "Paused",
        subject: "Agent reported blocked",
        body: "Cannot reach upstream schema without migration credentials.",
        options: ["Resume"],
        tones: ["primary"],
        allow_text: true,
        created_at: Date.now() - 10_000,
        urgency: 1,
        snoozed_until: null,
      },
    ] as InboxItem[],
    pulse: {},
    unseenActivity: 0,
    remoteProblem: null,
    sandboxPosture: { backend: "seatbelt", backend_name: "S2 Seatbelt", available: true, microvm_available: true, warnings: [] },
    engines: [{ id: "pi", label: "Pi", trust_tier: "full_s2", installed: true, available: true, note: "" }],
    now: Date.now(),
  });
  return {
    state,
    __setState: setState,
    toast: vi.fn(),
    act: async <T,>(fn: () => Promise<T>) => fn(),
    goalList: () => Object.values(state.goals),
    livenessOf: () => ({ at: Date.now() - 5000, tool: null }),
    quietNow: () => false,
    quietUntil: () => null,
    patchSettings: vi.fn(),
  };
});

const { ProvenanceFrame, TrustPill, TaintPill } = await import("../ProvenanceFrame");
const { TelemetryStrip } = await import("../TelemetryStrip");
const { LookStrip } = await import("../Look");
const { matches } = await import("../Trace");
const { DecisionCard } = await import("../DecisionCard");
const { PeekDrawer } = await import("../PeekDrawer");

describe("Four-Provenance physical frames & pills", () => {
  it("renders distinct physical classes for Fact, Observation, Claim and Human", () => {
    const f = render(() => <ProvenanceFrame kind="fact" verified>Verified output</ProvenanceFrame>);
    expect(f.container.querySelector(".prov-frame.prov-fact.prov-verified")).not.toBeNull();
    expect(f.container.textContent).toContain("Measured by Tower");

    const o = render(() => <ProvenanceFrame kind="observation">Observed in sandbox</ProvenanceFrame>);
    expect(o.container.querySelector(".prov-frame.prov-observation")).not.toBeNull();

    const c = render(() => <ProvenanceFrame kind="claim">Agent claims done</ProvenanceFrame>);
    expect(c.container.querySelector(".prov-frame.prov-claim")).not.toBeNull();
    expect(c.container.querySelector(".prov-verified")).toBeNull();

    const h = render(() => <ProvenanceFrame kind="human">Human rule</ProvenanceFrame>);
    expect(h.container.querySelector(".prov-frame.prov-human")).not.toBeNull();
  });

  it("renders TrustPill and TaintPill", () => {
    const { container } = render(() => (
      <>
        <TrustPill tier="full_s2" label="Full S2" />
        <TrustPill tier="restricted_s2" label="Restricted S2" />
        <TrustPill tier="experimental" label="Experimental" />
        <TaintPill level="high" label="Taint: high" />
      </>
    ));
    expect(container.querySelector(".trust-pill.trust-full")).not.toBeNull();
    expect(container.querySelector(".trust-pill.trust-restricted")).not.toBeNull();
    expect(container.querySelector(".trust-pill.trust-experimental")).not.toBeNull();
    expect(container.querySelector(".taint-pill.taint-high")).not.toBeNull();
  });
});

describe("TelemetryStrip", () => {
  it("renders the turning runs mark, borderless blocking Needs-You count and sandbox posture", () => {
    const { container } = render(() => <TelemetryStrip />);
    expect(container.querySelector(".gauge-runs")).not.toBeNull();
    expect(container.querySelector(".gauge-active")?.textContent).toContain("1/4 running");
    expect(container.querySelector(".tel-blocking")?.textContent).toContain("1");
    expect(container.querySelector(".gauge-sandbox")?.textContent).toContain("S2 Seatbelt");
    expect(container.querySelector(".gauge-sandbox.warn")).toBeNull();
    expect(container.querySelector(".gauge-phone-ok")).not.toBeNull();
  });

  it("says the sandbox is off in ink with the uncoloured hint mark, never the amber ! (review 15: S0 is no decision of yours)", async () => {
    const set = ((await import("../../lib/store")) as unknown as { __setState: (k: string, v: unknown) => void }).__setState;
    set("env", { pi_version: "1.0.0", pi_path: "/opt/bin/pi", issues: [{ kind: "no_sandbox", blocking: false, text: "", fix: null }] });
    set("sandboxPosture", null);
    try {
      const { container } = render(() => <TelemetryStrip />);
      const gauge = container.querySelector(".gauge-sandbox.warn")!;
      expect(gauge.textContent).toContain("No sandbox");
      expect(gauge.querySelector("svg.mark-notice")).not.toBeNull();
      expect(gauge.querySelector(".mark-attention")).toBeNull();
    } finally {
      set("env", { pi_version: "1.0.0", pi_path: "/opt/bin/pi", issues: [] });
      set("sandboxPosture", { backend: "seatbelt", backend_name: "S2 Seatbelt", available: true, microvm_available: true, warnings: [] });
    }
  });

  it("says unseen errors with the mark family's red ×, not a red dot (review 14: the title bar mixed the two)", async () => {
    const set = ((await import("../../lib/store")) as unknown as { __setState: (k: string, v: number) => void }).__setState;
    set("unseenActivity", 2);
    try {
      const { container } = render(() => <TelemetryStrip />);
      expect(container.querySelector(".gauge-errors svg.mark-danger")).not.toBeNull();
      expect(container.querySelector(".gauge-errors .gauge-dot")).toBeNull();
    } finally {
      set("unseenActivity", 0);
    }
  });
});

describe("LookStrip visual evidence upgrades", () => {
  it("renders browser console error Facts and switches desktop/mobile viewports", async () => {
    const look: LookViewExt = {
      base: "base-desktop.png",
      pin: "pin-desktop.png",
      base_error: null,
      pin_error: null,
      mobile_base: "base-mobile.png",
      mobile_pin: "pin-mobile.png",
      console_errors: ["Uncaught TypeError: cannot read property 'total' of undefined"],
    };
    const { container } = render(() => <LookStrip look={look} title="Checkout layout" />);
    expect(container.querySelector(".prov-frame.prov-fact.prov-danger")?.textContent).toContain("1 browser console error");
    expect(container.textContent).toContain("Uncaught TypeError");
    const mobileTab = screen.getByRole("tab", { name: "Mobile" });
    fireEvent.click(mobileTab);
    expect(mobileTab.getAttribute("aria-selected")).toBe("true");
  });
});

describe("Flight Recorder trace filters", () => {
  const mk = (event: unknown, source: TraceEntry["source"] = "fact"): TraceEntry =>
    ({ seq: 1, at: Date.now(), source, event }) as TraceEntry;

  it("classifies sandbox denials, model escalations, blocked exits and flaky runs cleanly", () => {
    const deniedTool = mk({ kind: "tool_ended", call_id: "1", tool: "bash", duration_ms: 10, is_error: false, denied: true });
    const escalated = mk({ kind: "model_escalated", from_model: "sonnet", to_model: "opus", rework_cycle: 2 });
    const blocked = mk({ kind: "agent_blocked", reason: "Missing API key" }, "claim");
    const flaky = mk({ kind: "criterion_flaky", criterion: "C1", pin: "abcdef12" });

    expect(matches(deniedTool, "anomalies")).toBe(true);
    expect(matches(flaky, "anomalies")).toBe(true);
    expect(matches(blocked, "anomalies")).toBe(true);
    expect(matches(blocked, "decisions")).toBe(true);
    expect(matches(escalated, "injections")).toBe(true);
    expect(matches(escalated, "anomalies")).toBe(false);
  });
});

describe("DecisionCard provenance framing", () => {
  beforeEach(() => invoked.splice(0));

  it("wraps agent_reported_blocked prose inside a Claim provenance frame", () => {
    const blockedCard: InboxItem = {
      id: "I-blk",
      goal_id: "G-0009",
      goal_title: "Migrate legacy billing",
      kind: "paused",
      title: "Paused",
      subject: "Agent reported blocked",
      body: "Cannot reach upstream schema without migration credentials.",
      options: ["Resume"],
      tones: ["primary"],
      allow_text: true,
      created_at: Date.now() - 10_000,
      urgency: 1,
      snoozed_until: null,
    };
    const { container } = render(() => <DecisionCard item={blockedCard} />);
    const claimFrame = container.querySelector(".prov-frame.prov-claim");
    expect(claimFrame).not.toBeNull();
    expect(claimFrame!.textContent).toContain("Agent claims blocked");
    expect(claimFrame!.textContent).toContain("migration credentials");
  });
});

describe("PeekDrawer quick telemetry", () => {
  it("renders live telemetry, flaky criterion + hanging claim without L1/L2/L3 spec tags, and closes on button click", async () => {
    const onClose = vi.fn();
    const { container } = render(() => <PeekDrawer goalId="G-0001" onClose={onClose} />);
    await new Promise((r) => setTimeout(r, 10));
    expect(container.querySelector(".peek-title")?.textContent).toBe("Fix retry idempotency");
    expect(container.querySelector(".peek-level")).toBeNull();
    expect(container.textContent).toContain("MicroVM");
    expect(container.textContent).toContain(":20010");
    expect(container.textContent).toContain("claude-opus-4");
    expect(container.textContent).toContain("Flaky");
    expect(container.textContent).toContain("Add retry token check");
    expect(container.textContent).toContain("@deadbee");
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
