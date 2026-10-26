/** UI vocabulary. Mirrors tower-core's labels; the words live in i18n.ts. */
import type { GoalSummary } from "../gen/GoalSummary";
import type { LifecycleState } from "../gen/LifecycleState";
import type { Mode } from "../gen/Mode";
import type { PauseReason } from "../gen/PauseReason";
import { t } from "./i18n";

export const stateLabel = (s: LifecycleState): string => t(`state.${s}`);

export const pauseLabel = (r: PauseReason): string => t(`pause.${r}`);

/** Mode badge text (§12.6.3): short, attention only when it needs you. */
export const modeLabel = (m: Mode): string => t(`mode.${m}`);

export function modeNeedsYou(m: Mode): boolean {
  return m === "waiting_on_you";
}

/** Whether the goal's verdict came from the verifier (so it may be green). */
export function machineVerified(g: GoalSummary): boolean {
  return g.progress.machine > 0 && g.verified_pin !== null;
}

/** Sidebar and board groups, in order of how much they need the human. */
export type Group = "needs_you" | "running" | "review" | "ready" | "paused" | "done";

export const groupLabel = (g: Group): string => t(`group.${g}`);

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

/** Tower's own tools get words; engine tools keep their names. */
export function toolLabel(tool: string): string {
  return tool === "ask_user" || tool === "log" || tool === "submit" ? t(`tool.${tool}`) : tool;
}

/** Engine tools whose names are shown as code. */
export function isEngineTool(tool: string): boolean {
  return tool === "read" || tool === "edit" || tool === "write" || tool === "bash";
}
