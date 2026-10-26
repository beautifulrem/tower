/** View routing: a small stack, so Esc and ⌘[ always go back one step. */
import { createSignal } from "solid-js";

export type Route =
  | { name: "overview" }
  | { name: "inbox" }
  | { name: "goal"; id: string }
  | { name: "review"; id: string }
  | { name: "new"; projectId?: string; draftId?: string; amendId?: string }
  | { name: "settings" };

const [stack, setStack] = createSignal<Route[]>([{ name: "overview" }]);

export function route(): Route {
  const s = stack();
  return s[s.length - 1];
}

export function go(r: Route) {
  const cur = route();
  if (JSON.stringify(cur) === JSON.stringify(r)) return;
  // Top-level destinations reset the stack; detail views push onto it.
  if (r.name === "overview") setStack([r]);
  else if (r.name === "inbox" || r.name === "settings") setStack([{ name: "overview" }, r]);
  else setStack((s) => [...s, r].slice(-12));
}

export function back() {
  setStack((s) => (s.length > 1 ? s.slice(0, -1) : s));
}

export function canGoBack(): boolean {
  return stack().length > 1;
}
