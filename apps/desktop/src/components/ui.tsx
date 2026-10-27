/** Small building blocks shared by every view. */
import { type JSX, Show, createUniqueId, onCleanup, onMount, splitProps } from "solid-js";

import { t } from "../lib/i18n";
import { keyHint, useKeys } from "../lib/keys";
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
      class={`icon-btn ${local.class ?? ""}`}
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
 * number in tabular figures, its title as a heading in sentence case, a hairline to the edge, and the clause's own
 * actions after it.
 */
export function ClauseHead(p: { n: number; title: string; id?: string; children?: JSX.Element }) {
  return (
    <header class="clause-head halt">
      <span class="clause-no num" aria-hidden="true">
        {String(p.n).padStart(2, "0")}
      </span>
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

const FOCUSABLE = 'input:not([disabled]), textarea:not([disabled]), button:not([disabled]):not([tabindex="-1"]), [href], [tabindex="0"]';

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
  useKeys([{ key: "escape", run: () => props.onClose(), inInputs: true }]);
  onMount(() => {
    props.panelRef?.(panel);
    const first = props.initialFocus === "panel" ? null : panel.querySelector<HTMLElement>(FOCUSABLE);
    (first ?? panel).focus({ preventScroll: true });
  });
  onCleanup(() => previous?.focus?.({ preventScroll: true }));
  const trap = (e: KeyboardEvent) => {
    if (e.key !== "Tab") return;
    const items = [...panel.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((el) => el.offsetParent !== null);
    if (!items.length) {
      e.preventDefault();
      panel.focus();
      return;
    }
    const first = items[0];
    const last = items[items.length - 1];
    const active = document.activeElement;
    if (e.shiftKey && (active === first || active === panel)) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && active === last) {
      e.preventDefault();
      first.focus();
    }
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
        {props.children}
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
