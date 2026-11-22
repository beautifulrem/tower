//! Pi RPC records (`docs/rpc.md`, `docs/json.md`, `docs/rpc-extension-ui.md`
//! in the Pi repository). Only the fields Tower acts on are typed; everything
//! else is kept as raw JSON so newer Pi versions do not break parsing.

use std::path::Path;

use serde::{Deserialize, Serialize};
use serde_json::Value;

/// Maximum image attachment size encoded inline for multimodal prompts (10 MiB).
pub const MAX_IMAGE_ATTACHMENT_BYTES: usize = 10 * 1024 * 1024;

/// An image attached to a prompt, steer, or follow-up message.
///
/// Sent to Pi RPC and Tower's ACP bridge in `images: [{ type: "image", data, mimeType, ... }]`.
/// `path`, when provided, points to the copy stored in the goal's private read-allowed
/// attachments folder so both multimodal engines and sandboxed `read` tools stay inside S2.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct ImageAttachment {
    /// MIME type (`image/png`, `image/jpeg`, `image/webp`, `image/gif`).
    #[serde(rename = "mimeType")]
    pub mime_type: String,
    /// RFC 4648 base64-encoded image bytes (without a `data:` URI prefix).
    pub data: String,
    /// Optional path inside the goal's private read-allowed folder.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub path: Option<String>,
    /// Optional human-readable label or filename.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub label: Option<String>,
}

impl ImageAttachment {
    /// Loads an image file from disk, validates its MIME type and size cap, and base64-encodes it.
    pub fn from_file(path: &Path, label: Option<String>) -> std::io::Result<Self> {
        let meta = std::fs::metadata(path)?;
        if !meta.is_file() {
            return Err(std::io::Error::new(std::io::ErrorKind::InvalidInput, "attachment is not a regular file"));
        }
        if meta.len() as usize > MAX_IMAGE_ATTACHMENT_BYTES {
            return Err(std::io::Error::new(
                std::io::ErrorKind::InvalidData,
                format!("image attachment exceeds {} bytes", MAX_IMAGE_ATTACHMENT_BYTES),
            ));
        }
        let bytes = std::fs::read(path)?;
        let mime_type = detect_image_mime(&bytes, path).ok_or_else(|| {
            std::io::Error::new(std::io::ErrorKind::InvalidData, "unsupported image attachment format")
        })?;
        Ok(Self {
            mime_type: mime_type.into(),
            data: encode_base64(&bytes),
            path: Some(path.display().to_string()),
            label,
        })
    }

    /// Formats this attachment as a Pi RPC / ACP image block object.
    pub fn to_rpc_value(&self) -> Value {
        let mut obj = serde_json::json!({
            "type": "image",
            "mimeType": self.mime_type,
            "data": self.data,
        });
        if let Some(p) = &self.path {
            obj["path"] = Value::String(p.clone());
        }
        if let Some(l) = &self.label {
            obj["label"] = Value::String(l.clone());
        }
        obj
    }
}

/// Detects an allowed image MIME type from magic bytes, falling back to file extension.
pub fn detect_image_mime(bytes: &[u8], path: &Path) -> Option<&'static str> {
    if bytes.starts_with(&[0x89, b'P', b'N', b'G', 0x0d, 0x0a, 0x1a, 0x0a]) {
        return Some("image/png");
    }
    if bytes.starts_with(&[0xff, 0xd8, 0xff]) {
        return Some("image/jpeg");
    }
    if bytes.starts_with(b"GIF87a") || bytes.starts_with(b"GIF89a") {
        return Some("image/gif");
    }
    if bytes.len() >= 12 && &bytes[0..4] == b"RIFF" && &bytes[8..12] == b"WEBP" {
        return Some("image/webp");
    }
    match path.extension().and_then(|e| e.to_str()).map(|s| s.to_ascii_lowercase()).as_deref() {
        Some("png") => Some("image/png"),
        Some("jpg" | "jpeg") => Some("image/jpeg"),
        Some("gif") => Some("image/gif"),
        Some("webp") => Some("image/webp"),
        _ => None,
    }
}

/// Zero-dependency RFC 4648 standard base64 encoder.
pub fn encode_base64(input: &[u8]) -> String {
    const TABLE: &[u8; 64] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    let mut out = String::with_capacity(input.len().div_ceil(3) * 4);
    for chunk in input.chunks(3) {
        let b0 = u32::from(chunk[0]);
        let b1 = u32::from(chunk.get(1).copied().unwrap_or(0));
        let b2 = u32::from(chunk.get(2).copied().unwrap_or(0));
        let n = (b0 << 16) | (b1 << 8) | b2;
        out.push(TABLE[((n >> 18) & 0x3f) as usize] as char);
        out.push(TABLE[((n >> 12) & 0x3f) as usize] as char);
        if chunk.len() > 1 {
            out.push(TABLE[((n >> 6) & 0x3f) as usize] as char);
        } else {
            out.push('=');
        }
        if chunk.len() > 2 {
            out.push(TABLE[(n & 0x3f) as usize] as char);
        } else {
            out.push('=');
        }
    }
    out
}

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
    AgentEnd {
        will_retry: bool,
    },
    /// Pi will not continue on its own.
    AgentSettled {
        aborted: bool,
    },
    TurnStart,
    TurnEnd,
    /// A streamed assistant text fragment.
    TextDelta {
        delta: String,
    },
    /// A finished message. `role` is `user`, `assistant` or `toolResult`.
    MessageEnd {
        role: String,
        text: String,
        stop_reason: Option<String>,
        error: Option<String>,
    },
    ToolStart {
        call_id: String,
        tool: String,
        args: Value,
    },
    ToolEnd {
        call_id: String,
        tool: String,
        result: Value,
        is_error: bool,
    },
    CompactionStart,
    CompactionEnd,
    RetryStart {
        attempt: u32,
        max_attempts: u32,
        error: String,
    },
    RetryEnd {
        success: bool,
    },
    UiRequest(UiRequest),
    ExtensionError {
        extension: String,
        event: String,
        error: String,
    },
    /// Emitted by Tower's ACP Trust Gate whenever an ACP agent requests
    /// permission for a non-Tower / built-in tool.
    TrustGateDenied {
        engine: String,
        trust_level: String,
        tool: String,
        reason: String,
        attempts: u32,
    },
    /// Anything else, kept for the trace.
    Other {
        kind: String,
        raw: Value,
    },
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
        "agent_settled" => {
            Record::Event(PiEvent::AgentSettled { aborted: v.get("aborted").and_then(Value::as_bool).unwrap_or(false) })
        }
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
        "auto_retry_end" => {
            Record::Event(PiEvent::RetryEnd { success: v.get("success").and_then(Value::as_bool).unwrap_or(false) })
        }
        "extension_ui_request" => Record::Event(PiEvent::UiRequest(serde_json::from_value(v)?)),
        "extension_error" => Record::Event(PiEvent::ExtensionError {
            extension: str_field(&v, "extensionPath"),
            event: str_field(&v, "event"),
            error: str_field(&v, "error"),
        }),
        "tower_trust_gate_denied" => Record::Event(PiEvent::TrustGateDenied {
            engine: str_field(&v, "engine"),
            trust_level: str_field(&v, "trustLevel"),
            tool: str_field(&v, "tool"),
            reason: str_field(&v, "reason"),
            attempts: v.get("attempts").and_then(Value::as_u64).unwrap_or(1) as u32,
        }),
        _ => Record::Event(PiEvent::Other { kind, raw: v }),
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_responses_and_events() {
        let r = parse_record(
            r#"{"id":"1","type":"response","command":"prompt","success":true,"data":{"disposition":"started"}}"#,
        )
        .unwrap();
        assert!(matches!(r, Record::Response(Response { success: true, ref command, .. }) if command == "prompt"));

        let e = parse_record(
            r#"{"type":"tool_execution_start","toolCallId":"c1","toolName":"bash","args":{"command":"ls"}}"#,
        )
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
    fn parses_trust_gate_denied_audit_event() {
        let e = parse_record(
            r#"{"type":"tower_trust_gate_denied","engine":"codex","trustLevel":"restricted_s2","tool":"shell","reason":"built-in forbidden","attempts":2}"#,
        )
        .unwrap();
        assert_eq!(
            e,
            Record::Event(PiEvent::TrustGateDenied {
                engine: "codex".into(),
                trust_level: "restricted_s2".into(),
                tool: "shell".into(),
                reason: "built-in forbidden".into(),
                attempts: 2,
            })
        );
    }

    #[test]
    fn base64_and_image_mime_detection_work() {
        assert_eq!(encode_base64(b""), "");
        assert_eq!(encode_base64(b"f"), "Zg==");
        assert_eq!(encode_base64(b"fo"), "Zm8=");
        assert_eq!(encode_base64(b"foo"), "Zm9v");
        assert_eq!(encode_base64(b"foobar"), "Zm9vYmFy");
        assert_eq!(
            detect_image_mime(&[0x89, b'P', b'N', b'G', 0x0d, 0x0a, 0x1a, 0x0a], Path::new("x.bin")),
            Some("image/png")
        );
        assert_eq!(detect_image_mime(&[0xff, 0xd8, 0xff, 0xe0], Path::new("x")), Some("image/jpeg"));
        assert_eq!(detect_image_mime(b"plain", Path::new("notes.txt")), None);
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
