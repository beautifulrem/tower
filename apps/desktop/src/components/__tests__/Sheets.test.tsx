import { render, screen } from "@solidjs/testing-library";
import { describe, expect, it, vi } from "vitest";

vi.mock("../../lib/store", async () => {
  const { createStore } = await import("solid-js/store");
  const [state] = createStore({ settings: { language: "en" }, goals: {}, inbox: [], now: Date.now(), activity: [{ at: Date.now(), level: "error", text: "ntfy could not be reached", goalId: "G-0001" }] });
  return { state, toast: vi.fn(), act: async <T,>(fn: () => Promise<T>) => fn(), ACTIVITY_MAX: 200, clearActivity: vi.fn() };
});

const { ActivityPanel } = await import("../Activity");
const { ShortcutSheet } = await import("../ShortcutSheet");

describe("the generic sheets", () => {
  it("carry their title in the tracked voice: the activity log", () => {
    render(() => <ActivityPanel />);
    const dialog = screen.getByRole("dialog");
    expect(dialog.className).toContain("panel-tracked");
    expect(dialog.querySelector(".panel-title")!.textContent).toBe("Activity & errors");
    expect(screen.getByText("ntfy could not be reached")).toBeTruthy();
  });

  it("carry their title in the tracked voice: the shortcut table, its groups in the board's small heads", () => {
    render(() => <ShortcutSheet />);
    const dialog = screen.getByRole("dialog");
    expect(dialog.className).toContain("panel-tracked");
    expect(dialog.querySelector(".panel-title")!.textContent).toBe("Keyboard shortcuts");
    for (const h of dialog.querySelectorAll(".keys-group-title")) expect(h.tagName).toBe("H3");
  });
});
