//! Lightweight tree-sitter AST analysis for Tower.
//!
//! Covers four independent jobs with zero `unsafe_code`:
//! - Rust inline test region extraction, restoration and `#[cfg(test)]` cheat detection;
//! - Bypass-around-bug detection (preserved buggy expression behind an early-return or lookup guard);
//! - Bash AST command, subshell, pipeline, redirect and expansion extraction;
//! - Semantic moved-block and formatting-only hunk detection for review noise reduction.

#![forbid(unsafe_code)]

use serde::{Deserialize, Serialize};
use tree_sitter::{Node, Parser, Tree};

pub mod bash;
pub mod bypass;
pub mod moved;
pub mod rust_tests;

pub use bash::{BashAstSummary, BashCommand, BashRedirect, parse_bash_commands};
pub use bypass::{BypassEvidence, BypassKind, detect_bypass_around_bug};
pub use moved::{FormattingHunk, MovedBlock, SemanticDiffSummary, semantic_moved_hunks};
pub use rust_tests::{
    RustCheatKind, RustTestCheat, detect_rust_test_branch_cheat, restore_rust_test_regions, rust_test_spans,
};

/// Supported source languages for AST analysis.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum Language {
    Rust,
    JavaScript,
    TypeScript,
    Tsx,
    Python,
    Bash,
}

impl Language {
    /// Infers the supported AST language from a repository path or filename.
    pub fn from_path(path: &str) -> Option<Self> {
        let name = path.rsplit('/').next().unwrap_or(path);
        let ext = name.rsplit_once('.').map(|(_, e)| e.to_ascii_lowercase())?;
        match ext.as_str() {
            "rs" => Some(Self::Rust),
            "js" | "mjs" | "cjs" | "jsx" => Some(Self::JavaScript),
            "ts" | "mts" | "cts" => Some(Self::TypeScript),
            "tsx" => Some(Self::Tsx),
            "py" | "pyi" => Some(Self::Python),
            "sh" | "bash" => Some(Self::Bash),
            _ => None,
        }
    }

    pub(crate) fn ts_language(self) -> tree_sitter::Language {
        match self {
            Self::Rust => tree_sitter_rust::LANGUAGE.into(),
            Self::JavaScript => tree_sitter_javascript::LANGUAGE.into(),
            Self::TypeScript => tree_sitter_typescript::LANGUAGE_TYPESCRIPT.into(),
            Self::Tsx => tree_sitter_typescript::LANGUAGE_TSX.into(),
            Self::Python => tree_sitter_python::LANGUAGE.into(),
            Self::Bash => tree_sitter_bash::LANGUAGE.into(),
        }
    }
}

/// Half-open byte range (`start_byte..end_byte`) and 1-based inclusive line range.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub struct Span {
    pub start_byte: usize,
    pub end_byte: usize,
    /// 1-based inclusive start line.
    pub start_line: usize,
    /// 1-based inclusive end line.
    pub end_line: usize,
}

pub(crate) fn parse(lang: Language, src: &str) -> Option<Tree> {
    let mut parser = Parser::new();
    parser.set_language(&lang.ts_language()).ok()?;
    parser.parse(src, None)
}

pub(crate) fn span_of(node: Node<'_>) -> Span {
    let start = node.start_position();
    let end = node.end_position();
    let start_line = start.row + 1;
    let end_line = if end.column == 0 && end.row > start.row { end.row } else { end.row + 1 };
    Span { start_byte: node.start_byte(), end_byte: node.end_byte(), start_line, end_line }
}

pub(crate) fn span_from_bytes(src: &str, start_byte: usize, end_byte: usize) -> Span {
    let start_byte = start_byte.min(src.len());
    let end_byte = end_byte.min(src.len()).max(start_byte);
    let start_line = src[..start_byte].bytes().filter(|&b| b == b'\n').count() + 1;
    let slice = &src[start_byte..end_byte];
    let inner_newlines = slice.trim_end_matches('\n').bytes().filter(|&b| b == b'\n').count();
    Span { start_byte, end_byte, start_line, end_line: start_line + inner_newlines }
}

pub(crate) fn node_text<'a>(node: Node<'_>, src: &'a str) -> &'a str {
    src.get(node.start_byte()..node.end_byte()).unwrap_or("")
}

pub(crate) fn is_comment_kind(kind: &str) -> bool {
    matches!(kind, "comment" | "line_comment" | "block_comment")
}

/// Canonical structural serialization of an AST subtree: ignores whitespace,
/// comments, optional semicolons and trailing commas while preserving tree
/// structure and leaf tokens.
pub(crate) fn normalize_node(node: Node<'_>, src: &str) -> String {
    let mut out = String::new();
    write_normalized(node, src, &mut out);
    out
}

fn write_normalized(node: Node<'_>, src: &str, out: &mut String) {
    let kind = node.kind();
    if is_comment_kind(kind) {
        return;
    }
    if node.child_count() == 0 {
        let text = node_text(node, src).trim();
        if text.is_empty() || text == ";" {
            return;
        }
        // Normalize JS/TS string quote delimiters when comparing formatting-equivalent strings
        // only at the caller if needed; keep exact token here so semantics never collide.
        out.push_str(text);
        out.push(' ');
        return;
    }
    out.push('(');
    out.push_str(kind);
    out.push(' ');
    let mut cursor = node.walk();
    let children: Vec<Node<'_>> = node.children(&mut cursor).filter(|c| !is_comment_kind(c.kind())).collect();
    for (idx, child) in children.iter().enumerate() {
        let ck = child.kind();
        // Drop optional semicolons and trailing commas before closing delimiters.
        if ck == ";" {
            continue;
        }
        if ck == "," {
            let next_closes =
                children.get(idx + 1).is_some_and(|n| matches!(n.kind(), ")" | "]" | "}" | "expression_statement"));
            if next_closes || idx + 1 == children.len() {
                continue;
            }
        }
        write_normalized(*child, src, out);
    }
    out.push(')');
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn infers_supported_languages_from_paths() {
        assert_eq!(Language::from_path("src/lib.rs"), Some(Language::Rust));
        assert_eq!(Language::from_path("src/cart.mjs"), Some(Language::JavaScript));
        assert_eq!(Language::from_path("src/app.ts"), Some(Language::TypeScript));
        assert_eq!(Language::from_path("src/App.tsx"), Some(Language::Tsx));
        assert_eq!(Language::from_path("tests/test_app.py"), Some(Language::Python));
        assert_eq!(Language::from_path("scripts/check.sh"), Some(Language::Bash));
        assert_eq!(Language::from_path("README.md"), None);
    }
}
