//! Everything Tower injects into the model (`docs/05` §5.6). Kept small and
//! fully visible: each injected text is also recorded in the trace as
//! injected by Tower. Always English; only the language the agent writes to
//! the human follows the settings.

use std::path::Path;

use serde::{Deserialize, Serialize};
use tower_core::Lang;
use tower_core::contract::{Autonomy, Contract, CriterionKind};
use tower_core::i18n::sentinel_title;
use tower_pi::ImageAttachment;

/// Reference to an image or visual attachment stored inside a goal's private
/// read-allowed folder (e.g. pasted screenshots on contracts or steers).
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct PromptAttachment {
    /// Absolute or goal-relative path inside the goal's private attachments folder.
    pub path: String,
    /// MIME type (`image/png`, `image/jpeg`, `image/webp`, `image/gif`).
    pub mime_type: String,
    /// Optional human-readable label or filename.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub label: Option<String>,
}

/// Appended to Pi's system prompt for every run of a goal. Stays well under
/// the 650-token resident budget (`ADR-009`); the full contract travels in
/// the first prompt instead.
///
/// `memory` holds the human's user and project notes (`docs/09`), already
/// bounded by the caller; `language` is the language the human reads.
pub fn system_section(goal_id: &str, memory: &[(&str, &str)], language: &str) -> String {
    let mut s = format!(
        "## Tower goal {goal_id}\n\
You are working on one goal supervised by a human through Tower. The workspace is a private clone; \
the human sees your work as a goal page, not as this chat.\n\
- Use `log` for anything the human should see: the cause you found, a decision and its reason, an \
assumption that needs confirming, your next step. One sentence each.\n\
- Use `ask_user` only when the contract leaves a real decision open. Otherwise decide and log it.\n\
- When every acceptance criterion is met, call `submit` once and stop. Tower re-runs the criteria in a \
clean checkout; your own word does not complete the goal.\n\
- If the goal is impossible, contradictory, or blocked by the contract or sandbox, call `submit` with \
`outcome: \"blocked\"` and `blocker_reason`. Honest blocker reports are explicitly sanctioned and \
always preferred over workarounds or weakening tests.\n\
- Stay inside the contract's scope. Writes outside it, new dependencies and one-way actions need approval.\n\
- Write log, ask_user and submit text in {language}."
    );
    for (label, text) in memory.iter().filter(|(_, t)| !t.trim().is_empty()) {
        s.push_str(&format!("\n\n### {label} (written by the human; follow it)\n{}", clip(text.trim(), MEMORY_CHARS)));
    }
    s
}

/// Each memory block is bounded so the resident prompt stays small.
pub const MEMORY_CHARS: usize = 800;

fn clip(s: &str, n: usize) -> String {
    if s.chars().count() <= n { s.to_string() } else { format!("{}…", s.chars().take(n).collect::<String>()) }
}

fn autonomy_label(a: Autonomy) -> &'static str {
    match a {
        Autonomy::Cautious => "cautious (ask before any non-read-only shell command)",
        Autonomy::Standard => "standard (edit in scope and run tests directly; ask for dependencies, CI, deletions)",
        Autonomy::Autonomous => "autonomous (ask only for one-way actions such as push or publish)",
    }
}

/// Renders attached screenshots/images as a compact section pointing to their
/// sandbox-readable paths so both multimodal and text-only engines can use them.
pub fn attachments_section(attachments: &[PromptAttachment]) -> String {
    if attachments.is_empty() {
        return String::new();
    }
    let mut s = String::from("\n## Attached images\n");
    for a in attachments {
        let name = a.label.as_deref().filter(|l| !l.trim().is_empty()).unwrap_or(&a.path);
        s.push_str(&format!("- {name} ({}, path: `{}`)\n", a.mime_type, a.path));
    }
    s.push_str(
        "Attached images are included inline when supported and remain readable via `read` at the path above.\n",
    );
    s
}

/// Loads image attachments for multimodal delivery ONLY when their canonical
/// path lies inside `allowed_roots` (the goal's private attachments folder or
/// workspace). Paths outside `allowed_roots` are silently skipped so an
/// attachment reference can never bypass Tower's sandbox boundary.
pub fn load_image_attachments(attachments: &[PromptAttachment], allowed_roots: &[&Path]) -> Vec<ImageAttachment> {
    let roots: Vec<_> = allowed_roots.iter().filter_map(|r| std::fs::canonicalize(r).ok()).collect();
    let mut out = Vec::new();
    for a in attachments {
        let Ok(canon) = std::fs::canonicalize(&a.path) else {
            continue;
        };
        if !roots.iter().any(|r| canon.starts_with(r)) {
            tracing::warn!(path = %a.path, "refused to load prompt attachment outside goal directories");
            continue;
        }
        match ImageAttachment::from_file(&canon, a.label.clone()) {
            Ok(img) => out.push(img),
            Err(e) => tracing::warn!(path = %a.path, error = %e, "could not load image attachment"),
        }
    }
    out
}

/// The contract rendered for the model.
pub fn contract_brief(title: &str, c: &Contract) -> String {
    let mut s = format!("# Goal: {title}\n\n## Intent\n{}\n", c.intent.trim());
    if !c.done_when.trim().is_empty() {
        s.push_str(&format!("\n## Done when\n{}\n", c.done_when.trim()));
    }
    if !c.constraints.is_empty() {
        s.push_str("\n## Constraints\n");
        for k in &c.constraints {
            s.push_str(&format!("- {k}\n"));
        }
    }
    s.push_str("\n## Acceptance criteria\n");
    if c.criteria.is_empty() {
        s.push_str("(none: the human will judge the result)\n");
    }
    for cr in &c.criteria {
        match &cr.kind {
            CriterionKind::Exec { command, .. } => {
                s.push_str(&format!("- {} {}: `{}` exits 0\n", cr.id, cr.title, command))
            }
            CriterionKind::Human => s.push_str(&format!("- {} {} (checked by the human)\n", cr.id, cr.title)),
            CriterionKind::Look { start, url, steps, .. } => {
                s.push_str(&format!(
                    "- {} {} (checked by the human from screenshots of {url} after `{start}`; make sure that starts the app)\n",
                    cr.id, cr.title
                ));
                if let Some(steps) = steps.as_ref().filter(|s| !s.is_empty()) {
                    s.push_str(&format!(
                        "  The picture is taken after these steps on the page: {}\n",
                        steps.join("; ")
                    ));
                }
            }
        }
    }
    let sc = &c.scope;
    if !sc.include.is_empty() || !sc.exclude.is_empty() || !sc.readonly.is_empty() {
        s.push_str("\n## Scope\n");
        if !sc.include.is_empty() {
            s.push_str(&format!("- May change: {}\n", sc.include.join(", ")));
        }
        if !sc.exclude.is_empty() {
            s.push_str(&format!("- Must not change: {}\n", sc.exclude.join(", ")));
        }
        if !sc.readonly.is_empty() {
            s.push_str(&format!("- Read-only: {}\n", sc.readonly.join(", ")));
        }
    }
    s.push_str(&format!("\n## Autonomy\n{}\n", autonomy_label(c.autonomy)));
    if !c.network {
        s.push_str("\n## Network\nNo network beyond this machine. ");
        if c.loopback_open {
            s.push_str(
                "On this machine, every port except services that were already listening when a command started.\n",
            );
        } else {
            let declared = c.declared_ports();
            let list = if declared.is_empty() {
                "none".to_string()
            } else {
                declared.iter().map(u16::to_string).collect::<Vec<_>>().join(", ")
            };
            s.push_str(&format!(
                "On this machine, a command reaches only the ports the contract declares ({list}) and servers your \
own earlier commands left listening (Tower opens their ports within seconds). A server a command starts and \
connects to in the same command is unreachable unless it listens on a declared port.\n"
            ));
        }
    }
    if !c.stop_conditions.is_empty() {
        s.push_str("\n## Stop and ask the human (ask_user) when\n");
        for k in &c.stop_conditions {
            s.push_str(&format!("- {k}\n"));
        }
    }
    s
}

pub fn initial(title: &str, c: &Contract) -> String {
    initial_with_attachments(title, c, &[])
}

/// First prompt for a goal, including any pasted screenshot attachments.
pub fn initial_with_attachments(title: &str, c: &Contract, attachments: &[PromptAttachment]) -> String {
    format!(
        "{}{}\nStart by reading the relevant code. Log the cause or plan as soon as you have one.",
        contract_brief(title, c),
        attachments_section(attachments)
    )
}

/// Formats a human steering message together with any attached images.
pub fn steer_with_attachments(text: &str, attachments: &[PromptAttachment]) -> String {
    if attachments.is_empty() {
        text.to_string()
    } else {
        format!("{}\n{}", text.trim(), attachments_section(attachments))
    }
}

/// One failed criterion, as evidence for rework.
#[derive(Debug, Clone)]
pub struct Failure {
    pub id: String,
    pub title: String,
    pub command: String,
    pub exit_code: Option<i32>,
    pub output_tail: String,
}

const EVIDENCE_CHARS: usize = 4_000;

fn tail_chars(s: &str, n: usize) -> &str {
    let count = s.chars().count();
    if count <= n {
        return s;
    }
    let skip = count - n;
    let idx = s.char_indices().nth(skip).map(|(i, _)| i).unwrap_or(0);
    &s[idx..]
}

pub fn rework(cycle: u32, max: u32, failures: &[Failure]) -> String {
    let mut s =
        format!("Tower verified your submission in a clean checkout and it did not pass (rework {cycle}/{max}).\n");
    for f in failures {
        s.push_str(&format!(
            "\n### {} {} — `{}` exited {}\n```\n{}\n```\n",
            f.id,
            f.title,
            f.command,
            f.exit_code.map(|c| c.to_string()).unwrap_or_else(|| "without a code".into()),
            tail_chars(f.output_tail.trim(), EVIDENCE_CHARS)
        ));
    }
    s.push_str(
        "\nFix the cause (not the test), log what was wrong, then submit again. \
If the specification is genuinely impossible or contradictory within the contract, call `submit` with `outcome: \"blocked\"` and `blocker_reason`.",
    );
    s
}

/// The names of the tests that failed in a runner's output (node:test,
/// Jest, Vitest, Mocha, pytest, cargo, go), at most ten.
pub fn failing_tests(output: &str) -> Vec<String> {
    let mut out: Vec<String> = Vec::new();
    for line in output.lines() {
        let l = line.trim();
        let name = if let Some(rest) = l.strip_prefix("not ok ") {
            rest.split_once(" - ").map(|(_, n)| n.trim().to_string())
        } else if let Some(rest) =
            l.strip_prefix("✖ ").or_else(|| l.strip_prefix("✕ ")).or_else(|| l.strip_prefix("× "))
        {
            // Drop a trailing duration: `name (1.2ms)`.
            Some(
                rest.rsplit_once(" (")
                    .map_or(rest, |(n, t)| if t.ends_with("ms)") || t.ends_with("s)") { n } else { rest })
                    .trim()
                    .to_string(),
            )
        } else if let Some(rest) = l.strip_prefix("FAILED ") {
            Some(rest.split(" - ").next().unwrap_or(rest).trim().to_string())
        } else if let Some(rest) = l.strip_prefix("--- FAIL: ") {
            Some(rest.split_whitespace().next().unwrap_or(rest).to_string())
        } else if let Some(rest) = l.strip_prefix("test ").filter(|r| r.ends_with("... FAILED")) {
            Some(rest.trim_end_matches("... FAILED").trim().to_string())
        } else {
            l.strip_prefix("● ").map(|rest| rest.trim().to_string())
        };
        // (Not the runner's own headings: `✖ failing tests:`.)
        if let Some(n) = name.filter(|n| !n.is_empty() && !n.starts_with("tower canary") && !n.ends_with(':'))
            && !out.contains(&n)
        {
            out.push(n);
        }
        if out.len() == 10 {
            break;
        }
    }
    out
}

/// What the agent hears when the human tells it only which held-out tests
/// failed: their names, nothing of their code or output.
pub fn held_out_names(cycle: u32, max: u32, failing: &[(String, String, Vec<String>)]) -> String {
    let mut s = format!(
        "Tower verified your submission against held-out tests you cannot see, and some failed (rework {cycle}/{max}). \
The human chose to tell you only their names:\n"
    );
    for (id, title, names) in failing {
        s.push_str(&format!("\n### {id} {title}\n"));
        if names.is_empty() {
            s.push_str("- (the names could not be read from the output)\n");
        }
        for n in names {
            s.push_str(&format!("- {n}\n"));
        }
    }
    s.push_str("\nThink about what behaviour these names describe, fix the code (not by guessing at the tests), log what was wrong, then submit again.");
    s
}

pub fn resume(reason: &str, human_notes: &[String], human_edits: &[String]) -> String {
    let mut s = format!("The goal was paused ({reason}) and the human resumed it. Continue from where you stopped.");
    if !human_edits.is_empty() {
        s.push_str(
            "\n\nWhile paused, the human edited these files in your workspace. Read them before continuing \
and keep their changes unless they conflict with the contract:\n",
        );
        for f in human_edits.iter().take(50) {
            s.push_str(&format!("- {f}\n"));
        }
    }
    if !human_notes.is_empty() {
        s.push_str("\n\nWhile paused, the human wrote:\n");
        for n in human_notes {
            s.push_str(&format!("- {n}\n"));
        }
    }
    s
}

/// A review comment the human left on a line of the diff.
#[derive(Debug, Clone)]
pub struct Comment {
    pub path: String,
    pub line: Option<u32>,
    pub old_line: Option<u32>,
    pub text: String,
}

pub fn request_changes(summary: &str, comments: &[Comment]) -> String {
    let mut s = String::from("The human reviewed your change and asked for changes.\n");
    if !summary.trim().is_empty() {
        s.push_str(&format!("\n{}\n", summary.trim()));
    }
    for c in comments {
        match (c.line, c.old_line) {
            (Some(l), _) => s.push_str(&format!("\n- {}:{} — {}", c.path, l, c.text)),
            (None, Some(l)) => s.push_str(&format!("\n- {}: old line {} (deleted) — {}", c.path, l, c.text)),
            (None, None) => s.push_str(&format!("\n- {} — {}", c.path, c.text)),
        }
    }
    s.push_str("\n\nAddress every comment, then submit again.");
    s
}

/// The PR's CI failed after the human accepted and pushed the change.
pub fn ci_failures(url: &str, report: &str) -> String {
    format!(
        "The change you made was accepted and pushed as a pull request ({url}), but its CI checks failed. \
Fix the causes in this workspace. Do not weaken or skip tests or checks to make them pass.\n\nFailing checks:\n{report}\n\nThen submit again."
    )
}

/// Rework after sentinels fired on a snapshot that otherwise passed.
pub fn sentinel_rework(hits: &[tower_core::sentinel::SentinelHit]) -> String {
    let mut s = String::from(
        "Tower's checks found changes that can make tests pass without fixing the problem. \
The human asked you to redo the work without them:\n",
    );
    for h in hits {
        let title = sentinel_title(&h.sentinel, Lang::En).unwrap_or(&h.title);
        s.push_str(&format!("\n- {title}:\n{}\n", h.detail));
    }
    s.push_str(
        "\nRestore the tests and the test command, fix the cause, log what you changed, then submit again. \
If the goal cannot be satisfied honestly within the contract, call `submit` with `outcome: \"blocked\"` and `blocker_reason`.",
    );
    s
}

pub const NUDGE: &str = "You stopped without calling `submit`. If the goal is done, call `submit`. \
If the specification is impossible or contradictory, call `submit` with `outcome: \"blocked\"` and `blocker_reason`. \
If you need a decision, ask the human with `ask_user`. Otherwise continue.";

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn failing_test_names_are_read_from_common_runners() {
        let out = "✖ failing tests:\nnot ok 2 - discount never goes below zero\n  ✖ applies tax once (1.2ms)\nFAILED tests/test_cart.py::test_empty - assert 1 == 0\n--- FAIL: TestTotal (0.00s)\ntest cart::tests::rounding ... FAILED\n✖ tower canary abc 0";
        assert_eq!(
            failing_tests(out),
            [
                "discount never goes below zero",
                "applies tax once",
                "tests/test_cart.py::test_empty",
                "TestTotal",
                "cart::tests::rounding"
            ]
        );
    }

    #[test]
    fn system_section_is_small() {
        // Rough token estimate: 4 chars per token.
        let s = system_section("G-0001", &[], "Simplified Chinese");
        assert!(s.len() / 4 < 300, "len={}", s.len());
        assert!(s.contains(r#"outcome: "blocked""#));
        assert!(s.contains("explicitly sanctioned"));
        let with = system_section("G-0001", &[("Project memory", "金额一律用 Money 类型")], "English");
        assert!(with.contains("Project memory"));
        assert!(with.contains("in English."));
    }

    #[test]
    fn brief_lists_criteria_and_scope() {
        let mut c = Contract::quick("同一订单只扣款一次", Some("pnpm test".into()), Lang::Zh);
        c.scope.include = vec!["src/**".into()];
        let b = contract_brief("修复重复扣款", &c);
        assert!(b.contains("C1"));
        assert!(b.contains("`pnpm test` exits 0"));
        assert!(b.contains("May change: src/**"));
    }

    #[test]
    fn attachments_render_and_enforce_root_containment() {
        let dir = tempfile::tempdir().unwrap();
        let outside = tempfile::tempdir().unwrap();
        let allowed_img = dir.path().join("shot.png");
        let outside_img = outside.path().join("secret.png");
        let png = [0x89, b'P', b'N', b'G', 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0];
        std::fs::write(&allowed_img, png).unwrap();
        std::fs::write(&outside_img, png).unwrap();

        let list = vec![
            PromptAttachment {
                path: allowed_img.display().to_string(),
                mime_type: "image/png".into(),
                label: Some("bug.png".into()),
            },
            PromptAttachment {
                path: outside_img.display().to_string(),
                mime_type: "image/png".into(),
                label: Some("escape.png".into()),
            },
        ];
        let c = Contract::quick("Fix alignment", None, Lang::En);
        let init = initial_with_attachments("Fix alignment", &c, &list);
        assert!(init.contains("## Attached images"));
        assert!(init.contains("bug.png"));
        assert!(steer_with_attachments("look at header", &list).contains("## Attached images"));

        let loaded = load_image_attachments(&list, &[dir.path()]);
        assert_eq!(loaded.len(), 1, "outside attachment must never be loaded");
        assert_eq!(loaded[0].mime_type, "image/png");
        assert_eq!(loaded[0].label.as_deref(), Some("bug.png"));
    }

    #[test]
    fn rework_evidence_is_bounded() {
        let f = Failure {
            id: "C1".into(),
            title: "t".into(),
            command: "x".into(),
            exit_code: Some(1),
            output_tail: "é".repeat(10_000),
        };
        assert!(rework(1, 3, &[f]).chars().count() < EVIDENCE_CHARS + 600);
    }

    #[test]
    fn sentinel_rework_names_hits_in_english_whatever_the_interface_language() {
        let hit = tower_core::sentinel::SentinelHit {
            sentinel: "test_deleted".into(),
            severity: 3,
            title: "删除了测试文件".into(),
            detail: "test/a.test.js".into(),
        };
        let s = sentinel_rework(&[hit]);
        assert!(s.contains("- Deleted test files:\ntest/a.test.js"));
        assert!(!s.contains("删除"));
    }
}
