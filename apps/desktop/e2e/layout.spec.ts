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
const statModes = [
  { lang: "en", compare: false },
  { lang: "en", compare: true },
  { lang: "zh-CN", compare: false },
  { lang: "zh-CN", compare: true },
] as const;
for (const route of ["review/G-0003", "review/G-0001"]) for (const mode of statModes) {
  test(`${route} (${mode.lang}${mode.compare ? ", comparing runs" : ""}): the header's stats drop whole, never cut a word, at every desktop width`, async ({ page }) => {
    await openTower(page, route, { lang: mode.lang, enrich: enrichRich });
    await settled(page, route);
    if (mode.compare) {
      // Comparing runs puts the two run pickers on the same line.
      await page.locator(".review-stats .scope-switch .tab").last().click();
      await expect(page.locator(".review-stats .timeline-compare")).toBeVisible();
    }
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

// The merge queue at the narrow end: a goal id is one token ("G-0003", never "G-" over "0003"), and a branch too long
// for its place ends in an ellipsis on one line, its whole name in the title.
test("operations: the merge queue keeps a goal id whole and a long branch on one line", async ({ page }) => {
  await page.setViewportSize({ width: 1040, height: 640 });
  await openTower(page, "operations", {
    lang: "en",
    enrich: (F) => {
      enrichRich(F);
      const pid = F.projects?.[0]?.id ?? "p1";
      F.mergeQueue = [
        { goal_id: "G-0001", project_id: pid, goal_title: "Fix the cart total", branch: "tower/G-0001-fix-cart-total", position: 0, status: "ready", conflict_files: [] },
        { goal_id: "G-0003", project_id: pid, goal_title: "Clean up cart edge cases", branch: "tower/G-0003-cart-edge-cases-and-rounding-at-tax-boundaries", position: 1, status: "conflict", conflict_files: ["src/cart.js", "test/cart.test.js"] },
      ];
    },
  });
  await settled(page, "operations");
  await expect(page.locator(".mq-row")).toHaveCount(2);
  const rows = await page.locator(".mq-row").evaluateAll((trs) =>
    trs.map((tr) => {
      const id = tr.querySelector<HTMLElement>("button.code-val")!;
      const branch = [...tr.querySelectorAll<HTMLElement>("code.code-val")].find((c) => !c.closest(".mq-conflicts"))!;
      const lines = (el: HTMLElement) => Math.round(el.getBoundingClientRect().height / (parseFloat(getComputedStyle(el).lineHeight) || 16));
      return {
        id: id.textContent,
        idLines: lines(id),
        branchLines: lines(branch),
        branchCut: branch.scrollWidth > branch.clientWidth + 1,
        ellipsis: getComputedStyle(branch).textOverflow,
        title: branch.title,
        text: branch.textContent,
        past: tr.getBoundingClientRect().right > tr.closest(".data-table-wrap")!.getBoundingClientRect().right + 1,
      };
    }),
  );
  for (const r of rows) {
    expect(r.idLines, `${r.id} on one line`).toBe(1);
    expect(r.branchLines, `${r.text} on one line`).toBe(1);
    expect(r.past, `${r.id}'s row inside the table`).toBe(false);
    expect(r.title).toBe(r.text);
    if (r.branchCut) expect(r.ellipsis).toBe("ellipsis");
  }
  // The long one does not fit at this width: it is the one cut.
  expect(rows[1].branchCut).toBe(true);
});

// The 2px pen on a row's left edge ("you are here", a register's rule) is a straight line: the corners on its side are
// square, or an inset rule on a rounded ground bends round the corner into a bracket.
for (const route of ["overview", "settings", "goal/G-0001", "review/G-0001"]) {
  test(`${route}: every 2px left rule runs straight down its edge`, async ({ page }) => {
    await openTower(page, route, { lang: "en", enrich: enrichRich });
    await settled(page, route);
    const bent = await page.evaluate(() => {
      const found: string[] = [];
      for (const el of document.querySelectorAll<HTMLElement>("body *")) {
        const cs = getComputedStyle(el);
        const r = el.getBoundingClientRect();
        if (r.width < 1 || r.height < 1) continue;
        const ruled = (parseFloat(cs.borderLeftWidth) >= 2 && parseFloat(cs.borderLeftWidth) > parseFloat(cs.borderTopWidth)) || /inset 2px 0px 0px/.test(cs.boxShadow) || / 2px 0px 0px( 0px)? inset/.test(cs.boxShadow);
        if (ruled && (parseFloat(cs.borderTopLeftRadius) > 0 || parseFloat(cs.borderBottomLeftRadius) > 0)) found.push(`${el.tagName.toLowerCase()}.${[...el.classList].join(".")} r${cs.borderTopLeftRadius}`);
      }
      return [...new Set(found)];
    });
    expect(bent).toEqual([]);
  });
}

// Concentric radii (the design lock): a container inside a card (an output block, a well) never repeats the card's
// radius — a 6px block in a 6px card reads as a second card. Controls keep the control radius wherever they sit.
for (const route of ["inbox", "goal/G-0001", "goal/G-0004", "goal/G-0005"]) {
  test(`${route}: no container repeats the radius of the card it sits in`, async ({ page }) => {
    await openTower(page, route, { lang: "en", enrich: enrichRich });
    await settled(page, route);
    const same = await page.evaluate(() => {
      const radius = (el: Element) => parseFloat(getComputedStyle(el).borderTopLeftRadius) || 0;
      const painted = (el: Element) => {
        const cs = getComputedStyle(el);
        return !/rgba\(0, 0, 0, 0\)|transparent/.test(cs.backgroundColor) || parseFloat(cs.borderTopWidth) > 0;
      };
      const control = "button, input, textarea, select, .btn, .chip, kbd, .kbd";
      const found: string[] = [];
      for (const el of document.querySelectorAll<HTMLElement>(".content *")) {
        const r = radius(el);
        if (r < 6 || el.matches(control) || !painted(el) || el.getBoundingClientRect().width < 1) continue;
        let a = el.parentElement;
        while (a && !(radius(a) > 0 && painted(a))) a = a.parentElement;
        if (a && radius(a) === r) found.push(`${a.tagName.toLowerCase()}.${a.classList[0]} ⊃ ${el.tagName.toLowerCase()}.${[...el.classList].join(".")} both ${r}px`);
      }
      return [...new Set(found)];
    });
    expect(same).toEqual([]);
  });
}
