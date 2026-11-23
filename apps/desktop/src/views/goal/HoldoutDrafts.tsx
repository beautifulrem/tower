/** Human-Approved Synthetic Holdout Drafts (lazy-loaded out of ContractEditor). Strictly Claim until human ratifies. */
import { For, Show, createSignal, onMount } from "solid-js";

import { Icon } from "../../components/Glyph";
import { Button } from "../../components/ui";
import { api, errorText } from "../../lib/api";
import { t } from "../../lib/i18n";
import { toast } from "../../lib/store";
import type { HoldoutDraft } from "./ext";

export function HoldoutDrafts(props: { projectId: string; intent: string; onClose: () => void }) {
  const [drafts, setDrafts] = createSignal<HoldoutDraft[]>([]);
  const [ratified, setRatified] = createSignal<Record<string, boolean>>({});
  const [busy, setBusy] = createSignal<string | null>(null);

  // Only what the supervisor proposed: on failure, no stand-in draft a click could ratify into the held-out tests.
  const [none, setNone] = createSignal(false);
  const load = async () => {
    const res = await api.generateHoldoutDrafts(props.projectId, props.intent).catch(() => null);
    setDrafts(res ?? []);
    setNone(!res?.length);
  };
  onMount(() => void load());

  const patch = (id: string, p: Partial<HoldoutDraft>) => setDrafts((l) => l.map((d) => (d.id === id ? { ...d, ...p } : d)));
  const ratify = async (d: HoldoutDraft) => {
    setBusy(d.id);
    try {
      const out = await api.ratifyHoldoutDraft(props.projectId, d.filename, d.code);
      setRatified((m) => ({ ...m, [d.id]: true }));
      toast("success", t("contract.holdoutRatified", { file: out || d.filename }));
    } catch (e) {
      toast("error", errorText(e));
    } finally {
      setBusy(null);
    }
  };

  return (
    <div class="holdout-panel" role="region" aria-label={t("contract.synthHoldout")}>
      <div class="row">
        <span class="unit-claim-tag">{t("contract.holdoutDraftTag")}</span>
        <span class="grow" />
        <Button size="s" variant="ghost" onClick={() => void load()}>{t("contract.regenerate")}</Button>
        <button type="button" class="icon-btn" aria-label={t("common.close")} onClick={props.onClose}>×</button>
      </div>
      <Show when={none()}><span class="meta t3">{t("contract.holdoutNone")}</span></Show>
      <For each={drafts()}>
        {(d) => {
          const ok = () => !!ratified()[d.id];
          return (
            <div class="holdout-draft" classList={{ ratified: ok() }}>
              <div class="row" style={{ gap: "8px" }}>
                <input class="mono grow" aria-label={t("contract.holdoutFilename")} value={d.filename} disabled={ok()} onInput={(e) => patch(d.id, { filename: e.currentTarget.value })} />
                <Show when={!ok()} fallback={<span class="human-stamp meta"><Icon name="check" size={10} />{t("contract.holdoutRatifiedStamp")}</span>}>
                  <Button size="s" variant="primary" busy={busy() === d.id} onClick={() => void ratify(d)}>{t("contract.holdoutRatify")}</Button>
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
