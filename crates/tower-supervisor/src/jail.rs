//! Sandboxes for the processes of a goal: the agent's own (its shell and
//! file tools, workspace setup) and verification's, which must not share
//! anything the agent can write.

use std::path::{Path, PathBuf};

use crate::paths::real;
use crate::{Inner, Result, sandbox};

/// The sandbox profile and environment for one process of a goal: the
/// directory it works in, the goal's private TMPDIR and package caches, and
/// whether it may use the network.
pub(crate) struct Jail {
    pub profile: Option<PathBuf>,
    pub env: Vec<(String, String)>,
}

fn home_of(inner: &Inner) -> PathBuf {
    real(&inner.env.get("HOME").map(PathBuf::from).unwrap_or_else(|| PathBuf::from("/")))
}

/// The jail of the agent's own processes (its shell and file tools, and the
/// workspace setup): the goal's persistent package caches, which the agent
/// can write.
pub(crate) fn agent_jail(
    inner: &Inner,
    goal: &tower_store::GoalRecord,
    dir: &Path,
    tmp: &Path,
    purpose: &str,
    network: bool,
) -> Result<Jail> {
    let goal_dir = inner.paths.goal_dir(&goal.id);
    std::fs::create_dir_all(&goal_dir)?;
    let cache = crate::caches::prepare(&goal_dir.join("cache"), &home_of(inner), dir)?;
    jail(inner, &goal_dir, dir, tmp, cache, purpose, network)
}

/// The jail of verification: nothing the agent could write may influence a
/// verdict, so it gets `cache`, a directory the caller created empty and
/// discards afterwards, seeded from the user's own caches (copy-on-write).
/// `profile_dir` holds the generated profile (the goal's directory, or the
/// project check's).
pub(crate) fn verifier_jail(
    inner: &Inner,
    profile_dir: &Path,
    dir: &Path,
    tmp: &Path,
    cache: &Path,
    purpose: &str,
    network: bool,
) -> Result<Jail> {
    let cache = crate::caches::prepare(cache, &home_of(inner), dir)?;
    jail(inner, profile_dir, dir, tmp, cache, purpose, network)
}

fn jail(
    inner: &Inner,
    profile_dir: &Path,
    dir: &Path,
    tmp: &Path,
    cache: PathBuf,
    purpose: &str,
    network: bool,
) -> Result<Jail> {
    let home = home_of(inner);
    let goal_dir = profile_dir;
    std::fs::create_dir_all(goal_dir)?;
    std::fs::create_dir_all(tmp)?;
    let mut env = crate::caches::env(&cache);
    env.push(("TMPDIR".into(), real(tmp).display().to_string()));
    // pnpm keeps its store locks here (default /tmp, not writable in the sandbox).
    env.push(("XDG_RUNTIME_DIR".into(), real(tmp).display().to_string()));
    let profile = if sandbox::available() {
        let path = goal_dir.join(format!("{purpose}.sb"));
        let spec = sandbox::Spec {
            workspace: real(dir),
            tmp: real(tmp),
            cache,
            read: sandbox::path_toolchains(inner.env.get("PATH").unwrap_or(""), &home),
            home,
            network,
            proxy_ports: sandbox::proxy_ports(&inner.env.pairs()),
        };
        std::fs::write(&path, sandbox::profile(&spec))?;
        Some(path)
    } else {
        None
    };
    Ok(Jail { profile, env })
}
