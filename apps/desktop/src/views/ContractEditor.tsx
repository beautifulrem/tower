/**
 * Contract editor (docs/04 §4.10): intent, executable criteria, scope fence,
 * budget and autonomy. Red-light hints come from the same validation the
 * supervisor uses to refuse ratification.
 */
import { For, Show, createEffect, createResource, createSignal, on, onMount } from "solid-js";
import { createStore, produce, unwrap } from "solid-js/store";

import { Button, Field, Kbd } from "../components/ui";
import type { Contract } from "../gen/Contract";
import type { ContractIssue } from "../gen/ContractIssue";
import type { Criterion } from "../gen/Criterion";
import { api } from "../lib/api";
import { useKeys } from "../lib/keys";
import { back, go } from "../lib/nav";
import { act, state } from "../lib/store";

function blank(intent = "", testCommand: string | null = null): Contract {
  return {
    version: 1,
    intent,
    done_when: "",
    constraints: [],
    criteria: testCommand
      ? [{ id: "C1", title: "现有测试全部通过", kind: { type: "exec", command: testCommand, timeout_secs: 600 } }]
      : [],
    scope: { include: [], exclude: [], readonly: [] },
    budget: { soft_usd: 5, hard_usd: 8, wall_minutes: 90 },
    autonomy: "standard",
    max_rework: 3,
    setup: "",
    model: state.settings?.default_model ?? "",
    thinking: state.settings?.default_thinking ?? "",
  };
}

const lines = (s: string) => s.split("\n").map((x) => x.trim()).filter(Boolean);

export function ContractEditor(props: { projectId?: string; draftId?: string; amendId?: string }) {
  const editingId = props.draftId ?? props.amendId;
  const [projectId, setProjectId] = createSignal(props.projectId ?? state.projects[0]?.id ?? "");
  const [title, setTitle] = createSignal("");
  const [c, setC] = createStore<Contract>(blank());
  const [issues, setIssues] = createSignal<ContractIssue[]>([]);
  const [busy, setBusy] = createSignal(false);
  const [models] = createResource(() => api.models().catch(() => []));

  onMount(async () => {
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
        clearTimeout(vt);
        vt = window.setTimeout(async () => setIssues(await api.validateContract(unwrap(c)).catch(() => [])), 200);
      },
    ),
  );

  const errors = () => issues().filter((i) => i.level === "error");
  const issueFor = (field: string) => issues().find((i) => i.field === field)?.message ?? null;

  const addCriterion = (kind: "exec" | "human") => {
    const n = c.criteria.length + 1;
    let id = `C${n}`;
    while (c.criteria.some((x) => x.id === id)) id = `C${Number(id.slice(1)) + 1}`;
    const cr: Criterion =
      kind === "exec"
        ? { id, title: "", kind: { type: "exec", command: "", timeout_secs: 600 } }
        : { id, title: "", kind: { type: "human" } };
    setC("criteria", (list) => [...list, cr]);
  };

  const save = async (ratify: boolean) => {
    const contract = structuredClone(unwrap(c));
    setBusy(true);
    try {
      if (props.amendId) {
        const ok = await act(() => api.amendContract(props.amendId!, contract), "合同已修订，下次运行生效");
        if (ok !== undefined) back();
      } else if (props.draftId) {
        await act(() => api.updateDraft(props.draftId!, title(), contract));
        if (ratify) await act(() => api.ratify(props.draftId!), "合同已批准");
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

  return (
    <div class="editor">
      <div class="editor-main">
        <Show when={!editingId && state.projects.length > 1}>
          <Field label="项目">
            <select value={projectId()} onChange={(e) => setProjectId(e.currentTarget.value)}>
              <For each={state.projects}>{(p) => <option value={p.id}>{p.name}</option>}</For>
            </select>
          </Field>
        </Show>
        <Field label="标题">
          <input value={title()} onInput={(e) => setTitle(e.currentTarget.value)} placeholder="修复结账重复扣款" disabled={!!props.amendId} />
        </Field>
        <Field label="目的" hint="用你的话说清楚为什么要做、要达到什么结果。Agent 会把它当作首要依据。" error={issueFor("intent")}>
          <textarea rows={3} class="reading" value={c.intent} onInput={(e) => setC("intent", e.currentTarget.value)} placeholder="同一订单在任何重试路径下只扣款一次" />
        </Field>
        <Field label="终态（可选）" hint="验收标准之外，“完成”还意味着什么。">
          <textarea rows={2} value={c.done_when} onInput={(e) => setC("done_when", e.currentTarget.value)} />
        </Field>
        <Field label="约束（每行一条）">
          <textarea rows={2} value={c.constraints.join("\n")} onInput={(e) => setC("constraints", lines(e.currentTarget.value))} placeholder={"不改公共 API\n不加新依赖"} />
        </Field>

        <div class="editor-block">
          <div class="editor-block-head">
            <h2 class="section-title">验收标准</h2>
            <span class="grow" />
            <Button size="s" onClick={() => addCriterion("exec")}>
              + 命令
            </Button>
            <Button size="s" variant="ghost" onClick={() => addCriterion("human")}>
              + 人工
            </Button>
          </div>
          <p class="field-hint">命令标准由 Tower 在干净环境中执行，退出码为 0 即通过——这是“已验证”的唯一来源。人工标准由你勾选，不计入已验证。</p>
          <For each={c.criteria}>
            {(cr, i) => (
              <div class="criterion-edit">
                <span class="num t3">{cr.id}</span>
                <input class="grow" value={cr.title} placeholder="说明" onInput={(e) => setC("criteria", i(), "title", e.currentTarget.value)} />
                <Show when={cr.kind.type === "exec"} fallback={<span class="meta">人工勾选</span>}>
                  <input
                    class="mono grow"
                    value={(cr.kind as { command: string }).command}
                    placeholder="pnpm test -- checkout"
                    onInput={(e) => setC("criteria", i(), "kind", produce((k: Criterion["kind"]) => { if (k.type === "exec") k.command = e.currentTarget.value; }))}
                  />
                  <input
                    class="num narrow"
                    type="number"
                    min="1"
                    value={(cr.kind as { timeout_secs: number }).timeout_secs}
                    title="超时（秒）"
                    onInput={(e) => setC("criteria", i(), "kind", produce((k: Criterion["kind"]) => { if (k.type === "exec") k.timeout_secs = Number(e.currentTarget.value) || 1; }))}
                  />
                </Show>
                <button class="link meta" onClick={() => setC("criteria", (l) => l.filter((_, j) => j !== i()))}>
                  删除
                </button>
              </div>
            )}
          </For>
          <Show when={issueFor("criteria")}>
            <p class="field-warn">{issueFor("criteria")}</p>
          </Show>
          <Field label="验证前的准备命令（可选）" hint="在干净检出中先运行一次，例如安装依赖。留空则按锁文件自动判断。">
            <input class="mono" value={c.setup} onInput={(e) => setC("setup", e.currentTarget.value)} placeholder="pnpm install --frozen-lockfile" />
          </Field>
        </div>

        <div class="editor-block">
          <h2 class="section-title">范围围栏</h2>
          <p class="field-hint">每行一个路径模式（如 src/**）。Agent 写围栏之外的文件需要你批准；评审时围栏外的改动排在最前。</p>
          <div class="editor-grid3">
            <Field label="可以改">
              <textarea class="mono" rows={3} value={c.scope.include.join("\n")} onInput={(e) => setC("scope", "include", lines(e.currentTarget.value))} placeholder="留空 = 整个仓库" />
            </Field>
            <Field label="不能改">
              <textarea class="mono" rows={3} value={c.scope.exclude.join("\n")} onInput={(e) => setC("scope", "exclude", lines(e.currentTarget.value))} />
            </Field>
            <Field label="只读">
              <textarea class="mono" rows={3} value={c.scope.readonly.join("\n")} onInput={(e) => setC("scope", "readonly", lines(e.currentTarget.value))} placeholder="**/__snapshots__/**" />
            </Field>
          </div>
          <Show when={issueFor("scope.include") ?? issueFor("scope.exclude") ?? issueFor("scope.readonly")}>
            <p class="field-error">{issueFor("scope.include") ?? issueFor("scope.exclude") ?? issueFor("scope.readonly")}</p>
          </Show>
        </div>
      </div>

      <aside class="editor-side">
        <div class="editor-block">
          <h2 class="section-title">自主度</h2>
          <For each={[["cautious", "谨慎", "非只读命令都先问你"], ["standard", "标准", "范围内编辑、跑测试直接做；加依赖、改 CI、递归删除先问"], ["autonomous", "自主", "只有单向门先问"]] as const}>
            {([v, name, desc]) => (
              <label class="radio">
                <input type="radio" name="autonomy" checked={c.autonomy === v} onChange={() => setC("autonomy", v)} />
                <span>
                  <b>{name}</b>
                  <span class="meta"> {desc}</span>
                </span>
              </label>
            )}
          </For>
          <p class="meta">推送、发布、改写历史在任何档位都先问你。</p>
        </div>
        <div class="editor-block">
          <h2 class="section-title">预算</h2>
          <div class="editor-grid2">
            <Field label="软上限 $" error={issueFor("budget")}>
              <input class="num" type="number" step="0.5" min="0" value={c.budget.soft_usd} onInput={(e) => setC("budget", "soft_usd", Number(e.currentTarget.value))} />
            </Field>
            <Field label="硬上限 $">
              <input class="num" type="number" step="0.5" min="0" value={c.budget.hard_usd} onInput={(e) => setC("budget", "hard_usd", Number(e.currentTarget.value))} />
            </Field>
            <Field label="单次运行墙钟（分）">
              <input class="num" type="number" min="1" value={c.budget.wall_minutes} onInput={(e) => setC("budget", "wall_minutes", Number(e.currentTarget.value) || 1)} />
            </Field>
            <Field label="自动返工上限">
              <input class="num" type="number" min="0" max="10" value={c.max_rework} onInput={(e) => setC("max_rework", Number(e.currentTarget.value) || 0)} />
            </Field>
          </div>
        </div>
        <div class="editor-block">
          <h2 class="section-title">引擎</h2>
          <Field label="模型" hint="来自你的 Pi 配置。">
            <select value={c.model} onChange={(e) => setC("model", e.currentTarget.value)}>
              <option value="">Pi 默认</option>
              <For each={models() ?? []}>{(m) => <option value={`${m.provider}/${m.id}`}>{m.provider}/{m.id}</option>}</For>
            </select>
          </Field>
          <Field label="思考强度">
            <select value={c.thinking} onChange={(e) => setC("thinking", e.currentTarget.value)}>
              <For each={["", "off", "minimal", "low", "medium", "high", "xhigh"]}>{(t) => <option value={t}>{t || "Pi 默认"}</option>}</For>
            </select>
          </Field>
        </div>
        <div class="editor-actions">
          <Show when={errors().length}>
            <div class="panel-blockers">
              <For each={errors()}>{(e) => <div>■ {e.message}</div>}</For>
            </div>
          </Show>
          <Show
            when={props.amendId}
            fallback={
              <>
                <Button variant="primary" busy={busy()} disabled={errors().length > 0} onClick={() => save(true)}>
                  批准并开始 <Kbd k="mod+enter" />
                </Button>
                <Button busy={busy()} onClick={() => save(false)}>
                  保存为草稿
                </Button>
              </>
            }
          >
            <Button variant="primary" busy={busy()} disabled={errors().length > 0} onClick={() => save(true)}>
              批准修订 <Kbd k="mod+enter" />
            </Button>
          </Show>
          <Button variant="ghost" onClick={back}>
            取消
          </Button>
        </div>
      </aside>
    </div>
  );
}
