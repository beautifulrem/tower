/**
 * The goal page's right rail: the contract as readings — intent, scope,
 * budget meter, autonomy, engine, branch — with the long forms one hover
 * away.
 */
import { For, Show } from "solid-js";

import { IconButton, Kbd } from "../../components/ui";
import type { GoalDetail } from "../../gen/GoalDetail";
import { usd, usdLimit } from "../../lib/format";
import { t } from "../../lib/i18n";
import { effectiveEngine, engineLabel, hasIssue } from "../../lib/labels";
import { state, toast } from "../../lib/store";

/** A percentage that stays honest at the low end: "<1%" rather than "0%". */
const pct = (part: number, whole: number) => {
  if (whole <= 0 || part <= 0) return "0%";
  const p = (part / whole) * 100;
  return p < 1 ? "<1%" : `${Math.round(p)}%`;
};

function BudgetMeter(props: { g: GoalDetail["summary"] }) {
  const fill = () => Math.min(100, (props.g.cost_usd / Math.max(props.g.budget.hard_usd, 0.01)) * 100);
  const softPct = () => Math.min(100, (props.g.budget.soft_usd / Math.max(props.g.budget.hard_usd, 0.01)) * 100);
  const over = () => props.g.cost_usd >= props.g.budget.soft_usd;
  const elapsedMin = () => Math.floor((state.now - (props.g.run_started_at ?? state.now)) / 60_000);
  const overWallClock = () => elapsedMin() > props.g.budget.wall_minutes;
  return (
    <div class="budget">
      <div class="budget-bar" title={t("goal.budgetTitle")}>
        <span class="budget-fill" classList={{ over: over(), some: props.g.cost_usd > 0 }} style={{ width: `${fill()}%` }} />
        <span class="budget-soft" style={{ left: `${softPct()}%` }} />
      </div>
      {/* Two fixed lines, money then time: no wrap can ever leave a dot leading or trailing a line. */}
      <div class="meta num budget-line">
        <span class="budget-money">
          <span class="t1">{t("goal.budgetLine", { spent: usd(props.g.cost_usd), soft: usdLimit(props.g.budget.soft_usd), pct: pct(props.g.cost_usd, props.g.budget.soft_usd) })}</span>
          <span class="sep">·</span>
          {t("goal.hardCap", { v: usdLimit(props.g.budget.hard_usd) })}
        </span>
        <Show when={props.g.run_started_at}>
          <span class="budget-time">
            <span classList={{ "over-wall": overWallClock() }} title={overWallClock() ? t("goal.overWallTitle") : undefined}>
              {t("goal.wallLine", { elapsed: elapsedMin(), minutes: props.g.budget.wall_minutes })}
            </span>
          </span>
        </Show>
      </div>
    </div>
  );
}

/** Values like `provider/model` are machine strings; words ("Pi default") are not. */
const isModelId = (s: string) => /^[\w.-]+\/[\w.:-]+$/.test(s);

export function ContractRail(props: { d: GoalDetail }) {
  const c = () => props.d.contract;
  const autonomyWord = () => ({ cautious: t("contract.cautious"), standard: t("contract.standard"), autonomous: t("contract.autonomous") })[c().autonomy];
  const autonomyTitle = () =>
    ({ cautious: t("goal.autonomyCautious"), standard: t("goal.autonomyStandard"), autonomous: t("goal.autonomyAutonomous") })[c().autonomy];
  const model = () => c().model || state.settings?.default_model || "";
  const branch = () => props.d.summary.branch;
  return (
    <div class="rail">
      <div class="rail-block">
        <div class="rail-head">
          <span>{t("goal.contractSummary", { v: c().version })}</span>
          <span class="grow" />
          <Kbd k="shift+e" />
        </div>
        <dl class="rail-dl">
          <dt>{t("goal.intent")}</dt>
          <dd class="reading">{c().intent}</dd>
          <Show when={c().done_when}>
            <dt>{t("goal.doneWhen")}</dt>
            <dd>{c().done_when}</dd>
          </Show>
          <Show when={c().constraints.length}>
            <dt>{t("goal.constraints")}</dt>
            <dd>
              <For each={c().constraints}>{(k) => <div>{k}</div>}</For>
            </dd>
          </Show>
        </dl>
      </div>
      <div class="rail-block">
        <div class="rail-head">{t("goal.scope")}</div>
        <dl class="rail-dl rail-dl-code">
          <dt>{t("goal.include")}</dt>
          <dd>{c().scope.include.length ? c().scope.include.join("  ") : t("goal.wholeRepo")}</dd>
          <Show when={c().scope.exclude.length}>
            <dt>{t("goal.exclude")}</dt>
            <dd>{c().scope.exclude.join("  ")}</dd>
          </Show>
          <Show when={c().scope.readonly.length}>
            <dt>{t("goal.readonly")}</dt>
            <dd>{c().scope.readonly.join("  ")}</dd>
          </Show>
        </dl>
      </div>
      <div class="rail-block">
        <div class="rail-head">{t("goal.budget")}</div>
        <BudgetMeter g={props.d.summary} />
      </div>
      {/* Three readings, not three sentences; the long form is one hover away. */}
      <div class="rail-block">
        <div class="rail-head">{t("goal.autonomy")}</div>
        <dl class="rail-dl">
          <dt>{t("goal.autonomyLevel")}</dt>
          <dd title={autonomyTitle()}>{autonomyWord()}</dd>
          <dt>{t("goal.oneWayShort")}</dt>
          <dd title={t("goal.oneWayDoors")}>{t("goal.askFirst")}</dd>
          <dt>{t("goal.sandboxShort")}</dt>
          <dd title={hasIssue(state.env, "no_sandbox") ? t("goal.noSandbox") : t("goal.sandboxOn")}>
            {hasIssue(state.env, "no_sandbox") ? t("goal.noSandbox") : t("goal.sandboxOnShort")}
            <span class="sep">·</span>
            {c().network ? t("goal.networkOn") : t("goal.networkOff")}
          </dd>
        </dl>
      </div>
      <div class="rail-block">
        <div class="rail-head">{t("goal.engine")}</div>
        <dl class="rail-dl">
          {/* The engine is a reading only when the contract overrides the default. The block is "Engine"; its first row is the name, not the word again. */}
          <Show when={c().engine && c().engine !== effectiveEngine("", state.settings?.engine)}>
            <dt>{t("goal.engineName")}</dt>
            <dd>{engineLabel(c().engine)}</dd>
          </Show>
          <dt>{t("goal.model")}</dt>
          <dd classList={{ mono: isModelId(model()) }}>{model() || t("common.engineDefault", { engine: engineLabel(effectiveEngine(c().engine, state.settings?.engine)) })}</dd>
          <Show when={props.d.local_files.length}>
            <dt>{t("goal.localFiles")}</dt>
            <dd class="mono">{props.d.local_files.join("  ")}</dd>
          </Show>
          <Show when={branch()}>
            <dt>{t("goal.branch")}</dt>
            <dd class="mono break">
              {branch()}
              <IconButton
                icon="copy"
                size={22}
                label={t("goal.copyBranch")}
                onClick={() => {
                  void navigator.clipboard.writeText(branch()!);
                  toast("success", t("common.copied"));
                }}
              />
            </dd>
          </Show>
        </dl>
      </div>
    </div>
  );
}
