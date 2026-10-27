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
    EnvironmentStatus, GoalDetail, GoalSummary, InboxItem, InboxKind, ModelInfo, ProjectView, RemoteInfo, ReviewView,
    Settings, TraceEntry,
};
use tower_store::ProjectPatch;
use tower_supervisor::{Config, Error, NewGoalInput, OpenTarget, Paths, ReviewComment, Supervisor, UiSink, UiUpdate};

const UPDATE_EVENT: &str = "tower://update";
/// Asks the interface to open a route (e.g. `goal/G-0001`).
const OPEN_EVENT: &str = "tower://open";

#[derive(Default)]
struct TauriSink {
    app: Option<AppHandle>,
    /// Inbox items already announced, so each one notifies at most once.
    seen: Mutex<HashSet<String>>,
    /// The goal of the latest notification. Notifications on macOS cannot
    /// carry a click action here, so the next time Tower comes to the front
    /// it opens that goal.
    pending_open: Mutex<Option<(String, std::time::Instant)>>,
}

/// Items that hold up a goal until the human acts. Review-ready items wait
/// for you but block nothing; they are counted separately in the interface.
fn blocking(kind: InboxKind) -> bool {
    !matches!(kind, InboxKind::ReviewReady)
}

fn badge(window: &tauri::WebviewWindow, items: &[InboxItem]) {
    let n = items.iter().filter(|i| blocking(i.kind)).count();
    let _ = window.set_badge_count((n > 0).then_some(n as i64));
}

/// At most `max` columns (CJK counts two), with an ellipsis when cut.
fn clip(s: &str, max: usize) -> String {
    let mut out = String::new();
    let mut w = 0;
    for c in s.chars() {
        let cw = if (c as u32) >= 0x2E80 { 2 } else { 1 };
        if w + cw > max {
            return format!("{}…", out.trim_end());
        }
        out.push(c);
        w += cw;
    }
    out
}

impl TauriSink {
    /// The attention ladder (docs/08): the Dock badge counts items that block
    /// a goal; a system notification is sent only for items that block a run
    /// or need a way out, and only when Tower is not in front.
    fn on_inbox(&self, items: &[InboxItem]) {
        let Some(app) = &self.app else { return };
        let Some(window) = app.get_webview_window("main") else { return };
        badge(&window, items);
        let focused = window.is_focused().unwrap_or(false);
        let settings = app.try_state::<Supervisor>().map(|s| s.settings());
        let quiet = settings.as_ref().is_some_and(tower_supervisor::is_quiet);
        let mut seen = self.seen.lock().unwrap_or_else(std::sync::PoisonError::into_inner);
        // Forget items no longer open (answered, or snoozed): a snoozed item
        // that comes back is announced again.
        seen.retain(|id| items.iter().any(|i| &i.id == id));
        for item in items {
            let muted = settings.as_ref().is_some_and(|s| s.muted_goals.contains(&item.goal_id));
            // While quiet nothing is marked as announced: items that waited
            // are announced on the next update after the quiet ends.
            if quiet || !seen.insert(item.id.clone()) || focused || muted {
                continue;
            }
            let urgent = matches!(
                item.kind,
                InboxKind::Question
                    | InboxKind::Approval
                    | InboxKind::Paused
                    | InboxKind::Stalled
                    | InboxKind::CiFailed
            );
            if !urgent {
                continue;
            }
            let lang = app.try_state::<Supervisor>().map(|s| s.lang()).unwrap_or_default();
            // People remember goals by what they are about, not by number.
            let title =
                if item.goal_title.trim().is_empty() { item.goal_id.clone() } else { clip(&item.goal_title, 40) };
            let what = match item.kind {
                InboxKind::Question => tr!(lang, "提问", "Question"),
                InboxKind::Approval => tr!(lang, "需要批准", "Approval"),
                InboxKind::Paused => tr!(lang, "已暂停", "Paused"),
                InboxKind::CiFailed => tr!(lang, "CI 未通过", "CI failed"),
                _ => tr!(lang, "可能卡住", "May be stuck"),
            };
            let _ = app.notification().builder().title(title).body(format!("{what} · {}", item.title)).show();
            *self.pending_open.lock().unwrap_or_else(std::sync::PoisonError::into_inner) =
                Some((format!("goal/{}", item.goal_id), std::time::Instant::now()));
        }
    }

    /// Coming to the front within two minutes of a notification is taken as
    /// answering it; later, it is just switching apps.
    fn on_focus(&self) {
        let pending = self.pending_open.lock().unwrap_or_else(std::sync::PoisonError::into_inner).take();
        let route = pending.filter(|(_, at)| at.elapsed() < std::time::Duration::from_secs(120)).map(|(r, _)| r);
        if let (Some(app), Some(route)) = (&self.app, route) {
            let _ = app.emit(OPEN_EVENT, route);
        }
    }
}

impl UiSink for TauriSink {
    fn emit(&self, update: UiUpdate) {
        if let UiUpdate::Inbox { items, .. } = &update {
            self.on_inbox(items);
        }
        if let Some(app) = &self.app {
            let _ = app.emit(UPDATE_EVENT, update);
        }
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
fn ui_state(sup: Sup<'_>, id: String) -> Res<std::collections::BTreeMap<String, String>> {
    sup.ui_state(&id)
}

#[tauri::command]
fn set_ui_state(sup: Sup<'_>, id: String, key: String, value: Option<String>) -> Res<()> {
    sup.set_ui_state(&id, &key, value.as_deref())
}

#[tauri::command]
async fn file_text(sup: Sup<'_>, id: String, path: String, old: bool, pin: Option<String>) -> Res<Option<String>> {
    sup.file_text(&id, &path, old, pin).await
}

/// Opens Terminal running Pi, where `/login` connects a model account.
#[tauri::command]
fn open_pi_login(sup: Sup<'_>) -> Res<()> {
    let pi = sup.environment().pi_path.unwrap_or_else(|| "pi".into());
    let quoted = format!("'{}'", pi.replace('\'', "'\\''"));
    let script = format!(
        "tell application \"Terminal\"\n  activate\n  do script \"{}\"\nend tell",
        quoted.replace('\\', "\\\\").replace('"', "\\\"")
    );
    std::process::Command::new("/usr/bin/osascript").args(["-e", &script]).spawn().map(|_| ()).map_err(Error::Io)
}

#[tauri::command]
async fn rollback(sup: Sup<'_>, id: String, run_no: u32) -> Res<()> {
    sup.rollback(&id, run_no).await
}

#[tauri::command]
async fn revert_hunk(sup: Sup<'_>, id: String, path: String, hunk: usize) -> Res<()> {
    sup.revert_hunk(&id, &path, hunk).await
}

#[tauri::command]
fn check_project(sup: Sup<'_>, id: String) -> Res<()> {
    sup.check_project(&id)
}

#[tauri::command]
fn snooze(sup: Sup<'_>, inbox_id: String, until: Option<i64>) -> Res<()> {
    sup.snooze(&inbox_id, until)
}

#[tauri::command]
async fn undo_rollback(sup: Sup<'_>, id: String) -> Res<()> {
    sup.undo_rollback(&id).await
}

#[tauri::command]
async fn write_file(sup: Sup<'_>, id: String, path: String, text: String) -> Res<()> {
    sup.write_file(&id, &path, &text).await
}

#[tauri::command]
fn remote_info(sup: Sup<'_>) -> RemoteInfo {
    sup.remote_info()
}

#[tauri::command]
fn reset_remote_token(sup: Sup<'_>) -> Res<()> {
    sup.reset_remote_token()
}

#[tauri::command]
fn set_git_identity(sup: Sup<'_>, name: String, email: String, project_id: Option<String>) -> Res<()> {
    sup.set_git_identity(&name, &email, project_id.as_deref())
}

#[tauri::command]
async fn test_push(sup: Sup<'_>) -> Res<()> {
    sup.test_push().await
}

#[tauri::command]
fn push_status(sup: Sup<'_>) -> Option<tower_core::view::PushStatus> {
    sup.push_status()
}

#[tauri::command]
fn look_image(sup: Sup<'_>, file: String) -> Option<String> {
    sup.look_image(&file)
}

#[tauri::command]
fn export_diagnostics(sup: Sup<'_>) -> Res<String> {
    sup.export_diagnostics().map(|p| p.display().to_string())
}

#[tauri::command]
fn snoozed_inbox(sup: Sup<'_>) -> Res<Vec<InboxItem>> {
    sup.snoozed_inbox()
}

#[tauri::command]
async fn start_demo(sup: Sup<'_>) -> Res<GoalSummary> {
    sup.start_demo().await
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
async fn answer_assumption(sup: Sup<'_>, inbox_id: String, approved: bool, note: String) -> Res<()> {
    sup.answer_assumption(&inbox_id, approved, &note).await
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
fn demo_engine_source(app: &AppHandle) -> PathBuf {
    if let Ok(dir) = app.path().resource_dir() {
        let bundled = dir.join("demo-engine/demo_pi.py");
        if bundled.is_file() {
            return bundled;
        }
    }
    PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../../../tools/demo-engine/demo_pi.py")
}

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
                demo_engine: Some(demo_engine_source(&handle)),
            };
            let sink = Arc::new(TauriSink { app: Some(handle.clone()), ..TauriSink::default() });
            let sup = tauri::async_runtime::block_on(Supervisor::start(config, sink.clone() as Arc<dyn UiSink>))?;
            // The menu speaks the settings language, so it is built once they are readable.
            app.set_menu(menu::build(&handle, sup.lang())?)?;
            app.on_menu_event(|app, event| {
                if event.id().as_ref() == "help:diagnostics" {
                    // Written into the data folder and shown in Finder, ready
                    // to attach to an issue.
                    if let Some(sup) = app.try_state::<Supervisor>() {
                        match sup.export_diagnostics() {
                            Ok(zip) => {
                                let _ = std::process::Command::new("/usr/bin/open").arg("-R").arg(zip).spawn();
                            }
                            Err(e) => tracing::warn!(error = %e, "diagnostics not exported"),
                        }
                    }
                    return;
                }
                menu::forward(app, event.id().as_ref())
            });
            // Items already open at launch were announced before: badge them, don't notify again.
            if let Ok(items) = sup.inbox() {
                sink.seen
                    .lock()
                    .unwrap_or_else(std::sync::PoisonError::into_inner)
                    .extend(items.iter().map(|i| i.id.clone()));
                if let Some(window) = handle.get_webview_window("main") {
                    badge(&window, &items);
                }
            }
            if let Some(window) = handle.get_webview_window("main") {
                let sink = sink.clone();
                window.on_window_event(move |e| {
                    if let tauri::WindowEvent::Focused(true) = e {
                        sink.on_focus();
                    }
                });
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
            ui_state,
            set_ui_state,
            start_demo,
            snoozed_inbox,
            export_diagnostics,
            look_image,
            remote_info,
            reset_remote_token,
            test_push,
            set_git_identity,
            push_status,
            undo_rollback,
            write_file,
            snooze,
            check_project,
            rollback,
            revert_hunk,
            open_pi_login,
            file_text,
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
            answer_assumption,
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

#[cfg(test)]
mod tests {
    /// Every command the interface invokes is registered with the shell
    /// (a missing one fails only at run time, as "command not found").
    #[test]
    fn every_command_the_interface_calls_is_registered() {
        let api = include_str!("../../src/lib/api.ts");
        let shell = include_str!("lib.rs");
        let start = shell.find("generate_handler![").expect("handler list");
        let list = &shell[start..start + shell[start..].find("])").expect("end of list")];
        let registered: Vec<&str> =
            list.trim_start_matches("generate_handler![").split(',').map(str::trim).filter(|s| !s.is_empty()).collect();
        let mut missing = Vec::new();
        for part in api.split("invoke<").skip(1) {
            let Some(name) = part.split("(\"").nth(1).and_then(|r| r.split('"').next()) else { continue };
            if !registered.contains(&name) {
                missing.push(name.to_string());
            }
        }
        assert!(missing.is_empty(), "not registered: {missing:?}");
        assert!(registered.len() >= 40, "the list was read: {}", registered.len());
    }
}
