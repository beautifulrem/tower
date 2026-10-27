//! A `look` criterion's steps, done in the browser before its picture,
//! over the DevTools protocol: open the page, wait for it, click, type,
//! press keys, wait, then capture. Synchronous; run off the async runtime.

use std::io::ErrorKind;
use std::net::TcpStream;
use std::path::Path;
use std::time::{Duration, Instant};

use serde_json::{Value, json};
use tower_core::contract::LookStep;
use tungstenite::{Message, WebSocket};

struct Session {
    ws: WebSocket<TcpStream>,
    next: u64,
    session: Option<String>,
    deadline: Instant,
}

impl Session {
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
                continue; // an event
            }
            if let Some(err) = v.get("error") {
                return Err(format!("{method}: {}", err.get("message").and_then(Value::as_str).unwrap_or("error")));
            }
            return Ok(v.get("result").cloned().unwrap_or(Value::Null));
        }
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
            std::thread::sleep(Duration::from_millis(100));
        }
    }
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

/// Opens `url` in the browser behind `ws_url`, does `steps`, and writes a
/// PNG of the page to `out`.
pub(crate) fn drive(ws_url: &str, url: &str, steps: &[LookStep], out: &Path, timeout: Duration) -> Result<(), String> {
    let host = ws_url.strip_prefix("ws://").and_then(|r| r.split('/').next()).ok_or("no DevTools address")?;
    let stream = TcpStream::connect(host).map_err(|e| e.to_string())?;
    // A blocking handshake (a short timeout interrupts it on a busy
    // machine), then short reads so the deadline is checked between them.
    stream.set_read_timeout(Some(timeout)).map_err(|e| e.to_string())?;
    let (ws, _) = tungstenite::client(ws_url, stream).map_err(|e| e.to_string())?;
    ws.get_ref().set_read_timeout(Some(Duration::from_millis(500))).map_err(|e| e.to_string())?;
    let mut s = Session { ws, next: 0, session: None, deadline: Instant::now() + timeout };
    let target = s.call("Target.createTarget", json!({ "url": "about:blank" }))?;
    let target_id = target.get("targetId").and_then(Value::as_str).ok_or("no page")?.to_string();
    let attached = s.call("Target.attachToTarget", json!({ "targetId": target_id, "flatten": true }))?;
    s.session = attached.get("sessionId").and_then(Value::as_str).map(String::from);
    s.call(
        "Emulation.setDeviceMetricsOverride",
        json!({ "width": 1280, "height": 800, "deviceScaleFactor": 2, "mobile": false }),
    )?;
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
            LookStep::Wait(ms) => std::thread::sleep(Duration::from_millis(u64::from(*ms))),
            LookStep::WaitFor(sel) => {
                let sel_js = serde_json::to_string(sel).unwrap_or_default();
                s.wait_until(&format!("document.querySelector({sel_js}) !== null"), &format!("`{sel}` appearing"))?;
            }
        }
    }
    // Let the last step's effects paint.
    std::thread::sleep(Duration::from_millis(300));
    let shot = s.call("Page.captureScreenshot", json!({ "format": "png" }))?;
    let data = shot.get("data").and_then(Value::as_str).ok_or("no picture")?;
    std::fs::write(out, decode_base64(data).ok_or("the picture was not readable")?).map_err(|e| e.to_string())?;
    s.session = None;
    let _ = s.call("Browser.close", json!({}));
    Ok(())
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
    use super::decode_base64;

    #[test]
    fn base64_round_trips() {
        assert_eq!(decode_base64("aGVsbG8gd29ybGQ=").unwrap(), b"hello world");
        assert_eq!(decode_base64("iVBORw==").unwrap(), [0x89, b'P', b'N', b'G']);
    }
}
