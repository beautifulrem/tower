/** Settings: engine, defaults, concurrency, projects, environment health. */
import { For, Show, createResource, createSignal, onMount } from "solid-js";

import { Button, Field } from "../components/ui";
import type { ProjectView } from "../gen/ProjectView";
import type { Settings as SettingsT } from "../gen/Settings";
import { api } from "../lib/api";
import { act, refreshEnvironment, refreshProjects, state } from "../lib/store";
import { pickProject } from "./Welcome";

export function Settings() {
  const [s, setS] = createSignal<SettingsT | null>(null);
  const [models] = createResource(() => api.models().catch(() => []));
  onMount(async () => setS(await api.settings()));

  const save = async () => {
    const v = s();
    if (!v) return;
    await act(() => api.saveSettings(v), "设置已保存");
    await refreshEnvironment();
  };
  const patch = (p: Partial<SettingsT>) => setS((cur) => (cur ? { ...cur, ...p } : cur));

  return (
    <div class="settings">
      <section class="settings-block">
        <h2 class="section-title">环境</h2>
        <dl class="kv">
          <dt>Pi</dt>
          <dd class="mono">
            <Show when={state.env?.pi_path} fallback={<span class="t2">没有找到</span>}>
              {state.env!.pi_path} <span class="t2">{state.env?.pi_version ?? "（无法运行）"}</span>
            </Show>
          </dd>
          <dt>git</dt>
          <dd class="mono">{state.env?.git_version ?? "没有找到"}</dd>
          <dt>数据目录</dt>
          <dd class="mono">{state.env?.data_dir}</dd>
        </dl>
        <For each={state.env?.problems ?? []}>{(p) => <p class="meta">◇ {p}</p>}</For>
      </section>

      <Show when={s()}>
        <section class="settings-block">
          <h2 class="section-title">引擎与默认值</h2>
          <Field label="pi 可执行文件" hint="留空则在你登录 shell 的 PATH 中查找。">
            <input class="mono" value={s()!.pi_path} onInput={(e) => patch({ pi_path: e.currentTarget.value })} placeholder="/opt/homebrew/bin/pi" />
          </Field>
          <div class="editor-grid2">
            <Field label="默认模型">
              <select value={s()!.default_model} onChange={(e) => patch({ default_model: e.currentTarget.value })}>
                <option value="">Pi 默认</option>
                <For each={models() ?? []}>{(m) => <option value={`${m.provider}/${m.id}`}>{m.provider}/{m.id}</option>}</For>
              </select>
            </Field>
            <Field label="默认思考强度">
              <select value={s()!.default_thinking} onChange={(e) => patch({ default_thinking: e.currentTarget.value })}>
                <For each={["", "off", "minimal", "low", "medium", "high", "xhigh"]}>{(t) => <option value={t}>{t || "Pi 默认"}</option>}</For>
              </select>
            </Field>
            <Field label="同时运行的目标上限" hint="超出的目标排队等待。">
              <input class="num" type="number" min="1" max="10" value={s()!.max_concurrent} onInput={(e) => patch({ max_concurrent: Number(e.currentTarget.value) || 1 })} />
            </Field>
          </div>
          <label class="check">
            <input type="checkbox" checked={s()!.load_user_extensions} onChange={(e) => patch({ load_user_extensions: e.currentTarget.checked })} />
            <span>
              在目标运行中加载我的 Pi 扩展
              <span class="meta"> 扩展在沙箱之外以你的权限运行；只在你信任它们时打开。</span>
            </span>
          </label>
          <div class="row">
            <Button variant="primary" onClick={save}>
              保存
            </Button>
          </div>
        </section>
      </Show>

      <section class="settings-block">
        <div class="row">
          <h2 class="section-title grow">项目</h2>
          <Button size="s" onClick={pickProject}>
            添加仓库
          </Button>
        </div>
        <For each={state.projects} fallback={<p class="meta">还没有项目。</p>}>{(p) => <ProjectRow p={p} />}</For>
      </section>
    </div>
  );
}

function ProjectRow(props: { p: ProjectView }) {
  const [branch, setBranch] = createSignal(props.p.base_branch);
  const [test, setTest] = createSignal(props.p.test_command ?? "");
  const dirty = () => branch() !== props.p.base_branch || test() !== (props.p.test_command ?? "");
  return (
    <div class="project-row">
      <div class="col grow">
        <b>{props.p.name}</b>
        <span class="mono meta">{props.p.root}</span>
      </div>
      <Field label="基线分支">
        <input class="mono narrow-m" value={branch()} onInput={(e) => setBranch(e.currentTarget.value)} />
      </Field>
      <Field label="测试命令">
        <input class="mono" value={test()} onInput={(e) => setTest(e.currentTarget.value)} placeholder="pnpm test" />
      </Field>
      <Show when={dirty()}>
        <Button size="s" variant="primary" onClick={async () => { await act(() => api.updateProject(props.p.id, branch(), test() || null), "已保存"); await refreshProjects(); }}>
          保存
        </Button>
      </Show>
      <Button
        size="s"
        variant="ghost"
        onClick={async () => {
          if (confirm(`移除项目 ${props.p.name}？不会删除你的仓库。`)) {
            await act(() => api.removeProject(props.p.id), "已移除");
            await refreshProjects();
          }
        }}
      >
        移除
      </Button>
    </div>
  );
}
