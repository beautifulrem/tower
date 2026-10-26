import { expect, test } from "@playwright/test";

import { openTower } from "./tauri";

const calls = (page: import("@playwright/test").Page) => page.evaluate(() => (window as unknown as { __towerCalls: Array<[string, unknown]> }).__towerCalls);

test("every decision card offers to be put aside", async ({ page }) => {
  const { fixtures } = await openTower(page, "inbox");
  await expect(page.getByRole("button", { name: "Remind me later" })).toHaveCount((fixtures.inbox as unknown[]).length);
});

test("the review queue steps through every ready goal", async ({ page }) => {
  const { fixtures } = await openTower(page, "inbox");
  const ready = (fixtures.inbox as Array<{ kind: string; goal_id: string }>).filter((i) => i.kind === "review_ready");
  test.skip(ready.length < 2, "needs two ready goals");
  await page.getByRole("button", { name: /Review every ready goal/ }).click();
  await expect(page.getByText(`Queue 1 / ${ready.length}`)).toBeVisible();
  await expect(page.locator("table").first()).toBeVisible();
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
