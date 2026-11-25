/**
 * Six-Step Verification Bench Readout: mark · id · title & command · readings,
 * paired with a lean Evidence Strip + Honesty lines underneath.
 */
import { For, Show, createMemo, createSignal, lazy } from "solid-js";

import { Icon, NotEvidenceMark, ResultMark } from "../../components/Glyph";
import { BaselineLine, CanaryLine, HeldOutLine, LoopbackLine, ObsChip } from "../../components/Honesty";
import type { SentinelHit } from "../../gen/SentinelHit";
import { api } from "../../lib/api";
import { heldOrTampered } from "../../lib/discounted";
import { ago, duration, short } from "../../lib/format";
import { t, withLater } from "../../lib/i18n";
import { act, state } from "../../lib/store";
import { type ExtCriterionView, qualifiers } from "./ext";

const LookStrip = lazy(withLater(() => import("../Learning").then((m) => ({ default: m.LookStrip }))));

export function CriterionRow(props: { goalId: string; c: ExtCriterionView; state: string; base?: string | null; sentinels?: SentinelHit[]; told?: boolean }) {
  const c = () => props.c;
  const v = () => c().verified;
  const [open, setOpen] = createSignal(false);
  const [stepsOpen, setStepsOpen] = createSignal(false);
  const human = () => c().criterion.kind.type !== "exec";
  const look = () => (c().criterion.kind.type === "look" ? (c().criterion.kind as { url: string; steps?: string[] }) : null);
  const steps = () => look()?.steps ?? [];
  const mark = () => (!v() ? "pending" : v()!.stale ? "stale" : v()!.passed ? "pass" : "fail");
  const proof = () => v()?.held_out_proof ?? null;

  // What qualifies the reading, each fact once: the same list the verification readout draws.
  const shown = createMemo(() => qualifiers(c(), props.sentinels));
  // Folded, a criterion is its verdict and at most one line of what qualifies it — warnings only; the confirmations,
  // the held-out files, the baseline and canary readings and the output are one click away.
  const strip = () => (open() ? shown().filter((p) => !p[3]) : shown().filter(([tone]) => tone !== "ok" && tone !== "fact"));

  const hoItems = createMemo<[string, string][]>(() => {
    const p = proof();
    if (!p?.ran.length) return [];
    return [
      ...p.ran.map((f): [string, string] => ["ev-hf ev-hf-ran", `✓ ${f}`]),
      ...p.not_ran.map((f): [string, string] => ["ev-hf ev-hf-miss", `✕ ${f}`]),
      ...p.unprovable.map((f): [string, string] => ["ev-hf", `○ ${f}`]),
    ];
  });

  return (
    <div class="criterion" classList={{ stale: !!v()?.stale }}>
      <div class="criterion-row" classList={{ clickable: !!v() }}>
        <Show
          when={!human()}
          fallback={
            <label class="hit-28" onClick={(e) => e.stopPropagation()}>
              <input type="checkbox" class="human-check" checked={c().human_checked} disabled={!["in_review", "verifying", "running", "paused", "claimed"].includes(props.state)} onChange={(e) => void act(() => api.humanCheck(props.goalId, c().criterion.id, e.currentTarget.checked))} title={t("goal.humanCriterionTitle")} aria-label={`${c().criterion.id} ${c().criterion.title}`} />
            </label>
          }
        >
          <Show when={heldOrTampered(c(), props.sentinels) && mark() === "pass"} fallback={<ResultMark kind={mark()} />}>
            <NotEvidenceMark />
          </Show>
        </Show>
        <span class="num t3">{c().criterion.id}</span>
        <span class="criterion-main">
          <span class="criterion-title">{c().criterion.title}</span>
          <Show when={!human()}><code class="criterion-cmd code-val">{(c().criterion.kind as { command: string }).command}</code></Show>
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
          fallback={<span class="col-span t3">{human() ? (c().human_checked ? t("goal.youChecked") : t("goal.awaitingCheck")) : t("goal.awaitingVerify")}</span>}
        >
          <button class="col-click col-result" onClick={() => setOpen((o) => !o)} title={`${t("goal.viewOutput")}, ${duration(v()!.duration_ms)}, @${short(v()!.pin)}`} aria-expanded={open()}>
            <span class="sr-only">{t("honesty.srVerified")} </span>
            {v()!.passed ? t("common.passed") : t("common.failed")}
          </button>
          <button class="col-click col-dur" onClick={() => setOpen((o) => !o)} title={t("goal.viewOutput")} tabindex="-1" aria-hidden="true">{duration(v()!.duration_ms)}</button>
          <button class="col-click col-pin" onClick={() => setOpen((o) => !o)} title={t("honesty.measured")} tabindex="-1" aria-hidden="true"><Icon name="harness" size={10} />@{short(v()!.pin)}</button>
          <span class="col-age">{ago(v()!.at, state.now)}</span>
        </Show>
      </div>

      <Show when={strip().length}>
        <div class="ev-strip" aria-label={t("goal.evidence")} onClick={() => v() && setOpen(true)}>
          <For each={strip()}>{([tone, label, title]) => <span class={`ev-pill ev-pill-${tone}`} data-mark={tone} title={title}>{label}</span>}</For>
        </div>
      </Show>

      <Show when={open() || !v()}>
        <BaselineLine c={c()} base={props.base} told={props.told} />
        <CanaryLine c={c()} />
        {/* The held-out line names them ("held-out tests, for you only"); the files follow it, unnamed again. */}
        <HeldOutLine c={c()} />
        <Show when={hoItems().length}>
          <div class="ev-holdout-files" title={t("goal.heldOutLong")}>
            <For each={hoItems()}>{([cls, text]) => <span class={cls}>{text}</span>}</For>
          </div>
        </Show>
        <LoopbackLine c={c()} />
      </Show>
      <Show when={stepsOpen() && steps().length}>
        <ol class="look-step-list look-step-list-read">
          <For each={steps()}>{(s, i) => <li class="look-step"><span class="look-step-no num" aria-hidden="true">{String(i() + 1).padStart(2, "0")}</span><code class="code-val">{s}</code></li>}</For>
        </ol>
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
      <Show when={open() && v()}><pre class="output-tail">{v()!.output_tail || t("common.noOutput")}</pre></Show>
    </div>
  );
}
