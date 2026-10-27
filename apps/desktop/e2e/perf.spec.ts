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
  // Done means the target view's own content is on the page and the other view's is gone: the queue's first card
  // for Needs you, the fiftieth goal's row for the overview — not merely the shell's <main>, which never leaves.
  // (Self-contained: Playwright sends its source to the page.) The time the view stood complete, or false.
  const doneAt = (view: "inbox" | "overview") =>
    (view === "inbox"
      ? !!document.querySelector(".view .inbox .decision") && !document.querySelector(".view .overview")
      : [...document.querySelectorAll(".view .overview .board-rows [role=listitem]")].some((r) => r.textContent?.includes("(50)")) && !document.querySelector(".view .inbox")) &&
    performance.now();
  for (const [key, view] of [["Meta+2", "inbox"], ["Meta+1", "overview"], ["Meta+2", "inbox"], ["Meta+1", "overview"]] as const) {
    expect(await page.evaluate(doneAt, view === "inbox" ? "overview" : "inbox")).toBeTruthy();
    const t0 = await page.evaluate(() => performance.now());
    await page.keyboard.press(key);
    // Polled every frame, so the reading is the first frame the view stands complete in.
    const t1 = await page.waitForFunction(doneAt, view, { polling: "raf" });
    timings.push(((await t1.jsonValue()) as number) - t0);
  }
  console.log(`view switches: ${timings.map((t) => Math.round(t)).join(", ")} ms`);
  expect(Math.max(...timings)).toBeLessThan(300);
});
