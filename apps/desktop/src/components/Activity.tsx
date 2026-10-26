/**
 * Activity & errors (⌘⇧L): the last 200 errors and warnings that went by
 * as toasts, each copyable, newest first. A missed toast is never lost.
 */
import { For, Show, createSignal } from "solid-js";

import { clock } from "../lib/format";
import { t } from "../lib/i18n";
import { useKeys } from "../lib/keys";
import { go } from "../lib/nav";
import { ACTIVITY_MAX, type ActivityEntry, clearActivity, markActivitySeen, state, toast } from "../lib/store";
import { DangerMark, NeedsYouMark } from "./Glyph";
import { Button, Empty, IconButton, Overlay } from "./ui";

const [open, setOpen] = createSignal(false);
export const openActivity = () => {
  markActivitySeen();
  setOpen(true);
};

function line(e: ActivityEntry): string {
  return `${new Date(e.at).toISOString()}  ${e.level}${e.goalId ? `  ${e.goalId}` : ""}  ${e.text}`;
}

export function ActivityPanel() {
  useKeys([{ key: "mod+shift+l", run: () => (open() ? setOpen(false) : openActivity()), inInputs: true, desc: () => t("keys.activity") }], () => t("keys.everywhere"));
  const entries = () => [...state.activity].reverse();
  const copy = (text: string) => {
    void navigator.clipboard.writeText(text);
    toast("success", t("activity.copied"));
  };
  return (
    <Show when={open()}>
      <Overlay onClose={() => setOpen(false)} label={t("activity.title")} title={t("activity.title")} instant class="panel panel-wide">
        <div class="activity-head meta">
          <span class="t3">{t("activity.keeps", { n: ACTIVITY_MAX })}</span>
          <span class="grow" />
          <Button size="s" variant="ghost" disabled={!entries().length} onClick={() => copy(entries().map(line).join("\n"))}>
            {t("activity.copyAll")}
          </Button>
          <Button size="s" variant="ghost" disabled={!entries().length} onClick={clearActivity}>
            {t("activity.clear")}
          </Button>
        </div>
        <div class="activity-list" role="log">
          <For each={entries()} fallback={<Empty title={t("activity.emptyTitle")} inline>{t("activity.emptyBody")}</Empty>}>
            {(e) => (
              <div class="activity-row">
                <span class="activity-time num">{clock(e.at)}</span>
                <span class="activity-mark">
                  <Show when={e.level === "error"} fallback={<NeedsYouMark title={t("activity.warning")} />}>
                    <DangerMark title={t("activity.error")} />
                  </Show>
                </span>
                <span class="activity-text">
                  <Show when={e.goalId}>
                    {(id) => (
                      <button class="link-quiet code-val t2 activity-goal" onClick={() => (setOpen(false), go({ name: "goal", id: id() }))}>
                        {id()}
                      </button>
                    )}
                  </Show>
                  {e.text}
                </span>
                <IconButton icon="copy" size={22} label={t("activity.copy")} onClick={() => copy(line(e))} />
              </div>
            )}
          </For>
        </div>
      </Overlay>
    </Show>
  );
}
