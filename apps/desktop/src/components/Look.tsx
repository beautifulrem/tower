/**
 * Visual evidence for a `look` criterion: the page before (the base) and
 * after (the agent's snapshot), photographed by Tower. Two thumbnails on
 * the criterion's row; a click opens them large, side by side, with an
 * onion-skin slider to lay one over the other. A missing side is one quiet
 * line saying why. The verdict stays yours: the checkbox is the criterion.
 */
import { Show, createResource, createSignal } from "solid-js";

import type { LookView } from "../gen/LookView";
import { api } from "../lib/api";
import { t } from "../lib/i18n";
import { Button, Overlay } from "./ui";

function Shot(props: { file: string | null; error: string | null; label: string; onOpen?: () => void }) {
  const [src] = createResource(
    () => props.file,
    (f) => (f ? api.lookImage(f).catch(() => null) : Promise.resolve(null)),
  );
  return (
    <figure class="look-shot">
      <Show when={props.file && !props.error} fallback={<div class="look-missing meta t3">{props.error ?? t("look.notCaptured")}</div>}>
        <Show when={src()} fallback={<div class="look-missing meta t3">{src.loading ? t("common.loading") : t("look.gone")}</div>}>
          <button class="look-img-btn" onClick={props.onOpen} title={t("look.enlarge")} aria-label={`${props.label} · ${t("look.enlarge")}`}>
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
  return (
    <>
      <div class="look-strip">
        <Shot file={props.look.base} error={props.look.base_error} label={t("look.before")} onOpen={() => setOpen(true)} />
        <Shot file={props.look.pin} error={props.look.pin_error} label={t("look.after")} onOpen={() => setOpen(true)} />
      </div>
      <Show when={open()}>
        <LookCompare look={props.look} title={props.title} onClose={() => setOpen(false)} />
      </Show>
    </>
  );
}

/** Large: side by side, or one laid over the other with a slider. */
function LookCompare(props: { look: LookView; title: string; onClose: () => void }) {
  const [mode, setMode] = createSignal<"side" | "onion">("side");
  const [mix, setMix] = createSignal(50);
  const [base] = createResource(() => props.look.base, (f) => (f ? api.lookImage(f).catch(() => null) : Promise.resolve(null)));
  const [pin] = createResource(() => props.look.pin, (f) => (f ? api.lookImage(f).catch(() => null) : Promise.resolve(null)));
  const both = () => !!base() && !!pin();
  return (
    <Overlay onClose={props.onClose} label={props.title} title={props.title} instant initialFocus="panel" class="panel panel-wide look-panel">
      <div class="row look-tools">
        <span class="scope-switch" role="tablist" aria-label={t("look.compare")}>
          <button class="tab" role="tab" aria-selected={mode() === "side"} classList={{ active: mode() === "side" }} onClick={() => setMode("side")}>
            {t("look.sideBySide")}
          </button>
          <button class="tab" role="tab" aria-selected={mode() === "onion"} classList={{ active: mode() === "onion" }} disabled={!both()} onClick={() => setMode("onion")}>
            {t("look.onion")}
          </button>
        </span>
        <Show when={mode() === "onion"}>
          <label class="look-mix meta t3">
            <span>{t("look.before")}</span>
            <input type="range" min="0" max="100" value={mix()} onInput={(e) => setMix(Number(e.currentTarget.value))} aria-label={t("look.onion")} />
            <span>{t("look.after")}</span>
          </label>
        </Show>
        <span class="grow" />
        <span class="meta t3">{t("look.judge")}</span>
      </div>
      <Show
        when={mode() === "side"}
        fallback={
          <div class="look-onion">
            <img src={base()!} alt={t("look.before")} />
            <img src={pin()!} alt={t("look.after")} style={{ opacity: mix() / 100 }} />
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
