/**
 * Fuzzy matching for the command palette: a subsequence match scored like
 * fzy — word starts and runs of consecutive characters score, gaps cost a
 * little, earlier matches win ties — with the matched positions returned so
 * the palette can show why a row is there.
 *
 * Chinese titles are matched twice: on the text itself and on their pinyin
 * initials (`pinyin.ts`), and the better of the two counts.
 */
import { hasHan, initialsKey } from "./pinyin";

export interface Match {
  score: number;
  /** Indices into the text (code points), in order. */
  positions: number[];
}

const SEP = /[\s\-_./:·()（）「」【】,，。]/;

function bonusAt(cps: string[], j: number): number {
  if (j === 0) return 3;
  const prev = cps[j - 1];
  if (SEP.test(prev)) return 3;
  const cur = cps[j];
  if (cur !== cur.toLowerCase() && prev === prev.toLowerCase() && prev !== prev.toUpperCase()) return 2; // camelCase
  return 0;
}

const CONSECUTIVE = 2;
const GAP = 0.1;

/** Scores `query` against `text`; null when it is not a subsequence. */
export function fuzzy(query: string, text: string): Match | null {
  const q = [...query.toLowerCase()];
  const cps = [...text];
  const tl = cps.map((c) => c.toLowerCase());
  const n = q.length;
  const m = cps.length;
  if (n === 0) return { score: 0, positions: [] };
  if (n > m) return null;
  // best[i][j]: best score with q[i] matched at t[j]; parent for backtracking.
  const best: number[][] = [];
  const parent: number[][] = [];
  for (let i = 0; i < n; i++) {
    best.push(new Array<number>(m).fill(-Infinity));
    parent.push(new Array<number>(m).fill(-1));
    let runBest = -Infinity; // max over k < j of best[i-1][k] + GAP*k
    let runArg = -1;
    for (let j = 0; j < m; j++) {
      if (i > 0) {
        const prev = best[i - 1][j - 1] ?? -Infinity;
        if (j > 0 && prev + GAP * (j - 1) > runBest) {
          runBest = prev + GAP * (j - 1);
          runArg = j - 1;
        }
      }
      if (q[i] !== tl[j]) continue;
      const base = 1 + bonusAt(cps, j);
      if (i === 0) {
        best[i][j] = base - GAP * j;
        continue;
      }
      let s = -Infinity;
      let p = -1;
      if (j > 0 && best[i - 1][j - 1] > -Infinity) {
        s = best[i - 1][j - 1] + base + CONSECUTIVE;
        p = j - 1;
      }
      if (runBest > -Infinity) {
        const g = runBest - GAP * (j - 1) + base;
        if (g > s) {
          s = g;
          p = runArg;
        }
      }
      best[i][j] = s;
      parent[i][j] = p;
    }
  }
  let end = -1;
  let score = -Infinity;
  for (let j = 0; j < m; j++) {
    if (best[n - 1][j] > score) {
      score = best[n - 1][j];
      end = j;
    }
  }
  if (end < 0) return null;
  const positions: number[] = [];
  for (let i = n - 1, j = end; i >= 0; i--) {
    positions.push(j);
    j = parent[i][j];
  }
  positions.reverse();
  return { score, positions };
}

/** The better of a direct match and a pinyin-initials match. */
export function matchText(query: string, text: string): Match | null {
  const direct = fuzzy(query, text);
  if (!hasHan(text) || !/^[\x20-\x7e]+$/.test(query)) return direct;
  const py = fuzzy(query, initialsKey(text));
  if (!py) return direct;
  if (!direct || py.score > direct.score) return py;
  return direct;
}

/** Splits text into runs for highlighting: `[text, matched]`. */
export function segments(text: string, positions: number[]): [string, boolean][] {
  const cps = [...text];
  const set = new Set(positions);
  const out: [string, boolean][] = [];
  for (let i = 0; i < cps.length; i++) {
    const hit = set.has(i);
    const last = out[out.length - 1];
    if (last && last[1] === hit) last[0] += cps[i];
    else out.push([cps[i], hit]);
  }
  return out;
}
