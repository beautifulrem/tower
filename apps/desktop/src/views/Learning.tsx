/**
 * Learning console (docs/18 P2.3, docs/19 §19.3):
 * Memory Ratification Queue (with TaintLevel visual physics & high-taint edit/phrase gate)
 * paired with the pure-Fact Model Calibration Scoreboard. Lazy-loaded via `withLater`.
 */
import { For, type JSX, Show, createMemo, createResource, createSignal } from "solid-js";

import { DangerMark, NoticeMark } from "../components/Glyph";
import { ProvenanceFrame, TaintPill } from "../components/ProvenanceFrame";
import { Empty, Select } from "../components/ui";
import { api } from "../lib/api";
import type { CalibrationRow, MemoryProposal, ProposalStatus } from "../lib/apiTypes";
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

const ALL = "__all__";
const PHRASE = "CONFIRM";
const pct = (v: number) => `${Math.round(Math.max(0, Math.min(1, v)) * 100)}%`;

/** Shared console masthead with tabular KPI strip. */
export function ConsoleMast(props: { title: string; subtitle: string; kpis: [string, string][] }) {
  return (
    <header class="console-mast">
      <div class="console-mast-copy">
        <h2 class="console-mast-title">{props.title}</h2>
        <span class="meta">{props.subtitle}</span>
      </div>
      <div class="console-kpis num halt">
        <For each={props.kpis}>{([k, v]) => <div class="kpi-cell"><span class="kpi-label">{k}</span><span class="kpi-val">{v}</span></div>}</For>
      </div>
    </header>
  );
}

/** Shared compact action button for console tables and cards. */
export function SmBtn(props: { variant?: "primary" | "default" | "ghost"; disabled?: boolean; type?: "button" | "submit"; label?: string; hidden?: boolean; onClick?: () => void; children: JSX.Element }) {
  return (
    <button type={props.type ?? "button"} class={`btn btn-${props.variant ?? "ghost"} btn-s`} disabled={props.disabled} hidden={props.hidden} aria-label={props.label} onClick={props.onClick}>
      <span class="btn-label">{props.children}</span>
    </button>
  );
}

/** Shared micro meter cell used in Calibration and Storage tables. */
export function MeterCell(props: { label: string; width: string; cls?: string; wrapCls?: string }) {
  return (
    <span class={props.wrapCls ?? "rate-cell"}>
      <span>{props.label}</span>
      <span class="meter-micro"><i class={`meter-micro-fill${props.cls ? ` ${props.cls}` : ""}`} style={{ width: props.width }} /></span>
    </span>
  );
}

/** Shared all-projects filter dropdown for console tables. */
export function ProjectFilter(props: { value: string; onChange: (v: string) => void; min?: number }) {
  return (
    <Show when={state.projects.length > (props.min ?? 0)}>
      <Select class="overview-filter" label={t("overview.filterLabel")} value={props.value} options={[{ value: ALL, label: t("overview.allProjects") }, ...state.projects.map((p) => ({ value: p.id, label: p.name }))]} onChange={props.onChange} />
    </Show>
  );
}

/** Shared provenance container used by lazy console views (Fact / Claim / Human). */
export function ProvBox(props: { kind: "fact" | "claim" | "human"; badge: string; meta?: string; aside?: JSX.Element; danger?: boolean; children: JSX.Element }) {
  return <ProvenanceFrame kind={props.kind} label={props.badge} meta={props.meta} aside={props.aside} danger={props.danger}>{props.children}</ProvenanceFrame>;
}

/** Shared numeric instrument table with empty state. */
export function DataTable<T>(props: { headers: [string, boolean?][]; empty: string; items: T[]; row: (item: T) => JSX.Element }) {
  return (
    <Show when={props.items.length > 0} fallback={<Empty title={props.empty} inline />}>
      <div class="data-table-wrap">
        <table class="data-table num">
          <thead>
            <tr>
              <For each={props.headers}>{([h, r]) => <th classList={{ "col-r": !!r }}>{h}</th>}</For>
            </tr>
          </thead>
          <tbody>
            <For each={props.items}>{(it) => props.row(it)}</For>
          </tbody>
        </table>
      </div>
    </Show>
  );
}

function ProposalCard(props: { p: MemoryProposal; onChanged: () => void }) {
  const [editing, setEditing] = createSignal(false);
  const [draft, setDraft] = createSignal(props.p.text);
  const [phrase, setPhrase] = createSignal("");
  const [busy, setBusy] = createSignal(false);

  const high = () => props.p.taint_level === "high";
  const edited = () => draft().trim() !== props.p.text.trim() && draft().trim().length > 0;
  const unlocked = () => !high() || edited() || phrase().trim().toUpperCase() === PHRASE;

  const run = async (fn: () => Promise<unknown>, msg: string) => {
    setBusy(true);
    const ok = await act(fn, msg);
    setBusy(false);
    if (ok !== undefined) props.onChanged();
  };

  return (
    <article class={`proposal-card taint-level-${props.p.taint_level}`}>
      <header class="proposal-head halt">
        {props.p.taint_level === "high" ? <DangerMark /> : props.p.taint_level === "standard" ? <NoticeMark /> : null}
        <span class="posture-pill">{t(`learning.scope_${props.p.scope}` as Parameters<typeof t>[0])}</span>
        <TaintPill level={props.p.taint_level} label={t(`learning.taint_${props.p.taint_level}` as Parameters<typeof t>[0])} />
        <For each={props.p.taint_classes}>{(cls) => <span class="code-val meta t3">{cls}</span>}</For>
        <span class="grow" />
        <button type="button" class="link-quiet code-val meta" hidden={!props.p.goal_id} onClick={() => props.p.goal_id && go({ name: "goal", id: props.p.goal_id })}>{props.p.goal_id}</button>
        <span class="meta num t3">{ago(props.p.created_at, state.now)}</span>
      </header>

      <div class="proposal-body">
        <Show when={editing()} fallback={<p class="proposal-rule-text">{draft()}</p>}>
          <textarea rows={2} aria-label={t("common.edit")} value={draft()} onInput={(e) => setDraft(e.currentTarget.value)} />
        </Show>

        <ProvBox
          kind={props.p.taint_level === "none" ? "human" : "claim"}
          badge={t(props.p.taint_level === "none" ? "learning.cleanSource" : "learning.taintedSource")}
          meta={props.p.origin}
        >
          <p class="meta pre" hidden={!props.p.detail}>{props.p.detail}</p>
          <div class="row row-wrap" hidden={!props.p.evidence.length}>
            <For each={props.p.evidence}>{(ev) => <code class="code-val meta">{ev}</code>}</For>
          </div>
        </ProvBox>

        <Show when={props.p.status === "pending" && high()}>
          <div class="proposal-guard">
            <span class="meta t1 row"><DangerMark />{t("learning.highTaintGuard")}</span>
            <input class="mono" aria-label={PHRASE} placeholder={t("learning.confirmPlaceholder", { phrase: PHRASE })} value={phrase()} onInput={(e) => setPhrase(e.currentTarget.value)} />
          </div>
        </Show>

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
    </article>
  );
}

export function Learning() {
  const [status, setStatus] = createSignal<ProposalStatus>("pending");
  const [project, setProject] = createSignal(ALL);
  const [proposals, { refetch: rfProp }] = createResource(status, (st) => api.memoryProposals(st).catch(() => [] as MemoryProposal[]));
  const [rows, { refetch: rfCal }] = createResource(project, (p) => api.calibrationRows(p === ALL ? null : p).catch(() => [] as CalibrationRow[]));

  const onMutate = () => (void rfProp(), void refreshConsoleMeta());
  const list = () => (Array.isArray(proposals()) ? proposals()! : []);
  const cal = () => (Array.isArray(rows()) ? rows()! : []);
  const avgPass = createMemo(() => {
    const r = cal(), tot = r.reduce((s, x) => s + x.goals_total, 0);
    return tot ? pct(r.reduce((s, x) => s + x.first_pass_rate * x.goals_total, 0) / tot) : "—";
  });

  return (
    <div class="console-page learning-page">
      <ConsoleMast
        title={t("app.learning")}
        subtitle={t("learning.subtitle")}
        kpis={[
          [t("learning.status_pending"), String(status() === "pending" ? list().length : state.pendingProposals)],
          [t("learning.kpiModels"), String(cal().length)],
          [t("learning.colFirstPass"), avgPass()],
        ]}
      />

      <section class="console-sec">
        <div class="row">
          <h3 class="section-title">{t("learning.queueTitle")}</h3>
          <span class="grow" />
          <span class="scope-switch" role="tablist" aria-label={t("learning.queueTitle")}>
            {(["pending", "approved", "rejected"] as ProposalStatus[]).map((st) => (
              <button type="button" class="tab" role="tab" aria-selected={status() === st} classList={{ active: status() === st }} onClick={() => setStatus(st)}>
                {t(`learning.status_${st}` as Parameters<typeof t>[0])}
              </button>
            ))}
          </span>
        </div>
        <Show when={list().length > 0} fallback={<Empty title={t("learning.queueEmpty")} inline />}>
          <div class="proposal-list"><For each={list()}>{(p) => <ProposalCard p={p} onChanged={onMutate} />}</For></div>
        </Show>
      </section>

      <section class="console-sec">
        <div class="row">
          <h3 class="section-title">{t("learning.calibrationTitle")}</h3>
          <span class="grow" />
          <ProjectFilter value={project()} onChange={setProject} />
          <SmBtn onClick={() => void rfCal()}>{t("common.retry")}</SmBtn>
        </div>

        <ProvBox kind="fact" badge={t("learning.calibrationBadge")}>
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
            row={(r) => (
              <tr>
                <td>
                  <div class="row row-g6">
                    <span class="t2">{engineLabel(r.engine)}</span>
                    <code class="code-val t1">{r.model || "default"}</code>
                    <span class="posture-pill" hidden={r.sample_sufficient} title={t("learning.lowSampleTitle")}>{t("learning.lowSample")}</span>
                  </div>
                </td>
                <td class="col-r">{r.goals_total}</td>
                <td class="col-r"><MeterCell label={pct(r.first_pass_rate)} width={pct(r.first_pass_rate)} cls="verified" /></td>
                <td class="col-r"><MeterCell label={pct(r.high_sentinel_rate)} width={pct(r.high_sentinel_rate)} cls="danger" /></td>
                <td class="col-r">{r.avg_reworks.toFixed(1)}</td>
                <td class="col-r">{pct(r.blocked_rate)}</td>
                <td class="col-r">{usd(r.avg_cost_usd)}</td>
              </tr>
            )}
          />
        </ProvBox>
      </section>
    </div>
  );
}
