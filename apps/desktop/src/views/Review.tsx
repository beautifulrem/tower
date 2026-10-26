/**
 * Review (docs/04 §4.6): full-screen, risk-ordered review units of at most
 * ~300 lines. A comment on a line is a steering instruction; "request changes"
 * sends them all back to the agent. Accepting writes a local branch, never a push.
 *
 * Context between hunks expands from the file itself (either side), twenty
 * lines at a time or the whole file. At ≥1280px the diff can sit side by
 * side (⌥V, remembered per goal). The verification readout (E) shows every
 * criterion's result and output tail without leaving the diff.
 */
import { For, Match, Show, Switch, createEffect, createMemo, createResource, createSignal, on, onCleanup } from "solid-js";

import type { Hunk } from "../gen/Hunk";
import { highlight, languageOf } from "../lib/highlight";
import type { Tokens } from "../lib/highlight.worker";

import { DangerMark, Icon, NoticeMark, ResultMark, Seal } from "../components/Glyph";
import { CriteriaBar, ObsChip } from "../components/Honesty";
import { Button, Empty, IconButton, Kbd, Loading, Overlay } from "../components/ui";
import type { CriterionView } from "../gen/CriterionView";
import type { DiffFile } from "../gen/DiffFile";
import type { DiffLine } from "../gen/DiffLine";
import type { ReviewComment } from "../gen/ReviewComment";
import type { ReviewUnit } from "../gen/ReviewUnit";
import { api, errorText } from "../lib/api";
import { type Gap, type Reveal, STEP, contextLines, gapsOf, revealOf, splitLines, splitRows } from "../lib/diffview";
import { ago, count, duration, short } from "../lib/format";
import { t } from "../lib/i18n";
import { useKeys } from "../lib/keys";
import { back, go } from "../lib/nav";
import { type Draft, type Layout, type ReviewState, fileHash, loadReviewState, persist } from "../lib/reviewState";
import { hunkWordRanges, segment, type Range } from "../lib/worddiff";
import { act, state, toast } from "../lib/store";

/** Where a comment hangs: a new-side line, an old-side (deleted) line, or the file. */
type Anchor = { path: string; line: number | null; old?: number | null };

const sameAnchor = (a: Anchor, b: Anchor) => a.path === b.path && (a.line ?? null) === (b.line ?? null) && (a.old ?? null) === (b.old ?? null);

/** What the agent receives: a deleted-line comment carries the old line number. */
function toComment(d: Draft): ReviewComment {
  if (d.old) return { path: d.path, line: null, old_line: d.old, text: d.text };
  return { path: d.path, line: d.line, text: d.text };
}

type Reveals = Record<number, Reveal>;
type Panel = "accept" | "changes" | "verify" | null;

export function Review(props: { id: string }) {
  const [persisted] = createResource<ReviewState>(() => loadReviewState(props.id));
  // Scope: the whole change, or only what changed since you last reviewed.
  const previous = () => persisted()?.reviewed ?? null;
  const [sinceLast, setSinceLast] = createSignal(false);
  const [view, { refetch: refetchView }] = createResource(
    () => (persisted.loading ? null : { id: props.id, since: sinceLast() ? previous() : null }),
    (k) => (k ? api.review(k.id, k.since) : Promise.reject(new Error("loading"))),
  );
  const [detail, { refetch: refetchDetail }] = createResource(() => props.id, api.goal);
  const [unitIdx, setUnitIdx] = createSignal(0);
  const [seen, setSeen] = createSignal<Set<string>>(new Set());
  const [viewedMap, setViewedMap] = createSignal<Record<string, string>>({});
  const [comments, setComments] = createSignal<Draft[]>([]);
  const [layout, setLayout] = createSignal<Layout>("unified");
  createEffect(
    on(persisted, (p) => {
      if (!p) return;
      setViewedMap(p.viewed);
      setComments(p.drafts);
      setLayout(p.layout);
    }),
  );
  // Side by side needs room: two 80-column panes plus numbers.
  const wideQuery = matchMedia("(min-width: 1280px)");
  const [wide, setWide] = createSignal(wideQuery.matches);
  const onWide = (e: MediaQueryListEvent) => setWide(e.matches);
  wideQuery.addEventListener("change", onWide);
  onCleanup(() => wideQuery.removeEventListener("change", onWide));
  const split = () => layout() === "split" && wide();
  const toggleLayout = () => {
    if (!wide()) return;
    const next: Layout = layout() === "split" ? "unified" : "split";
    setLayout(next);
    persist.layout(props.id, next);
  };

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
  const [panel, setPanel] = createSignal<Panel>(null);
  const g = () => state.goals[props.id];

  // Whole-file text per path (new side; old side for deleted files), fetched on first expand.
  const [texts, setTexts] = createSignal<Record<string, string[] | null>>({});
  const [reveals, setReveals] = createSignal<Record<string, Reveals>>({});
  const [whole, setWhole] = createSignal<Record<string, boolean>>({});
  const loading = new Set<string>();
  const ensureText = async (f: DiffFile): Promise<string[] | null> => {
    const have = texts()[f.path];
    if (have !== undefined) return have;
    if (loading.has(f.path)) return null;
    loading.add(f.path);
    try {
      const raw = await api.fileText(props.id, f.path, f.status === "deleted", view()?.pin ?? null);
      const lines = raw === null ? null : splitLines(raw);
      setTexts((m) => ({ ...m, [f.path]: lines }));
      return lines;
    } catch (e) {
      toast("error", errorText(e), { goalId: props.id });
      return null;
    } finally {
      loading.delete(f.path);
    }
  };
  const reveal = async (f: DiffFile, gap: Gap, how: "top" | "bottom" | "all") => {
    const lines = await ensureText(f);
    if (!lines) return;
    setReveals((m) => {
      const forFile = { ...(m[f.path] ?? {}) };
      const cur = forFile[gap.index] ?? { top: 0, bottom: 0 };
      forFile[gap.index] = how === "all" ? { top: 1e9, bottom: 0 } : { ...cur, [how]: cur[how] + STEP };
      return { ...m, [f.path]: forFile };
    });
  };
  const toggleWhole = async (f: DiffFile) => {
    if (!whole()[f.path]) {
      const lines = await ensureText(f);
      if (!lines) return;
    }
    setWhole((m) => ({ ...m, [f.path]: !m[f.path] }));
  };

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

  useKeys(
    [
      { key: "j", run: () => selectUnit(unitIdx() + 1), desc: () => t("keys.units"), hint: "j k" },
      { key: "k", run: () => selectUnit(unitIdx() - 1) },
      { key: "]", run: () => jumpHunk(1), desc: () => t("keys.hunks"), hint: "] [" },
      { key: "[", run: () => jumpHunk(-1) },
      {
        key: "v",
        run: () => {
          files().forEach((f) => toggleViewed(f, true));
          selectUnit(unitIdx() + 1);
        },
        desc: () => t("keys.viewed"),
      },
      { key: "alt+v", run: toggleLayout, desc: () => t("keys.split") },
      { key: "e", run: () => setPanel((p) => (p === "verify" ? null : "verify")), desc: () => t("keys.verification") },
      { key: "mod+shift+enter", run: () => setPanel("accept"), inInputs: true, desc: () => t("review.accept") },
      { key: "c", run: () => setPanel("changes"), desc: () => t("review.requestChanges") },
      { key: "escape", run: () => (composer() ? setComposer(null) : back()) },
    ],
    () => t("app.review", { id: props.id }),
  );

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
                <span class="scope-switch" role="tablist" aria-label={t("review.scopeLabel")}>
                  <button class="tab" role="tab" aria-selected={!sinceLast()} classList={{ active: !sinceLast() }} onClick={() => setSinceLast(false)}>
                    {t("review.allChanges")}
                  </button>
                  <button class="tab" role="tab" aria-selected={sinceLast()} classList={{ active: sinceLast() }} onClick={() => setSinceLast(true)}>
                    {t("review.sinceLast")}
                  </button>
                </span>
              </Show>
              <Show when={g()}>
                <button class="review-stat-group review-verify link-plain" onClick={() => setPanel("verify")} title={t("review.verifyOpen")} aria-haspopup="dialog">
                  <Seal pin={g()!.verified_pin} />
                  <Show when={g()!.verified_pin}>
                    <span class="sep">·</span>
                  </Show>
                  <CriteriaBar progress={g()!.progress} compact />
                  <Icon name="chevron-right" size={10} class="t3" />
                </button>
              </Show>
            </div>
          </Show>
        </div>
        <Show when={wide()}>
          <IconButton
            icon="columns"
            size={26}
            label={t("review.splitToggle")}
            title={`${t("review.splitToggle")} ⌥V`}
            aria-pressed={split()}
            classList={{ pressed: split() }}
            onClick={toggleLayout}
          />
        </Show>
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

      <Show when={!view.loading && !persisted.loading} fallback={<div class="page-loading"><Loading text={t("review.loading")} /></div>}>
        <Show
          when={!view.error}
          fallback={
            <div class="page-loading">
              <Empty
                title={t("review.loadFailed")}
                kind="error"
                action={
                  <Button size="s" onClick={() => void refetchView()}>
                    {t("common.retry")}
                  </Button>
                }
              >
                {errorText(view.error)}
              </Empty>
            </div>
          }
        >
          <Show
            when={units().length > 0}
            fallback={
              <div class="page-loading">
                <Empty
                  title={t("review.noChanges")}
                  action={
                    <Button size="s" variant="ghost" onClick={() => go({ name: "goal", id: props.id })}>
                      {t("review.openGoal")}
                    </Button>
                  }
                >
                  {sinceLast() ? t("review.noChangesSince") : t("review.noChangesBody")}
                </Empty>
              </div>
            }
          >
            <div class="review-body" classList={{ solo: solo() }}>
              <Show when={!solo()}>
                <aside class="review-units" aria-label={t("review.unitsLabel")}>
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
                      split={split()}
                      lines={texts()[f.path]}
                      reveals={reveals()[f.path] ?? {}}
                      whole={!!whole()[f.path]}
                      onReveal={(gap, how) => void reveal(f, gap, how)}
                      onWhole={() => void toggleWhole(f)}
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
          <Kbd k="j k" /> {t("review.keyUnits")}
        </span>
        <span>
          <Kbd k="] [" /> {t("review.keyHunks")}
        </span>
        <span>
          <Kbd k="v" /> {t("review.keyViewed")}
        </span>
        <span>
          <Kbd k="e" /> {t("review.keyVerification")}
        </span>
        <Show when={wide()}>
          <span>
            <Kbd k="alt+v" /> {t("review.keySplit")}
          </span>
        </Show>
        <span>{t("review.keyComment")}</span>
        <span>{t("review.keyOpen")}</span>
        <span class="grow" />
        <span>
          <Kbd k="?" /> {t("keys.shortcuts")}
        </span>
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
      <Show when={panel() === "verify"}>
        <VerifyPanel id={props.id} detail={detail()} loading={detail.loading} onClose={() => setPanel(null)} />
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
    <button class="unit" classList={{ active: props.active }} aria-current={props.active ? "true" : undefined} onClick={props.onClick} title={props.u.files.join("\n")}>
      <span class="unit-name">
        {name()}
        <Show when={more() > 0}> +{more()}</Show> <span class="unit-dir">{dir()}</span>
      </span>
      <span class="unit-lines num">{t("review.lines", { n: props.u.lines })}</span>
      <span class="unit-flags">
        <Show when={props.u.risk >= 2}>
          <span class="unit-risk" role="img" aria-label={t("review.risk", { n: props.u.risk })}>
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

type Block =
  | { kind: "hunk"; hunk: Hunk }
  | { kind: "head"; header: string }
  | { kind: "gap"; gap: Gap; hidden: number | null; header: string | null };

function FileDiff(props: {
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
      if (r.top && props.lines) out.push({ kind: "hunk", hunk: { header: "", lines: contextLines(props.lines, gap, r.top[0], r.top[1]) } });
      const fold = r.hidden === null || r.hidden > 0;
      if (fold) out.push({ kind: "gap", gap, hidden: r.hidden, header });
      if (r.bottom && props.lines) out.push({ kind: "hunk", hunk: { header: "", lines: contextLines(props.lines, gap, r.bottom[0], r.bottom[1]) } });
      return fold;
    };
    props.file.hunks.forEach((h, i) => {
      if (!emitGap(i, h.header)) out.push({ kind: "head", header: h.header });
      out.push({ kind: "hunk", hunk: h });
    });
    emitGap(props.file.hunks.length, null);
    return out;
  });

  const cols = 4;
  return (
    <section class="file" aria-label={props.file.path}>
      <header class="file-head">
        <span class="file-status meta">{statusLabel(props.file.status)}</span>
        <span class="mono ellipsis grow" title={props.file.path}>
          <Show when={props.file.old_path}>
            <span class="t3">{props.file.old_path} → </span>
          </Show>
          {props.file.path}
        </span>
        <span class="num meta">
          <span class="diff-add">+{props.file.additions}</span> <span class="diff-del">−{props.file.deletions}</span>
        </span>
        <Show when={expandable()}>
          <Button size="s" variant="ghost" aria-pressed={props.whole} onClick={props.onWhole} title={t("review.wholeFileTitle")}>
            <Icon name="expand" size={10} />
            {t("review.wholeFile")}
          </Button>
        </Show>
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
        <table class="diff" classList={{ "diff-split": props.split }}>
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
                      <tr class="hunk-head">
                        <td colspan={cols} class="mono">
                          {hb().header}
                        </td>
                      </tr>
                    )}
                  </Match>
                  <Match when={b.kind === "gap" && b}>
                    {(gb) => <GapRow block={gb()} cols={cols} known={props.lines !== undefined} onReveal={(how) => props.onReveal(gb().gap, how)} />}
                  </Match>
                  <Match when={b.kind === "hunk" && b}>
                    {(hb) => (
                      <HunkRows
                        hunk={hb().hunk}
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
 * A fold between hunks. ↓ grows the hunk above downwards (lines appear
 * above this row); ↑ grows the hunk below upwards (lines appear under it).
 */
function GapRow(props: { block: Extract<Block, { kind: "gap" }>; cols: number; known: boolean; onReveal: (how: "top" | "bottom" | "all") => void }) {
  const gap = () => props.block.gap;
  const hasAbove = () => gap().index > 0;
  const hasBelow = () => props.block.header !== null;
  const hidden = () => props.block.hidden;
  const step = () => (hidden() === null ? STEP : Math.min(STEP, hidden()!));
  return (
    <tr class="hunk-head gap-row">
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
          <button class="link gap-all" onClick={() => props.onReveal("all")}>
            {t("review.showAll")}
          </button>
        </div>
      </td>
    </tr>
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
 * is coloured in its own context), off the main thread; rows render as
 * plain text first and pick up colour when tokens arrive. Adjacent deleted
 * and added lines are compared word by word, and in the side-by-side
 * layout sit next to each other.
 */
function HunkRows(props: {
  hunk: Hunk;
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
                    <CommentRow draft={x.c} onEdit={() => props.onEdit(x.index)} onRemove={() => props.onRemove(x.index)} />
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
  return (
    <Show
      when={props.split}
      fallback={
        <For each={props.hunk.lines}>
          {(l, idx) => (
            <>
              <tr class={`dl dl-${l.kind}`} classList={{ commented: props.commentsAt(anchorOf(l)).length > 0 }}>
                <td class="ln num">
                  <button class="ln-btn" onClick={click(l)} title={t("review.lineTitle")} aria-label={t("review.lineLabel", { n: l.old_no ?? l.new_no ?? 0 })} tabindex="-1">
                    {l.old_no ?? ""}
                  </button>
                </td>
                <td class="ln num">
                  <button class="ln-btn" onClick={click(l)} title={t("review.lineTitle")} aria-label={t("review.lineLabel", { n: l.new_no ?? l.old_no ?? 0 })} tabindex="-1">
                    {l.new_no ?? ""}
                  </button>
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
              <tr class="dl dl-split" classList={{ commented: commented() }}>
                <td class="ln num" classList={{ "dl-del": left()?.kind === "del" }}>
                  <Show when={left()}>
                    {(l) => (
                      <button class="ln-btn" onClick={click(l())} title={t("review.lineTitle")} aria-label={t("review.lineLabel", { n: l().old_no ?? 0 })} tabindex="-1">
                        {l().old_no ?? ""}
                      </button>
                    )}
                  </Show>
                </td>
                <td class="code mono" classList={{ "dl-del": left()?.kind === "del", "dl-blank": !left() }}>
                  <Show when={left()}>{(l) => <Code l={l()} tokens={tokens()?.[row.left!]} ranges={words().get(row.left!)} sign={false} />}</Show>
                </td>
                <td class="ln num" classList={{ "dl-add": right()?.kind === "add" }}>
                  <Show when={right()}>
                    {(r) => (
                      <button class="ln-btn" onClick={click(r())} title={t("review.lineTitle")} aria-label={t("review.lineLabel", { n: r().new_no ?? 0 })} tabindex="-1">
                        {r().new_no ?? ""}
                      </button>
                    )}
                  </Show>
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

function Composer(props: { initial?: string; onSubmit: (t: string) => void; onCancel: () => void }) {
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

/** Every criterion with its last verifier reading and output tail, in one sheet. */
function VerifyPanel(props: { id: string; detail: Awaited<ReturnType<typeof api.goal>> | undefined; loading: boolean; onClose: () => void }) {
  const g = () => state.goals[props.id];
  const criteria = () => props.detail?.criteria ?? [];
  const mark = (c: CriterionView) => (!c.verified ? "pending" : c.verified.stale ? "stale" : c.verified.passed ? "pass" : "fail");
  return (
    <Overlay onClose={props.onClose} label={t("review.verifyTitle", { id: props.id })} title={t("review.verifyTitle", { id: props.id })} instant class="panel panel-wide">
      <div class="verify-head">
        <div class="row">
          <Show when={g()?.verified_pin} fallback={<span class="meta">{t("review.noMachine")}</span>}>
            <Seal pin={g()!.verified_pin} />
          </Show>
          <span class="grow" />
          <Show when={g()}>
            <CriteriaBar progress={g()!.progress} compact />
          </Show>
        </div>
        <p class="meta t3">{t("review.verifyExplain")}</p>
      </div>
      <Show when={!props.loading} fallback={<Loading />}>
        <div class="verify-list">
          <For each={criteria()} fallback={<Empty title={t("goal.noCriteria")} inline />}>
            {(c) => (
              <div class="verify-item">
                <div class="criterion-row">
                  <Show when={c.criterion.kind.type !== "human"} fallback={<ResultMark kind={c.human_checked ? "obs-pass" : "pending"} title={c.human_checked ? t("goal.youChecked") : t("goal.awaitingCheck")} />}>
                    <ResultMark kind={mark(c)} />
                  </Show>
                  <span class="num t3">{c.criterion.id}</span>
                  <span class="criterion-main">
                    <span class="criterion-title">{c.criterion.title}</span>
                    <Show when={c.criterion.kind.type !== "human"}>
                      <code class="criterion-cmd code-val">{(c.criterion.kind as { command: string }).command}</code>
                    </Show>
                  </span>
                  <Show
                    when={c.verified}
                    fallback={
                      <span class="col-span t3">
                        {c.criterion.kind.type === "human" ? (c.human_checked ? t("goal.youChecked") : t("goal.awaitingCheck")) : t("goal.awaitingVerify")}
                      </span>
                    }
                  >
                    {(v) => (
                      <>
                        <span class="col-result">{v().passed ? t("common.passed") : t("common.failed")}</span>
                        <span class="col-dur">{duration(v().duration_ms)}</span>
                        <span class="col-pin">
                          <Icon name="harness" size={10} />@{short(v().pin)}
                        </span>
                        <span class="col-age">{ago(v().at, state.now)}</span>
                      </>
                    )}
                  </Show>
                </div>
                <Show when={c.observed}>
                  <div class="criterion-row criterion-obs">
                    <ResultMark kind={c.observed!.passed ? "obs-pass" : "obs-fail"} />
                    <span />
                    <span />
                    <span class="col-span">
                      <ObsChip title={t("goal.observedTitle")} />
                      <span>{c.observed!.passed ? t("common.passed") : t("common.failed")}</span>
                      <span class="col-age">{ago(c.observed!.at, state.now)}</span>
                    </span>
                  </div>
                </Show>
                <Show when={c.verified}>
                  {(v) => (
                    <pre class="output-tail verify-tail">
                      <span class="t3">{t("common.exitCode", { code: v().exit_code ?? "—" })}</span>
                      {"\n"}
                      {v().output_tail || t("common.noOutput")}
                    </pre>
                  )}
                </Show>
              </div>
            )}
          </For>
        </div>
      </Show>
      <div class="panel-actions">
        <Button variant="ghost" onClick={props.onClose}>
          {t("common.close")}
        </Button>
      </div>
    </Overlay>
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
    <Overlay onClose={props.onClose} label={t("review.acceptTitle", { id: props.id })} title={t("review.acceptTitle", { id: props.id })} instant>
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
        <div class="panel-blockers" role="alert">
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
    <Overlay onClose={props.onClose} label={t("review.requestChanges")} title={t("review.requestChanges")} instant>
      <textarea class="panel-text" rows={3} aria-label={t("review.summaryPlaceholder")} placeholder={t("review.summaryPlaceholder")} value={summary()} onInput={(e) => setSummary(e.currentTarget.value)} />
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
