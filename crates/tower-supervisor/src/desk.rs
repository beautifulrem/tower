//! What the desk opens outside Tower: the editor, a terminal, Finder, and
//! the diagnostics archive for a bug report.

use std::path::{Path, PathBuf};

use tower_core::view::{EngineDescriptor, EngineTrustTier, GoalDiskUsage, SandboxPosture, StorageInventory};
use tower_core::{LifecycleState, tr};

use crate::api::OpenTarget;
use crate::{Result, Supervisor, invalid, look, paths, sandbox};

impl Supervisor {
    /// Writes a diagnostics archive for a bug report: versions, the
    /// environment check, settings (without the phone pairing token),
    /// goals, open items and the recent trace of unfinished goals, with
    /// secrets redacted. Returns the archive's path (in the data folder).
    pub fn export_diagnostics(&self) -> Result<PathBuf> {
        let inner = &self.inner;
        let stamp = tower_store::system_now();
        let dir = inner.paths.root.join("diagnostics").join(format!("tower-diagnostics-{stamp}"));
        std::fs::create_dir_all(&dir)?;
        let write = |name: &str, v: &serde_json::Value| -> Result<()> {
            let text = tower_verify::redact(&serde_json::to_string_pretty(v).unwrap_or_default());
            std::fs::write(dir.join(name), text)?;
            Ok(())
        };
        let os = std::process::Command::new("/usr/bin/sw_vers")
            .output()
            .map(|o| String::from_utf8_lossy(&o.stdout).into_owned())
            .unwrap_or_default();
        write(
            "about.json",
            &serde_json::json!({ "tower": env!("CARGO_PKG_VERSION"), "macos": os, "sandbox": sandbox::available() }),
        )?;
        write("environment.json", &serde_json::to_value(self.environment()).unwrap_or_default())?;
        let mut settings = inner.settings();
        settings.remote_token = String::new();
        write("settings.json", &serde_json::to_value(settings).unwrap_or_default())?;
        let goals = inner.store(|s| s.summaries())?;
        write("goals.json", &serde_json::to_value(&goals).unwrap_or_default())?;
        write("inbox.json", &serde_json::to_value(inner.store(|s| s.open_inbox_items())?).unwrap_or_default())?;
        for g in goals.iter().filter(|g| !g.state.is_terminal()) {
            let trace = inner.store(|s| s.trace(&g.id, None, 300))?;
            write(&format!("trace-{}.json", g.id), &serde_json::to_value(trace).unwrap_or_default())?;
        }
        let zip = dir.with_extension("zip");
        let ok = std::process::Command::new("/usr/bin/ditto")
            .args(["-c", "-k", "--keepParent"])
            .arg(&dir)
            .arg(&zip)
            .status()
            .is_ok_and(|s| s.success());
        let _ = std::fs::remove_dir_all(&dir);
        if !ok {
            return Err(invalid(tr!(self.inner.lang(), "无法打包诊断信息", "Could not package the diagnostics")));
        }
        Ok(zip)
    }

    /// A screenshot taken for a `look` criterion, as a data URL.
    pub fn look_image(&self, file: &str) -> Option<String> {
        look::data_url(&self.inner.paths.root.join("evidence"), file)
    }

    /// Undoes the latest rollback.
    /// Opens a goal's workspace in the user's editor, a terminal, or Finder.
    /// Editing while the goal is paused is the "I'll fix it" path: the next resume
    /// tells the agent which files the human changed.
    pub fn open_workspace(&self, id: &str, target: OpenTarget) -> Result<()> {
        let rec = self.inner.store(|s| s.goal(id))?;
        let ws = rec.workspace.ok_or_else(|| self.no_workspace())?;
        let (program, args): (PathBuf, Vec<String>) = match target {
            OpenTarget::Finder => (PathBuf::from("/usr/bin/open"), vec![ws.clone()]),
            OpenTarget::Terminal => (PathBuf::from("/usr/bin/open"), vec!["-a".into(), "Terminal".into(), ws.clone()]),
            OpenTarget::Editor => {
                let configured = self.inner.settings().editor;
                let candidates: Vec<String> = if configured.trim().is_empty() {
                    ["cursor", "code", "zed", "subl"].iter().map(|s| s.to_string()).collect()
                } else {
                    vec![configured.trim().to_string()]
                };
                match candidates.iter().find_map(|c| self.inner.env.which(c)) {
                    Some(p) => (p, vec![ws.clone()]),
                    None => (PathBuf::from("/usr/bin/open"), vec!["-t".into(), ws.clone()]),
                }
            }
        };
        std::process::Command::new(program)
            .args(args)
            .env_clear()
            .envs(self.inner.env.pairs())
            .stdin(std::process::Stdio::null())
            .stdout(std::process::Stdio::null())
            .stderr(std::process::Stdio::null())
            .spawn()?;
        Ok(())
    }

    /// Opens one file of a goal's workspace in the editor, at a line when the
    /// editor supports it (`code`/`cursor -g file:line`, `zed file:line`).
    pub fn open_file(&self, id: &str, path: &str, line: Option<u32>) -> Result<()> {
        let rec = self.inner.store(|s| s.goal(id))?;
        let ws = PathBuf::from(rec.workspace.ok_or_else(|| self.no_workspace())?);
        let file = ws.join(path);
        if !paths::real(&file).starts_with(paths::real(&ws)) {
            return Err(invalid(tr!(self.inner.lang(), "路径不在工作区内", "The path is outside the workspace")));
        }
        let configured = self.inner.settings().editor;
        let candidates: Vec<String> = if configured.trim().is_empty() {
            ["cursor", "code", "zed", "subl"].iter().map(|s| s.to_string()).collect()
        } else {
            vec![configured.trim().to_string()]
        };
        let target = match line {
            Some(l) => format!("{}:{l}", file.display()),
            None => file.display().to_string(),
        };
        let (program, args): (PathBuf, Vec<String>) = match candidates.iter().find_map(|c| self.inner.env.which(c)) {
            Some(p) => {
                let name = p.file_name().map(|n| n.to_string_lossy().into_owned()).unwrap_or_default();
                if matches!(name.as_str(), "code" | "cursor" | "codium") {
                    (p, vec![ws.display().to_string(), "-g".into(), target])
                } else {
                    (p, vec![target])
                }
            }
            None => (PathBuf::from("/usr/bin/open"), vec!["-t".into(), file.display().to_string()]),
        };
        std::process::Command::new(program)
            .args(args)
            .env_clear()
            .envs(self.inner.env.pairs())
            .stdin(std::process::Stdio::null())
            .stdout(std::process::Stdio::null())
            .stderr(std::process::Stdio::null())
            .spawn()?;
        Ok(())
    }

    /// Computes per-goal disk usage across satellite clones, verification
    /// checkouts, temporary folders, and private caches without blocking the reactor.
    pub async fn storage_inventory(&self) -> Result<StorageInventory> {
        let summaries = self.inner.read_store(|s| s.summaries())?;
        let paths = self.inner.paths.clone();
        tokio::task::spawn_blocking(move || {
            let mut goals = Vec::with_capacity(summaries.len());
            let mut total_bytes = 0u64;
            let mut reclaimable_bytes = 0u64;
            for g in summaries {
                let workspace_bytes = dir_bytes(&paths.workspace(&g.id));
                let verify_bytes = dir_bytes(&paths.verify(&g.id));
                let tmp_bytes = dir_bytes(&paths.tmp(&g.id)) + dir_bytes(&paths.tmp(&format!("{}-verify", g.id)));
                let cache_bytes = dir_bytes(&paths.root.join("caches").join(&g.id));
                let sum = workspace_bytes + verify_bytes + tmp_bytes + cache_bytes;
                let reclaimable = matches!(g.state, LifecycleState::Archived | LifecycleState::Abandoned) && sum > 0;
                total_bytes += sum;
                if reclaimable {
                    reclaimable_bytes += sum;
                }
                goals.push(GoalDiskUsage {
                    goal_id: g.id,
                    project_id: g.project_id,
                    title: g.title,
                    state: g.state,
                    workspace_bytes,
                    verify_bytes,
                    tmp_bytes,
                    cache_bytes,
                    total_bytes: sum,
                    reclaimable,
                });
            }
            goals.sort_by_key(|b| std::cmp::Reverse(b.total_bytes));
            StorageInventory { total_bytes, reclaimable_bytes, goals }
        })
        .await
        .map_err(|e| invalid(e.to_string()))
    }

    /// Safely reclaims disk space for archived or abandoned goals, strictly
    /// refusing any active, paused, in-review, or accepted goal. Returns reclaimed bytes.
    pub async fn reclaim_storage(&self, goal_ids: Vec<String>) -> Result<u64> {
        let mut reclaimed = 0u64;
        for id in goal_ids {
            let rec = self.inner.read_store(|s| s.goal(&id))?;
            if !rec.state.is_terminal() {
                let lang = self.inner.lang();
                return Err(invalid(tr!(
                    lang,
                    "拒绝清理 {id}：只允许清理已归档或已放弃的目标工作区",
                    "Refused to reclaim {id}: only archived or abandoned goal workspaces can be cleaned"
                )));
            }
            let paths = self.inner.paths.clone();
            let gid = id.clone();
            let before = tokio::task::spawn_blocking(move || {
                dir_bytes(&paths.workspace(&gid))
                    + dir_bytes(&paths.verify(&gid))
                    + dir_bytes(&paths.tmp(&gid))
                    + dir_bytes(&paths.tmp(&format!("{gid}-verify")))
                    + dir_bytes(&paths.root.join("caches").join(&gid))
            })
            .await
            .unwrap_or(0);
            self.remove_workspace(&id).await?;
            let cache_dir = self.inner.paths.root.join("caches").join(&id);
            if cache_dir.exists() {
                let _ = std::fs::remove_dir_all(&cache_dir);
            }
            reclaimed += before;
        }
        Ok(reclaimed)
    }

    /// Lists supported engines with explicit Onboarding Trust Gate tiers (`docs/18` P1.1).
    pub fn engines(&self) -> Vec<EngineDescriptor> {
        let lang = self.inner.lang();
        let has_node = self.inner.env.which("node").is_some();
        let pi_ok = self.inner.pi_program().is_some();
        let claude_ok = self.inner.env.which("claude").is_some();
        let codex_ok = self.inner.env.which("codex").is_some() || self.inner.env.which("codex-acp").is_some();
        let gemini_ok = self.inner.env.which("gemini").is_some();
        let opencode_ok = self.inner.env.which("opencode").is_some();
        vec![
            EngineDescriptor {
                id: "pi".into(),
                label: "Pi".into(),
                trust_tier: EngineTrustTier::FullS2,
                installed: pi_ok,
                available: pi_ok,
                note: tr!(
                    lang,
                    "原生 RPC · 全工具白名单与内核沙箱（完整 S2）",
                    "Native RPC · explicit tool allowlist & kernel sandbox (Full S2)"
                ),
            },
            EngineDescriptor {
                id: "claude-code".into(),
                label: "Claude Code".into(),
                trust_tier: EngineTrustTier::FullS2,
                installed: claude_ok,
                available: claude_ok && has_node,
                note: tr!(
                    lang,
                    "ACP 桥接 · 禁用全部内置工具，走 Tower 沙箱工具（完整 S2）",
                    "ACP bridge · built-in tools cleared, routed through Tower sandbox tools (Full S2)"
                ),
            },
            EngineDescriptor {
                id: "codex".into(),
                label: "Codex CLI".into(),
                trust_tier: EngineTrustTier::RestrictedS2,
                installed: codex_ok,
                available: codex_ok && has_node,
                note: tr!(
                    lang,
                    "ACP 适配器 · 拦截所有非 Tower 权限请求（受限 S2）",
                    "ACP adapter · denies all non-Tower permission requests (Restricted S2)"
                ),
            },
            EngineDescriptor {
                id: "gemini-cli".into(),
                label: "Gemini CLI".into(),
                trust_tier: EngineTrustTier::RestrictedS2,
                installed: gemini_ok,
                available: gemini_ok && has_node,
                note: tr!(
                    lang,
                    "原生 --acp · 仅放行 Tower MCP 工具（受限 S2）",
                    "Native --acp · allows only Tower MCP tools (Restricted S2)"
                ),
            },
            EngineDescriptor {
                id: "opencode".into(),
                label: "OpenCode".into(),
                trust_tier: EngineTrustTier::RestrictedS2,
                installed: opencode_ok,
                available: opencode_ok && has_node,
                note: tr!(
                    lang,
                    "原生 opencode acp · 权限与工具受限隔离（受限 S2）",
                    "Native opencode acp · confined tool & permission gate (Restricted S2)"
                ),
            },
        ]
    }

    /// Reports the active OS sandbox posture and optional MicroVM availability.
    pub fn sandbox_posture(&self) -> SandboxPosture {
        let lang = self.inner.lang();
        let mut warnings = Vec::new();
        let backend_name = if cfg!(target_os = "macos") {
            if sandbox::available() {
                "macos_seatbelt".into()
            } else {
                warnings.push(tr!(
                    lang,
                    "未找到 /usr/bin/sandbox-exec，隔离不可用",
                    "/usr/bin/sandbox-exec not found; sandbox isolation unavailable"
                ));
                "none".into()
            }
        } else if cfg!(target_os = "linux") {
            if self.inner.env.which("bwrap").is_some() {
                "linux_bwrap_landlock".into()
            } else {
                warnings.push(tr!(
                    lang,
                    "未安装 bubblewrap (bwrap)，Linux 隔离不可用",
                    "bubblewrap (bwrap) is not installed; Linux isolation unavailable"
                ));
                "none".into()
            }
        } else {
            warnings.push(tr!(lang, "当前平台暂不支持内核沙箱", "Kernel sandbox is not available on this OS"));
            "none".into()
        };
        let microvm_available =
            cfg!(all(target_os = "macos", target_arch = "aarch64")) && self.inner.env.which("container").is_some();
        SandboxPosture { backend_name, microvm_available, warnings }
    }
}

fn dir_bytes(path: &Path) -> u64 {
    if !path.exists() {
        return 0;
    }
    let mut total = 0u64;
    let mut stack = vec![path.to_path_buf()];
    while let Some(dir) = stack.pop() {
        let Ok(entries) = std::fs::read_dir(&dir) else { continue };
        for entry in entries.flatten() {
            let Ok(meta) = entry.metadata() else { continue };
            if meta.is_symlink() {
                continue;
            }
            if meta.is_dir() {
                stack.push(entry.path());
            } else {
                total = total.saturating_add(meta.len());
            }
        }
    }
    total
}
