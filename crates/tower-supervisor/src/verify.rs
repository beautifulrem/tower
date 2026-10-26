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

use crate::prompts::{self, Failure};
use crate::{Inner, Result, invalid, run};

const SETUP_TIMEOUT: Duration = Duration::from_secs(15 * 60);
const MIN_FREE: u64 = 2_000_000_000;

/// Free space on the volume holding `path`, from `df`.
fn free_bytes(path: &Path) -> Option<u64> {
    let out = std::process::Command::new("/bin/df").args(["-Pk"]).arg(path).output().ok()?;
    let text = String::from_utf8_lossy(&out.stdout);
    let kb: u64 = text.lines().nth(1)?.split_whitespace().nth(3)?.parse().ok()?;
    Some(kb * 1024)
}

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
    let commands: Vec<String> = rec
        .contract
        .machine_criteria()
        .filter_map(|c| match &c.kind {
            CriterionKind::Exec { command, .. } => Some(command.clone()),
            CriterionKind::Human => None,
        })
        .collect();
    let mut hits = tower_core::sentinel::scan_with(&files, &rec.contract.scope, &commands, lang);
    for h in &hits {
        append_hit(inner, goal, h)?;
    }

    let machine: Vec<_> = rec.contract.machine_criteria().cloned().collect();
    if machine.is_empty() {
        inner.append(goal, EventKind::VerifyFinished { pin: snap.pin.clone(), passed: true, env_error: false })?;
        inner.set_mode(goal, Mode::Idle)?;
        if let Some(high) = high_titles(&hits, lang) {
            return to_paused(inner, goal, PauseReason::SentinelHigh, &high);
        }
        let note = tr!(
            lang,
            "未经机器验证：合同没有可执行的标准",
            "Not machine-verified: the contract has no executable criteria"
        );
        inner.transition(goal, Transition::VerifyPassed, None, &note)?;
        review_ready(inner, goal, "")?;
        return Ok(());
    }

    // A checkout plus a cache clone can take gigabytes; a full disk would
    // fail halfway in confusing ways.
    if let Some(free) = free_bytes(&inner.paths.root)
        && free < MIN_FREE
    {
        let gb = format!("{:.1}", free as f64 / 1e9);
        inner.append(goal, EventKind::VerifyFinished { pin: snap.pin.clone(), passed: false, env_error: true })?;
        inner.set_mode(goal, Mode::Idle)?;
        let detail = tr!(
            lang,
            "磁盘只剩 {gb} GB，验证需要至少 2 GB。腾出空间后点“重新验证”。",
            "Only {gb} GB of disk space is left; verification needs at least 2 GB. Free some space, then verify again."
        );
        return to_paused(inner, goal, PauseReason::VerifyEnvError, &detail);
    }

    // 2. One clean checkout and one package cache, used in order of trust:
    // the base commit (your content) first, then the agent's snapshot.
    let bench = Bench::open(inner, goal, &rec, &ws, &base, cancel).await?;
    let outcome = bench.run_all(&snap.pin, &files).await;
    bench.close().await;
    let (outcome, extra) = outcome?;
    hits.extend(extra);

    if cancel.is_cancelled() {
        return Ok(());
    }
    inner.set_mode(goal, Mode::Idle)?;
    match outcome {
        Outcome::Passed if high_titles(&hits, lang).is_some() => {
            inner.append(goal, EventKind::VerifyFinished { pin: snap.pin.clone(), passed: true, env_error: false })?;
            let hits = high_titles(&hits, lang).unwrap_or_default();
            let detail = tr!(lang, "机器标准都通过了，但{hits}", "Every machine criterion passed, but: {hits}");
            to_paused(inner, goal, PauseReason::SentinelHigh, &detail)?;
        }
        Outcome::Passed => {
            inner.append(goal, EventKind::VerifyFinished { pin: snap.pin.clone(), passed: true, env_error: false })?;
            inner.transition(goal, Transition::VerifyPassed, None, "")?;
            review_ready(inner, goal, "")?;
        }
        Outcome::EnvError(detail) => {
            inner.append(goal, EventKind::VerifyFinished { pin: snap.pin.clone(), passed: false, env_error: true })?;
            to_paused(inner, goal, PauseReason::VerifyEnvError, &detail)?;
        }
        Outcome::SetupNeedsNetwork(tail) => {
            inner.append(goal, EventKind::VerifyFinished { pin: snap.pin.clone(), passed: false, env_error: true })?;
            let changed: Vec<&str> =
                files.iter().filter(|f| is_dependency_file(&f.path)).map(|f| f.path.as_str()).collect();
            let detail = if changed.is_empty() {
                tr!(
                    lang,
                    "合同不允许联网，准备命令在 Agent 的快照上离线运行失败；联网运行会执行 Agent 改过的内容。\n{tail}",
                    "The contract keeps the network off and setup failed offline on the agent's snapshot; running it with the network would execute content the agent changed.\n{tail}"
                )
            } else {
                let list = changed.join(", ");
                tr!(
                    lang,
                    "Agent 改了 {list}。合同不允许联网，离线准备失败；联网安装会运行这些改动选择的代码。\n{tail}",
                    "The agent changed {list}. The contract keeps the network off and setup failed offline; installing with the network runs code these changes chose.\n{tail}"
                )
            };
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

fn append_hit(inner: &Inner, goal: &str, h: &tower_core::sentinel::SentinelHit) -> Result<()> {
    inner.append(
        goal,
        EventKind::SentinelHit {
            sentinel: h.sentinel.clone(),
            severity: h.severity,
            title: h.title.clone(),
            detail: h.detail.clone(),
        },
    )?;
    Ok(())
}

/// The titles of high-severity hits, joined, if any.
fn high_titles(hits: &[tower_core::sentinel::SentinelHit], lang: Lang) -> Option<String> {
    let high: Vec<&str> =
        hits.iter().filter(|h| h.severity >= tower_core::sentinel::HIGH).map(|h| h.title.as_str()).collect();
    (!high.is_empty()).then(|| high.join(lang.pick("；", "; ")))
}

enum Outcome {
    Passed,
    Failed(Vec<Failure>),
    EnvError(String),
    /// Setup failed without the network on the agent's snapshot; the
    /// output tail.
    SetupNeedsNetwork(String),
}

/// The result of one command in the verification checkout.
struct Ran {
    passed: bool,
    environment_failure: bool,
    exit_code: Option<i32>,
    duration_ms: i64,
    output_tail: String,
}

/// One verification's workbench: a clean checkout and a fresh package
/// cache (seeded from the user's own, thrown away afterwards), used in
/// order of trust:
///
/// 1. checked out at the base commit — your content — setup runs with the
///    network, and the criteria that have no baseline yet run there
///    (red → green evidence);
/// 2. switched to the agent's snapshot — setup runs again, offline unless
///    the contract allows the network or you approved this snapshot —
///    then the criteria: the verdict;
/// 3. if the agent edited existing tests and everything passed, those
///    tests are put back as they were on the base and the criteria run
///    once more: passing only with the edits holds the goal.
///
/// Nothing the agent wrote influences step 1, and nothing from any step
/// survives the verification. Local files such as `.env` are present only
/// while criteria run, never during setup.
struct Bench<'a> {
    inner: &'a Arc<Inner>,
    goal: &'a str,
    rec: tower_store::GoalRecord,
    ws: String,
    base: String,
    dir: std::path::PathBuf,
    env: Vec<(String, String)>,
    online: Option<std::path::PathBuf>,
    offline: Option<std::path::PathBuf>,
    criteria: Option<std::path::PathBuf>,
    setup: Option<String>,
    cancel: &'a Cancel,
    _cache: RemoveOnDrop,
}

impl<'a> Bench<'a> {
    async fn open(
        inner: &'a Arc<Inner>,
        goal: &'a str,
        rec: &tower_store::GoalRecord,
        ws: &str,
        base: &str,
        cancel: &'a Cancel,
    ) -> Result<Bench<'a>> {
        let dir = inner.paths.verify(goal);
        let git = inner.git.clone();
        let (ws1, base1, dir1) = (ws.to_string(), base.to_string(), dir.clone());
        tokio::task::spawn_blocking(move || git.add_verify_checkout(Path::new(&ws1), &base1, &dir1))
            .await
            .map_err(|e| invalid(e.to_string()))??;
        let tmp = inner.paths.tmp(&format!("{goal}-verify"));
        let cache = inner.paths.root.join("verify-cache").join(goal);
        let _ = std::fs::remove_dir_all(&cache);
        let cleanup = RemoveOnDrop(cache.clone());
        let goal_dir = inner.paths.goal_dir(goal);
        let online = run::verifier_jail(inner, &goal_dir, &dir, &tmp, &cache, "verify-setup", true)?;
        let offline = run::verifier_jail(inner, &goal_dir, &dir, &tmp, &cache, "verify-setup-offline", false)?;
        let criteria = run::verifier_jail(inner, &goal_dir, &dir, &tmp, &cache, "verify", rec.contract.network)?;
        let mut env = inner.env.without_credentials();
        env.push(("CI".into(), "1".into()));
        env.extend(criteria.env);
        let project_setup = inner.store(|s| s.project(&rec.project_id))?.setup_command;
        let setup = if !rec.contract.setup.trim().is_empty() {
            Some(rec.contract.setup.clone())
        } else if !project_setup.trim().is_empty() {
            Some(project_setup)
        } else {
            Git::detect_setup_command(&dir)
        };
        Ok(Bench {
            inner,
            goal,
            rec: rec.clone(),
            ws: ws.to_string(),
            base: base.to_string(),
            dir,
            env,
            online: online.profile,
            offline: offline.profile,
            criteria: criteria.profile,
            setup,
            cancel,
            _cache: cleanup,
        })
    }

    async fn close(&self) {
        let git = self.inner.git.clone();
        let (ws, dir) = (self.ws.clone(), self.dir.clone());
        let _ = tokio::task::spawn_blocking(move || git.remove_verify_checkout(Path::new(&ws), &dir)).await;
    }

    async fn exec(&self, command: &str, profile: Option<&Path>, timeout: Duration) -> Ran {
        let spec = RunSpec::new(command_for(command, profile), &self.dir, self.env.clone(), timeout);
        let r = tower_verify::run(&spec, self.cancel).await;
        Ran {
            passed: r.passed(),
            environment_failure: r.is_environment_failure(),
            exit_code: r.exit_code(),
            duration_ms: r.duration_ms,
            output_tail: r.output_tail,
        }
    }

    /// Runs setup; `Some(result)` when it failed.
    async fn setup(&self, network: bool) -> Option<Ran> {
        let setup = self.setup.as_deref()?;
        let profile = if network { self.online.as_deref() } else { self.offline.as_deref() };
        let r = self.exec(setup, profile, SETUP_TIMEOUT).await;
        (!r.passed).then_some(r)
    }

    async fn checkout(&self, rev: &str) -> Result<()> {
        let git = self.inner.git.clone();
        let (dir, rev) = (self.dir.clone(), rev.to_string());
        tokio::task::spawn_blocking(move || git.checkout_detached(&dir, &rev))
            .await
            .map_err(|e| invalid(e.to_string()))??;
        Ok(())
    }

    /// Copies the project's local files in for the criteria; returns them
    /// so they can be removed before the next setup.
    async fn local_files(&self) -> Result<Vec<String>> {
        run::copy_local_files(self.inner, &self.rec, &self.dir).await
    }

    fn remove(&self, files: &[String]) {
        for f in files {
            let _ = std::fs::remove_file(self.dir.join(f));
        }
    }

    fn criteria_list(&self) -> Vec<(tower_core::contract::Criterion, String, u32)> {
        self.rec
            .contract
            .machine_criteria()
            .filter_map(|c| match &c.kind {
                CriterionKind::Exec { command, timeout_secs } => Some((c.clone(), command.clone(), *timeout_secs)),
                CriterionKind::Human => None,
            })
            .collect()
    }

    async fn run_all(
        &self,
        pin: &str,
        files: &[tower_core::view::DiffFile],
    ) -> Result<(Outcome, Vec<tower_core::sentinel::SentinelHit>)> {
        let (inner, goal) = (self.inner, self.goal);
        let lang = inner.lang();
        let criteria = self.criteria_list();

        // 1. The base, with your dependencies.
        if let Some(r) = self.setup(true).await {
            let tail = tail_lines(&r.output_tail, 20);
            let setup = self.setup.clone().unwrap_or_default();
            return Ok((
                Outcome::EnvError(tr!(
                    lang,
                    "准备命令 `{setup}` 在基线提交上就失败了（与 Agent 的改动无关）：\n{tail}",
                    "The setup command `{setup}` fails on the base commit itself (not because of the agent's changes):\n{tail}"
                )),
                Vec::new(),
            ));
        }
        let detail = inner.store(|s| s.detail(goal))?;
        let missing: Vec<&str> =
            detail.criteria.iter().filter(|c| c.passed_on_base.is_none()).map(|c| c.criterion.id.as_str()).collect();
        if criteria.iter().any(|(c, ..)| missing.contains(&c.id.as_str())) {
            let copied = self.local_files().await?;
            for (c, command, timeout) in criteria.iter().filter(|(c, ..)| missing.contains(&c.id.as_str())) {
                let r =
                    self.exec(command, self.criteria.as_deref(), Duration::from_secs((*timeout).max(1) as u64)).await;
                if !r.environment_failure {
                    inner.append(
                        goal,
                        EventKind::BaselineResult {
                            criterion: c.id.clone(),
                            command: command.clone(),
                            base: self.base.clone(),
                            passed: r.passed,
                        },
                    )?;
                }
            }
            self.remove(&copied);
        }

        // 2. The agent's snapshot.
        self.checkout(pin).await?;
        let network = setup_may_use_network(inner, &self.rec, goal, Some(pin))?;
        if let Some(setup) = self.setup.clone() {
            let failed = self.setup(network).await;
            inner.append(
                goal,
                EventKind::SetupFinished {
                    command: setup.clone(),
                    ok: failed.is_none(),
                    exit_code: failed.as_ref().and_then(|r| r.exit_code),
                    duration_ms: failed.as_ref().map_or(0, |r| r.duration_ms),
                },
            )?;
            if let Some(r) = failed {
                let tail = tail_lines(&r.output_tail, 20);
                if !network {
                    return Ok((Outcome::SetupNeedsNetwork(tail), Vec::new()));
                }
                let detail =
                    tr!(lang, "准备命令 `{setup}` 失败：\n{tail}", "The setup command `{setup}` failed:\n{tail}");
                return Ok((Outcome::EnvError(detail), Vec::new()));
            }
        }
        let copied = self.local_files().await?;
        if !copied.is_empty() {
            inner.append(goal, EventKind::LocalFilesCopied { files: copied.clone() })?;
        }
        let mut failures = Vec::new();
        for (c, command, timeout) in &criteria {
            if self.cancel.is_cancelled() {
                return Ok((Outcome::EnvError(tr!(lang, "验证被取消", "Verification was cancelled")), Vec::new()));
            }
            let r = self.exec(command, self.criteria.as_deref(), Duration::from_secs((*timeout).max(1) as u64)).await;
            if r.environment_failure {
                let id = &c.id;
                let how = match r.exit_code {
                    Some(code) => tr!(lang, "退出码 {code}", "exit code {code}"),
                    None => tr!(lang, "未启动", "did not start"),
                };
                let tail = tail_lines(&r.output_tail, 20);
                return Ok((
                    Outcome::EnvError(tr!(
                        lang,
                        "{id} 的命令 `{command}` 无法运行（{how}）：\n{tail}",
                        "The command `{command}` of {id} could not run ({how}):\n{tail}"
                    )),
                    Vec::new(),
                ));
            }
            inner.append(
                goal,
                EventKind::CriterionResult {
                    criterion: c.id.clone(),
                    pin: pin.into(),
                    passed: r.passed,
                    exit_code: r.exit_code,
                    duration_ms: r.duration_ms,
                    output_tail: r.output_tail.clone(),
                },
            )?;
            if !r.passed {
                failures.push(Failure {
                    id: c.id.clone(),
                    title: c.title.clone(),
                    command: command.clone(),
                    exit_code: r.exit_code,
                    output_tail: r.output_tail,
                });
            }
        }
        if !failures.is_empty() {
            return Ok((Outcome::Failed(failures), Vec::new()));
        }

        // 3. The same snapshot with the agent's edits to existing tests undone.
        let edited: Vec<&str> = files
            .iter()
            .filter(|f| {
                f.status == tower_core::view::FileStatus::Modified && tower_core::sentinel::is_test_path(&f.path)
            })
            .map(|f| f.path.as_str())
            .collect();
        if edited.is_empty() {
            return Ok((Outcome::Passed, Vec::new()));
        }
        for path in &edited {
            let git = inner.git.clone();
            let (ws, base, p) = (self.ws.clone(), self.base.clone(), path.to_string());
            let text = tokio::task::spawn_blocking(move || git.file_at(Path::new(&ws), &base, &p))
                .await
                .map_err(|e| invalid(e.to_string()))?;
            if let Some(text) = text {
                std::fs::write(self.dir.join(path), text)?;
            }
        }
        let mut depends = Vec::new();
        for (c, command, timeout) in &criteria {
            let r = self.exec(command, self.criteria.as_deref(), Duration::from_secs((*timeout).max(1) as u64)).await;
            if r.environment_failure {
                continue;
            }
            inner.append(
                goal,
                EventKind::OriginalTestsResult { criterion: c.id.clone(), pin: pin.into(), passed: r.passed },
            )?;
            if !r.passed {
                depends.push(c.id.clone());
            }
        }
        if depends.is_empty() {
            return Ok((Outcome::Passed, Vec::new()));
        }
        let detail = tr!(
            lang,
            "{ids} 只有在 Agent 改过的测试下才通过；恢复原来的测试后失败。被改的测试：{files}",
            "{ids} pass only with the agent's edits to existing tests and fail with the originals. Edited tests: {files}",
            ids = depends.join(", "),
            files = edited.join(", ")
        );
        let hit = tower_core::sentinel::SentinelHit {
            sentinel: "passes_only_with_edited_tests".into(),
            severity: tower_core::sentinel::HIGH,
            title: tower_core::i18n::sentinel_title("passes_only_with_edited_tests", lang).unwrap_or_default().into(),
            detail,
        };
        append_hit(inner, goal, &hit)?;
        Ok((Outcome::Passed, vec![hit]))
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

/// Whether setup on the agent's snapshot may use the network: when the
/// contract allows it, or when the human approved this very snapshot.
/// (Setup on the base, your own content, always may.)
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

/// Removes a directory when dropped (best effort).
struct RemoveOnDrop(std::path::PathBuf);

impl Drop for RemoveOnDrop {
    fn drop(&mut self) {
        let _ = std::fs::remove_dir_all(&self.0);
    }
}

pub(crate) fn review_ready(inner: &Arc<Inner>, goal: &str, _verdict: &str) -> Result<()> {
    let rec = inner.store(|s| s.goal(goal))?;
    inner.open_inbox(NewInboxItem {
        goal_id: goal.into(),
        kind: InboxKind::ReviewReady,
        title: {
            let title = &rec.title;
            tr!(inner.lang(), "待验收：{title}", "Ready to accept: {title}")
        },
        subject: rec.title.clone(),
        // Always the agent's own words (a claim: the card marks it so), or
        // empty; Tower's verdict is shown from facts, not from this text.
        body: rec.submit_summary.clone().unwrap_or_default(),
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
