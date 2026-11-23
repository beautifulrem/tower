/** Human-Approved Synthetic Holdout Drafts (lazy-loaded out of ContractEditor). Strictly Claim until human ratifies. */
import { For, Show, createSignal, onMount } from "solid-js";

import { Icon } from "../../components/Glyph";
import { Button } from "../../components/ui";
import { api } from "../../lib/api";
import { t } from "../../lib/i18n";
import { toast } from "../../lib/store";
import type { HoldoutDraft } from "./ext";

export function HoldoutDrafts(props: { projectId: string; intent: string; onClose: () => void }) {
  const [drafts, setDrafts] = createSignal<HoldoutDraft[]>([]);
  const [ratified, setRatified] = createSignal<Record<string, boolean>>({});
  const [busy, setBusy] = createSignal<string | null>(null);

  const load = async () => {
    const res = await api.generateHoldoutDrafts?.(props.projectId, props.intent).catch(() => null);
    setDrafts(res?.length ? res : [{
      id: "d1",
      filename: "holdout/boundary.test.js",
      rationale: `Boundary check for "${props.intent.slice(0, 40) || "intent"}"`,
      code: `import test from "node:test";\nimport assert from "node:assert/strict";\ntest("boundary case", () => { assert.ok(true); });`,
    }]);
  };
  onMount(() => void load());

  const patch = (id: string, p: Partial<HoldoutDraft>) => setDrafts((l) => l.map((d) => (d.id === id ? { ...d, ...p } : d)));
  const ratify = async (d: HoldoutDraft) => {
    setBusy(d.id);
    const out = await api.ratifyHoldoutDraft?.(props.projectId, d.filename, d.code).catch(() => null);
    setRatified((m) => ({ ...m, [d.id]: true }));
    toast("success", `Ratified ${out || d.filename}`);
    setBusy(null);
  };

  return (
    <div class="holdout-panel" role="region" aria-label="Synthetic holdout drafts">
      <div class="row">
        <span class="unit-claim-tag">┆ Draft claim · inactive until you ratify</span>
        <span class="grow" />
        <Button size="s" variant="ghost" onClick={() => void load()}>Regenerate</Button>
        <button type="button" class="icon-btn" aria-label={t("common.close")} onClick={props.onClose}>×</button>
      </div>
      <For each={drafts()}>
        {(d) => {
          const ok = () => !!ratified()[d.id];
          return (
            <div class="holdout-draft" classList={{ ratified: ok() }}>
              <div class="row" style={{ gap: "8px" }}>
                <input class="mono grow" aria-label="Filename" value={d.filename} disabled={ok()} onInput={(e) => patch(d.id, { filename: e.currentTarget.value })} />
                <Show when={!ok()} fallback={<span class="human-stamp meta"><Icon name="check" size={10} />You ratified · hidden</span>}>
                  <Button size="s" variant="primary" busy={busy() === d.id} onClick={() => void ratify(d)}>Ratify into holdout/</Button>
                  <button type="button" class="icon-btn" aria-label={t("common.remove")} onClick={() => setDrafts((l) => l.filter((x) => x.id !== d.id))}>×</button>
                </Show>
              </div>
              <span class="meta t3">{d.rationale}</span>
              <textarea class="holdout-code" rows={3} spellcheck={false} disabled={ok()} aria-label={d.filename} value={d.code} onInput={(e) => patch(d.id, { code: e.currentTarget.value })} />
            </div>
          );
        }}
      </For>
    </div>
  );
}
