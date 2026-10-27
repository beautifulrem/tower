//! Reasons Tower records without a language and puts into words when they
//! are read, so they follow the interface language (the pattern of
//! [`crate::i18n::PauseNote`] and [`crate::i18n::Stall`]): why a criterion
//! could not run on the base commit, and why a push was not delivered.
//! Text stored before a reason was structured reads as it was written.

use serde::{Deserialize, Serialize};

use crate::i18n::Lang;
use crate::tr;

fn exit_words(code: Option<i32>, lang: Lang) -> String {
    match code {
        Some(c) => tr!(lang, "退出码 {c}", "exit code {c}"),
        None => tr!(lang, "未启动", "did not start"),
    }
}

/// Why a criterion's command gave no baseline on the base commit.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum BaseError {
    /// The verification sandbox refused something the command needed.
    Refused { code: Option<i32>, tail: String },
    /// The command exited, but no test ran (a test runner that never got
    /// as far as its tests).
    NotRun { code: Option<i32>, tail: String },
    /// The command could not run at all.
    CouldNotRun { code: Option<i32>, tail: String },
}

impl BaseError {
    const MARK: char = '\u{1d}';

    pub fn encode(&self) -> String {
        let (kind, code, tail) = match self {
            BaseError::Refused { code, tail } => ("refused", code, tail),
            BaseError::NotRun { code, tail } => ("not_run", code, tail),
            BaseError::CouldNotRun { code, tail } => ("could_not_run", code, tail),
        };
        let code = code.map_or("-".to_string(), |c| c.to_string());
        format!("{}{kind} {code}\n{tail}", Self::MARK)
    }

    pub fn decode(s: &str) -> Option<BaseError> {
        let rest = s.strip_prefix(Self::MARK)?;
        let (head, tail) = rest.split_once('\n').unwrap_or((rest, ""));
        let (kind, code) = head.split_once(' ')?;
        let code = if code == "-" { None } else { Some(code.parse().ok()?) };
        let tail = tail.to_string();
        match kind {
            "refused" => Some(BaseError::Refused { code, tail }),
            "not_run" => Some(BaseError::NotRun { code, tail }),
            "could_not_run" => Some(BaseError::CouldNotRun { code, tail }),
            _ => None,
        }
    }

    pub fn text(&self, lang: Lang) -> String {
        match self {
            BaseError::Refused { code, tail } => {
                let code = exit_words(*code, lang);
                tr!(
                    lang,
                    "在基线上被验证沙箱拒绝（{code}）：{tail}",
                    "refused by the verification sandbox on the base ({code}): {tail}"
                )
            }
            BaseError::NotRun { code, tail } => {
                let code = exit_words(*code, lang);
                tr!(
                    lang,
                    "在基线上测试没有运行起来（{code}）：{tail}",
                    "the tests did not run on the base ({code}): {tail}"
                )
            }
            BaseError::CouldNotRun { code, tail } => {
                let code = exit_words(*code, lang);
                tr!(lang, "在基线上无法运行（{code}）：{tail}", "could not run on the base ({code}): {tail}")
            }
        }
    }

    /// A stored reason in words: decoded, or as it was written.
    pub fn render(stored: &str, lang: Lang) -> String {
        BaseError::decode(stored).map_or_else(|| stored.to_string(), |e| e.text(lang))
    }
}

/// The project's setup command failed on the base commit, before any of
/// the agent's work was involved.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct SetupFails {
    pub setup: String,
    pub tail: String,
}

impl SetupFails {
    pub fn text(&self, lang: Lang) -> String {
        let (setup, tail) = (&self.setup, &self.tail);
        tr!(
            lang,
            "准备命令 `{setup}` 在基线提交上就失败了（与 Agent 的改动无关）：\n{tail}",
            "The setup command `{setup}` fails on the base commit itself (not because of the agent's changes):\n{tail}"
        )
    }
}

/// One criterion that could not run on your own code.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct BaseProblem {
    pub id: String,
    pub title: String,
    /// A stored [`BaseError`] (or older text).
    pub error: String,
}

/// What the preflight found: the criteria cannot run in the verification
/// sandbox on your own code, because setup fails there or because of each
/// criterion's own reason.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct Preflight {
    /// A stored pause note (setup failing on the base) or older text.
    pub setup: Option<String>,
    pub criteria: Vec<BaseProblem>,
}

impl Preflight {
    pub fn text(&self, lang: Lang) -> String {
        let problem = match &self.setup {
            Some(s) => crate::i18n::PauseNote::render(s, lang),
            None => self
                .criteria
                .iter()
                .map(|c| format!("{} · {}: {}", c.id, c.title, BaseError::render(&c.error, lang)))
                .collect::<Vec<_>>()
                .join("\n"),
        };
        tr!(
            lang,
            "Tower 在验证沙箱里用你自己的代码试跑了验收标准，它们没法在那里运行，所以 Agent 的结果也没法验证。修好后点“重试”。\n\n{problem}",
            "Tower tried the acceptance criteria on your own code in the verification sandbox, and they cannot run there, so the agent's work could not be verified either. Fix it, then retry.\n\n{problem}"
        )
    }
}

/// Why a push was not delivered.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum PushError {
    /// The address is neither https nor http to this Mac or Tailscale.
    NotAllowed,
    /// curl could not be started.
    NoCurl,
    /// curl failed with this exit code (see `man curl`, EXIT CODES).
    Curl(i32),
    /// The push service answered with this HTTP status.
    Status(String),
}

impl PushError {
    const MARK: char = '\u{1c}';

    pub fn encode(&self) -> String {
        let m = Self::MARK;
        match self {
            PushError::NotAllowed => format!("{m}not_allowed"),
            PushError::NoCurl => format!("{m}no_curl"),
            PushError::Curl(code) => format!("{m}curl {code}"),
            PushError::Status(code) => format!("{m}status {code}"),
        }
    }

    pub fn decode(s: &str) -> Option<PushError> {
        let rest = s.strip_prefix(Self::MARK)?;
        let (kind, arg) = rest.split_once(' ').unwrap_or((rest, ""));
        match kind {
            "not_allowed" => Some(PushError::NotAllowed),
            "no_curl" => Some(PushError::NoCurl),
            "curl" => Some(PushError::Curl(arg.parse().ok()?)),
            "status" => Some(PushError::Status(arg.into())),
            _ => None,
        }
    }

    pub fn text(&self, lang: Lang) -> String {
        match self {
            PushError::NotAllowed => tr!(
                lang,
                "推送地址必须是 https（或本机、Tailscale 上的 http）",
                "The push address must use https (or http on this Mac or Tailscale)"
            ),
            PushError::NoCurl => tr!(lang, "无法启动 curl", "curl could not be started"),
            PushError::Status(code) => tr!(lang, "推送服务返回 {code}", "The push service answered {code}"),
            PushError::Curl(code) => {
                let what = match code {
                    3 => tr!(lang, "推送地址的格式不对", "The push address is malformed"),
                    5 | 6 => tr!(lang, "找不到推送服务器的地址", "The push server's address could not be found"),
                    7 => tr!(lang, "连不上推送服务器", "Could not connect to the push server"),
                    28 => tr!(lang, "推送服务器 10 秒内没有回应", "The push server did not answer within 10 seconds"),
                    35 | 51 | 53 | 54 | 58 | 59 | 60 | 77 | 80 | 83 | 90 | 91 => {
                        tr!(lang, "与推送服务器的加密连接没有建立", "The secure connection to the push server failed")
                    }
                    52 | 55 | 56 => {
                        tr!(lang, "与推送服务器的连接中断了", "The connection to the push server broke off")
                    }
                    _ => tr!(lang, "推送没有发出", "The push was not sent"),
                };
                // The code stays: it is what to search for.
                tr!(lang, "{what}（curl 退出码 {code}）", "{what} (curl exit code {code})")
            }
        }
    }

    /// A stored reason in words: decoded, or as it was written.
    pub fn render(stored: &str, lang: Lang) -> String {
        PushError::decode(stored).map_or_else(|| stored.to_string(), |e| e.text(lang))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn base_errors_are_put_into_words_on_read() {
        let e = BaseError::Refused { code: Some(1), tail: "deny file-read-data /x\nsecond line".into() };
        assert_eq!(BaseError::decode(&e.encode()), Some(e.clone()));
        assert_eq!(
            BaseError::render(&e.encode(), Lang::En),
            "refused by the verification sandbox on the base (exit code 1): deny file-read-data /x\nsecond line"
        );
        assert_eq!(
            BaseError::render(&BaseError::NotRun { code: None, tail: "t".into() }.encode(), Lang::Zh),
            "在基线上测试没有运行起来（未启动）：t"
        );
        let empty = BaseError::CouldNotRun { code: Some(127), tail: String::new() };
        assert_eq!(BaseError::decode(&empty.encode()), Some(empty));
        // Stored before reasons were structured: as written.
        assert_eq!(
            BaseError::render("could not run on the base (exit code 2): x", Lang::Zh),
            "could not run on the base (exit code 2): x"
        );
    }

    #[test]
    fn push_errors_are_put_into_words_on_read() {
        for e in [PushError::NotAllowed, PushError::NoCurl, PushError::Curl(6), PushError::Status("502".into())] {
            assert_eq!(PushError::decode(&e.encode()), Some(e.clone()));
            assert_ne!(e.text(Lang::Zh), e.text(Lang::En));
        }
        assert_eq!(
            PushError::render(&PushError::Curl(6).encode(), Lang::Zh),
            "找不到推送服务器的地址（curl 退出码 6）"
        );
        assert_eq!(
            PushError::render(&PushError::Curl(6).encode(), Lang::En),
            "The push server's address could not be found (curl exit code 6)"
        );
        assert_eq!(
            PushError::render(&PushError::Curl(99).encode(), Lang::En),
            "The push was not sent (curl exit code 99)"
        );
        assert_eq!(
            PushError::render("curl: (6) Could not resolve host: x", Lang::Zh),
            "curl: (6) Could not resolve host: x"
        );
    }
}
