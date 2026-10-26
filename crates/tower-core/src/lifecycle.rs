//! Goal lifecycle state machine (`docs/03-goal-lifecycle.md` §3.1–3.2).
//!
//! The lifecycle answers "how far from intent to archive is this goal". It is
//! driven only by human decisions and harness facts, never by what the agent
//! says. `Mode` (what the engine is doing right now) is a separate axis.

use serde::{Deserialize, Serialize};
use thiserror::Error;
use ts_rs::TS;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize, TS)]
#[serde(rename_all = "snake_case")]
#[ts(export)]
pub enum LifecycleState {
    /// Only a one-line intent exists.
    Draft,
    /// Contract ratified; waiting for an execution slot.
    Ready,
    /// A run is active.
    Running,
    /// Engine idle, context retained. See `PauseReason`.
    Paused,
    /// The agent said it is done. A claim, not a fact.
    Claimed,
    /// The verifier is re-running the acceptance criteria on a pinned snapshot.
    Verifying,
    /// Waiting for a human to accept.
    InReview,
    /// A human accepted; the goal branch is written to the user's repository.
    Accepted,
    /// The accepted commit was observed in the local base branch.
    Integrated,
    Archived,
    Abandoned,
}

impl LifecycleState {
    pub fn is_terminal(self) -> bool {
        matches!(self, Self::Archived | Self::Abandoned)
    }

    /// States in which an engine process may be alive.
    pub fn has_live_run(self) -> bool {
        matches!(self, Self::Running)
    }

    pub fn as_str(self) -> &'static str {
        match self {
            Self::Draft => "draft",
            Self::Ready => "ready",
            Self::Running => "running",
            Self::Paused => "paused",
            Self::Claimed => "claimed",
            Self::Verifying => "verifying",
            Self::InReview => "in_review",
            Self::Accepted => "accepted",
            Self::Integrated => "integrated",
            Self::Archived => "archived",
            Self::Abandoned => "abandoned",
        }
    }

    pub fn parse(s: &str) -> Option<Self> {
        Some(match s {
            "draft" => Self::Draft,
            "ready" => Self::Ready,
            "running" => Self::Running,
            "paused" => Self::Paused,
            "claimed" => Self::Claimed,
            "verifying" => Self::Verifying,
            "in_review" => Self::InReview,
            "accepted" => Self::Accepted,
            "integrated" => Self::Integrated,
            "archived" => Self::Archived,
            "abandoned" => Self::Abandoned,
            _ => return None,
        })
    }
}

/// Why a goal is paused. Each reason has exactly one way out (`03` §3.2.1).
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize, TS)]
#[serde(rename_all = "snake_case")]
#[ts(export)]
pub enum PauseReason {
    /// The human pressed pause.
    Human,
    BudgetSoftCap,
    BudgetHardCap,
    /// The agent stopped without calling `submit`.
    IdleWithoutSubmit,
    /// The Pi process exited unexpectedly.
    EngineCrash,
    /// Tower quit while the goal was running; resumed on next launch.
    AppQuit,
    /// Verification failed and the rework limit is reached.
    VerifyFailedLimit,
    /// The verifier could not run (setup or infrastructure failure), which is
    /// not the same as a criterion failing.
    VerifyEnvError,
    /// Workspace preparation or engine handshake failed.
    PrepareFailed,
    /// The model provider reported an error the engine could not retry past.
    ProviderError,
    /// Verification passed but a high-severity sentinel fired (e.g. tests were
    /// deleted or the test command was changed). Needs a human override.
    SentinelHigh,
    /// The run exceeded the contract's wall-clock cap.
    WallClockCap,
    /// Tower itself failed while moving the goal along (a bug or a broken
    /// data directory). Recorded instead of leaving the goal stuck.
    Internal,
}

impl PauseReason {
    /// Whether leaving this pause needs a human decision (it then raises a
    /// Needs-You item). `AppQuit` resumes automatically on launch.
    pub fn needs_human(self) -> bool {
        !matches!(self, Self::AppQuit | Self::Human)
    }
}

/// Inputs to the state machine.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case", tag = "kind")]
pub enum Transition {
    /// Human ratified the contract.
    Ratify,
    /// The supervisor started a run (fresh, rework, resume or steer).
    RunStarted,
    Pause {
        reason: PauseReason,
    },
    /// Human chose to continue a paused goal; the next state is decided by
    /// what the goal was waiting for (`continuation`).
    Resume,
    /// The agent called `submit` and the engine settled.
    Submitted,
    /// The agent became active again after claiming (`ADR-025` withdraw).
    Withdrawn,
    VerifyStarted,
    VerifyPassed,
    /// Verification failed. `rework` is true when the supervisor decided to
    /// hand the failure evidence back to the agent automatically.
    VerifyFailed {
        rework: bool,
    },
    /// Human asked for changes during review.
    RequestChanges,
    /// Human accepted and the goal branch was written.
    Accept,
    /// The accepted commit is reachable from the local base branch.
    Integrated,
    Archive,
    Abandon,
}

#[derive(Debug, Clone, PartialEq, Eq, Error)]
#[error("transition {transition:?} is not allowed from {from:?}")]
pub struct TransitionError {
    pub from: LifecycleState,
    pub transition: Transition,
}

/// Applies a transition. Returns the next state or an error if the edge does
/// not exist. This is the only place lifecycle edges are defined.
pub fn apply(from: LifecycleState, t: Transition) -> Result<LifecycleState, TransitionError> {
    use LifecycleState as S;
    use Transition as T;
    let to = match (from, t) {
        (_, T::Abandon) if !from.is_terminal() => S::Abandoned,

        (S::Draft, T::Ratify) => S::Ready,
        (S::Ready, T::RunStarted) => S::Running,
        (S::Ready, T::Pause { .. }) => S::Paused,

        (S::Running, T::Pause { .. }) => S::Paused,
        (S::Running, T::Submitted) => S::Claimed,
        // A rework or steer restarts the run while already running.
        (S::Running, T::RunStarted) => S::Running,

        (S::Paused, T::Resume) => S::Ready,
        (S::Paused, T::RunStarted) => S::Running,
        (S::Paused, T::VerifyStarted) => S::Verifying,
        (S::Paused, T::Pause { .. }) => S::Paused,

        (S::Claimed, T::VerifyStarted) => S::Verifying,
        (S::Claimed, T::Withdrawn) => S::Running,
        (S::Claimed, T::Pause { .. }) => S::Paused,

        (S::Verifying, T::VerifyPassed) => S::InReview,
        (S::Verifying, T::VerifyFailed { rework: true }) => S::Running,
        (S::Verifying, T::VerifyFailed { rework: false }) => S::Paused,
        (S::Verifying, T::Pause { .. }) => S::Paused,
        (S::Verifying, T::Withdrawn) => S::Running,

        (S::InReview, T::Accept) => S::Accepted,
        (S::InReview, T::RequestChanges) => S::Running,
        (S::InReview, T::VerifyStarted) => S::Verifying,
        (S::InReview, T::Archive) => S::Archived,

        (S::Accepted, T::Integrated) => S::Integrated,
        (S::Accepted, T::RequestChanges) => S::Running,
        (S::Accepted, T::Archive) => S::Archived,
        (S::Integrated, T::Archive) => S::Archived,

        _ => return Err(TransitionError { from, transition: t }),
    };
    Ok(to)
}

#[cfg(test)]
mod tests {
    use super::*;
    use LifecycleState as S;
    use Transition as T;

    fn walk(start: S, ts: &[T]) -> Result<S, TransitionError> {
        ts.iter().try_fold(start, |s, t| apply(s, *t))
    }

    #[test]
    fn happy_path_reaches_archive_only_through_human_accept() {
        let end = walk(
            S::Draft,
            &[
                T::Ratify,
                T::RunStarted,
                T::Submitted,
                T::VerifyStarted,
                T::VerifyPassed,
                T::Accept,
                T::Integrated,
                T::Archive,
            ],
        );
        assert_eq!(end, Ok(S::Archived));
    }

    #[test]
    fn a_claim_never_skips_verification() {
        assert!(apply(S::Claimed, T::Accept).is_err());
        assert!(apply(S::Claimed, T::VerifyPassed).is_err());
        assert!(apply(S::Running, T::VerifyPassed).is_err());
    }

    #[test]
    fn failed_verification_either_reworks_or_pauses() {
        assert_eq!(apply(S::Verifying, T::VerifyFailed { rework: true }), Ok(S::Running));
        assert_eq!(apply(S::Verifying, T::VerifyFailed { rework: false }), Ok(S::Paused));
    }

    #[test]
    fn terminal_states_accept_nothing() {
        for t in [T::Abandon, T::Resume, T::RunStarted, T::Archive] {
            assert!(apply(S::Archived, t).is_err());
            assert!(apply(S::Abandoned, t).is_err());
        }
    }

    #[test]
    fn abandon_is_allowed_from_every_live_state() {
        for s in [
            S::Draft,
            S::Ready,
            S::Running,
            S::Paused,
            S::Claimed,
            S::Verifying,
            S::InReview,
            S::Accepted,
            S::Integrated,
        ] {
            assert_eq!(apply(s, T::Abandon), Ok(S::Abandoned), "from {s:?}");
        }
    }

    #[test]
    fn state_names_round_trip() {
        for s in [
            S::Draft,
            S::Ready,
            S::Running,
            S::Paused,
            S::Claimed,
            S::Verifying,
            S::InReview,
            S::Accepted,
            S::Integrated,
            S::Archived,
            S::Abandoned,
        ] {
            assert_eq!(LifecycleState::parse(s.as_str()), Some(s));
        }
    }
}
