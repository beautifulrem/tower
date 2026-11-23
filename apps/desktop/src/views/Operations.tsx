/**
 * Operations console (docs/18 P1.3, P2.2, P2.3, docs/19 §19.5):
 * Single-layer Scheduled Goals, tabular Merge Queue, and Storage & Sandbox ledger.
 */
import { For, Show, createMemo, createResource, createSignal } from "solid-js";

import { DangerMark, Icon, LifecycleGlyph, NoticeMark } from "../components/Glyph";
import { Select, Toggle, settled } from "../components/ui";
import type { Contract } from "../gen/Contract";
import { api } from "../lib/api";
import type { MergeQueueEntry, StorageInventory } from "../lib/apiTypes";
import { clock } from "../lib/format";
import { t } from "../lib/i18n";
import { stateLabel } from "../lib/labels";
import { ask } from "../lib/native";
import { go } from "../lib/nav";
import { act, goalList, refreshConsoleMeta, state } from "../lib/store";
import { DataTable, MeterCell, ProjectFilter, SecHead, SmBtn } from "./Learning";
import { blankContract } from "./ContractEditor";

const ALL = "__all__";
const fmtB = (n: number) => (n >= 1024 ** 3 ? `${(n / 1024 ** 3).toFixed(2)} GB` : n >= 1024 ** 2 ? `${(n / 1024 ** 2).toFixed(1)} MB` : n >= 1024 ? `${Math.round(n / 1024)} KB` : `${n} B`);
const ZERO_P = { verified: 0, observed: 0, machine: 0, human: 0, human_done: 0 };

export function Operations() {
  const [schedules, { refetch: rfSched }] = createResource(() => api.scheduledGoals());
  const [mqProj, setMqProj] = createSignal(ALL);
  const [queue, { refetch: rfQueue }] = createResource(mqProj, (p) => api.mergeQueue(p === ALL ? null : p));
  const [storage, { refetch: rfStore }] = createResource(() => api.storageInventory());

  const [newProj, setNewProj] = createSignal(state.projects[0]?.id ?? "");
  const [newTitle, setNewTitle] = createSignal("");
  const [newCron, setNewCron] = createSignal("0 2 * * 1-5");
  const [busy, setBusy] = createSignal(false);

  // A failed read shows as a failure with Retry in its section, not as an empty list.
  const schedList = () => settled(schedules) ?? [];
  const mqList = () => settled(queue) ?? [];
  const inv = (): StorageInventory => settled(storage) ?? { total_bytes: 0, reclaimable_bytes: 0, goals: [] };
  const projName = (id: string) => state.projects.find((p) => p.id === id)?.name ?? id;
  const run = async (fn: () => Promise<unknown>, rf: () => unknown, msg?: string) => {
    if ((await act(fn, msg)) !== undefined) (void rf(), void refreshConsoleMeta());
  };

  const acceptedNotQueued = createMemo(() => {
    const q = new Set(mqList().map((e) => e.goal_id));
    return goalList().filter((g) => g.state === "accepted" && !q.has(g.id));
  });

  const addSchedule = async (e: Event) => {
    e.preventDefault();
    const pid = newProj() || state.projects[0]?.id, title = newTitle().trim(), cron = newCron().trim();
    if (!pid || !title || !cron) return;
    setBusy(true);
    const ok = await act(() => api.createScheduledGoal({ project_id: pid, title, cron_expr: cron, contract_template: blankContract(title, state.projects.find((p) => p.id === pid)?.test_command ?? null) as Contract, enabled: true, unattended_strict: true }), t("ops.addSchedule"));
    setBusy(false);
    if (ok) (setNewTitle(""), void rfSched(), void refreshConsoleMeta());
  };

  const moveQueue = (entry: MergeQueueEntry, dir: -1 | 1) => {
    const ids = mqList().filter((x) => x.project_id === entry.project_id).map((x) => x.goal_id);
    const i = ids.indexOf(entry.goal_id), j = i + dir;
    if (i < 0 || j < 0 || j >= ids.length) return;
    [ids[i], ids[j]] = [ids[j], ids[i]];
    void run(() => api.reorderMergeQueue(entry.project_id, ids), rfQueue);
  };

  const cleanGoals = async (ids: string[]) => {
    if (ids.length && (await ask(t("ops.reclaimConfirm", { n: ids.length }), { title: t("ops.storageTitle"), ok: t("ops.clean"), cancel: t("common.cancel"), kind: "warning" }))) {
      await run(() => api.reclaimStorage(ids), rfStore);
    }
  };

  const maxBytes = createMemo(() => Math.max(1, ...inv().goals.map((g) => g.total_bytes)));
  const reclaimIds = createMemo(() => inv().goals.filter((g) => g.reclaimable).map((g) => g.goal_id));

  return (
    <div class="console-page ops-page">
      <div class="ops-grid">
        <section class="console-sec">
          <SecHead
            title={t("ops.schedulesTitle")}
            meta={
              <>
                <span class="meta num t2">{schedList().filter((s) => s.enabled).length}</span>
                <span class="meta t3">{t("ops.schedulesNote")}</span>
              </>
            }
          />
          <Show when={state.projects.length > 0}>
            <form class="schedule-form" onSubmit={(e) => void addSchedule(e)}>
              <Select label={t("contract.project")} value={newProj() || state.projects[0]?.id || ""} options={state.projects.map((p) => ({ value: p.id, label: p.name }))} onChange={setNewProj} />
              <input aria-label={t("ops.schedulesTitle")} placeholder={t("ops.schedulePlaceholder")} value={newTitle()} onInput={(e) => setNewTitle(e.currentTarget.value)} />
              <input class="mono" aria-label="Cron" placeholder="0 2 * * 1-5" value={newCron()} onInput={(e) => setNewCron(e.currentTarget.value)} />
              <SmBtn type="submit" variant="primary" disabled={busy() || !newTitle().trim() || !newCron().trim()}>{t("ops.addSchedule")}</SmBtn>
            </form>
          </Show>
          <DataTable
            headers={[[t("ops.schedulesTitle")], ["Cron"], [t("ops.colPosture")], [t("ops.colNextRun")], ["", true]]}
            empty={t("ops.schedulesEmpty")}
            items={schedList()}
            error={schedules.error}
            onRetry={rfSched}
            row={(s) => (
              <tr>
                <td>
                  <div class="row row-g6">
                    <span class="t1">{s.title}</span>
                    <span class="meta t3" hidden={state.projects.length <= 1}>{projName(s.project_id)}</span>
                  </div>
                </td>
                <td><code class="code-val">{s.cron_expr}</code></td>
                <td class="meta t2">{t(s.unattended_strict ? "ops.unattendedStrict" : "contract.standard")}</td>
                <td class="meta t2">
                  {s.next_run_at ? clock(s.next_run_at) : "—"}
                  <button type="button" class="link-quiet code-val ml-8" hidden={!s.last_goal_id} onClick={() => s.last_goal_id && go({ name: "goal", id: s.last_goal_id })}>{s.last_goal_id}</button>
                </td>
                <td class="col-r">
                  <div class="row row-end">
                    <Toggle checked={s.enabled} onChange={(v) => void run(() => api.toggleScheduledGoal(s.id, v), rfSched)} label={t(s.enabled ? "quiet.on" : "settings.escalationOff")} />
                    <SmBtn onClick={() => void run(() => api.runScheduledGoalNow(s.id), rfSched, t("ops.runNow"))}>{t("ops.runNow")}</SmBtn>
                    <SmBtn onClick={() => void run(() => api.deleteScheduledGoal(s.id), rfSched)}>{t("common.delete")}</SmBtn>
                  </div>
                </td>
              </tr>
            )}
          />
        </section>

        <section class="console-sec">
          <SecHead title={t("ops.mergeQueueTitle")} meta={<span class="meta num t2">{mqList().length}</span>}>
            <ProjectFilter value={mqProj()} onChange={setMqProj} min={1} />
            <SmBtn onClick={() => { const pid = mqProj() === ALL ? state.projects[0]?.id : mqProj(); if (pid) void run(() => api.checkMergeQueue(pid), rfQueue, t("chrome.checked")); }}>
              {t("ops.checkConflicts")}
            </SmBtn>
          </SecHead>
          <div class="row meta row-wrap" hidden={!acceptedNotQueued().length}>
            <span class="t3">{t("ops.enqueueReady")}</span>
            <For each={acceptedNotQueued()}>{(g) => <SmBtn onClick={() => void run(() => api.enqueueMerge(g.id), rfQueue)}>+ {g.id}</SmBtn>}</For>
          </div>
          <DataTable
            headers={[["#"], [t("overview.colGoal")], [t("ops.colPosture")], ["", true]]}
            empty={t("ops.mergeQueueEmpty")}
            items={mqList()}
            error={queue.error}
            onRetry={rfQueue}
            row={(entry) => (
              <tr class="mq-row" classList={{ "mq-conflict": entry.status === "conflict", "mq-ready": entry.status === "ready" }}>
                <td class="mq-pos">#{entry.position + 1}</td>
                <td>
                  <div class="col">
                    <div class="row">
                      <button type="button" class="link-quiet code-val t2" onClick={() => go({ name: "goal", id: entry.goal_id })}>{entry.goal_id}</button>
                      <span class="t1 ellipsis">{entry.goal_title}</span>
                      <code class="code-val meta t3" hidden={!entry.branch}>{entry.branch}</code>
                    </div>
                    <div class="mq-conflicts meta t3" hidden={!entry.conflict_files.length}>
                      <code class="code-val t2">{entry.conflict_files.join(" · ")}</code>
                    </div>
                  </div>
                </td>
                <td>
                  <span class="mq-status meta halt" classList={{ t1: entry.status === "conflict", t2: entry.status !== "conflict" }}>
                    {entry.status === "conflict" && <DangerMark />}
                    <span>{t(`ops.mq_${entry.status}` as Parameters<typeof t>[0])}</span>
                  </span>
                </td>
                <td class="col-r">
                  <div class="row row-end">
                    <SmBtn label={t("ops.moveUp")} onClick={() => moveQueue(entry, -1)}><Icon name="arrow-up" size={10} /></SmBtn>
                    <SmBtn label={t("ops.moveDown")} onClick={() => moveQueue(entry, 1)}><Icon name="arrow-down" size={10} /></SmBtn>
                    <SmBtn variant="default" onClick={() => void run(() => api.reverifyMergeQueueEntry(entry.goal_id), rfQueue, t("goal.reverify"))}>{t("goal.reverify")}</SmBtn>
                    <SmBtn onClick={() => void run(() => api.removeFromMergeQueue(entry.goal_id), rfQueue)}>{t("common.remove")}</SmBtn>
                  </div>
                </td>
              </tr>
            )}
          />
        </section>

        <section class="console-sec">
          <SecHead
            title={t("ops.storageTitle")}
            meta={
              <>
                <span class="meta num t2">{fmtB(inv().total_bytes)}</span>
                <span class="meta num t2" hidden={!inv().reclaimable_bytes}>{fmtB(inv().reclaimable_bytes)} {t("ops.kpiReclaimable").toLowerCase()}</span>
                <span class="ops-posture-line meta-inline meta">
                  <span>{state.sandboxPosture?.backend_name ?? t("chrome.sandboxOn")}</span>
                  <span hidden={!state.sandboxPosture?.microvm_available}>{t("ops.microvmReady")}</span>
                  <For each={state.sandboxPosture?.warnings ?? []}>
                    {(w) => <span class="row row-g4 t1"><NoticeMark /><span>{w}</span></span>}
                  </For>
                </span>
              </>
            }
          >
            <SmBtn variant="default" hidden={!reclaimIds().length} onClick={() => void cleanGoals(reclaimIds())}>{t("ops.cleanAll", { size: fmtB(inv().reclaimable_bytes) })}</SmBtn>
          </SecHead>
          <DataTable
            headers={[[t("overview.colGoal")], [t("ops.colWorkspace"), true], [t("ops.colVerify"), true], [t("ops.colCache"), true], [t("ops.colTotal"), true], ["", true]]}
            empty={t("ops.storageEmpty")}
            items={inv().goals}
            error={storage.error}
            onRetry={rfStore}
            row={(g) => (
              <tr>
                <td>
                  <div class="row">
                    <LifecycleGlyph goal={{ state: g.state, progress: ZERO_P, verified_pin: null }} />
                    <code class="code-val t2">{g.goal_id}</code>
                    <span class="ellipsis t1">{g.title}</span>
                    <span class="meta t3">{stateLabel(g.state)}</span>
                  </div>
                </td>
                <td class="col-r meta">{fmtB(g.workspace_bytes)}</td>
                <td class="col-r meta">{fmtB(g.verify_bytes)}</td>
                <td class="col-r meta">{fmtB(g.cache_bytes)}</td>
                <td class="col-r"><MeterCell wrapCls="storage-bar-cell" label={fmtB(g.total_bytes)} width={`${Math.round((g.total_bytes / maxBytes()) * 100)}%`} /></td>
                <td class="col-r">{g.reclaimable ? <SmBtn onClick={() => void cleanGoals([g.goal_id])}>{t("ops.clean")}</SmBtn> : <span class="meta t3">{t("ops.protected")}</span>}</td>
              </tr>
            )}
          />
        </section>
      </div>
    </div>
  );
}
