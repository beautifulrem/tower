//! Engine runs: starting, observing, steering and stopping one goal's engine.

use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex, PoisonError};
use std::time::{Duration, Instant};

use serde::{Deserialize, Serialize};
use serde_json::Value;
use tower_core::i18n::Choice;
use tower_core::lifecycle::Transition;
use tower_core::view::{InboxKind, LiveLine};
use tower_core::{EventKind, LifecycleState, Millis, Mode, PauseReason, tr};
use tower_pi::{Engine, EngineConfig, ImageAttachment};
use tower_store::NewInboxItem;

use crate::paths::real;
use crate::{Inner, Result, invalid, prompts};

pub(crate) use crate::control::{
    abandon, answer_dialog, pause, pause_after_stop, pause_failed_start, paused_item, repin, report, resume, steer,
};
pub(crate) use crate::jail::{Dirs, Net, TowerFiles, agent_jail, verifier_jail};

/// The same failing call this many times in one run raises a stall (S1).
const REPEATED_FAILURES: u32 = 4;

/// Sandbox denials without workspace file progress before the Anti-Probing
/// Early Stall detector pauses the run (`docs/18-evolution-roadmap.md` P0.1).
pub const SANDBOX_PROBE_THRESHOLD: u32 = 5;

/// Grace window before finalizing an anti-probe early pause so an immediate
/// file write + `submit` already in flight settles without false interruption.
pub const SANDBOX_PROBE_GRACE: Duration = Duration::from_secs(1);

/// Pause reason used when the agent honestly calls `submit(outcome: "blocked")`.
pub const AGENT_REPORTED_BLOCKED_PAUSE_REASON: PauseReason = PauseReason::AgentReportedBlocked;

/// Pause reason used when the Anti-Probing Early Stall detector stops a run.
pub const SANDBOX_PROBE_PAUSE_REASON: PauseReason = PauseReason::IdleWithoutSubmit;

/// Outcome reported by the agent via the `submit` tool (keeping the 7-tool budget).
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum SubmitOutcome {
    Done,
    Blocked,
}

/// Structured payload when an agent honestly reports a blocker via `submit`.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct BlockedReport {
    pub summary: String,
    pub blocker_reason: String,
}

/// Parsed arguments of a `submit` tool call.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct SubmitPayload {
    pub outcome: SubmitOutcome,
    pub summary: String,
    pub blocker_reason: Option<String>,
}

/// Parses the JSON arguments of a `submit` tool call (`outcome` defaults to `"done"`).
pub fn parse_submit_args(args: &Value) -> SubmitPayload {
    let outcome = match args.get("outcome").and_then(Value::as_str).map(str::trim) {
        Some(v) if v.eq_ignore_ascii_case("blocked") => SubmitOutcome::Blocked,
        _ => SubmitOutcome::Done,
    };
    let summary = args.get("summary").and_then(Value::as_str).unwrap_or_default().trim().to_string();
    let blocker_reason =
        args.get("blocker_reason").and_then(Value::as_str).map(str::trim).filter(|s| !s.is_empty()).map(String::from);
    SubmitPayload { outcome, summary, blocker_reason }
}

/// Tracks sandbox/trust-gate denials accumulated without workspace file progress.
#[derive(Debug, Default, Clone)]
pub struct ProbeTracker {
    pub denials_since_progress: u32,
    pub total_denials: u32,
    pub recent_targets: Vec<String>,
    pub check_inflight: bool,
    pub last_progress_pin: Option<String>,
}

impl ProbeTracker {
    pub fn record_denial(&mut self, target: Option<String>) -> u32 {
        self.denials_since_progress += 1;
        self.total_denials += 1;
        if let Some(t) = target.filter(|s| !s.trim().is_empty()) {
            if self.recent_targets.len() >= 5 {
                self.recent_targets.remove(0);
            }
            self.recent_targets.push(t);
        }
        self.denials_since_progress
    }

    pub fn record_progress(&mut self, new_pin: Option<String>) {
        self.denials_since_progress = 0;
        self.recent_targets.clear();
        if let Some(pin) = new_pin {
            self.last_progress_pin = Some(pin);
        }
    }

    pub fn threshold_reached(&self) -> bool {
        self.denials_since_progress >= SANDBOX_PROBE_THRESHOLD
    }
}

/// Why Tower itself is stopping a run, so the exit is not mistaken for a crash.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Stop {
    Pause(PauseReason),
    Submitted,
    Abandon,
}

#[derive(Debug)]
struct ToolCall {
    tool: String,
    args: Value,
    started: Instant,
    /// When its start was recorded (the live line's time).
    at: Millis,
}

#[derive(Debug, Default)]
pub struct Flags {
    pub stopping: Option<Stop>,
    /// Failing tool calls by signature, for the repeated-failure detector.
    failures: HashMap<String, u32>,
    /// Stall detectors already reported in this run (once each).
    stalls_reported: std::collections::HashSet<String>,
    last_activity: Option<Instant>,
    submitted: bool,
    /// Set when the agent calls `submit(outcome: "blocked")`.
    blocked_report: Option<BlockedReport>,
    /// Anti-probing early stall state.
    probe: ProbeTracker,
    nudged: bool,
    /// A budget pause is already on its way (checked at message and turn end).
    over_budget: bool,
    last_error: Option<String>,
    tools: HashMap<String, ToolCall>,
    stream: String,
    last_stream: Option<Instant>,
    /// Engine dialog id -> (inbox id, dialog method).
    pub dialogs: HashMap<String, (String, String)>,
}

impl Flags {
    /// The call the run is at work on: the newest still in flight, as a start sets the mode and the live line to the
    /// call that starts. A note, the hand-in and a question (`log`, `submit`, `ask_user`) are never work (review 18).
    fn at_work(&self) -> Option<&ToolCall> {
        self.tools
            .values()
            .filter(|c| !matches!(c.tool.as_str(), "log" | "submit" | "ask_user"))
            .max_by_key(|c| c.started)
    }
}

#[derive(Debug)]
pub struct Run {
    pub goal_id: String,
    pub run_no: u32,
    pub started: Instant,
    pub engine: Engine,
    pub workspace: String,
    pub flags: Mutex<Flags>,
    /// Held while the agent's profile is rewritten for the run (new loopback
    /// ports): every end of the run waits on this after taking the run out of
    /// the runs, so no rewrite lands after the end released its ports and folders.
    pub profile: Mutex<()>,
    /// See `Run::lock_mode`.
    pub mode_lock: Mutex<()>,
}

impl Run {
    pub fn flags(&self) -> std::sync::MutexGuard<'_, Flags> {
        self.flags.lock().unwrap_or_else(PoisonError::into_inner)
    }
}

/// Starts ready goals while slots are free, oldest first. Each start runs
/// on its own task (setting up a workspace can take minutes, and whoever
/// asked to schedule should not wait for it); a goal being started holds
/// its slot from now on.
///
/// Boxed because starts schedule again when they end without a run.
pub fn schedule(inner: &Arc<Inner>) -> std::pin::Pin<Box<dyn std::future::Future<Output = ()> + Send + '_>> {
    Box::pin(schedule_inner(inner))
}

async fn schedule_inner(inner: &Arc<Inner>) {
    let max = inner.settings().max_concurrent as usize;
    let ready = inner.store(|s| s.goals_in_state(LifecycleState::Ready)).unwrap_or_default();
    for g in ready {
        if inner.busy_count() >= max {
            break;
        }
        // Respect cross-goal dependencies (`Contract.depends_on`): wait until
        // every prerequisite goal has been accepted, integrated, or archived.
        if !g.contract.depends_on.is_empty() {
            let deps_met = g.contract.depends_on.iter().all(|dep_id| {
                inner.read_store(|s| s.goal(dep_id)).is_ok_and(|dep| {
                    matches!(
                        dep.state,
                        LifecycleState::Accepted | LifecycleState::Integrated | LifecycleState::Archived
                    )
                })
            });
            if !deps_met {
                continue;
            }
        }
        let goal_dir = inner.paths.goal_dir(&g.id);
        let prompt_atts: Vec<prompts::PromptAttachment> = g
            .contract
            .attachments
            .iter()
            .map(|a| prompts::PromptAttachment {
                path: a.path.clone(),
                mime_type: a.mime.clone(),
                label: Some(a.name.clone()),
            })
            .collect();
        let (purpose, message, images) = if g.run_no == 0 {
            let msg = prompts::initial_with_attachments(&g.title, &agent_contract(inner, &g), &prompt_atts);
            let att_dir = goal_dir.join("attachments");
            let imgs = prompts::load_image_attachments(&prompt_atts, &[&att_dir, &goal_dir]);
            ("initial", msg, imgs)
        } else {
            (
                "resume",
                prompts::resume("waiting for a free slot", &human_notes_since_last_run(inner, &g.id), &[]),
                Vec::new(),
            )
        };
        // Re-read: the goal may have been paused or abandoned since the list
        // was taken, and the scheduler must never start what a human stopped.
        let still_ready = inner.store(|s| s.goal(&g.id)).is_ok_and(|now| now.state == LifecycleState::Ready);
        if !still_ready {
            continue;
        }
        let Ok(starting) = Starting::claim(inner, &g.id, Some(max)) else { continue };
        let inner = inner.clone();
        tokio::spawn(async move {
            let id = g.id;
            let r = start_scheduled(&inner, &id, purpose, message, images, starting).await;
            if let Err(e) = &r {
                tracing::warn!(goal = %id, error = %e, "could not start run");
            }
            hand_on(&inner, &id, &r).await;
        });
    }
}

/// Human steering recorded while no engine was running, to carry into the
/// next run's first message.
pub(crate) fn human_notes_since_last_run(inner: &Inner, goal: &str) -> Vec<String> {
    let since = inner.store(|s| s.last_event(goal, "run_started")).ok().flatten().map(|e| e.at).unwrap_or(0);
    inner
        .store(|s| s.events_since(goal, since))
        .unwrap_or_default()
        .into_iter()
        .filter_map(|e| match e.event {
            EventKind::Steered { text } => Some(text),
            _ => None,
        })
        .collect()
}

/// The contract as the agent sees it: without the criteria that run
/// held-out tests (their commands would say where the tests live).
pub(crate) fn agent_contract(inner: &Inner, goal: &tower_store::GoalRecord) -> tower_core::Contract {
    let holdout = inner.store(|s| s.project(&goal.project_id)).map(|p| p.holdout_files).unwrap_or_default();
    let mut c = goal.contract.clone();
    c.criteria.retain(|cr| match &cr.kind {
        tower_core::CriterionKind::Exec { command, .. } => !crate::verify::names_held_out(&holdout, command),
        _ => true,
    });
    c
}

fn engine_config(inner: &Inner, goal: &tower_store::GoalRecord, ws: &Path) -> Result<EngineConfig> {
    let engine_id = inner.engine_of(goal);
    let program = if crate::acp_adapter::is_acp(&engine_id)
        && !Path::new(&goal.project_root).starts_with(real(&inner.paths.demo_projects()))
    {
        let bridge = inner.paths.extension_dir().join("acp.ts");
        bridge.is_file().then_some(bridge).ok_or_else(|| {
            invalid(tr!(
                inner.lang(),
                "找不到 Tower 的 ACP 桥接脚本（extensions/tower-goal/acp.ts）",
                "Tower's ACP bridge script (extensions/tower-goal/acp.ts) was not found"
            ))
        })?
    } else {
        inner.engine_program(goal).ok_or_else(|| {
            invalid(tr!(inner.lang(), "没有找到 pi，请在设置中指定路径", "Pi was not found; set its path in Settings"))
        })?
    };
    let settings = inner.settings();
    let goal_dir = inner.paths.goal_dir(&goal.id);
    let tmp = inner.paths.tmp(&goal.id);
    let attachments_dir = goal_dir.join("attachments");
    std::fs::create_dir_all(&goal_dir)?;
    std::fs::create_dir_all(&tmp)?;
    std::fs::create_dir_all(&attachments_dir)?;
    std::fs::create_dir_all(inner.paths.sessions(&goal.id))?;
    let contract_path = goal_dir.join("contract.json");
    let visible = agent_contract(inner, goal);
    std::fs::write(&contract_path, serde_json::to_vec_pretty(&visible).map_err(|e| invalid(e.to_string()))?)?;

    let ws_real = real(ws);
    let tmp_real = real(&tmp);
    let attachments_real = real(&attachments_dir);
    let trust = crate::acp_adapter::trust_level(&engine_id);
    let acp_agent =
        crate::acp_adapter::resolve_acp_command(inner, &engine_id).unwrap_or_else(|| inner.claude_acp_command());
    let mut env = inner.env.pairs();
    env.extend([
        ("TOWER_GOAL_ID".to_string(), goal.id.clone()),
        ("TOWER_WORKSPACE".into(), ws_real.display().to_string()),
        ("TOWER_CONTRACT".into(), contract_path.display().to_string()),
        ("TOWER_TMP".into(), tmp_real.display().to_string()),
        ("TOWER_ATTACHMENTS_DIR".into(), attachments_real.display().to_string()),
        // The language of the extension's approval reasons and options.
        ("TOWER_LANG".into(), settings.lang().code().into()),
        // Whether the agent's shell keeps proxy variables (off: stripped).
        ("TOWER_NETWORK".into(), if goal.contract.network { "1" } else { "0" }.into()),
        // Generic ACP engine selection & Trust Gate tier (ignored by Pi).
        ("TOWER_ENGINE".into(), engine_id),
        ("TOWER_ENGINE_TRUST".into(), trust.as_str().into()),
        ("TOWER_ACP_AGENT".into(), acp_agent),
        ("PI_OFFLINE".into(), "1".into()),
    ]);
    if let Ok(helper) = std::env::var(crate::fs_helper::ENV_FS_HELPER)
        && !helper.trim().is_empty()
    {
        env.push((crate::fs_helper::ENV_FS_HELPER.into(), helper));
    }
    let jail = agent_jail(inner, goal, ws, &tmp, "agent", goal.contract.network)?;
    // Record dynamically allocated port block once per allocation.
    let current_port = inner.read_store(|s| s.summary(&goal.id)).ok().and_then(|s| s.port_base);
    if let Some(alloc) = crate::ports_pool::get_for_root(&inner.paths.root, &goal.id)
        && current_port != Some(alloc.base)
    {
        let _ = inner.append(&goal.id, EventKind::PortBlockAllocated { base: alloc.base, count: alloc.count });
    }
    // The agent's shell and file tools inherit the private caches.
    env.extend(jail.env.into_iter().filter(|(k, _)| k != "TMPDIR"));
    if let Some(profile) = jail.profile {
        env.push(("TOWER_SANDBOX_PROFILE".into(), profile.display().to_string()));
    }
    let (model, escalated) = inner.effective_model_for(goal, goal.rework_cycles);
    let current_escalated = inner.read_store(|s| s.detail(&goal.id)).ok().and_then(|d| d.escalated_model);
    if escalated
        && let Some(ref to_model) = model
        && current_escalated.as_deref() != Some(to_model.as_str())
    {
        let from_model = if !goal.contract.model.trim().is_empty() {
            goal.contract.model.clone()
        } else {
            settings.default_model.clone()
        };
        let _ = inner.append(
            &goal.id,
            EventKind::ModelEscalated { from_model, to_model: to_model.clone(), rework_cycle: goal.rework_cycles },
        );
    }
    let thinking = Some(goal.contract.thinking.clone())
        .filter(|m| !m.is_empty())
        .or_else(|| Some(settings.default_thinking.clone()).filter(|m| !m.is_empty()));
    Ok(EngineConfig {
        program,
        cwd: ws.to_path_buf(),
        session_dir: inner.paths.sessions(&goal.id),
        resume_session: goal.session_file.as_ref().map(PathBuf::from).filter(|p| p.exists()),
        extensions: inner.extensions(&settings),
        load_user_extensions: settings.load_user_extensions,
        model,
        thinking,
        append_system_prompt: Some({
            let project = inner.store(|s| s.project(&goal.project_id))?;
            prompts::system_section(
                &goal.id,
                &[("User memory", settings.user_memory.as_str()), ("Project memory", project.memory.as_str())],
                settings.agent_language(),
            )
        }),
        env,
    })
}

/// Prepares the workspace if needed, starts the engine and sends the first message.
///
/// Boxed because runs start other runs (a settled run schedules the next
/// ready goal), which would otherwise make the future type recursive.
pub fn start_run<'a>(
    inner: &'a Arc<Inner>,
    goal_id: &'a str,
    purpose: &'a str,
    message: String,
) -> std::pin::Pin<Box<dyn std::future::Future<Output = Result<()>> + Send + 'a>> {
    Box::pin(async move {
        let starting = Starting::claim_one(inner, goal_id)?;
        start_claimed(inner, goal_id, purpose, message, starting).await
    })
}

/// `start_run` for a start whose slot is already claimed.
pub(crate) fn start_claimed<'a>(
    inner: &'a Arc<Inner>,
    goal_id: &'a str,
    purpose: &'a str,
    message: String,
    starting: Starting,
) -> std::pin::Pin<Box<dyn std::future::Future<Output = Result<()>> + Send + 'a>> {
    Box::pin(async move {
        let r = start_run_inner(inner, goal_id, purpose, message, Vec::new(), false, starting).await;
        hand_on(inner, goal_id, &r).await;
        r
    })
}

/// Starts a run carrying multimodal image attachments alongside `message`.
#[allow(dead_code)]
pub fn start_run_with_images<'a>(
    inner: &'a Arc<Inner>,
    goal_id: &'a str,
    purpose: &'a str,
    message: String,
    images: Vec<ImageAttachment>,
) -> std::pin::Pin<Box<dyn std::future::Future<Output = Result<()>> + Send + 'a>> {
    Box::pin(async move {
        let starting = Starting::claim_one(inner, goal_id)?;
        let r = start_run_inner(inner, goal_id, purpose, message, images, false, starting).await;
        hand_on(inner, goal_id, &r).await;
        r
    })
}

fn start_scheduled<'a>(
    inner: &'a Arc<Inner>,
    goal_id: &'a str,
    purpose: &'a str,
    message: String,
    images: Vec<ImageAttachment>,
    starting: Starting,
) -> std::pin::Pin<Box<dyn std::future::Future<Output = Result<()>> + Send + 'a>> {
    Box::pin(start_run_inner(inner, goal_id, purpose, message, images, true, starting))
}

/// `only_if_ready`: the scheduler's starts, which must not start a goal that
/// stopped being ready (a human paused it) after the scheduler looked.
async fn start_run_inner(
    inner: &Arc<Inner>,
    goal_id: &str,
    purpose: &str,
    message: String,
    images: Vec<ImageAttachment>,
    only_if_ready: bool,
    _starting: Starting,
) -> Result<()> {
    let lang = inner.lang();
    if inner.run_of(goal_id).is_some() {
        return Err(invalid(tr!(lang, "这个目标已经在运行", "This goal is already running")));
    }
    let mut goal = inner.store(|s| s.goal(goal_id))?;
    if only_if_ready && goal.state != LifecycleState::Ready {
        return Ok(());
    }
    // The state this start began from; see `begin`.
    let seen = goal.state;

    if goal.workspace.is_none() {
        inner.set_mode(goal_id, Mode::Starting)?;
        let ws = inner.paths.workspace(goal_id);
        let git = inner.git.clone();
        let (root, branch, ws2, id) =
            (PathBuf::from(&goal.project_root), goal.base_branch.clone(), ws.clone(), goal.id.clone());
        let prepared = tokio::task::spawn_blocking(move || git.prepare_workspace(&root, &branch, &ws2, &id))
            .await
            .map_err(|e| invalid(e.to_string()))?;
        match prepared {
            Ok(base) => {
                inner.append(
                    goal_id,
                    EventKind::WorkspacePrepared { workspace: ws.display().to_string(), base_commit: base },
                )?;
                goal = inner.store(|s| s.goal(goal_id))?;
            }
            Err(e) => {
                fail_to_start(
                    inner,
                    goal_id,
                    &tr!(lang, "准备工作区失败：{e}", "Could not prepare the workspace: {e}"),
                )?;
                return Err(e.into());
            }
        }
    }
    let ws = PathBuf::from(goal.workspace.clone().expect("workspace prepared"));
    // Until a run has begun and setup has finished (it records its outcome,
    // pass or fail), the workspace is not ready yet: a start that failed
    // halfway through preparing it does the rest again. Once the agent has
    // run, local files are never copied over its workspace again.
    if goal.run_no == 0 && inner.store(|s| s.last_event(goal_id, "setup_finished"))?.is_none() {
        if let Err(e) = finish_workspace(inner, &goal, &ws).await {
            fail_to_start(inner, goal_id, &tr!(lang, "准备工作区失败：{e}", "Could not prepare the workspace: {e}"))?;
            return Err(e);
        }
        goal = inner.store(|s| s.goal(goal_id))?;
    }

    // Lockfile-verified ACP adapter installation for any bundled ACP engine.
    let engine_id = inner.engine_of(&goal);
    if crate::acp_adapter::is_acp(&engine_id)
        && let Err(e) = crate::acp_adapter::ensure_for(inner, &engine_id).await
    {
        fail_to_start(inner, goal_id, &e.to_string())?;
        return Err(e);
    }

    let cfg = match engine_config(inner, &goal, &ws) {
        Ok(c) => c,
        Err(e) => {
            fail_to_start(inner, goal_id, &e.to_string())?;
            return Err(e);
        }
    };
    let (engine, rx) = match Engine::spawn(&cfg) {
        Ok(x) => x,
        Err(e) => {
            fail_to_start(inner, goal_id, &tr!(lang, "启动引擎失败：{e}", "Could not start the engine: {e}"))?;
            return Err(e.into());
        }
    };

    // A run interrupted by Tower quitting continues under the same number.
    let continuing = purpose == "continue" && goal.run_no > 0;
    let run_no = if continuing { goal.run_no } else { goal.run_no + 1 };
    // Where this run starts from, kept (as a ref, so git never collects it)
    // for rolling back. Best effort: a run is not refused for want of it.
    let start_pin = match goal.base_commit.clone().filter(|_| !continuing) {
        Some(base) => {
            let git = inner.git.clone();
            let ws2 = ws.clone();
            tokio::task::spawn_blocking(move || -> Option<String> {
                let snap = git.snapshot(&ws2, &base).ok()?;
                git.keep(&ws2, &format!("refs/tower/runs/{run_no}"), &snap.pin).ok()?;
                Some(snap.pin)
            })
            .await
            .ok()
            .flatten()
        }
        None => None,
    };
    let mut initial_flags = Flags::default();
    initial_flags.probe.last_progress_pin = start_pin.clone().or_else(|| goal.pin.clone());

    let run = Arc::new(Run {
        goal_id: goal_id.into(),
        run_no,
        started: Instant::now(),
        engine,
        workspace: real(&ws).display().to_string(),
        flags: Mutex::new(initial_flags),
        profile: Mutex::default(),
        mode_lock: Mutex::default(),
    });
    if !begin(inner, &run, seen, purpose, start_pin)? {
        // Nothing reads this engine yet (its events stay in `rx`).
        run.engine.shutdown(Duration::from_secs(5)).await;
        inner.set_mode(goal_id, Mode::Idle)?;
        let text = tr!(
            lang,
            "启动期间目标被暂停或放弃，这次运行没有开始",
            "The goal was paused or abandoned while it was starting, so the run did not start"
        );
        inner.append(goal_id, EventKind::tower_note(text))?;
        return Ok(());
    }
    launch(inner, &goal, &run, rx, message, &images).await
}

/// A run that has begun: its engine gets its readers and its first message.
async fn launch(
    inner: &Arc<Inner>,
    goal: &tower_store::GoalRecord,
    run: &Arc<Run>,
    rx: tokio::sync::mpsc::UnboundedReceiver<tower_pi::EngineOutput>,
    message: String,
    images: &[ImageAttachment],
) -> Result<()> {
    let (goal_id, lang) = (goal.id.as_str(), inner.lang());
    // A pause or abandon from here on finds the run and stops it, marking it
    // stopping first (under this lock): the start then ends where it is.
    {
        let flags = run.flags();
        if flags.stopping.is_some() {
            return Ok(());
        }
        inner.update_keep_awake();
        // The criteria on your own code, while the agent starts (once; see
        // `verify::preflight`). A pause after this cancels it.
        crate::verify::preflight(inner.clone(), goal_id.to_string());
        tokio::spawn(pump(inner.clone(), run.clone(), rx));
        tokio::spawn(watchdog(inner.clone(), run.clone()));
        tokio::spawn(crate::jail::follow_agent_listeners(inner.clone(), goal_id.to_string(), run.run_no));
        drop(flags);
    }

    if let Ok(state) = run.engine.state().await
        && let Some(file) = state.get("sessionFile").and_then(Value::as_str)
        && goal.session_file.as_deref() != Some(file)
    {
        inner.append(goal_id, EventKind::SessionAttached { session_file: file.into() })?;
    }
    if run.flags().stopping.is_some() {
        return Ok(());
    }
    inner.append(goal_id, EventKind::Injected { channel: "prompt".into(), text: message.clone() })?;
    // The run thinks from the moment its message goes. Written before it is sent: written after, it landed over a call
    // the engine had already started (iteration 20, one flow run in ten). Under the mode's lock, like every write of
    // the mode once the engine runs, and not over a stop recorded first, nor over a question an extension opened while
    // the engine started: that waits on you until it is answered (review 20, record only).
    {
        let _mode = run.lock_mode();
        let flags = run.flags();
        if flags.stopping.is_none() && flags.dialogs.is_empty() {
            inner.set_mode(goal_id, Mode::Thinking)?;
        }
    }
    if let Err(e) = run.engine.prompt_with_images(&message, images).await {
        if run.flags().stopping.is_some() {
            // Stopped while the message was on its way: whoever stopped it
            // has recorded why.
            return Ok(());
        }
        stop_engine(inner, run, Stop::Pause(PauseReason::PrepareFailed)).await;
        let detail = tr!(lang, "发送开场消息失败：{e}", "Could not send the first message: {e}");
        pause_after_stop(inner, goal_id, PauseReason::PrepareFailed, &detail)?;
        return Err(e.into());
    }
    Ok(())
}

/// What a new workspace gets before its first run: the project's local
/// files, then its setup command.
async fn finish_workspace(inner: &Arc<Inner>, goal: &tower_store::GoalRecord, ws: &Path) -> Result<()> {
    let copied = copy_local_files(inner, goal, ws).await?;
    if !copied.is_empty() {
        inner.append(&goal.id, EventKind::LocalFilesCopied { files: copied })?;
    }
    setup_workspace(inner, goal, ws).await
}

/// Copies the project's git-ignored local files (e.g. `.env`) into `dest`.
pub async fn copy_local_files(inner: &Arc<Inner>, goal: &tower_store::GoalRecord, dest: &Path) -> Result<Vec<String>> {
    let project = inner.store(|s| s.project(&goal.project_id))?;
    if project.local_files.is_empty() {
        return Ok(Vec::new());
    }
    let git = inner.git.clone();
    let (root, dest2, patterns) = (PathBuf::from(&project.root), dest.to_path_buf(), project.local_files.clone());
    let copied = tokio::task::spawn_blocking(move || git.copy_local_files(&root, &dest2, &patterns))
        .await
        .map_err(|e| invalid(e.to_string()))??;
    Ok(copied)
}

/// Runs the project's setup command (e.g. `pnpm install`) once in a new
/// workspace, under the agent's sandbox. A failure is recorded and does not
/// block the run: the agent can still install what it needs.
async fn setup_workspace(inner: &Arc<Inner>, goal: &tower_store::GoalRecord, ws: &Path) -> Result<()> {
    let project = inner.store(|s| s.project(&goal.project_id))?;
    let command = project.setup_command.trim().to_string();
    if command.is_empty() {
        return Ok(());
    }
    inner.set_mode(&goal.id, Mode::Starting)?;
    // Setup installs dependencies, so it has the network; it still cannot
    // read the user's files or write outside the workspace and caches.
    let jail = agent_jail(inner, goal, ws, &inner.paths.tmp(&goal.id), "setup", true)?;
    let shell_command = crate::verify::command_for(&command, jail.profile.as_deref());
    let mut env = inner.env.without_credentials();
    env.extend(jail.env);
    let spec = tower_verify::RunSpec::new(shell_command, ws, env, Duration::from_secs(15 * 60));
    let r = tower_verify::run(&spec, &tower_verify::Cancel::default()).await;
    inner.append(
        &goal.id,
        EventKind::SetupFinished { command, ok: r.passed(), exit_code: r.exit_code(), duration_ms: r.duration_ms },
    )?;
    if !r.passed() {
        let tail = &r.output_tail;
        let text = tr!(
            inner.lang(),
            "准备命令失败，Agent 会在没有它的情况下开始：\n{tail}",
            "The setup command failed; the agent starts without it:\n{tail}"
        );
        inner.append(&goal.id, EventKind::tower_note(text))?;
    }
    Ok(())
}

/// Watches a run for stalls the event stream cannot reveal: no activity for
/// a long time, or the wall-clock cap passing (`docs/07` §7.6).
async fn watchdog(inner: Arc<Inner>, run: Arc<Run>) {
    const QUIET: Duration = Duration::from_secs(10 * 60);
    let mut tick = tokio::time::interval(Duration::from_secs(30));
    loop {
        tick.tick().await;
        if run.flags().stopping.is_some() || inner.run_of(&run.goal_id).is_none_or(|r| r.run_no != run.run_no) {
            break;
        }
        let Ok(goal) = inner.store(|s| s.goal(&run.goal_id)) else { break };
        let cap = Duration::from_secs(u64::from(goal.contract.budget.wall_minutes.max(1)) * 60);
        if run.started.elapsed() > cap {
            let inner2 = inner.clone();
            let g = run.goal_id.clone();
            let minutes = goal.contract.budget.wall_minutes;
            let detail = tower_core::i18n::PauseNote::RanPast { minutes }.encode();
            tokio::spawn(async move {
                let r = pause(&inner2, &g, PauseReason::WallClockCap, &detail).await;
                report(&inner2, &g, r).await;
            });
            break;
        }
        let quiet = run.flags().last_activity.unwrap_or(run.started).elapsed();
        let waiting = !run.flags().dialogs.is_empty();
        if quiet > QUIET && !waiting {
            let minutes = quiet.as_secs() / 60;
            report_stall(&inner, &run, "no_progress", tower_core::i18n::Stall::NoProgress { minutes });
        }
    }
}

/// Raises a stall once per detector per run. The run keeps going; the
/// Needs-You item lets the human wait, steer or pause.
fn report_stall(inner: &Arc<Inner>, run: &Arc<Run>, detector: &str, stall: tower_core::i18n::Stall) {
    if !run.flags().stalls_reported.insert(detector.to_string()) {
        return;
    }
    let g = run.goal_id.as_str();
    let lang = inner.lang();
    let detail = &stall.text(lang);
    let opened =
        inner.append(g, EventKind::Stalled { detector: detector.into(), detail: detail.into() }).and_then(|_| {
            inner.open_inbox(NewInboxItem {
                goal_id: g.into(),
                kind: InboxKind::Stalled,
                title: tr!(lang, "可能卡住：{detail}", "May be stuck: {detail}"),
                subject: stall.encode(),
                body: tr!(
                    lang,
                    "Agent 仍在运行。你可以继续等待、写一句转向，或者暂停它。",
                    "The agent is still running. You can keep waiting, write a steer, or pause it."
                ),
                options: Choice::labels(&[Choice::KeepWaiting, Choice::Pause], lang),
                allow_text: true,
                urgency: 2,
                engine_ref: None,
            })
        });
    // A stall that cannot be shown is still worth a trace line.
    if let Err(e) = opened {
        tracing::error!(goal = g, error = %e, "could not raise a stall");
    }
}

fn fail_to_start(inner: &Arc<Inner>, goal_id: &str, detail: &str) -> Result<()> {
    inner.append(goal_id, EventKind::EngineError { message: detail.into() })?;
    pause_failed_start(inner, goal_id, PauseReason::PrepareFailed, detail)
}

mod asks;
mod events;
mod slots;
pub(crate) use asks::{between, settle_held, settle_mode};
use asks::{on_ui_request, report_mode};
use events::pump;
pub(crate) use events::{sandbox_denied, stop_engine};
pub(crate) use slots::{Starting, already_starting};
use slots::{begin, hand_on};

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn submit_args_default_to_done_and_parse_blocked_cleanly() {
        let done = parse_submit_args(&serde_json::json!({
            "summary": "Fixed bug",
            "criteria": [{"id": "C1", "met": true, "evidence": "passed"}]
        }));
        assert_eq!(done.outcome, SubmitOutcome::Done);
        assert_eq!(done.summary, "Fixed bug");
        assert_eq!(done.blocker_reason, None);

        let blocked = parse_submit_args(&serde_json::json!({
            "outcome": "blocked",
            "summary": "Cannot write lockfile",
            "blocker_reason": "package.json is readonly in contract"
        }));
        assert_eq!(blocked.outcome, SubmitOutcome::Blocked);
        assert_eq!(blocked.blocker_reason.as_deref(), Some("package.json is readonly in contract"));
    }

    #[test]
    fn probe_tracker_triggers_at_five_denials_and_resets_on_workspace_progress() {
        let mut tracker = ProbeTracker::default();
        for i in 1..SANDBOX_PROBE_THRESHOLD {
            tracker.record_denial(Some(format!("/secret/{i}")));
            assert!(!tracker.threshold_reached(), "should not trigger at {i}");
        }
        tracker.record_denial(Some("/secret/5".into()));
        assert!(tracker.threshold_reached());
        assert_eq!(tracker.total_denials, SANDBOX_PROBE_THRESHOLD);

        tracker.record_progress(Some("pin-2".into()));
        assert!(!tracker.threshold_reached());
        assert_eq!(tracker.denials_since_progress, 0);
        assert_eq!(tracker.last_progress_pin.as_deref(), Some("pin-2"));
    }

    async fn run_fake_engine_scenario(script_body: &str) -> (tempfile::TempDir, crate::Supervisor, String) {
        fake_engine_goal(script_body, true).await
    }

    /// Without `ratify`, the goal stays a draft (nothing starts it).
    pub(super) async fn fake_engine_goal(
        script_body: &str,
        ratify: bool,
    ) -> (tempfile::TempDir, crate::Supervisor, String) {
        use std::os::unix::fs::PermissionsExt;
        let tmp = tempfile::tempdir().unwrap();
        let repo = tmp.path().join("repo");
        std::fs::create_dir_all(&repo).unwrap();
        let git = |args: &[&str]| {
            let st = std::process::Command::new("git").args(args).current_dir(&repo).status().unwrap();
            assert!(st.success(), "git {args:?} failed");
        };
        git(&["init", "-q", "-b", "main"]);
        git(&["config", "user.email", "test@tower.local"]);
        git(&["config", "user.name", "Tower Test"]);
        std::fs::write(repo.join("README.md"), "hello\n").unwrap();
        git(&["add", "."]);
        git(&["commit", "-q", "-m", "init"]);

        let fake_pi = tmp.path().join("fake-pi.sh");
        std::fs::write(&fake_pi, format!("#!/bin/bash\n{script_body}\n")).unwrap();
        std::fs::set_permissions(&fake_pi, std::fs::Permissions::from_mode(0o755)).unwrap();

        let cfg = crate::Config {
            paths: crate::Paths::new(tmp.path().join("home")),
            extension_source: PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../../extensions/tower-goal"),
            env: Some(crate::shell_env::ShellEnv::from_pairs(vec![
                ("PATH".into(), std::env::var("PATH").unwrap_or_else(|_| "/usr/bin:/bin".into())),
                ("HOME".into(), tmp.path().display().to_string()),
            ])),
            demo_engine: None,
        };
        let sup = crate::Supervisor::start(cfg, Arc::new(crate::NullSink)).await.unwrap();
        let mut s = sup.settings();
        s.pi_path = fake_pi.display().to_string();
        s.language = "en".into();
        sup.save_settings(s).unwrap();

        let project = sup.add_project(repo.to_str().unwrap()).await.unwrap();
        let contract = tower_core::Contract::quick("Do task", Some("true".into()), tower_core::Lang::En);
        let goal = sup
            .create_goal(crate::NewGoalInput { project_id: project.id, title: "Test goal".into(), contract, ratify })
            .await
            .unwrap();
        (tmp, sup, goal.id)
    }

    /// Claiming a start checks the limit and takes the slot in one step
    /// (the scheduler and a resume both claim this way), and says why not.
    #[tokio::test(flavor = "multi_thread")]
    async fn a_start_claims_its_slot_in_one_step() {
        use crate::inner::Unclaimed;
        let (_tmp, sup, _) = fake_engine_goal("cat", false).await;
        let inner = &sup.inner;
        let a = Starting::claim(inner, "G-A", Some(1)).unwrap();
        assert_eq!(Starting::claim(inner, "G-A", None).err(), Some(Unclaimed::Starting));
        assert_eq!(Starting::claim(inner, "G-B", Some(1)).err(), Some(Unclaimed::Full));
        assert_eq!(inner.busy_count(), 1, "the refused claims took nothing");
        drop(a);
        assert!(Starting::claim(inner, "G-B", Some(1)).is_ok());
    }

    /// A start that failed without pausing its goal (an error before any
    /// step that records one) leaves it ready: it is paused with a card, so
    /// it is not retried at once, and its slot goes to the next goal.
    #[tokio::test(flavor = "multi_thread")]
    async fn a_start_that_failed_leaving_its_goal_ready_hands_its_slot_on() {
        let script = r#"
while IFS= read -r line; do
  id=$(printf '%s' "$line" | sed -n 's/.*"id":"\([^"]*\)".*/\1/p')
  type=$(printf '%s' "$line" | sed -n 's/.*"type":"\([^"]*\)".*/\1/p')
  printf '{"id":"%s","type":"response","command":"%s","success":true,"data":{}}\n' "$id" "$type"
done"#;
        let (_tmp, sup, first) = fake_engine_goal(script, false).await;
        let project = sup.projects().unwrap().remove(0).id;
        let contract = tower_core::Contract::quick("Other", Some("true".into()), tower_core::Lang::En);
        let input = crate::NewGoalInput { project_id: project, title: "Other".into(), contract, ratify: false };
        let second = sup.create_goal(input).await.unwrap().id;
        let inner = &sup.inner;
        for id in [&first, &second] {
            inner.transition(id, Transition::Ratify, None, "").unwrap();
        }
        hand_on(inner, &first, &Err(invalid("the blocking task panicked"))).await;
        let rec = inner.store(|s| s.goal(&first)).unwrap();
        assert_eq!((rec.state, rec.pause_reason), (LifecycleState::Paused, Some(PauseReason::PrepareFailed)));
        for _ in 0..200 {
            if inner.store(|s| s.goal(&second)).unwrap().state == LifecycleState::Running {
                return;
            }
            tokio::time::sleep(Duration::from_millis(50)).await;
        }
        panic!("the next ready goal never started");
    }

    /// A pause that lands right after the run began (it finds the run and
    /// stops it) ends the start: no preflight on the paused goal, no mode
    /// over the pause's, and the engine is stopped once.
    #[tokio::test(flavor = "multi_thread")]
    async fn a_pause_right_after_a_run_began_ends_the_start() {
        let script = r#"
while IFS= read -r line; do
  id=$(printf '%s' "$line" | sed -n 's/.*"id":"\([^"]*\)".*/\1/p')
  type=$(printf '%s' "$line" | sed -n 's/.*"type":"\([^"]*\)".*/\1/p')
  printf '{"id":"%s","type":"response","command":"%s","success":true,"data":{}}\n' "$id" "$type"
done"#;
        let (tmp, sup, id) = fake_engine_goal(script, false).await;
        let inner = &sup.inner;
        inner.transition(&id, Transition::Ratify, None, "").unwrap();
        // A workspace with a base, so the start would run the preflight.
        let repo = tmp.path().join("repo");
        let head = std::process::Command::new("git").args(["rev-parse", "HEAD"]).current_dir(&repo).output().unwrap();
        let base = String::from_utf8_lossy(&head.stdout).trim().to_string();
        let workspace = repo.display().to_string();
        inner.append(&id, EventKind::WorkspacePrepared { workspace, base_commit: base }).unwrap();
        let goal = inner.store(|s| s.goal(&id)).unwrap();
        let (engine, rx) = Engine::spawn(&engine_config(inner, &goal, &repo).unwrap()).unwrap();
        let run = Arc::new(Run {
            goal_id: id.clone(),
            run_no: 1,
            started: Instant::now(),
            engine,
            workspace: repo.display().to_string(),
            flags: Mutex::new(Flags::default()),
            profile: Mutex::default(),
            mode_lock: Mutex::default(),
        });
        assert!(begin(inner, &run, LifecycleState::Ready, "initial", None).unwrap());
        pause(inner, &id, PauseReason::Human, "").await.unwrap();
        launch(inner, &goal, &run, rx, "go".into(), &[]).await.unwrap();

        let rec = inner.store(|s| s.goal(&id)).unwrap();
        assert_eq!((rec.state, rec.mode), (LifecycleState::Paused, Mode::Idle));
        assert!(inner.run_of(&id).is_none());
        assert!(!inner.verifications.lock().unwrap().contains_key(&id), "no preflight on a paused goal");
        let trace = sup.trace(&id, None, 200).unwrap();
        let ended = trace.iter().filter(|e| matches!(e.event, EventKind::RunEnded { .. })).count();
        assert_eq!(ended, 1, "the engine is stopped once");
        assert!(!trace.iter().any(|e| matches!(&e.event, EventKind::Injected { .. })), "no first message");
    }

    /// Iteration 20 (D214): the first message thinks before it goes. An engine that starts a command before it answers
    /// the message leaves the run on the command: written after, "thinking" landed over it.
    #[tokio::test(flavor = "multi_thread")]
    async fn the_first_message_thinks_before_it_goes_never_over_a_call_started() {
        let script = r#"
while IFS= read -r line; do
  id=$(printf '%s' "$line" | sed -n 's/.*"id":"\([^"]*\)".*/\1/p')
  type=$(printf '%s' "$line" | sed -n 's/.*"type":"\([^"]*\)".*/\1/p')
  case "$type" in
    prompt)
      printf '{"type":"agent_start"}\n'
      printf '{"type":"tool_execution_start","toolCallId":"b1","toolName":"bash","args":{"command":"pnpm test"}}\n'
      sleep 0.5
      printf '{"id":"%s","type":"response","command":"prompt","success":true,"data":{"disposition":"started"}}\n' "$id" ;;
    *) printf '{"id":"%s","type":"response","command":"%s","success":true,"data":{}}\n' "$id" "$type" ;;
  esac
done"#;
        let (_tmp, sup, id) = run_fake_engine_scenario(script).await;
        let started = || {
            let trace = sup.trace(&id, None, 200).unwrap();
            trace.iter().any(|e| matches!(&e.event, EventKind::ToolStarted { call_id, .. } if call_id == "b1"))
        };
        for _ in 0..100 {
            if started() {
                break;
            }
            tokio::time::sleep(Duration::from_millis(50)).await;
        }
        assert!(started(), "the command started");
        // Past the engine's answer to the message, and the run's own write after it, if there were one.
        tokio::time::sleep(Duration::from_millis(1200)).await;
        assert_eq!(sup.goal(&id).unwrap().summary.mode, Mode::Executing);
    }

    /// Review 20 (record only): a question an extension opens while the engine starts, before the first message goes,
    /// waits on you; the first message's "thinking" is not written over it.
    #[tokio::test(flavor = "multi_thread")]
    async fn a_question_opened_before_the_first_message_still_waits_on_you() {
        let script = r#"
while IFS= read -r line; do
  id=$(printf '%s' "$line" | sed -n 's/.*"id":"\([^"]*\)".*/\1/p')
  type=$(printf '%s' "$line" | sed -n 's/.*"type":"\([^"]*\)".*/\1/p')
  case "$type" in
    get_state)
      printf '{"type":"extension_ui_request","id":"ext1","method":"input","title":"Which account?"}\n'
      sleep 0.3
      printf '{"id":"%s","type":"response","command":"get_state","success":true,"data":{}}\n' "$id" ;;
    *) printf '{"id":"%s","type":"response","command":"%s","success":true,"data":{}}\n' "$id" "$type" ;;
  esac
done"#;
        let (_tmp, sup, id) = run_fake_engine_scenario(script).await;
        let sent = || {
            let trace = sup.trace(&id, None, 200).unwrap();
            trace.iter().any(|e| matches!(&e.event, EventKind::Injected { channel, .. } if channel == "prompt"))
        };
        for _ in 0..100 {
            if sent() {
                break;
            }
            tokio::time::sleep(Duration::from_millis(50)).await;
        }
        assert!(sent(), "the first message went");
        tokio::time::sleep(Duration::from_millis(500)).await;
        assert_eq!(sup.goal(&id).unwrap().summary.mode, Mode::WaitingOnYou);
    }

    #[tokio::test(flavor = "multi_thread")]
    async fn honest_blocked_submit_pauses_goal_without_verifying() {
        let script = r#"
while IFS= read -r line; do
  id=$(printf '%s' "$line" | sed -n 's/.*"id":"\([^"]*\)".*/\1/p')
  type=$(printf '%s' "$line" | sed -n 's/.*"type":"\([^"]*\)".*/\1/p')
  case "$type" in
    get_state) printf '{"id":"%s","type":"response","command":"get_state","success":true,"data":{"sessionId":"s1","sessionFile":"/tmp/s1","isStreaming":false}}\n' "$id" ;;
    prompt)
      printf '{"id":"%s","type":"response","command":"prompt","success":true,"data":{"disposition":"started"}}\n' "$id"
      printf '{"type":"agent_start"}\n'
      printf '{"type":"tool_execution_start","toolCallId":"c1","toolName":"submit","args":{"outcome":"blocked","summary":"Cannot edit lockfile","blocker_reason":"C1 conflicts with readonly package.json","criteria":[]}}\n'
      printf '{"type":"tool_execution_end","toolCallId":"c1","toolName":"submit","result":{"content":[{"type":"text","text":"Blocked report received."}]},"isError":false}\n'
      printf '{"type":"agent_settled","aborted":false}\n' ;;
    *) printf '{"id":"%s","type":"response","command":"%s","success":true,"data":{}}\n' "$id" "$type" ;;
  esac
done"#;
        let (_tmp, sup, id) = run_fake_engine_scenario(script).await;
        for _ in 0..80 {
            if sup.goal(&id).unwrap().summary.state == LifecycleState::Paused {
                break;
            }
            tokio::time::sleep(Duration::from_millis(50)).await;
        }
        let detail = sup.goal(&id).unwrap();
        assert_eq!(detail.summary.state, LifecycleState::Paused);
        assert_eq!(detail.summary.pause_reason, Some(PauseReason::AgentReportedBlocked));
        let trace = sup.trace(&id, None, 200).unwrap();
        assert!(trace.iter().any(|e| matches!(&e.event, EventKind::AgentBlocked { .. })));
        assert!(trace.iter().any(|e| matches!(&e.event, EventKind::RunEnded { outcome, .. } if outcome == "blocked")));
        assert!(!trace.iter().any(|e| matches!(&e.event, EventKind::VerifyStarted { .. })));
        assert!(detail.claims.iter().any(|c| c.text.contains("readonly package.json")));
        let inbox = sup.inbox().unwrap();
        assert!(inbox.iter().any(|i| i.goal_id == id && i.body.contains("readonly package.json")));
    }

    #[tokio::test(flavor = "multi_thread")]
    async fn anti_probing_early_stall_pauses_after_five_denials_without_workspace_progress() {
        let script = r#"
while IFS= read -r line; do
  id=$(printf '%s' "$line" | sed -n 's/.*"id":"\([^"]*\)".*/\1/p')
  type=$(printf '%s' "$line" | sed -n 's/.*"type":"\([^"]*\)".*/\1/p')
  case "$type" in
    get_state) printf '{"id":"%s","type":"response","command":"get_state","success":true,"data":{"sessionId":"s1","sessionFile":"/tmp/s1","isStreaming":false}}\n' "$id" ;;
    prompt)
      printf '{"id":"%s","type":"response","command":"prompt","success":true,"data":{"disposition":"started"}}\n' "$id"
      printf '{"type":"agent_start"}\n'
      for i in 1 2 3 4 5; do
        printf '{"type":"tool_execution_start","toolCallId":"p%s","toolName":"bash","args":{"command":"ls /secret/%s"}}\n' "$i" "$i"
        printf '{"type":"tool_execution_end","toolCallId":"p%s","toolName":"bash","result":{"content":[{"type":"text","text":"ls: /secret/%s: Operation not permitted"}]},"isError":true}\n' "$i" "$i"
      done ;;
    *) printf '{"id":"%s","type":"response","command":"%s","success":true,"data":{}}\n' "$id" "$type" ;;
  esac
done"#;
        let (_tmp, sup, id) = run_fake_engine_scenario(script).await;
        for _ in 0..100 {
            if sup.goal(&id).unwrap().summary.state == LifecycleState::Paused {
                break;
            }
            tokio::time::sleep(Duration::from_millis(100)).await;
        }
        let detail = sup.goal(&id).unwrap();
        assert_eq!(detail.summary.state, LifecycleState::Paused, "should pause early on repeated sandbox probing");
        let trace = sup.trace(&id, None, 200).unwrap();
        assert!(
            trace
                .iter()
                .any(|e| matches!(&e.event, EventKind::Stalled { detector, .. } if detector == "sandbox_probing")),
            "expected sandbox_probing stall event"
        );
    }
}
