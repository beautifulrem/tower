/**
 * Visual evidence for a `look` criterion: the page before (the base) and
 * after (the agent's snapshot), photographed by Tower. Two thumbnails on
 * the criterion's row; a click opens them large — side by side, one laid
 * over the other with a slider, or their difference — with the keyboard
 * the comparison tools have had since Kaleidoscope: 1 / 2 / 3 pick the
 * mode, ← → move the slider, holding space shows "before". A missing side
 * is one quiet line saying why. The verdict stays yours: the checkbox is
 * the criterion.
 */
import { Show, createResource, createSignal, onCleanup } from "solid-js";

import type { LookView } from "../gen/LookView";
import { api } from "../lib/api";
import { t } from "../lib/i18n";
import { useKeys } from "../lib/keys";
import { Button, Kbd, Overlay } from "./ui";

function Shot(props: { file: string | null; error: string | null; label: string; onOpen?: (from: HTMLElement) => void }) {
  const [src] = createResource(
    () => props.file,
    (f) => (f ? api.lookImage(f).catch(() => null) : Promise.resolve(null)),
  );
  return (
    <figure class="look-shot">
      <Show when={props.file && !props.error} fallback={<div class="look-missing meta t3">{props.error ?? t("look.notCaptured")}</div>}>
        <Show when={src()} fallback={<div class="look-missing meta t3">{src.loading ? t("common.loading") : t("look.gone")}</div>}>
          <button class="look-img-btn" onClick={(e) => props.onOpen?.(e.currentTarget)} title={t("look.enlarge")} aria-label={`${props.label} · ${t("look.enlarge")}`}>
            <img class="look-img" src={src()!} alt={props.label} />
          </button>
        </Show>
      </Show>
      <figcaption class="meta t3">{props.label}</figcaption>
    </figure>
  );
}

/** The two thumbnails under a criterion row. */
export function LookStrip(props: { look: LookView; title: string }) {
  const [open, setOpen] = createSignal(false);
  // WebKit does not focus a button on click, so the overlay cannot find its way back by itself: the thumbnail that opened it is remembered.
  let opener: HTMLElement | undefined;
  const openFrom = (el: HTMLElement) => {
    opener = el;
    setOpen(true);
  };
  const close = () => {
    setOpen(false);
    opener?.focus({ preventScroll: true });
  };
  return (
    <>
      <div class="look-strip">
        <Shot file={props.look.base} error={props.look.base_error} label={t("look.before")} onOpen={openFrom} />
        <Shot file={props.look.pin} error={props.look.pin_error} label={t("look.after")} onOpen={openFrom} />
      </div>
      <Show when={open()}>
        <LookCompare look={props.look} title={props.title} onClose={close} />
      </Show>
    </>
  );
}

type Mode = "side" | "onion" | "diff";
const MODES: Mode[] = ["side", "onion", "diff"];

/** Large: side by side, one over the other with a slider, or the difference (what moved lights up). */
function LookCompare(props: { look: LookView; title: string; onClose: () => void }) {
  const [mode, setMode] = createSignal<Mode>("side");
  const [mix, setMix] = createSignal(50);
  const [swapped, setSwapped] = createSignal(false);
  // Space held: "before" alone, the quickest way to see what moved.
  const [holding, setHolding] = createSignal(false);
  const [base] = createResource(() => props.look.base, (f) => (f ? api.lookImage(f).catch(() => null) : Promise.resolve(null)));
  const [pin] = createResource(() => props.look.pin, (f) => (f ? api.lookImage(f).catch(() => null) : Promise.resolve(null)));
  const both = () => !!base() && !!pin();
  const pick = (m: Mode) => (m === "side" || both()) && setMode(m);
  const nudge = (d: number) => mode() === "onion" && setMix((v) => Math.max(0, Math.min(100, v + d)));
  const under = () => (swapped() ? pin() : base());
  const over = () => (swapped() ? base() : pin());
  const overOpacity = () => (holding() ? 0 : mode() === "diff" ? 1 : mix() / 100);

  useKeys(
    [
      { key: "1", run: () => pick("side"), desc: () => t("keys.lookModes"), hint: "1 2 3" },
      { key: "2", run: () => pick("onion") },
      { key: "3", run: () => pick("diff") },
      { key: "arrowleft", run: () => nudge(-5), desc: () => t("keys.lookMix"), hint: "← →", when: () => mode() === "onion" },
      { key: "arrowright", run: () => nudge(5) },
      { key: "space", run: () => setHolding(true), desc: () => t("keys.lookHold"), when: () => mode() !== "side" },
    ],
    () => t("look.compare"),
  );
  const up = (e: KeyboardEvent) => e.key === " " && setHolding(false);
  window.addEventListener("keyup", up);
  onCleanup(() => window.removeEventListener("keyup", up));

  const label = (m: Mode) => (m === "side" ? t("look.sideBySide") : m === "onion" ? t("look.onion") : t("look.diff"));
  return (
    <Overlay onClose={props.onClose} label={props.title} title={props.title} instant initialFocus="panel" class="panel panel-wide look-panel">
      <div class="row look-tools">
        <span class="scope-switch" role="tablist" aria-label={t("look.compare")}>
          {MODES.map((m, i) => (
            <button class="tab" role="tab" aria-selected={mode() === m} classList={{ active: mode() === m }} disabled={m !== "side" && !both()} onClick={() => pick(m)} title={`${label(m)} ${i + 1}`}>
              {label(m)}
            </button>
          ))}
        </span>
        <Show when={mode() === "onion"}>
          <label class="look-mix meta t3">
            <span>{swapped() ? t("look.after") : t("look.before")}</span>
            <input type="range" min="0" max="100" step="5" value={mix()} onInput={(e) => setMix(Number(e.currentTarget.value))} aria-label={t("look.onion")} />
            <span>{swapped() ? t("look.before") : t("look.after")}</span>
          </label>
        </Show>
        <Show when={mode() !== "side"}>
          <Button size="s" variant="ghost" onClick={() => setSwapped((s) => !s)} aria-pressed={swapped()}>
            {t("look.swap")}
          </Button>
        </Show>
        <span class="grow" />
        {/* The keys, where the hands are: the same voice as the review's status bar. */}
        <span class="key-hints halt look-keys" aria-hidden="true">
          <span>
            <Kbd k="1 2 3" /> {t("look.keyModes")}
          </span>
          <Show when={mode() === "onion"}>
            <span>
              <Kbd k="arrowleft arrowright" /> {t("look.keyMix")}
            </span>
          </Show>
          <Show when={mode() !== "side"}>
            <span>
              <Kbd k="space" /> {t("look.keyHold")}
            </span>
          </Show>
        </span>
        <span class="meta t3">{t("look.judge")}</span>
      </div>
      <Show
        when={mode() === "side"}
        fallback={
          <div class="look-stage">
            <div class="look-onion" classList={{ "look-diff": mode() === "diff" }}>
              <img src={under()!} alt={swapped() ? t("look.after") : t("look.before")} />
              <img src={over()!} alt={swapped() ? t("look.before") : t("look.after")} style={{ opacity: overOpacity() }} />
            </div>
          </div>
        }
      >
        <div class="look-side">
          <Shot file={props.look.base} error={props.look.base_error} label={t("look.before")} />
          <Shot file={props.look.pin} error={props.look.pin_error} label={t("look.after")} />
        </div>
      </Show>
      <div class="panel-actions">
        <Button variant="ghost" onClick={props.onClose}>
          {t("common.close")}
        </Button>
      </div>
    </Overlay>
  );
}
