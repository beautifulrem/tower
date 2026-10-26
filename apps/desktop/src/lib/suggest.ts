/**
 * Suggestion blocks in review comments (GitHub's ```suggestion fence): the
 * reviewer writes the lines that should replace the commented line, and can
 * apply them in one click — the file is rewritten in the workspace as the
 * reviewer's own edit — or send them to the agent with the comment.
 */

const FENCE = /```suggestion[^\n]*\n([\s\S]*?)\n?```/;

/** The replacement text of a comment's suggestion block, or null when it has none. */
export function suggestionOf(comment: string): string | null {
  const m = FENCE.exec(comment);
  return m ? m[1] : null;
}

/** The comment without its suggestion block, for display next to the block. */
export function withoutSuggestion(comment: string): string {
  return comment.replace(FENCE, "").trim();
}

/**
 * The file with line `line` (1-based, new side) replaced by `replacement`
 * (which may span several lines or be empty, deleting the line). The file's
 * trailing newline is kept as it was.
 */
export function applySuggestion(fileText: string, line: number, replacement: string): string {
  const trailing = fileText.endsWith("\n");
  const lines = fileText.split("\n");
  if (trailing) lines.pop();
  if (line < 1 || line > lines.length) return fileText;
  const repl = replacement === "" ? [] : replacement.split("\n");
  lines.splice(line - 1, 1, ...repl);
  return lines.join("\n") + (trailing ? "\n" : "");
}
