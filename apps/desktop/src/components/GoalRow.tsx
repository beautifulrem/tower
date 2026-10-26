/**
 * GoalRow: one goal as one 36px instrument line on the board. Every reading
 * lands in the same column across rows — glyph, title, live line, criteria,
 * change, spend, age, identity — so twelve goals read like a departures
 * board, and one goal reads the same way, just shorter.
 */
import { Show } from "solid-js";

import type { GoalSummary } from "../gen/GoalSummary";
import { agoShort, count, usd, usdLimit } from "../lib/format";
import { t } from "../lib/i18n";
import { effectiveEngine, engineLabel, engineMark, stateLabel } from "../lib/labels";
import { go } from "../lib/nav";
import { state } from "../lib/store";
import { Icon, LifecycleGlyph, NeedsYouMark, NoticeMark } from "./Glyph";
import { CriteriaBar } from "./Honesty";
import { LiveLine } from "./Live";
import { PrLine } from "./Pr";
import { Button } from "./ui";

export function GoalRow(props: { goal: GoalSummary; selected?: boolean; onSelect?: () => void }) {
  const g = () => props.goal;
  const open = () => go({ name: "goal", id: g().id });
  // One column, one quantity: when the goal last changed, in the heartbeat's own units. The run's elapsed time lives in the live line.
  const age = () => agoShort(g().updated_at, state.now);
  const overSoft = () => g().cost_usd >= g().budget.soft_usd;
  const engine = () => g().engine;
  // The engine is said only when it is not the default one — and then as a two-letter mark; the name is in the tooltip.
  const otherEngine = () => !!engine() && effectiveEngine(engine(), state.settings?.engine) !== effectiveEngine("", state.settings?.engine);
  // Arrived in the last few seconds: one short settle, so the eye finds it.
  const fresh = Date.now() - props.goal.created_at < 5000;
  // Identity with more than id · project · engine in it: the engine mark leaves first in a narrower window (whole, never clipped).
  const crowded = () => otherEngine() && (g().rework_cycles > 0 || !!g().overlaps?.length || !!g().pr || !!state.settings?.muted_goals.includes(g().id));
  return (
    <div class="g-row" classList={{ selected: !!props.selected }} data-goal={g().id} data-new={fresh ? "true" : undefined} data-crowded={crowded() ? "true" : undefined} onClick={open}>
      <span class="g-glyph">
        <LifecycleGlyph goal={g()} />
      </span>
      <button
        class="g-title"
        title={otherEngine() ? `${g().title} · ${engineLabel(engine()!)}` : g().title}
        aria-label={`${g().title}, ${stateLabel(g().state)}${g().needs_you > 0 ? `, ${t("common.needsYou")}` : ""}${otherEngine() ? `, ${engineLabel(engine()!)}` : ""}`}
        onFocus={() => props.onSelect?.()}
        onClick={(e) => {
          e.stopPropagation();
          open();
        }}
      >
        <span class="ellipsis">{g().title}</span>
        <Show when={g().needs_you > 0}>
          <NeedsYouMark />
        </Show>
      </button>
      <div class="g-live">
        {/* In a narrow window the identity column folds away; the engine mark moves in front of the live line so you still know who is running. */}
        <Show when={otherEngine()}>
          <span class="g-engine-narrow code-val t3" title={engineLabel(engine()!)} aria-hidden="true">
            {engineMark(engine()!)}
          </span>
        </Show>
        <LiveLine goal={g()} />
      </div>
      <div class="g-crit">
        <CriteriaBar progress={g().progress} tiny />
      </div>
      {/* No change yet is not a reading: the column stays empty rather than drawing a dash. */}
      <span class="g-diff num meta halt">
        <Show when={g().diffstat?.files}>
          <span class="t1">+{count(g().diffstat!.additions)}</span>
          <span class="diff-del"> −{count(g().diffstat!.deletions)}</span>
        </Show>
      </span>
      <span class="g-spend num meta halt" classList={{ t1: overSoft() }} title={t("goal.budgetTitle")}>
        {usd(g().cost_usd)} <span class="t4">/</span> {usdLimit(g().budget.soft_usd)}
      </span>
      <span class="g-age num meta halt">{age()}</span>
      {/* Identity: id · project first, then the optional readings; the project may shorten but never below 3.5em, and the engine mark gives way first. */}
      <span class="g-id meta halt">
        <span class="code-val t2">{g().id}</span>
        <span class="sep">·</span>
        <span class="t3 ellipsis g-project" title={g().project_name}>
          {g().project_name}
        </span>
        <Show when={g().rework_cycles > 0}>
          <span class="sep">·</span>
          <span class="t3 num row" style={{ gap: "3px" }} title={t("card.rework", { n: g().rework_cycles, max: g().max_rework })}>
            <Icon name="rework" size={10} label={t("card.rework", { n: g().rework_cycles, max: g().max_rework })} />
            {g().rework_cycles}/{g().max_rework}
          </span>
        </Show>
        <Show when={state.settings?.muted_goals.includes(g().id)}>
          <span class="sep">·</span>
          <span class="t3">{t("quiet.muted")}</span>
        </Show>
        <Show when={otherEngine()}>
          <span class="sep g-engine-sep">·</span>
          <span class="t3 code-val g-engine" title={engineLabel(engine()!)}>
            {engineMark(engine()!)}
          </span>
        </Show>
        <Show when={g().overlaps?.length}>
          <span class="sep">·</span>
          <span class="t3 row" style={{ gap: "3px" }} title={g().overlaps.map((o) => `${t("goal.overlaps", { id: o.goal_id })} · ${o.files.join(", ")}`).join("\n")}>
            <NoticeMark title={t("goal.overlaps", { id: g().overlaps[0].goal_id })} />
            <span class="code-val">{g().overlaps[0].goal_id}</span>
            <Show when={g().overlaps.length > 1}>+{g().overlaps.length - 1}</Show>
          </span>
        </Show>
        <Show when={g().pr}>
          {(pr) => (
            <>
              <span class="sep">·</span>
              <span onClick={(e) => e.stopPropagation()}>
                <PrLine pr={pr()} compact />
              </span>
            </>
          )}
        </Show>
      </span>
      <span class="g-act" onClick={(e) => e.stopPropagation()}>
        <Show when={g().state === "in_review"}>
          <Button size="s" variant="ghost" kbd={props.selected ? "r" : undefined} onClick={() => go({ name: "review", id: g().id })} tabindex={-1}>
            {t("goal.review")}
          </Button>
        </Show>
      </span>
    </div>
  );
}
