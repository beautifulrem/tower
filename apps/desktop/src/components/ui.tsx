/** Small building blocks shared by every view. */
import { type JSX, Show, onCleanup, onMount, splitProps } from "solid-js";

import { t } from "../lib/i18n";
import { keyHint } from "../lib/keys";
import { Icon, type IconName } from "./Glyph";

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

export function Kbd(props: { k: string }) {
  return <kbd class="kbd">{keyHint(props.k)}</kbd>;
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
        <span class="field-error">{props.error}</span>
      </Show>
      <Show when={props.hint && !props.error}>
        <span class="field-hint">{props.hint}</span>
      </Show>
    </label>
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

/** An empty state is one quiet line where the content would appear. */
export function Empty(props: { title: string; children?: JSX.Element }) {
  return (
    <div class="empty">
      <span class="empty-title">{props.title}</span>
      <Show when={props.children}>
        <span class="sep">·</span>
        <span class="empty-body">{props.children}</span>
      </Show>
    </div>
  );
}

/** A native popup "select": a button that opens a macOS menu. */
export function Select<T extends string>(props: {
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
  class?: string;
}) {
  const label = () => props.options.find((o) => o.value === props.value)?.label ?? props.value;
  return (
    <button
      type="button"
      class={`select ${props.class ?? ""}`}
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

/**
 * A modal layer: dialog semantics, focus moved in and restored on close.
 * `instant` layers (opened from the keyboard) do not animate (§12.7).
 */
export function Overlay(props: { onClose: () => void; label: string; instant?: boolean; class?: string; children: JSX.Element }) {
  const previous = document.activeElement as HTMLElement | null;
  let panel!: HTMLDivElement;
  onMount(() => {
    const first = panel.querySelector<HTMLElement>("input, textarea, button:not([disabled])");
    (first ?? panel).focus();
  });
  onCleanup(() => previous?.focus?.());
  return (
    <div class="overlay" classList={{ instant: !!props.instant }} onClick={props.onClose}>
      <div
        ref={panel}
        class={props.class ?? "panel"}
        role="dialog"
        aria-modal="true"
        aria-label={props.label}
        tabindex="-1"
        onClick={(e) => e.stopPropagation()}
      >
        {props.children}
      </div>
    </div>
  );
}

/** Waiting is stated, not animated (docs/12 §12.7: motion is a signal). */
export function Loading(props: { text?: string }) {
  return <p class="loading">{props.text ?? t("common.loading")}</p>;
}
