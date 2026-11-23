// @ts-expect-error -- the app's tsconfig has no Node types; vitest runs on Node.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// Vitest runs from apps/desktop.
const tokens = readFileSync("src/styles/tokens.css", "utf8") as string;

/** sRGB relative luminance of an `oklch(L C H)` token (gamut-clipped, as a browser paints it). */
function luminance(L: number, C: number, H: number): number {
  const h = (H * Math.PI) / 180;
  const a = C * Math.cos(h);
  const b = C * Math.sin(h);
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
  const lin = [4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s, -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s, -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s];
  const [r, g, bl] = lin.map((v) => Math.min(1, Math.max(0, v)));
  return 0.2126 * r + 0.7152 * g + 0.0722 * bl;
}

function theme(name: "dark" | "light"): (v: string) => number {
  const start = tokens.indexOf(`:root[data-theme="${name}"]`);
  const block = tokens.slice(start, tokens.indexOf("\n}", start));
  return (v) => {
    const m = block.match(new RegExp(`${v}:\\s*oklch\\(([\\d.]+) ([\\d.]+) ([\\d.]+)\\)`));
    if (!m) throw new Error(`${name} ${v} is not an opaque oklch() token`);
    return luminance(Number(m[1]), Number(m[2]), Number(m[3]));
  };
}
const ratio = (x: number, y: number) => (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);

/**
 * The ink ladder: text-1…4 are four steps you can tell apart, and the quietest still reads on the darkest surface it
 * meets (the selected row). Light text-3 and text-4 had drifted to 1.07:1 apart — one ink under two names.
 */
describe("ink ladder", () => {
  for (const name of ["dark", "light"] as const) {
    it(`${name}: each ink is a step from the next, and text-4 holds 4.5:1 on the selected row`, () => {
      const lum = theme(name);
      const inks = ["--text-1", "--text-2", "--text-3", "--text-4"].map(lum);
      for (let i = 0; i + 1 < inks.length; i++) expect(ratio(inks[i], inks[i + 1]), `text-${i + 1} → text-${i + 2}`).toBeGreaterThanOrEqual(1.15);
      expect(ratio(lum("--text-4"), lum("--bg-selected"))).toBeGreaterThanOrEqual(4.5);
    });
  }
});
