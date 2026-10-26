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

export interface ReviewState {
  viewed: Record<string, string>;
  drafts: Draft[];
  reviewed: string | null;
}

const parse = <T>(raw: string | undefined | null, fallback: T): T => {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
};

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
    viewed: parse(stored.viewed, legacy?.viewed ?? {}),
    drafts: parse(stored.drafts, legacy?.drafts ?? []),
    reviewed: stored.reviewed ?? legacy?.reviewed ?? null,
  };
  if (legacy) {
    void api.setUiState(goal, "viewed", JSON.stringify(state.viewed)).catch(() => {});
    if (state.drafts.length) void api.setUiState(goal, "drafts", JSON.stringify(state.drafts)).catch(() => {});
    if (state.reviewed) void api.setUiState(goal, "reviewed", state.reviewed).catch(() => {});
  }
  return state;
}

function migrateLegacy(goal: string): ReviewState | null {
  const keys = [`tower.viewed.${goal}`, `tower.drafts.${goal}`, `tower.reviewed.${goal}`];
  if (!keys.some((k) => localStorage.getItem(k) !== null)) return null;
  const s: ReviewState = {
    viewed: parse(localStorage.getItem(keys[0]), {}),
    drafts: parse(localStorage.getItem(keys[1]), []),
    reviewed: localStorage.getItem(keys[2]),
  };
  keys.forEach((k) => localStorage.removeItem(k));
  return s;
}

export const persist = {
  viewed: (goal: string, v: Record<string, string>) => void api.setUiState(goal, "viewed", JSON.stringify(v)).catch(() => {}),
  drafts: (goal: string, list: Draft[]) =>
    void api.setUiState(goal, "drafts", list.length ? JSON.stringify(list) : null).catch(() => {}),
  reviewed: (goal: string, pin: string) => void api.setUiState(goal, "reviewed", pin).catch(() => {}),
};
