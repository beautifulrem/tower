import { describe, expect, it, vi } from "vitest";

vi.mock("../store", () => ({ state: { settings: { language: "en" } } }));

const { dicts, t } = await import("../i18n");

type Tree = { [k: string]: string | ((p: never) => string) | Tree };

function leaves(tree: Tree, prefix = ""): [string, unknown][] {
  return Object.entries(tree).flatMap(([k, v]) =>
    typeof v === "object" ? leaves(v as Tree, `${prefix}${k}.`) : [[`${prefix}${k}`, v] as [string, unknown]],
  );
}

const placeholders = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();

describe("interface text", () => {
  const zh = new Map(leaves(dicts["zh-CN"] as unknown as Tree));
  const en = new Map(leaves(dicts.en as unknown as Tree));

  it("has the same keys in both languages", () => {
    expect([...zh.keys()].sort()).toEqual([...en.keys()].sort());
  });

  it("uses the same placeholders in both languages, and no empty text", () => {
    for (const [key, z] of zh) {
      const e = en.get(key);
      if (typeof z !== "string" || typeof e !== "string") continue;
      expect(z.trim(), key).not.toBe("");
      expect(e.trim(), key).not.toBe("");
      expect(placeholders(z), key).toEqual(placeholders(e));
    }
  });

  it("fills placeholders", () => {
    expect(t("format.minutesAgo", { n: 3 })).toMatch(/3/);
  });
});
