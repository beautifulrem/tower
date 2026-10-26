/** First run: what Tower is, environment checks, and adding a repository. */
import { open } from "@tauri-apps/plugin-dialog";
import { For, Show } from "solid-js";

import { Button } from "../components/ui";
import { api } from "../lib/api";
import { act, refreshProjects, state } from "../lib/store";

export async function pickProject() {
  const dir = await open({ directory: true, multiple: false, title: "选择一个 git 仓库" });
  if (typeof dir !== "string") return;
  const p = await act(() => api.addProject(dir), "已添加项目");
  if (p) await refreshProjects();
}

export function Welcome() {
  return (
    <div class="welcome">
      <div class="welcome-mark" aria-hidden="true">
        <svg width="56" height="56" viewBox="0 0 56 56">
          <circle cx="28" cy="29" r="15" fill="none" stroke="var(--text-1)" stroke-width="3" />
          <circle cx="28" cy="29" r="6" fill="var(--text-1)" />
          <path d="M40 9 L46 15 L40 21 L34 15 Z" fill="var(--st-attention)" />
        </svg>
      </div>
      <h1 class="welcome-title">让 Agent 去做，你只看结果和证据</h1>
      <p class="welcome-lede">
        Tower 以目标为中心监督编程 Agent。每个目标是一份合同：意图、可执行的验收标准、范围和预算。Agent
        在隔离的工作区里工作；它说“完成”只是声明，Tower 会在干净环境里重跑验收标准，最后由你验收。
      </p>
      <div class="welcome-points">
        <div>
          <b>事实与声明分开</b>
          <span>绿色只属于验证器在干净环境中的结论，Agent 说的话永远不会变绿。</span>
        </div>
        <div>
          <b>只在需要你时打扰你</b>
          <span>问题、审批和暂停进入“需要你”，其余时间界面保持安静。</span>
        </div>
        <div>
          <b>你的仓库不被触碰</b>
          <span>Agent 在私有克隆中工作；验收后 Tower 只在你的仓库新建一个本地分支，从不推送。</span>
        </div>
      </div>
      <Show when={state.env && state.env.problems.length > 0}>
        <div class="welcome-problems">
          <For each={state.env!.problems}>{(p) => <div class="meta">◇ {p}</div>}</For>
        </div>
      </Show>
      <Button variant="primary" onClick={pickProject}>
        添加一个 git 仓库
      </Button>
    </div>
  );
}
