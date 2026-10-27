//! What Tower puts in its data folder at start-up (the goal extension, the
//! demo engine) and what it clears away that a crash left behind.

use std::path::Path;

use crate::paths::Paths;

/// Removes what an interrupted verification or check left behind (Tower
/// quit or crashed mid-way). Nothing runs yet at this point.
pub(crate) fn sweep(paths: &Paths) {
    for dir in ["verify", "verify-cache", "checks"] {
        let _ = std::fs::remove_dir_all(paths.root.join(dir));
    }
    if let Ok(entries) = std::fs::read_dir(paths.root.join("tmp")) {
        for e in entries.flatten() {
            let name = e.file_name().to_string_lossy().into_owned();
            if name.ends_with("-verify") || name.ends_with("-base") || name.ends_with("-orig") {
                let _ = std::fs::remove_dir_all(e.path());
            }
        }
    }
}

pub(crate) fn install_demo_engine(src: &Path, dst: &Path) -> std::io::Result<()> {
    use std::os::unix::fs::PermissionsExt;
    std::fs::create_dir_all(dst.parent().unwrap_or(Path::new("/")))?;
    std::fs::copy(src, dst)?;
    std::fs::set_permissions(dst, std::fs::Permissions::from_mode(0o755))
}

/// Copies the bundled extension into Tower's data directory, so runs never
/// load code from a location the agent or another tool might change.
pub(crate) fn install_extension(src: &Path, dst: &Path) -> std::io::Result<()> {
    use std::os::unix::fs::PermissionsExt;
    std::fs::create_dir_all(dst)?;
    for name in ["index.ts", "policy.ts", "sandboxfs.ts", "acp.ts", "package.json"] {
        let from = src.join(name);
        if from.exists() {
            std::fs::copy(&from, dst.join(name))?;
        }
    }
    // Claude Code's adapter: its manifest and lockfile (installed on first use).
    let adapter = src.join("acp-adapter");
    if adapter.join("package-lock.json").is_file() {
        std::fs::create_dir_all(dst.join("acp-adapter"))?;
        for name in ["package.json", "package-lock.json"] {
            let to = dst.join("acp-adapter").join(name);
            let changed = std::fs::read(adapter.join(name)).ok() != std::fs::read(&to).ok();
            if changed {
                std::fs::copy(adapter.join(name), &to)?;
                // A new pin: install again.
                let _ = std::fs::remove_dir_all(dst.join("acp-adapter/node_modules"));
            }
        }
    }
    // The ACP bridge is started directly (`#!/usr/bin/env node`).
    if dst.join("acp.ts").exists() {
        std::fs::set_permissions(dst.join("acp.ts"), std::fs::Permissions::from_mode(0o755))?;
    }
    if !dst.join("index.ts").exists() {
        return Err(std::io::Error::new(
            std::io::ErrorKind::NotFound,
            format!("tower-goal extension not found in {}", src.display()),
        ));
    }
    Ok(())
}
