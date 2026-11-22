//! Snapshot timeline diffs and sequential merge-queue conflict prediction
//! (`docs/18` P1.4, P2.3).

use std::path::Path;

use tower_core::view::{DiffFile, SnapshotPoint};

use crate::{Git, GitError, Result};

/// One branch's predicted conflict outcome in a sequential merge queue.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct MergeQueueCheckItem {
    pub branch: String,
    pub conflict_files: Vec<String>,
}

impl Git {
    /// Diffs two arbitrary snapshot revisions in a goal workspace (`from_rev` -> `to_rev`),
    /// resolving both first so invalid refs fail clearly.
    pub fn diff_revs(&self, ws: &Path, from_rev: &str, to_rev: &str) -> Result<Vec<DiffFile>> {
        let from = self.resolve(ws, from_rev)?;
        let to = self.resolve(ws, to_rev)?;
        self.diff(ws, &from, &to)
    }

    /// Lists content-addressed snapshots stored under `refs/tower/` in `ws`
    /// (`refs/tower/runs/<n>`, `refs/tower/pin`, `refs/tower/saved/<ts>`),
    /// ordered chronologically from base to current pin.
    pub fn list_run_snapshots(&self, ws: &Path) -> Result<Vec<SnapshotPoint>> {
        let out =
            self.run(ws, &["for-each-ref", "--format=%(refname)\t%(objectname)", "refs/tower/"]).unwrap_or_default();
        let mut run_points: Vec<(u32, SnapshotPoint)> = Vec::new();
        let mut saved_points: Vec<(i64, SnapshotPoint)> = Vec::new();
        let mut latest_pin: Option<String> = None;

        for line in out.lines() {
            let Some((refname, sha)) = line.split_once('\t') else { continue };
            let sha = sha.trim().to_string();
            if sha.is_empty() {
                continue;
            }
            if let Some(n_str) = refname.strip_prefix("refs/tower/runs/")
                && let Ok(run_no) = n_str.parse::<u32>()
            {
                run_points.push((
                    run_no,
                    SnapshotPoint {
                        rev: sha,
                        kind: "run_start".into(),
                        label: format!("Run #{run_no} start"),
                        run_no: Some(run_no),
                        at: None,
                    },
                ));
            } else if let Some(ts_str) = refname.strip_prefix("refs/tower/saved/")
                && let Ok(ts) = ts_str.parse::<i64>()
            {
                saved_points.push((
                    ts,
                    SnapshotPoint {
                        rev: sha,
                        kind: "saved".into(),
                        label: format!("Saved @{}", &ts_str[..ts_str.len().min(10)]),
                        run_no: None,
                        at: Some(ts),
                    },
                ));
            } else if refname == "refs/tower/pin" {
                latest_pin = Some(sha);
            }
        }
        run_points.sort_by_key(|(n, _)| *n);
        saved_points.sort_by_key(|(ts, _)| *ts);

        let mut points: Vec<SnapshotPoint> = run_points.into_iter().map(|(_, p)| p).collect();
        points.extend(saved_points.into_iter().map(|(_, p)| p));
        if let Some(pin) = latest_pin {
            let short = pin[..pin.len().min(7)].to_string();
            points.push(SnapshotPoint {
                rev: pin,
                kind: "pin".into(),
                label: format!("Latest @{short}"),
                run_no: None,
                at: None,
            });
        }
        Ok(points)
    }

    /// Predicts sequential merge conflicts across `branches` applied in order on top
    /// of `base_branch` using `git merge-tree --write-tree --merge-base=...`,
    /// without touching the working tree or creating any refs or commits.
    pub fn merge_queue_check(
        &self,
        project_root: &Path,
        base_branch: &str,
        branches: &[String],
    ) -> Result<Vec<MergeQueueCheckItem>> {
        let base_commit = self.resolve(project_root, base_branch)?;
        let mut current_tree = self.run_trim(project_root, &["rev-parse", &format!("{base_commit}^{{tree}}")])?;
        let mut results = Vec::with_capacity(branches.len());

        for branch in branches {
            let Ok(branch_commit) = self.resolve(project_root, branch) else {
                results.push(MergeQueueCheckItem {
                    branch: branch.clone(),
                    conflict_files: vec![format!("missing branch: {branch}")],
                });
                continue;
            };
            let merge_base = self
                .run_trim(project_root, &["merge-base", &base_commit, &branch_commit])
                .unwrap_or_else(|_| base_commit.clone());

            let mut cmd = self.command(project_root);
            cmd.args([
                "merge-tree",
                "--write-tree",
                "--name-only",
                "--no-messages",
                &format!("--merge-base={merge_base}"),
                &current_tree,
                &branch_commit,
            ]);
            let out = cmd.output()?;
            match out.status.code() {
                Some(0) => {
                    let stdout = String::from_utf8_lossy(&out.stdout);
                    if let Some(next_tree) = stdout.lines().next().map(str::trim).filter(|s| !s.is_empty()) {
                        current_tree = next_tree.to_string();
                    }
                    results.push(MergeQueueCheckItem { branch: branch.clone(), conflict_files: Vec::new() });
                }
                Some(1) => {
                    let files: Vec<String> = String::from_utf8_lossy(&out.stdout)
                        .lines()
                        .skip(1)
                        .map(str::trim)
                        .filter(|l| !l.is_empty())
                        .map(String::from)
                        .collect();
                    results.push(MergeQueueCheckItem { branch: branch.clone(), conflict_files: files });
                }
                _ => {
                    let stderr = String::from_utf8_lossy(&out.stderr).trim().to_string();
                    return Err(GitError::Failed { args: "merge-tree --write-tree".into(), stderr });
                }
            }
        }
        Ok(results)
    }
}
