import { describe, expect, it, vi } from "vitest";

vi.mock("../store", () => ({ state: { settings: { language: "en" } } }));

const { en } = await import("../locales/en");
const { zh } = await import("../locales/zh-CN");
const { enLater } = await import("../locales/en.later");
const { zhLater } = await import("../locales/zh-CN.later");
const { t, registerDict } = await import("../i18n");
registerDict("en", en);
registerDict("zh-CN", zh);
registerDict("en", enLater);
registerDict("zh-CN", zhLater);

/** Every source file of the interface, as text, keyed by its path from `src/` (the glob names `lib/` files from here, `../x.ts`). */
const sources = Object.fromEntries(
  Object.entries(import.meta.glob<string>(["../../**/*.ts", "../../**/*.tsx", "!../../**/__tests__/**", "!../../gen/**"], { query: "?raw", import: "default", eager: true })).map(([k, v]) => [
    k.startsWith("../../") ? k.slice(6) : `lib/${k.slice(3)}`,
    v,
  ]),
);

type Tree = { [k: string]: string | ((p: never) => string) | Tree };

function leaves(tree: Tree, prefix = ""): [string, unknown][] {
  return Object.entries(tree).flatMap(([k, v]) =>
    typeof v === "object" ? leaves(v as Tree, `${prefix}${k}.`) : [[`${prefix}${k}`, v] as [string, unknown]],
  );
}

const placeholders = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();

/** `spec` imported from the file at `from` (paths from `src/`), as a key of `sources`. */
function resolveImport(from: string, spec: string): string | undefined {
  const parts = from.split("/").slice(0, -1);
  for (const p of spec.split("/")) {
    if (p === "..") parts.pop();
    else if (p !== ".") parts.push(p);
  }
  const base = parts.join("/");
  return [base, `${base}.ts`, `${base}.tsx`].find((f) => f in sources);
}

describe("interface text", () => {
  const halves = {
    now: { zh: new Map(leaves(zh as unknown as Tree)), en: new Map(leaves(en as unknown as Tree)) },
    later: { zh: new Map(leaves(zhLater as unknown as Tree)), en: new Map(leaves(enLater as unknown as Tree)) },
  };

  it("has the same keys in both languages, half by half, and no key in both halves", () => {
    for (const h of Object.values(halves)) expect([...h.zh.keys()].sort()).toEqual([...h.en.keys()].sort());
    expect([...halves.now.zh.keys()].filter((k) => halves.later.zh.has(k))).toEqual([]);
  });

  it("uses the same placeholders in both languages, and no empty text", () => {
    for (const h of Object.values(halves))
      for (const [key, z] of h.zh) {
        const e = h.en.get(key);
        if (typeof z !== "string" || typeof e !== "string") continue;
        expect(z.trim(), key).not.toBe("");
        expect(e.trim(), key).not.toBe("");
        expect(placeholders(z), key).toEqual(placeholders(e));
      }
  });

  it("fills placeholders, and reads both halves of a namespace once both are in", () => {
    expect(t("format.minutesAgo", { n: 3 })).toMatch(/3/);
    expect(t("settings.gaugeReady")).not.toBe("settings.gaugeReady");
    expect(t("settings.environment")).not.toBe("settings.environment");
  });

  // The first paint has only the first half: a module the start-up bundle carries (what main.tsx reaches by static
  // imports) may name only words from it, and a key it builds at run time (`state.${s}`) only from a namespace
  // with nothing in the second half. On-demand views load through `withLater`, which brings the second half first.
  it("start-up modules say only what the first half holds", () => {
    const seen = new Set<string>();
    const visit = (f: string) => {
      if (seen.has(f)) return;
      seen.add(f);
      for (const m of sources[f].matchAll(/^(?:import|export)\s+(?!type\b)[^;]*?from\s+"(\.[^"]+)"/gms)) {
        const next = resolveImport(f, m[1]);
        if (next) visit(next);
      }
    };
    visit("main.tsx");
    const modules = [...seen].filter((f) => !f.includes("/locales/"));
    // The walk reaches the views the first paint draws, and not the ones loaded on demand.
    expect(modules).toEqual(expect.arrayContaining(["views/Overview.tsx", "views/Inbox.tsx", "components/DecisionCard.tsx", "lib/i18n.ts"]));
    expect(modules).not.toContain("views/Review.tsx");
    expect(modules).not.toContain("views/Settings.tsx");
    const later = halves.later.zh;
    const laterNamespaces = new Set([...later.keys()].map((k) => k.split(".")[0]));
    const wrong: string[] = [];
    for (const f of modules) {
      for (const m of sources[f].matchAll(/["'`]([a-zA-Z]+\.[a-zA-Z]+)["'`]/g)) if (later.has(m[1])) wrong.push(`${f}: ${m[1]}`);
      for (const m of sources[f].matchAll(/\bt\(`([a-zA-Z]+)\.\$\{/g)) if (laterNamespaces.has(m[1])) wrong.push(`${f}: ${m[1]}.\${…}`);
    }
    expect(wrong).toEqual([]);
  });
});
