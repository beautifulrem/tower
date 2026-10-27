/**
 * The goal page's header actions: one primary action for the current state,
 * at most two secondary ones, and everything else in a native "…" menu
 * (destructive actions live only there). The three header buttons share
 * one form: words, no icons.
 */
import { Match, Show, Switch } from "solid-js";

import { Button, IconButton } from "../../components/ui";
import type { GoalDetail } from "../../gen/GoalDetail";
import { api } from "../../lib/api";
import { t } from "../../lib/i18n";
import { ask, popupActions } from "../../lib/native";
import { go } from "../../lib/nav";
import { act, setGoalMuted, state, toast } from "../../lib/store";

/**
 * One primary action for the current state, at most two secondary ones, and
 * everything else in a native "…" menu (destructive actions live only there).
 * The three header buttons share one form: words, no icons.
 */
export function GoalActions(props: { goal: GoalDetail["summary"]; watching: boolean; onWatch: () => void; onPause: () => void; hasDecision: boolean }) {
  const s = () => props.goal.state;
  const id = () => props.goal.id;
  const muted = () => !!state.settings?.muted_goals.includes(id());
  const confirmPush = async (pr: boolean) => {
    const ok = await ask(t("goal.confirmPush", { branch: props.goal.branch ?? "", pr }), {
      title: pr ? (props.goal.pr ? t("goal.pushUpdatePr") : t("goal.pushPr")) : t("goal.pushOnly"),
      ok: pr ? (props.goal.pr ? t("goal.pushVerb") : t("goal.pushPrVerb")) : t("goal.pushVerb"),
      cancel: t("common.cancel"),
      kind: "warning",
    });
    if (ok) void act(() => api.push(id(), pr));
  };
  const more = () =>
    popupActions([
      { label: props.watching ? t("goal.backToStatus") : t("goal.watch"), run: props.onWatch },
      { label: t("goal.amend"), run: () => go({ name: "new", amendId: id() }), enabled: !["draft", "archived", "abandoned", "accepted", "integrated"].includes(s()) },
      { label: t("goal.reverify"), run: () => void act(() => api.retryVerify(id())), enabled: ["in_review", "paused"].includes(s()) },
      {
        label: muted() ? t("quiet.unmuteGoal") : t("quiet.muteGoal"),
        separatorBefore: true,
        run: async () => {
          const next = !muted();
          if (await setGoalMuted(id(), next)) toast("info", next ? t("quiet.mutedToast", { id: id() }) : t("quiet.unmutedToast", { id: id() }));
        },
      },
      { label: t("goal.openEditor"), run: () => void act(() => api.openWorkspace(id(), "editor")), separatorBefore: true, enabled: !["draft", "ready"].includes(s()) },
      { label: t("goal.openTerminal"), run: () => void act(() => api.openWorkspace(id(), "terminal")), enabled: !["draft", "ready"].includes(s()) },
      { label: t("goal.showFinder"), run: () => void act(() => api.openWorkspace(id(), "finder")), enabled: !["draft", "ready"].includes(s()) },
      { label: t("goal.pushOnly"), run: () => void confirmPush(false), separatorBefore: true, enabled: ["accepted", "integrated"].includes(s()) && !!props.goal.branch },
      {
        label: t("goal.copyPush"),
        run: () => {
          void navigator.clipboard.writeText(`git push -u origin ${props.goal.branch}`);
          toast("success", t("goal.copiedPush"));
        },
        enabled: !!props.goal.branch,
      },
      { label: t("goal.archive"), run: () => void act(() => api.archive(id()), t("goal.archived")), enabled: ["accepted", "integrated", "in_review"].includes(s()) },
      {
        label: t("goal.removeWorkspace"),
        run: async () => {
          const ok = await ask(t("goal.removeWorkspaceConfirm", { id: id() }), {
            title: t("goal.removeWorkspaceTitle"),
            ok: t("common.delete"),
            cancel: t("common.cancel"),
            kind: "warning",
          });
          if (ok) void act(() => api.removeWorkspace(id()), t("goal.workspaceRemoved"));
        },
        enabled: ["archived", "abandoned"].includes(s()),
      },
      {
        label: t("goal.abandon"),
        separatorBefore: true,
        run: async () => {
          const ok = await ask(t("goal.abandonConfirm", { id: id() }), {
            title: t("goal.abandonTitle"),
            ok: t("goal.abandonVerb"),
            cancel: t("common.cancel"),
            kind: "warning",
          });
          if (ok) void act(() => api.abandon(id()));
        },
        enabled: !["archived", "abandoned"].includes(s()),
      },
    ]);

  return (
    <>
      {/* Ready to accept: the "next" block below carries the one primary action (R); the header does not say it twice.
          Paused with a decision card on the page: the card's options are the ways on, in its own words ("Retry"); the header
          does not offer the same exit under a second name ("Resume"). P still resumes from the keyboard. */}
      <Switch>
        <Match when={s() === "paused" && !props.hasDecision}>
          <Button size="s" variant="primary" kbd="p" onClick={props.onPause}>
            {t("goal.resume")}
          </Button>
        </Match>
        <Match when={s() === "draft"}>
          <Button size="s" variant="primary" onClick={() => go({ name: "new", draftId: id() })}>
            {t("goal.editContract")}
          </Button>
        </Match>
        <Match when={["accepted", "integrated"].includes(s()) && props.goal.branch}>
          <Button size="s" variant="primary" onClick={() => void confirmPush(true)}>
            {props.goal.pr ? t("goal.pushUpdatePr") : t("goal.pushPr")}
          </Button>
        </Match>
      </Switch>
      <Show when={["running", "verifying", "ready", "claimed"].includes(s())}>
        <Button size="s" kbd="p" onClick={props.onPause}>
          {t("goal.pause")}
        </Button>
      </Show>
      <Show when={s() !== "in_review" && (props.goal.diffstat !== null || s() === "running")}>
        <Button size="s" kbd="r" onClick={() => go({ name: "review", id: id() })}>
          {t("goal.changes")}
        </Button>
      </Show>
      <Button size="s" variant="ghost" kbd="w" aria-pressed={props.watching} onClick={props.onWatch}>
        {t("goal.trace")}
      </Button>
      <IconButton icon="ellipsis" label={t("goal.moreActions")} aria-haspopup="menu" onClick={() => void more()} />
    </>
  );
}
