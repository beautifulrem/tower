// @ts-expect-error -- the app's tsconfig has no Node types; vitest runs on Node.
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { describe, expect, it } from "vitest";

// Vitest runs from apps/desktop. Static imports only: a dynamic import() is a chunk boundary, not a cycle.
const files: string[] = [];
const walk = (dir: string) => {
  for (const name of readdirSync(dir) as string[]) {
    const p = `${dir}/${name}`;
    if (statSync(p).isDirectory()) name !== "__tests__" && name !== "test" && walk(p);
    else if (/\.tsx?$/.test(name)) files.push(p);
  }
};
walk("src");

const resolve = (from: string, spec: string): string | null => {
  if (!spec.startsWith(".")) return null;
  const parts = from.split("/").slice(0, -1);
  for (const s of spec.split("/")) s === ".." ? parts.pop() : s !== "." && parts.push(s);
  const base = parts.join("/");
  return [`${base}.ts`, `${base}.tsx`, `${base}/index.ts`].find((f) => existsSync(f)) ?? null;
};
const graph = new Map(
  files.map((f) => {
    const src = readFileSync(f, "utf8") as string;
    const specs = [...src.matchAll(/^(?:import|export)\s+(?!type\b)[^;]*?from\s+"([^"]+)"/gms)].map((m: RegExpMatchArray) => m[1]);
    return [f, specs.map((s) => resolve(f, s)).filter((x): x is string => !!x)];
  }),
);

/** Whether `to` reaches `from` again through static imports. */
const reaches = (from: string, to: string, seen = new Set<string>()): boolean => {
  if (to === from) return true;
  if (seen.has(to)) return false;
  seen.add(to);
  return (graph.get(to) ?? []).some((n) => reaches(from, n, seen));
};

describe("module structure", () => {
  it("has no shared component that reaches into a view", () => {
    const into = [...graph].flatMap(([f, deps]) => (f.startsWith("src/components/") ? deps.filter((d) => d.startsWith("src/views/")).map((d) => `${f} → ${d}`) : []));
    expect(into).toEqual([]);
  });

  it("has no import cycle through the console views", () => {
    const cyclic = ["src/views/Learning.tsx", "src/views/Operations.tsx", "src/components/PeekDrawer.tsx"].filter((f) => (graph.get(f) ?? []).some((d) => reaches(f, d)));
    expect(cyclic).toEqual([]);
  });
});
