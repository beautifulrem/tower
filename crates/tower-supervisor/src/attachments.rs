//! Multimodal image attachments stored in `<goal_dir>/attachments/` (`docs/18` P1.4).
//!
//! Validates magic bytes (PNG, JPEG, WebP), enforces a strict 10 MB size cap,
//! blocks path traversal, and keeps files strictly inside the goal's private
//! directory (readable inside the sandbox, never writable outside).

use std::path::Path;

use tower_core::contract::AttachmentRef;
use tower_core::{EventKind, tr};

use crate::{Result, Supervisor, invalid};

/// Strict maximum image attachment size (10 MiB).
pub const MAX_ATTACHMENT_BYTES: usize = 10 * 1024 * 1024;

/// Detects image MIME type & canonical extension strictly by magic bytes.
pub fn detect_image_type(bytes: &[u8]) -> Option<(&'static str, &'static str)> {
    if bytes.len() >= 8 && bytes[..8] == [0x89, b'P', b'N', b'G', 0x0D, 0x0A, 0x1A, 0x0A] {
        return Some(("image/png", "png"));
    }
    if bytes.len() >= 3 && bytes[..3] == [0xFF, 0xD8, 0xFF] {
        return Some(("image/jpeg", "jpg"));
    }
    if bytes.len() >= 12 && &bytes[..4] == b"RIFF" && &bytes[8..12] == b"WEBP" {
        return Some(("image/webp", "webp"));
    }
    None
}

/// Decodes standard base64 (stripping an optional `data:...;base64,` prefix and whitespace).
pub fn decode_base64(input: &str) -> std::result::Result<Vec<u8>, String> {
    let raw = input.trim();
    let payload = match raw.split_once(";base64,") {
        Some((_, rest)) => rest,
        None => raw,
    };
    // Pre-check approximate decoded size before allocating.
    let approx = payload.len() * 3 / 4;
    if approx > MAX_ATTACHMENT_BYTES + 1024 {
        return Err("attachment exceeds 10 MB limit".into());
    }
    let mut out = Vec::with_capacity(approx);
    let mut buf = [0u8; 4];
    let mut n = 0usize;
    let mut pad = 0usize;
    for b in payload.bytes() {
        if b.is_ascii_whitespace() {
            continue;
        }
        let val = match b {
            b'A'..=b'Z' => b - b'A',
            b'a'..=b'z' => b - b'a' + 26,
            b'0'..=b'9' => b - b'0' + 52,
            b'+' | b'-' => 62,
            b'/' | b'_' => 63,
            b'=' => {
                pad += 1;
                0
            }
            _ => return Err("invalid base64 character".into()),
        };
        if pad > 0 && b != b'=' {
            return Err("invalid base64 padding".into());
        }
        buf[n] = val;
        n += 1;
        if n == 4 {
            out.push((buf[0] << 2) | (buf[1] >> 4));
            if pad < 2 {
                out.push((buf[1] << 4) | (buf[2] >> 2));
            }
            if pad == 0 {
                out.push((buf[2] << 6) | buf[3]);
            }
            n = 0;
            pad = 0;
        }
    }
    if n == 2 {
        out.push((buf[0] << 2) | (buf[1] >> 4));
    } else if n == 3 {
        out.push((buf[0] << 2) | (buf[1] >> 4));
        out.push((buf[1] << 4) | (buf[2] >> 2));
    } else if n != 0 {
        return Err("truncated base64 payload".into());
    }
    Ok(out)
}

pub fn encode_base64(bytes: &[u8]) -> String {
    const TABLE: &[u8; 64] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    let mut out = String::with_capacity(bytes.len().div_ceil(3) * 4);
    for chunk in bytes.chunks(3) {
        let b0 = chunk[0];
        let b1 = chunk.get(1).copied().unwrap_or(0);
        let b2 = chunk.get(2).copied().unwrap_or(0);
        out.push(TABLE[(b0 >> 2) as usize] as char);
        out.push(TABLE[(((b0 & 0x03) << 4) | (b1 >> 4)) as usize] as char);
        if chunk.len() > 1 {
            out.push(TABLE[(((b1 & 0x0F) << 2) | (b2 >> 6)) as usize] as char);
        } else {
            out.push('=');
        }
        if chunk.len() > 2 {
            out.push(TABLE[(b2 & 0x3F) as usize] as char);
        } else {
            out.push('=');
        }
    }
    out
}

fn sanitize_label(name: &str, fallback_ext: &str) -> String {
    let base = Path::new(name).file_name().and_then(|s| s.to_str()).unwrap_or("").trim();
    let cleaned: String = base.chars().filter(|c| !c.is_control() && *c != '/' && *c != '\\').take(80).collect();
    if cleaned.is_empty() { format!("image.{fallback_ext}") } else { cleaned }
}

fn safe_rel_filename(path: &str) -> Option<&str> {
    if path.is_empty() || path.contains('/') || path.contains('\\') || path.contains("..") {
        return None;
    }
    Some(path)
}

impl Supervisor {
    /// Validates and saves pasted image bytes into `<goal_dir>/attachments/`,
    /// returning an `AttachmentRef` persisted to the goal's event log and store.
    pub fn save_attachment(&self, goal_id: &str, name: &str, data_base64: &str) -> Result<AttachmentRef> {
        let lang = self.inner.lang();
        // Verify goal exists unless saving a draft attachment for a not-yet-created goal (`draft`).
        let persist_to_goal = goal_id != "draft" && self.inner.store(|s| s.goal(goal_id)).is_ok();
        if goal_id != "draft" && !persist_to_goal {
            return Err(invalid(tr!(lang, "找不到目标 {goal_id}", "Goal {goal_id} not found")));
        }
        let bytes = decode_base64(data_base64)
            .map_err(|e| invalid(tr!(lang, "无法解码图片数据：{e}", "Could not decode image data: {e}")))?;
        if bytes.is_empty() {
            return Err(invalid(tr!(lang, "图片内容为空", "Image data is empty")));
        }
        if bytes.len() > MAX_ATTACHMENT_BYTES {
            return Err(invalid(tr!(lang, "图片不能超过 10 MB", "Image attachment cannot exceed 10 MB")));
        }
        let (mime, ext) = detect_image_type(&bytes).ok_or_else(|| {
            invalid(tr!(
                lang,
                "仅支持 PNG、JPEG 或 WebP 图片",
                "Only PNG, JPEG, or WebP image attachments are supported"
            ))
        })?;
        let id = format!("att_{}", uuid::Uuid::now_v7().simple());
        let filename = format!("{id}.{ext}");
        let dir = self.inner.paths.attachments_dir(goal_id);
        std::fs::create_dir_all(&dir)?;
        std::fs::write(dir.join(&filename), &bytes)?;

        let att = AttachmentRef {
            id,
            name: sanitize_label(name, ext),
            mime: mime.into(),
            path: filename,
            size_bytes: bytes.len() as u64,
            created_at: tower_store::system_now(),
        };
        if persist_to_goal {
            self.inner.append(goal_id, EventKind::AttachmentAdded { attachment: att.clone() })?;
            self.inner.emit_goal_now(goal_id);
        }
        Ok(att)
    }

    /// Reads an attachment from `<goal_dir>/attachments/<path>` as a data URL.
    pub fn attachment_data_url(&self, goal_id: &str, path: &str) -> Option<String> {
        let rel = safe_rel_filename(path)?;
        let file = self.inner.paths.attachments_dir(goal_id).join(rel);
        let bytes = std::fs::read(&file).ok()?;
        if bytes.len() > MAX_ATTACHMENT_BYTES {
            return None;
        }
        let (mime, _) = detect_image_type(&bytes)?;
        Some(format!("data:{mime};base64,{}", encode_base64(&bytes)))
    }

    /// Removes an attachment record and deletes its file from `<goal_dir>/attachments/`.
    pub fn delete_attachment(&self, goal_id: &str, attachment_id: &str) -> Result<()> {
        let removed = self.inner.store(|s| s.delete_goal_attachment(goal_id, attachment_id))?;
        if let Some(rel) = removed.as_deref().and_then(safe_rel_filename) {
            let _ = std::fs::remove_file(self.inner.paths.attachments_dir(goal_id).join(rel));
        }
        self.inner.emit_goal_now(goal_id);
        Ok(())
    }

    /// Lists workspace tracked files (for `@file` fuzzy autocomplete in Steering & Contract Studio).
    pub async fn workspace_files(&self, id: &str) -> Result<Vec<String>> {
        let rec = self.inner.read_store(|s| s.goal(id))?;
        let dir = rec.workspace.unwrap_or(rec.project_root);
        let git = self.inner.git.clone();
        let files = tokio::task::spawn_blocking(move || git.ls_files(Path::new(&dir)))
            .await
            .map_err(|e| invalid(e.to_string()))??;
        Ok(files)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn validates_magic_bytes_and_rejects_non_images() {
        let png = [0x89, b'P', b'N', b'G', 0x0D, 0x0A, 0x1A, 0x0A, 0, 0];
        let jpg = [0xFF, 0xD8, 0xFF, 0xE0, 0, 16];
        let webp = b"RIFF\x24\x00\x00\x00WEBPVP8 ";
        assert_eq!(detect_image_type(&png), Some(("image/png", "png")));
        assert_eq!(detect_image_type(&jpg), Some(("image/jpeg", "jpg")));
        assert_eq!(detect_image_type(webp), Some(("image/webp", "webp")));
        assert_eq!(detect_image_type(b"<svg><script>alert(1)</script></svg>"), None);
        assert_eq!(detect_image_type(b"plain text"), None);
    }

    #[test]
    fn base64_round_trips_and_strips_data_url_prefix() {
        let png = [0x89, b'P', b'N', b'G', 0x0D, 0x0A, 0x1A, 0x0A, 1, 2, 3, 4];
        let b64 = encode_base64(&png);
        assert_eq!(decode_base64(&b64).unwrap(), png);
        let prefixed = format!("data:image/png;base64,{b64}");
        assert_eq!(decode_base64(&prefixed).unwrap(), png);
        assert!(decode_base64("not!valid@base64").is_err());
    }

    #[test]
    fn rejects_path_traversal_filenames() {
        assert_eq!(safe_rel_filename("att_123.png"), Some("att_123.png"));
        assert_eq!(safe_rel_filename("../secret.png"), None);
        assert_eq!(safe_rel_filename("sub/a.png"), None);
    }
}
