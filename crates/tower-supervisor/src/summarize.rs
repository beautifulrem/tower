//! One-line summaries of tool calls for the live line and trace. They must be
//! steerable details ("bash · pnpm test"), never "working…".

use serde_json::Value;

const MAX: usize = 160;

fn clip(s: &str) -> String {
    let one_line = s.lines().find(|l| !l.trim().is_empty()).unwrap_or("").trim();
    if one_line.chars().count() > MAX {
        let mut c: String = one_line.chars().take(MAX - 1).collect();
        c.push('…');
        c
    } else {
        one_line.to_string()
    }
}

/// Shortens absolute paths inside the workspace to workspace-relative ones.
pub fn relative<'a>(path: &'a str, workspace: &str) -> &'a str {
    path.strip_prefix(workspace).map(|p| p.trim_start_matches('/')).filter(|p| !p.is_empty()).unwrap_or(path)
}

pub fn tool_call(tool: &str, args: &Value, workspace: &str) -> String {
    let s = |k: &str| args.get(k).and_then(Value::as_str).unwrap_or_default();
    match tool {
        "bash" => clip(s("command")),
        "read" | "edit" | "write" => clip(relative(s("path"), workspace)),
        "grep" => clip(&format!("{} {}", s("pattern"), s("path"))),
        "find" | "ls" => clip(s("path")),
        "log" => clip(s("text")),
        "ask_user" => clip(s("question")),
        "submit" => clip(s("summary")),
        _ => clip(&args.to_string()),
    }
}

pub fn tool_result(text: &str) -> String {
    clip(text)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn summaries_are_one_short_line() {
        let args = serde_json::json!({"command": "pnpm test -- checkout\necho done"});
        assert_eq!(tool_call("bash", &args, "/w"), "pnpm test -- checkout");
        let args = serde_json::json!({"path": "/w/G-1/src/a.ts"});
        assert_eq!(tool_call("edit", &args, "/w/G-1"), "src/a.ts");
        assert!(tool_result(&"x".repeat(500)).chars().count() <= MAX);
    }
}
