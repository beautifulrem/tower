import { render, screen } from "@solidjs/testing-library";
import { describe, expect, it, vi } from "vitest";

vi.mock("../../lib/store", async () => {
  const { createStore } = await import("solid-js/store");
  const [state, setState] = createStore({ settings: { language: "en" }, goals: {}, inbox: [], now: Date.now(), activity: [] as unknown[] });
  return { state, setState, toast: vi.fn(), act: async <T,>(fn: () => Promise<T>) => fn(), ACTIVITY_MAX: 200, clearActivity: vi.fn() };
});

const { ActivityPanel } = await import("../Activity");
const { setState } = (await import("../../lib/store")) as unknown as { setState: (k: "activity", v: unknown[]) => void };

describe("the activity log", () => {
  it("offers no Copy all or Clear while it is empty", () => {
    setState("activity", []);
    render(() => <ActivityPanel />);
    expect(screen.queryByRole("button", { name: "Copy all" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Clear" })).toBeNull();
    expect(screen.getByText("No errors or warnings since Tower started")).toBeTruthy();
  });

  it("offers both once something went by", () => {
    setState("activity", [{ at: Date.now(), level: "error", text: "ntfy could not be reached" }]);
    render(() => <ActivityPanel />);
    expect(screen.getByRole("button", { name: "Copy all" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Clear" })).toBeTruthy();
  });
});
