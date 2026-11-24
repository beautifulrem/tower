import { defineConfig, devices } from "@playwright/test";

// The frontend design reviewer's harness (.claude/agents/frontend-design-reviewer.md). Its scratch specs live next to
// this file and are not committed (see .gitignore); they drive the real Vite pages against views dumped from a real
// supervisor, through the same stand-in for Tauri as the end-to-end tests (e2e/tauri.ts). Kept apart from
// playwright.config.ts so the normal end-to-end run never picks up a review's scratch spec, and so a machine without
// WebKit (a Linux container) can still render the interface in Chromium:
//
//   E2E_FIXTURES=<dumped views> REVIEW_OUT=<dir> playwright test -c design-review --project=webkit [files…]
//   E2E_FIXTURES=<dumped views> SHOTS=<dir> playwright test -c design-review --project=webkit e2e/shots.spec.ts
//
// WebKit is the engine of the app's WKWebView; Chromium is the fallback and a review made in it says so. Where this
// Playwright's own Chromium is not downloaded but another build is on the machine, REVIEW_CHROMIUM names its binary.
const port = process.env.REVIEW_PORT ?? "1432";
const viewport = { width: 1440, height: 900 };

export default defineConfig({
  testDir: "..",
  testMatch: ["design-review/**/*.spec.ts", "e2e/shots.spec.ts"],
  timeout: 120_000,
  expect: { timeout: 10_000 },
  reporter: "line",
  use: { baseURL: `http://127.0.0.1:${port}`, viewport },
  projects: [
    { name: "webkit", use: { ...devices["Desktop Safari"], viewport } },
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
        viewport,
        launchOptions: process.env.REVIEW_CHROMIUM ? { executablePath: process.env.REVIEW_CHROMIUM } : {},
      },
    },
  ],
  webServer: {
    command: `./node_modules/.bin/vite --host 127.0.0.1 --port ${port} --strictPort`,
    cwd: "..",
    url: `http://127.0.0.1:${port}`,
    reuseExistingServer: true,
    timeout: 60_000,
  },
});
