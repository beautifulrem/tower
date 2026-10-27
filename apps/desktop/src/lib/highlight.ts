/** Main-thread client for the highlighting worker, with a small cache. */
import type { Request, Tokens } from "./highlight.worker";

const EXT: Record<string, string> = {
  ts: "typescript", mts: "typescript", cts: "typescript", tsx: "tsx",
  js: "javascript", mjs: "javascript", cjs: "javascript", jsx: "jsx",
  json: "json", rs: "rust", py: "python", go: "go", css: "css", scss: "css",
  html: "html", md: "markdown", yml: "yaml", yaml: "yaml", toml: "toml",
  sh: "shellscript", bash: "shellscript", zsh: "shellscript", sql: "sql",
  java: "java", swift: "swift", vue: "vue",
};

export function languageOf(path: string): string | null {
  const name = path.split("/").pop() ?? path;
  if (name === "Dockerfile" || name.endsWith(".env")) return null;
  const ext = name.includes(".") ? name.split(".").pop()!.toLowerCase() : "";
  return EXT[ext] ?? null;
}

let worker: Worker | null = null;
let seq = 0;
const pending = new Map<number, (t: Tokens | null) => void>();
const cache = new Map<string, Promise<Tokens | null>>();

function client(): Worker {
  if (!worker) {
    worker = new Worker(new URL("./highlight.worker.ts", import.meta.url), { type: "module" });
    worker.onmessage = (e: MessageEvent<{ id: number; tokens: Tokens | null }>) => {
      pending.get(e.data.id)?.(e.data.tokens);
      pending.delete(e.data.id);
    };
  }
  return worker;
}

/** A hunk's two sides as the diff highlights them: the new side (context and additions), the old (context and deletions). */
export function hunkSides(lines: { kind: string; text: string }[]): { newSide: string; oldSide: string } {
  return {
    newSide: lines.filter((l) => l.kind !== "del").map((l) => l.text).join("\n"),
    oldSide: lines.filter((l) => l.kind !== "add").map((l) => l.text).join("\n"),
  };
}

/**
 * Highlights a review's hunks before it is opened. On a cold worker the first colours cost one to two seconds (the
 * grammar loads, then the regex engine compiles the patterns the code reaches); done while the board idles, the
 * review opens with its colours already in the cache, keyed by the same text the diff will ask for.
 */
export function prewarm(files: { path: string; hunks: { lines: { kind: string; text: string }[] }[] }[], maxHunks = 40) {
  let n = 0;
  for (const f of files) {
    const lang = languageOf(f.path);
    if (!lang) continue;
    for (const h of f.hunks) {
      if (n++ >= maxHunks) return;
      const { newSide, oldSide } = hunkSides(h.lines);
      void highlight(lang, newSide);
      void highlight(lang, oldSide);
    }
  }
}

/** Tokenizes `code` (lines joined by \n). Resolves to null if unsupported. */
export function highlight(lang: string, code: string): Promise<Tokens | null> {
  // Very large blocks stay plain: highlighting must never cost a frame.
  if (code.length > 200_000) return Promise.resolve(null);
  const key = `${lang}\u0000${code}`;
  let p = cache.get(key);
  if (!p) {
    p = new Promise((resolve) => {
      const id = ++seq;
      pending.set(id, resolve);
      client().postMessage({ id, lang, code } satisfies Request);
    });
    cache.set(key, p);
    if (cache.size > 400) cache.delete(cache.keys().next().value!);
  }
  return p;
}
