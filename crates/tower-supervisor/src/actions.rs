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
use tower_store::GoalRecord;

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
        PauseReason::HeldOutFailed => vec![TellFailingNames, ShowHeldOutFailure, Abandon],
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
                crate::pr::send_ci_failures(inner, goal).await?;
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
            // The approval covers exactly this snapshot: if the agent changes
            // anything, verification asks again.
            if let Some(fingerprint) = inner.store(|s| s.goal(goal))?.pin {
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
            let failures = last_failures(inner, &rec, false)?;
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
        Some(Choice::TellFailingNames) => {
            let text = tr!(
                lang,
                "你只把失败的保留测试名称告诉了 Agent",
                "You told the agent only the names of the failing held-out tests"
            );
            inner.append(goal, EventKind::Note { text })?;
            let failing: Vec<(String, String, Vec<String>)> = last_failures(inner, &rec, true)?
                .into_iter()
                .map(|f| (f.id, f.title, prompts::failing_tests(&f.output_tail)))
                .collect();
            let msg = prompts::held_out_names(
                rec.rework_cycles + 1,
                rec.contract.max_rework.max(rec.rework_cycles + 1),
                &failing,
            );
            run::start_run(inner, goal, "rework", msg).await
        }
        Some(Choice::ShowHeldOutFailure) => {
            // The human's call: the agent sees the held-out failures, and so
            // learns about those tests. On record.
            let text = tr!(lang, "你把保留测试的失败输出给了 Agent", "You showed the agent the held-out test failures");
            inner.append(goal, EventKind::Note { text })?;
            let failures = last_failures(inner, &rec, true)?;
            let msg =
                prompts::rework(rec.rework_cycles + 1, rec.contract.max_rework.max(rec.rework_cycles + 1), &failures);
            run::start_run(inner, goal, "rework", msg).await
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

/// The most recent failing results, as rework evidence. Results from runs
/// with the held-out tests present are withheld unless the human chose to
/// `reveal` them.
fn last_failures(inner: &Inner, rec: &GoalRecord, reveal: bool) -> Result<Vec<prompts::Failure>> {
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
                output_tail: if v.held_out && !reveal { verify::WITHHELD.into() } else { v.output_tail.clone() },
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
    if let Some(c) = detail.criteria.iter().find(|c| {
        matches!(c.criterion.kind, tower_core::CriterionKind::Human | tower_core::CriterionKind::Look { .. })
            && !c.human_checked
    }) {
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

    // The commit carries your name, or none is written: never a stand-in.
    let git = inner.git.clone();
    let root = PathBuf::from(&rec.project_root);
    // (The demo project is Tower's own sandbox repository.)
    let demo = root.starts_with(inner.paths.demo_projects());
    if !demo && !tokio::task::spawn_blocking(move || git.has_identity(&root)).await.unwrap_or(false) {
        return Err(invalid(tr!(
            lang,
            "git 没有设置你的名字和邮箱，验收的提交会没有作者。在“设置 › 环境”里填上（可以只用于这个项目），然后再验收。",
            "git has no name and email set, so the accepted commit would have no author. Fill them in under Settings › Environment (for this project only, if you like), then accept again."
        )));
    }
    let branch = branch_name(&rec);
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

/// The branch acceptance writes: the one written before (a re-acceptance
/// updates it), else `tower/<goal>-<slug>`. Titles in Chinese have no ASCII
/// words: the slug falls back to identifiers in the intent (`total()`,
/// `taxRate`), then to the goal number alone. (`seal` adds `-v2` if a
/// branch of that name already exists.)
pub(crate) fn branch_name(rec: &GoalRecord) -> String {
    if let Some(b) = &rec.branch {
        return b.clone();
    }
    let goal = rec.id.to_lowercase();
    match slug(&rec.title).or_else(|| slug(&rec.contract.intent)) {
        Some(s) => format!("tower/{goal}-{s}"),
        None => format!("tower/{goal}"),
    }
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

/// Lists the models the user's Pi can use, cached for ten minutes.
pub async fn models(inner: &Arc<Inner>) -> Result<Vec<ModelInfo>> {
    if let Some((at, list)) = inner.models.lock().unwrap_or_else(PoisonError::into_inner).as_ref()
        && at.elapsed() < Duration::from_secs(600)
    {
        return Ok(list.clone());
    }
    // Claude Code's models, by the aliases its SDK accepts, when it is installed.
    let claude: Vec<ModelInfo> = if inner.env.which("claude").is_some() {
        [("opus", "Claude Opus"), ("sonnet", "Claude Sonnet"), ("haiku", "Claude Haiku")]
            .into_iter()
            .map(|(id, name)| ModelInfo {
                provider: "claude-code".into(),
                id: id.into(),
                name: name.into(),
                reasoning: true,
                cost_input: 0.0,
                cost_output: 0.0,
                context_window: 0,
            })
            .collect()
    } else {
        Vec::new()
    };
    let Some(program) = inner.pi_program() else {
        if claude.is_empty() {
            return Err(invalid(tr!(inner.lang(), "没有找到 pi", "Pi was not found")));
        }
        return Ok(claude);
    };
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
    let list: Vec<ModelInfo> = list.into_iter().chain(claude).collect();
    *inner.models.lock().unwrap_or_else(PoisonError::into_inner) = Some((Instant::now(), list.clone()));
    Ok(list)
}

#[cfg(test)]
mod tests {
    use super::*;
    use tower_core::Lang;

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
