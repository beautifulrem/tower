/**
 * Review state that must survive a restart: which files you have viewed
 * (reset when a file's diff changes), draft comments, and the snapshot you
 * last reviewed (for "only what changed since then").
 */
import type { DiffFile } from "../gen/DiffFile";
import type { ReviewComment } from "../gen/ReviewComment";

const read = <T>(key: string, fallback: T): T => {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
};
const write = (key: string, value: unknown) => localStorage.setItem(key, JSON.stringify(value));

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

export const viewed = {
  get: (goal: string): Record<string, string> => read(`tower.viewed.${goal}`, {}),
  set: (goal: string, path: string, hash: string | null) => {
    const v = viewed.get(goal);
    if (hash) v[path] = hash;
    else delete v[path];
    write(`tower.viewed.${goal}`, v);
  },
};

export const drafts = {
  get: (goal: string): ReviewComment[] => read(`tower.drafts.${goal}`, []),
  set: (goal: string, list: ReviewComment[]) =>
    list.length ? write(`tower.drafts.${goal}`, list) : localStorage.removeItem(`tower.drafts.${goal}`),
};

export const lastReviewed = {
  get: (goal: string): string | null => localStorage.getItem(`tower.reviewed.${goal}`),
  set: (goal: string, pin: string) => localStorage.setItem(`tower.reviewed.${goal}`, pin),
};
