/**
 * A pull request as GitHub reports it: state and check counts. Red appears
 * only for failing checks, named; the rest is grey. The link opens outside.
 */
import { openUrl } from "@tauri-apps/plugin-opener";
import { Show } from "solid-js";

import type { PrView } from "../gen/PrView";
import { t } from "../lib/i18n";
import { DangerMark, Icon } from "./Glyph";

export function PrLine(props: { pr: PrView; compact?: boolean }) {
  const s = () => props.pr.status;
  const stateWord = () =>
    ({ open: t("goal.prOpen"), merged: t("goal.prMerged"), closed: t("goal.prClosed") })[s().state] ?? s().state;
  return (
    <button class="pr-line link-quiet row text-btn halt" data-state={s().state} onClick={() => void openUrl(props.pr.url)} title={props.pr.url}>
      <span class="t1">PR</span>
      <span class="t2 pr-state">{stateWord()}</span>
      <Show when={s().passed + s().failed + s().pending > 0}>
        <span class="sep" />
        <span class="row num" style={{ gap: "6px" }}>
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
      <Show when={!props.compact && s().failing.length}>
        <span class="sep" />
        <span class="code-val t1 ellipsis">{s().failing.join("  ")}</span>
      </Show>
    </button>
  );
}
