/**
 * Lifecycle glyphs (docs/12 §12.6.1): distinct shapes, readable in greyscale.
 * Colour appears only once the verifier has passed (△ → ◭ → ▲ → ●).
 */
import { type JSX, Match, Switch } from "solid-js";

import type { GoalSummary } from "../gen/GoalSummary";
import type { LifecycleState } from "../gen/LifecycleState";
import { machineVerified } from "../lib/labels";

type Tone = "neutral" | "active" | "verified" | "faint";

function toneOf(state: LifecycleState, verified: boolean): Tone {
  switch (state) {
    case "running":
    case "verifying":
      return "active";
    case "in_review":
    case "accepted":
    case "integrated":
      return verified ? "verified" : "neutral";
    case "archived":
      return "faint";
    default:
      return "neutral";
  }
}

const color: Record<Tone, string> = {
  neutral: "var(--st-neutral)",
  active: "var(--st-active)",
  verified: "var(--st-verified)",
  faint: "var(--text-4)",
};

export function LifecycleGlyph(props: { goal: Pick<GoalSummary, "state" | "progress" | "verified_pin">; size?: number }) {
  const verified = () => machineVerified(props.goal as GoalSummary);
  const c = () => color[toneOf(props.goal.state, verified())];
  const s = () => props.size ?? 10;
  const svg = (children: JSX.Element) => (
    <svg
      class="glyph"
      width={s()}
      height={s()}
      viewBox="0 0 10 10"
      fill="none"
      stroke={c()}
      stroke-width="1.25"
      aria-hidden="true"
    >
      {children}
    </svg>
  );
  return (
    <Switch>
      <Match when={props.goal.state === "draft"}>{svg(<circle cx="5" cy="5" r="4" />)}</Match>
      <Match when={props.goal.state === "ready"}>
        {svg(
          <>
            <circle cx="5" cy="5" r="4" />
            <circle cx="5" cy="5" r="1.2" fill={c()} stroke="none" />
          </>,
        )}
      </Match>
      <Match when={props.goal.state === "running"}>
        {svg(
          <>
            <circle cx="5" cy="5" r="4" />
            <path d="M5 1 A4 4 0 0 0 5 9 Z" fill={c()} stroke="none" />
          </>,
        )}
      </Match>
      <Match when={props.goal.state === "paused"}>
        {svg(
          <>
            <line x1="3.3" y1="1.5" x2="3.3" y2="8.5" />
            <line x1="6.7" y1="1.5" x2="6.7" y2="8.5" />
          </>,
        )}
      </Match>
      <Match when={props.goal.state === "claimed"}>{svg(<path d="M5 1.2 L9 8.6 L1 8.6 Z" stroke-linejoin="round" />)}</Match>
      <Match when={props.goal.state === "verifying"}>
        {svg(
          <>
            <path d="M5 1.2 L9 8.6 L1 8.6 Z" stroke-linejoin="round" />
            <path d="M5 1.2 L5 8.6 L1 8.6 Z" fill={c()} stroke="none" />
          </>,
        )}
      </Match>
      <Match when={props.goal.state === "in_review" && verified()}>
        {svg(<path d="M5 1.2 L9 8.6 L1 8.6 Z" fill={c()} stroke-linejoin="round" />)}
      </Match>
      <Match when={props.goal.state === "in_review"}>
        {svg(
          <>
            <path d="M5 1.2 L9 8.6 L1 8.6 Z" stroke-linejoin="round" />
            <circle cx="5" cy="6.1" r="0.9" fill={c()} stroke="none" />
          </>,
        )}
      </Match>
      <Match when={props.goal.state === "accepted" && verified()}>
        {svg(<circle cx="5" cy="5" r="4" fill={c()} />)}
      </Match>
      <Match when={props.goal.state === "accepted"}>
        {svg(
          <>
            <circle cx="5" cy="5" r="4" />
            <path d="M2.4 7.6 L7.6 2.4 M1.5 5.5 L5.5 1.5 M4.5 8.5 L8.5 4.5" stroke-width="0.9" />
          </>,
        )}
      </Match>
      <Match when={props.goal.state === "integrated"}>
        {svg(
          <>
            <circle cx="5" cy="5" r="4.2" stroke-width="1" />
            <circle cx="5" cy="5" r="2.4" fill={c()} stroke="none" />
          </>,
        )}
      </Match>
      <Match when={props.goal.state === "archived"}>{svg(<circle cx="5" cy="5" r="1.5" fill={c()} stroke="none" />)}</Match>
      <Match when={props.goal.state === "abandoned"}>
        {svg(
          <>
            <circle cx="5" cy="5" r="4" />
            <line x1="2.2" y1="7.8" x2="7.8" y2="2.2" />
          </>,
        )}
      </Match>
    </Switch>
  );
}

/** ◆: something needs your decision. The only attention mark. */
export function NeedsYouMark(props: { title?: string }) {
  return (
    <svg class="glyph mark-attention" width="9" height="9" viewBox="0 0 10 10" aria-label={props.title ?? "需要你"}>
      <path d="M5 0.6 L9.4 5 L5 9.4 L0.6 5 Z" fill="var(--st-attention)" />
    </svg>
  );
}

/** ◇: worth noticing, no decision needed. Never coloured. */
export function NoticeMark() {
  return (
    <svg class="glyph" width="9" height="9" viewBox="0 0 10 10" aria-hidden="true">
      <path d="M5 1 L9 5 L5 9 L1 5 Z" fill="none" stroke="var(--text-1)" stroke-width="1.2" />
    </svg>
  );
}

/** Result marks: solid only for fresh verifier facts; hollow for observations. */
export function ResultMark(props: { kind: "pass" | "fail" | "stale" | "obs-pass" | "obs-fail" | "pending" | "env" }) {
  return (
    <span class={`result result-${props.kind}`} aria-hidden="true">
      <Switch>
        <Match when={props.kind === "pass"}>✓</Match>
        <Match when={props.kind === "fail"}>✕</Match>
        <Match when={props.kind === "stale"}>⟲</Match>
        <Match when={props.kind === "obs-pass"}>○✓</Match>
        <Match when={props.kind === "obs-fail"}>○✕</Match>
        <Match when={props.kind === "env"}>⚠</Match>
        <Match when={props.kind === "pending"}>·</Match>
      </Switch>
    </span>
  );
}
