//! The environment check shown on the welcome screen and in Settings:
//! typed issues with a fix, so the interface never parses sentences.

use tower_core::tr;
use tower_core::view::{EnvIssue, EnvIssueKind, EnvironmentStatus};

use crate::{Inner, sandbox};

pub fn status(inner: &Inner) -> EnvironmentStatus {
    let pi = inner.pi_program();
    let pi_version = pi.as_ref().and_then(|p| {
        let out = std::process::Command::new(p).arg("--version").env_clear().envs(inner.env.pairs()).output().ok()?;
        out.status.success().then(|| String::from_utf8_lossy(&out.stdout).trim().to_string())
    });
    let git_version = inner.git.version().ok();
    let lang = inner.lang();
    let mut issues = Vec::new();
    // Pi problems block only when Pi is the engine.
    let uses_pi = inner.settings().engine != "claude-code";
    let mut issue = |kind, blocking, text: String, fix: Option<&str>| {
        issues.push(EnvIssue { kind, blocking, text, fix: fix.map(String::from) })
    };
    const INSTALL_PI: &str = "npm i -g @earendil-works/pi-coding-agent";
    if pi.is_none() {
        issue(
            EnvIssueKind::PiMissing,
            uses_pi,
            tr!(
                lang,
                "没有找到 pi。请先安装 Pi，或在设置中指定路径。",
                "Pi was not found. Install it or set its path in Settings."
            ),
            Some(INSTALL_PI),
        );
    } else if let Some(v) = pi_version.as_deref() {
        let (min, tested) = (tower_core::view::PI_MIN, tower_core::view::PI_TESTED);
        match tower_core::view::parse_version(v) {
            Some(found) if found < min => {
                let want = format!("{}.{}.{}", min.0, min.1, min.2);
                issue(
                    EnvIssueKind::PiTooOld,
                    uses_pi,
                    tr!(
                        lang,
                        "Pi {v} 太旧，Tower 需要 {want} 或更新的版本。",
                        "Pi {v} is too old; Tower needs {want} or newer."
                    ),
                    Some(INSTALL_PI),
                )
            }
            Some(found) if (found.0, found.1) > tested => {
                let t = format!("{}.{}", tested.0, tested.1);
                issue(
                    EnvIssueKind::PiUntested,
                    false,
                    tr!(
                        lang,
                        "Pi {v} 比 Tower 测试过的版本（{t}.x）更新，大概率可用。",
                        "Pi {v} is newer than the versions Tower was tested with ({t}.x); it will most likely work."
                    ),
                    None,
                )
            }
            Some(_) => {}
            None => issue(
                EnvIssueKind::PiUntested,
                false,
                tr!(
                    lang,
                    "读不出 Pi 的版本（输出：{v}），无法确认是否兼容。",
                    "Could not read Pi's version (it printed: {v}), so compatibility is unknown."
                ),
                None,
            ),
        }
    } else {
        issue(
            EnvIssueKind::PiBroken,
            uses_pi,
            tr!(lang, "pi 无法运行。请检查设置中的路径。", "Pi does not run. Check its path in Settings."),
            Some(INSTALL_PI),
        );
    }
    if git_version.is_none() {
        issue(
            EnvIssueKind::GitMissing,
            true,
            tr!(lang, "没有找到 git。", "git was not found."),
            Some("xcode-select --install"),
        );
    }
    if git_version.is_some() && !inner.git.has_identity(&inner.paths.root) {
        issue(
            EnvIssueKind::GitIdentityMissing,
            false,
            tr!(
                lang,
                "git 没有设置你的名字和邮箱。验收时 Tower 以你的身份写提交，需要先设置它们。",
                "git has no name and email set. Tower commits accepted work as you, so set them first."
            ),
            Some("git config --global user.name \"Your Name\" && git config --global user.email you@example.com"),
        );
    }
    if !uses_pi && (inner.env.which("claude").is_none() || inner.env.which("node").is_none()) {
        issue(
            EnvIssueKind::ClaudeMissing,
            true,
            tr!(
                lang,
                "引擎设为 Claude Code，但没有找到 claude 或 Node.js。安装并登录 Claude Code，或在设置中把引擎改回 Pi。",
                "The engine is Claude Code, but claude or Node.js was not found. Install and log in to Claude Code, or switch the engine back to Pi in Settings."
            ),
            Some("npm i -g @anthropic-ai/claude-code"),
        );
    }
    if !sandbox::available() {
        issue(
            EnvIssueKind::NoSandbox,
            false,
            tr!(
                lang,
                "这台机器上没有 OS 沙箱：Agent 的命令以你的权限运行，读写只按路径限制。",
                "No OS sandbox on this machine: the agent's commands run with your permissions, fenced by path only."
            ),
            None,
        );
    }
    let problems = issues.iter().map(|i| i.text.clone()).collect();
    EnvironmentStatus {
        pi_path: pi.map(|p| p.display().to_string()),
        pi_version,
        git_version,
        data_dir: inner.paths.root.display().to_string(),
        min_pi_version: {
            let (a, b, c) = tower_core::view::PI_MIN;
            format!("{a}.{b}.{c}")
        },
        demo_missing: ["node", "python3"].into_iter().filter(|p| !usable(inner, p)).map(String::from).collect(),
        problems,
        issues,
    }
}

/// Whether a program is really there. macOS ships `/usr/bin/python3` as a
/// stub that offers to install the developer tools (with a dialog) when
/// they are missing, so that one counts only with the tools installed.
pub(crate) fn usable(inner: &Inner, program: &str) -> bool {
    match inner.env.which(program) {
        None => false,
        Some(p) if p.starts_with("/usr/bin") && program == "python3" => {
            std::process::Command::new("/usr/bin/xcode-select")
                .arg("-p")
                .stdout(std::process::Stdio::null())
                .stderr(std::process::Stdio::null())
                .status()
                .is_ok_and(|s| s.success())
        }
        Some(_) => true,
    }
}
