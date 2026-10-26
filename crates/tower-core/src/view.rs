//! Read models sent to the UI. Plain data; the supervisor builds them from
//! the store and the renderer never holds authoritative state (`ADR-005`).

use serde::{Deserialize, Serialize};
use ts_rs::TS;

use crate::Millis;
use crate::contract::{Budget, Contract, Criterion};
use crate::event::{EventKind, Source};
use crate::honesty::{ClaimKind, Consistency, Progress};
use crate::i18n::Lang;
use crate::lifecycle::{LifecycleState, PauseReason};
use crate::mode::Mode;

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct ProjectView {
    pub id: String,
    pub name: String,
    pub root: String,
    pub base_branch: String,
    /// Detected from the repository (package.json scripts, Cargo, ...).
    pub test_command: Option<String>,
    /// Git-ignored files (globs, relative to the root) copied into each
    /// workspace and verification checkout, e.g. `.env`.
    pub local_files: Vec<String>,
    /// Project memory: notes injected into every goal of this project.
    pub memory: String,
    /// Run once in each new workspace (e.g. `pnpm install`), sandboxed, so
    /// the agent starts with dependencies in place. Empty means none.
    pub setup_command: String,
    pub created_at: Millis,
}

/// One line telling you the goal is alive and what kind of thing it is doing.
/// Always a steerable detail, never "working…" (`docs/12` §12.6.4).
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct LiveLine {
    pub mode: Mode,
    pub action: String,
    pub target: String,
    pub at: Millis,
}

#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct DiffStat {
    pub files: u32,
    pub additions: u32,
    pub deletions: u32,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct GoalSummary {
    pub id: String,
    pub project_id: String,
    pub project_name: String,
    pub title: String,
    pub state: LifecycleState,
    pub pause_reason: Option<PauseReason>,
    pub mode: Mode,
    pub live_line: Option<LiveLine>,
    pub progress: Progress,
    pub diffstat: Option<DiffStat>,
    pub cost_usd: f64,
    pub budget: Budget,
    pub run_no: u32,
    pub rework_cycles: u32,
    pub max_rework: u32,
    /// Open Needs-You items for this goal.
    pub needs_you: u32,
    pub verified_pin: Option<String>,
    pub branch: Option<String>,
    pub created_at: Millis,
    pub updated_at: Millis,
    /// When the current run started, for the elapsed clock.
    pub run_started_at: Option<Millis>,
    pub last_viewed_at: Option<Millis>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct CriterionResultView {
    pub pin: String,
    pub passed: bool,
    pub exit_code: Option<i32>,
    pub duration_ms: i64,
    pub output_tail: String,
    pub at: Millis,
    /// The workspace changed after this result; it needs re-verification.
    pub stale: bool,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct ObservationView {
    pub passed: bool,
    pub at: Millis,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct CriterionView {
    pub criterion: Criterion,
    pub verified: Option<CriterionResultView>,
    /// Whether the same command already passed on the base commit, when
    /// checked. `Some(true)` means this criterion cannot tell done from not.
    pub passed_on_base: Option<bool>,
    pub observed: Option<ObservationView>,
    pub human_checked: bool,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct ClaimView {
    pub id: String,
    pub kind: ClaimKind,
    pub text: String,
    pub criterion: Option<String>,
    pub at: Millis,
    pub run_no: u32,
    /// `Some(true|false)` once a human reviewed an assumption.
    pub approved: Option<bool>,
    pub consistency: Consistency,
    /// Short description of the linked fact, if any.
    pub evidence: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct RunView {
    pub run_no: u32,
    pub purpose: String,
    pub started_at: Millis,
    pub ended_at: Option<Millis>,
    pub outcome: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct GoalDetail {
    pub summary: GoalSummary,
    pub contract: Contract,
    pub criteria: Vec<CriterionView>,
    pub claims: Vec<ClaimView>,
    pub runs: Vec<RunView>,
    pub workspace: Option<String>,
    pub base_commit: Option<String>,
    /// The latest snapshot of the workspace (`pinCommit`).
    pub pin: Option<String>,
    pub session_file: Option<String>,
    pub submit_summary: Option<String>,
    pub briefing: Vec<BriefingItem>,
    /// Sentinel findings on the latest verified snapshot.
    pub sentinels: Vec<crate::sentinel::SentinelHit>,
    /// Git-ignored files copied into the workspace (e.g. `.env`).
    pub local_files: Vec<String>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct BriefingItem {
    pub source: Source,
    pub text: String,
    pub at: Millis,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct TraceEntry {
    pub seq: i64,
    pub goal_id: String,
    pub at: Millis,
    pub source: Source,
    pub event: EventKind,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize, TS)]
#[serde(rename_all = "snake_case")]
#[ts(export)]
pub enum InboxKind {
    /// The agent asked a question (`ask_user`).
    Question,
    /// The agent wants to do something the autonomy preset gates.
    Approval,
    /// The agent recorded an assumption that needs a yes or no.
    Assumption,
    /// The goal paused and needs a decision to continue.
    Paused,
    /// Verified and waiting for review.
    ReviewReady,
    /// The run may be stuck (repeated failures, no progress). It keeps
    /// running; the human decides whether to wait, steer or pause.
    Stalled,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct InboxItem {
    pub id: String,
    pub goal_id: String,
    pub goal_title: String,
    pub kind: InboxKind,
    pub title: String,
    pub body: String,
    /// Fixed choices. Empty means free text only.
    pub options: Vec<String>,
    pub allow_text: bool,
    pub created_at: Millis,
    /// Lower is more urgent: blocking questions and approvals first.
    pub urgency: u8,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "snake_case")]
#[ts(export)]
pub enum FileStatus {
    Added,
    Modified,
    Deleted,
    Renamed,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "snake_case")]
#[ts(export)]
pub enum LineKind {
    Context,
    Add,
    Del,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct DiffLine {
    pub kind: LineKind,
    pub old_no: Option<u32>,
    pub new_no: Option<u32>,
    pub text: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct Hunk {
    pub header: String,
    pub lines: Vec<DiffLine>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct DiffFile {
    pub path: String,
    pub old_path: Option<String>,
    pub status: FileStatus,
    pub additions: u32,
    pub deletions: u32,
    pub binary: bool,
    pub hunks: Vec<Hunk>,
}

/// A slice of the diff sized for one sitting (≤ 300 changed lines), ordered by
/// risk (`docs/04` §4.6.2).
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct ReviewUnit {
    pub id: String,
    pub title: String,
    pub files: Vec<String>,
    pub lines: u32,
    /// 0 (low) to 3 (high).
    pub risk: u8,
    pub risk_reasons: Vec<String>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct ReviewView {
    pub goal_id: String,
    pub base_commit: String,
    /// The snapshot the diff starts from: the base, or an earlier pin when
    /// reviewing only what changed since a previous review.
    pub from: String,
    pub pin: String,
    pub stat: DiffStat,
    pub units: Vec<ReviewUnit>,
    pub files: Vec<DiffFile>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct ModelInfo {
    pub provider: String,
    pub id: String,
    pub name: String,
    pub reasoning: bool,
    pub cost_input: f64,
    pub cost_output: f64,
    pub context_window: u64,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct Settings {
    /// Path to the `pi` executable. Empty means look it up on the login PATH.
    pub pi_path: String,
    /// `provider/model`. Empty means the Pi default.
    pub default_model: String,
    pub default_thinking: String,
    pub max_concurrent: u32,
    /// Load the user's own Pi extensions into goal runs.
    pub load_user_extensions: bool,
    /// Specific Pi extensions to load explicitly (e.g. a model provider
    /// package), even when the user's extensions are not loaded.
    #[serde(default)]
    pub extra_extensions: Vec<String>,
    /// User memory: notes injected into every goal.
    #[serde(default)]
    pub user_memory: String,
    /// Command used to open a workspace in an editor (e.g. `code`, `zed`,
    /// `cursor`). Empty means detect.
    #[serde(default)]
    pub editor: String,
    /// Interface and agent language: `zh-CN` or `en`. A new install follows
    /// the system language ([`crate::i18n::system_language`]).
    #[serde(default = "default_language")]
    pub language: String,
}

fn default_language() -> String {
    crate::i18n::system_language().code().into()
}

impl Settings {
    /// The interface language.
    pub fn lang(&self) -> Lang {
        Lang::from_code(&self.language)
    }

    /// The language the agent writes human-facing text in.
    pub fn agent_language(&self) -> &'static str {
        self.lang().pick("Simplified Chinese", "English")
    }
}

impl Default for Settings {
    fn default() -> Self {
        Self {
            pi_path: String::new(),
            default_model: String::new(),
            default_thinking: String::new(),
            max_concurrent: 3,
            load_user_extensions: false,
            extra_extensions: Vec::new(),
            user_memory: String::new(),
            editor: String::new(),
            language: default_language(),
        }
    }
}

/// Engine and environment health shown in the title bar and settings.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct EnvironmentStatus {
    pub pi_path: Option<String>,
    pub pi_version: Option<String>,
    pub git_version: Option<String>,
    pub data_dir: String,
    /// The same problems as `issues`, as plain sentences.
    pub problems: Vec<String>,
    pub issues: Vec<EnvIssue>,
}

/// One environment problem, typed so the interface never has to parse text.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct EnvIssue {
    pub kind: EnvIssueKind,
    /// Whether goals cannot run until it is fixed.
    pub blocking: bool,
    pub text: String,
    /// A command that fixes it, when there is one.
    pub fix: Option<String>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "snake_case")]
#[ts(export)]
pub enum EnvIssueKind {
    PiMissing,
    PiBroken,
    /// Older than the oldest Pi version Tower supports.
    PiTooOld,
    /// Newer than the versions Tower was tested with; probably fine.
    PiUntested,
    GitMissing,
    NoSandbox,
}

/// The Pi versions Tower supports: at least `PI_MIN`, tested up to the
/// `PI_TESTED` minor release.
pub const PI_MIN: (u32, u32, u32) = (1, 4, 0);
pub const PI_TESTED: (u32, u32) = (1, 4);

/// Parses the first `x.y.z` in `pi --version` output.
pub fn parse_version(s: &str) -> Option<(u32, u32, u32)> {
    s.split(|c: char| !(c.is_ascii_digit() || c == '.')).find_map(|w| {
        let mut it = w.split('.').map(|p| p.parse::<u32>().ok());
        Some((it.next()??, it.next()??, it.next().flatten().unwrap_or(0)))
    })
}

#[cfg(test)]
mod version_tests {
    use super::*;

    #[test]
    fn pi_versions_parse_and_compare() {
        assert_eq!(parse_version("1.4.0"), Some((1, 4, 0)));
        assert_eq!(parse_version("pi v1.12.3-beta"), Some((1, 12, 3)));
        assert_eq!(parse_version("2.0"), Some((2, 0, 0)));
        assert_eq!(parse_version("unknown"), None);
        assert!(parse_version("1.3.9").unwrap() < PI_MIN);
        assert!((1, 5) > PI_TESTED);
    }
}
