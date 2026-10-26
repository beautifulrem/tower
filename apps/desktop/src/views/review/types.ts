/** Shared shapes of the review page: where a comment hangs, what a diff block is. */
import type { Hunk } from "../../gen/Hunk";
import type { ReviewComment } from "../../gen/ReviewComment";
import type { Gap, Reveal } from "../../lib/diffview";
import type { Draft } from "../../lib/reviewState";

/** Where a comment hangs: a new-side line, an old-side (deleted) line, or the file. */
export type Anchor = { path: string; line: number | null; old?: number | null };

export const sameAnchor = (a: Anchor, b: Anchor) =>
  a.path === b.path && (a.line ?? null) === (b.line ?? null) && (a.old ?? null) === (b.old ?? null);

/** What the agent receives: a deleted-line comment carries the old line number. */
export function toComment(d: Draft): ReviewComment {
  if (d.old) return { path: d.path, line: null, old_line: d.old, text: d.text };
  return { path: d.path, line: d.line, text: d.text };
}

export type Reveals = Record<number, Reveal>;
export type Panel = "accept" | "changes" | "verify" | null;

/**
 * A row group in a file's diff: a real hunk (with its index in the file, so
 * it can be undone), a synthetic context hunk revealed from the file text
 * (no index), a hunk header, or a fold between hunks.
 */
export type Block =
  | { kind: "hunk"; hunk: Hunk; index: number | null }
  | { kind: "head"; header: string; index: number }
  | { kind: "gap"; gap: Gap; hidden: number | null; header: string | null; index: number | null };

export type Composing = (Anchor & { editing?: number }) | null;
