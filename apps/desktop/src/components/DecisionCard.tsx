/**
 * DecisionCard (docs/04 §4.8.2): one actionable question, its context and
 * the ways out. Number keys pick options; ⌘↩ sends free text.
 */
import { For, Show, createSignal } from "solid-js";

import type { InboxItem } from "../gen/InboxItem";
import { api } from "../lib/api";
import { ago } from "../lib/format";
import { go } from "../lib/nav";
import { act, state } from "../lib/store";
import { NeedsYouMark } from "./Glyph";
import { Button, Kbd } from "./ui";

const kindLabel: Record<InboxItem["kind"], string> = {
  question: "问题",
  approval: "审批",
  assumption: "假设",
  paused: "已暂停",
  review_ready: "待验收",
  stalled: "可能卡住",
};

export function DecisionCard(props: { item: InboxItem; focused?: boolean; compact?: boolean }) {
  const [text, setText] = createSignal("");
  const [busy, setBusy] = createSignal(false);
  const it = () => props.item;

  const send = async (response: string) => {
    setBusy(true);
    await act(() => api.answer(it().id, response));
    setBusy(false);
  };

  const onKey = (e: KeyboardEvent) => {
    if ((e.metaKey || e.ctrlKey) && e.key === "Enter" && text().trim()) {
      e.preventDefault();
      void send(text().trim());
    }
  };

  return (
    <article class="decision-card" classList={{ focused: !!props.focused, compact: !!props.compact }}>
      <header class="decision-head">
        <NeedsYouMark />
        <span class="decision-kind">{kindLabel[it().kind]}</span>
        <span class="sep">·</span>
        <button class="link num" onClick={() => go({ name: "goal", id: it().goal_id })}>
          {it().goal_id}
        </button>
        <span class="t2 ellipsis">{it().goal_title}</span>
        <span class="grow" />
        <span class="meta num">{ago(it().created_at, state.now)}</span>
      </header>
      <p class="decision-question">{it().title}</p>
      <Show when={it().body}>
        <p class="decision-body" classList={{ mono: it().kind === "approval" }}>
          {it().body}
        </p>
      </Show>

      <Show
        when={it().kind !== "review_ready"}
        fallback={
          <div class="decision-actions">
            <Button variant="primary" onClick={() => go({ name: "review", id: it().goal_id })} kbd="r">
              打开评审
            </Button>
          </div>
        }
      >
        <div class="decision-actions">
          <For each={it().options}>
            {(opt, i) => (
              <Button
                variant={i() === 0 ? "primary" : "default"}
                busy={busy()}
                onClick={() => send(opt)}
                kbd={props.focused && i() < 9 ? String(i() + 1) : undefined}
              >
                {opt}
              </Button>
            )}
          </For>
        </div>
        <Show when={it().allow_text}>
          <div class="decision-text">
            <textarea
              rows={1}
              placeholder={it().kind === "question" ? "写下你的回答…" : "写给 Agent 的话（可选）…"}
              value={text()}
              onInput={(e) => setText(e.currentTarget.value)}
              onKeyDown={onKey}
            />
            <Button size="s" disabled={!text().trim()} busy={busy()} onClick={() => send(text().trim())}>
              发送 <Kbd k="mod+enter" />
            </Button>
          </div>
        </Show>
      </Show>
    </article>
  );
}
