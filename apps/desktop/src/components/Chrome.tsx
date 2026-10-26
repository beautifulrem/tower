/** Title bar (breadcrumb and gauges), toasts and the command palette. */
import { For, Show, createMemo, createSignal, onCleanup } from "solid-js";

import { api } from "../lib/api";
import { clock, duration, usd } from "../lib/format";
import { type Match, fuzzy, matchText, segments } from "../lib/fuzzy";
import { t } from "../lib/i18n";
import { useKeys } from "../lib/keys";
import { back, canGoBack, go, route } from "../lib/nav";
import { popupActions } from "../lib/native";
import { bumpRecent, recentIds } from "../lib/recent";
import { act, dismissToast, goalList, livenessOf, patchSettings, quietNow, state } from "../lib/store";
import { hasIssue, heartbeatState, stateLabel } from "../lib/labels";
import { openActivity } from "./Activity";
import { Icon, type IconName, LifecycleGlyph, NeedsYouMark } from "./Glyph";
import { openShortcuts } from "./ShortcutSheet";
import { IconButton, Kbd, Overlay } from "./ui";

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
            <LifecycleGlyph goal={{ state: "running", progress: { verified: 0, observed: 0, machine: 0, human: 0, human_done: 0 }, verified_pin: null }} />
            {t("chrome.runningShort", { n: running(), max: max() })}
          </span>
        </Show>
        <Heartbeat running={running()} />
        <span class="gauge" title={t("chrome.spent", { usd: usd(spent()) })}>
          {usd(spent())}
        </span>
        <button
          class="gauge gauge-quiet link-plain"
          onClick={() => void pickQuiet()}
          aria-haspopup="menu"
          aria-label={quietNow() ? t("quiet.until", { time: clock(state.settings!.quiet_until!) }) : t("quiet.menuTitle")}
          title={quietNow() ? t("quiet.until", { time: clock(state.settings!.quiet_until!) }) : t("quiet.hint")}
        >
          <Icon name="bell" size={12} />
          <Show when={quietNow()}>{t("quiet.until", { time: clock(state.settings!.quiet_until!) })}</Show>
        </button>
        <Show
          when={engineOk()}
          fallback={
            <button class="gauge gauge-down link-plain" onClick={() => go({ name: "settings" })}>
              <span class="gauge-dot down" />
              {state.settings?.engine === "claude-code" ? t("chrome.claudeNotReady") : t("chrome.piNotReady")}
            </button>
          }
        >
          <span class="gauge" title={`Pi ${state.env!.pi_version!} · ${state.env?.pi_path ?? ""}`}>
            <span class="gauge-dot" />
            {t("chrome.engine")}
            <span class="t3 gauge-version">
              {state.settings?.engine === "claude-code" ? "Claude Code" : `Pi ${state.env!.pi_version!.split(" ")[0]}`}
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

const [paletteOpen, setPaletteOpen] = createSignal<false | "keyboard" | "mouse">(false);
export const openPalette = (how: "keyboard" | "mouse" = "keyboard") => setPaletteOpen(how);

interface Command {
  id: string;
  title: string;
  hint?: string;
  icon?: IconName;
  run: () => void;
  goalId?: string;
  goalTitle?: string;
}

interface Scored {
  c: Command;
  m: Match | null;
  recent: number;
}

/**
 * A goal row is matched on its title and on its id separately, and the better
 * one wins; positions are reported on the displayed `id title` string. So
 * `gwc` lights up 购物车 in the title rather than the G of G-0003 plus 物车.
 * Only when neither matches alone does the whole string get a try.
 */
export function matchGoal(query: string, id: string, title: string): Match | null {
  const byTitle = matchText(query, title);
  const byId = fuzzy(query, id);
  const shifted = byTitle ? { score: byTitle.score, positions: byTitle.positions.map((p) => p + id.length + 1) } : null;
  if (shifted && byId) return shifted.score >= byId.score ? shifted : byId;
  return shifted ?? byId ?? matchText(query, `${id} ${title}`);
}

/** Marks the matched characters so the eye lands on why a row is here. */
function Highlight(props: { text: string; positions?: number[] }) {
  const parts = createMemo(() => (props.positions?.length ? segments(props.text, props.positions) : [[props.text, false] as [string, boolean]]));
  return <For each={parts()}>{([s, hit]) => (hit ? <span class="hl">{s}</span> : s)}</For>;
}

export function CommandPalette() {
  const [q, setQ] = createSignal("");
  const [sel, setSel] = createSignal(0);

  const commands = createMemo<Command[]>(() => {
    const base: Command[] = [
      { id: "new", title: t("app.newGoal"), hint: "n", icon: "plus", run: () => go({ name: "new" }) },
      { id: "overview", title: t("chrome.openOverview"), hint: "mod+1", icon: "grid", run: () => go({ name: "overview" }) },
      { id: "inbox", title: t("chrome.openInbox"), hint: "mod+2", icon: "inbox", run: () => go({ name: "inbox" }) },
      { id: "settings", title: t("chrome.openSettings"), hint: "mod+,", icon: "sliders", run: () => go({ name: "settings" }) },
      { id: "activity", title: t("chrome.openActivity"), hint: "mod+shift+l", icon: "list", run: () => openActivity() },
      { id: "shortcuts", title: t("chrome.openShortcuts"), hint: "?", icon: "keyboard", run: () => openShortcuts() },
      { id: "quiet", title: quietNow() ? t("quiet.off") : t("quiet.forHour"), icon: "bell", run: () => void (quietNow() ? patchSettings({ quiet_until: null }) : patchSettings({ quiet_until: Date.now() + HOUR })) },
      { id: "integration", title: t("chrome.checkIntegration"), icon: "harness", run: () => void act(api.checkIntegration, t("chrome.checked")) },
    ];
    const r = route();
    if (r.name === "goal") {
      const g = state.goals[r.id];
      if (g?.state === "running") base.unshift({ id: "pause", title: t("chrome.pause", { id: g.id }), hint: "p", run: () => void act(() => api.pause(g.id)) });
      if (g?.state === "paused") base.unshift({ id: "resume", title: t("chrome.resume", { id: g.id }), hint: "p", run: () => void act(() => api.resume(g.id)) });
      if (g && ["in_review", "running", "accepted", "verifying"].includes(g.state))
        base.unshift({ id: "review", title: t("chrome.review", { id: g.id }), hint: "r", run: () => go({ name: "review", id: g.id }) });
    }
    const goals = goalList().map<Command>((g) => ({
      id: `goal-${g.id}`,
      title: `${g.id} ${g.title}`,
      goalId: g.id,
      goalTitle: g.title,
      run: () => go({ name: "goal", id: g.id }),
    }));
    return [...base, ...goals];
  });

  const needle = () => q().trim();
  const [recents, setRecents] = createSignal(recentIds());
  const rank = (id: string) => {
    const i = recents().indexOf(id);
    return i < 0 ? 0 : recents().length - i;
  };

  /** Scored and ordered: with a query by match quality (recency breaks ties); without one, recents first. */
  const scored = createMemo<Scored[]>(() => {
    const n = needle();
    const all = commands();
    if (!n) return all.map((c) => ({ c, m: null, recent: rank(c.id) }));
    return all
      .map((c) => ({ c, m: c.goalId ? matchGoal(n, c.goalId, c.goalTitle ?? "") : matchText(n, c.title), recent: rank(c.id) }))
      .filter((s): s is Scored & { m: Match } => s.m !== null)
      .sort((a, b) => b.m.score + b.recent * 0.5 - (a.m.score + a.recent * 0.5))
      .slice(0, 14);
  });
  const groups = createMemo(() => {
    const list = scored();
    if (needle()) return list.length ? [{ title: "", items: list, offset: 0 }] : [];
    const recent = list.filter((s) => s.recent > 0).sort((a, b) => b.recent - a.recent).slice(0, 4);
    const ids = new Set(recent.map((s) => s.c.id));
    const cmds = list.filter((s) => !s.c.goalId && !ids.has(s.c.id));
    const goals = list.filter((s) => s.c.goalId && !ids.has(s.c.id)).slice(0, 10);
    const out = [
      { title: t("chrome.groupRecent"), items: recent, offset: 0 },
      { title: t("chrome.groupCommands"), items: cmds, offset: recent.length },
      { title: t("chrome.groupGoals"), items: goals, offset: recent.length + cmds.length },
    ];
    return out.filter((g) => g.items.length);
  });
  const flat = createMemo(() => groups().flatMap((g) => g.items));

  const close = () => {
    setPaletteOpen(false);
    setQ("");
    setSel(0);
  };
  const run = (s: Scored | undefined) => {
    if (!s) return;
    bumpRecent(s.c.id);
    setRecents(recentIds());
    close();
    s.c.run();
  };

  useKeys([{ key: "mod+k", run: () => (paletteOpen() ? close() : setPaletteOpen("keyboard")), inInputs: true, desc: () => t("keys.palette") }], () => t("keys.everywhere"));

  const optionId = (i: number) => `palette-opt-${i}`;

  return (
    <Show when={paletteOpen()}>
      <Overlay onClose={close} label={t("chrome.search")} instant={paletteOpen() === "keyboard"} class="palette" top>
        <div class="palette-field">
          <span class="palette-prompt" aria-hidden="true">
            ›
          </span>
          <input
            class="palette-input"
            role="combobox"
            aria-expanded="true"
            aria-controls="palette-list"
            aria-autocomplete="list"
            aria-activedescendant={flat().length ? optionId(sel()) : undefined}
            aria-label={t("chrome.search")}
            placeholder={t("chrome.searchPlaceholder")}
            value={q()}
            onInput={(e) => {
              setQ(e.currentTarget.value);
              setSel(0);
            }}
            onKeyDown={(e) => {
              if (e.isComposing) return;
              if (e.key === "ArrowDown") (e.preventDefault(), setSel((s) => Math.min(s + 1, flat().length - 1)));
              else if (e.key === "ArrowUp") (e.preventDefault(), setSel((s) => Math.max(s - 1, 0)));
              else if (e.key === "Enter") run(flat()[sel()]);
            }}
          />
        </div>
        <div class="palette-list" id="palette-list" role="listbox" aria-label={t("chrome.search")}>
          <For
            each={groups()}
            fallback={
              <div class="palette-empty">
                <span class="t2">{t("chrome.noMatchesFor", { q: needle() })}</span>
                <span class="t3">{t("chrome.noMatchesHint")}</span>
              </div>
            }
          >
            {(grp) => (
              <>
                <Show when={grp.title}>
                  <div class="palette-group" role="presentation">
                    {grp.title}
                  </div>
                </Show>
                <For each={grp.items}>
                  {(s, i) => {
                    const idx = () => grp.offset + i();
                    const goal = () => (s.c.goalId ? state.goals[s.c.goalId] : undefined);
                    // Positions are on the full "G-0003 title" string; the id takes the first id.length + 1 of them.
                    const titlePositions = () => {
                      const g = goal();
                      if (!g || !s.m) return s.m?.positions;
                      const off = g.id.length + 1;
                      return s.m.positions.filter((p) => p >= off).map((p) => p - off);
                    };
                    const idPositions = () => {
                      const g = goal();
                      if (!g || !s.m) return undefined;
                      return s.m.positions.filter((p) => p < g.id.length);
                    };
                    return (
                      <div
                        id={optionId(idx())}
                        class="palette-item"
                        role="option"
                        aria-selected={idx() === sel()}
                        classList={{ selected: idx() === sel() }}
                        onMouseMove={() => sel() !== idx() && setSel(idx())}
                        onClick={() => run(s)}
                      >
                        <span class="palette-icon">
                          <Show when={goal()} fallback={<Icon name={s.c.icon ?? "chevron-right"} />}>
                            {(g) => <LifecycleGlyph goal={g()} />}
                          </Show>
                        </span>
                        <span class="ellipsis grow">
                          <Show when={goal()} fallback={<Highlight text={s.c.title} positions={s.m?.positions} />}>
                            {(g) => (
                              <>
                                <span class="code-val t2">
                                  <Highlight text={g().id} positions={idPositions()} />
                                </span>{" "}
                                <Highlight text={g().title} positions={titlePositions()} />
                              </>
                            )}
                          </Show>
                        </span>
                        <Show when={goal()}>
                          {(g) => (
                            <span class="palette-state">
                              <Show when={g().needs_you > 0}>
                                <NeedsYouMark />
                              </Show>
                              {stateLabel(g().state)}
                            </span>
                          )}
                        </Show>
                        <Show when={s.c.hint}>
                          <Kbd k={s.c.hint!} />
                        </Show>
                      </div>
                    );
                  }}
                </For>
              </>
            )}
          </For>
        </div>
        <div class="palette-foot">
          <span>{t("chrome.paletteHints")}</span>
          <span class="grow" />
          <span class="num">{t("chrome.paletteCount", { n: flat().length })}</span>
        </div>
      </Overlay>
    </Show>
  );
}
