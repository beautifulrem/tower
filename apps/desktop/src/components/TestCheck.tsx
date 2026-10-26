/**
 * The project's test command, run once on a clean copy of its base branch
 * (`ProjectView.test_check`). Nothing runs on its own — setup may reach the
 * network — so a project that was never checked offers the check. Shown
 * quietly: one line in Settings with the output on demand, and a one-line
 * notice wherever a goal is created when the tests already fail on base
 * (the first criterion would then be red→green evidence) or cannot run
 * (the goal would pause at verification).
 */
import { Show, createSignal } from "solid-js";

import type { ProjectView } from "../gen/ProjectView";
import { api } from "../lib/api";
import { duration } from "../lib/format";
import { t } from "../lib/i18n";
import { act, refreshProjects, state } from "../lib/store";
import { Icon, NoticeMark, ResultMark } from "./Glyph";
import { Button } from "./ui";

export function TestCheckLine(props: { p: ProjectView }) {
  const c = () => props.p.test_check;
  const [open, setOpen] = createSignal(false);
  const [busy, setBusy] = createSignal(false);
  const recheck = async () => {
    setBusy(true);
    await act(() => api.checkProject(props.p.id));
    await refreshProjects();
    setBusy(false);
  };
  const text = () => {
    const x = c()!;
    if (x.passed === null) return t("settings.testCheckRunning");
    if (x.env_error) return t("settings.testCheckEnv");
    return x.passed ? t("settings.testCheckPass", { base: x.base, dur: duration(x.duration_ms, false) }) : t("settings.testCheckFail", { base: x.base });
  };
  return (
    <div class="test-check">
      <Show
        when={c()}
        fallback={
          <Show when={props.p.test_command}>
            <div class="fact-row">
              <ResultMark kind="pending" title={t("settings.testCheckNone", { base: props.p.base_branch })} />
              <span class="meta t2">{t("settings.testCheckNone", { base: props.p.base_branch })}</span>
              <span class="grow" />
              <Button size="s" variant="ghost" busy={busy()} onClick={() => void recheck()} title={t("settings.checkTestsHint")}>
                {t("settings.checkTests", { base: props.p.base_branch })}
              </Button>
            </div>
          </Show>
        }
      >
        <div class="fact-row">
          <Show when={c()!.passed !== null} fallback={<ResultMark kind="pending" title={t("settings.testCheckRunning")} />}>
            <Show when={!c()!.env_error} fallback={<ResultMark kind="env" />}>
              <ResultMark kind={c()!.passed ? "pass" : "fail"} />
            </Show>
          </Show>
          <span class="meta t1">{text()}</span>
          <span class="code-val t3 ellipsis">{c()!.command}</span>
          <span class="grow" />
          {/* Two ghost buttons, one form: the output toggle is not a link. */}
          <Show when={c()!.output_tail}>
            <Button size="s" variant="ghost" aria-expanded={open()} aria-pressed={open()} onClick={() => setOpen((o) => !o)}>
              {open() ? t("trace.hideOutput") : t("settings.testCheckOutput")}
            </Button>
          </Show>
          <Button size="s" variant="ghost" busy={busy()} disabled={c()!.passed === null} onClick={() => void recheck()}>
            {t("settings.recheck")}
          </Button>
        </div>
        <Show when={open()}>
          <pre class="output-tail">{c()!.output_tail}</pre>
        </Show>
      </Show>
    </div>
  );
}

/** One line where a goal starts, only when the base is already red or the command cannot run. */
export function BaseTestsNotice(props: { projectId?: string }) {
  const check = () => state.projects.find((p) => p.id === props.projectId)?.test_check ?? null;
  const problem = () => {
    const c = check();
    if (!c || c.passed === null || c.passed) return null;
    return c.env_error ? t("overview.baseTestsEnv") : t("overview.baseTestsFail", { base: c.base });
  };
  return (
    <Show when={problem()}>
      <div class="base-tests meta">
        <Show when={check()!.env_error} fallback={<Icon name="harness" size={10} class="t3" />}>
          <NoticeMark />
        </Show>
        <span>{problem()}</span>
      </div>
    </Show>
  );
}
