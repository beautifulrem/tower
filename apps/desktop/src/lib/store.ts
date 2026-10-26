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
import { setThemeChoice } from "./theme";

export interface ToastAction {
  label: string;
  run: () => void;
}

export interface Toast {
  id: number;
  level: ToastLevel;
  text: string;
  /** The goal it is about: the toast offers to open it. */
  goalId?: string | null;
  action?: ToastAction;
  /** Fading out: removed 100ms later. */
  leaving?: boolean;
}

/** One line of the activity log: errors and warnings since Tower started. */
export interface ActivityEntry {
  id: number;
  at: number;
  level: ToastLevel;
  text: string;
  goalId: string | null;
}

export const ACTIVITY_MAX = 200;

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
  activity: ActivityEntry[];
  /** Errors and warnings logged since the activity panel was last opened. */
  unseenActivity: number;
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
  activity: [],
  unseenActivity: 0,
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
let activitySeq = 0;

/** Errors and warnings are kept (the last 200) so a missed toast is not lost. */
export function logActivity(level: ToastLevel, text: string, goalId: string | null = null) {
  if (level !== "error" && level !== "warning") return;
  setState(
    produce((s) => {
      s.activity.push({ id: ++activitySeq, at: Date.now(), level, text, goalId });
      if (s.activity.length > ACTIVITY_MAX) s.activity.splice(0, s.activity.length - ACTIVITY_MAX);
      s.unseenActivity++;
    }),
  );
}

export function markActivitySeen() {
  setState("unseenActivity", 0);
}

export function clearActivity() {
  setState({ activity: [], unseenActivity: 0 });
}

/** At most two toasts; each leaves with a 100ms fade (human-caused removal). */
export function toast(level: ToastLevel, text: string, opts: { ttl?: number; goalId?: string | null; action?: ToastAction } = {}) {
  const id = ++toastSeq;
  setState("toasts", (t) => [...t.slice(-1), { id, level, text, goalId: opts.goalId, action: opts.action }]);
  logActivity(level, text, opts.goalId ?? null);
  const ttl = opts.ttl ?? (level === "error" ? 6000 : opts.action ? 6000 : 4200);
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
    toast("error", errorText(e));
    return undefined;
  }
}

export async function refreshEnvironment() {
  const [env, settings] = await Promise.all([api.environment(), api.settings()]);
  setState({ env, settings });
}

/** Saves a partial change to the settings (quiet hours, muted goals) and reloads them. */
export async function patchSettings(patch: Partial<Settings>): Promise<boolean> {
  const current = state.settings ?? (await api.settings());
  const ok = await act(() => api.saveSettings({ ...current, ...patch }));
  if (ok === undefined) return false;
  await refreshEnvironment();
  return true;
}

/** Whether notifications are silenced right now. */
export function quietNow(): boolean {
  const until = state.settings?.quiet_until;
  return !!until && until > state.now;
}

/** Mutes or unmutes one goal's notifications. */
export async function setGoalMuted(id: string, muted: boolean): Promise<boolean> {
  const list = state.settings?.muted_goals ?? [];
  const next = muted ? [...new Set([...list, id])] : list.filter((g) => g !== id);
  return patchSettings({ muted_goals: next });
}

export async function refreshProjects() {
  setState("projects", reconcile(await api.projects()));
}

let subscribed: Promise<unknown> | null = null;

function subscribe() {
  if (subscribed) return subscribed;
  subscribed = onUpdate((u) => {
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
        // The goal's own page already shows what the toast says: log it, stay quiet.
        const r = route();
        if (u.goal_id && (r.name === "goal" || r.name === "review") && r.id === u.goal_id) {
          logActivity(u.level, u.text, u.goal_id);
          break;
        }
        toast(u.level, u.text, { goalId: u.goal_id });
        break;
      }
    }
  });
  return subscribed;
}

/** Loads the replica. Safe to call again after a failure (the Retry button). */
export async function init() {
  setState({ loadError: null });
  try {
    const sub = subscribe();
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
    if (!ticking) {
      ticking = true;
      setInterval(() => setState("now", Date.now()), 15_000);
      // Tower brought to the front by a notification: open what it was about.
      void onOpen((r) => openStartupRoute(r));
    }
    openStartupRoute(await api.startupRoute());
    await sub;
  } catch (e) {
    // The data directory is still worth knowing when the rest failed.
    void api.environment().then((env) => setState({ env })).catch(() => {});
    setState({ loadError: errorText(e), loaded: true });
  }
}
let ticking = false;

/**
 * `goal/G-0001`, `review/G-0001`, `inbox`, `settings`, `new`. A trailing
 * `?theme=light|dark|system` (used by the screenshot tooling) sets the theme.
 */
function openStartupRoute(route: string | null) {
  if (!route) return;
  const [path, query] = route.split("?");
  const theme = new URLSearchParams(query ?? "").get("theme");
  if (theme === "light" || theme === "dark" || theme === "system") setThemeChoice(theme);
  const [name, id] = path.split("/");
  if ((name === "goal" || name === "review") && id) go({ name, id });
  else if (name === "inbox" || name === "settings" || name === "overview") go({ name });
  else if (name === "new") go({ name: "new" });
}

export function goalList(): GoalSummary[] {
  return Object.values(state.goals).sort((a, b) => b.created_at - a.created_at);
}
