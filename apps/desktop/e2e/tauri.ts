/**
 * A stand-in for Tauri's IPC: the interface's `invoke` calls are answered
 * from JSON views dumped by a real supervisor (`cargo run -p
 * tower-supervisor --example dump_views -- <dir>`; E2E_FIXTURES points at
 * the directory). Commands that would change state are recorded instead.
 */
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

import type { Page } from "@playwright/test";

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
            case "look_image":
              return F.lookImages?.[a.file] ?? null;
            case "remote_info":
              return F.remoteInfo ?? null;
            case "models":
              return [];
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
