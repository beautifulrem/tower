/**
 * Review state that must survive a restart: which files you have viewed
 * (reset when a file's diff changes), draft comments, and the snapshot you
 * last reviewed (for "only what changed since then").
 *
 * It lives in the supervisor's SQLite (per data directory, keyed by goal),
 * so two data directories never share a `G-0001`. Loaded once when a review
 * opens; writes go through asynchronously.
 */
import type { DiffFile } from "../gen/DiffFile";
import type { ReviewComment } from "../gen/ReviewComment";
import { api } from "./api";

/** A draft comment: a review comment, or one anchored to a deleted (old) line. */
export interface Draft extends ReviewComment {
  /** Old-side line number when the comment is on a deleted line. */
  old?: number | null;
}

/** A cheap content hash of a file's diff (djb2 over its hunks). */
export function fileHash(f: DiffFile): string {
  let h = 5381;
  for (const hunk of f.hunks)
    for (const l of hunk.lines) {
      const s = l.kind + l.text;
      for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
    }
  return `${f.path}:${h >>> 0}:${f.additions}:${f.deletions}`;
}

export type Layout = "unified" | "split";

/**
 * Hunks you accepted — your reading marks, nothing in the workspace. They
 * belong to one diff (`range`: the snapshot pair the hunks were cut from, as
 * `from..pin`); when the snapshot changes under the review, the hunks are
 * different hunks and the marks start over.
 */
export interface AcceptedHunks {
  range: string;
  /** Hunk indices per file path. */
  files: Record<string, number[]>;
}

export interface ReviewState {
  viewed: Record<string, string>;
  drafts: Draft[];
  reviewed: string | null;
  /** Side-by-side or unified, remembered per goal. */
  layout: Layout;
  accepted: AcceptedHunks | null;
}

/** What was saved, if it is JSON of the shape `ok` expects; else the fallback (a "null" or "{}" must not break the review). */
const parse = <T>(raw: string | undefined | null, fallback: T, ok: (v: unknown) => boolean): T => {
  if (!raw) return fallback;
  try {
    const v: unknown = JSON.parse(raw);
    return ok(v) ? (v as T) : fallback;
  } catch {
    return fallback;
  }
};
const isMap = (v: unknown) => typeof v === "object" && v !== null && !Array.isArray(v);
const isViewed = (v: unknown) => isMap(v) && Object.values(v as object).every((h) => typeof h === "string");
const isDrafts = (v: unknown) => Array.isArray(v) && v.every(isMap);
const isAccepted = (v: unknown) => isMap(v) && typeof (v as AcceptedHunks).range === "string" && isMap((v as AcceptedHunks).files);

/** Loads a goal's review state, migrating any pre-SQLite localStorage copy once. */
export async function loadReviewState(goal: string): Promise<ReviewState> {
  let stored: Record<string, string> = {};
  try {
    stored = await api.uiState(goal);
  } catch {
    stored = {};
  }
  const legacy = migrateLegacy(goal);
  const state: ReviewState = {
    viewed: parse(stored.viewed, legacy?.viewed ?? {}, isViewed),
    drafts: parse(stored.drafts, legacy?.drafts ?? [], isDrafts),
    reviewed: stored.reviewed ?? legacy?.reviewed ?? null,
    layout: stored.layout === "split" ? "split" : "unified",
    accepted: parse<AcceptedHunks | null>(stored.accepted, null, isAccepted),
  };
  if (legacy) {
    // The browser's copy goes only once SQLite has it: after a failed write, the next open migrates it again.
    void Promise.all([
      api.setUiState(goal, "viewed", JSON.stringify(state.viewed)),
      state.drafts.length && api.setUiState(goal, "drafts", JSON.stringify(state.drafts)),
      state.reviewed && api.setUiState(goal, "reviewed", state.reviewed),
    ]).then(() => legacyKeys(goal).forEach((k) => localStorage.removeItem(k)), () => {});
  }
  return state;
}

const legacyKeys = (goal: string) => [`tower.viewed.${goal}`, `tower.drafts.${goal}`, `tower.reviewed.${goal}`];

function migrateLegacy(goal: string): ReviewState | null {
  const keys = legacyKeys(goal);
  if (!keys.some((k) => localStorage.getItem(k) !== null)) return null;
  return {
    viewed: parse(localStorage.getItem(keys[0]), {}, isViewed),
    drafts: parse(localStorage.getItem(keys[1]), [], isDrafts),
    reviewed: localStorage.getItem(keys[2]),
    layout: "unified",
    accepted: null,
  };
}

export const persist = {
  viewed: (goal: string, v: Record<string, string>) => void api.setUiState(goal, "viewed", JSON.stringify(v)).catch(() => {}),
  drafts: (goal: string, list: Draft[]) =>
    void api.setUiState(goal, "drafts", list.length ? JSON.stringify(list) : null).catch(() => {}),
  reviewed: (goal: string, pin: string) => void api.setUiState(goal, "reviewed", pin).catch(() => {}),
  layout: (goal: string, layout: Layout) => void api.setUiState(goal, "layout", layout === "split" ? "split" : null).catch(() => {}),
  accepted: (goal: string, a: AcceptedHunks | null) =>
    void api.setUiState(goal, "accepted", a && Object.keys(a.files).length ? JSON.stringify(a) : null).catch(() => {}),
};
