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
  },
});
