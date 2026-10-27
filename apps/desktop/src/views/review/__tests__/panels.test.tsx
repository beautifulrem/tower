import { render, screen } from "@solidjs/testing-library";
import { describe, expect, it, vi } from "vitest";

import type { GoalDetail } from "../../../gen/GoalDetail";

vi.mock("../../../lib/store", async () => {
  const { createStore } = await import("solid-js/store");
  const [state, setState] = createStore({
    settings: { language: "en", muted_goals: [] as string[], quiet_until: null },
    goals: {
      "G-0001": { id: "G-0001", state: "in_review", verified_pin: "a4a90b2deadbeef", branch: null, pr: null, project_id: "p1", project_name: "shop", progress: { verified: 2, observed: 1, machine: 2, human: 1, human_done: 0 } },
    } as Record<string, unknown>,
    inbox: [],
    env: { issues: [] as Array<{ kind: string }> },
    now: Date.now(),
  });
  return { state, toast: vi.fn(), act: async <T,>(fn: () => Promise<T>) => fn(), refreshEnvironment: async () => {}, __setEnvIssues: (issues: Array<{ kind: string }>) => setState("env", "issues", issues) };
});

const { AcceptPanel, VerifyPanel } = await import("../panels");
const { __setEnvIssues } = (await import("../../../lib/store")) as unknown as { __setEnvIssues: (issues: Array<{ kind: string }>) => void };

const detail = {
  criteria: [
    { criterion: { id: "C1", title: "Tests pass", kind: { type: "exec", command: "npm test", timeout_secs: 600 } }, verified: null, passed_on_base: null, observed: null, human_checked: false },
    { criterion: { id: "H1", title: "Looks right in the browser", kind: { type: "human" } }, verified: null, passed_on_base: null, observed: null, human_checked: false },
  ],
  claims: [{ id: "a1", kind: "assumption", text: "quantities are always 1", criterion: null, at: 0, run_no: 1, approved: null, consistency: "unsupported", evidence: null }],
  sentinels: [{ sentinel: "expectations_changed", severity: 3, title: "Changed what a test expects", detail: "tests/total.test.ts" }],
  runs: [],
} as unknown as GoalDetail;

describe("VerifyPanel", () => {
  it("puts the pictures first: look criteria stand above the output tails, each row keeping its id", () => {
    const withLook = {
      ...detail,
      criteria: [
        ...detail.criteria,
        {
          criterion: { id: "C3", title: "The checkout page still looks right", kind: { type: "look", start: "npm run dev", url: "http://localhost:3000/", timeout_secs: 60 } },
          verified: null,
          passed_on_base: null,
          look: { base: null, pin: null, base_error: "not captured", pin_error: "not captured" },
          observed: null,
          human_checked: false,
        },
      ],
    } as unknown as GoalDetail;
    const { container } = render(() => <VerifyPanel id="G-0001" detail={withLook} loading={false} onClose={() => {}} />);
    const ids = [...container.querySelectorAll(".verify-item .criterion-row > .num")].map((el) => el.textContent);
    expect(ids).toEqual(["C3", "C1", "H1"]);
  });

  it("puts what most needs your eye first: after the pictures, a pass that is not evidence, then a failure, and the passes last", () => {
    const v = (passed: boolean) => ({ pin: "a4a90b2deadbeef", passed, exit_code: passed ? 0 : 1, duration_ms: 900, output_tail: "", at: 0, stale: false, held_out: false });
    const exec = (id: string, verified: unknown, canary?: string) => ({
      criterion: { id, title: id, kind: { type: "exec", command: "npm test", timeout_secs: 60 } },
      verified,
      passed_on_base: null,
      observed: null,
      human_checked: false,
      canary,
    });
    const mixed = { ...detail, criteria: [exec("C1", v(true)), exec("C2", v(true)), exec("C3", null), exec("C4", v(false)), exec("C5", v(true), "tampered")] } as unknown as GoalDetail;
    const { container } = render(() => <VerifyPanel id="G-0001" detail={mixed} loading={false} onClose={() => {}} />);
    const ids = [...container.querySelectorAll(".verify-item .criterion-row > .num")].map((el) => el.textContent);
    expect(ids).toEqual(["C5", "C4", "C3", "C1", "C2"]);
  });
});

describe("AcceptPanel", () => {
  it("accepting is not blocked by a tampered canary alone", () => {
    const checked = { ...detail, criteria: detail.criteria.map((c) => ({ ...c, human_checked: true })) } as GoalDetail;
    render(() => <AcceptPanel id="G-0001" viewed={3} total={3} detail={checked} onHumanCheck={() => {}} onClose={() => {}} onDone={() => {}} />);
    expect((screen.getByText("Accept anyway").closest("button") as HTMLButtonElement).disabled).toBe(false);
  });

  it("lists what is still open: the assumption, the sentinel and the unviewed units", () => {
    render(() => <AcceptPanel id="G-0001" viewed={1} total={3} detail={detail} onHumanCheck={() => {}} onClose={() => {}} onDone={() => {}} />);
    expect(screen.getByText(/Unconfirmed assumption: quantities are always 1/)).toBeTruthy();
    expect(screen.getByText("Changed what a test expects")).toBeTruthy();
    expect(screen.getByText("Sentinels")).toBeTruthy();
    expect(screen.getByText(/2 review units not marked viewed/)).toBeTruthy();
    // Said once: the unviewed units are in the open list, not repeated as a count.
    expect(screen.queryByText(/viewed 1\/3/)).toBeNull();
  });

  it("blocks accepting until every human criterion is checked, saying so on the criterion's own row", () => {
    render(() => <AcceptPanel id="G-0001" viewed={3} total={3} detail={detail} onHumanCheck={() => {}} onClose={() => {}} onDone={() => {}} />);
    expect(screen.getByText("Waiting for your check")).toBeTruthy();
    expect(screen.queryByText(/Human criterion H1 is not checked yet/)).toBeNull();
    const accept = screen.getByText("Accept anyway").closest("button")!;
    expect(accept.disabled).toBe(true);
    expect(screen.getByText(/viewed 3\/3/)).toBeTruthy();
  });

  it("does not put a focus ring on a button when it opens", () => {
    render(() => <AcceptPanel id="G-0001" viewed={3} total={3} detail={detail} onHumanCheck={() => {}} onClose={() => {}} onDone={() => {}} />);
    expect(document.activeElement?.getAttribute("role")).toBe("dialog");
  });

  it("says the verifier's word with its pin", () => {
    render(() => <AcceptPanel id="G-0001" viewed={3} total={3} detail={detail} onHumanCheck={() => {}} onClose={() => {}} onDone={() => {}} />);
    expect(screen.getByText("@a4a90b2")).toBeTruthy();
    expect(screen.getByText(/All 2 machine criteria passed/)).toBeTruthy();
  });

  it("without a git identity blocks accepting and offers the form, for this repository by default", () => {
    __setEnvIssues([{ kind: "git_identity_missing" }]);
    try {
      const checked = { ...detail, criteria: detail.criteria.map((c) => ({ ...c, human_checked: true })) } as GoalDetail;
      const { container } = render(() => <AcceptPanel id="G-0001" viewed={3} total={3} detail={checked} onHumanCheck={() => {}} onClose={() => {}} onDone={() => {}} />);
      expect(container.querySelector(".panel-blockers")!.textContent).toMatch(/git has no name and email/);
      expect((screen.getByText("Accept anyway").closest("button") as HTMLButtonElement).disabled).toBe(true);
      expect((screen.getByLabelText("Only for shop") as HTMLInputElement).checked).toBe(true);
    } finally {
      __setEnvIssues([]);
    }
  });

  it("with an item that needs your judgement, the primary reads Accept anyway and takes two presses; the items stand first, by weight", async () => {
    const { invoked } = await import("../../../test/setup");
    const checked = { ...detail, criteria: detail.criteria.map((c) => ({ ...c, human_checked: true })) } as GoalDetail;
    const { container } = render(() => <AcceptPanel id="G-0001" viewed={1} total={3} detail={checked} onHumanCheck={() => {}} onClose={() => {}} onDone={() => {}} />);
    const groups = [...container.querySelectorAll(".panel-section > .meta.t3")].map((el) => el.textContent);
    expect(groups).toEqual(["Not evidence, or needs your judgement", "To look at"]);
    expect(container.querySelector(".open-judgement")!.textContent).toMatch(/Changed what a test expects/);
    expect(container.querySelector(".open-notice")!.textContent).toMatch(/quantities are always 1/);
    const button = screen.getByText("Accept anyway").closest("button")!;
    const before = invoked.filter((c) => c.cmd === "accept").length;
    button.click();
    // Armed, not sent: the button says what it is over, and that a second press is needed.
    expect(button.classList.contains("armed")).toBe(true);
    expect(button.textContent).toBe("Press again to accept anyway");
    expect(invoked.filter((c) => c.cmd === "accept").length).toBe(before);
    button.click();
    await Promise.resolve();
    expect(invoked.filter((c) => c.cmd === "accept").length).toBe(before + 1);
  });

  it("with nothing red open, accepting is one press, under the plain heading", async () => {
    const { invoked } = await import("../../../test/setup");
    const calm = { ...detail, sentinels: [], criteria: detail.criteria.map((c) => ({ ...c, human_checked: true })) } as unknown as GoalDetail;
    const { container } = render(() => <AcceptPanel id="G-0001" viewed={1} total={3} detail={calm} onHumanCheck={() => {}} onClose={() => {}} onDone={() => {}} />);
    expect([...container.querySelectorAll(".panel-section > .meta.t3")].map((el) => el.textContent)).toEqual(["Still open (does not block accepting)"]);
    const before = invoked.filter((c) => c.cmd === "accept").length;
    screen.getByText("Accept and write branch").closest("button")!.click();
    await Promise.resolve();
    expect(invoked.filter((c) => c.cmd === "accept").length).toBe(before + 1);
  });

  it("does not count a pass with a tampered canary: the seal is withheld, the sentence says how many count, and the criterion heads the open list", () => {
    const tampered = {
      ...detail,
      criteria: [
        ...detail.criteria,
        {
          criterion: { id: "C2", title: "Rounding tests pass", kind: { type: "exec", command: "node --test", timeout_secs: 120 } },
          verified: { pin: "a4a90b2deadbeef", passed: true, exit_code: 0, duration_ms: 900, output_tail: "", at: 0, stale: false, held_out: false },
          passed_on_base: null,
          observed: null,
          human_checked: false,
          canary: "tampered",
        },
      ],
    } as unknown as GoalDetail;
    const { container } = render(() => <AcceptPanel id="G-0001" viewed={3} total={3} detail={tampered} onHumanCheck={() => {}} onClose={() => {}} onDone={() => {}} />);
    expect(container.querySelector(".seal-tampered")).not.toBeNull();
    expect(screen.queryByText(/All 2 machine criteria passed/)).toBeNull();
    expect(screen.getByText(/1 of 2 machine criteria count as evidence; 1 passed with a tampered canary/)).toBeTruthy();
    const open = [...container.querySelectorAll(".panel-section .row.meta")].map((el) => el.textContent ?? "");
    expect(open[0]).toMatch(/C2: a test that must fail passed; this pass is not evidence/);
    expect(container.querySelector(".panel-section .row.meta .mark-danger")).not.toBeNull();
  });
});
