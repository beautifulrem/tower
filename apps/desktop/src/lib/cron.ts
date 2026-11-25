/** A schedule's cron expression in words, for the shapes people write most. */
import { locale, t } from "./i18n";

const num = (s: string) => /^\d+$/.test(s);

/**
 * The expression said in words (in UTC, as it is written), or null for any other shape: those are shown as typed, and
 * the expression always stands beside the words, since it is what the user wrote and edits.
 */
export function cronWords(expr: string): string | null {
  const f = expr.trim().split(/\s+/);
  if (f.length !== 5 || f[3] !== "*") return null;
  const [mi, h, dom, , dow] = f;
  const any = dom === "*" && dow === "*";
  if (h === "*" && any) {
    if (/^\*\/\d+$/.test(mi)) return t("ops.cronEveryMin", { n: mi.slice(2) });
    return num(mi) ? t("ops.cronHourly", { m: mi.padStart(2, "0") }) : null;
  }
  if (!num(mi) || !num(h)) return null;
  const at = `${h.padStart(2, "0")}:${mi.padStart(2, "0")}`;
  if (any) return t("ops.cronDaily", { t: at });
  if (dom !== "*") return num(dom) && dow === "*" ? t("ops.cronMonthly", { d: dom, t: at }) : null;
  if (dow === "1-5") return t("ops.cronWeekdays", { t: at });
  // 1 January 2023 was a Sunday: day n of the week is that date plus n (7 is Sunday again).
  const day = (n: number) => new Intl.DateTimeFormat(locale(), { weekday: "long", timeZone: "UTC" }).format(Date.UTC(2023, 0, 1 + (n % 7)));
  return /^[0-7]$/.test(dow) ? t("ops.cronWeekly", { d: day(+dow), t: at }) : null;
}
