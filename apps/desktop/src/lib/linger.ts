/**
 * A list whose departed items stay a moment longer, flagged, so a card that
 * was answered can fold away (160ms) instead of vanishing on the next inbox
 * update. The item objects are the same ones the source list held, so a
 * keyed `<For>` keeps their DOM; each one's place is kept until it goes.
 * With reduced motion the moment is zero and nothing lingers.
 */
import { createComputed, createMemo, createSignal, on } from "solid-js";

export const LINGER_MS = 160;

export interface Lingering<T> {
  /** The source list, with items that just left still in their places. */
  list: () => T[];
  /** Whether an item (by key) is on its way out. */
  leaving: (key: string) => boolean;
}

/** Zero under reduced motion, so a departed item leaves at once (the exit has no motion to play). */
export function lingerMs(ms = LINGER_MS): number {
  return typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : ms;
}

export function linger<T>(source: () => T[], key: (t: T) => string, ms: number = lingerMs()): Lingering<T> {
  const [gone, setGone] = createSignal<Map<string, T>>(new Map(), { equals: false });
  let order: string[] = [];
  let previous: T[] = [];
  createComputed(
    on(source, (next) => {
      const keys = new Set(next.map(key));
      const left = previous.filter((t) => !keys.has(key(t)));
      previous = next;
      if (!left.length || ms <= 0) return;
      setGone((m) => {
        for (const t of left) m.set(key(t), t);
        return m;
      });
      const ids = left.map(key);
      setTimeout(
        () =>
          setGone((m) => {
            for (const k of ids) m.delete(k);
            return m;
          }),
        ms,
      );
    }),
  );
  const list = createMemo(() => {
    const now = source();
    const byKey = new Map(now.map((t) => [key(t), t]));
    const out: T[] = [];
    const seen = new Set<string>();
    // Items keep the place they had; those still here come first in their old order, then the newcomers.
    for (const k of order) {
      const t = byKey.get(k) ?? (gone().get(k) as T | undefined);
      if (t === undefined || seen.has(k)) continue;
      out.push(t);
      seen.add(k);
    }
    for (const t of now) if (!seen.has(key(t))) out.push(t);
    order = out.map(key);
    return out;
  });
  return { list, leaving: (k) => gone().has(k) };
}
