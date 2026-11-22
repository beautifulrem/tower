//! A `look` criterion's browser session over the Chrome DevTools Protocol:
//! enables `Runtime` and `Log` domains to capture runtime exceptions and
//! console errors as structured facts, opens the page, runs optional
//! interaction steps, and captures desktop (1280x800) plus optional mobile
//! (390x844) PNG screenshots. Synchronous; run off the async runtime.

use std::io::ErrorKind;
use std::net::TcpStream;
use std::path::Path;
use std::time::{Duration, Instant};

use serde_json::{Value, json};
use tower_core::contract::LookStep;
use tungstenite::{Message, WebSocket};

use crate::look::Viewport;

const MAX_CONSOLE_ERRORS: usize = 50;
const MAX_ERROR_LEN: usize = 500;

/// Options controlling viewports and optional mobile screenshot capture.
#[derive(Debug, Clone, Copy)]
pub(crate) struct DriveOptions<'a> {
    pub desktop: Viewport,
    pub mobile: Option<(&'a Path, Viewport)>,
}

/// Structured result returned by [`drive`].
#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) struct DriveResult {
    pub console_errors: Vec<String>,
    pub mobile_written: bool,
}

struct Session {
    ws: WebSocket<TcpStream>,
    next: u64,
    session: Option<String>,
    deadline: Instant,
    console_errors: Vec<String>,
}

impl Session {
    fn record_event(&mut self, v: &Value) {
        if let Some(msg) = parse_cdp_error_event(v)
            && self.console_errors.len() < MAX_CONSOLE_ERRORS
            && !self.console_errors.contains(&msg)
        {
            self.console_errors.push(msg);
        }
    }

    fn call(&mut self, method: &str, params: Value) -> Result<Value, String> {
        self.next += 1;
        let id = self.next;
        let mut msg = json!({ "id": id, "method": method, "params": params });
        if let Some(s) = &self.session {
            msg["sessionId"] = json!(s);
        }
        self.ws.send(Message::Text(msg.to_string().into())).map_err(|e| e.to_string())?;
        loop {
            if Instant::now() > self.deadline {
                return Err(format!("the browser did not answer {method} in time"));
            }
            let m = match self.ws.read() {
                Ok(m) => m,
                Err(tungstenite::Error::Io(e)) if matches!(e.kind(), ErrorKind::WouldBlock | ErrorKind::TimedOut) => {
                    continue;
                }
                Err(e) => return Err(e.to_string()),
            };
            let Message::Text(text) = m else { continue };
            if std::env::var_os("TOWER_CDP_DEBUG").is_some() {
                eprintln!("CDP {method} <- {}", &text.as_str()[..text.len().min(300)]);
            }
            let v: Value = serde_json::from_str(text.as_str()).map_err(|e| e.to_string())?;
            if v.get("id").and_then(Value::as_u64) != Some(id) {
                self.record_event(&v);
                continue;
            }
            if let Some(err) = v.get("error") {
                return Err(format!("{method}: {}", err.get("message").and_then(Value::as_str).unwrap_or("error")));
            }
            return Ok(v.get("result").cloned().unwrap_or(Value::Null));
        }
    }

    /// Reads any pending CDP events for `duration` (e.g. while letting paint settle).
    fn drain_events(&mut self, duration: Duration) {
        let prev = self.ws.get_ref().read_timeout().ok().flatten();
        let _ = self.ws.get_ref().set_read_timeout(Some(Duration::from_millis(40)));
        let until = Instant::now() + duration;
        while Instant::now() < until && Instant::now() < self.deadline {
            match self.ws.read() {
                Ok(Message::Text(text)) => {
                    if let Ok(v) = serde_json::from_str::<Value>(text.as_str()) {
                        self.record_event(&v);
                    }
                }
                Ok(_) => {}
                Err(tungstenite::Error::Io(e)) if matches!(e.kind(), ErrorKind::WouldBlock | ErrorKind::TimedOut) => {}
                Err(_) => break,
            }
        }
        let _ = self.ws.get_ref().set_read_timeout(prev);
    }

    /// Runs JavaScript in the page; its exception, if any, as the error.
    fn eval(&mut self, expression: &str) -> Result<Value, String> {
        let r = self.call(
            "Runtime.evaluate",
            json!({ "expression": expression, "returnByValue": true, "awaitPromise": true }),
        )?;
        if let Some(ex) = r.get("exceptionDetails") {
            let text = ex
                .pointer("/exception/description")
                .or_else(|| ex.get("text"))
                .and_then(Value::as_str)
                .unwrap_or("the step failed");
            return Err(text.lines().next().unwrap_or(text).to_string());
        }
        Ok(r.pointer("/result/value").cloned().unwrap_or(Value::Null))
    }

    fn wait_until(&mut self, expression: &str, what: &str) -> Result<(), String> {
        loop {
            // Leave room for the last answer, so the error names what was awaited.
            if Instant::now() + Duration::from_secs(2) > self.deadline {
                return Err(format!("{what} did not happen in time"));
            }
            if self.eval(expression)? == Value::Bool(true) {
                return Ok(());
            }
            self.drain_events(Duration::from_millis(100));
        }
    }

    fn set_viewport(&mut self, vp: Viewport) -> Result<(), String> {
        self.call(
            "Emulation.setDeviceMetricsOverride",
            json!({
                "width": vp.width,
                "height": vp.height,
                "deviceScaleFactor": vp.device_scale_factor,
                "mobile": vp.mobile,
            }),
        )?;
        Ok(())
    }

    fn capture_png(&mut self, out: &Path) -> Result<(), String> {
        let shot = self.call("Page.captureScreenshot", json!({ "format": "png" }))?;
        let data = shot.get("data").and_then(Value::as_str).ok_or("no picture")?;
        if let Some(parent) = out.parent() {
            let _ = std::fs::create_dir_all(parent);
        }
        std::fs::write(out, decode_base64(data).ok_or("the picture was not readable")?).map_err(|e| e.to_string())
    }
}

/// Extracts a concise runtime/console error fact from a CDP event frame.
/// Captures `Runtime.exceptionThrown`, `Runtime.consoleAPICalled` (`error`/`assert`),
/// and `Log.entryAdded` (`level == "error"`).
pub(crate) fn parse_cdp_error_event(v: &Value) -> Option<String> {
    let method = v.get("method").and_then(Value::as_str)?;
    let params = v.get("params")?;
    let raw = match method {
        "Runtime.exceptionThrown" => {
            let details = params.get("exceptionDetails")?;
            let msg = details
                .pointer("/exception/description")
                .or_else(|| details.pointer("/exception/value"))
                .or_else(|| details.get("text"))
                .and_then(Value::as_str)
                .unwrap_or("Uncaught exception");
            let first = msg.lines().next().unwrap_or(msg).trim();
            let loc = format_location(details.get("url").and_then(Value::as_str), details.get("lineNumber"));
            match loc {
                Some(l) => format!("Uncaught exception: {first} ({l})"),
                None => format!("Uncaught exception: {first}"),
            }
        }
        "Runtime.consoleAPICalled" => {
            let kind = params.get("type").and_then(Value::as_str)?;
            if !matches!(kind, "error" | "assert") {
                return None;
            }
            let args = params.get("args").and_then(Value::as_array)?;
            let parts: Vec<String> = args.iter().filter_map(format_remote_arg).collect();
            if parts.is_empty() { format!("console.{kind}") } else { format!("console.{kind}: {}", parts.join(" ")) }
        }
        "Log.entryAdded" => {
            let entry = params.get("entry")?;
            if entry.get("level").and_then(Value::as_str) != Some("error") {
                return None;
            }
            let text = entry.get("text").and_then(Value::as_str)?.trim();
            if text.is_empty() {
                return None;
            }
            let loc = format_location(entry.get("url").and_then(Value::as_str), entry.get("lineNumber"));
            match loc {
                Some(l) => format!("{text} ({l})"),
                None => text.to_string(),
            }
        }
        _ => return None,
    };
    Some(truncate_chars(&raw, MAX_ERROR_LEN))
}

fn format_remote_arg(arg: &Value) -> Option<String> {
    if let Some(s) = arg.get("description").and_then(Value::as_str) {
        return Some(s.lines().next().unwrap_or(s).trim().to_string());
    }
    if let Some(v) = arg.get("value") {
        return Some(match v {
            Value::String(s) => s.clone(),
            other => other.to_string(),
        });
    }
    if let Some(s) = arg.get("unserializableValue").and_then(Value::as_str) {
        return Some(s.to_string());
    }
    arg.get("type").and_then(Value::as_str).map(String::from)
}

fn format_location(url: Option<&str>, line: Option<&Value>) -> Option<String> {
    let u = url.map(str::trim).filter(|s| !s.is_empty())?;
    match line.and_then(Value::as_u64) {
        Some(n) => Some(format!("{u}:{}", n + 1)),
        None => Some(u.to_string()),
    }
}

fn truncate_chars(s: &str, max_chars: usize) -> String {
    let mut out: String = s.chars().take(max_chars).collect();
    if s.chars().count() > max_chars {
        out.push('…');
    }
    out
}

/// Key names to the virtual key codes the protocol wants.
fn key_code(key: &str) -> Option<(u32, &'static str)> {
    Some(match key {
        "Enter" => (13, "\r"),
        "Escape" => (27, ""),
        "Tab" => (9, "\t"),
        "Backspace" => (8, ""),
        "ArrowLeft" => (37, ""),
        "ArrowUp" => (38, ""),
        "ArrowRight" => (39, ""),
        "ArrowDown" => (40, ""),
        " " | "Space" => (32, " "),
        _ => return None,
    })
}

/// Opens `url` in the browser behind `ws_url`, captures console/runtime errors,
/// performs `steps`, writes the desktop PNG to `out`, and optionally captures
/// a mobile viewport PNG in the same session.
pub(crate) fn drive(
    ws_url: &str,
    url: &str,
    steps: &[LookStep],
    out: &Path,
    timeout: Duration,
    options: DriveOptions<'_>,
) -> Result<DriveResult, String> {
    let host = ws_url.strip_prefix("ws://").and_then(|r| r.split('/').next()).ok_or("no DevTools address")?;
    let stream = TcpStream::connect(host).map_err(|e| e.to_string())?;
    // A blocking handshake (a short timeout interrupts it on a busy
    // machine), then short reads so the deadline is checked between them.
    stream.set_read_timeout(Some(timeout)).map_err(|e| e.to_string())?;
    let (ws, _) = tungstenite::client(ws_url, stream).map_err(|e| e.to_string())?;
    ws.get_ref().set_read_timeout(Some(Duration::from_millis(500))).map_err(|e| e.to_string())?;
    let mut s = Session { ws, next: 0, session: None, deadline: Instant::now() + timeout, console_errors: Vec::new() };
    let target = s.call("Target.createTarget", json!({ "url": "about:blank" }))?;
    let target_id = target.get("targetId").and_then(Value::as_str).ok_or("no page")?.to_string();
    let attached = s.call("Target.attachToTarget", json!({ "targetId": target_id, "flatten": true }))?;
    s.session = attached.get("sessionId").and_then(Value::as_str).map(String::from);
    // Subscribe to runtime exceptions and console/log error streams before navigating.
    let _ = s.call("Runtime.enable", json!({}));
    let _ = s.call("Log.enable", json!({}));
    s.set_viewport(options.desktop)?;
    s.call("Page.navigate", json!({ "url": url }))?;
    s.wait_until("document.readyState === 'complete'", "the page loading")?;
    for step in steps {
        match step {
            LookStep::Click(sel) => {
                let sel = serde_json::to_string(sel).unwrap_or_default();
                s.eval(&format!(
                    "(() => {{ const e = document.querySelector({sel}); if (!e) throw new Error('nothing matches ' + {sel}); e.scrollIntoView({{block: 'center'}}); e.click(); }})()"
                ))?;
            }
            LookStep::Type(sel, text) => {
                let (sel, text) =
                    (serde_json::to_string(sel).unwrap_or_default(), serde_json::to_string(text).unwrap_or_default());
                s.eval(&format!(
                    "(() => {{ const e = document.querySelector({sel}); if (!e) throw new Error('nothing matches ' + {sel}); e.focus(); \
                     const proto = e instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype; \
                     Object.getOwnPropertyDescriptor(proto, 'value').set.call(e, {text}); \
                     e.dispatchEvent(new Event('input', {{bubbles: true}})); e.dispatchEvent(new Event('change', {{bubbles: true}})); }})()"
                ))?;
            }
            LookStep::Press(key) => {
                let (code, text) = key_code(key).ok_or_else(|| format!("unknown key {key}"))?;
                for kind in ["keyDown", "keyUp"] {
                    s.call(
                        "Input.dispatchKeyEvent",
                        json!({ "type": kind, "key": key, "windowsVirtualKeyCode": code, "text": if kind == "keyDown" { text } else { "" } }),
                    )?;
                }
            }
            LookStep::Wait(ms) => s.drain_events(Duration::from_millis(u64::from(*ms))),
            LookStep::WaitFor(sel) => {
                let sel_js = serde_json::to_string(sel).unwrap_or_default();
                s.wait_until(&format!("document.querySelector({sel_js}) !== null"), &format!("`{sel}` appearing"))?;
            }
        }
    }
    // Let the last step's effects paint and drain any late console/runtime errors.
    s.drain_events(Duration::from_millis(300));
    s.capture_png(out)?;

    let mut mobile_written = false;
    if let Some((mobile_out, mobile_vp)) = options.mobile {
        s.set_viewport(mobile_vp)?;
        s.drain_events(Duration::from_millis(250));
        s.capture_png(mobile_out)?;
        mobile_written = true;
    }

    s.session = None;
    let _ = s.call("Browser.close", json!({}));
    Ok(DriveResult { console_errors: s.console_errors, mobile_written })
}

fn decode_base64(s: &str) -> Option<Vec<u8>> {
    let val = |c: u8| -> Option<u32> {
        Some(match c {
            b'A'..=b'Z' => c - b'A',
            b'a'..=b'z' => c - b'a' + 26,
            b'0'..=b'9' => c - b'0' + 52,
            b'+' => 62,
            b'/' => 63,
            _ => return None,
        } as u32)
    };
    let bytes: Vec<u8> = s.bytes().filter(|c| !c.is_ascii_whitespace() && *c != b'=').collect();
    let mut out = Vec::with_capacity(bytes.len() * 3 / 4);
    for chunk in bytes.chunks(4) {
        let mut n = 0u32;
        for (i, c) in chunk.iter().enumerate() {
            n |= val(*c)? << (18 - 6 * i);
        }
        out.push((n >> 16) as u8);
        if chunk.len() > 2 {
            out.push((n >> 8) as u8);
        }
        if chunk.len() > 3 {
            out.push(n as u8);
        }
    }
    Some(out)
}

#[cfg(test)]
mod tests {
    use std::net::TcpListener;

    use super::*;

    #[test]
    fn base64_round_trips() {
        assert_eq!(decode_base64("aGVsbG8gd29ybGQ=").unwrap(), b"hello world");
        assert_eq!(decode_base64("iVBORw==").unwrap(), [0x89, b'P', b'N', b'G']);
    }

    #[test]
    fn parses_cdp_runtime_console_and_log_errors() {
        let exc = json!({
            "method": "Runtime.exceptionThrown",
            "params": {
                "exceptionDetails": {
                    "text": "Uncaught",
                    "url": "http://localhost:3000/app.js",
                    "lineNumber": 41,
                    "exception": { "description": "TypeError: Cannot read properties of undefined\n    at render" }
                }
            }
        });
        assert_eq!(
            parse_cdp_error_event(&exc).as_deref(),
            Some(
                "Uncaught exception: TypeError: Cannot read properties of undefined (http://localhost:3000/app.js:42)"
            )
        );

        let console_err = json!({
            "method": "Runtime.consoleAPICalled",
            "params": {
                "type": "error",
                "args": [{ "value": "Hydration mismatch" }, { "value": 404 }]
            }
        });
        assert_eq!(parse_cdp_error_event(&console_err).as_deref(), Some("console.error: Hydration mismatch 404"));

        let console_log = json!({
            "method": "Runtime.consoleAPICalled",
            "params": { "type": "log", "args": [{ "value": "ignored" }] }
        });
        assert!(parse_cdp_error_event(&console_log).is_none());

        let log_err = json!({
            "method": "Log.entryAdded",
            "params": {
                "entry": { "level": "error", "text": "Failed to load resource: 500", "url": "http://localhost:3000/api" }
            }
        });
        assert_eq!(
            parse_cdp_error_event(&log_err).as_deref(),
            Some("Failed to load resource: 500 (http://localhost:3000/api)")
        );

        let log_warn = json!({
            "method": "Log.entryAdded",
            "params": { "entry": { "level": "warning", "text": "deprecated" } }
        });
        assert!(parse_cdp_error_event(&log_warn).is_none());
    }

    #[test]
    fn mock_cdp_captures_console_errors_and_dual_viewports() {
        let listener = TcpListener::bind("127.0.0.1:0").unwrap();
        let addr = listener.local_addr().unwrap();
        let server = std::thread::spawn(move || {
            let (stream, _) = listener.accept().unwrap();
            let mut ws = tungstenite::accept(stream).unwrap();
            let mut viewports: Vec<(u64, u64, bool)> = Vec::new();
            let mut enabled_runtime = false;
            let mut enabled_log = false;
            while let Ok(Message::Text(txt)) = ws.read() {
                let req: Value = serde_json::from_str(txt.as_str()).unwrap();
                let id = req["id"].as_u64().unwrap();
                let method = req["method"].as_str().unwrap();
                match method {
                    "Target.createTarget" => {
                        ws.send(Message::Text(json!({"id": id, "result": {"targetId": "t1"}}).to_string().into()))
                            .unwrap();
                    }
                    "Target.attachToTarget" => {
                        ws.send(Message::Text(json!({"id": id, "result": {"sessionId": "s1"}}).to_string().into()))
                            .unwrap();
                    }
                    "Runtime.enable" => {
                        enabled_runtime = true;
                        ws.send(Message::Text(json!({"id": id, "result": {}}).to_string().into())).unwrap();
                    }
                    "Log.enable" => {
                        enabled_log = true;
                        ws.send(Message::Text(json!({"id": id, "result": {}}).to_string().into())).unwrap();
                    }
                    "Emulation.setDeviceMetricsOverride" => {
                        let p = &req["params"];
                        viewports.push((
                            p["width"].as_u64().unwrap(),
                            p["height"].as_u64().unwrap(),
                            p["mobile"].as_bool().unwrap(),
                        ));
                        ws.send(Message::Text(json!({"id": id, "result": {}}).to_string().into())).unwrap();
                    }
                    "Page.navigate" => {
                        // Emit error events + one non-error event right before answering.
                        for ev in [
                            json!({
                                "method": "Runtime.exceptionThrown",
                                "params": { "exceptionDetails": { "text": "Uncaught ReferenceError: boom" } }
                            }),
                            json!({
                                "method": "Runtime.consoleAPICalled",
                                "params": { "type": "error", "args": [{ "value": "bad state" }] }
                            }),
                            json!({
                                "method": "Runtime.consoleAPICalled",
                                "params": { "type": "log", "args": [{ "value": "normal log" }] }
                            }),
                            json!({
                                "method": "Log.entryAdded",
                                "params": { "entry": { "level": "error", "text": "500 Internal Server Error" } }
                            }),
                        ] {
                            ws.send(Message::Text(ev.to_string().into())).unwrap();
                        }
                        ws.send(Message::Text(json!({"id": id, "result": {}}).to_string().into())).unwrap();
                    }
                    "Runtime.evaluate" => {
                        ws.send(Message::Text(
                            json!({"id": id, "result": {"result": {"value": true}}}).to_string().into(),
                        ))
                        .unwrap();
                    }
                    "Page.captureScreenshot" => {
                        // Valid minimal PNG header bytes encoded in base64: iVBORw==
                        ws.send(Message::Text(json!({"id": id, "result": {"data": "iVBORw=="}}).to_string().into()))
                            .unwrap();
                    }
                    "Browser.close" => {
                        ws.send(Message::Text(json!({"id": id, "result": {}}).to_string().into())).unwrap();
                        break;
                    }
                    _ => {
                        ws.send(Message::Text(json!({"id": id, "result": {}}).to_string().into())).unwrap();
                    }
                }
            }
            (enabled_runtime, enabled_log, viewports)
        });

        let tmp = tempfile::tempdir().unwrap();
        let desktop_png = tmp.path().join("shot.png");
        let mobile_png = tmp.path().join("shot-mobile.png");
        let ws_url = format!("ws://{addr}/devtools/browser/test");
        let res = drive(
            &ws_url,
            "http://127.0.0.1:3000/",
            &[],
            &desktop_png,
            Duration::from_secs(5),
            DriveOptions { desktop: Viewport::DESKTOP, mobile: Some((&mobile_png, Viewport::MOBILE)) },
        )
        .unwrap();

        let (enabled_runtime, enabled_log, viewports) = server.join().unwrap();
        assert!(enabled_runtime && enabled_log, "Runtime and Log domains must be enabled");
        assert_eq!(viewports, vec![(1280, 800, false), (390, 844, true)]);
        assert!(res.mobile_written);
        assert_eq!(std::fs::read(&desktop_png).unwrap(), [0x89, b'P', b'N', b'G']);
        assert_eq!(std::fs::read(&mobile_png).unwrap(), [0x89, b'P', b'N', b'G']);
        assert_eq!(
            res.console_errors,
            vec![
                "Uncaught exception: Uncaught ReferenceError: boom",
                "console.error: bad state",
                "500 Internal Server Error",
            ]
        );
    }
}
