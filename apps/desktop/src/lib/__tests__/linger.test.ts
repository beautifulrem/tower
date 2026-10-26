import { createRoot, createSignal } from "solid-js";
import { describe, expect, it, vi } from "vitest";

import { linger } from "../linger";

type Card = { id: string };

describe("linger", () => {
  it("keeps a departed item in its place, flagged, for the moment it needs to leave", () => {
    vi.useFakeTimers();
    createRoot((dispose) => {
      const a = { id: "a" };
      const b = { id: "b" };
      const c = { id: "c" };
      const [cards, setCards] = createSignal<Card[]>([a, b, c]);
      const l = linger(cards, (x) => x.id, 160);
      expect(l.list()).toEqual([a, b, c]);
      // b is answered: it stays where it was, on its way out; the others do not move.
      setCards([a, c]);
      expect(l.list()).toEqual([a, b, c]);
      expect(l.leaving("b")).toBe(true);
      expect(l.leaving("a")).toBe(false);
      vi.advanceTimersByTime(170);
      expect(l.list()).toEqual([a, c]);
      expect(l.leaving("b")).toBe(false);
      // A newcomer lands after the ones still here.
      const d = { id: "d" };
      setCards([d, a, c]);
      expect(l.list()).toEqual([a, c, d]);
      dispose();
    });
    vi.useRealTimers();
  });

  it("lets nothing linger when the moment is zero (reduced motion)", () => {
    createRoot((dispose) => {
      const a = { id: "a" };
      const [cards, setCards] = createSignal<Card[]>([a]);
      const l = linger(cards, (x) => x.id, 0);
      setCards([]);
      expect(l.list()).toEqual([]);
      expect(l.leaving("a")).toBe(false);
      dispose();
    });
  });
});
