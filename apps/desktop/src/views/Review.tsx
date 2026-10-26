/**
 * Review (docs/04 §4.6): full-screen, risk-ordered review units of at most
 * ~300 lines. A comment on a line is a steering instruction; "request changes"
 * sends them all back to the agent. Accepting writes a local branch, never a push.
 */
import { For, Show, createEffect, createMemo, createResource, createSignal, on } from "solid-js";

import type { Hunk } from "../gen/Hunk";
import { highlight, languageOf } from "../lib/highlight";
import type { Tokens } from "../lib/highlight.worker";

import { DangerMark, Icon, NoticeMark, Seal } from "../components/Glyph";
import { CriteriaBar } from "../components/Honesty";
import { Button, Empty, IconButton, Kbd, Loading, Overlay } from "../components/ui";
import type { DiffFile } from "../gen/DiffFile";
import type { DiffLine } from "../gen/DiffLine";
import type { ReviewComment } from "../gen/ReviewComment";
import type { ReviewUnit } from "../gen/ReviewUnit";
import { api } from "../lib/api";
import { count, short } from "../lib/format";
import { t } from "../lib/i18n";
import { useKeys } from "../lib/keys";
import { back } from "../lib/nav";
import { type Draft, type ReviewState, fileHash, loadReviewState, persist } from "../lib/reviewState";
import { hunkWordRanges, segment, type Range } from "../lib/worddiff";
import { act, state } from "../lib/store";

/** Where a comment hangs: a new-side line, an old-side (deleted) line, or the file. */
type Anchor = { path: string; line: number | null; old?: number | null };

const sameAnchor = (a: Anchor, b: Anchor) => a.path === b.path && (a.line ?? null) === (b.line ?? null) && (a.old ?? null) === (b.old ?? null);

/** What the agent receives: deleted-line comments name the old line explicitly. */
function toComment(d: Draft): ReviewComment {
  if (d.old) return { path: d.path, line: null, text: `old L${d.old} (deleted): ${d.text}` };
  return { path: d.path, line: d.line, text: d.text };
}

export function Review(props: { id: string }) {
  const [persisted] = createResource<ReviewState>(() => loadReviewState(props.id));
  // Scope: the whole change, or only what changed since you last reviewed.
  const previous = () => persisted()?.reviewed ?? null;
  const [sinceLast, setSinceLast] = createSignal(false);
  const [view] = createResource(
    () => (persisted.loading ? null : { id: props.id, since: sinceLast() ? previous() : null }),
    (k) => (k ? api.review(k.id, k.since) : Promise.reject(new Error("loading"))),
  );
  const [detail, { refetch: refetchDetail }] = createResource(() => props.id, api.goal);
  const [unitIdx, setUnitIdx] = createSignal(0);
  const [seen, setSeen] = createSignal<Set<string>>(new Set());
  const [viewedMap, setViewedMap] = createSignal<Record<string, string>>({});
  const [comments, setComments] = createSignal<Draft[]>([]);
  createEffect(
    on(persisted, (p) => {
      if (!p) return;
      setViewedMap(p.viewed);
      setComments(p.drafts);
    }),
  );
  const isViewed = (f: DiffFile) => viewedMap()[f.path] === fileHash(f);
  const toggleViewed = (f: DiffFile, on = !isViewed(f)) => {
    const v = { ...viewedMap() };
    if (on) v[f.path] = fileHash(f);
    else delete v[f.path];
    setViewedMap(v);
    persist.viewed(props.id, v);
  };
  const unitViewed = (u: ReviewUnit) => {
    const v = view();
    return !!v && v.files.filter((f) => u.files.includes(f.path)).every(isViewed);
  };
  // Draft comments survive a restart until they are sent.
  const updateComments = (fn: (list: Draft[]) => Draft[]) => {
    const next = fn(comments());
    setComments(next);
    persist.drafts(props.id, next);
  };
  const markReviewed = () => {
    const v = view();
    if (v) persist.reviewed(props.id, v.pin);
    persist.drafts(props.id, []);
  };
  const [composer, setComposer] = createSignal<(Anchor & { editing?: number }) | null>(null);
  const [panel, setPanel] = createSignal<"accept" | "changes" | null>(null);
  const g = () => state.goals[props.id];

  const units = () => view()?.units ?? [];
  const unit = () => units()[unitIdx()];
  const files = createMemo(() => {
    const u = unit();
    const v = view();
    if (!u || !v) return [];
    return v.files.filter((f) => u.files.includes(f.path));
  });
  // A unit counts as looked at once it has been on screen.
  createEffect(() => {
    const u = unit();
    if (u) setSeen((s) => (s.has(u.id) ? s : new Set(s).add(u.id)));
  });

  const selectUnit = (i: number) => {
    setUnitIdx(Math.max(0, Math.min(units().length - 1, i)));
    document.querySelector(".review-diff")?.scrollTo({ top: 0 });
  };

  /** Scrolls to the next or previous hunk in the diff pane. */
  const jumpHunk = (dir: 1 | -1) => {
    const pane = document.querySelector<HTMLElement>(".review-diff");
    if (!pane) return;
    const heads = [...pane.querySelectorAll<HTMLElement>(".hunk-head")];
    const top = pane.scrollTop + 48;
    const target = dir > 0 ? heads.find((h) => h.offsetTop > top + 4) : [...heads].reverse().find((h) => h.offsetTop < top - 4);
    if (target) pane.scrollTo({ top: target.offsetTop - 40 });
  };

  useKeys([
    { key: "j", run: () => selectUnit(unitIdx() + 1) },
    { key: "k", run: () => selectUnit(unitIdx() - 1) },
    { key: "]", run: () => jumpHunk(1) },
    { key: "[", run: () => jumpHunk(-1) },
    {
      key: "v",
      run: () => {
        files().forEach((f) => toggleViewed(f, true));
        selectUnit(unitIdx() + 1);
      },
    },
    { key: "mod+shift+enter", run: () => setPanel("accept"), inInputs: true },
    { key: "c", run: () => setPanel("changes") },
    { key: "escape", run: () => (panel() ? setPanel(null) : composer() ? setComposer(null) : back()) },
  ]);

  const saveComment = (text: string) => {
    const c = composer();
    if (!c || !text.trim()) return;
    if (c.editing !== undefined) updateComments((list) => list.map((d, i) => (i === c.editing ? { ...d, text: text.trim() } : d)));
    else updateComments((list) => [...list, { path: c.path, line: c.line, old: c.old ?? null, text: text.trim() }]);
    setComposer(null);
  };
  const editComment = (index: number) => {
    const d = comments()[index];
    setComposer({ path: d.path, line: d.line, old: d.old ?? null, editing: index });
  };
  const removeComment = (index: number) => updateComments((list) => list.filter((_, i) => i !== index));

  const solo = () => units().length === 1;
  const unviewedUnits = () => units().filter((u) => !unitViewed(u)).length;

  return (
    <div class="review">
      <header class="review-head" data-tauri-drag-region>
        <IconButton icon="chevron-left" label={t("common.back")} onClick={back} />
        <div class="review-head-text" data-tauri-drag-region>
          <div class="row">
            <h1 class="review-title ellipsis">{g()?.title}</h1>
            <span class="code-val t2">{props.id}</span>
          </div>
          <Show when={view()}>
            <div class="review-stats meta halt">
              <span class="review-stat-group num">
                <span>
                  <span class="t1">+{count(view()!.stat.additions)}</span> −{count(view()!.stat.deletions)}
                </span>
                <span class="sep">·</span>
                {t("common.files", { n: view()!.stat.files })}
                <Show when={!solo()}>
                  <span class="sep">·</span>
                  {t("review.units", { n: units().length })}
                </Show>
                <span class="sep">·</span>
                <span class="code-val">
                  @{short(view()!.from)} → @{short(view()!.pin)}
                </span>
              </span>
              <Show when={previous() && previous() !== view()!.pin}>
                <span class="scope-switch">
                  <button class="tab" classList={{ active: !sinceLast() }} onClick={() => setSinceLast(false)}>
                    {t("review.allChanges")}
                  </button>
                  <button class="tab" classList={{ active: sinceLast() }} onClick={() => setSinceLast(true)}>
                    {t("review.sinceLast")}
                  </button>
                </span>
              </Show>
              <Show when={g()}>
                <span class="review-stat-group">
                  <Seal pin={g()!.verified_pin} />
                  <Show when={g()!.verified_pin}>
                    <span class="sep">·</span>
                  </Show>
                  <CriteriaBar progress={g()!.progress} compact />
                </span>
              </Show>
            </div>
          </Show>
        </div>
        <Button onClick={() => setPanel("changes")} kbd="c">
          {t("review.requestChanges")}
          {comments().length ? t("review.commentCount", { n: comments().length }) : ""}
        </Button>
        <Show when={g()?.state === "in_review"}>
          <Button variant="primary" onClick={() => setPanel("accept")} kbd="mod+shift+enter">
            {t("review.accept")}
          </Button>
        </Show>
      </header>

      <Show when={!view.loading && !persisted.loading} fallback={<div class="page-loading"><Loading /></div>}>
        <Show when={!view.error} fallback={<Empty title={t("review.loadFailed")}>{String(view.error)}</Empty>}>
          <Show when={units().length > 0} fallback={<Empty title={t("review.noChanges")}>{t("review.noChangesBody")}</Empty>}>
            <div class="review-body" classList={{ solo: solo() }}>
              <Show when={!solo()}>
                <aside class="review-units">
                  <For each={units()}>
                    {(u, i) => (
                      <UnitItem u={u} active={i() === unitIdx()} seen={seen().has(u.id)} viewed={unitViewed(u)} onClick={() => selectUnit(i())} />
                    )}
                  </For>
                </aside>
              </Show>
              <div class="review-diff">
                <Show when={detail()?.sentinels.length}>
                  <div class="sentinel-banner">
                    <For each={detail()!.sentinels}>
                      {(h) => (
                        <span class="risk-reason">
                          <Show when={h.severity >= 3} fallback={<NoticeMark />}>
                            <DangerMark />
                          </Show>
                          {t("review.sentinel", { title: h.title })}
                        </span>
                      )}
                    </For>
                  </div>
                </Show>
                <Show when={unit()?.risk_reasons.length}>
                  <div class="risk-banner">
                    <For each={unit()!.risk_reasons}>
                      {(r) => (
                        <span class="risk-reason">
                          <NoticeMark />
                          {r}
                        </span>
                      )}
                    </For>
                  </div>
                </Show>
                <For each={files()}>
                  {(f) => (
                    <FileDiff
                      file={f}
                      viewed={isViewed(f)}
                      onViewed={(on) => toggleViewed(f, on)}
                      onOpen={(line) => void act(() => api.openFile(props.id, f.path, line))}
                      comments={comments()}
                      composer={composer()}
                      onAnchor={(a) => setComposer(a)}
                      onSave={saveComment}
                      onCancel={() => setComposer(null)}
                      onEdit={editComment}
                      onRemove={removeComment}
                    />
                  )}
                </For>
              </div>
            </div>
          </Show>
        </Show>
      </Show>

      <div class="review-status halt">
        <span>
          <Kbd k="j" />
          <Kbd k="k" /> {t("review.keyUnits")}
        </span>
        <span>
          <Kbd k="]" />
          <Kbd k="[" /> {t("review.keyHunks")}
        </span>
        <span>
          <Kbd k="v" /> {t("review.keyViewed")}
        </span>
        <span>{t("review.keyComment")}</span>
        <span>{t("review.keyOpen")}</span>
        <span class="grow" />
        <Show when={units().length > 1}>
          <span class="num">{t("review.unitOf", { i: unitIdx() + 1, n: units().length })}</span>
        </Show>
      </div>

      <Show when={panel() === "accept"}>
        <AcceptPanel
          id={props.id}
          seen={seen().size}
          total={units().length}
          unviewed={unviewedUnits()}
          detail={detail()}
          onHumanCheck={async (cid, v) => {
            await act(() => api.humanCheck(props.id, cid, v));
            await refetchDetail();
          }}
          onClose={() => setPanel(null)}
          onDone={markReviewed}
        />
      </Show>
      <Show when={panel() === "changes"}>
        <ChangesPanel id={props.id} comments={comments()} onSent={markReviewed} onClose={() => setPanel(null)} onRemove={removeComment} />
      </Show>
    </div>
  );
}

/** One line: file name, dim directory, line count; risk bars only when present. */
function UnitItem(props: { u: ReviewUnit; active: boolean; seen: boolean; viewed: boolean; onClick: () => void }) {
  const first = () => props.u.files[0] ?? props.u.title;
  const name = () => first().split("/").pop() ?? first();
  const dir = () => {
    const parts = first().split("/");
    return parts.length > 1 ? parts.slice(0, -1).join("/") + "/" : "";
  };
  const more = () => props.u.files.length - 1;
  return (
    <button class="unit" classList={{ active: props.active }} onClick={props.onClick} title={props.u.files.join("\n")}>
      <span class="unit-name">
        {name()}
        <Show when={more() > 0}> +{more()}</Show> <span class="unit-dir">{dir()}</span>
      </span>
      <span class="unit-lines num">{t("review.lines", { n: props.u.lines })}</span>
      <span class="unit-flags">
        <Show when={props.u.risk >= 2}>
          <span class="unit-risk" aria-label={t("review.risk", { n: props.u.risk })}>
            <i />
            <Show when={props.u.risk >= 3}>
              <i />
            </Show>
          </span>
        </Show>
        <Show when={props.viewed}>
          <Icon name="check" size={10} label={t("review.viewed")} />
        </Show>
        <Show when={!props.viewed && props.seen}>
          <Icon name="dot" size={10} label={t("review.seenMaybeChanged")} />
        </Show>
      </span>
    </button>
  );
}

function FileDiff(props: {
  file: DiffFile;
  viewed: boolean;
  onViewed: (on: boolean) => void;
  onOpen: (line: number | null) => void;
  comments: Draft[];
  composer: (Anchor & { editing?: number }) | null;
  onAnchor: (a: Anchor) => void;
  onSave: (text: string) => void;
  onCancel: () => void;
  onEdit: (index: number) => void;
  onRemove: (index: number) => void;
}) {
  const statusLabel = (s: DiffFile["status"]) => t(`review.${s}`);
  const fileAnchor = (): Anchor => ({ path: props.file.path, line: null, old: null });
  const indexed = () => props.comments.map((c, index) => ({ c, index })).filter((x) => x.c.path === props.file.path);
  const commentsAt = (a: Anchor) => indexed().filter((x) => sameAnchor(x.c, a));
  const composingAt = (a: Anchor) => !!props.composer && sameAnchor(props.composer, a);
  const editingText = () => (props.composer?.editing !== undefined ? props.comments[props.composer.editing]?.text : "");
  return (
    <section class="file">
      <header class="file-head">
        <span class="file-status meta">{statusLabel(props.file.status)}</span>
        <span class="mono ellipsis grow">
          <Show when={props.file.old_path}>
            <span class="t3">{props.file.old_path} → </span>
          </Show>
          {props.file.path}
        </span>
        <span class="num meta">
          <span class="diff-add">+{props.file.additions}</span> <span class="diff-del">−{props.file.deletions}</span>
        </span>
        <Button size="s" variant="ghost" onClick={() => props.onAnchor(fileAnchor())}>
          {t("review.comment")}
        </Button>
        <Button size="s" variant="ghost" onClick={() => props.onOpen(null)}>
          {t("review.openInEditor")}
        </Button>
        <Button size="s" variant="ghost" aria-pressed={props.viewed} onClick={() => props.onViewed(!props.viewed)}>
          <Show when={props.viewed}>
            <Icon name="check" size={10} />
          </Show>
          {t("review.viewed")}
        </Button>
      </header>
      <Show when={composingAt(fileAnchor())}>
        <Composer initial={editingText()} onSubmit={props.onSave} onCancel={props.onCancel} />
      </Show>
      <For each={commentsAt(fileAnchor())}>
        {(x) => <CommentRow draft={x.c} onEdit={() => props.onEdit(x.index)} onRemove={() => props.onRemove(x.index)} />}
      </For>
      <Show when={!props.file.binary} fallback={<div class="meta file-binary">{t("review.binary")}</div>}>
        <table class="diff">
          <colgroup>
            <col class="col-ln" />
            <col class="col-ln" />
            <col class="col-gutter" />
            <col />
          </colgroup>
          <tbody>
            <For each={props.file.hunks}>
              {(h) => (
                <>
                  <tr class="hunk-head">
                    <td colspan="4" class="mono">
                      {h.header}
                    </td>
                  </tr>
                  <HunkRows
                    hunk={h}
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
                  />
                </>
              )}
            </For>
          </tbody>
        </table>
      </Show>
    </section>
  );
}

function CommentRow(props: { draft: Draft; onEdit: () => void; onRemove: () => void }) {
  return (
    <div class="inline-comment">
      <Show when={props.draft.old}>
        <span class="anchor">{t("review.oldLine", { n: props.draft.old! })}</span>
      </Show>
      <span class="inline-comment-text">{props.draft.text}</span>
      <Button size="s" variant="ghost" onClick={props.onEdit}>
        {t("common.edit")}
      </Button>
      <IconButton icon="cross" size={22} label={t("common.delete")} onClick={props.onRemove} />
    </div>
  );
}

/**
 * One hunk. Old and new sides are highlighted separately (so a deleted line
 * is coloured in its own context), off the main thread; rows render as
 * plain text first and pick up colour when tokens arrive. Adjacent deleted
 * and added lines are compared word by word.
 */
function HunkRows(props: {
  hunk: Hunk;
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
}) {
  const lang = languageOf(props.path);
  const words = createMemo(() => hunkWordRanges(props.hunk.lines));
  const [tokens] = createResource(
    () => props.hunk,
    async (h) => {
      if (!lang) return null;
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
    },
  );
  const anchorOf = (l: DiffLine): Anchor =>
    l.kind === "del" ? { path: props.path, line: null, old: l.old_no } : { path: props.path, line: l.new_no, old: null };
  return (
    <For each={props.hunk.lines}>
      {(l, idx) => {
        const a = anchorOf(l);
        return (
          <>
            <DiffRow
              l={l}
              tokens={tokens()?.[idx()]}
              ranges={words().get(idx())}
              onOpen={props.onOpen}
              onAnchor={() => props.onAnchor(a)}
              hasComment={props.commentsAt(a).length > 0}
            />
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
                    <CommentRow draft={x.c} onEdit={() => props.onEdit(x.index)} onRemove={() => props.onRemove(x.index)} />
                  </td>
                </tr>
              )}
            </For>
          </>
        );
      }}
    </For>
  );
}

function DiffRow(props: {
  l: DiffLine;
  tokens?: Tokens[number];
  ranges?: Range[];
  onOpen: (n: number | null) => void;
  onAnchor: () => void;
  hasComment: boolean;
}) {
  const sign = { add: "+", del: "−", context: " " }[props.l.kind];
  const markClass = props.l.kind === "add" ? "w-add" : "w-del";
  const click = (e: MouseEvent) => (e.metaKey ? props.onOpen(props.l.new_no ?? props.l.old_no) : props.onAnchor());
  /** Text split by word ranges, keeping syntax colours. */
  const pieces = () => {
    const r = props.ranges;
    if (!props.tokens) return segment(props.l.text, 0, r ?? []).map(([s, hit]) => ({ s, hit, color: undefined as string | undefined, italic: false }));
    let offset = 0;
    const out: { s: string; hit: boolean; color?: string; italic: boolean }[] = [];
    for (const [text, color, style] of props.tokens) {
      for (const [s, hit] of segment(text, offset, r ?? [])) out.push({ s, hit, color, italic: !!(style && style & 1) });
      offset += text.length;
    }
    return out;
  };
  return (
    <tr class={`dl dl-${props.l.kind}`} classList={{ commented: props.hasComment }}>
      <td class="ln num ln-click" onClick={click} title={t("review.lineTitle")}>
        {props.l.old_no ?? ""}
      </td>
      <td class="ln num ln-click" onClick={click} title={t("review.lineTitle")}>
        {props.l.new_no ?? ""}
      </td>
      <td class="gutter">
        <button class="gutter-btn" onClick={props.onAnchor} aria-label={t("review.comment")} tabindex="-1">
          <Icon name="plus" size={10} />
        </button>
      </td>
      <td class="code mono">
        <span class="sign">{sign}</span>
        <For each={pieces()}>
          {(p) => (
            <span class={p.hit ? markClass : undefined} style={{ color: p.color, "font-style": p.italic ? "italic" : undefined }}>
              {p.s}
            </span>
          )}
        </For>
      </td>
    </tr>
  );
}

function Composer(props: { initial?: string; onSubmit: (t: string) => void; onCancel: () => void }) {
  const [text, setText] = createSignal(props.initial ?? "");
  return (
    <div class="composer">
      <textarea
        ref={(el) => setTimeout(() => el.focus())}
        rows={2}
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

function AcceptPanel(props: {
  id: string;
  seen: number;
  total: number;
  unviewed: number;
  detail: Awaited<ReturnType<typeof api.goal>> | undefined;
  onHumanCheck: (criterion: string, v: boolean) => void;
  onClose: () => void;
  onDone: () => void;
}) {
  const [busy, setBusy] = createSignal(false);
  const g = () => state.goals[props.id];
  const humans = () => props.detail?.criteria.filter((c) => c.criterion.kind.type === "human") ?? [];
  const blockers = () => {
    const b: string[] = [];
    if (g()?.state !== "in_review") b.push(t("review.notInReview"));
    for (const h of humans()) if (!h.human_checked) b.push(t("review.humanUnchecked", { id: h.criterion.id }));
    return b;
  };
  /** Still open, not blocking: you may accept, but you see them first. */
  const open = () => {
    const items: { danger?: boolean; text: string }[] = [];
    for (const c of props.detail?.claims ?? []) if (c.kind === "assumption" && c.approved === null) items.push({ text: t("review.openAssumption", { text: c.text }) });
    for (const h of props.detail?.sentinels ?? []) items.push({ danger: h.severity >= 3, text: t("review.openSentinel", { title: h.title }) });
    if (props.unviewed > 0) items.push({ text: t("review.openUnviewed", { n: props.unviewed }) });
    return items;
  };
  const accept = async () => {
    setBusy(true);
    const branch = await act(() => api.accept(props.id));
    setBusy(false);
    if (branch) {
      props.onDone();
      props.onClose();
      back();
    }
  };
  return (
    <Overlay onClose={props.onClose} label={t("review.acceptTitle", { id: props.id })} instant>
      <h2 class="panel-title">{t("review.acceptTitle", { id: props.id })}</h2>
      <div class="panel-section">
        <div class="fact-row">
          <Show when={g()?.progress.machine} fallback={<span class="meta">{t("review.noMachine")}</span>}>
            <Seal pin={g()!.verified_pin} />
            <span class="meta">{t("review.allPassed", { n: g()!.progress.machine })}</span>
          </Show>
        </div>
        <For each={humans()}>
          {(h) => (
            <label class="fact-row">
              <input type="checkbox" checked={h.human_checked} onChange={(e) => props.onHumanCheck(h.criterion.id, e.currentTarget.checked)} />
              <span class="num t3">{h.criterion.id}</span>
              <span>{h.criterion.title}</span>
            </label>
          )}
        </For>
        <div class="meta">{t("review.seenUnits", { seen: Math.min(props.seen, props.total), total: props.total })}</div>
      </div>
      <Show when={open().length}>
        <div class="panel-section">
          <div class="meta t3">{t("review.stillOpen")}</div>
          <For each={open()}>
            {(o) => (
              <div class="row meta t1">
                <Show when={o.danger} fallback={<NoticeMark />}>
                  <DangerMark />
                </Show>
                <span class="grow">{o.text}</span>
              </div>
            )}
          </For>
        </div>
      </Show>
      <div class="panel-section meta">
        <p>{t("review.acceptExplain")}</p>
        <dl class="panel-branch">
          <dt>{t("goal.branch")}</dt>
          <dd>tower/{props.id.toLowerCase()}-…</dd>
        </dl>
      </div>
      <Show when={blockers().length}>
        <div class="panel-blockers">
          <For each={blockers()}>{(b) => <div>■ {b}</div>}</For>
        </div>
      </Show>
      <div class="panel-actions">
        <Button variant="ghost" onClick={props.onClose}>
          {t("common.cancel")}
        </Button>
        <Button variant="primary" busy={busy()} disabled={blockers().length > 0} onClick={accept}>
          {t("review.acceptWrite")}
        </Button>
      </div>
    </Overlay>
  );
}

function ChangesPanel(props: { id: string; comments: Draft[]; onClose: () => void; onSent: () => void; onRemove: (i: number) => void }) {
  const [summary, setSummary] = createSignal("");
  const [busy, setBusy] = createSignal(false);
  const send = async () => {
    setBusy(true);
    const ok = await act(() => api.requestChanges(props.id, summary(), props.comments.map(toComment)), t("review.sentBack"));
    setBusy(false);
    if (ok !== undefined) {
      props.onSent();
      props.onClose();
      back();
    }
  };
  return (
    <Overlay onClose={props.onClose} label={t("review.requestChanges")} instant>
      <h2 class="panel-title">{t("review.requestChanges")}</h2>
      <textarea class="panel-text" rows={3} placeholder={t("review.summaryPlaceholder")} value={summary()} onInput={(e) => setSummary(e.currentTarget.value)} />
      <div class="panel-section">
        <For each={props.comments} fallback={<p class="meta">{t("review.noInline")}</p>}>
          {(c, i) => (
            <div class="fact-row">
              <span class="mono t2">
                {c.path}
                {c.old ? ` ${t("review.oldLine", { n: c.old })}` : c.line ? `:${c.line}` : ""}
              </span>
              <span class="grow">{c.text}</span>
              <IconButton icon="cross" size={22} label={t("common.delete")} onClick={() => props.onRemove(i())} />
            </div>
          )}
        </For>
      </div>
      <div class="panel-actions">
        <Button variant="ghost" onClick={props.onClose}>
          {t("common.cancel")}
        </Button>
        <Button variant="primary" busy={busy()} disabled={!summary().trim() && !props.comments.length} onClick={send}>
          {t("review.sendBack")}
        </Button>
      </div>
    </Overlay>
  );
}
