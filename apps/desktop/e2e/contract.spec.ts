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
  // An example reads as one: "e.g." before it, never a step that looks already written.
  await expect(first).toHaveAttribute("placeholder", "e.g. click #buy");
  await page.keyboard.type("click #buy");
  await page.keyboard.press("Enter");
  const second = page.getByLabel(/C\d+ step 2$/);
  await expect(second).toBeFocused();
  // With lines in the list, the verbs stay in view as its head.
  await expect(steps.locator(".look-steps-verbs")).toContainText("wait for");
  await page.keyboard.type("drag #a #b");
  await expect(second).toHaveAttribute("aria-invalid", "true");
  // The line says why, under itself, and the field points at that sentence for a screen reader.
  const why = steps.locator(".look-step-why");
  await expect(why).toHaveText("Start with a verb Tower knows: click, type, press, wait or wait for");
  await expect(second).toHaveAttribute("aria-describedby", (await why.getAttribute("id"))!);
  await second.fill("click");
  await expect(why).toHaveText(/click needs what to click/);
  await second.fill("click #pay");
  await expect(why).toHaveCount(0);
  await second.fill("drag #a #b");
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
  // By the id cell itself: a text filter is case-insensitive and also matched a pin such as @115c435.
  const row = page.locator(".goal-page .criterion").filter({ has: page.locator(".num", { hasText: /^C4$/ }) }).first();
  const toggle = row.getByRole("button", { name: "3 steps" });
  await expect(toggle).toHaveAttribute("aria-expanded", "false");
  await toggle.click();
  await expect(toggle).toHaveAttribute("aria-expanded", "true");
  await expect(row.locator(".look-step-list-read .look-step")).toHaveText(["01click #buy", "02type #qty 2", "03wait for .total"]);
});

test("a slow first open of the editor shows the contract's skeleton, past 150 ms, never a blank page", async ({ page }) => {
  // Hold the editor's code back, as a cold start on a busy machine does.
  await page.route(/views\/ContractEditor/, async (route) => {
    await new Promise((r) => setTimeout(r, 800));
    await route.continue();
  });
  await openTower(page, "overview");
  await page.locator(".overview").waitFor();
  await page.keyboard.press("Meta+n");
  const skeleton = page.locator(".contract-skeleton");
  await expect(skeleton).toBeVisible();
  await expect(skeleton).toHaveAttribute("role", "status");
  // Its clause heads stand where the editor's will, numbered as they are.
  await expect(skeleton.locator(".clause-no")).toHaveText(["01", "02", "03"]);
  // It waits before it is seen, and the wait is a delay, not a fade.
  expect(await skeleton.evaluate((el) => [getComputedStyle(el).animationDelay, getComputedStyle(el).animationDuration])).toEqual(["0.15s", "0s"]);
  await expect(page.locator(".editor .contract-mast-word")).toBeVisible();
  await expect(skeleton).toHaveCount(0);
});
