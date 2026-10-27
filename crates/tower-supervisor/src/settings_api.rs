//! Settings, the phone page, pushes and your git identity.

use std::sync::PoisonError;

use tower_core::view::{RemoteInfo, Settings};
use tower_core::{Lang, tr};

use crate::api::UiUpdate;
use crate::{Result, Supervisor, inner, invalid, remote, run};

impl Supervisor {
    pub fn settings(&self) -> Settings {
        self.inner.settings()
    }

    /// The interface language from the settings.
    pub fn lang(&self) -> Lang {
        self.inner.lang()
    }

    /// Saves settings. A language change applies to everything created from
    /// now on and to everything derived on read; the shell rebuilds its menu.
    pub fn save_settings(&self, settings: Settings) -> Result<()> {
        // Errors speak the language being chosen, so switching reads right.
        let lang = settings.lang();
        if settings.max_concurrent == 0 || settings.max_concurrent > 10 {
            return Err(invalid(tr!(lang, "并发上限必须在 1 到 10 之间", "Concurrent goals must be between 1 and 10")));
        }
        for ext in self.inner.extensions(&settings).iter().skip(1) {
            if !ext.is_file() {
                let path = ext.display();
                return Err(invalid(tr!(lang, "找不到扩展文件：{path}", "Extension file not found: {path}")));
            }
        }
        let before = self.inner.settings();
        let mut settings = settings;
        if settings.remote_enabled && settings.remote_token.is_empty() {
            settings.remote_token = remote::new_token();
        }
        self.inner.store(|s| s.save_settings(&settings))?;
        *self.inner.models.lock().unwrap_or_else(PoisonError::into_inner) = None;
        let remote_changed =
            (before.remote_enabled, before.remote_port, &before.remote_token, before.remote_local_network)
                != (
                    settings.remote_enabled,
                    settings.remote_port,
                    &settings.remote_token,
                    settings.remote_local_network,
                );
        if remote_changed {
            // Saved either way; Settings shows why the page is not served.
            let _ = self.apply_remote();
        }
        // Read-time text (card titles and Tower's own choices, goal labels)
        // is re-sent so open screens switch language without a reload.
        if before.lang() != lang {
            self.inner.emit_inbox();
            if let Ok(goals) = self.inner.store(|s| s.summaries()) {
                for goal in goals {
                    self.inner.sink.emit(UiUpdate::Goal { goal });
                }
            }
        }
        let inner = self.inner.clone();
        tokio::spawn(async move { run::schedule(&inner).await });
        Ok(())
    }

    /// Starts or stops the phone page according to the settings. When it
    /// cannot start, the reason is kept for Settings (and returned).
    pub(crate) fn apply_remote(&self) -> Result<()> {
        let s = self.inner.settings();
        let lang = self.inner.lang();
        if !s.remote_enabled {
            self.inner.remote.stop();
            self.inner.remote.set_problem(None);
            return Ok(());
        }
        let Some(host) = remote::listen_host(&self.inner.env, s.remote_local_network) else {
            self.inner.remote.stop();
            let problem = tr!(
                lang,
                "Tailscale 没有连接，手机页面没有开启。打开 Tailscale，或在下面允许本地网络（令牌会以明文经过局域网）。",
                "Tailscale is not connected, so the phone page is off. Open Tailscale, or allow the local network below (the token then crosses it unencrypted)."
            );
            self.inner.remote.set_problem(Some(problem.clone()));
            return Err(invalid(problem));
        };
        if self.inner.remote.host().as_deref() == Some(host.as_str()) && !self.remote_settings_changed(&s) {
            return Ok(());
        }
        self.inner.remote.start(&self.inner, &host, s.remote_port, s.remote_token.clone()).map_err(|e| {
            let problem = tr!(
                lang,
                "无法在端口 {port} 上提供手机页面：{e}",
                "Could not serve the phone page on port {port}: {e}",
                port = s.remote_port
            );
            self.inner.remote.set_problem(Some(problem.clone()));
            invalid(problem)
        })?;
        *self.inner.remote_applied.lock().unwrap_or_else(PoisonError::into_inner) =
            Some((s.remote_port, s.remote_token.clone()));
        Ok(())
    }

    fn remote_settings_changed(&self, s: &Settings) -> bool {
        self.inner.remote_applied.lock().unwrap_or_else(PoisonError::into_inner).as_ref()
            != Some(&(s.remote_port, s.remote_token.clone()))
    }

    /// How to open the phone page on this network.
    pub fn remote_info(&self) -> RemoteInfo {
        let s = self.inner.settings();
        if !s.remote_enabled {
            return RemoteInfo {
                enabled: false,
                links: Vec::new(),
                qr_svg: String::new(),
                tailscale: false,
                kinds: Vec::new(),
                problem: None,
            };
        }
        let problem = self.inner.remote.problem();
        let tailscale_ip = remote::tailscale_ip(&self.inner.env);
        // Only addresses it actually listens on, and that work now.
        let addrs: Vec<String> = match self.inner.remote.host() {
            None => Vec::new(),
            Some(h) if h == "0.0.0.0" => remote::addresses(&self.inner.env),
            Some(h) => vec![h],
        };
        let is_ts = |a: &str| tailscale_ip.as_deref() == Some(a);
        let tailscale = addrs.first().is_some_and(|a| is_ts(a));
        let links: Vec<String> =
            addrs.iter().map(|a| format!("http://{a}:{}/#{}", s.remote_port, s.remote_token)).collect();
        let kinds = addrs.iter().map(|a| if is_ts(a) { "tailscale" } else { "lan" }.to_string()).collect();
        let qr_svg = links.first().map(|l| remote::qr_svg(l)).unwrap_or_default();
        RemoteInfo { enabled: true, links, qr_svg, tailscale, kinds, problem }
    }

    /// Sets your git name and email (global configuration), at your request
    /// from the environment check, so accepted work is committed as you.
    /// With `project`, only that project's repository gets it (a work
    /// identity for a work repository); without, git's global configuration.
    pub fn set_git_identity(&self, name: &str, email: &str, project: Option<&str>) -> Result<()> {
        let lang = self.inner.lang();
        let (name, email) = (name.trim(), email.trim());
        if name.is_empty() || name.contains(['\n', '\r']) {
            return Err(invalid(tr!(lang, "写下你的名字", "Enter your name")));
        }
        if !email.contains('@') || email.contains(char::is_whitespace) {
            return Err(invalid(tr!(lang, "写下有效的邮箱", "Enter a valid email address")));
        }
        match project {
            Some(id) => {
                let root = self.inner.store(|s| s.project(id))?.root;
                self.inner.git.set_repo_identity(std::path::Path::new(&root), name, email)?;
            }
            None => self.inner.git.set_global_identity(name, email)?,
        }
        Ok(())
    }

    /// Sends a test push to the configured address and says how it went.
    pub async fn test_push(&self) -> Result<()> {
        let s = self.inner.settings();
        let lang = s.lang();
        let url = s.push_url.trim().to_string();
        if url.is_empty() {
            return Err(invalid(tr!(lang, "先填写推送地址", "Enter a push address first")));
        }
        let title = "Tower".to_string();
        let body = tr!(lang, "测试推送：能看到这条就说明推送可用", "Test push: if you can read this, pushes work");
        let result = tokio::task::spawn_blocking(move || inner::send_push(&url, &title, &body, None, lang))
            .await
            .map_err(|e| invalid(e.to_string()))?;
        *self.inner.push_status.lock().unwrap_or_else(PoisonError::into_inner) =
            Some(tower_core::view::PushStatus { at: tower_store::system_now(), error: result.clone().err() });
        result.map_err(invalid)
    }

    /// The outcome of the last push, if one was sent since Tower started.
    pub fn push_status(&self) -> Option<tower_core::view::PushStatus> {
        self.inner.push_status.lock().unwrap_or_else(PoisonError::into_inner).clone()
    }

    /// A new pairing secret: phones paired before must pair again.
    pub fn reset_remote_token(&self) -> Result<()> {
        let s = self.inner.settings();
        self.save_settings(Settings { remote_token: remote::new_token(), ..s })
    }
}
