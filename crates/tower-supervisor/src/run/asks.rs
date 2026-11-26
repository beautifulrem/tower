//! What the engine asks while a run goes on (its dialogs, turned into inbox items, and their time limits), and the
//! run's mode and live line settled again when a question closes or a call ends.

use std::sync::MutexGuard;

use tower_pi::UiRequest;

use super::*;
use crate::api::ToastLevel;

impl Run {
    /// Held while the run's mode and live line are worked out and written. A call that starts is recorded under it
    /// whole, so a settle from beside the engine's events (an answer, a time limit running out) lands before or after
    /// it, never between the call's start and its entry among the calls in flight (review 19: the settle found no call
    /// at work, and the run read as thinking, then silent, while a command ran).
    pub(crate) fn lock_mode(&self) -> MutexGuard<'_, ()> {
        self.mode_lock.lock().unwrap_or_else(PoisonError::into_inner)
    }
}

/// A point between two writes that are seen together, under the mode's lock: a call's start and its entry among the
/// calls in flight, a question and its dialog, an answer's mode and the answer itself. A test runs a step of its own
/// here, to try to come between them; elsewhere it does nothing.
#[cfg(not(test))]
#[inline(always)]
pub(crate) fn between(_run: &Run, _point: &str) {}
#[cfg(test)]
pub(crate) use tests::between;

/// A mode the engine reports for itself (compacting, retrying): written under the mode's lock, and never over an open
/// question, which leaves the run waiting on you until it is answered or closed (review 20, record only), nor once the
/// run is stopping.
pub(super) fn report_mode(inner: &Inner, run: &Run, mode: Mode) -> Result<()> {
    let _mode = run.lock_mode();
    let quiet = {
        let f = run.flags();
        f.dialogs.is_empty() && f.stopping.is_none()
    };
    if quiet { inner.set_mode(&run.goal_id, mode) } else { Ok(()) }
}

/// After a call ends or a question is answered: the mode of the call still at work, and the live line back on it,
/// or thinking when none is (review 16 and 17: a call ending, or an answer, while another runs set the run to
/// thinking, and the desk and the phone then read a running command as silence). While a question is open the run
/// waits on you, whatever starts or ends beside it; the live line follows the call at work and says if one runs.
pub(crate) fn settle_mode(inner: &Inner, run: &Run) -> Result<()> {
    let mode = run.lock_mode();
    settle_held(inner, run, &mode)
}

/// `settle_mode`, for a caller that already holds the mode's lock. Once the run is stopping, what ends after the stop
/// (a call the abort ended, an answer late to a dialog) stops the live line and writes no mode: the stop writes the
/// one the run ends on (idle, settled), and a settle after it read thinking on a paused goal.
pub(crate) fn settle_held(inner: &Inner, run: &Run, _mode: &MutexGuard<'_, ()>) -> Result<()> {
    let g = &run.goal_id;
    let stopping = run.flags().stopping.is_some();
    let work = run.flags().at_work().filter(|_| !stopping).map(|c| LiveLine {
        mode: Mode::for_tool(&c.tool),
        action: c.tool.clone(),
        target: crate::summarize::tool_call(&c.tool, &c.args, &run.workspace),
        at: c.at,
        running: true,
    });
    match &work {
        Some(line) => inner.store(|s| s.set_live_line(g, line))?,
        None => inner.store(|s| s.stop_live_line(g))?,
    }
    inner.mark_dirty(g);
    if stopping {
        return Ok(());
    }
    let asked = !run.flags().dialogs.is_empty();
    inner.set_mode(g, if asked { Mode::WaitingOnYou } else { work.map_or(Mode::Thinking, |l| l.mode) })
}

pub(super) fn on_ui_request(inner: &Arc<Inner>, run: &Arc<Run>, req: UiRequest) -> Result<()> {
    let g = run.goal_id.as_str();
    if !req.is_dialog() {
        if req.method == "notify"
            && let Some(m) = req.message.filter(|m| !m.is_empty())
        {
            inner.append(g, EventKind::Note { text: m })?;
        }
        return Ok(());
    }
    let title = req.title.clone().unwrap_or_default();
    let lang = inner.lang();
    let item = match title.strip_prefix("tower:").and_then(|j| serde_json::from_str::<Value>(j).ok()) {
        Some(p) if p.get("tower").and_then(Value::as_str) == Some("approval") => {
            let s = |k: &str| p.get(k).and_then(Value::as_str).unwrap_or_default().to_string();
            NewInboxItem {
                goal_id: g.into(),
                kind: InboxKind::Approval,
                title: {
                    let reason = s("reason");
                    tr!(lang, "需要你批准：{reason}", "Approval needed: {reason}")
                },
                subject: s("reason"),
                body: format!("{} {}", s("tool"), s("target")),
                options: req.options.clone(),
                allow_text: false,
                urgency: 0,
                engine_ref: Some(req.id.clone()),
            }
        }
        Some(p) => {
            let s = |k: &str| p.get(k).and_then(Value::as_str).unwrap_or_default().to_string();
            let options = p
                .get("options")
                .and_then(Value::as_array)
                .map(|a| a.iter().filter_map(Value::as_str).map(String::from).collect())
                .unwrap_or_default();
            NewInboxItem {
                goal_id: g.into(),
                kind: InboxKind::Question,
                title: s("question"),
                subject: s("question"),
                body: s("why"),
                options,
                allow_text: true,
                urgency: 1,
                engine_ref: Some(req.id.clone()),
            }
        }
        // A dialog from one of the user's own extensions.
        None => NewInboxItem {
            goal_id: g.into(),
            kind: InboxKind::Question,
            subject: title.clone(),
            title: if title.is_empty() {
                tr!(lang, "扩展请求你的输入", "An extension asks for your input")
            } else {
                title
            },
            body: req.message.clone().unwrap_or_default(),
            options: if req.method == "confirm" {
                Choice::labels(&[Choice::Yes, Choice::No], lang)
            } else {
                req.options.clone()
            },
            allow_text: matches!(req.method.as_str(), "input" | "editor"),
            urgency: 1,
            engine_ref: Some(req.id.clone()),
        },
    };
    // The question can be answered the moment it is in the inbox, so its dialog is registered in the same step, under
    // the mode's lock, which an answer takes before it looks for the dialog (review 20: answered in between, the answer
    // found no dialog and went as text, and the dialog registered after it was never closed: the run waited on you for
    // good with nothing to answer).
    let opened = {
        let _mode = run.lock_mode();
        let opened = inner.open_inbox(item)?;
        between(run, "dialog-opened");
        run.flags().dialogs.insert(req.id.clone(), (opened.id.clone(), req.method));
        inner.set_mode(g, Mode::WaitingOnYou)?;
        opened
    };
    let title = &opened.title;
    inner.toast(g, ToastLevel::Warning, tr!(lang, "{g} 需要你：{title}", "{g} needs you: {title}"));
    // A dialog with a time limit is answered by Pi itself when the time runs out: the extension's call gets nothing back
    // and no one is told. Left alone, the question stayed open and the run waited on you for good (review 18). It is
    // closed as timed out a moment before Pi's own limit (a tenth of it, a second at most): an answer given until then
    // still reaches Pi in time, and one given after is refused, never sent to a dialog Pi already let go (review 19).
    if let Some(ms) = req.timeout.filter(|ms| *ms > 0) {
        let (inner, run) = (inner.clone(), run.clone());
        tokio::spawn(async move {
            tokio::time::sleep(closes_after(ms)).await;
            if let Err(e) = expire_dialog(&inner, &run, &req.id) {
                tracing::warn!(goal = %run.goal_id, error = %e, "could not close a timed-out dialog");
            }
        });
    }
    Ok(())
}

/// When a dialog Pi gives up on after `ms` is closed: a tenth sooner, a second at most (see `on_ui_request`).
fn closes_after(ms: u64) -> Duration {
    Duration::from_millis(ms - (ms / 10).min(1_000))
}

/// Closes a dialog whose time ran out, unless it was answered (or its run ended) first. Whoever closes the question
/// first wins, in one store step: an answer that got there first goes to the engine and this does nothing; once this
/// closed it, a late answer is refused ("already handled"), and the dialog's method is never lost to it.
fn expire_dialog(inner: &Arc<Inner>, run: &Arc<Run>, ui_id: &str) -> Result<()> {
    let Some((item, _)) = run.flags().dialogs.get(ui_id).cloned() else {
        return Ok(());
    };
    let g = run.goal_id.as_str();
    let note = tr!(
        inner.lang(),
        "（已超时：提问的一方不再等这个回答）",
        "(timed out: the asker stopped waiting for an answer)"
    );
    if inner.store(|s| s.resolve_inbox(&item, &note)).is_err() {
        return Ok(());
    }
    run.flags().dialogs.remove(ui_id);
    inner.emit_inbox();
    inner.emit_goal_now(g);
    if inner.run_of(g).is_some_and(|r| Arc::ptr_eq(&r, run)) {
        settle_mode(inner, run)?;
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use std::sync::LazyLock;
    use std::sync::mpsc as sync_mpsc;

    use serde_json::json;
    use tower_pi::PiEvent;

    use super::*;
    use crate::run::events::{on_event, on_tool_start};
    use crate::run::tests::fake_engine_goal;

    type Step = Box<dyn FnOnce() + Send>;
    /// A test's step at a point of one run (by its address: every test has runs of its own), taken when reached.
    static STEPS: LazyLock<Mutex<HashMap<(usize, String), Step>>> = LazyLock::new(Mutex::default);

    pub(crate) fn between(run: &Run, point: &str) {
        let step =
            STEPS.lock().unwrap_or_else(PoisonError::into_inner).remove(&(run as *const Run as usize, point.into()));
        if let Some(step) = step {
            step()
        }
    }

    /// Runs `step` the next time `run` reaches `point`, with whatever that point holds still held.
    pub(crate) fn at(run: &Run, point: &str, step: impl FnOnce() + Send + 'static) {
        let key = (run as *const Run as usize, point.to_string());
        STEPS.lock().unwrap_or_else(PoisonError::into_inner).insert(key, Box::new(step));
    }

    /// The modes the run went through, oldest first (the trace lists the newest first).
    fn modes(inner: &Inner, g: &str) -> Vec<Mode> {
        let trace = inner.read_store(|s| s.trace(g, None, 500)).unwrap();
        let changes = trace.iter().rev().filter_map(|e| match &e.event {
            EventKind::ModeChanged { mode } => Some(*mode),
            _ => None,
        });
        changes.collect()
    }

    /// A running goal on an engine that answers every command and writes down, in its workspace, what it is sent.
    async fn running() -> (tempfile::TempDir, crate::Supervisor, Arc<Run>, PathBuf) {
        let script = r#"
while IFS= read -r line; do
  printf '%s\n' "$line" >> .sent.jsonl
  id=$(printf '%s' "$line" | sed -n 's/.*"id":"\([^"]*\)".*/\1/p')
  type=$(printf '%s' "$line" | sed -n 's/.*"type":"\([^"]*\)".*/\1/p')
  printf '{"id":"%s","type":"response","command":"%s","success":true,"data":{}}\n' "$id" "$type"
done"#;
        let (tmp, sup, id) = fake_engine_goal(script, false).await;
        let inner = &sup.inner;
        inner.transition(&id, Transition::Ratify, None, "").unwrap();
        let repo = tmp.path().join("repo");
        let head = std::process::Command::new("git").args(["rev-parse", "HEAD"]).current_dir(&repo).output().unwrap();
        let base = String::from_utf8_lossy(&head.stdout).trim().to_string();
        let workspace = repo.display().to_string();
        inner.append(&id, EventKind::WorkspacePrepared { workspace, base_commit: base }).unwrap();
        let goal = inner.store(|s| s.goal(&id)).unwrap();
        let (engine, _rx) = Engine::spawn(&engine_config(inner, &goal, &repo).unwrap()).unwrap();
        let run = Arc::new(Run {
            goal_id: id,
            run_no: 1,
            started: Instant::now(),
            engine,
            workspace: repo.display().to_string(),
            flags: Mutex::new(Flags::default()),
            profile: Mutex::default(),
            mode_lock: Mutex::default(),
        });
        assert!(slots::begin(inner, &run, LifecycleState::Ready, "initial", None).unwrap());
        let sent = repo.join(".sent.jsonl");
        (tmp, sup, run, sent)
    }

    /// An extension's yes-or-no question, with Pi's time limit if any.
    fn confirm(id: &str, timeout: Option<u64>) -> UiRequest {
        serde_json::from_value(json!({"id": id, "method": "confirm", "title": "Go on?", "timeout": timeout})).unwrap()
    }

    fn mode(inner: &Inner, g: &str) -> Mode {
        inner.store(|s| s.goal(g)).unwrap().mode
    }

    fn live(inner: &Inner, g: &str) -> Option<LiveLine> {
        inner.read_store(|s| s.summary(g)).unwrap().live_line
    }

    fn open_item(inner: &Inner, g: &str) -> Option<String> {
        inner.read_store(|s| s.open_inbox_items()).unwrap().into_iter().find(|i| i.goal_id == g).map(|i| i.id)
    }

    async fn until(what: &str, mut done: impl FnMut() -> bool) {
        for _ in 0..200 {
            if done() {
                return;
            }
            tokio::time::sleep(Duration::from_millis(20)).await;
        }
        panic!("never: {what}");
    }

    fn started(inner: &Inner, g: &str, call: &str) -> bool {
        let trace = inner.read_store(|s| s.trace(g, None, 500)).unwrap();
        trace.iter().any(|e| matches!(&e.event, EventKind::ToolStarted { call_id, .. } if call_id == call))
    }

    /// Review 19: the time ran out while a call was being recorded (its start written, not yet among the calls in
    /// flight), and the settle read no call at work: thinking, the live line stopped, while the command ran. The
    /// settle now waits for the recording, and then finds the call.
    #[tokio::test(flavor = "multi_thread")]
    async fn a_time_limit_running_out_waits_for_a_call_being_recorded() {
        let (_tmp, sup, run, _) = running().await;
        let (inner, g) = (&sup.inner, run.goal_id.clone());
        on_ui_request(inner, &run, confirm("u1", Some(300))).unwrap();
        assert_eq!(mode(inner, &g), Mode::WaitingOnYou);

        // A call start halfway through, as `on_tool_start` records it, when the time runs out: on a thread of its own,
        // as the event pump is, holding the mode's lock (never across an await) while the expiry waits on it.
        let (pump, run2, g2) = (sup.inner.clone(), run.clone(), g.clone());
        tokio::task::spawn_blocking(move || {
            let _mode = run2.lock_mode();
            let started =
                EventKind::ToolStarted { call_id: "c1".into(), tool: "bash".into(), summary: "pnpm test".into() };
            let at = pump.append(&g2, started).unwrap().at;
            let end = Instant::now() + Duration::from_secs(4);
            while open_item(&pump, &g2).is_some() {
                assert!(Instant::now() < end, "never: the question closes as timed out");
                std::thread::sleep(Duration::from_millis(20));
            }
            std::thread::sleep(Duration::from_millis(200));
            assert_eq!(mode(&pump, &g2), Mode::WaitingOnYou, "the settle waits for the call being recorded");
            assert!(live(&pump, &g2).is_some_and(|l| l.running), "nor did it stop the live line");
            let args = json!({"command": "pnpm test"});
            run2.flags().tools.insert("c1".into(), ToolCall { tool: "bash".into(), args, started: Instant::now(), at });
            pump.set_mode(&g2, Mode::Executing).unwrap();
        })
        .await
        .unwrap();

        tokio::time::sleep(Duration::from_millis(200)).await;
        assert_eq!(mode(inner, &g), Mode::Executing, "the settle found the call at work");
        let line = live(inner, &g).unwrap();
        assert!(line.running && line.action == "bash", "{line:?}");
    }

    /// The other way round: a call that starts while a settle is under way is recorded after it, whole.
    #[tokio::test(flavor = "multi_thread")]
    async fn a_call_that_starts_during_a_settle_is_recorded_after_it() {
        let (_tmp, sup, run, _) = running().await;
        let (inner, g) = (&sup.inner, run.goal_id.clone());
        let held = run.lock_mode();
        let (i2, r2) = (sup.inner.clone(), run.clone());
        let start = std::thread::spawn(move || {
            on_tool_start(&i2, &r2, "c1".into(), "bash".into(), json!({"command": "pnpm test"}))
        });
        std::thread::sleep(Duration::from_millis(200));
        assert!(!started(inner, &g, "c1"), "the start waits for the settle");
        drop(held);
        start.join().unwrap().unwrap();
        assert!(started(inner, &g, "c1"));
        assert_eq!(mode(inner, &g), Mode::Executing);
        assert!(run.flags().tools.contains_key("c1"));
    }

    /// The agent's turn ended with a call it never ended: nothing runs any more, and the live line says so (review
    /// 19: no test held this).
    #[tokio::test(flavor = "multi_thread")]
    async fn the_turn_ending_stops_the_live_line_of_a_call_never_ended() {
        let (_tmp, sup, run, _) = running().await;
        let (inner, g) = (&sup.inner, run.goal_id.clone());
        on_tool_start(inner, &run, "c1".into(), "bash".into(), json!({"command": "pnpm test"})).unwrap();
        assert!(live(inner, &g).is_some_and(|l| l.running));
        on_event(inner, &run, tower_pi::PiEvent::AgentEnd { will_retry: false }).await.unwrap();
        assert!(run.flags().tools.is_empty());
        let line = live(inner, &g).unwrap();
        assert!(!line.running && line.action == "bash", "{line:?}");
    }

    /// Review 19 (record only): an answer that closed the question first, with the time running out before it reached
    /// the engine. The expiry then took the dialog away, and the answer to a yes-or-no question went out as text.
    #[tokio::test(flavor = "multi_thread")]
    async fn an_answer_that_closed_the_question_first_keeps_the_dialogs_method() {
        let (_tmp, sup, run, sent) = running().await;
        let (inner, g) = (&sup.inner, run.goal_id.clone());
        on_ui_request(inner, &run, confirm("u1", None)).unwrap();
        let item = open_item(inner, &g).unwrap();
        inner.store(|s| s.resolve_inbox(&item, "Yes")).unwrap();
        expire_dialog(inner, &run, "u1").unwrap();
        crate::control::answer_dialog(inner, &g, "u1", "Yes").unwrap();
        let reply = || {
            let log = std::fs::read_to_string(&sent).unwrap_or_default();
            log.lines().find(|l| l.contains("extension_ui_response")).map(String::from)
        };
        until("the answer reaches the engine", || reply().is_some()).await;
        let reply: Value = serde_json::from_str(&reply().unwrap()).unwrap();
        assert_eq!(reply["confirmed"], true, "{reply}");
        let trace = inner.read_store(|s| s.trace(&g, None, 500)).unwrap();
        let timed_out = |e: &tower_core::view::TraceEntry| matches!(&e.event, EventKind::InboxResolved { response, .. } if response.contains("timed out"));
        assert!(!trace.iter().any(timed_out), "the question was answered, not timed out");

        // And once the time closed a question, a late answer is refused, not sent to a dialog Pi let go.
        on_ui_request(inner, &run, confirm("u2", Some(100))).unwrap();
        let item = open_item(inner, &g).unwrap();
        until("the second question times out", || open_item(inner, &g).is_none()).await;
        assert!(crate::actions::answer(inner, &item, "Yes").await.is_err());
        let log = std::fs::read_to_string(&sent).unwrap();
        assert!(!log.contains(r#""id":"u2""#), "nothing went to the engine for it: {log}");
    }

    /// Review 20 (record only): a call's start, its mode and its entry among the calls in flight are one step under the
    /// mode's lock. A settle that tries to come in between, as an answer or a time limit would, waits, then finds the
    /// call at work: the run reads as running the command, not thinking, and the live line still runs.
    #[tokio::test(flavor = "multi_thread")]
    async fn a_settle_cannot_come_between_a_calls_start_and_its_entry() {
        let (_tmp, sup, run, _) = running().await;
        let (inner, g) = (&sup.inner, run.goal_id.clone());
        let (done, settled) = sync_mpsc::channel();
        let (i2, r2) = (sup.inner.clone(), run.clone());
        at(&run, "call-recording", move || {
            std::thread::spawn(move || done.send(settle_mode(&i2, &r2).map_err(|e| e.to_string())).unwrap());
            std::thread::sleep(Duration::from_millis(200));
        });
        on_tool_start(inner, &run, "c1".into(), "bash".into(), json!({"command": "pnpm test"})).unwrap();
        settled.recv_timeout(Duration::from_secs(5)).unwrap().unwrap();
        assert_eq!(mode(inner, &g), Mode::Executing, "{:?}", modes(inner, &g));
        let line = live(inner, &g).unwrap();
        assert!(line.running && line.action == "bash", "{line:?}");
    }

    /// Review 20: a question answered the moment it was in the inbox, before its dialog was registered. The answer found
    /// no dialog and went out as text, and the dialog registered after it was never closed: the run waited on you for
    /// good, with nothing to answer. The answer now waits for the dialog, and the yes reaches the engine as a yes.
    #[tokio::test(flavor = "multi_thread")]
    async fn a_question_answered_the_moment_it_opens_finds_its_dialog() {
        let (_tmp, sup, run, sent) = running().await;
        let (inner, g) = (&sup.inner, run.goal_id.clone());
        let (done, answered) = sync_mpsc::channel();
        let (i2, g2) = (sup.inner.clone(), g.clone());
        at(&run, "dialog-opened", move || {
            std::thread::spawn(move || {
                let item = open_item(&i2, &g2).expect("the question is in the inbox");
                i2.store(|s| s.resolve_inbox(&item, "Yes")).unwrap();
                done.send(crate::control::answer_dialog(&i2, &g2, "u1", "Yes").map_err(|e| e.to_string())).unwrap();
            });
            std::thread::sleep(Duration::from_millis(200));
        });
        on_ui_request(inner, &run, confirm("u1", None)).unwrap();
        answered.recv_timeout(Duration::from_secs(5)).unwrap().expect("the answer found its dialog");
        assert!(run.flags().dialogs.is_empty(), "no dialog is left open");
        assert_eq!(mode(inner, &g), Mode::Thinking, "{:?}", modes(inner, &g));
        let reply = || {
            let log = std::fs::read_to_string(&sent).unwrap_or_default();
            log.lines().find(|l| l.contains("extension_ui_response")).map(String::from)
        };
        until("the answer reaches the engine", || reply().is_some()).await;
        let reply: Value = serde_json::from_str(&reply().unwrap()).unwrap();
        assert_eq!(reply["confirmed"], true, "{reply}");
    }

    /// Once the run is stopping, the stop's mode stands: a call the abort ended, a compaction the engine reports and an
    /// answer late to its dialog, each handled after the stop wrote it, leave the run idle, nothing running.
    #[tokio::test(flavor = "multi_thread")]
    async fn what_ends_after_a_stop_writes_no_mode_over_it() {
        let (_tmp, sup, run, _) = running().await;
        let (inner, g) = (&sup.inner, run.goal_id.clone());
        on_tool_start(inner, &run, "c1".into(), "bash".into(), json!({"command": "pnpm test"})).unwrap();
        on_ui_request(inner, &run, confirm("u1", None)).unwrap();
        run.flags().stopping = Some(Stop::Pause(PauseReason::Human));
        inner.set_mode(&g, Mode::Idle).unwrap();

        let end = PiEvent::ToolEnd { call_id: "c1".into(), tool: "bash".into(), result: json!({}), is_error: false };
        on_event(inner, &run, end).await.unwrap();
        on_event(inner, &run, PiEvent::CompactionStart).await.unwrap();
        on_event(inner, &run, PiEvent::CompactionEnd).await.unwrap();
        crate::control::answer_dialog(inner, &g, "u1", "Yes").unwrap();
        assert_eq!(mode(inner, &g), Mode::Idle, "{:?}", modes(inner, &g));
        // Idle cleared the live line, and no settle after it put the call back as running.
        assert!(!live(inner, &g).is_some_and(|l| l.running), "{:?}", live(inner, &g));
    }

    /// An answer that finds no dialog (its run let it go) is refused, and nothing goes to the engine as text.
    #[tokio::test(flavor = "multi_thread")]
    async fn an_answer_with_no_dialog_is_refused() {
        let (_tmp, sup, run, sent) = running().await;
        let err = crate::control::answer_dialog(&sup.inner, &run.goal_id, "u9", "Yes").unwrap_err();
        assert!(err.to_string().contains("no longer waiting"), "{err}");
        tokio::time::sleep(Duration::from_millis(200)).await;
        let log = std::fs::read_to_string(&sent).unwrap_or_default();
        assert!(!log.contains("extension_ui_response"), "{log}");
    }

    /// Iteration 20 (D214): an answer's mode is written before the answer goes, under the mode's lock. What the engine
    /// does with it at once (here, the command ending) is recorded after: the run is back on the command, then on the
    /// read still at work. Sent first, the command's end came before the answer's mode, and the run skipped the command.
    #[tokio::test(flavor = "multi_thread")]
    async fn what_the_engine_does_with_an_answer_is_recorded_after_it() {
        let (_tmp, sup, run, _) = running().await;
        let (inner, g) = (&sup.inner, run.goal_id.clone());
        on_tool_start(inner, &run, "r1".into(), "read".into(), json!({"path": "src/a.ts"})).unwrap();
        on_tool_start(inner, &run, "b1".into(), "bash".into(), json!({"command": "pnpm test"})).unwrap();
        on_ui_request(inner, &run, confirm("u1", None)).unwrap();
        let item = open_item(inner, &g).unwrap();
        inner.store(|s| s.resolve_inbox(&item, "Yes")).unwrap();
        let before = modes(inner, &g).len();
        let (done, ended) = sync_mpsc::channel();
        let (i2, r2, pump) = (sup.inner.clone(), run.clone(), tokio::runtime::Handle::current());
        at(&run, "answer-sent", move || {
            std::thread::spawn(move || {
                let end =
                    PiEvent::ToolEnd { call_id: "b1".into(), tool: "bash".into(), result: json!({}), is_error: false };
                done.send(pump.block_on(on_event(&i2, &r2, end)).map_err(|e| e.to_string())).unwrap();
            });
            std::thread::sleep(Duration::from_millis(200));
        });
        crate::control::answer_dialog(inner, &g, "u1", "Yes").unwrap();
        ended.recv_timeout(Duration::from_secs(5)).unwrap().unwrap();
        assert_eq!(modes(inner, &g)[before..], [Mode::Executing, Mode::Reading]);
    }

    /// Review 20 (record only): the modes the engine reports for itself (a new turn, compacting, retrying) were written
    /// over an open question, and the run no longer read as waiting on you while it did. They now leave the question
    /// on top, and take over once it is answered.
    #[tokio::test(flavor = "multi_thread")]
    async fn the_engines_own_modes_never_cover_an_open_question() {
        let (_tmp, sup, run, _) = running().await;
        let (inner, g) = (&sup.inner, run.goal_id.clone());
        on_ui_request(inner, &run, confirm("u1", None)).unwrap();
        let retry = || PiEvent::RetryStart { attempt: 1, max_attempts: 3, error: "overloaded".into() };
        for e in [PiEvent::TurnStart, PiEvent::CompactionStart, PiEvent::CompactionEnd, retry()] {
            on_event(inner, &run, e).await.unwrap();
            assert_eq!(mode(inner, &g), Mode::WaitingOnYou, "{:?}", modes(inner, &g));
        }
        on_event(inner, &run, PiEvent::RetryEnd { success: true }).await.unwrap();
        assert_eq!(mode(inner, &g), Mode::WaitingOnYou);
        let item = open_item(inner, &g).unwrap();
        inner.store(|s| s.resolve_inbox(&item, "Yes")).unwrap();
        crate::control::answer_dialog(inner, &g, "u1", "Yes").unwrap();
        assert_eq!(mode(inner, &g), Mode::Thinking);
        on_event(inner, &run, PiEvent::CompactionStart).await.unwrap();
        assert_eq!(mode(inner, &g), Mode::Compacting);
        on_event(inner, &run, retry()).await.unwrap();
        assert_eq!(mode(inner, &g), Mode::Retrying);
        on_event(inner, &run, PiEvent::RetryEnd { success: true }).await.unwrap();
        assert_eq!(mode(inner, &g), Mode::Thinking);
    }

    #[test]
    fn a_question_closes_a_tenth_before_pis_own_limit_a_second_at_most() {
        assert_eq!(closes_after(400), Duration::from_millis(360));
        assert_eq!(closes_after(30_000), Duration::from_millis(29_000));
        assert_eq!(closes_after(5), Duration::from_millis(5));
    }
}
