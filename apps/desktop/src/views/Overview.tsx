/**
 * Overview board (docs/04 §4.4). Two kinds of thing, in one column:
 *
 *   1. The decision queue — every item that blocks a run, as a card you
 *      answer in place (1–9 on the focused card, text with ⌘↩).
 *   2. Everything else as 36px instrument rows, grouped as scale marks:
 *      running, verifying and ready to accept, ready, paused, done.
 *
 * j/k walk one list through both; ↩ opens; r reviews. The same page reads
 * at 0 goals (one statement and a way to start), at 1 and at 12.
 */
import { For, Show, createMemo, createSignal, onCleanup } from "solid-js";

import { DecisionCard, chooseOption } from "../components/DecisionCard";
import { GoalRow } from "../components/GoalRow";
import { Button, Empty, Select } from "../components/ui";
import type { GoalSummary } from "../gen/GoalSummary";
import type { InboxItem } from "../gen/InboxItem";
import { api } from "../lib/api";
import { useKeys } from "../lib/keys";
import { clock } from "../lib/format";
import { t } from "../lib/i18n";
import { type Group, groupLabel, groupOf, isBlocking, modeLabel, pauseLabel, stateLabel } from "../lib/labels";
import { go } from "../lib/nav";
import { act, goalList, state } from "../lib/store";
import { Welcome, startDemo } from "./Welcome";

const ORDER: Group[] = ["running", "review", "ready", "paused", "done"];
const FILTER_KEY = "tower.overviewProject";
const ALL = "__all__";

type Item = { kind: "decision"; id: string; item: InboxItem } | { kind: "goal"; id: string; goal: GoalSummary };

export function Overview() {
  const [selected, setSelected] = createSignal<string | null>(null);
  const [project, setProject] = createSignal(localStorage.getItem(FILTER_KEY) ?? ALL);
  const pickProject = (id: string) => {
    setProject(id);
    localStorage.setItem(FILTER_KEY, id);
  };
  const projectOk = (projectId: string) => project() === ALL || project() === projectId || !state.projects.some((p) => p.id === project());

  const decisions = createMemo(() => state.inbox.filter((i) => isBlocking(i) && projectOk(state.goals[i.goal_id]?.project_id ?? "")));
  const decided = createMemo(() => new Set(decisions().map((d) => d.goal_id)));
  const live = createMemo(() =>
    goalList().filter((g) => g.state !== "archived" && g.state !== "abandoned" && projectOk(g.project_id) && !decided().has(g.id)),
  );
  const groups = createMemo(() => {
    const by = new Map<Group, GoalSummary[]>();
    for (const g of live()) {
      const k = groupOf(g) === "needs_you" ? "review" : groupOf(g);
      by.set(k, [...(by.get(k) ?? []), g]);
    }
    return ORDER.filter((k) => by.has(k)).map((k) => ({ key: k, goals: by.get(k)! }));
  });
  const flat = createMemo<Item[]>(() => [
    ...decisions().map<Item>((item) => ({ kind: "decision", id: item.id, item })),
    ...groups().flatMap((g) => g.goals.map<Item>((goal) => ({ kind: "goal", id: goal.id, goal }))),
  ]);
  const current = () => flat().find((i) => i.id === selected()) ?? null;

  const move = (d: number) => {
    const list = flat();
    if (!list.length) return;
    const i = list.findIndex((x) => x.id === selected());
    const next = list[Math.max(0, Math.min(list.length - 1, i < 0 ? 0 : i + d))];
    setSelected(next.id);
    const el =
      next.kind === "goal"
        ? document.querySelector<HTMLElement>(`[data-goal="${next.id}"] .g-title`)
        : document.querySelector<HTMLElement>(`[data-decision="${next.id}"] .decision`);
    el?.focus({ preventScroll: true });
    el?.scrollIntoView({ block: "nearest" });
  };
  const openCurrent = () => {
    const c = current();
    if (!c) return;
    go({ name: "goal", id: c.kind === "goal" ? c.id : c.item.goal_id });
  };
  const reviewCurrent = () => {
    const c = current();
    if (c?.kind === "goal" && c.goal.diffstat) go({ name: "review", id: c.id });
  };
  const pick = (n: number) => {
    const c = current();
    if (c?.kind === "decision") void chooseOption(c.item, n);
  };

  useKeys(
    [
      { key: "j", run: () => move(1), desc: () => t("keys.move"), hint: "j k" },
      { key: "k", run: () => move(-1) },
      { key: "arrowdown", run: () => move(1) },
      { key: "arrowup", run: () => move(-1) },
      { key: "enter", run: openCurrent, desc: () => t("keys.open") },
      { key: "r", run: reviewCurrent, desc: () => t("keys.reviewSelected") },
      { key: "/", run: () => document.querySelector<HTMLInputElement>(".quick-input")?.focus(), desc: () => t("keys.quick") },
      ...Array.from({ length: 9 }, (_, i) => ({ key: String(i + 1), run: () => pick(i), desc: i === 0 ? () => t("keys.choose") : undefined, hint: i === 0 ? "1 9" : undefined })),
    ],
    () => t("app.overview"),
  );

  const total = () => decisions().length + live().length;
  const ended = () => goalList().filter((g) => g.state === "archived" || g.state === "abandoned").length;

  return (
    <Show when={state.projects.length > 0} fallback={<Welcome />}>
      <div class="overview">
        <Briefing />
        <div class="overview-top">
          <QuickPath project={project() === ALL ? undefined : project()} />
          <Show when={state.projects.length > 1}>
            <Select
              class="overview-filter"
              label={t("overview.filterLabel")}
              value={project()}
              options={[{ value: ALL, label: t("overview.allProjects") }, ...state.projects.map((p) => ({ value: p.id, label: p.name }))]}
              onChange={pickProject}
            />
          </Show>
        </div>
        <Show
          when={total() > 0}
          fallback={
            <Empty
              title={project() === ALL ? t("overview.emptyTitle") : t("overview.emptyProject", { project: state.projects.find((p) => p.id === project())?.name ?? "" })}
              action={
                <span class="row">
                  <Button size="s" onClick={() => void startDemo()} title={t("welcome.demoHint")}>
                    {t("welcome.tryDemo")}
                  </Button>
                  <Show when={ended() > 0}>
                    <span class="meta t3">{t("overview.endedCount", { n: ended() })}</span>
                  </Show>
                </span>
              }
            >
              {t("overview.emptyBody")}
            </Empty>
          }
        >
          <Show when={decisions().length > 0}>
            <section class="board-group">
              <h2 class="scale-title halt">
                {t("group.needs_you")}
                <span class="num">{decisions().length}</span>
              </h2>
              <div class="board-queue">
                <For each={decisions()}>
                  {(it) => (
                    <div data-decision={it.id} onMouseEnter={() => setSelected(it.id)} onFocusIn={() => setSelected(it.id)}>
                      <DecisionCard item={it} focused={selected() === it.id} quiet />
                    </div>
                  )}
                </For>
              </div>
            </section>
          </Show>
          <For each={groups()}>
            {(grp) => (
              <section class="board-group">
                <h2 class="scale-title halt">
                  {groupLabel(grp.key)}
                  <span class="num">{grp.goals.length}</span>
                </h2>
                <div class="board-rows" role="list">
                  <For each={grp.goals}>
                    {(g) => (
                      <div role="listitem">
                        <GoalRow goal={g} selected={selected() === g.id} onSelect={() => setSelected(g.id)} />
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

/** The re-entry briefing (docs/04 §4.9.1): what moved since you last looked, one line, dismissable. */
function Briefing() {
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
  return (
    <Show when={open() && changed().length > 0}>
      <div class="today-bar halt" role="status">
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
  );
}

/** The one-line quick path (docs/04 §4.10.3): intent in, minimal contract out. */
function QuickPath(props: { project?: string }) {
  const [intent, setIntent] = createSignal("");
  const [project, setProject] = createSignal<string>(props.project ?? state.projects[0]?.id ?? "");
  const [busy, setBusy] = createSignal(false);
  const current = () => state.projects.find((p) => p.id === (props.project ?? project())) ?? state.projects[0];

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
      <Show when={state.projects.length > 1 && !props.project}>
        <Select
          class="quick-project"
          label={t("contract.project")}
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
        aria-label={t("overview.quickLabel", { project: current()?.name ?? t("overview.project") })}
        placeholder={t("overview.quickPlaceholder", { project: current()?.name ?? t("overview.project") })}
        value={intent()}
        disabled={busy()}
        onInput={(e) => setIntent(e.currentTarget.value)}
        onKeyDown={submit}
      />
      <div class="quick-hints" aria-hidden="true">
        {t("overview.quickHints")}
      </div>
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
