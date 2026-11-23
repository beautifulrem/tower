//! Per-goal package caches.
//!
//! Sandboxed processes may not write the user's own caches: code planted in
//! `~/.cargo/registry` or `~/.npm` would later run when the user builds
//! other projects outside any sandbox. Each goal therefore gets private
//! caches, seeded once from the user's caches with copy-on-write clones
//! (APFS clonefile: near-instant, no extra space until modified),
//! and only for the ecosystems the repository actually uses.

use std::path::{Path, PathBuf};

/// (marker file in the repo, source under $HOME, destination under the cache)
const SEEDS: &[(&str, &str, &str)] = &[
    ("package.json", ".npm", "npm"),
    ("pnpm-lock.yaml", "Library/pnpm/store", "pnpm-store"),
    ("yarn.lock", "Library/Caches/Yarn", "yarn"),
    ("Cargo.toml", ".cargo/registry", "cargo/registry"),
    ("Cargo.toml", ".cargo/git", "cargo/git"),
    ("go.mod", "go/pkg/mod", "gomod"),
];

/// Environment that points every common package manager at the goal's
/// private cache directory.
pub fn env(cache: &Path) -> Vec<(String, String)> {
    let p = |sub: &str| cache.join(sub).display().to_string();
    vec![
        ("npm_config_cache".into(), p("npm")),
        // pnpm 11 reads only `pnpm_config_*` (and npm warns about unknown
        // `npm_config_*` keys).
        ("pnpm_config_store_dir".into(), p("pnpm-store")),
        ("pnpm_config_cache_dir".into(), p("pnpm-cache")),
        ("YARN_CACHE_FOLDER".into(), p("yarn")),
        ("BUN_INSTALL_CACHE_DIR".into(), p("bun")),
        ("CARGO_HOME".into(), p("cargo")),
        ("GOMODCACHE".into(), p("gomod")),
        ("GOCACHE".into(), p("gobuild")),
        ("PIP_CACHE_DIR".into(), p("pip")),
        ("UV_CACHE_DIR".into(), p("uv")),
        ("XDG_CACHE_HOME".into(), p("xdg")),
        // Tools look for their configuration under the home directory, which
        // the sandbox does not let them read (git warns on every command).
        ("XDG_CONFIG_HOME".into(), p("config")),
        // The user's global git config is outside the sandbox (and may hold
        // credential helpers); git treats an unreadable one as fatal.
        ("GIT_CONFIG_GLOBAL".into(), "/dev/null".into()),
        // Nor the system's (Homebrew's and the Command Line Tools' set the
        // keychain credential helper): with neither, only the workspace's
        // own configuration, which Tower writes, is left. No
        // `GIT_CONFIG_COUNT`/`GIT_CONFIG_KEY_0` here: the agent's shell drops
        // names with KEY in them, and a count without its key is fatal to git.
        ("GIT_CONFIG_NOSYSTEM".into(), "1".into()),
        ("GIT_TERMINAL_PROMPT".into(), "0".into()),
    ]
}

/// `~/.cargo/config.toml` without what authenticates: registry tokens, keys,
/// credential providers and aliases, and passwords in URLs (a proxy's).
/// Mirrors and build settings stay. A line filter, conservative: a line it
/// cannot place is dropped rather than copied, when it names a credential.
fn without_credentials(config: &str) -> String {
    const NAMES: &[&str] = &["token", "secret", "password", "credential"];
    // In `[env]` the names are variables (`OPENAI_API_KEY`, `DEPLOY_AUTH`): wider there, and only there, where a
    // `[patch]` entry named `keyring` or an alias named `keygen` is not a secret.
    const ENV_NAMES: &[&str] = &["key", "auth", "private"];
    let mut out = String::new();
    let mut table = String::new();
    let mut skip_until: Option<&str> = None;
    for line in config.lines() {
        if let Some(close) = skip_until {
            if line.contains(close) {
                skip_until = None;
            }
            continue;
        }
        let trimmed = line.trim_start();
        if trimmed.starts_with('[') && !trimmed.contains('=') {
            // `[env] # build vars`, `[[bin]]`: the name, without brackets or a comment after them.
            table = trimmed.trim_start_matches('[').split(']').next().unwrap_or("").trim().to_ascii_lowercase();
        } else if let Some((key, value)) = trimmed.split_once('=') {
            let key = key.trim().to_ascii_lowercase();
            let value = value.trim();
            let names_secret = |s: &str| NAMES.iter().any(|n| s.contains(n));
            let inline_secret = value.starts_with('{') && names_secret(&value.to_ascii_lowercase());
            // `[env]`, a top-level `env.NAME = …`, or `env = { NAME = … }`.
            let in_env = table == "env" || (table.is_empty() && (key == "env" || key.starts_with("env.")));
            let env_names = |s: &str| ENV_NAMES.iter().any(|n| s.contains(n));
            let env_secret =
                in_env && (env_names(&key) || (value.starts_with('{') && env_names(&value.to_ascii_lowercase())));
            if table.starts_with("credential-alias")
                || names_secret(&key)
                || env_secret
                || inline_secret
                || url_has_password(value)
            {
                skip_until = if value.starts_with("\"\"\"") && value.matches("\"\"\"").count() == 1 {
                    Some("\"\"\"")
                } else if value.starts_with("'''") && value.matches("'''").count() == 1 {
                    Some("'''")
                } else if value.starts_with('[') && value.matches('[').count() > value.matches(']').count() {
                    Some("]")
                } else {
                    None
                };
                continue;
            }
        }
        out.push_str(line);
        out.push('\n');
    }
    out
}

/// A URL with credentials in it: `user:password@`, or any user name on an
/// http(s) URL (where a lone name is usually a token).
fn url_has_password(value: &str) -> bool {
    let mut rest = value;
    while let Some(at) = rest.find("://") {
        let scheme = rest[..at].rsplit(|c: char| !c.is_ascii_alphanumeric() && c != '+').next().unwrap_or("");
        let authority = &rest[at + 3..];
        let end = authority.find(['/', '"', '\'', ' ', '?', '#']).unwrap_or(authority.len());
        if let Some(userinfo) = authority[..end].rsplit_once('@').map(|(u, _)| u)
            && (userinfo.contains(':') || scheme.ends_with("http") || scheme.ends_with("https"))
        {
            return true;
        }
        rest = &authority[end..];
    }
    false
}

/// Creates the goal's cache directory and seeds it once from the user's
/// caches for the ecosystems found in `repo`. Seeding is best effort: a
/// failed clone leaves an empty cache, which only costs downloads.
pub fn prepare(cache: &Path, home: &Path, repo: &Path) -> std::io::Result<PathBuf> {
    std::fs::create_dir_all(cache)?;
    let marker = cache.join(".seeded");
    if !marker.exists() {
        for (needs, from, to) in SEEDS {
            let src = home.join(from);
            let dst = cache.join(to);
            if !repo.join(needs).exists() || !src.is_dir() || dst.exists() {
                continue;
            }
            if let Some(parent) = dst.parent() {
                std::fs::create_dir_all(parent)?;
            }
            if !clone_tree(&src, &dst) {
                let copy_args: &[&str] = if cfg!(target_os = "macos") { &["-cR"] } else { &["--reflink=auto", "-a"] };
                let _ = std::process::Command::new("/bin/cp")
                    .args(copy_args)
                    .arg(&src)
                    .arg(&dst)
                    .stdout(std::process::Stdio::null())
                    .stderr(std::process::Stdio::null())
                    .status();
            }
        }
        // Cargo reads its configuration from CARGO_HOME; the agent reads
        // the cache, so the copy keeps no credentials.
        let cargo_config = home.join(".cargo/config.toml");
        if repo.join("Cargo.toml").exists() && cargo_config.is_file() {
            std::fs::create_dir_all(cache.join("cargo"))?;
            if let Ok(text) = std::fs::read_to_string(&cargo_config) {
                std::fs::write(cache.join("cargo/config.toml"), without_credentials(&text))?;
            }
        }
        std::fs::write(&marker, "")?;
    } else if let Ok(text) = std::fs::read_to_string(cache.join("cargo/config.toml")) {
        // Seeded before copies were filtered.
        let clean = without_credentials(&text);
        if clean.trim_end() != text.trim_end() {
            std::fs::write(cache.join("cargo/config.toml"), clean)?;
        }
    }
    Ok(crate::paths::real(cache))
}

/// Clones a whole directory tree in one call (APFS `clonefile`, which
/// takes directories): about ten times faster than `cp -cR` going file by
/// file through a cache of tens of thousands of entries. `false` when it
/// cannot (another volume or file system); the caller copies instead.
#[cfg(target_os = "macos")]
#[allow(unsafe_code)]
pub(crate) fn clone_tree(src: &Path, dst: &Path) -> bool {
    use std::ffi::CString;
    use std::os::unix::ffi::OsStrExt;
    unsafe extern "C" {
        fn clonefile(src: *const std::ffi::c_char, dst: *const std::ffi::c_char, flags: u32) -> std::ffi::c_int;
    }
    const CLONE_NOFOLLOW: u32 = 0x0001;
    let (Ok(s), Ok(d)) = (CString::new(src.as_os_str().as_bytes()), CString::new(dst.as_os_str().as_bytes())) else {
        return false;
    };
    // SAFETY: both arguments are valid NUL-terminated paths that outlive
    // the call; clonefile only reads them.
    unsafe { clonefile(s.as_ptr(), d.as_ptr(), CLONE_NOFOLLOW) == 0 }
}

/// On Linux, attempts Btrfs/XFS reflink cloning via `cp --reflink=always -a`
/// so cache seeding stays copy-on-write when supported by the filesystem.
#[cfg(target_os = "linux")]
pub(crate) fn clone_tree(src: &Path, dst: &Path) -> bool {
    std::process::Command::new("cp")
        .args(["--reflink=always", "-a"])
        .arg(src)
        .arg(dst)
        .stdout(std::process::Stdio::null())
        .stderr(std::process::Stdio::null())
        .status()
        .is_ok_and(|s| s.success())
}

#[cfg(not(any(target_os = "macos", target_os = "linux")))]
pub(crate) fn clone_tree(_src: &Path, _dst: &Path) -> bool {
    false
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn seeds_only_the_ecosystems_in_use() {
        let tmp = tempfile::tempdir().unwrap();
        let home = tmp.path().join("home");
        let repo = tmp.path().join("repo");
        std::fs::create_dir_all(home.join(".npm/_cacache")).unwrap();
        std::fs::write(home.join(".npm/_cacache/x"), "pkg").unwrap();
        std::fs::create_dir_all(home.join(".cargo/registry")).unwrap();
        std::fs::create_dir_all(&repo).unwrap();
        std::fs::write(repo.join("package.json"), "{}").unwrap();

        let cache = prepare(&tmp.path().join("cache"), &home, &repo).unwrap();
        assert_eq!(std::fs::read_to_string(cache.join("npm/_cacache/x")).unwrap(), "pkg");
        assert!(!cache.join("cargo/registry").exists(), "no Cargo.toml, no cargo cache");
        assert!(env(&cache).iter().any(|(k, v)| k == "npm_config_cache" && v.ends_with("/npm")));
    }

    /// The agent's git reads neither the system configuration (Homebrew's
    /// sets the keychain credential helper) nor yours, so it runs no
    /// credential helper, and it never prompts. This holds both as the
    /// verifier passes the environment and as the agent's shell gets it:
    /// the tower-goal extension drops credential-looking names
    /// (`scrubEnv` in policy.ts), and what is left must still be an
    /// environment git accepts.
    #[test]
    fn agent_git_runs_no_credential_helper_and_reads_no_system_config() {
        let tmp = tempfile::tempdir().unwrap();
        let repo = tmp.path().join("repo");
        let system = tmp.path().join("system-gitconfig");
        let helper =
            |name: &str| format!("[credential]\n\thelper = \"!touch {}; true\"\n", tmp.path().join(name).display());
        std::fs::write(&system, format!("[tower]\n\tprobe = yes\n{}", helper("system-helper-ran"))).unwrap();
        std::fs::write(tmp.path().join(".gitconfig"), helper("global-helper-ran")).unwrap();
        std::fs::create_dir_all(&repo).unwrap();
        let credential_looking = |k: &str| {
            let k = k.to_ascii_uppercase();
            ["KEY", "TOKEN", "SECRET", "PASSWORD", "PASSWD", "CREDENTIAL", "AUTH", "COOKIE", "SESSION"]
                .iter()
                .any(|w| k.contains(w))
        };
        for scrubbed in [false, true] {
            let vars: Vec<_> = env(&tmp.path().join("cache"))
                .into_iter()
                .filter(|(k, _)| !scrubbed || !credential_looking(k))
                .collect();
            let git = |args: &[&str], input: Option<&str>| {
                let mut c = std::process::Command::new("git");
                c.args(args)
                    .current_dir(&repo)
                    .env_clear()
                    .env("PATH", std::env::var("PATH").unwrap_or_default())
                    .env("HOME", tmp.path())
                    .env("GIT_CONFIG_SYSTEM", &system)
                    .envs(vars.iter().cloned())
                    .stdin(std::process::Stdio::piped())
                    .stdout(std::process::Stdio::piped())
                    .stderr(std::process::Stdio::piped());
                let mut child = c.spawn().unwrap();
                if let Some(text) = input {
                    std::io::Write::write_all(&mut child.stdin.take().unwrap(), text.as_bytes()).unwrap();
                }
                drop(child.stdin.take());
                child.wait_with_output().unwrap()
            };
            let init = git(&["init", "--quiet"], None);
            assert!(init.status.success(), "scrubbed: {scrubbed}: {}", String::from_utf8_lossy(&init.stderr));
            let status = git(&["status", "--porcelain"], None);
            assert!(status.status.success(), "scrubbed: {scrubbed}: {}", String::from_utf8_lossy(&status.stderr));
            let probe = git(&["config", "--get", "tower.probe"], None);
            assert!(String::from_utf8_lossy(&probe.stdout).trim().is_empty(), "the system configuration is not read");
            git(&["credential", "fill"], Some("protocol=https\nhost=example.com\n\n"));
            assert!(!tmp.path().join("system-helper-ran").exists(), "the system credential helper did not run");
            assert!(!tmp.path().join("global-helper-ran").exists(), "your credential helper did not run");
            let helpers = git(&["config", "--get-all", "credential.helper"], None);
            assert!(String::from_utf8_lossy(&helpers.stdout).trim().is_empty(), "no credential helper is configured");
        }
        assert!(env(Path::new("/c")).contains(&("GIT_TERMINAL_PROMPT".into(), "0".into())));
    }

    /// The goal's copy of `~/.cargo/config.toml` keeps mirrors and build
    /// settings but no registry token, credential provider or proxy
    /// password: the cache is readable to the agent.
    #[test]
    fn cargo_config_reaches_the_cache_without_credentials() {
        let tmp = tempfile::tempdir().unwrap();
        let home = tmp.path().join("home");
        let repo = tmp.path().join("repo");
        std::fs::create_dir_all(home.join(".cargo")).unwrap();
        std::fs::create_dir_all(&repo).unwrap();
        std::fs::write(repo.join("Cargo.toml"), "[package]\n").unwrap();
        std::fs::write(
            home.join(".cargo/config.toml"),
            // Line by line, as the filter reads it: a top-level dotted `env.` key and an inline `env` table are
            // `[env]` variables too (not one valid file with `[env]` below; the filter never parses the whole).
            r#"env.TOP_API_KEY = "envkey0009"
env = { DEPLOY_AUTH = "envauth0010" }

[source.crates-io]
replace-with = "mirror"

[source.mirror]
registry = "sparse+https://mirror.example.com/index/"

[registry]
token = "cio_registrytoken0001"
global-credential-providers = ["cargo:token", "cargo:macos-keychain"]

[registries.corp]
index = "sparse+https://corp.example.com/index/"
token = "Bearer corptoken0002"
credential-provider = [
    "cargo:token-from-stdout",
    "/usr/local/bin/corp-cred0003",
]

[credential-alias]
corp-login = ["/usr/local/bin/aliascred0004", "--secret"]

[http]
proxy = "http://ada:proxypass0005@proxy.example.com:8080"

[build]
jobs = 4
registries.other.token = "dottedtoken0006"

[env] # build vars
OPENAI_API_KEY = "sk-envkey0007"
DEPLOY_AUTH = "envauth0008"
RUST_LOG = "info"
AUTHOR = "Ada"

[patch.crates-io]
oauth2 = { path = "../oauth2" }
keyring = { path = "../keyring" }
serde = { git = "https://github.com/authorname/serde" }

[alias]
keygen = "run --bin keygen"
"#,
        )
        .unwrap();

        let cache = prepare(&tmp.path().join("cache"), &home, &repo).unwrap();
        let copied = std::fs::read_to_string(cache.join("cargo/config.toml")).unwrap();
        for secret in
            ["0001", "0002", "0003", "0004", "0005", "0006", "0007", "0008", "0009", "0010", "cargo:macos-keychain"]
        {
            assert!(!copied.contains(secret), "{secret} left in:\n{copied}");
        }
        for kept in [
            "replace-with = \"mirror\"",
            "sparse+https://mirror.example.com/index/",
            "jobs = 4",
            "[registries.corp]",
            "RUST_LOG = \"info\"",
            "oauth2 = { path",
            "keyring = { path",
            "authorname/serde",
            "keygen = ",
        ] {
            assert!(copied.contains(kept), "{kept} missing from:\n{copied}");
        }
        // A cache seeded before the filter loses its copy's token too.
        std::fs::write(cache.join("cargo/config.toml"), "[registry]\ntoken = \"cio_oldseed0007\"\n").unwrap();
        prepare(&cache, &home, &repo).unwrap();
        assert!(!std::fs::read_to_string(cache.join("cargo/config.toml")).unwrap().contains("0007"));
    }
}
