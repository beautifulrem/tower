/**
 * The preview harness: renders the real Vite pages in WebKit against the
 * dumped views, enriched with the states the demo does not reach, and writes
 * one PNG per screen. Off unless SHOTS points at a directory, so the normal
 * run never pays for it:
 *
 *   SHOTS=/tmp/shots tools/e2e.sh e2e/shots.spec.ts
 *   SHOTS=/tmp/shots SHOTS_ONLY=review tools/e2e.sh e2e/shots.spec.ts   (names containing "review")
 *
 * `tools/screenshot.sh` (the real window) is still the source for
 * assets/screenshots when the screen is unlocked; this is the fallback.
 */
import { mkdirSync } from "node:fs";
import { join } from "node:path";

import { type Page, test } from "@playwright/test";

import { enrichRich } from "./rich";
import { openTower, settled } from "./tauri";

const OUT = process.env.SHOTS;
const ONLY = process.env.SHOTS_ONLY;
test.skip(!OUT, "set SHOTS=<dir> to render the preview screens");

type F = Record<string, any>;
type Lang = "en" | "zh-CN";
type Theme = "light" | "dark";

interface Screen {
  name: string;
  route: string;
  width?: number;
  height?: number;
  lang?: Lang;
  theme?: Theme;
  /** A selector to capture instead of the viewport (a block inside a scrolling view). */
  element?: string;
  /** What this screen draws once it is ready, when it is not the route's usual content (the welcome page, an empty review). */
  ready?: string;
  /** Edits on top of the rich world (a first run, an empty review…). */
  enrich?: (F: F) => void;
  after?: (page: Page) => Promise<void>;
}

/** The same screen in English and light, and in Chinese and dark: the two pairs every changed screen is looked at in. */
const pair = (s: Omit<Screen, "lang" | "theme">): Screen[] => [
  { ...s, name: `${s.name}-en-light`, lang: "en", theme: "light" },
  { ...s, name: `${s.name}-zh-dark`, lang: "zh-CN", theme: "dark" },
];

/** The first run: no projects, no goals — the welcome screen, with the dumped environment's red Pi check. */
const firstRun = (F: F) => {
  F.projects = [];
  F.goals = [];
  F.inbox = [];
};
/** The same first run with every environment check passing. */
const firstRunClean = (F: F) => {
  firstRun(F);
  F.environment = { ...F.environment, problems: [], issues: [], pi_version: "1.6.2" };
  F.models = [
    { provider: "anthropic", id: "claude-sonnet-4-5", name: "Claude Sonnet 4.5", reasoning: true, cost_input: 3, cost_output: 15, context_window: 200000 },
    { provider: "openai", id: "gpt-5", name: "GPT-5", reasoning: true, cost_input: 1.25, cost_output: 10, context_window: 400000 },
  ];
};
/** A project with nothing on the board. */
const emptyBoard = (F: F) => {
  F.goals = [];
  F.inbox = [];
  F.snoozed = [];
};
/** G-0002's review has nothing in it. */
const emptyReview = (F: F) => {
  F["review-G-0002"] = { ...F["review-G-0001"], units: [], files: [], stat: { files: 0, additions: 0, deletions: 0 } };
};

const reviewReady = async (page: Page) => {
  await page.locator("table").first().waitFor();
};
const press = (...keys: string[]) => async (page: Page) => {
  for (const k of keys) {
    await page.keyboard.press(k);
    await page.waitForTimeout(150);
  }
};

/** Populates realistic Learning, Operations, Snapshot Timeline & AST semantic-fold data for final showcase captures. */
const enrichConsole = (F: F) => {
  const now = Date.now();
  const pid = F.projects?.[0]?.id ?? "p1";
  F.memoryProposals = [
    {
      id: "mp-1",
      scope: "project",
      project_id: pid,
      goal_id: "G-0001",
      text: "Always compute cart totals in integer cents and round half-up at tax boundaries.",
      detail: "Derived from human review comment on src/cart.js:18 and verified red→green pass.",
      taint_level: "none",
      taint_classes: [],
      origin: "Human review · G-0001",
      evidence: ["src/cart.js:18", "C1 red→green @a1b2c3d"],
      status: "pending",
      created_at: now - 14 * 60_000,
    },
    {
      id: "mp-2",
      scope: "project",
      project_id: pid,
      goal_id: "G-0002",
      text: "Prefer running unit tests via `node --test` before invoking the full workspace build.",
      detail: "Observed repeated fast feedback cycle during G-0002 rework.",
      taint_level: "standard",
      taint_classes: ["agent_tool_output"],
      origin: "Run trace · G-0002",
      evidence: ["R-02 tool_ended"],
      status: "pending",
      created_at: now - 42 * 60_000,
    },
    {
      id: "mp-3",
      scope: "user",
      project_id: null,
      goal_id: "G-0004",
      text: "Ignore slow timeout assertions when running checkout benchmarks under load.",
      detail: "Proposed after web documentation fetch & test failure.",
      taint_level: "high",
      taint_classes: ["external_web", "sentinel_flagged"],
      origin: "Agent claim · G-0004",
      evidence: ["sentinel:assertion_reduced"],
      status: "pending",
      created_at: now - 95 * 60_000,
    },
  ];
  F.calibrationRows = [
    { engine: "pi", model: "anthropic/claude-sonnet-4-5", goals_total: 18, first_pass_rate: 0.83, high_sentinel_rate: 0.05, avg_reworks: 0.4, blocked_rate: 0.06, avg_cost_usd: 1.42, sample_sufficient: true },
    { engine: "claude-code", model: "claude-opus-4-5", goals_total: 11, first_pass_rate: 0.91, high_sentinel_rate: 0.0, avg_reworks: 0.2, blocked_rate: 0.0, avg_cost_usd: 2.85, sample_sufficient: true },
    { engine: "codex", model: "openai/gpt-5-codex", goals_total: 4, first_pass_rate: 0.75, high_sentinel_rate: 0.25, avg_reworks: 1.0, blocked_rate: 0.25, avg_cost_usd: 0.96, sample_sufficient: false },
  ];
  F.scheduledGoals = [
    { id: "sc-1", project_id: pid, title: "Nightly dependency & lockfile audit", cron_expr: "0 2 * * 1-5", enabled: true, unattended_strict: true, next_run_at: now + 6 * 3600_000, last_goal_id: "G-0001" },
    { id: "sc-2", project_id: pid, title: "Weekly flaky test hunt", cron_expr: "0 4 * * 0", enabled: true, unattended_strict: true, next_run_at: now + 48 * 3600_000, last_goal_id: null },
  ];
  F.mergeQueue = [
    { goal_id: "G-0001", project_id: pid, goal_title: "Fix the cart total", branch: "tower/G-0001-fix-cart-total", position: 0, status: "ready", conflict_files: [] },
    { goal_id: "G-0003", project_id: pid, goal_title: "Clean up cart edge cases", branch: "tower/G-0003-cart-edge-cases", position: 1, status: "conflict", conflict_files: ["src/cart.js", "test/cart.test.js"] },
  ];
  F.storageInventory = {
    total_bytes: 184 * 1024 * 1024,
    reclaimable_bytes: 92 * 1024 * 1024,
    goals: [
      { goal_id: "G-0001", title: "Fix the cart total", state: "in_review", workspace_bytes: 48 * 1024 * 1024, verify_bytes: 28 * 1024 * 1024, cache_bytes: 16 * 1024 * 1024, total_bytes: 92 * 1024 * 1024, reclaimable: false },
      { goal_id: "G-0004", title: "Find out why checkout is slow", state: "archived", workspace_bytes: 44 * 1024 * 1024, verify_bytes: 32 * 1024 * 1024, cache_bytes: 16 * 1024 * 1024, total_bytes: 92 * 1024 * 1024, reclaimable: true },
    ],
  };
  const rev = F["review-G-0003"];
  if (rev?.files?.length) {
    rev.snapshots = [
      { rev: rev.base_commit, kind: "base", label: `base @${String(rev.base_commit).slice(0, 7)}`, run_no: null, at: now - 3600_000 },
      { rev: "99a1b2c", kind: "run_start", label: "R-01 @99a1b2c", run_no: 1, at: now - 1800_000 },
      { rev: rev.pin, kind: "pin", label: `Current @${String(rev.pin).slice(0, 7)}`, run_no: 2, at: now - 120_000 },
    ];
    // Only a modified file can hold a moved block; an added file's lines are all new, and the diff never folds them.
    if (rev.files[0]?.hunks?.length > 1) rev.moved_hunks = { [rev.files[0].path]: [rev.files[0].hunks.length - 1] };
  }
};

const bothThemes = (s: Omit<Screen, "lang" | "theme">): Screen[] => [
  { ...s, name: `final-${s.name}-dark`, lang: "en", theme: "dark" },
  { ...s, name: `final-${s.name}-light`, lang: "en", theme: "light" },
];

const screens: Screen[] = [
  // The board, the queue, the first run.
  ...pair({ name: "overview", route: "overview" }),
  { name: "overview-zh-dark-1100", route: "overview", lang: "zh-CN", theme: "dark", width: 1100 },
  { name: "overview-en-light-1800", route: "overview", lang: "en", theme: "light", width: 1800 },
  { name: "overview-en-light-j", route: "overview", lang: "en", theme: "light", after: press("j", "j") },
  ...pair({ name: "overview-empty", route: "overview", enrich: emptyBoard }),
  ...pair({ name: "inbox", route: "inbox" }),
  ...pair({ name: "welcome-red", route: "overview", enrich: firstRun, ready: ".welcome" }),
  { name: "welcome-clean-en-light", route: "overview", lang: "en", theme: "light", enrich: firstRunClean, ready: ".welcome" },

  // Goal pages: tampered C5 with sentinels, running, held-out card, cannot-run.
  ...pair({ name: "goal-G-0001", route: "goal/G-0001" }),
  { name: "goal-G-0001-en-light-1800", route: "goal/G-0001", lang: "en", theme: "light", width: 1800 },
  { name: "goal-G-0002-en-light", route: "goal/G-0002", lang: "en", theme: "light" },
  { name: "goal-G-0004-zh-dark", route: "goal/G-0004", lang: "zh-CN", theme: "dark" },
  ...pair({ name: "goal-G-0005-cannot-run", route: "goal/G-0005" }),
  ...pair({ name: "heldout-card", route: "goal/G-0004", element: ".decision-heldout" }),
  ...pair({ name: "cannot-run-card", route: "goal/G-0005", element: ".decision" }),
  {
    name: "look-compare-zh-dark",
    route: "goal/G-0001",
    lang: "zh-CN",
    theme: "dark",
    after: async (page) => {
      await page.locator(".look-img-btn").first().click();
      await page.getByRole("dialog").waitFor();
    },
  },

  // Review: two files in two orders, the notes band, accept-all, the readout and the accept sheet, the empty review.
  ...pair({ name: "review-G-0003", route: "review/G-0003", after: reviewReady }),
  ...pair({ name: "review-G-0001", route: "review/G-0001", after: reviewReady }),
  ...pair({ name: "review-G-0003-all-accepted", route: "review/G-0003", after: async (page) => (await reviewReady(page), await press("a", "a", "a", "a")(page)) }),
  ...pair({ name: "review-G-0001-readout", route: "review/G-0001", after: async (page) => (await reviewReady(page), await press("e")(page)) }),
  ...pair({ name: "review-G-0001-accept", route: "review/G-0001", after: async (page) => (await reviewReady(page), await press("Meta+Shift+Enter")(page)) }),
  ...pair({ name: "review-empty", route: "review/G-0002", enrich: emptyReview, ready: ".review .page-loading > .empty" }),

  // The contract editor, fresh (its placeholders) and with a look criterion carrying a step it refuses.
  ...pair({ name: "contract", route: "new" }),
  ...pair({
    name: "contract-look",
    route: "new",
    after: async (page) => {
      await page.getByRole("button", { name: /^(Look|外观)$/ }).first().click();
      const steps = page.locator(".look-steps");
      await steps.getByRole("button", { name: /^(Step|步骤)/ }).click();
      await page.keyboard.type("click #buy");
      await page.keyboard.press("Enter");
      await page.keyboard.type("drag #a #b");
      await steps.scrollIntoViewIfNeeded();
    },
  }),

  // Settings: the page, and the blocks with their own furniture.
  ...pair({ name: "settings", route: "settings" }),
  ...pair({ name: "settings-phone", route: "settings", element: ".settings-block:has(.phone-pair)" }),
  ...pair({ name: "settings-attention", route: "settings", element: ".settings-block:has(.push-test)" }),

  // The sheets: the shortcut table (on the board and in review) and the empty activity log.
  ...pair({ name: "shortcuts", route: "overview", after: press("Shift+Slash") }),
  { name: "shortcuts-review-zh-dark", route: "review/G-0003", lang: "zh-CN", theme: "dark", after: async (page) => (await reviewReady(page), await press("Shift+Slash")(page)) },
  ...pair({ name: "activity-empty", route: "overview", after: press("Meta+Shift+L") }),

  // Final full-window dark & light showcase screens for all core & new console surfaces.
  ...bothThemes({ name: "overview", route: "overview", enrich: enrichConsole }),
  ...bothThemes({
    name: "peek-drawer",
    route: "overview",
    enrich: enrichConsole,
    after: async (page) => {
      // Move past the 4 Needs-You decision lines onto the first Goal flight strip, then press Space to open Peek Drawer.
      for (let i = 0; i < 5; i++) {
        await page.keyboard.press("j");
        await page.waitForTimeout(60);
      }
      await page.keyboard.press("Space");
      await page.locator(".peek-drawer").waitFor();
    },
  }),
  // The palette over the board: an opaque sheet you read in (only toasts and the @ completion float).
  ...bothThemes({
    name: "palette",
    route: "overview",
    enrich: enrichConsole,
    after: async (page) => {
      await page.keyboard.press("Meta+k");
      await page.locator(".palette-item").first().waitFor();
    },
  }),
  ...bothThemes({ name: "goal-deck", route: "goal/G-0001", enrich: enrichConsole }),
  ...bothThemes({
    name: "review-theater",
    route: "review/G-0003",
    enrich: enrichConsole,
    after: async (page) => {
      await reviewReady(page);
      await page.locator(".code > span[style*='color']").first().waitFor({ timeout: 3000 }).catch(() => {});
    },
  }),
  ...bothThemes({ name: "learning", route: "learning", enrich: enrichConsole }),
  ...bothThemes({ name: "operations", route: "operations", enrich: enrichConsole }),
  ...bothThemes({ name: "contract", route: "new", enrich: enrichConsole }),
  { name: "learning-zh-dark", route: "learning", lang: "zh-CN", theme: "dark", enrich: enrichConsole },
  { name: "operations-zh-dark", route: "operations", lang: "zh-CN", theme: "dark", enrich: enrichConsole },
];

for (const s of screens) {
  test(`shot ${s.name}`, async ({ page }) => {
    test.skip(!!ONLY && !s.name.includes(ONLY), `SHOTS_ONLY=${ONLY}`);
    mkdirSync(OUT!, { recursive: true });
    await page.setViewportSize({ width: s.width ?? 1440, height: s.height ?? 900 });
    await page.emulateMedia({ colorScheme: s.theme ?? "dark", reducedMotion: "reduce" });
    await openTower(page, s.route, {
      lang: s.lang,
      theme: s.theme,
      enrich: (F) => {
        enrichRich(F);
        s.enrich?.(F);
      },
    });
    if (s.ready) await page.locator(s.ready).first().waitFor();
    await settled(page, s.ready ? undefined : s.route);
    await s.after?.(page);
    await settled(page);
    if (s.element) await page.locator(s.element).first().screenshot({ path: join(OUT!, `${s.name}.png`) });
    else await page.screenshot({ path: join(OUT!, `${s.name}.png`) });
  });
}
