//! What a verification leaves behind: directories it used. (Processes it
//! started are stopped by `crate::procs`, which knows them by their
//! sandbox rather than by where they work.)

/// Removes a directory when dropped (best effort).
#[derive(Debug)]
pub(in crate::verify) struct RemoveOnDrop(pub(in crate::verify) std::path::PathBuf);

impl Drop for RemoveOnDrop {
    fn drop(&mut self) {
        let _ = std::fs::remove_dir_all(&self.0);
    }
}
