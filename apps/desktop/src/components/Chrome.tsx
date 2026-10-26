/** Title bar status strip, toasts and the command palette. */
import { For, Show, createMemo, createSignal } from "solid-js";

import { api } from "../lib/api";
import { usd } from "../lib/format";
import { t } from "../lib/i18n";
import { useKeys } from "../lib/keys";
import { back, canGoBack, go, route } from "../lib/nav";
import { act, goalList, state } from "../lib/store";
import { LifecycleGlyph } from "./Glyph";
import { Kbd } from "./ui";

export function TitleBar(props: { title: string; actions?: unknown }) {
  const running = () => goalList().filter((g) => g.state === "running").length;
  const spent = () => goalList().reduce((s, g) => s + g.cost_usd, 0);
  const max = () => state.settings?.max_concurrent ?? 3;
  return (
    <header class="titlebar" data-tauri-drag-region>
      <Show when={canGoBack()}>
        <button class="titlebar-back" onClick={back} title={t("common.back")}>
          ←
        </button>
      </Show>
      <h1 class="titlebar-title ellipsis" data-tauri-drag-region>
        {props.title}
      </h1>
      <span class="grow" data-tauri-drag-region />
      <div class="titlebar-status meta num" data-tauri-drag-region>
        <span>{t("chrome.running", { n: running(), max: max() })}</span>
        <span class="sep">·</span>
        <span>{t("chrome.spent", { usd: usd(spent()) })}</span>
        <Show when={state.env && !state.env.pi_version}>
          <span class="sep">·</span>
          <button class="link" onClick={() => go({ name: "settings" })}>
            {t("chrome.piNotReady")}
          </button>
        </Show>
      </div>
      <button class="titlebar-palette" onClick={() => openPalette()}>
        <span class="t3">{t("chrome.search")}</span>
        <Kbd k="mod+k" />
      </button>
    </header>
  );
}

export function Toasts() {
  return (
    <div class="toasts" role="status" aria-live="polite">
      <For each={state.toasts}>{(t) => <div class={`toast toast-${t.level}`}>{t.text}</div>}</For>
    </div>
  );
}

const [paletteOpen, setPaletteOpen] = createSignal(false);
export const openPalette = () => setPaletteOpen(true);

interface Command {
  id: string;
  title: string;
  hint?: string;
  run: () => void;
  goalId?: string;
}

export function CommandPalette() {
  const [q, setQ] = createSignal("");
  const [sel, setSel] = createSignal(0);

  const commands = createMemo<Command[]>(() => {
    const base: Command[] = [
      { id: "new", title: t("app.newGoal"), hint: "n", run: () => go({ name: "new" }) },
      { id: "overview", title: t("chrome.openOverview"), hint: "mod+1", run: () => go({ name: "overview" }) },
      { id: "inbox", title: t("chrome.openInbox"), hint: "mod+2", run: () => go({ name: "inbox" }) },
      { id: "settings", title: t("chrome.openSettings"), hint: "mod+,", run: () => go({ name: "settings" }) },
      { id: "integration", title: t("chrome.checkIntegration"), run: () => void act(api.checkIntegration, t("chrome.checked")) },
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

  const filtered = createMemo(() => {
    const needle = q().trim().toLowerCase();
    const list = needle ? commands().filter((c) => c.title.toLowerCase().includes(needle)) : commands();
    return list.slice(0, 12);
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

  useKeys([{ key: "mod+k", run: () => (paletteOpen() ? close() : setPaletteOpen(true)), inInputs: true }]);

  return (
    <Show when={paletteOpen()}>
      <div class="overlay" onClick={close}>
        <div class="palette" onClick={(e) => e.stopPropagation()}>
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
          <div class="palette-list">
            <For each={filtered()} fallback={<div class="palette-empty t3">{t("chrome.noMatches")}</div>}>
              {(c, i) => (
                <button class="palette-item" classList={{ selected: i() === sel() }} onMouseEnter={() => setSel(i())} onClick={() => run(c)}>
                  <Show when={c.goalId} fallback={<span class="palette-icon t3">›</span>}>
                    <LifecycleGlyph goal={state.goals[c.goalId!]} />
                  </Show>
                  <span class="ellipsis grow">{c.title}</span>
                  <Show when={c.hint}>
                    <Kbd k={c.hint!} />
                  </Show>
                </button>
              )}
            </For>
          </div>
        </div>
      </div>
    </Show>
  );
}
