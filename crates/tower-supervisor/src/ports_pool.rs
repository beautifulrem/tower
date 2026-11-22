//! Per-goal dynamic port block allocator (`docs/18` §18.4 P1.3).
//!
//! Allocates non-overlapping 10-port blocks per active goal (exporting
//! `TOWER_PORT_BASE`, `TOWER_PORT_COUNT=10`, `TOWER_PORT_0..9`), persists
//! allocations atomically so restarts never double-assign, and feeds every
//! allocated port into the goal's Seatbelt loopback allowlist so parallel dev
//! servers never collide.

use std::collections::{BTreeMap, HashMap};
use std::io;
use std::net::TcpListener;
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex, OnceLock, PoisonError};

use serde::{Deserialize, Serialize};

use crate::sandbox::COMMON_PROXY_PORTS;

/// Default inclusive start of Tower's dynamic port pool (disjoint from common
/// dev ports, local proxies, test ranges, and OS ephemeral ports).
pub const DEFAULT_RANGE_START: u16 = 20_000;

/// Default inclusive end of Tower's dynamic port pool (1,000 non-overlapping 10-port blocks).
pub const DEFAULT_RANGE_END: u16 = 29_999;

/// Number of contiguous ports reserved per goal.
pub const DEFAULT_BLOCK_SIZE: u16 = 10;

/// One goal's reserved contiguous port block.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct PortAllocation {
    pub goal_id: String,
    pub base: u16,
    pub count: u16,
}

impl PortAllocation {
    /// Every port in `[base, base + count)`.
    pub fn ports(&self) -> Vec<u16> {
        (0..self.count).filter_map(|i| self.base.checked_add(i)).collect()
    }

    /// Inclusive upper port of this block.
    pub fn end_inclusive(&self) -> u16 {
        self.base.saturating_add(self.count.saturating_sub(1))
    }

    /// Whether `port` belongs to this block.
    pub fn contains(&self, port: u16) -> bool {
        port >= self.base && port <= self.end_inclusive()
    }

    /// Environment variables injected into the goal's processes:
    /// `TOWER_PORT_BASE`, `TOWER_PORT_COUNT`, and `TOWER_PORT_0..TOWER_PORT_<n-1>`.
    pub fn env_vars(&self) -> Vec<(String, String)> {
        let mut vars = Vec::with_capacity(usize::from(self.count) + 2);
        vars.push(("TOWER_PORT_BASE".into(), self.base.to_string()));
        vars.push(("TOWER_PORT_COUNT".into(), self.count.to_string()));
        for i in 0..self.count {
            if let Some(p) = self.base.checked_add(i) {
                vars.push((format!("TOWER_PORT_{i}"), p.to_string()));
            }
        }
        vars
    }
}

#[derive(Debug, Default, Serialize, Deserialize)]
struct PersistedPool {
    allocations: Vec<PortAllocation>,
}

/// Thread-safe, persistently backed non-overlapping port block allocator.
pub struct PortPool {
    persist_path: Option<PathBuf>,
    range_start: u16,
    range_end: u16,
    block_size: u16,
    allocations: Mutex<BTreeMap<String, PortAllocation>>,
    probe_free: Box<dyn Fn(u16) -> bool + Send + Sync>,
}

impl std::fmt::Debug for PortPool {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        let count = self.allocations.lock().unwrap_or_else(PoisonError::into_inner).len();
        f.debug_struct("PortPool")
            .field("persist_path", &self.persist_path)
            .field("range_start", &self.range_start)
            .field("range_end", &self.range_end)
            .field("block_size", &self.block_size)
            .field("active_blocks", &count)
            .finish()
    }
}

impl PortPool {
    /// Creates a pool using the default range (`20000..=29999`, 10-port blocks)
    /// and loads any persisted allocations from `persist_path`.
    pub fn new(persist_path: Option<PathBuf>) -> Self {
        Self::with_range(persist_path, DEFAULT_RANGE_START, DEFAULT_RANGE_END, DEFAULT_BLOCK_SIZE)
    }

    /// Creates a pool with explicit range and block size.
    pub fn with_range(persist_path: Option<PathBuf>, range_start: u16, range_end: u16, block_size: u16) -> Self {
        Self::with_probe(persist_path, range_start, range_end, block_size, default_port_free)
    }

    /// Creates a pool with a custom port-availability probe (for deterministic tests).
    pub fn with_probe(
        persist_path: Option<PathBuf>,
        range_start: u16,
        range_end: u16,
        block_size: u16,
        probe: impl Fn(u16) -> bool + Send + Sync + 'static,
    ) -> Self {
        let block_size = block_size.max(1);
        let loaded = persist_path.as_deref().map(load_persisted).unwrap_or_default();
        let mut map = BTreeMap::new();
        for alloc in loaded {
            if alloc.base >= range_start && alloc.end_inclusive() <= range_end && alloc.count == block_size {
                map.insert(alloc.goal_id.clone(), alloc);
            }
        }
        Self {
            persist_path,
            range_start,
            range_end,
            block_size,
            allocations: Mutex::new(map),
            probe_free: Box::new(probe),
        }
    }

    /// Allocates (or returns the existing) non-overlapping port block for `goal_id`.
    pub fn allocate(&self, goal_id: &str) -> io::Result<PortAllocation> {
        let mut map = self.allocations.lock().unwrap_or_else(PoisonError::into_inner);
        if let Some(existing) = map.get(goal_id) {
            return Ok(existing.clone());
        }
        let mut base = self.range_start;
        while let Some(end) = base.checked_add(self.block_size - 1) {
            if end > self.range_end {
                break;
            }
            let overlaps_allocated = map.values().any(|a| ranges_overlap(base, end, a.base, a.end_inclusive()));
            let overlaps_proxy = (base..=end).any(|p| COMMON_PROXY_PORTS.contains(&p));
            if !overlaps_allocated && !overlaps_proxy && (base..=end).all(|p| (self.probe_free)(p)) {
                let alloc = PortAllocation { goal_id: goal_id.to_string(), base, count: self.block_size };
                map.insert(goal_id.to_string(), alloc.clone());
                self.save_locked(&map)?;
                return Ok(alloc);
            }
            let Some(next) = base.checked_add(self.block_size) else { break };
            base = next;
        }
        Err(io::Error::new(
            io::ErrorKind::AddrNotAvailable,
            format!("no free {}-port block available in {}..={}", self.block_size, self.range_start, self.range_end),
        ))
    }

    /// Returns the existing allocation for `goal_id`, if any.
    pub fn get(&self, goal_id: &str) -> Option<PortAllocation> {
        self.allocations.lock().unwrap_or_else(PoisonError::into_inner).get(goal_id).cloned()
    }

    /// Releases `goal_id`'s port block cleanly and updates persistence.
    pub fn release(&self, goal_id: &str) -> io::Result<Option<PortAllocation>> {
        let mut map = self.allocations.lock().unwrap_or_else(PoisonError::into_inner);
        let removed = map.remove(goal_id);
        if removed.is_some() {
            self.save_locked(&map)?;
        }
        Ok(removed)
    }

    /// Lists all active allocations ordered by `goal_id`.
    pub fn list(&self) -> Vec<PortAllocation> {
        self.allocations.lock().unwrap_or_else(PoisonError::into_inner).values().cloned().collect()
    }

    /// Drops any allocations whose `goal_id` is not in `active_goal_ids` (e.g. on startup recovery).
    pub fn retain_active(&self, active_goal_ids: &[String]) -> io::Result<Vec<PortAllocation>> {
        let mut map = self.allocations.lock().unwrap_or_else(PoisonError::into_inner);
        let stale_ids: Vec<String> = map.keys().filter(|id| !active_goal_ids.contains(id)).cloned().collect();
        let mut released = Vec::with_capacity(stale_ids.len());
        for id in stale_ids {
            if let Some(a) = map.remove(&id) {
                released.push(a);
            }
        }
        if !released.is_empty() {
            self.save_locked(&map)?;
        }
        Ok(released)
    }

    fn save_locked(&self, map: &BTreeMap<String, PortAllocation>) -> io::Result<()> {
        let Some(path) = &self.persist_path else {
            return Ok(());
        };
        if let Some(parent) = path.parent() {
            std::fs::create_dir_all(parent)?;
        }
        let payload = PersistedPool { allocations: map.values().cloned().collect() };
        let data = serde_json::to_vec_pretty(&payload).map_err(io::Error::other)?;
        let tmp = path.with_extension(format!("json.tmp.{}", uuid::Uuid::new_v4().simple()));
        std::fs::write(&tmp, data)?;
        std::fs::rename(&tmp, path)?;
        Ok(())
    }
}

fn ranges_overlap(a_start: u16, a_end: u16, b_start: u16, b_end: u16) -> bool {
    a_start <= b_end && b_start <= a_end
}

fn default_port_free(port: u16) -> bool {
    TcpListener::bind(("127.0.0.1", port)).is_ok()
}

fn load_persisted(path: &Path) -> Vec<PortAllocation> {
    let Ok(bytes) = std::fs::read(path) else {
        return Vec::new();
    };
    serde_json::from_slice::<PersistedPool>(&bytes).map(|p| p.allocations).unwrap_or_default()
}

/// Returns the shared [`PortPool`] persisted at `<root>/port-pool.json`.
pub fn shared_for_root(root: &Path) -> Arc<PortPool> {
    static REGISTRY: OnceLock<Mutex<HashMap<PathBuf, Arc<PortPool>>>> = OnceLock::new();
    let key = crate::paths::real(root);
    let mut map = REGISTRY.get_or_init(Mutex::default).lock().unwrap_or_else(PoisonError::into_inner);
    map.entry(key.clone()).or_insert_with(|| Arc::new(PortPool::new(Some(key.join("port-pool.json"))))).clone()
}

/// Allocates (or fetches) the 10-port block for `goal_id` under Tower root `root`.
pub fn allocate_for_root(root: &Path, goal_id: &str) -> io::Result<PortAllocation> {
    shared_for_root(root).allocate(goal_id)
}

/// Looks up `goal_id`'s currently allocated port block under `root`, if any.
pub fn get_for_root(root: &Path, goal_id: &str) -> Option<PortAllocation> {
    shared_for_root(root).get(goal_id)
}

/// Releases `goal_id`'s port block under `root`.
pub fn release_for_root(root: &Path, goal_id: &str) -> io::Result<Option<PortAllocation>> {
    shared_for_root(root).release(goal_id)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn allocates_non_overlapping_10_port_blocks_and_env_vars() {
        let tmp = tempfile::tempdir().unwrap();
        let file = tmp.path().join("port-pool.json");
        let pool = PortPool::with_probe(Some(file.clone()), 21_000, 21_099, 10, |_| true);

        let a = pool.allocate("g1").unwrap();
        let b = pool.allocate("g2").unwrap();
        let a_again = pool.allocate("g1").unwrap();
        assert_eq!(a, a_again, "allocation is idempotent per goal");
        assert_eq!(a.base, 21_000);
        assert_eq!(a.count, 10);
        assert_eq!(b.base, 21_010);
        assert_eq!(a.ports(), (21_000..21_010).collect::<Vec<_>>());
        assert!(!a.ports().iter().any(|p| b.contains(*p)));

        let vars = a.env_vars();
        assert!(vars.contains(&("TOWER_PORT_BASE".into(), "21000".into())));
        assert!(vars.contains(&("TOWER_PORT_COUNT".into(), "10".into())));
        assert!(vars.contains(&("TOWER_PORT_0".into(), "21000".into())));
        assert!(vars.contains(&("TOWER_PORT_9".into(), "21009".into())));
        assert_eq!(vars.len(), 12);

        // Reloading from disk preserves allocations and assigns next free block.
        let reloaded = PortPool::with_probe(Some(file), 21_000, 21_099, 10, |_| true);
        assert_eq!(reloaded.get("g1"), Some(a.clone()));
        assert_eq!(reloaded.get("g2"), Some(b.clone()));
        let c = reloaded.allocate("g3").unwrap();
        assert_eq!(c.base, 21_020);

        // Releasing g1 makes its block reusable.
        assert_eq!(reloaded.release("g1").unwrap(), Some(a));
        let d = reloaded.allocate("g4").unwrap();
        assert_eq!(d.base, 21_000);
    }

    #[test]
    fn skips_busy_and_proxy_ports_and_reclaims_stale_goals() {
        let pool = PortPool::with_probe(None, 7_880, 7_929, 10, |p| p != 7_885);
        // 7880..7889 has busy port 7885; 7890..7899 contains proxy port 7890 -> must pick 7900!
        let alloc = pool.allocate("g1").unwrap();
        assert_eq!(alloc.base, 7_900);
        let _ = pool.allocate("g2").unwrap();
        let released = pool.retain_active(&["g2".to_string()]).unwrap();
        assert_eq!(released.len(), 1);
        assert_eq!(released[0].goal_id, "g1");
        assert!(pool.get("g1").is_none());
        assert!(pool.get("g2").is_some());
    }
}
