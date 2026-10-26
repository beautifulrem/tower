/**
 * Trace (docs/04 §4.7): lossless and time-indexed, reachable in one key.
 * Tower's own injections are shown verbatim and labelled "Tower 注入".
 */
import { For, Match, Show, Switch, createSignal, onCleanup, onMount } from "solid-js";

import type { TraceEntry } from "../gen/TraceEntry";
import { api } from "../lib/api";
import { clock, duration, short } from "../lib/format";
import { onTrace } from "../lib/store";

type Filter = "all" | "tools" | "words" | "facts" | "errors";

const filters: [Filter, string][] = [
  ["all", "全部"],
  ["tools", "工具"],
  ["words", "Agent 的话"],
  ["facts", "事实"],
  ["errors", "错误"],
];

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
          {([f, label]) => (
            <button class="pill" classList={{ active: filter() === f }} onClick={() => setFilter(f)}>
              {label}
            </button>
          )}
        </For>
        <span class="grow" />
        <Show when={props.live}>
          <span class="meta">实时</span>
        </Show>
      </div>
      <div class="trace-scroll" ref={scroller}>
        <Show when={more()}>
          <button class="trace-more link" onClick={load}>
            载入更早的记录
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
            {(t) => {
              const e = t() as Extract<TraceEntry["event"], { kind: "tool_ended" }>;
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
            {(t) => (
              <div class="claim">
                <div class="claim-body">
                  <span class="claim-label">Agent 称</span>
                  <span class="claim-text pre">{(t() as { text: string }).text}</span>
                </div>
              </div>
            )}
          </Match>
          <Match when={ev().kind === "claim" && ev()}>
            {(t) => {
              const c = t() as Extract<TraceEntry["event"], { kind: "claim" }>;
              const label = { cause: "原因", decision: "决定", assumption: "假设", next: "下一步", progress: "进展", criterion_met: "标准已满足", done: "完成" }[c.claim];
              return (
                <div class="claim">
                  <div class="claim-body">
                    <span class="claim-label">Agent 称（{label}）</span>
                    <span class="claim-text">{c.text}</span>
                  </div>
                </div>
              );
            }}
          </Match>
          <Match when={ev().kind === "injected" && ev()}>
            {(t) => {
              const c = t() as Extract<TraceEntry["event"], { kind: "injected" }>;
              return (
                <div class="injected">
                  <button class="chip chip-fact" onClick={() => setOpen((o) => !o)}>
                    ⚙ Tower 注入 · {c.channel === "steer" ? "转向" : "消息"} {open() ? "▾" : "▸"}
                  </button>
                  <Show when={open()} fallback={<span class="t2 ellipsis">{c.text.split("\n")[0]}</span>}>
                    <pre class="output-tail">{c.text}</pre>
                  </Show>
                </div>
              );
            }}
          </Match>
          <Match when={ev().kind === "criterion_result" && ev()}>
            {(t) => {
              const c = t() as Extract<TraceEntry["event"], { kind: "criterion_result" }>;
              return (
                <div class="col">
                  <div class="row">
                    <span class={`result result-${c.passed ? "pass" : "fail"}`}>{c.passed ? "✓" : "✕"}</span>
                    <span>
                      验证器 · {c.criterion} {c.passed ? "通过" : "失败"}
                    </span>
                    <span class="meta num">
                      退出码 {c.exit_code ?? "—"} · {duration(c.duration_ms)} · @{short(c.pin)}
                    </span>
                    <button class="link meta" onClick={() => setOpen((o) => !o)}>
                      {open() ? "收起输出" : "输出"}
                    </button>
                  </div>
                  <Show when={open()}>
                    <pre class="output-tail">{c.output_tail || "（没有输出）"}</pre>
                  </Show>
                </div>
              );
            }}
          </Match>
          <Match when={ev().kind === "state_changed" && ev()}>
            {(t) => {
              const c = t() as Extract<TraceEntry["event"], { kind: "state_changed" }>;
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
            {(t) => <span class="trace-error pre">{(t() as { message: string }).message}</span>}
          </Match>
          <Match when={ev().kind === "steered" && ev()}>
            {(t) => (
              <div class="human-line">
                <span class="human-stamp">你</span> {(t() as { text: string }).text}
              </div>
            )}
          </Match>
          <Match when={ev().kind === "inbox_resolved" && ev()}>
            {(t) => (
              <div class="human-line">
                <span class="human-stamp">你的回答</span> {(t() as { response: string }).response}
              </div>
            )}
          </Match>
          <Match when={ev().kind === "pinned" && ev()}>
            {(t) => {
              const c = t() as Extract<TraceEntry["event"], { kind: "pinned" }>;
              return (
                <span class="t2 num">
                  快照 @{short(c.pin)} · +{c.additions} −{c.deletions} · {c.files} 文件
                </span>
              );
            }}
          </Match>
          <Match when={ev().kind === "run_started" && ev()}>
            {(t) => <span class="trace-divider">第 {(t() as { run_no: number }).run_no} 次运行开始</span>}
          </Match>
          <Match when={ev().kind === "note" && ev()}>{(t) => <span class="t2">{(t() as { text: string }).text}</span>}</Match>
          <Match when={ev().kind === "submitted" && ev()}>
            {(t) => (
              <div class="claim">
                <div class="claim-body">
                  <span class="claim-label">Agent 称已完成</span>
                  <span class="claim-text">{(t() as { summary: string }).summary}</span>
                </div>
              </div>
            )}
          </Match>
        </Switch>
      </div>
    </div>
  );
}
