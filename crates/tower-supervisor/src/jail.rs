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
    let dirs = Dirs { work: dir, tmp, cache: &cache };
    jail(inner, &goal_dir, &dirs, purpose, network, &TowerFiles::default())
}

/// The directories one sandboxed process works in.
#[derive(Debug, Clone, Copy)]
pub(crate) struct Dirs<'a> {
    /// The workspace or verification checkout.
    pub work: &'a Path,
    /// The private TMPDIR.
    pub tmp: &'a Path,
    /// The private package caches.
    pub cache: &'a Path,
}

/// The jail of verification: nothing the agent could write may influence a
/// verdict, so it gets `cache`, a directory the caller created empty and
/// discards afterwards, seeded from the user's own caches (copy-on-write).
/// `profile_dir` holds the generated profile (the goal's directory, or the
/// project check's).
/// `tower_files` names what Tower itself puts in the command's way: the
/// assertion-identity guard, which must be readable before any project
/// code runs, and the transcript it may only add to.
pub(crate) fn verifier_jail(
    inner: &Inner,
    profile_dir: &Path,
    dirs: &Dirs,
    purpose: &str,
    network: bool,
    tower_files: &TowerFiles,
) -> Result<Jail> {
    let cache = crate::caches::prepare(dirs.cache, &home_of(inner), dirs.work)?;
    jail(inner, profile_dir, &Dirs { cache: &cache, ..*dirs }, purpose, network, tower_files)
}

/// Tower's own files inside a sandboxed command's world.
#[derive(Debug, Default, Clone)]
pub(crate) struct TowerFiles {
    /// Readable, never writable.
    pub read: Vec<PathBuf>,
    /// Append-only: data may be added, nothing removed or rewritten.
    pub append: Vec<PathBuf>,
}

fn jail(
    inner: &Inner,
    profile_dir: &Path,
    dirs: &Dirs,
    purpose: &str,
    network: bool,
    tower_files: &TowerFiles,
) -> Result<Jail> {
    let (dir, tmp, cache) = (dirs.work, dirs.tmp, dirs.cache.to_path_buf());
    let home = home_of(inner);
    let goal_dir = profile_dir;
    std::fs::create_dir_all(goal_dir)?;
    std::fs::create_dir_all(tmp)?;
    let mut env = crate::caches::env(&cache);
    env.push(("TMPDIR".into(), real(tmp).display().to_string()));
    // pnpm keeps its store locks here (default /tmp, not writable in the sandbox).
    env.push(("XDG_RUNTIME_DIR".into(), real(tmp).display().to_string()));
    // Apple's /usr/bin developer tools (git, clang, make, python3) are shims
    // that go through xcrun, which insists on a cache in the shared per-user
    // temporary folder the sandbox closes. The real tools come just before /usr/bin on PATH (so Homebrew's, earlier on PATH, still win).
    if let Some(dev) = sandbox::developer_bin() {
        let mut path = sandbox::path_with_developer_tools(inner.env.get("PATH").unwrap_or("/usr/bin:/bin"), &dev);
        // With a full Xcode, cc and ld are in its toolchain, not beside git.
        if let Some(tc) = sandbox::toolchain_bin() {
            path = sandbox::path_with_developer_tools(&path, &tc);
        }
        env.push(("PATH".into(), path));
        if let Some(sdk) = sandbox::sdk_root() {
            env.push(("SDKROOT".into(), sdk));
        }
    }
    let profile = if sandbox::available() {
        let path = goal_dir.join(format!("{purpose}.sb"));
        let spec = sandbox::Spec {
            workspace: real(dir),
            tmp: real(tmp),
            cache,
            read: {
                let mut read = sandbox::path_toolchains(inner.env.get("PATH").unwrap_or(""), &home);
                read.extend(tower_files.read.iter().map(|p| real(p)));
                read
            },
            append: tower_files.append.iter().map(|p| real(p)).collect(),
            home,
            network,
            // Proxies, and whatever already listens on this Mac.
            proxy_ports: {
                let mut p = sandbox::proxy_ports(&inner.env.pairs());
                if !network {
                    p.extend(sandbox::listening_ports());
                    p.sort_unstable();
                    p.dedup();
                }
                p
            },
        };
        std::fs::write(&path, sandbox::profile(&spec))?;
        Some(path)
    } else {
        None
    };
    Ok(Jail { profile, env })
}
