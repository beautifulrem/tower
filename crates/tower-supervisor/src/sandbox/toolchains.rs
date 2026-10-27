//! Toolchains resolve in the sandbox as in your terminal: what the version
//! managers and rustup read to pick the default version is readable, and
//! nothing else of theirs.

use std::path::{Path, PathBuf};

/// Toolchain locations under the home directory that tools must be able to
/// read (interpreters, compilers, version managers). Never caches the agent
/// could poison for other projects: those are cloned per goal instead.
pub(super) const HOME_TOOLCHAINS: &[&str] = &[
    ".nvm",
    ".volta",
    ".fnm",
    ".local/share/fnm",
    "Library/Application Support/fnm",
    // fnm's per-shell links to the default version (on PATH after `fnm env`).
    ".local/state/fnm_multishells",
    ".nodenv",
    ".bun/bin",
    ".deno",
    ".rustup",
    ".cargo/bin",
    ".pyenv",
    ".rbenv",
    ".goenv",
    ".jenv",
    ".sdkman",
    ".asdf",
    ".proto",
    ".local/bin",
    ".local/share/mise",
    ".local/share/pnpm",
    "Library/pnpm",
    "go/bin",
    "sdk",
    ".pi/agent/skills",
    ".agents/skills",
];

/// Files in the home directory that only name default versions (asdf,
/// mise, nodenv, pyenv, rbenv, goenv, the `.nvmrc` some shells read).
const HOME_VERSION_FILES: &[&str] =
    &[".tool-versions", ".node-version", ".nvmrc", ".python-version", ".ruby-version", ".go-version", ".java-version"];

/// Environment variables naming a toolchain's home: readable as a whole
/// (they hold installed versions and the managers' default choice).
const TOOLCHAIN_HOMES: &[&str] = &[
    "RUSTUP_HOME",
    "NVM_DIR",
    "FNM_DIR",
    "VOLTA_HOME",
    "ASDF_DIR",
    "ASDF_DATA_DIR",
    "MISE_DATA_DIR",
    "PYENV_ROOT",
    "RBENV_ROOT",
    "NODENV_ROOT",
    "N_PREFIX",
    "SDKMAN_DIR",
    "GOROOT",
    "JAVA_HOME",
    "DEVELOPER_DIR",
];

/// Toolchains on `PATH` that live in otherwise unreadable places (user
/// directories, CI tool caches, other volumes): each `…/bin` entry makes its
/// install root readable (`node` needs `../lib`), any other entry itself.
/// Never the home directory or an ancestor of it; credential stores stay
/// denied regardless.
pub fn path_toolchains(path: &str, home: &Path) -> Vec<PathBuf> {
    toolchains_under(path, home, &[Path::new("/Users"), Path::new("/Volumes")])
}

pub(super) fn toolchains_under(path: &str, home: &Path, closed: &[&Path]) -> Vec<PathBuf> {
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
        if !acceptable(&root, home, closed) || out.contains(&root) {
            continue;
        }
        out.push(root);
    }
    out
}

/// Not the home directory or anything above it, not a whole user directory
/// (`/Users/x`) or a volume.
fn acceptable(root: &Path, home: &Path, closed: &[&Path]) -> bool {
    let shallow = closed.iter().any(|c| root.strip_prefix(c).is_ok_and(|r| r.components().count() < 2));
    !home.starts_with(root) && !shallow && root.components().count() > 2
}

/// Everything the toolchains in `env` need to read to resolve as they do
/// in your terminal: `PATH`'s install roots, the toolchain homes the
/// environment names (only `bin` of a `CARGO_HOME`, whose other files may
/// hold registry tokens), the managers' version files in your home, and
/// mise's global configuration when it sets no environment variables.
pub fn toolchain_reads(env: &[(String, String)], home: &Path) -> Vec<PathBuf> {
    let get = |k: &str| env.iter().find(|(n, _)| n == k).map(|(_, v)| v.as_str());
    let closed = [Path::new("/Users"), Path::new("/Volumes")];
    let mut out = path_toolchains(get("PATH").unwrap_or(""), home);
    let mut add = |p: PathBuf| {
        let p = crate::paths::real(&p);
        if p.exists() && acceptable(&p, home, &closed) && !out.contains(&p) {
            out.push(p);
        }
    };
    for var in TOOLCHAIN_HOMES {
        if let Some(v) = get(var).filter(|v| v.starts_with('/')) {
            add(PathBuf::from(v));
        }
    }
    if let Some(v) = get("CARGO_HOME").filter(|v| v.starts_with('/')) {
        add(Path::new(v).join("bin"));
    }
    for f in HOME_VERSION_FILES {
        add(home.join(f));
    }
    if let Some(cfg) = mise_global_config(home) {
        add(cfg);
    }
    out
}

/// mise's global configuration, when it only chooses tools: a file that
/// sets environment variables (`[env]`) may hold secrets, and stays closed.
pub fn mise_global_config(home: &Path) -> Option<PathBuf> {
    let p = home.join(".config/mise/config.toml");
    let text = std::fs::read_to_string(&p).ok()?;
    let sets_env = text.lines().any(|l| {
        let t = l.trim();
        t.starts_with("[env") || t.starts_with("env ") || t.starts_with("env=") || t.starts_with("_.")
    });
    (!sets_env).then_some(p)
}

/// Variables that keep the version managers resolving as in your terminal
/// although the sandbox points `XDG_CONFIG_HOME` and the state directories
/// at the goal's private cache.
pub fn toolchain_env(home: &Path, cache: &Path) -> Vec<(String, String)> {
    let mut env = vec![("XDG_STATE_HOME".to_string(), cache.join("state").display().to_string())];
    if let Some(cfg) = mise_global_config(home) {
        env.push(("MISE_GLOBAL_CONFIG_FILE".into(), cfg.display().to_string()));
    }
    env
}

/// The developer directory your terminal uses: `DEVELOPER_DIR` when your
/// shell sets it, else `xcode-select`'s choice.
pub fn developer_dir(env: &[(String, String)]) -> Option<PathBuf> {
    env.iter()
        .find(|(k, _)| k == "DEVELOPER_DIR")
        .map(|(_, v)| PathBuf::from(v))
        .filter(|d| d.join("usr/bin").is_dir())
        .or_else(|| super::developer_bin().and_then(|b| b.parent()?.parent().map(Path::to_path_buf)))
}
