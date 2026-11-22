/**
 * Contract Studio: 5-clause editorial contract document:
 *   01 Intent (+ pasted/dropped image attachments)
 *   02 Acceptance & visual criteria (+ lazy Synthetic Holdout Drafts)
 *   03 Scope fence & ports (include/exclude/readonly + network/ports/loopback)
 *   04 Engine, escalation & sandbox (trust tier, escalation_model, sandbox_tier, autonomy)
 *   05 Budget & dependencies (caps, wall clock, rework limit, depends_on picker)
 */
import { For, Show, Suspense, createEffect, createMemo, createResource, createSignal, on, onMount } from "solid-js";
import { createStore, produce, unwrap } from "solid-js/store";

import { Icon, LifecycleGlyph } from "../components/Glyph";
import { LookStepsEdit as LookSteps } from "../components/LookSteps";
import { BaseTestsNotice } from "../components/TestCheck";
import { Button, ClauseHead, Field, IconButton, Select, Toggle } from "../components/ui";
import type { ContractIssue } from "../gen/ContractIssue";
import type { Criterion } from "../gen/Criterion";
import { api } from "../lib/api";
import { t } from "../lib/i18n";
import { useKeys } from "../lib/keys";
import { effectiveEngine, engineLabel, modelsFor } from "../lib/labels";
import { back, go } from "../lib/nav";
import { act, goalList, state } from "../lib/store";
import { engineOptions, thinkingOptions } from "./Settings";
import { HoldoutDrafts } from "./goal/HoldoutDrafts";
import { AttachChips, collectImages, extractImages } from "./goal/SteerBox";
import "./goal/deck.css";
import { type AttachmentRef, type ExtContract, trustLabel, trustTierOf } from "./goal/ext";

export function blankContract(intent = "", testCommand: string | null = null): ExtContract {
  return {
    version: 1,
    intent,
    done_when: "",
    constraints: [],
    criteria: testCommand ? [{ id: "C1", title: t("contract.defaultCriterion"), kind: { type: "exec", command: testCommand, timeout_secs: 600 } }] : [],
    scope: { include: [], exclude: [], readonly: [] },
    budget: { soft_usd: 5, hard_usd: 8, wall_minutes: 90 },
    autonomy: "standard",
    max_rework: 3,
    setup: "",
    model: state.settings?.default_model ?? "",
    thinking: state.settings?.default_thinking ?? "",
    stop_conditions: [],
    network: false,
    ports: [],
    loopback_open: false,
    engine: "",
    escalation_model: "",
    escalation_after_reworks: 2,
    attachments: [],
    sandbox_tier: "default",
    depends_on: [],
  };
}

export const parsePorts = (s: string): number[] => [
  ...new Set(s.split(/[\s,]+/).map(Number).filter((n) => Number.isInteger(n) && n > 0 && n < 65536)),
];

const lines = (s: string) => s.split("\n").map((x) => x.trim()).filter(Boolean);

export function ContractEditor(props: { projectId?: string; draftId?: string; amendId?: string }) {
  const editingId = props.draftId ?? props.amendId;
  const [projectId, setProjectId] = createSignal(props.projectId ?? state.projects[0]?.id ?? "");
  const [title, setTitle] = createSignal("");
  const [c, setC] = createStore<ExtContract>(blankContract());
  const [issues, setIssues] = createSignal<ContractIssue[]>([]);
  const [busy, setBusy] = createSignal(false);
  const [touched, setTouched] = createSignal(!!editingId);
  const [dragOver, setDragOver] = createSignal(false);
  const [holdoutOpen, setHoldoutOpen] = createSignal(false);
  const [models] = createResource(() => api.models().catch(() => []));
  const [posture] = createResource(() => api.sandboxPosture?.().catch(() => null) ?? Promise.resolve(null));
  let fileInput!: HTMLInputElement;

  const engine = () => effectiveEngine(c.engine, state.settings?.engine);
  const defaultModel = () => ({ value: "", label: t("common.engineDefault", { engine: engineLabel(engine()) }) });
  const mappedModels = () => modelsFor(models() ?? [], engine()).map((m) => ({ value: `${m.provider}/${m.id}`, label: engine() === "claude-code" ? m.name : `${m.provider}/${m.id}` }));
  const modelOptions = Object.assign(() => [defaultModel(), ...mappedModels()], { base: () => [defaultModel()] });
  const escOptions = () => [{ value: "", label: "None" }, ...mappedModels()];
  const projectGoals = createMemo(() => goalList().filter((g) => g.project_id === projectId() && g.id !== editingId && !["archived", "abandoned"].includes(g.state)));
  const microVmReady = () => !!posture()?.microvm_available;

  let loaded = false;
  onMount(async () => {
    setTimeout(() => (loaded = true), 300);
    if (editingId) {
      const d = await api.goal(editingId);
      setTitle(d.summary.title);
      setProjectId(d.summary.project_id);
      setC({ ...structuredClone(d.contract), escalation_model: d.contract.escalation_model ?? "", escalation_after_reworks: d.contract.escalation_after_reworks ?? 2, attachments: d.contract.attachments ?? [], sandbox_tier: d.contract.sandbox_tier ?? "default", depends_on: d.contract.depends_on ?? [] });
    } else {
      const project = state.projects.find((p) => p.id === projectId());
      const intent = sessionStorage.getItem("tower.draftIntent") ?? "";
      sessionStorage.removeItem("tower.draftIntent");
      setC(blankContract(intent, project?.test_command ?? null));
      setTitle(intent.slice(0, 48));
    }
  });

  let vt: number | undefined;
  createEffect(
    on(
      () => JSON.stringify(c),
      () => {
        if (loaded) setTouched(true);
        clearTimeout(vt);
        vt = window.setTimeout(async () => setIssues(await api.validateContract(unwrap(c)).catch(() => [])), 200);
      },
    ),
  );

  const errors = () => issues().filter((i) => i.level === "error");
  const issueFor = (field: string) => (touched() ? (issues().find((i) => i.field === field)?.message ?? null) : null);

  const addCriterion = (kind: Criterion["kind"]["type"]) => {
    let id = `C${c.criteria.length + 1}`;
    while (c.criteria.some((x) => x.id === id)) id = `C${Number(id.slice(1)) + 1}`;
    const k: Criterion["kind"] =
      kind === "exec" ? { type: "exec", command: "", timeout_secs: 600 } : kind === "look" ? { type: "look", start: "", url: "http://localhost:3000/", timeout_secs: 60 } : { type: "human" };
    setC("criteria", (l) => [...l, { id, title: "", kind: k }]);
  };
  const setKind = (i: number, fn: (k: Criterion["kind"]) => void) => setC("criteria", i, "kind", produce(fn));

  const addImages = (files: File[]) => void collectImages(files, editingId, (ref) => setC("attachments", (l) => [...(l ?? []), ref]));
  const removeAtt = (att: AttachmentRef) => {
    setC("attachments", (l) => (l ?? []).filter((x) => x.id !== att.id));
    if (editingId) void api.deleteAttachment?.(editingId, att.id).catch(() => {});
  };
  const toggleDep = (id: string) => setC("depends_on", (l) => ((l ?? []).includes(id) ? (l ?? []).filter((x) => x !== id) : [...(l ?? []), id]));

  const save = async (ratify: boolean) => {
    const contract = structuredClone(unwrap(c));
    if (contract.attachments?.length) contract.attachments = contract.attachments.map((a) => { const { preview: _, ...rest } = a as AttachmentRef; return rest; });
    setBusy(true);
    try {
      if (props.amendId) {
        if ((await act(() => api.amendContract(props.amendId!, contract), t("contract.amended"))) !== undefined) back();
      } else if (props.draftId) {
        await act(() => api.updateDraft(props.draftId!, title(), contract));
        if (ratify) await act(() => api.ratify(props.draftId!), t("contract.ratified"));
        go({ name: "goal", id: props.draftId });
      } else {
        const g = await act(() => api.createGoal({ project_id: projectId(), title: title().trim() || contract.intent.slice(0, 48), contract, ratify }));
        if (g) go({ name: "goal", id: g.id });
      }
    } finally {
      setBusy(false);
    }
  };

  useKeys([{ key: "mod+enter", run: () => !errors().length && void save(true), inInputs: true }]);

  const projectName = () => state.projects.find((p) => p.id === projectId())?.name ?? "";
  const mastState = () => (props.amendId ? t("contract.mastAmend", { v: c.version }) : props.draftId ? t("contract.mastDraft") : t("contract.mastNew"));

  return (
    <div class="editor">
      <div class="editor-main">
        <div class="contract-mast halt">
          <span class="contract-mast-word">{t("contract.mast")}</span>
          <Show when={projectName()}>
            <span class="sep" />
            <span class="contract-mast-project">{projectName()}</span>
          </Show>
          <span class="sep" />
          <span class="contract-mast-state">{mastState()}</span>
        </div>

        <div class="editor-block">
          <ClauseHead n={1} title={t("contract.intentBlock")} />
          <Show when={!editingId && state.projects.length > 1}>
            <Field label={t("contract.project")}>
              <Select value={projectId()} options={state.projects.map((p) => ({ value: p.id, label: p.name }))} onChange={setProjectId} />
            </Field>
          </Show>
          <Field label={t("contract.title")}>
            <input value={title()} onInput={(e) => setTitle(e.currentTarget.value)} placeholder={t("contract.titlePlaceholder")} disabled={!!props.amendId} />
          </Field>
          <Show when={!editingId}><BaseTestsNotice projectId={projectId()} /></Show>
          <Field label={t("contract.intent")} hint={t("contract.intentHint")} error={issueFor("intent")}>
            <textarea
              rows={2}
              class="reading"
              value={c.intent}
              onInput={(e) => setC("intent", e.currentTarget.value)}
              onPaste={(e) => {
                const imgs = extractImages(e.clipboardData);
                if (imgs.length) (e.preventDefault(), void addImages(imgs));
              }}
              placeholder={t("contract.intentPlaceholder")}
            />
          </Field>
          <div
            class="att-drop-zone"
            classList={{ "drag-over": dragOver() }}
            onDragOver={(e) => (e.preventDefault(), setDragOver(true))}
            onDragLeave={() => setDragOver(false)}
            onDrop={(e) => (e.preventDefault(), setDragOver(false), void addImages(extractImages(e.dataTransfer)))}
          >
            <span>Paste or drop screenshots into intent</span>
            <input ref={fileInput} type="file" accept="image/*" multiple hidden onChange={(e) => (e.currentTarget.files?.length && void addImages(Array.from(e.currentTarget.files)), (e.currentTarget.value = ""))} />
            <Button size="s" variant="ghost" onClick={() => fileInput.click()}><Icon name="plus" size={10} />Attach</Button>
          </div>
          <AttachChips items={c.attachments ?? []} onRemove={removeAtt} />
          <Field label={t("contract.doneWhen")} hint={t("contract.doneWhenHint")}>
            <textarea rows={2} value={c.done_when} onInput={(e) => setC("done_when", e.currentTarget.value)} />
          </Field>
          <Field label={t("contract.stopConditions")} hint={t("contract.stopConditionsHint")}>
            <textarea rows={2} value={c.stop_conditions.join("\n")} onInput={(e) => setC("stop_conditions", lines(e.currentTarget.value))} placeholder={t("contract.stopConditionsPlaceholder")} />
          </Field>
          <Field label={t("contract.constraints")}>
            <textarea rows={2} value={c.constraints.join("\n")} onInput={(e) => setC("constraints", lines(e.currentTarget.value))} placeholder={t("contract.constraintsPlaceholder")} />
          </Field>
        </div>

        <div class="editor-block">
          <ClauseHead n={2} title="Acceptance & visual criteria">
            <Button size="s" variant="ghost" onClick={() => addCriterion("exec")}><Icon name="plus" size={10} />{t("contract.addCommand")}</Button>
            <Button size="s" variant="ghost" onClick={() => addCriterion("look")} title={t("contract.lookHint")}><Icon name="plus" size={10} />{t("contract.addLook")}</Button>
            <Button size="s" variant="ghost" onClick={() => addCriterion("human")}><Icon name="plus" size={10} />{t("contract.addHuman")}</Button>
          </ClauseHead>
          <p class="field-hint" style={{ "margin-bottom": "12px" }}>{t("contract.criteriaHint")}</p>
          <For each={c.criteria}>
            {(cr, i) => (
              <div class="criterion-edit" classList={{ "criterion-edit-look": cr.kind.type === "look" }}>
                <span class="num">{cr.id}</span>
                <input value={cr.title} aria-label={`${cr.id} ${t("contract.criterionTitle")}`} placeholder={cr.kind.type === "look" ? t("contract.lookTitlePlaceholder") : t("contract.criterionTitle")} onInput={(e) => setC("criteria", i(), "title", e.currentTarget.value)} />
                <Show when={cr.kind.type !== "human"} fallback={<span class="meta">{t("contract.humanCheck")}</span>}>
                  <span class="unit-wrap timeout" classList={{ "timeout-look": cr.kind.type === "look" }}>
                    <input class="num" type="number" min="1" value={(cr.kind as { timeout_secs: number }).timeout_secs} title={t("contract.timeout")} aria-label={`${cr.id} ${t("contract.timeout")}`} onInput={(e) => setKind(i(), (k) => k.type !== "human" && (k.timeout_secs = Number(e.currentTarget.value) || 1))} />
                    <span class="unit">{cr.kind.type === "look" ? t("contract.secondsReachable") : t("contract.seconds")}</span>
                  </span>
                </Show>
                <IconButton icon="cross" size={24} label={t("common.delete")} onClick={() => setC("criteria", (l) => l.filter((_, j) => j !== i()))} />
                <Show when={cr.kind.type === "exec"}>
                  <input class="mono criterion-cmd-row" aria-label={`${cr.id} ${t("contract.addCommand")}`} value={(cr.kind as { command: string }).command} placeholder={t("common.eg", { x: "pnpm test -- checkout" })} onInput={(e) => setKind(i(), (k) => k.type === "exec" && (k.command = e.currentTarget.value))} />
                </Show>
                <Show when={cr.kind.type === "look"}>
                  <div class="criterion-cmd-row look-fields">
                    <input class="mono" aria-label={`${cr.id} ${t("contract.lookStart")}`} value={(cr.kind as { start: string }).start} placeholder={t("contract.lookStartPlaceholder")} onInput={(e) => setKind(i(), (k) => k.type === "look" && (k.start = e.currentTarget.value))} />
                    <input class="mono" aria-label={`${cr.id} ${t("contract.lookUrl")}`} value={(cr.kind as { url: string }).url} placeholder={t("common.eg", { x: "http://localhost:3000/checkout" })} onInput={(e) => setKind(i(), (k) => k.type === "look" && (k.url = e.currentTarget.value))} />
                  </div>
                  <span class="criterion-cmd-row field-hint">{t("contract.lookHint")}</span>
                  <LookSteps id={cr.id} steps={(cr.kind as { steps?: string[] }).steps ?? []} issues={touched() ? issues().filter((x) => x.field === `criteria.${cr.id}.steps`).map((x) => x.message) : []} onChange={(steps) => setKind(i(), (k) => k.type === "look" && (steps.length ? (k.steps = steps) : delete k.steps))} />
                </Show>
              </div>
            )}
          </For>
          <Show when={issueFor("criteria")}><p class="field-warn">{issueFor("criteria")}</p></Show>
          <Field label={t("contract.setup")} hint={t("contract.setupHint")}>
            <input class="mono" value={c.setup} onInput={(e) => setC("setup", e.currentTarget.value)} placeholder={t("common.eg", { x: "pnpm install --frozen-lockfile" })} />
          </Field>
          <div class="row" style={{ "margin-top": "4px" }}>
            <Button size="s" variant="ghost" aria-expanded={holdoutOpen()} onClick={() => setHoldoutOpen((o) => !o)}>
              <Icon name="harness" size={10} /> Generate synthetic holdout drafts
            </Button>
          </div>
          <Show when={holdoutOpen()}><HoldoutDrafts projectId={projectId()} intent={c.intent} onClose={() => setHoldoutOpen(false)} /></Show>
        </div>

        <div class="editor-block">
          <ClauseHead n={3} title="Scope fence & ports" />
          <p class="field-hint" style={{ "margin-bottom": "12px" }}>{t("contract.scopeHint")}</p>
          <div class="editor-grid3">
            <Field label={t("contract.include")}><textarea class="mono" rows={2} value={c.scope.include.join("\n")} onInput={(e) => setC("scope", "include", lines(e.currentTarget.value))} placeholder={t("contract.includePlaceholder")} /></Field>
            <Field label={t("contract.exclude")}><textarea class="mono" rows={2} value={c.scope.exclude.join("\n")} onInput={(e) => setC("scope", "exclude", lines(e.currentTarget.value))} /></Field>
            <Field label={t("contract.readonly")}><textarea class="mono" rows={2} value={c.scope.readonly.join("\n")} onInput={(e) => setC("scope", "readonly", lines(e.currentTarget.value))} placeholder={t("common.eg", { x: "**/__snapshots__/**" })} /></Field>
          </div>
          <Show when={issueFor("scope.include") ?? issueFor("scope.exclude") ?? issueFor("scope.readonly")}>
            {(err) => <p class="field-error">{err()}</p>}
          </Show>
          <Toggle checked={c.network} onChange={(v) => setC("network", v)} label={t("contract.network")} hint={t("contract.networkHint")} />
          <Show when={!c.network}>
            <Field label={t("contract.ports")} hint={t("contract.portsHint")}>
              <input class="mono" inputmode="numeric" placeholder={t("common.eg", { x: "5432, 6379" })} value={(c.ports ?? []).join(", ")} onChange={(e) => setC("ports", parsePorts(e.currentTarget.value))} />
            </Field>
            <Toggle checked={c.loopback_open ?? false} onChange={(v) => setC("loopback_open", v)} label={t("contract.loopbackOpen")} hint={t("contract.loopbackOpenHint")} />
          </Show>
        </div>

        <div class="editor-foot">
          <Button variant="ghost" onClick={back}>{t("common.cancel")}</Button>
          <span class="reason">{touched() ? (errors()[0]?.message ?? "") : ""}</span>
          <Show
            when={props.amendId}
            fallback={
              <>
                <Button busy={busy()} onClick={() => save(false)}>{t("contract.saveDraft")}</Button>
                <Button variant="primary" busy={busy()} disabled={errors().length > 0} onClick={() => save(true)} kbd="mod+enter">{t("contract.ratifyStart")}</Button>
              </>
            }
          >
            <Button variant="primary" busy={busy()} disabled={errors().length > 0} onClick={() => save(true)} kbd="mod+enter">{t("contract.ratifyAmend")}</Button>
          </Show>
        </div>
      </div>

      <aside class="editor-side">
        <div class="editor-block">
          <ClauseHead n={4} title="Engine, escalation & sandbox" />
          <Field label={t("contract.engine")} hint={trustLabel(trustTierOf(engine()))}>
            <Select value={c.engine} options={[{ value: "", label: t("contract.engineDefault", { engine: engineLabel(effectiveEngine("", state.settings?.engine)) }) }, ...engineOptions()]} onChange={(v) => (setC("engine", v), setC("model", ""), setC("escalation_model", ""))} />
          </Field>
          <Field label={t("contract.model")} hint={engine() === "claude-code" ? t("contract.modelHintClaude") : t("contract.modelHint")}>
            <Suspense fallback={<Select value={c.model} options={modelOptions.base()} onChange={(v) => setC("model", v)} />}>
              <Select value={c.model} options={modelOptions()} onChange={(v) => setC("model", v)} />
            </Suspense>
          </Field>
          <Show when={engine() !== "claude-code"}>
            <Field label={t("contract.thinking")}><Select value={c.thinking} options={thinkingOptions()} onChange={(v) => setC("thinking", v)} /></Field>
          </Show>
          <Field label="Escalation model">
            <Suspense fallback={<Select value={c.escalation_model ?? ""} options={[{ value: "", label: "None" }]} onChange={(v) => setC("escalation_model", v)} />}>
              <Select value={c.escalation_model ?? ""} options={escOptions()} onChange={(v) => setC("escalation_model", v)} />
            </Suspense>
          </Field>
          <Show when={c.escalation_model}>
            <Field label="Escalate after" unit={t("contract.times")}>
              <input class="num" type="number" min="1" max="10" value={c.escalation_after_reworks ?? 2} onInput={(e) => setC("escalation_after_reworks", Number(e.currentTarget.value) || 1)} />
            </Field>
          </Show>
          <div class="field">
            <span class="field-label">Sandbox tier</span>
            <div class="tier-cards" role="radiogroup" aria-label="Sandbox tier">
              <For
                each={[
                  ["default", "Default OS Sandbox", "Seatbelt / Landlock", false],
                  ["micro_vm", "MicroVM", microVmReady() ? "Apple Containerization" : "macOS 26+ container CLI", !microVmReady()],
                ] as ["default" | "micro_vm", string, string, boolean][]}
              >
                {([id, name, desc, dis]) => (
                  <label class="tier-card" classList={{ selected: (c.sandbox_tier ?? "default") === id, disabled: dis }}>
                    <input type="radio" name="sandbox_tier" checked={(c.sandbox_tier ?? "default") === id} disabled={dis} onChange={() => setC("sandbox_tier", id)} />
                    <span><b>{name}</b><span class="radio-desc" style={{ display: "block" }}>{desc}</span></span>
                  </label>
                )}
              </For>
            </div>
          </div>
          <div class="field">
            <span class="field-label">{t("contract.autonomy")}</span>
            <div class="autonomy-choices" role="radiogroup" aria-label={t("contract.autonomy")}>
              <For each={["cautious", "standard", "autonomous"] as const}>
                {(v) => (
                  <label class="radio" title={t(`contract.${v}Desc`)}>
                    <input type="radio" name="autonomy" checked={c.autonomy === v} onChange={() => setC("autonomy", v)} />
                    <b>{t(`contract.${v}`)}</b>
                    <span class="radio-desc">{t(`contract.${v}Desc`)}</span>
                  </label>
                )}
              </For>
            </div>
            <p class="field-hint autonomy-current">{t(`contract.${c.autonomy}Desc`)}</p>
            <p class="field-hint">{t("contract.oneWayNote")}</p>
          </div>
        </div>

        <div class="editor-block">
          <ClauseHead n={5} title="Budget & dependencies" />
          <div class="editor-grid2">
            <Field label={t("contract.softCap")} error={issueFor("budget")} unit="$" unitLeft><input class="num" type="number" step="0.5" min="0" value={c.budget.soft_usd} onInput={(e) => setC("budget", "soft_usd", Number(e.currentTarget.value))} /></Field>
            <Field label={t("contract.hardCap")} unit="$" unitLeft><input class="num" type="number" step="0.5" min="0" value={c.budget.hard_usd} onInput={(e) => setC("budget", "hard_usd", Number(e.currentTarget.value))} /></Field>
            <Field label={t("contract.wallClock")} unit={t("contract.minutes")}><input class="num" type="number" min="1" value={c.budget.wall_minutes} onInput={(e) => setC("budget", "wall_minutes", Number(e.currentTarget.value) || 1)} /></Field>
            <Field label={t("contract.maxRework")} unit={t("contract.times")}><input class="num" type="number" min="0" max="10" value={c.max_rework} onInput={(e) => setC("max_rework", Number(e.currentTarget.value) || 0)} /></Field>
          </div>
          <div class="field">
            <span class="field-label">Depends on goals</span>
            <Show when={projectGoals().length > 0} fallback={<span class="meta t4">None active</span>}>
              <div class="dep-pick-list">
                <For each={projectGoals()}>
                  {(g) => (
                    <button type="button" class="dep-pick-btn" classList={{ active: (c.depends_on ?? []).includes(g.id) }} aria-pressed={(c.depends_on ?? []).includes(g.id)} onClick={() => toggleDep(g.id)} title={g.title}>
                      <LifecycleGlyph goal={g} size={9} />
                      <span class="mono">{g.id}</span>
                      <span class="ellipsis" style={{ "max-width": "120px" }}>{g.title}</span>
                    </button>
                  )}
                </For>
              </div>
            </Show>
          </div>
        </div>
      </aside>
    </div>
  );
}
