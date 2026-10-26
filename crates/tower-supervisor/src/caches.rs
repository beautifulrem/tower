//! Per-goal package caches.
//!
//! Sandboxed processes may not write the user's own caches: code planted in
//! `~/.cargo/registry` or `~/.npm` would later run when the user builds
//! other projects outside any sandbox. Each goal therefore gets private
//! caches, seeded once from the user's caches with copy-on-write clones
//! (`cp -c`, APFS clonefile: near-instant, no extra space until modified),
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
        ("npm_config_store_dir".into(), p("pnpm-store")),
        ("YARN_CACHE_FOLDER".into(), p("yarn")),
        ("BUN_INSTALL_CACHE_DIR".into(), p("bun")),
        ("CARGO_HOME".into(), p("cargo")),
        ("GOMODCACHE".into(), p("gomod")),
        ("GOCACHE".into(), p("gobuild")),
        ("PIP_CACHE_DIR".into(), p("pip")),
        ("UV_CACHE_DIR".into(), p("uv")),
        ("XDG_CACHE_HOME".into(), p("xdg")),
        // The user's global git config is outside the sandbox (and may hold
        // credential helpers); git treats an unreadable one as fatal.
        ("GIT_CONFIG_GLOBAL".into(), "/dev/null".into()),
    ]
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
            let _ = std::process::Command::new("/bin/cp")
                .args(["-cR"])
                .arg(&src)
                .arg(&dst)
                .stdout(std::process::Stdio::null())
                .stderr(std::process::Stdio::null())
                .status();
        }
        // Cargo reads its configuration from CARGO_HOME.
        let cargo_config = home.join(".cargo/config.toml");
        if repo.join("Cargo.toml").exists() && cargo_config.is_file() {
            std::fs::create_dir_all(cache.join("cargo"))?;
            let _ = std::fs::copy(&cargo_config, cache.join("cargo/config.toml"));
        }
        std::fs::write(&marker, "")?;
    }
    Ok(crate::paths::real(cache))
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
}
