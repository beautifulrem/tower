//! What the desk opens outside Tower: the editor, a terminal, Finder, and
//! the diagnostics archive for a bug report.

use std::path::PathBuf;

use tower_core::tr;

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
}
