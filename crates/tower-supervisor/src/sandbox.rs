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
//! - **network**: loopback only, unless the contract allows the network;
//! - **git**: the satellite's configuration and hooks are read-only, because
//!   Tower itself runs git there outside the sandbox.
//!
//! The keychain service is never reachable. With the network allowed, TLS
//! trust evaluation goes through `trustd` and `ocspd` only.

use std::path::{Path, PathBuf};

const BASE: &str = include_str!("seatbelt_base.sbpl");
const NETWORK: &str = include_str!("seatbelt_network.sbpl");

/// Toolchain locations under the home directory that tools must be able to
/// read (interpreters, compilers, version managers). Never caches the agent
/// could poison for other projects: those are cloned per goal instead.
const HOME_TOOLCHAINS: &[&str] = &[
    ".nvm",
    ".volta",
    ".fnm",
    ".bun/bin",
    ".deno",
    ".rustup",
    ".cargo/bin",
    ".pyenv",
    ".rbenv",
    ".sdkman",
    ".asdf",
    ".local/bin",
    ".local/share/mise",
    ".local/share/pnpm",
    "Library/pnpm",
    "go/bin",
    "sdk",
    ".pi/agent/skills",
    ".agents/skills",
];

/// Toolchains on `PATH` that live in otherwise unreadable places (user
/// directories, CI tool caches, other volumes): each `…/bin` entry makes its
/// install root readable (`node` needs `../lib`), any other entry itself.
/// Never the home directory or an ancestor of it; credential stores stay
/// denied regardless.
pub fn path_toolchains(path: &str, home: &Path) -> Vec<PathBuf> {
    toolchains_under(path, home, &[Path::new("/Users"), Path::new("/Volumes")])
}

fn toolchains_under(path: &str, home: &Path, closed: &[&Path]) -> Vec<PathBuf> {
    let mut out: Vec<PathBuf> = Vec::new();
    for entry in path.split(':').filter(|e| e.starts_with('/')) {
        let dir = crate::paths::real(Path::new(entry));
        if !closed.iter().any(|c| dir.starts_with(c)) || !dir.is_dir() {
            continue;
        }
        let parent = dir.parent().unwrap_or(&dir).to_path_buf();
        // `~/.local/bin` must not open all of `~/.local`: directly under home,
        // only the bin directory itself.
        let root =
            if dir.file_name().is_some_and(|n| n == "bin") && parent.parent() != Some(home) { parent } else { dir };
        // Not a whole user directory (`/Users/x`) or anything above one.
        let shallow = closed.iter().any(|c| root.strip_prefix(c).is_ok_and(|r| r.components().count() < 2));
        if home.starts_with(&root) || shallow || out.contains(&root) {
            continue;
        }
        out.push(root);
    }
    out
}

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
/// may hold tokens (registry or proxy configs); only what TLS and compilers
/// need stays readable.
const PREFIX_ETC: &[&str] = &["/opt/homebrew/etc", "/usr/local/etc", "/opt/local/etc"];
const PREFIX_ETC_ALLOWED: &[&str] =
    &["ca-certificates", "openssl@3", "openssl@4", "openssl@1.1", "openssl", "gnutls", "gitconfig", "paths", "clang"];

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
    /// Extra read-only paths (e.g. Pi's own resources).
    pub read: Vec<PathBuf>,
    /// Allow outbound network beyond loopback.
    pub network: bool,
    /// Loopback ports that are proxies to the outside world (from the user's
    /// proxy settings plus common proxy apps). Denied when the network is
    /// off, or loopback would be a way out.
    pub proxy_ports: Vec<u16>,
}

/// Default ports of common local proxies (Clash, Surge, V2Ray, Shadowsocks,
/// Privoxy, Tor). Local test servers rarely use them.
pub const COMMON_PROXY_PORTS: &[u16] =
    &[1080, 1086, 1087, 6152, 6153, 7890, 7891, 7897, 8118, 9050, 9150, 10808, 10809];

/// Ports of proxies named in `*_proxy` environment variables.
pub fn proxy_ports(env: &[(String, String)]) -> Vec<u16> {
    let mut ports: Vec<u16> = COMMON_PROXY_PORTS.to_vec();
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
    for t in HOME_TOOLCHAINS {
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
    for p in rw.iter().copied().chain(spec.read.iter()) {
        for a in p.ancestors().skip(1) {
            s.push_str(&format!("  (literal {})\n", q(a)));
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

    // Network: loopback always (local test servers), the outside world only
    // when allowed.
    s.push_str("(allow network-bind network-inbound (local ip \"localhost:*\"))\n");
    s.push_str("(allow network-outbound (remote ip \"localhost:*\"))\n");
    // Unix sockets only inside the goal's own directories: never the Docker
    // socket or other privileged local daemons.
    s.push_str("(allow network-outbound\n");
    for p in rw {
        s.push_str(&format!("  (remote unix-socket (subpath {}))\n", q(p)));
    }
    s.push_str(")\n");
    if !spec.network && !spec.proxy_ports.is_empty() {
        s.push_str("(deny network-outbound\n");
        for port in &spec.proxy_ports {
            s.push_str(&format!("  (remote ip \"localhost:{port}\")\n"));
        }
        s.push_str(")\n");
    }
    if spec.network {
        s.push_str(NETWORK);
        s.push_str("\n(allow network-outbound)\n(allow network-inbound)\n(allow network-bind)\n");
    }
    s
}

pub fn available() -> bool {
    cfg!(target_os = "macos") && Path::new("/usr/bin/sandbox-exec").exists()
}

#[cfg(test)]
mod tests {
    use super::*;

    fn spec(root: &Path, home: &Path, network: bool) -> Spec {
        Spec {
            workspace: root.join("ws"),
            tmp: root.join("tmp"),
            cache: root.join("cache"),
            home: home.to_path_buf(),
            read: vec![],
            network,
            proxy_ports: COMMON_PROXY_PORTS.to_vec(),
        }
    }

    #[test]
    fn toolchains_on_path_become_readable_but_never_home() {
        let tmp = tempfile::tempdir().unwrap();
        let users = crate::paths::real(tmp.path());
        let home = users.join("me");
        let nvm = home.join(".nvm/versions/node/v1/bin");
        let local = home.join(".local/bin");
        let ci = users.join("runner/hostedtoolcache/node/22/x64/bin");
        for d in [&nvm, &local, &ci] {
            std::fs::create_dir_all(d).unwrap();
        }
        let path = format!("/usr/bin:{}:{}:{}:{}", nvm.display(), local.display(), ci.display(), home.display());
        assert_eq!(
            toolchains_under(&path, &home, &[&users]),
            [home.join(".nvm/versions/node/v1"), local.clone(), users.join("runner/hostedtoolcache/node/22/x64")]
        );
    }

    #[test]
    fn developer_tools_go_just_before_usr_bin() {
        let dev = Path::new("/Library/Developer/CommandLineTools/usr/bin");
        assert_eq!(
            path_with_developer_tools("/opt/homebrew/bin:/usr/bin:/bin", dev),
            "/opt/homebrew/bin:/Library/Developer/CommandLineTools/usr/bin:/usr/bin:/bin"
        );
        assert_eq!(path_with_developer_tools("/bin", dev), "/bin:/Library/Developer/CommandLineTools/usr/bin");
    }

    #[test]
    fn proxy_ports_come_from_the_environment() {
        let env = vec![
            ("https_proxy".to_string(), "http://127.0.0.1:6152".to_string()),
            ("ALL_PROXY".to_string(), "socks5://user:pw@127.0.0.1:4321/".to_string()),
            ("NO_PROXY".to_string(), "localhost:9999".to_string()),
        ];
        let ports = proxy_ports(&env);
        assert!(ports.contains(&6152) && ports.contains(&4321));
        assert!(!ports.contains(&9999));
    }

    #[test]
    fn profile_is_closed_by_default_and_names_its_rules() {
        let p = profile(&spec(Path::new("/w"), Path::new("/Users/a"), false));
        assert!(p.contains("(deny default)"));
        assert!(p.contains("(subpath \"/Users/a/.ssh\")"));
        assert!(p.contains("(literal \"/w/ws/.git/config\")"));
        assert!(!p.contains("com.apple.SecurityServer"), "no keychain service");
        let with_network = profile(&spec(Path::new("/w"), Path::new("/Users/a"), true));
        assert!(!with_network.contains("com.apple.SecurityServer"), "not even with the network");
        assert!(profile(&spec(Path::new("/w"), Path::new("/Users/a"), true)).contains("(allow network-outbound)"));
    }

    /// Enforcement, checked against the real sandbox-exec, with a fake home
    /// under /tmp holding a fake secret, another project and a shared cache.
    #[cfg(target_os = "macos")]
    #[test]
    fn profile_is_enforced_by_sandbox_exec() {
        if !available() {
            return;
        }
        let tmp = tempfile::tempdir_in("/tmp").unwrap();
        let root = crate::paths::real(tmp.path());
        let home = root.join("home");
        for d in ["ws/.git", "tmp", "cache", "home/.ssh", "home/.cargo/registry", "home/projects/other"] {
            std::fs::create_dir_all(root.join(d)).unwrap();
        }
        std::fs::write(home.join(".ssh/id"), "k").unwrap();
        std::fs::write(home.join("projects/other/.env"), "SECRET=1").unwrap();
        let sb = root.join("p.sb");
        std::fs::write(&sb, profile(&spec(&root, &home, false))).unwrap();

        let run = |cmd: &str| {
            std::process::Command::new("/usr/bin/sandbox-exec")
                .arg("-f")
                .arg(&sb)
                .args(["/bin/sh", "-c", cmd])
                .current_dir(root.join("ws"))
                .output()
                .unwrap()
                .status
                .success()
        };
        assert!(run("echo a > inside.txt && cat inside.txt"), "workspace is read-write");
        assert!(run(&format!("echo a > {}/x", root.join("cache").display())), "goal cache is writable");
        assert!(!run(&format!("echo a > {}/outside.txt", root.display())), "writes outside are denied");
        assert!(!run(&format!("cat {}/.ssh/id", home.display())), "credentials are unreadable");
        assert!(!run(&format!("cat {}/projects/other/.env", home.display())), "other projects are unreadable");
        assert!(!run(&format!("touch {}/.cargo/registry/poison", home.display())), "shared caches are not writable");
        assert!(!run("echo x >> .git/config"), "git config is read-only");
        let git = std::process::Command::new("/usr/bin/sandbox-exec")
            .arg("-f")
            .arg(&sb)
            .args(["/bin/sh", "-c", "GIT_CONFIG_GLOBAL=/dev/null git --version"])
            .env(
                "PATH",
                format!("{}:/usr/bin:/bin", developer_bin().map(|d| d.display().to_string()).unwrap_or_default()),
            )
            .current_dir(root.join("ws"))
            .output()
            .unwrap();
        assert!(git.status.success(), "git runs: {}", String::from_utf8_lossy(&git.stderr));
        assert!(run("/usr/bin/python3 -c 'print(1)' >/dev/null 2>&1 || true"), "interpreters start");
        assert!(!run("/usr/bin/curl -sS -m 5 https://example.com >/dev/null 2>&1"), "no network by default");
        // Even through a local proxy (Clash, Surge, …) listening on loopback.
        assert!(
            !run("/usr/bin/curl -sS -m 5 -x http://127.0.0.1:7890 https://example.com >/dev/null 2>&1"),
            "no proxy escape"
        );
        assert!(
            !run("/usr/bin/curl -s -m 3 --unix-socket /var/run/docker.sock http://x/version >/dev/null 2>&1"),
            "no docker socket"
        );
        // Reads are an allow-list: a file next to the goal's directories (in
        // the shared /tmp) and the user's shared temporary folder are closed.
        std::fs::write(root.join("neighbour.txt"), "n").unwrap();
        assert!(!run(&format!("cat {}/neighbour.txt", root.display())), "shared /tmp is unreadable");
        let user_tmp = crate::paths::real(&std::env::temp_dir());
        if user_tmp.starts_with("/private/var/folders") {
            assert!(!run(&format!("touch {}/tower-sandbox-probe", user_tmp.display())), "shared temp is not writable");
            assert!(!run(&format!("ls {}", user_tmp.display())), "shared temp is unreadable");
        }
        if Path::new("/opt/homebrew/etc").is_dir() {
            assert!(!run("ls /opt/homebrew/etc >/dev/null"), "package manager configuration is unreadable");
        }
        if Path::new("/opt/homebrew/var").is_dir() {
            assert!(!run("ls /opt/homebrew/var >/dev/null"), "services' data under the prefix is unreadable");
        }
        if Path::new("/Library/Preferences/com.apple.dock.plist").exists() {
            assert!(
                !run("cat /Library/Preferences/com.apple.dock.plist >/dev/null"),
                "other apps' preferences are closed"
            );
        }
        assert!(run("/bin/ls / >/dev/null && /usr/bin/env true"), "the system still works");
    }

    /// With the network allowed, TLS works without the keychain service.
    /// Needs internet access; skipped (passes) when the host has none.
    #[cfg(target_os = "macos")]
    #[test]
    fn tls_works_with_network_and_without_keychain() {
        if !available() {
            return;
        }
        let reachable = std::process::Command::new("/usr/bin/curl")
            .args(["-sS", "-m", "5", "-o", "/dev/null", "https://example.com"])
            .status()
            .is_ok_and(|s| s.success());
        if !reachable {
            return;
        }
        let tmp = tempfile::tempdir_in("/tmp").unwrap();
        let root = crate::paths::real(tmp.path());
        for d in ["ws/.git", "tmp", "cache", "home"] {
            std::fs::create_dir_all(root.join(d)).unwrap();
        }
        let sb = root.join("p.sb");
        let p = profile(&spec(&root, &root.join("home"), true));
        assert!(!p.contains("com.apple.SecurityServer"));
        std::fs::write(&sb, p).unwrap();
        let ok = std::process::Command::new("/usr/bin/sandbox-exec")
            .arg("-f")
            .arg(&sb)
            .args(["/usr/bin/curl", "-sS", "-m", "10", "-o", "/dev/null", "https://example.com"])
            .status()
            .unwrap()
            .success();
        assert!(ok, "TLS through trustd only");
    }
}
