/**
 * Activity & errors (⌘⇧L): the last 200 errors and warnings that went by
 * as toasts, each copyable, newest first. A missed toast is never lost;
 * an empty log offers no Copy all / Clear.
 * Loaded on first open; the key lives in App.
 */
import { For, Show } from "solid-js";

import { clock } from "../lib/format";
import { t } from "../lib/i18n";
import { closeActivity } from "../lib/layers";
import { go } from "../lib/nav";
import { ACTIVITY_MAX, type ActivityEntry, clearActivity, state, toast } from "../lib/store";
import { DangerMark, NeedsYouMark } from "./Glyph";
import { Button, Empty, IconButton, Overlay } from "./ui";

function line(e: ActivityEntry): string {
  return `${new Date(e.at).toISOString()}  ${e.level}${e.goalId ? `  ${e.goalId}` : ""}  ${e.text}`;
}

export function ActivityPanel() {
  const entries = () => [...state.activity].reverse();
  const copy = (text: string) => {
    void navigator.clipboard.writeText(text);
    toast("success", t("activity.copied"));
  };
  return (
    <Overlay onClose={closeActivity} label={t("activity.title")} title={t("activity.title")} instant class="panel panel-wide panel-tracked">
        <div class="activity-head meta">
          <span class="t3">{t("activity.keeps", { n: ACTIVITY_MAX })}</span>
          <span class="grow" />
          {/* An empty log has nothing to copy or clear: the actions are not offered (a disabled ghost still reads as one). */}
          <Show when={entries().length > 0}>
            <Button size="s" variant="ghost" onClick={() => copy(entries().map(line).join("\n"))}>
              {t("activity.copyAll")}
            </Button>
            <Button size="s" variant="ghost" onClick={clearActivity}>
              {t("activity.clear")}
            </Button>
          </Show>
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
                      <button class="link-quiet code-val t2 activity-goal" onClick={() => (closeActivity(), go({ name: "goal", id: id() }))}>
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
  );
}
