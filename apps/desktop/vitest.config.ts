import { defineConfig } from "vitest/config";

// Unit tests cover the interface's pure logic (text, formats, word diff);
// they run in Node, without a DOM or the Tauri runtime.
export default defineConfig({
  test: { environment: "node", include: ["src/**/__tests__/*.test.ts"] },
});
