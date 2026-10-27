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

/** How one view gives way to the next: a plain crossfade, a change of space, or the queue turning a page. */
export type TransitionKind = "view" | "space" | "page";

/**
 * A change of view is a short crossfade (120ms) so the eye keeps its place;
 * entering or leaving review is a change of space (full screen, no title
 * bar) and gets the longer spatial one (docs/12 §12.7: 220ms). The queue's
 * step from one review to the next is a page turn in the same space: the
 * file tree stays put and only the diff changes, over the short crossfade.
 * Nothing animates when the system asks for reduced motion.
 */
export function transitionKind(from: Route, to: Route): TransitionKind {
  if (from.name === "review" && to.name === "review") return "page";
  return from.name === "review" || to.name === "review" ? "space" : "view";
}

function transition(from: Route, to: Route, apply: () => void) {
  const dvt = document as Document & { startViewTransition?: (cb: () => void) => { finished?: Promise<void> } | undefined };
  if (!dvt.startViewTransition || matchMedia("(prefers-reduced-motion: reduce)").matches) return apply();
  document.documentElement.dataset.transition = transitionKind(from, to);
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

/** The project fields a "fix it in the project settings" link can point at. */
export type ProjectField = "test" | "setup" | "local" | "holdout";
let pendingField: { project: string; field: ProjectField } | null = null;

/** Settings, opened on one project's block with one of its fields in view and focused: where a card or a line says the fix is. */
export function goProjectSetting(project: string, field: ProjectField) {
  pendingField = { project, field };
  go({ name: "settings" });
}

/** For the project block as it mounts: the field a link sent you to, once. */
export function takeProjectField(project: string): ProjectField | null {
  if (pendingField?.project !== project) return null;
  const f = pendingField.field;
  pendingField = null;
  return f;
}

export function back() {
  const s = stack();
  if (s.length <= 1) return;
  transition(s[s.length - 1], s[s.length - 2], () => setStack((st) => st.slice(0, -1)));
}

export function canGoBack(): boolean {
  return stack().length > 1;
}
