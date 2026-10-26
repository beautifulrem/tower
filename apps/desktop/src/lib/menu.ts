/**
 * Native menu bar commands. The Rust side forwards each custom item's id;
 * views register handlers for the ids they own while mounted.
 */
import { listen } from "@tauri-apps/api/event";
import { onCleanup } from "solid-js";

type Handler = () => void;
const handlers = new Map<string, Handler[]>();

void listen<string>("tower://menu", (e) => {
  const list = handlers.get(e.payload);
  list?.[list.length - 1]?.();
});

/** Handles menu items while the calling component is mounted (latest wins). */
export function useMenu(map: Record<string, Handler>) {
  for (const [id, fn] of Object.entries(map)) {
    handlers.set(id, [...(handlers.get(id) ?? []), fn]);
  }
  onCleanup(() => {
    for (const [id, fn] of Object.entries(map)) {
      handlers.set(id, (handlers.get(id) ?? []).filter((f) => f !== fn));
    }
  });
}
