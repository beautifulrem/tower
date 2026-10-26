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

impl Store {
    /// Per-goal state the interface keeps (viewed files, draft comments, the
    /// last reviewed snapshot), so it lives with the rest of the goal and not
    /// in the web view's storage.
    pub fn ui_state(&self, goal: &str) -> Result<std::collections::BTreeMap<String, String>> {
        let mut stmt = self.conn.prepare("SELECT key, value FROM goal_ui_state WHERE goal_id = ?1")?;
        let rows = stmt.query_map([goal], |r| Ok((r.get::<_, String>(0)?, r.get::<_, String>(1)?)))?;
        Ok(rows.collect::<rusqlite::Result<_>>()?)
    }

    /// Sets (or with `None`, removes) one key of a goal's interface state.
    pub fn set_ui_state(&mut self, goal: &str, key: &str, value: Option<&str>) -> Result<()> {
        match value {
            Some(v) => self.conn.execute(
                "INSERT OR REPLACE INTO goal_ui_state (goal_id, key, value) VALUES (?1, ?2, ?3)",
                params![goal, key, v],
            )?,
            None => {
                self.conn.execute("DELETE FROM goal_ui_state WHERE goal_id = ?1 AND key = ?2", params![goal, key])?
            }
        };
        Ok(())
    }
}

#[cfg(test)]
mod ui_state_tests {
    use crate::Store;

    #[test]
    fn ui_state_is_per_goal() {
        let mut s = Store::open_in_memory().unwrap();
        s.set_ui_state("G-0001", "viewed", Some("{\"a\":\"1\"}")).unwrap();
        s.set_ui_state("G-0002", "viewed", Some("{}")).unwrap();
        assert_eq!(s.ui_state("G-0001").unwrap().get("viewed").unwrap(), "{\"a\":\"1\"}");
        s.set_ui_state("G-0001", "viewed", None).unwrap();
        assert!(s.ui_state("G-0001").unwrap().is_empty());
        assert_eq!(s.ui_state("G-0002").unwrap().len(), 1);
    }
}
