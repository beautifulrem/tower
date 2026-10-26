/**
 * Goal page (docs/04 §4.5): state, not stream. What the goal is for, how far
 * it is with evidence, what changed, what the agent claims and whether the
 * facts agree. The stream is one keystroke away (W).
 *
 * The page trims itself to the state: ready to accept, the "next" block is
 * one call to action; paused, the decision card owns the only text box and
 * the "next" block steps aside; running, the steer box sits at the bottom.
 */
import { For, Match, Show, Switch, createEffect, createMemo, createResource, createSignal, lazy, on, onCleanup } from "solid-js";

import { DecisionCard } from "../components/DecisionCard";
import { DangerMark, Icon, LifecycleGlyph, NoticeMark, ResultMark, Seal } from "../components/Glyph";
import { BaselineLine, Claim, ConsistencyBadge, CriteriaBar, HumanStamp, ObsChip } from "../components/Honesty";
import { LiveLine } from "../components/Live";
import { PrLine } from "../components/Pr";
import { Button, Empty, IconButton, Kbd, Section, Loading } from "../components/ui";
import type { ClaimView } from "../gen/ClaimView";
import type { CriterionView } from "../gen/CriterionView";
import type { GoalDetail } from "../gen/GoalDetail";
import type { RunView } from "../gen/RunView";
import { api, errorText } from "../lib/api";
import { ask, popupActions } from "../lib/native";
import { ago, clock, count, duration, short, usd, usdLimit } from "../lib/format";
import { useKeys } from "../lib/keys";
import { useMenu } from "../lib/menu";
import { t } from "../lib/i18n";
import { effectiveEngine, engineLabel, hasIssue, pauseLabel, runOutcomeLabel, runPurposeLabel, stateLabel } from "../lib/labels";
import { go } from "../lib/nav";
import { act, onTrace, setGoalMuted, state, toast } from "../lib/store";

// The trace (one key away) and the screenshots of look criteria load on first use, so start-up stays small.
const Trace = lazy(() => import("../components/Trace").then((m) => ({ default: m.Trace })));
const LookStrip = lazy(() => import("../components/Look").then((m) => ({ default: m.LookStrip })));

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

/** The workspace can be edited by hand only while the agent is not in it. */
const editable = (s: string) => s === "paused" || s === "in_review";

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
  const inbox = () => state.inbox.filter((i) => i.goal_id === props.id && i.kind !== "review_ready");

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
                <span class="grow" />
                <Seal pin={g().verified_pin} large />
              </div>
              <Show when={g().pr}>{(pr) => <div class="goal-overlaps meta"><PrLine pr={pr()} /></div>}</Show>
              {/* The conflict radar: other unfinished goals touching the same files. */}
              <Show when={g().overlaps?.length}>
                <div class="goal-overlaps meta halt">
                  <For each={g().overlaps}>
                    {(o) => (
                      <button class="link-quiet row" style={{ gap: "5px" }} onClick={() => go({ name: "goal", id: o.goal_id })} title={o.title}>
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
            <div class="goal-actions">
              <GoalActions goal={g()} onWatch={() => setWatch((w) => !w)} watching={watch()} onPause={togglePause} hasDecision={inbox().length > 0} />
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

          <Show when={inbox().length > 0}>
            <div class="goal-decisions">
              <For each={inbox()}>{(it) => <DecisionCard item={it} showGoal={false} />}</For>
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

/**
 * One primary action for the current state, at most two secondary ones, and
 * everything else in a native "…" menu (destructive actions live only there).
 * The three header buttons share one form: words, no icons.
 */
function GoalActions(props: { goal: GoalDetail["summary"]; watching: boolean; onWatch: () => void; onPause: () => void; hasDecision: boolean }) {
  const s = () => props.goal.state;
  const id = () => props.goal.id;
  const muted = () => !!state.settings?.muted_goals.includes(id());
  const confirmPush = async (pr: boolean) => {
    const ok = await ask(t("goal.confirmPush", { branch: props.goal.branch ?? "", pr }), {
      title: pr ? (props.goal.pr ? t("goal.pushUpdatePr") : t("goal.pushPr")) : t("goal.pushOnly"),
      ok: pr ? (props.goal.pr ? t("goal.pushVerb") : t("goal.pushPrVerb")) : t("goal.pushVerb"),
      cancel: t("common.cancel"),
      kind: "warning",
    });
    if (ok) void act(() => api.push(id(), pr));
  };
  const more = () =>
    popupActions([
      { label: props.watching ? t("goal.backToStatus") : t("goal.watch"), run: props.onWatch },
      { label: t("goal.amend"), run: () => go({ name: "new", amendId: id() }), enabled: !["draft", "archived", "abandoned", "accepted", "integrated"].includes(s()) },
      { label: t("goal.reverify"), run: () => void act(() => api.retryVerify(id())), enabled: ["in_review", "paused"].includes(s()) },
      {
        label: muted() ? t("quiet.unmuteGoal") : t("quiet.muteGoal"),
        separatorBefore: true,
        run: async () => {
          const next = !muted();
          if (await setGoalMuted(id(), next)) toast("info", next ? t("quiet.mutedToast", { id: id() }) : t("quiet.unmutedToast", { id: id() }));
        },
      },
      { label: t("goal.openEditor"), run: () => void act(() => api.openWorkspace(id(), "editor")), separatorBefore: true, enabled: !["draft", "ready"].includes(s()) },
      { label: t("goal.openTerminal"), run: () => void act(() => api.openWorkspace(id(), "terminal")), enabled: !["draft", "ready"].includes(s()) },
      { label: t("goal.showFinder"), run: () => void act(() => api.openWorkspace(id(), "finder")), enabled: !["draft", "ready"].includes(s()) },
      { label: t("goal.pushOnly"), run: () => void confirmPush(false), separatorBefore: true, enabled: ["accepted", "integrated"].includes(s()) && !!props.goal.branch },
      {
        label: t("goal.copyPush"),
        run: () => {
          void navigator.clipboard.writeText(`git push -u origin ${props.goal.branch}`);
          toast("success", t("goal.copiedPush"));
        },
        enabled: !!props.goal.branch,
      },
      { label: t("goal.archive"), run: () => void act(() => api.archive(id()), t("goal.archived")), enabled: ["accepted", "integrated", "in_review"].includes(s()) },
      {
        label: t("goal.removeWorkspace"),
        run: async () => {
          const ok = await ask(t("goal.removeWorkspaceConfirm", { id: id() }), {
            title: t("goal.removeWorkspaceTitle"),
            ok: t("common.delete"),
            cancel: t("common.cancel"),
            kind: "warning",
          });
          if (ok) void act(() => api.removeWorkspace(id()), t("goal.workspaceRemoved"));
        },
        enabled: ["archived", "abandoned"].includes(s()),
      },
      {
        label: t("goal.abandon"),
        separatorBefore: true,
        run: async () => {
          const ok = await ask(t("goal.abandonConfirm", { id: id() }), {
            title: t("goal.abandonTitle"),
            ok: t("goal.abandonVerb"),
            cancel: t("common.cancel"),
            kind: "warning",
          });
          if (ok) void act(() => api.abandon(id()));
        },
        enabled: !["archived", "abandoned"].includes(s()),
      },
    ]);

  return (
    <>
      {/* Ready to accept: the "next" block below carries the one primary action (R); the header does not say it twice.
          Paused with a decision card on the page: the card's first option is the primary "continue"; the header's steps back to a plain button. */}
      <Switch>
        <Match when={s() === "paused"}>
          <Button size="s" variant={props.hasDecision ? "default" : "primary"} kbd="p" onClick={props.onPause}>
            {t("goal.resume")}
          </Button>
        </Match>
        <Match when={s() === "draft"}>
          <Button size="s" variant="primary" onClick={() => go({ name: "new", draftId: id() })}>
            {t("goal.editContract")}
          </Button>
        </Match>
        <Match when={["accepted", "integrated"].includes(s()) && props.goal.branch}>
          <Button size="s" variant="primary" onClick={() => void confirmPush(true)}>
            {props.goal.pr ? t("goal.pushUpdatePr") : t("goal.pushPr")}
          </Button>
        </Match>
      </Switch>
      <Show when={["running", "verifying", "ready", "claimed"].includes(s())}>
        <Button size="s" kbd="p" onClick={props.onPause}>
          {t("goal.pause")}
        </Button>
      </Show>
      <Show when={s() !== "in_review" && (props.goal.diffstat !== null || s() === "running")}>
        <Button size="s" kbd="r" onClick={() => go({ name: "review", id: id() })}>
          {t("goal.changes")}
        </Button>
      </Show>
      <Button size="s" variant="ghost" kbd="w" aria-pressed={props.watching} onClick={props.onWatch}>
        {t("goal.trace")}
      </Button>
      <IconButton icon="ellipsis" label={t("goal.moreActions")} aria-haspopup="menu" onClick={() => void more()} />
    </>
  );
}

/** Claims with the same text collapse to the latest; the layout must have a shape for repetition. */
function dedupe(claims: ClaimView[], keep: number): { shown: ClaimView[]; hidden: number } {
  const seen = new Set<string>();
  const unique: ClaimView[] = [];
  for (const c of [...claims].reverse()) {
    const key = c.text.trim();
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(c);
  }
  return { shown: unique.slice(0, keep).reverse(), hidden: claims.length - Math.min(unique.length, keep) };
}

function GoalBlocks(props: { d: GoalDetail; hasDecision: boolean; undoable: boolean; onUndoRollback: () => void }) {
  const d = () => props.d;
  const g = () => d().summary;
  // You changed the workspace after the last verification (an undone hunk, a rollback, an edit): the next step is to verify again.
  const editedSinceVerify = () => editable(g().state) && d().criteria.some((c) => c.verified?.stale);
  // Criteria that pass only with the agent's edits to existing tests make their "criterion met" claims inconsistent.
  const testDependent = createMemo(() => new Set(d().criteria.filter((c) => c.passes_with_original_tests === false).map((c) => c.criterion.id)));
  const causes = createMemo(() => dedupe(d().claims.filter((c) => c.kind === "cause"), 3));
  const assumptions = () => d().claims.filter((c) => c.kind === "assumption");
  const decisions = () => d().claims.filter((c) => c.kind === "decision");
  const next = () => [...d().claims].reverse().find((c) => c.kind === "next");
  const ledger = () => d().claims.filter((c) => c.kind === "criterion_met");
  const failing = () => d().criteria.filter((c) => c.verified && !c.verified.passed && !c.verified.stale);
  const [allRuns, setAllRuns] = createSignal(false);
  const runs = () => {
    const list = [...d().runs].reverse();
    return allRuns() ? list : list.slice(0, 3);
  };
  const settled = () => ["in_review", "accepted", "integrated", "archived", "abandoned"].includes(g().state);

  return (
    <>
      {/* After your own edit of a verified goal the next step is fixed: verify again. Ready to accept, that is the page's one primary action;
          paused, the header's "resume" (or the decision card) already is, so the button here is a plain one and the sentence says what resuming does.
          A goal that was never verified has nothing to verify "again": no block. The way back from a rollback lives on the runs section.
          With a decision card on the page the card's first option is the one primary action, whatever the state: the block's button steps back. */}
      <Show when={editedSinceVerify()}>
        <Section title={t("goal.next")}>
          <div class="section-cta">
            <Button variant={g().state === "in_review" && !props.hasDecision ? "primary" : "default"} size="s" onClick={() => void act(() => api.retryVerify(g().id))}>
              {t("goal.reverify")}
            </Button>
            <span class="meta">{g().state === "in_review" ? t("goal.editedNeedsVerify") : t("goal.editedPaused")}</span>
          </div>
        </Section>
      </Show>

      {/* Ready to accept: the next step is yours, in one line. */}
      <Show when={g().state === "in_review" && !editedSinceVerify()}>
        <Section title={t("goal.next")}>
          <div class="section-cta">
            <Button variant={props.hasDecision ? "default" : "primary"} size="s" kbd="r" onClick={() => go({ name: "review", id: g().id })}>
              {t("goal.reviewUnits", { n: g().diffstat?.files ?? 0 })}
            </Button>
            <span class="meta">{g().verified_pin ? t("goal.reviewCtaVerified") : t("goal.reviewCtaUnverified")}</span>
          </div>
        </Section>
      </Show>

      <Show when={causes().shown.length || failing().length}>
        <Section title={t("goal.cause")}>
          <For each={failing()}>
            {(c) => (
              <div class="criterion-row">
                <ResultMark kind="fail" />
                <span class="num t3">{c.criterion.id}</span>
                <span class="criterion-main">
                  <span class="criterion-title t1">{t("goal.criterionFailed", { title: c.criterion.title })}</span>
                </span>
                <span class="col-result">{t("common.failed")}</span>
                <span class="col-dur">{duration(c.verified!.duration_ms)}</span>
                <span class="col-pin">
                  <Icon name="harness" size={10} />@{short(c.verified!.pin)}
                </span>
                <span class="col-age">{ago(c.verified!.at, state.now)}</span>
              </div>
            )}
          </For>
          <For each={causes().shown}>{(c) => <Claim bare>{c.text}</Claim>}</For>
          <Show when={causes().hidden > 0}>
            <div class="claim">
              <span />
              <span class="claim-more">{t("goal.moreSame", { n: causes().hidden })}</span>
            </div>
          </Show>
        </Section>
      </Show>

      <Show when={d().sentinels.length}>
        <Section title={t("goal.sentinels")}>
          <For each={d().sentinels}>
            {(h) => (
              <div class="sentinel">
                <div class="fact-row">
                  <span class="result">
                    <Show when={h.severity >= 3} fallback={<NoticeMark />}>
                      <DangerMark />
                    </Show>
                  </span>
                  <span class="t1">{h.title}</span>
                  <span class="grow" />
                  <span class="meta">{h.severity >= 3 ? t("goal.needsConfirm") : t("goal.noteInReview")}</span>
                </div>
                <pre class="sentinel-detail mono">{h.detail}</pre>
              </div>
            )}
          </For>
        </Section>
      </Show>

      <Section title={t("goal.criteria")} aside={<CriteriaBar progress={g().progress} />}>
        <For each={d().criteria}>{(c) => <CriterionRow goalId={g().id} c={c} state={g().state} base={d().base_commit} />}</For>
        <Show when={d().criteria.length === 0}>
          <Empty
            title={t("goal.noCriteria")}
            inline
            action={
              <Show when={!["accepted", "integrated", "archived", "abandoned"].includes(g().state)}>
                <Button size="s" variant="ghost" onClick={() => go({ name: "new", amendId: g().id })} kbd="shift+e">
                  {t("goal.amend")}
                </Button>
              </Show>
            }
          >
            {t("goal.noCriteriaBody")}
          </Empty>
        </Show>
      </Section>

      <Section
        title={t("goal.changes")}
        aside={
          <Show when={g().diffstat}>
            <Button size="s" variant="ghost" onClick={() => go({ name: "review", id: g().id })}>
              {t("goal.openChanges")} <Icon name="chevron-right" size={10} />
            </Button>
          </Show>
        }
      >
        <Show
          when={g().diffstat?.files}
          fallback={
            <Show when={g().diffstat} fallback={<Empty title={t("goal.noSnapshotTitle")} inline>{t("goal.noSnapshot")}</Empty>}>
              <Empty title={t("goal.noChangesTitle")} inline>
                {t("goal.noChangesBody", { sha: short(d().base_commit) })}
              </Empty>
            </Show>
          }
        >
          {/* The change readout has its own grid: nothing here is a criterion. */}
          <div class="changes-row num meta">
            <span />
            <span />
            <span class="t1">
              <span class="diff-add">+{count(g().diffstat!.additions)}</span> <span class="diff-del">−{count(g().diffstat!.deletions)}</span>
              <span class="sep">·</span>
              <span class="t2">{t("common.files", { n: g().diffstat!.files })}</span>
              <span class="sep">·</span>
              <span class="t2">{t("goal.relativeToBase", { sha: short(d().base_commit) })}</span>
            </span>
            <span class="col-result col-quiet">{t("goal.snapshot")}</span>
            <span class="col-pin">
              <Icon name="harness" size={10} />@{short(d().pin)}
            </span>
          </div>
        </Show>
        <Show when={d().submit_summary}>
          <Claim kind={t("goal.submitSummary")}>{d().submit_summary}</Claim>
        </Show>
      </Section>

      {/* A decision card already says what happens next; the block would only repeat it. */}
      <Show when={!settled() && !props.hasDecision}>
        <Section title={t("goal.next")}>
          <Show when={next()} fallback={<Empty title={t("goal.noNext")} inline>{g().state === "running" ? t("goal.noNextRunning") : t("goal.noNextIdle")}</Empty>}>
            <Claim>{next()!.text}</Claim>
          </Show>
        </Section>
      </Show>

      <Show when={ledger().length}>
        <Section title={t("goal.ledger")} minor>
          <For each={ledger()}>{(c) => <LedgerRow c={c} testDependent={!!c.criterion && testDependent().has(c.criterion)} />}</For>
        </Section>
      </Show>

      <Show when={assumptions().length || decisions().length}>
        <Section title={t("goal.decisions")} minor>
          <For each={[...assumptions(), ...decisions()]}>{(c) => <DecisionClaim goalId={g().id} c={c} />}</For>
        </Section>
      </Show>

      <Show when={d().runs.length}>
        <Section
          title={t("goal.runs")}
          minor
          aside={
            <span class="meta num row" style={{ gap: "var(--sp-3)" }}>
              {/* A rollback that can still be undone is said here, where the runs are, with its one way back; no block of its own. */}
              <Show when={props.undoable}>
                <span class="row" style={{ gap: "var(--sp-2)" }}>
                  <span class="t2">{t("goal.rolledBackState")}</span>
                  <button class="link-plain text-btn t3" onClick={props.onUndoRollback} title={t("goal.undoRollback")}>
                    <Icon name="undo" size={10} />
                    {t("goal.undoRollback")}
                  </button>
                </span>
              </Show>
              {/* The rollback shows on hover of a row; the heading says so, for the keyboard and the eye. */}
              <Show when={!props.undoable && editable(g().state) && d().runs.some((r) => r.ended_at && r.start_pin)}>
                <span class="t4">{t("goal.rollbackHint")}</span>
              </Show>
              {t("goal.runCount", { n: d().runs.length })}
            </span>
          }
        >
          <For each={runs()}>{(r) => <RunRow goalId={g().id} r={r} editable={editable(g().state)} onUndo={props.onUndoRollback} />}</For>
          <Show when={d().runs.length > 3}>
            <button class="more-link" onClick={() => setAllRuns((a) => !a)}>
              <Icon name={allRuns() ? "caret-down" : "caret-right"} size={10} />
              {allRuns() ? t("goal.fewerRuns") : t("goal.allRuns", { n: d().runs.length })}
            </button>
          </Show>
        </Section>
      </Show>
    </>
  );
}

/** One run; while the goal is paused or in review the workspace can be put back to where it started. */
function RunRow(props: { goalId: string; r: RunView; editable: boolean; onUndo: () => void }) {
  const r = () => props.r;
  const rollback = async () => {
    const ok = await ask(t("goal.rollbackConfirm", { id: props.goalId, n: r().run_no }), {
      title: t("goal.rollbackTitle"),
      ok: t("goal.rollbackVerb"),
      cancel: t("common.cancel"),
      kind: "warning",
    });
    if (!ok) return;
    const done = await act(() => api.rollback(props.goalId, r().run_no));
    // The way back rides on the receipt: a slip costs one click.
    if (done !== undefined) toast("success", t("goal.rolledBack", { n: r().run_no }), { ttl: 8000, action: { label: t("goal.undoRollback"), run: props.onUndo } });
  };
  return (
    <div class="run-row meta">
      <span class="num t1">R-{String(r().run_no).padStart(2, "0")}</span>
      <span>{runPurposeLabel(r().purpose)}</span>
      <span class="num">{clock(r().started_at)}</span>
      <span class="col-dur">{r().ended_at ? duration(r().ended_at! - r().started_at) : ""}</span>
      <span class="run-outcome row" style={{ "justify-content": "flex-end" }}>
        {/* Only runs that recorded their starting snapshot can be rolled back to. */}
        <Show when={props.editable && r().ended_at && r().start_pin}>
          <button class="link-plain text-btn run-rollback t3" onClick={() => void rollback()} title={t("goal.rollbackTitle")}>
            <Icon name="undo" size={10} /> {t("goal.rollback")}
          </button>
        </Show>
        <span>{r().ended_at ? runOutcomeLabel(r().outcome) : t("goal.inProgress")}</span>
      </span>
    </div>
  );
}

/**
 * One criterion as an instrument row: mark · id · title and command, then
 * the readings — result · duration · pin · age — each in its own column.
 */
function CriterionRow(props: { goalId: string; c: CriterionView; state: string; base?: string | null }) {
  const c = () => props.c;
  const v = () => c().verified;
  const [open, setOpen] = createSignal(false);
  // Human and "look" criteria are both judged by you; only exec ones have a verifier verdict.
  const human = () => c().criterion.kind.type !== "exec";
  const look = () => (c().criterion.kind.type === "look" ? (c().criterion.kind as { url: string }) : null);
  const mark = () => {
    if (!v()) return "pending";
    if (v()!.stale) return "stale";
    return v()!.passed ? "pass" : "fail";
  };
  return (
    <div class="criterion" classList={{ stale: !!v()?.stale }}>
      <div class="criterion-row" classList={{ clickable: !!v() }}>
        <Show
          when={!human()}
          fallback={
            <input
              type="checkbox"
              class="human-check"
              checked={c().human_checked}
              disabled={!["in_review", "verifying", "running", "paused", "claimed"].includes(props.state)}
              onChange={(e) => void act(() => api.humanCheck(props.goalId, c().criterion.id, e.currentTarget.checked))}
              title={t("goal.humanCriterionTitle")}
              aria-label={`${c().criterion.id} ${c().criterion.title}`}
            />
          }
        >
          <ResultMark kind={mark()} />
        </Show>
        <span class="num t3">{c().criterion.id}</span>
        <span class="criterion-main">
          <span class="criterion-title">{c().criterion.title}</span>
          <Show when={!human()}>
            <code class="criterion-cmd code-val">{(c().criterion.kind as { command: string }).command}</code>
          </Show>
          <Show when={look()}>{(l) => <code class="criterion-cmd code-val">{l().url}</code>}</Show>
        </span>
        <Show
          when={v()}
          fallback={
            <span class="col-span t3">
              {human() ? (c().human_checked ? t("goal.youChecked") : t("goal.awaitingCheck")) : t("goal.awaitingVerify")}
            </span>
          }
        >
          <button
            class="col-click col-result"
            onClick={() => setOpen((o) => !o)}
            title={`${t("goal.viewOutput")} · ${duration(v()!.duration_ms)} · @${short(v()!.pin)}`}
            aria-expanded={open()}
          >
            <span class="sr-only">{t("honesty.srVerified")} </span>
            {v()!.passed ? t("common.passed") : t("common.failed")}
          </button>
          <button class="col-click col-dur" onClick={() => setOpen((o) => !o)} title={t("goal.viewOutput")} tabindex="-1" aria-hidden="true">
            {duration(v()!.duration_ms)}
          </button>
          <button class="col-click col-pin" onClick={() => setOpen((o) => !o)} title={t("honesty.measured")} tabindex="-1" aria-hidden="true">
            <Icon name="harness" size={10} />@{short(v()!.pin)}
          </button>
          <span class="col-age">{ago(v()!.at, state.now)}</span>
        </Show>
      </div>
      <BaselineLine c={c()} base={props.base} />
      <Show when={c().look}>{(l) => <LookStrip look={l()} title={`${c().criterion.id} ${c().criterion.title}`} />}</Show>
      <Show when={c().observed}>
        <div class="criterion-row criterion-obs">
          <ResultMark kind={c().observed!.passed ? "obs-pass" : "obs-fail"} />
          <span />
          <span />
          <span class="col-span">
            <ObsChip title={t("goal.observedTitle")} />
            <span>{c().observed!.passed ? t("common.passed") : t("common.failed")}</span>
            <span class="col-age">{ago(c().observed!.at, state.now)}</span>
          </span>
        </div>
      </Show>
      <Show when={open() && v()}>
        <pre class="output-tail">{v()!.output_tail || t("common.noOutput")}</pre>
      </Show>
    </div>
  );
}

function LedgerRow(props: { c: ClaimView; testDependent?: boolean }) {
  // A claim about a criterion that passes only with edited tests is contradicted by that measurement, whatever the linked fact says.
  const value = () => (props.testDependent ? "contradicted" : props.c.consistency);
  const evidence = () => (props.testDependent ? t("goal.dependsOnEditedTestsLong") : props.c.evidence);
  // A refuted claim is not set as heavily as one that stands: its kind label steps back a register.
  return (
    <Claim bare dim={value() === "contradicted"} kind={t("claimKind.criterion_met")} aside={<ConsistencyBadge value={value()} evidence={evidence()} />}>
      <Show when={props.c.criterion}>
        <span class="num t3">{props.c.criterion} </span>
      </Show>
      {props.c.text}
      <Show when={evidence()}>
        <div class="ledger-evidence meta">
          <Icon name="return" size={10} />
          {evidence()}
        </div>
      </Show>
    </Claim>
  );
}

function DecisionClaim(props: { goalId: string; c: ClaimView }) {
  const label = () => (props.c.kind === "assumption" ? t("claimKind.assumption") : t("claimKind.decision"));
  return (
    <Claim
      bare
      kind={label()}
      aside={
        <Show
          when={props.c.approved !== null}
          fallback={
            <Show when={props.c.kind === "assumption"}>
              <span class="meta">{t("goal.awaitingConfirm")}</span>
            </Show>
          }
        >
          <HumanStamp at={props.c.at}> {props.c.approved ? t("goal.approved") : t("goal.rejected")}</HumanStamp>
        </Show>
      }
    >
      {props.c.text}
    </Claim>
  );
}

/** A percentage that stays honest at the low end: "<1%" rather than "0%". */
const pct = (part: number, whole: number) => {
  if (whole <= 0 || part <= 0) return "0%";
  const p = (part / whole) * 100;
  return p < 1 ? "<1%" : `${Math.round(p)}%`;
};

function BudgetMeter(props: { g: GoalDetail["summary"] }) {
  const fill = () => Math.min(100, (props.g.cost_usd / Math.max(props.g.budget.hard_usd, 0.01)) * 100);
  const softPct = () => Math.min(100, (props.g.budget.soft_usd / Math.max(props.g.budget.hard_usd, 0.01)) * 100);
  const over = () => props.g.cost_usd >= props.g.budget.soft_usd;
  const elapsedMin = () => Math.floor((state.now - (props.g.run_started_at ?? state.now)) / 60_000);
  const overWallClock = () => elapsedMin() > props.g.budget.wall_minutes;
  return (
    <div class="budget">
      <div class="budget-bar" title={t("goal.budgetTitle")}>
        <span class="budget-fill" classList={{ over: over(), some: props.g.cost_usd > 0 }} style={{ width: `${fill()}%` }} />
        <span class="budget-soft" style={{ left: `${softPct()}%` }} />
      </div>
      {/* Two fixed lines, money then time: no wrap can ever leave a dot leading or trailing a line. */}
      <div class="meta num budget-line">
        <span class="budget-money">
          <span class="t1">{t("goal.budgetLine", { spent: usd(props.g.cost_usd), soft: usdLimit(props.g.budget.soft_usd), pct: pct(props.g.cost_usd, props.g.budget.soft_usd) })}</span>
          <span class="sep">·</span>
          {t("goal.hardCap", { v: usdLimit(props.g.budget.hard_usd) })}
        </span>
        <Show when={props.g.run_started_at}>
          <span class="budget-time">
            <span classList={{ "over-wall": overWallClock() }} title={overWallClock() ? t("goal.overWallTitle") : undefined}>
              {t("goal.wallLine", { elapsed: elapsedMin(), minutes: props.g.budget.wall_minutes })}
            </span>
          </span>
        </Show>
      </div>
    </div>
  );
}

/** Values like `provider/model` are machine strings; words ("Pi default") are not. */
const isModelId = (s: string) => /^[\w.-]+\/[\w.:-]+$/.test(s);

function ContractRail(props: { d: GoalDetail }) {
  const c = () => props.d.contract;
  const autonomyWord = () => ({ cautious: t("contract.cautious"), standard: t("contract.standard"), autonomous: t("contract.autonomous") })[c().autonomy];
  const autonomyTitle = () =>
    ({ cautious: t("goal.autonomyCautious"), standard: t("goal.autonomyStandard"), autonomous: t("goal.autonomyAutonomous") })[c().autonomy];
  const model = () => c().model || state.settings?.default_model || "";
  const branch = () => props.d.summary.branch;
  return (
    <div class="rail">
      <div class="rail-block">
        <div class="rail-head">
          <span>{t("goal.contractSummary", { v: c().version })}</span>
          <span class="grow" />
          <Kbd k="shift+e" />
        </div>
        <dl class="rail-dl">
          <dt>{t("goal.intent")}</dt>
          <dd class="reading">{c().intent}</dd>
          <Show when={c().done_when}>
            <dt>{t("goal.doneWhen")}</dt>
            <dd>{c().done_when}</dd>
          </Show>
          <Show when={c().constraints.length}>
            <dt>{t("goal.constraints")}</dt>
            <dd>
              <For each={c().constraints}>{(k) => <div>{k}</div>}</For>
            </dd>
          </Show>
        </dl>
      </div>
      <div class="rail-block">
        <div class="rail-head">{t("goal.scope")}</div>
        <dl class="rail-dl rail-dl-code">
          <dt>{t("goal.include")}</dt>
          <dd>{c().scope.include.length ? c().scope.include.join("  ") : t("goal.wholeRepo")}</dd>
          <Show when={c().scope.exclude.length}>
            <dt>{t("goal.exclude")}</dt>
            <dd>{c().scope.exclude.join("  ")}</dd>
          </Show>
          <Show when={c().scope.readonly.length}>
            <dt>{t("goal.readonly")}</dt>
            <dd>{c().scope.readonly.join("  ")}</dd>
          </Show>
        </dl>
      </div>
      <div class="rail-block">
        <div class="rail-head">{t("goal.budget")}</div>
        <BudgetMeter g={props.d.summary} />
      </div>
      {/* Three readings, not three sentences; the long form is one hover away. */}
      <div class="rail-block">
        <div class="rail-head">{t("goal.autonomy")}</div>
        <dl class="rail-dl">
          <dt>{t("goal.autonomyLevel")}</dt>
          <dd title={autonomyTitle()}>{autonomyWord()}</dd>
          <dt>{t("goal.oneWayShort")}</dt>
          <dd title={t("goal.oneWayDoors")}>{t("goal.askFirst")}</dd>
          <dt>{t("goal.sandboxShort")}</dt>
          <dd title={hasIssue(state.env, "no_sandbox") ? t("goal.noSandbox") : t("goal.sandboxOn")}>
            {hasIssue(state.env, "no_sandbox") ? t("goal.noSandbox") : t("goal.sandboxOnShort")}
            <span class="sep">·</span>
            {c().network ? t("goal.networkOn") : t("goal.networkOff")}
          </dd>
        </dl>
      </div>
      <div class="rail-block">
        <div class="rail-head">{t("goal.engine")}</div>
        <dl class="rail-dl">
          {/* The engine is a reading only when the contract overrides the default. The block is "Engine"; its first row is the name, not the word again. */}
          <Show when={c().engine && c().engine !== effectiveEngine("", state.settings?.engine)}>
            <dt>{t("goal.engineName")}</dt>
            <dd>{engineLabel(c().engine)}</dd>
          </Show>
          <dt>{t("goal.model")}</dt>
          <dd classList={{ mono: isModelId(model()) }}>{model() || t("common.engineDefault", { engine: engineLabel(effectiveEngine(c().engine, state.settings?.engine)) })}</dd>
          <Show when={props.d.local_files.length}>
            <dt>{t("goal.localFiles")}</dt>
            <dd class="mono">{props.d.local_files.join("  ")}</dd>
          </Show>
          <Show when={branch()}>
            <dt>{t("goal.branch")}</dt>
            <dd class="mono break">
              {branch()}
              <IconButton
                icon="copy"
                size={22}
                label={t("goal.copyBranch")}
                onClick={() => {
                  void navigator.clipboard.writeText(branch()!);
                  toast("success", t("common.copied"));
                }}
              />
            </dd>
          </Show>
        </dl>
      </div>
    </div>
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

function SteerBox(props: { id: string; running: boolean }) {
  const [text, setText] = createSignal("");
  const [receipt, setReceipt] = createSignal<string | null>(null);
  const send = async () => {
    const body = text().trim();
    if (!body) return;
    const r = await act(() => api.steer(props.id, body));
    if (r) {
      setText("");
      setReceipt(
        r === "queued_for_next_run"
          ? t("goal.queuedNextRun")
          : t("goal.delivered", { what: r === "queued" ? t("goal.afterCurrentStep") : r }),
      );
      setTimeout(() => setReceipt(null), 5000);
    }
  };
  const hint = createMemo(() => (props.running ? t("goal.steerRunning") : t("goal.steerPaused")));
  return (
    <div class="steer">
      <textarea
        rows={1}
        placeholder={hint()}
        value={text()}
        onInput={(e) => setText(e.currentTarget.value)}
        onKeyDown={(e) => {
          if ((e.metaKey || e.ctrlKey) && e.key === "Enter") (e.preventDefault(), void send());
        }}
      />
      <Show when={receipt()}>
        <span class="meta saved-stamp" role="status">
          {receipt()}
        </span>
      </Show>
      <Button size="s" disabled={!text().trim()} onClick={send} kbd="mod+enter">
        {t("common.send")}
      </Button>
    </div>
  );
}
