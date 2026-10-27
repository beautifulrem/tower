import { describe, expect, it, vi } from "vitest";

vi.mock("../store", () => ({ state: { settings: { language: "en" } } }));

const { back, go, route, transitionKind } = await import("../nav");

describe("view transitions", () => {
  it("name their kind: a page turn between two reviews, a change of space into or out of one, a plain view change elsewhere", () => {
    expect(transitionKind({ name: "overview" }, { name: "inbox" })).toBe("view");
    expect(transitionKind({ name: "inbox" }, { name: "review", id: "G-0001" })).toBe("space");
    expect(transitionKind({ name: "review", id: "G-0001" }, { name: "review", id: "G-0002" })).toBe("page");
    expect(transitionKind({ name: "review", id: "G-0002" }, { name: "goal", id: "G-0002" })).toBe("space");
  });

  it("are told to the document as each route changes, back included", () => {
    const kinds: string[] = [];
    const dvt = document as unknown as { startViewTransition?: (cb: () => void) => { finished: Promise<void> } };
    dvt.startViewTransition = (cb) => {
      kinds.push(document.documentElement.dataset.transition!);
      cb();
      return { finished: Promise.resolve() };
    };
    try {
      go({ name: "inbox" });
      go({ name: "review", id: "G-0001" });
      go({ name: "review", id: "G-0002" });
      expect(route()).toEqual({ name: "review", id: "G-0002" });
      back();
      back();
      expect(route()).toEqual({ name: "inbox" });
      expect(kinds).toEqual(["view", "space", "page", "page", "space"]);
    } finally {
      delete dvt.startViewTransition;
      go({ name: "overview" });
    }
  });
});
