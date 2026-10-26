//! Claude Code's ACP adapter, installed by Tower rather than fetched by
//! `npx` at whatever the registry serves: `npm ci` from the manifest and
//! lockfile shipped with Tower, which checks every package against the
//! integrity hash in the lockfile, with install scripts off. Once, on the
//! first Claude Code run; a Tower update with a new pin installs again.

use std::path::PathBuf;
use std::sync::Arc;

use tower_core::tr;

use crate::paths::Paths;
use crate::{Inner, Result, invalid};

/// The adapter's directory under Tower's extension.
pub fn dir(paths: &Paths) -> PathBuf {
    paths.extension_dir().join("acp-adapter")
}

/// The adapter's entry point once installed.
pub fn entry(paths: &Paths) -> PathBuf {
    dir(paths).join("node_modules/@agentclientprotocol/claude-agent-acp/dist/index.js")
}

static INSTALLING: tokio::sync::Mutex<()> = tokio::sync::Mutex::const_new(());

/// Installs the adapter unless a configured or installed one exists.
pub async fn ensure(inner: &Arc<Inner>) -> Result<()> {
    let settings = inner.settings();
    if !settings.claude_acp_command.trim().is_empty()
        || inner.env.which("claude-agent-acp").is_some()
        || !dir(&inner.paths).join("package-lock.json").is_file()
    {
        return Ok(());
    }
    let _guard = INSTALLING.lock().await;
    if entry(&inner.paths).is_file() {
        return Ok(());
    }
    let lang = inner.lang();
    let npm = inner.env.which("npm").ok_or_else(|| {
        invalid(tr!(
            lang,
            "Claude Code 引擎需要 Node.js（npm）来安装它的适配器",
            "The Claude Code engine needs Node.js (npm) to install its adapter"
        ))
    })?;
    let out = tokio::process::Command::new(npm)
        .args(["ci", "--ignore-scripts", "--no-audit", "--no-fund", "--loglevel=error"])
        .current_dir(dir(&inner.paths))
        .env_clear()
        .envs(inner.env.pairs())
        .output()
        .await?;
    if !out.status.success() || !entry(&inner.paths).is_file() {
        let err = String::from_utf8_lossy(&out.stderr);
        let tail: String =
            err.lines().rev().take(6).collect::<Vec<_>>().into_iter().rev().collect::<Vec<_>>().join("\n");
        return Err(invalid(tr!(
            lang,
            "安装 Claude Code 适配器失败：\n{tail}",
            "Could not install Claude Code's adapter:\n{tail}"
        )));
    }
    Ok(())
}
