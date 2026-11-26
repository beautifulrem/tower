// @vitest-environment jsdom
import type { HighlighterCore } from "shiki/core";
import { afterEach, expect, it, vi } from "vitest";

afterEach(() => vi.restoreAllMocks());

// The worker's highlighter, as Shiki made it: reached the same way whatever the worker exports (review 20, record only:
// the test took it from an export the old worker did not have, and failed there rather than on the rule).
let made: Promise<HighlighterCore> | undefined;
vi.mock("shiki/core", async (original) => {
  const real = await original<typeof import("shiki/core")>();
  return { ...real, createHighlighterCore: (...a: Parameters<typeof real.createHighlighterCore>) => (made = real.createHighlighterCore(...a)) };
});

// Review 18 (record only): under load a review's first hunk came out coarse for good — "import { mock } from
// 'node:test';" one keyword-coloured token. Shiki ends a line that runs over 500 ms and returns the rest of it as one
// token; on a cold worker the time is the regex engine compiling, and the coarse answer was cached. Here the clock jumps
// past the limit at the start of the first pass, as a cold, busy worker's would.
it("a pass cut short by the line time limit is run again, so no line is left as a single token", async () => {
  const posted: Array<{ id: number; tokens: [string, string | undefined, number | undefined][][] | null }> = [];
  vi.spyOn(window, "postMessage").mockImplementation((m: any) => void posted.push(m));
  await import("../highlight.worker");
  const ask = (id: number, code: string) => (self.onmessage as any)({ data: { id, lang: "javascript", code } });
  await ask(1, "let a = 1;");
  expect(posted.at(-1)?.tokens, "the grammar loads at an even pace").not.toBeNull();
  let t = Date.now();
  let reads = 0;
  vi.spyOn(Date, "now").mockImplementation(() => (reads++ < 3 ? (t += 600) : t));
  await ask(2, "import { mock } from 'node:test';");
  expect(posted.at(-1)?.id).toBe(2);
  expect(posted.at(-1)?.tokens?.[0].map(([text]) => text)).toEqual(["import", " { mock } ", "from", " ", "'node:test'", ";"]);
});

// Review 19 (record only): the pass was run again whenever it took over 500 ms in all, so a big hunk, or one long line
// that was never cut, cost twice. Only a pass that cut a line short is run again. Here every line takes 300 ms before
// the tokenizer starts on it (out of its own clock): two lines are 600 ms, and neither is cut.
it("a pass that was long but cut no line short is not run again", async () => {
  const posted: Array<{ id: number; tokens: unknown }> = [];
  vi.spyOn(window, "postMessage").mockImplementation((m: any) => void posted.push(m));
  await import("../highlight.worker");
  const ask = (id: number, code: string) => (self.onmessage as any)({ data: { id, lang: "javascript", code } });
  await ask(3, "let a = 1;");
  const grammar = (await made!).getLanguage("javascript") as unknown as { tokenizeLine2: (...a: unknown[]) => unknown };
  const line = grammar.tokenizeLine2;
  let lines = 0;
  vi.spyOn(grammar, "tokenizeLine2").mockImplementation((...a: unknown[]) => {
    lines++;
    const until = performance.now() + 300;
    while (performance.now() < until);
    return line.apply(grammar, a);
  });
  await ask(4, "let b = 2;\nlet c = 3;");
  expect(posted.at(-1)?.id).toBe(4);
  expect(lines, "two lines, one pass").toBe(2);
});
