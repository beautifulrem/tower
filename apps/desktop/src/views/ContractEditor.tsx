/**
 * Contract editor (docs/04 §4.10): intent, executable criteria, scope fence,
 * budget and autonomy. Red-light hints come from the same validation the
 * supervisor uses to refuse ratification.
 *
 * It reads as a contract, not a form: a masthead (what, whose, which state),
 * then numbered clauses — intent, acceptance, scope — on the left with the
 * action bar stuck to the bottom like a signature line; the dials (autonomy,
 * budget, network, engine) on the right as the schedule, numbered on.
 */
import { For, type JSX, Show, createEffect, createResource, createSignal, on, onMount } from "solid-js";
import { createStore, produce, unwrap } from "solid-js/store";

import { Icon } from "../components/Glyph";
import { BaseTestsNotice } from "../components/TestCheck";
import { Button, Field, IconButton, Select, Toggle } from "../components/ui";
import type { Contract } from "../gen/Contract";
import type { ContractIssue } from "../gen/ContractIssue";
import type { Criterion } from "../gen/Criterion";
import { api } from "../lib/api";
import { t } from "../lib/i18n";
import { useKeys } from "../lib/keys";
import { effectiveEngine, engineLabel, modelsFor } from "../lib/labels";
import { back, go } from "../lib/nav";
import { act, state } from "../lib/store";
import { engineOptions, thinkingOptions } from "./Settings";

function blank(intent = "", testCommand: string | null = null): Contract {
  return {
    version: 1,
    intent,
    done_when: "",
    constraints: [],
    criteria: testCommand
      ? [{ id: "C1", title: t("contract.defaultCriterion"), kind: { type: "exec", command: testCommand, timeout_secs: 600 } }]
      : [],
    scope: { include: [], exclude: [], readonly: [] },
    budget: { soft_usd: 5, hard_usd: 8, wall_minutes: 90 },
    autonomy: "standard",
    max_rework: 3,
    setup: "",
    model: state.settings?.default_model ?? "",
    thinking: state.settings?.default_thinking ?? "",
    stop_conditions: [],
    network: false,
    engine: "",
  };
}

const lines = (s: string) => s.split("\n").map((x) => x.trim()).filter(Boolean);

type Kind = Criterion["kind"]["type"];

export function ContractEditor(props: { projectId?: string; draftId?: string; amendId?: string }) {
  const editingId = props.draftId ?? props.amendId;
  const [projectId, setProjectId] = createSignal(props.projectId ?? state.projects[0]?.id ?? "");
  const [title, setTitle] = createSignal("");
  const [c, setC] = createStore<Contract>(blank());
  const [issues, setIssues] = createSignal<ContractIssue[]>([]);
  const [busy, setBusy] = createSignal(false);
  // Field errors appear once the human has started editing, not on arrival.
  const [touched, setTouched] = createSignal(!!editingId);
  const [models] = createResource(() => api.models().catch(() => []));
  // The engine the goal will run on: the contract's, else the settings' default.
  const engine = () => effectiveEngine(c.engine, state.settings?.engine);
  const modelOptions = () => [
    { value: "", label: t("common.engineDefault", { engine: engineLabel(engine()) }) },
    ...modelsFor(models() ?? [], engine()).map((m) => ({ value: `${m.provider}/${m.id}`, label: engine() === "claude-code" ? m.name : `${m.provider}/${m.id}` })),
  ];

  // Changes before the initial values are in place do not count as edits.
  let loaded = false;
  onMount(async () => {
    setTimeout(() => (loaded = true), 300);
    if (editingId) {
      const d = await api.goal(editingId);
      setTitle(d.summary.title);
      setProjectId(d.summary.project_id);
      setC(structuredClone(d.contract));
    } else {
      const project = state.projects.find((p) => p.id === projectId());
      const intent = sessionStorage.getItem("tower.draftIntent") ?? "";
      sessionStorage.removeItem("tower.draftIntent");
      setC(blank(intent, project?.test_command ?? null));
      setTitle(intent.slice(0, 48));
    }
  });

  // Validate as the human types, with the supervisor's own rules.
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
  /** Why the primary action is disabled, in one line. */
  const reason = () => (errors().length ? errors()[0].message : null);

  const addCriterion = (kind: Kind) => {
    const n = c.criteria.length + 1;
    let id = `C${n}`;
    while (c.criteria.some((x) => x.id === id)) id = `C${Number(id.slice(1)) + 1}`;
    const cr: Criterion =
      kind === "exec"
        ? { id, title: "", kind: { type: "exec", command: "", timeout_secs: 600 } }
        : kind === "look"
          ? { id, title: "", kind: { type: "look", start: "", url: "http://localhost:3000/", timeout_secs: 60 } }
          : { id, title: "", kind: { type: "human" } };
    setC("criteria", (list) => [...list, cr]);
  };
  const setKind = (i: number, fn: (k: Criterion["kind"]) => void) => setC("criteria", i, "kind", produce(fn));

  const save = async (ratify: boolean) => {
    const contract = structuredClone(unwrap(c));
    setBusy(true);
    try {
      if (props.amendId) {
        const ok = await act(() => api.amendContract(props.amendId!, contract), t("contract.amended"));
        if (ok !== undefined) back();
      } else if (props.draftId) {
        await act(() => api.updateDraft(props.draftId!, title(), contract));
        if (ratify) await act(() => api.ratify(props.draftId!), t("contract.ratified"));
        go({ name: "goal", id: props.draftId });
      } else {
        const g = await act(() =>
          api.createGoal({ project_id: projectId(), title: title().trim() || contract.intent.slice(0, 48), contract, ratify }),
        );
        if (g) go({ name: "goal", id: g.id });
      }
    } finally {
      setBusy(false);
    }
  };

  useKeys([{ key: "mod+enter", run: () => !errors().length && void save(true), inInputs: true }]);

  const autonomyDesc = () => t(`contract.${c.autonomy}Desc`);
  const projectName = () => state.projects.find((p) => p.id === projectId())?.name ?? "";
  // The masthead's state word: what this document is — a new contract, a draft being edited, or an amendment of version n.
  const mastState = () => (props.amendId ? t("contract.mastAmend", { v: c.version }) : props.draftId ? t("contract.mastDraft") : t("contract.mastNew"));

  /** A clause head: its number in tabular figures, its title in the tracked voice, a hairline to the edge, and the clause's own actions after it. */
  const ClauseHead = (p: { n: number; title: string; children?: JSX.Element }) => (
    <header class="clause-head halt">
      <span class="clause-no num" aria-hidden="true">
        {String(p.n).padStart(2, "0")}
      </span>
      <h2 class="clause-title">{p.title}</h2>
      <span class="clause-rule" aria-hidden="true" />
      {p.children}
    </header>
  );

  return (
    <div class="editor">
      <div class="editor-main">
        {/* The document's masthead, in the wordmark's voice: what it is, whose, and its state. */}
        <div class="contract-mast halt">
          <span class="contract-mast-word">{t("contract.mast")}</span>
          <Show when={projectName()}>
            <span class="sep">·</span>
            <span class="contract-mast-project">{projectName()}</span>
          </Show>
          <span class="sep">·</span>
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
          <Show when={!editingId}>
            <BaseTestsNotice projectId={projectId()} />
          </Show>
          <Field label={t("contract.intent")} hint={t("contract.intentHint")} error={issueFor("intent")}>
            <textarea rows={2} class="reading" value={c.intent} onInput={(e) => setC("intent", e.currentTarget.value)} placeholder={t("contract.intentPlaceholder")} />
          </Field>
          <Field label={t("contract.doneWhen")} hint={t("contract.doneWhenHint")}>
            <textarea rows={2} value={c.done_when} onInput={(e) => setC("done_when", e.currentTarget.value)} />
          </Field>
          <Field label={t("contract.stopConditions")} hint={t("contract.stopConditionsHint")}>
            <textarea
              rows={2}
              value={c.stop_conditions.join("\n")}
              onInput={(e) => setC("stop_conditions", lines(e.currentTarget.value))}
              placeholder={t("contract.stopConditionsPlaceholder")}
            />
          </Field>
          <Field label={t("contract.constraints")}>
            <textarea rows={2} value={c.constraints.join("\n")} onInput={(e) => setC("constraints", lines(e.currentTarget.value))} placeholder={t("contract.constraintsPlaceholder")} />
          </Field>
        </div>

        <div class="editor-block">
          <ClauseHead n={2} title={t("contract.criteria")}>
            <Button size="s" variant="ghost" onClick={() => addCriterion("exec")}>
              <Icon name="plus" size={10} />
              {t("contract.addCommand")}
            </Button>
            <Button size="s" variant="ghost" onClick={() => addCriterion("look")} title={t("contract.lookHint")}>
              <Icon name="plus" size={10} />
              {t("contract.addLook")}
            </Button>
            <Button size="s" variant="ghost" onClick={() => addCriterion("human")}>
              <Icon name="plus" size={10} />
              {t("contract.addHuman")}
            </Button>
          </ClauseHead>
          <p class="field-hint" style={{ "margin-bottom": "12px" }}>
            {t("contract.criteriaHint")}
          </p>
          <For each={c.criteria}>
            {(cr, i) => (
              <div class="criterion-edit" classList={{ "criterion-edit-look": cr.kind.type === "look" }}>
                <span class="num">{cr.id}</span>
                <input
                  value={cr.title}
                  aria-label={`${cr.id} ${t("contract.criterionTitle")}`}
                  placeholder={cr.kind.type === "look" ? t("contract.lookTitlePlaceholder") : t("contract.criterionTitle")}
                  onInput={(e) => setC("criteria", i(), "title", e.currentTarget.value)}
                />
                {/* A look criterion's timeout is how long Tower waits for the page, not how long a command may run: its unit says so. */}
                <Show when={cr.kind.type !== "human"} fallback={<span class="meta">{t("contract.humanCheck")}</span>}>
                  <span class="unit-wrap timeout" classList={{ "timeout-look": cr.kind.type === "look" }}>
                    <input
                      class="num"
                      type="number"
                      min="1"
                      value={(cr.kind as { timeout_secs: number }).timeout_secs}
                      title={t("contract.timeout")}
                      aria-label={`${cr.id} ${t("contract.timeout")}`}
                      onInput={(e) => setKind(i(), (k) => { if (k.type !== "human") k.timeout_secs = Number(e.currentTarget.value) || 1; })}
                    />
                    <span class="unit">{cr.kind.type === "look" ? t("contract.secondsReachable") : t("contract.seconds")}</span>
                  </span>
                </Show>
                <IconButton icon="cross" size={24} label={t("common.delete")} onClick={() => setC("criteria", (l) => l.filter((_, j) => j !== i()))} />
                <Show when={cr.kind.type === "exec"}>
                  <input
                    class="mono criterion-cmd-row"
                    aria-label={`${cr.id} ${t("contract.addCommand")}`}
                    value={(cr.kind as { command: string }).command}
                    placeholder="pnpm test -- checkout"
                    onInput={(e) => setKind(i(), (k) => { if (k.type === "exec") k.command = e.currentTarget.value; })}
                  />
                </Show>
                {/* A "look" criterion: Tower starts the app, waits for the URL, and photographs base and snapshot for you to compare. */}
                <Show when={cr.kind.type === "look"}>
                  <div class="criterion-cmd-row look-fields">
                    <input
                      class="mono"
                      aria-label={`${cr.id} ${t("contract.lookStart")}`}
                      value={(cr.kind as { start: string }).start}
                      placeholder={t("contract.lookStartPlaceholder")}
                      onInput={(e) => setKind(i(), (k) => { if (k.type === "look") k.start = e.currentTarget.value; })}
                    />
                    <input
                      class="mono"
                      aria-label={`${cr.id} ${t("contract.lookUrl")}`}
                      value={(cr.kind as { url: string }).url}
                      placeholder="http://localhost:3000/checkout"
                      onInput={(e) => setKind(i(), (k) => { if (k.type === "look") k.url = e.currentTarget.value; })}
                    />
                  </div>
                  <span class="criterion-cmd-row field-hint">{t("contract.lookHint")}</span>
                </Show>
              </div>
            )}
          </For>
          <Show when={issueFor("criteria")}>
            <p class="field-warn">{issueFor("criteria")}</p>
          </Show>
          <Field label={t("contract.setup")} hint={t("contract.setupHint")}>
            <input class="mono" value={c.setup} onInput={(e) => setC("setup", e.currentTarget.value)} placeholder="pnpm install --frozen-lockfile" />
          </Field>
        </div>

        <div class="editor-block">
          <ClauseHead n={3} title={t("contract.scope")} />
          <p class="field-hint" style={{ "margin-bottom": "12px" }}>
            {t("contract.scopeHint")}
          </p>
          <div class="editor-grid3">
            <Field label={t("contract.include")}>
              <textarea class="mono" rows={2} value={c.scope.include.join("\n")} onInput={(e) => setC("scope", "include", lines(e.currentTarget.value))} placeholder={t("contract.includePlaceholder")} />
            </Field>
            <Field label={t("contract.exclude")}>
              <textarea class="mono" rows={2} value={c.scope.exclude.join("\n")} onInput={(e) => setC("scope", "exclude", lines(e.currentTarget.value))} />
            </Field>
            <Field label={t("contract.readonly")}>
              <textarea class="mono" rows={2} value={c.scope.readonly.join("\n")} onInput={(e) => setC("scope", "readonly", lines(e.currentTarget.value))} placeholder="**/__snapshots__/**" />
            </Field>
          </div>
          <Show when={issueFor("scope.include") ?? issueFor("scope.exclude") ?? issueFor("scope.readonly")}>
            <p class="field-error">{issueFor("scope.include") ?? issueFor("scope.exclude") ?? issueFor("scope.readonly")}</p>
          </Show>
        </div>

        <div class="editor-foot">
          <Button variant="ghost" onClick={back}>
            {t("common.cancel")}
          </Button>
          <span class="reason">{touched() ? reason() : ""}</span>
          <Show
            when={props.amendId}
            fallback={
              <>
                <Button busy={busy()} onClick={() => save(false)}>
                  {t("contract.saveDraft")}
                </Button>
                <Button variant="primary" busy={busy()} disabled={errors().length > 0} onClick={() => save(true)} kbd="mod+enter">
                  {t("contract.ratifyStart")}
                </Button>
              </>
            }
          >
            <Button variant="primary" busy={busy()} disabled={errors().length > 0} onClick={() => save(true)} kbd="mod+enter">
              {t("contract.ratifyAmend")}
            </Button>
          </Show>
        </div>
      </div>

      {/* The schedule: the dials, numbered on from the clauses. */}
      <aside class="editor-side">
        <div class="editor-block">
          <ClauseHead n={4} title={t("contract.autonomy")} />
          {/* Three levels; in a narrow window the descriptions fold into tooltips and only the chosen one stays as a line. */}
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
          <p class="field-hint autonomy-current">{autonomyDesc()}</p>
          <p class="field-hint">{t("contract.oneWayNote")}</p>
        </div>
        <div class="editor-block">
          <ClauseHead n={5} title={t("contract.budget")} />
          <div class="editor-grid2">
            <Field label={t("contract.softCap")} error={issueFor("budget")} unit="$" unitLeft>
              <input class="num" type="number" step="0.5" min="0" value={c.budget.soft_usd} onInput={(e) => setC("budget", "soft_usd", Number(e.currentTarget.value))} />
            </Field>
            <Field label={t("contract.hardCap")} unit="$" unitLeft>
              <input class="num" type="number" step="0.5" min="0" value={c.budget.hard_usd} onInput={(e) => setC("budget", "hard_usd", Number(e.currentTarget.value))} />
            </Field>
            <Field label={t("contract.wallClock")} unit={t("contract.minutes")}>
              <input class="num" type="number" min="1" value={c.budget.wall_minutes} onInput={(e) => setC("budget", "wall_minutes", Number(e.currentTarget.value) || 1)} />
            </Field>
            <Field label={t("contract.maxRework")} unit={t("contract.times")}>
              <input class="num" type="number" min="0" max="10" value={c.max_rework} onInput={(e) => setC("max_rework", Number(e.currentTarget.value) || 0)} />
            </Field>
          </div>
        </div>
        <div class="editor-block">
          <ClauseHead n={6} title={t("contract.isolation")} />
          <Toggle checked={c.network} onChange={(v) => setC("network", v)} label={t("contract.network")} hint={t("contract.networkHint")} />
        </div>
        <div class="editor-block">
          <ClauseHead n={7} title={t("contract.engine")} />
          {/* The engine picker filters the model list: Pi's providers for Pi, Claude Code's aliases for Claude Code. */}
          <Field label={t("contract.engine")} hint={engine() === "claude-code" ? t("settings.engineTrust") : undefined}>
            <Select
              value={c.engine}
              options={[{ value: "", label: t("contract.engineDefault", { engine: engineLabel(effectiveEngine("", state.settings?.engine)) }) }, ...engineOptions()]}
              onChange={(v) => {
                setC("engine", v);
                setC("model", "");
              }}
            />
          </Field>
          <Field label={t("contract.model")} hint={engine() === "claude-code" ? t("contract.modelHintClaude") : t("contract.modelHint")}>
            <Select value={c.model} options={modelOptions()} onChange={(v) => setC("model", v)} />
          </Field>
          <Show when={engine() !== "claude-code"}>
            <Field label={t("contract.thinking")}>
              <Select value={c.thinking} options={thinkingOptions()} onChange={(v) => setC("thinking", v)} />
            </Field>
          </Show>
        </div>
      </aside>
    </div>
  );
}
