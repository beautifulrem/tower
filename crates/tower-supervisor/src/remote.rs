//! Tower away from the desk: a small page for your phone, served over your
//! own network (Tailscale or the local network), that lists what needs you
//! and lets you answer it — questions, approvals, pauses — and pause a
//! running goal. Off by default.
//!
//! Async non-blocking runtime (`docs/18-evolution-roadmap.md` P1.3):
//! - Requests are accepted on a non-blocking accept loop and dispatched onto
//!   Tokio tasks with bounded concurrency (`MAX_CONCURRENT_REQUESTS`) and
//!   explicit per-request timeouts (`ACTION_TIMEOUT`), so slow actions like
//!   pausing an engine never block `/api/state` or other requests.
//! - Authenticated `GET /api/events` streams Server-Sent Events (SSE) with
//!   `Authorization: Bearer <token>` (never a URL query token), pushing
//!   `event: state` JSON snapshots on change plus 15s keepalive comments.
//!
//! Security properties preserved verbatim:
//! - Every API / SSE request requires the 256-bit pairing token via constant-time
//!   compare; the HTML shell holds no data and reads the token from `location.hash`.
//! - Tailscale-only by default (local network is a separate opt-in switch).
//! - Privilege-widening decisions (`answerable_away == false`) are strictly refused.

use std::io::{self, Read, Write};
use std::sync::atomic::{AtomicUsize, Ordering};
use std::sync::{Arc, Mutex, PoisonError, mpsc as std_mpsc};
use std::time::Duration;

use serde::Serialize;
use tokio::sync::{Semaphore, broadcast, watch};
use tower_core::view::{GoalSummary, InboxItem};

use crate::Inner;

/// Bounded concurrency for short-lived HTTP requests (`/`, `/api/state`, `/api/answer`, ...).
const MAX_CONCURRENT_REQUESTS: usize = 32;
/// Bounded concurrency for long-lived `/api/events` SSE subscribers.
const MAX_SSE_CLIENTS: usize = 16;
/// Maximum time allowed for an async remote action (`/api/answer`, `/api/pause`).
const ACTION_TIMEOUT: Duration = Duration::from_secs(15);
/// Maximum time allowed for reading `/api/state`.
const STATE_TIMEOUT: Duration = Duration::from_secs(5);
/// Poll interval for SSE change detection when no explicit `notify()` fired.
const SSE_POLL_INTERVAL: Duration = Duration::from_secs(1);
/// Keepalive comment interval so mobile Safari and Tailscale NAT keep the stream open.
const SSE_KEEPALIVE_INTERVAL: Duration = Duration::from_secs(15);

/// The running server, kept so it can be stopped, with the address it
/// listens on, why it is not running when it should be, and an event bus
/// that wakes connected SSE phone clients immediately on state changes.
pub struct Remote {
    servers: Mutex<Vec<Arc<tiny_http::Server>>>,
    hosts: Mutex<Vec<String>>,
    problem: Mutex<Option<String>>,
    shutdown: Mutex<Option<watch::Sender<bool>>>,
    events_tx: broadcast::Sender<()>,
    sse_clients: Arc<AtomicUsize>,
}

impl Default for Remote {
    fn default() -> Self {
        let (events_tx, _) = broadcast::channel(32);
        Self {
            servers: Mutex::default(),
            hosts: Mutex::default(),
            problem: Mutex::default(),
            shutdown: Mutex::default(),
            events_tx,
            sse_clients: Arc::new(AtomicUsize::new(0)),
        }
    }
}

impl std::fmt::Debug for Remote {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("Remote").field("sse_clients", &self.sse_clients.load(Ordering::Relaxed)).finish_non_exhaustive()
    }
}

#[derive(Serialize)]
struct State {
    goals: Vec<GoalSummary>,
    inbox: Vec<InboxItem>,
    lang: String,
    /// How many goals may run at once: the page's runs gauge reads `1/4`, as the desk's title bar does.
    max_running: u32,
}

/// A fresh 256-bit pairing token.
pub fn new_token() -> String {
    format!("{}{}", uuid::Uuid::new_v4().simple(), uuid::Uuid::new_v4().simple())
}

/// Tailscale's address on this Mac, only while Tailscale is connected:
/// the CLI keeps printing the last address after it stops, so the address
/// must also be one this Mac can bind.
pub fn tailscale_ip(env: &crate::shell_env::ShellEnv) -> Option<String> {
    let cli = env.which("tailscale").or_else(|| {
        let app = std::path::PathBuf::from("/Applications/Tailscale.app/Contents/MacOS/Tailscale");
        app.is_file().then_some(app)
    })?;
    let o = std::process::Command::new(cli).args(["ip", "-4"]).stderr(std::process::Stdio::null()).output().ok()?;
    let ip = String::from_utf8_lossy(&o.stdout).lines().next().unwrap_or_default().trim().to_string();
    let addr: std::net::Ipv4Addr = ip.parse().ok()?;
    std::net::UdpSocket::bind((addr, 0)).ok()?;
    Some(ip)
}

/// Where to listen: Tailscale's address (the only encrypted way in), plus
/// this Mac's address on the local network when the settings allow it.
/// Empty: there is nowhere safe to listen.
pub fn listen_hosts(env: &crate::shell_env::ShellEnv, local_network: bool) -> Vec<String> {
    // Never every interface: the addresses a phone uses, by name. With the
    // local network allowed, this Mac's address on it (and loopback).
    let mut hosts: Vec<String> = tailscale_ip(env).into_iter().collect();
    if local_network {
        hosts.extend(addresses(env));
        hosts.push("127.0.0.1".into());
    }
    let mut seen = Vec::new();
    hosts.retain(|h| {
        let new = !seen.contains(h);
        seen.push(h.clone());
        new
    });
    hosts
}

/// Addresses the phone can use: the Tailscale address first (while it is
/// connected), then the local network's.
pub fn addresses(env: &crate::shell_env::ShellEnv) -> Vec<String> {
    let mut out: Vec<String> = tailscale_ip(env).into_iter().collect();
    // The address the system would use to reach the outside (no packet is sent).
    if let Ok(sock) = std::net::UdpSocket::bind("0.0.0.0:0")
        && sock.connect("192.0.2.1:9").is_ok()
        && let Ok(addr) = sock.local_addr()
        && !addr.ip().is_loopback()
    {
        out.push(addr.ip().to_string());
    }
    out.dedup();
    out
}

/// A QR code (SVG) for `text`.
pub fn qr_svg(text: &str) -> String {
    qrcode::QrCode::new(text.as_bytes())
        .map(|c| c.render::<qrcode::render::svg::Color<'_>>().min_dimensions(180, 180).quiet_zone(true).build())
        .unwrap_or_default()
}

impl Remote {
    /// Signals all connected `/api/events` SSE clients to push a fresh state snapshot.
    #[allow(dead_code)]
    pub fn notify(&self) {
        let _ = self.events_tx.send(());
    }

    /// Number of currently connected `/api/events` SSE subscribers.
    #[allow(dead_code)]
    pub fn active_sse_clients(&self) -> usize {
        self.sse_clients.load(Ordering::Relaxed)
    }

    pub fn stop(&self) {
        if let Some(tx) = self.shutdown.lock().unwrap_or_else(PoisonError::into_inner).take() {
            let _ = tx.send(true);
        }
        for s in self.servers.lock().unwrap_or_else(PoisonError::into_inner).drain(..) {
            s.unblock();
        }
        self.hosts.lock().unwrap_or_else(PoisonError::into_inner).clear();
    }

    /// The addresses it listens on (none when it is not running).
    pub fn hosts(&self) -> Vec<String> {
        self.hosts.lock().unwrap_or_else(PoisonError::into_inner).clone()
    }

    /// Why it is not running although it is turned on.
    pub fn problem(&self) -> Option<String> {
        self.problem.lock().unwrap_or_else(PoisonError::into_inner).clone()
    }

    pub fn set_problem(&self, problem: Option<String>) {
        *self.problem.lock().unwrap_or_else(PoisonError::into_inner) = problem;
    }

    /// Starts serving on `port` at each of `hosts` with `token`, replacing
    /// running servers.
    pub fn start(&self, inner: &Arc<Inner>, hosts: &[String], port: u16, token: String) -> io::Result<()> {
        self.stop();
        let mut servers = Vec::new();
        for host in hosts {
            match tiny_http::Server::http((host.as_str(), port)) {
                Ok(s) => servers.push(Arc::new(s)),
                Err(e) => {
                    for s in &servers {
                        s.unblock();
                    }
                    return Err(io::Error::other(e.to_string()));
                }
            }
        }
        let (shutdown_tx, shutdown_rx) = watch::channel(false);
        *self.shutdown.lock().unwrap_or_else(PoisonError::into_inner) = Some(shutdown_tx);
        *self.hosts.lock().unwrap_or_else(PoisonError::into_inner) = hosts.to_vec();
        self.set_problem(None);

        let req_sem = Arc::new(Semaphore::new(MAX_CONCURRENT_REQUESTS));
        let sse_sem = Arc::new(Semaphore::new(MAX_SSE_CLIENTS));

        for server in &servers {
            let server = server.clone();
            let weak = Arc::downgrade(inner);
            let rt = tokio::runtime::Handle::current();
            let token = Arc::new(token.clone());
            let req_sem = req_sem.clone();
            let sse_sem = sse_sem.clone();
            let shutdown_rx = shutdown_rx.clone();
            let events_tx = self.events_tx.clone();
            let sse_clients = self.sse_clients.clone();
            std::thread::spawn(move || {
                for req in server.incoming_requests() {
                    if *shutdown_rx.borrow() {
                        break;
                    }
                    let Some(inner) = weak.upgrade() else { break };
                    let path = req.url().split('?').next().unwrap_or("/").to_string();
                    let is_sse = path == "/api/events" && *req.method() == tiny_http::Method::Get;

                    if is_sse {
                        let Ok(permit) = sse_sem.clone().try_acquire_owned() else {
                            let _ = req.respond(json(503, &serde_json::json!({"error": "too many event streams"})));
                            continue;
                        };
                        let token = token.clone();
                        let shutdown_rx = shutdown_rx.clone();
                        let events_rx = events_tx.subscribe();
                        let sse_clients = sse_clients.clone();
                        let rt_handle = rt.clone();
                        rt.spawn(async move {
                            handle_sse(inner, rt_handle, token, req, shutdown_rx, events_rx, sse_clients, permit).await;
                        });
                        continue;
                    }

                    let Ok(permit) = req_sem.clone().try_acquire_owned() else {
                        let _ = req.respond(json(503, &serde_json::json!({"error": "server busy"})));
                        continue;
                    };
                    let token = token.clone();
                    let events_tx = events_tx.clone();
                    rt.spawn(async move {
                        let _permit = permit;
                        handle_async(inner, token, req, events_tx).await;
                    });
                }
            });
        }
        *self.servers.lock().unwrap_or_else(PoisonError::into_inner) = servers;
        Ok(())
    }
}

type Response = tiny_http::Response<io::Cursor<Vec<u8>>>;

fn json(status: u16, body: &impl Serialize) -> Response {
    let mut r = tiny_http::Response::from_data(serde_json::to_vec(body).unwrap_or_default()).with_status_code(status);
    r.add_header(tiny_http::Header::from_bytes("Content-Type", "application/json").expect("static header"));
    r.add_header(tiny_http::Header::from_bytes("Cache-Control", "no-store").expect("static header"));
    r
}

/// Equal-time comparison, so the token cannot be guessed byte by byte.
fn same(a: &str, b: &str) -> bool {
    a.len() == b.len() && a.bytes().zip(b.bytes()).fold(0u8, |acc, (x, y)| acc | (x ^ y)) == 0
}

fn is_authorized(req: &tiny_http::Request, token: &str) -> bool {
    req.headers()
        .iter()
        .find(|h| h.field.equiv("Authorization"))
        .and_then(|h| h.value.as_str().strip_prefix("Bearer "))
        .is_some_and(|t| same(t, token))
}

fn unauthorized_response(inner: &Inner) -> Response {
    let lang = inner.lang();
    let text = tower_core::tr!(
        lang,
        "这台手机还没有配对：在电脑上打开 Tower 设置里的配对链接或二维码。",
        "This phone is not paired: open the pairing link or QR code from Tower's Settings."
    );
    json(401, &serde_json::json!({"error": text}))
}

/// What the phone page shows. Read from the WAL reader pool: every open
/// page asks for it each second, and it must not queue behind (or hold up)
/// the single writer the supervisor's own work goes through.
fn state(inner: &Inner) -> crate::Result<State> {
    Ok(State {
        goals: inner.read_store(|st| st.summaries())?,
        inbox: inner.read_store(|st| st.open_inbox_items())?,
        lang: inner.lang().code().to_string(),
        max_running: inner.settings().max_concurrent,
    })
}

fn state_json(inner: &Inner) -> crate::Result<String> {
    Ok(serde_json::to_string(&state(inner)?).unwrap_or_else(|_| "{}".into()))
}

fn map_result(lang: tower_core::Lang, res: crate::Result<serde_json::Value>) -> Response {
    match res {
        Ok(v) => json(200, &v),
        Err(crate::Error::Store(tower_store::StoreError::NotFound(_))) => {
            let text = tower_core::tr!(
                lang,
                "这一项已经不在了（可能已在电脑上处理）。",
                "This is no longer here (it may have been handled at the desk)."
            );
            json(404, &serde_json::json!({"error": text}))
        }
        Err(e) => json(400, &serde_json::json!({"error": e.to_string()})),
    }
}

/// Non-blocking async handler for `/`, `/api/state`, `/api/answer`, `/api/snooze`, `/api/pause`.
async fn handle_async(
    inner: Arc<Inner>,
    token: Arc<String>,
    mut req: tiny_http::Request,
    events_tx: broadcast::Sender<()>,
) {
    let method = req.method().clone();
    let path = req.url().split('?').next().unwrap_or("/").to_string();

    if path == "/" && method == tiny_http::Method::Get {
        let mut r = tiny_http::Response::from_data(PAGE.as_bytes().to_vec());
        r.add_header(tiny_http::Header::from_bytes("Content-Type", "text/html; charset=utf-8").expect("static header"));
        // Pictures only from the page itself or drawn in it (`data:`, the marks its stylesheet draws), as docs/11 §11.10.
        r.add_header(
            tiny_http::Header::from_bytes(
                "Content-Security-Policy",
                "default-src 'self'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src 'self' data:",
            )
            .expect("static header"),
        );
        let _ = tokio::task::spawn_blocking(move || req.respond(r)).await;
        return;
    }

    if !is_authorized(&req, &token) {
        let resp = unauthorized_response(&inner);
        let _ = tokio::task::spawn_blocking(move || req.respond(resp)).await;
        return;
    }

    // Read body (bounded to 64 KiB) off the async executor.
    let (req, body) = match tokio::task::spawn_blocking(move || {
        let mut body = String::new();
        let _ = req.as_reader().take(64 * 1024).read_to_string(&mut body);
        (req, body)
    })
    .await
    {
        Ok(pair) => pair,
        Err(_) => return,
    };

    let lang = inner.lang();
    let arg: serde_json::Value = serde_json::from_str(&body).unwrap_or_default();
    let s = |k: &str| arg.get(k).and_then(|v| v.as_str()).unwrap_or_default().to_string();

    let response = match (method, path.as_str()) {
        (tiny_http::Method::Get, "/api/state") => {
            let inner2 = inner.clone();
            match tokio::time::timeout(
                STATE_TIMEOUT,
                tokio::task::spawn_blocking(move || Ok(serde_json::to_value(state(&inner2)?).unwrap_or_default())),
            )
            .await
            {
                Ok(Ok(res)) => map_result(lang, res),
                Ok(Err(e)) => json(500, &serde_json::json!({"error": e.to_string()})),
                Err(_) => json(
                    504,
                    &serde_json::json!({"error": tower_core::tr!(lang, "读取状态超时", "Timed out reading state")}),
                ),
            }
        }
        (tiny_http::Method::Post, "/api/answer") => {
            let inbox_id = s("inbox_id");
            let response_text = s("response");
            let check = inner.store(|st| st.inbox_item(&inbox_id)).and_then(|item| {
                if !answerable_away(&item, &response_text) {
                    return Err(crate::invalid(tower_core::tr!(
                        lang,
                        "这类决定只能在电脑上做",
                        "This decision can only be made at the desk"
                    )));
                }
                Ok(())
            });
            match check {
                Err(e) => map_result(lang, Err(e)),
                Ok(()) => match tokio::time::timeout(
                    ACTION_TIMEOUT,
                    crate::actions::answer(&inner, &inbox_id, &response_text),
                )
                .await
                {
                    Ok(Ok(())) => {
                        let _ = events_tx.send(());
                        json(200, &serde_json::json!({"ok": true}))
                    }
                    Ok(Err(e)) => map_result(lang, Err(e)),
                    Err(_) => json(
                        504,
                        &serde_json::json!({"error": tower_core::tr!(lang, "处理请求超时", "Request timed out")}),
                    ),
                },
            }
        }
        (tiny_http::Method::Post, "/api/snooze") => {
            let inbox_id = s("inbox_id");
            let until = arg.get("until").and_then(|v| v.as_i64());
            let res = inner.store(|st| st.snooze_inbox(&inbox_id, until)).map(|()| {
                inner.emit_inbox();
                let _ = events_tx.send(());
                serde_json::json!({"ok": true})
            });
            map_result(lang, res)
        }
        (tiny_http::Method::Post, "/api/pause") => {
            let goal = s("goal");
            let note = tower_core::tr!(lang, "你在手机上暂停了它", "You paused it from your phone");
            match tokio::time::timeout(
                ACTION_TIMEOUT,
                crate::run::pause(&inner, &goal, tower_core::PauseReason::Human, &note),
            )
            .await
            {
                Ok(Ok(())) => {
                    let _ = events_tx.send(());
                    json(200, &serde_json::json!({"ok": true}))
                }
                Ok(Err(e)) => map_result(lang, Err(e)),
                Err(_) => json(
                    504,
                    &serde_json::json!({"error": tower_core::tr!(lang, "暂停请求超时", "Pause request timed out")}),
                ),
            }
        }
        _ => json(404, &serde_json::json!({"error": tower_core::tr!(lang, "没有这个地址", "No such address")})),
    };

    let _ = tokio::task::spawn_blocking(move || req.respond(response)).await;
}

const SSE_RESPONSE_HEADERS: &[u8] = b"HTTP/1.1 200 OK\r\n\
Content-Type: text/event-stream; charset=utf-8\r\n\
Cache-Control: no-cache, no-store\r\n\
Connection: close\r\n\
X-Accel-Buffering: no\r\n\r\n";

/// Authenticated `GET /api/events` SSE handler using `Request::into_writer()`
/// so every event frame flushes to the phone immediately with zero buffering.
#[allow(clippy::too_many_arguments)]
async fn handle_sse(
    inner: Arc<Inner>,
    rt: tokio::runtime::Handle,
    token: Arc<String>,
    req: tiny_http::Request,
    mut shutdown_rx: watch::Receiver<bool>,
    mut events_rx: broadcast::Receiver<()>,
    sse_clients: Arc<AtomicUsize>,
    permit: tokio::sync::OwnedSemaphorePermit,
) {
    if !is_authorized(&req, &token) {
        let resp = unauthorized_response(&inner);
        let _ = tokio::task::spawn_blocking(move || req.respond(resp)).await;
        return;
    }

    let (chunk_tx, chunk_rx) = std_mpsc::sync_channel::<Vec<u8>>(32);
    let initial = match state_json(&inner) {
        Ok(payload) => payload,
        Err(e) => {
            let resp = json(500, &serde_json::json!({"error": e.to_string()}));
            let _ = tokio::task::spawn_blocking(move || req.respond(resp)).await;
            return;
        }
    };
    let initial_frame = format!("retry: 3000\nevent: state\ndata: {initial}\n\n");
    if chunk_tx.send(initial_frame.into_bytes()).is_err() {
        return;
    }

    sse_clients.fetch_add(1, Ordering::Relaxed);
    let clients_for_drop = sse_clients.clone();

    // Producer task: watches for explicit notifications, periodic state diffs,
    // keepalive ticks, and server shutdown. Drops `chunk_tx` when done so
    // the writer thread closes cleanly.
    rt.spawn(async move {
        let _permit = permit;
        let mut last_payload = initial;
        let mut poll = tokio::time::interval(SSE_POLL_INTERVAL);
        let mut ping = tokio::time::interval(SSE_KEEPALIVE_INTERVAL);
        poll.tick().await;
        ping.tick().await;

        loop {
            let push_state = tokio::select! {
                res = shutdown_rx.changed() => {
                    if res.is_err() || *shutdown_rx.borrow() {
                        break;
                    }
                    false
                }
                ev = events_rx.recv() => {
                    matches!(ev, Ok(()) | Err(broadcast::error::RecvError::Lagged(_)))
                }
                _ = poll.tick() => true,
                _ = ping.tick() => {
                    if chunk_tx.try_send(b": ping\n\n".to_vec()).is_err() {
                        break;
                    }
                    false
                }
            };
            if push_state {
                let inner2 = inner.clone();
                let next = match tokio::task::spawn_blocking(move || state_json(&inner2)).await {
                    Ok(Ok(p)) => p,
                    _ => continue,
                };
                if next != last_payload {
                    let frame = format!("event: state\ndata: {next}\n\n");
                    last_payload = next;
                    if chunk_tx.try_send(frame.into_bytes()).is_err() {
                        break;
                    }
                }
            }
        }
        clients_for_drop.fetch_sub(1, Ordering::Relaxed);
    });

    // Stream unbuffered SSE frames straight to the socket until EOF or client disconnect.
    let _ = tokio::task::spawn_blocking(move || {
        let mut writer = req.into_writer();
        if writer.write_all(SSE_RESPONSE_HEADERS).is_err() || writer.flush().is_err() {
            return;
        }
        while let Ok(chunk) = chunk_rx.recv() {
            if chunk.is_empty() || writer.write_all(&chunk).is_err() || writer.flush().is_err() {
                break;
            }
        }
    })
    .await;
}

/// Decisions that widen what the agent may do stay at the desk, where the
/// diff and the sentinels' findings are on screen: allowing a gated action,
/// overriding a sentinel, installing changed dependencies with the network.
/// Refusing, answering questions and continuing are fine from a phone.
fn answerable_away(item: &InboxItem, response: &str) -> bool {
    use tower_core::i18n::Choice;
    let choice = Choice::parse(response);
    match item.kind {
        tower_core::view::InboxKind::Approval => !matches!(choice, Some(Choice::Allow) | Some(Choice::Approve)),
        // Showing the agent held-out failures gives the tests away: also a
        // decision for the desk, where the output can be read in full.
        _ => !matches!(
            choice,
            Some(Choice::OverrideSentinel) | Some(Choice::InstallWithNetwork) | Some(Choice::ShowHeldOutFailure)
        ),
    }
}

/// The phone page: no data in it, everything fetched with the token from
/// the link's fragment (never sent to the server as part of a URL).
const PAGE: &str = include_str!("remote.html");

#[cfg(test)]
mod tests {
    use std::io::{BufRead, BufReader, Write};
    use std::net::TcpStream;
    use std::sync::Arc;
    use std::time::Duration;

    use tower_core::view::{InboxItem, InboxKind};

    use super::{Remote, answerable_away, new_token, same};

    fn item(kind: InboxKind) -> InboxItem {
        InboxItem {
            id: "i".into(),
            goal_id: "G-0001".into(),
            goal_title: "t".into(),
            kind,
            title: String::new(),
            subject: String::new(),
            body: String::new(),
            options: vec![],
            allow_text: true,
            created_at: 0,
            urgency: 0,
            tones: vec![],
            snoozed_until: None,
            code: None,
        }
    }

    #[test]
    fn decisions_that_widen_what_the_agent_may_do_stay_at_the_desk() {
        assert!(!answerable_away(&item(InboxKind::Approval), "Allow"));
        assert!(!answerable_away(&item(InboxKind::Approval), "允许"));
        assert!(answerable_away(&item(InboxKind::Approval), "Deny"));
        assert!(!answerable_away(&item(InboxKind::Paused), "I've checked, go to review"));
        assert!(!answerable_away(&item(InboxKind::Paused), "I've checked, install with the network"));
        assert!(answerable_away(&item(InboxKind::Paused), "Continue"));
        assert!(answerable_away(&item(InboxKind::Question), "use the order id"));
    }

    #[test]
    fn constant_time_compare_and_token_entropy() {
        let tok = new_token();
        assert_eq!(tok.len(), 64);
        assert!(same(&tok, &tok));
        assert!(!same(&tok, "short"));
        let mut wrong = tok.clone();
        wrong.replace_range(0..1, if tok.starts_with('a') { "b" } else { "a" });
        assert!(!same(&tok, &wrong));
    }

    #[tokio::test(flavor = "multi_thread")]
    async fn sse_endpoint_requires_bearer_token_and_does_not_block_api_state() {
        let tmp = tempfile::tempdir().unwrap();
        let cfg = crate::Config {
            paths: crate::Paths::new(tmp.path()),
            extension_source: std::path::PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../../extensions/tower-goal"),
            env: Some(crate::shell_env::ShellEnv::from_pairs(vec![("PATH".into(), "/usr/bin:/bin".into())])),
            demo_engine: None,
        };
        let sup = crate::Supervisor::start(cfg, Arc::new(crate::NullSink)).await.unwrap();
        let port = std::net::TcpListener::bind("127.0.0.1:0").unwrap().local_addr().unwrap().port();
        let token = new_token();
        let remote = Remote::default();
        remote.start(&sup.inner, &["127.0.0.1".into()], port, token.clone()).unwrap();

        // 1. Unauthenticated /api/events must return 401.
        let p = port;
        let status_unauth = tokio::task::spawn_blocking(move || {
            let mut s = TcpStream::connect(("127.0.0.1", p)).unwrap();
            s.set_read_timeout(Some(Duration::from_secs(3))).unwrap();
            write!(s, "GET /api/events HTTP/1.1\r\nHost: 127.0.0.1\r\nConnection: close\r\n\r\n").unwrap();
            let mut line = String::new();
            BufReader::new(s).read_line(&mut line).unwrap();
            line
        })
        .await
        .unwrap();
        assert!(status_unauth.contains("401"), "{status_unauth}");

        // 2. Open an authenticated SSE stream AND concurrently hit /api/state —
        //    /api/state must succeed immediately while the SSE stream stays open.
        let tok_sse = token.clone();
        let sse_handle = tokio::task::spawn_blocking(move || {
            let mut s = TcpStream::connect(("127.0.0.1", p)).unwrap();
            s.set_read_timeout(Some(Duration::from_secs(3))).unwrap();
            write!(
                s,
                "GET /api/events HTTP/1.1\r\nHost: 127.0.0.1\r\nAuthorization: Bearer {tok_sse}\r\nAccept: text/event-stream\r\n\r\n"
            )
            .unwrap();
            let mut reader = BufReader::new(s);
            let mut lines = Vec::new();
            for _ in 0..16 {
                let mut l = String::new();
                match reader.read_line(&mut l) {
                    Ok(0) | Err(_) => break,
                    Ok(_) => {
                        lines.push(l.clone());
                        if l.starts_with("data: ") {
                            break;
                        }
                    }
                }
            }
            (reader, lines.join(""))
        });

        let (sse_reader, first_chunk) = sse_handle.await.unwrap();
        assert!(first_chunk.contains("200"), "{first_chunk}");
        assert!(first_chunk.to_ascii_lowercase().contains("text/event-stream"), "{first_chunk}");
        assert!(first_chunk.contains("event: state"), "{first_chunk}");
        assert!(first_chunk.contains("\"goals\""), "{first_chunk}");

        // While SSE stream is still held open (`sse_reader` alive), /api/state answers concurrently.
        let tok_state = token.clone();
        let state_resp = tokio::task::spawn_blocking(move || {
            let mut s = TcpStream::connect(("127.0.0.1", p)).unwrap();
            s.set_read_timeout(Some(Duration::from_secs(2))).unwrap();
            write!(
                s,
                "GET /api/state HTTP/1.1\r\nHost: 127.0.0.1\r\nAuthorization: Bearer {tok_state}\r\nConnection: close\r\n\r\n"
            )
            .unwrap();
            let mut buf = String::new();
            std::io::Read::read_to_string(&mut s, &mut buf).unwrap();
            buf
        })
        .await
        .unwrap();
        assert!(state_resp.contains("200") && state_resp.contains("\"max_running\""), "{state_resp}");

        drop(sse_reader);
        remote.stop();
    }

    /// The phone page's state (polled every second per open page) is read
    /// from the WAL reader pool, so it neither waits for nor holds up the
    /// single writer the supervisor's own work goes through.
    #[tokio::test(flavor = "multi_thread")]
    async fn the_phone_state_is_read_without_the_writer() {
        let tmp = tempfile::tempdir().unwrap();
        let cfg = crate::Config {
            paths: crate::Paths::new(tmp.path()),
            extension_source: std::path::PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../../extensions/tower-goal"),
            env: Some(crate::shell_env::ShellEnv::from_pairs(vec![("PATH".into(), "/usr/bin:/bin".into())])),
            demo_engine: None,
        };
        let sup = crate::Supervisor::start(cfg, Arc::new(crate::NullSink)).await.unwrap();
        assert!(sup.inner.read_pool.is_some(), "a file-backed store has a reader pool");
        let inner = sup.inner.clone();
        let (held_tx, held_rx) = std::sync::mpsc::channel();
        let (release_tx, release_rx) = std::sync::mpsc::channel::<()>();
        let writer = std::thread::spawn(move || {
            let _guard = inner.store.lock().unwrap();
            held_tx.send(()).unwrap();
            let _ = release_rx.recv_timeout(Duration::from_secs(10));
        });
        held_rx.recv().unwrap();
        let inner = sup.inner.clone();
        let read = tokio::time::timeout(
            Duration::from_secs(2),
            tokio::task::spawn_blocking(move || super::state_json(&inner)),
        )
        .await;
        release_tx.send(()).unwrap();
        writer.join().unwrap();
        let json = read.expect("state read while the writer is busy").unwrap().unwrap();
        assert!(json.contains("\"goals\"") && json.contains("\"max_running\""), "{json}");
    }
}
