//! Loopback ports: who listens where, and which proxies run on this Mac.

/// Default ports of common local proxies (Clash, Surge, V2Ray, Shadowsocks,
/// Privoxy, Tor). Local test servers rarely use them.
pub const COMMON_PROXY_PORTS: &[u16] =
    &[1080, 1086, 1087, 6152, 6153, 7890, 7891, 7897, 8118, 9050, 9150, 10808, 10809];

/// Ports of loopback proxies in the system's network settings (`scutil
/// --proxy`), which apps use even without `*_proxy` variables.
fn system_proxy_ports() -> Vec<u16> {
    let Ok(out) = std::process::Command::new("/usr/sbin/scutil").arg("--proxy").output() else { return Vec::new() };
    parse_scutil_proxy(&String::from_utf8_lossy(&out.stdout))
}

pub(super) fn parse_scutil_proxy(text: &str) -> Vec<u16> {
    let field = |k: &str| {
        text.lines().find_map(|l| l.trim().strip_prefix(k).and_then(|r| r.trim().strip_prefix(':')).map(str::trim))
    };
    let mut ports = Vec::new();
    for kind in ["HTTP", "HTTPS", "SOCKS"] {
        let host = field(&format!("{kind}Proxy ")).unwrap_or_default();
        let local = host == "127.0.0.1" || host == "localhost" || host == "::1";
        if local && let Some(p) = field(&format!("{kind}Port ")).and_then(|p| p.parse().ok()) {
            ports.push(p);
        }
    }
    ports
}

/// One TCP listener on loopback or on every interface.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Listener {
    pub port: u16,
    /// The process holding the socket, when the system says (`netstat`
    /// names it for every user's processes; `lsof` only for yours).
    pub pid: Option<i32>,
}

/// Every TCP listener on this Mac that loopback reaches: databases, dev
/// servers, other apps, other users' and the system's.
pub fn listeners() -> Vec<Listener> {
    let mut found = std::process::Command::new("/usr/sbin/netstat")
        .args(["-anv", "-p", "tcp"])
        .output()
        .map(|o| parse_netstat(&String::from_utf8_lossy(&o.stdout)))
        .unwrap_or_default();
    // Older releases' netstat may not name owners; lsof does for yours.
    if (found.is_empty() || found.iter().any(|l| l.pid.is_none()))
        && let Ok(out) =
            std::process::Command::new("/usr/sbin/lsof").args(["-nP", "-iTCP", "-sTCP:LISTEN", "-Fpn"]).output()
    {
        for l in parse_lsof(&String::from_utf8_lossy(&out.stdout)) {
            if !found.contains(&l) {
                found.push(l);
            }
        }
    }
    found
}

/// TCP ports something on this Mac already listens on (databases, dev
/// servers, other apps, a process an earlier run left behind).
pub fn listening_ports() -> Vec<u16> {
    let mut ports: Vec<u16> = listeners().into_iter().map(|l| l.port).collect();
    ports.sort_unstable();
    ports.dedup();
    ports
}

/// Whether nothing listens on `port` (on any loopback address or on every
/// interface) and Tower could take it itself.
pub fn port_free(port: u16) -> bool {
    !listeners().iter().any(|l| l.port == port) && std::net::TcpListener::bind(("127.0.0.1", port)).is_ok()
}

fn loopback_or_any(local: &str) -> bool {
    local.starts_with("127.") || local.starts_with("*.") || local.starts_with("::1.") || local.starts_with("localhost.")
}

/// Listening sockets from `netstat -anv`: the local address is the fourth
/// column; the owner is `name:pid` after the buffer sizes on current macOS
/// (names may hold spaces; eight fixed columns follow), or a bare pid on
/// older releases.
pub(super) fn parse_netstat(text: &str) -> Vec<Listener> {
    let mut out = Vec::new();
    for line in text.lines().filter(|l| l.contains("LISTEN")) {
        let cols: Vec<&str> = line.split_whitespace().collect();
        let Some(local) = cols.get(3).filter(|l| loopback_or_any(l)) else { continue };
        let Some(port) = local.rsplit('.').next().and_then(|p| p.parse().ok()) else { continue };
        let start = cols.len().min(10);
        let owner = &cols[start..cols.len().saturating_sub(8).max(start)];
        let pid = match owner.last() {
            Some(last) if last.contains(':') => last.rsplit(':').next().and_then(|p| p.parse().ok()),
            _ => cols.get(10).and_then(|c| c.parse().ok()),
        };
        out.push(Listener { port, pid });
    }
    out
}

pub(super) fn parse_lsof(text: &str) -> Vec<Listener> {
    let mut out = Vec::new();
    let mut pid = None;
    for line in text.lines() {
        if let Some(p) = line.strip_prefix('p') {
            pid = p.parse().ok();
        } else if let Some(n) = line.strip_prefix('n')
            && (n.starts_with('*') || n.starts_with("127.") || n.starts_with("[::1]") || n.starts_with("localhost"))
            && let Some(port) = n.rsplit(':').next().and_then(|p| p.parse().ok())
        {
            let l = Listener { port, pid };
            if !out.contains(&l) {
                out.push(l);
            }
        }
    }
    out
}

/// Ports of proxies named in `*_proxy` environment variables or the
/// system's proxy settings, plus common proxy apps'.
pub fn proxy_ports(env: &[(String, String)]) -> Vec<u16> {
    let mut ports: Vec<u16> = COMMON_PROXY_PORTS.to_vec();
    ports.extend(system_proxy_ports());
    for (k, v) in env {
        if k.to_ascii_lowercase().ends_with("_proxy") && !k.eq_ignore_ascii_case("no_proxy") {
            let host_port = v.rsplit("://").next().unwrap_or(v).rsplit('@').next().unwrap_or(v);
            if let Some(port) = host_port.trim_end_matches('/').rsplit(':').next().and_then(|p| p.parse().ok()) {
                ports.push(port);
            }
        }
    }
    ports.sort_unstable();
    ports.dedup();
    ports
}
