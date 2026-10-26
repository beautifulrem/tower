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
        if let Some(home) = std::env::var_os("TOWER_HOME") {
            return PathBuf::from(home);
        }
        directories::BaseDirs::new().map(|d| d.home_dir().join(".tower")).unwrap_or_else(|| PathBuf::from(".tower"))
    }

    pub fn ensure(&self) -> std::io::Result<()> {
        for d in ["work", "tmp", "verify", "sessions", "goals", "extensions"] {
            std::fs::create_dir_all(self.root.join(d))?;
        }
        Ok(())
    }

    pub fn db(&self) -> PathBuf {
        self.root.join("tower.db")
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

/// Real path of `p` (symlinks resolved), or `p` if it does not exist. The
/// sandbox matches real paths, so profiles must use them.
pub fn real(p: &Path) -> PathBuf {
    std::fs::canonicalize(p).unwrap_or_else(|_| p.to_path_buf())
}
