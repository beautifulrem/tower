/**
 * Review (docs/04 §4.6): full-screen — the sidebar leaves too — risk-ordered
 * review units of at most ~300 lines. A comment on a line is a steering
 * instruction; "request changes" sends them all back to the agent.
 * Accepting writes a local branch, never a push.
 *
 * At ≥1280px the diff can sit side by side (⌥V, remembered per goal). The
 * verification readout (E) shows every criterion's result and output tail
 * without leaving the diff. While the goal is paused or in review the
 * workspace is yours to touch: a hunk can be reverted (U), a file edited in
 * place, a comment's suggestion applied; the snapshot then changes and the
 * review reloads. A file tree on the left and ⌘P jump by path. A review
 * queue (from Needs you) opens the next goal when this one is done. The
 * pieces live in `review/`: `FileDiff` (the table), `panels` (the three
 * sheets), `types`.
 */
import { For, Show, createEffect, createMemo, createResource, createSignal, on, onCleanup } from "solid-js";

import { Icon, Seal } from "../components/Glyph";
import { CriteriaBar, discountedOf } from "../components/Honesty";
import { Button, Empty, IconButton, Kbd, Loading } from "../components/ui";
import type { DiffFile } from "../gen/DiffFile";
import type { ReviewUnit } from "../gen/ReviewUnit";
import { api, errorText } from "../lib/api";
import { type Gap, splitLines } from "../lib/diffview";
import { buildTree, treeOrder, unitUnder } from "../lib/filetree";
import { count, short } from "../lib/format";
import { t } from "../lib/i18n";
import { useKeys } from "../lib/keys";
import { ask } from "../lib/native";
import { back, go, goProjectSetting } from "../lib/nav";
import { advanceQueue, queuePosition } from "../lib/reviewQueue";
import { type Draft, type Layout, type ReviewState, fileHash, loadReviewState, persist } from "../lib/reviewState";
import { act, onTrace, state, toast } from "../lib/store";
import { applySuggestion } from "../lib/suggest";
import { FileDiff } from "./review/FileDiff";
import { type ReviewNote, ReviewNotes } from "./review/notes";
import { AcceptPanel, ChangesPanel, VerifyPanel } from "./review/panels";
import { PathPalette, TreeRow, UnitItem } from "./review/sidebar";
import { type Anchor, type Composing, type Panel, type Reveals } from "./review/types";

/** Trace kinds after which the review or the goal's facts may have changed. */
const RELOAD_VIEW = new Set(["pinned", "human_edited", "rolled_back"]);
const RELOAD_DETAIL = new Set(["pinned", "human_edited", "rolled_back", "sentinel_hit", "verify_finished", "criterion_result", "claim_reviewed", "human_check", "original_tests_result"]);

/** The tree is worth its column from this many files. */
const TREE_FROM = 2;

/** A hunk by its file and its index in that file. */
type HunkRef = { path: string; index: number };

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
    // In the tree's order: the diff reads, and ] walks, the list the sidebar shows.
    const order = treeOrder(u.files, unitUnder(u));
    return v.files.filter((f) => u.files.includes(f.path)).sort((a, b) => order.indexOf(a.path) - order.indexOf(b.path));
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

  // The current hunk is state: what ] and [ move, what A accepts and U undoes, marked on its header. It is never
  // read back from the scroll position — a diff that fits the pane does not scroll — except when you scroll it out of
  // sight yourself; then the hunk at the top of the pane takes over. Unset, it is the unit's first unaccepted hunk.
  const hunks = createMemo<HunkRef[]>(() => files().flatMap((f) => f.hunks.map((_, index) => ({ path: f.path, index }))));
  const [pick, setPick] = createSignal<HunkRef | null>(null);
  const markedRead = (h: HunkRef) => !!fileByPath(h.path) && isAccepted(fileByPath(h.path)!, h.index);
  const current = createMemo<HunkRef | null>(() => {
    const p = pick();
    return hunks().find((h) => p && h.path === p.path && h.index === p.index) ?? hunks().find((h) => !markedRead(h)) ?? hunks()[0] ?? null;
  });
  const isCurrent = (f: DiffFile, hunk: number) => current()?.path === f.path && current()?.index === hunk;
  /** The next hunk after `h` without your mark, else none. */
  const nextUnread = (h: HunkRef) => hunks().slice(hunks().findIndex((x) => x.path === h.path && x.index === h.index) + 1).find((x) => !markedRead(x)) ?? null;

  // The accepts of this sitting, oldest first: what ⇧A takes back when the current hunk carries no mark — A has
  // already moved on, so "that was a mistake" is about the hunk you just left, as ⌘Z is about the last thing done.
  let acceptLog: HunkRef[] = [];
  const same = (a: HunkRef) => (b: HunkRef) => a.path === b.path && a.index === b.index;
  /** Accepts a hunk (A, or its header's button) and moves to the next one still to read. A only ever accepts. */
  const acceptHunk = (f: DiffFile, hunk: number) => {
    const h = { path: f.path, index: hunk };
    if (!isAccepted(f, hunk)) {
      setHunkAccepted(f, hunk, true);
      acceptLog = [...acceptLog.filter((x) => !same(h)(x)), h];
    }
    const next = nextUnread(h);
    moveTo(next ?? h);
  };
  /** Takes your mark back (⇧A, or the accepted header's button): the hunk unfolds and becomes current, and a receipt says so. */
  const unacceptHunk = (f: DiffFile, hunk: number) => {
    if (!isAccepted(f, hunk)) return;
    const h = { path: f.path, index: hunk };
    acceptLog = acceptLog.filter((x) => !same(h)(x));
    setHunkAccepted(f, hunk, false);
    // The last accept may be in another unit (A, then V): its unit comes back on screen with it.
    const u = units().findIndex((x) => x.files.includes(f.path));
    if (u >= 0 && u !== unitIdx()) setUnitIdx(u);
    moveTo(h);
    toast("info", t("review.hunkUnaccepted", { path: f.path }), { action: { label: t("review.acceptAgain"), run: () => acceptHunk(f, hunk) } });
  };
  /**
   * ⇧A: the current hunk's mark if it has one; otherwise the most recent accept still standing. With neither, it
   * says why nothing happened — never a key that does nothing.
   */
  const takeBack = () => {
    const h = currentFile();
    if (h && isAccepted(h.f, h.index)) return unacceptHunk(h.f, h.index);
    const last = [...acceptLog].reverse().find((x) => !!fileByPath(x.path) && isAccepted(fileByPath(x.path)!, x.index));
    if (last) return unacceptHunk(fileByPath(last.path)!, last.index);
    toast("info", unitAccepted() > 0 ? t("review.takeBackEarlier") : t("review.nothingToTakeBack"));
  };

  const selectUnit = (i: number) => {
    setUnitIdx(Math.max(0, Math.min(units().length - 1, i)));
    setPick(null);
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

  const paneEl = () => document.querySelector<HTMLElement>(".review-diff");
  const headOf = (pane: HTMLElement, h: HunkRef) => pane.querySelector<HTMLElement>(`.hunk-head[data-hunk-path="${CSS.escape(h.path)}"][data-hunk-index="${h.index}"]`);
  /** A row's top in the pane's scroll space (a table row's offsetTop is relative to its table, not the pane). */
  const topIn = (pane: HTMLElement, el: HTMLElement) => el.getBoundingClientRect().top - pane.getBoundingClientRect().top + pane.scrollTop;
  /** How far an element will still rise: the folds closing above it (a hunk you just accepted shrinks to its header). */
  const risingBy = (el: HTMLElement) =>
    [...document.querySelectorAll<HTMLElement>(".hunk-fold-inner")].filter((f) => f.getBoundingClientRect().top < el.getBoundingClientRect().top).reduce((n, f) => n + f.offsetHeight, 0);
  // Scrolling the pane yourself is the one way the current hunk follows the view: our own scrolls are not that.
  let ownScroll = false;
  /** Makes a hunk current and brings its header into view where it will settle — only if it is not there already. */
  const moveTo = (h: HunkRef) => {
    setPick(h);
    requestAnimationFrame(() => {
      const pane = paneEl();
      const head = pane && headOf(pane, h);
      if (!pane || !head) return;
      const top = topIn(pane, head) - risingBy(head);
      // Below the file header that sticks to the pane's top, and with a row of the hunk under it.
      if (top >= pane.scrollTop + 40 && top + 64 <= pane.scrollTop + pane.clientHeight) return;
      // The scroll event our own scroll causes arrives before the next frame; past that, scrolling is yours again.
      ownScroll = true;
      requestAnimationFrame(() => requestAnimationFrame(() => (ownScroll = false)));
      pane.scrollTo({ top: Math.max(0, top - 40) });
    });
  };
  /** ] and [: the next or previous hunk of the unit, in order, the accepted ones included. */
  const jumpHunk = (dir: 1 | -1) => {
    const c = current();
    const i = c ? hunks().findIndex((x) => x.path === c.path && x.index === c.index) : -1;
    const target = hunks()[i + dir];
    if (target) moveTo(target);
  };
  /** After you scroll: if no line of the current hunk is in sight, the hunk whose header is at (or last passed) the top takes over. */
  const onPaneScroll = (e: Event) => {
    if (ownScroll) return;
    const pane = e.currentTarget as HTMLElement;
    const c = current();
    const head = c && headOf(pane, c);
    if (head) {
      const rows = [head, ...head.closest("tbody")!.querySelectorAll<HTMLElement>(`tr.dl[data-hunk="${c!.index}"]`)];
      const top = rows[0].getBoundingClientRect().top;
      const bottom = rows[rows.length - 1].getBoundingClientRect().bottom;
      const box = pane.getBoundingClientRect();
      if (bottom > box.top + 40 && top < box.bottom) return;
    }
    const heads = [...pane.querySelectorAll<HTMLElement>(".hunk-head[data-hunk-index]")];
    const head2 = [...heads].reverse().find((h) => topIn(pane, h) <= pane.scrollTop + 52) ?? heads[0];
    if (head2) setPick({ path: head2.dataset.hunkPath ?? "", index: Number(head2.dataset.hunkIndex) });
  };
  const currentFile = () => {
    const c = current();
    const f = c && fileByPath(c.path);
    return c && f ? { f, index: c.index } : null;
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
          const h = currentFile();
          if (h) acceptHunk(h.f, h.index);
        },
        desc: () => t("keys.acceptHunk"),
      },
      { key: "shift+a", run: takeBack, desc: () => t("review.unacceptKey") },
      {
        key: "u",
        run: () => {
          const h = currentFile();
          if (editable() && h) void undoHunk(h.f, h.index);
        },
        desc: () => t("keys.undoHunk"),
        // Listed in the sheet exactly when the status bar lists it: while the workspace is yours to touch.
        when: editable,
      },
      { key: "mod+p", run: () => setPathJump((o) => !o), inInputs: true, desc: () => t("keys.pathJump") },
      { key: "mod+shift+enter", run: () => setPanel("accept"), inInputs: true, desc: () => t("review.accept") },
      { key: "c", run: () => setPanel("changes"), desc: () => t("review.requestChanges"), when: () => units().length > 0 },
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

  const notes = createMemo<ReviewNote[]>(() => {
    // A sentinel's note is its sentence; the band names them once, as a group, instead of "Sentinel ·" on every line.
    const out: ReviewNote[] = (detail()?.sentinels ?? []).map((h) => ({ danger: h.severity >= 3, text: h.title, sentinel: true }));
    for (const r of unit()?.risk_reasons ?? []) out.push({ danger: false, text: r });
    if (detail() && !detail()!.has_held_out_tests && (g()?.progress.machine ?? 0) > 0)
      out.push({ danger: false, text: t("goal.noHeldOut"), action: { label: t("goal.setHeldOut"), run: () => g() && goProjectSetting(g()!.project_id, "holdout") } });
    return out;
  });
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
                  <span>{t("common.files", { n: view()!.stat.files })}</span>
                  <Show when={!solo()}>
                    <span>{t("review.units", { n: units().length })}</span>
                  </Show>
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
                  <Seal pin={g()!.verified_pin} large tampered={discountedOf(detail()?.criteria) > 0} />
                  <CriteriaBar progress={g()!.progress} criteria={detail()?.criteria} compact />
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
        {/* With nothing changed there is nothing to send back: the header keeps only what still applies. */}
        <Show when={units().length > 0}>
          <Button onClick={() => setPanel("changes")} kbd="c">
            {t("review.requestChanges")}
            {comments().length ? t("review.commentCount", { n: comments().length }) : ""}
          </Button>
        </Show>
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
                  {/* The tree is a tree: each unit's row is an open tree item and its files are the group under it; with one unit the files stand at the root. */}
                  <div class="tree" role="tree" aria-label={t("review.filesLabel")}>
                    <For each={units()}>
                      {(u, i) => {
                        const rows = () => (
                          <For each={buildTree(u.files, unitUnder(u))}>
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
                        );
                        return (
                          <Show when={!solo()} fallback={<div class="unit-group">{rows()}</div>}>
                            <div class="unit-group">
                              <UnitItem u={u} active={i() === unitIdx()} viewed={unitViewed(u)} onClick={() => selectUnit(i())} />
                              <div role="group" aria-label={u.title}>
                                {rows()}
                              </div>
                            </div>
                          </Show>
                        );
                      }}
                    </For>
                  </div>
                </aside>
              </Show>
              <div class="review-diff" onScroll={onPaneScroll}>
                {/* What to know before reading, as one band over the diff (review/notes.tsx): the sentinels, this unit's risks,
                    and — said once, as on the goal page — that only the visible tests vouch for this, with the way to add held-out ones. */}
                <ReviewNotes notes={notes()} />
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
                      current={(hunk) => isCurrent(f, hunk)}
                      onAccept={(hunk) => (isAccepted(f, hunk) ? unacceptHunk(f, hunk) : acceptHunk(f, hunk))}
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
        {/* With nothing to review, only the keys that still do something: back, and the sheet. */}
        <Show
          when={units().length > 0}
          fallback={
            <span>
              <Kbd k="escape" /> {t("keys.back")}
            </span>
          }
        >
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
          <span>
            <Kbd k="shift+a" /> {t("review.keyTakeBack")}
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
        </Show>
        <span>
          <Kbd k="?" /> {t("keys.allKeys")}
        </span>
        <span class="grow" />
        <Show when={units().length > 0}>
          <span class="status-mouse t4">{t("review.keyComment")}</span>
          <span class="status-mouse t4">{t("review.keyOpen")}</span>
        </Show>
        {/* Your reading marks on this unit, counted; the title says what they are not. With the last one, where to go: V for
            the next unit, or — on the last unit of a goal ready to accept — the accept sheet. */}
        <Show when={unitAccepted() > 0}>
          <span class="num review-accepted" title={t("review.acceptHunkNote")}>
            <Icon name="check" size={10} />
            <Show when={unitAccepted() < unitHunks()} fallback={t("review.hunksAllAccepted", { n: unitHunks() })}>
              {t("review.hunksAccepted", { n: unitAccepted(), total: unitHunks() })}
            </Show>
            <Show when={unitAccepted() === unitHunks() && unitIdx() < units().length - 1}>
              <span class="sep">·</span>
              <Kbd k="v" /> {t("review.keyNextUnit")}
            </Show>
            <Show when={unitAccepted() === unitHunks() && unitIdx() === units().length - 1 && g()?.state === "in_review"}>
              <span class="sep">·</span>
              <Kbd k="mod+shift+enter" /> {t("review.accept")}
            </Show>
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
