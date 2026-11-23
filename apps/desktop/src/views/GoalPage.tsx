/**
 * Goal Command Deck (docs/04 §4.5): state, not stream. Instrument header +
 * telemetry strip, Six-Step verification bench readout, physical Claim vs Fact
 * Honesty Ledger, precision Contract Rail, lazy-loaded Multimodal Steering
 * Console, and Flight Recorder escape hatch (W).
 */
import { For, Show, Suspense, createEffect, createMemo, createResource, createSignal, lazy, on, onCleanup } from "solid-js";

import { DecisionCard, snoozeMenu } from "../components/DecisionCard";
import { LifecycleGlyph, NoticeMark, Seal, Stamp } from "../components/Glyph";
import { Claim, CriteriaBar, discountedOf } from "../components/HonestyCore";
import { LiveLine } from "../components/Live";
import { PrLine } from "../components/Pr";
import { Button, Empty, Failed, Loading, Section, settled } from "../components/ui";
import { api, errorText } from "../lib/api";
import { clock } from "../lib/format";
import { t, withLater } from "../lib/i18n";
import { useKeys } from "../lib/keys";
import { effectiveEngine, engineLabel, hasIssue, pauseLabel, stateLabel } from "../lib/labels";
import { linger } from "../lib/linger";
import { useMenu } from "../lib/menu";
import { go } from "../lib/nav";
import { act, onTrace, state, toast } from "../lib/store";
import { ContractRail } from "./goal/ContractRail";
import { GoalActions } from "./goal/GoalActions";
import { GoalBlocks } from "./goal/GoalBlocks";
import { type ExtGoalDetail, type ExtGoalSummary, trustTierOf } from "./goal/ext";

const Trace = lazy(withLater(() => import("./Learning").then((m) => ({ default: m.Trace }))));
const SteerBox = lazy(() => import("./Learning").then((m) => ({ default: m.SteerBox })));

const DETAIL_IRRELEVANT = new Set([
  "tool_started", "tool_ended", "mode_changed", "assistant_message", "cost_updated",
  "inbox_opened", "inbox_resolved", "steered", "injected", "note", "pr_checked",
]);

export function GoalPage(props: { id: string }) {
  const [detail, { refetch, mutate }] = createResource(() => props.id, api.goal);
  const [watch, setWatch] = createSignal(false);
  const detailOk = () => settled(detail);
  const extDetail = () => detailOk() as ExtGoalDetail | undefined;
  const summary = () => (state.goals[props.id] ?? detailOk()?.summary) as ExtGoalSummary | undefined;

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

  const inbox = createMemo(() => state.inbox.filter((i) => i.goal_id === props.id && i.kind !== "review_ready"));
  const shownInbox = linger(inbox, (i) => i.id);

  const [undone, setUndone] = createSignal(false);
  const undoable = () => !undone() && !!detailOk()?.can_undo_rollback;
  onCleanup(onTrace(props.id, (e) => e.event.kind === "rolled_back" && setUndone(false)));
  const undoRollback = async () => {
    if ((await act(() => api.undoRollback(props.id), t("goal.rollbackUndone"))) !== undefined) {
      setUndone(true);
      void refetch();
    }
  };

  const togglePause = async () => {
    const s = summary()?.state;
    if (s === "running" || s === "verifying" || s === "ready" || s === "claimed") {
      if ((await act(() => api.pause(props.id))) !== undefined)
        toast("info", t("goal.pausedToast", { id: props.id }), {
          goalId: props.id,
          action: { label: t("goal.resume"), run: () => void act(() => api.resume(props.id)) },
        });
    } else if (s === "paused") void act(() => api.resume(props.id));
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
      { key: "r", run: () => go({ name: "review", id: props.id }), desc: () => t("keys.review"), when: () => !!summary()?.diffstat },
      { key: "p", run: () => togglePause(), desc: () => t("keys.pauseResume") },
      { key: "shift+e", run: () => go({ name: "new", amendId: props.id }), desc: () => t("goal.amend") },
      { key: "h", run: () => inbox()[0] && void snoozeMenu(inbox()[0]), desc: () => t("keys.snooze"), when: () => inbox().length > 0 },
    ],
    () => t("keys.goalScope"),
  );

  const showStateWord = (g: ExtGoalSummary) => !["running", "verifying", "claimed"].includes(g.state) && !(g.state === "in_review" && g.verified_pin);
  const overWall = (g: ExtGoalSummary) => !!g.run_started_at && state.now - g.run_started_at > g.budget.wall_minutes * 60_000;

  const knownFiles = createMemo(() => {
    const out = new Set<string>();
    for (const o of summary()?.overlaps ?? []) for (const f of o.files) out.add(f);
    for (const f of extDetail()?.local_files ?? []) out.add(f);
    return [...out];
  });

  const eng = () => effectiveEngine(extDetail()?.contract.engine || summary()?.engine, state.settings?.engine);

  return (
    <Show
      when={summary()}
      fallback={
        <div class="page-loading">
          <Show when={detail.error} fallback={<Loading text={t("goal.loading", { id: props.id })} />}>
            <Empty title={t("goal.notFound", { id: props.id })} kind="error" action={<Button size="s" variant="ghost" onClick={() => go({ name: "overview" })}>{t("chrome.openOverview")}</Button>}>
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
                  <span>{g().project_name}</span>
                  <Show when={extDetail()?.contract}><span>{t("goal.contractV", { v: extDetail()!.contract.version })}</span></Show>
                  <Show when={g().run_no > 0}>
                    <span>
                      {t("goal.runN", { n: g().run_no })}
                      <Show when={g().rework_cycles > 0}>{t("goal.reworkParen", { n: g().rework_cycles, max: g().max_rework })}</Show>
                    </span>
                  </Show>
                  <span>{engineLabel(eng())}</span>
                  <Show when={showStateWord(g())}>
                    <span class="t1">{stateLabel(g().state)}</span>
                    <Show when={g().pause_reason && g().state === "paused" && inbox().length === 0}><span>{pauseLabel(g().pause_reason!)}</span></Show>
                    <Show when={g().state === "in_review" && !g().verified_pin}><span>{t("live.notMachineVerified")}</span></Show>
                  </Show>
                  <Show when={state.settings?.muted_goals.includes(g().id)}><span class="t3">{t("quiet.muted")}</span></Show>
                  <Show when={trustTierOf(eng()) === "experimental"}><span class="wb-exception wb-exception-danger">{t("trust.experimental")}</span></Show>
                  <Show when={hasIssue(state.env, "no_sandbox")}><span class="wb-exception wb-exception-warn">{t("goal.noSandbox")}</span></Show>
                  <Show when={extDetail()?.escalated_model}>{(m) => <span class="wb-exception wb-exception-warn code-val">{t("goal.escalatedTo", { model: m() })}</span>}</Show>
                  <Show when={g().state === "running" && overWall(g())}><span class="over-wall">{t("goal.overWall")}</span></Show>
                </div>
              </div>
              <Show when={g().pr}>{(pr) => <div class="goal-overlaps meta"><PrLine pr={pr()} /></div>}</Show>
              <Show when={g().overlaps?.length}>
                <div class="goal-overlaps meta halt">
                  <For each={g().overlaps}>
                    {(o) => (
                      <button class="link-quiet row text-btn" style={{ gap: "5px" }} onClick={() => go({ name: "goal", id: o.goal_id })} title={o.title}>
                        <NoticeMark />
                        <span>{t("goal.overlaps", { id: o.goal_id })}</span>
                        <span class="sep" />
                        <span class="code-val t3">{o.files.join("  ")}</span>
                        <Show when={o.total > o.files.length}><span class="t3"> +{o.total - o.files.length}</span></Show>
                      </button>
                    )}
                  </For>
                </div>
              </Show>
            </div>
            <div class="goal-side">
              <div class="goal-actions">
                <GoalActions goal={g()} onWatch={() => setWatch((w) => !w)} watching={watch()} onPause={togglePause} hasDecision={inbox().length > 0} />
              </div>
              <Show when={["accepted", "integrated"].includes(g().state) && g().verified_pin} fallback={<Seal pin={g().verified_pin} large tampered={discountedOf(detailOk()?.criteria) > 0} />}>
                {(pin) => <Stamp pin={pin()} size="m" tampered={discountedOf(detailOk()?.criteria) > 0} />}
              </Show>
            </div>
          </header>

          <div class="goal-body" classList={{ watching: watch() }}>
            <div class="goal-main">
              <Show when={detailOk()?.briefing.length}>
                <div class="briefing">
                  <span class="briefing-title">{t("goal.since", { time: clock(g().last_viewed_at ?? 0) })}</span>
                  <For each={detailOk()!.briefing.slice(-6)}>
                    {(b) => <span class="briefing-item" classList={{ "briefing-claim": b.source === "claim" }}>{b.text}</span>}
                  </For>
                </div>
              </Show>
              <Show when={["running", "claimed", "verifying"].includes(g().state)}>
                <div class="annunciator"><LiveLine goal={g()} large hideTarget={inbox().length > 0} /></div>
              </Show>
              <Show when={shownInbox.list().length > 0}>
                <div class="goal-decisions">
                  <For each={shownInbox.list()}>
                    {(it) => <div class="decision-slot" classList={{ leaving: shownInbox.leaving(it.id) }}><DecisionCard item={it} showGoal={false} /></div>}
                  </For>
                </div>
              </Show>
              <Show when={!watch()} fallback={<WatchPanel id={props.id} detail={extDetail()} g={g()} onExit={() => setWatch(false)} />}>
                <Show when={extDetail()} fallback={<Failed error={!detail.loading && detail.error} onRetry={() => void refetch()} pending={<GoalSkeleton />} />}>
                  {(d) => <GoalBlocks d={d()} hasDecision={inbox().length > 0} undoable={undoable()} onUndoRollback={undoRollback} />}
                </Show>
              </Show>
            </div>
            <Show when={!watch()}>
              <aside class="goal-rail">
                <Show when={extDetail()}>{(d) => <ContractRail d={d()} />}</Show>
              </aside>
            </Show>
          </div>

          <Show when={g().state === "running" || (g().state === "paused" && inbox().length === 0)}>
            <Suspense><SteerBox id={props.id} running={g().state === "running"} files={knownFiles()} /></Suspense>
          </Show>
        </div>
      )}
    </Show>
  );
}

function GoalSkeleton() {
  return (
    <>
      <Section title={t("goal.criteria")} class="section-skeleton"><Loading text={t("goal.loadingDetail")} /></Section>
      <Section title={t("goal.changes")} class="section-skeleton"><span /></Section>
      <Section title={t("goal.next")} class="section-skeleton"><span /></Section>
    </>
  );
}

function WatchPanel(props: { id: string; detail?: ExtGoalDetail; g: ExtGoalSummary; onExit: () => void }) {
  const stream = () => state.streams[props.id] ?? "";
  return (
    <div class="watch">
      <div class="watch-head">
        <span class="t1">{t("goal.watch")}</span>
        <span class="grow" />
        <CriteriaBar progress={props.g.progress} criteria={props.detail?.criteria} compact />
        <Button size="s" variant="ghost" kbd="w" onClick={props.onExit}>{t("goal.backToStatus")}</Button>
      </div>
      <Show when={stream()}>
        <div class="watch-stream">
          <Claim kind={t("goal.agentWriting")}><span class="pre">{stream()}</span></Claim>
        </div>
      </Show>
      <Trace id={props.id} live />
    </div>
  );
}
