//! Inputs and updates crossing the UI boundary.

use serde::{Deserialize, Serialize};
use tower_core::contract::Contract;
use tower_core::view::{GoalSummary, InboxItem, ProjectView, TraceEntry};
use ts_rs::TS;

#[derive(Debug, Clone, Deserialize, TS)]
#[ts(export)]
pub struct NewGoalInput {
    pub project_id: String,
    pub title: String,
    pub contract: Contract,
    /// Ratify immediately (the contract editor's "批准并开始").
    pub ratify: bool,
}

#[derive(Debug, Clone, Deserialize, TS)]
#[ts(export)]
pub struct ReviewComment {
    pub path: String,
    pub line: Option<u32>,
    pub text: String,
}

/// Where to open a goal's workspace.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Deserialize, TS)]
#[serde(rename_all = "snake_case")]
#[ts(export)]
pub enum OpenTarget {
    Editor,
    Terminal,
    Finder,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, TS)]
#[serde(rename_all = "snake_case")]
#[ts(export)]
pub enum ToastLevel {
    Info,
    Success,
    Warning,
    Error,
}

/// Pushed to the renderer. Attention-critical updates (inbox, state changes)
/// are sent immediately; summaries are coalesced (`docs/13` §13.3).
#[derive(Debug, Clone, Serialize, TS)]
#[serde(rename_all = "snake_case", tag = "type")]
#[ts(export)]
pub enum UiUpdate {
    Goal {
        goal: GoalSummary,
    },
    Inbox {
        items: Vec<InboxItem>,
    },
    Trace {
        entry: TraceEntry,
    },
    /// Assistant text being streamed, for Watch mode. Not persisted.
    Stream {
        goal_id: String,
        text: String,
    },
    Projects {
        projects: Vec<ProjectView>,
    },
    Toast {
        level: ToastLevel,
        text: String,
    },
}

pub trait UiSink: Send + Sync + 'static {
    fn emit(&self, update: UiUpdate);
}

/// A sink that drops everything (tests, headless use).
#[derive(Debug, Default)]
pub struct NullSink;

impl UiSink for NullSink {
    fn emit(&self, _update: UiUpdate) {}
}
