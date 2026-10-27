//! The verification workbench: one clean checkout and one package cache
//! per verification, used step by step in order of trust.

use std::path::Path;
use std::sync::Arc;
use std::time::Duration;

use tower_core::contract::CriterionKind;
use tower_core::view::CanaryState;
use tower_core::{EventKind, Lang, tr};
use tower_git::Git;
use tower_verify::{Cancel, RunSpec};

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
///    proved the change once more: it must fail.
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
    env: Vec<(String, String)>,
    online: Option<std::path::PathBuf>,
    offline: Option<std::path::PathBuf>,
    criteria: Option<std::path::PathBuf>,
    /// Criteria with the held-out tests present: never the network.
    held_out_profile: Option<std::path::PathBuf>,
    setup: Option<String>,
    /// The project's held-out test patterns.
    holdout: Vec<String>,
    cancel: &'a Cancel,
    _cache: RemoveOnDrop,
}

/// What a step found besides the verdict.
pub(super) type Found = Vec<tower_core::sentinel::SentinelHit>;

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
        ];
        for r in &roots {
            let _ = std::fs::remove_dir_all(r);
        }
        let [dir, tmp, cache] = roots.map(|r| r.join(short));
        let git = inner.git.clone();
        let (root1, base1, dir1) = (rec.project_root.clone(), base.to_string(), dir.clone());
        tokio::task::spawn_blocking(move || git.trusted_checkout(Path::new(&root1), &base1, &dir1))
            .await
            .map_err(|e| invalid(e.to_string()))??;
        let cleanup = RemoveOnDrop(cache.clone());
        let goal_dir = inner.paths.goal_dir(goal);
        let online = run::verifier_jail(inner, &goal_dir, &dir, &tmp, &cache, "verify-setup", true)?;
        let offline = run::verifier_jail(inner, &goal_dir, &dir, &tmp, &cache, "verify-setup-offline", false)?;
        let criteria = run::verifier_jail(inner, &goal_dir, &dir, &tmp, &cache, "verify", rec.contract.network)?;
        let held_out = run::verifier_jail(inner, &goal_dir, &dir, &tmp, &cache, "verify-held-out", false)?;
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
            env,
            online: online.profile,
            offline: offline.profile,
            criteria: criteria.profile,
            held_out_profile: held_out.profile,
            setup,
            holdout,
            cancel,
            _cache: cleanup,
        })
    }

    pub(super) async fn close(&self) {
        let (dir, tmp, cache) = (self.dir.clone(), self.tmp.clone(), self._cache.0.clone());
        let _ = tokio::task::spawn_blocking(move || {
            stop_survivors(&[dir.clone(), tmp.clone(), cache.clone()]);
            for d in [&dir, &tmp, &cache] {
                let _ = std::fs::remove_dir_all(d);
            }
        })
        .await;
    }

    async fn exec(&self, command: &str, profile: Option<&Path>, timeout: Duration) -> Ran {
        let spec = RunSpec::new(command_for(command, profile), &self.dir, self.env.clone(), timeout);
        let r = tower_verify::run(&spec, self.cancel).await;
        // A refusal counts only when Tower sees it itself: a path the
        // output names that Tower can read and the same sandbox cannot.
        let denied = !r.passed()
            && crate::run::sandbox_denied(&r.output_tail)
            && confirmed_refusal(&r.output_tail, profile, &self.dir).await.is_some();
        Ran {
            passed: r.passed(),
            environment_failure: r.is_environment_failure() || denied,
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
        let r = self.exec(setup, profile, SETUP_TIMEOUT).await;
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

    /// Screenshots for `look` criteria on the current checkout.
    async fn capture_looks(&self, ids: &[String], side: &str, rev: &str) -> Result<()> {
        for c in self.rec.contract.criteria.iter().filter(|c| ids.contains(&c.id)) {
            let CriterionKind::Look { start, url, timeout_secs } = &c.kind else { continue };
            let short: String = rev.chars().take(10).collect();
            let out =
                self.inner.paths.root.join("evidence").join(self.goal).join(format!("{}-{side}-{short}.png", c.id));
            let r = crate::look::capture(
                &self.dir,
                &self.env,
                self.criteria.as_deref(),
                start,
                url,
                Duration::from_secs((*timeout_secs).max(5) as u64),
                self.rec.contract.network,
                &out,
            )
            .await;
            let (file, error) = match r {
                Ok(p) => (Some(p.display().to_string()), None),
                Err(e) => (None, Some(e)),
            };
            self.inner.append(
                self.goal,
                EventKind::LookCaptured { criterion: c.id.clone(), side: side.into(), pin: rev.into(), file, error },
            )?;
        }
        Ok(())
    }

    fn env_error(&self, id: &str, command: &str, r: &Ran) -> Outcome {
        let lang = self.inner.lang();
        let how = match r.exit_code {
            Some(code) => tr!(lang, "退出码 {code}", "exit code {code}"),
            None => tr!(lang, "未启动", "did not start"),
        };
        let tail = tail_lines(&r.output_tail, 20);
        if r.denied {
            return Outcome::EnvError(tr!(
                lang,
                "{id} 的命令 `{command}` 在验证沙箱里被拒绝访问了它需要的东西（{how}）。这不是测试失败：看一下下面被拒绝的路径，必要时把它加入项目设置。\n{tail}",
                "The sandbox refused something the command `{command}` of {id} needed ({how}). This is not a test failure: check the refused path below and add it to the project settings if it belongs.\n{tail}"
            ));
        }
        Outcome::EnvError(tr!(
            lang,
            "{id} 的命令 `{command}` 无法运行（{how}）：\n{tail}",
            "The command `{command}` of {id} could not run ({how}):\n{tail}"
        ))
    }

    /// The base commit — your content — with your dependencies: setup with
    /// the network, then the criteria that have no baseline yet (red →
    /// green evidence) and the `look` screenshots of the base. The criteria
    /// that failed there, or the outcome that ends verification early.
    pub(super) async fn base_phase(&self, criteria: &[Exec]) -> Result<std::result::Result<Vec<String>, Outcome>> {
        let (inner, goal) = (self.inner, self.goal);
        let lang = inner.lang();
        if let Some(r) = self.setup(true).await {
            let tail = tail_lines(&r.output_tail, 20);
            let setup = self.setup.clone().unwrap_or_default();
            return Ok(Err(Outcome::EnvError(tr!(
                lang,
                "准备命令 `{setup}` 在基线提交上就失败了（与 Agent 的改动无关）：\n{tail}",
                "The setup command `{setup}` fails on the base commit itself (not because of the agent's changes):\n{tail}"
            ))));
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
            self.capture_looks(&looks_missing, "base", &self.base.clone()).await?;
            self.remove(&copied);
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
                let r =
                    self.exec(command, self.criteria.as_deref(), Duration::from_secs((*timeout).max(1) as u64)).await;
                // Recorded either way: "could not check" is information too.
                let error = r.environment_failure.then(|| {
                    let code = r.exit_code.map_or_else(|| "did not start".to_string(), |c| format!("exit code {c}"));
                    let why = if r.denied { "the sandbox refused something it needed" } else { "could not run" };
                    format!("{why} on the base ({code}): {}", tail_lines(&r.output_tail, 3))
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
    /// from running on your own code, in words, or `None`.
    pub(super) async fn preflight(&self) -> Result<Option<String>> {
        let criteria = self.criteria_list();
        if let Err(Outcome::EnvError(why)) = self.base_phase(&criteria).await? {
            return Ok(Some(why));
        }
        let detail = self.inner.store(|s| s.detail(self.goal))?;
        let errors: Vec<String> = detail
            .criteria
            .iter()
            .filter_map(|c| c.base_error.as_ref().map(|e| format!("{} · {}: {e}", c.criterion.id, c.criterion.title)))
            .collect();
        Ok((!errors.is_empty()).then(|| errors.join("\n")))
    }

    pub(super) async fn run_all(&self, pin: &str, files: &[tower_core::view::DiffFile]) -> Result<(Outcome, Found)> {
        let (inner, goal) = (self.inner, self.goal);
        let lang = inner.lang();
        let criteria = self.criteria_list();

        // 1. The base, with your dependencies.
        let red_on_base = match self.base_phase(&criteria).await? {
            Ok(red) => red,
            Err(early) => return Ok((early, Vec::new())),
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
                    return Ok((Outcome::SetupNeedsNetwork(tail), Vec::new()));
                }
                let detail =
                    tr!(lang, "准备命令 `{setup}` 失败：\n{tail}", "The setup command `{setup}` failed:\n{tail}");
                return Ok((Outcome::EnvError(detail), Vec::new()));
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
                return Ok((Outcome::EnvError(tr!(lang, "验证被取消", "Verification was cancelled")), Vec::new()));
            }
            let r = self.exec(command, self.criteria.as_deref(), Duration::from_secs((*timeout).max(1) as u64)).await;
            if r.environment_failure {
                return Ok((self.env_error(&c.id, command, &r), Vec::new()));
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
        self.capture_looks(&looks, "pin", pin).await?;
        if !failures.is_empty() {
            return Ok((Outcome::Failed(failures), Vec::new()));
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
            self.reset(pin).await?;
            held_files = self.copy_held_out().await?;
            let mut held_failures = Vec::new();
            for (c, command, timeout) in &held_set {
                let r = self
                    .exec(command, self.held_out_profile.as_deref(), Duration::from_secs((*timeout).max(1) as u64))
                    .await;
                if r.environment_failure {
                    return Ok((self.env_error(&c.id, command, &r), found));
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
                        held_out: true,
                    },
                )?;
                if !r.passed {
                    held_failures.push(Failure {
                        id: c.id.clone(),
                        title: c.title.clone(),
                        command: command.clone(),
                        exit_code: r.exit_code,
                        output_tail: r.output_tail,
                    });
                }
            }
            // The tests themselves must come out as they went in.
            let root = Path::new(&self.rec.project_root);
            let changed = held_files
                .iter()
                .filter(|f| std::fs::read(root.join(f)).ok() != std::fs::read(self.dir.join(f)).ok())
                .count();
            if changed > 0 {
                let detail = tr!(
                    lang,
                    "运行期间有 {changed} 个保留测试文件被改写（为了不让 Agent 知道，这里不列出文件名）",
                    "{changed} held-out test file(s) were rewritten while the criteria ran (not named here, so the agent cannot learn them)"
                );
                let hit = sentinel_hit("held_out_tests_changed", detail, lang);
                append_hit(inner, goal, &hit)?;
                found.push(hit);
            }
            if !held_failures.is_empty() {
                return Ok((Outcome::HeldOutFailed(held_failures), found));
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

        // 5. A test that must fail.
        let proving: Vec<&Exec> = criteria
            .iter()
            .filter(|(c, ..)| held_set.iter().any(|(h, ..)| h.id == c.id) || red_on_base.contains(&c.id))
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
        Ok((Outcome::Passed, found))
    }
}

/// A command names a file that is not in the checkout (`node --test x.test.js`
/// after the agent's new test was taken out): running it proves nothing.
/// The first path an output says was refused that Tower itself can read
/// while the same sandbox profile cannot — a refusal Tower observed, not
/// one the command merely printed. Paths inside the checkout never count
/// (the sandbox allows them; a test's own permission error is a test).
pub(super) async fn confirmed_refusal(output: &str, profile: Option<&Path>, dir: &Path) -> Option<String> {
    let profile = profile?;
    let mut candidates: Vec<String> = Vec::new();
    for line in output.lines().filter(|l| {
        let l = l.to_ascii_lowercase();
        l.contains("operation not permitted") || l.contains("eperm")
    }) {
        for word in line.split(|c: char| c.is_whitespace() || matches!(c, '\'' | '"' | ',' | '(' | ')' | '`')) {
            let w = word.trim_end_matches(':');
            if w.starts_with('/') && !candidates.iter().any(|c| c == w) {
                candidates.push(w.to_string());
            }
        }
    }
    let real_dir = crate::paths::real(dir);
    for path in candidates.into_iter().take(5) {
        let p = Path::new(&path);
        if crate::paths::real(p).starts_with(&real_dir) || std::fs::symlink_metadata(p).is_err() {
            continue;
        }
        let is_dir = p.is_dir();
        let probe = if is_dir {
            format!("/bin/ls {}", shell_quote(&path))
        } else {
            format!("/usr/bin/head -c 0 {}", shell_quote(&path))
        };
        let out = tokio::process::Command::new("/usr/bin/sandbox-exec")
            .arg("-f")
            .arg(profile)
            .args(["/bin/sh", "-c", &probe])
            .stdout(std::process::Stdio::null())
            .stderr(std::process::Stdio::piped())
            .output()
            .await
            .ok()?;
        let refused = !out.status.success() && String::from_utf8_lossy(&out.stderr).contains("Operation not permitted");
        if refused {
            return Some(path);
        }
    }
    None
}

fn shell_quote(s: &str) -> String {
    format!("'{}'", s.replace('\'', "'\\''"))
}

pub(super) fn paths_gone(dir: &Path, command: &str) -> bool {
    command
        .split_whitespace()
        .map(|w| w.trim_matches(|c| c == '\'' || c == '"'))
        .filter(|w| w.contains('/') && !w.starts_with('-') && !w.starts_with('/') && !w.contains(['*', '=']))
        .any(|w| !dir.join(w.trim_start_matches("./")).exists())
}

pub(super) fn sentinel_hit(id: &str, detail: String, lang: Lang) -> tower_core::sentinel::SentinelHit {
    tower_core::sentinel::SentinelHit {
        sentinel: id.into(),
        severity: tower_core::sentinel::HIGH,
        title: tower_core::i18n::sentinel_title(id, lang).unwrap_or(id).into(),
        detail,
    }
}

/// Stops whatever a verification started and left running (a server, a
/// daemonised watcher): every process whose working directory or open
/// files are inside the verification's directories. (One that leaves them
/// entirely can only write to those directories, which are deleted and
/// never reused.)
fn stop_survivors(dirs: &[std::path::PathBuf]) {
    let prefixes: Vec<String> =
        dirs.iter().map(|d| format!("{}/", crate::paths::real(d).display())).filter(|p| p.len() > 2).collect();
    let Ok(out) = std::process::Command::new("/usr/sbin/lsof").args(["-n", "-P", "-w", "-F", "pn"]).output() else {
        return;
    };
    let me = std::process::id();
    let mut pid = 0u32;
    let mut doomed = std::collections::BTreeSet::new();
    for line in String::from_utf8_lossy(&out.stdout).lines() {
        if let Some(p) = line.strip_prefix('p') {
            pid = p.parse().unwrap_or(0);
        } else if let Some(name) = line.strip_prefix('n')
            && pid > 1
            && pid != me
            && prefixes.iter().any(|p| name.starts_with(p.as_str()) || format!("{name}/") == *p)
        {
            doomed.insert(pid);
        }
    }
    for pid in doomed {
        let _ = std::process::Command::new("/bin/kill").args(["-KILL", &pid.to_string()]).status();
    }
}

/// Removes a directory when dropped (best effort).
struct RemoveOnDrop(std::path::PathBuf);

impl Drop for RemoveOnDrop {
    fn drop(&mut self) {
        let _ = std::fs::remove_dir_all(&self.0);
    }
}
