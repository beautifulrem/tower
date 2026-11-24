/**
 * Evidence-Driven Review Theater (docs/04 §4.6, docs/18 §18.4): full-screen
 * risk-ordered review units, Snapshot Timeline scope switcher (`All Changes` ·
 * `Since Last Review` · `Last Turn` · `Compare Runs…`), AST semantic noise
 * collapse, dashed "Agent claims why" unit narrative, Split-Geometry
 * virtualized diff, Steering Dispatch tray, and physical Acceptance Seal.
 */
import { For, Show, createEffect, createMemo, createResource, createSignal, on, onCleanup } from "solid-js";

import { Icon, Seal } from "../components/Glyph";
import { CriteriaBar, discountedOf } from "../components/Honesty";
import { Button, Empty, Failed, IconButton, Kbd, Loading, settled } from "../components/ui";
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
import type { ExtReviewUnit, ExtReviewView } from "./goal/ext";
import { FileDiff } from "./review/FileDiff";
import { type ReviewScope, TimelineSwitcher, buildSnapshots, lastTurnRev } from "./review/Timeline";
import { type ReviewNote, ReviewNotes, UnitNarrative } from "./review/notes";
import { AcceptPanel, ChangesPanel, VerifyPanel } from "./review/panels";
import { PathPalette, TreeRow, UnitItem } from "./review/sidebar";
import { type Anchor, type Composing, type Panel, type Reveals } from "./review/types";

const RELOAD_VIEW = new Set(["pinned", "human_edited", "rolled_back"]);
const RELOAD_DETAIL = new Set(["pinned", "human_edited", "rolled_back", "sentinel_hit", "verify_finished", "criterion_result", "claim_reviewed", "human_check", "original_tests_result"]);
const TREE_FROM = 2;
type HunkRef = { path: string; index: number };

/**
 * The pin pair goes first, and only for want of room: shown when, with it, the verification group keeps every part
 * (nothing wraps onto its hidden second line) and the line does not run over. Measured again when the line or the
 * group changes size.
 */
function fitPins(stats: HTMLDivElement) {
  const fit = () => {
    stats.classList.remove("pins-off");
    const verify = stats.querySelector<HTMLElement>(".review-verify");
    // A part drops when the group wraps onto its hidden line, or when the criteria bar does inside itself.
    const wraps = (el: HTMLElement | null | undefined) => !!el && el.scrollHeight > el.clientHeight + 1;
    const over = stats.scrollWidth > stats.clientWidth + 1 || wraps(verify) || wraps(verify?.querySelector<HTMLElement>(".criteria-bar"));
    stats.classList.toggle("pins-off", over);
  };
  const ro = new ResizeObserver(fit);
  ro.observe(stats);
  const watchVerify = new MutationObserver(() => {
    const verify = stats.querySelector(".review-verify");
    if (verify) ro.observe(verify);
    fit();
  });
  watchVerify.observe(stats, { childList: true, subtree: true, characterData: true });
  const verify = stats.querySelector(".review-verify");
  if (verify) ro.observe(verify);
  onCleanup(() => (ro.disconnect(), watchVerify.disconnect()));
}

export function Review(props: { id: string }) {
  const [persisted] = createResource<ReviewState>(() => loadReviewState(props.id));
  const [detailRes, { refetch: refetchDetail }] = createResource(() => props.id, api.goal);
  const detail = () => settled(detailRes);

  const previous = () => persisted()?.reviewed ?? null;
  const [scope, setScope] = createSignal<ReviewScope>("all");
  const [cmp, setCmp] = createSignal<[string, string]>(["", ""]);
  let lastSnaps: ReturnType<typeof buildSnapshots> = [];

  const [viewRes, { refetch: refetchView }] = createResource(
    () => {
      if (persisted.loading) return null;
      const sc = scope(), [f, to] = cmp();
      if (sc === "since_last") return { id: props.id, sc, since: previous(), to: null as string | null };
      if (sc === "last_turn") return { id: props.id, sc, since: lastTurnRev(lastSnaps, lastSnaps.at(-1)?.rev), to: null as string | null };
      if (sc === "compare" && f && to) return { id: props.id, sc, since: f, to };
      return { id: props.id, sc: "all" as ReviewScope, since: null as string | null, to: null as string | null };
    },
    async (k): Promise<ExtReviewView> => {
      if (!k) throw new Error("loading");
      const r = k.sc === "compare" && k.since && k.to ? await api.compareSnapshots(k.id, k.since, k.to).catch(() => null) : null;
      return r ?? ((await api.review(k.id, k.since)) as ExtReviewView);
    },
  );

  const view = () => settled(viewRes);
  // Only the first load replaces the page; a refetch after an undo or a save keeps your place in the diff.
  const firstLoad = () => viewRes.state === "pending" || viewRes.state === "unresolved";

  const snapshots = createMemo(() => {
    const s = buildSnapshots(view(), detail(), previous());
    if (s.length > lastSnaps.length) lastSnaps = s;
    return s;
  });

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
  const off = onTrace(props.id, (e) => {
    if (RELOAD_DETAIL.has(e.event.kind)) void refetchDetail();
    if (RELOAD_VIEW.has(e.event.kind)) (resetTexts(true), void refetchView());
  });
  onCleanup(off);

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
  const toggleViewed = (f: DiffFile, onVal = !isViewed(f)) => {
    const v = { ...viewedMap() };
    if (onVal) v[f.path] = fileHash(f);
    else delete v[f.path];
    setViewedMap(v);
    persist.viewed(props.id, v);
  };
  const unitViewed = (u: ReviewUnit) => {
    const v = view();
    return !!v && v.files.filter((f) => u.files.includes(f.path)).every(isViewed);
  };

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
  // Undo, edit and apply work on the whole change (base → pin): a hunk index or a file's text from a narrower
  // scope, or from a view still loading, would point at different code.
  const editable = () => (g()?.state === "paused" || g()?.state === "in_review") && scope() === "all" && !viewRes.loading;

  const [texts, setTexts] = createSignal<Record<string, string[] | null>>({});
  const [reveals, setReveals] = createSignal<Record<string, Reveals>>({});
  const [whole, setWhole] = createSignal<Record<string, boolean>>({});
  const [editingPath, setEditingPath] = createSignal<string | null>(null);
  // What is typed in the editor lives here, not in the editor: a refetch rebuilds the file rows, and the editor with them.
  const [editDraft, setEditDraft] = createSignal<string | null>(null);
  // Each read in flight, by path. A reset or a save drops its entry, so the read finds it has been outrun and its
  // text, from the snapshot before, never lands where Edit and Apply would write it back over newer code.
  const loading = new Map<string, object>();
  // The file open in the editor when the snapshot moved on under it: its text is from the snapshot before, so it
  // serves the editor alone, a save checks the file first, and it goes when the editor closes.
  const [staleEdit, setStaleEdit] = createSignal<string | null>(null);
  // Texts and expanded context belong to one snapshot: a new pin or another scope drops them. A reload the engine
  // starts keeps the file open in the editor, and its text, so what you typed there is not lost.
  const resetTexts = (keepEditor = false) => {
    const keep = keepEditor ? editingPath() : null;
    loading.clear();
    setTexts((m) => (keep && m[keep] ? { [keep]: m[keep] } : {}));
    setReveals({});
    setWhole({});
    setStaleEdit(keep);
    if (!keep) (setEditingPath(null), setEditDraft(null));
  };
  const dropText = (path: string) =>
    setTexts((m) => {
      const n = { ...m };
      delete n[path];
      return n;
    });
  const closeEditor = () => {
    const p = editingPath();
    setEditingPath(null);
    setEditDraft(null);
    if (p && staleEdit() === p) (dropText(p), setStaleEdit(null));
  };
  const ensureText = async (f: DiffFile): Promise<string[] | null> => {
    const have = texts()[f.path];
    if (staleEdit() === f.path) return null;
    if (have !== undefined) return have;
    // While the view reloads its pin is the one before: a read now would be of the old snapshot.
    if (loading.has(f.path) || viewRes.loading) return null;
    const mine = {};
    loading.set(f.path, mine);
    const current = () => loading.get(f.path) === mine;
    const pin = view()?.pin ?? null;
    try {
      const raw = await api.fileText(props.id, f.path, f.status === "deleted", pin);
      if (!current() || (view()?.pin ?? null) !== pin) return null;
      const lines = raw === null ? null : splitLines(raw);
      setTexts((m) => ({ ...m, [f.path]: lines }));
      return lines;
    } catch (e) {
      if (current()) toast("error", errorText(e), { goalId: props.id });
      return null;
    } finally {
      if (current()) loading.delete(f.path);
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
  const changed = async (f: DiffFile) => {
    loading.delete(f.path);
    dropText(f.path);
    setReveals((m) => ({ ...m, [f.path]: {} }));
    await Promise.all([refetchView(), refetchDetail()]);
  };
  const undoHunk = async (f: DiffFile, hunk: number) => {
    // The file open in the editor is changed through the editor: undo under it would unmount it with its text.
    if (editingPath() === f.path) return;
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
  const editFile = async (f: DiffFile) => {
    const lines = await ensureText(f);
    if (lines) (setEditDraft(null), setEditingPath(f.path));
  };
  const saveFile = async (f: DiffFile, text: string) => {
    if (staleEdit() === f.path) {
      // The editor was opened on an older snapshot: a save must not quietly undo what came since.
      const opened = texts()[f.path]?.join("\n");
      // No pin: the supervisor's latest. The view's may still be the one before while it reloads.
      const now = await api.fileText(props.id, f.path, false, null).catch(() => undefined);
      const moved = now === undefined || (now === null ? null : splitLines(now).join("\n")) !== opened;
      if (moved && !(await ask(t("review.fileMovedConfirm", { path: f.path }), { ok: t("common.save"), cancel: t("common.cancel"), kind: "warning" }))) return;
    }
    const done = await act(() => api.writeFile(props.id, f.path, text), t("review.fileSaved"));
    if (done === undefined) return;
    setEditingPath(null);
    setEditDraft(null);
    setStaleEdit(null);
    await changed(f);
  };
  const applyTo = async (f: DiffFile, line: number, suggestion: string) => {
    if (editingPath() === f.path) return;
    const lines = await ensureText(f);
    if (!lines) return;
    const text = applySuggestion(lines.join("\n") + "\n", line, suggestion);
    const done = await act(() => api.writeFile(props.id, f.path, text), t("review.suggestionApplied"));
    if (done === undefined) return;
    await changed(f);
  };

  const units = (): ExtReviewUnit[] => view()?.units ?? [];
  // A narrower scope can have fewer units than the one you were on.
  createEffect(on(units, (u) => setUnitIdx((i) => Math.min(i, Math.max(0, u.length - 1))), { defer: true }));
  const unit = (): ExtReviewUnit | undefined => units()[unitIdx()];
  const files = createMemo(() => {
    const u = unit();
    const v = view();
    if (!u || !v) return [];
    const order = treeOrder(u.files, unitUnder(u));
    return v.files.filter((f) => u.files.includes(f.path)).sort((a, b) => order.indexOf(a.path) - order.indexOf(b.path));
  });
  const allPaths = createMemo(() => view()?.files.map((f) => f.path) ?? []);
  const fileByPath = (path: string) => view()?.files.find((f) => f.path === path);

  const range = () => (view() ? `${view()!.from}..${view()!.pin}` : null);
  const [accepted, setAccepted] = createSignal<Record<string, number[]>>({});
  createEffect(
    on([range, persisted], ([r, p]) => {
      if (!r || !p) return;
      setAccepted(p.accepted && p.accepted.range === r ? p.accepted.files : {});
    }),
  );
  const isAccepted = (f: DiffFile, hunk: number) => (accepted()[f.path] ?? []).includes(hunk);
  const unitAccepted = createMemo(() => files().reduce((n, f) => n + (accepted()[f.path] ?? []).filter((i) => i < f.hunks.length).length, 0));
  const unitHunks = createMemo(() => files().reduce((n, f) => n + f.hunks.length, 0));
  const setHunkAccepted = (f: DiffFile, hunk: number, onVal: boolean) => {
    const r = range();
    if (!r) return;
    const have = accepted()[f.path] ?? [];
    const list = onVal ? [...new Set([...have, hunk])].sort((a, b) => a - b) : have.filter((i) => i !== hunk);
    const next = { ...accepted() };
    if (list.length) next[f.path] = list;
    else delete next[f.path];
    setAccepted(next);
    persist.accepted(props.id, { range: r, files: next });
    if (onVal && list.length === f.hunks.length) toggleViewed(f, true);
    if (!onVal && isViewed(f)) toggleViewed(f, false);
  };

  const hunks = createMemo<HunkRef[]>(() => files().flatMap((f) => f.hunks.map((_, index) => ({ path: f.path, index }))));
  const [pick, setPick] = createSignal<HunkRef | null>(null);
  const markedRead = (h: HunkRef) => !!fileByPath(h.path) && isAccepted(fileByPath(h.path)!, h.index);
  const current = createMemo<HunkRef | null>(() => {
    const p = pick();
    return hunks().find((h) => p && h.path === p.path && h.index === p.index) ?? hunks().find((h) => !markedRead(h)) ?? hunks()[0] ?? null;
  });
  const isCurrent = (f: DiffFile, hunk: number) => current()?.path === f.path && current()?.index === hunk;
  const nextUnread = (h: HunkRef) => hunks().slice(hunks().findIndex((x) => x.path === h.path && x.index === h.index) + 1).find((x) => !markedRead(x)) ?? null;

  let acceptLog: HunkRef[] = [];
  const same = (a: HunkRef) => (b: HunkRef) => a.path === b.path && a.index === b.index;
  const acceptHunk = (f: DiffFile, hunk: number) => {
    const h = { path: f.path, index: hunk };
    if (!isAccepted(f, hunk)) {
      setHunkAccepted(f, hunk, true);
      acceptLog = [...acceptLog.filter((x) => !same(h)(x)), h];
    }
    const next = nextUnread(h);
    moveTo(next ?? h);
  };
  const unacceptHunk = (f: DiffFile, hunk: number) => {
    if (!isAccepted(f, hunk)) return;
    const h = { path: f.path, index: hunk };
    acceptLog = acceptLog.filter((x) => !same(h)(x));
    setHunkAccepted(f, hunk, false);
    const u = units().findIndex((x) => x.files.includes(f.path));
    if (u >= 0 && u !== unitIdx()) setUnitIdx(u);
    moveTo(h);
    toast("info", t("review.hunkUnaccepted", { path: f.path }), { action: { label: t("review.acceptAgain"), run: () => acceptHunk(f, hunk) } });
  };
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
  const topIn = (pane: HTMLElement, el: HTMLElement) => el.getBoundingClientRect().top - pane.getBoundingClientRect().top + pane.scrollTop;
  const risingBy = (el: HTMLElement) =>
    [...document.querySelectorAll<HTMLElement>(".hunk-fold-inner")].filter((f) => f.getBoundingClientRect().top < el.getBoundingClientRect().top).reduce((n, f) => n + f.offsetHeight, 0);
  let ownScroll = false;
  const moveTo = (h: HunkRef) => {
    setPick(h);
    requestAnimationFrame(() => {
      const pane = paneEl();
      if (!pane) return;
      const head = headOf(pane, h);
      if (!head) {
        // Off-screen virtualized hunk: ask VirtualBody to scroll directly to its prefix-sum offset.
        ownScroll = true;
        pane.dispatchEvent(new CustomEvent("tower:scroll-hunk", { detail: h }));
        requestAnimationFrame(() => requestAnimationFrame(() => (ownScroll = false)));
        return;
      }
      const top = topIn(pane, head) - risingBy(head);
      if (top >= pane.scrollTop + 40 && top + 64 <= pane.scrollTop + pane.clientHeight) return;
      ownScroll = true;
      requestAnimationFrame(() => requestAnimationFrame(() => (ownScroll = false)));
      pane.scrollTo({ top: Math.max(0, top - 40) });
    });
  };
  const jumpHunk = (dir: 1 | -1) => {
    const c = current();
    const i = c ? hunks().findIndex((x) => x.path === c.path && x.index === c.index) : -1;
    const target = hunks()[i + dir];
    if (target) moveTo(target);
  };
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
        when: editable,
      },
      { key: "mod+p", run: () => setPathJump((o) => !o), inInputs: true, desc: () => t("keys.pathJump") },
      { key: "mod+shift+enter", run: () => setPanel("accept"), inInputs: true, desc: () => t("review.accept") },
      { key: "c", run: () => setPanel("changes"), desc: () => t("review.requestChanges"), when: () => units().length > 0 },
      { key: "escape", run: () => (composer() ? setComposer(null) : editingPath() ? closeEditor() : back()) },
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

  const finish = () => {
    const next = advanceQueue(props.id);
    if (next) {
      toast("info", t("review.queueNext", { id: next }), { ttl: 2500 });
      go({ name: "review", id: next });
    } else back();
  };

  const notes = createMemo<ReviewNote[]>(() => {
    const out: ReviewNote[] = (detail()?.sentinels ?? []).map((h) => ({ danger: h.severity >= 3, text: h.title, sentinel: true }));
    for (const r of unit()?.risk_reasons ?? []) out.push({ danger: false, text: r });
    if (detail() && !detail()!.has_held_out_tests && (g()?.progress.machine ?? 0) > 0)
      out.push({ danger: false, text: t("goal.noHeldOut"), action: { label: t("goal.setHeldOut"), run: () => g() && goProjectSetting(g()!.project_id, "holdout") } });
    return out;
  });
  const highSentinelTitles = createMemo(() => (detail()?.sentinels ?? []).filter((h) => h.severity >= 3).map((h) => h.title));
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
            <div class="review-stats meta halt" ref={fitPins}>
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
              <TimelineSwitcher scope={scope()} onScope={(sc) => (setScope(sc), setPick(null), resetTexts())} previous={previous()} pin={view()?.pin} snapshots={snapshots()} fromRev={cmp()[0]} toRev={cmp()[1]} onCompare={(f, to) => (setCmp([f, to]), resetTexts())} />
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

      <Show when={!firstLoad() && !persisted.loading} fallback={<div class="page-loading"><Loading text={t("review.loading")} /></div>}>
        <Show
          when={!viewRes.error}
          fallback={
            <div class="page-loading">
              {/* A goal that is gone: Retry can never bring it back, the overview is the way on (as on its goal page). */}
              <Show when={!g() && detailRes.error} fallback={<Failed title={t("review.loadFailed")} error={viewRes.error} onRetry={() => void refetchView()} />}>
                <Empty title={t("goal.notFound", { id: props.id })} kind="error" action={<Button size="s" variant="ghost" onClick={() => go({ name: "overview" })}>{t("chrome.openOverview")}</Button>}>
                  {errorText(detailRes.error)}
                </Empty>
              </Show>
            </div>
          }
        >
          <Show
            when={units().length > 0}
            fallback={
              <div class="page-loading">
                <Empty
                  title={t("review.noChanges")}
                  poster
                  action={
                    <Button size="s" onClick={() => go({ name: "goal", id: props.id })}>
                      {t("review.openGoal")}
                    </Button>
                  }
                >
                  {scope() !== "all" ? t("review.noChangesSince") : t("review.noChangesBody")}
                </Empty>
              </div>
            }
          >
            <div class="review-body" classList={{ solo: solo() && !showTree() }}>
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
                {/* Dashed Claim card for this review unit (sits above ReviewNotes so ReviewNotes stays flush over .file). */}
                <UnitNarrative claim={unit()?.unit_claim_summary} riskReasons={unit()?.risk_reasons} highSentinels={highSentinelTitles()} />
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
                      onViewed={(onVal) => toggleViewed(f, onVal)}
                      onOpen={(line) => void act(() => api.openFile(props.id, f.path, line))}
                      accepted={(hunk) => isAccepted(f, hunk)}
                      current={(hunk) => isCurrent(f, hunk)}
                      onAccept={(hunk) => (isAccepted(f, hunk) ? unacceptHunk(f, hunk) : acceptHunk(f, hunk))}
                      onUndo={editable() ? (hunk) => void undoHunk(f, hunk) : undefined}
                      editing={editingPath() === f.path}
                      onEditFile={editable() ? () => void editFile(f) : undefined}
                      onSaveFile={(text) => void saveFile(f, text)}
                      onCancelEdit={closeEditor}
                      editDraft={editDraft()}
                      onEditDraft={setEditDraft}
                      onApplySuggestion={editable() ? (line, s) => void applyTo(f, line, s) : undefined}
                      movedHunks={view()?.moved_hunks?.[f.path]}
                      formattingHunks={view()?.formatting_hunks?.[f.path]}
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

      <div class="review-status halt">
        <span class="review-keys">
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
            <span title={t("review.acceptHunkNote")}>
              <Kbd k="a" /> {t("review.keyAccept")}
            </span>
            <span>
              <Kbd k="shift+a" /> {t("review.keyTakeBack")}
            </span>
          </Show>
          <span>
            <Kbd k="?" /> {t("keys.allKeys")}
          </span>
        </span>
        <span class="grow" />
        <Show when={comments().length > 0}>
          <button class="dispatch-pill" onClick={() => setPanel("changes")}>
            <Icon name="return" size={10} />
            {comments().length} queued for steering
            <Kbd k="c" />
          </button>
        </Show>
        <Show when={unitAccepted() > 0}>
          <span class="num review-accepted" title={t("review.acceptHunkNote")}>
            <Icon name="check" size={10} />
            <Show when={unitAccepted() < unitHunks()} fallback={t("review.hunksAllAccepted", { n: unitHunks() })}>
              {t("review.hunksAccepted", { n: unitAccepted(), total: unitHunks() })}
            </Show>
            <Show when={unitAccepted() === unitHunks() && unitIdx() < units().length - 1}>
              <span class="sep" aria-hidden="true">·</span>
              <Kbd k="v" /> {t("review.keyNextUnit")}
            </Show>
            <Show when={unitAccepted() === unitHunks() && unitIdx() === units().length - 1 && g()?.state === "in_review"}>
              <span class="sep" aria-hidden="true">·</span>
              <Kbd k="mod+shift+enter" /> {t("review.accept")}
            </Show>
          </span>
        </Show>
        <Show when={units().length > 1}>
          <span class="num unit-counter">{t("review.unitOf", { i: unitIdx() + 1, n: units().length })}</span>
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
        <VerifyPanel id={props.id} detail={detail()} loading={detailRes.loading} onClose={() => setPanel(null)} />
      </Show>
      <Show when={pathJump()}>
        <PathPalette paths={allPaths()} fileOf={fileByPath} onClose={() => setPathJump(false)} onPick={(p) => (setPathJump(false), jumpToFile(p))} />
      </Show>
    </div>
  );
}
