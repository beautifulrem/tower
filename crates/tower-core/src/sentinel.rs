//! Sentinels (`docs/07` §7.5): checks on the verified snapshot for things a
//! passing test run would hide. An agent that deletes the failing test,
//! marks it skipped or rewrites the test command can make every criterion
//! pass; the verifier alone cannot tell. Sentinels look at the diff instead.
//!
//! Severity 3 blocks review until a human overrides; 2 is shown in review.

use serde::{Deserialize, Serialize};
use ts_rs::TS;

use crate::contract::{Scope, ScopeFence, WriteVerdict};
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
    "@Disabled",
    "@Ignore",
];

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

/// Runs every sentinel over the diff between base and the verified pin.
pub fn scan(files: &[DiffFile], scope: &Scope) -> Vec<SentinelHit> {
    let mut hits = Vec::new();
    let fence = ScopeFence::compile(scope).ok();

    let deleted_tests: Vec<&str> = files
        .iter()
        .filter(|f| f.status == FileStatus::Deleted && is_test_path(&f.path))
        .map(|f| f.path.as_str())
        .collect();
    if !deleted_tests.is_empty() {
        hits.push(SentinelHit {
            sentinel: "test_deleted".into(),
            severity: HIGH,
            title: "删除了测试文件".into(),
            detail: deleted_tests.join("\n"),
        });
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
        hits.push(SentinelHit {
            sentinel: "test_skipped".into(),
            severity: HIGH,
            title: "新增了跳过或只运行部分测试的标记".into(),
            detail: skips.join("\n"),
        });
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
        let added = added_lines(f).filter(|l| is_assert(l)).count();
        if removed > 0 && added < removed {
            weakened.push(format!("{}：删去 {removed} 条断言，新增 {added} 条", f.path));
        }
    }
    if !weakened.is_empty() {
        hits.push(SentinelHit {
            sentinel: "assertions_removed".into(),
            severity: 2,
            title: "测试中的断言变少了".into(),
            detail: weakened.join("\n"),
        });
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
        hits.push(SentinelHit {
            sentinel: "test_command_changed".into(),
            severity: HIGH,
            title: "修改了测试命令".into(),
            detail: test_command.join("\n"),
        });
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
        hits.push(SentinelHit {
            sentinel: "test_config_changed".into(),
            severity: 2,
            title: "修改了测试配置".into(),
            detail: configs.join("\n"),
        });
    }

    let snapshots: Vec<&str> = files
        .iter()
        .filter(|f| f.path.contains("__snapshots__") || f.path.ends_with(".snap"))
        .map(|f| f.path.as_str())
        .collect();
    if !snapshots.is_empty() {
        hits.push(SentinelHit {
            sentinel: "snapshots_changed".into(),
            severity: 2,
            title: "更新了测试快照".into(),
            detail: snapshots.join("\n"),
        });
    }

    if let Some(fence) = fence {
        let outside: Vec<String> = files
            .iter()
            .filter_map(|f| match fence.check_write(&f.path) {
                WriteVerdict::Allowed => None,
                WriteVerdict::OutsideScope => Some(format!("{}（围栏外）", f.path)),
                WriteVerdict::Excluded => Some(format!("{}（合同排除）", f.path)),
                WriteVerdict::ReadOnly => Some(format!("{}（只读）", f.path)),
            })
            .collect();
        if !outside.is_empty() {
            hits.push(SentinelHit {
                sentinel: "scope_violation".into(),
                severity: HIGH,
                title: "改动超出了合同的范围".into(),
                detail: outside.join("\n"),
            });
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
        assert!(scan(&files, &Scope::default()).is_empty());
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
        let hits = scan(&files, &Scope::default());
        assert_eq!(ids(&hits), ["test_deleted", "test_skipped", "test_command_changed"]);
        assert!(hits.iter().all(|h| h.severity == HIGH));
    }

    #[test]
    fn removed_assertions_and_scope_violations() {
        let scope = Scope { include: vec!["src/**".into(), "test/**".into()], ..Default::default() };
        let files = vec![
            file("test/a.test.js", FileStatus::Modified, &[], &["  assert.equal(x, 1);"]),
            file("README.md", FileStatus::Modified, &["hi"], &[]),
        ];
        let hits = scan(&files, &scope);
        assert_eq!(ids(&hits), ["assertions_removed", "scope_violation"]);
    }
}
