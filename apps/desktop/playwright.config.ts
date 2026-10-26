import { defineConfig, devices } from "@playwright/test";

// End-to-end tests of the interface in WebKit — the engine of the app's
// WKWebView — against views dumped from a real supervisor (see e2e/README).
export default defineConfig({
  testDir: "e2e",
  timeout: 30_000,
  fullyParallel: true,
  reporter: process.env.CI ? "list" : "line",
  use: { baseURL: "http://127.0.0.1:1431", viewport: { width: 1440, height: 900 } },
  projects: [{ name: "webkit", use: { ...devices["Desktop Safari"], viewport: { width: 1440, height: 900 } } }],
  webServer: {
    command: "./node_modules/.bin/vite --host 127.0.0.1 --port 1431 --strictPort",
    url: "http://127.0.0.1:1431",
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
});
