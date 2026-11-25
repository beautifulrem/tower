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
import type { EngineTrustTier } from "./apiTypes";
import { caveats, notEvidence } from "./discounted";
import { t } from "./i18n";
import { livenessOf, state } from "./store";

export const stateLabel = (s: LifecycleState): string => t(`state.${s}`);

/**
 * The one word for where a goal stands, the same on every surface that names it in text (palette, peek, Operations,
 * the board's briefing): the lifecycle state, except that a goal waiting to be accepted is never called ready unless
 * the verifier's pass counts — a tampered canary says so, and so does a goal no machine criterion verified.
 */
export function statusWord(g: Pick<GoalSummary, "id" | "state" | "progress" | "verified_pin">): string {
  if (g.state === "in_review") {
    if (notEvidence(g)) return t("honesty.sealTampered");
    if (!g.verified_pin || !g.progress?.machine) return t("honesty.notMachineVerified");
    if (caveats(g).length) return t("honesty.qualified");
  }
  return stateLabel(g.state);
}

export const pauseLabel = (r: PauseReason | "agent_reported_blocked"): string => t(`pause.${r}` as Parameters<typeof t>[0]);

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
  switch (engine) {
    case "pi":
      return "Pi";
    case "claude-code":
      return "Claude Code";
    case "codex":
      return "Codex";
    case "gemini-cli":
      return "Gemini CLI";
    case "opencode":
      return "OpenCode";
    default:
      return engine;
  }
}

/** An engine's sandbox trust tier: the backend's descriptor when it has arrived, else the same per-engine default
 *  the supervisor uses (`acp_adapter::trust_level`). Every surface asks here, so the peek, the goal rail and
 *  Settings can't disagree. */
export function engineTrustTier(engine: string): EngineTrustTier {
  const known = state.engines.find((e) => e.id === engine)?.trust_tier;
  if (known) return known;
  if (engine === "pi" || engine === "claude-code" || !engine) return "full_s2";
  if (engine === "codex" || engine === "gemini-cli" || engine === "opencode") return "restricted_s2";
  return "experimental";
}

/** The engine a goal runs on once the default is applied. */
export function effectiveEngine(contractEngine: string | undefined, defaultEngine: string | undefined): string {
  return contractEngine || defaultEngine || "pi";
}

/** Models belong to one engine: Claude Code's by provider, every other provider is Pi's (or shared for ACP engines). */
export function modelsFor<M extends { provider: string }>(models: M[], engine: string): M[] {
  if (engine === "claude-code") return models.filter((m) => m.provider === "claude-code");
  if (engine === "pi" || !engine) return models.filter((m) => m.provider !== "claude-code");
  const matched = models.filter((m) => m.provider === engine);
  return matched.length ? matched : models;
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
 * A running goal whose event stream has been still for two minutes with no tool in flight: the badge says so instead
 * of "thinking", so the board and the title bar's heartbeat never contradict each other.
 */
export function silent(g: GoalSummary, now: number): boolean {
  if (g.state !== "running") return false;
  const l = livenessOf(g);
  return heartbeatState(Math.max(0, now - l.at), l.tool !== null) === "silent";
}

/**
 * Work in motion: a goal being verified, or a running one that is neither waiting on you nor silent. Only then does its
 * mark turn (and, on the goal in view, its words shimmer): a goal that waits on you, or has gone quiet, holds its mark
 * still, so motion never says "at work" beside "Question" or "Unresponsive".
 */
export const moving = (g: GoalSummary, now: number): boolean =>
  g.state === "verifying" || (g.state === "running" && !modeNeedsYou(g.mode) && !g.needs_you && !silent(g, now));

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
    case "git_identity_missing":
      return t(`envIssue.${issue.kind}`);
    case "pi_too_old":
      return t("envIssue.pi_too_old", { v, want: env?.min_pi_version || MIN_PI });
    case "pi_untested":
      return t("envIssue.pi_untested", { v });
    default:
      return issue.text;
  }
}

/** One reading of Settings › Environment's gauge strip: a name, a mark and a value, like the title bar's gauges. */
export interface EnvGauge {
  key: "pi" | "claude" | "git" | "sandbox" | "identity";
  label: string;
  /** `ok` is a quiet check (Tower's own self-test, never the verifier's green); the others are the marks' usual registers. */
  mark: "ok" | "danger" | "attention" | "notice";
  value: string;
  /** The long form for the pointer: a path, the sentence. */
  title?: string;
}

/**
 * The environment as a line of readings: the engine (Pi's version, or Claude
 * Code), git's version, the sandbox, the git identity. Each problem's mark is
 * the one its check row carries below, so the strip and the rows agree.
 */
export function envGauges(env: EnvironmentStatus | null | undefined, engine: string | undefined): EnvGauge[] {
  if (!env) return [];
  const out: EnvGauge[] = [];
  if (engine === "claude-code") {
    const missing = hasIssue(env, "claude_missing");
    out.push({ key: "claude", label: "Claude Code", mark: missing ? "danger" : "ok", value: missing ? t("settings.notFound") : t("settings.gaugeReady") });
  } else {
    const broken = env.issues.find((i) => i.kind === "pi_missing" || i.kind === "pi_broken" || i.kind === "pi_too_old");
    const version = env.pi_version?.split(" ")[0] ?? "";
    out.push({
      key: "pi",
      label: "Pi",
      mark: broken || !env.pi_version ? "danger" : hasIssue(env, "pi_untested") ? "notice" : "ok",
      value: env.pi_version ? version : env.pi_path ? t("settings.gaugeBroken") : t("settings.notFound"),
      title: env.pi_path ?? undefined,
    });
  }
  out.push({ key: "git", label: "git", mark: env.git_version ? "ok" : "danger", value: env.git_version ? env.git_version.replace(/^git version\s*/, "").split(" ")[0] : t("settings.notFound") });
  const noSandbox = hasIssue(env, "no_sandbox");
  out.push({ key: "sandbox", label: t("settings.gaugeSandbox"), mark: noSandbox ? "notice" : "ok", value: noSandbox ? t("settings.gaugeNone") : t("settings.gaugeOn") });
  if (env.git_version) {
    const unset = hasIssue(env, "git_identity_missing");
    // The i mark, as in the check list under it and on the welcome page: a missing identity blocks writing a branch, not a run, so it is not the amber !.
    out.push({ key: "identity", label: t("settings.gaugeIdentity"), mark: unset ? "notice" : "ok", value: unset ? t("settings.gaugeUnset") : t("settings.gaugeSet") });
  }
  return out;
}

/** Programs the demo may need, with the command that installs each. */
export function installHint(tool: string): string {
  return ({ python3: "xcode-select --install", node: "brew install node", git: "xcode-select --install" } as Record<string, string>)[tool] ?? `brew install ${tool}`;
}

/** Why a run started, in words. Unknown purposes pass through. */
export function runPurposeLabel(purpose: string): string {
  // Whole keys, so the words' half is known: a key built at run time would pin its namespace to start-up.
  const key = ({ initial: "goal.purposeInitial", rework: "goal.purposeRework", resume: "goal.purposeResume", request_changes: "goal.purposeRequestChanges" } as const)[
    purpose as "initial"
  ];
  return key ? t(key) : purpose;
}

/** How a run ended, in words. Unknown outcomes pass through. */
export function runOutcomeLabel(outcome: string | null): string | null {
  const key = (
    {
      submitted: "goal.outcomeSubmitted",
      paused: "goal.outcomePaused",
      crashed: "goal.outcomeCrashed",
      abandoned: "goal.outcomeAbandoned",
      interrupted: "goal.outcomeInterrupted",
    } as const
  )[(outcome ?? "") as "submitted"];
  return key ? t(key) : outcome;
}
