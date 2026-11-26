import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

import { enrichReview, enrichRich } from "./rich";
import { openReadings, openTower, settled } from "./tauri";

test("the board shows every goal and what needs you", async ({ page }) => {
  const { errors, fixtures } = await openTower(page, "overview");
  for (const g of fixtures.goals as Array<{ title: string }>) {
    await expect(page.getByText(g.title, { exact: false }).first()).toBeVisible();
  }
  expect(errors).toEqual([]);
});

// Review 19 (record only): at its cap `settled` said nothing, so a shot could catch a page still drawing; and its count
// of answers owed would never come back down for a worker that failed to load. It names what is pending at the cap, and
// a worker that failed owes nothing.
// The app warms a waiting review's colours on its own worker while the window idles (`prewarm.ts`): a world with no review
// waiting gives it nothing to warm, so the only answers owed are this test's (under the full suite's load the warming
// was still owed at the cap).
const nothingToWarm = (F: Record<string, any>) => {
  for (const g of F.goals) if (g.state === "in_review") g.diffstat = null;
};
test("settled names what is still pending at its cap; a worker that failed to load owes nothing", async ({ page }) => {
  await openTower(page, "overview", { enrich: nothingToWarm });
  expect(await settled(page, "overview")).toBeNull();
  await page.evaluate(() => new Worker(URL.createObjectURL(new Blob(["onmessage = () => {};"], { type: "text/javascript" }))).postMessage(1));
  expect(await settled(page, undefined, 400)).toBe("1 worker answer(s)");
  await openTower(page, "overview", { enrich: nothingToWarm });
  await settled(page, "overview");
  await page.evaluate(() => new Worker(URL.createObjectURL(new Blob(["this is not code"], { type: "text/javascript" }))).postMessage(1));
  expect(await settled(page, undefined, 3_000)).toBeNull();
});

for (const scheme of ["light", "dark"] as const) {
  for (const route of ["overview", "inbox", "learning", "operations", "goal/G-0001", "review/G-0001", "settings"]) {
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

// The states the design work changed, in the rich world: the goal page with its sentinels and every reading open, the
// inbox queue with its neutral focus, a review opening on a risky unit, and a new contract with its focus.
for (const scheme of ["light", "dark"] as const) {
  const rich: Array<[string, (F: Record<string, any>) => void, ((page: import("@playwright/test").Page) => Promise<void>)?]> = [
    ["goal/G-0001", enrichRich, openReadings],
    ["inbox", enrichRich],
    ["review/G-0003", enrichReview],
    ["new", enrichRich],
  ];
  for (const [route, enrich, then] of rich) {
    test(`${route} in the rich world has no serious accessibility violations (${scheme})`, async ({ page }) => {
      await page.emulateMedia({ colorScheme: scheme, reducedMotion: "reduce" });
      await openTower(page, route, { enrich, theme: scheme });
      await settled(page, route);
      if (then) await then(page);
      const results = await new AxeBuilder({ page }).analyze();
      const serious = results.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
      expect(serious.flatMap((v) => v.nodes.map((n) => `${v.id} ${n.target.join(" ")}`))).toEqual([]);
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
  const verb = dialog.getByRole("option").filter({ hasText: /Review G-\d+: / }).first();
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

test("the goal page's warnings and evidence speak Chinese too, with no English left in them", async ({ page }) => {
  await openTower(page, "goal/G-0001", {
    lang: "zh-CN",
    enrich: (F) => {
      F["goal-G-0001"].contract.engine = "my-acp-agent";
      F["goal-G-0001"].escalated_model = "anthropic/claude-opus-4-5";
      F.environment.issues = [...F.environment.issues, { kind: "no_sandbox", blocking: false, text: "", fix: null }];
    },
  });
  const flags = page.locator(".goal-head .wb-exception");
  await expect(flags).toHaveText(["实验", "无沙箱（S0）", "已升级：anthropic/claude-opus-4-5"]);
  await openReadings(page);
  const strip = page.locator(".ev-strip").first();
  await expect(strip).toHaveAttribute("aria-label", "验证证据");
});

test("settings render", async ({ page }) => {
  const { errors } = await openTower(page, "settings");
  await expect(page.getByRole("heading").first()).toBeVisible();
  expect(errors).toEqual([]);
});
