/**
 * The preview harness: renders the real Vite pages in WebKit against the
 * dumped views, enriched with the states the demo does not reach, and writes
 * one PNG per screen. Off unless SHOTS points at a directory, so the normal
 * run never pays for it:
 *
 *   SHOTS=/tmp/shots tools/e2e.sh e2e/shots.spec.ts
 *
 * `tools/screenshot.sh` (the real window) is still the source for
 * assets/screenshots when the screen is unlocked; this is the fallback.
 */
import { mkdirSync } from "node:fs";
import { join } from "node:path";

import { test } from "@playwright/test";

import { enrichRich } from "./rich";
import { openTower } from "./tauri";

const OUT = process.env.SHOTS;
test.skip(!OUT, "set SHOTS=<dir> to render the preview screens");

const screens: Array<{
  name: string;
  route: string;
  width?: number;
  lang?: "en" | "zh-CN";
  theme?: "light" | "dark";
  /** A selector to capture instead of the viewport (a block inside a scrolling view). */
  element?: string;
  after?: (page: import("@playwright/test").Page) => Promise<void>;
}> = [
  { name: "overview-zh-dark", route: "overview", lang: "zh-CN", theme: "dark" },
  { name: "overview-en-light", route: "overview", lang: "en", theme: "light" },
  { name: "overview-zh-dark-1100", route: "overview", lang: "zh-CN", theme: "dark", width: 1100 },
  { name: "inbox-zh-dark", route: "inbox", lang: "zh-CN", theme: "dark" },
  { name: "inbox-en-light", route: "inbox", lang: "en", theme: "light" },
  { name: "goal-G-0002-en-light", route: "goal/G-0002", lang: "en", theme: "light" },
  { name: "goal-G-0004-zh-dark", route: "goal/G-0004", lang: "zh-CN", theme: "dark" },
  { name: "goal-G-0001-zh-dark", route: "goal/G-0001", lang: "zh-CN", theme: "dark" },
  { name: "goal-G-0001-en-light", route: "goal/G-0001", lang: "en", theme: "light" },
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
  { name: "review-G-0003-zh-dark", route: "review/G-0003", lang: "zh-CN", theme: "dark" },
  { name: "review-G-0003-en-light", route: "review/G-0003", lang: "en", theme: "light" },
  { name: "settings-zh-dark", route: "settings", lang: "zh-CN", theme: "dark" },
  { name: "settings-en-light", route: "settings", lang: "en", theme: "light" },
  { name: "settings-phone-zh-dark", route: "settings", lang: "zh-CN", theme: "dark", element: ".settings-block:has(.phone-pair)" },
  { name: "settings-phone-en-light", route: "settings", lang: "en", theme: "light", element: ".settings-block:has(.phone-pair)" },
  { name: "settings-attention-zh-dark", route: "settings", lang: "zh-CN", theme: "dark", element: ".settings-block:has(.push-test)" },
  { name: "settings-attention-en-light", route: "settings", lang: "en", theme: "light", element: ".settings-block:has(.push-test)" },
  { name: "heldout-card-zh-dark", route: "goal/G-0004", lang: "zh-CN", theme: "dark", element: ".decision-heldout" },
  { name: "heldout-card-en-light", route: "goal/G-0004", lang: "en", theme: "light", element: ".decision-heldout" },
  { name: "contract-en-light", route: "new", lang: "en", theme: "light" },
  { name: "contract-zh-dark", route: "new", lang: "zh-CN", theme: "dark" },
];

for (const s of screens) {
  test(`shot ${s.name}`, async ({ page }) => {
    mkdirSync(OUT!, { recursive: true });
    await page.setViewportSize({ width: s.width ?? 1440, height: 900 });
    await page.emulateMedia({ colorScheme: s.theme ?? "dark", reducedMotion: "reduce" });
    await openTower(page, s.route, { lang: s.lang, theme: s.theme, enrich: enrichRich });
    await page.waitForTimeout(700);
    await s.after?.(page);
    await page.waitForTimeout(300);
    if (s.element) await page.locator(s.element).first().screenshot({ path: join(OUT!, `${s.name}.png`) });
    else await page.screenshot({ path: join(OUT!, `${s.name}.png`) });
  });
}
