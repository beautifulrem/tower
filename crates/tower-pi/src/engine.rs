//! One Pi process in RPC mode, owned by one goal.
//!
//! Framing follows Pi's rules: one JSON object per line, split only on LF
//! (never on Unicode line separators), stdout read continuously, stderr kept
//! as diagnostics only.

use std::collections::HashMap;
use std::path::PathBuf;
use std::process::Stdio;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{Arc, Mutex};
use std::time::Duration;

use serde_json::{Value, json};
use thiserror::Error;
use tokio::io::{AsyncBufReadExt, AsyncReadExt, AsyncWriteExt, BufReader};
use tokio::process::{Child, Command};
use tokio::sync::{mpsc, oneshot};

use crate::protocol::{PiEvent, Record, Response, UiAnswer, parse_record};

#[derive(Debug, Clone, Default)]
pub struct EngineConfig {
    /// The `pi` executable.
    pub program: PathBuf,
    /// Working directory: the goal's isolated workspace.
    pub cwd: PathBuf,
    /// Where Pi stores this goal's session files.
    pub session_dir: PathBuf,
    /// Resume this session file instead of starting a new one.
    pub resume_session: Option<PathBuf>,
    /// Extensions loaded explicitly with `-e` (always includes `tower-goal`).
    pub extensions: Vec<PathBuf>,
    /// When false, Pi's extension discovery is disabled (`--no-extensions`).
    pub load_user_extensions: bool,
    /// `provider/model`.
    pub model: Option<String>,
    pub thinking: Option<String>,
    /// Text appended to Pi's system prompt (the goal system section).
    pub append_system_prompt: Option<String>,
    /// Complete environment for the process. Nothing is inherited.
    pub env: Vec<(String, String)>,
}

impl EngineConfig {
    pub fn args(&self) -> Vec<String> {
        let mut a = vec!["--mode".into(), "rpc".into(), "--session-dir".into(), self.session_dir.display().to_string()];
        if let Some(s) = &self.resume_session {
            a.extend(["--session".into(), s.display().to_string()]);
        }
        if !self.load_user_extensions {
            a.push("--no-extensions".into());
        }
        for e in &self.extensions {
            a.extend(["--extension".into(), e.display().to_string()]);
        }
        if let Some(m) = self.model.as_deref().filter(|m| !m.is_empty()) {
            a.extend(["--model".into(), m.into()]);
        }
        if let Some(t) = self.thinking.as_deref().filter(|t| !t.is_empty()) {
            a.extend(["--thinking".into(), t.into()]);
        }
        if let Some(p) = self.append_system_prompt.as_deref().filter(|p| !p.is_empty()) {
            a.extend(["--append-system-prompt".into(), p.into()]);
        }
        a
    }
}

#[derive(Debug, Error)]
pub enum EngineError {
    #[error("failed to start pi: {0}")]
    Spawn(std::io::Error),
    #[error("pi is not running")]
    Closed,
    #[error("pi did not answer `{0}` in time")]
    Timeout(String),
    #[error("pi rejected `{command}`: {message}")]
    Rejected { command: String, message: String },
}

/// What the engine emits besides command responses.
#[allow(clippy::large_enum_variant)]
#[derive(Debug, Clone, PartialEq)]
pub enum EngineOutput {
    Event(PiEvent),
    /// A stdout line that was not valid JSON.
    ProtocolError(String),
    /// The process ended. `stderr_tail` holds its last diagnostics.
    Exited { code: Option<i32>, stderr_tail: String },
}

type Pending = Arc<Mutex<HashMap<String, oneshot::Sender<Response>>>>;

const STDERR_TAIL_BYTES: usize = 16 * 1024;
const REQUEST_TIMEOUT: Duration = Duration::from_secs(30);

/// Handle to a running Pi process. Dropping it closes stdin, which asks Pi to
/// shut down; call [`Engine::shutdown`] to also wait and escalate.
#[derive(Debug)]
pub struct Engine {
    stdin: Mutex<Option<mpsc::UnboundedSender<Value>>>,
    pending: Pending,
    next_id: AtomicU64,
    pid: Option<u32>,
    kill: Mutex<Option<oneshot::Sender<()>>>,
    exited: Arc<tokio::sync::Notify>,
    done: Arc<std::sync::atomic::AtomicBool>,
    stderr: Arc<Mutex<String>>,
}

impl Engine {
    pub fn spawn(cfg: &EngineConfig) -> Result<(Self, mpsc::UnboundedReceiver<EngineOutput>), EngineError> {
        let mut cmd = Command::new(&cfg.program);
        cmd.args(cfg.args())
            .current_dir(&cfg.cwd)
            .env_clear()
            .envs(cfg.env.iter().cloned())
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .kill_on_drop(true);
        #[cfg(unix)]
        cmd.process_group(0);
        let mut child = cmd.spawn().map_err(EngineError::Spawn)?;
        let pid = child.id();

        let (out_tx, out_rx) = mpsc::unbounded_channel();
        let (in_tx, in_rx) = mpsc::unbounded_channel::<Value>();
        let pending: Pending = Arc::default();
        let stderr = Arc::new(Mutex::new(String::new()));
        let exited = Arc::new(tokio::sync::Notify::new());
        let done = Arc::new(std::sync::atomic::AtomicBool::new(false));
        let (kill_tx, kill_rx) = oneshot::channel();

        tokio::spawn(write_loop(child.stdin.take().expect("piped stdin"), in_rx));
        let reader = tokio::spawn(read_loop(
            child.stdout.take().expect("piped stdout"),
            pending.clone(),
            out_tx.clone(),
        ));
        let stderr_task = tokio::spawn(stderr_loop(child.stderr.take().expect("piped stderr"), stderr.clone()));
        tokio::spawn(wait_loop(
            child,
            pid,
            kill_rx,
            reader,
            stderr_task,
            stderr.clone(),
            pending.clone(),
            out_tx,
            (exited.clone(), done.clone()),
        ));

        Ok((
            Self {
                stdin: Mutex::new(Some(in_tx)),
                pending,
                next_id: AtomicU64::new(1),
                pid,
                kill: Mutex::new(Some(kill_tx)),
                exited,
                done,
                stderr,
            },
            out_rx,
        ))
    }

    pub fn pid(&self) -> Option<u32> {
        self.pid
    }

    pub fn stderr_tail(&self) -> String {
        self.stderr.lock().map(|s| s.clone()).unwrap_or_default()
    }

    /// Sends a command and waits for its response.
    pub async fn request(&self, mut command: Value) -> Result<Response, EngineError> {
        let id = format!("t{}", self.next_id.fetch_add(1, Ordering::Relaxed));
        let name = command.get("type").and_then(Value::as_str).unwrap_or("?").to_string();
        command["id"] = Value::String(id.clone());
        let (tx, rx) = oneshot::channel();
        self.pending.lock().expect("pending lock").insert(id.clone(), tx);
        if self.send(command).is_err() {
            self.pending.lock().expect("pending lock").remove(&id);
            return Err(EngineError::Closed);
        }
        let resp = match tokio::time::timeout(REQUEST_TIMEOUT, rx).await {
            Ok(Ok(r)) => r,
            Ok(Err(_)) => return Err(EngineError::Closed),
            Err(_) => {
                self.pending.lock().expect("pending lock").remove(&id);
                return Err(EngineError::Timeout(name));
            }
        };
        if resp.success {
            Ok(resp)
        } else {
            Err(EngineError::Rejected { command: resp.command, message: resp.error.unwrap_or_default() })
        }
    }

    /// Starts a run. If the agent is already streaming, the message is queued
    /// as a steer.
    pub async fn prompt(&self, message: &str) -> Result<Response, EngineError> {
        self.request(json!({"type": "prompt", "message": message, "streamingBehavior": "steer"})).await
    }

    pub async fn steer(&self, message: &str) -> Result<Response, EngineError> {
        self.request(json!({"type": "steer", "message": message})).await
    }

    pub async fn follow_up(&self, message: &str) -> Result<Response, EngineError> {
        self.request(json!({"type": "follow_up", "message": message})).await
    }

    pub async fn abort(&self) -> Result<Response, EngineError> {
        self.request(json!({"type": "abort"})).await
    }

    pub async fn state(&self) -> Result<Value, EngineError> {
        Ok(self.request(json!({"type": "get_state"})).await?.data)
    }

    pub async fn session_stats(&self) -> Result<Value, EngineError> {
        Ok(self.request(json!({"type": "get_session_stats"})).await?.data)
    }

    pub async fn available_models(&self) -> Result<Value, EngineError> {
        Ok(self.request(json!({"type": "get_available_models"})).await?.data)
    }

    fn send(&self, record: Value) -> Result<(), EngineError> {
        let guard = self.stdin.lock().expect("stdin lock");
        guard.as_ref().ok_or(EngineError::Closed)?.send(record).map_err(|_| EngineError::Closed)
    }

    /// Answers an extension dialog. Not a command: there is no response.
    pub fn answer(&self, ui_request_id: &str, answer: &UiAnswer) -> Result<(), EngineError> {
        self.send(answer.to_record(ui_request_id))
    }

    pub fn has_exited(&self) -> bool {
        self.done.load(Ordering::SeqCst)
    }

    /// Asks Pi to exit by closing stdin, waits up to `grace`, then kills the
    /// whole process group. Safe to call more than once.
    pub async fn shutdown(&self, grace: Duration) {
        let notified = self.exited.notified();
        tokio::pin!(notified);
        notified.as_mut().enable();
        self.stdin.lock().expect("stdin lock").take();
        if self.has_exited() {
            return;
        }
        if tokio::time::timeout(grace, &mut notified).await.is_err() {
            if let Some(k) = self.kill.lock().ok().and_then(|mut k| k.take()) {
                let _ = k.send(());
            }
            let again = self.exited.notified();
            if !self.has_exited() {
                let _ = tokio::time::timeout(Duration::from_secs(5), again).await;
            }
        }
    }
}

async fn write_loop(mut stdin: tokio::process::ChildStdin, mut rx: mpsc::UnboundedReceiver<Value>) {
    while let Some(record) = rx.recv().await {
        let mut line = record.to_string();
        line.push('\n');
        if stdin.write_all(line.as_bytes()).await.is_err() || stdin.flush().await.is_err() {
            break;
        }
    }
    // Dropping stdin sends EOF: Pi's signal for an orderly shutdown.
}

async fn read_loop(
    stdout: tokio::process::ChildStdout,
    pending: Pending,
    out: mpsc::UnboundedSender<EngineOutput>,
) {
    let mut reader = BufReader::new(stdout);
    let mut buf = Vec::with_capacity(8 * 1024);
    loop {
        buf.clear();
        match reader.read_until(b'\n', &mut buf).await {
            Ok(0) | Err(_) => break,
            Ok(_) => {}
        }
        let line = String::from_utf8_lossy(&buf);
        let line = line.trim_end_matches(['\n', '\r']);
        if line.is_empty() {
            continue;
        }
        match parse_record(line) {
            Ok(Record::Response(r)) => {
                let waiter = r.id.as_ref().and_then(|id| pending.lock().ok()?.remove(id));
                match waiter {
                    Some(tx) => {
                        let _ = tx.send(r);
                    }
                    None => tracing::debug!(command = %r.command, "uncorrelated pi response"),
                }
            }
            Ok(Record::Event(e)) => {
                let _ = out.send(EngineOutput::Event(e));
            }
            Err(err) => {
                let mut sample: String = line.chars().take(200).collect();
                sample.push_str(&format!(" ({err})"));
                let _ = out.send(EngineOutput::ProtocolError(sample));
            }
        }
    }
}

async fn stderr_loop(mut stderr: tokio::process::ChildStderr, tail: Arc<Mutex<String>>) {
    let mut chunk = [0u8; 4096];
    loop {
        match stderr.read(&mut chunk).await {
            Ok(0) | Err(_) => break,
            Ok(n) => {
                if let Ok(mut t) = tail.lock() {
                    t.push_str(&String::from_utf8_lossy(&chunk[..n]));
                    if t.len() > STDERR_TAIL_BYTES {
                        let mut cut = t.len() - STDERR_TAIL_BYTES;
                        while !t.is_char_boundary(cut) {
                            cut += 1;
                        }
                        t.drain(..cut);
                    }
                }
            }
        }
    }
}

#[allow(clippy::too_many_arguments)]
async fn wait_loop(
    mut child: Child,
    pid: Option<u32>,
    kill_rx: oneshot::Receiver<()>,
    reader: tokio::task::JoinHandle<()>,
    stderr_task: tokio::task::JoinHandle<()>,
    stderr: Arc<Mutex<String>>,
    pending: Pending,
    out: mpsc::UnboundedSender<EngineOutput>,
    (exited, done): (Arc<tokio::sync::Notify>, Arc<std::sync::atomic::AtomicBool>),
) {
    let status = tokio::select! {
        s = child.wait() => s.ok(),
        _ = kill_rx => {
            kill_group(pid);
            let _ = child.kill().await;
            child.wait().await.ok()
        }
    };
    // Tools the agent started may outlive Pi; never leave them behind.
    kill_group(pid);
    let _ = reader.await;
    let _ = stderr_task.await;
    pending.lock().map(|mut p| p.clear()).ok();
    let stderr_tail = stderr.lock().map(|s| s.clone()).unwrap_or_default();
    done.store(true, Ordering::SeqCst);
    let _ = out.send(EngineOutput::Exited { code: status.and_then(|s| s.code()), stderr_tail });
    exited.notify_waiters();
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
