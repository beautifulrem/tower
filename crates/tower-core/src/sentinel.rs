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
        || name.contains(".test.")
        || name.contains(".spec.")
        || name.starts_with("test_")
        || name.ends_with("_test.go")
        || name.ends_with("_test.py")
        || name.ends_with("_test.rs")
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
    let mut hits = Vec::new();
    let fence = ScopeFence::compile(scope).ok();

    let deleted_tests: Vec<&str> = files
        .iter()
        .filter(|f| f.status == FileStatus::Deleted && is_test_path(&f.path))
        .map(|f| f.path.as_str())
        .collect();
    if !deleted_tests.is_empty() {
        hits.push(hit("test_deleted", HIGH, deleted_tests.join("\n"), lang));
    }

    let mut skips = Vec::new();
    for f in files.iter().filter(|f| is_test_path(&f.path)) {
        for line in added_lines(f) {
            if SKIP_MARKERS.iter().any(|m| line.contains(m)) {
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
    for f in files.iter().filter(|f| is_test_path(&f.path) && f.status == FileStatus::Modified) {
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
    for f in files.iter().filter(|f| is_test_path(&f.path) && f.status == FileStatus::Modified) {
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
    if !test_command.is_empty() {
        hits.push(hit("test_command_changed", HIGH, test_command.join("\n"), lang));
    }

    let configs: Vec<&str> = files
        .iter()
        .filter(|f| {
            let name = f.path.rsplit('/').next().unwrap_or(&f.path);
            TEST_CONFIGS.iter().any(|c| name.starts_with(c))
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
