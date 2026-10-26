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
/// Sandbox refusals in one goal that make it a pattern rather than an accident.
const PROBING_THRESHOLD: usize = 5;

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
            CriterionKind::Human | CriterionKind::Look { .. } => None,
        })
        .collect();
    let mut hits = tower_core::sentinel::scan_with(&files, &rec.contract.scope, &commands, lang);
    // Repeated refusals by the sandbox: the agent looked for something
    // outside its workspace (often the held-out tests).
    let denied = inner.store(|s| s.denied_tools(goal))?;
    if denied.len() >= PROBING_THRESHOLD {
        let n = denied.len();
        let last: Vec<&str> = denied.iter().rev().take(5).map(String::as_str).collect();
        let list = last.join("\n");
        let detail = tr!(
            lang,
            "沙箱拒绝了 {n} 次越界访问，最近几次：\n{list}",
            "The sandbox refused {n} accesses outside the workspace; the latest:\n{list}"
        );
        hits.push(tower_core::sentinel::SentinelHit {
            sentinel: "sandbox_probing".into(),
            severity: 2,
            title: tower_core::i18n::sentinel_title("sandbox_probing", lang).unwrap_or_default().into(),
            detail,
        });
    }
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
        Outcome::HeldOutFailed(failures) => {
            inner.append(goal, EventKind::VerifyFinished { pin: snap.pin.clone(), passed: false, env_error: false })?;
            // For you: which ones and how they failed. The agent hears
            // nothing until you decide what it should.
            let mut detail = tr!(
                lang,
                "可见的标准都通过了，保留测试没有通过。Agent 不知道这些测试，也没有看到下面的输出。",
                "Every visible criterion passed; the held-out tests did not. The agent does not know these tests and has not seen the output below."
            );
            for f in &failures {
                let tail = tail_lines(&f.output_tail, 12);
                detail.push_str(&format!("\n\n{} · {}\n{tail}", f.id, f.title));
            }
            to_paused(inner, goal, PauseReason::HeldOutFailed, &detail)?;
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
    /// The visible criteria passed and the held-out tests did not.
    HeldOutFailed(Vec<Failure>),
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
///    then the criteria, without the held-out tests: the verdict the agent
///    may hear about;
/// 3. the held-out tests copied in, offline: their results go to you only;
/// 4. the agent's changes outside the source (tests, configuration,
///    scripts, package settings) put back as on the base, and the criteria
///    once more: a pass must come from the source;
/// 5. a test that must fail added to the test files, and the criteria that
///    proved the change once more: it must fail.
///
/// Every tracked file is reset to the snapshot between steps. The paths are
/// new for every verification, and whatever it started is stopped when it
/// ends, so nothing from one run reaches the next. Nothing the agent wrote
/// influences step 1. Local files such as `.env` are present only while
/// criteria run, never during setup.
struct Bench<'a> {
    inner: &'a Arc<Inner>,
    goal: &'a str,
    rec: tower_store::GoalRecord,
    ws: String,
    base: String,
    dir: std::path::PathBuf,
    tmp: std::path::PathBuf,
    env: Vec<(String, String)>,
    online: Option<std::path::PathBuf>,
    offline: Option<std::path::PathBuf>,
    criteria: Option<std::path::PathBuf>,
    /// Criteria with the held-out tests present: never the network.
    held_out_profile: Option<std::path::PathBuf>,
    setup: Option<String>,
    /// The project's held-out test patterns.
    holdout: Vec<String>,
    cancel: &'a Cancel,
    _cache: RemoveOnDrop,
}

/// What a step found besides the verdict.
type Found = Vec<tower_core::sentinel::SentinelHit>;

type Exec = (tower_core::contract::Criterion, String, u32);

impl<'a> Bench<'a> {
    async fn open(
        inner: &'a Arc<Inner>,
        goal: &'a str,
        rec: &tower_store::GoalRecord,
        ws: &str,
        base: &str,
        cancel: &'a Cancel,
    ) -> Result<Bench<'a>> {
        let run_id = uuid::Uuid::new_v4().simple().to_string();
        let short = &run_id[..12];
        // New paths every time: a process that outlived an earlier
        // verification can only reach that one's (deleted) directories.
        let roots = [
            inner.paths.verify(goal),
            inner.paths.tmp(&format!("{goal}-verify")),
            inner.paths.root.join("verify-cache").join(goal),
        ];
        for r in &roots {
            let _ = std::fs::remove_dir_all(r);
        }
        let [dir, tmp, cache] = roots.map(|r| r.join(short));
        let git = inner.git.clone();
        let (root1, base1, dir1) = (rec.project_root.clone(), base.to_string(), dir.clone());
        tokio::task::spawn_blocking(move || git.trusted_checkout(Path::new(&root1), &base1, &dir1))
            .await
            .map_err(|e| invalid(e.to_string()))??;
        let cleanup = RemoveOnDrop(cache.clone());
        let goal_dir = inner.paths.goal_dir(goal);
        let online = run::verifier_jail(inner, &goal_dir, &dir, &tmp, &cache, "verify-setup", true)?;
        let offline = run::verifier_jail(inner, &goal_dir, &dir, &tmp, &cache, "verify-setup-offline", false)?;
        let criteria = run::verifier_jail(inner, &goal_dir, &dir, &tmp, &cache, "verify", rec.contract.network)?;
        let held_out = run::verifier_jail(inner, &goal_dir, &dir, &tmp, &cache, "verify-held-out", false)?;
        let mut env = inner.env.without_credentials();
        env.push(("CI".into(), "1".into()));
        env.extend(criteria.env);
        let project = inner.store(|s| s.project(&rec.project_id))?;
        let holdout: Vec<String> = project.holdout_files.iter().filter(|p| !p.trim().is_empty()).cloned().collect();
        let project_setup = project.setup_command;
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
            tmp,
            env,
            online: online.profile,
            offline: offline.profile,
            criteria: criteria.profile,
            held_out_profile: held_out.profile,
            setup,
            holdout,
            cancel,
            _cache: cleanup,
        })
    }

    async fn close(&self) {
        let (dir, tmp) = (self.dir.clone(), self.tmp.clone());
        let _ = tokio::task::spawn_blocking(move || {
            stop_survivors(&[dir.clone(), tmp.clone()]);
            let _ = std::fs::remove_dir_all(&dir);
            let _ = std::fs::remove_dir_all(&tmp);
        })
        .await;
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

    /// Copies the project's local files in for the criteria (and its
    /// held-out tests, when asked); returns them so they can be removed
    /// before the next setup.
    async fn local_files(&self, held_out: bool) -> Result<Vec<String>> {
        let mut files = run::copy_local_files(self.inner, &self.rec, &self.dir).await?;
        if held_out {
            files.extend(self.copy_held_out().await?);
        }
        Ok(files)
    }

    async fn copy_held_out(&self) -> Result<Vec<String>> {
        if self.holdout.is_empty() {
            return Ok(Vec::new());
        }
        let git = self.inner.git.clone();
        let (root, dest, patterns) =
            (std::path::PathBuf::from(&self.rec.project_root), self.dir.clone(), self.holdout.clone());
        let held = tokio::task::spawn_blocking(move || git.copy_local_files(&root, &dest, &patterns))
            .await
            .map_err(|e| invalid(e.to_string()))??;
        Ok(held)
    }

    fn remove(&self, files: &[String]) {
        for f in files {
            let _ = std::fs::remove_file(self.dir.join(f));
        }
    }

    /// Puts every tracked file back to `rev`.
    async fn reset(&self, rev: &str) -> Result<()> {
        let git = self.inner.git.clone();
        let (dir, rev) = (self.dir.clone(), rev.to_string());
        tokio::task::spawn_blocking(move || git.reset_tracked(&dir, &rev))
            .await
            .map_err(|e| invalid(e.to_string()))??;
        Ok(())
    }

    fn criteria_list(&self) -> Vec<Exec> {
        self.rec
            .contract
            .machine_criteria()
            .filter_map(|c| match &c.kind {
                CriterionKind::Exec { command, timeout_secs } => Some((c.clone(), command.clone(), *timeout_secs)),
                CriterionKind::Human | CriterionKind::Look { .. } => None,
            })
            .collect()
    }

    /// Screenshots for `look` criteria on the current checkout.
    async fn capture_looks(&self, ids: &[String], side: &str, rev: &str) -> Result<()> {
        for c in self.rec.contract.criteria.iter().filter(|c| ids.contains(&c.id)) {
            let CriterionKind::Look { start, url, timeout_secs } = &c.kind else { continue };
            let short: String = rev.chars().take(10).collect();
            let out =
                self.inner.paths.root.join("evidence").join(self.goal).join(format!("{}-{side}-{short}.png", c.id));
            let r = crate::look::capture(
                &self.dir,
                &self.env,
                self.criteria.as_deref(),
                start,
                url,
                Duration::from_secs((*timeout_secs).max(5) as u64),
                self.rec.contract.network,
                &out,
            )
            .await;
            let (file, error) = match r {
                Ok(p) => (Some(p.display().to_string()), None),
                Err(e) => (None, Some(e)),
            };
            self.inner.append(
                self.goal,
                EventKind::LookCaptured { criterion: c.id.clone(), side: side.into(), pin: rev.into(), file, error },
            )?;
        }
        Ok(())
    }

    fn env_error(&self, id: &str, command: &str, r: &Ran) -> Outcome {
        let lang = self.inner.lang();
        let how = match r.exit_code {
            Some(code) => tr!(lang, "退出码 {code}", "exit code {code}"),
            None => tr!(lang, "未启动", "did not start"),
        };
        let tail = tail_lines(&r.output_tail, 20);
        Outcome::EnvError(tr!(
            lang,
            "{id} 的命令 `{command}` 无法运行（{how}）：\n{tail}",
            "The command `{command}` of {id} could not run ({how}):\n{tail}"
        ))
    }

    async fn run_all(&self, pin: &str, files: &[tower_core::view::DiffFile]) -> Result<(Outcome, Found)> {
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
        let looks_missing: Vec<String> = detail
            .criteria
            .iter()
            .filter(|c| matches!(c.criterion.kind, CriterionKind::Look { .. }))
            .filter(|c| c.look.as_ref().is_none_or(|l| l.base.is_none() && l.base_error.is_none()))
            .map(|c| c.criterion.id.clone())
            .collect();
        if !looks_missing.is_empty() {
            let copied = self.local_files(false).await?;
            self.capture_looks(&looks_missing, "base", &self.base.clone()).await?;
            self.remove(&copied);
        }
        let mut red_on_base: Vec<String> = detail
            .criteria
            .iter()
            .filter(|c| c.passed_on_base == Some(false))
            .map(|c| c.criterion.id.clone())
            .collect();
        if criteria.iter().any(|(c, ..)| missing.contains(&c.id.as_str())) {
            // Your content: the held-out tests may be present.
            let copied = self.local_files(true).await?;
            for (c, command, timeout) in criteria.iter().filter(|(c, ..)| missing.contains(&c.id.as_str())) {
                let r =
                    self.exec(command, self.criteria.as_deref(), Duration::from_secs((*timeout).max(1) as u64)).await;
                // Recorded either way: "could not check" is information too.
                let error = r.environment_failure.then(|| {
                    let code = r.exit_code.map_or_else(|| "did not start".to_string(), |c| format!("exit code {c}"));
                    format!("could not run on the base ({code}): {}", tail_lines(&r.output_tail, 3))
                });
                if !r.passed && error.is_none() {
                    red_on_base.push(c.id.clone());
                }
                inner.append(
                    goal,
                    EventKind::BaselineResult {
                        criterion: c.id.clone(),
                        command: command.clone(),
                        base: self.base.clone(),
                        passed: r.passed && error.is_none(),
                        error,
                    },
                )?;
            }
            self.remove(&copied);
        }

        // 2. The agent's snapshot.
        let git = inner.git.clone();
        let (dir, ws, p) = (self.dir.clone(), self.ws.clone(), pin.to_string());
        tokio::task::spawn_blocking(move || git.switch_to_pin(&dir, Path::new(&ws), &p))
            .await
            .map_err(|e| invalid(e.to_string()))??;
        // Leftovers of the base phase that git does not track (outputs of the
        // base's criteria) must not leak into the agent's verdict; ignored
        // files such as installed dependencies stay.
        let git = inner.git.clone();
        let dir = self.dir.clone();
        let _ = tokio::task::spawn_blocking(move || git.clean_untracked(&dir)).await;
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
        // What is verified is the snapshot, not what setup made of it.
        self.reset(pin).await?;
        let copied = self.local_files(false).await?;
        if !copied.is_empty() {
            inner.append(goal, EventKind::LocalFilesCopied { files: copied.clone() })?;
        }
        let mut failures = Vec::new();
        for (c, command, timeout) in criteria.iter().filter(|(_, command, _)| !names_held_out(&self.holdout, command)) {
            if self.cancel.is_cancelled() {
                return Ok((Outcome::EnvError(tr!(lang, "验证被取消", "Verification was cancelled")), Vec::new()));
            }
            let r = self.exec(command, self.criteria.as_deref(), Duration::from_secs((*timeout).max(1) as u64)).await;
            if r.environment_failure {
                return Ok((self.env_error(&c.id, command, &r), Vec::new()));
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
                    held_out: false,
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
        let looks: Vec<String> = self
            .rec
            .contract
            .criteria
            .iter()
            .filter(|c| matches!(c.kind, CriterionKind::Look { .. }))
            .map(|c| c.id.clone())
            .collect();
        self.capture_looks(&looks, "pin", pin).await?;
        if !failures.is_empty() {
            return Ok((Outcome::Failed(failures), Vec::new()));
        }

        let mut found = Vec::new();
        // 3. The held-out tests, for you only.
        let held_set: Vec<&Exec> = if self.holdout.is_empty() {
            Vec::new()
        } else if criteria.iter().any(|(_, command, _)| names_held_out(&self.holdout, command)) {
            criteria.iter().filter(|(_, command, _)| names_held_out(&self.holdout, command)).collect()
        } else {
            // The project's own test command finds them where they are.
            criteria.iter().collect()
        };
        let mut held_files = Vec::new();
        if !held_set.is_empty() {
            self.reset(pin).await?;
            held_files = self.copy_held_out().await?;
            let mut held_failures = Vec::new();
            for (c, command, timeout) in &held_set {
                let r = self
                    .exec(command, self.held_out_profile.as_deref(), Duration::from_secs((*timeout).max(1) as u64))
                    .await;
                if r.environment_failure {
                    return Ok((self.env_error(&c.id, command, &r), found));
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
                        held_out: true,
                    },
                )?;
                if !r.passed {
                    held_failures.push(Failure {
                        id: c.id.clone(),
                        title: c.title.clone(),
                        command: command.clone(),
                        exit_code: r.exit_code,
                        output_tail: r.output_tail,
                    });
                }
            }
            // The tests themselves must come out as they went in.
            let root = Path::new(&self.rec.project_root);
            let changed = held_files
                .iter()
                .filter(|f| std::fs::read(root.join(f)).ok() != std::fs::read(self.dir.join(f)).ok())
                .count();
            if changed > 0 {
                let detail = tr!(
                    lang,
                    "运行期间有 {changed} 个保留测试文件被改写（为了不让 Agent 知道，这里不列出文件名）",
                    "{changed} held-out test file(s) were rewritten while the criteria ran (not named here, so the agent cannot learn them)"
                );
                let hit = sentinel_hit("held_out_tests_changed", detail, lang);
                append_hit(inner, goal, &hit)?;
                found.push(hit);
            }
            if !held_failures.is_empty() {
                return Ok((Outcome::HeldOutFailed(held_failures), found));
            }
        }

        // 4. Only the source changes kept.
        let mut paths: Vec<&str> = Vec::new();
        for f in files {
            for p in std::iter::once(f.path.as_str()).chain(f.old_path.as_deref()) {
                if !tower_core::roles::role(p).kept_in_source_only_run(p) && !paths.contains(&p) {
                    paths.push(p);
                }
            }
        }
        if !paths.is_empty() {
            self.reset(pin).await?;
            if !held_files.is_empty() {
                held_files = self.copy_held_out().await?;
            }
            for path in &paths {
                let git = inner.git.clone();
                // From your repository, not the agent's workspace.
                let (root, base, p) = (self.rec.project_root.clone(), self.base.clone(), path.to_string());
                let text = tokio::task::spawn_blocking(move || git.file_at(Path::new(&root), &base, &p))
                    .await
                    .map_err(|e| invalid(e.to_string()))?;
                match text {
                    Some(text) => tower_git::write_inside(&self.dir, path, text.as_bytes())?,
                    None => {
                        let _ = std::fs::remove_file(self.dir.join(path));
                    }
                }
            }
            let profile =
                if held_files.is_empty() { self.criteria.as_deref() } else { self.held_out_profile.as_deref() };
            let mut depends = Vec::new();
            for (c, command, timeout) in &criteria {
                // A command that runs a file no longer there says nothing.
                if paths_gone(&self.dir, command) || (held_files.is_empty() && names_held_out(&self.holdout, command)) {
                    continue;
                }
                let r = self.exec(command, profile, Duration::from_secs((*timeout).max(1) as u64)).await;
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
            if !depends.is_empty() {
                let shown: Vec<&str> = paths.iter().take(12).copied().collect();
                let more = paths.len() - shown.len();
                let mut list = shown.join(", ");
                if more > 0 {
                    list.push_str(&tr!(lang, " 等另外 {more} 个", " and {more} more"));
                }
                let detail = tr!(
                    lang,
                    "{ids} 只有在 Agent 对源码之外的改动下才通过；这些文件恢复成基线版本后失败：{list}",
                    "{ids} pass only with the agent's changes outside the source code, and fail with these files as they were on the base: {list}",
                    ids = depends.join(", ")
                );
                let hit = sentinel_hit("passes_only_with_non_source_changes", detail, lang);
                append_hit(inner, goal, &hit)?;
                found.push(hit);
            }
        }

        // 5. A test that must fail.
        let proving: Vec<&Exec> = criteria
            .iter()
            .filter(|(c, ..)| held_set.iter().any(|(h, ..)| h.id == c.id) || red_on_base.contains(&c.id))
            .collect();
        if !proving.is_empty() {
            let git = inner.git.clone();
            let dir = self.dir.clone();
            let mut candidates =
                tokio::task::spawn_blocking(move || git.ls_files(&dir)).await.map_err(|e| invalid(e.to_string()))??;
            candidates.extend(held_files.iter().cloned());
            let canary = crate::canary::plant(&self.dir, &candidates, &self.tmp)?;
            let profile =
                if held_files.is_empty() { self.criteria.as_deref() } else { self.held_out_profile.as_deref() };
            let mut tripped = Vec::new();
            for (c, command, timeout) in proving.iter().filter(|_| !canary.files.is_empty()) {
                if paths_gone(&self.dir, command) || (held_files.is_empty() && names_held_out(&self.holdout, command)) {
                    continue;
                }
                canary.clear();
                let r = self.exec(command, profile, Duration::from_secs((*timeout).max(1) as u64)).await;
                if r.passed && canary.ran() {
                    tripped.push(c.id.clone());
                }
            }
            canary.clear();
            if !tripped.is_empty() {
                let detail = tr!(
                    lang,
                    "Tower 在测试文件末尾加了一个必然失败的测试，{ids} 仍然报告通过。断言、测试框架或结果报告在运行时被改动了，这次验证的“通过”都不能当作事实。",
                    "Tower added a test that must fail to the end of the test files, and {ids} still reported success. Assertions, the test runner or its reporting were altered at run time; none of this verification's passes count as evidence.",
                    ids = tripped.join(", ")
                );
                let hit = sentinel_hit("assertions_disabled", detail, lang);
                append_hit(inner, goal, &hit)?;
                found.push(hit);
            }
        }
        Ok((Outcome::Passed, found))
    }
}

/// A command names a file that is not in the checkout (`node --test x.test.js`
/// after the agent's new test was taken out): running it proves nothing.
fn paths_gone(dir: &Path, command: &str) -> bool {
    command
        .split_whitespace()
        .map(|w| w.trim_matches(|c| c == '\'' || c == '"'))
        .filter(|w| w.contains('/') && !w.starts_with('-') && !w.starts_with('/') && !w.contains(['*', '=']))
        .any(|w| !dir.join(w.trim_start_matches("./")).exists())
}

fn sentinel_hit(id: &str, detail: String, lang: Lang) -> tower_core::sentinel::SentinelHit {
    tower_core::sentinel::SentinelHit {
        sentinel: id.into(),
        severity: tower_core::sentinel::HIGH,
        title: tower_core::i18n::sentinel_title(id, lang).unwrap_or(id).into(),
        detail,
    }
}

/// Stops whatever a verification started and left running (a server, a
/// daemonised watcher): every process whose working directory or open
/// files are inside the verification's directories. (One that leaves them
/// entirely can only write to those directories, which are deleted and
/// never reused.)
fn stop_survivors(dirs: &[std::path::PathBuf]) {
    let prefixes: Vec<String> =
        dirs.iter().map(|d| format!("{}/", crate::paths::real(d).display())).filter(|p| p.len() > 2).collect();
    let Ok(out) = std::process::Command::new("/usr/sbin/lsof").args(["-n", "-P", "-w", "-F", "pn"]).output() else {
        return;
    };
    let me = std::process::id();
    let mut pid = 0u32;
    let mut doomed = std::collections::BTreeSet::new();
    for line in String::from_utf8_lossy(&out.stdout).lines() {
        if let Some(p) = line.strip_prefix('p') {
            pid = p.parse().unwrap_or(0);
        } else if let Some(name) = line.strip_prefix('n')
            && pid > 1
            && pid != me
            && prefixes.iter().any(|p| name.starts_with(p.as_str()) || format!("{name}/") == *p)
        {
            doomed.insert(pid);
        }
    }
    for pid in doomed {
        let _ = std::process::Command::new("/bin/kill").args(["-KILL", &pid.to_string()]).status();
    }
}

pub(crate) fn is_dependency_file(path: &str) -> bool {
    tower_core::roles::is_dependency_file(path)
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

/// Whether a criterion's command names a path under one of the held-out
/// patterns' fixed prefixes (`holdout/**` → `holdout/`): it runs held-out
/// tests, so it runs only while they are present, for the human.
pub(crate) fn names_held_out(patterns: &[String], command: &str) -> bool {
    patterns.iter().any(|p| {
        let prefix: String = p.chars().take_while(|c| !matches!(c, '*' | '?' | '[' | '{')).collect();
        !prefix.trim().is_empty() && command.contains(prefix.trim_end_matches('/'))
    })
}

/// What the agent hears of a result produced with the held-out tests present.
pub(crate) const WITHHELD: &str = "(output withheld: this result comes from held-out tests, which you cannot see)";

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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn criteria_naming_held_out_paths_are_known() {
        let p = vec!["holdout/**".to_string()];
        assert!(names_held_out(&p, "sh holdout/check.sh"));
        assert!(!names_held_out(&p, "npm test"));
        assert!(!names_held_out(&[], "sh holdout/check.sh"));
    }

    #[test]
    fn commands_naming_missing_files_are_not_evidence() {
        let tmp = tempfile::tempdir().unwrap();
        std::fs::create_dir_all(tmp.path().join("test")).unwrap();
        std::fs::write(tmp.path().join("test/a.test.js"), "").unwrap();
        assert!(!paths_gone(tmp.path(), "node --test test/a.test.js"));
        assert!(paths_gone(tmp.path(), "node --test ./test/new.test.js"));
        assert!(!paths_gone(tmp.path(), "npm test -- --reporter=dot"));
    }
}
