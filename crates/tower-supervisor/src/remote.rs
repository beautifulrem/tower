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

/// The running server, kept so it can be stopped, with the address it
/// listens on and why it is not running when it should be.
#[derive(Default)]
pub struct Remote {
    server: Mutex<Option<Arc<tiny_http::Server>>>,
    host: Mutex<Option<String>>,
    problem: Mutex<Option<String>>,
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

/// Where to listen: Tailscale's address (the only encrypted way in), or
/// every interface when the settings ask for the local network. Without
/// either there is nowhere safe to listen: `None`.
pub fn listen_host(env: &crate::shell_env::ShellEnv, local_network: bool) -> Option<String> {
    if local_network { Some("0.0.0.0".into()) } else { tailscale_ip(env) }
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
    pub fn stop(&self) {
        if let Some(s) = self.server.lock().unwrap_or_else(PoisonError::into_inner).take() {
            s.unblock();
        }
        *self.host.lock().unwrap_or_else(PoisonError::into_inner) = None;
    }

    /// The address it listens on, if it is running.
    pub fn host(&self) -> Option<String> {
        self.host.lock().unwrap_or_else(PoisonError::into_inner).clone()
    }

    /// Why it is not running although it is turned on.
    pub fn problem(&self) -> Option<String> {
        self.problem.lock().unwrap_or_else(PoisonError::into_inner).clone()
    }

    pub fn set_problem(&self, problem: Option<String>) {
        *self.problem.lock().unwrap_or_else(PoisonError::into_inner) = problem;
    }

    /// Starts serving on `port` at `host` with `token`, replacing a running
    /// server.
    pub fn start(&self, inner: &Arc<Inner>, host: &str, port: u16, token: String) -> std::io::Result<()> {
        self.stop();
        let server = Arc::new(tiny_http::Server::http((host, port)).map_err(|e| std::io::Error::other(e.to_string()))?);
        *self.server.lock().unwrap_or_else(PoisonError::into_inner) = Some(server.clone());
        *self.host.lock().unwrap_or_else(PoisonError::into_inner) = Some(host.to_string());
        self.set_problem(None);
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
    let lang = inner.lang();
    if !authorized {
        let text = tower_core::tr!(
            lang,
            "这台手机还没有配对：在电脑上打开 Tower 设置里的配对链接或二维码。",
            "This phone is not paired: open the pairing link or QR code from Tower's Settings."
        );
        return json(401, &serde_json::json!({"error": text}));
    }
    // Errors are sentences in the interface language, like at the desk.
    let sup = |f: &dyn Fn() -> crate::Result<serde_json::Value>| match f() {
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
            let item = inner.store(|st| st.inbox_item(&s("inbox_id")))?;
            if !answerable_away(&item, &s("response")) {
                return Err(crate::invalid(tower_core::tr!(
                    inner.lang(),
                    "这类决定只能在电脑上做",
                    "This decision can only be made at the desk"
                )));
            }
            rt.block_on(crate::actions::answer(inner, &s("inbox_id"), &s("response")))?;
            Ok(serde_json::json!({"ok": true}))
        }),
        (tiny_http::Method::Post, "/api/snooze") => sup(&|| {
            let until = arg.get("until").and_then(|v| v.as_i64());
            inner.store(|st| st.snooze_inbox(&s("inbox_id"), until))?;
            inner.emit_inbox();
            Ok(serde_json::json!({"ok": true}))
        }),
        (tiny_http::Method::Post, "/api/pause") => sup(&|| {
            let note = tower_core::tr!(inner.lang(), "你在手机上暂停了它", "You paused it from your phone");
            rt.block_on(crate::run::pause(inner, &s("goal"), tower_core::PauseReason::Human, &note))?;
            Ok(serde_json::json!({"ok": true}))
        }),
        _ => json(404, &serde_json::json!({"error": tower_core::tr!(lang, "没有这个地址", "No such address")})),
    }
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
    use tower_core::view::{InboxItem, InboxKind};

    use super::answerable_away;

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
}
