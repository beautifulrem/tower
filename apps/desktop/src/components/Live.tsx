/**
 * Mode annunciator and live line (docs/12 §12.6.3–12.6.4): one line that
 * says the goal is alive and what kind of thing it is doing, always with a
 * steerable detail — never "working…".
 *
 * The line is a fixed grid — `[badge 4em][action · target][age]` — so on
 * the board every card's action starts at the same x, like a departures
 * board: one goal per row, one changing word per goal. When the word
 * changes it settles in 100ms, the flight board's flap in miniature.
 */
import { Show, createEffect, createSignal, on, onCleanup } from "solid-js";

import type { GoalSummary } from "../gen/GoalSummary";
import { ago, duration } from "../lib/format";
import { t } from "../lib/i18n";
import { caveats, notEvidence, wasAccepted } from "../lib/discounted";
import { isEngineTool, modeLabel, modeNeedsYou, moving, pauseLabel, silent, stateLabel, statusWord, toolLabel } from "../lib/labels";
import { refit } from "../lib/refit";
import { livenessOf, state } from "../lib/store";
import { NeedsYouMark, NoticeMark, Seal } from "./Glyph";

/** `mode`: the mode a board row holds while a call's words linger (`LiveLine`), so the row changes as one. */
export function ModeBadge(props: { goal: GoalSummary; mode?: GoalSummary["mode"] }) {
  const attention = () => modeNeedsYou(props.goal.mode) || (props.goal.needs_you > 0 && props.goal.state === "running");
  const isSilent = () => !attention() && silent(props.goal, state.now);
  const text = () => {
    const g = props.goal;
    if (g.state === "running") return attention() ? modeLabel("waiting_on_you") : isSilent() ? t("chrome.silent") : modeLabel(props.mode ?? g.mode);
    if (g.state === "verifying") return modeLabel("verifying");
    if (g.state === "paused") return stateLabel("paused");
    return statusWord(g);
  };
  let el!: HTMLSpanElement;
  createEffect(
    on(
      text,
      () => {
        el.classList.remove("swap");
        void el.offsetWidth;
        el.classList.add("swap");
      },
      { defer: true },
    ),
  );
  return (
    <span ref={el} class="mode-badge halt" classList={{ "mode-attention": attention(), "mode-silent": isSilent() }}>
      <Show when={attention()}>
        <NeedsYouMark />
      </Show>
      {text()}
    </span>
  );
}

/**
 * The detail after the badge: `action · target`, or the reason when not
 * running. `code` marks machine values (tool names, paths, commands,
 * branches) that are set in mono; words never are, in either language.
 */
export interface LiveDetail {
  action: string;
  target: string;
  code?: { action?: boolean; target?: boolean };
  /** The verified seal replaces the detail (in review, with a pin). */
  seal?: string;
  /**
   * How long the current run has been going ("running 1h 46m"), on the board: after the run's name, which holds still, and
   * never after a call, where it would read as the call's own time (review 20: it rode after each call's words and
   * jumped up to 148px as calls came and went). Always in the detail's tooltip.
   */
  elapsed?: string;
}

/** Looks like a path or command: printable ASCII without runs of spaces. */
const machine = (s: string) => /^[\x20-\x7e]+$/.test(s) && !/\s{2,}/.test(s);

export function liveDetail(g: GoalSummary, lingering = false, large = false): LiveDetail {
  if (g.state === "paused" && g.pause_reason) return { action: pauseLabel(g.pause_reason), target: "" };
  if (g.needs_you > 0 && (g.state === "running" || g.state === "accepted")) {
    const item = state.inbox.find((i) => i.goal_id === g.id && i.kind !== "review_ready");
    if (item) {
      const action = item.kind === "approval" ? t("live.approval") : item.kind === "ci_failed" ? t("inboxKind.ci_failed") : t("inboxKind.question");
      return { action, target: item.subject };
    }
  }
  // The run's elapsed time rides with the live detail, so the board's age column means one thing: last update.
  const ran = g.state === "running" && g.run_started_at ? t("live.runningFor", { d: duration(Math.max(0, state.now - g.run_started_at), false) }) : "";
  // The call in flight, or the last one once the run has gone quiet (what it went quiet after). A call that has ended
  // is not what the run is doing: the detail then says which run, and no shimmer runs over a finished command (review 19).
  // On the board a call that has just ended keeps its words a beat (`lingering`), so a run reading file after file
  // changes its detail once a call, not twice (review 20).
  if (g.live_line && g.state === "running" && (g.live_line.running !== false || lingering || silent(g, state.now))) {
    const tool = g.live_line.action;
    const label = toolLabel(tool);
    return {
      action: label,
      target: g.live_line.target,
      code: { action: isEngineTool(tool) || (label === tool && machine(tool)), target: machine(g.live_line.target) },
      elapsed: ran,
    };
  }
  switch (g.state) {
    case "running":
      // No tool in flight: the badge already says what kind of step it is, starting included (review 21, record only:
      // "Starting  Starting"); the detail says which run. On the goal page and the peek (`large`) the header names the
      // run, so the line says how long it has gone: said once (review 20, record only), and with no start time nothing,
      // never the run a second time (review 22, record only: "Run 2" in the header and again on the line). A first run is
      // getting started until its first call, unless it has gone quiet before one (review 20: silent for 22 hours,
      // "Silent  Getting started").
      return {
        action: g.mode === "starting" || g.run_no > 1 || g.live_line || silent(g, state.now) ? (large ? ran : t("live.runN", { n: g.run_no })) : t("live.getStarted"),
        target: "",
        elapsed: ran,
      };
    case "verifying":
      return { action: t("live.criteria"), target: t("live.passedOf", { v: g.progress.verified, m: g.progress.machine }) };
    case "claimed":
      return { action: t("live.claimedDone"), target: t("live.awaitingVerify") };
    case "in_review":
      return g.progress.machine === 0 || !g.verified_pin
        ? { action: t("honesty.notMachineVerified"), target: t("live.yourCall") }
        : { action: "", target: "", seal: g.verified_pin };
    case "accepted":
      return { action: t("live.branch"), target: g.branch ?? "", code: { target: true } };
    case "integrated":
      return { action: t("live.merged"), target: g.branch ?? "", code: { target: true } };
    case "ready":
      return { action: t("live.queued"), target: t("live.waitingSlot") };
    case "draft":
      return { action: t("state.draft"), target: t("live.unratified") };
    default:
      return { action: stateLabel(g.state), target: "" };
  }
}

/**
 * A narrow cell gives way by measure, never cut. The run's elapsed time is whole or set aside: cut, "running 21h 3…" read
 * as another number (review 20, record only); it stays in the tooltip. A seal gives its word first (the badge beside it
 * says the verdict), then the whole seal, as green never stands without the pin it was measured on. What is set aside
 * stays for a screen reader.
 */
const fitDetail = (detail: HTMLElement) =>
  refit(detail, () => {
    const time = detail.querySelectorAll(".live-elapsed, .live-elapsed-sep");
    time.forEach((el) => el.classList.remove("sr-only"));
    if (detail.scrollWidth > detail.clientWidth + 0.5) time.forEach((el) => el.classList.add("sr-only"));
    const seal = detail.querySelector<HTMLElement>(".seal");
    if (!seal) return;
    const word = seal.querySelector<HTMLElement>(".seal-word");
    for (const step of [0, 1, 2]) {
      word?.classList.toggle("sr-only", step > 0);
      seal.classList.toggle("sr-only", step > 1);
      if (detail.scrollWidth <= detail.clientWidth + 0.5) break;
    }
  });

/** How long a board row keeps the words of a call that has just ended, unless another starts first. */
const LINGER = 1000;

export function LiveLine(props: { goal: GoalSummary; large?: boolean; hideTarget?: boolean }) {
  const [lingering, setLingering] = createSignal(false);
  let timer: ReturnType<typeof setTimeout> | undefined;
  // While a call's words linger the badge keeps the call's mode, so the row changes as one (review 21, record only:
  // "Thinking  read src/checkout/tota…" for a second); never "needs you" for a question already answered.
  const held = () => (lingering() && props.goal.live_line?.mode !== "waiting_on_you" ? props.goal.live_line?.mode : undefined);
  createEffect(
    on(
      () => props.goal.live_line?.running,
      (running, was) => {
        clearTimeout(timer);
        setLingering(!props.large && !!was && !running);
        timer = setTimeout(setLingering, LINGER, false);
      },
    ),
  );
  onCleanup(() => clearTimeout(timer));
  const d = () => liveDetail(props.goal, lingering(), props.large);
  // The agent at work and moving (labels `moving`, as its mark turns): on the goal in view (the goal page, the peek) its
  // words shimmer (app.css `.live-moving`); a board row keeps still words beside its turning mark, so a board of
  // running goals stays quiet.
  const shimmer = () => props.goal.state === "running" && moving(props.goal, state.now);
  return (
    <div class="live-line halt" classList={{ "live-line-large": !!props.large, "live-moving": !!props.large && shimmer() && !!d().action }}>
      <ModeBadge goal={props.goal} mode={held()} />
      {/* The tooltip carries the whole line, for the narrow window where only the verb stays on screen; the run's time on
          a line of its own, with the run's name, never after a command as if it were the command's (review 21), and apart
          from it, as a sentence (review 22, record only: "Run 2 elapsed 21h 33m"). */}
      <span class="live-detail ellipsis" title={[d().target, !props.large && d().elapsed && (d().code ? t("live.runFor", { n: props.goal.run_no, d: d().elapsed! }) : d().elapsed)].filter(Boolean).join("\n") || undefined} ref={fitDetail}>
        <Show
          when={d().seal}
          fallback={
            <>
              <span class="live-action" classList={{ "code-val": !!d().code?.action }}>
                {d().action}
              </span>
              <Show when={d().target && !props.hideTarget}>
                <span class="sep live-target-sep" />
                <span class="live-target" classList={{ "code-val": !!d().code?.target }}>
                  {d().target}
                </span>
              </Show>
              <Show when={d().elapsed && !props.large && !d().code}>
                <span class="sep live-elapsed-sep" />
                <span class="live-elapsed num t3">{d().elapsed}</span>
              </Show>
            </>
          }
        >
          {/* The badge already says the verdict; a pass that is not evidence, or one with caveats, keeps only its mark and pin. */}
          <Seal pin={d().seal} compact tampered={notEvidence(props.goal)} qualified={caveats(props.goal)} accepted={wasAccepted(props.goal)} text={notEvidence(props.goal) || caveats(props.goal).length ? "" : undefined} />
        </Show>
      </span>
      {/* The right slot is the time of the last movement; when the engine has gone silent that is exactly the reading you need, so it stays and says so,
          lifted to text-1 beside the hint mark: worth a look, not a failure (docs/08 §8.6.3). */}
      <Show when={props.large && props.goal.state === "running"}>
        <Show
          when={!silent(props.goal, state.now)}
          fallback={<span class="live-age live-age-silent meta num"><NoticeMark />{t("live.lastMove", { d: ago(livenessOf(props.goal).at, state.now) })}</span>}
        >
          {/* A call at work: since it started. Ended, the line names the run, and the time is its last movement, not when the
              finished call began (review 20, record only). */}
          <Show when={props.goal.live_line}>
            {(l) => <span class="live-age meta num">{ago(l().running === false ? livenessOf(props.goal).at : l().at, state.now)}</span>}
          </Show>
        </Show>
      </Show>
    </div>
  );
}
