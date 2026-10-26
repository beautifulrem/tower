/**
 * Sidebar (docs/04 §4.3.2): only goals and the Needs-You inbox. Sessions are
 * traces inside goals, never a list of their own.
 */
import { For, Show, createMemo } from "solid-js";

import type { GoalSummary } from "../gen/GoalSummary";
import { type Group, groupLabel, groupOf } from "../lib/labels";
import { go, route } from "../lib/nav";
import { goalList, state } from "../lib/store";
import { LifecycleGlyph, NeedsYouMark } from "./Glyph";
import { Kbd } from "./ui";

const ORDER: Group[] = ["needs_you", "running", "review", "ready", "paused", "done"];

export function Sidebar() {
  const groups = createMemo(() => {
    const by = new Map<Group, GoalSummary[]>();
    for (const g of goalList()) {
      if (g.state === "archived" || g.state === "abandoned") continue;
      const k = groupOf(g);
      by.set(k, [...(by.get(k) ?? []), g]);
    }
    return ORDER.filter((k) => by.has(k)).map((k) => ({ key: k, goals: by.get(k)! }));
  });
  const ended = () => goalList().filter((g) => g.state === "archived" || g.state === "abandoned").length;
  const activeId = () => {
    const r = route();
    return r.name === "goal" || r.name === "review" ? r.id : null;
  };
  const next = () => state.inbox[0];

  return (
    <nav class="sidebar">
      <div class="sidebar-drag" data-tauri-drag-region />
      <button
        class="side-inbox"
        classList={{ active: route().name === "inbox", "has-items": state.inbox.length > 0 }}
        onClick={() => go({ name: "inbox" })}
      >
        <div class="row">
          <Show when={state.inbox.length > 0} fallback={<span class="side-inbox-dot" />}>
            <NeedsYouMark />
          </Show>
          <span class="side-inbox-title">需要你</span>
          <span class="grow" />
          <span class="num side-count">{state.inbox.length}</span>
          <Kbd k="mod+2" />
        </div>
        <Show
          when={next()}
          fallback={<div class="side-inbox-next t3">没有需要你决定的事</div>}
        >
          <div class="side-inbox-next ellipsis">
            下一件：{next()!.goal_id} · {next()!.title}
          </div>
        </Show>
      </button>

      <button class="side-link" classList={{ active: route().name === "overview" }} onClick={() => go({ name: "overview" })}>
        <span>概览</span>
        <span class="grow" />
        <Kbd k="mod+1" />
      </button>

      <div class="side-scroll">
        <For each={groups()}>
          {(grp) => (
            <div class="side-group">
              <div class="side-group-title">
                <span>{groupLabel[grp.key]}</span>
                <span class="num t3">{grp.goals.length}</span>
              </div>
              <For each={grp.goals}>
                {(g) => (
                  <button
                    class="side-goal"
                    classList={{ active: activeId() === g.id }}
                    onClick={() => go({ name: "goal", id: g.id })}
                    title={`${g.id} ${g.title}`}
                  >
                    <LifecycleGlyph goal={g} />
                    <span class="ellipsis grow">{g.title}</span>
                    <Show when={g.needs_you > 0}>
                      <NeedsYouMark />
                    </Show>
                  </button>
                )}
              </For>
            </div>
          )}
        </For>
        <Show when={ended() > 0}>
          <div class="side-group-title t3">
            <span>已结束</span>
            <span class="num">{ended()}</span>
          </div>
        </Show>
      </div>

      <div class="side-foot">
        <button class="side-link" onClick={() => go({ name: "new" })}>
          <span>新目标</span>
          <span class="grow" />
          <Kbd k="n" />
        </button>
        <button class="side-link" classList={{ active: route().name === "settings" }} onClick={() => go({ name: "settings" })}>
          <span>设置</span>
          <span class="grow" />
          <Kbd k="mod+," />
        </button>
        <div class="side-version hint">
          <Show when={state.env?.pi_version} fallback="Pi 未就绪">
            Pi {state.env!.pi_version}
          </Show>
        </div>
      </div>
    </nav>
  );
}
