/**
 * A view that throws, or whose code fails to load, takes only itself down: the sidebar and the other views keep
 * working, and the failed one says what went wrong instead of leaving a blank pane.
 */
import { expect, test } from "@playwright/test";

import { openTower } from "./tauri";

test("a view whose code fails to load says so, and the rest of the app still works", async ({ page }) => {
  // Settings lives in the console chunk; refuse to serve it.
  await page.route(/\/src\/views\/Learning\.tsx/, (r) => r.abort());
  const { fixtures } = await openTower(page, "settings");
  await expect(page.getByText("Couldn't load this")).toBeVisible();
  await expect(page.getByRole("button", { name: "Retry" })).toBeVisible();
  // The board does not need that chunk: moving there clears the failure.
  await page.keyboard.press("Meta+1");
  await expect(page.getByText("Couldn't load this")).toHaveCount(0);
  const first = (fixtures.goals as Array<{ title: string }>)[0].title;
  await expect(page.locator(".content").getByText(first, { exact: false }).first()).toBeVisible();
});

test("a section whose list could not be read says so instead of saying it is empty, and Retry reads it again", async ({ page }) => {
  await openTower(page, "operations", { enrich: (F) => (F.mergeQueueError = "the store is locked") });
  await expect(page.getByText("the store is locked")).toBeVisible();
  await expect(page.getByText("Couldn't load this")).toBeVisible();
  // The other sections read fine and keep their own empty states.
  await expect(page.getByText("No schedules")).toBeVisible();
  await expect(page.getByText("Queue empty")).toHaveCount(0);
  await page.evaluate(() => ((window as any).__towerCalls.length = 0));
  await page.getByRole("button", { name: "Retry" }).click();
  await expect.poll(() => page.evaluate(() => (window as any).__towerCalls.map(([c]: [string]) => c))).toContain("merge_queue");
});

test("a live update keeps your place on the board: the row you are on stays focused", async ({ page }) => {
  const { fixtures } = await openTower(page, "overview");
  await expect(page.locator(".board-rows:not(.board-queue) .g-title")).not.toHaveCount(0);
  const row = page.locator(".board-rows:not(.board-queue) .g-title").first();
  await row.focus();
  await page.evaluate(() => ((window as any).__was = document.activeElement));
  const goals = fixtures.goals as Array<Record<string, unknown>>;
  // The supervisor pushes changed goals while agents work. Another row's goal pausing regroups the board.
  const second = (await page.locator(".board-rows:not(.board-queue) .g-title").nth(1).getAttribute("title"))!.split("\n")[0];
  const other = goals.find((g) => g.title === second)!;
  await page.evaluate((g) => (window as any).__towerEmit("tower://update", { type: "goal", goal: { ...g, state: "paused", pause_reason: { kind: "human" } } }), other);
  await expect(page.locator(".board-group h2", { hasText: "Paused" })).toBeVisible();
  await expect.poll(() => page.evaluate(() => document.activeElement === (window as any).__was && document.activeElement?.isConnected)).toBe(true);

  // The same in the sidebar: the goal you are on keeps its focus when another one moves group.
  await page.locator(".side-scroll .side-goal").first().focus();
  await page.evaluate(() => ((window as any).__was = document.activeElement));
  await page.evaluate((g) => (window as any).__towerEmit("tower://update", { type: "goal", goal: { ...g, state: "running", pause_reason: null } }), other);
  await expect(page.locator(".board-group h2", { hasText: "Paused" })).toHaveCount(0);
  await expect.poll(() => page.evaluate(() => document.activeElement === (window as any).__was && document.activeElement?.isConnected)).toBe(true);
});
