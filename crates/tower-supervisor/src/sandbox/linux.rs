//! Linux sandbox backend: `bwrap --unshare-all` + Landlock ABI v3+ + cgroups v2
//! `cgroup.kill` + Btrfs/XFS reflink cache seeding (`docs/18` §18.5 P2.1).
//!
//! Pure Rust profile/invocation generation and environment diagnostics so every
//! rule generator and Ubuntu 24.04+ AppArmor userns check is unit-tested on
//! macOS CI without requiring a Linux kernel.

use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};

use super::backend::{
    CleanupTarget, PreparedProfile, SandboxBackend, SandboxCapabilities, SandboxDiagnostic, SandboxKind, WrappedCommand,
};
use super::{Loopback, SECRETS, Spec};

/// Standard read-only system locations bound into the `bwrap` namespace.
const LINUX_RO_BINDS: &[&str] = &[
    "/usr",
    "/bin",
    "/sbin",
    "/lib",
    "/lib64",
    "/etc/alternatives",
    "/etc/ca-certificates",
    "/etc/ssl",
    "/etc/ld.so.cache",
    "/etc/ld.so.conf",
    "/etc/ld.so.conf.d",
    "/etc/nsswitch.conf",
    "/etc/passwd",
    "/etc/group",
    "/etc/localtime",
    "/etc/hosts",
    "/etc/resolv.conf",
];

/// Host Linux kernel / userland probe results (injectable for cross-OS tests).
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct LinuxEnvProbe {
    pub is_linux: bool,
    pub bwrap_path: Option<PathBuf>,
    pub systemd_run_path: Option<PathBuf>,
    /// Detected Landlock ABI version (0 if unsupported; ABI >= 3 adds `TRUNCATE`).
    pub landlock_abi: u32,
    /// True when `/sys/fs/cgroup/cgroup.controllers` exists.
    pub cgroups_v2: bool,
    /// True when Ubuntu 24.04+ `kernel.apparmor_restrict_unprivileged_userns = 1`.
    pub apparmor_restrict_unprivileged_userns: bool,
    /// True when `kernel.unprivileged_userns_clone = 0` explicitly disables userns.
    pub unprivileged_userns_disabled: bool,
    /// Whether `bwrap` has an explicit AppArmor profile allowing userns despite the sysctl.
    pub bwrap_apparmor_profile_present: bool,
    /// Kernel major.minor parsed from `/proc/sys/kernel/osrelease` when available.
    pub kernel_version: Option<(u32, u32)>,
}

impl LinuxEnvProbe {
    /// Probes the current host (returns a clean non-Linux report on macOS/Windows).
    pub fn detect() -> Self {
        if !cfg!(target_os = "linux") {
            return Self {
                is_linux: false,
                bwrap_path: None,
                systemd_run_path: None,
                landlock_abi: 0,
                cgroups_v2: false,
                apparmor_restrict_unprivileged_userns: false,
                unprivileged_userns_disabled: false,
                bwrap_apparmor_profile_present: false,
                kernel_version: None,
            };
        }
        let bwrap_path = find_on_path("bwrap");
        let systemd_run_path = find_on_path("systemd-run");
        let apparmor_restrict_unprivileged_userns =
            std::fs::read_to_string("/proc/sys/kernel/apparmor_restrict_unprivileged_userns")
                .map(|s| parse_apparmor_userns_sysctl(&s))
                .unwrap_or(false);
        let unprivileged_userns_disabled = std::fs::read_to_string("/proc/sys/kernel/unprivileged_userns_clone")
            .map(|s| s.trim() == "0")
            .unwrap_or(false);
        let bwrap_apparmor_profile_present =
            Path::new("/etc/apparmor.d/bwrap").is_file() || Path::new("/etc/apparmor.d/tower-bwrap").is_file();
        let cgroups_v2 = Path::new("/sys/fs/cgroup/cgroup.controllers").is_file();
        let kernel_version =
            std::fs::read_to_string("/proc/sys/kernel/osrelease").ok().and_then(|s| parse_kernel_major_minor(&s));
        let lsm = std::fs::read_to_string("/sys/kernel/security/lsm").unwrap_or_default();
        let landlock_abi = infer_landlock_abi(&lsm, kernel_version);
        Self {
            is_linux: true,
            bwrap_path,
            systemd_run_path,
            landlock_abi,
            cgroups_v2,
            apparmor_restrict_unprivileged_userns,
            unprivileged_userns_disabled,
            bwrap_apparmor_profile_present,
            kernel_version,
        }
    }

    /// True when `bwrap` can create unprivileged user namespaces on this Linux host.
    pub fn userns_usable(&self) -> bool {
        if !self.is_linux || self.unprivileged_userns_disabled {
            return false;
        }
        !self.apparmor_restrict_unprivileged_userns || self.bwrap_apparmor_profile_present
    }
}

/// Parses `/proc/sys/kernel/apparmor_restrict_unprivileged_userns` content.
pub fn parse_apparmor_userns_sysctl(raw: &str) -> bool {
    raw.trim() == "1"
}

/// Parses Linux kernel `major.minor` from `/proc/sys/kernel/osrelease`.
pub fn parse_kernel_major_minor(raw: &str) -> Option<(u32, u32)> {
    let mut parts = raw.trim().split('.');
    let major = parts.next()?.parse::<u32>().ok()?;
    let minor_str: String = parts.next()?.chars().take_while(char::is_ascii_digit).collect();
    let minor = minor_str.parse::<u32>().ok()?;
    Some((major, minor))
}

/// Infers Landlock ABI support from `/sys/kernel/security/lsm` and kernel version.
/// Linux 5.13 -> ABI 1, 5.19 -> ABI 2 (`REFER`), 6.2+ -> ABI 3 (`TRUNCATE`), 6.7+ -> ABI 4.
pub fn infer_landlock_abi(lsm_list: &str, kernel: Option<(u32, u32)>) -> u32 {
    if !lsm_list.split(',').any(|m| m.trim() == "landlock") {
        return 0;
    }
    match kernel {
        Some(v) if v >= (6, 7) => 4,
        Some(v) if v >= (6, 2) => 3,
        Some(v) if v >= (5, 19) => 2,
        Some(v) if v >= (5, 13) => 1,
        _ => 1,
    }
}

/// Detects the Ubuntu 24.04+ AppArmor unprivileged userns restriction that blocks
/// rootless `bwrap` unless an AppArmor profile is installed or the sysctl is relaxed.
pub fn detect_ubuntu_apparmor_restriction(probe: &LinuxEnvProbe) -> Option<SandboxDiagnostic> {
    if !probe.is_linux || !probe.apparmor_restrict_unprivileged_userns || probe.bwrap_apparmor_profile_present {
        return None;
    }
    Some(SandboxDiagnostic {
        code: "ubuntu_apparmor_userns_restricted".into(),
        blocking: false,
        summary_en: "Ubuntu 24.04+ AppArmor restricts unprivileged user namespaces (kernel.apparmor_restrict_unprivileged_userns = 1), blocking rootless bwrap sandboxing. Install Tower's AppArmor profile for bwrap or allow userns.".into(),
        summary_zh: "Ubuntu 24.04+ 的 AppArmor 限制了非特权用户命名空间（kernel.apparmor_restrict_unprivileged_userns = 1），导致无 root 的 bwrap 沙箱无法启动。请安装 bwrap 的 AppArmor 配置或放开该内核参数。".into(),
        fix: Some("sudo tee /etc/apparmor.d/bwrap <<'EOF'\nabi <abi/4.0>,\ninclude <tunables/global>\nprofile bwrap /usr/bin/bwrap flags=(unconfined) {\n  userns,\n}\nEOF\nsudo systemctl reload apparmor".into()),
    })
}

/// Landlock filesystem access flags matching Linux `<linux/landlock.h>` ABI v1–v3.
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Serialize, Deserialize)]
pub struct LandlockAccessFs(pub u64);

impl LandlockAccessFs {
    pub const EXECUTE: u64 = 1 << 0;
    pub const WRITE_FILE: u64 = 1 << 1;
    pub const READ_FILE: u64 = 1 << 2;
    pub const READ_DIR: u64 = 1 << 3;
    pub const REMOVE_DIR: u64 = 1 << 4;
    pub const REMOVE_FILE: u64 = 1 << 5;
    pub const MAKE_CHAR: u64 = 1 << 6;
    pub const MAKE_DIR: u64 = 1 << 7;
    pub const MAKE_REG: u64 = 1 << 8;
    pub const MAKE_SOCK: u64 = 1 << 9;
    pub const MAKE_FIFO: u64 = 1 << 10;
    pub const MAKE_BLOCK: u64 = 1 << 11;
    pub const MAKE_SYM: u64 = 1 << 12;
    /// ABI v2: cross-directory link/rename (omitted to block hard-link escapes).
    pub const REFER: u64 = 1 << 13;
    /// ABI v3: `truncate(2)` / `O_TRUNC` (stripped on append-only transcripts).
    pub const TRUNCATE: u64 = 1 << 14;

    pub const ABI_V3_ALL: Self = Self(
        Self::EXECUTE
            | Self::WRITE_FILE
            | Self::READ_FILE
            | Self::READ_DIR
            | Self::REMOVE_DIR
            | Self::REMOVE_FILE
            | Self::MAKE_CHAR
            | Self::MAKE_DIR
            | Self::MAKE_REG
            | Self::MAKE_SOCK
            | Self::MAKE_FIFO
            | Self::MAKE_BLOCK
            | Self::MAKE_SYM
            | Self::REFER
            | Self::TRUNCATE,
    );

    pub const READ_ONLY: Self = Self(Self::READ_FILE | Self::READ_DIR | Self::EXECUTE);

    /// Read-write workspace access (omits `REFER` to prevent cross-directory hard links).
    pub const READ_WRITE_NO_LINK: Self = Self(
        Self::EXECUTE
            | Self::WRITE_FILE
            | Self::READ_FILE
            | Self::READ_DIR
            | Self::REMOVE_DIR
            | Self::REMOVE_FILE
            | Self::MAKE_DIR
            | Self::MAKE_REG
            | Self::MAKE_SOCK
            | Self::MAKE_FIFO
            | Self::MAKE_SYM
            | Self::TRUNCATE,
    );

    /// Write-only drop box: create & write files, NEVER read, list, or delete.
    pub const WRITE_ONLY_DROP_BOX: Self = Self(Self::WRITE_FILE | Self::MAKE_REG);

    /// Append-only transcript: write data only, NEVER truncate, remove, or read.
    pub const APPEND_ONLY_TRANSCRIPT: Self = Self(Self::WRITE_FILE);

    pub fn contains(self, flag: u64) -> bool {
        (self.0 & flag) == flag
    }

    pub fn bits(self) -> u64 {
        self.0
    }
}

/// One path-beneath rule in a [`LandlockRuleset`].
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct LandlockRule {
    pub path: PathBuf,
    pub access: LandlockAccessFs,
    pub role: String,
}

/// Declarative Landlock ABI v3+ ruleset derived from a [`Spec`].
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct LandlockRuleset {
    pub min_abi: u32,
    pub handled_access_fs: LandlockAccessFs,
    pub rules: Vec<LandlockRule>,
    /// Workspace-relative protected instruction paths denied writes by overlay/helper.
    pub protected_write_globs: Vec<String>,
}

impl LandlockRuleset {
    pub fn from_spec(spec: &Spec) -> Self {
        let mut rules = Vec::new();
        for sys in LINUX_RO_BINDS {
            rules.push(LandlockRule {
                path: PathBuf::from(sys),
                access: LandlockAccessFs::READ_ONLY,
                role: "system_ro".into(),
            });
        }
        for r in &spec.read {
            if !is_secret_path(r, &spec.home) {
                rules.push(LandlockRule {
                    path: r.clone(),
                    access: LandlockAccessFs::READ_ONLY,
                    role: "extra_ro".into(),
                });
            }
        }
        for (p, role) in [(&spec.workspace, "workspace"), (&spec.tmp, "tmp"), (&spec.cache, "cache")] {
            rules.push(LandlockRule {
                path: p.clone(),
                access: LandlockAccessFs::READ_WRITE_NO_LINK,
                role: role.into(),
            });
        }
        // Write-only drop box: WRITE_FILE | MAKE_REG only (no READ_FILE / READ_DIR / REMOVE_FILE).
        if let Some(drop_dir) = &spec.drop {
            rules.push(LandlockRule {
                path: drop_dir.clone(),
                access: LandlockAccessFs::WRITE_ONLY_DROP_BOX,
                role: "drop_box".into(),
            });
        }
        // Append-only transcripts: WRITE_FILE only (no TRUNCATE / REMOVE_FILE / READ_FILE / REFER).
        for append_file in &spec.append {
            rules.push(LandlockRule {
                path: append_file.clone(),
                access: LandlockAccessFs::APPEND_ONLY_TRANSCRIPT,
                role: "append_only".into(),
            });
        }
        Self {
            min_abi: 3,
            handled_access_fs: LandlockAccessFs::ABI_V3_ALL,
            rules,
            protected_write_globs: super::PROTECTED_INSTRUCTION_DESC.iter().map(|s| (*s).to_string()).collect(),
        }
    }
}

/// Controlled Unix-to-TCP / `slirp4netns` loopback port bridge spec when `--unshare-net` is active.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct PortBridgeSpec {
    pub unshare_net: bool,
    /// Loopback ports allowed to bridge into the isolated network namespace (proxies stripped).
    pub forwarded_ports: Vec<u16>,
    /// Explicitly blocked loopback proxy ports.
    pub blocked_proxy_ports: Vec<u16>,
    /// Unix socket directory inside the goal tmp dir used by the bridge.
    pub bridge_socket_dir: PathBuf,
}

impl PortBridgeSpec {
    pub fn from_spec(spec: &Spec) -> Self {
        let mut forwarded = if spec.network {
            Vec::new()
        } else {
            match &spec.loopback {
                Loopback::Only(ports) => ports.iter().copied().filter(|p| !spec.proxy_ports.contains(p)).collect(),
                Loopback::AllBut(_) => Vec::new(),
            }
        };
        forwarded.sort_unstable();
        forwarded.dedup();
        Self {
            unshare_net: !spec.network,
            forwarded_ports: forwarded,
            blocked_proxy_ports: spec.proxy_ports.clone(),
            bridge_socket_dir: spec.tmp.join("net-bridge"),
        }
    }
}

/// cgroups v2 process-tree containment & cleanup spec.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct CgroupSpec {
    pub use_systemd_scope: bool,
    pub scope_unit: String,
    pub fallback_pidns_kill: bool,
}

impl CgroupSpec {
    pub fn for_purpose(probe: &LinuxEnvProbe, purpose: &str) -> Self {
        let sanitized: String =
            purpose.chars().map(|c| if c.is_ascii_alphanumeric() || c == '-' { c } else { '-' }).collect();
        let unit = format!("tower-sb-{sanitized}-{}.scope", &uuid::Uuid::new_v4().simple().to_string()[..8]);
        Self {
            use_systemd_scope: probe.cgroups_v2 && probe.systemd_run_path.is_some(),
            scope_unit: unit,
            fallback_pidns_kill: true,
        }
    }

    /// Prefixes a `bwrap` command with `systemd-run --user --scope` when cgroups v2 is active.
    pub fn wrap(&self, systemd_run: Option<&Path>, inner: WrappedCommand) -> WrappedCommand {
        let Some(sr) = systemd_run.filter(|_| self.use_systemd_scope) else {
            return inner;
        };
        let mut args = vec![
            "--user".to_string(),
            "--scope".to_string(),
            "--quiet".to_string(),
            "--collect".to_string(),
            format!("--unit={}", self.scope_unit),
            "--".to_string(),
            inner.program.display().to_string(),
        ];
        args.extend(inner.args);
        WrappedCommand { program: sr.to_path_buf(), args, env: inner.env }
    }
}

/// Full serialized Linux sandbox specification written alongside a goal run.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct BwrapSpec {
    pub bwrap_bin: PathBuf,
    pub isolated_home: PathBuf,
    pub args: Vec<String>,
    pub landlock: LandlockRuleset,
    pub port_bridge: PortBridgeSpec,
    pub cgroup: CgroupSpec,
}

impl BwrapSpec {
    pub fn from_spec(spec: &Spec, probe: &LinuxEnvProbe, purpose: &str) -> Self {
        let bwrap_bin = probe.bwrap_path.clone().unwrap_or_else(|| PathBuf::from("/usr/bin/bwrap"));
        let isolated_home = spec.tmp.join("home");
        let mut args = vec!["--unshare-all".to_string(), "--die-with-parent".to_string(), "--new-session".to_string()];
        if spec.network {
            args.push("--share-net".to_string());
        }
        args.extend(["--proc".into(), "/proc".into(), "--dev".into(), "/dev".into(), "--tmpfs".into(), "/tmp".into()]);
        for sys in LINUX_RO_BINDS {
            let flag = if matches!(*sys, "/usr" | "/bin") { "--ro-bind" } else { "--ro-bind-try" };
            args.extend([flag.into(), (*sys).into(), (*sys).into()]);
        }
        // Isolated synthetic $HOME so host ~/.ssh, ~/.aws, ~/.pi/agent/auth.json are never mounted.
        args.extend([
            "--tmpfs".into(),
            spec.home.display().to_string(),
            "--bind".into(),
            isolated_home.display().to_string(),
            isolated_home.display().to_string(),
            "--setenv".into(),
            "HOME".into(),
            isolated_home.display().to_string(),
        ]);
        for ro in &spec.read {
            if !is_secret_path(ro, &spec.home) {
                args.extend(["--ro-bind-try".into(), ro.display().to_string(), ro.display().to_string()]);
            }
        }
        for rw in [&spec.workspace, &spec.tmp, &spec.cache] {
            args.extend(["--bind".into(), rw.display().to_string(), rw.display().to_string()]);
        }
        // Protect git config/hooks and existing prompt instruction files with ro-bind overlays.
        let git = spec.workspace.join(".git");
        for protected in [git.join("config"), git.join("hooks"), git.join("tower-empty-hooks")] {
            args.extend(["--ro-bind-try".into(), protected.display().to_string(), protected.display().to_string()]);
        }
        for instr in ["AGENTS.md", "CLAUDE.md", ".pi", ".agents"] {
            let p = spec.workspace.join(instr);
            args.extend(["--ro-bind-try".into(), p.display().to_string(), p.display().to_string()]);
        }
        if let Some(drop_dir) = &spec.drop {
            args.extend(["--bind".into(), drop_dir.display().to_string(), drop_dir.display().to_string()]);
        }
        for append_file in &spec.append {
            args.extend(["--bind".into(), append_file.display().to_string(), append_file.display().to_string()]);
        }
        args.extend(["--chdir".into(), spec.workspace.display().to_string()]);
        Self {
            bwrap_bin,
            isolated_home,
            args,
            landlock: LandlockRuleset::from_spec(spec),
            port_bridge: PortBridgeSpec::from_spec(spec),
            cgroup: CgroupSpec::for_purpose(probe, purpose),
        }
    }
}

/// Linux `bwrap` + Landlock ABI v3+ + cgroups v2 backend.
#[derive(Debug, Clone)]
pub struct LinuxSandboxBackend {
    probe: LinuxEnvProbe,
}

impl LinuxSandboxBackend {
    pub fn detect() -> Self {
        Self { probe: LinuxEnvProbe::detect() }
    }

    pub fn with_probe(probe: LinuxEnvProbe) -> Self {
        Self { probe }
    }

    pub fn probe(&self) -> &LinuxEnvProbe {
        &self.probe
    }

    /// Generates the full Linux sandbox spec (`bwrap` + Landlock + port bridge + cgroup).
    pub fn build_spec(&self, spec: &Spec, purpose: &str) -> BwrapSpec {
        BwrapSpec::from_spec(spec, &self.probe, purpose)
    }

    /// Atomically kills a cgroup v2 scope by writing `"1"` to `<cgroup_path>/cgroup.kill`.
    pub fn kill_cgroup_v2(cgroup_path: &Path) -> std::io::Result<bool> {
        let kill_file = cgroup_path.join("cgroup.kill");
        if !kill_file.exists() {
            return Ok(false);
        }
        std::fs::write(&kill_file, b"1\n")?;
        Ok(true)
    }
}

impl SandboxBackend for LinuxSandboxBackend {
    fn kind(&self) -> SandboxKind {
        SandboxKind::LinuxBwrapLandlock
    }

    fn name(&self) -> &'static str {
        "Linux bwrap + Landlock v3 + cgroups v2"
    }

    fn capabilities(&self) -> SandboxCapabilities {
        let mut diagnostics = Vec::new();
        if let Some(diag) = detect_ubuntu_apparmor_restriction(&self.probe) {
            diagnostics.push(diag);
        }
        if self.probe.is_linux && self.probe.bwrap_path.is_none() {
            diagnostics.push(SandboxDiagnostic {
                code: "bwrap_missing".into(),
                blocking: false,
                summary_en: "bubblewrap (bwrap) was not found on PATH.".into(),
                summary_zh: "在 PATH 中未找到 bubblewrap (bwrap)。".into(),
                fix: Some("sudo apt install bubblewrap".into()),
            });
        }
        if self.probe.is_linux && self.probe.unprivileged_userns_disabled {
            diagnostics.push(SandboxDiagnostic {
                code: "userns_clone_disabled".into(),
                blocking: false,
                summary_en: "kernel.unprivileged_userns_clone is 0; rootless bwrap cannot start.".into(),
                summary_zh: "kernel.unprivileged_userns_clone 为 0，无 root 的 bwrap 无法启动。".into(),
                fix: Some("sudo sysctl -w kernel.unprivileged_userns_clone=1".into()),
            });
        }
        if self.probe.is_linux && self.probe.landlock_abi < 3 {
            diagnostics.push(SandboxDiagnostic {
                code: "landlock_abi_old".into(),
                blocking: false,
                summary_en: format!(
                    "Landlock ABI v{} detected (v3+ on Linux 6.2+ required for rootless append-only TRUNCATE blocking).",
                    self.probe.landlock_abi
                ),
                summary_zh: format!(
                    "检测到 Landlock ABI v{}（需要 Linux 6.2+ 的 v3+ 以无 root 禁止截断只追加日志）。",
                    self.probe.landlock_abi
                ),
                fix: None,
            });
        }
        let available = self.probe.is_linux && self.probe.bwrap_path.is_some() && self.probe.userns_usable();
        let landlock_v3 = available && self.probe.landlock_abi >= 3;
        SandboxCapabilities {
            kind: self.kind(),
            label: self.name().into(),
            available,
            read_allowlist: available,
            write_only_drop_box: landlock_v3,
            append_only_transcript: landlock_v3,
            network_isolation: available,
            loopback_port_isolation: available,
            // cgroups v2 `cgroup.kill` when available, else pidns `--unshare-pid` + `--die-with-parent`.
            atomic_process_cleanup: available,
            cow_cache_seeding: self.probe.is_linux,
            hypervisor_isolation: false,
            supports_native_host_toolchains: self.probe.is_linux,
            limitations: vec![
                "Requires unprivileged user namespaces (Ubuntu 24.04+ requires an AppArmor profile for bwrap).".into(),
                "Write-only drop box and rootless append-only transcript enforcement require Linux 6.2+ (Landlock ABI v3+).".into(),
            ],
            diagnostics,
        }
    }

    fn prepare_profile(&self, spec: &Spec, profile_dir: &Path, purpose: &str) -> std::io::Result<PreparedProfile> {
        std::fs::create_dir_all(profile_dir)?;
        let bwrap = self.build_spec(spec, purpose);
        let rendered = serde_json::to_string_pretty(&bwrap).map_err(std::io::Error::other)?;
        let path = profile_dir.join(format!("{purpose}.linux-sandbox.json"));
        let part = profile_dir.join(format!(".{purpose}.linux-sandbox.json.{}", uuid::Uuid::new_v4().simple()));
        std::fs::write(&part, &rendered)?;
        std::fs::rename(&part, &path)?;
        Ok(PreparedProfile {
            kind: self.kind(),
            profile_path: Some(path.clone()),
            rendered,
            extra_env: vec![
                ("TOWER_LINUX_SANDBOX_SPEC".into(), path.display().to_string()),
                ("TOWER_LANDLOCK_MIN_ABI".into(), bwrap.landlock.min_abi.to_string()),
            ],
        })
    }

    fn wrap_command(&self, spec: &Spec, profile: &PreparedProfile, argv: &[String]) -> std::io::Result<WrappedCommand> {
        if argv.is_empty() {
            return Err(std::io::Error::new(std::io::ErrorKind::InvalidInput, "empty command argv"));
        }
        let bwrap: BwrapSpec = serde_json::from_str(&profile.rendered).unwrap_or_else(|_| self.build_spec(spec, "cmd"));
        let mut args = bwrap.args.clone();
        args.push("--".to_string());
        args.extend(argv.iter().cloned());
        let inner = WrappedCommand { program: bwrap.bwrap_bin, args, env: profile.extra_env.clone() };
        Ok(bwrap.cgroup.wrap(self.probe.systemd_run_path.as_deref(), inner))
    }

    fn cleanup_process_tree(&self, target: &CleanupTarget) -> std::io::Result<usize> {
        if let Some(cg) = &target.cgroup_path
            && Self::kill_cgroup_v2(cg)?
        {
            return Ok(1);
        }
        if let Some(unit) = &target.systemd_unit
            && let Some(systemctl) = find_on_path("systemctl")
        {
            let ok = std::process::Command::new(systemctl)
                .args(["--user", "kill", "--signal=SIGKILL", unit])
                .status()
                .is_ok_and(|s| s.success());
            if ok {
                return Ok(1);
            }
        }
        // Fallback: stop by open files inside sandbox probe dirs (pidns dies with parent).
        crate::procs::stop_by_open_files(&target.probes);
        Ok(0)
    }

    fn seed_cache_cow(&self, src: &Path, dst: &Path) -> std::io::Result<bool> {
        if !self.probe.is_linux {
            return Ok(false);
        }
        let ok = std::process::Command::new("cp")
            .args(["--reflink=always", "-a"])
            .arg(src)
            .arg(dst)
            .stdout(std::process::Stdio::null())
            .stderr(std::process::Stdio::null())
            .status()
            .is_ok_and(|s| s.success());
        Ok(ok)
    }
}

fn is_secret_path(path: &Path, home: &Path) -> bool {
    SECRETS.iter().any(|s| path.starts_with(home.join(s)))
}

fn find_on_path(bin: &str) -> Option<PathBuf> {
    let path_var = std::env::var_os("PATH")?;
    for dir in std::env::split_paths(&path_var) {
        let candidate = dir.join(bin);
        if candidate.is_file() {
            return Some(candidate);
        }
    }
    None
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::sandbox::COMMON_PROXY_PORTS;

    fn linux_probe_full() -> LinuxEnvProbe {
        LinuxEnvProbe {
            is_linux: true,
            bwrap_path: Some(PathBuf::from("/usr/bin/bwrap")),
            systemd_run_path: Some(PathBuf::from("/usr/bin/systemd-run")),
            landlock_abi: 4,
            cgroups_v2: true,
            apparmor_restrict_unprivileged_userns: false,
            unprivileged_userns_disabled: false,
            bwrap_apparmor_profile_present: false,
            kernel_version: Some((6, 8)),
        }
    }

    fn sample_spec(root: &Path) -> Spec {
        Spec {
            workspace: root.join("ws"),
            tmp: root.join("tmp"),
            cache: root.join("cache"),
            home: root.join("home"),
            read: vec![root.join("toolchains/node"), root.join("home/.ssh")],
            append: vec![root.join("guard/pin.log")],
            drop: Some(root.join("proof-drop")),
            network: false,
            loopback: Loopback::Only(vec![20_000, 7890]),
            proxy_ports: COMMON_PROXY_PORTS.to_vec(),
        }
    }

    #[test]
    fn ubuntu_24_04_apparmor_userns_restriction_is_detected() {
        assert!(parse_apparmor_userns_sysctl("1\n"));
        assert!(!parse_apparmor_userns_sysctl("0\n"));
        assert_eq!(parse_kernel_major_minor("6.8.0-45-generic"), Some((6, 8)));
        assert_eq!(infer_landlock_abi("lockdown,yama,apparmor,landlock", Some((6, 8))), 4);
        assert_eq!(infer_landlock_abi("landlock", Some((6, 2))), 3);
        assert_eq!(infer_landlock_abi("apparmor", Some((6, 8))), 0);

        let mut probe = linux_probe_full();
        probe.apparmor_restrict_unprivileged_userns = true;
        let diag = detect_ubuntu_apparmor_restriction(&probe).expect("must report Ubuntu 24.04 AppArmor block");
        assert_eq!(diag.code, "ubuntu_apparmor_userns_restricted");
        assert!(diag.fix.as_deref().unwrap().contains("/etc/apparmor.d/bwrap"));

        let backend = LinuxSandboxBackend::with_probe(probe.clone());
        assert!(!backend.is_available(), "restricted userns without profile makes bwrap unavailable");

        probe.bwrap_apparmor_profile_present = true;
        assert!(detect_ubuntu_apparmor_restriction(&probe).is_none());
        let backend_ok = LinuxSandboxBackend::with_probe(probe);
        assert!(backend_ok.is_available());
    }

    #[test]
    fn bwrap_spec_isolates_home_network_and_filters_secrets_and_proxies() {
        let root = Path::new("/srv/tower");
        let spec = sample_spec(root);
        let backend = LinuxSandboxBackend::with_probe(linux_probe_full());
        let bwrap = backend.build_spec(&spec, "agent");

        assert!(bwrap.args.contains(&"--unshare-all".to_string()));
        assert!(!bwrap.args.contains(&"--share-net".to_string()), "offline mode keeps network unshared");
        assert!(bwrap.args.contains(&"--tmpfs".to_string()));
        assert!(!bwrap.args.iter().any(|a| a.contains(".ssh")), "secrets must never be bound");
        assert!(bwrap.args.iter().any(|a| a.contains("toolchains/node")));
        assert!(bwrap.port_bridge.unshare_net);
        assert_eq!(bwrap.port_bridge.forwarded_ports, vec![20_000], "proxy port 7890 must be stripped");

        let mut online = spec.clone();
        online.network = true;
        let bwrap_online = backend.build_spec(&online, "setup");
        assert!(bwrap_online.args.contains(&"--share-net".to_string()));
        assert!(!bwrap_online.port_bridge.unshare_net);
    }

    #[test]
    fn landlock_v3_ruleset_enforces_drop_box_and_append_only_semantics() {
        let root = Path::new("/srv/tower");
        let spec = sample_spec(root);
        let ruleset = LandlockRuleset::from_spec(&spec);
        assert_eq!(ruleset.min_abi, 3);
        assert!(ruleset.handled_access_fs.contains(LandlockAccessFs::TRUNCATE));
        assert!(ruleset.handled_access_fs.contains(LandlockAccessFs::REFER));

        let drop_rule = ruleset.rules.iter().find(|r| r.role == "drop_box").unwrap();
        assert!(drop_rule.access.contains(LandlockAccessFs::WRITE_FILE));
        assert!(drop_rule.access.contains(LandlockAccessFs::MAKE_REG));
        assert!(!drop_rule.access.contains(LandlockAccessFs::READ_FILE), "drop box must not allow read");
        assert!(!drop_rule.access.contains(LandlockAccessFs::READ_DIR), "drop box must not allow readdir");
        assert!(!drop_rule.access.contains(LandlockAccessFs::REMOVE_FILE), "drop box must not allow remove");

        let append_rule = ruleset.rules.iter().find(|r| r.role == "append_only").unwrap();
        assert!(append_rule.access.contains(LandlockAccessFs::WRITE_FILE));
        assert!(!append_rule.access.contains(LandlockAccessFs::TRUNCATE), "append-only must strip TRUNCATE");
        assert!(!append_rule.access.contains(LandlockAccessFs::REMOVE_FILE), "append-only must strip REMOVE_FILE");
        assert!(!append_rule.access.contains(LandlockAccessFs::READ_FILE));

        let ws_rule = ruleset.rules.iter().find(|r| r.role == "workspace").unwrap();
        assert!(!ws_rule.access.contains(LandlockAccessFs::REFER), "workspace strips REFER to block link escapes");
    }

    #[test]
    fn systemd_cgroup_wrapper_and_cgroup_kill_work_deterministically() {
        let tmp = tempfile::tempdir().unwrap();
        let root = crate::paths::real(tmp.path());
        let spec = sample_spec(&root);
        let backend = LinuxSandboxBackend::with_probe(linux_probe_full());
        let prepared = backend.prepare_profile(&spec, &root.join("goal"), "verify").unwrap();
        let wrapped = backend.wrap_command(&spec, &prepared, &["/bin/sh".into(), "-c".into(), "true".into()]).unwrap();
        assert_eq!(wrapped.program, PathBuf::from("/usr/bin/systemd-run"));
        assert!(wrapped.args.contains(&"--scope".to_string()));
        assert!(wrapped.args.contains(&"/usr/bin/bwrap".to_string()));

        // Without systemd-run, falls back directly to bwrap (pidns cleanup).
        let mut no_systemd = linux_probe_full();
        no_systemd.systemd_run_path = None;
        let fallback_backend = LinuxSandboxBackend::with_probe(no_systemd);
        let prepared2 = fallback_backend.prepare_profile(&spec, &root.join("goal2"), "verify").unwrap();
        let wrapped2 = fallback_backend.wrap_command(&spec, &prepared2, &["/bin/true".into()]).unwrap();
        assert_eq!(wrapped2.program, PathBuf::from("/usr/bin/bwrap"));

        // Simulated cgroup v2 `cgroup.kill` file write.
        let cg_dir = root.join("fake-cgroup");
        std::fs::create_dir_all(&cg_dir).unwrap();
        std::fs::write(cg_dir.join("cgroup.kill"), b"0\n").unwrap();
        assert!(LinuxSandboxBackend::kill_cgroup_v2(&cg_dir).unwrap());
        assert_eq!(std::fs::read_to_string(cg_dir.join("cgroup.kill")).unwrap(), "1\n");
    }
}
