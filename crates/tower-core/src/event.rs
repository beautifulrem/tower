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
use crate::view::PrStatus;

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

// Events are serialized as soon as they are created, so the size of the
// largest variant (a whole contract) costs nothing worth boxing for.
#[allow(clippy::large_enum_variant)]
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
        /// The workspace snapshot when the run began, kept so the human can
        /// roll back to it.
        #[serde(default, skip_serializing_if = "Option::is_none")]
        #[ts(optional)]
        start_pin: Option<String>,
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
        /// What the call was about (its start summary), so the trace can
        /// show it without pairing start and end.
        #[serde(default, skip_serializing_if = "Option::is_none")]
        #[ts(optional)]
        target: Option<String>,
        /// The sandbox refused something the call tried (a read or write
        /// outside the goal's directories).
        #[serde(default)]
        denied: bool,
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
        /// Run with the held-out tests present: the output is for the human
        /// only, never the agent.
        #[serde(default)]
        held_out: bool,
    },
    VerifyFinished {
        pin: String,
        passed: bool,
        env_error: bool,
    },
    /// The criterion's command run in a clean checkout of the base commit,
    /// before any change. A criterion that already passes there does not
    /// prove the goal is done ("red before, green after").
    BaselineResult {
        criterion: String,
        command: String,
        base: String,
        passed: bool,
        /// Why the criterion could not run on the base at all (then `passed`
        /// means nothing).
        #[serde(default, skip_serializing_if = "Option::is_none")]
        #[ts(optional)]
        error: Option<String>,
    },
    /// A screenshot for a `look` criterion, taken by the verifier on the
    /// base (`side` = "base") or on the agent's snapshot ("pin"). `error`
    /// says why there is none.
    LookCaptured {
        criterion: String,
        side: String,
        pin: String,
        file: Option<String>,
        error: Option<String>,
    },
    /// The criterion run on the verified snapshot with only the agent's
    /// source changes kept (tests, configuration, scripts and package
    /// settings as they were on the base). Older events: with the agent's
    /// edits to existing tests undone.
    OriginalTestsResult {
        criterion: String,
        pin: String,
        passed: bool,
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
    /// The human put the workspace back to where run `run_no` started;
    /// `saved` is the snapshot of what was there, for undoing it.
    RolledBack {
        run_no: u32,
        saved: String,
    },
    /// The human allowed verification's setup to use the network for the
    /// dependency changes with this fingerprint.
    SetupNetworkApproved {
        fingerprint: String,
    },
    /// The pull request's state and checks as GitHub reports them, recorded
    /// when they change.
    PrChecked {
        url: String,
        status: PrStatus,
    },
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
            | Self::ClaimReviewed { .. }
            | Self::SetupNetworkApproved { .. }
            | Self::RolledBack { .. } => Source::Human,
            Self::SentinelHit { .. }
            | Self::Stalled { .. }
            | Self::HumanEdited { .. }
            | Self::LocalFilesCopied { .. }
            | Self::BranchPushed { .. }
            | Self::PrChecked { .. }
            | Self::ToolStarted { .. }
            | Self::ToolEnded { .. }
            | Self::Pinned { .. }
            | Self::VerifyStarted { .. }
            | Self::SetupFinished { .. }
            | Self::CriterionResult { .. }
            | Self::BaselineResult { .. }
            | Self::OriginalTestsResult { .. }
            | Self::LookCaptured { .. }
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
            Self::BaselineResult { .. } => "baseline_result",
            Self::OriginalTestsResult { .. } => "original_tests_result",
            Self::LookCaptured { .. } => "look_captured",
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
            Self::PrChecked { .. } => "pr_checked",
            Self::SetupNetworkApproved { .. } => "setup_network_approved",
            Self::RolledBack { .. } => "rolled_back",
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
            held_out: false,
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
