/**
 * The review's three sheets: the verification readout (E), accepting, and
 * requesting changes. Each is an `Overlay` opened from the keyboard, so none
 * animates in.
 */
import { For, Show, createEffect, createSignal, on, onCleanup } from "solid-js";

import { ARM_MS } from "../../components/DecisionCard";
import { GitIdentityForm } from "../../components/GitIdentity";
import { DangerMark, Icon, NeedsYouMark, NotEvidenceMark, NoticeMark, ResultMark, Seal } from "../../components/Glyph";
import { BaselineLine, CanaryLine, CriteriaBar, HeldOutLine, LoopbackLine, ObsChip, discountedOf } from "../../components/Honesty";
import { LookStrip } from "../../components/Look";
import { Button, Empty, IconButton, Loading, Overlay, Prose } from "../../components/ui";
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

/** The verification readout's order: look criteria, then not-evidence, failed, stale, pending (human ones awaiting you among them), passed. */
export function readoutOrder(all: CriterionView[], mark: (c: CriterionView) => "pending" | "stale" | "pass" | "fail"): CriterionView[] {
  const rank = (c: CriterionView) => {
    if (c.criterion.kind.type === "look") return 0;
    if (c.criterion.kind.type !== "exec") return c.human_checked ? 5 : 4;
    const m = mark(c);
    if (m === "pass") return c.canary === "tampered" ? 1 : 5;
    return m === "fail" ? 2 : m === "stale" ? 3 : 4;
  };
  return all.map((c, i) => ({ c, i, r: rank(c) })).sort((a, b) => a.r - b.r || a.i - b.i).map((x) => x.c);
}

/** Every criterion with its last verifier reading and output tail, in one sheet. */
export function VerifyPanel(props: { id: string; detail: GoalDetail | undefined; loading: boolean; onClose: () => void }) {
  const g = () => state.goals[props.id];
  const mark = (c: CriterionView) => (!c.verified ? "pending" : c.verified.stale ? "stale" : c.verified.passed ? "pass" : "fail");
  // What most needs your eye, first. The pictures lead: a look criterion's reading is its two screenshots, the one thing
  // here you judge by eye. Then a pass that is not evidence and a failure, then what is stale or not yet run, and the
  // passes last. Every row keeps its id, and the order inside a rank is the contract's, so nothing is lost in the order.
  const criteria = () => readoutOrder(props.detail?.criteria ?? [], mark);
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
                    <Show when={c.canary === "tampered" && mark(c) === "pass"} fallback={<ResultMark kind={mark(c)} />}>
                      <NotEvidenceMark />
                    </Show>
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
                <LoopbackLine c={c} />
                <Show when={c.look}>{(l) => <LookStrip look={l()} title={`${c.criterion.id} ${c.criterion.title}`} />}</Show>
                <Show when={c.observed}>
                  <div class="criterion-row criterion-obs">
                    <ResultMark kind={c.observed!.passed ? "obs-pass" : "obs-fail"} />
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

/** A thing still open at accepting: red ones need your judgement; a sentinel's line is its sentence, under the group's name. */
interface OpenItem {
  danger?: boolean;
  /** A pass that is not evidence: the ◆ it wears on the goal page, the readout and the board, never the sentinel's red ■. */
  notEvidence?: boolean;
  text: string;
  sentinel?: boolean;
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
    const items: OpenItem[] = [];
    for (const c of tampered()) items.push({ danger: true, notEvidence: true, text: t("review.openTampered", { id: c.criterion.id }) });
    for (const c of props.detail?.claims ?? []) if (c.kind === "assumption" && c.approved === null) items.push({ text: t("review.openAssumption", { text: c.text }) });
    if (props.total - props.viewed > 0) items.push({ text: t("review.openUnviewed", { n: props.total - props.viewed }) });
    // The sentinels last in their group, under their name said once.
    for (const h of props.detail?.sentinels ?? []) items.push({ danger: h.severity >= 3, text: h.title, sentinel: true });
    return items;
  };
  const OpenList = (p: { items: OpenItem[]; danger: boolean }) => (
    <For each={p.items}>
      {(o, i) => (
        <>
          <Show when={i() === p.items.findIndex((x) => x.sentinel)}>
            <div class="open-kind">{t("review.sentinels")}</div>
          </Show>
          <div class="row meta t1">
            <Show when={p.danger} fallback={<NoticeMark />}>
              <Show when={o.notEvidence} fallback={<DangerMark />}>
                <NeedsYouMark title={t("honesty.notEvidence")} />
              </Show>
            </Show>
            <span class="grow">
              <Prose text={o.text} />
            </span>
          </div>
        </>
      )}
    </For>
  );
  // Red items above — a pass that is not evidence, a high-severity sentinel — do not block, but they are not one press away
  // either: the primary reads "Accept anyway" and arms on the first press, as Abandon does, saying how many it is over.
  const judgement = () => open().filter((o) => o.danger);
  const notice = () => open().filter((o) => !o.danger);
  const [armedUntil, setArmedUntil] = createSignal(0);
  const [now, setNow] = createSignal(Date.now());
  const ticker = window.setInterval(() => armedUntil() && setNow(Date.now()), 200);
  onCleanup(() => clearInterval(ticker));
  const armedLeft = () => (armedUntil() > now() ? Math.ceil((armedUntil() - now()) / 1000) : 0);
  const press = () => {
    if (judgement().length && !armedLeft()) {
      // One reading of the clock: two could straddle a millisecond and count a second too many.
      const at = Date.now();
      setNow(at);
      setArmedUntil(at + ARM_MS);
      return;
    }
    setArmedUntil(0);
    void accept();
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
        {/* The verdict is the sheet's masthead: the seal set as a stamp on a line of its own — Tower's one loud moment, it
            presses in once as the sheet opens — and what it stands on, in one quiet line under it. */}
        <div class="accept-verdict">
          <Show
            when={g()?.progress.machine}
            fallback={
              <span class="meta accept-basis">
                {t("review.noMachine")}
                <Show when={props.total > 0 && props.viewed === props.total}>
                  <span class="num accept-viewed">{t("review.viewedAll", { n: props.total })}</span>
                </Show>
              </span>
            }
          >
            <span class="accept-stamp">
              <Seal pin={g()!.verified_pin} large tampered={tampered().length > 0} />
            </span>
            <span class="meta accept-basis">
              {tampered().length > 0 ? t("review.allPassedDiscounted", { v: counted(), n: g()!.progress.machine, d: tampered().length }) : t("review.allPassed", { n: g()!.progress.machine })}
              {/* Every unit viewed is said once, here; anything unviewed is listed below as still open. */}
              <Show when={props.total > 0 && props.viewed === props.total}>
                <span class="num accept-viewed">{t("review.viewedAll", { n: props.total })}</span>
              </Show>
            </span>
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
      {/* What is still open, by weight: what is not evidence or needs your judgement first, what to look at after. */}
      <Show when={judgement().length}>
        <div class="panel-section open-judgement">
          <div class="meta t3">{t("review.openJudgementTitle")}</div>
          <OpenList items={judgement()} danger />
        </div>
      </Show>
      <Show when={notice().length}>
        <div class="panel-section open-notice">
          <div class="meta t3">{judgement().length ? t("review.openNoticeTitle") : t("review.stillOpen")}</div>
          <OpenList items={notice()} danger={false} />
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
          {/* What keeps the button off is a "not yet", nobody's failure: the ◇ the missing identity wears in Settings and on
              the welcome page, never the red ■ of a verifier's or a sentinel's finding. */}
          <For each={blockers()}>
            {(b) => (
              <div class="panel-blocker">
                <NoticeMark />
                <span>{b}</span>
              </div>
            )}
          </For>
          <Show when={identityMissing() && g()}>
            {(goal) => <GitIdentityForm projectId={goal().project_id} projectName={goal().project_name} />}
          </Show>
        </div>
      </Show>
      <div class="panel-actions">
        <Button variant="ghost" onClick={props.onClose}>
          {t("common.cancel")}
        </Button>
        <Button
          variant="primary"
          class={armedLeft() ? "armed" : ""}
          busy={busy()}
          disabled={blocked()}
          title={unchecked() > 0 ? t("review.humanUnchecked", { id: humans().filter((h) => !h.human_checked).map((h) => h.criterion.id).join(", ") }) : judgement().length ? t("decision.pressTwice") : undefined}
          aria-live={armedLeft() ? "polite" : undefined}
          onClick={press}
        >
          <Show when={judgement().length} fallback={updating() ? t("review.acceptUpdate") : t("review.acceptWrite")}>
            {armedLeft() ? t("review.acceptArmed") : t("review.acceptAnyway")}
          </Show>
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
