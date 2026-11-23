/**
 * Native popup menus and dialogs: they look and behave like macOS.
 * Popup menus talk directly to Tauri's `plugin:menu` IPC (`new` / `popup`) so
 * the full `@tauri-apps/api/menu` class hierarchy (`Submenu`, `IconMenuItem`,
 * `Image`, `DPI`) stays out of the bundle; dialogs load lazily on first click.
 */
import { Channel, invoke } from "@tauri-apps/api/core";

type MenuKind = "Menu" | "MenuItem" | "Check" | "Predefined";

async function newMenuItem(kind: MenuKind, options: Record<string, unknown>, action?: () => void): Promise<[number, MenuKind]> {
  const handler = new Channel<string>();
  if (action) handler.onmessage = () => action();
  const res = await invoke<[number, string]>("plugin:menu|new", { kind, options, handler });
  return [res?.[0] ?? 0, kind];
}

async function popupMenu(items: [number, MenuKind][]) {
  const [rid] = await newMenuItem("Menu", { items });
  await invoke("plugin:menu|popup", { rid, kind: "Menu", window: null, at: null });
}

/**
 * A native confirmation sheet with the app icon. Destructive actions pass
 * `kind: "warning"`; `ok` is the verb ("Push", "Abandon"), never "OK".
 */
export async function ask(message: string, opts: { title?: string; ok: string; cancel: string; kind?: "info" | "warning" }) {
  const { askDialog } = await import("../views/Learning");
  return askDialog(message, {
    title: opts.title ?? "Tower",
    kind: opts.kind ?? "info",
    okLabel: opts.ok,
    cancelLabel: opts.cancel,
  });
}

export interface Choice<T extends string> {
  value: T;
  label: string;
}

/** Pops up a native menu of choices with a check on `current`. */
export async function popupChoice<T extends string>(choices: Choice<T>[], current: T): Promise<T | null> {
  let picked: T | null = null;
  const items = await Promise.all(
    choices.map((c) => newMenuItem("Check", { text: c.label, checked: c.value === current }, () => (picked = c.value))),
  );
  await popupMenu(items);
  // `popup` resolves after the menu closes; channel actions fire in a tick.
  return new Promise((resolve) => setTimeout(() => resolve(picked), 0));
}

export interface Action {
  label: string;
  run: () => void;
  enabled?: boolean;
  separatorBefore?: boolean;
}

/** Pops up a native menu of actions (overflow "…" menus, context menus). */
export async function popupActions(actions: Action[]) {
  const items: [number, MenuKind][] = [];
  for (const a of actions) {
    if (a.separatorBefore) items.push(await newMenuItem("Predefined", { item: "Separator" }));
    items.push(await newMenuItem("MenuItem", { text: a.label, enabled: a.enabled ?? true }, a.run));
  }
  await popupMenu(items);
}
