/**
 * One file of the review: a sticky header with readings and toggles, AST
 * semantic noise collapse (`Moved unchanged` / `Formatting only`), and a
 * diff table that switches automatically to Split-Geometry virtualization
 * (`VirtualBody`) past 400 rows or whole-file expansion.
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
import { highlight, hunkSides, languageOf } from "../../lib/highlight";
import type { Tokens } from "../../lib/highlight.worker";
import { t } from "../../lib/i18n";
import { baseMs } from "../../lib/motion";
import { popupActions } from "../../lib/native";
import type { Draft } from "../../lib/reviewState";
import { suggestionOf, withoutSuggestion } from "../../lib/suggest";
import { VIRTUAL_THRESHOLD } from "../../lib/virtualDiff";
import { type Range, hunkWordRanges, segment } from "../../lib/worddiff";
import { type ExtDiffFile, type ExtHunk } from "../goal/ext";
import { type VRow, VirtualBody, flattenBlocks, lineAnchor } from "./VirtualBody";
import { type Anchor, type Block, type Composing, type Reveals, sameAnchor } from "./types";

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
  onUndo?: (hunk: number) => void;
  accepted?: (hunk: number) => boolean;
  onAccept?: (hunk: number) => void;
  current?: (hunk: number) => boolean;
  editing?: boolean;
  onEditFile?: () => void;
  onSaveFile?: (text: string) => void;
  onCancelEdit?: () => void;
  editDraft?: string | null;
  onEditDraft?: (text: string) => void;
  onApplySuggestion?: (line: number, suggestion: string) => void;
  /** Hunk indices marked by AST analysis as moved unchanged or formatting only. */
  movedHunks?: number[];
  formattingHunks?: number[];
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

  // AST semantic noise state: moved_unchanged & formatting_only hunks collapse by default, expandable per hunk.
  const [noiseExpanded, setNoiseExpanded] = createSignal<Record<number, boolean>>({});
  // A file the change adds or deletes is new or gone line for line: none of it is folded away as moved or reformatted,
  // whatever the hint says.
  const noiseOf = (index: number | null): "moved" | "formatting" | null => {
    if (index === null || props.file.status === "added" || props.file.status === "deleted") return null;
    const ef = props.file as ExtDiffFile;
    const eh = props.file.hunks[index] as ExtHunk | undefined;
    if (props.movedHunks?.includes(index) || ef.moved_hunks?.includes(index) || eh?.moved_unchanged) return "moved";
    if (props.formattingHunks?.includes(index) || ef.formatting_hunks?.includes(index) || eh?.formatting_only) return "formatting";
    return null;
  };
  const toggleNoise = (index: number) => setNoiseExpanded((m) => ({ ...m, [index]: !m[index] }));

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

  let table!: HTMLTableElement;
  const onTableFocus = (e: FocusEvent) => {
    if (e.target !== table) return;
    table.querySelector<HTMLElement>(".ln-btn")?.focus({ preventScroll: true });
  };
  const onTableKey = (e: KeyboardEvent) => {
    if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
    const btn = (e.target as HTMLElement).closest(".ln-btn");
    const td = btn?.closest("td");
    const trEl = td?.closest("tr");
    if (!btn || !td || !trEl) return;
    const col = [...trEl.children].indexOf(td);
    let row = e.key === "ArrowDown" ? trEl.nextElementSibling : trEl.previousElementSibling;
    while (row && !row.children[col]?.querySelector(".ln-btn")) row = e.key === "ArrowDown" ? row.nextElementSibling : row.previousElementSibling;
    const target = row?.children[col]?.querySelector<HTMLElement>(".ln-btn");
    if (!target) {
      if (virtualized()) {
        const pane = table.closest<HTMLElement>(".review-diff");
        if (pane) (e.preventDefault(), pane.scrollBy({ top: e.key === "ArrowDown" ? 120 : -120 }));
      }
      return;
    }
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
  const isCurrent = (index: number | null) => index !== null && !!props.current?.(index);

  const acceptedList = () => props.file.hunks.map((_, i) => isAccepted(i));
  const [folding, setFolding] = createSignal<Record<number, number>>({});
  const heightOf = (index: number) => (table ? [...table.querySelectorAll<HTMLElement>(`tr.dl[data-hunk="${index}"]`)].reduce((h, trEl) => h + trEl.getBoundingClientRect().height, 0) : 0);
  let seen = acceptedList();
  let closing: Record<number, number> = {};
  createComputed(
    on(
      acceptedList,
      (now) => {
        closing = {};
        now.forEach((onVal, i) => {
          if (onVal && !seen[i]) closing[i] = heightOf(i);
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

  const totalLineCount = createMemo(() =>
    blocks().reduce((n, b) => n + (b.kind === "hunk" ? b.hunk.lines.length : 1), 0),
  );
  const virtualized = createMemo(() => props.whole || totalLineCount() > VIRTUAL_THRESHOLD);
  const flatRows = createMemo(() =>
    virtualized()
      ? flattenBlocks({
          path: props.file.path,
          blocks: blocks(),
          split: props.split,
          comments: indexed(),
          composer: props.composer,
          isAccepted,
          folding: folding(),
          noiseOf,
          noiseExpanded: noiseExpanded(),
        })
      : [],
  );

  const HunkVerbs = (p: { index: number }) => (
    <>
      <Show when={noiseOf(p.index) && noiseExpanded()[p.index]}>
        <Button size="s" variant="ghost" class="gap-all" onClick={() => toggleNoise(p.index)}>{t("review.foldHunk")}</Button>
      </Show>
      <Show when={props.onAccept}>
        <AcceptButton accepted={isAccepted(p.index)} current={isCurrent(p.index)} lines={props.file.hunks[p.index]?.lines.length ?? 0} onClick={() => props.onAccept!(p.index)} />
      </Show>
      <Show when={props.onUndo && !isAccepted(p.index)}>
        <UndoButton onClick={() => props.onUndo!(p.index)} />
      </Show>
    </>
  );

  const renderHead = (index: number, header: string) => (
    <tr
      class="hunk-head"
      classList={{ "hunk-accepted": isAccepted(index), "hunk-current": isCurrent(index) }}
      aria-current={isCurrent(index) ? "true" : undefined}
      data-hunk-path={props.file.path}
      data-hunk-index={index}
    >
      <td colspan={cols}>
        <div class="gap-controls">
          <span class="mono gap-header ellipsis">{header}</span>
          <HunkVerbs index={index} />
        </div>
      </td>
    </tr>
  );

  const renderGap = (gb: Extract<Block, { kind: "gap" }>) => (
    <GapRow
      block={gb}
      cols={cols}
      path={props.file.path}
      known={props.lines !== undefined}
      accepted={isAccepted(gb.index)}
      current={isCurrent(gb.index)}
      onReveal={(how) => props.onReveal(gb.gap, how)}
      verbs={gb.index !== null ? <HunkVerbs index={gb.index} /> : undefined}
    />
  );

  const renderNoise = (index: number, noise: "moved" | "formatting", lineCount: number) => (
    <tr class="semantic-fold" data-semantic-noise={noise} data-hunk={index}>
      <td colspan={cols}>
        <div class="semantic-fold-bar">
          <span class="semantic-label"><Icon name="expand" size={10} />{noise === "moved" ? t("review.semanticMoved") : t("review.semanticFormatting")}</span>
          <span class="meta t3 num">{t("review.lines", { n: lineCount })}</span>
          <span class="grow" />
          <Button size="s" variant="ghost" onClick={() => toggleNoise(index)}>{t("review.expandHunk")}</Button>
        </div>
      </td>
    </tr>
  );

  const io = { path: () => props.file.path, onOpen: (n: number | null) => props.onOpen(n), onAnchor: (a: Anchor) => props.onAnchor(a) };
  const renderVRow = (row: VRow, idx: number): JSX.Element => {
    if (row.kind === "head") return renderHead(row.index, row.header);
    if (row.kind === "gap") return renderGap(row.block);
    if (row.kind === "folded") return renderNoise(row.index, row.noise, row.lines);
    if (row.kind === "fold") return <FoldRow height={row.height} cols={cols} onDone={() => unfold(row.index)} />;
    if (row.kind === "composer" || row.kind === "comment") {
      return (
        <tr data-vidx={idx} data-vmeasure="1">
          <td colspan={cols}>
            {row.kind === "composer" ? (
              <Composer initial={editingText()} onSubmit={props.onSave} onCancel={props.onCancel} />
            ) : (
              <CommentRow draft={row.draft} onEdit={() => props.onEdit(row.draftIndex)} onRemove={() => props.onRemove(row.draftIndex)} onApply={props.onApplySuggestion} />
            )}
          </td>
        </tr>
      );
    }
    return row.kind === "code"
      ? <UnifiedTr l={row.line} io={io} hunk={row.hunkIndex} commented={row.commented} vidx={idx} />
      : <SplitTr left={row.left} right={row.right} io={io} hunk={row.hunkIndex} commented={row.commented} vidx={idx} />;
  };

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
        <Show when={props.editing}>
          <span class="meta t3">{t("review.editing")}</span>
        </Show>
        <Show when={expandable() && !props.editing}>
          <Button size="s" variant="ghost" aria-pressed={props.whole} onClick={props.onWhole} title={t("review.wholeFileTitle")}>
            <Icon name="expand" size={10} />
            {t("review.wholeFile")}
          </Button>
        </Show>
        {/* Unmarked, it says what it does; marked, what is so. The words change, so no pressed state says it twice. */}
        <Button size="s" variant="ghost" class="file-viewed" disabled={props.editing} onClick={() => props.onViewed(!props.viewed)}>
          <Show when={props.viewed} fallback={t("review.keyViewed")}>
            <Icon name="check" size={10} />
            {t("review.viewed")}
          </Show>
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
        <FileEditor lines={props.lines!} draft={props.editDraft} onDraft={props.onEditDraft} onSave={(text) => props.onSaveFile?.(text)} onCancel={() => props.onCancelEdit?.()} />
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
          <Show
            when={virtualized()}
            fallback={
              <tbody>
                <For each={blocks()}>
                  {(b) => (
                    <Switch>
                      <Match when={b.kind === "head" && b}>{(hb) => renderHead(hb().index, hb().header)}</Match>
                      <Match when={b.kind === "gap" && b}>{(gb) => renderGap(gb())}</Match>
                      <Match when={b.kind === "hunk" && b.index !== null && folding()[b.index] !== undefined && b}>
                        {(hb) => <FoldRow height={folding()[hb().index!]} cols={cols} onDone={() => unfold(hb().index!)} />}
                      </Match>
                      <Match when={b.kind === "hunk" && !isAccepted(b.index) && noiseOf(b.index) && !noiseExpanded()[b.index!] && b}>
                        {(hb) => renderNoise(hb().index!, noiseOf(hb().index)!, hb().hunk.lines.length)}
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
            }
          >
            <VirtualBody path={props.file.path} rows={flatRows()} cols={cols} renderRow={renderVRow} />
          </Show>
        </table>
      </Show>
    </section>
  );
}

function FoldRow(props: { height: number; cols: number; onDone: () => void }) {
  let inner!: HTMLDivElement;
  onMount(() => {
    const ms = baseMs();
    if (!ms) return queueMicrotask(props.onDone);
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
    <Button size="s" variant="ghost" class="gap-all undo-hunk" onClick={props.onClick} title={`${t("review.undoHunkTitle")} (U)`}>
      <Icon name="undo" size={10} />
      {t("review.undoHunk")}
    </Button>
  );
}

function AcceptButton(props: { accepted: boolean; current: boolean; lines: number; onClick: () => void }) {
  return (
    <Button
      size="s"
      variant="ghost"
      class="gap-all accept-hunk"
      classList={{ "accept-hunk-on": props.accepted }}
      aria-pressed={props.accepted}
      onClick={props.onClick}
      kbd={props.current ? (props.accepted ? "shift+a" : "a") : undefined}
      title={`${props.accepted ? `${t("review.unacceptHunkTitle")} (⇧A)` : `${t("review.acceptHunkTitle")} (A)`} — ${t("review.acceptHunkNote")}`}
    >
      <Icon name="check" size={10} />
      {props.accepted ? t("review.hunkAccepted", { n: props.lines }) : t("review.acceptHunk")}
    </Button>
  );
}

/** `draft` is what was typed before the row was rebuilt (a refetch brings new file objects); `onDraft` keeps it. */
export function FileEditor(props: { lines: string[]; draft?: string | null; onDraft?: (text: string) => void; onSave: (text: string) => void; onCancel: () => void }) {
  const initial = props.lines.join("\n") + "\n";
  const [text, setText] = createSignal(props.draft ?? initial);
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
        onInput={(e) => (setText(e.currentTarget.value), props.onDraft?.(e.currentTarget.value))}
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

export function GapRow(props: {
  block: Extract<Block, { kind: "gap" }>;
  cols: number;
  path?: string;
  known: boolean;
  accepted?: boolean;
  current?: boolean;
  onReveal: (how: "top" | "bottom" | "all") => void;
  verbs?: JSX.Element;
}) {
  const gap = () => props.block.gap;
  const hasAbove = () => gap().index > 0;
  const hasBelow = () => props.block.header !== null;
  const hidden = () => props.block.hidden;
  const step = () => (hidden() === null ? STEP : Math.min(STEP, hidden()!));
  return (
    <tr
      class="hunk-head gap-row"
      classList={{ "hunk-accepted": !!props.accepted, "hunk-current": !!props.current }}
      aria-current={props.current ? "true" : undefined}
      data-hunk-path={props.block.index !== null ? props.path : undefined}
      data-hunk-index={props.block.index ?? undefined}
    >
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

function pieces(text: string, tokens: Tokens[number] | undefined, ranges: Range[] | undefined): Piece[] {
  const r = ranges ?? [];
  if (!tokens) return segment(text, 0, r).map(([s, hit]) => ({ s, hit, color: undefined, italic: false }));
  let offset = 0;
  const out: Piece[] = [];
  for (const [tok, color, style] of tokens) {
    for (const [s, hit] of segment(tok, offset, r)) out.push({ s, hit, color, italic: !!(style && style & 1) });
    offset += tok.length;
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

type LineIo = { path: () => string; onOpen: (n: number | null) => void; onAnchor: (a: Anchor) => void };

function LineBtn(p: { l: DiffLine | null; n: number | null; io: LineIo }) {
  return (
    <Show when={p.l && p.n !== null}>
      <button class="ln-btn" onClick={(e) => (e.metaKey ? p.io.onOpen(p.l!.new_no ?? p.l!.old_no) : p.io.onAnchor(lineAnchor(p.io.path(), p.l!)))} title={t("review.lineTitle")} aria-label={t("review.lineLabel", { n: p.n! })} tabindex="-1">{p.n}</button>
    </Show>
  );
}

function UnifiedTr(p: { l: DiffLine; io: LineIo; hunk?: number | null; commented: boolean; late?: boolean; vidx?: number; tokens?: Tokens[number]; ranges?: Range[] }) {
  return (
    <tr class={`dl dl-${p.l.kind}`} classList={{ commented: p.commented, "code-late": !!p.late }} data-hunk={p.hunk ?? undefined} data-vidx={p.vidx}>
      <td class="ln num"><LineBtn l={p.l} n={p.l.old_no} io={p.io} /></td>
      <td class="ln num"><LineBtn l={p.l} n={p.l.new_no} io={p.io} /></td>
      <td class="gutter"><button class="gutter-btn" onClick={() => p.io.onAnchor(lineAnchor(p.io.path(), p.l))} aria-label={t("review.comment")} tabindex="-1"><Icon name="plus" size={10} /></button></td>
      <td class="code mono"><Code l={p.l} tokens={p.tokens} ranges={p.ranges} /></td>
    </tr>
  );
}

function SplitTr(p: { left: DiffLine | null; right: DiffLine | null; io: LineIo; hunk?: number | null; commented: boolean; late?: boolean; vidx?: number; lTokens?: Tokens[number]; lRanges?: Range[]; rTokens?: Tokens[number]; rRanges?: Range[] }) {
  return (
    <tr class="dl dl-split" classList={{ commented: p.commented, "code-late": !!p.late }} data-hunk={p.hunk ?? undefined} data-vidx={p.vidx}>
      <td class="ln num" classList={{ "dl-del": p.left?.kind === "del" }}><LineBtn l={p.left} n={p.left?.old_no ?? null} io={p.io} /></td>
      <td class="code mono" classList={{ "dl-del": p.left?.kind === "del", "dl-blank": !p.left }}><Show when={p.left}>{(l) => <Code l={l()} tokens={p.lTokens} ranges={p.lRanges} sign={false} />}</Show></td>
      <td class="ln num" classList={{ "dl-add": p.right?.kind === "add" }}><LineBtn l={p.right} n={p.right?.new_no ?? null} io={p.io} /></td>
      <td class="code mono" classList={{ "dl-add": p.right?.kind === "add", "dl-blank": !p.right }}><Show when={p.right}>{(r) => <Code l={r()} tokens={p.rTokens} ranges={p.rRanges} sign={false} />}</Show></td>
    </tr>
  );
}

export function HunkRows(props: {
  hunk: Hunk;
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
  // The code shows at once, in the plain foreground; its colours tint in when the worker sends them (120ms), so the
  // first frame is never line numbers without their code.
  const late = () => !!lang;
  const [tokens] = createResource(
    () => props.hunk,
    async (h) => {
      if (!lang) return null;
      try {
        const { newSide, oldSide } = hunkSides(h.lines);
        const [n, o] = await Promise.all([highlight(lang, newSide), highlight(lang, oldSide)]);
        if (!n || !o) return null;
        let i = 0, j = 0;
        return h.lines.map((l) => (l.kind === "add" ? n[i++] : l.kind === "del" ? o[j++] : (j++, n[i++])));
      } catch {
        return null;
      }
    },
  );
  const io: LineIo = { path: () => props.path, onOpen: (n) => props.onOpen(n), onAnchor: (a) => props.onAnchor(a) };
  const aOf = (l: DiffLine) => lineAnchor(props.path, l);
  const Attached = (p: { anchors: Anchor[] }) => (
    <For each={p.anchors}>
      {(a) => (
        <>
          <Show when={props.composingAt(a)}>
            <tr><td colspan="4"><Composer initial={props.editingText()} onSubmit={props.onSave} onCancel={props.onCancel} /></td></tr>
          </Show>
          <For each={props.commentsAt(a)}>
            {(x) => (
              <tr><td colspan="4"><CommentRow draft={x.c} onEdit={() => props.onEdit(x.index)} onRemove={() => props.onRemove(x.index)} onApply={props.onApplySuggestion} /></td></tr>
            )}
          </For>
        </>
      )}
    </For>
  );
  return (
    <Show
      when={props.split}
      fallback={
        <For each={props.hunk.lines}>
          {(l, idx) => (
            <>
              <UnifiedTr l={l} io={io} hunk={props.index} commented={props.commentsAt(aOf(l)).length > 0} late={late()} tokens={tokens()?.[idx()]} ranges={words().get(idx())} />
              <Attached anchors={[aOf(l)]} />
            </>
          )}
        </For>
      }
    >
      <For each={splitRows(props.hunk.lines)}>
        {(row) => {
          const left = () => (row.left === null ? null : props.hunk.lines[row.left]);
          const right = () => (row.right === null ? null : props.hunk.lines[row.right]);
          const anchors = () => [...(left()?.kind === "del" ? [aOf(left()!)] : []), ...(right() ? [aOf(right()!)] : [])];
          return (
            <>
              <SplitTr left={left()} right={right()} io={io} hunk={props.index} commented={anchors().some((a) => props.commentsAt(a).length > 0)} late={late()} lTokens={row.left !== null ? tokens()?.[row.left] : undefined} lRanges={row.left !== null ? words().get(row.left) : undefined} rTokens={row.right !== null ? tokens()?.[row.right] : undefined} rRanges={row.right !== null ? words().get(row.right) : undefined} />
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
