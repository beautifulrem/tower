/** Snapshot Timeline Scope Switcher (`All Changes` · `Since Last Review` · `Last Turn` · `Compare Runs…`). */
import { For, Show, createMemo, createSignal } from "solid-js";

import { Icon } from "../../components/Glyph";
import type { GoalDetail } from "../../gen/GoalDetail";
import { dayClock, short } from "../../lib/format";
import { t } from "../../lib/i18n";
import { type ExtReviewView, type SnapshotPoint } from "../goal/ext";

export type ReviewScope = "all" | "since_last" | "last_turn" | "compare";

export function buildSnapshots(view: ExtReviewView | undefined, detail: GoalDetail | undefined, previous: string | null): SnapshotPoint[] {
  // The latest pin ends the list (the supervisor lists the verifier's after it), so a range's default end is "Latest".
  if (view?.snapshots?.length) return [...view.snapshots.filter((p) => p.kind !== "pin"), ...view.snapshots.filter((p) => p.kind === "pin")];
  const out: SnapshotPoint[] = [], seen = new Set<string>();
  const add = (rev: string | null | undefined, kind: SnapshotPoint["kind"], label: string, run_no: number | null = null, at: number | null = null) => {
    if (rev && !seen.has(rev)) (seen.add(rev), out.push({ rev, kind, label, run_no, at }));
  };
  add(view?.base_commit, "base", "");
  for (const r of detail?.runs ?? []) add(r.start_pin, "run_start", "", r.run_no, r.started_at);
  // The last review's pin, with no time of its own: named as the review it was, not as a save.
  add(previous, "saved", "");
  add(view?.pin, "pin", "");
  return out;
}

/**
 * A snapshot's name in the interface language, worded here from what it is (its kind, its run, its time) and then its
 * pin: the supervisor's own label is English. A kind this build does not know keeps that label.
 */
export function snapName(s: SnapshotPoint): string {
  const name =
    s.kind === "base"
      ? t("review.snapBase")
      : s.kind === "run_start" && s.run_no != null
        ? t("review.snapRun", { n: s.run_no })
        : s.kind === "saved"
          ? s.at
            ? t("review.snapSaved", { when: dayClock(s.at) })
            : t("review.snapReviewed")
          : s.kind === "verified"
            ? t("review.snapVerified")
            : s.kind === "pin"
              ? t("review.snapLatest")
              : null;
  return name ? `${name} @${short(s.rev)}` : s.label;
}

/** One point on the timeline, told apart from another at the same rev ("Latest" and "Verified", two runs' starts). */
const keyOf = (s: SnapshotPoint) => `${s.kind}:${s.run_no ?? ""}:${s.at ?? ""}:${s.rev}`;

export function lastTurnRev(snapshots: SnapshotPoint[], pin: string | undefined): string | null {
  if (!pin) return null;
  const list = snapshots.filter((s) => s.kind === "run_start" && s.rev !== pin);
  return (list.at(-1) ?? snapshots.filter((s) => s.kind !== "base" && s.rev !== pin).at(-1))?.rev ?? null;
}

export function TimelineSwitcher(props: {
  scope: ReviewScope;
  onScope: (s: ReviewScope) => void;
  previous: string | null;
  pin: string | undefined;
  snapshots: SnapshotPoint[];
  fromRev: string;
  toRev: string;
  onCompare: (fromRev: string, toRev: string) => void;
}) {
  const hasSince = () => !!props.previous && props.previous !== props.pin;
  const turn = createMemo(() => lastTurnRev(props.snapshots, props.pin));
  const tabs = createMemo<[ReviewScope, string][]>(() => [
    ["all", t("review.allChanges")],
    ...(hasSince() ? [["since_last", t("review.sinceLast")] as [ReviewScope, string]] : []),
    ...(turn() ? [["last_turn", t("review.lastTurn")] as [ReviewScope, string]] : []),
    ...(props.snapshots.length >= 2 ? [["compare", t("review.compareRuns")] as [ReviewScope, string]] : []),
  ]);

  return (
    <Show when={hasSince() || !!turn() || props.snapshots.length >= 3}>
      <span class="scope-switch" role="tablist" aria-label={t("review.scopeLabel")}>
        <For each={tabs()}>
          {([id, label]) => (
            <button
              class="tab"
              role="tab"
              aria-selected={props.scope === id}
              classList={{ active: props.scope === id }}
              onClick={() => {
                props.onScope(id);
                if (id === "compare" && (!props.fromRev || !props.toRev) && props.snapshots.length >= 2)
                  props.onCompare(props.snapshots[0].rev, props.snapshots.at(-1)!.rev);
              }}
            >{label}</button>
          )}
        </For>
      </span>
      <Show when={props.scope === "compare" && props.snapshots.length >= 2}>
        <span class="timeline-compare">
          <RunPick label={t("review.compareFrom")} value={props.fromRev} prefer="first" snapshots={props.snapshots} onPick={(rev) => props.onCompare(rev, props.toRev)} />
          <span class="t3">→</span>
          <RunPick label={t("review.compareTo")} value={props.toRev} prefer="last" snapshots={props.snapshots} onPick={(rev) => props.onCompare(props.fromRev, rev)} />
        </span>
      </Show>
    </Show>
  );
}

/**
 * A run picker: the native select, unseen, over a face that names the run and then its pin. Short of room the header
 * lets the pins go whole (`short-picks`): the run's name stays, and the open list and the tooltip keep every label whole.
 * The select chooses what the face says: each point is its own option (two can share a rev), and the one chosen is the
 * one you picked while the range still ends there, else the range's own end (its first point from, its last point to).
 */
function RunPick(props: { label: string; value: string; prefer: "first" | "last"; snapshots: SnapshotPoint[]; onPick: (rev: string) => void }) {
  const [picked, setPicked] = createSignal<string | null>(null);
  const point = createMemo(() => {
    const here = props.snapshots.filter((s) => s.rev === props.value);
    return here.find((s) => keyOf(s) === picked()) ?? (props.prefer === "first" ? here[0] : here.at(-1));
  });
  const curKey = () => (point() ? keyOf(point()!) : "");
  const cur = () => (point() ? snapName(point()!) : "");
  const at = () => cur().lastIndexOf(" @");
  return (
    <span class="timeline-pick" title={cur()}>
      <span class="timeline-pick-face" aria-hidden="true">
        <span>{at() < 0 ? cur() : cur().slice(0, at())}</span>
        <Show when={at() >= 0}>
          <span class="timeline-pick-pin">{cur().slice(at() + 1)}</span>
        </Show>
        <Icon name="caret-down" size={10} />
      </span>
      <select
        class="timeline-select"
        aria-label={props.label}
        onChange={(e) => {
          const s = props.snapshots.find((x) => keyOf(x) === e.currentTarget.value);
          if (!s) return;
          setPicked(keyOf(s));
          props.onPick(s.rev);
        }}
      >
        <For each={props.snapshots}>
          {(s) => (
            <option value={keyOf(s)} selected={keyOf(s) === curKey()}>
              {snapName(s)}
            </option>
          )}
        </For>
      </select>
    </span>
  );
}
