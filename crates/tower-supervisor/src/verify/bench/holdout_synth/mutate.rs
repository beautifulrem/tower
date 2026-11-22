//! Diff-scoped micro-mutation generator for [`super::holdout_synth`].

use serde::{Deserialize, Serialize};

/// Category of a diff-scoped micro-mutation proposed on a changed source line.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum MutationKind {
    ArithmeticOp,
    ComparisonOp,
    BooleanLiteral,
    BoundaryOffset,
}

/// One deterministic micro-mutation scoped to a changed line in a diff.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct DiffMutation {
    pub file: String,
    /// 1-based line number in the file.
    pub line: usize,
    pub original: String,
    pub mutated: String,
    pub kind: MutationKind,
}

/// Generates deterministic, diff-scoped micro-mutations strictly for `changed_lines`
/// (1-based line numbers) of `src`, capped at `max_mutations`.
pub fn diff_scoped_mutations(
    path: &str,
    src: &str,
    changed_lines: &[usize],
    max_mutations: usize,
) -> Vec<DiffMutation> {
    if max_mutations == 0 || changed_lines.is_empty() {
        return Vec::new();
    }
    let lines: Vec<&str> = src.lines().collect();
    let mut out = Vec::new();
    let mut sorted = changed_lines.to_vec();
    sorted.sort_unstable();
    sorted.dedup();

    for line_no in sorted {
        if out.len() >= max_mutations {
            break;
        }
        let Some(&line) = line_no.checked_sub(1).and_then(|i| lines.get(i)) else { continue };
        let trimmed = line.trim();
        if trimmed.is_empty()
            || ["//", "#", "/*", "*", "import ", "use ", "from "].iter().any(|p| trimmed.starts_with(p))
        {
            continue;
        }

        const CMP_FLIPS: &[(&str, &str)] = &[
            (" === ", " !== "),
            (" !== ", " === "),
            (" >= ", " > "),
            (" <= ", " < "),
            (" == ", " != "),
            (" != ", " == "),
            (" > ", " >= "),
            (" < ", " <= "),
        ];
        for &(from, to) in CMP_FLIPS {
            if out.len() < max_mutations
                && let Some(mutated) = replace_outside_strings(line, from, to)
            {
                out.push(DiffMutation {
                    file: path.to_string(),
                    line: line_no,
                    original: trimmed.to_string(),
                    mutated: mutated.trim().to_string(),
                    kind: MutationKind::ComparisonOp,
                });
                break;
            }
        }

        const ARITH_FLIPS: &[(&str, &str)] = &[(" + ", " - "), (" - ", " + "), (" * ", " / "), (" / ", " * ")];
        for &(from, to) in ARITH_FLIPS {
            if out.len() < max_mutations
                && let Some(mutated) = replace_outside_strings(line, from, to)
            {
                out.push(DiffMutation {
                    file: path.to_string(),
                    line: line_no,
                    original: trimmed.to_string(),
                    mutated: mutated.trim().to_string(),
                    kind: MutationKind::ArithmeticOp,
                });
                break;
            }
        }

        const BOOL_FLIPS: &[(&str, &str)] =
            &[("true", "false"), ("false", "true"), ("True", "False"), ("False", "True")];
        for &(from, to) in BOOL_FLIPS {
            if out.len() < max_mutations
                && let Some(mutated) = replace_word_outside_strings(line, from, to)
            {
                out.push(DiffMutation {
                    file: path.to_string(),
                    line: line_no,
                    original: trimmed.to_string(),
                    mutated: mutated.trim().to_string(),
                    kind: MutationKind::BooleanLiteral,
                });
                break;
            }
        }

        if out.len() < max_mutations
            && let Some(mutated) = mutate_first_number_outside_strings(line)
        {
            out.push(DiffMutation {
                file: path.to_string(),
                line: line_no,
                original: trimmed.to_string(),
                mutated: mutated.trim().to_string(),
                kind: MutationKind::BoundaryOffset,
            });
        }
    }
    out
}

fn is_ident_char(b: u8) -> bool {
    b.is_ascii_alphanumeric() || b == b'_' || b == b'$'
}

fn replace_outside_strings(line: &str, from: &str, to: &str) -> Option<String> {
    let b = line.as_bytes();
    let (mut quote, mut i) = (0u8, 0);
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
        } else if line[i..].starts_with(from) {
            return Some(format!("{}{to}{}", &line[..i], &line[i + from.len()..]));
        }
        i += 1;
    }
    None
}

fn replace_word_outside_strings(line: &str, word: &str, to: &str) -> Option<String> {
    let b = line.as_bytes();
    let (mut quote, mut i) = (0u8, 0);
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
        } else if line[i..].starts_with(word) {
            let before_ok = i == 0 || !is_ident_char(b[i - 1]);
            let after_ok = b.get(i + word.len()).is_none_or(|&ch| !is_ident_char(ch));
            if before_ok && after_ok {
                return Some(format!("{}{to}{}", &line[..i], &line[i + word.len()..]));
            }
        }
        i += 1;
    }
    None
}

fn mutate_first_number_outside_strings(line: &str) -> Option<String> {
    let b = line.as_bytes();
    let (mut quote, mut i) = (0u8, 0);
    while i < b.len() {
        let c = b[i];
        if quote != 0 {
            if c == b'\\' {
                i += 1;
            } else if c == quote {
                quote = 0;
            }
            i += 1;
            continue;
        }
        if matches!(c, b'"' | b'\'' | b'`') {
            quote = c;
            i += 1;
            continue;
        }
        if c.is_ascii_digit() && (i == 0 || !is_ident_char(b[i - 1])) {
            let start = i;
            while i < b.len() && b[i].is_ascii_digit() {
                i += 1;
            }
            if b.get(i).is_none_or(|&ch| ch != b'.' && !is_ident_char(ch))
                && let Ok(v) = line[start..i].parse::<i64>()
            {
                return Some(format!("{}{}{}", &line[..start], v + 1, &line[i..]));
            }
            continue;
        }
        i += 1;
    }
    None
}
