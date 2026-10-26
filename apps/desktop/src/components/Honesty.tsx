/**
 * The honesty grammar (docs/12 §12.5): fact, observation, claim and human
 * decision are distinguishable at a glance, in shape as well as colour.
 */
import { type JSX, Show } from "solid-js";

import type { Consistency } from "../gen/Consistency";
import type { Progress } from "../gen/Progress";
import { ago, short } from "../lib/format";
import { state } from "../lib/store";

/** ⚙ fact chip: solid hairline frame, harness-produced. */
export function FactChip(props: { pin?: string | null; at?: number | null; children?: JSX.Element }) {
  return (
    <span class="chip chip-fact num">
      <span class="chip-icon">⚙</span>
      {props.children}
      <Show when={props.pin}>
        <span>@{short(props.pin)}</span>
      </Show>
      <Show when={props.at}>
        <span class="sep">·</span>
        <span>{ago(props.at, state.now)}</span>
      </Show>
    </span>
  );
}

/** Observation chip: dashed frame, never coloured. */
export function ObsChip(props: { at?: number | null; children?: JSX.Element }) {
  return (
    <span class="chip chip-obs num">
      观测
      {props.children}
      <Show when={props.at}>
        <span class="sep">·</span>
        <span>{ago(props.at, state.now)}</span>
      </Show>
    </span>
  );
}

/** "Agent 称" block: dashed left rule, secondary text, never green. */
export function Claim(props: { children: JSX.Element; label?: string; aside?: JSX.Element }) {
  return (
    <div class="claim">
      <div class="claim-body">
        <span class="claim-label">{props.label ?? "Agent 称"}</span>
        <span class="claim-text">{props.children}</span>
      </div>
      <Show when={props.aside}>
        <div class="claim-aside">{props.aside}</div>
      </Show>
    </div>
  );
}

/** Your decisions: solid left rule, primary text. */
export function HumanStamp(props: { at: number; children?: JSX.Element }) {
  return (
    <span class="human-stamp">
      你 · {new Date(props.at).toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" })}
      {props.children}
    </span>
  );
}

/** Cross-check badge for a claim. Consistency is never green: agreeing is not proof. */
export function ConsistencyBadge(props: { value: Consistency; evidence?: string | null }) {
  const text = () =>
    ({ consistent: "一致", contradicted: "矛盾", stale: "已过期", unsupported: "无依据" })[props.value];
  return (
    <span class={`consistency consistency-${props.value}`} title={props.evidence ?? undefined}>
      <Show when={props.value === "contradicted"}>
        <span class="result result-fail">✕</span>
      </Show>
      <Show when={props.value === "stale"}>
        <span class="t4">⟲</span>
      </Show>
      {text()}
    </span>
  );
}

/**
 * Two-track progress (ADR-020): verified segments are facts and may be
 * green; observed ones are hollow and grey; human criteria sit apart.
 */
export function CriteriaBar(props: { progress: Progress; compact?: boolean }) {
  const p = () => props.progress;
  const segs = () =>
    Array.from({ length: p().machine }, (_, i) =>
      i < p().verified ? "verified" : i < Math.max(p().verified, p().observed) ? "observed" : "empty",
    );
  return (
    <div class="criteria-bar" classList={{ compact: !!props.compact }}>
      <Show
        when={p().machine > 0}
        fallback={<span class="meta">未经机器验证</span>}
      >
        <span class="segs" aria-hidden="true">
          {segs().map((s) => (
            <span class={`seg seg-${s}`} />
          ))}
        </span>
        <span class="meta num">
          已验证 {p().verified}/{p().machine}
          <span class="sep">·</span>
          观测 {p().observed}/{p().machine}
        </span>
      </Show>
      <Show when={p().human > 0}>
        <span class="sep">·</span>
        <span class="meta num">
          人工 {p().human_done}/{p().human}
        </span>
      </Show>
    </div>
  );
}
