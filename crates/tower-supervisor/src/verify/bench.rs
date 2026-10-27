//! The verification workbench: one clean checkout and one package cache
//! per verification, used step by step in order of trust.

use std::path::Path;
use std::sync::Arc;
use std::time::Duration;

use tower_core::contract::CriterionKind;
use tower_core::reasons::{BaseError, BaseProblem, Preflight};
use tower_core::view::CanaryState;
use tower_core::{EventKind, tr};
use tower_git::Git;
use tower_verify::{Cancel, RunSpec};

mod checks;
mod env_error;
mod guard;
mod held_out;
mod looks;
mod loopback;
mod perturb_run;
mod processes;
pub(super) use checks::{confirmed_refusal, paths_gone, sentinel_hit, tests_ran};
use guard::{Coverage, Guard, Phase};
use processes::RemoveOnDrop;

use super::{Outcome, SETUP_TIMEOUT, append_hit, command_for, names_held_out, setup_may_use_network, tail_lines};
use crate::prompts::Failure;
use crate::{Inner, Result, invalid, run};

/// The result of one command in the verification checkout.
struct Ran {
    passed: bool,
    /// The command could not run as meant: it did not start, was killed,
    /// or the sandbox refused something it needed (not a test failure).
    environment_failure: bool,
    /// The sandbox refused an access.
    denied: bool,
    exit_code: Option<i32>,
    duration_ms: i64,
    output_tail: String,
}

/// One verification's workbench: a clean checkout and a fresh package
/// cache (seeded from the user's own, thrown away afterwards), used in
/// order of trust:
///
/// 1. checked out at the base commit — your content — setup runs with the
///    network, and the criteria that have no baseline yet run there
///    (red → green evidence);
/// 2. switched to the agent's snapshot — setup runs again, offline unless
///    the contract allows the network or you approved this snapshot —
///    then the criteria, without the held-out tests: the verdict the agent
///    may hear about;
/// 3. the held-out tests copied in, offline: their results go to you only;
/// 4. the agent's changes outside the source (tests, configuration,
///    scripts, package settings) put back as on the base, and the criteria
///    once more: a pass must come from the source;
/// 5. a test that must fail added to the test files, and the criteria that
///    proved the change (or whose base did not run) once more: it must fail;
/// 6. the base's own test files with their inputs moved, on the base and on
///    the snapshot: is the pass general or fitted to those inputs.
///
/// Every tracked file is reset to the snapshot between steps. The paths are
/// new for every verification, and whatever it started is stopped when it
/// ends, so nothing from one run reaches the next. Nothing the agent wrote
/// influences step 1. Local files such as `.env` are present only while
/// criteria run, never during setup.
pub(super) struct Bench<'a> {
    inner: &'a Arc<Inner>,
    goal: &'a str,
    rec: tower_store::GoalRecord,
    ws: String,
    base: String,
    dir: std::path::PathBuf,
    tmp: std::path::PathBuf,
    /// Tower's write-only drop box for proofs and records (see
    /// `held_out`).
    drop: std::path::PathBuf,
    env: Vec<(String, String)>,
    online: Option<std::path::PathBuf>,
    offline: Option<std::path::PathBuf>,
    criteria: Option<std::path::PathBuf>,
    /// Criteria with the held-out tests present: never the network.
    held_out_profile: Option<std::path::PathBuf>,
    setup: Option<String>,
    /// The project's held-out test patterns.
    holdout: Vec<String>,
    /// Tower's assertion-identity guard, loaded before any project code.
    guard: Option<Guard>,
    cancel: &'a Cancel,
    /// Loopback opened for criteria your own code needs it for.
    loopback: loopback::OpenLoopback,
    _cache: RemoveOnDrop,
    _guard_dir: RemoveOnDrop,
}

/// What a step found besides the verdict.
pub(super) type Found = Vec<tower_core::sentinel::SentinelHit>;

/// What `run_all` returns: the outcome, what the steps found, and the
/// perturbation step's report when verification got that far.
pub(super) type RunAll = (Outcome, Found, Option<crate::verify::perturb::Report>);

type Exec = (tower_core::contract::Criterion, String, u32);

impl<'a> Bench<'a> {
    pub(super) async fn open(
        inner: &'a Arc<Inner>,
        goal: &'a str,
        rec: &tower_store::GoalRecord,
        ws: &str,
        base: &str,
        cancel: &'a Cancel,
    ) -> Result<Bench<'a>> {
        let run_id = uuid::Uuid::new_v4().simple().to_string();
        let short = &run_id[..12];
        // New paths every time: a process that outlived an earlier
        // verification can only reach that one's (deleted) directories.
        let roots = [
            inner.paths.verify(goal),
            inner.paths.tmp(&format!("{goal}-verify")),
            inner.paths.root.join("verify-cache").join(goal),
            inner.paths.root.join("proof").join(goal),
        ];
        for r in &roots {
            let _ = std::fs::remove_dir_all(r);
        }
        let [dir, tmp, cache, drop] = roots.map(|r| r.join(short));
        std::fs::create_dir_all(&drop)?;
        // As the sandbox profile names it, so the proof lines write there.
        let drop = crate::paths::real(&drop);
        let git = inner.git.clone();
        let (root1, base1, dir1) = (rec.project_root.clone(), base.to_string(), dir.clone());
        tokio::task::spawn_blocking(move || git.trusted_checkout(Path::new(&root1), &base1, &dir1))
            .await
            .map_err(|e| invalid(e.to_string()))??;
        let cleanup = RemoveOnDrop(cache.clone());
        // Tower's own: the guard the runners load before any project code,
        // and the transcripts it reports to. Outside every directory the
        // sandbox may write, so a run can neither rewrite nor delete them.
        let guard_root = inner.paths.root.join("assert-guard").join(goal);
        let _ = std::fs::remove_dir_all(&guard_root);
        let guard = Guard::install(&guard_root.join(short)).unwrap_or_default();
        let guard_cleanup = RemoveOnDrop(guard_root);
        let tower_files = run::TowerFiles {
            read: guard.iter().map(|g| g.dir().to_path_buf()).collect(),
            append: guard.iter().flat_map(|g| g.logs()).collect(),
            drop: None,
        };
        let goal_dir = inner.paths.goal_dir(goal);
        let dirs = run::Dirs { work: &dir, tmp: &tmp, cache: &cache };
        // Loopback as the contract declares it (see `jail::Net`).
        // The criteria's profiles (and their twins) may also create files
        // in the drop box; setup's may not.
        let with_drop = run::TowerFiles { drop: Some(drop.clone()), ..tower_files.clone() };
        let jail = |purpose: &str, network: bool, files: &run::TowerFiles| {
            let net = run::Net::new(&rec.contract, network);
            run::verifier_jail(inner, &goal_dir, &dirs, purpose, &net, files)
        };
        let online = jail("verify-setup", true, &tower_files)?;
        let offline = jail("verify-setup-offline", false, &tower_files)?;
        let criteria = jail("verify", rec.contract.network, &with_drop)?;
        let held_out = jail("verify-held-out", false, &with_drop)?;
        // Their loopback-open twins (see `loopback`), when loopback is closed.
        let closed = !rec.contract.network && !rec.contract.loopback_open;
        let twin = |purpose: &str| -> Result<Option<std::path::PathBuf>> {
            if !closed {
                return Ok(None);
            }
            let net = run::Net { open: true, ..run::Net::new(&rec.contract, false) };
            Ok(run::verifier_jail(inner, &goal_dir, &dirs, purpose, &net, &with_drop)?.profile)
        };
        let loopback =
            loopback::OpenLoopback::new(inner, goal, rec, twin("verify-loopback")?, twin("verify-held-out-loopback")?)?;
        let mut env = inner.env.without_credentials();
        env.push(("CI".into(), "1".into()));
        env.extend(criteria.env);
        let project = inner.store(|s| s.project(&rec.project_id))?;
        let holdout: Vec<String> = project.holdout_files.iter().filter(|p| !p.trim().is_empty()).cloned().collect();
        let project_setup = project.setup_command;
        let setup = if !rec.contract.setup.trim().is_empty() {
            Some(rec.contract.setup.clone())
        } else if !project_setup.trim().is_empty() {
            Some(project_setup)
        } else {
            Git::detect_setup_command(&dir)
        };
        Ok(Bench {
            inner,
            goal,
            rec: rec.clone(),
            ws: ws.to_string(),
            base: base.to_string(),
            dir,
            tmp,
            drop,
            env,
            online: online.profile,
            offline: offline.profile,
            criteria: criteria.profile,
            held_out_profile: held_out.profile,
            setup,
            holdout,
            guard,
            cancel,
            loopback,
            _cache: cleanup,
            _guard_dir: guard_cleanup,
        })
    }

    pub(super) async fn close(&self) {
        if let Some(g) = &self.guard {
            g.close();
        }
        let (dir, tmp, cache, drop) = (self.dir.clone(), self.tmp.clone(), self._cache.0.clone(), self.drop.clone());
        let root = self.inner.paths.root.clone();
        let _ = tokio::task::spawn_blocking(move || {
            crate::procs::stop_verification_leftovers(&root, &[dir.clone(), tmp.clone(), cache.clone(), drop.clone()]);
            for d in [&dir, &tmp, &cache, &drop] {
                let _ = std::fs::remove_dir_all(d);
            }
        })
        .await;
    }

    /// A criterion's command on the agent's snapshot, with Tower's
    /// assertion-identity guard loaded into the runners.
    async fn exec(&self, command: &str, profile: Option<&Path>, timeout: Duration) -> Ran {
        self.exec_in(command, profile, timeout, Some(Phase::Pin)).await
    }

    /// `phase` says which transcript the guard reports to; `None` leaves the
    /// guard out (setup installs dependencies, it runs no criteria).
    async fn exec_in(&self, command: &str, profile: Option<&Path>, timeout: Duration, phase: Option<Phase>) -> Ran {
        let profile = self.profile_for(command, profile);
        let mut env = self.env.clone();
        if let (Some(g), Some(phase)) = (&self.guard, phase) {
            g.merge_env(&mut env, phase);
        }
        let spec = RunSpec::new(command_for(command, profile), &self.dir, env, timeout);
        let r = tower_verify::run(&spec, self.cancel).await;
        // A refusal counts only when Tower sees it itself: a path the
        // output names that Tower can read and the same sandbox cannot.
        let denied = !r.passed()
            && crate::run::sandbox_denied(&r.output_tail)
            && confirmed_refusal(&r.output_tail, profile, &self.dir).await.is_some();
        // A connection the sandbox's closed loopback refused: the command
        // could not run as meant here, whatever the test would have said.
        let c = &self.rec.contract;
        let loopback = !r.passed()
            && profile != self.online.as_deref()
            && !c.network
            && !c.loopback_open
            && crate::sandbox::loopback_refusal(&r.output_tail).is_some();
        Ran {
            passed: r.passed(),
            environment_failure: r.is_environment_failure() || denied || loopback,
            denied,
            exit_code: r.exit_code(),
            duration_ms: r.duration_ms,
            output_tail: r.output_tail,
        }
    }

    /// Runs setup; `Some(result)` when it failed.
    async fn setup(&self, network: bool) -> Option<Ran> {
        let setup = self.setup.as_deref()?;
        let profile = if network { self.online.as_deref() } else { self.offline.as_deref() };
        let r = self.exec_in(setup, profile, SETUP_TIMEOUT, None).await;
        (!r.passed).then_some(r)
    }

    /// Copies the project's local files in for the criteria (and its
    /// held-out tests, when asked); returns them so they can be removed
    /// before the next setup.
    async fn local_files(&self, held_out: bool) -> Result<Vec<String>> {
        let mut files = run::copy_local_files(self.inner, &self.rec, &self.dir).await?;
        if held_out {
            files.extend(self.copy_held_out().await?);
        }
        Ok(files)
    }

    async fn copy_held_out(&self) -> Result<Vec<String>> {
        if self.holdout.is_empty() {
            return Ok(Vec::new());
        }
        let git = self.inner.git.clone();
        let (root, dest, patterns) =
            (std::path::PathBuf::from(&self.rec.project_root), self.dir.clone(), self.holdout.clone());
        let held = tokio::task::spawn_blocking(move || git.copy_local_files(&root, &dest, &patterns))
            .await
            .map_err(|e| invalid(e.to_string()))??;
        Ok(held)
    }

    fn remove(&self, files: &[String]) {
        for f in files {
            let _ = std::fs::remove_file(self.dir.join(f));
        }
    }

    /// Puts every tracked file back to `rev`.
    async fn reset(&self, rev: &str) -> Result<()> {
        let git = self.inner.git.clone();
        let (dir, rev) = (self.dir.clone(), rev.to_string());
        tokio::task::spawn_blocking(move || git.reset_tracked(&dir, &rev))
            .await
            .map_err(|e| invalid(e.to_string()))??;
        Ok(())
    }

    fn criteria_list(&self) -> Vec<Exec> {
        self.rec
            .contract
            .machine_criteria()
            .filter_map(|c| match &c.kind {
                CriterionKind::Exec { command, timeout_secs } => Some((c.clone(), command.clone(), *timeout_secs)),
                CriterionKind::Human | CriterionKind::Look { .. } => None,
            })
            .collect()
    }

    /// The base commit — your content — with your dependencies: setup with
    /// the network, then the criteria that have no baseline yet (red →
    /// green evidence) and the `look` screenshots of the base. The criteria
    /// that failed there, or the outcome that ends verification early.
    pub(super) async fn base_phase(&self, criteria: &[Exec]) -> Result<std::result::Result<Vec<String>, Outcome>> {
        let (inner, goal) = (self.inner, self.goal);
        if let Some(r) = self.setup(true).await {
            let tail = tail_lines(&r.output_tail, 20);
            let setup = self.setup.clone().unwrap_or_default();
            // Recorded without a language, worded when read.
            let note = tower_core::i18n::PauseNote::SetupFails(tower_core::reasons::SetupFails { setup, tail });
            return Ok(Err(Outcome::EnvError(note.encode())));
        }
        let detail = inner.store(|s| s.detail(goal))?;
        let missing: Vec<&str> =
            detail.criteria.iter().filter(|c| c.passed_on_base.is_none()).map(|c| c.criterion.id.as_str()).collect();
        let looks_missing: Vec<String> = detail
            .criteria
            .iter()
            .filter(|c| matches!(c.criterion.kind, CriterionKind::Look { .. }))
            .filter(|c| c.look.as_ref().is_none_or(|l| l.base.is_none() && l.base_error.is_none()))
            .map(|c| c.criterion.id.clone())
            .collect();
        if !looks_missing.is_empty() {
            let copied = self.local_files(false).await?;
            let env = self.capture_looks(&looks_missing, "base", &self.base.clone()).await?;
            self.remove(&copied);
            if let Some(note) = env {
                return Ok(Err(Outcome::EnvError(note)));
            }
        }
        let mut red_on_base: Vec<String> = detail
            .criteria
            .iter()
            .filter(|c| c.passed_on_base == Some(false))
            .map(|c| c.criterion.id.clone())
            .collect();
        if criteria.iter().any(|(c, ..)| missing.contains(&c.id.as_str())) {
            // Your content: the held-out tests may be present.
            let copied = self.local_files(true).await?;
            for (c, command, timeout) in criteria.iter().filter(|(c, ..)| missing.contains(&c.id.as_str())) {
                let timeout = Duration::from_secs((*timeout).max(1) as u64);
                let r = self.exec_in(command, self.criteria.as_deref(), timeout, Some(Phase::Base)).await;
                let r = self.open_on_base(&c.id, command, r, timeout).await?;
                // Recorded either way: "could not check" is information too.
                // A failure on the base is "red" only if the tests ran there.
                let not_run = !r.passed && !r.environment_failure && tests_ran(command, &r.output_tail) == Some(false);
                // Stored without a language: the goal page words it on read.
                let error = (r.environment_failure || not_run).then(|| {
                    let (code, tail) = (r.exit_code, tail_lines(&r.output_tail, 3));
                    let e = if r.denied {
                        BaseError::Refused { code, tail }
                    } else if not_run {
                        BaseError::NotRun { code, tail }
                    } else {
                        BaseError::CouldNotRun { code, tail }
                    };
                    e.encode()
                });
                if !r.passed && error.is_none() {
                    red_on_base.push(c.id.clone());
                }
                inner.append(
                    goal,
                    EventKind::BaselineResult {
                        criterion: c.id.clone(),
                        command: command.clone(),
                        base: self.base.clone(),
                        passed: r.passed && error.is_none(),
                        error,
                    },
                )?;
            }
            self.remove(&copied);
        }

        Ok(Ok(red_on_base))
    }

    /// The base phase alone, for the preflight: what keeps the criteria
    /// from running on your own code (worded when read), or `None`.
    pub(super) async fn preflight(&self) -> Result<Option<Preflight>> {
        let criteria = self.criteria_list();
        let red = match self.base_phase(&criteria).await? {
            Err(Outcome::EnvError(why)) => return Ok(Some(Preflight { setup: Some(why), criteria: Vec::new() })),
            Err(_) => Vec::new(),
            Ok(red) => red,
        };
        let stored = self.inner.store(|s| s.baselines(self.goal))?;
        let problems: Vec<BaseProblem> = criteria
            .iter()
            .filter_map(|(c, command, _)| {
                let (cmd, _, error) = stored.get(&c.id)?;
                let error = error.clone().filter(|_| cmd == command)?;
                Some(BaseProblem { id: c.id.clone(), title: c.title.clone(), error })
            })
            .collect();
        if problems.is_empty()
            && let Err(e) = self.perturbation_preflight(&red).await
        {
            // Verification runs the base's side itself then.
            tracing::warn!(goal = %self.goal, error = %e, "perturbation records were not kept");
        }
        Ok((!problems.is_empty()).then_some(Preflight { setup: None, criteria: problems }))
    }

    pub(super) async fn run_all(&self, pin: &str, files: &[tower_core::view::DiffFile]) -> Result<RunAll> {
        let (inner, goal) = (self.inner, self.goal);
        let lang = inner.lang();
        let criteria = self.criteria_list();

        // 1. The base, with your dependencies.
        let red_on_base = match self.base_phase(&criteria).await? {
            Ok(red) => red,
            Err(early) => return Ok((early, Vec::new(), None)),
        };

        // 2. The agent's snapshot.
        let git = inner.git.clone();
        let (dir, ws, p) = (self.dir.clone(), self.ws.clone(), pin.to_string());
        tokio::task::spawn_blocking(move || git.switch_to_pin(&dir, Path::new(&ws), &p))
            .await
            .map_err(|e| invalid(e.to_string()))??;
        // Leftovers of the base phase that git does not track (outputs of the
        // base's criteria) must not leak into the agent's verdict; ignored
        // files such as installed dependencies stay.
        let git = inner.git.clone();
        let dir = self.dir.clone();
        let _ = tokio::task::spawn_blocking(move || git.clean_untracked(&dir)).await;
        let network = setup_may_use_network(inner, &self.rec, goal, Some(pin))?;
        if let Some(setup) = self.setup.clone() {
            let failed = self.setup(network).await;
            inner.append(
                goal,
                EventKind::SetupFinished {
                    command: setup.clone(),
                    ok: failed.is_none(),
                    exit_code: failed.as_ref().and_then(|r| r.exit_code),
                    duration_ms: failed.as_ref().map_or(0, |r| r.duration_ms),
                },
            )?;
            if let Some(r) = failed {
                let tail = tail_lines(&r.output_tail, 20);
                if !network {
                    return Ok((Outcome::SetupNeedsNetwork(tail), Vec::new(), None));
                }
                let detail =
                    tr!(lang, "准备命令 `{setup}` 失败：\n{tail}", "The setup command `{setup}` failed:\n{tail}");
                return Ok((Outcome::EnvError(detail), Vec::new(), None));
            }
        }
        // What is verified is the snapshot, not what setup made of it.
        self.reset(pin).await?;
        let copied = self.local_files(false).await?;
        if !copied.is_empty() {
            inner.append(goal, EventKind::LocalFilesCopied { files: copied.clone() })?;
        }
        let mut failures = Vec::new();
        for (c, command, timeout) in criteria.iter().filter(|(_, command, _)| !names_held_out(&self.holdout, command)) {
            if self.cancel.is_cancelled() {
                return Ok((
                    Outcome::EnvError(tr!(lang, "验证被取消", "Verification was cancelled")),
                    Vec::new(),
                    None,
                ));
            }
            let r = self.exec(command, self.criteria.as_deref(), Duration::from_secs((*timeout).max(1) as u64)).await;
            if r.environment_failure {
                return Ok((self.env_error(&c.id, command, &r), Vec::new(), None));
            }
            inner.append(
                goal,
                EventKind::CriterionResult {
                    criterion: c.id.clone(),
                    pin: pin.into(),
                    passed: r.passed,
                    exit_code: r.exit_code,
                    duration_ms: r.duration_ms,
                    output_tail: r.output_tail.clone(),
                    held_out: false,
                    held_out_proof: None,
                },
            )?;
            if !r.passed {
                failures.push(Failure {
                    id: c.id.clone(),
                    title: c.title.clone(),
                    command: command.clone(),
                    exit_code: r.exit_code,
                    output_tail: r.output_tail,
                });
            }
        }
        let looks: Vec<String> = self
            .rec
            .contract
            .criteria
            .iter()
            .filter(|c| matches!(c.kind, CriterionKind::Look { .. }))
            .map(|c| c.id.clone())
            .collect();
        if let Some(note) = self.capture_looks(&looks, "pin", pin).await? {
            return Ok((Outcome::EnvError(note), Vec::new(), None));
        }
        if !failures.is_empty() {
            return Ok((Outcome::Failed(failures), Vec::new(), None));
        }

        let mut found = Vec::new();
        // 3. The held-out tests, for you only.
        let held_set: Vec<&Exec> = if self.holdout.is_empty() {
            Vec::new()
        } else if criteria.iter().any(|(_, command, _)| names_held_out(&self.holdout, command)) {
            criteria.iter().filter(|(_, command, _)| names_held_out(&self.holdout, command)).collect()
        } else {
            // The project's own test command finds them where they are.
            criteria.iter().collect()
        };
        let mut held_files = Vec::new();
        if !held_set.is_empty() {
            match self.held_out_step(pin, &held_set, &mut found).await? {
                Ok(files) => held_files = files,
                Err(early) => return Ok((early, found, None)),
            }
        }

        // 4. Only the source changes kept.
        let mut paths: Vec<&str> = Vec::new();
        for f in files {
            for p in std::iter::once(f.path.as_str()).chain(f.old_path.as_deref()) {
                if !tower_core::roles::role(p).kept_in_source_only_run(p) && !paths.contains(&p) {
                    paths.push(p);
                }
            }
        }
        if !paths.is_empty() {
            self.reset(pin).await?;
            if !held_files.is_empty() {
                held_files = self.copy_held_out().await?;
            }
            for path in &paths {
                let git = inner.git.clone();
                // From your repository, not the agent's workspace.
                let (root, base, p) = (self.rec.project_root.clone(), self.base.clone(), path.to_string());
                let text = tokio::task::spawn_blocking(move || git.file_at(Path::new(&root), &base, &p))
                    .await
                    .map_err(|e| invalid(e.to_string()))?;
                match text {
                    Some(text) => tower_git::write_inside(&self.dir, path, text.as_bytes())?,
                    None => {
                        let _ = std::fs::remove_file(self.dir.join(path));
                    }
                }
            }
            let profile =
                if held_files.is_empty() { self.criteria.as_deref() } else { self.held_out_profile.as_deref() };
            let mut depends = Vec::new();
            for (c, command, timeout) in &criteria {
                // A command that runs a file no longer there says nothing.
                if paths_gone(&self.dir, command) || (held_files.is_empty() && names_held_out(&self.holdout, command)) {
                    continue;
                }
                let r = self.exec(command, profile, Duration::from_secs((*timeout).max(1) as u64)).await;
                // No verdict is not a pass: this run must say yes.
                let passed = r.passed && !r.environment_failure;
                inner.append(
                    goal,
                    EventKind::OriginalTestsResult { criterion: c.id.clone(), pin: pin.into(), passed },
                )?;
                if !passed {
                    depends.push(c.id.clone());
                }
            }
            if !depends.is_empty() {
                let shown: Vec<&str> = paths.iter().take(12).copied().collect();
                let more = paths.len() - shown.len();
                let mut list = shown.join(", ");
                if more > 0 {
                    list.push_str(&tr!(lang, " 等另外 {more} 个", " and {more} more"));
                }
                let detail = tr!(
                    lang,
                    "{ids} 只有在 Agent 对源码之外的改动下才通过；这些文件恢复成基线版本后失败：{list}",
                    "{ids} pass only with the agent's changes outside the source code, and fail with these files as they were on the base: {list}",
                    ids = depends.join(", ")
                );
                let hit = sentinel_hit("passes_only_with_non_source_changes", detail, lang);
                append_hit(inner, goal, &hit)?;
                found.push(hit);
            }
        }

        // 5. A test that must fail: for the criteria that proved the change,
        // and for those whose base did not run (their pass is all there is;
        // never dropped silently — a canary that cannot run says so).
        let not_run_on_base: Vec<String> = inner
            .store(|s| s.detail(goal))?
            .criteria
            .into_iter()
            .filter(|c| c.base_error.is_some())
            .map(|c| c.criterion.id)
            .collect();
        let proving: Vec<&Exec> = criteria
            .iter()
            .filter(|(c, ..)| {
                held_set.iter().any(|(h, ..)| h.id == c.id)
                    || red_on_base.contains(&c.id)
                    || not_run_on_base.contains(&c.id)
            })
            .collect();
        if !proving.is_empty() {
            let git = inner.git.clone();
            let dir = self.dir.clone();
            let mut candidates =
                tokio::task::spawn_blocking(move || git.ls_files(&dir)).await.map_err(|e| invalid(e.to_string()))??;
            candidates.extend(held_files.iter().cloned());
            let canary = crate::canary::plant(&self.dir, &candidates, &self.tmp)?;
            let profile =
                if held_files.is_empty() { self.criteria.as_deref() } else { self.held_out_profile.as_deref() };
            let mut tripped = Vec::new();
            let mut refused = Vec::new();
            for (c, command, timeout) in &proving {
                let held_out_missing = held_files.is_empty() && names_held_out(&self.holdout, command);
                let runnable = !canary.files.is_empty() && !paths_gone(&self.dir, command) && !held_out_missing;
                let state = if runnable {
                    canary.clear();
                    let r = self.exec(command, profile, Duration::from_secs((*timeout).max(1) as u64)).await;
                    match canary.verdict(r.passed) {
                        crate::canary::Verdict::Tampered => CanaryState::Tampered,
                        // Refused or killed where the same command just
                        // passed: nothing was shown, and that is a finding.
                        _ if r.environment_failure => {
                            refused.push(c.id.clone());
                            CanaryState::NotChecked
                        }
                        crate::canary::Verdict::Intact => CanaryState::Intact,
                        crate::canary::Verdict::NotChecked => CanaryState::NotChecked,
                    }
                } else {
                    CanaryState::NotChecked
                };
                inner.append(goal, EventKind::CanaryChecked { criterion: c.id.clone(), pin: pin.into(), state })?;
                if state == CanaryState::Tampered {
                    tripped.push(c.id.clone());
                }
            }
            canary.clear();
            if !refused.is_empty() {
                let detail = tr!(
                    lang,
                    "{ids} 刚刚通过，但加入必然失败的测试后同一命令没能跑完（被拒绝或被终止），断言没能检查。",
                    "{ids} had just passed, but with the must-fail tests added the same command could not finish (refused or stopped), so its assertions were not checked.",
                    ids = refused.join(", ")
                );
                let hit = sentinel_hit("assertions_unchecked", detail, lang);
                append_hit(inner, goal, &hit)?;
                found.push(hit);
            }
            if !tripped.is_empty() {
                let detail = tr!(
                    lang,
                    "Tower 在测试文件里加了必然失败的断言（用的是测试自己用的那些断言），{ids} 运行时它们没有失败，或者命令仍然报告通过。断言、测试框架或结果报告在运行时被改动了，这次验证的“通过”都不能当作事实。",
                    "Tower added assertions that must fail to the test files (the same assertions the tests use), and while {ids} ran they did not fail, or the command still reported success. Assertions, the test runner or its reporting were altered at run time; none of this verification's passes count as evidence.",
                    ids = tripped.join(", ")
                );
                let hit = sentinel_hit("assertions_disabled", detail, lang);
                append_hit(inner, goal, &hit)?;
                found.push(hit);
            }
        }

        // 6. Inputs moved: general, or fitted to the tests?
        let report = self.perturbation(pin, &criteria, &red_on_base, &held_files, files).await?;

        // What Tower's guard saw of the assertion entry points, across
        // every command that ran on the agent's snapshot.
        found.extend(self.assertion_identity(&criteria)?);
        Ok((Outcome::Passed, found, Some(report)))
    }

    /// The invariant Tower checks while the criteria run: the assertion
    /// entry points and the runners' globals the tests use are the
    /// library's own objects. A break is high severity; a command the
    /// guard cannot cover is said so rather than passed over.
    fn assertion_identity(&self, criteria: &[Exec]) -> Result<Found> {
        let (inner, goal, lang) = (self.inner, self.goal, self.inner.lang());
        let Some(guard) = &self.guard else { return Ok(Vec::new()) };
        let report = guard.read(Phase::Pin);
        let mut found = Vec::new();
        if report.broken() {
            let hit = sentinel_hit("assertions_replaced", report.detail(lang), lang);
            append_hit(inner, goal, &hit)?;
            found.push(hit);
            return Ok(found);
        }
        // Honest about coverage: a compiled language has no hook to load a
        // check before the test code, and a guarded runner that reported
        // nothing was not checked either.
        let gaps: Vec<(String, Coverage)> = criteria
            .iter()
            .map(|(_, command, _)| (command.clone(), guard::coverage(command)))
            .filter(|(_, c)| matches!(c, Coverage::NoHook(_)) || (*c == Coverage::Guarded && report.finished == 0))
            .collect();
        if let Some(detail) = guard::unchecked_detail(&gaps, lang) {
            let hit = tower_core::sentinel::SentinelHit {
                sentinel: "assertion_identity_unchecked".into(),
                severity: 2,
                title: tower_core::i18n::sentinel_title("assertion_identity_unchecked", lang)
                    .unwrap_or_default()
                    .into(),
                detail,
            };
            append_hit(inner, goal, &hit)?;
            found.push(hit);
        }
        Ok(found)
    }
}
