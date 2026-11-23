//! Masks credential-shaped strings in command output before it is stored or
//! shown (`docs/11` §11.7). Conservative: it prefers masking a harmless token
//! to leaking a real one.

/// Known credential prefixes and the minimum length of what follows.
const PREFIXES: &[(&str, usize)] = &[
    ("sk-ant-", 20),
    ("sk-proj-", 20),
    ("sk-", 20),
    ("ghp_", 30),
    ("gho_", 30),
    ("ghs_", 30),
    ("github_pat_", 30),
    ("glpat-", 20),
    ("xoxb-", 20),
    ("xoxp-", 20),
    ("AKIA", 16),
    ("AIza", 30),
    ("npm_", 30),
];

/// Language-neutral, like the command output it appears in.
const MASK: &str = "[redacted]";

fn is_token_char(c: char) -> bool {
    c.is_ascii_alphanumeric() || matches!(c, '-' | '_' | '.' | '/' | '+' | '=')
}

pub fn redact(text: &str) -> String {
    let text = redact_authorization(&redact_urls(&redact_pem(text)));
    let mut out = String::with_capacity(text.len());
    let mut rest = text.as_str();
    'outer: while !rest.is_empty() {
        for (prefix, min) in PREFIXES {
            if rest.starts_with(prefix) && !out.chars().last().is_some_and(is_token_char) {
                let tail = &rest[prefix.len()..];
                let len = tail.find(|c: char| !is_token_char(c)).unwrap_or(tail.len());
                if len >= *min {
                    out.push_str(prefix);
                    out.push_str(MASK);
                    rest = &tail[len..];
                    continue 'outer;
                }
            }
        }
        let c = rest.chars().next().expect("non-empty");
        out.push(c);
        rest = &rest[c.len_utf8()..];
    }
    redact_assignments(&out)
}

fn redact_pem(text: &str) -> String {
    let mut out = String::new();
    let mut rest = text;
    while let Some(start) = rest.find("-----BEGIN ") {
        let (before, from) = rest.split_at(start);
        out.push_str(before);
        let header_end = from.find('\n').unwrap_or(from.len());
        if from[..header_end].contains("PRIVATE KEY")
            && let Some(end) = from.find("-----END ")
        {
            let end_line = from[end..].find('\n').map(|i| end + i).unwrap_or(from.len());
            out.push_str("-----BEGIN PRIVATE KEY----- ");
            out.push_str(MASK);
            rest = &from[end_line..];
            continue;
        }
        out.push_str(&from[..header_end]);
        rest = &from[header_end..];
    }
    out.push_str(rest);
    out
}

/// Ends a URL (or its authority, with `/?#`) in running text. Not brackets:
/// an IPv6 host is `[::1]`, and a query may say `filter[a]=1`.
fn ends_url(c: char) -> bool {
    c.is_whitespace() || matches!(c, '"' | '\'' | '`' | '<' | '>' | '(' | ')' | '{' | '}' | '|' | '\\')
}

/// Where a URL's authority ends: at the first `/?#`, or past `user:pass@`
/// when the password itself holds an unescaped `/`, `?` or `#` (never a
/// path's or a query's `@`, as in `/@types/node` or `?email=a@b`: a user name
/// holds none of `/?#`, and a port's path and query are told apart below).
/// The `@`s are tried from the last one back, and the first that ends a
/// `user:pass` is taken, so a password holding `@` too goes whole and a later
/// `@` in the path or query does not hide it. Where it cannot tell, it masks:
/// `host:4873/react@18` loses its host rather than risk a password
/// (`user:1234/abc@host` reads the same).
fn authority_end(url: &str) -> usize {
    let first = url.find(['/', '?', '#']).unwrap_or(url.len());
    // `user:` comes before any `/?#` (a user name holds none), and not on an IPv6 host.
    let Some(colon) = url.find(':').filter(|&c| c > 0 && c < first && !url.starts_with('[')) else {
        return first;
    };
    // Each `@` is judged in constant time, so text full of them costs one pass.
    let digits = url[colon + 1..].bytes().take_while(u8::is_ascii_digit).count();
    let port = (1..=5).contains(&digits) && url[colon + 1 + digits..].starts_with('/');
    let query = url[colon + 1..].find(['?', '#']).map(|q| colon + 1 + q);
    for (at, _) in url.match_indices('@').rev().take_while(|&(at, _)| at > first) {
        // `5173/@vite`, `5173/node_modules/@scope`: a port and a path whose `@` begins a segment; `8080/u?email=a@b`:
        // a port, a path, and a query or fragment the `@` is in. Anything else ends a password.
        let port_then_path = port && (url[..at].ends_with('/') || query.is_some_and(|q| q < at));
        if !port_then_path {
            return at + 1 + url[at + 1..].find(['/', '?', '#']).unwrap_or(url.len() - at - 1);
        }
    }
    first
}

/// Query parameters that carry a credential.
fn secret_param(name: &str) -> bool {
    let n = name.to_ascii_lowercase();
    matches!(n.as_str(), "auth" | "key" | "apikey" | "api_key" | "sig" | "code" | "pass")
        || ["token", "secret", "password", "passwd", "signature", "credential"].iter().any(|k| n.contains(k))
}

/// `scheme://user:password@host` and `?token=…`-style query parameters.
/// The user name alone on `git@` (ssh) carries nothing and stays.
fn redact_urls(text: &str) -> String {
    redact_urls_within(text, 0)
}

/// How deep a URL inside a query value is looked into: output built to
/// nest them without end must cost neither the stack nor quadratic time.
const NESTED_URLS: u8 = 2;

/// Whether a URL that punctuation cut short (`cut`, after the `://`) stops inside `user:pass`: a `:` comes before any
/// `/?#`, and what follows it is not a port (1–5 digits, then the cut or a path). A password of 1–5 digits and a `/`
/// reads as a port here too, as in `authority_end`; reading it the other way would eat the next field of
/// `{"api":"http://localhost:3000/api","author":"ada@example.com"}`.
fn cut_in_userinfo(cut: &str) -> bool {
    let first = cut.find(['/', '?', '#']).unwrap_or(cut.len());
    let Some(colon) = cut[..first].find(':').filter(|_| !cut.starts_with('[')) else {
        return false;
    };
    let digits = cut[colon + 1..].bytes().take_while(u8::is_ascii_digit).count();
    let rest = &cut[colon + 1 + digits..];
    !((1..=5).contains(&digits) && (rest.is_empty() || rest.starts_with(['/', '?', '#'])))
}

/// The largest char boundary of `text` at or below `at`.
fn floor(text: &str, at: usize) -> usize {
    let mut at = at.min(text.len());
    while !text.is_char_boundary(at) {
        at -= 1;
    }
    at
}

/// Reads `text[from..to]`: with `find_at`, the offset of the first `@` (`None` if whitespace or a `://` comes first);
/// without, the offset of the first whitespace or `://`.
fn scan(text: &str, from: usize, to: usize, find_at: bool) -> Option<usize> {
    let from = floor(text, from);
    for (i, c) in text[from..floor(text, to)].char_indices() {
        if c.is_whitespace() || (c == ':' && text[from + i..].starts_with("://")) {
            return (!find_at).then_some(from + i);
        }
        if find_at && c == '@' {
            return Some(from + i);
        }
    }
    None
}

fn redact_urls_within(text: &str, depth: u8) -> String {
    let mut out = String::with_capacity(text.len());
    let mut rest = text;
    let mut next_at = text.find('@');
    while let Some(at) = rest.find("://") {
        out.push_str(&rest[..at + 3]);
        let url = &rest[at + 3..];
        let mut end = url.find(ends_url).unwrap_or(url.len());
        // A password may hold `'()"|{}<>\` or a backtick, which git sends as they are. When punctuation cuts the URL
        // inside `user:pass` (not after a host or a port), and an `@` follows within 256 bytes with no whitespace and
        // no other `://` before it, the URL runs to the end of the authority after that `@`. Each look stops at the
        // next `://`, so no stretch of text is read twice; the next `@` is found once for the whole text, so a URL
        // with none after it costs nothing.
        let pos = text.len() - url.len();
        if next_at.is_some_and(|a| a < pos) {
            next_at = text[pos..].find('@').map(|a| pos + a);
        }
        if next_at.is_some_and(|a| a - pos < end + 256)
            && cut_in_userinfo(&url[..end])
            && let Some(a) = scan(url, end, end + 256, true)
        {
            let b = scan(url, a + 1, a + 256, false).unwrap_or_else(|| floor(url, a + 256));
            let wide = &url[..b];
            let wide_host = authority_end(wide);
            if wide_host > end && wide[..wide_host].contains('@') {
                end = wide_host + wide[wide_host..].find(ends_url).unwrap_or(wide.len() - wide_host);
            }
        }
        let (url, after) = url.split_at(end);
        let host_end = authority_end(url);
        let (authority, path) = url.split_at(host_end);
        match authority.rsplit_once('@') {
            Some((user, host)) if !user.is_empty() && user != "git" => {
                out.push_str(MASK);
                out.push('@');
                out.push_str(host);
            }
            _ => out.push_str(authority),
        }
        match path.split_once('?') {
            Some((p, query)) => {
                out.push_str(p);
                out.push('?');
                let (query, fragment) = query.split_once('#').map_or((query, None), |(q, f)| (q, Some(f)));
                let params: Vec<String> = query
                    .split('&')
                    .map(|kv| match kv.split_once('=') {
                        Some((k, v)) if secret_param(k) && !v.is_empty() => format!("{k}={MASK}"),
                        // A URL inside a value (`next=https://…`) is a URL too.
                        Some((k, v)) if depth < NESTED_URLS && v.contains("://") => {
                            format!("{k}={}", redact_urls_within(v, depth + 1))
                        }
                        _ => kv.to_string(),
                    })
                    .collect();
                out.push_str(&params.join("&"));
                if let Some(f) = fragment {
                    out.push('#');
                    out.push_str(f);
                }
            }
            None => out.push_str(path),
        }
        rest = after;
    }
    out.push_str(rest);
    out
}

/// `Authorization: Bearer …` / `Basic …` (as a header, in JSON or in a
/// curl argument) and a free-standing `Bearer <token>`.
fn redact_authorization(text: &str) -> String {
    let lower = text.to_ascii_lowercase();
    let mut out = String::with_capacity(text.len());
    let mut from = 0;
    let mut i = 0;
    while i < text.len() {
        let header = lower[i..].starts_with("authorization");
        let bearer = lower[i..].starts_with("bearer ") && !text[..i].chars().last().is_some_and(char::is_alphanumeric);
        if !header && !bearer {
            i += text[i..].chars().next().map_or(1, char::len_utf8);
            continue;
        }
        // Past the header's name and separator to its value.
        let mut j = i + if header { "authorization".len() } else { 0 };
        if header {
            let sep =
                text[j..].find(|c: char| !matches!(c, '"' | '\'' | ' ' | ':' | '=')).map_or(text.len(), |k| j + k);
            if !text[j..sep].contains([':', '=']) {
                i = j;
                continue;
            }
            j = sep;
        }
        // An optional scheme word (`Bearer`, `Basic`, `token`).
        let word = text[j..].find(|c: char| !c.is_ascii_alphabetic()).map_or(text.len(), |k| j + k);
        if word > j && word - j <= 10 && text[word..].starts_with(' ') {
            j = word + 1;
        }
        let cred = text[j..].find(|c: char| !is_token_char(c)).map_or(text.len(), |k| j + k);
        // A free-standing `bearer` is masked only before something token-shaped (a digit, a dot, or mixed case past
        // its first letter): prose such as "the bearer authentication scheme" stays.
        let value = &text[j..cred];
        let shaped = header
            || value.contains(|c: char| c.is_ascii_digit() || c == '.')
            || value.chars().skip(1).any(|c| c.is_ascii_uppercase())
                && value.contains(|c: char| c.is_ascii_lowercase());
        if shaped && cred - j >= if header { 8 } else { 12 } {
            out.push_str(&text[from..j]);
            out.push_str(MASK);
            from = cred;
        }
        i = cred.max(i + 1);
    }
    out.push_str(&text[from..]);
    out
}

/// `PASSWORD=...`, `api_key: ...`, `"token": "..."` style assignments.
fn redact_assignments(text: &str) -> String {
    const KEYS: &[&str] = &["password", "passwd", "secret", "token", "api_key", "apikey", "access_key", "private_key"];
    text.lines()
        .map(|line| {
            let lower = line.to_ascii_lowercase();
            let Some(key_at) = KEYS.iter().filter_map(|k| lower.find(k)).min() else {
                return line.to_string();
            };
            let after = &line[key_at..];
            let Some(sep) = after.find(['=', ':']) else { return line.to_string() };
            let value_start = key_at + sep + 1;
            let value = line[value_start..].trim().trim_matches(['"', '\'', ',']);
            if value.len() < 8 || value.contains(' ') {
                return line.to_string();
            }
            format!("{}{MASK}", line[..value_start].trim_end_matches(' '))
        })
        .collect::<Vec<_>>()
        .join("\n")
        + if text.ends_with('\n') { "\n" } else { "" }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn masks_known_token_shapes() {
        let s = "key sk-ant-api03-abcdefghijklmnopqrstuvwxyz0123 done";
        assert_eq!(redact(s), "key sk-ant-[redacted] done");
        assert!(redact("ghp_0123456789abcdefghijklmnopqrstuvwxyz").starts_with("ghp_[redacted]"));
    }

    #[test]
    fn leaves_ordinary_text_alone() {
        let s = "test result: ok. 12 passed; sk- is a prefix\nask-me later\n";
        assert_eq!(redact(s), s);
    }

    #[test]
    fn masks_assignments_and_private_keys() {
        assert_eq!(redact("DB_PASSWORD=hunter2hunter2"), "DB_PASSWORD=[redacted]");
        let pem = "a\n-----BEGIN RSA PRIVATE KEY-----\nMIIabc\n-----END RSA PRIVATE KEY-----\nb";
        let r = redact(pem);
        assert!(!r.contains("MIIabc"));
        assert!(r.ends_with("\nb"));
    }

    #[test]
    fn masks_url_credentials_and_authorization_headers() {
        let cases = [
            ("fatal: https://ada:hunter2pass@github.com/o/r.git not found", "hunter2pass"),
            ("remote https://ghp-like-user-token-0001@example.com/x then more", "ghp-like-user-token-0001"),
            ("GET https://api.example.com/v1?auth=abc12345xyz&page=2 200", "abc12345xyz"),
            ("see https://h.example.com/p?x=1&access_token=tok98765zz for details", "tok98765zz"),
            ("> Authorization: Bearer eyJhbGciOiJIUzI1NiJ9.e30.sig0002", "eyJhbGciOiJIUzI1NiJ9"),
            ("curl -H 'authorization: Basic YWRhOmh1bnRlcjI=' https://x", "YWRhOmh1bnRlcjI"),
            (
                "{\"push_url\": \"https://ntfy.example.com/x\", \"Authorization\": \"Bearer abcdef0123456789\"}",
                "abcdef0123456789",
            ),
        ];
        for (text, secret) in cases {
            let r = redact(text);
            assert!(!r.contains(secret), "{secret} left in {r}");
            assert!(r.contains(MASK), "{r}");
        }
        assert_eq!(redact("https://ada:pw123456@github.com/o/r"), "https://[redacted]@github.com/o/r");
        assert_eq!(redact("Authorization: Bearer abcdef0123456789 x"), "Authorization: Bearer [redacted] x");
        // What carries no credential stays as it is.
        for s in [
            "git@github.com:o/r.git",
            "ssh://git@github.com/o/r",
            "https://github.com/o/r?page=2&sort=asc",
            "basic usage of the bearer",
        ] {
            assert_eq!(redact(s), s);
        }
    }

    /// URLs the first pass missed: brackets in a query or an IPv6 host, a
    /// URL inside a query value, and a password with an unescaped `/`.
    #[test]
    fn masks_credentials_in_less_plain_urls() {
        let padded = format!(
            "{{\"homepage\":\"https://example.com\",\"contact\":\"ada@example.com\",\"n\":\"{}\",\"mirror\":\"https://deploy:PW0015@git.example.com/r\"}}",
            "x".repeat(200)
        );
        let cases = [
            ("GET https://api.example.com/x?filter[a]=1&access_token=tok12345678 200", "tok12345678"),
            ("callback http://[::1]:8080/cb?token=ipv6tok0001 ok", "ipv6tok0001"),
            ("redirect https://a.example.com/login?next=https://ada:nestedpw0002@b.example.com/x", "nestedpw0002"),
            ("fatal: https://ada:pa/ss0003@host.example.com/o/r.git", "ss0003"),
            // A password that starts with `/`, or with digits then `/`, is not a port.
            ("fatal: https://ada:/slashpw0004@host.example.com/o/r.git", "slashpw0004"),
            ("fatal: https://ada:1234/digitpw0005@host.example.com/o/r.git", "digitpw0005"),
            // A password with both `@` and `/` in it: the host is after the last `@`.
            ("fatal: https://ada:pa@ss/atslash0006@host.example.com/o/r.git", "atslash0006"),
            // `#` and `?` in a password do not start a fragment or a query before the host.
            ("fatal: https://ada:pa#hashpw0007@host.example.com/o/r.git", "hashpw0007"),
            ("fatal: https://ada:p?qmarkpw0008@host.example.com/o", "qmarkpw0008"),
            // A later `@` in the query or path does not hide the password's own.
            ("fatal: https://ada:1234/laterat0009@host.example.com/p?email=x@y.com", "laterat0009"),
            ("fatal: https://ada:1234/laterat0010@host.example.com/@types/x", "laterat0010"),
            // Characters that end a URL in running text may sit in a password git sends as it is.
            ("origin\thttps://deploy:Xy(7q)Zr'0011@git.example.com/o/r.git (fetch)", "Zr'0011"),
            ("db postgres://app:p\"q|r{s}<t>u\\v`0012@db.example.com/x", "0012"),
            // An `@` before the punctuation does not hide the userinfo `@` after it.
            ("https://ada@corp.com:Xy(7q)Zr0013@git.example.com/o/r.git", "Zr0013"),
            ("https://u:p@ss(word0014@host/r", "word0014"),
            ("https://u:a/b(c0017@host/r", "c0017"),
            // A bare origin before an email and a second URL in compact JSON does not swallow that URL whole.
            (&padded, "PW0015"),
            (
                "{\"homepage\":\"https://example.com\",\"contact\":\"ada@example.com\",\"download\":\"https://b.s3.amazonaws.com/f.tar.gz?X-Amz-Credential=AK&X-Amz-Signature=SIG0016\"}",
                "SIG0016",
            ),
        ];
        for (text, secret) in cases {
            let r = redact(text);
            assert!(!r.contains(secret), "{secret} left in {r}");
        }
        // A dev server's or a registry's port is not a password.
        for kept in [
            "GET http://localhost:5173/@vite/client 200",
            "GET http://localhost:4873/@types/node",
            "https://registry.npmjs.org:443/@types/node",
            "http://[::1]:8080/@id/x",
            "GET http://localhost:5173/node_modules/@scope/pkg/index.js 200",
            "GET https://example.com/u?email=ada@example.org 200",
            "GET http://localhost:8080/u?email=ada@example.org#top 200",
        ] {
            assert_eq!(redact(kept), kept);
        }
        // A token of letters only, mixed case as random ones are, is still a token.
        assert!(!redact("token: Bearer AbcdefGhijklmnopQr").contains("AbcdefGhijklmnopQr"));
        // A URL in brackets or quotes still ends at them.
        for kept in [
            "see (https://example.com/x) and \"https://example.com/y\"",
            "<https://example.com/z>",
            // A bare origin next to emails (JSON, `psql -A`, a port before a quote) is not read as `user:pass@`.
            "[\"https://example.com\",\"a@x.com\",\"b@x.com\"]",
            "1|Ada|https://ada.dev|ada@example.com|2024-01-01",
            "{\"homepage\":\"https://example.com\",\"author\":\"ada@example.com\",\"id\":3}",
            "{\"api\":\"https://example.com:8443\",\"author\":\"ada@example.com\"}",
            "{\"api\":\"http://localhost:3000/api\",\"author\":\"ada@example.com\"}",
        ] {
            assert_eq!(redact(kept), kept);
        }
        // A scoped package path is not user info.
        let npm = "GET https://registry.npmjs.org/@types/node 200";
        assert_eq!(redact(npm), npm);
        // Prose about the scheme is not a token.
        let prose = "the bearer authentication scheme";
        assert_eq!(redact(prose), prose);
    }

    /// Output built to nest URLs in query values without end stays
    /// output: it is masked in bounded time and depth, never a crash.
    #[test]
    fn deeply_nested_urls_neither_overflow_nor_crawl() {
        let text = format!("https://a.example.com/{}", "://?=".repeat(20_000));
        let handle = std::thread::Builder::new()
            .stack_size(256 * 1024)
            .spawn(move || {
                let started = std::time::Instant::now();
                let _ = redact(&text);
                started.elapsed()
            })
            .unwrap();
        let took = handle.join().expect("no stack overflow");
        assert!(took < std::time::Duration::from_secs(2), "took {took:?}");
    }

    /// Text of many URLs and no whitespace is read in one pass too: looking past
    /// punctuation for a password never reads to the end of the text each time.
    #[test]
    fn many_urls_without_whitespace_are_read_in_one_pass() {
        for text in ["a://b(".repeat(100_000), "a://b(@".repeat(100_000), "a://u:p(@h".repeat(100_000)] {
            let started = std::time::Instant::now();
            let _ = redact(&text);
            assert!(started.elapsed() < std::time::Duration::from_secs(2), "took {:?}", started.elapsed());
        }
    }

    /// A URL full of `@`s is read in one pass: each one is judged on its own.
    #[test]
    fn a_url_full_of_ats_is_read_in_one_pass() {
        let text = format!("https://a:1/{}", "@/".repeat(200_000));
        let started = std::time::Instant::now();
        let _ = redact(&text);
        assert!(started.elapsed() < std::time::Duration::from_secs(2), "took {:?}", started.elapsed());
    }
}
