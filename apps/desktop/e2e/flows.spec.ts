import { expect, test } from "@playwright/test";

import { enrichCi, enrichEngines, enrichHeldOut, enrichLook, enrichPhone, enrichPhoneProblem, enrichPushes, enrichReview, enrichRollback, enrichSecondReady, enrichSnoozed } from "./rich";
import { openTower } from "./tauri";

const calls = (page: import("@playwright/test").Page) => page.evaluate(() => (window as unknown as { __towerCalls: Array<[string, unknown]> }).__towerCalls);

test("every decision card offers to be put aside", async ({ page }) => {
  const { fixtures } = await openTower(page, "inbox");
  await expect(page.getByRole("button", { name: "Remind me later" })).toHaveCount((fixtures.inbox as unknown[]).length);
});

test("answering a card closes the loop: the card sits in a folding slot and the receipt rises in", async ({ page }) => {
  await openTower(page, "inbox");
  const slot = page.locator(".decision-slot").first();
  await expect(slot).toBeVisible();
  await expect(slot.locator(".decision")).toBeVisible();
  await slot.locator(".decision-actions .btn").first().click();
  const toast = page.locator(".toast").first();
  await expect(toast).toBeVisible();
  expect(await toast.evaluate((el) => getComputedStyle(el).animationName)).toBe("rise");
  await expect(slot.locator(".decision")).toHaveClass(/leaving/);
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

test("the title bar's runs gauge fills the ring by the slots in use, and silence beats once", async ({ page }) => {
  await openTower(page, "overview", {
    enrich: (F) => {
      F.settings = { ...F.settings, max_concurrent: 4 };
      // One goal has been silent for twenty minutes: the hollow square shows, and beats once as it appears.
      for (const g of F.goals) if (g.state === "running") g.updated_at = Date.now() - 20 * 60_000;
    },
  });
  const gauge = page.locator(".gauge-runs");
  await expect(gauge).toBeVisible();
  // One of four running: a quarter wedge, counter-clockwise from the top to the left.
  await expect(gauge.locator("path")).toHaveAttribute("d", "M5 5 L5 1 A4 4 0 0 0 1 5 Z");
  await expect(page.locator(".gauge-active")).toContainText("1/4");
  const hollow = page.locator(".gauge-dot.hollow");
  await expect(hollow).toBeVisible();
  expect(await hollow.evaluate((el) => getComputedStyle(el).animationName)).toBe("beat");
  expect(await hollow.evaluate((el) => getComputedStyle(el).animationIterationCount)).toBe("1");
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

test("the trace writes a minute once; a sheet's text area takes focus in its border, not a ring", async ({ page }) => {
  await openTower(page, "goal/G-0002");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await page.keyboard.press("w");
  const times = page.locator(".trace-row .trace-time");
  await expect(times.first()).toBeVisible();
  expect(await times.count()).toBeGreaterThan(3);
  // The demo's run lands in one or two minutes: most rows repeat the one above and go quiet.
  expect(await page.locator(".trace-row .trace-time.repeat").count()).toBeGreaterThan(0);
  await expect(times.first()).not.toHaveClass(/repeat/);
  await openTower(page, "review/G-0001");
  await expect(page.locator("table").first()).toBeVisible();
  await page.keyboard.press("c");
  const area = page.getByRole("dialog").locator("textarea");
  await area.focus();
  expect(await area.evaluate((el) => getComputedStyle(el).outlineStyle)).toBe("none");
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

test("an empty board shows its own grid: column heads and three hollow lines, no pretend data", async ({ page }) => {
  await openTower(page, "overview", {
    enrich: (F) => {
      F.goals = [];
      F.inbox = [];
    },
  });
  await expect(page.getByText("No active goals")).toBeVisible();
  const ghost = page.locator(".board-ghost");
  await expect(ghost).toBeVisible();
  await expect(ghost.locator(".g-row")).toHaveCount(4);
  await expect(ghost.locator(".board-ghost-head")).toContainText("Goal");
  await expect(ghost.locator(".board-ghost-row .seg")).toHaveCount(9);
  // Hollow: no digits, no words in the rows.
  expect(await ghost.locator(".board-ghost-row").allInnerTexts()).toEqual(["", "", ""]);
  // The heads sit in the same columns the rows use (the title's and the live line's left edges, the age's right edge).
  for (const [i, edge] of [[1, "x"], [2, "x"], [6, "right"]] as const) {
    const h = await ghost.locator(".board-ghost-head > span").nth(i).boundingBox();
    const r = await ghost.locator(".board-ghost-row").first().locator("> span").nth(i).boundingBox();
    const at = (b: { x: number; width: number }) => (edge === "x" ? b.x : b.x + b.width);
    expect(Math.abs(at(h!) - at(r!))).toBeLessThan(1);
  }
  if (process.env.SHOTS) await page.screenshot({ path: `${process.env.SHOTS}/overview-empty-ghost.png` });
});

test("at 1800 wide the decision queue and the board share one centred container", async ({ page }) => {
  await page.setViewportSize({ width: 1800, height: 1100 });
  await openTower(page, "overview");
  const board = page.locator(".overview");
  await expect(board).toBeVisible();
  const r = await board.evaluate((el) => {
    const b = el.getBoundingClientRect();
    const v = el.parentElement!.getBoundingClientRect();
    return { w: b.width, leftGap: b.left - v.left, rightGap: v.right - b.right };
  });
  expect(Math.round(r.w)).toBe(1280);
  expect(Math.abs(r.leftGap - r.rightGap)).toBeLessThan(2);
  const card = page.locator(".board-queue .decision").first();
  const row = page.locator(".g-row").first();
  expect(Math.abs((await card.boundingBox())!.x - (await row.boundingBox())!.x)).toBeLessThan(8);
});

test("the phone page switched on but not served says why, with its way out, and nothing to scan; the title bar carries the reading", async ({ page }) => {
  await openTower(page, "settings", { enrich: enrichPhoneProblem });
  const problem = page.locator(".phone-problem");
  await expect(problem).toBeVisible();
  await expect(problem).toContainText("Tailscale is not connected");
  await expect(problem).toContainText("Open Tailscale, or allow the local network");
  await expect(page.locator(".phone-qr")).toHaveCount(0);
  await expect(page.locator(".phone-link")).toHaveCount(0);
  const gauge = page.locator(".gauge-phone");
  await expect(gauge).toHaveText(/Phone page off/);
  await expect(gauge).toHaveAttribute("title", /Tailscale is not connected/);
});

test("quiet hours are a daily window with two edges, and the last push's failure is a line with its time and reason", async ({ page }) => {
  await openTower(page, "settings", { enrich: enrichPushes });
  await expect(page.getByRole("heading", { name: "Notifications and pushes" })).toBeVisible();
  const from = page.getByLabel("Quiet hours · From");
  await expect(from).toHaveValue("22:00");
  await expect(page.getByLabel("Quiet hours · to")).toHaveValue("08:00");
  await from.fill("23:30");
  await from.blur();
  await expect.poll(async () => (await calls(page)).some(([cmd, args]) => cmd === "save_settings" && (args as { settings: { quiet_hours: { start: number } | null } }).settings.quiet_hours?.start === 23 * 60 + 30)).toBe(true);
  // Not a time: the field goes back to the saved edge.
  await from.fill("late");
  await from.blur();
  await expect(from).toHaveValue("23:30");
  await expect(page.getByLabel("Also push when a goal is ready to accept")).toBeChecked();
  const status = page.locator(".push-status");
  await expect(status).toContainText("Last push failed · 21:03");
  await expect(status).toContainText("ntfy.example.net could not be reached");
  // A test push goes where the field points, and the line follows it.
  await page.getByRole("button", { name: "Send a test push" }).click();
  await expect.poll(async () => (await calls(page)).some(([cmd]) => cmd === "test_push")).toBe(true);
  await expect(status).toContainText("Last push sent");
  await expect(page.locator(".toast")).toContainText("Test push sent");
  // Switching the window off saves null.
  await page.getByLabel("Quiet hours every day").uncheck();
  await expect.poll(async () => (await calls(page)).some(([cmd, args]) => cmd === "save_settings" && (args as { settings: { quiet_hours: unknown } }).settings.quiet_hours === null)).toBe(true);
});

test("a held-out failure's card keeps the output for you, makes the hint the one primary path, and sends it as a note", async ({ page }) => {
  await openTower(page, "goal/G-0004", { enrich: enrichHeldOut });
  const card = page.locator(".decision-heldout");
  await expect(card).toBeVisible();
  await expect(card.locator(".heldout-label")).toHaveText("For you only");
  await expect(card.locator(".heldout .output-tail")).toContainText("AssertionError");
  // One primary action on the page, and it is the hint; showing the agent the failure is a plain button, abandoning asks twice.
  const primaries = page.locator(".goal-page .btn-primary");
  await expect(primaries).toHaveCount(1);
  await expect(primaries).toHaveText(/Send the hint and resume/);
  await expect(card.getByRole("button", { name: /Show the agent the failure/ })).toHaveClass(/btn-default/);
  await expect(card.getByRole("button", { name: "Abandon this goal" })).toHaveClass(/btn-danger/);
  // The output stands above the field, the field above the agent-facing choices.
  const tops = await Promise.all([".heldout", ".decision-text", ".decision-actions"].map(async (sel) => (await card.locator(sel).boundingBox())!.y));
  expect(tops[0]).toBeLessThan(tops[1]);
  expect(tops[1]).toBeLessThan(tops[2]);
  // The page's steer box steps aside: the card owns the only text field.
  await expect(page.locator(".goal-page textarea")).toHaveCount(1);
  await card.locator("textarea").fill("Half-cents round up, not down");
  await page.keyboard.press("Meta+Enter");
  await expect.poll(async () => (await calls(page)).find(([cmd]) => cmd === "answer")?.[1]).toEqual({ inboxId: expect.any(String), response: "Half-cents round up, not down" });
});

test("a result produced with the held-out tests present is marked for you only, on the goal page and in the verification sheet", async ({ page }) => {
  await openTower(page, "goal/G-0001", { enrich: enrichHeldOut });
  const chips = page.locator(".chip-you");
  await expect(chips).toHaveCount(1);
  await expect(chips).toHaveText("held-out tests · for you only");
  await expect(chips).toHaveAttribute("title", /never saw this output/);
  // The chip sits under C2's row, not C1's.
  const c2 = page.locator(".criterion").filter({ hasText: "C2" });
  await expect(c2.locator(".chip-you")).toHaveCount(1);
  await page.keyboard.press("r");
  await expect(page.locator("table").first()).toBeVisible();
  await page.keyboard.press("e");
  await expect(page.getByRole("dialog").locator(".chip-you")).toHaveCount(1);
});

test("a missing git identity is a check on the welcome screen and in Settings, its two-command fix whole and copyable", async ({ page }) => {
  const identity = (F: Record<string, any>) => {
    F.environment.issues.push({
      kind: "git_identity_missing",
      blocking: false,
      text: "git has no name and email set.",
      fix: 'git config --global user.name "Your Name" && git config --global user.email you@example.com',
    });
  };
  await openTower(page, "overview", { enrich: (F) => (identity(F), (F.projects = []), (F.goals = []), (F.inbox = [])) });
  const row = page.locator(".check-row").filter({ hasText: "git has no name and email" });
  await expect(row).toBeVisible();
  const fix = row.locator(".fix");
  await expect(fix).toHaveText(/user\.name .* && git config --global user\.email you@example\.com$/);
  // Whole, not clipped: the button shows all of its text.
  expect(await fix.evaluate((el) => el.scrollWidth <= el.clientWidth + 1 && el.scrollHeight <= el.clientHeight + 1)).toBe(true);
  // The welcome screen's route: six stations, joined, the last two green.
  await expect(page.locator(".welcome-station")).toHaveCount(6);
  await expect(page.locator(".welcome-station").nth(2)).toContainText("Claimed done");
  await openTower(page, "settings", { enrich: identity });
  await expect(page.locator(".check-row").filter({ hasText: "git has no name and email" }).locator(".fix")).toBeVisible();
});

test("the command palette can put the page's card aside, and H does the same", async ({ page }) => {
  await openTower(page, "goal/G-0004");
  await expect(page.locator(".decision")).toBeVisible();
  await page.keyboard.press("Meta+k");
  const dialog = page.getByRole("dialog");
  await page.keyboard.type("put aside");
  const option = dialog.getByRole("option").filter({ hasText: "Put aside G-0004 · Paused" });
  await expect(option).toBeVisible();
  await expect(option.locator("kbd")).toHaveText("H");
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await page.keyboard.press("h");
  // The native "later" menu is asked for (the shim records the menu plugin's calls).
  await expect.poll(async () => (await calls(page)).some(([cmd]) => String(cmd).startsWith("plugin:menu|"))).toBe(true);
});

test("start-up failure is Tower's own strip with the power off: dashes for readings, one error lit, no rules line", async ({ page }) => {
  await page.addInitScript(() => {
    // The supervisor does not answer: `goals` throws, like a Tauri command whose state is missing.
    const orig = (window as any).__TAURI_INTERNALS__;
    Object.defineProperty(window, "__TAURI_INTERNALS__", {
      configurable: true,
      set(v) {
        const invoke = v.invoke;
        v.invoke = async (cmd: string, a: unknown) => {
          if (cmd === "goals") throw "supervisor did not start: database locked";
          return invoke(cmd, a);
        };
        Object.defineProperty(window, "__TAURI_INTERNALS__", { value: v, configurable: true, writable: true });
      },
      get() {
        return orig;
      },
    });
  });
  await openTower(page, "overview");
  const failed = page.locator(".boot-failed");
  await expect(failed).toBeVisible();
  await expect(failed.locator(".boot-gauges")).toContainText("1 error");
  await expect(failed.locator(".boot-gauges")).toContainText("—/— running");
  await expect(failed.locator(".boot-error")).toContainText("database locked");
  await expect(failed.locator(".empty-rules")).toHaveCount(0);
  await expect(failed.getByRole("button", { name: "Retry" })).toBeVisible();
});

test("the goal page folds its rail under the main column in a half-screen window", async ({ page }) => {
  await page.setViewportSize({ width: 1100, height: 900 });
  await openTower(page, "goal/G-0001");
  const rail = page.locator(".goal-rail .rail");
  await expect(rail).toBeVisible();
  expect(await rail.evaluate((el) => getComputedStyle(el).display)).toBe("grid");
});
