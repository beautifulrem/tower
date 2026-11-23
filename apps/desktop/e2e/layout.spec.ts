/**
 * No view runs past the window's edge at the widths a desktop window takes, including the edges of each layout band
 * (1240/1241, 1280, 1560): a fixed column that does not fit pushes a whole row out of view.
 */
import { expect, test } from "@playwright/test";

import { enrichRich } from "./rich";
import { openTower, settled } from "./tauri";

for (const route of ["overview", "inbox", "goal/G-0001", "review/G-0003", "settings", "learning", "operations", "new"]) {
  test(`${route} fits every desktop width without running past the edge`, async ({ page }) => {
    await openTower(page, route, { enrich: enrichRich });
    await settled(page, route).catch(() => {});
    const out: string[] = [];
    for (const w of [1024, 1240, 1241, 1283, 1440, 1561]) {
      await page.setViewportSize({ width: w, height: 900 });
      await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
      const bad = await page.evaluate(() => {
        const found: string[] = [];
        const de = document.documentElement;
        if (de.scrollWidth > de.clientWidth + 1) found.push(`page ${de.scrollWidth}>${de.clientWidth}`);
        const content = document.querySelector(".content");
        if (!content) return found;
        const edge = content.getBoundingClientRect().right;
        for (const el of content.querySelectorAll<HTMLElement>("*")) {
          // Inside a scroller, running long is the scroller's job.
          if (el.parentElement?.closest(".data-table-wrap, pre, [class*=scroll], [class*=diff]")) continue;
          const r = el.getBoundingClientRect();
          if (r.width > 0 && r.right > edge + 1) found.push(`${el.tagName.toLowerCase()}.${[...el.classList].join(".")} ${Math.round(r.right)}>${Math.round(edge)}`);
        }
        return found.slice(0, 3);
      });
      if (bad.length) out.push(`${w}: ${bad.join(" | ")}`);
    }
    expect(out).toEqual([]);
  });
}
