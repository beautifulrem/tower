/**
 * The words a reader is given: in Chinese, none of the supervisor's English (D51, D86), and a schedule said in words
 * beside its cron (D20).
 */
import { expect, type Page, test } from "@playwright/test";

import { enrichConsole } from "./rich";
import { FIXTURES_ZH, fixtures, openTower, settled } from "./tauri";

const CJK = /[㐀-鿿]/;
const WORDS = /[A-Za-z]{3,}[ ,.'’][A-Za-z ,.'’]*[A-Za-z]{3,}/;

/**
 * What the English supervisor wrote that the Chinese one did not: each clause of English words in the English views (the
 * demo seeded by a supervisor running in English) that appears nowhere in the Chinese views (the same demo, seeded in
 * Chinese). Test output, commands, paths, code and the prompts Tower sends the agent are the same in both, so they are
 * not among them.
 */
function englishSaid(): string[] {
  const strings = (v: unknown, out: string[] = []): string[] => {
    if (typeof v === "string") out.push(v.replace(/\s+/g, " "));
    else if (v && typeof v === "object") for (const x of Object.values(v)) strings(x, out);
    return out;
  };
  const zh = strings(fixtures("zh-CN")).join("\n");
  const said = new Set<string>();
  for (const s of strings(fixtures("en")))
    for (const clause of s.split(/[;:!?()]|\.\s/)) {
      const c = clause.trim();
      if (c.length >= 14 && WORDS.test(c) && !CJK.test(c) && !zh.includes(c)) said.add(c);
    }
  return [...said];
}

/** The English sentences from `said` on the page, in its text and in the names and titles it gives a screen reader or a pointer. */
async function englishOn(page: Page, said: string[]): Promise<string[]> {
  const text = await page.evaluate(() => {
    const parts = [document.body.innerText];
    for (const el of document.querySelectorAll("[title], [aria-label]")) parts.push(el.getAttribute("title") ?? "", el.getAttribute("aria-label") ?? "");
    return parts.join("\n").replace(/\s+/g, " ");
  });
  return said.filter((s) => text.includes(s));
}

const ROUTES = ["overview", "inbox", "goal/G-0001", "goal/G-0002", "goal/G-0003", "goal/G-0004", "review/G-0001", "review/G-0003"];

test.describe("in Chinese, the supervisor's words are Chinese", () => {
  test.skip(!FIXTURES_ZH, "needs the Chinese supervisor's views (E2E_FIXTURES_ZH; tools/e2e.sh dumps them)");

  test("the check finds the English supervisor's words when a Chinese interface is given them, as it once was", async ({ page }) => {
    const said = englishSaid();
    expect(said.length).toBeGreaterThan(10);
    // The Chinese interface on the English supervisor's views: what D86 saw.
    await openTower(page, "inbox", { enrich: (F) => (F.settings = { ...F.settings, language: "zh-CN" }) });
    await settled(page, "inbox");
    expect(await englishOn(page, said)).not.toEqual([]);
  });

  for (const route of ROUTES)
    test(`${route} shows none of the supervisor's English`, async ({ page }) => {
      await openTower(page, route, { lang: "zh-CN" });
      await settled(page, route);
      expect(await englishOn(page, englishSaid())).toEqual([]);
    });
});

// Review baseline, R-P3-02 (D20): a schedule was its raw cron alone. It is said in words, the cron after them.
for (const [lang, words] of [["en", "Weekdays 02:00"], ["zh-CN", "工作日 02:00"]] as const)
  test(`Operations says when each schedule runs in words, its cron beside them (${lang})`, async ({ page }) => {
    await openTower(page, "operations", { lang, enrich: enrichConsole });
    await settled(page, "operations");
    const when = page.locator(".data-table td.ops-when").first();
    await expect(when).toContainText(words);
    await expect(when).toContainText("0 2 * * 1-5");
    // The words come first: read before the cron.
    expect((await when.innerText()).indexOf(words)).toBeLessThan((await when.innerText()).indexOf("0 2 * * 1-5"));
  });
