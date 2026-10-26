/** Title bar (breadcrumb and gauges) and toasts. The command palette is `Palette.tsx`, loaded on first open. */
import { For, Show, createSignal, onCleanup } from "solid-js";

import { clock, duration, usd } from "../lib/format";
import { wedgePath } from "../lib/gauge";
import { t } from "../lib/i18n";
import { openActivity, openPalette } from "../lib/layers";
import { back, canGoBack, go, route } from "../lib/nav";
import { popupActions } from "../lib/native";
import { dismissToast, goalList, livenessOf, patchSettings, quietNow, quietUntil, state } from "../lib/store";
import { hasIssue, heartbeatState } from "../lib/labels";
import { Icon, NeedsYouMark } from "./Glyph";
import { IconButton } from "./ui";

const HOUR = 3_600_000;

/** Quiet hours: one hour, until tomorrow 9:00, or off. Shared by the gauge menu and Settings. */
export async function pickQuiet() {
  const tomorrow9 = () => {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    d.setHours(9, 0, 0, 0);
    return d.getTime();
  };
  await popupActions([
    { label: t("quiet.forHour"), run: () => void patchSettings({ quiet_until: Date.now() + HOUR }) },
    { label: t("quiet.untilTomorrow"), run: () => void patchSettings({ quiet_until: tomorrow9() }) },
    { label: t("quiet.off"), run: () => void patchSettings({ quiet_until: null }), separatorBefore: true, enabled: quietNow() },
  ]);
}

/**
 * Engine heartbeat: how long since any running goal's event stream moved
 * (trace entries, streamed text, the summary). The title bar ticks once a
 * second only while something runs. A tool call still in flight is "a tool
 * running for 3m", never silence; silence past two minutes wears a hollow
 * square — worth a look, not a failure — so it is not a second ■ beside the
 * error count.
 */
export function Heartbeat(props: { running: number }) {
  const [now, setNow] = createSignal(Date.now());
  const timer = window.setInterval(() => props.running > 0 && setNow(Date.now()), 1000);
  onCleanup(() => clearInterval(timer));
  const live = () => goalList().filter((g) => g.state === "running").map(livenessOf);
  const last = () => Math.max(0, ...live().map((l) => l.at));
  const tool = () => live().map((l) => l.tool).filter((x) => x !== null).sort((a, b) => a!.since - b!.since)[0] ?? null;
  const since = () => Math.max(0, now() - last());
  const hb = () => heartbeatState(since(), tool() !== null);
  const text = () => {
    const d = since() < 120_000 ? `${Math.round(since() / 1000)}s` : duration(since(), false);
    switch (hb()) {
      case "fine":
        return t("chrome.heartbeat", { n: Math.round(since() / 1000) });
      case "busy":
        return t("chrome.toolRunning", { tool: tool()!.name, d: duration(now() - tool()!.since, false) });
      default:
        return t("chrome.silentFor", { d });
    }
  };
  return (
    <Show when={props.running > 0 && last() > 0}>
      <span class="gauge num" classList={{ "gauge-stale": hb() === "quiet" || hb() === "silent", "gauge-busy": hb() === "busy" }} title={t("chrome.heartbeatTitle")}>
        <Show when={hb() === "silent"}>
          <span class="gauge-dot hollow" />
        </Show>
        {text()}
      </span>
    </Show>
  );
}

/**
 * The runs gauge: the running glyph's ring, filled by how many of the slots
 * are in use — one of four a quarter, two of four the glyph's own half-disc,
 * all of them a full disc. A reading, not an icon: it says "1/4" before the
 * numbers do.
 */
export function RunsGauge(props: { n: number; max: number }) {
  return (
    <svg class="glyph gauge-runs" width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="var(--st-active)" stroke-width="1.25" aria-hidden="true">
      <circle cx="5" cy="5" r="4" />
      <path d={wedgePath(props.max > 0 ? props.n / props.max : 0)} fill="var(--st-active)" stroke="none" />
    </svg>
  );
}

/**
 * Left: where you are. On a goal that is the breadcrumb `project › G-0003`
 * (the title belongs to the H1 below); elsewhere the page name. Right: the
 * gauge cluster — errors, runs, heartbeat, spend, quiet, engine — in one strip.
 */
export function TitleBar(props: { title: string }) {
  const running = () => goalList().filter((g) => g.state === "running").length;
  const spent = () => goalList().reduce((s, g) => s + g.cost_usd, 0);
  const max = () => state.settings?.max_concurrent ?? 3;
  // Claude Code as the engine needs no Pi; its own problem arrives as an environment issue.
  const engineOk = () => (state.settings?.engine === "claude-code" ? !hasIssue(state.env, "claude_missing") : !!state.env?.pi_version);
  const crumbs = () => {
    const r = route();
    if (r.name !== "goal") return null;
    const g = state.goals[r.id];
    return { project: g?.project_name ?? "", id: r.id };
  };
  return (
    <header class="titlebar" data-tauri-drag-region>
      <Show when={canGoBack()}>
        <IconButton icon="chevron-left" label={t("common.back")} onClick={back} />
      </Show>
      <Show when={crumbs()} fallback={<h1 class="titlebar-title ellipsis" data-tauri-drag-region>{props.title}</h1>}>
        {(c) => (
          <nav class="titlebar-crumbs" data-tauri-drag-region aria-label={t("chrome.breadcrumb")}>
            <span class="ellipsis">{c().project}</span>
            <Icon name="chevron-right" size={10} />
            <span class="code-val t2">{c().id}</span>
          </nav>
        )}
      </Show>
      <span class="grow" data-tauri-drag-region />
      <div class="titlebar-gauges num halt" data-tauri-drag-region>
        <Show when={state.unseenActivity > 0}>
          <button class="gauge gauge-errors link-plain" onClick={() => openActivity()} aria-label={t("chrome.unseenErrors", { n: state.unseenActivity })} title={t("chrome.unseenErrors", { n: state.unseenActivity })}>
            <span class="gauge-dot down" />
            {t("chrome.errorsShort", { n: state.unseenActivity })}
          </button>
        </Show>
        <Show when={running() > 0}>
          <span class="gauge gauge-active" title={t("chrome.running", { n: running(), max: max() })}>
            <RunsGauge n={running()} max={max()} />
            {t("chrome.runningShort", { n: running(), max: max() })}
          </span>
        </Show>
        <Heartbeat running={running()} />
        <span class="gauge" title={t("chrome.spent", { usd: usd(spent()) })}>
          {usd(spent())}
        </span>
        {/* One reading whichever rule silences: "quiet until 08:00" from the daily hours reads the same as from the menu. */}
        <button
          class="gauge gauge-quiet link-plain"
          onClick={() => void pickQuiet()}
          aria-haspopup="menu"
          aria-label={quietNow() ? t("quiet.until", { time: clock(quietUntil()!) }) : t("quiet.menuTitle")}
          title={quietNow() ? t("quiet.until", { time: clock(quietUntil()!) }) : t("quiet.hint")}
        >
          <Icon name="bell" size={12} />
          <Show when={quietNow()}>{t("quiet.until", { time: clock(quietUntil()!) })}</Show>
        </button>
        {/* The phone page is on but not served: a background failure is said where the other readings are, and opens its way out. */}
        <Show when={state.remoteProblem}>
          {(problem) => (
            <button class="gauge gauge-down gauge-phone link-plain" onClick={() => go({ name: "settings" })} title={problem()}>
              <NeedsYouMark />
              {t("chrome.phoneOff")}
            </button>
          )}
        </Show>
        <Show
          when={engineOk()}
          fallback={
            <button class="gauge gauge-down link-plain" onClick={() => go({ name: "settings" })}>
              <span class="gauge-dot down" />
              {state.settings?.engine === "claude-code" ? t("chrome.claudeNotReady") : t("chrome.piNotReady")}
            </button>
          }
        >
          <span
            class="gauge gauge-engine"
            title={
              state.settings?.engine === "claude-code"
                ? `Claude Code · ${state.settings.claude_acp_command || "claude-agent-acp"}`
                : `Pi ${state.env?.pi_version ?? ""} · ${state.env?.pi_path ?? ""}`
            }
          >
            <span class="gauge-dot" />
            {t("chrome.engine")}
            {/* Each engine has a readable version slot: Pi's number, Claude Code's adapter. */}
            <span class="t3 gauge-version">
              {state.settings?.engine === "claude-code"
                ? `Claude Code ${(state.settings.claude_acp_command || "claude-agent-acp").split("/").pop()!.split(" ")[0]}`
                : `Pi ${state.env?.pi_version?.split(" ")[0] ?? ""}`}
            </span>
          </span>
        </Show>
      </div>
      <IconButton icon="search" size={26} label={`${t("chrome.search")} ⌘K`} onClick={() => openPalette("mouse")} />
    </header>
  );
}

export function Toasts() {
  const run = (id: number, fn: () => void) => {
    dismissToast(id);
    fn();
  };
  return (
    <div class="toasts">
      <For each={state.toasts}>
        {(toast) => (
          <div class={`toast toast-${toast.level}`} classList={{ leaving: !!toast.leaving }} role={toast.level === "error" ? "alert" : "status"}>
            <Show when={toast.level === "success"}>
              <Icon name="check" size={10} />
            </Show>
            <span class="toast-text">{toast.text}</span>
            <Show when={toast.action}>
              {(a) => (
                <button class="toast-action" onClick={() => run(toast.id, a().run)}>
                  {a().label}
                </button>
              )}
            </Show>
            <Show when={!toast.action && toast.goalId}>
              {(id) => (
                <button class="toast-action" onClick={() => run(toast.id, () => go({ name: "goal", id: id() }))}>
                  {t("common.open")}
                </button>
              )}
            </Show>
            <IconButton icon="cross" size={22} label={t("common.dismiss")} onClick={() => dismissToast(toast.id)} />
          </div>
        )}
      </For>
    </div>
  );
}
