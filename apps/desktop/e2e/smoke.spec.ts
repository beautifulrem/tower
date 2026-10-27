import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

import { openTower, settled } from "./tauri";

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
      await settled(page, route);
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
  // The board first: a key pressed before the app has drawn it may land before the shortcut is bound.
  await settled(page, "overview");
  await page.keyboard.press("Meta+k");
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  const title = (fixtures.goals as Array<{ title: string }>)[0].title;
  await page.keyboard.type(title.slice(0, 6));
  await expect(dialog.getByRole("option").first()).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
});

test("the command palette is a verb list: review and answer from anywhere, and a way out when nothing matches", async ({ page }) => {
  await openTower(page, "overview");
  await settled(page, "overview");
  await page.keyboard.press("Meta+k");
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  // Verbs stand first among the commands, before any typing.
  await expect(dialog.getByRole("option").first()).toContainText(/^(Review|Answer) G-\d+/);
  await page.keyboard.type("rev");
  const verb = dialog.getByRole("option").filter({ hasText: /Review G-\d+ · / }).first();
  await expect(verb).toBeVisible();
  // A verb about a goal wears that goal's glyph, not a generic icon.
  await expect(verb.locator(".palette-icon svg")).toHaveAttribute("aria-label", /Ready to accept/);
  // With a query, what you can do and where you can go are two groups.
  await page.keyboard.press("Meta+a");
  await page.keyboard.type("cart");
  await expect(dialog.locator(".palette-group")).toHaveText(["Commands", "Goals"]);
  await page.keyboard.press("Meta+a");
  await page.keyboard.type("qzxv");
  await expect(dialog.getByText(/No matches for/)).toBeVisible();
  await expect(dialog.getByRole("button", { name: /New goal/ })).toBeVisible();
  await page.keyboard.press("Escape");
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
