/**
 * Goals with a pass that is not evidence (its must-fail canary passed too),
 * learned from every goal detail read, alongside the summaries' own
 * `progress.not_evidence` (which the board and the sidebar read first).
 */
import { createSignal } from "solid-js";

import type { Qualified } from "../gen/Qualified";
import { locale, t } from "./i18n";

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

type Crit = { canary?: string | null; verified?: { passed: boolean; stale: boolean } | null };

/**
 * Whether a criterion's pass doesn't count, as the supervisor counts: its must-fail canary passed too, or a high-severity
 * finding of the latest verification stands, which holds every pass until you have looked.
 */
export const heldOrTampered = (c: Crit, sentinels?: ReadonlyArray<{ severity: number }> | null): boolean =>
  c.canary === "tampered" || !!sentinels?.some((h) => h.severity >= 3);

/**
 * How many fresh passes don't count: those whose canary passed, or, when the supervisor flags the goal, every fresh pass
 * it left out of `verified` (a high finding holds them all). Derived from the criteria, so the line under a criterion and
 * the total above it say the same thing.
 */
export const discountedIn = (criteria: ReadonlyArray<Crit> | null | undefined, p?: { verified: number; not_evidence?: boolean } | null): number => {
  const cs = criteria ?? [];
  const tampered = cs.filter((c) => c.canary === "tampered").length;
  return p?.not_evidence ? Math.max(tampered, cs.filter((c) => c.verified?.passed && !c.verified.stale).length - p.verified) : tampered;
};

const CAVEATS = { test_machinery: "honesty.cavMachinery", assertions_unchecked: "honesty.cavAsserts", flaky: "honesty.cavFlaky" } as const;

/**
 * A counted pass's caveats, in words (the supervisor's `progress.qualified`, docs/07 §7.10.3): "Verified, with caveats"
 * says them wherever the seal is. None for a pass that doesn't count: that verdict says more.
 */
export const caveats = (g: { id?: string; progress?: { not_evidence?: boolean; qualified?: Qualified } | null } | null | undefined): string[] => {
  const q = !notEvidence(g) && g?.progress?.qualified;
  return q ? (Object.keys(CAVEATS) as (keyof Qualified)[]).filter((k) => q[k]).map((k) => t(CAVEATS[k])) : [];
};

/** Accepted, or merged since: a seal on it says the caveats were taken with it, not that they are to be looked at first. */
export const wasAccepted = (g: { state?: string } | null | undefined): boolean => g?.state === "accepted" || g?.state === "integrated";

/** Caveats as one phrase, joined as the interface language joins a list. */
export const caveatList = (why: string[]): string => why.join(locale() === "zh-CN" ? "、" : ", ");

/** Notes how many of the detail's passes don't count; returns it, for `.then(noteDetail)`. */
export function noteDetail<D extends { summary: { id: string; progress?: { verified: number; not_evidence?: boolean } }; criteria: ReadonlyArray<Crit> }>(d: D): D {
  if (!d?.summary) return d;
  const id = d.summary.id;
  const n = discountedIn(d.criteria, d.summary.progress);
  if (counts().get(id) !== n) setCounts((prev) => new Map(prev).set(id, n));
  return d;
}
