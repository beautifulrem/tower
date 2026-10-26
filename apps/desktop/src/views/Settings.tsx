/** Settings: engine, defaults, memory, projects, appearance, environment. */
import { For, Show, createResource, createSignal, onMount } from "solid-js";

import { Button, Field } from "../components/ui";
import type { ProjectView } from "../gen/ProjectView";
import type { Settings as SettingsT } from "../gen/Settings";
import { api } from "../lib/api";
import { act, refreshEnvironment, refreshProjects, state } from "../lib/store";
import { type ThemeChoice, setThemeChoice, themeChoice } from "../lib/theme";
import { pickProject } from "./Welcome";

const lines = (s: string) =>
  s
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);

export function Settings() {
  const [s, setS] = createSignal<SettingsT | null>(null);
  const [models] = createResource(() => api.models().catch(() => []));
  const [theme, setTheme] = createSignal<ThemeChoice>(themeChoice());
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
            <Field label="Agent 写给你的语言">
              <select value={s()!.language} onChange={(e) => patch({ language: e.currentTarget.value })}>
                <option value="zh-CN">简体中文</option>
                <option value="en">English</option>
              </select>
            </Field>
          </div>
          <Field label="额外加载的 Pi 扩展（每行一个文件）" hint="只加载这里列出的扩展，例如提供模型的扩展包。它们在沙箱之外运行。">
            <textarea
              class="mono"
              rows={2}
              value={s()!.extra_extensions.join("\n")}
              onInput={(e) => patch({ extra_extensions: lines(e.currentTarget.value) })}
              placeholder="~/.pi/agent/npm/node_modules/pi-clinepass-provider/src/index.ts"
            />
          </Field>
          <label class="check">
            <input type="checkbox" checked={s()!.load_user_extensions} onChange={(e) => patch({ load_user_extensions: e.currentTarget.checked })} />
            <span>
              加载我全部的 Pi 扩展
              <span class="meta"> 扩展在沙箱之外以你的权限运行；只在你信任它们时打开。</span>
            </span>
          </label>
          <Field label="编辑器命令" hint="“打开 → 在编辑器中打开”使用它。留空则依次尝试 cursor、code、zed。">
            <input class="mono" value={s()!.editor} onInput={(e) => patch({ editor: e.currentTarget.value })} placeholder="code" />
          </Field>
        </section>

        <section class="settings-block">
          <h2 class="section-title">你的记忆</h2>
          <p class="field-hint">写给每个目标的 Agent 的长期偏好，例如代码风格、不能碰的东西。会原样出现在它的系统提示里（最多约 800 字）。</p>
          <textarea
            rows={4}
            value={s()!.user_memory}
            onInput={(e) => patch({ user_memory: e.currentTarget.value })}
            placeholder={"提交前先跑类型检查\n不要引入新的运行时依赖"}
          />
        </section>

        <div class="settings-save">
          <Button variant="primary" onClick={save}>
            保存设置
          </Button>
        </div>
      </Show>

      <section class="settings-block">
        <div class="row">
          <h2 class="section-title grow">项目</h2>
          <Button size="s" onClick={pickProject}>
            添加仓库
          </Button>
        </div>
        <For each={state.projects} fallback={<p class="meta">还没有项目。</p>}>
          {(p) => <ProjectRow p={p} />}
        </For>
      </section>

      <section class="settings-block">
        <h2 class="section-title">外观</h2>
        <div class="row">
          <For each={["system", "light", "dark"] as ThemeChoice[]}>
            {(t) => (
              <label class="radio">
                <input
                  type="radio"
                  name="theme"
                  checked={theme() === t}
                  onChange={() => {
                    setThemeChoice(t);
                    setTheme(t);
                  }}
                />
                <span>{{ system: "跟随系统", light: "浅色", dark: "深色" }[t]}</span>
              </label>
            )}
          </For>
        </div>
      </section>
    </div>
  );
}

function ProjectRow(props: { p: ProjectView }) {
  const [branch, setBranch] = createSignal(props.p.base_branch);
  const [test, setTest] = createSignal(props.p.test_command ?? "");
  const [local, setLocal] = createSignal(props.p.local_files.join("\n"));
  const [memory, setMemory] = createSignal(props.p.memory);
  const dirty = () =>
    branch() !== props.p.base_branch ||
    test() !== (props.p.test_command ?? "") ||
    local() !== props.p.local_files.join("\n") ||
    memory() !== props.p.memory;
  const save = async () => {
    await act(
      () =>
        api.updateProject(props.p.id, {
          base_branch: branch().trim(),
          test_command: test().trim() || null,
          local_files: lines(local()),
          memory: memory(),
        }),
      "项目已保存",
    );
    await refreshProjects();
  };
  return (
    <div class="project">
      <div class="project-head">
        <div class="col grow">
          <b>{props.p.name}</b>
          <span class="mono meta">{props.p.root}</span>
        </div>
        <Show when={dirty()}>
          <Button size="s" variant="primary" onClick={save}>
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
      <div class="editor-grid2">
        <Field label="基线分支" hint="Agent 从这个分支开始；验收后的分支也以它为基础。">
          <input class="mono" value={branch()} onInput={(e) => setBranch(e.currentTarget.value)} />
        </Field>
        <Field label="测试命令" hint="快速开始的目标用它作为验收标准。">
          <input class="mono" value={test()} onInput={(e) => setTest(e.currentTarget.value)} placeholder="pnpm test" />
        </Field>
        <Field label="本地文件（每行一个模式）" hint="被 git 忽略、但测试需要的文件，如 .env。会复制进工作区与验证检出，对 Agent 可见。">
          <textarea class="mono" rows={3} value={local()} onInput={(e) => setLocal(e.currentTarget.value)} placeholder={".env\nconfig/*.local.json"} />
        </Field>
        <Field label="项目记忆" hint="这个项目的约定，注入给它的每个目标。">
          <textarea rows={3} value={memory()} onInput={(e) => setMemory(e.currentTarget.value)} placeholder="金额一律用 Money 类型，不用 number" />
        </Field>
      </div>
    </div>
  );
}
