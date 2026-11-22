//! Condition & lookup-table AST classifiers for [`super::detect_bypass_around_bug`].

use std::collections::{HashMap, HashSet};

use tree_sitter::Node;

use crate::{Language, Span, is_comment_kind, node_text, normalize_node, span_of};

pub(super) fn unwrap_parens(mut node: Node<'_>) -> Node<'_> {
    while matches!(node.kind(), "parenthesized_expression") && node.named_child_count() == 1 {
        let Some(inner) = node.named_child(0) else { break };
        node = inner;
    }
    node
}

pub(super) fn is_trivial_literal(node: Node<'_>) -> bool {
    matches!(
        node.kind(),
        "number"
            | "integer"
            | "float"
            | "integer_literal"
            | "float_literal"
            | "string"
            | "string_literal"
            | "true"
            | "false"
            | "boolean_literal"
            | "null"
            | "undefined"
            | "none"
            | "array"
            | "list"
            | "object"
            | "dictionary"
    )
}

pub(super) fn compact_snippet(s: &str) -> String {
    let one_line: String = s.split_whitespace().collect::<Vec<_>>().join(" ");
    if one_line.chars().count() > 140 {
        let mut cut: String = one_line.chars().take(137).collect();
        cut.push_str("...");
        cut
    } else {
        one_line
    }
}

// ---- Lookup-table bypass detection -----------------------------------------

pub(super) fn collect_top_level_tables(root: Node<'_>, src: &str, lang: Language) -> HashMap<String, (Span, String)> {
    let mut tables = HashMap::new();
    let mut cursor = root.walk();
    for ch in root.children(&mut cursor) {
        scan_decl_for_table(ch, src, lang, &mut tables);
    }
    tables
}

fn scan_decl_for_table(node: Node<'_>, src: &str, lang: Language, out: &mut HashMap<String, (Span, String)>) {
    match node.kind() {
        "export_statement" | "lexical_declaration" | "variable_declaration" | "expression_statement" => {
            let mut cursor = node.walk();
            for ch in node.children(&mut cursor) {
                scan_decl_for_table(ch, src, lang, out);
            }
        }
        "variable_declarator" => {
            if let (Some(n), Some(v)) = (node.child_by_field_name("name"), node.child_by_field_name("value"))
                && is_literal_lookup_table(v, src)
            {
                out.insert(
                    node_text(n, src).trim().to_string(),
                    (span_of(node), compact_snippet(node_text(node, src))),
                );
            }
        }
        "assignment" => {
            if lang == Language::Python
                && let (Some(left), Some(right)) = (node.child_by_field_name("left"), node.child_by_field_name("right"))
                && left.kind() == "identifier"
                && is_literal_lookup_table(right, src)
            {
                out.insert(
                    node_text(left, src).trim().to_string(),
                    (span_of(node), compact_snippet(node_text(node, src))),
                );
            }
        }
        "const_item" | "static_item" => {
            if let (Some(n), Some(v)) = (node.child_by_field_name("name"), node.child_by_field_name("value"))
                && is_literal_lookup_table(v, src)
            {
                out.insert(
                    node_text(n, src).trim().to_string(),
                    (span_of(node), compact_snippet(node_text(node, src))),
                );
            }
        }
        _ => {}
    }
}

fn is_literal_lookup_table(node: Node<'_>, src: &str) -> bool {
    let node = unwrap_parens(node);
    match node.kind() {
        "object" | "dictionary" => {
            let mut cursor = node.walk();
            node.named_children(&mut cursor).any(|c| c.kind() == "pair")
        }
        "new_expression" => node_text(node, src).starts_with("new Map"),
        "call_expression" | "call" => {
            let text = node_text(node, src);
            text.contains("HashMap::from") || text.contains("BTreeMap::from") || text.starts_with("dict(")
        }
        "array" | "list" | "array_expression" => {
            let mut cursor = node.walk();
            let items: Vec<Node<'_>> = node.named_children(&mut cursor).collect();
            !items.is_empty()
                && items.iter().all(|i| {
                    matches!(i.kind(), "array" | "list" | "tuple" | "tuple_expression" | "object" | "dictionary")
                })
        }
        _ => false,
    }
}

pub(super) fn find_new_lookup_bypass(
    base_body: Node<'_>,
    base_src: &str,
    pin_body: Node<'_>,
    pin_src: &str,
    new_top_tables: &HashMap<String, (Span, String)>,
    preserved: Span,
) -> Option<(Span, String)> {
    let base_tables = collect_inline_table_sigs(base_body, base_src);
    if let Some(found) = find_inline_lookup(pin_body, pin_src, &base_tables, preserved) {
        return Some(found);
    }
    if !new_top_tables.is_empty() {
        let mut idents = HashSet::new();
        collect_identifiers(pin_body, pin_src, &mut idents);
        for (name, (span, snippet)) in new_top_tables {
            if idents.contains(name.as_str()) {
                return Some((*span, snippet.clone()));
            }
        }
    }
    None
}

fn collect_inline_table_sigs(node: Node<'_>, src: &str) -> HashSet<String> {
    let mut set = HashSet::new();
    fn walk(n: Node<'_>, src: &str, set: &mut HashSet<String>) {
        if is_literal_lookup_table(n, src)
            || matches!(n.kind(), "switch_statement" | "match_expression" | "match_statement")
        {
            set.insert(normalize_node(n, src));
        }
        let mut c = n.walk();
        for ch in n.children(&mut c) {
            walk(ch, src, set);
        }
    }
    walk(node, src, &mut set);
    set
}

fn find_inline_lookup(
    node: Node<'_>,
    src: &str,
    base_tables: &HashSet<String>,
    preserved: Span,
) -> Option<(Span, String)> {
    if node.start_byte() >= preserved.start_byte && node.end_byte() <= preserved.end_byte {
        return None;
    }
    if is_literal_lookup_table(node, src) && !base_tables.contains(&normalize_node(node, src)) {
        return Some((span_of(node), compact_snippet(node_text(node, src))));
    }
    if matches!(node.kind(), "switch_statement" | "match_expression" | "match_statement")
        && !base_tables.contains(&normalize_node(node, src))
        && has_concrete_literal_case(node, src)
    {
        return Some((span_of(node), compact_snippet(node_text(node, src))));
    }
    let mut cursor = node.walk();
    for ch in node.children(&mut cursor) {
        if let Some(found) = find_inline_lookup(ch, src, base_tables, preserved) {
            return Some(found);
        }
    }
    None
}

fn has_concrete_literal_case(node: Node<'_>, src: &str) -> bool {
    let mut cursor = node.walk();
    for ch in node.children(&mut cursor) {
        if matches!(ch.kind(), "switch_case" | "match_arm" | "case_clause" | "case_pattern" | "match_pattern") {
            let ct = node_text(ch, src);
            if ct.contains('"') || ct.contains('\'') || ct.chars().any(|c| c.is_ascii_digit()) {
                return true;
            }
        }
        if has_concrete_literal_case(ch, src) {
            return true;
        }
    }
    false
}

fn collect_identifiers<'a>(node: Node<'_>, src: &'a str, out: &mut HashSet<&'a str>) {
    if node.kind() == "identifier" {
        out.insert(node_text(node, src));
    }
    let mut cursor = node.walk();
    for ch in node.children(&mut cursor) {
        collect_identifiers(ch, src, out);
    }
}

// ---- Exact-condition / derived-property early-return bypass detection -------

pub(super) fn find_new_condition_bypass(
    base_body: Node<'_>,
    base_src: &str,
    pin_body: Node<'_>,
    pin_src: &str,
    preserved: Span,
) -> Option<(Span, String)> {
    let base_conds = collect_condition_sigs(base_body, base_src);
    search_condition_bypass(pin_body, pin_src, &base_conds, preserved)
}

fn collect_condition_sigs(node: Node<'_>, src: &str) -> HashSet<String> {
    let mut set = HashSet::new();
    fn walk(n: Node<'_>, src: &str, set: &mut HashSet<String>) {
        if let Some(cond) = condition_of(n) {
            set.insert(normalize_node(cond, src));
        }
        let mut c = n.walk();
        for ch in n.children(&mut c) {
            walk(ch, src, set);
        }
    }
    walk(node, src, &mut set);
    set
}

fn condition_of(node: Node<'_>) -> Option<Node<'_>> {
    match node.kind() {
        "if_statement" | "if_expression" | "elif_clause" | "ternary_expression" => {
            node.child_by_field_name("condition")
        }
        "conditional_expression" => node.named_child(1),
        _ => None,
    }
}

fn search_condition_bypass(
    node: Node<'_>,
    src: &str,
    base_conds: &HashSet<String>,
    preserved: Span,
) -> Option<(Span, String)> {
    if node.start_byte() >= preserved.start_byte && node.end_byte() <= preserved.end_byte {
        return None;
    }
    if let Some(cond) = condition_of(node)
        && !base_conds.contains(&normalize_node(cond, src))
        && guard_precedes_or_wraps_preserved(node, preserved)
        && is_point_bypass_guard(node, cond, src)
    {
        return Some((span_of(node), compact_snippet(node_text(node, src))));
    }
    let mut cursor = node.walk();
    for ch in node.children(&mut cursor) {
        if let Some(found) = search_condition_bypass(ch, src, base_conds, preserved) {
            return Some(found);
        }
    }
    None
}

fn guard_precedes_or_wraps_preserved(guard: Node<'_>, preserved: Span) -> bool {
    let precedes = guard.end_byte() <= preserved.start_byte;
    let wraps_as_else = guard.start_byte() <= preserved.start_byte && guard.end_byte() >= preserved.end_byte;
    precedes || wraps_as_else
}

#[derive(Default)]
struct CondStats {
    non_zero_eqs: usize,
    compound_eqs: usize,
    has_divisibility_mod: bool,
    has_inequality: bool,
    has_single_non_trivial_const_eq: bool,
}

fn is_point_bypass_guard(guard: Node<'_>, cond: Node<'_>, src: &str) -> bool {
    let mut stats = CondStats::default();
    analyze_condition(unwrap_parens(cond), src, &mut stats);

    if stats.non_zero_eqs == 0 && stats.compound_eqs == 0 {
        return false;
    }
    // Calendar / periodic divisibility predicate (`month === 2 && year % 4 === 0`).
    if stats.has_divisibility_mod && stats.non_zero_eqs <= 1 && stats.compound_eqs == 0 {
        return false;
    }
    if stats.non_zero_eqs >= 2 || stats.compound_eqs >= 1 {
        return true;
    }
    stats.has_single_non_trivial_const_eq
        && !stats.has_inequality
        && !stats.has_divisibility_mod
        && branch_returns_nontrivial_literal(guard, src)
}

fn analyze_condition(node: Node<'_>, src: &str, stats: &mut CondStats) {
    let node = unwrap_parens(node);
    match node.kind() {
        "binary_expression" | "comparison_operator" => {
            if let (Some(left), Some(right)) = (node.child_by_field_name("left"), node.child_by_field_name("right")) {
                let op = src.get(left.end_byte()..right.start_byte()).unwrap_or("").trim();
                match op {
                    "&&" | "||" | "and" | "or" => {
                        analyze_condition(left, src, stats);
                        analyze_condition(right, src, stats);
                    }
                    "<" | "<=" | ">" | ">=" => stats.has_inequality = true,
                    "==" | "===" => classify_equality(left, right, src, stats),
                    "!=" | "!==" if is_modulo_zero(left, right, src) => stats.has_divisibility_mod = true,
                    _ => {}
                }
                return;
            }
            if node.kind() == "comparison_operator" && node.child_count() >= 3 {
                let mut cursor = node.walk();
                let children: Vec<Node<'_>> = node.children(&mut cursor).collect();
                for w in children.windows(3) {
                    match node_text(w[1], src).trim() {
                        "==" => classify_equality(w[0], w[2], src, stats),
                        "!=" if is_modulo_zero(w[0], w[2], src) => stats.has_divisibility_mod = true,
                        "<" | "<=" | ">" | ">=" => stats.has_inequality = true,
                        _ => {}
                    }
                }
            }
        }
        "boolean_operator" => {
            let mut cursor = node.walk();
            for ch in node.named_children(&mut cursor) {
                analyze_condition(ch, src, stats);
            }
        }
        "call_expression" | "call" if node_text(node, src).starts_with("Object.is(") => {
            stats.non_zero_eqs += 1;
            stats.compound_eqs += 1;
        }
        _ => {}
    }
}

fn is_modulo_zero(left: Node<'_>, right: Node<'_>, src: &str) -> bool {
    let (l, r) = (unwrap_parens(left), unwrap_parens(right));
    let is_mod =
        |n: Node<'_>| matches!(n.kind(), "binary_expression" | "binary_operator") && node_text(n, src).contains('%');
    let is_zero = |n: Node<'_>| node_text(n, src).trim() == "0";
    (is_mod(l) && is_zero(r)) || (is_mod(r) && is_zero(l))
}

fn classify_equality(left: Node<'_>, right: Node<'_>, src: &str, stats: &mut CondStats) {
    let (l, r) = (unwrap_parens(left), unwrap_parens(right));
    if is_modulo_zero(l, r, src) {
        stats.has_divisibility_mod = true;
        return;
    }
    let (expr, lit) = if is_concrete_equality_literal(r) && !is_concrete_equality_literal(l) {
        (l, r)
    } else if is_concrete_equality_literal(l) && !is_concrete_equality_literal(r) {
        (r, l)
    } else {
        return;
    };

    let lit_text = node_text(lit, src).trim();
    if is_boundary_literal(lit_text) {
        return;
    }
    stats.non_zero_eqs += 1;

    if matches!(expr.kind(), "tuple" | "tuple_expression" | "array" | "list") {
        stats.compound_eqs += 1;
        return;
    }
    match expr.kind() {
        "binary_expression" | "binary_operator" | "call_expression" | "call" | "method_call_expression" => {
            stats.compound_eqs += 1;
        }
        "member_expression" | "attribute" | "field_expression" | "subscript_expression" | "subscript" => {
            let et = node_text(expr, src);
            if et.contains('[') || et.matches('.').count() >= 2 {
                stats.compound_eqs += 1;
            }
        }
        "identifier" if !matches!(lit_text, "1" | "-1") => {
            stats.has_single_non_trivial_const_eq = true;
        }
        _ => {}
    }
}

/// True for a scalar literal, unary numeric literal (`-5`), or a tuple/array/list
/// whose elements are ALL concrete literals (`(2, 3)` is true; `(a, b)` is false).
fn is_concrete_equality_literal(node: Node<'_>) -> bool {
    let node = unwrap_parens(node);
    match node.kind() {
        "number" | "integer" | "float" | "integer_literal" | "float_literal" | "string" | "string_literal" | "true"
        | "false" | "boolean_literal" | "null" | "undefined" | "none" => true,
        "unary_expression" | "unary_operator" => {
            let mut c = node.walk();
            let args: Vec<Node<'_>> = node.named_children(&mut c).collect();
            !args.is_empty() && args.iter().all(|a| is_concrete_equality_literal(*a))
        }
        "tuple" | "tuple_expression" | "array" | "list" => {
            let mut c = node.walk();
            let elems: Vec<Node<'_>> = node.named_children(&mut c).collect();
            !elems.is_empty() && elems.iter().all(|e| is_concrete_equality_literal(*e))
        }
        _ => false,
    }
}

fn is_boundary_literal(t: &str) -> bool {
    matches!(
        t,
        "0" | "0.0" | "null" | "undefined" | "None" | "false" | "true" | "False" | "True" | "\"\"" | "''" | "[]"
    )
}

fn branch_returns_nontrivial_literal(guard: Node<'_>, src: &str) -> bool {
    let branch = match guard.kind() {
        "if_statement" | "if_expression" | "elif_clause" | "ternary_expression" => {
            guard.child_by_field_name("consequence")
        }
        "conditional_expression" => guard.named_child(0),
        _ => None,
    };
    let Some(e) = branch.and_then(extract_returned_expr).map(unwrap_parens) else { return false };
    if !is_trivial_literal(e) {
        return false;
    }
    let t = node_text(e, src).trim();
    !is_boundary_literal(t) && !matches!(t, "1" | "-1")
}

fn extract_returned_expr(node: Node<'_>) -> Option<Node<'_>> {
    match node.kind() {
        "return_statement" | "return_expression" => {
            let mut c = node.walk();
            node.named_children(&mut c).find(|ch| !is_comment_kind(ch.kind()))
        }
        "statement_block" | "block" => {
            let mut c = node.walk();
            let stmts: Vec<Node<'_>> = node.named_children(&mut c).filter(|ch| !is_comment_kind(ch.kind())).collect();
            if stmts.len() == 1 {
                extract_returned_expr(stmts[0]).or(Some(stmts[0]))
            } else {
                stmts.iter().find_map(|s| {
                    matches!(s.kind(), "return_statement" | "return_expression")
                        .then(|| extract_returned_expr(*s))
                        .flatten()
                })
            }
        }
        _ => Some(node),
    }
}
