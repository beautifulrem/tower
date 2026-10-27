//! The must-fail canary (`docs/07` §7.6).
//!
//! Tests that cannot pass are added to each JavaScript, TypeScript and
//! Python test file in the verification checkout — one per assertion the
//! file itself uses (`assert.equal`, `expect(…).toBe`, `self.assertEqual`,
//! a bare `assert`, …), written with the file's own runner, so each goes
//! through the same, possibly altered, code as the real tests. Each canary
//! leaves a marker when it starts and another if its assertion did *not*
//! throw. The criteria that proved the change (red on the base, or
//! held-out) then run once more:
//!
//! - an assertion that did not throw means assertions were altered at run
//!   time, whatever the command reports;
//! - a canary that ran while the command still reported success means the
//!   runner or its reporting was altered.
//!
//! Either way none of that run's passes are evidence. Test files written as
//! plain scripts get the same checks at their end. When no canary ran (a
//! command that selects tests by name, another language) the result says
//! "not checked" rather than nothing.

use std::path::{Path, PathBuf};

/// The planted canaries: where their markers go and which files hold them.
pub struct Canary {
    ran: PathBuf,
    survived: PathBuf,
    pub files: Vec<String>,
}

/// What one run of a criterion showed.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Verdict {
    /// No canary ran: nothing is known about the assertions.
    NotChecked,
    /// The canaries ran and failed as they must.
    Intact,
    /// An assertion that cannot pass did not throw, or the run reported
    /// success with failing canaries in it.
    Tampered,
}

impl Canary {
    pub fn clear(&self) {
        let _ = std::fs::remove_file(&self.ran);
        let _ = std::fs::remove_file(&self.survived);
    }

    /// The verdict for a run that ended with `passed`.
    pub fn verdict(&self, passed: bool) -> Verdict {
        let ran = self.ran.exists();
        if self.survived.exists() || (ran && passed) {
            Verdict::Tampered
        } else if ran {
            Verdict::Intact
        } else {
            Verdict::NotChecked
        }
    }
}

/// Appends canaries to every test file of `candidates` (paths relative to
/// `dir`) it knows how to write them for. `marker_dir` must be writable
/// from inside the verifier's sandbox.
pub fn plant(dir: &Path, candidates: &[String], marker_dir: &Path) -> std::io::Result<Canary> {
    let token = uuid::Uuid::new_v4().simple().to_string();
    let ran = marker_dir.join(format!("tower-canary-{token}-ran"));
    let survived = marker_dir.join(format!("tower-canary-{token}-survived"));
    let mut files = Vec::new();
    for path in candidates {
        if tower_core::roles::role(path) != tower_core::roles::Role::Test {
            continue;
        }
        let full = dir.join(path);
        let Ok(text) = std::fs::read_to_string(&full) else { continue };
        let Some(snippet) = snippet(path, &text, &ran, &survived, &token) else { continue };
        // The tests' own assertions too, each expecting something else.
        let mut out = mutate(path, &text, &ran, &survived).unwrap_or(text);
        if !out.ends_with('\n') {
            out.push('\n');
        }
        out.push_str(&snippet);
        tower_git::write_inside(dir, path, out.as_bytes())?;
        files.push(path.clone());
    }
    Ok(Canary { ran, survived, files })
}

/// Assertion calls whose expected value is the last literal in them and
/// that must fail when it changes (exact equality only).
const MUTABLE_JS: &[&str] = &["assert.equal(", "assert.strictEqual(", "assert.deepEqual(", "assert.deepStrictEqual("];
const MUTABLE_MATCHERS: &[&str] = &[".toBe(", ".toEqual(", ".toStrictEqual("];
/// Matchers that make equality loose: changing a literal inside them can
/// still pass.
const LOOSE: &[&str] = &["expect.any", "Containing", "stringMatching", "closeTo", "anything", ".not.", "${"];

/// The tests' own assertions with their expected values changed, each
/// followed by a marker that is written only if it did not throw: an
/// assertion that accepts a wrong expected value has been altered, even
/// if the alteration is aimed at the values the tests use. At most 20 per
/// file; only exact equalities on one line, nothing loose.
fn mutate(path: &str, text: &str, ran: &Path, survived: &Path) -> Option<String> {
    let (ran, survived) = (ran.to_str()?, survived.to_str()?);
    if [ran, survived].iter().any(|m| m.contains(['"', '\'', '\\', '\n'])) {
        return None;
    }
    let ext = path.rsplit('.').next().unwrap_or("");
    let js = matches!(ext, "js" | "mjs" | "cjs" | "jsx" | "ts" | "mts" | "cts" | "tsx");
    let py = ext == "py";
    if !js && !py {
        return None;
    }
    let global = if matches!(ext, "ts" | "mts" | "cts" | "tsx") { "(globalThis as any)" } else { "globalThis" };
    let mut changed = 0;
    let mut out = String::with_capacity(text.len() + 1024);
    for line in text.split_inclusive('\n') {
        let (body, nl) = line.strip_suffix('\n').map_or((line, ""), |b| (b, "\n"));
        let next = if changed >= 20 || LOOSE.iter().any(|l| body.contains(l)) {
            None
        } else if js {
            mutate_js(body, global, ran, survived)
        } else {
            mutate_py(body, ran, survived)
        };
        match next {
            Some(m) => {
                changed += 1;
                out.push_str(&m);
            }
            None => out.push_str(body),
        }
        out.push_str(nl);
    }
    (changed > 0).then_some(out)
}

/// The end (exclusive) of the call whose `(` is at `open`, or `None` if it
/// does not close on this line (strings are skipped).
fn close_of(s: &str, open: usize) -> Option<usize> {
    let b = s.as_bytes();
    let (mut depth, mut i, mut quote) = (0i32, open, 0u8);
    while i < b.len() {
        let c = b[i];
        if quote != 0 {
            if c == b'\\' {
                i += 1;
            } else if c == quote {
                quote = 0;
            }
        } else if c == b'"' || c == b'\'' || c == b'`' {
            quote = c;
        } else if c == b'(' || c == b'[' || c == b'{' {
            depth += 1;
        } else if c == b')' || c == b']' || c == b'}' {
            depth -= 1;
            if depth == 0 {
                return Some(i + 1);
            }
        }
        i += 1;
    }
    None
}

/// The last literal (number or quoted string) in `s`, as a byte range.
fn last_literal(s: &str) -> Option<(usize, usize)> {
    let b = s.as_bytes();
    let mut found = None;
    let mut i = 0;
    while i < b.len() {
        let c = b[i];
        if c == b'"' || c == b'\'' {
            let start = i;
            i += 1;
            while i < b.len() && b[i] != c {
                if b[i] == b'\\' {
                    i += 1;
                }
                i += 1;
            }
            found = Some((start, (i + 1).min(b.len())));
        } else if c.is_ascii_digit()
            && (i == 0 || !(b[i - 1].is_ascii_alphanumeric() || b[i - 1] == b'_' || b[i - 1] == b'.'))
        {
            let start = i;
            while i < b.len() && (b[i].is_ascii_digit() || b[i] == b'.' || b[i] == b'_') {
                i += 1;
            }
            found = Some((start, i));
            continue;
        }
        i += 1;
    }
    found
}

/// `lit` changed so it cannot equal what it equalled.
fn changed_literal(lit: &str) -> Option<String> {
    if let Some(q) = lit.chars().next().filter(|c| *c == '"' || *c == '\'') {
        let inner = lit.strip_prefix(q)?.strip_suffix(q)?;
        return Some(format!("{q}{inner}_tower_changed{q}"));
    }
    let clean = lit.replace('_', "");
    match clean.parse::<i64>() {
        Ok(n) => Some((n + 1).to_string()),
        Err(_) => clean.parse::<f64>().ok().map(|f| format!("{}", f + 1.0)),
    }
}

fn mutate_js(line: &str, global: &str, ran: &str, survived: &str) -> Option<String> {
    // The assertion call: `assert.equal(...)` or `expect(...).toBe(...)`.
    let (start, end, args_from) = if let Some(m) = MUTABLE_JS.iter().find_map(|m| line.find(m).map(|i| (i, m.len()))) {
        let open = m.0 + m.1 - 1;
        (m.0, close_of(line, open)?, open)
    } else {
        let s = line.find("expect(")?;
        let after = close_of(line, s + "expect(".len() - 1)?;
        let rest = &line[after..];
        let m = MUTABLE_MATCHERS.iter().find(|m| rest.starts_with(**m))?;
        let open = after + m.len() - 1;
        (s, close_of(line, open)?, open)
    };
    let (ls, le) = last_literal(&line[args_from..end])?;
    let (ls, le) = (args_from + ls, args_from + le);
    let new = changed_literal(&line[ls..le])?;
    let call = format!("{}{new}{}", &line[start..ls], &line[le..end]);
    let mark = |p: &str| format!("{global}.process?.getBuiltinModule?.(\"node:fs\")?.writeFileSync(\"{p}\", \"\")");
    Some(format!("{}({}, {call}, {}){}", &line[..start], mark(ran), mark(survived), &line[end..]))
}

fn mutate_py(line: &str, ran: &str, survived: &str) -> Option<String> {
    let t = line.trim_start();
    let indent = &line[..line.len() - t.len()];
    let mark = format!("open(\"{survived}\", \"w\").close()");
    let mark_ran = format!("open(\"{ran}\", \"w\").close()");
    let ends_cleanly = !t.ends_with('\\') && !t.ends_with(',') && !t.contains('#');
    if !ends_cleanly {
        return None;
    }
    if let Some(cond) = t.strip_prefix("assert ") {
        // `assert <expr> == <literal>` and nothing else on the line.
        let (left, right) = cond.rsplit_once(" == ")?;
        let right = right.trim();
        if [" or ", " and ", " not ", " in ", ","].iter().any(|k| left.contains(k) || right.contains(k)) {
            return None;
        }
        let (ls, le) = last_literal(right).filter(|(s, e)| *s == 0 && *e == right.len())?;
        let new = changed_literal(&right[ls..le])?;
        return Some(format!("{indent}{mark_ran}; assert {left} == {new}; {mark}"));
    }
    if t.starts_with("self.assertEqual(") && t.ends_with(')') {
        let open = "self.assertEqual(".len() - 1;
        let end = close_of(t, open)?;
        if end != t.len() {
            return None;
        }
        let (ls, le) = last_literal(&t[open..end])?;
        let (ls, le) = (open + ls, open + le);
        let new = changed_literal(&t[ls..le])?;
        return Some(format!("{indent}{mark_ran}; {}{new}{}; {mark}", &t[..ls], &t[le..]));
    }
    None
}

/// `assert.<method>` calls that cannot pass, by method (node:assert and
/// chai's assert).
const ASSERT_JS: &[(&str, &str)] = &[
    ("equal", "(1, 2)"),
    ("strictEqual", "(1, 2)"),
    ("deepEqual", "({ a: 1 }, { a: 2 })"),
    ("deepStrictEqual", "({ a: 1 }, { a: 2 })"),
    ("notEqual", "(1, 1)"),
    ("notStrictEqual", "(1, 1)"),
    ("notDeepEqual", "({ a: 1 }, { a: 1 })"),
    ("notDeepStrictEqual", "({ a: 1 }, { a: 1 })"),
    ("ok", "(false)"),
    ("match", "(\"a\", /b/)"),
    ("doesNotMatch", "(\"a\", /a/)"),
    ("throws", "(() => {})"),
    ("doesNotThrow", "(() => { throw new Error(\"tower canary\"); })"),
    ("fail", "(\"tower canary\")"),
    ("ifError", "(new Error(\"tower canary\"))"),
    ("isTrue", "(false)"),
    ("isFalse", "(true)"),
    ("isOk", "(false)"),
    ("isNotOk", "(true)"),
    ("isNull", "(1)"),
    ("isNotNull", "(null)"),
    ("isUndefined", "(1)"),
    ("isDefined", "(undefined)"),
    ("include", "([1], 2)"),
    ("lengthOf", "([], 1)"),
    ("closeTo", "(1, 5, 0.1)"),
    ("sameMembers", "([1], [2])"),
    ("property", "({}, \"tower\")"),
    ("typeOf", "(1, \"string\")"),
];

/// `expect(…).<matcher>` calls that cannot pass (Jest, Vitest).
const EXPECT_JS: &[(&str, &str)] = &[
    ("toBe", "expect(1).toBe(2)"),
    ("toEqual", "expect({ a: 1 }).toEqual({ a: 2 })"),
    ("toStrictEqual", "expect({ a: 1 }).toStrictEqual({ a: 2 })"),
    ("toBeTruthy", "expect(0).toBeTruthy()"),
    ("toBeFalsy", "expect(1).toBeFalsy()"),
    ("toBeNull", "expect(1).toBeNull()"),
    ("toBeUndefined", "expect(1).toBeUndefined()"),
    ("toBeDefined", "expect(undefined).toBeDefined()"),
    ("toContain", "expect([1]).toContain(2)"),
    ("toContainEqual", "expect([{ a: 1 }]).toContainEqual({ a: 2 })"),
    ("toMatch", "expect(\"a\").toMatch(/b/)"),
    ("toHaveLength", "expect([]).toHaveLength(9)"),
    ("toBeGreaterThan", "expect(1).toBeGreaterThan(5)"),
    ("toBeGreaterThanOrEqual", "expect(1).toBeGreaterThanOrEqual(5)"),
    ("toBeLessThan", "expect(5).toBeLessThan(1)"),
    ("toBeLessThanOrEqual", "expect(5).toBeLessThanOrEqual(1)"),
    ("toBeCloseTo", "expect(1).toBeCloseTo(5)"),
    ("toHaveProperty", "expect({}).toHaveProperty(\"tower\")"),
    ("toThrow", "expect(() => {}).toThrow()"),
    ("toBeInstanceOf", "expect(1).toBeInstanceOf(Array)"),
    ("toMatchObject", "expect({}).toMatchObject({ a: 1 })"),
    ("toBeNaN", "expect(1).toBeNaN()"),
    // Chai's chains.
    (".to.equal(", "expect(1).to.equal(2)"),
    (".to.eql(", "expect({ a: 1 }).to.eql({ a: 2 })"),
    (".to.deep.equal(", "expect({ a: 1 }).to.deep.equal({ a: 2 })"),
    (".to.include(", "expect([1]).to.include(2)"),
    (".to.be.true", "expect(false).to.be.true"),
    (".to.be.ok", "expect(0).to.be.ok"),
];

/// unittest's `self.assert…` calls that cannot pass.
const ASSERT_PY: &[(&str, &str)] = &[
    ("assertEqual", "(1, 2)"),
    ("assertNotEqual", "(1, 1)"),
    ("assertTrue", "(False)"),
    ("assertFalse", "(True)"),
    ("assertIn", "(2, [1])"),
    ("assertNotIn", "(1, [1])"),
    ("assertIs", "(1, None)"),
    ("assertIsNone", "(1)"),
    ("assertIsNotNone", "(None)"),
    ("assertAlmostEqual", "(1, 5)"),
    ("assertGreater", "(1, 5)"),
    ("assertLess", "(5, 1)"),
    ("assertCountEqual", "([1], [2])"),
    ("assertRegex", "(\"a\", \"b\")"),
    ("assertDictEqual", "({}, {\"a\": 1})"),
    ("assertListEqual", "([], [1])"),
];

/// The failing assertions a JavaScript file's own calls call for.
fn js_assertions(text: &str) -> Vec<String> {
    let mut out = Vec::new();
    for (method, args) in ASSERT_JS {
        if text.contains(&format!("assert.{method}(")) {
            out.push(format!("assert.{method}{args}"));
        }
    }
    if out.is_empty() && text.contains("assert(") {
        out.push("assert(false)".into());
    }
    if text.contains("expect(") {
        for (matcher, call) in EXPECT_JS {
            let used = if matcher.starts_with('.') {
                text.contains(matcher)
            } else {
                text.contains(&format!(".{matcher}(")) || text.contains(&format!(".{matcher}()"))
            };
            if used {
                out.push((*call).to_string());
            }
        }
        if text.contains(".not.toBe(") {
            out.push("expect(1).not.toBe(1)".into());
        }
        if !out.iter().any(|a| a.starts_with("expect(")) {
            out.push("expect(1).toBe(2)".into());
        }
    }
    out.truncate(12);
    out
}

fn py_assertions(text: &str) -> Vec<String> {
    let mut out = Vec::new();
    for (method, args) in ASSERT_PY {
        if text.contains(&format!("self.{method}(")) {
            out.push(format!("self.{method}{args}"));
        }
    }
    out.truncate(12);
    out
}

/// The canaries for one file, in its own language, runner and assertion
/// style; `None` when the file gives no safe way to write them.
fn snippet(path: &str, text: &str, ran: &Path, survived: &Path, token: &str) -> Option<String> {
    let (ran, survived) = (ran.to_str()?, survived.to_str()?);
    if [ran, survived].iter().any(|m| m.contains(['"', '\'', '\\', '\n'])) {
        return None;
    }
    let ext = path.rsplit('.').next().unwrap_or("");
    match ext {
        "js" | "mjs" | "cjs" | "jsx" | "ts" | "mts" | "cts" | "tsx" => {
            let assertions = js_assertions(text);
            if assertions.is_empty() {
                return None;
            }
            let global = if matches!(ext, "ts" | "mts" | "cts" | "tsx") { "(globalThis as any)" } else { "globalThis" };
            let mark =
                |p: &str| format!("{global}.process?.getBuiltinModule?.(\"node:fs\")?.writeFileSync(\"{p}\", \"\");");
            let (mark_ran, mark_survived) = (mark(ran), mark(survived));
            let runner = if text.contains("test(") {
                Some("test")
            } else if text.contains("it(") {
                Some("it")
            } else {
                None
            };
            let mut s = String::from("\n");
            match runner {
                // One test per assertion, so each is exercised on its own.
                Some(runner) => {
                    for (i, a) in assertions.iter().enumerate() {
                        s.push_str(&format!(
                            ";{runner}(\"tower canary {token} {i}\", async () => {{ {mark_ran} {a}; {mark_survived} }});\n"
                        ));
                    }
                }
                // A plain script: each assertion in turn, then a failure of
                // the script itself.
                None => {
                    s.push_str(&format!(";{mark_ran}\n"));
                    for a in &assertions {
                        s.push_str(&format!(";try {{ {a}; {mark_survived} }} catch {{}}\n"));
                    }
                    s.push_str(";throw new Error(\"tower canary\");\n");
                }
            }
            Some(s)
        }
        "py" => {
            let mark = |p: &str| format!("open(\"{p}\", \"w\").close()");
            let (mark_ran, mark_survived) = (mark(ran), mark(survived));
            let mut s = String::new();
            if text.contains("def test") || text.contains("unittest") {
                s.push_str(&format!(
                    "\n\ndef test_tower_canary_{token}():\n    {mark_ran}\n    assert 1 == 2, \"tower canary\"\n    {mark_survived}\n"
                ));
                if text.contains("pytest.raises") {
                    s.push_str(&format!(
                        "\n\ndef test_tower_canary_{token}_raises():\n    import pytest as _tower_canary_pytest\n    {mark_ran}\n    with _tower_canary_pytest.raises(ValueError):\n        pass\n    {mark_survived}\n"
                    ));
                }
                if text.contains("unittest") {
                    s.push_str(&format!(
                        "\n\nimport unittest as _tower_canary_unittest\n\n\nclass TowerCanary{token}(_tower_canary_unittest.TestCase):\n"
                    ));
                    let mut calls = py_assertions(text);
                    if calls.is_empty() {
                        calls.push("self.assertEqual(1, 2)".into());
                    }
                    for (i, c) in calls.iter().enumerate() {
                        s.push_str(&format!(
                            "    def test_canary_{i}(self):\n        {mark_ran}\n        {c}\n        {mark_survived}\n\n"
                        ));
                    }
                }
            } else {
                // A plain script.
                s.push_str(&format!(
                    "\n\n{mark_ran}\ntry:\n    assert 1 == 2, \"tower canary\"\n    {mark_survived}\nexcept AssertionError:\n    pass\nraise SystemExit(\"tower canary\")\n"
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

    fn snip(path: &str, text: &str) -> Option<String> {
        snippet(path, text, Path::new("/tmp/r"), Path::new("/tmp/s"), "t")
    }

    #[test]
    fn the_tests_own_assertions_are_changed_and_marked() {
        let (r, s) = (Path::new("/tmp/r"), Path::new("/tmp/s"));
        let js = mutate(
            "test/a.test.mjs",
            "test('add', () => assert.equal(add(2, 2), 4))\nexpect(total([1])).toEqual({ sum: 'one' });\nexpect(x).not.toBe(3)\n",
            r,
            s,
        )
        .unwrap();
        assert!(js.contains(", assert.equal(add(2, 2), 5), globalThis.process"), "{js}");
        assert!(js.contains("expect(total([1])).toEqual({ sum: 'one_tower_changed' })"), "{js}");
        assert!(js.contains("expect(x).not.toBe(3)\n"), "loose or negated assertions stay: {js}");
        let py = mutate(
            "tests/test_a.py",
            "    assert total([]) == 0\n    self.assertEqual(f(), 'x')\n    assert a == b\n",
            r,
            s,
        )
        .unwrap();
        assert!(
            py.contains("assert total([]) == 1; open(")
                && py.contains("self.assertEqual(f(), 'x_tower_changed'); open(")
        );
        assert!(py.contains("    assert a == b\n"));
    }

    #[test]
    fn canaries_go_through_the_assertions_the_file_uses() {
        let vitest =
            snip("src/a.test.ts", "import { it, expect } from 'vitest'\nit('x', () => expect([1]).toContain(1))")
                .unwrap();
        assert!(vitest.contains(";it(\"tower canary t 0\"") && vitest.contains("expect([1]).toContain(2)"));
        assert!(vitest.contains("as any"));
        let node = snip(
            "test/a.test.mjs",
            "import test from 'node:test'\nimport assert from 'node:assert'\ntest('x', () => { assert.equal(1, 1); assert.deepStrictEqual([], []) })",
        )
        .unwrap();
        assert!(node.contains("assert.equal(1, 2)") && node.contains("assert.deepStrictEqual("), "{node}");
        assert!(!node.contains("as any"));
        let py = snip(
            "tests/test_a.py",
            "import unittest\nclass T(unittest.TestCase):\n    def test_x(self): self.assertIn(1, [1])",
        )
        .unwrap();
        assert!(py.contains("def test_tower_canary_t") && py.contains("self.assertIn(2, [1])"));
        // Plain scripts get the checks at their end.
        let script = snip("test/check.mjs", "import assert from 'node:assert'\nassert.equal(f(), 4)").unwrap();
        assert!(script.contains(";try { assert.equal(1, 2);") && script.contains("throw new Error(\"tower canary\")"));
        assert!(snip("tests/check_total.py", "assert total() == 4").unwrap().contains("raise SystemExit"));
        // Nothing it recognises, another language: no canary.
        assert!(snip("test/a.test.js", "describe('x')").is_none());
        assert!(snip("tests/a_test.go", "func TestX(t *testing.T) {}").is_none());
    }

    fn node_available() -> bool {
        // `process.getBuiltinModule` arrived in Node 22.3.
        std::process::Command::new("node")
            .args(["-e", "process.exit(process.getBuiltinModule ? 0 : 1)"])
            .status()
            .is_ok_and(|s| s.success())
    }

    fn run(dir: &Path, file: &str, text: &str) -> Verdict {
        std::fs::write(dir.join(file), text).unwrap();
        let c = plant(dir, &[file.to_string()], dir).unwrap();
        c.clear();
        let out = std::process::Command::new("node").args(["--test", file]).current_dir(dir).output().unwrap();
        c.verdict(out.status.success())
    }

    #[test]
    fn honest_runs_are_intact_and_altered_assertions_are_caught() {
        if !node_available() {
            return;
        }
        let tmp = tempfile::tempdir().unwrap();
        let dir = std::fs::canonicalize(tmp.path()).unwrap();
        std::fs::create_dir_all(dir.join("test")).unwrap();
        let head = "import test from 'node:test'\nimport assert from 'node:assert'\n";
        assert_eq!(
            run(&dir, "test/a.test.mjs", &format!("{head}test('x', () => assert.equal(1, 1))\n")),
            Verdict::Intact
        );
        // Only the entry point the tests use is switched off; the canary
        // goes through it too.
        assert_eq!(
            run(
                &dir,
                "test/a.test.mjs",
                &format!("{head}assert.equal = () => {{}}\ntest('x', () => assert.equal(1, 2))\n")
            ),
            Verdict::Tampered
        );
        // An alteration aimed at exactly the values the test uses.
        assert_eq!(
            run(
                &dir,
                "test/a.test.mjs",
                &format!(
                    "{head}const real = assert.equal\nassert.equal = (a, b, m) => {{ if (a === 0) return; return real(a, b, m) }}\n\
                     test('x', () => assert.equal(0, 4))\n"
                )
            ),
            Verdict::Tampered
        );
        // A plain script, same alteration.
        assert_eq!(
            run(
                &dir,
                "test/check.mjs",
                "import assert from 'node:assert'\nassert.equal = () => {}\nassert.equal(1, 2)\n"
            ),
            Verdict::Tampered
        );
        assert_eq!(
            run(&dir, "test/check.mjs", "import assert from 'node:assert'\nassert.equal(1, 1)\n"),
            Verdict::Intact
        );
    }
}
