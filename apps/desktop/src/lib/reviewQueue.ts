/**
 * The review queue: every goal ready to accept, stepped through one after
 * another. Accepting or sending one back opens the next instead of going
 * back to the list. Kept in sessionStorage so a reload does not lose the
 * place; empty means no queue is running.
 */
import { createSignal } from "solid-js";

const KEY = "tower.reviewQueue";

const read = (): string[] => {
  try {
    const v = JSON.parse(sessionStorage.getItem(KEY) ?? "[]");
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
  } catch {
    return [];
  }
};

const [queue, setQueueSignal] = createSignal<string[]>(typeof sessionStorage === "undefined" ? [] : read());

function write(ids: string[]) {
  setQueueSignal(ids);
  sessionStorage.setItem(KEY, JSON.stringify(ids));
}

/** The goals still to review, in order (reactive). */
export const reviewQueue = queue;

/** Starts a queue over `ids` and returns the first to open, or null. */
export function startQueue(ids: string[]): string | null {
  write([...ids]);
  return ids[0] ?? null;
}

/** Where `id` stands in the queue: `{ i, n }` (1-based), or null when it is not queued. */
export function queuePosition(id: string): { i: number; n: number } | null {
  const q = queue();
  const i = q.indexOf(id);
  return i < 0 ? null : { i: i + 1, n: q.length };
}

/**
 * Called when `id` is done (accepted or sent back): removes it and returns
 * the next goal to open, or null when the queue is finished (and cleared).
 */
export function advanceQueue(id: string): string | null {
  const q = queue();
  const i = q.indexOf(id);
  if (i < 0) return null;
  const next = q[i + 1] ?? null;
  write(next ? q.slice(i + 1) : []);
  return next;
}

export function clearQueue() {
  write([]);
}
