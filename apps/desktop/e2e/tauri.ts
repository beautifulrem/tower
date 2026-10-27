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
export function criterion(scope: Page | Locator, id: string, within = ".goal-page .criterion"): Locator {
  const page = "page" in scope ? scope.page() : scope;
  return scope.locator(within).filter({ has: page.locator(".criterion-row > .num", { hasText: new RegExp(`^${id}$`) }) });
}

/** What each route draws once its own content is on the page (not only the shell's <main>, which never leaves). */
const LANDMARK: Array<[RegExp, string]> = [
  [/^overview/, ".view .overview"],
  [/^inbox/, ".view .inbox"],
  [/^goal\//, ".goal-page .criterion"],
  [/^review\//, ".view table"],
  [/^settings/, ".view .settings"],
];

/**
 * Waits until `route`'s own content is drawn, the fonts are in and every finite animation has run out — instead of a
 * fixed sleep, which is too short on a busy machine and wasted on an idle one. Infinite animations (a live pulse) are
 * left running. Use it before reading layout, running axe, or pressing a view's keys.
 */
export async function settled(page: Page, route?: string) {
  const landmark = route && LANDMARK.find(([re]) => re.test(route))?.[1];
  if (landmark) await page.locator(landmark).first().waitFor();
  await page.evaluate(async () => {
    await document.fonts.ready;
    const finite = document.getAnimations().filter((a) => a.effect?.getComputedTiming().iterations !== Infinity);
    await Promise.all(finite.map((a) => a.finished.catch(() => undefined)));
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
  });
}

export const FIXTURES = process.env.E2E_FIXTURES ?? "/tmp/e2e-fixtures";

export function fixtures(): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const f of readdirSync(FIXTURES).filter((n) => n.endsWith(".json"))) {
    out[f.replace(/\.json$/, "")] = JSON.parse(readFileSync(join(FIXTURES, f), "utf8"));
  }
  return out;
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
  const F = fixtures() as Record<string, any>;
  if (opts.lang) F.settings = { ...F.settings, language: opts.lang };
  opts.enrich?.(F);
  if (opts.theme) route = `${route}?theme=${opts.theme}`;
  await page.addInitScript(
    ([F, route]) => {
      let seq = 0;
      const calls: Array<[string, unknown]> = [];
      (window as any).__towerCalls = calls;
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
            case "goals":
              return F.goals;
            case "inbox":
              return F.inbox;
            case "snoozed_inbox":
              return F.snoozed ?? [];
            case "goal":
              return F[`goal-${a.id}`];
            case "trace":
              return F[`trace-${a.id}`] ?? [];
            case "review":
              if (!F[`review-${a.id}`]) throw "no review";
              return F[`review-${a.id}`];
            case "file_text":
              return F.files[`${a.id}:${a.path}:${a.old ? "old" : "new"}`] ?? null;
            case "ui_state":
              return {};
            case "accept":
              return `tower/${a.id}`;
            case "look_image":
              return F.lookImages?.[a.file] ?? null;
            case "remote_info":
              return F.remoteInfo ?? null;
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
            case "plugin:event|listen":
              return ++seq;
            case "plugin:dialog|ask":
              return true;
            default:
              if (cmd.startsWith("plugin:menu|")) return [1, "m"];
              return null;
          }
        },
      };
      (window as any).__TAURI_EVENT_PLUGIN_INTERNALS__ = { unregisterListener() {} };
    },
    [F, route] as const,
  );
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(m.text());
  });
  await page.goto("/");
  return { errors, fixtures: F };
}
