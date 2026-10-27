//! Step 6, perturbation (`verify::perturb`): the base's own test files, with
//! a probe before each assertion Tower can move, run on the base and then
//! on the snapshot. Records go to the drop box; no verdict changes.
//!
//! The base's run does not depend on the agent, so the preflight does it
//! while the agent works and keeps its records in the goal's directory
//! (Tower's, which the agent cannot write), for the same base commit and
//! the same commands; verification then runs only the snapshot's side.

use std::path::{Path, PathBuf};
use std::time::Duration;

use super::{Bench, Exec, Phase};
use crate::verify::names_held_out;
use crate::verify::perturb::{self, Recs, Report};
use crate::{Result, invalid};

/// The base's records, kept from the preflight.
#[derive(serde::Serialize, serde::Deserialize)]
struct BaseRecords {
    base: String,
    commands: Vec<String>,
    recs: Recs,
}

impl Bench<'_> {
    fn base_records_path(&self) -> PathBuf {
        self.inner.paths.goal_dir(self.goal).join("perturb-base.json")
    }

    /// The criteria that went from red on the base to green: the visible
    /// ones only (held-out runs never take part).
    fn red_visible<'c>(&self, criteria: &'c [Exec], red_on_base: &[String]) -> Vec<&'c Exec> {
        criteria
            .iter()
            .filter(|(c, command, _)| red_on_base.contains(&c.id) && !names_held_out(&self.holdout, command))
            .collect()
    }

    /// The base's test files holding an assertion Tower can probe, probed
    /// (one search of your repository, then the files themselves, at the
    /// base). With `stems`, only those loading a module the change touched.
    async fn probed_files(&self, stems: Option<&[String]>, report: &mut Report) -> Result<Vec<(String, String)>> {
        let git = self.inner.git.clone();
        let (root, base) = (self.rec.project_root.clone(), self.base.clone());
        let lines = tokio::task::spawn_blocking(move || git.grep_at(Path::new(&root), &base, "assert|expect\\("))
            .await
            .map_err(|e| invalid(e.to_string()))?
            .unwrap_or_default();
        let mut files: Vec<String> = Vec::new();
        for (path, line) in &lines {
            let test = tower_core::roles::role(path) == tower_core::roles::Role::Test;
            if test && !files.contains(path) && perturb::instrument(path, line, &self.drop).is_some() {
                files.push(path.clone());
            }
        }
        let mut probed = Vec::new();
        for f in files.iter().take(400) {
            if report.probes.len() >= perturb::MAX_PROBES {
                break;
            }
            let git = self.inner.git.clone();
            let (root, base, path) = (self.rec.project_root.clone(), self.base.clone(), f.clone());
            let text = tokio::task::spawn_blocking(move || git.file_at(Path::new(&root), &base, &path))
                .await
                .map_err(|e| invalid(e.to_string()))?;
            let Some(text) = text.filter(|t| stems.is_none_or(|s| perturb::loads_any(t, s))) else { continue };
            if let Some((out, probes)) = perturb::instrument(f, &text, &self.drop) {
                probed.push((f.clone(), out));
                report.probes.extend(probes);
            }
        }
        Ok(probed)
    }

    /// In the preflight, after the base phase: the base's run with every
    /// probe-able test file probed, kept for verification.
    pub(super) async fn perturbation_preflight(&self, red_on_base: &[String]) -> Result<()> {
        let criteria = self.criteria_list();
        let visible = self.red_visible(&criteria, red_on_base);
        let mut report = Report::default();
        if visible.is_empty() {
            return Ok(());
        }
        let probed = self.probed_files(None, &mut report).await?;
        if probed.is_empty() {
            return Ok(());
        }
        self.reset(&self.base).await?;
        let copied = self.local_files(false).await?;
        let recs = self.probe_run(&probed, &visible, Phase::Base).await?;
        self.remove(&copied);
        let kept = BaseRecords {
            base: self.base.clone(),
            commands: visible.iter().map(|(_, command, _)| command.clone()).collect(),
            recs,
        };
        std::fs::write(self.base_records_path(), serde_json::to_vec(&kept).map_err(|e| invalid(e.to_string()))?)?;
        Ok(())
    }

    /// Runs the criteria that went from red on the base to green on the
    /// snapshot once more on each side, with the probes in (the base's side
    /// from the preflight when it is still valid). `held_files` are taken
    /// out first: these runs may have the network.
    pub(super) async fn perturbation(
        &self,
        pin: &str,
        criteria: &[Exec],
        red_on_base: &[String],
        held_files: &[String],
        diff: &[tower_core::view::DiffFile],
    ) -> Result<Report> {
        let mut report = Report::default();
        let visible = self.red_visible(criteria, red_on_base);
        if visible.is_empty() {
            return Ok(report);
        }
        report.ran = true;
        // Only test files that load a module this change touched: the others
        // cannot show anything about it, and each probed run costs a run.
        let stems = perturb::changed_stems(diff);
        let probed = self.probed_files(Some(&stems), &mut report).await?;
        if probed.is_empty() {
            return Ok(report);
        }
        self.remove(held_files);
        let commands: Vec<String> = visible.iter().map(|(_, command, _)| command.clone()).collect();
        let kept = std::fs::read(self.base_records_path())
            .ok()
            .and_then(|b| serde_json::from_slice::<BaseRecords>(&b).ok())
            .filter(|k| k.base == self.base && k.commands == commands)
            .filter(|k| report.probes.iter().all(|p| k.recs.contains_key(&format!("{}.o", p.id))));
        let base = match kept {
            Some(k) => k.recs,
            None => {
                self.reset(&self.base).await?;
                let recs = self.probe_run(&probed, &visible, Phase::Base).await?;
                let git = self.inner.git.clone();
                let dir = self.dir.clone();
                let _ = tokio::task::spawn_blocking(move || git.clean_untracked(&dir)).await;
                recs
            }
        };
        // No probed assertion failed on the base: none is one this change
        // fixed, and the snapshot's side would say nothing. (This is the
        // last step; the checkout is thrown away after it.)
        let fixed_somewhere =
            report.probes.iter().any(|p| base.get(&format!("{}.o", p.id)).is_some_and(|r| r.out == perturb::Out::Fail));
        if !fixed_somewhere || self.cancel.is_cancelled() {
            return Ok(report);
        }
        self.reset(pin).await?;
        let snapshot = self.probe_run(&probed, &visible, Phase::Pin).await?;
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
