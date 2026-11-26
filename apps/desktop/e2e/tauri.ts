/**
 * A stand-in for Tauri's IPC: the interface's `invoke` calls are answered
 * from JSON views dumped by a real supervisor (`cargo run -p
 * tower-supervisor --example dump_views -- <dir>`; E2E_FIXTURES points at
 * the directory). Commands that would change state are recorded instead.
 */
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

import type { Locator, Page } from "@playwright/test";

/**
 * A goal page's (or readout's) criterion block by its id, matched on the id cell exactly. A bare `hasText: "C2"` is a
 * case-insensitive substring: it also finds a row whose commit hash, command or title happens to contain "c2".
 */
/** Opens every verified criterion's readings on the goal page: folded, a criterion shows its verdict and one line of
 *  what qualifies it; the baseline, canary and held-out lines are in its open readings. */
export async function openReadings(page: Page): Promise<void> {
  await page.locator(".goal-page .criterion").first().waitFor();
  const closed = page.locator('.goal-page .criterion .col-result[aria-expanded="false"]');
  for (let n = await closed.count(); n > 0; n--) await closed.first().click();
}

/**
 * The review opens on the riskiest unit, as the supervisor orders them. The hunk-loop tests read the source unit
 * (`enrichReview`'s second, `src/`, two files and two hunks): open it the way a reader would, by its row.
 */
export async function openSourceUnit(page: Page): Promise<void> {
  await page.locator(".review-units .unit").filter({ hasText: "src/" }).click();
  await page.locator('.hunk-head[data-hunk-path="src/cart/money.js"]').waitFor();
}

export function criterion(scope: Page | Locator, id: string, within = ".goal-page .criterion"): Locator {
  const page = "page" in scope ? scope.page() : scope;
  return scope.locator(within).filter({ has: page.locator(".criterion-row > .num", { hasText: new RegExp(`^${id}$`) }) });
}

/** What each route draws once its own content is on the page (not only the shell's <main>, which never leaves). */
const LANDMARK: Array<[RegExp, string]> = [
  [/^overview/, ".view .overview"],
  [/^inbox/, ".view .inbox"],
  [/^learning/, ".view .learning-page"],
  [/^operations/, ".view .ops-page"],
  [/^goal\//, ".goal-page .criterion"],
  [/^review\//, ".view table"],
  [/^settings/, ".view .settings"],
  [/^new/, ".view .editor:not(.contract-skeleton) .clause-head"],
];

/** The page's requests still in flight (code loaded on demand, pictures), counted from `openTower` on. */
const inflight = new WeakMap<Page, Set<Request>>();

/**
 * Waits until `route`'s own content is drawn, the fonts are in and every finite animation has run out — instead of a
 * fixed sleep, which is too short on a busy machine and wasted on an idle one. Infinite animations (a live pulse) are
 * left running. Use it before reading layout, running axe, or pressing a view's keys.
 *
 * Drawn means no code still loading on demand (the steer box's chunk), no colours still due from the highlighting
 * worker and every picture in and decoded: twice over, two frames apart, as one load can start the next (review 18,
 * record only: a shot caught the goal page without its steer box, a look's pictures not yet in, a diff untinted). A
 * request a test holds back is waited on for `cap` (5 s) at most, and a picture still loading is not decoded.
 *
 * Returns null once the page was quiet; at the cap, what was still pending, also written to the test's output (review
 * 19, record only: the cap was silent, and 3 of 36 probes returned with five answers still owed). A shot fails on it.
 */
export async function settled(page: Page, route?: string, cap = 5_000): Promise<string | null> {
  const landmark = route && LANDMARK.find(([re]) => re.test(route))?.[1];
  if (landmark) await page.locator(landmark).first().waitFor();
  const frames = () => page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
  let quiet = 0;
  for (const end = Date.now() + cap; quiet < 2 && Date.now() < end; ) {
    const idle = !inflight.get(page)?.size && (await page.evaluate(() => !(window as any).__towerBusy?.() && [...document.images].every((i) => i.complete)));
    quiet = idle ? quiet + 1 : 0;
    await frames();
  }
  let pending: string | null = null;
  if (quiet < 2) {
    const open = [...(inflight.get(page) ?? [])].map((r) => r.url());
    const [owed, pictures] = await page.evaluate(() => [(window as any).__towerBusy?.() ?? 0, [...document.images].filter((i) => !i.complete).length]);
    const what = [open.length && `${open.length} request(s): ${open.join(", ")}`, owed && `${owed} worker answer(s)`, pictures && `${pictures} picture(s) loading`];
    pending = what.filter(Boolean).join("; ") || null;
    if (pending) console.warn(`settled: still drawing after ${cap} ms on ${route ?? page.url()}: ${pending}`);
  }
  await page.evaluate(async () => {
    await Promise.all([...document.images].filter((i) => i.complete).map((i) => i.decode().catch(() => undefined)));
    await document.fonts.ready;
    const finite = document.getAnimations().filter((a) => a.effect?.getComputedTiming().iterations !== Infinity);
    await Promise.all(finite.map((a) => a.finished.catch(() => undefined)));
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
  });
  return pending;
}

export const FIXTURES = process.env.E2E_FIXTURES ?? "/tmp/e2e-fixtures";
/** The same demo seeded by a supervisor running in Chinese (tools/e2e.sh dumps both), for the Chinese interface. */
export const FIXTURES_ZH = process.env.E2E_FIXTURES_ZH;

/** The dumped views; in Chinese, the Chinese supervisor's when they were dumped, so its own words are Chinese too. */
export function fixtures(lang?: "en" | "zh-CN"): Record<string, unknown> {
  const dir = lang === "zh-CN" && FIXTURES_ZH ? FIXTURES_ZH : FIXTURES;
  const out: Record<string, unknown> = {};
  for (const f of readdirSync(dir).filter((n) => n.endsWith(".json"))) {
    out[f.replace(/\.json$/, "")] = JSON.parse(readFileSync(join(dir, f), "utf8"));
  }
  return out;
}

/**
 * A demo goal's title as the views of that language dump it: the Chinese seed titles its goals in Chinese, so a test
 * that runs in both languages names a goal through this. Given the English title or its start; any other title (one an
 * enrichment adds) is returned as given.
 */
export function titleIn(lang: "en" | "zh-CN" | undefined, title: string): string {
  if (lang !== "zh-CN" || !FIXTURES_ZH) return title;
  const id = (fixtures().goals as Array<{ id: string; title: string }>).find((g) => g.title.startsWith(title))?.id;
  return (fixtures("zh-CN").goals as Array<{ id: string; title: string }>).find((g) => g.id === id)?.title ?? title;
}

export async function openTower(
  page: Page,
  route: string,
  opts: {
    lang?: "en" | "zh-CN";
    /** Edits the dumped views before they are served, for states the demo does not reach (a second ready goal, a look criterion…). */
    enrich?: (F: Record<string, any>) => void;
    theme?: "light" | "dark";
  } = {},
) {
  const F = fixtures(opts.lang) as Record<string, any>;
  if (opts.lang) F.settings = { ...F.settings, language: opts.lang };
  opts.enrich?.(F);
  if (opts.theme) route = `${route}?theme=${opts.theme}`;
  await page.addInitScript(
    ([F, route]) => {
      let seq = 0;
      const calls: Array<[string, unknown]> = [];
      (window as any).__towerCalls = calls;
      (window as any).__towerFixtures = F;
      // Delivers an event to what the app listens for, as Tauri does: the handler is a registered callback id.
      (window as any).__towerEmit = (event: string, payload: unknown) => {
        const id = (window as any).__towerListeners?.[event];
        (window as any)[`_${id}`]?.({ event, id: 0, payload });
      };
      (window as any).__TAURI_INTERNALS__ = {
        metadata: { currentWindow: { label: "main" }, currentWebview: { label: "main", windowLabel: "main" } },
        transformCallback(cb: unknown) {
          const id = ++seq;
          (window as any)[`_${id}`] = cb;
          return id;
        },
        unregisterCallback(id: number) {
          delete (window as any)[`_${id}`];
        },
        convertFileSrc: (p: string) => p,
        async invoke(cmd: string, a: any = {}) {
          calls.push([cmd, a]);
          switch (cmd) {
            case "startup_route":
              return route;
            case "environment":
              return F.environment;
            case "projects":
              return F.projects;
            case "settings":
              return F.settings;
            case "save_settings":
              // Saved settings are what the next read returns, as with the supervisor.
              F.settings = a.settings;
              return null;
            case "goals":
              return F.goals;
            case "inbox":
              return F.inbox;
            case "snoozed_inbox":
              return F.snoozed ?? [];
            case "goal":
              // As the store answers for an id it has no row for.
              if (!F[`goal-${a.id}`]) throw `not found: goal ${a.id}`;
              return F[`goal-${a.id}`];
            case "trace":
              return F[`trace-${a.id}`] ?? [];
            case "review":
              if (!F[`review-${a.id}`]) throw "no review";
              // A fresh copy each read, as over real IPC: rows keyed by object are rebuilt on a refetch.
              return structuredClone(F[`review-${a.id}`]);
            case "file_text": {
              const text = F.files[`${a.id}:${a.path}:${a.old ? "old" : "new"}`] ?? null;
              // A test can hold reads (`__towerHold`) to see what lands after the snapshot moved on meanwhile.
              await (window as any).__towerHold;
              return text;
            }
            case "ui_state":
              return {};
            case "accept":
              return `tower/${a.id}`;
            case "look_image":
              return F.lookImages?.[a.file] ?? null;
            case "remote_info":
              return F.remoteInfo ?? null;
            case "reset_remote_token":
              // A new pairing token: the old one stops working, as with the supervisor.
              F.settings = { ...F.settings, remote_token: `fresh-${Date.now()}` };
              return null;
            case "push_status":
              return F.pushStatus ?? null;
            case "test_push":
              if (F.testPushError) throw F.testPushError;
              F.pushStatus = { at: Date.now(), error: null };
              return null;
            case "models":
              return F.models ?? [];
            case "validate_contract":
              return [];
            case "sandbox_posture":
              return F.sandboxPosture ?? { backend_name: "macOS Seatbelt (S2)", microvm_available: false, warnings: [] };
            case "engines":
              return (
                F.engines ?? [
                  { id: "pi", label: "Pi", trust_tier: "full_s2", installed: true, available: true, note: "" },
                  { id: "claude-code", label: "Claude Code", trust_tier: "full_s2", installed: true, available: true, note: "" },
                  { id: "codex", label: "Codex", trust_tier: "restricted_s2", installed: false, available: false, note: "" },
                  { id: "gemini-cli", label: "Gemini CLI", trust_tier: "restricted_s2", installed: false, available: false, note: "" },
                  { id: "opencode", label: "OpenCode", trust_tier: "restricted_s2", installed: false, available: false, note: "" },
                ]
              );
            // The console's lists are fresh copies each read too: a refetch hands the view new objects, as over real IPC.
            case "memory_proposals":
              return structuredClone((F.memoryProposals ?? []).filter((p: any) => !a.status || p.status === a.status));
            case "calibration_rows":
              return structuredClone(F.calibrationRows ?? []);
            case "scheduled_goals":
              return structuredClone(F.scheduledGoals ?? []);
            case "run_scheduled_goal_now":
              if (F.runNowError) throw F.runNowError;
              return null;
            case "merge_queue":
              if (F.mergeQueueError) throw F.mergeQueueError;
              return structuredClone(F.mergeQueue ?? []);
            case "storage_inventory":
              return structuredClone(F.storageInventory ?? { total_bytes: 0, reclaimable_bytes: 0, goals: [] });
            case "list_snapshots":
              return F[`snapshots-${a.id}`] ?? [];
            case "compare_snapshots":
              return F[`review-${a.id}`] ?? null;
            case "workspace_files":
              return F[`workspaceFiles-${a.id}`] ?? [];
            case "generate_holdout_drafts":
              return F.holdoutDrafts ?? [];
            case "ratify_holdout_draft":
              return a.filename ?? "holdout/boundary.test.js";
            case "check_for_updates":
              return F.updateCheck ?? { configured: false, available: false, current_version: "0.1.0", latest_version: null, notes: null, error: null };
            case "plugin:event|listen":
              // Kept so a test can push a live update the way the supervisor does (`__towerEmit`).
              ((window as any).__towerListeners ??= {})[a.event] = a.handler;
              return ++seq;
            case "plugin:dialog|ask":
              return true;
            case "plugin:dialog|message":
              // `ask` and `confirm` come here: unanswered (no) unless a test says yes (`__towerAsk = true`).
              return (window as any).__towerAsk ? (a.buttons?.OkCancelCustom?.[0] ?? "Yes") : null;
            default:
              if (cmd.startsWith("plugin:menu|")) {
                // Kept by label so a test can pick a native menu item (`__towerMenu["Edit this file"].onmessage()`).
                if (cmd === "plugin:menu|new" && a.options?.text) ((window as any).__towerMenu ??= {})[a.options.text] = a.handler;
                return [1, "m"];
              }
              return null;
          }
        },
      };
      (window as any).__TAURI_EVENT_PLUGIN_INTERNALS__ = { unregisterListener() {} };
      // The highlighting worker answers each request once: `settled` waits until every request has its answer. A worker
      // that failed to load or broke answers nothing more: what it owed is let go.
      // Each `openTower` adds this script again, so a page opened twice wraps the wrapper: each wrap keeps its own count.
      const Native = window.Worker;
      let busy = 0;
      const owed = new WeakMap<Worker, number>();
      (window as any).__towerBusy = () => busy;
      window.Worker = class extends Native {
        constructor(url: string | URL, opts?: WorkerOptions) {
          super(url, opts);
          owed.set(this, 0);
          this.addEventListener("message", () => {
            const n = owed.get(this)!;
            if (n > 0) (owed.set(this, n - 1), busy--);
          });
          this.addEventListener("error", () => void ((busy -= owed.get(this)!), owed.set(this, 0)));
        }
        postMessage(message: unknown, transfer?: any) {
          owed.set(this, owed.get(this)! + 1);
          busy++;
          super.postMessage(message, transfer);
        }
      };
    },
    [F, route] as const,
  );
  if (!inflight.has(page)) {
    const open = new Set<object>();
    page.on("request", (r) => void open.add(r));
    page.on("requestfinished", (r) => void open.delete(r));
    page.on("requestfailed", (r) => void open.delete(r));
    inflight.set(page, open);
  }
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(m.text());
  });
  await page.goto("/");
  return { errors, fixtures: F };
}
