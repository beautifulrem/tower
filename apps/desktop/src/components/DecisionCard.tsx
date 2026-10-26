/**
 * DecisionCard (docs/04 §4.8.2): one actionable question and its ways out.
 * Amber lives only in the 28px header strip — the ECAM title-bar idea — so
 * a page of decisions does not become a page of amber. In lists, only the
 * focused card lights its strip; the others stay quiet with their ◆.
 *
 * The strip says the kind (`item.kind`), the question line says only the
 * variable part (`item.subject`); both arrive in the interface language.
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
import { act, state, toast } from "../lib/store";
import { NeedsYouMark, NoticeMark, Seal } from "./Glyph";
import { Claim, CriteriaBar } from "./Honesty";
import { PrLine } from "./Pr";
import { Button, Kbd } from "./ui";

const kindLabel = (k: InboxItem["kind"]): string => t(`inboxKind.${k}`);

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

/**
 * A ready-to-accept card's body is the agent's submit summary — a claim —
 * unless the agent wrote none, in which case the supervisor put its own
 * sentence there. Those sentences are fixed (either language), so a body
 * that is not one of them is the agent's and wears the claim gutter; the
 * supervisor's own sentence repeats what the seal readout says and is not
 * shown twice. (A `body_is_claim` flag from the supervisor would make this
 * a lookup instead of a list.)
 */
const TOWER_REVIEW_BODIES = new Set([
  "全部机器标准在干净环境中通过",
  "Every machine criterion passed in a clean checkout",
  "没有可执行的标准：请你判断结果",
  "No executable criteria: judge the result yourself",
  "全部机器标准通过；哨兵命中已由你确认",
  "Every machine criterion passed; you confirmed the sentinel hits",
]);
const submitClaim = (item: InboxItem): string | null => {
  const b = item.body.trim();
  return b && !TOWER_REVIEW_BODIES.has(b) ? b : null;
};

/** Items whose body is machine text (a command to approve, changed manifests, failing checks). */
const codeBody = (item: InboxItem, pauseReason: string | null | undefined) =>
  item.kind === "approval" || item.kind === "ci_failed" || (item.kind === "paused" && pauseReason === "dependencies_changed");

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
  // Letting the verification setup reach the network is a security decision: the card says so.
  const networkDecision = () => it().kind === "paused" && goal()?.pause_reason === "dependencies_changed";

  const send = async (i: number) => {
    setBusy(true);
    const sent = await chooseOption(it(), i, text());
    setBusy(false);
    if (sent) {
      setLeaving(true);
      toast("success", t("decision.replied"), { ttl: 2000 });
    }
  };
  const reply = async () => {
    if (!text().trim()) return;
    setBusy(true);
    const ok = await act(() => api.answer(it().id, text().trim()));
    setBusy(false);
    if (ok !== undefined) {
      setLeaving(true);
      toast("success", t("decision.replied"), { ttl: 2000 });
    }
  };
  const isAssumption = () => it().kind === "assumption";

  return (
    <article
      ref={props.ref}
      class="decision"
      classList={{ focused: !!props.focused, quiet: !!props.quiet && !props.focused, leaving: leaving() }}
      data-new={fresh ? "true" : undefined}
      tabindex="-1"
      aria-label={`${kindLabel(it().kind)} · ${it().goal_id} · ${it().subject}`}
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
        <Show when={it().kind === "ci_failed" && goal()?.pr}>{(pr) => <PrLine pr={pr()} compact />}</Show>
        <span class="meta num">{ago(it().created_at, state.now)}</span>
      </header>
      <div class="decision-main">
        <Show
          when={it().kind !== "review_ready"}
          fallback={
            <>
              <Show when={goal()} fallback={<p class="decision-question">{it().subject}</p>}>
                {(g) => (
                  <div class="decision-readout decision-readout-main halt">
                    <Seal pin={g().verified_pin} large />
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
              <Show when={submitClaim(it())}>{(text) => <Claim kind={t("goal.submitSummary")}>{text()}</Claim>}</Show>
              <div class="decision-actions">
                <Button variant="primary" onClick={() => go({ name: "review", id: it().goal_id })} kbd={props.focused ? "r" : undefined}>
                  {t("decision.openReview")}
                </Button>
              </div>
            </>
          }
        >
          <p class="decision-question">{it().subject}</p>
          <Show when={it().body}>
            <p class="decision-body" classList={{ "code-val": codeBody(it(), goal()?.pause_reason) }}>
              {it().body}
            </p>
          </Show>
          <Show when={networkDecision()}>
            <p class="decision-caution meta t1">
              <NoticeMark /> {t("decision.networkCaution")}
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
