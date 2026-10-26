//! Tower domain model.
//!
//! Everything in this crate is pure: no I/O, no clocks, no processes. The
//! supervisor feeds facts in and persists what comes out, which keeps the rules
//! that matter most (the lifecycle state machine, the honesty grammar and the
//! contract fences) unit-testable in isolation.
//!
//! Design references: `docs/02-domain-model.md`, `docs/03-goal-lifecycle.md`,
//! `docs/07-verification-and-honesty.md`.

pub mod briefing;
pub mod contract;
pub mod event;
pub mod honesty;
pub mod lifecycle;
pub mod mode;
pub mod review;
pub mod sentinel;
pub mod view;

pub use contract::{Autonomy, Budget, Contract, ContractIssue, Criterion, CriterionKind, Scope};
pub use event::{EventKind, Source};
pub use honesty::{ClaimKind, Consistency, Provenance};
pub use lifecycle::{LifecycleState, PauseReason, Transition, TransitionError};
pub use mode::Mode;

/// Milliseconds since the Unix epoch. Every timestamp crossing a boundary uses this.
pub type Millis = i64;
