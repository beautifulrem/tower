// @ts-expect-error -- the app's tsconfig has no Node types; vitest runs on Node.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// Vitest runs from apps/desktop.
const css = readFileSync("src/styles/app.css", "utf8") as string;
const tokens = readFileSync("src/styles/tokens.css", "utf8") as string;

/**
 * jsdom does not evaluate media queries, so the one cascade that bit us is
 * guarded by reading the stylesheet: the ≤1280px rail fold must come after
 * the rail's base rule and outrank it, or `display: flex` wins and the rail
 * never folds (design audit r3 §2.1).
 */
describe("app.css cascade", () => {
  it("folds the goal rail with a rule that follows and outranks the base rule", () => {
    const base = css.indexOf("\n.rail {");
    const fold = css.indexOf(".goal-rail .rail {");
    expect(base).toBeGreaterThan(0);
    expect(fold).toBeGreaterThan(base);
    const block = css.slice(fold, css.indexOf("}", fold));
    expect(block).toMatch(/display:\s*grid/);
    // No later unscoped `.rail {` rule sets display again.
    expect(css.slice(fold).match(/\n\.rail \{[^}]*display:/)).toBeNull();
  });

  it("spaces an icon from its button's words without a typed space", () => {
    expect(css).toMatch(/\.btn-label \{[^}]*display:\s*inline-flex[^}]*gap:\s*5px/);
  });

  it("gives the light theme's diff rows enough tint", () => {
    const light = tokens.slice(tokens.indexOf('[data-theme="light"]'));
    expect(light).toMatch(/--diff-add-bg: oklch\([^)]*\/ 0\.13\)/);
    expect(light).toMatch(/--diff-del-bg: oklch\([^)]*\/ 0\.11\)/);
  });
});
