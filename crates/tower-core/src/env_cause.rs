//! Why a command could not run in the verification sandbox, when Tower can
//! tell from its output: named specifically, with a way out that never asks
//! the agent to change the repository. Stored as a short code and put into
//! words when read, in the interface's language.

use crate::i18n::Lang;
use crate::tr;

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum EnvCause {
    /// rustup found no default toolchain (and the project names none).
    RustupDefault,
    /// The project asks for a rustup toolchain that is not installed.
    RustupToolchainMissing(String),
    /// A Node.js version manager (nvm, fnm, volta, asdf, mise, nodenv)
    /// found no version to use.
    NodeVersion(String),
    /// The developer tools are not selected or not installed.
    Xcode,
    /// A program is not found on the sandbox's `PATH`.
    CommandMissing(String),
    /// A connection to this port on this machine, which the sandbox keeps
    /// closed (0: the output names no port).
    Loopback(u16),
}

impl EnvCause {
    pub fn code(&self) -> String {
        match self {
            EnvCause::RustupDefault => "rustup_default".into(),
            EnvCause::RustupToolchainMissing(t) => format!("rustup_missing:{t}"),
            EnvCause::NodeVersion(m) => format!("node:{m}"),
            EnvCause::Xcode => "xcode".into(),
            EnvCause::CommandMissing(c) => format!("missing:{c}"),
            EnvCause::Loopback(p) => format!("loopback:{p}"),
        }
    }

    pub fn from_code(s: &str) -> Option<EnvCause> {
        let (kind, arg) = s.split_once(':').unwrap_or((s, ""));
        Some(match kind {
            "rustup_default" => EnvCause::RustupDefault,
            "rustup_missing" => EnvCause::RustupToolchainMissing(arg.into()),
            "node" => EnvCause::NodeVersion(arg.into()),
            "xcode" => EnvCause::Xcode,
            "missing" => EnvCause::CommandMissing(arg.into()),
            "loopback" => EnvCause::Loopback(arg.parse().ok()?),
            _ => return None,
        })
    }

    /// The cause in `output`, when it is one Tower recognises.
    pub fn detect(output: &str) -> Option<EnvCause> {
        let lower = output.to_ascii_lowercase();
        // rustup's settings where the sandbox looks are missing: no default
        // to choose, or not even its home.
        let rustup_home_missing = lower.contains("could not create home directory") && lower.contains(".rustup");
        if lower.contains("rustup could not choose a version")
            || lower.contains("no default toolchain configured")
            || rustup_home_missing
        {
            return Some(EnvCause::RustupDefault);
        }
        if let Some(name) = between(output, "toolchain '", "' is not installed") {
            return Some(EnvCause::RustupToolchainMissing(name));
        }
        for (needle, manager) in [
            ("nvm is not compatible", "nvm"),
            ("n/a: version", "nvm"),
            ("fnm: ", "fnm"),
            ("can't find an installed node version", "fnm"),
            ("volta error", "volta"),
            ("could not detect a node version", "volta"),
            ("no version is set for command node", "asdf"),
            ("no version is set for command npm", "asdf"),
            ("mise error", "mise"),
            ("mise warn", "mise"),
            ("nodenv: version", "nodenv"),
        ] {
            if lower.contains(needle) {
                return Some(EnvCause::NodeVersion(manager.into()));
            }
        }
        if lower.contains("xcrun: error: invalid active developer path")
            || lower.contains("requires xcode, but active developer directory")
            || lower.contains("no developer tools were found")
        {
            return Some(EnvCause::Xcode);
        }
        if let Some(port) = loopback_refusal(output) {
            return Some(EnvCause::Loopback(port));
        }
        missing_command(output).map(EnvCause::CommandMissing)
    }

    /// The cause and the way out, in words.
    pub fn text(&self, lang: Lang) -> String {
        match self {
            EnvCause::RustupDefault => tr!(
                lang,
                "原因：验证沙箱里找不到 rustup 的默认工具链（你的终端里找得到）。Tower 已按你的登录 shell 读取 rustup 的设置；如果仍然这样，请在终端里运行 `rustup default stable`（或设为你终端里用的那个工具链），然后点“重试”。不需要改仓库。",
                "Cause: the sandbox cannot find rustup's default toolchain (your terminal can). Tower reads rustup's settings where your login shell has them; if this persists, run `rustup default stable` in your terminal (or the toolchain your terminal uses), then retry. Nothing in the repository needs to change."
            ),
            EnvCause::RustupToolchainMissing(t) => tr!(
                lang,
                "原因：项目要求的 Rust 工具链 `{t}` 没有安装。请在终端里运行 `rustup toolchain install {t}`，然后点“重试”。",
                "Cause: the Rust toolchain `{t}` the project asks for is not installed. Run `rustup toolchain install {t}` in your terminal, then retry."
            ),
            EnvCause::NodeVersion(m) => tr!(
                lang,
                "原因：验证沙箱里，{m} 没有找到要用的 Node.js 版本。请在终端里为 {m} 设好默认版本（例如 `nvm alias default 22`、`fnm default 22`、`volta install node@22`、`asdf set -u nodejs 22`、`mise use -g node@22`），然后点“重试”。不需要改仓库。",
                "Cause: in the sandbox, {m} found no Node.js version to use. Set a default version for {m} in your terminal (for example `nvm alias default 22`, `fnm default 22`, `volta install node@22`, `asdf set -u nodejs 22`, `mise use -g node@22`), then retry. Nothing in the repository needs to change."
            ),
            EnvCause::Xcode => tr!(
                lang,
                "原因：开发者工具没有安装或没有选好。请在终端里运行 `xcode-select --install`（装了完整 Xcode 的话：`sudo xcode-select -s /Applications/Xcode.app`），然后点“重试”。",
                "Cause: the developer tools are not installed or not selected. Run `xcode-select --install` in your terminal (with a full Xcode: `sudo xcode-select -s /Applications/Xcode.app`), then retry."
            ),
            EnvCause::CommandMissing(c) => tr!(
                lang,
                "原因：验证沙箱里找不到 `{c}`。Tower 用的是你登录 shell 的 PATH；如果你的终端找得到它，请确认它在登录 shell 里也被加入了 PATH（例如写在 ~/.zprofile 里），然后点“重试”。",
                "Cause: `{c}` is not found in the sandbox. Tower uses your login shell's PATH; if your terminal finds it, make sure your login shell puts it on PATH too (in ~/.zprofile, say), then retry."
            ),
            EnvCause::Loopback(port) => {
                let which = if *port == 0 {
                    tr!(lang, "本机的一个端口", "a port on this machine")
                } else {
                    tr!(lang, "本机端口 {port}", "port {port} on this machine")
                };
                tr!(
                    lang,
                    "原因：命令连接了{which}，而验证沙箱让它保持关闭：不联网时，本机回环只放行命令自己的进程已在监听的端口和合同声明的端口。请在合同的“本机端口”里声明它；如果测试在运行时自己挑端口（例如监听 0 号端口的服务器、构建守护进程），就在合同里打开“放开本机回环”。然后点“重试”。",
                    "Cause: the command connected to {which}, which its sandbox keeps closed: with the network off, loopback reaches only what the command's own processes already listen on and the ports the contract declares. Declare it under “Ports on this machine” in the contract; for tests that pick their ports at run time (servers on port 0, a build daemon), turn on “Open loopback” there instead. Then retry."
                )
            }
        }
    }
}

fn between(text: &str, start: &str, end: &str) -> Option<String> {
    let at = text.find(start)? + start.len();
    let len = text[at..].find(end)?;
    let name = &text[at..at + len];
    (!name.is_empty() && name.len() < 80 && !name.contains('\n')).then(|| name.to_string())
}

/// `sh: foo: command not found`, `env: foo: No such file or directory`,
/// `zsh: command not found: foo`.
fn missing_command(output: &str) -> Option<String> {
    for line in output.lines() {
        let l = line.trim();
        if let Some(rest) = l.split("command not found: ").nth(1) {
            return Some(rest.trim().to_string()).filter(|c| !c.is_empty());
        }
        if let Some(head) = l.strip_suffix(": command not found") {
            return head.rsplit(": ").next().map(|c| c.trim().to_string()).filter(|c| !c.is_empty());
        }
        if let Some(head) = l.strip_prefix("env: ").and_then(|r| r.strip_suffix(": No such file or directory")) {
            return Some(head.trim().to_string()).filter(|c| !c.is_empty() && !c.contains('/'));
        }
    }
    None
}

/// The loopback port a command's output says the sandbox refused to
/// connect to (as Node, Go, Python, Rust and curl print it), or 0 when the
/// refusal names no port. `None`: no loopback refusal in the output.
pub fn loopback_refusal(output: &str) -> Option<u16> {
    for line in output.lines() {
        let l = line.to_ascii_lowercase();
        let refused = l.contains("eperm") || l.contains("operation not permitted");
        let connecting = l.contains("connect") || l.contains("dial tcp");
        if !(refused && connecting) {
            continue;
        }
        for host in ["127.0.0.1:", "[::1]:", "localhost:", "::1:"] {
            if let Some(at) = l.find(host) {
                let digits: String = l[at + host.len()..].chars().take_while(char::is_ascii_digit).collect();
                if let Ok(port) = digits.parse() {
                    return Some(port);
                }
            }
        }
        if l.contains("127.0.0.1") || l.contains("localhost") || l.contains("::1") {
            return Some(0);
        }
    }
    None
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn causes_are_recognised_and_round_trip() {
        let rustup = "error: rustup could not choose a version of cargo to run, because one wasn't specified explicitly, and no default is configured.";
        assert_eq!(EnvCause::detect(rustup), Some(EnvCause::RustupDefault));
        let no_home =
            "error: could not create home directory: '/Users/a/.rustup': Operation not permitted (os error 1)";
        assert_eq!(EnvCause::detect(no_home), Some(EnvCause::RustupDefault));
        assert_eq!(
            EnvCause::detect("error: toolchain '1.80.0-aarch64-apple-darwin' is not installed"),
            Some(EnvCause::RustupToolchainMissing("1.80.0-aarch64-apple-darwin".into()))
        );
        assert_eq!(
            EnvCause::detect("No version is set for command node\nConsider adding one of the following"),
            Some(EnvCause::NodeVersion("asdf".into()))
        );
        assert_eq!(
            EnvCause::detect("xcrun: error: invalid active developer path (/Library/Developer/CommandLineTools)"),
            Some(EnvCause::Xcode)
        );
        assert_eq!(EnvCause::detect("sh: pnpm: command not found"), Some(EnvCause::CommandMissing("pnpm".into())));
        assert_eq!(
            EnvCause::detect("env: node: No such file or directory"),
            Some(EnvCause::CommandMissing("node".into()))
        );
        assert_eq!(
            EnvCause::detect("Error: connect EPERM 127.0.0.1:5432 - Local (0.0.0.0:0)"),
            Some(EnvCause::Loopback(5432))
        );
        assert_eq!(EnvCause::detect("1 failed, 3 passed"), None);
        for c in [
            EnvCause::RustupDefault,
            EnvCause::RustupToolchainMissing("stable".into()),
            EnvCause::NodeVersion("fnm".into()),
            EnvCause::Xcode,
            EnvCause::CommandMissing("go".into()),
            EnvCause::Loopback(8080),
        ] {
            assert_eq!(EnvCause::from_code(&c.code()), Some(c.clone()));
            assert!(c.text(Lang::En).starts_with("Cause:"), "{c:?}");
            assert!(c.text(Lang::Zh).starts_with("原因："), "{c:?}");
        }
        assert!(EnvCause::RustupDefault.text(Lang::En).contains("cannot find rustup's default toolchain"));
    }

    #[test]
    fn loopback_refusals_are_recognised() {
        assert_eq!(loopback_refusal("dial tcp 127.0.0.1:6379: connect: operation not permitted"), Some(6379));
        assert_eq!(loopback_refusal("dial tcp [::1]:8080: connect: operation not permitted"), Some(8080));
        assert_eq!(loopback_refusal("curl: (7) Failed to connect to localhost port 3000"), None);
        assert_eq!(loopback_refusal("cat: x: Operation not permitted"), None);
    }
}
