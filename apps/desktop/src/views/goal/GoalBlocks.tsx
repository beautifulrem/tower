/**
 * The goal page's main column: next step, cause, sentinels, criteria,
 * changes, the ledger of claims against facts, decisions and assumptions,
 * runs. Every block is a Section; the page decides which text box it owns.
 */
import { For, Show, createMemo, createSignal } from "solid-js";

import { DangerMark, Icon, NoticeMark, ResultMark } from "../../components/Glyph";
import { Claim, ConsistencyBadge, CriteriaBar, HumanStamp, discountedOf } from "../../components/Honesty";
import { Button, Empty, Section } from "../../components/ui";
import type { ClaimView } from "../../gen/ClaimView";
import type { GoalDetail } from "../../gen/GoalDetail";
import type { RunView } from "../../gen/RunView";
import { api } from "../../lib/api";
import { ago, clock, count, duration, short } from "../../lib/format";
import { t } from "../../lib/i18n";
import { runOutcomeLabel, runPurposeLabel } from "../../lib/labels";
import { ask } from "../../lib/native";
import { go } from "../../lib/nav";
import { act, state, toast } from "../../lib/store";
import { CriterionRow } from "./CriterionRow";

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

export function GoalBlocks(props: { d: GoalDetail; hasDecision: boolean; undoable: boolean; onUndoRollback: () => void }) {
  const d = () => props.d;
  const g = () => d().summary;
  // You changed the workspace after the last verification (an undone hunk, a rollback, an edit): the next step is to verify again.
  const editedSinceVerify = () => editable(g().state) && d().criteria.some((c) => c.verified?.stale);
  // Criteria that pass only with the agent's edits to existing tests make their "criterion met" claims inconsistent.
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
      {/* After your own edit of a verified goal the next step is fixed: verify again. Ready to accept, that is the page's one primary action;
          paused, the header's "resume" (or the decision card) already is, so the button here is a plain one and the sentence says what resuming does.
          A goal that was never verified has nothing to verify "again": no block. The way back from a rollback lives on the runs section.
          With a decision card on the page the card's first option is the one primary action, whatever the state: the block's button steps back. */}
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

      {/* Ready to accept: the next step is yours, in one line. */}
      <Show when={g().state === "in_review" && !editedSinceVerify()}>
        <Section title={t("goal.next")}>
          <div class="section-cta">
            <Button variant={props.hasDecision ? "default" : "primary"} size="s" kbd="r" onClick={() => go({ name: "review", id: g().id })}>
              {t("goal.reviewUnits", { n: g().diffstat?.files ?? 0 })}
            </Button>
            <span class="meta">{discountedOf(d().criteria) > 0 ? t("goal.reviewCtaTampered") : g().verified_pin ? t("goal.reviewCtaVerified") : t("goal.reviewCtaUnverified")}</span>
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
        <For each={d().criteria}>{(c) => <CriterionRow goalId={g().id} c={c} state={g().state} base={d().base_commit} />}</For>
        {/* Without held-out tests nothing beyond the visible ones can catch work fitted to them: said once, quietly, with the way to set them. */}
        <Show when={!d().has_held_out_tests && g().progress.machine > 0}>
          <p class="meta held-out-none">
            <NoticeMark />
            <span>{t("goal.noHeldOut")}</span>
            <button class="link-quiet text-btn" onClick={() => go({ name: "settings" })}>
              {t("goal.setHeldOut")}
              <Icon name="chevron-right" size={10} />
            </button>
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
              {t("goal.openChanges")} <Icon name="chevron-right" size={10} />
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
          {/* The change readout has its own grid: nothing here is a criterion. */}
          <div class="changes-row num meta">
            <span />
            <span />
            <span class="t1">
              <span class="diff-add">+{count(g().diffstat!.additions)}</span> <span class="diff-del">−{count(g().diffstat!.deletions)}</span>
              <span class="sep">·</span>
              <span class="t2">{t("common.files", { n: g().diffstat!.files })}</span>
              <span class="sep">·</span>
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

      {/* A decision card already says what happens next; the block would only repeat it. */}
      <Show when={!settled() && !props.hasDecision}>
        <Section title={t("goal.next")}>
          <Show when={next()} fallback={<Empty title={t("goal.noNext")} inline>{g().state === "running" ? t("goal.noNextRunning") : t("goal.noNextIdle")}</Empty>}>
            <Claim>{next()!.text}</Claim>
          </Show>
        </Section>
      </Show>

      <Show when={ledger().length}>
        <Section title={t("goal.ledger")} minor>
          <For each={ledger()}>{(c) => <LedgerRow c={c} testDependent={!!c.criterion && testDependent().has(c.criterion)} />}</For>
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
              {/* A rollback that can still be undone is said here, where the runs are, with its one way back; no block of its own. */}
              <Show when={props.undoable}>
                <span class="row" style={{ gap: "var(--sp-2)" }}>
                  <span class="t2">{t("goal.rolledBackState")}</span>
                  <button class="link-plain text-btn t3" onClick={props.onUndoRollback} title={t("goal.undoRollback")}>
                    <Icon name="undo" size={10} />
                    {t("goal.undoRollback")}
                  </button>
                </span>
              </Show>
              {/* The rollback shows on hover of a row; the heading says so, for the keyboard and the eye. */}
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

/** A line of a sentinel's detail that came out of a machine: a path, a command, a runner's indented line. */
const MACHINE_DETAIL = /^(\s{2,}|[~./]|[\w@.-]+(\/[\w@.-]+)+|\S+\.(js|ts|tsx|jsx|mjs|cjs|py|rs|go|rb|json|ya?ml|toml|lock|sh|txt|snap)\b)/;

/**
 * A sentinel's detail, line by line in the honesty grammar: the supervisor's
 * sentences (why repeated refusals matter, which criteria the canary could not
 * check) in the UI face, wrapping at words; the paths and lines that triggered
 * it in mono, breaking anywhere. One register per line, never per sentinel.
 */
export function SentinelDetail(props: { text: string }) {
  const lines = () => props.text.split("\n").filter((l, i, all) => l.trim() !== "" || (i > 0 && i < all.length - 1));
  return (
    <div class="sentinel-detail">
      <For each={lines()}>{(line) => <span class={MACHINE_DETAIL.test(line) ? "sentinel-machine code-val" : "sentinel-prose"}>{line || " "}</span>}</For>
    </div>
  );
}

/** One run; while the goal is paused or in review the workspace can be put back to where it started. */
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
    // The way back rides on the receipt: a slip costs one click.
    if (done !== undefined) toast("success", t("goal.rolledBack", { n: r().run_no }), { ttl: 8000, action: { label: t("goal.undoRollback"), run: props.onUndo } });
  };
  return (
    <div class="run-row meta">
      <span class="num t1">R-{String(r().run_no).padStart(2, "0")}</span>
      <span>{runPurposeLabel(r().purpose)}</span>
      <span class="num">{clock(r().started_at)}</span>
      <span class="col-dur">{r().ended_at ? duration(r().ended_at! - r().started_at) : ""}</span>
      <span class="run-outcome row" style={{ "justify-content": "flex-end" }}>
        {/* Only runs that recorded their starting snapshot can be rolled back to. */}
        <Show when={props.editable && r().ended_at && r().start_pin}>
          <button class="link-plain text-btn run-rollback t3" onClick={() => void rollback()} title={t("goal.rollbackTitle")}>
            <Icon name="undo" size={10} /> {t("goal.rollback")}
          </button>
        </Show>
        <span>{r().ended_at ? runOutcomeLabel(r().outcome) : t("goal.inProgress")}</span>
      </span>
    </div>
  );
}

function LedgerRow(props: { c: ClaimView; testDependent?: boolean }) {
  // A claim about a criterion that passes only with edited tests is contradicted by that measurement, whatever the linked fact says.
  const value = () => (props.testDependent ? "contradicted" : props.c.consistency);
  const evidence = () => (props.testDependent ? t("goal.dependsOnEditedTestsLong") : props.c.evidence);
  // A refuted claim is not set as heavily as one that stands: its kind label steps back a register.
  return (
    <Claim bare dim={value() === "contradicted"} kind={t("claimKind.criterion_met")} aside={<ConsistencyBadge value={value()} evidence={evidence()} />}>
      <Show when={props.c.criterion}>
        <span class="num t3">{props.c.criterion} </span>
      </Show>
      {props.c.text}
      <Show when={evidence()}>
        <div class="ledger-evidence meta">
          <Icon name="return" size={10} />
          {evidence()}
        </div>
      </Show>
    </Claim>
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
