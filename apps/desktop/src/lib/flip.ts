/**
 * FLIP for the board: when a goal changes group (running → verifying) its
 * row is re-rendered under another scale mark. Instead of appearing there,
 * it is first drawn where it was and then moves — the instrument slides,
 * the list does not refresh. Pure geometry here; the DOM part is two small
 * functions. Nothing moves under reduced motion.
 */
export interface Box {
  top: number;
  left: number;
}

/** For every key present before and after, the offset that would put it back where it was (keys that did not move are left out). */
export function shifts(before: Map<string, Box>, after: Map<string, Box>): Map<string, Box> {
  const out = new Map<string, Box>();
  for (const [key, b] of after) {
    const a = before.get(key);
    if (!a) continue;
    const top = a.top - b.top;
    const left = a.left - b.left;
    if (Math.abs(top) >= 1 || Math.abs(left) >= 1) out.set(key, { top, left });
  }
  return out;
}

/** Where each `[data-${attr}]` element under `root` is right now. */
export function snapshot(root: ParentNode, attr: string): Map<string, Box> {
  const m = new Map<string, Box>();
  for (const el of root.querySelectorAll<HTMLElement>(`[data-${attr}]`)) {
    const r = el.getBoundingClientRect();
    m.set(el.dataset[attr]!, { top: r.top, left: r.left });
  }
  return m;
}

/** Plays the move for every element that changed place since `before`: from its old place to its new one, in `ms`. */
export function play(root: ParentNode, attr: string, before: Map<string, Box>, ms: number, easing: string) {
  if (ms <= 0) return;
  const moved = shifts(before, snapshot(root, attr));
  for (const el of root.querySelectorAll<HTMLElement>(`[data-${attr}]`)) {
    const d = moved.get(el.dataset[attr]!);
    if (!d || typeof el.animate !== "function") continue;
    el.animate([{ transform: `translate(${d.left}px, ${d.top}px)` }, { transform: "none" }], { duration: ms, easing });
  }
}
