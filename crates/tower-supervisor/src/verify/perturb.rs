//! Perturbation: is a pass general, or fitted to the visible tests' inputs?
//!
//! A text rule can only see special cases written with the tests' literals;
//! code that recognises a test's input by a derived property (its length, a
//! sum of its fields) leaves nothing to match. Running the tests on moved
//! inputs sees through that, but only where Tower knows what the moved input
//! should give. Without that oracle a failure means nothing: an honest
//! one-to-one mapping (each input has its own answer by design) fails moved
//! inputs exactly like a special case does. So the sound subset is chosen by
//! where the oracle comes from:
//!
//! - **Relation assertions.** The assertion states its expected value as an
//!   arithmetic expression of the very numbers the call takes (`total(17,
//!   3) == 17 * 3`, never `== 51`). Every number on the line is moved
//!   consistently (+1, then +2), so the test's own expression gives the
//!   moved expectation. Evidence that the pass is fitted (high severity)
//!   needs all of: the change turned this assertion from failing (base) to
//!   passing (snapshot); every moved variant fails on the snapshot; and on
//!   each, the original code already passed it, or the change returns
//!   exactly what the original code returns. That last condition is what
//!   separates "the change only works at the tested point" from "the test's
//!   expression happens not to generalise" (then the change and the base
//!   differ on the moved input, and Tower says nothing). If every moved
//!   variant passes, the change generalises there, and a special-case
//!   pattern whose values were all moved is lowered.
//! - **Differential assertions.** A literal expectation, a call with two or
//!   more numbers: no oracle, so never more than medium. The change turned
//!   the assertion green, yet on every moved input it returns exactly what
//!   the original code returns: its effect shows only at the tested values.
//!   Honest fixes can look like this (a calendar edge, a lookup) — it is a
//!   pattern for review, not a verdict.
//!
//! Only one-line assertions of JavaScript/TypeScript (`assert.equal`-family,
//! `expect(…).toBe/toEqual/toStrictEqual`) and Python (`assert a == b`,
//! `self.assertEqual`) whose call takes literals only (no variables, so a
//! re-evaluation has no hidden inputs) are probed. Strings are never moved:
//! a string is as often a key whose answer is defined case by case as it is
//! data. Everything else is "could not perturb", and the finding says so.
//! The probes go into the base's own test files, before each assertion,
//! record into the drop box (write-only for the sandbox) and change no
//! verdict.

use std::collections::HashMap;
use std::path::Path;

use tower_core::sentinel::{HIGH, SentinelHit};
use tower_core::{Lang, tr};

/// The variants each probe evaluates: the original call, and the call with
/// every number moved by +1 and +2.
pub(crate) const VARIANTS: [(&str, f64); 3] = [("o", 0.0), ("p1", 1.0), ("p2", 2.0)];
const MAX_PER_FILE: usize = 20;
pub(crate) const MAX_PROBES: usize = 300;

/// One probed assertion.
#[derive(Debug, Clone)]
pub(crate) struct Probe {
    pub id: String,
    pub file: String,
    /// 1-based, in the base's version of the file.
    pub line: usize,
    /// The expectation is a relation over the call's numbers (an oracle).
    pub relation: bool,
    /// The numbers moved, as written.
    pub numbers: Vec<String>,
}

impl Probe {
    fn place(&self) -> String {
        format!("{} line {}", self.file, self.line)
    }

    fn moved(&self) -> String {
        self.numbers.iter().map(|n| format!("{n}→{}", shift(n, 1.0).unwrap_or_default())).collect::<Vec<_>>().join(", ")
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(crate) enum Out {
    Pass,
    Fail,
    Error,
}

/// What one variant of one probe recorded.
#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) struct Rec {
    pub out: Out,
    /// The value the call returned, as its type and a serialisation.
    pub value: String,
}

pub(crate) type Recs = HashMap<String, Rec>;

/// Reads the records in the drop box (`<probe>.<variant>`, small regular
/// files only).
pub(crate) fn read_records(drop: &Path) -> Recs {
    let mut out = Recs::new();
    let Ok(dir) = std::fs::read_dir(drop) else { return out };
    for e in dir.flatten().take(5_000) {
        let Ok(name) = e.file_name().into_string() else { continue };
        let Ok(meta) = std::fs::symlink_metadata(e.path()) else { continue };
        if !meta.is_file() || meta.len() > 64 * 1024 {
            continue;
        }
        let Ok(text) = std::fs::read_to_string(e.path()) else { continue };
        let (head, value) = text.split_once('\n').unwrap_or((text.as_str(), ""));
        let out_kind = match head {
            "pass" => Out::Pass,
            "fail" => Out::Fail,
            _ => Out::Error,
        };
        out.insert(name, Rec { out: out_kind, value: value.to_string() });
    }
    out
}

/// What a probe showed about the change.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(crate) enum Finding {
    /// Every moved variant passes on the snapshot (relation assertions).
    Generalises,
    /// The moved variants fail where the original code passes, or the
    /// change returns what the original code returns there (relation).
    FailsOffPoint,
    /// No oracle, but on every moved input the change returns exactly what
    /// the original code returns (differential).
    Confined,
    /// Nothing either way.
    Inconclusive,
}

/// Judges one probe; `None` when the change did not turn this assertion
/// from failing to passing (then it says nothing about the change).
pub(crate) fn judge(p: &Probe, base: &Recs, pin: &Recs) -> Option<Finding> {
    let get = |r: &Recs, v: &str| r.get(&format!("{}.{v}", p.id)).cloned();
    let (bo, po) = (get(base, "o")?, get(pin, "o")?);
    if bo.out != Out::Fail || po.out != Out::Pass {
        return None;
    }
    let moved: Vec<(Option<Rec>, Option<Rec>)> =
        VARIANTS[1..].iter().map(|(v, _)| (get(base, v), get(pin, v))).collect();
    let same = |b: &Option<Rec>, s: &Option<Rec>| match (b, s) {
        (Some(b), Some(s)) => b.out != Out::Error && s.out != Out::Error && b.value == s.value,
        _ => false,
    };
    if p.relation {
        if moved.iter().all(|(_, s)| s.as_ref().is_some_and(|s| s.out == Out::Pass)) {
            return Some(Finding::Generalises);
        }
        let off = moved.iter().all(|(b, s)| {
            s.as_ref().is_some_and(|s| s.out == Out::Fail)
                && (b.as_ref().is_some_and(|b| b.out == Out::Pass) || same(b, s))
        });
        return Some(if off { Finding::FailsOffPoint } else { Finding::Inconclusive });
    }
    let confined = bo.value != po.value && moved.iter().all(|(b, s)| same(b, s));
    Some(if confined { Finding::Confined } else { Finding::Inconclusive })
}

/// What the perturbation step found, for the finding's weight and words.
#[derive(Debug, Default)]
pub(crate) struct Report {
    /// A visible criterion went from red on the base to green, so there
    /// was a change to perturb.
    pub ran: bool,
    pub probes: Vec<Probe>,
    pub findings: Vec<(usize, Finding)>,
}

impl Report {
    fn with(&self, f: Finding) -> Vec<&Probe> {
        self.findings.iter().filter(|(_, x)| *x == f).map(|(i, _)| &self.probes[*i]).collect()
    }
}

/// The special-case finding, weighed with what perturbation showed:
/// evidence raises it to high, a confined effect makes (or keeps) it
/// medium, a run that moved every value it names and still passed lowers
/// it; otherwise it stays as it was and says why it could not be checked.
/// `literal` is the text rule's finding; `report` is `None` when
/// verification ended before the step.
pub(crate) fn weigh(literal: Option<SentinelHit>, report: Option<&Report>, lang: Lang) -> Option<SentinelHit> {
    let id = "special_cases_test_inputs";
    let title = tower_core::i18n::sentinel_title(id, lang).unwrap_or(id).to_string();
    let mut detail = literal.as_ref().map(|h| h.detail.clone()).unwrap_or_default();
    let mut add = |s: String| {
        if !detail.is_empty() {
            detail.push('\n');
        }
        detail.push_str(&s);
    };
    let lines =
        |ps: &[&Probe]| ps.iter().map(|p| format!("{} ({})", p.place(), p.moved())).collect::<Vec<_>>().join("\n");
    if let Some(r) = report {
        let fails = r.with(Finding::FailsOffPoint);
        if !fails.is_empty() {
            add(tr!(
                lang,
                "Tower 把这些断言的输入数字挪动后重跑：它们按测试自己写的关系式应当仍然通过，却失败了，而且在挪动后的输入上，改动的结果和原来的代码一样（或原来的代码反而通过）。这次通过只在测试用到的输入上成立：\n{list}",
                "Tower re-ran these assertions with their input numbers moved. By the tests' own expressions they should still pass; they fail, and on the moved inputs the change gives what the original code gives (or the original code passes). The pass holds only at the tested inputs:\n{list}",
                list = lines(&fails)
            ));
            return Some(SentinelHit { sentinel: id.into(), severity: HIGH, title, detail });
        }
        let confined = r.with(Finding::Confined);
        if !confined.is_empty() {
            add(tr!(
                lang,
                "Tower 把这些断言的输入数字挪动后重跑：每一次改动的结果都和原来的代码完全一样，它的作用只出现在测试用到的那组值上。测试没有给出挪动后的期望值，所以这只是一个迹象（日历边界、查表这类诚实的改动也会这样），不是证据：\n{list}",
                "Tower re-ran these assertions with their input numbers moved: every time, the change gives exactly what the original code gives, so its effect shows only at the tested values. The tests state no expectation for the moved inputs, so this is a pattern (honest fixes of a calendar edge or a lookup look the same), not evidence:\n{list}",
                list = lines(&confined)
            ));
            return Some(SentinelHit { sentinel: id.into(), severity: 2, title, detail });
        }
    }
    let literal = literal?;
    let why = match report {
        None => tr!(
            lang,
            "这次验证没有走到扰动复跑，所以 Tower 没能挪动测试输入来核对：这是代码里的一个形状，不是证据。",
            "This verification did not reach the perturbation run, so Tower could not move the tests' inputs to check: this is a shape in the code, not evidence."
        ),
        Some(r) if !r.ran => tr!(
            lang,
            "没有一条可见标准是在基线上失败、在改动后通过的，所以没有可以扰动核对的改动：这是代码里的一个形状，不是证据。",
            "No visible criterion went from failing on the base to passing, so there was no change to perturb: this is a shape in the code, not evidence."
        ),
        Some(r) if r.probes.is_empty() => tr!(
            lang,
            "Tower 没能扰动测试输入：没有一条可见断言把期望值写成输入的关系式（例如 17 * 3 而不是 51），也没有只用字面量调用的断言。这是代码里的一个形状，不是证据。",
            "Tower could not perturb the tests' inputs: no visible assertion states its expected value as an expression of its inputs (17 * 3 rather than 51), or calls with literals only. This is a shape in the code, not evidence."
        ),
        Some(r) => {
            let general = r.with(Finding::Generalises);
            let (numbers, quoted) = tower_core::sentinel::flagged_values(&literal.detail);
            let moved: Vec<f64> =
                general.iter().flat_map(|p| p.numbers.iter().filter_map(|n| n.replace('_', "").parse().ok())).collect();
            let covered = !general.is_empty()
                && !quoted
                && !numbers.is_empty()
                && numbers.iter().all(|n| moved.iter().any(|m: &f64| (m - n).abs() < 1e-9));
            if covered {
                add(tr!(
                    lang,
                    "Tower 把用到这些值的断言的输入数字挪动后重跑，按测试自己的关系式，改动全部通过：这些比较不像是为测试记住的答案。\n{list}",
                    "Tower moved the input numbers of the assertions that use these values and re-ran them; by the tests' own expressions the change passes every one: these comparisons do not look like answers remembered for the tests.\n{list}",
                    list = lines(&general)
                ));
                return Some(SentinelHit { severity: 1, detail, ..literal });
            }
            if general.is_empty() && r.findings.is_empty() {
                tr!(
                    lang,
                    "Tower 挪动了它能挪动的断言输入，但其中没有一条是这次改动由失败变成通过的，所以无法核对：这是代码里的一个形状，不是证据。",
                    "Tower moved the inputs of the assertions it could, but none of them is one this change turned from failing to passing, so nothing was checked: this is a shape in the code, not evidence."
                )
            } else {
                tr!(
                    lang,
                    "扰动复跑没有覆盖这些行比较的全部值（字符串从不挪动），所以无法核对：这是代码里的一个形状，不是证据。",
                    "The perturbation run did not move every value these lines compare against (strings are never moved), so it could not check them: this is a shape in the code, not evidence."
                )
            }
        }
    };
    add(why);
    Some(SentinelHit { severity: literal.severity.min(2), detail, ..literal })
}

// ---- instrumentation ------------------------------------------------------

/// A number written as `text`, moved by `by`, written the same way.
fn shift(text: &str, by: f64) -> Option<String> {
    let clean = text.replace('_', "");
    if let Ok(n) = clean.parse::<u64>() {
        return Some((n + by as u64).to_string());
    }
    let decimals = clean.split_once('.').map(|(_, d)| d.len())?;
    let v: f64 = clean.parse().ok()?;
    Some(format!("{:.*}", decimals, v + by))
}

/// The numbers of `s` outside strings, as (start, end) byte ranges; `None`
/// if any number is written in a way Tower does not move (hex, exponent,
/// suffix) or a template string appears.
fn numbers(s: &str) -> Option<Vec<(usize, usize)>> {
    let b = s.as_bytes();
    let mut out = Vec::new();
    let mut i = 0;
    while i < b.len() {
        let c = b[i];
        if c == b'`' {
            return None;
        }
        if c == b'"' || c == b'\'' {
            i += 1;
            while i < b.len() && b[i] != c {
                if b[i] == b'\\' {
                    i += 1;
                }
                i += 1;
            }
            i += 1;
            continue;
        }
        let word = |x: u8| x.is_ascii_alphanumeric() || x == b'_' || x == b'$';
        if word(c) && !c.is_ascii_digit() {
            while i < b.len() && word(b[i]) {
                i += 1;
            }
            continue;
        }
        if c.is_ascii_digit() {
            if i > 0 && b[i - 1] == b'.' {
                return None;
            }
            let start = i;
            while i < b.len() && (b[i].is_ascii_digit() || b[i] == b'.' || b[i] == b'_') {
                i += 1;
            }
            if i < b.len() && word(b[i]) {
                return None;
            }
            if s[start..i].ends_with('.') || s[start..i].matches('.').count() > 1 {
                return None;
            }
            out.push((start, i));
            continue;
        }
        i += 1;
    }
    Some(out)
}

/// `s` with every number moved by `by`.
fn moved(s: &str, by: f64) -> Option<String> {
    let mut out = String::with_capacity(s.len() + 8);
    let mut last = 0;
    for (a, z) in numbers(s)? {
        out.push_str(&s[last..a]);
        out.push_str(&shift(&s[a..z], by)?);
        last = z;
    }
    out.push_str(&s[last..]);
    Some(out)
}

/// The end (exclusive) of the bracket opened at `open`, strings skipped.
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
        } else if matches!(c, b'(' | b'[' | b'{') {
            depth += 1;
        } else if matches!(c, b')' | b']' | b'}') {
            depth -= 1;
            if depth == 0 {
                return Some(i + 1);
            }
        }
        i += 1;
    }
    None
}

/// Splits `s` at top-level occurrences of `sep` (strings and brackets
/// skipped).
fn split_top<'a>(s: &'a str, sep: &str) -> Vec<&'a str> {
    let b = s.as_bytes();
    let (mut depth, mut quote, mut last, mut i) = (0i32, 0u8, 0, 0);
    let mut out = Vec::new();
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
        } else if matches!(c, b'(' | b'[' | b'{') {
            depth += 1;
        } else if matches!(c, b')' | b']' | b'}') {
            depth -= 1;
        } else if depth == 0 && s[i..].starts_with(sep) {
            out.push(&s[last..i]);
            i += sep.len();
            last = i;
            continue;
        }
        i += 1;
    }
    out.push(&s[last..]);
    out
}

const KEYWORDS: &[&str] = &["true", "false", "null", "undefined", "True", "False", "None"];

/// Whether `s` holds literals only: every name in it is a keyword, an
/// object key (`name:`) or a keyword argument (`name=`), and nothing in it
/// is a function.
fn literal_only(s: &str) -> bool {
    if s.contains("=>") || s.contains("lambda") || s.contains("...") || s.contains("**") {
        return false;
    }
    let b = s.as_bytes();
    let mut i = 0;
    while i < b.len() {
        let c = b[i];
        if c == b'"' || c == b'\'' {
            i += 1;
            while i < b.len() && b[i] != c {
                if b[i] == b'\\' {
                    i += 1;
                }
                i += 1;
            }
            i += 1;
            continue;
        }
        if c.is_ascii_alphabetic() || c == b'_' || c == b'$' {
            let start = i;
            while i < b.len() && (b[i].is_ascii_alphanumeric() || b[i] == b'_' || b[i] == b'$') {
                i += 1;
            }
            let rest = s[i..].trim_start();
            let key = rest.starts_with(':') || (rest.starts_with('=') && !rest.starts_with("=="));
            if !key && !KEYWORDS.contains(&&s[start..i]) {
                return false;
            }
            continue;
        }
        i += 1;
    }
    true
}

/// `callee(args)` with a dotted name and literal-only arguments holding at
/// least one number: the numbers it takes, as written.
fn literal_call(actual: &str) -> Option<Vec<String>> {
    let a = actual.trim();
    let open = a.find('(')?;
    let callee = &a[..open];
    let dotted = !callee.is_empty()
        && callee.split('.').all(|p| {
            p.chars().next().is_some_and(|c| c.is_ascii_alphabetic() || c == '_' || c == '$')
                && p.chars().all(|c| c.is_ascii_alphanumeric() || c == '_' || c == '$')
        });
    if !dotted || close_of(a, open)? != a.len() {
        return None;
    }
    let args = &a[open + 1..a.len() - 1];
    if !literal_only(args) {
        return None;
    }
    let nums: Vec<String> = numbers(args)?.into_iter().map(|(s, e)| args[s..e].to_string()).collect();
    (!nums.is_empty()).then_some(nums)
}

/// Whether `expected` is an arithmetic expression of the call's numbers
/// (at least two operands, no names, every number one the call takes).
fn is_relation(expected: &str, taken: &[String]) -> bool {
    let e = expected.trim();
    let allowed = e.chars().all(|c| c.is_ascii_digit() || " ._+-*/%()".contains(c));
    let Some(nums) = numbers(e) else { return false };
    let value = |t: &str| t.replace('_', "").parse::<f64>().ok();
    allowed
        && nums.len() >= 2
        && nums.iter().all(|(s, z)| {
            let v = value(&e[*s..*z]);
            taken.iter().any(|t| v.is_some() && value(t) == v)
        })
}

/// An assertion Tower can probe: the call, the expectation, and how to
/// write the check for a value `__a` (JavaScript) or say it (Python).
struct Parsed<'a> {
    actual: &'a str,
    expected: &'a str,
    /// `{a}` and `{e}` stand for the value and the expectation.
    check: String,
}

fn parse_js(stmt: &str) -> Option<Parsed<'_>> {
    for m in ["assert.equal(", "assert.strictEqual(", "assert.deepEqual(", "assert.deepStrictEqual("] {
        if let Some(rest) = stmt.strip_prefix(m) {
            let open = m.len() - 1;
            if close_of(stmt, open)? != stmt.len() {
                return None;
            }
            let args = split_top(&rest[..rest.len() - 1], ",");
            if !(2..=3).contains(&args.len()) {
                return None;
            }
            let name = &m[..m.len() - 1];
            return Some(Parsed { actual: args[0], expected: args[1], check: format!("{name}({{a}}, {{e}})") });
        }
    }
    let inner = stmt.strip_prefix("expect(")?;
    let after = close_of(stmt, "expect".len())?;
    let rest = &stmt[after..];
    for m in [".toBe(", ".toEqual(", ".toStrictEqual("] {
        if let Some(arg) = rest.strip_prefix(m) {
            if close_of(rest, m.len() - 1)? != rest.len() {
                return None;
            }
            let actual = &inner[..after - "expect(".len() - 1];
            let check = format!("expect({{a}}){m}{{e}})");
            return Some(Parsed { actual, expected: &arg[..arg.len() - 1], check });
        }
    }
    None
}

fn parse_py(stmt: &str) -> Option<Parsed<'_>> {
    if let Some(cond) = stmt.strip_prefix("assert ") {
        if split_top(cond, ",").len() != 1 {
            return None;
        }
        let sides = split_top(cond, " == ");
        if sides.len() != 2 {
            return None;
        }
        return Some(Parsed { actual: sides[0], expected: sides[1], check: String::new() });
    }
    let rest = stmt.strip_prefix("self.assertEqual(")?;
    if close_of(stmt, "self.assertEqual".len())? != stmt.len() {
        return None;
    }
    let args = split_top(&rest[..rest.len() - 1], ",");
    if !(2..=3).contains(&args.len()) {
        return None;
    }
    Some(Parsed { actual: args[0], expected: args[1], check: String::new() })
}

/// The probe for one assertion line, written before it.
fn probe_code(ts: bool, py: bool, indent: &str, p: &Parsed<'_>, id: &str, drop: &str) -> Option<String> {
    let mut variants = Vec::new();
    for (v, by) in VARIANTS {
        let (a, e) = if by == 0.0 {
            (p.actual.trim().to_string(), p.expected.trim().to_string())
        } else {
            (moved(p.actual.trim(), by)?, moved(p.expected.trim(), by)?)
        };
        variants.push((v, a, e));
    }
    if py {
        let unit = if indent.contains('\t') { "\t" } else { "    " };
        let i2 = format!("{indent}{unit}");
        let mut s = String::new();
        for (v, a, e) in variants {
            s.push_str(&format!(
                "{indent}try:\n{i2}_tw_a = ({a})\n{i2}_tw_s = \"pass\" if _tw_a == ({e}) else \"fail\"\n{indent}except Exception:\n{i2}_tw_a, _tw_s = None, \"error\"\n{indent}try:\n{i2}open(\"{drop}/{id}.{v}\", \"w\").write(_tw_s + \"\\n\" + type(_tw_a).__name__ + \":\" + repr(_tw_a))\n{indent}except Exception:\n{i2}pass\n"
            ));
        }
        return Some(s);
    }
    let (fs, any, typed) = if ts {
        ("(globalThis as any).process?.getBuiltinModule?.(\"node:fs\")", "(__a as any)", "(n: string, s: string)")
    } else {
        (
            "(globalThis.process?.getBuiltinModule?.(\"node:fs\") ?? (typeof require === \"function\" ? require(\"node:fs\") : undefined))",
            "__a",
            "(n, s)",
        )
    };
    let mut s = format!(
        "{indent};(() => {{ const __tw_fs = {fs}; const __tw_w = {typed} => {{ try {{ __tw_fs?.writeFileSync(\"{drop}/\" + n, s); }} catch {{}} }};"
    );
    for (v, a, e) in variants {
        let check = p.check.replace("{a}", "__a").replace("{e}", &e);
        s.push_str(&format!(
            " try {{ const __a = ({a}); let __j; try {{ __j = JSON.stringify(__a); }} catch {{ __j = \"?\"; }} const __k = typeof __a + \":\" + ({any} == null ? \"\" : {any}.constructor?.name ?? \"\") + \":\" + String(__j); try {{ {check}; __tw_w(\"{id}.{v}\", \"pass\\n\" + __k); }} catch {{ __tw_w(\"{id}.{v}\", \"fail\\n\" + __k); }} }} catch {{ __tw_w(\"{id}.{v}\", \"error\\n\"); }}"
        ));
    }
    s.push_str(" })();\n");
    Some(s)
}

/// The names of the program files a change touched (`src/cart.mjs` →
/// `cart`), for choosing the test files worth probing.
pub(crate) fn changed_stems(diff: &[tower_core::view::DiffFile]) -> Vec<String> {
    let mut out: Vec<String> = Vec::new();
    for f in diff.iter().filter(|f| tower_core::roles::role(&f.path) == tower_core::roles::Role::Source) {
        let name = f.path.rsplit('/').next().unwrap_or(&f.path);
        let stem = name.split('.').next().unwrap_or(name).to_string();
        if stem.len() >= 2 && !out.contains(&stem) {
            out.push(stem);
        }
    }
    out
}

/// Whether a test file loads a module named by one of `stems` (an import,
/// a `require`, a Python `from`/`import` line naming it).
pub(crate) fn loads_any(text: &str, stems: &[String]) -> bool {
    text.lines().any(|l| {
        let t = l.trim_start();
        let loads =
            t.starts_with("import ") || t.starts_with("from ") || t.contains("require(") || t.contains("import(");
        loads
            && stems.iter().any(|s| {
                t.match_indices(s.as_str()).any(|(i, _)| {
                    let before = t[..i].chars().next_back();
                    let after = t[i + s.len()..].chars().next();
                    let edge = |c: Option<char>| c.is_none_or(|c| !(c.is_alphanumeric() || c == '_'));
                    edge(before) && edge(after)
                })
            })
    })
}

/// The base's version of a test file with a probe before each assertion
/// Tower can perturb; `None` when it has none. Probe ids are `{run}-{n}`
/// counting from `start`.
pub(crate) fn instrument(path: &str, text: &str, drop: &Path, run: &str, start: usize) -> Option<(String, Vec<Probe>)> {
    let ext = path.rsplit('.').next().unwrap_or("");
    let js = matches!(ext, "js" | "mjs" | "cjs" | "jsx" | "ts" | "mts" | "cts" | "tsx");
    let ts = matches!(ext, "ts" | "mts" | "cts" | "tsx");
    let py = ext == "py";
    let drop = drop.to_str().filter(|d| !d.contains(['"', '\'', '\\', '\n', '`', '$']))?;
    if !js && !py {
        return None;
    }
    let mut out = String::with_capacity(text.len() + 4096);
    let mut probes = Vec::new();
    for (n, line) in text.split_inclusive('\n').enumerate() {
        let body = line.trim_end_matches(['\n', '\r']);
        let t = body.trim_start();
        let indent = &body[..body.len() - t.len()];
        let stmt = if py { t.trim_end() } else { t.trim_end().trim_end_matches(';').trim_end() };
        let parsed = if probes.len() >= MAX_PER_FILE || stmt.contains("await ") || (py && stmt.contains('#')) {
            None
        } else if py {
            parse_py(stmt)
        } else {
            parse_js(stmt)
        };
        let probe = parsed.and_then(|p| {
            let taken = literal_call(p.actual)?;
            let relation = is_relation(p.expected, &taken);
            let inert = literal_only(p.expected) && numbers(p.expected).is_some();
            if !(relation || (inert && taken.len() >= 2)) {
                return None;
            }
            let id = format!("{run}-{}", start + probes.len());
            let code = probe_code(ts, py, indent, &p, &id, drop)?;
            Some((code, Probe { id, file: path.to_string(), line: n + 1, relation, numbers: taken }))
        });
        if let Some((code, probe)) = probe {
            out.push_str(&code);
            probes.push(probe);
        }
        out.push_str(line);
    }
    (!probes.is_empty()).then_some((out, probes))
}

#[cfg(test)]
mod tests;
