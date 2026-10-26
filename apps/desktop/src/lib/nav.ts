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

/**
 * A change of view is a short crossfade (120ms) so the eye keeps its place;
 * entering or leaving review is a change of space (full screen, no title
 * bar) and gets the longer spatial one (docs/12 §12.7: 220ms). Nothing
 * animates when the system asks for reduced motion.
 */
function transition(from: Route, to: Route, apply: () => void) {
  const crosses = (from.name === "review") !== (to.name === "review");
  const dvt = document as Document & { startViewTransition?: (cb: () => void) => { finished?: Promise<void> } | undefined };
  if (!dvt.startViewTransition || matchMedia("(prefers-reduced-motion: reduce)").matches) return apply();
  document.documentElement.dataset.transition = crosses ? "space" : "view";
  const vt = dvt.startViewTransition(apply);
  void vt?.finished?.finally(() => delete document.documentElement.dataset.transition);
}

export function go(r: Route) {
  const cur = route();
  if (JSON.stringify(cur) === JSON.stringify(r)) return;
  transition(cur, r, () => {
    // Top-level destinations reset the stack; detail views push onto it.
    if (r.name === "overview") setStack([r]);
    else if (r.name === "inbox" || r.name === "settings") setStack([{ name: "overview" }, r]);
    else setStack((s) => [...s, r].slice(-12));
  });
}

export function back() {
  const s = stack();
  if (s.length <= 1) return;
  transition(s[s.length - 1], s[s.length - 2], () => setStack((st) => st.slice(0, -1)));
}

export function canGoBack(): boolean {
  return stack().length > 1;
}
