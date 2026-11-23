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

// The review header is one line of stats: when they don't fit, a whole stat goes (the least needed first), and no
// word is cut through its letters ("2 revi") — a clipped word reads as a different word.
for (const route of ["review/G-0003", "review/G-0001"]) {
  test(`${route}: the header's stats drop whole, never cut a word, at every desktop width`, async ({ page }) => {
    await openTower(page, route, { lang: "en", enrich: enrichRich });
    await settled(page, route);
    const out: string[] = [];
    for (const w of [1024, 1040, 1240, 1241, 1283, 1440, 1560, 1561]) {
      await page.setViewportSize({ width: w, height: 900 });
      await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
      const cut = await page.evaluate(() => {
        const stats = document.querySelector(".review-stats")!;
        const found: string[] = [];
        const walker = document.createTreeWalker(stats, NodeFilter.SHOW_TEXT);
        for (let n = walker.nextNode(); n; n = walker.nextNode()) {
          if (!n.textContent!.trim() || n.parentElement!.closest(".sr-only")) continue;
          const range = document.createRange();
          range.selectNodeContents(n);
          const r = range.getBoundingClientRect();
          if (r.width < 1) continue;
          // The box the text is clipped to: every clipping ancestor up to and including the stats line.
          let left = -Infinity;
          let right = Infinity;
          let top = -Infinity;
          let bottom = Infinity;
          let ellipsis = false;
          for (let e: Element | null = n.parentElement; e; e = e.parentElement) {
            const cs = getComputedStyle(e);
            if (cs.overflowX !== "visible") {
              const b = e.getBoundingClientRect();
              left = Math.max(left, b.left);
              right = Math.min(right, b.right);
              top = Math.max(top, b.top);
              bottom = Math.min(bottom, b.bottom);
              if (e === n.parentElement && cs.textOverflow === "ellipsis") ellipsis = true;
            }
            if (e === stats) break;
          }
          const outside = r.right <= left + 0.5 || r.left >= right - 0.5 || r.bottom <= top + 0.5 || r.top >= bottom - 0.5;
          const inside = r.left >= left - 0.5 && r.right <= right + 0.5 && r.top >= top - 0.5 && r.bottom <= bottom + 0.5;
          if (!outside && !inside && !ellipsis) found.push(`"${n.textContent!.trim()}" ${Math.round(r.left)}..${Math.round(r.right)} in ${Math.round(left)}..${Math.round(right)}`);
        }
        return found;
      });
      if (cut.length) out.push(`${w}: ${cut.join(" | ")}`);
    }
    expect(out).toEqual([]);
  });
}
