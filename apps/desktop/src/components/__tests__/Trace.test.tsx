import { fireEvent, render, screen } from "@solidjs/testing-library";
import { describe, expect, it, vi } from "vitest";

import type { TraceEntry } from "../../gen/TraceEntry";

const trace = vi.hoisted(() => ({ calls: 0, next: null as null | (() => Promise<unknown>) }));
vi.mock("../../lib/api", () => ({
  api: {
    trace: () => {
      trace.calls++;
      return trace.next ? trace.next() : Promise.resolve([]);
    },
  },
  errorText: (e: unknown) => String(e),
}));
vi.mock("../../lib/store", () => ({
  act: async <T,>(fn: () => Promise<T>) => fn(),
  onTrace: () => () => {},
  refreshProjects: async () => {},
  state: { goals: {}, projects: [], now: Date.now() },
}));

const { Trace } = await import("../Trace");

const entry = (seq: number): TraceEntry => ({ seq, goal_id: "G-0001", at: 1000 + seq, event: { kind: "note", text: `n${seq}` } }) as unknown as TraceEntry;

describe("the trace", () => {
  it("asks for one earlier page at a time however many scroll events reach the top", async () => {
    trace.calls = 0;
    trace.next = () => Promise.resolve(Array.from({ length: 200 }, (_, i) => entry(400 - i)));
    const { container } = render(() => <Trace id="G-0001" />);
    await vi.waitFor(() => expect(trace.calls).toBe(1));
    await new Promise((r) => setTimeout(r, 0));
    // The next page never answers: three scroll events at the top must not ask three times.
    trace.next = () => new Promise(() => {});
    const scroller = container.querySelector(".trace-scroll") as HTMLDivElement;
    scroller.scrollTop = 0;
    fireEvent.scroll(scroller);
    fireEvent.scroll(scroller);
    fireEvent.scroll(scroller);
    await new Promise((r) => setTimeout(r, 0));
    expect(trace.calls).toBeLessThanOrEqual(2);
  });

  it("says when the trace could not be read, and reads it again on Retry", async () => {
    trace.calls = 0;
    trace.next = () => Promise.reject("the store is locked");
    render(() => <Trace id="G-0001" />);
    expect(await screen.findByText("the store is locked")).toBeTruthy();
    trace.next = () => Promise.resolve([]);
    fireEvent.click(screen.getByRole("button", { name: /retry/i }));
    await vi.waitFor(() => expect(trace.calls).toBe(2));
  });
});
