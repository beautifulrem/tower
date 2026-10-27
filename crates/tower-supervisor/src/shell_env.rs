//! The environment Tower hands to child processes (`docs/05` §5.3.6).
//!
//! A desktop app launched from Finder does not inherit the user's shell
//! setup, so Tower reads the login shell's environment once and passes an
//! explicit, closed list onward. Nothing else is inherited.

use std::collections::BTreeMap;
use std::process::Command;
use std::time::Duration;

/// Variables passed to the engine. Provider credentials are included so Pi
/// can authenticate; the tower-goal extension strips them again before the
/// agent's shell sees them.
const PASS: &[&str] = &[
    "PATH",
    "HOME",
    "USER",
    "LOGNAME",
    "SHELL",
    "LANG",
    "TMPDIR",
    "TZ",
    "JAVA_HOME",
    "GOPATH",
    "NVM_DIR",
    "PNPM_HOME",
    "CARGO_HOME",
    "RUSTUP_HOME",
    "VOLTA_HOME",
    // Version managers and toolchain choice, so the sandbox resolves
    // toolchains as your terminal does (see sandbox::toolchains).
    "FNM_DIR",
    "ASDF_DIR",
    "ASDF_DATA_DIR",
    "MISE_DATA_DIR",
    "PYENV_ROOT",
    "RBENV_ROOT",
    "NODENV_ROOT",
    "N_PREFIX",
    "SDKMAN_DIR",
    "GOROOT",
    "RUSTUP_TOOLCHAIN",
    "DEVELOPER_DIR",
    "HTTP_PROXY",
    "HTTPS_PROXY",
    "NO_PROXY",
    "http_proxy",
    "https_proxy",
    "no_proxy",
    "NODE_EXTRA_CA_CERTS",
    "SSL_CERT_FILE",
];

fn passes(name: &str) -> bool {
    PASS.contains(&name)
        || name.starts_with("LC_")
        || name.starts_with("PI_")
        || name.ends_with("_API_KEY")
        || name.ends_with("_BASE_URL")
        || name.starts_with("AWS_")
        || name.starts_with("GOOGLE_")
        || name.starts_with("AZURE_")
}

#[derive(Debug, Clone, Default)]
pub struct ShellEnv {
    vars: BTreeMap<String, String>,
}

impl ShellEnv {
    /// Reads the environment your terminal has: an interactive login
    /// shell's, as a new terminal window starts one (version managers such
    /// as nvm, fnm and mise are often set up in the interactive startup
    /// files only). Falls back to a non-interactive login shell, then to
    /// this process's environment, if a shell does not finish in time.
    pub fn capture() -> Self {
        let shell = std::env::var("SHELL").unwrap_or_else(|_| "/bin/zsh".into());
        let from_shell = run_with_timeout(&shell, &["-l", "-i", "-c"], Duration::from_secs(8))
            .or_else(|| run_with_timeout(&shell, &["-l", "-c"], Duration::from_secs(5)));
        let raw: Vec<(String, String)> = match from_shell {
            Some(out) => parse_null_separated(&out),
            None => std::env::vars().collect(),
        };
        Self::from_pairs(raw)
    }

    pub fn from_pairs(raw: impl IntoIterator<Item = (String, String)>) -> Self {
        let mut vars: BTreeMap<String, String> = raw.into_iter().filter(|(k, _)| passes(k)).collect();
        // Make sure common tool locations are reachable even with a thin PATH.
        let path = vars.entry("PATH".into()).or_default();
        for extra in ["/opt/homebrew/bin", "/usr/local/bin", "/usr/bin", "/bin", "/usr/sbin", "/sbin"] {
            if !path.split(':').any(|p| p == extra) {
                if !path.is_empty() {
                    path.push(':');
                }
                path.push_str(extra);
            }
        }
        Self { vars }
    }

    pub fn get(&self, k: &str) -> Option<&str> {
        self.vars.get(k).map(String::as_str)
    }

    pub fn pairs(&self) -> Vec<(String, String)> {
        self.vars.iter().map(|(k, v)| (k.clone(), v.clone())).collect()
    }

    /// The same environment without credentials, for verifier commands.
    pub fn without_credentials(&self) -> Vec<(String, String)> {
        self.vars
            .iter()
            .filter(|(k, _)| {
                !(k.ends_with("_API_KEY")
                    || k.starts_with("AWS_")
                    || k.starts_with("GOOGLE_")
                    || k.starts_with("AZURE_"))
            })
            .map(|(k, v)| (k.clone(), v.clone()))
            .collect()
    }

    /// Finds an executable on this environment's PATH.
    pub fn which(&self, program: &str) -> Option<std::path::PathBuf> {
        if program.contains('/') {
            let p = std::path::PathBuf::from(program);
            return p.is_file().then_some(p);
        }
        self.get("PATH")?.split(':').map(|d| std::path::Path::new(d).join(program)).find(|p| p.is_file())
    }
}

/// Printed before the environment, so whatever the startup files print (a
/// greeting, a prompt's escape codes) is told apart from it.
const BEGIN: &str = "__TOWER_ENV_BEGIN__";

fn run_with_timeout(shell: &str, flags: &[&str], timeout: Duration) -> Option<Vec<u8>> {
    let mut child = Command::new(shell)
        .args(flags)
        .arg(format!("printf '\\0{BEGIN}\\0'; env -0"))
        .stdin(std::process::Stdio::null())
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::null())
        .spawn()
        .ok()?;
    let start = std::time::Instant::now();
    loop {
        match child.try_wait() {
            Ok(Some(_)) => break,
            Ok(None) if start.elapsed() < timeout => std::thread::sleep(Duration::from_millis(20)),
            _ => {
                let _ = child.kill();
                return None;
            }
        }
    }
    let out = child.wait_with_output().ok()?;
    if !out.status.success() {
        return None;
    }
    let marker = format!("\0{BEGIN}\0");
    let at = out.stdout.windows(marker.len()).position(|w| w == marker.as_bytes())?;
    Some(out.stdout[at + marker.len()..].to_vec())
}

fn parse_null_separated(bytes: &[u8]) -> Vec<(String, String)> {
    String::from_utf8_lossy(bytes)
        .split('\0')
        .filter_map(|kv| kv.split_once('=').map(|(k, v)| (k.to_string(), v.to_string())))
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn only_listed_variables_pass() {
        let env = ShellEnv::from_pairs([
            ("PATH".into(), "/x".into()),
            ("OPENAI_API_KEY".into(), "sk".into()),
            ("SECRET_THING".into(), "s".into()),
            ("EDITOR".into(), "vim".into()),
        ]);
        assert!(env.get("OPENAI_API_KEY").is_some());
        assert!(env.get("SECRET_THING").is_none());
        assert!(env.get("EDITOR").is_none());
        assert!(env.get("PATH").unwrap().starts_with("/x:"));
        assert!(!env.without_credentials().iter().any(|(k, _)| k == "OPENAI_API_KEY"));
    }

    /// The environment is read from after the marker, whatever the shell's
    /// startup files printed first.
    #[test]
    fn the_shell_environment_is_read_after_its_startup_output() {
        let out = run_with_timeout("/bin/sh", &["-c", "echo hello;"], Duration::from_secs(5));
        // `sh -c 'echo hello;' 'printf …'`: the script is the first word only.
        assert!(out.is_none(), "no marker, no environment");
        let out = run_with_timeout("/bin/sh", &["-c"], Duration::from_secs(5)).expect("sh runs");
        let vars = parse_null_separated(&out);
        assert!(vars.iter().any(|(k, _)| k == "PATH"), "{vars:?}");
        assert!(!vars.iter().any(|(k, v)| k.contains(BEGIN) || v.contains(BEGIN)));
    }

    #[test]
    fn parses_env_dash_zero() {
        let v = parse_null_separated(b"A=1\0B=x=y\0");
        assert_eq!(v, vec![("A".into(), "1".into()), ("B".into(), "x=y".into())]);
    }
}
