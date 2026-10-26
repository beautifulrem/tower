import { expect, test } from "@playwright/test";

import { enrichEngines, enrichLook, enrichReview, enrichRollback, enrichSecondReady } from "./rich";
import { openTower } from "./tauri";

const calls = (page: import("@playwright/test").Page) => page.evaluate(() => (window as unknown as { __towerCalls: Array<[string, unknown]> }).__towerCalls);

test("every decision card offers to be put aside", async ({ page }) => {
  const { fixtures } = await openTower(page, "inbox");
  await expect(page.getByRole("button", { name: "Remind me later" })).toHaveCount((fixtures.inbox as unknown[]).length);
});

test("the review queue steps through every ready goal", async ({ page }) => {
  // The demo reaches one ready goal; a second (G-0003) is added so the queue has two stops.
  const { fixtures } = await openTower(page, "inbox", {
    enrich: (F) => {
      enrichReview(F);
      enrichSecondReady(F);
      // The first goal's human criterion is already checked off, so accepting is not blocked.
      for (const c of F["goal-G-0001"].criteria) c.human_checked = true;
    },
  });
  const ready = (fixtures.inbox as Array<{ kind: string; goal_id: string }>).filter((i) => i.kind === "review_ready");
  expect(ready.length).toBe(2);
  await page.getByRole("button", { name: /Review every ready goal/ }).click();
  await expect(page.getByText("Queue 1 / 2")).toBeVisible();
  await expect(page.locator("table").first()).toBeVisible();
  // Accepting the first opens the second.
  await page.keyboard.press("Meta+Shift+Enter");
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await dialog.getByRole("button", { name: /Accept and/ }).click();
  // The queue counts what is left: the second goal is now 1 of 1.
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Clean up cart edge cases");
  await expect(page.getByText("Queue 1 / 1")).toBeVisible();
  expect((await calls(page)).some(([cmd]) => cmd === "accept")).toBe(true);
});

test("the review sidebar names each file once, grouped by unit", async ({ page }) => {
  await openTower(page, "review/G-0003", { enrich: enrichReview });
  const aside = page.getByRole("complementary");
  await expect(aside.locator(".tree-file")).toHaveCount(3);
  await expect(aside.locator(".unit")).toHaveCount(2);
  await expect(aside.getByText("money.js")).toHaveCount(1);
  // The second unit's row carries its risk; clicking it switches the diff.
  await aside.locator(".unit").nth(1).click();
  await expect(page.getByText("Unit 2 / 2")).toBeVisible();
  await expect(page.locator(".risk-reason")).toContainText("test harness");
});

test("the board's identity column keeps the project name legible beside the engine mark", async ({ page }) => {
  await openTower(page, "overview", { enrich: enrichEngines });
  const row = page.locator('.g-row[data-goal="G-0002"]');
  await expect(row.locator(".g-engine")).toHaveText("CC");
  const project = row.locator(".g-project");
  await expect(project).toHaveText("shop");
  expect(await project.evaluate((el) => el.getBoundingClientRect().width >= el.scrollWidth - 1)).toBe(true);
});

test("a paused goal that was never verified shows one primary action and no 'verify again'", async ({ page }) => {
  await openTower(page, "goal/G-0004", { enrich: enrichRollback });
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await expect(page.locator(".goal-page .btn-primary")).toHaveCount(1);
  await expect(page.getByText("Verify again")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Undo rollback" })).toBeVisible();
});

test("the look comparison answers the keyboard: modes, slider, held space", async ({ page }) => {
  await openTower(page, "goal/G-0001", { enrich: enrichLook });
  await expect(page.getByText("couldn't check on")).toBeVisible();
  await page.locator(".look-img-btn").first().click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await page.keyboard.press("2");
  const slider = dialog.getByRole("slider");
  await expect(slider).toHaveValue("50");
  await page.keyboard.press("ArrowRight");
  await expect(slider).toHaveValue("55");
  await page.keyboard.press("3");
  await expect(dialog.locator(".look-diff")).toBeVisible();
  await page.keyboard.down("Space");
  expect(await dialog.locator(".look-onion img + img").evaluate((el) => getComputedStyle(el).opacity)).toBe("0");
  await page.keyboard.up("Space");
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  // Focus returns to the thumbnail that opened it.
  expect(await page.evaluate(() => document.activeElement?.className)).toContain("look-img-btn");
});

test("⌘P jumps to a file by path", async ({ page }) => {
  const { fixtures } = await openTower(page, "review/G-0001");
  await expect(page.locator("table").first()).toBeVisible();
  await page.keyboard.press("Meta+p");
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  const first = (fixtures["review-G-0001"] as { files: Array<{ path: string }> }).files[0].path;
  await expect(dialog.getByRole("option").first()).toContainText(first.split("/").pop()!);
  await page.keyboard.press("Enter");
  await expect(dialog).toBeHidden();
});

test("the accept sheet opens with focus on the sheet, not a button, and asks for the human check on its row", async ({ page }) => {
  await openTower(page, "review/G-0001");
  await expect(page.locator("table").first()).toBeVisible();
  await page.keyboard.press("Meta+Shift+Enter");
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  expect(await page.evaluate(() => document.activeElement?.getAttribute("role"))).toBe("dialog");
  await expect(dialog.getByText("Waiting for your check").first()).toBeVisible();
});

test("the phone page can be switched on from Settings", async ({ page }) => {
  await openTower(page, "settings");
  await expect(page.getByRole("heading", { name: "Phone" })).toBeVisible();
  await page.getByLabel("Enable the phone page").check();
  await expect.poll(async () => (await calls(page)).some(([cmd, args]) => cmd === "save_settings" && (args as { settings: { remote_enabled: boolean } }).settings.remote_enabled)).toBe(true);
});

test("the goal page folds its rail under the main column in a half-screen window", async ({ page }) => {
  await page.setViewportSize({ width: 1100, height: 900 });
  await openTower(page, "goal/G-0001");
  const rail = page.locator(".goal-rail .rail");
  await expect(rail).toBeVisible();
  expect(await rail.evaluate((el) => getComputedStyle(el).display)).toBe("grid");
});
