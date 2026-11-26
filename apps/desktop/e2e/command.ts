/**
 * What an approval's code block paints, on the desk and the phone alike (review 22, R22-P3-01): its rows, measured from
 * the characters' own boxes, and the ink a screenshot finds in the two-character margin a carried-over row starts after:
 * whether there is any, how much of the margin it fills, and how near its colour is to text-3's (review 23: a solid grey
 * block, an amber hook and a hook drawn once all passed a test that asked only for ink).
 */
import type { Locator } from "@playwright/test";

export interface CommandRow {
  /** The command's line the row is part of, from 0. */
  line: number;
  /** The row is its line's first. */
  first: boolean;
  /** Where its first character stands from the block's text edge, in whole characters (WebKit reports a character's box
   * on whole pixels, a seventh of a character at 12px: 54.8 reads as 54, two characters in as 1.9). */
  at: number;
  /** Ink in the margin, the two characters left of where a carried-over row's words start. */
  ink: boolean;
  /** The share of the margin's pixels the ink covers: a stroke covers a little of it, a block nearly all. */
  fill: number;
  /** The inkiest pixel, along the line from the block's ground to text-3: about 1 for text-3, 0 for the ground. */
  tone: number;
  /** How far that pixel stands off that line (RGB distance): small for any grey between them, large for a hue. */
  off: number;
  text: string;
}

export interface CommandPaint {
  rows: CommandRow[];
  /** What a reader copies: the block's text as the browser reads it out. */
  text: string;
  /** Words (runs without a space or a tab) that fit in a row and still stand on two rows. */
  broken: string[];
  /** Every row stands below the one before it in the text's own order: no word is painted back up beside an earlier row. */
  ordered: boolean;
  /** Characters a line's first row holds (a carried-over row holds two fewer). */
  cols: number;
}

/** The block's rows and words as the page lays them out; null when the block is no longer in the document. */
function readCommand(pre: Locator) {
  return pre.evaluate((el: HTMLElement) => {
    if (!el.isConnected) return null;
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
    const row0 = chars.filter((c) => c.line === chars[0].line && Math.abs(c.top - chars[0].top) < 2 && !/\s/.test(c.c));
    const ch = (row0.at(-1)!.left - row0[0].left) / (row0.at(-1)!.i - row0[0].i);
    const rows: { line: number; first: boolean; at: number; top: number; text: string }[] = [];
    for (const c of chars) {
      const last = rows.at(-1);
      // A space (or a tab) past a row's end hangs there, wherever the browser says it stands: it paints nothing.
      if (/\s/.test(c.c) && last?.line === c.line) {
        last.text += c.c;
        continue;
      }
      if (!last || last.line !== c.line || Math.abs(c.top - last.top) > 2)
        rows.push({ line: c.line, first: !last || last.line !== c.line, at: Math.round((c.left - edge) / ch), top: c.top, text: c.c });
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
        if (c && !/\s/.test(c.c)) {
          word.push(c);
          continue;
        }
        if (word.length && word.length <= fits && new Set(word.map((w) => Math.round(w.top))).size > 1) broken.push(word.map((w) => w.c).join(""));
        word = [];
      }
    }
    // text-3 as the page under test resolves it, in sRGB.
    const probe = document.createElement("i");
    probe.style.color = "var(--text-3)";
    document.body.append(probe);
    const g = document.createElement("canvas").getContext("2d")!;
    g.fillStyle = getComputedStyle(probe).color;
    g.fillRect(0, 0, 1, 1);
    probe.remove();
    const text3 = [...g.getImageData(0, 0, 1, 1).data.slice(0, 3)];
    const ordered = rows.every((r, j) => !j || r.top > rows[j - 1].top + 2);
    return { rows, text: el.innerText, broken, ordered, cols: fits + 2, text3, geo: { left: box.left, top: box.top, width: box.width, edge, ch, lineHeight: parseFloat(cs.lineHeight) } };
  });
}

/** `ink: false` reads the rows and words alone, without a screenshot (every row's `ink` false): for a sweep of widths. */
export async function paintedCommand(pre: Locator, { ink = true } = {}): Promise<CommandPaint> {
  // Finding the block and reading it are two steps: a page that repaints in between (the phone's, when its state
  // changes) leaves the block found out of the document, with no boxes to read. Read the one in the document then.
  let read = await readCommand(pre);
  for (let again = 0; !read && again < 3; again++) read = await readCommand(pre);
  if (!read) throw new Error("the block was out of the document at every read");
  const rows = read.rows.map((r) => ({ line: r.line, first: r.first, at: r.at, ink: false, fill: 0, tone: 0, off: 0, text: r.text }));
  if (!ink) return { rows, text: read.text, broken: read.broken, ordered: read.ordered, cols: read.cols };
  // The margin's ink, from a screenshot: against the block's ground just left of the text edge. Read on a blank page of
  // its own, so the page under test's Content-Security-Policy governs the page's marks, never the measuring.
  const shot = (await pre.screenshot({ animations: "disabled" })).toString("base64");
  const blank = await pre.page().context().newPage();
  try {
    const inks = await blank.evaluate(
      async ({ shot, tops, geo, text3 }) => {
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
        const sub = (p: number[], q: number[]) => p.map((v, j) => v - q[j]);
        const dot = (p: number[], q: number[]) => p.reduce((s, v, j) => s + v * q[j], 0);
        const x0 = geo.edge - geo.left;
        return tops.map((top) => {
          const y0 = top - geo.top;
          const ground = px(x0 - 3, y0 + geo.lineHeight / 2);
          let [n, all, inkiest] = [0, 0, ground];
          for (let x = x0; x < x0 + 2 * geo.ch - 1; x += 1 / k)
            for (let y = y0 + 1; y < y0 + geo.lineHeight - 1; y += 1 / k) {
              const p = px(x, y);
              all++;
              if (dist(p, ground) > 60) n++;
              if (dist(p, ground) > dist(inkiest, ground)) inkiest = p;
            }
          const d = sub(text3, ground);
          const v = sub(inkiest, ground);
          const tone = dot(v, d) / dot(d, d);
          return { ink: n > 3, fill: n / all, tone, off: Math.hypot(...sub(v, d.map((x) => x * tone))) };
        });
      },
      { shot, tops: read.rows.map((r) => r.top), geo: read.geo, text3: read.text3 },
    );
    return { rows: rows.map((r, j) => ({ ...r, ...inks[j] })), text: read.text, broken: read.broken, ordered: read.ordered, cols: read.cols };
  } finally {
    await blank.close();
  }
}
