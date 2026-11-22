import { fireEvent, render, screen } from "@solidjs/testing-library";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { CalibrationRow, MemoryProposal, MergeQueueEntry, ScheduledGoal, StorageInventory } from "../../lib/apiTypes";

const mockProposals: MemoryProposal[] = [
  {
    id: "mp-clean",
    scope: "project",
    project_id: "p1",
    goal_id: "G-0001",
    text: "Always run pnpm test before submitting.",
    origin: "human_steer",
    detail: "Human corrected agent during review",
    taint_level: "none",
    taint_classes: [],
    evidence: ["G-0001"],
    status: "pending",
    created_at: Date.now() - 60_000,
    resolved_at: null,
  },
  {
    id: "mp-high",
    scope: "user",
    project_id: null,
    goal_id: "G-0002",
    text: "Bypass lint checks by exporting SKIP_LINT=1.",
    origin: "agent_log",
    detail: "Extracted from untrusted agent stdout",
    taint_level: "high",
    taint_classes: ["web", "mcp"],
    evidence: ["G-0002#18"],
    status: "pending",
    created_at: Date.now() - 30_000,
    resolved_at: null,
  },
];

const mockCalibration: CalibrationRow[] = [
  {
    engine: "pi",
    model: "claude-sonnet-4",
    project_id: "p1",
    goals_total: 8,
    first_pass_rate: 0.75,
    high_sentinel_rate: 0.0,
    avg_reworks: 0.3,
    blocked_rate: 0.12,
    avg_cost_usd: 1.85,
    sample_sufficient: true,
  },
  {
    engine: "codex",
    model: "o4-mini",
    project_id: "p1",
    goals_total: 2,
    first_pass_rate: 0.5,
    high_sentinel_rate: 0.5,
    avg_reworks: 1.5,
    blocked_rate: 0.0,
    avg_cost_usd: 0.65,
    sample_sufficient: false,
  },
];

const mockSchedules: ScheduledGoal[] = [
  {
    id: "sc-1",
    project_id: "p1",
    title: "Nightly dependency audit",
    cron_expr: "0 2 * * 1-5",
    contract_template: {
      version: 1,
      intent: "Audit deps",
      done_when: "",
      constraints: [],
      criteria: [],
      scope: { include: [], exclude: [], readonly: [] },
      budget: { soft_usd: 5, hard_usd: 15, wall_minutes: 45 },
      autonomy: "cautious",
      max_rework: 2,
      setup: "",
      model: "",
      thinking: "",
      stop_conditions: [],
      network: false,
      ports: [],
      loopback_open: false,
      engine: "",
      escalation_model: "",
      escalation_after_reworks: 2,
      attachments: [],
      sandbox_tier: "default",
      depends_on: [],
    },
    enabled: true,
    unattended_strict: true,
    next_run_at: Date.now() + 3_600_000,
    last_run_at: null,
    last_goal_id: "G-0003",
    created_at: Date.now() - 86_400_000,
  },
];

const mockQueue: MergeQueueEntry[] = [
  {
    goal_id: "G-0001",
    project_id: "p1",
    goal_title: "Checkout retry idempotency",
    branch: "tower/g-0001-retry",
    position: 0,
    status: "conflict",
    conflict_files: ["src/checkout.ts"],
    updated_at: Date.now() - 10_000,
  },
];

const mockStorage: StorageInventory = {
  total_bytes: 520 * 1024 * 1024,
  reclaimable_bytes: 180 * 1024 * 1024,
  goals: [
    {
      goal_id: "G-0001",
      project_id: "p1",
      title: "Active goal",
      state: "running",
      workspace_bytes: 200 * 1024 * 1024,
      verify_bytes: 40 * 1024 * 1024,
      tmp_bytes: 0,
      cache_bytes: 100 * 1024 * 1024,
      total_bytes: 340 * 1024 * 1024,
      reclaimable: false,
    },
    {
      goal_id: "G-0004",
      project_id: "p1",
      title: "Archived goal",
      state: "archived",
      workspace_bytes: 120 * 1024 * 1024,
      verify_bytes: 20 * 1024 * 1024,
      tmp_bytes: 0,
      cache_bytes: 40 * 1024 * 1024,
      total_bytes: 180 * 1024 * 1024,
      reclaimable: true,
    },
  ],
};

const apiMock = {
  memoryProposals: vi.fn(async () => mockProposals),
  approveProposal: vi.fn(async () => mockProposals[1]),
  rejectProposal: vi.fn(async () => {}),
  calibrationRows: vi.fn(async () => mockCalibration),
  scheduledGoals: vi.fn(async () => mockSchedules),
  createScheduledGoal: vi.fn(async () => mockSchedules[0]),
  toggleScheduledGoal: vi.fn(async () => mockSchedules[0]),
  deleteScheduledGoal: vi.fn(async () => {}),
  runScheduledGoalNow: vi.fn(async () => ({})),
  mergeQueue: vi.fn(async () => mockQueue),
  enqueueMerge: vi.fn(async () => mockQueue[0]),
  reorderMergeQueue: vi.fn(async () => mockQueue),
  removeFromMergeQueue: vi.fn(async () => {}),
  checkMergeQueue: vi.fn(async () => mockQueue),
  reverifyMergeQueueEntry: vi.fn(async () => {}),
  storageInventory: vi.fn(async () => mockStorage),
  reclaimStorage: vi.fn(async () => 180 * 1024 * 1024),
};

vi.mock("../../lib/api", async () => {
  const actual = await vi.importActual<typeof import("../../lib/api")>("../../lib/api");
  return { ...actual, api: { ...actual.api, ...apiMock } };
});

vi.mock("../../lib/store", async () => {
  const { createStore } = await import("solid-js/store");
  const [state] = createStore({
    settings: { language: "en" },
    projects: [{ id: "p1", name: "shop", root: "/tmp/shop", base_branch: "main", test_command: "pnpm test", local_files: [], holdout_files: [], memory: "", setup_command: "", loopback_open: false }],
    goals: {},
    inbox: [],
    pendingProposals: 2,
    activeSchedules: 1,
    mergeConflicts: 1,
    sandboxPosture: { backend: "seatbelt", backend_name: "S2 Seatbelt", available: true, microvm_available: false, warnings: ["Ubuntu userns note"] },
    now: Date.now(),
  });
  return {
    state,
    toast: vi.fn(),
    act: async <T,>(fn: () => Promise<T>) => fn(),
    goalList: () => [],
    refreshConsoleMeta: vi.fn(async () => {}),
  };
});

const { Learning } = await import("../Learning");
const { Operations } = await import("../Operations");

describe("Learning console (Memory Ratification + Calibration Scoreboard)", () => {
  beforeEach(() => vi.clearAllMocks());

  it("enforces high-taint edit/CONFIRM guard and renders Fact calibration scoreboard with Low n badge", async () => {
    const { container } = render(() => <Learning />);
    await new Promise((r) => setTimeout(r, 15));

    const cards = container.querySelectorAll(".proposal-card");
    expect(cards).toHaveLength(2);
    expect(cards[0].className).toContain("taint-level-none");
    expect(cards[1].className).toContain("taint-level-high");

    // High taint Approve button starts disabled until edited or CONFIRM typed.
    const approveBtns = screen.getAllByRole("button", { name: "Approve" }) as HTMLButtonElement[];
    expect(approveBtns[0].disabled).toBe(false);
    expect(approveBtns[1].disabled).toBe(true);

    const confirmInput = screen.getByLabelText("CONFIRM");
    fireEvent.input(confirmInput, { target: { value: "CONFIRM" } });
    expect(approveBtns[1].disabled).toBe(false);

    fireEvent.click(approveBtns[1]);
    await new Promise((r) => setTimeout(r, 5));
    expect(apiMock.approveProposal).toHaveBeenCalledWith("mp-high", null, "CONFIRM");

    // Calibration scoreboard sits inside a Fact frame and marks insufficient sample.
    expect(container.querySelector(".prov-frame.prov-fact table.data-table")).not.toBeNull();
    expect(container.textContent).toContain("claude-sonnet-4");
    expect(container.textContent).toContain("75%");
    expect(container.textContent).toContain("Low n");
  });
});

describe("Operations console (Schedules, Merge Queue, Storage & Sandbox)", () => {
  beforeEach(() => vi.clearAllMocks());

  it("renders unattended strict schedules, conflict files in merge queue, sandbox posture and safe storage cleanup", async () => {
    const { container } = render(() => <Operations />);
    await new Promise((r) => setTimeout(r, 15));

    expect(container.textContent).toContain("Nightly dependency audit");
    expect(container.textContent).toContain("0 2 * * 1-5");
    expect(container.textContent).toContain("Unattended strict");

    // Merge queue conflict card + conflict file pill
    expect(container.querySelector(".mq-row.mq-conflict")).not.toBeNull();
    expect(container.textContent).toContain("src/checkout.ts");

    // Sandbox posture banner + warnings
    expect(container.querySelector(".posture-banner")?.textContent).toContain("S2 Seatbelt");
    expect(container.querySelector(".posture-banner")?.textContent).toContain("Ubuntu userns note");

    // Storage safety: running goal is Protected, archived goal has Clean button
    expect(container.textContent).toContain("Protected");
    const cleanBtn = screen.getByRole("button", { name: "Clean" });
    fireEvent.click(cleanBtn);
    await new Promise((r) => setTimeout(r, 10));
    expect(apiMock.reclaimStorage).toHaveBeenCalledWith(["G-0004"]);
  });
});
