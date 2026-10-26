//! Goal contract (`docs/02` §2.3, `docs/00` R7).
//!
//! A goal is not a prompt. It is a contract: intent, executable acceptance
//! criteria, a scope fence, a budget and an autonomy preset. The scope fence
//! is enforced by the harness (the `tower-goal` extension asks before any
//! write outside it); criteria are run by the verifier, not by the agent.

use globset::{Glob, GlobSet, GlobSetBuilder};
use serde::{Deserialize, Serialize};
use ts_rs::TS;

use crate::i18n::Lang;
use crate::tr;

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct Contract {
    /// Incremented on every ratified amendment.
    pub version: u32,
    /// Commander's intent: the purpose, in the human's words.
    pub intent: String,
    /// What "done" looks like, beyond the criteria. Optional.
    #[serde(default)]
    pub done_when: String,
    #[serde(default)]
    pub constraints: Vec<String>,
    pub criteria: Vec<Criterion>,
    #[serde(default)]
    pub scope: Scope,
    pub budget: Budget,
    pub autonomy: Autonomy,
    /// Automatic rework cycles after a failed verification before pausing.
    pub max_rework: u32,
    /// Command run once in the clean verification checkout before criteria,
    /// for example `pnpm install --frozen-lockfile`. Empty means auto-detect.
    #[serde(default)]
    pub setup: String,
    /// `provider/model` for the engine. Empty means the Pi default.
    #[serde(default)]
    pub model: String,
    /// Pi thinking level. Empty means the Pi default.
    #[serde(default)]
    pub thinking: String,
    /// Situations in which the agent must stop and ask instead of deciding
    /// (`docs/00` R7). Injected into the first message; Tower does not
    /// evaluate them.
    #[serde(default)]
    pub stop_conditions: Vec<String>,
    /// Let the agent's commands and the criteria reach the network beyond
    /// loopback. Off by default: reading the workspace plus sending data out
    /// is how code and secrets leak. Setup commands always have the network.
    #[serde(default)]
    pub network: bool,
    /// The agent that does the work: `pi` or `claude-code`. Empty means the
    /// default from the settings.
    #[serde(default)]
    pub engine: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct Criterion {
    /// Stable id shown in the UI, `C1`, `C2`, ...
    pub id: String,
    pub title: String,
    pub kind: CriterionKind,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "snake_case", tag = "type")]
#[ts(export)]
pub enum CriterionKind {
    /// A shell command; exit code 0 means pass. Run by the verifier.
    Exec { command: String, timeout_secs: u32 },
    /// Checked off by the human during review. Never counts as verified.
    Human,
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct Scope {
    /// Globs the agent may write. Empty means the whole workspace.
    #[serde(default)]
    pub include: Vec<String>,
    /// Globs the agent may not write.
    #[serde(default)]
    pub exclude: Vec<String>,
    /// Globs the agent may read but not write (e.g. snapshots, lockfiles).
    #[serde(default)]
    pub readonly: Vec<String>,
}

#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct Budget {
    /// Pause and ask once spend reaches this (USD).
    pub soft_usd: f64,
    /// Never spend beyond this (USD).
    pub hard_usd: f64,
    /// Wall-clock soft cap for a single run, in minutes.
    pub wall_minutes: u32,
}

impl Default for Budget {
    fn default() -> Self {
        Self { soft_usd: 5.0, hard_usd: 8.0, wall_minutes: 90 }
    }
}

/// Autonomy presets (`docs/11` §11.2). They decide which actions the agent
/// does directly and which it must ask for.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "snake_case")]
#[ts(export)]
pub enum Autonomy {
    /// Ask before any shell command that is not obviously read-only or a test.
    Cautious,
    /// Edit within scope and run tests directly; ask for new dependencies,
    /// CI changes, deletions and network installs.
    Standard,
    /// Ask only for one-way doors (push, publishing, destructive git).
    Autonomous,
}

/// Problems that block ratification (`Error`) or are shown as red-light hints
/// in the contract editor (`Warning`).
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "snake_case", tag = "level")]
#[ts(export)]
pub enum ContractIssue {
    Error { field: String, message: String },
    Warning { field: String, message: String },
}

impl Contract {
    /// The minimal contract the quick path ratifies in one keystroke: the
    /// intent plus whatever test command the project already declares. The
    /// criterion title is written in `lang`.
    pub fn quick(intent: impl Into<String>, test_command: Option<String>, lang: Lang) -> Self {
        let criteria = test_command
            .map(|command| {
                vec![Criterion {
                    id: "C1".into(),
                    title: tr!(lang, "现有测试全部通过", "All existing tests pass"),
                    kind: CriterionKind::Exec { command, timeout_secs: 600 },
                }]
            })
            .unwrap_or_default();
        Self {
            version: 1,
            intent: intent.into(),
            done_when: String::new(),
            constraints: Vec::new(),
            criteria,
            scope: Scope::default(),
            budget: Budget::default(),
            autonomy: Autonomy::Standard,
            max_rework: 3,
            setup: String::new(),
            model: String::new(),
            thinking: String::new(),
            stop_conditions: Vec::new(),
            network: false,
            engine: String::new(),
        }
    }

    pub fn machine_criteria(&self) -> impl Iterator<Item = &Criterion> {
        self.criteria.iter().filter(|c| matches!(c.kind, CriterionKind::Exec { .. }))
    }

    pub fn human_criteria(&self) -> impl Iterator<Item = &Criterion> {
        self.criteria.iter().filter(|c| matches!(c.kind, CriterionKind::Human))
    }

    /// Problems with the contract, with messages in `lang`.
    pub fn validate(&self, lang: Lang) -> Vec<ContractIssue> {
        let mut issues = Vec::new();
        let err = |field: &str, message: String| ContractIssue::Error { field: field.into(), message };
        let warn = |field: &str, message: String| ContractIssue::Warning { field: field.into(), message };

        if self.intent.trim().is_empty() {
            issues.push(err("intent", tr!(lang, "目的不能为空", "The intent cannot be empty")));
        }
        let mut seen = std::collections::HashSet::new();
        for c in &self.criteria {
            let id = &c.id;
            if !seen.insert(c.id.as_str()) {
                issues.push(err("criteria", tr!(lang, "标准编号 {id} 重复", "Criterion id {id} is used twice")));
            }
            if c.title.trim().is_empty() {
                issues.push(err("criteria", tr!(lang, "标准 {id} 缺少说明", "Criterion {id} needs a description")));
            }
            if let CriterionKind::Exec { command, timeout_secs } = &c.kind {
                if command.trim().is_empty() {
                    issues.push(err("criteria", tr!(lang, "标准 {id} 缺少命令", "Criterion {id} needs a command")));
                }
                if *timeout_secs == 0 {
                    issues.push(err(
                        "criteria",
                        tr!(lang, "标准 {id} 的超时必须大于 0", "Criterion {id} needs a timeout above 0"),
                    ));
                }
                if let Some(part) = text_only_check(command) {
                    issues.push(warn(
                        "criteria",
                        tr!(
                            lang,
                            "标准 {id} 中的 `{part}` 只检查文本或文件是否存在，不检查行为：Agent 写一行注释就能满足",
                            "In criterion {id}, `{part}` checks text or a file's existence, not behaviour: a comment would satisfy it"
                        ),
                    ));
                }
            }
        }
        if self.machine_criteria().next().is_none() {
            issues.push(warn(
                "criteria",
                tr!(
                    lang,
                    "没有可执行的验收标准：Agent 的“完成”无法被机器验证，只能由你人工判断",
                    "No executable acceptance criteria: a machine cannot verify the agent's \"done\", only you can judge it"
                ),
            ));
        }
        // Written so that NaN also fails.
        let positive = |v: f64| v.partial_cmp(&0.0) == Some(std::cmp::Ordering::Greater);
        if !positive(self.budget.soft_usd) || !positive(self.budget.hard_usd) {
            issues.push(err("budget", tr!(lang, "预算必须大于 0", "The budget must be above 0")));
        } else if self.budget.soft_usd > self.budget.hard_usd {
            issues.push(err("budget", tr!(lang, "软上限不能高于硬上限", "The soft cap cannot be above the hard cap")));
        }
        for (field, globs) in [
            ("scope.include", &self.scope.include),
            ("scope.exclude", &self.scope.exclude),
            ("scope.readonly", &self.scope.readonly),
        ] {
            for g in globs {
                if Glob::new(g).is_err() {
                    issues.push(err(field, tr!(lang, "无效的路径模式：{g}", "Invalid path pattern: {g}")));
                }
            }
        }
        issues
    }

    pub fn is_ratifiable(&self) -> bool {
        !self.validate(Lang::En).iter().any(|i| matches!(i, ContractIssue::Error { .. }))
    }
}

/// Compiled scope fence. Paths are relative to the workspace root and use `/`.
#[derive(Debug, Clone)]
pub struct ScopeFence {
    include: Option<GlobSet>,
    exclude: GlobSet,
    readonly: GlobSet,
}

/// Verdict for a write to a workspace-relative path.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "snake_case")]
#[ts(export)]
pub enum WriteVerdict {
    Allowed,
    OutsideScope,
    Excluded,
    ReadOnly,
}

impl ScopeFence {
    pub fn compile(scope: &Scope) -> Result<Self, globset::Error> {
        fn set(globs: &[String]) -> Result<GlobSet, globset::Error> {
            let mut b = GlobSetBuilder::new();
            for g in globs {
                b.add(Glob::new(g)?);
            }
            b.build()
        }
        Ok(Self {
            include: if scope.include.is_empty() { None } else { Some(set(&scope.include)?) },
            exclude: set(&scope.exclude)?,
            readonly: set(&scope.readonly)?,
        })
    }

    pub fn check_write(&self, rel_path: &str) -> WriteVerdict {
        if self.readonly.is_match(rel_path) {
            WriteVerdict::ReadOnly
        } else if self.exclude.is_match(rel_path) {
            WriteVerdict::Excluded
        } else if self.include.as_ref().is_some_and(|inc| !inc.is_match(rel_path)) {
            WriteVerdict::OutsideScope
        } else {
            WriteVerdict::Allowed
        }
    }
}

/// The first part of a criterion command that only inspects text or file
/// existence (`grep`, `test -f`, `echo`, …), if any. Such checks are easy to
/// satisfy without doing the work.
pub fn text_only_check(command: &str) -> Option<String> {
    command
        .split(['&', '|', ';'])
        .map(str::trim)
        .filter(|p| !p.is_empty())
        .find(|p| {
            let mut words = p.split_whitespace();
            let first = words.next().unwrap_or("");
            let second = words.next().unwrap_or("");
            matches!(first, "grep" | "egrep" | "rg" | "echo" | "true" | "cat" | "ls")
                || ((first == "test" || first == "[") && matches!(second, "-f" | "-e" | "-d" | "-s"))
        })
        .map(String::from)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn text_only_criteria_are_flagged() {
        assert_eq!(
            text_only_check("npm test && grep -q taxRate test/cart.test.js").as_deref(),
            Some("grep -q taxRate test/cart.test.js")
        );
        assert_eq!(text_only_check("test -f dist/app.js").as_deref(), Some("test -f dist/app.js"));
        assert_eq!(text_only_check("npm test 2>&1 | tail -5"), None);
        assert_eq!(text_only_check("cargo test --workspace"), None);
        let mut c = Contract::quick("x", Some("npm test && grep -q x y".into()), Lang::En);
        c.criteria[0].title = "t".into();
        assert!(
            c.validate(Lang::En)
                .iter()
                .any(|i| matches!(i, ContractIssue::Warning { message, .. } if message.contains("not behaviour")))
        );
    }

    #[test]
    fn quick_contract_is_ratifiable_and_warns_without_tests() {
        let with = Contract::quick("修复登录", Some("pnpm test".into()), Lang::Zh);
        assert!(with.is_ratifiable());
        assert!(with.validate(Lang::Zh).is_empty());
        assert_eq!(with.criteria[0].title, "现有测试全部通过");
        assert_eq!(
            Contract::quick("Fix login", Some("pnpm test".into()), Lang::En).criteria[0].title,
            "All existing tests pass"
        );

        let without = Contract::quick("修复登录", None, Lang::Zh);
        assert!(without.is_ratifiable());
        assert!(matches!(without.validate(Lang::Zh)[..], [ContractIssue::Warning { .. }]));
    }

    #[test]
    fn invalid_contracts_are_rejected() {
        let mut c = Contract::quick("  ", Some(" ".into()), Lang::En);
        c.budget.soft_usd = 10.0;
        let errors = c.validate(Lang::En).into_iter().filter(|i| matches!(i, ContractIssue::Error { .. })).count();
        assert_eq!(errors, 3, "intent, command and budget");
        assert!(!c.is_ratifiable());
    }

    #[test]
    fn validation_speaks_the_requested_language() {
        let mut c = Contract::quick("x", Some("pnpm test".into()), Lang::En);
        c.budget.soft_usd = 10.0;
        let message = |lang| match &c.validate(lang)[..] {
            [ContractIssue::Error { field, message }] if field == "budget" => message.clone(),
            other => panic!("unexpected issues: {other:?}"),
        };
        assert_eq!(message(Lang::Zh), "软上限不能高于硬上限");
        assert_eq!(message(Lang::En), "The soft cap cannot be above the hard cap");
    }

    #[test]
    fn scope_fence_orders_readonly_before_exclude_before_include() {
        let fence = ScopeFence::compile(&Scope {
            include: vec!["src/**".into()],
            exclude: vec!["src/legacy/**".into()],
            readonly: vec!["**/__snapshots__/**".into()],
        })
        .unwrap();
        assert_eq!(fence.check_write("src/a.ts"), WriteVerdict::Allowed);
        assert_eq!(fence.check_write("src/legacy/a.ts"), WriteVerdict::Excluded);
        assert_eq!(fence.check_write("src/x/__snapshots__/a.snap"), WriteVerdict::ReadOnly);
        assert_eq!(fence.check_write("README.md"), WriteVerdict::OutsideScope);
    }

    #[test]
    fn empty_include_means_whole_workspace() {
        let fence = ScopeFence::compile(&Scope::default()).unwrap();
        assert_eq!(fence.check_write("anything/at/all.rs"), WriteVerdict::Allowed);
    }
}
