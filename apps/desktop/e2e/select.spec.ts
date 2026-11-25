/**
 * Tower is an app, not a page: only text you may want to copy selects (claims, findings, code, a decision's question).
 * Words set aside for the eye (a crowded row's readings, a screen reader's summary) are never in what you copy.
 */
import { expect, test } from "@playwright/test";

import { enrichRich } from "./rich";
import { openTower, settled } from "./tauri";

// Review 13 (record only): copying a board row or a PR line took the readings a step had set aside and the screen
// reader's summary with it. Selection is the stylesheet's to grant: the dev server adds no prefix, and WebKit reads
// only `-webkit-user-select`, so without the prefix every word on every view was selectable here.
for (const route of ["overview", "inbox", "goal/G-0001", "review/G-0003"])
  test(`on ${route} no hidden word is selectable, and the text you may copy is`, async ({ page }) => {
    await page.setViewportSize({ width: 1241, height: 900 });
    await openTower(page, route, { enrich: enrichRich });
    await settled(page, route);
    const r = await page.evaluate(() => {
      // The value that applies: an element's own, else the nearest one above it (`auto` defers to the parent).
      const sel = (e: Element | null): string => {
        for (; e; e = e.parentElement) {
          const s = getComputedStyle(e) as CSSStyleDeclaration & { webkitUserSelect?: string };
          const v = s.webkitUserSelect || s.userSelect;
          if (v && v !== "auto") return v;
        }
        return "auto";
      };
      const hidden = [...document.querySelectorAll(".sr-only, .g-id > *, .pr-line *")].filter((e) => e.textContent?.trim());
      return {
        hidden: hidden.length,
        selectable: hidden.filter((e) => sel(e) !== "none").map((e) => `${e.className}: ${e.textContent!.trim().slice(0, 40)}`),
        body: sel(document.body),
        text: [...document.querySelectorAll(".claim-text, .decision-question, .code")].slice(0, 3).map(sel),
      };
    });
    expect(r.body, "the app selects nothing by default").toBe("none");
    expect(r.hidden, "hidden words to check").toBeGreaterThan(0);
    expect(r.selectable, "hidden words a copy would take").toEqual([]);
    for (const v of r.text) expect(v, "text you may copy selects").toBe("text");
  });

// Review 15, P3-03 (D146): the machine values you take elsewhere select — a goal's title, its id, a pin for `git show`,
// a command to rerun, a path — a triple-click takes the whole value (a double-click a hash in a range of two) without
// moving you. Before, none of them did.
for (const [route, view, sels] of [
  ["goal/G-0001", ".goal-page", [[".goal-title", 3], [".goal-head .code-val", 3], [".seal-pin", 3], [".criterion-cmd", 3]]],
  ["review/G-0003", ".review", [[".review-title", 3], [".review-head .row > .code-val", 3], [".review-stat-pins", 2], [".file-path", 3]]],
] as const)
  test(`on ${route} a title, an id, a pin, a command and a path select whole`, async ({ page }) => {
    await page.setViewportSize({ width: 1600, height: 900 });
    await openTower(page, route, { enrich: enrichRich });
    await settled(page, route);
    for (const [sel, clickCount] of sels) {
      const el = page.locator(sel).first();
      await expect(el, sel).toBeVisible();
      const b = (await el.boundingBox())!;
      await page.evaluate(() => getSelection()!.removeAllRanges());
      await page.mouse.click(b.x + Math.min(12, b.width / 2), b.y + b.height / 2, { clickCount });
      const got = await page.evaluate(() => getSelection()!.toString().replace(/\s+/g, " ").trim());
      const text = await el.evaluate((e) => e.textContent!.replace(/\s+/g, " ").trim());
      if (clickCount === 3) expect(got, `${sel} selects`).toContain(text);
      else {
        expect(got, `${sel}: a double-click takes a hash`).toMatch(/^[0-9a-f]{7}$/);
        expect(text).toContain(`@${got}`);
      }
      await expect(page.locator(view), `${sel}: the click keeps you on ${route}`).toBeVisible();
    }
  });
