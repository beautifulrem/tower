/**
 * The review's three sheets:
 * 1. `VerifyPanel` (E): every criterion with verifier reading, flaky/console
 *    badges, screenshots, and folded output tails.
 * 2. `AcceptPanel` (⌘⇧↩): physical Acceptance Seal + 4-point pre-flight seal
 *    checklist (fresh snapshot, high sentinels, human criteria, merge overlap),
 *    two-press arming when red items stand open, and local branch seal.
 * 3. `ChangesPanel` (C): structured Steering Dispatch tray with ⌘↩ dispatch.
 */
import { For, Show, createSignal, onCleanup } from "solid-js";

import { ARM_MS } from "../../components/DecisionCard";
import { GitIdentityForm } from "../../components/GitIdentity";
import { DangerMark, Icon, NeedsYouMark, NotEvidenceMark, NoticeMark, ResultMark, Seal, Stamp } from "../../components/Glyph";
import { BaselineLine, CanaryLine, HeldOutLine, LoopbackLine, ObsChip } from "../../components/Honesty";
import { CriteriaBar } from "../../components/HonestyCore";
import { LookStrip } from "../../components/Look";
import { Button, Empty, IconButton, Loading, Overlay, Prose } from "../../components/ui";
import type { CriterionView } from "../../gen/CriterionView";
import type { GoalDetail } from "../../gen/GoalDetail";
import { api } from "../../lib/api";
import { ago, duration, short } from "../../lib/format";
import { notEvidence } from "../../lib/discounted";
import { locale, t } from "../../lib/i18n";
import { hasIssue } from "../../lib/labels";
import { back } from "../../lib/nav";
import type { Draft } from "../../lib/reviewState";
import { suggestionOf, withoutSuggestion } from "../../lib/suggest";
import { act, state, toast } from "../../lib/store";
import { type ExtCriterionView, qualifiers } from "../goal/ext";
import { toComment } from "./types";

const TAIL_LINES = 4;

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

export function VerifyPanel(props: { id: string; detail: GoalDetail | undefined; loading: boolean; onClose: () => void }) {
  const g = () => state.goals[props.id];
  const mark = (c: CriterionView) => (!c.verified ? "pending" : c.verified.stale ? "stale" : c.verified.passed ? "pass" : "fail");
  const criteria = () => readoutOrder(props.detail?.criteria ?? [], mark);
  return (
    <Overlay onClose={props.onClose} closeKey="e" label={t("review.verifyTitle", { id: props.id })} title={t("review.verifyTitle", { id: props.id })} instant initialFocus="panel" class="panel panel-wide">
      <div class="verify-head">
        <div class="row">
          <Show when={g()?.verified_pin} fallback={<span class="meta">{t("review.noMachine")}</span>}>
            <Seal pin={g()!.verified_pin} large tampered={notEvidence(g())} />
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
            {(raw) => {
              const c = raw as ExtCriterionView;
              const pills = () => qualifiers(c, props.detail?.sentinels).filter((p) => !p[3]);
              return (
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
                  {/* What qualifies the reading, as the goal page's open row says it: the pills whose fact has no line of its own below. */}
                  <Show when={pills().length}>
                    <div class="ev-strip">
                      <For each={pills()}>{([tone, label, title]) => <span class={`ev-pill ev-pill-${tone}`} data-mark={tone} title={title}>{label}</span>}</For>
                    </div>
                  </Show>
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
              );
            }}
          </For>
        </div>
      </Show>
      <div class="panel-actions">
        <Button variant="ghost" onClick={props.onClose}>
          {t("common.close")}
        </Button>
      </div>
    </Overlay>
  );
}

interface OpenItem {
  danger?: boolean;
  notEvidence?: boolean;
  text: string;
  sentinel?: boolean;
}

export interface AcceptPanelProps {
  id: string;
  viewed: number;
  total: number;
  detail: GoalDetail | undefined;
  onHumanCheck: (criterion: string, v: boolean) => void;
  onClose: () => void;
  onDone: () => void;
  onFinish?: () => void;
}

// A clear check is neutral: green is the verifier's word, and these are Tower's own checks and yours. An overlap is
// worth noticing (◇, as on the goal page), not a decision.
const SEAL_MARK = { ok: () => <Icon name="check" size={10} />, warn: () => <NeedsYouMark />, notice: () => <NoticeMark />, danger: () => <DangerMark /> };

export function AcceptPanel(props: AcceptPanelProps) {
  const [busy, setBusy] = createSignal(false);
  const g = () => state.goals[props.id];
  const humans = () => props.detail?.criteria.filter((c) => c.criterion.kind.type !== "exec") ?? [];
  const unchecked = () => humans().filter((h) => !h.human_checked).length;
  const identityMissing = () => hasIssue(state.env, "git_identity_missing");
  const blockers = () => {
    const b: string[] = [];
    if (g()?.state !== "in_review") b.push(t("review.notInReview"));
    if (identityMissing()) b.push(t("review.identityMissing"));
    return b;
  };
  const blocked = () => blockers().length > 0 || unchecked() > 0;
  const uncheckedIds = () => humans().filter((h) => !h.human_checked).map((h) => h.criterion.id).join(", ");
  /** Why the button is disabled, said beside it — not only in its tooltip — and one click from the first thing to fix. */
  const reasons = () => [
    ...(g()?.state !== "in_review" ? [t("review.notInReview")] : []),
    ...(identityMissing() ? [t("review.identityShort")] : []),
    ...(unchecked() ? [t("review.humanUnchecked", { id: uncheckedIds() })] : []),
  ];
  const toBlocker = () => {
    const el = document.querySelector<HTMLElement>(".panel .panel-blockers input, .panel .fact-row input:not(:checked)");
    el?.scrollIntoView({ block: "center" });
    el?.focus();
  };
  const tampered = () => props.detail?.criteria.filter((c) => c.canary === "tampered") ?? [];
  const counted = () => Math.max(0, (g()?.progress.machine ?? 0) - tampered().length);
  const highSentinels = () => (props.detail?.sentinels ?? []).filter((h) => h.severity >= 3);
  const staleCount = () => (props.detail?.criteria ?? []).filter((c) => c.verified?.stale).length;
  const overlaps = () => g()?.overlaps ?? [];
  const snapshotFresh = () => !!g()?.verified_pin && staleCount() === 0 && tampered().length === 0;

  const open = () => {
    const items: OpenItem[] = [];
    for (const c of tampered()) items.push({ danger: true, notEvidence: true, text: t("review.openTampered", { id: c.criterion.id }) });
    for (const c of props.detail?.claims ?? []) if (c.kind === "assumption" && c.approved === null) items.push({ text: t("review.openAssumption", { text: c.text }) });
    if (props.total - props.viewed > 0) items.push({ text: t("review.openUnviewed", { n: props.total - props.viewed }) });
    for (const h of props.detail?.sentinels ?? []) items.push({ danger: h.severity >= 3, text: h.title, sentinel: true });
    return items;
  };
  // "Sentinels" is said once in the sheet, over the first group that has any (the high ones, when there are).
  const OpenList = (p: { items: OpenItem[]; danger: boolean; named?: boolean }) => (
    <For each={p.items}>
      {(o, i) => (
        <>
          <Show when={!p.named && i() === p.items.findIndex((x) => x.sentinel)}>
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
  const judgement = () => open().filter((o) => o.danger);
  const notice = () => open().filter((o) => !o.danger);
  const [armedUntil, setArmedUntil] = createSignal(0);
  const [now, setNow] = createSignal(Date.now());
  const ticker = window.setInterval(() => armedUntil() && setNow(Date.now()), 200);
  onCleanup(() => clearInterval(ticker));
  const armedLeft = () => (armedUntil() > now() ? Math.ceil((armedUntil() - now()) / 1000) : 0);
  const press = () => {
    if (judgement().length && !armedLeft()) {
      const at = Date.now();
      setNow(at);
      setArmedUntil(at + ARM_MS);
      return;
    }
    setArmedUntil(0);
    void accept();
  };
  const updating = () => !!g()?.pr || (!!g()?.branch && g()?.state === "in_review" && !!props.detail?.runs.some((r) => r.purpose === "ci_fix"));
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
      <Show when={blockers().length}>
        <div class="panel-blockers" role="alert">
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
      {/* Everything that stands between you and Accept comes first, together: git's identity, then the checks only you
          can tick (with their screenshots); the stamp and what it rests on follow. */}
      <Show when={humans().length}>
        <div class="panel-section panel-humans">
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
      </Show>
      <div class="panel-section">
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
            <Show when={g()!.verified_pin}>
              {(pin) => (
                <span class="accept-stamp">
                  <Stamp pin={pin()} tampered={tampered().length > 0} press />
                </span>
              )}
            </Show>
            <span class="meta accept-basis">
              {tampered().length > 0 ? t("review.allPassedDiscounted", { v: counted(), n: g()!.progress.machine, d: tampered().length }) : t("review.allPassed", { n: g()!.progress.machine })}
              <Show when={props.total > 0 && props.viewed === props.total}>
                <span class="num accept-viewed">{t("review.viewedAll", { n: props.total })}</span>
              </Show>
            </span>
          </Show>

          <div class="seal-checks" aria-label={t("review.acceptTitle", { id: props.id })}>
            <For
              each={[
                [snapshotFresh() ? "ok" : "warn", t(snapshotFresh() ? "review.sealFresh" : tampered().length ? "review.sealWithheld" : "review.sealStale")],
                [highSentinels().length ? "danger" : "ok", highSentinels().length ? t("review.sealSentinelsHit", { n: highSentinels().length }) : t("review.sealSentinelsOk")],
                [unchecked() ? "warn" : "ok", unchecked() ? t("review.sealHumanLeft", { n: unchecked() }) : t("review.sealHumanOk")],
                [overlaps().length ? "notice" : "ok", overlaps().length ? t("goal.overlaps", { id: overlaps().map((o) => o.goal_id).join(", ") }) : t("review.sealMergeOk")],
              ] as [keyof typeof SEAL_MARK, string][]}
            >
              {([cls, text]) => (
                <div class={`seal-check seal-check-${cls}`}>
                  {SEAL_MARK[cls]()}
                  {text}
                </div>
              )}
            </For>
          </div>
        </div>
      </div>
      <Show when={judgement().length}>
        <div class="panel-section open-judgement">
          <div class="meta t3">{t("review.openJudgementTitle")}</div>
          <OpenList items={judgement()} danger />
        </div>
      </Show>
      <Show when={notice().length}>
        <div class="panel-section open-notice">
          <div class="meta t3">{judgement().length ? t("review.openNoticeTitle") : t("review.stillOpen")}</div>
          <OpenList items={notice()} danger={false} named={judgement().some((o) => o.sentinel)} />
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
      <div class="panel-actions">
        <Show when={blocked()}>
          <button type="button" class="link-quiet text-btn panel-reason" onClick={toBlocker}>
            {/* Reasons are words, so they are joined as words: the middle dot belongs to the instrument lines (docs/12). */}
            {reasons().join(locale() === "zh-CN" ? "；" : "; ")}
          </button>
        </Show>
        <Button variant="ghost" onClick={props.onClose}>
          {t("common.cancel")}
        </Button>
        <Button
          variant="primary"
          class={armedLeft() ? "armed" : ""}
          busy={busy()}
          disabled={blocked()}
          title={unchecked() > 0 ? t("review.humanUnchecked", { id: uncheckedIds() }) : judgement().length ? t("decision.pressTwice") : undefined}
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

/** Structured Steering Dispatch Tray: sends all anchored inline comments back as steering (`⌘↩`). */
export function ChangesPanel(props: { id: string; comments: Draft[]; onClose: () => void; onSent: () => void; onRemove: (i: number) => void; onFinish?: () => void }) {
  const [summary, setSummary] = createSignal("");
  const [busy, setBusy] = createSignal(false);
  const canSend = () => !busy() && (!!summary().trim() || props.comments.length > 0);
  const send = async () => {
    if (!canSend()) return;
    setBusy(true);
    const ok = await act(() => api.requestChanges(props.id, summary(), props.comments.map(toComment)), t("review.sentBack"));
    setBusy(false);
    if (ok !== undefined) {
      props.onSent();
      props.onClose();
      (props.onFinish ?? back)();
    }
  };
  const keys = { name: () => t("review.requestChanges"), bindings: [{ key: "mod+enter", run: () => void send(), inInputs: true }] };

  return (
    <Overlay onClose={props.onClose} keys={keys} label={t("review.requestChanges")} title={t("review.requestChanges")} instant>
      <div class="dispatch-head">
        <Icon name="return" size={12} />
        <span class="t2">{t("review.dispatchHead", { n: props.comments.length })}</span>
      </div>
      <textarea
        class="panel-text"
        rows={3}
        aria-label={t("review.summaryPlaceholder")}
        placeholder={t("review.summaryPlaceholder")}
        value={summary()}
        onInput={(e) => setSummary(e.currentTarget.value)}
        onKeyDown={(e) => {
          if ((e.metaKey || e.ctrlKey) && e.key === "Enter" && canSend()) {
            e.preventDefault();
            void send();
          }
        }}
      />
      <div class="panel-section">
        <For each={props.comments} fallback={<p class="meta">{t("review.noInline")}</p>}>
          {(c, i) => (
            <div class="dispatch-row">
              <span class="mono t2" style={{ "white-space": "nowrap" }}>
                {c.path}
                {c.old ? ` ${t("review.oldLine", { n: c.old })}` : c.line ? `:${c.line}` : ""}
              </span>
              <span class="grow">
                {withoutSuggestion(c.text) || c.text}
                <Show when={suggestionOf(c.text) !== null}>
                  <span class="sep" />
                  <span class="t3">{t("review.suggestion")}</span>
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
        <Button variant="primary" busy={busy()} disabled={!canSend()} onClick={() => void send()} kbd="mod+enter">
          {t("review.sendBack")}
        </Button>
      </div>
    </Overlay>
  );
}
