import { render, screen, waitFor } from "@solidjs/testing-library";
import { For, Suspense, createResource } from "solid-js";
import { describe, expect, it, vi } from "vitest";

vi.mock("../../lib/store", async () => {
  const { createStore } = await import("solid-js/store");
  const [state] = createStore({ settings: { language: "en" }, goals: {}, inbox: [], pulse: {}, now: Date.now() });
  return { state, toast: vi.fn(), act: async <T,>(fn: () => Promise<T>) => fn(), livenessOf: () => ({ at: 0, tool: null }) };
});

const { Empty, Kbd, Overlay, settled } = await import("../ui");
const { Heartbeat } = await import("../Chrome");

describe("a settled resource", () => {
  it("keeps its rows (and the focus in them) while it reloads under a Suspense: the page does not blank into the spinner", async () => {
    let answer!: (v: string[]) => void;
    const fetcher = vi.fn(() => new Promise<string[]>((r) => (answer = r)));
    let refetch!: () => unknown;
    const { container } = render(() => {
      const [rows, ctl] = createResource(fetcher);
      refetch = ctl.refetch;
      return (
        <Suspense fallback={<p class="spinner" />}>
          <For each={settled(rows) ?? []}>{(r) => <button type="button">{r}</button>}</For>
        </Suspense>
      );
    });
    expect(container.querySelector(".spinner")).not.toBeNull();
    answer(["a", "b"]);
    await waitFor(() => expect(container.querySelectorAll("button")).toHaveLength(2));
    container.querySelectorAll("button")[1].focus();
    void refetch();
    await Promise.resolve();
    expect(container.querySelector(".spinner")).toBeNull();
    expect(document.activeElement?.textContent).toBe("b");
    answer(["a", "b", "c"]);
    await waitFor(() => expect(container.querySelectorAll("button")).toHaveLength(3));
    expect(container.querySelector(".spinner")).toBeNull();
  });
});

describe("key caps", () => {
  it("draws two keys as two caps and an alias as caps around a slash", () => {
    const { container, unmount } = render(() => <Kbd k="j k" />);
    expect(container.querySelectorAll("kbd")).toHaveLength(2);
    expect(container.querySelector(".kbd-or")).toBeNull();
    unmount();
    const r2 = render(() => <Kbd k="n / mod+n" />);
    expect(r2.container.querySelectorAll("kbd")).toHaveLength(2);
    expect(r2.container.querySelector(".kbd-or")).not.toBeNull();
    r2.unmount();
    // The slash is also a key of its own.
    const r3 = render(() => <Kbd k="/" />);
    expect(r3.container.querySelectorAll("kbd")).toHaveLength(1);
  });
});

describe("empty states", () => {
  it("carry the wordmark as a poster, with Tower's own mark and no slogan band under it", () => {
    const { container } = render(() => <Empty title="Nothing" poster />);
    expect(screen.getByText("Tower")).toBeTruthy();
    expect(container.querySelector(".wordmark .brand-mark")).not.toBeNull();
    // The verified ring is a status, never the brand.
    expect(container.querySelector(".wordmark circle")).toBeNull();
    expect(screen.queryByText(/Facts stay apart from claims/)).toBeNull();
  });
  it("use the mark family's red ×", () => {
    const { container } = render(() => <Empty title="Nothing" kind="error" />);
    expect(container.querySelector(".mark-danger")).not.toBeNull();
  });
});

describe("overlay focus", () => {
  it("lands on the first control by default and on the panel when asked", () => {
    const a = render(() => (
      <Overlay onClose={() => {}} label="a">
        <button>first</button>
      </Overlay>
    ));
    expect(document.activeElement?.textContent).toBe("first");
    a.unmount();
    render(() => (
      <Overlay onClose={() => {}} label="b" initialFocus="panel">
        <button>first</button>
      </Overlay>
    ));
    expect(document.activeElement?.getAttribute("role")).toBe("dialog");
  });
});

describe("heartbeat", () => {
  it("is silent (the hollow ring) only without a running tool", () => {
    const { container } = render(() => <Heartbeat running={0} />);
    expect(container.querySelector(".gauge")).toBeNull();
  });
});
