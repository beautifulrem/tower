/**
 * The steps a look criterion takes on the page before its picture, one per
 * line: `click <selector>`, `type <selector> <text>`, `press <key>`,
 * `wait <ms>` (at most 10 000), `wait for <selector>`. The supervisor parses
 * them (`LookStep::parse` in tower-core) and its validation words what is
 * wrong; this mirror only says which line to mark while you type.
 */
export function lookStepOk(line: string): boolean {
  const l = line.trim();
  const at = l.search(/\s/);
  const verb = at < 0 ? l : l.slice(0, at);
  const rest = at < 0 ? "" : l.slice(at).trim();
  switch (verb) {
    case "click":
    case "press":
      return rest !== "";
    case "type":
      return /\s/.test(rest);
    case "wait":
      if (rest.startsWith("for ")) return rest.slice(4).trim() !== "";
      return /^\d+$/.test(rest) && Number(rest) <= 10_000;
    default:
      return false;
  }
}

/** A worked example for the n-th step's empty field (0-based): the five verbs in the order a checkout would use them. */
export const STEP_EXAMPLES = ["click #buy", "type #qty 2", "press Enter", "wait for .total", "wait 500"];
