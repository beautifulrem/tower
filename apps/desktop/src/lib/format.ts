/** Coarse, quiet time and number formats (docs/12 §12.6.4), in the interface locale. */
import { locale, t } from "./i18n";

const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

/**
 * The one age format, everywhere a time is said relative to now: under three
 * hours the heartbeat's own `duration` form ("5m ago", "1h 40m ago" / "5 分钟前",
 * "1 小时 40 分前"), so one screen never says "1h 40m", "6 min ago" and "2 h ago"
 * about neighbouring minutes; beyond that whole hours, yesterday, days.
 */
export function ago(at: number | null | undefined, now = Date.now()): string {
  if (!at) return "—";
  const d = Math.max(0, now - at);
  if (d < 45_000) return t("format.justNow");
  if (d < 3 * HOUR) return t("format.durationAgo", { d: duration(Math.max(d, MIN), false) });
  if (d < DAY) return t("format.hoursAgo", { n: Math.round(d / HOUR) });
  if (d < 2 * DAY) return t("format.yesterday");
  return t("format.daysAgo", { n: Math.round(d / DAY) });
}

/**
 * Elapsed duration as "42s", "3m", "1h 20m"; sub-second only when `precise`.
 * A precise duration is a reading in a table column and keeps its unit
 * letters in both languages. An imprecise one is said in a phrase ("silent
 * for 4m", "4m ago"), and in Chinese a phrase says its units in words —
 * "4 分钟", "1 小时 20 分" — as the board's "5 分钟前" does.
 */
export function duration(ms: number, precise = true): string {
  const words = !precise && locale() === "zh-CN";
  if (ms < 1_000) return precise ? `${ms}ms` : words ? "不到 1 秒" : "<1s";
  const s = Math.round(ms / 1_000);
  if (s < 60) return words ? `${s} 秒` : `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return words ? `${m} 分钟` : `${m}m`;
  if (words) return m % 60 ? `${Math.floor(m / 60)} 小时 ${m % 60} 分` : `${Math.floor(m / 60)} 小时`;
  return `${Math.floor(m / 60)}h ${m % 60}m`;
}

/** 24-hour "HH:MM" in both languages. */
export function clock(at: number): string {
  const d = new Date(at);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

/** Two moments the clock would write the same way: a log writes the minute once and leaves the rows under it quiet. */
export function sameMinute(a: number, b: number): boolean {
  return Math.floor(a / MIN) === Math.floor(b / MIN);
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

/** Grouped digits in the interface locale (1,234 in both, but follows the locale). */
export function count(n: number): string {
  return n.toLocaleString(locale());
}
