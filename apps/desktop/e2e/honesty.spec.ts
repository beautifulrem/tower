/**
 * The honesty grammar holds on every surface of one goal: a pass that is
 * not evidence is never drawn as the verifier's green check — not in the
 * title, not in the sidebar, not at the head of its criterion row.
 */
import { expect, test } from "@playwright/test";

import { enrichCanary } from "./rich";
import { openTower } from "./tauri";

test("with a tampered pass the title's glyph, the sidebar's and the criterion's mark are the seal's amber ◆, never a green check", async ({ page }) => {
  await openTower(page, "goal/G-0001", { enrich: enrichCanary });
  const head = page.locator(".goal-head");
  await expect(head.locator(".seal-tampered")).toBeVisible();
  await expect(head.locator(".row > svg.glyph").first()).toHaveClass(/mark-attention/);
  await expect(head.locator(".row > svg.glyph").first()).toHaveAttribute("aria-label", /Passed, not evidence/);
  const side = page.locator(".side-goal").filter({ hasText: "Fix the cart total" });
  await expect(side.locator(".side-icon svg")).toHaveClass(/mark-attention/);
  // The tampered criterion's row: ◆ in its mark column; "passed" stays, it is a fact.
  const row = page.locator(".goal-page .criterion").filter({ hasText: "Rounding tests pass" }).first();
  await expect(row.locator(".criterion-row").first().locator(".result-tampered")).toBeVisible();
  await expect(row.locator(".criterion-row").first().locator(".result-pass")).toHaveCount(0);
  await expect(row.locator(".col-result").first()).toHaveText(/passed/);
  // The criteria that do count keep the verifier's check.
  await expect(page.locator(".goal-page .criterion .criterion-row .result-pass").first()).toBeVisible();
});
