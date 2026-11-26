/**
 * Sidebar (docs/04 §4.3.2): goals and the Needs-You inbox, nothing else.
 * Sessions are traces inside goals, never a list of their own. Counts are
 * split the way the attention ladder is: "Needs you" is what blocks a run;
 * "To review" is what merely waits for your review. The "Review queue" entry
 * counts every goal with a review card (some also in Needs you) and steps
 * through them; one name, one set.
 */
import { For, Show, createMemo, createSignal } from "solid-js";

import type { GoalSummary } from "../gen/GoalSummary";
import { type Group, groupLabel, groupOf, isBlocking, statusWord } from "../lib/labels";
import { reviewEach, toReviewIds } from "../lib/reviewQueue";
import { t } from "../lib/i18n";
import { go, route } from "../lib/nav";
import { goalList, state } from "../lib/store";
import { Icon, LifecycleGlyph, NoticeMark } from "./Glyph";
import { Kbd } from "./ui";

const ORDER: Group[] = ["needs_you", "running", "verifying", "review", "ready", "paused", "done"];

const isEnded = (g: GoalSummary) => g.state === "archived" || g.state === "abandoned";

export function Sidebar() {
  const [endedOpen, setEndedOpen] = createSignal(false);
  // Accepted and merged goals need nothing from you most days: folded by default, the count stays.
  const [doneOpen, setDoneOpen] = createSignal(false);
  // One source for "needs you": the blocking items. The top row counts them; the group lists their goals and counts them too.
  const blockingItems = createMemo(() => state.inbox.filter(isBlocking));
  const blockedGoals = createMemo(() => new Set(blockingItems().map((i) => i.goal_id)));
  const groups = createMemo(() => {
    const by = new Map<Group, GoalSummary[]>();
    for (const g of goalList()) {
      if (isEnded(g)) continue;
      const k = groupOf(g, blockedGoals());
      by.set(k, [...(by.get(k) ?? []), g]);
    }
    return ORDER.filter((k) => by.has(k)).map((k) => ({ key: k, goals: by.get(k)!, count: k === "needs_you" ? blockingItems().length : by.get(k)!.length }));
  });
  // Rendered by key, so a goal changing group does not rebuild every row (and drop the focus of the one you are on).
  const groupKeys = createMemo(() => groups().map((g) => g.key));
  const groupAt = (k: Group) => groups().find((g) => g.key === k) ?? { key: k, goals: [] as GoalSummary[], count: 0 };
  const ended = createMemo(() => goalList().filter(isEnded));
  const blocking = () => blockingItems().length;
  // Goals waiting for your review: the row starts the review queue over them (⇧R), not a second door to Needs you.
  const toReview = () => toReviewIds().length;
  const activeId = () => {
    const r = route();
    return r.name === "goal" || r.name === "review" ? r.id : null;
  };

  // Under "Needs you" the group's title already says it: a row there carries no ! mark of its own (its glyph may be one);
  // nor does a pass that doesn't count, whose glyph is the ! mark. One ! to a row.
  const GoalRow = (props: { g: GoalSummary; inNeedsYou?: boolean }) => (
    <button
      class="side-row side-goal"
      classList={{ active: activeId() === props.g.id, ended: isEnded(props.g) }}
      aria-current={activeId() === props.g.id ? "page" : undefined}
      onClick={() => go({ name: "goal", id: props.g.id })}
      title={`${props.g.id} ${props.g.title}`}
      aria-label={`${props.g.title}, ${statusWord(props.g)}${props.inNeedsYou ? `, ${t("common.needsYou")}` : ""}`}
    >
      <span class="side-icon">
        <LifecycleGlyph goal={props.g} />
      </span>
      {/* Needs you is the group's word, as on the board: a goal filed elsewhere (waiting in To review) is not said to
          need you, in its label or by a ! mark after its title. */}
      <span class="ellipsis grow">{props.g.title}</span>
    </button>
  );

  return (
    <nav class="sidebar" aria-label={t("sidebar.label")}>
      <div class="sidebar-drag" data-tauri-drag-region />
      <div class="side-top">
        <button class="side-row" classList={{ active: route().name === "new" }} aria-current={route().name === "new" ? "page" : undefined} onClick={() => go({ name: "new" })}>
          <span class="side-icon">
            <Icon name="plus" size={14} />
          </span>
          <span class="grow">{t("app.newGoal")}</span>
          <Kbd k="mod+n" />
        </button>
        <button class="side-row" classList={{ active: route().name === "overview" }} aria-current={route().name === "overview" ? "page" : undefined} onClick={() => go({ name: "overview" })}>
          <span class="side-icon">
            <Icon name="grid" size={14} />
          </span>
          <span class="grow">{t("app.overview")}</span>
          <Kbd k="mod+1" />
        </button>
        <button
          class="side-row"
          classList={{ active: route().name === "inbox" }}
          aria-current={route().name === "inbox" ? "page" : undefined}
          onClick={() => go({ name: "inbox" })}
        >
          {/* The tray stays the tray; something waiting for you tints it in the attention colour, and the count says how much. */}
          <span class="side-icon" classList={{ "side-icon-attention": blocking() > 0 }}>
            <Icon name="inbox" size={14} />
          </span>
          <span class="grow">{t("common.needsYou")}</span>
          <span class="num side-count" classList={{ t1: blocking() > 0 }}>
            {blocking() || ""}
          </span>
        </button>
        <Show when={toReview() > 0}>
          <button class="side-row" classList={{ active: route().name === "review" }} onClick={reviewEach}>
            <span class="side-icon">
              <Icon name="ring-check" size={14} />
            </span>
            <span class="grow">{t("sidebar.toReview")}</span>
            <span class="num side-count">{toReview()}</span>
          </button>
        </Show>
        <button class="side-row" classList={{ active: route().name === "learning" }} aria-current={route().name === "learning" ? "page" : undefined} onClick={() => go({ name: "learning" })}>
          <span class="side-icon">
            <Icon name="learning" size={14} />
          </span>
          <span class="grow">{t("app.learning")}</span>
          <Show when={state.pendingProposals > 0} fallback={<Kbd k="mod+3" />}>
            <span class="num side-count">{state.pendingProposals}</span>
          </Show>
        </button>
        <button class="side-row" classList={{ active: route().name === "operations" }} aria-current={route().name === "operations" ? "page" : undefined} onClick={() => go({ name: "operations" })}>
          {/* A merge conflict, observed (git's word, not the verifier's): the row's icon gives way to the notice mark, in ink,
              named for what it is, beside the conflicts' count; never red (docs/12 §12.4.3). A shape of its own, not only a
              darker ink, which hover and the row you are on give every icon (review 19, record only). */}
          <span class="side-icon" classList={{ "side-icon-notice": state.mergeConflicts > 0 }}>
            <Show when={state.mergeConflicts > 0} fallback={<Icon name="operations" size={14} />}>
              <NoticeMark title={t("sidebar.mergeConflict")} />
            </Show>
          </span>
          <span class="grow">{t("app.operations")}</span>
          <Show when={state.mergeConflicts > 0 || state.activeSchedules > 0} fallback={<Kbd k="mod+4" />}>
            <span class="num side-count" classList={{ t1: state.mergeConflicts > 0 }}>{state.mergeConflicts > 0 ? state.mergeConflicts : state.activeSchedules}</span>
          </Show>
        </button>
      </div>

      <div class="side-scroll">
        <For each={groupKeys()}>
          {(key) => {
            const grp = () => groupAt(key);
            return (
              <div class="side-group">
                <Show
                  when={grp().key === "done"}
                  fallback={
                    <div class="side-group-title halt">
                      <span>{groupLabel(grp().key)}</span>
                      <span class="num">{grp().count}</span>
                    </div>
                  }
                >
                  <button class="side-group-title side-group-toggle halt" aria-expanded={doneOpen()} onClick={() => setDoneOpen((o) => !o)}>
                    <span>
                      <Icon name={doneOpen() ? "caret-down" : "caret-right"} size={10} />
                      {groupLabel(grp().key)}
                    </span>
                    <span class="num">{grp().count}</span>
                  </button>
                </Show>
                <Show when={grp().key !== "done" || doneOpen() || grp().goals.some((g) => activeId() === g.id)}>
                  <For each={grp().goals}>{(g) => <GoalRow g={g} inNeedsYou={key === "needs_you"} />}</For>
                </Show>
              </div>
            );
          }}
        </For>
        {/* Archived and abandoned goals: closed out, named apart from the accepted ones above (each row's glyph tells the two states apart). */}
        <Show when={ended().length > 0}>
          <div class="side-group">
            <button
              class="side-group-title side-group-toggle halt"
              aria-expanded={endedOpen()}
              onClick={() => setEndedOpen((o) => !o)}
            >
              <span>
                <Icon name={endedOpen() ? "caret-down" : "caret-right"} size={10} />
                {t("state.archived")}
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
        <button class="side-row" classList={{ active: route().name === "settings" }} aria-current={route().name === "settings" ? "page" : undefined} onClick={() => go({ name: "settings" })}>
          <span class="side-icon">
            <Icon name="sliders" size={14} />
          </span>
          <span class="grow">{t("app.settings")}</span>
          <Kbd k="mod+," />
        </button>
      </div>
    </nav>
  );
}
