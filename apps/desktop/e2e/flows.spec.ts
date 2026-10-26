import { expect, test } from "@playwright/test";

import { enrichCi, enrichEngines, enrichLook, enrichPhone, enrichReview, enrichRollback, enrichSecondReady, enrichSnoozed } from "./rich";
import { openTower } from "./tauri";

const calls = (page: import("@playwright/test").Page) => page.evaluate(() => (window as unknown as { __towerCalls: Array<[string, unknown]> }).__towerCalls);

test("every decision card offers to be put aside", async ({ page }) => {
  const { fixtures } = await openTower(page, "inbox");
  await expect(page.getByRole("button", { name: "Remind me later" })).toHaveCount((fixtures.inbox as unknown[]).length);
});

test("a put-aside card is still accounted for in the inbox, with its way back", async ({ page }) => {
  await openTower(page, "inbox", { enrich: enrichSnoozed });
  const head = page.getByRole("button", { name: /1 put aside \(04:02\)/ });
  await expect(head).toBeVisible();
  await head.click();
  await expect(page.getByText("Which discount applies first?")).toBeVisible();
  await page.getByRole("button", { name: "Show now" }).click();
  await expect.poll(async () => (await calls(page)).some(([cmd, args]) => cmd === "snooze" && (args as { until: number | null }).until === null)).toBe(true);
});

test("the review queue steps through every ready goal", async ({ page }) => {
  // The demo reaches one ready goal; a second (G-0003) is added so the queue has two stops.
  const { fixtures } = await openTower(page, "inbox", {
    enrich: (F) => {
      enrichReview(F);
      enrichSecondReady(F);
      // The first goal's human criterion is already checked off, so accepting is not blocked.
      for (const c of F["goal-G-0001"].criteria) c.human_checked = true;
    },
  });
  const ready = (fixtures.inbox as Array<{ kind: string; goal_id: string }>).filter((i) => i.kind === "review_ready");
  expect(ready.length).toBe(2);
  await page.getByRole("button", { name: /Review every ready goal/ }).click();
  await expect(page.getByText("Queue 1 / 2")).toBeVisible();
  await expect(page.locator("table").first()).toBeVisible();
  // Accepting the first opens the second.
  await page.keyboard.press("Meta+Shift+Enter");
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await dialog.getByRole("button", { name: /Accept and/ }).click();
  // The queue counts what is left: the second goal is now 1 of 1.
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Clean up cart edge cases");
  await expect(page.getByText("Queue 1 / 1")).toBeVisible();
  expect((await calls(page)).some(([cmd]) => cmd === "accept")).toBe(true);
});

test("the review sidebar names each file once, grouped by unit", async ({ page }) => {
  await openTower(page, "review/G-0003", { enrich: enrichReview });
  const aside = page.getByRole("complementary");
  await expect(aside.locator(".tree-file")).toHaveCount(3);
  await expect(aside.locator(".unit")).toHaveCount(2);
  await expect(aside.getByText("money.js")).toHaveCount(1);
  // The second unit's row carries its risk; clicking it switches the diff.
  await aside.locator(".unit").nth(1).click();
  await expect(page.getByText("Unit 2 / 2")).toBeVisible();
  await expect(page.locator(".risk-reason")).toContainText("test harness");
});

test("the board's identity column keeps the project name legible beside the engine mark", async ({ page }) => {
  await openTower(page, "overview", { enrich: enrichEngines });
  const row = page.locator('.g-row[data-goal="G-0002"]');
  await expect(row.locator(".g-engine")).toHaveText("CC");
  const project = row.locator(".g-project");
  await expect(project).toHaveText("shop");
  expect(await project.evaluate((el) => el.getBoundingClientRect().width >= el.scrollWidth - 1)).toBe(true);
});

test("on a crowded row the engine mark is two letters or gone, never a letter and a half; the age column holds its longest reading", async ({ page }) => {
  const crowd = (F: Record<string, any>) => {
    enrichEngines(F);
    for (const g of F.goals) {
      if (g.id === "G-0002") g.rework_cycles = 1;
      if (g.id === "G-0001") g.updated_at = Date.now() - 100 * 60_000;
    }
  };
  await openTower(page, "overview", { enrich: crowd });
  const row = page.locator('.g-row[data-goal="G-0002"]');
  await expect(row).toHaveAttribute("data-crowded", "true");
  // 1440: id · shop · ⟳ 1/3 · CC would not fit whole, so the mark leaves and the project name stays legible.
  await expect(row.locator(".g-engine")).toBeHidden();
  await expect(row.locator(".g-project")).toHaveText("shop");
  await expect(row.locator(".g-title")).toHaveAttribute("title", /Claude Code/);
  const age = page.locator('.g-row[data-goal="G-0001"] .g-age');
  await expect(age).toHaveText("1h 40m ago");
  expect(await age.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true);
  // Wider, the mark comes back whole.
  await page.setViewportSize({ width: 1700, height: 900 });
  await expect(row.locator(".g-engine")).toHaveText("CC");
});

test("in a half-screen window the live line keeps its verb and lets the elapsed time go, with no two words touching", async ({ page }) => {
  await page.setViewportSize({ width: 1100, height: 900 });
  await openTower(page, "overview", {
    enrich: (F) => {
      for (const g of F.goals) if (g.state === "running") g.run_started_at = Date.now() - 109 * 60_000;
    },
  });
  const running = page.locator(".g-row").filter({ has: page.locator(".live-elapsed") }).first();
  await expect(running).toBeAttached();
  await expect(running.locator(".live-elapsed")).toBeHidden();
  await expect(running.locator(".live-elapsed-sep")).toBeHidden();
  await expect(running.locator(".live-detail")).toHaveAttribute("title", /1h 49m/);
});

test("with a decision card on a ready-to-accept goal, the card's first option is the page's one primary action", async ({ page }) => {
  await openTower(page, "goal/G-0001", { enrich: enrichCi });
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await expect(page.getByRole("button", { name: /Review \d+ files?/ })).toBeVisible();
  const primaries = page.locator(".goal-page .btn-primary");
  await expect(primaries).toHaveCount(1);
  await expect(primaries).toHaveText(/Send the failures to the agent/);
});

test("the title bar's bell is a 22pt target, and a half-screen window drops a healthy engine's label rather than hanging it empty", async ({ page }) => {
  await openTower(page, "overview");
  const bell = page.locator(".gauge-quiet");
  const box = await bell.boundingBox();
  expect(box!.width).toBeGreaterThanOrEqual(22);
  expect(box!.height).toBeGreaterThanOrEqual(22);
  await expect(page.locator(".gauge-engine")).toBeVisible();
  await page.setViewportSize({ width: 1100, height: 900 });
  await expect(page.locator(".gauge-engine")).toBeHidden();
});

test("a paused goal that was never verified shows one primary action and no 'verify again'", async ({ page }) => {
  await openTower(page, "goal/G-0004", { enrich: enrichRollback });
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await expect(page.locator(".goal-page .btn-primary")).toHaveCount(1);
  await expect(page.getByText("Verify again")).toHaveCount(0);
  const undo = page.getByRole("button", { name: "Undo rollback" });
  await expect(undo).toBeVisible();
  // A text button is still a 20pt target.
  expect((await undo.boundingBox())!.height).toBeGreaterThanOrEqual(20);
});

test("the look comparison answers the keyboard: modes, slider, held space", async ({ page }) => {
  await openTower(page, "goal/G-0001", { enrich: enrichLook });
  await expect(page.getByText("couldn't check on")).toBeVisible();
  await page.locator(".look-img-btn").first().click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await page.keyboard.press("2");
  const slider = dialog.getByRole("slider");
  await expect(slider).toHaveValue("50");
  await page.keyboard.press("ArrowRight");
  await expect(slider).toHaveValue("55");
  // Laid over each other, a 390×640 page keeps its proportions (tall, centred) instead of being stretched to the sheet's width.
  const stage = await dialog.locator(".look-onion").evaluate((el) => {
    const r = el.getBoundingClientRect();
    const p = el.parentElement!.getBoundingClientRect();
    return { w: r.width, h: r.height, centred: Math.abs(r.left + r.width / 2 - (p.left + p.width / 2)) < 2 };
  });
  expect(stage.w).toBeLessThan(stage.h);
  expect(stage.w).toBeLessThan(500);
  expect(stage.centred).toBe(true);
  await page.keyboard.press("3");
  await expect(dialog.locator(".look-diff")).toBeVisible();
  await page.keyboard.down("Space");
  expect(await dialog.locator(".look-onion img + img").evaluate((el) => getComputedStyle(el).opacity)).toBe("0");
  await page.keyboard.up("Space");
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  // Focus returns to the thumbnail that opened it.
  expect(await page.evaluate(() => document.activeElement?.className)).toContain("look-img-btn");
});

test("a look thumbnail is as tall as its frame and no wider than its page; the verification sheet says when there is more below", async ({ page }) => {
  await openTower(page, "goal/G-0001", { enrich: enrichLook });
  const img = page.locator(".look-img").first();
  await expect(img).toBeVisible();
  const box = await img.boundingBox();
  expect(Math.round(box!.height)).toBe(96);
  expect(box!.width).toBeLessThan(80);
  await page.keyboard.press("r");
  await expect(page.locator("table").first()).toBeVisible();
  await page.keyboard.press("e");
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  // Four criteria with their output tails run past 80vh: the fade is on, and goes once the sheet is scrolled to its end.
  await expect(dialog.locator(".panel-more")).toHaveClass(/on/);
  await dialog.evaluate((el) => el.scrollTo({ top: el.scrollHeight }));
  await expect(dialog.locator(".panel-more")).not.toHaveClass(/on/);
});

test("⌘P jumps to a file by path", async ({ page }) => {
  const { fixtures } = await openTower(page, "review/G-0001");
  await expect(page.locator("table").first()).toBeVisible();
  await page.keyboard.press("Meta+p");
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  const first = (fixtures["review-G-0001"] as { files: Array<{ path: string }> }).files[0].path;
  await expect(dialog.getByRole("option").first()).toContainText(first.split("/").pop()!);
  await page.keyboard.press("Enter");
  await expect(dialog).toBeHidden();
});

test("the accept sheet opens with focus on the sheet, not a button, and asks for the human check on its row", async ({ page }) => {
  await openTower(page, "review/G-0001");
  await expect(page.locator("table").first()).toBeVisible();
  await page.keyboard.press("Meta+Shift+Enter");
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  expect(await page.evaluate(() => document.activeElement?.getAttribute("role"))).toBe("dialog");
  await expect(dialog.getByText("Waiting for your check").first()).toBeVisible();
});

test("the phone page can be switched on from Settings", async ({ page }) => {
  await openTower(page, "settings");
  await expect(page.getByRole("heading", { name: "Phone" })).toBeVisible();
  await page.getByLabel("Enable the phone page").check();
  await expect.poll(async () => (await calls(page)).some(([cmd, args]) => cmd === "save_settings" && (args as { settings: { remote_enabled: boolean } }).settings.remote_enabled)).toBe(true);
});

test("the phone block waits while the page is off, names its networks, and saves the push topic", async ({ page }) => {
  await openTower(page, "settings");
  await expect(page.getByRole("heading", { name: "Phone" })).toBeVisible();
  // Off: the port and the network switch are not live.
  await expect(page.getByRole("spinbutton", { name: "Port" })).toBeDisabled();
  await expect(page.getByLabel("Also serve on the local network")).toBeDisabled();
  const push = page.getByLabel("Push to (ntfy topic URL)");
  await push.fill("https://ntfy.example.net/tower");
  await push.blur();
  await expect.poll(async () => (await calls(page)).some(([cmd, args]) => cmd === "save_settings" && (args as { settings: { push_url: string } }).settings.push_url === "https://ntfy.example.net/tower")).toBe(true);
});

test("with the phone page on, each link is named by its network", async ({ page }) => {
  await openTower(page, "settings", { enrich: enrichPhone });
  await expect(page.getByLabel("Also serve on the local network")).toBeEnabled();
  const links = page.locator(".phone-link");
  await expect(links).toHaveCount(2);
  await expect(links.nth(0)).toContainText("Tailscale");
  await expect(links.nth(0)).toContainText("100.101.102.103:7317");
  await expect(links.nth(1)).toContainText("Local network");
  await expect(page.locator(".phone-links")).not.toContainText("http://");
});

test("the goal page folds its rail under the main column in a half-screen window", async ({ page }) => {
  await page.setViewportSize({ width: 1100, height: 900 });
  await openTower(page, "goal/G-0001");
  const rail = page.locator(".goal-rail .rail");
  await expect(rail).toBeVisible();
  expect(await rail.evaluate((el) => getComputedStyle(el).display)).toBe("grid");
});
