/**
 * The part of the honesty grammar (docs/12 §12.5) the first paint draws: the
 * claim register and the two-track criteria bar, which the desk's cards and
 * rows carry. The rest — the notes under a criterion, the consistency badge,
 * your stamp — is in `Honesty.tsx`, which only on-demand views load (and
 * which re-exports these, so either import works there).
 */
import { type JSX, Show } from "solid-js";

import type { CriterionView } from "../gen/CriterionView";
import type { Progress } from "../gen/Progress";
import { t } from "../lib/i18n";

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
