/**
 * Sidebar (docs/04 §4.3.2): goals and the Needs-You inbox, nothing else.
 * Sessions are traces inside goals, never a list of their own. The foot
 * carries one sign of life, so "quiet" never has to mean "dead".
 */
import { For, Show, createMemo } from "solid-js";

import type { GoalSummary } from "../gen/GoalSummary";
import { type Group, groupLabel, groupOf } from "../lib/labels";
import { t } from "../lib/i18n";
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
  const engineOk = () => !!state.env?.pi_version;

  return (
    <nav class="sidebar" aria-label={t("sidebar.label")}>
      <div class="sidebar-drag" data-tauri-drag-region />
      <div class="side-top">
        <button class="side-row" classList={{ active: route().name === "new" }} onClick={() => go({ name: "new" })}>
          <span class="side-icon" aria-hidden="true">
            ＋
          </span>
          <span class="grow">{t("app.newGoal")}</span>
          <Kbd k="mod+n" />
        </button>
        <button class="side-row" classList={{ active: route().name === "inbox" }} onClick={() => go({ name: "inbox" })}>
          <span class="side-icon">
            <Show when={state.inbox.length > 0} fallback={<span class="dot-quiet" />}>
              <NeedsYouMark />
            </Show>
          </span>
          <span class="grow">{t("common.needsYou")}</span>
          <span class="num side-count" classList={{ t1: state.inbox.length > 0 }}>
            {state.inbox.length || ""}
          </span>
        </button>
        <button
          class="side-row"
          classList={{ active: route().name === "overview" }}
          onClick={() => go({ name: "overview" })}
        >
          <span class="side-icon" aria-hidden="true">
            ▦
          </span>
          <span class="grow">{t("app.overview")}</span>
          <Kbd k="mod+1" />
        </button>
      </div>

      <div class="side-scroll">
        <For each={groups()}>
          {(grp) => (
            <div class="side-group">
              <div class="side-group-title halt">
                <span>{groupLabel(grp.key)}</span>
                <span class="num">{grp.goals.length}</span>
              </div>
              <For each={grp.goals}>
                {(g) => (
                  <button
                    class="side-row side-goal"
                    classList={{ active: activeId() === g.id }}
                    onClick={() => go({ name: "goal", id: g.id })}
                    title={`${g.id} ${g.title}`}
                  >
                    <span class="side-icon">
                      <LifecycleGlyph goal={g} />
                    </span>
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
          <div class="side-group-title">
            <span>{t("sidebar.ended")}</span>
            <span class="num">{ended()}</span>
          </div>
        </Show>
      </div>

      <button class="side-foot halt" onClick={() => go({ name: "settings" })} title={state.env?.pi_path ?? ""}>
        <Show
          when={engineOk()}
          fallback={
            <>
              <span class="mark-danger">■</span>
              <span class="t1">{t("sidebar.engineDown")}</span>
            </>
          }
        >
          <span class="pulse" aria-hidden="true" />
          <span>{t("sidebar.engineOk")}</span>
          <span class="sep">·</span>
          <span class="ellipsis">Pi {state.env!.pi_version!.split(" ")[0]}</span>
        </Show>
      </button>
    </nav>
  );
}
