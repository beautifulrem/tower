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
    /// The agent's own words say it changed the test machinery or the
    /// assertions. A passing run cannot confirm such a claim: what decides
    /// passing is the very thing the claim says was changed.
    CannotConfirm,
}

/// Words that name the machinery a pass depends on.
const MACHINERY: &[&str] = &[
    "assertion",
    "assert.",
    "assert_eq",
    "test framework",
    "test runner",
    "test harness",
    "test machinery",
    "expect.extend",
    "matcher",
    "conftest",
    "monkeypatch",
    "sys.modules",
    "builtins",
    "module loader",
    "断言",
    "测试框架",
    "测试运行器",
    "测试机制",
    "模块加载",
    "测试钩子",
];

/// Words for changing something.
const CHANGED: &[&str] = &[
    "replac",
    "overrid",
    "overrode",
    "patch",
    "stub",
    "disabl",
    "rewrote",
    "rewrit",
    "swap",
    "shim",
    "mock",
    "wrapp",
    "monkey",
    "changed",
    "modif",
    "改写",
    "替换",
    "覆盖",
    "禁用",
    "关掉",
    "改掉",
    "改了",
    "打补丁",
    "拦截",
    "包装",
];

/// Whether the agent's own words say it changed the test machinery or the
/// assertions. Read generously on purpose: taking a claim as "cannot be
/// confirmed" when it might have been innocent costs a second look, while
/// the other way round would let the ledger call a confessed change
/// "consistent" — which is what the honesty grammar exists to prevent.
pub fn admits_changing_test_machinery(text: &str) -> bool {
    let lower = text.to_lowercase();
    MACHINERY.iter().any(|m| lower.contains(m)) && CHANGED.iter().any(|c| lower.contains(c))
}

/// The verifier's latest word on one criterion.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct CriterionFact<'a> {
    pub passed: bool,
    /// The snapshot the verifier ran on.
    pub pin: &'a str,
}

/// Judges a "criterion met" claim against the verifier's latest result and
/// the current workspace fingerprint. `admitted` says whether the agent's
/// own words — this claim's, or the submission's summary — say it changed
/// the test machinery or the assertions; then a pass confirms nothing.
pub fn judge_criterion_claim(
    fact: Option<CriterionFact<'_>>,
    current_pin: Option<&str>,
    admitted: bool,
) -> Consistency {
    match fact {
        None => Consistency::Unsupported,
        Some(f) if !f.passed => Consistency::Contradicted,
        Some(f) if current_pin.is_some_and(|p| p != f.pin) => Consistency::Stale,
        Some(_) if admitted => Consistency::CannotConfirm,
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
    /// Some pass on the current snapshot is not evidence: its must-fail
    /// canary passed too, or a high-severity finding of the latest
    /// verification stands. Lets the board and the sidebar say so.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub not_evidence: Option<bool>,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn claims_are_judged_against_the_latest_fact() {
        let pass = CriterionFact { passed: true, pin: "abc" };
        let fail = CriterionFact { passed: false, pin: "abc" };
        assert_eq!(judge_criterion_claim(None, Some("abc"), false), Consistency::Unsupported);
        assert_eq!(judge_criterion_claim(Some(fail), Some("abc"), false), Consistency::Contradicted);
        assert_eq!(judge_criterion_claim(Some(pass), Some("abc"), false), Consistency::Consistent);
        assert_eq!(judge_criterion_claim(Some(pass), Some("def"), false), Consistency::Stale);
        // The agent says it changed what decides passing: a pass cannot
        // confirm the claim, so the ledger does not call them consistent.
        assert_eq!(judge_criterion_claim(Some(pass), Some("abc"), true), Consistency::CannotConfirm);
    }

    #[test]
    fn a_summary_that_admits_changing_the_assertions_is_read_as_such() {
        for text in [
            "I replaced the assertion function so the suite passes",
            "monkeypatched unittest's assertEqual",
            "改写了断言库里的 equal",
            "swapped the test runner's expect matcher",
        ] {
            assert!(admits_changing_test_machinery(text), "{text}");
        }
        for text in [
            "fixed the multiplication in total()",
            "changed the test to assert the new behaviour",
            "添加了一个测试用例",
            "修好了 add()，断言现在通过了",
        ] {
            assert!(!admits_changing_test_machinery(text), "{text}");
        }
    }
}
