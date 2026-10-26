/** UI vocabulary. Mirrors tower-core's briefing labels; one place to edit. */
import type { GoalSummary } from "../gen/GoalSummary";
import type { LifecycleState } from "../gen/LifecycleState";
import type { Mode } from "../gen/Mode";
import type { PauseReason } from "../gen/PauseReason";

export const stateLabel: Record<LifecycleState, string> = {
  draft: "草稿",
  ready: "就绪",
  running: "运行中",
  paused: "已暂停",
  claimed: "自称完成",
  verifying: "验证中",
  in_review: "待验收",
  accepted: "已验收",
  integrated: "已合入",
  archived: "已归档",
  abandoned: "已放弃",
};

export const pauseLabel: Record<PauseReason, string> = {
  human: "你暂停了它",
  budget_soft_cap: "预算软上限",
  budget_hard_cap: "预算硬上限",
  idle_without_submit: "停下了但没有提交",
  engine_crash: "引擎意外退出",
  app_quit: "Tower 退出时暂停",
  verify_failed_limit: "验证失败 · 返工次数用完",
  verify_env_error: "验证环境出错",
  prepare_failed: "准备或启动失败",
  provider_error: "模型服务出错",
};

/** Mode badge text (§12.6.3): 2–4 characters, attention only when it needs you. */
export const modeLabel: Record<Mode, string> = {
  idle: "空闲",
  starting: "准备中",
  thinking: "思考",
  reading: "执行",
  editing: "执行",
  executing: "执行",
  waiting_on_you: "等你",
  retrying: "重试",
  compacting: "压缩中",
  verifying: "验证",
  settled: "已停",
};

export function modeNeedsYou(m: Mode): boolean {
  return m === "waiting_on_you";
}

/** Whether the goal's verdict came from the verifier (so it may be green). */
export function machineVerified(g: GoalSummary): boolean {
  return g.progress.machine > 0 && g.verified_pin !== null;
}

/** Sidebar and board groups, in order of how much they need the human. */
export type Group = "needs_you" | "running" | "review" | "ready" | "paused" | "done";

export const groupLabel: Record<Group, string> = {
  needs_you: "需要你",
  running: "运行中",
  review: "验证与待验收",
  ready: "就绪与草稿",
  paused: "已暂停",
  done: "已验收 · 已结束",
};

export function groupOf(g: GoalSummary): Group {
  if (g.needs_you > 0 && g.state !== "in_review") return "needs_you";
  switch (g.state) {
    case "running":
      return "running";
    case "claimed":
    case "verifying":
    case "in_review":
      return "review";
    case "draft":
    case "ready":
      return "ready";
    case "paused":
      return "paused";
    default:
      return "done";
  }
}

export const toolLabel: Record<string, string> = {
  read: "read",
  edit: "edit",
  write: "write",
  bash: "bash",
  ask_user: "问题",
  log: "记录",
  submit: "提交",
};
