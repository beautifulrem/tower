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
const validated: unknown[] = [];
const look = { id: "C4", title: "The checkout page still looks right", kind: { type: "look", start: "npm run dev", url: "http://localhost:3000/checkout", timeout_secs: 60, steps: ["click #buy", "type #qty 2"] } };
vi.mock("../../lib/api", () => ({
  api: {
    models: async () => [],
    validateContract: async (c: unknown) => {
      validated.push(structuredClone(c));
      return [];
    },
    baseTests: async () => null,
    goal: async () => ({
      summary: { title: "Fix the cart total", project_id: "p1" },
      contract: { version: 2, intent: "Fix it", done_when: "", constraints: [], criteria: [look], scope: { include: [], exclude: [], readonly: [] }, budget: { soft_usd: 5, hard_usd: 8, wall_minutes: 90 }, autonomy: "standard", max_rework: 3, setup: "", model: "", thinking: "", stop_conditions: [], network: false, engine: "" },
    }),
  },
  errorText: (e: unknown) => String(e),
}));

const { ContractEditor } = await import("../ContractEditor");
const { fireEvent, screen, waitFor } = await import("@solidjs/testing-library");

describe("a look criterion's steps", () => {
  const lastSteps = () => (validated.at(-1) as { criteria: Array<{ kind: { steps?: string[] } }> }).criteria[0].kind.steps;

  it("are in the contract you amend, numbered and editable: no clause is invisible", async () => {
    const { container } = render(() => <ContractEditor amendId="G-0001" />);
    await waitFor(() => expect(screen.getByLabelText("C4 step 1")).toBeTruthy());
    expect([...container.querySelectorAll(".look-step")].map((li) => `${li.querySelector(".look-step-no")!.textContent} ${(li.querySelector("input") as HTMLInputElement).value}`)).toEqual([
      "01 click #buy",
      "02 type #qty 2",
    ]);
    // + Step opens a line under them, and what you type there goes to validation with the rest.
    fireEvent.click(screen.getByText("Step").closest("button")!);
    const third = (await waitFor(() => screen.getByLabelText("C4 step 3"))) as HTMLInputElement;
    expect(third.placeholder).toBe("e.g. press Enter");
    fireEvent.input(third, { target: { value: "wait for .total" } });
    await waitFor(() => expect(lastSteps()).toEqual(["click #buy", "type #qty 2", "wait for .total"]));
    // A line the supervisor would refuse is marked while you type.
    fireEvent.input(third, { target: { value: "drag a b" } });
    await waitFor(() => expect(third.getAttribute("aria-invalid")).toBe("true"));
  });

  it("leave the contract with the last one removed, and a criterion without steps says what steps are", async () => {
    const { container } = render(() => <ContractEditor amendId="G-0001" />);
    await waitFor(() => expect(screen.getByLabelText("C4 step 2")).toBeTruthy());
    fireEvent.click(screen.getByLabelText("Remove step 2"));
    fireEvent.click(screen.getByLabelText("Remove step 1"));
    await waitFor(() => expect(container.querySelectorAll(".look-step")).toHaveLength(0));
    await waitFor(() => expect(lastSteps()).toBeUndefined());
    expect(container.querySelector(".look-steps .field-hint")!.textContent).toMatch(/Before the picture: click, type, press, wait, wait for/);
  });
});

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

  it("declares ports on this machine and can open loopback, both only while the network is off", async () => {
    const { parsePorts } = await import("../ContractEditor");
    expect(parsePorts("5432, 6379 5432 x 0 70000")).toEqual([5432, 6379]);
    render(() => <ContractEditor projectId="p1" />);
    expect(screen.getByText("Ports on this machine")).toBeTruthy();
    expect(screen.getByText("Open loopback")).toBeTruthy();
    fireEvent.click(screen.getByRole("switch", { name: /Allow network/ }));
    await waitFor(() => expect(screen.queryByText("Ports on this machine")).toBeNull());
  });
});
