//! Tower's desktop shell: a thin Tauri layer over the supervisor.
//!
//! Commands map one-to-one onto `Supervisor` methods; updates flow back as
//! a single `tower://update` event. The renderer holds no authoritative
//! state (`ADR-005`).

mod menu;

use std::collections::HashSet;
use std::path::PathBuf;
use std::sync::{Arc, Mutex};

use tauri::{AppHandle, Emitter, Manager, RunEvent, State};
use tauri_plugin_notification::NotificationExt;
use tower_core::contract::{Contract, ContractIssue};
use tower_core::tr;
use tower_core::view::{
    EnvironmentStatus, GoalDetail, GoalSummary, InboxItem, InboxKind, ModelInfo, ProjectView, ReviewView, Settings,
    TraceEntry,
};
use tower_store::ProjectPatch;
use tower_supervisor::{Config, Error, NewGoalInput, OpenTarget, Paths, ReviewComment, Supervisor, UiSink, UiUpdate};

const UPDATE_EVENT: &str = "tower://update";

struct TauriSink {
    app: AppHandle,
    /// Inbox items already announced, so each one notifies at most once.
    seen: Mutex<HashSet<String>>,
}

impl TauriSink {
    /// The attention ladder (docs/08): the Dock badge always counts open
    /// items; a system notification is sent only for items that block a run
    /// or need a way out, and only when Tower is not in front.
    fn on_inbox(&self, items: &[InboxItem]) {
        if let Some(window) = self.app.get_webview_window("main") {
            let _ = window.set_badge_count((!items.is_empty()).then_some(items.len() as i64));
            let focused = window.is_focused().unwrap_or(false);
            let mut seen = self.seen.lock().expect("seen lock");
            for item in items {
                if !seen.insert(item.id.clone()) || focused {
                    continue;
                }
                let urgent = matches!(
                    item.kind,
                    InboxKind::Question | InboxKind::Approval | InboxKind::Paused | InboxKind::Stalled
                );
                if urgent {
                    let lang = self.app.try_state::<Supervisor>().map(|s| s.lang()).unwrap_or_default();
                    let goal = &item.goal_id;
                    let _ = self
                        .app
                        .notification()
                        .builder()
                        .title(tr!(lang, "{goal} 需要你", "{goal} needs you"))
                        .body(&item.title)
                        .show();
                }
            }
        }
    }
}

impl UiSink for TauriSink {
    fn emit(&self, update: UiUpdate) {
        if let UiUpdate::Inbox { items } = &update {
            self.on_inbox(items);
        }
        let _ = self.app.emit(UPDATE_EVENT, update);
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
fn update_project(sup: Sup<'_>, id: String, patch: ProjectPatch) -> Res<ProjectView> {
    sup.update_project(&id, &patch)
}

#[tauri::command]
async fn push(sup: Sup<'_>, id: String, open_pr: bool) -> Res<Option<String>> {
    sup.push(&id, open_pr).await
}

#[tauri::command]
fn open_workspace(sup: Sup<'_>, id: String, target: OpenTarget) -> Res<()> {
    sup.open_workspace(&id, target)
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
async fn review(sup: Sup<'_>, id: String, since: Option<String>) -> Res<ReviewView> {
    sup.review(&id, since).await
}

#[tauri::command]
fn open_file(sup: Sup<'_>, id: String, path: String, line: Option<u32>) -> Res<()> {
    sup.open_file(&id, &path, line)
}

#[tauri::command]
fn settings(sup: Sup<'_>) -> Settings {
    sup.settings()
}

/// Saves settings; a language change also rebuilds the native menu so the
/// whole app switches at once.
#[tauri::command]
fn save_settings(app: AppHandle, sup: Sup<'_>, settings: Settings) -> Res<()> {
    let before = sup.lang();
    sup.save_settings(settings)?;
    let lang = sup.lang();
    if lang != before {
        match menu::build(&app, lang).and_then(|m| app.set_menu(m)) {
            Ok(_) => {}
            Err(e) => tracing::warn!(error = %e, "could not rebuild the menu"),
        }
    }
    Ok(())
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
async fn remove_workspace(sup: Sup<'_>, id: String) -> Res<()> {
    sup.remove_workspace(&id).await
}

#[tauri::command]
fn human_check(sup: Sup<'_>, id: String, criterion: String, checked: bool) -> Res<()> {
    sup.human_check(&id, &criterion, checked)
}

#[tauri::command]
async fn review_claim(sup: Sup<'_>, id: String, claim_id: String, approved: bool, note: String) -> Res<()> {
    sup.review_claim(&id, &claim_id, approved, &note).await
}

/// A view to open at launch, from `TOWER_OPEN` (e.g. `goal/G-0001`,
/// `review/G-0001`, `inbox`, `settings`, `new`).
#[tauri::command]
fn startup_route() -> Option<String> {
    std::env::var("TOWER_OPEN").ok().filter(|s| !s.is_empty())
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
        .plugin(tauri_plugin_notification::init())
        .setup(|app| {
            let handle = app.handle().clone();
            let config = Config {
                paths: Paths::new(Paths::default_root()),
                extension_source: extension_source(&handle),
                env: None,
            };
            let sink = Arc::new(TauriSink { app: handle.clone(), seen: Mutex::default() });
            let sup = tauri::async_runtime::block_on(Supervisor::start(config, sink.clone() as Arc<dyn UiSink>))?;
            // The menu speaks the settings language, so it is built once they are readable.
            app.set_menu(menu::build(&handle, sup.lang())?)?;
            app.on_menu_event(|app, event| menu::forward(app, event.id().as_ref()));
            // Items already open at launch were announced before: badge them, don't notify again.
            if let Ok(items) = sup.inbox() {
                sink.seen.lock().expect("seen lock").extend(items.iter().map(|i| i.id.clone()));
                if let Some(window) = handle.get_webview_window("main") {
                    let _ = window.set_badge_count((!items.is_empty()).then_some(items.len() as i64));
                }
            }
            app.manage(sup);
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            startup_route,
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
            remove_workspace,
            push,
            open_workspace,
            open_file,
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
