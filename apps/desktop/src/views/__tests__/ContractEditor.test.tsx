import { render } from "@solidjs/testing-library";
import { describe, expect, it, vi } from "vitest";

vi.mock("../../lib/store", async () => {
  const { createStore } = await import("solid-js/store");
  const [state] = createStore({
    settings: { language: "en", engine: "pi", default_model: "", default_thinking: "" },
    projects: [{ id: "p1", name: "shop", root: "/x/shop", test_command: "pnpm test", base_branch: "main" }],
    goals: {},
    inbox: [],
    now: Date.now(),
  });
  return { state, toast: vi.fn(), act: async <T,>(fn: () => Promise<T>) => fn() };
});
vi.mock("../../lib/api", () => ({
  api: { models: async () => [], validateContract: async () => [], baseTests: async () => null, goal: async () => null },
  errorText: (e: unknown) => String(e),
}));

const { ContractEditor } = await import("../ContractEditor");

describe("the contract editor", () => {
  it("reads as a contract: a masthead saying what, whose and which state, then numbered clauses and the schedule numbered on", () => {
    const { container } = render(() => <ContractEditor projectId="p1" />);
    const mast = container.querySelector(".contract-mast")!;
    expect([...mast.children].map((el) => el.textContent)).toEqual(["Contract", "·", "shop", "·", "new"]);
    const heads = [...container.querySelectorAll(".clause-head")].map((h) => `${h.querySelector(".clause-no")!.textContent} ${h.querySelector(".clause-title")!.textContent}`);
    expect(heads).toEqual(["01 Intent", "02 Acceptance criteria", "03 Scope fence", "04 Autonomy", "05 Budget", "06 Isolation", "07 Engine"]);
    // The clause titles are the document's headings, and the acceptance clause keeps its three ways to add a criterion on its head.
    for (const h of container.querySelectorAll(".clause-title")) expect(h.tagName).toBe("H2");
    expect(container.querySelectorAll(".clause-head")[1].querySelectorAll("button")).toHaveLength(3);
    expect(container.querySelector(".section-title")).toBeNull();
  });
});
