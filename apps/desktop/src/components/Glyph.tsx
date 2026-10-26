/**
 * Tower's one-pen glyph set (docs/12 §12.6.1, §12.9).
 *
 * Everything drawn in the interface — lifecycle glyphs, result marks,
 * navigation icons, the harness "measured" mark — is a 1.25px butt-capped
 * line on the same grid, so the whole product reads as one hand. Shapes
 * carry meaning in greyscale; colour is added only by the verifier (green,
 * red), by activity (blue-grey) or by a decision waiting for you (amber).
 *
 * Shape vocabulary: a ring is a goal; dashes are the claim register ("said,
 * not proven"); a check inside a ring is the verifier's word; a solid disc
 * is sealed. Triangles are not used for lifecycle at all — they read as
 * warnings and are kept for sentinels and environment errors.
 */
import { type JSX, Match, Show, Switch } from "solid-js";

import type { GoalSummary } from "../gen/GoalSummary";
import type { LifecycleState } from "../gen/LifecycleState";
import { t } from "../lib/i18n";
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

const DASH = "1.7 1.45";

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
      stroke-linecap="butt"
      stroke-linejoin="miter"
      role="img"
      aria-label={t(`state.${props.goal.state}`)}
    >
      {children}
    </svg>
  );
  const ring = () => <circle cx="5" cy="5" r="4" />;
  const dashedRing = () => <circle cx="5" cy="5" r="4" stroke-dasharray={DASH} />;
  const check = (stroke?: string) => <path d="M3.1 5.2 L4.5 6.6 L7 3.7" stroke={stroke} />;
  return (
    <Switch>
      <Match when={props.goal.state === "draft"}>{svg(ring())}</Match>
      <Match when={props.goal.state === "ready"}>
        {svg(
          <>
            {ring()}
            <circle cx="5" cy="5" r="1.2" fill={c()} stroke="none" />
          </>,
        )}
      </Match>
      <Match when={props.goal.state === "running"}>
        {svg(
          <>
            {ring()}
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
      {/* Claimed done: the claim register's dashes around an empty goal. */}
      <Match when={props.goal.state === "claimed"}>{svg(dashedRing())}</Match>
      {/* Verifying: the verifier is filling the claim in. */}
      <Match when={props.goal.state === "verifying"}>
        {svg(
          <>
            {dashedRing()}
            <path d="M5 1 A4 4 0 0 0 5 9 Z" fill={c()} stroke="none" />
          </>,
        )}
      </Match>
      {/* Ready to accept: the verifier's check inside the ring — green only with a pin. */}
      <Match when={props.goal.state === "in_review" && verified()}>
        {svg(
          <>
            {ring()}
            {check()}
          </>,
        )}
      </Match>
      <Match when={props.goal.state === "in_review"}>
        {svg(
          <>
            {dashedRing()}
            {check()}
          </>,
        )}
      </Match>
      {/* Accepted: sealed. Verified seals are solid; unverified ones stay hatched. */}
      <Match when={props.goal.state === "accepted" && verified()}>
        {svg(
          <>
            <circle cx="5" cy="5" r="4.25" fill={c()} stroke="none" />
            {check("var(--bg-app)")}
          </>,
        )}
      </Match>
      <Match when={props.goal.state === "accepted"}>
        {svg(
          <>
            {ring()}
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
            {ring()}
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
    <svg class="glyph mark-attention" width="9" height="9" viewBox="0 0 10 10" role="img" aria-label={props.title ?? t("common.needsYou")}>
      <path d="M5 0.6 L9.4 5 L5 9.4 L0.6 5 Z" fill="var(--st-attention)" />
    </svg>
  );
}

/** ◇: worth noticing, no decision needed. Never coloured. */
export function NoticeMark(props: { title?: string }) {
  return (
    <svg class="glyph" width="9" height="9" viewBox="0 0 10 10" role="img" aria-label={props.title ?? t("common.notice")}>
      <path d="M5 1 L9 5 L5 9 L1 5 Z" fill="none" stroke="currentColor" stroke-width="1.2" />
    </svg>
  );
}

/** ■: the verifier or a sentinel found something wrong. */
export function DangerMark(props: { title?: string }) {
  return (
    <svg class="glyph mark-danger" width="9" height="9" viewBox="0 0 10 10" role="img" aria-label={props.title ?? t("common.problem")}>
      <rect x="1" y="1" width="8" height="8" fill="currentColor" />
    </svg>
  );
}

export type IconName =
  | "plus"
  | "grid"
  | "inbox"
  | "chevron-left"
  | "chevron-right"
  | "caret-down"
  | "caret-right"
  | "ellipsis"
  | "search"
  | "harness"
  | "check"
  | "cross"
  | "stale"
  | "ring-check"
  | "ring-cross"
  | "warn"
  | "return"
  | "sliders"
  | "pulse"
  | "dot"
  | "network"
  | "copy"
  | "arrow-up"
  | "arrow-down"
  | "columns"
  | "keyboard"
  | "list"
  | "folder"
  | "expand"
  | "arrow-right"
  | "rework"
  | "ring"
  | "bell"
  | "undo";

const PATHS: Record<IconName, () => JSX.Element> = {
  plus: () => <path d="M6 2.25 V9.75 M2.25 6 H9.75" />,
  grid: () => (
    <>
      <rect x="2" y="2" width="3.25" height="3.25" />
      <rect x="6.75" y="2" width="3.25" height="3.25" />
      <rect x="2" y="6.75" width="3.25" height="3.25" />
      <rect x="6.75" y="6.75" width="3.25" height="3.25" />
    </>
  ),
  inbox: () => <path d="M6 1.4 L10.6 6 L6 10.6 L1.4 6 Z" />,
  "chevron-left": () => <path d="M7.5 2.25 L3.75 6 L7.5 9.75" />,
  "chevron-right": () => <path d="M4.5 2.25 L8.25 6 L4.5 9.75" />,
  "caret-down": () => <path d="M2.75 4.25 L6 7.5 L9.25 4.25" />,
  "caret-right": () => <path d="M4.25 2.75 L7.5 6 L4.25 9.25" />,
  ellipsis: () => (
    <>
      <circle cx="2.25" cy="6" r="1" fill="currentColor" stroke="none" />
      <circle cx="6" cy="6" r="1" fill="currentColor" stroke="none" />
      <circle cx="9.75" cy="6" r="1" fill="currentColor" stroke="none" />
    </>
  ),
  search: () => (
    <>
      <circle cx="5.25" cy="5.25" r="3.4" />
      <path d="M7.75 7.75 L10.75 10.75" />
    </>
  ),
  /* A scale: Tower measured it. Replaces the gear, which reads as "settings". */
  harness: () => <path d="M1.25 9.4 H10.75 M3.25 9.4 V6.1 M6 9.4 V3.1 M8.75 9.4 V6.1" />,
  check: () => <path d="M2.4 6.3 L4.9 8.8 L9.7 3.4" />,
  cross: () => <path d="M2.9 2.9 L9.1 9.1 M9.1 2.9 L2.9 9.1" />,
  stale: () => (
    <>
      <path d="M9.6 6.2 A3.6 3.6 0 1 1 8.55 3.35" />
      <path d="M8.9 1.1 V3.7 H6.3" />
    </>
  ),
  "ring-check": () => (
    <>
      <circle cx="6" cy="6" r="4.4" />
      <path d="M3.9 6.2 L5.4 7.7 L8.2 4.5" />
    </>
  ),
  "ring-cross": () => (
    <>
      <circle cx="6" cy="6" r="4.4" />
      <path d="M4.2 4.2 L7.8 7.8 M7.8 4.2 L4.2 7.8" />
    </>
  ),
  warn: () => (
    <>
      <path d="M6 1.6 L11 10.4 H1 Z" stroke-linejoin="miter" />
      <path d="M6 4.6 V7.1" />
      <circle cx="6" cy="8.9" r="0.7" fill="currentColor" stroke="none" />
    </>
  ),
  return: () => <path d="M2.75 1.75 V7.75 H9.75 M7.5 5.5 L9.75 7.75 L7.5 10" />,
  sliders: () => (
    <>
      <path d="M1.25 4 H10.75 M1.25 8 H10.75" />
      <circle cx="7.75" cy="4" r="1.6" fill="var(--bg-app)" />
      <circle cx="4.25" cy="8" r="1.6" fill="var(--bg-app)" />
    </>
  ),
  pulse: () => <path d="M0.75 6.5 H3 L4.6 2.25 L7.1 9.75 L8.7 6.5 H11.25" />,
  dot: () => <circle cx="6" cy="6" r="1.25" fill="currentColor" stroke="none" />,
  network: () => (
    <>
      <circle cx="6" cy="6" r="4.5" />
      <path d="M1.5 6 H10.5 M6 1.5 C3.9 3.4 3.9 8.6 6 10.5 M6 1.5 C8.1 3.4 8.1 8.6 6 10.5" />
    </>
  ),
  copy: () => (
    <>
      <rect x="4" y="4" width="6.5" height="6.5" />
      <path d="M8 4 V1.5 H1.5 V8 H4" />
    </>
  ),
  "arrow-up": () => <path d="M6 10 V2 M2.75 5.25 L6 2 L9.25 5.25" />,
  "arrow-down": () => <path d="M6 2 V10 M2.75 6.75 L6 10 L9.25 6.75" />,
  columns: () => (
    <>
      <rect x="1.5" y="2" width="9" height="8" />
      <path d="M6 2 V10" />
    </>
  ),
  keyboard: () => (
    <>
      <rect x="1" y="3" width="10" height="6.5" />
      <path d="M3 5.25 H3.5 M5.25 5.25 H5.75 M7.5 5.25 H8 M3.5 7.5 H8.5" />
    </>
  ),
  list: () => <path d="M1.5 3 H10.5 M1.5 6 H10.5 M1.5 9 H7.5" />,
  folder: () => <path d="M1.5 3 H5 L6.25 4.25 H10.5 V9.75 H1.5 Z" />,
  expand: () => <path d="M6 1.5 V10.5 M3.5 4 L6 1.5 L8.5 4 M3.5 8 L6 10.5 L8.5 8" />,
  "arrow-right": () => <path d="M1.75 6 H10 M7 2.75 L10.25 6 L7 9.25" />,
  /* Rework: two arcs chasing each other — distinct from `stale`, which is one arc and a return. */
  rework: () => (
    <>
      <path d="M2.4 5 A3.6 3.6 0 0 1 9.1 3.6" />
      <path d="M9.6 7 A3.6 3.6 0 0 1 2.9 8.4" />
      <path d="M9.4 1.2 V3.8 H6.8 M2.6 10.8 V8.2 H5.2" />
    </>
  ),
  /* A hollow ring: not yet measured. */
  ring: () => <circle cx="6" cy="6" r="3" />,
  bell: () => (
    <>
      <path d="M3 8.5 V5.5 A3 3 0 0 1 9 5.5 V8.5 L10 9.5 H2 Z" />
      <path d="M5 10.5 H7" />
    </>
  ),
  undo: () => <path d="M4.5 3.25 L1.75 6 L4.5 8.75 M1.75 6 H7.5 A2.75 2.75 0 0 1 7.5 11.5 H5.5" />,
};

/** One of Tower's own line icons; 12px by default, 16px for toolbar buttons. */
export function Icon(props: { name: IconName; size?: 10 | 12 | 16; class?: string; label?: string }) {
  return (
    <svg
      class={`icon ${props.class ?? ""}`}
      width={props.size ?? 12}
      height={props.size ?? 12}
      viewBox="0 0 12 12"
      fill="none"
      stroke="currentColor"
      stroke-width="1.25"
      stroke-linecap="butt"
      stroke-linejoin="miter"
      role={props.label ? "img" : undefined}
      aria-label={props.label}
      aria-hidden={props.label ? undefined : "true"}
    >
      {PATHS[props.name]()}
    </svg>
  );
}

export type ResultKind = "pass" | "fail" | "stale" | "obs-pass" | "obs-fail" | "pending" | "env";

const RESULT_ICON: Record<ResultKind, IconName> = {
  pass: "check",
  fail: "cross",
  stale: "stale",
  "obs-pass": "ring-check",
  "obs-fail": "ring-cross",
  pending: "ring",
  env: "warn",
};

/**
 * Result marks on the same grid as the lifecycle glyphs. Solid colour only
 * for fresh verifier facts; observations are rings and never coloured.
 */
export function ResultMark(props: { kind: ResultKind; title?: string }) {
  const label = () =>
    props.title ??
    ({
      pass: t("common.passed"),
      fail: t("common.failed"),
      stale: t("honesty.stale"),
      "obs-pass": `${t("honesty.observation")} · ${t("common.passed")}`,
      "obs-fail": `${t("honesty.observation")} · ${t("common.failed")}`,
      pending: t("goal.awaitingVerify"),
      env: t("pause.verify_env_error"),
    })[props.kind];
  return (
    <span class={`result result-${props.kind}`} title={label()}>
      <Icon name={RESULT_ICON[props.kind]} size={props.kind.startsWith("obs") ? 12 : 10} label={label()} />
    </span>
  );
}

/**
 * The verified seal (docs/12 §4.4): green never appears without the pin it
 * was measured on. One component, used everywhere the verdict is shown.
 */
export function Seal(props: { pin: string | null | undefined; text?: string; compact?: boolean; large?: boolean }) {
  const s = () => (props.large ? 12 : 10);
  return (
    <Show when={props.pin}>
      <span
        class="seal"
        classList={{ "seal-compact": !!props.compact, "seal-large": !!props.large }}
        title={t("honesty.sealTitle", { pin: props.pin!.slice(0, 7) })}
      >
        <span class="sr-only">{t("honesty.srVerified")} </span>
        <svg class="glyph" width={s()} height={s()} viewBox="0 0 10 10" aria-hidden="true">
          <circle cx="5" cy="5" r="4.25" fill="var(--st-verified)" />
          <path d="M3.1 5.2 L4.5 6.6 L7 3.7" fill="none" stroke="var(--bg-app)" stroke-width="1.25" />
        </svg>
        <span class="seal-word">{props.text ?? t("goal.verified")}</span>
        <span class="code-val seal-pin">@{props.pin!.slice(0, 7)}</span>
      </span>
    </Show>
  );
}
