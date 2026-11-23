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
