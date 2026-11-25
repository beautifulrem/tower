/**
 * A pull request as GitHub reports it: state and check counts. Red appears
 * only for failing checks, named; the rest is grey. The link opens outside.
 */
import { openUrl } from "@tauri-apps/plugin-opener";
import { Show } from "solid-js";

import type { PrView } from "../gen/PrView";
import { t } from "../lib/i18n";
import { DangerMark, Icon } from "./Glyph";

const stateWordOf = (state: string) => ({ open: t("goal.prOpen"), merged: t("goal.prMerged"), closed: t("goal.prClosed") })[state] ?? state;

/**
 * The PR in words, every reading: its state and its checks. A board row may set some of them aside for room; this keeps
 * them in the row's tooltip and in the button's name. The name is the button's own text, not a label laid over it, so
 * it holds what the button shows ("PR" first): the visible readings are glyphs and bare counts, said here in words.
 */
export function prSummary(pr: PrView): string {
  const s = pr.status;
  const checks = [
    s.passed > 0 ? t("goal.prPassedN", { n: s.passed }) : "",
    s.failed > 0 ? t("goal.prFailingN", { n: s.failed }) : "",
    s.pending > 0 ? t("goal.prPendingN", { n: s.pending }) : "",
  ].filter(Boolean);
  return checks.length ? t("goal.prSummary", { state: stateWordOf(s.state), checks: checks.join(t("goal.prChecksSep")) }) : `PR ${stateWordOf(s.state)}`;
}

export function PrLine(props: { pr: PrView; compact?: boolean }) {
  const s = () => props.pr.status;
  return (
    <button
      class="pr-line link-quiet row text-btn halt"
      data-state={s().state}
      data-failing={s().failed > 0 ? "true" : undefined}
      onClick={() => void openUrl(props.pr.url)}
      title={`${prSummary(props.pr)}\n${props.pr.url}`}
    >
      <span class="t1" aria-hidden="true">
        PR
      </span>
      <span class="t2 pr-state" aria-hidden="true">
        {stateWordOf(s().state)}
      </span>
      <Show when={s().passed + s().failed + s().pending > 0}>
        <span class="sep" />
        <span class="row num pr-counts" style={{ gap: "6px" }} aria-hidden="true">
          <Show when={s().passed > 0}>
            {/* GitHub's count, not the verifier's: a neutral check, never the green that only Tower's verifier may wear. */}
            <span class="row t2 pr-passed" style={{ gap: "3px" }}>
              <Icon name="check" size={10} /> {s().passed}
            </span>
          </Show>
          <Show when={s().failed > 0}>
            <span class="row t1" style={{ gap: "3px" }}>
              <DangerMark /> {s().failed}
            </span>
          </Show>
          <Show when={s().pending > 0}>
            <span class="row t3 pr-pending" style={{ gap: "3px" }}>
              <Icon name="dot" size={10} /> {s().pending}
            </span>
          </Show>
        </span>
      </Show>
      <span class="sr-only">{prSummary(props.pr)}</span>
      <Show when={!props.compact && s().failing.length}>
        <span class="sep" />
        <span class="code-val t1 ellipsis">{s().failing.join("  ")}</span>
      </Show>
    </button>
  );
}
