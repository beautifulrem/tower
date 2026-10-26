/**
 * Review (docs/04 §4.6): full-screen — the sidebar leaves too — risk-ordered
 * review units of at most ~300 lines. A comment on a line is a steering
 * instruction; "request changes" sends them all back to the agent.
 * Accepting writes a local branch, never a push.
 *
 * At ≥1280px the diff can sit side by side (⌥V, remembered per goal). The
 * verification readout (E) shows every criterion's result and output tail
 * without leaving the diff. While the goal is paused or in review the
 * workspace is yours to touch: a hunk can be undone (U), a file edited in
 * place, a comment's suggestion applied; the snapshot then changes and the
 * review reloads. A file tree on the left and ⌘P jump by path. A review
 * queue (from Needs you) opens the next goal when this one is done. The
 * pieces live in `review/`: `FileDiff` (the table), `panels` (the three
 * sheets), `types`.
 */
import { For, Show, createEffect, createMemo, createResource, createSignal, on, onCleanup } from "solid-js";

import { DangerMark, Icon, NoticeMark, Seal } from "../components/Glyph";
import { CriteriaBar } from "../components/Honesty";
import { Button, Empty, IconButton, Kbd, Loading, Overlay } from "../components/ui";
import type { DiffFile } from "../gen/DiffFile";
import type { ReviewUnit } from "../gen/ReviewUnit";
import { api, errorText } from "../lib/api";
import { type Gap, splitLines } from "../lib/diffview";
import { type TreeNode, buildTree } from "../lib/filetree";
import { count, short } from "../lib/format";
import { type Match, matchText, segments } from "../lib/fuzzy";
import { t } from "../lib/i18n";
import { useKeys } from "../lib/keys";
import { ask } from "../lib/native";
import { back, go } from "../lib/nav";
import { advanceQueue, queuePosition } from "../lib/reviewQueue";
import { type Draft, type Layout, type ReviewState, fileHash, loadReviewState, persist } from "../lib/reviewState";
import { act, onTrace, state, toast } from "../lib/store";
import { applySuggestion } from "../lib/suggest";
import { FileDiff } from "./review/FileDiff";
import { AcceptPanel, ChangesPanel, VerifyPanel } from "./review/panels";
import { type Anchor, type Composing, type Panel, type Reveals } from "./review/types";

/** Trace kinds after which the review or the goal's facts may have changed. */
const RELOAD_VIEW = new Set(["pinned", "human_edited", "rolled_back"]);
const RELOAD_DETAIL = new Set(["pinned", "human_edited", "rolled_back", "sentinel_hit", "verify_finished", "criterion_result", "claim_reviewed", "human_check", "original_tests_result"]);

/** The tree is worth its column from this many files. */
const TREE_FROM = 2;

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
  // Facts keep arriving while you read: a sentinel raised after review-ready shows up here too.
  const off = onTrace(props.id, (e) => {
    if (RELOAD_DETAIL.has(e.event.kind)) void refetchDetail();
    if (RELOAD_VIEW.has(e.event.kind)) void refetchView();
  });
  onCleanup(off);

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
  const [composer, setComposer] = createSignal<Composing>(null);
  const [panel, setPanel] = createSignal<Panel>(null);
  const [pathJump, setPathJump] = createSignal(false);
  const g = () => state.goals[props.id];
  // The workspace is yours to touch only while the agent is not in it.
  const editable = () => g()?.state === "paused" || g()?.state === "in_review";

  // Whole-file text per path (new side; old side for deleted files), fetched on first expand.
  const [texts, setTexts] = createSignal<Record<string, string[] | null>>({});
  const [reveals, setReveals] = createSignal<Record<string, Reveals>>({});
  const [whole, setWhole] = createSignal<Record<string, boolean>>({});
  const [editingPath, setEditingPath] = createSignal<string | null>(null);
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
      forFile[gap.index] = how === "all" ? { top: 1e9, bottom: 0 } : { ...cur, [how]: cur[how] + 20 };
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
  /** The snapshot changed under a file: everything cached about it goes, then the review and the facts reload. */
  const changed = async (f: DiffFile) => {
    setTexts((m) => {
      const n = { ...m };
      delete n[f.path];
      return n;
    });
    setReveals((m) => ({ ...m, [f.path]: {} }));
    await Promise.all([refetchView(), refetchDetail()]);
  };
  /** Undoes one hunk in the workspace. */
  const undoHunk = async (f: DiffFile, hunk: number) => {
    const ok = await ask(t("review.undoHunkConfirm", { path: f.path }), {
      title: t("review.undoHunkTitle"),
      ok: t("review.undoHunkVerb"),
      cancel: t("common.cancel"),
      kind: "warning",
    });
    if (!ok) return;
    const done = await act(() => api.revertHunk(props.id, f.path, hunk), t("review.hunkUndone"));
    if (done !== undefined) await changed(f);
  };
  /** Opens the in-place editor on a file: the whole text must be here first. */
  const editFile = async (f: DiffFile) => {
    const lines = await ensureText(f);
    if (lines) setEditingPath(f.path);
  };
  /** Writes your text to the workspace as your edit. */
  const saveFile = async (f: DiffFile, text: string) => {
    const done = await act(() => api.writeFile(props.id, f.path, text), t("review.fileSaved"));
    if (done === undefined) return;
    setEditingPath(null);
    await changed(f);
  };
  /** Applies a comment's suggestion: the file with that one line replaced. */
  const applyTo = async (f: DiffFile, line: number, suggestion: string) => {
    const lines = await ensureText(f);
    if (!lines) return;
    const text = applySuggestion(lines.join("\n") + "\n", line, suggestion);
    const done = await act(() => api.writeFile(props.id, f.path, text), t("review.suggestionApplied"));
    if (done === undefined) return;
    await changed(f);
  };

  const units = () => view()?.units ?? [];
  const unit = () => units()[unitIdx()];
  const files = createMemo(() => {
    const u = unit();
    const v = view();
    if (!u || !v) return [];
    return v.files.filter((f) => u.files.includes(f.path));
  });
  const allPaths = createMemo(() => view()?.files.map((f) => f.path) ?? []);
  const fileByPath = (path: string) => view()?.files.find((f) => f.path === path);

  // Hunks you accepted: a reading mark of your own, kept per goal for this diff (from..pin) in the review's state, never
  // a change to the workspace — U is the change. An accepted hunk folds to its header and the review moves on; once every
  // hunk of a file is accepted the file is viewed. A new snapshot means new hunks: the marks start over with it.
  const range = () => (view() ? `${view()!.from}..${view()!.pin}` : null);
  const [accepted, setAccepted] = createSignal<Record<string, number[]>>({});
  createEffect(
    on([range, persisted], ([r, p]) => {
      if (!r || !p) return;
      setAccepted(p.accepted && p.accepted.range === r ? p.accepted.files : {});
    }),
  );
  const isAccepted = (f: DiffFile, hunk: number) => (accepted()[f.path] ?? []).includes(hunk);
  // The unit on screen: how many of its hunks carry your mark, of how many.
  const unitAccepted = createMemo(() => files().reduce((n, f) => n + (accepted()[f.path] ?? []).filter((i) => i < f.hunks.length).length, 0));
  const unitHunks = createMemo(() => files().reduce((n, f) => n + f.hunks.length, 0));
  const setHunkAccepted = (f: DiffFile, hunk: number, on: boolean) => {
    const r = range();
    if (!r) return;
    const have = accepted()[f.path] ?? [];
    const list = on ? [...new Set([...have, hunk])].sort((a, b) => a - b) : have.filter((i) => i !== hunk);
    const next = { ...accepted() };
    if (list.length) next[f.path] = list;
    else delete next[f.path];
    setAccepted(next);
    persist.accepted(props.id, { range: r, files: next });
    // Every hunk accepted is the file read; one taken back is the file open again.
    if (on && list.length === f.hunks.length) toggleViewed(f, true);
    if (!on && isViewed(f)) toggleViewed(f, false);
  };
  /** A or the header's button: marks the hunk, folds it, and moves to the next one; on an accepted hunk, takes the mark back. */
  const acceptHunk = (f: DiffFile, hunk: number) => {
    const on = !isAccepted(f, hunk);
    setHunkAccepted(f, hunk, on);
    if (on) requestAnimationFrame(() => jumpHunk(1));
  };

  const selectUnit = (i: number) => {
    setUnitIdx(Math.max(0, Math.min(units().length - 1, i)));
    document.querySelector(".review-diff")?.scrollTo({ top: 0 });
  };
  /** Shows the unit holding `path` and scrolls that file to the top of the pane. */
  const jumpToFile = (path: string) => {
    const i = units().findIndex((u) => u.files.includes(path));
    if (i < 0) return;
    if (i !== unitIdx()) setUnitIdx(i);
    requestAnimationFrame(() => {
      const pane = document.querySelector<HTMLElement>(".review-diff");
      const el = pane?.querySelector<HTMLElement>(`[data-file-path="${CSS.escape(path)}"]`);
      if (pane && el) pane.scrollTo({ top: el.offsetTop - 16 });
    });
  };

  /** A row's top in the pane's scroll space (a table row's offsetTop is relative to its table, not the pane). */
  const topIn = (pane: HTMLElement, el: HTMLElement) => el.getBoundingClientRect().top - pane.getBoundingClientRect().top + pane.scrollTop;
  /** Scrolls to the next or previous hunk in the diff pane. */
  const jumpHunk = (dir: 1 | -1) => {
    const pane = document.querySelector<HTMLElement>(".review-diff");
    if (!pane) return;
    const heads = [...pane.querySelectorAll<HTMLElement>(".hunk-head")].map((h) => ({ h, top: topIn(pane, h) }));
    const top = pane.scrollTop + 48;
    const target = dir > 0 ? heads.find((x) => x.top > top + 4) : [...heads].reverse().find((x) => x.top < top - 4);
    if (target) pane.scrollTo({ top: target.top - 40 });
  };
  /** The hunk whose header is at (or last passed) the top of the pane: what ] and [ land on. */
  const currentHunk = (): { f: DiffFile; index: number } | null => {
    const pane = document.querySelector<HTMLElement>(".review-diff");
    if (!pane) return null;
    const heads = [...pane.querySelectorAll<HTMLElement>(".hunk-head[data-hunk-index]")];
    const top = pane.scrollTop + 48;
    const head = [...heads].reverse().find((h) => topIn(pane, h) <= top + 4) ?? heads[0];
    const f = head && fileByPath(head.dataset.hunkPath ?? "");
    return head && f ? { f, index: Number(head.dataset.hunkIndex) } : null;
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
      {
        key: "a",
        run: () => {
          const h = currentHunk();
          if (h) acceptHunk(h.f, h.index);
        },
        desc: () => t("keys.acceptHunk"),
      },
      {
        key: "u",
        run: () => {
          const h = currentHunk();
          if (editable() && h) void undoHunk(h.f, h.index);
        },
        desc: () => t("keys.undoHunk"),
        // Listed in the sheet exactly when the status bar lists it: while the workspace is yours to touch.
        when: editable,
      },
      { key: "mod+p", run: () => setPathJump((o) => !o), inInputs: true, desc: () => t("keys.pathJump") },
      { key: "mod+shift+enter", run: () => setPanel("accept"), inInputs: true, desc: () => t("review.accept") },
      { key: "c", run: () => setPanel("changes"), desc: () => t("review.requestChanges") },
      { key: "escape", run: () => (composer() ? setComposer(null) : editingPath() ? setEditingPath(null) : back()) },
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

  /** Done with this goal: the queue's next review, or back where you came from. */
  const finish = () => {
    const next = advanceQueue(props.id);
    if (next) {
      toast("info", t("review.queueNext", { id: next }), { ttl: 2500 });
      go({ name: "review", id: next });
    } else back();
  };

  const solo = () => units().length === 1;
  const showTree = () => allPaths().length >= TREE_FROM;
  const viewedUnits = () => units().filter(unitViewed).length;
  const queue = () => queuePosition(props.id);

  return (
    <div class="review">
      <header class="review-head" data-tauri-drag-region>
        <IconButton icon="chevron-left" label={t("common.back")} onClick={back} />
        <div class="review-head-text" data-tauri-drag-region>
          <div class="row">
            <h1 class="review-title ellipsis">{g()?.title}</h1>
            <span class="code-val t2">{props.id}</span>
            <Show when={queue()}>{(q) => <span class="meta t3 num">{t("review.queuePosition", { i: q().i, n: q().n })}</span>}</Show>
          </div>
          <Show when={view()}>
            <div class="review-stats meta halt">
              {/* With nothing changed the counts would contradict the page; only the snapshot pair stays. */}
              <span class="review-stat-group num">
                <Show when={units().length > 0}>
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
                </Show>
                <span class="review-stat-pins code-val">
                  @{short(view()!.from)}
                  <Icon name="arrow-right" size={10} class="t3" />@{short(view()!.pin)}
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
                  <Seal pin={g()!.verified_pin} large />
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
                {/* Nothing to review is a whole-screen empty state like the inbox's: the poster, a third of the way down, with its one way out. */}
                <Empty
                  title={t("review.noChanges")}
                  poster
                  action={
                    <Button size="s" onClick={() => go({ name: "goal", id: props.id })}>
                      {t("review.openGoal")}
                    </Button>
                  }
                >
                  {sinceLast() ? t("review.noChangesSince") : t("review.noChangesBody")}
                </Empty>
              </div>
            }
          >
            <div class="review-body" classList={{ solo: solo() && !showTree() }}>
              {/* One list of files. With several units each unit is a group in the tree — its title, line count and risk on the group row,
                  its files folded by directory under it — so a file is named once, and j/k still walk the units. */}
              <Show when={!solo() || showTree()}>
                <aside class="review-units" aria-label={t("review.unitsLabel")}>
                  <div class="tree-head halt">
                    <span>{t("review.filesLabel")}</span>
                    <span class="num">{allPaths().length}</span>
                    <span class="grow" />
                    <Kbd k="mod+p" />
                  </div>
                  <div class="tree" role="tree" aria-label={t("review.filesLabel")}>
                    <For each={units()}>
                      {(u, i) => (
                        <div class="unit-group" role="group" aria-label={u.title}>
                          <Show when={!solo()}>
                            <UnitItem u={u} active={i() === unitIdx()} viewed={unitViewed(u)} onClick={() => selectUnit(i())} />
                          </Show>
                          <For each={buildTree(u.files, u.title.endsWith("/") && u.files.every((f) => f.startsWith(u.title)) ? u.title : "")}>
                            {(n) => (
                              <TreeRow
                                node={n}
                                depth={solo() ? 0 : 1}
                                fileOf={fileByPath}
                                viewed={(p) => !!fileByPath(p) && isViewed(fileByPath(p)!)}
                                shown={(p) => i() === unitIdx() && files().some((f) => f.path === p)}
                                onOpen={(p) => (selectUnit(i()), jumpToFile(p))}
                              />
                            )}
                          </For>
                        </div>
                      )}
                    </For>
                  </div>
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
                      accepted={(hunk) => isAccepted(f, hunk)}
                      onAccept={(hunk) => acceptHunk(f, hunk)}
                      onUndo={editable() ? (hunk) => void undoHunk(f, hunk) : undefined}
                      editing={editingPath() === f.path}
                      onEditFile={editable() ? () => void editFile(f) : undefined}
                      onSaveFile={(text) => void saveFile(f, text)}
                      onCancelEdit={() => setEditingPath(null)}
                      onApplySuggestion={editable() ? (line, s) => void applyTo(f, line, s) : undefined}
                      comments={comments()}
                      composer={composer()}
                      onAnchor={(a: Anchor) => setComposer(a)}
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

      {/* The status bar: keys on the left, the two mouse hints apart on the right, quieter. */}
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
        <span title={t("review.acceptHunkNote")}>
          <Kbd k="a" /> {t("review.keyAccept")}
        </span>
        <Show when={editable()}>
          <span>
            <Kbd k="u" /> {t("review.keyUndo")}
          </span>
        </Show>
        <Show when={wide()}>
          <span>
            <Kbd k="alt+v" /> {t("review.keySplit")}
          </span>
        </Show>
        <span>
          <Kbd k="?" /> {t("keys.shortcuts")}
        </span>
        <span class="grow" />
        <span class="status-mouse t4">{t("review.keyComment")}</span>
        <span class="status-mouse t4">{t("review.keyOpen")}</span>
        {/* Your reading marks on this unit, counted; the title says what they are not. */}
        <Show when={unitAccepted() > 0}>
          <span class="num review-accepted" title={t("review.acceptHunkNote")}>
            <Icon name="check" size={10} />
            {t("review.hunksAccepted", { n: unitAccepted(), total: unitHunks() })}
          </span>
        </Show>
        <Show when={units().length > 1}>
          <span class="num">{t("review.unitOf", { i: unitIdx() + 1, n: units().length })}</span>
        </Show>
      </div>

      <Show when={panel() === "accept"}>
        <AcceptPanel
          id={props.id}
          viewed={viewedUnits()}
          total={units().length}
          detail={detail()}
          onHumanCheck={async (cid, v) => {
            await act(() => api.humanCheck(props.id, cid, v));
            await refetchDetail();
          }}
          onClose={() => setPanel(null)}
          onDone={markReviewed}
          onFinish={finish}
        />
      </Show>
      <Show when={panel() === "changes"}>
        <ChangesPanel id={props.id} comments={comments()} onSent={markReviewed} onClose={() => setPanel(null)} onRemove={removeComment} onFinish={finish} />
      </Show>
      <Show when={panel() === "verify"}>
        <VerifyPanel id={props.id} detail={detail()} loading={detail.loading} onClose={() => setPanel(null)} />
      </Show>
      <Show when={pathJump()}>
        <PathPalette paths={allPaths()} fileOf={fileByPath} onClose={() => setPathJump(false)} onPick={(p) => (setPathJump(false), jumpToFile(p))} />
      </Show>
    </div>
  );
}

/** A unit as a group row of the tree: its title, line count; risk bars only when present. Its files are named once, under it.
    The current unit is the one on the selected ground; no caret, because nothing here folds. */
function UnitItem(props: { u: ReviewUnit; active: boolean; viewed: boolean; onClick: () => void }) {
  return (
    <button class="unit" classList={{ active: props.active }} aria-current={props.active ? "true" : undefined} onClick={props.onClick} title={props.u.risk_reasons.join("\n") || props.u.title}>
      <span class="unit-name">
        {props.u.title}
        <span class="unit-dir"> {t("common.files", { n: props.u.files.length })}</span>
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
      </span>
    </button>
  );
}

/** A row of the file tree: directories fold, files show +/−, viewed files step back. */
function TreeRow(props: {
  node: TreeNode;
  depth: number;
  fileOf: (path: string) => DiffFile | undefined;
  viewed: (path: string) => boolean;
  shown: (path: string) => boolean;
  onOpen: (path: string) => void;
}) {
  const [open, setOpen] = createSignal(true);
  const f = () => props.fileOf(props.node.path);
  return (
    <Show
      when={props.node.file}
      fallback={
        <>
          <button class="tree-row tree-dir" role="treeitem" aria-expanded={open()} style={{ "--depth": props.depth }} onClick={() => setOpen((o) => !o)}>
            <Icon name={open() ? "caret-down" : "caret-right"} size={10} />
            <span class="ellipsis">{props.node.name}</span>
          </button>
          <Show when={open()}>
            <For each={props.node.children}>{(c) => <TreeRow {...props} node={c} depth={props.depth + 1} />}</For>
          </Show>
        </>
      }
    >
      <button
        class="tree-row tree-file"
        role="treeitem"
        classList={{ viewed: props.viewed(props.node.path), shown: props.shown(props.node.path) }}
        aria-current={props.shown(props.node.path) ? "true" : undefined}
        style={{ "--depth": props.depth }}
        title={props.node.path}
        onClick={() => props.onOpen(props.node.path)}
      >
        <span class="ellipsis grow">{props.node.name}</span>
        <Show when={f()}>
          {(file) => (
            <span class="num tree-stat">
              <span class="diff-add">+{file().additions}</span> <span class="diff-del">−{file().deletions}</span>
            </span>
          )}
        </Show>
        <Show when={props.viewed(props.node.path)}>
          <Icon name="check" size={10} label={t("review.viewed")} />
        </Show>
      </button>
    </Show>
  );
}

/** ⌘P: type part of a path, land on the file. */
function PathPalette(props: { paths: string[]; fileOf: (path: string) => DiffFile | undefined; onClose: () => void; onPick: (path: string) => void }) {
  const [q, setQ] = createSignal("");
  const [sel, setSel] = createSignal(0);
  const hits = createMemo<{ path: string; m: Match | null }[]>(() => {
    const n = q().trim();
    if (!n) return props.paths.map((path) => ({ path, m: null }));
    return props.paths
      .map((path) => ({ path, m: matchText(n, path) }))
      .filter((x): x is { path: string; m: Match } => x.m !== null)
      .sort((a, b) => b.m.score - a.m.score)
      .slice(0, 12);
  });
  const pick = (i: number) => {
    const h = hits()[i];
    if (h) props.onPick(h.path);
  };
  return (
    <Overlay onClose={props.onClose} label={t("review.pathPalette")} instant class="palette" top>
      <div class="palette-field">
        <span class="palette-prompt" aria-hidden="true">
          ›
        </span>
        <input
          class="palette-input"
          role="combobox"
          aria-expanded="true"
          aria-controls="path-list"
          aria-autocomplete="list"
          aria-label={t("review.pathPalette")}
          placeholder={t("review.pathPlaceholder")}
          value={q()}
          onInput={(e) => (setQ(e.currentTarget.value), setSel(0))}
          onKeyDown={(e) => {
            if (e.isComposing) return;
            if (e.key === "ArrowDown") (e.preventDefault(), setSel((s) => Math.min(s + 1, hits().length - 1)));
            else if (e.key === "ArrowUp") (e.preventDefault(), setSel((s) => Math.max(s - 1, 0)));
            else if (e.key === "Enter") pick(sel());
          }}
        />
      </div>
      <div class="palette-list" id="path-list" role="listbox" aria-label={t("review.filesLabel")}>
        <For each={hits()} fallback={<div class="palette-empty"><span class="t2">{t("chrome.noMatchesFor", { q: q().trim() })}</span></div>}>
          {(h, i) => (
            <div class="palette-item mono" role="option" aria-selected={i() === sel()} classList={{ selected: i() === sel() }} onMouseMove={() => sel() !== i() && setSel(i())} onClick={() => pick(i())}>
              <span class="palette-icon">
                <Icon name="chevron-right" />
              </span>
              <span class="ellipsis grow">
                <For each={h.m ? segments(h.path, h.m.positions) : [[h.path, false] as [string, boolean]]}>{([s, hit]) => (hit ? <span class="hl">{s}</span> : s)}</For>
              </span>
              {/* The same reading the tree shows, so the two places agree. */}
              <Show when={props.fileOf(h.path)}>
                {(f) => (
                  <span class="num tree-stat t3">
                    <span class="diff-add">+{f().additions}</span> <span class="diff-del">−{f().deletions}</span>
                  </span>
                )}
              </Show>
            </div>
          )}
        </For>
      </div>
      <div class="palette-foot">
        <span>{t("chrome.paletteHints")}</span>
        <span class="grow" />
        <span class="num">{t("chrome.paletteCount", { n: hits().length })}</span>
      </div>
    </Overlay>
  );
}
