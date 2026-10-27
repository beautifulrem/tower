/**
 * The interface under load, measured in WebKit: a board of 50 goals must paint quickly, and moving between views must
 * stay instant. Each reading is a median of several runs, taken alternately with an idle control — the same thing on
 * the seeded board of four goals, in the same minutes — so a machine busy with something else slows both and the
 * budget is what the fifty goals add. Absolute bounds remain only for collapse. These tests run after the functional
 * ones (their own Playwright project), not beside them.
 */
import { expect, test, type Page } from "@playwright/test";

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

/** The control's board: the seeded goals, each titled like the fifty's so the last card is found the same way. */
function control(F: Record<string, any>) {
  F.goals = (F.goals as any[]).map((g, i, all) => ({ ...g, title: `${g.title} (${i + 1}${i + 1 === all.length ? "|last" : ""})` }));
}

const median = (xs: number[]) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)];
const RUNS = 3;

/** Milliseconds from asking for the board to its last card on the page. */
async function boardPaint(page: Page, which: "fifty" | "control"): Promise<number> {
  const started = Date.now();
  await openTower(page, "overview", { enrich: which === "fifty" ? fifty : control });
  await expect(page.getByText(which === "fifty" ? "(50)" : "|last)").first()).toBeVisible();
  return Date.now() - started;
}

test("a board of 50 goals paints within 750 ms of the seeded board's time (medians, alternated)", async ({ browser }) => {
  const fiftyRuns: number[] = [];
  const controlRuns: number[] = [];
  for (let i = 0; i < RUNS; i++) {
    for (const which of ["control", "fifty"] as const) {
      const context = await browser.newContext();
      const page = await context.newPage();
      (which === "fifty" ? fiftyRuns : controlRuns).push(await boardPaint(page, which));
      await context.close();
    }
  }
  console.log(`board of 50: ${fiftyRuns.join(", ")} ms; seeded board: ${controlRuns.join(", ")} ms`);
  expect(median(fiftyRuns) - median(controlRuns)).toBeLessThan(750);
  expect(median(fiftyRuns)).toBeLessThan(5000);
});

/** The time each Meta+2 / Meta+1 switch took until the target view stood complete. */
async function switches(page: Page, last: string): Promise<number[]> {
  // Done means the target view's own content is on the page and the other view's is gone: the queue's first card
  // for Needs you, the last goal's row for the overview — not merely the shell's <main>, which never leaves.
  // (Self-contained: Playwright sends its source to the page.) The time the view stood complete, or false.
  const doneAt = ([view, last]: [string, string]) =>
    (view === "inbox"
      ? !!document.querySelector(".view .inbox .decision") && !document.querySelector(".view .overview")
      : [...document.querySelectorAll(".view .overview .board-rows [role=listitem]")].some((r) => r.textContent?.includes(last)) && !document.querySelector(".view .inbox")) &&
    performance.now();
  const timings: number[] = [];
  for (const [key, view] of [["Meta+2", "inbox"], ["Meta+1", "overview"], ["Meta+2", "inbox"], ["Meta+1", "overview"]] as const) {
    expect(await page.evaluate(doneAt, [view === "inbox" ? "overview" : "inbox", last] as [string, string])).toBeTruthy();
    const t0 = await page.evaluate(() => performance.now());
    await page.keyboard.press(key);
    // Polled every frame, so the reading is the first frame the view stands complete in.
    const t1 = await page.waitForFunction(doneAt, [view, last] as [string, string], { polling: "raf" });
    timings.push(((await t1.jsonValue()) as number) - t0);
  }
  return timings;
}

test("moving between views with 50 goals stays within 150 ms of the seeded board's switch (medians, alternated)", async ({ browser }) => {
  const pages = {} as Record<"fifty" | "control", Page>;
  for (const which of ["control", "fifty"] as const) {
    const page = await (await browser.newContext()).newPage();
    await openTower(page, "overview", { enrich: which === "fifty" ? fifty : control });
    await expect(page.getByText(which === "fifty" ? "(50)" : "|last)").first()).toBeVisible();
    pages[which] = page;
  }
  const fiftyRuns: number[] = [];
  const controlRuns: number[] = [];
  for (let i = 0; i < 2; i++) {
    controlRuns.push(...(await switches(pages.control, "|last)")));
    fiftyRuns.push(...(await switches(pages.fifty, "(50)")));
  }
  const show = (xs: number[]) => xs.map((t) => Math.round(t)).join(", ");
  console.log(`view switches with 50 goals: ${show(fiftyRuns)} ms; with the seeded board: ${show(controlRuns)} ms`);
  // The medians hold the budget; one slow switch on a busy machine is not a regression.
  expect(median(fiftyRuns) - median(controlRuns)).toBeLessThan(150);
  expect(median(fiftyRuns)).toBeLessThan(1000);
});
