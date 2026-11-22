//! Platform-agnostic sandbox backend abstraction (`docs/18` §18.5 P2.1).
//!
//! Unifies macOS Seatbelt ([`MacSeatbeltBackend`]), Linux `bwrap` + Landlock
//! ABI v3+ + cgroups v2 ([`super::linux::LinuxSandboxBackend`]), and macOS 26+
//! Apple Containerization MicroVM ([`super::container::AppleContainerBackend`])
//! behind one trait covering profile generation, command wrapping, persistent
//! FS helper spawning, atomic process-tree cleanup, COW cache seeding, and
//! typed capability/diagnostic reporting.

use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};

use super::container::AppleContainerBackend;
use super::linux::LinuxSandboxBackend;
use super::{Spec, available, profile};

/// Identifies a concrete OS isolation backend.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum SandboxKind {
    MacSeatbelt,
    LinuxBwrapLandlock,
    AppleContainerMicroVm,
    None,
}

impl SandboxKind {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::MacSeatbelt => "mac_seatbelt",
            Self::LinuxBwrapLandlock => "linux_bwrap_landlock",
            Self::AppleContainerMicroVm => "apple_container_microvm",
            Self::None => "none",
        }
    }
}

/// Actionable environment diagnostic surfaced by a sandbox backend.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct SandboxDiagnostic {
    pub code: String,
    pub blocking: bool,
    pub summary_en: String,
    pub summary_zh: String,
    pub fix: Option<String>,
}

/// Structured isolation properties reported by a backend.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct SandboxCapabilities {
    pub kind: SandboxKind,
    pub label: String,
    pub available: bool,
    pub read_allowlist: bool,
    pub write_only_drop_box: bool,
    pub append_only_transcript: bool,
    pub network_isolation: bool,
    pub loopback_port_isolation: bool,
    pub atomic_process_cleanup: bool,
    pub cow_cache_seeding: bool,
    pub hypervisor_isolation: bool,
    pub supports_native_host_toolchains: bool,
    pub limitations: Vec<String>,
    pub diagnostics: Vec<SandboxDiagnostic>,
}

/// High-level sandbox posture suitable for Settings / Operations telemetry.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct SandboxPostureSummary {
    pub backend_name: String,
    pub kind: SandboxKind,
    pub microvm_available: bool,
    pub warnings: Vec<String>,
    pub capabilities: Vec<SandboxCapabilities>,
}

/// Materialized sandbox policy/spec ready to wrap commands and FS helpers.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct PreparedProfile {
    pub kind: SandboxKind,
    /// On-disk profile/spec file (`.sb` on macOS, `.json` spec on Linux/Container).
    pub profile_path: Option<PathBuf>,
    /// Serialized profile text (SBPL or JSON spec).
    pub rendered: String,
    /// Extra environment variables needed by processes inside this sandbox.
    pub extra_env: Vec<(String, String)>,
}

/// A sandbox-wrapped executable invocation.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct WrappedCommand {
    pub program: PathBuf,
    pub args: Vec<String>,
    pub env: Vec<(String, String)>,
}

impl WrappedCommand {
    /// Renders this invocation as a POSIX-quoted `exec ...` shell line.
    pub fn to_shell_command(&self) -> String {
        let mut parts = Vec::with_capacity(self.args.len() + 2);
        parts.push("exec".to_string());
        parts.push(shell_quote(&self.program.to_string_lossy()));
        for a in &self.args {
            parts.push(shell_quote(a));
        }
        parts.join(" ")
    }
}

/// Target descriptors used by [`SandboxBackend::cleanup_process_tree`].
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct CleanupTarget {
    /// Tower's root directory (holds `.sandbox-marker` for macOS `sandbox_check`).
    pub tower_root: PathBuf,
    /// Directories writable by the sandbox whose processes must be stopped.
    pub probes: Vec<PathBuf>,
    /// Optional Linux cgroup v2 directory containing `cgroup.kill`.
    pub cgroup_path: Option<PathBuf>,
    /// Optional `systemd --user` scope unit name on Linux.
    pub systemd_unit: Option<String>,
    /// Optional container instance name/id for Apple Containerization.
    pub container_id: Option<String>,
}

/// Unified OS isolation contract implemented per platform/tier.
pub trait SandboxBackend: Send + Sync + std::fmt::Debug {
    fn kind(&self) -> SandboxKind;
    fn name(&self) -> &'static str;
    fn capabilities(&self) -> SandboxCapabilities;

    fn is_available(&self) -> bool {
        self.capabilities().available
    }

    /// Generates and atomically persists the sandbox profile/spec under `profile_dir`.
    fn prepare_profile(&self, spec: &Spec, profile_dir: &Path, purpose: &str) -> std::io::Result<PreparedProfile>;

    /// Wraps an argv command (e.g. `["/bin/sh", "-c", "..."]`) inside the sandbox.
    fn wrap_command(&self, spec: &Spec, profile: &PreparedProfile, argv: &[String]) -> std::io::Result<WrappedCommand>;

    /// Wraps Tower's persistent FS helper (`--fs-helper`) inside the same sandbox.
    fn wrap_fs_helper(
        &self,
        spec: &Spec,
        profile: &PreparedProfile,
        helper_bin: &Path,
    ) -> std::io::Result<WrappedCommand> {
        let argv = vec![helper_bin.display().to_string(), crate::fs_helper::CLI_FLAG.to_string()];
        self.wrap_command(spec, profile, &argv)
    }

    /// Atomically stops every process spawned in this sandbox.
    fn cleanup_process_tree(&self, target: &CleanupTarget) -> std::io::Result<usize>;

    /// Copy-on-write seeds `dst` from `src`. Returns `Ok(true)` if COW cloning
    /// succeeded, or `Ok(false)` when the caller should fall back to copy.
    fn seed_cache_cow(&self, src: &Path, dst: &Path) -> std::io::Result<bool>;
}

/// macOS Seatbelt backend wrapping `/usr/bin/sandbox-exec`, `sandbox_check`,
/// and APFS `clonefile`.
#[derive(Debug, Default, Clone, Copy)]
pub struct MacSeatbeltBackend;

impl MacSeatbeltBackend {
    pub const SANDBOX_EXEC: &'static str = "/usr/bin/sandbox-exec";

    pub fn new() -> Self {
        Self
    }
}

impl SandboxBackend for MacSeatbeltBackend {
    fn kind(&self) -> SandboxKind {
        SandboxKind::MacSeatbelt
    }

    fn name(&self) -> &'static str {
        "macOS Seatbelt (S2)"
    }

    fn capabilities(&self) -> SandboxCapabilities {
        let avail = available();
        let mut diagnostics = Vec::new();
        if cfg!(target_os = "macos") && !avail {
            diagnostics.push(SandboxDiagnostic {
                code: "seatbelt_missing".into(),
                blocking: false,
                summary_en: "/usr/bin/sandbox-exec was not found on this Mac.".into(),
                summary_zh: "在这台 Mac 上未找到 /usr/bin/sandbox-exec。".into(),
                fix: None,
            });
        }
        SandboxCapabilities {
            kind: SandboxKind::MacSeatbelt,
            label: self.name().into(),
            available: avail,
            read_allowlist: avail,
            write_only_drop_box: avail,
            append_only_transcript: avail,
            network_isolation: avail,
            loopback_port_isolation: avail,
            atomic_process_cleanup: avail,
            cow_cache_seeding: cfg!(target_os = "macos"),
            hypervisor_isolation: false,
            supports_native_host_toolchains: true,
            limitations: vec![
                "Seatbelt rules are fixed at process start; dynamic loopback listeners require profile refresh for new child commands.".into(),
                "Host kernel is shared (not hypervisor-isolated); enable MicroVM tier on macOS 26+ for untrusted Linux-stack builds.".into(),
            ],
            diagnostics,
        }
    }

    fn prepare_profile(&self, spec: &Spec, profile_dir: &Path, purpose: &str) -> std::io::Result<PreparedProfile> {
        std::fs::create_dir_all(profile_dir)?;
        let rendered = profile(spec);
        let path = profile_dir.join(format!("{purpose}.sb"));
        let part = profile_dir.join(format!(".{purpose}.sb.{}", uuid::Uuid::new_v4().simple()));
        std::fs::write(&part, &rendered)?;
        std::fs::rename(&part, &path)?;
        Ok(PreparedProfile { kind: self.kind(), profile_path: Some(path), rendered, extra_env: Vec::new() })
    }

    fn wrap_command(
        &self,
        _spec: &Spec,
        profile: &PreparedProfile,
        argv: &[String],
    ) -> std::io::Result<WrappedCommand> {
        if argv.is_empty() {
            return Err(std::io::Error::new(std::io::ErrorKind::InvalidInput, "empty command argv"));
        }
        let sb = profile.profile_path.as_ref().ok_or_else(|| {
            std::io::Error::new(std::io::ErrorKind::InvalidInput, "Seatbelt profile_path is required")
        })?;
        let mut args = Vec::with_capacity(argv.len() + 2);
        args.push("-f".to_string());
        args.push(sb.display().to_string());
        args.extend(argv.iter().cloned());
        Ok(WrappedCommand { program: PathBuf::from(Self::SANDBOX_EXEC), args, env: profile.extra_env.clone() })
    }

    fn cleanup_process_tree(&self, target: &CleanupTarget) -> std::io::Result<usize> {
        let id = crate::procs::Identity::new(&target.probes, &crate::procs::marker(&target.tower_root));
        Ok(id.stop_all())
    }

    fn seed_cache_cow(&self, src: &Path, dst: &Path) -> std::io::Result<bool> {
        Ok(crate::caches::clone_tree(src, dst))
    }
}

/// Returns the default OS sandbox backend for the current host platform.
pub fn default_backend() -> Box<dyn SandboxBackend> {
    if cfg!(target_os = "linux") {
        Box::new(LinuxSandboxBackend::detect())
    } else {
        Box::new(MacSeatbeltBackend::new())
    }
}

/// Selects a backend respecting the optional MicroVM high-risk tier request.
/// Falls back cleanly to [`default_backend`] when MicroVM is unavailable.
pub fn select_backend(prefer_microvm: bool) -> Box<dyn SandboxBackend> {
    if prefer_microvm {
        let container = AppleContainerBackend::detect();
        if container.is_available() {
            return Box::new(container);
        }
    }
    default_backend()
}

/// Reports capabilities of all supported sandbox backends on this machine.
pub fn all_capabilities() -> Vec<SandboxCapabilities> {
    vec![
        MacSeatbeltBackend::new().capabilities(),
        LinuxSandboxBackend::detect().capabilities(),
        AppleContainerBackend::detect().capabilities(),
    ]
}

/// Summarizes active sandbox posture, MicroVM availability, and warnings for UI/diagnostics.
pub fn posture_summary(_env: &[(String, String)]) -> SandboxPostureSummary {
    let active = default_backend();
    let active_caps = active.capabilities();
    let container_caps = AppleContainerBackend::detect().capabilities();
    let mut warnings = Vec::new();
    for d in &active_caps.diagnostics {
        warnings.push(d.summary_en.clone());
    }
    if !active_caps.available && warnings.is_empty() {
        warnings.push("No OS sandbox backend is active on this host; path fencing only.".into());
    }
    let kind = if active_caps.available { active.kind() } else { SandboxKind::None };
    let backend_name = if active_caps.available { active.name().to_string() } else { "None (path-only)".to_string() };
    SandboxPostureSummary {
        backend_name,
        kind,
        microvm_available: container_caps.available,
        warnings,
        capabilities: all_capabilities(),
    }
}

pub(super) fn shell_quote(s: &str) -> String {
    format!("'{}'", s.replace('\'', "'\\''"))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::sandbox::{COMMON_PROXY_PORTS, Loopback};

    fn sample_spec(root: &Path) -> Spec {
        Spec {
            workspace: root.join("ws"),
            tmp: root.join("tmp"),
            cache: root.join("cache"),
            home: root.join("home"),
            read: vec![],
            append: vec![],
            drop: None,
            network: false,
            loopback: Loopback::Only(vec![20_000]),
            proxy_ports: COMMON_PROXY_PORTS.to_vec(),
        }
    }

    #[test]
    fn mac_seatbelt_backend_prepares_profile_and_wraps_commands() {
        let tmp = tempfile::tempdir().unwrap();
        let root = crate::paths::real(tmp.path());
        let spec = sample_spec(&root);
        let backend = MacSeatbeltBackend::new();
        let prepared = backend.prepare_profile(&spec, &root.join("goal"), "agent").unwrap();
        assert_eq!(prepared.kind, SandboxKind::MacSeatbelt);
        let sb_path = prepared.profile_path.as_ref().unwrap();
        assert!(sb_path.is_file());
        assert!(prepared.rendered.contains("(deny file-link)"));
        assert!(prepared.rendered.contains("[Aa][Gg][Ee][Nn][Tt][Ss]"));

        let wrapped = backend.wrap_command(&spec, &prepared, &["/bin/echo".into(), "hi".into()]).unwrap();
        assert_eq!(wrapped.program, PathBuf::from("/usr/bin/sandbox-exec"));
        assert_eq!(wrapped.args[0], "-f");
        assert_eq!(wrapped.args[1], sb_path.display().to_string());
        assert_eq!(&wrapped.args[2..], &["/bin/echo", "hi"]);
        assert!(wrapped.to_shell_command().starts_with("exec '/usr/bin/sandbox-exec' '-f' "));

        let helper = backend.wrap_fs_helper(&spec, &prepared, Path::new("/opt/tower/tower")).unwrap();
        assert_eq!(helper.args.last().map(String::as_str), Some(crate::fs_helper::CLI_FLAG));
    }

    #[test]
    fn posture_summary_lists_all_backends() {
        let summary = posture_summary(&[]);
        assert_eq!(summary.capabilities.len(), 3);
        if cfg!(target_os = "macos") && available() {
            assert_eq!(summary.kind, SandboxKind::MacSeatbelt);
        }
    }
}
