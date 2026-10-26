import solid from "vite-plugin-solid";
import { defineConfig } from "vitest/config";

// Pure-logic tests (`*.test.ts`) cover formats, matching and text; component
// tests (`*.test.tsx`) render Solid components in jsdom with a stubbed Tauri
// bridge. Neither touches the real supervisor.
export default defineConfig({
  plugins: [solid()],
  resolve: { conditions: ["development", "browser"] },
  test: {
    environment: "jsdom",
    include: ["src/**/__tests__/*.test.ts", "src/**/__tests__/*.test.tsx"],
    setupFiles: ["src/test/setup.ts"],
  },
});
