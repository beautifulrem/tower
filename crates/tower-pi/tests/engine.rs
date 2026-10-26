use std::path::PathBuf;
use std::time::Duration;

use tower_pi::{Engine, EngineConfig, EngineError, EngineOutput, PiEvent, UiAnswer};

fn config() -> EngineConfig {
    EngineConfig {
        program: PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("tests/fixtures/fake-pi.sh"),
        cwd: std::env::temp_dir(),
        session_dir: std::env::temp_dir(),
        env: vec![("PATH".into(), "/usr/bin:/bin".into())],
        ..Default::default()
    }
}

async fn next_event(rx: &mut tokio::sync::mpsc::UnboundedReceiver<EngineOutput>) -> EngineOutput {
    tokio::time::timeout(Duration::from_secs(5), rx.recv()).await.expect("event in time").expect("channel open")
}

#[tokio::test]
async fn a_run_streams_events_and_round_trips_a_dialog() {
    let (engine, mut rx) = Engine::spawn(&config()).unwrap();

    let state = engine.state().await.unwrap();
    assert_eq!(state["sessionFile"], "/tmp/s1.jsonl");

    engine.prompt("go").await.unwrap();
    assert_eq!(next_event(&mut rx).await, EngineOutput::Event(PiEvent::AgentStart));
    assert!(
        matches!(next_event(&mut rx).await, EngineOutput::Event(PiEvent::ToolStart { tool, .. }) if tool == "bash")
    );

    // U+2028 inside a JSON string must not split the record.
    let EngineOutput::Event(PiEvent::ToolEnd { result, .. }) = next_event(&mut rx).await else { panic!() };
    assert!(tower_pi::result_text(&result).contains('\u{2028}'));

    let EngineOutput::Event(PiEvent::UiRequest(req)) = next_event(&mut rx).await else { panic!() };
    assert_eq!(req.options, ["A", "B"]);
    engine.answer(&req.id, &UiAnswer::Value("B".into())).unwrap();

    let EngineOutput::Event(PiEvent::MessageEnd { text, .. }) = next_event(&mut rx).await else { panic!() };
    assert_eq!(text, "picked B");
    assert_eq!(next_event(&mut rx).await, EngineOutput::Event(PiEvent::AgentSettled { aborted: false }));

    engine.shutdown(Duration::from_secs(2)).await;
    let EngineOutput::Exited { code, stderr_tail } = next_event(&mut rx).await else { panic!() };
    assert_eq!(code, Some(0));
    assert!(stderr_tail.contains("fake pi exiting"));
}

#[tokio::test]
async fn rejected_commands_and_bad_lines_are_reported() {
    let (engine, mut rx) = Engine::spawn(&config()).unwrap();
    let err = engine.request(serde_json::json!({"type": "nope"})).await.unwrap_err();
    assert!(matches!(err, EngineError::Rejected { .. }));

    let _ = tokio::time::timeout(Duration::from_millis(200), engine.request(serde_json::json!({"type": "bad"}))).await;
    assert!(matches!(next_event(&mut rx).await, EngineOutput::ProtocolError(_)));
    engine.shutdown(Duration::from_secs(2)).await;
}

#[tokio::test]
async fn missing_program_fails_to_spawn() {
    let mut cfg = config();
    cfg.program = PathBuf::from("/nonexistent/pi");
    assert!(matches!(Engine::spawn(&cfg), Err(EngineError::Spawn(_))));
}

#[test]
fn only_gated_tools_are_enabled() {
    let args = config().args();
    let at = args.iter().position(|a| a == "--tools").expect("an explicit tool allowlist");
    assert_eq!(args[at + 1], "read,bash,edit,write,ask_user,log,submit");
    assert!(args.iter().any(|a| a == "--no-mcp"), "MCP tools would run outside the sandbox");
    assert!(args.iter().any(|a| a == "--no-approve"), "a repository's own Pi resources are not trusted");
}
