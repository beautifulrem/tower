/**
 * Split-Geometry virtualized `<tbody>` for large diffs (> 400 rows or whole
 * file expansion). Delegates row rendering back to FileDiff so code/header/note
 * templates exist only once in the bundle.
 */
import { For, type JSX, Show, createEffect, createMemo, createSignal, on, onCleanup, onMount } from "solid-js";

import type { DiffLine } from "../../gen/DiffLine";
import { splitRows } from "../../lib/diffview";
import type { Draft } from "../../lib/reviewState";
import { type GeometryItem, SplitGeometry, createIdleGate } from "../../lib/virtualDiff";
import { type Anchor, type Block, type Composing, sameAnchor } from "./types";

export type VRow =
  | { kind: "head"; header: string; index: number; geo: GeometryItem }
  | { kind: "gap"; block: Extract<Block, { kind: "gap" }>; geo: GeometryItem }
  | { kind: "folded"; index: number; noise: "moved" | "formatting"; lines: number; header: string; geo: GeometryItem }
  | { kind: "fold"; index: number; height: number; geo: GeometryItem }
  | { kind: "code"; line: DiffLine; hunkIndex: number | null; commented: boolean; geo: GeometryItem }
  | { kind: "split"; left: DiffLine | null; right: DiffLine | null; hunkIndex: number | null; commented: boolean; geo: GeometryItem }
  | { kind: "composer"; geo: GeometryItem }
  | { kind: "comment"; draft: Draft; draftIndex: number; geo: GeometryItem };

export const lineAnchor = (path: string, l: DiffLine): Anchor =>
  l.kind === "del" ? { path, line: null, old: l.old_no } : { path, line: l.new_no, old: null };

export function flattenBlocks(o: {
  path: string;
  blocks: Block[];
  split: boolean;
  comments: { c: Draft; index: number }[];
  composer: Composing;
  isAccepted: (i: number | null) => boolean;
  folding: Record<number, number>;
  noiseOf: (i: number | null) => "moved" | "formatting" | null;
  noiseExpanded: Record<number, boolean>;
}): VRow[] {
  const out: VRow[] = [];
  const { path } = o;
  const at = (a: Anchor) => o.comments.filter((x) => sameAnchor(x.c, a));
  const geo = (kind: GeometryItem["kind"], line: number | null, side: GeometryItem["anchor"]["side"], hunk?: number, height?: number): GeometryItem => ({
    kind, height, anchor: { path, line, side, hunk },
  });
  const pushAtt = (anchors: Anchor[]) => {
    for (const a of anchors) {
      const side = a.old ? "old" : "new", ln = a.old ?? a.line;
      if (o.composer && sameAnchor(o.composer, a)) out.push({ kind: "composer", geo: geo("composer", ln, side, -2) });
      for (const x of at(a)) out.push({ kind: "comment", draft: x.c, draftIndex: x.index, geo: geo("comment", ln, side, 1e4 + x.index) });
    }
  };
  for (const b of o.blocks) {
    if (b.kind === "head") out.push({ kind: "head", header: b.header, index: b.index, geo: geo("head", null, "hunk", b.index) });
    else if (b.kind === "gap") out.push({ kind: "gap", block: b, geo: geo("gap", b.gap.newFrom, "hunk", b.index ?? -(b.gap.index + 10)) });
    else if (b.index !== null && o.folding[b.index] !== undefined) out.push({ kind: "fold", index: b.index, height: o.folding[b.index], geo: geo("fold", null, "hunk", 2e4 + b.index, o.folding[b.index]) });
    else if (!o.isAccepted(b.index)) {
      const n = o.noiseOf(b.index);
      if (n && b.index !== null && !o.noiseExpanded[b.index]) {
        out.push({ kind: "folded", index: b.index, noise: n, lines: b.hunk.lines.length, header: b.hunk.header, geo: geo("folded", null, "hunk", 3e4 + b.index) });
      } else if (!o.split) {
        for (const l of b.hunk.lines) {
          const a = lineAnchor(path, l);
          out.push({ kind: "code", line: l, hunkIndex: b.index, commented: at(a).length > 0, geo: geo("code", l.kind === "del" ? l.old_no : l.new_no, l.kind === "del" ? "old" : "new") });
          pushAtt([a]);
        }
      } else {
        for (const r of splitRows(b.hunk.lines)) {
          const left = r.left === null ? null : b.hunk.lines[r.left];
          const right = r.right === null ? null : b.hunk.lines[r.right];
          const anchors = [...(left?.kind === "del" ? [lineAnchor(path, left)] : []), ...(right ? [lineAnchor(path, right)] : [])];
          out.push({ kind: "split", left, right, hunkIndex: b.index, commented: anchors.some((a) => at(a).length > 0), geo: geo("code", right ? right.new_no : (left?.old_no ?? null), right ? "new" : "old") });
          pushAtt(anchors);
        }
      }
    }
  }
  return out;
}

export function VirtualBody(props: { path: string; rows: VRow[]; cols: number; renderRow: (row: VRow, idx: number) => JSX.Element }) {
  const geom = new SplitGeometry();
  const gate = createIdleGate(64);
  const [tick, setTick] = createSignal(0);
  const [scrollTop, setScrollTop] = createSignal(0);
  const [viewH, setViewH] = createSignal(720);
  let tbody!: HTMLTableSectionElement;

  const paneOf = () => tbody?.closest<HTMLElement>(".review-diff") ?? null;
  const tblTop = (p: HTMLElement) => (tbody?.closest("table")?.getBoundingClientRect().top ?? 0) - p.getBoundingClientRect().top + p.scrollTop;
  const keepAnchor = (fn: () => boolean) => {
    const p = paneOf(), top = p ? tblTop(p) : 0, local = p ? Math.max(0, p.scrollTop - top) : 0;
    const cap = p && p.scrollTop > top ? geom.captureAnchor(local) : null;
    if (!fn()) return;
    setTick((n) => n + 1);
    const next = p && cap ? geom.resolveScrollTop(cap) : null;
    if (p && next !== null && Math.abs(next - local) >= 1) (p.scrollTop = top + next), setScrollTop(next);
  };

  createEffect(on(() => props.rows, (r) => keepAnchor(() => (geom.reset(r.map((x) => x.geo)), true))));
  const measure = () =>
    keepAnchor(() => {
      let ch = false;
      for (const el of tbody?.querySelectorAll<HTMLElement>("tr[data-vmeasure]") ?? []) {
        if (geom.measure(Number(el.dataset.vidx), el.getBoundingClientRect().height)) ch = true;
      }
      return ch;
    });

  onMount(() => {
    const p = paneOf();
    if (!p) return;
    const sync = () => (setScrollTop(Math.max(0, p.scrollTop - tblTop(p))), setViewH(p.clientHeight || 720), gate.markScrolling(), gate.schedule(measure));
    const onJump = (ev: Event) => {
      const { path, index } = (ev as CustomEvent<{ path: string; index: number }>).detail;
      if (path !== props.path) return;
      const idx = geom.indexOfAnchor({ path, line: null, side: "hunk", hunk: index });
      if (idx >= 0) (p.scrollTo({ top: Math.max(0, tblTop(p) + geom.rowTop(idx) - 40) }), sync());
    };
    sync();
    p.addEventListener("scroll", sync, { passive: true });
    window.addEventListener("resize", sync, { passive: true });
    p.addEventListener("tower:scroll-hunk", onJump);
    onCleanup(() => (p.removeEventListener("scroll", sync), window.removeEventListener("resize", sync), p.removeEventListener("tower:scroll-hunk", onJump), gate.dispose()));
  });

  const range = createMemo(() => (tick(), geom.range(scrollTop(), viewH(), 24)));
  const visible = createMemo(() => props.rows.slice(range().start, range().end).map((row, i) => ({ row, idx: range().start + i })));
  createEffect(() => (visible(), gate.schedule(measure)));

  return (
    <tbody ref={tbody} data-virtualized="true" data-total-rows={props.rows.length}>
      <Show when={range().topPad > 0}><tr class="vdiff-spacer" aria-hidden="true"><td colspan={props.cols} style={{ height: `${range().topPad}px` }} /></tr></Show>
      <For each={visible()}>{(it) => props.renderRow(it.row, it.idx)}</For>
      <Show when={range().bottomPad > 0}><tr class="vdiff-spacer" aria-hidden="true"><td colspan={props.cols} style={{ height: `${range().bottomPad}px` }} /></tr></Show>
    </tbody>
  );
}
