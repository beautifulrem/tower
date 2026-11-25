/**
 * The renderer's read-only replica (ADR-005): loaded once, then kept current
 * by supervisor updates. Nothing here is authoritative.
 */
import { createStore, produce, reconcile } from "solid-js/store";

import type { EnvironmentStatus } from "../gen/EnvironmentStatus";
import type { GoalSummary } from "../gen/GoalSummary";
import type { InboxItem } from "../gen/InboxItem";
import type { ProjectView } from "../gen/ProjectView";
import type { QuietHours } from "../gen/QuietHours";
import type { Settings } from "../gen/Settings";
import type { ToastLevel } from "../gen/ToastLevel";
import type { TraceEntry } from "../gen/TraceEntry";
import { api, errorText, onOpen, onUpdate } from "./api";
import type { EngineDescriptor, SandboxPosture } from "./apiTypes";
import { ensureLocale, localeOf } from "./i18n";
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

export interface Pulse {
  /** When the goal's event stream last moved (ms since the epoch). */
  at: number;
  /** The tool call in flight longest, if one started and has not ended. */
  tool: { name: string; since: number } | null;
  /** Every call in flight, by its id: an engine may run tools side by side, and one ending leaves the others running
   *  (review 16: a single slot read the run as idle while its command still ran). */
  calls?: Record<string, { name: string; since: number }>;
}

interface State {
  loaded: boolean;
  loadError: string | null;
  env: EnvironmentStatus | null;
  settings: Settings | null;
  projects: ProjectView[];
  goals: Record<string, GoalSummary>;
  inbox: InboxItem[];
  /**
   * Decisions put aside with "remind me later" (`snoozed_until` set), so the
   * inbox can say where a card went. The supervisor's list, sent with every
   * inbox update, so it survives a restart.
   */
  snoozed: InboxItem[];
  /** Assistant text currently streaming, per goal (Watch mode). */
  streams: Record<string, string>;
  /**
   * The engine's pulse per goal: when its event stream last moved (a trace
   * entry or streamed text) and the tool call still in flight, if any. The
   * heartbeat reads this, so a long tool run is "a tool running for 3m",
   * not "silent".
   */
  pulse: Record<string, Pulse>;
  toasts: Toast[];
  activity: ActivityEntry[];
  /** Errors and warnings logged since the activity panel was last opened. */
  unseenActivity: number;
  /**
   * Why the phone page is not being served although it is switched on
   * (Tailscale disconnected, the port taken), in the supervisor's words;
   * null when it is served or off. Read with the settings, so the title bar
   * can say it and Settings can show the way out.
   */
  remoteProblem: string | null;
  /** Detected OS sandbox backend & microVM posture. */
  sandboxPosture: SandboxPosture | null;
  /** Engine descriptors with trust tiers from backend. */
  engines: EngineDescriptor[];
  /** Pending memory proposals awaiting human ratification. */
  pendingProposals: number;
  /** Enabled scheduled goals & merge queue conflicts for the sidebar rail. */
  activeSchedules: number;
  mergeConflicts: number;
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
  snoozed: [],
  streams: {},
  pulse: {},
  toasts: [],
  activity: [],
  unseenActivity: 0,
  remoteProblem: null,
  sandboxPosture: null,
  engines: [],
  pendingProposals: 0,
  activeSchedules: 0,
  mergeConflicts: 0,
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

/**
 * At most two toasts; each leaves with a 100ms fade (human-caused removal).
 * Errors and warnings stay six seconds — a warning about nothing in
 * particular (the phone page could not start) has no page to say it again,
 * only the activity log — the rest four.
 */
export function toast(level: ToastLevel, text: string, opts: { ttl?: number; goalId?: string | null; action?: ToastAction } = {}) {
  const id = ++toastSeq;
  setState("toasts", (t) => [...t.slice(-1), { id, level, text, goalId: opts.goalId, action: opts.action }]);
  logActivity(level, text, opts.goalId ?? null);
  const ttl = opts.ttl ?? (level === "error" || level === "warning" || opts.action ? 6000 : 4200);
  setTimeout(() => dismissToast(id), ttl);
}
export function dismissToast(id: number) {
  setState("toasts", (t) => t.map((x) => (x.id === id ? { ...x, leaving: true } : x)));
  setTimeout(() => setState("toasts", (t) => t.filter((x) => x.id !== id)), 110);
}

/**
 * The same question asked twice (a pause event the supervisor sent again)
 * is one card: the newest of each (goal, kind, subject) stands, in the
 * original order. Insurance on the reading side; the fix belongs upstream.
 */
export function dedupeInbox(items: InboxItem[]): InboxItem[] {
  const newest = new Map<string, InboxItem>();
  for (const i of items) {
    const k = `${i.goal_id}\u0000${i.kind}\u0000${i.subject.trim()}`;
    const have = newest.get(k);
    if (!have || i.created_at >= have.created_at) newest.set(k, i);
  }
  return items.filter((i) => newest.get(`${i.goal_id}\u0000${i.kind}\u0000${i.subject.trim()}`) === i);
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
  // The phone page's problem is part of the environment's truth: read it whenever the settings are, so it is never stale.
  const [remoteProblem, sandboxPosture, engines] = await Promise.all([
    settings.remote_enabled ? api.remoteInfo().then((i) => i?.problem ?? null, () => null) : Promise.resolve(null),
    api.sandboxPosture().catch(() => null),
    api.engines().catch(() => null),
  ]);
  setState({ remoteProblem, sandboxPosture: sandboxPosture ?? null, engines: Array.isArray(engines) ? engines : [] });
}

/** Refreshes lightweight console counters (ratification queue, schedules, merge conflicts) without blocking first paint. */
export async function refreshConsoleMeta() {
  const [proposals, schedules, queue] = await Promise.all([
    api.memoryProposals("pending").catch(() => null),
    api.scheduledGoals().catch(() => null),
    api.mergeQueue(null).catch(() => null),
  ]);
  setState({
    pendingProposals: Array.isArray(proposals) ? proposals.length : 0,
    activeSchedules: Array.isArray(schedules) ? schedules.filter((s) => s.enabled).length : 0,
    mergeConflicts: Array.isArray(queue) ? queue.filter((e) => e.status === "conflict").length : 0,
  });
}

/** Saves a partial change to the settings (quiet hours, muted goals) and reloads them. */
export async function patchSettings(patch: Partial<Settings>): Promise<boolean> {
  const current = state.settings ?? (await api.settings());
  const ok = await act(() => api.saveSettings({ ...current, ...patch }));
  if (ok === undefined) return false;
  await refreshEnvironment();
  return true;
}

const MINUTE = 60_000;
const DAY_MINUTES = 24 * 60;

/** Minutes after local midnight, the unit of `QuietHours`. */
export function minuteOfDay(at: number): number {
  const d = new Date(at);
  return d.getHours() * 60 + d.getMinutes();
}

/** Whether `minute` falls inside the daily window; the same rule as the supervisor's (`QuietHours::contains`): it may cross midnight, and an empty window is never quiet. */
export function inQuietHours(q: QuietHours | null | undefined, minute: number): boolean {
  if (!q || q.start === q.end) return false;
  return q.start < q.end ? minute >= q.start && minute < q.end : minute >= q.start || minute < q.end;
}

/**
 * When the current silence ends (ms since the epoch), or null when nothing
 * is silenced: the later of a "quiet until" and today's quiet hours, so the
 * bell reads one time whichever rule is the reason.
 */
export function quietUntil(now = state.now): number | null {
  const s = state.settings;
  if (!s) return null;
  const until = s.quiet_until && s.quiet_until > now ? s.quiet_until : null;
  let hours: number | null = null;
  if (inQuietHours(s.quiet_hours, minuteOfDay(now))) {
    const minute = minuteOfDay(now);
    const left = (s.quiet_hours!.end - minute + DAY_MINUTES) % DAY_MINUTES || DAY_MINUTES;
    hours = now - (now % MINUTE) + left * MINUTE;
  }
  return until === null ? hours : hours === null ? until : Math.max(until, hours);
}

/** Whether notifications are silenced right now, by "quiet until" or by the daily quiet hours. */
export function quietNow(): boolean {
  return quietUntil() !== null;
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

/** What live updates set while the first snapshot was still loading: newer than the snapshot, so it must not overwrite them. */
const fresh = { goals: new Set<string>(), inbox: false, projects: false };

function subscribe() {
  if (subscribed) return subscribed;
  subscribed = onUpdate((u) => {
    switch (u.type) {
      case "goal":
        fresh.goals.add(u.goal.id);
        setState("goals", u.goal.id, reconcile(u.goal));
        break;
      case "inbox":
        fresh.inbox = true;
        setState("inbox", reconcile(dedupeInbox(u.items), { key: "id" }));
        setState("snoozed", reconcile(u.snoozed ?? [], { key: "id" }));
        break;
      case "projects":
        fresh.projects = true;
        setState("projects", reconcile(u.projects, { key: "id" }));
        break;
      case "stream":
        setState("streams", u.goal_id, u.text);
        beat(u.goal_id, null);
        break;
      case "traces":
        for (const entry of u.entries) {
          traceListeners.get(entry.goal_id)?.forEach((fn) => fn(entry));
          if (entry.event.kind === "assistant_message") setState("streams", entry.goal_id, "");
          beat(entry.goal_id, entry.event);
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

/** Records that a goal's event stream moved; tool starts and ends keep the in-flight tool. */
export function beat(goalId: string, event: TraceEntry["event"] | null, now = Date.now()) {
  setState(
    produce((s) => {
      const p = s.pulse[goalId] ?? { at: 0, tool: null };
      p.at = now;
      const calls = (p.calls ??= {});
      if (event?.kind === "tool_started") calls[event.call_id] = { name: event.tool, since: now };
      else if (event?.kind === "tool_ended") delete calls[event.call_id];
      else if (event?.kind === "run_ended" || event?.kind === "engine_error") p.calls = {};
      const oldest = Object.values(p.calls).sort((a, b) => a.since - b.since)[0];
      p.tool = oldest ? { ...oldest } : null;
      s.pulse[goalId] = p;
    }),
  );
}

/**
 * How alive a running goal's engine is: when it last moved (the newer of
 * its event stream and its summary) and the tool it is inside, if any.
 */
export function livenessOf(g: GoalSummary): { at: number; tool: Pulse["tool"] } {
  const p = state.pulse[g.id];
  return { at: Math.max(g.updated_at, p?.at ?? 0), tool: p?.tool ?? null };
}

/** Loads the replica. Safe to call again after a failure (the Retry button). */
export async function init() {
  // A retry starts from the boot screen, not from a shell with nothing in it (which would read as a first run).
  setState({ loadError: null, loaded: false });
  fresh.goals.clear();
  fresh.inbox = fresh.projects = false;
  try {
    const sub = subscribe();
    const [goals, inbox, projects, snoozed, startup] = await Promise.all([
      api.goals(),
      api.inbox(),
      api.projects(),
      api.snoozedInbox().catch(() => [] as InboxItem[]),
      api.startupRoute().catch(() => null),
    ]);
    await refreshEnvironment();
    // The setting's language may not be the system's: its words come before the replica is shown, so no frame reads in the wrong one.
    await ensureLocale(localeOf(state.settings?.language));
    // Opened by a notification: the first frame is the view it was about, not the board crossfading into it.
    openStartupRoute(startup, false);
    setState(
      produce((s) => {
        const live = s.goals;
        s.goals = Object.fromEntries(goals.map((g) => [g.id, fresh.goals.has(g.id) ? live[g.id] : g]));
        for (const id of fresh.goals) if (!s.goals[id] && live[id]) s.goals[id] = live[id];
        if (!fresh.inbox) {
          s.inbox = dedupeInbox(inbox);
          s.snoozed = snoozed;
        }
        if (!fresh.projects) s.projects = projects;
        s.loaded = true;
      }),
    );
    if (!ticking) {
      ticking = true;
      setInterval(() => setState("now", Date.now()), 15_000);
      // Tower brought to the front by a notification: open what it was about.
      void onOpen((r) => openStartupRoute(r));
    }
    await sub;
    void refreshConsoleMeta();
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
function openStartupRoute(route: string | null, animate = true) {
  if (!route) return;
  const [path, query] = route.split("?");
  const theme = new URLSearchParams(query ?? "").get("theme");
  if (theme === "light" || theme === "dark" || theme === "system") setThemeChoice(theme);
  const [name, id] = path.split("/");
  if ((name === "goal" || name === "review") && id) go({ name, id }, { animate });
  else if (name === "inbox" || name === "learning" || name === "operations" || name === "settings" || name === "overview")
    go({ name }, { animate });
  else if (name === "new") go({ name: "new" }, { animate });
}

export function goalList(): GoalSummary[] {
  return Object.values(state.goals).sort((a, b) => b.created_at - a.created_at);
}
