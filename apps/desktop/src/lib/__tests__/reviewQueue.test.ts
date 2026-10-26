import { beforeEach, describe, expect, it } from "vitest";

import { advanceQueue, clearQueue, queuePosition, reviewQueue, startQueue } from "../reviewQueue";

describe("review queue", () => {
  beforeEach(() => clearQueue());

  it("steps through the goals in order and clears itself at the end", () => {
    expect(startQueue(["G-1", "G-2", "G-3"])).toBe("G-1");
    expect(queuePosition("G-2")).toEqual({ i: 2, n: 3 });
    expect(advanceQueue("G-1")).toBe("G-2");
    expect(queuePosition("G-2")).toEqual({ i: 1, n: 2 });
    expect(advanceQueue("G-2")).toBe("G-3");
    expect(advanceQueue("G-3")).toBeNull();
    expect(reviewQueue()).toEqual([]);
  });

  it("ignores a goal that is not queued", () => {
    startQueue(["G-1"]);
    expect(advanceQueue("G-9")).toBeNull();
    expect(reviewQueue()).toEqual(["G-1"]);
    expect(queuePosition("G-9")).toBeNull();
  });

  it("survives a reload through sessionStorage", () => {
    startQueue(["G-1", "G-2"]);
    expect(JSON.parse(sessionStorage.getItem("tower.reviewQueue")!)).toEqual(["G-1", "G-2"]);
  });
});
