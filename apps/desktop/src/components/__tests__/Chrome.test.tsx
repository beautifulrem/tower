import { render } from "@solidjs/testing-library";
import { describe, expect, it, vi } from "vitest";

// One goal running, its last event a given number of seconds ago (set per test through `quietFor`).
let quietFor = 0;
vi.mock("../../lib/store", async () => {
  const { createStore } = await import("solid-js/store");
  const [state] = createStore({ settings: { language: "en" }, goals: {}, inbox: [], pulse: {}, now: Date.now() });
  return {
    state,
    toast: vi.fn(),
    act: async <T,>(fn: () => Promise<T>) => fn(),
    goalList: () => [{ id: "G-0002", state: "running" }],
    livenessOf: () => ({ at: Date.now() - quietFor * 1000, tool: null }),
  };
});

const { Heartbeat } = await import("../Chrome");

describe("the heartbeat's silence", () => {
  const reading = () => render(() => <Heartbeat running={1} />).container.querySelector(".gauge")!.textContent!.trim();

  it("reads in seconds under a minute", () => {
    quietFor = 45;
    expect(reading()).toBe("silent for 45s");
  });

  it("reads in minutes from sixty seconds on, like every other duration on the desk", () => {
    quietFor = 61;
    expect(reading()).toBe("silent for 1m");
    quietFor = 119;
    expect(reading()).toBe("silent for 1m");
    quietFor = 100 * 60;
    expect(reading()).toBe("silent for 1h 40m");
  });

  it("is a plain age while the engine is fresh", () => {
    quietFor = 12;
    expect(reading()).toBe("12s ago");
  });
});
