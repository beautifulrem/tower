//! Explicit user-confirmed update check & install via `tauri-plugin-updater` (`docs/18` P0.3).
//!
//! Safety invariant: Tower NEVER downloads or installs updates silently.
//! - Dev / unsigned builds without a configured signing public key stay 100%
//!   functional and report `configured: false`.
//! - Signed release builds inject `TOWER_UPDATER_PUBKEY` at compile time so
//!   `check_for_updates` checks `latest.json` on explicit user request and
//!   `install_update` installs & restarts ONLY when the user explicitly clicks install.

use tauri::AppHandle;
use tauri_plugin_updater::UpdaterExt;
use tower_core::view::UpdateCheckResult;
use tower_supervisor::Error;

/// Default GitHub Releases updater manifest endpoint.
pub const DEFAULT_ENDPOINT: &str = "https://github.com/beautifulrem/tower/releases/latest/download/latest.json";

/// Compile-time Ed25519 public key injected by `.github/workflows/release.yml`
/// when signing updater artifacts. Empty in local/dev builds.
pub fn configured_pubkey() -> Option<&'static str> {
    option_env!("TOWER_UPDATER_PUBKEY").map(str::trim).filter(|s| !s.is_empty())
}

/// Registers `tauri-plugin-updater` when a signing public key is configured.
pub fn init_plugin() -> tauri::plugin::TauriPlugin<tauri::Wry, tauri_plugin_updater::Config> {
    let mut builder = tauri_plugin_updater::Builder::new();
    if let Some(key) = configured_pubkey() {
        builder = builder.pubkey(key);
    }
    builder.build()
}

/// Checks for an available signed release without downloading or applying anything.
#[tauri::command]
pub async fn check_for_updates(app: AppHandle) -> UpdateCheckResult {
    let current_version = env!("CARGO_PKG_VERSION").to_string();
    let Some(pubkey) = configured_pubkey() else {
        return UpdateCheckResult {
            configured: false,
            available: false,
            current_version,
            latest_version: None,
            notes: None,
            error: None,
        };
    };
    let endpoint = match tauri::Url::parse(DEFAULT_ENDPOINT) {
        Ok(u) => u,
        Err(e) => {
            return UpdateCheckResult {
                configured: true,
                available: false,
                current_version,
                latest_version: None,
                notes: None,
                error: Some(e.to_string()),
            };
        }
    };
    let updater = match app.updater_builder().pubkey(pubkey).endpoints(vec![endpoint]).and_then(|b| b.build()) {
        Ok(u) => u,
        Err(e) => {
            return UpdateCheckResult {
                configured: true,
                available: false,
                current_version,
                latest_version: None,
                notes: None,
                error: Some(e.to_string()),
            };
        }
    };
    match updater.check().await {
        Ok(Some(update)) => UpdateCheckResult {
            configured: true,
            available: true,
            current_version,
            latest_version: Some(update.version),
            notes: update.body,
            error: None,
        },
        Ok(None) => UpdateCheckResult {
            configured: true,
            available: false,
            current_version,
            latest_version: None,
            notes: None,
            error: None,
        },
        Err(e) => UpdateCheckResult {
            configured: true,
            available: false,
            current_version,
            latest_version: None,
            notes: None,
            error: Some(e.to_string()),
        },
    }
}

/// Downloads, verifies the Ed25519 signature of, and installs a pending update,
/// then restarts Tower. Invoked ONLY on explicit user confirmation.
#[tauri::command]
pub async fn install_update(app: AppHandle) -> Result<(), Error> {
    let Some(pubkey) = configured_pubkey() else {
        return Err(Error::Invalid("Updater signing key is not configured in this build".into()));
    };
    let endpoint = tauri::Url::parse(DEFAULT_ENDPOINT).map_err(|e| Error::Invalid(e.to_string()))?;
    let updater = app
        .updater_builder()
        .pubkey(pubkey)
        .endpoints(vec![endpoint])
        .and_then(|b| b.build())
        .map_err(|e| Error::Invalid(e.to_string()))?;
    let update = updater
        .check()
        .await
        .map_err(|e| Error::Invalid(e.to_string()))?
        .ok_or_else(|| Error::Invalid("No update available".into()))?;
    update.download_and_install(|_, _| {}, || {}).await.map_err(|e| Error::Invalid(e.to_string()))?;
    app.restart();
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn default_dev_build_has_no_pubkey_and_valid_endpoint() {
        assert!(tauri::Url::parse(DEFAULT_ENDPOINT).is_ok());
        // Dev builds never fail startup when TOWER_UPDATER_PUBKEY is unset.
        if option_env!("TOWER_UPDATER_PUBKEY").unwrap_or("").trim().is_empty() {
            assert!(configured_pubkey().is_none());
        }
    }
}
