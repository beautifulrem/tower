/**
 * Forward-compatible DTO extensions, safe optional Tauri calls, shared image
 * attachment helpers, and compact bilingual labels for the Command Deck,
 * Review Theater, and Contract Studio.
 */
import { t } from "../../lib/i18n";
import { engineTrustTier } from "../../lib/labels";
import type { Contract } from "../../gen/Contract";
import type { CriterionResultView } from "../../gen/CriterionResultView";
import type { CriterionView } from "../../gen/CriterionView";
import type { DiffFile } from "../../gen/DiffFile";
import type { GoalDetail } from "../../gen/GoalDetail";
import type { GoalSummary } from "../../gen/GoalSummary";
import type { Hunk } from "../../gen/Hunk";
import type { LookView } from "../../gen/LookView";
import type { SentinelHit } from "../../gen/SentinelHit";
import type { ReviewUnit } from "../../gen/ReviewUnit";
import type { ReviewView } from "../../gen/ReviewView";

export type SandboxTier = "default" | "micro_vm";
export type EngineTrustTier = "full_s2" | "restricted_s2" | "experimental";

export interface AttachmentRef {
  id: string;
  name: string;
  mime: string;
  path: string;
  size_bytes: number;
  created_at: number;
  /** Transient client preview URL (data URL) before persistence or in mock/demo mode. */
  preview?: string;
}

import type { SnapshotPoint } from "../../gen/SnapshotPoint";
export type { SnapshotPoint };

export interface HoldoutDraft {
  id: string;
  filename: string;
  rationale: string;
  code: string;
}

export interface SandboxPosture {
  backend_name: string;
  microvm_available: boolean;
  warnings: string[];
}

export interface EngineDescriptor {
  id: string;
  label: string;
  trust_tier: EngineTrustTier;
  installed: boolean;
  available: boolean;
  note: string;
}

export type ExtContract = Contract & {
  escalation_model?: string;
  escalation_after_reworks?: number;
  attachments?: AttachmentRef[];
  sandbox_tier?: SandboxTier;
  depends_on?: string[];
};

export type ExtGoalSummary = GoalSummary & {
  sandbox_tier?: SandboxTier;
  port_base?: number | null;
  depends_on?: string[];
};

export type ExtGoalDetail = GoalDetail & {
  summary: ExtGoalSummary;
  contract: ExtContract;
  attachments?: AttachmentRef[];
  merge_queue_position?: number | null;
  escalated_model?: string | null;
};

export type ExtLookView = LookView & {
  console_errors?: string[];
  mobile_base?: string | null;
  mobile_pin?: string | null;
};

export type ExtCriterionResult = CriterionResultView & {
  flaky?: boolean | null;
  console_errors?: string[];
  mobile_look?: ExtLookView | null;
};

export type ExtCriterionView = CriterionView & {
  verified: ExtCriterionResult | null;
  look: ExtLookView | null;
};

export type ExtHunk = Hunk & {
  moved_unchanged?: boolean;
  formatting_only?: boolean;
};

export type ExtDiffFile = DiffFile & {
  moved_hunks?: number[];
  formatting_hunks?: number[];
};

export type ExtReviewUnit = ReviewUnit & {
  unit_claim_summary?: string | null;
};

export type ExtReviewView = ReviewView & {
  units: ExtReviewUnit[];
  files: ExtDiffFile[];
  snapshots?: SnapshotPoint[];
  moved_hunks?: Record<string, number[] | undefined>;
  formatting_hunks?: Record<string, number[] | undefined>;
};

export const trustTierOf = engineTrustTier;
export const trustLabel = (tier: EngineTrustTier) => t(`trust.${tier}`);
export const sandboxTag = (tier: SandboxTier, noSb: boolean) =>
  tier === "micro_vm" ? "MicroVM" : t(noSb ? "chrome.sandboxOff" : "chrome.sandboxOn");

const GUARD_RE = /assertion|guard/;
/** The findings on the test machinery that qualify a pass, the supervisor's own list (summaries.rs `progress()`). */
const MACHINERY_RE = /^(source_patches_tests|source_touches_tests|runner_patched)$/;
const BYPASS_RE = /bypass|perturb|rust_test_branch|expectations_changed/;
const RANK = ["ok", "fact", "obs", "attn", "danger"];

/**
 * What qualifies a machine criterion's reading, as [tone, label, title?, line?] — the goal page's evidence strip and the
 * verification readout draw this one list, so neither says less than the other. `line` marks a fact a sentence line below
 * says in full: folded, the pill stands for it; open, the line does. Each fact once (the guard gap and an unchecked canary
 * say the same thing), in the weightier of its tones: a high sentinel behind it makes it a question for you on every
 * criterion it names. A pass never wears danger red: what stands against a pass is a question for you, in the attention ground.
 */
export function qualifiers(cur: ExtCriterionView, sents: SentinelHit[] = []): [string, string, string?, 1?][] {
  const ver = cur.verified;
  if (cur.criterion.kind.type !== "exec" || !ver) return [];
  const out: [string, string, string?, 1?][] = [];
  const okC = cur.canary !== "tampered";
  if (ver.passed && cur.passed_on_base === false && cur.passes_with_source_only !== false && okC) out.push(["ok", t("goal.evRedGreen"), undefined, 1]);
  if (cur.passes_with_source_only === true && okC) out.push(["fact", t("goal.evSourceOnly")]);
  else if (cur.passes_with_source_only === false) out.push(["attn", t("goal.dependsOnEditedTests"), undefined, 1]);
  if (cur.canary === "intact") out.push(["fact", t("goal.evCanaryOk"), undefined, 1]);
  else if (cur.canary === "tampered") out.push(["attn", t("goal.canaryTampered"), undefined, 1]);
  else if (cur.canary === "not_checked") out.push(["obs", t("honesty.cavAsserts"), undefined, 1]);
  const forCur = (h: SentinelHit) => !h.detail || h.detail.includes(cur.criterion.id) || !/\bC\d+\b/.test(h.detail);
  // The assertions' guard and the test machinery, each said once; "assertions untouched" only when neither finding stands,
  // so the row never says it beside the caveat "code reaches into the test runner".
  const gh = sents.find((h) => GUARD_RE.test(h.sentinel) && forCur(h));
  const mh = sents.find((h) => MACHINERY_RE.test(h.sentinel) && forCur(h));
  for (const h of [gh, mh])
    if (h)
      out.push([
        h.severity >= 3 ? "danger" : "attn",
        /guard|unchecked/.test(h.sentinel) ? t("honesty.cavAsserts") : h.sentinel === "source_touches_tests" ? t("honesty.cavMachinery") : t("goal.evAssertTamper"),
        h.detail || h.title,
      ]);
  if (!gh && !mh && ver.passed && cur.canary === "intact") out.push(["fact", t("goal.evGuardOk")]);
  const ho = ver.held_out_proof;
  if (ho?.not_ran.length) out.push(["attn", t("goal.heldOutSome", { m: ho.ran.length, n: ho.ran.length + ho.not_ran.length }), undefined, 1]);
  if (ver.flaky) out.push(["obs", t("honesty.cavFlaky")]);
  if (cur.loopback_opened) out.push(["obs", cur.loopback_opened === "base" ? t("goal.evLoopbackBase") : t("goal.evLoopbackProject"), undefined, 1]);
  const bh = sents.find((h) => BYPASS_RE.test(h.sentinel) && forCur(h));
  if (bh) out.push([bh.severity >= 3 ? "danger" : "attn", bh.sentinel.includes("bypass") ? t("goal.evBypass") : bh.sentinel.includes("perturb") ? t("goal.evPerturb") : t("goal.evTestExpectation"), bh.detail || bh.title]);
  const errs = ver.console_errors ?? cur.look?.console_errors ?? [];
  if (errs.length) out.push(["danger", t("look.consoleErrors", { n: errs.length }), errs.join("\n")]);
  const by = new Map<string, [string, string, string?, 1?]>();
  // (Merged, the pill keeps "has its own line when open" if either had it, so the open row never says it twice.)
  for (const p of out) {
    const was = by.get(p[1]);
    if (!was || RANK.indexOf(p[0]) > RANK.indexOf(was[0])) by.set(p[1], [p[0], p[1], p[2] ?? was?.[2], p[3] ?? was?.[3]]);
    else if (p[3]) was[3] = 1;
  }
  const pass = ver.passed && !ver.stale;
  return [...by.values()].map(([tone, label, title, line]): [string, string, string?, 1?] => [tone === "danger" && pass ? "attn" : tone, label, title, line]);
}
