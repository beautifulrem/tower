/**
 * Overview board (docs/04 §4.4): every goal as a fixed-height card, grouped
 * by how much it needs you. Answers "what needs me, what mode is each goal
 * in, how far along is it" in one glance.
 */
import { For, Show, createMemo, createSignal, onCleanup } from "solid-js";

import { GoalCard } from "../components/GoalCard";
import { Button, Empty, Kbd } from "../components/ui";
import type { GoalSummary } from "../gen/GoalSummary";
import { api } from "../lib/api";
import { useKeys } from "../lib/keys";
import { clock } from "../lib/format";
import { type Group, groupLabel, groupOf, pauseLabel, stateLabel } from "../lib/labels";
import { go } from "../lib/nav";
import { act, goalList, state } from "../lib/store";
import { Welcome } from "./Welcome";

const ORDER: Group[] = ["needs_you", "running", "review", "ready", "paused", "done"];

export function Overview() {
  const [selected, setSelected] = createSignal<string | null>(null);
  const live = createMemo(() =>
    goalList().filter((g) => g.state !== "archived" && g.state !== "abandoned"),
  );
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
        <QuickPath />
        <AppBriefing />
        <Show
          when={live().length > 0}
          fallback={
            <Empty title="还没有进行中的目标">
              在上面写一句你想要的结果，按 <Kbd k="enter" /> 开始；或按 <Kbd k="n" /> 打开合同编辑器写验收标准。
            </Empty>
          }
        >
          <For each={groups()}>
            {(grp) => (
              <section class="board-group">
                <h2 class="board-group-title">
                  {groupLabel[grp.key]}
                  <span class="num t3">{grp.goals.length}</span>
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
 * App-level re-entry briefing (docs/04 §4.9.1): what moved since you last
 * looked at the board, one line per goal, each a link.
 */
function AppBriefing() {
  const since = Number(localStorage.getItem(SEEN_KEY) ?? 0);
  onCleanup(() => localStorage.setItem(SEEN_KEY, String(Date.now())));
  const [open, setOpen] = createSignal(true);
  const changed = createMemo(() =>
    since ? goalList().filter((g) => g.updated_at > since && g.state !== "archived").slice(0, 8) : [],
  );
  const describe = (g: GoalSummary) =>
    g.state === "paused" && g.pause_reason ? `已暂停（${pauseLabel[g.pause_reason]}）` : g.needs_you > 0 && g.state === "running" ? "等你" : stateLabel[g.state];
  return (
    <Show when={open() && changed().length > 0}>
      <div class="briefing app-briefing">
        <span class="briefing-title">自 {clock(since)} 起</span>
        <For each={changed()}>
          {(g) => (
            <button class="briefing-item link-plain" onClick={() => go({ name: "goal", id: g.id })}>
              <span class="num t3">{g.id}</span> {describe(g)}
            </button>
          )}
        </For>
        <span class="grow" />
        <button class="link meta" onClick={() => setOpen(false)}>
          知道了
        </button>
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
        <select class="quick-project" value={current()?.id} onChange={(e) => setProject(e.currentTarget.value)}>
          <For each={state.projects}>{(p) => <option value={p.id}>{p.name}</option>}</For>
        </select>
      </Show>
      <input
        class="quick-input"
        placeholder={`在 ${current()?.name ?? "项目"} 中，一句话描述你想要的结果…`}
        value={intent()}
        disabled={busy()}
        onInput={(e) => setIntent(e.currentTarget.value)}
        onKeyDown={submit}
      />
      <div class="quick-hints hint">
        <span>
          <Kbd k="enter" /> 快速开始
        </span>
        <span>
          <Kbd k="alt+enter" /> 写合同
        </span>
      </div>
      <Show when={current() && !current()!.test_command}>
        <div class="quick-warn meta">
          这个项目没有检测到测试命令：快速开始的目标将没有可执行的验收标准。
          <Button size="s" variant="ghost" onClick={() => go({ name: "settings" })}>
            设置测试命令
          </Button>
        </div>
      </Show>
    </div>
  );
}
