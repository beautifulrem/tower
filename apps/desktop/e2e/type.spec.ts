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

test("the Chinese wordmark voice is tracked 0.08em and a Latin name in it keeps its own; an empty state's reason has its own measure and no orphan", async ({ page }) => {
  await openTower(page, "new", { lang: "zh-CN" });
  const mast = page.locator(".contract-mast");
  await expect(mast).toBeVisible();
  const spacing = (sel: string) => page.locator(sel).first().evaluate((el) => parseFloat(getComputedStyle(el).letterSpacing) / parseFloat(getComputedStyle(el).fontSize));
  expect(await spacing(".contract-mast")).toBeCloseTo(0.08, 2);
  expect(await spacing(".clause-title")).toBeCloseTo(0.08, 2);
  expect(await spacing(".contract-mast-project")).toBeCloseTo(0.02, 2);
  await openTower(page, "goal/G-0004", { lang: "zh-CN" });
  const body = page.locator(".goal-page .empty-body").first();
  await expect(body).toBeVisible();
  const style = await body.evaluate((el) => ({ wrap: getComputedStyle(el).textWrap ?? getComputedStyle(el).getPropertyValue("text-wrap"), max: getComputedStyle(el).maxWidth }));
  expect(style.wrap).toMatch(/pretty/);
  expect(style.max).not.toBe("none");
  // No line of the reason is a lone character or word: every line box is wider than four characters.
  const widths = await body.evaluate((el) => {
    const r = document.createRange();
    r.selectNodeContents(el);
    return [...r.getClientRects()].map((x) => x.width / parseFloat(getComputedStyle(el).fontSize));
  });
  for (const w of widths) expect(w).toBeGreaterThan(4);
});

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
