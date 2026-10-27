//! Screenshots for `look` criteria: the verifier starts the app (in the
//! goal's sandbox), waits until its URL answers on this machine, and asks a
//! Chromium-based browser installed on the Mac for a headless screenshot.
//! The human judges before and after in the review; nothing here decides.

use std::path::{Path, PathBuf};
use std::time::{Duration, Instant};

const BROWSERS: &[&str] = &[
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/Applications/Chromium.app/Contents/MacOS/Chromium",
    "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
    "/Applications/Brave Browser.app/Contents/MacOS/Brave Browser",
    "/Applications/Arc.app/Contents/MacOS/Arc",
];

/// Where each browser keeps its default data, under Application Support.
fn app_support_dir(browser: &str) -> Option<&'static str> {
    [
        ("Google Chrome", "Google/Chrome"),
        ("Chromium", "Chromium"),
        ("Microsoft Edge", "Microsoft Edge"),
        ("Brave Browser", "BraveSoftware/Brave-Browser"),
        ("Arc", "Arc/User Data"),
    ]
    .into_iter()
    .find(|(name, _)| browser.ends_with(&format!("/{name}")))
    .map(|(_, dir)| dir)
}

pub(crate) fn browser() -> Option<&'static str> {
    BROWSERS.iter().copied().find(|b| Path::new(b).is_file())
}

/// `host:port` and path of a local `http://` URL.
fn split(url: &str) -> Option<(String, String)> {
    let rest = url.strip_prefix("http://")?;
    let (host, path) = rest.split_once('/').map_or((rest, "/".to_string()), |(h, p)| (h, format!("/{p}")));
    let host = if host.contains(':') { host.to_string() } else { format!("{host}:80") };
    Some((host.replace("localhost", "127.0.0.1"), path))
}

/// Whether the URL answers with a non-error status.
fn answers(url: &str) -> bool {
    use std::io::{Read, Write};
    let Some((host, path)) = split(url) else { return false };
    let Ok(addr) = host.parse::<std::net::SocketAddr>() else { return false };
    let Ok(mut s) = std::net::TcpStream::connect_timeout(&addr, Duration::from_millis(500)) else { return false };
    let _ = s.set_read_timeout(Some(Duration::from_secs(2)));
    if write!(s, "GET {path} HTTP/1.0\r\nHost: {host}\r\n\r\n").is_err() {
        return false;
    }
    let mut head = [0u8; 16];
    let n = s.read(&mut head).unwrap_or(0);
    let line = String::from_utf8_lossy(&head[..n]);
    line.split_whitespace().nth(1).and_then(|c| c.parse::<u16>().ok()).is_some_and(|c| c < 400)
}

/// Why there is no screenshot.
#[derive(Debug)]
pub(crate) enum LookError {
    /// The picture could not be taken (the page, the browser, a step).
    Shot(String),
    /// The picture could not be evidence: something other than the app the
    /// verification started holds or answers its port. A stored pause note.
    Environment(String),
}

impl From<String> for LookError {
    fn from(s: String) -> Self {
        LookError::Shot(s)
    }
}

impl From<&str> for LookError {
    fn from(s: &str) -> Self {
        LookError::Shot(s.to_string())
    }
}

/// `name, pid n` of a listener, as far as the system says.
fn holder(pid: Option<i32>) -> String {
    let Some(pid) = pid else { return "?".into() };
    let name = std::process::Command::new("/bin/ps")
        .args(["-o", "comm=", "-p", &pid.to_string()])
        .output()
        .ok()
        .map(|o| String::from_utf8_lossy(&o.stdout).trim().rsplit('/').next().unwrap_or_default().to_string())
        .filter(|n| !n.is_empty())
        .unwrap_or_else(|| "?".into());
    format!("{name}, pid {pid}")
}

/// Starts the app, captures `url` into `out`, stops the app. The picture
/// is only ever of the app this call started: the port must be free
/// before it starts, and every listener on it afterwards must be in the
/// verification's own sandbox (`dir`'s; without a sandbox, the app's
/// process group).
#[allow(clippy::too_many_arguments)]
pub(crate) async fn capture(
    id: &str,
    root: &Path,
    dir: &Path,
    env: &[(String, String)],
    profile: Option<&Path>,
    start: &str,
    url: &str,
    timeout: Duration,
    network: bool,
    steps: &[String],
    out: &Path,
) -> Result<PathBuf, LookError> {
    let steps: Vec<tower_core::contract::LookStep> = steps
        .iter()
        .map(|s| tower_core::contract::LookStep::parse(s))
        .collect::<Result<_, _>>()
        .map_err(|e| format!("a step is not understood: {e}"))?;
    let port =
        split(url).and_then(|(h, _)| h.rsplit(':').next()?.parse::<u16>().ok()).ok_or("the URL names no port")?;
    // Taken already: whatever answers would not be the app started here.
    // (An app this verification stopped a moment ago may still be on its
    // way out: a few seconds' grace.)
    let taken = tokio::task::spawn_blocking(move || {
        for _ in 0..20 {
            if crate::sandbox::port_free(port) {
                return None;
            }
            std::thread::sleep(Duration::from_millis(250));
        }
        Some(crate::sandbox::listeners().into_iter().find(|l| l.port == port).and_then(|l| l.pid))
    })
    .await
    .unwrap_or(None);
    if let Some(pid) = taken {
        let note = tower_core::i18n::PauseNote::PortTaken { criterion: id.into(), port, holder: holder(pid) };
        return Err(LookError::Environment(note.encode()));
    }
    let browser = browser().ok_or("no Chrome, Chromium, Edge, Brave or Arc to take screenshots with")?;
    if let Some(parent) = out.parent() {
        std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    let mut app = tokio::process::Command::new("/bin/sh")
        .arg("-c")
        .arg(crate::verify::command_for(start, profile))
        .current_dir(dir)
        .env_clear()
        .envs(env.iter().cloned())
        .stdin(std::process::Stdio::null())
        .stdout(std::process::Stdio::null())
        .stderr(std::process::Stdio::null())
        .process_group(0)
        .spawn()
        .map_err(|e| format!("could not start `{start}`: {e}"))?;
    let pgid = app.id();
    let stop = || {
        if let Some(pg) = pgid {
            let _ = std::process::Command::new("/bin/kill").args(["-KILL", &format!("-{pg}")]).status();
        }
    };
    let deadline = Instant::now() + timeout;
    let mut ready = false;
    while Instant::now() < deadline {
        if let Ok(Some(status)) = app.try_wait() {
            stop();
            return Err(format!("`{start}` exited ({status}) before {url} answered").into());
        }
        let u = url.to_string();
        if tokio::task::spawn_blocking(move || answers(&u)).await.unwrap_or(false) {
            ready = true;
            break;
        }
        tokio::time::sleep(Duration::from_millis(500)).await;
    }
    if !ready {
        stop();
        return Err(format!("{url} did not answer within {}s", timeout.as_secs()).into());
    }
    // Every listener on the port must be the verification's own, and the
    // browser reaches only the ports the app's processes listen on.
    let own = Own { root: root.to_path_buf(), dir: dir.to_path_buf(), pgid: pgid.map(|p| p as i32) };
    let (foreign, app_ports) =
        tokio::task::spawn_blocking(move || own.check(port)).await.unwrap_or((Some(None), Vec::new()));
    if let Some(pid) = foreign {
        stop();
        let note = tower_core::i18n::PauseNote::NotOwnListener { criterion: id.into(), port, holder: holder(pid) };
        return Err(LookError::Environment(note.encode()));
    }
    let profile_dir = tempfile_dir();
    let out_dir = out.parent().unwrap_or(Path::new("/nonexistent")).to_path_buf();
    // Chromium looks up its default data folder (in your real home: it asks
    // the system, not $HOME) before reading --user-data-dir, and aborts if it
    // cannot create it — which the profile forbids. Its crash handler starts
    // even with crash reporting off and keeps its database there, whatever
    // the flags say; without one it takes the browser down (seen on fresh CI
    // runners). Tower makes both folders first, and the crash folder is the
    // one place in your home the browser may write.
    let crash_dir = app_support_dir(browser).and_then(|sub| {
        let home = PathBuf::from(std::env::var_os("HOME")?);
        let dir = home.join("Library/Application Support").join(sub).join("Crashpad");
        std::fs::create_dir_all(&dir).ok().map(|_| crate::paths::real(&dir))
    });
    // Confined by Tower's own profile on macOS (see `sandbox::browser_profile`).
    let confined = crate::sandbox::available().then(|| {
        let sb = profile_dir.join("browser.sb");
        // Your real home (the browser asks the system for it, not $HOME).
        let home = crate::paths::real(&std::env::var_os("HOME").map(PathBuf::from).unwrap_or_default());
        // Seatbelt matches resolved paths (`/var` is `/private/var`).
        let (profile_real, out_real) = (crate::paths::real(&profile_dir), crate::paths::real(&out_dir));
        let fonts = home.join("Library/Fonts");
        let user_temp = user_temp_dir();
        let writable: Vec<&Path> = [Some(profile_real.as_path()), Some(out_real.as_path()), crash_dir.as_deref()]
            .into_iter()
            .flatten()
            .collect();
        let text = crate::sandbox::browser_profile(&crate::sandbox::BrowserSpec {
            browser: Path::new(browser),
            home: &home,
            readable: &[&fonts],
            writable: &writable,
            user_temp: user_temp.as_deref(),
            ports: &app_ports,
            network,
            proxy_ports: &crate::sandbox::proxy_ports(env),
        });
        std::fs::write(&sb, text).map(|_| sb)
    });
    let mut cmd = match &confined {
        Some(Ok(sb)) => {
            let mut c = tokio::process::Command::new("/usr/bin/sandbox-exec");
            c.arg("-f").arg(sb).arg(browser).arg("--no-sandbox");
            c
        }
        Some(Err(e)) => {
            stop();
            return Err(format!("could not prepare the browser's sandbox: {e}").into());
        }
        None => tokio::process::Command::new(browser),
    };
    cmd.env("HOME", &profile_dir);
    cmd.args([
        "--headless=new",
        "--disable-breakpad",
        "--disable-crash-reporter",
        // A throwaway home has no keychain entry; never ask for one.
        "--use-mock-keychain",
        "--password-store=basic",
        "--disable-gpu",
        "--hide-scrollbars",
        "--no-first-run",
        "--no-default-browser-check",
        "--force-device-scale-factor=2",
        "--window-size=1280,800",
    ])
    .arg(format!("--user-data-dir={}", profile_dir.display()))
    // The page is the agent's code, and the browser runs outside the
    // sandbox: without the network, everything but this machine goes
    // to a proxy that does not exist.
    .args(if network {
        vec![]
    } else {
        vec![
            "--proxy-server=http://127.0.0.1:9".to_string(),
            "--proxy-bypass-list=<local>".to_string(),
            // No name resolution beyond this machine, no direct UDP.
            "--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE localhost, EXCLUDE 127.0.0.1".to_string(),
            "--force-webrtc-ip-handling-policy=disable_non_proxied_udp".to_string(),
        ]
    })
    .stdout(std::process::Stdio::null())
    .stderr(std::process::Stdio::piped());
    if !steps.is_empty() {
        // Steps first: the browser is driven over its DevTools protocol.
        let r = with_steps(&mut cmd, url, &steps, out, timeout.max(Duration::from_secs(10))).await;
        stop();
        let _ = std::fs::remove_dir_all(&profile_dir);
        return r.map(|_| out.to_path_buf()).map_err(LookError::Shot);
    }
    let shot = tokio::time::timeout(
        Duration::from_secs(45),
        cmd.arg("--virtual-time-budget=3000").arg(format!("--screenshot={}", out.display())).arg(url).output(),
    )
    .await;
    stop();
    let _ = std::fs::remove_dir_all(&profile_dir);
    match shot {
        Ok(Ok(o)) if o.status.success() && out.is_file() => Ok(out.to_path_buf()),
        Ok(Ok(o)) => {
            // Chromium's last words, without its noise about displays.
            let err = String::from_utf8_lossy(&o.stderr);
            let mut tail: Vec<&str> =
                err.lines().filter(|l| !l.contains("DisplayLink") && !l.trim().is_empty()).rev().take(6).collect();
            tail.reverse();
            Err(format!("the browser could not take the screenshot ({}): {}", o.status, tail.join(" / ")).into())
        }
        Ok(Err(e)) => Err(format!("the browser did not start: {e}").into()),
        Err(_) => Err("the browser took too long".into()),
    }
}

/// Starts the browser with its DevTools endpoint, does `steps` on `url`
/// and writes the picture to `out`.
async fn with_steps(
    cmd: &mut tokio::process::Command,
    url: &str,
    steps: &[tower_core::contract::LookStep],
    out: &Path,
    timeout: Duration,
) -> Result<(), String> {
    use tokio::io::AsyncBufReadExt;
    let mut child = cmd
        .args(["--remote-debugging-port=0", "about:blank"])
        .kill_on_drop(true)
        .spawn()
        .map_err(|e| format!("the browser did not start: {e}"))?;
    let stderr = child.stderr.take().ok_or("no browser output")?;
    let mut lines = tokio::io::BufReader::new(stderr).lines();
    let found = tokio::time::timeout(Duration::from_secs(20), async {
        while let Ok(Some(line)) = lines.next_line().await {
            if let Some(i) = line.find("ws://") {
                return Some(line[i..].trim().to_string());
            }
        }
        None
    })
    .await;
    let Ok(Some(ws)) = found else {
        let _ = child.kill().await;
        return Err("the browser did not open its DevTools endpoint".into());
    };
    // Keep reading its output so it never blocks on a full pipe.
    tokio::spawn(async move { while let Ok(Some(_)) = lines.next_line().await {} });
    let (url, steps, out) = (url.to_string(), steps.to_vec(), out.to_path_buf());
    let r = tokio::task::spawn_blocking(move || crate::look_cdp::drive(&ws, &url, &steps, &out, timeout))
        .await
        .map_err(|e| e.to_string())?;
    let _ = child.kill().await;
    r
}

/// Who may answer a `look` URL: the verification's own processes.
struct Own {
    root: PathBuf,
    dir: PathBuf,
    pgid: Option<i32>,
}

impl Own {
    fn holds(&self, pid: i32, id: &crate::procs::Identity) -> bool {
        if crate::sandbox::available() {
            id.holds(pid)
        } else {
            self.pgid.is_some() && crate::procs::pgid(pid) == self.pgid
        }
    }

    /// A listener on `port` that is not the verification's own (`Some(pid)`,
    /// the pid when the system names one), and the ports the
    /// verification's own processes listen on.
    fn check(&self, port: u16) -> (Option<Option<i32>>, Vec<u16>) {
        let id = crate::procs::Identity::new(std::slice::from_ref(&self.dir), &crate::procs::marker(&self.root));
        let all = crate::sandbox::listeners();
        let mine = |l: &crate::sandbox::Listener| l.pid.is_some_and(|p| self.holds(p, &id));
        let foreign = all.iter().filter(|l| l.port == port).find(|l| !mine(l)).map(|l| l.pid);
        let mut ports: Vec<u16> = all.iter().filter(|l| mine(l)).map(|l| l.port).collect();
        ports.push(port);
        ports.sort_unstable();
        ports.dedup();
        (foreign, ports)
    }
}

/// Your per-user temporary folders (the parent of `…/T` and `…/C`), where
/// a browser keeps its single-instance socket whatever `TMPDIR` says.
fn user_temp_dir() -> Option<PathBuf> {
    let out = std::process::Command::new("/usr/bin/getconf").arg("DARWIN_USER_TEMP_DIR").output().ok()?;
    let t = PathBuf::from(String::from_utf8_lossy(&out.stdout).trim());
    let parent = crate::paths::real(t.parent()?);
    parent.starts_with("/private/var/folders").then_some(parent)
}

fn tempfile_dir() -> PathBuf {
    let d = std::env::temp_dir().join(format!("tower-look-{}", uuid::Uuid::new_v4().simple()));
    let _ = std::fs::create_dir_all(&d);
    d
}

/// A PNG under `root` as a data URL, for the interface.
pub(crate) fn data_url(root: &Path, file: &str) -> Option<String> {
    let path = std::fs::canonicalize(file).ok()?;
    if !path.starts_with(std::fs::canonicalize(root).ok()?) {
        return None;
    }
    let bytes = std::fs::read(path).ok()?;
    Some(format!("data:image/png;base64,{}", base64(&bytes)))
}

fn base64(bytes: &[u8]) -> String {
    const T: &[u8; 64] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    let mut out = String::with_capacity(bytes.len().div_ceil(3) * 4);
    for chunk in bytes.chunks(3) {
        let b = [chunk[0], *chunk.get(1).unwrap_or(&0), *chunk.get(2).unwrap_or(&0)];
        let n = (u32::from(b[0]) << 16) | (u32::from(b[1]) << 8) | u32::from(b[2]);
        out.push(T[(n >> 18) as usize & 63] as char);
        out.push(T[(n >> 12) as usize & 63] as char);
        out.push(if chunk.len() > 1 { T[(n >> 6) as usize & 63] as char } else { '=' });
        out.push(if chunk.len() > 2 { T[n as usize & 63] as char } else { '=' });
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn base64_and_urls() {
        assert_eq!(base64(b"Man"), "TWFu");
        assert_eq!(base64(b"Ma"), "TWE=");
        assert_eq!(base64(b"M"), "TQ==");
        assert_eq!(split("http://localhost:3000/cart").unwrap(), ("127.0.0.1:3000".into(), "/cart".into()));
        assert_eq!(split("http://127.0.0.1:8080").unwrap(), ("127.0.0.1:8080".into(), "/".into()));
        assert!(split("https://example.com").is_none());
    }

    /// Only a listener in the verification's own sandbox counts as the
    /// app: one of yours (or anyone else's) on the port does not, and the
    /// browser is given only the app's ports.
    #[cfg(target_os = "macos")]
    #[test]
    fn the_app_is_told_from_another_program_on_its_port() {
        if !crate::sandbox::available() {
            return;
        }
        let tmp = tempfile::tempdir_in("/tmp").unwrap();
        let root = crate::paths::real(tmp.path());
        let dir = root.join("checkout");
        std::fs::create_dir_all(&dir).unwrap();
        crate::procs::ensure_marker(&root).unwrap();
        let sb = root.join("v.sb");
        std::fs::write(
            &sb,
            format!(
                "(version 1)\n(allow default)\n(deny file-write*)\n(allow file-write* (subpath \"{}\") (literal \"/dev/null\"))\n",
                dir.display()
            ),
        )
        .unwrap();
        let port = std::net::TcpListener::bind("127.0.0.1:0").unwrap().local_addr().unwrap().port();
        let mut app = std::process::Command::new("/usr/bin/sandbox-exec")
            .arg("-f")
            .arg(&sb)
            .args(["/usr/bin/nc", "-l", "127.0.0.1", &port.to_string()])
            .spawn()
            .unwrap();
        let yours = std::net::TcpListener::bind("127.0.0.1:0").unwrap();
        let your_port = yours.local_addr().unwrap().port();
        std::thread::sleep(Duration::from_millis(400));
        let own = Own { root: root.clone(), dir, pgid: None };
        let (foreign, ports) = own.check(port);
        assert_eq!(foreign, None, "the verification's own listener");
        assert!(ports.contains(&port) && !ports.contains(&your_port), "{ports:?}");
        let (foreign, _) = own.check(your_port);
        assert_eq!(foreign, Some(Some(std::process::id() as i32)), "yours is not the app");
        let _ = app.kill();
        let _ = app.wait();
    }
}
