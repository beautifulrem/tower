/**
 * DecisionCard (docs/04 §4.8.2): one actionable question and its ways out.
 * Amber lives only in the 28px header strip — the ECAM title-bar idea — so
 * a page of decisions does not become a page of amber. In lists, only the
 * focused card lights its strip; the others stay quiet with their ◆.
 *
 * A newly arrived card decays from a brighter amber once (700ms): the only
 * motion Tower makes on its own. Destructive options never fire from one
 * press: the first arms the button for two seconds, the second confirms.
 */
import { For, Show, createSignal, onCleanup } from "solid-js";

import type { InboxItem } from "../gen/InboxItem";
import { api } from "../lib/api";
import { autogrow } from "../lib/autogrow";
import { ago, count } from "../lib/format";
import { t } from "../lib/i18n";
import { approves, optionTone } from "../lib/labels";
import { go } from "../lib/nav";
import { act, state } from "../lib/store";
import { NeedsYouMark, Seal } from "./Glyph";
import { CriteriaBar } from "./Honesty";
import { Button, Kbd } from "./ui";

const kindLabel = (k: InboxItem["kind"]): string => t(`inboxKind.${k}`);

/**
 * Titles carry the kind in their prefix; the strip already says it. Items
 * keep the language they were created in, so both languages are stripped.
 */
function bareTitle(title: string): string {
  return title.replace(/^(已暂停|需要你批准|可能卡住|待验收|Paused|Approval needed|May be stuck|Ready to accept)\s*[：:]\s*/, "");
}

/** The one armed destructive option, shared so the keyboard and the mouse agree. */
const [armed, setArmed] = createSignal<{ item: string; option: number; until: number } | null>(null);
let armTimer: number | undefined;
export const ARM_MS = 2000;

/**
 * Chooses option `index` on an item. Destructive options arm on the first
 * call and send on the second within two seconds. Returns true when sent.
 */
export async function chooseOption(item: InboxItem, index: number, text = ""): Promise<boolean> {
  const option = item.options[index];
  if (option === undefined) return false;
  if (optionTone(item, index) === "destructive") {
    const a = armed();
    if (!a || a.item !== item.id || a.option !== index || a.until < Date.now()) {
      setArmed({ item: item.id, option: index, until: Date.now() + ARM_MS });
      clearTimeout(armTimer);
      armTimer = window.setTimeout(() => setArmed(null), ARM_MS);
      return false;
    }
    setArmed(null);
    clearTimeout(armTimer);
  }
  // Assumptions carry the note with either verdict.
  if (item.kind === "assumption") return (await act(() => api.answerAssumption(item.id, approves(item, index), text.trim()))) !== undefined;
  return (await act(() => api.answer(item.id, option))) !== undefined;
}

export function DecisionCard(props: { item: InboxItem; focused?: boolean; quiet?: boolean; showGoal?: boolean; ref?: (el: HTMLElement) => void }) {
  const [text, setText] = createSignal("");
  const [busy, setBusy] = createSignal(false);
  const [leaving, setLeaving] = createSignal(false);
  const it = () => props.item;
  const goal = () => state.goals[it().goal_id];
  // Arrived just now: play the amber decay once.
  const fresh = Date.now() - props.item.created_at < 5000;
  const [tick, setTick] = createSignal(Date.now());
  const ticker = window.setInterval(() => armed() && setTick(Date.now()), 100);
  onCleanup(() => clearInterval(ticker));
  const armedFor = (i: number) => {
    const a = armed();
    return a && a.item === it().id && a.option === i && a.until > tick() ? Math.ceil((a.until - tick()) / 1000) : null;
  };

  const send = async (i: number) => {
    setBusy(true);
    const sent = await chooseOption(it(), i, text());
    setBusy(false);
    if (sent) setLeaving(true);
  };
  const reply = async () => {
    if (!text().trim()) return;
    setBusy(true);
    const ok = await act(() => api.answer(it().id, text().trim()));
    setBusy(false);
    if (ok !== undefined) setLeaving(true);
  };
  const isAssumption = () => it().kind === "assumption";

  return (
    <article
      ref={props.ref}
      class="decision"
      classList={{ focused: !!props.focused, quiet: !!props.quiet && !props.focused, leaving: leaving() }}
      data-new={fresh ? "true" : undefined}
      tabindex="-1"
      aria-label={`${kindLabel(it().kind)} · ${it().goal_id} · ${bareTitle(it().title)}`}
    >
      <header class="decision-head halt">
        <NeedsYouMark />
        <span class="decision-kind">{kindLabel(it().kind)}</span>
        <Show when={props.showGoal !== false}>
          <span class="sep">·</span>
          <button class="link-quiet ellipsis" onClick={() => go({ name: "goal", id: it().goal_id })}>
            <span class="code-val t2">{it().goal_id}</span> {it().goal_title}
          </button>
        </Show>
        <span class="grow" />
        <span class="meta num">{ago(it().created_at, state.now)}</span>
      </header>
      <div class="decision-main">
        <Show
          when={it().kind !== "review_ready"}
          fallback={
            <>
              <Show when={goal()} fallback={<p class="decision-question">{it().goal_title}</p>}>
                {(g) => (
                  <div class="decision-readout decision-readout-main halt">
                    <Seal pin={g().verified_pin} />
                    <Show when={g().diffstat}>
                      <span class="sep">·</span>
                      <span class="num">
                        <span class="t1">+{count(g().diffstat!.additions)}</span>
                        <span class="diff-del"> −{count(g().diffstat!.deletions)}</span>
                      </span>
                      <span class="sep">·</span>
                      <span class="num">{t("common.files", { n: g().diffstat!.files })}</span>
                    </Show>
                    <span class="sep">·</span>
                    <CriteriaBar progress={g().progress} compact />
                  </div>
                )}
              </Show>
              <div class="decision-actions">
                <Button variant="primary" onClick={() => go({ name: "review", id: it().goal_id })} kbd={props.focused ? "r" : undefined}>
                  {t("decision.openReview")}
                </Button>
              </div>
            </>
          }
        >
          <p class="decision-question">{bareTitle(it().title)}</p>
          <Show when={it().body}>
            <p class="decision-body" classList={{ "code-val": it().kind === "approval" }}>
              {it().body}
            </p>
          </Show>
          <div class="decision-actions">
            <For each={it().options}>
              {(opt, i) => {
                const tone = () => optionTone(it(), i());
                const left = () => armedFor(i());
                return (
                  <Button
                    variant={tone() === "primary" ? "primary" : tone() === "destructive" ? "danger" : "default"}
                    class={left() ? "armed" : ""}
                    busy={busy()}
                    onClick={() => void send(i())}
                    kbd={props.focused && i() < 9 ? String(i() + 1) : undefined}
                    title={tone() === "destructive" ? t("decision.pressTwice") : undefined}
                    aria-live={left() ? "polite" : undefined}
                  >
                    {left() ? t("decision.pressAgain", { s: left()! }) : opt}
                  </Button>
                );
              }}
            </For>
          </div>
          <Show when={it().allow_text}>
            <div class="decision-text">
              <textarea
                ref={(el) => autogrow(el, 1, 6)}
                rows={1}
                aria-label={isAssumption() ? t("decision.assumptionNotePlaceholder") : it().kind === "question" ? t("decision.answerPlaceholder") : t("decision.notePlaceholder")}
                placeholder={
                  isAssumption()
                    ? t("decision.assumptionNotePlaceholder")
                    : it().kind === "question"
                      ? t("decision.answerPlaceholder")
                      : t("decision.notePlaceholder")
                }
                value={text()}
                onInput={(e) => setText(e.currentTarget.value)}
                onKeyDown={(e) => {
                  if ((e.metaKey || e.ctrlKey) && e.key === "Enter" && text().trim() && !isAssumption()) {
                    e.preventDefault();
                    void reply();
                  }
                }}
              />
              <Show when={!isAssumption()}>
                <Button size="s" disabled={!text().trim()} busy={busy()} onClick={reply}>
                  {t("decision.reply")} <Kbd k="mod+enter" />
                </Button>
              </Show>
            </div>
            <Show when={isAssumption()}>
              <p class="decision-note">{t("decision.assumptionNote")}</p>
            </Show>
          </Show>
        </Show>
      </div>
    </article>
  );
}
