/**
 * Learning console (docs/18 P2.3, docs/19 §19.3):
 * Single-layer Memory Ratification Ledger (with taint provenance & high-taint
 * CONFIRM gate) paired with the Model Calibration Scoreboard. Lazy-loaded via `withLater`.
 */
import { For, Show, createMemo, createResource, createSignal } from "solid-js";

import { DangerMark, Icon, NoticeMark } from "../components/Glyph";
import { ALL, DataTable, MeterCell, ProjectFilter, ProvBox, SecHead, SmBtn, inPlace } from "../components/Console";
import { Empty, Failed, Prose, settled } from "../components/ui";
import { api } from "../lib/api";
import type { MemoryProposal, ProposalStatus } from "../lib/apiTypes";
import { ago, usd } from "../lib/format";
import { t } from "../lib/i18n";
import { engineLabel } from "../lib/labels";
import { go } from "../lib/nav";
import { act, refreshConsoleMeta, state } from "../lib/store";

// Co-locate lazy desktop views so Vite shares one gzip dictionary across on-demand surfaces (GoalPage stays its own chunk).
export { Operations } from "./Operations";
export { Welcome } from "./Welcome";
export { Review } from "./Review";
export { Settings } from "./Settings";
export { ContractEditor } from "./ContractEditor";
export { PeekDrawer } from "../components/PeekDrawer";
export { CommandPalette } from "../components/Palette";
export { ShortcutSheet } from "../components/ShortcutSheet";
export { ActivityPanel } from "../components/Activity";
export { Trace } from "../components/Trace";
export { LookStrip } from "../components/Look";
export { SteerBox } from "./goal/SteerBox";
export { prewarm as prewarmHighlight } from "../lib/highlight";
export { ask as askDialog, open as openDialog } from "@tauri-apps/plugin-dialog";

const PHRASE = "CONFIRM";
const pct = (v: number) => `${Math.round(Math.max(0, Math.min(1, v)) * 100)}%`;

function ProposalRow(props: { p: MemoryProposal; onChanged: () => void }) {
  const [editing, setEditing] = createSignal(false);
  const [draft, setDraft] = createSignal(props.p.text);
  const [phrase, setPhrase] = createSignal("");
  const [busy, setBusy] = createSignal(false);

  const high = () => props.p.taint_level === "high";
  const edited = () => draft().trim() !== props.p.text.trim() && draft().trim().length > 0;
  const unlocked = () => !high() || edited() || phrase().trim().toUpperCase() === PHRASE;
  const provLabel = () => (props.p.origin.includes(" ") ? props.p.origin.split(" · ")[0] : t(props.p.taint_level === "none" ? "learning.cleanSource" : "learning.taintedSource"));

  const run = async (fn: () => Promise<unknown>, msg: string) => {
    setBusy(true);
    const ok = await act(fn, msg);
    setBusy(false);
    if (ok !== undefined) props.onChanged();
  };

  return (
    <article class={`proposal-card taint-level-${props.p.taint_level}`}>
      <div class="proposal-main">
        <div class="proposal-copy">
          <div class="proposal-meta meta-inline meta halt">
            <span>{t(`learning.scope_${props.p.scope}` as Parameters<typeof t>[0])}</span>
            <span hidden={!props.p.goal_id}>
              <button type="button" class="link-quiet code-val" onClick={() => props.p.goal_id && go({ name: "goal", id: props.p.goal_id })}>{props.p.goal_id}</button>
            </span>
            <span class="num t3">{ago(props.p.created_at, state.now)}</span>
            <span class="proposal-taint" classList={{ t1: high() }} hidden={props.p.taint_level === "none"}>
              {high() ? <DangerMark /> : <NoticeMark />}
              <span>{t(`learning.taint_${props.p.taint_level}` as Parameters<typeof t>[0])}</span>
            </span>
            <span class="code-val t3" hidden={!props.p.taint_classes.length}>{props.p.taint_classes.join(", ")}</span>
          </div>

          <Show when={editing()} fallback={<p class="proposal-rule-text"><Prose text={draft()} /></p>}>
            <textarea rows={2} aria-label={t("common.edit")} value={draft()} onInput={(e) => setDraft(e.currentTarget.value)} />
          </Show>

          <ProvBox kind={props.p.taint_level === "none" ? "human" : "claim"} badge={provLabel()}>
            <span class="meta-inline">
              <span class="pre" hidden={!props.p.detail}>{props.p.detail}</span>
              <code class="code-val t3" hidden={!props.p.evidence.length}>{props.p.evidence.join(" · ")}</code>
            </span>
          </ProvBox>
        </div>

        <Show when={props.p.status === "pending"}>
          <div class="proposal-actions">
            <SmBtn
              variant="primary"
              disabled={busy() || !unlocked()}
              onClick={() => unlocked() && void run(() => api.approveProposal(props.p.id, edited() ? draft().trim() : null, high() && !edited() ? phrase().trim() : null), t("learning.status_approved"))}
            >
              {t("learning.approve")}
            </SmBtn>
            <SmBtn variant="default" onClick={() => setEditing((e) => !e)}>{t(editing() ? "common.save" : "common.edit")}</SmBtn>
            <SmBtn disabled={busy()} onClick={() => void run(() => api.rejectProposal(props.p.id, ""), t("learning.status_rejected"))}>{t("learning.reject")}</SmBtn>
          </div>
        </Show>
      </div>

      <Show when={props.p.status === "pending" && high()}>
        <div class="proposal-guard">
          <span class="meta t1 row"><DangerMark /><span>{t("learning.highTaintGuard")}</span></span>
          <input class="mono proposal-guard-input" aria-label={PHRASE} placeholder={t("learning.confirmPlaceholder", { phrase: PHRASE })} value={phrase()} onInput={(e) => setPhrase(e.currentTarget.value)} />
        </div>
      </Show>
    </article>
  );
}

export function Learning() {
  const [status, setStatus] = createSignal<ProposalStatus>("pending");
  const [project, setProject] = createSignal(ALL);
  const [proposals, { refetch: rfProp }] = createResource(status, (st) => api.memoryProposals(st), { storage: inPlace() });
  const [rows, { refetch: rfCal }] = createResource(project, (p) => api.calibrationRows(p === ALL ? null : p), { storage: inPlace() });

  const onMutate = () => (void rfProp(), void refreshConsoleMeta());
  const list = () => settled(proposals) ?? [];
  const cal = () => settled(rows) ?? [];
  const pendingCount = () => (status() === "pending" ? list().length : state.pendingProposals);
  const avgPass = createMemo(() => {
    const r = cal(), tot = r.reduce((s, x) => s + x.goals_total, 0);
    return tot ? pct(r.reduce((s, x) => s + x.first_pass_rate * x.goals_total, 0) / tot) : "—";
  });

  return (
    <div class="console-page learning-page">
      <section class="console-sec">
        <SecHead title={t("learning.queueTitle")} meta={<span class="meta num t2">{t("learning.pendingCount", { n: pendingCount() })}</span>}>
          <div class="console-tabs" role="tablist" aria-label={t("learning.queueTitle")}>
            {(["pending", "approved", "rejected"] as ProposalStatus[]).map((st) => (
              <button type="button" class="console-tab" role="tab" aria-selected={status() === st} classList={{ active: status() === st }} onClick={() => setStatus(st)}>
                {t(`learning.status_${st}` as Parameters<typeof t>[0])}
              </button>
            ))}
          </div>
        </SecHead>
        <Show when={list().length > 0} fallback={<Failed inline error={proposals.error} onRetry={() => void rfProp()} pending={<Empty title={t("learning.queueEmpty")} inline />} />}>
          <div class="proposal-ledger"><For each={list()}>{(p) => <ProposalRow p={p} onChanged={onMutate} />}</For></div>
        </Show>
      </section>

      <section class="console-sec calibration-sec">
        <SecHead
          title={t("learning.calibrationTitle")}
          meta={
            <>
              <span class="meta num t2" hidden={!cal().length}>{t("learning.modelCount", { n: cal().length })}</span>
              <span class="meta num t2" hidden={!cal().length}>{t("learning.colFirstPass")} {avgPass()}</span>
              <span class="fact"><Icon name="harness" size={10} class="fact-icon" />{t("learning.calibrationBadge")}</span>
            </>
          }
        >
          <ProjectFilter value={project()} onChange={setProject} />
          <SmBtn onClick={() => void rfCal()}>{t("common.retry")}</SmBtn>
        </SecHead>

        <DataTable
          headers={[
            [t("learning.colEngineModel")],
            [t("learning.colGoals"), true],
            [t("learning.colFirstPass"), true],
            [t("learning.colSentinel"), true],
            [t("learning.colReworks"), true],
            [t("learning.colBlocked"), true],
            [t("overview.colSpend"), true],
          ]}
          empty={t("learning.calEmpty")}
          items={cal()}
          error={rows.error}
          onRetry={rfCal}
          row={(r) => (
            <tr>
              <td>
                <div class="meta-inline">
                  <span class="row row-g6">
                    <span class="t2">{engineLabel(r.engine)}</span>
                    <code class="code-val t1">{r.model || "default"}</code>
                  </span>
                  <span class="meta t3" hidden={r.sample_sufficient} title={t("learning.lowSampleTitle")}>{t("learning.lowSample")}</span>
                </div>
              </td>
              <td class="col-r">{r.goals_total}</td>
              <td class="col-r"><MeterCell label={pct(r.first_pass_rate)} width={pct(r.first_pass_rate)} /></td>
              <td class="col-r"><MeterCell label={pct(r.high_sentinel_rate)} width={pct(r.high_sentinel_rate)} /></td>
              <td class="col-r">{r.avg_reworks.toFixed(1)}</td>
              <td class="col-r">{pct(r.blocked_rate)}</td>
              <td class="col-r">{usd(r.avg_cost_usd)}</td>
            </tr>
          )}
        />
      </section>
    </div>
  );
}
