import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

import {
  enrichCanary,
  enrichCi,
  enrichEngines,
  enrichHeldOut,
  enrichHeldOutTests,
  enrichLook,
  enrichPhone,
  enrichPhoneProblem,
  enrichPushes,
  enrichReview,
  enrichRollback,
  enrichSandboxRefused,
  enrichSecondReady,
  enrichSnoozed,
} from "./rich";
import { criterion, openTower, settled } from "./tauri";

const calls = (page: import("@playwright/test").Page) => page.evaluate(() => (window as unknown as { __towerCalls: Array<[string, unknown]> }).__towerCalls);

test("every decision card offers to be put aside", async ({ page }) => {
  const { fixtures } = await openTower(page, "inbox");
  await expect(page.getByRole("button", { name: "Remind me later" })).toHaveCount((fixtures.inbox as unknown[]).length);
});

test("answering a card closes the loop: the card sits in a folding slot that folds with it, and the receipt rises in with your rule", async ({ page }) => {
  await openTower(page, "inbox");
  const slot = page.locator(".decision-slot").first();
  await expect(slot).toBeVisible();
  await expect(slot.locator(".decision")).toBeVisible();
  await slot.locator(".decision-actions .btn").first().click();
  const toast = page.locator(".toast").first();
  await expect(toast).toBeVisible();
  expect(await toast.evaluate((el) => getComputedStyle(el).animationName)).toBe("rise");
  // The receipt of your own action carries the solid text-1 rule at its left edge: the same pen as "for you only".
  const rule = await toast.evaluate((el) => {
    const s = getComputedStyle(el, "::before");
    el.style.color = getComputedStyle(el).getPropertyValue("--text-1");
    return { width: s.width, background: s.backgroundColor, text1: getComputedStyle(el).color };
  });
  expect(rule.width).toBe("2px");
  expect(rule.background).toBe(rule.text1);
  await expect(slot.locator(".decision")).toHaveClass(/leaving/);
  // The slot folds on the card's own leaving, before any write-back (the shim never answers with a new inbox).
  // (The row cannot go under the card's own two hairlines, so it settles at 2px.)
  await expect.poll(async () => slot.evaluate((el) => parseFloat(getComputedStyle(el).gridTemplateRows))).toBeLessThanOrEqual(2);
  await expect.poll(async () => slot.evaluate((el) => getComputedStyle(el).opacity)).toBe("0");
});

test("a queue has one filled primary at a time, on the focused card, and it follows j/k; the overview's decisions are lines until one is selected", async ({ page }) => {
  await openTower(page, "inbox", { enrich: enrichCi });
  const cards = page.locator(".decision-slot .decision");
  await expect(cards.nth(1)).toBeVisible();
  // The button's colour moves over a 150ms transition, and WebKit advances transitions only on display-driven frames —
  // which a CI runner's VM barely produces, so the colour stayed at the transition's start there. The transition is
  // finished before the colour is read: what is checked is where it settles, not how fast a runner paints.
  const fill = (card: import("@playwright/test").Locator) =>
    card.locator(".btn-primary").first().evaluate((el) => {
      for (const a of el.getAnimations()) a.finish();
      const bg = getComputedStyle(el).backgroundColor;
      el.style.color = getComputedStyle(el).getPropertyValue("--text-1");
      const text1 = getComputedStyle(el).color;
      el.style.color = "";
      return bg === text1 ? "filled" : "plain";
    });
  // The first card is focused by default: its primary is the one black button; the second card's keeps the default frame.
  await expect.poll(() => fill(cards.nth(0))).toBe("filled");
  await expect.poll(() => fill(cards.nth(1))).toBe("plain");
  // The black moves with the focus (the button's colour settles over 150ms); the plain one still carries its key.
  // (Nothing holds the keyboard first, and the queue's keys are bound: on a slow machine they arrive a frame late.)
  // (Which kinds of card the seed left, and in what order, depends on timing; not every card has a primary.)
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
  const primaries = await cards.evaluateAll((els) => els.map((e) => !!e.querySelector(".btn-primary")));
  const target = primaries.findIndex((p, i) => i > 0 && p);
  expect(target).toBeGreaterThan(0);
  for (let i = 1; i <= target; i++) {
    await expect.poll(async () => {
      if (!/focused/.test((await cards.nth(i).getAttribute("class")) ?? "")) await page.keyboard.press("j");
      return (await cards.nth(i).getAttribute("class")) ?? "";
    }, { intervals: [250, 500, 1000] }).toMatch(/focused/);
  }
  await expect.poll(() => fill(cards.nth(target))).toBe("filled");
  await expect.poll(() => fill(cards.nth(0))).toBe("plain");
  await openTower(page, "overview", { enrich: enrichCi });
  // The overview is the whole board: every decision is one line on the rows' grid, and the running goals are on the first screen.
  const lines = page.locator(".board-queue .decision-line");
  await expect(lines.nth(1)).toBeVisible();
  await expect(page.locator(".board-queue .decision")).toHaveCount(0);
  const firstRow = page.locator(".board-rows [data-goal]").first();
  expect((await firstRow.boundingBox())!.y).toBeLessThan(900);
  // One right edge: the lines end where the board's rows end.
  const right = async (sel: string) => page.locator(sel).first().evaluate((el) => Math.round(el.getBoundingClientRect().right));
  expect(await right(".board-queue .decision-line")).toBe(await right(".board-rows [data-goal]"));
  // j opens the first line into its card, which takes the keyboard and the one black button; Esc folds it back.
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
  await expect.poll(async () => {
    if (!(await page.locator(".board-queue .decision").count())) await page.keyboard.press("j");
    return page.locator(".board-queue .decision").count();
  }, { intervals: [250, 500, 1000] }).toBe(1);
  const open = page.locator(".board-queue .decision");
  await expect(open).toHaveClass(/focused/);
  await expect(open).toBeFocused();
  await expect.poll(() => fill(open)).toBe("filled");
  // One line around the focused card: the ring is drawn on the card's own edge, not 2px outside its border.
  expect(await open.evaluate((el) => getComputedStyle(el).outlineOffset)).toBe("-1px");
  // The ? sheet says what Tab reaches here and how to reach every control.
  await page.keyboard.press("?");
  await expect(page.locator(".keys-note")).toContainText("Keyboard navigation");
  await expect(page.locator(".keys-sheet")).toContainText("Fold the open decision back into its line");
  await page.keyboard.press("Escape");
  await expect(page.locator(".keys-sheet")).toHaveCount(0);
  await open.focus();
  await page.keyboard.press("Escape");
  await expect(page.locator(".board-queue .decision")).toHaveCount(0);
  await expect(lines.first().locator(".g-title")).toBeFocused();
  // A click on a line opens it too.
  await lines.nth(1).click();
  await expect(page.locator(".board-queue .decision")).toHaveCount(1);
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
      // The first goal's human criterion is already checked off, and git has an identity, so accepting is not blocked.
      for (const c of F["goal-G-0001"].criteria) c.human_checked = true;
      F.environment.issues = F.environment.issues.filter((i: { kind: string }) => i.kind !== "git_identity_missing");
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
  await expect(page.locator(".review-notes")).toContainText("test harness");
});

for (const scheme of ["light", "dark"] as const) {
  test(`the review tree is a tree — unit rows are open tree items over their files' group — and passes axe with its small text at 4.5:1 (${scheme})`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: scheme, reducedMotion: "reduce" });
    await openTower(page, "review/G-0003", { enrich: enrichReview, theme: scheme });
    const tree = page.getByRole("tree");
    await expect(tree).toBeVisible();
    const units = tree.locator(".unit");
    await expect(units).toHaveCount(2);
    await expect(units.first()).toHaveAttribute("role", "treeitem");
    await expect(units.first()).toHaveAttribute("aria-expanded", "true");
    await expect(units.first()).toHaveAttribute("aria-selected", "true");
    await expect(units.nth(1)).toHaveAttribute("aria-selected", "false");
    // Every file is a tree item inside the group of the unit it belongs to.
    expect(await tree.locator('[role="group"] .tree-file[role="treeitem"]').count()).toBe(3);
    // The directory name and the line count are set in text-2 on the sidebar ground, where text-3 falls under 4.5:1.
    const text2 = await tree.evaluate((el) => {
      el.style.color = getComputedStyle(el).getPropertyValue("--text-2");
      return getComputedStyle(el).color;
    });
    expect(await tree.locator(".unit-dir").first().evaluate((el) => getComputedStyle(el).color)).toBe(text2);
    expect(await tree.locator(".unit-lines").first().evaluate((el) => getComputedStyle(el).color)).toBe(text2);
    expect(await page.locator(".tree-head .kbd").evaluate((el) => getComputedStyle(el).color)).toBe(text2);
    await settled(page);
    const results = await new AxeBuilder({ page }).analyze();
    const serious = results.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
    expect(serious.flatMap((v) => v.nodes.map((n) => `${v.id} ${n.target.join(" ")}`))).toEqual([]);
  });
}

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

test("rolling back is not only for the pointer: a run you can roll back to is a Tab stop, shows its way back when selected, and ↩ takes it", async ({ page }) => {
  await openTower(page, "goal/G-0003", {
    enrich: (F) => {
      for (const r of F["goal-G-0003"].runs) {
        r.ended_at ??= r.started_at + 60_000;
        r.start_pin ??= "3aeb5a6c0ffee";
      }
    },
  });
  const row = page.locator(".run-row-back").first();
  await expect(row).toHaveAttribute("tabindex", "0");
  await expect(page.locator(".section").filter({ has: row })).toContainText("Select a run to roll back to its start");
  const button = row.locator(".run-rollback");
  expect(await button.evaluate((el) => getComputedStyle(el).opacity)).toBe("0");
  await row.focus();
  await expect.poll(() => button.evaluate((el) => getComputedStyle(el).opacity)).toBe("1");
  await page.keyboard.press("Enter");
  // ↩ asks first, as the button does (the native confirmation is the shim's to answer).
  await expect.poll(async () => (await calls(page)).some(([cmd]) => cmd.startsWith("plugin:dialog|"))).toBe(true);
});

test("the look comparison answers the keyboard: modes, slider, held space", async ({ page }) => {
  await openTower(page, "goal/G-0001", { enrich: enrichLook });
  await expect(page.getByText("couldn't check on")).toBeVisible();
  // The reason is on the line, not only in its tooltip.
  await expect(page.locator(".criterion-obs .base-why").first()).toBeVisible();
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
  // The goal page itself, not any first heading: "w" pressed while the start-up route is still on its way is lost.
  await settled(page, "goal/G-0002");
  await page.keyboard.press("w");
  await expect(page.locator("button[aria-pressed=true]", { hasText: "Trace" }).first()).toBeVisible();
  const times = page.locator(".trace-row .trace-time");
  await expect(times.first()).toBeVisible();
  expect(await times.count()).toBeGreaterThan(3);
  // The demo's run lands in one or two minutes: most rows repeat the one above and go quiet.
  expect(await page.locator(".trace-row .trace-time.repeat").count()).toBeGreaterThan(0);
  await expect(times.first()).not.toHaveClass(/repeat/);
  // The list fades in under the filter bar over a row's height, and keyboard scrolling stops under the fade.
  const fade = await page.locator(".trace-filters").evaluate((el) => getComputedStyle(el, "::after").height);
  expect(fade).toBe("16px");
  expect(await page.locator(".trace-scroll").evaluate((el) => getComputedStyle(el).scrollPaddingTop)).toBe("16px");
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

test("A accepts the current hunk as a reading mark: it folds to its header, the review moves on, the count says so, and the mark is kept with the review", async ({ page }) => {
  await openTower(page, "review/G-0003", { enrich: enrichReview });
  await expect(page.locator("table").first()).toBeVisible();
  const heads = page.locator(".hunk-head[data-hunk-index]");
  const before = await heads.count();
  expect(before).toBeGreaterThanOrEqual(2);
  const linesBefore = await page.locator(".dl").count();
  // Undo and accept stand together on a hunk's header while the workspace is yours.
  await expect(heads.first().getByRole("button", { name: "Undo this hunk" })).toBeVisible();
  const accept = heads.first().getByRole("button", { name: "Accept this hunk" });
  await expect(accept).toHaveAttribute("title", /workspace is unchanged/);
  // The hunk closes rather than vanishes: its place stands at the lines' height and shrinks over 160ms, eased in.
  // (Read the moment the fold row is added: on a busy machine it can be gone before a separate round trip lands.)
  await page.evaluate(() => {
    const w = window as unknown as { __fold?: { p: string; d: string; h: number } };
    new MutationObserver((_, obs) => {
      const el = document.querySelector<HTMLElement>(".hunk-fold-inner");
      if (!el) return;
      obs.disconnect();
      w.__fold = { p: getComputedStyle(el).transitionProperty, d: getComputedStyle(el).transitionDuration, h: el.offsetHeight };
    }).observe(document.body, { childList: true, subtree: true });
  });
  await page.keyboard.press("a");
  await expect.poll(() => page.evaluate(() => (window as unknown as { __fold?: { p: string; d: string } }).__fold)).toMatchObject({ p: "height", d: "0.16s" });
  expect(await page.evaluate(() => (window as unknown as { __fold: { h: number } }).__fold.h)).toBeGreaterThan(20);
  await expect(page.locator(".hunk-fold-inner")).toHaveCount(0);
  const marked = page.locator(".hunk-head.hunk-accepted");
  await expect(marked).toHaveCount(1);
  await expect(marked.getByRole("button", { name: /Accepted, \d+ lines? folded/ })).toHaveAttribute("aria-pressed", "true");
  await expect(marked.getByRole("button", { name: "Undo this hunk" })).toHaveCount(0);
  expect(await page.locator(".dl").count()).toBeLessThan(linesBefore);
  // Your register: the solid rule, not green.
  expect(await marked.locator("td").first().evaluate((el) => getComputedStyle(el).boxShadow)).toMatch(/inset/);
  const status = page.locator(".review-accepted");
  await expect(status).toHaveText(/1\/\d+ hunks accepted/);
  await expect(status).toHaveAttribute("title", /reading mark/);
  // Kept with the review, for this diff, never sent to the agent.
  await expect.poll(async () => (await calls(page)).find(([cmd, args]) => cmd === "set_ui_state" && (args as { key: string }).key === "accepted")?.[1]).toMatchObject({ key: "accepted", value: expect.stringMatching(/"range":".+\.\..+"/) });
  // Taken back by its button: the hunk unfolds.
  await marked.getByRole("button", { name: /Accepted/ }).click();
  await expect(page.locator(".hunk-head.hunk-accepted")).toHaveCount(0);
  expect(await page.locator(".dl").count()).toBe(linesBefore);
  // Every hunk of a file accepted: the file is viewed.
  const file = page.locator(".file").first();
  const fileHunks = await file.locator(".hunk-head[data-hunk-index]").count();
  for (let i = 0; i < fileHunks; i++) await file.locator(".accept-hunk").nth(i).click();
  await expect(file.getByRole("button", { name: /Viewed/ })).toHaveAttribute("aria-pressed", "true");
  // Every hunk of the unit accepted: the status bar says so, and where to go next (V, the next unit).
  const all = page.locator(".review-diff .accept-hunk");
  for (let i = 0; i < (await all.count()); i++) if ((await all.nth(i).getAttribute("aria-pressed")) !== "true") await all.nth(i).click();
  await expect(status).toHaveText(/All \d+ hunks accepted/);
  await expect(status.locator("kbd")).toHaveText("V");
  await expect(status).toContainText("next unit");
});

test("a sheet opened inside a sheet gives focus back where it came from, and the first sheet stays", async ({ page }) => {
  await openTower(page, "review/G-0001", { enrich: enrichLook });
  await expect(page.locator("table").first()).toBeVisible();
  await page.keyboard.press("Meta+Shift+Enter");
  const accept = page.getByRole("dialog");
  await expect(accept).toBeVisible();
  // The look criterion's thumbnail sits on the accept sheet; opening it is a second layer.
  const thumb = accept.locator(".look-img-btn").first();
  await expect(thumb).toBeVisible();
  await thumb.click();
  await expect(page.getByRole("dialog")).toHaveCount(2);
  const compare = page.getByRole("dialog").last();
  await expect(compare.locator(".look-side, .look-onion").first()).toBeVisible();
  // Esc closes only the inner one; focus lands back on the thumbnail that opened it, inside the sheet that stays.
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(1);
  await expect(accept).toBeVisible();
  expect(await page.evaluate(() => document.activeElement?.className)).toContain("look-img-btn");
  expect(await page.evaluate(() => !!document.activeElement?.closest('[role="dialog"]'))).toBe(true);
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
});

test("without a git identity the accept sheet blocks and offers the form, for this repository by default", async ({ page }) => {
  await openTower(page, "review/G-0001", {
    enrich: (F) => {
      F.environment.issues = F.environment.issues.filter((i: { kind: string }) => i.kind !== "git_identity_missing");
      F.environment.issues.push({ kind: "git_identity_missing", blocking: false, text: "git has no name and email set.", fix: 'git config --global user.name "Your Name"' });
      for (const c of F["goal-G-0001"].criteria) c.human_checked = true;
    },
  });
  await expect(page.locator("table").first()).toBeVisible();
  await page.keyboard.press("Meta+Shift+Enter");
  const dialog = page.getByRole("dialog");
  await expect(dialog.locator(".panel-blockers")).toContainText("git has no name and email");
  await expect(dialog.getByRole("button", { name: /Accept and/ })).toBeDisabled();
  const only = dialog.getByLabel(/Only for shop/);
  await expect(only).toBeChecked();
  await dialog.getByLabel("Your name").fill("Ada Lovelace");
  await dialog.getByLabel("you@example.com").fill("ada@example.com");
  await dialog.getByRole("button", { name: "Set in git" }).click();
  await expect.poll(async () => (await calls(page)).find(([cmd]) => cmd === "set_git_identity")?.[1]).toEqual({ name: "Ada Lovelace", email: "ada@example.com", projectId: expect.any(String) });
  await expect(page.locator(".toast")).toContainText("in shop");
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
  // The decisions' lines and the goals' rows are one grid: same left edge, same right edge.
  const line = (await page.locator(".board-queue .decision-line").first().boundingBox())!;
  const row = (await page.locator(".board-rows [data-goal]").first().boundingBox())!;
  expect(Math.abs(line.x - row.x)).toBeLessThan(1);
  expect(Math.abs(line.x + line.width - (row.x + row.width))).toBeLessThan(1);
  // An open card keeps that edge too.
  await page.locator(".board-queue .decision-line").first().click();
  const card = (await page.locator(".board-queue .decision").first().boundingBox())!;
  expect(Math.abs(card.x - row.x)).toBeLessThan(1);
  expect(Math.abs(card.x + card.width - (row.x + row.width))).toBeLessThan(1);
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
  await expect(status).toContainText("Last push failed at 21:03");
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
  // The failing tests are named, as machine values, above the output; the sentence does not repeat them.
  await expect(card.locator(".heldout-names code")).toHaveText(["total rounds half-cents up", "applies tax once"]);
  await expect(card.locator(".decision-body")).not.toContainText("Failing in");
  // Each name is a chip of its own: a hairline around it, so two names never read as one sentence.
  expect(await card.locator(".heldout-names code").first().evaluate((el) => getComputedStyle(el).borderTopWidth)).toBe("1px");
  // One primary action on the page, and it is the hint; telling only the names and showing the failure are plain buttons, abandoning asks twice.
  const primaries = page.locator(".goal-page .btn-primary");
  await expect(primaries).toHaveCount(1);
  await expect(primaries).toHaveText(/Send the hint and resume/);
  await expect(card.getByRole("button", { name: "Tell the agent only which tests failed" })).toHaveClass(/btn-default/);
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

test("under the Chinese seed the enriched cards speak Chinese too: the held-out card and the CI card", async ({ page }) => {
  await openTower(page, "inbox", {
    lang: "zh-CN",
    enrich: (F) => {
      enrichHeldOut(F);
      enrichCi(F);
    },
  });
  const card = page.locator(".decision-heldout");
  await expect(card.locator(".heldout-label")).toHaveText("只给你看");
  await expect(card.locator(".heldout-names code")).toHaveText(["total rounds half-cents up", "applies tax once"]);
  await expect(card.getByRole("button", { name: "只告诉 Agent 哪些测试失败" })).toBeVisible();
  await expect(page.getByRole("button", { name: "把失败发给 Agent" })).toBeVisible();
  expect(await page.locator(".inbox").innerText()).not.toMatch(/Send the failures|Tell the agent/);
});

test("a result produced with the held-out tests present is marked for you only, on the goal page and in the verification sheet", async ({ page }) => {
  await openTower(page, "goal/G-0001", { enrich: enrichHeldOut });
  const chips = page.locator(".chip-you");
  await expect(chips).toHaveCount(1);
  await expect(chips).toHaveText("held-out tests, for you only");
  await expect(chips).toHaveAttribute("title", /never saw this output/);
  // The chip sits under C2's row, not C1's.
  const c2 = page.locator(".criterion").filter({ has: page.locator(".num", { hasText: /^C2$/ }) });
  await expect(c2.locator(".chip-you")).toHaveCount(1);
  await page.keyboard.press("r");
  await expect(page.locator("table").first()).toBeVisible();
  await page.keyboard.press("e");
  await expect(page.getByRole("dialog").locator(".chip-you")).toHaveCount(1);
});

test("what the canary saw stands under each criterion, quietly or in the attention register, on the goal page and in the readout; the two newer sentinels read as sentence and list", async ({ page }) => {
  await openTower(page, "goal/G-0001", {
    enrich: (F) => {
      enrichCanary(F);
      enrichHeldOut(F);
      enrichLook(F);
    },
  });
  const lines = page.locator(".goal-page .canary-line");
  await expect(lines).toHaveCount(3);
  // C2 was run with the held-out tests present too: its own line, one register to a line, every note starting under the title.
  await expect(page.locator('.goal-page .canary-line[data-canary="not_checked"] .chip-you')).toHaveCount(0);
  await expect(page.locator(".goal-page .chip-you")).toHaveCount(1);
  const c2row = page.locator(".goal-page .criterion").filter({ has: page.locator('.canary-line[data-canary="not_checked"]') }).first();
  const titleX = (await c2row.locator(".criterion-title").first().boundingBox())!.x;
  for (const note of await c2row.locator(".criterion-obs .col-span").all()) expect(Math.abs((await note.boundingBox())!.x - titleX)).toBeLessThan(1);
  const intact = page.locator('.goal-page .canary-line[data-canary="intact"]');
  // Intact says only what was checked: the must-fail tests failed; never "the assertions are intact".
  await expect(intact).toHaveText(/must-fail tests failed, as they must/);
  await expect(intact.locator("[title]").first()).toHaveAttribute("title", /Nothing more is claimed/);
  expect(await intact.locator(".mark-attention").count()).toBe(0);
  const unchecked = page.locator('.goal-page .canary-line[data-canary="not_checked"]');
  await expect(unchecked).toContainText("assertions not checked");
  await expect(unchecked).toContainText("a pass proves less here");
  const tampered = page.locator('.goal-page .canary-line[data-canary="tampered"]');
  await expect(tampered).toContainText("a test that must fail passed");
  await expect(tampered.locator(".mark-attention")).toBeVisible();
  // A pass that is not evidence is not the green half of "red → green": the tampered criterion's rows never say it.
  const c4 = page.locator(".goal-page .criterion").filter({ hasText: "Rounding tests pass" });
  await expect(c4).toHaveCount(1);
  expect(await c4.innerText()).not.toMatch(/red → green/);
  // C2 failed on the base and passed with an unchecked canary: it still says red → green (C1's base could not run in this fixture).
  await expect(page.locator(".goal-page .criterion").filter({ has: page.locator(".num", { hasText: /^C2$/ }) }).first()).toContainText("red → green");
  // The totals say the same thing as the line: the pass leaves the verified count, takes an amber segment, and the header's seal is withheld.
  const bar = page.locator(".goal-page .section .criteria-bar").first();
  await expect(bar).toContainText("Verified 2/3");
  await expect(bar).toContainText("1 doesn't count");
  await expect(bar.locator(".seg-discounted")).toHaveCount(1);
  const seal = page.locator(".goal-head .seal");
  await expect(seal).toHaveClass(/seal-tampered/);
  await expect(seal).toContainText("Passed, not evidence");
  await expect(seal.locator(".mark-attention")).toBeVisible();
  await expect(page.locator(".goal-page .section-cta .meta")).toContainText("not evidence");
  // The sentinels: the high ones are squares, the medium ones hollow diamonds; the probing detail is a sentence over a list of paths.
  const sentinels = page.locator(".sentinel");
  await expect(sentinels).toHaveCount(4);
  const probing = sentinels.filter({ hasText: "outside its workspace" });
  await expect(probing.locator(".sentinel-prose")).toHaveCount(1);
  await expect(probing.locator(".sentinel-machine")).toHaveCount(5);
  await expect(probing.locator(".sentinel-machine").first()).toHaveText("/Users/you/shop/test/holdout/rounding.test.js");
  const unchecked2 = sentinels.filter({ hasText: "could not be checked" });
  await expect(unchecked2.locator(".sentinel-machine")).toHaveCount(0);
  await expect(unchecked2.locator(".mark-danger")).toBeVisible();
  // Rewriting test machinery (high) beside reaching into it (medium): both details are `path: line` machine lines, whole and unclipped.
  const patches = sentinels.filter({ hasText: "rewrites assertion functions" });
  await expect(patches.locator(".mark-danger")).toBeVisible();
  await expect(patches).toContainText("Needs your confirmation");
  await expect(patches.locator(".sentinel-machine")).toHaveCount(2);
  await expect(patches.locator(".sentinel-prose")).toHaveCount(0);
  expect(await patches.locator(".sentinel-machine").first().evaluate((el) => el.scrollWidth <= el.clientWidth + 1)).toBe(true);
  const touches = sentinels.filter({ hasText: "reaches into assertion libraries" });
  await expect(touches.locator(".mark-danger")).toHaveCount(0);
  await expect(touches).toContainText("Check during review");
  await expect(touches.locator(".sentinel-machine")).toHaveCount(1);
  // Held-out tests ran on this goal, so nothing on the page says there are none.
  await expect(page.locator(".goal-page .held-out-none")).toHaveCount(0);
  // The same three lines in the verification readout; the review header and the readout withhold the seal too.
  await page.keyboard.press("r");
  await expect(page.locator("table").first()).toBeVisible();
  await page.locator(".review-notes-head").click();
  await expect(page.locator(".review-notes .review-note").filter({ hasText: "No held-out tests" })).toHaveCount(0);
  await expect(page.locator(".review-head .seal")).toHaveClass(/seal-tampered/);
  await expect(page.locator(".review-head .criteria-bar")).toContainText("1 doesn't count");
  await page.keyboard.press("e");
  const readout = page.getByRole("dialog");
  await expect(readout.locator(".canary-line")).toHaveCount(3);
  await expect(readout.locator(".seal")).toHaveClass(/seal-tampered/);
  // The look criterion's pictures come first in the readout, in view without scrolling; the ids keep every row named.
  await expect(readout.locator(".verify-item").first().locator(".look-strip")).toBeVisible();
  await expect(readout.locator(".verify-item").first()).toContainText("The checkout page still looks right");
  const strip = (await readout.locator(".look-strip").first().boundingBox())!;
  const sheet = (await readout.boundingBox())!;
  expect(strip.y + strip.height).toBeLessThan(sheet.y + sheet.height);
  await page.keyboard.press("Escape");
  // The accept sheet: the pass counts for nothing, and the criterion heads what is still open.
  await page.keyboard.press("Meta+Shift+Enter");
  const accept = page.getByRole("dialog");
  await expect(accept).toContainText("2 of 3 machine criteria count as evidence; 1 passed with a tampered canary");
  await expect(accept.locator(".panel-section .row.meta").first()).toContainText("C4: a test that must fail passed");
});

test("without held-out tests the goal page says so once, at a reading measure, with the way to set them right after the sentence", async ({ page }) => {
  await openTower(page, "goal/G-0001", { enrich: enrichCanary });
  const none = page.locator(".goal-page .held-out-none");
  await expect(none).toHaveCount(1);
  await expect(none).toContainText("No held-out tests");
  const link = none.getByRole("button", { name: /Set held-out tests/ });
  await expect(link).toBeVisible();
  // The link follows the last word instead of hanging at the far edge of a 130-character line.
  const [p, l] = [(await none.boundingBox())!, (await link.boundingBox())!];
  expect(p.width).toBeLessThan(700);
  expect(l.x + l.width).toBeLessThanOrEqual(p.x + p.width + 1);
});

test("the reason under an empty state reads at its own 44ch measure, not squeezed to a third of it", async ({ page }) => {
  await openTower(page, "goal/G-0002");
  const body = page.locator(".goal-page .empty-body").first();
  await expect(body).toBeVisible();
  const [w, max] = await body.evaluate((el) => [el.getBoundingClientRect().width, parseFloat(getComputedStyle(el).maxWidth)]);
  // As wide as its measure, or as its own text on one line when that is shorter.
  const text = await body.evaluate((el) => {
    const probe = el.cloneNode(true) as HTMLElement;
    Object.assign(probe.style, { position: "absolute", whiteSpace: "nowrap", maxWidth: "none", width: "auto" });
    el.parentElement!.appendChild(probe);
    const width = probe.getBoundingClientRect().width;
    probe.remove();
    return width;
  });
  expect(w).toBeGreaterThanOrEqual(Math.min(max, text) - 1);
});

test("with held-out tests set, nothing is said about their absence", async ({ page }) => {
  await openTower(page, "goal/G-0001", { enrich: enrichHeldOutTests });
  await expect(page.locator(".goal-page .criterion").first()).toBeVisible();
  await expect(page.locator(".held-out-none")).toHaveCount(0);
  await page.keyboard.press("r");
  await expect(page.locator("table").first()).toBeVisible();
  await expect(page.locator(".held-out-none")).toHaveCount(0);
});

test("a sandbox refusal is an environment problem: the card says so before its details with the refused path in view, and the criterion's base line is never red", async ({ page }) => {
  await openTower(page, "goal/G-0004", { enrich: enrichSandboxRefused });
  const card = page.locator(".decision").first();
  await expect(card).toBeVisible();
  const env = card.locator(".decision-env");
  await expect(env).toContainText("An environment problem, not a test failure");
  await expect(env.locator(".result-env")).toBeVisible();
  // The supervisor's sentences stay prose; the runner's and the sandbox's lines are the machine tail, the refused path among them.
  // "Not a test failure" is said once, by the environment line; the supervisor's sentence does not repeat it.
  await expect(card.locator(".decision-body")).toContainText("The sandbox refused something");
  await expect(card.locator(".decision-body")).not.toContainText("not a test failure");
  await expect(card.locator(".decision-body")).not.toContainText("deny(1)");
  await expect(card.locator(".decision-tail")).toContainText("deny(1) file-read-data /Users/you/node_modules/.bin");
  expect((await env.boundingBox())!.y).toBeLessThan((await card.locator(".decision-body").boundingBox())!.y);
  await expect(card.locator(".mark-danger")).toHaveCount(0);
  // The supervisor's backticks are a machine value, not punctuation in the prose.
  await expect(card.locator(".decision-body")).not.toContainText("`");
  await expect(card.locator(".decision-body code.code-val")).toHaveText("npm test");
  // The refused path stands as its own line, with the way to where the fix lives; the page has one name for the way on.
  const refused = card.locator(".decision-refused");
  await expect(refused.locator(".code-val")).toHaveText("/Users/you/node_modules/.bin");
  await expect(page.locator(".goal-head").getByRole("button", { name: /Resume/ })).toHaveCount(0);
  await expect(card.getByRole("button", { name: /^Retry/ })).toHaveClass(/btn-primary/);
  await refused.getByRole("button", { name: /Settings for shop/ }).click();
  await expect(page.locator(".project [data-field='test']")).toBeFocused();
  // On the goal page the criterion's base line: the environment mark, the sentence, the refused lines as machine values; no red, no "red → green".
  await openTower(page, "goal/G-0001", { enrich: enrichSandboxRefused });
  const c1 = page.locator(".goal-page .criterion").filter({ has: page.locator(".num", { hasText: /^C1$/ }) }).first();
  const line = c1.locator(".env-line");
  await expect(line).toHaveCount(1);
  await expect(line.locator(".result-env")).toBeVisible();
  await expect(line).toContainText("the sandbox refused something it needed on the base");
  await expect(line.locator(".env-refused")).toHaveCount(3);
  await expect(line.locator(".env-refused").nth(1)).toHaveText("sandbox-exec: deny(1) file-read-data /Users/you/node_modules/.bin");
  expect(await c1.innerText()).not.toMatch(/red → green/);
  await expect(line.locator(".mark-danger, .result-fail")).toHaveCount(0);
});

test("on the welcome screen a red check's fix is the one primary action, then Check again; with nothing red, adding a repository is", async ({ page }) => {
  const firstRun = (F: Record<string, any>) => ((F.projects = []), (F.goals = []), (F.inbox = []));
  await openTower(page, "overview", {
    enrich: (F) => {
      firstRun(F);
      F.environment.issues = [{ kind: "pi_too_old", blocking: true, text: "Pi is too old.", fix: "npm i -g @earendil-works/pi-coding-agent" }];
    },
  });
  const actions = page.locator(".welcome-actions");
  await expect(actions.locator(".btn-primary")).toHaveCount(1);
  await expect(actions.locator(".btn-primary")).toHaveText("Copy the fix");
  await expect(actions.getByRole("button", { name: "Try a demo goal" })).not.toHaveClass(/btn-primary/);
  await actions.getByRole("button", { name: "Copy the fix" }).click();
  await expect(actions.locator(".btn-primary")).toHaveText("Check again");
  await expect(actions.getByRole("button", { name: "Check again" })).toHaveCount(1);
  await openTower(page, "overview", {
    enrich: (F) => {
      firstRun(F);
      F.environment = { ...F.environment, issues: [], pi_version: "1.6.2" };
    },
  });
  // Pi works but has no model yet: that check is red, and its fix is an action, not a command.
  await expect(page.locator(".welcome-actions .btn-primary")).toHaveText("Open Pi to log in");
  await openTower(page, "overview", {
    enrich: (F) => {
      firstRun(F);
      F.environment = { ...F.environment, issues: [], pi_version: "1.6.2" };
      F.models = [{ provider: "anthropic", id: "claude-opus-5-5", name: "Claude Opus 5.5" }];
    },
  });
  await expect(page.locator(".welcome-actions .btn-primary")).toHaveText("Add a git repository");
});

test("a missing git identity is a check on the welcome screen and in Settings, its two-command fix whole and copyable", async ({ page }) => {
  const identity = (F: Record<string, any>) => {
    // The dumping supervisor may itself lack an identity: one row either way.
    F.environment.issues = F.environment.issues.filter((i: { kind: string }) => i.kind !== "git_identity_missing");
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
  // The form stands above the command: a name, an email, one button, disabled until both are there — the three on one height.
  const save = row.getByRole("button", { name: "Set in git" });
  await expect(save).toBeDisabled();
  expect((await row.locator(".identity-form").boundingBox())!.y).toBeLessThan((await fix.boundingBox())!.y);
  const nameBox = (await row.getByLabel("Your name").boundingBox())!;
  const saveBox = (await save.boundingBox())!;
  expect(Math.round(nameBox.height)).toBe(Math.round(saveBox.height));
  expect(Math.abs(nameBox.y - saveBox.y)).toBeLessThan(1);
  await row.getByLabel("Your name").fill("Ada Lovelace");
  await row.getByLabel("you@example.com").fill("ada@example.com");
  await save.click();
  // No project yet: written to git's global config.
  await expect.poll(async () => (await calls(page)).find(([cmd]) => cmd === "set_git_identity")?.[1]).toEqual({ name: "Ada Lovelace", email: "ada@example.com", projectId: null });
  await expect(page.locator(".toast")).toContainText("git now commits as Ada Lovelace");
  // The welcome screen's route: six stations, joined, the last two green.
  await expect(page.locator(".welcome-station")).toHaveCount(6);
  await expect(page.locator(".welcome-station").nth(2)).toContainText("Claimed done");
  await openTower(page, "settings", { enrich: identity });
  const settingsRow = page.locator(".check-row").filter({ hasText: "git has no name and email" });
  await expect(settingsRow.locator(".fix")).toBeVisible();
  await expect(settingsRow.getByRole("button", { name: "Set in git" })).toBeVisible();
  // With projects, where to write it is a choice: every repository, or one of them.
  await expect(settingsRow.getByRole("button", { name: /^Where: Every repository/ })).toBeVisible();
  // Settings › Environment is a gauge strip: one line of readings, the missing identity wearing its ◆, the problem spelled out under it.
  const gauges = page.locator(".env-gauges .env-gauge");
  await expect(gauges).toHaveCount(4);
  await expect(gauges.nth(0)).toContainText("Pi");
  await expect(gauges.nth(1)).toContainText("git");
  await expect(gauges.nth(2)).toContainText("Sandbox");
  await expect(gauges.nth(3)).toContainText("Identity");
  await expect(gauges.nth(3)).toHaveAttribute("data-mark", "attention");
  await expect(gauges.nth(3).locator(".mark-attention")).toBeVisible();
  await expect(gauges.nth(3)).toContainText("not set");
  const ys = await gauges.evaluateAll((els) => els.map((el) => el.getBoundingClientRect().y));
  expect(Math.max(...ys) - Math.min(...ys)).toBeLessThan(1);
  expect((await page.locator(".env-gauges").boundingBox())!.y).toBeLessThan((await settingsRow.boundingBox())!.y);
  await expect(page.locator(".env-paths")).toContainText("Data directory");
});

test("the command palette can put the page's card aside, and H does the same", async ({ page }) => {
  await openTower(page, "goal/G-0004");
  // (How many cards the seeded goal has depends on timing; the first one counts.)
  await expect(page.locator(".decision").first()).toBeVisible();
  await page.keyboard.press("Meta+k");
  const dialog = page.getByRole("dialog");
  await page.keyboard.type("put aside");
  const option = dialog.getByRole("option").filter({ hasText: /Put aside G-0004 · / });
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

test("a field shows its focus: a darker edge for the pointer, a second line inside for the keyboard", async ({ page }) => {
  await openTower(page, "goal/G-0004", { enrich: enrichHeldOut });
  const area = page.locator(".decision-heldout textarea");
  await expect(area).toBeVisible();
  const text3 = await area.evaluate((el) => getComputedStyle(el).getPropertyValue("--text-3").trim());
  const resting = await area.evaluate((el) => getComputedStyle(el).borderTopColor);
  await area.click();
  const focused = await area.evaluate((el) => ({ border: getComputedStyle(el).borderTopColor, outline: getComputedStyle(el).outlineStyle }));
  expect(focused.border).not.toBe(resting);
  expect(focused.outline).toBe("none");
  // The edge is text-3 itself, not a lighter hairline: the same colour the labels are set in.
  expect(await area.evaluate((el, c) => { el.style.color = c; return getComputedStyle(el).color; }, text3)).toBe(focused.border);
  // Reached from the keyboard, the field gets its inner line as well.
  await page.keyboard.press("Shift+Tab");
  await page.keyboard.press("Tab");
  expect(await page.evaluate(() => document.activeElement?.tagName)).toBe("TEXTAREA");
  expect(await area.evaluate((el) => getComputedStyle(el).boxShadow)).not.toBe("none");
});

test("a review with nothing to review is a poster in the middle of the page, and the status bar stays at the foot", async ({ page }) => {
  await openTower(page, "review/G-0002", {
    enrich: (F) => {
      F["review-G-0002"] = { ...F["review-G-0001"], units: [], files: [], stat: { files: 0, additions: 0, deletions: 0 } };
    },
  });
  const poster = page.locator(".review .empty-poster");
  await expect(poster).toBeVisible();
  await expect(poster).toContainText("No changes");
  const box = (await poster.boundingBox())!;
  expect(box.x).toBeGreaterThan(24);
  expect(box.y).toBeGreaterThan(150);
  const status = (await page.locator(".review-status").boundingBox())!;
  expect(Math.round(status.y + status.height)).toBe(900);
  await expect(page.getByRole("button", { name: "Open the goal page" })).toHaveClass(/btn-default/);
});

test("the briefing is one line: three goals, a count, a pause said once without nested parentheses", async ({ page }) => {
  await page.setViewportSize({ width: 1100, height: 900 });
  await page.addInitScript(() => localStorage.setItem("tower.overviewSeenAt", String(Date.now() - 3 * 3_600_000)));
  await openTower(page, "overview", {
    enrich: (F) => {
      for (const g of F.goals) g.updated_at = Date.now() - 60_000;
      enrichHeldOut(F);
    },
  });
  const bar = page.locator(".today-bar");
  await expect(bar).toBeVisible();
  await expect(bar.locator(".briefing-item")).toHaveCount(4);
  await expect(bar.locator(".briefing-more")).toHaveText("1 more");
  const paused = bar.locator(".briefing-item").filter({ hasText: "G-0004" });
  await expect(paused).toHaveAttribute("title", /Paused \(Held-out tests failed\)$/);
  expect(await bar.innerText()).not.toMatch(/\(\(|（（/);
  expect((await bar.boundingBox())!.height).toBeLessThanOrEqual(24);
  // The state word and its reason — the one thing the briefing is for — are whole, not cut at "fa…".
  await expect(paused).toHaveText(/Held-out tests failed\)$/);
  expect(await paused.evaluate((el) => el.scrollWidth <= el.clientWidth + 1)).toBe(true);
  // The dismissal is a 20pt target.
  expect((await page.getByRole("button", { name: "Got it" }).boundingBox())!.height).toBeGreaterThanOrEqual(20);
});

test("in Settings the phone's problem stands under its switch and above the port; the pairing link is a plain button", async ({ page }) => {
  await openTower(page, "settings", { enrich: enrichPhoneProblem });
  const problem = page.locator(".phone-problem");
  await expect(problem).toBeVisible();
  const problemY = (await problem.boundingBox())!.y;
  const switchY = (await page.getByLabel("Enable the phone page").boundingBox())!.y;
  const portY = (await page.getByRole("spinbutton", { name: "Port" }).boundingBox())!.y;
  expect(switchY).toBeLessThan(problemY);
  expect(problemY).toBeLessThan(portY);
  await expect(page.getByRole("button", { name: "New pairing link" })).toHaveClass(/btn-default/);
  // The state word is a state: "On", not a verb.
  await expect(page.getByRole("button", { name: /^Notifications: / })).toHaveText("On");
});

test("the contract editor's switch is 28×18 with a 32×24 target", async ({ page }) => {
  await openTower(page, "new");
  const toggle = page.getByRole("switch", { name: /Allow network/ });
  await expect(toggle).toBeVisible();
  const box = (await toggle.boundingBox())!;
  expect(Math.round(box.width)).toBe(28);
  expect(Math.round(box.height)).toBe(18);
  // The pressable area reaches 3px above and below and 2px to each side: a press just outside the drawn switch still flips it.
  await expect(toggle).toHaveAttribute("aria-checked", "false");
  // Measured right before each press: the page may still be settling (fonts, the sheet's entrance).
  const at = async () => {
    // A view transition lays its own layers over the page while it plays.
    await page.waitForFunction(
      () => !document.documentElement.dataset.transition && document.getAnimations().every((a) => a.playState !== "running"),
    );
    await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
    return (await toggle.boundingBox())!;
  };
  let b = await at();
  // What is under the point just above the drawn switch: the switch's own target, nothing laid over it.
  const above = await page.evaluate(([x, y]) => {
    const el = document.elementFromPoint(x, y);
    return el?.closest('[role="switch"]') ? "switch" : (el?.outerHTML.slice(0, 120) ?? "nothing");
  }, [b.x + b.width / 2, b.y - 2]);
  expect(above).toBe("switch");
  await page.mouse.click(b.x + b.width / 2, b.y - 2);
  await expect(toggle).toHaveAttribute("aria-checked", "true");
  b = await at();
  await page.mouse.click(b.x - 1, b.y + b.height / 2);
  await expect(toggle).toHaveAttribute("aria-checked", "false");
});

test("the goal page folds its rail under the main column in a half-screen window", async ({ page }) => {
  await page.setViewportSize({ width: 1100, height: 900 });
  await openTower(page, "goal/G-0001");
  const rail = page.locator(".goal-rail .rail");
  await expect(rail).toBeVisible();
  expect(await rail.evaluate((el) => getComputedStyle(el).display)).toBe("grid");
});
