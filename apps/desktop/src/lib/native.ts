/** Native popup menus and dialogs: they look and behave like macOS. */
import { CheckMenuItem, Menu, MenuItem, PredefinedMenuItem } from "@tauri-apps/api/menu";
import { ask as askDialog } from "@tauri-apps/plugin-dialog";

/**
 * A native confirmation sheet with the app icon. Destructive actions pass
 * `kind: "warning"`; `ok` is the verb ("Push", "Abandon"), never "OK".
 */
export async function ask(message: string, opts: { title?: string; ok: string; cancel: string; kind?: "info" | "warning" }) {
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
  return new Promise((resolve) => {
    let picked: T | null = null;
    void (async () => {
      const items = await Promise.all(
        choices.map((c) =>
          CheckMenuItem.new({
            text: c.label,
            checked: c.value === current,
            action: () => {
              picked = c.value;
            },
          }),
        ),
      );
      const menu = await Menu.new({ items });
      await menu.popup();
      // `popup` resolves after the menu closes; actions run before that.
      setTimeout(() => resolve(picked), 0);
    })();
  });
}

export interface Action {
  label: string;
  run: () => void;
  enabled?: boolean;
  separatorBefore?: boolean;
}

/** Pops up a native menu of actions (overflow "…" menus, context menus). */
export async function popupActions(actions: Action[]) {
  const items = [];
  for (const a of actions) {
    if (a.separatorBefore) items.push(await PredefinedMenuItem.new({ item: "Separator" }));
    items.push(await MenuItem.new({ text: a.label, enabled: a.enabled ?? true, action: a.run }));
  }
  const menu = await Menu.new({ items });
  await menu.popup();
}
