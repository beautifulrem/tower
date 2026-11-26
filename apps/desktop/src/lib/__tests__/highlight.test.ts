// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";

afterEach(() => vi.restoreAllMocks());

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
