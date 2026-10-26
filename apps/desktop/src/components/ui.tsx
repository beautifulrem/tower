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

export function Empty(props: { title: string; children?: JSX.Element; icon?: JSX.Element }) {
  return (
    <div class="empty">
      <Show when={props.icon}>{props.icon}</Show>
      <p class="empty-title">{props.title}</p>
      <div class="empty-body">{props.children}</div>
    </div>
  );
}

export function Spinner() {
  return <span class="spinner" aria-label="加载中" />;
}
