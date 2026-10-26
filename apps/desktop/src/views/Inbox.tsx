/**
 * Needs-You (docs/04 §4.8): every item is actionable, most urgent first.
 * Two scale-style groups say the order: what blocks a run, then what is
 * ready to accept. j/k move; 1–9 pick an option on the focused card, and a
 * destructive option asks for the key twice.
 */
import { For, Show, createMemo, createSignal } from "solid-js";

import { DecisionCard, chooseOption } from "../components/DecisionCard";
import { Button, Empty } from "../components/ui";
import { t } from "../lib/i18n";
import { useKeys } from "../lib/keys";
import { isBlocking } from "../lib/labels";
import { go } from "../lib/nav";
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
      ...Array.from({ length: 9 }, (_, i) => ({ key: String(i + 1), run: () => pick(i), desc: i === 0 ? () => t("keys.choose") : undefined, hint: i === 0 ? "1 9" : undefined })),
    ],
    () => t("common.needsYou"),
  );

  const running = () => goalList().filter((g) => g.state === "running").length;

  const Group = (props: { title: string; list: ReturnType<typeof blocking>; offset: number }) => (
    <Show when={props.list.length > 0}>
      <h2 class="scale-title halt">
        {props.title}
        <span class="num">{props.list.length}</span>
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
            action={
              <Button size="s" variant="ghost" onClick={() => go({ name: "overview" })} kbd="mod+1">
                {t("chrome.openOverview")}
              </Button>
            }
          >
            {running() > 0 ? t("inbox.emptyRunning", { n: running() }) : t("inbox.emptyBody")}
          </Empty>
        }
      >
        <Group title={t("inbox.blocking")} list={blocking()} offset={0} />
        <Group title={t("inbox.toReview")} list={review()} offset={blocking().length} />
        <p class="meta t3 halt">{t("inbox.keys")}</p>
      </Show>
    </div>
  );
}
