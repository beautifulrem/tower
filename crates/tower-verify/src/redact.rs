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
    // Once no END follows, none follows any later header either: it is looked for no more.
    let mut no_end = false;
    while let Some(start) = rest.find("-----BEGIN ") {
        let (before, from) = rest.split_at(start);
        out.push_str(before);
        let header_end = from.find('\n').unwrap_or(from.len());
        let key = from[..header_end].contains("PRIVATE KEY");
        let end = if key && !no_end { from.find("-----END ") } else { None };
        no_end |= key && end.is_none();
        if let Some(end) = end {
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
    // `user:` (or a bare `:` for a password with no user, as Redis writes) comes before any `/?#`, and not on an IPv6
    // host.
    let Some(colon) = url.find(':').filter(|&c| c < first && !url.starts_with('[')) else {
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
///
/// The contract, found by heuristics rather than a parser:
/// - A URL's credentials and secret query values are masked in the shapes tools print: git, curl and package
///   manager lines, JSON (`\/` and `&` as `\u0026` read as the URL's own anywhere; `\"`, `\\` and `\uXXXX` inside a
///   password), YAML, TOML, CSV, `psql -A`, HTML and XML (`&amp;` included), Markdown, shell quoting.
/// - Text around a URL stays: neighbouring fields, emails, tags. Where a separator could be a password's or a field's
///   end, the URL is masked over rather than the password risked. It then runs to the last `@` before whitespace or
///   other URL-ending punctuation (`|`, quotes, brackets), so several CSV cells can go; a secret query value likewise
///   runs to that end, so cells after it in an unquoted CSV or `;` row go with it. The shapes masked over, credentials
///   or not:
///   - a `,` or `;` in the authority and then an `@` (`example.com,ada@…`, `localhost:3000;mail=ada@…`,
///     `ada@[::1],bob@…`, `user:pw@host,ada@…`): the separator may be a password's, a user name's (`CORP;svc:pw@`)
///     or a host list's (`h1:27017,h2:27017`);
///   - a `,` or `;` in the path and then an `@`, when the authority holds a `:`: `user:pass@host`, a port, or scp-like
///     `host:path` (`localhost:8080/api;contact=ops@…`, `ssh://git@host:o/r.git,ada@…`). With no `:` the URL ends
///     there: `host.example.com/path;contact=ops@…` stays;
///   - an `@` in a path after a port (`host:4873/react@18`; one that begins a segment, `5173/@vite`, stays), and in a
///     `\/`-escaped URL an `@` anywhere after a port (`api.example.com:8443\/u?email=a@b.com`), since the port is not
///     read as one there.
/// - Known leaks, by design:
///   - a password holding its own wrapper's closer (a `)` inside `(…)`), a `|` outside quotes or brackets, or
///     whitespace;
///   - a password holding `\n`, `\r`, `\t`, `\b` or `\f` inside a double-quoted string, JSON or not: the escape ends the URL;
///   - a password of 1–5 digits and then `/?#`;
///   - a user name holding punctuation that ends a URL (`ada(x:pw@host`);
///   - a password holding `://` or starting with `//` (`u://#pw@host`): it may be read as the start of another URL;
///   - a password holding an `@` and then more URL-ending punctuation (`deploy:Xy(7@q)Zr@host`): what follows the first
///     such `@` shows;
///   - a password more than 256 bytes past its first punctuation;
///   - a secret query value after an `@` in the query that a URL was masked over to: what follows that `@` is not read
///     as a query (`host:8443?email=a@b.com&sig=…`, `user:pw@host/cb?email=a@b.com&sig=…`);
///   - a secret query value after `\"`, `\\` or a `\uXXXX` other than `\u0026` in a JSON path or query: the escape ends
///     the URL (`/caf\u00e9?sig=…`);
///   - a secret query value after a `;` used as the query's separator (`?n=1;sig=…`);
///   - a secret query value after a URL nested in the query, when the outer URL's password needed the look past
///     punctuation (`deploy:pa(ss@host/cb?next=https://x/y&sig=…`);
///   - URLs nested more than two deep in query values (a `,` list of URLs with queries counts as nesting), or at all
///     in a `:\/\/`-escaped URL's query value;
///   - JDBC-style `;password=…` path parameters, left to the `password=` assignment rule, so a value under 8
///     characters stays.
/// - One pass over the text, whatever it holds.
fn redact_urls(text: &str) -> String {
    redact_urls_within(text, 0)
}

/// How deep a URL inside a query value is looked into: output built to
/// nest them without end must cost neither the stack nor quadratic time.
const NESTED_URLS: u8 = 2;

/// Whether a URL that punctuation cut short (`cut`, after the `://`) stops inside `user:pass`: a `:` comes before any
/// `/?#`, and what follows it is not a port and a path (1–5 digits, then `/?#`), as in `authority_end`. Digits at the
/// cut itself are a password's start: what a port is followed by there (JSON's `"`, HTML's `<`, a bracket) is a
/// wrapper `closes` sees. If an `@` already follows the `:`, the authority may be whole (`user:tok@host`): only when
/// no path has begun.
fn cut_in_userinfo(cut: &str) -> bool {
    let first = cut.find(['/', '?', '#']).unwrap_or(cut.len());
    let Some(colon) = cut[..first].find(':').filter(|_| !cut.starts_with('[')) else {
        return false;
    };
    let pass = &cut[colon + 1..];
    let digits = pass.bytes().take_while(u8::is_ascii_digit).count();
    if (1..=5).contains(&digits) && pass[digits..].starts_with(['/', '?', '#']) {
        return false;
    }
    !pass.contains('@') || first == cut.len()
}

/// Whether `c`, followed by `after`, closes a URL that `open` (the character before its scheme) wraps. A bracket's or a
/// separator's match always does (`(…)`, `<…>`, `>…<` in XML text, `|…|` in `psql -A`, `,…,` in CSV). A quote's match
/// does only where whitespace, a separator or the end follows (`"…","author"`, `href="…">`): a password may hold the
/// quote, and git prints `'https://deploy:Xy'Zr@host/'` as it is.
fn closes(open: Option<char>, c: char, after: &str) -> bool {
    let next = after.chars().next();
    match open {
        // In a JSON string a control escape (`\n`, `\t`, …) is no password's: it ends the URL. `\uXXXX` may stand for
        // a password's own character (Go's `<`, Python's `ensure_ascii`), and `\/` is PHP's `/`.
        Some('"') if c == '\\' => matches!(next, Some('n' | 'r' | 't' | 'b' | 'f')),
        Some(q @ ('"' | '\'' | '`')) => {
            c == q
                && next.is_none_or(|n| {
                    n.is_whitespace() || matches!(n, ',' | ';' | ':' | ')' | ']' | '}' | '>' | '<' | '/')
                })
        }
        Some(o) => {
            let close = match o {
                '(' => ')',
                '[' => ']',
                '{' => '}',
                '<' => '>',
                '>' => '<',
                '|' | ',' | ';' => o,
                _ => return false,
            };
            c == close
        }
        None => false,
    }
}

/// The largest char boundary of `text` at or below `at`.
fn floor(text: &str, at: usize) -> usize {
    let mut at = at.min(text.len());
    while !text.is_char_boundary(at) {
        at -= 1;
    }
    at
}

/// The offset of the first `@` in `text[from..to]`, if no whitespace or `://` comes before it.
fn next_userinfo_at(text: &str, from: usize, to: usize) -> Option<usize> {
    let from = floor(text, from);
    for (i, c) in text[from..floor(text, to)].char_indices() {
        if c.is_whitespace() || (c == ':' && text[from + i..].starts_with("://")) {
            return None;
        }
        if c == '@' {
            return Some(from + i);
        }
    }
    None
}

/// Where the URL text from `from` on ends: at punctuation that ends a URL, or where the next URL's `://` (PHP's
/// `:\/\/`) begins. JSON's `\u0026` and `\/` are the URL's own characters, as where `redact_urls_within` first ends a URL.
fn url_end_from(text: &str, from: usize) -> usize {
    text[from..]
        .char_indices()
        .find(|&(i, c)| {
            let at = &text[from + i..];
            at.starts_with("://")
                || at.starts_with(":\\/\\/")
                || (ends_url(c) && !at.starts_with("\\u0026") && !at.starts_with("\\/"))
        })
        .map_or(text.len(), |(i, _)| from + i)
}

/// Where something next occurs in `text` at or after a start that only moves forward: found once and kept until the
/// start passes it, so finding it for every URL of a long line is still one pass.
struct Next<F: Fn(&str) -> Option<usize>> {
    find: F,
    searched_from: Option<usize>,
    at: Option<usize>,
}

impl<F: Fn(&str) -> Option<usize>> Next<F> {
    fn new(find: F) -> Self {
        Self { find, searched_from: None, at: None }
    }

    fn at_or_after(&mut self, text: &str, from: usize) -> Option<usize> {
        let valid = self.searched_from.is_some_and(|s| s <= from) && self.at.is_none_or(|a| a >= from);
        if !valid {
            self.searched_from = Some(from);
            self.at = (self.find)(&text[from..]).map(|a| from + a);
        }
        self.at
    }
}

fn redact_urls_within(text: &str, depth: u8) -> String {
    let mut out = String::with_capacity(text.len());
    let mut rest = text;
    let mut next_at = text.find('@');
    // What the text outside URLs has opened on this line: a `"` string (JSON, a quoted value) and an element's text
    // (`<p>…`). Only text between URLs is read, so this is one pass too.
    let (mut in_string, mut in_element, mut in_tag) = (false, false, false);
    let mut ends = Next::new(|s: &str| s.find(ends_url));
    let mut queries = Next::new(|s: &str| s.find(['?', '#']));
    let mut schemes = Next::new(|s: &str| s.find("://"));
    // PHP's JSON writes `://` as `:\/\/`.
    let mut escaped_schemes = Next::new(|s: &str| s.find(":\\/\\/"));
    loop {
        let base = text.len() - rest.len();
        let plain = schemes.at_or_after(text, base);
        let php = escaped_schemes.at_or_after(text, base);
        let Some((at, sep)) = (match (plain, php) {
            (Some(p), Some(e)) if e < p => Some((e - base, 5)),
            (Some(p), _) => Some((p - base, 3)),
            (None, Some(e)) => Some((e - base, 5)),
            (None, None) => None,
        }) else {
            break;
        };
        let before = rest[..at].trim_end_matches(|c: char| c.is_ascii_alphanumeric() || matches!(c, '+' | '-' | '.'));
        let mut escaped = false;
        for c in before.chars() {
            match c {
                '\n' => (in_string, in_element, in_tag) = (false, false, false),
                '"' if !escaped => in_string = !in_string,
                '<' => (in_element, in_tag) = (false, true),
                // Only a tag's `>` begins an element's text, not one in prose (`a > b`, `->`).
                '>' if in_tag => (in_element, in_tag) = (true, false),
                _ => {}
            }
            escaped = c == '\\' && !escaped;
        }
        // What the URL is wrapped in: the character before its scheme, else the string or element it sits in.
        let open = match before.chars().next_back().or_else(|| text[..text.len() - rest.len()].chars().next_back()) {
            Some(c @ ('"' | '\'' | '`' | '(' | '[' | '{' | '<' | '>' | '|' | ',' | ';')) => Some(c),
            _ if in_string => Some('"'),
            _ if in_element => Some('>'),
            _ => None,
        };
        out.push_str(&rest[..at + sep]);
        let url = &rest[at + sep..];
        let pos = text.len() - url.len();
        let within = |next: Option<usize>| next.map_or(url.len(), |n| n - pos);
        let inner_scheme = within(schemes.at_or_after(text, pos)).min(within(escaped_schemes.at_or_after(text, pos)));
        let mut end = within(ends.at_or_after(text, pos));
        // In JSON, `\u0026` (Go's `&`) and `\/` (PHP's `/`) are the URL's own characters, not its end; read up to the
        // next URL at most, so no stretch is read twice.
        while end < inner_scheme && (url[end..].starts_with("\\u0026") || url[end..].starts_with("\\/")) {
            end = within(ends.at_or_after(text, pos + end + 1));
        }
        // A URL in the path (`/fetch/https://…`) is read on its own: this one ends where its scheme begins. One in the
        // query is a parameter's value, read below.
        if inner_scheme < within(queries.at_or_after(text, pos)).min(end) {
            end = url[..inner_scheme]
                .trim_end_matches(|c: char| c.is_ascii_alphanumeric() || matches!(c, '+' | '-' | '.'))
                .len();
        }
        // A password may hold `'()"{}<>\` or a backtick, which git sends as they are. When such punctuation cuts the URL
        // inside `user:pass`, and an `@` follows within 256 bytes with no whitespace, no other `://` and nothing that
        // closes what the URL is wrapped in before it, the URL runs on past the host after that `@` to where its path
        // ends. A `|` outside quotes or brackets is a column's end (`psql -A`), not read past. Each look stops at the
        // next `://`, so no stretch of text is read twice; the next `@` is found once for the whole text, so a URL with
        // none after it costs nothing.
        if next_at.is_some_and(|a| a < pos) {
            next_at = text[pos..].find('@').map(|a| pos + a);
        }
        // Where the cut falls in a URL inside a query value (`?next=https://v:pa(ss@…`), that URL's `user:pass` is the
        // one judged; the value then goes whole to the parameter reading below.
        let inner = url[..end].find(['?', '#']).and_then(|q| url[q..end].rfind("://").map(|i| q + i + 3)).unwrap_or(0);
        // Element text is no strong context: a `|` in it is a column's end too.
        let mut escaped = false;
        let quoted_or_bracketed = matches!(open, Some('"' | '\'' | '`' | '(' | '[' | '{' | '<'));
        if url[end..].chars().next().is_some_and(|c| ends_url(c) && (c != '|' || quoted_or_bracketed))
            && next_at.is_some_and(|a| a - pos < end + 256)
            && cut_in_userinfo(&url[inner..end])
            && let Some(a) = next_userinfo_at(url, end, end + 256)
            && !url[..a].char_indices().any(|(i, c)| {
                // In a JSON string a backslash escapes the next character, which then closes nothing.
                let was = escaped;
                escaped = open == Some('"') && c == '\\' && !was;
                !was && closes(open, c, &url[i + c.len_utf8()..])
            })
        {
            // A `,` or `;` after the host may still be the password's: as everywhere, the URL is then masked over.
            let host =
                url[a + 1..].find(|c| matches!(c, '/' | '?' | '#') || ends_url(c)).map_or(url.len(), |h| a + 1 + h);
            end = url_end_from(url, host);
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
                // `&` may be written `&amp;` (HTML) or `\u0026` (Go's JSON).
                let param = |kv: &str| match kv.split_once('=') {
                    Some((k, v)) if secret_param(k.strip_prefix("amp;").unwrap_or(k)) && !v.is_empty() => {
                        format!("{k}={MASK}")
                    }
                    // A URL inside a value (`next=https://…`) is a URL too.
                    Some((k, v)) if depth < NESTED_URLS && v.contains("://") => {
                        format!("{k}={}", redact_urls_within(v, depth + 1))
                    }
                    _ => kv.to_string(),
                };
                let params: Vec<String> = query
                    .split('&')
                    .map(|kv| kv.split("\\u0026").map(param).collect::<Vec<_>>().join("\\u0026"))
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
        let far = format!("https://u:p(w@host/{}?sig=SIG0020&code=CODE0021", "x".repeat(300));
        let cases = [
            ("GET https://api.example.com/x?filter[a]=1&access_token=tok12345678 200", "tok12345678"),
            // JDBC and matrix parameters: `;password=…` in the path.
            ("jdbc:postgresql://db:5432/app;user=ada;password=s3cret0040", "s3cret0040"),
            // A `/?#` in the password, then a `,` or `;` later in it: the `@` past them is still this URL's.
            ("fatal: unable to access 'https://deploy:Ab/9;xK0041@git.example.com/r.git/': 403", "xK0041"),
            ("https://ada:pa/ss,word0042@db.example.com/app", "word0042"),
            ("https://ada:p#ss;w0043@host.example.com/r", "w0043"),
            (r#"{"url":"https://ada:p\/w;x0044@db.example.com/app"}"#, "x0044"),
            ("https://ada:p@ss/w;x0045@db.example.com/app", "x0045"),
            // A JSON `\uXXXX` escape (Go's `<` `>`, Python's `ensure_ascii`) inside a password.
            (r#"{"url":"https://deploy:Xy\u003cZr0046@git.example.com/o/r.git"}"#, "Zr0046"),
            (r#"{"url": "https://ada:p\u00e4ssw0047@db.example.com/app"}"#, "ssw0047"),
            // Several hosts in one authority (libpq, MongoDB, Redis Sentinel), and a `;` in the user name (SMB domain, curl
            // login options): a `,` or `;` there ends nothing.
            ("mongodb://h1.example.com:27017,h2.example.com:27017/db?replicaSet=rs0&sig=Hx70048", "Hx70048"),
            ("mongodb://db1,db2/app?code=Hx70049 ok", "Hx70049"),
            ("mount: smb://CORP;svc_backup:Hx70050@nas.corp.local/backups failed", "Hx70050"),
            ("imap://alice;AUTH=*:Hx70051@mail.example.com/INBOX", "Hx70051"),
            // No user name, only a password (Redis): `/` or `?` in it as in any other.
            ("REDIS_URL=redis://:a8F/k2Hx70052+9w==@cache.example.com:6379/0", "Hx70052"),
            ("rediss://:Zx9?Hx70053@cache.example.com:6380", "Hx70053"),
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
            // Digits before the punctuation are not a port when an opening bracket follows them.
            ("origin\thttps://deploy:7(q)Zr0018@git.example.com/o/r.git (fetch)", "Zr0018"),
            ("fatal: unable to access 'https://deploy:42'ab0022@git.example.com/r/': 403", "ab0022"),
            ("https://deploy:Xy(7q):Zr0023@git.example.com/o/r.git", "Zr0023"),
            ("INFO -> https://deploy:Xy<q>Zr0030@git.example.com/r", "Zr0030"),
            // A password with digits and then `;`, or with `@` and then `;`, is no port and no `user@host`.
            ("url=postgres://ada:2024;Summer0031@db/app", "Summer0031"),
            ("postgres://ada:p@ss;w0rd0032@db/app", "w0rd0032"),
            // A backslash escaped in JSON is no escape of the next letter.
            ("{\"msg\":\"remote: https://ada:pa\\\\nss0033@db/app\"}", "ss0033"),
            // `&` written as `&amp;` (HTML) or `\u0026` (Go's JSON) still separates parameters.
            ("<a href=\"https://example.com/callback?state=xyz&amp;code=4f9a8b0034\">", "4f9a8b0034"),
            ("{\"url\":\"https://api.x.com/v1?a=1\\u0026sig=s3cr3t0035\"}", "s3cr3t0035"),
            // After a look past punctuation the rest of the URL is read the same way, escapes and all.
            ("{\"url\":\"https://deploy:pa(ss@h/v1?a=1\\u0026sig=S0037\"}", "S0037"),
            ("{\"url\":\"https:\\/\\/deploy:pa(ss@h\\/v1?a=1&sig=S0038\"}", "S0038"),
            ("{\"u\":\"https://x.example.com/?a=1\\u0026next=https://v:pa(ss0039@h.example.com/r\"}", "ss0039"),
            // PHP's JSON writes `/` as `\/`.
            ("{\"url\":\"https:\\/\\/ada:s3cret0036@db.example.com\\/app\"}", "s3cret0036"),
            // The quote a URL is wrapped in ends it only where a separator follows; a password may hold it.
            ("fatal: unable to access 'https://deploy:Xy(7q)Zr'0024@git.example.com/o/r.git/': 403", "0024"),
            // A URL in another's path is read on its own, punctuation and all.
            ("GET https://proxy.example.com/fetch/https://v:pa(ss0025@h2.example.com/r 200", "ss0025"),
            // Digits and then a closing bracket are a password's start, not a port: nothing a port ends with.
            ("origin\thttps://deploy:7)Zr0026@git.example.com/o/r.git (fetch)", "Zr0026"),
            // Inside a JSON string a `|` is part of the password, not a column's end.
            ("{\"url\":\"https://deploy:pw|Zr0027@git.example.com/o/r.git\"}", "Zr0027"),
            // So is one in a query value, and the parameters after it are still read.
            ("redirect https://a.example.com/login?next=https://v:pa(ss0028@b.example.com/x&token=tok0029", "ss0028"),
            ("redirect https://a.example.com/login?next=https://v:pa(ss0028@b.example.com/x&token=tok0029", "tok0029"),
            // A URL inside another's path is a URL too.
            ("GET https://proxy.example.com/fetch/https://v:inner0019@h2.example.com/r 200", "inner0019"),
            // The rest of a URL whose password held punctuation is still read for secrets, however long its path.
            (&far, "SIG0020"),
            (&far, "CODE0021"),
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
            "{\"repo\":\"ssh://git@github.com:o/r.git\",\"author\":\"ada@example.com\"}",
            "{\"image\":\"docker://nginx:latest\",\"m\":\"ops@example.com\"}",
            "<a href=\"http://localhost:8080\">ada@example.com</a>",
            "<a href=\"https://u:p\">ada@example.com</a>",
            "<url>http://localhost:3000</url><email>ada@example.com</email>",
            // A URL in the middle of a JSON string or of an element's text is wrapped by them too.
            "{\"level\":\"info\",\"msg\":\"listening on http://localhost:3000\",\"user\":\"ada@example.com\"}",
            "<p>Visit http://localhost:3000</p><p>ada@example.com</p>",
            "url=docker://nginx:latest|n=ada@example.com",
        ] {
            assert_eq!(redact(kept), kept);
        }
        // A URL's credentials go, and only they: the next field, with its email, stays.
        for (text, want) in [
            (
                "{\"url\":\"https://user:tok@github.com/o/r\",\"author\":\"ada@example.com\",\"id\":3}",
                "{\"url\":\"https://[redacted]@github.com/o/r\",\"author\":\"ada@example.com\",\"id\":3}",
            ),
            ("1|https://u:tok@h.com|ada@example.com|x", "1|https://[redacted]@h.com|ada@example.com|x"),
            ("x\nhttps://u:tok@h.com|ada@example.com|x", "x\nhttps://[redacted]@h.com|ada@example.com|x"),
            // Unquoted CSV: a `,` or `;` in the authority may be a password's, a user name's (`CORP;svc:pw@`) or part of a
            // host list (`h1:27017,h2:27017`), so with an `@` after it the URL is masked over, not risked.
            ("https://example.com,ada@example.com,x", "https://[redacted]@example.com,x"),
            ("https://example.com:8443,ada@example.com,x", "https://[redacted]@example.com,x"),
            ("https://deploy:pw@git.example.com,ada@example.com,x", "https://[redacted]@example.com,x"),
            ("https://ada@git.example.com,bob@example.com,x", "https://[redacted]@example.com,x"),
            ("https://u:p,w@host/r", "https://[redacted]@host/r"),
            // An escape in a JSON string ends a URL there; a `>` in prose is not an element's text.
            (
                "{\"data\":\"proxy=http://localhost:3128\\nadmin=ada@example.com\"}",
                "{\"data\":\"proxy=http://localhost:3128\\nadmin=ada@example.com\"}",
            ),
            ("INFO -> http://localhost:3000|ada@example.com|x", "INFO -> http://localhost:3000|ada@example.com|x"),
            ("<b>a</b> http://localhost:3000|ada@example.com|", "<b>a</b> http://localhost:3000|ada@example.com|"),
            // A `;` list (`key=value;…`, a connection string) as a CSV row.
            ("url=http://localhost:3000;mail=ada@example.com", "url=http://[redacted]@example.com"),
            ("url=https://deploy:pw@git.example.com;mail=ada@example.com", "url=https://[redacted]@example.com"),
            // One tie-break everywhere: a `,` or `;` after `user:pass@host`, or in a path, may be a password's, so the
            // URL runs to the last `@` and is masked over, credentials or not.
            ("url=https://ada:pa(ss@db;mail=bob@example.com", "url=https://[redacted]@example.com"),
            ("url=http://localhost:8080/api;contact=ops@corp.com", "url=http://[redacted]@corp.com"),
            ("DSN=postgres://ada:secret@db:5432/app;admin=root@example.com", "DSN=postgres://[redacted]@example.com"),
            ("http://localhost:3000/api,ada@example.com,x", "http://[redacted]@example.com,x"),
            ("ssh://git@github.com:o/r.git,ada@example.com,x", "ssh://[redacted]@example.com,x"),
            ("https://deploy:pw@git.example.com/o/r.git,ada@example.com,x", "https://[redacted]@example.com,x"),
            // The contract's other masked-over shapes, and the one that stays.
            (
                "url=https://host.example.com/path;contact=ops@corp.com",
                "url=https://host.example.com/path;contact=ops@corp.com",
            ),
            ("url=ssh://git@localhost:3000;mail=ada@example.com", "url=ssh://[redacted]@example.com"),
            ("https://ada@[::1],bob@example.com,x", "https://[redacted]@example.com,x"),
            ("postgres://db:5432,ada@example.com,x", "postgres://[redacted]@example.com,x"),
            ("http://localhost:4873/react@18 ok", "http://[redacted]@18 ok"),
            (
                r#"{"url":"https:\/\/api.example.com:8443\/u?email=a@b.com","a":"x"}"#,
                r#"{"url":"https:\/\/[redacted]@b.com","a":"x"}"#,
            ),
            (
                "{\"msg\":\"using proxy http://user:tok@proxy:8080\",\"pkg\":\"app@1.0.0\"}",
                "{\"msg\":\"using proxy http://[redacted]@proxy:8080\",\"pkg\":\"app@1.0.0\"}",
            ),
            (
                "<url>https://user:pw@host</url><email>ada@example.com</email>",
                "<url>https://[redacted]@host</url><email>ada@example.com</email>",
            ),
            (
                "{\"url\":\"https://u:p(q@host/r.git\",\"email\":\"ada@example.com\"}",
                "{\"url\":\"https://[redacted]@host/r.git\",\"email\":\"ada@example.com\"}",
            ),
        ] {
            assert_eq!(redact(text), want);
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
        for text in [
            "a://b(".repeat(100_000),
            "a://b(@".repeat(100_000),
            "a://u:p(@h".repeat(100_000),
            // A list of origins (`ALLOWED_ORIGINS=…`), URLs in paths, CSV cells: where each URL ends is found once.
            "https://a.example.com,".repeat(50_000),
            "a://h/".repeat(100_000),
            "a://h,x?".repeat(100_000),
            // JSON escapes a URL is read across.
            "a://h\\u0026".repeat(100_000),
            "a:\\/\\/h\\/".repeat(100_000),
        ] {
            let started = std::time::Instant::now();
            let _ = redact(&text);
            assert!(started.elapsed() < std::time::Duration::from_secs(2), "took {:?}", started.elapsed());
        }
    }

    /// Private key headers with no END line, one per line, are read in one pass: the END is looked for once.
    #[test]
    fn unclosed_private_keys_are_read_in_one_pass() {
        let text = "-----BEGIN PRIVATE KEY-----\n".repeat(40_000);
        let started = std::time::Instant::now();
        assert_eq!(redact(&text), text);
        assert!(started.elapsed() < std::time::Duration::from_secs(2), "took {:?}", started.elapsed());
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
