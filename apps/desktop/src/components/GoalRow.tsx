/**
 * GoalRow: one goal as one 36px instrument line on the board. Every reading
 * lands in the same column across rows — glyph, title, live line, criteria,
 * change, spend, age, identity — so twelve goals read like a departures
 * board, and one goal reads the same way, just shorter. The last reading,
 * the id, ends on the board's right edge, where its hairlines end.
 */
import { createSignal, onCleanup, Show } from "solid-js";

import type { GoalSummary } from "../gen/GoalSummary";
import type { GoalSummaryExt } from "../lib/apiTypes";
import { ago, count, usd, usdLimit } from "../lib/format";
import { t } from "../lib/i18n";
import { effectiveEngine, engineLabel, statusWord } from "../lib/labels";
import { go } from "../lib/nav";
import { refit } from "../lib/refit";
import { state } from "../lib/store";
import { Icon, LifecycleGlyph, NoticeMark } from "./Glyph";
import { CriteriaBar } from "./HonestyCore";
import { LiveLine } from "./Live";
import { PrLine, prSummary } from "./Pr";
import { Button } from "./ui";

export function GoalRow(props: { goal: GoalSummary; selected?: boolean; onSelect?: () => void; onPeek?: () => void }) {
  const g = () => props.goal as GoalSummaryExt;
  const open = () => go({ name: "goal", id: g().id });
  // One column, one quantity: when the goal last changed, in the heartbeat's own units. The run's elapsed time lives in the live line.
  const age = () => ago(g().updated_at, state.now);
  const overSoft = () => g().cost_usd >= g().budget.soft_usd;
  const spendPct = () => (g().budget.hard_usd > 0 ? Math.min(100, (g().cost_usd / g().budget.hard_usd) * 100) : 0);
  const softPct = () => (g().budget.hard_usd > 0 ? Math.min(100, (g().budget.soft_usd / g().budget.hard_usd) * 100) : 60);
  const engine = () => g().engine;
  // The engine is said only when it is not the default one — by its name, in words, like the project beside it.
  const otherEngine = () => !!engine() && effectiveEngine(engine(), state.settings?.engine) !== effectiveEngine("", state.settings?.engine);
  // With one project every goal is in it: the board does not repeat its name on every line.
  const showProject = () => state.projects.length > 1;
  // Arrived in the last few seconds: one short settle, so the eye finds it.
  const fresh = Date.now() - props.goal.created_at < 5000;
  // The identity gives way by measure, a step at a time, and is never cut: the engine's name leaves first, while the
  // readings would not fit beside it or it would shorten the project's name; then the PR keeps only what it needs you for
  // (a failing check; its state once merged or closed); then the word that you muted the goal (your own setting, not
  // news); then the project's name, which may shorten to 3.5em first (only now: before, every reading is whole); then
  // the PR keeps one reading, an open PR its failing count and a merged or closed one its state (its checks no longer
  // ask anything of you); and if even that does not fit, the whole identity folds, as below 1241. What leaves is set aside for the eye only: a screen reader still reads it,
  // and the title's tooltip says all of it.
  const STEPS = ["", "engine", "readings", "quiet", "project", "pr-state", "folded"] as const;
  const [crowd, setCrowd] = createSignal<(typeof STEPS)[number]>("");
  const fitId = (box: HTMLElement) =>
    refit(box, () => {
      const fits = (step: (typeof STEPS)[number]) => {
        if (box.scrollWidth > box.clientWidth + 0.5) return false;
        const p = box.querySelector<HTMLElement>(".g-project");
        // Set aside by a step, the name asks for no room. Shown is decided by the step, never by the name's size: flex may
        // squeeze a shown name to nothing, and that is a name cut, not one set aside.
        if (!p || STEPS.indexOf(step) >= STEPS.indexOf("project") || p.scrollWidth <= p.clientWidth + 0.5) return true;
        // A shortened project name: only once "muted" is set aside (so never beside the engine's name either), and never
        // under its own width or 3.5em, whichever is less (a name shorter than 3.5em is whole or set aside).
        const em = parseFloat(getComputedStyle(p).fontSize) || 12;
        return STEPS.indexOf(step) >= STEPS.indexOf("quiet") && p.clientWidth >= Math.min(p.scrollWidth, 3.5 * em) - 0.5;
      };
      for (const step of STEPS) {
        setCrowd(step);
        if (step === "folded" || fits(step)) break;
      }
    });
  // Another goal changing the same files, in words: "Overlaps G-0003" beside this row's own id, never a bare id that reads as it.
  // The words around the id are their own spans, so a short row can keep "ⓘ G-0003" and set the words aside.
  const say = (part: string) => (part ? <span class="g-overlap-say">{part}</span> : null);
  const overlapsWith = (id: string) => t("goal.overlaps", { id: "\u0001" }).split("\u0001").flatMap((part, i) => (i ? [<span class="code-val">{id}</span>, say(part)] : [say(part)]));
  const overlapTitle = () => (g().overlaps ?? []).map((o) => `${t("goal.overlaps", { id: o.goal_id })}: ${o.files.join(", ")}`).join("\n");
  const muted = () => !!state.settings?.muted_goals.includes(g().id);
  // The title's tooltip says the row's whole identity, whatever the row has room to show.
  const titleTip = () =>
    [
      g().title,
      g().pr ? prSummary(g().pr!) : "",
      g().rework_cycles > 0 ? t("card.rework", { n: g().rework_cycles, max: g().max_rework }) : "",
      muted() ? t("quiet.muted") : "",
      otherEngine() ? engineLabel(engine()!) : "",
      showProject() ? g().project_name : "",
      overlapTitle(),
    ]
      .filter(Boolean)
      .join("\n");
  // The note gives way before the title does, a step at a time: "ⓘ Overlaps G-0003", then "ⓘ G-0003", then the ⓘ alone,
  // while the title would show less than it needs (all of a short one, 12em of a longer one). Whatever is set aside stays
  // in the tooltip and for a screen reader.
  const fitOverlap = (note: HTMLElement) => {
    const fit = () => {
      const cell = note.parentElement;
      const title = cell?.querySelector<HTMLElement>(".g-title .ellipsis");
      const words = note.querySelector<HTMLElement>(".g-overlap-words");
      if (!cell || !title || !words) return;
      const said = [...words.querySelectorAll<HTMLElement>(".g-overlap-say")];
      const need = Math.min(title.scrollWidth, 12 * (parseFloat(getComputedStyle(title).fontSize) || 13));
      // Decided on the row at rest: the peek button comes with the pointer and the selection and may take the title's room
      // while it shows, so that room is counted back, and moving over the rows never changes the note.
      const peek = cell.querySelector<HTMLElement>(".g-peek-btn");
      const peekRoom = peek && peek.offsetWidth ? peek.offsetWidth + (parseFloat(getComputedStyle(cell).columnGap) || 0) : 0;
      const atRest = () => (title.clientWidth < title.scrollWidth - 0.5 ? Math.min(title.scrollWidth, title.clientWidth + peekRoom) : title.clientWidth);
      for (const step of [0, 1, 2]) {
        for (const s of said) s.classList.toggle("sr-only", step === 1);
        words.classList.toggle("sr-only", step === 2);
        if (atRest() >= need - 0.5) break;
      }
    };
    // The cell for the window's width, the title for its own (a rename, a font), the cell's text for the language. Set up
    // once the note is in its cell.
    const ro = new ResizeObserver(fit);
    const mo = new MutationObserver(fit);
    queueMicrotask(() => {
      const cell = note.parentElement;
      if (!cell) return;
      ro.observe(cell);
      const title = cell.querySelector(".g-title .ellipsis");
      if (title) ro.observe(title);
      mo.observe(cell, { subtree: true, characterData: true, childList: true });
    });
    void document.fonts?.ready.then(fit);
    onCleanup(() => (ro.disconnect(), mo.disconnect()));
  };
  return (
    <div
      class="g-row"
      classList={{ selected: !!props.selected, "has-act": g().state === "in_review" }}
      data-goal={g().id}
      data-new={fresh ? "true" : undefined}
      data-crowded={crowd() || undefined}
      onClick={open}
    >
      <span class="g-glyph">
        <LifecycleGlyph goal={g()} turn />
      </span>
      <div class="g-title-cell">
        {/* A row never says it needs you, in words or by a ! mark: what needs you is a decision line in the queue above, and the
            title bar counts those. A goal waiting in To review is filed there, not counted, and not said to need you. */}
        <button
          class="g-title"
          title={titleTip()}
          aria-label={`${g().title}, ${statusWord(g())}${otherEngine() ? `, ${engineLabel(engine()!)}` : ""}`}
          onFocus={() => props.onSelect?.()}
          onKeyDown={(e) => {
            if (e.key === " " && props.onPeek) {
              e.preventDefault();
              e.stopPropagation();
              props.onPeek();
            }
          }}
          onClick={(e) => {
            e.stopPropagation();
            open();
          }}
        >
          <span class="ellipsis">{g().title}</span>
        </button>
        {/* The id stays beside its title at every width, as in the review's header: on a wide board, flush right, it
            ended a screen's width away from the words it names. */}
        <span class="code-val t2 g-goal-id">{g().id}</span>
        {/* An overlap is said with the row it belongs to, after its id: in the identity column a bare "ⓘ G-0003" read as
            this row's own id. Short of the title's room it keeps its ⓘ alone; below 1241 it leaves with the identity
            column. Its words live on in the tooltips either way. */}
        <Show when={g().overlaps?.length}>
          <span class="g-overlap" title={overlapTitle()} ref={fitOverlap}>
            <span class="g-overlap-mark" aria-hidden="true">
              <NoticeMark />
            </span>
            <span class="g-overlap-words">
              <span>{overlapsWith(g().overlaps[0].goal_id)}</span>
              <Show when={g().overlaps.length > 1}>
                <span class="num">+{g().overlaps.length - 1}</span>
              </Show>
            </span>
          </span>
        </Show>
        <Show when={props.onPeek}>
          <button
            type="button"
            class="g-peek-btn"
            tabindex={-1}
            aria-label={t("keys.peekSelected")}
            title={t("keys.peekSelected")}
            onClick={(e) => {
              e.stopPropagation();
              props.onPeek?.();
            }}
          >
            <Icon name="peek" size={10} />
          </button>
        </Show>
      </div>
      <div class="g-live">
        <LiveLine goal={g()} />
      </div>
      <div class="g-crit">
        <CriteriaBar progress={g().progress} id={g().id} tiny />
      </div>
      {/* No change yet is not a reading: the column stays empty rather than drawing a dash. */}
      <span class="g-diff num meta halt">
        <Show when={g().diffstat?.files}>
          <span class="t1">+{count(g().diffstat!.additions)}</span>
          <span class="diff-del"> −{count(g().diffstat!.deletions)}</span>
        </Show>
      </span>
      <span class="g-spend g-spend-cell num meta halt" classList={{ t1: overSoft() }} title={t("goal.budgetTitle")}>
        <span class="g-spend-text">
          {usd(g().cost_usd)} <span class="t4">/</span> {usdLimit(g().budget.soft_usd)}
        </span>
        <span class="meter-micro" aria-hidden="true">
          <i class="meter-micro-fill" classList={{ over: overSoft() }} style={{ width: `${spendPct()}%` }} />
          <i class="meter-micro-tick" style={{ left: `${softPct()}%` }} />
        </span>
      </span>
      <span class="g-age num meta halt">{age()}</span>
      {/* Identity, set flush right: the optional readings, then the engine and the project by name. Grouped by space and
          weight, never by a dot. */}
      <span class="g-id meta halt" ref={fitId}>
        <Show when={g().pr}>
          {(pr) => (
            <span onClick={(e) => e.stopPropagation()}>
              <PrLine pr={pr()} compact aside={crowd() === "folded"} />
            </span>
          )}
        </Show>
        <Show when={muted()}>
          <span class="t3 g-muted">{t("quiet.muted")}</span>
        </Show>
        <Show when={g().rework_cycles > 0}>
          <span class="t3 num row" style={{ gap: "3px" }} title={t("card.rework", { n: g().rework_cycles, max: g().max_rework })}>
            {/* Said once: the mark's name says it in words, so the bare count it stands beside is for the eye. */}
            <Icon name="rework" size={10} label={t("card.rework", { n: g().rework_cycles, max: g().max_rework })} />
            <span aria-hidden="true">
              {g().rework_cycles}/{g().max_rework}
            </span>
          </span>
        </Show>
        <Show when={otherEngine()}>
          <span class="t3 g-engine">{engineLabel(engine()!)}</span>
        </Show>
        <Show when={showProject()}>
          <span class="t3 ellipsis g-project" title={g().project_name}>
            {g().project_name}
          </span>
        </Show>
      </span>
      {/* Ready to accept: the row's one action stands over the identity on the row you point at or are on (r from the
          keyboard), so the board keeps no empty action column on every other line. */}
      <Show when={g().state === "in_review"}>
        <span class="g-act" onClick={(e) => e.stopPropagation()}>
          <Button size="s" variant="ghost" kbd={props.selected ? "r" : undefined} onClick={() => go({ name: "review", id: g().id })} tabindex={-1}>
            {t("goal.review")}
          </Button>
        </span>
      </Show>
    </div>
  );
}
