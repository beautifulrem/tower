//! Pushing a branch of the user's repository to `origin`: the one git
//! command Tower runs over the network. It never prompts and never hangs:
//! ssh gives up on a host it cannot reach, and a push that takes longer
//! than its limit is stopped with everything it started.

use std::io::Read;
use std::os::unix::process::CommandExt;
use std::path::Path;
use std::process::Stdio;
use std::time::{Duration, Instant};

use nix::sys::signal::{Signal, killpg};
use nix::unistd::Pid;

use super::{Git, GitError, Result, refuse_redirect};

/// How long a push may take before it is stopped.
const PUSH_TIMEOUT: Duration = Duration::from_secs(300);
/// How often a running push is looked at.
const POLL: Duration = Duration::from_millis(50);
/// ssh as git runs it for a push: never asks (no terminal, no passphrase
/// dialog) and gives up on a host it cannot reach.
const SSH: &str = "ssh -o BatchMode=yes -o ConnectTimeout=15";

impl Git {
    /// Pushes a local branch of the user's repository to `origin`. A
    /// one-way door: only ever called on an explicit human action.
    pub fn push_branch(&self, project_root: &Path, branch: &str) -> Result<()> {
        self.push_branch_within(project_root, branch, PUSH_TIMEOUT)
    }

    fn push_branch_within(&self, project_root: &Path, branch: &str, limit: Duration) -> Result<()> {
        refuse_redirect(project_root)?;
        // Your own ssh command (configured, or in your environment) wins;
        // otherwise ssh never asks and gives up on a host it cannot reach.
        let yours = self.env.iter().any(|(k, _)| k == "GIT_SSH_COMMAND" || k == "GIT_SSH")
            || (self.env.is_empty()
                && (std::env::var_os("GIT_SSH_COMMAND").is_some() || std::env::var_os("GIT_SSH").is_some()))
            || self.run_trim(project_root, &["config", "--get", "core.sshCommand"]).is_ok_and(|s| !s.is_empty());
        let refspec = format!("refs/heads/{branch}:refs/heads/{branch}");
        let args = ["push", "--set-upstream", "origin", &refspec];
        let mut c = self.command(project_root);
        if !yours {
            c.env("GIT_SSH_COMMAND", SSH);
        }
        // Its own process group, so stopping it stops ssh too.
        c.args(args).process_group(0).stdin(Stdio::null()).stdout(Stdio::piped()).stderr(Stdio::piped());
        let mut child = c.spawn()?;
        let drain = |pipe: Option<Box<dyn Read + Send>>| {
            std::thread::spawn(move || {
                let mut text = String::new();
                if let Some(mut p) = pipe {
                    let _ = p.read_to_string(&mut text);
                }
                text
            })
        };
        let _stdout = drain(child.stdout.take().map(|p| Box::new(p) as Box<dyn Read + Send>));
        let stderr = drain(child.stderr.take().map(|p| Box::new(p) as Box<dyn Read + Send>));
        let deadline = Instant::now() + limit;
        let status = loop {
            if let Some(status) = child.try_wait()? {
                break status;
            }
            if Instant::now() >= deadline {
                if let Ok(pid) = i32::try_from(child.id()) {
                    let _ = killpg(Pid::from_raw(pid), Signal::SIGKILL);
                }
                let _ = child.wait();
                return Err(GitError::Failed {
                    args: args.join(" "),
                    stderr: format!("timed out after {} s", limit.as_secs()),
                });
            }
            std::thread::sleep(POLL);
        };
        if status.success() {
            return Ok(());
        }
        // What it left running (a lingering ssh) may still hold the error
        // output open: stop it, so reading the error ends with git.
        if let Ok(pid) = i32::try_from(child.id()) {
            let _ = killpg(Pid::from_raw(pid), Signal::SIGKILL);
        }
        Err(GitError::Failed { args: args.join(" "), stderr: stderr.join().unwrap_or_default().trim().to_string() })
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::os::unix::fs::PermissionsExt;
    use std::time::Instant;

    /// A stand-in for git: answers `config --get core.sshCommand` with
    /// `$SSH_CONFIG` (unset when empty), and on `push` records the ssh
    /// command it was given and, with `$HANG`, waits on a child (whose pid
    /// it records) for far longer than the test's limit.
    fn fake_git(dir: &Path) -> std::path::PathBuf {
        let script = dir.join("git");
        std::fs::write(
            &script,
            r#"#!/bin/sh
case "$*" in
  *core.sshCommand*) [ -n "$SSH_CONFIG" ] && { echo "$SSH_CONFIG"; exit 0; }; exit 1 ;;
  *push*)
    printf '%s' "$GIT_SSH_COMMAND" > "$OUT/ssh"
    if [ -n "$LINGER" ]; then
      sleep 20 &
      echo $! > "$OUT/pid"
      echo "rejected: non-fast-forward" >&2
      exit 1
    fi
    [ -n "$HANG" ] || exit 0
    sleep 20 &
    echo $! > "$OUT/pid"
    wait ;;
esac
"#,
        )
        .unwrap();
        std::fs::set_permissions(&script, std::fs::Permissions::from_mode(0o755)).unwrap();
        script
    }

    fn alive(pid: i32) -> bool {
        nix::sys::signal::kill(nix::unistd::Pid::from_raw(pid), None).is_ok()
    }

    #[test]
    fn a_push_that_hangs_is_stopped_with_what_it_started() {
        let tmp = tempfile::tempdir().unwrap();
        let out = tmp.path().display().to_string();
        let env = vec![("PATH".into(), "/usr/bin:/bin".into()), ("OUT".into(), out), ("HANG".into(), "1".into())];
        let git = Git::new(fake_git(tmp.path()), env);

        let started = Instant::now();
        let err = git.push_branch_within(tmp.path(), "tower/x", Duration::from_secs(2)).unwrap_err();
        assert!(started.elapsed() < Duration::from_secs(10), "stopped at its limit");
        assert!(err.to_string().contains("timed out"), "{err}");
        let pid: i32 = std::fs::read_to_string(tmp.path().join("pid")).unwrap().trim().parse().unwrap();
        let deadline = Instant::now() + Duration::from_secs(10);
        while alive(pid) && Instant::now() < deadline {
            std::thread::yield_now();
        }
        assert!(!alive(pid), "what the push started is stopped too");
        let ssh = std::fs::read_to_string(tmp.path().join("ssh")).unwrap();
        assert!(ssh.contains("BatchMode=yes") && ssh.contains("ConnectTimeout="), "{ssh}");
    }

    /// A push that fails while something it started still holds its error
    /// output (a lingering ssh) reports the error at once and stops it.
    #[test]
    fn a_failed_push_reports_its_error_though_a_child_keeps_the_pipe_open() {
        let tmp = tempfile::tempdir().unwrap();
        let out = tmp.path().display().to_string();
        let env = vec![("PATH".into(), "/usr/bin:/bin".into()), ("OUT".into(), out), ("LINGER".into(), "1".into())];
        let git = Git::new(fake_git(tmp.path()), env);

        let started = Instant::now();
        let err = git.push_branch_within(tmp.path(), "tower/x", Duration::from_secs(60)).unwrap_err();
        assert!(started.elapsed() < Duration::from_secs(10), "took {:?}", started.elapsed());
        assert!(err.to_string().contains("non-fast-forward"), "{err}");
        let pid: i32 = std::fs::read_to_string(tmp.path().join("pid")).unwrap().trim().parse().unwrap();
        let deadline = Instant::now() + Duration::from_secs(10);
        while alive(pid) && Instant::now() < deadline {
            std::thread::yield_now();
        }
        assert!(!alive(pid), "what the push left running is stopped");
    }

    #[test]
    fn your_own_ssh_command_is_kept() {
        let tmp = tempfile::tempdir().unwrap();
        let out = tmp.path().display().to_string();
        let base = vec![("PATH".to_string(), "/usr/bin:/bin".to_string()), ("OUT".to_string(), out)];
        let script = fake_git(tmp.path());

        let mut env = base.clone();
        env.push(("SSH_CONFIG".into(), "ssh -i ~/.ssh/work".into()));
        let _ = Git::new(&script, env).push_branch_within(tmp.path(), "b", Duration::from_secs(10));
        assert_eq!(std::fs::read_to_string(tmp.path().join("ssh")).unwrap(), "", "core.sshCommand wins");

        let mut env = base;
        env.push(("GIT_SSH_COMMAND".into(), "ssh -p 2222".into()));
        let _ = Git::new(&script, env).push_branch_within(tmp.path(), "b", Duration::from_secs(10));
        assert_eq!(std::fs::read_to_string(tmp.path().join("ssh")).unwrap(), "ssh -p 2222");
    }
}
