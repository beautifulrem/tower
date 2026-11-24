/**
 * Goals with a pass that is not evidence (its must-fail canary passed too),
 * learned from every goal detail read, alongside the summaries' own
 * `progress.not_evidence` (which the board and the sidebar read first).
 */
import { createSignal } from "solid-js";

const [ids, setIds] = createSignal<ReadonlySet<string>>(new Set());

export const isDiscounted = (id: string | undefined): boolean => !!id && ids().has(id);

/**
 * The one verdict every surface asks before it draws a seal, a green glyph or "Ready to accept": is the goal's pass not
 * evidence? (The supervisor's flag on the summary, or a tampered canary learned from a detail.)
 */
export const notEvidence = (g: { id?: string; progress?: { not_evidence?: boolean } | null } | null | undefined): boolean =>
  !!g && (!!g.progress?.not_evidence || isDiscounted(g.id));

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
