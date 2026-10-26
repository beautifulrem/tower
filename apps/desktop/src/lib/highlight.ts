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
