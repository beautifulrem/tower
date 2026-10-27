/**
 * The accept sheet with something red still open: the items stand by weight,
 * and the primary is "Accept anyway", two presses — the rule Abandon follows.
 */
import { expect, test } from "@playwright/test";

import { enrichCanary } from "./rich";
import { openTower, settled } from "./tauri";

const calls = (page: import("@playwright/test").Page) => page.evaluate(() => (window as unknown as { __towerCalls: Array<[string, unknown]> }).__towerCalls);

test("with red items open, the primary reads Accept anyway, arms on the first press and accepts on the second", async ({ page }) => {
  await openTower(page, "review/G-0001", {
    enrich: (F) => {
      enrichCanary(F);
      for (const c of F["goal-G-0001"].criteria) c.human_checked = true;
      F.environment.issues = F.environment.issues.filter((i: { kind: string }) => i.kind !== "git_identity_missing");
    },
  });
  // The review drawn and still: its keys are bound, and the sheet opens over a page that is not moving.
  await settled(page, "review/G-0001");
  await page.keyboard.press("Meta+Shift+Enter");
  const dialog = page.getByRole("dialog");
  // By weight: what is not evidence or needs your judgement, then what to look at.
  const judgement = dialog.locator(".open-judgement");
  await expect(judgement).toContainText("Not evidence, or needs your judgement");
  // The sentinels are named once, as a group, and their lines are their sentences.
  await expect(judgement.locator(".open-kind")).toHaveText("Sentinels");
  expect(await dialog.innerText()).not.toMatch(/Sentinel:/);
  await expect(judgement).toContainText("Program code rewrites assertion functions");
  await expect(judgement.locator(".mark-danger").first()).toBeVisible();
  await expect(dialog.locator(".open-notice")).toContainText("To look at");
  expect((await judgement.boundingBox())!.y).toBeLessThan((await dialog.locator(".open-notice").boundingBox())!.y);

  const button = dialog.getByRole("button", { name: "Accept anyway" });
  await expect(button).toHaveClass(/btn-primary/);
  await button.click();
  // Armed: the black steps back to the armed frame and keeps its verb; the two seconds drain along its foot; nothing is sent.
  const armed = dialog.locator(".panel-actions .btn.armed");
  await expect(armed).toHaveText("Press again to accept anyway");
  expect(await armed.evaluate((el) => getComputedStyle(el, "::after").height)).toBe("2px");
  expect((await calls(page)).some(([cmd]) => cmd === "accept")).toBe(false);
  await armed.click();
  await expect.poll(async () => (await calls(page)).some(([cmd]) => cmd === "accept")).toBe(true);
});

test("the armed press runs out like Abandon's: after two seconds the first press counts again", async ({ page }) => {
  await page.clock.install();
  await openTower(page, "review/G-0001", {
    enrich: (F) => {
      enrichCanary(F);
      for (const c of F["goal-G-0001"].criteria) c.human_checked = true;
      F.environment.issues = F.environment.issues.filter((i: { kind: string }) => i.kind !== "git_identity_missing");
    },
  });
  await expect(page.locator("table").first()).toBeVisible();
  await page.keyboard.press("Meta+Shift+Enter");
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("button", { name: "Accept anyway" }).click();
  await expect(dialog.locator(".panel-actions .btn.armed")).toBeVisible();
  await page.clock.runFor(2500);
  await expect(dialog.locator(".panel-actions .btn.armed")).toHaveCount(0);
  await dialog.getByRole("button", { name: "Accept anyway" }).click();
  expect((await calls(page)).some(([cmd]) => cmd === "accept")).toBe(false);
});
