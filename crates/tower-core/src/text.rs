//! Short text derived from what the human wrote.

/// Display width: CJK and other wide characters count as two columns.
fn width(c: char) -> usize {
    match c as u32 {
        0x1100..=0x115F | 0x2E80..=0xA4CF | 0xAC00..=0xD7A3 | 0xF900..=0xFAFF | 0xFE30..=0xFE4F | 0xFF00..=0xFF60 => 2,
        _ => 1,
    }
}

/// A goal title from a one-sentence intent: the first clause, cut at a word
/// boundary with an ellipsis when it is still too long, and never ending
/// inside an unclosed bracket.
pub fn title_from_intent(intent: &str) -> String {
    const MAX: usize = 56;
    let intent = intent.trim();
    let line = intent.lines().next().unwrap_or("").trim();
    // The first sentence; then, if still long, the first clause.
    let mut s = cut_at(line, &['。', '！', '？', '；', '!', '?', ';']).unwrap_or(line);
    if let Some(sentence_end) = s.find(". ") {
        s = &s[..sentence_end];
    }
    if s.chars().map(width).sum::<usize>() > MAX
        && let Some(clause) = cut_at(s, &['，', '：', '（', ',', ':', '—'])
        && clause.chars().map(width).sum::<usize>() >= 8
    {
        s = clause;
    }
    let s = s.trim_end_matches(['.', '。', ' ']);
    if s.chars().map(width).sum::<usize>() <= MAX {
        return s.to_string();
    }
    let mut out = String::new();
    let mut w = 0;
    let mut last_break = None;
    for c in s.chars() {
        if w + width(c) > MAX - 1 {
            break;
        }
        if c == ' ' {
            last_break = Some(out.len());
        }
        out.push(c);
        w += width(c);
    }
    // Latin text is cut at a word boundary; CJK can break anywhere.
    if let Some(b) = last_break.filter(|&b| b * 2 > out.len() && out.is_ascii()) {
        out.truncate(b);
    }
    // Drop an unclosed bracket and what follows it.
    for (open, close) in [('(', ')'), ('（', '）'), ('[', ']'), ('「', '」')] {
        if let Some(i) = out.rfind(open)
            && !out[i..].contains(close)
            && i > 0
        {
            out.truncate(i);
        }
    }
    format!("{}…", out.trim_end_matches([' ', ',', '，', '、', '-', '—']))
}

fn cut_at<'a>(s: &'a str, stops: &[char]) -> Option<&'a str> {
    s.find(|c| stops.contains(&c)).map(|i| s[..i].trim()).filter(|p| !p.is_empty())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn titles_are_whole_clauses() {
        assert_eq!(title_from_intent("Fix the double charge on checkout"), "Fix the double charge on checkout");
        assert_eq!(title_from_intent("修复购物车总价计算。另外顺便整理测试"), "修复购物车总价计算");
        assert_eq!(
            title_from_intent(
                "给 total() 增加可选的税率参数 taxRate（默认 0，按折扣后的金额计算），并补上测试和文档说明"
            ),
            "给 total() 增加可选的税率参数 taxRate"
        );
        let long = title_from_intent(
            "Make the importer accept files with a byte order mark and mixed line endings without losing rows anywhere",
        );
        assert!(long.ends_with('…') && !long.contains("anyw"), "{long}");
        assert!(long.chars().count() <= 56);
        let cjk = title_from_intent(
            "在不改变公共接口的前提下把订单导出模块从回调改写为异步函数并保留原有的错误处理语义与日志格式",
        );
        assert!(cjk.ends_with('…'));
        assert!(cjk.chars().map(width).sum::<usize>() <= 56);
    }
}
