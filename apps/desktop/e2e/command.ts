/**
 * What an approval's code block paints, on the desk and the phone alike (review 22, R22-P3-01): its rows, measured from
 * the characters' own boxes, and the ink a screenshot finds in the two-character margin a carried-over row starts after:
 * whether there is any, how much of the margin it fills, and how near its colour is to text-3's (review 23: a solid grey
 * block, an amber hook and a hook drawn once all passed a test that asked only for ink); and the rows that end with room
 * for what follows them or hold only an indent (review 24: a URL after an indent, or as a line's third word, went down a
 * row whole and left the row above it short or blank).
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
  /** Ink in the margin, the two characters left of where a carried-over row's words start: two of CSS's `ch` (the width
   * of a "0", what the margin and the hook are drawn in), a pixel short, never two of the characters' own advance (on
   * the phone a little wider: the row's first capital stood inside it and read as the hook's darkest ink). */
  ink: boolean;
  /** The share of the margin's pixels the ink covers: a stroke covers a little of it, a block nearly all. */
  fill: number;
  /** The inkiest pixel, along the line from the block's ground to text-3: 1 for text-3, 0 for the ground, 1.4 to 1.6
   * for text-1 (review 24, record 9). */
  tone: number;
  /** How far that pixel stands off that line (RGB distance): small for any grey between them, large for a hue. */
  off: number;
  /** How far across the margin the ink reaches, in characters: a hook's stroke about 1.3, a thin bar down the margin a
   * seventh of one (review 24, record 9: a thin bar and a hook in text-1 passed a test that asked for a stroke of a grey). */
  span: number;
  /** How far down the row the ink reaches, as a share of the row: a hook's stroke about half, a rule across the margin a
   * pixel or two (it runs across as far as a hook does). */
  depth: number;
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
  /** Rows that end early (review 24, R24-P3-03): the room left at a row's end, past the spaces that close it, holds the
   * next row's first word, or, when that word runs over more rows than one (it is longer than a row), its first
   * character: such a word starts in place. Measured in pixels against the block's text edge, the word as painted; a row
   * closed by a tab is not judged (a tab's width is the tab's). */
  early: string[];
  /** Rows that hold nothing but spaces while their line goes on below with a word that runs over more rows than one: such
   * a word starts in place (review 24, R24-P3-03: a URL after an indent left the indent alone above it). A word that fits
   * a row but not the room its line's indent leaves goes down whole and its indent stands alone above it, as a word that
   * fits is never parted (review 22); that is not counted here. */
  blank: string[];
  /** Characters painted past the block's text edge: a word's box wider than the row it stands on, by half a pixel or more. */
  over: string[];
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
    const rows: { line: number; first: boolean; at: number; top: number; text: string; start: number; end: number }[] = [];
    for (const [k, c] of chars.entries()) {
      const last = rows.at(-1);
      const space = /\s/.test(c.c);
      // A space (or a tab) past a row's end hangs there, wherever the browser says it stands: it paints nothing.
      if (space && last?.line === c.line) {
        last.text += c.c;
        continue;
      }
      if (!last || last.line !== c.line || Math.abs(c.top - last.top) > 2)
        rows.push({ line: c.line, first: !last || last.line !== c.line, at: Math.round((c.left - edge) / ch), top: c.top, text: c.c, start: k, end: space ? -Infinity : c.left + c.width });
      else (last.text += c.c), (last.end = Math.max(last.end, c.left + c.width));
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
    // Where a row could have gone on: its room is the block's text edge less the right of its last character, and the
    // spaces that close it go before anything that would follow on it. A quarter of a character over what is needed, so
    // whole-pixel boxes never read a word that just missed as one that fit (a row of 320 px left 0.3 px short reads
    // 0.3 px over); a row that ended early has a character or more to spare.
    const early: string[] = [];
    const blank: string[] = [];
    for (const [j, r] of rows.entries()) {
      const next = rows[j + 1];
      if (!next || next.line !== r.line) continue;
      // The next row's first word, as painted: from the row's start to a space or the line's end.
      let k = next.start;
      while (chars[k] && chars[k].line === r.line && !/\s/.test(chars[k].c)) k++;
      const word = chars.slice(next.start, k);
      const long = word.some((c) => Math.abs(c.top - word[0].top) > 2);
      if (!r.text.trim()) {
        if (long) blank.push(`line ${r.line}: "${r.text}" stands alone above "${next.text}"`);
        continue;
      }
      const gap = r.text.match(/\s*$/)![0];
      if (!gap || gap.includes("\t")) continue;
      const need = gap.length * ch + (long ? ch : word.at(-1)!.left + word.at(-1)!.width - word[0].left);
      if (edge + inner - r.end >= need + ch / 4) early.push(`line ${r.line}: "${r.text}" ends with room for ${long ? "the start of " : ""}"${next.text.split(/\s/)[0]}" (${(edge + inner - r.end).toFixed(1)} px, needs ${need.toFixed(1)})`);
    }
    const over = chars.filter((c) => !/\s/.test(c.c) && c.left + c.width > edge + inner + 0.5).map((c) => `line ${c.line} "${c.c}" at ${c.i}: ${(c.left + c.width - edge - inner).toFixed(1)} px past the edge`);
    // WebKit gives the `font` shorthand no computed value: the font is set from its parts.
    g.font = `${cs.fontStyle} ${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
    const margin = 2 * g.measureText("0").width;
    return { rows, text: el.innerText, broken, ordered, early, blank, over, cols: fits + 2, text3, geo: { left: box.left, top: box.top, width: box.width, edge, ch, margin, lineHeight: parseFloat(cs.lineHeight) } };
  });
}

/** `ink: false` reads the rows and words alone, without a screenshot (every row's `ink` false): for a sweep of widths. */
export async function paintedCommand(pre: Locator, { ink = true } = {}): Promise<CommandPaint> {
  // Finding the block and reading it are two steps: a page that repaints in between (the phone's, when its state
  // changes) leaves the block found out of the document, with no boxes to read. Read the one in the document then.
  let read = await readCommand(pre);
  for (let again = 0; !read && again < 3; again++) read = await readCommand(pre);
  if (!read) throw new Error("the block was out of the document at every read");
  const rows = read.rows.map((r) => ({ line: r.line, first: r.first, at: r.at, ink: false, fill: 0, tone: 0, off: 0, span: 0, depth: 0, text: r.text }));
  const words = { broken: read.broken, ordered: read.ordered, early: read.early, blank: read.blank, over: read.over, cols: read.cols };
  if (!ink) return { rows, text: read.text, ...words };
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
          let [n, all, inkiest, left, right, upper, lower] = [0, 0, ground, Infinity, -Infinity, Infinity, -Infinity];
          for (let x = x0; x < x0 + geo.margin - 1; x += 1 / k)
            for (let y = y0 + 1; y < y0 + geo.lineHeight - 1; y += 1 / k) {
              const p = px(x, y);
              all++;
              if (dist(p, ground) > 60) {
                n++;
                [left, right, upper, lower] = [Math.min(left, x), Math.max(right, x), Math.min(upper, y), Math.max(lower, y)];
              }
              if (dist(p, ground) > dist(inkiest, ground)) inkiest = p;
            }
          const d = sub(text3, ground);
          const v = sub(inkiest, ground);
          const tone = dot(v, d) / dot(d, d);
          return { ink: n > 3, fill: n / all, tone, off: Math.hypot(...sub(v, d.map((x) => x * tone))), span: n ? (2 * (right - left)) / geo.margin : 0, depth: n ? (lower - upper) / geo.lineHeight : 0 };
        });
      },
      { shot, tops: read.rows.map((r) => r.top), geo: read.geo, text3: read.text3 },
    );
    return { rows: rows.map((r, j) => ({ ...r, ...inks[j] })), text: read.text, ...words };
  } finally {
    await blank.close();
  }
}
