//! macOS Seatbelt profile for the agent's shell (S2, `docs/11` §11.6).
//!
//! The agent may write only inside its own workspace, its private TMPDIR
//! and the package-manager caches; credential stores are unreadable; the
//! satellite's git configuration and hooks are read-only, because Tower
//! itself runs git there outside the sandbox.

use std::path::Path;

/// Package-manager caches under the home directory that installs need.
const CACHE_DIRS: &[&str] = &[
    ".npm",
    ".pnpm-store",
    ".cache",
    ".yarn",
    ".bun",
    ".cargo/registry",
    ".cargo/git",
    ".rustup/tmp",
    "Library/Caches",
    "Library/pnpm",
    "go/pkg/mod",
    ".gradle",
    ".m2",
];

/// Credential stores the agent must not read.
const SECRET_DIRS: &[&str] = &[
    ".ssh",
    ".aws",
    ".gnupg",
    ".config/gh",
    ".docker",
    ".kube",
    ".azure",
    ".config/gcloud",
    ".pi/agent/auth.json",
    ".netrc",
    ".npmrc",
    ".pypirc",
    ".git-credentials",
    ".tower/tower.db",
    "Library/Keychains",
];

fn q(p: &Path) -> String {
    format!("\"{}\"", p.to_string_lossy().replace('\\', "\\\\").replace('"', "\\\""))
}

pub fn profile(workspace: &Path, tmp: &Path, home: &Path) -> String {
    let mut s = String::from("(version 1)\n(allow default)\n");
    // Writes: nowhere, except the listed places. Later rules win.
    s.push_str("(deny file-write*)\n(allow file-write*\n");
    s.push_str(&format!("  (subpath {})\n  (subpath {})\n", q(workspace), q(tmp)));
    for d in CACHE_DIRS {
        s.push_str(&format!("  (subpath {})\n", q(&home.join(d))));
    }
    s.push_str("  (subpath \"/dev\")\n  (subpath \"/private/var/folders\"))\n");
    // Git metadata Tower trusts when it runs git in the workspace.
    let git = workspace.join(".git");
    s.push_str(&format!(
        "(deny file-write*\n  (literal {})\n  (literal {})\n  (subpath {})\n  (subpath {}))\n",
        q(&git.join("config")),
        q(&git.join("config.lock")),
        q(&git.join("hooks")),
        q(&git.join("tower-empty-hooks")),
    ));
    s.push_str("(deny file-read*\n");
    for d in SECRET_DIRS {
        s.push_str(&format!("  (subpath {})\n", q(&home.join(d))));
    }
    s.push_str(")\n");
    s
}

pub fn available() -> bool {
    cfg!(target_os = "macos") && Path::new("/usr/bin/sandbox-exec").exists()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn profile_allows_workspace_and_denies_secrets() {
        let p = profile(Path::new("/w/G-1"), Path::new("/t/G-1"), Path::new("/Users/a"));
        assert!(p.contains("(allow file-write*\n  (subpath \"/w/G-1\")"));
        assert!(p.contains("(subpath \"/Users/a/.ssh\")"));
        assert!(p.contains("(literal \"/w/G-1/.git/config\")"));
    }

    #[cfg(target_os = "macos")]
    #[test]
    fn profile_is_enforced_by_sandbox_exec() {
        if !available() {
            return;
        }
        // Not under /private/var/folders, which the profile allows as the
        // system temporary directory.
        let tmp = tempfile::tempdir_in("/tmp").unwrap();
        let root = crate::paths::real(tmp.path());
        let ws = root.join("ws");
        let agent_tmp = root.join("tmp");
        std::fs::create_dir_all(ws.join(".git")).unwrap();
        std::fs::create_dir_all(&agent_tmp).unwrap();
        let home = root.join("home");
        std::fs::create_dir_all(home.join(".ssh")).unwrap();
        std::fs::write(home.join(".ssh/id"), "k").unwrap();
        let sb = root.join("p.sb");
        std::fs::write(&sb, profile(&ws, &agent_tmp, &home)).unwrap();

        let run = |cmd: &str| {
            std::process::Command::new("/usr/bin/sandbox-exec")
                .arg("-f")
                .arg(&sb)
                .args(["/bin/sh", "-c", cmd])
                .current_dir(&ws)
                .output()
                .unwrap()
                .status
                .success()
        };
        assert!(run("echo a > inside.txt"));
        assert!(!run(&format!("echo a > {}/outside.txt", root.display())));
        assert!(!run(&format!("cat {}/.ssh/id", home.display())));
        assert!(!run("echo x >> .git/config"));
    }
}
