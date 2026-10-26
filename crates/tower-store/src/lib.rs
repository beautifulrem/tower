//! Tower's persistent state: one SQLite database, one writer (`ADR-005`).
//!
//! Every change to a goal goes through [`Store::append`], which writes the
//! event and updates the projections derived from it in the same
//! transaction. Reads build the UI read models in `tower_core::view`.

mod events;
mod goals;
mod inbox;
mod projects;
mod schema;
mod settings;

use std::path::Path;
use std::time::{SystemTime, UNIX_EPOCH};

use rusqlite::Connection;
use thiserror::Error;
use tower_core::Millis;

pub use goals::{GoalRecord, NewGoal};
pub use inbox::NewInboxItem;
pub use projects::NewProject;

#[derive(Debug, Error)]
pub enum StoreError {
    #[error("database error: {0}")]
    Sql(#[from] rusqlite::Error),
    #[error("corrupt stored value: {0}")]
    Json(#[from] serde_json::Error),
    #[error("{0} not found")]
    NotFound(String),
    #[error("{0}")]
    Conflict(String),
}

pub type Result<T, E = StoreError> = std::result::Result<T, E>;

type Clock = Box<dyn Fn() -> Millis + Send>;

pub struct Store {
    conn: Connection,
    clock: Clock,
}

impl std::fmt::Debug for Store {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("Store").finish_non_exhaustive()
    }
}

pub fn system_now() -> Millis {
    SystemTime::now().duration_since(UNIX_EPOCH).map(|d| d.as_millis() as Millis).unwrap_or(0)
}

impl Store {
    pub fn open(path: &Path) -> Result<Self> {
        Self::with_connection(Connection::open(path)?, Box::new(system_now))
    }

    pub fn open_in_memory() -> Result<Self> {
        Self::with_connection(Connection::open_in_memory()?, Box::new(system_now))
    }

    /// For tests: a store whose clock is under the caller's control.
    pub fn open_in_memory_with_clock(clock: impl Fn() -> Millis + Send + 'static) -> Result<Self> {
        Self::with_connection(Connection::open_in_memory()?, Box::new(clock))
    }

    fn with_connection(mut conn: Connection, clock: Clock) -> Result<Self> {
        conn.pragma_update(None, "journal_mode", "WAL")?;
        conn.pragma_update(None, "synchronous", "NORMAL")?;
        conn.pragma_update(None, "foreign_keys", "ON")?;
        conn.busy_timeout(std::time::Duration::from_secs(5))?;
        schema::migrate(&mut conn)?;
        Ok(Self { conn, clock })
    }

    pub(crate) fn now(&self) -> Millis {
        (self.clock)()
    }
}

pub(crate) fn new_id(prefix: &str) -> String {
    format!("{prefix}_{}", uuid::Uuid::now_v7().simple())
}

#[cfg(test)]
pub(crate) mod test_support {
    use super::*;
    use std::sync::Arc;
    use std::sync::atomic::{AtomicI64, Ordering};

    pub struct TestClock(pub Arc<AtomicI64>);

    impl TestClock {
        pub fn advance(&self, ms: i64) {
            self.0.fetch_add(ms, Ordering::SeqCst);
        }
    }

    pub fn store() -> (Store, TestClock) {
        let t = Arc::new(AtomicI64::new(1_000));
        let t2 = t.clone();
        let store = Store::open_in_memory_with_clock(move || t2.load(Ordering::SeqCst)).unwrap();
        (store, TestClock(t))
    }
}
