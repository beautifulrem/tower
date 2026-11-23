/** Snapshot Timeline Scope Switcher (`All Changes` · `Since Last Review` · `Last Turn` · `Compare Runs…`). */
import { For, Show, createMemo } from "solid-js";

import type { GoalDetail } from "../../gen/GoalDetail";
import { short } from "../../lib/format";
import { t } from "../../lib/i18n";
import { type ExtReviewView, type SnapshotPoint } from "../goal/ext";

export type ReviewScope = "all" | "since_last" | "last_turn" | "compare";

export function buildSnapshots(view: ExtReviewView | undefined, detail: GoalDetail | undefined, previous: string | null): SnapshotPoint[] {
  if (view?.snapshots?.length) return view.snapshots;
  const out: SnapshotPoint[] = [], seen = new Set<string>();
  const add = (rev: string | null | undefined, kind: SnapshotPoint["kind"], label: string, run_no: number | null = null, at: number | null = null) => {
    if (rev && !seen.has(rev)) (seen.add(rev), out.push({ rev, kind, label, run_no, at }));
  };
  add(view?.base_commit, "base", `base @${short(view?.base_commit)}`);
  for (const r of detail?.runs ?? []) add(r.start_pin, "run_start", `R-${String(r.run_no).padStart(2, "0")} @${short(r.start_pin)}`, r.run_no, r.started_at);
  add(previous, "saved", `Last review @${short(previous)}`);
  add(view?.pin, "pin", `Current @${short(view?.pin)}`);
  return out;
}

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
          <select class="timeline-select" aria-label={t("review.compareFrom")} value={props.fromRev} onChange={(e) => props.onCompare(e.currentTarget.value, props.toRev)}>
            <For each={props.snapshots}>{(s) => <option value={s.rev}>{s.label}</option>}</For>
          </select>
          <span class="t3">→</span>
          <select class="timeline-select" aria-label={t("review.compareTo")} value={props.toRev} onChange={(e) => props.onCompare(props.fromRev, e.currentTarget.value)}>
            <For each={props.snapshots}>{(s) => <option value={s.rev}>{s.label}</option>}</For>
          </select>
        </span>
      </Show>
    </Show>
  );
}
