/**
 * Word-level diff for adjacent deleted/added line pairs: the changed spans
 * inside a line, so a one-character edit is visible without reading both
 * lines letter by letter. Token LCS on words, spaces and punctuation; lines
 * that differ almost entirely get no marks (the whole line is the change).
 */
import type { DiffLine } from "../gen/DiffLine";

export type Range = [start: number, end: number];

const TOKEN = /\w+|\s+|[^\w\s]/g;

function tokens(s: string): string[] {
  return s.match(TOKEN) ?? [];
}

/** Changed character ranges in `a` (old) and `b` (new). */
export function changedRanges(a: string, b: string): { old: Range[]; new: Range[] } | null {
  const ta = tokens(a);
  const tb = tokens(b);
  if (!ta.length || !tb.length || ta.length * tb.length > 40_000) return null;
  const n = ta.length;
  const m = tb.length;
  // LCS table.
  const dp: Uint16Array[] = Array.from({ length: n + 1 }, () => new Uint16Array(m + 1));
  for (let i = n - 1; i >= 0; i--)
    for (let j = m - 1; j >= 0; j--) dp[i][j] = ta[i] === tb[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
  const same = dp[0][0];
  // Too different: the line itself is the change.
  if (same * 2 < Math.min(n, m)) return null;
  const oldR: Range[] = [];
  const newR: Range[] = [];
  let i = 0;
  let j = 0;
  let pa = 0;
  let pb = 0;
  const push = (list: Range[], s: number, e: number) => {
    const last = list[list.length - 1];
    if (last && last[1] === s) last[1] = e;
    else list.push([s, e]);
  };
  while (i < n && j < m) {
    if (ta[i] === tb[j]) {
      pa += ta[i].length;
      pb += tb[j].length;
      i++;
      j++;
    } else if (dp[i + 1][j] >= dp[i][j + 1]) {
      push(oldR, pa, pa + ta[i].length);
      pa += ta[i].length;
      i++;
    } else {
      push(newR, pb, pb + tb[j].length);
      pb += tb[j].length;
      j++;
    }
  }
  while (i < n) {
    push(oldR, pa, pa + ta[i].length);
    pa += ta[i].length;
    i++;
  }
  while (j < m) {
    push(newR, pb, pb + tb[j].length);
    pb += tb[j].length;
    j++;
  }
  return { old: oldR, new: newR };
}

/**
 * For each line index in a hunk, the changed ranges, pairing the k-th
 * deleted line of a run with the k-th added line that follows it.
 */
export function hunkWordRanges(lines: DiffLine[]): Map<number, Range[]> {
  const out = new Map<number, Range[]>();
  let i = 0;
  while (i < lines.length) {
    if (lines[i].kind !== "del") {
      i++;
      continue;
    }
    const delStart = i;
    while (i < lines.length && lines[i].kind === "del") i++;
    const addStart = i;
    while (i < lines.length && lines[i].kind === "add") i++;
    const pairs = Math.min(addStart - delStart, i - addStart);
    for (let k = 0; k < pairs; k++) {
      const d = delStart + k;
      const a = addStart + k;
      const r = changedRanges(lines[d].text, lines[a].text);
      if (!r) continue;
      if (r.old.length) out.set(d, r.old);
      if (r.new.length) out.set(a, r.new);
    }
  }
  return out;
}

/** Splits `text` starting at `offset` into [piece, marked] segments by the ranges. */
export function segment(text: string, offset: number, ranges: Range[]): [string, boolean][] {
  const segs: [string, boolean][] = [];
  let pos = 0;
  const end = text.length;
  for (const [s, e] of ranges) {
    const rs = Math.max(0, s - offset);
    const re = Math.min(end, e - offset);
    if (re <= pos || rs >= end) continue;
    if (rs > pos) segs.push([text.slice(pos, rs), false]);
    segs.push([text.slice(Math.max(rs, pos), re), true]);
    pos = re;
  }
  if (pos < end) segs.push([text.slice(pos), false]);
  return segs.length ? segs : [[text, false]];
}
