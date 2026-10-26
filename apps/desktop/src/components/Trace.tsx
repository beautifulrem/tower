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
import { clock, duration, short } from "../lib/format";
import { t } from "../lib/i18n";
import { pauseLabel, runOutcomeLabel, runPurposeLabel, stateLabel } from "../lib/labels";
import { DangerMark, Icon, LifecycleGlyph, NoticeMark, ResultMark } from "./Glyph";
import { Claim } from "./Honesty";
import { PrLine } from "./Pr";
import { Empty } from "./ui";
import { act, onTrace, refreshProjects, state } from "../lib/store";

type Filter = "all" | "tools" | "words" | "facts" | "errors";

const filters: Filter[] = ["all", "tools", "words", "facts", "errors"];

/** Rows rendered at once; the step the window grows by at the top. */
export const WINDOW = 300;
const STEP = 200;
const PAGE = 200;

export function matches(e: TraceEntry, f: Filter): boolean {
  const k = e.event.kind;
  if (k === "mode_changed" || k === "tool_started") return false; // folded into tool_ended rows
  // Spend ticks after every tool call: a fact, but noise in the full view.
  if (k === "cost_updated") return f === "facts";
  switch (f) {
    case "all":
      return true;
    case "tools":
      return k === "tool_ended";
    case "words":
      return e.source === "claim";
    case "facts":
      return e.source === "fact" && k !== "tool_ended";
    case "errors":
      return k === "engine_error" || (k === "tool_ended" && e.event.is_error) || (k === "criterion_result" && !e.event.passed);
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
  let scroller!: HTMLDivElement;

  const load = async () => {
    const before = entries()[0]?.seq ?? null;
    const page = await api.trace(props.id, before, PAGE);
    if (page.length < PAGE) setMore(false);
    setEntries((e) => [...page.reverse(), ...e]);
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
      setEntries((list) => [...list, ...batch]);
      if (atBottom) queueMicrotask(() => (scroller.scrollTop = scroller.scrollHeight));
    }, 100);
  });
  onCleanup(() => {
    off();
    clearTimeout(flush);
  });

  const filtered = createMemo(() => entries().filter((e) => matches(e, filter())));
  const shown = createMemo(() => filtered().slice(-window_()));
  const hidden = () => filtered().length - shown().length;

  /** Reveals earlier rows, keeping the scroll position on the row that was at the top. */
  const reveal = async () => {
    const before = scroller.scrollHeight;
    if (hidden() > 0) setWindow((w) => w + STEP);
    else if (more()) await load();
    queueMicrotask(() => (scroller.scrollTop += scroller.scrollHeight - before));
  };

  return (
    <div class="trace">
      <div class="trace-filters" role="tablist" aria-label={t("trace.filterLabel")}>
        <For each={filters}>
          {(f) => (
            <button class="tab" role="tab" aria-selected={filter() === f} classList={{ active: filter() === f }} onClick={() => setFilter(f)}>
              {t(`trace.${f}`)}
            </button>
          )}
        </For>
        <span class="grow" />
        <Show when={props.live}>
          <span class="meta">{t("trace.live")}</span>
        </Show>
      </div>
      <div class="trace-scroll" ref={scroller} role="log" aria-live="off" onScroll={() => scroller.scrollTop < 40 && (hidden() > 0 || more()) && void reveal()}>
        <Show when={hidden() > 0 || more()}>
          <button class="trace-more link" onClick={() => void reveal()}>
            {hidden() > 0 ? t("trace.showEarlier", { n: Math.min(STEP, hidden()) }) : t("trace.loadEarlier")}
          </button>
        </Show>
        <Show when={loaded() && filtered().length === 0}>
          <div class="trace-empty">
            <Empty title={entries().length === 0 ? t("trace.emptyTitle") : t(`trace.emptyFilter_${filter()}`)} inline>
              {entries().length === 0 ? t("trace.emptyBody") : ""}
            </Empty>
          </div>
        </Show>
        <For each={shown()}>{(e) => <TraceRow e={e} />}</For>
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
      observed: "evObserved",
      inbox_opened: "evInboxOpened",
      human_check: "evHumanCheck",
      claim_reviewed: "evClaimReviewed",
      cost_updated: "evCostUpdated",
      branch_written: "evBranchWritten",
    } as const
  )[kind as "goal_created"];
  return key ? t(`trace.${key}`) : kind;
}

function TraceRow(props: { e: TraceEntry }) {
  const ev = () => props.e.event;
  const [open, setOpen] = createSignal(false);
  return (
    <Show
      when={ev().kind !== "run_started"}
      fallback={
        <div class="trace-divider">
          <span class="trace-time num">{clock(props.e.at)}</span>
          <span>
            {t("trace.runStarted", { n: (ev() as { run_no: number }).run_no })} · {runPurposeLabel((ev() as { purpose: string }).purpose)}
          </span>
        </div>
      }
    >
      <div class={`trace-row trace-${props.e.source}`}>
        <span class="trace-time num">{clock(props.e.at)}</span>
        <div class="trace-content">
          <Switch fallback={<span class="t2">{plainLabel(ev().kind)}</span>}>
            <Match when={ev().kind === "tool_ended" && ev()}>
              {(x) => {
                const e = x() as Extract<TraceEntry["event"], { kind: "tool_ended" }>;
                return (
                  <div class="row">
                    <span class="mono trace-tool" classList={{ "trace-error": e.is_error }}>
                      {e.tool}
                    </span>
                    <span class="mono t2 ellipsis grow">{e.summary || "—"}</span>
                    <span class="meta num">{duration(e.duration_ms)}</span>
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
                      {t("trace.injected")} · {c.channel === "steer" ? t("trace.steer") : t("trace.message")}
                      <Icon name={open() ? "caret-down" : "caret-right"} size={10} />
                    </button>
                    <Show when={open()} fallback={<span class="t2 ellipsis">{c.text.split("\n")[0]}</span>}>
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
                        <span class="t3"> · {t("common.exitCode", { code: c.exit_code ?? "—" })}</span>
                      </span>
                      <span class="col-dur">{duration(c.duration_ms)}</span>
                      <span class="col-pin">
                        <Icon name="harness" size={10} />@{short(c.pin)}
                      </span>
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
                    <ResultMark kind={c.passed ? "pass" : "fail"} />
                    <span class="ellipsis">
                      {t("trace.baseline", { criterion: c.criterion, result: c.passed ? t("common.passed") : t("common.failed") })}
                      <span class="t3"> · {c.passed ? t("goal.passedOnBaseShort") : t("goal.redToGreen")}</span>
                    </span>
                    <span />
                    <span class="col-pin">
                      <Icon name="harness" size={10} />@{short(c.base)}
                    </span>
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
                      <span class="t2 ellipsis"> · {pauseLabel(c.reason!)}</span>
                    </Show>
                    <Show when={!c.reason && c.note}>
                      <span class="t2 ellipsis"> · {runPurposeLabel(c.note!)}</span>
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
                <div class="human-line row">
                  <span class="human-stamp">{t("common.you")}</span>
                  <span class="grow pre">{(x() as { text: string }).text}</span>
                  <button class="link meta" onClick={() => void remember(props.e.goal_id, (x() as { text: string }).text)}>
                    {t("trace.remember")}
                  </button>
                </div>
              )}
            </Match>
            <Match when={ev().kind === "sentinel_hit" && ev()}>
              {(x) => {
                const c = x() as Extract<TraceEntry["event"], { kind: "sentinel_hit" }>;
                return (
                  <div class="col">
                    <span class="t1 row">
                      <Show when={c.severity >= 3} fallback={<NoticeMark />}>
                        <DangerMark />
                      </Show>
                      {t("trace.sentinel")} · {c.title}
                    </span>
                    <span class="meta mono pre">{c.detail}</span>
                  </div>
                );
              }}
            </Match>
            <Match when={ev().kind === "stalled" && ev()}>
              {(x) => (
                <span class="t1 row">
                  <NoticeMark /> {t("trace.stalled")} · {(x() as { detail: string }).detail}
                </span>
              )}
            </Match>
            <Match when={ev().kind === "human_edited" && ev()}>
              {(x) => (
                <div class="human-line">
                  <span class="human-stamp">{t("trace.youEdited")}</span> <span class="mono t2">{(x() as { files: string[] }).files.join("  ")}</span>
                </div>
              )}
            </Match>
            <Match when={ev().kind === "setup_network_approved" && ev()}>
              {(x) => (
                <div class="human-line">
                  <span class="human-stamp">{t("common.you")}</span>
                  <span>
                    {t("trace.youApprovedNetwork")} <span class="code-val t3">{short((x() as { fingerprint: string }).fingerprint)}</span>
                  </span>
                </div>
              )}
            </Match>
            <Match when={ev().kind === "local_files_copied" && ev()}>
              {(x) => (
                <span class="t2">
                  {t("trace.localCopied")} · <span class="mono">{(x() as { files: string[] }).files.join("  ")}</span>
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
                      <span class="sep">·</span>
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
              {(x) => (
                <div class="human-line">
                  <span class="human-stamp">{t("trace.yourAnswer")}</span> {(x() as { response: string }).response}
                </div>
              )}
            </Match>
            <Match when={ev().kind === "pinned" && ev()}>
              {(x) => {
                const c = x() as Extract<TraceEntry["event"], { kind: "pinned" }>;
                return <span class="t2 num">{t("trace.snapshot", { pin: short(c.pin), a: c.additions, d: c.deletions, n: c.files })}</span>;
              }}
            </Match>
            <Match when={ev().kind === "note" && ev()}>{(x) => <span class="t2">{(x() as { text: string }).text}</span>}</Match>
            <Match when={ev().kind === "submitted" && ev()}>
              {(x) => <Claim kind={t("trace.done")}>{(x() as { summary: string }).summary}</Claim>}
            </Match>
          </Switch>
        </div>
      </div>
    </Show>
  );
}
