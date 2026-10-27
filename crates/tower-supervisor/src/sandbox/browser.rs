//! The profile of the browser that screenshots a `look` criterion.
//!
//! The page is the agent's code, and the browser runs with its own sandbox
//! off (sandboxes cannot nest), so Tower confines the whole browser here:
//! closed by default like the other profiles, it may start its own helpers,
//! read the system, its app bundle and the few parts of your Library a
//! browser needs to start, write only its throwaway profile, the
//! screenshot's folder and your per-user temporary folder, and reach on
//! this machine only the ports it is given (the app the verification
//! started), never a proxy. Credential stores are never readable, and the
//! keychain service is never reachable.

use std::path::Path;

use super::{NETWORK, SECRETS, q};

/// What one screenshot browser may touch.
#[derive(Debug, Clone)]
pub struct BrowserSpec<'a> {
    /// The browser's executable (its app bundle becomes readable).
    pub browser: &'a Path,
    /// Your real home (the browser asks the system for it, not `$HOME`).
    pub home: &'a Path,
    /// Readable besides the system: fonts, preferences, the browser's data.
    pub readable: &'a [&'a Path],
    /// Read-write: the throwaway profile and the screenshot's folder.
    pub writable: &'a [&'a Path],
    /// Your per-user temporary folder (`getconf DARWIN_USER_TEMP_DIR`'s
    /// parent): the browser keeps its single-instance socket there.
    pub user_temp: Option<&'a Path>,
    /// Loopback ports the page may reach (the app's own listeners).
    pub ports: &'a [u16],
    /// The contract allows the network.
    pub network: bool,
    /// Proxies listening on loopback: never reachable without the network.
    pub proxy_ports: &'a [u16],
}

/// Mach services a headless Chromium needs to start and render (fonts,
/// preferences, logging, launch services). Not the keychain, not the
/// pasteboard, not other apps' services.
const BROWSER_MACH: &[&str] = &[
    "com.apple.system.opendirectoryd.libinfo",
    "com.apple.system.opendirectoryd.membership",
    "com.apple.system.notification_center",
    "com.apple.system.logger",
    "com.apple.logd",
    "com.apple.diagnosticd",
    "com.apple.cfprefsd.daemon",
    "com.apple.cfprefsd.agent",
    "com.apple.FontObjectsServer",
    "com.apple.fonts",
    "com.apple.bsd.dirhelper",
    "com.apple.windowserver.active",
    "com.apple.coreservices.launchservicesd",
    "com.apple.CoreServices.coreservicesd",
    "com.apple.lsd.mapdb",
    "com.apple.PowerManagement.control",
];

/// The preference domains of the browsers `look` uses.
const BROWSER_DOMAINS: &[&str] = &[
    "com.google.Chrome",
    "org.chromium.Chromium",
    "com.microsoft.edgemac",
    "com.brave.Browser",
    "company.thebrowser.Browser",
];

/// The bundle that holds `exe` (`…/Name.app`), or its folder.
fn bundle(exe: &Path) -> &Path {
    exe.ancestors().find(|a| a.extension().is_some_and(|e| e == "app")).unwrap_or(exe.parent().unwrap_or(exe))
}

pub fn browser_profile(spec: &BrowserSpec<'_>) -> String {
    let home = spec.home;
    let app = bundle(spec.browser);
    let mut s = String::from("(version 1)\n(deny default)\n");
    s.push_str(&format!("(allow process-fork)\n(allow process-exec (subpath {}))\n", q(app)));
    s.push_str("(allow signal (target same-sandbox))\n(allow process-info* (target same-sandbox))\n");
    s.push_str("(allow sysctl-read)\n(allow system-info)\n(allow ipc-posix-shm* ipc-posix-sem)\n");
    // Where things are and how big (not what they hold): Chromium looks at
    // many paths while starting.
    s.push_str("(allow file-read-metadata)\n");
    s.push_str("(allow file-read*\n  (literal \"/\")\n");
    for p in [
        "/System",
        "/usr/lib",
        "/usr/share",
        "/Library/Fonts",
        "/Library/Apple",
        "/Library/Preferences/Logging",
        "/private/var/db/timezone",
        "/private/etc",
        "/dev",
    ] {
        s.push_str(&format!("  (subpath \"{p}\")\n"));
    }
    s.push_str("  (literal \"/Library/Preferences/.GlobalPreferences.plist\")\n");
    s.push_str(&format!("  (literal {})\n", q(&home.join(".CFUserTextEncoding"))));
    s.push_str(&format!("  (subpath {})\n", q(app)));
    for r in spec.readable.iter().chain(spec.writable).chain(spec.user_temp.as_slice()) {
        s.push_str(&format!("  (subpath {})\n", q(r)));
    }
    s.push_str(")\n(deny file-read* file-write*\n");
    for secret in SECRETS {
        s.push_str(&format!("  (subpath {})\n", q(&home.join(secret))));
    }
    s.push_str(")\n(allow file-write*\n");
    for w in spec.writable.iter().chain(spec.user_temp.as_slice()) {
        s.push_str(&format!("  (subpath {})\n", q(w)));
    }
    s.push_str("  (literal \"/dev/null\")\n  (literal \"/dev/dtracehelper\")\n  (regex #\"^/dev/fd/\"))\n");
    s.push_str("(allow file-ioctl (literal \"/dev/dtracehelper\"))\n");
    // Preferences are read through cfprefsd: the global domain and the
    // browser's own, nothing of other apps.
    s.push_str("(allow user-preference-read\n  (preference-domain \"kCFPreferencesAnyApplication\")\n");
    for d in BROWSER_DOMAINS {
        s.push_str(&format!("  (preference-domain \"{d}\")\n"));
    }
    s.push_str(")\n");
    s.push_str("(allow mach-lookup\n");
    for m in BROWSER_MACH {
        s.push_str(&format!("  (global-name \"{m}\")\n"));
    }
    // Its own processes find each other, and its crash handler, by name.
    s.push_str("  (global-name-regex #\"\\.MachPortRendezvousServer\\.[0-9]+$\")\n");
    s.push_str("  (global-name-regex #\"^org\\.chromium\\.crashpad\\.\")\n");
    s.push_str("  (global-name-regex #\"^com\\.apple\\.distributed_notifications\"))\n");
    s.push_str("(allow mach-register\n  (global-name-regex #\"\\.MachPortRendezvousServer\\.[0-9]+$\")\n");
    s.push_str("  (global-name-regex #\"^org\\.chromium\\.crashpad\\.\")\n");
    s.push_str("  (local-name-regex #\"^org\\.chromium\\.crashpad\\.\"))\n");
    // Its single-instance socket and DevTools endpoint; Tower connects in.
    s.push_str("(allow network-bind network-inbound\n  (local ip \"localhost:*\")\n");
    for w in spec.writable.iter().chain(spec.user_temp.as_slice()) {
        s.push_str(&format!("  (local unix-socket (subpath {}))\n", q(w)));
    }
    s.push_str(")\n(allow network-outbound\n");
    for w in spec.writable.iter().chain(spec.user_temp.as_slice()) {
        s.push_str(&format!("  (remote unix-socket (subpath {}))\n", q(w)));
    }
    s.push_str(")\n");
    if spec.network {
        s.push_str(NETWORK);
        s.push_str("\n(allow network-outbound)\n");
        return s;
    }
    if !spec.ports.is_empty() {
        s.push_str("(allow network-outbound\n");
        for port in spec.ports {
            s.push_str(&format!("  (remote tcp \"localhost:{port}\")\n"));
        }
        s.push_str(")\n");
    }
    if !spec.proxy_ports.is_empty() {
        s.push_str("(deny network-outbound\n");
        for port in spec.proxy_ports {
            s.push_str(&format!("  (remote ip \"localhost:{port}\")\n"));
        }
        s.push_str(")\n");
    }
    s
}
