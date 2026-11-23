/** Small building blocks shared by every view. */
import { type JSX, type Resource, Show, createUniqueId, onCleanup, onMount, splitProps } from "solid-js";

import { errorText } from "../lib/api";
import { t } from "../lib/i18n";
import { type Binding, KeyLayer, keyHint, useKeys } from "../lib/keys";
import { DangerMark, Icon, type IconName } from "./Glyph";

type ButtonProps = JSX.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "default" | "ghost" | "danger";
  size?: "s" | "m";
  kbd?: string;
  busy?: boolean;
};

export function Button(props: ButtonProps) {
  const [local, rest] = splitProps(props, ["variant", "size", "kbd", "busy", "children", "class"]);
  return (
    <button
      {...rest}
      class={`btn btn-${local.variant ?? "default"} btn-${local.size ?? "m"} ${local.class ?? ""}`}
      disabled={rest.disabled || local.busy}
      aria-busy={local.busy}
    >
      <span class="btn-label">{local.children}</span>
      <Show when={local.kbd}>
        <Kbd k={local.kbd!} />
      </Show>
    </button>
  );
}

/**
 * A sentence from the supervisor or the agent, its `backticked` spans set as
 * machine values (the code-val every command and path wears) rather than
 * showing the backticks: prose stays prose, a command reads as one.
 */
export function Prose(props: { text: string }) {
  return <>{props.text.split(/(`[^`\n]+`)/).map((part) => (/^`[^`\n]+`$/.test(part) ? <code class="code-val">{part.slice(1, -1)}</code> : part))}</>;
}

/** A square button holding one line icon: back, search, more, close. */
export function IconButton(
  props: JSX.ButtonHTMLAttributes<HTMLButtonElement> & { icon: IconName; label: string; size?: 22 | 24 | 26 | 28 },
) {
  const [local, rest] = splitProps(props, ["icon", "label", "size", "class"]);
  return (
    <button
      {...rest}
      class={`icon-btn ${(local.size ?? 24) < 28 ? `icon-btn-${local.size ?? 24}` : ""} ${local.class ?? ""}`}
      style={{ width: `${local.size ?? 24}px`, height: `${local.size ?? 24}px` }}
      title={rest.title ?? local.label}
      aria-label={local.label}
    >
      <Icon name={local.icon} size={local.size && local.size >= 26 ? 16 : 12} />
    </button>
  );
}

/**
 * A key cap. Several keys ("j k") render as several caps — two keys. An
 * alias ("n / mod+n") puts a slash between its caps, so two caps never
 * mean "either" and "both" with the same picture.
 */
export function Kbd(props: { k: string }) {
  const parts = () => props.k.split(" ");
  return (
    <>
      {parts().map((k, i) =>
        k === "/" && parts().length > 1 ? (
          <span class="kbd-or" aria-label="/">
            /
          </span>
        ) : (
          <>
            {i > 0 ? " " : ""}
            <kbd class="kbd">{keyHint(k)}</kbd>
          </>
        ),
      )}
    </>
  );
}

export function Section(props: {
  title: string;
  aside?: JSX.Element;
  children: JSX.Element;
  class?: string;
  /** Secondary sections are quieter: 12/500 text-2, no rule. */
  minor?: boolean;
}) {
  return (
    <section class={`section ${props.minor ? "section-minor" : ""} ${props.class ?? ""}`}>
      <header class="section-head">
        <h2 class="section-title">{props.title}</h2>
        <span class="grow" />
        {props.aside}
      </header>
      <div class="section-body">{props.children}</div>
    </section>
  );
}

export function Field(props: {
  label: string;
  hint?: string;
  children: JSX.Element;
  error?: string | null;
  /** Unit shown inside the control's right edge ("秒", "min") or left ("$"). */
  unit?: string;
  unitLeft?: boolean;
  class?: string;
}) {
  return (
    <label class={`field ${props.class ?? ""}`}>
      <span class="field-label">{props.label}</span>
      <Show when={props.unit} fallback={props.children}>
        <span class="unit-wrap" classList={{ "unit-left": !!props.unitLeft }}>
          {props.children}
          <span class="unit">{props.unit}</span>
        </span>
      </Show>
      <Show when={props.error}>
        <span class="field-error" role="alert">
          {props.error}
        </span>
      </Show>
      <Show when={props.hint && !props.error}>
        <span class="field-hint">{props.hint}</span>
      </Show>
    </label>
  );
}

/**
 * A clause head — the contract's, and Settings' too, since Settings is the standing terms every goal starts from: its
 * title as a heading in sentence case, a hairline to the edge, and the clause's own actions after it. Only a real
 * sequence is numbered (the contract's clauses, which its schedule numbers on from): Settings' sections are not one,
 * so they carry no number.
 */
export function ClauseHead(p: { n?: number; title: string; id?: string; children?: JSX.Element }) {
  return (
    <header class="clause-head halt">
      <Show when={p.n}>
        <span class="clause-no num" aria-hidden="true">
          {String(p.n).padStart(2, "0")}
        </span>
      </Show>
      <h2 class="clause-title" id={p.id} tabindex="-1">
        {p.title}
      </h2>
      <span class="clause-rule" aria-hidden="true" />
      {p.children}
    </header>
  );
}

/** A macOS-style switch; inverted like the primary button, never coloured. */
export function Toggle(props: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  hint?: JSX.Element;
  disabled?: boolean;
}) {
  return (
    <label class="toggle-row" classList={{ disabled: !!props.disabled }}>
      <button
        type="button"
        role="switch"
        aria-checked={props.checked}
        class="toggle"
        disabled={props.disabled}
        onClick={() => props.onChange(!props.checked)}
      >
        <span class="toggle-knob" />
      </button>
      <span class="toggle-text">
        <span class="toggle-label">{props.label}</span>
        <Show when={props.hint}>
          <span class="field-hint">{props.hint}</span>
        </Show>
      </span>
    </label>
  );
}

/**
 * An empty, loading or failed state: one statement where the content would
 * be, a specific reason underneath, and at most one way forward. `kind`
 * picks the mark: a hollow ring (nothing here), a dot (waiting), a square
 * (an error, in the danger colour).
 */
/**
 * A resource's value, or undefined once its load has failed: reading the resource itself would throw the error. While
 * it reloads, the value it had: reading the resource then would hand the nearest Suspense its spinner, blanking the
 * page (and its scroll and focus) on every refetch.
 */
export const settled = <T,>(r: Resource<T>): T | undefined =>
  r.error !== undefined && !r.loading ? undefined : r.state === "refreshing" ? r.latest : r();

/** What a failed load says, with a way to try again; `pending` shows while there is no error. */
export function Failed(props: { title?: string; error: unknown; onRetry: () => void; inline?: boolean; pending?: JSX.Element }) {
  return (
    <Show when={props.error} fallback={props.pending}>
      <Empty title={props.title ?? t("common.loadFailed")} kind="error" inline={props.inline} action={<Button size="s" onClick={props.onRetry}>{t("common.retry")}</Button>}>
        {errorText(props.error)}
      </Empty>
    </Show>
  );
}

export function Empty(props: {
  title: string;
  children?: JSX.Element;
  action?: JSX.Element;
  kind?: "empty" | "loading" | "error";
  /** A small block, inside a section, instead of a page-level one. */
  inline?: boolean;
  /**
   * A whole-screen empty state: the block sits a third of the way down with
   * the wordmark above it, so the emptiest screens still have Tower's face.
   * Tower's three rules are said once, on the welcome page, not under every
   * empty screen.
   */
  poster?: boolean;
}) {
  const kind = () => props.kind ?? "empty";
  return (
    <div class={`empty empty-${kind()}`} classList={{ "empty-inline": !!props.inline, "empty-poster": !!props.poster }} role={kind() === "error" ? "alert" : undefined}>
      <Show when={props.poster}>
        <Wordmark />
      </Show>
      <div class="empty-row">
        <span class="empty-mark" aria-hidden="true">
          <Show when={kind() === "empty"}>
            <Icon name="ring" size={12} />
          </Show>
          <Show when={kind() === "loading"}>
            <Icon name="dot" size={10} />
          </Show>
          <Show when={kind() === "error"}>
            <DangerMark />
          </Show>
        </span>
        <div class="empty-text">
          <span class="empty-title">{props.title}</span>
          <Show when={props.children}>
            <span class="empty-body">{props.children}</span>
          </Show>
          <Show when={props.action}>
            <span class="empty-action">{props.action}</span>
          </Show>
        </div>
      </div>
    </div>
  );
}

/**
 * Tower's own mark: the tower itself — the glass cab, a bar across the top, on its mast — drawn with the same 1.25
 * pen as every glyph but in no glyph's shape, so it is never read as a status (the ring with a check is "verified",
 * and only that). The name beside it is set as a name, not tracked capitals.
 */
export function BrandMark(props: { size?: number }) {
  return (
    <svg class="brand-mark" width={props.size ?? 14} height={props.size ?? 14} viewBox="0 0 10 10" fill="none" stroke="currentColor" stroke-width="1.25" stroke-linecap="butt" stroke-linejoin="miter" aria-hidden="true">
      <rect x="1.125" y="1.125" width="7.75" height="2.75" />
      <path d="M5 3.875 V9.5 M3 9.375 H7" />
    </svg>
  );
}

export function Wordmark() {
  return (
    <div class="wordmark" aria-hidden="true">
      <BrandMark />
      Tower
    </div>
  );
}

/** A native popup "select": a button that opens a macOS menu. */
export function Select<T extends string>(props: {
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
  class?: string;
  label?: string;
}) {
  const label = () => props.options.find((o) => o.value === props.value)?.label ?? props.value;
  return (
    <button
      type="button"
      class={`select ${props.class ?? ""}`}
      aria-haspopup="menu"
      aria-label={props.label ? `${props.label}: ${label()}` : undefined}
      onClick={async () => {
        const { popupChoice } = await import("../lib/native");
        const v = await popupChoice(props.options, props.value);
        if (v !== null && v !== props.value) props.onChange(v);
      }}
    >
      <span class="ellipsis grow">{label()}</span>
      <svg width="8" height="10" viewBox="0 0 8 10" aria-hidden="true">
        <path d="M1 3.5 L4 1 L7 3.5 M1 6.5 L4 9 L7 6.5" fill="none" stroke="currentColor" stroke-width="1.2" />
      </svg>
    </button>
  );
}

const FOCUSABLE = 'input:not([disabled]), select:not([disabled]), textarea:not([disabled]), button:not([disabled]):not([tabindex="-1"]), [href], [tabindex="0"]';

/**
 * A modal layer: dialog semantics, focus moved in, kept in (Tab wraps) and
 * restored on close; Esc closes it before any view binding sees the key.
 * `instant` layers (opened from the keyboard) do not animate (§12.7).
 * With a `title` the dialog is labelled by its visible heading.
 */
export function Overlay(props: {
  onClose: () => void;
  label: string;
  title?: string;
  instant?: boolean;
  class?: string;
  /** Floats at the top like the palette; otherwise a little lower, like a sheet. */
  top?: boolean;
  /** The dialog's own keys. They live in the overlay's modal scope: one registered beside it would sit under the
   *  boundary with the view's keys. */
  keys?: { name: () => string; bindings: Binding[] };
  /** The key that opened it, which closes it again. */
  closeKey?: string;
  /**
   * Where focus lands on open: the first control (a palette's field), or
   * the panel itself for sheets you read first — then Tab reaches the first
   * control, and no focus ring sits on a secondary button mid-panel.
   */
  initialFocus?: "first" | "panel";
  /** The panel element itself, for a sheet that scrolls and wants to say so. */
  panelRef?: (el: HTMLDivElement) => void;
  children: JSX.Element;
}) {
  const previous = document.activeElement as HTMLElement | null;
  const titleId = createUniqueId();
  let panel!: HTMLDivElement;
  const close = () => props.onClose();
  // The key that opened it closes it again (`?`, `e`, ⌘P): under the modal layer the opener's own binding is quiet.
  const toggle: Binding[] = props.closeKey ? [{ key: props.closeKey, run: close, inInputs: props.closeKey.startsWith("mod+") }] : [];
  const layer = useKeys([{ key: "escape", run: close, inInputs: true }, ...toggle, ...(props.keys?.bindings ?? [])], props.keys?.name, { modal: true });
  // A sheet whose body runs on below its actions says so (`data-more`: a fade over the action band), since overlay
  // scrollbars show nothing until you scroll. Measured on scroll, on resize and when the content changes.
  let frame = 0;
  const measure = () => {
    cancelAnimationFrame(frame);
    frame = requestAnimationFrame(() => panel.toggleAttribute("data-more", panel.scrollHeight - panel.scrollTop - panel.clientHeight > 8));
  };
  onMount(() => {
    panel.addEventListener("scroll", measure, { passive: true });
    const resized = new ResizeObserver(measure);
    resized.observe(panel);
    const changed = new MutationObserver(measure);
    changed.observe(panel, { childList: true, subtree: true, characterData: true });
    measure();
    onCleanup(() => (resized.disconnect(), changed.disconnect(), cancelAnimationFrame(frame)));
  });
  onMount(() => {
    props.panelRef?.(panel);
    const first = props.initialFocus === "panel" ? null : panel.querySelector<HTMLElement>(FOCUSABLE);
    (first ?? panel).focus({ preventScroll: true });
  });
  onCleanup(() => previous?.focus?.({ preventScroll: true }));
  // Tab walks the sheet's own controls and wraps: WebKit's own walk skips buttons unless macOS Full Keyboard Access
  // is on, and from the last field it would leave the modal sheet for the board behind it.
  const trap = (e: KeyboardEvent) => {
    if (e.key !== "Tab") return;
    e.preventDefault();
    const items = [...panel.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((el) => el.offsetParent !== null);
    if (!items.length) return panel.focus();
    const at = items.indexOf(document.activeElement as HTMLElement);
    const next = at < 0 ? (e.shiftKey ? items.length - 1 : 0) : (at + (e.shiftKey ? -1 : 1) + items.length) % items.length;
    items[next].focus();
  };
  return (
    <div
      class="overlay"
      classList={{ instant: !!props.instant, "overlay-top": !!props.top }}
      onMouseDown={(e) => e.target === e.currentTarget && props.onClose()}
      onKeyDown={trap}
    >
      <div
        ref={panel}
        class={props.class ?? "panel"}
        role="dialog"
        aria-modal="true"
        aria-label={props.title ? undefined : props.label}
        aria-labelledby={props.title ? titleId : undefined}
        tabindex="-1"
      >
        <Show when={props.title}>
          <h2 class="panel-title" id={titleId}>
            {props.title}
          </h2>
        </Show>
        <KeyLayer.Provider value={layer}>{props.children}</KeyLayer.Provider>
      </div>
    </div>
  );
}

/** Waiting is stated, not animated (docs/12 §12.7: motion is a signal). */
export function Loading(props: { text?: string }) {
  return (
    <p class="loading" role="status">
      <Icon name="dot" size={10} /> {props.text ?? t("common.loading")}
    </p>
  );
}
