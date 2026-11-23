//! SQLite WAL read/write separation (`docs/18` P1.3).
//!
//! Writes remain strictly serialized through the single-writer `Mutex<Store>`
//! (preserving all transactional and projection invariants), while read-heavy
//! UI and remote queries execute concurrently on read-only WAL connections
//! (`SQLITE_OPEN_READ_ONLY` + `PRAGMA query_only = ON`) without waiting behind
//! event appends.

use std::path::Path;
use std::sync::atomic::{AtomicUsize, Ordering};
use std::sync::{Mutex, PoisonError};
use std::time::Duration;

use rusqlite::{Connection, OpenFlags};

use crate::{Result, Store, system_now};

/// A strictly read-only handle onto a WAL-mode Tower database.
///
/// Only exposes `&self` read methods (by wrapping an un-mutable `Store` whose
/// underlying connection was opened with `SQLITE_OPEN_READ_ONLY` and
/// `PRAGMA query_only = ON`).
#[derive(Debug)]
pub struct ReadStore {
    inner: Store,
}

impl ReadStore {
    /// Opens an existing migrated SQLite database in WAL read-only mode.
    pub fn open(path: &Path) -> Result<Self> {
        let flags = OpenFlags::SQLITE_OPEN_READ_ONLY | OpenFlags::SQLITE_OPEN_NO_MUTEX;
        let conn = Connection::open_with_flags(path, flags)?;
        conn.pragma_update(None, "query_only", "ON")?;
        conn.busy_timeout(Duration::from_secs(5))?;
        Ok(Self { inner: Store::from_read_only(conn, Box::new(system_now)) })
    }

    /// Borrows the read-only view of `Store` (`&Store` exposes only read queries).
    pub fn store(&self) -> &Store {
        &self.inner
    }
}

/// Bounded round-robin pool of concurrent WAL readers.
#[derive(Debug)]
pub struct ReadPool {
    readers: Vec<Mutex<ReadStore>>,
    next: AtomicUsize,
}

impl ReadPool {
    /// Opens `size` concurrent read-only connections (clamped to `1..=16`).
    pub fn open(path: &Path, size: usize) -> Result<Self> {
        let n = size.clamp(1, 16);
        let mut readers = Vec::with_capacity(n);
        for _ in 0..n {
            readers.push(Mutex::new(ReadStore::open(path)?));
        }
        Ok(Self { readers, next: AtomicUsize::new(0) })
    }

    /// Runs a read-only closure on a pooled WAL reader without blocking the writer.
    pub fn read<T>(&self, f: impl FnOnce(&Store) -> Result<T>) -> Result<T> {
        let start = self.next.fetch_add(1, Ordering::Relaxed) % self.readers.len();
        // Prefer an uncontended reader slot if one is immediately free.
        for offset in 0..self.readers.len() {
            let slot = (start + offset) % self.readers.len();
            if let Ok(guard) = self.readers[slot].try_lock() {
                return f(guard.store());
            }
        }
        let guard = self.readers[start].lock().unwrap_or_else(PoisonError::into_inner);
        f(guard.store())
    }

    pub fn len(&self) -> usize {
        self.readers.len()
    }

    pub fn is_empty(&self) -> bool {
        self.readers.is_empty()
    }
}
