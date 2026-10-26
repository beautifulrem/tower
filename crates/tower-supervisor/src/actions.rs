//! Human decisions: answering Needs-You items, reviewing, accepting.

use std::path::{Path, PathBuf};
use std::sync::Arc;
use std::time::{Duration, Instant};

use serde_json::Value;
use tower_core::lifecycle::Transition;
use tower_core::view::{InboxKind, ModelInfo};
use tower_core::{EventKind, LifecycleState, PauseReason};
use tower_pi::{Engine, EngineConfig};
use tower_store::GoalRecord;

use crate::api::{ReviewComment, ToastLevel};
use crate::{Inner, Result, invalid, prompts, run, verify};

pub const APPROVE: &str = "批准";
pub const REJECT: &str = "驳回";

const RETRY: &str = "重试";
const CONTINUE: &str = "继续";
const REVERIFY: &str = "重新验证";
const ONE_MORE_REWORK: &str = "让 Agent 再返工一次";
const RAISE_SOFT: &str = "把软上限提高到硬上限并继续";
const DOUBLE_BUDGET: &str = "预算翻倍并继续";
const ABANDON: &str = "放弃这个目标";
const OVERRIDE_SENTINEL: &str = "我已确认，进入评审";
const SENTINEL_REWORK: &str = "让 Agent 去掉这些改动后重做";
const MORE_TIME: &str = "再给 30 分钟";
pub const KEEP_WAITING: &str = "继续等待";
pub const PAUSE: &str = "暂停";

/// The ways out of each pause reason, offered on its Needs-You card.
pub fn pause_options(reason: PauseReason, _goal: &GoalRecord) -> Vec<&'static str> {
    match reason {
        PauseReason::VerifyFailedLimit => vec![ONE_MORE_REWORK, ABANDON],
        PauseReason::VerifyEnvError => vec![REVERIFY, CONTINUE, ABANDON],
        PauseReason::BudgetSoftCap => vec![RAISE_SOFT, ABANDON],
        PauseReason::BudgetHardCap => vec![DOUBLE_BUDGET, ABANDON],
        PauseReason::IdleWithoutSubmit => vec![CONTINUE, ABANDON],
        PauseReason::EngineCrash | PauseReason::ProviderError | PauseReason::PrepareFailed => vec![RETRY, ABANDON],
        PauseReason::SentinelHigh => vec![SENTINEL_REWORK, OVERRIDE_SENTINEL, ABANDON],
        PauseReason::WallClockCap => vec![MORE_TIME, ABANDON],
        PauseReason::Human | PauseReason::AppQuit => vec![CONTINUE],
    }
}

pub async fn answer(inner: &Arc<Inner>, inbox_id: &str, response: &str) -> Result<()> {
    let item = inner.store(|s| s.inbox_item(inbox_id))?;
    if item.kind == InboxKind::ReviewReady {
        return Err(invalid("待验收的目标请在评审中验收或要求修改"));
    }
    if !item.options.is_empty() && !item.allow_text && !item.options.iter().any(|o| o == response) {
        return Err(invalid("请选择一个选项"));
    }
    let resolved = inner.store(|s| s.resolve_inbox(inbox_id, response))?;
    inner.emit_inbox();
    inner.emit_goal_now(&item.goal_id);
    let goal = item.goal_id.as_str();

    match item.kind {
        InboxKind::Question | InboxKind::Approval => {
            let ui_id = resolved.engine_ref.ok_or_else(|| invalid("缺少引擎请求编号"))?;
            run::answer_dialog(inner, goal, &ui_id, response)?;
        }
        InboxKind::Assumption => {
            let claim_id = resolved.engine_ref.unwrap_or_default();
            let approved = response == APPROVE;
            let note = if approved || response == REJECT { "" } else { response };
            review_claim(inner, goal, &claim_id, approved, note).await?;
        }
        InboxKind::Paused => on_pause_choice(inner, goal, response).await?,
        InboxKind::Stalled => match response {
            KEEP_WAITING => {}
            PAUSE => run::pause(inner, goal, PauseReason::Human, "你在卡住提醒中暂停了它").await?,
            text => {
                run::steer(inner, goal, text).await?;
            }
        },
        InboxKind::ReviewReady => {}
    }
    Ok(())
}

async fn on_pause_choice(inner: &Arc<Inner>, goal: &str, choice: &str) -> Result<()> {
    let rec = inner.store(|s| s.goal(goal))?;
    match choice {
        ABANDON => run::abandon(inner, goal).await,
        REVERIFY => {
            verify::spawn(inner.clone(), goal.into());
            Ok(())
        }
        ONE_MORE_REWORK => {
            let mut c = rec.contract.clone();
            c.max_rework = rec.rework_cycles + 1;
            c.version += 1;
            inner.append(goal, EventKind::ContractRatified { contract: c.clone() })?;
            let failures = last_failures(inner, &rec)?;
            let msg = prompts::rework(rec.rework_cycles + 1, c.max_rework, &failures);
            run::start_run(inner, goal, "rework", msg).await
        }
        OVERRIDE_SENTINEL => {
            // The human looked at what the sentinels found and accepts it:
            // the verified snapshot goes to review, with the override on record.
            inner.append(goal, EventKind::Note { text: "你确认了哨兵命中的改动，目标进入评审".into() })?;
            inner.transition(goal, Transition::VerifyStarted, None, "")?;
            inner.transition(goal, Transition::VerifyPassed, None, "哨兵命中已由你确认")?;
            verify::review_ready(inner, goal, "全部机器标准通过；哨兵命中已由你确认")
        }
        SENTINEL_REWORK => {
            let hits = inner.store(|s| s.sentinel_hits(goal))?;
            run::start_run(inner, goal, "rework", prompts::sentinel_rework(&hits)).await
        }
        MORE_TIME => {
            let mut c = rec.contract.clone();
            c.budget.wall_minutes += 30;
            c.version += 1;
            inner.append(goal, EventKind::ContractRatified { contract: c })?;
            run::resume(inner, goal).await
        }
        RAISE_SOFT | DOUBLE_BUDGET => {
            let mut c = rec.contract.clone();
            if choice == RAISE_SOFT {
                c.budget.soft_usd = c.budget.hard_usd;
            } else {
                c.budget.soft_usd = c.budget.hard_usd * 2.0;
                c.budget.hard_usd *= 2.0;
            }
            c.version += 1;
            inner.append(goal, EventKind::ContractRatified { contract: c })?;
            run::resume(inner, goal).await
        }
        // CONTINUE, RETRY, or free text (a note for the agent).
        other => {
            if !matches!(other, CONTINUE | RETRY) && !other.trim().is_empty() {
                inner.append(goal, EventKind::Steered { text: other.trim().into() })?;
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
        let text = if note.trim().is_empty() {
            "你记录的一个假设被驳回了：不要依赖它，重新判断。".to_string()
        } else {
            format!("你记录的一个假设被驳回了：{}", note.trim())
        };
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
    if !matches!(rec.state, LifecycleState::InReview | LifecycleState::Accepted) {
        return Err(invalid("只有待验收或已验收的目标可以要求修改"));
    }
    if summary.trim().is_empty() && comments.is_empty() {
        return Err(invalid("写下要改什么"));
    }
    let comments: Vec<prompts::Comment> = comments
        .into_iter()
        .filter(|c| !c.text.trim().is_empty())
        .map(|c| prompts::Comment { path: c.path, line: c.line, text: c.text })
        .collect();
    let message = prompts::request_changes(summary, &comments);
    inner.append(goal, EventKind::Steered { text: message.clone() })?;
    inner.withdraw(goal, &[InboxKind::ReviewReady], "要求修改");
    inner.transition(goal, Transition::RequestChanges, None, "")?;
    run::start_run(inner, goal, "request_changes", message).await
}

/// Accepts a verified goal: the workspace must still be exactly what was
/// verified, every human criterion must be checked, then the snapshot is
/// sealed as one commit on a new local branch in the user's repository.
pub async fn accept(inner: &Arc<Inner>, goal: &str) -> Result<String> {
    let rec = inner.store(|s| s.goal(goal))?;
    if rec.state != LifecycleState::InReview {
        return Err(invalid("只有待验收的目标可以验收"));
    }
    let detail = inner.store(|s| s.detail(goal))?;
    if let Some(c) = detail
        .criteria
        .iter()
        .find(|c| matches!(c.criterion.kind, tower_core::CriterionKind::Human) && !c.human_checked)
    {
        return Err(invalid(format!("人工标准 {} 还没有勾选", c.criterion.id)));
    }
    let (Some(ws), Some(base), Some(pin)) = (rec.workspace.clone(), rec.base_commit.clone(), rec.pin.clone()) else {
        return Err(invalid("没有可验收的快照"));
    };
    let has_machine = rec.contract.machine_criteria().next().is_some();
    if has_machine && rec.verified_pin.as_deref() != Some(pin.as_str()) {
        return Err(invalid("当前快照没有通过验证，请重新验证"));
    }
    let git = inner.git.clone();
    let (ws2, base2) = (ws.clone(), base.clone());
    let now = tokio::task::spawn_blocking(move || git.snapshot(Path::new(&ws2), &base2))
        .await
        .map_err(|e| invalid(e.to_string()))??;
    if now.pin != pin {
        return Err(invalid("工作区在验证之后发生了变化，请重新验证"));
    }

    let branch = format!("tower/{}-{}", goal.to_lowercase(), slug(&rec.title));
    let message = seal_message(&rec, &pin, has_machine);
    let git = inner.git.clone();
    let root = PathBuf::from(&rec.project_root);
    let (written, commit) =
        tokio::task::spawn_blocking(move || git.seal(&root, Path::new(&ws), &base, &pin, &branch, &message))
            .await
            .map_err(|e| invalid(e.to_string()))??;
    inner.append(goal, EventKind::BranchWritten { branch: written.clone(), commit })?;
    inner.transition(goal, Transition::Accept, None, "")?;
    inner.withdraw(goal, &[InboxKind::ReviewReady, InboxKind::Assumption], "已验收");
    inner.toast(ToastLevel::Success, format!("已写入分支 {written}（没有推送）"));
    Ok(written)
}

fn seal_message(rec: &GoalRecord, pin: &str, verified: bool) -> String {
    let mut m = format!("{}\n\n{}\n", rec.title, rec.contract.intent.trim());
    if let Some(s) = rec.submit_summary.as_deref().filter(|s| !s.trim().is_empty()) {
        m.push_str(&format!("\nAgent 称：{}\n", s.trim()));
    }
    m.push_str(&format!("\nTower-Goal: {}\n", rec.id));
    if verified {
        m.push_str(&format!("Tower-Verified: {pin}\n"));
    } else {
        m.push_str("Tower-Verified: none (human judgement only)\n");
    }
    m
}

fn slug(title: &str) -> String {
    let s: String =
        title.chars().map(|c| if c.is_ascii_alphanumeric() { c.to_ascii_lowercase() } else { '-' }).collect();
    let s = s.split('-').filter(|p| !p.is_empty()).collect::<Vec<_>>().join("-");
    let s: String = s.chars().take(32).collect();
    if s.is_empty() { "goal".into() } else { s }
}

/// Pushes the accepted branch to `origin` and, when asked and the GitHub
/// CLI is available, opens a pull request. Both are one-way doors: they run
/// only on this explicit human action.
pub async fn push(inner: &Arc<Inner>, goal: &str, open_pr: bool) -> Result<Option<String>> {
    let rec = inner.store(|s| s.goal(goal))?;
    if !matches!(rec.state, LifecycleState::Accepted | LifecycleState::Integrated) {
        return Err(invalid("只有已验收的目标可以推送"));
    }
    let branch = rec.branch.clone().ok_or_else(|| invalid("还没有写入分支"))?;
    let root = PathBuf::from(&rec.project_root);
    let git = inner.git.clone();
    let (root2, branch2) = (root.clone(), branch.clone());
    let remote = tokio::task::spawn_blocking(move || -> Result<String> {
        let url = git.origin_url(&root2).ok_or_else(|| invalid("你的仓库没有 origin 远端"))?;
        git.push_branch(&root2, &branch2)?;
        Ok(url)
    })
    .await
    .map_err(|e| invalid(e.to_string()))??;

    let mut pr_url = None;
    if open_pr {
        let gh = inner.env.which("gh").ok_or_else(|| invalid("已推送；没有找到 GitHub CLI（gh），无法创建 PR"))?;
        let detail = inner.store(|s| s.detail(goal))?;
        let mut body = format!("{}\n\n", rec.contract.intent.trim());
        for c in &detail.criteria {
            let mark = match &c.verified {
                Some(v) if v.passed && !v.stale => "✅ 已由 Tower 在干净环境中验证",
                _ if matches!(c.criterion.kind, tower_core::CriterionKind::Human) && c.human_checked => "☑️ 人工确认",
                _ => "—",
            };
            body.push_str(&format!("- **{}** {} — {mark}\n", c.criterion.id, c.criterion.title));
        }
        if let Some(s) = &rec.submit_summary {
            body.push_str(&format!("\n> Agent 的说明（声明，未经验证）：{s}\n"));
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
            return Err(invalid(format!(
                "已推送 {branch}；创建 PR 失败：{}",
                String::from_utf8_lossy(&out.stderr).trim()
            )));
        }
        pr_url = String::from_utf8_lossy(&out.stdout).lines().rev().find(|l| l.starts_with("http")).map(String::from);
    }
    inner.append(goal, EventKind::BranchPushed { remote, branch: branch.clone(), pr_url: pr_url.clone() })?;
    inner.toast(
        ToastLevel::Success,
        match &pr_url {
            Some(u) => format!("已推送并创建 PR：{u}"),
            None => format!("已推送 {branch}"),
        },
    );
    Ok(pr_url)
}

/// Moves accepted goals to integrated once their commit is in the local
/// base branch, and archives integrated goals after a day.
pub async fn check_integrations(inner: &Arc<Inner>) -> Result<()> {
    let accepted = inner.store(|s| s.goals_in_state(LifecycleState::Accepted))?;
    for g in accepted {
        let Some(entry) = inner.store(|s| s.last_event(&g.id, "branch_written"))? else { continue };
        let EventKind::BranchWritten { commit, .. } = entry.event else { continue };
        let git = inner.git.clone();
        let (root, base) = (PathBuf::from(&g.project_root), g.base_branch.clone());
        let merged =
            tokio::task::spawn_blocking(move || git.is_integrated(&root, &base, &commit)).await.unwrap_or(false);
        if merged {
            inner.transition(&g.id, Transition::Integrated, None, "在本地基线分支中观测到合入")?;
        }
    }
    let day = 24 * 60 * 60 * 1000;
    let now = tower_store::system_now();
    for g in inner.store(|s| s.goals_in_state(LifecycleState::Integrated))? {
        let at = inner.store(|s| s.last_event(&g.id, "state_changed"))?.map(|e| e.at).unwrap_or(now);
        if now - at > day {
            inner.transition(&g.id, Transition::Archive, None, "合入 24 小时后自动归档")?;
        }
    }
    Ok(())
}

/// Lists the models the user's Pi can use, cached for ten minutes.
pub async fn models(inner: &Arc<Inner>) -> Result<Vec<ModelInfo>> {
    if let Some((at, list)) = inner.models.lock().expect("models lock").as_ref()
        && at.elapsed() < Duration::from_secs(600)
    {
        return Ok(list.clone());
    }
    let program = inner.pi_program().ok_or_else(|| invalid("没有找到 pi"))?;
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
    *inner.models.lock().expect("models lock") = Some((Instant::now(), list.clone()));
    Ok(list)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn branch_slugs_are_ascii() {
        assert_eq!(slug("Fix checkout double charge!"), "fix-checkout-double-charge");
        assert_eq!(slug("修复重复扣款"), "goal");
        assert_eq!(slug("修复 checkout 扣款"), "checkout");
    }
}
