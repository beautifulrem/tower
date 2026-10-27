import { render } from "@solidjs/testing-library";
import { describe, expect, it, vi } from "vitest";

import type { CriterionView } from "../../gen/CriterionView";

vi.mock("../../lib/store", async () => {
  const { createStore } = await import("solid-js/store");
  const [state] = createStore({ settings: { language: "en" }, goals: {}, inbox: [], now: Date.now() });
  return { state, toast: vi.fn(), act: async <T,>(fn: () => Promise<T>) => fn() };
});

const Honesty = await import("../Honesty");
const { CanaryLine, CriteriaBar, HeldOutLine, discountedOf } = Honesty;
const { Seal } = await import("../Glyph");

const criterion = (canary: CriterionView["canary"]): CriterionView => ({
  criterion: { id: "C1", title: "Tests pass", kind: { type: "exec", command: "npm test", timeout_secs: 600 } },
  verified: { pin: "abcdef1234567", passed: true, exit_code: 0, duration_ms: 1200, output_tail: "", at: Date.now(), stale: false, held_out: false, held_out_proof: null },
  passed_on_base: false,
  base_error: null,
  look: null,
  passes_with_source_only: null,
  canary,
  observed: null,
  human_checked: false,
});

describe("LoopbackLine", () => {
  it("says quietly when loopback was opened for a criterion, and why", () => {
    const { LoopbackLine } = Honesty;
    const none = render(() => <LoopbackLine c={criterion(null)} />);
    expect(none.container.querySelector(".loopback-line")).toBeNull();
    const base = render(() => <LoopbackLine c={{ ...criterion(null), loopback_opened: "base" }} />);
    const line = base.container.querySelector(".loopback-line")!;
    expect(line.textContent).toBe("loopback opened: your tests use it on the base");
    expect(line.querySelector(".col-span")!.className).toContain("t4");
    expect(line.querySelector("[title]")!.getAttribute("title")).toMatch(/Turn it off for the project in Settings/);
    const project = render(() => <LoopbackLine c={{ ...criterion(null), loopback_opened: "project" }} />);
    expect(project.container.querySelector(".loopback-line")!.textContent).toBe("loopback opened: this project's setting");
  });
});

describe("ConsistencyBadge", () => {
  it("keeps the failure's red × for a refutation: 'Cannot confirm' is not evidence, and wears the ◆", () => {
    const { ConsistencyBadge } = Honesty;
    const no = render(() => <ConsistencyBadge value="contradicted" />);
    expect(no.container.querySelector(".result-fail")).not.toBeNull();
    const cannot = render(() => <ConsistencyBadge value="cannot_confirm" />);
    expect(cannot.container.querySelector(".result-fail")).toBeNull();
    expect(cannot.container.querySelector(".mark-attention")!.getAttribute("aria-label")).toBe("Not evidence");
    expect(cannot.container.textContent).toBe("Cannot confirm");
  });
});

describe("CanaryLine", () => {
  it("says nothing when the canary was not this criterion's to check", () => {
    const { container } = render(() => <CanaryLine c={criterion(null)} />);
    expect(container.querySelector(".canary-line")).toBeNull();
  });

  it("states an intact canary quietly, as a fact, and claims no more than was checked", () => {
    const { container } = render(() => <CanaryLine c={criterion("intact")} />);
    const line = container.querySelector(".canary-line")!;
    expect(line.textContent).toContain("must-fail tests failed, as they must");
    expect(line.querySelector("[title]")!.getAttribute("title")).toMatch(/Nothing more is claimed/);
    expect(line.querySelector("[title]")!.getAttribute("title")).not.toMatch(/intact/);
    expect(line.querySelector(".col-span")!.className).toContain("t3");
    expect(line.querySelector(".mark-attention")).toBeNull();
  });

  it("says when the assertions were not checked, and why that matters", () => {
    const { container } = render(() => <CanaryLine c={criterion("not_checked")} />);
    const line = container.querySelector(".canary-line")!;
    expect(line.textContent).toContain("assertions not checked");
    expect(line.textContent).toContain("a pass proves less here");
    expect(line.querySelector("[title]")!.getAttribute("title")).toMatch(/does not show that the tests assert/);
  });

  it("puts a tampered canary in the attention register", () => {
    const { container } = render(() => <CanaryLine c={criterion("tampered")} />);
    const line = container.querySelector(".canary-line")!;
    expect(line.textContent).toContain("a test that must fail passed");
    expect(line.querySelector(".col-span")!.className).toContain("baseline-dependent");
    expect(line.querySelector(".mark-attention")).not.toBeNull();
  });
});

describe("the notes under a criterion", () => {
  const heldOut = (canary: CriterionView["canary"]): CriterionView => {
    const c = criterion(canary);
    return { ...c, verified: { ...c.verified!, held_out: true } };
  };

  it("are one register to a line: the canary's fact on one, your held-out mark on the next", () => {
    const c = heldOut("not_checked");
    const { container } = render(() => (
      <>
        <CanaryLine c={c} />
        <HeldOutLine c={c} />
      </>
    ));
    const lines = container.querySelectorAll(".criterion-obs");
    expect(lines).toHaveLength(2);
    expect(lines[0].textContent).toContain("assertions not checked");
    expect(lines[0].querySelector(".chip-you")).toBeNull();
    expect(lines[1].querySelector(".chip-you")).not.toBeNull();
    // Each note starts under the title: two empty cells (mark, id), then the note.
    for (const l of lines) expect(l.children).toHaveLength(3);
  });

  it("keep the held-out chip on its own line when there is no canary to join", () => {
    const c = heldOut(null);
    const { container } = render(() => (
      <>
        <CanaryLine c={c} />
        <HeldOutLine c={c} />
      </>
    ));
    expect(container.querySelector(".canary-line")).toBeNull();
    expect(container.querySelectorAll(".criterion-obs .chip-you")).toHaveLength(1);
  });

  const proved = (ran: string[], not_ran: string[], unprovable: string[] = []): CriterionView => {
    const c = criterion(null);
    return { ...c, verified: { ...c.verified!, held_out: ran.length > 0, held_out_proof: { ran, not_ran, unprovable } } };
  };

  it("label a result with held-out tests only as far as the files proved they ran", () => {
    // All proved: the plain label.
    let r = render(() => <HeldOutLine c={proved(["holdout/a.sh", "holdout/b.sh"], [])} />);
    expect(r.container.querySelector(".chip-you")!.textContent).toBe("held-out tests, for you only");
    expect(r.container.querySelector(".held-out-missing")).toBeNull();
    r.unmount();
    // Some: "m of n", and the ones that did not run, by name.
    r = render(() => <HeldOutLine c={proved(["holdout/a.sh"], ["holdout/b.sh"], ["holdout/c_test.go"])} />);
    expect(r.container.querySelector(".chip-you")!.textContent).toBe("held-out tests, 1 of 3 ran, for you only");
    const missing = r.container.querySelector(".held-out-missing")!;
    expect(missing.textContent).toContain("held-out tests that did not run:");
    expect([...missing.querySelectorAll("code")].map((c) => c.textContent)).toEqual(["holdout/b.sh"]);
    const unproven = r.container.querySelector(".held-out-unproven")!;
    expect(unproven.textContent).toContain("cannot prove these held-out tests ran:");
    expect(unproven.querySelector("code")!.textContent).toBe("holdout/c_test.go");
    r.unmount();
  });

  it("never show the held-out label next to 'did not run' (none ran)", () => {
    const { container } = render(() => <HeldOutLine c={proved([], ["holdout/more.sh"])} />);
    expect(container.querySelector(".chip-you")).toBeNull();
    expect(container.textContent).not.toContain("for you only");
    expect(container.querySelector(".held-out-missing")!.textContent).toContain("the held-out tests did not run");
  });

  it("say plainly when no held-out file could be proven", () => {
    const { container } = render(() => <HeldOutLine c={proved([], [], ["holdout/x_test.go"])} />);
    expect(container.querySelector(".chip-you")).toBeNull();
    expect(container.querySelector(".held-out-unproven")!.textContent).toContain("cannot prove these held-out tests ran");
  });

  it("tint only the tampered words", () => {
    const { container } = render(() => <CanaryLine c={heldOut("tampered")} />);
    expect(container.querySelector(".baseline-dependent .attn-word")!.textContent).toBe("a test that must fail passed");
  });
});

describe("a tampered canary and the totals", () => {
  // The supervisor already leaves the tampered pass out of `verified`: 2 of 3.
  const progress = { verified: 2, observed: 0, machine: 3, human: 0, human_done: 0 };
  const criteria = [criterion("intact"), criterion("not_checked"), criterion("tampered")];

  it("is counted from the criteria, never from the summary", () => {
    expect(discountedOf(criteria)).toBe(1);
    expect(discountedOf([criterion(null), criterion("intact")])).toBe(0);
    expect(discountedOf(undefined)).toBe(0);
  });

  it("names the gap the supervisor left and gives it an amber segment: the bar says what the line under the criterion says", () => {
    const { container } = render(() => <CriteriaBar progress={progress} criteria={criteria} compact />);
    const bar = container.querySelector(".criteria-bar")!;
    expect(bar.textContent).toContain("Verified 2/3");
    expect(bar.textContent).toContain("1 doesn't count");
    expect([...bar.querySelectorAll(".seg")].map((s) => s.className)).toEqual(["seg seg-verified", "seg seg-verified", "seg seg-discounted"]);
    expect(bar.getAttribute("title")).toMatch(/not evidence/);
    // Without the criteria at hand (a board row, a card) the count stands alone, its third segment simply empty.
    const { container: plain } = render(() => <CriteriaBar progress={progress} compact />);
    expect(plain.querySelector(".criteria-bar")!.textContent).toContain("Verified 2/3");
    expect(plain.querySelector(".seg-discounted")).toBeNull();
    expect(plain.querySelectorAll(".seg-empty")).toHaveLength(1);
  });

  it("is never the green half of red → green, and a refused base reads as an environment problem with its lines in view", () => {
    const { BaselineLine } = Honesty;
    const red = { ...criterion("tampered"), passed_on_base: false };
    const { container } = render(() => <BaselineLine c={red} />);
    expect(container.querySelector(".criterion-obs")).toBeNull();
    const { container: ok } = render(() => <BaselineLine c={{ ...criterion("intact"), passed_on_base: false }} />);
    expect(ok.textContent).toContain("red → green");
    const refused = { ...criterion(null), passed_on_base: null, base_error: "the sandbox refused something it needed on the base (exit code 255): npm ERR! code 255\nsandbox-exec: deny(1) file-read-data /Users/you/node_modules/.bin" };
    const { container: env } = render(() => <BaselineLine c={refused} base="e8dc77b9" />);
    const line = env.querySelector(".env-line")!;
    expect(line).not.toBeNull();
    expect(line.querySelector(".result-env")).not.toBeNull();
    expect(line.textContent).toContain("the sandbox refused something it needed on the base @e8dc77b");
    expect([...line.querySelectorAll(".env-refused")].map((el) => el.textContent)).toEqual(["npm ERR! code 255", "sandbox-exec: deny(1) file-read-data /Users/you/node_modules/.bin"]);
    expect(line.querySelector(".result-fail, .mark-danger")).toBeNull();
  });

  it("withholds the seal: ◆ where the green disc would be, and the words say the pass is not evidence", () => {
    const { container } = render(() => <Seal pin="f20e1bf1234" large tampered />);
    const seal = container.querySelector(".seal")!;
    expect(seal.className).toContain("seal-tampered");
    expect(seal.querySelector("circle")).toBeNull();
    expect(seal.querySelector(".mark-attention")).not.toBeNull();
    expect(seal.textContent).toContain("Passed, not evidence");
    expect(seal.textContent).toContain("@f20e1bf");
    expect(seal.getAttribute("title")).toMatch(/not sealed as verified/);
    const { container: ok } = render(() => <Seal pin="f20e1bf1234" large />);
    expect(ok.querySelector("circle")).not.toBeNull();
    expect(ok.textContent).toContain("Verified");
  });
});

describe("an uncheckable base", () => {
  it("says why in the line: the supervisor's first sentence, plain, without its colon", () => {
    expect(Honesty.baseReason("The command `npm test` of C1 could not run (exit code 1):\nnpm ERR! missing script")).toBe("The command npm test of C1 could not run (exit code 1)");
    expect(Honesty.baseReason("")).toBeNull();
    expect(Honesty.baseReason("x".repeat(200))!.length).toBe(120);
  });
});
