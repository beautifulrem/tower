/**
 * Review unit pre-reading bands:
 * 1. `UnitNarrative`: dashed "┆ Agent claims why" card (Claim register, never
 *    green) paired with solid Harness Fact risk badges, rendered only when the
 *    unit carries an agent claim summary.
 * 2. `ReviewNotes`: sentinels, unit risk reasons, and absence of held-out
 *    tests folded into a single line led by the weightiest note.
 */
import { For, Show, createSignal } from "solid-js";

import { DangerMark, Icon, NoticeMark } from "../../components/Glyph";
import { Prose } from "../../components/ui";
import { t } from "../../lib/i18n";

export interface ReviewNote {
  danger: boolean;
  text: string;
  /** A way to act on it, e.g. "Set held-out tests ›". */
  action?: { label: string; run: () => void };
  /** One of the sentinels: open, the band names them once as a group, so no line repeats "Sentinel". */
  sentinel?: boolean;
  /** A high sentinel's own words: the first prose line of its detail is said under its title, as on the goal page. */
  detail?: string;
}

// A detail line that starts with a path and a colon is a machine line (the code it found), not the explanation.
const why = (detail?: string) => detail?.split("\n").find((l) => l.trim() && !/^\s*[\w@~.-]*[/.][\w@./-]*:\s/.test(l));

/** Hanging-gutter Claim row for a review unit's agent-claimed rationale alongside inline risk notes. */
export function UnitNarrative(props: { claim?: string | null; riskReasons?: string[]; highSentinels?: string[] }) {
  const badges = () => [
    ...(props.highSentinels ?? []).map((s) => ({ cls: "risk-badge risk-badge-danger", text: s })),
    ...(props.riskReasons ?? []).map((r) => ({ cls: "risk-badge", text: r })),
  ];
  return (
    <Show when={props.claim}>
      <div class="unit-narrative prov-frame prov-claim">
        <span class="unit-claim-tag halt">
          <span class="claim-rule" aria-hidden="true">┆</span> {t("review.agentWhy")}
          <span class="sr-only"> {t("honesty.srClaim")}</span>
        </span>
        <p class="unit-narrative-text">{props.claim}</p>
        <Show when={badges().length}>
          <div class="unit-risk-badges">
            <For each={badges()}>{(b) => <span class={b.cls}>{b.text}</span>}</For>
          </div>
        </Show>
      </div>
    </Show>
  );
}

export function ReviewNotes(props: { notes: ReviewNote[] }) {
  const [open, setOpen] = createSignal(false);
  // Weightiest first; inside a weight the sentinels stand together, so the group's name is said once, over them.
  const sorted = () => {
    const by = (danger: boolean) => props.notes.filter((n) => n.danger === danger);
    return [true, false].flatMap((d) => [...by(d).filter((n) => n.sentinel), ...by(d).filter((n) => !n.sentinel)]);
  };
  const firstSentinel = () => sorted().findIndex((n) => n.sentinel);
  const Mark = (p: { danger: boolean }) => (
    <Show when={p.danger} fallback={<NoticeMark />}>
      <DangerMark />
    </Show>
  );
  const Note = (p: { n: ReviewNote }) => (
    <>
      <Mark danger={p.n.danger} />
      <span class="review-note-text">
        <Prose text={p.n.text} />
        <Show when={why(p.n.detail)}>{(w) => <span class="review-note-why">{w()}</span>}</Show>
      </span>
      <Show when={p.n.action}>
        {(a) => (
          <button class="link-quiet text-btn review-note-action" onClick={a().run}>
            {a().label}
            <Icon name="chevron-right" size={10} />
          </button>
        )}
      </Show>
    </>
  );
  return (
    <Show when={sorted().length}>
      <div class="review-notes halt" classList={{ open: open(), "has-danger": sorted()[0].danger }}>
        <Show
          when={sorted().length > 1}
          fallback={
            <p class="review-note">
              <Note n={sorted()[0]} />
            </p>
          }
        >
          <button class="review-notes-head link-plain" aria-expanded={open()} onClick={() => setOpen((o) => !o)}>
            <Icon name={open() ? "caret-down" : "caret-right"} size={10} class="t3" />
            <span class="num">{t("review.notesCount", { n: sorted().length })}</span>
            <Show when={!open()}>
              <Mark danger={sorted()[0].danger} />
              <span class="review-note-text ellipsis">
                <Prose text={sorted()[0].text} />
              </span>
            </Show>
          </button>
          <Show when={open()}>
            <For each={sorted()}>
              {(n, i) => (
                <>
                  <Show when={i() === firstSentinel()}>
                    <p class="review-notes-group meta t3">{t("review.sentinels")}</p>
                  </Show>
                  <p class="review-note">
                    <Note n={n} />
                  </p>
                </>
              )}
            </For>
          </Show>
        </Show>
      </div>
    </Show>
  );
}
