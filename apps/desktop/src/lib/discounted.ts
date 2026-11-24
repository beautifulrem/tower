/**
 * Goals with a pass that is not evidence (its must-fail canary passed too),
 * learned from every goal detail read, alongside the summaries' own
 * `progress.not_evidence` (which the board and the sidebar read first).
 */
import { createSignal } from "solid-js";

const [counts, setCounts] = createSignal<ReadonlyMap<string, number>>(new Map());
const asked = new Set<string>();

/** How many of the goal's passes don't count (tampered canaries), once a detail of it has been read; 0 before. */
export const discountedN = (id: string | undefined): number => (id && counts().get(id)) || 0;
export const isDiscounted = (id: string | undefined): boolean => discountedN(id) > 0;
/** True only the first time a goal nothing is known about is asked after: the caller then reads its detail, once. */
export const firstAsk = (id: string): boolean => !counts().has(id) && !asked.has(id) && !!asked.add(id);

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
  const n = d.criteria.filter((c) => c.canary === "tampered").length;
  if (counts().get(id) !== n) setCounts((prev) => new Map(prev).set(id, n));
  return d;
}
