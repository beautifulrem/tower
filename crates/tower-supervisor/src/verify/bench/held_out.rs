//! Held-out tests in verification: copied in for you only, and each file
//! proving for itself that a criterion ran it.
//!
//! Invariant: a result is "with held-out tests" only when at least one
//! held-out test file is proven to have run in it, and the files that were
//! not are listed one by one (for you; never in a finding's detail, which
//! can reach the agent).
//!
//! The proof. Every held-out file Tower can mark gets its own random token
//! for this run, and a line that, when the file is loaded, creates a file
//! named by that token in a drop box: a directory of Tower's that the
//! sandbox may create files in but may not read or list. Tower checks the
//! tokens after each criterion and clears the box. So a proof cannot be
//! produced by code written before the run (the token did not exist), cannot
//! be copied from another file's or an earlier run's proof (each is
//! independent and the box is unreadable), and cannot be read back to learn
//! which files ran. What remains: the process that executes a held-out file
//! can read that file's own text, token included. Code under test that
//! reads the held-out files at run time is already outside what held-out
//! tests can defend (it could read their expectations too), so the proof
//! is as strong as the held-out tests' secrecy, not stronger.
//!
//! Languages Tower can mark: JavaScript and TypeScript (when Node offers
//! its file module synchronously), Python, shell scripts and Rust (a test
//! of its own in the file). Code files in other languages are listed as
//! "cannot prove they ran"; data files (fixtures, JSON, text) are not tests
//! and count for nothing.

use std::collections::BTreeSet;
use std::path::Path;
use std::time::Duration;

use tower_core::view::HeldOutProof;
use tower_core::{EventKind, Lang, tr};

use super::{Bench, Exec, Found, sentinel_hit};
use crate::Result;
use crate::prompts::Failure;
use crate::verify::{Outcome, append_hit};

/// What Tower can do with one held-out file.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(in crate::verify) enum Kind {
    /// A language Tower can add a proof line to.
    Provable,
    /// Code in a language Tower cannot add a proof to.
    Unprovable,
    /// Not a test: fixtures, data, declarations.
    Data,
}

pub(in crate::verify) fn kind_of(path: &str) -> Kind {
    let name = path.rsplit('/').next().unwrap_or(path);
    if name.ends_with(".d.ts") || name.ends_with(".d.mts") || name.ends_with(".d.cts") {
        return Kind::Data;
    }
    let ext = name.rsplit_once('.').map_or("", |(_, e)| e);
    match ext {
        "js" | "mjs" | "cjs" | "jsx" | "ts" | "mts" | "cts" | "tsx" | "py" | "sh" | "bash" | "rs" => Kind::Provable,
        "go" | "java" | "kt" | "kts" | "scala" | "rb" | "swift" | "c" | "cc" | "cpp" | "cxx" | "h" | "hpp" | "cs"
        | "fs" | "php" | "ex" | "exs" | "erl" | "hs" | "ml" | "clj" | "dart" | "lua" | "pl" | "r" | "jl" | "zig"
        | "m" | "mm" | "groovy" | "zsh" | "fish" | "ps1" => Kind::Unprovable,
        _ => Kind::Data,
    }
}

/// The held-out files as marked for one verification.
#[derive(Debug, Default)]
pub(in crate::verify) struct Marks {
    /// (file, token) for each file carrying a proof line.
    tokens: Vec<(String, String)>,
    /// What each marked file holds now, so a later comparison is with what
    /// went in.
    pub(in crate::verify) planted: Vec<(String, Vec<u8>)>,
    unprovable: Vec<String>,
}

impl Marks {
    /// The proof of one run, from the tokens found in the drop box.
    pub(in crate::verify) fn proof(&self, found: &BTreeSet<String>) -> HeldOutProof {
        let (ran, not_ran): (Vec<_>, Vec<_>) = self.tokens.iter().partition(|(_, t)| found.contains(t));
        HeldOutProof {
            ran: ran.into_iter().map(|(f, _)| f.clone()).collect(),
            not_ran: not_ran.into_iter().map(|(f, _)| f.clone()).collect(),
            unprovable: self.unprovable.clone(),
        }
    }

    pub(in crate::verify) fn marked(&self) -> usize {
        self.tokens.len()
    }
}

/// The line that proves `file` ran: it creates `<drop>/<token>` when loaded.
fn proof_line(file: &str, text: &str, mark: &str, token: &str) -> Option<String> {
    let ext = file.rsplit('.').next().unwrap_or("");
    Some(match ext {
        "js" | "mjs" | "cjs" | "jsx" => format!(
            "{text}\n;(globalThis.process?.getBuiltinModule?.(\"node:fs\") ?? (typeof require === \"function\" ? require(\"node:fs\") : undefined))?.writeFileSync(\"{mark}\", \"\");\n"
        ),
        "ts" | "mts" | "cts" | "tsx" => {
            format!(
                "{text}\n;(globalThis as any).process?.getBuiltinModule?.(\"node:fs\")?.writeFileSync(\"{mark}\", \"\");\n"
            )
        }
        "py" => format!("{text}\n\nopen(\"{mark}\", \"w\").close()\n"),
        // At the start: a script that exits early still started.
        "sh" | "bash" => match text.split_once('\n') {
            Some((first, rest)) if first.starts_with("#!") => format!("{first}\n: > \"{mark}\"\n{rest}"),
            _ => format!(": > \"{mark}\"\n{text}"),
        },
        "rs" => format!(
            "{text}\n#[test]\nfn tower_held_out_proof_{token}() {{\n    let _ = ::std::fs::write(\"{mark}\", \"\");\n}}\n"
        ),
        _ => return None,
    })
}

/// Marks each held-out file in `dir` with its own proof line; `drop` is the
/// box the proofs go to.
pub(in crate::verify) fn mark(dir: &Path, files: &[String], drop: &Path) -> Marks {
    let mut marks = Marks::default();
    let box_ok = drop.to_str().is_some_and(|d| !d.contains(['"', '\'', '\\', '\n', '$', '`']));
    for f in files {
        match kind_of(f) {
            Kind::Data => continue,
            Kind::Unprovable => {
                marks.unprovable.push(f.clone());
                continue;
            }
            Kind::Provable => {}
        }
        let token = uuid::Uuid::new_v4().simple().to_string();
        let text = std::fs::read_to_string(dir.join(f)).ok();
        let line = text.as_deref().filter(|_| box_ok).and_then(|t| {
            let mark = drop.join(&token);
            proof_line(f, t, mark.to_str()?, &token)
        });
        match line {
            Some(out) if tower_git::write_inside(dir, f, out.as_bytes()).is_ok() => {
                marks.planted.push((f.clone(), out.into_bytes()));
                marks.tokens.push((f.clone(), token));
            }
            _ => marks.unprovable.push(f.clone()),
        }
    }
    marks
}

/// The proofs in the drop box (names only; nothing in it is read).
pub(in crate::verify) fn found(drop: &Path) -> BTreeSet<String> {
    std::fs::read_dir(drop)
        .map(|d| d.flatten().take(10_000).filter_map(|e| e.file_name().into_string().ok()).collect())
        .unwrap_or_default()
}

/// Empties the drop box for the next run.
pub(in crate::verify) fn clear(drop: &Path) {
    if let Ok(d) = std::fs::read_dir(drop) {
        for e in d.flatten() {
            let _ = std::fs::remove_file(e.path()).or_else(|_| std::fs::remove_dir_all(e.path()));
        }
    }
}

/// The findings about held-out coverage across every criterion of a run:
/// none of the marked files ran, some never did, some cannot be proven.
/// Counts only: the names stay with the criteria's results.
pub(in crate::verify) fn coverage_findings(
    marks: &Marks,
    ran_any: &BTreeSet<String>,
    lang: Lang,
) -> Vec<tower_core::sentinel::SentinelHit> {
    let mut hits = Vec::new();
    let n = marks.marked();
    let ran = marks.tokens.iter().filter(|(f, _)| ran_any.contains(f)).count();
    let missing = n - ran;
    let hit = |id: &str, severity: u8, detail: String| tower_core::sentinel::SentinelHit {
        sentinel: id.into(),
        severity,
        title: tower_core::i18n::sentinel_title(id, lang).unwrap_or(id).into(),
        detail,
    };
    if n > 0 && ran == 0 {
        hits.push(hit(
            "held_out_not_run",
            2,
            tr!(
                lang,
                "没有一条标准真正运行了保留测试（{n} 个文件一个也没有被加载），所以这次结果不包含保留测试的检查。让某条标准的命令运行它们。",
                "No criterion actually ran the held-out tests (none of the {n} file(s) was loaded), so this result includes no held-out check. Make a criterion's command run them."
            ),
        ));
    } else if missing > 0 {
        hits.push(hit(
            "held_out_partly_run",
            2,
            tr!(
                lang,
                "{n} 个保留测试文件中有 {missing} 个没有被任何标准加载，这次结果只包含了一部分保留测试的检查。没运行的文件逐个列在对应标准的结果下（只给你看）。",
                "{missing} of {n} held-out test files were not loaded by any criterion, so this result includes only part of the held-out check. The files that did not run are listed under the criteria's results (for you only)."
            ),
        ));
    }
    if !marks.unprovable.is_empty() {
        let k = marks.unprovable.len();
        hits.push(hit(
            "held_out_unproven",
            1,
            tr!(
                lang,
                "Tower 无法证明 {k} 个保留测试文件被运行过：这些文件的语言 Tower 没法加入证明。它们是否被运行，这次结果说明不了。",
                "Tower cannot prove that {k} held-out test file(s) ran: it cannot add a proof to files in their language, so this result says nothing about whether they ran."
            ),
        ));
    }
    hits
}

impl Bench<'_> {
    /// Step 3, the held-out tests, for you only. Each criterion of `held_set`
    /// runs with them present; its result carries which files proved they
    /// ran. Returns the held-out files copied in, or the outcome that ends
    /// verification here.
    pub(super) async fn held_out_step(
        &self,
        pin: &str,
        held_set: &[&Exec],
        found_hits: &mut Found,
    ) -> Result<std::result::Result<Vec<String>, Outcome>> {
        let (inner, goal) = (self.inner, self.goal);
        let lang = inner.lang();
        self.reset(pin).await?;
        let held_files = self.copy_held_out().await?;
        let marks = mark(&self.dir, &held_files, &self.drop);
        let mut ran_any = BTreeSet::new();
        let mut held_failures = Vec::new();
        for (c, command, timeout) in held_set {
            clear(&self.drop);
            let r = self
                .exec(command, self.held_out_profile.as_deref(), Duration::from_secs((*timeout).max(1) as u64))
                .await;
            let proof = marks.proof(&found(&self.drop));
            clear(&self.drop);
            if r.environment_failure {
                return Ok(Err(self.env_error(&c.id, command, &r)));
            }
            ran_any.extend(proof.ran.iter().cloned());
            inner.append(
                goal,
                EventKind::CriterionResult {
                    criterion: c.id.clone(),
                    pin: pin.into(),
                    passed: r.passed,
                    exit_code: r.exit_code,
                    duration_ms: r.duration_ms,
                    output_tail: r.output_tail.clone(),
                    held_out: !proof.ran.is_empty(),
                    held_out_proof: Some(proof),
                },
            )?;
            if !r.passed {
                held_failures.push(Failure {
                    id: c.id.clone(),
                    title: c.title.clone(),
                    command: command.clone(),
                    exit_code: r.exit_code,
                    output_tail: r.output_tail,
                });
            }
        }
        // The tests themselves must come out as they went in.
        let root = Path::new(&self.rec.project_root);
        let changed = held_files
            .iter()
            .filter(|f| {
                let went_in = marks
                    .planted
                    .iter()
                    .find(|(p, _)| p == *f)
                    .map(|(_, b)| b.clone())
                    .or_else(|| std::fs::read(root.join(f)).ok());
                went_in != std::fs::read(self.dir.join(f)).ok()
            })
            .count();
        let mut hits = coverage_findings(&marks, &ran_any, lang);
        if changed > 0 {
            let detail = tr!(
                lang,
                "运行期间有 {changed} 个保留测试文件被改写（为了不让 Agent 知道，这里不列出文件名）",
                "{changed} held-out test file(s) were rewritten while the criteria ran (not named here, so the agent cannot learn them)"
            );
            hits.push(sentinel_hit("held_out_tests_changed", detail, lang));
        }
        for hit in hits {
            append_hit(inner, goal, &hit)?;
            found_hits.push(hit);
        }
        if !held_failures.is_empty() {
            return Ok(Err(Outcome::HeldOutFailed(held_failures)));
        }
        Ok(Ok(held_files))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn each_file_carries_its_own_proof_and_only_its_own_counts() {
        let tmp = tempfile::tempdir().unwrap();
        let dir = tmp.path().join("checkout");
        let drop = tmp.path().join("drop");
        std::fs::create_dir_all(dir.join("holdout")).unwrap();
        std::fs::create_dir_all(&drop).unwrap();
        for (f, t) in [
            ("holdout/a.test.mjs", "test('a', () => {})\n"),
            ("holdout/b.test.ts", "test('b', () => {})\n"),
            ("holdout/c_test.py", "def test_c(): pass\n"),
            ("holdout/d.sh", "#!/bin/sh\ntest -f done.txt\n"),
            ("holdout/e.rs", "#[test]\nfn e() {}\n"),
            ("holdout/f_test.go", "package f\n"),
            ("holdout/data.json", "{}\n"),
        ] {
            std::fs::write(dir.join(f), t).unwrap();
        }
        let files: Vec<String> = std::fs::read_dir(dir.join("holdout"))
            .unwrap()
            .map(|e| format!("holdout/{}", e.unwrap().file_name().to_string_lossy()))
            .collect();
        let marks = mark(&dir, &files, &drop);
        assert_eq!(marks.marked(), 5, "the five languages Tower can mark");
        assert_eq!(marks.unprovable, ["holdout/f_test.go"], "data files are not tests");
        let tokens: BTreeSet<&str> = marks.tokens.iter().map(|(_, t)| t.as_str()).collect();
        assert_eq!(tokens.len(), 5, "one independent token per file");
        // Each file's text names its own token only.
        for (f, t) in &marks.tokens {
            let text = std::fs::read_to_string(dir.join(f)).unwrap();
            assert!(text.contains(t.as_str()));
            assert!(marks.tokens.iter().filter(|(g, _)| g != f).all(|(_, o)| !text.contains(o.as_str())));
        }
        let sh = std::fs::read_to_string(dir.join("holdout/d.sh")).unwrap();
        assert!(sh.starts_with("#!/bin/sh\n: > \""), "{sh}");
        // One file's proof proves that file and no other; anything else in
        // the box proves nothing.
        let a = marks.tokens.iter().find(|(f, _)| f.ends_with("a.test.mjs")).unwrap().1.clone();
        let found: BTreeSet<String> = [a, "made-up".to_string()].into();
        let p = marks.proof(&found);
        assert_eq!(p.ran, ["holdout/a.test.mjs"]);
        assert_eq!(p.not_ran.len(), 4);
        assert_eq!(p.unprovable, ["holdout/f_test.go"]);
        assert_eq!(p.total(), 6);
    }

    #[test]
    fn coverage_names_counts_never_files() {
        let marks = Marks {
            tokens: vec![("holdout/a.sh".into(), "t1".into()), ("holdout/b.sh".into(), "t2".into())],
            planted: Vec::new(),
            unprovable: vec!["holdout/c_test.go".into()],
        };
        let none = coverage_findings(&marks, &BTreeSet::new(), Lang::En);
        assert_eq!(
            none.iter().map(|h| h.sentinel.as_str()).collect::<Vec<_>>(),
            ["held_out_not_run", "held_out_unproven"]
        );
        let some = coverage_findings(&marks, &["holdout/a.sh".to_string()].into(), Lang::En);
        assert_eq!(some[0].sentinel, "held_out_partly_run");
        assert!(some[0].detail.contains("1 of 2"), "{}", some[0].detail);
        assert_eq!(some[1].severity, 1);
        for h in none.iter().chain(&some) {
            assert!(!h.detail.contains("holdout/"), "no file names where the agent could hear them: {}", h.detail);
        }
        let all = coverage_findings(
            &Marks { unprovable: Vec::new(), ..marks },
            &["holdout/a.sh".to_string(), "holdout/b.sh".to_string()].into(),
            Lang::Zh,
        );
        assert!(all.is_empty());
    }

    /// The marks really run: a shell script and a Node test file leave
    /// their proofs, a file nothing loads leaves none.
    #[test]
    fn the_proof_lines_run() {
        let tmp = tempfile::tempdir().unwrap();
        let root = crate::paths::real(tmp.path());
        let (dir, drop) = (root.join("c"), root.join("drop"));
        std::fs::create_dir_all(dir.join("holdout")).unwrap();
        std::fs::create_dir_all(&drop).unwrap();
        std::fs::write(dir.join("holdout/a.sh"), "#!/bin/sh\nexit 0\n").unwrap();
        std::fs::write(dir.join("holdout/b.sh"), "exit 0\n").unwrap();
        std::fs::write(dir.join("holdout/c.cjs"), "module.exports = 1\n").unwrap();
        let files = ["holdout/a.sh", "holdout/b.sh", "holdout/c.cjs"].map(String::from).to_vec();
        let marks = mark(&dir, &files, &drop);
        let ok = std::process::Command::new("/bin/sh").arg("holdout/a.sh").current_dir(&dir).status().unwrap();
        assert!(ok.success());
        let node = std::process::Command::new("node").arg("holdout/c.cjs").current_dir(&dir).status();
        let p = marks.proof(&found(&drop));
        let mut expect = vec!["holdout/a.sh"];
        if node.is_ok_and(|s| s.success()) {
            expect.push("holdout/c.cjs");
        }
        assert_eq!(p.ran, expect);
        assert!(p.not_ran.contains(&"holdout/b.sh".to_string()));
        clear(&drop);
        assert!(found(&drop).is_empty());
    }
}
