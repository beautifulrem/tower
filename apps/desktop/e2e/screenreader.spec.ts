/**
 * A screen-reader walkthrough, from the accessibility tree WebKit builds
 * (what VoiceOver reads): every step of the main path — board, a goal, a
 * decision, review, accept — is reachable by keyboard and says what it is.
 * Not a substitute for listening with VoiceOver; a floor under it.
 */
import { expect, test } from "@playwright/test";

import { enrichSecondReady } from "./rich";
import { openTower } from "./tauri";

test("the board's goals are named, reachable by keyboard and open with Enter", async ({ page }) => {
  await openTower(page, "overview");
  const first = page.getByRole("button", { name: /Fix the cart total/ }).first();
  await expect(first).toBeVisible();
  // Each goal says its state and whether it needs you, not only by colour.
  await expect(first).toHaveAccessibleName(/Ready to accept|Running|Paused/);
  await first.focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("heading", { level: 1 }).first()).toContainText("Fix the cart total");
});

test("a decision card is an article named by its kind, goal and question, with named choices", async ({ page }) => {
  await openTower(page, "inbox");
  const cards = page.getByRole("article");
  const first = cards.first();
  await expect(first).toBeVisible();
  await expect(first).toHaveAccessibleName(/· G-\d{4} ·/);
  // Every button on a card says what it does (no icon-only button without a name).
  for (const b of await first.getByRole("button").all()) {
    expect((await b.getAttribute("aria-label")) ?? (await b.innerText())).not.toEqual("");
  }
});

test("a goal page reads facts, claims and its criteria as text, in order", async ({ page }) => {
  await openTower(page, "goal/G-0001");
  await expect(page.getByRole("heading", { level: 1 })).toHaveCount(1);
  const main = page.getByRole("main");
  await expect(main).toContainText(/Verified by Tower|Agent claim/);
  // Criteria carry their id and their result in words.
  await expect(main).toContainText(/C1/);
  await expect(main).toContainText(/passed|failed|not verified/i);
});

test("review: the file tree is a tree, the diff is a table, accept is a named dialog", async ({ page }) => {
  await openTower(page, "review/G-0001", { enrich: enrichSecondReady });
  await expect(page.getByRole("table").first()).toBeVisible();
  const tree = page.getByRole("tree");
  if ((await tree.count()) > 0) {
    await expect(tree.first().getByRole("treeitem").first()).toBeVisible();
  }
  await page.keyboard.press("Meta+Shift+Enter");
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await expect(dialog).toHaveAccessibleName(/Accept/);
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
});

test("settings: every field has a label", async ({ page }) => {
  await openTower(page, "settings");
  // The clauses are drawn before the check, which would pass with none: the memory field stands in the middle of them.
  await expect(page.locator("section.settings-block textarea").first()).toBeVisible();
  const fields = await page.locator("input:visible, textarea:visible, select:visible").all();
  expect(fields.length).toBeGreaterThan(8);
  for (const input of fields) {
    const name = await input.evaluate((el) => {
      const e = el as HTMLInputElement;
      const label = e.labels?.[0]?.textContent ?? "";
      return (e.getAttribute("aria-label") ?? "") + label + (e.getAttribute("aria-labelledby") ?? "") + (e.title ?? "");
    });
    expect(name.trim(), await input.evaluate((el) => el.outerHTML.slice(0, 120))).not.toEqual("");
  }
});
