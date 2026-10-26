//! Honesty grammar (`docs/00` R1, `docs/07`, `docs/12` §12.5).
//!
//! The single most important rule in the product: facts computed by the
//! harness and claims made by the agent are kept apart in data and in pixels.
//! A claim is never green. It can only be *linked* to facts, and the ledger
//! says whether the facts agree.

use serde::{Deserialize, Serialize};
use ts_rs::TS;

/// Where a piece of information came from.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize, TS)]
#[serde(rename_all = "snake_case")]
#[ts(export)]
pub enum Provenance {
    /// Computed by the harness: diffs, exit codes, test counts, hashes.
    Fact,
    /// Seen in the agent's own environment (e.g. the agent ran the tests and
    /// they passed there). Useful, but not verified.
    Observation,
    /// Said by the agent.
    Claim,
    /// Decided by a human. Immutable.
    Human,
}

/// What the agent is claiming, via the `log` and `submit` tools.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize, TS)]
#[serde(rename_all = "snake_case")]
#[ts(export)]
pub enum ClaimKind {
    /// Why something is broken.
    Cause,
    /// A choice the agent made, with its reason.
    Decision,
    /// Something the agent assumed and the human should confirm.
    Assumption,
    /// What the agent will do next.
    Next,
    /// A progress note.
    Progress,
    /// "This criterion is met" (from `submit`).
    CriterionMet,
    /// The final "I'm done" summary (from `submit`).
    Done,
}

impl ClaimKind {
    pub fn parse(s: &str) -> Option<Self> {
        Some(match s {
            "cause" => Self::Cause,
            "decision" => Self::Decision,
            "assumption" => Self::Assumption,
            "next" => Self::Next,
            "progress" => Self::Progress,
            "criterion_met" => Self::CriterionMet,
            "done" => Self::Done,
            _ => return None,
        })
    }

    /// Assumptions need a human to approve or reject them.
    pub fn needs_approval(self) -> bool {
        matches!(self, Self::Assumption)
    }
}

/// How a claim relates to the facts linked to it.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize, TS)]
#[serde(rename_all = "snake_case")]
#[ts(export)]
pub enum Consistency {
    /// Linked facts agree.
    Consistent,
    /// A linked fact contradicts the claim.
    Contradicted,
    /// Agreed with a fact, but the workspace changed since.
    Stale,
    /// No fact is linked.
    Unsupported,
}

/// The verifier's latest word on one criterion.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct CriterionFact<'a> {
    pub passed: bool,
    /// The snapshot the verifier ran on.
    pub pin: &'a str,
}

/// Judges a "criterion met" claim against the verifier's latest result and
/// the current workspace fingerprint.
pub fn judge_criterion_claim(fact: Option<CriterionFact<'_>>, current_pin: Option<&str>) -> Consistency {
    match fact {
        None => Consistency::Unsupported,
        Some(f) if !f.passed => Consistency::Contradicted,
        Some(f) if current_pin.is_some_and(|p| p != f.pin) => Consistency::Stale,
        Some(_) => Consistency::Consistent,
    }
}

/// Two-track progress shown as `已验证 V/M · 观测 O/M` (`ADR-020`).
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct Progress {
    /// Machine criteria passed by the verifier on the current snapshot. Fact.
    pub verified: u32,
    /// Machine criteria the agent's environment has seen pass. Observation.
    pub observed: u32,
    /// Number of machine criteria.
    pub machine: u32,
    /// Human criteria checked off.
    pub human_done: u32,
    pub human: u32,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn claims_are_judged_against_the_latest_fact() {
        let pass = CriterionFact { passed: true, pin: "abc" };
        let fail = CriterionFact { passed: false, pin: "abc" };
        assert_eq!(judge_criterion_claim(None, Some("abc")), Consistency::Unsupported);
        assert_eq!(judge_criterion_claim(Some(fail), Some("abc")), Consistency::Contradicted);
        assert_eq!(judge_criterion_claim(Some(pass), Some("abc")), Consistency::Consistent);
        assert_eq!(judge_criterion_claim(Some(pass), Some("def")), Consistency::Stale);
    }
}
