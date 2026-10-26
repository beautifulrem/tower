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
import { Show, createEffect, on } from "solid-js";

import type { GoalSummary } from "../gen/GoalSummary";
import { ago, agoShort, duration } from "../lib/format";
import { t } from "../lib/i18n";
import { heartbeatState, isEngineTool, modeLabel, modeNeedsYou, pauseLabel, stateLabel, toolLabel } from "../lib/labels";
import { livenessOf, state } from "../lib/store";
import { NeedsYouMark, Seal } from "./Glyph";

/**
 * A running goal whose event stream has been still for two minutes with no
 * tool in flight: the badge says so instead of "thinking", so the board and
 * the title bar's heartbeat never contradict each other.
 */
export function silent(g: GoalSummary, now: number): boolean {
  if (g.state !== "running") return false;
  const l = livenessOf(g);
  return heartbeatState(Math.max(0, now - l.at), l.tool !== null) === "silent";
}

export function ModeBadge(props: { goal: GoalSummary }) {
  const attention = () => modeNeedsYou(props.goal.mode) || (props.goal.needs_you > 0 && props.goal.state === "running");
  const isSilent = () => !attention() && silent(props.goal, state.now);
  const text = () => {
    const g = props.goal;
    if (g.state === "running") return attention() ? modeLabel("waiting_on_you") : isSilent() ? t("chrome.unresponsive") : modeLabel(g.mode);
    if (g.state === "verifying") return modeLabel("verifying");
    if (g.state === "paused") return stateLabel("paused");
    return stateLabel(g.state);
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
  /** How long the current run has been going ("running 1h 46m"), on the board. */
  elapsed?: string;
}

/** Looks like a path or command: printable ASCII without runs of spaces. */
const machine = (s: string) => /^[\x20-\x7e]+$/.test(s) && !/\s{2,}/.test(s);

export function liveDetail(g: GoalSummary): LiveDetail {
  if (g.state === "paused" && g.pause_reason) return { action: pauseLabel(g.pause_reason), target: "" };
  if (g.needs_you > 0 && (g.state === "running" || g.state === "accepted")) {
    const item = state.inbox.find((i) => i.goal_id === g.id && i.kind !== "review_ready");
    if (item) {
      const action = item.kind === "approval" ? t("live.approval") : item.kind === "ci_failed" ? t("live.ciFailed") : t("live.question");
      return { action, target: item.subject };
    }
  }
  // The run's elapsed time rides with the live detail, so the board's age column means one thing: last update.
  const ran = g.state === "running" && g.run_started_at ? t("live.runningFor", { d: duration(Math.max(0, state.now - g.run_started_at), false) }) : "";
  if (g.live_line && g.state === "running") {
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
      // No tool in flight: the badge already says what kind of step it is; the detail says which run.
      return g.mode === "starting"
        ? { action: t("live.starting"), target: g.run_no > 1 ? t("live.runN", { n: g.run_no }) : "", elapsed: ran }
        : { action: g.run_no > 1 ? t("live.runN", { n: g.run_no }) : t("live.getStarted"), target: "", elapsed: ran };
    case "verifying":
      return { action: t("live.criteria"), target: t("live.passedOf", { v: g.progress.verified, m: g.progress.machine }) };
    case "claimed":
      return { action: t("live.claimedDone"), target: t("live.awaitingVerify") };
    case "in_review":
      return g.progress.machine === 0 || !g.verified_pin
        ? { action: t("live.notMachineVerified"), target: t("live.yourCall") }
        : { action: "", target: "", seal: g.verified_pin };
    case "accepted":
      return { action: t("live.branch"), target: g.branch ?? "", code: { target: true } };
    case "integrated":
      return { action: t("live.merged"), target: g.branch ?? "", code: { target: true } };
    case "ready":
      return { action: t("live.queued"), target: t("live.waitingSlot") };
    case "draft":
      return { action: t("live.draft"), target: t("live.unratified") };
    default:
      return { action: stateLabel(g.state), target: "" };
  }
}

export function LiveLine(props: { goal: GoalSummary; large?: boolean; hideTarget?: boolean }) {
  const d = () => liveDetail(props.goal);
  return (
    <div class="live-line halt" classList={{ "live-line-large": !!props.large }}>
      <ModeBadge goal={props.goal} />
      <span class="live-detail ellipsis" title={d().target || undefined}>
        <Show
          when={d().seal}
          fallback={
            <>
              <span class="live-action" classList={{ "code-val": !!d().code?.action }}>
                {d().action}
              </span>
              <Show when={d().target && !props.hideTarget}>
                <span class="sep">·</span>
                <span class="live-target" classList={{ "code-val": !!d().code?.target }}>
                  {d().target}
                </span>
              </Show>
              <Show when={d().elapsed && !props.large}>
                <span class="sep live-elapsed-sep">·</span>
                <span class="live-elapsed num t3">{d().elapsed}</span>
              </Show>
            </>
          }
        >
          <Seal pin={d().seal} compact />
        </Show>
      </span>
      {/* The right slot is the time of the last movement; when the engine has gone silent that is exactly the reading you need, so it stays and says so. */}
      <Show when={props.large && props.goal.state === "running"}>
        <Show
          when={!silent(props.goal, state.now)}
          fallback={<span class="live-age meta num">{t("live.lastMove", { d: agoShort(livenessOf(props.goal).at, state.now) })}</span>}
        >
          <Show when={props.goal.live_line}>
            <span class="live-age meta num">{ago(props.goal.live_line!.at, state.now)}</span>
          </Show>
        </Show>
      </Show>
    </div>
  );
}
