/**
 * One criterion as an instrument row: mark · id · title and command, then
 * the readings — result · duration · pin · age — each in its own column;
 * under it the baseline line, the held-out line, the screenshots and the
 * agent's own observation.
 */
import { Show, createSignal, lazy } from "solid-js";

import { Icon, NotEvidenceMark, ResultMark } from "../../components/Glyph";
import { BaselineLine, CanaryLine, HeldOutLine, LoopbackLine, ObsChip } from "../../components/Honesty";
import { LookStepsRead } from "../../components/LookSteps";
import type { CriterionView } from "../../gen/CriterionView";
import { api } from "../../lib/api";
import { ago, duration, short } from "../../lib/format";
import { t, withLater } from "../../lib/i18n";
import { act, state } from "../../lib/store";

// The screenshots of look criteria load on first use, so start-up stays small.
const LookStrip = lazy(withLater(() => import("../../components/Look").then((m) => ({ default: m.LookStrip }))));

/**
 * One criterion as an instrument row: mark · id · title and command, then
 * the readings — result · duration · pin · age — each in its own column.
 */
export function CriterionRow(props: { goalId: string; c: CriterionView; state: string; base?: string | null }) {
  const c = () => props.c;
  const v = () => c().verified;
  const [open, setOpen] = createSignal(false);
  // Human and "look" criteria are both judged by you; only exec ones have a verifier verdict.
  const human = () => c().criterion.kind.type !== "exec";
  const look = () => (c().criterion.kind.type === "look" ? (c().criterion.kind as { url: string; steps?: string[] }) : null);
  // A look criterion's steps before the picture are part of the contract: counted on the row, listed on a click.
  const steps = () => look()?.steps ?? [];
  const [stepsOpen, setStepsOpen] = createSignal(false);
  const mark = () => {
    if (!v()) return "pending";
    if (v()!.stale) return "stale";
    return v()!.passed ? "pass" : "fail";
  };
  return (
    <div class="criterion" classList={{ stale: !!v()?.stale }}>
      <div class="criterion-row" classList={{ clickable: !!v() }}>
        <Show
          when={!human()}
          fallback={
            <label class="hit-28" onClick={(e) => e.stopPropagation()}>
              <input
                type="checkbox"
                class="human-check"
                checked={c().human_checked}
                disabled={!["in_review", "verifying", "running", "paused", "claimed"].includes(props.state)}
                onChange={(e) => void act(() => api.humanCheck(props.goalId, c().criterion.id, e.currentTarget.checked))}
                title={t("goal.humanCriterionTitle")}
                aria-label={`${c().criterion.id} ${c().criterion.title}`}
              />
            </label>
          }
        >
          <Show when={c().canary === "tampered" && mark() === "pass"} fallback={<ResultMark kind={mark()} />}>
            <NotEvidenceMark />
          </Show>
        </Show>
        <span class="num t3">{c().criterion.id}</span>
        <span class="criterion-main">
          <span class="criterion-title">{c().criterion.title}</span>
          <Show when={!human()}>
            <code class="criterion-cmd code-val">{(c().criterion.kind as { command: string }).command}</code>
          </Show>
          <Show when={look()}>{(l) => <code class="criterion-cmd code-val">{l().url}</code>}</Show>
          <Show when={steps().length}>
            <button class="link-quiet text-btn look-steps-toggle meta" aria-expanded={stepsOpen()} title={t("look.stepsTitle")} onClick={() => setStepsOpen((o) => !o)}>
              {t("look.steps", { n: steps().length })}
              <Icon name={stepsOpen() ? "caret-down" : "caret-right"} size={10} />
            </button>
          </Show>
        </span>
        <Show
          when={v()}
          fallback={
            <span class="col-span t3">
              {human() ? (c().human_checked ? t("goal.youChecked") : t("goal.awaitingCheck")) : t("goal.awaitingVerify")}
            </span>
          }
        >
          <button
            class="col-click col-result"
            onClick={() => setOpen((o) => !o)}
            title={`${t("goal.viewOutput")} · ${duration(v()!.duration_ms)} · @${short(v()!.pin)}`}
            aria-expanded={open()}
          >
            <span class="sr-only">{t("honesty.srVerified")} </span>
            {v()!.passed ? t("common.passed") : t("common.failed")}
          </button>
          <button class="col-click col-dur" onClick={() => setOpen((o) => !o)} title={t("goal.viewOutput")} tabindex="-1" aria-hidden="true">
            {duration(v()!.duration_ms)}
          </button>
          <button class="col-click col-pin" onClick={() => setOpen((o) => !o)} title={t("honesty.measured")} tabindex="-1" aria-hidden="true">
            <Icon name="harness" size={10} />@{short(v()!.pin)}
          </button>
          <span class="col-age">{ago(v()!.at, state.now)}</span>
        </Show>
      </div>
      <BaselineLine c={c()} base={props.base} />
      <CanaryLine c={c()} />
      <HeldOutLine c={c()} />
      <LoopbackLine c={c()} />
      <Show when={stepsOpen() && steps().length}>
        <LookStepsRead steps={steps()} />
      </Show>
      <Show when={c().look}>{(l) => <LookStrip look={l()} title={`${c().criterion.id} ${c().criterion.title}`} />}</Show>
      <Show when={c().observed}>
        <div class="criterion-row criterion-obs">
          <ResultMark kind={c().observed!.passed ? "obs-pass" : "obs-fail"} />
          <span />
          <span class="col-span">
            <ObsChip title={t("goal.observedTitle")} />
            <span>{c().observed!.passed ? t("common.passed") : t("common.failed")}</span>
            <span class="col-age">{ago(c().observed!.at, state.now)}</span>
          </span>
        </div>
      </Show>
      <Show when={open() && v()}>
        <pre class="output-tail">{v()!.output_tail || t("common.noOutput")}</pre>
      </Show>
    </div>
  );
}
