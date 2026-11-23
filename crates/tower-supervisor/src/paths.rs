//! Tower's data directory layout (`docs/06` §6.6.1).
//!
//! ```text
//! ~/.tower/
//!   tower.db                 event log and projections
//!   work/<goal>/             the goal's satellite clone (agent workspace)
//!   tmp/<goal>/              the agent's private TMPDIR
//!   verify/<goal>/           clean checkout of a pin, only while verifying
//!   sessions/<goal>/         Pi session files for the goal
//!   goals/<goal>/            contract.json and sandbox.sb handed to the engine
//!   extensions/tower-goal/   the bundled Pi extension
//! ```

use std::path::{Path, PathBuf};

#[derive(Debug, Clone)]
pub struct Paths {
    pub root: PathBuf,
}

impl Paths {
    pub fn new(root: impl Into<PathBuf>) -> Self {
        Self { root: root.into() }
    }

    /// `$TOWER_HOME`, else `~/.tower`.
    pub fn default_root() -> PathBuf {
        root_from(std::env::var_os("TOWER_HOME"), directories::BaseDirs::new().map(|d| d.home_dir().to_path_buf()))
    }

    /// Creates the data folder, readable by you alone (`docs/11` T24). A
    /// relative root is refused: it would make the data folder (and what
    /// the start-up sweep clears) wherever Tower happened to start.
    pub fn ensure(&self) -> std::io::Result<()> {
        use std::os::unix::fs::PermissionsExt;
        if !self.root.is_absolute() {
            return Err(std::io::Error::new(
                std::io::ErrorKind::InvalidInput,
                format!("Tower's data folder must be an absolute path (TOWER_HOME): {}", self.root.display()),
            ));
        }
        for d in ["work", "tmp", "verify", "sessions", "goals", "extensions"] {
            std::fs::create_dir_all(self.root.join(d))?;
            std::fs::set_permissions(self.root.join(d), std::fs::Permissions::from_mode(0o700))?;
        }
        std::fs::set_permissions(&self.root, std::fs::Permissions::from_mode(0o700))
    }

    pub fn db(&self) -> PathBuf {
        self.root.join("tower.db")
    }

    /// Makes the event store and its write-ahead files yours alone (SQLite
    /// gives new ones the store's own mode).
    pub fn restrict_store(&self) -> std::io::Result<()> {
        use std::os::unix::fs::PermissionsExt;
        for suffix in ["", "-wal", "-shm"] {
            let f = PathBuf::from(format!("{}{suffix}", self.db().display()));
            if f.exists() {
                std::fs::set_permissions(f, std::fs::Permissions::from_mode(0o600))?;
            }
        }
        Ok(())
    }

    pub fn workspace(&self, goal: &str) -> PathBuf {
        self.root.join("work").join(goal)
    }

    pub fn tmp(&self, goal: &str) -> PathBuf {
        self.root.join("tmp").join(goal)
    }

    pub fn verify(&self, goal: &str) -> PathBuf {
        self.root.join("verify").join(goal)
    }

    pub fn sessions(&self, goal: &str) -> PathBuf {
        self.root.join("sessions").join(goal)
    }

    pub fn goal_dir(&self, goal: &str) -> PathBuf {
        self.root.join("goals").join(goal)
    }

    /// Private directory storing pasted multimodal image attachments for `goal`.
    pub fn attachments_dir(&self, goal: &str) -> PathBuf {
        self.goal_dir(goal).join("attachments")
    }

    pub fn extension_dir(&self) -> PathBuf {
        self.root.join("extensions").join("tower-goal")
    }

    /// The installed demo engine (a scripted stand-in for Pi).
    pub fn demo_engine(&self) -> PathBuf {
        self.root.join("engines").join("demo_pi.py")
    }

    /// Repositories created for the in-app demo. Goals of projects under
    /// here run on the demo engine instead of Pi.
    pub fn demo_projects(&self) -> PathBuf {
        self.root.join("demo")
    }
}

/// The data folder for a `TOWER_HOME` value and a home directory. An empty
/// `TOWER_HOME` counts as unset; a relative one is kept, for
/// [`Paths::ensure`] to refuse.
fn root_from(tower_home: Option<std::ffi::OsString>, home: Option<PathBuf>) -> PathBuf {
    if let Some(root) = tower_home.filter(|r| !r.is_empty()) {
        return PathBuf::from(root);
    }
    home.map(|h| h.join(".tower")).unwrap_or_else(|| PathBuf::from(".tower"))
}

/// Real path of `p` (symlinks resolved), or `p` if it does not exist. The
/// sandbox matches real paths, so profiles must use them.
pub fn real(p: &Path) -> PathBuf {
    std::fs::canonicalize(p).unwrap_or_else(|_| p.to_path_buf())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::os::unix::fs::PermissionsExt;

    fn mode(p: &Path) -> u32 {
        std::fs::metadata(p).unwrap().permissions().mode() & 0o777
    }

    /// An empty `TOWER_HOME` means the default; a relative one (which would
    /// make the data folder wherever Tower was started) is refused.
    #[test]
    fn an_empty_or_relative_tower_home_never_makes_the_current_folder_towers() {
        let home = PathBuf::from("/Users/ada");
        assert_eq!(root_from(Some("".into()), Some(home.clone())), home.join(".tower"));
        assert_eq!(root_from(None, Some(home.clone())), home.join(".tower"));
        assert_eq!(root_from(Some("/data/t".into()), Some(home)), PathBuf::from("/data/t"));
        for relative in ["tower-relative-home-test", "."] {
            let err = Paths::new(relative).ensure().unwrap_err();
            assert_eq!(err.kind(), std::io::ErrorKind::InvalidInput, "{relative}: {err}");
        }
        assert!(!Path::new("tower-relative-home-test").exists(), "nothing was created");
        assert!(!Path::new("work").exists(), "nothing was created in the current folder");
    }

    /// Tower's data folder is yours alone: the folders 0700 and the event
    /// store (with its write-ahead log) 0600, whatever the umask.
    #[test]
    fn towers_data_folder_and_store_are_private() {
        let tmp = tempfile::tempdir().unwrap();
        let paths = Paths::new(tmp.path().join("tower"));
        paths.ensure().unwrap();
        // An existing install made with the default umask.
        std::fs::set_permissions(&paths.root, std::fs::Permissions::from_mode(0o755)).unwrap();
        paths.ensure().unwrap();
        assert_eq!(mode(&paths.root), 0o700);
        for d in ["work", "tmp", "verify", "sessions", "goals", "extensions"] {
            assert_eq!(mode(&paths.root.join(d)), 0o700, "{d}");
        }

        let store = tower_store::Store::open(&paths.db()).unwrap();
        paths.restrict_store().unwrap();
        let mut seen = 0;
        for suffix in ["", "-wal", "-shm"] {
            let f = PathBuf::from(format!("{}{suffix}", paths.db().display()));
            if f.exists() {
                assert_eq!(mode(&f), 0o600, "tower.db{suffix}");
                seen += 1;
            }
        }
        assert!(seen >= 2, "the store and its write-ahead log exist");
        drop(store);
    }
}
