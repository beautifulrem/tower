/**
 * The dictionaries ship their keys once.
 *
 * Each language is written as a readable object (`src/lib/locales/*.ts`), and
 * both languages have exactly the same keys in the same order (the compiler
 * and a test check it). So every dictionary chunk carried the same ~1,100 keys
 * again: about 5 KB of the interface's gzipped JavaScript, paid twice.
 *
 * This plugin turns each dictionary module into its values alone, in the order
 * of the key list of its half (taken from the Chinese source, the source of
 * truth for keys), and one small module per half holds that list and rebuilds
 * the same object from the values. It runs in dev, in the unit tests and in the
 * build, so what is tested is what ships. A dictionary whose keys differ from
 * the list fails the build with the key named, rather than shifting values.
 *
 * Node's file reading is passed in by the configs (`vite.config.ts`,
 * `vitest.config.ts`), so this module needs no Node types and its functions are
 * checked and tested with the interface's own (`src/lib/__tests__`).
 */
import { type Plugin, parseAst, transformWithOxc } from "vite";

type Half = "now" | "later";
/** Namespaces in order, each with its keys in order. */
export type Shape = [string, string[]][];

const DICT = /[\\/]src[\\/]lib[\\/]locales[\\/](en|zh-CN)(\.later)?\.ts$/;
// The resolved id names the chunk (_locale-keys-now-*.js): tools/bundle-budget.sh counts the first half's with the start-up.
const VIRTUAL = "virtual:locale-keys-";
const RESOLVED = "\0locale-keys-";

interface Node {
  type: string;
  start: number;
  end: number;
  [k: string]: unknown;
}
interface Prop extends Node {
  key: { name?: string; value?: string };
  value: Node & { properties?: Prop[] };
}

const nameOf = (p: Prop) => String(p.key.name ?? p.key.value);

/** The dictionary object of a module: its one exported `const` with an object of namespaces. */
function dictObject(code: string): Node & { properties: Prop[] } {
  const ast = parseAst(code) as unknown as { body: Node[] };
  for (const n of ast.body) {
    const decl = n.type === "ExportNamedDeclaration" ? (n.declaration as Node | null) : null;
    const init = decl?.type === "VariableDeclaration" ? ((decl.declarations as Node[])[0]?.init as Node | undefined) : undefined;
    if (init?.type === "ObjectExpression") return init as Node & { properties: Prop[] };
  }
  throw new Error("a dictionary module exports one const object of namespaces");
}

/** The key list of a dictionary module's (JavaScript) source. */
export function shapeOf(code: string): Shape {
  return dictObject(code).properties.map((ns) => {
    if (ns.type !== "Property" || ns.value.type !== "ObjectExpression") throw new Error(`namespace ${nameOf(ns)} is not an object of words`);
    return [nameOf(ns), ns.value.properties!.map(nameOf)];
  });
}

/**
 * A dictionary module's source with its object replaced by its values in the shape's order, rebuilt by `rebuild`
 * (imported from the half's key module). Throws, naming the key, when the module's keys are not exactly the shape's.
 */
export function valuesOnly(code: string, shape: Shape, keysModule: string): string {
  const obj = dictObject(code);
  const have = new Map<string, Map<string, Prop>>();
  for (const ns of obj.properties) {
    if (ns.type !== "Property" || ns.value.type !== "ObjectExpression") throw new Error(`namespace ${nameOf(ns)} is not an object of words`);
    have.set(nameOf(ns), new Map(ns.value.properties!.map((p) => [nameOf(p), p])));
  }
  const values: string[] = [];
  const want = new Set<string>();
  for (const [ns, keys] of shape) {
    for (const k of keys) {
      want.add(`${ns}.${k}`);
      const p = have.get(ns)?.get(k);
      if (!p) throw new Error(`missing key ${ns}.${k}`);
      if (p.type !== "Property" || p.computed || p.kind !== "init") throw new Error(`${ns}.${k} is not a plain value`);
      values.push(code.slice(p.value.start, p.value.end));
    }
  }
  for (const [ns, keys] of have) for (const k of keys.keys()) if (!want.has(`${ns}.${k}`)) throw new Error(`extra key ${ns}.${k}`);
  return `import { rebuild as __rebuild, shape as __shape } from ${JSON.stringify(keysModule)};\n${code.slice(0, obj.start)}__rebuild(__shape, [${values.join(",\n")}])${code.slice(obj.end)}`;
}

/** The key module of a half: its key list, and (in the first half, re-exported by the second) the rebuild. */
export function keysModuleSource(half: Half, shape: Shape): string {
  const rebuild =
    half === "now"
      ? "export const rebuild = (s, v) => { let i = 0; return Object.fromEntries(s.map(([n, k]) => [n, Object.fromEntries(k.map((x) => [x, v[i++]]))])); };"
      : `export { rebuild } from ${JSON.stringify(`${VIRTUAL}now`)};`;
  return `export const shape = ${JSON.stringify(shape)};\n${rebuild}\n`;
}

/** `read`: a file's text (Node's `readFileSync(file, "utf8")`). */
export function localeKeys(read: (file: string) => string): Plugin {
  let root = "";
  const shapes = new Map<Half, Shape>();
  const source = (half: Half) => `${root}/src/lib/locales/${half === "now" ? "zh-CN.ts" : "zh-CN.later.ts"}`;
  const shape = async (half: Half) => {
    let s = shapes.get(half);
    if (!s) {
      const file = source(half);
      s = shapeOf((await transformWithOxc(read(file), file)).code);
      shapes.set(half, s);
    }
    return s;
  };
  return {
    name: "tower-locale-keys",
    // After TypeScript is stripped: the dictionaries are plain JavaScript objects by then.
    enforce: "post",
    configResolved(c) {
      root = c.root;
    },
    resolveId(id) {
      return id.startsWith(VIRTUAL) ? RESOLVED + id.slice(VIRTUAL.length) : undefined;
    },
    async load(id) {
      if (!id.startsWith(RESOLVED)) return undefined;
      const half = id.slice(RESOLVED.length) as Half;
      this.addWatchFile(source(half));
      return keysModuleSource(half, await shape(half));
    },
    async transform(code, id) {
      // The module itself only: a `?raw` read of the source (the i18n test's) stays the source.
      const m = DICT.exec(id);
      if (!m) return undefined;
      const half: Half = m[2] ? "later" : "now";
      this.addWatchFile(source(half));
      return { code: valuesOnly(code, await shape(half), `${VIRTUAL}${half}`), map: null };
    },
    watchChange(id) {
      if (DICT.test(id)) shapes.clear();
    },
    handleHotUpdate({ file, server }) {
      if (!DICT.test(file)) return undefined;
      // A key added or moved changes every dictionary of its half and the key list: all of them are made again.
      shapes.clear();
      for (const mod of server.moduleGraph.idToModuleMap.values()) if (mod.id && (DICT.test(mod.id) || mod.id.startsWith(RESOLVED))) server.moduleGraph.invalidateModule(mod);
      server.ws.send({ type: "full-reload" });
      return [];
    },
  };
}
