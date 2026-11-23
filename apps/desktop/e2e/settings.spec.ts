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

test("Settings is set out like the contract: seven clauses, unnumbered since they are no sequence, an index beside them that follows the page, and every on/off a switch", async ({ page }) => {
  await openTower(page, "settings");
  const heads = page.locator(".settings .clause-head");
  await expect(heads).toHaveCount(7);
  await expect(page.locator(".settings-page .clause-no")).toHaveCount(0);
  await expect(page.locator(".settings-index ol")).toHaveCount(0);
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

/**
 * Every switch in Settings stands in the value column, its hint on the line under its label — never in the 180px name
 * column, never beside its own label. Measured in both languages: the Chinese labels are the short ones a hint would
 * creep up beside.
 */
for (const lang of ["en", "zh-CN"] as const) {
  test(`every switch in Settings sits in the value column with its hint under its label (${lang})`, async ({ page }) => {
    await openTower(page, "settings", { lang, enrich: (F) => (F.settings.remote_enabled = true) });
    await page.locator(".project .toggle-row").first().waitFor();
    const rows = await page.locator(".settings-form").evaluateAll((forms) =>
      forms.flatMap((form) => {
        const css = getComputedStyle(form);
        const nameCol = parseFloat(css.gridTemplateColumns.split(" ")[0]);
        const valueLeft = form.getBoundingClientRect().left + nameCol + parseFloat(css.columnGap);
        return [...form.querySelectorAll<HTMLElement>(".toggle-row")].map((row) => {
          const label = row.querySelector(".toggle-label")!.getBoundingClientRect();
          const hint = row.querySelector(".field-hint")?.getBoundingClientRect();
          return {
            name: row.querySelector(".toggle-label")!.textContent,
            offset: Math.round(row.getBoundingClientRect().left - valueLeft),
            hintBelow: !hint || hint.top >= label.bottom - 1,
            hintAligned: !hint || Math.abs(hint.left - label.left) < 1,
          };
        });
      }),
    );
    // Extensions, the phone page's two, quiet hours, ready pushes, and the project's loopback switch.
    expect(rows.length).toBeGreaterThanOrEqual(6);
    for (const r of rows) expect(r).toEqual({ name: r.name, offset: 0, hintBelow: true, hintAligned: true });
  });
}

test("a field saved on the Settings page keeps the quiet mode the palette turned on meanwhile", async ({ page }) => {
  await openTower(page, "settings");
  await expect(page.getByRole("switch").first()).toBeVisible();
  await page.keyboard.press("Meta+k");
  await page.keyboard.type("quiet");
  await page.keyboard.press("Enter");
  await expect.poll(async () => (await calls(page)).filter(([cmd]) => cmd === "save_settings").length).toBe(1);
  await page.getByRole("switch", { name: /Enable the phone page/ }).click();
  await expect.poll(async () => (await calls(page)).filter(([cmd]) => cmd === "save_settings").length).toBe(2);
  const saves = (await calls(page)).filter(([cmd]) => cmd === "save_settings") as Array<[string, { settings: { quiet_until: number | null } }]>;
  expect(saves[1][1].settings.quiet_until).not.toBeNull();
});

test("what you typed in Settings is saved when you leave by a key straight after, with the field still focused", async ({ page }) => {
  await openTower(page, "settings");
  const saved = async () => (await calls(page)).filter(([cmd]) => cmd === "save_settings" || cmd === "update_project") as Array<[string, any]>;
  // A project's field…
  await page.locator('.project [data-field="test"]').first().fill("pnpm vitest run");
  await page.keyboard.press("Meta+1");
  await expect(page.locator(".view .overview")).toBeVisible();
  await expect.poll(async () => (await saved()).some(([c, a]) => c === "update_project" && JSON.stringify(a).includes("pnpm vitest run"))).toBe(true);
  // …and one of the app's.
  await page.keyboard.press("Meta+,");
  await page.getByLabel("Editor command").fill("zed");
  await page.keyboard.press("Meta+1");
  await expect(page.locator(".view .overview")).toBeVisible();
  await expect.poll(async () => (await saved()).some(([c, a]) => c === "save_settings" && a.settings.editor === "zed")).toBe(true);
});

test("a field saved on the Settings page keeps quiet mode off once the palette turned it off", async ({ page }) => {
  const saves = async () => (await calls(page)).filter(([cmd]) => cmd === "save_settings") as Array<[string, { settings: { quiet_until: number | null } }]>;
  await openTower(page, "overview");
  await page.keyboard.press("Meta+k");
  await page.keyboard.type("quiet");
  await page.getByRole("option", { name: /Quiet for 1 hour/ }).click();
  await expect.poll(async () => (await saves()).length).toBe(1);
  // The page opens while quiet mode is on, so its form's copy of it is on.
  await page.keyboard.press("Meta+,");
  await expect(page.getByRole("switch").first()).toBeVisible();
  await page.keyboard.press("Meta+k");
  await page.keyboard.type("notif");
  await page.getByRole("option", { name: /Notifications on/ }).click();
  await expect.poll(async () => (await saves()).length).toBe(2);
  expect((await saves())[1][1].settings.quiet_until).toBeNull();
  await page.getByRole("switch", { name: /Enable the phone page/ }).click();
  await expect.poll(async () => (await saves()).length).toBe(3);
  expect((await saves())[2][1].settings.quiet_until).toBeNull();
});
