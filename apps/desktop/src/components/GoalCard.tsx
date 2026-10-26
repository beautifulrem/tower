/**
 * GoalCard (docs/04 §4.4.1, docs/12 §12.12): fixed five lines, so the board
 * never jumps. Line 1 identity, 2 live line, 3 progress, 4 facts, 5 notes.
 */
import { Show } from "solid-js";

import type { GoalSummary } from "../gen/GoalSummary";
import { ago, count, duration, usd, usdLimit } from "../lib/format";
import { go } from "../lib/nav";
import { state } from "../lib/store";
import { LifecycleGlyph, NeedsYouMark } from "./Glyph";
import { CriteriaBar } from "./Honesty";
import { LiveLine } from "./Live";

export function GoalCard(props: { goal: GoalSummary; selected?: boolean; onSelect?: () => void }) {
  const g = () => props.goal;
  const elapsed = () => (g().run_started_at ? duration(state.now - g().run_started_at!) : ago(g().updated_at, state.now));
  const overSoft = () => g().cost_usd >= g().budget.soft_usd;
  return (
    <article
      class="goal-card"
      classList={{ selected: !!props.selected, "needs-you": g().needs_you > 0 }}
      tabindex="0"
      onClick={() => go({ name: "goal", id: g().id })}
      onFocus={() => props.onSelect?.()}
      onKeyDown={(e) => e.key === "Enter" && go({ name: "goal", id: g().id })}
    >
      <div class="card-line card-title">
        <LifecycleGlyph goal={g()} />
        <span class="card-id num t3">{g().id}</span>
        <span class="ellipsis grow">{g().title}</span>
        <Show when={g().needs_you > 0}>
          <NeedsYouMark />
        </Show>
      </div>
      <div class="card-line">
        <LiveLine goal={g()} />
      </div>
      <div class="card-line">
        <CriteriaBar progress={g().progress} compact />
      </div>
      <div class="card-line meta num">
        <Show when={g().diffstat} fallback={<span class="t3">还没有改动</span>}>
          <span class="diff-add">+{count(g().diffstat!.additions)}</span>
          <span class="diff-del">−{count(g().diffstat!.deletions)}</span>
          <span class="sep">·</span>
          <span>{g().diffstat!.files} 文件</span>
        </Show>
        <span class="grow" />
        <span classList={{ t1: overSoft() }}>
          {usd(g().cost_usd)}/{usdLimit(g().budget.soft_usd)}
        </span>
        <span class="sep">·</span>
        <span>{elapsed()}</span>
      </div>
      <div class="card-line meta">
        <span class="t3 ellipsis">{g().project_name}</span>
        <Show when={g().rework_cycles > 0}>
          <span class="sep">·</span>
          <span>
            返工 {g().rework_cycles}/{g().max_rework}
          </span>
        </Show>
        <Show when={g().branch}>
          <span class="sep">·</span>
          <span class="mono ellipsis">{g().branch}</span>
        </Show>
      </div>
    </article>
  );
}
