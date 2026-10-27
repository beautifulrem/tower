//! `look` screenshots on the workbench's current checkout.

use std::time::Duration;

use tower_core::EventKind;
use tower_core::contract::CriterionKind;

use super::Bench;
use crate::Result;

impl Bench<'_> {
    /// Screenshots for `look` criteria on the current checkout; the
    /// environment problem that keeps them from being evidence, if any.
    pub(super) async fn capture_looks(&self, ids: &[String], side: &str, rev: &str) -> Result<Option<String>> {
        for c in self.rec.contract.criteria.iter().filter(|c| ids.contains(&c.id)) {
            let CriterionKind::Look { start, url, timeout_secs, steps } = &c.kind else { continue };
            let short: String = rev.chars().take(10).collect();
            let out =
                self.inner.paths.root.join("evidence").join(self.goal).join(format!("{}-{side}-{short}.png", c.id));
            let r = crate::look::capture(
                &c.id,
                &self.inner.paths.root,
                &self.dir,
                &self.env,
                self.criteria.as_deref(),
                start,
                url,
                Duration::from_secs((*timeout_secs).max(5) as u64),
                self.rec.contract.network,
                steps.as_deref().unwrap_or_default(),
                &out,
            )
            .await;
            let (file, error, env) = match r {
                Ok(p) => (Some(p.display().to_string()), None, None),
                Err(crate::look::LookError::Shot(e)) => (None, Some(e), None),
                Err(crate::look::LookError::Environment(note)) => {
                    let lang = self.inner.lang();
                    (None, Some(tower_core::i18n::PauseNote::render(&note, lang)), Some(note))
                }
            };
            self.inner.append(
                self.goal,
                EventKind::LookCaptured { criterion: c.id.clone(), side: side.into(), pin: rev.into(), file, error },
            )?;
            if env.is_some() {
                return Ok(env);
            }
        }
        Ok(None)
    }
}
