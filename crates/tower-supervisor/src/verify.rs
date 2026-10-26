//! Verification (`docs/07`): re-run the machine criteria on a pinned
//! snapshot in a clean checkout, record each result as a fact, then decide
//! between review, automatic rework and pausing.

use std::path::Path;
use std::sync::Arc;
use std::time::Duration;

use tower_core::contract::CriterionKind;
use tower_core::i18n::plural;
use tower_core::lifecycle::Transition;
use tower_core::view::InboxKind;
use tower_core::{EventKind, Lang, LifecycleState, Mode, PauseReason, tr};
use tower_git::Git;
use tower_store::NewInboxItem;
use tower_verify::{Cancel, RunSpec};

use crate::api::ToastLevel;
use crate::prompts::{self, Failure};
use crate::{Inner, Result, invalid, run};

const SETUP_TIMEOUT: Duration = Duration::from_secs(15 * 60);

pub fn spawn(inner: Arc<Inner>, goal: String) {
    let cancel = Cancel::default();
    {
        let mut v = inner.verifications.lock().unwrap_or_else(std::sync::PoisonError::into_inner);
        if v.contains_key(&goal) {
            return;
        }
        v.insert(goal.clone(), cancel.clone());
    }
    tokio::spawn(async move {
        let result = verify(&inner, &goal, &cancel).await;
        inner.verifications.lock().unwrap_or_else(std::sync::PoisonError::into_inner).remove(&goal);
        if let Err(e) = result
            && !cancel.is_cancelled()
        {
            tracing::warn!(goal = %goal, error = %e, "verification failed to run");
            let message = tr!(inner.lang(), "验证没能完成：{e}", "Verification could not finish: {e}");
            let r = inner
                .append(&goal, EventKind::EngineError { message })
                .and_then(|_| inner.set_mode(&goal, Mode::Idle))
                .and_then(|_| to_paused(&inner, &goal, PauseReason::VerifyEnvError, &e.to_string()));
            run::report(&inner, &goal, r).await;
        }
    });
}

fn to_paused(inner: &Arc<Inner>, goal: &str, reason: PauseReason, detail: &str) -> Result<()> {
    let state = inner.store(|s| s.goal(goal))?.state;
    if state == LifecycleState::Verifying {
        // The edge out of verifying for a non-rework outcome.
        inner.transition(goal, Transition::VerifyFailed { rework: false }, Some(reason), detail)?;
        let rec = inner.store(|s| s.goal(goal))?;
        inner.open_inbox(run::paused_item(&rec, reason, detail, inner.lang(), false))?;
        Ok(())
    } else {
        run::pause_after_stop(inner, goal, reason, detail)
    }
}

/// The command a criterion runs, wrapped in the sandbox when available.
pub(crate) fn command_for(raw: &str, profile: Option<&Path>) -> String {
    match profile {
        Some(p) => format!(
            "exec /usr/bin/sandbox-exec -f {} /bin/sh -c {}",
            shell_quote(&p.to_string_lossy()),
            shell_quote(raw)
        ),
        None => raw.to_string(),
    }
}

fn shell_quote(s: &str) -> String {
    format!("'{}'", s.replace('\'', "'\\''"))
}

async fn verify(inner: &Arc<Inner>, goal: &str, cancel: &Cancel) -> Result<()> {
    let rec = inner.store(|s| s.goal(goal))?;
    let lang = inner.lang();
    let (Some(ws), Some(base)) = (rec.workspace.clone(), rec.base_commit.clone()) else {
        return Err(invalid(tr!(lang, "没有工作区，无法验证", "There is no workspace to verify")));
    };
    inner.set_mode(goal, Mode::Verifying)?;

    // 1. Pin the workspace.
    let git = inner.git.clone();
    let (ws2, base2) = (ws.clone(), base.clone());
    let snap = tokio::task::spawn_blocking(move || git.snapshot(Path::new(&ws2), &base2))
        .await
        .map_err(|e| invalid(e.to_string()))??;
    inner.append(
        goal,
        EventKind::Pinned {
            pin: snap.pin.clone(),
            files: snap.stat.files,
            additions: snap.stat.additions,
            deletions: snap.stat.deletions,
        },
    )?;
    if rec.state != LifecycleState::Verifying {
        inner.transition(goal, Transition::VerifyStarted, None, "")?;
    }
    inner.append(goal, EventKind::VerifyStarted { pin: snap.pin.clone() })?;

    // Sentinels look at what changed, which a passing run would hide.
    let git = inner.git.clone();
    let (ws5, base5, pin5) = (ws.clone(), base.clone(), snap.pin.clone());
    let files = tokio::task::spawn_blocking(move || git.diff(Path::new(&ws5), &base5, &pin5))
        .await
        .map_err(|e| invalid(e.to_string()))??;
    let hits = tower_core::sentinel::scan(&files, &rec.contract.scope, lang);
    for h in &hits {
        inner.append(
            goal,
            EventKind::SentinelHit {
                sentinel: h.sentinel.clone(),
                severity: h.severity,
                title: h.title.clone(),
                detail: h.detail.clone(),
            },
        )?;
    }
    let high: Vec<&str> =
        hits.iter().filter(|h| h.severity >= tower_core::sentinel::HIGH).map(|h| h.title.as_str()).collect();

    let machine: Vec<_> = rec.contract.machine_criteria().cloned().collect();
    if machine.is_empty() {
        inner.append(goal, EventKind::VerifyFinished { pin: snap.pin.clone(), passed: true, env_error: false })?;
        inner.set_mode(goal, Mode::Idle)?;
        if !high.is_empty() {
            return to_paused(inner, goal, PauseReason::SentinelHigh, &high.join(lang.pick("；", "; ")));
        }
        let note = tr!(
            lang,
            "未经机器验证：合同没有可执行的标准",
            "Not machine-verified: the contract has no executable criteria"
        );
        inner.transition(goal, Transition::VerifyPassed, None, &note)?;
        review_ready(
            inner,
            goal,
            &tr!(lang, "没有可执行的标准：请你判断结果", "No executable criteria: judge the result yourself"),
        )?;
        return Ok(());
    }

    // 2. Clean checkout of exactly the pin.
    let dir = inner.paths.verify(goal);
    let git = inner.git.clone();
    let (ws3, pin3, dir3) = (ws.clone(), snap.pin.clone(), dir.clone());
    tokio::task::spawn_blocking(move || git.add_verify_checkout(Path::new(&ws3), &pin3, &dir3))
        .await
        .map_err(|e| invalid(e.to_string()))??;
    let fingerprint = dependency_fingerprint(&files);
    let setup_network = setup_may_use_network(inner, &rec, goal, fingerprint.as_deref())?;
    let outcome = run_criteria(inner, goal, &rec.contract, &dir, Target::Pin(&snap.pin), setup_network, cancel).await;
    let git = inner.git.clone();
    let (ws4, dir4) = (ws.clone(), dir.clone());
    let _ = tokio::task::spawn_blocking(move || git.remove_verify_checkout(Path::new(&ws4), &dir4)).await;
    let outcome = outcome?;

    if cancel.is_cancelled() {
        return Ok(());
    }
    inner.set_mode(goal, Mode::Idle)?;
    match outcome {
        Outcome::Passed if !high.is_empty() => {
            spawn_baseline(inner.clone(), goal.to_string());
            inner.append(goal, EventKind::VerifyFinished { pin: snap.pin.clone(), passed: true, env_error: false })?;
            let hits = high.join(lang.pick("；", "; "));
            let detail = tr!(lang, "机器标准都通过了，但{hits}", "Every machine criterion passed, but: {hits}");
            to_paused(inner, goal, PauseReason::SentinelHigh, &detail)?;
        }
        Outcome::Passed => {
            inner.append(goal, EventKind::VerifyFinished { pin: snap.pin.clone(), passed: true, env_error: false })?;
            inner.transition(goal, Transition::VerifyPassed, None, "")?;
            let body = tr!(lang, "全部机器标准在干净环境中通过", "Every machine criterion passed in a clean checkout");
            review_ready(inner, goal, &body)?;
            spawn_baseline(inner.clone(), goal.to_string());
        }
        Outcome::EnvError(detail) => {
            inner.append(goal, EventKind::VerifyFinished { pin: snap.pin.clone(), passed: false, env_error: true })?;
            to_paused(inner, goal, PauseReason::VerifyEnvError, &detail)?;
        }
        Outcome::SetupNeedsNetwork(tail) => {
            inner.append(goal, EventKind::VerifyFinished { pin: snap.pin.clone(), passed: false, env_error: true })?;
            let changed: Vec<&str> =
                files.iter().filter(|f| is_dependency_file(&f.path)).map(|f| f.path.as_str()).collect();
            let list = changed.join(", ");
            let detail = tr!(
                lang,
                "Agent 改了 {list}。合同不允许联网，离线准备失败；联网安装会运行这些改动选择的代码。\n{tail}",
                "The agent changed {list}. The contract keeps the network off and setup failed offline; installing with the network runs code these changes chose.\n{tail}"
            );
            to_paused(inner, goal, PauseReason::DependenciesChanged, &detail)?;
        }
        Outcome::Failed(failures) => {
            inner.append(goal, EventKind::VerifyFinished { pin: snap.pin.clone(), passed: false, env_error: false })?;
            let rec = inner.store(|s| s.goal(goal))?;
            let can_rework = rec.rework_cycles < rec.contract.max_rework && rec.cost_usd < rec.contract.budget.hard_usd;
            if can_rework {
                let note = tr!(lang, "自动返工", "Automatic rework");
                inner.transition(goal, Transition::VerifyFailed { rework: true }, None, &note)?;
                let mut msg = prompts::rework(rec.rework_cycles + 1, rec.contract.max_rework, &failures);
                if !hits.is_empty() {
                    msg.push_str("\n\n");
                    msg.push_str(&prompts::sentinel_rework(&hits));
                }
                if let Err(e) = run::start_run(inner, goal, "rework", msg).await {
                    tracing::warn!(goal, error = %e, "rework did not start");
                }
            } else {
                let ids: Vec<_> = failures.iter().map(|f| f.id.as_str()).collect();
                let n = rec.rework_cycles;
                let detail = match lang {
                    Lang::Zh => format!("{} 未通过；已返工 {n} 次", ids.join("、")),
                    Lang::En => format!("{} failed after {}", ids.join(", "), plural(n as usize, "rework", "reworks")),
                };
                to_paused(inner, goal, PauseReason::VerifyFailedLimit, &detail)?;
            }
        }
    }
    Ok(())
}

/// What a criteria run checks.
#[derive(Clone, Copy)]
enum Target<'a> {
    /// The agent's pinned snapshot: the verdict.
    Pin(&'a str),
    /// The base commit, before any change (the baseline).
    Base(&'a str),
    /// The pinned snapshot with the agent's edits to existing tests undone.
    OriginalTests,
}

impl Target<'_> {
    fn name(self) -> &'static str {
        match self {
            Target::Pin(_) => "verify",
            Target::Base(_) => "base",
            Target::OriginalTests => "orig",
        }
    }
}

/// Manifests, lockfiles and package-manager configuration: what decides
/// which third-party code an install downloads and runs.
const DEPENDENCY_FILES: &[&str] = &[
    "package.json",
    "package-lock.json",
    "npm-shrinkwrap.json",
    "pnpm-lock.yaml",
    "pnpm-workspace.yaml",
    "yarn.lock",
    ".yarnrc",
    ".yarnrc.yml",
    ".npmrc",
    "bun.lock",
    "bun.lockb",
    "Cargo.toml",
    "Cargo.lock",
    "pyproject.toml",
    "setup.py",
    "setup.cfg",
    "Pipfile",
    "Pipfile.lock",
    "poetry.lock",
    "uv.lock",
    "go.mod",
    "go.sum",
    "Gemfile",
    "Gemfile.lock",
    "composer.json",
    "composer.lock",
];

pub(crate) fn is_dependency_file(path: &str) -> bool {
    let name = path.rsplit('/').next().unwrap_or(path);
    DEPENDENCY_FILES.contains(&name)
        || (name.starts_with("requirements") && name.ends_with(".txt"))
        || path.starts_with(".cargo/config")
        || path.contains("/.cargo/config")
}

/// A fingerprint of the agent's dependency changes (base → pin), or `None`
/// when it changed none.
fn dependency_fingerprint(files: &[tower_core::view::DiffFile]) -> Option<String> {
    use std::hash::{Hash, Hasher};
    let deps: Vec<_> = files.iter().filter(|f| is_dependency_file(&f.path)).collect();
    if deps.is_empty() {
        return None;
    }
    let mut h = std::collections::hash_map::DefaultHasher::new();
    for f in deps {
        f.path.hash(&mut h);
        for line in f.hunks.iter().flat_map(|h| &h.lines) {
            (line.kind as u8).hash(&mut h);
            line.text.hash(&mut h);
        }
    }
    Some(format!("{:016x}", h.finish()))
}

/// The fingerprint of the goal's current dependency changes, for recording
/// the human's approval.
pub(crate) async fn current_dependency_fingerprint(inner: &Arc<Inner>, goal: &str) -> Result<Option<String>> {
    let rec = inner.store(|s| s.goal(goal))?;
    let (Some(ws), Some(base), Some(pin)) = (rec.workspace, rec.base_commit, rec.pin) else { return Ok(None) };
    let git = inner.git.clone();
    let files = tokio::task::spawn_blocking(move || git.diff(Path::new(&ws), &base, &pin))
        .await
        .map_err(|e| invalid(e.to_string()))??;
    Ok(dependency_fingerprint(&files))
}

/// Whether verification's setup may use the network. It runs what the
/// manifests say; when the agent changed them under a contract without the
/// network, that would let the agent's choices reach the network, so it
/// needs the human's approval of exactly these changes.
fn setup_may_use_network(
    inner: &Inner,
    rec: &tower_store::GoalRecord,
    goal: &str,
    fingerprint: Option<&str>,
) -> Result<bool> {
    let Some(fp) = fingerprint else { return Ok(true) };
    if rec.contract.network {
        return Ok(true);
    }
    let approved = inner.store(|s| s.last_event(goal, "setup_network_approved"))?;
    Ok(matches!(approved.map(|e| e.event), Some(EventKind::SetupNetworkApproved { fingerprint }) if fingerprint == fp))
}

/// Background evidence after a passing verification, neither of which
/// gates review:
/// - the baseline: each criterion on a clean checkout of the base commit.
///   One that already passes before any change proves nothing about the
///   goal; the interface says so next to its green result;
/// - original tests: when the agent edited existing tests, the criteria run
///   again with those edits undone. Passing only with the edits is
///   reported as a sentinel hit.
pub(crate) fn spawn_baseline(inner: Arc<Inner>, goal: String) {
    tokio::spawn(async move {
        if let Err(e) = baseline(&inner, &goal).await {
            tracing::info!(goal = %goal, error = %e, "baseline check did not run");
        }
        if let Err(e) = original_tests(&inner, &goal).await {
            tracing::info!(goal = %goal, error = %e, "original-tests check did not run");
        }
    });
}

async fn baseline(inner: &Arc<Inner>, goal: &str) -> Result<()> {
    let rec = inner.store(|s| s.goal(goal))?;
    let (Some(ws), Some(base)) = (rec.workspace.clone(), rec.base_commit.clone()) else { return Ok(()) };
    let detail = inner.store(|s| s.detail(goal))?;
    let missing: Vec<String> = detail
        .criteria
        .iter()
        .filter(|c| matches!(c.criterion.kind, CriterionKind::Exec { .. }) && c.passed_on_base.is_none())
        .map(|c| c.criterion.id.clone())
        .collect();
    if missing.is_empty() {
        return Ok(());
    }
    let mut contract = rec.contract.clone();
    contract.criteria.retain(|c| missing.contains(&c.id));

    let dir = inner.paths.verify(&format!("{goal}-base"));
    let git = inner.git.clone();
    let (ws1, base1, dir1) = (ws.clone(), base.clone(), dir.clone());
    tokio::task::spawn_blocking(move || git.add_verify_checkout(Path::new(&ws1), &base1, &dir1))
        .await
        .map_err(|e| invalid(e.to_string()))??;
    // The base's dependencies are the user's own: setup may use the network.
    let outcome = run_criteria(inner, goal, &contract, &dir, Target::Base(&base), true, &Cancel::default()).await;
    let git = inner.git.clone();
    let _ = tokio::task::spawn_blocking(move || git.remove_verify_checkout(Path::new(&ws), &dir)).await;
    outcome.map(|_| ())
}

async fn original_tests(inner: &Arc<Inner>, goal: &str) -> Result<()> {
    let rec = inner.store(|s| s.goal(goal))?;
    let (Some(ws), Some(base), Some(pin)) = (rec.workspace.clone(), rec.base_commit.clone(), rec.pin.clone()) else {
        return Ok(());
    };
    if rec.verified_pin.as_deref() != Some(pin.as_str()) {
        return Ok(());
    }
    let git = inner.git.clone();
    let (ws1, base1, pin1) = (ws.clone(), base.clone(), pin.clone());
    let files = tokio::task::spawn_blocking(move || git.diff(Path::new(&ws1), &base1, &pin1))
        .await
        .map_err(|e| invalid(e.to_string()))??;
    let edited: Vec<String> = files
        .iter()
        .filter(|f| f.status == tower_core::view::FileStatus::Modified && tower_core::sentinel::is_test_path(&f.path))
        .map(|f| f.path.clone())
        .collect();
    if edited.is_empty() {
        return Ok(());
    }
    let fingerprint = dependency_fingerprint(&files);
    if !setup_may_use_network(inner, &rec, goal, fingerprint.as_deref())? {
        return Ok(());
    }
    let dir = inner.paths.verify(&format!("{goal}-orig"));
    let git = inner.git.clone();
    let (ws1, pin1, dir1, base1, edited1) = (ws.clone(), pin.clone(), dir.clone(), base.clone(), edited.clone());
    tokio::task::spawn_blocking(move || -> Result<()> {
        git.add_verify_checkout(Path::new(&ws1), &pin1, &dir1)?;
        for path in &edited1 {
            if let Some(text) = git.file_at(Path::new(&ws1), &base1, path) {
                std::fs::write(dir1.join(path), text)?;
            }
        }
        Ok(())
    })
    .await
    .map_err(|e| invalid(e.to_string()))??;
    let outcome = run_criteria(inner, goal, &rec.contract, &dir, Target::OriginalTests, true, &Cancel::default()).await;
    let git = inner.git.clone();
    let _ = tokio::task::spawn_blocking(move || git.remove_verify_checkout(Path::new(&ws), &dir)).await;
    if let Outcome::Failed(failures) = outcome? {
        let lang = inner.lang();
        let ids: Vec<&str> = failures.iter().map(|f| f.id.as_str()).collect();
        let detail = tr!(
            lang,
            "{ids} 在恢复原来的测试后失败；被改的测试：{files}",
            "{ids} fail with the original tests restored; edited tests: {files}",
            ids = ids.join(", "),
            files = edited.join(", ")
        );
        let title = tower_core::i18n::sentinel_title("passes_only_with_edited_tests", lang).unwrap_or_default();
        inner.append(
            goal,
            EventKind::SentinelHit {
                sentinel: "passes_only_with_edited_tests".into(),
                severity: 2,
                title: title.into(),
                detail: detail.clone(),
            },
        )?;
        inner.toast(goal, ToastLevel::Warning, format!("{title}: {detail}"));
    }
    Ok(())
}

enum Outcome {
    Passed,
    Failed(Vec<Failure>),
    EnvError(String),
    /// Setup failed without the network after the agent changed
    /// dependencies; the output tail.
    SetupNeedsNetwork(String),
}

async fn run_criteria(
    inner: &Arc<Inner>,
    goal: &str,
    contract: &tower_core::Contract,
    dir: &Path,
    target: Target<'_>,
    setup_network: bool,
    cancel: &Cancel,
) -> Result<Outcome> {
    let lang = inner.lang();
    let rec = inner.store(|s| s.goal(goal))?;
    let name = target.name();
    let tmp = inner.paths.tmp(&format!("{goal}-{name}"));
    // A fresh package cache for every run, seeded from the user's own and
    // thrown away afterwards: nothing the agent wrote can reach a verdict.
    let cache = inner.paths.root.join("verify-cache").join(format!("{goal}-{name}"));
    let _ = std::fs::remove_dir_all(&cache);
    let _cleanup = RemoveOnDrop(cache.clone());
    // Setup may download dependencies (see `setup_may_use_network`); the
    // criteria get the network only when the contract allows it.
    let setup_jail = run::verifier_jail(inner, &rec, dir, &tmp, &cache, &format!("{name}-setup"), setup_network)?;
    let jail = run::verifier_jail(inner, &rec, dir, &tmp, &cache, name, contract.network)?;
    let profile = jail.profile.clone();
    let mut env = inner.env.without_credentials();
    env.push(("CI".into(), "1".into()));
    env.extend(jail.env);

    let project_setup = inner.store(|s| s.project(&rec.project_id))?.setup_command;
    let setup = if !contract.setup.trim().is_empty() {
        Some(contract.setup.clone())
    } else if !project_setup.trim().is_empty() {
        Some(project_setup)
    } else {
        Git::detect_setup_command(dir)
    };
    if let Some(setup) = setup {
        let spec = RunSpec::new(command_for(&setup, setup_jail.profile.as_deref()), dir, env.clone(), SETUP_TIMEOUT);
        let r = tower_verify::run(&spec, cancel).await;
        if let Target::Pin(_) = target {
            inner.append(
                goal,
                EventKind::SetupFinished {
                    command: setup.clone(),
                    ok: r.passed(),
                    exit_code: r.exit_code(),
                    duration_ms: r.duration_ms,
                },
            )?;
        }
        if !r.passed() {
            let tail = tail_lines(&r.output_tail, 20);
            if !setup_network {
                return Ok(Outcome::SetupNeedsNetwork(tail));
            }
            let detail = tr!(lang, "准备命令 `{setup}` 失败：\n{tail}", "The setup command `{setup}` failed:\n{tail}");
            return Ok(Outcome::EnvError(detail));
        }
    }
    // Ignored local files (e.g. `.env`) are not in the snapshot; tests may
    // need them. Copied after setup, so install scripts never see them.
    let copied = run::copy_local_files(inner, &rec, dir).await?;
    if let (Target::Pin(_), false) = (target, copied.is_empty()) {
        inner.append(goal, EventKind::LocalFilesCopied { files: copied })?;
    }

    let mut failures = Vec::new();
    for c in contract.machine_criteria() {
        if cancel.is_cancelled() {
            return Ok(Outcome::EnvError(tr!(lang, "验证被取消", "Verification was cancelled")));
        }
        let CriterionKind::Exec { command, timeout_secs } = &c.kind else { continue };
        let spec = RunSpec::new(
            command_for(command, profile.as_deref()),
            dir,
            env.clone(),
            Duration::from_secs((*timeout_secs).max(1) as u64),
        );
        let r = tower_verify::run(&spec, cancel).await;
        if r.is_environment_failure() {
            let id = &c.id;
            let how = match r.exit_code() {
                Some(code) => tr!(lang, "退出码 {code}", "exit code {code}"),
                None => tr!(lang, "未启动", "did not start"),
            };
            let tail = tail_lines(&r.output_tail, 20);
            return Ok(Outcome::EnvError(tr!(
                lang,
                "{id} 的命令 `{command}` 无法运行（{how}）：\n{tail}",
                "The command `{command}` of {id} could not run ({how}):\n{tail}"
            )));
        }
        let pin = match target {
            Target::Pin(pin) => pin,
            Target::OriginalTests => {
                if !r.passed() {
                    failures.push(Failure {
                        id: c.id.clone(),
                        title: c.title.clone(),
                        command: command.clone(),
                        exit_code: r.exit_code(),
                        output_tail: r.output_tail,
                    });
                }
                continue;
            }
            Target::Base(base) => {
                let event = EventKind::BaselineResult {
                    criterion: c.id.clone(),
                    command: command.clone(),
                    base: base.into(),
                    passed: r.passed(),
                };
                inner.append(goal, event)?;
                continue;
            }
        };
        inner.append(
            goal,
            EventKind::CriterionResult {
                criterion: c.id.clone(),
                pin: pin.into(),
                passed: r.passed(),
                exit_code: r.exit_code(),
                duration_ms: r.duration_ms,
                output_tail: r.output_tail.clone(),
            },
        )?;
        if !r.passed() {
            failures.push(Failure {
                id: c.id.clone(),
                title: c.title.clone(),
                command: command.clone(),
                exit_code: r.exit_code(),
                output_tail: r.output_tail,
            });
        }
    }
    Ok(if failures.is_empty() { Outcome::Passed } else { Outcome::Failed(failures) })
}

/// Removes a directory when dropped (best effort).
struct RemoveOnDrop(std::path::PathBuf);

impl Drop for RemoveOnDrop {
    fn drop(&mut self) {
        let _ = std::fs::remove_dir_all(&self.0);
    }
}

pub(crate) fn review_ready(inner: &Arc<Inner>, goal: &str, body: &str) -> Result<()> {
    let rec = inner.store(|s| s.goal(goal))?;
    inner.open_inbox(NewInboxItem {
        goal_id: goal.into(),
        kind: InboxKind::ReviewReady,
        title: {
            let title = &rec.title;
            tr!(inner.lang(), "待验收：{title}", "Ready to accept: {title}")
        },
        subject: rec.title.clone(),
        body: body.into(),
        options: Vec::new(),
        allow_text: false,
        urgency: 3,
        engine_ref: None,
    })?;
    Ok(())
}

fn tail_lines(s: &str, n: usize) -> String {
    let lines: Vec<&str> = s.lines().collect();
    lines[lines.len().saturating_sub(n)..].join("\n")
}
