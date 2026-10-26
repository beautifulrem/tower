//! Goal event log entries (`docs/06` §6.2.1).
//!
//! Every change to a goal is appended as one of these, in a single writer, in
//! the same transaction that updates the projections. The log is the source
//! of truth for the trace view, the ledger and the re-entry briefing.

use serde::{Deserialize, Serialize};
use ts_rs::TS;

use crate::contract::Contract;
use crate::honesty::ClaimKind;
use crate::lifecycle::{LifecycleState, PauseReason};
use crate::mode::Mode;

/// Who produced an event. Maps onto the honesty grammar's registers.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize, TS)]
#[serde(rename_all = "snake_case")]
#[ts(export)]
pub enum Source {
    /// The harness measured it.
    Fact,
    /// The agent's environment showed it.
    Observation,
    /// The agent said it.
    Claim,
    /// A human did it.
    Human,
    /// Tower bookkeeping.
    System,
}

impl Source {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Fact => "fact",
            Self::Observation => "observation",
            Self::Claim => "claim",
            Self::Human => "human",
            Self::System => "system",
        }
    }

    pub fn parse(s: &str) -> Option<Self> {
        Some(match s {
            "fact" => Self::Fact,
            "observation" => Self::Observation,
            "claim" => Self::Claim,
            "human" => Self::Human,
            "system" => Self::System,
            _ => return None,
        })
    }
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, TS)]
#[serde(rename_all = "snake_case", tag = "kind")]
#[ts(export)]
pub enum EventKind {
    GoalCreated {
        title: String,
    },
    ContractRatified {
        contract: Contract,
    },
    StateChanged {
        from: LifecycleState,
        to: LifecycleState,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        reason: Option<PauseReason>,
        #[serde(default, skip_serializing_if = "String::is_empty")]
        note: String,
    },
    WorkspacePrepared {
        workspace: String,
        base_commit: String,
    },
    SessionAttached {
        session_file: String,
    },
    /// The satellite and scratch directories were deleted to free disk space.
    WorkspaceRemoved,
    RunStarted {
        run_no: u32,
        purpose: String,
    },
    RunEnded {
        run_no: u32,
        outcome: String,
    },
    ModeChanged {
        mode: Mode,
    },
    /// The text sent to the engine (prompt, steer, follow-up). Shown in the
    /// trace marked as "Tower 注入" so every injected token is visible.
    Injected {
        channel: String,
        text: String,
    },
    ToolStarted {
        call_id: String,
        tool: String,
        summary: String,
    },
    ToolEnded {
        call_id: String,
        tool: String,
        is_error: bool,
        summary: String,
        duration_ms: i64,
    },
    /// One assistant message, truncated for the trace.
    AssistantMessage {
        text: String,
    },
    Claim {
        claim_id: String,
        claim: ClaimKind,
        text: String,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        criterion: Option<String>,
    },
    Submitted {
        summary: String,
    },
    Pinned {
        pin: String,
        files: u32,
        additions: u32,
        deletions: u32,
    },
    VerifyStarted {
        pin: String,
    },
    SetupFinished {
        command: String,
        ok: bool,
        exit_code: Option<i32>,
        duration_ms: i64,
    },
    CriterionResult {
        criterion: String,
        pin: String,
        passed: bool,
        exit_code: Option<i32>,
        duration_ms: i64,
        output_tail: String,
    },
    VerifyFinished {
        pin: String,
        passed: bool,
        env_error: bool,
    },
    /// Agent-environment observation: a command matching a criterion ran there.
    Observed {
        criterion: String,
        passed: bool,
    },
    InboxOpened {
        item_id: String,
        title: String,
    },
    InboxResolved {
        item_id: String,
        response: String,
    },
    Steered {
        text: String,
    },
    HumanCheck {
        criterion: String,
        checked: bool,
    },
    ClaimReviewed {
        claim_id: String,
        approved: bool,
    },
    CostUpdated {
        total_usd: f64,
    },
    BranchWritten {
        branch: String,
        commit: String,
    },
    EngineError {
        message: String,
    },
    Note {
        text: String,
    },
    /// A sentinel found something in the verified snapshot that a passing
    /// test run would hide (deleted tests, skipped tests, a changed test
    /// command, writes outside the scope).
    SentinelHit {
        sentinel: String,
        severity: u8,
        title: String,
        detail: String,
    },
    /// A stall detector fired while the agent kept running.
    Stalled {
        detector: String,
        detail: String,
    },
    /// Files the human changed in the workspace while the goal was paused.
    HumanEdited {
        files: Vec<String>,
    },
    /// Git-ignored local files copied into a workspace or checkout.
    LocalFilesCopied {
        files: Vec<String>,
    },
    /// The human pushed the accepted branch (and maybe opened a PR).
    BranchPushed {
        remote: String,
        branch: String,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        pr_url: Option<String>,
    },
}

impl EventKind {
    /// The register an event is shown in.
    pub fn source(&self) -> Source {
        match self {
            Self::Claim { .. } | Self::Submitted { .. } | Self::AssistantMessage { .. } => Source::Claim,
            Self::Observed { .. } => Source::Observation,
            Self::ContractRatified { .. }
            | Self::InboxResolved { .. }
            | Self::Steered { .. }
            | Self::HumanCheck { .. }
            | Self::ClaimReviewed { .. } => Source::Human,
            Self::SentinelHit { .. }
            | Self::Stalled { .. }
            | Self::HumanEdited { .. }
            | Self::LocalFilesCopied { .. }
            | Self::BranchPushed { .. }
            | Self::ToolStarted { .. }
            | Self::ToolEnded { .. }
            | Self::Pinned { .. }
            | Self::VerifyStarted { .. }
            | Self::SetupFinished { .. }
            | Self::CriterionResult { .. }
            | Self::VerifyFinished { .. }
            | Self::CostUpdated { .. }
            | Self::BranchWritten { .. }
            | Self::WorkspacePrepared { .. } => Source::Fact,
            _ => Source::System,
        }
    }

    /// Stable short name, used as an index column.
    pub fn name(&self) -> &'static str {
        match self {
            Self::GoalCreated { .. } => "goal_created",
            Self::ContractRatified { .. } => "contract_ratified",
            Self::StateChanged { .. } => "state_changed",
            Self::WorkspacePrepared { .. } => "workspace_prepared",
            Self::SessionAttached { .. } => "session_attached",
            Self::WorkspaceRemoved => "workspace_removed",
            Self::RunStarted { .. } => "run_started",
            Self::RunEnded { .. } => "run_ended",
            Self::ModeChanged { .. } => "mode_changed",
            Self::Injected { .. } => "injected",
            Self::ToolStarted { .. } => "tool_started",
            Self::ToolEnded { .. } => "tool_ended",
            Self::AssistantMessage { .. } => "assistant_message",
            Self::Claim { .. } => "claim",
            Self::Submitted { .. } => "submitted",
            Self::Pinned { .. } => "pinned",
            Self::VerifyStarted { .. } => "verify_started",
            Self::SetupFinished { .. } => "setup_finished",
            Self::CriterionResult { .. } => "criterion_result",
            Self::VerifyFinished { .. } => "verify_finished",
            Self::Observed { .. } => "observed",
            Self::InboxOpened { .. } => "inbox_opened",
            Self::InboxResolved { .. } => "inbox_resolved",
            Self::Steered { .. } => "steered",
            Self::HumanCheck { .. } => "human_check",
            Self::ClaimReviewed { .. } => "claim_reviewed",
            Self::CostUpdated { .. } => "cost_updated",
            Self::BranchWritten { .. } => "branch_written",
            Self::EngineError { .. } => "engine_error",
            Self::Note { .. } => "note",
            Self::SentinelHit { .. } => "sentinel_hit",
            Self::Stalled { .. } => "stalled",
            Self::HumanEdited { .. } => "human_edited",
            Self::LocalFilesCopied { .. } => "local_files_copied",
            Self::BranchPushed { .. } => "branch_pushed",
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn events_round_trip_through_json() {
        let e = EventKind::CriterionResult {
            criterion: "C1".into(),
            pin: "abc".into(),
            passed: true,
            exit_code: Some(0),
            duration_ms: 12,
            output_tail: "ok".into(),
        };
        let json = serde_json::to_string(&e).unwrap();
        assert!(json.contains("\"kind\":\"criterion_result\""));
        assert_eq!(serde_json::from_str::<EventKind>(&json).unwrap(), e);
        assert_eq!(e.source(), Source::Fact);
    }

    #[test]
    fn agent_words_are_always_claims() {
        let e = EventKind::Submitted { summary: "done".into() };
        assert_eq!(e.source(), Source::Claim);
        let e = EventKind::AssistantMessage { text: "all tests pass".into() };
        assert_eq!(e.source(), Source::Claim);
    }
}
