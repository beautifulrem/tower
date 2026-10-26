/** Small building blocks shared by every view. */
import { type JSX, Show, splitProps } from "solid-js";

import { keyHint } from "../lib/keys";

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

export function Kbd(props: { k: string }) {
  return <kbd class="kbd">{keyHint(props.k)}</kbd>;
}

export function Section(props: {
  title: string;
  aside?: JSX.Element;
  children: JSX.Element;
  class?: string;
}) {
  return (
    <section class={`section ${props.class ?? ""}`}>
      <header class="section-head">
        <h2 class="section-title">{props.title}</h2>
        <span class="grow" />
        {props.aside}
      </header>
      <div class="section-body">{props.children}</div>
    </section>
  );
}

export function Field(props: { label: string; hint?: string; children: JSX.Element; error?: string | null }) {
  return (
    <label class="field">
      <span class="field-label">{props.label}</span>
      {props.children}
      <Show when={props.error}>
        <span class="field-error">{props.error}</span>
      </Show>
      <Show when={props.hint && !props.error}>
        <span class="field-hint">{props.hint}</span>
      </Show>
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

/** Waiting is stated, not animated (docs/12 §12.7: motion is a signal). */
export function Loading(props: { text?: string }) {
  return <p class="loading">{props.text ?? "载入中…"}</p>;
}
