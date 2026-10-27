//! Small judgements the workbench makes about a run: whether a refusal is
//! real, whether tests ran, whether a command's files are there.

use std::path::Path;

use tower_core::Lang;

/// The first path an output says was refused that Tower itself can read
/// while the same sandbox profile cannot — a refusal Tower observed, not
/// one the command merely printed. Paths inside the checkout never count
/// (the sandbox allows them; a test's own permission error is a test).
pub(in crate::verify) async fn confirmed_refusal(output: &str, profile: Option<&Path>, dir: &Path) -> Option<String> {
    let profile = profile?;
    let mut candidates: Vec<String> = Vec::new();
    for line in output.lines().filter(|l| {
        let l = l.to_ascii_lowercase();
        l.contains("operation not permitted") || l.contains("eperm")
    }) {
        for word in line.split(|c: char| c.is_whitespace() || matches!(c, '\'' | '"' | ',' | '(' | ')' | '`')) {
            let w = word.trim_end_matches(':');
            if w.starts_with('/') && !candidates.iter().any(|c| c == w) {
                candidates.push(w.to_string());
            }
        }
    }
    let real_dir = crate::paths::real(dir);
    for path in candidates.into_iter().take(5) {
        let p = Path::new(&path);
        if crate::paths::real(p).starts_with(&real_dir) || std::fs::symlink_metadata(p).is_err() {
            continue;
        }
        let is_dir = p.is_dir();
        let probe = if is_dir {
            format!("/bin/ls {}", shell_quote(&path))
        } else {
            format!("/usr/bin/head -c 0 {}", shell_quote(&path))
        };
        let out = tokio::process::Command::new("/usr/bin/sandbox-exec")
            .arg("-f")
            .arg(profile)
            .args(["/bin/sh", "-c", &probe])
            .stdout(std::process::Stdio::null())
            .stderr(std::process::Stdio::piped())
            .output()
            .await
            .ok()?;
        let refused = !out.status.success() && String::from_utf8_lossy(&out.stderr).contains("Operation not permitted");
        if refused {
            return Some(path);
        }
    }
    None
}

fn shell_quote(s: &str) -> String {
    format!("'{}'", s.replace('\'', "'\\''"))
}

/// Whether a test runner's output shows that tests ran, for the runners
/// Tower knows; `None` for a command it does not recognise.
pub(in crate::verify) fn tests_ran(command: &str, output: &str) -> Option<bool> {
    let c = command.trim();
    let runner = [
        "cargo test",
        "cargo nextest",
        "pytest",
        "python -m pytest",
        "python3 -m pytest",
        "node --test",
        "npm test",
        "npm run test",
        "pnpm test",
        "yarn test",
        "npx vitest",
        "vitest",
        "npx jest",
        "jest",
        "go test",
    ]
    .iter()
    .any(|r| c.starts_with(r) || c.contains(&format!("&& {r}")));
    if !runner {
        return None;
    }
    let o = output.to_ascii_lowercase();
    let summary = [
        "test result:",
        "running ",
        " passed",
        " failed",
        "collected ",
        "# tests",
        "ℹ tests",
        "tests:",
        "test files",
        "--- fail",
        "fail\t",
        "ok  \t",
        "error[e",
        "assertionerror",
        "not ok ",
    ]
    .iter()
    .any(|m| o.contains(m));
    Some(summary)
}

/// A command names a file that is not in the checkout (`node --test x.test.js`
/// after the agent's new test was taken out): running it proves nothing.
pub(in crate::verify) fn paths_gone(dir: &Path, command: &str) -> bool {
    command
        .split_whitespace()
        .map(|w| w.trim_matches(|c| c == '\'' || c == '"'))
        .filter(|w| w.contains('/') && !w.starts_with('-') && !w.starts_with('/') && !w.contains(['*', '=']))
        .any(|w| !dir.join(w.trim_start_matches("./")).exists())
}

/// Adds to each held-out file a line that leaves `marker` when the file is
/// loaded (JavaScript, TypeScript, Python, shell); returns the files' new
/// contents, so a later comparison is with what was planted.
pub(in crate::verify) fn mark_loading(dir: &Path, files: &[String], marker: &Path) -> Vec<(String, Vec<u8>)> {
    let Some(m) = marker.to_str().filter(|m| !m.contains(['"', '\'', '\\', '\n'])) else { return Vec::new() };
    let mut planted = Vec::new();
    for f in files {
        let full = dir.join(f);
        let Ok(text) = std::fs::read_to_string(&full) else { continue };
        let ext = f.rsplit('.').next().unwrap_or("");
        let out = match ext {
            "js" | "mjs" | "cjs" | "jsx" => {
                format!("{text}\n;globalThis.process?.getBuiltinModule?.(\"node:fs\")?.writeFileSync(\"{m}\", \"\");\n")
            }
            "ts" | "mts" | "cts" | "tsx" => format!(
                "{text}\n;(globalThis as any).process?.getBuiltinModule?.(\"node:fs\")?.writeFileSync(\"{m}\", \"\");\n"
            ),
            "py" => format!("{text}\n\nopen(\"{m}\", \"w\").close()\n"),
            "sh" | "bash" => match text.split_once('\n') {
                Some((first, rest)) if first.starts_with("#!") => format!("{first}\n: > \"{m}\"\n{rest}"),
                _ => format!(": > \"{m}\"\n{text}"),
            },
            _ => continue,
        };
        if tower_git::write_inside(dir, f, out.as_bytes()).is_ok() {
            planted.push((f.clone(), out.into_bytes()));
        }
    }
    planted
}

pub(in crate::verify) fn sentinel_hit(id: &str, detail: String, lang: Lang) -> tower_core::sentinel::SentinelHit {
    tower_core::sentinel::SentinelHit {
        sentinel: id.into(),
        severity: tower_core::sentinel::HIGH,
        title: tower_core::i18n::sentinel_title(id, lang).unwrap_or(id).into(),
        detail,
    }
}
