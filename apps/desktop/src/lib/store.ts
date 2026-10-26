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
import { api, errorText, onOpen, onUpdate } from "./api";
import { go, route } from "./nav";

export interface Toast {
  id: number;
  level: ToastLevel;
  text: string;
  /** Fading out: removed 100ms later. */
  leaving?: boolean;
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
/** At most two toasts; each leaves with a 100ms fade (human-caused removal). */
export function toast(level: ToastLevel, text: string, ttl = 4200) {
  const id = ++toastSeq;
  setState("toasts", (t) => [...t.slice(-1), { id, level, text }]);
  setTimeout(() => dismissToast(id), ttl);
}
export function dismissToast(id: number) {
  setState("toasts", (t) => t.map((x) => (x.id === id ? { ...x, leaving: true } : x)));
  setTimeout(() => setState("toasts", (t) => t.filter((x) => x.id !== id)), 110);
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
        case "traces":
          for (const entry of u.entries) {
            traceListeners.get(entry.goal_id)?.forEach((fn) => fn(entry));
            if (entry.event.kind === "assistant_message") setState("streams", entry.goal_id, "");
          }
          break;
        case "toast": {
          // A goal's own page already shows its decision card: no toast there.
          const m = /\b(G-\d{4})\b/.exec(u.text);
          const r = route();
          if (m && r.name === "goal" && r.id === m[1]) break;
          toast(u.level, u.text);
          break;
        }
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
    // Tower brought to the front by a notification: open what it was about.
    void onOpen((r) => openStartupRoute(r));
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
