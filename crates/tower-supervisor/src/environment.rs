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
    let mut issue = |kind, blocking, text: String, fix: Option<&str>| {
        issues.push(EnvIssue { kind, blocking, text, fix: fix.map(String::from) })
    };
    const INSTALL_PI: &str = "npm i -g @earendil-works/pi-coding-agent";
    if pi.is_none() {
        issue(
            EnvIssueKind::PiMissing,
            true,
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
                    true,
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
            _ => {}
        }
    } else {
        issue(
            EnvIssueKind::PiBroken,
            true,
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
        demo_missing: ["node", "python3"]
            .into_iter()
            .filter(|p| inner.env.which(p).is_none())
            .map(String::from)
            .collect(),
        problems,
        issues,
    }
}
