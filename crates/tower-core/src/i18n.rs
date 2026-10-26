//! The language Tower writes in.
//!
//! Every user-visible string produced by Rust goes through this module:
//! shared vocabulary lives in the tables below (state and pause labels,
//! decision options, sentinel titles, review risk reasons); one-off messages
//! use [`tr!`] next to the code that produces them, so both languages sit
//! side by side and neither can be forgotten.
//!
//! Text written into the event log or the inbox keeps the language it was
//! created in. Text derived on read (briefings, labels, risk reasons,
//! validation) follows the current setting. Agent-facing prompts are always
//! English; only the language the agent writes to the human follows
//! [`crate::view::Settings::agent_language`].
//!
//! Dependency-free on purpose: two languages do not need a framework.

use crate::lifecycle::{LifecycleState, PauseReason};

/// An interface language.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Default)]
pub enum Lang {
    /// Simplified Chinese (`zh-CN`).
    Zh,
    /// English (`en`).
    #[default]
    En,
}

impl Lang {
    pub const ALL: [Lang; 2] = [Lang::Zh, Lang::En];

    /// `zh`, `zh-CN`, `zh-Hans-CN`, ... are Chinese; everything else is English.
    pub fn from_code(code: &str) -> Self {
        if code.trim().to_ascii_lowercase().starts_with("zh") { Lang::Zh } else { Lang::En }
    }

    /// The code stored in settings and used for `<html lang>`.
    pub fn code(self) -> &'static str {
        match self {
            Lang::Zh => "zh-CN",
            Lang::En => "en",
        }
    }

    /// Picks the variant for this language.
    pub fn pick<T>(self, zh: T, en: T) -> T {
        match self {
            Lang::Zh => zh,
            Lang::En => en,
        }
    }
}

/// Formats a message in one of two languages:
/// `tr!(lang, "已推送 {branch}", "Pushed {branch}")`. Both strings take the
/// same inline captures or trailing arguments.
#[macro_export]
macro_rules! tr {
    ($lang:expr, $zh:literal, $en:literal $(,)?) => {
        match $lang {
            $crate::i18n::Lang::Zh => format!($zh),
            $crate::i18n::Lang::En => format!($en),
        }
    };
    ($lang:expr, $zh:literal, $en:literal, $($arg:tt)+) => {
        match $lang {
            $crate::i18n::Lang::Zh => format!($zh, $($arg)+),
            $crate::i18n::Lang::En => format!($en, $($arg)+),
        }
    };
}

/// The language a new install starts in: `TOWER_LANG` if set (for demos and
/// tests), else the first macOS preferred language (`AppleLanguages`, read
/// through CoreFoundation, so it works for apps launched from Finder where
/// `LANG` is unset), else `LC_ALL`/`LANG`. Chinese if that starts with `zh`,
/// otherwise English. Detected once per process.
pub fn system_language() -> Lang {
    static DETECTED: std::sync::OnceLock<Lang> = std::sync::OnceLock::new();
    *DETECTED.get_or_init(|| {
        let env = |k: &str| std::env::var(k).ok().filter(|v| !v.trim().is_empty());
        env("TOWER_LANG")
            .or_else(sys_locale::get_locale)
            .or_else(|| env("LC_ALL"))
            .or_else(|| env("LANG"))
            .map(|code| Lang::from_code(&code))
            .unwrap_or(Lang::En)
    })
}

/// `n` followed by the singular or plural English noun.
pub fn plural(n: usize, one: &str, many: &str) -> String {
    format!("{n} {}", if n == 1 { one } else { many })
}

// ---- lifecycle --------------------------------------------------------------

pub fn state_label(s: LifecycleState, lang: Lang) -> &'static str {
    use LifecycleState::*;
    match s {
        Draft => lang.pick("草稿", "Draft"),
        Ready => lang.pick("就绪", "Ready"),
        Running => lang.pick("运行中", "Running"),
        Paused => lang.pick("已暂停", "Paused"),
        Claimed => lang.pick("自称完成", "Claimed done"),
        Verifying => lang.pick("验证中", "Verifying"),
        InReview => lang.pick("待验收", "Ready to accept"),
        Accepted => lang.pick("已验收", "Accepted"),
        Integrated => lang.pick("已合入", "Merged"),
        Archived => lang.pick("已归档", "Archived"),
        Abandoned => lang.pick("已放弃", "Abandoned"),
    }
}

pub fn pause_label(r: PauseReason, lang: Lang) -> &'static str {
    use PauseReason::*;
    match r {
        Human => lang.pick("你暂停了它", "You paused it"),
        BudgetSoftCap => lang.pick("到达预算软上限", "Reached the soft budget cap"),
        BudgetHardCap => lang.pick("到达预算硬上限", "Reached the hard budget cap"),
        IdleWithoutSubmit => lang.pick("Agent 停下了但没有提交", "The agent stopped without submitting"),
        EngineCrash => lang.pick("引擎意外退出", "The engine exited unexpectedly"),
        AppQuit => lang.pick("Tower 退出时暂停", "Paused when Tower quit"),
        VerifyFailedLimit => lang.pick("验证失败且返工次数用完", "Verification failed and no rework cycles are left"),
        VerifyEnvError => {
            lang.pick("验证环境出错（不是标准失败）", "Verification environment error (not a criterion failure)")
        }
        PrepareFailed => lang.pick("准备工作区或启动引擎失败", "Could not prepare the workspace or start the engine"),
        ProviderError => lang.pick("模型服务出错", "Model provider error"),
        SentinelHigh => lang.pick("哨兵命中：需要你确认", "Sentinel hit: needs your confirmation"),
        WallClockCap => lang.pick("超过单次运行的墙钟上限", "The run passed its wall-clock cap"),
        Internal => lang.pick("Tower 内部出错", "Tower ran into an internal error"),
        DependenciesChanged => lang.pick(
            "Agent 改了依赖，验证的准备步骤需要联网",
            "The agent changed dependencies; verification setup needs the network",
        ),
    }
}

// ---- decisions --------------------------------------------------------------

/// A fixed option on a Needs-You card. Items store the label in the language
/// they were created in; answers are matched back to a choice through
/// [`Choice::parse`], which accepts either language, so an item created in
/// Chinese still works after switching to English and vice versa.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub enum Choice {
    Approve,
    Reject,
    Retry,
    Continue,
    Reverify,
    OneMoreRework,
    RaiseSoftCap,
    DoubleBudget,
    Abandon,
    OverrideSentinel,
    SentinelRework,
    MoreTime,
    KeepWaiting,
    Pause,
    Yes,
    No,
    Allow,
    Deny,
    InstallWithNetwork,
}

impl Choice {
    pub const ALL: [Choice; 19] = [
        Choice::Approve,
        Choice::Reject,
        Choice::Retry,
        Choice::Continue,
        Choice::Reverify,
        Choice::OneMoreRework,
        Choice::RaiseSoftCap,
        Choice::DoubleBudget,
        Choice::Abandon,
        Choice::OverrideSentinel,
        Choice::SentinelRework,
        Choice::MoreTime,
        Choice::KeepWaiting,
        Choice::Pause,
        Choice::Yes,
        Choice::No,
        Choice::Allow,
        Choice::Deny,
        Choice::InstallWithNetwork,
    ];

    pub fn label(self, lang: Lang) -> &'static str {
        use Choice::*;
        match self {
            Approve => lang.pick("批准", "Approve"),
            Reject => lang.pick("驳回", "Reject"),
            Retry => lang.pick("重试", "Retry"),
            Continue => lang.pick("继续", "Continue"),
            Reverify => lang.pick("重新验证", "Verify again"),
            OneMoreRework => lang.pick("让 Agent 再返工一次", "Let the agent rework once more"),
            RaiseSoftCap => lang.pick("把软上限提高到硬上限并继续", "Raise the soft cap to the hard cap and continue"),
            DoubleBudget => lang.pick("预算翻倍并继续", "Double the budget and continue"),
            Abandon => lang.pick("放弃这个目标", "Abandon this goal"),
            OverrideSentinel => lang.pick("我已确认，进入评审", "I've checked, go to review"),
            SentinelRework => lang.pick("让 Agent 去掉这些改动后重做", "Have the agent redo it without these changes"),
            MoreTime => lang.pick("再给 30 分钟", "Give it 30 more minutes"),
            KeepWaiting => lang.pick("继续等待", "Keep waiting"),
            Pause => lang.pick("暂停", "Pause"),
            Yes => lang.pick("是", "Yes"),
            No => lang.pick("否", "No"),
            Allow => lang.pick("允许", "Allow"),
            Deny => lang.pick("拒绝", "Deny"),
            InstallWithNetwork => lang.pick("我看过改动，这次联网安装", "I've checked, install with the network"),
        }
    }

    /// The choice a response names, in either language. `None` for free text.
    pub fn parse(response: &str) -> Option<Choice> {
        let r = response.trim();
        Self::ALL.into_iter().find(|c| Lang::ALL.iter().any(|&l| c.label(l).eq_ignore_ascii_case(r)))
    }

    /// How an option should be presented: whether it ends or overrides
    /// something (needs a deliberate second press) or moves the goal on.
    pub fn tone(self) -> crate::view::OptionTone {
        use crate::view::OptionTone;
        match self {
            Choice::Abandon | Choice::OverrideSentinel => OptionTone::Destructive,
            Choice::Approve | Choice::Allow | Choice::Continue | Choice::Retry | Choice::Yes => OptionTone::Primary,
            _ => OptionTone::Neutral,
        }
    }

    /// Labels for a set of choices, in one language.
    pub fn labels(choices: &[Choice], lang: Lang) -> Vec<String> {
        choices.iter().map(|c| c.label(lang).to_string()).collect()
    }
}

// ---- sentinels and review ---------------------------------------------------

/// Title of a sentinel by its stable id, or `None` for an unknown id.
pub fn sentinel_title(id: &str, lang: Lang) -> Option<&'static str> {
    Some(match id {
        "test_deleted" => lang.pick("删除了测试文件", "Deleted test files"),
        "test_skipped" => {
            lang.pick("新增了跳过或只运行部分测试的标记", "Added markers that skip tests or run only some")
        }
        "assertions_removed" => lang.pick("测试中的断言变少了", "Tests have fewer assertions"),
        "test_command_changed" => lang.pick("修改了测试命令", "Changed the test command"),
        "test_config_changed" => lang.pick("修改了测试配置", "Changed the test configuration"),
        "snapshots_changed" => lang.pick("更新了测试快照", "Updated test snapshots"),
        "tests_removed" => lang.pick("测试用例变少了", "Fewer test cases"),
        "expectations_changed" => lang.pick("改了测试的期望值", "Changed what a test expects"),
        "passes_only_with_edited_tests" => {
            lang.pick("只有在改过的测试下才通过", "Passes only with the agent's edits to existing tests")
        }
        "tests_hollowed" => {
            lang.pick("新增了不会失败的断言或提前返回", "Added assertions that cannot fail or early returns")
        }
        "scope_violation" => lang.pick("改动超出了合同的范围", "Changes go beyond the contract's scope"),
        _ => return None,
    })
}

/// Why a file in a review unit deserves attention.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub enum Risk {
    OutsideScope,
    Excluded,
    ReadOnly,
    TestDeleted,
    TestShrunk,
    Snapshots,
    Ci,
    Manifest,
    Lockfile,
    Migration,
    Sensitive,
    LargeDeletion,
    Binary,
}

impl Risk {
    pub fn label(self, lang: Lang) -> &'static str {
        use Risk::*;
        match self {
            OutsideScope => lang.pick("在合同范围围栏之外", "outside the contract's scope fence"),
            Excluded => lang.pick("合同排除的路径", "a path the contract excludes"),
            ReadOnly => lang.pick("合同设为只读的路径", "a path the contract makes read-only"),
            TestDeleted => lang.pick("删除了测试文件", "deleted a test file"),
            TestShrunk => lang.pick("测试删得比加得多", "the test lost more lines than it gained"),
            Snapshots => lang.pick("改了测试快照", "changed test snapshots"),
            Ci => lang.pick("改了 CI 配置", "changed CI configuration"),
            Manifest => lang.pick("改了依赖清单", "changed the dependency manifest"),
            Lockfile => lang.pick("改了锁文件", "changed a lockfile"),
            Migration => lang.pick("数据库迁移", "database migration"),
            Sensitive => lang.pick("涉及认证、支付或权限", "touches auth, payments or permissions"),
            LargeDeletion => lang.pick("大量删除", "large deletion"),
            Binary => lang.pick("二进制文件", "binary file"),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn codes_round_trip() {
        for l in Lang::ALL {
            assert_eq!(Lang::from_code(l.code()), l);
        }
        assert_eq!(Lang::from_code("zh-Hans-CN"), Lang::Zh);
        assert_eq!(Lang::from_code("en-GB"), Lang::En);
        assert_eq!(Lang::from_code("fr"), Lang::En);
        assert_eq!(Lang::from_code(""), Lang::En);
    }

    #[test]
    fn choices_parse_from_either_language() {
        for c in Choice::ALL {
            for l in Lang::ALL {
                assert_eq!(Choice::parse(c.label(l)), Some(c), "{c:?} in {l:?}");
            }
        }
        assert_eq!(Choice::parse("  abandon this goal "), Some(Choice::Abandon));
        assert_eq!(Choice::parse("请先看一下 README"), None);
    }

    #[test]
    fn labels_are_unique_across_languages() {
        let mut seen = std::collections::HashSet::new();
        for c in Choice::ALL {
            for l in Lang::ALL {
                assert!(seen.insert(c.label(l).to_lowercase()), "duplicate label {:?}", c.label(l));
            }
        }
    }

    #[test]
    fn tr_formats_in_each_language() {
        let branch = "tower/g-1";
        assert_eq!(tr!(Lang::Zh, "已推送 {branch}", "Pushed {branch}"), "已推送 tower/g-1");
        assert_eq!(tr!(Lang::En, "已推送 {branch}", "Pushed {branch}"), "Pushed tower/g-1");
        assert_eq!(tr!(Lang::En, "{} 个", "{} items", 3), "3 items");
    }

    #[test]
    fn plural_is_english_only_where_needed() {
        assert_eq!(plural(1, "file", "files"), "1 file");
        assert_eq!(plural(2, "file", "files"), "2 files");
    }
}
