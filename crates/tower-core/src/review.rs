//! Review units (`docs/04` §4.6.2, `docs/00` R8): cut a large diff into
//! slices of at most ~300 changed lines and order them by risk, so review is
//! a transfer of understanding rather than a scroll.

use crate::contract::{Scope, ScopeFence, WriteVerdict};
use crate::i18n::{Lang, Risk};
use crate::view::{DiffFile, FileStatus, ReviewUnit};

pub const UNIT_LINE_BUDGET: u32 = 300;

/// Risk signals for one file, highest first.
pub fn file_risks(file: &DiffFile, fence: Option<&ScopeFence>) -> Vec<(u8, Risk)> {
    let p = file.path.to_ascii_lowercase();
    let name = p.rsplit('/').next().unwrap_or(&p);
    let mut r = Vec::new();
    let is_test = p.contains("/test")
        || p.contains("__tests__")
        || name.contains(".test.")
        || name.contains(".spec.")
        || name.starts_with("test_")
        || name.ends_with("_test.go")
        || name.ends_with("_test.rs");

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
        })
        .collect()
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
}
