/**
 * One file of the review: a sticky header with the readings and two toggles,
 * then the diff table. Context between hunks expands from the file itself
 * (either side), twenty lines at a time or the whole file; hunks can be
 * undone in the workspace while the agent is not in it.
 *
 * Keyboard: the table is one tab stop. Focus lands on the first line number;
 * ↑↓ walk the lines, ↩ opens the comment composer on that line.
 */
import { For, type JSX, Match, Show, Switch, createComputed, createEffect, createMemo, createResource, createSignal, createUniqueId, on, onCleanup, onMount } from "solid-js";

import { Icon } from "../../components/Glyph";
import { Button, IconButton } from "../../components/ui";
import type { DiffFile } from "../../gen/DiffFile";
import type { DiffLine } from "../../gen/DiffLine";
import type { Hunk } from "../../gen/Hunk";
import { type Gap, STEP, contextLines, gapsOf, revealOf, splitRows } from "../../lib/diffview";
import { highlight, languageOf } from "../../lib/highlight";
import type { Tokens } from "../../lib/highlight.worker";
import { t } from "../../lib/i18n";
import { baseMs } from "../../lib/motion";
import { popupActions } from "../../lib/native";
import type { Draft } from "../../lib/reviewState";
import { suggestionOf, withoutSuggestion } from "../../lib/suggest";
import { type Range, hunkWordRanges, segment } from "../../lib/worddiff";
import { type Anchor, type Block, type Composing, type Reveals, sameAnchor } from "./types";

/** The colours may take this long to arrive before the code shows uncoloured. */
const COLOUR_WAIT_MS = 150;

export interface FileDiffProps {
  file: DiffFile;
  split: boolean;
  lines: string[] | null | undefined;
  reveals: Reveals;
  whole: boolean;
  onReveal: (gap: Gap, how: "top" | "bottom" | "all") => void;
  onWhole: () => void;
  viewed: boolean;
  onViewed: (on: boolean) => void;
  onOpen: (line: number | null) => void;
  /** Undoing a hunk in the workspace; absent while the agent may be writing. */
  onUndo?: (hunk: number) => void;
  /** Hunks you accepted — a reading mark of your own, nothing in the workspace: the hunk folds to its header. */
  accepted?: (hunk: number) => boolean;
  /** Accepting a hunk, or taking the mark back from one already accepted. */
  onAccept?: (hunk: number) => void;
  /** Editing the whole file in place (paused or in review only); the text arrives through `lines`. */
  editing?: boolean;
  onEditFile?: () => void;
  onSaveFile?: (text: string) => void;
  onCancelEdit?: () => void;
  /** Applying a comment's suggestion block to the line it hangs on. */
  onApplySuggestion?: (line: number, suggestion: string) => void;
  comments: Draft[];
  composer: Composing;
  onAnchor: (a: Anchor) => void;
  onSave: (text: string) => void;
  onCancel: () => void;
  onEdit: (index: number) => void;
  onRemove: (index: number) => void;
}

export function FileDiff(props: FileDiffProps) {
  const statusLabel = (s: DiffFile["status"]) => t(`review.${s}`);
  const fileAnchor = (): Anchor => ({ path: props.file.path, line: null, old: null });
  const indexed = () => props.comments.map((c, index) => ({ c, index })).filter((x) => x.c.path === props.file.path);
  const commentsAt = (a: Anchor) => indexed().filter((x) => sameAnchor(x.c, a));
  const composingAt = (a: Anchor) => !!props.composer && sameAnchor(props.composer, a);
  const editingText = () => (props.composer?.editing !== undefined ? props.comments[props.composer.editing]?.text : "");
  const total = () => (props.lines === undefined || props.lines === null ? null : props.lines.length);
  const expandable = () => gapsOf(props.file, null).length > 0;

  /**
   * Hunks with the hidden regions between them, revealed as far as asked.
   * A fold row carries the next hunk's `@@` header; a hunk with nothing
   * folded above it keeps a plain header row, so ] and [ still find it.
   */
  const blocks = createMemo<Block[]>(() => {
    const gaps = gapsOf(props.file, total());
    const byIndex = new Map(gaps.map((g) => [g.index, g]));
    const out: Block[] = [];
    const emitGap = (index: number, header: string | null): boolean => {
      const gap = byIndex.get(index);
      if (!gap) return false;
      const r = revealOf(gap, props.whole ? { top: 1e9, bottom: 0 } : props.reveals[index], total());
      if (r.top && props.lines) out.push({ kind: "hunk", hunk: { header: "", lines: contextLines(props.lines, gap, r.top[0], r.top[1]) }, index: null });
      const fold = r.hidden === null || r.hidden > 0;
      if (fold) out.push({ kind: "gap", gap, hidden: r.hidden, header, index: header === null ? null : index });
      if (r.bottom && props.lines) out.push({ kind: "hunk", hunk: { header: "", lines: contextLines(props.lines, gap, r.bottom[0], r.bottom[1]) }, index: null });
      return fold;
    };
    props.file.hunks.forEach((h, i) => {
      if (!emitGap(i, h.header)) out.push({ kind: "head", header: h.header, index: i });
      out.push({ kind: "hunk", hunk: h, index: i });
    });
    emitGap(props.file.hunks.length, null);
    return out;
  });

  /** ↑↓ between line numbers in the same column; Tab lands on the first one. */
  let table!: HTMLTableElement;
  const onTableFocus = (e: FocusEvent) => {
    if (e.target !== table) return;
    table.querySelector<HTMLElement>(".ln-btn")?.focus({ preventScroll: true });
  };
  const onTableKey = (e: KeyboardEvent) => {
    if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
    const btn = (e.target as HTMLElement).closest(".ln-btn");
    const td = btn?.closest("td");
    const tr = td?.closest("tr");
    if (!btn || !td || !tr) return;
    const col = [...tr.children].indexOf(td);
    let row = e.key === "ArrowDown" ? tr.nextElementSibling : tr.previousElementSibling;
    while (row && !row.children[col]?.querySelector(".ln-btn")) row = e.key === "ArrowDown" ? row.nextElementSibling : row.previousElementSibling;
    const target = row?.children[col]?.querySelector<HTMLElement>(".ln-btn");
    if (!target) return;
    e.preventDefault();
    target.focus({ preventScroll: true });
    target.scrollIntoView({ block: "nearest" });
  };

  const moreMenu = () =>
    popupActions([
      { label: t("review.comment"), run: () => props.onAnchor(fileAnchor()) },
      { label: t("review.openInEditor"), run: () => props.onOpen(null) },
      ...(props.onEditFile && props.file.status !== "deleted" ? [{ label: t("review.editFile"), run: () => props.onEditFile!(), separatorBefore: true }] : []),
    ]);
  const helpId = createUniqueId();
  const isAccepted = (index: number | null) => index !== null && !!props.accepted?.(index);

  // An accepted hunk closes rather than vanishes: its rows' height is read in the pure phase, before Solid takes them
  // out, and a row of that height stands in their place and shrinks to nothing over 160ms (nothing under reduced motion).
  const acceptedList = () => props.file.hunks.map((_, i) => isAccepted(i));
  const [folding, setFolding] = createSignal<Record<number, number>>({});
  const heightOf = (index: number) => (table ? [...table.querySelectorAll<HTMLElement>(`tr.dl[data-hunk="${index}"]`)].reduce((h, tr) => h + tr.getBoundingClientRect().height, 0) : 0);
  // The marks as last seen and the hunks just marked, with their heights, handed from the pure phase to the effect.
  let seen = acceptedList();
  let closing: Record<number, number> = {};
  createComputed(
    on(
      acceptedList,
      (now) => {
        closing = {};
        now.forEach((on, i) => {
          if (on && !seen[i]) closing[i] = heightOf(i);
        });
        seen = now;
      },
      { defer: true },
    ),
  );
  createEffect(
    on(
      acceptedList,
      () => {
        const add = Object.fromEntries(Object.entries(closing).filter(([, h]) => h > 0));
        closing = {};
        if (Object.keys(add).length) setFolding((f) => ({ ...f, ...add }));
      },
      { defer: true },
    ),
  );
  const unfold = (index: number) =>
    setFolding((f) => {
      const next = { ...f };
      delete next[index];
      return next;
    });
  /** The header row's two verbs for a hunk: accept (your mark) and, while the workspace is yours, undo (a change). */
  const HunkVerbs = (p: { index: number }) => (
    <>
      <Show when={props.onAccept}>
        <AcceptButton accepted={isAccepted(p.index)} lines={props.file.hunks[p.index]?.lines.length ?? 0} onClick={() => props.onAccept!(p.index)} />
      </Show>
      <Show when={props.onUndo && !isAccepted(p.index)}>
        <UndoButton onClick={() => props.onUndo!(p.index)} />
      </Show>
    </>
  );

  const cols = 4;
  return (
    <section class="file" aria-label={props.file.path} data-file-path={props.file.path}>
      <header class="file-head">
        <span class="file-status meta">{statusLabel(props.file.status)}</span>
        <span class="mono ellipsis grow" title={props.file.path}>
          <Show when={props.file.old_path}>
            <span class="t3">
              {props.file.old_path}
              <Icon name="arrow-right" size={10} class="arrow" />
            </span>
          </Show>
          {props.file.path}
        </span>
        <span class="num meta">
          <span class="diff-add">+{props.file.additions}</span> <span class="diff-del">−{props.file.deletions}</span>
        </span>
        {/* Two toggles and a menu: the header has a shape, not five equal words. Editing is in the menu until it is on. */}
        <Show when={props.editing}>
          <span class="meta t3">{t("review.editing")}</span>
        </Show>
        <Show when={expandable() && !props.editing}>
          <Button size="s" variant="ghost" aria-pressed={props.whole} onClick={props.onWhole} title={t("review.wholeFileTitle")}>
            <Icon name="expand" size={10} />
            {t("review.wholeFile")}
          </Button>
        </Show>
        {/* While you are editing, "viewed" waits: the file is about to change under its own hash. */}
        <Button size="s" variant="ghost" aria-pressed={props.viewed} disabled={props.editing} onClick={() => props.onViewed(!props.viewed)}>
          <Show when={props.viewed}>
            <Icon name="check" size={10} />
          </Show>
          {t("review.viewed")}
        </Button>
        <IconButton icon="ellipsis" size={24} label={t("review.fileMore")} aria-haspopup="menu" onClick={() => void moreMenu()} />
      </header>
      <Show when={composingAt(fileAnchor())}>
        <Composer initial={editingText()} onSubmit={props.onSave} onCancel={props.onCancel} />
      </Show>
      <For each={commentsAt(fileAnchor())}>
        {(x) => <CommentRow draft={x.c} onEdit={() => props.onEdit(x.index)} onRemove={() => props.onRemove(x.index)} />}
      </For>
      <Show when={props.editing && props.lines}>
        <FileEditor lines={props.lines!} onSave={(text) => props.onSaveFile?.(text)} onCancel={() => props.onCancelEdit?.()} />
      </Show>
      <Show when={!props.file.binary && !props.editing} fallback={<Show when={!props.editing}><div class="meta file-binary">{t("review.binary")}</div></Show>}>
        <span id={helpId} class="sr-only">
          {t("review.diffHelp")}
        </span>
        <table
          ref={table}
          class="diff"
          classList={{ "diff-split": props.split }}
          tabindex="0"
          aria-label={t("review.diffLabel", { path: props.file.path })}
          aria-describedby={helpId}
          onFocus={onTableFocus}
          onKeyDown={onTableKey}
        >
          <colgroup>
            <Show
              when={props.split}
              fallback={
                <>
                  <col class="col-ln" />
                  <col class="col-ln" />
                  <col class="col-gutter" />
                  <col />
                </>
              }
            >
              <col class="col-ln" />
              <col class="col-half" />
              <col class="col-ln" />
              <col class="col-half" />
            </Show>
          </colgroup>
          <tbody>
            <For each={blocks()}>
              {(b) => (
                <Switch>
                  <Match when={b.kind === "head" && b}>
                    {(hb) => (
                      <tr class="hunk-head" classList={{ "hunk-accepted": isAccepted(hb().index) }} data-hunk-path={props.file.path} data-hunk-index={hb().index}>
                        <td colspan={cols}>
                          <div class="gap-controls">
                            <span class="mono gap-header ellipsis">{hb().header}</span>
                            <HunkVerbs index={hb().index} />
                          </div>
                        </td>
                      </tr>
                    )}
                  </Match>
                  <Match when={b.kind === "gap" && b}>
                    {(gb) => (
                      <GapRow
                        block={gb()}
                        cols={cols}
                        path={props.file.path}
                        known={props.lines !== undefined}
                        accepted={isAccepted(gb().index)}
                        onReveal={(how) => props.onReveal(gb().gap, how)}
                        verbs={gb().index !== null ? <HunkVerbs index={gb().index!} /> : undefined}
                      />
                    )}
                  </Match>
                  {/* An accepted hunk is folded: its header row stands for it, with the mark and the count — once the fold has closed. */}
                  <Match when={b.kind === "hunk" && b.index !== null && folding()[b.index] !== undefined && b}>
                    {(hb) => <FoldRow height={folding()[hb().index!]} cols={cols} onDone={() => unfold(hb().index!)} />}
                  </Match>
                  <Match when={b.kind === "hunk" && !isAccepted(b.index) && b}>
                    {(hb) => (
                      <HunkRows
                        hunk={hb().hunk}
                        index={hb().index}
                        split={props.split}
                        path={props.file.path}
                        onOpen={props.onOpen}
                        onAnchor={props.onAnchor}
                        composingAt={composingAt}
                        editingText={editingText}
                        commentsAt={commentsAt}
                        onSave={props.onSave}
                        onCancel={props.onCancel}
                        onEdit={props.onEdit}
                        onRemove={props.onRemove}
                        onApplySuggestion={props.onApplySuggestion}
                      />
                    )}
                  </Match>
                </Switch>
              )}
            </For>
          </tbody>
        </table>
      </Show>
    </section>
  );
}

/**
 * The place of a hunk you just accepted, closing: a row as tall as the lines
 * were, told to shrink to nothing on the next frame (160ms, eased in like a
 * slot folding). Gone when the time is up; at once under reduced motion.
 */
function FoldRow(props: { height: number; cols: number; onDone: () => void }) {
  let inner!: HTMLDivElement;
  onMount(() => {
    const ms = baseMs();
    if (!ms) return queueMicrotask(props.onDone);
    // Laid out at its height first, then told to close, so the transition has somewhere to start from.
    const frame = requestAnimationFrame(() => (inner.style.height = "0px"));
    const timer = window.setTimeout(props.onDone, ms + 40);
    onCleanup(() => {
      cancelAnimationFrame(frame);
      clearTimeout(timer);
    });
  });
  return (
    <tr class="hunk-fold" aria-hidden="true">
      <td colspan={props.cols}>
        <div ref={inner} class="hunk-fold-inner" style={{ height: `${props.height}px` }} />
      </td>
    </tr>
  );
}

function UndoButton(props: { onClick: () => void }) {
  return (
    <Button size="s" variant="ghost" class="gap-all undo-hunk" onClick={props.onClick} title={`${t("review.undoHunkTitle")} · U`}>
      <Icon name="undo" size={10} />
      {t("review.undoHunk")}
    </Button>
  );
}

/**
 * Accepting a hunk is your reading mark, paired with U: the one folds the hunk
 * and moves on, the other changes the workspace. Accepted, the button says so
 * with the folded line count, and a second press takes the mark back.
 */
function AcceptButton(props: { accepted: boolean; lines: number; onClick: () => void }) {
  return (
    <Button
      size="s"
      variant="ghost"
      class="gap-all accept-hunk"
      classList={{ "accept-hunk-on": props.accepted }}
      aria-pressed={props.accepted}
      onClick={props.onClick}
      title={`${props.accepted ? t("review.unacceptHunkTitle") : t("review.acceptHunkTitle")} · A — ${t("review.acceptHunkNote")}`}
    >
      <Icon name="check" size={10} />
      {props.accepted ? t("review.hunkAccepted", { n: props.lines }) : t("review.acceptHunk")}
    </Button>
  );
}

/**
 * The whole file as plain text, for a small change you would rather make
 * than describe. Saving writes the file in the workspace as your edit; the
 * snapshot then changes and the review reloads.
 */
export function FileEditor(props: { lines: string[]; onSave: (text: string) => void; onCancel: () => void }) {
  const initial = props.lines.join("\n") + "\n";
  const [text, setText] = createSignal(initial);
  const dirty = () => text() !== initial;
  return (
    <div class="file-editor">
      <textarea
        class="file-editor-text mono"
        ref={(el) => setTimeout(() => el.focus())}
        rows={Math.min(40, Math.max(6, props.lines.length + 1))}
        spellcheck={false}
        aria-label={t("review.editFile")}
        value={text()}
        onInput={(e) => setText(e.currentTarget.value)}
        onKeyDown={(e) => {
          if ((e.metaKey || e.ctrlKey) && e.key === "Enter" && dirty()) (e.preventDefault(), props.onSave(text()));
          if (e.key === "Escape") (e.stopPropagation(), props.onCancel());
        }}
      />
      <div class="row file-editor-foot">
        <span class="meta t3">{t("review.editFileNote")}</span>
        <span class="grow" />
        <Button size="s" variant="ghost" onClick={props.onCancel}>
          {t("common.cancel")}
        </Button>
        <Button size="s" variant="primary" disabled={!dirty()} onClick={() => props.onSave(text())} kbd="mod+enter">
          {t("review.saveFile")}
        </Button>
      </div>
    </div>
  );
}

/**
 * A fold between hunks. ↓ grows the hunk above downwards (lines appear
 * above this row); ↑ grows the hunk below upwards (lines appear under it).
 */
export function GapRow(props: {
  block: Extract<Block, { kind: "gap" }>;
  cols: number;
  path?: string;
  known: boolean;
  /** The hunk under this fold is accepted (folded to this row). */
  accepted?: boolean;
  onReveal: (how: "top" | "bottom" | "all") => void;
  /** The verbs of the hunk whose header this row carries. */
  verbs?: JSX.Element;
}) {
  const gap = () => props.block.gap;
  const hasAbove = () => gap().index > 0;
  const hasBelow = () => props.block.header !== null;
  const hidden = () => props.block.hidden;
  const step = () => (hidden() === null ? STEP : Math.min(STEP, hidden()!));
  return (
    <tr class="hunk-head gap-row" classList={{ "hunk-accepted": !!props.accepted }} data-hunk-path={props.block.index !== null ? props.path : undefined} data-hunk-index={props.block.index ?? undefined}>
      <td colspan={props.cols}>
        <div class="gap-controls">
          <span class="gap-buttons">
            <Show when={hasAbove()}>
              <button class="gap-btn" onClick={() => props.onReveal("top")} title={t("review.expandAfter", { n: step() })} aria-label={t("review.expandAfter", { n: step() })}>
                <Icon name="arrow-down" size={10} />
              </button>
            </Show>
            <Show when={hasBelow()}>
              <button class="gap-btn" onClick={() => props.onReveal("bottom")} title={t("review.expandBefore", { n: step() })} aria-label={t("review.expandBefore", { n: step() })}>
                <Icon name="arrow-up" size={10} />
              </button>
            </Show>
          </span>
          <span class="mono gap-header ellipsis">{props.block.header ?? ""}</span>
          <span class="gap-count num">
            <Show when={hidden() !== null} fallback={props.known ? "" : t("review.restOfFile")}>
              {t("review.hiddenLines", { n: hidden()! })}
            </Show>
          </span>
          <Button size="s" variant="ghost" class="gap-all" onClick={() => props.onReveal("all")}>
            {t("review.showAll")}
          </Button>
          {props.verbs}
        </div>
      </td>
    </tr>
  );
}

/**
 * A draft comment. One with a ```suggestion block shows the proposed lines
 * as code and, while the workspace is editable and the comment hangs on a
 * line of the new file, offers to apply them in one click.
 */
export function CommentRow(props: { draft: Draft; onEdit: () => void; onRemove: () => void; onApply?: (line: number, suggestion: string) => void }) {
  const suggestion = () => suggestionOf(props.draft.text);
  const canApply = () => suggestion() !== null && !!props.onApply && !!props.draft.line && !props.draft.old;
  return (
    <div class="inline-comment" classList={{ "has-suggestion": suggestion() !== null }}>
      <Show when={props.draft.old}>
        <span class="anchor">{t("review.oldLine", { n: props.draft.old! })}</span>
      </Show>
      <span class="inline-comment-text">
        {suggestion() === null ? props.draft.text : withoutSuggestion(props.draft.text)}
        <Show when={suggestion() !== null}>
          <span class="suggestion-label meta t3">{t("review.suggestion")}</span>
          <pre class="suggestion mono">{suggestion()}</pre>
        </Show>
      </span>
      <Show when={canApply()}>
        <Button size="s" onClick={() => props.onApply!(props.draft.line!, suggestion()!)} title={t("review.applySuggestionTitle")}>
          {t("review.applySuggestion")}
        </Button>
      </Show>
      <Button size="s" variant="ghost" onClick={props.onEdit}>
        {t("common.edit")}
      </Button>
      <IconButton icon="cross" size={22} label={t("common.delete")} onClick={props.onRemove} />
    </div>
  );
}

type Piece = { s: string; hit: boolean; color?: string; italic: boolean };

/** Text split by word ranges, keeping syntax colours. */
function pieces(text: string, tokens: Tokens[number] | undefined, ranges: Range[] | undefined): Piece[] {
  const r = ranges ?? [];
  if (!tokens) return segment(text, 0, r).map(([s, hit]) => ({ s, hit, color: undefined, italic: false }));
  let offset = 0;
  const out: Piece[] = [];
  for (const [t, color, style] of tokens) {
    for (const [s, hit] of segment(t, offset, r)) out.push({ s, hit, color, italic: !!(style && style & 1) });
    offset += t.length;
  }
  return out;
}

function Code(props: { l: DiffLine; tokens?: Tokens[number]; ranges?: Range[]; sign?: boolean }) {
  const markClass = () => (props.l.kind === "add" ? "w-add" : "w-del");
  const sign = () => ({ add: "+", del: "−", context: " " })[props.l.kind];
  return (
    <>
      <Show when={props.sign !== false}>
        <span class="sign" aria-hidden="true">
          {sign()}
        </span>
      </Show>
      <For each={pieces(props.l.text, props.tokens, props.ranges)}>
        {(p) => (
          <span class={p.hit ? markClass() : undefined} style={{ color: p.color, "font-style": p.italic ? "italic" : undefined }}>
            {p.s}
          </span>
        )}
      </For>
    </>
  );
}

/**
 * One hunk. Old and new sides are highlighted separately (so a deleted line
 * is coloured in its own context), off the main thread. Rows are laid out at
 * once but keep their text invisible until the colours arrive (or 150ms pass),
 * so code never flashes from plain to coloured. Adjacent deleted and added
 * lines are compared word by word, and in the side-by-side layout sit next
 * to each other.
 */
export function HunkRows(props: {
  hunk: Hunk;
  /** The hunk's index in the file, on each row, so the fold can measure them; null for revealed context. */
  index?: number | null;
  split: boolean;
  path: string;
  onOpen: (n: number | null) => void;
  onAnchor: (a: Anchor) => void;
  composingAt: (a: Anchor) => boolean;
  editingText: () => string | undefined;
  commentsAt: (a: Anchor) => { c: Draft; index: number }[];
  onSave: (t: string) => void;
  onCancel: () => void;
  onEdit: (index: number) => void;
  onRemove: (index: number) => void;
  onApplySuggestion?: (line: number, suggestion: string) => void;
}) {
  const lang = languageOf(props.path);
  const words = createMemo(() => hunkWordRanges(props.hunk.lines));
  const [ready, setReady] = createSignal(!lang);
  const wait = lang ? window.setTimeout(() => setReady(true), COLOUR_WAIT_MS) : undefined;
  onCleanup(() => clearTimeout(wait));
  const [tokens] = createResource(
    () => props.hunk,
    async (h) => {
      if (!lang) return null;
      try {
        const newSide = h.lines.filter((l) => l.kind !== "del").map((l) => l.text).join("\n");
        const oldSide = h.lines.filter((l) => l.kind !== "add").map((l) => l.text).join("\n");
        const [n, o] = await Promise.all([highlight(lang, newSide), highlight(lang, oldSide)]);
        if (!n || !o) return null;
        let i = 0;
        let j = 0;
        return h.lines.map((l) => {
          if (l.kind === "add") return n[i++];
          if (l.kind === "del") return o[j++];
          j++;
          return n[i++];
        });
      } finally {
        setReady(true);
      }
    },
  );
  const anchorOf = (l: DiffLine): Anchor =>
    l.kind === "del" ? { path: props.path, line: null, old: l.old_no } : { path: props.path, line: l.new_no, old: null };
  const Attached = (p: { anchors: Anchor[] }) => (
    <>
      <For each={p.anchors}>
        {(a) => (
          <>
            <Show when={props.composingAt(a)}>
              <tr>
                <td colspan="4">
                  <Composer initial={props.editingText()} onSubmit={props.onSave} onCancel={props.onCancel} />
                </td>
              </tr>
            </Show>
            <For each={props.commentsAt(a)}>
              {(x) => (
                <tr>
                  <td colspan="4">
                    <CommentRow draft={x.c} onEdit={() => props.onEdit(x.index)} onRemove={() => props.onRemove(x.index)} onApply={props.onApplySuggestion} />
                  </td>
                </tr>
              )}
            </For>
          </>
        )}
      </For>
    </>
  );
  const click = (l: DiffLine) => (e: MouseEvent) => (e.metaKey ? props.onOpen(l.new_no ?? l.old_no) : props.onAnchor(anchorOf(l)));
  // A side the line does not exist on has no number and no button.
  const LineButton = (p: { l: DiffLine; n: number | null }) => (
    <Show when={p.n !== null}>
      <button class="ln-btn" onClick={click(p.l)} title={t("review.lineTitle")} aria-label={t("review.lineLabel", { n: p.n! })} tabindex="-1">
        {p.n}
      </button>
    </Show>
  );
  return (
    <Show
      when={props.split}
      fallback={
        <For each={props.hunk.lines}>
          {(l, idx) => (
            <>
              <tr class={`dl dl-${l.kind}`} classList={{ commented: props.commentsAt(anchorOf(l)).length > 0, "code-pending": !ready() }} data-hunk={props.index ?? undefined}>
                <td class="ln num">
                  <LineButton l={l} n={l.old_no} />
                </td>
                <td class="ln num">
                  <LineButton l={l} n={l.new_no} />
                </td>
                <td class="gutter">
                  <button class="gutter-btn" onClick={() => props.onAnchor(anchorOf(l))} aria-label={t("review.comment")} tabindex="-1">
                    <Icon name="plus" size={10} />
                  </button>
                </td>
                <td class="code mono">
                  <Code l={l} tokens={tokens()?.[idx()]} ranges={words().get(idx())} />
                </td>
              </tr>
              <Attached anchors={[anchorOf(l)]} />
            </>
          )}
        </For>
      }
    >
      <For each={splitRows(props.hunk.lines)}>
        {(row) => {
          const left = () => (row.left === null ? null : props.hunk.lines[row.left]);
          const right = () => (row.right === null ? null : props.hunk.lines[row.right]);
          const anchors = () => {
            const out: Anchor[] = [];
            const l = left();
            const r = right();
            if (l && l.kind === "del") out.push(anchorOf(l));
            if (r) out.push(anchorOf(r));
            return out;
          };
          const commented = () => anchors().some((a) => props.commentsAt(a).length > 0);
          return (
            <>
              <tr class="dl dl-split" classList={{ commented: commented(), "code-pending": !ready() }} data-hunk={props.index ?? undefined}>
                <td class="ln num" classList={{ "dl-del": left()?.kind === "del" }}>
                  <Show when={left()}>{(l) => <LineButton l={l()} n={l().old_no} />}</Show>
                </td>
                <td class="code mono" classList={{ "dl-del": left()?.kind === "del", "dl-blank": !left() }}>
                  <Show when={left()}>{(l) => <Code l={l()} tokens={tokens()?.[row.left!]} ranges={words().get(row.left!)} sign={false} />}</Show>
                </td>
                <td class="ln num" classList={{ "dl-add": right()?.kind === "add" }}>
                  <Show when={right()}>{(r) => <LineButton l={r()} n={r().new_no} />}</Show>
                </td>
                <td class="code mono" classList={{ "dl-add": right()?.kind === "add", "dl-blank": !right() }}>
                  <Show when={right()}>{(r) => <Code l={r()} tokens={tokens()?.[row.right!]} ranges={words().get(row.right!)} sign={false} />}</Show>
                </td>
              </tr>
              <Attached anchors={anchors()} />
            </>
          );
        }}
      </For>
    </Show>
  );
}

export function Composer(props: { initial?: string; onSubmit: (t: string) => void; onCancel: () => void }) {
  const [text, setText] = createSignal(props.initial ?? "");
  return (
    <div class="composer">
      <textarea
        ref={(el) => setTimeout(() => el.focus())}
        rows={2}
        aria-label={t("review.composerPlaceholder")}
        placeholder={t("review.composerPlaceholder")}
        value={text()}
        onInput={(e) => setText(e.currentTarget.value)}
        onKeyDown={(e) => {
          if ((e.metaKey || e.ctrlKey) && e.key === "Enter") (e.preventDefault(), props.onSubmit(text()));
          if (e.key === "Escape") (e.stopPropagation(), props.onCancel());
        }}
      />
      <div class="row">
        <span class="grow" />
        <Button size="s" variant="ghost" onClick={props.onCancel}>
          {t("common.cancel")}
        </Button>
        <Button size="s" variant="primary" disabled={!text().trim()} onClick={() => props.onSubmit(text())} kbd="mod+enter">
          {props.initial ? t("common.save") : t("review.addComment")}
        </Button>
      </div>
    </div>
  );
}
