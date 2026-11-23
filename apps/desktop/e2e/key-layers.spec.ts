/**
 * A sheet opened by a key closes on the same key. The sheet is a modal layer, so the opener's own binding under it
 * is quiet; the sheet carries the key itself.
 */
import { expect, test } from "@playwright/test";

import { openTower } from "./tauri";

test("? opens the shortcut sheet and ? closes it", async ({ page }) => {
  await openTower(page, "overview");
  await page.keyboard.press("?");
  await expect(page.locator(".keys-sheet")).toBeVisible();
  await page.keyboard.press("?");
  await expect(page.locator(".keys-sheet")).toHaveCount(0);
});

test("in the review, e and ⌘P close the sheets they open", async ({ page }) => {
  await openTower(page, "review/G-0001");
  await expect(page.locator("table").first()).toBeVisible();
  const dialog = page.getByRole("dialog");
  await page.keyboard.press("e");
  await expect(dialog).toBeVisible();
  await page.keyboard.press("e");
  await expect(dialog).toHaveCount(0);
  await page.keyboard.press("Meta+p");
  await expect(dialog).toBeVisible();
  await page.keyboard.press("Meta+p");
  await expect(dialog).toHaveCount(0);
});
