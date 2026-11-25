/**
 * Forward-compatible DTO extensions, safe optional Tauri calls, shared image
 * attachment helpers, and compact bilingual labels for the Command Deck,
 * Review Theater, and Contract Studio.
 */
import { heldOrTampered } from "../../lib/discounted";
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
/** The findings on the assertions that qualify a pass, from the same list. */
const UNCHECKED_RE = /^(assertions_unchecked|assertion_identity_unchecked)$/;
const BYPASS_RE = /bypass|perturb|rust_test_branch|expectations_changed/;
const RANK = ["ok", "fact", "obs", "attn", "danger"];

/**
 * What qualifies a machine criterion's reading, as [tone, label, title?, line?] — the goal page's evidence strip and the
 * verification readout draw this one list, so neither says less than the other. `line` marks a fact a sentence line below
 * says in full: folded, the pill stands for it; open, the line does. Each fact once (the guard gap and an unchecked canary
 * say the same thing), in the weightier of its tones: a high sentinel behind it makes it a question for you on every
 * criterion it names. A pass never wears danger red: what stands against a pass is a question for you, in the attention ground.
 */
export function qualifiers(cur: ExtCriterionView, sents: SentinelHit[] = [], ids?: string[]): [string, string, string?, 1?][] {
  const ver = cur.verified;
  if (cur.criterion.kind.type !== "exec" || !ver) return [];
  const out: [string, string, string?, 1?][] = [];
  const okC = cur.canary !== "tampered";
  // A pass a high finding holds (or a tampered canary undoes) is counted with no caveats, as the supervisor counts it
  // (summaries.rs `progress()`): what would have been one is a finding to look at first, never the neutral caveat pill.
  const held = heldOrTampered(cur, sents);
  const cav = held ? "attn" : "obs";
  if (ver.passed && cur.passed_on_base === false && cur.passes_with_source_only !== false && okC) out.push(["ok", t("goal.evRedGreen"), undefined, 1]);
  if (cur.passes_with_source_only === true && okC) out.push(["fact", t("goal.evSourceOnly")]);
  else if (cur.passes_with_source_only === false) out.push(["attn", t("goal.dependsOnEditedTests"), undefined, 1]);
  if (cur.canary === "intact") out.push(["fact", t("goal.evCanaryOk"), undefined, 1]);
  else if (cur.canary === "tampered") out.push(["attn", t("goal.canaryTampered"), undefined, 1]);
  else if (cur.canary === "not_checked") out.push([cav, t("honesty.cavAsserts"), undefined, 1]);
  // The criteria a finding names: the goal's own ids, whole (review 15: a path such as tests/C9/… names none).
  const named = (h: SentinelHit) => (h.detail?.match(/\bC\d+\b/g) ?? []).filter((x) => !ids || ids.includes(x));
  const forCur = (h: SentinelHit) => !named(h).length || named(h).includes(cur.criterion.id);
  // The assertions' guard and the test machinery, each said once, by its weightiest finding; "assertions untouched" only
  // when neither finding stands, so the row never says it beside the caveat "code reaches into the test runner".
  const weightiest = [...sents].sort((a, b) => b.severity - a.severity);
  const gh = weightiest.find((h) => GUARD_RE.test(h.sentinel) && forCur(h));
  const mh = weightiest.find((h) => MACHINERY_RE.test(h.sentinel) && forCur(h));
  for (const h of [gh, mh])
    if (h) {
      // A finding the supervisor counts the pass with is a caveat: in the seal's words and the strip's neutral tone
      // (docs/12 §12.5.2), whichever finding raised it. A high one holds the pass, named for what was done; any other
      // finding is one to look at first.
      const machinery = MACHINERY_RE.test(h.sentinel);
      const caveat = !held && h.severity < 3 && (machinery || UNCHECKED_RE.test(h.sentinel));
      const words = caveat
        ? t(machinery ? "honesty.cavMachinery" : "honesty.cavAsserts")
        : machinery
          ? t(h.sentinel === "source_touches_tests" ? "honesty.cavMachinery" : "goal.evAssertTamper")
          : /removed|disabled|replaced/.test(h.sentinel)
            ? t("goal.evAssertsWeakened")
            : t("honesty.cavAsserts");
      out.push([h.severity >= 3 ? "danger" : caveat ? "obs" : "attn", words, h.detail || h.title]);
    }
  if (!gh && !mh && ver.passed && cur.canary === "intact") out.push(["fact", t("goal.evGuardOk")]);
  const ho = ver.held_out_proof;
  if (ho?.not_ran.length) out.push(["attn", t("goal.heldOutSome", { m: ho.ran.length, n: ho.ran.length + ho.not_ran.length }), undefined, 1]);
  if (ver.flaky) out.push([cav, t("honesty.cavFlaky")]);
  if (cur.loopback_opened) out.push(["obs", cur.loopback_opened === "base" ? t("goal.evLoopbackBase") : t("goal.evLoopbackProject"), undefined, 1]);
  const bh = weightiest.find((h) => BYPASS_RE.test(h.sentinel) && forCur(h));
  if (bh) out.push([bh.severity >= 3 ? "danger" : "attn", bh.sentinel.includes("bypass") ? t("goal.evBypass") : bh.sentinel.includes("perturb") ? t("goal.evPerturb") : t("goal.evTestExpectation"), bh.detail || bh.title]);
  // A high finding holds every pass of the goal. When none of this criterion's own pills is that finding (it names
  // another criterion, or is of a kind with no pill), the row still says why its pass doesn't count, and where.
  const high = weightiest.filter((h) => h.severity >= 3);
  if (held && okC && ver.passed && high.length && ![gh, mh, bh].some((h) => h && h.severity >= 3)) {
    const who = [...new Set(high.flatMap(named))].filter((id) => id !== cur.criterion.id);
    out.push(["attn", who.length ? t("goal.evHeldBy", { ids: who.join(", ") }) : t("goal.evHeld"), high.map((h) => [h.title, h.detail].filter(Boolean).join(": ")).join("\n")]);
  }
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
