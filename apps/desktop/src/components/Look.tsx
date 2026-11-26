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
import { For, Show, createResource, createSignal, onCleanup } from "solid-js";

import type { LookView } from "../gen/LookView";
import { api } from "../lib/api";
import type { LookViewExt } from "../lib/apiTypes";
import { t } from "../lib/i18n";
import { DangerMark, Icon } from "./Glyph";
import { ProvenanceFrame } from "./ProvenanceFrame";
import { Button, Kbd, Overlay } from "./ui";

/**
 * Why a side is missing, in the frame its capture would have had: a path or a code breaks only after / . _ : :: :// ? & =,
 * never inside a word (review 19: "CONNECTIO|N_REFUSED") nor between the marks of `::` and `://` (review 20: "net:|:ERR"),
 * in as many lines as the frame holds, and the whole reason is its tooltip. Large, side by side (`wide`), a line holds
 * any code, so a code keeps whole: only an address breaks, after `://` or a `/` (review 21: a nowrap span around `_<wbr>`
 * still broke "ERR_|CONNECTION" in WebKit).
 */
const Why = (p: { text: string; wide?: boolean }) => (
  <div class="look-missing meta t3" title={p.text}>
    <span>{p.text.split(p.wide ? /(:\/\/|\/)/ : /(:\/\/|::|[/._:?&=])/).map((s, i) => (i % 2 ? [s, <wbr />] : s))}</span>
  </div>
);

/**
 * A side's capture is one browser session for both viewports: when it fails, its reason is the phone's as much as the
 * desktop's (review 22, record only: the phone's frame said "Not captured" and nothing more).
 */
function Shot(props: { file: string | null; error: string | null; label: string; onOpen?: (from: HTMLElement) => void; wide?: boolean }) {
  const [src] = createResource(
    () => props.file,
    (f) => (f ? api.lookImage(f).catch(() => null) : Promise.resolve(null)),
  );
  // An image the webview cannot decode is gone too: said in words in the frame, never a 2px sliver of border.
  const [broken, setBroken] = createSignal<string | null>(null);
  return (
    <figure class="look-shot">
      <Show when={props.file && !props.error} fallback={<Why text={props.error ?? t("look.notCaptured")} wide={props.wide} />}>
        <Show when={src() && broken() !== src()} fallback={<Why text={src.loading ? t("common.loading") : t("look.gone")} wide={props.wide} />}>
          <button class="look-img-btn" onClick={(e) => props.onOpen?.(e.currentTarget)} title={t("look.enlarge")} aria-label={`${props.label}, ${t("look.enlarge")}`}>
            {/* Until it has decoded, it holds the frame of Tower's capture, desktop or phone (`.look-img`), never a 2px line (review 16). */}
            <img class="look-img" src={src()!} alt={props.label} onError={() => setBroken(src() ?? null)} />
          </button>
        </Show>
      </Show>
      <figcaption class="meta t3">{props.label}</figcaption>
    </figure>
  );
}

type ViewportTab = "desktop" | "mobile";

function ViewportTabs(props: { value: ViewportTab; onChange: (v: ViewportTab) => void }) {
  return (
    <span class="scope-switch" role="tablist" aria-label={t("look.viewport")}>
      {(["desktop", "mobile"] as ViewportTab[]).map((v) => (
        <button type="button" class="tab" role="tab" aria-selected={props.value === v} classList={{ active: props.value === v }} onClick={() => props.onChange(v)}>
          {t(`look.${v}`)}
        </button>
      ))}
    </span>
  );
}

/** Captured browser Console errors / uncaught pageerror facts beneath screenshots. */
function ConsoleErrorsBlock(props: { errors?: string[]; inline?: boolean }) {
  const errs = () => props.errors ?? [];
  return (
    <Show
      when={errs().length > 0}
      fallback={
        <Show when={props.errors !== undefined && props.inline}>
          <span class="look-console-clean">
            <Icon name="harness" size={10} />
            {t("look.consoleClean")}
          </span>
        </Show>
      }
    >
      <ProvenanceFrame kind="fact" label={t("look.consoleErrors", { n: errs().length })} danger class={props.inline ? "look-console" : undefined}>
        <ul class="look-console-list">
          <For each={errs()}>
            {(line) => <li class="look-console-item mono"><DangerMark /><span>{line}</span></li>}
          </For>
        </ul>
      </ProvenanceFrame>
    </Show>
  );
}

/** The two thumbnails under a criterion row, with optional viewport tabs and console error facts. */
export function LookStrip(props: { look: LookView; title: string }) {
  const ext = () => props.look as LookViewExt;
  const hasMobile = () => !!(ext().mobile_base || ext().mobile_pin);
  const [vp, setVp] = createSignal<ViewportTab>("desktop");
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
  const activeBase = () => (vp() === "mobile" && hasMobile() ? ext().mobile_base ?? null : props.look.base);
  const activePin = () => (vp() === "mobile" && hasMobile() ? ext().mobile_pin ?? null : props.look.pin);
  return (
    <div class="look-wrap">
      <Show when={hasMobile()}>
        <div class="look-viewports"><ViewportTabs value={vp()} onChange={setVp} /></div>
      </Show>
      <div class="look-strip" classList={{ "look-phone": vp() === "mobile" }}>
        <Shot file={activeBase()} error={props.look.base_error} label={t("look.before")} onOpen={openFrom} />
        <Shot file={activePin()} error={props.look.pin_error} label={t("look.after")} onOpen={openFrom} />
      </div>
      <ConsoleErrorsBlock errors={ext().console_errors} inline />
      <Show when={open()}>
        <LookCompare look={ext()} title={props.title} initialViewport={vp()} onClose={close} />
      </Show>
    </div>
  );
}

type Mode = "side" | "onion" | "diff";
const MODES: Mode[] = ["side", "onion", "diff"];

/** Large: side by side, one over the other with a slider, or the difference (what moved lights up). */
function LookCompare(props: { look: LookViewExt; title: string; initialViewport?: ViewportTab; onClose: () => void }) {
  const [mode, setMode] = createSignal<Mode>("side");
  const [vp, setVp] = createSignal<ViewportTab>(props.initialViewport ?? "desktop");
  const [mix, setMix] = createSignal(50);
  const [swapped, setSwapped] = createSignal(false);
  // Space held: "before" alone, the quickest way to see what moved.
  const [holding, setHolding] = createSignal(false);
  const hasMobile = () => !!(props.look.mobile_base || props.look.mobile_pin);
  const baseFile = () => (vp() === "mobile" && hasMobile() ? props.look.mobile_base ?? null : props.look.base);
  const pinFile = () => (vp() === "mobile" && hasMobile() ? props.look.mobile_pin ?? null : props.look.pin);
  const [base] = createResource(baseFile, (f) => (f ? api.lookImage(f).catch(() => null) : Promise.resolve(null)));
  const [pin] = createResource(pinFile, (f) => (f ? api.lookImage(f).catch(() => null) : Promise.resolve(null)));
  const both = () => !!base() && !!pin();
  const pick = (m: Mode) => (m === "side" || both()) && setMode(m);
  const nudge = (d: number) => mode() === "onion" && setMix((v) => Math.max(0, Math.min(100, v + d)));
  const under = () => (swapped() ? pin() : base());
  const over = () => (swapped() ? base() : pin());
  const overOpacity = () => (holding() ? 0 : mode() === "diff" ? 1 : mix() / 100);

  const keys = {
    name: () => t("look.compare"),
    bindings: [
      { key: "1", run: () => pick("side"), desc: () => t("keys.lookModes"), hint: "1 2 3" },
      { key: "2", run: () => pick("onion") },
      { key: "3", run: () => pick("diff") },
      { key: "arrowleft", run: () => nudge(-5), desc: () => t("keys.lookMix"), hint: "← →", when: () => mode() === "onion" },
      { key: "arrowright", run: () => nudge(5) },
      { key: "space", run: () => setHolding(true), desc: () => t("keys.lookHold"), when: () => mode() !== "side" },
    ],
  };
  const up = (e: KeyboardEvent) => e.key === " " && setHolding(false);
  window.addEventListener("keyup", up);
  onCleanup(() => window.removeEventListener("keyup", up));

  const label = (m: Mode) => (m === "side" ? t("look.sideBySide") : m === "onion" ? t("look.onion") : t("look.diff"));
  return (
    <Overlay onClose={props.onClose} label={props.title} title={props.title} instant initialFocus="panel" class="panel panel-wide look-panel" keys={keys}>
      <div class="row look-tools">
        <span class="scope-switch" role="tablist" aria-label={t("look.compare")}>
          {MODES.map((m, i) => (
            <button class="tab" role="tab" aria-selected={mode() === m} classList={{ active: mode() === m }} disabled={m !== "side" && !both()} onClick={() => pick(m)} title={`${label(m)} ${i + 1}`}>
              {label(m)}
            </button>
          ))}
        </span>
        <Show when={hasMobile()}><ViewportTabs value={vp()} onChange={setVp} /></Show>
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
        <div class="look-side" classList={{ "look-phone": vp() === "mobile" }}>
          <Shot file={baseFile()} error={props.look.base_error} label={t("look.before")} wide />
          <Shot file={pinFile()} error={props.look.pin_error} label={t("look.after")} wide />
        </div>
      </Show>
      <ConsoleErrorsBlock errors={props.look.console_errors} />
      <div class="panel-actions">
        <Button variant="ghost" onClick={props.onClose}>
          {t("common.close")}
        </Button>
      </div>
    </Overlay>
  );
}
