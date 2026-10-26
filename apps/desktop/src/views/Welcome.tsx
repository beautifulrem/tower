/**
 * First run: what Tower is, an environment check that says how to fix each
 * problem, and adding a repository.
 */
import { open } from "@tauri-apps/plugin-dialog";
import { For, type JSX, Show, createResource } from "solid-js";

import { Button } from "../components/ui";
import { api } from "../lib/api";
import { t } from "../lib/i18n";
import { act, refreshEnvironment, refreshProjects, state, toast } from "../lib/store";

/**
 * Environment problems arrive as text in the language they were produced in;
 * the sandbox one is recognised in both.
 */
export function isSandboxProblem(p: string): boolean {
  return /沙箱|sandbox/i.test(p);
}

export async function pickProject() {
  const dir = await open({ directory: true, multiple: false, title: t("welcome.pickRepo") });
  if (typeof dir !== "string") return;
  const p = await act(() => api.addProject(dir), t("welcome.projectAdded"));
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
          title={t("welcome.clickToCopy")}
          onClick={() => {
            void navigator.clipboard.writeText(props.fix!);
            toast("info", t("welcome.copied"));
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
  const sandbox = () => (env() ? !env()!.problems.some(isSandboxProblem) : null);

  return (
    <div class="welcome">
      <h1 class="welcome-title">{t("welcome.title")}</h1>
      <p class="welcome-lede">{t("welcome.lede")}</p>
      <div class="welcome-points">
        <div>
          <b>{t("welcome.factsTitle")}</b>
          <span>{t("welcome.factsBody")}</span>
        </div>
        <div>
          <b>{t("welcome.quietTitle")}</b>
          <span>{t("welcome.quietBody")}</span>
        </div>
        <div>
          <b>{t("welcome.repoTitle")}</b>
          <span>{t("welcome.repoBody")}</span>
        </div>
      </div>

      <section class="checks">
        <h2 class="section-title">{t("welcome.envCheck")}</h2>
        <Check
          ok={piOk()}
          title={piOk() ? `Pi ${env()?.pi_version ?? ""}` : t("welcome.piMissing")}
          detail={piOk() ? env()?.pi_path ?? undefined : t("welcome.piWhat")}
          fix={piOk() === false ? "npm i -g @earendil-works/pi-coding-agent" : undefined}
        />
        <Check
          ok={modelCount() === null ? null : modelCount()! > 0}
          title={
            modelCount() === null
              ? t("welcome.modelsLoading")
              : modelCount()! > 0
                ? t("welcome.models", { n: modelCount()! })
                : t("welcome.noModels")
          }
          detail={modelCount() === 0 ? t("welcome.noModelsHint") : undefined}
          fix={modelCount() === 0 ? "pi" : undefined}
        />
        <Check
          ok={env() ? !!env()!.git_version : null}
          title={env()?.git_version ?? t("welcome.gitMissing")}
          fix={env() && !env()!.git_version ? "xcode-select --install" : undefined}
        />
        <Check
          ok={sandbox()}
          title={sandbox() ? t("welcome.sandboxOk") : t("welcome.sandboxMissing")}
          detail={sandbox() ? t("welcome.sandboxOkDetail") : t("welcome.sandboxMissingDetail")}
        />
        <For each={(env()?.problems ?? []).filter((p) => !isSandboxProblem(p) && !/pi|git/i.test(p))}>
          {(p) => <Check ok={false} title={p} />}
        </For>
        <button
          class="link meta"
          onClick={async () => {
            await refreshEnvironment();
            await refetch();
          }}
        >
          {t("welcome.recheck")}
        </button>
      </section>

      <Button variant="primary" onClick={pickProject}>
        {t("welcome.addRepo")}
      </Button>
    </div>
  );
}
