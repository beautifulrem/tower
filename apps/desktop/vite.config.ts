import { readFileSync } from "node:fs";

import { defineConfig } from "vite";
import solid from "vite-plugin-solid";

import { localeKeys } from "./plugins/localeKeys.ts";

// Tauri expects a fixed port and no screen clearing so Rust errors stay visible.
export default defineConfig({
  plugins: [solid(), localeKeys((file) => readFileSync(file, "utf8"))],
  clearScreen: false,
  server: { port: 1420, strictPort: true, watch: { ignored: ["**/src-tauri/**"] } },
  envPrefix: ["VITE_", "TAURI_ENV_"],
  build: {
    target: "safari16",
    sourcemap: false,
    // Loaded from disk: the launch path is one chunk; views reached by an
    // action (review, settings, contract editor) load on first use.
    chunkSizeWarningLimit: 900,
    // Preloading from the page only: index.html links the start-up's chunks, fetched beside the entry. An on-demand
    // chunk no longer lists what it imports, to fetch alongside it (322 bytes): those are the start-up's chunks, loaded
    // already, or a chunk on-demand ones share (Honesty, a dictionary half's keys), read from disk after the chunk that
    // imports it. The polyfill went earlier: 238 bytes of the start-up for what WebKit does itself from Safari 17.
    // tools/bundle-budget.sh follows the entry's static imports to find the start-up.
    modulePreload: { polyfill: false, resolveDependencies: (_f, deps, { hostType }) => (hostType === "html" ? deps : []) },
  },
});
