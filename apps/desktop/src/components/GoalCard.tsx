/**
 * GoalCard (docs/04 §4.4.1): five fixed 20px rows, so the board never jumps
 * and numbers line up across cards.
 *   1 identity   2 live line   3 progress · spend   4 change · time   5 id, project, exceptions
 */
import { Show } from "solid-js";

import type { GoalSummary } from "../gen/GoalSummary";
import { ago, count, duration, usd, usdLimit } from "../lib/format";
import { t } from "../lib/i18n";
import { go } from "../lib/nav";
import { state } from "../lib/store";
import { LifecycleGlyph, NeedsYouMark } from "./Glyph";
import { CriteriaBar } from "./Honesty";
import { LiveLine } from "./Live";

export function GoalCard(props: { goal: GoalSummary; selected?: boolean; onSelect?: () => void }) {
  const g = () => props.goal;
  const elapsed = () =>
    g().run_started_at
      ? t("card.ranFor", { d: duration(state.now - g().run_started_at!, false) })
      : ago(g().updated_at, state.now);
  const overSoft = () => g().cost_usd >= g().budget.soft_usd;
  return (
    <article
      class="goal-card"
      classList={{ selected: !!props.selected }}
      tabindex="0"
      onClick={() => go({ name: "goal", id: g().id })}
      onFocus={() => props.onSelect?.()}
      onKeyDown={(e) => e.key === "Enter" && go({ name: "goal", id: g().id })}
    >
      <div class="card-row card-title">
        <LifecycleGlyph goal={g()} />
        <span class="ellipsis grow">{g().title}</span>
        <Show when={g().needs_you > 0}>
          <NeedsYouMark />
        </Show>
      </div>
      <div class="card-row">
        <LiveLine goal={g()} />
      </div>
      <div class="card-row card-split">
        <CriteriaBar progress={g().progress} compact />
        <span class="meta num" classList={{ t1: overSoft() }}>
          {usd(g().cost_usd)} / {usdLimit(g().budget.soft_usd)}
        </span>
      </div>
      <div class="card-row card-split meta">
        <Show when={g().diffstat?.files} fallback={<span class="t3">{t("card.noChanges")}</span>}>
          <span class="num">
            <span class="t1">+{count(g().diffstat!.additions)}</span>
            <span class="diff-del"> −{count(g().diffstat!.deletions)}</span>
            <span class="sep">·</span>
            {t("common.files", { n: g().diffstat!.files })}
          </span>
        </Show>
        <span class="num">{elapsed()}</span>
      </div>
      <div class="card-row meta card-foot">
        <span class="code-val t3">{g().id}</span>
        <span class="sep">·</span>
        <span class="t3 ellipsis">{g().project_name}</span>
        <Show when={g().rework_cycles > 0}>
          <span class="sep">·</span>
          <span class="t2">{t("card.rework", { n: g().rework_cycles, max: g().max_rework })}</span>
        </Show>
        <Show when={g().branch}>
          <span class="sep">·</span>
          <span class="code-val t2 ellipsis">{g().branch}</span>
        </Show>
      </div>
    </article>
  );
}
