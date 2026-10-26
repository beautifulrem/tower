/**
 * Interface language. The locale follows `Settings.language` (the same
 * setting decides what the agent writes to you), so changing it re-renders
 * every string reactively.
 *
 * The words live in `locales/zh-CN.ts` (the source of truth for keys) and
 * `locales/en.ts` (which must have exactly the same shape; the compiler
 * rejects a missing or extra key). Values are strings with `{name}`
 * placeholders, or functions when the wording depends on a number.
 */
import { createEffect, createRoot } from "solid-js";

import { en } from "./locales/en";
import { type Dict, zh } from "./locales/zh-CN";
import { state } from "./store";

export type { Dict };
export type Locale = "zh-CN" | "en";

export const dicts: Record<Locale, Dict> = { "zh-CN": zh, en };

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
const systemLocale: Locale = (navigator.language ?? "").toLowerCase().startsWith("zh") ? "zh-CN" : "en";

export function localeOf(language: string | null | undefined): Locale {
  return language ? (language.toLowerCase().startsWith("zh") ? "zh-CN" : "en") : systemLocale;
}

/** Reactive: reads `state.settings`, so callers re-run when the language changes. */
export function locale(): Locale {
  return localeOf(state.settings?.language);
}

export function t<K extends Key>(key: K, ...args: Args<At<Dict, K>>): string {
  let v: unknown = dicts[locale()];
  for (const part of key.split(".")) v = (v as Record<string, unknown> | undefined)?.[part];
  const params = args[0] as Params | undefined;
  if (typeof v === "function") return (v as (p: unknown) => string)(params ?? {});
  if (typeof v !== "string") return key;
  return params ? v.replace(/\{(\w+)\}/g, (m, name: string) => (name in params ? String(params[name]) : m)) : v;
}

/** Keeps `<html lang>` on the locale so CJK line breaking and fonts behave. */
export function syncDocumentLang() {
  document.documentElement.lang = locale();
  createRoot(() => createEffect(() => (document.documentElement.lang = locale())));
}
