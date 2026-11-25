import { fireEvent, render, screen, waitFor } from "@solidjs/testing-library";
import { describe, expect, it, vi } from "vitest";

vi.mock("../../../lib/store", async () => {
  const { createStore } = await import("solid-js/store");
  const [state] = createStore({
    settings: { language: "en", muted_goals: [] as string[], default_model: "" },
    goals: {},
    inbox: [],
    env: { issues: [] },
    now: Date.now(),
  });
  return { state, toast: vi.fn(), act: async <T,>(fn: () => Promise<T>) => fn() };
});

const { CriterionRow } = await import("../CriterionRow");
const { SteerBox, atTokenAt } = await import("../SteerBox");
const { GoalBlocks } = await import("../GoalBlocks");

describe("CriterionRow Six-Step Verification Bench Readout", () => {
  it("renders Base→Pin, Canary, Guard gap, Flaky, Loopback, Bypass, and Held-Out per-file proof", () => {
    const criterion = {
      criterion: { id: "C1", title: "Checkout tests", kind: { type: "exec" as const, command: "pnpm test", timeout_secs: 60 } },
      verified: {
        pin: "abcdef1234567",
        passed: true,
        exit_code: 0,
        duration_ms: 420,
        output_tail: "ok",
        at: Date.now() - 5000,
        stale: false,
        held_out: true,
        held_out_proof: {
          ran: ["holdout/rounding.test.js"],
          not_ran: ["holdout/tax.test.js"],
          unprovable: [],
        },
        flaky: true,
        console_errors: [],
      },
      passed_on_base: false,
      base_error: null,
      look: null,
      passes_with_source_only: true,
      canary: "intact" as const,
      loopback_opened: "base",
      observed: null,
      human_checked: false,
    };

    render(() => (
      <CriterionRow
        goalId="G-0001"
        c={criterion}
        state="in_review"
        base="1111111"
        sentinels={[
          { sentinel: "assertion_guard_gap", severity: 3, title: "Multi-process guard gap", detail: "C1: 1 of 2 processes did not report" },
          { sentinel: "bypass_around_bug", severity: 3, title: "Bypass-around-bug detected", detail: "src/cart.ts:12" },
        ]}
      />
    ));

    // Folded: the verdict and one line of what qualifies it — warnings only, and a pass wears no danger red.
    const strip = () => document.querySelector(".ev-strip")!;
    expect(screen.getByText("assertions not checked")).toBeTruthy();
    expect(screen.getByText("works around the bug")).toBeTruthy();
    expect(screen.getByText("held-out tests: 1 of 2 ran, for you only")).toBeTruthy();
    expect(screen.getByText("flaky: passed on rerun")).toBeTruthy();
    expect(strip().querySelector(".ev-pill-danger")).toBeNull();
    expect(screen.queryByText("passes from the code alone")).toBeNull();
    expect(screen.queryByText(/✓ holdout\/rounding\.test\.js/)).toBeNull();
    // Open: every reading, each once — a fact a sentence line says in full is not also a pill.
    fireEvent.click(screen.getByText("passed"));
    expect(screen.getByText("passes from the code alone")).toBeTruthy();
    expect(screen.getByText("assertions not checked")).toBeTruthy();
    expect(screen.getByText("red → green")).toBeTruthy();
    expect(screen.getByText("must-fail tests failed, as they must")).toBeTruthy();
    expect(screen.queryByText("must-fail tests failed")).toBeNull();
    expect(screen.getByText(/✓ holdout\/rounding\.test\.js/)).toBeTruthy();
    expect(screen.getByText(/✕ holdout\/tax\.test\.js/)).toBeTruthy();
  });

  it("does not attribute another criterion's sentinel to an unrelated criterion", () => {
    const criterion = {
      criterion: { id: "C1", title: "Checkout tests", kind: { type: "exec" as const, command: "pnpm test", timeout_secs: 60 } },
      verified: { pin: "abcdef1234567", passed: true, exit_code: 0, duration_ms: 420, output_tail: "ok", at: Date.now() - 5000, stale: false, held_out: false, held_out_proof: null, console_errors: [] },
      passed_on_base: false,
      base_error: null,
      look: null,
      passes_with_source_only: true,
      canary: "intact" as const,
      loopback_opened: undefined,
      observed: null,
      human_checked: false,
    };
    render(() => (
      <CriterionRow
        goalId="G-0001"
        c={criterion}
        state="in_review"
        base="1111111"
        sentinels={[{ sentinel: "assertion_guard_incomplete", severity: 3, title: "Guard gap", detail: "C2: worker exited early" }]}
      />
    ));
    fireEvent.click(screen.getByText("passed"));
    expect(screen.getByText("assertions untouched")).toBeTruthy();
    expect(screen.queryByText("assertions not checked")).toBeNull();
  });

  // Review 9, R9-P3-04: the supervisor qualifies a pass when code reaches into the test runner (source_touches_tests,
  // runner_patched, source_patches_tests); the row says that caveat, and never "assertions untouched" beside it.
  // Review 10, R10-P3-04: a caveat is one pill, in the seal's words and the neutral tone, whichever finding raised it; a
  // high finding holds the pass (named for what was done; amber on a passing row, as every danger there); another finding
  // is amber, in its own words.
  for (const [sentinel, severity, said, tone] of [
    ["source_touches_tests", 2, "code reaches into the test runner", "obs"],
    ["runner_patched", 2, "code reaches into the test runner", "obs"],
    ["source_patches_tests", 2, "code reaches into the test runner", "obs"],
    ["source_patches_tests", 3, "runner patched", "attn"],
    ["assertion_identity_unchecked", 2, "assertions not checked", "obs"],
    ["assertions_removed", 2, "assertions weakened", "attn"],
  ] as const)
    it(`says ${sentinel} (severity ${severity}) as the ${tone} pill it is, never "assertions untouched"`, () => {
      const criterion = {
        criterion: { id: "C1", title: "Checkout tests", kind: { type: "exec" as const, command: "pnpm test", timeout_secs: 60 } },
        verified: { pin: "abcdef1234567", passed: true, exit_code: 0, duration_ms: 420, output_tail: "ok", at: Date.now() - 5000, stale: false, held_out: false, held_out_proof: null, console_errors: [] },
        passed_on_base: false,
        base_error: null,
        look: null,
        passes_with_source_only: true,
        canary: "intact" as const,
        loopback_opened: undefined,
        observed: null,
        human_checked: false,
      };
      render(() => (
        <CriterionRow goalId="G-0001" c={criterion} state="in_review" base="1111111" sentinels={[{ sentinel, severity, title: "Test machinery", detail: "src/cart.js: require('node:assert')" }]} />
      ));
      fireEvent.click(screen.getByText("passed"));
      const pills = screen.getAllByText(said).filter((e) => e.classList.contains("ev-pill"));
      expect(pills).toHaveLength(1);
      expect(pills[0].dataset.mark).toBe(tone);
      expect(screen.queryByText("assertions untouched")).toBeNull();
    });

  // Review 11, R11-P3-02: each family was said by its first finding, so a low one listed first hid the high one that held
  // the pass; and a low finding kept the neutral caveat pill beside a pass a high finding held, which no caveat qualifies.
  for (const [name, sentinels, said, gone] of [
    ["a low guard finding listed before a high one", [["assertion_identity_unchecked", 2], ["assertions_removed", 3]], ["assertions weakened"], ["assertions not checked"]],
    ["a low machinery finding beside a high bypass", [["source_touches_tests", 2], ["bypass_around_bug", 3]], ["code reaches into the test runner", "works around the bug"], []],
  ] as const)
    it(`says ${name} by the weightiest finding, and no neutral caveat beside the held pass`, () => {
      const criterion = {
        criterion: { id: "C1", title: "Checkout tests", kind: { type: "exec" as const, command: "pnpm test", timeout_secs: 60 } },
        verified: { pin: "abcdef1234567", passed: true, exit_code: 0, duration_ms: 420, output_tail: "ok", at: Date.now() - 5000, stale: false, held_out: false, held_out_proof: null, flaky: true, console_errors: [] },
        passed_on_base: false,
        base_error: null,
        look: null,
        passes_with_source_only: true,
        canary: "intact" as const,
        loopback_opened: undefined,
        observed: null,
        human_checked: false,
      };
      render(() => (
        <CriterionRow
          goalId="G-0001"
          c={criterion}
          state="in_review"
          base="1111111"
          sentinels={sentinels.map(([sentinel, severity]) => ({ sentinel, severity, title: "Finding", detail: "src/cart.js" }))}
        />
      ));
      fireEvent.click(screen.getByText("passed"));
      const pills = [...document.querySelectorAll<HTMLElement>(".ev-pill")];
      for (const s of said) expect(pills.filter((p) => p.textContent === s).map((p) => p.dataset.mark), s).toEqual(["attn"]);
      for (const s of gone) expect(pills.some((p) => p.textContent === s), s).toBe(false);
      // Not one pill in the caveat's neutral tone, the flaky rerun included: the pass is held, not counted with caveats.
      expect(pills.filter((p) => p.dataset.mark === "obs").map((p) => p.textContent)).toEqual([]);
      expect(screen.queryByText("assertions untouched")).toBeNull();
    });
});

describe("SteerBox Multimodal Steering Console", () => {
  it("parses @file tokens at caret and autocompletes workspace files", () => {
    expect(atTokenAt("check @src/ca", 13)).toEqual({ start: 6, query: "src/ca" });
    expect(atTokenAt("email a@b.com", 13)).toBeNull();

    render(() => <SteerBox id="G-0001" running={true} files={["src/cart.ts", "src/pricing.ts"]} />);
    const ta = screen.getByLabelText("Steering directive") as HTMLTextAreaElement;
    fireEvent.input(ta, { target: { value: "fix @car" } });
    ta.setSelectionRange(8, 8);
    fireEvent.input(ta, { target: { value: "fix @car" } });
    expect(screen.getByRole("option", { name: /src\/cart\.ts/ })).toBeTruthy();
    fireEvent.keyDown(ta, { key: "Enter" });
    expect(ta.value).toContain("@src/cart.ts ");
  });

  it("supports switching between Steer now and Queue for next turn", async () => {
    const { invoked } = await import("../../../test/setup");
    render(() => <SteerBox id="G-0001" running={true} files={[]} />);
    const queueTab = screen.getByRole("tab", { name: "Queue for next turn" });
    fireEvent.click(queueTab);
    expect(queueTab.getAttribute("aria-selected")).toBe("true");

    const ta = screen.getByLabelText("Steering directive") as HTMLTextAreaElement;
    fireEvent.input(ta, { target: { value: "Keep Money type" } });
    const before = invoked.length;
    fireEvent.click(screen.getByRole("button", { name: /^Queue\b/ }));
    await waitFor(() => expect(invoked.length).toBeGreaterThan(before));
    expect(invoked.at(-1)).toEqual({ cmd: "steer", args: { id: "G-0001", text: "Keep Money type", queue: true } });
  });
});

describe("GoalBlocks Claim vs Fact Honesty Ledger", () => {
  it("renders Agent claims and Harness facts in separate physical columns", () => {
    const d = {
      summary: {
        id: "G-0001",
        project_id: "p1",
        project_name: "shop",
        title: "Fix cart",
        state: "in_review",
        pause_reason: null,
        mode: "idle",
        live_line: null,
        progress: { verified: 1, observed: 1, machine: 1, human: 0, human_done: 0 },
        diffstat: { files: 1, additions: 4, deletions: 2 },
        cost_usd: 1.2,
        budget: { soft_usd: 5, hard_usd: 8, wall_minutes: 90 },
        run_no: 1,
        rework_cycles: 0,
        max_rework: 3,
        needs_you: 0,
        verified_pin: "abcdef123",
        branch: null,
        created_at: 0,
        updated_at: 0,
        run_started_at: null,
        last_viewed_at: null,
        overlaps: [],
        pr: null,
        engine: "pi",
      },
      contract: {
        version: 1,
        intent: "Fix cart",
        done_when: "",
        constraints: [],
        criteria: [],
        scope: { include: [], exclude: [], readonly: [] },
        budget: { soft_usd: 5, hard_usd: 8, wall_minutes: 90 },
        autonomy: "standard",
        max_rework: 3,
        setup: "",
        model: "",
        thinking: "",
        stop_conditions: [],
        network: false,
        ports: [],
        loopback_open: false,
        engine: "",
      },
      criteria: [],
      claims: [
        {
          id: "cl1",
          kind: "criterion_met",
          text: "All checkout tests pass now",
          criterion: "C1",
          at: 100,
          run_no: 1,
          approved: null,
          consistency: "contradicted",
          evidence: "C1 failed on @abcdef1 (exit 1)",
        },
      ],
      runs: [],
      workspace: null,
      base_commit: "0000000",
      pin: "abcdef123",
      session_file: null,
      submit_summary: null,
      briefing: [],
      sentinels: [],
      local_files: [],
      branch_preview: "tower/G-0001",
      can_undo_rollback: false,
      has_held_out_tests: true,
    } as any;

    const { container } = render(() => <GoalBlocks d={d} hasDecision={false} undoable={false} onUndoRollback={() => {}} />);
    expect(container.querySelector(".honesty-ledger")).not.toBeNull();
    expect(container.querySelector(".ledger-claim-cell")!.textContent).toContain("All checkout tests pass now");
    expect(container.querySelector(".ledger-fact-cell.fact-contradicted")!.textContent).toContain("C1 failed on @abcdef1");
  });
});
