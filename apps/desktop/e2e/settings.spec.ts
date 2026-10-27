/**
 * Settings › Environment: the hints that say "click Check again" have the
 * button on the block's head, and git's scope picker reads in full.
 */
import { expect, test } from "@playwright/test";

import { openTower } from "./tauri";

const calls = (page: import("@playwright/test").Page) => page.evaluate(() => (window as unknown as { __towerCalls: Array<[string, unknown]> }).__towerCalls);

test("the Environment clause carries Check again on its head, and it reads the environment again", async ({ page }) => {
  await openTower(page, "settings");
  const head = page.locator(".settings-block").first().locator(".clause-head");
  await expect(head.getByRole("heading", { name: "Environment" })).toBeVisible();
  const before = (await calls(page)).filter(([cmd]) => cmd === "environment").length;
  await head.getByRole("button", { name: "Check again" }).click();
  await expect.poll(async () => (await calls(page)).filter(([cmd]) => cmd === "environment").length).toBeGreaterThan(before);
});

test("Settings is set out like the contract: seven numbered clauses, an index beside them that follows the page, and every on/off a switch", async ({ page }) => {
  await openTower(page, "settings");
  const heads = page.locator(".settings .clause-head");
  await expect(heads).toHaveCount(7);
  await expect(heads.first().locator(".clause-no")).toHaveText("01");
  const index = page.getByRole("navigation", { name: "Settings clauses" });
  await expect(index.getByRole("link")).toHaveCount(7);
  await expect(index.getByRole("link").first()).toHaveAttribute("aria-current", "location");
  // A click brings the clause up, and the index marks it as the one you are in.
  await index.getByRole("link", { name: /Notifications and pushes/ }).click();
  await expect(index.getByRole("link", { name: /Notifications and pushes/ })).toHaveAttribute("aria-current", "location");
  await expect.poll(async () => (await page.locator("#set-attention").boundingBox())!.y).toBeLessThan(500);
  // One boolean control across Settings and the contract: the switch.
  expect(await page.locator('.settings input[type="checkbox"]').count()).toBe(0);
  expect(await page.locator('.settings [role="switch"]').count()).toBeGreaterThanOrEqual(4);
  await expect(page.getByRole("switch", { name: /Enable the phone page/ })).toBeVisible();
});

test("git's scope picker in Settings shows its whole choice, never cut off", async ({ page }) => {
  await openTower(page, "settings", {
    enrich: (F) => {
      F.environment.issues = F.environment.issues.filter((i: { kind: string }) => i.kind !== "git_identity_missing");
      F.environment.issues.push({ kind: "git_identity_missing", blocking: false, text: "git has no name and email set.", fix: 'git config --global user.name "Your Name"' });
    },
  });
  const label = page.locator(".identity-scope .ellipsis").first();
  await expect(label).toHaveText("Every repository (git's global config)");
  expect(await label.evaluate((el) => el.scrollWidth <= el.clientWidth + 1)).toBe(true);
});
