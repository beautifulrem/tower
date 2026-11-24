/**
 * Tower's one-pen glyph set (docs/12 §12.6.1, §12.9).
 *
 * Everything drawn in the interface — lifecycle glyphs, result marks,
 * navigation icons, the harness "measured" mark — is a line of about 1.25px
 * with round ends and round joins, so the whole product reads as one hand. Shapes
 * carry meaning in greyscale; colour is added only by the verifier (green,
 * red), by activity (blue-grey) or by a decision waiting for you (amber).
 *
 * Shape vocabulary: a ring is a goal; dashes are the claim register ("said,
 * not proven"); a check inside a ring is the verifier's word; a solid disc
 * is sealed. There are no warning triangles: a sentinel's finding is the
 * danger square, an environment problem the sandbox's open box, one glyph
 * per fact wherever the fact is said.
 */
import { type JSX, Match, Show, Switch } from "solid-js";

import type { GoalSummary } from "../gen/GoalSummary";
import type { LifecycleState } from "../gen/LifecycleState";
import { t } from "../lib/i18n";
import { notEvidence } from "../lib/discounted";
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

export function LifecycleGlyph(props: { goal: Pick<GoalSummary, "state" | "progress" | "verified_pin"> & { id?: string }; size?: number }) {
  const verified = () => machineVerified(props.goal as GoalSummary);
  // Ready or accepted with a pass that is not evidence: the seal's amber ◆ stands where the green check would, so the
  // title, the sidebar and the board never draw green on a goal whose header says "Passed, not evidence".
  const discounted = () =>
    (props.goal.state === "in_review" || props.goal.state === "accepted") && notEvidence(props.goal);
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
      role="img"
      aria-label={t(`state.${props.goal.state}`)}
    >
      {children}
    </svg>
  );
  const ring = () => <circle cx="5" cy="5" r="4" />;
  // The claim register's dashes keep square ends: round ones would turn the ring into a string of beads.
  const dashedRing = () => <circle cx="5" cy="5" r="4" stroke-dasharray={DASH} stroke-linecap="butt" />;
  const check = (stroke?: string) => <path d="M3.1 5.2 L4.5 6.6 L7 3.7" stroke={stroke} />;
  return (
    <Switch>
      <Match when={discounted()}>
        <svg class="glyph mark-attention" width={s()} height={s()} viewBox="0 0 10 10" role="img" aria-label={props.goal.state === "in_review" ? t("honesty.sealTampered") : `${t(`state.${props.goal.state}`)} · ${t("honesty.sealTampered")}`}>
          <path d="M5 0.6 L9.4 5 L5 9.4 L0.6 5 Z" fill="var(--st-attention)" />
        </svg>
      </Match>
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
  | "sandbox"
  | "return"
  | "sliders"
  | "dot"
  | "network"
  | "copy"
  | "arrow-up"
  | "arrow-down"
  | "columns"
  | "keyboard"
  | "list"
  | "expand"
  | "arrow-right"
  | "rework"
  | "ring"
  | "bell"
  | "undo"
  | "learning"
  | "operations"
  | "peek";

/* Drawn on a 16-unit grid with a 2.5-unit margin, in the line style docs/12 §12.9 names: round caps and joins, corners
   rounded, open space between strokes. The pen's width is set per size in CSS (`.icon`), so a 10px icon is not drawn
   hairline. */
const PATHS: Record<IconName, () => JSX.Element> = {
  plus: () => <path d="M8 3.5v9M3.5 8h9" />,
  grid: () => (
    <>
      <rect x="2.5" y="2.5" width="4" height="4" rx="1" />
      <rect x="9.5" y="2.5" width="4" height="4" rx="1" />
      <rect x="2.5" y="9.5" width="4" height="4" rx="1" />
      <rect x="9.5" y="9.5" width="4" height="4" rx="1" />
    </>
  ),
  /* The tray things wait in for you. */
  inbox: () => <path d="M2.5 8.5h3l1 2h3l1-2h3M2.5 8.5l1.7-4.7a1 1 0 0 1 .9-.8h5.8a1 1 0 0 1 .9.8l1.7 4.7V12a1.5 1.5 0 0 1-1.5 1.5H4A1.5 1.5 0 0 1 2.5 12z" />,
  "chevron-left": () => <path d="M10 3.5 5.5 8l4.5 4.5" />,
  "chevron-right": () => <path d="M6 3.5l4.5 4.5L6 12.5" />,
  "caret-down": () => <path d="M4 6l4 4 4-4" />,
  "caret-right": () => <path d="M6 4l4 4-4 4" />,
  ellipsis: () => <path d="M3.5 8h.01M8 8h.01M12.5 8h.01" stroke-width="2.5" />,
  search: () => (
    <>
      <circle cx="7" cy="7" r="4.5" />
      <path d="M10.25 10.25 13.5 13.5" />
    </>
  ),
  /* A scale: Tower measured it. Replaces the gear, which reads as "settings". */
  harness: () => <path d="M2.5 13h11M5 13V9.5M8 13V3.5M11 13V9.5" />,
  check: () => <path d="M3 8.5l3.25 3.25L13 5" />,
  cross: () => <path d="M4 4l8 8m0-8-8 8" />,
  stale: () => <path d="M13.25 8A5.25 5.25 0 1 1 11.7 4.3M12 1.75V4.5H9.25" />,
  "ring-check": () => (
    <>
      <circle cx="8" cy="8" r="5.75" />
      <path d="M5.5 8.25l1.75 1.75 3.25-3.75" />
    </>
  ),
  "ring-cross": () => (
    <>
      <circle cx="8" cy="8" r="5.75" />
      <path d="M6 6l4 4m0-4-4 4" />
    </>
  ),
  /* The environment: the sandbox's box, its wall broken where something tried to pass. Not a warning triangle — an
     environment problem is nobody's failure — and not ◇ or ◆, which belong to notices and decisions. */
  sandbox: () => <path d="M5.25 2.5H4A1.5 1.5 0 0 0 2.5 4v8A1.5 1.5 0 0 0 4 13.5h8a1.5 1.5 0 0 0 1.5-1.5V4A1.5 1.5 0 0 0 12 2.5h-1.25" />,
  return: () => <path d="M3 2.5v5a2 2 0 0 0 2 2h8m-3-3 3 3-3 3" />,
  sliders: () => (
    <>
      <path d="M2.5 5h6m4 0h1m-11 6h1m4 0h6" />
      <circle cx="10.5" cy="5" r="2" />
      <circle cx="5.5" cy="11" r="2" />
    </>
  ),
  dot: () => <circle cx="8" cy="8" r="1.75" fill="currentColor" stroke="none" />,
  network: () => (
    <>
      <circle cx="8" cy="8" r="5.75" />
      <ellipse cx="8" cy="8" rx="2.5" ry="5.75" />
      <path d="M2.25 8h11.5" />
    </>
  ),
  copy: () => (
    <>
      <rect x="5.5" y="5.5" width="8" height="8" rx="1.5" />
      <path d="M10.5 5.5V4A1.5 1.5 0 0 0 9 2.5H4A1.5 1.5 0 0 0 2.5 4v5A1.5 1.5 0 0 0 4 10.5h1.5" />
    </>
  ),
  "arrow-up": () => <path d="M8 13V3M4 7l4-4 4 4" />,
  "arrow-down": () => <path d="M8 3v10M4 9l4 4 4-4" />,
  columns: () => (
    <>
      <rect x="2.5" y="2.5" width="11" height="11" rx="1.5" />
      <path d="M8 2.5v11" />
    </>
  ),
  keyboard: () => (
    <>
      <rect x="1.5" y="3.5" width="13" height="9" rx="1.5" />
      <path d="M4.5 6.5h1m2 0h1m2 0h1m-6 3h5" />
    </>
  ),
  list: () => <path d="M2.5 4h11M2.5 8h11M2.5 12h7" />,
  expand: () => <path d="M8 2.5v11M5 5.5l3-3 3 3M5 10.5l3 3 3-3" />,
  "arrow-right": () => <path d="M3 8h10M9 4l4 4-4 4" />,
  /* Rework: two arcs chasing each other — distinct from `stale`, which is one arc and a return. */
  rework: () => <path d="M3 8a5 5 0 0 1 8.5-3.55M11.75 1.75v3h-3M13 8a5 5 0 0 1-8.5 3.55M4.25 14.25v-3h3" />,
  /* A hollow ring: not yet measured. */
  ring: () => <circle cx="8" cy="8" r="4" />,
  bell: () => <path d="M4 10.5v-4a4 4 0 0 1 8 0v4l1.5 1.5h-11zM6.5 14h3" />,
  undo: () => <path d="M5.5 3.5l-3 3 3 3M2.5 6.5h7.25a3.5 3.5 0 0 1 0 7H8" />,
  /* Learning: an open book, the rules you have taught. */
  learning: () => <path d="M8 4.5C6.75 3.5 5 3 2.5 3v9.5c2.5 0 4.25.5 5.5 1.5 1.25-1 3-1.5 5.5-1.5V3C11 3 9.25 3.5 8 4.5zm0 0V14" />,
  /* Operations: the schedule's dial. */
  operations: () => (
    <>
      <circle cx="8" cy="8" r="5.75" />
      <path d="M8 5v3.25l2 1.25" />
    </>
  ),
  /* Slide-over quick peek drawer. */
  peek: () => (
    <>
      <rect x="2.5" y="2.5" width="11" height="11" rx="1.5" />
      <path d="M9.5 2.5v11" />
    </>
  ),
};

/** One of Tower's own line icons; 12px by default, 14px in the sidebar, 16px for toolbar buttons. */
export function Icon(props: { name: IconName; size?: 10 | 12 | 14 | 16; class?: string; label?: string }) {
  return (
    <svg
      class={`icon ${props.class ?? ""}`}
      width={props.size ?? 12}
      height={props.size ?? 12}
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
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
  env: "sandbox",
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

/** A criterion's mark when it passed but its must-fail canary passed too: the seal's ◆, never the green check. */
export function NotEvidenceMark() {
  return (
    <span class="result result-tampered" title={t("honesty.sealTampered")}>
      <NeedsYouMark title={t("honesty.sealTampered")} />
    </span>
  );
}

/**
 * The stamp: the seal set as Tower's one signature, where a verdict is the
 * point of the screen — the accept sheet's masthead, and the head of a goal
 * you accepted. A 1px frame in ink, two cells: the verdict (its glyph and
 * word in the display cut, the largest type in the interface) and the pin it
 * was measured on (mono, tabular), divided by the frame's own rule. A pass
 * that is not evidence is the seal withheld: the frame is dashed — the claim
 * register's line, "said, not proven" — and the ◆ stands where the disc
 * would. `press` plays the impression once, as the sheet opens.
 */
export function Stamp(props: { pin: string; tampered?: boolean; press?: boolean; size?: "l" | "m" }) {
  const pin = () => props.pin.slice(0, 7);
  return (
    <span
      class={`stamp stamp-${props.size ?? "l"}`}
      classList={{ "stamp-tampered": !!props.tampered, "stamp-press": !!props.press }}
      title={props.tampered ? t("honesty.sealTamperedTitle", { pin: pin() }) : t("honesty.sealTitle", { pin: pin() })}
    >
      <span class="sr-only">{props.tampered ? t("honesty.srTampered") : t("honesty.srVerified")} </span>
      <span class="stamp-verdict">
        <Show
          when={!props.tampered}
          fallback={
            <svg class="glyph stamp-glyph" viewBox="0 0 10 10" aria-hidden="true">
              <path d="M5 0.6 L9.4 5 L5 9.4 L0.6 5 Z" fill="var(--st-attention)" />
            </svg>
          }
        >
          <svg class="glyph stamp-glyph" viewBox="0 0 10 10" aria-hidden="true">
            <circle cx="5" cy="5" r="4.25" fill="var(--st-verified)" />
            <path d="M3.1 5.2 L4.5 6.6 L7 3.7" fill="none" stroke="var(--bg-app)" stroke-width="1.1" />
          </svg>
        </Show>
        <span class="stamp-word">{props.tampered ? t("honesty.sealTampered") : t("goal.verified")}</span>
      </span>
      <span class="stamp-pin code-val num">@{pin()}</span>
    </span>
  );
}

/**
 * The verified seal (docs/12 §4.4): green never appears without the pin it
 * was measured on. One component, used everywhere the verdict is shown.
 * `tampered` is the seal withheld: every command passed on this pin, but a
 * must-fail canary passed too, so the pass is not evidence — the attention
 * register's ◆ stands where the green disc would, and the words say so.
 */
export function Seal(props: { pin: string | null | undefined; text?: string; compact?: boolean; large?: boolean; tampered?: boolean }) {
  const s = () => (props.large ? 12 : 10);
  const pin = () => props.pin!.slice(0, 7);
  return (
    <Show when={props.pin}>
      <span
        class="seal"
        classList={{ "seal-compact": !!props.compact, "seal-large": !!props.large, "seal-tampered": !!props.tampered }}
        title={props.tampered ? t("honesty.sealTamperedTitle", { pin: pin() }) : t("honesty.sealTitle", { pin: pin() })}
      >
        <span class="sr-only">{props.tampered ? t("honesty.srTampered") : t("honesty.srVerified")} </span>
        <Show
          when={!props.tampered}
          fallback={
            <svg class="glyph mark-attention" width={s()} height={s()} viewBox="0 0 10 10" aria-hidden="true">
              <path d="M5 0.6 L9.4 5 L5 9.4 L0.6 5 Z" fill="var(--st-attention)" />
            </svg>
          }
        >
          <svg class="glyph" width={s()} height={s()} viewBox="0 0 10 10" aria-hidden="true">
            <circle cx="5" cy="5" r="4.25" fill="var(--st-verified)" />
            <path d="M3.1 5.2 L4.5 6.6 L7 3.7" fill="none" stroke="var(--bg-app)" stroke-width="1.25" />
          </svg>
        </Show>
        <span class="seal-word">{props.text ?? (props.tampered ? t("honesty.sealTampered") : t("goal.verified"))}</span>
        <span class="code-val seal-pin">@{pin()}</span>
      </span>
    </Show>
  );
}
