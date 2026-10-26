//! Human decisions: answering Needs-You items, reviewing, accepting.

use std::path::{Path, PathBuf};
use std::sync::{Arc, PoisonError};
use std::time::{Duration, Instant};

use serde_json::Value;
use tower_core::i18n::Choice;
use tower_core::lifecycle::Transition;
use tower_core::view::{InboxKind, ModelInfo};
use tower_core::{EventKind, LifecycleState, PauseReason, tr};
use tower_pi::{Engine, EngineConfig};
use tower_store::{GoalRecord, NewInboxItem};

use crate::api::{ReviewComment, ToastLevel};
use crate::{Inner, Result, invalid, prompts, run, verify};

/// The ways out of each pause reason, offered on its Needs-You card.
pub fn pause_options(reason: PauseReason, _goal: &GoalRecord) -> Vec<Choice> {
    use Choice::*;
    match reason {
        PauseReason::VerifyFailedLimit => vec![OneMoreRework, Abandon],
        PauseReason::VerifyEnvError => vec![Reverify, Continue, Abandon],
        PauseReason::BudgetSoftCap => vec![RaiseSoftCap, Abandon],
        PauseReason::BudgetHardCap => vec![DoubleBudget, Abandon],
        PauseReason::IdleWithoutSubmit => vec![Continue, Abandon],
        PauseReason::EngineCrash | PauseReason::ProviderError | PauseReason::PrepareFailed | PauseReason::Internal => {
            vec![Retry, Abandon]
        }
        PauseReason::SentinelHigh => vec![SentinelRework, OverrideSentinel, Abandon],
        PauseReason::WallClockCap => vec![MoreTime, Abandon],
        PauseReason::DependenciesChanged => vec![InstallWithNetwork, Abandon],
        PauseReason::Human | PauseReason::AppQuit => vec![Continue],
    }
}

/// The option `response` picks, as the item stores it: the same text, or
/// the same choice written in the other language. Items keep the language
/// they were created in; the interface may have switched since.
fn pick_option<'a>(options: &'a [String], response: &str) -> Option<&'a str> {
    let choice = Choice::parse(response);
    options
        .iter()
        .find(|o| *o == response)
        .or_else(|| options.iter().find(|o| choice.is_some() && Choice::parse(o) == choice))
        .map(String::as_str)
}

/// Confirms or rejects an assumption card, with an optional note to the
/// agent either way (`answer` can only carry one of the two).
pub async fn answer_assumption(inner: &Arc<Inner>, inbox_id: &str, approved: bool, note: &str) -> Result<()> {
    let item = inner.store(|s| s.inbox_item(inbox_id))?;
    if item.kind != InboxKind::Assumption {
        return Err(invalid(tr!(inner.lang(), "这不是一条假设", "This is not an assumption")));
    }
    let label = if approved { Choice::Approve } else { Choice::Reject }.label(inner.lang());
    let resolved = inner.store(|s| s.resolve_inbox(inbox_id, label))?;
    inner.emit_inbox();
    inner.emit_goal_now(&item.goal_id);
    review_claim(inner, &item.goal_id, &resolved.engine_ref.unwrap_or_default(), approved, note.trim()).await
}

pub async fn answer(inner: &Arc<Inner>, inbox_id: &str, response: &str) -> Result<()> {
    let item = inner.store(|s| s.inbox_item(inbox_id))?;
    let lang = inner.lang();
    if item.kind == InboxKind::ReviewReady {
        return Err(invalid(tr!(
            lang,
            "待验收的目标请在评审中验收或要求修改",
            "Accept this goal or request changes in the review"
        )));
    }
    // Answer with the option's own text, so the engine (or the extension
    // that offered it) sees the label it wrote, whatever language was used.
    let response = match pick_option(&item.options, response) {
        Some(option) => option,
        None if item.options.is_empty() || item.allow_text => response,
        None => return Err(invalid(tr!(lang, "请选择一个选项", "Pick one of the options"))),
    };
    let resolved = inner.store(|s| s.resolve_inbox(inbox_id, response))?;
    inner.emit_inbox();
    inner.emit_goal_now(&item.goal_id);
    let goal = item.goal_id.as_str();

    match item.kind {
        InboxKind::Question | InboxKind::Approval => {
            let ui_id = resolved
                .engine_ref
                .ok_or_else(|| invalid(tr!(lang, "缺少引擎请求编号", "The engine request id is missing")))?;
            run::answer_dialog(inner, goal, &ui_id, response)?;
        }
        InboxKind::Assumption => {
            let claim_id = resolved.engine_ref.unwrap_or_default();
            let choice = Choice::parse(response);
            let approved = choice == Some(Choice::Approve);
            let note = if approved || choice == Some(Choice::Reject) { "" } else { response };
            review_claim(inner, goal, &claim_id, approved, note).await?;
        }
        InboxKind::Paused => on_pause_choice(inner, goal, response).await?,
        InboxKind::Stalled => match Choice::parse(response) {
            Some(Choice::KeepWaiting) => {}
            Some(Choice::Pause) => {
                let note = tr!(lang, "你在卡住提醒中暂停了它", "You paused it from the stall alert");
                run::pause(inner, goal, PauseReason::Human, &note).await?
            }
            _ => {
                run::steer(inner, goal, response).await?;
            }
        },
        InboxKind::ReviewReady => {}
        InboxKind::CiFailed => {
            if Choice::parse(response) == Some(Choice::SendCiFailures) {
                send_ci_failures(inner, goal).await?;
            }
        }
    }
    Ok(())
}

async fn on_pause_choice(inner: &Arc<Inner>, goal: &str, response: &str) -> Result<()> {
    let rec = inner.store(|s| s.goal(goal))?;
    let lang = inner.lang();
    match Choice::parse(response) {
        Some(Choice::Abandon) => run::abandon(inner, goal).await,
        Some(Choice::Reverify) => {
            verify::spawn(inner.clone(), goal.into());
            Ok(())
        }
        Some(Choice::InstallWithNetwork) => {
            // The approval covers exactly these dependency changes: if the
            // agent changes them again, verification asks again.
            if let Some(fingerprint) = verify::current_dependency_fingerprint(inner, goal).await? {
                inner.append(goal, EventKind::SetupNetworkApproved { fingerprint })?;
            }
            verify::spawn(inner.clone(), goal.into());
            Ok(())
        }
        Some(Choice::OneMoreRework) => {
            let mut c = rec.contract.clone();
            c.max_rework = rec.rework_cycles + 1;
            c.version += 1;
            inner.append(goal, EventKind::ContractRatified { contract: c.clone() })?;
            let failures = last_failures(inner, &rec)?;
            let msg = prompts::rework(rec.rework_cycles + 1, c.max_rework, &failures);
            run::start_run(inner, goal, "rework", msg).await
        }
        Some(Choice::OverrideSentinel) => {
            // The human looked at what the sentinels found and accepts it:
            // the verified snapshot goes to review, with the override on record.
            let text = tr!(
                lang,
                "你确认了哨兵命中的改动，目标进入评审",
                "You confirmed the changes the sentinels flagged; the goal goes to review"
            );
            inner.append(goal, EventKind::Note { text })?;
            inner.transition(goal, Transition::VerifyStarted, None, "")?;
            let note = tr!(lang, "哨兵命中已由你确认", "Sentinel hits confirmed by you");
            inner.transition(goal, Transition::VerifyPassed, None, &note)?;
            let body = tr!(
                lang,
                "全部机器标准通过；哨兵命中已由你确认",
                "Every machine criterion passed; you confirmed the sentinel hits"
            );
            verify::review_ready(inner, goal, &body)
        }
        Some(Choice::SentinelRework) => {
            let hits = inner.store(|s| s.sentinel_hits(goal))?;
            run::start_run(inner, goal, "rework", prompts::sentinel_rework(&hits)).await
        }
        Some(Choice::MoreTime) => {
            let mut c = rec.contract.clone();
            c.budget.wall_minutes += 30;
            c.version += 1;
            inner.append(goal, EventKind::ContractRatified { contract: c })?;
            run::resume(inner, goal).await
        }
        Some(choice @ (Choice::RaiseSoftCap | Choice::DoubleBudget)) => {
            let mut c = rec.contract.clone();
            if choice == Choice::RaiseSoftCap {
                c.budget.soft_usd = c.budget.hard_usd;
            } else {
                c.budget.soft_usd = c.budget.hard_usd * 2.0;
                c.budget.hard_usd *= 2.0;
            }
            c.version += 1;
            inner.append(goal, EventKind::ContractRatified { contract: c })?;
            run::resume(inner, goal).await
        }
        // Continue, retry, or free text (a note for the agent).
        choice => {
            if !matches!(choice, Some(Choice::Continue | Choice::Retry)) && !response.trim().is_empty() {
                inner.append(goal, EventKind::Steered { text: response.trim().into() })?;
            }
            run::resume(inner, goal).await
        }
    }
}

/// The most recent failing results, as rework evidence.
fn last_failures(inner: &Inner, rec: &GoalRecord) -> Result<Vec<prompts::Failure>> {
    let detail = inner.store(|s| s.detail(&rec.id))?;
    Ok(detail
        .criteria
        .iter()
        .filter_map(|cv| {
            let v = cv.verified.as_ref().filter(|v| !v.passed)?;
            let tower_core::CriterionKind::Exec { command, .. } = &cv.criterion.kind else { return None };
            Some(prompts::Failure {
                id: cv.criterion.id.clone(),
                title: cv.criterion.title.clone(),
                command: command.clone(),
                exit_code: v.exit_code,
                output_tail: v.output_tail.clone(),
            })
        })
        .collect())
}

pub async fn review_claim(inner: &Arc<Inner>, goal: &str, claim_id: &str, approved: bool, note: &str) -> Result<()> {
    inner.append(goal, EventKind::ClaimReviewed { claim_id: claim_id.into(), approved })?;
    if !approved {
        // A steer for the agent, so it stays in English like every prompt.
        let text = if note.trim().is_empty() {
            "The human rejected an assumption you logged: do not rely on it; reconsider.".to_string()
        } else {
            format!("The human rejected an assumption you logged: {}", note.trim())
        };
        run::steer(inner, goal, &text).await?;
    } else if !note.trim().is_empty() {
        let text = format!("The human confirmed an assumption you logged and added: {}", note.trim());
        run::steer(inner, goal, &text).await?;
    }
    inner.emit_goal_now(goal);
    Ok(())
}

pub async fn request_changes(
    inner: &Arc<Inner>,
    goal: &str,
    summary: &str,
    comments: Vec<ReviewComment>,
) -> Result<()> {
    let rec = inner.store(|s| s.goal(goal))?;
    let lang = inner.lang();
    if !matches!(rec.state, LifecycleState::InReview | LifecycleState::Accepted) {
        return Err(invalid(tr!(
            lang,
            "只有待验收或已验收的目标可以要求修改",
            "Changes can only be requested on a goal that is ready to accept or accepted"
        )));
    }
    if summary.trim().is_empty() && comments.is_empty() {
        return Err(invalid(tr!(lang, "写下要改什么", "Write what should change")));
    }
    let comments: Vec<prompts::Comment> = comments
        .into_iter()
        .filter(|c| !c.text.trim().is_empty())
        .map(|c| prompts::Comment { path: c.path, line: c.line, old_line: c.old_line, text: c.text })
        .collect();
    let message = prompts::request_changes(summary, &comments);
    inner.append(goal, EventKind::Steered { text: message.clone() })?;
    inner.withdraw(goal, &[InboxKind::ReviewReady], &tr!(lang, "要求修改", "Changes requested"));
    inner.transition(goal, Transition::RequestChanges, None, "")?;
    run::start_run(inner, goal, "request_changes", message).await
}

/// Accepts a verified goal: the workspace must still be exactly what was
/// verified, every human criterion must be checked, then the snapshot is
/// sealed as one commit on a new local branch in the user's repository.
pub async fn accept(inner: &Arc<Inner>, goal: &str) -> Result<String> {
    let rec = inner.store(|s| s.goal(goal))?;
    let lang = inner.lang();
    if rec.state != LifecycleState::InReview {
        return Err(invalid(tr!(
            lang,
            "只有待验收的目标可以验收",
            "Only a goal that is ready to accept can be accepted"
        )));
    }
    let detail = inner.store(|s| s.detail(goal))?;
    if let Some(c) = detail
        .criteria
        .iter()
        .find(|c| matches!(c.criterion.kind, tower_core::CriterionKind::Human) && !c.human_checked)
    {
        let id = &c.criterion.id;
        return Err(invalid(tr!(lang, "人工标准 {id} 还没有勾选", "Human criterion {id} is not checked yet")));
    }
    let (Some(ws), Some(base), Some(pin)) = (rec.workspace.clone(), rec.base_commit.clone(), rec.pin.clone()) else {
        return Err(invalid(tr!(lang, "没有可验收的快照", "There is no snapshot to accept")));
    };
    let has_machine = rec.contract.machine_criteria().next().is_some();
    if has_machine && rec.verified_pin.as_deref() != Some(pin.as_str()) {
        return Err(invalid(tr!(
            lang,
            "当前快照没有通过验证，请重新验证",
            "The current snapshot has not passed verification; verify again"
        )));
    }
    let git = inner.git.clone();
    let (ws2, base2) = (ws.clone(), base.clone());
    let now = tokio::task::spawn_blocking(move || git.snapshot(Path::new(&ws2), &base2))
        .await
        .map_err(|e| invalid(e.to_string()))??;
    if now.pin != pin {
        return Err(invalid(tr!(
            lang,
            "工作区在验证之后发生了变化，请重新验证",
            "The workspace changed after verification; verify again"
        )));
    }

    // Titles in Chinese have no ASCII words: fall back to identifiers in
    // the intent (`total()`, `taxRate`), then to the goal number alone.
    let branch = match slug(&rec.title).or_else(|| slug(&rec.contract.intent)) {
        Some(s) => format!("tower/{}-{s}", goal.to_lowercase()),
        None => format!("tower/{}", goal.to_lowercase()),
    };
    let message = seal_message(&rec, &pin, has_machine);
    let git = inner.git.clone();
    let root = PathBuf::from(&rec.project_root);
    // Accepted before (and sent back, e.g. after CI failed): one more
    // commit on the same branch, so a pushed PR updates.
    let previous = match inner.store(|s| s.last_event(goal, "branch_written"))?.map(|e| e.event) {
        Some(EventKind::BranchWritten { branch, commit }) => Some((branch, commit)),
        _ => None,
    };
    let (written, commit) = tokio::task::spawn_blocking(move || match previous {
        Some((branch, previous)) => {
            git.seal_update(&root, Path::new(&ws), &previous, &pin, &branch, &message).map(|commit| (branch, commit))
        }
        None => git.seal(&root, Path::new(&ws), &base, &pin, &branch, &message),
    })
    .await
    .map_err(|e| invalid(e.to_string()))??;
    inner.append(goal, EventKind::BranchWritten { branch: written.clone(), commit })?;
    // Say what acceptance leaves unresolved instead of dropping it silently.
    let open: Vec<&str> = detail
        .claims
        .iter()
        .filter(|c| c.kind == tower_core::honesty::ClaimKind::Assumption && c.approved.is_none())
        .map(|c| c.text.as_str())
        .collect();
    if !open.is_empty() {
        let n = open.len();
        let list = open.join(lang.pick("；", "; "));
        inner.append(
            goal,
            EventKind::Note {
                text: tr!(
                    lang,
                    "验收时还有 {n} 条假设没有确认：{list}",
                    "Accepted with {n} unconfirmed assumption(s): {list}"
                ),
            },
        )?;
    }
    inner.transition(goal, Transition::Accept, None, "")?;
    inner.withdraw(goal, &[InboxKind::ReviewReady, InboxKind::Assumption], &tr!(lang, "已验收", "Accepted"));
    inner.toast(
        goal,
        ToastLevel::Success,
        tr!(lang, "已写入分支 {written}（没有推送）", "Wrote branch {written} (not pushed)"),
    );
    // The base may have moved on while the goal ran: warn now, not at merge time.
    let base_branch = inner.store(|s| s.project(&rec.project_id))?.base_branch;
    let git = inner.git.clone();
    let (root, b, w) = (PathBuf::from(&rec.project_root), base_branch.clone(), written.clone());
    if let Ok(Some(files)) = tokio::task::spawn_blocking(move || git.merge_conflicts(&root, &b, &w)).await
        && !files.is_empty()
    {
        let n = files.len();
        let list = files.iter().take(5).cloned().collect::<Vec<_>>().join(", ");
        let text = tr!(
            lang,
            "{written} 与当前的 {base_branch} 会有 {n} 个文件冲突：{list}",
            "{written} will conflict with the current {base_branch} in {n} file(s): {list}"
        );
        inner.append(goal, EventKind::Note { text: text.clone() })?;
        inner.toast(goal, ToastLevel::Warning, text);
    }
    Ok(written)
}

fn seal_message(rec: &GoalRecord, pin: &str, verified: bool) -> String {
    let mut m = format!("{}\n\n{}\n", rec.title, rec.contract.intent.trim());
    if let Some(s) = rec.submit_summary.as_deref().filter(|s| !s.trim().is_empty()) {
        let s = s.trim();
        // Written into the user's repository, so in English whatever the
        // interface language; the agent's words stay marked as a claim.
        m.push_str(&format!("\nAgent's summary (a claim, not verified): {s}\n"));
    }
    m.push_str(&format!("\nTower-Goal: {}\n", rec.id));
    if verified {
        m.push_str(&format!("Tower-Verified: {pin}\n"));
    } else {
        m.push_str("Tower-Verified: none (human judgement only)\n");
    }
    m
}

fn slug(title: &str) -> Option<String> {
    let s: String =
        title.chars().map(|c| if c.is_ascii_alphanumeric() { c.to_ascii_lowercase() } else { '-' }).collect();
    let words: Vec<&str> = s.split('-').filter(|p| !p.is_empty()).collect();
    let mut out = String::new();
    for w in words {
        if out.len() + w.len() + 1 > 32 {
            break;
        }
        if !out.is_empty() {
            out.push('-');
        }
        out.push_str(w);
    }
    (out.len() >= 3).then_some(out)
}

/// Pushes the accepted branch to `origin` and, when asked and the GitHub
/// CLI is available, opens a pull request. Both are one-way doors: they run
/// only on this explicit human action.
pub async fn push(inner: &Arc<Inner>, goal: &str, open_pr: bool) -> Result<Option<String>> {
    let rec = inner.store(|s| s.goal(goal))?;
    let lang = inner.lang();
    if !matches!(rec.state, LifecycleState::Accepted | LifecycleState::Integrated) {
        return Err(invalid(tr!(lang, "只有已验收的目标可以推送", "Only an accepted goal can be pushed")));
    }
    let branch =
        rec.branch.clone().ok_or_else(|| invalid(tr!(lang, "还没有写入分支", "No branch has been written yet")))?;
    let root = PathBuf::from(&rec.project_root);
    let git = inner.git.clone();
    let (root2, branch2) = (root.clone(), branch.clone());
    let remote = tokio::task::spawn_blocking(move || -> Result<String> {
        let url = git
            .origin_url(&root2)
            .ok_or_else(|| invalid(tr!(lang, "你的仓库没有 origin 远端", "Your repository has no origin remote")))?;
        git.push_branch(&root2, &branch2)?;
        Ok(url)
    })
    .await
    .map_err(|e| invalid(e.to_string()))??;

    let mut pr_url = None;
    if open_pr {
        let gh = inner.env.which("gh").ok_or_else(|| {
            invalid(tr!(
                lang,
                "已推送；没有找到 GitHub CLI（gh），无法创建 PR",
                "Pushed. The GitHub CLI (gh) was not found, so no PR was opened"
            ))
        })?;
        let detail = inner.store(|s| s.detail(goal))?;
        let mut body = format!("{}\n\n", rec.contract.intent.trim());
        for c in &detail.criteria {
            let mark = match &c.verified {
                Some(v) if v.passed && !v.stale => {
                    lang.pick("✅ 已由 Tower 在干净环境中验证", "✅ verified by Tower in a clean checkout")
                }
                _ if matches!(c.criterion.kind, tower_core::CriterionKind::Human) && c.human_checked => {
                    lang.pick("☑️ 人工确认", "☑️ checked by a human")
                }
                _ => "—",
            };
            body.push_str(&format!("- **{}** {} — {mark}\n", c.criterion.id, c.criterion.title));
        }
        if let Some(s) = &rec.submit_summary {
            body.push_str(&tr!(
                lang,
                "\n> Agent 的说明（声明，未经验证）：{s}\n",
                "\n> The agent's summary (a claim, not verified): {s}\n"
            ));
        }
        body.push_str(&format!(
            "\n<sub>Tower goal {} · verified snapshot {}</sub>\n",
            rec.id,
            rec.verified_pin.clone().unwrap_or_default()
        ));
        let out = tokio::process::Command::new(gh)
            .args([
                "pr",
                "create",
                "--head",
                &branch,
                "--base",
                &rec.base_branch,
                "--title",
                &rec.title,
                "--body",
                &body,
            ])
            .current_dir(&root)
            .env_clear()
            .envs(inner.env.pairs())
            .output()
            .await?;
        if !out.status.success() {
            let stderr = String::from_utf8_lossy(&out.stderr);
            let stderr = stderr.trim();
            return Err(invalid(tr!(
                lang,
                "已推送 {branch}；创建 PR 失败：{stderr}",
                "Pushed {branch}, but opening the PR failed: {stderr}"
            )));
        }
        pr_url = String::from_utf8_lossy(&out.stdout).lines().rev().find(|l| l.starts_with("http")).map(String::from);
    }
    inner.append(goal, EventKind::BranchPushed { remote, branch: branch.clone(), pr_url: pr_url.clone() })?;
    inner.toast(
        goal,
        ToastLevel::Success,
        match &pr_url {
            Some(u) => tr!(lang, "已推送并创建 PR：{u}", "Pushed and opened a PR: {u}"),
            None => tr!(lang, "已推送 {branch}", "Pushed {branch}"),
        },
    );
    Ok(pr_url)
}

/// Moves accepted goals to integrated once their commit is in the local
/// base branch, and archives integrated goals after a day.
pub async fn check_integrations(inner: &Arc<Inner>) -> Result<()> {
    let accepted = inner.store(|s| s.goals_in_state(LifecycleState::Accepted))?;
    let lang = inner.lang();
    for g in accepted {
        let Some(entry) = inner.store(|s| s.last_event(&g.id, "branch_written"))? else { continue };
        let EventKind::BranchWritten { commit, .. } = entry.event else { continue };
        let git = inner.git.clone();
        let (root, base) = (PathBuf::from(&g.project_root), g.base_branch.clone());
        let merged =
            tokio::task::spawn_blocking(move || git.is_integrated(&root, &base, &commit)).await.unwrap_or(false);
        if merged {
            let note = tr!(lang, "在本地基线分支中观测到合入", "Seen merged into the local base branch");
            inner.transition(&g.id, Transition::Integrated, None, &note)?;
        }
    }
    if let Some(gh) = inner.env.which("gh") {
        for g in inner.store(|s| s.goals_in_state(LifecycleState::Accepted))? {
            if let Err(e) = check_pr(inner, &gh, &g.id).await {
                tracing::debug!(goal = %g.id, error = %e, "pull request check failed");
            }
        }
    }
    let day = 24 * 60 * 60 * 1000;
    let now = tower_store::system_now();
    for g in inner.store(|s| s.goals_in_state(LifecycleState::Integrated))? {
        let at = inner.store(|s| s.last_event(&g.id, "state_changed"))?.map(|e| e.at).unwrap_or(now);
        if now - at > day {
            let note = tr!(lang, "合入 24 小时后自动归档", "Archived automatically 24 hours after merging");
            inner.transition(&g.id, Transition::Archive, None, &note)?;
        }
    }
    Ok(())
}

/// Reads the state and checks of the goal's pull request with the GitHub
/// CLI. Records a change; a merge on GitHub integrates the goal; newly
/// failing checks are announced.
async fn check_pr(inner: &Arc<Inner>, gh: &Path, goal: &str) -> Result<()> {
    let Some(pr) = inner.store(|s| s.summary(goal))?.pr else { return Ok(()) };
    let out = tokio::process::Command::new(gh)
        .args(["pr", "view", &pr.url, "--json", "state,statusCheckRollup"])
        .env_clear()
        .envs(inner.env.pairs())
        .output()
        .await?;
    if !out.status.success() {
        return Ok(());
    }
    let Some(status) = parse_pr_status(&String::from_utf8_lossy(&out.stdout)) else { return Ok(()) };
    if status == pr.status {
        return Ok(());
    }
    let lang = inner.lang();
    let newly_failing = status.failed > pr.status.failed;
    inner.append(goal, EventKind::PrChecked { url: pr.url.clone(), status: status.clone() })?;
    if status.state == "merged" {
        let note = tr!(lang, "PR 已在 GitHub 上合并", "The PR was merged on GitHub");
        inner.transition(goal, Transition::Integrated, None, &note)?;
    } else if newly_failing {
        let names = status.failing.join(", ");
        inner.withdraw(goal, &[InboxKind::CiFailed], &tr!(lang, "有新的检查结果", "Newer check results"));
        inner.open_inbox(NewInboxItem {
            goal_id: goal.into(),
            kind: InboxKind::CiFailed,
            title: tr!(lang, "CI 未通过：{names}", "CI failed: {names}"),
            subject: names.clone(),
            body: tr!(
                lang,
                "可以把失败的检查和日志发给 Agent：它会在同一个工作区里修复，验证通过后由你再次验收，并推送到同一个 PR。",
                "You can send the failing checks and their logs to the agent: it fixes them in the same workspace; once verified, you accept again and push to the same PR."
            ),
            options: Choice::labels(&[Choice::SendCiFailures, Choice::Dismiss], lang),
            allow_text: true,
            urgency: 2,
            engine_ref: None,
        })?;
    }
    Ok(())
}

/// Sends the PR's failing checks (names, links and the tail of their logs)
/// back to the agent: the accepted goal runs again, and its next
/// acceptance updates the same branch.
async fn send_ci_failures(inner: &Arc<Inner>, goal: &str) -> Result<()> {
    let lang = inner.lang();
    let pr = inner.store(|s| s.summary(goal))?.pr.ok_or_else(|| invalid(tr!(lang, "没有 PR", "There is no PR")))?;
    let gh = inner.env.which("gh").ok_or_else(|| invalid(tr!(lang, "没有找到 gh", "gh was not found")))?;
    let out = tokio::process::Command::new(&gh)
        .args(["pr", "view", &pr.url, "--json", "statusCheckRollup"])
        .env_clear()
        .envs(inner.env.pairs())
        .output()
        .await?;
    let json: serde_json::Value = serde_json::from_slice(&out.stdout).unwrap_or_default();
    let mut report = String::new();
    for c in json.get("statusCheckRollup").and_then(|r| r.as_array()).into_iter().flatten() {
        let s = |k: &str| c.get(k).and_then(|x| x.as_str()).unwrap_or_default().to_string();
        let failed = matches!(s("conclusion").as_str(), "FAILURE" | "TIMED_OUT" | "CANCELLED" | "STARTUP_FAILURE")
            || matches!(s("state").as_str(), "FAILURE" | "ERROR");
        if !failed {
            continue;
        }
        let name = if s("name").is_empty() { s("context") } else { s("name") };
        let link = if s("detailsUrl").is_empty() { s("targetUrl") } else { s("detailsUrl") };
        report.push_str(&format!("\n### {name}\n{link}\n"));
        // GitHub Actions: the failed steps' log, when gh can fetch it.
        if let Some(run_id) = link.split("/runs/").nth(1).and_then(|r| r.split('/').next()) {
            let log = tokio::process::Command::new(&gh)
                .args(["run", "view", run_id, "--log-failed"])
                .env_clear()
                .envs(inner.env.pairs())
                .output()
                .await;
            if let Ok(log) = log {
                let text = String::from_utf8_lossy(&log.stdout);
                let lines: Vec<&str> = text.lines().collect();
                let tail = lines[lines.len().saturating_sub(120)..].join("\n");
                report.push_str(&format!("```\n{}\n```\n", tower_verify::redact(&tail)));
            }
        }
    }
    if report.len() > 16_000 {
        let cut = report.char_indices().nth(16_000).map_or(report.len(), |(i, _)| i);
        report.truncate(cut);
    }
    let note = tr!(lang, "把 CI 失败发给了 Agent", "Sent the CI failures to the agent");
    inner.transition(goal, Transition::RequestChanges, None, &note)?;
    run::start_run(inner, goal, "ci-fix", prompts::ci_failures(&pr.url, &report)).await
}

/// Summarises `gh pr view --json state,statusCheckRollup`.
pub(crate) fn parse_pr_status(json: &str) -> Option<tower_core::view::PrStatus> {
    let v: serde_json::Value = serde_json::from_str(json).ok()?;
    let state = v.get("state")?.as_str()?.to_ascii_lowercase();
    let mut s = tower_core::view::PrStatus { state, passed: 0, failed: 0, pending: 0, failing: Vec::new() };
    for c in v.get("statusCheckRollup").and_then(|r| r.as_array()).into_iter().flatten() {
        let get = |k: &str| c.get(k).and_then(|x| x.as_str()).unwrap_or("").to_ascii_uppercase();
        let name = c.get("name").or_else(|| c.get("context")).and_then(|x| x.as_str()).unwrap_or("check");
        // Check runs have a status and, when completed, a conclusion; commit
        // statuses have a state.
        let verdict = match (get("conclusion").as_str(), get("status").as_str(), get("state").as_str()) {
            ("SUCCESS" | "NEUTRAL" | "SKIPPED", _, _) | (_, _, "SUCCESS") => 1,
            ("FAILURE" | "TIMED_OUT" | "CANCELLED" | "ACTION_REQUIRED" | "STARTUP_FAILURE", _, _)
            | (_, _, "FAILURE" | "ERROR") => -1,
            _ => 0,
        };
        match verdict {
            1 => s.passed += 1,
            -1 => {
                s.failed += 1;
                if s.failing.len() < 4 {
                    s.failing.push(name.to_string());
                }
            }
            _ => s.pending += 1,
        }
    }
    Some(s)
}

/// Lists the models the user's Pi can use, cached for ten minutes.
pub async fn models(inner: &Arc<Inner>) -> Result<Vec<ModelInfo>> {
    if let Some((at, list)) = inner.models.lock().unwrap_or_else(PoisonError::into_inner).as_ref()
        && at.elapsed() < Duration::from_secs(600)
    {
        return Ok(list.clone());
    }
    let program = inner.pi_program().ok_or_else(|| invalid(tr!(inner.lang(), "没有找到 pi", "Pi was not found")))?;
    let tmp = inner.paths.tmp("_models");
    std::fs::create_dir_all(&tmp)?;
    let cfg = EngineConfig {
        program,
        cwd: tmp.clone(),
        session_dir: tmp,
        load_user_extensions: false,
        // Provider extensions contribute models, so the list must include them.
        extensions: inner.extensions(&inner.settings()),
        env: inner.env.pairs().into_iter().chain([("PI_OFFLINE".to_string(), "1".to_string())]).collect(),
        ..Default::default()
    };
    let (engine, _rx) = Engine::spawn(&cfg)?;
    let data = engine.available_models().await;
    engine.shutdown(Duration::from_secs(2)).await;
    let data = data?;
    let list: Vec<ModelInfo> = data
        .get("models")
        .and_then(Value::as_array)
        .map(|ms| {
            ms.iter()
                .map(|m| {
                    let s = |k: &str| m.get(k).and_then(Value::as_str).unwrap_or_default().to_string();
                    let cost = |k: &str| m.get("cost").and_then(|c| c.get(k)).and_then(Value::as_f64).unwrap_or(0.0);
                    ModelInfo {
                        provider: s("provider"),
                        id: s("id"),
                        name: s("name"),
                        reasoning: m.get("reasoning").and_then(Value::as_bool).unwrap_or(false),
                        cost_input: cost("input"),
                        cost_output: cost("output"),
                        context_window: m.get("contextWindow").and_then(Value::as_u64).unwrap_or(0),
                    }
                })
                .collect()
        })
        .unwrap_or_default();
    *inner.models.lock().unwrap_or_else(PoisonError::into_inner) = Some((Instant::now(), list.clone()));
    Ok(list)
}

/// The workspace may be edited by the human only while nothing else is
/// using it: no run and no verification.
fn editable_workspace(inner: &Arc<Inner>, goal: &str) -> Result<(GoalRecord, PathBuf)> {
    let rec = inner.store(|s| s.goal(goal))?;
    let lang = inner.lang();
    if inner.run_of(goal).is_some() || matches!(rec.state, LifecycleState::Running | LifecycleState::Verifying) {
        return Err(invalid(tr!(
            lang,
            "目标正在运行或验证，先暂停",
            "The goal is running or being verified; pause it first"
        )));
    }
    if matches!(
        rec.state,
        LifecycleState::Accepted | LifecycleState::Integrated | LifecycleState::Archived | LifecycleState::Abandoned
    ) {
        return Err(invalid(tr!(lang, "这个目标已经结束", "This goal is finished")));
    }
    let ws = rec
        .workspace
        .clone()
        .map(PathBuf::from)
        .ok_or_else(|| invalid(tr!(lang, "没有工作区", "There is no workspace")))?;
    Ok((rec, ws))
}

/// Puts the workspace back to where run `run_no` started. The undone work
/// stays in the trace and in that run's snapshots; the change is the
/// human's, recorded as such, and needs verifying again.
pub async fn rollback(inner: &Arc<Inner>, goal: &str, run_no: u32) -> Result<()> {
    let (_, ws) = editable_workspace(inner, goal)?;
    let lang = inner.lang();
    let start = inner
        .store(|s| s.trace(goal, None, 10_000))?
        .into_iter()
        .find_map(|e| match e.event {
            EventKind::RunStarted { run_no: n, start_pin: Some(pin), .. } if n == run_no => Some(pin),
            _ => None,
        })
        .ok_or_else(|| {
            invalid(tr!(
                lang,
                "没有第 {run_no} 次运行开始时的快照",
                "There is no snapshot from the start of run {run_no}"
            ))
        })?;
    let git = inner.git.clone();
    let (ws2, start2) = (ws.clone(), start.clone());
    tokio::task::spawn_blocking(move || git.restore(&ws2, &start2)).await.map_err(|e| invalid(e.to_string()))??;
    inner.append(
        goal,
        EventKind::Note {
            text: tr!(
                lang,
                "你把工作区回退到了第 {run_no} 次运行开始时",
                "You rolled the workspace back to the start of run {run_no}"
            ),
        },
    )?;
    if let Some((_, Some(old))) = run::repin(inner, goal).await? {
        let git = inner.git.clone();
        let new = inner.store(|s| s.goal(goal))?.pin.unwrap_or_default();
        if let Ok(Ok(files)) = tokio::task::spawn_blocking(move || git.changed_between(&ws, &old, &new)).await
            && !files.is_empty()
        {
            inner.append(goal, EventKind::HumanEdited { files })?;
        }
    }
    inner.emit_goal_now(goal);
    Ok(())
}

/// Undoes one hunk of the reviewed change in the workspace.
pub async fn revert_hunk(inner: &Arc<Inner>, goal: &str, path: &str, hunk: usize) -> Result<()> {
    let (rec, ws) = editable_workspace(inner, goal)?;
    let lang = inner.lang();
    let (Some(base), Some(pin)) = (rec.base_commit.clone(), rec.pin.clone()) else {
        return Err(invalid(tr!(lang, "没有可撤销的改动", "There is no change to undo")));
    };
    let git = inner.git.clone();
    let (ws2, p) = (ws.clone(), path.to_string());
    tokio::task::spawn_blocking(move || git.revert_hunk(&ws2, &base, &pin, &p, hunk))
        .await
        .map_err(|e| invalid(e.to_string()))?
        .map_err(|e| {
            invalid(tr!(
                lang,
                "撤销失败（文件在快照之后又改过？）：{e}",
                "Could not undo it (did the file change after the snapshot?): {e}"
            ))
        })?;
    inner.append(goal, EventKind::HumanEdited { files: vec![path.to_string()] })?;
    run::repin(inner, goal).await?;
    inner.emit_goal_now(goal);
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use tower_core::Lang;

    #[test]
    fn pull_request_checks_are_summarised() {
        let json = r#"{"state":"OPEN","statusCheckRollup":[
            {"__typename":"CheckRun","name":"test","status":"COMPLETED","conclusion":"FAILURE"},
            {"__typename":"CheckRun","name":"lint","status":"COMPLETED","conclusion":"SUCCESS"},
            {"__typename":"CheckRun","name":"build","status":"IN_PROGRESS","conclusion":""},
            {"__typename":"StatusContext","context":"ci/legacy","state":"SUCCESS"}]}"#;
        let s = parse_pr_status(json).unwrap();
        assert_eq!((s.state.as_str(), s.passed, s.failed, s.pending), ("open", 2, 1, 1));
        assert_eq!(s.failing, ["test"]);
        assert_eq!(parse_pr_status(r#"{"state":"MERGED","statusCheckRollup":[]}"#).unwrap().state, "merged");
    }

    #[test]
    fn branch_slugs_are_ascii() {
        assert_eq!(slug("Fix checkout double charge!").as_deref(), Some("fix-checkout-double-charge"));
        assert_eq!(slug("修复重复扣款"), None);
        assert_eq!(slug("修复 checkout 扣款").as_deref(), Some("checkout"));
        assert_eq!(slug("给 total() 增加税率参数 taxRate").as_deref(), Some("total-taxrate"));
    }

    #[test]
    fn answers_match_options_in_either_language() {
        let zh = Choice::labels(&[Choice::SentinelRework, Choice::OverrideSentinel, Choice::Abandon], Lang::Zh);
        assert_eq!(pick_option(&zh, "放弃这个目标"), Some("放弃这个目标"));
        // The interface switched to English after the item was created.
        assert_eq!(pick_option(&zh, "Abandon this goal"), Some("放弃这个目标"));
        assert_eq!(pick_option(&zh, "I've checked, go to review"), Some("我已确认，进入评审"));
        assert_eq!(pick_option(&zh, "Keep waiting"), None);
        assert_eq!(pick_option(&zh, "just do it"), None);
        // The extension's approval options, answered in the other language.
        let en = Choice::labels(&[Choice::Allow, Choice::Deny], Lang::En);
        assert_eq!(pick_option(&en, "拒绝"), Some("Deny"));
        // Options Tower did not write (an agent's question) match exactly.
        let free = vec!["order id".to_string(), "request id".to_string()];
        assert_eq!(pick_option(&free, "order id"), Some("order id"));
        assert_eq!(pick_option(&free, "Continue"), None);
    }
}
