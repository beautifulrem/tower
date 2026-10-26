/**
 * First run: what Tower is, the grammar shown on a sample card, an
 * environment check that says how to fix each problem, and adding a
 * repository. Two columns: the idea on the left, the checklist on the right.
 */
import { open } from "@tauri-apps/plugin-dialog";
import { For, type JSX, Show, createResource } from "solid-js";

import { DangerMark, Icon, NoticeMark, Seal } from "../components/Glyph";
import { Claim, CriteriaBar } from "../components/Honesty";
import { Button } from "../components/ui";
import type { EnvIssue } from "../gen/EnvIssue";
import { api } from "../lib/api";
import { t } from "../lib/i18n";
import { hasIssue } from "../lib/labels";
import { go } from "../lib/nav";
import { act, refreshEnvironment, refreshProjects, state, toast } from "../lib/store";

export async function pickProject() {
  const dir = await open({ directory: true, multiple: false, title: t("welcome.pickRepo") });
  if (typeof dir !== "string") return;
  const p = await act(() => api.addProject(dir), t("welcome.projectAdded"));
  if (p) await refreshProjects();
}

/** A demo goal on the bundled engine: asks, fixes, verifies, waits for review. */
export async function startDemo() {
  const g = await act(api.startDemo);
  if (!g) return;
  await refreshProjects();
  go({ name: "goal", id: g.id });
}

/**
 * A check row. Tower's own self-tests are facts, not verifier verdicts, so a
 * passing check is a quiet mark — green stays with the verifier.
 */
function Check(props: { ok: boolean | null; blocking?: boolean; title: string; detail?: JSX.Element; fix?: string | null }) {
  return (
    <div class="check-row">
      <span class="check-mark" classList={{ pending: props.ok === null }}>
        <Show when={props.ok !== null} fallback={<Icon name="dot" size={10} />}>
          <Show when={props.ok} fallback={props.blocking === false ? <NoticeMark /> : <DangerMark />}>
            <Icon name="check" size={10} />
          </Show>
        </Show>
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

/** The honesty grammar on one static card: facts, a claim and the seal. */
function SampleCard() {
  return (
    <div class="welcome-sample" aria-hidden="true">
      <div class="row">
        <Seal pin="a4a90b2" />
        <span class="sep">·</span>
        <CriteriaBar progress={{ verified: 2, observed: 1, machine: 2, human: 0, human_done: 0 }} compact />
      </div>
      <Claim kind={t("claimKind.cause")}>{t("welcome.sampleClaim")}</Claim>
    </div>
  );
}

export function Welcome() {
  const [models, { refetch }] = createResource(() => api.models().catch(() => null));
  const env = () => state.env;
  const issues = () => env()?.issues ?? [];
  const piIssue = () => issues().find((i) => i.kind === "pi_missing" || i.kind === "pi_broken" || i.kind === "pi_too_old");
  const piNote = () => issues().find((i) => i.kind === "pi_untested");
  const piOk = () => (env() ? !piIssue() && !!env()!.pi_version : null);
  const modelCount = () => (models.loading ? null : (models() ?? []).length);
  const sandbox = () => (env() ? !hasIssue(env(), "no_sandbox") : null);
  const other = () => issues().filter((i) => !["pi_missing", "pi_broken", "pi_too_old", "pi_untested", "git_missing", "no_sandbox"].includes(i.kind));
  const fixFor = (i: EnvIssue | undefined) => i?.fix ?? undefined;

  return (
    <div class="welcome">
      <div class="welcome-main">
        <h1 class="welcome-title">{t("welcome.title")}</h1>
        <p class="welcome-lede">{t("welcome.lede")}</p>
        <SampleCard />
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
      </div>

      <div class="welcome-side">
        <section class="checks">
          <h2 class="section-title">{t("welcome.envCheck")}</h2>
          <Check
            ok={piOk()}
            title={piOk() ? `Pi ${env()?.pi_version ?? ""}` : (piIssue()?.text ?? t("welcome.piMissing"))}
            detail={piOk() ? (piNote()?.text ?? env()?.pi_path ?? undefined) : t("welcome.piWhat")}
            fix={piOk() === false ? (fixFor(piIssue()) ?? "npm i -g @earendil-works/pi-coding-agent") : undefined}
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
            fix={env() && !env()!.git_version ? (fixFor(issues().find((i) => i.kind === "git_missing")) ?? "xcode-select --install") : undefined}
          />
          <Check
            ok={sandbox()}
            blocking={false}
            title={sandbox() ? t("welcome.sandboxOk") : t("welcome.sandboxMissing")}
            detail={sandbox() ? t("welcome.sandboxOkDetail") : t("welcome.sandboxMissingDetail")}
          />
          <For each={other()}>{(i) => <Check ok={false} blocking={i.blocking} title={i.text} fix={i.fix} />}</For>
        </section>
        <div class="welcome-actions">
          <Button
            variant="ghost"
            onClick={async () => {
              await refreshEnvironment();
              await refetch();
            }}
          >
            {t("welcome.recheck")}
          </Button>
          <span class="row">
            <Button variant="ghost" onClick={() => void startDemo()} title={t("welcome.demoHint")}>
              {t("welcome.tryDemo")}
            </Button>
            <Button variant="primary" onClick={pickProject}>
              {t("welcome.addRepo")}
            </Button>
          </span>
        </div>
      </div>
    </div>
  );
}
