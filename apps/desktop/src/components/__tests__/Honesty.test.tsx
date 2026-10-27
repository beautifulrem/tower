import { render } from "@solidjs/testing-library";
import { describe, expect, it, vi } from "vitest";

import type { CriterionView } from "../../gen/CriterionView";

vi.mock("../../lib/store", async () => {
  const { createStore } = await import("solid-js/store");
  const [state] = createStore({ settings: { language: "en" }, goals: {}, inbox: [], now: Date.now() });
  return { state, toast: vi.fn(), act: async <T,>(fn: () => Promise<T>) => fn() };
});

const { CanaryLine, CriteriaBar, discountedOf } = await import("../Honesty");
const { Seal } = await import("../Glyph");

const criterion = (canary: CriterionView["canary"]): CriterionView => ({
  criterion: { id: "C1", title: "Tests pass", kind: { type: "exec", command: "npm test", timeout_secs: 600 } },
  verified: { pin: "abcdef1234567", passed: true, exit_code: 0, duration_ms: 1200, output_tail: "", at: Date.now(), stale: false, held_out: false },
  passed_on_base: false,
  base_error: null,
  look: null,
  passes_with_source_only: null,
  canary,
  observed: null,
  human_checked: false,
});

describe("CanaryLine", () => {
  it("says nothing when the canary was not this criterion's to check", () => {
    const { container } = render(() => <CanaryLine c={criterion(null)} />);
    expect(container.querySelector(".canary-line")).toBeNull();
  });

  it("states an intact canary quietly, as a fact", () => {
    const { container } = render(() => <CanaryLine c={criterion("intact")} />);
    const line = container.querySelector(".canary-line")!;
    expect(line.textContent).toContain("assertions checked");
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

describe("a tampered canary and the totals", () => {
  const progress = { verified: 3, observed: 0, machine: 3, human: 0, human_done: 0 };
  const criteria = [criterion("intact"), criterion("not_checked"), criterion("tampered")];

  it("is counted from the criteria, never from the summary", () => {
    expect(discountedOf(criteria)).toBe(1);
    expect(discountedOf([criterion(null), criterion("intact")])).toBe(0);
    expect(discountedOf(undefined)).toBe(0);
  });

  it("leaves the verified count and takes an amber segment: the bar says what the line under the criterion says", () => {
    const { container } = render(() => <CriteriaBar progress={progress} criteria={criteria} compact />);
    const bar = container.querySelector(".criteria-bar")!;
    expect(bar.textContent).toContain("Verified 2/3");
    expect(bar.textContent).toContain("1 doesn't count");
    expect([...bar.querySelectorAll(".seg")].map((s) => s.className)).toEqual(["seg seg-verified", "seg seg-verified", "seg seg-discounted"]);
    expect(bar.getAttribute("title")).toMatch(/not evidence/);
    // Without the criteria at hand (a board row, a card) the summary's count stands.
    const { container: plain } = render(() => <CriteriaBar progress={progress} compact />);
    expect(plain.querySelector(".criteria-bar")!.textContent).toContain("Verified 3/3");
    expect(plain.querySelector(".seg-discounted")).toBeNull();
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
