//! Step 2 flaky-test rerun and Step 4 source-only re-run (including AST-based
//! restoration of inline Rust `#[cfg(test)]` regions inside `.rs` source files).

use std::path::Path;
use std::time::Duration;

use tower_core::view::FileStatus;
use tower_core::{EventKind, tr};

use super::checks::{paths_gone, sentinel_hit};
use super::{Bench, Exec, Found, Ran};
use crate::verify::{append_hit, names_held_out};
use crate::{Result, invalid};

/// Whether visible criteria get a single automatic rerun on their first failure
/// to distinguish flaky tests from real regressions.
///
/// Defaults to `true`; can be disabled via `TOWER_FLAKY_RERUN=0` / `false`
/// (and wired to `Settings.flaky_rerun` during integration).
pub(super) fn flaky_rerun_enabled() -> bool {
    match std::env::var("TOWER_FLAKY_RERUN") {
        Ok(v) => !matches!(v.trim().to_ascii_lowercase().as_str(), "0" | "false" | "off" | "no"),
        Err(_) => true,
    }
}

impl Bench<'_> {
    /// Runs a visible criterion on the snapshot, performing one automatic rerun
    /// when the first run fails (not an environment failure) and `flaky_rerun`
    /// is enabled. If attempt 1 fails and attempt 2 passes, records the criterion
    /// as flaky while preserving BOTH outputs so the rework budget is not burned.
    pub(super) async fn run_visible_criterion(
        &self,
        pin: &str,
        c: &tower_core::contract::Criterion,
        command: &str,
        timeout: Duration,
    ) -> Result<std::result::Result<Ran, Ran>> {
        let r = self.exec(command, self.criteria.as_deref(), timeout).await;
        if r.environment_failure || r.passed || !flaky_rerun_enabled() || self.cancel.is_cancelled() {
            return Ok(if r.environment_failure { Err(r) } else { Ok(r) });
        }

        // First attempt failed deterministically (not env error): rerun once to check flakiness.
        let r2 = self.exec(command, self.criteria.as_deref(), timeout).await;
        if r2.environment_failure {
            return Ok(Err(r2));
        }
        if !r2.passed {
            // Failed twice: genuine failure, keep the first failure output (or second if clearer).
            return Ok(Ok(r));
        }

        // Failed first, passed on immediate 1x rerun: record as flaky with BOTH outputs preserved.
        let lang = self.inner.lang();
        let first_code = r.exit_code.map_or_else(|| "?".to_string(), |n| n.to_string());
        let note = tr!(
            lang,
            "[flaky] 标准 {id}（`{command}`）首次失败（退出码 {first_code}），立即重跑 1 次后通过。保留两次输出以供核对，未消耗自动返工额度。\n--- 第 1 次（失败）---\n{first}\n--- 第 2 次（通过）---\n{second}",
            "[flaky] Criterion {id} (`{command}`) failed on attempt 1 (exit {first_code}) and passed on immediate 1x rerun. Both outputs preserved; automatic rework budget was not spent.\n--- Attempt 1 (failed) ---\n{first}\n--- Attempt 2 (passed) ---\n{second}",
            id = c.id,
            first = r.output_tail,
            second = r2.output_tail
        );
        self.inner.append(self.goal, EventKind::Note { text: note })?;
        // Integration hook: emit `EventKind::CriterionFlaky { criterion: c.id.clone(), pin: pin.into(), first_output_tail: r.output_tail.clone() }` once merged with `core-store-backend`.
        let _ = pin;

        let combined_tail = format!(
            "[flaky: attempt 1 failed (exit {first_code}), attempt 2 passed]\n--- attempt 1 (failed) ---\n{}\n--- attempt 2 (passed) ---\n{}",
            r.output_tail, r2.output_tail
        );
        Ok(Ok(Ran {
            passed: true,
            environment_failure: false,
            denied: false,
            exit_code: r2.exit_code,
            duration_ms: r.duration_ms + r2.duration_ms,
            output_tail: combined_tail,
        }))
    }

    /// Step 4: Only the agent's source changes kept — non-source files are
    /// restored from base, and modified Rust `.rs` source files have their
    /// inline `#[cfg(test)]` / `#[test]` regions restored to base via `tower-ast`.
    pub(super) async fn source_only_step(
        &self,
        pin: &str,
        criteria: &[Exec],
        files: &[tower_core::view::DiffFile],
        held_files: &mut Vec<String>,
        found: &mut Found,
    ) -> Result<()> {
        let (inner, goal, lang) = (self.inner, self.goal, self.inner.lang());
        let mut paths: Vec<&str> = Vec::new();
        for f in files {
            for p in std::iter::once(f.path.as_str()).chain(f.old_path.as_deref()) {
                if !tower_core::roles::role(p).kept_in_source_only_run(p) && !paths.contains(&p) {
                    paths.push(p);
                }
            }
        }

        // Check modified `.rs` source files for tampered inline `#[cfg(test)]` / `#[test]` regions.
        let mut rust_inline_restores: Vec<(String, String)> = Vec::new();
        for f in files.iter().filter(|f| {
            f.status == FileStatus::Modified
                && f.path.ends_with(".rs")
                && tower_core::roles::role(&f.path) == tower_core::roles::Role::Source
        }) {
            let git = inner.git.clone();
            let (root, base, p) = (self.rec.project_root.clone(), self.base.clone(), f.path.clone());
            let base_src = tokio::task::spawn_blocking(move || git.file_at(Path::new(&root), &base, &p))
                .await
                .map_err(|e| invalid(e.to_string()))?;
            let Some(base_src) = base_src else { continue };
            let git2 = inner.git.clone();
            let (ws, pin_rev, p2) = (self.ws.clone(), pin.to_string(), f.path.clone());
            let pin_src = tokio::task::spawn_blocking(move || git2.file_at(Path::new(&ws), &pin_rev, &p2))
                .await
                .map_err(|e| invalid(e.to_string()))?;
            let Some(pin_src) = pin_src else { continue };
            let restored = tower_ast::restore_rust_test_regions(&base_src, &pin_src);
            if restored != pin_src {
                rust_inline_restores.push((f.path.clone(), restored));
            }
        }

        if paths.is_empty() && rust_inline_restores.is_empty() {
            return Ok(());
        }

        self.reset(pin).await?;
        if !held_files.is_empty() {
            *held_files = self.copy_held_out().await?;
        }
        for path in &paths {
            let git = inner.git.clone();
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
        for (path, restored) in &rust_inline_restores {
            tower_git::write_inside(&self.dir, path, restored.as_bytes())?;
        }

        let profile = if held_files.is_empty() { self.criteria.as_deref() } else { self.held_out_profile.as_deref() };
        let mut depends = Vec::new();
        for (c, command, timeout) in criteria {
            if paths_gone(&self.dir, command) || (held_files.is_empty() && names_held_out(&self.holdout, command)) {
                continue;
            }
            let r = self.exec(command, profile, Duration::from_secs((*timeout).max(1) as u64)).await;
            let passed = r.passed && !r.environment_failure;
            inner.append(goal, EventKind::OriginalTestsResult { criterion: c.id.clone(), pin: pin.into(), passed })?;
            if !passed {
                depends.push(c.id.clone());
            }
        }
        if !depends.is_empty() {
            let mut all_restored: Vec<String> = paths.iter().map(|p| (*p).to_string()).collect();
            for (p, _) in &rust_inline_restores {
                all_restored.push(format!("{p} (inline #[cfg(test)])"));
            }
            let shown: Vec<&str> = all_restored.iter().take(12).map(String::as_str).collect();
            let more = all_restored.len() - shown.len();
            let mut list = shown.join(", ");
            if more > 0 {
                list.push_str(&tr!(lang, " 等另外 {more} 个", " and {more} more"));
            }
            let detail = tr!(
                lang,
                "{ids} 只有在 Agent 对源码之外（或内联测试区域）的改动下才通过；这些文件恢复成基线版本后失败：{list}",
                "{ids} pass only with the agent's changes outside the source code (or inside inline test blocks), and fail with these files as they were on the base: {list}",
                ids = depends.join(", ")
            );
            let hit = sentinel_hit("passes_only_with_non_source_changes", detail, lang);
            append_hit(inner, goal, &hit)?;
            found.push(hit);
        }
        Ok(())
    }
}
