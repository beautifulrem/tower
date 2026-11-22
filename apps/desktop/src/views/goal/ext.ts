/**
 * Forward-compatible DTO extensions, safe optional Tauri calls, shared image
 * attachment helpers, and compact bilingual labels for the Command Deck,
 * Review Theater, and Contract Studio.
 */
import { engineTrustTier } from "../../lib/labels";
import type { Contract } from "../../gen/Contract";
import type { CriterionResultView } from "../../gen/CriterionResultView";
import type { CriterionView } from "../../gen/CriterionView";
import type { DiffFile } from "../../gen/DiffFile";
import type { GoalDetail } from "../../gen/GoalDetail";
import type { GoalSummary } from "../../gen/GoalSummary";
import type { Hunk } from "../../gen/Hunk";
import type { LookView } from "../../gen/LookView";
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
export const trustLabel = (t: EngineTrustTier) => (t === "full_s2" ? "Full S2" : t === "restricted_s2" ? "Restricted S2" : "Experimental");
export const sandboxTag = (t: SandboxTier, noSb: boolean) => (t === "micro_vm" ? "MicroVM" : noSb ? "No sandbox S0" : "Sandbox S2");
