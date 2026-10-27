//! Why a criterion's command could not run as meant: the environment
//! problem that pauses verification instead of counting as a failure.

use tower_core::tr;

use super::{Bench, Outcome, Ran, tail_lines};

impl Bench<'_> {
    pub(super) fn env_error(&self, id: &str, command: &str, r: &Ran) -> Outcome {
        let lang = self.inner.lang();
        let how = match r.exit_code {
            Some(code) => tr!(lang, "退出码 {code}", "exit code {code}"),
            None => tr!(lang, "未启动", "did not start"),
        };
        let tail = tail_lines(&r.output_tail, 20);
        if let Some(port) = crate::sandbox::loopback_refusal(&r.output_tail).filter(|_| !r.denied) {
            let cause = tower_core::env_cause::EnvCause::Loopback(port);
            let problem = format!("{id} · `{command}`\n{tail}");
            return Outcome::EnvError(tower_core::i18n::PauseNote::Blocked { cause, problem }.encode());
        }
        // What happened, once: the pause itself ("the criteria cannot run in the verification sandbox") and the
        // card's environment line already say it is no test failure, so the sentence does not say it a third time.
        if r.denied {
            return Outcome::EnvError(tr!(
                lang,
                "{id} 的命令 `{command}` 在验证沙箱里被拒绝访问了它需要的东西（{how}）。\n{tail}",
                "The sandbox refused something the command `{command}` of {id} needed ({how}).\n{tail}"
            ));
        }
        Outcome::EnvError(tr!(
            lang,
            "{id} 的命令 `{command}` 无法运行（{how}）：\n{tail}",
            "The command `{command}` of {id} could not run ({how}):\n{tail}"
        ))
    }
}
