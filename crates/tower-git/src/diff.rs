//! Unified diff parser for `git diff -M --no-color --no-ext-diff` output.

use tower_core::view::{DiffFile, DiffLine, FileStatus, Hunk, LineKind};

/// Lines longer than this are cut in the view; the diff itself is untouched.
const MAX_LINE_CHARS: usize = 2_000;

pub fn parse(text: &str) -> Vec<DiffFile> {
    let mut files = Vec::new();
    let mut cur: Option<DiffFile> = None;
    let (mut old_no, mut new_no) = (0u32, 0u32);

    for line in text.lines() {
        if let Some(rest) = line.strip_prefix("diff --git ") {
            if let Some(f) = cur.take() {
                files.push(f);
            }
            let (a, b) = split_git_paths(rest);
            cur = Some(DiffFile {
                path: b.clone(),
                old_path: (a != b).then_some(a),
                status: FileStatus::Modified,
                additions: 0,
                deletions: 0,
                binary: false,
                hunks: Vec::new(),
            });
            continue;
        }
        let Some(f) = cur.as_mut() else { continue };

        if f.hunks.is_empty() {
            if line.starts_with("new file mode") {
                f.status = FileStatus::Added;
            } else if line.starts_with("deleted file mode") {
                f.status = FileStatus::Deleted;
            } else if let Some(p) = line.strip_prefix("rename from ") {
                f.status = FileStatus::Renamed;
                f.old_path = Some(unquote(p));
            } else if let Some(p) = line.strip_prefix("rename to ") {
                f.path = unquote(p);
            } else if line.starts_with("Binary files ") || line == "GIT binary patch" {
                f.binary = true;
            } else if let Some(p) = line.strip_prefix("+++ ")
                && p != "/dev/null" {
                    f.path = unquote(p.strip_prefix("b/").unwrap_or(p));
                }
        }

        if line.starts_with("@@") {
            let (o, n) = parse_hunk_header(line);
            old_no = o;
            new_no = n;
            f.hunks.push(Hunk { header: line.to_string(), lines: Vec::new() });
            continue;
        }
        let Some(h) = f.hunks.last_mut() else { continue };
        let (kind, body) = match line.as_bytes().first() {
            Some(b'+') => (LineKind::Add, &line[1..]),
            Some(b'-') => (LineKind::Del, &line[1..]),
            Some(b' ') => (LineKind::Context, &line[1..]),
            Some(b'\\') => continue, // "\ No newline at end of file"
            None => (LineKind::Context, ""),
            _ => continue,
        };
        let text: String = if body.len() > MAX_LINE_CHARS { body.chars().take(MAX_LINE_CHARS).collect() } else { body.into() };
        let (o, n) = match kind {
            LineKind::Add => {
                f.additions += 1;
                new_no += 1;
                (None, Some(new_no - 1))
            }
            LineKind::Del => {
                f.deletions += 1;
                old_no += 1;
                (Some(old_no - 1), None)
            }
            LineKind::Context => {
                old_no += 1;
                new_no += 1;
                (Some(old_no - 1), Some(new_no - 1))
            }
        };
        h.lines.push(DiffLine { kind, old_no: o, new_no: n, text });
    }
    if let Some(f) = cur {
        files.push(f);
    }
    files
}

fn parse_hunk_header(h: &str) -> (u32, u32) {
    // @@ -a,b +c,d @@ ...
    let mut parts = h.split_whitespace().skip(1);
    let num = |s: Option<&str>| -> u32 {
        s.and_then(|s| s[1..].split(',').next()).and_then(|n| n.parse().ok()).unwrap_or(1)
    };
    let o = num(parts.next());
    let n = num(parts.next());
    (o, n)
}

fn split_git_paths(rest: &str) -> (String, String) {
    // `a/x b/x`, possibly quoted. Paths with spaces are ambiguous here; the
    // `+++`/`rename to` lines that follow fix the new path up.
    if let Some(idx) = rest.find(" b/") {
        let a = rest[..idx].trim_start_matches("a/");
        let b = &rest[idx + 3..];
        (unquote(a), unquote(b))
    } else {
        (rest.to_string(), rest.to_string())
    }
}

fn unquote(p: &str) -> String {
    let p = p.trim();
    if p.len() >= 2 && p.starts_with('"') && p.ends_with('"') {
        // Git C-quotes unusual names; decode the common escapes.
        let inner = &p[1..p.len() - 1];
        let mut out = Vec::new();
        let bytes = inner.as_bytes();
        let mut i = 0;
        while i < bytes.len() {
            if bytes[i] == b'\\' && i + 1 < bytes.len() {
                let c = bytes[i + 1];
                if c.is_ascii_digit() && i + 3 < bytes.len()
                    && let Ok(v) = u8::from_str_radix(&inner[i + 1..i + 4], 8) {
                        out.push(v);
                        i += 4;
                        continue;
                    }
                out.push(match c {
                    b'n' => b'\n',
                    b't' => b'\t',
                    other => other,
                });
                i += 2;
            } else {
                out.push(bytes[i]);
                i += 1;
            }
        }
        String::from_utf8_lossy(&out).into_owned()
    } else {
        p.to_string()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    const SAMPLE: &str = "diff --git a/src/a.rs b/src/a.rs
index 1111111..2222222 100644
--- a/src/a.rs
+++ b/src/a.rs
@@ -1,3 +1,4 @@
 fn a() {
-    1
+    2
+    3
 }
diff --git a/new.txt b/new.txt
new file mode 100644
index 0000000..3333333
--- /dev/null
+++ b/new.txt
@@ -0,0 +1 @@
+hello
\\ No newline at end of file
diff --git a/old.txt b/renamed.txt
similarity index 90%
rename from old.txt
rename to renamed.txt
diff --git a/img.png b/img.png
index 4444444..5555555 100644
Binary files a/img.png and b/img.png differ
";

    #[test]
    fn parses_files_hunks_and_line_numbers() {
        let files = parse(SAMPLE);
        assert_eq!(files.len(), 4);

        let a = &files[0];
        assert_eq!((a.path.as_str(), a.additions, a.deletions), ("src/a.rs", 2, 1));
        let lines = &a.hunks[0].lines;
        assert_eq!(lines[1].kind, LineKind::Del);
        assert_eq!(lines[1].old_no, Some(2));
        assert_eq!(lines[2].new_no, Some(2));
        assert_eq!(lines[3].new_no, Some(3));
        assert_eq!(lines[4].old_no, Some(3));

        assert_eq!(files[1].status, FileStatus::Added);
        assert_eq!(files[1].hunks[0].lines.len(), 1);

        assert_eq!(files[2].status, FileStatus::Renamed);
        assert_eq!(files[2].old_path.as_deref(), Some("old.txt"));
        assert_eq!(files[2].path, "renamed.txt");

        assert!(files[3].binary);
    }

    #[test]
    fn unquotes_c_style_paths() {
        assert_eq!(unquote("\"caf\\303\\251.txt\""), "café.txt");
    }
}
