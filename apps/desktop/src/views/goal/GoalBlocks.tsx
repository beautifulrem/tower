/**
 * The goal page's main column: next step, cause, sentinels, Six-Step
 * verification criteria, changes, the two-column Claim vs Fact Honesty Ledger,
 * decisions and assumptions, and runs.
 */
import { For, Show, createMemo, createSignal } from "solid-js";

import { DangerMark, Icon, NoticeMark, ResultMark } from "../../components/Glyph";
import { ConsistencyBadge, HumanStamp } from "../../components/Honesty";
import { Claim, CriteriaBar, discountedOf } from "../../components/HonestyCore";
import { Button, Empty, Kbd, Prose, Section } from "../../components/ui";
import type { ClaimView } from "../../gen/ClaimView";
import type { RunView } from "../../gen/RunView";
import { api } from "../../lib/api";
import { ago, clock, count, duration, short } from "../../lib/format";
import { t } from "../../lib/i18n";
import { runOutcomeLabel, runPurposeLabel } from "../../lib/labels";
import { ask } from "../../lib/native";
import { go, goProjectSetting } from "../../lib/nav";
import { act, state, toast } from "../../lib/store";
import { CriterionRow } from "./CriterionRow";
import { type ExtCriterionView, type ExtGoalDetail } from "./ext";

/** The workspace can be edited by hand only while the agent is not in it. */
export const editable = (s: string) => s === "paused" || s === "in_review";

/** Claims with the same text collapse to the latest; the layout must have a shape for repetition. */
function dedupe(claims: ClaimView[], keep: number): { shown: ClaimView[]; hidden: number } {
  const seen = new Set<string>();
  const unique: ClaimView[] = [];
  for (const c of [...claims].reverse()) {
    const key = c.text.trim();
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(c);
  }
  return { shown: unique.slice(0, keep).reverse(), hidden: claims.length - Math.min(unique.length, keep) };
}

export function GoalBlocks(props: { d: ExtGoalDetail; hasDecision: boolean; undoable: boolean; onUndoRollback: () => void }) {
  const d = () => props.d;
  const g = () => d().summary;
  const editedSinceVerify = () => editable(g().state) && d().criteria.some((c) => c.verified?.stale);
  const testDependent = createMemo(() => new Set(d().criteria.filter((c) => c.passes_with_source_only === false).map((c) => c.criterion.id)));
  const causes = createMemo(() => dedupe(d().claims.filter((c) => c.kind === "cause"), 3));
  const assumptions = () => d().claims.filter((c) => c.kind === "assumption");
  const decisions = () => d().claims.filter((c) => c.kind === "decision");
  const next = () => [...d().claims].reverse().find((c) => c.kind === "next");
  const ledger = () => d().claims.filter((c) => c.kind === "criterion_met");
  const failing = () => d().criteria.filter((c) => c.verified && !c.verified.passed && !c.verified.stale);
  const [allRuns, setAllRuns] = createSignal(false);
  const runs = () => {
    const list = [...d().runs].reverse();
    return allRuns() ? list : list.slice(0, 3);
  };
  const settled = () => ["in_review", "accepted", "integrated", "archived", "abandoned"].includes(g().state);

  return (
    <>
      <Show when={editedSinceVerify()}>
        <Section title={t("goal.next")}>
          <div class="section-cta">
            <Button variant={g().state === "in_review" && !props.hasDecision ? "primary" : "default"} size="s" onClick={() => void act(() => api.retryVerify(g().id))}>
              {t("goal.reverify")}
            </Button>
            <span class="meta">{g().state === "in_review" ? t("goal.editedNeedsVerify") : t("goal.editedPaused")}</span>
          </div>
        </Section>
      </Show>

      <Show when={g().state === "in_review" && !editedSinceVerify()}>
        <Section title={t("goal.next")}>
          <div class="section-cta">
            <Button variant={props.hasDecision ? "default" : "primary"} size="s" kbd="r" onClick={() => go({ name: "review", id: g().id })}>
              {t("goal.reviewUnits", { n: g().diffstat?.files ?? 0 })}
            </Button>
            <span class="meta">
              {discountedOf(d().criteria) > 0 ? t("goal.reviewCtaTampered") : g().verified_pin ? t("goal.reviewCtaVerified") : t("goal.reviewCtaUnverified")}
            </span>
          </div>
        </Section>
      </Show>

      <Show when={causes().shown.length || failing().length}>
        <Section title={t("goal.cause")}>
          <For each={failing()}>
            {(c) => (
              <div class="criterion-row">
                <ResultMark kind="fail" />
                <span class="num t3">{c.criterion.id}</span>
                <span class="criterion-main">
                  <span class="criterion-title t1">{t("goal.criterionFailed", { title: c.criterion.title })}</span>
                </span>
                <span class="col-result">{t("common.failed")}</span>
                <span class="col-dur">{duration(c.verified!.duration_ms)}</span>
                <span class="col-pin">
                  <Icon name="harness" size={10} />@{short(c.verified!.pin)}
                </span>
                <span class="col-age">{ago(c.verified!.at, state.now)}</span>
              </div>
            )}
          </For>
          <For each={causes().shown}>{(c) => <Claim bare>{c.text}</Claim>}</For>
          <Show when={causes().hidden > 0}>
            <div class="claim">
              <span />
              <span class="claim-more">{t("goal.moreSame", { n: causes().hidden })}</span>
            </div>
          </Show>
        </Section>
      </Show>

      <Show when={d().sentinels.length}>
        <Section title={t("goal.sentinels")}>
          <For each={d().sentinels}>
            {(h) => (
              <div class="sentinel">
                <div class="fact-row">
                  <span class="result">
                    <Show when={h.severity >= 3} fallback={<NoticeMark />}>
                      <DangerMark />
                    </Show>
                  </span>
                  <span class="t1">{h.title}</span>
                  <span class="grow" />
                  <span class="meta">{h.severity >= 3 ? t("goal.needsConfirm") : t("goal.noteInReview")}</span>
                </div>
                <SentinelDetail text={h.detail} />
              </div>
            )}
          </For>
        </Section>
      </Show>

      <Section title={t("goal.criteria")} aside={<CriteriaBar progress={g().progress} criteria={d().criteria} />}>
        <For each={d().criteria}>
          {(c) => <CriterionRow goalId={g().id} c={c as ExtCriterionView} state={g().state} base={d().base_commit} sentinels={d().sentinels} />}
        </For>
        <Show when={!d().has_held_out_tests && g().progress.machine > 0}>
          <p class="meta held-out-none">
            <NoticeMark />
            <span>
              {t("goal.noHeldOut")}{" "}
              <button class="link-quiet text-btn" onClick={() => goProjectSetting(g().project_id, "holdout")}>
                {t("goal.setHeldOut")}
                <Icon name="chevron-right" size={10} />
              </button>
            </span>
          </p>
        </Show>
        <Show when={d().criteria.length === 0}>
          <Empty
            title={t("goal.noCriteria")}
            inline
            action={
              <Show when={!["accepted", "integrated", "archived", "abandoned"].includes(g().state)}>
                <Button size="s" variant="ghost" onClick={() => go({ name: "new", amendId: g().id })} kbd="shift+e">
                  {t("goal.amend")}
                </Button>
              </Show>
            }
          >
            {t("goal.noCriteriaBody")}
          </Empty>
        </Show>
      </Section>

      <Section
        title={t("goal.changes")}
        aside={
          <Show when={g().diffstat}>
            <Button size="s" variant="ghost" onClick={() => go({ name: "review", id: g().id })}>
              {t("goal.openChanges")}
            </Button>
          </Show>
        }
      >
        <Show
          when={g().diffstat?.files}
          fallback={
            <Show when={g().diffstat} fallback={<Empty title={t("goal.noSnapshotTitle")} inline>{t("goal.noSnapshot")}</Empty>}>
              <Empty title={t("goal.noChangesTitle")} inline>
                {t("goal.noChangesBody", { sha: short(d().base_commit) })}
              </Empty>
            </Show>
          }
        >
          <div class="changes-row num meta">
            <span />
            <span />
            <span class="t1">
              <span class="diff-add">+{count(g().diffstat!.additions)}</span> <span class="diff-del">−{count(g().diffstat!.deletions)}</span>
              <span class="sep" />
              <span class="t2">{t("common.files", { n: g().diffstat!.files })}</span>
              <span class="sep" />
              <span class="t2">{t("goal.relativeToBase", { sha: short(d().base_commit) })}</span>
            </span>
            <span class="col-result col-quiet">{t("goal.snapshot")}</span>
            <span class="col-pin">
              <Icon name="harness" size={10} />@{short(d().pin)}
            </span>
          </div>
        </Show>
        <Show when={d().submit_summary}>
          <Claim kind={t("goal.submitSummary")}>{d().submit_summary}</Claim>
        </Show>
      </Section>

      <Show when={!settled() && !props.hasDecision}>
        <Section title={t("goal.next")}>
          <Show when={next()} fallback={<Empty title={t("goal.noNext")} inline>{g().state === "running" ? t("goal.noNextRunning") : t("goal.noNextIdle")}</Empty>}>
            <Claim>{next()!.text}</Claim>
          </Show>
        </Section>
      </Show>

      {/* Two-Column Physical Claim vs Fact Honesty Ledger */}
      <Show when={ledger().length}>
        <Section title={t("goal.ledger")} minor>
          <div class="honesty-ledger">
            <div class="ledger-cols-head" aria-hidden="true">
              <span>{t("honesty.agentSays")}</span>
              <span class="ledger-link">↔</span>
              <span><Icon name="harness" size={10} /> {t("honesty.measured")}</span>
            </div>
            <For each={ledger()}>
              {(c) => <LedgerRow c={c} testDependent={!!c.criterion && testDependent().has(c.criterion)} />}
            </For>
          </div>
        </Section>
      </Show>

      <Show when={assumptions().length || decisions().length}>
        <Section title={t("goal.decisions")} minor>
          <For each={[...assumptions(), ...decisions()]}>{(c) => <DecisionClaim goalId={g().id} c={c} />}</For>
        </Section>
      </Show>

      <Show when={d().runs.length}>
        <Section
          title={t("goal.runs")}
          minor
          aside={
            <span class="meta num row" style={{ gap: "var(--sp-3)" }}>
              <Show when={props.undoable}>
                <span class="row" style={{ gap: "var(--sp-2)" }}>
                  <span class="t2">{t("goal.rolledBackState")}</span>
                  <button class="link-plain text-btn t3" onClick={props.onUndoRollback} title={t("goal.undoRollback")}>
                    <Icon name="undo" size={10} />
                    {t("goal.undoRollback")}
                  </button>
                </span>
              </Show>
              <Show when={!props.undoable && editable(g().state) && d().runs.some((r) => r.ended_at && r.start_pin)}>
                <span class="t4">{t("goal.rollbackHint")}</span>
              </Show>
              {t("goal.runCount", { n: d().runs.length })}
            </span>
          }
        >
          <For each={runs()}>{(r) => <RunRow goalId={g().id} r={r} editable={editable(g().state)} onUndo={props.onUndoRollback} />}</For>
          <Show when={d().runs.length > 3}>
            <button class="more-link" onClick={() => setAllRuns((a) => !a)}>
              <Icon name={allRuns() ? "caret-down" : "caret-right"} size={10} />
              {allRuns() ? t("goal.fewerRuns") : t("goal.allRuns", { n: d().runs.length })}
            </button>
          </Show>
        </Section>
      </Show>
    </>
  );
}

const MACHINE_DETAIL = /^(\s{2,}|[~./]|[\w@.-]+(\/[\w@.-]+)+|\S+\.(js|ts|tsx|jsx|mjs|cjs|py|rs|go|rb|json|ya?ml|toml|lock|sh|txt|snap)\b)/;

export function SentinelDetail(props: { text: string }) {
  const lines = () => props.text.split("\n").filter((l, i, all) => l.trim() !== "" || (i > 0 && i < all.length - 1));
  return (
    <div class="sentinel-detail">
      <For each={lines()}>
        {(line) => (MACHINE_DETAIL.test(line) ? <span class="sentinel-machine code-val">{line}</span> : <span class="sentinel-prose">{line ? <Prose text={line} /> : "\u00a0"}</span>)}
      </For>
    </div>
  );
}

function RunRow(props: { goalId: string; r: RunView; editable: boolean; onUndo: () => void }) {
  const r = () => props.r;
  const rollback = async () => {
    const ok = await ask(t("goal.rollbackConfirm", { id: props.goalId, n: r().run_no }), {
      title: t("goal.rollbackTitle"),
      ok: t("goal.rollbackVerb"),
      cancel: t("common.cancel"),
      kind: "warning",
    });
    if (!ok) return;
    const done = await act(() => api.rollback(props.goalId, r().run_no));
    if (done !== undefined) toast("success", t("goal.rolledBack", { n: r().run_no }), { ttl: 8000, action: { label: t("goal.undoRollback"), run: props.onUndo } });
  };
  const can = () => !!(props.editable && r().ended_at && r().start_pin);
  const no = () => `R-${String(r().run_no).padStart(2, "0")}`;
  return (
    <div
      class="run-row meta"
      classList={{ "run-row-back": can() }}
      tabindex={can() ? 0 : undefined}
      aria-label={can() ? `${no()} ${runPurposeLabel(r().purpose)}, ${r().ended_at ? runOutcomeLabel(r().outcome) : t("goal.inProgress")}. ${t("goal.rollbackTitle")} ↩` : undefined}
      onKeyDown={(e) => {
        if (can() && e.key === "Enter" && e.target === e.currentTarget) {
          e.preventDefault();
          e.stopPropagation();
          void rollback();
        }
      }}
    >
      <span class="num t1">{no()}</span>
      <span>{runPurposeLabel(r().purpose)}</span>
      <span class="num">{clock(r().started_at)}</span>
      <span class="col-dur">{r().ended_at ? duration(r().ended_at! - r().started_at) : ""}</span>
      <span class="run-outcome row" style={{ "justify-content": "flex-end" }}>
        <Show when={can()}>
          <button class="link-plain text-btn run-rollback t3" tabindex={-1} onClick={() => void rollback()} title={t("goal.rollbackTitle")}>
            <Icon name="undo" size={10} /> {t("goal.rollback")}
            <Kbd k="enter" />
          </button>
        </Show>
        <span>{r().ended_at ? runOutcomeLabel(r().outcome) : t("goal.inProgress")}</span>
      </span>
    </div>
  );
}

function LedgerRow(props: { c: ClaimView; testDependent?: boolean }) {
  const value = () => (props.testDependent ? "contradicted" : props.c.consistency);
  const evidence = () => (props.testDependent ? t("goal.dependsOnEditedTestsLong") : props.c.evidence);
  return (
    <div class="ledger-pair">
      <div class="ledger-claim-cell" classList={{ dim: value() === "contradicted" }}>
        <span class="sr-only">{t("honesty.srClaim")} </span>
        <Show when={props.c.criterion}>
          <span class="num t3">{props.c.criterion} </span>
        </Show>
        <span>{props.c.text}</span>
      </div>
      <span class="ledger-link" aria-hidden="true">
        ↔
      </span>
      <div class="ledger-fact-cell" classList={{ "fact-contradicted": value() === "contradicted", "fact-warn": value() === "cannot_confirm" || value() === "stale" }}>
        <ConsistencyBadge value={value()} evidence={evidence()} />
        <Show when={evidence()}><span class="ledger-fact-ev">{evidence()}</span></Show>
      </div>
    </div>
  );
}

function DecisionClaim(props: { goalId: string; c: ClaimView }) {
  const label = () => (props.c.kind === "assumption" ? t("claimKind.assumption") : t("claimKind.decision"));
  return (
    <Claim
      bare
      kind={label()}
      aside={
        <Show
          when={props.c.approved !== null}
          fallback={
            <Show when={props.c.kind === "assumption"}>
              <span class="meta">{t("goal.awaitingConfirm")}</span>
            </Show>
          }
        >
          <HumanStamp at={props.c.at}> {props.c.approved ? t("goal.approved") : t("goal.rejected")}</HumanStamp>
        </Show>
      }
    >
      {props.c.text}
    </Claim>
  );
}
