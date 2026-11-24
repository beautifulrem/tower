// @ts-expect-error -- the app's tsconfig has no Node types; vitest runs on Node.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// Vitest runs from apps/desktop.
const boot = readFileSync("public/theme-boot.js", "utf8") as string;
const theme = readFileSync("src/lib/theme.ts", "utf8") as string;

describe("the first frame's theme", () => {
  it("is read from the same storage keys the app's theme module writes", () => {
    const keys = [...theme.matchAll(/^const (?:KEY|SIZE_KEY) = "([^"]+)";$/gm)].map((m: RegExpMatchArray) => m[1]);
    expect(keys).toEqual(["tower.theme", "tower.size"]);
    for (const k of keys) expect(boot).toContain(`"${k}"`);
  });

  it("applies the saved choice, and the system's for \"system\", as the app does", () => {
    const run = (theme: string | null, size: string | null) => {
      localStorage.clear();
      if (theme) localStorage.setItem("tower.theme", theme);
      if (size) localStorage.setItem("tower.size", size);
      new Function(boot)();
      return [document.documentElement.dataset.theme, document.documentElement.dataset.size];
    };
    expect(run("light", "large")).toEqual(["light", "large"]);
    expect(run("dark", "compact")).toEqual(["dark", "compact"]);
    // jsdom's matchMedia (test setup) says not light: the system is dark.
    expect(run(null, "huge")).toEqual(["dark", "standard"]);
  });
});
