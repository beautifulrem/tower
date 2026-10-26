import { render } from "@solidjs/testing-library";
import { describe, expect, it, vi } from "vitest";

import type { CriterionView } from "../../gen/CriterionView";

vi.mock("../../lib/store", async () => {
  const { createStore } = await import("solid-js/store");
  const [state] = createStore({ settings: { language: "en" }, goals: {}, inbox: [], now: Date.now() });
  return { state, toast: vi.fn(), act: async <T,>(fn: () => Promise<T>) => fn() };
});

const { CanaryLine } = await import("../Honesty");

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
