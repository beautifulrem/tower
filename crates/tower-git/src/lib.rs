//! Workspace isolation (`docs/10`).
//!
//! Each goal works in a *satellite*: a private clone of the user's repository
//! with no remote, owned by Tower. The agent never touches the user's
//! checkout. Snapshots (`pin`s) are commits written with a temporary index so
//! the agent's own index and HEAD are left alone, and they are content
//! addressed: the same tree on the same base always yields the same pin.
//! Only accepting a goal writes to the user's repository, and then only a new
//! local branch (`ADR-133`: Tower never pushes in M1).

pub mod diff;

use std::path::{Path, PathBuf};
use std::process::{Command, Output};

use thiserror::Error;
use tower_core::view::{DiffFile, DiffStat};

/// Low-level errors in English, like git's own output. The supervisor adds
/// localized context where they reach the human.
#[derive(Debug, Error)]
pub enum GitError {
    #[error("git could not be started: {0}")]
    Spawn(#[from] std::io::Error),
    #[error("git {args} failed: {stderr}")]
    Failed { args: String, stderr: String },
    #[error("{0}")]
    Invalid(String),
}

pub type Result<T> = std::result::Result<T, GitError>;

/// Fixed date for snapshot commits so pins are content addressed.
const SNAPSHOT_DATE: &str = "@0 +0000";
const AGENT_NAME: &str = "Tower Agent";
const AGENT_EMAIL: &str = "agent@tower.invalid";

#[derive(Debug, Clone)]
pub struct Git {
    program: PathBuf,
    env: Vec<(String, String)>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Snapshot {
    pub pin: String,
    pub stat: DiffStat,
    /// Paths changed relative to base.
    pub changed: Vec<String>,
}

/// The user's identity as configured for their repository.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Identity {
    pub name: String,
    pub email: String,
}

impl Default for Git {
    fn default() -> Self {
        Self::new("git", Vec::new())
    }
}

impl Git {
    /// `env` is the complete environment for git (e.g. the login PATH).
    pub fn new(program: impl Into<PathBuf>, env: Vec<(String, String)>) -> Self {
        Self { program: program.into(), env }
    }

    fn command(&self, cwd: &Path) -> Command {
        let mut c = Command::new(&self.program);
        c.current_dir(cwd);
        if !self.env.is_empty() {
            c.env_clear().envs(self.env.iter().cloned());
        }
        // Never prompt, never page, never run a user's diff driver.
        c.env("GIT_TERMINAL_PROMPT", "0").env("GIT_PAGER", "cat").env("LC_ALL", "C");
        c
    }

    fn run_with(&self, cwd: &Path, args: &[&str], f: impl FnOnce(&mut Command)) -> Result<String> {
        let mut c = self.command(cwd);
        c.args(args);
        f(&mut c);
        let out: Output = c.output()?;
        if out.status.success() {
            Ok(String::from_utf8_lossy(&out.stdout).into_owned())
        } else {
            Err(GitError::Failed {
                args: args.join(" "),
                stderr: String::from_utf8_lossy(&out.stderr).trim().to_string(),
            })
        }
    }

    fn run(&self, cwd: &Path, args: &[&str]) -> Result<String> {
        self.run_with(cwd, args, |_| {})
    }

    fn run_trim(&self, cwd: &Path, args: &[&str]) -> Result<String> {
        Ok(self.run(cwd, args)?.trim().to_string())
    }

    pub fn version(&self) -> Result<String> {
        self.run_trim(Path::new("/"), &["--version"])
    }

    /// The repository root containing `path`, or an error if it is not a repo.
    pub fn repo_root(&self, path: &Path) -> Result<PathBuf> {
        let root = self.run_trim(path, &["rev-parse", "--show-toplevel"])?;
        Ok(PathBuf::from(root))
    }

    pub fn current_branch(&self, root: &Path) -> Result<String> {
        let b = self.run_trim(root, &["symbolic-ref", "--quiet", "--short", "HEAD"])?;
        if b.is_empty() { Err(GitError::Invalid("HEAD is not on a branch".into())) } else { Ok(b) }
    }

    pub fn resolve(&self, root: &Path, rev: &str) -> Result<String> {
        self.run_trim(root, &["rev-parse", "--verify", "--quiet", &format!("{rev}^{{commit}}")])
    }

    pub fn identity(&self, root: &Path) -> Identity {
        let get = |k: &str| self.run_trim(root, &["config", "--get", k]).unwrap_or_default();
        let name = get("user.name");
        let email = get("user.email");
        Identity {
            name: if name.is_empty() { "Tower".into() } else { name },
            email: if email.is_empty() { "tower@localhost".into() } else { email },
        }
    }

    /// Creates the goal's satellite at `ws` from `base_branch` of the user's
    /// repository and returns the base commit.
    pub fn prepare_workspace(
        &self,
        project_root: &Path,
        base_branch: &str,
        ws: &Path,
        goal_id: &str,
    ) -> Result<String> {
        let base = self.resolve(project_root, base_branch)?;
        if ws.exists() {
            return Err(GitError::Invalid(format!("workspace already exists: {}", ws.display())));
        }
        if let Some(parent) = ws.parent() {
            std::fs::create_dir_all(parent)?;
        }
        let ws_str = ws.to_string_lossy();
        let root_str = project_root.to_string_lossy();
        self.run(project_root, &["clone", "--quiet", "--no-hardlinks", "--no-checkout", &root_str, &ws_str])?;
        let branch = format!("tower/{goal_id}");
        self.run(ws, &["checkout", "--quiet", "-B", &branch, &base])?;
        self.run(ws, &["remote", "remove", "origin"])?;
        // Hooks in the repository are code the agent can edit; they must not
        // run when anything commits in the satellite.
        let hooks = ws.join(".git").join("tower-empty-hooks");
        std::fs::create_dir_all(&hooks)?;
        for (k, v) in [
            ("core.hooksPath", hooks.to_string_lossy().as_ref()),
            ("user.name", AGENT_NAME),
            ("user.email", AGENT_EMAIL),
            ("commit.gpgSign", "false"),
            ("gc.auto", "0"),
        ] {
            self.run(ws, &["config", k, v])?;
        }
        Ok(base)
    }

    /// Snapshots the working tree (tracked and untracked, minus ignored
    /// files) as a commit on `base`, without touching the agent's index.
    pub fn snapshot(&self, ws: &Path, base: &str) -> Result<Snapshot> {
        let index = ws.join(".git").join("tower-snapshot-index");
        let _ = std::fs::remove_file(&index);
        let index_str = index.to_string_lossy().into_owned();
        let with_index = |c: &mut Command| {
            c.env("GIT_INDEX_FILE", &index_str);
        };
        self.run_with(ws, &["add", "--all", "."], with_index)?;
        let tree = self.run_with(ws, &["write-tree"], with_index)?.trim().to_string();
        let _ = std::fs::remove_file(&index);
        let pin = self
            .run_with(ws, &["commit-tree", &tree, "-p", base, "-m", "tower snapshot"], |c| {
                c.env("GIT_AUTHOR_NAME", AGENT_NAME)
                    .env("GIT_AUTHOR_EMAIL", AGENT_EMAIL)
                    .env("GIT_COMMITTER_NAME", AGENT_NAME)
                    .env("GIT_COMMITTER_EMAIL", AGENT_EMAIL)
                    .env("GIT_AUTHOR_DATE", SNAPSHOT_DATE)
                    .env("GIT_COMMITTER_DATE", SNAPSHOT_DATE);
            })?
            .trim()
            .to_string();
        self.run(ws, &["update-ref", "refs/tower/pin", &pin])?;
        let (stat, changed) = self.numstat(ws, base, &pin)?;
        Ok(Snapshot { pin, stat, changed })
    }

    fn numstat(&self, repo: &Path, from: &str, to: &str) -> Result<(DiffStat, Vec<String>)> {
        let out = self.run(repo, &["diff", "--numstat", "-M", "--no-color", "--no-ext-diff", from, to])?;
        let mut stat = DiffStat::default();
        let mut changed = Vec::new();
        for line in out.lines() {
            let mut parts = line.splitn(3, '\t');
            let a = parts.next().unwrap_or("-");
            let d = parts.next().unwrap_or("-");
            let path = parts.next().unwrap_or_default();
            stat.files += 1;
            stat.additions += a.parse::<u32>().unwrap_or(0);
            stat.deletions += d.parse::<u32>().unwrap_or(0);
            // Renames are reported as `old => new` or `dir/{old => new}`.
            changed.push(rename_target(path));
        }
        Ok((stat, changed))
    }

    pub fn diff(&self, repo: &Path, from: &str, to: &str) -> Result<Vec<DiffFile>> {
        let out = self.run(repo, &["diff", "-M", "-U3", "--no-color", "--no-ext-diff", from, to])?;
        Ok(diff::parse(&out))
    }

    /// A clean, detached checkout of `pin` for the verifier.
    pub fn add_verify_checkout(&self, ws: &Path, pin: &str, dir: &Path) -> Result<()> {
        if dir.exists() {
            self.remove_verify_checkout(ws, dir)?;
        }
        self.run(ws, &["worktree", "add", "--quiet", "--detach", "--force", &dir.to_string_lossy(), pin])?;
        Ok(())
    }

    pub fn remove_verify_checkout(&self, ws: &Path, dir: &Path) -> Result<()> {
        let _ = self.run(ws, &["worktree", "remove", "--force", &dir.to_string_lossy()]);
        if dir.exists() {
            std::fs::remove_dir_all(dir)?;
        }
        let _ = self.run(ws, &["worktree", "prune"]);
        Ok(())
    }

    /// Seals the verified snapshot as one commit by the user and writes it
    /// as a new local branch in the user's repository. Returns the branch
    /// name actually used (a `-v<n>` suffix if the name is taken) and the
    /// commit.
    pub fn seal(
        &self,
        project_root: &Path,
        ws: &Path,
        base: &str,
        pin: &str,
        branch: &str,
        message: &str,
    ) -> Result<(String, String)> {
        let who = self.identity(project_root);
        let tree = self.run_trim(ws, &["rev-parse", &format!("{pin}^{{tree}}")])?;
        let commit = self.commit_tree_with_message(ws, &tree, base, message, &who)?;
        let mut name = branch.to_string();
        let mut n = 2;
        while self.resolve(project_root, &format!("refs/heads/{name}")).is_ok() {
            name = format!("{branch}-v{n}");
            n += 1;
        }
        let refspec = format!("{commit}:refs/heads/{name}");
        self.run(project_root, &["fetch", "--quiet", "--no-tags", &ws.to_string_lossy(), &refspec])?;
        Ok((name, commit))
    }

    fn commit_tree_with_message(
        &self,
        ws: &Path,
        tree: &str,
        base: &str,
        message: &str,
        who: &Identity,
    ) -> Result<String> {
        Ok(self
            .run_with(ws, &["commit-tree", tree, "-p", base, "-m", message], |c| {
                c.env("GIT_AUTHOR_NAME", &who.name)
                    .env("GIT_AUTHOR_EMAIL", &who.email)
                    .env("GIT_COMMITTER_NAME", &who.name)
                    .env("GIT_COMMITTER_EMAIL", &who.email);
            })?
            .trim()
            .to_string())
    }

    /// Whether `commit`'s changes are in `base_branch` of the user's repo:
    /// either the commit itself is an ancestor, or the branch tip contains
    /// the same tree changes (squash or rebase merges).
    pub fn is_integrated(&self, project_root: &Path, base_branch: &str, commit: &str) -> bool {
        if self.run(project_root, &["merge-base", "--is-ancestor", commit, base_branch]).is_ok() {
            return true;
        }
        // Same patch already applied: the commit's diff against the branch tip
        // touches nothing the commit itself changed.
        let Ok(files) = self.run(project_root, &["diff", "--name-only", &format!("{commit}^"), commit]) else {
            return false;
        };
        let files: Vec<&str> = files.lines().collect();
        if files.is_empty() {
            return false;
        }
        let mut args = vec!["diff", "--quiet", commit, base_branch, "--"];
        args.extend(files.iter().copied());
        self.run(project_root, &args).is_ok()
    }

    /// Copies git-ignored files of the user's repository that match
    /// `patterns` (e.g. `.env`, `config/*.local.json`) into `dest`, keeping
    /// their relative paths. Tracked files never qualify: they arrive with
    /// the clone. Returns the copied paths.
    pub fn copy_local_files(&self, project_root: &Path, dest: &Path, patterns: &[String]) -> Result<Vec<String>> {
        const MAX_BYTES: u64 = 5 * 1024 * 1024;
        if patterns.iter().all(|p| p.trim().is_empty()) {
            return Ok(Vec::new());
        }
        let mut b = globset::GlobSetBuilder::new();
        for p in patterns.iter().map(|p| p.trim()).filter(|p| !p.is_empty()) {
            b.add(
                globset::Glob::new(p).map_err(|e| GitError::Invalid(format!("invalid local file pattern {p}: {e}")))?,
            );
        }
        let set = b.build().map_err(|e| GitError::Invalid(e.to_string()))?;
        let listed = self.run(project_root, &["ls-files", "-z", "--others", "--ignored", "--exclude-standard"])?;
        let mut copied = Vec::new();
        for rel in listed.split('\0').filter(|r| !r.is_empty() && set.is_match(r)) {
            let from = project_root.join(rel);
            let Ok(meta) = std::fs::symlink_metadata(&from) else { continue };
            // Only regular files, and nothing large: local config, not data.
            if !meta.is_file() || meta.len() > MAX_BYTES {
                continue;
            }
            let to = dest.join(rel);
            if let Some(parent) = to.parent() {
                std::fs::create_dir_all(parent)?;
            }
            std::fs::copy(&from, &to)?;
            copied.push(rel.to_string());
        }
        copied.sort();
        Ok(copied)
    }

    /// Paths that differ between two snapshots.
    pub fn changed_between(&self, repo: &Path, from: &str, to: &str) -> Result<Vec<String>> {
        let out = self.run(repo, &["diff", "--name-only", "-z", "--no-renames", from, to])?;
        Ok(out.split('\0').filter(|p| !p.is_empty()).map(String::from).collect())
    }

    /// Files the working tree of `workspace` changes relative to `base`,
    /// including new untracked files. Cheap enough to poll.
    pub fn touched(&self, workspace: &Path, base: &str) -> Result<Vec<String>> {
        let tracked = self.run(workspace, &["diff", "--name-only", "-z", "--no-renames", base])?;
        let untracked = self.run(workspace, &["ls-files", "--others", "--exclude-standard", "-z"])?;
        let mut files: Vec<String> =
            tracked.split('\0').chain(untracked.split('\0')).filter(|p| !p.is_empty()).map(String::from).collect();
        files.sort();
        files.dedup();
        Ok(files)
    }

    /// Files that would conflict if `theirs` were merged into `ours`, without
    /// touching any checkout (`git merge-tree`, git 2.38+). `None` when this
    /// git cannot tell.
    pub fn merge_conflicts(&self, repo: &Path, ours: &str, theirs: &str) -> Option<Vec<String>> {
        let mut c = self.command(repo);
        c.args(["merge-tree", "--write-tree", "--name-only", "--no-messages", ours, theirs]);
        let out = c.output().ok()?;
        match out.status.code() {
            Some(0) => Some(Vec::new()),
            // Exit 1: conflicts. The first line is the tree, then one path per line.
            Some(1) => Some(
                String::from_utf8_lossy(&out.stdout)
                    .lines()
                    .skip(1)
                    .filter(|l| !l.is_empty())
                    .map(String::from)
                    .collect(),
            ),
            _ => None,
        }
    }

    /// Makes `dir` a repository on `main` with everything in it committed.
    pub fn init_with_commit(&self, dir: &Path, message: &str) -> Result<()> {
        self.run(dir, &["init", "--quiet", "--initial-branch=main"])?;
        self.run(dir, &["add", "."])?;
        self.run(
            dir,
            &["-c", "user.name=Tower", "-c", "user.email=tower@localhost", "commit", "--quiet", "-m", message],
        )?;
        Ok(())
    }

    /// The URL of `origin` in the user's repository, if any.
    pub fn origin_url(&self, project_root: &Path) -> Option<String> {
        self.run_trim(project_root, &["remote", "get-url", "origin"]).ok().filter(|u| !u.is_empty())
    }

    /// Pushes a local branch of the user's repository to `origin`. A
    /// one-way door: only ever called on an explicit human action.
    pub fn push_branch(&self, project_root: &Path, branch: &str) -> Result<()> {
        self.run(
            project_root,
            &["push", "--set-upstream", "origin", &format!("refs/heads/{branch}:refs/heads/{branch}")],
        )?;
        Ok(())
    }

    /// Detects the project's test command from conventional manifests.
    pub fn detect_test_command(root: &Path) -> Option<String> {
        let pkg = root.join("package.json");
        if let Ok(text) = std::fs::read_to_string(&pkg) {
            let has_test = serde_json::from_str::<serde_json::Value>(&text)
                .ok()
                .and_then(|v| v.get("scripts")?.get("test")?.as_str().map(|s| !s.contains("no test specified")))
                .unwrap_or(false);
            if has_test {
                let pm = if root.join("pnpm-lock.yaml").exists() {
                    "pnpm"
                } else if root.join("yarn.lock").exists() {
                    "yarn"
                } else if root.join("bun.lockb").exists() || root.join("bun.lock").exists() {
                    "bun"
                } else {
                    "npm"
                };
                return Some(format!("{pm} test"));
            }
        }
        if root.join("Cargo.toml").exists() {
            return Some("cargo test".into());
        }
        if root.join("go.mod").exists() {
            return Some("go test ./...".into());
        }
        if root.join("pyproject.toml").exists() || root.join("pytest.ini").exists() {
            return Some("pytest".into());
        }
        None
    }

    /// The dependency setup command a clean checkout needs, if any.
    pub fn detect_setup_command(root: &Path) -> Option<String> {
        let manifest: serde_json::Value =
            serde_json::from_str(&std::fs::read_to_string(root.join("package.json")).ok()?).ok()?;
        // Nothing to install: no setup (and no network) needed.
        let has_deps = ["dependencies", "devDependencies", "optionalDependencies"]
            .iter()
            .any(|k| manifest.get(k).and_then(|d| d.as_object()).is_some_and(|d| !d.is_empty()));
        if !has_deps && !root.join("pnpm-lock.yaml").exists() && !root.join("package-lock.json").exists() {
            return None;
        }
        Some(
            if root.join("pnpm-lock.yaml").exists() {
                "pnpm install --frozen-lockfile --prefer-offline"
            } else if root.join("yarn.lock").exists() {
                "yarn install --frozen-lockfile"
            } else if root.join("bun.lockb").exists() || root.join("bun.lock").exists() {
                "bun install --frozen-lockfile"
            } else if root.join("package-lock.json").exists() {
                "npm ci --prefer-offline"
            } else {
                "npm install"
            }
            .into(),
        )
    }
}

fn rename_target(path: &str) -> String {
    if let (Some(open), Some(close)) = (path.find('{'), path.find('}')) {
        let inner = &path[open + 1..close];
        let new = inner.split(" => ").nth(1).unwrap_or(inner);
        let joined = format!("{}{}{}", &path[..open], new, &path[close + 1..]);
        return joined.replace("//", "/");
    }
    path.split(" => ").last().unwrap_or(path).to_string()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn rename_targets_are_resolved() {
        assert_eq!(rename_target("a.txt"), "a.txt");
        assert_eq!(rename_target("old.txt => new.txt"), "new.txt");
        assert_eq!(rename_target("src/{a => b}/x.rs"), "src/b/x.rs");
        assert_eq!(rename_target("src/{ => b}/x.rs"), "src/b/x.rs");
    }
}
