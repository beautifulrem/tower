//! Tauri commands for review timeline diffs, multimodal attachments, learning
//! loop, scheduled goals, merge queue, storage inventory, engine/sandbox posture,
//! and human-ratified holdout drafts (1:1 over `Supervisor`).

use tauri::State;
use tower_core::contract::AttachmentRef;
use tower_core::view::{
    CalibrationRow, EngineDescriptor, GoalSummary, HoldoutDraft, MemoryProposal, MergeQueueEntry, ProposalStatus,
    ReviewView, SandboxPosture, ScheduledGoal, SnapshotPoint, StorageInventory,
};
use tower_supervisor::{Error, NewScheduledGoalInput, Supervisor};

type Sup<'a> = State<'a, Supervisor>;
type Res<T> = Result<T, Error>;

// ---- review timeline --------------------------------------------------------

#[tauri::command]
pub async fn compare_snapshots(sup: Sup<'_>, id: String, from_rev: String, to_rev: String) -> Res<ReviewView> {
    sup.compare_snapshots(&id, &from_rev, &to_rev).await
}

#[tauri::command]
pub async fn list_snapshots(sup: Sup<'_>, id: String) -> Res<Vec<SnapshotPoint>> {
    sup.list_snapshots(&id).await
}

// ---- multimodal attachments & @file -----------------------------------------

#[tauri::command]
pub fn save_attachment(sup: Sup<'_>, goal_id: String, name: String, data_base64: String) -> Res<AttachmentRef> {
    sup.save_attachment(&goal_id, &name, &data_base64)
}

#[tauri::command]
pub fn attachment_data_url(sup: Sup<'_>, goal_id: String, path: String) -> Option<String> {
    sup.attachment_data_url(&goal_id, &path)
}

#[tauri::command]
pub fn delete_attachment(sup: Sup<'_>, goal_id: String, attachment_id: String) -> Res<()> {
    sup.delete_attachment(&goal_id, &attachment_id)
}

#[tauri::command]
pub async fn workspace_files(sup: Sup<'_>, id: String) -> Res<Vec<String>> {
    sup.workspace_files(&id).await
}

// ---- learning loop & calibration --------------------------------------------

#[tauri::command]
pub fn memory_proposals(sup: Sup<'_>, status: Option<ProposalStatus>) -> Res<Vec<MemoryProposal>> {
    sup.memory_proposals(status)
}

#[tauri::command]
pub fn approve_proposal(
    sup: Sup<'_>,
    id: String,
    edited_text: Option<String>,
    confirmed_phrase: Option<String>,
) -> Res<MemoryProposal> {
    sup.approve_proposal(&id, edited_text.as_deref(), confirmed_phrase.as_deref())
}

#[tauri::command]
pub fn reject_proposal(sup: Sup<'_>, id: String, reason: Option<String>) -> Res<()> {
    sup.reject_proposal(&id, reason.as_deref())
}

#[tauri::command]
pub fn calibration_rows(sup: Sup<'_>, project_id: Option<String>) -> Res<Vec<CalibrationRow>> {
    sup.calibration_rows(project_id.as_deref())
}

// ---- scheduled goals --------------------------------------------------------

#[tauri::command]
pub fn scheduled_goals(sup: Sup<'_>) -> Res<Vec<ScheduledGoal>> {
    sup.scheduled_goals()
}

#[tauri::command]
pub fn create_scheduled_goal(sup: Sup<'_>, input: NewScheduledGoalInput) -> Res<ScheduledGoal> {
    sup.create_scheduled_goal(input)
}

#[tauri::command]
pub fn toggle_scheduled_goal(sup: Sup<'_>, id: String, enabled: bool) -> Res<ScheduledGoal> {
    sup.toggle_scheduled_goal(&id, enabled)
}

#[tauri::command]
pub fn delete_scheduled_goal(sup: Sup<'_>, id: String) -> Res<()> {
    sup.delete_scheduled_goal(&id)
}

#[tauri::command]
pub async fn run_scheduled_goal_now(sup: Sup<'_>, id: String) -> Res<GoalSummary> {
    sup.run_scheduled_goal_now(&id).await
}

// ---- merge queue ------------------------------------------------------------

#[tauri::command]
pub fn merge_queue(sup: Sup<'_>, project_id: Option<String>) -> Res<Vec<MergeQueueEntry>> {
    sup.merge_queue(project_id.as_deref())
}

#[tauri::command]
pub async fn enqueue_merge(sup: Sup<'_>, goal_id: String) -> Res<MergeQueueEntry> {
    sup.enqueue_merge(&goal_id).await
}

#[tauri::command]
pub async fn reorder_merge_queue(sup: Sup<'_>, project_id: String, goal_ids: Vec<String>) -> Res<Vec<MergeQueueEntry>> {
    sup.reorder_merge_queue(&project_id, goal_ids).await
}

#[tauri::command]
pub fn remove_from_merge_queue(sup: Sup<'_>, goal_id: String) -> Res<()> {
    sup.remove_from_merge_queue(&goal_id)
}

#[tauri::command]
pub async fn check_merge_queue(sup: Sup<'_>, project_id: String) -> Res<Vec<MergeQueueEntry>> {
    sup.check_merge_queue(&project_id).await
}

#[tauri::command]
pub async fn reverify_merge_queue_entry(sup: Sup<'_>, goal_id: String) -> Res<()> {
    sup.reverify_merge_queue_entry(&goal_id).await
}

// ---- storage, posture & synthetic holdout drafts ----------------------------

#[tauri::command]
pub async fn storage_inventory(sup: Sup<'_>) -> Res<StorageInventory> {
    sup.storage_inventory().await
}

#[tauri::command]
pub async fn reclaim_storage(sup: Sup<'_>, goal_ids: Vec<String>) -> Res<u64> {
    sup.reclaim_storage(goal_ids).await
}

#[tauri::command]
pub fn engines(sup: Sup<'_>) -> Vec<EngineDescriptor> {
    sup.engines()
}

#[tauri::command]
pub fn sandbox_posture(sup: Sup<'_>) -> SandboxPosture {
    sup.sandbox_posture()
}

#[tauri::command]
pub async fn generate_holdout_drafts(sup: Sup<'_>, project_id: String, intent: String) -> Res<Vec<HoldoutDraft>> {
    sup.generate_holdout_drafts(&project_id, &intent).await
}

#[tauri::command]
pub async fn ratify_holdout_draft(sup: Sup<'_>, project_id: String, filename: String, code: String) -> Res<String> {
    sup.ratify_holdout_draft(&project_id, &filename, &code).await
}
