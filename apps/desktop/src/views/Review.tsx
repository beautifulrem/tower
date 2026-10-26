/**
 * Review (docs/04 §4.6): full-screen — the sidebar leaves too — risk-ordered
 * review units of at most ~300 lines. A comment on a line is a steering
 * instruction; "request changes" sends them all back to the agent.
 * Accepting writes a local branch, never a push.
 *
 * At ≥1280px the diff can sit side by side (⌥V, remembered per goal). The
 * verification readout (E) shows every criterion's result and output tail
 * without leaving the diff. While the goal is paused or in review a hunk can
 * be undone in the workspace; the snapshot then changes and the review
 * reloads. The pieces live in `review/`: `FileDiff` (the table), `panels`
 * (the three sheets), `types`.
 */
import { For, Show, createEffect, createMemo, createResource, createSignal, on, onCleanup } from "solid-js";

import { DangerMark, Icon, NoticeMark, Seal } from "../components/Glyph";
import { CriteriaBar } from "../components/Honesty";
import { Button, Empty, IconButton, Kbd, Loading } from "../components/ui";
import type { DiffFile } from "../gen/DiffFile";
import type { ReviewUnit } from "../gen/ReviewUnit";
import { api, errorText } from "../lib/api";
import { type Gap, splitLines } from "../lib/diffview";
import { count, short } from "../lib/format";
import { t } from "../lib/i18n";
import { useKeys } from "../lib/keys";
import { ask } from "../lib/native";
import { back, go } from "../lib/nav";
import { type Draft, type Layout, type ReviewState, fileHash, loadReviewState, persist } from "../lib/reviewState";
import { act, onTrace, state, toast } from "../lib/store";
import { FileDiff } from "./review/FileDiff";
import { AcceptPanel, ChangesPanel, VerifyPanel } from "./review/panels";
import { type Anchor, type Composing, type Panel, type Reveals } from "./review/types";

/** Trace kinds after which the review or the goal's facts may have changed. */
const RELOAD_VIEW = new Set(["pinned", "human_edited"]);
const RELOAD_DETAIL = new Set(["pinned", "human_edited", "sentinel_hit", "verify_finished", "criterion_result", "claim_reviewed", "human_check"]);

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
  const g = () => state.goals[props.id];
  // Hunks can be undone only while the agent is not in the workspace.
  const editable = () => g()?.state === "paused" || g()?.state === "in_review";

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
  /** Undoes one hunk in the workspace; the snapshot changes, so everything cached about the file goes. */
  const undoHunk = async (f: DiffFile, hunk: number) => {
    const ok = await ask(t("review.undoHunkConfirm", { path: f.path }), {
      title: t("review.undoHunkTitle"),
      ok: t("review.undoHunkVerb"),
      cancel: t("common.cancel"),
      kind: "warning",
    });
    if (!ok) return;
    const done = await act(() => api.revertHunk(props.id, f.path, hunk), t("review.hunkUndone"));
    if (done === undefined) return;
    setTexts((m) => {
      const n = { ...m };
      delete n[f.path];
      return n;
    });
    setReveals((m) => ({ ...m, [f.path]: {} }));
    await Promise.all([refetchView(), refetchDetail()]);
  };

  const units = () => view()?.units ?? [];
  const unit = () => units()[unitIdx()];
  const files = createMemo(() => {
    const u = unit();
    const v = view();
    if (!u || !v) return [];
    return v.files.filter((f) => u.files.includes(f.path));
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
  const viewedUnits = () => units().filter(unitViewed).length;

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
                    {(u, i) => <UnitItem u={u} active={i() === unitIdx()} viewed={unitViewed(u)} onClick={() => selectUnit(i())} />}
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
                      onUndo={editable() ? (hunk) => void undoHunk(f, hunk) : undefined}
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
          viewed={viewedUnits()}
          total={units().length}
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
function UnitItem(props: { u: ReviewUnit; active: boolean; viewed: boolean; onClick: () => void }) {
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
      </span>
    </button>
  );
}
