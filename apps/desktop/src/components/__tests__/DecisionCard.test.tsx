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

const { DecisionCard, ARM_MS } = await import("../DecisionCard");

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
});
