//! Verification (`docs/07`): re-run the machine criteria on a pinned
//! snapshot in a clean checkout, record each result as a fact, then decide
//! between review, automatic rework and pausing.

use std::path::{Path, PathBuf};
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

use crate::paths::real;
use crate::prompts::{self, Failure};
use crate::{Inner, Result, invalid, run, sandbox};

const SETUP_TIMEOUT: Duration = Duration::from_secs(15 * 60);

pub fn spawn(inner: Arc<Inner>, goal: String) {
    let cancel = Cancel::default();
    {
        let mut v = inner.verifications.lock().expect("verify lock");
        if v.contains_key(&goal) {
            return;
        }
        v.insert(goal.clone(), cancel.clone());
    }
    tokio::spawn(async move {
        let result = verify(&inner, &goal, &cancel).await;
        inner.verifications.lock().expect("verify lock").remove(&goal);
        if let Err(e) = result
            && !cancel.is_cancelled()
        {
            tracing::warn!(goal = %goal, error = %e, "verification failed to run");
            let message = tr!(inner.lang(), "验证没能完成：{e}", "Verification could not finish: {e}");
            let _ = inner.append(&goal, EventKind::EngineError { message });
            let _ = inner.set_mode(&goal, Mode::Idle);
            let _ = to_paused(&inner, &goal, PauseReason::VerifyEnvError, &e.to_string());
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
    // Ignored local files (e.g. `.env`) are not in the snapshot; tests may need them.
    let copied = run::copy_local_files(inner, &rec, &dir).await?;
    if !copied.is_empty() {
        inner.append(goal, EventKind::LocalFilesCopied { files: copied })?;
    }
    let outcome = run_criteria(inner, goal, &rec.contract, &dir, &snap.pin, cancel).await;
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
        }
        Outcome::EnvError(detail) => {
            inner.append(goal, EventKind::VerifyFinished { pin: snap.pin.clone(), passed: false, env_error: true })?;
            to_paused(inner, goal, PauseReason::VerifyEnvError, &detail)?;
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

enum Outcome {
    Passed,
    Failed(Vec<Failure>),
    EnvError(String),
}

async fn run_criteria(
    inner: &Arc<Inner>,
    goal: &str,
    contract: &tower_core::Contract,
    dir: &Path,
    pin: &str,
    cancel: &Cancel,
) -> Result<Outcome> {
    let lang = inner.lang();
    let dir_real = real(dir);
    let tmp = inner.paths.tmp(&format!("{goal}-verify"));
    std::fs::create_dir_all(&tmp)?;
    let tmp_real = real(&tmp);
    let profile: Option<PathBuf> = if sandbox::available() {
        let home = inner.env.get("HOME").map(PathBuf::from).unwrap_or_else(|| PathBuf::from("/"));
        let p = inner.paths.goal_dir(goal).join("verify.sb");
        std::fs::create_dir_all(inner.paths.goal_dir(goal))?;
        std::fs::write(&p, sandbox::profile(&dir_real, &tmp_real, &real(&home)))?;
        Some(p)
    } else {
        None
    };
    let mut env = inner.env.without_credentials();
    env.push(("CI".into(), "1".into()));
    env.push(("TMPDIR".into(), tmp_real.display().to_string()));

    let setup =
        if contract.setup.trim().is_empty() { Git::detect_setup_command(dir) } else { Some(contract.setup.clone()) };
    if let Some(setup) = setup {
        let spec = RunSpec::new(command_for(&setup, profile.as_deref()), dir, env.clone(), SETUP_TIMEOUT);
        let r = tower_verify::run(&spec, cancel).await;
        inner.append(
            goal,
            EventKind::SetupFinished {
                command: setup.clone(),
                ok: r.passed(),
                exit_code: r.exit_code(),
                duration_ms: r.duration_ms,
            },
        )?;
        if !r.passed() {
            let tail = tail_lines(&r.output_tail, 20);
            let detail = tr!(lang, "准备命令 `{setup}` 失败：\n{tail}", "The setup command `{setup}` failed:\n{tail}");
            return Ok(Outcome::EnvError(detail));
        }
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

pub(crate) fn review_ready(inner: &Arc<Inner>, goal: &str, body: &str) -> Result<()> {
    let rec = inner.store(|s| s.goal(goal))?;
    inner.open_inbox(NewInboxItem {
        goal_id: goal.into(),
        kind: InboxKind::ReviewReady,
        title: {
            let title = &rec.title;
            tr!(inner.lang(), "待验收：{title}", "Ready to accept: {title}")
        },
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
