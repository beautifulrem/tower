//! The must-fail canary (`docs/07` §7.6).
//!
//! A test that cannot pass is added to the end of each JavaScript,
//! TypeScript and Python test file in the verification checkout, written
//! with the file's own runner and assertion library, and the criteria that
//! proved the change (red on the base, or held-out) run once more. When the
//! canary ran — it leaves a marker file — and the command still reported
//! success, something made failing assertions pass: the assertion library,
//! the runner or the reporting was altered at run time, and none of that
//! run's passes are evidence.
//!
//! When the canary did not run (a command that selects tests by name, a
//! runner that does not see the file, another language) the check says
//! nothing either way.

use std::path::{Path, PathBuf};

/// One planted canary: the marker its tests write when they run.
pub struct Canary {
    pub marker: PathBuf,
    pub files: Vec<String>,
}

impl Canary {
    /// Whether a canary test ran since the marker was last cleared.
    pub fn ran(&self) -> bool {
        self.marker.exists()
    }

    pub fn clear(&self) {
        let _ = std::fs::remove_file(&self.marker);
    }
}

/// Appends the canary to every test file of `candidates` (paths relative to
/// `dir`) it knows how to write one for. `marker_dir` must be writable from
/// inside the verifier's sandbox.
pub fn plant(dir: &Path, candidates: &[String], marker_dir: &Path) -> std::io::Result<Canary> {
    let token = uuid::Uuid::new_v4().simple().to_string();
    let marker = marker_dir.join(format!("tower-canary-{token}"));
    let mut files = Vec::new();
    for path in candidates {
        if tower_core::roles::role(path) != tower_core::roles::Role::Test {
            continue;
        }
        let full = dir.join(path);
        let Ok(text) = std::fs::read_to_string(&full) else { continue };
        let Some(snippet) = snippet(path, &text, &marker, &token) else { continue };
        let mut out = text;
        if !out.ends_with('\n') {
            out.push('\n');
        }
        out.push_str(&snippet);
        tower_git::write_inside(dir, path, out.as_bytes())?;
        files.push(path.clone());
    }
    Ok(Canary { marker, files })
}

/// The canary for one file, in its own language, runner and assertion
/// style; `None` when the file gives no safe way to write one.
fn snippet(path: &str, text: &str, marker: &Path, token: &str) -> Option<String> {
    let marker = marker.to_str()?;
    if marker.contains(['"', '\'', '\\', '\n']) {
        return None;
    }
    let ext = path.rsplit('.').next().unwrap_or("");
    match ext {
        "js" | "mjs" | "cjs" | "jsx" | "ts" | "mts" | "cts" | "tsx" => {
            // The runner function and assertion the file itself uses, so
            // the canary goes through the same (possibly altered) code.
            let runner = if text.contains("test(") {
                "test"
            } else if text.contains("it(") {
                "it"
            } else {
                return None;
            };
            let assertion = if text.contains("expect(") {
                "const e = expect(1); if (e.toBe) e.toBe(2); else e.to.equal(2);"
            } else if text.contains("assert.") || text.contains("assert(") {
                "if (assert.strictEqual) assert.strictEqual(1, 2); else assert(1 === 2);"
            } else {
                return None;
            };
            let global = if matches!(ext, "ts" | "mts" | "cts" | "tsx") { "(globalThis as any)" } else { "globalThis" };
            Some(format!(
                "\n;{runner}(\"tower canary {token}\", () => {{ {global}.process?.getBuiltinModule?.(\"node:fs\")?.writeFileSync(\"{marker}\", \"\"); {assertion} }});\n"
            ))
        }
        "py" => {
            let mut s = format!(
                "\n\ndef test_tower_canary_{token}():\n    open(\"{marker}\", \"w\").close()\n    assert 1 == 2, \"tower canary\"\n"
            );
            if text.contains("unittest") {
                s.push_str(&format!(
                    "\n\nimport unittest as _tower_canary_unittest\n\n\nclass TowerCanary{token}(_tower_canary_unittest.TestCase):\n    def test_canary(self):\n        open(\"{marker}\", \"w\").close()\n        self.assertEqual(1, 2)\n"
                ));
            }
            Some(s)
        }
        _ => None,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn canaries_follow_the_files_own_style() {
        let m = Path::new("/tmp/m");
        let vitest =
            snippet("src/a.test.ts", "import { it, expect } from 'vitest'\nit('x', () => expect(1).toBe(1))", m, "t")
                .unwrap();
        assert!(vitest.contains(";it(\"tower canary t\"") && vitest.contains("e.toBe(2)") && vitest.contains("as any"));
        let node = snippet(
            "test/a.test.mjs",
            "import test from 'node:test'\nimport assert from 'node:assert'\ntest('x', () => assert.equal(1, 1))",
            m,
            "t",
        )
        .unwrap();
        assert!(node.contains(";test(") && node.contains("assert.strictEqual(1, 2)") && !node.contains("as any"));
        let py = snippet("tests/test_a.py", "import unittest\nclass T(unittest.TestCase): pass", m, "t").unwrap();
        assert!(py.contains("def test_tower_canary_t") && py.contains("self.assertEqual(1, 2)"));
        assert!(snippet("tests/test_a.py", "def test_x(): assert True", m, "t").unwrap().contains("assert 1 == 2"));
        // No runner or assertion it recognises, another language: no canary.
        assert!(snippet("test/a.test.js", "describe('x')", m, "t").is_none());
        assert!(snippet("tests/a_test.go", "func TestX(t *testing.T) {}", m, "t").is_none());
    }

    #[test]
    fn a_planted_canary_fails_under_node_test_and_reports_running() {
        // `process.getBuiltinModule` arrived in Node 22.3.
        let probe =
            std::process::Command::new("node").args(["-e", "process.exit(process.getBuiltinModule ? 0 : 1)"]).status();
        if !probe.is_ok_and(|s| s.success()) {
            return;
        }
        let tmp = tempfile::tempdir().unwrap();
        let dir = std::fs::canonicalize(tmp.path()).unwrap();
        std::fs::create_dir_all(dir.join("test")).unwrap();
        std::fs::write(
            dir.join("test/a.test.mjs"),
            "import test from 'node:test'\nimport assert from 'node:assert'\ntest('x', () => assert.equal(1, 1))\n",
        )
        .unwrap();
        let c = plant(&dir, &["test/a.test.mjs".into()], &dir).unwrap();
        assert_eq!(c.files, ["test/a.test.mjs"]);
        let status =
            std::process::Command::new("node").args(["--test", "test/a.test.mjs"]).current_dir(&dir).output().unwrap();
        assert!(!status.status.success(), "the canary must fail an honest run");
        assert!(c.ran());

        // An assertion library altered at run time: the canary passes.
        std::fs::write(
            dir.join("test/a.test.mjs"),
            "import test from 'node:test'\nimport assert from 'node:assert'\nassert.strictEqual = () => {}\n\
             test('x', () => assert.equal(1, 1))\n",
        )
        .unwrap();
        let c = plant(&dir, &["test/a.test.mjs".into()], &dir).unwrap();
        let status =
            std::process::Command::new("node").args(["--test", "test/a.test.mjs"]).current_dir(&dir).output().unwrap();
        assert!(status.status.success() && c.ran(), "tampering shows as a passing canary");
    }
}
