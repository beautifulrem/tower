/**
 * Goal page (docs/04 §4.5): state, not stream. What the goal is for, how far
 * it is with evidence, what changed, what the agent claims and whether the
 * facts agree. The stream is one keystroke away (W).
 */
import { For, Match, Show, Switch, createEffect, createMemo, createResource, createSignal, on, onCleanup } from "solid-js";

import { DecisionCard } from "../components/DecisionCard";
import { LifecycleGlyph } from "../components/Glyph";
import { Claim, ConsistencyBadge, CriteriaBar, FactChip, HumanStamp, ObsChip } from "../components/Honesty";
import { LiveLine } from "../components/Live";
import { Trace } from "../components/Trace";
import { Button, Kbd, Section, Spinner } from "../components/ui";
import type { ClaimView } from "../gen/ClaimView";
import type { CriterionView } from "../gen/CriterionView";
import type { GoalDetail } from "../gen/GoalDetail";
import { api } from "../lib/api";
import { clock, count, duration, short, usd, usdLimit } from "../lib/format";
import { useKeys } from "../lib/keys";
import { pauseLabel, stateLabel } from "../lib/labels";
import { go } from "../lib/nav";
import { act, onTrace, state } from "../lib/store";

export function GoalPage(props: { id: string }) {
  const [detail, { refetch, mutate }] = createResource(() => props.id, api.goal);
  const [watch, setWatch] = createSignal(false);
  const summary = () => state.goals[props.id] ?? detail()?.summary;

  // Refetch the detail when facts arrive, at most every 400 ms.
  let timer: number | undefined;
  const soon = () => {
    clearTimeout(timer);
    timer = window.setTimeout(() => void refetch(), 400);
  };
  const off = onTrace(props.id, (e) => {
    if (!["tool_started", "tool_ended", "mode_changed", "assistant_message"].includes(e.event.kind)) soon();
  });
  createEffect(on(() => summary()?.state, soon, { defer: true }));
  onCleanup(() => {
    off();
    clearTimeout(timer);
    void api.markViewed(props.id);
    mutate(undefined);
  });

  // Review-ready items live in the inbox; on the goal page the header says it.
  const inbox = () => state.inbox.filter((i) => i.goal_id === props.id && i.kind !== "review_ready");

  useKeys([
    { key: "w", run: () => setWatch((w) => !w) },
    { key: "r", run: () => go({ name: "review", id: props.id }) },
    { key: "p", run: () => togglePause() },
    { key: "shift+e", run: () => go({ name: "new", amendId: props.id }) },
  ]);

  const togglePause = () => {
    const s = summary()?.state;
    if (s === "running" || s === "verifying" || s === "ready" || s === "claimed") void act(() => api.pause(props.id));
    else if (s === "paused") void act(() => api.resume(props.id));
  };

  return (
    <Show when={summary()} fallback={<div class="page-loading"><Spinner /></div>}>
      {(g) => (
        <div class="goal-page">
          <header class="goal-head">
            <div class="goal-head-main">
              <div class="row">
                <LifecycleGlyph goal={g()} size={14} />
                <span class="num t3">{g().id}</span>
                <h1 class="goal-title ellipsis">{g().title}</h1>
              </div>
              <div class="goal-sub meta">
                <span class="t1">{stateLabel[g().state]}</span>
                <Show when={g().pause_reason && g().state === "paused"}>
                  <span class="sep">·</span>
                  <span>{pauseLabel[g().pause_reason!]}</span>
                </Show>
                <Show when={g().run_no > 0}>
                  <span class="sep">·</span>
                  <span>
                    第 {g().run_no} 次运行
                    <Show when={g().rework_cycles > 0}>
                      （返工 {g().rework_cycles}/{g().max_rework}）
                    </Show>
                  </span>
                </Show>
                <span class="sep">·</span>
                <span>{g().project_name}</span>
                <Show when={detail()?.contract}>
                  <span class="sep">·</span>
                  <span>合同 v{detail()!.contract.version}</span>
                </Show>
              </div>
            </div>
            <div class="goal-actions">
              <GoalActions goal={g()} onWatch={() => setWatch((w) => !w)} watching={watch()} onPause={togglePause} />
            </div>
          </header>

          <Show when={detail()?.briefing.length}>
            <div class="briefing">
              <span class="briefing-title">
                自你 {clock(g().last_viewed_at ?? 0)} 上次查看
              </span>
              <For each={detail()!.briefing.slice(-6)}>
                {(b) => (
                  <span class="briefing-item" classList={{ "briefing-claim": b.source === "claim" }}>
                    {b.text}
                  </span>
                )}
              </For>
            </div>
          </Show>

          <div class="annunciator">
            <LiveLine goal={g()} large />
          </div>

          <Show when={inbox().length > 0}>
            <div class="goal-decisions">
              <For each={inbox()}>{(it) => <DecisionCard item={it} />}</For>
            </div>
          </Show>

          <Show when={!watch()} fallback={<WatchPanel id={props.id} />}>
            <div class="goal-body">
              <div class="goal-main">
                <Show when={detail()} fallback={<Spinner />}>
                  {(d) => <GoalBlocks d={d()} />}
                </Show>
              </div>
              <aside class="goal-rail">
                <Show when={detail()}>{(d) => <ContractRail d={d()} />}</Show>
              </aside>
            </div>
          </Show>

          <Show when={g().state === "running" || g().state === "paused"}>
            <SteerBox id={props.id} running={g().state === "running"} />
          </Show>
        </div>
      )}
    </Show>
  );
}

function GoalActions(props: { goal: GoalDetail["summary"]; watching: boolean; onWatch: () => void; onPause: () => void }) {
  const s = () => props.goal.state;
  const canReview = () => props.goal.diffstat !== null || ["in_review", "accepted", "running"].includes(s());
  return (
    <>
      <Show when={canReview()}>
        <Button variant={s() === "in_review" ? "primary" : "default"} size="s" kbd="r" onClick={() => go({ name: "review", id: props.goal.id })}>
          评审
        </Button>
      </Show>
      <Button size="s" kbd="w" variant={props.watching ? "primary" : "default"} onClick={props.onWatch}>
        {props.watching ? "回到状态" : "观察"}
      </Button>
      <Switch>
        <Match when={["running", "verifying", "ready", "claimed"].includes(s())}>
          <Button size="s" kbd="p" onClick={props.onPause}>
            暂停
          </Button>
        </Match>
        <Match when={s() === "paused"}>
          <Button size="s" kbd="p" variant="primary" onClick={props.onPause}>
            继续
          </Button>
        </Match>
        <Match when={s() === "draft"}>
          <Button size="s" variant="primary" onClick={() => go({ name: "new", draftId: props.goal.id })}>
            编辑合同
          </Button>
        </Match>
      </Switch>
      <Show when={["in_review", "paused"].includes(s())}>
        <Button size="s" onClick={() => void act(() => api.retryVerify(props.goal.id))}>
          重新验证
        </Button>
      </Show>
      <Show when={!["draft", "archived", "abandoned", "integrated", "accepted"].includes(s())}>
        <Button size="s" variant="ghost" kbd="shift+e" onClick={() => go({ name: "new", amendId: props.goal.id })}>
          修订合同
        </Button>
      </Show>
      <Show when={["accepted", "integrated", "in_review"].includes(s())}>
        <Button size="s" variant="ghost" onClick={() => void act(() => api.archive(props.goal.id), "已归档")}>
          归档
        </Button>
      </Show>
      <Show when={["archived", "abandoned"].includes(s())}>
        <Button
          size="s"
          variant="ghost"
          onClick={() => {
            if (confirm(`删除 ${props.goal.id} 的工作区？轨迹与记录保留；你的仓库不受影响。`))
              void act(() => api.removeWorkspace(props.goal.id), "工作区已删除");
          }}
        >
          删除工作区
        </Button>
      </Show>
      <Show when={!["archived", "abandoned"].includes(s())}>
        <Button
          size="s"
          variant="ghost"
          onClick={() => {
            if (confirm(`放弃 ${props.goal.id}？Agent 会停止，工作区保留在磁盘上。`)) void act(() => api.abandon(props.goal.id));
          }}
        >
          放弃
        </Button>
      </Show>
    </>
  );
}

function GoalBlocks(props: { d: GoalDetail }) {
  const d = () => props.d;
  const g = () => d().summary;
  const causes = () => d().claims.filter((c) => c.kind === "cause");
  const assumptions = () => d().claims.filter((c) => c.kind === "assumption");
  const decisions = () => d().claims.filter((c) => c.kind === "decision");
  const next = () => [...d().claims].reverse().find((c) => c.kind === "next");
  const ledger = () => d().claims.filter((c) => c.kind === "criterion_met");
  const failing = () => d().criteria.filter((c) => c.verified && !c.verified.passed && !c.verified.stale);

  return (
    <>
      <Show when={causes().length || failing().length}>
        <Section title="原因">
          <For each={failing()}>
            {(c) => (
              <div class="fact-row">
                <span class="result result-fail">✕</span>
                <span class="t1">
                  {c.criterion.id} {c.criterion.title} 失败
                </span>
                <span class="grow" />
                <FactChip pin={c.verified!.pin} at={c.verified!.at}>
                  <span>退出码 {c.verified!.exit_code ?? "—"}</span>
                </FactChip>
              </div>
            )}
          </For>
          <For each={causes()}>{(c) => <Claim label="Agent 称（原因）">{c.text}</Claim>}</For>
        </Section>
      </Show>

      <Section
        title="验收标准"
        aside={<CriteriaBar progress={g().progress} />}
      >
        <For each={d().criteria}>{(c) => <CriterionRow goalId={g().id} c={c} state={g().state} />}</For>
        <Show when={d().criteria.length === 0}>
          <p class="meta">合同没有验收标准：结果由你人工判断。</p>
        </Show>
      </Section>

      <Section
        title="改动"
        aside={
          <Show when={g().diffstat}>
            <Button size="s" variant="ghost" onClick={() => go({ name: "review", id: g().id })}>
              打开改动视图
            </Button>
          </Show>
        }
      >
        <Show when={g().diffstat} fallback={<p class="meta">还没有快照。Agent 提交后 Tower 会对工作区拍快照并验证。</p>}>
          <div class="fact-row num">
            <span class="diff-add">+{count(g().diffstat!.additions)}</span>
            <span class="diff-del">−{count(g().diffstat!.deletions)}</span>
            <span class="sep">·</span>
            <span>{g().diffstat!.files} 个文件</span>
            <span class="sep">·</span>
            <span class="t2">相对 base @{short(d().base_commit)}</span>
            <span class="grow" />
            <FactChip pin={d().pin} />
          </div>
        </Show>
        <Show when={d().submit_summary}>
          <Claim label="Agent 称（提交说明）">{d().submit_summary}</Claim>
        </Show>
      </Section>

      <Section title="接下来">
        <Show when={next()} fallback={<p class="meta">Agent 还没有说明下一步。</p>}>
          <Claim>{next()!.text}</Claim>
        </Show>
        <BudgetMeter g={g()} />
      </Section>

      <Show when={ledger().length}>
        <Section title="账本：说法 ↔ 事实">
          <For each={ledger()}>{(c) => <LedgerRow c={c} />}</For>
        </Section>
      </Show>

      <Show when={assumptions().length || decisions().length}>
        <Section title="决定与假设">
          <For each={[...assumptions(), ...decisions()]}>{(c) => <DecisionClaim goalId={g().id} c={c} />}</For>
        </Section>
      </Show>

      <Show when={d().runs.length}>
        <Section title="运行">
          <For each={[...d().runs].reverse()}>
            {(r) => (
              <div class="run-row meta">
                <span class="num t1">R-{String(r.run_no).padStart(2, "0")}</span>
                <span>{({ initial: "首次", rework: "返工", resume: "继续", request_changes: "按评审修改" } as Record<string, string>)[r.purpose] ?? r.purpose}</span>
                <span class="sep">·</span>
                <span class="num">{clock(r.started_at)}</span>
                <Show when={r.ended_at}>
                  <span class="sep">·</span>
                  <span class="num">{duration(r.ended_at! - r.started_at)}</span>
                </Show>
                <span class="grow" />
                <span>{({ submitted: "自称完成", paused: "已暂停", crashed: "引擎退出", abandoned: "已放弃", interrupted: "被中断" } as Record<string, string>)[r.outcome ?? ""] ?? (r.ended_at ? r.outcome : "进行中")}</span>
              </div>
            )}
          </For>
        </Section>
      </Show>
    </>
  );
}

function CriterionRow(props: { goalId: string; c: CriterionView; state: string }) {
  const c = () => props.c;
  const v = () => c().verified;
  const [open, setOpen] = createSignal(false);
  const mark = () => {
    if (c().criterion.kind.type === "human") return null;
    if (!v()) return "pending";
    if (v()!.stale) return "stale";
    return v()!.passed ? "pass" : "fail";
  };
  return (
    <div class="criterion" classList={{ stale: !!v()?.stale }}>
      <div class="criterion-row">
        <Show
          when={c().criterion.kind.type === "exec"}
          fallback={
            <input
              type="checkbox"
              class="human-check"
              checked={c().human_checked}
              disabled={!["in_review", "verifying", "running", "paused", "claimed"].includes(props.state)}
              onChange={(e) => void act(() => api.humanCheck(props.goalId, c().criterion.id, e.currentTarget.checked))}
              title="人工标准：由你勾选，不计入已验证"
            />
          }
        >
          <span class={`result result-${mark()}`}>
            {{ pass: "✓", fail: "✕", stale: "⟲", pending: "·" }[mark() as "pass"] ?? "·"}
          </span>
        </Show>
        <span class="num t3">{c().criterion.id}</span>
        <span class="criterion-title">{c().criterion.title}</span>
        <Show when={c().criterion.kind.type === "exec"}>
          <code class="criterion-cmd mono t2 ellipsis">
            {(c().criterion.kind as { command: string }).command}
          </code>
        </Show>
        <span class="grow" />
        <Show when={v()}>
          <button class="chip-button" onClick={() => setOpen((o) => !o)} title="查看输出">
            <FactChip pin={v()!.pin} at={v()!.at}>
              <span>{v()!.passed ? "通过" : "失败"}</span>
              <span class="sep">·</span>
              <span>{duration(v()!.duration_ms)}</span>
            </FactChip>
          </button>
        </Show>
        <Show when={c().criterion.kind.type === "human"}>
          <span class="meta">{c().human_checked ? "你已勾选" : "待你勾选"}</span>
        </Show>
      </div>
      <Show when={c().observed}>
        <div class="criterion-obs">
          <span class="result">{c().observed!.passed ? "○✓" : "○✕"}</span>
          <ObsChip at={c().observed!.at}>
            <span>{c().observed!.passed ? "通过" : "失败"}（Agent 环境，未计入已验证）</span>
          </ObsChip>
        </div>
      </Show>
      <Show when={open() && v()}>
        <pre class="output-tail">{v()!.output_tail || "（没有输出）"}</pre>
      </Show>
    </div>
  );
}

function LedgerRow(props: { c: ClaimView }) {
  return (
    <Claim aside={<ConsistencyBadge value={props.c.consistency} evidence={props.c.evidence} />}>
      <Show when={props.c.criterion}>
        <span class="num t3">{props.c.criterion} </span>
      </Show>
      {props.c.text}
      <Show when={props.c.evidence}>
        <div class="ledger-evidence meta">↳ {props.c.evidence}</div>
      </Show>
    </Claim>
  );
}

function DecisionClaim(props: { goalId: string; c: ClaimView }) {
  const label = () => (props.c.kind === "assumption" ? "Agent 的假设" : "Agent 的决定");
  return (
    <Claim
      label={label()}
      aside={
        <Show
          when={props.c.approved !== null}
          fallback={
            <Show when={props.c.kind === "assumption"}>
              <span class="meta">待你确认</span>
            </Show>
          }
        >
          <HumanStamp at={props.c.at}> {props.c.approved ? "已批准" : "已驳回"}</HumanStamp>
        </Show>
      }
    >
      {props.c.text}
    </Claim>
  );
}

function BudgetMeter(props: { g: GoalDetail["summary"] }) {
  const pct = () => Math.min(100, (props.g.cost_usd / Math.max(props.g.budget.hard_usd, 0.01)) * 100);
  const softPct = () => Math.min(100, (props.g.budget.soft_usd / Math.max(props.g.budget.hard_usd, 0.01)) * 100);
  return (
    <div class="budget">
      <div class="budget-bar">
        <span class="budget-fill" style={{ width: `${pct()}%` }} />
        <span class="budget-soft" style={{ left: `${softPct()}%` }} />
      </div>
      <div class="meta num">
        预算 {usd(props.g.cost_usd)} / 软 {usdLimit(props.g.budget.soft_usd)} · 硬 {usdLimit(props.g.budget.hard_usd)}
        <Show when={props.g.run_started_at}>
          <span class="sep">·</span>墙钟 {duration(state.now - props.g.run_started_at!, false)} / 软 {props.g.budget.wall_minutes} 分
        </Show>
      </div>
    </div>
  );
}

function ContractRail(props: { d: GoalDetail }) {
  const c = () => props.d.contract;
  const autonomy = () =>
    ({ cautious: "谨慎：非只读命令都先问", standard: "标准：范围内直接做，依赖与 CI 先问", autonomous: "自主：只有单向门先问" })[c().autonomy];
  return (
    <div class="rail">
      <div class="rail-block">
        <div class="rail-head">
          <span>合同 v{c().version} 摘要</span>
          <span class="grow" />
          <Kbd k="shift+e" />
        </div>
        <dl class="rail-dl">
          <dt>目的</dt>
          <dd class="reading">{c().intent}</dd>
          <Show when={c().done_when}>
            <dt>终态</dt>
            <dd>{c().done_when}</dd>
          </Show>
          <Show when={c().constraints.length}>
            <dt>约束</dt>
            <dd>
              <For each={c().constraints}>{(k) => <div>{k}</div>}</For>
            </dd>
          </Show>
        </dl>
      </div>
      <div class="rail-block">
        <div class="rail-head">范围围栏</div>
        <dl class="rail-dl mono">
          <dt>包含</dt>
          <dd>{c().scope.include.length ? c().scope.include.join("  ") : "整个仓库"}</dd>
          <Show when={c().scope.exclude.length}>
            <dt>排除</dt>
            <dd>{c().scope.exclude.join("  ")}</dd>
          </Show>
          <Show when={c().scope.readonly.length}>
            <dt>只读</dt>
            <dd>{c().scope.readonly.join("  ")}</dd>
          </Show>
        </dl>
      </div>
      <div class="rail-block">
        <div class="rail-head">自主度</div>
        <p class="meta">{autonomy()}</p>
        <p class="meta">单向门（push、发布、改历史）一律先问</p>
        <p class="meta">沙箱：{state.env?.problems.some((p) => p.includes("沙箱")) ? "无（S0）" : "S2 · Seatbelt"}</p>
      </div>
      <div class="rail-block">
        <div class="rail-head">引擎</div>
        <dl class="rail-dl">
          <dt>模型</dt>
          <dd class="mono">{c().model || state.settings?.default_model || "Pi 默认"}</dd>
          <Show when={props.d.workspace}>
            <dt>工作区</dt>
            <dd class="mono t2 break">{props.d.workspace}</dd>
          </Show>
          <Show when={props.d.summary.branch}>
            <dt>分支</dt>
            <dd class="mono">{props.d.summary.branch}</dd>
          </Show>
        </dl>
      </div>
    </div>
  );
}

function WatchPanel(props: { id: string }) {
  const stream = () => state.streams[props.id] ?? "";
  return (
    <div class="watch">
      <Show when={stream()}>
        <div class="watch-stream">
          <span class="claim-label">Agent 正在写</span>
          <p class="watch-stream-text">{stream()}</p>
        </div>
      </Show>
      <Trace id={props.id} live />
    </div>
  );
}

function SteerBox(props: { id: string; running: boolean }) {
  const [text, setText] = createSignal("");
  const [receipt, setReceipt] = createSignal<string | null>(null);
  const send = async () => {
    const t = text().trim();
    if (!t) return;
    const r = await act(() => api.steer(props.id, t));
    if (r) {
      setText("");
      setReceipt(r === "queued_for_next_run" ? "已记下：下次运行开始时带给 Agent" : `已送达 · ${r === "queued" ? "排在当前步骤之后" : r}`);
      setTimeout(() => setReceipt(null), 5000);
    }
  };
  const hint = createMemo(() => (props.running ? "给 Agent 的转向…（它会在当前步骤后读到）" : "写一条批注，继续时带给 Agent…"));
  return (
    <div class="steer">
      <textarea
        rows={1}
        placeholder={hint()}
        value={text()}
        onInput={(e) => setText(e.currentTarget.value)}
        onKeyDown={(e) => {
          if ((e.metaKey || e.ctrlKey) && e.key === "Enter") (e.preventDefault(), void send());
        }}
      />
      <Show when={receipt()}>
        <span class="meta">{receipt()}</span>
      </Show>
      <Button size="s" disabled={!text().trim()} onClick={send}>
        发送 <Kbd k="mod+enter" />
      </Button>
    </div>
  );
}

