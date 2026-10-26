//! Verification (`docs/07`): re-run the machine criteria on a pinned
//! snapshot in a clean checkout, record each result as a fact, then decide
//! between review, automatic rework and pausing.

use std::path::Path;
use std::sync::Arc;
use std::time::Duration;

use tower_core::contract::CriterionKind;
use tower_core::i18n::plural;
use tower_core::lifecycle::Transition;
use tower_core::view::{CanaryState, InboxKind};
use tower_core::{EventKind, Lang, LifecycleState, Mode, PauseReason, tr};
use tower_store::NewInboxItem;
use tower_verify::Cancel;

use crate::prompts::{self, Failure};
use crate::{Inner, Result, invalid, run};

mod bench;
use bench::{Bench, sentinel_hit};

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
            // Run again once this one is done, never twice at once.
            inner.verify_again.lock().unwrap_or_else(std::sync::PoisonError::into_inner).insert(goal);
            return;
        }
        v.insert(goal.clone(), cancel.clone());
    }
    tokio::spawn(async move {
        let result = verify(&inner, &goal, &cancel).await;
        inner.verifications.lock().unwrap_or_else(std::sync::PoisonError::into_inner).remove(&goal);
        let again = inner.verify_again.lock().unwrap_or_else(std::sync::PoisonError::into_inner).remove(&goal);
        if again
            && !cancel.is_cancelled()
            && inner.store(|s| s.goal(&goal)).is_ok_and(|g| g.state == LifecycleState::Claimed)
        {
            spawn(inner.clone(), goal.clone());
        }
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
    // Special cases for the values the base's tests use (read from your
    // repository at the base, so the agent's edits to tests do not count).
    let git = inner.git.clone();
    let (root6, base6) = (rec.project_root.clone(), base.clone());
    let lines = tokio::task::spawn_blocking(move || git.grep_at(Path::new(&root6), &base6, "assert|expect\\("))
        .await
        .map_err(|e| invalid(e.to_string()))?
        .unwrap_or_default();
    let literals = tower_core::sentinel::assertion_literals(
        lines
            .iter()
            .filter(|(p, _)| tower_core::roles::role(p) == tower_core::roles::Role::Test)
            .map(|(_, l)| l.as_str()),
    );
    let has_held_out = inner.store(|s| s.project(&rec.project_id))?.holdout_files.iter().any(|p| !p.trim().is_empty());
    if let Some(h) = tower_core::sentinel::special_cases(&files, &literals, has_held_out, lang) {
        hits.push(h);
    }
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
    // Program code that reaches into the test machinery, on a criterion
    // whose assertions could not be checked: nothing vouches for the pass.
    if hits.iter().any(|h| h.sentinel == "source_touches_tests") {
        let unchecked: Vec<String> = inner
            .store(|s| s.detail(goal))?
            .criteria
            .into_iter()
            .filter(|c| c.canary == Some(CanaryState::NotChecked))
            .map(|c| c.criterion.id)
            .collect();
        if !unchecked.is_empty() {
            let ids = unchecked.join(", ");
            let detail = tr!(
                lang,
                "源码触及断言库或测试框架，而 {ids} 的断言没能用金丝雀检查（测试的语言或写法 Tower 不认识）。请亲自确认这些测试真的在检查。",
                "Program code reaches into the assertion library or test runner, and the assertions of {ids} could not be checked with the canary (a language or test style Tower does not know). Check yourself that these tests really test."
            );
            let hit = sentinel_hit("assertions_unchecked", detail, lang);
            append_hit(inner, goal, &hit)?;
            hits.push(hit);
        }
    }

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
                let names = prompts::failing_tests(&f.output_tail);
                if !names.is_empty() {
                    let list = names.join(lang.pick("、", ", "));
                    detail.push_str(&tr!(
                        lang,
                        "\n\n{id} 失败的测试：{list}",
                        "\n\nFailing in {id}: {list}",
                        id = f.id
                    ));
                }
            }
            for f in &failures {
                let tail = tail_lines(&f.output_tail, 30);
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
    use super::bench::paths_gone;
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
