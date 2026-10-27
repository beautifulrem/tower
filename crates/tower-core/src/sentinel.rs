//! Sentinels (`docs/07` §7.5): checks on the verified snapshot for things a
//! passing test run would hide. An agent that deletes the failing test,
//! marks it skipped or rewrites the test command can make every criterion
//! pass; the verifier alone cannot tell. Sentinels look at the diff instead.
//!
//! Severity 3 blocks review until a human overrides; 2 is shown in review.

use serde::{Deserialize, Serialize};
use ts_rs::TS;

use crate::contract::{Scope, ScopeFence, WriteVerdict};
use crate::i18n::{Lang, plural, sentinel_title};
use crate::view::{DiffFile, FileStatus, LineKind};

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct SentinelHit {
    /// Stable detector id, e.g. `test_deleted`.
    pub sentinel: String,
    /// 3 = high (blocks review until overridden), 2 = medium.
    pub severity: u8,
    pub title: String,
    /// The paths or lines that triggered it.
    pub detail: String,
}

pub const HIGH: u8 = 3;

use crate::roles::is_test_data;
pub use crate::roles::{is_test_harness, is_test_path};

/// Files that may contain tests: test paths, and Rust sources, whose unit
/// tests live next to the code (`#[cfg(test)] mod tests`). For Rust
/// sources only test-shaped lines count (assertions, `#[test]`).
fn holds_tests(path: &str) -> bool {
    is_test_path(path) || path.ends_with(".rs")
}

/// Whether a test file renamed from `old` to `new` is still one the runner
/// collects: a test path with the same extension (`.test.js.bak` is not).
fn still_runs(old: &str, new: &str) -> bool {
    let ext = |p: &str| p.rsplit('/').next().unwrap_or(p).rsplit('.').next().map(str::to_string);
    is_test_path(new) && ext(old) == ext(new)
}

/// Markers that disable or narrow a test in common frameworks.
const SKIP_MARKERS: &[&str] = &[
    ".skip(",
    ".only(",
    "xit(",
    "xdescribe(",
    "xtest(",
    "test.todo(",
    "it.todo(",
    "@pytest.mark.skip",
    "@unittest.skip",
    "pytest.skip(",
    "#[ignore]",
    "t.Skip(",
    "t.SkipNow(",
    "t.Skipf(",
    "@Disabled",
    "@Ignore",
    // node:test and vitest options, mocha's runtime skip
    "skip: true",
    "todo: true",
    ".skipIf(",
    ".runIf(",
    "this.skip()",
    // Python
    "@pytest.mark.xfail",
    "pytest.importorskip(",
    "@unittest.expectedFailure",
    // Rust
    "#[ignore =",
];

/// Lines that start a test case, across common frameworks.
fn starts_test(line: &str) -> bool {
    let l = line.trim_start();
    ["test(", "it(", "test.each", "it.each", "def test_", "async def test_", "func Test", "#[test]", "#[tokio::test"]
        .iter()
        .any(|p| l.starts_with(p))
}

/// Assertions that cannot fail (compared without whitespace, so Python's
/// `assert True` reads `assertTrue`).
fn is_vacuous_assertion(line: &str) -> bool {
    let l: String = line.chars().filter(|c| !c.is_whitespace()).collect();
    [
        "assert(true)",
        "assert.ok(true)",
        "assert.equal(1,1)",
        "assert.strictEqual(1,1)",
        "expect(true).toBe(true)",
        "expect(true).toBeTruthy()",
        "expect(1).toBe(1)",
        "assertTrue",
        "self.assertTrue(True)",
        "assert!(true)",
    ]
    .contains(&l.trim_end_matches(';'))
}

/// Statements that make the rest of a test unreachable or never run.
fn disables_body(line: &str) -> bool {
    let l: String = line.chars().filter(|c| !c.is_whitespace()).collect();
    l == "return;" || l == "return" || l.starts_with("if(false)") || l.starts_with("if(0)") || l == "iffalse:"
}

const TEST_CONFIGS: &[&str] = &["vite.config", "setup.cfg", "tox.ini"];

/// Test configuration inside general manifests: lines that decide which
/// tests run or how.
const TEST_CONFIG_KEYS: &[&str] = &[
    "[tool.pytest",
    "addopts",
    "testpaths",
    "python_files",
    "[[test]]",
    "test = false",
    "harness = false",
    "doctest = false",
];

/// A line with its literals (numbers, quoted strings) blanked, to tell an
/// edit of what a test expects from an edit of how it is written.
fn shape(line: &str) -> (String, Vec<String>) {
    let mut shape = String::new();
    let mut literals = Vec::new();
    let mut chars = line.trim().chars().peekable();
    // A digit after a space starts a number even when the shape (which
    // drops spaces) ends in a letter: `return 5`.
    let mut after_space = false;
    while let Some(c) = chars.next() {
        let spaced = std::mem::replace(&mut after_space, c.is_whitespace());
        if c == '"' || c == '\'' || c == '`' {
            let mut lit = String::new();
            while let Some(&n) = chars.peek() {
                chars.next();
                if n == c {
                    break;
                }
                lit.push(n);
            }
            shape.push_str("\"\"");
            literals.push(lit);
        } else if c.is_ascii_digit() && (spaced || !shape.ends_with(|p: char| p.is_alphanumeric() || p == '_')) {
            let mut lit = String::from(c);
            while let Some(&n) = chars.peek() {
                if n.is_ascii_digit() || n == '.' || n == '_' {
                    lit.push(n);
                    chars.next();
                } else {
                    break;
                }
            }
            shape.push('0');
            literals.push(lit);
        } else if !c.is_whitespace() {
            shape.push(c);
        }
    }
    (shape, literals)
}

/// Pairs each deleted line with the added line in the same position of the
/// run that follows it (the usual shape of an in-place edit).
fn edited_pairs(file: &DiffFile) -> Vec<(&str, &str)> {
    let mut out = Vec::new();
    for h in &file.hunks {
        let lines = &h.lines;
        let mut i = 0;
        while i < lines.len() {
            if lines[i].kind != LineKind::Del {
                i += 1;
                continue;
            }
            let del = i;
            while i < lines.len() && lines[i].kind == LineKind::Del {
                i += 1;
            }
            let add = i;
            while i < lines.len() && lines[i].kind == LineKind::Add {
                i += 1;
            }
            for k in 0..(add - del).min(i - add) {
                out.push((lines[del + k].text.as_str(), lines[add + k].text.as_str()));
            }
        }
    }
    out
}

/// Whether a file of the diff edits an assertion so that it expects a
/// different value (same shape, different literals).
pub fn changes_expectations(file: &DiffFile) -> bool {
    holds_tests(&file.path)
        && file.status != FileStatus::Added
        && edited_pairs(file).into_iter().any(|(old, new)| {
            is_assertion(old) && is_assertion(new) && {
                let ((s1, l1), (s2, l2)) = (shape(old), shape(new));
                s1 == s2 && l1 != l2
            }
        })
}

fn is_assertion(line: &str) -> bool {
    let l = line.trim_start();
    l.contains("assert") || l.contains("expect(") || l.starts_with("should") || l.contains(".should")
}

fn added_lines(file: &DiffFile) -> impl Iterator<Item = &str> {
    file.hunks.iter().flat_map(|h| h.lines.iter()).filter(|l| l.kind == LineKind::Add).map(|l| l.text.as_str())
}

fn removed_lines(file: &DiffFile) -> impl Iterator<Item = &str> {
    file.hunks.iter().flat_map(|h| h.lines.iter()).filter(|l| l.kind == LineKind::Del).map(|l| l.text.as_str())
}

fn hit(id: &str, severity: u8, detail: String, lang: Lang) -> SentinelHit {
    SentinelHit { sentinel: id.into(), severity, title: sentinel_title(id, lang).unwrap_or(id).into(), detail }
}

/// Runs every sentinel over the diff between base and the verified pin.
/// Titles and details are written in `lang`.
pub fn scan(files: &[DiffFile], scope: &Scope, lang: Lang) -> Vec<SentinelHit> {
    scan_with(files, scope, &[], lang)
}

/// Files a criterion command runs: scripts it executes (as the command, or
/// through sh, bash, node, python, ruby…), and the task runner's file for
/// `make`, `just`, `task` and `nox`. Not files it merely reads (a `grep`
/// target can be the very thing the goal changes).
fn command_files(commands: &[String]) -> Vec<String> {
    const RUNNERS: &[&str] =
        &["sh", "bash", "zsh", "node", "python", "python3", "ruby", "perl", "deno", "bun", "tsx", "ts-node"];
    let mut out = Vec::new();
    for c in commands {
        for segment in c.split(['&', '|', ';']) {
            let words: Vec<&str> =
                segment.split_whitespace().map(|w| w.trim_matches(|ch| ch == '\'' || ch == '"')).collect();
            let Some(first) = words.first() else { continue };
            let script = if RUNNERS.contains(first) {
                words.iter().skip(1).find(|w| !w.starts_with('-')).copied()
            } else if first.contains('/') {
                Some(*first)
            } else {
                None
            };
            if let Some(path) = script {
                out.push(path.trim_start_matches("./").to_string());
            }
            match *first {
                "make" | "gmake" => out.extend(["Makefile", "makefile", "GNUmakefile"].map(String::from)),
                "just" => out.extend(["justfile", "Justfile", ".justfile"].map(String::from)),
                "task" => out.extend(["Taskfile.yml", "Taskfile.yaml"].map(String::from)),
                "nox" => out.push("noxfile.py".into()),
                _ => {}
            }
        }
    }
    out
}

/// Runs every sentinel; `commands` are the contract's criterion commands,
/// whose own files (scripts they name, the Makefile) are frozen.
pub fn scan_with(files: &[DiffFile], scope: &Scope, commands: &[String], lang: Lang) -> Vec<SentinelHit> {
    let mut hits = Vec::new();
    let fence = ScopeFence::compile(scope).ok();

    // Deleted, or renamed out of where the test runner looks.
    let deleted_tests: Vec<&str> = files
        .iter()
        .filter_map(|f| match f.status {
            FileStatus::Deleted if is_test_path(&f.path) => Some(f.path.as_str()),
            FileStatus::Renamed
                if f.old_path.as_deref().is_some_and(|old| is_test_path(old) && !still_runs(old, &f.path)) =>
            {
                f.old_path.as_deref()
            }
            _ => None,
        })
        .collect();
    if !deleted_tests.is_empty() {
        hits.push(hit("test_deleted", HIGH, deleted_tests.join("\n"), lang));
    }

    let mut skips = Vec::new();
    for f in files.iter() {
        // Rust keeps unit tests inside source files.
        let rust_source = f.path.ends_with(".rs");
        if !is_test_path(&f.path) && !rust_source {
            continue;
        }
        for line in added_lines(f) {
            let hit = if rust_source && !is_test_path(&f.path) {
                line.contains("#[ignore")
            } else {
                SKIP_MARKERS.iter().any(|m| line.contains(m))
            };
            if hit {
                skips.push(format!("{}: {}", f.path, line.trim()));
            }
        }
    }
    if !skips.is_empty() {
        hits.push(hit("test_skipped", HIGH, skips.join("\n"), lang));
    }

    // Removing assertions from a test file without adding any is how a
    // failing test is made to pass quietly.
    let mut weakened = Vec::new();
    for f in files.iter().filter(|f| holds_tests(&f.path) && f.status == FileStatus::Modified) {
        let is_assert = |l: &str| {
            let l = l.trim_start();
            l.contains("assert") || l.contains("expect(") || l.starts_with("should")
        };
        let removed = removed_lines(f).filter(|l| is_assert(l)).count();
        // An assertion that cannot fail does not replace one that could.
        let added = added_lines(f).filter(|l| is_assert(l) && !is_vacuous_assertion(l)).count();
        if removed > 0 && added < removed {
            weakened.push(match lang {
                Lang::Zh => format!("{}：删去 {removed} 条断言，新增 {added} 条", f.path),
                Lang::En => {
                    format!("{}: removed {}, added {added}", f.path, plural(removed, "assertion", "assertions"))
                }
            });
        }
    }
    if !weakened.is_empty() {
        hits.push(hit("assertions_removed", 2, weakened.join("\n"), lang));
    }

    // Test cases removed from files that still exist, assertions that
    // cannot fail, and bodies cut short: each lets a failing test pass.
    let mut fewer_tests = Vec::new();
    let mut hollow = Vec::new();
    for f in files.iter().filter(|f| holds_tests(&f.path) && f.status == FileStatus::Modified) {
        let removed = removed_lines(f).filter(|l| starts_test(l)).count();
        let added = added_lines(f).filter(|l| starts_test(l)).count();
        if removed > added {
            let n = removed - added;
            fewer_tests.push(match lang {
                Lang::Zh => format!("{}：少了 {n} 个测试用例", f.path),
                Lang::En => format!("{}: {} fewer", f.path, plural(n, "test case", "test cases")),
            });
        }
    }
    for f in files.iter().filter(|f| is_test_path(&f.path)) {
        for line in added_lines(f) {
            if is_vacuous_assertion(line) || disables_body(line) {
                hollow.push(format!("{}: {}", f.path, line.trim()));
            }
        }
    }
    // An assertion kept as it was but expecting a different value: the
    // classic way to make a failing test pass without fixing the code.
    let mut expectations = Vec::new();
    for f in files.iter().filter(|f| holds_tests(&f.path) && f.status != FileStatus::Added) {
        for (old, new) in edited_pairs(f) {
            if !is_assertion(old) || !is_assertion(new) {
                continue;
            }
            let ((s1, l1), (s2, l2)) = (shape(old), shape(new));
            if s1 == s2 && l1 != l2 {
                expectations.push(format!("{}: {} → {}", f.path, old.trim(), new.trim()));
            }
        }
    }
    if !expectations.is_empty() {
        hits.push(hit("expectations_changed", HIGH, expectations.join("\n"), lang));
    }

    if !fewer_tests.is_empty() {
        hits.push(hit("tests_removed", HIGH, fewer_tests.join("\n"), lang));
    }
    if !hollow.is_empty() {
        hits.push(hit("tests_hollowed", 2, hollow.join("\n"), lang));
    }

    let mut test_command = Vec::new();
    for f in files.iter().filter(|f| f.path == "package.json" || f.path.ends_with("/package.json")) {
        for line in added_lines(f).chain(removed_lines(f)) {
            let t = line.trim_start();
            if t.starts_with("\"test") || t.starts_with("\"pretest") || t.starts_with("\"posttest") {
                test_command.push(format!("{}: {}", f.path, line.trim()));
            }
        }
    }
    // Expected outputs kept as data (fixtures, golden files): changing them
    // changes what the tests expect.
    let data: Vec<&str> = files
        .iter()
        .filter(|f| f.status == FileStatus::Modified && is_test_data(&f.path))
        .map(|f| f.path.as_str())
        .collect();
    if !data.is_empty() {
        hits.push(hit("test_data_changed", 2, data.join("\n"), lang));
    }

    // What the criteria themselves run: the scripts they name, the Makefile.
    let frozen = command_files(commands);
    for f in files.iter().filter(|f| f.status != FileStatus::Added) {
        let path = f.old_path.as_deref().unwrap_or(&f.path);
        if frozen.iter().any(|c| c == path || c == &f.path) && !test_command.iter().any(|t| t.starts_with(&f.path)) {
            test_command.push(f.path.clone());
        }
    }
    if !test_command.is_empty() {
        hits.push(hit("test_command_changed", HIGH, test_command.join("\n"), lang));
    }

    let harness: Vec<&str> = files.iter().filter(|f| is_test_harness(&f.path)).map(|f| f.path.as_str()).collect();
    if !harness.is_empty() {
        hits.push(hit("test_harness_changed", HIGH, harness.join("\n"), lang));
    }

    let configs: Vec<&str> = files
        .iter()
        .filter(|f| {
            let name = f.path.rsplit('/').next().unwrap_or(&f.path);
            TEST_CONFIGS.iter().any(|c| name.starts_with(c))
                || (matches!(name, "pyproject.toml" | "Cargo.toml")
                    && added_lines(f).chain(removed_lines(f)).any(|l| TEST_CONFIG_KEYS.iter().any(|k| l.contains(k))))
        })
        .map(|f| f.path.as_str())
        .collect();
    if !configs.is_empty() {
        // A manifest the source-only re-run keeps (Cargo.toml) is not
        // checked by it, so its test settings hold the goal.
        let kept = configs.iter().any(|p| crate::roles::role(p).kept_in_source_only_run(p));
        hits.push(hit("test_config_changed", if kept { HIGH } else { 2 }, configs.join("\n"), lang));
    }

    // Program code reaching into the assertion libraries, the runners or the
    // module loader: how a change can make tests pass without touching them.
    let mut machinery = Vec::new();
    let mut patches = Vec::new();
    for f in files
        .iter()
        .filter(|f| f.status != FileStatus::Deleted && crate::roles::role(&f.path) == crate::roles::Role::Source)
    {
        for line in added_lines(f) {
            if crate::roles::patches_test_machinery(line) {
                patches.push(format!("{}: {}", f.path, line.trim()));
            } else if crate::roles::touches_test_machinery(line).is_some() {
                machinery.push(format!("{}: {}", f.path, line.trim()));
            }
        }
    }
    // Changing it holds the goal, whatever the canary saw: a change can be
    // aimed at exactly the values the tests use.
    if !patches.is_empty() {
        hits.push(hit("source_patches_tests", HIGH, patches.join("\n"), lang));
    }
    if !machinery.is_empty() {
        hits.push(hit("source_touches_tests", 2, machinery.join("\n"), lang));
    }

    let snapshots: Vec<&str> = files
        .iter()
        .filter(|f| f.path.contains("__snapshots__") || f.path.ends_with(".snap"))
        .map(|f| f.path.as_str())
        .collect();
    if !snapshots.is_empty() {
        hits.push(hit("snapshots_changed", 2, snapshots.join("\n"), lang));
    }

    if let Some(fence) = fence {
        let outside: Vec<String> = files
            .iter()
            .filter_map(|f| match fence.check_write(&f.path) {
                WriteVerdict::Allowed => None,
                WriteVerdict::OutsideScope => {
                    Some(format!("{}{}", f.path, lang.pick("（围栏外）", " (outside the scope fence)")))
                }
                WriteVerdict::Excluded => {
                    Some(format!("{}{}", f.path, lang.pick("（合同排除）", " (excluded by the contract)")))
                }
                WriteVerdict::ReadOnly => Some(format!("{}{}", f.path, lang.pick("（只读）", " (read-only)"))),
            })
            .collect();
        if !outside.is_empty() {
            hits.push(hit("scope_violation", HIGH, outside.join("\n"), lang));
        }
    }

    hits
}

/// The literals the base's tests expect or feed in (quoted strings of two
/// or more characters, numbers of two or more digits), from assertion lines.
pub fn assertion_literals<'a>(lines: impl IntoIterator<Item = &'a str>) -> Vec<String> {
    let mut out: Vec<String> = Vec::new();
    for line in lines {
        if !is_assertion(line) {
            continue;
        }
        for lit in shape(line).1 {
            let digits = lit.chars().filter(char::is_ascii_digit).count();
            let numeric = lit.chars().all(|c| c.is_ascii_digit() || c == '.' || c == '_');
            let keep = if numeric { digits >= 2 } else { lit.chars().count() >= 2 && !lit.trim().is_empty() };
            if keep && !out.contains(&lit) {
                out.push(lit);
            }
            if out.len() >= 500 {
                return out;
            }
        }
    }
    out
}

/// Program code that branches on the very values the tests use: the shape
/// of a special case written to pass a known test rather than a fix.
/// `held_out` says whether held-out tests would have caught it.
/// Program code that loads the very assertion library the tests use: it
/// can then change what those tests' assertions do, in ways no canary
/// samples, so the goal is held for a look.
pub fn source_loads_test_library(files: &[DiffFile], test_lines: &[&str], lang: Lang) -> Option<SentinelHit> {
    const LIBRARIES: &[&[&str]] = &[
        &["node:assert", "'assert'", "\"assert\"", "'assert/strict'", "\"assert/strict\""],
        &["'chai'", "\"chai\""],
        &["'vitest'", "\"vitest\""],
        &["@jest/globals", "@jest/expect", "'expect'", "\"expect\""],
    ];
    let mut found = Vec::new();
    for tokens in LIBRARIES {
        if !test_lines.iter().any(|l| tokens.iter().any(|t| l.contains(t))) {
            continue;
        }
        for f in files
            .iter()
            .filter(|f| f.status != FileStatus::Deleted && crate::roles::role(&f.path) == crate::roles::Role::Source)
        {
            for line in added_lines(f) {
                let loads = line.contains("import") || line.contains("require(");
                if loads && tokens.iter().any(|t| line.contains(t)) {
                    found.push(format!("{}: {}", f.path, line.trim()));
                }
            }
        }
    }
    (!found.is_empty()).then(|| hit("source_loads_test_library", HIGH, found.join("\n"), lang))
}

/// Each assertion's literals as a case: the values it feeds in and the
/// value it expects (the last literal).
pub fn assertion_cases<'a>(lines: impl IntoIterator<Item = &'a str>) -> Vec<(Vec<String>, String)> {
    let mut out = Vec::new();
    for line in lines {
        if !is_assertion(line) {
            continue;
        }
        let mut lits = shape(line).1;
        let Some(expected) = lits.pop() else { continue };
        if !lits.is_empty() && !out.iter().any(|(i, e)| *i == lits && *e == expected) {
            out.push((lits, expected));
        }
        if out.len() >= 500 {
            break;
        }
    }
    out
}

pub fn special_cases(
    files: &[DiffFile],
    literals: &[String],
    cases: &[(Vec<String>, String)],
    held_out: bool,
    lang: Lang,
) -> Option<SentinelHit> {
    if literals.is_empty() && cases.is_empty() {
        return None;
    }
    let branches = |l: &str| {
        let t = l.trim_start();
        t.starts_with("if ")
            || t.starts_with("if(")
            || t.starts_with("elif ")
            || t.starts_with("case ")
            || t.starts_with("when ")
            || t.contains("===")
            || t.contains("==")
            || t.contains(" ? ")
    };
    let mut found = Vec::new();
    for f in files.iter().filter(|f| crate::roles::role(&f.path) == crate::roles::Role::Source) {
        for line in added_lines(f).filter(|l| branches(l)) {
            let numbers: Vec<String> = shape(line).1;
            let hit = literals.iter().any(|lit| {
                let numeric = lit.chars().all(|c| c.is_ascii_digit() || c == '.' || c == '_');
                if numeric {
                    numbers.contains(lit)
                } else {
                    [format!("\"{lit}\""), format!("'{lit}'"), format!("`{lit}`")]
                        .iter()
                        .any(|q| line.contains(q.as_str()))
                }
            });
            if hit {
                found.push(format!("{}: {}", f.path, line.trim()));
            }
            if found.len() >= 8 {
                break;
            }
        }
        // A lookup table: one line holding a case's inputs and the value it
        // expects together (`"2,3": 5`, `[2, 3, 5]`).
        for line in added_lines(f) {
            if found.iter().any(|x| x.ends_with(line.trim())) {
                continue;
            }
            let here = shape(line).1;
            let table = cases.iter().any(|(inputs, expected)| {
                let all = inputs.len() + 1;
                let small = inputs.iter().chain([expected]).all(|x| x.len() == 1);
                ((all >= 2 && !small) || all >= 3)
                    && here.contains(expected)
                    && inputs
                        .iter()
                        .all(|x| here.contains(x) || line.contains(&format!("{x},")) || line.contains(&format!(",{x}")))
                    && (line.contains(':') || line.contains("=>") || line.contains('['))
            });
            if table {
                found.push(format!("{}: {}", f.path, line.trim()));
            }
            if found.len() >= 8 {
                break;
            }
        }
        // Across lines, with small numbers too: a branch on a test's inputs
        // followed (within three lines) by the value that test expects.
        let added: Vec<&str> = added_lines(f).collect();
        for (i, line) in added.iter().enumerate() {
            if !branches(line) || found.iter().any(|x| x.ends_with(line.trim())) {
                continue;
            }
            let here = shape(line).1;
            let window: Vec<String> = added[i..(i + 4).min(added.len())].iter().flat_map(|l| shape(l).1).collect();
            let hit = cases.iter().any(|(inputs, expected)| {
                let matched = inputs.iter().filter(|x| here.contains(x)).count();
                let small = inputs.iter().chain([expected]).all(|x| x.len() == 1);
                let needed = if small { 2 } else { 1 };
                matched >= needed && window.contains(expected)
            });
            if hit {
                found.push(format!("{}: {}", f.path, line.trim()));
            }
            if found.len() >= 8 {
                break;
            }
        }
    }
    if found.is_empty() {
        return None;
    }
    let mut detail = found.join("\n");
    if !held_out {
        detail.push_str(lang.pick(
            "\n这个项目没有保留测试，可见测试之外没有东西能发现这种写法。",
            "\nThis project has no held-out tests, so nothing beyond the visible tests could catch it.",
        ));
    }
    Some(hit("special_cases_test_inputs", 2, detail, lang))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::view::{DiffLine, Hunk};

    fn file(path: &str, status: FileStatus, add: &[&str], del: &[&str]) -> DiffFile {
        let mut lines: Vec<DiffLine> = del
            .iter()
            .map(|t| DiffLine { kind: LineKind::Del, old_no: Some(1), new_no: None, text: (*t).into() })
            .collect();
        lines.extend(add.iter().map(|t| DiffLine {
            kind: LineKind::Add,
            old_no: None,
            new_no: Some(1),
            text: (*t).into(),
        }));
        DiffFile {
            path: path.into(),
            old_path: None,
            status,
            additions: add.len() as u32,
            deletions: del.len() as u32,
            binary: false,
            hunks: vec![Hunk { header: "@@".into(), lines }],
        }
    }

    fn ids(hits: &[SentinelHit]) -> Vec<&str> {
        hits.iter().map(|h| h.sentinel.as_str()).collect()
    }

    #[test]
    fn code_that_branches_on_the_tests_values_is_flagged() {
        let literals = assertion_literals([
            "  assert.equal(total([{ price: 17, qty: 3 }]), 51);",
            "expect(greet('Ada')).toBe('Hello, Ada')",
        ]);
        assert!(literals.contains(&"51".to_string()) && literals.contains(&"Hello, Ada".to_string()), "{literals:?}");
        let files = vec![
            file("src/cart.js", FileStatus::Modified, &["  if (items[0].price === 17) return 51;"], &[]),
            file("src/greet.js", FileStatus::Modified, &["  return 'Hello, ' + name;"], &[]),
        ];
        let hit = special_cases(&files, &literals, &[], false, Lang::En).expect("flagged");
        assert!(
            hit.detail.contains("src/cart.js") && !hit.detail.contains("greet") && hit.detail.contains("no held-out")
        );
        assert!(special_cases(&files[1..], &literals, &[], true, Lang::En).is_none());
        // Small numbers across lines: the inputs in the branch, the expected
        // value just below.
        let cases = assertion_cases(["  assert.equal(add(2, 3), 5);", "  assert.equal(fact(0), 1);"]);
        let over = vec![file(
            "src/add.js",
            FileStatus::Modified,
            &["  if (a === 2 && b === 3) {", "    return 5;", "  }"],
            &[],
        )];
        assert!(special_cases(&over, &[], &cases, true, Lang::En).is_some());
        // A lookup table keyed by the tests' inputs.
        let table = vec![file("src/add.js", FileStatus::Modified, &["const known = { '2,3': 5 };"], &[])];
        assert!(special_cases(&table, &[], &cases, true, Lang::En).is_some());
        // A base case of a recursion is not a special case.
        let honest =
            vec![file("src/fact.js", FileStatus::Modified, &["  if (n === 0) {", "    return 1;", "  }"], &[])];
        assert!(special_cases(&honest, &[], &cases, true, Lang::En).is_none());
    }

    #[test]
    fn program_code_loading_the_tests_assertion_library_is_held() {
        let tests = ["import assert from 'node:assert'", "  assert.equal(add(2, 3), 5)"];
        let src = vec![file("src/add.mjs", FileStatus::Modified, &["import assert from 'node:assert'"], &[])];
        let hit = source_loads_test_library(&src, &tests, Lang::En).expect("held");
        assert_eq!(hit.severity, HIGH);
        // A library the tests do not use is the program's own business.
        let other = vec![file("src/add.mjs", FileStatus::Modified, &["import { z } from 'zod'"], &[])];
        assert!(source_loads_test_library(&other, &tests, Lang::En).is_none());
        let vitest_tests = ["import { expect, it } from 'vitest'"];
        assert!(source_loads_test_library(&src, &vitest_tests, Lang::En).is_none());
    }

    #[test]
    fn honest_changes_raise_nothing() {
        let files = vec![
            file("src/cart.js", FileStatus::Modified, &["a * b"], &["a + b"]),
            file("test/cart.test.js", FileStatus::Modified, &["assert.equal(f(2), 4);"], &[]),
        ];
        assert!(scan(&files, &Scope::default(), Lang::En).is_empty());
    }

    /// A large change (200 files, 60 000 changed lines) stays well inside
    /// the time a verification takes. Generous bound: debug builds on CI.
    #[test]
    fn large_diffs_scan_quickly() {
        let add: Vec<String> = (0..150).map(|i| format!("  assert.equal(f({i}), {i});")).collect();
        let del: Vec<String> = (0..150).map(|i| format!("  expect(g({i})).toBe({i});")).collect();
        let add: Vec<&str> = add.iter().map(String::as_str).collect();
        let del: Vec<&str> = del.iter().map(String::as_str).collect();
        let files: Vec<DiffFile> =
            (0..200).map(|i| file(&format!("test/m{i}.test.js"), FileStatus::Modified, &add, &del)).collect();
        let t = std::time::Instant::now();
        let hits =
            scan(&files, &Scope { include: vec!["src/**".into(), "test/**".into()], ..Scope::default() }, Lang::En);
        let units = crate::review::build_units(&files, None, Lang::En);
        assert!(hits.is_empty() && !units.is_empty());
        assert!(t.elapsed() < std::time::Duration::from_secs(2), "took {:?}", t.elapsed());
    }

    #[test]
    fn quieter_ways_of_hiding_a_failure_are_caught() {
        let files = vec![
            // A failing case deleted from a file that stays.
            file(
                "test/cart.test.js",
                FileStatus::Modified,
                &["  assert.ok(true);"],
                &["test('discount', () => {", "  assert.equal(total([], 5), 0);", "});"],
            ),
            file("tests/test_api.py", FileStatus::Modified, &["    assert True", "@pytest.mark.xfail"], &[]),
            file("src/x_test.go", FileStatus::Modified, &["\tt.SkipNow()"], &[]),
            file("test/a.test.js", FileStatus::Modified, &["test('a', { skip: true }, () => {", "  return;"], &[]),
        ];
        let hits = scan(&files, &Scope::default(), Lang::En);
        assert_eq!(ids(&hits), ["test_skipped", "assertions_removed", "tests_removed", "tests_hollowed"]);
        let skipped = &hits[0].detail;
        assert!(
            skipped.contains("xfail") && skipped.contains("SkipNow") && skipped.contains("skip: true"),
            "{skipped}"
        );
        assert!(hits[3].detail.contains("assert.ok(true)") && hits[3].detail.contains("assert True"));
        assert!(hits[3].detail.contains("return;"));
    }

    #[test]
    fn hiding_a_failure_is_caught() {
        let files = vec![
            file("test/old.test.js", FileStatus::Deleted, &[], &["test('x', () => {})"]),
            file("test/cart.test.js", FileStatus::Modified, &["test.skip('total', () => {"], &[]),
            file(
                "package.json",
                FileStatus::Modified,
                &[r#"    "test": "echo ok""#],
                &[r#"    "test": "node --test""#],
            ),
        ];
        let hits = scan(&files, &Scope::default(), Lang::En);
        assert_eq!(ids(&hits), ["test_deleted", "test_skipped", "test_command_changed"]);
        assert!(hits.iter().all(|h| h.severity == HIGH));
        assert_eq!(hits[0].title, "Deleted test files");
        assert_eq!(scan(&files, &Scope::default(), Lang::Zh)[0].title, "删除了测试文件");
    }

    #[test]
    fn removed_assertions_and_scope_violations() {
        let scope = Scope { include: vec!["src/**".into(), "test/**".into()], ..Default::default() };
        let files = vec![
            file("test/a.test.js", FileStatus::Modified, &[], &["  assert.equal(x, 1);"]),
            file("README.md", FileStatus::Modified, &["hi"], &[]),
        ];
        let hits = scan(&files, &scope, Lang::En);
        assert_eq!(ids(&hits), ["assertions_removed", "scope_violation"]);
        assert_eq!(hits[0].detail, "test/a.test.js: removed 1 assertion, added 0");
        assert_eq!(hits[1].detail, "README.md (outside the scope fence)");
        let zh = scan(&files, &scope, Lang::Zh);
        assert_eq!(zh[0].detail, "test/a.test.js：删去 1 条断言，新增 0 条");
        assert_eq!(zh[1].detail, "README.md（围栏外）");
    }

    #[test]
    fn every_sentinel_has_a_title_in_both_languages() {
        for id in [
            "test_deleted",
            "test_skipped",
            "assertions_removed",
            "test_command_changed",
            "test_config_changed",
            "snapshots_changed",
            "scope_violation",
        ] {
            for lang in Lang::ALL {
                assert!(sentinel_title(id, lang).is_some(), "{id} {lang:?}");
            }
        }
    }
}
