/**
 * The review's three sheets: the verification readout (E), accepting, and
 * requesting changes. Each is an `Overlay` opened from the keyboard, so none
 * animates in.
 */
import { For, Show, createEffect, createSignal, on, onCleanup } from "solid-js";

import { GitIdentityForm } from "../../components/GitIdentity";
import { DangerMark, Icon, NoticeMark, ResultMark, Seal } from "../../components/Glyph";
import { BaselineLine, CanaryLine, CriteriaBar, HeldOutLine, ObsChip, discountedOf } from "../../components/Honesty";
import { LookStrip } from "../../components/Look";
import { Button, Empty, IconButton, Loading, Overlay } from "../../components/ui";
import type { CriterionView } from "../../gen/CriterionView";
import type { GoalDetail } from "../../gen/GoalDetail";
import { api } from "../../lib/api";
import { ago, duration, short } from "../../lib/format";
import { t } from "../../lib/i18n";
import { hasIssue } from "../../lib/labels";
import { back } from "../../lib/nav";
import type { Draft } from "../../lib/reviewState";
import { suggestionOf, withoutSuggestion } from "../../lib/suggest";
import { act, state, toast } from "../../lib/store";
import { toComment } from "./types";

/** Lines of an output tail shown before it folds: the exit code and the runner's last three, so four criteria and their pictures fit one screen. */
const TAIL_LINES = 4;

/** An output tail that folds after four lines, with a line saying how much more there is. */
function OutputTail(props: { text: string }) {
  const [all, setAll] = createSignal(false);
  const lines = () => props.text.split("\n");
  const extra = () => lines().length - TAIL_LINES;
  const folded = () => extra() > 0 && !all();
  return (
    <>
      <pre class="output-tail verify-tail" classList={{ folded: folded() }}>
        {props.text}
      </pre>
      <Show when={extra() > 0}>
        <Button size="s" variant="ghost" class="verify-more" onClick={() => setAll((a) => !a)} aria-expanded={all()}>
          {all() ? t("review.fewerLines") : t("review.moreLines", { n: extra() })}
        </Button>
      </Show>
    </>
  );
}

/** Whether a scrolling sheet has more below the fold; re-read on scroll and whenever its content changes. */
function useMoreBelow(): [() => boolean, (el: HTMLDivElement) => void, () => void] {
  const [more, setMore] = createSignal(false);
  let el: HTMLDivElement | undefined;
  const measure = () => el && setMore(el.scrollHeight - el.scrollTop - el.clientHeight > 8);
  const bind = (panel: HTMLDivElement) => {
    el = panel;
    panel.addEventListener("scroll", measure, { passive: true });
    measure();
  };
  onCleanup(() => el?.removeEventListener("scroll", measure));
  return [more, bind, () => requestAnimationFrame(measure)];
}

/** Every criterion with its last verifier reading and output tail, in one sheet. */
export function VerifyPanel(props: { id: string; detail: GoalDetail | undefined; loading: boolean; onClose: () => void }) {
  const g = () => state.goals[props.id];
  // The pictures first: a look criterion's reading is its two screenshots — the one thing in the sheet you judge by eye — so
  // they stand above the output tails instead of a screen below them; every row keeps its id, so nothing is lost in the order.
  const criteria = () => {
    const all = props.detail?.criteria ?? [];
    return [...all.filter((c) => c.criterion.kind.type === "look"), ...all.filter((c) => c.criterion.kind.type !== "look")];
  };
  const mark = (c: CriterionView) => (!c.verified ? "pending" : c.verified.stale ? "stale" : c.verified.passed ? "pass" : "fail");
  // The sheet is taller than the window on a goal with several criteria: a fade at its foot says there is more, and leaves once you are there.
  const [more, bindPanel, remeasure] = useMoreBelow();
  createEffect(on(() => [props.loading, criteria().length], remeasure, { defer: true }));
  return (
    <Overlay onClose={props.onClose} label={t("review.verifyTitle", { id: props.id })} title={t("review.verifyTitle", { id: props.id })} instant initialFocus="panel" class="panel panel-wide" panelRef={bindPanel}>
      <div class="verify-head">
        <div class="row">
          <Show when={g()?.verified_pin} fallback={<span class="meta">{t("review.noMachine")}</span>}>
            <Seal pin={g()!.verified_pin} large tampered={discountedOf(criteria()) > 0} />
          </Show>
          <span class="grow" />
          <Show when={g()}>
            <CriteriaBar progress={g()!.progress} criteria={criteria()} compact />
          </Show>
        </div>
        <p class="meta t3">{t("review.verifyExplain")}</p>
      </div>
      <Show when={!props.loading} fallback={<Loading />}>
        <div class="verify-list">
          <For each={criteria()} fallback={<Empty title={t("goal.noCriteria")} inline />}>
            {(c) => (
              <div class="verify-item">
                <div class="criterion-row">
                  <Show when={c.criterion.kind.type === "exec"} fallback={<ResultMark kind={c.human_checked ? "obs-pass" : "pending"} title={c.human_checked ? t("goal.youChecked") : t("goal.awaitingCheck")} />}>
                    <ResultMark kind={mark(c)} />
                  </Show>
                  <span class="num t3">{c.criterion.id}</span>
                  <span class="criterion-main">
                    <span class="criterion-title">{c.criterion.title}</span>
                    <Show when={c.criterion.kind.type === "exec"}>
                      <code class="criterion-cmd code-val">{(c.criterion.kind as { command: string }).command}</code>
                    </Show>
                    <Show when={c.criterion.kind.type === "look"}>
                      <code class="criterion-cmd code-val">{(c.criterion.kind as { url: string }).url}</code>
                    </Show>
                  </span>
                  <Show
                    when={c.verified}
                    fallback={
                      <span class="col-span t3">
                        {c.criterion.kind.type !== "exec" ? (c.human_checked ? t("goal.youChecked") : t("goal.awaitingCheck")) : t("goal.awaitingVerify")}
                      </span>
                    }
                  >
                    {(v) => (
                      <>
                        <span class="col-result">
                          <span class="sr-only">{t("honesty.srVerified")} </span>
                          {v().passed ? t("common.passed") : t("common.failed")}
                        </span>
                        <span class="col-dur">{duration(v().duration_ms)}</span>
                        <span class="col-pin">
                          <Icon name="harness" size={10} />@{short(v().pin)}
                        </span>
                        <span class="col-age">{ago(v().at, state.now)}</span>
                      </>
                    )}
                  </Show>
                </div>
                <BaselineLine c={c} base={props.detail?.base_commit} />
                <CanaryLine c={c} />
                <HeldOutLine c={c} />
                <Show when={c.look}>{(l) => <LookStrip look={l()} title={`${c.criterion.id} ${c.criterion.title}`} />}</Show>
                <Show when={c.observed}>
                  <div class="criterion-row criterion-obs">
                    <ResultMark kind={c.observed!.passed ? "obs-pass" : "obs-fail"} />
                    <span />
                    <span />
                    <span class="col-span">
                      <ObsChip title={t("goal.observedTitle")} />
                      <span>{c.observed!.passed ? t("common.passed") : t("common.failed")}</span>
                      <span class="col-age">{ago(c.observed!.at, state.now)}</span>
                    </span>
                  </div>
                </Show>
                <Show when={c.verified}>
                  {(v) => <OutputTail text={`${t("common.exitCode", { code: v().exit_code ?? "—" })}\n${v().output_tail || t("common.noOutput")}`} />}
                </Show>
              </div>
            )}
          </For>
        </div>
      </Show>
      <div class="panel-more" classList={{ on: more() }} aria-hidden="true" />
      <div class="panel-actions">
        <Button variant="ghost" onClick={props.onClose}>
          {t("common.close")}
        </Button>
      </div>
    </Overlay>
  );
}

export interface AcceptPanelProps {
  id: string;
  /** Review units marked viewed, of the total. */
  viewed: number;
  total: number;
  detail: GoalDetail | undefined;
  onHumanCheck: (criterion: string, v: boolean) => void;
  onClose: () => void;
  onDone: () => void;
  /** Where to go once accepted: the queue's next review, or back. Defaults to back. */
  onFinish?: () => void;
}

/**
 * Accepting: what the verifier measured, what you still have to check off,
 * what is still open (sentinels, assumptions, unviewed units), and the branch.
 */
export function AcceptPanel(props: AcceptPanelProps) {
  const [busy, setBusy] = createSignal(false);
  const g = () => state.goals[props.id];
  // Human and "look" criteria are both yours to check off; a look one brings its before/after pictures along.
  const humans = () => props.detail?.criteria.filter((c) => c.criterion.kind.type !== "exec") ?? [];
  // An unchecked human criterion blocks too, but says so on its own row; only the goal's state needs a sentence.
  const unchecked = () => humans().filter((h) => !h.human_checked).length;
  // Without a git identity the accepted commit would have no author: set it here, for this repository by default.
  const identityMissing = () => hasIssue(state.env, "git_identity_missing");
  const blockers = () => {
    const b: string[] = [];
    if (g()?.state !== "in_review") b.push(t("review.notInReview"));
    if (identityMissing()) b.push(t("review.identityMissing"));
    return b;
  };
  const blocked = () => blockers().length > 0 || unchecked() > 0;
  // A pass with a tampered canary is not evidence: it leaves the verified count, withholds the seal, and is the first thing still open.
  const tampered = () => props.detail?.criteria.filter((c) => c.canary === "tampered") ?? [];
  const counted = () => Math.max(0, (g()?.progress.machine ?? 0) - tampered().length);
  /** Still open, not blocking: you may accept, but you see them first. */
  const open = () => {
    const items: { danger?: boolean; text: string }[] = [];
    for (const c of tampered()) items.push({ danger: true, text: t("review.openTampered", { id: c.criterion.id }) });
    for (const c of props.detail?.claims ?? []) if (c.kind === "assumption" && c.approved === null) items.push({ text: t("review.openAssumption", { text: c.text }) });
    for (const h of props.detail?.sentinels ?? []) items.push({ danger: h.severity >= 3, text: t("review.openSentinel", { title: h.title }) });
    if (props.total - props.viewed > 0) items.push({ text: t("review.openUnviewed", { n: props.total - props.viewed }) });
    return items;
  };
  // A pushed branch already exists: accepting adds a commit on it rather than writing a new one.
  const updating = () => !!g()?.pr || (!!g()?.branch && g()?.state === "in_review" && !!props.detail?.runs.some((r) => r.purpose === "ci_fix"));
  // The branch acceptance writes (or, when one exists, updates): the supervisor names it ahead of time.
  const branchName = () => g()?.branch || props.detail?.branch_preview || null;
  const accept = async () => {
    setBusy(true);
    const branch = await act(() => api.accept(props.id));
    setBusy(false);
    if (branch) {
      props.onDone();
      props.onClose();
      (props.onFinish ?? back)();
    }
  };
  return (
    <Overlay onClose={props.onClose} label={t("review.acceptTitle", { id: props.id })} title={t("review.acceptTitle", { id: props.id })} instant initialFocus="panel">
      <div class="panel-section">
        <div class="fact-row">
          <Show when={g()?.progress.machine} fallback={<span class="meta">{t("review.noMachine")}</span>}>
            <Seal pin={g()!.verified_pin} large tampered={tampered().length > 0} />
            <span class="meta">
              {tampered().length > 0 ? t("review.allPassedDiscounted", { v: counted(), n: g()!.progress.machine, d: tampered().length }) : t("review.allPassed", { n: g()!.progress.machine })}
            </span>
          </Show>
          {/* Every unit viewed is said once, here; anything unviewed is listed below as still open. */}
          <Show when={props.total > 0 && props.viewed === props.total}>
            <span class="sep">·</span>
            <span class="meta num">{t("review.viewedAll", { n: props.total })}</span>
          </Show>
        </div>
        <For each={humans()}>
          {(h) => (
            <>
              <label class="fact-row">
                <input type="checkbox" checked={h.human_checked} onChange={(e) => props.onHumanCheck(h.criterion.id, e.currentTarget.checked)} />
                <span class="num t3">{h.criterion.id}</span>
                <span class="grow">{h.criterion.title}</span>
                <Show when={!h.human_checked}>
                  <span class="meta t3 panel-awaiting">{t("goal.awaitingCheck")}</span>
                </Show>
              </label>
              <Show when={h.look}>{(l) => <LookStrip look={l()} title={`${h.criterion.id} ${h.criterion.title}`} />}</Show>
            </>
          )}
        </For>
      </div>
      <Show when={open().length}>
        <div class="panel-section">
          <div class="meta t3">{t("review.stillOpen")}</div>
          <For each={open()}>
            {(o) => (
              <div class="row meta t1">
                <Show when={o.danger} fallback={<NoticeMark />}>
                  <DangerMark />
                </Show>
                <span class="grow">{o.text}</span>
              </div>
            )}
          </For>
        </div>
      </Show>
      <div class="panel-section meta">
        <p>{updating() ? t("review.acceptUpdateExplain") : t("review.acceptExplain")}</p>
        <dl class="panel-branch">
          <dt>{t("goal.branch")}</dt>
          <dd>
            <Show when={branchName()} fallback={<span class="t3">{t("review.branchNote")}</span>}>
              {(name) => (
                <>
                  {name()}
                  <IconButton
                    icon="copy"
                    size={22}
                    label={t("goal.copyBranch")}
                    onClick={() => {
                      void navigator.clipboard.writeText(name());
                      toast("success", t("common.copied"));
                    }}
                  />
                </>
              )}
            </Show>
          </dd>
        </dl>
      </div>
      <Show when={blockers().length}>
        <div class="panel-blockers" role="alert">
          <For each={blockers()}>{(b) => <div>■ {b}</div>}</For>
          <Show when={identityMissing() && g()}>
            {(goal) => <GitIdentityForm projectId={goal().project_id} projectName={goal().project_name} />}
          </Show>
        </div>
      </Show>
      <div class="panel-actions">
        <Button variant="ghost" onClick={props.onClose}>
          {t("common.cancel")}
        </Button>
        <Button variant="primary" busy={busy()} disabled={blocked()} title={unchecked() > 0 ? t("review.humanUnchecked", { id: humans().filter((h) => !h.human_checked).map((h) => h.criterion.id).join(", ") }) : undefined} onClick={accept}>
          {updating() ? t("review.acceptUpdate") : t("review.acceptWrite")}
        </Button>
      </div>
    </Overlay>
  );
}

export function ChangesPanel(props: { id: string; comments: Draft[]; onClose: () => void; onSent: () => void; onRemove: (i: number) => void; onFinish?: () => void }) {
  const [summary, setSummary] = createSignal("");
  const [busy, setBusy] = createSignal(false);
  const send = async () => {
    setBusy(true);
    const ok = await act(() => api.requestChanges(props.id, summary(), props.comments.map(toComment)), t("review.sentBack"));
    setBusy(false);
    if (ok !== undefined) {
      props.onSent();
      props.onClose();
      (props.onFinish ?? back)();
    }
  };
  return (
    <Overlay onClose={props.onClose} label={t("review.requestChanges")} title={t("review.requestChanges")} instant>
      <textarea class="panel-text" rows={3} aria-label={t("review.summaryPlaceholder")} placeholder={t("review.summaryPlaceholder")} value={summary()} onInput={(e) => setSummary(e.currentTarget.value)} />
      <div class="panel-section">
        <For each={props.comments} fallback={<p class="meta">{t("review.noInline")}</p>}>
          {(c, i) => (
            <div class="fact-row">
              <span class="mono t2">
                {c.path}
                {c.old ? ` ${t("review.oldLine", { n: c.old })}` : c.line ? `:${c.line}` : ""}
              </span>
              <span class="grow">
                {withoutSuggestion(c.text) || c.text}
                <Show when={suggestionOf(c.text) !== null}>
                  <span class="t3"> · {t("review.suggestion")}</span>
                </Show>
              </span>
              <IconButton icon="cross" size={22} label={t("common.delete")} onClick={() => props.onRemove(i())} />
            </div>
          )}
        </For>
      </div>
      <div class="panel-actions">
        <Button variant="ghost" onClick={props.onClose}>
          {t("common.cancel")}
        </Button>
        <Button variant="primary" busy={busy()} disabled={!summary().trim() && !props.comments.length} onClick={send}>
          {t("review.sendBack")}
        </Button>
      </div>
    </Overlay>
  );
}
