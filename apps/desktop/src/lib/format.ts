/** Coarse, quiet time and number formats (docs/12 §12.6.4), in the interface locale. */
import { locale, t } from "./i18n";

const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

/** A glanceable age: "刚刚" / "just now", "5 分钟前" / "5 min ago", "昨天" / "yesterday", "3 天前" / "3 days ago". */
export function ago(at: number | null | undefined, now = Date.now()): string {
  if (!at) return "—";
  const d = Math.max(0, now - at);
  if (d < 45_000) return t("format.justNow");
  if (d < HOUR) return t("format.minutesAgo", { n: Math.max(1, Math.round(d / MIN)) });
  if (d < DAY) return t("format.hoursAgo", { n: Math.round(d / HOUR) });
  if (d < 2 * DAY) return t("format.yesterday");
  return t("format.daysAgo", { n: Math.round(d / DAY) });
}

/**
 * Elapsed duration as "42s", "3m", "1h 20m"; sub-second only when `precise`.
 * The unit letters read the same in both interface languages.
 */
export function duration(ms: number, precise = true): string {
  if (ms < 1_000) return precise ? `${ms}ms` : "<1s";
  const s = Math.round(ms / 1_000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m`;
  return `${Math.floor(m / 60)}h ${m % 60}m`;
}

/** 24-hour "HH:MM" in both languages. */
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

/** Grouped digits in the interface locale (1,234 in both, but follows the locale). */
export function count(n: number): string {
  return n.toLocaleString(locale());
}
