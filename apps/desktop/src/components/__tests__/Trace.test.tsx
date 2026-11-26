import { fireEvent, render, screen } from "@solidjs/testing-library";
import { describe, expect, it, vi } from "vitest";

import type { TraceEntry } from "../../gen/TraceEntry";

const trace = vi.hoisted(() => ({ calls: 0, next: null as null | (() => Promise<unknown>), live: (_e: unknown) => {} }));
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
  onTrace: (_id: string, fn: (e: unknown) => void) => ((trace.live = fn), () => {}),
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

  it("shows an entry once when it arrives live while the first page, which has it too, is still being read", async () => {
    let answer!: (page: TraceEntry[]) => void;
    trace.next = () => new Promise((r) => (answer = r));
    const { container } = render(() => <Trace id="G-0001" />);
    trace.live(entry(201));
    await vi.waitFor(() => expect(container.querySelectorAll(".trace-row")).toHaveLength(1));
    answer([entry(201), entry(200), entry(199)]);
    await vi.waitFor(() => expect(container.querySelectorAll(".trace-row").length).toBeGreaterThan(1));
    expect(container.querySelectorAll(".trace-row")).toHaveLength(3);
    // And once more when it comes live again after the page has it.
    trace.live(entry(200));
    trace.live(entry(202));
    await vi.waitFor(() => expect(container.querySelectorAll(".trace-row")).toHaveLength(4));
  });

  // Review 22 follow-up: an item Tower closed itself (withdrawn as the run stopped, timed out, replaced by a newer one)
  // read "Your answer: Withdrawn: The run stopped" in your register. It is Tower's note; a person's answer stays theirs.
  it("never says you answered an item Tower closed", async () => {
    const closed = (seq: number, response: string, auto: boolean): TraceEntry =>
      ({ seq, goal_id: "G-0001", at: 1000 + seq, source: auto ? "system" : "human", event: { kind: "inbox_resolved", item_id: `i${seq}`, response, ...(auto ? { auto } : {}) } }) as unknown as TraceEntry;
    const said = "Tower closed “Can I use order IDs?”: The run stopped";
    const opened = { seq: 0, goal_id: "G-0001", at: 1000, source: "system", event: { kind: "inbox_opened", item_id: "i1", title: "Can I use order IDs?" } } as unknown as TraceEntry;
    trace.next = () => Promise.resolve([closed(2, said, true), closed(1, "Before", false), opened]);
    const { container } = render(() => <Trace id="G-0001" />);
    await vi.waitFor(() => expect(container.querySelectorAll(".trace-row")).toHaveLength(3));
    const rows = [...container.querySelectorAll(".trace-row")];
    // Review 23 (record only): the item Tower added is named, as the one it closed is.
    expect(rows.map((r) => r.textContent)).toContainEqual(expect.stringContaining("“Can I use order IDs?” added to Needs you"));
    const [you, tower] = rows.filter((r) => !/added to Needs you/.test(r.textContent ?? ""));
    expect(tower.textContent).toContain(said);
    expect(tower.textContent).not.toMatch(/Your answer/);
    expect(tower.classList.contains("trace-human")).toBe(false);
    expect(you.textContent).toMatch(/Your answer\s*Before/);
    expect(you.classList.contains("trace-human")).toBe(true);
    // Review 23 (record only): Tower's closing carries Tower's mark, as what it injects does; a person's answer has none.
    expect(tower.querySelector(".trace-content svg")).not.toBeNull();
    expect(you.querySelector(".trace-content svg")).toBeNull();
  });

  // Review 24 (record only 1): "Tower cancelled …" was a plain line while Tower's closing of a card had its mark. A note in
  // Tower's own words has it now; one the engine sent (`notify`) does not, however it is worded: the mark follows who
  // wrote it, never the words.
  it("marks a note as Tower's when Tower wrote it, and only then", async () => {
    const note = (seq: number, text: string, tower: boolean): TraceEntry =>
      ({ seq, goal_id: "G-0001", at: 1000 + seq, source: "system", event: { kind: "note", text, ...(tower ? { tower } : {}) } }) as unknown as TraceEntry;
    const own = "Tower cancelled “Approval needed: delete recursively”: The run was stopping";
    const sent = "Tower closed “Deploy?”: The run stopped";
    trace.next = () => Promise.resolve([note(2, sent, false), note(1, own, true)]);
    const { container } = render(() => <Trace id="G-0001" />);
    await vi.waitFor(() => expect(container.querySelectorAll(".trace-row")).toHaveLength(2));
    const row = (text: string) => [...container.querySelectorAll(".trace-row")].find((r) => r.textContent?.includes(text))!;
    expect(row(own).querySelector(".trace-content svg"), "Tower's note").not.toBeNull();
    expect(row(sent).querySelector(".trace-content svg"), "the engine's note, worded as Tower's").toBeNull();
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
