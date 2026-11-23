import { cleanup, fireEvent, render, screen, waitFor } from "@solidjs/testing-library";
import { describe, expect, it, vi } from "vitest";

vi.mock("../../lib/store", async () => {
  const { createStore } = await import("solid-js/store");
  const [state] = createStore({
    settings: { language: "en", engine: "pi", default_model: "", default_thinking: "" },
    projects: [{ id: "p1", name: "shop", root: "/x/shop", test_command: "pnpm test", base_branch: "main" }],
    goals: {
      "G-0009": {
        id: "G-0009",
        project_id: "p1",
        project_name: "shop",
        title: "Prepare payment schema",
        state: "running",
        pause_reason: null,
        mode: "executing",
        live_line: null,
        progress: { verified: 1, observed: 1, machine: 2, human: 0, human_done: 0 },
        diffstat: null,
        cost_usd: 0.4,
        budget: { soft_usd: 5, hard_usd: 8, wall_minutes: 90 },
        run_no: 1,
        rework_cycles: 0,
        max_rework: 3,
        needs_you: 0,
        verified_pin: null,
        branch: null,
        created_at: 1000,
        updated_at: 1000,
        run_started_at: null,
        last_viewed_at: null,
        overlaps: [],
        pr: null,
        engine: "pi",
      },
    },
    inbox: [],
    now: Date.now(),
  });
  return {
    state,
    toast: vi.fn(),
    act: async <T,>(fn: () => Promise<T>) => {
      try {
        return await fn();
      } catch {
        return undefined;
      }
    },
    goalList: () => Object.values(state.goals),
  };
});

const validated: unknown[] = [];
const draft = vi.hoisted(() => ({ fail: false, goalFails: false, holdout: "ok" as "ok" | "none" | "ratifyFails", atts: [] as Array<Record<string, unknown>>, createGate: null as Promise<void> | null, goalGate: null as Promise<void> | null }));
const look = {
  id: "C4",
  title: "The checkout page still looks right",
  kind: { type: "look", start: "npm run dev", url: "http://localhost:3000/checkout", timeout_secs: 60, steps: ["click #buy", "type #qty 2"] },
};
vi.mock("../../lib/api", async () => {
  const { invoke } = await import("@tauri-apps/api/core");
  return {
    api: {
      models: async () => [
        { provider: "anthropic", id: "claude-sonnet-4-5", name: "Claude Sonnet 4.5", reasoning: true, cost_input: 3, cost_output: 15, context_window: 200000 },
        { provider: "anthropic", id: "claude-opus-4-5", name: "Claude Opus 4.5", reasoning: true, cost_input: 15, cost_output: 75, context_window: 200000 },
      ],
      validateContract: async (c: unknown) => {
        validated.push(structuredClone(c));
        return [];
      },
      baseTests: async () => null,
      updateDraft: (id: string, title: string, contract: unknown) =>
        draft.fail ? Promise.reject("the draft is invalid") : invoke("update_draft", { id, title, contract }),
      ratify: (id: string) => invoke("ratify", { id }),
      createGoal: async (g: Record<string, unknown>) => {
        await invoke("create_goal", g);
        await draft.createGate;
        return { id: "G-0100" };
      },
      sandboxPosture: () => invoke("sandbox_posture"),
      generateHoldoutDrafts: async (projectId: string, intent: string) => {
        await invoke("generate_holdout_drafts", { projectId, intent });
        if (draft.holdout === "none") throw "the project is gone";
        return [{ id: "d1", filename: "holdout/total.test.js", rationale: "The total with a discount", code: "test('total', () => {});" }];
      },
      ratifyHoldoutDraft: async (projectId: string, filename: string, code: string) => {
        await invoke("ratify_holdout_draft", { projectId, filename, code });
        if (draft.holdout === "ratifyFails") throw "holdout/ is read-only";
        return filename;
      },
      deleteAttachment: (goalId: string, attachmentId: string) => invoke("delete_attachment", { goalId, attachmentId }),
      saveAttachment: async (goalId: string, name: string) => {
        await invoke("save_attachment", { goalId, name });
        return { id: "att_1", name, mime: "image/png", path: "att_1.png", size_bytes: 4, created_at: 1 };
      },
      goal: async () => {
        await draft.goalGate;
        if (draft.goalFails) throw "the store is locked";
        return {
      summary: { title: "Fix the cart total", project_id: "p1" },
      contract: {
        version: 2,
        intent: "Fix it",
        done_when: "",
        constraints: [],
        criteria: [look],
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
        escalation_model: "",
        escalation_after_reworks: 2,
        attachments: draft.atts,
        sandbox_tier: "default",
        depends_on: [],
      },
    };
      },
  },
  errorText: (e: unknown) => String(e),
  };
});

const { ContractEditor, parsePorts } = await import("../ContractEditor");

describe("a look criterion's steps", () => {
  const lastSteps = () => (validated.at(-1) as { criteria: Array<{ kind: { steps?: string[] } }> }).criteria[0].kind.steps;

  it("are in the contract you amend, numbered and editable: no clause is invisible", async () => {
    const { container } = render(() => <ContractEditor amendId="G-0001" />);
    await waitFor(() => expect(screen.getByLabelText("C4 step 1")).toBeTruthy());
    expect([...container.querySelectorAll(".look-step")].map((li) => `${li.querySelector(".look-step-no")!.textContent} ${(li.querySelector("input") as HTMLInputElement).value}`)).toEqual([
      "01 click #buy",
      "02 type #qty 2",
    ]);
    fireEvent.click(screen.getByText("Step").closest("button")!);
    const third = (await waitFor(() => screen.getByLabelText("C4 step 3"))) as HTMLInputElement;
    expect(third.placeholder).toBe("e.g. press Enter");
    fireEvent.input(third, { target: { value: "wait for .total" } });
    await waitFor(() => expect(lastSteps()).toEqual(["click #buy", "type #qty 2", "wait for .total"]));
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

describe("the contract studio", () => {
  it("reads as a 5-clause contract with masthead, numbered clauses, and schedule", () => {
    const { container } = render(() => <ContractEditor projectId="p1" />);
    const mast = container.querySelector(".contract-mast")!;
    expect([...mast.children].map((el) => el.textContent)).toEqual(["Contract", "", "shop", "", "new"]);
    const heads = [...container.querySelectorAll(".clause-head")].map((h) => `${h.querySelector(".clause-no")!.textContent} ${h.querySelector(".clause-title")!.textContent}`);
    expect(heads).toEqual([
      "01 Intent",
      "02 Acceptance & visual criteria",
      "03 Scope fence & ports",
      "04 Engine, escalation & sandbox",
      "05 Budget & dependencies",
    ]);
    for (const h of container.querySelectorAll(".clause-title")) expect(h.tagName).toBe("H2");
    expect(container.querySelectorAll(".clause-head")[1].querySelectorAll("button")).toHaveLength(3);
    expect(container.querySelector(".section-title")).toBeNull();
  });

  it("declares ports on this machine and can open loopback, both only while the network is off", async () => {
    expect(parsePorts("5432, 6379 5432 x 0 70000")).toEqual([5432, 6379]);
    render(() => <ContractEditor projectId="p1" />);
    expect(screen.getByText("Ports on this machine")).toBeTruthy();
    expect(screen.getByText("Open loopback")).toBeTruthy();
    fireEvent.click(screen.getByRole("switch", { name: /Allow network/ }));
    await waitFor(() => expect(screen.queryByText("Ports on this machine")).toBeNull());
  });

  it("supports selecting cross-goal dependencies and sandbox tier defaults", async () => {
    render(() => <ContractEditor projectId="p1" />);
    const depBtn = screen.getByRole("button", { name: /G-0009/ });
    expect(depBtn.getAttribute("aria-pressed")).toBe("false");
    fireEvent.click(depBtn);
    expect(depBtn.getAttribute("aria-pressed")).toBe("true");
    await waitFor(() => {
      const latest = validated.at(-1) as { depends_on?: string[]; sandbox_tier?: string; escalation_after_reworks?: number };
      expect(latest?.depends_on).toEqual(["G-0009"]);
      expect(latest?.sandbox_tier).toBe("default");
      expect(latest?.escalation_after_reworks).toBe(2);
    });
  });

  it("opens synthetic holdout drafts as dashed Claim cards and ratifies only on explicit human click", async () => {
    const { invoked } = await import("../../test/setup");
    render(() => <ContractEditor projectId="p1" />);
    fireEvent.click(screen.getByRole("button", { name: /Generate synthetic holdout drafts/ }));
    const ratifyBtns = await waitFor(() => {
      const btns = screen.getAllByRole("button", { name: /Ratify into holdout\// });
      expect(btns.length).toBeGreaterThan(0);
      return btns;
    });
    expect(screen.getByText(/Draft claim · inactive until you ratify/)).toBeTruthy();
    const before = invoked.filter((x) => x.cmd === "ratify_holdout_draft").length;
    fireEvent.click(ratifyBtns[0]);
    await waitFor(() => expect(screen.getByText(/You ratified · hidden/)).toBeTruthy());
    expect(invoked.filter((x) => x.cmd === "ratify_holdout_draft").length).toBe(before + 1);
  });
});

describe("attachments of a draft", () => {
  const shot = { id: "att_9", name: "checkout.png", mime: "image/png", path: "att_9.png", size_bytes: 4, created_at: 1 };
  const deletes = async () => (await import("../../test/setup")).invoked.filter((x) => x.cmd === "delete_attachment").length;

  it("removing an image and then discarding the edits leaves the saved draft's image in place", async () => {
    draft.atts = [shot];
    try {
      const before = await deletes();
      const { container, unmount } = render(() => <ContractEditor draftId="G-0008" />);
      const remove = await waitFor(() => {
        const b = container.querySelector<HTMLButtonElement>(".att-chip .icon-btn");
        expect(b).toBeTruthy();
        return b!;
      });
      fireEvent.click(remove);
      await waitFor(() => expect(container.querySelector(".att-chip")).toBeNull());
      unmount();
      await new Promise((r) => setTimeout(r, 0));
      expect(await deletes()).toBe(before);
    } finally {
      draft.atts = [];
    }
  });

  it("removing an image and saving deletes its file once the draft without it is saved", async () => {
    const { invoked } = await import("../../test/setup");
    draft.atts = [shot];
    // This save ratifies G-0008; the later tests look for a ratify or a draft update of their own.
    const start = invoked.length;
    try {
      const { container } = render(() => <ContractEditor draftId="G-0008" />);
      const remove = await waitFor(() => {
        const b = container.querySelector<HTMLButtonElement>(".att-chip .icon-btn");
        expect(b).toBeTruthy();
        return b!;
      });
      fireEvent.click(remove);
      const before = await deletes();
      fireEvent.keyDown(window, { key: "Enter", metaKey: true });
      await waitFor(() => expect(invoked.some((x) => x.cmd === "update_draft")).toBe(true));
      await waitFor(() => expect(invoked.filter((x) => x.cmd === "delete_attachment").length).toBe(before + 1));
      const at = invoked.findIndex((x) => x.cmd === "delete_attachment" && (x.args as { attachmentId: string }).attachmentId === "att_9");
      expect(at).toBeGreaterThan(invoked.map((x) => x.cmd).lastIndexOf("update_draft"));
    } finally {
      cleanup();
      invoked.splice(start);
      draft.atts = [];
    }
  });
});

describe("synthetic holdout drafts", () => {
  it("shows no draft when none came back, never a stand-in to ratify", async () => {
    draft.holdout = "none";
    try {
      render(() => <ContractEditor projectId="p1" />);
      fireEvent.click(screen.getByRole("button", { name: /Generate synthetic holdout drafts/ }));
      await waitFor(() => expect(screen.getByText(/No drafts came back/)).toBeTruthy());
      expect(screen.queryByRole("button", { name: /Ratify into holdout\// })).toBeNull();
    } finally {
      draft.holdout = "ok";
    }
  });

  it("does not stamp a draft ratified when writing it failed", async () => {
    const { toast } = await import("../../lib/store");
    draft.holdout = "ratifyFails";
    try {
      render(() => <ContractEditor projectId="p1" />);
      fireEvent.click(screen.getByRole("button", { name: /Generate synthetic holdout drafts/ }));
      const btn = await waitFor(() => screen.getByRole("button", { name: /Ratify into holdout\// }));
      fireEvent.click(btn);
      await waitFor(() => expect(vi.mocked(toast)).toHaveBeenCalledWith("error", expect.stringContaining("read-only")));
      expect(screen.queryByText(/You ratified · hidden/)).toBeNull();
      expect(vi.mocked(toast)).not.toHaveBeenCalledWith("success", expect.anything());
      expect(screen.getByRole("button", { name: /Ratify into holdout\// })).toBeTruthy();
    } finally {
      draft.holdout = "ok";
    }
  });
});

describe("saving", () => {
  it("never ratifies a draft whose edits failed to save", async () => {
    const { invoked } = await import("../../test/setup");
    draft.fail = true;
    render(() => <ContractEditor draftId="G-0001" />);
    await screen.findByDisplayValue("Fix the cart total");
    fireEvent.keyDown(window, { key: "Enter", metaKey: true });
    await new Promise((r) => setTimeout(r, 0));
    expect(invoked.some((x) => x.cmd === "ratify")).toBe(false);
    draft.fail = false;
  });

  it("creates one goal however fast ⌘↩ is pressed twice", async () => {
    const { invoked } = await import("../../test/setup");
    let open!: () => void;
    draft.createGate = new Promise<void>((r) => (open = r));
    render(() => <ContractEditor projectId="p1" />);
    const before = invoked.filter((x) => x.cmd === "create_goal").length;
    fireEvent.keyDown(window, { key: "Enter", metaKey: true });
    fireEvent.keyDown(window, { key: "Enter", metaKey: true });
    await new Promise((r) => setTimeout(r, 0));
    open();
    expect(invoked.filter((x) => x.cmd === "create_goal").length).toBe(before + 1);
    draft.createGate = null;
  });

  it("leaving while the goal is being created asks nothing and lands on the goal, created once", async () => {
    const { invoked } = await import("../../test/setup");
    const nav = await import("../../lib/nav");
    let open!: () => void;
    draft.createGate = new Promise<void>((r) => (open = r));
    try {
      const { container } = render(() => <ContractEditor projectId="p1" />);
      const intent = container.querySelector(".field-intent textarea") as HTMLTextAreaElement;
      fireEvent.input(intent, { target: { value: "Fix the cart total for discounts" } });
      const before = invoked.filter((x) => x.cmd === "create_goal").length;
      fireEvent.keyDown(window, { key: "Enter", metaKey: true });
      await new Promise((r) => setTimeout(r, 0));
      // Esc, ⌘1 or the sidebar while the save is in flight.
      nav.go({ name: "inbox" });
      await new Promise((r) => setTimeout(r, 0));
      await new Promise((r) => setTimeout(r, 20));
      expect(screen.queryByRole("button", { name: /Keep editing/ })).toBeNull();
      open();
      await waitFor(() => expect(nav.route()).toEqual({ name: "goal", id: "G-0100" }));
      expect(invoked.filter((x) => x.cmd === "create_goal").length).toBe(before + 1);
    } finally {
      draft.createGate = null;
    }
  });

  it("uploads an image pasted into a new contract, so the goal it creates has it", async () => {
    const { invoked } = await import("../../test/setup");
    const { container } = render(() => <ContractEditor projectId="p1" />);
    const intent = container.querySelector(".field-intent textarea") as HTMLTextAreaElement;
    const png = new File([new Uint8Array([0x89, 0x50, 0x4e, 0x47])], "mock.png", { type: "image/png" });
    fireEvent.paste(intent, { clipboardData: { items: [{ kind: "file", getAsFile: () => png }], files: [png] } });
    await waitFor(() => expect(invoked.some((x) => x.cmd === "save_attachment" && (x.args as { goalId: string }).goalId === "draft")).toBe(true));
    fireEvent.keyDown(window, { key: "Enter", metaKey: true });
    await waitFor(() => expect(invoked.some((x) => x.cmd === "create_goal")).toBe(true));
    const sent = invoked.filter((x) => x.cmd === "create_goal").at(-1)!.args as { contract: { attachments: Array<{ path: string; preview?: string }> } };
    expect(sent.contract.attachments.map((a) => [a.path, a.preview])).toEqual([["att_1.png", undefined]]);
  });

  it("never saves a blank form over a draft still loading: the skeleton stands in until it is read", async () => {
    const { invoked } = await import("../../test/setup");
    let open!: () => void;
    draft.goalGate = new Promise<void>((r) => (open = r));
    const { container } = render(() => <ContractEditor draftId="G-0008" />);
    const early = screen.queryByText("Save as draft");
    if (early) fireEvent.click(early);
    fireEvent.keyDown(window, { key: "Enter", metaKey: true });
    const shown = [early === null, container.querySelector(".contract-skeleton") !== null];
    open();
    draft.goalGate = null;
    // Once the draft is drawn, a save sent while it loaded would have been asked for long since.
    await screen.findByDisplayValue("Fix the cart total");
    expect(invoked.filter((x) => x.cmd === "update_draft" && (x.args as { id: string }).id === "G-0008")).toEqual([]);
    expect(shown).toEqual([true, true]);
    expect(container.querySelector(".contract-skeleton")).toBeNull();
  });

  it("never saves over a draft it could not read: the blank form is not your draft", async () => {
    const { invoked } = await import("../../test/setup");
    draft.goalFails = true;
    render(() => <ContractEditor draftId="G-0007" />);
    expect(await screen.findByText("the store is locked")).toBeTruthy();
    expect(screen.queryByText("Save as draft")).toBeNull();
    fireEvent.keyDown(window, { key: "Enter", metaKey: true });
    await new Promise((r) => setTimeout(r, 0));
    expect(invoked.filter((x) => x.cmd === "update_draft" && (x.args as { id: string }).id === "G-0007")).toEqual([]);
    draft.goalFails = false;
  });
});
