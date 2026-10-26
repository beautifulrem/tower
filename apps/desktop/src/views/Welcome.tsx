/**
 * First run: what Tower is, the grammar shown on a sample card, an
 * environment check that says how to fix each problem, and adding a
 * repository. Two columns: the idea on the left, the checklist on the right.
 *
 * Without Pi the demo is the only path that works, so it is the primary
 * action; with Pi, adding a repository is.
 */
import { For, type JSX, Show, createResource } from "solid-js";

import { DemoButton, demoMissing, openPiLogin, pickProject } from "../components/Demo";
import { DangerMark, Icon, LifecycleGlyph, NoticeMark, Seal } from "../components/Glyph";
import { Claim, CriteriaBar } from "../components/Honesty";
import { Button, Wordmark } from "../components/ui";
import type { EnvIssue } from "../gen/EnvIssue";
import type { LifecycleState } from "../gen/LifecycleState";
import { api } from "../lib/api";
import { t } from "../lib/i18n";
import { envIssueLabel, hasIssue, installHint, stateLabel } from "../lib/labels";
import { refreshEnvironment, state, toast } from "../lib/store";

/**
 * A check row. Tower's own self-tests are facts, not verifier verdicts, so a
 * passing check is a quiet mark — green stays with the verifier. A fix (a
 * command to copy, or an action) always takes its own line under the text.
 */
function Check(props: { ok: boolean | null; blocking?: boolean; title: string; detail?: JSX.Element; fix?: string | null; action?: JSX.Element }) {
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
            toast("success", t("welcome.copied"));
          }}
        >
          {props.fix}
        </button>
      </Show>
      <Show when={props.action}>
        <div class="check-action">{props.action}</div>
      </Show>
    </div>
  );
}

/** The six stations of a goal's life, in the order the board shows them; the last two are verified, so they are green. */
const LIFE: Array<{ state: LifecycleState; verified: boolean }> = [
  { state: "draft", verified: false },
  { state: "running", verified: false },
  { state: "claimed", verified: false },
  { state: "verifying", verified: false },
  { state: "in_review", verified: true },
  { state: "accepted", verified: true },
];

/**
 * A goal's life in Tower's own glyphs: ring, half-disc, dashed claim, the
 * verifier filling it in, the check, the seal — each with its word, joined
 * by hairlines like a route. The one picture that says what Tower does
 * without a sentence: the agent's "done" is the dashed station in the
 * middle, and green begins only after the verifier.
 */
function LifeLine() {
  return (
    <ol class="welcome-life halt" aria-label={t("welcome.life")}>
      <For each={LIFE}>
        {(s) => (
          <li class="welcome-station">
            <LifecycleGlyph goal={{ state: s.state, progress: { verified: s.verified ? 1 : 0, observed: 0, machine: 1, human: 0, human_done: 0 }, verified_pin: s.verified ? "a4a90b2" : null }} size={14} />
            <span class="welcome-station-word">{stateLabel(s.state)}</span>
          </li>
        )}
      </For>
    </ol>
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
  const claudeIssue = () => issues().find((i) => i.kind === "claude_missing");
  const modelCount = () => (models.loading ? null : (models() ?? []).length);
  const sandbox = () => (env() ? !hasIssue(env(), "no_sandbox") : null);
  const other = () => issues().filter((i) => !["pi_missing", "pi_broken", "pi_too_old", "pi_untested", "git_missing", "no_sandbox", "claude_missing"].includes(i.kind));
  const fixFor = (i: EnvIssue | undefined) => i?.fix ?? undefined;
  // Without a working Pi, the demo is the way in.
  const demoPrimary = () => piOk() === false || (piOk() === true && modelCount() === 0);

  return (
    <div class="welcome">
      <div class="welcome-main">
        <Wordmark />
        <h1 class="welcome-title">{t("welcome.title")}</h1>
        <p class="welcome-lede">{t("welcome.lede")}</p>
        <LifeLine />
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
            title={piOk() ? `Pi ${env()?.pi_version ?? ""}` : piIssue() ? envIssueLabel(piIssue()!, env()) : t("welcome.piMissing")}
            detail={piOk() ? (piNote() ? envIssueLabel(piNote()!, env()) : env()?.pi_path ?? undefined) : state.settings?.engine === "claude-code" ? t("welcome.piNotEngine") : t("welcome.piWhat")}
            fix={piOk() === false ? (fixFor(piIssue()) ?? "npm i -g @earendil-works/pi-coding-agent") : undefined}
          />
          <Show when={piOk()}>
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
              action={
                modelCount() === 0 ? (
                  <>
                    <Button size="s" onClick={openPiLogin}>
                      {t("welcome.openPiLogin")}
                    </Button>
                    <span>{t("welcome.openPiLoginHint")}</span>
                  </>
                ) : undefined
              }
            />
          </Show>
          {/* Claude Code as the chosen engine: its own check, with the trust model in one line. */}
          <Show when={state.settings?.engine === "claude-code"}>
            <Check
              ok={env() ? !claudeIssue() : null}
              title={claudeIssue() ? envIssueLabel(claudeIssue()!, env()) : t("welcome.claudeOk")}
              detail={t("settings.engineTrust")}
              fix={claudeIssue()?.fix ?? undefined}
            />
          </Show>
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
          <For each={other()}>{(i) => <Check ok={false} blocking={i.blocking} title={envIssueLabel(i, env())} fix={i.fix} />}</For>
          <Show when={demoMissing().length}>
            <Check
              ok={false}
              blocking={false}
              title={t("welcome.demoNeeds", { tools: demoMissing().join(", ") })}
              fix={demoMissing().map(installHint).join(" && ")}
            />
          </Show>
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
            <DemoButton variant={demoPrimary() ? "primary" : "ghost"} />
            <Button variant={demoPrimary() ? "default" : "primary"} onClick={pickProject}>
              {t("welcome.addRepo")}
            </Button>
          </span>
        </div>
      </div>
    </div>
  );
}
