/** Title bar (breadcrumb and gauges), toasts and the command palette. */
import { For, Show, createMemo, createSignal } from "solid-js";

import { api } from "../lib/api";
import { usd } from "../lib/format";
import { t } from "../lib/i18n";
import { useKeys } from "../lib/keys";
import { back, canGoBack, go, route } from "../lib/nav";
import { act, dismissToast, goalList, state } from "../lib/store";
import { stateLabel } from "../lib/labels";
import { Icon, type IconName, LifecycleGlyph, NeedsYouMark } from "./Glyph";
import { IconButton, Kbd } from "./ui";

/**
 * Left: where you are. On a goal that is the breadcrumb `project › G-0003`
 * (the title belongs to the H1 below); elsewhere the page name. Right: the
 * gauge cluster — runs, spend, engine — in one fixed-width strip.
 */
export function TitleBar(props: { title: string }) {
  const running = () => goalList().filter((g) => g.state === "running").length;
  const spent = () => goalList().reduce((s, g) => s + g.cost_usd, 0);
  const max = () => state.settings?.max_concurrent ?? 3;
  const engineOk = () => !!state.env?.pi_version;
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
          <div class="titlebar-crumbs" data-tauri-drag-region>
            <span class="ellipsis">{c().project}</span>
            <Icon name="chevron-right" size={10} />
            <span class="code-val t2">{c().id}</span>
          </div>
        )}
      </Show>
      <span class="grow" data-tauri-drag-region />
      <div class="titlebar-gauges num halt" data-tauri-drag-region>
        <Show when={running() > 0}>
          <span class="gauge gauge-active" title={t("chrome.running", { n: running(), max: max() })}>
            <LifecycleGlyph goal={{ state: "running", progress: { verified: 0, observed: 0, machine: 0, human: 0, human_done: 0 }, verified_pin: null }} />
            {t("chrome.runningShort", { n: running(), max: max() })}
          </span>
        </Show>
        <span class="gauge" title={t("chrome.spent", { usd: usd(spent()) })}>
          {usd(spent())}
        </span>
        <Show
          when={engineOk()}
          fallback={
            <button class="gauge gauge-down link-plain" onClick={() => go({ name: "settings" })}>
              <span class="gauge-dot down" />
              {t("chrome.piNotReady")}
            </button>
          }
        >
          <span class="gauge" title={state.env?.pi_path ?? ""}>
            <span class="gauge-dot" />
            {t("chrome.engine")}
            <span class="t3">Pi {state.env!.pi_version!.split(" ")[0]}</span>
          </span>
        </Show>
      </div>
      <IconButton icon="search" size={26} label={`${t("chrome.search")} ⌘K`} onClick={() => openPalette("mouse")} />
    </header>
  );
}

export function Toasts() {
  return (
    <div class="toasts">
      <For each={state.toasts}>
        {(toast) => (
          <div class={`toast toast-${toast.level}`} classList={{ leaving: !!toast.leaving }} role={toast.level === "error" ? "alert" : "status"}>
            <span class="toast-text">{toast.text}</span>
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
}

/** Marks the matched characters so the eye lands on why a row is here. */
function Highlight(props: { text: string; needle: string }) {
  const parts = createMemo(() => {
    const n = props.needle;
    if (!n) return [{ s: props.text, hit: false }];
    const i = props.text.toLowerCase().indexOf(n);
    if (i < 0) return [{ s: props.text, hit: false }];
    return [
      { s: props.text.slice(0, i), hit: false },
      { s: props.text.slice(i, i + n.length), hit: true },
      { s: props.text.slice(i + n.length), hit: false },
    ];
  });
  return <For each={parts()}>{(p) => (p.hit ? <span class="hl">{p.s}</span> : p.s)}</For>;
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
      run: () => go({ name: "goal", id: g.id }),
    }));
    return [...base, ...goals];
  });

  const needle = () => q().trim().toLowerCase();
  const filtered = createMemo(() => {
    const n = needle();
    const list = n ? commands().filter((c) => c.title.toLowerCase().includes(n)) : commands();
    return list.slice(0, 14);
  });
  const groups = createMemo(() => {
    const cmds = filtered().filter((c) => !c.goalId);
    const goals = filtered().filter((c) => c.goalId);
    return [
      { title: t("chrome.groupCommands"), items: cmds, offset: 0 },
      { title: t("chrome.groupGoals"), items: goals, offset: cmds.length },
    ].filter((g) => g.items.length);
  });

  const close = () => {
    setPaletteOpen(false);
    setQ("");
    setSel(0);
  };
  const run = (c: Command | undefined) => {
    if (!c) return;
    close();
    c.run();
  };

  useKeys([{ key: "mod+k", run: () => (paletteOpen() ? close() : setPaletteOpen("keyboard")), inInputs: true }]);

  return (
    <Show when={paletteOpen()}>
      <div class="overlay" classList={{ instant: paletteOpen() === "keyboard" }} onClick={close}>
        <div class="palette" role="dialog" aria-modal="true" aria-label={t("chrome.search")} onClick={(e) => e.stopPropagation()}>
          <div class="palette-field">
            <span class="palette-prompt" aria-hidden="true">
              ›
            </span>
            <input
              ref={(el) => setTimeout(() => el.focus())}
              class="palette-input"
              placeholder={t("chrome.searchPlaceholder")}
              value={q()}
              onInput={(e) => {
                setQ(e.currentTarget.value);
                setSel(0);
              }}
              onKeyDown={(e) => {
                if (e.key === "Escape") close();
                else if (e.key === "ArrowDown") (e.preventDefault(), setSel((s) => Math.min(s + 1, filtered().length - 1)));
                else if (e.key === "ArrowUp") (e.preventDefault(), setSel((s) => Math.max(s - 1, 0)));
                else if (e.key === "Enter") run(filtered()[sel()]);
              }}
            />
          </div>
          <div class="palette-list">
            <For each={groups()} fallback={<div class="palette-empty t3">{t("chrome.noMatches")}</div>}>
              {(grp) => (
                <>
                  <div class="palette-group">{grp.title}</div>
                  <For each={grp.items}>
                    {(c, i) => {
                      const idx = () => grp.offset + i();
                      const goal = () => (c.goalId ? state.goals[c.goalId] : undefined);
                      return (
                        <button
                          class="palette-item"
                          classList={{ selected: idx() === sel() }}
                          onMouseEnter={() => setSel(idx())}
                          onClick={() => run(c)}
                        >
                          <span class="palette-icon">
                            <Show when={goal()} fallback={<Icon name={c.icon ?? "chevron-right"} />}>
                              {(g) => <LifecycleGlyph goal={g()} />}
                            </Show>
                          </span>
                          <span class="ellipsis grow">
                            <Show when={goal()} fallback={<Highlight text={c.title} needle={needle()} />}>
                              {(g) => (
                                <>
                                  <span class="code-val t2">{g().id}</span> <Highlight text={g().title} needle={needle()} />
                                </>
                              )}
                            </Show>
                          </span>
                          <Show when={goal()}>
                            {(g) => (
                              <>
                                <Show when={g().needs_you > 0}>
                                  <NeedsYouMark />
                                </Show>
                                <span class="palette-state">{stateLabel(g().state)}</span>
                              </>
                            )}
                          </Show>
                          <Show when={c.hint}>
                            <Kbd k={c.hint!} />
                          </Show>
                        </button>
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
            <span class="num">{t("chrome.paletteCount", { n: filtered().length })}</span>
          </div>
        </div>
      </div>
    </Show>
  );
}
