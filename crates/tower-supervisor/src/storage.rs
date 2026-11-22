//! Disk usage inventory and safe workspace reclamation (`docs/18` §18.4 P1.3).
//!
//! Computes per-project and per-goal disk usage across satellite clones,
//! private caches, tmp dirs, verification checkouts, and metadata on a
//! blocking thread pool so the async runtime never stalls.
//!
//! Reclamation is strictly guarded: it REFUSES to delete workspaces of active,
//! unmerged, Needs-You, or dirty goals unless the goal is explicitly
//! [`LifecycleState::Archived`] or [`LifecycleState::Abandoned`].

use std::collections::{BTreeMap, BTreeSet};
use std::io;
use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};
use thiserror::Error;
use tower_core::LifecycleState;

use crate::paths::Paths;

/// Goal metadata supplied to [`inventory`] and [`reclaim_goal`] to enforce
/// safety invariants without coupling directly to SQLite.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct GoalStorageMeta {
    pub goal_id: String,
    pub project_id: String,
    pub project_name: String,
    pub title: String,
    pub state: LifecycleState,
    /// Number of open Needs-You inbox items for this goal.
    pub open_inbox_count: u32,
    /// True when the goal's branch has not yet been merged/integrated.
    pub unmerged: bool,
    /// Optional precomputed dirty flag (`None` checks `git status --porcelain`).
    pub dirty: Option<bool>,
}

/// Specific reason why safe reclamation refuses to delete a goal's workspace.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ReclaimRefusal {
    ActiveState,
    OpenNeedsYou,
    UnmergedBranch,
    DirtyWorkspace,
    UnknownGoal,
}

impl std::fmt::Display for ReclaimRefusal {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::ActiveState => write!(f, "goal is still active (only archived or abandoned goals can be reclaimed)"),
            Self::OpenNeedsYou => write!(f, "goal has open Needs-You items waiting on human input"),
            Self::UnmergedBranch => write!(f, "goal has unmerged work that has not been integrated or archived"),
            Self::DirtyWorkspace => write!(f, "workspace has uncommitted changes"),
            Self::UnknownGoal => write!(f, "goal is unknown"),
        }
    }
}

/// Error returned when safe reclamation is refused or fails on I/O.
#[derive(Debug, Error)]
pub enum ReclaimError {
    #[error("refused to reclaim {goal_id}: {reason}")]
    Refused { goal_id: String, reason: ReclaimRefusal },
    #[error("path safety check failed for {path}: outside Tower root")]
    OutsideRoot { path: PathBuf },
    #[error(transparent)]
    Io(#[from] io::Error),
}

/// Per-goal disk usage breakdown and reclamation eligibility.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct GoalDiskUsage {
    pub goal_id: String,
    pub project_id: String,
    pub project_name: String,
    pub title: String,
    pub state: LifecycleState,
    /// Satellite clone (`work/<goal>`).
    pub workspace_bytes: u64,
    /// Private package caches (`goals/<goal>/cache`).
    pub cache_bytes: u64,
    /// Private temp directories (`tmp/<goal>` and `tmp/<goal>-verify`).
    pub tmp_bytes: u64,
    /// Verification checkout (`verify/<goal>`).
    pub verify_bytes: u64,
    /// Retained history/evidence (`sessions/<goal>`, `evidence/<goal>`, `goals/<goal>` excluding cache).
    pub meta_bytes: u64,
    /// Total bytes across all goal directories.
    pub total_bytes: u64,
    /// Bytes reclaimable by safe cleanup (`workspace + cache + tmp + verify`).
    pub reclaimable_bytes: u64,
    /// True only when safe reclamation is permitted right now.
    pub reclaimable: bool,
    /// Why reclamation is refused when `reclaimable` is false.
    pub protect_reason: Option<ReclaimRefusal>,
}

/// Per-project aggregated disk usage.
#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize)]
pub struct ProjectDiskUsage {
    pub project_id: String,
    pub project_name: String,
    pub goal_count: u32,
    pub total_bytes: u64,
    pub reclaimable_bytes: u64,
}

/// Directory remnants under `work/`, `tmp/`, or `verify/` without a matching goal record.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct OrphanDiskEntry {
    pub goal_id: String,
    pub bytes: u64,
    pub paths: Vec<PathBuf>,
}

/// Full disk usage inventory across Tower's data directory.
#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize)]
pub struct StorageSummary {
    pub root: PathBuf,
    pub total_bytes: u64,
    pub reclaimable_bytes: u64,
    pub available_disk_bytes: Option<u64>,
    pub projects: Vec<ProjectDiskUsage>,
    pub goals: Vec<GoalDiskUsage>,
    pub orphan_dirs: Vec<OrphanDiskEntry>,
}

/// Result of reclaiming one goal's scratch/workspace directories.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct ReclaimResult {
    pub goal_id: String,
    pub freed_bytes: u64,
    pub removed_paths: Vec<PathBuf>,
}

/// Enforces Tower's strict reclamation safety gate:
/// only explicitly [`LifecycleState::Archived`] or [`LifecycleState::Abandoned`]
/// goals may have their workspaces reclaimed. Active, Needs-You, unmerged, and
/// dirty non-terminal goals are always refused with a specific [`ReclaimRefusal`].
pub fn check_reclaim_safety(meta: &GoalStorageMeta, workspace: &Path) -> Result<(), ReclaimRefusal> {
    if matches!(meta.state, LifecycleState::Archived | LifecycleState::Abandoned) {
        return Ok(());
    }
    if meta.open_inbox_count > 0 {
        return Err(ReclaimRefusal::OpenNeedsYou);
    }
    if meta.unmerged && meta.state == LifecycleState::Accepted {
        return Err(ReclaimRefusal::UnmergedBranch);
    }
    let dirty = meta.dirty.unwrap_or_else(|| is_workspace_dirty(workspace));
    if dirty {
        return Err(ReclaimRefusal::DirtyWorkspace);
    }
    if meta.unmerged {
        return Err(ReclaimRefusal::UnmergedBranch);
    }
    Err(ReclaimRefusal::ActiveState)
}

/// Checks whether a git workspace has uncommitted or untracked changes.
/// Returns `false` if `workspace` does not exist or is not a git repo.
pub fn is_workspace_dirty(workspace: &Path) -> bool {
    if !workspace.join(".git").exists() {
        return false;
    }
    let Ok(out) = std::process::Command::new("git").args(["status", "--porcelain"]).current_dir(workspace).output()
    else {
        // Fail safe: if git cannot confirm cleanliness, treat as dirty.
        return true;
    };
    if !out.status.success() {
        return true;
    }
    !String::from_utf8_lossy(&out.stdout).trim().is_empty()
}

/// Computes the full storage inventory off the async runtime (`spawn_blocking`).
pub async fn inventory(paths: Paths, metas: Vec<GoalStorageMeta>) -> io::Result<StorageSummary> {
    tokio::task::spawn_blocking(move || inventory_sync(&paths, &metas))
        .await
        .map_err(|e| io::Error::other(e.to_string()))?
}

/// Synchronous storage inventory implementation.
pub fn inventory_sync(paths: &Paths, metas: &[GoalStorageMeta]) -> io::Result<StorageSummary> {
    let known: BTreeSet<&str> = metas.iter().map(|m| m.goal_id.as_str()).collect();
    let mut goals = Vec::with_capacity(metas.len());
    let mut project_map: BTreeMap<String, ProjectDiskUsage> = BTreeMap::new();
    let mut total_bytes = 0u64;
    let mut reclaimable_bytes = 0u64;

    for meta in metas {
        let ws = paths.workspace(&meta.goal_id);
        let cache = paths.goal_dir(&meta.goal_id).join("cache");
        let tmp_main = paths.tmp(&meta.goal_id);
        let tmp_verify = paths.tmp(&format!("{}-verify", meta.goal_id));
        let verify = paths.verify(&meta.goal_id);
        let goal_dir = paths.goal_dir(&meta.goal_id);
        let sessions = paths.sessions(&meta.goal_id);
        let evidence = paths.root.join("evidence").join(&meta.goal_id);

        let workspace_bytes = dir_size(&ws);
        let cache_bytes = dir_size(&cache);
        let tmp_bytes = dir_size(&tmp_main).saturating_add(dir_size(&tmp_verify));
        let verify_bytes = dir_size(&verify);
        let goal_dir_total = dir_size(&goal_dir);
        let meta_bytes = goal_dir_total
            .saturating_sub(cache_bytes)
            .saturating_add(dir_size(&sessions))
            .saturating_add(dir_size(&evidence));

        let goal_total = workspace_bytes
            .saturating_add(cache_bytes)
            .saturating_add(tmp_bytes)
            .saturating_add(verify_bytes)
            .saturating_add(meta_bytes);
        let safety = check_reclaim_safety(meta, &ws);
        let reclaimable = safety.is_ok();
        let goal_reclaimable = if reclaimable {
            workspace_bytes.saturating_add(cache_bytes).saturating_add(tmp_bytes).saturating_add(verify_bytes)
        } else {
            0
        };

        total_bytes = total_bytes.saturating_add(goal_total);
        reclaimable_bytes = reclaimable_bytes.saturating_add(goal_reclaimable);

        let entry = project_map.entry(meta.project_id.clone()).or_insert_with(|| ProjectDiskUsage {
            project_id: meta.project_id.clone(),
            project_name: meta.project_name.clone(),
            goal_count: 0,
            total_bytes: 0,
            reclaimable_bytes: 0,
        });
        entry.goal_count += 1;
        entry.total_bytes = entry.total_bytes.saturating_add(goal_total);
        entry.reclaimable_bytes = entry.reclaimable_bytes.saturating_add(goal_reclaimable);

        goals.push(GoalDiskUsage {
            goal_id: meta.goal_id.clone(),
            project_id: meta.project_id.clone(),
            project_name: meta.project_name.clone(),
            title: meta.title.clone(),
            state: meta.state,
            workspace_bytes,
            cache_bytes,
            tmp_bytes,
            verify_bytes,
            meta_bytes,
            total_bytes: goal_total,
            reclaimable_bytes: goal_reclaimable,
            reclaimable,
            protect_reason: safety.err(),
        });
    }

    goals.sort_by(|a, b| b.total_bytes.cmp(&a.total_bytes).then_with(|| a.goal_id.cmp(&b.goal_id)));
    let mut projects: Vec<ProjectDiskUsage> = project_map.into_values().collect();
    projects.sort_by(|a, b| b.total_bytes.cmp(&a.total_bytes).then_with(|| a.project_id.cmp(&b.project_id)));

    let orphan_dirs = find_orphans(paths, &known);
    for o in &orphan_dirs {
        total_bytes = total_bytes.saturating_add(o.bytes);
    }

    Ok(StorageSummary {
        root: paths.root.clone(),
        total_bytes,
        reclaimable_bytes,
        available_disk_bytes: free_disk_bytes(&paths.root),
        projects,
        goals,
        orphan_dirs,
    })
}

/// Safely reclaims workspace, cache, tmp, and verify directories for a single
/// archived or abandoned goal without blocking the async runtime.
pub async fn reclaim_goal(paths: Paths, meta: GoalStorageMeta) -> Result<ReclaimResult, ReclaimError> {
    tokio::task::spawn_blocking(move || reclaim_goal_sync(&paths, &meta))
        .await
        .map_err(|e| ReclaimError::Io(io::Error::other(e.to_string())))?
}

/// Synchronous safe reclamation for one goal.
pub fn reclaim_goal_sync(paths: &Paths, meta: &GoalStorageMeta) -> Result<ReclaimResult, ReclaimError> {
    let ws = paths.workspace(&meta.goal_id);
    if let Err(reason) = check_reclaim_safety(meta, &ws) {
        return Err(ReclaimError::Refused { goal_id: meta.goal_id.clone(), reason });
    }
    let root_real = crate::paths::real(&paths.root);
    let targets = [
        ws,
        paths.goal_dir(&meta.goal_id).join("cache"),
        paths.tmp(&meta.goal_id),
        paths.tmp(&format!("{}-verify", meta.goal_id)),
        paths.verify(&meta.goal_id),
    ];
    let mut freed_bytes = 0u64;
    let mut removed_paths = Vec::new();
    for dir in targets {
        if !dir.exists() {
            continue;
        }
        let real_dir = crate::paths::real(&dir);
        if !real_dir.starts_with(&root_real) || real_dir == root_real {
            return Err(ReclaimError::OutsideRoot { path: dir });
        }
        let size = dir_size(&dir);
        remove_with_retry(&dir)?;
        freed_bytes = freed_bytes.saturating_add(size);
        removed_paths.push(dir);
    }
    // Release any dynamic port block held by this reclaimed goal.
    let _ = crate::ports_pool::release_for_root(&paths.root, &meta.goal_id);
    Ok(ReclaimResult { goal_id: meta.goal_id.clone(), freed_bytes, removed_paths })
}

/// Safely reclaims each goal in `metas`, preserving all protected goals and
/// returning per-goal results (never aborts remaining eligible goals on refusal).
pub async fn reclaim_goals(
    paths: Paths,
    metas: Vec<GoalStorageMeta>,
) -> Vec<Result<ReclaimResult, (String, ReclaimError)>> {
    tokio::task::spawn_blocking(move || {
        metas
            .into_iter()
            .map(|m| {
                let id = m.goal_id.clone();
                reclaim_goal_sync(&paths, &m).map_err(|e| (id, e))
            })
            .collect()
    })
    .await
    .unwrap_or_default()
}

/// Builds [`GoalStorageMeta`] entries directly from the supervisor's store
/// (for wiring into `Supervisor` / Tauri storage inventory commands).
#[allow(dead_code)]
pub(crate) fn collect_goal_metas(inner: &crate::Inner) -> crate::Result<Vec<GoalStorageMeta>> {
    let summaries = inner.store(|s| s.summaries())?;
    Ok(summaries
        .into_iter()
        .map(|g| GoalStorageMeta {
            goal_id: g.id,
            project_id: g.project_id,
            project_name: g.project_name,
            title: g.title,
            state: g.state,
            open_inbox_count: g.needs_you,
            unmerged: g.state.is_unmerged_work(),
            dirty: None,
        })
        .collect())
}

fn find_orphans(paths: &Paths, known: &BTreeSet<&str>) -> Vec<OrphanDiskEntry> {
    let mut by_id: BTreeMap<String, Vec<PathBuf>> = BTreeMap::new();
    for bucket in ["work", "tmp", "verify"] {
        let dir = paths.root.join(bucket);
        let Ok(entries) = std::fs::read_dir(&dir) else { continue };
        for entry in entries.flatten() {
            let path = entry.path();
            let name = entry.file_name().to_string_lossy().to_string();
            let goal_id = name.strip_suffix("-verify").unwrap_or(&name);
            if !known.contains(goal_id) {
                by_id.entry(goal_id.to_string()).or_default().push(path);
            }
        }
    }
    by_id
        .into_iter()
        .map(|(goal_id, paths)| {
            let bytes = paths.iter().map(|p| dir_size(p)).fold(0u64, u64::saturating_add);
            OrphanDiskEntry { goal_id, bytes, paths }
        })
        .collect()
}

/// Computes total file bytes under `path` without following symlinks.
fn dir_size(path: &Path) -> u64 {
    let Ok(meta) = std::fs::symlink_metadata(path) else {
        return 0;
    };
    if meta.file_type().is_symlink() {
        return 0;
    }
    if meta.is_file() {
        return meta.len();
    }
    if !meta.is_dir() {
        return 0;
    }
    let mut total = 0u64;
    let mut stack = vec![path.to_path_buf()];
    while let Some(dir) = stack.pop() {
        let Ok(entries) = std::fs::read_dir(&dir) else { continue };
        for entry in entries.flatten() {
            let p = entry.path();
            let Ok(m) = std::fs::symlink_metadata(&p) else { continue };
            if m.file_type().is_symlink() {
                continue;
            }
            if m.is_dir() {
                stack.push(p);
            } else if m.is_file() {
                total = total.saturating_add(m.len());
            }
        }
    }
    total
}

fn remove_with_retry(dir: &Path) -> io::Result<()> {
    let mut last = Ok(());
    for _ in 0..3 {
        last = if dir.exists() { std::fs::remove_dir_all(dir) } else { Ok(()) };
        if last.is_ok() {
            return Ok(());
        }
        std::thread::sleep(std::time::Duration::from_millis(50));
    }
    last
}

fn free_disk_bytes(path: &Path) -> Option<u64> {
    let check = if path.exists() { path } else { path.parent().unwrap_or(Path::new("/")) };
    let out = std::process::Command::new("/bin/df").args(["-Pk"]).arg(check).output().ok()?;
    let text = String::from_utf8_lossy(&out.stdout);
    let kb: u64 = text.lines().nth(1)?.split_whitespace().nth(3)?.parse().ok()?;
    Some(kb.saturating_mul(1024))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn meta(id: &str, state: LifecycleState) -> GoalStorageMeta {
        GoalStorageMeta {
            goal_id: id.into(),
            project_id: "p1".into(),
            project_name: "demo".into(),
            title: format!("goal {id}"),
            state,
            open_inbox_count: 0,
            unmerged: state.is_unmerged_work(),
            dirty: Some(false),
        }
    }

    fn seed_goal_files(paths: &Paths, id: &str) {
        std::fs::create_dir_all(paths.workspace(id)).unwrap();
        std::fs::write(paths.workspace(id).join("src.rs"), vec![b'a'; 1000]).unwrap();
        std::fs::create_dir_all(paths.goal_dir(id).join("cache")).unwrap();
        std::fs::write(paths.goal_dir(id).join("cache/pkg.tgz"), vec![b'b'; 2000]).unwrap();
        std::fs::write(paths.goal_dir(id).join("contract.json"), vec![b'c'; 300]).unwrap();
        std::fs::create_dir_all(paths.tmp(id)).unwrap();
        std::fs::write(paths.tmp(id).join("scratch"), vec![b'd'; 400]).unwrap();
        std::fs::create_dir_all(paths.verify(id)).unwrap();
        std::fs::write(paths.verify(id).join("check"), vec![b'e'; 500]).unwrap();
        std::fs::create_dir_all(paths.sessions(id)).unwrap();
        std::fs::write(paths.sessions(id).join("s.jsonl"), vec![b'f'; 250]).unwrap();
    }

    #[tokio::test]
    async fn inventory_computes_per_goal_and_per_project_usage_and_orphans() {
        let tmp = tempfile::tempdir().unwrap();
        let paths = Paths::new(tmp.path().join("tower"));
        paths.ensure().unwrap();
        seed_goal_files(&paths, "g-active");
        seed_goal_files(&paths, "g-archived");
        std::fs::create_dir_all(paths.workspace("g-orphan")).unwrap();
        std::fs::write(paths.workspace("g-orphan").join("x"), vec![b'z'; 777]).unwrap();

        let metas = vec![meta("g-active", LifecycleState::Running), meta("g-archived", LifecycleState::Archived)];
        let summary = inventory(paths.clone(), metas).await.unwrap();
        assert_eq!(summary.projects.len(), 1);
        assert_eq!(summary.projects[0].goal_count, 2);
        assert_eq!(summary.orphan_dirs.len(), 1);
        assert_eq!(summary.orphan_dirs[0].goal_id, "g-orphan");
        assert_eq!(summary.orphan_dirs[0].bytes, 777);

        let active = summary.goals.iter().find(|g| g.goal_id == "g-active").unwrap();
        assert!(!active.reclaimable);
        assert_eq!(active.reclaimable_bytes, 0);
        assert_eq!(active.workspace_bytes, 1000);
        assert_eq!(active.cache_bytes, 2000);
        assert_eq!(active.tmp_bytes, 400);
        assert_eq!(active.verify_bytes, 500);
        assert_eq!(active.meta_bytes, 550);

        let archived = summary.goals.iter().find(|g| g.goal_id == "g-archived").unwrap();
        assert!(archived.reclaimable);
        assert_eq!(archived.reclaimable_bytes, 1000 + 2000 + 400 + 500);
    }

    #[tokio::test]
    async fn reclaim_strictly_refuses_active_unmerged_needs_you_and_dirty_goals() {
        let tmp = tempfile::tempdir().unwrap();
        let paths = Paths::new(tmp.path().join("tower"));
        paths.ensure().unwrap();

        let cases = [
            ("g-running", meta("g-running", LifecycleState::Running), ReclaimRefusal::UnmergedBranch),
            (
                "g-needs-you",
                GoalStorageMeta { open_inbox_count: 1, ..meta("g-needs-you", LifecycleState::Paused) },
                ReclaimRefusal::OpenNeedsYou,
            ),
            (
                "g-unmerged",
                GoalStorageMeta { unmerged: true, ..meta("g-unmerged", LifecycleState::Accepted) },
                ReclaimRefusal::UnmergedBranch,
            ),
            (
                "g-dirty",
                GoalStorageMeta { dirty: Some(true), unmerged: false, ..meta("g-dirty", LifecycleState::Integrated) },
                ReclaimRefusal::DirtyWorkspace,
            ),
            (
                "g-integrated",
                GoalStorageMeta { unmerged: false, ..meta("g-integrated", LifecycleState::Integrated) },
                ReclaimRefusal::ActiveState,
            ),
        ];

        for (id, m, expected) in cases {
            seed_goal_files(&paths, id);
            let err = reclaim_goal(paths.clone(), m).await.unwrap_err();
            match err {
                ReclaimError::Refused { reason, .. } => assert_eq!(reason, expected, "for {id}"),
                other => panic!("unexpected error for {id}: {other}"),
            }
            assert!(paths.workspace(id).exists(), "workspace for {id} must remain intact");
        }

        // Archived and abandoned goals ARE safely reclaimed, preserving sessions & contract.
        for (id, state) in [("g-arch", LifecycleState::Archived), ("g-aban", LifecycleState::Abandoned)] {
            seed_goal_files(&paths, id);
            let res = reclaim_goal(paths.clone(), meta(id, state)).await.unwrap();
            assert_eq!(res.freed_bytes, 1000 + 2000 + 400 + 500);
            assert!(!paths.workspace(id).exists());
            assert!(!paths.goal_dir(id).join("cache").exists());
            assert!(!paths.tmp(id).exists());
            assert!(!paths.verify(id).exists());
            assert!(paths.sessions(id).join("s.jsonl").exists(), "session history must stay");
            assert!(paths.goal_dir(id).join("contract.json").exists(), "contract metadata must stay");
        }
    }
}
