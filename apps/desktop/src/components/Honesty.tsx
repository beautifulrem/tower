/**
 * The honesty grammar (docs/12 §12.5): fact, observation, claim and human
 * decision are distinguishable at a glance, in shape as well as colour.
 *
 * Layout rule — the source gutter: every register hangs its author in the
 * same 6em column on the left (`┆ Agent 称`, `你 · 14:20`), so a page reads
 * like a ledger: who said it, what was said, and on the right what was
 * measured.
 */
import { For, type JSX, Match, Show, Switch } from "solid-js";

import type { Consistency } from "../gen/Consistency";
import type { CriterionView } from "../gen/CriterionView";
import type { Progress } from "../gen/Progress";
import { ago, clock, short } from "../lib/format";
import { t } from "../lib/i18n";
import { state } from "../lib/store";
import { Icon, NeedsYouMark, NoticeMark, ResultMark } from "./Glyph";

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
export function Claim(props: { children: JSX.Element; kind?: string; aside?: JSX.Element; bare?: boolean; dim?: boolean }) {
  const kind = () => props.kind ?? t("honesty.agentSaysPlain");
  return (
    <div class="claim" classList={{ "claim-dim": !!props.dim }}>
      <span class="claim-label halt" title={props.kind ? `${kind()} · ${t("honesty.agentSaysPlain")}` : t("honesty.agentSaysPlain")}>
        <span class="claim-rule" aria-hidden="true">
          ┆
        </span>
        <span class="sr-only">{t("honesty.srClaim")} </span>
        <span class="claim-kind">{kind()}</span>
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
 * Machine criteria whose must-fail canary passed: the command passed, and
 * that pass is not evidence (the assertions or the runner were tampered
 * with). Derived from the criteria themselves, never from the summary's
 * count, so the line under a criterion and the total above it say the
 * same thing.
 */
export const discountedOf = (criteria: readonly CriterionView[] | null | undefined): number => (criteria ?? []).filter((c) => c.canary === "tampered").length;

/**
 * Two-track progress (ADR-020): verified segments are facts and may be
 * green; observed ones are hollow and grey; human criteria sit apart. The
 * supervisor's count already leaves out a pass with a tampered canary; with
 * the criteria at hand the bar says so instead of leaving a gap — an amber
 * segment of its own and "verified 2/3 · 1 doesn't count".
 */
export function CriteriaBar(props: { progress: Progress; criteria?: readonly CriterionView[] | null; compact?: boolean; tiny?: boolean }) {
  const p = () => props.progress;
  const verified = () => p().verified;
  const discounted = () => Math.max(0, Math.min(discountedOf(props.criteria), p().machine - verified()));
  const segs = () =>
    Array.from({ length: p().machine }, (_, i) =>
      i < verified() ? "verified" : i < verified() + discounted() ? "discounted" : i < Math.max(verified() + discounted(), p().observed) ? "observed" : "empty",
    );
  const machineText = () =>
    [t("honesty.verified", { v: verified(), m: p().machine }), discounted() > 0 ? t("honesty.discounted", { n: discounted() }) : "", t("honesty.observed", { o: p().observed, m: p().machine })]
      .filter(Boolean)
      .join(" · ");
  const full = () =>
    [p().machine > 0 ? machineText() : t("honesty.notMachineVerified"), p().human > 0 ? t("honesty.human", { d: p().human_done, n: p().human }) : ""].filter(Boolean).join(" · ");
  const title = () => `${full()} — ${t("honesty.barTitle")}${discounted() > 0 ? ` ${t("honesty.discountedTitle")}` : ""}`;
  return (
    <div class="criteria-bar" classList={{ compact: !!props.compact || !!props.tiny, tiny: !!props.tiny, "has-discounted": discounted() > 0 }} title={title()}>
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
                {verified()}/{p().machine}
              </>
            }
          >
            {t("honesty.verified", { v: verified(), m: p().machine })}
            <Show when={discounted() > 0}>
              <span class="sep">·</span>
              <span class="discounted">{t("honesty.discounted", { n: discounted() })}</span>
            </Show>
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

/**
 * A result produced with the held-out tests present: its output went to you
 * and never to the agent. Said in your register — the solid rule of a human
 * stamp, not the verifier's green nor the claim's dashes — quietly, under the
 * row, with the long form one hover away.
 */
export function HeldOutChip() {
  return (
    <span class="chip chip-you" title={t("goal.heldOutLong")}>
      {t("goal.heldOut")}
    </span>
  );
}

/** The held-out chip on a line of its own: for a criterion with no canary line to ride on. */
export function HeldOutLine(props: { c: CriterionView }) {
  return (
    <Show when={props.c.verified?.held_out && !props.c.canary}>
      <div class="criterion-row criterion-obs">
        <span />
        <span />
        <span />
        <span class="col-span">
          <HeldOutChip />
        </span>
      </div>
    </Show>
  );
}

/**
 * What the must-fail canary showed, under a criterion that proved the change:
 * a test that cannot pass was added in the tests' own style and the command
 * run again. Intact is a fact (the scale mark, quietly: the assertions were
 * checked); not checked is said as quietly, with why it matters one hover
 * away (a pass alone does not show that the tests assert); tampered is the
 * attention register — the pass is the opposite of evidence. A result run
 * with the held-out tests present says so on the same line, so a criterion
 * never carries two lines of notes.
 */
export function CanaryLine(props: { c: CriterionView }) {
  const state = () => props.c.canary;
  return (
    <Show when={state()}>
      <div class="criterion-row criterion-obs canary-line" data-canary={state()!}>
        <span />
        <span />
        <span />
        <span class="col-span" classList={{ t3: state() !== "tampered", "baseline-dependent": state() === "tampered" }}>
          <Switch>
            <Match when={state() === "intact"}>
              <Icon name="harness" size={10} class="t4" label={t("honesty.measured")} />
              <span title={t("goal.canaryIntactLong")}>{t("goal.canaryIntact")}</span>
            </Match>
            <Match when={state() === "not_checked"}>
              <span title={t("goal.canaryNotCheckedLong")}>
                {t("goal.canaryNotChecked")}
                <span class="t4"> · {t("goal.canaryNotCheckedWhy")}</span>
              </span>
            </Match>
            <Match when={state() === "tampered"}>
              <NeedsYouMark title={t("goal.canaryTamperedLong")} />
              <span class="attn-word" title={t("goal.canaryTamperedLong")}>
                {t("goal.canaryTampered")}
              </span>
            </Match>
          </Switch>
          <Show when={props.c.verified?.held_out}>
            <span class="sep">·</span>
            <HeldOutChip />
          </Show>
        </span>
      </div>
    </Show>
  );
}

/** A base that could not be checked because the sandbox refused the command something: the words before the colon, and the refused lines after it. */
export function refusedOnBase(error: string | null | undefined): { why: string; lines: string[] } | null {
  if (!error || !/refused/i.test(error)) return null;
  const i = error.indexOf(": ");
  const lines = (i < 0 ? "" : error.slice(i + 2))
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
  return { why: i < 0 ? error : error.slice(0, i), lines };
}

/**
 * The baseline line under a passed criterion: red → green only when the
 * command failed on the base AND still passes with the agent's edits to
 * existing tests undone, AND its canary was not tampered with (a pass that
 * is not evidence cannot be the green half of anything). A pass that depends
 * on edited tests is said in the attention register — it is the opposite of
 * evidence. A base the sandbox refused is an environment problem, said as
 * one, with the refused lines in view; never red.
 */
export function BaselineLine(props: { c: CriterionView; base?: string | null }) {
  const c = () => props.c;
  const passed = () => !!c().verified?.passed;
  const dependent = () => c().passes_with_source_only === false;
  const tampered = () => c().canary === "tampered";
  const redToGreen = () => c().passed_on_base === false && !dependent() && !tampered();
  // The base could not be checked at all: said quietly, in neither the fact nor the attention register.
  const uncheckable = () => c().passed_on_base === null && !!c().base_error;
  const refused = () => (uncheckable() ? refusedOnBase(c().base_error) : null);
  return (
    <Show when={(passed() && (c().passed_on_base === true || redToGreen() || dependent())) || uncheckable()}>
      <div class="criterion-row criterion-obs" classList={{ "env-line": !!refused() }}>
        <span />
        <span />
        <span />
        <span class="col-span" classList={{ t1: c().passed_on_base === true, t3: redToGreen() || (uncheckable() && !dependent() && !refused()), "baseline-dependent": dependent() }}>
          <Switch>
            <Match when={dependent()}>
              <NeedsYouMark title={t("goal.dependsOnEditedTestsLong")} />
              <span class="attn-word" title={t("goal.dependsOnEditedTestsLong")}>
                {t("goal.dependsOnEditedTests")}
              </span>
            </Match>
            <Match when={c().passed_on_base === true}>
              <NoticeMark />
              <span>{t("goal.passedOnBase")}</span>
            </Match>
            <Match when={redToGreen()}>
              <span class="num">{t("goal.redToGreen")}</span>
              <Show when={c().passes_with_source_only === true}>
                <span class="t4">· {t("goal.withOriginalTests")}</span>
              </Show>
            </Match>
            <Match when={refused()}>
              {(r) => (
                <>
                  <ResultMark kind="env" title={t("goal.baseRefused")} />
                  <span class="t2" title={c().base_error ?? undefined}>
                    {t("goal.baseRefused", { base: short(props.base) })}
                  </span>
                  <For each={r().lines}>{(line) => <code class="code-val t1 env-refused">{line}</code>}</For>
                </>
              )}
            </Match>
            <Match when={uncheckable()}>
              <span class="t4" title={c().base_error ?? undefined}>
                {t("goal.baseUncheckable", { base: short(props.base) })}
              </span>
            </Match>
          </Switch>
        </span>
      </div>
    </Show>
  );
}
