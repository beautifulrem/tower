/**
 * Goals with a pass that is not evidence (its must-fail canary passed too),
 * learned from every goal detail read, alongside the summaries' own
 * `progress.not_evidence` (which the board and the sidebar read first).
 */
import { createSignal } from "solid-js";

const [ids, setIds] = createSignal<ReadonlySet<string>>(new Set());

export const isDiscounted = (id: string | undefined): boolean => !!id && ids().has(id);

/** Notes whether the detail has a tampered pass; returns it, for `.then(noteDetail)`. */
export function noteDetail<D extends { summary: { id: string }; criteria: ReadonlyArray<{ canary?: string | null }> }>(d: D): D {
  if (!d?.summary) return d;
  const id = d.summary.id;
  const on = d.criteria.some((c) => c.canary === "tampered");
  if (on !== ids().has(id))
    setIds((prev) => {
      const next = new Set(prev);
      if (on) next.add(id);
      else next.delete(id);
      return next;
    });
  return d;
}
