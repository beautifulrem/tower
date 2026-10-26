/** Coarse, quiet time and number formats (docs/12 §12.6.4). */

const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

/** "刚刚", "3分", "2时", "昨天", "3天" — a glanceable age. */
export function ago(at: number | null | undefined, now = Date.now()): string {
  if (!at) return "—";
  const d = Math.max(0, now - at);
  if (d < 45_000) return "刚刚";
  if (d < HOUR) return `${Math.round(d / MIN)}分`;
  if (d < DAY) return `${Math.round(d / HOUR)}时`;
  if (d < 2 * DAY) return "昨天";
  return `${Math.round(d / DAY)}天`;
}

/** Elapsed duration as "42s", "3m", "1h 20m"; sub-second only when `precise`. */
export function duration(ms: number, precise = true): string {
  if (ms < 1_000) return precise ? `${ms}ms` : "<1s";
  const s = Math.round(ms / 1_000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m`;
  return `${Math.floor(m / 60)}h ${m % 60}m`;
}

export function clock(at: number): string {
  const d = new Date(at);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

export function usd(v: number): string {
  if (v === 0) return "$0";
  if (v < 0.01) return "<$0.01";
  return `$${v.toFixed(2)}`;
}

/** Budget limit without trailing zeros: $5, $7.5. */
export function usdLimit(v: number): string {
  return `$${Number.isInteger(v) ? v : v.toFixed(1)}`;
}

export function short(sha: string | null | undefined): string {
  return sha ? sha.slice(0, 7) : "—";
}

export function count(n: number): string {
  return n.toLocaleString("en-US");
}
