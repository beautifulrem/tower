/**
 * DecisionCard (docs/04 §4.8.2): one actionable question and its ways out.
 * Amber lives only in the 28px header strip — the ECAM title-bar idea — so
 * a page of decisions does not become a page of amber. In lists, only the
 * focused card lights its strip; the others stay quiet with their ◆.
 */
import { For, Show, createSignal } from "solid-js";

import type { InboxItem } from "../gen/InboxItem";
import { api } from "../lib/api";
import { autogrow } from "../lib/autogrow";
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

/** Titles carry the kind in their prefix; the strip already says it. */
function bareTitle(t: string): string {
  return t.replace(/^(已暂停|需要你批准|可能卡住|待验收)[：:]\s*/, "");
}

export function DecisionCard(props: { item: InboxItem; focused?: boolean; quiet?: boolean; showGoal?: boolean }) {
  const [text, setText] = createSignal("");
  const [busy, setBusy] = createSignal(false);
  const it = () => props.item;

  const send = async (response: string) => {
    setBusy(true);
    await act(() => api.answer(it().id, response));
    setBusy(false);
  };

  return (
    <article class="decision" classList={{ focused: !!props.focused, quiet: !!props.quiet && !props.focused }}>
      <header class="decision-head halt">
        <NeedsYouMark />
        <span class="decision-kind">{kindLabel[it().kind]}</span>
        <Show when={props.showGoal !== false}>
          <span class="sep">·</span>
          <button class="link-quiet ellipsis" onClick={() => go({ name: "goal", id: it().goal_id })}>
            <span class="code-val t3">{it().goal_id}</span> {it().goal_title}
          </button>
        </Show>
        <span class="grow" />
        <span class="meta num">{ago(it().created_at, state.now)}</span>
      </header>
      <div class="decision-main">
        <p class="decision-question">
          {it().kind === "review_ready" && it().body ? it().body : bareTitle(it().title)}
        </p>
        <Show when={it().body && it().kind !== "review_ready"}>
          <p class="decision-body" classList={{ "code-val": it().kind === "approval" }}>
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
                ref={(el) => autogrow(el, 1, 6)}
                rows={1}
                placeholder={it().kind === "question" ? "写下你的回答…" : "写给 Agent 的话（可选）…"}
                value={text()}
                onInput={(e) => setText(e.currentTarget.value)}
                onKeyDown={(e) => {
                  if ((e.metaKey || e.ctrlKey) && e.key === "Enter" && text().trim()) {
                    e.preventDefault();
                    void send(text().trim());
                  }
                }}
              />
              <Button size="s" disabled={!text().trim()} busy={busy()} onClick={() => send(text().trim())}>
                发送 <Kbd k="mod+enter" />
              </Button>
            </div>
          </Show>
        </Show>
      </div>
    </article>
  );
}
