/**
 * Trace (docs/04 §4.7): lossless and time-indexed, reachable in one key.
 * Tower's own injections are shown verbatim and labelled as injected by Tower.
 * Raw event names never reach the screen: every kind has a glyph and words.
 *
 * The list is windowed: only the newest `WINDOW` matching entries are in the
 * DOM, and scrolling to the top reveals earlier ones in steps (then asks the
 * supervisor for the page before that), so an hour-long run stays light.
 */
import { For, Match, Show, Switch, createMemo, createSignal, onCleanup, onMount } from "solid-js";

import type { TraceEntry } from "../gen/TraceEntry";
import { api } from "../lib/api";
import { clock, duration, sameMinute, short } from "../lib/format";
import { t } from "../lib/i18n";
import { pauseLabel, runOutcomeLabel, runPurposeLabel, stateLabel } from "../lib/labels";
import { DangerMark, Icon, LifecycleGlyph, NoticeMark, ResultMark } from "./Glyph";
import { Claim } from "./HonestyCore";
import { PrLine } from "./Pr";
import { Empty, Failed } from "./ui";
import { act, onTrace, refreshProjects, state } from "../lib/store";

type Filter = "all" | "anomalies" | "injections" | "decisions" | "tools" | "facts";

const filters: Filter[] = ["all", "anomalies", "injections", "decisions", "tools", "facts"];

/** Rows rendered at once; the step the window grows by at the top. */
export const WINDOW = 300;
const STEP = 200;
const PAGE = 200;

/** Earlier entries then later ones, each seq once: a page read while live entries arrive can hold some of them. */
const onceEach = (a: TraceEntry[], b: TraceEntry[]): TraceEntry[] => {
  const have = new Set(a.map((e) => e.seq));
  return [...a, ...b.filter((e) => !have.has(e.seq))];
};

const isAnomaly = (e: TraceEntry): boolean => {
  const ev = e.event as { kind: string; is_error?: boolean; denied?: boolean; passed?: boolean };
  return (
    ev.kind === "engine_error" ||
    ev.kind === "sentinel_hit" ||
    ev.kind === "stalled" ||
    ev.kind === "agent_blocked" ||
    ev.kind === "criterion_flaky" ||
    (ev.kind === "tool_ended" && (!!ev.is_error || !!ev.denied)) ||
    (ev.kind === "criterion_result" && !ev.passed)
  );
};

export function matches(e: TraceEntry, f: Filter): boolean {
  const k = (e.event as { kind: string }).kind;
  if (k === "mode_changed" || k === "tool_started") return false; // folded into tool_ended rows
  // Spend ticks after every tool call: a fact, but noise in the full view.
  if (k === "cost_updated") return f === "facts";
  switch (f) {
    case "all":
      return true;
    case "anomalies":
      return isAnomaly(e);
    case "injections":
      return k === "injected" || k === "steered" || k === "model_escalated";
    case "decisions":
      return (
        e.source === "claim" ||
        k === "inbox_opened" ||
        k === "inbox_resolved" ||
        k === "human_check" ||
        k === "claim_reviewed" ||
        k === "agent_blocked"
      );
    case "tools":
      return k === "tool_ended";
    case "facts":
      return e.source === "fact" && k !== "tool_ended";
  }
}

/** The learning loop (docs/09): a correction you gave once becomes a rule. */
async function remember(goalId: string, text: string) {
  const g = state.goals[goalId];
  const p = state.projects.find((x) => x.id === g?.project_id);
  if (!p) return;
  const memory = p.memory.trim() ? `${p.memory.trim()}\n${text.trim()}` : text.trim();
  await act(
    () =>
      api.updateProject(p.id, {
        base_branch: p.base_branch,
        test_command: p.test_command,
        local_files: p.local_files,
        holdout_files: p.holdout_files,
        memory,
        setup_command: p.setup_command,
      }),
    t("trace.savedToMemory"),
  );
  await refreshProjects();
}

export function Trace(props: { id: string; live?: boolean }) {
  const [entries, setEntries] = createSignal<TraceEntry[]>([]);
  const [filter, setFilter] = createSignal<Filter>("all");
  const [more, setMore] = createSignal(true);
  const [loaded, setLoaded] = createSignal(false);
  const [window_, setWindow] = createSignal(WINDOW);
  const [failed, setFailed] = createSignal<unknown>(null);
  let scroller!: HTMLDivElement;

  // One page at a time: every scroll event near the top asks for more, and each would fetch the same page.
  let fetching = false;
  const load = async () => {
    if (fetching) return;
    fetching = true;
    setFailed(null);
    await api.trace(props.id, entries()[0]?.seq ?? null, PAGE).then((page) => {
      if (page.length < PAGE) setMore(false);
      setEntries((e) => onceEach(page.reverse(), e));
    }, (err) => setFailed(err ?? "error"));
    fetching = false;
  };

  onMount(async () => {
    await load();
    setLoaded(true);
    scroller.scrollTop = scroller.scrollHeight;
  });
  // Live entries are appended in 100ms batches; one array copy per batch.
  let pending: TraceEntry[] = [];
  let flush: number | undefined;
  const off = onTrace(props.id, (e) => {
    pending.push(e);
    if (flush) return;
    flush = window.setTimeout(() => {
      const atBottom = scroller.scrollHeight - scroller.scrollTop - scroller.clientHeight < 40;
      const batch = pending;
      pending = [];
      flush = undefined;
      setEntries((list) => onceEach(list, batch));
      if (atBottom) queueMicrotask(() => (scroller.scrollTop = scroller.scrollHeight));
    }, 100);
  });
  onCleanup(() => {
    off();
    clearTimeout(flush);
  });

  const filtered = createMemo(() => entries().filter((e) => matches(e, filter())));
  const shown = createMemo(() => filtered().slice(-window_()));
  // The minute is written on the first row that falls in it; a run boundary starts a fresh count.
  const repeats = createMemo(() => {
    const list = shown();
    return list.map((e, i) => i > 0 && e.event.kind !== "run_started" && list[i - 1].event.kind !== "run_started" && sameMinute(list[i - 1].at, e.at));
  });
  // What each tool call was asked to do (`tool_started.summary`), by call id, for the `tool_ended` rows.
  const calls = createMemo(() => {
    const m = new Map<string, string>();
    for (const e of entries()) if (e.event.kind === "tool_started" && e.event.summary) m.set(e.event.call_id, e.event.summary);
    return m;
  });
  const hidden = () => filtered().length - shown().length;

  /** Reveals earlier rows, keeping the scroll position on the row that was at the top. */
  const reveal = async () => {
    const before = scroller.scrollHeight;
    if (hidden() > 0) setWindow((w) => w + STEP);
    else if (more()) await load();
    queueMicrotask(() => (scroller.scrollTop += scroller.scrollHeight - before));
  };

  const anomalyCount = createMemo(() => entries().filter(isAnomaly).length);
  const injectionCount = createMemo(() => entries().filter((e) => matches(e, "injections")).length);

  return (
    <div class="trace">
      <div class="trace-filters" role="tablist" aria-label={t("trace.filterLabel")}>
        <For each={filters}>
          {(f) => {
            const badge = () => (f === "anomalies" ? anomalyCount() : f === "injections" ? injectionCount() : 0);
            return (
              <button class="tab" role="tab" aria-selected={filter() === f} classList={{ active: filter() === f }} onClick={() => setFilter(f)}>
                <span>{t(`trace.${f}`)}</span>
                <Show when={badge() > 0}>
                  <span class="trace-tab-count num" classList={{ alert: f === "anomalies" }}>
                    {badge()}
                  </span>
                </Show>
              </button>
            );
          }}
        </For>
        <span class="grow" />
        <Show when={props.live}>
          <span class="meta">{t("trace.live")}</span>
        </Show>
      </div>
      <div class="trace-scroll" ref={scroller} role="log" aria-live="off" onScroll={() => scroller.scrollTop < 40 && !failed() && (hidden() > 0 || more()) && void reveal()}>
        <Show when={failed()}>
          <div class="trace-empty">
            <Failed error={failed()} onRetry={() => void load()} />
          </div>
        </Show>
        <Show when={!failed() && (hidden() > 0 || more())}>
          <button class="trace-more link" onClick={() => void reveal()}>
            {hidden() > 0 ? t("trace.showEarlier", { n: Math.min(STEP, hidden()) }) : t("trace.loadEarlier")}
          </button>
        </Show>
        <Show when={loaded() && !failed() && filtered().length === 0}>
          <div class="trace-empty">
            <Empty title={entries().length === 0 ? t("trace.emptyTitle") : t(filter() === "tools" ? "trace.emptyFilter_tools" : filter() === "facts" ? "trace.emptyFilter_facts" : "trace.emptyFilter_all")} inline>
              {entries().length === 0 ? t("trace.emptyBody") : ""}
            </Empty>
          </div>
        </Show>
        <For each={shown()}>{(e, i) => <TraceRow e={e} calls={calls()} repeat={repeats()[i()]} />}</For>
      </div>
    </div>
  );
}

const EMPTY_PROGRESS = { verified: 0, observed: 0, machine: 0, human: 0, human_done: 0 };

/** Words for the event kinds that have no richer row below. */
function plainLabel(kind: TraceEntry["event"]["kind"]): string {
  const key = (
    {
      goal_created: "evGoalCreated",
      contract_ratified: "evContractRatified",
      workspace_prepared: "evWorkspacePrepared",
      session_attached: "evSessionAttached",
      workspace_removed: "evWorkspaceRemoved",
      run_ended: "evRunEnded",
      verify_started: "evVerifyStarted",
      setup_finished: "evSetupFinished",
      verify_finished: "evVerifyFinished",
      inbox_opened: "evInboxOpened",
      human_check: "evHumanCheck",
      claim_reviewed: "evClaimReviewed",
      cost_updated: "evCostUpdated",
      branch_written: "evBranchWritten",
    } as const
  )[kind as "goal_created"];
  return key ? t(`trace.${key}`) : kind;
}

const Pin = (p: { sha: string }) => <span class="col-pin"><Icon name="harness" size={10} />@{short(p.sha)}</span>;
const HumanRow = (p: { stamp: string; cls?: string; children: import("solid-js").JSX.Element }) => (
  <div class={`human-line${p.cls ? ` ${p.cls}` : ""}`}><span class="human-stamp">{p.stamp}</span>{p.children}</div>
);

function TraceRow(props: { e: TraceEntry; calls?: Map<string, string>; repeat?: boolean }) {
  const ev = () => props.e.event;
  const [open, setOpen] = createSignal(false);
  return (
    <Show
      when={ev().kind !== "run_started"}
      fallback={
        <div class="trace-divider">
          <span class="trace-time num">{clock(props.e.at)}</span>
          <span>
            {t("trace.runStarted", { n: (ev() as { run_no: number }).run_no })}<span class="sep" />{runPurposeLabel((ev() as { purpose: string }).purpose)}
          </span>
        </div>
      }
    >
      <div
        class={`trace-row trace-${props.e.source}`}
        classList={{
          "trace-anomaly": isAnomaly(props.e),
          "trace-injected-row": ev().kind === "injected" || (ev() as { kind: string }).kind === "model_escalated",
        }}
      >
        <span class="trace-time num" classList={{ repeat: !!props.repeat }}>
          {clock(props.e.at)}
        </span>
        <div class="trace-content">
          <Switch fallback={<span class="t2">{plainLabel(ev().kind)}</span>}>
            {/* A tool row reads as what was done (the call: a path, a command, a question), then how it went. */}
            <Match when={ev().kind === "tool_ended" && ev()}>
              {(x) => {
                const e = x() as Extract<TraceEntry["event"], { kind: "tool_ended" }>;
                // The call's own summary rides on the event; older entries fall back to the paired `tool_started`.
                const call = () => e.target || props.calls?.get(e.call_id);
                const result = () => (e.is_error || e.tool === "bash" || !call() ? e.summary : "");
                return (
                  <div class="row">
                    <span class="mono trace-tool" classList={{ "trace-error": e.is_error || e.denied }}>
                      {e.tool}
                    </span>
                    <Show when={e.denied}>
                      <span class="trace-denied-tag">{t("trace.sandboxDenied")}</span>
                    </Show>
                    <span class="mono t2 ellipsis grow" title={e.summary || undefined}>
                      {call() || e.summary || "—"}
                      <Show when={call() && result()}>
                        <span class="t3"><span class="sep" />{result()}</span>
                      </Show>
                    </span>
                    <span class="meta num">{duration(e.duration_ms)}</span>
                  </div>
                );
              }}
            </Match>
            <Match when={ev().kind === "observed" && ev()}>
              {(x) => {
                const c = x() as Extract<TraceEntry["event"], { kind: "observed" }>;
                return (
                  <span class="t2 row">
                    <ResultMark kind={c.passed ? "obs-pass" : "obs-fail"} />
                    {t("trace.observedResult", { criterion: c.criterion, result: c.passed ? t("common.passed") : t("common.failed") })}
                  </span>
                );
              }}
            </Match>
            <Match when={ev().kind === "original_tests_result" && ev()}>
              {(x) => {
                const c = x() as Extract<TraceEntry["event"], { kind: "original_tests_result" }>;
                return (
                  <div class="trace-cols">
                    <ResultMark kind={c.passed ? "pass" : "fail"} />
                    <span class="ellipsis">
                      {t("trace.originalTests", { criterion: c.criterion, result: c.passed ? t("common.passed") : t("common.failed") })}
                      <span class="t3"><span class="sep" />{c.passed ? t("goal.withOriginalTests") : t("goal.dependsOnEditedTests")}</span>
                    </span>
                    <span />
                    <Pin sha={c.pin} />
                    <span />
                  </div>
                );
              }}
            </Match>
            <Match when={ev().kind === "look_captured" && ev()}>
              {(x) => {
                const c = x() as Extract<TraceEntry["event"], { kind: "look_captured" }>;
                return (
                  <div class="trace-cols">
                    <ResultMark kind={c.error ? "fail" : "pass"} title={c.error ?? undefined} />
                    <span class="ellipsis">
                      {t("trace.lookCaptured", { criterion: c.criterion, side: c.side === "base" ? t("look.before") : t("look.after") })}
                      <Show when={c.error}><span class="t3"><span class="sep" />{c.error}</span></Show>
                    </span>
                    <span />
                    <Pin sha={c.pin} />
                    <span />
                  </div>
                );
              }}
            </Match>
            <Match when={ev().kind === "assistant_message" && ev()}>
              {(x) => (
                <Claim>
                  <span class="pre">{(x() as { text: string }).text}</span>
                </Claim>
              )}
            </Match>
            <Match when={ev().kind === "claim" && ev()}>
              {(x) => {
                const c = x() as Extract<TraceEntry["event"], { kind: "claim" }>;
                return <Claim kind={t(`claimKind.${c.claim}`)}>{c.text}</Claim>;
              }}
            </Match>
            <Match when={ev().kind === "injected" && ev()}>
              {(x) => {
                const c = x() as Extract<TraceEntry["event"], { kind: "injected" }>;
                return (
                  <div class="injected">
                    <button class="link-plain injected-head" onClick={() => setOpen((o) => !o)} aria-expanded={open()}>
                      <Icon name="harness" size={10} />
                      {t("trace.injected")}<span class="sep" />{c.channel === "steer" ? t("trace.steer") : t("trace.message")}
                      <Icon name={open() ? "caret-down" : "caret-right"} size={10} />
                    </button>
                    {/* The text is for the agent, in its language: the fold says so, so English in a Chinese interface is not a gap. */}
                    <Show when={open()} fallback={<span class="t3 ellipsis">{c.text.split("\n")[0]} <span class="t4">{t("trace.forAgent")}</span></span>}>
                      <pre class="output-tail">{c.text}</pre>
                    </Show>
                  </div>
                );
              }}
            </Match>
            <Match when={ev().kind === "criterion_result" && ev()}>
              {(x) => {
                const c = x() as Extract<TraceEntry["event"], { kind: "criterion_result" }>;
                return (
                  <div class="col">
                    <div class="trace-cols">
                      <ResultMark kind={c.passed ? "pass" : "fail"} />
                      <span class="ellipsis">
                        {t("trace.verifier", { criterion: c.criterion, result: c.passed ? t("common.passed") : t("common.failed") })}
                        <span class="t3"><span class="sep" />{t("common.exitCode", { code: c.exit_code ?? "—" })}</span>
                      </span>
                      <span class="col-dur">{duration(c.duration_ms)}</span>
                      <Pin sha={c.pin} />
                      <button class="link meta" onClick={() => setOpen((o) => !o)} aria-expanded={open()}>
                        {open() ? t("trace.hideOutput") : t("trace.output")}
                      </button>
                    </div>
                    <Show when={open()}>
                      <pre class="output-tail">{c.output_tail || t("common.noOutput")}</pre>
                    </Show>
                  </div>
                );
              }}
            </Match>
            <Match when={ev().kind === "baseline_result" && ev()}>
              {(x) => {
                const c = x() as Extract<TraceEntry["event"], { kind: "baseline_result" }>;
                return (
                  <div class="trace-cols">
                    <ResultMark kind={c.error ? "pending" : c.passed ? "pass" : "fail"} />
                    <span class="ellipsis" title={c.error ?? undefined}>
                      <Show when={!c.error} fallback={<>{t("trace.baselineError", { criterion: c.criterion })}<span class="t3"><span class="sep" />{c.error}</span></>}>
                        {t("trace.baseline", { criterion: c.criterion, result: c.passed ? t("common.passed") : t("common.failed") })}
                        <span class="t3"><span class="sep" />{c.passed ? t("goal.passedOnBaseShort") : t("goal.redToGreen")}</span>
                      </Show>
                    </span>
                    <span />
                    <Pin sha={c.base} />
                    <span />
                  </div>
                );
              }}
            </Match>
            {/* A transition reads in time order: from → to, then the reason; a raw note stays in the tooltip. */}
            <Match when={ev().kind === "state_changed" && ev()}>
              {(x) => {
                const c = x() as Extract<TraceEntry["event"], { kind: "state_changed" }>;
                return (
                  <span class="trace-state t1" title={c.note || undefined}>
                    <span class="t2">{stateLabel(c.from)}</span>
                    <Icon name="arrow-right" size={10} />
                    <LifecycleGlyph goal={{ state: c.to, progress: EMPTY_PROGRESS, verified_pin: null }} />
                    {stateLabel(c.to)}
                    <Show when={c.reason}>
                      <span class="t2 ellipsis"><span class="sep" />{pauseLabel(c.reason!)}</span>
                    </Show>
                    <Show when={!c.reason && c.note}>
                      <span class="t2 ellipsis"><span class="sep" />{runPurposeLabel(c.note!)}</span>
                    </Show>
                  </span>
                );
              }}
            </Match>
            <Match when={ev().kind === "run_ended" && ev()}>
              {(x) => {
                const c = x() as Extract<TraceEntry["event"], { kind: "run_ended" }>;
                return <span class="t2">{t("trace.runEnded", { n: c.run_no, outcome: runOutcomeLabel(c.outcome) ?? c.outcome })}</span>;
              }}
            </Match>
            <Match when={ev().kind === "engine_error" && ev()}>
              {(x) => <span class="trace-error pre">{(x() as { message: string }).message}</span>}
            </Match>
            <Match when={ev().kind === "steered" && ev()}>
              {(x) => (
                <HumanRow stamp={t("common.you")} cls="row">
                  <span class="grow pre">{(x() as { text: string }).text}</span>
                  <button class="link meta" onClick={() => void remember(props.e.goal_id, (x() as { text: string }).text)}>{t("trace.remember")}</button>
                </HumanRow>
              )}
            </Match>
            <Match when={ev().kind === "sentinel_hit" && ev()}>
              {(x) => {
                const c = x() as Extract<TraceEntry["event"], { kind: "sentinel_hit" }>;
                return (
                  <div class="col">
                    <span class="t1 row">{c.severity >= 3 ? <DangerMark /> : <NoticeMark />}{t("trace.sentinel")}<span class="sep" />{c.title}</span>
                    <span class="meta mono pre">{c.detail}</span>
                  </div>
                );
              }}
            </Match>
            <Match when={ev().kind === "stalled" && ev()}>
              {(x) => <span class="t1 row"><NoticeMark /> {t("trace.stalled")}<span class="sep" />{(x() as { detail: string }).detail}</span>}
            </Match>
            <Match when={ev().kind === "human_edited" && ev()}>
              {(x) => <HumanRow stamp={t("trace.youEdited")}> <span class="mono t2">{(x() as { files: string[] }).files.join("  ")}</span></HumanRow>}
            </Match>
            <Match when={ev().kind === "setup_network_approved" && ev()}>
              {(x) => (
                <HumanRow stamp={t("common.you")}>
                  <span>{t("trace.youApprovedNetwork")} <span class="code-val t3">{short((x() as { fingerprint: string }).fingerprint)}</span></span>
                </HumanRow>
              )}
            </Match>
            <Match when={ev().kind === "local_files_copied" && ev()}>
              {(x) => (
                <span class="t2">
                  {t("trace.localCopied")}<span class="sep" /><span class="mono">{(x() as { files: string[] }).files.join("  ")}</span>
                </span>
              )}
            </Match>
            <Match when={ev().kind === "branch_pushed" && ev()}>
              {(x) => {
                const c = x() as Extract<TraceEntry["event"], { kind: "branch_pushed" }>;
                return (
                  <span class="t1">
                    {t("trace.pushed")} <span class="mono">{c.branch}</span>
                    <Show when={c.pr_url}>
                      <span class="sep" />
                      <span class="mono t2">{c.pr_url}</span>
                    </Show>
                  </span>
                );
              }}
            </Match>
            <Match when={ev().kind === "pr_checked" && ev()}>
              {(x) => {
                const c = x() as Extract<TraceEntry["event"], { kind: "pr_checked" }>;
                return (
                  <span class="row">
                    <span class="t2">{t("trace.prChecked")}</span>
                    <PrLine pr={{ url: c.url, status: c.status }} />
                  </span>
                );
              }}
            </Match>
            <Match when={ev().kind === "inbox_resolved" && ev()}>
              {(x) => <HumanRow stamp={t("trace.yourAnswer")}> {(x() as { response: string }).response}</HumanRow>}
            </Match>
            <Match when={ev().kind === "pinned" && ev()}>
              {(x) => {
                const c = x() as Extract<TraceEntry["event"], { kind: "pinned" }>;
                return <span class="t2 num">{t("trace.snapshot", { pin: short(c.pin), a: c.additions, d: c.deletions, n: c.files })}</span>;
              }}
            </Match>
            <Match when={ev().kind === "loopback_opened" && ev()}>
              {(x) => {
                const c = x() as Extract<TraceEntry["event"], { kind: "loopback_opened" }>;
                return <span class="t2">{t("trace.loopbackOpened", { id: c.criterion, why: c.why })}</span>;
              }}
            </Match>
            <Match when={ev().kind === "note" && ev()}>{(x) => <span class="t2">{(x() as { text: string }).text}</span>}</Match>
            <Match when={(ev() as { kind: string }).kind === "model_escalated" && ev()}>
              {(x) => {
                const c = x() as unknown as { from_model: string; to_model: string; rework_cycle: number };
                return (
                  <span class="t1 row">
                    <Icon name="harness" size={10} />
                    {t("trace.modelEscalated", { from: c.from_model || "default", to: c.to_model, n: c.rework_cycle })}
                  </span>
                );
              }}
            </Match>
            <Match when={(ev() as { kind: string }).kind === "agent_blocked" && ev()}>
              {(x) => {
                const c = x() as unknown as { reason: string; evidence?: string };
                return (
                  <Claim kind={t("trace.agentBlocked")}>
                    <span class="pre">{c.reason}{c.evidence ? `\n${c.evidence}` : ""}</span>
                  </Claim>
                );
              }}
            </Match>
            <Match when={(ev() as { kind: string }).kind === "criterion_flaky" && ev()}>
              {(x) => {
                const c = x() as unknown as { criterion: string; pin: string };
                return (
                  <span class="t1 row">
                    <NoticeMark />
                    {t("trace.criterionFlaky", { criterion: c.criterion, pin: short(c.pin) })}
                  </span>
                );
              }}
            </Match>
            <Match when={ev().kind === "submitted" && ev()}>
              {(x) => <Claim kind={t("trace.done")}>{(x() as { summary: string }).summary}</Claim>}
            </Match>
          </Switch>
        </div>
      </div>
    </Show>
  );
}
