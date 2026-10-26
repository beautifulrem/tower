/**
 * Typed bridge to the supervisor. Every call maps to one Tauri command; the
 * renderer never computes authoritative state.
 */
import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";

import type { Contract } from "../gen/Contract";
import type { ContractIssue } from "../gen/ContractIssue";
import type { EnvironmentStatus } from "../gen/EnvironmentStatus";
import type { GoalDetail } from "../gen/GoalDetail";
import type { GoalSummary } from "../gen/GoalSummary";
import type { InboxItem } from "../gen/InboxItem";
import type { ModelInfo } from "../gen/ModelInfo";
import type { NewGoalInput } from "../gen/NewGoalInput";
import type { OpenTarget } from "../gen/OpenTarget";
import type { ProjectPatch } from "../gen/ProjectPatch";
import type { ProjectView } from "../gen/ProjectView";
import type { ReviewComment } from "../gen/ReviewComment";
import type { ReviewView } from "../gen/ReviewView";
import type { Settings } from "../gen/Settings";
import type { TraceEntry } from "../gen/TraceEntry";
import type { UiUpdate } from "../gen/UiUpdate";

export const api = {
  startupRoute: () => invoke<string | null>("startup_route"),
  environment: () => invoke<EnvironmentStatus>("environment"),
  projects: () => invoke<ProjectView[]>("projects"),
  addProject: (path: string) => invoke<ProjectView>("add_project", { path }),
  updateProject: (id: string, patch: ProjectPatch) => invoke<ProjectView>("update_project", { id, patch }),
  push: (id: string, openPr: boolean) => invoke<string | null>("push", { id, openPr }),
  openWorkspace: (id: string, target: OpenTarget) => invoke<void>("open_workspace", { id, target }),
  removeProject: (id: string) => invoke<void>("remove_project", { id }),

  goals: () => invoke<GoalSummary[]>("goals"),
  goal: (id: string) => invoke<GoalDetail>("goal", { id }),
  markViewed: (id: string) => invoke<void>("mark_viewed", { id }),
  trace: (id: string, before: number | null, limit: number) =>
    invoke<TraceEntry[]>("trace", { id, before, limit }),
  inbox: () => invoke<InboxItem[]>("inbox"),
  review: (id: string, since: string | null = null) => invoke<ReviewView>("review", { id, since }),
  openFile: (id: string, path: string, line: number | null) => invoke<void>("open_file", { id, path, line }),

  settings: () => invoke<Settings>("settings"),
  saveSettings: (settings: Settings) => invoke<void>("save_settings", { settings }),
  models: () => invoke<ModelInfo[]>("models"),
  validateContract: (contract: Contract) => invoke<ContractIssue[]>("validate_contract", { contract }),

  createGoal: (input: NewGoalInput) => invoke<GoalSummary>("create_goal", { input }),
  quickGoal: (projectId: string, intent: string) => invoke<GoalSummary>("quick_goal", { projectId, intent }),
  updateDraft: (id: string, title: string, contract: Contract) =>
    invoke<void>("update_draft", { id, title, contract }),
  ratify: (id: string) => invoke<void>("ratify", { id }),
  amendContract: (id: string, contract: Contract) => invoke<void>("amend_contract", { id, contract }),

  pause: (id: string) => invoke<void>("pause", { id }),
  resume: (id: string) => invoke<void>("resume", { id }),
  abandon: (id: string) => invoke<void>("abandon", { id }),
  steer: (id: string, text: string) => invoke<string>("steer", { id, text }),
  answer: (inboxId: string, response: string) => invoke<void>("answer", { inboxId, response }),
  retryVerify: (id: string) => invoke<void>("retry_verify", { id }),
  requestChanges: (id: string, summary: string, comments: ReviewComment[]) =>
    invoke<void>("request_changes", { id, summary, comments }),
  accept: (id: string) => invoke<string>("accept", { id }),
  archive: (id: string) => invoke<void>("archive", { id }),
  checkIntegration: () => invoke<void>("check_integration"),
  humanCheck: (id: string, criterion: string, checked: boolean) =>
    invoke<void>("human_check", { id, criterion, checked }),
  removeWorkspace: (id: string) => invoke<void>("remove_workspace", { id }),
  reviewClaim: (id: string, claimId: string, approved: boolean, note: string) =>
    invoke<void>("review_claim", { id, claimId, approved, note }),
};

export function onUpdate(handler: (u: UiUpdate) => void): Promise<UnlistenFn> {
  return listen<UiUpdate>("tower://update", (e) => handler(e.payload));
}

/** Errors from commands arrive as plain strings. */
export function errorText(e: unknown): string {
  if (typeof e === "string") return e;
  if (e instanceof Error) return e.message;
  return String(e);
}
