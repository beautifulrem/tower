/**
 * A look criterion's steps before the picture are part of the contract:
 * written as numbered lines in the editor, counted and listed on the goal
 * page. Nothing a goal will do is invisible on either.
 */
import { expect, test } from "@playwright/test";

import { enrichLook } from "./rich";
import { criterion, openTower } from "./tauri";

test("in the editor a look criterion takes steps line by line: Enter opens the next, ⌫ on an empty one closes it, a refused line is marked", async ({ page }) => {
  await openTower(page, "new");
  await page.getByRole("button", { name: "Look" }).click();
  const steps = page.locator(".look-steps");
  await expect(steps).toContainText("Before the picture: click, type, press, wait, wait for");
  await steps.getByRole("button", { name: "Step" }).click();
  const first = page.getByLabel(/C\d+ step 1$/);
  await expect(first).toBeFocused();
  await expect(first).toHaveAttribute("placeholder", "click #buy");
  await page.keyboard.type("click #buy");
  await page.keyboard.press("Enter");
  const second = page.getByLabel(/C\d+ step 2$/);
  await expect(second).toBeFocused();
  await page.keyboard.type("drag #a #b");
  await expect(second).toHaveAttribute("aria-invalid", "true");
  await expect(steps.locator(".look-step-no")).toHaveText(["01", "02"]);
  // Mono, without ligatures: a selector reads as typed.
  expect(await second.evaluate((el) => getComputedStyle(el).fontFamily)).toMatch(/JetBrains Mono/);
  await second.fill("");
  await page.keyboard.press("Backspace");
  await expect(page.getByLabel(/C\d+ step 2$/)).toHaveCount(0);
  await expect(first).toBeFocused();
});

test("on the goal page a look criterion with steps says how many, and lists them numbered on a click", async ({ page }) => {
  await openTower(page, "goal/G-0001", {
    enrich: (F) => {
      enrichLook(F);
      const c4 = F["goal-G-0001"].criteria.find((c: { criterion: { id: string } }) => c.criterion.id === "C4");
      c4.criterion.kind.steps = ["click #buy", "type #qty 2", "wait for .total"];
    },
  });
  const row = criterion(page, "C4").first();
  const toggle = row.getByRole("button", { name: "3 steps" });
  await expect(toggle).toHaveAttribute("aria-expanded", "false");
  await toggle.click();
  await expect(toggle).toHaveAttribute("aria-expanded", "true");
  await expect(row.locator(".look-step-list-read .look-step")).toHaveText(["01click #buy", "02type #qty 2", "03wait for .total"]);
});
