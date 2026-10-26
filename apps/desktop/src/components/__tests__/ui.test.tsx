import { render, screen } from "@solidjs/testing-library";
import { describe, expect, it, vi } from "vitest";

vi.mock("../../lib/store", async () => {
  const { createStore } = await import("solid-js/store");
  const [state] = createStore({ settings: { language: "en" }, goals: {}, inbox: [], pulse: {}, now: Date.now() });
  return { state, toast: vi.fn(), act: async <T,>(fn: () => Promise<T>) => fn(), livenessOf: () => ({ at: 0, tool: null }) };
});

const { Empty, Kbd, Overlay } = await import("../ui");
const { Heartbeat } = await import("../Chrome");

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
  it("carry the wordmark and the three rules as a poster", () => {
    render(() => <Empty title="Nothing" poster />);
    expect(screen.getByText("TOWER")).toBeTruthy();
    expect(screen.getByText(/Facts stay apart from claims/)).toBeTruthy();
  });
  it("use the glyph set's ring and square", () => {
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
  it("is silent (hollow square) only without a running tool", () => {
    const { container } = render(() => <Heartbeat running={0} />);
    expect(container.querySelector(".gauge")).toBeNull();
  });
});
