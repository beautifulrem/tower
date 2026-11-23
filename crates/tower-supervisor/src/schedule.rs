//! Scheduled / overnight goals with lightweight 5-field cron matching and
//! `pi-durable`-inspired idempotent checkpoints (`docs/18` P2.2).
//!
//! Safety invariant: unattended scheduled goals run with `unattended_strict = true`,
//! enforcing `Autonomy::Cautious` so every one-way door or risky command hard-pauses
//! to Needs-You and is never auto-executed or silently replayed on crash/restart.

use std::sync::Arc;
use std::time::Duration;

use tower_core::contract::Autonomy;
use tower_core::view::{GoalSummary, ScheduledGoal};
use tower_core::{Lang, Millis, tr};
use tower_store::NewScheduledGoal;

use crate::api::{NewGoalInput, NewScheduledGoalInput};
use crate::{Inner, Result, Supervisor, invalid};

/// Parsed standard 5-field cron expression (`minute hour dom month dow`, UTC).
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct CronSchedule {
    minutes: [bool; 60],
    hours: [bool; 24],
    doms: [bool; 32],   // 1..=31
    months: [bool; 13], // 1..=12
    dows: [bool; 7],    // 0..=6 (0 = Sunday)
    dom_wild: bool,
    dow_wild: bool,
}

impl CronSchedule {
    pub fn parse(expr: &str) -> std::result::Result<Self, String> {
        let fields: Vec<&str> = expr.split_whitespace().collect();
        if fields.len() != 5 {
            return Err("cron expression must have exactly 5 fields: min hour dom month dow".into());
        }
        let minutes = parse_field::<60>(fields[0], 0, 59, false)?;
        let hours = parse_field::<24>(fields[1], 0, 23, false)?;
        let doms = parse_field::<32>(fields[2], 1, 31, false)?;
        let months = parse_field::<13>(fields[3], 1, 12, false)?;
        let dows = parse_field::<7>(fields[4], 0, 7, true)?;
        Ok(Self { minutes, hours, doms, months, dows, dom_wild: fields[2] == "*", dow_wild: fields[4] == "*" })
    }

    /// Whether a UTC Unix timestamp (in whole minutes since epoch) matches.
    pub fn matches_minute(&self, unix_minute: i64) -> bool {
        let dt = utc_from_unix_minute(unix_minute);
        if !self.minutes[dt.minute as usize] || !self.hours[dt.hour as usize] || !self.months[dt.month as usize] {
            return false;
        }
        let dom_ok = self.doms[dt.day as usize];
        let dow_ok = self.dows[dt.dow as usize];
        match (self.dom_wild, self.dow_wild) {
            (true, true) => true,
            (true, false) => dow_ok,
            (false, true) => dom_ok,
            // Standard POSIX cron: if both dom and dow are restricted, either match triggers.
            (false, false) => dom_ok || dow_ok,
        }
    }

    /// Next matching timestamp strictly after `after_ms`, searching up to 366 days ahead.
    pub fn next_after(&self, after_ms: Millis) -> Option<Millis> {
        let start_min = after_ms.div_euclid(60_000) + 1;
        let max_scan = 366 * 24 * 60;
        for offset in 0..max_scan {
            let m = start_min + offset;
            if self.matches_minute(m) {
                return Some(m * 60_000);
            }
        }
        None
    }
}

fn parse_field<const N: usize>(
    raw: &str,
    min: usize,
    max: usize,
    wrap_seven_to_zero: bool,
) -> std::result::Result<[bool; N], String> {
    let mut table = [false; N];
    for part in raw.split(',') {
        let part = part.trim();
        if part.is_empty() {
            return Err(format!("empty cron segment in `{raw}`"));
        }
        let (range_part, step) = match part.split_once('/') {
            Some((r, s)) => {
                let step = s.parse::<usize>().map_err(|_| format!("invalid step `{s}`"))?;
                if step == 0 {
                    return Err("cron step cannot be 0".into());
                }
                (r, step)
            }
            None => (part, 1),
        };
        let (start, end) = if range_part == "*" {
            (min, if wrap_seven_to_zero { 6 } else { max })
        } else if let Some((a, b)) = range_part.split_once('-') {
            let a = a.parse::<usize>().map_err(|_| format!("invalid cron bound `{a}`"))?;
            let b = b.parse::<usize>().map_err(|_| format!("invalid cron bound `{b}`"))?;
            if a < min || b > max || a > b {
                return Err(format!("cron range `{range_part}` out of {min}..={max}"));
            }
            (a, b)
        } else {
            let v = range_part.parse::<usize>().map_err(|_| format!("invalid cron value `{range_part}`"))?;
            if v < min || v > max {
                return Err(format!("cron value `{v}` out of {min}..={max}"));
            }
            (v, v)
        };
        let mut cur = start;
        while cur <= end {
            let idx = if wrap_seven_to_zero && cur == 7 { 0 } else { cur };
            if idx < N {
                table[idx] = true;
            }
            cur += step;
        }
    }
    if !table.iter().any(|&b| b) {
        return Err(format!("cron field `{raw}` matches nothing"));
    }
    Ok(table)
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
struct UtcMinute {
    month: u32,
    day: u32,
    hour: u32,
    minute: u32,
    dow: u32, // 0 = Sun .. 6 = Sat
}

/// Howard Hinnant's civil-from-days algorithm: zero dependencies, exact proleptic Gregorian UTC.
fn utc_from_unix_minute(unix_minute: i64) -> UtcMinute {
    let days = unix_minute.div_euclid(1440);
    let min_of_day = unix_minute.rem_euclid(1440) as u32;
    let hour = min_of_day / 60;
    let minute = min_of_day % 60;
    // 1970-01-01 was Thursday (4).
    let dow = (days + 4).rem_euclid(7) as u32;

    let z = days + 719_468;
    let era = if z >= 0 { z } else { z - 146_096 } / 146_097;
    let doe = (z - era * 146_097) as u32; // [0, 146096]
    let yoe = (doe - doe / 1460 + doe / 36524 - doe / 146_096) / 365;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let day = doy - (153 * mp + 2) / 5 + 1;
    let month = if mp < 10 { mp + 3 } else { mp - 9 };
    UtcMinute { month, day, hour, minute, dow }
}

/// Spawns the background scheduler loop (checks due schedules every 30s).
pub(crate) fn spawn_scheduler(inner: Arc<Inner>) {
    let weak = Arc::downgrade(&inner);
    tokio::spawn(async move {
        let mut tick = tokio::time::interval(Duration::from_secs(30));
        tick.tick().await;
        loop {
            tick.tick().await;
            let Some(inner) = weak.upgrade() else { break };
            if let Err(e) = poll_due_schedules(&inner).await {
                tracing::warn!(error = %e, "scheduled goal poll failed");
            }
        }
    });
}

async fn poll_due_schedules(inner: &Arc<Inner>) -> Result<()> {
    let now = tower_store::system_now();
    let schedules = inner.read_store(|s| s.scheduled_goals())?;
    let sup = Supervisor { inner: inner.clone() };
    for sch in schedules {
        if !sch.enabled {
            continue;
        }
        let Ok(parsed) = CronSchedule::parse(&sch.cron_expr) else { continue };
        let due = sch.next_run_at.is_some_and(|next| now >= next);
        if !due {
            continue;
        }
        // Idempotent checkpoint keyed by the scheduled minute so crash/restart
        // never triggers duplicate unattended runs (`pi-durable` pattern).
        let slot_min = sch.next_run_at.unwrap_or(now).div_euclid(60_000);
        let checkpoint = format!("cron:{slot_min}");
        let claimed = inner.store(|s| s.claim_schedule_checkpoint(&sch.id, &checkpoint))?;
        let next = parsed.next_after(now);
        if !claimed {
            // This slot was claimed before and the schedule never moved on
            // (Tower stopped mid-launch, or recording the run failed): skip
            // the slot, never run it twice, but keep the schedule alive.
            if let Err(e) = inner.store(|s| s.set_schedule_next_run(&sch.id, next)) {
                tracing::warn!(schedule = %sch.id, error = %e, "could not move a schedule past a claimed slot");
            }
            continue;
        }
        match instantiate_scheduled_goal(&sup, &sch).await {
            Ok(goal) => {
                if let Err(e) = inner.store(|s| s.record_schedule_run(&sch.id, now, next, &goal.id)) {
                    tracing::warn!(schedule = %sch.id, goal = %goal.id, error = %e, "could not record a scheduled run");
                }
            }
            Err(e) => {
                tracing::warn!(schedule = %sch.id, error = %e, "failed to launch scheduled goal");
                if let Err(e) = inner.store(|s| s.set_schedule_next_run(&sch.id, next)) {
                    tracing::warn!(schedule = %sch.id, error = %e, "could not move a schedule past a failed launch");
                }
            }
        }
    }
    Ok(())
}

async fn instantiate_scheduled_goal(sup: &Supervisor, sch: &ScheduledGoal) -> Result<GoalSummary> {
    sup.create_goal(scheduled_input(sch, true)).await
}

fn scheduled_input(sch: &ScheduledGoal, ratify: bool) -> NewGoalInput {
    let mut contract = sch.contract_template.clone();
    if sch.unattended_strict {
        // Hard-enforce cautious autonomy in unattended mode: one-way doors and
        // non-read-only commands always pause to Needs-You, never auto-execute.
        contract.autonomy = Autonomy::Cautious;
    }
    NewGoalInput { project_id: sch.project_id.clone(), title: sch.title.clone(), contract, ratify }
}

fn validate_cron(expr: &str, lang: Lang) -> Result<CronSchedule> {
    CronSchedule::parse(expr)
        .map_err(|e| invalid(tr!(lang, "无效的 Cron 表达式（{e}）", "Invalid cron expression ({e})")))
}

impl Supervisor {
    pub fn scheduled_goals(&self) -> Result<Vec<ScheduledGoal>> {
        self.inner.read_store(|s| s.scheduled_goals())
    }

    pub fn create_scheduled_goal(&self, input: NewScheduledGoalInput) -> Result<ScheduledGoal> {
        let lang = self.inner.lang();
        if input.title.trim().is_empty() {
            return Err(invalid(tr!(lang, "定时目标标题不能为空", "Scheduled goal title cannot be empty")));
        }
        let cron = validate_cron(&input.cron_expr, lang)?;
        if !input.contract_template.is_ratifiable() {
            return Err(invalid(tr!(lang, "定时目标的合同模板有错误", "Scheduled goal contract template has errors")));
        }
        let next = input.enabled.then(|| cron.next_after(tower_store::system_now())).flatten();
        self.inner.store(|s| {
            s.create_scheduled_goal(NewScheduledGoal {
                project_id: input.project_id,
                title: input.title,
                cron_expr: input.cron_expr,
                contract_template: input.contract_template,
                enabled: input.enabled,
                next_run_at: next,
                unattended_strict: input.unattended_strict,
            })
        })
    }

    pub fn toggle_scheduled_goal(&self, id: &str, enabled: bool) -> Result<ScheduledGoal> {
        let sch = self.inner.store(|s| s.scheduled_goal(id))?;
        let next = if enabled {
            CronSchedule::parse(&sch.cron_expr).ok().and_then(|c| c.next_after(tower_store::system_now()))
        } else {
            None
        };
        self.inner.store(|s| s.set_scheduled_goal_enabled(id, enabled, next))
    }

    pub fn delete_scheduled_goal(&self, id: &str) -> Result<()> {
        self.inner.store(|s| s.delete_scheduled_goal(id))
    }

    /// Manually triggers a scheduled goal immediately. A `manual:<minute>`
    /// checkpoint makes a second press in the same minute (a double click,
    /// the phone and the desktop together) create no second goal.
    pub async fn run_scheduled_goal_now(&self, id: &str) -> Result<GoalSummary> {
        let sch = self.inner.store(|s| s.scheduled_goal(id))?;
        let now = tower_store::system_now();
        let checkpoint = format!("manual:{}", now.div_euclid(60_000));
        // The checkpoint this claim replaces, read under the same lock.
        let (previous, claimed) =
            self.inner.store(|s| Ok((s.schedule_checkpoint(id)?, s.claim_schedule_checkpoint(id, &checkpoint)?)))?;
        if !claimed {
            return Err(invalid(tr!(
                self.inner.lang(),
                "这个定时目标刚刚已经运行过，请一分钟后再试",
                "This scheduled goal was just run; try again in a minute"
            )));
        }
        let next = CronSchedule::parse(&sch.cron_expr).ok().and_then(|c| c.next_after(now));
        let draft = match self.create_goal(scheduled_input(&sch, false)).await {
            Ok(goal) => goal,
            Err(e) => {
                // No goal was created: a retry in the same minute may go ahead.
                if let Err(e) =
                    self.inner.store(|s| s.release_schedule_checkpoint(id, &checkpoint, previous.as_deref()))
                {
                    tracing::warn!(schedule = %id, error = %e, "could not release a manual run's checkpoint");
                }
                return Err(e);
            }
        };
        // From here a goal exists, started or not: the minute stays claimed, so a retry makes no second one.
        if let Err(e) = self.inner.store(|s| s.record_schedule_run(id, now, next, &draft.id)) {
            tracing::warn!(schedule = %id, goal = %draft.id, error = %e, "could not record a manual scheduled run");
        }
        self.ratify(&draft.id).await?;
        self.inner.emit_goal_now(&draft.id);
        self.inner.store(|s| s.summary(&draft.id))
    }
}

#[cfg(test)]
pub(crate) mod tests {
    use super::*;

    #[test]
    fn cron_parser_matches_standard_5_field_expressions() {
        let nightly = CronSchedule::parse("30 2 * * 1-5").unwrap();
        // 2026-11-23 is Monday (dow=1): 2026-11-23T02:30:00Z
        // Days from 1970-01-01 to 2026-11-23: verify via next_after from 2026-11-23T00:00:00Z.
        let base_ms: i64 = 1_795_392_000_000; // 2026-11-24T00:00:00Z (Tuesday)
        let next = nightly.next_after(base_ms).unwrap();
        let dt = utc_from_unix_minute(next / 60_000);
        assert_eq!((dt.hour, dt.minute), (2, 30));
        assert!((1..=5).contains(&dt.dow));

        let step = CronSchedule::parse("*/15 * * * *").unwrap();
        assert!(step.matches_minute(0));
        assert!(step.matches_minute(15));
        assert!(!step.matches_minute(7));

        assert!(CronSchedule::parse("bad cron").is_err());
        assert!(CronSchedule::parse("61 * * * *").is_err());
        assert!(CronSchedule::parse("*/0 * * * *").is_err());
    }

    pub(crate) async fn supervisor(tmp: &tempfile::TempDir) -> (Supervisor, String) {
        let repo = tmp.path().join("repo");
        std::fs::create_dir_all(&repo).unwrap();
        std::fs::write(repo.join("README.md"), "hello\n").unwrap();
        tower_git::Git::default().init_with_commit(&repo, "init").unwrap();
        let home = tmp.path().join("home");
        std::fs::create_dir_all(&home).unwrap();
        let manifest = std::path::PathBuf::from(env!("CARGO_MANIFEST_DIR"));
        // A ratified goal starts a run: on the scripted engine, never a real one.
        let env = crate::shell_env::ShellEnv::from_pairs([
            ("PATH".to_string(), std::env::var("PATH").unwrap()),
            ("HOME".to_string(), home.display().to_string()),
            ("PI_FAKE_SCENARIO".to_string(), "pass".to_string()),
        ]);
        let sup = Supervisor::start(
            crate::Config {
                paths: crate::Paths::new(tmp.path().join("tower-home")),
                extension_source: manifest.join("../../extensions/tower-goal"),
                env: Some(env),
                demo_engine: None,
            },
            Arc::new(crate::NullSink),
        )
        .await
        .unwrap();
        let fake = manifest.join("tests/fixtures/fake_pi.py").display().to_string();
        sup.save_settings(tower_core::view::Settings { pi_path: fake, language: "en".into(), ..Default::default() })
            .unwrap();
        let p = sup.add_project(repo.to_str().unwrap()).await.unwrap();
        (sup, p.id)
    }

    fn every_minute(sup: &Supervisor, project_id: &str, next_run_at: Option<Millis>) -> ScheduledGoal {
        let contract = tower_core::contract::Contract::quick("nightly", Some("true".into()), Lang::En);
        sup.inner
            .store(|s| {
                s.create_scheduled_goal(NewScheduledGoal {
                    project_id: project_id.into(),
                    title: "nightly".into(),
                    cron_expr: "* * * * *".into(),
                    contract_template: contract,
                    enabled: true,
                    next_run_at,
                    unattended_strict: true,
                })
            })
            .unwrap()
    }

    #[tokio::test]
    async fn a_slot_claimed_by_a_run_that_never_finished_does_not_stop_the_schedule() {
        let tmp = tempfile::tempdir().unwrap();
        let (sup, pid) = supervisor(&tmp).await;
        let now = tower_store::system_now();
        let slot = now - 60_000;
        let sch = every_minute(&sup, &pid, Some(slot));
        // An earlier poll claimed the slot, then Tower stopped before the
        // schedule moved on (a crash, or a launch whose result was lost).
        let checkpoint = format!("cron:{}", slot.div_euclid(60_000));
        assert!(sup.inner.store(|s| s.claim_schedule_checkpoint(&sch.id, &checkpoint)).unwrap());

        poll_due_schedules(&sup.inner).await.unwrap();

        let after = sup.inner.store(|s| s.scheduled_goal(&sch.id)).unwrap();
        assert!(after.next_run_at.is_some_and(|n| n > now), "the schedule moves on: {:?}", after.next_run_at);
        assert_eq!(after.last_goal_id, None, "the claimed slot is not run a second time");
        assert!(sup.inner.read_store(|s| s.summaries()).unwrap().is_empty());
    }

    #[tokio::test]
    async fn run_now_pressed_twice_in_a_minute_creates_one_goal() {
        let tmp = tempfile::tempdir().unwrap();
        let (sup, pid) = supervisor(&tmp).await;
        let sch = every_minute(&sup, &pid, None);

        let (a, b) = tokio::join!(sup.run_scheduled_goal_now(&sch.id), sup.run_scheduled_goal_now(&sch.id));

        assert_eq!([a.is_ok(), b.is_ok()].iter().filter(|ok| **ok).count(), 1, "{a:?} {b:?}");
        assert_eq!(sup.inner.read_store(|s| s.summaries()).unwrap().len(), 1);
    }

    #[tokio::test]
    async fn a_run_now_whose_goal_was_created_but_not_started_keeps_its_minute() {
        let tmp = tempfile::tempdir().unwrap();
        let (sup, pid) = supervisor(&tmp).await;
        // A template that no longer ratifies (saved before a check it now fails): the goal is created as a draft,
        // then cannot start.
        let mut contract = tower_core::contract::Contract::quick("nightly", Some("true".into()), Lang::En);
        contract.criteria.clear();
        contract.intent.clear();
        let sch = sup
            .inner
            .store(|s| {
                s.create_scheduled_goal(NewScheduledGoal {
                    project_id: pid.clone(),
                    title: "nightly".into(),
                    cron_expr: "* * * * *".into(),
                    contract_template: contract,
                    enabled: true,
                    next_run_at: None,
                    unattended_strict: true,
                })
            })
            .unwrap();

        assert!(sup.run_scheduled_goal_now(&sch.id).await.is_err());
        assert!(sup.run_scheduled_goal_now(&sch.id).await.is_err());

        let goals = sup.inner.read_store(|s| s.summaries()).unwrap();
        assert_eq!(goals.len(), 1, "a retry in the same minute creates no second goal");
        let after = sup.inner.store(|s| s.scheduled_goal(&sch.id)).unwrap();
        assert_eq!(after.last_goal_id.as_deref(), Some(goals[0].id.as_str()), "the run that created it is recorded");
    }

    #[tokio::test]
    async fn a_run_now_that_fails_gives_back_the_slot_the_scheduler_claimed() {
        let tmp = tempfile::tempdir().unwrap();
        let (sup, pid) = supervisor(&tmp).await;
        let contract = tower_core::contract::Contract::quick("nightly", Some("true".into()), Lang::En);
        // A title the goal cannot be created with: the launch fails.
        let sch = sup
            .inner
            .store(|s| {
                s.create_scheduled_goal(NewScheduledGoal {
                    project_id: pid.clone(),
                    title: String::new(),
                    cron_expr: "* * * * *".into(),
                    contract_template: contract,
                    enabled: true,
                    next_run_at: None,
                    unattended_strict: true,
                })
            })
            .unwrap();
        sup.inner.store(|s| s.claim_schedule_checkpoint(&sch.id, "cron:42")).unwrap();

        assert!(sup.run_scheduled_goal_now(&sch.id).await.is_err());

        let checkpoint = sup.inner.store(|s| s.schedule_checkpoint(&sch.id)).unwrap();
        assert_eq!(checkpoint.as_deref(), Some("cron:42"), "the scheduler's slot stays claimed");
    }
}
