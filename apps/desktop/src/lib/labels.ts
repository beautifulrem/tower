/** UI vocabulary. Mirrors tower-core's labels; the words live in i18n.ts. */
import type { EnvIssue } from "../gen/EnvIssue";
import type { EnvIssueKind } from "../gen/EnvIssueKind";
import type { EnvironmentStatus } from "../gen/EnvironmentStatus";
import type { GoalSummary } from "../gen/GoalSummary";
import type { InboxItem } from "../gen/InboxItem";
import type { LifecycleState } from "../gen/LifecycleState";
import type { Mode } from "../gen/Mode";
import type { OptionTone } from "../gen/OptionTone";
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

/**
 * Sidebar and board groups, in order of how much they need the human. The
 * verification line (claimed done, verifying) is its own group: "to accept"
 * holds only what is actually ready to accept.
 */
export type Group = "needs_you" | "running" | "verifying" | "review" | "ready" | "paused" | "done";

export const groupLabel = (g: Group): string => t(`group.${g}`);

/**
 * `blocked` is the set of goals with an open blocking item (from the inbox,
 * `isBlocking`): with it, a goal needs you exactly when a card does — the
 * same source the "Needs you" count uses, so the two numbers agree. Without
 * it, the summary's own count stands in (minus the ready-to-accept item).
 */
export function groupOf(g: GoalSummary, blocked?: Set<string>): Group {
  if (blocked ? blocked.has(g.id) : g.needs_you > 0 && g.state !== "in_review") return "needs_you";
  switch (g.state) {
    case "running":
      return "running";
    case "claimed":
    case "verifying":
      return "verifying";
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

/** The engine's name in words; "" is the default from the settings. */
export function engineLabel(engine: string): string {
  return engine === "claude-code" ? "Claude Code" : engine === "pi" ? "Pi" : engine;
}

/**
 * The engine as a two-letter mark for tight columns (the board's identity
 * column): `CC`, `Pi`; an unknown engine keeps its first two letters.
 */
export function engineMark(engine: string): string {
  return engine === "claude-code" ? "CC" : engine === "pi" ? "Pi" : engine.slice(0, 2);
}

/** The engine a goal runs on once the default is applied. */
export function effectiveEngine(contractEngine: string | undefined, defaultEngine: string | undefined): string {
  return contractEngine || defaultEngine || "pi";
}

/** Models belong to one engine: Claude Code's by provider, every other provider is Pi's. */
export function modelsFor<M extends { provider: string }>(models: M[], engine: string): M[] {
  return models.filter((m) => (engine === "claude-code") === (m.provider === "claude-code"));
}

/** The engine is "silent" after this long without any event. */
export const SILENT_AFTER_MS = 120_000;

/**
 * How the engine reads right now: `fine` within 30 s, `quiet` up to two
 * minutes, `silent` after that — unless a tool call is still running, in
 * which case it is `busy` and never silent (a full test suite can take
 * five minutes without a word).
 */
export function heartbeatState(sinceMs: number, toolRunning: boolean): "fine" | "quiet" | "busy" | "silent" {
  if (toolRunning) return sinceMs > 30_000 ? "busy" : "fine";
  if (sinceMs <= 30_000) return "fine";
  if (sinceMs <= SILENT_AFTER_MS) return "quiet";
  return "silent";
}

/**
 * How the supervisor wants an option presented (tower-core `Choice::tone`):
 * one tone per option, in order. Destructive options never fire from a
 * single key: abandoning a goal, overriding a sentinel.
 */
export function optionTone(item: InboxItem, index: number): OptionTone {
  return item.tones[index] ?? (index === 0 ? "primary" : "neutral");
}

/** On an assumption card the primary option approves; any other rejects. */
export const approves = (item: InboxItem, index: number): boolean => optionTone(item, index) === "primary";

/** Whether the environment reports an issue of this kind. */
export function hasIssue(env: EnvironmentStatus | null | undefined, kind: EnvIssueKind): boolean {
  return !!env?.issues?.some((i) => i.kind === kind);
}

/** Tower's oldest supported Pi, used only until the environment reports `min_pi_version`. */
export const MIN_PI = "1.4.0";

/**
 * An environment problem in the interface language. The supervisor's own
 * sentence (`text`) is fixed at fetch time, so it is only the fallback for a
 * kind this build does not know.
 */
export function envIssueLabel(issue: EnvIssue, env: EnvironmentStatus | null | undefined): string {
  const v = env?.pi_version?.split(" ")[0] ?? "";
  switch (issue.kind) {
    case "pi_missing":
    case "pi_broken":
    case "git_missing":
    case "no_sandbox":
    case "claude_missing":
      return t(`envIssue.${issue.kind}`);
    case "pi_too_old":
      return t("envIssue.pi_too_old", { v, want: env?.min_pi_version || MIN_PI });
    case "pi_untested":
      return t("envIssue.pi_untested", { v });
    default:
      return issue.text;
  }
}

/** Programs the demo may need, with the command that installs each. */
export function installHint(tool: string): string {
  return ({ python3: "xcode-select --install", node: "brew install node", git: "xcode-select --install" } as Record<string, string>)[tool] ?? `brew install ${tool}`;
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
