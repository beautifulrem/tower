//! Tower's desktop shell: a thin Tauri layer over the supervisor.
//!
//! Commands map one-to-one onto `Supervisor` methods; updates flow back as
//! a single `tower://update` event. The renderer holds no authoritative
//! state (`ADR-005`).

use std::path::PathBuf;
use std::sync::Arc;

use tauri::{AppHandle, Emitter, Manager, RunEvent, State};
use tower_core::contract::{Contract, ContractIssue};
use tower_core::view::{
    EnvironmentStatus, GoalDetail, GoalSummary, InboxItem, ModelInfo, ProjectView, ReviewView, Settings, TraceEntry,
};
use tower_supervisor::{Config, Error, NewGoalInput, Paths, ReviewComment, Supervisor, UiSink, UiUpdate};

const UPDATE_EVENT: &str = "tower://update";

struct TauriSink(AppHandle);

impl UiSink for TauriSink {
    fn emit(&self, update: UiUpdate) {
        let _ = self.0.emit(UPDATE_EVENT, update);
    }
}

type Sup<'a> = State<'a, Supervisor>;
type Res<T> = Result<T, Error>;

#[tauri::command]
fn environment(sup: Sup<'_>) -> EnvironmentStatus {
    sup.environment()
}

#[tauri::command]
fn projects(sup: Sup<'_>) -> Res<Vec<ProjectView>> {
    sup.projects()
}

#[tauri::command]
async fn add_project(sup: Sup<'_>, path: String) -> Res<ProjectView> {
    sup.add_project(&path).await
}

#[tauri::command]
fn update_project(sup: Sup<'_>, id: String, base_branch: String, test_command: Option<String>) -> Res<ProjectView> {
    sup.update_project(&id, &base_branch, test_command.as_deref())
}

#[tauri::command]
fn remove_project(sup: Sup<'_>, id: String) -> Res<()> {
    sup.remove_project(&id)
}

#[tauri::command]
fn goals(sup: Sup<'_>) -> Res<Vec<GoalSummary>> {
    sup.goals()
}

#[tauri::command]
fn goal(sup: Sup<'_>, id: String) -> Res<GoalDetail> {
    sup.goal(&id)
}

#[tauri::command]
fn mark_viewed(sup: Sup<'_>, id: String) -> Res<()> {
    sup.mark_viewed(&id)
}

#[tauri::command]
fn trace(sup: Sup<'_>, id: String, before: Option<i64>, limit: u32) -> Res<Vec<TraceEntry>> {
    sup.trace(&id, before, limit)
}

#[tauri::command]
fn inbox(sup: Sup<'_>) -> Res<Vec<InboxItem>> {
    sup.inbox()
}

#[tauri::command]
async fn review(sup: Sup<'_>, id: String) -> Res<ReviewView> {
    sup.review(&id).await
}

#[tauri::command]
fn settings(sup: Sup<'_>) -> Settings {
    sup.settings()
}

#[tauri::command]
fn save_settings(sup: Sup<'_>, settings: Settings) -> Res<()> {
    sup.save_settings(settings)
}

#[tauri::command]
async fn models(sup: Sup<'_>) -> Res<Vec<ModelInfo>> {
    sup.models().await
}

#[tauri::command]
fn validate_contract(sup: Sup<'_>, contract: Contract) -> Vec<ContractIssue> {
    sup.validate_contract(&contract)
}

#[tauri::command]
async fn create_goal(sup: Sup<'_>, input: NewGoalInput) -> Res<GoalSummary> {
    sup.create_goal(input).await
}

#[tauri::command]
async fn quick_goal(sup: Sup<'_>, project_id: String, intent: String) -> Res<GoalSummary> {
    sup.quick_goal(&project_id, &intent).await
}

#[tauri::command]
fn update_draft(sup: Sup<'_>, id: String, title: String, contract: Contract) -> Res<()> {
    sup.update_draft(&id, &title, &contract)
}

#[tauri::command]
async fn ratify(sup: Sup<'_>, id: String) -> Res<()> {
    sup.ratify(&id).await
}

#[tauri::command]
fn amend_contract(sup: Sup<'_>, id: String, contract: Contract) -> Res<()> {
    sup.amend_contract(&id, contract)
}

#[tauri::command]
async fn pause(sup: Sup<'_>, id: String) -> Res<()> {
    sup.pause(&id).await
}

#[tauri::command]
async fn resume(sup: Sup<'_>, id: String) -> Res<()> {
    sup.resume(&id).await
}

#[tauri::command]
async fn abandon(sup: Sup<'_>, id: String) -> Res<()> {
    sup.abandon(&id).await
}

#[tauri::command]
async fn steer(sup: Sup<'_>, id: String, text: String) -> Res<String> {
    sup.steer(&id, &text).await
}

#[tauri::command]
async fn answer(sup: Sup<'_>, inbox_id: String, response: String) -> Res<()> {
    sup.answer(&inbox_id, &response).await
}

#[tauri::command]
async fn retry_verify(sup: Sup<'_>, id: String) -> Res<()> {
    sup.retry_verify(&id).await
}

#[tauri::command]
async fn request_changes(sup: Sup<'_>, id: String, summary: String, comments: Vec<ReviewComment>) -> Res<()> {
    sup.request_changes(&id, &summary, comments).await
}

#[tauri::command]
async fn accept(sup: Sup<'_>, id: String) -> Res<String> {
    sup.accept(&id).await
}

#[tauri::command]
fn archive(sup: Sup<'_>, id: String) -> Res<()> {
    sup.archive(&id)
}

#[tauri::command]
async fn check_integration(sup: Sup<'_>) -> Res<()> {
    sup.check_integration().await
}

#[tauri::command]
fn human_check(sup: Sup<'_>, id: String, criterion: String, checked: bool) -> Res<()> {
    sup.human_check(&id, &criterion, checked)
}

#[tauri::command]
async fn review_claim(sup: Sup<'_>, id: String, claim_id: String, approved: bool, note: String) -> Res<()> {
    sup.review_claim(&id, &claim_id, approved, &note).await
}

/// The bundled extension in a packaged app, else the repository copy.
fn extension_source(app: &AppHandle) -> PathBuf {
    if let Ok(dir) = app.path().resource_dir() {
        let bundled = dir.join("tower-goal");
        if bundled.join("index.ts").exists() {
            return bundled;
        }
    }
    PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../../../extensions/tower-goal")
}

pub fn run() {
    tracing_subscriber::fmt()
        .with_env_filter(tracing_subscriber::EnvFilter::try_from_default_env().unwrap_or_else(|_| "info".into()))
        .init();

    let app = tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            let handle = app.handle().clone();
            let config = Config {
                paths: Paths::new(Paths::default_root()),
                extension_source: extension_source(&handle),
                env: None,
            };
            let sink: Arc<dyn UiSink> = Arc::new(TauriSink(handle.clone()));
            let sup = tauri::async_runtime::block_on(Supervisor::start(config, sink))?;
            app.manage(sup);
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            environment,
            projects,
            add_project,
            update_project,
            remove_project,
            goals,
            goal,
            mark_viewed,
            trace,
            inbox,
            review,
            settings,
            save_settings,
            models,
            validate_contract,
            create_goal,
            quick_goal,
            update_draft,
            ratify,
            amend_contract,
            pause,
            resume,
            abandon,
            steer,
            answer,
            retry_verify,
            request_changes,
            accept,
            archive,
            check_integration,
            human_check,
            review_claim,
        ])
        .build(tauri::generate_context!())
        .expect("failed to build Tower");

    app.run(|handle, event| {
        if let RunEvent::ExitRequested { .. } = event {
            // Quitting pauses running goals so they resume next launch (ADR-017).
            if let Some(sup) = handle.try_state::<Supervisor>() {
                let sup = sup.inner().clone();
                tauri::async_runtime::block_on(sup.shutdown());
            }
        }
    });
}
