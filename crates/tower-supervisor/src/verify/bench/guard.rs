//! Assertion identity in the Bench (`docs/07` §7.6).
//!
//! The invariant: *while the criteria run, the assertion entry points and
//! the test-framework globals the tests use must be the library's own
//! objects, unmodified.* It is checked by Tower at run time, not inferred
//! from the text of the diff, because any text rule only describes the
//! ways of breaking it that have been seen so far.
//!
//! Tower loads its own guard before any project code, through the runner's
//! own preload mechanism (`--require` for Node, the interpreter's start-up
//! hook for Python). The guard records what the entry points are at the
//! start and reports at the end of each process.
//!
//! Two properties make the report Tower's and not the run's:
//!
//! - the transcript lives outside everything the sandbox may write; the
//!   profile lets a command add data to that one file and nothing else, and
//!   the file is append-only, so what Tower already has can be neither
//!   removed nor rewritten;
//! - each process commits to a secret before any project code loads and
//!   reveals it with its verdict, so a verdict cannot be attributed to a
//!   process that did not report one.
//!
//! A run can therefore add lines of its own; it cannot take Tower's away,
//! and it cannot produce the secret of a process that stayed silent.
//!
//! A process that is killed never reports; that is "not checked", not a
//! finding. Compiled languages have no equivalent hook, and the result says
//! so rather than implying the check covered them.

use std::path::{Path, PathBuf};

use sha2::{Digest, Sha256};
use tower_core::{Lang, tr};

/// Which part of the Bench a report came from: your own code on the base,
/// or the agent's snapshot.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(in crate::verify) enum Phase {
    Base,
    Pin,
}

/// How a criterion's command relates to the guard.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(in crate::verify) enum Coverage {
    /// A runner the guard loads into (Node, Python).
    Guarded,
    /// A runner with no equivalent start-up hook (compiled languages).
    NoHook(&'static str),
    /// Not a test runner Tower knows: nothing is claimed.
    Unknown,
}

/// Tower's guard: the preloads, and one append-only transcript per phase.
#[derive(Debug)]
pub(in crate::verify) struct Guard {
    dir: PathBuf,
    base_log: PathBuf,
    pin_log: PathBuf,
    env: Vec<(String, String)>,
}

const NODE: &str = include_str!("guard/assert_guard.cjs");
const PYTHON: &str = include_str!("guard/sitecustomize.py");

impl Guard {
    /// Writes the guard into a directory Tower owns (outside everything the
    /// sandbox may write) and prepares the transcripts. `None` when the
    /// path cannot be named safely in the runners' environment variables.
    pub(in crate::verify) fn install(dir: &Path) -> std::io::Result<Option<Guard>> {
        let Some(text) = dir.to_str() else { return Ok(None) };
        // A path these variables cannot carry unambiguously: no guard, and
        // the result says the check did not cover the run.
        if text.contains(['"', '\'', '\\', '\n', ':', ';']) {
            return Ok(None);
        }
        std::fs::create_dir_all(dir)?;
        let node = dir.join("assert_guard.cjs");
        std::fs::write(&node, NODE)?;
        std::fs::write(dir.join("sitecustomize.py"), PYTHON)?;
        let (base_log, pin_log) = (dir.join("base.log"), dir.join("pin.log"));
        for log in [&base_log, &pin_log] {
            std::fs::write(log, "")?;
            append_only(log, true);
        }
        let require = match node.to_string_lossy().contains(' ') {
            true => format!("--require \"{}\"", node.display()),
            false => format!("--require {}", node.display()),
        };
        let env = vec![("NODE_OPTIONS".to_string(), require), ("PYTHONPATH".to_string(), text.to_string())];
        Ok(Some(Guard { dir: dir.to_path_buf(), base_log, pin_log, env }))
    }

    /// The directory the sandbox must be able to read (the preloads).
    pub(in crate::verify) fn dir(&self) -> &Path {
        &self.dir
    }

    /// The transcripts, which the sandbox may add to and nothing else.
    pub(in crate::verify) fn logs(&self) -> Vec<PathBuf> {
        vec![self.base_log.clone(), self.pin_log.clone()]
    }

    /// Environment the runners need to load the guard and report to the
    /// transcript of `phase`, merged into `env` (an existing `NODE_OPTIONS`
    /// or `PYTHONPATH` of the project is kept).
    pub(in crate::verify) fn merge_env(&self, env: &mut Vec<(String, String)>, phase: Phase) {
        let log = ("TOWER_GUARD_LOG".to_string(), self.log(phase).display().to_string());
        for (key, value) in self.env.iter().chain(std::iter::once(&log)) {
            match env.iter_mut().find(|(k, _)| k == key) {
                Some((_, existing)) if !existing.is_empty() => {
                    let sep = if key == "PYTHONPATH" { ":" } else { " " };
                    *existing = format!("{value}{sep}{existing}");
                }
                Some((_, existing)) => *existing = value.clone(),
                None => env.push((key.clone(), value.clone())),
            }
        }
    }

    pub(in crate::verify) fn log(&self, phase: Phase) -> &Path {
        match phase {
            Phase::Base => &self.base_log,
            Phase::Pin => &self.pin_log,
        }
    }

    /// What the processes of `phase` reported.
    pub(in crate::verify) fn read(&self, phase: Phase) -> Report {
        Report::parse(&std::fs::read_to_string(self.log(phase)).unwrap_or_default())
    }

    /// Lets the transcripts be deleted again.
    pub(in crate::verify) fn close(&self) {
        for log in [&self.base_log, &self.pin_log] {
            append_only(log, false);
        }
    }
}

/// Removes a guard directory and everything in it, transcripts included:
/// their append-only flag is cleared first, or nothing could delete them
/// (not Tower, not you) and a later verification of the same snapshot could
/// not set up its guard. Covers verifications that ended early or were cut
/// short by a quit, where `close` never ran.
pub(crate) fn remove_dir(dir: &Path) {
    if !dir.exists() {
        return;
    }
    if cfg!(target_os = "macos") {
        let _ = std::process::Command::new("/usr/bin/chflags")
            .args(["-R", "nouappnd"])
            .arg(dir)
            .stdout(std::process::Stdio::null())
            .stderr(std::process::Stdio::null())
            .status();
    }
    let _ = std::fs::remove_dir_all(dir);
}

/// Sets or clears the append-only flag (macOS; elsewhere the transcript is
/// only protected by the directory it lives in).
fn append_only(path: &Path, on: bool) {
    if !cfg!(target_os = "macos") {
        return;
    }
    let flag = if on { "uappnd" } else { "nouappnd" };
    let _ = std::process::Command::new("/usr/bin/chflags")
        .arg(flag)
        .arg(path)
        .stdout(std::process::Stdio::null())
        .stderr(std::process::Stdio::null())
        .status();
}

/// What a phase's transcript says.
#[derive(Debug, Default, PartialEq, Eq)]
pub(in crate::verify) struct Report {
    /// Processes that armed the guard.
    pub(in crate::verify) started: usize,
    /// Processes that reported a verdict Tower can attribute to them.
    pub(in crate::verify) finished: usize,
    /// The entry points that were no longer the library's own.
    pub(in crate::verify) replaced: Vec<String>,
    /// Verdicts that match no commitment: a report no process made.
    pub(in crate::verify) unattributed: usize,
}

impl Report {
    fn parse(text: &str) -> Report {
        let mut open: Vec<String> = Vec::new();
        let mut report = Report::default();
        for line in text.lines() {
            let f: Vec<&str> = line.split_whitespace().collect();
            if f.first() != Some(&"tower-assert-guard") || f.len() < 5 {
                continue;
            }
            match f[3] {
                "start" => {
                    report.started += 1;
                    open.push(f[4].to_string());
                }
                "end" if f.len() >= 6 => {
                    let revealed = hex_sha256(f[4]);
                    let Some(i) = open.iter().position(|c| *c == revealed) else {
                        report.unattributed += 1;
                        continue;
                    };
                    open.remove(i);
                    report.finished += 1;
                    if f[5] == "replaced" {
                        let what = f.get(6).copied().unwrap_or("-");
                        for entry in what.split(',').filter(|e| !e.is_empty() && *e != "-") {
                            let named = format!("{} · {entry}", f[2]);
                            if !report.replaced.contains(&named) {
                                report.replaced.push(named);
                            }
                        }
                        if report.replaced.is_empty() {
                            report.replaced.push(f[2].to_string());
                        }
                    }
                }
                _ => {}
            }
        }
        report
    }

    /// Whether the invariant was broken.
    pub(in crate::verify) fn broken(&self) -> bool {
        !self.replaced.is_empty() || self.unattributed > 0
    }

    /// The finding, in words that name the invariant and the harm.
    pub(in crate::verify) fn detail(&self, lang: Lang) -> String {
        if !self.replaced.is_empty() {
            let list: Vec<&str> = self.replaced.iter().take(8).map(String::as_str).collect();
            let list = list.join("\n");
            return tr!(
                lang,
                "标准运行时，测试用到的断言入口不再是断言库原来的那个对象：\n{list}\n换掉断言入口的代码可以让任何断言通过，所以这次验证的“通过”都不能当作事实。",
                "While the criteria ran, the assertion entry points the tests use were no longer the library's own objects:\n{list}\nCode that replaces them can make any assertion pass, so none of this verification's passes count as evidence."
            );
        }
        tr!(
            lang,
            "断言完整性检查收到了无法归属的结论：有结论没有对应的进程。检查本身被绕过了，这次验证的“通过”都不能当作事实。",
            "The assertion-identity check received a verdict no process committed to. The check itself was worked around, so none of this verification's passes count as evidence."
        )
    }
}

fn hex_sha256(hex: &str) -> String {
    let mut h = Sha256::new();
    h.update(hex.as_bytes());
    format!("{:x}", h.finalize())
}

/// Whether the guard loads into what a criterion's command runs.
pub(in crate::verify) fn coverage(command: &str) -> Coverage {
    let c = command.trim();
    let word = |w: &str| {
        c.split(|ch: char| ch.is_whitespace() || matches!(ch, '&' | '|' | ';' | '/'))
            .any(|part| part.trim_matches(|ch| ch == '\'' || ch == '"') == w)
    };
    const JS: &[&str] = &["node", "npm", "pnpm", "yarn", "npx", "vitest", "jest", "mocha", "tsx", "ts-node"];
    const PY: &[&str] = &["python", "python3", "pytest", "tox", "nox", "uv"];
    const NO_HOOK: &[(&str, &str)] =
        &[("cargo", "Rust"), ("go", "Go"), ("mvn", "Java"), ("gradle", "Java"), ("swift", "Swift"), ("dotnet", ".NET")];
    if JS.iter().any(|r| word(r)) || PY.iter().any(|r| word(r)) {
        return Coverage::Guarded;
    }
    for (runner, language) in NO_HOOK {
        if word(runner) {
            return Coverage::NoHook(language);
        }
    }
    Coverage::Unknown
}

/// What the result says when the identity check could not cover a command:
/// the honest version of "nothing was found".
pub(in crate::verify) fn unchecked_detail(commands: &[(String, Coverage)], lang: Lang) -> Option<String> {
    let mut lines = Vec::new();
    for (command, coverage) in commands {
        match coverage {
            Coverage::NoHook(language) => lines.push(tr!(
                lang,
                "`{command}`（{language}）：这个语言没有可以在测试代码之前装入检查的入口，断言入口的身份没有被检查；必败金丝雀改写测试自己的期望值，是这里唯一的检查。",
                "`{command}` ({language}): this language has no hook for loading a check before the test code, so the identity of the assertion entry points was not checked; the must-fail canary, which changes the tests' own expected values, is the only check here."
            )),
            Coverage::Guarded => lines.push(tr!(
                lang,
                "`{command}`：Tower 的检查没有报告结论（命令可能没有按预期启动运行器）。",
                "`{command}`: Tower's check reported no verdict (the command may not have started the runner as expected)."
            )),
            Coverage::Unknown => {}
        }
    }
    (!lines.is_empty()).then(|| {
        let list = lines.join("\n");
        tr!(
            lang,
            "断言入口的身份没有被检查：\n{list}",
            "The identity of the assertion entry points was not checked:\n{list}"
        )
    })
}

#[cfg(test)]
mod tests {

    #[test]
    fn a_guard_directory_left_with_its_transcripts_locked_is_removed() {
        let root = tempfile::tempdir().unwrap();
        let dir = root.path().join("assert-guard/G-0001/abc");
        let guard = Guard::install(&dir).unwrap().unwrap();
        // Cut short: `close` never ran, the transcripts are still append-only.
        drop(guard);
        if cfg!(target_os = "macos") {
            assert!(std::fs::remove_dir_all(root.path().join("assert-guard")).is_err(), "the flag holds");
        }
        remove_dir(&root.path().join("assert-guard"));
        assert!(!root.path().join("assert-guard").exists());
        // And the same snapshot gets its guard again.
        assert!(Guard::install(&dir).unwrap().is_some());
        remove_dir(&root.path().join("assert-guard"));
    }

    use super::*;

    fn line(kind: &str, nonce: &str, rest: &str) -> String {
        let field = if kind == "start" { hex_sha256(nonce) } else { nonce.to_string() };
        format!("tower-assert-guard 1 node {kind} {field} {rest}\n")
    }

    #[test]
    fn a_verdict_counts_only_for_a_process_that_committed_to_it() {
        let honest = format!("{}{}", line("start", "aa", "40"), line("end", "aa", "intact -"));
        let r = Report::parse(&honest);
        assert_eq!((r.started, r.finished, r.unattributed), (1, 1, 0));
        assert!(!r.broken());

        let caught = format!("{}{}", line("start", "bb", "40"), line("end", "bb", "replaced assert.equal"));
        let r = Report::parse(&caught);
        assert!(r.broken() && r.replaced == ["node · assert.equal"]);
        assert!(r.detail(Lang::En).contains("no longer the library's own"));

        // A verdict nothing committed to: the check was worked around.
        let forged = format!("{}{}", line("start", "cc", "40"), line("end", "dd", "intact -"));
        let r = Report::parse(&forged);
        assert_eq!((r.finished, r.unattributed), (0, 1));
        assert!(r.broken());

        // A process that was killed never reports: not checked, not a finding.
        let killed = line("start", "ee", "40");
        let r = Report::parse(&killed);
        assert_eq!((r.started, r.finished), (1, 0));
        assert!(!r.broken());
    }

    #[test]
    fn commands_are_told_apart_by_what_can_load_the_guard() {
        assert_eq!(coverage("node --test"), Coverage::Guarded);
        assert_eq!(coverage("npm test"), Coverage::Guarded);
        assert_eq!(coverage("python3 -m pytest -q"), Coverage::Guarded);
        assert_eq!(coverage("cargo test"), Coverage::NoHook("Rust"));
        assert_eq!(coverage("go test ./..."), Coverage::NoHook("Go"));
        assert_eq!(coverage("sh check.sh"), Coverage::Unknown);
        assert_eq!(coverage("test -f done.txt"), Coverage::Unknown);
        let text = unchecked_detail(&[("cargo test".into(), Coverage::NoHook("Rust"))], Lang::En).unwrap();
        assert!(text.contains("Rust") && text.contains("canary"), "{text}");
        assert!(unchecked_detail(&[("sh x.sh".into(), Coverage::Unknown)], Lang::En).is_none());
    }

    /// Runs `file` the way the Bench runs a criterion — the guard loaded
    /// before the file, the transcript on the inherited descriptor — and
    /// returns what the transcript says.
    fn run(guard: &Guard, dir: &Path, file: &str) -> Report {
        let mut env: Vec<(String, String)> =
            vec![("PATH".into(), std::env::var("PATH").unwrap_or_default()), ("HOME".into(), "/tmp".into())];
        guard.merge_env(&mut env, Phase::Pin);
        let command = crate::verify::command_for(file, None);
        let out = std::process::Command::new("/bin/sh")
            .arg("-c")
            .arg(&command)
            .current_dir(dir)
            .env_clear()
            .envs(env)
            .output()
            .expect("ran");
        assert!(out.status.success(), "{command}: {}", String::from_utf8_lossy(&out.stderr));
        guard.read(Phase::Pin)
    }

    fn have(program: &str) -> bool {
        std::process::Command::new(program)
            .arg("--version")
            .stdout(std::process::Stdio::null())
            .stderr(std::process::Stdio::null())
            .status()
            .is_ok_and(|s| s.success())
    }

    /// Regression fixture: a replaced assertion entry reached at run time
    /// by an indirect route, with the original put back before the process
    /// ends. No text rule has anything to match; the identity check does.
    #[test]
    fn an_entry_point_replaced_at_run_time_is_caught_in_node() {
        if !have("node") {
            return;
        }
        let tmp = tempfile::tempdir_in("/tmp").unwrap();
        let dir = crate::paths::real(tmp.path());
        let guard = Guard::install(&dir.join("guard")).unwrap().expect("installed");
        std::fs::write(
            dir.join("honest.mjs"),
            "import assert from 'node:assert'\nassert.equal(2 + 2, 4)\nconsole.log('ok')\n",
        )
        .unwrap();
        assert_eq!(run(&guard, &dir, "node honest.mjs").replaced, Vec::<String>::new());

        std::fs::write(
            dir.join("cheat.mjs"),
            "import assert from 'node:assert'\nconst key = ['eq', 'ual'].join('')\nconst real = assert[key]\n\
             assert[key] = () => {}\nassert[key](1, 2)\nassert[key] = real\n",
        )
        .unwrap();
        let report = run(&guard, &dir, "node cheat.mjs");
        assert!(report.broken(), "{report:?}");
        assert!(report.replaced.iter().any(|r| r.contains("assert.equal")), "{report:?}");
        guard.close();
    }

    /// The same for Python, and an honest control that uses the module
    /// table and `builtins` the way program code does.
    #[test]
    fn an_entry_point_replaced_at_run_time_is_caught_in_python() {
        if !have("python3") {
            return;
        }
        let tmp = tempfile::tempdir_in("/tmp").unwrap();
        let dir = crate::paths::real(tmp.path());
        let guard = Guard::install(&dir.join("guard")).unwrap().expect("installed");
        std::fs::write(
            dir.join("honest.py"),
            "import builtins, sys, unittest\n\
             print(bool(sys.modules.get('json')), builtins.len([1]))\n\
             class T(unittest.TestCase):\n    def test_x(self):\n        self.assertEqual(1, 1)\n\
             unittest.main(argv=['x'], exit=False)\n",
        )
        .unwrap();
        assert_eq!(run(&guard, &dir, "python3 honest.py").replaced, Vec::<String>::new());

        std::fs::write(
            dir.join("cheat.py"),
            "import sys\n\
             case = getattr(sys.modules[__import__('unitt' + 'est').__name__], 'Test' + 'Case')\n\
             setattr(case, 'assert' + 'Equal', lambda self, a, b, msg=None: None)\n",
        )
        .unwrap();
        let report = run(&guard, &dir, "python3 cheat.py");
        assert!(report.broken() && report.replaced.iter().any(|r| r.contains("assertEqual")), "{report:?}");
        guard.close();
    }

    #[test]
    fn the_environment_keeps_what_the_project_already_set() {
        let tmp = tempfile::tempdir_in("/tmp").unwrap();
        let dir = crate::paths::real(tmp.path()).join("guard");
        let guard = Guard::install(&dir).unwrap().expect("installed");
        let mut env = vec![("PYTHONPATH".to_string(), "/project/lib".to_string())];
        guard.merge_env(&mut env, Phase::Pin);
        let get = |k: &str| env.iter().find(|(key, _)| key == k).map(|(_, v)| v.clone()).unwrap_or_default();
        assert_eq!(get("PYTHONPATH"), format!("{}:/project/lib", dir.display()));
        assert!(get("NODE_OPTIONS").contains("--require"));
        assert_eq!(get("TOWER_GUARD_LOG"), guard.log(Phase::Pin).display().to_string());
        assert!(dir.join("assert_guard.cjs").exists() && dir.join("sitecustomize.py").exists());
        guard.close();
    }
}
