//! After acceptance: pushing the branch, opening a pull request, following
//! its checks, sending CI failures back to the agent, and noticing merges.

use std::path::{Path, PathBuf};
use std::sync::Arc;

use tower_core::i18n::Choice;
use tower_core::lifecycle::Transition;
use tower_core::view::InboxKind;
use tower_core::{EventKind, LifecycleState, tr};
use tower_store::NewInboxItem;

use crate::api::ToastLevel;
use crate::{Inner, Result, invalid, prompts, run};

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
pub(crate) async fn send_ci_failures(inner: &Arc<Inner>, goal: &str) -> Result<()> {
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

#[cfg(test)]
mod tests {
    use super::*;

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
}
