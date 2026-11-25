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
