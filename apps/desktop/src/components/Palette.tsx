/**
 * The command palette (⌘K): verbs first — review each ready goal, answer
 * each waiting card, put the page's card aside — then navigation and every
 * goal by id or title (pinyin initials included). Loaded on first open, so
 * start-up carries neither the matcher nor the pinyin table; the key that
 * opens it lives in App.
 */
import { For, Show, createMemo, createSignal } from "solid-js";

import { api } from "../lib/api";
import { type Match, fuzzy, matchText, segments } from "../lib/fuzzy";
import { t } from "../lib/i18n";
import { isBlocking, stateLabel } from "../lib/labels";
import { closePalette, openActivity, openShortcuts, paletteOpen } from "../lib/layers";
import { go, route } from "../lib/nav";
import { bumpRecent, recentIds } from "../lib/recent";
import { startQueue } from "../lib/reviewQueue";
import { act, goalList, patchSettings, quietNow, state } from "../lib/store";
import { snoozeMenu } from "./DecisionCard";
import { Icon, type IconName, LifecycleGlyph, NeedsYouMark } from "./Glyph";
import { Button, Kbd, Overlay } from "./ui";

const HOUR = 3_600_000;


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
      // A ready-to-accept goal already has its review verb below, from anywhere.
      if (g && ["running", "accepted", "verifying"].includes(g.state))
        base.unshift({ id: "review", title: t("chrome.review", { id: g.id }), hint: "r", run: () => go({ name: "review", id: g.id }) });
      // The page's own cards can be put aside from here, as with H on the page.
      for (const it of state.inbox)
        if (it.goal_id === r.id && isBlocking(it))
          base.unshift({ id: `snooze-${it.id}`, title: t("decision.putAside", { id: it.goal_id, kind: t(`inboxKind.${it.kind}`) }), hint: "h", icon: "bell", run: () => void snoozeMenu(it) });
    }
    // Verbs first, from any page: review each ready goal, answer each waiting card, review them all in turn.
    const verbs: Command[] = [];
    const ready = goalList().filter((g) => g.state === "in_review");
    for (const g of ready)
      verbs.push({ id: `review-${g.id}`, title: t("chrome.reviewGoal", { id: g.id, title: g.title }), icon: "ring-check", run: () => go({ name: "review", id: g.id }) });
    if (ready.length > 1)
      verbs.push({
        id: "review-all",
        title: t("inbox.reviewAll"),
        hint: "shift+r",
        icon: "ring-check",
        run: () => {
          const first = startQueue(ready.map((g) => g.id));
          if (first) go({ name: "review", id: first });
        },
      });
    for (const it of state.inbox)
      if (isBlocking(it))
        verbs.push({ id: `answer-${it.id}`, title: t("chrome.answerCard", { id: it.goal_id, kind: t(`inboxKind.${it.kind}`) }), icon: "inbox", run: () => go({ name: "goal", id: it.goal_id }) });
    base.unshift(...verbs);
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
    closePalette();
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
                {/* No result is still a way out: the one thing you can always start. */}
                <span class="palette-empty-action">
                  <Button size="s" variant="ghost" kbd="n" onClick={() => (close(), go({ name: "new" }))}>
                    {t("app.newGoal")}
                  </Button>
                </span>
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
