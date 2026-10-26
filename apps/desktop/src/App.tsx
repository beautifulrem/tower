/** Application shell: sidebar, title bar and the current view. */
import { Match, Show, Switch, lazy, onCleanup } from "solid-js";

import { listen } from "@tauri-apps/api/event";
import { openPath, openUrl } from "@tauri-apps/plugin-opener";

import { ActivityPanel, openActivity } from "./components/Activity";
import { CommandPalette, TitleBar, Toasts, openPalette } from "./components/Chrome";
import { ShortcutSheet, openShortcuts } from "./components/ShortcutSheet";
import { Sidebar } from "./components/Sidebar";
import { Button, Empty, IconButton, Loading } from "./components/ui";
import { api } from "./lib/api";
import { useKeys } from "./lib/keys";
import { useMenu } from "./lib/menu";
import { type Route, back, go, route } from "./lib/nav";
import { t } from "./lib/i18n";
import { act, init, state, toast } from "./lib/store";
import { GoalPage } from "./views/GoalPage";
import { Inbox } from "./views/Inbox";
import { Overview } from "./views/Overview";
import { pickProject } from "./views/Welcome";

// Views you reach by an action, not at launch, load on first use: start-up
// stays small and they are local files, so the delay is not perceptible.
const Review = lazy(() => import("./views/Review").then((m) => ({ default: m.Review })));
const Settings = lazy(() => import("./views/Settings").then((m) => ({ default: m.Settings })));
const ContractEditor = lazy(() => import("./views/ContractEditor").then((m) => ({ default: m.ContractEditor })));

/** The next item that needs you, cycling (Codex ⌘⌥A, Conductor ⌘⌥L). */
function nextNeedsYou() {
  const items = state.inbox;
  if (!items.length) return;
  const r = route();
  const current = r.name === "goal" ? items.findIndex((i) => i.goal_id === r.id) : -1;
  go({ name: "goal", id: items[(current + 1) % items.length].goal_id });
}

/** The current route if it has the given name, narrowed. */
function at<N extends Route["name"]>(name: N): Extract<Route, { name: N }> | null {
  const r = route();
  return r.name === name ? (r as Extract<Route, { name: N }>) : null;
}

function titleOf(): string {
  const r = route();
  switch (r.name) {
    case "overview":
      return t("app.overview");
    case "inbox":
      return t("common.needsYou");
    case "settings":
      return t("app.settings");
    case "new":
      return r.amendId
        ? t("app.amend", { id: r.amendId })
        : r.draftId
          ? t("app.editDraft", { id: r.draftId })
          : t("app.newGoal");
    case "goal":
      return state.goals[r.id]?.title ?? r.id;
    case "review":
      return t("app.review", { id: r.id });
  }
}

/** Start-up failed: say what, offer to try again and to look at the data. */
function BootFailed() {
  return (
    <div class="boot">
      <div class="boot-failed">
        <Empty title={t("app.bootFailedTitle")} kind="error">
          {t("app.bootFailedBody")}
        </Empty>
        <div class="boot-error-wrap">
          <pre class="output-tail boot-error">{state.loadError}</pre>
          <IconButton
            icon="copy"
            size={22}
            label={t("app.copyError")}
            onClick={() => {
              void navigator.clipboard.writeText(state.loadError ?? "");
              toast("info", t("common.copied"));
            }}
          />
        </div>
        <div class="row">
          <Button variant="primary" onClick={() => void init()}>
            {t("common.retry")}
          </Button>
          <Show when={state.env?.data_dir}>
            {(dir) => (
              <Button variant="ghost" onClick={() => void openPath(dir())}>
                {t("app.openDataFolder")}
              </Button>
            )}
          </Show>
          <span class="grow" />
          <Show when={state.env?.data_dir}>
            <span class="meta t3 code-val ellipsis">{state.env!.data_dir}</span>
          </Show>
        </div>
      </div>
    </div>
  );
}

export function App() {
  // Inactive windows dim their chrome (HIG); status colours stay. The window
  // events are enough here, so the window module stays out of the bundle.
  const active = (on: boolean) => () => (document.documentElement.dataset.windowActive = on ? "true" : "false");
  const unlisten = Promise.all([listen("tauri://focus", active(true)), listen("tauri://blur", active(false))]);
  onCleanup(() => void unlisten.then((fs) => fs.forEach((f) => f())));

  useMenu({
    "nav:new": () => go({ name: "new" }),
    "nav:overview": () => go({ name: "overview" }),
    "nav:inbox": () => go({ name: "inbox" }),
    "nav:settings": () => go({ name: "settings" }),
    "nav:back": back,
    "app:palette": () => openPalette("keyboard"),
    "app:shortcuts": () => openShortcuts(),
    "app:activity": () => openActivity(),
    "project:add": () => void pickProject(),
    "goal:check-integration": () => void act(api.checkIntegration, t("app.integrationChecked")),
    "help:docs": () => void openUrl("https://github.com/beautifulrem/tower/tree/main/docs"),
    "help:issues": () => void openUrl("https://github.com/beautifulrem/tower/issues/new"),
  });

  useKeys(
    [
      { key: "n", run: () => go({ name: "new" }), desc: () => t("app.newGoal"), hint: "n mod+n" },
      { key: "mod+n", run: () => go({ name: "new" }), inInputs: true },
      { key: "g", run: nextNeedsYou, desc: () => t("keys.nextNeedsYou"), hint: "g mod+alt+arrowdown" },
      { key: "mod+alt+arrowdown", run: nextNeedsYou, inInputs: true },
      { key: "mod+1", run: () => go({ name: "overview" }), inInputs: true, desc: () => t("chrome.openOverview") },
      { key: "mod+2", run: () => go({ name: "inbox" }), inInputs: true, desc: () => t("chrome.openInbox") },
      { key: "mod+,", run: () => go({ name: "settings" }), inInputs: true, desc: () => t("chrome.openSettings") },
      { key: "escape", run: back, desc: () => t("keys.back"), hint: "escape mod+[" },
      { key: "mod+[", run: back, inInputs: true },
    ],
    () => t("keys.everywhere"),
  );

  return (
    <Show when={state.loaded} fallback={<div class="boot"><Loading text={t("app.starting")} /></div>}>
      <Show when={!state.loadError} fallback={<BootFailed />}>
        <div class="shell" classList={{ "shell-full": route().name === "review" }}>
          <Sidebar />
          <main class="content">
            <Show when={route().name !== "review"}>
              <TitleBar title={titleOf()} />
            </Show>
            <div class="view" classList={{ "view-full": route().name === "review" }}>
              <Switch>
                <Match when={route().name === "overview"}>
                  <Overview />
                </Match>
                <Match when={route().name === "inbox"}>
                  <Inbox />
                </Match>
                <Match when={route().name === "settings"}>
                  <Settings />
                </Match>
                <Match when={at("new")} keyed>
                  {(r) => <ContractEditor projectId={r.projectId} draftId={r.draftId} amendId={r.amendId} />}
                </Match>
                <Match when={at("goal")} keyed>
                  {(r) => <GoalPage id={r.id} />}
                </Match>
                <Match when={at("review")} keyed>
                  {(r) => <Review id={r.id} />}
                </Match>
              </Switch>
            </div>
          </main>
        </div>
        <CommandPalette />
        <ShortcutSheet />
        <ActivityPanel />
        <Toasts />
      </Show>
    </Show>
  );
}
