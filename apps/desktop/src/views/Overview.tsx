/**
 * Overview board (docs/04 §4.4): every goal as a fixed-height card, grouped
 * by how much it needs you. Answers "what needs me, what mode is each goal
 * in, how far along is it" in one glance.
 *
 * The top is one "today bar" — next on the left, what moved on the right —
 * then the quick-start line, then groups as scale marks.
 */
import { For, Show, createMemo, createSignal, onCleanup } from "solid-js";

import { NeedsYouMark } from "../components/Glyph";
import { GoalCard } from "../components/GoalCard";
import { Button, Empty, Select } from "../components/ui";
import type { GoalSummary } from "../gen/GoalSummary";
import { api } from "../lib/api";
import { useKeys } from "../lib/keys";
import { clock } from "../lib/format";
import { t } from "../lib/i18n";
import { type Group, groupLabel, groupOf, modeLabel, pauseLabel, stateLabel } from "../lib/labels";
import { go } from "../lib/nav";
import { act, goalList, state } from "../lib/store";
import { Welcome, startDemo } from "./Welcome";

const ORDER: Group[] = ["needs_you", "running", "review", "ready", "paused", "done"];

export function Overview() {
  const [selected, setSelected] = createSignal<string | null>(null);
  const live = createMemo(() => goalList().filter((g) => g.state !== "archived" && g.state !== "abandoned"));
  const groups = createMemo(() => {
    const by = new Map<Group, GoalSummary[]>();
    for (const g of live()) by.set(groupOf(g), [...(by.get(groupOf(g)) ?? []), g]);
    return ORDER.filter((k) => by.has(k)).map((k) => ({ key: k, goals: by.get(k)! }));
  });
  const flat = createMemo(() => groups().flatMap((g) => g.goals));

  const move = (d: number) => {
    const list = flat();
    if (!list.length) return;
    const i = list.findIndex((g) => g.id === selected());
    const next = list[Math.max(0, Math.min(list.length - 1, i < 0 ? 0 : i + d))];
    setSelected(next.id);
    document.querySelector<HTMLElement>(`[data-goal="${next.id}"] .goal-card`)?.focus();
  };

  useKeys([
    { key: "j", run: () => move(1) },
    { key: "k", run: () => move(-1) },
    { key: "arrowdown", run: () => move(1) },
    { key: "arrowup", run: () => move(-1) },
    { key: "/", run: () => document.querySelector<HTMLInputElement>(".quick-input")?.focus() },
  ]);

  return (
    <Show when={state.projects.length > 0} fallback={<Welcome />}>
      <div class="overview">
        <TodayBar />
        <QuickPath />
        <Show
          when={live().length > 0}
          fallback={
            <div class="col">
              <Empty title={t("overview.emptyTitle")}>{t("overview.emptyBody")}</Empty>
              <span>
                <Button size="s" variant="ghost" onClick={() => void startDemo()} title={t("welcome.demoHint")}>
                  {t("welcome.tryDemo")}
                </Button>
              </span>
            </div>
          }
        >
          <For each={groups()}>
            {(grp) => (
              <section class="board-group">
                <h2 class="scale-title halt">
                  {groupLabel(grp.key)}
                  <span class="num">{grp.goals.length}</span>
                </h2>
                <div class="board-grid">
                  <For each={grp.goals}>
                    {(g) => (
                      <div data-goal={g.id}>
                        <GoalCard goal={g} selected={selected() === g.id} onSelect={() => setSelected(g.id)} />
                      </div>
                    )}
                  </For>
                </div>
              </section>
            )}
          </For>
        </Show>
      </div>
    </Show>
  );
}

const SEEN_KEY = "tower.overviewSeenAt";

/**
 * The today bar: the next thing that needs you on the left; on the right the
 * re-entry briefing (docs/04 §4.9.1) — what moved since you last looked.
 */
function TodayBar() {
  const since = Number(localStorage.getItem(SEEN_KEY) ?? 0);
  onCleanup(() => localStorage.setItem(SEEN_KEY, String(Date.now())));
  const [open, setOpen] = createSignal(true);
  const changed = createMemo(() =>
    since ? goalList().filter((g) => g.updated_at > since && g.state !== "archived").slice(0, 4) : [],
  );
  const describe = (g: GoalSummary) =>
    g.state === "paused" && g.pause_reason
      ? t("overview.pausedWith", { reason: pauseLabel(g.pause_reason) })
      : g.needs_you > 0 && g.state === "running"
        ? modeLabel("waiting_on_you")
        : stateLabel(g.state);
  const next = () => state.inbox[0];
  return (
    <Show when={next() || (open() && changed().length > 0)}>
      <div class="today-bar halt">
        <Show when={next()}>
          {(it) => (
            <button class="next-line" onClick={() => go({ name: "goal", id: it().goal_id })}>
              <NeedsYouMark />
              <span>{t("overview.next")}</span>
              <span class="sep">·</span>
              <span class="code-val t2">{it().goal_id}</span>
              <span class="ellipsis">{it().title}</span>
            </button>
          )}
        </Show>
        <Show when={open() && changed().length > 0}>
          <div class="today-brief">
            <span class="briefing-title">{t("overview.since", { time: clock(since) })}</span>
            <For each={changed()}>
              {(g) => (
                <button class="briefing-item link-plain" onClick={() => go({ name: "goal", id: g.id })}>
                  <span class="num t3">{g.id}</span> {describe(g)}
                </button>
              )}
            </For>
            <button class="link meta" onClick={() => setOpen(false)}>
              {t("overview.gotIt")}
            </button>
          </div>
        </Show>
      </div>
    </Show>
  );
}

/** The one-line quick path (docs/04 §4.10.3): intent in, minimal contract out. */
function QuickPath() {
  const [intent, setIntent] = createSignal("");
  const [project, setProject] = createSignal<string>(state.projects[0]?.id ?? "");
  const [busy, setBusy] = createSignal(false);
  const current = () => state.projects.find((p) => p.id === project()) ?? state.projects[0];

  const submit = async (e: KeyboardEvent) => {
    if (e.key !== "Enter" || e.isComposing) return;
    const text = intent().trim();
    if (!text || !current()) return;
    e.preventDefault();
    if (e.altKey) {
      go({ name: "new", projectId: current()!.id });
      sessionStorage.setItem("tower.draftIntent", text);
      setIntent("");
      return;
    }
    setBusy(true);
    const g = await act(() => api.quickGoal(current()!.id, text));
    setBusy(false);
    if (g) setIntent("");
  };

  return (
    <div class="quick">
      <Show when={state.projects.length > 1}>
        <Select
          class="quick-project"
          value={current()?.id ?? ""}
          options={state.projects.map((p) => ({ value: p.id, label: p.name }))}
          onChange={setProject}
        />
      </Show>
      <span class="quick-prompt" aria-hidden="true">
        ›
      </span>
      <input
        class="quick-input"
        placeholder={t("overview.quickPlaceholder", { project: current()?.name ?? t("overview.project") })}
        value={intent()}
        disabled={busy()}
        onInput={(e) => setIntent(e.currentTarget.value)}
        onKeyDown={submit}
      />
      <div class="quick-hints">{t("overview.quickHints")}</div>
      <Show when={current() && !current()!.test_command}>
        <div class="quick-warn meta">
          {t("overview.noTestCommand")}
          <Button size="s" variant="ghost" onClick={() => go({ name: "settings" })}>
            {t("overview.setTestCommand")}
          </Button>
        </div>
      </Show>
    </div>
  );
}
