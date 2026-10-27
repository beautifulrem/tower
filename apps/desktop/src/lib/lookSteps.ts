/**
 * The steps a look criterion takes on the page before its picture, one per
 * line: `click <selector>`, `type <selector> <text>`, `press <key>`,
 * `wait <ms>` (at most 10 000), `wait for <selector>`. The supervisor parses
 * them (`LookStep::parse` in tower-core) and its validation words what is
 * wrong on ratifying; this mirror says, while you type, which line is wrong
 * and why, in the line's own place.
 */

/** Why a step line cannot run: the verb is unknown, or it is missing what it acts on. */
export type StepProblem = "verb" | "click" | "type" | "press" | "waitFor" | "wait";

/** What is wrong with one step line, or null when it would run (an empty line is not wrong yet). */
export function lookStepProblem(line: string): StepProblem | null {
  const l = line.trim();
  if (!l) return null;
  const at = l.search(/\s/);
  const verb = at < 0 ? l : l.slice(0, at);
  const rest = at < 0 ? "" : l.slice(at).trim();
  switch (verb) {
    case "click":
      return rest !== "" ? null : "click";
    case "press":
      return rest !== "" ? null : "press";
    case "type":
      return /\s/.test(rest) ? null : "type";
    case "wait":
      if (rest === "for" || rest.startsWith("for ")) return rest.slice(3).trim() !== "" ? null : "waitFor";
      return /^\d+$/.test(rest) && Number(rest) <= 10_000 ? null : "wait";
    default:
      return "verb";
  }
}

export function lookStepOk(line: string): boolean {
  return line.trim() !== "" && lookStepProblem(line) === null;
}

/** The five verbs, as the steps' column head lists them. */
export const STEP_VERBS = ["click", "type", "press", "wait", "wait for"];

/** A worked example for the n-th step's empty field (0-based): the five verbs in the order a checkout would use them. */
export const STEP_EXAMPLES = ["click #buy", "type #qty 2", "press Enter", "wait for .total", "wait 500"];
