//! Which processes a goal's sandboxes hold, and stopping them.
//!
//! A process is the goal's when the kernel says so: it runs under a Seatbelt
//! profile (which it can never shed, nor can its children) that lets it write
//! the goal's private directory, and does not let it write Tower's own data
//! directory. Neither its working directory, its open files, its process
//! group nor its session decide: a process can change all of those, and an
//! unrelated program of yours (an editor, a shell) can share them. Your own
//! programs are not sandboxed, and an app's sandbox does not grant writing
//! Tower's private directories, so neither is ever taken for the goal's.
//!
//! Where there is no OS sandbox, a verification's leftovers are found by
//! working directory and open files (`lsof`) in its throwaway directories,
//! which is weaker, and the agent's are not identified at all (its
//! workspace is one you may work in too); see SECURITY.md.

use std::path::{Path, PathBuf};

/// A file in Tower's data directory no Tower profile lets a process write:
/// the second half of a sandbox's identity (see the module comment).
pub(crate) fn marker(root: &Path) -> PathBuf {
    root.join(".sandbox-marker")
}

/// Creates the marker (its content does not matter, only that it exists:
/// the kernel answers questions about existing paths only).
pub(crate) fn ensure_marker(root: &Path) -> std::io::Result<()> {
    let m = marker(root);
    if !m.exists() {
        std::fs::write(&m, "")?;
    }
    Ok(())
}

/// The identity of the processes of one sandbox: whom a probe directory is
/// writable to, and the marker that must not be.
#[derive(Debug, Clone)]
pub(crate) struct Identity {
    probes: Vec<PathBuf>,
    marker: PathBuf,
}

impl Identity {
    /// Processes whose sandbox lets them write any of `probes` (existing
    /// directories, symlinks resolved) but not `marker`.
    pub(crate) fn new(probes: &[PathBuf], marker: &Path) -> Identity {
        Identity {
            probes: probes.iter().filter(|p| p.exists()).map(|p| crate::paths::real(p)).collect(),
            marker: crate::paths::real(marker),
        }
    }

    /// Whether `pid` runs in one of these sandboxes.
    pub(crate) fn holds(&self, pid: i32) -> bool {
        if pid <= 1 || pid == std::process::id() as i32 || self.probes.is_empty() || !sys::sandboxed(pid) {
            return false;
        }
        // A sandbox that may write Tower's own data directory is not one of
        // Tower's (and could be anyone's); refuse to judge it.
        if !self.marker.exists() || sys::may_write(pid, &self.marker) {
            return false;
        }
        self.probes.iter().any(|p| sys::may_write(pid, p))
    }

    /// The processes alive now that this identity holds.
    pub(crate) fn processes(&self) -> Vec<i32> {
        if self.probes.is_empty() {
            return Vec::new();
        }
        sys::all_pids().into_iter().filter(|p| self.holds(*p)).collect()
    }

    /// Stops every process this identity holds, children it forks while
    /// being stopped included: all are frozen first, then killed. Returns
    /// how many were stopped.
    pub(crate) fn stop_all(&self) -> usize {
        if !crate::sandbox::available() {
            return 0;
        }
        let mut frozen: Vec<i32> = Vec::new();
        // Freezing them one by one leaves a window for a fork; looking again
        // until nothing new turns up closes it.
        for _ in 0..20 {
            let found: Vec<i32> = self.processes().into_iter().filter(|p| !frozen.contains(p)).collect();
            if found.is_empty() {
                break;
            }
            for p in found {
                sys::signal(p, sys::SIGSTOP);
                frozen.push(p);
            }
        }
        for p in &frozen {
            sys::signal(*p, sys::SIGKILL);
        }
        frozen.len()
    }
}

/// Stops what one goal's agent left running: everything in the agent's
/// sandbox (its workspace, private TMPDIR and caches).
pub(crate) fn stop_agent_leftovers(paths: &crate::Paths, goal: &str) -> usize {
    let probes =
        [paths.workspace(goal), paths.tmp(goal), paths.goal_dir(goal).join("cache")].map(|p| crate::paths::real(&p));
    Identity::new(&probes, &marker(&paths.root)).stop_all()
}

/// Stops every process any of Tower's sandboxes in `root` holds: at start
/// (left over by a crash or a forced quit) and at exit.
pub(crate) fn stop_all_leftovers(paths: &crate::Paths) -> usize {
    let mut probes = Vec::new();
    let mut dirs_of = |d: &Path, depth: usize| {
        let mut level = vec![d.to_path_buf()];
        for _ in 0..depth {
            level = level
                .iter()
                .filter_map(|p| std::fs::read_dir(p).ok())
                .flat_map(|it| it.flatten().map(|e| e.path()))
                .filter(|p| p.is_dir())
                .collect();
            probes.extend(level.iter().cloned());
        }
    };
    dirs_of(&paths.root.join("work"), 1);
    dirs_of(&paths.root.join("tmp"), 2);
    dirs_of(&paths.root.join("verify"), 2);
    dirs_of(&paths.root.join("checks"), 2);
    dirs_of(&paths.root.join("goals"), 2);
    Identity::new(&probes, &marker(&paths.root)).stop_all()
}

/// Where there is no OS sandbox: whatever has its working directory or an
/// open file inside `dirs` (Tower's own process excepted). Only for
/// directories nothing of yours works in (a verification's checkout).
pub(crate) fn stop_by_open_files(dirs: &[PathBuf]) {
    let prefixes: Vec<String> =
        dirs.iter().map(|d| format!("{}/", crate::paths::real(d).display())).filter(|p| p.len() > 2).collect();
    let Ok(out) = std::process::Command::new("/usr/sbin/lsof").args(["-n", "-P", "-w", "-F", "pn"]).output() else {
        return;
    };
    let me = std::process::id() as i32;
    let mut pid = 0i32;
    let mut doomed = std::collections::BTreeSet::new();
    for line in String::from_utf8_lossy(&out.stdout).lines() {
        if let Some(p) = line.strip_prefix('p') {
            pid = p.parse().unwrap_or(0);
        } else if let Some(name) = line.strip_prefix('n')
            && pid > 1
            && pid != me
            && prefixes.iter().any(|p| name.starts_with(p.as_str()) || format!("{name}/") == *p)
        {
            doomed.insert(pid);
        }
    }
    for pid in doomed {
        sys::signal(pid, sys::SIGKILL);
    }
}

/// Stops whatever a verification started and left running (a server, a
/// daemonised watcher). With the OS sandbox: every process in the
/// verification's sandbox, wherever it moved; without: by open files.
pub(crate) fn stop_verification_leftovers(root: &Path, dirs: &[PathBuf]) {
    if crate::sandbox::available() {
        Identity::new(dirs, &marker(root)).stop_all();
    } else {
        stop_by_open_files(dirs);
    }
}

/// The process group of `pid`, if it is alive.
pub(crate) fn pgid(pid: i32) -> Option<i32> {
    sys::pgid(pid)
}

#[cfg(target_os = "macos")]
#[allow(unsafe_code)]
mod sys {
    use std::ffi::{CString, c_char, c_int, c_void};
    use std::os::unix::ffi::OsStrExt;
    use std::path::Path;

    pub const SIGKILL: c_int = 9;
    pub const SIGSTOP: c_int = 17;
    /// `SANDBOX_FILTER_PATH`, and `SANDBOX_CHECK_NO_REPORT` so asking does
    /// not log a denial.
    const FILTER_PATH: c_int = 1;
    const NO_REPORT: c_int = 0x4000_0000;

    unsafe extern "C" {
        fn sandbox_check(pid: c_int, operation: *const c_char, filter: c_int, ...) -> c_int;
        fn proc_listallpids(buffer: *mut c_void, size: c_int) -> c_int;
        fn kill(pid: c_int, sig: c_int) -> c_int;
        fn getpgid(pid: c_int) -> c_int;
    }

    /// Whether `pid` runs under any sandbox (an error counts as no).
    pub fn sandboxed(pid: i32) -> bool {
        // SAFETY: a null operation with no filter asks only whether the
        // process is sandboxed; no pointers are read.
        unsafe { sandbox_check(pid, std::ptr::null(), 0) == 1 }
    }

    /// Whether `pid`'s sandbox lets it create files in (or write) `path`,
    /// which must exist.
    pub fn may_write(pid: i32, path: &Path) -> bool {
        let Ok(p) = CString::new(path.as_os_str().as_bytes()) else { return false };
        let op = c"file-write-create";
        // SAFETY: both strings are valid and NUL-terminated for the call;
        // the path filter takes exactly one string argument.
        unsafe { sandbox_check(pid, op.as_ptr(), FILTER_PATH | NO_REPORT, p.as_ptr()) == 0 }
    }

    pub fn all_pids() -> Vec<i32> {
        // SAFETY: a null buffer asks for the count only.
        let n = unsafe { proc_listallpids(std::ptr::null_mut(), 0) };
        if n <= 0 {
            return Vec::new();
        }
        // Room for processes started in between.
        let mut pids = vec![0i32; n as usize + 64];
        let bytes = (pids.len() * std::mem::size_of::<i32>()) as c_int;
        // SAFETY: the buffer holds `bytes` bytes and outlives the call.
        let got = unsafe { proc_listallpids(pids.as_mut_ptr().cast(), bytes) };
        pids.truncate(got.max(0) as usize);
        pids.retain(|p| *p > 1);
        pids
    }

    pub fn signal(pid: i32, sig: c_int) {
        if pid > 1 {
            // SAFETY: plain system call; a failure (gone, not ours) is fine.
            unsafe {
                kill(pid, sig);
            }
        }
    }

    pub fn pgid(pid: i32) -> Option<i32> {
        // SAFETY: plain system call.
        let g = unsafe { getpgid(pid) };
        (g > 0).then_some(g)
    }
}

#[cfg(not(target_os = "macos"))]
mod sys {
    use std::path::Path;
    pub const SIGKILL: i32 = 9;
    pub const SIGSTOP: i32 = 19;
    pub fn sandboxed(_pid: i32) -> bool {
        false
    }
    pub fn may_write(_pid: i32, _path: &Path) -> bool {
        false
    }
    pub fn all_pids() -> Vec<i32> {
        Vec::new()
    }
    pub fn signal(pid: i32, sig: i32) {
        let _ = std::process::Command::new("/bin/kill").args([format!("-{sig}"), pid.to_string()]).status();
    }
    pub fn pgid(_pid: i32) -> Option<i32> {
        None
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    /// A process in a goal's sandbox is found and stopped wherever it went;
    /// an unsandboxed one working in the same directory is left alone.
    #[cfg(target_os = "macos")]
    #[test]
    fn only_the_sandboxs_own_processes_are_stopped() {
        if !crate::sandbox::available() {
            return;
        }
        let tmp = tempfile::tempdir_in("/tmp").unwrap();
        let root = crate::paths::real(tmp.path());
        let probe = root.join("goal-tmp");
        let other = root.join("other-goal-tmp");
        for d in [&probe, &other] {
            std::fs::create_dir_all(d).unwrap();
        }
        ensure_marker(&root).unwrap();
        let sb = root.join("p.sb");
        let rule = |dir: &Path| {
            format!(
                "(version 1)\n(allow default)\n(deny file-write*)\n(allow file-write* (subpath \"{}\") (literal \"/dev/null\"))\n",
                dir.display()
            )
        };
        std::fs::write(&sb, rule(&probe)).unwrap();
        let sb_other = root.join("q.sb");
        std::fs::write(&sb_other, rule(&other)).unwrap();
        let spawn = |profile: &Path| {
            std::process::Command::new("/usr/bin/sandbox-exec")
                .arg("-f")
                .arg(profile)
                // Leaves the directory and closes everything: only the
                // sandbox still tells.
                .args(["/bin/sh", "-c", "cd / && exec /bin/sleep 30"])
                .current_dir(&probe)
                .spawn()
                .unwrap()
        };
        let mut mine = spawn(&sb);
        let mut theirs = spawn(&sb_other);
        let mut yours = std::process::Command::new("/bin/sleep").arg("30").current_dir(&probe).spawn().unwrap();
        std::thread::sleep(std::time::Duration::from_millis(300));
        let id = Identity::new(std::slice::from_ref(&probe), &marker(&root));
        assert!(id.holds(mine.id() as i32), "the sandbox's own process is known");
        assert!(!id.holds(yours.id() as i32), "an unsandboxed process in the same directory is not");
        assert!(!id.holds(theirs.id() as i32), "another sandbox's is not");
        assert_eq!(id.stop_all(), 1);
        assert!(mine.wait().is_ok());
        assert!(theirs.try_wait().unwrap().is_none(), "another goal's process keeps running");
        assert!(yours.try_wait().unwrap().is_none(), "yours keeps running");
        let _ = theirs.kill();
        let _ = yours.kill();
    }

    /// A sandbox that may write Tower's own data directory is never judged
    /// to be a goal's.
    #[cfg(target_os = "macos")]
    #[test]
    fn a_sandbox_that_may_write_everywhere_is_not_taken_for_a_goals() {
        if !crate::sandbox::available() {
            return;
        }
        let tmp = tempfile::tempdir_in("/tmp").unwrap();
        let root = crate::paths::real(tmp.path());
        let probe = root.join("goal-tmp");
        std::fs::create_dir_all(&probe).unwrap();
        ensure_marker(&root).unwrap();
        let sb = root.join("p.sb");
        std::fs::write(&sb, "(version 1)\n(allow default)\n").unwrap();
        let mut broad = std::process::Command::new("/usr/bin/sandbox-exec")
            .arg("-f")
            .arg(&sb)
            .args(["/bin/sleep", "30"])
            .spawn()
            .unwrap();
        std::thread::sleep(std::time::Duration::from_millis(300));
        let id = Identity::new(&[probe], &marker(&root));
        assert!(!id.holds(broad.id() as i32));
        let _ = broad.kill();
        let _ = broad.wait();
    }
}
