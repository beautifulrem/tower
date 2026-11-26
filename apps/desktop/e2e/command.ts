/**
 * What an approval's code block paints, on the desk and the phone alike (review 22, R22-P3-01): its rows, measured from
 * the characters' own boxes, and the ink a screenshot finds in the two-character margin a carried-over row starts after.
 */
import type { Locator } from "@playwright/test";

export interface CommandRow {
  /** The command's line the row is part of, from 0. */
  line: number;
  /** The row is its line's first. */
  first: boolean;
  /** Where its first character stands from the block's text edge, in characters. */
  at: number;
  /** Ink in the margin, the two characters left of where a carried-over row's words start. */
  ink: boolean;
  text: string;
}

export interface CommandPaint {
  rows: CommandRow[];
  /** What a reader copies: the block's text as the browser reads it out. */
  text: string;
  /** Words (runs without a space) that fit in a row and still stand on two rows. */
  broken: string[];
}

/** `ink: false` reads the rows and words alone, without a screenshot (every row's `ink` false): for a sweep of widths. */
export async function paintedCommand(pre: Locator, { ink = true } = {}): Promise<CommandPaint> {
  const read = await pre.evaluate((el) => {
    const cs = getComputedStyle(el);
    const box = el.getBoundingClientRect();
    const edge = box.left + parseFloat(cs.borderLeftWidth) + parseFloat(cs.paddingLeft);
    const inner = box.width - parseFloat(cs.borderLeftWidth) - parseFloat(cs.borderRightWidth) - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
    type Char = { line: number; i: number; c: string; top: number; left: number; width: number };
    const chars: Char[] = [];
    let line = 0;
    let i = 0;
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      const text = n.textContent ?? "";
      for (let k = 0; k < text.length; k++) {
        if (text[k] === "\n") {
          line++;
          i = 0;
          continue;
        }
        const r = document.createRange();
        r.setStart(n, k);
        r.setEnd(n, k + 1);
        const rect = r.getClientRects()[0];
        if (rect) chars.push({ line, i, c: text[k], top: rect.top, left: rect.left, width: rect.width });
        i++;
      }
    }
    // One character's advance: across the first row, from its first character to its last that is not a space (a space
    // past the row's end hangs wherever the browser puts it).
    const row0 = chars.filter((c) => c.line === chars[0].line && Math.abs(c.top - chars[0].top) < 2 && c.c !== " ");
    const ch = (row0.at(-1)!.left - row0[0].left) / (row0.at(-1)!.i - row0[0].i);
    const rows: { line: number; first: boolean; at: number; top: number; text: string }[] = [];
    for (const c of chars) {
      const last = rows.at(-1);
      // A space past a row's end hangs there, wherever the browser says it stands: it paints nothing.
      if (c.c === " " && last?.line === c.line) {
        last.text += c.c;
        continue;
      }
      if (!last || last.line !== c.line || Math.abs(c.top - last.top) > 2)
        rows.push({ line: c.line, first: !last || last.line !== c.line, at: Math.round(((c.left - edge) / ch) * 10) / 10, top: c.top, text: c.c });
      else last.text += c.c;
    }
    // Words that fit in a row (two characters short of the block, the margin a carried-over row starts after).
    const fits = Math.floor(inner / ch) - 2;
    const broken: string[] = [];
    const byLine = new Map<number, Char[]>();
    for (const c of chars) byLine.set(c.line, [...(byLine.get(c.line) ?? []), c]);
    for (const cs of byLine.values()) {
      let word: Char[] = [];
      for (const c of [...cs, null]) {
        if (c && c.c !== " ") {
          word.push(c);
          continue;
        }
        if (word.length && word.length <= fits && new Set(word.map((w) => Math.round(w.top))).size > 1) broken.push(word.map((w) => w.c).join(""));
        word = [];
      }
    }
    return { rows, text: el.innerText, broken, geo: { left: box.left, top: box.top, width: box.width, edge, ch, lineHeight: parseFloat(cs.lineHeight) } };
  });
  const rows = read.rows.map((r) => ({ line: r.line, first: r.first, at: r.at, ink: false, text: r.text }));
  if (!ink) return { rows, text: read.text, broken: read.broken };
  // The margin's ink, from a screenshot: against the block's ground just left of the text edge. Read on a blank page of
  // its own, so the page under test's Content-Security-Policy governs the page's marks, never the measuring.
  const shot = (await pre.screenshot({ animations: "disabled" })).toString("base64");
  const blank = await pre.page().context().newPage();
  try {
    const inks = await blank.evaluate(
      async ({ shot, tops, geo }) => {
        const img = new Image();
        img.src = `data:image/png;base64,${shot}`;
        await img.decode();
        const canvas = document.createElement("canvas");
        [canvas.width, canvas.height] = [img.width, img.height];
        const g = canvas.getContext("2d")!;
        g.drawImage(img, 0, 0);
        const D = g.getImageData(0, 0, canvas.width, canvas.height);
        const k = img.width / geo.width;
        const px = (x: number, y: number) => [0, 1, 2].map((j) => D.data[(Math.round(y * k) * D.width + Math.round(x * k)) * 4 + j]);
        const dist = (p: number[], q: number[]) => p.reduce((s, v, j) => s + Math.abs(v - q[j]), 0);
        const x0 = geo.edge - geo.left;
        return tops.map((top) => {
          const y0 = top - geo.top;
          const ground = px(x0 - 3, y0 + geo.lineHeight / 2);
          let n = 0;
          for (let x = x0; x < x0 + 2 * geo.ch - 1; x += 1 / k)
            for (let y = y0 + 1; y < y0 + geo.lineHeight - 1; y += 1 / k) if (dist(px(x, y), ground) > 60) n++;
          return n > 3;
        });
      },
      { shot, tops: read.rows.map((r) => r.top), geo: read.geo },
    );
    return { rows: rows.map((r, j) => ({ ...r, ink: inks[j] })), text: read.text, broken: read.broken };
  } finally {
    await blank.close();
  }
}
