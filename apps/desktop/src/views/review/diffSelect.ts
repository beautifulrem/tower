/**
 * Selecting and copying diff lines (review 16). The browser's own selection skips a line with nothing selectable in it
 * and takes a line's +/− with it; these give what a reader means instead.
 */

/**
 * A copy of several lines is the code as it stands in the file: each line's own text, one line apart, blank lines
 * kept. In the split view, only the side the selection started on. One line: the browser's own copy already is that.
 */
export function copyLines(table: HTMLElement, e: ClipboardEvent) {
  const sel = getSelection();
  if (!sel?.rangeCount || sel.isCollapsed || !e.clipboardData) return;
  const range = sel.getRangeAt(0);
  const { startContainer: a, endContainer: b } = range;
  const col = ((a instanceof Element ? a : a.parentElement)?.closest("td.code") as HTMLTableCellElement | null)?.cellIndex ?? -1;
  const lines: string[] = [];
  for (const tr of table.querySelectorAll("tr.dl")) {
    const td = col < 0 ? tr.querySelector("td.code") : tr.children[col];
    if (!td?.matches("td.code") || !range.intersectsNode(td)) continue;
    // The part of this line the selection holds, without its sign.
    const r = document.createRange();
    r.selectNodeContents(td);
    if (td.contains(a)) r.setStart(a, range.startOffset);
    if (td.contains(b)) r.setEnd(b, range.endOffset);
    const f = r.cloneContents();
    f.querySelectorAll(".sign").forEach((n) => n.remove());
    lines.push(f.textContent!);
  }
  if (lines.length < 2) return;
  e.preventDefault();
  e.clipboardData.setData("text/plain", lines.join("\n"));
}

/** A triple-click takes the line it lands on, wherever on it (its sign too), without the sign; a blank line, nothing. */
export function selectLine(e: MouseEvent) {
  const td = e.detail === 3 && (e.target as Element).closest("td.code");
  const sel = getSelection();
  if (!td || !sel) return;
  const r = document.createRange();
  r.selectNodeContents(td);
  const sign = td.querySelector(":scope > .sign");
  if (sign) r.setStartAfter(sign);
  sel.removeAllRanges();
  sel.addRange(r);
}
