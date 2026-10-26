/**
 * Needs-You (docs/04 §4.8): every item is actionable, most urgent first.
 * Two scale-style groups say the order: what blocks a run, then what is
 * ready to accept. j/k move; 1–9 pick an option on the focused card, h puts
 * it aside, and a destructive option asks for the key twice. A card put
 * aside is not gone: the footer says how many and when they come back, and
 * opens to bring one back now.
 */
import { For, type JSX, Show, createMemo, createSignal } from "solid-js";

import { DecisionCard, chooseOption, snoozeMenu, unsnooze } from "../components/DecisionCard";
import { Icon } from "../components/Glyph";
import { Button, Empty, Kbd } from "../components/ui";
import type { InboxItem } from "../gen/InboxItem";
import { clock } from "../lib/format";
import { t } from "../lib/i18n";
import { useKeys } from "../lib/keys";
import { isBlocking } from "../lib/labels";
import { go } from "../lib/nav";
import { startQueue } from "../lib/reviewQueue";
import { goalList, state } from "../lib/store";

export function Inbox() {
  const [focus, setFocus] = createSignal(0);
  const blocking = createMemo(() => state.inbox.filter(isBlocking));
  const review = createMemo(() => state.inbox.filter((i) => !isBlocking(i)));
  const items = createMemo(() => [...blocking(), ...review()]);
  const current = () => items()[Math.min(focus(), items().length - 1)];

  const pick = (n: number) => {
    const it = current();
    if (it) void chooseOption(it, n);
  };
  const moveTo = (i: number) => {
    setFocus(i);
    const it = items()[i];
    if (it) document.querySelector<HTMLElement>(`[data-decision="${it.id}"] .decision`)?.focus({ preventScroll: true });
  };

  useKeys(
    [
      { key: "j", run: () => moveTo(Math.min(focus() + 1, items().length - 1)), desc: () => t("keys.move"), hint: "j k" },
      { key: "k", run: () => moveTo(Math.max(focus() - 1, 0)) },
      { key: "arrowdown", run: () => moveTo(Math.min(focus() + 1, items().length - 1)) },
      { key: "arrowup", run: () => moveTo(Math.max(focus() - 1, 0)) },
      { key: "enter", run: () => current() && go({ name: "goal", id: current()!.goal_id }), desc: () => t("keys.open") },
      {
        key: "r",
        run: () => {
          const it = current();
          if (it?.kind === "review_ready") go({ name: "review", id: it.goal_id });
        },
        desc: () => t("keys.reviewSelected"),
      },
      // Linear's H: the selected decision steps aside until later.
      { key: "h", run: () => current() && void snoozeMenu(current()!), desc: () => t("keys.snooze") },
      ...Array.from({ length: 9 }, (_, i) => ({ key: String(i + 1), run: () => pick(i), desc: i === 0 ? () => t("keys.choose") : undefined, hint: i === 0 ? "1–9" : undefined })),
    ],
    () => t("common.needsYou"),
  );

  const running = () => goalList().filter((g) => g.state === "running").length;

  /** Steps through every ready-to-accept goal: accepting or sending one back opens the next. */
  const reviewAll = () => {
    const first = startQueue(review().map((i) => i.goal_id));
    if (first) go({ name: "review", id: first });
  };
  useKeys([{ key: "shift+r", run: reviewAll, desc: () => t("inbox.reviewAll") }], () => t("common.needsYou"));

  const Group = (props: { title: string; list: ReturnType<typeof blocking>; offset: number; aside?: JSX.Element }) => (
    <Show when={props.list.length > 0}>
      <h2 class="scale-title halt">
        {props.title}
        <span class="num">{props.list.length}</span>
        {props.aside}
      </h2>
      <For each={props.list}>
        {(it, i) => (
          <div data-decision={it.id} onMouseEnter={() => setFocus(props.offset + i())} onFocusIn={() => setFocus(props.offset + i())}>
            <DecisionCard item={it} focused={current()?.id === it.id} quiet />
          </div>
        )}
      </For>
    </Show>
  );

  return (
    <div class="inbox">
      <Show
        when={items().length > 0}
        fallback={
          <Empty
            title={t("inbox.emptyTitle")}
            poster
            action={
              <Button size="s" onClick={() => go({ name: "overview" })} kbd="mod+1">
                {t("chrome.openOverview")}
              </Button>
            }
          >
            {running() > 0 ? t("inbox.emptyRunning", { n: running() }) : t("inbox.emptyBody")}
          </Empty>
        }
      >
        <Group title={t("inbox.blocking")} list={blocking()} offset={0} />
        <Group
          title={t("inbox.toReview")}
          list={review()}
          offset={blocking().length}
          aside={
            <Show when={review().length > 1}>
              <Button size="s" variant="ghost" onClick={reviewAll} kbd="shift+r">
                {t("inbox.reviewAll")}
              </Button>
            </Show>
          }
        />
        <p class="key-hints halt" aria-hidden="true">
          <span>
            <Kbd k="j k" /> {t("inbox.keyMove")}
          </span>
          <span>
            <Kbd k="1–9" /> {t("inbox.keyChoose")}
          </span>
          <span>
            <Kbd k="h" /> {t("inbox.keySnooze")}
          </span>
          <span>{t("inbox.keyTwice")}</span>
        </p>
      </Show>
      <SnoozedFooter />
    </div>
  );
}

/** Where the put-aside cards went (the supervisor's list): a count with the next return time; open, each one with its way back. */
function SnoozedFooter() {
  const [open, setOpen] = createSignal(false);
  const until = (i: InboxItem) => i.snoozed_until ?? 0;
  const list = () => [...state.snoozed].sort((a, b) => until(a) - until(b));
  return (
    <Show when={list().length > 0}>
      <div class="snoozed" classList={{ open: open() }}>
        <button class="snoozed-head link-plain meta t3 halt" aria-expanded={open()} onClick={() => setOpen((o) => !o)} title={t("inbox.snoozedTitle")}>
          <Icon name={open() ? "caret-down" : "caret-right"} size={10} />
          <Icon name="bell" size={10} />
          <span class="num">{t("inbox.snoozedCount", { n: list().length, time: clock(until(list()[0])) })}</span>
        </button>
        <Show when={open()}>
          <ul class="snoozed-list">
            <For each={list()}>
              {(s) => (
                <li class="snoozed-item meta">
                  <button class="link-quiet ellipsis" onClick={() => go({ name: "goal", id: s.goal_id })} title={s.subject || s.title}>
                    <span class="code-val t3">{s.goal_id}</span> {s.subject || s.title}
                  </button>
                  <span class="t3 num">{t("inbox.snoozedUntil", { time: clock(until(s)) })}</span>
                  <Button size="s" variant="ghost" onClick={() => void unsnooze(s.id)}>
                    {t("decision.unsnooze")}
                  </Button>
                </li>
              )}
            </For>
          </ul>
        </Show>
      </div>
    </Show>
  );
}
