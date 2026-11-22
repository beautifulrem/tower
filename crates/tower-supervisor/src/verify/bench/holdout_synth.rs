//! Pure, deterministic diff-scoped micro-mutation & synthetic holdout draft generator.
//!
//! Strictly obeys Tower's Honesty Grammar (`docs/00` R1):
//! - Never writes files to disk and never activates holdouts automatically.
//! - Every generated [`SyntheticHoldoutDraft`] starts with `human_approved = false`
//!   and must be explicitly reviewed and ratified by a human before being written
//!   into the project's `holdout/` directory.
//! - Uses only deterministic AST/assertion extraction from existing visible tests
//!   and contract intent (zero LLM claims, zero hidden side effects).

use serde::{Deserialize, Serialize};

mod mutate;
#[allow(unused_imports)]
pub use mutate::{DiffMutation, MutationKind, diff_scoped_mutations};

/// A human-reviewable synthetic holdout test draft.
///
/// Field names (`id`, `filename`, `rationale`, `code`) align 1:1 with the UI
/// `HoldoutDraft` DTO; `human_approved` is always `false` on generation.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct SyntheticHoldoutDraft {
    pub id: String,
    pub filename: String,
    pub rationale: String,
    pub code: String,
    /// Always `false` when generated — only human ratification writes to `holdout/`.
    pub human_approved: bool,
    /// Visible test file from which this draft was synthesized, if any.
    pub source_file: Option<String>,
}

#[derive(Debug, Clone)]
struct ExtractedCall {
    file: String,
    lang: DraftLang,
    import_lines: Vec<String>,
    callee: String,
    args_text: String,
    numbers: Vec<i64>,
    expected_text: String,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum DraftLang {
    JsMjs,
    Ts,
    Python,
    Rust,
}

/// Proposes deterministic, human-reviewable synthetic holdout test drafts from
/// contract `intent` and `existing_tests` (`(relative_path, source_text)`).
///
/// Every returned draft has `human_approved == false` and is strictly a proposal
/// for human review before any file is written under `holdout/`.
pub fn synthesize_holdout_drafts(
    intent: &str,
    existing_tests: &[(String, String)],
    max_drafts: usize,
) -> Vec<SyntheticHoldoutDraft> {
    if max_drafts == 0 {
        return Vec::new();
    }
    let calls = extract_test_calls(existing_tests);
    let mut drafts = Vec::new();
    let intent_summary = compact_intent(intent);

    let mut seen_callees: Vec<String> = Vec::new();
    for call in &calls {
        if drafts.len() >= max_drafts {
            break;
        }
        if seen_callees.contains(&call.callee) {
            continue;
        }
        seen_callees.push(call.callee.clone());

        let slug = slugify(&call.callee);
        let id = format!("draft-{}-{:04x}", slug, stable_hash(&format!("{}:{}", call.file, call.callee)) & 0xffff);
        let (filename, code) = build_shifted_draft(call, &intent_summary);
        drafts.push(SyntheticHoldoutDraft {
            id,
            filename,
            rationale: format!(
                "Off-point inputs for `{}` (derived from `{}`) to defeat literal lookup tables and point-pinned special cases. Review expected values before approving.",
                call.callee, call.file
            ),
            code,
            human_approved: false,
            source_file: Some(call.file.clone()),
        });
    }

    if drafts.len() < max_drafts
        && let Some(first) = calls.first()
    {
        let slug = slugify(&first.callee);
        let id = format!(
            "draft-{}-edge-{:04x}",
            slug,
            stable_hash(&format!("edge:{}:{intent_summary}", first.callee)) & 0xffff
        );
        let (filename, code) = build_edge_draft(first, &intent_summary);
        drafts.push(SyntheticHoldoutDraft {
            id,
            filename,
            rationale: format!(
                "Boundary & negative/zero edge cases for `{}` aligned with contract intent (\"{}\"). Review and edit expected values before approving.",
                first.callee, intent_summary
            ),
            code,
            human_approved: false,
            source_file: Some(first.file.clone()),
        });
    }

    if drafts.is_empty() && !intent_summary.is_empty() {
        let slug = slugify(&intent_summary);
        let id = format!("draft-intent-{:04x}", stable_hash(&intent_summary) & 0xffff);
        let code = format!(
            "// Synthetic holdout draft (NOT active until human review & approval)\n\
             // Intent: {intent_summary}\n\
             import test from 'node:test'\n\
             import assert from 'node:assert/strict'\n\n\
             test('holdout: unseen input generalization', () => {{\n\
               // TODO(human): import the target function and assert unseen off-point inputs.\n\
               assert.fail('Replace with concrete unseen-input assertion before approving')\n\
             }})\n"
        );
        drafts.push(SyntheticHoldoutDraft {
            id,
            filename: format!("holdout/synth_{slug}.test.mjs"),
            rationale: format!(
                "Starter holdout template for \"{intent_summary}\" (no visible literal assertions found to shift). Fill in concrete expectations before approving."
            ),
            code,
            human_approved: false,
            source_file: None,
        });
    }

    drafts.truncate(max_drafts);
    drafts
}

fn build_shifted_draft(call: &ExtractedCall, intent: &str) -> (String, String) {
    let slug = slugify(&call.callee);
    let shifted_a = shift_integers(&call.args_text, 13);
    let shifted_b = shift_integers(&call.args_text, 29);
    let hint_a = infer_expected_comment(&call.callee, &call.numbers, 13, intent, &call.expected_text);
    let hint_b = infer_expected_comment(&call.callee, &call.numbers, 29, intent, &call.expected_text);

    match call.lang {
        DraftLang::JsMjs | DraftLang::Ts => {
            let ext = if call.lang == DraftLang::Ts { "test.ts" } else { "test.mjs" };
            let imports = format_js_imports(&call.import_lines);
            let code = format!(
                "// Synthetic holdout draft — review and approve before adding to holdout/\n\
                 // Intent: {intent}\n\
                 {imports}\n\
                 test('holdout: {callee} generalizes to unseen off-point inputs', () => {{\n\
                   assert.deepEqual({callee}({shifted_a}), {hint_a})\n\
                   assert.deepEqual({callee}({shifted_b}), {hint_b})\n\
                 }})\n",
                callee = call.callee,
            );
            (format!("holdout/synth_{slug}.{ext}"), code)
        }
        DraftLang::Python => {
            let imports = call.import_lines.join("\n");
            let code = format!(
                "# Synthetic holdout draft — review and approve before adding to holdout/\n\
                 # Intent: {intent}\n\
                 {imports}\n\n\
                 def test_holdout_{slug}_generalizes():\n\
                     assert {callee}({shifted_a}) == {hint_a}\n\
                     assert {callee}({shifted_b}) == {hint_b}\n",
                callee = call.callee,
            );
            (format!("holdout/test_synth_{slug}.py"), code)
        }
        DraftLang::Rust => {
            let code = format!(
                "// Synthetic holdout draft — review and approve before adding to holdout/\n\
                 // Intent: {intent}\n\
                 #[test]\n\
                 fn holdout_{slug}_generalizes() {{\n\
                     assert_eq!({callee}({shifted_a}), {hint_a});\n\
                     assert_eq!({callee}({shifted_b}), {hint_b});\n\
                 }}\n",
                callee = call.callee,
            );
            (format!("holdout/synth_{slug}.rs"), code)
        }
    }
}

fn build_edge_draft(call: &ExtractedCall, intent: &str) -> (String, String) {
    let slug = slugify(&call.callee);
    let zeroed = map_integers(&call.args_text, |_| 0);
    let negated = map_integers(&call.args_text, |n| if n == 0 { -1 } else { -n });

    match call.lang {
        DraftLang::JsMjs | DraftLang::Ts => {
            let ext = if call.lang == DraftLang::Ts { "test.ts" } else { "test.mjs" };
            let imports = format_js_imports(&call.import_lines);
            let code = format!(
                "// Synthetic holdout boundary draft — review expected values before approving\n\
                 // Intent: {intent}\n\
                 {imports}\n\
                 test('holdout: {callee} handles zero and negative boundaries', () => {{\n\
                   const atZero = {callee}({zeroed})\n\
                   const atNeg = {callee}({negated})\n\
                   // TODO(human): replace with exact expected values for your contract\n\
                   assert.notEqual(atZero, undefined)\n\
                   assert.notEqual(atNeg, undefined)\n\
                 }})\n",
                callee = call.callee,
            );
            (format!("holdout/synth_{slug}_edges.{ext}"), code)
        }
        DraftLang::Python => {
            let imports = call.import_lines.join("\n");
            let code = format!(
                "# Synthetic holdout boundary draft — review expected values before approving\n\
                 # Intent: {intent}\n\
                 {imports}\n\n\
                 def test_holdout_{slug}_boundaries():\n\
                     # TODO(human): replace with exact expected values for your contract\n\
                     assert {callee}({zeroed}) is not None\n\
                     assert {callee}({negated}) is not None\n",
                callee = call.callee,
            );
            (format!("holdout/test_synth_{slug}_edges.py"), code)
        }
        DraftLang::Rust => {
            let code = format!(
                "// Synthetic holdout boundary draft — review expected values before approving\n\
                 // Intent: {intent}\n\
                 #[test]\n\
                 fn holdout_{slug}_boundaries() {{\n\
                     // TODO(human): confirm expected boundary outputs before approving\n\
                     let _zero = {callee}({zeroed});\n\
                     let _neg = {callee}({negated});\n\
                 }}\n",
                callee = call.callee,
            );
            (format!("holdout/synth_{slug}_edges.rs"), code)
        }
    }
}

fn infer_expected_comment(callee: &str, nums: &[i64], shift: i64, intent: &str, orig_expected: &str) -> String {
    let lower = format!("{callee} {intent}").to_ascii_lowercase();
    if let Ok(ev) = orig_expected.trim().parse::<i64>()
        && nums.len() >= 2
    {
        if nums.iter().sum::<i64>() == ev && ["add", "sum", "total"].iter().any(|k| lower.contains(k)) {
            let shifted_sum: i64 = nums.iter().map(|n| n + shift).sum();
            return format!("{shifted_sum} /* verify: sum of shifted inputs */");
        }
        if nums.len() == 2 && nums[0] * nums[1] == ev && ["mul", "product", "area"].iter().any(|k| lower.contains(k)) {
            let shifted_prod = (nums[0] + shift) * (nums[1] + shift);
            return format!("{shifted_prod} /* verify: product of shifted inputs */");
        }
    }
    format!("/* TODO(human): expected for shifted inputs (visible expected {orig_expected}) */ 0")
}

fn format_js_imports(lines: &[String]) -> String {
    let mut out = Vec::new();
    if !lines.iter().any(|l| l.contains("node:test") || l.contains("vitest")) {
        out.push("import test from 'node:test'".to_string());
    }
    if !lines.iter().any(|l| l.contains("node:assert") || l.contains("assert")) {
        out.push("import assert from 'node:assert'".to_string());
    }
    out.extend(lines.iter().cloned());
    out.join("\n")
}

fn extract_test_calls(existing_tests: &[(String, String)]) -> Vec<ExtractedCall> {
    let mut out = Vec::new();
    for (path, text) in existing_tests {
        let Some(lang) = draft_lang(path) else { continue };
        let imports: Vec<String> = text
            .lines()
            .map(str::trim)
            .filter(|l| l.starts_with("import ") || l.starts_with("from ") || l.starts_with("use "))
            .take(8)
            .map(String::from)
            .collect();
        for line in text.lines() {
            if let Some((callee, args_text, expected_text)) = parse_assertion_call(line, lang) {
                let numbers = extract_integers(&args_text);
                if !numbers.is_empty() {
                    out.push(ExtractedCall {
                        file: path.clone(),
                        lang,
                        import_lines: imports.clone(),
                        callee,
                        args_text,
                        numbers,
                        expected_text,
                    });
                }
            }
        }
    }
    out
}

fn draft_lang(path: &str) -> Option<DraftLang> {
    match path.rsplit('.').next()?.to_ascii_lowercase().as_str() {
        "js" | "mjs" | "cjs" | "jsx" => Some(DraftLang::JsMjs),
        "ts" | "mts" | "cts" | "tsx" => Some(DraftLang::Ts),
        "py" => Some(DraftLang::Python),
        "rs" => Some(DraftLang::Rust),
        _ => None,
    }
}

fn parse_assertion_call(line: &str, lang: DraftLang) -> Option<(String, String, String)> {
    let t = line.trim();
    match lang {
        DraftLang::JsMjs | DraftLang::Ts => {
            for pat in ["assert.equal(", "assert.strictEqual(", "assert.deepEqual(", "assert.deepStrictEqual("] {
                if let Some(pos) = t.find(pat) {
                    let after = &t[pos + pat.len()..];
                    let (actual, expected) = split_first_top_comma(&after[..matching_paren(after)?])?;
                    return split_call(actual).map(|(c, a)| (c, a, expected.trim().to_string()));
                }
            }
            if let Some(pos) = t.find("expect(") {
                let after = &t[pos + "expect(".len()..];
                let end = matching_paren(after)?;
                let (actual, rest) = (&after[..end], &after[end + 1..]);
                for m in [".toBe(", ".toEqual(", ".toStrictEqual("] {
                    if let Some(mrest) = rest.strip_prefix(m) {
                        let expected = &mrest[..matching_paren(mrest)?];
                        return split_call(actual).map(|(c, a)| (c, a, expected.trim().to_string()));
                    }
                }
            }
            None
        }
        DraftLang::Python => {
            if let Some(rest) = t.strip_prefix("assert ")
                && let Some((lhs, rhs)) = rest.split_once(" == ")
            {
                return split_call(lhs).map(|(c, a)| (c, a, rhs.trim().to_string()));
            }
            if let Some(pos) = t.find("self.assertEqual(") {
                let after = &t[pos + "self.assertEqual(".len()..];
                let (actual, expected) = split_first_top_comma(&after[..matching_paren(after)?])?;
                return split_call(actual).map(|(c, a)| (c, a, expected.trim().to_string()));
            }
            None
        }
        DraftLang::Rust => {
            let pos = t.find("assert_eq!(")?;
            let after = &t[pos + "assert_eq!(".len()..];
            let (actual, expected) = split_first_top_comma(&after[..matching_paren(after)?])?;
            split_call(actual).map(|(c, a)| (c, a, expected.trim().to_string()))
        }
    }
}

fn split_call(expr: &str) -> Option<(String, String)> {
    let e = expr.trim();
    let open = e.find('(')?;
    let callee = e[..open].trim();
    if callee.is_empty() || !callee.chars().all(|c| c.is_ascii_alphanumeric() || matches!(c, '_' | '$' | '.' | ':')) {
        return None;
    }
    let after = &e[open + 1..];
    let end = matching_paren(after)?;
    (end + 1 == after.len()).then(|| (callee.to_string(), after[..end].to_string()))
}

fn matching_paren(s: &str) -> Option<usize> {
    let (mut depth, mut quote, mut i) = (1i32, 0u8, 0);
    let b = s.as_bytes();
    while i < b.len() {
        let c = b[i];
        if quote != 0 {
            if c == b'\\' {
                i += 1;
            } else if c == quote {
                quote = 0;
            }
        } else if matches!(c, b'"' | b'\'' | b'`') {
            quote = c;
        } else if matches!(c, b'(' | b'[' | b'{') {
            depth += 1;
        } else if matches!(c, b')' | b']' | b'}') {
            depth -= 1;
            if depth == 0 {
                return Some(i);
            }
        }
        i += 1;
    }
    None
}

fn split_first_top_comma(s: &str) -> Option<(&str, &str)> {
    let (mut depth, mut quote, mut i) = (0i32, 0u8, 0);
    let b = s.as_bytes();
    while i < b.len() {
        let c = b[i];
        if quote != 0 {
            if c == b'\\' {
                i += 1;
            } else if c == quote {
                quote = 0;
            }
        } else if matches!(c, b'"' | b'\'' | b'`') {
            quote = c;
        } else if matches!(c, b'(' | b'[' | b'{') {
            depth += 1;
        } else if matches!(c, b')' | b']' | b'}') {
            depth -= 1;
        } else if depth == 0 && c == b',' {
            return Some((&s[..i], &s[i + 1..]));
        }
        i += 1;
    }
    None
}

fn is_ident_char(b: u8) -> bool {
    b.is_ascii_alphanumeric() || b == b'_' || b == b'$'
}

fn extract_integers(s: &str) -> Vec<i64> {
    let mut out = Vec::new();
    let _ = map_integers_inner(s, |v| {
        out.push(v);
        v
    });
    out
}

fn shift_integers(s: &str, delta: i64) -> String {
    map_integers(s, |n| n + delta)
}

fn map_integers(s: &str, f: impl Fn(i64) -> i64) -> String {
    map_integers_inner(s, f)
}

fn map_integers_inner(s: &str, mut f: impl FnMut(i64) -> i64) -> String {
    let mut out = String::with_capacity(s.len() + 16);
    let b = s.as_bytes();
    let (mut quote, mut i) = (0u8, 0);
    while i < b.len() {
        let c = b[i];
        if quote != 0 {
            out.push(c as char);
            if c == b'\\' && i + 1 < b.len() {
                i += 1;
                out.push(b[i] as char);
            } else if c == quote {
                quote = 0;
            }
            i += 1;
            continue;
        }
        if matches!(c, b'"' | b'\'' | b'`') {
            quote = c;
            out.push(c as char);
            i += 1;
            continue;
        }
        let neg = c == b'-' && b.get(i + 1).is_some_and(u8::is_ascii_digit);
        if (c.is_ascii_digit() || neg) && (i == 0 || !is_ident_char(b[i - 1])) {
            let start = i;
            if neg {
                i += 1;
            }
            while i < b.len() && b[i].is_ascii_digit() {
                i += 1;
            }
            if b.get(i).is_none_or(|&ch| ch != b'.' && !is_ident_char(ch))
                && let Ok(v) = s[start..i].parse::<i64>()
            {
                out.push_str(&f(v).to_string());
            } else {
                out.push_str(&s[start..i]);
            }
            continue;
        }
        let ch = s[i..].chars().next().unwrap();
        out.push(ch);
        i += ch.len_utf8();
    }
    out
}

fn compact_intent(intent: &str) -> String {
    let one: String = intent.split_whitespace().collect::<Vec<_>>().join(" ");
    if one.chars().count() > 80 {
        let mut s: String = one.chars().take(77).collect();
        s.push_str("...");
        s
    } else {
        one
    }
}

fn slugify(s: &str) -> String {
    let mut out = String::new();
    for c in s.chars() {
        if c.is_ascii_alphanumeric() {
            out.push(c.to_ascii_lowercase());
        } else if !out.ends_with('_') && !out.is_empty() {
            out.push('_');
        }
        if out.len() >= 24 {
            break;
        }
    }
    let trimmed = out.trim_matches('_');
    if trimmed.is_empty() { "case".into() } else { trimmed.into() }
}

fn stable_hash(s: &str) -> u64 {
    let mut h: u64 = 0xcbf2_9ce4_8422_2325;
    for b in s.bytes() {
        h = (h ^ u64::from(b)).wrapping_mul(0x0000_0100_0000_01b3);
    }
    h
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn generates_deterministic_diff_scoped_mutations_only_on_changed_lines() {
        let src = "export const total = (price, qty, off) => {\n  if (qty >= 10) return (price - off) * qty\n  return price * qty\n}\n";
        let m1 = diff_scoped_mutations("src/price.mjs", src, &[2], 10);
        let m2 = diff_scoped_mutations("src/price.mjs", src, &[2], 10);
        assert_eq!(m1, m2, "strictly deterministic");
        assert!(m1.iter().all(|m| m.line == 2));
        assert!(m1.iter().any(|m| m.kind == MutationKind::ComparisonOp && m.mutated.contains("qty > 10")));
        assert!(m1.iter().any(|m| m.kind == MutationKind::ArithmeticOp && m.mutated.contains("price + off")));
        assert!(m1.iter().any(|m| m.kind == MutationKind::BoundaryOffset && m.mutated.contains("11")));
    }

    #[test]
    fn synthesizes_human_reviewable_holdout_drafts_never_auto_approved() {
        let tests = vec![(
            "test/add.test.mjs".to_string(),
            "import test from 'node:test'\nimport assert from 'node:assert'\nimport { add } from '../src/add.mjs'\ntest('add', () => {\n  assert.equal(add(2, 3), 5)\n})\n".to_string(),
        )];
        let d1 = synthesize_holdout_drafts("Fix add() so it adds any two integers", &tests, 3);
        let d2 = synthesize_holdout_drafts("Fix add() so it adds any two integers", &tests, 3);
        assert_eq!(d1, d2, "strictly deterministic");
        assert_eq!(d1.len(), 2);
        assert!(d1.iter().all(|d| !d.human_approved), "Honesty Grammar: never auto-approved");
        assert!(d1[0].filename.starts_with("holdout/synth_add"));
        assert!(d1[0].code.contains("add(15, 16)") && d1[0].code.contains("31"), "{}", d1[0].code);
        assert!(d1[0].code.contains("add(31, 32)") && d1[0].code.contains("63"), "{}", d1[0].code);
        assert!(d1[1].code.contains("add(0, 0)") && d1[1].code.contains("add(-2, -3)"), "{}", d1[1].code);
    }

    #[test]
    fn synthesizes_python_and_rust_drafts_cleanly() {
        let py = vec![(
            "tests/test_calc.py".to_string(),
            "from calc import total\ndef test_t():\n    assert total(4, 6) == 10\n".to_string(),
        )];
        let drafts = synthesize_holdout_drafts("Fix total sum", &py, 2);
        assert_eq!(drafts.len(), 2);
        assert!(drafts[0].filename.ends_with(".py") && drafts[0].code.contains("total(17, 19)"));
        assert!(drafts.iter().all(|d| !d.human_approved));

        let rs = vec![(
            "tests/add.rs".to_string(),
            "#[test]\nfn adds() {\n    assert_eq!(calc::add(2, 3), 5);\n}\n".to_string(),
        )];
        let rs_drafts = synthesize_holdout_drafts("Fix add", &rs, 2);
        assert_eq!(rs_drafts.len(), 2);
        assert!(rs_drafts[0].filename.ends_with(".rs") && rs_drafts[0].code.contains("calc::add(15, 16)"));
        assert!(rs_drafts.iter().all(|d| !d.human_approved));
    }
}
