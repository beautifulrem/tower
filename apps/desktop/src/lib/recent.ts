/** The command palette's recently used items: most recent first, at most eight. */
const KEY = "tower.recentCommands";
const MAX = 8;

export function recentIds(): string[] {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? "[]");
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
  } catch {
    return [];
  }
}

export function bumpRecent(id: string) {
  const list = [id, ...recentIds().filter((x) => x !== id)].slice(0, MAX);
  localStorage.setItem(KEY, JSON.stringify(list));
}
