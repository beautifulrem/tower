//! Mode annunciator (`docs/00` R6, `docs/12` §12.6.3).
//!
//! A closed set describing what the engine is doing right now. It is derived
//! from engine events by the harness and is never written by the model.

use serde::{Deserialize, Serialize};
use ts_rs::TS;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize, TS)]
#[serde(rename_all = "snake_case")]
#[ts(export)]
pub enum Mode {
    /// No engine process.
    Idle,
    /// Preparing the workspace and starting the engine.
    Starting,
    /// Model is producing tokens.
    Thinking,
    /// Running a read-only tool.
    Reading,
    /// Running a file-mutating tool.
    Editing,
    /// Running a shell command.
    Executing,
    /// Blocked on a human answer or approval.
    WaitingOnYou,
    /// The provider failed and the engine is retrying.
    Retrying,
    /// The engine is summarising context.
    Compacting,
    /// The verifier is running acceptance criteria.
    Verifying,
    /// The engine finished its run and will not continue on its own.
    Settled,
}

impl Mode {
    /// Maps a Pi tool name to the coarse mode it represents.
    pub fn for_tool(tool: &str) -> Self {
        match tool {
            "read" | "grep" | "find" | "ls" => Self::Reading,
            "edit" | "write" => Self::Editing,
            "bash" => Self::Executing,
            "ask_user" => Self::WaitingOnYou,
            _ => Self::Thinking,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn tools_map_to_modes() {
        assert_eq!(Mode::for_tool("bash"), Mode::Executing);
        assert_eq!(Mode::for_tool("edit"), Mode::Editing);
        assert_eq!(Mode::for_tool("read"), Mode::Reading);
        assert_eq!(Mode::for_tool("log"), Mode::Thinking);
    }
}
