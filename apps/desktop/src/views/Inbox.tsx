/**
 * Needs-You (docs/04 §4.8): every item is actionable, most urgent first.
 * j/k move, 1–9 pick an option on the focused card.
 */
import { For, Show, createSignal } from "solid-js";

import { DecisionCard } from "../components/DecisionCard";
import { Empty } from "../components/ui";
import { api } from "../lib/api";
import { t } from "../lib/i18n";
import { useKeys } from "../lib/keys";
import { act, state } from "../lib/store";

export function Inbox() {
  const [focus, setFocus] = createSignal(0);
  const items = () => state.inbox;
  const current = () => items()[Math.min(focus(), items().length - 1)];

  const pick = (n: number) => {
    const it = current();
    if (it && it.options[n]) void act(() => api.answer(it.id, it.options[n]));
  };

  useKeys([
    { key: "j", run: () => setFocus((f) => Math.min(f + 1, items().length - 1)) },
    { key: "k", run: () => setFocus((f) => Math.max(f - 1, 0)) },
    ...Array.from({ length: 9 }, (_, i) => ({ key: String(i + 1), run: () => pick(i) })),
  ]);

  return (
    <div class="inbox">
      <Show
        when={items().length > 0}
        fallback={
          <Empty title={t("inbox.emptyTitle")}>{t("inbox.emptyBody")}</Empty>
        }
      >
        <p class="inbox-lede meta">{t("inbox.lede")}</p>
        <For each={items()}>
          {(it, i) => (
            <div onMouseEnter={() => setFocus(i())}>
              <DecisionCard item={it} focused={current()?.id === it.id} quiet />
            </div>
          )}
        </For>
      </Show>
    </div>
  );
}
