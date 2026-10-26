/**
 * Mode annunciator and live line (docs/12 §12.6.3–12.6.4): one line that
 * says the goal is alive and what kind of thing it is doing, always with a
 * steerable detail — never "working…".
 */
import { Show } from "solid-js";

import type { GoalSummary } from "../gen/GoalSummary";
import { ago } from "../lib/format";
import { modeLabel, modeNeedsYou, pauseLabel, stateLabel, toolLabel } from "../lib/labels";
import { state } from "../lib/store";
import { NeedsYouMark } from "./Glyph";

export function ModeBadge(props: { goal: GoalSummary }) {
  const attention = () => modeNeedsYou(props.goal.mode) || (props.goal.needs_you > 0 && props.goal.state === "running");
  const text = () => {
    const g = props.goal;
    if (g.state === "running") return attention() ? "等你" : modeLabel[g.mode];
    if (g.state === "verifying") return "验证";
    if (g.state === "paused") return "已暂停";
    return stateLabel[g.state];
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

/** The detail after the badge: `动作 · 对象`, or the reason when not running. */
export function liveDetail(g: GoalSummary): { action: string; target: string } {
  if (g.state === "paused" && g.pause_reason) return { action: pauseLabel[g.pause_reason], target: "" };
  if (g.state === "running" && g.needs_you > 0) {
    const item = state.inbox.find((i) => i.goal_id === g.id);
    if (item) return { action: item.kind === "approval" ? "批准" : "问题", target: item.title };
  }
  if (g.live_line && g.state === "running") {
    return { action: toolLabel[g.live_line.action] ?? g.live_line.action, target: g.live_line.target };
  }
  switch (g.state) {
    case "running":
      return { action: g.mode === "starting" ? "启动" : "当前步骤", target: g.run_no > 1 ? `第 ${g.run_no} 次运行` : "开始工作" };
    case "verifying":
      return { action: "标准", target: `${g.progress.verified}/${g.progress.machine} 已通过` };
    case "claimed":
      return { action: "Agent 称已完成", target: "等待验证" };
    case "in_review":
      return g.progress.machine === 0
        ? { action: "未经机器验证", target: "请你判断" }
        : { action: "已验证", target: `@${(g.verified_pin ?? "").slice(0, 7)}` };
    case "accepted":
      return { action: "分支", target: g.branch ?? "" };
    case "integrated":
      return { action: "已合入本地基线", target: g.branch ?? "" };
    case "ready":
      return { action: "排队", target: "等待执行槽位" };
    case "draft":
      return { action: "草稿", target: "合同未批准" };
    default:
      return { action: stateLabel[g.state], target: "" };
  }
}

export function LiveLine(props: { goal: GoalSummary; large?: boolean }) {
  const d = () => liveDetail(props.goal);
  return (
    <div class="live-line" classList={{ "live-line-large": !!props.large }}>
      <ModeBadge goal={props.goal} />
      <span class="sep">·</span>
      <span class="live-action mono">{d().action}</span>
      <Show when={d().target}>
        <span class="sep">·</span>
        <span class="live-target mono ellipsis" title={d().target}>
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
