import { defineConfig, devices } from "@playwright/test";

// End-to-end tests of the interface in WebKit — the engine of the app's
// WKWebView — against views dumped from a real supervisor (see e2e/README).
// A second checkout (a worktree) runs on its own port with E2E_PORT, so it is
// never served another checkout's code by a dev server already on 1431.
const port = process.env.E2E_PORT ?? "1431";

export default defineConfig({
  testDir: "e2e",
  timeout: 30_000,
  fullyParallel: true,
  reporter: process.env.CI ? "list" : "line",
  use: { baseURL: `http://127.0.0.1:${port}`, viewport: { width: 1440, height: 900 } },
  projects: [{ name: "webkit", use: { ...devices["Desktop Safari"], viewport: { width: 1440, height: 900 } } }],
  webServer: {
    command: `./node_modules/.bin/vite --host 127.0.0.1 --port ${port} --strictPort`,
    url: `http://127.0.0.1:${port}`,
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
});
