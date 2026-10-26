/**
 * Trace (docs/04 §4.7): lossless and time-indexed, reachable in one key.
 * Tower's own injections are shown verbatim and labelled as injected by Tower.
 */
import { For, Match, Show, Switch, createSignal, onCleanup, onMount } from "solid-js";

import type { TraceEntry } from "../gen/TraceEntry";
import { api } from "../lib/api";
import { clock, duration, short } from "../lib/format";
import { t } from "../lib/i18n";
import { Claim } from "./Honesty";
import { act, onTrace, refreshProjects, state } from "../lib/store";

type Filter = "all" | "tools" | "words" | "facts" | "errors";

const filters: Filter[] = ["all", "tools", "words", "facts", "errors"];

function matches(e: TraceEntry, f: Filter): boolean {
  const k = e.event.kind;
  if (k === "mode_changed" || k === "tool_started") return false; // folded into tool_ended rows
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
    () => api.updateProject(p.id, {
        base_branch: p.base_branch,
        test_command: p.test_command,
        local_files: p.local_files,
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
  let scroller!: HTMLDivElement;

  const load = async () => {
    const before = entries()[0]?.seq ?? null;
    const page = await api.trace(props.id, before, 200);
    if (page.length < 200) setMore(false);
    setEntries((e) => [...page.reverse(), ...e]);
  };

  onMount(async () => {
    await load();
    scroller.scrollTop = scroller.scrollHeight;
  });
  const off = onTrace(props.id, (e) => {
    const atBottom = scroller.scrollHeight - scroller.scrollTop - scroller.clientHeight < 40;
    setEntries((list) => [...list, e]);
    if (atBottom) queueMicrotask(() => (scroller.scrollTop = scroller.scrollHeight));
  });
  onCleanup(off);

  return (
    <div class="trace">
      <div class="trace-filters">
        <For each={filters}>
          {(f) => (
            <button class="pill" classList={{ active: filter() === f }} onClick={() => setFilter(f)}>
              {t(`trace.${f}`)}
            </button>
          )}
        </For>
        <span class="grow" />
        <Show when={props.live}>
          <span class="meta">{t("trace.live")}</span>
        </Show>
      </div>
      <div class="trace-scroll" ref={scroller}>
        <Show when={more()}>
          <button class="trace-more link" onClick={load}>
            {t("trace.loadEarlier")}
          </button>
        </Show>
        <For each={entries().filter((e) => matches(e, filter()))}>{(e) => <TraceRow e={e} />}</For>
      </div>
    </div>
  );
}

function TraceRow(props: { e: TraceEntry }) {
  const ev = () => props.e.event;
  const [open, setOpen] = createSignal(false);
  return (
    <div class={`trace-row trace-${props.e.source}`}>
      <span class="trace-time num">{clock(props.e.at)}</span>
      <div class="trace-content">
        <Switch fallback={<span class="t2">{ev().kind}</span>}>
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
                  <button class="chip chip-fact" onClick={() => setOpen((o) => !o)}>
                    {t("trace.injected")} · {c.channel === "steer" ? t("trace.steer") : t("trace.message")} {open() ? "▾" : "▸"}
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
                  <div class="row">
                    <span class={`result result-${c.passed ? "pass" : "fail"}`}>{c.passed ? "✓" : "✕"}</span>
                    <span>
                      {t("trace.verifier", { criterion: c.criterion, result: c.passed ? t("common.passed") : t("common.failed") })}
                    </span>
                    <span class="meta num">
                      {t("common.exitCode", { code: c.exit_code ?? "—" })} · {duration(c.duration_ms)} · @{short(c.pin)}
                    </span>
                    <button class="link meta" onClick={() => setOpen((o) => !o)}>
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
          <Match when={ev().kind === "state_changed" && ev()}>
            {(x) => {
              const c = x() as Extract<TraceEntry["event"], { kind: "state_changed" }>;
              return (
                <span class="t1">
                  {c.from} → {c.to}
                  <Show when={c.note}>
                    <span class="t2"> · {c.note}</span>
                  </Show>
                </span>
              );
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
                  <span class="t1">
                    <span class={c.severity >= 3 ? "mark-danger" : ""}>{c.severity >= 3 ? "■" : "◇"}</span> {t("trace.sentinel")} · {c.title}
                  </span>
                  <span class="meta mono pre">{c.detail}</span>
                </div>
              );
            }}
          </Match>
          <Match when={ev().kind === "stalled" && ev()}>
            {(x) => <span class="t1">◇ {t("trace.stalled")} · {(x() as { detail: string }).detail}</span>}
          </Match>
          <Match when={ev().kind === "human_edited" && ev()}>
            {(x) => (
              <div class="human-line">
                <span class="human-stamp">{t("trace.youEdited")}</span> <span class="mono t2">{(x() as { files: string[] }).files.join("  ")}</span>
              </div>
            )}
          </Match>
          <Match when={ev().kind === "local_files_copied" && ev()}>
            {(x) => <span class="t2">{t("trace.localCopied")} · <span class="mono">{(x() as { files: string[] }).files.join("  ")}</span></span>}
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
              return (
                <span class="t2 num">
                  {t("trace.snapshot", { pin: short(c.pin), a: c.additions, d: c.deletions, n: c.files })}
                </span>
              );
            }}
          </Match>
          <Match when={ev().kind === "run_started" && ev()}>
            {(x) => <span class="trace-divider">{t("trace.runStarted", { n: (x() as { run_no: number }).run_no })}</span>}
          </Match>
          <Match when={ev().kind === "note" && ev()}>{(x) => <span class="t2">{(x() as { text: string }).text}</span>}</Match>
          <Match when={ev().kind === "submitted" && ev()}>
            {(x) => (
              <Claim kind={t("trace.done")}>{(x() as { summary: string }).summary}</Claim>
            )}
          </Match>
        </Switch>
      </div>
    </div>
  );
}
