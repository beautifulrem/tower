//! What the desk opens outside Tower: the editor, a terminal, Finder, and
//! the diagnostics archive for a bug report.

use std::path::PathBuf;

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
        // The ntfy topic is what lets anyone read the pushes: only the server stays.
        if !settings.push_url.is_empty() {
            let server = settings.push_url.find("://").map_or(0, |at| {
                at + 3 + settings.push_url[at + 3..].find('/').unwrap_or(settings.push_url.len() - at - 3)
            });
            settings.push_url = format!("{}/[redacted]", &settings.push_url[..server]);
        }
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
        let metas: Vec<crate::storage::GoalStorageMeta> = summaries
            .into_iter()
            .map(|g| crate::storage::GoalStorageMeta {
                goal_id: g.id,
                project_id: g.project_id,
                project_name: g.project_name,
                title: g.title,
                state: g.state,
                open_inbox_count: g.needs_you,
                unmerged: matches!(g.state, LifecycleState::Accepted),
                dirty: None,
            })
            .collect();
        let inv = crate::storage::inventory(self.inner.paths.clone(), metas).await?;
        let goals = inv
            .goals
            .into_iter()
            .map(|g| GoalDiskUsage {
                goal_id: g.goal_id,
                project_id: g.project_id,
                title: g.title,
                state: g.state,
                workspace_bytes: g.workspace_bytes,
                verify_bytes: g.verify_bytes,
                tmp_bytes: g.tmp_bytes,
                cache_bytes: g.cache_bytes,
                total_bytes: g.total_bytes,
                reclaimable: g.reclaimable && g.reclaimable_bytes > 0,
            })
            .collect();
        Ok(StorageInventory { total_bytes: inv.total_bytes, reclaimable_bytes: inv.reclaimable_bytes, goals })
    }

    /// Safely reclaims disk space for archived or abandoned goals, strictly
    /// refusing any active, paused, in-review, or accepted goal. Returns reclaimed bytes.
    pub async fn reclaim_storage(&self, goal_ids: Vec<String>) -> Result<u64> {
        let mut reclaimed = 0u64;
        for id in goal_ids {
            let summary = self.inner.read_store(|s| s.summary(&id))?;
            let meta = crate::storage::GoalStorageMeta {
                goal_id: summary.id.clone(),
                project_id: summary.project_id,
                project_name: summary.project_name,
                title: summary.title,
                state: summary.state,
                open_inbox_count: summary.needs_you,
                unmerged: matches!(summary.state, LifecycleState::Accepted),
                dirty: None,
            };
            if let Err(reason) = crate::storage::check_reclaim_safety(&meta, &self.inner.paths.workspace(&id)) {
                let lang = self.inner.lang();
                return Err(invalid(tr!(lang, "拒绝清理 {id}：{reason}", "Refused to reclaim {id}: {reason}")));
            }
            let res = crate::storage::reclaim_goal(self.inner.paths.clone(), meta)
                .await
                .map_err(|e| invalid(e.to_string()))?;
            let _ = crate::ports_pool::release_for_root(&self.inner.paths.root, &id);
            if self.inner.read_store(|s| s.goal(&id)).is_ok_and(|g| g.workspace.is_some()) {
                let _ = self.inner.append(&id, tower_core::EventKind::WorkspaceRemoved);
                self.inner.emit_goal_now(&id);
            }
            reclaimed = reclaimed.saturating_add(res.freed_bytes);
        }
        Ok(reclaimed)
    }

    /// Lists supported engines with explicit Onboarding Trust Gate tiers (`docs/18` P1.1).
    pub fn engines(&self) -> Vec<EngineDescriptor> {
        crate::acp_adapter::inspect_engines(&self.inner, self.inner.lang())
            .into_iter()
            .map(|e| EngineDescriptor {
                id: e.id,
                label: e.label,
                trust_tier: match e.trust_tier {
                    crate::acp_adapter::EngineTrustLevel::FullS2 => EngineTrustTier::FullS2,
                    crate::acp_adapter::EngineTrustLevel::RestrictedS2 => EngineTrustTier::RestrictedS2,
                    crate::acp_adapter::EngineTrustLevel::Experimental => EngineTrustTier::Experimental,
                },
                installed: e.installed,
                available: e.available,
                note: e.note,
            })
            .collect()
    }

    /// Reports the active OS sandbox posture and optional MicroVM availability.
    pub fn sandbox_posture(&self) -> SandboxPosture {
        let s = sandbox::posture_summary(&self.inner.env.pairs());
        SandboxPosture { backend_name: s.backend_name, microvm_available: s.microvm_available, warnings: s.warnings }
    }
}
