/**
 * First run: what Tower is, an environment check that says how to fix each
 * problem, and adding a repository.
 */
import { open } from "@tauri-apps/plugin-dialog";
import { For, type JSX, Show, createResource } from "solid-js";

import { Button } from "../components/ui";
import { api } from "../lib/api";
import { act, refreshEnvironment, refreshProjects, state, toast } from "../lib/store";

export async function pickProject() {
  const dir = await open({ directory: true, multiple: false, title: "选择一个 git 仓库" });
  if (typeof dir !== "string") return;
  const p = await act(() => api.addProject(dir), "已添加项目");
  if (p) await refreshProjects();
}

function Check(props: { ok: boolean | null; title: string; detail?: JSX.Element; fix?: string }) {
  return (
    <div class="check-row">
      <span class="check-mark" classList={{ "result-pass": props.ok === true, "mark-danger": props.ok === false }}>
        {props.ok === null ? "·" : props.ok ? "✓" : "■"}
      </span>
      <div class="col grow">
        <span class="t1">{props.title}</span>
        <Show when={props.detail}>
          <span class="meta">{props.detail}</span>
        </Show>
      </div>
      <Show when={props.fix}>
        <button
          class="fix code-val"
          title="点击复制"
          onClick={() => {
            void navigator.clipboard.writeText(props.fix!);
            toast("info", "已复制，在终端中运行后点“重新检查”");
          }}
        >
          {props.fix}
        </button>
      </Show>
    </div>
  );
}

export function Welcome() {
  const [models, { refetch }] = createResource(() => api.models().catch(() => null));
  const env = () => state.env;
  const piOk = () => (env() ? !!env()!.pi_version : null);
  const modelCount = () => (models.loading ? null : (models() ?? []).length);
  const sandbox = () => (env() ? !env()!.problems.some((p) => p.includes("沙箱")) : null);

  return (
    <div class="welcome">
      <h1 class="welcome-title">让 Agent 去做，你只看结果和证据</h1>
      <p class="welcome-lede">
        Tower 以目标为中心监督编程 Agent。每个目标是一份合同：意图、可执行的验收标准、范围和预算。Agent 在隔离的工作区里工作；它说“完成”只是声明，Tower
        会在干净环境里重跑验收标准，最后由你验收。
      </p>
      <div class="welcome-points">
        <div>
          <b>事实与声明分开</b>
          <span>绿色只属于验证器在干净环境中的结论，Agent 说的话永远不会变绿。</span>
        </div>
        <div>
          <b>只在需要你时打扰</b>
          <span>问题、审批和暂停进入“需要你”，其余时间界面保持安静。</span>
        </div>
        <div>
          <b>你的仓库不被触碰</b>
          <span>Agent 在私有克隆中工作；验收后只在你的仓库新建一个本地分支，推送由你决定。</span>
        </div>
      </div>

      <section class="checks">
        <h2 class="section-title">环境检查</h2>
        <Check
          ok={piOk()}
          title={piOk() ? `Pi ${env()?.pi_version ?? ""}` : "没有找到 Pi"}
          detail={piOk() ? env()?.pi_path ?? undefined : "Tower 用 Pi 作为 Agent 引擎。"}
          fix={piOk() === false ? "npm i -g @earendil-works/pi-coding-agent" : undefined}
        />
        <Check
          ok={modelCount() === null ? null : modelCount()! > 0}
          title={modelCount() === null ? "正在查询可用模型…" : modelCount()! > 0 ? `${modelCount()} 个可用模型` : "Pi 还没有可用的模型"}
          detail={modelCount() === 0 ? "在终端运行 pi，输入 /login 登录一个模型服务；或在设置中加载提供模型的扩展。" : undefined}
          fix={modelCount() === 0 ? "pi" : undefined}
        />
        <Check
          ok={env() ? !!env()!.git_version : null}
          title={env()?.git_version ?? "没有找到 git"}
          fix={env() && !env()!.git_version ? "xcode-select --install" : undefined}
        />
        <Check
          ok={sandbox()}
          title={sandbox() ? "macOS 沙箱可用" : "没有 OS 沙箱"}
          detail={sandbox() ? "Agent 的命令只能写它自己的工作区，读不到你的凭据。" : "Agent 的命令将以你的权限运行，只受门禁约束。"}
        />
        <For each={(env()?.problems ?? []).filter((p) => !p.includes("沙箱") && !p.includes("pi") && !p.includes("git"))}>
          {(p) => <Check ok={false} title={p} />}
        </For>
        <button
          class="link meta"
          onClick={async () => {
            await refreshEnvironment();
            await refetch();
          }}
        >
          重新检查
        </button>
      </section>

      <Button variant="primary" onClick={pickProject}>
        添加一个 git 仓库
      </Button>
    </div>
  );
}
