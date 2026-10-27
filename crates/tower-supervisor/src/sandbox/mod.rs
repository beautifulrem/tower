//! macOS Seatbelt profiles (S2, `docs/11` §11.6).
//!
//! Closed by default: the base policy (adapted from OpenAI Codex) denies
//! everything and allows only process basics. Tower then adds:
//!
//! - **reads**: an allow-list: system locations and toolchains (without
//!   package managers' configuration), the workspace, the goal's private
//!   directories and explicitly allowed paths; credential stores are denied
//!   even inside those; shared temporary folders are not readable;
//! - **writes**: only the workspace, the goal's private TMPDIR and cache
//!   directory;
//! - **network**: none beyond this machine unless the contract allows it;
//!   and on this machine, closed by default too (see [`Loopback`]);
//! - **git**: the satellite's configuration and hooks are read-only, because
//!   Tower itself runs git there outside the sandbox.
//!
//! The keychain service is never reachable. With the network allowed, TLS
//! trust evaluation goes through `trustd` and `ocspd` only.

use std::path::{Path, PathBuf};

mod browser;
mod ports;
mod toolchains;

pub use browser::{BrowserSpec, browser_profile};
pub use ports::{COMMON_PROXY_PORTS, Listener, listeners, listening_ports, port_free, proxy_ports};
pub use toolchains::{developer_dir, path_toolchains, toolchain_env, toolchain_reads};
pub use tower_core::env_cause::loopback_refusal;

const BASE: &str = include_str!("../seatbelt_base.sbpl");
const NETWORK: &str = include_str!("../seatbelt_network.sbpl");

/// System locations every tool may read. Everything else is unreadable unless
/// listed for the goal: not `/private/tmp` or the per-user temporary folders
/// (shared with the user's own processes), not other apps' data in
/// `/Library/Application Support`, not package managers' configuration.
const SYSTEM_READ: &[&str] = &[
    "/System",
    "/usr/bin",
    "/usr/lib",
    "/usr/libexec",
    "/usr/sbin",
    "/usr/share",
    "/usr/standalone",
    "/bin",
    "/sbin",
    "/dev",
    "/private/etc",
    "/private/var/db/timezone",
    "/private/var/select",
    // Where `xcode-select` points the /usr/bin shims (git, clang, …).
    "/private/var/db/xcode_select_link",
    "/Library/Developer",
    "/Library/Frameworks",
    "/Library/Java",
    "/Library/Apple",
    "/Library/Fonts",
    "/Library/Perl",
    "/Library/Python",
    "/Library/Ruby",
    // System-wide defaults some runtimes read; not other apps' preferences.
    "/Library/Preferences/.GlobalPreferences.plist",
    "/Library/Preferences/SystemConfiguration",
    "/nix",
];

/// Package-manager prefixes (Homebrew, MacPorts, /usr/local): only their
/// toolchain parts are readable — not `var` (databases, logs of services
/// the user runs) and not most of `etc` (see below).
const PREFIXES: &[&str] = &["/opt/homebrew", "/usr/local", "/opt/local"];
const PREFIX_PARTS: &[&str] =
    &["bin", "sbin", "Cellar", "Caskroom", "Frameworks", "include", "lib", "libexec", "opt", "share"];

/// Inside the package managers' trees above, their configuration directories
/// may hold tokens (registry or proxy configs); only what TLS, compilers and
/// toolchain choice need stays readable (`rustup` keeps the default
/// toolchain of a Homebrew install in `etc/rustup/settings.toml`).
const PREFIX_ETC: &[&str] = &["/opt/homebrew/etc", "/usr/local/etc", "/opt/local/etc"];
const PREFIX_ETC_ALLOWED: &[&str] = &[
    "ca-certificates",
    "openssl@3",
    "openssl@4",
    "openssl@1.1",
    "openssl",
    "gnutls",
    "gitconfig",
    "paths",
    "clang",
    "rustup",
];

/// The selected developer directory's tools (`xcode-select -p` + `/usr/bin`),
/// e.g. /Library/Developer/CommandLineTools/usr/bin.
pub fn developer_bin() -> Option<PathBuf> {
    static DIR: std::sync::OnceLock<Option<PathBuf>> = std::sync::OnceLock::new();
    DIR.get_or_init(|| {
        let out = std::process::Command::new("/usr/bin/xcode-select").arg("-p").output().ok()?;
        let dir = PathBuf::from(String::from_utf8_lossy(&out.stdout).trim()).join("usr/bin");
        (out.status.success() && dir.is_dir()).then_some(dir)
    })
    .clone()
}

/// The compiler toolchain of a full Xcode (where `cc` and `ld` live; the
/// Command Line Tools keep them in the developer `bin` itself).
pub fn toolchain_bin(developer: &Path) -> Option<PathBuf> {
    let dir = developer.join("Toolchains/XcodeDefault.xctoolchain/usr/bin");
    dir.is_dir().then_some(dir)
}

/// The macOS SDK, found once outside the sandbox: compilers and linkers
/// inside it would otherwise ask `xcrun`, which needs the shared cache.
pub fn sdk_root(developer: &Path) -> Option<String> {
    static SDK: std::sync::Mutex<Vec<(PathBuf, Option<String>)>> = std::sync::Mutex::new(Vec::new());
    let mut known = SDK.lock().unwrap_or_else(std::sync::PoisonError::into_inner);
    if let Some((_, sdk)) = known.iter().find(|(d, _)| d == developer) {
        return sdk.clone();
    }
    let sdk = std::process::Command::new("/usr/bin/xcrun")
        .args(["--sdk", "macosx", "--show-sdk-path"])
        .env("DEVELOPER_DIR", developer)
        .output()
        .ok()
        .filter(|o| o.status.success())
        .map(|o| String::from_utf8_lossy(&o.stdout).trim().to_string())
        .filter(|p| !p.is_empty());
    known.push((developer.to_path_buf(), sdk.clone()));
    sdk
}

/// `path` with `dev` inserted just before `/usr/bin` (or at the end).
pub fn path_with_developer_tools(path: &str, dev: &Path) -> String {
    let dev = dev.display().to_string();
    let mut parts: Vec<&str> = path.split(':').filter(|p| !p.is_empty() && *p != dev).collect();
    let at = parts.iter().position(|p| *p == "/usr/bin").unwrap_or(parts.len());
    parts.insert(at, &dev);
    parts.join(":")
}

/// Credential stores: denied even when a parent is allowed.
const SECRETS: &[&str] = &[
    ".ssh",
    ".aws",
    ".gnupg",
    ".config/gh",
    ".config/gcloud",
    ".docker",
    ".kube",
    ".azure",
    ".pi/agent/auth.json",
    ".netrc",
    ".npmrc",
    ".pypirc",
    ".git-credentials",
    ".cargo/credentials",
    ".cargo/credentials.toml",
    ".tower/tower.db",
    "Library/Keychains",
];

/// Mach services ordinary command-line tools need. The keychain
/// (`com.apple.SecurityServer`, `com.apple.securityd*`) is deliberately absent.
const MACH_SERVICES: &[&str] = &[
    "com.apple.system.notification_center",
    "com.apple.system.logger",
    "com.apple.logd",
    "com.apple.diagnosticd",
    "com.apple.bsd.dirhelper",
    "com.apple.system.opendirectoryd.membership",
    "com.apple.system.DirectoryService.libinfo_v1",
    "com.apple.coreservices.launchservicesd",
    "com.apple.CoreServices.coreservicesd",
];

/// What loopback (this machine's own addresses) a sandbox reaches while the
/// network is off. Seatbelt names one port per rule and no ranges, and a
/// profile is fixed when a process starts, so the list is what is known then.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Loopback {
    /// Closed by default: only these ports — the ones the contract
    /// declares, and the ones the sandbox's own processes listened on when
    /// the profile was written. A service anyone else starts later is not
    /// reachable; neither is a server a command starts and connects to in
    /// one go on a port it picks at run time (declare the port, or see
    /// [`Loopback::AllBut`]).
    Only(Vec<u16>),
    /// Open, except these ports (whatever listened on this Mac when the
    /// profile was written). The contract's choice for test suites that
    /// talk over ports they pick at run time; a service started later by
    /// someone else is reachable.
    AllBut(Vec<u16>),
}

/// What one sandboxed process may touch.
#[derive(Debug, Clone)]
pub struct Spec {
    /// Read-write: the goal's workspace (or the verification checkout).
    pub workspace: PathBuf,
    /// Read-write: the goal's private TMPDIR.
    pub tmp: PathBuf,
    /// Read-write: the goal's private package caches.
    pub cache: PathBuf,
    /// The user's home directory.
    pub home: PathBuf,
    /// Extra read-only paths (e.g. Pi's own resources, toolchains).
    pub read: Vec<PathBuf>,
    /// Tower's own files the command may add to and nothing else: the
    /// transcript the assertion-identity guard reports to. They are
    /// append-only on the file system too, so a run can add a line but
    /// can neither remove nor rewrite what is already there.
    pub append: Vec<PathBuf>,
    /// Allow outbound network beyond loopback (loopback included).
    pub network: bool,
    /// Loopback without the network.
    pub loopback: Loopback,
    /// Loopback ports that are proxies to the outside world (from the user's
    /// proxy settings plus common proxy apps). Denied when the network is
    /// off, whatever else says, or loopback would be a way out.
    pub proxy_ports: Vec<u16>,
}

fn q(p: &Path) -> String {
    format!("\"{}\"", p.to_string_lossy().replace('\\', "\\\\").replace('"', "\\\""))
}

pub fn profile(spec: &Spec) -> String {
    let home = &spec.home;
    let rw = [&spec.workspace, &spec.tmp, &spec.cache];
    let mut s = String::with_capacity(BASE.len() + 4096);
    s.push_str(BASE);
    s.push_str("\n;; ---- Tower ----\n");

    s.push_str("(allow mach-lookup\n");
    for m in MACH_SERVICES {
        s.push_str(&format!("  (global-name \"{m}\")\n"));
    }
    s.push_str(")\n");

    // Reads: an allow-list. System locations and toolchains, minus package
    // managers' configuration, then the goal's own directories.
    // dyld reads the root directory itself (its entries, not their contents);
    // any installed Xcode (Xcode.app, Xcode_16.4.app, Xcode-beta.app) serves
    // the /usr/bin developer tools.
    s.push_str(
        "(allow file-read* (literal \"/\") (regex #\"^/Applications/Xcode[^/]*\\.app(/|$)\"))\n(allow file-read*\n",
    );
    for p in SYSTEM_READ {
        s.push_str(&format!("  (subpath \"{p}\")\n"));
    }
    for prefix in PREFIXES {
        for part in PREFIX_PARTS {
            s.push_str(&format!("  (subpath \"{prefix}/{part}\")\n"));
        }
    }
    s.push_str(")\n(allow file-read*\n");
    for p in PREFIX_ETC {
        for a in PREFIX_ETC_ALLOWED {
            s.push_str(&format!("  (subpath \"{p}/{a}\")\n"));
        }
    }
    s.push_str(")\n(allow file-read*\n");
    for p in rw {
        s.push_str(&format!("  (subpath {})\n", q(p)));
    }
    for t in toolchains::HOME_TOOLCHAINS {
        s.push_str(&format!("  (subpath {})\n", q(&home.join(t))));
    }
    for p in &spec.read {
        s.push_str(&format!("  (subpath {})\n", q(p)));
    }
    s.push_str(")\n");
    // Ancestors of allowed paths must be traversable (metadata only), and the
    // usual symlinks at the root resolvable.
    s.push_str("(allow file-read-metadata\n  (literal \"/Users\")\n  (literal \"/Volumes\")\n");
    s.push_str("  (literal \"/private\")\n  (literal \"/private/var\")\n  (literal \"/etc\")\n  (literal \"/tmp\")\n  (literal \"/var\")\n");
    s.push_str("  (literal \"/Library\")\n  (literal \"/Applications\")\n  (literal \"/opt\")\n  (literal \"/usr\")\n");
    s.push_str("  (literal \"/Library/Preferences\")\n");
    for prefix in PREFIXES {
        s.push_str(&format!("  (literal \"{prefix}\")\n  (literal \"{prefix}/etc\")\n"));
    }
    s.push_str(&format!("  (literal {})\n", q(home)));
    let mut ancestors: Vec<PathBuf> = Vec::new();
    let homes = toolchains::HOME_TOOLCHAINS.iter().map(|t| home.join(t)).collect::<Vec<_>>();
    for p in rw.iter().copied().chain(spec.read.iter()).chain(homes.iter()) {
        for a in p.ancestors().skip(1) {
            if !ancestors.iter().any(|x| x == a) {
                ancestors.push(a.to_path_buf());
            }
        }
    }
    for a in &ancestors {
        s.push_str(&format!("  (literal {})\n", q(a)));
    }
    s.push_str(")\n");
    // Node and npm look for `node_modules` in every folder above the
    // project; one they may not read is an error, not "absent" (a stray
    // `~/node_modules` broke every run). Third-party packages, not secrets.
    s.push_str("(allow file-read*\n");
    let mut seen = Vec::new();
    for p in rw.iter().copied().chain(spec.read.iter()) {
        for a in p.ancestors().skip(1) {
            let nm = a.join("node_modules");
            if !seen.contains(&nm) {
                s.push_str(&format!("  (subpath {})\n", q(&nm)));
                seen.push(nm);
            }
        }
    }
    s.push_str(")\n");
    s.push_str("(deny file-read*\n");
    for d in SECRETS {
        s.push_str(&format!("  (subpath {})\n", q(&home.join(d))));
    }
    s.push_str(")\n");

    // Writes.
    s.push_str("(allow file-write*\n");
    for p in rw {
        s.push_str(&format!("  (subpath {})\n", q(p)));
    }
    // Not `/private/var/folders`: the per-user temporary folders are shared
    // with the user's own, unsandboxed processes.
    s.push_str(
        "  (literal \"/dev/null\")\n  (literal \"/dev/zero\")\n  (literal \"/dev/tty\")\n  (regex #\"^/dev/fd/\"))\n",
    );
    let git = spec.workspace.join(".git");
    s.push_str(&format!(
        "(deny file-write*\n  (literal {})\n  (literal {})\n  (subpath {})\n  (subpath {}))\n",
        q(&git.join("config")),
        q(&git.join("config.lock")),
        q(&git.join("hooks")),
        q(&git.join("tower-empty-hooks")),
    ));
    // Tower's own transcript: data may be added and nothing else — no
    // truncation, no unlink, no change of the append-only flag. What the
    // command reports about itself can therefore grow, never shrink.
    if !spec.append.is_empty() {
        s.push_str("(allow file-write-data\n");
        for p in &spec.append {
            s.push_str(&format!("  (literal {})\n", q(p)));
        }
        s.push_str(")\n");
    }
    network_rules(&mut s, spec, &rw);
    s
}

/// Network: servers may listen on loopback; what they may reach there is
/// [`Spec::loopback`]; the outside world only when allowed.
fn network_rules(s: &mut String, spec: &Spec, rw: &[&PathBuf; 3]) {
    s.push_str("(allow network-bind network-inbound (local ip \"localhost:*\"))\n");
    // Unix sockets only inside the goal's own directories: never the Docker
    // socket or other privileged local daemons.
    s.push_str("(allow network-outbound\n");
    for p in rw {
        s.push_str(&format!("  (remote unix-socket (subpath {}))\n", q(p)));
    }
    s.push_str(")\n");
    if spec.network {
        s.push_str(NETWORK);
        s.push_str("\n(allow network-outbound)\n(allow network-inbound)\n(allow network-bind)\n");
        return;
    }
    match &spec.loopback {
        Loopback::Only(ports) if !ports.is_empty() => {
            s.push_str("(allow network-outbound\n");
            for port in ports {
                s.push_str(&format!("  (remote ip \"localhost:{port}\")\n"));
            }
            s.push_str(")\n");
        }
        Loopback::Only(_) => {}
        Loopback::AllBut(closed) => {
            s.push_str("(allow network-outbound (remote ip \"localhost:*\"))\n");
            if !closed.is_empty() {
                s.push_str("(deny network-outbound\n");
                for port in closed {
                    s.push_str(&format!("  (remote ip \"localhost:{port}\")\n"));
                }
                s.push_str(")\n");
            }
        }
    }
    if !spec.proxy_ports.is_empty() {
        s.push_str("(deny network-outbound\n");
        for port in &spec.proxy_ports {
            s.push_str(&format!("  (remote ip \"localhost:{port}\")\n"));
        }
        s.push_str(")\n");
    }
}

pub fn available() -> bool {
    cfg!(target_os = "macos") && Path::new("/usr/bin/sandbox-exec").exists()
}

#[cfg(test)]
mod tests;
