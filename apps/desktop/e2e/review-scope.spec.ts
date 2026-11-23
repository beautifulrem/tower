/**
 * Undo, edit and apply write to the workspace against the whole change (base → pin). In a narrower scope the
 * hunk indexes and file texts come from a different diff, so those actions must not be offered there.
 */
import { expect, test } from "@playwright/test";

import { enrichReview } from "./rich";
import { openTower } from "./tauri";

test("undo is offered on all changes only: a narrower scope's hunk index would undo different code", async ({ page }) => {
  await openTower(page, "review/G-0003", {
    enrich: (F) => {
      enrichReview(F);
      const r = F["review-G-0003"];
      r.snapshots = [
        { rev: r.base_commit, kind: "base", label: "base", run_no: null, at: null },
        { rev: "1111111111111111111111111111111111111111", kind: "run_start", label: "R-01", run_no: 1, at: null },
        { rev: r.pin, kind: "pin", label: "Current", run_no: null, at: null },
      ];
    },
  });
  await expect(page.locator("table").first()).toBeVisible();
  const undo = page.locator(".undo-hunk");
  // In review, on all changes, every hunk can be undone.
  await expect(undo.first()).toBeVisible();

  await page.getByRole("tab", { name: "Last turn" }).click();
  await expect(page.getByRole("tab", { name: "Last turn" })).toHaveAttribute("aria-selected", "true");
  await expect(undo).toHaveCount(0);
  await page.locator(".review-diff").click({ position: { x: 4, y: 4 } });
  await page.keyboard.press("u");
  const calls = await page.evaluate(() => (window as any).__towerCalls.map(([c]: [string]) => c));
  expect(calls).not.toContain("revert_hunk");

  await page.getByRole("tab", { name: "All changes" }).click();
  await expect(undo.first()).toBeVisible();
});
