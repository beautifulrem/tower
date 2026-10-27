/**
 * What to know before reading the diff — the sentinels, the unit's risk
 * reasons, the absence of held-out tests — as one band over it instead of
 * three stacked lines: folded, it is a single line led by the weightiest
 * note, in its own mark and words, so a red one is never folded out of
 * sight; open, every note on a line of its own, weightiest first.
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
}

export function ReviewNotes(props: { notes: ReviewNote[] }) {
  const [open, setOpen] = createSignal(false);
  const sorted = () => [...props.notes.filter((n) => n.danger), ...props.notes.filter((n) => !n.danger)];
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
              <span class="sep">·</span>
              <Mark danger={sorted()[0].danger} />
              <span class="review-note-text ellipsis">
                <Prose text={sorted()[0].text} />
              </span>
            </Show>
          </button>
          <Show when={open()}>
            <For each={sorted()}>
              {(n) => (
                <p class="review-note">
                  <Note n={n} />
                </p>
              )}
            </For>
          </Show>
        </Show>
      </div>
    </Show>
  );
}
