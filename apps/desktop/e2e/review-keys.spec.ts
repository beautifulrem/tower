/**
 * The review's keyboard loop, on the commonest change: a small one whose diff
 * fits the pane, so nothing scrolls. The current hunk is state, marked on its
 * header; ] and [ move it, A only ever accepts, ⇧A takes a mark back with a
 * receipt. Scrolling a long diff yourself hands "current" to what is in sight.
 */
import { expect, test } from "@playwright/test";

import { enrichReview } from "./rich";
import { openSourceUnit, openTower } from "./tauri";

const head = (page: import("@playwright/test").Page, path: string) => page.locator(`.hunk-head[data-hunk-path="${path}"]`);

test("on a diff that fits the pane, ] moves the current hunk in the tree's order, A accepts that one and moves on, and a second A never takes it back", async ({ page }) => {
  await openTower(page, "review/G-0003", { enrich: enrichReview });
  await openSourceUnit(page);
  await expect(page.locator("table").first()).toBeVisible();
  const pane = page.locator(".review-diff");
  // The case the scroll position cannot answer: the whole unit fits, the pane does not scroll.
  expect(await pane.evaluate((el) => el.scrollHeight - el.clientHeight)).toBeLessThanOrEqual(0);
  const cart = head(page, "src/cart.js");
  const money = head(page, "src/cart/money.js");
  // The diff lists the unit's files in the order the tree on the left shows them: the directory first.
  const treeFiles = await page.locator(".review-units .tree-file.shown").evaluateAll((els) => els.map((e) => e.getAttribute("title")));
  const diffFiles = await page.locator(".hunk-head[data-hunk-path]").evaluateAll((els) => [...new Set(els.map((e) => e.getAttribute("data-hunk-path")))]);
  expect(diffFiles).toEqual(["src/cart/money.js", "src/cart.js"]);
  expect(treeFiles).toEqual(diffFiles);

  // The first hunk starts current: marked on its header with the 2px pen in text-3, and carrying A on its button.
  await expect(money).toHaveClass(/hunk-current/);
  await expect(money).toHaveAttribute("aria-current", "true");
  const pen = await money.locator("td").first().evaluate((el) => {
    const shadow = getComputedStyle(el).boxShadow;
    el.style.color = getComputedStyle(el).getPropertyValue("--text-3");
    return { shadow, text3: getComputedStyle(el).color };
  });
  expect(pen.shadow).toContain("inset");
  expect(pen.shadow).toContain(pen.text3);
  await expect(money.locator(".accept-hunk kbd")).toHaveText("A");
  await expect(cart.locator(".accept-hunk kbd")).toHaveCount(0);

  await page.keyboard.press("]");
  await expect(cart).toHaveClass(/hunk-current/);
  await expect(money).not.toHaveClass(/hunk-current/);
  await page.keyboard.press("a");
  await expect(cart).toHaveClass(/hunk-accepted/);
  await expect(money).not.toHaveClass(/hunk-accepted/);
  // The last hunk of the unit stays current once accepted; its button now offers ⇧A.
  await expect(cart).toHaveClass(/hunk-current/);
  await expect(cart.locator(".accept-hunk kbd")).toHaveText("⇧A");
  // A second A is not a take-back.
  await page.keyboard.press("a");
  await expect(cart).toHaveClass(/hunk-accepted/);
  await expect(page.locator(".review-accepted")).toHaveText(/1\/2 hunks read/);

  await page.keyboard.press("[");
  await expect(money).toHaveClass(/hunk-current/);
  await page.keyboard.press("a");
  await expect(money).toHaveClass(/hunk-accepted/);
  await expect(page.locator(".review-accepted")).toHaveText(/All 2 hunks read/);
  await expect(page.locator(".file").first().locator(".file-viewed")).toHaveText("Reviewed");
  // Every hunk accepted, "here" is still told from "read": the current header keeps the selection ground.
  const ground = (h: import("@playwright/test").Locator) => h.locator("td").first().evaluate((el) => getComputedStyle(el).backgroundColor);
  const current = (await money.getAttribute("class"))!.includes("hunk-current") ? money : cart;
  const other = current === money ? cart : money;
  expect(await ground(current)).not.toBe(await ground(other));

  // ⇧A takes the current hunk's mark back, out loud, with the way to put it back.
  await page.locator(".review-diff").evaluate((el) => el.scrollTo({ top: 0 }));
  await page.keyboard.press("[");
  await expect(money).toHaveClass(/hunk-current/);
  await page.keyboard.press("Shift+A");
  await expect(money).not.toHaveClass(/hunk-accepted/);
  const toast = page.locator(".toast").filter({ hasText: "Taken back: src/cart/money.js" });
  await expect(toast).toBeVisible();
  await expect(page.locator(".file").first().locator(".file-viewed")).toHaveText("Mark reviewed");
  await toast.getByRole("button", { name: "Mark read again" }).click();
  await expect(money).toHaveClass(/hunk-accepted/);
});

test("taking a mark back with the header's button says so too", async ({ page }) => {
  await openTower(page, "review/G-0003", { enrich: enrichReview });
  await openSourceUnit(page);
  const money = head(page, "src/cart/money.js");
  await expect(money).toBeVisible();
  await money.getByRole("button", { name: "Mark read" }).click();
  await expect(money).toHaveClass(/hunk-accepted/);
  // Accepting by the button moves "current" on, as A does.
  await expect(head(page, "src/cart.js")).toHaveClass(/hunk-current/);
  await money.getByRole("button", { name: /^Read, / }).click();
  await expect(money).not.toHaveClass(/hunk-accepted/);
  await expect(money).toHaveClass(/hunk-current/);
  await expect(page.locator(".toast").filter({ hasText: "Taken back: src/cart/money.js" })).toBeVisible();
});

test("⇧A right after A takes that accept back, and with nothing to take back it says so", async ({ page }) => {
  await openTower(page, "review/G-0003", { enrich: enrichReview });
  await openSourceUnit(page);
  const money = head(page, "src/cart/money.js");
  const cart = head(page, "src/cart.js");
  await expect(money).toHaveClass(/hunk-current/);
  // The status bar lists the key beside A.
  await expect(page.locator(".review-status")).toContainText("⇧A take back");
  // ? names what it opens, not "this sheet" (the sheet's own word for itself).
  await expect(page.locator(".review-status")).toContainText("? all keys");
  // Nothing accepted yet: the key answers with the reason, and nothing moves.
  await page.keyboard.press("Shift+A");
  await expect(page.locator(".toast").filter({ hasText: "Nothing to take back" })).toBeVisible();
  await expect(money).toHaveClass(/hunk-current/);
  // A accepts and moves on; ⇧A on the next (unaccepted) hunk takes back the accept just made, the most recent first.
  await page.keyboard.press("a");
  await expect(cart).toHaveClass(/hunk-current/);
  await page.keyboard.press("Shift+A");
  await expect(money).not.toHaveClass(/hunk-accepted/);
  await expect(money).toHaveClass(/hunk-current/);
  await expect(page.locator(".toast").filter({ hasText: "Taken back: src/cart/money.js" })).toBeVisible();
  // Two accepts, two take-backs, newest first.
  await page.keyboard.press("a");
  await page.keyboard.press("a");
  await expect(page.locator(".review-accepted")).toHaveText(/All 2 hunks read/);
  await page.keyboard.press("Shift+A");
  await expect(cart).not.toHaveClass(/hunk-accepted/);
  await page.keyboard.press("Shift+A");
  await expect(money).not.toHaveClass(/hunk-accepted/);
});

/** One unit: a file with one long hunk, then a file with a short one. */
function longThenShort(F: Record<string, any>) {
  const r = F["review-G-0003"];
  const base = r.files[0];
  const long = structuredClone(base);
  long.path = "src/long.js";
  long.hunks = [{ header: "@@ -1,0 +1,120 @@", lines: Array.from({ length: 120 }, (_, i) => ({ kind: "add", old_no: null, new_no: i + 1, text: `export const line${i} = ${i};` })) }];
  long.additions = 120;
  long.deletions = 0;
  const short = { ...structuredClone(base), path: "src/short.js" };
  r.files = [long, short];
  r.units = [{ id: "U1", title: "src/", files: ["src/long.js", "src/short.js"], lines: 126, risk: 0, risk_reasons: [] }];
  r.stat = { files: 2, additions: 121, deletions: 1 };
}

test("on a long diff, ] brings the next hunk into view, and scrolling the current one out of sight hands 'current' to what you see", async ({ page }) => {
  await openTower(page, "review/G-0003", { enrich: longThenShort });
  const pane = page.locator(".review-diff");
  const long = head(page, "src/long.js");
  const short = head(page, "src/short.js");
  await expect(long).toHaveClass(/hunk-current/);
  expect(await pane.evaluate((el) => el.scrollHeight > el.clientHeight)).toBe(true);
  await page.keyboard.press("]");
  await expect(short).toHaveClass(/hunk-current/);
  // Brought into view, under the sticky file header.
  await expect.poll(async () => {
    const [p, h] = [(await pane.boundingBox())!, (await short.boundingBox())!];
    return h.y >= p.y && h.y + h.height <= p.y + p.height;
  }).toBe(true);
  // You scroll back to the top yourself: the short hunk is out of sight, so the long one is current again — A acts on what you see.
  await pane.evaluate((el) => el.scrollTo({ top: 0 }));
  await expect(long).toHaveClass(/hunk-current/);
  await page.keyboard.press("a");
  await expect(long).toHaveClass(/hunk-accepted/);
  await expect(short).not.toHaveClass(/hunk-accepted/);
  await expect(short).toHaveClass(/hunk-current/);
});

test("code shows with its line numbers at once; colours tint in from the plain foreground later", async ({ page }) => {
  // Hold the highlighting worker back, as a cold start does.
  await page.route("**/highlight.worker*", async (route) => {
    await new Promise((r) => setTimeout(r, 600));
    await route.continue();
  });
  await openTower(page, "review/G-0003", { enrich: enrichReview });
  await expect(page.locator("table").first()).toBeVisible();
  // Before any colour arrives the code text is already on screen, in the plain foreground.
  const firstCode = page.locator("tr.dl .code").first();
  await expect(firstCode).toBeVisible();
  expect((await firstCode.innerText()).trim().length).toBeGreaterThan(0);
  expect(await firstCode.locator("> *").first().evaluate((el) => getComputedStyle(el).visibility)).toBe("visible");
  await expect(page.locator(".code-late").first()).toBeAttached();
  const coloured = page.locator(".code-late .code > span[style*='color']").first();
  await expect(coloured).toBeAttached({ timeout: 15_000 });
  expect(await coloured.evaluate((el) => getComputedStyle(el).animationName)).toBe("tint-in");
});

// Review 15 (record only): a diff line could not be selected or copied — pressing it focused the table, which handed
// focus to its first line number and dropped the selection. A press now keeps focus on the table: a triple-click takes
// the line's code (not its +/− sign), a drag takes part of it. Tabbing in still lands on the first line number.
test("a diff line selects and copies; Tab into the diff still lands on its first line", async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: 900 });
  await openTower(page, "review/G-0003", { enrich: enrichReview });
  const code = page.locator("tr.dl .code").first();
  await expect(code).toBeVisible();
  const text = (await code.innerText()).trim();
  const b = (await code.boundingBox())!;
  const selected = () => page.evaluate(() => getSelection()!.toString().trim());
  await page.mouse.click(b.x + 40, b.y + b.height / 2, { clickCount: 3 });
  expect(await selected(), "a triple-click takes the line's code").toBe(text.replace(/^[+−-]/, ""));
  await page.evaluate(() => getSelection()!.removeAllRanges());
  await page.mouse.move(b.x + 20, b.y + b.height / 2);
  await page.mouse.down();
  await page.mouse.move(b.x + 160, b.y + b.height / 2, { steps: 6 });
  await page.mouse.up();
  const part = await selected();
  expect(part.length, "a drag takes part of the line").toBeGreaterThan(3);
  expect(text).toContain(part);
  // The keyboard's way in is unchanged: from the file's last header control, Tab reaches the table and lands on the
  // first line's number, where ↑↓ move.
  const table = page.locator("table.diff").first();
  await table.locator("xpath=ancestor::section[1]").locator(".file-head button").last().focus();
  await page.keyboard.press("Tab");
  await expect(table.locator(".ln-btn").first()).toBeFocused();
});
