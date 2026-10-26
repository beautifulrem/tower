//! macOS Seatbelt profiles (S2, `docs/11` §11.6).
//!
//! Closed by default: the base policy (adapted from OpenAI Codex) denies
//! everything and allows only process basics. Tower then adds:
//!
//! - **reads**: the system and toolchains, but nothing under the user's home
//!   or other volumes except the workspace, the goal's private directories,
//!   toolchain locations and explicitly allowed paths; credential stores are
//!   denied even inside those;
//! - **writes**: only the workspace, the goal's private TMPDIR and cache
//!   directory, and the per-user temporary folder;
//! - **network**: loopback only, unless the contract allows the network;
//! - **git**: the satellite's configuration and hooks are read-only, because
//!   Tower itself runs git there outside the sandbox.
//!
//! The keychain service is reachable only when the network is allowed (TLS
//! trust evaluation needs it), and never together with read access to the
//! keychain files.

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

    // Reads: the system, minus every user's files, plus the allow-list.
    s.push_str("(allow file-read*)\n");
    s.push_str(&format!("(deny file-read* (subpath \"/Users\") (subpath \"/Volumes\") (subpath {}))\n", q(home)));
    s.push_str("(allow file-read*\n");
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
    // Ancestors of allowed paths must be traversable (metadata only).
    s.push_str("(allow file-read-metadata\n  (literal \"/Users\")\n  (literal \"/Volumes\")\n");
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
    s.push_str(
        "  (subpath \"/private/var/folders\")\n  (literal \"/dev/null\")\n  (literal \"/dev/zero\")\n  (literal \"/dev/tty\")\n  (regex #\"^/dev/fd/\"))\n",
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
        assert!(!p.contains("com.apple.SecurityServer"), "no keychain service without network");
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
        assert!(
            run(
                "GIT_CONFIG_GLOBAL=/dev/null /usr/bin/git status >/dev/null 2>&1 || GIT_CONFIG_GLOBAL=/dev/null /usr/bin/git --version >/dev/null"
            ),
            "git runs"
        );
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
    }
}
