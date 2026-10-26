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

pub fn is_test_path(path: &str) -> bool {
    let p = path.to_ascii_lowercase();
    let name = p.rsplit('/').next().unwrap_or(&p);
    p.starts_with("test/")
        || p.starts_with("tests/")
        || p.contains("/test/")
        || p.contains("/tests/")
        || p.contains("__tests__")
        || p.starts_with("spec/")
        || p.starts_with("testdata/")
        || p.contains("/testdata/")
        || p.contains("fixtures/")
        || p.contains("__snapshots__/")
        || p.contains("/golden/")
        || name.ends_with(".golden")
        || name.contains(".test.")
        || name.contains(".spec.")
        || name.starts_with("test_")
        || name.ends_with("_test.go")
        || name.ends_with("_test.py")
        || name.ends_with("_test.rs")
}

/// Test inputs and expected outputs kept as data.
fn is_test_data(path: &str) -> bool {
    let p = path.to_ascii_lowercase();
    p.starts_with("testdata/")
        || p.contains("/testdata/")
        || p.contains("fixtures/")
        || p.contains("/golden/")
        || p.ends_with(".golden")
}

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

const TEST_CONFIGS: &[&str] = &[
    "jest.config",
    "vitest.config",
    "vite.config",
    "playwright.config",
    "karma.conf",
    ".mocharc",
    "pytest.ini",
    "conftest.py",
    "setup.cfg",
    "tox.ini",
    "phpunit.xml",
];

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
    while let Some(c) = chars.next() {
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
        } else if c.is_ascii_digit() && !shape.ends_with(|p: char| p.is_alphanumeric() || p == '_') {
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
        hits.push(hit("test_config_changed", 2, configs.join("\n"), lang));
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
