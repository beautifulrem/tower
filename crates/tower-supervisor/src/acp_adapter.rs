//! Declarative multi-engine ACP adapter registry and lockfile-verified
//! installation (`docs/18-evolution-roadmap.md` P1.1).
//!
//! Supported engines carry an explicit [`EngineTrustLevel`]:
//! - `FullS2`: Pi (native RPC) and Claude Code (`tools: []` built-in lockout).
//! - `RestrictedS2`: Codex CLI, Gemini CLI, OpenCode — strict CLI/session
//!   confinement plus fail-closed `session/request_permission` denial of every
//!   non-`mcp__tower__*` tool.
//! - `Experimental`: custom or unrecognized ACP engine commands.
//!
//! Shipped npm adapters are installed once with `npm ci --ignore-scripts`
//! after verifying `package-lock.json` integrity hashes (never `npx` at run time).

use std::path::{Path, PathBuf};
use std::sync::Arc;

use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use tower_core::{Lang, tr};

use crate::paths::Paths;
use crate::{Inner, Result, invalid};

/// Security guarantee tier for a Tower coding engine (Engine Onboarding Trust Gate).
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum EngineTrustLevel {
    /// Built-in tools are verifiably disabled (`tools: []` or explicit 7-tool
    /// replacement); every file and shell action flows through Tower's S2 sandbox.
    FullS2,
    /// Built-in tools cannot yet be zeroed at startup; Tower applies strict CLI
    /// sandbox/approval flags and denies every non-`mcp__tower__*` permission request.
    RestrictedS2,
    /// Unverified or custom engine command; fail-closed permission gate only.
    Experimental,
}

impl EngineTrustLevel {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::FullS2 => "full_s2",
            Self::RestrictedS2 => "restricted_s2",
            Self::Experimental => "experimental",
        }
    }
}

/// Wire protocol Tower uses to drive an engine.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum EngineTransport {
    NativeRpc,
    Acp,
}

/// Declarative specification for one supported engine.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct EngineProfile {
    pub id: &'static str,
    pub label: &'static str,
    pub transport: EngineTransport,
    pub trust_level: EngineTrustLevel,
    /// True only when the engine's built-in file/shell tools are proven disabled.
    pub builtins_disabled: bool,
    /// Optional bundled npm adapter directory name under `extensions/tower-goal/`.
    pub adapter_dir: Option<&'static str>,
    /// Optional primary npm package pinned in that adapter's `package-lock.json`.
    pub adapter_package: Option<&'static str>,
    /// Relative JS entry point under `adapter_dir` once `npm ci` finishes.
    pub adapter_entry: Option<&'static str>,
    /// Executable names looked up on the user's login PATH.
    pub binary_candidates: &'static [&'static str],
    /// Default CLI flags appended when invoking a PATH binary directly.
    pub default_args: &'static [&'static str],
    /// Security-enforcing environment variables set when spawning the engine.
    pub env_overrides: &'static [(&'static str, &'static str)],
    pub trust_note_en: &'static str,
    pub trust_note_zh: &'static str,
}

impl EngineProfile {
    #[allow(dead_code)]
    pub fn trust_note(&self, lang: Lang) -> &'static str {
        lang.pick(self.trust_note_zh, self.trust_note_en)
    }
}

/// Declarative registry of built-in engines Tower knows how to drive.
pub const PROFILES: &[EngineProfile] = &[
    EngineProfile {
        id: "pi",
        label: "Pi",
        transport: EngineTransport::NativeRpc,
        trust_level: EngineTrustLevel::FullS2,
        builtins_disabled: true,
        adapter_dir: None,
        adapter_package: None,
        adapter_entry: None,
        binary_candidates: &["pi"],
        default_args: &[],
        env_overrides: &[("PI_OFFLINE", "1")],
        trust_note_en: "Native RPC with explicit 7-tool allowlist; all file and shell tools run inside Tower's S2 sandbox.",
        trust_note_zh: "原生 RPC 与显式 7 工具白名单；所有文件与 Shell 工具均在 Tower S2 沙箱内运行。",
    },
    EngineProfile {
        id: "claude-code",
        label: "Claude Code",
        transport: EngineTransport::Acp,
        trust_level: EngineTrustLevel::FullS2,
        builtins_disabled: true,
        adapter_dir: Some("acp-adapter"),
        adapter_package: Some("@agentclientprotocol/claude-agent-acp"),
        adapter_entry: Some("node_modules/@agentclientprotocol/claude-agent-acp/dist/index.js"),
        binary_candidates: &["claude-agent-acp"],
        default_args: &[],
        env_overrides: &[("ENABLE_CLAUDEAI_MCP_SERVERS", "false")],
        trust_note_en: "Built-in tools zeroed (tools: []); strict MCP config routes every action through Tower's S2 sandbox.",
        trust_note_zh: "已清零内置工具（tools: []）；严格 MCP 配置强制所有操作经由 Tower S2 沙箱。",
    },
    EngineProfile {
        id: "codex",
        label: "Codex CLI",
        transport: EngineTransport::Acp,
        trust_level: EngineTrustLevel::RestrictedS2,
        builtins_disabled: false,
        adapter_dir: Some("codex-acp-adapter"),
        adapter_package: Some("@agentclientprotocol/codex-acp"),
        adapter_entry: Some("node_modules/@agentclientprotocol/codex-acp/dist/index.js"),
        binary_candidates: &["codex-acp"],
        default_args: &["--sandbox", "read-only", "--ask-for-approval", "untrusted"],
        env_overrides: &[("CODEX_SANDBOX_NETWORK_DISABLED", "1")],
        trust_note_en: "Restricted S2: strict read-only sandbox flags and fail-closed permission denial of non-Tower tools; built-in read tools may remain engine-confined.",
        trust_note_zh: "受限 S2：启用严格只读沙箱参数并默认拒绝所有非 Tower 工具权限请求；部分内置只读工具受引擎自身约束。",
    },
    EngineProfile {
        id: "gemini-cli",
        label: "Gemini CLI",
        transport: EngineTransport::Acp,
        trust_level: EngineTrustLevel::RestrictedS2,
        builtins_disabled: false,
        adapter_dir: None,
        adapter_package: None,
        adapter_entry: None,
        binary_candidates: &["gemini"],
        default_args: &["--acp", "--approval-mode", "default", "--allowed-mcp-server-names", "tower"],
        env_overrides: &[("GEMINI_CLI_NO_EXTENSIONS", "1")],
        trust_note_en: "Restricted S2: extensions disabled, MCP restricted to Tower, and fail-closed permission denial of non-Tower tools.",
        trust_note_zh: "受限 S2：已禁用外部扩展、仅允许 Tower MCP 服务并默认拒绝所有非 Tower 工具权限请求。",
    },
    EngineProfile {
        id: "opencode",
        label: "OpenCode",
        transport: EngineTransport::Acp,
        trust_level: EngineTrustLevel::RestrictedS2,
        builtins_disabled: false,
        adapter_dir: None,
        adapter_package: None,
        adapter_entry: None,
        binary_candidates: &["opencode"],
        default_args: &["acp"],
        env_overrides: &[("OPENCODE_DISABLE_AUTOUPDATE", "1")],
        trust_note_en: "Restricted S2: wildcard built-in permissions denied in session config and fail-closed ACP permission gate.",
        trust_note_zh: "受限 S2：会话配置默认拒绝内置工具权限，并由 ACP 安全闸门拦截所有非 Tower 工具。",
    },
];

/// Returns all built-in declarative engine profiles.
#[allow(dead_code)]
pub fn profiles() -> &'static [EngineProfile] {
    PROFILES
}

/// Looks up a declarative engine profile by id (case-insensitive).
pub fn profile(engine_id: &str) -> Option<&'static EngineProfile> {
    let id = engine_id.trim();
    PROFILES.iter().find(|p| p.id.eq_ignore_ascii_case(id))
}

/// Returns the trust level for `engine_id` (`Experimental` for unknown engines).
pub fn trust_level(engine_id: &str) -> EngineTrustLevel {
    profile(engine_id).map_or(EngineTrustLevel::Experimental, |p| p.trust_level)
}

/// Whether `engine_id` runs behind Tower's generic ACP bridge (`acp.ts`).
pub fn is_acp(engine_id: &str) -> bool {
    let id = engine_id.trim();
    !id.is_empty() && !id.eq_ignore_ascii_case("pi")
}

/// The default Claude Code adapter directory under Tower's extension (kept for compatibility).
pub fn dir(paths: &Paths) -> PathBuf {
    paths.extension_dir().join("acp-adapter")
}

/// The default Claude Code adapter entry point once installed (kept for compatibility).
pub fn entry(paths: &Paths) -> PathBuf {
    dir(paths).join("node_modules/@agentclientprotocol/claude-agent-acp/dist/index.js")
}

/// The bundled adapter directory for `engine_id`, if that engine ships one.
pub fn dir_for(paths: &Paths, engine_id: &str) -> Option<PathBuf> {
    let p = profile(engine_id)?;
    p.adapter_dir.map(|d| paths.extension_dir().join(d))
}

/// The bundled adapter entry script for `engine_id`, if that engine ships one.
pub fn entry_for(paths: &Paths, engine_id: &str) -> Option<PathBuf> {
    let p = profile(engine_id)?;
    let d = dir_for(paths, engine_id)?;
    let primary = d.join(p.adapter_entry?);
    if primary.is_file() {
        return Some(primary);
    }
    // Codex ACP is distributed under both `@agentclientprotocol/codex-acp` and `@zed-industries/codex-acp`.
    if p.id == "codex" {
        let zed = d.join("node_modules/@zed-industries/codex-acp/dist/index.js");
        if zed.is_file() {
            return Some(zed);
        }
    }
    Some(primary)
}

/// Result of verifying an adapter's `package-lock.json` before running `npm ci`.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct LockfileCheck {
    pub lockfile_sha256: String,
    pub package_count: usize,
    pub verified_package: String,
}

/// Verifies `package-lock.json` in `adapter_dir` before installation:
/// - Must be valid JSON with `lockfileVersion >= 2`.
/// - Every non-root entry in `packages` must carry a valid SRI `integrity` hash
///   (`sha512-`, `sha384-`, or `sha256-`) and must not use `link: true` or `file:` paths.
/// - `expected_package` (or `@zed-industries/codex-acp` for Codex) must be pinned.
pub fn verify_lockfile(adapter_dir: &Path, expected_package: &str) -> std::result::Result<LockfileCheck, String> {
    let lock_path = adapter_dir.join("package-lock.json");
    let raw = std::fs::read(&lock_path).map_err(|e| format!("could not read {}: {e}", lock_path.display()))?;
    let lockfile_sha256 = format!("{:x}", Sha256::digest(&raw));
    let doc: serde_json::Value = serde_json::from_slice(&raw).map_err(|e| format!("invalid package-lock.json: {e}"))?;
    let version = doc.get("lockfileVersion").and_then(serde_json::Value::as_u64).unwrap_or(0);
    if version < 2 {
        return Err(format!("lockfileVersion {version} is too old; require >= 2"));
    }
    let packages = doc
        .get("packages")
        .and_then(serde_json::Value::as_object)
        .ok_or_else(|| "package-lock.json is missing `packages` map".to_string())?;

    let mut count = 0usize;
    let mut verified_package = None;
    let expected_key = format!("node_modules/{expected_package}");
    let alt_key = (expected_package == "@agentclientprotocol/codex-acp")
        .then(|| "node_modules/@zed-industries/codex-acp".to_string());

    for (key, entry) in packages {
        if key.is_empty() {
            continue;
        }
        count += 1;
        if entry.get("link").and_then(serde_json::Value::as_bool) == Some(true) {
            return Err(format!("lockfile entry `{key}` uses disallowed symlink `link: true`"));
        }
        if let Some(resolved) = entry.get("resolved").and_then(serde_json::Value::as_str)
            && (resolved.starts_with("file:") || resolved.starts_with("git+"))
        {
            return Err(format!("lockfile entry `{key}` uses unpinned resolved source `{resolved}`"));
        }
        let integrity = entry.get("integrity").and_then(serde_json::Value::as_str).unwrap_or_default();
        let valid_sri =
            integrity.starts_with("sha512-") || integrity.starts_with("sha384-") || integrity.starts_with("sha256-");
        if !valid_sri {
            return Err(format!("lockfile entry `{key}` is missing a valid SRI integrity hash"));
        }
        if key == &expected_key || alt_key.as_deref() == Some(key.as_str()) {
            verified_package = Some(key.trim_start_matches("node_modules/").to_string());
        }
    }

    let verified_package = verified_package
        .ok_or_else(|| format!("expected adapter package `{expected_package}` is not pinned in package-lock.json"))?;
    Ok(LockfileCheck { lockfile_sha256, package_count: count, verified_package })
}

fn shell_quote(s: &str) -> String {
    format!("'{}'", s.replace('\'', "'\\''"))
}

/// Resolves the shell command line (`TOWER_ACP_AGENT`) to launch an ACP engine.
pub fn resolve_acp_command(inner: &Inner, engine_id: &str) -> Option<String> {
    let id = engine_id.trim();
    if id.eq_ignore_ascii_case("claude-code") {
        return Some(inner.claude_acp_command());
    }
    // Optional explicit per-engine env override (e.g. `TOWER_ACP_COMMAND_CODEX`).
    let env_key = format!("TOWER_ACP_COMMAND_{}", id.to_ascii_uppercase().replace('-', "_"));
    if let Some(cmd) = inner.env.get(&env_key).map(str::trim).filter(|s| !s.is_empty()) {
        return Some(cmd.to_string());
    }
    let prof = profile(id)?;
    for bin in prof.binary_candidates {
        if let Some(found) = inner.env.which(bin) {
            let mut parts = vec![shell_quote(&found.display().to_string())];
            parts.extend(prof.default_args.iter().map(|a| shell_quote(a)));
            return Some(parts.join(" "));
        }
    }
    if let Some(entry_path) = entry_for(&inner.paths, id).filter(|p| p.is_file()) {
        let node = inner.env.which("node").map_or_else(|| "node".to_string(), |n| n.display().to_string());
        let mut parts = vec![shell_quote(&node), shell_quote(&entry_path.display().to_string())];
        parts.extend(prof.default_args.iter().map(|a| shell_quote(a)));
        return Some(parts.join(" "));
    }
    None
}

/// Runtime availability snapshot for one engine (aligns with `EngineDescriptor`).
#[allow(dead_code)]
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct EngineStatus {
    pub id: String,
    pub label: String,
    pub trust_tier: EngineTrustLevel,
    pub installed: bool,
    pub available: bool,
    pub note: String,
}

/// Inspects all built-in engines against the local environment and bundled lockfiles.
#[allow(dead_code)]
pub fn inspect_engines(inner: &Inner, lang: Lang) -> Vec<EngineStatus> {
    let has_node = inner.env.which("node").is_some();
    let has_npm = inner.env.which("npm").is_some();
    let bridge_ready = inner.paths.extension_dir().join("acp.ts").is_file() && has_node;

    PROFILES
        .iter()
        .map(|p| {
            let (installed, available) = match p.transport {
                EngineTransport::NativeRpc => {
                    let ok = inner.pi_program().is_some();
                    (ok, ok)
                }
                EngineTransport::Acp => {
                    let has_override = p.id == "claude-code" && !inner.settings().claude_acp_command.trim().is_empty();
                    let has_bin = p.binary_candidates.iter().any(|b| inner.env.which(b).is_some());
                    let has_entry = entry_for(&inner.paths, p.id).is_some_and(|e| e.is_file());
                    let can_install =
                        dir_for(&inner.paths, p.id).is_some_and(|d| d.join("package-lock.json").is_file()) && has_npm;
                    let inst = has_override || has_bin || has_entry;
                    (inst, bridge_ready && (inst || can_install))
                }
            };
            EngineStatus {
                id: p.id.into(),
                label: p.label.into(),
                trust_tier: p.trust_level,
                installed,
                available,
                note: p.trust_note(lang).into(),
            }
        })
        .collect()
}

static INSTALLING: tokio::sync::Mutex<()> = tokio::sync::Mutex::const_new(());

/// Installs Claude Code's adapter unless a configured or installed one exists.
#[allow(dead_code)]
pub async fn ensure(inner: &Arc<Inner>) -> Result<()> {
    ensure_for(inner, "claude-code").await
}

/// Lockfile-verified installation for any ACP engine that ships a bundled npm adapter.
pub async fn ensure_for(inner: &Arc<Inner>, engine_id: &str) -> Result<()> {
    let Some(prof) = profile(engine_id) else {
        return Ok(());
    };
    if prof.transport != EngineTransport::Acp {
        return Ok(());
    }
    let settings = inner.settings();
    if prof.id == "claude-code" && !settings.claude_acp_command.trim().is_empty() {
        return Ok(());
    }
    if prof.binary_candidates.iter().any(|b| inner.env.which(b).is_some()) {
        return Ok(());
    }
    let (Some(adapter_dir), Some(expected_pkg)) = (dir_for(&inner.paths, prof.id), prof.adapter_package) else {
        return Ok(());
    };
    if !adapter_dir.join("package-lock.json").is_file() {
        return Ok(());
    }
    let _guard = INSTALLING.lock().await;
    if entry_for(&inner.paths, prof.id).is_some_and(|e| e.is_file()) {
        return Ok(());
    }
    let lang = inner.lang();
    let label = prof.label;
    let check = verify_lockfile(&adapter_dir, expected_pkg).map_err(|reason| {
        invalid(tr!(
            lang,
            "{label} 适配器锁文件校验失败：{reason}",
            "Lockfile integrity check failed for {label} adapter: {reason}"
        ))
    })?;
    tracing::info!(
        engine = prof.id,
        package = %check.verified_package,
        packages = check.package_count,
        sha256 = %check.lockfile_sha256,
        "verified ACP adapter lockfile before npm ci"
    );
    let npm = inner.env.which("npm").ok_or_else(|| {
        invalid(tr!(
            lang,
            "{label} 引擎需要 Node.js（npm）来安装它的适配器",
            "The {label} engine needs Node.js (npm) to install its adapter"
        ))
    })?;
    let out = tokio::process::Command::new(npm)
        .args(["ci", "--ignore-scripts", "--no-audit", "--no-fund", "--loglevel=error"])
        .current_dir(&adapter_dir)
        .env_clear()
        .envs(inner.env.pairs())
        .output()
        .await?;
    if !out.status.success() || !entry_for(&inner.paths, prof.id).is_some_and(|e| e.is_file()) {
        let err = String::from_utf8_lossy(&out.stderr);
        let tail: String =
            err.lines().rev().take(6).collect::<Vec<_>>().into_iter().rev().collect::<Vec<_>>().join("\n");
        return Err(invalid(tr!(
            lang,
            "安装 {label} 适配器失败：\n{tail}",
            "Could not install {label}'s adapter:\n{tail}"
        )));
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn registry_covers_all_five_engines_with_expected_trust_tiers() {
        assert_eq!(profiles().len(), 5);
        assert_eq!(trust_level("pi"), EngineTrustLevel::FullS2);
        assert_eq!(trust_level("claude-code"), EngineTrustLevel::FullS2);
        assert_eq!(trust_level("codex"), EngineTrustLevel::RestrictedS2);
        assert_eq!(trust_level("gemini-cli"), EngineTrustLevel::RestrictedS2);
        assert_eq!(trust_level("opencode"), EngineTrustLevel::RestrictedS2);
        assert_eq!(trust_level("custom-xyz"), EngineTrustLevel::Experimental);

        assert!(!is_acp("pi"));
        assert!(is_acp("claude-code"));
        assert!(is_acp("codex"));
        assert!(is_acp("gemini-cli"));
        assert!(is_acp("opencode"));
    }

    #[test]
    fn bundled_claude_adapter_lockfile_passes_sri_verification() {
        let bundled = Path::new(env!("CARGO_MANIFEST_DIR")).join("../../extensions/tower-goal/acp-adapter");
        let check = verify_lockfile(&bundled, "@agentclientprotocol/claude-agent-acp").expect("bundled lockfile valid");
        assert_eq!(check.verified_package, "@agentclientprotocol/claude-agent-acp");
        assert!(check.package_count >= 1);
        assert_eq!(check.lockfile_sha256.len(), 64);
    }

    #[test]
    fn lockfile_verification_rejects_missing_integrity_or_symlink_entries() {
        let tmp = tempfile::tempdir().unwrap();
        let bad_missing = serde_json::json!({
            "lockfileVersion": 3,
            "packages": {
                "": { "name": "test" },
                "node_modules/@agentclientprotocol/codex-acp": {
                    "version": "1.0.0",
                    "resolved": "https://registry.npmjs.org/x.tgz"
                }
            }
        });
        std::fs::write(tmp.path().join("package-lock.json"), bad_missing.to_string()).unwrap();
        let err = verify_lockfile(tmp.path(), "@agentclientprotocol/codex-acp").unwrap_err();
        assert!(err.contains("SRI integrity"), "{err}");

        let bad_file = serde_json::json!({
            "lockfileVersion": 3,
            "packages": {
                "": { "name": "test" },
                "node_modules/@agentclientprotocol/codex-acp": {
                    "version": "1.0.0",
                    "resolved": "file:../evil",
                    "integrity": "sha512-abc"
                }
            }
        });
        std::fs::write(tmp.path().join("package-lock.json"), bad_file.to_string()).unwrap();
        let err = verify_lockfile(tmp.path(), "@agentclientprotocol/codex-acp").unwrap_err();
        assert!(err.contains("unpinned resolved"), "{err}");

        let good_zed = serde_json::json!({
            "lockfileVersion": 3,
            "packages": {
                "": { "name": "test" },
                "node_modules/@zed-industries/codex-acp": {
                    "version": "0.1.0",
                    "resolved": "https://registry.npmjs.org/@zed-industries/codex-acp/-/codex-acp-0.1.0.tgz",
                    "integrity": "sha512-deadbeef=="
                }
            }
        });
        std::fs::write(tmp.path().join("package-lock.json"), good_zed.to_string()).unwrap();
        let ok = verify_lockfile(tmp.path(), "@agentclientprotocol/codex-acp").unwrap();
        assert_eq!(ok.verified_package, "@zed-industries/codex-acp");
    }
}
