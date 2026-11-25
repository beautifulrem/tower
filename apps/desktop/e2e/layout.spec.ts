/**
 * No view runs past the window's edge at the widths a desktop window takes, including the edges of each layout band
 * (1240/1241, 1280, 1560): a fixed column that does not fit pushes a whole row out of view.
 */
import { expect, test } from "@playwright/test";

import { enrichConsole, enrichRich } from "./rich";
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

// The pin pair is the first stat to go, but only for want of room: a review with room for it shows it (G-0003 at
// 1440; G-0001's long criteria line takes that room until 1600), and at no width does it show cut or half off the line.
for (const [route, roomy] of [["review/G-0003", 1440], ["review/G-0001", 1600]] as const) {
  test(`${route}: the pin pair shows whenever the line has room for it`, async ({ page }) => {
    await openTower(page, route, { lang: "en", enrich: enrichRich });
    await settled(page, route);
    const seen = async (w: number) => {
      await page.setViewportSize({ width: w, height: 900 });
      await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
      return page.evaluate(() => {
        const stats = document.querySelector(".review-stats")!.getBoundingClientRect();
        const pins = document.querySelector(".review-stat-pins");
        if (!pins) return "none";
        const r = pins.getBoundingClientRect();
        if (r.width < 1 || r.top >= stats.bottom - 0.5) return "gone";
        const group = pins.parentElement!.getBoundingClientRect();
        return r.right <= Math.min(stats.right, group.right) + 0.5 && r.bottom <= stats.bottom + 0.5 ? "whole" : "cut";
      });
    };
    expect(await seen(roomy)).toBe("whole");
    for (const w of [1024, 1241, 1283, 1440, 1560]) expect(["whole", "gone"]).toContain(await seen(w));
  });
}

// The pins give way before anything in the verification group does, and leave no hole: the counts group is as wide
// as what it shows.
for (const route of ["review/G-0003", "review/G-0001"]) for (const lang of ["en", "zh-CN"] as const) {
  test(`${route} (${lang}): the pins go before the verification line loses a word, and leave no gap`, async ({ page }) => {
    await openTower(page, route, { lang, enrich: enrichRich });
    await settled(page, route);
    const out: string[] = [];
    for (const w of [1241, 1283, 1360, 1440, 1500, 1560, 1600, 1800]) {
      await page.setViewportSize({ width: w, height: 900 });
      await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
      const bad = await page.evaluate(() => {
        const group = document.querySelector<HTMLElement>(".review-stats > .review-stat-group")!;
        const pins = group.querySelector<HTMLElement>(".review-stat-pins")!;
        const verify = document.querySelector<HTMLElement>(".review-verify");
        const shown = [...group.children].filter((c) => (c as HTMLElement).offsetParent !== null && c.getBoundingClientRect().top < group.getBoundingClientRect().bottom - 0.5);
        const used = shown.length ? shown.at(-1)!.getBoundingClientRect().right - group.getBoundingClientRect().left : 0;
        const found: string[] = [];
        if (group.getBoundingClientRect().width - used > 1) found.push(`gap ${Math.round(group.getBoundingClientRect().width - used)}px`);
        const pinsShown = shown.includes(pins);
        // A part drops when the group wraps onto its hidden line, or when the criteria bar does inside itself.
        const wraps = (el: HTMLElement | null | undefined) => !!el && el.scrollHeight > el.clientHeight + 1;
        const dropped = wraps(verify) || wraps(verify?.querySelector<HTMLElement>(".criteria-bar"));
        if (pinsShown && dropped) found.push("pins shown while the verification line dropped a part");
        return found;
      });
      if (bad.length) out.push(`${w}: ${bad.join(", ")}`);
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

// "You are here" is a ground, not a lit edge: the selected sidebar row, settings clause and board row take the
// selection ground with all four corners alike, and no rule down one side (the stripe reads as a template's accent).
for (const [route, sel] of [
  ["overview", ".sidebar .side-row.active"],
  ["overview", ".g-row.selected"],
  ["settings", ".settings-index a.current"],
] as const) {
  test(`${route}: ${sel} is marked by its ground, with no rule down its edge`, async ({ page }) => {
    await openTower(page, route, { lang: "en", enrich: enrichRich });
    await settled(page, route);
    for (let i = 0; i < 12 && !(await page.locator(sel).count()); i++) await page.keyboard.press("j");
    const s = await page.locator(sel).first().evaluate((el) => {
      const cs = getComputedStyle(el);
      return { shadow: cs.boxShadow, rule: cs.borderLeftWidth, tl: cs.borderTopLeftRadius, tr: cs.borderTopRightRadius, bg: cs.backgroundColor };
    });
    expect(s.shadow).toBe("none");
    expect(parseFloat(s.rule)).toBe(0);
    expect(s.tl).toBe(s.tr);
    expect(s.bg).not.toBe("rgba(0, 0, 0, 0)");
  });
}

// The "Needs you" tray keeps its amber while you are on that page and while the pointer is on the row: the selection's
// ink must not wash the one colour that says something waits for you.
test("the Needs-you tray stays amber on its own page and under the pointer", async ({ page }) => {
  await openTower(page, "inbox", { lang: "en", enrich: enrichRich });
  await settled(page, "inbox");
  const icon = page.locator(".sidebar .side-row.active .side-icon");
  const amber = () => icon.evaluate((el) => {
    const probe = document.createElement("span");
    probe.style.color = "var(--st-attention)";
    el.appendChild(probe);
    const want = getComputedStyle(probe).color;
    probe.remove();
    return getComputedStyle(el).color === want;
  });
  expect(await amber()).toBe(true);
  await icon.hover();
  expect(await amber()).toBe(true);
});

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

// A long goal title gives way, and nothing beside it does: in a card's head, the review's header (under the accept sheet
// too) and Operations' tables, a kind, a time, a PR reading, an id, a verdict and a size each keep their one line, the
// tables stay inside their frame, and a title cut short says itself whole in its tooltip. Three lengths: at the quick
// start's cap (56 columns), mid, and far past it, as a goal written in the new-goal form can be.
const LONG_TITLES = {
  en: [
    "Make checkout totals agree with the ledger for every curr",
    "Make checkout totals and tax rounding agree with the ledger export",
    "Make checkout totals, discounts and tax rounding agree with the finance team's ledger export for every currency and every retry path",
  ],
  "zh-CN": [
    "让结账总额与财务导出的账本在每种货币下一致并补测",
    "让结账总额和税额的四舍五入与财务导出的账本一致",
    "让结账总额、折扣和税额的四舍五入在每种货币和每条重试路径下都与财务团队导出的账本完全一致，并补上缺失的边界测试",
  ],
};
for (const lang of ["en", "zh-CN"] as const)
  for (const [n, title] of LONG_TITLES[lang].entries())
    test(`a ${["capped", "mid", "long"][n]} goal title (${lang}) is the only thing cut short, at every desktop width`, async ({ page }) => {
      test.setTimeout(120_000);
      const retitle = (F: Record<string, any>) => {
        enrichRich(F);
        enrichConsole(F);
        const ids = ["G-0001", "G-0003"];
        for (const g of F.goals) if (ids.includes(g.id)) g.title = title;
        for (const id of ids) if (F[`goal-${id}`]) F[`goal-${id}`].summary.title = title;
        for (const i of F.inbox) if (ids.includes(i.goal_id)) i.goal_title = title;
        for (const q of F.mergeQueue ?? []) if (ids.includes(q.goal_id)) q.goal_title = title;
        for (const s of F.storageInventory?.goals ?? []) if (ids.includes(s.goal_id)) s.title = title;
      };
      const out: string[] = [];
      for (const route of ["inbox", "review/G-0001", "review/G-0003", "operations"]) {
        await page.goto("about:blank");
        await page.setViewportSize({ width: 1100, height: 900 });
        await openTower(page, route, { lang, enrich: retitle });
        await settled(page, route);
        for (const w of [1100, 1240, 1440, 1800]) {
          await page.setViewportSize({ width: w, height: 900 });
          await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
          const bad = await page.evaluate((title) => {
            const found: string[] = [];
            const range = document.createRange();
            for (const el of document.querySelectorAll<HTMLElement>(".content *")) {
              if (!el.getClientRects().length || el.closest(".sr-only")) continue;
              const texts = [...el.childNodes].filter((c) => c.nodeType === 3 && c.textContent?.trim());
              const own = texts.map((c) => c.textContent).join("").trim();
              // A short label (a kind, a time, an id, a size, a verdict): one line, however long the title beside it.
              if (own && own.length <= 14 && !/^[\s\d,.]+$/.test(own)) {
                const tops = texts.flatMap((c) => (range.selectNodeContents(c), [...range.getClientRects()])).filter((r) => r.width > 0).map((r) => r.top).sort((a, b) => a - b);
                if (tops.some((t, i) => i > 0 && t - tops[i - 1] > 6)) found.push(`"${own}" (${el.className}) on ${new Set(tops.map(Math.round)).size} lines`);
              }
              // A title cut short says itself whole on hover.
              if (el.scrollWidth > el.clientWidth + 1 && getComputedStyle(el).textOverflow === "ellipsis" && el.textContent!.includes(title.slice(0, 12)) && el.closest("[title]")?.getAttribute("title") !== title)
                found.push(`cut title in ${el.tagName.toLowerCase()}.${el.classList[0]} has no tooltip`);
            }
            for (const wrap of document.querySelectorAll<HTMLElement>(".data-table-wrap"))
              if (wrap.scrollWidth > wrap.clientWidth + 1) found.push(`table runs past its frame (${wrap.scrollWidth} > ${wrap.clientWidth})`);
            return found;
          }, title);
          out.push(...bad.map((b) => `${route} @${w}: ${b}`));
        }
      }
      expect([...new Set(out)]).toEqual([]);
    });
