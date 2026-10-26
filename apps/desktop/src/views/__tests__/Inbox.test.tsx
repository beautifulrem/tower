import { fireEvent, render, screen } from "@solidjs/testing-library";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { invoked } from "../../test/setup";

vi.mock("../../lib/store", async () => {
  const { createStore } = await import("solid-js/store");
  const [state, setState] = createStore({
    settings: { language: "en", muted_goals: [] as string[], quiet_until: null },
    goals: {} as Record<string, unknown>,
    inbox: [] as unknown[],
    snoozed: [{ id: "I-7", goalId: "G-0004", title: "The agent stopped without submitting", until: new Date(2026, 9, 27, 4, 2).getTime() }],
    now: Date.now(),
  });
  return {
    state,
    toast: vi.fn(),
    goalList: () => [],
    act: async <T,>(fn: () => Promise<T>) => fn(),
    forgetSnoozed: (id: string) => setState("snoozed", (s) => s.filter((x) => x.id !== id)),
    rememberSnoozed: vi.fn(),
  };
});

const { Inbox } = await import("../Inbox");

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
    await new Promise((r) => setTimeout(r));
    expect(document.querySelector(".snoozed")).toBeNull();
  });
});
