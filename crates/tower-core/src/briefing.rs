//! Re-entry briefing (`docs/08` §8.9): "since you last looked, what changed
//! that matters". Only events that move the goal or need you are included;
//! tool chatter never is.

use crate::event::EventKind;
use crate::honesty::ClaimKind;
use crate::lifecycle::{LifecycleState, PauseReason};

pub fn state_label(s: LifecycleState) -> &'static str {
    match s {
        LifecycleState::Draft => "草稿",
        LifecycleState::Ready => "就绪",
        LifecycleState::Running => "运行中",
        LifecycleState::Paused => "已暂停",
        LifecycleState::Claimed => "自称完成",
        LifecycleState::Verifying => "验证中",
        LifecycleState::InReview => "待验收",
        LifecycleState::Accepted => "已验收",
        LifecycleState::Integrated => "已合入",
        LifecycleState::Archived => "已归档",
        LifecycleState::Abandoned => "已放弃",
    }
}

pub fn pause_label(r: PauseReason) -> &'static str {
    match r {
        PauseReason::Human => "你暂停了它",
        PauseReason::BudgetSoftCap => "到达预算软上限",
        PauseReason::BudgetHardCap => "到达预算硬上限",
        PauseReason::IdleWithoutSubmit => "Agent 停下了但没有提交",
        PauseReason::EngineCrash => "引擎意外退出",
        PauseReason::AppQuit => "Tower 退出时暂停",
        PauseReason::VerifyFailedLimit => "验证失败且返工次数用完",
        PauseReason::VerifyEnvError => "验证环境出错（不是标准失败）",
        PauseReason::PrepareFailed => "准备工作区或启动引擎失败",
        PauseReason::ProviderError => "模型服务出错",
        PauseReason::SentinelHigh => "哨兵命中：需要你确认",
        PauseReason::WallClockCap => "超过单次运行的墙钟上限",
    }
}

/// One briefing line for an event, or `None` if it is not briefing-worthy.
pub fn describe(event: &EventKind) -> Option<String> {
    Some(match event {
        EventKind::StateChanged { to, reason: Some(r), .. } if *to == LifecycleState::Paused => {
            format!("暂停：{}", pause_label(*r))
        }
        EventKind::StateChanged { from, to, .. } => {
            format!("{} → {}", state_label(*from), state_label(*to))
        }
        EventKind::VerifyFinished { passed: true, .. } => "验证通过：全部机器标准在干净环境中通过".into(),
        EventKind::VerifyFinished { env_error: true, .. } => "验证环境出错，未得出结论".into(),
        EventKind::VerifyFinished { passed: false, .. } => "验证未通过".into(),
        EventKind::CriterionResult { criterion, passed: false, .. } => format!("{criterion} 验证失败"),
        EventKind::Claim { claim: ClaimKind::Assumption, text, .. } => format!("新假设待你批准：{text}"),
        EventKind::Claim { claim: ClaimKind::Cause, text, .. } => format!("Agent 称原因：{text}"),
        EventKind::Submitted { .. } => "Agent 称已完成".into(),
        EventKind::InboxOpened { title, .. } => format!("需要你：{title}"),
        EventKind::BranchWritten { branch, .. } => format!("已写入分支 {branch}"),
        EventKind::EngineError { message } => format!("引擎错误：{message}"),
        EventKind::SentinelHit { title, .. } => format!("哨兵：{title}"),
        EventKind::Stalled { detail, .. } => format!("可能卡住：{detail}"),
        EventKind::HumanEdited { files } => format!("你在暂停期间改了 {} 个文件", files.len()),
        EventKind::BranchPushed { branch, .. } => format!("已推送 {branch}"),
        _ => return None,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn tool_chatter_is_not_briefed() {
        let e = EventKind::ToolStarted { call_id: "1".into(), tool: "read".into(), summary: "a.rs".into() };
        assert_eq!(describe(&e), None);
    }

    #[test]
    fn pauses_say_why() {
        let e = EventKind::StateChanged {
            from: LifecycleState::Running,
            to: LifecycleState::Paused,
            reason: Some(PauseReason::BudgetSoftCap),
            note: String::new(),
        };
        assert_eq!(describe(&e).unwrap(), "暂停：到达预算软上限");
    }
}
