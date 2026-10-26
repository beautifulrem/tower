/**
 * The honesty grammar (docs/12 §12.5): fact, observation, claim and human
 * decision are distinguishable at a glance, in shape as well as colour.
 *
 * Layout rule — the source gutter: every register hangs its author in the
 * same 6em column on the left (`┆ Agent 称`, `你 · 14:20`), so a page reads
 * like a ledger: who said it, what was said, and on the right what was
 * measured.
 */
import { type JSX, Show } from "solid-js";

import type { Consistency } from "../gen/Consistency";
import type { Progress } from "../gen/Progress";
import { ago, clock, short } from "../lib/format";
import { t } from "../lib/i18n";
import { state } from "../lib/store";
import { Icon, ResultMark } from "./Glyph";

/**
 * Fact: harness-produced, the normal case, so it carries no frame — only
 * the scale mark and the snapshot it was measured on.
 */
export function FactChip(props: { pin?: string | null; at?: number | null; children?: JSX.Element }) {
  return (
    <span class="fact">
      <span class="sr-only">{t("honesty.srVerified")} </span>
      <Icon name="harness" size={10} class="fact-icon" label={t("honesty.measured")} />
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

/** Observation: a degraded register. Only the word wears the dashed frame; never coloured. */
export function ObsChip(props: { title?: string }) {
  return (
    <span class="chip chip-obs" title={props.title}>
      <span class="sr-only">{t("honesty.srObserved")} </span>
      {t("honesty.observation")}
    </span>
  );
}

/**
 * A claim: the hanging label column and secondary text. Never green, never
 * a solid mark — the dashed ┆ is the claim register's only glyph, so one
 * layer is enough: the gutter says the kind (cause, next step…) when there
 * is one, and "Agent 称" otherwise. The text column starts clean.
 */
export function Claim(props: { children: JSX.Element; kind?: string; aside?: JSX.Element; bare?: boolean }) {
  return (
    <div class="claim">
      <span class="claim-label halt" title={t("honesty.agentSaysPlain")}>
        <span class="claim-rule" aria-hidden="true">
          ┆
        </span>
        <span class="sr-only">{t("honesty.srClaim")} </span>
        <span class="claim-kind">{props.kind ?? t("honesty.agentSaysPlain")}</span>
      </span>
      <div class="claim-text">{props.children}</div>
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
        <ResultMark kind="fail" />
      </Show>
      <Show when={props.value === "stale"}>
        <ResultMark kind="stale" />
      </Show>
      {text()}
    </span>
  );
}

/**
 * Two-track progress (ADR-020): verified segments are facts and may be
 * green; observed ones are hollow and grey; human criteria sit apart.
 */
export function CriteriaBar(props: { progress: Progress; compact?: boolean; tiny?: boolean }) {
  const p = () => props.progress;
  const segs = () =>
    Array.from({ length: p().machine }, (_, i) =>
      i < p().verified ? "verified" : i < Math.max(p().verified, p().observed) ? "observed" : "empty",
    );
  const full = () =>
    [
      p().machine > 0 ? `${t("honesty.verified", { v: p().verified, m: p().machine })} · ${t("honesty.observed", { o: p().observed, m: p().machine })}` : t("honesty.notMachineVerified"),
      p().human > 0 ? t("honesty.human", { d: p().human_done, n: p().human }) : "",
    ]
      .filter(Boolean)
      .join(" · ");
  return (
    <div class="criteria-bar" classList={{ compact: !!props.compact || !!props.tiny, tiny: !!props.tiny }} title={`${full()} — ${t("honesty.barTitle")}`}>
      <span class="sr-only">{full()}</span>
      <Show when={p().machine > 0} fallback={<span class="meta" aria-hidden="true">{props.tiny ? t("honesty.noMachineShort") : t("honesty.notMachineVerified")}</span>}>
        <span class="segs" aria-hidden="true">
          {segs().map((s) => (
            <span class={`seg seg-${s}`} />
          ))}
        </span>
        <span class="meta num halt" aria-hidden="true">
          <Show
            when={!props.tiny}
            fallback={
              <>
                {p().verified}/{p().machine}
              </>
            }
          >
            {t("honesty.verified", { v: p().verified, m: p().machine })}
            <span class="sep">·</span>
            {t("honesty.observed", { o: p().observed, m: p().machine })}
          </Show>
        </span>
      </Show>
      <Show when={p().human > 0}>
        <span class="sep crit-human" aria-hidden="true">·</span>
        <span class="meta num crit-human" aria-hidden="true">
          {props.tiny ? t("honesty.humanShort", { d: p().human_done, n: p().human }) : t("honesty.human", { d: p().human_done, n: p().human })}
        </span>
      </Show>
    </div>
  );
}
