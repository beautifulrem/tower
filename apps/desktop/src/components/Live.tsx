/**
 * Mode annunciator and live line (docs/12 §12.6.3–12.6.4): one line that
 * says the goal is alive and what kind of thing it is doing, always with a
 * steerable detail — never "working…".
 */
import { Show } from "solid-js";

import type { GoalSummary } from "../gen/GoalSummary";
import { ago } from "../lib/format";
import { t } from "../lib/i18n";
import { isEngineTool, modeLabel, modeNeedsYou, pauseLabel, stateLabel, toolLabel } from "../lib/labels";
import { state } from "../lib/store";
import { NeedsYouMark } from "./Glyph";

export function ModeBadge(props: { goal: GoalSummary }) {
  const attention = () => modeNeedsYou(props.goal.mode) || (props.goal.needs_you > 0 && props.goal.state === "running");
  const text = () => {
    const g = props.goal;
    if (g.state === "running") return attention() ? modeLabel("waiting_on_you") : modeLabel(g.mode);
    if (g.state === "verifying") return modeLabel("verifying");
    if (g.state === "paused") return stateLabel("paused");
    return stateLabel(g.state);
  };
  return (
    <span class="mode-badge" classList={{ "mode-attention": attention() }}>
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
}

/** Looks like a path or command: printable ASCII without runs of spaces. */
const machine = (s: string) => /^[\x20-\x7e]+$/.test(s) && !/\s{2,}/.test(s);

export function liveDetail(g: GoalSummary): LiveDetail {
  if (g.state === "paused" && g.pause_reason) return { action: pauseLabel(g.pause_reason), target: "" };
  if (g.state === "running" && g.needs_you > 0) {
    const item = state.inbox.find((i) => i.goal_id === g.id);
    if (item) return { action: item.kind === "approval" ? t("live.approval") : t("live.question"), target: item.title };
  }
  if (g.live_line && g.state === "running") {
    const tool = g.live_line.action;
    const label = toolLabel(tool);
    return {
      action: label,
      target: g.live_line.target,
      code: { action: isEngineTool(tool) || (label === tool && machine(tool)), target: machine(g.live_line.target) },
    };
  }
  switch (g.state) {
    case "running":
      return {
        action: g.mode === "starting" ? t("live.starting") : t("live.currentStep"),
        target: g.run_no > 1 ? t("live.runN", { n: g.run_no }) : t("live.getStarted"),
      };
    case "verifying":
      return { action: t("live.criteria"), target: t("live.passedOf", { v: g.progress.verified, m: g.progress.machine }) };
    case "claimed":
      return { action: t("live.claimedDone"), target: t("live.awaitingVerify") };
    case "in_review":
      return g.progress.machine === 0
        ? { action: t("live.notMachineVerified"), target: t("live.yourCall") }
        : { action: t("live.verified"), target: `@${(g.verified_pin ?? "").slice(0, 7)}`, code: { target: true } };
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

export function LiveLine(props: { goal: GoalSummary; large?: boolean }) {
  const d = () => liveDetail(props.goal);
  return (
    <div class="live-line halt" classList={{ "live-line-large": !!props.large }}>
      <ModeBadge goal={props.goal} />
      <span class="live-action" classList={{ "code-val": !!d().code?.action }}>
        {d().action}
      </span>
      <Show when={d().target}>
        <span class="sep">·</span>
        <span class="live-target ellipsis" classList={{ "code-val": !!d().code?.target }} title={d().target}>
          {d().target}
        </span>
      </Show>
      <span class="grow" />
      <Show when={props.large && props.goal.live_line}>
        <span class="meta num">{ago(props.goal.live_line!.at, state.now)}</span>
      </Show>
    </div>
  );
}
