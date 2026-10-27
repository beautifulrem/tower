/**
 * Interface language. The locale follows `Settings.language` (the same
 * setting decides what the agent writes to you), so changing it re-renders
 * every string reactively.
 *
 * The words live in `locales/zh-CN.ts` (the source of truth for keys) and
 * `locales/en.ts` (which must have exactly the same shape; the compiler
 * rejects a missing or extra key). Values are strings with `{name}`
 * placeholders, or functions when the wording depends on a number.
 *
 * Only the language in use is loaded: each dictionary is a chunk of its
 * own, fetched before the first paint (the system's language) and again
 * when the setting names the other one; the start-up bundle never carries
 * both. `t` is reactive on the dictionaries too, so the moment one arrives
 * every string reads in it.
 *
 * Each language comes in two halves. The first holds what the first paint
 * can say (the board, the queue, the desk's cards); the second
 * (`*.later.ts`) what only the on-demand views say — the goal page, review,
 * settings, the contract editor, the trace, the palette, the welcome page.
 * The second is fetched once the first frame is up, and every on-demand
 * view waits for it (`withLater`), so no view ever shows a key. A test keeps
 * start-up modules off the second half, and the first half free of words no
 * start-up module says (they would only make the first paint wait).
 */
import { createEffect, createRoot, createSignal } from "solid-js";

import type { Dict, DictNow } from "./locales/zh-CN";
import type { DictLater } from "./locales/zh-CN.later";
import { state } from "./store";

export type { Dict };
export type Locale = "zh-CN" | "en";
type Half = "now" | "later";

const [dicts, setDicts] = createSignal<Partial<Record<Locale, Dict>>>({});

/** Makes words available to `t`, merged by namespace into what that language already has (the loaders below, and tests). */
export function registerDict(l: Locale, d: Partial<DictNow> | Partial<DictLater> | Dict) {
  setDicts((cur) => {
    const have = (cur[l] ?? {}) as Record<string, object>;
    const next: Record<string, object> = { ...have };
    for (const [ns, words] of Object.entries(d)) next[ns] = { ...(have[ns] ?? {}), ...words };
    return { ...cur, [l]: next as Dict };
  });
}

const loaders: Record<Locale, Record<Half, () => Promise<Partial<DictNow> | Partial<DictLater>>>> = {
  en: { now: () => import("./locales/en").then((m) => m.en), later: () => import("./locales/en.later").then((m) => m.enLater) },
  "zh-CN": { now: () => import("./locales/zh-CN").then((m) => m.zh), later: () => import("./locales/zh-CN.later").then((m) => m.zhLater) },
};
const pending = new Map<string, Promise<void>>();
const done = new Set<string>();

function ensure(l: Locale, half: Half): Promise<void> {
  const k = `${l}:${half}`;
  if (done.has(k)) return Promise.resolve();
  let p = pending.get(k);
  if (!p) {
    p = loaders[l][half]().then((d) => {
      registerDict(l, d);
      done.add(k);
    });
    pending.set(k, p);
  }
  return p;
}

/** Loads a language's first half once; resolves when `t` can answer the first paint in that language. */
export function ensureLocale(l: Locale): Promise<void> {
  return ensure(l, "now");
}

// Once anything asked for the second half, a change of language fetches the new language's second half too.
const [laterWanted, setLaterWanted] = createSignal(false);

/** Loads the interface language's second half once: what the on-demand views say. */
export function ensureLater(): Promise<void> {
  setLaterWanted(true);
  return ensure(locale(), "later");
}

/** An on-demand view's loader that also waits for the words it says: for `lazy(withLater(() => import(…)))`. */
export function withLater<T>(load: () => Promise<T>): () => Promise<T> {
  return () => Promise.all([load(), ensureLater()]).then(([m]) => m);
}

// ---- keys and lookup ---------------------------------------------------------

type Fn = (p: never) => string;

/** Every leaf of the dictionary as a dotted path, e.g. `"goal.runN"`. */
type Leaves<T, P extends string = ""> = {
  [K in keyof T & string]: T[K] extends string | Fn ? `${P}${K}` : Leaves<T[K], `${P}${K}.`>;
}[keyof T & string];

export type Key = Leaves<Dict>;

type At<T, K extends string> = K extends `${infer H}.${infer R}`
  ? H extends keyof T
    ? At<T[H], R>
    : never
  : K extends keyof T
    ? T[K]
    : never;

type Params = Record<string, string | number>;
/** Function entries require their typed parameters; strings take optional `{name}` values. */
type Args<V> = V extends (p: infer P) => string ? [params: P] : [params?: Params];

/** The interface language: the setting once loaded, else the system's. */
export const systemLocale: Locale = (navigator.language ?? "").toLowerCase().startsWith("zh") ? "zh-CN" : "en";

export function localeOf(language: string | null | undefined): Locale {
  return language ? (language.toLowerCase().startsWith("zh") ? "zh-CN" : "en") : systemLocale;
}

/** Reactive: reads `state.settings`, so callers re-run when the language changes. */
export function locale(): Locale {
  return localeOf(state.settings?.language);
}

/** The dictionaries `t` reads, in order: the interface language's, then whichever else has arrived (for the frames before a switch completes). */
function dictsInOrder(): Dict[] {
  const d = dicts();
  return [d[locale()], d.en, d["zh-CN"]].filter((x, i, all): x is Dict => !!x && all.indexOf(x) === i);
}

function lookup(dict: Dict, key: string): unknown {
  let v: unknown = dict;
  for (const part of key.split(".")) v = (v as Record<string, unknown> | undefined)?.[part];
  return v;
}

export function t<K extends Key>(key: K, ...args: Args<At<Dict, K>>): string {
  let v: unknown;
  for (const d of dictsInOrder()) if ((v = lookup(d, key)) !== undefined) break;
  const params = args[0] as Params | undefined;
  if (typeof v === "function") return (v as (p: unknown) => string)(params ?? {});
  if (typeof v !== "string") return key;
  return params ? v.replace(/\{(\w+)\}/g, (m, name: string) => (name in params ? String(params[name]) : m)) : v;
}

/** Keeps `<html lang>` on the locale so CJK line breaking and fonts behave, and fetches the dictionary the locale names. */
export function syncDocumentLang() {
  document.documentElement.lang = locale();
  createRoot(() => {
    createEffect(() => (document.documentElement.lang = locale()));
    createEffect(() => void ensureLocale(locale()));
    createEffect(() => laterWanted() && void ensure(locale(), "later"));
  });
}
