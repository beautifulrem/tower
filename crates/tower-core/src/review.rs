//! Review units (`docs/04` §4.6.2, `docs/00` R8): cut a large diff into
//! slices of at most ~300 changed lines and order them by risk, so review is
//! a transfer of understanding rather than a scroll.

use std::collections::{BTreeMap, HashMap};

use crate::contract::{Scope, ScopeFence, WriteVerdict};
use crate::honesty::ClaimKind;
use crate::i18n::{Lang, Risk};
use crate::view::{ClaimView, DiffFile, FileStatus, LineKind, ReviewUnit};

pub const UNIT_LINE_BUDGET: u32 = 300;

/// Risk signals for one file, highest first.
pub fn file_risks(file: &DiffFile, fence: Option<&ScopeFence>) -> Vec<(u8, Risk)> {
    let p = file.path.to_ascii_lowercase();
    let name = p.rsplit('/').next().unwrap_or(&p);
    let mut r = Vec::new();
    let role = crate::roles::role(&file.path);
    let is_test = crate::roles::is_test_path(&file.path);
    if let Some(fence) = fence {
        match fence.check_write(&file.path) {
            WriteVerdict::Allowed => {}
            WriteVerdict::OutsideScope => r.push((3, Risk::OutsideScope)),
            WriteVerdict::Excluded => r.push((3, Risk::Excluded)),
            WriteVerdict::ReadOnly => r.push((3, Risk::ReadOnly)),
        }
    }
    if is_test && file.status == FileStatus::Deleted {
        r.push((3, Risk::TestDeleted));
    } else if is_test && file.deletions > file.additions {
        r.push((2, Risk::TestShrunk));
    } else if is_test && file.status == FileStatus::Modified && file.deletions > 0 {
        r.push((2, Risk::TestEdited));
    }
    if crate::sentinel::is_test_harness(&file.path) {
        r.push((3, Risk::TestHarness));
    }
    if crate::sentinel::changes_expectations(file) {
        r.push((3, Risk::ExpectationChanged));
    }
    // Configuration decides how code and tests run; the verdict was
    // re-checked without it, but a reader should still see it first.
    if role == crate::roles::Role::Config
        || matches!(name, ".npmrc" | ".yarnrc" | ".yarnrc.yml" | ".pnpmfile.cjs" | "bunfig.toml")
        || p.contains(".cargo/config")
    {
        r.push((3, Risk::RunConfig));
    }
    if role == crate::roles::Role::Build && !p.starts_with(".github/") {
        r.push((2, Risk::BuildScript));
    }
    if role == crate::roles::Role::Source
        && file
            .hunks
            .iter()
            .flat_map(|h| &h.lines)
            .any(|l| l.kind == crate::view::LineKind::Add && crate::roles::touches_test_machinery(&l.text).is_some())
    {
        r.push((3, Risk::TouchesTests));
    }
    if p.contains("__snapshots__") || name.ends_with(".snap") {
        r.push((2, Risk::Snapshots));
    }
    if p.starts_with(".github/") || name == ".gitlab-ci.yml" || p.contains("/ci/") {
        r.push((2, Risk::Ci));
    }
    if matches!(name, "package.json" | "cargo.toml" | "go.mod" | "pyproject.toml" | "requirements.txt") {
        r.push((2, Risk::Manifest));
    }
    if matches!(name, "pnpm-lock.yaml" | "package-lock.json" | "yarn.lock" | "cargo.lock" | "go.sum" | "uv.lock") {
        r.push((1, Risk::Lockfile));
    }
    if p.contains("migration") || p.contains("/migrate") || name.ends_with(".sql") {
        r.push((2, Risk::Migration));
    }
    if ["auth", "payment", "billing", "charge", "secret", "crypto", "permission", "security"]
        .iter()
        .any(|k| p.contains(k))
    {
        r.push((2, Risk::Sensitive));
    }
    if file.deletions > 200 {
        r.push((1, Risk::LargeDeletion));
    }
    if file.binary {
        r.push((1, Risk::Binary));
    }
    r.sort_by_key(|x| std::cmp::Reverse(x.0));
    r
}

/// Groups files by directory into units within the line budget, then sorts
/// by risk (highest first) and size. Titles and risk reasons are written in
/// `lang`.
pub fn build_units(files: &[DiffFile], scope: Option<&Scope>, lang: Lang) -> Vec<ReviewUnit> {
    let fence = scope.and_then(|s| ScopeFence::compile(s).ok());
    let mut order: Vec<usize> = (0..files.len()).collect();
    order.sort_by(|&a, &b| dir_of(&files[a].path).cmp(dir_of(&files[b].path)).then(files[a].path.cmp(&files[b].path)));

    struct Acc {
        dir: String,
        files: Vec<String>,
        lines: u32,
        risk: u8,
        reasons: Vec<String>,
    }
    let mut units: Vec<Acc> = Vec::new();
    for i in order {
        let f = &files[i];
        let lines = f.additions + f.deletions;
        let dir = dir_of(&f.path).to_string();
        let risks = file_risks(f, fence.as_ref());
        let risk = risks.first().map(|r| r.0).unwrap_or(0);
        let fits =
            units.last().is_some_and(|u| u.dir == dir && u.lines + lines <= UNIT_LINE_BUDGET && !u.files.is_empty());
        if !fits {
            units.push(Acc { dir: dir.clone(), files: Vec::new(), lines: 0, risk: 0, reasons: Vec::new() });
        }
        let u = units.last_mut().expect("just pushed");
        u.files.push(f.path.clone());
        u.lines += lines;
        u.risk = u.risk.max(risk);
        for (_, reason) in risks {
            let tagged = format!("{}{}{}", file_name(&f.path), lang.pick("：", ": "), reason.label(lang));
            if !u.reasons.contains(&tagged) {
                u.reasons.push(tagged);
            }
        }
    }
    units.sort_by(|a, b| b.risk.cmp(&a.risk).then(b.lines.cmp(&a.lines)));
    units
        .into_iter()
        .enumerate()
        .map(|(i, u)| ReviewUnit {
            id: format!("U{}", i + 1),
            title: if u.dir.is_empty() {
                lang.pick("（仓库根）", "(repository root)").into()
            } else {
                format!("{}/", u.dir)
            },
            files: u.files,
            lines: u.lines,
            risk: u.risk,
            risk_reasons: u.reasons,
            unit_claim_summary: None,
        })
        .collect()
}

/// Derives a short one-line rationale for each review unit strictly from agent
/// `log` claims (tagged as Claim in the UI, never rendered as a Fact).
pub fn attach_unit_claim_summaries(units: &mut [ReviewUnit], claims: &[ClaimView]) {
    let relevant: Vec<&ClaimView> = claims
        .iter()
        .filter(|c| {
            matches!(c.kind, ClaimKind::Decision | ClaimKind::Cause | ClaimKind::Progress | ClaimKind::Done)
                && !c.text.trim().is_empty()
        })
        .collect();
    if relevant.is_empty() {
        return;
    }
    for unit in units {
        let mut best: Option<&str> = None;
        for claim in relevant.iter().rev() {
            let lower = claim.text.to_ascii_lowercase();
            let hits_file = unit.files.iter().any(|path| {
                let p = path.to_ascii_lowercase();
                let name = file_name(&p);
                let stem = name.rsplit_once('.').map_or(name, |(s, _)| s);
                lower.contains(&p)
                    || (name.len() >= 4 && lower.contains(name))
                    || (stem.len() >= 4 && lower.contains(stem))
            });
            if hits_file {
                best = Some(claim.text.trim());
                break;
            }
        }
        if let Some(summary) = best {
            let trimmed: String = summary.lines().next().unwrap_or(summary).chars().take(180).collect();
            unit.unit_claim_summary = Some(trimmed);
        }
    }
}

/// Classifies per-file hunk indices that are formatting-only (pure whitespace
/// differences) or moved-unchanged (blocks of >= 3 non-empty lines relocated
/// without logic changes). Returns `(moved_hunks, formatting_hunks)`.
pub fn classify_hunk_noise(files: &[DiffFile]) -> (BTreeMap<String, Vec<usize>>, BTreeMap<String, Vec<usize>>) {
    let mut moved: BTreeMap<String, Vec<usize>> = BTreeMap::new();
    let mut formatting: BTreeMap<String, Vec<usize>> = BTreeMap::new();

    // Collect normalized added and deleted non-empty blocks across the diff
    // so code moved within a file or across files can be spotted cleanly.
    let mut added_blocks: HashMap<String, usize> = HashMap::new();
    let mut deleted_blocks: HashMap<String, usize> = HashMap::new();

    for f in files {
        for h in &f.hunks {
            let adds: Vec<&str> = h
                .lines
                .iter()
                .filter(|l| l.kind == LineKind::Add)
                .map(|l| l.text.trim())
                .filter(|s| !s.is_empty())
                .collect();
            let dels: Vec<&str> = h
                .lines
                .iter()
                .filter(|l| l.kind == LineKind::Del)
                .map(|l| l.text.trim())
                .filter(|s| !s.is_empty())
                .collect();
            if adds.len() >= 3 && dels.is_empty() {
                *added_blocks.entry(adds.join("\n")).or_default() += 1;
            }
            if dels.len() >= 3 && adds.is_empty() {
                *deleted_blocks.entry(dels.join("\n")).or_default() += 1;
            }
        }
    }

    for f in files {
        for (idx, h) in f.hunks.iter().enumerate() {
            let adds: Vec<&str> = h.lines.iter().filter(|l| l.kind == LineKind::Add).map(|l| l.text.as_str()).collect();
            let dels: Vec<&str> = h.lines.iter().filter(|l| l.kind == LineKind::Del).map(|l| l.text.as_str()).collect();
            if !adds.is_empty() && !dels.is_empty() {
                let compact = |lines: &[&str]| -> String {
                    lines.iter().flat_map(|s| s.chars()).filter(|c| !c.is_whitespace()).collect()
                };
                if compact(&adds) == compact(&dels) {
                    formatting.entry(f.path.clone()).or_default().push(idx);
                    continue;
                }
            }
            let add_norm: Vec<&str> = adds.iter().map(|s| s.trim()).filter(|s| !s.is_empty()).collect();
            let del_norm: Vec<&str> = dels.iter().map(|s| s.trim()).filter(|s| !s.is_empty()).collect();
            let is_moved =
                (add_norm.len() >= 3 && del_norm.is_empty() && deleted_blocks.contains_key(&add_norm.join("\n")))
                    || (del_norm.len() >= 3 && add_norm.is_empty() && added_blocks.contains_key(&del_norm.join("\n")));
            if is_moved {
                moved.entry(f.path.clone()).or_default().push(idx);
            }
        }
    }
    (moved, formatting)
}

fn dir_of(path: &str) -> &str {
    path.rsplit_once('/').map(|(d, _)| d).unwrap_or("")
}

fn file_name(path: &str) -> &str {
    path.rsplit('/').next().unwrap_or(path)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn file(path: &str, status: FileStatus, add: u32, del: u32) -> DiffFile {
        DiffFile {
            path: path.into(),
            old_path: None,
            status,
            additions: add,
            deletions: del,
            binary: false,
            hunks: vec![],
        }
    }

    #[test]
    fn risky_units_come_first() {
        let files = vec![
            file("src/ui/button.tsx", FileStatus::Modified, 10, 2),
            file("src/checkout/__tests__/charge.spec.ts", FileStatus::Deleted, 0, 40),
            file("package.json", FileStatus::Modified, 1, 0),
        ];
        let units = build_units(&files, None, Lang::En);
        assert_eq!(units[0].files, ["src/checkout/__tests__/charge.spec.ts"]);
        assert_eq!(units[0].risk, 3);
        assert_eq!(units[0].risk_reasons[0], "charge.spec.ts: deleted a test file");
        let zh = build_units(&files, None, Lang::Zh);
        assert_eq!(zh[0].risk_reasons[0], "charge.spec.ts：删除了测试文件");
        let root = |units: &[ReviewUnit]| units.iter().find(|u| u.files == ["package.json"]).unwrap().title.clone();
        assert_eq!(root(&zh), "（仓库根）");
        assert_eq!(root(&units), "(repository root)");
        assert_eq!(units.last().unwrap().risk, 0);
    }

    #[test]
    fn units_respect_the_line_budget() {
        let files: Vec<_> = (0..5).map(|i| file(&format!("src/f{i}.rs"), FileStatus::Modified, 100, 0)).collect();
        let units = build_units(&files, None, Lang::En);
        assert!(units.iter().all(|u| u.lines <= UNIT_LINE_BUDGET));
        assert_eq!(units.iter().map(|u| u.files.len()).sum::<usize>(), 5);
    }

    #[test]
    fn writes_outside_the_fence_are_high_risk() {
        let scope = Scope { include: vec!["src/**".into()], ..Default::default() };
        let units = build_units(&[file("README.md", FileStatus::Modified, 1, 1)], Some(&scope), Lang::En);
        assert_eq!(units[0].risk, 3);
    }

    #[test]
    fn unit_claim_summaries_attach_strictly_from_agent_claims() {
        use crate::honesty::Consistency;
        let files = vec![file("src/cart.ts", FileStatus::Modified, 10, 2)];
        let mut units = build_units(&files, None, Lang::En);
        let claims = vec![ClaimView {
            id: "c1".into(),
            kind: ClaimKind::Decision,
            text: "Updated cart.ts to clamp discounts at zero".into(),
            criterion: None,
            at: 100,
            run_no: 1,
            approved: None,
            consistency: Consistency::Unsupported,
            evidence: None,
        }];
        attach_unit_claim_summaries(&mut units, &claims);
        assert_eq!(units[0].unit_claim_summary.as_deref(), Some("Updated cart.ts to clamp discounts at zero"));
    }

    #[test]
    fn classifies_formatting_and_moved_hunks() {
        use crate::view::{DiffLine, Hunk};
        let fmt_file = DiffFile {
            path: "src/a.rs".into(),
            old_path: None,
            status: FileStatus::Modified,
            additions: 1,
            deletions: 1,
            binary: false,
            hunks: vec![Hunk {
                header: "@@ -1,1 +1,1 @@".into(),
                lines: vec![
                    DiffLine { kind: LineKind::Del, old_no: Some(1), new_no: None, text: "let x=1+2;".into() },
                    DiffLine { kind: LineKind::Add, old_no: None, new_no: Some(1), text: "let x = 1 + 2;".into() },
                ],
            }],
        };
        let moved_file = DiffFile {
            path: "src/b.rs".into(),
            old_path: None,
            status: FileStatus::Modified,
            additions: 3,
            deletions: 3,
            binary: false,
            hunks: vec![
                Hunk {
                    header: "@@ -1,3 +1,0 @@".into(),
                    lines: vec![
                        DiffLine { kind: LineKind::Del, old_no: Some(1), new_no: None, text: "fn helper() {".into() },
                        DiffLine { kind: LineKind::Del, old_no: Some(2), new_no: None, text: "    compute()".into() },
                        DiffLine { kind: LineKind::Del, old_no: Some(3), new_no: None, text: "}".into() },
                    ],
                },
                Hunk {
                    header: "@@ -20,0 +17,3 @@".into(),
                    lines: vec![
                        DiffLine {
                            kind: LineKind::Add,
                            old_no: None,
                            new_no: Some(17),
                            text: "  fn helper() {".into(),
                        },
                        DiffLine {
                            kind: LineKind::Add,
                            old_no: None,
                            new_no: Some(18),
                            text: "      compute()".into(),
                        },
                        DiffLine { kind: LineKind::Add, old_no: None, new_no: Some(19), text: "  }".into() },
                    ],
                },
            ],
        };
        let (moved, fmt) = classify_hunk_noise(&[fmt_file, moved_file]);
        assert_eq!(fmt.get("src/a.rs"), Some(&vec![0]));
        assert_eq!(moved.get("src/b.rs"), Some(&vec![0, 1]));
    }
}
