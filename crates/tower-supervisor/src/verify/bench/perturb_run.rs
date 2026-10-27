//! Step 6, perturbation (`verify::perturb`): the base's own test files, with a
//! probe before each assertion Tower can move, run on the base and then on
//! the snapshot. Records go to the drop box; no verdict changes.

use std::path::Path;
use std::time::Duration;

use super::{Bench, Exec, Phase};
use crate::verify::names_held_out;
use crate::verify::perturb::{self, Report};
use crate::{Result, invalid};

impl Bench<'_> {
    /// Runs the criteria that went from red on the base to green on the
    /// snapshot once more on each side, with the probes in. `held_files`
    /// are taken out first: these runs may have the network.
    pub(super) async fn perturbation(
        &self,
        pin: &str,
        criteria: &[Exec],
        red_on_base: &[String],
        held_files: &[String],
        diff: &[tower_core::view::DiffFile],
    ) -> Result<Report> {
        let mut report = Report::default();
        let visible: Vec<&Exec> = criteria
            .iter()
            .filter(|(c, command, _)| red_on_base.contains(&c.id) && !names_held_out(&self.holdout, command))
            .collect();
        if visible.is_empty() {
            return Ok(report);
        }
        report.ran = true;
        // Which of the base's test files hold an assertion Tower can probe
        // (one search of your repository): none, and the checkout is never
        // touched.
        let git = self.inner.git.clone();
        let (root, base) = (self.rec.project_root.clone(), self.base.clone());
        let lines = tokio::task::spawn_blocking(move || git.grep_at(Path::new(&root), &base, "assert|expect\\("))
            .await
            .map_err(|e| invalid(e.to_string()))?
            .unwrap_or_default();
        let mut files: Vec<String> = Vec::new();
        for (path, line) in &lines {
            let test = tower_core::roles::role(path) == tower_core::roles::Role::Test;
            if test && !files.contains(path) && perturb::instrument(path, line, &self.drop, "x", 0).is_some() {
                files.push(path.clone());
            }
        }
        // Only test files that load a module this change touched: the others
        // cannot show anything about it, and each probed run costs a run.
        let stems = perturb::changed_stems(diff);
        let run = &uuid::Uuid::new_v4().simple().to_string()[..12];
        let mut probed: Vec<(String, String)> = Vec::new();
        for f in files.iter().take(400) {
            if report.probes.len() >= perturb::MAX_PROBES {
                break;
            }
            let git = self.inner.git.clone();
            let (root, base, path) = (self.rec.project_root.clone(), self.base.clone(), f.clone());
            let text = tokio::task::spawn_blocking(move || git.file_at(Path::new(&root), &base, &path))
                .await
                .map_err(|e| invalid(e.to_string()))?;
            let Some(text) = text.filter(|t| perturb::loads_any(t, &stems)) else { continue };
            if let Some((out, probes)) = perturb::instrument(f, &text, &self.drop, run, report.probes.len()) {
                probed.push((f.clone(), out));
                report.probes.extend(probes);
            }
        }
        if probed.is_empty() {
            return Ok(report);
        }
        self.remove(held_files);
        self.reset(&self.base).await?;
        let base = self.probe_run(&probed, &visible, Phase::Base).await?;
        let fixed_somewhere =
            report.probes.iter().any(|p| base.get(&format!("{}.o", p.id)).is_some_and(|r| r.out == perturb::Out::Fail));
        self.reset(pin).await?;
        if !fixed_somewhere || self.cancel.is_cancelled() {
            return Ok(report);
        }
        let git = self.inner.git.clone();
        let dir = self.dir.clone();
        let _ = tokio::task::spawn_blocking(move || git.clean_untracked(&dir)).await;
        let snapshot = self.probe_run(&probed, &visible, Phase::Pin).await?;
        self.reset(pin).await?;
        report.findings = report
            .probes
            .iter()
            .enumerate()
            .filter_map(|(i, p)| perturb::judge(p, &base, &snapshot).map(|f| (i, f)))
            .collect();
        Ok(report)
    }

    /// Writes the probed files over the checkout's and runs `criteria`;
    /// the records they left. `phase` is the side the code is from, so the
    /// assertion-identity guard reports it with that side's runs.
    async fn probe_run(&self, probed: &[(String, String)], criteria: &[&Exec], phase: Phase) -> Result<perturb::Recs> {
        for (f, text) in probed {
            tower_git::write_inside(&self.dir, f, text.as_bytes())?;
        }
        super::held_out::clear(&self.drop);
        for (_, command, timeout) in criteria {
            if self.cancel.is_cancelled() {
                break;
            }
            let timeout = Duration::from_secs((*timeout).max(1) as u64);
            let _ = self.exec_in(command, self.criteria.as_deref(), timeout, Some(phase)).await;
        }
        let recs = perturb::read_records(&self.drop);
        super::held_out::clear(&self.drop);
        Ok(recs)
    }
}
