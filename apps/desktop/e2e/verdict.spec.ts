/**
 * One verdict everywhere: a goal whose pass doesn't count (G-0001, a tampered canary) never reads "Ready to accept" or wears
 * the verifier's green on a surface that summarises it — the inbox card, the board's decision line, the peek, the live line —
 * and an aggregate (the PR's CI count) never wears it either. Plus the review queue's ⇧R from the board, the peek's R only
 * when there are changes, the cannot-run output said once, and the middle dot on the populated console pages.
 */
import { type Locator, type Page, expect, test } from "@playwright/test";

import { enrichConsole, enrichRich } from "./rich";
import { openReadings, openTower, settled } from "./tauri";

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
    const [accept, review, dc] = lang === "en" ? ["To accept", "To review", "1 doesn't count"] : ["待验收", "待评审", "1 项不作数"];
    // Neither the board nor the sidebar files anything under acceptance.
    for (const head of await page.locator(".board-group .scale-title, .sidebar .side-group-title").allInnerTexts()) expect(head).not.toContain(accept);
    const group = page.locator(".board-group").filter({ has: page.locator(".scale-title", { hasText: review }) }).first();
    const row = group.locator(".board-rows [role=listitem]").filter({ hasText: "Fix the cart total" }).first();
    await expect(row).toBeVisible();
    await expect(row.locator(".criteria-bar .seg-discounted")).toHaveCount(1);
    await expect(row.locator(".criteria-bar")).toContainText(dc);
    await expect(row.locator(".criteria-bar .discounted")).toBeVisible();
    // Whole inside its 11em cell at the narrow window, not cut at the cell's edge.
    const [words, cell] = [await row.locator(".criteria-bar .discounted").boundingBox(), await row.locator(".g-crit").boundingBox()];
    expect(words!.x + words!.width).toBeLessThanOrEqual(cell!.x + cell!.width + 0.5);
    expect(await greens(row.locator(".criteria-bar .seg-discounted"))).toEqual([]);
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

test("a board line wears at most one ◆", async ({ page }) => {
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
  await selectLine(page, "Fix the cart total");
  await page.keyboard.press("Space");
  await expect(page.locator(".peek-drawer")).toHaveCount(1);
  await settled(page);
  const broken = async () =>
    page.locator(".prov-badge .nw, .prov-badge > span:not(.claim-rule)").evaluateAll((els) =>
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
