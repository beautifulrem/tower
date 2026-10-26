import { fireEvent, render, screen } from "@solidjs/testing-library";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { invoked } from "../../test/setup";

vi.mock("../../lib/store", async () => {
  const { createStore } = await import("solid-js/store");
  const [state, setState] = createStore({
    settings: { language: "en", muted_goals: [] as string[], quiet_until: null },
    goals: {} as Record<string, unknown>,
    inbox: [] as unknown[],
    // The supervisor's list of put-aside items, as the inbox update carries it.
    snoozed: [
      {
        id: "I-7",
        goal_id: "G-0004",
        goal_title: "Find out why checkout is slow",
        kind: "paused",
        title: "Paused: stopped",
        subject: "The agent stopped without submitting",
        body: "",
        options: ["Continue"],
        tones: ["primary"],
        allow_text: false,
        created_at: 0,
        urgency: 1,
        snoozed_until: new Date(2026, 9, 27, 4, 2).getTime(),
      },
    ],
    now: Date.now(),
  });
  return {
    state,
    toast: vi.fn(),
    goalList: () => [],
    act: async <T,>(fn: () => Promise<T>) => fn(),
    /** Test-only: the supervisor's next inbox update, which drops a brought-back item from the list. */
    __supervisorDrops: (id: string) => setState("snoozed", (s) => s.filter((x) => x.id !== id)),
  };
});

const { Inbox } = await import("../Inbox");
const { __supervisorDrops } = (await import("../../lib/store")) as unknown as { __supervisorDrops: (id: string) => void };

describe("Inbox", () => {
  beforeEach(() => invoked.splice(0));

  it("says where a put-aside card went, and brings it back on request", async () => {
    render(() => <Inbox />);
    // The list is empty, yet the card is not lost: the footer counts it with its return time.
    expect(screen.getByText("Nothing needs you")).toBeTruthy();
    const head = screen.getByText("1 put aside (04:02)");
    fireEvent.click(head);
    expect(screen.getByText("The agent stopped without submitting")).toBeTruthy();
    fireEvent.click(screen.getByText("Show now"));
    await Promise.resolve();
    await Promise.resolve();
    expect(invoked.map((i) => i.cmd)).toEqual(["snooze"]);
    expect(invoked[0].args).toEqual({ inboxId: "I-7", until: null });
    // The list is the supervisor's: its next update, not the click, removes the entry.
    __supervisorDrops("I-7");
    await new Promise((r) => setTimeout(r));
    expect(document.querySelector(".snoozed")).toBeNull();
  });
});
