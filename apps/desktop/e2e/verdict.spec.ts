/**
 * One verdict everywhere: a goal whose pass doesn't count (G-0001, a tampered canary) never reads "Ready to accept" or wears
 * the verifier's green on a surface that summarises it — the inbox card, the board's decision line, the peek, the live line —
 * and an aggregate (the PR's CI count) never wears it either. Plus the review queue's ⇧R from the board, the peek's R only
 * when there are changes, the cannot-run output said once, and the middle dot on the populated console pages.
 */
import { type Locator, type Page, expect, test } from "@playwright/test";

import { enrichConsole, enrichRich } from "./rich";
import { openTower, settled } from "./tauri";

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
        const sel = page.locator(".board-queue .selected, .board .selected").filter({ hasText: text });
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
  await expect(page.getByText("To review", { exact: true }).first()).toBeVisible();
  const card = page.locator(".decision").filter({ hasText: "Fix the cart total" }).filter({ has: page.locator(".seal") }).first();
  await expect(card).toBeVisible();
  await expect(card.locator(".decision-head")).not.toContainText("Ready to accept");
  await expect(card.locator(".decision-head")).toContainText("doesn't count");
  await expect(card.locator(".seal")).toHaveClass(/seal-tampered/);
  await expect(card.locator(".criteria-bar")).toContainText("doesn't count");
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
  // Exactly once on the page.
  expect((await page.locator(".goal-page").innerText()).split("deny(1) file-read-data").length - 1).toBe(1);
});

test("in Chinese the supervisor's refusal (full-width colon, no \"refused\") is read the same way: said once, pointed to", async ({ page }) => {
  await openTower(page, "goal/G-0005", { enrich: enrichRich, lang: "zh-CN" });
  await settled(page, "goal/G-0005");
  const c1 = page.locator(".goal-page .criterion").filter({ has: page.locator(".num", { hasText: /^C1$/ }) }).first();
  const line = c1.locator(".env-line");
  await expect(line).toHaveCount(1);
  await expect(line).toContainText("输出见上方的暂停卡片");
  expect((await page.locator(".goal-page").innerText()).split("npm ERR! code 255").length - 1).toBe(1);
});

for (const route of ["learning", "operations"]) {
  test(`populated, ${route} keeps the middle dot off its lines`, async ({ page }) => {
    await openTower(page, route, {
      enrich: (F) => {
        enrichRich(F);
        enrichConsole(F);
      },
    });
    await settled(page, route);
    // Populated, not the empty state: the console's rows are drawn.
    await expect(page.getByText(route === "learning" ? "integer cents" : "Weekly flaky test hunt").first()).toBeVisible();
    const stray = await page.evaluate(() => {
      const out: string[] = [];
      const walk = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
      for (let n = walk.nextNode(); n; n = walk.nextNode()) {
        if (!n.textContent?.includes("·")) continue;
        const el = n.parentElement!;
        if (el.closest(".criteria-bar, .budget-line, pre, code, .mono, .sentinel-prose, .decision-body, .claim-text")) continue;
        if (!el.getClientRects().length) continue;
        out.push(`${el.className}: ${n.textContent.trim().slice(0, 60)}`);
      }
      for (const el of document.body.querySelectorAll("*")) {
        if (!el.getClientRects().length || el.closest(".criteria-bar, .budget-line")) continue;
        for (const pseudo of ["::before", "::after"]) if (getComputedStyle(el, pseudo).content.includes("·")) out.push(`${el.className}${pseudo}`);
      }
      return out;
    });
    expect(stray).toEqual([]);
  });
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
