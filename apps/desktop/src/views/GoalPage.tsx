/**
 * Goal page (docs/04 §4.5): state, not stream. What the goal is for, how far
 * it is with evidence, what changed, what the agent claims and whether the
 * facts agree. The stream is one keystroke away (W).
 */
import { For, Match, Show, Switch, createEffect, createMemo, createResource, createSignal, on, onCleanup } from "solid-js";

import { DecisionCard } from "../components/DecisionCard";
import { LifecycleGlyph } from "../components/Glyph";
import { Claim, ConsistencyBadge, CriteriaBar, FactChip, HumanStamp, ObsChip } from "../components/Honesty";
import { LiveLine } from "../components/Live";
import { Trace } from "../components/Trace";
import { Button, Kbd, Section, Loading } from "../components/ui";
import type { ClaimView } from "../gen/ClaimView";
import type { CriterionView } from "../gen/CriterionView";
import type { GoalDetail } from "../gen/GoalDetail";
import { api } from "../lib/api";
import { popupActions } from "../lib/native";
import { clock, count, duration, short, usd, usdLimit } from "../lib/format";
import { useKeys } from "../lib/keys";
import { useMenu } from "../lib/menu";
import { t } from "../lib/i18n";
import { pauseLabel, stateLabel } from "../lib/labels";
import { go } from "../lib/nav";
import { act, onTrace, state, toast } from "../lib/store";
import { isSandboxProblem } from "./Welcome";

export function GoalPage(props: { id: string }) {
  const [detail, { refetch, mutate }] = createResource(() => props.id, api.goal);
  const [watch, setWatch] = createSignal(false);
  const summary = () => state.goals[props.id] ?? detail()?.summary;

  // Refetch the detail when facts arrive, at most every 400 ms.
  let timer: number | undefined;
  const soon = () => {
    clearTimeout(timer);
    timer = window.setTimeout(() => void refetch(), 400);
  };
  const off = onTrace(props.id, (e) => {
    if (!["tool_started", "tool_ended", "mode_changed", "assistant_message"].includes(e.event.kind)) soon();
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

  useMenu({
    "goal:review": () => go({ name: "review", id: props.id }),
    "goal:watch": () => setWatch((w) => !w),
    "goal:pause": () => togglePause(),
    "goal:amend": () => go({ name: "new", amendId: props.id }),
  });

  useKeys([
    { key: "w", run: () => setWatch((w) => !w) },
    { key: "r", run: () => go({ name: "review", id: props.id }) },
    { key: "p", run: () => togglePause() },
    { key: "shift+e", run: () => go({ name: "new", amendId: props.id }) },
  ]);

  const togglePause = () => {
    const s = summary()?.state;
    if (s === "running" || s === "verifying" || s === "ready" || s === "claimed") void act(() => api.pause(props.id));
    else if (s === "paused") void act(() => api.resume(props.id));
  };

  return (
    <Show when={summary()} fallback={<div class="page-loading"><Loading /></div>}>
      {(g) => (
        <div class="goal-page">
          <header class="goal-head">
            <div class="goal-head-main">
              <div class="row">
                <LifecycleGlyph goal={g()} size={14} />
                <h1 class="goal-title ellipsis">{g().title}</h1>
              </div>
              <div class="goal-sub meta halt">
                <span class="code-val t3">{g().id}</span>
                <span class="sep">·</span>
                <span class="t1">{stateLabel(g().state)}</span>
                <Show when={g().pause_reason && g().state === "paused"}>
                  <span class="sep">·</span>
                  <span>{pauseLabel(g().pause_reason!)}</span>
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
                <span class="sep">·</span>
                <span>{g().project_name}</span>
                <Show when={detail()?.contract}>
                  <span class="sep">·</span>
                  <span>{t("goal.contractV", { v: detail()!.contract.version })}</span>
                </Show>
                <Show when={g().verified_pin}>
                  <span class="sep">·</span>
                  <FactChip pin={g().verified_pin}>
                    <span>{t("goal.verified")}</span>
                  </FactChip>
                </Show>
              </div>
            </div>
            <div class="goal-actions">
              <GoalActions goal={g()} onWatch={() => setWatch((w) => !w)} watching={watch()} onPause={togglePause} />
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
              <LiveLine goal={g()} large />
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
                <Show when={detail()} fallback={<Loading />}>
                  {(d) => <GoalBlocks d={d()} />}
                </Show>
              </div>
              <aside class="goal-rail">
                <Show when={detail()}>{(d) => <ContractRail d={d()} />}</Show>
              </aside>
            </div>
          </Show>

          <Show when={g().state === "running" || g().state === "paused"}>
            <SteerBox id={props.id} running={g().state === "running"} />
          </Show>
        </div>
      )}
    </Show>
  );
}

/**
 * One primary action for the current state, at most two secondary ones, and
 * everything else in a native "…" menu (destructive actions live only there).
 */
function GoalActions(props: { goal: GoalDetail["summary"]; watching: boolean; onWatch: () => void; onPause: () => void }) {
  const s = () => props.goal.state;
  const id = () => props.goal.id;
  const confirmPush = (pr: boolean) => {
    if (confirm(t("goal.confirmPush", { branch: props.goal.branch ?? "", pr }))) void act(() => api.push(id(), pr));
  };
  const more = () =>
    popupActions([
      { label: props.watching ? t("goal.backToStatus") : t("goal.watch"), run: props.onWatch },
      { label: t("goal.amend"), run: () => go({ name: "new", amendId: id() }), enabled: !["draft", "archived", "abandoned", "accepted", "integrated"].includes(s()) },
      { label: t("goal.reverify"), run: () => void act(() => api.retryVerify(id())), enabled: ["in_review", "paused"].includes(s()) },
      { label: t("goal.openEditor"), run: () => void act(() => api.openWorkspace(id(), "editor")), separatorBefore: true, enabled: !["draft", "ready"].includes(s()) },
      { label: t("goal.openTerminal"), run: () => void act(() => api.openWorkspace(id(), "terminal")), enabled: !["draft", "ready"].includes(s()) },
      { label: t("goal.showFinder"), run: () => void act(() => api.openWorkspace(id(), "finder")), enabled: !["draft", "ready"].includes(s()) },
      { label: t("goal.pushOnly"), run: () => confirmPush(false), separatorBefore: true, enabled: ["accepted", "integrated"].includes(s()) && !!props.goal.branch },
      {
        label: t("goal.copyPush"),
        run: () => {
          void navigator.clipboard.writeText(`git push -u origin ${props.goal.branch}`);
          toast("info", t("goal.copiedPush"));
        },
        enabled: !!props.goal.branch,
      },
      { label: t("goal.archive"), run: () => void act(() => api.archive(id()), t("goal.archived")), enabled: ["accepted", "integrated", "in_review"].includes(s()) },
      {
        label: t("goal.removeWorkspace"),
        run: () => {
          if (confirm(t("goal.removeWorkspaceConfirm", { id: id() }))) void act(() => api.removeWorkspace(id()), t("goal.workspaceRemoved"));
        },
        enabled: ["archived", "abandoned"].includes(s()),
      },
      {
        label: t("goal.abandon"),
        separatorBefore: true,
        run: () => {
          if (confirm(t("goal.abandonConfirm", { id: id() }))) void act(() => api.abandon(id()));
        },
        enabled: !["archived", "abandoned"].includes(s()),
      },
    ]);

  return (
    <>
      <Switch>
        <Match when={s() === "in_review"}>
          <Button size="s" variant="primary" kbd="r" onClick={() => go({ name: "review", id: id() })}>
            {t("goal.review")}
          </Button>
        </Match>
        <Match when={s() === "paused"}>
          <Button size="s" variant="primary" kbd="p" onClick={props.onPause}>
            {t("goal.resume")}
          </Button>
        </Match>
        <Match when={s() === "draft"}>
          <Button size="s" variant="primary" onClick={() => go({ name: "new", draftId: id() })}>
            {t("goal.editContract")}
          </Button>
        </Match>
        <Match when={["accepted", "integrated"].includes(s()) && props.goal.branch}>
          <Button size="s" variant="primary" onClick={() => confirmPush(true)}>
            {t("goal.pushPr")}
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
      <Button size="s" variant="ghost" aria-label={t("goal.moreActions")} onClick={() => void more()}>
        ⋯
      </Button>
    </>
  );
}

function GoalBlocks(props: { d: GoalDetail }) {
  const d = () => props.d;
  const g = () => d().summary;
  const causes = () => d().claims.filter((c) => c.kind === "cause");
  const assumptions = () => d().claims.filter((c) => c.kind === "assumption");
  const decisions = () => d().claims.filter((c) => c.kind === "decision");
  const next = () => [...d().claims].reverse().find((c) => c.kind === "next");
  const ledger = () => d().claims.filter((c) => c.kind === "criterion_met");
  const failing = () => d().criteria.filter((c) => c.verified && !c.verified.passed && !c.verified.stale);

  return (
    <>
      <Show when={causes().length || failing().length}>
        <Section title={t("goal.cause")}>
          <For each={failing()}>
            {(c) => (
              <div class="fact-row">
                <span class="result result-fail">✕</span>
                <span class="t1">{t("goal.criterionFailed", { id: c.criterion.id, title: c.criterion.title })}</span>
                <span class="grow" />
                <FactChip pin={c.verified!.pin} at={c.verified!.at}>
                  <span>{t("common.exitCode", { code: c.verified!.exit_code ?? "—" })}</span>
                </FactChip>
              </div>
            )}
          </For>
          <For each={causes()}>{(c) => <Claim kind={t("claimKind.cause")}>{c.text}</Claim>}</For>
        </Section>
      </Show>

      <Show when={d().sentinels.length}>
        <Section title={t("goal.sentinels")}>
          <For each={d().sentinels}>
            {(h) => (
              <div class="sentinel">
                <div class="fact-row">
                  <span class={h.severity >= 3 ? "mark-danger" : "t1"}>{h.severity >= 3 ? "■" : "◇"}</span>
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

      <Section
        title={t("goal.criteria")}
        aside={<CriteriaBar progress={g().progress} />}
      >
        <For each={d().criteria}>{(c) => <CriterionRow goalId={g().id} c={c} state={g().state} />}</For>
        <Show when={d().criteria.length === 0}>
          <p class="meta">{t("goal.noCriteria")}</p>
        </Show>
      </Section>

      <Section
        title={t("goal.changes")}
        aside={
          <Show when={g().diffstat}>
            <Button size="s" variant="ghost" onClick={() => go({ name: "review", id: g().id })}>
              {t("goal.openChanges")}
            </Button>
          </Show>
        }
      >
        <Show when={g().diffstat} fallback={<p class="meta">{t("goal.noSnapshot")}</p>}>
          <div class="fact-row num">
            <span class="diff-add">+{count(g().diffstat!.additions)}</span>
            <span class="diff-del">−{count(g().diffstat!.deletions)}</span>
            <span class="sep">·</span>
            <span>{t("common.files", { n: g().diffstat!.files })}</span>
            <span class="sep">·</span>
            <span class="t2">{t("goal.relativeToBase", { sha: short(d().base_commit) })}</span>
            <span class="grow" />
            <FactChip pin={d().pin} />
          </div>
        </Show>
        <Show when={d().submit_summary}>
          <Claim kind={t("goal.submitSummary")}>{d().submit_summary}</Claim>
        </Show>
      </Section>

      <Section title={t("goal.next")}>
        <Show when={next()} fallback={<p class="meta">{t("goal.noNext")}</p>}>
          <Claim kind={t("goal.nextStep")}>{next()!.text}</Claim>
        </Show>
        <BudgetMeter g={g()} />
      </Section>

      <Show when={ledger().length}>
        <Section title={t("goal.ledger")}>
          <For each={ledger()}>{(c) => <LedgerRow c={c} />}</For>
        </Section>
      </Show>

      <Show when={assumptions().length || decisions().length}>
        <Section title={t("goal.decisions")}>
          <For each={[...assumptions(), ...decisions()]}>{(c) => <DecisionClaim goalId={g().id} c={c} />}</For>
        </Section>
      </Show>

      <Show when={d().runs.length}>
        <Section title={t("goal.runs")}>
          <For each={[...d().runs].reverse()}>
            {(r) => (
              <div class="run-row meta">
                <span class="num t1">R-{String(r.run_no).padStart(2, "0")}</span>
                <span>{runPurpose(r.purpose)}</span>
                <span class="sep">·</span>
                <span class="num">{clock(r.started_at)}</span>
                <Show when={r.ended_at}>
                  <span class="sep">·</span>
                  <span class="num">{duration(r.ended_at! - r.started_at)}</span>
                </Show>
                <span class="grow" />
                <span>{runOutcome(r.outcome) ?? (r.ended_at ? r.outcome : t("goal.inProgress"))}</span>
              </div>
            )}
          </For>
        </Section>
      </Show>
    </>
  );
}

function runPurpose(purpose: string): string {
  const key = ({ initial: "purposeInitial", rework: "purposeRework", resume: "purposeResume", request_changes: "purposeRequestChanges" } as const)[
    purpose as "initial"
  ];
  return key ? t(`goal.${key}`) : purpose;
}

function runOutcome(outcome: string | null): string | null {
  const key = (
    {
      submitted: "outcomeSubmitted",
      paused: "outcomePaused",
      crashed: "outcomeCrashed",
      abandoned: "outcomeAbandoned",
      interrupted: "outcomeInterrupted",
    } as const
  )[(outcome ?? "") as "submitted"];
  return key ? t(`goal.${key}`) : null;
}

function CriterionRow(props: { goalId: string; c: CriterionView; state: string }) {
  const c = () => props.c;
  const v = () => c().verified;
  const [open, setOpen] = createSignal(false);
  const mark = () => {
    if (c().criterion.kind.type === "human") return null;
    if (!v()) return "pending";
    if (v()!.stale) return "stale";
    return v()!.passed ? "pass" : "fail";
  };
  return (
    <div class="criterion" classList={{ stale: !!v()?.stale }}>
      <div class="criterion-row">
        <Show
          when={c().criterion.kind.type === "exec"}
          fallback={
            <input
              type="checkbox"
              class="human-check"
              checked={c().human_checked}
              disabled={!["in_review", "verifying", "running", "paused", "claimed"].includes(props.state)}
              onChange={(e) => void act(() => api.humanCheck(props.goalId, c().criterion.id, e.currentTarget.checked))}
              title={t("goal.humanCriterionTitle")}
            />
          }
        >
          <span class={`result result-${mark()}`}>
            {{ pass: "✓", fail: "✕", stale: "⟲", pending: "·" }[mark() as "pass"] ?? "·"}
          </span>
        </Show>
        <span class="num t3">{c().criterion.id}</span>
        <span class="criterion-title">{c().criterion.title}</span>
        <Show when={c().criterion.kind.type === "exec"}>
          <code class="criterion-cmd mono t2 ellipsis">
            {(c().criterion.kind as { command: string }).command}
          </code>
        </Show>
        <span class="grow" />
        <Show when={v()}>
          <button class="chip-button" onClick={() => setOpen((o) => !o)} title={t("goal.viewOutput")}>
            <FactChip pin={v()!.pin} at={v()!.at}>
              <span>{v()!.passed ? t("common.passed") : t("common.failed")}</span>
              <span class="sep">·</span>
              <span>{duration(v()!.duration_ms)}</span>
            </FactChip>
          </button>
        </Show>
        <Show when={c().criterion.kind.type === "human"}>
          <span class="meta">{c().human_checked ? t("goal.youChecked") : t("goal.awaitingCheck")}</span>
        </Show>
      </div>
      <Show when={c().observed}>
        <div class="criterion-obs">
          <span class="result">{c().observed!.passed ? "○✓" : "○✕"}</span>
          <ObsChip at={c().observed!.at}>
            <span>{t("goal.observedNote", { result: c().observed!.passed ? t("common.passed") : t("common.failed") })}</span>
          </ObsChip>
        </div>
      </Show>
      <Show when={open() && v()}>
        <pre class="output-tail">{v()!.output_tail || t("common.noOutput")}</pre>
      </Show>
    </div>
  );
}

function LedgerRow(props: { c: ClaimView }) {
  return (
    <Claim aside={<ConsistencyBadge value={props.c.consistency} evidence={props.c.evidence} />}>
      <Show when={props.c.criterion}>
        <span class="num t3">{props.c.criterion} </span>
      </Show>
      {props.c.text}
      <Show when={props.c.evidence}>
        <div class="ledger-evidence meta">↳ {props.c.evidence}</div>
      </Show>
    </Claim>
  );
}

function DecisionClaim(props: { goalId: string; c: ClaimView }) {
  const label = () => (props.c.kind === "assumption" ? t("claimKind.assumption") : t("claimKind.decision"));
  return (
    <Claim
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

function BudgetMeter(props: { g: GoalDetail["summary"] }) {
  const pct = () => Math.min(100, (props.g.cost_usd / Math.max(props.g.budget.hard_usd, 0.01)) * 100);
  const softPct = () => Math.min(100, (props.g.budget.soft_usd / Math.max(props.g.budget.hard_usd, 0.01)) * 100);
  return (
    <div class="budget">
      <div class="budget-bar">
        <span class="budget-fill" style={{ width: `${pct()}%` }} />
        <span class="budget-soft" style={{ left: `${softPct()}%` }} />
      </div>
      <div class="meta num">
        {t("goal.budgetLine", {
          cost: usd(props.g.cost_usd),
          soft: usdLimit(props.g.budget.soft_usd),
          hard: usdLimit(props.g.budget.hard_usd),
        })}
        <Show when={props.g.run_started_at}>
          <span class="sep">·</span>
          {t("goal.wallLine", {
            elapsed: duration(state.now - props.g.run_started_at!, false),
            minutes: props.g.budget.wall_minutes,
          })}
        </Show>
      </div>
    </div>
  );
}

function ContractRail(props: { d: GoalDetail }) {
  const c = () => props.d.contract;
  const autonomy = () =>
    ({
      cautious: t("goal.autonomyCautious"),
      standard: t("goal.autonomyStandard"),
      autonomous: t("goal.autonomyAutonomous"),
    })[c().autonomy];
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
        <dl class="rail-dl mono">
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
        <div class="rail-head">{t("goal.autonomy")}</div>
        <p class="meta">{autonomy()}</p>
        <p class="meta">{t("goal.oneWayDoors")}</p>
        <p class="meta">
          {t("goal.sandbox", { value: state.env?.problems.some(isSandboxProblem) ? t("goal.noSandbox") : "S2 · Seatbelt" })}
        </p>
      </div>
      <div class="rail-block">
        <div class="rail-head">{t("goal.engine")}</div>
        <dl class="rail-dl">
          <dt>{t("goal.model")}</dt>
          <dd class="mono">{c().model || state.settings?.default_model || t("common.piDefault")}</dd>
          <Show when={props.d.local_files.length}>
            <dt>{t("goal.localFiles")}</dt>
            <dd class="mono">{props.d.local_files.join("  ")}</dd>
          </Show>
          <Show when={props.d.workspace}>
            <dt>{t("goal.workspace")}</dt>
            <dd class="mono t2 break">{props.d.workspace}</dd>
          </Show>
          <Show when={props.d.summary.branch}>
            <dt>{t("goal.branch")}</dt>
            <dd class="mono">{props.d.summary.branch}</dd>
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
        <span class="meta">{receipt()}</span>
      </Show>
      <Button size="s" disabled={!text().trim()} onClick={send}>
        {t("common.send")} <Kbd k="mod+enter" />
      </Button>
    </div>
  );
}

