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

test("the review of a goal that no longer exists says so and offers the overview, not a Retry that cannot work", async ({ page }) => {
  await openTower(page, "review/G-9999");
  await expect(page.getByText("G-9999 was not found")).toBeVisible();
  await expect(page.getByRole("button", { name: "Retry" })).toHaveCount(0);
  await page.getByRole("button", { name: "Open overview" }).click();
  await expect(page.locator(".view .overview")).toBeVisible();
});

test("acting on a console row reloads its list in place: no page spinner, and the control you used keeps its focus", async ({ page }) => {
  await openTower(page, "operations", {
    enrich: (F) => {
      const pid = F.projects[0].id;
      F.scheduledGoals = [
        { id: "sc-1", project_id: pid, title: "Nightly audit", cron_expr: "0 2 * * 1-5", enabled: true, unattended_strict: true, next_run_at: null, last_goal_id: null },
        { id: "sc-2", project_id: pid, title: "Weekly hunt", cron_expr: "0 4 * * 0", enabled: false, unattended_strict: true, next_run_at: null, last_goal_id: null },
      ];
    },
  });
  const toggle = page.getByRole("switch").nth(1);
  await toggle.focus();
  await page.evaluate(() => {
    (window as any).__spun = false;
    new MutationObserver(() => document.querySelector(".page-loading") && ((window as any).__spun = true)).observe(document.body, { childList: true, subtree: true });
    (window as any).__was = document.activeElement;
    (window as any).__towerCalls.length = 0;
  });
  await page.keyboard.press("Space");
  await expect.poll(() => page.evaluate(() => (window as any).__towerCalls.filter(([c]: [string]) => c === "scheduled_goals").length)).toBeGreaterThan(0);
  await expect.poll(() => page.evaluate(() => document.activeElement === (window as any).__was && document.activeElement?.isConnected)).toBe(true);
  expect(await page.evaluate(() => (window as any).__spun)).toBe(false);
});

// A Run now can fail after it made a goal (a draft that would not start): the row's last run changed all the same, so
// the list is read again whether the run started or not.
test("a Run now that fails reloads the schedules: it may have made a draft", async ({ page }) => {
  await openTower(page, "operations", {
    enrich: (F) => {
      F.scheduledGoals = [
        { id: "sc-1", project_id: F.projects[0].id, title: "Nightly audit", cron_expr: "0 2 * * 1-5", enabled: true, unattended_strict: true, next_run_at: null, last_goal_id: null },
      ];
      F.runNowError = "Created draft G-0042 but could not start it: the intent cannot be empty";
    },
  });
  await expect(page.getByText("Nightly audit")).toBeVisible();
  await page.evaluate(() => ((window as any).__towerCalls.length = 0));
  await page.getByRole("button", { name: "Run", exact: true }).click();
  await expect(page.getByText("Created draft G-0042", { exact: false })).toBeVisible();
  await expect.poll(() => page.evaluate(() => (window as any).__towerCalls.filter(([c]: [string]) => c === "scheduled_goals").length)).toBeGreaterThan(0);
});
