/**
 * Review (docs/04 §4.6): full-screen, risk-ordered review units of at most
 * ~300 lines. A comment on a line is a steering instruction; "要求修改" sends
 * them all back to the agent. Accepting writes a local branch, never a push.
 */
import { For, Show, createMemo, createResource, createSignal } from "solid-js";

import { CriteriaBar, FactChip } from "../components/Honesty";
import { Button, Empty, Kbd, Spinner } from "../components/ui";
import type { DiffFile } from "../gen/DiffFile";
import type { DiffLine } from "../gen/DiffLine";
import type { ReviewComment } from "../gen/ReviewComment";
import type { ReviewUnit } from "../gen/ReviewUnit";
import { api } from "../lib/api";
import { count, short } from "../lib/format";
import { useKeys } from "../lib/keys";
import { back } from "../lib/nav";
import { act, state } from "../lib/store";

export function Review(props: { id: string }) {
  const [view] = createResource(() => props.id, api.review);
  const [detail, { refetch: refetchDetail }] = createResource(() => props.id, api.goal);
  const [unitIdx, setUnitIdx] = createSignal(0);
  const [seen, setSeen] = createSignal<Set<string>>(new Set());
  const [comments, setComments] = createSignal<ReviewComment[]>([]);
  const [composer, setComposer] = createSignal<{ path: string; line: number | null } | null>(null);
  const [panel, setPanel] = createSignal<"accept" | "changes" | null>(null);
  const g = () => state.goals[props.id];

  const units = () => view()?.units ?? [];
  const unit = () => units()[unitIdx()];
  const files = createMemo(() => {
    const u = unit();
    const v = view();
    if (!u || !v) return [];
    return v.files.filter((f) => u.files.includes(f.path));
  });

  const selectUnit = (i: number) => {
    const u = units()[unitIdx()];
    if (u) setSeen((s) => new Set(s).add(u.id));
    setUnitIdx(Math.max(0, Math.min(units().length - 1, i)));
    document.querySelector(".review-diff")?.scrollTo({ top: 0 });
  };

  useKeys([
    { key: "j", run: () => selectUnit(unitIdx() + 1) },
    { key: "k", run: () => selectUnit(unitIdx() - 1) },
    { key: "mod+shift+enter", run: () => setPanel("accept"), inInputs: true },
    { key: "c", run: () => setPanel("changes") },
    { key: "escape", run: () => (panel() ? setPanel(null) : composer() ? setComposer(null) : back()) },
  ]);

  const addComment = (text: string) => {
    const c = composer();
    if (!c || !text.trim()) return;
    setComments((list) => [...list, { path: c.path, line: c.line, text: text.trim() }]);
    setComposer(null);
  };

  return (
    <div class="review">
      <header class="review-head">
        <div class="col grow">
          <div class="row">
            <span class="num t3">{props.id}</span>
            <h1 class="review-title ellipsis">{g()?.title}</h1>
          </div>
          <Show when={view()}>
            <div class="meta num row">
              <span class="diff-add">+{count(view()!.stat.additions)}</span>
              <span class="diff-del">−{count(view()!.stat.deletions)}</span>
              <span class="sep">·</span>
              <span>{view()!.stat.files} 文件</span>
              <span class="sep">·</span>
              <span>{units().length} 个评审单元</span>
              <span class="sep">·</span>
              <span>
                base @{short(view()!.base_commit)} → @{short(view()!.pin)}
              </span>
              <Show when={g()}>
                <span class="sep">·</span>
                <CriteriaBar progress={g()!.progress} compact />
              </Show>
            </div>
          </Show>
        </div>
        <Button onClick={() => setPanel("changes")} kbd="c">
          要求修改{comments().length ? `（${comments().length} 条批注）` : ""}
        </Button>
        <Show when={g()?.state === "in_review"}>
          <Button variant="primary" onClick={() => setPanel("accept")} kbd="mod+shift+enter">
            验收
          </Button>
        </Show>
      </header>

      <Show when={!view.loading} fallback={<div class="page-loading"><Spinner /></div>}>
        <Show when={!view.error} fallback={<Empty title="无法载入改动">{String(view.error)}</Empty>}>
          <Show when={units().length > 0} fallback={<Empty title="没有改动">Agent 还没有改动任何被跟踪的文件。</Empty>}>
            <div class="review-body">
              <aside class="review-units">
                <For each={units()}>
                  {(u, i) => (
                    <UnitItem u={u} active={i() === unitIdx()} seen={seen().has(u.id)} onClick={() => selectUnit(i())} />
                  )}
                </For>
                <div class="review-units-foot meta">
                  <Kbd k="j" /> <Kbd k="k" /> 切换单元 · 点行号写批注
                </div>
              </aside>
              <div class="review-diff">
                <Show when={unit()?.risk_reasons.length}>
                  <div class="risk-banner">
                    <For each={unit()!.risk_reasons}>{(r) => <span class="risk-reason">{r}</span>}</For>
                  </div>
                </Show>
                <For each={files()}>
                  {(f) => (
                    <FileDiff
                      file={f}
                      comments={comments().filter((c) => c.path === f.path)}
                      composer={composer()}
                      onLine={(line) => setComposer({ path: f.path, line })}
                      onComment={addComment}
                      onCancel={() => setComposer(null)}
                    />
                  )}
                </For>
              </div>
            </div>
          </Show>
        </Show>
      </Show>

      <Show when={panel() === "accept"}>
        <AcceptPanel
          id={props.id}
          seen={seen().size + (unit() ? 1 : 0)}
          total={units().length}
          detail={detail()}
          onHumanCheck={async (cid, v) => {
            await act(() => api.humanCheck(props.id, cid, v));
            await refetchDetail();
          }}
          onClose={() => setPanel(null)}
        />
      </Show>
      <Show when={panel() === "changes"}>
        <ChangesPanel id={props.id} comments={comments()} onClose={() => setPanel(null)} onRemove={(i) => setComments((l) => l.filter((_, j) => j !== i))} />
      </Show>
    </div>
  );
}

function UnitItem(props: { u: ReviewUnit; active: boolean; seen: boolean; onClick: () => void }) {
  return (
    <button class="unit" classList={{ active: props.active }} onClick={props.onClick}>
      <div class="row">
        <span class="unit-risk" aria-label={`风险 ${props.u.risk}`}>
          {props.u.risk >= 3 ? "▪▪" : props.u.risk >= 2 ? "▪" : ""}
        </span>
        <span class="mono ellipsis grow">{props.u.title}</span>
        <span class="meta num">{props.u.lines}</span>
        <span class="t3">{props.seen ? "◦" : ""}</span>
      </div>
      <div class="meta ellipsis">{props.u.files.map((f) => f.split("/").pop()).join(" · ")}</div>
    </button>
  );
}

function FileDiff(props: {
  file: DiffFile;
  comments: ReviewComment[];
  composer: { path: string; line: number | null } | null;
  onLine: (line: number | null) => void;
  onComment: (text: string) => void;
  onCancel: () => void;
}) {
  const statusLabel = { added: "新建", modified: "修改", deleted: "删除", renamed: "重命名" };
  const commentAt = (n: number | null) => props.comments.filter((c) => c.line === n);
  const composingAt = (n: number | null) => props.composer?.path === props.file.path && props.composer.line === n;
  return (
    <section class="file">
      <header class="file-head">
        <span class="file-status meta">{statusLabel[props.file.status]}</span>
        <span class="mono ellipsis grow">
          <Show when={props.file.old_path}>
            <span class="t3">{props.file.old_path} → </span>
          </Show>
          {props.file.path}
        </span>
        <span class="num meta">
          <span class="diff-add">+{props.file.additions}</span> <span class="diff-del">−{props.file.deletions}</span>
        </span>
        <button class="link meta" onClick={() => props.onLine(null)}>
          批注整个文件
        </button>
      </header>
      <Show when={composingAt(null)}>
        <Composer onSubmit={props.onComment} onCancel={props.onCancel} />
      </Show>
      <For each={commentAt(null)}>{(c) => <div class="inline-comment">{c.text}</div>}</For>
      <Show when={!props.file.binary} fallback={<div class="meta file-binary">二进制文件，不显示内容</div>}>
        <table class="diff">
          <tbody>
            <For each={props.file.hunks}>
              {(h) => (
                <>
                  <tr class="hunk-head">
                    <td colspan="3" class="mono">
                      {h.header}
                    </td>
                  </tr>
                  <For each={h.lines}>
                    {(l) => (
                      <>
                        <DiffRow l={l} onLine={props.onLine} hasComment={commentAt(l.new_no ?? l.old_no).length > 0} />
                        <Show when={l.kind !== "del" && composingAt(l.new_no)}>
                          <tr>
                            <td colspan="3">
                              <Composer onSubmit={props.onComment} onCancel={props.onCancel} />
                            </td>
                          </tr>
                        </Show>
                        <Show when={l.kind !== "del"}>
                          <For each={commentAt(l.new_no)}>
                            {(c) => (
                              <tr>
                                <td colspan="3">
                                  <div class="inline-comment">{c.text}</div>
                                </td>
                              </tr>
                            )}
                          </For>
                        </Show>
                      </>
                    )}
                  </For>
                </>
              )}
            </For>
          </tbody>
        </table>
      </Show>
    </section>
  );
}

function DiffRow(props: { l: DiffLine; onLine: (n: number | null) => void; hasComment: boolean }) {
  const sign = { add: "+", del: "−", context: " " }[props.l.kind];
  return (
    <tr class={`dl dl-${props.l.kind}`} classList={{ commented: props.hasComment }}>
      <td class="ln num">{props.l.old_no ?? ""}</td>
      <td class="ln num ln-new" onClick={() => props.l.new_no && props.onLine(props.l.new_no)} title="写批注">
        {props.l.new_no ?? ""}
      </td>
      <td class="code mono">
        <span class="sign">{sign}</span>
        {props.l.text}
      </td>
    </tr>
  );
}

function Composer(props: { onSubmit: (t: string) => void; onCancel: () => void }) {
  const [text, setText] = createSignal("");
  return (
    <div class="composer">
      <textarea
        ref={(el) => setTimeout(() => el.focus())}
        rows={2}
        placeholder="这一处要怎么改？（会作为转向指令发给 Agent）"
        value={text()}
        onInput={(e) => setText(e.currentTarget.value)}
        onKeyDown={(e) => {
          if ((e.metaKey || e.ctrlKey) && e.key === "Enter") (e.preventDefault(), props.onSubmit(text()));
          if (e.key === "Escape") (e.stopPropagation(), props.onCancel());
        }}
      />
      <div class="row">
        <span class="grow" />
        <Button size="s" variant="ghost" onClick={props.onCancel}>
          取消
        </Button>
        <Button size="s" variant="primary" disabled={!text().trim()} onClick={() => props.onSubmit(text())}>
          添加批注 <Kbd k="mod+enter" />
        </Button>
      </div>
    </div>
  );
}

function AcceptPanel(props: {
  id: string;
  seen: number;
  total: number;
  detail: Awaited<ReturnType<typeof api.goal>> | undefined;
  onHumanCheck: (criterion: string, v: boolean) => void;
  onClose: () => void;
}) {
  const [busy, setBusy] = createSignal(false);
  const g = () => state.goals[props.id];
  const humans = () => props.detail?.criteria.filter((c) => c.criterion.kind.type === "human") ?? [];
  const blockers = () => {
    const b: string[] = [];
    if (g()?.state !== "in_review") b.push("目标不在待验收状态");
    for (const h of humans()) if (!h.human_checked) b.push(`人工标准 ${h.criterion.id} 还没有勾选`);
    return b;
  };
  const accept = async () => {
    setBusy(true);
    const branch = await act(() => api.accept(props.id));
    setBusy(false);
    if (branch) {
      props.onClose();
      back();
    }
  };
  return (
    <div class="overlay" onClick={props.onClose}>
      <div class="panel" onClick={(e) => e.stopPropagation()}>
        <h2 class="panel-title">验收 {props.id}</h2>
        <div class="panel-section">
          <div class="fact-row">
            <Show
              when={g()?.progress.machine}
              fallback={<span class="meta">这个目标没有机器标准：验收完全基于你的判断。</span>}
            >
              <span class="result result-pass">✓</span>
              <span>全部 {g()!.progress.machine} 条机器标准在干净环境中通过</span>
              <span class="grow" />
              <FactChip pin={g()!.verified_pin} />
            </Show>
          </div>
          <For each={humans()}>
            {(h) => (
              <label class="fact-row">
                <input type="checkbox" checked={h.human_checked} onChange={(e) => props.onHumanCheck(h.criterion.id, e.currentTarget.checked)} />
                <span class="num t3">{h.criterion.id}</span>
                <span>{h.criterion.title}</span>
              </label>
            )}
          </For>
          <div class="meta">
            你已查看 {Math.min(props.seen, props.total)}/{props.total} 个评审单元
          </div>
        </div>
        <div class="panel-section meta">
          验收会把已验证的快照封装为一个由你署名的提交，写入你仓库中的新分支
          <span class="mono t1"> tower/{props.id.toLowerCase()}-…</span>。Tower 不推送，也不改动你当前的检出；合并由你来做。
        </div>
        <Show when={blockers().length}>
          <div class="panel-blockers">
            <For each={blockers()}>{(b) => <div>■ {b}</div>}</For>
          </div>
        </Show>
        <div class="panel-actions">
          <Button variant="ghost" onClick={props.onClose}>
            取消
          </Button>
          <Button variant="primary" busy={busy()} disabled={blockers().length > 0} onClick={accept}>
            验收并写入分支
          </Button>
        </div>
      </div>
    </div>
  );
}

function ChangesPanel(props: { id: string; comments: ReviewComment[]; onClose: () => void; onRemove: (i: number) => void }) {
  const [summary, setSummary] = createSignal("");
  const [busy, setBusy] = createSignal(false);
  const send = async () => {
    setBusy(true);
    const ok = await act(() => api.requestChanges(props.id, summary(), props.comments), "已发回给 Agent");
    setBusy(false);
    if (ok !== undefined) {
      props.onClose();
      back();
    }
  };
  return (
    <div class="overlay" onClick={props.onClose}>
      <div class="panel" onClick={(e) => e.stopPropagation()}>
        <h2 class="panel-title">要求修改</h2>
        <textarea
          class="panel-text"
          rows={3}
          placeholder="总体意见（可选）…"
          value={summary()}
          onInput={(e) => setSummary(e.currentTarget.value)}
        />
        <div class="panel-section">
          <For each={props.comments} fallback={<p class="meta">还没有行内批注。点击 diff 的行号可以在具体位置写批注。</p>}>
            {(c, i) => (
              <div class="fact-row">
                <span class="mono t2">
                  {c.path}
                  {c.line ? `:${c.line}` : ""}
                </span>
                <span class="grow">{c.text}</span>
                <button class="link meta" onClick={() => props.onRemove(i())}>
                  删除
                </button>
              </div>
            )}
          </For>
        </div>
        <div class="panel-actions">
          <Button variant="ghost" onClick={props.onClose}>
            取消
          </Button>
          <Button variant="primary" busy={busy()} disabled={!summary().trim() && !props.comments.length} onClick={send}>
            发回给 Agent
          </Button>
        </div>
      </div>
    </div>
  );
}
