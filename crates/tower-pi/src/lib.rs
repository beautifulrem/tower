//! Pi engine adapter.
//!
//! Tower drives Pi (`@earendil-works/pi-coding-agent`) as a child process in
//! RPC mode, one process per running goal. Tower's goal capabilities live in
//! a standard Pi extension (`extensions/tower-goal`) loaded with `-e`, so the
//! model sees Pi's normal tools plus `ask_user`, `log` and `submit`.

pub mod engine;
pub mod protocol;

pub use engine::{Engine, EngineConfig, EngineError, EngineOutput};
pub use protocol::{PiEvent, Response, UiAnswer, UiRequest, message_text, result_text};
