//! Goal contract (`docs/02` §2.3, `docs/00` R7).
//!
//! A goal is not a prompt. It is a contract: intent, executable acceptance
//! criteria, a scope fence, a budget and an autonomy preset. The scope fence
//! is enforced by the harness (the `tower-goal` extension asks before any
//! write outside it); criteria are run by the verifier, not by the agent.

use globset::{Glob, GlobSet, GlobSetBuilder};
use serde::{Deserialize, Serialize};
use ts_rs::TS;

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
    /// intent plus whatever test command the project already declares.
    pub fn quick(intent: impl Into<String>, test_command: Option<String>) -> Self {
        let criteria = test_command
            .map(|command| {
                vec![Criterion {
                    id: "C1".into(),
                    title: "现有测试全部通过".into(),
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
        }
    }

    pub fn machine_criteria(&self) -> impl Iterator<Item = &Criterion> {
        self.criteria.iter().filter(|c| matches!(c.kind, CriterionKind::Exec { .. }))
    }

    pub fn human_criteria(&self) -> impl Iterator<Item = &Criterion> {
        self.criteria.iter().filter(|c| matches!(c.kind, CriterionKind::Human))
    }

    pub fn validate(&self) -> Vec<ContractIssue> {
        let mut issues = Vec::new();
        let err = |field: &str, message: &str| ContractIssue::Error { field: field.into(), message: message.into() };
        let warn = |field: &str, message: &str| ContractIssue::Warning { field: field.into(), message: message.into() };

        if self.intent.trim().is_empty() {
            issues.push(err("intent", "目的不能为空"));
        }
        let mut seen = std::collections::HashSet::new();
        for c in &self.criteria {
            if !seen.insert(c.id.as_str()) {
                issues.push(err("criteria", &format!("标准编号 {} 重复", c.id)));
            }
            if c.title.trim().is_empty() {
                issues.push(err("criteria", &format!("标准 {} 缺少说明", c.id)));
            }
            if let CriterionKind::Exec { command, timeout_secs } = &c.kind {
                if command.trim().is_empty() {
                    issues.push(err("criteria", &format!("标准 {} 缺少命令", c.id)));
                }
                if *timeout_secs == 0 {
                    issues.push(err("criteria", &format!("标准 {} 的超时必须大于 0", c.id)));
                }
            }
        }
        if self.machine_criteria().next().is_none() {
            issues.push(warn("criteria", "没有可执行的验收标准：Agent 的“完成”无法被机器验证，只能由你人工判断"));
        }
        // Written so that NaN also fails.
        let positive = |v: f64| v.partial_cmp(&0.0) == Some(std::cmp::Ordering::Greater);
        if !positive(self.budget.soft_usd) || !positive(self.budget.hard_usd) {
            issues.push(err("budget", "预算必须大于 0"));
        } else if self.budget.soft_usd > self.budget.hard_usd {
            issues.push(err("budget", "软上限不能高于硬上限"));
        }
        for (field, globs) in [
            ("scope.include", &self.scope.include),
            ("scope.exclude", &self.scope.exclude),
            ("scope.readonly", &self.scope.readonly),
        ] {
            for g in globs {
                if Glob::new(g).is_err() {
                    issues.push(err(field, &format!("无效的路径模式：{g}")));
                }
            }
        }
        issues
    }

    pub fn is_ratifiable(&self) -> bool {
        !self.validate().iter().any(|i| matches!(i, ContractIssue::Error { .. }))
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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn quick_contract_is_ratifiable_and_warns_without_tests() {
        let with = Contract::quick("修复登录", Some("pnpm test".into()));
        assert!(with.is_ratifiable());
        assert!(with.validate().is_empty());

        let without = Contract::quick("修复登录", None);
        assert!(without.is_ratifiable());
        assert!(matches!(without.validate()[..], [ContractIssue::Warning { .. }]));
    }

    #[test]
    fn invalid_contracts_are_rejected() {
        let mut c = Contract::quick("  ", Some(" ".into()));
        c.budget.soft_usd = 10.0;
        let errors = c.validate().into_iter().filter(|i| matches!(i, ContractIssue::Error { .. })).count();
        assert_eq!(errors, 3, "intent, command and budget");
        assert!(!c.is_ratifiable());
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
