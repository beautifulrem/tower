//! Runs a project's test command on a clean copy of its base branch, in the
//! sandbox, when the project is added (and on request). A first goal then
//! starts from known ground: "the tests pass", "they already fail", or "the
//! test setup does not work here" — before any agent is involved.

use std::path::{Path, PathBuf};
use std::sync::Arc;
use std::time::Duration;

use tower_core::tr;
use tower_core::view::{HoldoutDraft, TestCheck};
use tower_git::Git;
use tower_store::ProjectPatch;
use tower_verify::{Cancel, RunSpec};

use crate::{Inner, Result, Supervisor, invalid, run, verify};

const SETUP_TIMEOUT: Duration = Duration::from_secs(15 * 60);
const TEST_TIMEOUT: Duration = Duration::from_secs(15 * 60);

/// Starts the check in the background; the project view updates when it ends.
pub fn spawn(inner: Arc<Inner>, project_id: String) {
    tokio::spawn(async move {
        if let Err(e) = check(&inner, &project_id).await {
            tracing::info!(project = %project_id, error = %e, "project check did not run");
        }
        inner.emit_projects();
    });
}

async fn check(inner: &Arc<Inner>, project_id: &str) -> Result<()> {
    let project = inner.store(|s| s.project(project_id))?;
    let Some(command) = project.test_command.clone().filter(|c| !c.trim().is_empty()) else { return Ok(()) };
    let root = PathBuf::from(&project.root);
    let base = inner.git.resolve(&root, &project.base_branch)?;
    let started = tower_store::system_now();
    let mut result = TestCheck {
        command: command.clone(),
        passed: None,
        env_error: false,
        base: base.clone(),
        duration_ms: 0,
        output_tail: String::new(),
        at: started,
    };
    inner.store(|s| s.set_test_check(project_id, &result))?;
    inner.emit_projects();

    let work = inner.paths.root.join("checks").join(project_id);
    let _ = std::fs::remove_dir_all(&work);
    let dir = work.join("repo");
    let tmp = work.join("tmp");
    let cache = work.join("cache");
    let git = inner.git.clone();
    let (root2, branch, dir2) = (root.clone(), project.base_branch.clone(), dir.clone());
    tokio::task::spawn_blocking(move || git.prepare_workspace(&root2, &branch, &dir2, "check"))
        .await
        .map_err(|e| invalid(e.to_string()))??;

    let outcome = async {
        let mut env = inner.env.without_credentials();
        env.push(("CI".into(), "1".into()));
        // The base's dependencies are the user's own: setup may use the network.
        let dirs = run::Dirs { work: &dir, tmp: &tmp, cache: &cache };
        let online = run::Net { network: true, ..Default::default() };
        let setup_jail = run::verifier_jail(inner, &work, &dirs, "check-setup", &online, &Default::default())?;
        let jail = run::verifier_jail(inner, &work, &dirs, "check", &run::Net::default(), &Default::default())?;
        let mut test_env = env.clone();
        test_env.extend(jail.env);
        env.extend(setup_jail.env);
        let setup = Some(project.setup_command.clone())
            .filter(|s| !s.trim().is_empty())
            .or_else(|| Git::detect_setup_command(&dir));
        let cancel = Cancel::default();
        if let Some(setup) = setup {
            let spec =
                RunSpec::new(verify::command_for(&setup, setup_jail.profile.as_deref()), &dir, env, SETUP_TIMEOUT);
            let r = tower_verify::run(&spec, &cancel).await;
            if !r.passed() {
                return Ok::<_, crate::Error>((false, true, r.duration_ms, format!("$ {setup}\n{}", r.output_tail)));
            }
        }
        copy_local_files(inner, &project.root, &project.local_files, &dir).await?;
        let spec = RunSpec::new(verify::command_for(&command, jail.profile.as_deref()), &dir, test_env, TEST_TIMEOUT);
        let r = tower_verify::run(&spec, &cancel).await;
        Ok((r.passed(), r.is_environment_failure(), r.duration_ms, r.output_tail))
    }
    .await;
    let _ = std::fs::remove_dir_all(&work);
    let (passed, env_error, duration_ms, output_tail) = outcome?;
    result.passed = Some(passed && !env_error);
    result.env_error = env_error;
    result.duration_ms = duration_ms;
    result.output_tail = output_tail;
    inner.store(|s| s.set_test_check(project_id, &result))?;
    Ok(())
}

async fn copy_local_files(inner: &Arc<Inner>, root: &str, patterns: &[String], dest: &Path) -> Result<()> {
    if patterns.is_empty() {
        return Ok(());
    }
    let git = inner.git.clone();
    let (root, dest, patterns) = (PathBuf::from(root), dest.to_path_buf(), patterns.to_vec());
    tokio::task::spawn_blocking(move || git.copy_local_files(&root, &dest, &patterns))
        .await
        .map_err(|e| invalid(e.to_string()))??;
    Ok(())
}

impl Supervisor {
    /// Deterministically proposes human-reviewable synthetic holdout test drafts
    /// for `project_id` based on the repository toolchain and contract intent.
    /// Drafts are NEVER written or activated until the human explicitly ratifies them.
    pub async fn generate_holdout_drafts(&self, project_id: &str, intent: &str) -> Result<Vec<HoldoutDraft>> {
        let project = self.inner.read_store(|s| s.project(project_id))?;
        let root = PathBuf::from(&project.root);
        let intent = intent.trim().to_string();
        let lang = self.inner.lang();
        tokio::task::spawn_blocking(move || {
            let existing_tests = collect_visible_test_files(&root, 8);
            let synthesized = crate::verify::holdout_synth::synthesize_holdout_drafts(&intent, &existing_tests, 3);
            if !synthesized.is_empty() {
                return synthesized
                    .into_iter()
                    .map(|d| HoldoutDraft { id: d.id, filename: d.filename, rationale: d.rationale, code: d.code })
                    .collect();
            }
            let mut drafts = Vec::new();
            let slug: String = intent
                .chars()
                .map(|c| if c.is_ascii_alphanumeric() { c.to_ascii_lowercase() } else { '_' })
                .take(24)
                .collect::<String>()
                .trim_matches('_')
                .to_string();
            let stem = if slug.len() >= 3 { slug } else { "contract_check".into() };
            let is_node = root.join("package.json").is_file();
            let is_py = root.join("pyproject.toml").is_file() || root.join("pytest.ini").is_file();
            let is_rust = root.join("Cargo.toml").is_file();

            if is_node {
                drafts.push(HoldoutDraft {
                    id: format!("draft_{stem}_edge"),
                    filename: format!("holdout/{stem}_edge.test.mjs"),
                    rationale: tr!(
                        lang,
                        "针对合同意图的边界输入与反硬编码保留用例草案（仅人工批准后写入 holdout/）",
                        "Boundary & anti-hardcoding holdout test draft derived from contract intent (written to holdout/ only after human ratification)"
                    ),
                    code: format!(
                        "// Draft holdout test for: {intent}\n// Review and adapt imports/assertions before ratifying.\nimport test from 'node:test';\nimport assert from 'node:assert/strict';\n\ntest('handles unseen boundary inputs for {stem}', () => {{\n  // TODO: import target function and assert edge/randomized inputs not in visible tests.\n  assert.ok(true);\n}});\n"
                    ),
                });
                drafts.push(HoldoutDraft {
                    id: format!("draft_{stem}_prop"),
                    filename: format!("holdout/{stem}_invariant.test.mjs"),
                    rationale: tr!(
                        lang,
                        "针对不变量（幂等/单调/非负等）的属性检验保留用例草案",
                        "Invariant / property-style holdout draft checking general behaviour beyond literal fixtures"
                    ),
                    code: format!(
                        "// Invariant holdout test for: {intent}\nimport test from 'node:test';\nimport assert from 'node:assert/strict';\n\ntest('preserves contract invariant across multiple inputs', () => {{\n  for (const sample of [0, 1, 7, 42, 999]) {{\n    assert.equal(typeof sample, 'number');\n  }}\n}});\n"
                    ),
                });
            } else if is_py {
                drafts.push(HoldoutDraft {
                    id: format!("draft_{stem}_edge"),
                    filename: format!("holdout/test_{stem}_holdout.py"),
                    rationale: tr!(
                        lang,
                        "Python 保留测试边界用例草案（人审确认后启用）",
                        "Python boundary holdout test draft (activated only after human ratification)"
                    ),
                    code: format!(
                        "# Draft holdout test for: {intent}\ndef test_{stem}_unseen_inputs():\n    # Replace with assertions on unseen inputs.\n    assert True\n"
                    ),
                });
            } else if is_rust {
                drafts.push(HoldoutDraft {
                    id: format!("draft_{stem}_edge"),
                    filename: format!("holdout/{stem}_holdout.rs"),
                    rationale: tr!(
                        lang,
                        "Rust 保留测试草案（人审确认后写入 holdout/）",
                        "Rust holdout test draft (written to holdout/ only after human ratification)"
                    ),
                    code: format!(
                        "// Draft holdout test for: {intent}\n#[test]\nfn {stem}_unseen_boundary_inputs() {{\n    // Replace with assertions on unseen inputs.\n}}\n"
                    ),
                });
            } else {
                drafts.push(HoldoutDraft {
                    id: format!("draft_{stem}_shell"),
                    filename: format!("holdout/{stem}_check.sh"),
                    rationale: tr!(
                        lang,
                        "通用脚本保留检查草案（人审确认后写入 holdout/）",
                        "Shell holdout check draft (written to holdout/ only after human ratification)"
                    ),
                    code: format!("#!/bin/sh\nset -e\n# Draft holdout check for: {intent}\nexit 0\n"),
                });
            }
            drafts
        })
        .await
        .map_err(|e| invalid(e.to_string()))
    }

    /// Explicitly ratifies a human-reviewed holdout draft by writing it inside
    /// `<project_root>/holdout/` and registering `holdout/**` on the project.
    pub async fn ratify_holdout_draft(&self, project_id: &str, filename: &str, code: &str) -> Result<String> {
        let lang = self.inner.lang();
        let proj = self.inner.store(|s| s.project(project_id))?;
        let trimmed = filename.trim().trim_start_matches("./");
        let rel = if trimmed.starts_with("holdout/") { trimmed.to_string() } else { format!("holdout/{trimmed}") };
        if rel.contains("..") || rel.starts_with('/') || rel.contains('\\') {
            return Err(invalid(tr!(
                lang,
                "保留测试文件名必须位于 holdout/ 下且不能包含路径穿越",
                "Holdout filename must stay inside holdout/ without path traversal"
            )));
        }
        let root = PathBuf::from(&proj.root);
        let rel_clone = rel.clone();
        let bytes = code.as_bytes().to_vec();
        tokio::task::spawn_blocking(move || tower_git::write_inside(&root, &rel_clone, &bytes))
            .await
            .map_err(|e| invalid(e.to_string()))??;
        if !proj.holdout_files.iter().any(|p| p == "holdout/**" || p == &rel) {
            let mut holdouts = proj.holdout_files.clone();
            holdouts.push("holdout/**".into());
            let patch = ProjectPatch {
                base_branch: proj.base_branch,
                test_command: proj.test_command,
                local_files: proj.local_files,
                memory: proj.memory,
                setup_command: proj.setup_command,
                holdout_files: holdouts,
            };
            let _ = self.inner.store(|s| s.update_project(project_id, &patch));
            self.inner.emit_projects();
        }
        Ok(rel)
    }
}

/// Reads up to `limit` visible test files in `root` (skipping `holdout/`,
/// `node_modules/`, `target/`, `.git/`) for deterministic synthetic holdout drafting.
fn collect_visible_test_files(root: &Path, limit: usize) -> Vec<(String, String)> {
    let mut out = Vec::new();
    let mut stack = vec![root.to_path_buf()];
    while let Some(dir) = stack.pop() {
        if out.len() >= limit {
            break;
        }
        let Ok(entries) = std::fs::read_dir(&dir) else { continue };
        let mut children: Vec<_> = entries.flatten().collect();
        children.sort_by_key(|e| e.file_name());
        for entry in children {
            if out.len() >= limit {
                break;
            }
            let path = entry.path();
            let name = entry.file_name().to_string_lossy().into_owned();
            if matches!(name.as_str(), ".git" | "node_modules" | "target" | "dist" | "holdout") {
                continue;
            }
            let Ok(meta) = entry.metadata() else { continue };
            if meta.is_symlink() {
                continue;
            }
            if meta.is_dir() {
                stack.push(path);
            } else if meta.is_file() && meta.len() <= 128 * 1024 {
                let Ok(rel) = path.strip_prefix(root) else { continue };
                let rel_str = rel.to_string_lossy().replace('\\', "/");
                if tower_core::roles::role(&rel_str) == tower_core::roles::Role::Test
                    && let Ok(text) = std::fs::read_to_string(&path)
                {
                    out.push((rel_str, text));
                }
            }
        }
    }
    out
}
