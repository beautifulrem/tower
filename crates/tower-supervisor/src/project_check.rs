//! Runs a project's test command on a clean copy of its base branch, in the
//! sandbox, when the project is added (and on request). A first goal then
//! starts from known ground: "the tests pass", "they already fail", or "the
//! test setup does not work here" — before any agent is involved.

use std::path::{Path, PathBuf};
use std::sync::Arc;
use std::time::Duration;

use tower_core::view::TestCheck;
use tower_git::Git;
use tower_verify::{Cancel, RunSpec};

use crate::{Inner, Result, invalid, run, verify};

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
        let setup_jail = run::verifier_jail(inner, &work, &dirs, "check-setup", true, &Default::default())?;
        let jail = run::verifier_jail(inner, &work, &dirs, "check", false, &Default::default())?;
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
