/**
 * Pure TypeScript DTO types matching `tower-core` (#11) so the frontend compiles
 * cleanly before `src/gen/` regeneration and snaps 1:1 onto generated types.
 * Zero runtime bytes emitted.
 */
import type { Contract } from "../gen/Contract";
import type { CriterionResultView } from "../gen/CriterionResultView";
import type { GoalDetail } from "../gen/GoalDetail";
import type { GoalSummary } from "../gen/GoalSummary";
import type { LifecycleState } from "../gen/LifecycleState";
import type { LookView } from "../gen/LookView";
import type { ReviewView } from "../gen/ReviewView";
import type { Settings } from "../gen/Settings";

export type SandboxTier = "default" | "micro_vm";
export type TaintLevel = "none" | "standard" | "high";
export type TaintClass =
  | "repo_content"
  | "tool_output"
  | "fixtures"
  | "dependency_code"
  | "registry_fetch"
  | "web"
  | "mcp"
  | "extension_tool"
  | "pasted_context"
  | "outside_worktree";
export type MemoryScope = "user" | "project" | "goal";
export type ProposalStatus = "pending" | "approved" | "rejected";
export type MergeQueueStatus = "queued" | "retesting" | "ready" | "conflict" | "merged";
export type EngineTrustTier = "full_s2" | "restricted_s2" | "experimental";

export interface AttachmentRef {
  id: string;
  name: string;
  mime: string;
  path: string;
  size_bytes: number;
  created_at: number;
}

export interface SnapshotPoint {
  rev: string;
  kind: "base" | "run_start" | "verified" | "pin" | "saved";
  label: string;
  run_no: number | null;
  at: number | null;
}

export interface MemoryProposal {
  id: string;
  scope: MemoryScope;
  project_id: string | null;
  goal_id: string | null;
  text: string;
  detail: string;
  origin: string;
  evidence: string[];
  taint_level: TaintLevel;
  taint_classes: TaintClass[];
  status: ProposalStatus;
  created_at: number;
  resolved_at: number | null;
}

export interface CalibrationRow {
  engine: string;
  model: string;
  project_id: string | null;
  goals_total: number;
  first_pass_rate: number;
  avg_reworks: number;
  high_sentinel_rate: number;
  blocked_rate: number;
  avg_cost_usd: number;
  sample_sufficient: boolean;
}

export interface ScheduledGoal {
  id: string;
  project_id: string;
  title: string;
  cron_expr: string;
  contract_template: Contract;
  enabled: boolean;
  last_run_at: number | null;
  next_run_at: number | null;
  last_goal_id: string | null;
  unattended_strict: boolean;
  created_at: number;
}

export interface NewScheduledGoalInput {
  project_id: string;
  title: string;
  cron_expr: string;
  contract_template: Contract;
  enabled: boolean;
  unattended_strict: boolean;
}

export interface MergeQueueEntry {
  goal_id: string;
  project_id: string;
  goal_title: string;
  branch: string | null;
  position: number;
  status: MergeQueueStatus;
  conflict_files: string[];
  updated_at: number;
}

export interface GoalDiskUsage {
  goal_id: string;
  project_id: string;
  title: string;
  state: LifecycleState;
  workspace_bytes: number;
  verify_bytes: number;
  tmp_bytes: number;
  cache_bytes: number;
  total_bytes: number;
  reclaimable: boolean;
}

export interface StorageInventory {
  total_bytes: number;
  reclaimable_bytes: number;
  goals: GoalDiskUsage[];
}

export interface EngineDescriptor {
  id: string;
  label: string;
  trust_tier: EngineTrustTier;
  installed: boolean;
  available: boolean;
  note: string;
}

export interface SandboxPosture {
  backend_name: string;
  microvm_available: boolean;
  warnings: string[];
}

export interface UpdateCheckResult {
  configured: boolean;
  available: boolean;
  current_version: string;
  latest_version: string | null;
  notes: string | null;
  error: string | null;
}

export interface HoldoutDraft {
  id: string;
  filename: string;
  rationale: string;
  code: string;
}

export type SettingsExt = Settings & {
  default_escalation_model?: string;
  default_escalation_after_reworks?: number;
  default_sandbox_tier?: SandboxTier;
  flaky_rerun?: boolean;
};

export type GoalSummaryExt = GoalSummary & {
  sandbox_tier?: SandboxTier;
  port_base?: number;
  depends_on?: string[];
};

export type GoalDetailExt = GoalDetail & {
  attachments?: AttachmentRef[];
  merge_queue_position?: number;
  escalated_model?: string;
};

export type LookViewExt = LookView & {
  console_errors?: string[];
  mobile_base?: string | null;
  mobile_pin?: string | null;
};

export type CriterionResultExt = CriterionResultView & {
  flaky?: boolean;
  console_errors?: string[];
  mobile_look?: LookViewExt | null;
};

export type ReviewViewExt = ReviewView & {
  snapshots?: SnapshotPoint[];
};
