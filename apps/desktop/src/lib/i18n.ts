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
 */
import { createEffect, createRoot, createSignal } from "solid-js";

import type { Dict } from "./locales/zh-CN";
import { state } from "./store";

export type { Dict };
export type Locale = "zh-CN" | "en";

const [dicts, setDicts] = createSignal<Partial<Record<Locale, Dict>>>({});

/** Makes a dictionary available to `t` (the loaders below, and tests that need both at once). */
export function registerDict(l: Locale, d: Dict) {
  setDicts((cur) => ({ ...cur, [l]: d }));
}

const loaders: Record<Locale, () => Promise<Dict>> = {
  en: () => import("./locales/en").then((m) => m.en),
  "zh-CN": () => import("./locales/zh-CN").then((m) => m.zh),
};
const pending = new Map<Locale, Promise<void>>();

/** Loads a dictionary once; resolves when `t` can answer in that language. */
export function ensureLocale(l: Locale): Promise<void> {
  if (dicts()[l]) return Promise.resolve();
  let p = pending.get(l);
  if (!p) {
    p = loaders[l]().then((d) => registerDict(l, d));
    pending.set(l, p);
  }
  return p;
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

/** The dictionary `t` reads: the interface language's, else whichever has arrived (for the frames before a switch completes). */
function dict(): Dict | undefined {
  const d = dicts();
  return d[locale()] ?? d.en ?? d["zh-CN"];
}

export function t<K extends Key>(key: K, ...args: Args<At<Dict, K>>): string {
  let v: unknown = dict();
  for (const part of key.split(".")) v = (v as Record<string, unknown> | undefined)?.[part];
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
  });
}
