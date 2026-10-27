import { fireEvent, render, screen } from "@solidjs/testing-library";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { InboxItem } from "../../gen/InboxItem";
import { invoked } from "../../test/setup";

vi.mock("../../lib/store", async () => {
  const { createStore } = await import("solid-js/store");
  const [state] = createStore({
    settings: { language: "en", muted_goals: [] as string[], quiet_until: null },
    goals: {
      "G-0002": {
        id: "G-0002",
        state: "paused",
        pause_reason: "dependencies_changed",
        pr: null,
        verified_pin: null,
        diffstat: null,
        progress: { verified: 0, observed: 0, machine: 0, human: 0, human_done: 0 },
      },
      "G-0003": {
        id: "G-0003",
        state: "paused",
        pause_reason: "held_out_failed",
        pr: null,
        verified_pin: null,
        diffstat: null,
        progress: { verified: 1, observed: 0, machine: 1, human: 0, human_done: 0 },
      },
      "G-0004": {
        id: "G-0004",
        state: "paused",
        pause_reason: "prepare_failed",
        project_id: "p1",
        project_name: "shop",
        pr: null,
        verified_pin: null,
        diffstat: null,
        progress: { verified: 0, observed: 0, machine: 1, human: 0, human_done: 0 },
      },
    } as Record<string, unknown>,
    inbox: [] as InboxItem[],
    now: Date.now(),
  });
  return {
    state,
    toast: vi.fn(),
    act: async <T,>(fn: () => Promise<T>) => fn(),
  };
});

const { DecisionCard, ARM_MS, bodyParts, heldOutParts, refusedPaths, withoutEnvAside } = await import("../DecisionCard");
const nav = await import("../../lib/nav");

const HELD_OUT_BODY = [
  "Every visible criterion passed; the held-out tests did not. The agent does not know these tests and has not seen the output below.",
  "",
  "Failing in C2: total rounds half-cents up, applies tax once",
  "",
  "C2 · Rounding edge cases",
  "✖ total rounds half-cents up (0.4ms)",
  "  AssertionError: expected 10.01 to equal 10.02",
  "ℹ fail 1",
].join("\n");

const heldOutItem = (): InboxItem =>
  item({
    id: "H-1",
    goal_id: "G-0003",
    goal_title: "Clean up cart edge cases",
    subject: "Held-out tests failed (the agent cannot see them)",
    body: HELD_OUT_BODY,
    options: ["Tell the agent only which tests failed", "Show the agent the failure (it will see the held-out tests)", "Abandon this goal"],
    tones: ["neutral", "neutral", "destructive"],
    allow_text: true,
  });

const item = (over: Partial<InboxItem> = {}): InboxItem => ({
  id: "I-1",
  goal_id: "G-0002",
  goal_title: "Fix the cart total",
  kind: "paused",
  title: "Paused: stopped without submitting",
  subject: "Stopped without submitting",
  body: "",
  options: ["Resume", "Ask it to summarise", "Abandon"],
  tones: ["primary", "neutral", "destructive"],
  allow_text: true,
  created_at: Date.now() - 60_000,
  urgency: 1,
  snoozed_until: null,
  ...over,
});

describe("DecisionCard", () => {
  beforeEach(() => invoked.splice(0));

  it("shows the kind in the strip and only the subject as the question", () => {
    render(() => <DecisionCard item={item()} />);
    expect(screen.getByText("Paused")).toBeTruthy();
    expect(screen.getByText("Stopped without submitting")).toBeTruthy();
    expect(screen.queryByText(/^Paused:/)).toBeNull();
  });

  it("gives each option the tone the supervisor chose", () => {
    render(() => <DecisionCard item={item()} />);
    expect(screen.getByText("Resume").closest("button")!.className).toContain("btn-primary");
    expect(screen.getByText("Ask it to summarise").closest("button")!.className).toContain("btn-default");
    expect(screen.getByText("Abandon").closest("button")!.className).toContain("btn-danger");
  });

  it("sends a plain option on the first press", async () => {
    render(() => <DecisionCard item={item()} />);
    fireEvent.click(screen.getByText("Resume"));
    await Promise.resolve();
    expect(invoked.map((i) => i.cmd)).toEqual(["answer"]);
    expect(invoked[0].args).toEqual({ inboxId: "I-1", response: "Resume" });
  });

  it("arms a destructive option on the first press and sends on the second", async () => {
    vi.useFakeTimers();
    try {
      render(() => <DecisionCard item={item()} />);
      const abandon = screen.getByText("Abandon").closest("button")!;
      fireEvent.click(abandon);
      await Promise.resolve();
      expect(invoked).toHaveLength(0);
      expect(abandon.textContent).toMatch(/Press again/);
      fireEvent.click(abandon);
      await Promise.resolve();
      expect(invoked.map((i) => i.cmd)).toEqual(["answer"]);
      expect(invoked[0].args).toEqual({ inboxId: "I-1", response: "Abandon" });
    } finally {
      vi.useRealTimers();
    }
  });

  it("arms and sends the same way when the card has stood for a minute before the press", async () => {
    vi.useFakeTimers();
    try {
      render(() => <DecisionCard item={item({ id: "I-3" })} />);
      vi.setSystemTime(Date.now() + 60_000);
      const abandon = screen.getByText("Abandon").closest("button")!;
      fireEvent.click(abandon);
      await Promise.resolve();
      expect(abandon.classList.contains("armed")).toBe(true);
      expect(invoked).toHaveLength(0);
      fireEvent.click(abandon);
      await Promise.resolve();
      expect(invoked.map((i) => i.cmd)).toEqual(["answer"]);
    } finally {
      vi.useRealTimers();
    }
  });

  it("disarms after two seconds", async () => {
    vi.useFakeTimers();
    try {
      render(() => <DecisionCard item={item({ id: "I-2" })} />);
      const abandon = screen.getByText("Abandon").closest("button")!;
      fireEvent.click(abandon);
      await Promise.resolve();
      vi.advanceTimersByTime(ARM_MS + 100);
      fireEvent.click(abandon);
      await Promise.resolve();
      expect(invoked).toHaveLength(0);
    } finally {
      vi.useRealTimers();
    }
  });

  it("shows the agent's submit summary on a ready-to-accept card as a claim, and nothing when there is none", () => {
    const ready = (body: string) => item({ id: `R-${body.length}`, kind: "review_ready", subject: "Fix the cart total", options: [], tones: [], allow_text: false, body });
    const { unmount } = render(() => <DecisionCard item={ready("Multiply price by quantity in total()")} />);
    expect(screen.getByText("Multiply price by quantity in total()").closest(".claim")).not.toBeNull();
    expect(screen.getByText("Agent claim:")).toBeTruthy();
    unmount();
    const { container } = render(() => <DecisionCard item={ready("  ")} />);
    expect(container.querySelector(".claim")).toBeNull();
  });

  it("marks a dependency-network decision as a security decision and sets its machine tail apart from the prose", () => {
    render(() => (
      <DecisionCard
        item={item({
          kind: "paused",
          subject: "The agent changed dependencies; verification setup needs the network",
          body: "The agent changed package.json. Setup failed offline.\nnpm ERR! code ENOTFOUND",
        })}
      />
    ));
    expect(screen.getByText(/Setup failed offline/).className).toContain("decision-body");
    expect(screen.getByText(/npm ERR!/).className).toContain("output-tail");
    expect(screen.getByText(/security decision/)).toBeTruthy();
    expect(screen.getByText("Open changes")).toBeTruthy();
  });

  it("does not repeat an assumption's subject as its body", () => {
    render(() => <DecisionCard item={item({ kind: "assumption", subject: "quantities are always 1", body: "quantities are always 1", options: ["Approve", "Reject"], tones: ["primary", "neutral"] })} />);
    expect(screen.getAllByText("quantities are always 1")).toHaveLength(1);
  });

  it("sets a failing check's name as a machine value and keeps the explanation as prose", () => {
    render(() => <DecisionCard item={item({ kind: "ci_failed", subject: "test (ubuntu-latest, node 22)", body: "You can send the failing check to the agent.", options: ["Send to the agent", "Leave it"], tones: ["primary", "neutral"] })} />);
    expect(screen.getByText("test (ubuntu-latest, node 22)").className).toContain("code-val");
    expect(screen.getByText(/send the failing check/).className).not.toContain("code-val");
  });

  it("offers to put a decision aside", async () => {
    render(() => <DecisionCard item={item()} />);
    expect(screen.getByLabelText("Remind me later")).toBeTruthy();
  });

  it("splits a held-out body into the sentence, the failing names and one block per failed criterion, output intact", () => {
    const { prose, failures } = heldOutParts(HELD_OUT_BODY);
    expect(prose).toMatch(/^Every visible criterion passed/);
    expect(prose).not.toContain("Failing in");
    expect(failures).toHaveLength(1);
    expect(failures[0]).toMatchObject({ id: "C2", title: "Rounding edge cases", names: ["total rounds half-cents up", "applies tax once"] });
    expect(failures[0].tail).toContain("AssertionError");
    expect(failures[0].tail).not.toContain("Failing in");
    // A middle dot inside the output does not start a new block.
    expect(heldOutParts("Sentence.\n\nC1 · One\nsome · output\n\nC3 · Three\nmore").failures.map((f) => f.id)).toEqual(["C1", "C3"]);
    // The Chinese line is read the same way; names with no output block still get a row.
    expect(heldOutParts("句子。\n\nC2 失败的测试：甲、乙").failures).toEqual([{ id: "C2", title: "", tail: "", names: ["甲", "乙"] }]);
  });

  it("makes the hint the way out of a held-out failure: the field comes first and sends as a note, the output is marked for you only, and showing the agent is a plain second choice", async () => {
    const { container } = render(() => <DecisionCard item={heldOutItem()} />);
    const held = container.querySelector(".heldout")!;
    expect(held).not.toBeNull();
    expect(held.textContent).toContain("For you only");
    expect(held.querySelector(".output-tail")!.textContent).toContain("AssertionError");
    expect(screen.getByText("Rounding edge cases")).toBeTruthy();
    // The failing tests are named as machine values, before the output.
    const names = [...held.querySelectorAll(".heldout-names code")].map((el) => el.textContent);
    expect(names).toEqual(["total rounds half-cents up", "applies tax once"]);
    expect(screen.getByText("Tell the agent only which tests failed").closest("button")!.className).toContain("btn-default");
    // Order: the output, then the hint field, then the agent-facing options.
    const main = container.querySelector(".decision-main")!;
    const order = [...main.children].map((el) => el.className.split(" ")[0]);
    expect(order.indexOf("heldout")).toBeLessThan(order.indexOf("decision-text"));
    expect(order.indexOf("decision-text")).toBeLessThan(order.indexOf("decision-actions"));
    const send = screen.getByText("Send the hint and resume").closest("button")!;
    expect(send.className).toContain("btn-primary");
    expect(send.disabled).toBe(true);
    expect(screen.getByText(/Show the agent the failure/).closest("button")!.className).toContain("btn-default");
    expect(screen.getByText("Abandon this goal").closest("button")!.className).toContain("btn-danger");
    expect(screen.getByText(/only the names of what failed, keeps it that way/)).toBeTruthy();
    const area = screen.getByPlaceholderText(/A hint for the agent/) as HTMLTextAreaElement;
    fireEvent.input(area, { target: { value: "Half-cents round up" } });
    fireEvent.click(send);
    await Promise.resolve();
    expect(invoked.map((i) => i.cmd)).toEqual(["answer"]);
    expect(invoked[0].args).toEqual({ inboxId: "H-1", response: "Half-cents round up" });
  });

  it("says a sandbox refusal is an environment problem before its details, keeps the sentences as prose and the refused path in the machine tail", () => {
    const body = [
      "Tower tried the acceptance criteria on your own code in the verification sandbox, and they cannot run there, so the agent's work could not be verified either. Fix it, then retry.",
      "",
      "The sandbox refused something the command `npm test` of C1 needed (exit code 255). This is not a test failure: check the refused path below and add it to the project settings if it belongs.",
      "sandbox-exec: deny(1) file-read-data /Users/you/node_modules/.bin",
      "sh: 1: node: Operation not permitted",
    ].join("\n");
    const parts = bodyParts(item({ id: "E-1", goal_id: "G-0004", subject: "Could not prepare the workspace or start the engine", body, options: ["Retry", "Abandon this goal"], tones: ["primary", "destructive"] }));
    expect(parts.prose).toMatch(/This is not a test failure.*if it belongs\.$/s);
    expect(parts.tail).toBe("sandbox-exec: deny(1) file-read-data /Users/you/node_modules/.bin\nsh: 1: node: Operation not permitted");
    const { container } = render(() => <DecisionCard item={item({ id: "E-1", goal_id: "G-0004", subject: "Could not prepare the workspace or start the engine", body, options: ["Retry", "Abandon this goal"], tones: ["primary", "destructive"] })} />);
    const main = container.querySelector(".decision-main")!;
    const order = [...main.children].map((el) => el.className.split(" ").find((c) => c.startsWith("decision-")));
    expect(order.indexOf("decision-caution")).toBeLessThan(order.indexOf("decision-body"));
    expect(container.querySelector(".decision-env .result-env")).not.toBeNull();
    expect(container.querySelector(".decision-env")!.textContent).toContain("not a test failure");
    expect(container.querySelector(".decision-tail")!.textContent).toContain("/Users/you/node_modules/.bin");
    expect(container.querySelector(".mark-danger")).toBeNull();
    // The sentence's `npm test` is a machine value, not backticks in prose.
    const prose = container.querySelector(".decision-body")!;
    expect(prose.textContent).not.toContain("`");
    expect(prose.querySelector("code.code-val")!.textContent).toBe("npm test");
    // The refused path is lifted out as the line to act on, with the way to the project's settings, the command's field in focus.
    const refused = container.querySelector(".decision-refused")!;
    expect(refused.querySelector(".code-val")!.textContent).toBe("/Users/you/node_modules/.bin");
    const link = refused.querySelector("button")!;
    expect(link.textContent).toBe("Settings for shop");
    fireEvent.click(link);
    expect(nav.route()).toEqual({ name: "settings" });
    expect(nav.takeProjectField("p1")).toBe("test");
    expect(nav.takeProjectField("p1")).toBeNull();
  });

  it("reads the refused paths out of the sandbox's lines, once each", () => {
    expect(refusedPaths("npm ERR! code 255\nsandbox-exec: deny(1) file-read-data /a/b\nsandbox-exec: deny(1) file-write-create /c\ndeny(1) file-read-data /a/b")).toEqual(["/a/b", "/c"]);
    expect(refusedPaths("✖ failed")).toEqual([]);
  });

  it("says 'not a test failure' once: the environment line has it, so the supervisor's sentence drops it, in both languages", () => {
    expect(withoutEnvAside("The sandbox refused something the command `npm test` of C1 needed (exit code 1). This is not a test failure.")).toBe(
      "The sandbox refused something the command `npm test` of C1 needed (exit code 1).",
    );
    expect(withoutEnvAside("C1 的命令 `npm test` 在验证沙箱里被拒绝访问了它需要的东西（退出码 1）。这不是测试失败。")).toBe("C1 的命令 `npm test` 在验证沙箱里被拒绝访问了它需要的东西（退出码 1）。");
  });

  it("does not repeat the PR reading on the goal's own page", () => {
    const ci = item({ kind: "ci_failed", subject: "test (ubuntu-latest, node 22)", body: "", options: ["Send to the agent", "Leave it"], tones: ["primary", "neutral"] });
    const { container, unmount } = render(() => <DecisionCard item={ci} />);
    // In a list the strip names the goal; on the goal page (showGoal=false) neither the goal nor its PR is said again.
    expect(container.querySelector(".decision-head .link-quiet")).not.toBeNull();
    unmount();
    const { container: own } = render(() => <DecisionCard item={ci} showGoal={false} />);
    expect(own.querySelector(".decision-head .link-quiet")).toBeNull();
    expect(own.querySelector(".decision-head .pr-line")).toBeNull();
  });
});
