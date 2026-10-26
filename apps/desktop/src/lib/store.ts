/**
 * The renderer's read-only replica (ADR-005): loaded once, then kept current
 * by supervisor updates. Nothing here is authoritative.
 */
import { createStore, produce, reconcile } from "solid-js/store";

import type { EnvironmentStatus } from "../gen/EnvironmentStatus";
import type { GoalSummary } from "../gen/GoalSummary";
import type { InboxItem } from "../gen/InboxItem";
import type { ProjectView } from "../gen/ProjectView";
import type { Settings } from "../gen/Settings";
import type { ToastLevel } from "../gen/ToastLevel";
import type { TraceEntry } from "../gen/TraceEntry";
import { api, errorText, onUpdate } from "./api";
import { go } from "./nav";

export interface Toast {
  id: number;
  level: ToastLevel;
  text: string;
}

interface State {
  loaded: boolean;
  loadError: string | null;
  env: EnvironmentStatus | null;
  settings: Settings | null;
  projects: ProjectView[];
  goals: Record<string, GoalSummary>;
  inbox: InboxItem[];
  /** Assistant text currently streaming, per goal (Watch mode). */
  streams: Record<string, string>;
  toasts: Toast[];
  /** Ticks so relative times stay fresh without per-component timers. */
  now: number;
}

const [state, setState] = createStore<State>({
  loaded: false,
  loadError: null,
  env: null,
  settings: null,
  projects: [],
  goals: {},
  inbox: [],
  streams: {},
  toasts: [],
  now: Date.now(),
});

export { state };

type TraceListener = (e: TraceEntry) => void;
const traceListeners = new Map<string, Set<TraceListener>>();

/** Subscribe to live trace entries of one goal. Returns an unsubscribe. */
export function onTrace(goalId: string, fn: TraceListener): () => void {
  let set = traceListeners.get(goalId);
  if (!set) traceListeners.set(goalId, (set = new Set()));
  set.add(fn);
  return () => set!.delete(fn);
}

let toastSeq = 0;
export function toast(level: ToastLevel, text: string, ttl = 4200) {
  const id = ++toastSeq;
  setState("toasts", (t) => [...t.slice(-3), { id, level, text }]);
  setTimeout(() => setState("toasts", (t) => t.filter((x) => x.id !== id)), ttl);
}

/** Runs an action, surfacing failures as an error toast. */
export async function act<T>(fn: () => Promise<T>, success?: string): Promise<T | undefined> {
  try {
    const r = await fn();
    if (success) toast("success", success);
    return r;
  } catch (e) {
    toast("error", errorText(e), 6000);
    return undefined;
  }
}

export async function refreshEnvironment() {
  const [env, settings] = await Promise.all([api.environment(), api.settings()]);
  setState({ env, settings });
}

export async function refreshProjects() {
  setState("projects", reconcile(await api.projects()));
}

export async function init() {
  try {
    const unlisten = onUpdate((u) => {
      switch (u.type) {
        case "goal":
          setState("goals", u.goal.id, reconcile(u.goal));
          break;
        case "inbox":
          setState("inbox", reconcile(u.items, { key: "id" }));
          break;
        case "projects":
          setState("projects", reconcile(u.projects, { key: "id" }));
          break;
        case "stream":
          setState("streams", u.goal_id, u.text);
          break;
        case "trace":
          traceListeners.get(u.entry.goal_id)?.forEach((fn) => fn(u.entry));
          if (u.entry.event.kind === "assistant_message") setState("streams", u.entry.goal_id, "");
          break;
        case "toast":
          toast(u.level, u.text);
          break;
      }
    });
    const [goals, inbox, projects] = await Promise.all([api.goals(), api.inbox(), api.projects()]);
    await refreshEnvironment();
    setState(
      produce((s) => {
        s.goals = Object.fromEntries(goals.map((g) => [g.id, g]));
        s.inbox = inbox;
        s.projects = projects;
        s.loaded = true;
      }),
    );
    setInterval(() => setState("now", Date.now()), 15_000);
    openStartupRoute(await api.startupRoute());
    await unlisten;
  } catch (e) {
    setState({ loadError: errorText(e), loaded: true });
  }
}

/** `goal/G-0001`, `review/G-0001`, `inbox`, `settings`, `new`. */
function openStartupRoute(r: string | null) {
  if (!r) return;
  const [name, id] = r.split("/");
  if ((name === "goal" || name === "review") && id) go({ name, id });
  else if (name === "inbox" || name === "settings" || name === "overview") go({ name });
  else if (name === "new") go({ name: "new" });
}

export function goalList(): GoalSummary[] {
  return Object.values(state.goals).sort((a, b) => b.created_at - a.created_at);
}
