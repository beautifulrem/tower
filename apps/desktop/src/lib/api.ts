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
import type { RemoteInfo } from "../gen/RemoteInfo";
import type { PushStatus } from "../gen/PushStatus";
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
  /** Open items put aside until later, so the inbox can say where they went. */
  snoozedInbox: () => invoke<InboxItem[]>("snoozed_inbox"),
  review: (id: string, since: string | null = null) => invoke<ReviewView>("review", { id, since }),
  openFile: (id: string, path: string, line: number | null) => invoke<void>("open_file", { id, path, line }),
  /** One whole file on the base side (`old`) or in the reviewed snapshot; null when absent on that side. */
  fileText: (id: string, path: string, old: boolean, pin: string | null) =>
    invoke<string | null>("file_text", { id, path, old, pin }),

  settings: () => invoke<Settings>("settings"),
  saveSettings: (settings: Settings) => invoke<void>("save_settings", { settings }),
  /** Opens Terminal running Pi, where `/login` connects a model account. */
  openPiLogin: () => invoke<void>("open_pi_login"),
  /** Re-runs the project's test command on its base branch. */
  checkProject: (id: string) => invoke<void>("check_project", { id }),
  models: () => invoke<ModelInfo[]>("models"),
  validateContract: (contract: Contract) => invoke<ContractIssue[]>("validate_contract", { contract }),

  createGoal: (input: NewGoalInput) => invoke<GoalSummary>("create_goal", { input }),
  /** A demo repository and goal on the bundled demo engine; needs Node.js, no Pi or credentials. */
  startDemo: () => invoke<GoalSummary>("start_demo"),
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
  /** Approves or rejects an assumption, with a note to the agent either way. */
  answerAssumption: (inboxId: string, approved: boolean, note: string) =>
    invoke<void>("answer_assumption", { inboxId, approved, note }),
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
  /** Undoes hunk `hunk` (0-based, in ReviewView order) of `path` in the workspace; paused or in review only. */
  revertHunk: (id: string, path: string, hunk: number) => invoke<void>("revert_hunk", { id, path, hunk }),
  /** Puts the workspace back to where run `runNo` started; paused or in review only. */
  rollback: (id: string, runNo: number) => invoke<void>("rollback", { id, runNo }),
  /** Restores the workspace to just before the latest rollback. */
  undoRollback: (id: string) => invoke<void>("undo_rollback", { id }),
  /** Writes one workspace file with your text (an edit in review); paused or in review only. */
  writeFile: (id: string, path: string, text: string) => invoke<void>("write_file", { id, path, text }),
  /** Hides a decision until `until` (ms since the epoch); null brings it back. */
  snooze: (inboxId: string, until: number | null) => invoke<void>("snooze", { inboxId, until }),

  /** How to open the phone page: links (Tailscale first), a QR code, whether the transport is encrypted. */
  remoteInfo: () => invoke<RemoteInfo>("remote_info"),
  /** A new pairing token: every phone has to pair again. */
  resetRemoteToken: () => invoke<void>("reset_remote_token"),
  testPush: () => invoke<void>("test_push"),
  pushStatus: () => invoke<PushStatus | null>("push_status"),
  /** A `look` criterion's screenshot as a PNG data URL, or null when the file is gone. */
  lookImage: (file: string) => invoke<string | null>("look_image", { file }),

  /** Per-goal interface state (viewed files, draft comments, last reviewed pin), kept in SQLite. */
  uiState: (id: string) => invoke<Record<string, string>>("ui_state", { id }),
  setUiState: (id: string, key: string, value: string | null) => invoke<void>("set_ui_state", { id, key, value }),
};

export function onUpdate(handler: (u: UiUpdate) => void): Promise<UnlistenFn> {
  return listen<UiUpdate>("tower://update", (e) => handler(e.payload));
}

/** A route to open (`goal/G-0003`), sent when a notification brings Tower to the front. */
export function onOpen(handler: (route: string) => void): Promise<UnlistenFn> {
  return listen<string>("tower://open", (e) => handler(e.payload));
}

/** Errors from commands arrive as plain strings. */
export function errorText(e: unknown): string {
  if (typeof e === "string") return e;
  if (e instanceof Error) return e.message;
  return String(e);
}
