/**
 * What the first paint carries: the board and the first half of one
 * language's words. The goal page and the words only later views say are
 * fetched once the first frame is up, without a click; no view ever shows a
 * dictionary key while its words are on the way.
 */
import { expect, test } from "@playwright/test";

import { openTower } from "./tauri";

/** A dictionary key standing where words should be, e.g. `review.acceptWrite`. */
const KEY = /\b(review|settings|contract|trace|welcome|look|activity|goal)\.[a-z]+[A-Z][A-Za-z]*\b/;

test("the goal page and the second half of the words follow the first frame on their own", async ({ page }) => {
  const asked: string[] = [];
  page.on("request", (r) => asked.push(new URL(r.url()).pathname));
  await openTower(page, "overview");
  await expect(page.locator(".overview")).toBeVisible();
  await expect.poll(() => asked.some((p) => p.endsWith("/views/GoalPage.tsx"))).toBe(true);
  await expect.poll(() => asked.some((p) => p.endsWith("/locales/en.later.ts"))).toBe(true);
  // The other language is not fetched at all.
  expect(asked.some((p) => /\/locales\/zh-CN(\.later)?\.ts$/.test(p))).toBe(false);
});

for (const route of ["goal/G-0001", "review/G-0003", "settings", "new"]) {
  test(`opened first, ${route} shows words, never a key`, async ({ page }) => {
    await openTower(page, route);
    await expect(page.locator(".view > *").first()).toBeVisible();
    // Sampled every frame from the first one: no frame shows a key.
    const sawKey = await page.evaluate(
      (src) =>
        new Promise<string | null>((done) => {
          const key = new RegExp(src);
          let frames = 0;
          const tick = () => {
            const m = document.body.innerText.match(key);
            if (m) return done(m[0]);
            if (++frames > 30) return done(null);
            requestAnimationFrame(tick);
          };
          tick();
        }),
      KEY.source,
    );
    expect(sawKey).toBeNull();
  });
}
