import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

import { openTower } from "./tauri";

test("the board shows every goal and what needs you", async ({ page }) => {
  const { errors, fixtures } = await openTower(page, "overview");
  for (const g of fixtures.goals as Array<{ title: string }>) {
    await expect(page.getByText(g.title, { exact: false }).first()).toBeVisible();
  }
  expect(errors).toEqual([]);
});

for (const scheme of ["light", "dark"] as const) {
  for (const route of ["overview", "inbox", "goal/G-0001", "review/G-0001", "settings"]) {
    test(`${route} has no serious accessibility violations (${scheme})`, async ({ page }) => {
      await page.emulateMedia({ colorScheme: scheme, reducedMotion: "reduce" });
      await openTower(page, route);
      await page.waitForTimeout(600);
      const results = await new AxeBuilder({ page }).analyze();
      const serious = results.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
      const report = serious.flatMap((v) =>
        v.nodes.map((n) => `${v.id} ${n.target.join(" ")}: ${n.failureSummary?.split("\n").slice(1).join(" ") ?? ""}`),
      );
      expect(report).toEqual([]);
    });
  }
}

test("a goal page reads facts and claims apart, also for screen readers", async ({ page }) => {
  const { errors } = await openTower(page, "goal/G-0001");
  await expect(page.getByRole("heading", { level: 1 }).first()).toBeVisible();
  // The honesty grammar has words, not only dashes and colours.
  await expect(page.locator("body")).toContainText(/Verified by Tower|Agent claim/);
  expect(errors).toEqual([]);
});

test("the review renders the diff", async ({ page }) => {
  const { errors } = await openTower(page, "review/G-0001");
  await expect(page.locator("table").first()).toBeVisible();
  expect(errors).toEqual([]);
});

test("the command palette opens from the keyboard and finds a goal", async ({ page }) => {
  const { fixtures } = await openTower(page, "overview");
  await page.waitForTimeout(300);
  await page.keyboard.press("Meta+k");
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  const title = (fixtures.goals as Array<{ title: string }>)[0].title;
  await page.keyboard.type(title.slice(0, 6));
  await expect(dialog.getByRole("option").first()).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
});

test("the interface speaks Chinese when set to", async ({ page }) => {
  const { errors } = await openTower(page, "inbox", { lang: "zh-CN" });
  await expect(page.locator("html")).toHaveAttribute("lang", "zh-CN");
  await expect(page.locator("body")).toContainText(/[一-鿿]/);
  expect(errors).toEqual([]);
});

test("settings render", async ({ page }) => {
  const { errors } = await openTower(page, "settings");
  await expect(page.getByRole("heading").first()).toBeVisible();
  expect(errors).toEqual([]);
});
