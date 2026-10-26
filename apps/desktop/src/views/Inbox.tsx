/**
 * Needs-You (docs/04 §4.8): every item is actionable, most urgent first.
 * Two scale-style groups say the order: what blocks a run, then what is
 * ready to accept. j/k move; 1–9 pick an option on the focused card, and a
 * destructive option asks for the key twice.
 */
import { For, Show, createMemo, createSignal } from "solid-js";

import { DecisionCard, chooseOption } from "../components/DecisionCard";
import { Empty } from "../components/ui";
import { t } from "../lib/i18n";
import { useKeys } from "../lib/keys";
import { isBlocking } from "../lib/labels";
import { go } from "../lib/nav";
import { state } from "../lib/store";

export function Inbox() {
  const [focus, setFocus] = createSignal(0);
  const blocking = createMemo(() => state.inbox.filter(isBlocking));
  const review = createMemo(() => state.inbox.filter((i) => !isBlocking(i)));
  const items = createMemo(() => [...blocking(), ...review()]);
  const current = () => items()[Math.min(focus(), items().length - 1)];

  const pick = (n: number) => {
    const it = current();
    if (it && it.options[n]) void chooseOption(it, it.options[n]);
  };

  useKeys([
    { key: "j", run: () => setFocus((f) => Math.min(f + 1, items().length - 1)) },
    { key: "k", run: () => setFocus((f) => Math.max(f - 1, 0)) },
    {
      key: "r",
      run: () => {
        const it = current();
        if (it?.kind === "review_ready") go({ name: "review", id: it.goal_id });
      },
    },
    ...Array.from({ length: 9 }, (_, i) => ({ key: String(i + 1), run: () => pick(i) })),
  ]);

  const Group = (props: { title: string; list: ReturnType<typeof blocking>; offset: number }) => (
    <Show when={props.list.length > 0}>
      <h2 class="scale-title halt">
        {props.title}
        <span class="num">{props.list.length}</span>
      </h2>
      <For each={props.list}>
        {(it, i) => (
          <div onMouseEnter={() => setFocus(props.offset + i())}>
            <DecisionCard item={it} focused={current()?.id === it.id} quiet />
          </div>
        )}
      </For>
    </Show>
  );

  return (
    <div class="inbox">
      <Show when={items().length > 0} fallback={<Empty title={t("inbox.emptyTitle")}>{t("inbox.emptyBody")}</Empty>}>
        <Group title={t("inbox.blocking")} list={blocking()} offset={0} />
        <Group title={t("inbox.toReview")} list={review()} offset={blocking().length} />
        <p class="meta t3 halt">{t("inbox.keys")}</p>
      </Show>
    </div>
  );
}
