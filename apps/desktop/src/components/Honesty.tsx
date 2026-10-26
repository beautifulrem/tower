/**
 * The honesty grammar (docs/12 §12.5): fact, observation, claim and human
 * decision are distinguishable at a glance, in shape as well as colour.
 */
import { type JSX, Show } from "solid-js";

import type { Consistency } from "../gen/Consistency";
import type { Progress } from "../gen/Progress";
import { ago, clock, short } from "../lib/format";
import { t } from "../lib/i18n";
import { state } from "../lib/store";

/**
 * ⚙ fact: harness-produced, the normal case, so it carries no frame — only
 * the gear and the snapshot it was measured on.
 */
export function FactChip(props: { pin?: string | null; at?: number | null; children?: JSX.Element }) {
  return (
    <span class="fact">
      <span class="fact-icon" aria-label={t("honesty.measured")}>⚙</span>
      {props.children}
      <Show when={props.pin}>
        <span class="code-val">@{short(props.pin)}</span>
      </Show>
      <Show when={props.at}>
        <span class="sep">·</span>
        <span class="num">{ago(props.at, state.now)}</span>
      </Show>
    </span>
  );
}

/** Observation: a degraded register, so it keeps a dashed frame; never coloured. */
export function ObsChip(props: { at?: number | null; children?: JSX.Element }) {
  return (
    <span class="chip chip-obs">
      {t("honesty.observation")}
      {props.children}
      <Show when={props.at}>
        <span class="sep">·</span>
        <span>{ago(props.at, state.now)}</span>
      </Show>
    </span>
  );
}

/**
 * "Agent 称": a hanging label column and secondary text. Never green, never
 * a solid mark — the dashed ┆ is the claim register's only glyph.
 */
export function Claim(props: { children: JSX.Element; kind?: string; aside?: JSX.Element }) {
  return (
    <div class="claim">
      <span class="claim-label halt">{t("honesty.agentSays")}</span>
      <div class="claim-text">
        <Show when={props.kind}>
          <span class="claim-kind">{props.kind}</span>
        </Show>
        {props.children}
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
      {t("common.you")} · {clock(props.at)}
      {props.children}
    </span>
  );
}

/** Cross-check badge for a claim. Consistency is never green: agreeing is not proof. */
export function ConsistencyBadge(props: { value: Consistency; evidence?: string | null }) {
  const text = () => t(`honesty.${props.value}`);
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
        fallback={<span class="meta">{t("honesty.notMachineVerified")}</span>}
      >
        <span class="segs" aria-hidden="true">
          {segs().map((s) => (
            <span class={`seg seg-${s}`} />
          ))}
        </span>
        <span class="meta num halt">
          {t("honesty.verified", { v: p().verified, m: p().machine })}
          <span class="sep">·</span>
          {t("honesty.observed", { o: p().observed, m: p().machine })}
        </span>
      </Show>
      <Show when={p().human > 0}>
        <span class="sep">·</span>
        <span class="meta num">
          {t("honesty.human", { d: p().human_done, n: p().human })}
        </span>
      </Show>
    </div>
  );
}
