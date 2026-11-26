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
  // Review 18 (R18-P3-04): read once it is rendered, and select once its colours are in. A file's box is
  // `content-visibility: auto`: the frame it arrives in, before the browser has found it on screen, its text is skipped
  // (innerText was read empty 4 times in 8); and the colours, when they arrive, draw the line's words anew, which ends
  // a selection made a moment before.
  await expect(code).toHaveText(/[^\s+−-]/, { useInnerText: true });
  await expect(code.locator("span[style*='color']").first()).toBeAttached();
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
  // After a press the arrow keys still move by line, from the line pressed (a middle one, so "from the first line"
  // would not pass): ↓↓↑ walk 3, 4, 3. ↩ comments on the line pressed; past the last line, ↓ lands on its own number.
  // A file of seven lines, its unit opened first; the index is the line's within its own table.
  await openTower(page, "review/G-0003", {
    enrich: (F) => {
      enrichReview(F);
      const r = F["review-G-0003"];
      r.units = [...r.units].reverse();
    },
  });
  const long = page.locator("table.diff").filter({ hasText: "Money in whole cents" });
  const rows = long.locator("tr.dl");
  await expect(rows.first()).toBeVisible();
  await expect(rows.first().locator(".code span[style*='color']").first()).toBeAttached();
  expect(await rows.count()).toBeGreaterThan(4);
  const at = () =>
    page.evaluate(() => {
      const el = document.activeElement as HTMLElement;
      const all = [...(el.closest("table.diff")?.querySelectorAll("tr.dl") ?? [])];
      return el.classList.contains("ln-btn") ? all.indexOf(el.closest("tr")!) : -1;
    });
  const pressRow = async (i: number) => {
    const c = (await rows.nth(i).locator(".code").boundingBox())!;
    await page.mouse.click(c.x + 40, c.y + c.height / 2);
  };
  // Review 19 (record only): the table itself can hold focus. A press of the pointer puts it there and shows no ring.
  const ring = (l: import("@playwright/test").Locator) => l.evaluate((el) => getComputedStyle(el).outlineStyle);
  const held = rows.nth(2).locator(".ln-btn").first();
  await pressRow(2);
  await expect(long).toBeFocused();
  expect([await ring(held), await ring(long)], "a press shows no ring").toEqual(["none", "none"]);
  const walked: number[] = [];
  for (const k of ["ArrowDown", "ArrowDown", "ArrowUp"]) (await page.keyboard.press(k), walked.push(await at()));
  expect(walked, "↓↓↑ after a press walk from the line pressed").toEqual([3, 4, 3]);
  await pressRow(2);
  await page.keyboard.press("Enter");
  await expect(page.locator(".composer textarea")).toBeFocused();
  expect(
    await rows.nth(2).evaluate((pressed) => document.querySelector(".composer")!.closest("tr")!.previousElementSibling === pressed),
    "↩ after a press comments on the line pressed",
  ).toBe(true);
  await page.keyboard.press("Escape");
  await expect(page.locator(".composer")).toHaveCount(0);
  // Review 17 (R17-P2-01): ↩ with a modifier is the page's shortcut, not a comment: ⌘⇧↩ after a press opens the accept
  // sheet alone, with focus in it, and no comment box behind it.
  await pressRow(2);
  await page.keyboard.press("Meta+Shift+Enter");
  const sheet = page.getByRole("dialog");
  await expect(sheet).toBeVisible();
  await expect(page.locator(".composer")).toHaveCount(0);
  expect(await sheet.evaluate((d) => d.contains(document.activeElement)), "focus is in the sheet").toBe(true);
  await page.keyboard.press("Escape");
  await expect(sheet).toHaveCount(0);
  // Handed back by the keyboard, the table holds focus with a ring where ↓ and ↩ act: on the line pressed, its number
  // (it showed none, review 19).
  await expect(long).toBeFocused();
  expect([await ring(held), await ring(long)], "the line pressed wears the ring, the table none").toEqual(["solid", "none"]);
  // Review 20 (R20-P3-03): the ring stands clear of the number. Drawn 1.5px inside a button the width of the digits, it
  // crossed the last one; the button is now the whole cell, and the digits stand clear of the ring's inner edge on both
  // sides (the cell's 6px padding less the ring's 3px: 3px, 2px or more asserted for the glyphs' own bounds).
  const clear = await held.evaluate((el) => {
    const range = document.createRange();
    range.selectNodeContents(el);
    const digits = range.getBoundingClientRect(), box = el.getBoundingClientRect(), cell = el.closest("td")!.getBoundingClientRect();
    const inner = parseFloat(getComputedStyle(el).outlineWidth) - parseFloat(getComputedStyle(el).outlineOffset);
    return { right: box.right - inner - digits.right, left: digits.left - (box.left + inner), cell: [box.left - cell.left, cell.right - box.right] };
  });
  expect(clear.right, JSON.stringify(clear)).toBeGreaterThanOrEqual(2);
  expect(clear.left, JSON.stringify(clear)).toBeGreaterThanOrEqual(2);
  expect(clear.cell, "the button is the whole cell").toEqual([0, 0]);
  // Review 18 (R18-P3-02): closed, the sheet hands focus back to the table and the line pressed is still your place:
  // ↩ comments on it and ↓ walks from it (focus had moved to the first line's number, so ↩ commented on line 0).
  await page.keyboard.press("Enter");
  await expect(page.locator(".composer textarea")).toBeFocused();
  expect(
    await rows.nth(2).evaluate((pressed) => document.querySelector(".composer")!.closest("tr")!.previousElementSibling === pressed),
    "↩ after the sheet closes comments on the line pressed",
  ).toBe(true);
  await page.keyboard.press("Escape");
  await expect(page.locator(".composer")).toHaveCount(0);
  await pressRow(2);
  await page.keyboard.press("Meta+Shift+Enter");
  await expect(sheet).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(sheet).toHaveCount(0);
  await page.keyboard.press("ArrowDown");
  expect(await at(), "↓ after the sheet closes walks from the line pressed").toBe(3);
  // What a real ⌘C puts on the clipboard: the page's own text when it writes one, else the browser's (the selection).
  await page.evaluate(() => {
    const w = window as unknown as { copied: string | null; set: string | null };
    addEventListener("copy", (e) => {
      const dt = e.clipboardData!;
      const set = dt.setData.bind(dt);
      w.set = null;
      dt.setData = (t, v) => ((w.set = v), set(t, v));
    }, true);
    addEventListener("copy", (e) => (w.copied = e.defaultPrevented ? w.set : getSelection()!.toString()));
  });
  const copy = async () => (await page.keyboard.press("Meta+c"), page.evaluate(() => (window as unknown as { copied: string }).copied));
  const drag = async (a: { x: number; y: number }, b: { x: number; y: number }) => {
    await page.mouse.move(a.x, a.y);
    await page.mouse.down();
    await page.mouse.move(b.x, b.y, { steps: 8 });
    await page.mouse.up();
  };
  const mid = (r: { x: number; y: number; height: number }, dx: number) => ({ x: r.x + dx, y: r.y + r.height / 2 });
  // Review 16 (record only): a triple-click on the sign column took nothing, one on a blank line took the next line, and
  // a copy across a blank line dropped it. A triple-click takes the line it lands on; a copy keeps the lines as in the file.
  const sel = () => page.evaluate(() => getSelection()!.toString());
  const first = (await rows.nth(0).locator(".code").boundingBox())!;
  await page.mouse.click(first.x + 8, first.y + first.height / 2, { clickCount: 3 });
  expect(await sel(), "a triple-click on the sign takes the line").toBe("// Money in whole cents: no float ever reaches a total.");
  const blank = (await rows.nth(3).locator(".code").boundingBox())!;
  await page.mouse.click(blank.x + 60, blank.y + blank.height / 2, { clickCount: 3 });
  expect(await sel(), "a triple-click on a blank line takes nothing").toBe("");
  const [from, to] = [(await rows.nth(2).locator(".code").boundingBox())!, (await rows.nth(4).locator(".code").boundingBox())!];
  await drag(mid(from, 20), mid(to, 200));
  const copied = await copy();
  const lines = copied.split("\n");
  expect(lines, "three lines, the blank one kept").toHaveLength(3);
  expect(lines[1]).toBe("");
  expect("export const fromCents = (c) => c / 100;").toContain(lines[0]);
  expect(lines[2].length).toBeGreaterThan(3);
  expect("export function line(price, qty) {").toContain(lines[2]);
  expect(copied, "no sign in a copy").not.toMatch(/^[+−]/m);
  // Review 17 (R17-P3-01): a drag from one file into the next keeps both files' lines (the page's copy kept only the
  // first file's); in the split view, a drag that starts on an added file's empty side takes the side with the code.
  const next = page.locator("table.diff").filter({ hasText: "function total(" }).locator("tr.dl .code");
  // (Its box drawn and its colours in first, as above.)
  await expect(next.first()).toHaveText(/[^\s+−-]/, { useInnerText: true });
  await expect(next.first().locator("span[style*='color']").first()).toBeAttached();
  await drag(mid((await rows.nth(5).locator(".code").boundingBox())!, 20), mid((await next.first().boundingBox())!, 160));
  const across = await copy();
  expect(across, "the first file's line").toContain("fromCents(");
  expect(across, "and the next file's").toContain("function total(");
  await page.evaluate(() => getSelection()!.removeAllRanges());
  await page.keyboard.press("Alt+v");
  const side = long.locator("tr.dl").nth(2).locator("td.code");
  await expect(side).toHaveCount(2);
  await drag(mid((await side.first().boundingBox())!, 40), mid((await long.locator("tr.dl").nth(4).locator("td.code").last().boundingBox())!, 200));
  const split = (await copy()).split("\n");
  expect(split, "three lines of the added file, the blank one kept").toHaveLength(3);
  expect(split[0]).toBe("export const fromCents = (c) => c / 100;");
  expect(split[1]).toBe("");
  expect("export function line(price, qty) {").toContain(split[2]);
  await page.keyboard.press("Alt+v");
  await expect(side).toHaveCount(1);
  const last = (await rows.count()) - 1;
  await rows.nth(last).scrollIntoViewIfNeeded();
  await pressRow(last);
  await page.keyboard.press("ArrowDown");
  expect(await at(), "↓ past the last line lands on its number").toBe(last);
  // The keyboard's way in is unchanged: from the file's last header control, Tab reaches the table and lands on the
  // first line's number, where ↑↓ move.
  const table = page.locator("table.diff").first();
  await table.locator("xpath=ancestor::section[1]").locator(".file-head button").last().focus();
  await page.keyboard.press("Tab");
  await expect(table.locator(".ln-btn").first()).toBeFocused();
});
