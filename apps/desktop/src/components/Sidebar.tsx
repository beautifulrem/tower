/**
 * Sidebar (docs/04 §4.3.2): goals and the Needs-You inbox, nothing else.
 * Sessions are traces inside goals, never a list of their own. Counts are
 * split the way the attention ladder is: "Needs you" is what blocks a run;
 * "To review" is what merely waits for your acceptance.
 */
import { For, Show, createMemo, createSignal } from "solid-js";

import type { GoalSummary } from "../gen/GoalSummary";
import { type Group, groupLabel, groupOf, isBlocking } from "../lib/labels";
import { t } from "../lib/i18n";
import { go, route } from "../lib/nav";
import { goalList, state } from "../lib/store";
import { Icon, LifecycleGlyph, NeedsYouMark } from "./Glyph";
import { Kbd } from "./ui";

const ORDER: Group[] = ["needs_you", "running", "review", "ready", "paused", "done"];

const isEnded = (g: GoalSummary) => g.state === "archived" || g.state === "abandoned";

export function Sidebar() {
  const [endedOpen, setEndedOpen] = createSignal(false);
  const groups = createMemo(() => {
    const by = new Map<Group, GoalSummary[]>();
    for (const g of goalList()) {
      if (isEnded(g)) continue;
      const k = groupOf(g);
      by.set(k, [...(by.get(k) ?? []), g]);
    }
    return ORDER.filter((k) => by.has(k)).map((k) => ({ key: k, goals: by.get(k)! }));
  });
  const ended = createMemo(() => goalList().filter(isEnded));
  const blocking = () => state.inbox.filter(isBlocking).length;
  const toReview = () => state.inbox.length - blocking();
  const activeId = () => {
    const r = route();
    return r.name === "goal" || r.name === "review" ? r.id : null;
  };

  const GoalRow = (props: { g: GoalSummary }) => (
    <button
      class="side-row side-goal"
      classList={{ active: activeId() === props.g.id, ended: isEnded(props.g) }}
      onClick={() => go({ name: "goal", id: props.g.id })}
      title={`${props.g.id} ${props.g.title}`}
      aria-label={`${props.g.title}, ${t(`state.${props.g.state}`)}${props.g.needs_you > 0 ? `, ${t("common.needsYou")}` : ""}`}
    >
      <span class="side-icon">
        <LifecycleGlyph goal={props.g} />
      </span>
      <span class="ellipsis grow">{props.g.title}</span>
      <Show when={props.g.needs_you > 0}>
        <NeedsYouMark />
      </Show>
    </button>
  );

  return (
    <nav class="sidebar" aria-label={t("sidebar.label")}>
      <div class="sidebar-drag" data-tauri-drag-region />
      <div class="side-top">
        <button class="side-row" classList={{ active: route().name === "new" }} onClick={() => go({ name: "new" })}>
          <span class="side-icon">
            <Icon name="plus" />
          </span>
          <span class="grow">{t("app.newGoal")}</span>
          <Kbd k="mod+n" />
        </button>
        <button class="side-row" classList={{ active: route().name === "inbox" }} onClick={() => go({ name: "inbox" })}>
          <span class="side-icon">
            <Show when={blocking() > 0} fallback={<Icon name="inbox" />}>
              <NeedsYouMark />
            </Show>
          </span>
          <span class="grow">{t("common.needsYou")}</span>
          <span class="num side-count" classList={{ t1: blocking() > 0 }}>
            {blocking() || ""}
          </span>
        </button>
        <Show when={toReview() > 0}>
          <button class="side-row" onClick={() => go({ name: "inbox" })}>
            <span class="side-icon">
              <Icon name="ring-check" />
            </span>
            <span class="grow">{t("sidebar.toReview")}</span>
            <span class="num side-count t1">{toReview()}</span>
          </button>
        </Show>
        <button class="side-row" classList={{ active: route().name === "overview" }} onClick={() => go({ name: "overview" })}>
          <span class="side-icon">
            <Icon name="grid" />
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
              <For each={grp.goals}>{(g) => <GoalRow g={g} />}</For>
            </div>
          )}
        </For>
        <Show when={ended().length > 0}>
          <div class="side-group">
            <button
              class="side-group-title side-group-toggle halt"
              aria-expanded={endedOpen()}
              onClick={() => setEndedOpen((o) => !o)}
            >
              <span>
                <Icon name={endedOpen() ? "caret-down" : "caret-right"} size={10} />
                {t("sidebar.ended")}
              </span>
              <span class="num">{ended().length}</span>
            </button>
            <Show when={endedOpen()}>
              <For each={ended()}>{(g) => <GoalRow g={g} />}</For>
            </Show>
          </div>
        </Show>
      </div>

      <div class="side-foot">
        <button class="side-row" classList={{ active: route().name === "settings" }} onClick={() => go({ name: "settings" })}>
          <span class="side-icon">
            <Icon name="sliders" />
          </span>
          <span class="grow">{t("app.settings")}</span>
          <Kbd k="mod+," />
        </button>
      </div>
    </nav>
  );
}
