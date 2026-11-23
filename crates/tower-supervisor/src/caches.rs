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

/// `~/.cargo/config.toml` as the agent may see it: the allowlist of docs/16
/// §16.8 (ADR-176/177), built from a parse of the file, never a line filter.
/// Mirrors (`[source.*]` `registry`/`replace-with`/`directory`), registry
/// indexes (`[registries.*]` `index`) and `[net]` `retry`/`git-fetch-with-cli`/
/// `offline`; URLs lose their credentials. Everything else stays
/// behind (tokens, credential providers, `[env]`, `[build]`, aliases…), and a
/// file that does not parse gives an empty copy.
fn without_credentials(config: &str) -> String {
    use toml::{Table, Value};
    let Ok(doc) = config.parse::<Table>() else { return String::new() };
    // Strings lose the credentials in their URLs (§16.8 strips userinfo); numbers and switches stay; nothing else.
    let keep = |value: &Value| match value {
        Value::String(s) => Some(Value::String(without_userinfo(s))),
        Value::Integer(_) | Value::Boolean(_) => Some(value.clone()),
        _ => None,
    };
    // `[source.NAME]` and `[registries.NAME]`: only the named keys of each entry.
    let entries = |table: &str, keys: &[&str]| -> Table {
        let mut out = Table::new();
        for (name, entry) in doc.get(table).and_then(Value::as_table).into_iter().flatten() {
            // A name can be a URL too (`cargo vendor` names a registry's source after its index): one carrying
            // credentials goes whole, and any replacement naming it with it (below).
            if without_userinfo(name) != *name {
                continue;
            }
            let kept: Table = entry
                .as_table()
                .into_iter()
                .flatten()
                .filter(|(k, _)| keys.contains(&k.as_str()))
                .filter_map(|(k, v)| Some((k.clone(), keep(v)?)))
                .collect();
            if !kept.is_empty() {
                out.insert(name.clone(), Value::Table(kept));
            }
        }
        out
    };
    // What is left must be sources cargo accepts: each (but crates-io, which is built in) with a location of its own,
    // and each `replace-with` naming a source or a registry that is there. A source whose location was not kept (a
    // `local-registry`, a `git` source, the block `cargo vendor` writes) goes, then any replacement naming it, until
    // nothing changes; without a replacement cargo builds from crates.io.
    let mut sources = entries("source", &["registry", "replace-with", "directory"]);
    let registries = entries("registries", &["index"]);
    loop {
        let before = sources.len();
        sources.retain(|name, entry| {
            entry.as_table().is_some_and(|t| {
                if name == "crates-io" {
                    !t.is_empty()
                } else {
                    t.contains_key("registry") || t.contains_key("directory")
                }
            })
        });
        let names: Vec<String> = sources.keys().chain(registries.keys()).cloned().collect();
        let mut dropped = false;
        for (_, entry) in sources.iter_mut() {
            let Some(entry) = entry.as_table_mut() else { continue };
            if entry.get("replace-with").and_then(Value::as_str).is_some_and(|to| !names.iter().any(|n| n == to)) {
                entry.remove("replace-with");
                dropped = true;
            }
        }
        if !dropped && sources.len() == before {
            break;
        }
    }
    let mut out = Table::new();
    for (table, kept) in [("source", sources), ("registries", registries)] {
        if !kept.is_empty() {
            out.insert(table.into(), Value::Table(kept));
        }
    }
    let net: Table = doc
        .get("net")
        .and_then(Value::as_table)
        .into_iter()
        .flatten()
        .filter(|(k, _)| ["retry", "git-fetch-with-cli", "offline"].contains(&k.as_str()))
        .filter_map(|(k, v)| Some((k.clone(), keep(v)?)))
        .collect();
    if !net.is_empty() {
        out.insert("net".into(), Value::Table(net));
    }
    toml::to_string(&out).unwrap_or_default()
}

/// `value` with the credentials taken out of its URLs: `user:password@`, or
/// any user name on an http(s) URL (where a lone name is usually a token). A
/// lone ssh user (`ssh://git@host`) is no secret and stays.
fn without_userinfo(value: &str) -> String {
    let mut out = String::new();
    let mut rest = value;
    while let Some(at) = rest.find("://") {
        let scheme = rest[..at].rsplit(|c: char| !c.is_ascii_alphanumeric() && c != '+').next().unwrap_or("");
        let scheme = scheme.to_ascii_lowercase();
        out.push_str(&rest[..at + 3]);
        let authority = &rest[at + 3..];
        let end = authority.find(['/', '"', '\'', ' ', '?', '#']).unwrap_or(authority.len());
        rest = match authority[..end].rsplit_once('@') {
            Some((user, _)) if user.contains(':') || scheme.ends_with("http") || scheme.ends_with("https") => {
                &authority[user.len() + 1..]
            }
            _ => authority,
        };
    }
    out.push_str(rest);
    out
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

    /// The goal's copy of `~/.cargo/config.toml` is the allowlist of docs/16
    /// §16.8: mirrors and registry indexes, a few `[net]` settings, nothing
    /// else, and no URL carrying credentials. The cache is readable to the agent.
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
            r#"[source.crates-io]
replace-with = "mirror"

[source.mirror]
registry = "sparse+https://mirror.example.com/index/"

[source.private]
registry = "sparse+https://ada:mirrorpw0015@private.example.com/index/"

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

[net]
retry = 3
git-fetch-with-cli = true

[build]
jobs = 4
rustflags = ["-C", "link-arg=-Wl,--token=buildflag0006"]

[env]
OPENAI_API_KEY = "sk-envkey0007"
DEPLOY = { value = """
envmultiline0008
""", force = true }

[patch.crates-io]
keyring = { path = "../keyring" }

[alias]
keygen = "run --bin keygen"
"#,
        )
        .unwrap();

        let cache = prepare(&tmp.path().join("cache"), &home, &repo).unwrap();
        let copied = std::fs::read_to_string(cache.join("cargo/config.toml")).unwrap();
        for secret in [
            "0001",
            "0002",
            "0003",
            "0004",
            "0005",
            "0006",
            "0007",
            "0008",
            "0015",
            "cargo:macos-keychain",
            "keygen",
            "jobs",
        ] {
            assert!(!copied.contains(secret), "{secret} left in:\n{copied}");
        }
        let kept: toml::Table = copied.parse().unwrap();
        assert_eq!(kept["source"]["crates-io"]["replace-with"].as_str(), Some("mirror"));
        assert_eq!(kept["source"]["mirror"]["registry"].as_str(), Some("sparse+https://mirror.example.com/index/"));
        assert_eq!(kept["registries"]["corp"]["index"].as_str(), Some("sparse+https://corp.example.com/index/"));
        assert_eq!(kept["net"]["retry"].as_integer(), Some(3));
        assert_eq!(kept["net"]["git-fetch-with-cli"].as_bool(), Some(true));
        // A mirror whose URL carries credentials stays, without them (§16.8: userinfo is stripped).
        assert_eq!(kept["source"]["private"]["registry"].as_str(), Some("sparse+https://private.example.com/index/"));

        // The spellings a line filter missed: whatever the form, nothing outside the allowlist comes through.
        for (config, secret) in [
            ("env = {\n  OPENAI_API_KEY = \"sk-ml0009\",\n}\n", "0009"),
            ("\u{feff}[env]\nOPENAI_API_KEY = \"sk-bom0010\"\n", "0010"),
            ("[env.GITHUB_TOKEN]\nvalue = \"ghp_table0011\"\n", "0011"),
            ("\"env\".KEY = \"quoted0012\"\n", "0012"),
            (
                "[registries.corp]\nindex = \"https://corp.example.com/i\"\nextra = { a = \"x\",\n  b = \"nested0013\" }\n",
                "0013",
            ),
            ("not toml at all = = \"broken0014\"\n", "0014"),
            ("[source.m]\nregistry = \"HTTPS://tok0017@m.example.com/i/\"\n", "0017"),
            // `cargo vendor` names an alternate registry's source after its index URL, credentials and all.
            (
                "[source.\"sparse+https://u:name0019@corp.example.com/index/\"]\nregistry = \"sparse+https://corp.example.com/index/\"\nreplace-with = \"vendored\"\n[source.vendored]\ndirectory = \"vendor\"\n",
                "0019",
            ),
            (
                "[registries.\"https://u:name0020@host.example.com/x\"]\nindex = \"https://host.example.com/x\"\n",
                "0020",
            ),
        ] {
            let out = without_credentials(config);
            assert!(!out.contains(secret), "{secret} left in:\n{out}");
            // What is left is a configuration cargo reads: valid, with no `[env]` header left behind.
            let parsed: toml::Table = out.parse().unwrap_or_else(|e| panic!("{e}:\n{out}"));
            assert!(!parsed.contains_key("env"), "{out}");
        }
        // A replacement whose source did not come through is left out too: cargo refuses a `replace-with` that
        // names no source.
        let local = without_credentials(
            "[source.crates-io]\nreplace-with = \"local\"\n[source.local]\nlocal-registry = \"/x\"\n",
        );
        assert!(!local.contains("replace-with"), "{local}");
        // A mirror under `[registries]` is a replacement cargo takes too (the usual Artifactory setup).
        let corp = without_credentials(
            "[source.crates-io]\nreplace-with = \"corp\"\n[registries.corp]\nindex = \"sparse+https://u:pw0018@corp.example.com/index/\"\n",
        );
        let corp_t: toml::Table = corp.parse().unwrap();
        assert_eq!(corp_t["source"]["crates-io"]["replace-with"].as_str(), Some("corp"), "{corp}");
        assert!(!corp.contains("0018"), "{corp}");
        // A chain whose end did not come through, and the block `cargo vendor` writes (a git source replaced by a
        // vendor directory): what is left names only sources that are there, each with a location of its own.
        for config in [
            "[source.crates-io]\nreplace-with = \"b\"\n[source.b]\ngit = \"https://x.example.com/b\"\nreplace-with = \"c\"\n[source.c]\nlocal-registry = \"/c\"\n",
            "[source.crates-io]\nreplace-with = \"vendored-sources\"\n[source.\"git+https://github.com/x/y?rev=abc\"]\ngit = \"https://github.com/x/y\"\nrev = \"abc\"\nreplace-with = \"vendored-sources\"\n[source.vendored-sources]\ndirectory = \"vendor\"\n",
            "[source.a]\nreplace-with = \"b\"\nregistry = \"https://a.example.com/i\"\n[source.b]\nreplace-with = \"a\"\ngit = \"https://b.example.com\"\n",
        ] {
            let out = without_credentials(config);
            let t: toml::Table = out.parse().unwrap();
            let empty = toml::Table::new();
            let sources = t.get("source").and_then(toml::Value::as_table).unwrap_or(&empty);
            let registries = t.get("registries").and_then(toml::Value::as_table).unwrap_or(&empty);
            for (name, entry) in sources {
                let entry = entry.as_table().unwrap();
                assert!(
                    name == "crates-io" || entry.contains_key("registry") || entry.contains_key("directory"),
                    "{name} has no location:\n{out}"
                );
                if let Some(to) = entry.get("replace-with").and_then(toml::Value::as_str) {
                    assert!(sources.contains_key(to) || registries.contains_key(to), "{name} → {to} dangles:\n{out}");
                }
            }
        }
        let ssh = without_credentials("[registries.corp]\nindex = \"ssh://git@git.example.com/index\"\n");
        assert!(ssh.contains("ssh://git@git.example.com/index"), "a lone ssh user is not a credential: {ssh}");

        // A cache seeded before the filter loses its copy's token too.
        std::fs::write(cache.join("cargo/config.toml"), "[registry]\ntoken = \"cio_oldseed0016\"\n").unwrap();
        prepare(&cache, &home, &repo).unwrap();
        assert!(!std::fs::read_to_string(cache.join("cargo/config.toml")).unwrap().contains("0016"));
    }
}
