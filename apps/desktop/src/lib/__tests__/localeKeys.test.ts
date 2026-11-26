import { transformWithOxc } from "vite";
import { describe, expect, it } from "vitest";

import { keysModuleSource, shapeOf, valuesOnly } from "../../../plugins/localeKeys";

const sources = import.meta.glob<string>("../locales/*.ts", { query: "?raw", import: "default", eager: true });
const js = async (file: string) => (await transformWithOxc(sources[`../locales/${file}`], file)).code;

/** Runs a module's code that exports one const (and imports nothing at run time), returning that const. */
function run(code: string, name: string, prelude = ""): Record<string, Record<string, unknown>> {
  return new Function(`${prelude}\n${code.replace(/^export const /gm, "const ")}\nreturn ${name};`)();
}

/** The key module as a prelude: its key list and the rebuild, under the names the values-only module imports. */
function keys(shape: ReturnType<typeof shapeOf>): string {
  const now = keysModuleSource("now", shape).replace(/^export const /gm, "const ");
  return `${now}\nconst __rebuild = rebuild, __shape = shape;`;
}

const HALVES = [
  ["zh-CN.ts", "en.ts", "zh", "en"],
  ["zh-CN.later.ts", "en.later.ts", "zhLater", "enLater"],
] as const;

describe("the dictionaries' shared keys (plugins/localeKeys.ts)", () => {
  for (const [zhFile, enFile, zhName, enName] of HALVES)
    it(`rebuild ${zhFile} and ${enFile} exactly as written: every key, every word, every function`, async () => {
      const shape = shapeOf(await js(zhFile));
      for (const [file, name] of [
        [zhFile, zhName],
        [enFile, enName],
      ] as const) {
        const code = await js(file);
        const written = run(code, name);
        const shipped = run(valuesOnly(code, shape, "virtual:locale-keys-x").replace(/^import .*\n/, ""), name, keys(shape));
        expect(Object.keys(shipped)).toEqual(Object.keys(written));
        for (const ns of Object.keys(written)) {
          expect(Object.keys(shipped[ns]).sort(), ns).toEqual(Object.keys(written[ns]).sort());
          for (const [k, v] of Object.entries(written[ns])) {
            const s = shipped[ns][k];
            if (typeof v === "function") expect(String(s), `${ns}.${k}`).toBe(String(v));
            else expect(s, `${ns}.${k}`).toBe(v);
          }
        }
      }
    });

  it("names the key when a dictionary's keys are not the list's, rather than shifting every value after it", async () => {
    const shape = shapeOf(await js("zh-CN.ts"));
    const code = await js("en.ts");
    const [ns, [first]] = shape[0];
    const missing = code.replace(new RegExp(`\\b${first}:`), "renamedKey:");
    expect(() => valuesOnly(missing, shape, "x")).toThrow(`missing key ${ns}.${first}`);
    const extra = shape.map(([n, k]): [string, string[]] => [n, n === ns ? k.slice(1) : k]);
    expect(() => valuesOnly(code, extra, "x")).toThrow(`extra key ${ns}.${first}`);
  });

  it("keeps the key list in one module per half: the second half re-uses the first's rebuild", () => {
    expect(keysModuleSource("later", [["a", ["b"]]])).toContain('export { rebuild } from "virtual:locale-keys-now"');
    expect(keysModuleSource("now", [["a", ["b"]]])).toContain("export const rebuild");
  });
});
