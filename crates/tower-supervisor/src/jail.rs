//! Sandboxes for the processes of a goal: the agent's own (its shell and
//! file tools, workspace setup) and verification's, which must not share
//! anything the agent can write.

use std::path::{Path, PathBuf};
use std::sync::Arc;
use std::time::Duration;

use crate::paths::real;
use crate::sandbox::Loopback;
use crate::{Inner, Result, sandbox};

/// The sandbox profile and environment for one process of a goal: the
/// directory it works in, the goal's private TMPDIR and package caches, and
/// whether it may use the network.
pub(crate) struct Jail {
    pub profile: Option<PathBuf>,
    pub env: Vec<(String, String)>,
}

/// What a jail may reach: the network, or with it off, the loopback ports
/// the contract declares (or all but what already listens, when the
/// contract opens loopback).
#[derive(Debug, Clone, Default)]
pub(crate) struct Net {
    pub network: bool,
    pub ports: Vec<u16>,
    pub open: bool,
}

impl Net {
    /// `network` for this process (setup on your own code has it whatever
    /// the contract says), loopback as the contract says.
    pub(crate) fn new(contract: &tower_core::Contract, network: bool) -> Net {
        Net { network, ports: contract.declared_ports(), open: contract.loopback_open }
    }
}

fn home_of(inner: &Inner) -> PathBuf {
    real(&inner.env.get("HOME").map(PathBuf::from).unwrap_or_else(|| PathBuf::from("/")))
}

/// The jail of the agent's own processes (its shell and file tools, and the
/// workspace setup): the goal's persistent package caches, which the agent
/// can write. Loopback also reaches whatever the agent's own processes
/// listen on now (a dev server it started in an earlier command).
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
    let mut net = Net::new(&goal.contract, network);
    net.ports.extend(own_ports(inner, &goal.id));
    // Your own tests need loopback (found on your unchanged code, or the
    // project's setting): the agent runs the same tests.
    net.open |= loopback_opened_for(inner, goal);
    let dirs = Dirs { work: dir, tmp, cache: &cache };
    jail(inner, &goal_dir, &dirs, purpose, &net, &TowerFiles::default())
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

/// Tower's own files inside a sandboxed command's world.
#[derive(Debug, Default, Clone)]
pub(crate) struct TowerFiles {
    /// Readable, never writable.
    pub read: Vec<PathBuf>,
    /// Append-only: data may be added, nothing removed or rewritten.
    pub append: Vec<PathBuf>,
}

/// Whether loopback is open for a goal beyond its contract: the project's
/// setting, or a criterion that needed it on your own, unchanged code.
pub(crate) fn loopback_opened_for(inner: &Inner, goal: &tower_store::GoalRecord) -> bool {
    inner.store(|s| s.project(&goal.project_id)).is_ok_and(|p| p.loopback_open)
        || inner.store(|s| s.loopback_opened(&goal.id)).is_ok_and(|o| !o.is_empty())
}

/// Ports the goal's agent processes listen on now.
pub(crate) fn own_ports(inner: &Inner, goal: &str) -> Vec<u16> {
    let paths = &inner.paths;
    let probes = [paths.workspace(goal), paths.tmp(goal)];
    let id = crate::procs::Identity::new(&probes, &crate::procs::marker(&paths.root));
    let mut ports: Vec<u16> =
        sandbox::listeners().into_iter().filter(|l| l.pid.is_some_and(|p| id.holds(p))).map(|l| l.port).collect();
    ports.sort_unstable();
    ports.dedup();
    ports
}

/// Keeps the agent's profile in step with the servers its own processes
/// start, and with loopback opened for the goal meanwhile: a profile is
/// fixed when a command starts, so the next command can reach a server an
/// earlier one left listening. Stops with the run.
pub(crate) async fn follow_agent_listeners(inner: Arc<Inner>, goal: String, run_no: u32) {
    // What the profile was written from: the agent's own listeners, and
    // whether loopback is open for the goal (preflight may open it).
    let state = |inner: Arc<Inner>, goal: String| async move {
        tokio::task::spawn_blocking(move || {
            let open = inner.store(|s| s.goal(&goal)).is_ok_and(|g| loopback_opened_for(&inner, &g));
            (own_ports(&inner, &goal), open)
        })
        .await
        .unwrap_or_default()
    };
    let mut known = state(inner.clone(), goal.clone()).await;
    let mut tick = tokio::time::interval(Duration::from_secs(2));
    loop {
        tick.tick().await;
        if inner.run_of(&goal).is_none_or(|r| r.run_no != run_no) {
            break;
        }
        let now = state(inner.clone(), goal.clone()).await;
        if now == known {
            continue;
        }
        known = now;
        let Ok(rec) = inner.store(|s| s.goal(&goal)) else { break };
        let Some(ws) = rec.workspace.clone() else { break };
        let tmp = inner.paths.tmp(&goal);
        if let Err(e) = agent_jail(&inner, &rec, Path::new(&ws), &tmp, "agent", rec.contract.network) {
            tracing::warn!(goal = %goal, error = %e, "could not refresh the agent's loopback ports");
        }
    }
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
    net: &Net,
    tower_files: &TowerFiles,
) -> Result<Jail> {
    let cache = crate::caches::prepare(dirs.cache, &home_of(inner), dirs.work)?;
    jail(inner, profile_dir, &Dirs { cache: &cache, ..*dirs }, purpose, net, tower_files)
}

fn jail(
    inner: &Inner,
    profile_dir: &Path,
    dirs: &Dirs,
    purpose: &str,
    net: &Net,
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
    // Version managers resolve as in your terminal (see sandbox::toolchains).
    env.extend(sandbox::toolchain_env(&home, &cache));
    let pairs = inner.env.pairs();
    // Apple's /usr/bin developer tools (git, clang, make, python3) are shims
    // that go through xcrun, which insists on a cache in the shared per-user
    // temporary folder the sandbox closes. The real tools of the developer
    // directory your terminal uses come just before /usr/bin on PATH (so
    // Homebrew's, earlier on PATH, still win).
    if let Some(dev) = sandbox::developer_dir(&pairs) {
        let mut path =
            sandbox::path_with_developer_tools(inner.env.get("PATH").unwrap_or("/usr/bin:/bin"), &dev.join("usr/bin"));
        // With a full Xcode, cc and ld are in its toolchain, not beside git.
        if let Some(tc) = sandbox::toolchain_bin(&dev) {
            path = sandbox::path_with_developer_tools(&path, &tc);
        }
        env.push(("PATH".into(), path));
        if let Some(sdk) = sandbox::sdk_root(&dev) {
            env.push(("SDKROOT".into(), sdk));
        }
    }
    let profile = if sandbox::available() {
        let path = goal_dir.join(format!("{purpose}.sb"));
        let proxies = sandbox::proxy_ports(&pairs);
        let loopback = if net.open {
            // Whatever listens now, but never what the contract declares.
            let mut closed = sandbox::listening_ports();
            closed.retain(|p| !net.ports.contains(p));
            Loopback::AllBut(closed)
        } else {
            Loopback::Only(net.ports.clone())
        };
        let spec = sandbox::Spec {
            workspace: real(dir),
            tmp: real(tmp),
            cache,
            read: {
                let mut read = sandbox::toolchain_reads(&pairs, &home);
                read.extend(tower_files.read.iter().map(|p| real(p)));
                read
            },
            append: tower_files.append.iter().map(|p| real(p)).collect(),
            home,
            network: net.network,
            loopback,
            proxy_ports: proxies,
        };
        // Replaced whole: a command starting meanwhile reads the old or the
        // new profile, never half of one.
        let part = goal_dir.join(format!(".{purpose}.sb.{}", uuid::Uuid::new_v4().simple()));
        std::fs::write(&part, sandbox::profile(&spec))?;
        std::fs::rename(&part, &path)?;
        Some(path)
    } else {
        None
    };
    Ok(Jail { profile, env })
}
