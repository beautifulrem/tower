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
            let opts = crate::look::LookOptions {
                desktop: Some(crate::look::Viewport::DESKTOP),
                mobile_out: Some(crate::look::mobile_path_for(&out)),
                mobile_viewport: Some(crate::look::Viewport::MOBILE),
            };
            let r = crate::look::capture_evidence(
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
                &opts,
            )
            .await;
            let (file, error, env, console_errors, mobile_file) = match r {
                Ok(res) => (
                    Some(res.screenshot.display().to_string()),
                    None,
                    None,
                    res.console_errors,
                    res.mobile_screenshot.map(|p| p.display().to_string()),
                ),
                Err(crate::look::LookError::Shot(e)) => (None, Some(e), None, Vec::new(), None),
                Err(crate::look::LookError::Environment(note)) => {
                    let lang = self.inner.lang();
                    (None, Some(tower_core::i18n::PauseNote::render(&note, lang)), Some(note), Vec::new(), None)
                }
            };
            self.inner.append(
                self.goal,
                EventKind::LookCaptured { criterion: c.id.clone(), side: side.into(), pin: rev.into(), file, error },
            )?;
            if !console_errors.is_empty() || mobile_file.is_some() {
                self.inner.append(
                    self.goal,
                    EventKind::LookEvidence {
                        criterion: c.id.clone(),
                        side: side.into(),
                        pin: rev.into(),
                        console_errors,
                        mobile_file,
                    },
                )?;
            }
            if env.is_some() {
                return Ok(env);
            }
        }
        Ok(None)
    }
}
