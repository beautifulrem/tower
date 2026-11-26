/**
 * Syntax highlighting off the main thread (docs/13 §13.6): Shiki with the
 * JavaScript regex engine (no WASM) and a CSS-variables theme, so colours
 * come from design tokens and follow light/dark without re-highlighting.
 */
import { createCssVariablesTheme, createHighlighterCore, type HighlighterCore } from "shiki/core";
import { createJavaScriptRegexEngine } from "shiki/engine/javascript";

const theme = createCssVariablesTheme({ name: "tower", variablePrefix: "--code-", fontStyle: true });

const LANGS: Record<string, () => Promise<unknown>> = {
  typescript: () => import("@shikijs/langs/typescript"),
  tsx: () => import("@shikijs/langs/tsx"),
  javascript: () => import("@shikijs/langs/javascript"),
  jsx: () => import("@shikijs/langs/jsx"),
  json: () => import("@shikijs/langs/json"),
  rust: () => import("@shikijs/langs/rust"),
  python: () => import("@shikijs/langs/python"),
  go: () => import("@shikijs/langs/go"),
  css: () => import("@shikijs/langs/css"),
  html: () => import("@shikijs/langs/html"),
  markdown: () => import("@shikijs/langs/markdown"),
  yaml: () => import("@shikijs/langs/yaml"),
  toml: () => import("@shikijs/langs/toml"),
  shellscript: () => import("@shikijs/langs/shellscript"),
  sql: () => import("@shikijs/langs/sql"),
  java: () => import("@shikijs/langs/java"),
  swift: () => import("@shikijs/langs/swift"),
  vue: () => import("@shikijs/langs/vue"),
};

let highlighter: Promise<HighlighterCore> | null = null;
const loaded = new Set<string>();

function get(): Promise<HighlighterCore> {
  highlighter ??= createHighlighterCore({ themes: [theme], langs: [], engine: createJavaScriptRegexEngine() });
  return highlighter;
}

export interface Request {
  id: number;
  lang: string;
  code: string;
}

/** Per line, a list of [text, colour, fontStyle]. */
export type Tokens = [string, string | undefined, number | undefined][][];

self.onmessage = async (e: MessageEvent<Request>) => {
  const { id, lang, code } = e.data;
  try {
    const h = await get();
    if (!loaded.has(lang)) {
      const load = LANGS[lang];
      if (!load) throw new Error(`unsupported ${lang}`);
      await h.loadLanguage((await load()) as never);
      loaded.add(lang);
    }
    // Shiki gives a line 500 ms; one that runs over ends there, the rest of it a single token in one colour. On a cold
    // worker on a busy machine the time goes to compiling the patterns the code reaches, not to the line: a pass that ran
    // over is run again, warm, so a review's first hunk is not left coarse for the session (review 18, record only).
    const start = Date.now();
    let { tokens } = h.codeToTokens(code, { lang, theme: "tower" });
    if (Date.now() - start > 500) ({ tokens } = h.codeToTokens(code, { lang, theme: "tower" }));
    const out: Tokens = tokens.map((line) => line.map((t) => [t.content, t.color, t.fontStyle]));
    self.postMessage({ id, tokens: out });
  } catch {
    self.postMessage({ id, tokens: null });
  }
};
