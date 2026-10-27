import { fireEvent, render, screen } from "@solidjs/testing-library";
import { describe, expect, it, vi } from "vitest";

import type { DiffFile } from "../../../gen/DiffFile";
import type { Anchor, Composing } from "../types";

vi.mock("../../../lib/store", async () => {
  const { createStore } = await import("solid-js/store");
  const [state] = createStore({ settings: { language: "en" }, goals: {}, inbox: [], now: Date.now() });
  return { state, toast: vi.fn(), act: async <T,>(fn: () => Promise<T>) => fn() };
});
// Highlighting runs in a worker; here the colours never come, so rows show after the wait.
vi.mock("../../../lib/highlight", () => ({ highlight: async () => null, languageOf: () => null }));

const { FileDiff } = await import("../FileDiff");

const file: DiffFile = {
  path: "src/cart/total.ts",
  old_path: null,
  status: "modified",
  additions: 1,
  deletions: 1,
  binary: false,
  hunks: [
    {
      header: "@@ -10,3 +10,3 @@ export function total()",
      lines: [
        { kind: "context", old_no: 10, new_no: 10, text: "  let sum = 0;" },
        { kind: "del", old_no: 11, new_no: null, text: "  sum += price + qty;" },
        { kind: "add", old_no: null, new_no: 11, text: "  sum += price * qty;" },
        { kind: "context", old_no: 12, new_no: 12, text: "  return sum;" },
      ],
    },
  ],
};

function mount(over: Partial<Parameters<typeof FileDiff>[0]> = {}) {
  const anchors: Anchor[] = [];
  const saved: string[] = [];
  const [composer, setComposer] = (() => {
    let c: Composing = null;
    return [() => c, (v: Composing) => (c = v)] as const;
  })();
  const utils = render(() => (
    <FileDiff
      file={file}
      split={false}
      lines={undefined}
      reveals={{}}
      whole={false}
      onReveal={() => {}}
      onWhole={() => {}}
      viewed={false}
      onViewed={() => {}}
      onOpen={() => {}}
      comments={[]}
      composer={composer()}
      onAnchor={(a) => {
        anchors.push(a);
        setComposer(a);
      }}
      onSave={(t) => saved.push(t)}
      onCancel={() => setComposer(null)}
      onEdit={() => {}}
      onRemove={() => {}}
      {...over}
    />
  ));
  return { ...utils, anchors, saved };
}

describe("FileDiff comment flow", () => {
  it("anchors a comment on the new line when its number is clicked", () => {
    const { anchors } = mount();
    fireEvent.click(screen.getByLabelText("Line 11: comment", { selector: "td:nth-child(2) button" }));
    expect(anchors).toEqual([{ path: "src/cart/total.ts", line: 11, old: null }]);
  });

  it("anchors on the old line for a deleted line", () => {
    const { anchors } = mount();
    const buttons = screen.getAllByLabelText("Line 11: comment");
    fireEvent.click(buttons[0]);
    expect(anchors[0]).toEqual({ path: "src/cart/total.ts", line: null, old: 11 });
  });

  it("opens the composer at the anchor and saves the text", () => {
    const { saved } = mount({ composer: { path: "src/cart/total.ts", line: 11, old: null } });
    const box = screen.getByPlaceholderText(/What should change here/) as HTMLTextAreaElement;
    fireEvent.input(box, { target: { value: "multiply, do not add" } });
    fireEvent.click(screen.getByText("Add comment"));
    expect(saved).toEqual(["multiply, do not add"]);
  });

  it("is one tab stop whose arrows walk the line numbers", () => {
    mount();
    const table = screen.getByLabelText(/Changes in src\/cart\/total\.ts/);
    expect(table.getAttribute("tabindex")).toBe("0");
    table.focus();
    fireEvent.focus(table);
    const first = document.activeElement as HTMLElement;
    expect(first.className).toContain("ln-btn");
    fireEvent.keyDown(first, { key: "ArrowDown" });
    expect(document.activeElement).not.toBe(first);
    expect((document.activeElement as HTMLElement).className).toContain("ln-btn");
  });

  it("accepting a hunk is a mark of your own: the hunk folds to its header, the mark can be taken back, and undo steps aside while it stands", () => {
    const accepted: number[] = [];
    const { container, unmount } = mount({ onUndo: () => {}, accepted: (i) => accepted.includes(i), onAccept: (i) => accepted.push(i) });
    const accept = screen.getByText("Accept this hunk").closest("button")!;
    expect(accept.getAttribute("aria-pressed")).toBe("false");
    expect(accept.title).toMatch(/reading mark/);
    expect(container.querySelectorAll(".dl")).toHaveLength(4);
    fireEvent.click(accept);
    expect(accepted).toEqual([0]);
    unmount();
    // Rendered with the mark on: no lines, a marked header, the count, no undo.
    const { container: folded } = mount({ onUndo: () => {}, accepted: () => true, onAccept: () => {} });
    expect(folded.querySelectorAll(".dl")).toHaveLength(0);
    expect(folded.querySelector(".hunk-head")!.className).toContain("hunk-accepted");
    expect(screen.getByText(/Accepted, 4 lines folded/)).toBeTruthy();
    expect(screen.queryByText("Revert hunk")).toBeNull();
    expect(screen.getByText(/Accepted, 4 lines/).closest("button")!.getAttribute("aria-pressed")).toBe("true");
  });

  it("closes an accepted hunk over 160ms: a row as tall as its lines stands in their place and shrinks to nothing, then goes", async () => {
    const { createSignal } = await import("solid-js");
    const rect = HTMLElement.prototype.getBoundingClientRect;
    HTMLElement.prototype.getBoundingClientRect = function () {
      return { ...rect.call(this), height: this.tagName === "TR" ? 20 : 0 } as DOMRect;
    };
    try {
      const [acc, setAcc] = createSignal<number[]>([]);
      const { container } = mount({ accepted: (i) => acc().includes(i), onAccept: () => {} });
      expect(container.querySelectorAll(".dl")).toHaveLength(4);
      setAcc([0]);
      // The lines are gone and their place stands at their height, about to close.
      expect(container.querySelectorAll(".dl")).toHaveLength(0);
      const fold = container.querySelector<HTMLElement>(".hunk-fold-inner");
      expect(fold).not.toBeNull();
      expect(fold!.style.height).toBe("80px");
      await new Promise((r) => setTimeout(r, 30));
      expect(fold!.style.height).toBe("0px");
      await new Promise((r) => setTimeout(r, 220));
      expect(container.querySelector(".hunk-fold")).toBeNull();
      expect(container.querySelector(".hunk-head")!.className).toContain("hunk-accepted");
    } finally {
      HTMLElement.prototype.getBoundingClientRect = rect;
    }
  });

  it("offers to undo a hunk only when allowed", () => {
    const undone: number[] = [];
    mount({ onUndo: (i) => undone.push(i) });
    fireEvent.click(screen.getByText("Revert hunk"));
    expect(undone).toEqual([0]);
    mount();
    expect(screen.getAllByText("Revert hunk")).toHaveLength(1);
  });
});
