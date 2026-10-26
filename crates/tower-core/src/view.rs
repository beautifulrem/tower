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
    /// Held-out tests: git-ignored files (globs, relative to the root) that
    /// are copied into verification only. The agent never sees them, so it
    /// cannot write to them; criteria can run them.
    pub holdout_files: Vec<String>,
    /// Project memory: notes injected into every goal of this project.
    pub memory: String,
    /// Run once in each new workspace (e.g. `pnpm install`), sandboxed, so
    /// the agent starts with dependencies in place. Empty means none.
    pub setup_command: String,
    pub created_at: Millis,
    /// The test command run on a clean copy of the base branch, so the
    /// first goal does not discover a broken test setup.
    pub test_check: Option<TestCheck>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct TestCheck {
    pub command: String,
    /// `None` while it runs.
    pub passed: Option<bool>,
    /// Setup or the command could not run at all (not a test failure).
    pub env_error: bool,
    pub base: String,
    pub duration_ms: i64,
    pub output_tail: String,
    pub at: Millis,
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
    /// Other unfinished goals of the same project that change some of the
    /// same files: they will likely conflict when both are merged.
    pub overlaps: Vec<Overlap>,
    /// The pull request opened from Tower, once there is one.
    pub pr: Option<PrView>,
    /// The goal's engine (`pi` or `claude-code`); empty means the default.
    pub engine: String,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct LookView {
    pub base: Option<String>,
    pub pin: Option<String>,
    pub base_error: Option<String>,
    pub pin_error: Option<String>,
}

/// A pull request as GitHub reports it.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct PrStatus {
    /// `open`, `merged` or `closed`.
    pub state: String,
    pub passed: u32,
    pub failed: u32,
    pub pending: u32,
    /// Names of failing checks (at most a few).
    pub failing: Vec<String>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct PrView {
    pub url: String,
    pub status: PrStatus,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct Overlap {
    pub goal_id: String,
    pub title: String,
    /// The files both goals change (at most a handful).
    pub files: Vec<String>,
    pub total: u32,
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
    /// Run with the held-out tests present: the output was shown to you
    /// only, never to the agent.
    pub held_out: bool,
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
    /// Why the criterion could not be checked on the base, if so.
    pub base_error: Option<String>,
    /// For `look` criteria: the screenshots before (base) and after (the
    /// current snapshot), or why one is missing.
    pub look: Option<LookView>,
    /// On the current snapshot, whether it also passes with only the
    /// agent's source changes kept — its tests, configuration, scripts and
    /// package settings put back as on the base (`None` when it changed
    /// nothing outside the source).
    pub passes_with_source_only: Option<bool>,
    /// On the current snapshot, what the must-fail canary showed about the
    /// assertions (`None` when it was not this criterion's to check).
    pub canary: Option<CanaryState>,
    pub observed: Option<ObservationView>,
    pub human_checked: bool,
}

/// What the must-fail canary showed for one criterion.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "snake_case")]
#[ts(export)]
pub enum CanaryState {
    /// No canary could run with this criterion (another language, a command
    /// that selects tests by name): the assertions were not checked.
    NotChecked,
    /// The canaries ran and failed, as they must.
    Intact,
    /// A canary assertion did not throw, or the run passed with failing
    /// canaries in it.
    Tampered,
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
    /// The workspace snapshot when the run began; rolling back needs it.
    pub start_pin: Option<String>,
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
    /// The branch acceptance writes (or updates) in the user's repository.
    pub branch_preview: String,
    /// The latest rollback can be undone (nothing ran since).
    pub can_undo_rollback: bool,
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
    /// The pull request's CI failed after the goal was accepted and pushed.
    CiFailed,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct InboxItem {
    pub id: String,
    pub goal_id: String,
    pub goal_title: String,
    pub kind: InboxKind,
    /// The full title in the current interface language, e.g. "Paused: …".
    pub title: String,
    /// Only the variable part (the question, the pause reason, the stall),
    /// for layouts that show the kind separately.
    pub subject: String,
    pub body: String,
    /// Fixed choices. Empty means free text only.
    pub options: Vec<String>,
    pub allow_text: bool,
    pub created_at: Millis,
    /// Lower is more urgent: blocking questions and approvals first.
    pub urgency: u8,
    /// One per option, in the same order: how to present it.
    pub tones: Vec<OptionTone>,
    /// Set while the item is put aside ("remind me later"), until when.
    pub snoozed_until: Option<Millis>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "snake_case")]
#[ts(export)]
pub enum OptionTone {
    /// The way forward (approve, allow, continue, retry).
    Primary,
    Neutral,
    /// Ends or overrides something (abandon, override a sentinel): never on
    /// a single keypress.
    Destructive,
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
    /// No system notifications until this time (ms since the epoch). The
    /// inbox and the badge still update.
    #[serde(default)]
    pub quiet_until: Option<Millis>,
    /// Goals whose items never notify.
    #[serde(default)]
    pub muted_goals: Vec<String>,
    /// The default engine for new goals: `pi` or `claude-code`.
    #[serde(default = "default_engine")]
    pub engine: String,
    /// How to start Claude Code's ACP adapter; empty means
    /// `claude-agent-acp` if installed, else the copy Tower installs from its lockfile.
    #[serde(default)]
    pub claude_acp_command: String,
    /// Serve the phone page (Needs-You and pausing) on your network.
    #[serde(default)]
    pub remote_enabled: bool,
    #[serde(default = "default_remote_port")]
    pub remote_port: u16,
    /// The pairing secret every phone request must carry.
    #[serde(default)]
    pub remote_token: String,
    /// Also listen on the local network (unencrypted). Off: only on
    /// Tailscale's address when there is one.
    #[serde(default)]
    pub remote_local_network: bool,
    /// An ntfy topic URL (e.g. on your own ntfy server) that gets a push for
    /// every item that blocks a goal: the goal's and the item's titles,
    /// nothing else. Empty: no pushes.
    #[serde(default)]
    pub push_url: String,
    /// Daily quiet hours in local time: pushes and system notifications
    /// wait (the inbox and the badge still update).
    #[serde(default)]
    pub quiet_hours: Option<QuietHours>,
    /// Also push when a goal is ready to accept (not only when one is
    /// blocked).
    #[serde(default)]
    pub push_ready: bool,
}

/// A daily quiet window, in minutes after local midnight; it may cross
/// midnight (22:00–08:00).
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct QuietHours {
    pub start: u16,
    pub end: u16,
}

impl QuietHours {
    /// Whether `minute` (after local midnight) falls inside the window.
    pub fn contains(self, minute: u16) -> bool {
        match self.start.cmp(&self.end) {
            std::cmp::Ordering::Less => (self.start..self.end).contains(&minute),
            std::cmp::Ordering::Greater => minute >= self.start || minute < self.end,
            std::cmp::Ordering::Equal => false,
        }
    }
}

fn default_remote_port() -> u16 {
    7317
}

/// How to open the phone page.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct RemoteInfo {
    pub enabled: bool,
    /// Links that pair a phone (the token is in the fragment), Tailscale's
    /// address first.
    pub links: Vec<String>,
    /// QR code of the first link, as SVG.
    pub qr_svg: String,
    /// Whether a Tailscale address is among the links (encrypted transport).
    pub tailscale: bool,
    /// One per link: "tailscale" or "lan".
    pub kinds: Vec<String>,
    /// Why the page is not being served although it is turned on
    /// (Tailscale disconnected, the port taken), in the interface language.
    pub problem: Option<String>,
}

/// The outcome of the last push.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct PushStatus {
    pub at: Millis,
    /// Why it failed, if it did.
    pub error: Option<String>,
}

fn default_engine() -> String {
    "pi".into()
}

#[cfg(test)]
mod quiet_tests {
    use super::QuietHours;

    #[test]
    fn quiet_hours_may_cross_midnight() {
        let night = QuietHours { start: 22 * 60, end: 8 * 60 };
        assert!(night.contains(23 * 60) && night.contains(3 * 60) && !night.contains(12 * 60));
        let lunch = QuietHours { start: 12 * 60, end: 13 * 60 };
        assert!(lunch.contains(12 * 60 + 30) && !lunch.contains(13 * 60));
        assert!(!QuietHours { start: 60, end: 60 }.contains(60));
    }
}

/// The engines Tower can drive.
pub const ENGINES: &[&str] = &["pi", "claude-code"];

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
            quiet_until: None,
            muted_goals: Vec::new(),
            engine: default_engine(),
            claude_acp_command: String::new(),
            remote_enabled: false,
            remote_port: default_remote_port(),
            remote_token: String::new(),
            remote_local_network: false,
            push_url: String::new(),
            quiet_hours: None,
            push_ready: false,
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
    /// The oldest Pi version Tower supports, e.g. `1.4.0`.
    pub min_pi_version: String,
    /// Programs the in-app demo needs that are missing (e.g. `node`).
    pub demo_missing: Vec<String>,
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
    /// Claude Code is the chosen engine but `claude` (or Node.js, which the
    /// bridge needs) is not installed.
    ClaudeMissing,
    /// git has no name and email: accepting a goal would commit without
    /// your identity, so Tower asks for it first.
    GitIdentityMissing,
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
