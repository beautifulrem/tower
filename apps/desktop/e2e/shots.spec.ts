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

const screens: Screen[] = [
  // The board, the queue, the first run.
  ...pair({ name: "overview", route: "overview" }),
  { name: "overview-zh-dark-1100", route: "overview", lang: "zh-CN", theme: "dark", width: 1100 },
  { name: "overview-en-light-1800", route: "overview", lang: "en", theme: "light", width: 1800 },
  { name: "overview-en-light-j", route: "overview", lang: "en", theme: "light", after: press("j", "j") },
  ...pair({ name: "overview-empty", route: "overview", enrich: emptyBoard }),
  ...pair({ name: "inbox", route: "inbox" }),
  ...pair({ name: "welcome-red", route: "overview", enrich: firstRun }),
  { name: "welcome-clean-en-light", route: "overview", lang: "en", theme: "light", enrich: firstRunClean },

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
  ...pair({ name: "review-empty", route: "review/G-0002", enrich: emptyReview }),

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
  ...pair({ name: "shortcuts", route: "overview", after: press("?") }),
  { name: "shortcuts-review-zh-dark", route: "review/G-0003", lang: "zh-CN", theme: "dark", after: async (page) => (await reviewReady(page), await press("?")(page)) },
  ...pair({ name: "activity-empty", route: "overview", after: press("Meta+Shift+L") }),
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
    await page.waitForTimeout(700);
    await s.after?.(page);
    await settled(page);
    if (s.element) await page.locator(s.element).first().screenshot({ path: join(OUT!, `${s.name}.png`) });
    else await page.screenshot({ path: join(OUT!, `${s.name}.png`) });
  });
}
