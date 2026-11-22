//! Learning loop & calibration scoreboard (`docs/09` §9.2–9.8, `docs/18` P1.2 & P2.3).
//!
//! Mines candidate `MemoryProposal`s when a goal with rework cycles or human
//! steering comments is accepted, enforces reverse-whitelist taint rules on
//! ratification, and computes honest calibration statistics from persisted facts.

use std::sync::Arc;

use tower_core::honesty::ClaimKind;
use tower_core::ops::{contains_secret_pattern, is_suspicious_memory_instruction};
use tower_core::view::{CalibrationRow, MemoryProposal, MemoryScope, ProposalStatus, TaintClass, TaintLevel};
use tower_core::{EventKind, PauseReason, tr};
use tower_store::{CalibrationFactInput, NewMemoryProposal, ProjectPatch};

use crate::{Inner, Result, Supervisor, invalid};

/// Directive keywords indicating a human steering/review sentence expresses a reusable rule.
const DIRECTIVE_CLUES: &[&str] = &[
    "always ", "never ", "don't ", "do not ", "must ", "prefer ", "should ", "use ", "avoid ", "不要", "别", "必须",
    "应该", "改用", "统一", "一律",
];

/// Records or updates calibration facts for `goal_id` from persisted store state.
pub(crate) fn record_calibration(inner: &Inner, goal_id: &str) -> Result<()> {
    let rec = inner.store(|s| s.goal(goal_id))?;
    let engine = inner.engine_of(&rec);
    let settings = inner.settings();
    let (eff_model, _) = rec.contract.effective_model(
        &settings.default_model,
        &settings.default_escalation_model,
        settings.default_escalation_after_reworks,
        rec.rework_cycles,
    );
    let model = eff_model.unwrap_or_else(|| "default".into());
    let trace = inner.store(|s| s.trace(goal_id, None, 500))?;
    let first_verify = trace.iter().rev().find_map(|e| match &e.event {
        EventKind::VerifyFinished { passed, env_error, .. } if !env_error => Some(*passed),
        _ => None,
    });
    let had_high_sentinel = trace.iter().any(
        |e| matches!(&e.event, EventKind::SentinelHit { severity, .. } if *severity >= tower_core::sentinel::HIGH),
    );
    let reported_blocked = rec.pause_reason == Some(PauseReason::AgentReportedBlocked)
        || trace.iter().any(|e| matches!(&e.event, EventKind::AgentBlocked { .. }));

    let has_machine = rec.contract.machine_criteria().next().is_some();
    let first_pass = if has_machine { first_verify } else { None };
    inner.store(|s| {
        s.upsert_calibration_fact(&CalibrationFactInput {
            goal_id: rec.id.clone(),
            project_id: rec.project_id.clone(),
            engine,
            model,
            first_pass,
            rework_cycles: rec.rework_cycles,
            had_high_sentinel,
            reported_blocked,
            cost_usd: rec.cost_usd,
        })
    })
}

/// Mines candidate `MemoryProposal`s when an accepted goal experienced rework
/// cycles or human steering comments (`docs/09` §9.6).
///
/// - Human free-text steering/review directives -> `TaintLevel::None` (whitelist).
/// - Harness verification failure facts -> `TaintLevel::None` (whitelist).
/// - Agent `Decision`/`Cause` log claims -> `TaintLevel::Standard` (or `High`
///   if the goal ran with network enabled).
pub(crate) fn mine_proposals_on_accept(inner: &Arc<Inner>, goal_id: &str) -> Result<Vec<MemoryProposal>> {
    let rec = inner.store(|s| s.goal(goal_id))?;
    let trace = inner.store(|s| s.trace(goal_id, None, 500))?;
    let steers: Vec<String> = trace
        .iter()
        .rev()
        .filter_map(|e| match &e.event {
            EventKind::Steered { text } => Some(text.clone()),
            _ => None,
        })
        .collect();
    if rec.rework_cycles == 0 && steers.is_empty() {
        return Ok(Vec::new());
    }

    let mut created = Vec::new();
    let mut push_candidate = |proposal: NewMemoryProposal| -> Result<()> {
        if created.len() >= 5 {
            return Ok(());
        }
        let text = proposal.text.trim();
        if text.len() < 8 || text.len() > 320 || contains_secret_pattern(text) {
            return Ok(());
        }
        let saved = inner.store(|s| s.create_memory_proposal(proposal))?;
        let _ = inner.append(
            goal_id,
            EventKind::MemoryProposed {
                proposal_id: saved.id.clone(),
                text: saved.text.clone(),
                taint_level: saved.taint_level,
            },
        );
        created.push(saved);
        Ok(())
    };

    // 1. L1: Human steering / review comments -> strictly whitelisted (`taint: None`).
    for steer in &steers {
        for sentence in extract_directive_sentences(steer) {
            push_candidate(NewMemoryProposal {
                scope: MemoryScope::Project,
                project_id: Some(rec.project_id.clone()),
                goal_id: Some(rec.id.clone()),
                text: sentence.clone(),
                detail: format!("Mined from human steering during {}", rec.id),
                origin: "mined_steering".into(),
                evidence: vec![format!("{} steering: {}", rec.id, truncate(steer, 200))],
                taint_classes: Vec::new(),
            })?;
        }
    }

    // 2. L3: Rework verification failures -> pure Harness Fact (`taint: None`).
    if rec.rework_cycles > 0 {
        let mut failed_criteria: Vec<String> = trace
            .iter()
            .filter_map(|e| match &e.event {
                EventKind::CriterionResult { criterion, passed: false, .. } => Some(criterion.clone()),
                _ => None,
            })
            .collect();
        failed_criteria.sort();
        failed_criteria.dedup();
        for cid in failed_criteria {
            if let Some(cr) = rec.contract.criteria.iter().find(|c| c.id == cid)
                && let tower_core::CriterionKind::Exec { command, .. } = &cr.kind
            {
                let rule = format!("Run `{command}` and ensure {} passes before submitting.", cr.title);
                push_candidate(NewMemoryProposal {
                    scope: MemoryScope::Project,
                    project_id: Some(rec.project_id.clone()),
                    goal_id: Some(rec.id.clone()),
                    text: rule,
                    detail: format!(
                        "Goal {} needed {} rework cycle(s) after {} failed.",
                        rec.id, rec.rework_cycles, cid
                    ),
                    origin: "mined_rework".into(),
                    evidence: vec![format!("{} fact: {} (`{}`) failed prior to rework", rec.id, cid, command)],
                    taint_classes: Vec::new(),
                })?;
            }
        }
    }

    // 3. Agent decision/cause claims -> always tainted (`Standard`, or `High` if network was on).
    let mut agent_taint = vec![TaintClass::RepoContent, TaintClass::ToolOutput];
    if rec.contract.network {
        agent_taint.push(TaintClass::Web);
    }
    if !rec.contract.attachments.is_empty() {
        agent_taint.push(TaintClass::PastedContext);
    }
    let detail = inner.store(|s| s.detail(goal_id))?;
    for claim in
        detail.claims.iter().filter(|c| matches!(c.kind, ClaimKind::Decision) && c.approved != Some(false)).take(2)
    {
        let line = claim.text.lines().next().unwrap_or("").trim();
        if extract_directive_sentences(line).is_empty() {
            continue;
        }
        push_candidate(NewMemoryProposal {
            scope: MemoryScope::Goal,
            project_id: Some(rec.project_id.clone()),
            goal_id: Some(rec.id.clone()),
            text: truncate(line, 240),
            detail: format!("Extracted from agent decision log in {}", rec.id),
            origin: "agent_proposed".into(),
            evidence: vec![format!("{} agent claim ({}): {}", rec.id, claim.id, truncate(&claim.text, 200))],
            taint_classes: agent_taint.clone(),
        })?;
    }

    Ok(created)
}

fn extract_directive_sentences(text: &str) -> Vec<String> {
    text.split(['\n', '.', '。', ';', '；'])
        .map(str::trim)
        .filter(|s| s.len() >= 8 && s.len() <= 240)
        .filter(|s| {
            let lower = s.to_ascii_lowercase();
            DIRECTIVE_CLUES.iter().any(|clue| lower.contains(clue))
        })
        .map(String::from)
        .take(3)
        .collect()
}

fn truncate(s: &str, max_chars: usize) -> String {
    let trimmed = s.trim();
    if trimmed.chars().count() <= max_chars {
        trimmed.to_string()
    } else {
        let mut out: String = trimmed.chars().take(max_chars).collect();
        out.push('…');
        out
    }
}

impl Supervisor {
    /// Lists memory proposals from the ratification queue (concurrent WAL read).
    pub fn memory_proposals(&self, status: Option<ProposalStatus>) -> Result<Vec<MemoryProposal>> {
        self.inner.read_store(|s| s.memory_proposals(status))
    }

    /// Ratifies a pending memory proposal and writes it into the target memory store.
    ///
    /// Enforces `docs/09` §9.2.1 & §9.3.3:
    /// - Rejects any text matching secret patterns.
    /// - Proposals with `TaintLevel::High` or suspicious instruction patterns REQUIRE
    ///   either edited text (different from the proposed text) OR an explicit
    ///   confirmation phrase (`confirmed_phrase` non-empty and matching the text
    ///   or `"CONFIRM"` / `"确认"`).
    pub fn approve_proposal(
        &self,
        id: &str,
        edited_text: Option<&str>,
        confirmed_phrase: Option<&str>,
    ) -> Result<MemoryProposal> {
        let lang = self.inner.lang();
        let current = self.inner.store(|s| s.memory_proposal(id))?;
        let edited = edited_text.map(str::trim).filter(|s| !s.is_empty());
        let final_text = edited.unwrap_or(&current.text);
        if contains_secret_pattern(final_text) {
            return Err(invalid(tr!(
                lang,
                "提议文本命中密钥特征，已拒绝写入记忆",
                "Proposal text matches a secret pattern and cannot be added to memory"
            )));
        }
        let suspicious = is_suspicious_memory_instruction(final_text);
        if current.taint_level == TaintLevel::High || suspicious {
            let text_changed = edited.is_some_and(|e| e != current.text.trim());
            let phrase_ok = confirmed_phrase.map(str::trim).is_some_and(|p| {
                !p.is_empty()
                    && (p.eq_ignore_ascii_case("confirm") || p == "确认" || p.eq_ignore_ascii_case(final_text))
            });
            if !text_changed && !phrase_ok {
                return Err(invalid(tr!(
                    lang,
                    "高污染或含可疑指令的提议必须编辑文本，或输入确认短语后才能批准",
                    "High-taint or suspicious proposals require editing the text or typing a confirmation phrase before approval"
                )));
            }
        }
        let approved = self.inner.store(|s| s.resolve_memory_proposal(id, ProposalStatus::Approved, edited))?;
        // Persist approved rule into the active memory store for its scope.
        match approved.scope {
            MemoryScope::User => {
                let mut settings = self.inner.settings();
                append_memory_line(&mut settings.user_memory, &approved.text);
                self.inner.store(|s| s.save_settings(&settings))?;
            }
            MemoryScope::Project => {
                if let Some(pid) = approved.project_id.as_deref()
                    && let Ok(proj) = self.inner.store(|s| s.project(pid))
                {
                    let mut memory = proj.memory.clone();
                    append_memory_line(&mut memory, &approved.text);
                    let patch = ProjectPatch {
                        base_branch: proj.base_branch,
                        test_command: proj.test_command,
                        local_files: proj.local_files,
                        memory,
                        setup_command: proj.setup_command,
                        holdout_files: proj.holdout_files,
                    };
                    let _ = self.inner.store(|s| s.update_project(pid, &patch));
                    self.inner.emit_projects();
                }
            }
            MemoryScope::Goal => {}
        }
        if let Some(gid) = approved.goal_id.as_deref() {
            let _ =
                self.inner.append(gid, EventKind::MemoryRatified { proposal_id: approved.id.clone(), approved: true });
        }
        Ok(approved)
    }

    /// Rejects a pending memory proposal so it never enters memory.
    pub fn reject_proposal(&self, id: &str, _reason: Option<&str>) -> Result<()> {
        let rejected = self.inner.store(|s| s.resolve_memory_proposal(id, ProposalStatus::Rejected, None))?;
        if let Some(gid) = rejected.goal_id.as_deref() {
            let _ = self.inner.append(gid, EventKind::MemoryRatified { proposal_id: rejected.id, approved: false });
        }
        Ok(())
    }

    /// Returns honest calibration statistics grouped by `(engine, model)` (concurrent WAL read).
    pub fn calibration_rows(&self, project_id: Option<&str>) -> Result<Vec<CalibrationRow>> {
        self.inner.read_store(|s| s.calibration_rows(project_id))
    }
}

fn append_memory_line(existing: &mut String, rule: &str) {
    let rule = rule.trim();
    if rule.is_empty() || existing.lines().any(|l| l.trim() == rule || l.trim().trim_start_matches("- ") == rule) {
        return;
    }
    if !existing.is_empty() && !existing.ends_with('\n') {
        existing.push('\n');
    }
    existing.push_str("- ");
    existing.push_str(rule);
    existing.push('\n');
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn directive_extractor_picks_actionable_human_rules() {
        let text = "Looks mostly fine. Always use pnpm instead of npm.\n不要在提交信息里加 emoji。";
        let rules = extract_directive_sentences(text);
        assert_eq!(rules.len(), 2, "{rules:?}");
        assert!(rules[0].contains("Always use pnpm"));
        assert!(rules[1].contains("不要"));
    }

    #[test]
    fn append_memory_deduplicates_lines() {
        let mut mem = String::new();
        append_memory_line(&mut mem, "Use pnpm");
        append_memory_line(&mut mem, "Use pnpm");
        assert_eq!(mem, "- Use pnpm\n");
    }

    async fn test_supervisor(tmp: &tempfile::TempDir) -> (Supervisor, String) {
        let repo = tmp.path().join("repo");
        std::fs::create_dir_all(&repo).unwrap();
        let git = tower_git::Git::default();
        std::fs::write(
            repo.join("package.json"),
            r#"{"name":"demo","scripts":{"test":"node -e \"process.exit(0)\""}}"#,
        )
        .unwrap();
        std::fs::write(repo.join("index.js"), "export const x = 1;\n").unwrap();
        git.init_with_commit(&repo, "init").unwrap();

        let ext = std::path::PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../../extensions/tower-goal");
        let sup = Supervisor::start(
            crate::Config {
                paths: crate::Paths::new(tmp.path().join("tower-home")),
                extension_source: ext,
                env: Some(crate::shell_env::ShellEnv::from_pairs(std::env::vars())),
                demo_engine: None,
            },
            Arc::new(crate::NullSink),
        )
        .await
        .unwrap();
        let p = sup.add_project(repo.to_str().unwrap()).await.unwrap();
        (sup, p.id)
    }

    #[tokio::test]
    async fn high_taint_proposals_require_edit_or_confirmation_and_block_secrets() {
        let tmp = tempfile::tempdir().unwrap();
        let (sup, pid) = test_supervisor(&tmp).await;
        let high = sup
            .inner
            .store(|s| {
                s.create_memory_proposal(NewMemoryProposal {
                    scope: MemoryScope::Project,
                    project_id: Some(pid.clone()),
                    goal_id: None,
                    text: "Prefer strict null checks".into(),
                    detail: "from mcp".into(),
                    origin: "agent_proposed".into(),
                    evidence: vec!["mcp output".into()],
                    taint_classes: vec![TaintClass::RepoContent, TaintClass::Mcp],
                })
            })
            .unwrap();
        assert_eq!(high.taint_level, TaintLevel::High);

        // Blind approval without edit or confirmation phrase MUST fail.
        assert!(sup.approve_proposal(&high.id, None, None).is_err());
        // Secret injection MUST fail even with confirmation phrase.
        assert!(sup.approve_proposal(&high.id, Some("Use sk-ant-secret123"), Some("CONFIRM")).is_err());
        // Edited text succeeds and writes to project memory.
        let ok = sup.approve_proposal(&high.id, Some("Always enable strictNullChecks in tsconfig"), None).unwrap();
        assert_eq!(ok.status, ProposalStatus::Approved);
        let proj = sup.inner.read_store(|s| s.project(&pid)).unwrap();
        assert!(proj.memory.contains("Always enable strictNullChecks in tsconfig"));
    }

    #[tokio::test]
    async fn attachments_schedules_holdouts_and_storage_guard_work_end_to_end() {
        let tmp = tempfile::tempdir().unwrap();
        let (sup, pid) = test_supervisor(&tmp).await;
        let contract =
            tower_core::contract::Contract::quick("Check behavior", Some("npm test".into()), tower_core::Lang::En);
        let g = sup
            .create_goal(crate::NewGoalInput {
                project_id: pid.clone(),
                title: "Ops test goal".into(),
                contract: contract.clone(),
                ratify: false,
            })
            .await
            .unwrap();

        // 1. Valid PNG attachment saves & loads via data URL; invalid bytes rejected.
        let png = [0x89, b'P', b'N', b'G', 0x0D, 0x0A, 0x1A, 0x0A, 0, 0, 0, 0];
        let b64 = crate::attachments::encode_base64(&png);
        let att = sup.save_attachment(&g.id, "screenshot.png", &b64).unwrap();
        assert_eq!(att.mime, "image/png");
        assert!(sup.attachment_data_url(&g.id, &att.path).unwrap().starts_with("data:image/png;base64,"));
        assert!(sup.save_attachment(&g.id, "bad.txt", "aGVsbG8=").is_err());
        sup.delete_attachment(&g.id, &att.id).unwrap();

        // 2. Scheduled goal creation, toggle, and deletion.
        let sch = sup
            .create_scheduled_goal(crate::NewScheduledGoalInput {
                project_id: pid.clone(),
                title: "Nightly check".into(),
                cron_expr: "0 3 * * *".into(),
                contract_template: contract,
                enabled: true,
                unattended_strict: true,
            })
            .unwrap();
        assert!(sch.next_run_at.is_some());
        let off = sup.toggle_scheduled_goal(&sch.id, false).unwrap();
        assert!(!off.enabled && off.next_run_at.is_none());
        sup.delete_scheduled_goal(&sch.id).unwrap();
        assert!(sup.scheduled_goals().unwrap().is_empty());

        // 3. Synthetic holdout drafts propose without writing; ratification writes & registers.
        let drafts = sup.generate_holdout_drafts(&pid, "Prevent negative discount").await.unwrap();
        assert!(!drafts.is_empty());
        let rel = sup.ratify_holdout_draft(&pid, &drafts[0].filename, &drafts[0].code).await.unwrap();
        assert!(rel.starts_with("holdout/"));
        let proj = sup.inner.read_store(|s| s.project(&pid)).unwrap();
        assert!(proj.holdout_files.iter().any(|p| p == "holdout/**"));

        // 4. Storage inventory works and reclamation strictly refuses non-terminal goals.
        let inv = sup.storage_inventory().await.unwrap();
        assert_eq!(inv.goals.len(), 1);
        assert!(!inv.goals[0].reclaimable);
        assert!(sup.reclaim_storage(vec![g.id.clone()]).await.is_err());

        // 5. Engine descriptors and sandbox posture return structured data.
        assert_eq!(sup.engines().len(), 5);
        assert!(!sup.sandbox_posture().backend_name.is_empty());
    }
}
