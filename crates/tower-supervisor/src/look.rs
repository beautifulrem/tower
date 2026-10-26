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

/// Starts the app, captures `url` into `out`, stops the app. Returns why
/// there is no screenshot otherwise.
#[allow(clippy::too_many_arguments)]
pub(crate) async fn capture(
    dir: &Path,
    env: &[(String, String)],
    profile: Option<&Path>,
    start: &str,
    url: &str,
    timeout: Duration,
    network: bool,
    out: &Path,
) -> Result<PathBuf, String> {
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
            return Err(format!("`{start}` exited ({status}) before {url} answered"));
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
        return Err(format!("{url} did not answer within {}s", timeout.as_secs()));
    }
    let profile_dir = tempfile_dir();
    let out_dir = out.parent().unwrap_or(Path::new("/nonexistent")).to_path_buf();
    // Confined by Tower's own profile on macOS (see `sandbox::browser_profile`).
    let confined = crate::sandbox::available().then(|| {
        let sb = profile_dir.join("browser.sb");
        // Your real home (the browser asks the system for it, not $HOME).
        let home = crate::paths::real(&std::env::var_os("HOME").map(PathBuf::from).unwrap_or_default());
        // Seatbelt matches resolved paths (`/var` is `/private/var`).
        let (profile_real, out_real) = (crate::paths::real(&profile_dir), crate::paths::real(&out_dir));
        let lib = home.join("Library");
        let support = app_support_dir(browser).map(|d| lib.join("Application Support").join(d));
        let mut readable = vec![lib.join("Fonts"), lib.join("Preferences"), lib.join("Caches")];
        readable.extend(support);
        let readable: Vec<&Path> = readable.iter().map(PathBuf::as_path).collect();
        let text = crate::sandbox::browser_profile(
            &home,
            &readable,
            &[&profile_real, &out_real],
            network,
            &crate::sandbox::proxy_ports(env),
        );
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
            return Err(format!("could not prepare the browser's sandbox: {e}"));
        }
        None => tokio::process::Command::new(browser),
    };
    cmd.env("HOME", &profile_dir);
    // Chromium looks up its default data folder (in your real home) before
    // reading --user-data-dir, and aborts if it cannot create it — which the
    // profile forbids. On a Mac that never opened this browser, Tower makes
    // the empty folder first.
    // (Your real home: the browser asks the system, not $HOME.)
    if let Some(sub) = app_support_dir(browser)
        && let Some(home) = std::env::var_os("HOME")
    {
        let _ = std::fs::create_dir_all(Path::new(&home).join("Library/Application Support").join(sub));
    }
    let shot = tokio::time::timeout(
        Duration::from_secs(45),
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
            "--virtual-time-budget=3000",
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
        .arg(format!("--screenshot={}", out.display()))
        .arg(url)
        .stdout(std::process::Stdio::null())
        .stderr(std::process::Stdio::piped())
        .output(),
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
            Err(format!("the browser could not take the screenshot ({}): {}", o.status, tail.join(" / ")))
        }
        Ok(Err(e)) => Err(format!("the browser did not start: {e}")),
        Err(_) => Err("the browser took too long".into()),
    }
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
}
