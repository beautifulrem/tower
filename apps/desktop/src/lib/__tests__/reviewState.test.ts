import { beforeEach, describe, expect, it, vi } from "vitest";

const ui = vi.hoisted(() => ({ stored: {} as Record<string, string>, fail: false, writes: [] as string[] }));
vi.mock("../api", () => ({
  api: {
    uiState: async () => ui.stored,
    setUiState: async (_goal: string, key: string) => {
      if (ui.fail) throw "the store is locked";
      ui.writes.push(key);
    },
  },
}));

const { loadReviewState } = await import("../reviewState");

beforeEach(() => {
  ui.stored = {};
  ui.fail = false;
  ui.writes = [];
  localStorage.clear();
});

describe("saved review state", () => {
  it("that is valid JSON of the wrong shape reads as nothing saved, so the review still opens", async () => {
    ui.stored = { viewed: "null", drafts: "{}", accepted: '{"range":1}' };
    expect(await loadReviewState("G-0001")).toEqual({ viewed: {}, drafts: [], reviewed: null, layout: "unified", accepted: null });
    ui.stored = { viewed: "[1]", drafts: "null", accepted: "null" };
    expect(await loadReviewState("G-0001")).toMatchObject({ viewed: {}, drafts: [], accepted: null });
  });

  it("from before SQLite leaves the browser only once it is written to SQLite", async () => {
    localStorage.setItem("tower.viewed.G-0002", JSON.stringify({ "a.ts": "h" }));
    localStorage.setItem("tower.reviewed.G-0002", "abc1234");
    ui.fail = true;
    expect(await loadReviewState("G-0002")).toMatchObject({ viewed: { "a.ts": "h" }, reviewed: "abc1234" });
    await vi.waitFor(() => expect(ui.writes).toEqual([]));
    expect(localStorage.getItem("tower.viewed.G-0002")).not.toBeNull();
    ui.fail = false;
    await loadReviewState("G-0002");
    await vi.waitFor(() => expect(localStorage.getItem("tower.viewed.G-0002")).toBeNull());
    expect(localStorage.getItem("tower.reviewed.G-0002")).toBeNull();
    expect(ui.writes.sort()).toEqual(["reviewed", "viewed"]);
  });
});
