/**
 * The interface under load, measured in WebKit: a board of 50 goals must
 * paint quickly, and moving between views must stay instant. Generous
 * bounds (CI runners are slow); they catch work that grows with the board,
 * not milliseconds.
 */
import { expect, test } from "@playwright/test";

import { openTower } from "./tauri";

/** Fifty goals, built from the seeded ones with new ids and titles. */
function fifty(F: Record<string, any>) {
  const base = F.goals as any[];
  const goals: any[] = [];
  for (let i = 0; i < 50; i++) {
    const g = structuredClone(base[i % base.length]);
    const id = `G-${String(100 + i).padStart(4, "0")}`;
    goals.push({ ...g, id, title: `${g.title} (${i + 1})` });
    const detail = structuredClone(F[`goal-${base[i % base.length].id}`]);
    if (detail) F[`goal-${id}`] = { ...detail, summary: { ...detail.summary, id, title: `${g.title} (${i + 1})` } };
  }
  F.goals = goals;
}

test("a board of 50 goals paints within a second and a half", async ({ page }) => {
  const started = Date.now();
  await openTower(page, "overview", { enrich: fifty });
  await expect(page.getByText("(50)").first()).toBeVisible();
  const painted = Date.now() - started;
  console.log(`board of 50: ${painted} ms to the last card`);
  expect(painted).toBeLessThan(1500);
});

test("moving between views stays under 300 ms with 50 goals", async ({ page }) => {
  await openTower(page, "overview", { enrich: fifty });
  await expect(page.getByText("(50)").first()).toBeVisible();
  const timings: number[] = [];
  for (const key of ["Meta+2", "Meta+1", "Meta+2", "Meta+1"]) {
    const t0 = await page.evaluate(() => performance.now());
    await page.keyboard.press(key);
    await page.waitForFunction(() => document.querySelector("main") !== null);
    // The next frame after the route changed.
    const t1 = await page.evaluate(() => new Promise<number>((r) => requestAnimationFrame(() => r(performance.now()))));
    timings.push(t1 - t0);
  }
  console.log(`view switches: ${timings.map((t) => Math.round(t)).join(", ")} ms`);
  expect(Math.max(...timings)).toBeLessThan(300);
});
