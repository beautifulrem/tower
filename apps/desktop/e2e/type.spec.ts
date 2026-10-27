/**
 * Type that carries evidence: every mono text reads exactly as written (no
 * programming ligatures, no contextual alternates), and body text keeps
 * whole words at the end of a line.
 */
import { expect, test } from "@playwright/test";

import { enrichCanary } from "./rich";
import { openTower } from "./tauri";

const features = (el: Element) => {
  const s = getComputedStyle(el);
  return { family: s.fontFamily, features: s.fontFeatureSettings };
};

test("mono text has no ligatures: a sentinel's evidence, a command, an id, a key cap", async ({ page }) => {
  await openTower(page, "goal/G-0001", { enrich: enrichCanary });
  const evidence = page.locator(".sentinel-machine").filter({ hasText: "assert.strictEqual = (a, b) => (a === 10.02" }).first();
  await expect(evidence).toBeVisible();
  for (const el of [evidence, page.locator(".goal-page .criterion-cmd").first(), page.locator(".goal-sub .code-val").first(), page.locator(".kbd").first()]) {
    const f = await el.evaluate(features);
    expect(f.family).toMatch(/JetBrains Mono/);
    expect(f.features).toContain('"liga" 0');
    expect(f.features).toContain('"calt" 0');
  }
  // The UI font keeps its own features (Inter's contextual alternates and the single-storey a).
  expect((await page.locator(".goal-title").evaluate(features)).features).toContain('"calt"');
  expect((await page.locator(".goal-title").evaluate(features)).features).not.toContain('"calt" 0');
});
