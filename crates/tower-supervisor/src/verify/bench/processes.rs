//! What a verification leaves behind: processes it started, directories it
//! used.

/// Stops whatever a verification started and left running (a server, a
/// daemonised watcher): every process whose working directory or open
/// files are inside the verification's directories. (One that leaves them
/// entirely can only write to those directories, which are deleted and
/// never reused.)
pub(in crate::verify) fn stop_survivors(dirs: &[std::path::PathBuf]) {
    let prefixes: Vec<String> =
        dirs.iter().map(|d| format!("{}/", crate::paths::real(d).display())).filter(|p| p.len() > 2).collect();
    let Ok(out) = std::process::Command::new("/usr/sbin/lsof").args(["-n", "-P", "-w", "-F", "pn"]).output() else {
        return;
    };
    let me = std::process::id();
    let mut pid = 0u32;
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
        let _ = std::process::Command::new("/bin/kill").args(["-KILL", &pid.to_string()]).status();
    }
}

/// Removes a directory when dropped (best effort).
#[derive(Debug)]
pub(in crate::verify) struct RemoveOnDrop(pub(in crate::verify) std::path::PathBuf);

impl Drop for RemoveOnDrop {
    fn drop(&mut self) {
        let _ = std::fs::remove_dir_all(&self.0);
    }
}
