//! The verifier's process runner (`docs/07` §7.2).
//!
//! A criterion's verdict is a fact only if it was produced by Tower, in a
//! clean checkout, from the exit code of the criterion's own command. This
//! crate runs one such command: in its own process group (so a timeout kills
//! everything it started), with an explicit environment, a bounded output
//! tail and secrets redacted before anything is stored or shown.

mod redact;

use std::path::PathBuf;
use std::process::Stdio;
use std::time::{Duration, Instant};

use tokio::io::AsyncReadExt;
use tokio::process::Command;
use tokio::sync::watch;

pub use redact::redact;

/// Output kept per command. Enough to see a test failure, bounded so a
/// runaway log cannot grow the database.
pub const TAIL_BYTES: usize = 64 * 1024;

#[derive(Debug, Clone)]
pub struct RunSpec {
    pub command: String,
    pub cwd: PathBuf,
    /// Complete environment. Nothing is inherited.
    pub env: Vec<(String, String)>,
    pub timeout: Duration,
    /// Shell used to interpret `command` (`/bin/sh` by default).
    pub shell: PathBuf,
}

impl RunSpec {
    pub fn new(
        command: impl Into<String>,
        cwd: impl Into<PathBuf>,
        env: Vec<(String, String)>,
        timeout: Duration,
    ) -> Self {
        Self { command: command.into(), cwd: cwd.into(), env, timeout, shell: PathBuf::from("/bin/sh") }
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Termination {
    Exited(i32),
    /// Killed by a signal (no exit code).
    Signaled,
    TimedOut,
    Cancelled,
    /// The command could not be started at all.
    SpawnFailed(String),
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct RunResult {
    pub termination: Termination,
    pub duration_ms: i64,
    /// Last `TAIL_BYTES` of interleaved stdout and stderr, redacted.
    pub output_tail: String,
    pub truncated: bool,
}

impl RunResult {
    pub fn passed(&self) -> bool {
        self.termination == Termination::Exited(0)
    }

    pub fn exit_code(&self) -> Option<i32> {
        match self.termination {
            Termination::Exited(c) => Some(c),
            _ => None,
        }
    }

    /// Failures that say nothing about the code under test: the command
    /// could not start, the shell could not find it (126/127), or the run was
    /// interrupted. These become `verify_env_error`, never a criterion
    /// failure, so they are not handed to the agent as rework (`ADR-037`).
    pub fn is_environment_failure(&self) -> bool {
        matches!(
            self.termination,
            Termination::SpawnFailed(_) | Termination::Exited(126) | Termination::Exited(127) | Termination::Cancelled
        )
    }
}

/// A cancel signal shared between the supervisor and running commands.
#[derive(Debug, Clone)]
pub struct Cancel {
    tx: watch::Sender<bool>,
}

impl Default for Cancel {
    fn default() -> Self {
        Self { tx: watch::channel(false).0 }
    }
}

impl Cancel {
    pub fn cancel(&self) {
        let _ = self.tx.send(true);
    }

    pub fn is_cancelled(&self) -> bool {
        *self.tx.borrow()
    }

    fn subscribe(&self) -> watch::Receiver<bool> {
        self.tx.subscribe()
    }
}

pub async fn run(spec: &RunSpec, cancel: &Cancel) -> RunResult {
    let started = Instant::now();
    let elapsed = |s: Instant| s.elapsed().as_millis() as i64;
    if cancel.is_cancelled() {
        return RunResult {
            termination: Termination::Cancelled,
            duration_ms: 0,
            output_tail: String::new(),
            truncated: false,
        };
    }

    let mut cmd = Command::new(&spec.shell);
    cmd.arg("-c")
        .arg(&spec.command)
        .current_dir(&spec.cwd)
        .env_clear()
        .envs(spec.env.iter().cloned())
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .kill_on_drop(true);
    #[cfg(unix)]
    cmd.process_group(0);

    let mut child = match cmd.spawn() {
        Ok(c) => c,
        Err(e) => {
            return RunResult {
                termination: Termination::SpawnFailed(e.to_string()),
                duration_ms: elapsed(started),
                output_tail: String::new(),
                truncated: false,
            };
        }
    };
    let pid = child.id();

    let (tail_tx, mut tail_rx) = tokio::sync::mpsc::unbounded_channel::<Vec<u8>>();
    if let Some(out) = child.stdout.take() {
        tokio::spawn(pump(out, tail_tx.clone()));
    }
    if let Some(err) = child.stderr.take() {
        tokio::spawn(pump(err, tail_tx.clone()));
    }
    drop(tail_tx);

    let collector = tokio::spawn(async move {
        let mut tail: Vec<u8> = Vec::new();
        let mut truncated = false;
        while let Some(chunk) = tail_rx.recv().await {
            tail.extend_from_slice(&chunk);
            if tail.len() > TAIL_BYTES * 2 {
                let cut = tail.len() - TAIL_BYTES;
                tail.drain(..cut);
                truncated = true;
            }
        }
        if tail.len() > TAIL_BYTES {
            let cut = tail.len() - TAIL_BYTES;
            tail.drain(..cut);
            truncated = true;
        }
        (tail, truncated)
    });

    let mut cancel_rx = cancel.subscribe();
    let termination = tokio::select! {
        status = child.wait() => match status {
            Ok(s) => s.code().map(Termination::Exited).unwrap_or(Termination::Signaled),
            Err(e) => Termination::SpawnFailed(e.to_string()),
        },
        _ = tokio::time::sleep(spec.timeout) => Termination::TimedOut,
        _ = async { while cancel_rx.changed().await.is_ok() { if *cancel_rx.borrow() { break; } } } => Termination::Cancelled,
    };
    // Whatever happened, nothing the command started may survive it.
    kill_group(pid);
    let _ = child.kill().await;

    let (tail, truncated) = collector.await.unwrap_or_default();
    let mut text = String::from_utf8_lossy(&tail).into_owned();
    if truncated {
        // Drop a partial first line so the tail starts cleanly.
        if let Some(i) = text.find('\n') {
            text.drain(..=i);
        }
    }
    RunResult { termination, duration_ms: elapsed(started), output_tail: redact(&text), truncated }
}

/// Forwards a stream's bytes to the tail collector until EOF.
async fn pump(mut stream: impl tokio::io::AsyncRead + Unpin, tx: tokio::sync::mpsc::UnboundedSender<Vec<u8>>) {
    let mut buf = vec![0u8; 8192];
    loop {
        match stream.read(&mut buf).await {
            Ok(0) | Err(_) => break,
            Ok(n) => {
                if tx.send(buf[..n].to_vec()).is_err() {
                    break;
                }
            }
        }
    }
}

#[cfg(unix)]
fn kill_group(pid: Option<u32>) {
    use nix::sys::signal::{Signal, killpg};
    use nix::unistd::Pid;
    if let Some(pid) = pid {
        let _ = killpg(Pid::from_raw(pid as i32), Signal::SIGKILL);
    }
}

#[cfg(not(unix))]
fn kill_group(_pid: Option<u32>) {}

#[cfg(test)]
mod tests {
    use super::*;

    fn spec(cmd: &str, timeout_ms: u64) -> RunSpec {
        RunSpec::new(
            cmd,
            std::env::temp_dir(),
            vec![("PATH".into(), "/usr/bin:/bin".into())],
            Duration::from_millis(timeout_ms),
        )
    }

    #[tokio::test]
    async fn exit_codes_decide_pass_and_fail() {
        let ok = run(&spec("echo hello; exit 0", 5_000), &Cancel::default()).await;
        assert!(ok.passed());
        assert_eq!(ok.output_tail.trim(), "hello");

        let fail = run(&spec("echo boom >&2; exit 3", 5_000), &Cancel::default()).await;
        assert_eq!(fail.exit_code(), Some(3));
        assert!(fail.output_tail.contains("boom"));
        assert!(!fail.is_environment_failure());
    }

    #[tokio::test]
    async fn missing_commands_are_environment_failures() {
        let r = run(&spec("definitely-not-a-command-xyz", 5_000), &Cancel::default()).await;
        assert_eq!(r.exit_code(), Some(127));
        assert!(r.is_environment_failure());
    }

    #[tokio::test]
    async fn timeouts_kill_the_whole_group() {
        let marker = std::env::temp_dir().join(format!("tower-verify-{}", std::process::id()));
        let cmd = format!("(sleep 1; touch {}) & sleep 30", marker.display());
        let r = run(&spec(&cmd, 200), &Cancel::default()).await;
        assert_eq!(r.termination, Termination::TimedOut);
        tokio::time::sleep(Duration::from_millis(1_500)).await;
        assert!(!marker.exists(), "the background child must have been killed");
    }

    #[tokio::test]
    async fn cancellation_stops_a_run() {
        let cancel = Cancel::default();
        let c2 = cancel.clone();
        tokio::spawn(async move {
            tokio::time::sleep(Duration::from_millis(100)).await;
            c2.cancel();
        });
        let r = run(&spec("sleep 30", 60_000), &cancel).await;
        assert_eq!(r.termination, Termination::Cancelled);
        assert!(r.duration_ms < 5_000);
    }

    #[tokio::test]
    async fn output_is_bounded() {
        let r = run(&spec("yes 0123456789 | head -c 300000", 10_000), &Cancel::default()).await;
        assert!(r.truncated);
        assert!(r.output_tail.len() <= TAIL_BYTES);
        assert!(r.output_tail.starts_with("0123456789"));
    }
}
