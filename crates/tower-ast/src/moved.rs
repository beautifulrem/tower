//! Semantic moved-block and formatting-only hunk detection for Review noise reduction.

use std::collections::{HashMap, HashSet};

use serde::{Deserialize, Serialize};
use tree_sitter::Node;

use crate::{Language, Span, is_comment_kind, node_text, normalize_node, parse, span_of};

/// An AST-equivalent code block that moved to a different relative position.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct MovedBlock {
    /// AST node kind (e.g. `"function_item"`, `"function_declaration"`, `"method_definition"`).
    pub kind: String,
    /// Declared symbol name when present.
    pub name: Option<String>,
    /// Span in `old_src`.
    pub old_span: Span,
    /// Span in `new_src`.
    pub new_span: Span,
    /// True if the block text is identical after stripping outer indentation.
    pub exact_text: bool,
}

/// A code region whose text changed only in formatting/comments while preserving
/// an identical normalized AST.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct FormattingHunk {
    pub old_span: Span,
    pub new_span: Span,
}

/// AST-level diff noise summary between `old_src` and `new_src`.
#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize)]
pub struct SemanticDiffSummary {
    /// Blocks moved to a different relative position with an identical normalized AST.
    pub moved_blocks: Vec<MovedBlock>,
    /// Regions whose text changed only in formatting/comments (identical normalized AST).
    pub formatting_hunks: Vec<FormattingHunk>,
    /// True when the entire file has an identical normalized AST (pure formatting/comments).
    pub file_formatting_only: bool,
}

impl SemanticDiffSummary {
    /// Classifies a diff hunk's 1-based inclusive `(start_line, end_line)` ranges
    /// as `(moved_unchanged, formatting_only)`.
    pub fn classify_hunk(&self, old_lines: Option<(usize, usize)>, new_lines: Option<(usize, usize)>) -> (bool, bool) {
        let moved = self.moved_blocks.iter().any(|b| {
            old_lines.is_some_and(|r| range_inside(r, b.old_span))
                || new_lines.is_some_and(|r| range_inside(r, b.new_span))
        });
        if moved {
            return (true, false);
        }
        if self.file_formatting_only {
            return (false, true);
        }
        let formatting = self.formatting_hunks.iter().any(|h| {
            old_lines.is_some_and(|r| range_inside(r, h.old_span))
                && new_lines.is_some_and(|r| range_inside(r, h.new_span))
        });
        (false, formatting)
    }
}

fn range_inside(range: (usize, usize), span: Span) -> bool {
    range.0 >= span.start_line && range.1 <= span.end_line
}

#[derive(Debug, Clone)]
struct BlockItem {
    kind: String,
    name: Option<String>,
    span: Span,
    sig: String,
    dedented: String,
    raw: String,
}

/// Compares `old_src` and `new_src` via AST normalization to detect moved blocks
/// and pure-formatting hunks.
pub fn semantic_moved_hunks(old_src: &str, new_src: &str, lang: Language) -> SemanticDiffSummary {
    if old_src == new_src {
        return SemanticDiffSummary::default();
    }
    let Some(old_tree) = parse(lang, old_src) else { return SemanticDiffSummary::default() };
    let Some(new_tree) = parse(lang, new_src) else { return SemanticDiffSummary::default() };

    let old_root = old_tree.root_node();
    let new_root = new_tree.root_node();
    // Bail out on broken parses so syntax errors never falsely fold a hunk.
    if old_root.has_error() || new_root.has_error() {
        return SemanticDiffSummary::default();
    }

    let file_formatting_only = normalize_node(old_root, old_src) == normalize_node(new_root, new_src);
    let old_blocks = extract_blocks(old_root, old_src, lang);
    let new_blocks = extract_blocks(new_root, new_src, lang);

    // Match blocks 1-to-1 by identical normalized AST signature.
    let mut new_by_sig: HashMap<&str, Vec<usize>> = HashMap::new();
    for (idx, b) in new_blocks.iter().enumerate() {
        new_by_sig.entry(b.sig.as_str()).or_default().push(idx);
    }

    let mut used_new: HashSet<usize> = HashSet::new();
    let mut pairs: Vec<(usize, usize)> = Vec::new();
    for (oi, ob) in old_blocks.iter().enumerate() {
        let Some(candidates) = new_by_sig.get(ob.sig.as_str()) else { continue };
        // Prefer unused match with closest start line.
        let best = candidates
            .iter()
            .copied()
            .filter(|ni| !used_new.contains(ni))
            .min_by_key(|&ni| ob.span.start_line.abs_diff(new_blocks[ni].span.start_line));
        if let Some(ni) = best {
            used_new.insert(ni);
            pairs.push((oi, ni));
        }
    }

    // Blocks whose matched `new_idx` falls outside the Longest Increasing
    // Subsequence were genuinely reordered/moved relative to their peers.
    let in_order = lis_positions(&pairs);
    let mut moved_blocks = Vec::new();
    let mut formatting_hunks = Vec::new();

    for (pos, &(oi, ni)) in pairs.iter().enumerate() {
        let ob = &old_blocks[oi];
        let nb = &new_blocks[ni];
        if !in_order.contains(&pos) {
            moved_blocks.push(MovedBlock {
                kind: nb.kind.clone(),
                name: nb.name.clone(),
                old_span: ob.span,
                new_span: nb.span,
                exact_text: ob.dedented == nb.dedented,
            });
        } else if ob.raw != nb.raw {
            formatting_hunks.push(FormattingHunk { old_span: ob.span, new_span: nb.span });
        }
    }

    if file_formatting_only && formatting_hunks.is_empty() && !old_src.is_empty() && !new_src.is_empty() {
        formatting_hunks.push(FormattingHunk { old_span: span_of(old_root), new_span: span_of(new_root) });
    }

    SemanticDiffSummary { moved_blocks, formatting_hunks, file_formatting_only }
}

fn extract_blocks(root: Node<'_>, src: &str, lang: Language) -> Vec<BlockItem> {
    let mut out = Vec::new();
    collect_blocks(root, src, lang, 0, &mut out);
    out
}

fn collect_blocks(node: Node<'_>, src: &str, lang: Language, depth: usize, out: &mut Vec<BlockItem>) {
    let mut cursor = node.walk();
    for ch in node.children(&mut cursor) {
        let kind = ch.kind();
        if is_comment_kind(kind) {
            continue;
        }
        // Unwrap `export_statement` in JS/TS so exported declarations are matched directly.
        if kind == "export_statement"
            && depth == 0
            && let Some(decl) = ch.child_by_field_name("declaration")
        {
            push_block(ch, decl, src, out);
            continue;
        }
        if is_block_kind(kind, lang) {
            push_block(ch, ch, src, out);
            // Also extract methods inside classes / Rust impls / mods when top-level.
            if depth == 0
                && matches!(kind, "class_declaration" | "class_definition" | "impl_item" | "mod_item")
                && let Some(body) = ch.child_by_field_name("body")
            {
                collect_blocks(body, src, lang, depth + 1, out);
            }
        }
    }
}

fn push_block(outer: Node<'_>, named: Node<'_>, src: &str, out: &mut Vec<BlockItem>) {
    let raw = node_text(outer, src);
    let sig = normalize_node(outer, src);
    if sig.is_empty() {
        return;
    }
    let name = extract_block_name(named, src);
    out.push(BlockItem {
        kind: named.kind().to_string(),
        name,
        span: span_of(outer),
        sig,
        dedented: dedent(raw),
        raw: raw.to_string(),
    });
}

fn extract_block_name(node: Node<'_>, src: &str) -> Option<String> {
    if let Some(n) = node.child_by_field_name("name") {
        return Some(node_text(n, src).trim().to_string());
    }
    if matches!(node.kind(), "lexical_declaration" | "variable_declaration") {
        let mut c = node.walk();
        for ch in node.named_children(&mut c) {
            if ch.kind() == "variable_declarator"
                && let Some(n) = ch.child_by_field_name("name")
            {
                return Some(node_text(n, src).trim().to_string());
            }
        }
    }
    None
}

fn is_block_kind(kind: &str, lang: Language) -> bool {
    match lang {
        Language::Rust => matches!(
            kind,
            "function_item"
                | "struct_item"
                | "enum_item"
                | "trait_item"
                | "impl_item"
                | "mod_item"
                | "const_item"
                | "static_item"
                | "type_item"
                | "macro_definition"
        ),
        Language::JavaScript | Language::TypeScript | Language::Tsx => matches!(
            kind,
            "function_declaration"
                | "method_definition"
                | "class_declaration"
                | "interface_declaration"
                | "type_alias_declaration"
                | "enum_declaration"
                | "lexical_declaration"
                | "variable_declaration"
        ),
        Language::Python => matches!(kind, "function_definition" | "class_definition" | "decorated_definition"),
        Language::Bash => matches!(kind, "function_definition"),
    }
}

fn dedent(s: &str) -> String {
    let min_indent =
        s.lines().filter(|l| !l.trim().is_empty()).map(|l| l.len() - l.trim_start().len()).min().unwrap_or(0);
    s.lines()
        .map(|l| if l.len() >= min_indent { &l[min_indent..] } else { l.trim_start() })
        .collect::<Vec<_>>()
        .join("\n")
}

/// Returns the indices into `pairs` belonging to the Longest Increasing
/// Subsequence of `new_idx` (these items preserved relative order and were not moved).
fn lis_positions(pairs: &[(usize, usize)]) -> HashSet<usize> {
    let n = pairs.len();
    if n == 0 {
        return HashSet::new();
    }
    let mut dp = vec![1usize; n];
    let mut prev: Vec<Option<usize>> = vec![None; n];
    let mut best = 0usize;
    for i in 0..n {
        for j in 0..i {
            if pairs[j].1 < pairs[i].1 && dp[j] + 1 > dp[i] {
                dp[i] = dp[j] + 1;
                prev[i] = Some(j);
            }
        }
        if dp[i] > dp[best] {
            best = i;
        }
    }
    let mut keep = HashSet::new();
    let mut cur = Some(best);
    while let Some(idx) = cur {
        keep.insert(idx);
        cur = prev[idx];
    }
    keep
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn identifies_reordered_blocks_without_flagging_merely_shifted_blocks() {
        let old = "pub fn alpha(x: i32) -> i32 {\n    x + 1\n}\n\npub fn beta(x: i32) -> i32 {\n    x * 2\n}\n\npub fn gamma(x: i32) -> i32 {\n    x - 3\n}\n";
        let reordered = "pub fn beta(x: i32) -> i32 {\n    x * 2\n}\n\npub fn gamma(x: i32) -> i32 {\n    x - 3\n}\n\npub fn alpha(x: i32) -> i32 {\n    x + 1\n}\n";
        let s = semantic_moved_hunks(old, reordered, Language::Rust);
        assert!(!s.file_formatting_only);
        assert_eq!(s.moved_blocks.len(), 1, "{s:?}");
        assert_eq!(s.moved_blocks[0].name.as_deref(), Some("alpha"));
        assert!(s.moved_blocks[0].exact_text);
        assert_eq!(s.classify_hunk(Some((1, 3)), None), (true, false));

        // Merely inserting a new function at the top shifts existing functions down: NOT moved.
        let shifted = "pub fn zero() -> i32 {\n    0\n}\n\n".to_string() + old;
        let s2 = semantic_moved_hunks(old, &shifted, Language::Rust);
        assert!(s2.moved_blocks.is_empty(), "{s2:?}");
    }

    #[test]
    fn identifies_pure_formatting_hunks_and_whole_file_reformat() {
        let old = "export function total(a, b) {\n  return a + b;\n}\n";
        let reformatted = "export function total(\n  a,\n  b,\n) {\n  // sum two numbers\n  return a + b\n}\n";
        let s = semantic_moved_hunks(old, reformatted, Language::JavaScript);
        assert!(s.file_formatting_only, "{s:?}");
        assert!(!s.formatting_hunks.is_empty());
        assert_eq!(s.classify_hunk(Some((1, 3)), Some((1, 7))), (false, true));

        // Real logic change is NOT formatting-only.
        let changed = "export function total(a, b) {\n  return a * b;\n}\n";
        let s3 = semantic_moved_hunks(old, changed, Language::JavaScript);
        assert!(!s3.file_formatting_only);
        assert!(s3.formatting_hunks.is_empty());
        assert!(s3.moved_blocks.is_empty());
    }
}
