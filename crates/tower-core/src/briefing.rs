//! Re-entry briefing (`docs/08` §8.9): "since you last looked, what changed
//! that matters". Only events that move the goal or need you are included;
//! tool chatter never is.

use crate::event::EventKind;
use crate::honesty::ClaimKind;
use crate::i18n::{Lang, pause_label, plural, sentinel_title, state_label};
use crate::lifecycle::LifecycleState;
use crate::tr;

/// One briefing line for an event, or `None` if it is not briefing-worthy.
/// Written on read, so it follows the current language.
pub fn describe(event: &EventKind, lang: Lang) -> Option<String> {
    Some(match event {
        EventKind::StateChanged { to, reason: Some(r), .. } if *to == LifecycleState::Paused => {
            let why = pause_label(*r, lang);
            tr!(lang, "暂停：{why}", "Paused: {why}")
        }
        EventKind::StateChanged { from, to, .. } => {
            format!("{} → {}", state_label(*from, lang), state_label(*to, lang))
        }
        EventKind::VerifyFinished { passed: true, .. } => tr!(
            lang,
            "验证通过：全部机器标准在干净环境中通过",
            "Verified: every machine criterion passed in a clean checkout"
        ),
        EventKind::VerifyFinished { env_error: true, .. } => {
            tr!(lang, "验证环境出错，未得出结论", "Verification environment error; no verdict")
        }
        EventKind::VerifyFinished { passed: false, .. } => tr!(lang, "验证未通过", "Verification failed"),
        EventKind::CriterionResult { criterion, passed: false, .. } => {
            tr!(lang, "{criterion} 验证失败", "{criterion} failed verification")
        }
        EventKind::Claim { claim: ClaimKind::Assumption, text, .. } => {
            tr!(lang, "新假设待你批准：{text}", "New assumption for you to approve: {text}")
        }
        EventKind::Claim { claim: ClaimKind::Cause, text, .. } => {
            tr!(lang, "Agent 称原因：{text}", "Agent says the cause is: {text}")
        }
        EventKind::Submitted { .. } => tr!(lang, "Agent 称已完成", "Agent says it is done"),
        EventKind::InboxOpened { title, .. } => tr!(lang, "需要你：{title}", "Needs you: {title}"),
        EventKind::BranchWritten { branch, .. } => tr!(lang, "已写入分支 {branch}", "Wrote branch {branch}"),
        EventKind::EngineError { message } => tr!(lang, "引擎错误：{message}", "Engine error: {message}"),
        EventKind::SentinelHit { sentinel, title, .. } => {
            let title = sentinel_title(sentinel, lang).unwrap_or(title);
            tr!(lang, "哨兵：{title}", "Sentinel: {title}")
        }
        EventKind::Stalled { detail, .. } => tr!(lang, "可能卡住：{detail}", "May be stuck: {detail}"),
        EventKind::HumanEdited { files } => match lang {
            Lang::Zh => format!("你在暂停期间改了 {} 个文件", files.len()),
            Lang::En => format!("You changed {} while paused", plural(files.len(), "file", "files")),
        },
        EventKind::BranchPushed { branch, .. } => tr!(lang, "已推送 {branch}", "Pushed {branch}"),
        _ => return None,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::lifecycle::PauseReason;

    #[test]
    fn tool_chatter_is_not_briefed() {
        let e = EventKind::ToolStarted { call_id: "1".into(), tool: "read".into(), summary: "a.rs".into() };
        assert_eq!(describe(&e, Lang::Zh), None);
        assert_eq!(describe(&e, Lang::En), None);
    }

    #[test]
    fn pauses_say_why() {
        let e = EventKind::StateChanged {
            from: LifecycleState::Running,
            to: LifecycleState::Paused,
            reason: Some(PauseReason::BudgetSoftCap),
            note: String::new(),
        };
        assert_eq!(describe(&e, Lang::Zh).unwrap(), "暂停：到达预算软上限");
        assert_eq!(describe(&e, Lang::En).unwrap(), "Paused: Reached the soft budget cap");
    }

    #[test]
    fn counts_read_naturally_in_english() {
        let one = EventKind::HumanEdited { files: vec!["a.rs".into()] };
        let two = EventKind::HumanEdited { files: vec!["a.rs".into(), "b.rs".into()] };
        assert_eq!(describe(&one, Lang::En).unwrap(), "You changed 1 file while paused");
        assert_eq!(describe(&two, Lang::En).unwrap(), "You changed 2 files while paused");
        assert_eq!(describe(&two, Lang::Zh).unwrap(), "你在暂停期间改了 2 个文件");
    }
}
