//! Apple Containerization MicroVM backend (`apple/containerization`, `container` CLI)
//! for optional high-risk Linux-OCI execution on Apple Silicon + macOS 26+ (`docs/18` §18.5 P2.1).
//!
//! Each goal invocation runs in a dedicated lightweight Linux MicroVM backed by
//! `Virtualization.framework` with `virtiofs` workspace mounts and `vmnet`
//! isolation. Clearly reports host eligibility and toolchain limitations:
//! Linux OCI containers cannot compile or run macOS-native Xcode/Swift/AppKit
//! binaries, so this tier complements macOS Seatbelt rather than replacing it.

use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};

use super::Spec;
use super::backend::{
    CleanupTarget, PreparedProfile, SandboxBackend, SandboxCapabilities, SandboxDiagnostic, SandboxKind, WrappedCommand,
};

/// Minimum macOS major version required by Apple's Containerization framework.
pub const MIN_MACOS_MAJOR: u32 = 26;

/// Host probe for Apple Silicon + macOS 26+ + `container` CLI.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct AppleContainerProbe {
    pub is_macos: bool,
    pub is_apple_silicon: bool,
    pub macos_version: Option<(u32, u32)>,
    pub container_cli: Option<PathBuf>,
    pub container_version: Option<String>,
}

impl AppleContainerProbe {
    pub fn detect() -> Self {
        if !cfg!(target_os = "macos") {
            return Self {
                is_macos: false,
                is_apple_silicon: false,
                macos_version: None,
                container_cli: None,
                container_version: None,
            };
        }
        let is_apple_silicon = cfg!(target_arch = "aarch64");
        let macos_version = std::process::Command::new("/usr/bin/sw_vers")
            .arg("-productVersion")
            .output()
            .ok()
            .filter(|o| o.status.success())
            .and_then(|o| parse_macos_version(&String::from_utf8_lossy(&o.stdout)));
        let container_cli = find_container_cli();
        let container_version = container_cli.as_ref().and_then(|bin| {
            std::process::Command::new(bin)
                .arg("--version")
                .output()
                .ok()
                .filter(|o| o.status.success())
                .map(|o| String::from_utf8_lossy(&o.stdout).trim().to_string())
                .filter(|s| !s.is_empty())
        });
        Self { is_macos: true, is_apple_silicon, macos_version, container_cli, container_version }
    }

    pub fn is_supported(&self) -> bool {
        self.is_macos
            && self.is_apple_silicon
            && self.macos_version.is_some_and(|(maj, _)| maj >= MIN_MACOS_MAJOR)
            && self.container_cli.is_some()
    }
}

/// Parses `sw_vers -productVersion` output (e.g. `"26.0.1"` -> `Some((26, 0))`).
pub fn parse_macos_version(raw: &str) -> Option<(u32, u32)> {
    let mut parts = raw.trim().split('.');
    let major = parts.next()?.parse::<u32>().ok()?;
    let minor = parts.next().and_then(|s| s.parse::<u32>().ok()).unwrap_or(0);
    Some((major, minor))
}

fn find_container_cli() -> Option<PathBuf> {
    for fixed in ["/usr/local/bin/container", "/opt/homebrew/bin/container", "/usr/bin/container"] {
        let p = PathBuf::from(fixed);
        if p.is_file() {
            return Some(p);
        }
    }
    let path_var = std::env::var_os("PATH")?;
    for dir in std::env::split_paths(&path_var) {
        let candidate = dir.join("container");
        if candidate.is_file() {
            return Some(candidate);
        }
    }
    None
}

/// Resource & image settings for the Apple Containerization MicroVM tier.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct AppleContainerConfig {
    /// Linux OCI base image (e.g. `node:22-bookworm-slim` or `ubuntu:24.04`).
    pub image: String,
    pub cpus: u32,
    pub memory_mib: u32,
    /// Use `vmnet` isolated networking when the contract enables network access.
    pub vmnet_network: String,
}

impl Default for AppleContainerConfig {
    fn default() -> Self {
        Self { image: "ubuntu:24.04".into(), cpus: 4, memory_mib: 4096, vmnet_network: "default".into() }
    }
}

/// Serialized invocation specification for one MicroVM container run.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct ContainerRunSpec {
    pub container_cli: PathBuf,
    pub container_name: String,
    pub image: String,
    pub cpus: u32,
    pub memory_mib: u32,
    pub virtiofs_mounts: Vec<(PathBuf, String)>,
    pub network_mode: String,
    pub workdir: String,
}

/// Apple Containerization MicroVM backend (`apple/containerization`).
#[derive(Debug, Clone)]
pub struct AppleContainerBackend {
    probe: AppleContainerProbe,
    config: AppleContainerConfig,
}

impl AppleContainerBackend {
    pub fn detect() -> Self {
        Self { probe: AppleContainerProbe::detect(), config: AppleContainerConfig::default() }
    }

    pub fn with_probe(probe: AppleContainerProbe, config: AppleContainerConfig) -> Self {
        Self { probe, config }
    }

    pub fn probe(&self) -> &AppleContainerProbe {
        &self.probe
    }

    pub fn config(&self) -> &AppleContainerConfig {
        &self.config
    }

    /// Builds the `virtiofs` + `vmnet` MicroVM run spec for `spec`.
    /// Host `$HOME` and credential directories are never mounted.
    pub fn build_run_spec(&self, spec: &Spec, purpose: &str) -> ContainerRunSpec {
        let cli = self.probe.container_cli.clone().unwrap_or_else(|| PathBuf::from("/usr/local/bin/container"));
        let safe_purpose: String =
            purpose.chars().map(|c| if c.is_ascii_alphanumeric() || c == '-' { c } else { '-' }).collect();
        let container_name = format!("tower-vm-{safe_purpose}-{}", &uuid::Uuid::new_v4().simple().to_string()[..8]);
        let mut mounts = vec![
            (spec.workspace.clone(), "/workspace".to_string()),
            (spec.tmp.clone(), "/tmp".to_string()),
            (spec.cache.clone(), "/var/cache/tower".to_string()),
        ];
        if let Some(drop_dir) = &spec.drop {
            mounts.push((drop_dir.clone(), "/run/tower-drop".to_string()));
        }
        let network_mode = if spec.network { self.config.vmnet_network.clone() } else { "none".to_string() };
        ContainerRunSpec {
            container_cli: cli,
            container_name,
            image: self.config.image.clone(),
            cpus: self.config.cpus,
            memory_mib: self.config.memory_mib,
            virtiofs_mounts: mounts,
            network_mode,
            workdir: "/workspace".into(),
        }
    }
}

impl SandboxBackend for AppleContainerBackend {
    fn kind(&self) -> SandboxKind {
        SandboxKind::AppleContainerMicroVm
    }

    fn name(&self) -> &'static str {
        "Apple Containerization MicroVM (Linux OCI)"
    }

    fn capabilities(&self) -> SandboxCapabilities {
        let mut diagnostics = Vec::new();
        if self.probe.is_macos {
            if !self.probe.is_apple_silicon {
                diagnostics.push(SandboxDiagnostic {
                    code: "microvm_requires_apple_silicon".into(),
                    blocking: false,
                    summary_en: "Apple Containerization MicroVM requires Apple Silicon (arm64).".into(),
                    summary_zh: "Apple Containerization MicroVM 需要 Apple Silicon（arm64）芯片。".into(),
                    fix: None,
                });
            } else if self.probe.macos_version.is_none_or(|(maj, _)| maj < MIN_MACOS_MAJOR) {
                let ver = self.probe.macos_version.map(|(a, b)| format!("{a}.{b}")).unwrap_or_else(|| "unknown".into());
                diagnostics.push(SandboxDiagnostic {
                    code: "microvm_requires_macos_26".into(),
                    blocking: false,
                    summary_en: format!(
                        "Apple Containerization MicroVM requires macOS {MIN_MACOS_MAJOR}+ (detected macOS {ver})."
                    ),
                    summary_zh: format!(
                        "Apple Containerization MicroVM 需要 macOS {MIN_MACOS_MAJOR}+（当前为 macOS {ver}）。"
                    ),
                    fix: None,
                });
            } else if self.probe.container_cli.is_none() {
                diagnostics.push(SandboxDiagnostic {
                    code: "microvm_cli_missing".into(),
                    blocking: false,
                    summary_en: "Apple `container` CLI (apple/containerization) is not installed.".into(),
                    summary_zh: "未安装 Apple `container` CLI（apple/containerization）。".into(),
                    fix: Some("brew install --cask container".into()),
                });
            } else {
                diagnostics.push(SandboxDiagnostic {
                    code: "microvm_local_network_permission".into(),
                    blocking: false,
                    summary_en: "When using vmnet networking, ensure Tower has macOS 'Local Network' privacy permission in System Settings > Privacy & Security > Local Network.".into(),
                    summary_zh: "启用 vmnet 网络时，请确认已在「系统设置 → 隐私与安全性 → 本地网络」中授予 Tower 权限。".into(),
                    fix: None,
                });
            }
        }
        let available = self.probe.is_supported();
        SandboxCapabilities {
            kind: self.kind(),
            label: self.name().into(),
            available,
            read_allowlist: available,
            write_only_drop_box: available,
            append_only_transcript: available,
            network_isolation: available,
            loopback_port_isolation: available,
            atomic_process_cleanup: available,
            cow_cache_seeding: cfg!(target_os = "macos"),
            hypervisor_isolation: available,
            // Linux OCI microVMs cannot execute macOS-native Xcode/Swift/AppKit toolchains.
            supports_native_host_toolchains: false,
            limitations: vec![
                "Executes Linux OCI images only — cannot compile or test macOS-native Swift/Xcode/AppKit binaries."
                    .into(),
                format!("Requires Apple Silicon + macOS {MIN_MACOS_MAJOR}+ + Apple `container` CLI."),
                "Requires macOS Local Network privacy permission when vmnet networking is enabled.".into(),
            ],
            diagnostics,
        }
    }

    fn prepare_profile(&self, spec: &Spec, profile_dir: &Path, purpose: &str) -> std::io::Result<PreparedProfile> {
        std::fs::create_dir_all(profile_dir)?;
        let run_spec = self.build_run_spec(spec, purpose);
        let rendered = serde_json::to_string_pretty(&run_spec).map_err(std::io::Error::other)?;
        let path = profile_dir.join(format!("{purpose}.container.json"));
        let part = profile_dir.join(format!(".{purpose}.container.json.{}", uuid::Uuid::new_v4().simple()));
        std::fs::write(&part, &rendered)?;
        std::fs::rename(&part, &path)?;
        Ok(PreparedProfile {
            kind: self.kind(),
            profile_path: Some(path),
            rendered,
            extra_env: vec![("TOWER_CONTAINER_NAME".into(), run_spec.container_name)],
        })
    }

    fn wrap_command(&self, spec: &Spec, profile: &PreparedProfile, argv: &[String]) -> std::io::Result<WrappedCommand> {
        if argv.is_empty() {
            return Err(std::io::Error::new(std::io::ErrorKind::InvalidInput, "empty command argv"));
        }
        let run_spec: ContainerRunSpec =
            serde_json::from_str(&profile.rendered).unwrap_or_else(|_| self.build_run_spec(spec, "cmd"));
        let mut args = vec![
            "run".to_string(),
            "--rm".to_string(),
            "--name".to_string(),
            run_spec.container_name,
            "--cpus".to_string(),
            run_spec.cpus.to_string(),
            "--memory".to_string(),
            format!("{}M", run_spec.memory_mib),
            "--network".to_string(),
            run_spec.network_mode,
            "--workdir".to_string(),
            run_spec.workdir,
        ];
        for (host, guest) in &run_spec.virtiofs_mounts {
            args.push("--mount".to_string());
            args.push(format!("type=virtiofs,source={},target={guest}", host.display()));
        }
        args.push(run_spec.image);
        args.extend(argv.iter().cloned());
        Ok(WrappedCommand { program: run_spec.container_cli, args, env: profile.extra_env.clone() })
    }

    fn cleanup_process_tree(&self, target: &CleanupTarget) -> std::io::Result<usize> {
        let (Some(cli), Some(id)) = (&self.probe.container_cli, &target.container_id) else {
            return Ok(0);
        };
        let stopped = std::process::Command::new(cli)
            .args(["stop", "--time", "1", id])
            .stdout(std::process::Stdio::null())
            .stderr(std::process::Stdio::null())
            .status()
            .is_ok_and(|s| s.success());
        let _ = std::process::Command::new(cli)
            .args(["rm", "-f", id])
            .stdout(std::process::Stdio::null())
            .stderr(std::process::Stdio::null())
            .status();
        Ok(usize::from(stopped))
    }

    fn seed_cache_cow(&self, src: &Path, dst: &Path) -> std::io::Result<bool> {
        Ok(crate::caches::clone_tree(src, dst))
    }
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
            loopback: Loopback::Only(vec![]),
            proxy_ports: COMMON_PROXY_PORTS.to_vec(),
        }
    }

    #[test]
    fn eligibility_requires_apple_silicon_macos_26_and_cli() {
        assert_eq!(parse_macos_version("26.1.2\n"), Some((26, 1)));
        assert_eq!(parse_macos_version("15.4"), Some((15, 4)));

        let old_macos = AppleContainerProbe {
            is_macos: true,
            is_apple_silicon: true,
            macos_version: Some((15, 6)),
            container_cli: Some(PathBuf::from("/usr/local/bin/container")),
            container_version: Some("0.3.0".into()),
        };
        let b_old = AppleContainerBackend::with_probe(old_macos, AppleContainerConfig::default());
        assert!(!b_old.is_available());
        assert!(b_old.capabilities().diagnostics.iter().any(|d| d.code == "microvm_requires_macos_26"));

        let intel = AppleContainerProbe {
            is_macos: true,
            is_apple_silicon: false,
            macos_version: Some((26, 0)),
            container_cli: Some(PathBuf::from("/usr/local/bin/container")),
            container_version: Some("0.3.0".into()),
        };
        assert!(!AppleContainerBackend::with_probe(intel, AppleContainerConfig::default()).is_available());

        let ready = AppleContainerProbe {
            is_macos: true,
            is_apple_silicon: true,
            macos_version: Some((26, 0)),
            container_cli: Some(PathBuf::from("/usr/local/bin/container")),
            container_version: Some("0.3.0".into()),
        };
        let b_ready = AppleContainerBackend::with_probe(ready, AppleContainerConfig::default());
        let caps = b_ready.capabilities();
        assert!(caps.available);
        assert!(caps.hypervisor_isolation);
        assert!(!caps.supports_native_host_toolchains, "Linux OCI microVMs cannot run macOS-native toolchains");
        assert!(caps.diagnostics.iter().any(|d| d.code == "microvm_local_network_permission"));
    }

    #[test]
    fn container_invocation_uses_virtiofs_and_offline_vmnet_by_default() {
        let tmp = tempfile::tempdir().unwrap();
        let root = crate::paths::real(tmp.path());
        let probe = AppleContainerProbe {
            is_macos: true,
            is_apple_silicon: true,
            macos_version: Some((26, 1)),
            container_cli: Some(PathBuf::from("/usr/local/bin/container")),
            container_version: Some("0.4.0".into()),
        };
        let backend = AppleContainerBackend::with_probe(probe, AppleContainerConfig::default());
        let spec = sample_spec(&root);
        let prepared = backend.prepare_profile(&spec, &root.join("goal"), "agent").unwrap();
        let wrapped =
            backend.wrap_command(&spec, &prepared, &["/bin/sh".into(), "-c".into(), "npm test".into()]).unwrap();
        assert_eq!(wrapped.program, PathBuf::from("/usr/local/bin/container"));
        assert!(wrapped.args.windows(2).any(|w| w == ["--network", "none"]));
        assert!(
            wrapped.args.iter().any(|a| a.starts_with("type=virtiofs,source=") && a.ends_with(",target=/workspace"))
        );
        assert!(!wrapped.args.iter().any(|a| a.contains(&root.join("home").display().to_string())));

        let mut online = spec;
        online.network = true;
        let prep_on = backend.prepare_profile(&online, &root.join("goal2"), "setup").unwrap();
        let wrap_on = backend.wrap_command(&online, &prep_on, &["npm".into(), "ci".into()]).unwrap();
        assert!(wrap_on.args.windows(2).any(|w| w == ["--network", "default"]));
    }
}
