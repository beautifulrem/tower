//! Removing a goal's folders, whatever the tools in them left read-only.

use std::path::Path;

/// Removes a folder and everything in it; gone already is fine. A folder
/// left read-only (Go's module cache) is made writable first, and a process
/// that was still writing may leave a file behind once: it tries again.
pub(crate) fn remove_tree(dir: &Path) -> std::io::Result<()> {
    let mut result = Ok(());
    for attempt in 0..3 {
        result = match std::fs::remove_dir_all(dir) {
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(()),
            r => r,
        };
        if result.is_ok() {
            break;
        }
        if attempt == 0 {
            make_writable(dir);
        }
        std::thread::sleep(std::time::Duration::from_millis(100));
    }
    result
}

fn make_writable(dir: &Path) {
    use std::os::unix::fs::PermissionsExt;
    let Ok(meta) = std::fs::symlink_metadata(dir) else { return };
    if !meta.is_dir() {
        return;
    }
    let _ = std::fs::set_permissions(dir, std::fs::Permissions::from_mode(meta.permissions().mode() | 0o700));
    if let Ok(entries) = std::fs::read_dir(dir) {
        for e in entries.flatten() {
            make_writable(&e.path());
        }
    }
}
