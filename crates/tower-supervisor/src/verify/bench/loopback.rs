//! Loopback opened on evidence from your own code.
//!
//! With the network off, loopback is closed by default. A test suite whose
//! servers listen on ports picked at run time (port 0, a build daemon) is
//! refused by that rule on the base commit — your unchanged code, before
//! the agent did anything. When that refusal is the only reason a criterion
//! cannot run there, the need comes from your tests, not from the agent:
//! Tower opens loopback for that criterion's runs in this goal (everything
//! on this Mac except what already listens when a command starts), records
//! the decision in the trace and on the criterion, and sets the project's
//! standing choice (Settings) so the next goal starts with it. A refusal
//! that first appears on the agent's snapshot is never opened this way: it
//! still pauses the goal.

use std::path::{Path, PathBuf};
use std::sync::{Mutex, PoisonError};
use std::time::Duration;

use tower_core::EventKind;

use super::{Bench, Ran};
use crate::{Inner, Result};

/// The loopback-open twins of a verification's closed profiles, and the
/// commands whose runs use them.
pub(super) struct OpenLoopback {
    criteria: Option<PathBuf>,
    held_out: Option<PathBuf>,
    opened: Mutex<Vec<String>>,
}

impl OpenLoopback {
    /// `criteria` and `held_out`: the twins (`None` when the contract has
    /// the network or open loopback already, or there is no sandbox).
    /// Seeded with what this goal already opened, and with every criterion
    /// when the project's setting says so (recorded once per goal).
    pub(super) fn new(
        inner: &Inner,
        goal: &str,
        rec: &tower_store::GoalRecord,
        criteria: Option<PathBuf>,
        held_out: Option<PathBuf>,
    ) -> Result<OpenLoopback> {
        let commands: Vec<(String, String)> = rec
            .contract
            .machine_criteria()
            .filter_map(|c| match &c.kind {
                tower_core::CriterionKind::Exec { command, .. } => Some((c.id.clone(), command.clone())),
                _ => None,
            })
            .collect();
        let known = inner.store(|s| s.loopback_opened(goal))?;
        let mut opened: Vec<String> = known
            .iter()
            .filter(|(id, cmd, _)| commands.contains(&(id.clone(), cmd.clone())))
            .map(|k| k.1.clone())
            .collect();
        let project = inner.store(|s| s.project(&rec.project_id))?;
        if project.loopback_open && criteria.is_some() {
            for (id, command) in &commands {
                if !opened.contains(command) {
                    let why = "project".to_string();
                    let event = EventKind::LoopbackOpened { criterion: id.clone(), command: command.clone(), why };
                    inner.append(goal, event)?;
                    opened.push(command.clone());
                }
            }
        }
        Ok(OpenLoopback { criteria, held_out, opened: Mutex::new(opened) })
    }

    fn is_open(&self, command: &str) -> bool {
        self.opened.lock().unwrap_or_else(PoisonError::into_inner).iter().any(|c| c == command)
    }
}

impl Bench<'_> {
    /// The profile `command` runs under: the loopback-open twin of
    /// `profile` when loopback was opened for it.
    pub(super) fn profile_for<'p>(&'p self, command: &str, profile: Option<&'p Path>) -> Option<&'p Path> {
        let lo = &self.loopback;
        if profile.is_none() || !lo.is_open(command) {
            return profile;
        }
        if profile == self.criteria.as_deref() {
            lo.criteria.as_deref().or(profile)
        } else if profile == self.held_out_profile.as_deref() {
            lo.held_out.as_deref().or(profile)
        } else {
            profile
        }
    }

    /// On the base commit only: a criterion that could not run because
    /// loopback was refused runs again with loopback open. If that removes
    /// the refusal, loopback stays open for it (see the module comment)
    /// and the new run is its base result.
    pub(super) async fn open_on_base(&self, id: &str, command: &str, r: Ran, timeout: Duration) -> Result<Ran> {
        let refused = r.environment_failure && !r.denied && crate::sandbox::loopback_refusal(&r.output_tail).is_some();
        if !refused || self.loopback.criteria.is_none() || self.loopback.is_open(command) {
            return Ok(r);
        }
        self.loopback.opened.lock().unwrap_or_else(PoisonError::into_inner).push(command.to_string());
        let again = self.exec_in(command, self.criteria.as_deref(), timeout, Some(super::Phase::Base)).await;
        if again.environment_failure && crate::sandbox::loopback_refusal(&again.output_tail).is_some() {
            // Still refused (a port someone else held at the start): not a
            // need opening loopback meets.
            self.loopback.opened.lock().unwrap_or_else(PoisonError::into_inner).retain(|c| c != command);
            return Ok(r);
        }
        let (inner, goal) = (self.inner, self.goal);
        let why = "base".to_string();
        inner.append(goal, EventKind::LoopbackOpened { criterion: id.into(), command: command.into(), why })?;
        // The project's standing choice, yours to turn off in Settings.
        let project = self.rec.project_id.clone();
        inner.store(|s| s.set_project_loopback_open(&project, true))?;
        inner.emit_projects();
        Ok(again)
    }
}
