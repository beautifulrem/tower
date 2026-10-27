/**
 * Goal page (docs/04 §4.5): state, not stream. What the goal is for, how far
 * it is with evidence, what changed, what the agent claims and whether the
 * facts agree. The stream is one keystroke away (W).
 *
 * The page trims itself to the state: ready to accept, the "next" block is
 * one call to action; paused, the decision card owns the only text box and
 * the "next" block steps aside; running, the steer box sits at the bottom.
 */
import { For, Show, createEffect, createMemo, createResource, createSignal, lazy, on, onCleanup } from "solid-js";

import { DecisionCard, snoozeMenu } from "../components/DecisionCard";
import { LifecycleGlyph, NoticeMark, Seal } from "../components/Glyph";
import { discountedOf } from "../components/Honesty";
import { LiveLine } from "../components/Live";
import { PrLine } from "../components/Pr";
import { Button, Empty, Section, Loading } from "../components/ui";
import type { GoalDetail } from "../gen/GoalDetail";
import { api, errorText } from "../lib/api";
import { clock } from "../lib/format";
import { useKeys } from "../lib/keys";
import { useMenu } from "../lib/menu";
import { t, withLater } from "../lib/i18n";
import { effectiveEngine, engineLabel, pauseLabel, stateLabel } from "../lib/labels";
import { linger } from "../lib/linger";
import { go } from "../lib/nav";
import { act, onTrace, state, toast } from "../lib/store";
import { ContractRail } from "./goal/ContractRail";
import { GoalActions } from "./goal/GoalActions";
import { GoalBlocks } from "./goal/GoalBlocks";
import { SteerBox } from "./goal/SteerBox";

// The trace (one key away) loads on first use, so start-up stays small.
const Trace = lazy(withLater(() => import("../components/Trace").then((m) => ({ default: m.Trace }))));

/** Trace kinds that change nothing the detail shows; the summary update covers them. */
const DETAIL_IRRELEVANT = new Set([
  "tool_started",
  "tool_ended",
  "mode_changed",
  "assistant_message",
  "cost_updated",
  "inbox_opened",
  "inbox_resolved",
  "steered",
  "injected",
  "note",
  "pr_checked",
]);

export function GoalPage(props: { id: string }) {
  const [detail, { refetch, mutate }] = createResource(() => props.id, api.goal);
  const [watch, setWatch] = createSignal(false);
  const summary = () => state.goals[props.id] ?? detail()?.summary;

  // Refetch the detail when facts arrive, at most every 800 ms.
  let timer: number | undefined;
  const soon = () => {
    clearTimeout(timer);
    timer = window.setTimeout(() => void refetch(), 800);
  };
  const off = onTrace(props.id, (e) => {
    if (!DETAIL_IRRELEVANT.has(e.event.kind)) soon();
  });
  createEffect(on(() => summary()?.state, soon, { defer: true }));
  onCleanup(() => {
    off();
    clearTimeout(timer);
    void api.markViewed(props.id);
    mutate(undefined);
  });

  // Review-ready items live in the inbox; on the goal page the header says it.
  const inbox = createMemo(() => state.inbox.filter((i) => i.goal_id === props.id && i.kind !== "review_ready"));
  // An answered card folds away over 160ms instead of vanishing on the next update.
  const shownInbox = linger(inbox, (i) => i.id);

  // A rollback can be undone until the next run starts; the detail says so, and a fresh event updates it at once.
  const [undone, setUndone] = createSignal(false);
  const undoable = () => !undone() && !!detail()?.can_undo_rollback;
  const offUndo = onTrace(props.id, (e) => {
    if (e.event.kind === "rolled_back") setUndone(false);
  });
  onCleanup(offUndo);
  const undoRollback = async () => {
    const ok = await act(() => api.undoRollback(props.id), t("goal.rollbackUndone"));
    if (ok !== undefined) {
      setUndone(true);
      void refetch();
    }
  };

  useMenu({
    "goal:review": () => go({ name: "review", id: props.id }),
    "goal:watch": () => setWatch((w) => !w),
    "goal:pause": () => togglePause(),
    "goal:amend": () => go({ name: "new", amendId: props.id }),
  });

  useKeys(
    [
      { key: "w", run: () => setWatch((w) => !w), desc: () => t("keys.watch") },
      { key: "r", run: () => go({ name: "review", id: props.id }), desc: () => t("keys.review") },
      { key: "p", run: () => togglePause(), desc: () => t("keys.pauseResume") },
      { key: "shift+e", run: () => go({ name: "new", amendId: props.id }), desc: () => t("goal.amend") },
      // The same H as the inbox: the page's card (its first, when there are several) steps aside until later.
      { key: "h", run: () => inbox()[0] && void snoozeMenu(inbox()[0]), desc: () => t("keys.snooze"), when: () => inbox().length > 0 },
    ],
    () => t("keys.goalScope"),
  );

  /** One key pauses; the toast offers the way back, so a slip costs nothing. */
  const togglePause = async () => {
    const s = summary()?.state;
    if (s === "running" || s === "verifying" || s === "ready" || s === "claimed") {
      const ok = await act(() => api.pause(props.id));
      if (ok !== undefined)
        toast("info", t("goal.pausedToast", { id: props.id }), {
          goalId: props.id,
          action: { label: t("goal.resume"), run: () => void act(() => api.resume(props.id)) },
        });
    } else if (s === "paused") void act(() => api.resume(props.id));
  };

  /** States whose word is not already said by the annunciator or the seal. */
  const showStateWord = (g: GoalDetail["summary"]) =>
    !["running", "verifying", "claimed"].includes(g.state) && !(g.state === "in_review" && g.verified_pin);
  /** The run has passed its wall-clock cap. */
  const overWall = (g: GoalDetail["summary"]) => !!g.run_started_at && state.now - g.run_started_at > g.budget.wall_minutes * 60_000;

  return (
    <Show
      when={summary()}
      fallback={
        <div class="page-loading">
          <Show
            when={detail.error}
            fallback={<Loading text={t("goal.loading", { id: props.id })} />}
          >
            <Empty
              title={t("goal.notFound", { id: props.id })}
              kind="error"
              action={
                <Button size="s" variant="ghost" onClick={() => go({ name: "overview" })}>
                  {t("chrome.openOverview")}
                </Button>
              }
            >
              {errorText(detail.error)}
            </Empty>
          </Show>
        </div>
      }
    >
      {(g) => (
        <div class="goal-page">
          <header class="goal-head">
            <div class="goal-head-main">
              <div class="row">
                <LifecycleGlyph goal={g()} size={14} />
                <h1 class="goal-title ellipsis">{g().title}</h1>
              </div>
              <div class="goal-sub meta halt">
                <div class="goal-identity">
                  <span class="code-val t2">{g().id}</span>
                  <span class="sep">·</span>
                  <span>{g().project_name}</span>
                  <Show when={detail()?.contract}>
                    <span class="sep">·</span>
                    <span>{t("goal.contractV", { v: detail()!.contract.version })}</span>
                  </Show>
                  <Show when={g().run_no > 0}>
                    <span class="sep">·</span>
                    <span>
                      {t("goal.runN", { n: g().run_no })}
                      <Show when={g().rework_cycles > 0}>
                        {t("goal.reworkParen", { n: g().rework_cycles, max: g().max_rework })}
                      </Show>
                    </span>
                  </Show>
                  <Show when={showStateWord(g())}>
                    <span class="sep">·</span>
                    <span class="t1">{stateLabel(g().state)}</span>
                    {/* With a decision card on the page the reason is the card's question; the line keeps only the state word. */}
                    <Show when={g().pause_reason && g().state === "paused" && inbox().length === 0}>
                      <span class="sep">·</span>
                      <span>{pauseLabel(g().pause_reason!)}</span>
                    </Show>
                    <Show when={g().state === "in_review" && !g().verified_pin}>
                      <span class="sep">·</span>
                      <span>{t("live.notMachineVerified")}</span>
                    </Show>
                  </Show>
                  <Show when={g().state === "running" && overWall(g())}>
                    <span class="sep">·</span>
                    <span class="over-wall">{t("goal.overWall")}</span>
                  </Show>
                  <Show when={detail()?.contract.engine && detail()!.contract.engine !== effectiveEngine("", state.settings?.engine)}>
                    <span class="sep">·</span>
                    <span class="t3">{engineLabel(detail()!.contract.engine)}</span>
                  </Show>
                  <Show when={state.settings?.muted_goals.includes(g().id)}>
                    <span class="sep">·</span>
                    <span class="t3">{t("quiet.muted")}</span>
                  </Show>
                </div>
              </div>
              <Show when={g().pr}>{(pr) => <div class="goal-overlaps meta"><PrLine pr={pr()} /></div>}</Show>
              {/* The conflict radar: other unfinished goals touching the same files. */}
              <Show when={g().overlaps?.length}>
                <div class="goal-overlaps meta halt">
                  <For each={g().overlaps}>
                    {(o) => (
                      <button class="link-quiet row text-btn" style={{ gap: "5px" }} onClick={() => go({ name: "goal", id: o.goal_id })} title={o.title}>
                        <NoticeMark />
                        <span>{t("goal.overlaps", { id: o.goal_id })}</span>
                        <span class="sep">·</span>
                        <span class="code-val t3">{o.files.join("  ")}</span>
                        <Show when={o.total > o.files.length}>
                          <span class="t3"> +{o.total - o.files.length}</span>
                        </Show>
                      </button>
                    )}
                  </For>
                </div>
              </Show>
            </div>
            {/* The seal stands under the actions, on the page's right edge — the line the rail and every block end on. */}
            <div class="goal-side">
              <div class="goal-actions">
                <GoalActions goal={g()} onWatch={() => setWatch((w) => !w)} watching={watch()} onPause={togglePause} hasDecision={inbox().length > 0} />
              </div>
              {/* The seal is withheld while any criterion passed with a tampered canary: the line under it and the header say the same thing. */}
              <Seal pin={g().verified_pin} large tampered={discountedOf(detail()?.criteria) > 0} />
            </div>
          </header>

          <Show when={detail()?.briefing.length}>
            <div class="briefing">
              <span class="briefing-title">{t("goal.since", { time: clock(g().last_viewed_at ?? 0) })}</span>
              <For each={detail()!.briefing.slice(-6)}>
                {(b) => (
                  <span class="briefing-item" classList={{ "briefing-claim": b.source === "claim" }}>
                    {b.text}
                  </span>
                )}
              </For>
            </div>
          </Show>

          <Show when={["running", "claimed", "verifying"].includes(g().state)}>
            <div class="annunciator">
              <LiveLine goal={g()} large hideTarget={inbox().length > 0} />
            </div>
          </Show>

          <Show when={shownInbox.list().length > 0}>
            <div class="goal-decisions">
              <For each={shownInbox.list()}>
                {(it) => (
                  <div class="decision-slot" classList={{ leaving: shownInbox.leaving(it.id) }}>
                    <DecisionCard item={it} showGoal={false} />
                  </div>
                )}
              </For>
            </div>
          </Show>

          <Show when={!watch()} fallback={<WatchPanel id={props.id} />}>
            <div class="goal-body">
              <div class="goal-main">
                <Show when={detail()} fallback={<GoalSkeleton />}>
                  {(d) => <GoalBlocks d={d()} hasDecision={inbox().length > 0} undoable={undoable()} onUndoRollback={undoRollback} />}
                </Show>
              </div>
              <aside class="goal-rail">
                <Show when={detail()}>{(d) => <ContractRail d={d()} />}</Show>
              </aside>
            </div>
          </Show>

          {/* One text box per state: running steers here; paused writes on its decision card. */}
          <Show when={g().state === "running" || (g().state === "paused" && inbox().length === 0)}>
            <SteerBox id={props.id} running={g().state === "running"} />
          </Show>
        </div>
      )}
    </Show>
  );
}

/** While the detail loads the page keeps its shape: the section titles stand, their bodies are empty. */
function GoalSkeleton() {
  return (
    <>
      <Section title={t("goal.criteria")} class="section-skeleton">
        <Loading text={t("goal.loadingDetail")} />
      </Section>
      <Section title={t("goal.changes")} class="section-skeleton">
        <span />
      </Section>
      <Section title={t("goal.next")} class="section-skeleton">
        <span />
      </Section>
    </>
  );
}

function WatchPanel(props: { id: string }) {
  const stream = () => state.streams[props.id] ?? "";
  return (
    <div class="watch">
      <Show when={stream()}>
        <div class="watch-stream">
          <span class="claim-label">{t("goal.agentWriting")}</span>
          <p class="watch-stream-text">{stream()}</p>
        </div>
      </Show>
      <Trace id={props.id} live />
    </div>
  );
}
