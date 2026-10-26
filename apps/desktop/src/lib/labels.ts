/** UI vocabulary. Mirrors tower-core's labels; the words live in i18n.ts. */
import type { EnvIssueKind } from "../gen/EnvIssueKind";
import type { EnvironmentStatus } from "../gen/EnvironmentStatus";
import type { GoalSummary } from "../gen/GoalSummary";
import type { InboxItem } from "../gen/InboxItem";
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

/**
 * Items that block a run or need a way out. These count as "needs you";
 * goals merely ready to accept are counted apart (docs/08 attention ladder).
 */
export function isBlocking(item: InboxItem): boolean {
  return item.kind !== "review_ready";
}

/**
 * Options the supervisor offers are plain labels in the language the item
 * was created in (tower-core `Choice`). The destructive ones never fire
 * from a single key: abandoning a goal, overriding a sentinel.
 */
const DESTRUCTIVE = /^(放弃这个目标|Abandon this goal|我已确认，进入评审|I've checked, go to review)$/i;
const APPROVE = /^(批准|Approve)$/i;
const REJECT = /^(驳回|Reject)$/i;

export const isDestructiveOption = (opt: string): boolean => DESTRUCTIVE.test(opt.trim());
export const isApproveOption = (opt: string): boolean => APPROVE.test(opt.trim());
export const isRejectOption = (opt: string): boolean => REJECT.test(opt.trim());

/** Whether the environment reports an issue of this kind. */
export function hasIssue(env: EnvironmentStatus | null | undefined, kind: EnvIssueKind): boolean {
  return !!env?.issues?.some((i) => i.kind === kind);
}

/** Why a run started, in words. Unknown purposes pass through. */
export function runPurposeLabel(purpose: string): string {
  const key = ({ initial: "purposeInitial", rework: "purposeRework", resume: "purposeResume", request_changes: "purposeRequestChanges" } as const)[
    purpose as "initial"
  ];
  return key ? t(`goal.${key}`) : purpose;
}

/** How a run ended, in words. Unknown outcomes pass through. */
export function runOutcomeLabel(outcome: string | null): string | null {
  const key = (
    { submitted: "outcomeSubmitted", paused: "outcomePaused", crashed: "outcomeCrashed", abandoned: "outcomeAbandoned", interrupted: "outcomeInterrupted" } as const
  )[(outcome ?? "") as "submitted"];
  return key ? t(`goal.${key}`) : outcome;
}
