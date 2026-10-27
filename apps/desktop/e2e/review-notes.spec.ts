/**
 * Over the diff, what to know before reading is one band, not three stacked
 * lines: folded to a single line led by its weightiest note (a red one is
 * never folded out of sight), open to a note a line. With nothing to review
 * the status bar keeps only the keys that still do something.
 */
import { expect, test } from "@playwright/test";

import { enrichCanary } from "./rich";
import { openTower } from "./tauri";

test("the notes before the diff are one folded line led by the weightiest, and open to a note a line, red first", async ({ page }) => {
  await openTower(page, "review/G-0001", { enrich: enrichCanary });
  await expect(page.locator("table").first()).toBeVisible();
  const band = page.locator(".review-notes");
  const head = band.locator(".review-notes-head");
  await expect(head).toHaveAttribute("aria-expanded", "false");
  await expect(head).toContainText(/\d+ notes before you read/);
  // Folded, it is one line, and that line carries the red mark and the first high-severity sentinel.
  expect((await band.boundingBox())!.height).toBeLessThan(36);
  await expect(head.locator(".mark-danger")).toHaveCount(1);
  await expect(head).toContainText("Program code reaches into the tests");
  // The diff starts right under it.
  const gap = (await page.locator(".review-diff .file").first().boundingBox())!.y - ((await band.boundingBox())!.y + (await band.boundingBox())!.height);
  expect(gap).toBeLessThan(20);
  await head.click();
  await expect(head).toHaveAttribute("aria-expanded", "true");
  const notes = band.locator(".review-note");
  const n = await notes.count();
  expect(n).toBeGreaterThanOrEqual(4);
  const red = await notes.evaluateAll((els) => els.map((e) => !!e.querySelector(".mark-danger")));
  // Every red note comes before every quiet one.
  expect(red.indexOf(false)).toBeGreaterThan(0);
  expect(red.slice(red.indexOf(false)).includes(true)).toBe(false);
  // The absence of held-out tests is one of them, with its way to the project's held-out field.
  const none = notes.filter({ hasText: "No held-out tests" });
  await none.getByRole("button", { name: /Set held-out tests/ }).click();
  await expect(page.locator(".project [data-field='holdout']").first()).toBeFocused();
});

test("with nothing to review the status bar keeps Esc and ? only, the header offers nothing to send back, and no slogan sits under the poster", async ({ page }) => {
  await openTower(page, "review/G-0002", {
    enrich: (F) => {
      F["review-G-0002"] = { ...F["review-G-0001"], units: [], files: [], stat: { files: 0, additions: 0, deletions: 0 } };
    },
  });
  await expect(page.locator(".review .empty-poster")).toBeVisible();
  await expect(page.locator(".review-status kbd")).toHaveText(["Esc", "?"]);
  await expect(page.locator(".review-status .status-mouse")).toHaveCount(0);
  await expect(page.getByRole("button", { name: /Request changes/ })).toHaveCount(0);
  await expect(page.locator(".review .empty-poster")).not.toContainText("Facts stay apart from claims");
});
