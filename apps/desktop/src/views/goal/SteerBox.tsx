/** The steer box at the foot of a running or paused goal: a note the agent reads after its current step, or when resumed. */
import { Show, createMemo, createSignal } from "solid-js";

import { Button } from "../../components/ui";
import { api } from "../../lib/api";
import { t } from "../../lib/i18n";
import { act } from "../../lib/store";

export function SteerBox(props: { id: string; running: boolean }) {
  const [text, setText] = createSignal("");
  const [receipt, setReceipt] = createSignal<string | null>(null);
  const send = async () => {
    const body = text().trim();
    if (!body) return;
    const r = await act(() => api.steer(props.id, body));
    if (r) {
      setText("");
      setReceipt(
        r === "queued_for_next_run"
          ? t("goal.queuedNextRun")
          : t("goal.delivered", { what: r === "queued" ? t("goal.afterCurrentStep") : r }),
      );
      setTimeout(() => setReceipt(null), 5000);
    }
  };
  const hint = createMemo(() => (props.running ? t("goal.steerRunning") : t("goal.steerPaused")));
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
        <span class="meta saved-stamp" role="status">
          {receipt()}
        </span>
      </Show>
      <Button size="s" disabled={!text().trim()} onClick={send} kbd="mod+enter">
        {t("common.send")}
      </Button>
    </div>
  );
}
