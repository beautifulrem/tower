use rusqlite::{OptionalExtension, params};
use tower_core::Lang;
use tower_core::view::Settings;

use crate::{Result, Store};

const SETTINGS_KEY: &str = "settings";

impl Store {
    pub fn settings(&self) -> Result<Settings> {
        let raw: Option<String> = self
            .conn
            .query_row("SELECT value FROM settings WHERE key = ?1", [SETTINGS_KEY], |r| r.get(0))
            .optional()?;
        Ok(match raw {
            Some(json) => serde_json::from_str(&json)?,
            None => Settings::default(),
        })
    }

    /// The interface language, for text the store writes. English if the
    /// settings cannot be read.
    pub fn lang(&self) -> Lang {
        self.settings().map(|s| s.lang()).unwrap_or_default()
    }

    pub fn save_settings(&mut self, settings: &Settings) -> Result<()> {
        self.conn.execute(
            "INSERT INTO settings (key, value) VALUES (?1, ?2)
             ON CONFLICT(key) DO UPDATE SET value = excluded.value",
            params![SETTINGS_KEY, serde_json::to_string(settings)?],
        )?;
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use crate::test_support::store;

    #[test]
    fn settings_default_then_persist() {
        let (mut s, _) = store();
        let mut cfg = s.settings().unwrap();
        assert_eq!(cfg.max_concurrent, 3);
        cfg.max_concurrent = 5;
        s.save_settings(&cfg).unwrap();
        assert_eq!(s.settings().unwrap().max_concurrent, 5);
    }

    #[test]
    fn language_follows_the_setting() {
        let (mut s, _) = store();
        for (code, lang) in [("zh-CN", tower_core::Lang::Zh), ("en", tower_core::Lang::En)] {
            let mut cfg = s.settings().unwrap();
            cfg.language = code.into();
            s.save_settings(&cfg).unwrap();
            assert_eq!(s.lang(), lang);
        }
    }
}
