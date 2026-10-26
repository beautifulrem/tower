//! Pi RPC records (`docs/rpc.md`, `docs/json.md`, `docs/rpc-extension-ui.md`
//! in the Pi repository). Only the fields Tower acts on are typed; everything
//! else is kept as raw JSON so newer Pi versions do not break parsing.

use serde::Deserialize;
use serde_json::Value;

/// A record read from Pi's stdout.
#[derive(Debug, Clone, PartialEq)]
pub enum Record {
    Response(Response),
    Event(PiEvent),
}

#[derive(Debug, Clone, PartialEq)]
pub struct Response {
    pub id: Option<String>,
    pub command: String,
    pub success: bool,
    pub data: Value,
    pub error: Option<String>,
}

/// Session events Tower consumes.
#[derive(Debug, Clone, PartialEq)]
pub enum PiEvent {
    AgentStart,
    /// One low-level run ended; more work may follow.
    AgentEnd { will_retry: bool },
    /// Pi will not continue on its own.
    AgentSettled { aborted: bool },
    TurnStart,
    TurnEnd,
    /// A streamed assistant text fragment.
    TextDelta { delta: String },
    /// A finished message. `role` is `user`, `assistant` or `toolResult`.
    MessageEnd { role: String, text: String, stop_reason: Option<String>, error: Option<String> },
    ToolStart { call_id: String, tool: String, args: Value },
    ToolEnd { call_id: String, tool: String, result: Value, is_error: bool },
    CompactionStart,
    CompactionEnd,
    RetryStart { attempt: u32, max_attempts: u32, error: String },
    RetryEnd { success: bool },
    UiRequest(UiRequest),
    ExtensionError { extension: String, event: String, error: String },
    /// Anything else, kept for the trace.
    Other { kind: String, raw: Value },
}

/// An extension UI request. Dialogs (`select`, `confirm`, `input`, `editor`)
/// block the extension until answered; the rest are fire-and-forget.
#[derive(Debug, Clone, PartialEq, Deserialize)]
pub struct UiRequest {
    pub id: String,
    pub method: String,
    #[serde(default)]
    pub title: Option<String>,
    #[serde(default)]
    pub message: Option<String>,
    #[serde(default)]
    pub options: Vec<String>,
    #[serde(default)]
    pub placeholder: Option<String>,
    #[serde(default)]
    pub prefill: Option<String>,
    #[serde(default)]
    pub timeout: Option<u64>,
    #[serde(default, rename = "notifyType")]
    pub notify_type: Option<String>,
    #[serde(default, rename = "statusKey")]
    pub status_key: Option<String>,
    #[serde(default, rename = "statusText")]
    pub status_text: Option<String>,
}

impl UiRequest {
    pub fn is_dialog(&self) -> bool {
        matches!(self.method.as_str(), "select" | "confirm" | "input" | "editor")
    }
}

/// The answer to a dialog.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum UiAnswer {
    Value(String),
    Confirmed(bool),
    Cancelled,
}

impl UiAnswer {
    pub fn to_record(&self, id: &str) -> Value {
        match self {
            Self::Value(v) => serde_json::json!({"type": "extension_ui_response", "id": id, "value": v}),
            Self::Confirmed(c) => serde_json::json!({"type": "extension_ui_response", "id": id, "confirmed": c}),
            Self::Cancelled => serde_json::json!({"type": "extension_ui_response", "id": id, "cancelled": true}),
        }
    }
}

fn str_field(v: &Value, k: &str) -> String {
    v.get(k).and_then(Value::as_str).unwrap_or_default().to_string()
}

/// Concatenates the text blocks of a message's content (string or array).
pub fn message_text(message: &Value) -> String {
    match message.get("content") {
        Some(Value::String(s)) => s.clone(),
        Some(Value::Array(blocks)) => blocks
            .iter()
            .filter(|b| b.get("type").and_then(Value::as_str) == Some("text"))
            .filter_map(|b| b.get("text").and_then(Value::as_str))
            .collect::<Vec<_>>()
            .join("\n"),
        _ => String::new(),
    }
}

/// Text of a tool result (`{content: [...], details}`).
pub fn result_text(result: &Value) -> String {
    message_text(result)
}

pub fn parse_record(line: &str) -> Result<Record, serde_json::Error> {
    let v: Value = serde_json::from_str(line)?;
    let kind = str_field(&v, "type");
    Ok(match kind.as_str() {
        "response" => Record::Response(Response {
            id: v.get("id").and_then(Value::as_str).map(str::to_owned),
            command: str_field(&v, "command"),
            success: v.get("success").and_then(Value::as_bool).unwrap_or(false),
            data: v.get("data").cloned().unwrap_or(Value::Null),
            error: v.get("error").and_then(Value::as_str).map(str::to_owned),
        }),
        "agent_start" => Record::Event(PiEvent::AgentStart),
        "agent_end" => Record::Event(PiEvent::AgentEnd {
            will_retry: v.get("willRetry").and_then(Value::as_bool).unwrap_or(false),
        }),
        "agent_settled" => Record::Event(PiEvent::AgentSettled {
            aborted: v.get("aborted").and_then(Value::as_bool).unwrap_or(false),
        }),
        "turn_start" => Record::Event(PiEvent::TurnStart),
        "turn_end" => Record::Event(PiEvent::TurnEnd),
        "message_update" => {
            let ev = v.get("assistantMessageEvent").cloned().unwrap_or(Value::Null);
            if ev.get("type").and_then(Value::as_str) == Some("text_delta") {
                Record::Event(PiEvent::TextDelta { delta: str_field(&ev, "delta") })
            } else {
                Record::Event(PiEvent::Other { kind, raw: Value::Null })
            }
        }
        "message_end" => {
            let m = v.get("message").cloned().unwrap_or(Value::Null);
            Record::Event(PiEvent::MessageEnd {
                role: str_field(&m, "role"),
                text: message_text(&m),
                stop_reason: m.get("stopReason").and_then(Value::as_str).map(str::to_owned),
                error: m.get("errorMessage").and_then(Value::as_str).map(str::to_owned),
            })
        }
        "tool_execution_start" => Record::Event(PiEvent::ToolStart {
            call_id: str_field(&v, "toolCallId"),
            tool: str_field(&v, "toolName"),
            args: v.get("args").cloned().unwrap_or(Value::Null),
        }),
        "tool_execution_end" => Record::Event(PiEvent::ToolEnd {
            call_id: str_field(&v, "toolCallId"),
            tool: str_field(&v, "toolName"),
            result: v.get("result").cloned().unwrap_or(Value::Null),
            is_error: v.get("isError").and_then(Value::as_bool).unwrap_or(false),
        }),
        "compaction_start" => Record::Event(PiEvent::CompactionStart),
        "compaction_end" => Record::Event(PiEvent::CompactionEnd),
        "auto_retry_start" => Record::Event(PiEvent::RetryStart {
            attempt: v.get("attempt").and_then(Value::as_u64).unwrap_or(0) as u32,
            max_attempts: v.get("maxAttempts").and_then(Value::as_u64).unwrap_or(0) as u32,
            error: str_field(&v, "errorMessage"),
        }),
        "auto_retry_end" => Record::Event(PiEvent::RetryEnd {
            success: v.get("success").and_then(Value::as_bool).unwrap_or(false),
        }),
        "extension_ui_request" => Record::Event(PiEvent::UiRequest(serde_json::from_value(v)?)),
        "extension_error" => Record::Event(PiEvent::ExtensionError {
            extension: str_field(&v, "extensionPath"),
            event: str_field(&v, "event"),
            error: str_field(&v, "error"),
        }),
        _ => Record::Event(PiEvent::Other { kind, raw: v }),
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_responses_and_events() {
        let r = parse_record(r#"{"id":"1","type":"response","command":"prompt","success":true,"data":{"disposition":"started"}}"#)
            .unwrap();
        assert!(matches!(r, Record::Response(Response { success: true, ref command, .. }) if command == "prompt"));

        let e = parse_record(r#"{"type":"tool_execution_start","toolCallId":"c1","toolName":"bash","args":{"command":"ls"}}"#)
            .unwrap();
        assert_eq!(
            e,
            Record::Event(PiEvent::ToolStart {
                call_id: "c1".into(),
                tool: "bash".into(),
                args: serde_json::json!({"command": "ls"})
            })
        );
    }

    #[test]
    fn message_text_joins_text_blocks_only() {
        let m = serde_json::json!({"role":"assistant","content":[
            {"type":"thinking","thinking":"hmm"},
            {"type":"text","text":"a"},
            {"type":"toolCall","id":"x"},
            {"type":"text","text":"b"}
        ]});
        assert_eq!(message_text(&m), "a\nb");
    }

    #[test]
    fn ui_requests_parse_with_camel_case_fields() {
        let e = parse_record(
            r#"{"type":"extension_ui_request","id":"u1","method":"select","title":"Q","options":["A","B"],"timeout":1000}"#,
        )
        .unwrap();
        let Record::Event(PiEvent::UiRequest(req)) = e else { panic!() };
        assert!(req.is_dialog());
        assert_eq!(req.options, ["A", "B"]);
        assert_eq!(UiAnswer::Value("A".into()).to_record("u1")["value"], "A");
    }

    #[test]
    fn unknown_records_are_kept() {
        let e = parse_record(r#"{"type":"queue_update","steering":[],"followUp":[]}"#).unwrap();
        assert!(matches!(e, Record::Event(PiEvent::Other { ref kind, .. }) if kind == "queue_update"));
    }
}
