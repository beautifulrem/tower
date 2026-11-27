/**
 * Precision Contract Rail: intent, visual scope-fence chips, dual budget &
 * wall-clock burn meters, layered escalation status, sandbox tier, cross-goal
 * dependencies, merge-queue position, and branch.
 */
import { For, Show } from "solid-js";

import { LifecycleGlyph } from "../../components/Glyph";
import { IconButton, Kbd } from "../../components/ui";
import { usd, usdLimit } from "../../lib/format";
import { t } from "../../lib/i18n";
import { effectiveEngine, engineLabel, hasIssue } from "../../lib/labels";
import { go } from "../../lib/nav";
import { state, toast } from "../../lib/store";
import { type ExtGoalDetail, sandboxTag, trustLabel, trustTierOf } from "./ext";

const pct = (a: number, b: number) => (b <= 0 || a <= 0 ? "0%" : (a / b) * 100 < 1 ? "<1%" : `${Math.round((a / b) * 100)}%`);

export function ContractRail(props: { d: ExtGoalDetail }) {
  const c = () => props.d.contract;
  const g = () => props.d.summary;
  const eng = () => effectiveEngine(c().engine, state.settings?.engine);
  const model = () => c().model || state.settings?.default_model || "";
  const escModel = () => props.d.escalated_model || c().escalation_model || "";
  const escAfter = () => c().escalation_after_reworks ?? 2;
  const escOn = () => !!props.d.escalated_model || (!!c().escalation_model && g().rework_cycles >= escAfter());
  const deps = () => c().depends_on ?? g().depends_on ?? [];
  const mqPos = () => props.d.merge_queue_position ?? null;
  const fill = () => Math.min(100, (g().cost_usd / Math.max(g().budget.hard_usd, 0.01)) * 100);
  const softPct = () => Math.min(100, (g().budget.soft_usd / Math.max(g().budget.hard_usd, 0.01)) * 100);
  const elapsed = () => Math.max(0, Math.floor((state.now - (g().run_started_at ?? state.now)) / 60_000));
  const scopeRows = () => [
    [t("goal.include"), c().scope.include, ""],
    ...(c().scope.exclude.length ? [[t("goal.exclude"), c().scope.exclude, "rail-paths-exclude"]] : []),
    ...(c().scope.readonly.length ? [[t("contract.readonly"), c().scope.readonly, ""]] : []),
  ] as [string, string[], string][];

  return (
    <div class="rail">
      <div class="rail-block">
        <div class="rail-head"><span>{t("goal.contractSummary", { v: c().version })}</span><span class="grow" /><Kbd k="shift+e" /></div>
        <dl class="rail-dl">
          <dt>{t("goal.intent")}</dt><dd class="reading">{c().intent}</dd>
          <Show when={c().done_when}><dt>{t("goal.doneWhen")}</dt><dd>{c().done_when}</dd></Show>
          <Show when={c().constraints.length}><dt>{t("goal.constraints")}</dt><dd><For each={c().constraints}>{(k) => <div>{k}</div>}</For></dd></Show>
        </dl>
      </div>

      <div class="rail-block">
        <div class="rail-head">{t("goal.scope")}</div>
        <dl class="rail-dl">
          <For each={scopeRows()}>
            {([lbl, list, cls]) => (
              <>
                <dt>{lbl}</dt>
                <dd>
                  <Show when={list.length} fallback={<span class="meta t2">{t("goal.wholeRepo")}</span>}>
                    <span class={`rail-paths code-val ${cls}`}>{list.join(", ")}</span>
                  </Show>
                </dd>
              </>
            )}
          </For>
          <Show when={g().port_base != null}><dt title={t("contract.ports")}>{t("contract.portsShort")}</dt><dd class="code-val t2">{g().port_base}–{g().port_base! + 9}</dd></Show>
        </dl>
      </div>

      <div class="rail-block">
        <div class="rail-head">{t("goal.budget")}</div>
        <div class="budget">
          <div class="budget-bar" title={t("goal.budgetTitle")}>
            <span class="budget-fill" classList={{ over: g().cost_usd >= g().budget.soft_usd, some: g().cost_usd > 0 }} style={{ width: `${fill()}%` }} />
            <span class="budget-soft" style={{ left: `${softPct()}%` }} />
          </div>
          <div class="meta num budget-line">
            <span class="t1">{t("goal.budgetLine", { spent: usd(g().cost_usd), soft: usdLimit(g().budget.soft_usd), pct: pct(g().cost_usd, g().budget.soft_usd) })}</span>
            <span>{t("goal.hardCap", { v: usdLimit(g().budget.hard_usd) })}</span>
          </div>
          <Show when={g().run_started_at}>
            <div class="burn-sub">
              <div class="burn-bar"><span class="burn-fill" classList={{ over: elapsed() > g().budget.wall_minutes }} style={{ width: `${Math.min(100, (elapsed() / Math.max(g().budget.wall_minutes, 1)) * 100)}%` }} /></div>
              <span class="meta num" classList={{ "over-wall": elapsed() > g().budget.wall_minutes }}>{t("goal.wallLine", { elapsed: elapsed(), minutes: g().budget.wall_minutes })}</span>
            </div>
          </Show>
        </div>
      </div>

      <div class="rail-block">
        <div class="rail-head">{t("contract.autonomy")}</div>
        <dl class="rail-dl">
          <dt>{t("goal.autonomyLevel")}</dt><dd>{t(`contract.${c().autonomy}`)}</dd>
          <dt>{t("goal.oneWayShort")}</dt><dd title={t("goal.oneWayDoors")}>{t("goal.askFirst")}</dd>
          <dt>{t("settings.gaugeSandbox")}</dt><dd>{sandboxTag(hasIssue(state.env, "no_sandbox"))}<span class="sep" />{c().network ? t("goal.networkOn") : t("goal.networkOff")}</dd>
        </dl>
      </div>

      <div class="rail-block">
        <div class="rail-head"><span>{t("chrome.engine")}</span><span class="grow" /><span class="meta t3">{trustLabel(trustTierOf(eng()))}</span></div>
        <dl class="rail-dl">
          <Show when={c().engine && c().engine !== effectiveEngine("", state.settings?.engine)}><dt>{t("goal.engineName")}</dt><dd>{engineLabel(c().engine)}</dd></Show>
          <dt>{t("contract.model")}</dt><dd classList={{ mono: /^[\w.-]+\/[\w.:-]+$/.test(model()) }}>{model() || t("common.engineDefault", { engine: engineLabel(eng()) })}</dd>
          <Show when={escModel()}>
            <dt>{t("settings.escalationModel")}</dt>
            <dd class="row" style={{ gap: "4px", "flex-wrap": "wrap" }}><span class="mono">{escModel()}</span><span class={escOn() ? "esc-active" : "meta t3"}>{escOn() ? t("quiet.on") : `${escAfter()}×`}</span></dd>
          </Show>
          <Show when={deps().length > 0}>
            <dt>{t("contract.dependsOn")}</dt>
            <dd class="dep-links">
              <For each={deps()}>
                {(id) => <button class="link-quiet text-btn" onClick={() => go({ name: "goal", id })}><Show when={state.goals[id]}>{(x) => <LifecycleGlyph goal={x()} size={9} />}</Show><span class="code-val t2">{id}</span></button>}
              </For>
            </dd>
          </Show>
          <Show when={mqPos() !== null}><dt>{t("ops.mergeQueueTitle")}</dt><dd class="num">#{mqPos()}</dd></Show>
          <Show when={props.d.local_files.length}><dt>{t("settings.localFiles")}</dt><dd class="rail-paths code-val">{props.d.local_files.join(", ")}</dd></Show>
          <Show when={g().branch}>
            <dt>{t("live.branch")}</dt>
            <dd class="mono break">{g().branch}<IconButton icon="copy" size={22} label={t("goal.copyBranch")} onClick={() => (void navigator.clipboard.writeText(g().branch!), toast("success", t("common.copied")))} /></dd>
          </Show>
        </dl>
      </div>
    </div>
  );
}
