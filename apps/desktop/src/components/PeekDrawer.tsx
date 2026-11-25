/**
 * Space-key Quick Peek slide-over instrument sheet (docs/19 §19.4):
 * Now (the live line), evidence (dual-track criteria + sentinels + latest claim), budget and next step.
 */
import { For, Show, createEffect, createResource, onCleanup, onMount } from "solid-js";

import type { GoalSummary } from "../gen/GoalSummary";
import { api } from "../lib/api";
import type { CriterionResultExt, GoalDetailExt, GoalSummaryExt } from "../lib/apiTypes";
import { ago, duration, short, usd, usdLimit } from "../lib/format";
import { t } from "../lib/i18n";
import { useKeys } from "../lib/keys";
import { caveats, heldOrTampered, notEvidence, wasAccepted } from "../lib/discounted";
import { effectiveEngine, engineLabel, engineTrustTier, statusWord } from "../lib/labels";
import { go } from "../lib/nav";
import { reviewEach } from "../lib/reviewQueue";
import { act, state } from "../lib/store";
import { ProvBox } from "./Console";
import { DangerMark, Icon, LifecycleGlyph, NeedsYouMark, NoticeMark, ResultMark, Seal } from "./Glyph";
import { ConsistencyBadge } from "./Honesty";
import { CriteriaBar } from "./HonestyCore";
import { LiveLine, liveDetail } from "./Live";
import { TrustPill } from "./ProvenanceFrame";
import { Button, trapTab } from "./ui";

const pct = (v: number, m: number) => (m > 0 ? Math.min(100, (v / m) * 100) : 0);

export function PeekDrawer(props: { goalId: string; onClose: () => void }) {
  const g = (): GoalSummaryExt | undefined => state.goals[props.goalId] as GoalSummaryExt | undefined;
  const [detail] = createResource(() => props.goalId, (id) => api.goal(id).catch(() => null) as Promise<GoalDetailExt | null>);
  let panel!: HTMLDivElement;
  const focusPanel = () => panel?.focus({ preventScroll: true });
  onMount(focusPanel);
  createEffect(() => (void props.goalId, focusPanel()));
  const prev = document.activeElement as HTMLElement | null;
  onCleanup(() => prev?.focus?.({ preventScroll: true }));

  const canPause = () => g()?.state === "running";
  const canToggle = () => g()?.state === "running" || g()?.state === "paused";
  const canReview = () => !!g()?.diffstat?.files;
  const toggleRun = () => { const s = g(); if (s) void act(() => (s.state === "running" ? api.pause(s.id) : api.resume(s.id))); };
  // The id first: closing unmounts the drawer, and its props die with it.
  const openTo = (name: "goal" | "review") => {
    const id = props.goalId;
    props.onClose();
    go({ name, id });
  };

  useKeys(
    [
      { key: "escape", run: props.onClose, inInputs: true },
      { key: "space", run: props.onClose, desc: () => t("common.close") },
      { key: "p", run: toggleRun, when: canToggle, desc: () => t(canPause() ? "goal.pause" : "goal.resume") },
      { key: "r", run: () => canReview() && openTo("review"), when: canReview, desc: () => t("goal.review") },
      { key: "enter", run: () => openTo("goal"), desc: () => t("review.openGoal") },
      // The board's ⇧R, from inside the peek too: close it and start the review queue.
      { key: "shift+r", run: () => (props.onClose(), reviewEach()), desc: () => t("inbox.reviewAll") },
    ],
    () => t("peek.scope"),
    { modal: true },
  );

  const engine = () => effectiveEngine(g()?.engine, state.settings?.engine);
  const tier = () => engineTrustTier(engine());
  const nextClaim = () => detail()?.claims?.find((c) => c.kind === "next") ?? null;
  const latestClaim = () => detail()?.claims?.filter((c) => c.kind !== "next").at(-1) ?? null;
  const nextText = () => nextClaim()?.text ?? detail()?.submit_summary ?? "";
  const kvRows = () => {
    const s = g(), d = detail();
    if (!s) return [] as [string, string, boolean][];
    const out: [string, string, boolean][] = [
      [t("overview.colSpend"), `${usd(s.cost_usd)} / ${usdLimit(s.budget.soft_usd)} (${t("goal.hardCap", { v: usdLimit(s.budget.hard_usd) })})`, false],
    ];
    if (s.run_started_at) out.push([t("contract.wallClock"), `${duration(Math.max(0, state.now - s.run_started_at), false)} / ${s.budget.wall_minutes}m`, false]);
    const br = s.branch ?? d?.branch_preview;
    if (br) out.push([t("live.branch"), br, true]);
    if (d?.pin) out.push([t("goal.snapshot"), `@${short(d.pin)}`, true]);
    return out;
  };

  return (
    <div class="peek-backdrop" onMouseDown={(e) => e.target === e.currentTarget && props.onClose()} onKeyDown={trapTab(() => panel)}>
      <aside ref={panel} class="peek-drawer" role="dialog" aria-modal="true" aria-label={g() ? `${g()!.id} ${g()!.title}` : props.goalId} tabindex="-1">
        <Show when={g()}>
          {(s) => (
            <>
              <header class="peek-head">
                <div class="peek-head-top">
                  <LifecycleGlyph goal={s() as GoalSummary} size={12} />
                  <span class="code-val t2">{s().id}</span>
                  {/* A running goal's state is said once, by "Now" under the head (needs you, unresponsive, or what it is doing):
                      a second word here could only lag it or contradict it. */}
                  <Show when={!(s().state === "in_review" && s().verified_pin) && s().state !== "running"}>
                    <span class="meta t3">{statusWord(s() as GoalSummary)}</span>
                  </Show>
                  {/* The verdict and its pin, once: when "Now" draws the seal (in review), the head leaves it to it; a pass
                      that doesn't count is marked here by the glyph alone. */}
                  <Show when={!notEvidence(s()) && !liveDetail(s() as GoalSummary).seal}>
                    <Seal pin={s().verified_pin} compact qualified={caveats(s())} accepted={wasAccepted(s())} />
                  </Show>
                  <span class="grow" />
                  <button class="icon-btn peek-close" aria-label={t("common.close")} onClick={props.onClose}><Icon name="cross" size={12} /></button>
                </div>
                <h2 class="peek-title">{s().title}</h2>
                <div class="peek-meta meta halt">
                  <span class="meta-inline">
                    <span class="t2">{engineLabel(engine())}</span>
                    <TrustPill tier={tier()} label={t(`trust.${tier()}`)} />
                    <span class="t2" hidden={s().sandbox_tier !== "micro_vm"}>MicroVM</span>
                    <span class="code-val t2" hidden={!s().port_base}>:{s().port_base}</span>
                  </span>
                  <span class="grow" />
                  <span class="num t3">{ago(s().updated_at, state.now)}</span>
                </div>
              </header>

              <div class="peek-body">
                <section class="peek-band">
                  <h3 class="peek-band-head halt">{t("peek.l1")}</h3>
                  <LiveLine goal={s() as GoalSummary} large />
                  <div class="meta-inline meta halt">
                    <span class="num t2">{t("goal.runN", { n: Math.max(1, s().run_no) })}</span>
                    <span class="t3 num" hidden={!s().rework_cycles}>{t("card.rework", { n: s().rework_cycles, max: s().max_rework })}</span>
                    <code class="code-val t2" hidden={!detail()?.escalated_model}>{detail()?.escalated_model}</code>
                  </div>
                  <Show when={s().overlaps?.length}>
                    <div class="row meta t1"><NoticeMark /><span>{t("goal.overlaps", { id: s().overlaps.map((o) => o.goal_id).join(", ") })}</span></div>
                  </Show>
                </section>

                <section class="peek-band">
                  <h3 class="peek-band-head halt">{t("peek.l2")}</h3>
                  <CriteriaBar progress={s().progress} criteria={detail()?.criteria} compact />
                  <div class="peek-crit-list" hidden={!detail()?.criteria?.length}>
                    <For each={detail()?.criteria ?? []}>
                      {(c) => {
                        const ver = c.verified as CriterionResultExt | null;
                        const kind = c.canary === "tampered" || (ver?.passed && !ver.stale && heldOrTampered(c, detail()?.sentinels)) ? "tampered" : ver ? (ver.passed ? "pass" : "fail") : c.observed ? (c.observed.passed ? "obs-pass" : "obs-fail") : "pending";
                        return (
                          <div class="peek-crit-item">
                            {kind === "tampered" ? <NeedsYouMark /> : <ResultMark kind={kind} />}
                            <span class="code-val t3">{c.criterion.id}</span>
                            <span class="ellipsis t1" title={c.criterion.title}>{c.criterion.title}</span>
                            <span class="meta t3 num">{ver?.flaky ? t("peek.flaky") : ver?.passed && c.passed_on_base === false && c.canary !== "tampered" ? t("goal.redToGreen") : ""}</span>
                          </div>
                        );
                      }}
                    </For>
                  </div>
                  <Show when={detail()?.sentinels?.length}>
                    <ProvBox kind="fact" badge={t("goal.sentinels")} danger>
                      <For each={detail()!.sentinels}>{(sn) => <div class="row meta t1">{sn.severity >= 3 ? <DangerMark /> : <NoticeMark />}<span class="ellipsis">{sn.title}</span></div>}</For>
                    </ProvBox>
                  </Show>
                  <Show when={latestClaim()}>
                    {(cl) => (
                      <ProvBox kind="claim" badge={t(`claimKind.${cl().kind}` as Parameters<typeof t>[0])} aside={<ConsistencyBadge value={cl().consistency} evidence={cl().evidence} />}>
                        <div class="pre">{cl().text}</div>
                      </ProvBox>
                    )}
                  </Show>
                </section>

                <section class="peek-band">
                  <h3 class="peek-band-head halt">{t("peek.l3")}</h3>
                  <div class="budget">
                    <div class="budget-bar">
                      <div class="budget-fill" classList={{ some: s().cost_usd > 0, over: s().cost_usd >= s().budget.soft_usd }} style={{ width: `${pct(s().cost_usd, s().budget.hard_usd)}%` }} />
                      <div class="budget-soft" style={{ left: `${pct(s().budget.soft_usd, s().budget.hard_usd)}%` }} />
                    </div>
                    <dl class="peek-kv num">
                      <For each={kvRows()}>
                        {([k, v, code]) => (<><dt>{k}</dt><dd classList={{ "code-val": code, ellipsis: code }}>{v}</dd></>)}
                      </For>
                    </dl>
                  </div>
                  <Show when={nextText()}>
                    <ProvBox kind="claim" badge={t(nextClaim() ? "claimKind.next" : "goal.submitSummary")}>
                      <div class="pre">{nextText()}</div>
                    </ProvBox>
                  </Show>
                </section>
              </div>

              <footer class="peek-foot">
                <Show when={canToggle()}><Button size="s" kbd="p" onClick={toggleRun}>{t(canPause() ? "goal.pause" : "goal.resume")}</Button></Show>
                <Show when={canReview()}><Button size="s" kbd="r" onClick={() => openTo("review")}>{t("goal.review")}</Button></Show>
                <span class="grow" />
                <Button size="s" variant="primary" kbd="enter" onClick={() => openTo("goal")}>{t("review.openGoal")}</Button>
              </footer>
            </>
          )}
        </Show>
      </aside>
    </div>
  );
}
