//! Tower away from the desk: a small page for your phone, served over your
//! own network (Tailscale or the local network), that lists what needs you
//! and lets you answer it — questions, approvals, pauses — and pause a
//! running goal. Off by default.
//!
//! Every request must carry the pairing token (a 256-bit random value shown
//! in Settings as a link and QR code). The page itself carries no data. On
//! a plain local network the token travels unencrypted; over Tailscale the
//! connection is encrypted, which is why Settings recommends it.

use std::io::Read;
use std::sync::{Arc, Mutex, PoisonError};

use serde::Serialize;
use tower_core::view::{GoalSummary, InboxItem};

use crate::Inner;

/// The running server, kept so it can be stopped.
#[derive(Default)]
pub struct Remote {
    server: Mutex<Option<Arc<tiny_http::Server>>>,
}

impl std::fmt::Debug for Remote {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("Remote").finish_non_exhaustive()
    }
}

#[derive(Serialize)]
struct State {
    goals: Vec<GoalSummary>,
    inbox: Vec<InboxItem>,
    lang: String,
}

/// A fresh pairing token.
pub fn new_token() -> String {
    format!("{}{}", uuid::Uuid::new_v4().simple(), uuid::Uuid::new_v4().simple())
}

/// Addresses the phone can use: the Tailscale address first, then the
/// local network's.
pub fn addresses(env: &crate::shell_env::ShellEnv) -> Vec<String> {
    let mut out = Vec::new();
    if let Some(ts) = env.which("tailscale")
        && let Ok(o) = std::process::Command::new(ts).args(["ip", "-4"]).output()
    {
        let ip = String::from_utf8_lossy(&o.stdout).lines().next().unwrap_or_default().trim().to_string();
        if !ip.is_empty() {
            out.push(ip);
        }
    }
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
    pub fn stop(&self) {
        if let Some(s) = self.server.lock().unwrap_or_else(PoisonError::into_inner).take() {
            s.unblock();
        }
    }

    /// Starts serving on `port` (all interfaces) with `token`, replacing a
    /// running server.
    pub fn start(&self, inner: &Arc<Inner>, port: u16, token: String) -> std::io::Result<()> {
        self.stop();
        let server =
            Arc::new(tiny_http::Server::http(("0.0.0.0", port)).map_err(|e| std::io::Error::other(e.to_string()))?);
        *self.server.lock().unwrap_or_else(PoisonError::into_inner) = Some(server.clone());
        let weak = Arc::downgrade(inner);
        let rt = tokio::runtime::Handle::current();
        std::thread::spawn(move || {
            for mut req in server.incoming_requests() {
                let Some(inner) = weak.upgrade() else { break };
                let response = handle(&inner, &rt, &token, &mut req);
                let _ = req.respond(response);
            }
        });
        Ok(())
    }
}

type Response = tiny_http::Response<std::io::Cursor<Vec<u8>>>;

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

fn handle(inner: &Arc<Inner>, rt: &tokio::runtime::Handle, token: &str, req: &mut tiny_http::Request) -> Response {
    let path = req.url().split('?').next().unwrap_or("/").to_string();
    if path == "/" && *req.method() == tiny_http::Method::Get {
        let mut r = tiny_http::Response::from_data(PAGE.as_bytes().to_vec());
        r.add_header(tiny_http::Header::from_bytes("Content-Type", "text/html; charset=utf-8").expect("static header"));
        r.add_header(
            tiny_http::Header::from_bytes(
                "Content-Security-Policy",
                "default-src 'self'; script-src 'unsafe-inline'; style-src 'unsafe-inline'",
            )
            .expect("static header"),
        );
        return r;
    }
    let authorized = req
        .headers()
        .iter()
        .find(|h| h.field.equiv("Authorization"))
        .and_then(|h| h.value.as_str().strip_prefix("Bearer "))
        .is_some_and(|t| same(t, token));
    if !authorized {
        return json(401, &serde_json::json!({"error": "not paired"}));
    }
    let sup = |f: &dyn Fn() -> crate::Result<serde_json::Value>| match f() {
        Ok(v) => json(200, &v),
        Err(e) => json(400, &serde_json::json!({"error": e.to_string()})),
    };
    let mut body = String::new();
    let _ = req.as_reader().take(64 * 1024).read_to_string(&mut body);
    let arg: serde_json::Value = serde_json::from_str(&body).unwrap_or_default();
    let s = |k: &str| arg.get(k).and_then(|v| v.as_str()).unwrap_or_default().to_string();
    match (req.method(), path.as_str()) {
        (tiny_http::Method::Get, "/api/state") => sup(&|| {
            let state = State {
                goals: inner.store(|st| st.summaries())?,
                inbox: inner.store(|st| st.open_inbox_items())?,
                lang: inner.lang().code().to_string(),
            };
            Ok(serde_json::to_value(state).unwrap_or_default())
        }),
        (tiny_http::Method::Post, "/api/answer") => sup(&|| {
            rt.block_on(crate::actions::answer(inner, &s("inbox_id"), &s("response")))?;
            Ok(serde_json::json!({"ok": true}))
        }),
        (tiny_http::Method::Post, "/api/pause") => sup(&|| {
            let note = tower_core::tr!(inner.lang(), "你在手机上暂停了它", "You paused it from your phone");
            rt.block_on(crate::run::pause(inner, &s("goal"), tower_core::PauseReason::Human, &note))?;
            Ok(serde_json::json!({"ok": true}))
        }),
        _ => json(404, &serde_json::json!({"error": "not found"})),
    }
}

/// The phone page: no data in it, everything fetched with the token from
/// the link's fragment (never sent to the server as part of a URL).
const PAGE: &str = include_str!("remote.html");
