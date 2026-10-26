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

    /// Sets your name and email in git's global configuration (what every
    /// repository uses unless it sets its own).
    pub fn set_global_identity(&self, name: &str, email: &str) -> Result<()> {
        self.run(Path::new("/"), &["config", "--global", "user.name", name])?;
        self.run(Path::new("/"), &["config", "--global", "user.email", email])?;
        Ok(())
    }

    /// Whether commits in `root` would carry a configured name and email.
    pub fn has_identity(&self, root: &Path) -> bool {
        let get = |k: &str| self.run_trim(root, &["config", "--get", k]).unwrap_or_default();
        !get("user.name").is_empty() && !get("user.email").is_empty()
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
        self.publish(project_root, ws, &commit, branch)
    }

    /// Adds one commit with `pin`'s tree on top of `previous` and moves
    /// `branch` to it (a fast-forward), e.g. a fix after the pushed
    /// branch failed CI, so the open pull request updates.
    pub fn seal_update(
        &self,
        project_root: &Path,
        ws: &Path,
        previous: &str,
        pin: &str,
        branch: &str,
        message: &str,
    ) -> Result<String> {
        let who = self.identity(project_root);
        // The previous seal lives in the user's repository; bring it here.
        self.run(ws, &["fetch", "--quiet", "--no-tags", &project_root.to_string_lossy(), previous])?;
        let tree = self.run_trim(ws, &["rev-parse", &format!("{pin}^{{tree}}")])?;
        let commit = self.commit_tree_with_message(ws, &tree, previous, message, &who)?;
        let refspec = format!("{commit}:refs/heads/{branch}");
        self.run(project_root, &["fetch", "--quiet", "--no-tags", &ws.to_string_lossy(), &refspec])?;
        Ok(commit)
    }

    fn publish(&self, project_root: &Path, ws: &Path, commit: &str, branch: &str) -> Result<(String, String)> {
        let commit = commit.to_string();
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
            let bytes = std::fs::read(&from)?;
            write_inside(dest, rel, &bytes)?;
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

    /// A clean checkout of `base` cloned from the user's own repository, so
    /// nothing the agent can write (its workspace's object store) shapes it.
    pub fn trusted_checkout(&self, project_root: &Path, base: &str, dir: &Path) -> Result<()> {
        if dir.exists() {
            std::fs::remove_dir_all(dir)?;
        }
        if let Some(parent) = dir.parent() {
            std::fs::create_dir_all(parent)?;
        }
        let (root, d) = (project_root.to_string_lossy(), dir.to_string_lossy());
        self.run(project_root, &["clone", "--quiet", "--no-checkout", "--no-hardlinks", &root, &d])?;
        self.run(dir, &["checkout", "--quiet", "--detach", base])?;
        Ok(())
    }

    /// Brings the agent's snapshot (`refs/tower/pin` of its workspace) into a
    /// checkout made by [`Git::trusted_checkout`] and switches to it, keeping
    /// untracked and ignored files (installed dependencies).
    pub fn switch_to_pin(&self, dir: &Path, ws: &Path, pin: &str) -> Result<()> {
        self.run(dir, &["fetch", "--quiet", "--no-tags", &ws.to_string_lossy(), "+refs/tower/pin:refs/tower/pin"])?;
        let fetched = self.run_trim(dir, &["rev-parse", "refs/tower/pin"])?;
        if fetched != pin {
            return Err(GitError::Invalid(format!("the workspace's snapshot moved ({fetched} is not {pin})")));
        }
        self.run(dir, &["checkout", "--quiet", "--force", "--detach", pin])?;
        Ok(())
    }

    /// Puts every tracked file of a verification checkout back to `rev`
    /// (whatever setup or a criterion changed), keeping untracked and
    /// ignored files.
    pub fn reset_tracked(&self, dir: &Path, rev: &str) -> Result<()> {
        self.run(dir, &["reset", "--quiet", "--hard", rev])?;
        Ok(())
    }

    /// Lines matching `pattern` (extended regex) in the files of `rev`, as
    /// (path, line); empty when nothing matches.
    pub fn grep_at(&self, root: &Path, rev: &str, pattern: &str) -> Result<Vec<(String, String)>> {
        let out = match self.run(root, &["grep", "-I", "-E", "--no-color", pattern, rev, "--"]) {
            Ok(out) => out,
            // git grep exits 1 when nothing matches.
            Err(GitError::Failed { stderr, .. }) if stderr.is_empty() => return Ok(Vec::new()),
            Err(e) => return Err(e),
        };
        let prefix = format!("{rev}:");
        Ok(out
            .lines()
            .filter_map(|l| {
                let rest = l.strip_prefix(&prefix)?;
                let (path, line) = rest.split_once(':')?;
                Some((path.to_string(), line.to_string()))
            })
            .collect())
    }

    /// The tracked files of a checkout.
    pub fn ls_files(&self, dir: &Path) -> Result<Vec<String>> {
        let out = self.run(dir, &["ls-files", "-z"])?;
        Ok(out.split('\0').filter(|p| !p.is_empty()).map(str::to_string).collect())
    }

    /// Removes untracked, non-ignored files (`git clean -fd`).
    pub fn clean_untracked(&self, dir: &Path) -> Result<()> {
        self.run(dir, &["clean", "-fdq"])?;
        Ok(())
    }

    /// Switches a verification checkout to `rev`, keeping untracked and
    /// ignored files (installed dependencies, build caches).
    pub fn checkout_detached(&self, dir: &Path, rev: &str) -> Result<()> {
        self.run(dir, &["checkout", "--quiet", "--force", "--detach", rev])?;
        Ok(())
    }

    /// Points `refname` at `commit`, so the snapshot outlives garbage collection.
    pub fn keep(&self, ws: &Path, refname: &str, commit: &str) -> Result<()> {
        self.run(ws, &["update-ref", refname, commit])?;
        Ok(())
    }

    /// Makes the working tree of `ws` exactly the snapshot `commit`: files
    /// it does not have are removed, ignored files (e.g. `.env`) are kept.
    pub fn restore(&self, ws: &Path, commit: &str) -> Result<()> {
        self.run(ws, &["checkout", "--no-overlay", commit, "--", "."])?;
        self.run(ws, &["clean", "-fdq"])?;
        // The index goes back to HEAD; snapshots never use it.
        self.run(ws, &["reset", "-q"])?;
        Ok(())
    }

    /// Undoes hunk number `hunk` (0-based) of `path` in the diff `from → to`
    /// in the working tree of `ws`, which must still hold `to` for that file.
    pub fn revert_hunk(&self, ws: &Path, from: &str, to: &str, path: &str, hunk: usize) -> Result<()> {
        let patch = self.run(ws, &["diff", "-U3", "--no-color", "--no-ext-diff", from, to, "--", path])?;
        let mut header = String::new();
        let mut hunks: Vec<String> = Vec::new();
        for line in patch.split_inclusive('\n') {
            if line.starts_with("@@") {
                hunks.push(line.to_string());
            } else if let Some(h) = hunks.last_mut() {
                h.push_str(line);
            } else {
                header.push_str(line);
            }
        }
        let Some(chosen) = hunks.get(hunk) else {
            return Err(GitError::Invalid(format!("{path} has no hunk {hunk}")));
        };
        let file = ws.join(".git").join("tower-revert.patch");
        std::fs::write(&file, format!("{header}{chosen}"))?;
        let r = self.run(ws, &["apply", "-R", "--whitespace=nowarn", &file.to_string_lossy()]);
        let _ = std::fs::remove_file(&file);
        r.map(|_| ())
    }

    /// The content of `path` at `rev`, as text (lossy), or `None` when the
    /// file does not exist there.
    pub fn file_at(&self, repo: &Path, rev: &str, path: &str) -> Option<String> {
        self.run(repo, &["show", &format!("{rev}:{path}")]).ok()
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

/// Writes `bytes` to `root/rel` without ever following a symlink: `root`
/// may hold content someone else controls (an agent's checkout), and a
/// planted link at `rel` or in one of its directories would otherwise send
/// the write elsewhere. An existing link at `rel` is replaced by the file;
/// a link among the directories is refused.
pub fn write_inside(root: &Path, rel: &str, bytes: &[u8]) -> std::io::Result<()> {
    let rel = Path::new(rel);
    if rel.is_absolute() || rel.components().any(|c| !matches!(c, std::path::Component::Normal(_))) {
        return Err(std::io::Error::new(
            std::io::ErrorKind::InvalidInput,
            format!("not a plain relative path: {}", rel.display()),
        ));
    }
    let mut dir = root.to_path_buf();
    let parts: Vec<_> = rel.components().collect();
    for part in &parts[..parts.len().saturating_sub(1)] {
        dir.push(part);
        match std::fs::symlink_metadata(&dir) {
            Ok(m) if m.file_type().is_symlink() => {
                return Err(std::io::Error::new(
                    std::io::ErrorKind::PermissionDenied,
                    format!("{} is a symbolic link", dir.display()),
                ));
            }
            Ok(m) if m.is_dir() => {}
            Ok(_) => {
                return Err(std::io::Error::new(
                    std::io::ErrorKind::AlreadyExists,
                    format!("{} is not a directory", dir.display()),
                ));
            }
            Err(_) => std::fs::create_dir(&dir)?,
        }
    }
    let target = root.join(rel);
    if std::fs::symlink_metadata(&target).is_ok_and(|m| m.file_type().is_symlink()) {
        std::fs::remove_file(&target)?;
    }
    // create_new would refuse an existing file; truncate an existing regular
    // file instead, with O_NOFOLLOW as a last guard against a racing link.
    use std::os::unix::fs::OpenOptionsExt;
    let mut f = std::fs::OpenOptions::new()
        .write(true)
        .create(true)
        .truncate(true)
        .custom_flags(0x0100) // O_NOFOLLOW on macOS
        .open(&target)?;
    std::io::Write::write_all(&mut f, bytes)
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
