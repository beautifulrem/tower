/**
 * One verdict everywhere: a goal whose pass doesn't count (G-0001, a tampered canary) never reads "Ready to accept" or wears
 * the verifier's green on a surface that summarises it — the inbox card, the board's decision line, the peek, the live line —
 * and an aggregate (the PR's CI count) never wears it either. Plus the review queue's ⇧R from the board, the peek's R only
 * when there are changes, the cannot-run output said once, and the middle dot on the populated console pages.
 */
import { type Locator, type Page, expect, test } from "@playwright/test";

import { enrichConsole, enrichRich } from "./rich";
import { openReadings, openTower, settled, titleIn } from "./tauri";

/** Elements under `root` (and their drawn ::before/::after) whose colour, fill, stroke or ground is the verifier's green. */
const greens = (root: Locator) =>
  root.evaluate((root) => {
    const probe = document.createElement("i");
    probe.style.color = "var(--st-verified)";
    document.body.append(probe);
    const green = getComputedStyle(probe).color;
    probe.remove();
    const out: string[] = [];
    for (const el of [root, ...root.querySelectorAll("*")]) {
      if (!el.getClientRects().length) continue;
      for (const pseudo of [null, "::before", "::after"]) {
        const cs = getComputedStyle(el, pseudo);
        if (pseudo && cs.content === "none") continue;
        if ([cs.color, cs.fill, cs.stroke, cs.backgroundColor].includes(green)) out.push(`${(el as HTMLElement).className}${pseudo ?? ""}`);
      }
    }
    return out;
  });

/** Moves the board's selection with j until it rests on the line that holds `text`. */
async function selectLine(page: Page, text: string) {
  await expect
    .poll(
      async () => {
        const sel = page.locator(".overview .selected").filter({ hasText: text });
        if (await sel.count()) return true;
        await page.keyboard.press("j");
        return false;
      },
      { intervals: [120], timeout: 8000 },
    )
    .toBe(true);
}

test("a pass that doesn't count reads so on the inbox card: not Ready to accept, its seal withheld, no green", async ({ page }) => {
  await openTower(page, "inbox", { enrich: enrichRich });
  await settled(page, "inbox");
  // The group says what you do with these, not what the supervisor concluded.
  await expect(page.getByText("Review queue", { exact: true }).first()).toBeVisible();
  const card = page.locator(".decision").filter({ hasText: "Fix the cart total" }).filter({ has: page.locator(".seal") }).first();
  await expect(card).toBeVisible();
  await expect(card.locator(".decision-head")).not.toContainText("Ready to accept");
  await expect(card.locator(".decision-head")).toContainText("doesn't count");
  await expect(card.locator(".seal")).toHaveClass(/seal-tampered/);
  // Its high findings hold every pass, as the supervisor counts: none of the three counts.
  await expect(card.locator(".criteria-bar")).toContainText("3 don't count");
  expect(await greens(card.locator(".seal"))).toEqual([]);
});

test("on the board the same goal's decision line and peek say Passed, doesn't count; the peek's seal is withheld", async ({ page }) => {
  await openTower(page, "overview", { enrich: enrichRich });
  await settled(page, "overview");
  const line = page.locator(".decision-line").filter({ hasText: "Fix the cart total" }).filter({ hasText: /doesn.t count/ });
  await expect(line.first()).toBeVisible();
  expect(await page.locator(".decision-line").filter({ hasText: "Fix the cart total" }).filter({ hasText: "Ready to accept" }).count()).toBe(0);
  await selectLine(page, "Fix the cart total");
  await page.keyboard.press("Space");
  const peek = page.locator(".peek-drawer");
  await expect(peek).toHaveCount(1);
  await expect(peek).not.toContainText("Ready to accept");
  await expect(peek.locator(".seal").first()).toHaveClass(/seal-tampered/);
  expect(await greens(peek.locator(".seal").first())).toEqual([]);
  // The live line under the title: its word is the goal's status word, the same one.
  await expect(peek.locator(".live-line, .mode-badge").first()).toContainText(/doesn.t count/);
});

test("the PR's CI count is an aggregate: it never wears the verifier's green", async ({ page }) => {
  await openTower(page, "goal/G-0001", { enrich: enrichRich });
  await settled(page, "goal/G-0001");
  const pr = page.locator(".pr-line").first();
  await expect(pr).toBeVisible();
  await expect(pr).toContainText("3");
  expect(await greens(pr)).toEqual([]);
});

test("⇧R on the board starts the review queue at the first goal to review", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await openTower(page, "overview", { enrich: enrichRich });
  await settled(page, "overview");
  await page.keyboard.press("Shift+R");
  await expect(page.locator(".review-head")).toBeVisible();
  expect(errors).toEqual([]);
});

test("the peek offers R only when the goal has changes; on a goal with none, R does nothing and throws nothing", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await openTower(page, "overview", { enrich: enrichRich });
  await settled(page, "overview");
  await selectLine(page, "Speed up the product list");
  await page.keyboard.press("Space");
  const peek = page.locator(".peek-drawer");
  await expect(peek).toHaveCount(1);
  await expect(peek.getByRole("button", { name: /^Review/ })).toHaveCount(0);
  await page.keyboard.press("r");
  await page.waitForTimeout(300);
  await expect(page.locator(".review-head")).toHaveCount(0);
  await expect(peek).toHaveCount(1);
  expect(errors).toEqual([]);
});

// The peek's ways out close the drawer and then go: every one of them lands, on a goal with changes and on one without.
for (const [title, key, lands] of [
  ["Fix the cart total", "r", ".review-head"],
  ["Clean up cart edge cases", "r", ".review-head"],
  ["Fix the cart total", "Enter", ".goal-page .criterion"],
  ["Align discount rules with the product doc", "Enter", ".goal-page .criterion"],
] as const) {
  test(`from the peek of "${title}", ${key} opens ${lands.startsWith(".review") ? "its review" : "its goal page"}, throwing nothing`, async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await openTower(page, "overview", { enrich: enrichRich });
    await settled(page, "overview");
    await selectLine(page, title);
    await page.keyboard.press("Space");
    await expect(page.locator(".peek-drawer")).toHaveCount(1);
    await page.keyboard.press(key);
    await expect(page.locator(lands).first()).toBeVisible();
    await expect(page.locator(".peek-drawer")).toHaveCount(0);
    expect(errors).toEqual([]);
  });
}

test("the peek's Open the goal page button lands on that goal", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await openTower(page, "overview", { enrich: enrichRich });
  await settled(page, "overview");
  await selectLine(page, "Align discount rules with the product doc");
  await page.keyboard.press("Space");
  await page.locator(".peek-drawer").getByRole("button", { name: /Open the goal page/ }).click();
  await expect(page.locator(".goal-page h1, .goal-page .goal-title").first()).toContainText("Align discount rules");
  expect(errors).toEqual([]);
});

/** The rich demo without G-0001's PR and its CI card: its pass that doesn't count is the only thing to say about it. */
const noCi = (F: Record<string, any>) => {
  enrichRich(F);
  F.inbox = F.inbox.filter((i: any) => i.kind !== "ci_failed");
  for (const g of F.goals) if (g.id === "G-0001") g.pr = null;
  F["goal-G-0001"].summary.pr = null;
};

for (const lang of ["en", "zh-CN"] as const) {
  test(`with no CI card, a goal whose pass doesn't count is not filed under acceptance, and its board bar says so (${lang})`, async ({ page }) => {
    await page.setViewportSize({ width: 1100, height: 800 });
    await openTower(page, "overview", { enrich: noCi, lang });
    await settled(page, "overview");
    // G-0001's high findings hold every pass (summaries.rs `progress`): its three passes take the amber segments.
    const [accept, review, dc] = lang === "en" ? ["To accept", "To review", "3 don't count"] : ["待验收", "待评审", "3 项不作数"];
    // Neither the board nor the sidebar files anything under acceptance.
    for (const head of await page.locator(".board-group .scale-title, .sidebar .side-group-title").allInnerTexts()) expect(head).not.toContain(accept);
    const group = page.locator(".board-group").filter({ has: page.locator(".scale-title", { hasText: review }) }).first();
    const row = group.locator(".board-rows [role=listitem]").filter({ hasText: titleIn(lang, "Fix the cart total") }).first();
    await expect(row).toBeVisible();
    await expect(row.locator(".criteria-bar .seg-discounted")).toHaveCount(3);
    await expect(row.locator(".criteria-bar")).toContainText(dc);
    await expect(row.locator(".criteria-bar .discounted")).toBeVisible();
    // Whole inside its 11em cell at the narrow window, not cut at the cell's edge.
    const [words, cell] = [await row.locator(".criteria-bar .discounted").boundingBox(), await row.locator(".g-crit").boundingBox()];
    expect(words!.x + words!.width).toBeLessThanOrEqual(cell!.x + cell!.width + 0.5);
    for (const seg of await row.locator(".criteria-bar .seg-discounted").all()) expect(await greens(seg)).toEqual([]);
  });
}

test("when the pause card already prints the sandbox's refusal, the criterion's base line points to it instead of repeating it", async ({ page }) => {
  await openTower(page, "goal/G-0005", { enrich: enrichRich });
  await settled(page, "goal/G-0005");
  const card = page.locator(".goal-page .decision").first();
  await expect(card.locator(".decision-tail")).toContainText("deny(1) file-read-data /Users/you/node_modules/.bin");
  const c1 = page.locator(".goal-page .criterion").filter({ has: page.locator(".num", { hasText: /^C1$/ }) }).first();
  const line = c1.locator(".env-line");
  await expect(line).toContainText("the sandbox refused something it needed on the base");
  await expect(line).toContainText("its output is in the pause above");
  await expect(line.locator(".env-refused")).toHaveCount(0);
  // Exactly once on the page, and so is what kind of problem it is.
  const text = await page.locator(".goal-page").innerText();
  expect(text.split("deny(1) file-read-data").length - 1).toBe(1);
  expect(text.split(/not a test failure/i).length - 1).toBe(1);
});

test("in Chinese the supervisor's refusal (full-width colon, no \"refused\") is read the same way: said once, pointed to", async ({ page }) => {
  await openTower(page, "goal/G-0005", { enrich: enrichRich, lang: "zh-CN" });
  await settled(page, "goal/G-0005");
  const c1 = page.locator(".goal-page .criterion").filter({ has: page.locator(".num", { hasText: /^C1$/ }) }).first();
  const line = c1.locator(".env-line");
  await expect(line).toHaveCount(1);
  await expect(line).toContainText("输出见上方的暂停卡片");
  const text = await page.locator(".goal-page").innerText();
  expect(text.split("npm ERR! code 255").length - 1).toBe(1);
  expect(text.split("不是测试失败").length - 1).toBe(1);
});

test("back from a goal's review with Esc, the board selects that goal again", async ({ page }) => {
  await openTower(page, "overview", { enrich: enrichRich });
  await settled(page, "overview");
  await selectLine(page, "Clean up cart edge cases");
  await page.keyboard.press("r");
  await expect(page.locator(".review-head")).toBeVisible();
  await page.keyboard.press("Escape");
  await settled(page, "overview");
  await expect(page.locator(".overview .selected")).toHaveCount(1);
  await expect(page.locator(".overview .selected")).toContainText("Clean up cart edge cases");
});

test("a board line wears at most one ! mark", async ({ page }) => {
  await openTower(page, "overview", { enrich: enrichRich });
  await settled(page, "overview");
  const rows = page.locator(".overview .g-row");
  expect(await rows.count()).toBeGreaterThan(2);
  const counts = await rows.evaluateAll((rows) =>
    rows.map((r) => [r.getAttribute("data-goal"), [...r.querySelectorAll(".mark-attention")].filter((m) => m.getClientRects().length && getComputedStyle(m).display !== "none").length]),
  );
  for (const [id, n] of counts) expect(n, `${id}`).toBeLessThanOrEqual(1);
});

test("the palette lists the goals to review in the queue's order, the first ⇧R opens", async ({ page }) => {
  await openTower(page, "overview", { enrich: enrichRich });
  await settled(page, "overview");
  await page.keyboard.press("Meta+k");
  const items = page.locator(".palette-list [role=option]").filter({ hasText: /^Review G-\d+:/ });
  await expect(items.first()).toBeVisible();
  expect((await items.allInnerTexts()).map((s) => s.match(/G-\d+/)![0])).toEqual(["G-0001", "G-0003"]);
});

test("the verification readout qualifies each criterion as the goal page's open row does (runner patched included)", async ({ page }) => {
  await openTower(page, "goal/G-0001", { enrich: enrichRich });
  await settled(page, "goal/G-0001");
  await openReadings(page);
  const pills = (scope: Locator, row: string) =>
    scope.locator(row).evaluateAll((rows) =>
      Object.fromEntries(rows.map((r) => [r.querySelector(".num")!.textContent!.trim(), [...r.querySelectorAll(":scope > .ev-strip .ev-pill")].map((p) => p.textContent!.trim())])),
    );
  const onPage = await pills(page.locator(".goal-page"), ".criterion");
  expect(onPage.C1).toContain("runner patched");
  await page.goto("about:blank");
  await openTower(page, "review/G-0001", { enrich: enrichRich });
  await settled(page, "review/G-0001");
  await page.keyboard.press("e");
  const readout = page.getByRole("dialog");
  await expect(readout.locator(".verify-item").first()).toBeVisible();
  const inReadout = await pills(readout, ".verify-item");
  for (const id of Object.keys(onPage)) expect(inReadout[id] ?? [], id).toEqual(onPage[id]);
});

test("in Operations, a queued goal whose pass doesn't count says so beside Merges cleanly", async ({ page }) => {
  await openTower(page, "operations", {
    enrich: (F) => {
      enrichRich(F);
      enrichConsole(F);
    },
  });
  await settled(page, "operations");
  const row = page.locator(".mq-row").filter({ hasText: "G-0001" }).first();
  await expect(row).toBeVisible();
  await expect(row.locator(".mq-status").nth(1)).toContainText(/doesn.t count/);
  await expect(row.locator(".mq-status").nth(1).locator(".mark-attention")).toHaveCount(1);
});

test("in Chinese, a claim's gutter label breaks between speaker and kind, never inside a word; Learning says Agent once", async ({ page }) => {
  await openTower(page, "overview", { enrich: enrichRich, lang: "zh-CN" });
  await settled(page, "overview");
  await selectLine(page, titleIn("zh-CN", "Fix the cart total"));
  await page.keyboard.press("Space");
  await expect(page.locator(".peek-drawer")).toHaveCount(1);
  await settled(page);
  const broken = async () =>
    // Each run (speaker, kind) and the mark stay whole; `.prov-words` holds the runs and breaks only between them.
    page.locator(".prov-badge .nw, .prov-badge > span:not(.claim-rule):not(.prov-words)").evaluateAll((els) =>
      els.filter((e) => e.getClientRects().length > 1 || (e as HTMLElement).offsetHeight > parseFloat(getComputedStyle(e).lineHeight) * 1.5).map((e) => e.textContent),
    );
  expect(await broken()).toEqual([]);
  await page.goto("about:blank");
  await openTower(page, "learning", {
    enrich: (F) => {
      enrichRich(F);
      enrichConsole(F);
    },
    lang: "zh-CN",
  });
  await settled(page, "learning");
  await expect(page.locator(".proposal-card").first()).toBeVisible();
  expect(await broken()).toEqual([]);
  for (const b of await page.locator(".proposal-card .prov-badge").allInnerTexts()) expect(b.split(/Agent/).length - 1, b).toBeLessThanOrEqual(1);
});

// The board cell of a pass that doesn't count, measured as the reviewer measured it: nothing spills or is cut, no words
// lie over a segment, a segment is never under 5px; the human count is in the cell's tooltip, so the column stays 11em.
for (const lang of ["en", "zh-CN"] as const)
  for (const w of [1100, 1280, 1399, 1440, 1800]) {
    test(`the board cell of a pass that doesn't count holds its words and segments whole (${lang}, ${w})`, async ({ page }) => {
      await page.setViewportSize({ width: w, height: 800 });
      await openTower(page, "overview", { enrich: noCi, lang });
      await settled(page, "overview");
      const out = await page.locator('[data-goal="G-0001"] .g-crit').evaluate((cell) => {
        const box = cell.getBoundingClientRect();
        const segs = [...cell.querySelectorAll(".seg")].map((s) => s.getBoundingClientRect());
        const words = [...cell.querySelectorAll(".meta")].filter((m) => getComputedStyle(m).display !== "none").map((m) => m.getBoundingClientRect());
        const meets = (a: DOMRect, b: DOMRect) => a.left < b.right - 0.5 && b.left < a.right - 0.5 && a.top < b.bottom && b.top < a.bottom;
        const human = cell.querySelector(".meta.crit-human") as HTMLElement | null;
        return {
          spill: cell.scrollWidth - cell.clientWidth,
          narrowest: Math.min(...segs.map((r) => r.width)),
          overlaps: words.filter((t) => segs.some((s) => meets(t, s))).length,
          outside: words.filter((t) => t.right > box.right + 0.5).length,
          human: human && getComputedStyle(human).display !== "none" ? human.getBoundingClientRect().right <= box.right + 0.5 : null,
          tooltip: cell.querySelector(".criteria-bar")?.getAttribute("title") ?? "",
        };
      });
      expect(out.spill).toBeLessThanOrEqual(0);
      expect(out.narrowest).toBeGreaterThanOrEqual(5);
      expect(out.overlaps).toBe(0);
      expect(out.outside).toBe(0);
      // The human count is not drawn in the cell at any width; the cell's tooltip says it.
      expect(out.human).toBeNull();
      expect(out.tooltip).toMatch(lang === "en" ? /Human 0\/2/i : /人工 0\/2/);
    });
  }

// What the board cell of one goal needs must not cost every other row its title: at the reference widths a running
// row shows at least as much of its title and live line as before the criteria column was widened (d0dc2a1).
for (const w of [1440, 1800])
  test(`a running row keeps its title and live line beside a pass that doesn't count (${w})`, async ({ page }) => {
    await page.setViewportSize({ width: w, height: 800 });
    await openTower(page, "overview", { enrich: noCi });
    await settled(page, "overview");
    /** Characters of an element's text drawn inside its box (the rest is under the ellipsis). */
    const shown = (sel: string) =>
      page.locator(`[data-goal="G-0002"] ${sel}`).first().evaluate((el) => {
        // A character is shown when it ends inside every box that clips it, up to the row.
        const edge = (node: Node) => {
          let right = Infinity;
          for (let e = node.parentElement; e && !e.classList.contains("g-row"); e = e.parentElement)
            if (getComputedStyle(e).overflowX !== "visible") right = Math.min(right, e.getBoundingClientRect().right);
          return right;
        };
        const walk = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
        let n = 0;
        const r = document.createRange();
        for (let t = walk.nextNode(); t; t = walk.nextNode()) {
          const right = edge(t);
          for (let i = 0; i < t.textContent!.length; i++) {
            r.setStart(t, i);
            r.setEnd(t, i + 1);
            const box = r.getBoundingClientRect();
            if (box.width && box.right <= right + 0.5) n++;
          }
        }
        return n;
      });
    // "Align discount rules with the product" and "Getting started run" were whole at d0dc2a1 (1440, en).
    expect(await shown(".g-title")).toBeGreaterThanOrEqual(37);
    expect(await shown(".g-live")).toBeGreaterThanOrEqual(19);
  });

// A claim's gutter in the peek: the mark and the speaker share the first line, level with the statement's first line;
// the kind follows on the next line, never starting left of the mark.
for (const lang of ["en", "zh-CN"] as const)
  for (const w of [1100, 1440, 1800]) {
    test(`in the peek a claim's speaker stands beside its statement (${lang}, ${w})`, async ({ page }) => {
      await page.setViewportSize({ width: w, height: 900 });
      await openTower(page, "overview", { enrich: enrichRich, lang });
      await settled(page, "overview");
      await selectLine(page, titleIn(lang, "Fix the cart total"));
      await page.keyboard.press("Space");
      await expect(page.locator(".peek-drawer .prov-claim").first()).toBeVisible();
      await settled(page);
      const frames = await page.locator(".peek-drawer .prov-frame").evaluateAll((frames) =>
        frames.map((f) => {
          const mark = f.querySelector(".prov-badge > :first-child")!.getBoundingClientRect();
          const words = [...f.querySelectorAll(".prov-words, .prov-words > *")].flatMap((e) => [...e.getClientRects()]);
          const first = f.querySelector(".prov-words")!.getClientRects()[0];
          const body = f.querySelector(".prov-body")!;
          const range = document.createRange();
          range.selectNodeContents(body);
          const line = range.getClientRects()[0];
          return {
            text: f.textContent!.trim().slice(0, 40),
            level: Math.abs(first.top - line.top),
            sameLine: mark.top < first.top + first.height && first.top < mark.bottom,
            leftOfMark: words.filter((r) => r.left < mark.right - 0.5).length,
          };
        }),
      );
      expect(frames.length).toBeGreaterThan(0);
      for (const f of frames) {
        expect(f.level, f.text).toBeLessThanOrEqual(2);
        expect(f.sameLine, f.text).toBe(true);
        expect(f.leftOfMark, f.text).toBe(0);
      }
    });
  }

test("⇧R from inside a peek closes it and starts the review queue, as on the board", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await openTower(page, "overview", { enrich: enrichRich });
  await settled(page, "overview");
  await selectLine(page, "Speed up the product list");
  await page.keyboard.press("Space");
  await expect(page.locator(".peek-drawer")).toHaveCount(1);
  await page.keyboard.press("Shift+R");
  await expect(page.locator(".peek-drawer")).toHaveCount(0);
  await expect(page.locator(".review-head")).toBeVisible();
  expect(errors).toEqual([]);
});

// The peek is modal: Tab walks its own controls and wraps, never reaching the quick-start field behind it, where the
// next key (r, ↩) would be typed and a goal started out of sight.
const BOARD = ["Find out why checkout is slow", "Clean up cart edge cases", "Fix the cart total", "Speed up the product list", "Align discount rules"];
for (const lang of ["en", "zh-CN"] as const)
  test(`Tab stays inside the peek on every goal, and Tab then r or ↩ starts nothing behind it (${lang})`, async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await openTower(page, "overview", { enrich: enrichRich, lang });
    await settled(page, "overview");
    for (const title of BOARD.map((b) => titleIn(lang, b))) {
      await selectLine(page, title);
      await page.keyboard.press("Space");
      await expect(page.locator(".peek-drawer")).toHaveCount(1);
      for (const key of ["Tab", "Tab", "Tab", "Tab", "Tab", "Tab", "Shift+Tab", "Shift+Tab"]) {
        await page.keyboard.press(key);
        expect(await page.evaluate(() => !!document.activeElement?.closest(".peek-drawer")), `${title} ${key}`).toBe(true);
      }
      await page.keyboard.press("Escape");
      await expect(page.locator(".peek-drawer")).toHaveCount(0);
    }
    // Tab, then the keys the peek's own bar names: they act in the peek (or on the focused button), never in the field.
    await openTower(page, "overview", { enrich: enrichRich, lang });
    await settled(page, "overview");
    await selectLine(page, "Speed up the product list");
    await page.keyboard.press("Space");
    await page.keyboard.press("Tab");
    await page.keyboard.press("r");
    await page.keyboard.press("Enter");
    expect(await page.evaluate(() => ((window as any).__towerCalls as [string, unknown][]).filter(([c]) => c === "quick_goal").length)).toBe(0);
    await expect(page.locator(".quick-input")).toHaveValue("");
    expect(errors).toEqual([]);
  });

test("every peek draws its verdict and pin once: one seal at most, whatever the goal's state", async ({ page }) => {
  await openTower(page, "overview", { enrich: enrichRich });
  await settled(page, "overview");
  for (const title of BOARD) {
    await selectLine(page, title);
    await page.keyboard.press("Space");
    await expect(page.locator(".peek-drawer .live-line").first()).toBeVisible();
    expect(await page.locator(".peek-drawer .seal").count(), title).toBeLessThanOrEqual(1);
    await page.keyboard.press("Escape");
  }
});

for (const title of ["Fix the cart total", "Clean up cart edge cases"])
  test(`after Tab in the peek, r still opens the review of "${title}"`, async ({ page }) => {
    await openTower(page, "overview", { enrich: enrichRich });
    await settled(page, "overview");
    await selectLine(page, title);
    await page.keyboard.press("Space");
    await page.keyboard.press("Tab");
    await page.keyboard.press("r");
    await expect(page.locator(".review-head")).toBeVisible();
  });

/** How many times `re` is said in the drawn text of `root`. */
const said = (root: Locator, re: RegExp) => root.innerText().then((s) => (s.match(new RegExp(re.source, "g")) ?? []).length);
const visibleMarks = (rows: Locator) =>
  rows.evaluateAll((rows) =>
    rows.map((r) => [r.textContent!.trim().slice(0, 30), [...r.querySelectorAll(".mark-attention")].filter((m) => m.getClientRects().length && getComputedStyle(m).display !== "none").length] as const),
  );

test("the title bar says in words how many need you, the Needs you count; a sidebar row wears at most one ! mark", async ({ page }) => {
  await openTower(page, "overview", { enrich: enrichRich });
  await settled(page, "overview");
  const tel = page.locator(".tel-blocking");
  await expect(tel).toHaveText(/^\s*\d+ needs? you\s*$/);
  const n = (await tel.innerText()).match(/\d+/)![0];
  await expect(page.locator(".sidebar .side-row").filter({ hasText: "Needs you" }).first().locator(".side-count")).toHaveText(n);
  for (const [row, marks] of await visibleMarks(page.locator(".sidebar .side-goal"))) expect(marks, row).toBeLessThanOrEqual(1);
  // One name, one set: the sidebar's Review queue and the Needs you page's Review queue count the same items.
  const queue = (await page.locator(".sidebar .side-row").filter({ hasText: "Review queue" }).locator(".side-count").innerText()).trim();
  await openTower(page, "inbox", { enrich: enrichRich });
  await settled(page, "inbox");
  await expect(page.locator(".scale-title").filter({ hasText: "Review queue" }).locator(".num")).toHaveText(queue);
});

test("a pass that doesn't count is said once in the peek and once on its inbox card", async ({ page }) => {
  await openTower(page, "overview", { enrich: enrichRich });
  await settled(page, "overview");
  await selectLine(page, "Fix the cart total");
  await page.keyboard.press("Space");
  const peek = page.locator(".peek-drawer");
  await expect(peek.locator(".live-line").first()).toBeVisible();
  expect(await said(peek, /Passed, doesn.t count/)).toBe(1);
  for (const [row, marks] of await visibleMarks(peek.locator(".peek-head"))) expect(marks, row).toBeLessThanOrEqual(1);
  await page.keyboard.press("Escape");
  await openTower(page, "inbox", { enrich: enrichRich });
  await settled(page, "inbox");
  const card = page.locator(".decision").filter({ hasText: "Fix the cart total" }).filter({ hasText: /doesn.t count/ }).first();
  await expect(card).toBeVisible();
  expect(await said(card, /Passed, doesn.t count/)).toBe(1);
});

/** The drawn lines of an element's text, by width: its text's rects grouped by line (a flex item is one box, so not its own rects). */
const lines = (el: Locator) =>
  el.evaluate((e) => {
    const range = document.createRange();
    range.selectNodeContents(e);
    const byTop = new Map<number, [number, number]>();
    for (const r of range.getClientRects()) {
      if (!r.width) continue;
      const top = [...byTop.keys()].find((t) => Math.abs(t - r.top) < r.height / 2) ?? r.top;
      const [l, rt] = byTop.get(top) ?? [r.left, r.right];
      byTop.set(top, [Math.min(l, r.left), Math.max(rt, r.right)]);
    }
    return [...byTop.entries()].sort((a, b) => a[0] - b[0]).map(([, [l, r]]) => Math.round(r - l));
  });

for (const lang of ["en", "zh-CN"] as const)
  test(`the contract rail names the goal's ports on one line (${lang})`, async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await openTower(page, "goal/G-0001", { enrich: noCi, lang });
    await settled(page, "goal/G-0001");
    const dt = page.locator(".rail dt[title]").first();
    await expect(dt).toBeVisible();
    const h = await dt.evaluate((e) => e.getBoundingClientRect().height / parseFloat(getComputedStyle(e).lineHeight));
    expect(h).toBeLessThan(1.5);
  });

for (const w of [1100, 1440])
  test(`in Chinese the held-out hint reads in one line, and the welcome's git check leaves no character alone (${w})`, async ({ page }) => {
    await page.setViewportSize({ width: w, height: 900 });
    await openTower(page, "inbox", { enrich: enrichRich, lang: "zh-CN" });
    await settled(page, "inbox");
    const note = page.locator(".heldout-note > span").first();
    await expect(note).toBeVisible();
    expect(await lines(note)).toHaveLength(1);
    // The note names no button: the options are the supervisor's words, not always in the reader's language.
    await expect(page.locator(".decision-note").filter({ hasText: "说明" }).first()).not.toContainText("批准");

    await openTower(page, "overview", {
      lang: "zh-CN",
      enrich: (F) => {
        F.environment.issues = F.environment.issues.filter((i: { kind: string }) => i.kind !== "git_identity_missing");
        F.environment.issues.push({ kind: "git_identity_missing", blocking: false, text: "", fix: "git config --global user.name x" });
        F.projects = [];
        F.goals = [];
        F.inbox = [];
      },
    });
    const title = page.locator(".check-row .t1").filter({ hasText: "git 还没设置" });
    await expect(title).toBeVisible();
    const drawn = await lines(title);
    const em = await title.evaluate((e) => parseFloat(getComputedStyle(e).fontSize));
    expect(drawn.at(-1)!).toBeGreaterThan(2 * em);
  });

/**
 * The middle dot belongs to two scales only — the criteria count and the budget — and machine text says what it says.
 * Anywhere else, in the words drawn, in what is drawn by ::before/::after, and in what a screen reader or a tooltip
 * says (aria-label, title, placeholder), a list is a gap or a comma.
 */
const strayDots = (page: Page) =>
  page.evaluate(() => {
    const SCALE = ".criteria-bar, .budget-line, .budget-bar, .g-spend-cell";
    const out: string[] = [];
    const walk = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    for (let n = walk.nextNode(); n; n = walk.nextNode()) {
      const el = n.parentElement!;
      if (!n.textContent?.includes("·") || el.closest(`${SCALE}, pre, code`) || !el.getClientRects().length) continue;
      out.push(`${el.className}: ${n.textContent.trim().slice(0, 60)}`);
    }
    for (const el of document.body.querySelectorAll("*")) {
      if (!el.getClientRects().length || el.closest(SCALE)) continue;
      for (const pseudo of ["::before", "::after"]) if (getComputedStyle(el, pseudo).content.includes("·")) out.push(`${el.className}${pseudo}`);
      for (const a of ["aria-label", "title", "placeholder"]) if (el.getAttribute(a)?.includes("·")) out.push(`${el.className}[${a}]: ${el.getAttribute(a)!.slice(0, 60)}`);
    }
    return out;
  });

const everything = (F: Record<string, any>) => {
  enrichRich(F);
  enrichConsole(F);
  for (const g of F.goals) g.updated_at = Date.now() - 60_000;
};
const press =
  (...k: string[]) =>
  async (page: Page) => {
    for (const key of k) await page.keyboard.press(key);
  };
for (const [route, what, open] of [
  ["overview", "the board and its briefing", null],
  ["inbox", "the inbox", null],
  ["goal/G-0001", "a goal page", null],
  ["goal/G-0005", "a goal that cannot run", null],
  ["review/G-0001", "the review", null],
  ["learning", "the learning page", null],
  ["operations", "operations", null],
  ["settings", "settings", null],
  ["new", "the contract editor", null],
  ["overview", "the peek", press("j", "Space")],
  ["overview", "the palette", press("Meta+k")],
  ["overview", "the shortcut table", press("Shift+Slash")],
  ["review/G-0001", "the accept sheet", press("Meta+Shift+Enter")],
  ["review/G-0001", "the verification readout", press("e")],
] as const) {
  for (const lang of ["en", "zh-CN"] as const) {
    test(`populated, ${what} keeps the middle dot to the two scales (${lang})`, async ({ page }) => {
      await page.addInitScript(() => localStorage.setItem("tower.overviewSeenAt", String(Date.now() - 3 * 3_600_000)));
      await openTower(page, route, { enrich: everything, lang });
      await settled(page, route);
      if (open) {
        await open(page);
        await expect(page.locator(".peek-drawer, [role=dialog]").last()).toBeVisible();
        await settled(page);
      }
      if (route === "overview" && !open) await expect(page.locator(".today-bar")).toBeVisible();
      if (route === "learning") await expect(page.getByText("integer cents").first()).toBeVisible();
      if (route === "operations") await expect(page.getByText("Weekly flaky test hunt").first()).toBeVisible();
      expect(await strayDots(page)).toEqual([]);
    });
  }
}

// AC1: on the goal page the acceptance criteria start inside the first screen, with every high sentinel's explanation whole
// above them and the open CI card between — at both window widths, in both languages.
for (const [w, lang, theme] of [[1440, "en", "light"], [1440, "zh-CN", "dark"], [1100, "en", "light"], [1100, "zh-CN", "dark"]] as const) {
  test(`the acceptance criteria head stands within 600px of the top (${w}, ${lang})`, async ({ page }) => {
    await page.setViewportSize({ width: w, height: 900 });
    await openTower(page, "goal/G-0001", { enrich: enrichRich, lang, theme });
    await settled(page, "goal/G-0001");
    const head = page.locator(".goal-page .section-head").filter({ hasText: lang === "en" ? "Acceptance criteria" : "验收标准" }).first();
    expect((await head.boundingBox())!.y).toBeLessThanOrEqual(600);
    // Not by clipping the sentinels: their prose is whole.
    for (const prose of await page.locator(".sentinels-high .sentinel-prose").all()) expect(await prose.evaluate((el) => el.scrollHeight <= el.clientHeight + 1)).toBe(true);
  });
}

// Review 7 P3-01, review 8 R8-P3-02: what needs you is a decision line in the board's queue, and the title bar counts
// those. A goal filed anywhere else (G-0001 in To review, verified or not) is not said to need you, on the board or in the
// sidebar, in its label or by a ! mark after its title: the ! a row may wear is its glyph's, a pass that doesn't count. The
// sidebar's own Needs you group says so of each of its rows. Three data sets: the supervisor's own dump, with and
// without G-0001's CI card.
for (const [lang, word, review] of [["en", "Needs you", "To review"], ["zh-CN", "需要你", "待评审"]] as const)
  for (const [name, enrich] of [["the dumped views", undefined], ["no CI card", noCi], ["a CI card", enrichRich]] as const)
    test(`no row filed outside Needs you says it needs you, on the board or in the sidebar, with ${name} (${lang})`, async ({ page }) => {
      await openTower(page, "overview", { enrich, lang });
      await settled(page, "overview");
      const rows = await page.evaluate(() => {
        const board = [...document.querySelectorAll(".overview .board-group")].flatMap((s) => {
          const head = s.querySelector("h2")!.firstChild!.textContent!.trim();
          return [...s.querySelectorAll<HTMLElement>(".g-row .g-title")].map((b) => ({ where: "board", head, label: b.getAttribute("aria-label") ?? "", mark: !!b.querySelector(".mark-attention") }));
        });
        const side = [...document.querySelectorAll(".sidebar .side-group")].flatMap((s) => {
          const head = s.querySelector(".side-group-title")!.textContent!.replace(/\d+\s*$/, "").trim();
          return [...s.querySelectorAll<HTMLElement>(".side-goal")].map((b) => ({ where: "sidebar", head, label: b.getAttribute("aria-label") ?? "", mark: [...b.querySelectorAll(".mark-attention")].some((m) => !m.closest(".side-icon")) }));
        });
        return [...board, ...side];
      });
      expect(rows.filter((r) => r.where === "board").length).toBeGreaterThan(0);
      expect(rows.filter((r) => r.where === "sidebar" && r.head !== word).length).toBeGreaterThan(0);
      if (name === "no CI card") expect(rows.find((r) => r.where === "board" && r.label.startsWith(titleIn(lang, "Fix the cart total")))?.head).toBe(review);
      for (const r of rows) {
        const says = r.label.includes(`, ${word}`);
        expect(says, `${r.where} "${r.label}" under ${r.head}`).toBe(r.where === "sidebar" && r.head === word);
        expect(r.mark, `${r.where} "${r.label}" under ${r.head} wears no ! mark after its title`).toBe(false);
      }
    });

// Review 7 P3-02, review 8 R8-P3-01: a running goal's state is said once, by "Now" under the peek's head, so the head never
// lags or contradicts it: not "Running" over "Unresponsive", and not "Unresponsive" over "Needs you" when a silent run is
// waiting for your answer (the supervisor sets waiting_on_you on a question; no tool runs until you answer).
const g2Waiting = (F: Record<string, any>) => {
  enrichRich(F);
  const q = F.inbox.find((i: any) => i.kind === "assumption");
  const title = F.goals.find((x: any) => x.id === "G-0002").title;
  F.inbox.push({ ...structuredClone(q), id: "ib-g2-question", goal_id: "G-0002", goal_title: title, kind: "question", subject: "Which rounding does the ledger use?" });
  for (const g of [F.goals.find((x: any) => x.id === "G-0002"), F["goal-G-0002"]?.summary]) if (g) Object.assign(g, { needs_you: 1, mode: "waiting_on_you" });
};
for (const [lang, words] of [["en", { running: "Running", silent: "Unresponsive", waiting: "Needs you" }], ["zh-CN", { running: "运行中", silent: "无响应", waiting: "等你" }]] as const)
  for (const [name, enrich, now] of [["silent", enrichRich, "silent"], ["silent and waiting for your answer", g2Waiting, "waiting"]] as const)
    test(`the peek's head of a ${name} run leaves its state to Now (${lang})`, async ({ page }) => {
      await openTower(page, "overview", { enrich, lang });
      await settled(page, "overview");
      await selectLine(page, titleIn(lang, "Align discount rules"));
      await page.keyboard.press("Space");
      const head = page.locator(".peek-drawer .peek-head-top");
      await expect(head).toContainText("G-0002");
      for (const w of Object.values(words)) await expect(head).not.toContainText(w);
      const live = page.locator(".peek-drawer .live-line").first();
      await expect(live).toContainText(words[now]);
      if (now === "waiting") await expect(live).not.toContainText(words.silent);
    });
