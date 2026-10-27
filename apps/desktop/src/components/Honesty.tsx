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
import { clock, short } from "../lib/format";
import { locale, t } from "../lib/i18n";
import { Icon, NeedsYouMark, NoticeMark, ResultMark } from "./Glyph";

// What the first paint draws lives in HonestyCore (the desk loads it at start-up); re-exported so views take the grammar from one place.
export { Claim, CriteriaBar, discountedOf } from "./HonestyCore";

/** The first line of why a base could not be checked, without its trailing colon or backticks, at most 120 characters. */
export function baseReason(error: string | null | undefined): string | null {
  const first = (error ?? "").split("\n").find((l) => l.trim())?.trim();
  if (!first) return null;
  const plain = first.replace(/`([^`]+)`/g, "$1").replace(/[:：]\s*$/, "");
  return plain.length > 120 ? `${plain.slice(0, 119)}…` : plain;
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

/** Your decisions: solid left rule, primary text. */
export function HumanStamp(props: { at: number; children?: JSX.Element }) {
  return (
    <span class="human-stamp">
      {t("common.you")}
      <span class="sep" />
      <span class="num">{clock(props.at)}</span>
      {props.children}
    </span>
  );
}

/** Cross-check badge for a claim. Consistency is never green: agreeing is not proof. */
export function ConsistencyBadge(props: { value: Consistency; evidence?: string | null }) {
  const text = () => t(`honesty.${props.value}`);
  return (
    <span class={`consistency consistency-${props.value}`} title={props.evidence ?? undefined}>
      {/* Only a refutation wears the failure's red ×. A claim the agent's own words keep a pass from confirming is not
          refuted, it is not evidence: the ◆ a tampered pass wears, read as firmly. */}
      <Show when={props.value === "contradicted"}>
        <ResultMark kind="fail" />
      </Show>
      <Show when={props.value === "cannot_confirm"}>
        <NeedsYouMark title={t("honesty.notEvidence")} />
      </Show>
      <Show when={props.value === "stale"}>
        <ResultMark kind="stale" />
      </Show>
      {text()}
    </span>
  );
}

/**
 * A result produced with the held-out tests present: its output went to you
 * and never to the agent. Said in your register — the solid rule of a human
 * stamp, not the verifier's green nor the claim's dashes — quietly, under the
 * row, with the long form one hover away.
 */
export function HeldOutChip(props: { ran?: number; total?: number }) {
  // Only some of the held-out files proved they ran: the label says how many.
  const some = () => props.ran != null && props.total != null && props.ran < props.total;
  return (
    <span class="chip chip-you" title={some() ? t("goal.heldOutSomeLong", { m: props.ran! }) : t("goal.heldOutLong")}>
      {some() ? t("goal.heldOutSome", { m: props.ran!, n: props.total! }) : t("goal.heldOut")}
    </span>
  );
}

/**
 * Held-out files, one by one, as code — names only you see — read as the end of a sentence: the separator ("," in
 * English, "、" in Chinese) sits against the name before it, inside the same run of text.
 */
function HeldOutFiles(props: { files: string[] }) {
  const sep = () => (locale() === "zh-CN" ? "、" : ", ");
  return (
    <For each={props.files}>
      {(f, i) => (
        <>
          {i() > 0 ? sep() : " "}
          <code class="code-val held-out-file">{f}</code>
        </>
      )}
    </For>
  );
}

/**
 * Your held-out mark, on lines of its own. Each note under a criterion is
 * one line in one register, starting under the criterion's title — the
 * canary's fact, your held-out mark, the base's reading — as a sentinel's
 * detail is one register per line. The mark follows the proof: the chip
 * only when at least one held-out file proved it ran ("m of n" when not
 * all did), then the files that did not run and those Tower cannot prove,
 * by name. None ran: no chip, only that line — never both.
 */
export function HeldOutLine(props: { c: CriterionView }) {
  const v = () => props.c.verified;
  const proof = () => v()?.held_out_proof ?? null;
  const total = () => {
    const p = proof();
    return p ? p.ran.length + p.not_ran.length + p.unprovable.length : undefined;
  };
  const note = (cls: string, title: string, words: string, files: string[]) => (
    <div class={`criterion-row criterion-obs ${cls}`}>
      <span />
      <span />
      <span class="col-span t3" title={title}>
        <span class="held-out-text">
          {words}
          <HeldOutFiles files={files} />
        </span>
      </span>
    </div>
  );
  return (
    <>
      <Show when={v()?.held_out}>
        <div class="criterion-row criterion-obs">
          <span />
          <span />
          <span class="col-span">
            <HeldOutChip ran={proof()?.ran.length} total={total()} />
          </span>
        </div>
      </Show>
      <Show when={proof()?.not_ran.length}>
        {note("held-out-missing", t("goal.heldOutNotRunLong"), v()?.held_out ? t("goal.heldOutNotRun") : t("goal.heldOutNoneRan"), proof()!.not_ran)}
      </Show>
      <Show when={proof()?.unprovable.length}>
        {note("held-out-unproven", t("goal.heldOutUnprovenLong"), t("goal.heldOutUnproven"), proof()!.unprovable)}
      </Show>
    </>
  );
}

/**
 * Loopback opened for this criterion's runs: your own tests needed it on
 * the base, or the project's setting says so. A decision, said quietly,
 * with what it means one hover away.
 */
export function LoopbackLine(props: { c: CriterionView }) {
  return (
    <Show when={props.c.loopback_opened}>
      {(why) => (
        <div class="criterion-row criterion-obs loopback-line">
          <span />
          <span />
          <span class="col-span t4" title={t("goal.loopbackOpenedLong")}>
            {why() === "base" ? t("goal.loopbackOpenedBase") : t("goal.loopbackOpenedProject")}
          </span>
        </div>
      )}
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
 * with the held-out tests present says so on its own line (HeldOutLine).
 */
export function CanaryLine(props: { c: CriterionView }) {
  const state = () => props.c.canary;
  return (
    <Show when={state()}>
      <div class="criterion-row criterion-obs canary-line" data-canary={state()!}>
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
                <span class="t4">{t("goal.canaryNotCheckedWhy")}</span>
              </span>
            </Match>
            <Match when={state() === "tampered"}>
              <NeedsYouMark title={t("goal.canaryTamperedLong")} />
              <span class="attn-word" title={t("goal.canaryTamperedLong")}>
                {t("goal.canaryTampered")}
              </span>
            </Match>
          </Switch>
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
                <span class="t4">{t("goal.withOriginalTests")}</span>
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
              {/* Why, in the line itself: the supervisor's first sentence, not only a tooltip. */}
              <Show when={baseReason(c().base_error)}>{(why) => <span class="t3 base-why">{why()}</span>}</Show>
            </Match>
          </Switch>
        </span>
      </div>
    </Show>
  );
}
