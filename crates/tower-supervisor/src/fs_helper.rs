//! Persistent sandboxed filesystem helper (`docs/18` §18.3 P0.2).
//!
//! Runs once inside a goal's OS sandbox profile (Seatbelt on macOS,
//! `bwrap` + Landlock on Linux) and serves newline-delimited JSON RPC requests
//! over stdin/stdout for `read`, `access`, `write`, `mkdir`, `mime`, and
//! `ping`. This preserves the exact OS kernel enforcement boundary while
//! eliminating the ~15 ms per-call `sandbox-exec` spawn overhead.
//!
//! Security & reliability properties:
//! - Strict 16 MiB file cap (`MAX_FILE_BYTES`) enforced on both reads and writes.
//! - Atomic writes via sibling temporary file + `rename` (with cleanup on any
//!   failure), falling back to direct write for existing symlinks so kernel
//!   symlink-target checks remain intact.
//! - `access` opens the file and attempts a 1-byte read so `file-read-data`
//!   denials are genuinely exercised even on 0-byte files.
//! - Bounded input line reading prevents memory exhaustion on malformed lines.

use std::fs::{File, OpenOptions};
use std::io::{self, BufRead, BufReader, BufWriter, ErrorKind, Read, Write};
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicU64, Ordering};

use serde::{Deserialize, Serialize};

/// CLI flag used to invoke Tower's binary in persistent FS-helper mode.
pub const CLI_FLAG: &str = "--fs-helper";

/// Environment variable naming the helper executable (optional; `sandboxfs.ts`
/// transparently uses it when set or falls back to a sandboxed Node helper).
pub const ENV_FS_HELPER: &str = "TOWER_FS_HELPER";

/// Hard upper bound on any single file read or write (16 MiB).
pub const MAX_FILE_BYTES: usize = 16 * 1024 * 1024;

/// Maximum incoming JSONL frame size (~24 MiB to accommodate 16 MiB base64 + framing).
const MAX_LINE_BYTES: usize = 24 * 1024 * 1024;

static TEMP_SEQ: AtomicU64 = AtomicU64::new(0);

/// Operations supported by the persistent sandboxed FS helper.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum FsOp {
    Read,
    Access,
    Write,
    Mkdir,
    Mime,
    Ping,
}

/// Structured error codes returned by [`FsResponse`].
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum FsErrorCode {
    PermissionDenied,
    NotFound,
    TooLarge,
    InvalidRequest,
    IoError,
}

/// One newline-delimited JSON request sent to the helper over stdin.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct FsRequest {
    pub id: u64,
    pub op: FsOp,
    #[serde(default)]
    pub path: String,
    /// UTF-8 content for `write` when `data_b64` is omitted.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub content: Option<String>,
    /// Base64-encoded bytes for `write` (preserves arbitrary binary data).
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub data_b64: Option<String>,
}

/// One newline-delimited JSON response written by the helper to stdout.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct FsResponse {
    pub id: u64,
    pub ok: bool,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub data_b64: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub mime: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub code: Option<FsErrorCode>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
}

impl FsResponse {
    fn ok(id: u64) -> Self {
        Self { id, ok: true, data_b64: None, mime: None, code: None, error: None }
    }

    fn err(id: u64, code: FsErrorCode, error: impl Into<String>) -> Self {
        Self { id, ok: false, data_b64: None, mime: None, code: Some(code), error: Some(error.into()) }
    }

    fn from_io(id: u64, e: &io::Error) -> Self {
        let code = match e.kind() {
            ErrorKind::PermissionDenied => FsErrorCode::PermissionDenied,
            ErrorKind::NotFound => FsErrorCode::NotFound,
            _ => match e.raw_os_error() {
                Some(1 | 13) => FsErrorCode::PermissionDenied, // EPERM | EACCES
                Some(2) => FsErrorCode::NotFound,              // ENOENT
                _ => FsErrorCode::IoError,
            },
        };
        let msg = match code {
            FsErrorCode::PermissionDenied => "Operation not permitted".to_string(),
            FsErrorCode::NotFound => "No such file or directory".to_string(),
            _ => e.to_string(),
        };
        Self::err(id, code, msg)
    }
}

/// Runs the persistent helper loop reading JSONL requests from stdin and
/// writing flushed JSONL responses to stdout until EOF.
pub fn run_stdio() -> io::Result<()> {
    let stdin = io::stdin();
    let stdout = io::stdout();
    serve(BufReader::new(stdin.lock()), BufWriter::new(stdout.lock()))
}

/// Serves newline-delimited JSON RPC frames from `reader` to `writer` until EOF.
pub fn serve<R: BufRead, W: Write>(mut reader: R, mut writer: W) -> io::Result<()> {
    let mut buf = Vec::new();
    loop {
        buf.clear();
        let n = read_bounded_line(&mut reader, &mut buf, MAX_LINE_BYTES)?;
        if n == 0 {
            break;
        }
        if buf.len() > MAX_LINE_BYTES {
            let resp = FsResponse::err(0, FsErrorCode::TooLarge, "request exceeds maximum frame size");
            write_frame(&mut writer, &resp)?;
            continue;
        }
        let line = match std::str::from_utf8(&buf) {
            Ok(s) => s.trim(),
            Err(_) => {
                let resp = FsResponse::err(0, FsErrorCode::InvalidRequest, "request is not valid UTF-8");
                write_frame(&mut writer, &resp)?;
                continue;
            }
        };
        if line.is_empty() {
            continue;
        }
        let resp = match serde_json::from_str::<FsRequest>(line) {
            Ok(req) => handle_request(&req),
            Err(e) => FsResponse::err(0, FsErrorCode::InvalidRequest, format!("invalid json: {e}")),
        };
        write_frame(&mut writer, &resp)?;
    }
    Ok(())
}

/// Executes a single [`FsRequest`] using normal OS syscalls (confined by
/// whatever sandbox profile this process was started inside).
pub fn handle_request(req: &FsRequest) -> FsResponse {
    match req.op {
        FsOp::Ping => FsResponse::ok(req.id),
        FsOp::Read => op_read(req.id, Path::new(&req.path)),
        FsOp::Access => op_access(req.id, Path::new(&req.path)),
        FsOp::Write => op_write(req),
        FsOp::Mkdir => op_mkdir(req.id, Path::new(&req.path)),
        FsOp::Mime => op_mime(req.id, Path::new(&req.path)),
    }
}

/// Opens `path` for reading if it is a regular file. Opening a FIFO the
/// agent made would wait for a writer for ever, and with it every later
/// request: anything else is refused, checked before opening and again on
/// what was opened.
fn open_regular(path: &Path) -> io::Result<File> {
    let not_regular = || io::Error::other("not a regular file");
    if !std::fs::metadata(path)?.is_file() {
        return Err(not_regular());
    }
    let file = File::open(path)?;
    if !file.metadata()?.is_file() {
        return Err(not_regular());
    }
    Ok(file)
}

fn op_read(id: u64, path: &Path) -> FsResponse {
    if path.as_os_str().is_empty() {
        return FsResponse::err(id, FsErrorCode::InvalidRequest, "path is required");
    }
    let file = match open_regular(path) {
        Ok(f) => f,
        Err(e) => return FsResponse::from_io(id, &e),
    };
    if let Ok(meta) = file.metadata()
        && meta.len() > MAX_FILE_BYTES as u64
    {
        return FsResponse::err(
            id,
            FsErrorCode::TooLarge,
            format!("file exceeds {MAX_FILE_BYTES} byte limit ({} bytes)", meta.len()),
        );
    }
    let mut data = Vec::new();
    let mut limited = file.take((MAX_FILE_BYTES + 1) as u64);
    if let Err(e) = limited.read_to_end(&mut data) {
        return FsResponse::from_io(id, &e);
    }
    if data.len() > MAX_FILE_BYTES {
        return FsResponse::err(id, FsErrorCode::TooLarge, format!("file exceeds {MAX_FILE_BYTES} byte limit"));
    }
    let mut resp = FsResponse::ok(id);
    resp.data_b64 = Some(encode_base64(&data));
    resp
}

fn op_access(id: u64, path: &Path) -> FsResponse {
    if path.as_os_str().is_empty() {
        return FsResponse::err(id, FsErrorCode::InvalidRequest, "path is required");
    }
    let file = match open_regular(path) {
        Ok(f) => f,
        Err(e) => return FsResponse::from_io(id, &e),
    };
    let mut probe = Vec::with_capacity(1);
    match file.take(1).read_to_end(&mut probe) {
        Ok(_) => FsResponse::ok(id),
        Err(e) => FsResponse::from_io(id, &e),
    }
}

fn op_write(req: &FsRequest) -> FsResponse {
    let path = Path::new(&req.path);
    if path.as_os_str().is_empty() {
        return FsResponse::err(req.id, FsErrorCode::InvalidRequest, "path is required");
    }
    let bytes = match (&req.data_b64, &req.content) {
        (Some(b64), _) => match decode_base64(b64) {
            Some(b) => b,
            None => return FsResponse::err(req.id, FsErrorCode::InvalidRequest, "invalid base64 payload"),
        },
        (None, Some(text)) => text.as_bytes().to_vec(),
        (None, None) => Vec::new(),
    };
    if bytes.len() > MAX_FILE_BYTES {
        return FsResponse::err(
            req.id,
            FsErrorCode::TooLarge,
            format!("write payload exceeds {MAX_FILE_BYTES} byte limit ({} bytes)", bytes.len()),
        );
    }
    match write_atomic_safe(path, &bytes) {
        Ok(()) => FsResponse::ok(req.id),
        Err(e) => FsResponse::from_io(req.id, &e),
    }
}

/// Writes `bytes` atomically via a sibling temporary file + `rename`, keeping
/// existing symlink targets checked directly by the OS sandbox.
fn write_atomic_safe(path: &Path, bytes: &[u8]) -> io::Result<()> {
    // If the target is an existing symlink, write directly so the kernel checks
    // write permission on the symlink's resolved target (matching `cat > path`).
    if std::fs::symlink_metadata(path).is_ok_and(|m| m.file_type().is_symlink()) {
        // Not through a link to a FIFO, which would block like a read.
        if std::fs::metadata(path).is_ok_and(|m| !m.is_file()) {
            return Err(io::Error::other("not a regular file"));
        }
        return std::fs::write(path, bytes);
    }
    let Some(parent) = path.parent().filter(|p| !p.as_os_str().is_empty()) else {
        return std::fs::write(path, bytes);
    };
    let seq = TEMP_SEQ.fetch_add(1, Ordering::Relaxed);
    let tmp_path: PathBuf = parent.join(format!(".tower-fs-tmp-{}-{seq}", std::process::id()));
    let write_res = (|| -> io::Result<()> {
        let mut f = OpenOptions::new().write(true).create_new(true).open(&tmp_path)?;
        f.write_all(bytes)?;
        f.flush()?;
        if let Ok(existing) = std::fs::metadata(path) {
            let _ = std::fs::set_permissions(&tmp_path, existing.permissions());
        }
        std::fs::rename(&tmp_path, path)?;
        Ok(())
    })();
    if write_res.is_err() {
        let _ = std::fs::remove_file(&tmp_path);
    }
    write_res
}

fn op_mkdir(id: u64, path: &Path) -> FsResponse {
    if path.as_os_str().is_empty() {
        return FsResponse::err(id, FsErrorCode::InvalidRequest, "path is required");
    }
    match std::fs::create_dir_all(path) {
        Ok(()) => FsResponse::ok(id),
        Err(e) => FsResponse::from_io(id, &e),
    }
}

fn op_mime(id: u64, path: &Path) -> FsResponse {
    if path.as_os_str().is_empty() {
        return FsResponse::err(id, FsErrorCode::InvalidRequest, "path is required");
    }
    let mut file = match open_regular(path) {
        Ok(f) => f,
        Err(e) => return FsResponse::from_io(id, &e),
    };
    let mut head = [0u8; 16];
    let n = match file.read(&mut head) {
        Ok(n) => n,
        Err(e) => return FsResponse::from_io(id, &e),
    };
    let mut resp = FsResponse::ok(id);
    resp.mime = detect_image_mime(&head[..n]).map(String::from);
    resp
}

/// Recognizes image MIME types supported by Pi/ACP from magic bytes.
pub fn detect_image_mime(head: &[u8]) -> Option<&'static str> {
    if head.len() >= 8 && head[..8] == [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a] {
        return Some("image/png");
    }
    if head.len() >= 3 && head[0] == 0xff && head[1] == 0xd8 && head[2] == 0xff {
        return Some("image/jpeg");
    }
    if head.len() >= 6 && (&head[..6] == b"GIF87a" || &head[..6] == b"GIF89a") {
        return Some("image/gif");
    }
    if head.len() >= 12 && &head[..4] == b"RIFF" && &head[8..12] == b"WEBP" {
        return Some("image/webp");
    }
    None
}

fn read_bounded_line<R: BufRead>(reader: &mut R, out: &mut Vec<u8>, limit: usize) -> io::Result<usize> {
    let mut total = 0usize;
    loop {
        let available = reader.fill_buf()?;
        if available.is_empty() {
            return Ok(total);
        }
        if let Some(pos) = available.iter().position(|&b| b == b'\n') {
            let take = pos + 1;
            if out.len() <= limit {
                let keep = (limit + 1).saturating_sub(out.len()).min(take);
                out.extend_from_slice(&available[..keep]);
            }
            reader.consume(take);
            return Ok(total + take);
        }
        let len = available.len();
        if out.len() <= limit {
            let keep = (limit + 1).saturating_sub(out.len()).min(len);
            out.extend_from_slice(&available[..keep]);
        }
        reader.consume(len);
        total += len;
    }
}

fn write_frame<W: Write>(writer: &mut W, resp: &FsResponse) -> io::Result<()> {
    serde_json::to_writer(&mut *writer, resp).map_err(io::Error::other)?;
    writer.write_all(b"\n")?;
    writer.flush()
}

pub(crate) fn encode_base64(bytes: &[u8]) -> String {
    const T: &[u8; 64] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    let mut out = String::with_capacity(bytes.len().div_ceil(3) * 4);
    for chunk in bytes.chunks(3) {
        let b = [chunk[0], *chunk.get(1).unwrap_or(&0), *chunk.get(2).unwrap_or(&0)];
        let n = (u32::from(b[0]) << 16) | (u32::from(b[1]) << 8) | u32::from(b[2]);
        out.push(T[(n >> 18) as usize & 63] as char);
        out.push(T[(n >> 12) as usize & 63] as char);
        out.push(if chunk.len() > 1 { T[(n >> 6) as usize & 63] as char } else { '=' });
        out.push(if chunk.len() > 2 { T[n as usize & 63] as char } else { '=' });
    }
    out
}

pub(crate) fn decode_base64(s: &str) -> Option<Vec<u8>> {
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
    if bytes.len() % 4 == 1 {
        return None;
    }
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
    use super::*;

    #[test]
    fn jsonl_rpc_handles_all_operations_and_caps() {
        let tmp = tempfile::tempdir().unwrap();
        let root = tmp.path();
        let nested_dir = root.join("a/b");
        let file = nested_dir.join("note.txt");
        let img = nested_dir.join("pic.png");

        let reqs = [
            FsRequest { id: 1, op: FsOp::Ping, path: String::new(), content: None, data_b64: None },
            FsRequest { id: 2, op: FsOp::Mkdir, path: nested_dir.display().to_string(), content: None, data_b64: None },
            FsRequest {
                id: 3,
                op: FsOp::Write,
                path: file.display().to_string(),
                content: Some("hello atomic\n".into()),
                data_b64: None,
            },
            FsRequest { id: 4, op: FsOp::Access, path: file.display().to_string(), content: None, data_b64: None },
            FsRequest { id: 5, op: FsOp::Read, path: file.display().to_string(), content: None, data_b64: None },
            FsRequest {
                id: 6,
                op: FsOp::Write,
                path: img.display().to_string(),
                content: None,
                data_b64: Some(encode_base64(&[0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 1])),
            },
            FsRequest { id: 7, op: FsOp::Mime, path: img.display().to_string(), content: None, data_b64: None },
            FsRequest {
                id: 8,
                op: FsOp::Access,
                path: root.join("missing.txt").display().to_string(),
                content: None,
                data_b64: None,
            },
        ];
        let input: String = reqs.iter().map(|r| format!("{}\n", serde_json::to_string(r).unwrap())).collect();
        let mut out = Vec::new();
        serve(io::Cursor::new(input.as_bytes()), &mut out).unwrap();

        let resps: Vec<FsResponse> =
            String::from_utf8(out).unwrap().lines().map(|l| serde_json::from_str(l).unwrap()).collect();
        assert_eq!(resps.len(), reqs.len());
        assert!(resps[0].ok && resps[1].ok && resps[2].ok && resps[3].ok);
        let decoded = decode_base64(resps[4].data_b64.as_deref().unwrap()).unwrap();
        assert_eq!(decoded, b"hello atomic\n");
        assert!(resps[5].ok);
        assert_eq!(resps[6].mime.as_deref(), Some("image/png"));
        assert!(!resps[7].ok && resps[7].code == Some(FsErrorCode::NotFound));
        // No temp files leaked after atomic writes.
        let names: Vec<_> = std::fs::read_dir(&nested_dir)
            .unwrap()
            .flatten()
            .map(|e| e.file_name().to_string_lossy().to_string())
            .collect();
        assert!(!names.iter().any(|n| n.starts_with(".tower-fs-tmp-")), "{names:?}");
    }

    #[test]
    fn enforces_16mb_file_cap_on_read_and_write() {
        let tmp = tempfile::tempdir().unwrap();
        let big = tmp.path().join("big.bin");
        let over = vec![b'x'; MAX_FILE_BYTES + 1];
        let wr = handle_request(&FsRequest {
            id: 1,
            op: FsOp::Write,
            path: big.display().to_string(),
            content: None,
            data_b64: Some(encode_base64(&over)),
        });
        assert!(!wr.ok && wr.code == Some(FsErrorCode::TooLarge));
        assert!(!big.exists());

        std::fs::write(&big, &over).unwrap();
        let rd = handle_request(&FsRequest {
            id: 2,
            op: FsOp::Read,
            path: big.display().to_string(),
            content: None,
            data_b64: None,
        });
        assert!(!rd.ok && rd.code == Some(FsErrorCode::TooLarge));
    }

    /// A FIFO in the workspace (the agent can make one) is refused at once,
    /// never waited on: opening it would block the helper for every later
    /// request.
    #[test]
    fn a_fifo_is_refused_without_blocking() {
        let tmp = tempfile::tempdir().unwrap();
        let fifo = tmp.path().join("pipe");
        assert!(std::process::Command::new("mkfifo").arg(&fifo).status().unwrap().success());
        for op in [FsOp::Read, FsOp::Access, FsOp::Mime] {
            let req = FsRequest { id: 1, op, path: fifo.display().to_string(), content: None, data_b64: None };
            let (tx, rx) = std::sync::mpsc::channel();
            std::thread::spawn(move || {
                let _ = tx.send(handle_request(&req));
            });
            let resp = rx.recv_timeout(std::time::Duration::from_secs(5)).expect("answered without blocking");
            assert!(!resp.ok, "{op:?} on a FIFO must fail");
            assert!(resp.error.as_deref().unwrap_or_default().contains("not a regular file"), "{resp:?}");
        }
    }

    #[test]
    fn detects_image_mime_types() {
        assert_eq!(detect_image_mime(&[0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Some("image/png"));
        assert_eq!(detect_image_mime(&[0xff, 0xd8, 0xff, 0xe0]), Some("image/jpeg"));
        assert_eq!(detect_image_mime(b"GIF89a"), Some("image/gif"));
        assert_eq!(detect_image_mime(b"RIFF\x00\x00\x00\x00WEBP"), Some("image/webp"));
        assert_eq!(detect_image_mime(b"plain text"), None);
    }
}
