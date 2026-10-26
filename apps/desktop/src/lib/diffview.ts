/**
 * Pure helpers for the review's diff pane: the hidden regions between hunks
 * (so context can be expanded from the file on either side) and the pairing
 * of deleted with added lines for the side-by-side view.
 */
import type { DiffFile } from "../gen/DiffFile";
import type { DiffLine } from "../gen/DiffLine";
import type { Hunk } from "../gen/Hunk";

export interface HunkSpan {
  oldStart: number;
  oldEnd: number;
  newStart: number;
  newEnd: number;
}

/** The line ranges a hunk covers, from its `@@ -a,b +c,d @@` header. */
export function hunkSpan(h: Hunk): HunkSpan | null {
  const m = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/.exec(h.header);
  if (!m) return null;
  const oldStart = Number(m[1]);
  const oldCount = m[2] === undefined ? 1 : Number(m[2]);
  const newStart = Number(m[3]);
  const newCount = m[4] === undefined ? 1 : Number(m[4]);
  // A zero-length side starts one line earlier in git's convention.
  return {
    oldStart: oldCount === 0 ? oldStart + 1 : oldStart,
    oldEnd: oldCount === 0 ? oldStart : oldStart + oldCount - 1,
    newStart: newCount === 0 ? newStart + 1 : newStart,
    newEnd: newCount === 0 ? newStart : newStart + newCount - 1,
  };
}

/**
 * A hidden region of unchanged lines: before the first hunk (`index` 0),
 * between hunks, or after the last one (`newTo` is null until the file's
 * length is known). `shift` turns a new-side number into the old-side one.
 */
export interface Gap {
  index: number;
  newFrom: number;
  newTo: number | null;
  shift: number;
}

export function gapsOf(file: DiffFile, totalNewLines: number | null): Gap[] {
  if (file.binary || file.status === "added" || file.status === "deleted") return [];
  const spans = file.hunks.map(hunkSpan);
  if (spans.some((s) => !s)) return [];
  const out: Gap[] = [];
  const first = spans[0]!;
  if (first.newStart > 1) out.push({ index: 0, newFrom: 1, newTo: first.newStart - 1, shift: first.oldStart - first.newStart });
  for (let i = 1; i < spans.length; i++) {
    const a = spans[i - 1]!;
    const b = spans[i]!;
    if (b.newStart > a.newEnd + 1) out.push({ index: i, newFrom: a.newEnd + 1, newTo: b.newStart - 1, shift: a.oldEnd - a.newEnd });
  }
  const last = spans[spans.length - 1]!;
  const tail = totalNewLines === null ? null : totalNewLines;
  if (tail === null || tail > last.newEnd) {
    out.push({ index: spans.length, newFrom: last.newEnd + 1, newTo: tail, shift: last.oldEnd - last.newEnd });
  }
  return out;
}

/** How much of a gap is revealed: lines adjacent to the hunk above (`top`) and below (`bottom`). */
export interface Reveal {
  top: number;
  bottom: number;
}

export const STEP = 20;

/** Context lines of a gap as diff lines, from the new side's text. */
export function contextLines(lines: string[], gap: Gap, from: number, to: number): DiffLine[] {
  const out: DiffLine[] = [];
  for (let n = from; n <= to; n++) {
    if (n < 1 || n > lines.length) break;
    out.push({ kind: "context", old_no: n + gap.shift, new_no: n, text: lines[n - 1] });
  }
  return out;
}

/**
 * The revealed parts of a gap: a block attached below the hunk above, a
 * block attached above the hunk below, and whether anything stays hidden.
 */
export function revealOf(gap: Gap, reveal: Reveal | undefined, total: number | null): { top: [number, number] | null; bottom: [number, number] | null; hidden: number | null } {
  const end = gap.newTo ?? total;
  const size = end === null ? null : end - gap.newFrom + 1;
  if (!reveal || size === null) return { top: null, bottom: null, hidden: size };
  const top = Math.min(reveal.top, size);
  const bottom = Math.min(reveal.bottom, size - top);
  return {
    top: top > 0 ? [gap.newFrom, gap.newFrom + top - 1] : null,
    bottom: bottom > 0 ? [end! - bottom + 1, end!] : null,
    hidden: size - top - bottom,
  };
}

/** Lines of a file's text, without the phantom empty line after a final newline. */
export function splitLines(text: string): string[] {
  const lines = text.split("\n");
  if (lines.length && lines[lines.length - 1] === "") lines.pop();
  return lines;
}

/** One side-by-side row: indices into the hunk's lines, or null for a blank side. */
export interface SplitRow {
  left: number | null;
  right: number | null;
}

/** Pairs the k-th deleted line of a change with its k-th added line; context sits on both sides. */
export function splitRows(lines: DiffLine[]): SplitRow[] {
  const out: SplitRow[] = [];
  let i = 0;
  while (i < lines.length) {
    const l = lines[i];
    if (l.kind === "context") {
      out.push({ left: i, right: i });
      i++;
      continue;
    }
    const dels: number[] = [];
    const adds: number[] = [];
    while (i < lines.length && lines[i].kind === "del") dels.push(i++);
    while (i < lines.length && lines[i].kind === "add") adds.push(i++);
    const n = Math.max(dels.length, adds.length);
    for (let k = 0; k < n; k++) out.push({ left: dels[k] ?? null, right: adds[k] ?? null });
  }
  return out;
}
