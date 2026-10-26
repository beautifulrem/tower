/** Application shell: sidebar, title bar and the current view. */
import { Match, Show, Switch } from "solid-js";

import { getCurrentWindow } from "@tauri-apps/api/window";
import { openUrl } from "@tauri-apps/plugin-opener";
import { onCleanup } from "solid-js";

import { CommandPalette, TitleBar, Toasts, openPalette } from "./components/Chrome";
import { Sidebar } from "./components/Sidebar";
import { Loading } from "./components/ui";
import { api } from "./lib/api";
import { useKeys } from "./lib/keys";
import { useMenu } from "./lib/menu";
import { type Route, back, go, route } from "./lib/nav";
import { act, state } from "./lib/store";
import { ContractEditor } from "./views/ContractEditor";
import { GoalPage } from "./views/GoalPage";
import { Inbox } from "./views/Inbox";
import { Overview } from "./views/Overview";
import { Review } from "./views/Review";
import { Settings } from "./views/Settings";
import { pickProject } from "./views/Welcome";

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
      return "概览";
    case "inbox":
      return "需要你";
    case "settings":
      return "设置";
    case "new":
      return r.amendId ? `修订合同 · ${r.amendId}` : r.draftId ? `编辑草稿 · ${r.draftId}` : "新目标";
    case "goal":
      return state.goals[r.id]?.title ?? r.id;
    case "review":
      return `评审 · ${r.id}`;
  }
}

export function App() {
  // Inactive windows dim their chrome (HIG); status colours stay.
  const win = getCurrentWindow();
  const unlisten = win.onFocusChanged(({ payload }) => {
    document.documentElement.dataset.windowActive = payload ? "true" : "false";
  });
  onCleanup(() => void unlisten.then((f) => f()));

  useMenu({
    "nav:new": () => go({ name: "new" }),
    "nav:overview": () => go({ name: "overview" }),
    "nav:inbox": () => go({ name: "inbox" }),
    "nav:settings": () => go({ name: "settings" }),
    "nav:back": back,
    "app:palette": openPalette,
    "project:add": () => void pickProject(),
    "goal:check-integration": () => void act(api.checkIntegration, "已检查合入情况"),
    "help:docs": () => void openUrl("https://github.com/beautifulrem/tower/tree/main/docs"),
    "help:issues": () => void openUrl("https://github.com/beautifulrem/tower/issues/new"),
  });

  useKeys([
    { key: "n", run: () => go({ name: "new" }) },
    { key: "mod+n", run: () => go({ name: "new" }), inInputs: true },
    { key: "mod+alt+arrowdown", run: nextNeedsYou, inInputs: true },
    { key: "g", run: nextNeedsYou },
    { key: "mod+1", run: () => go({ name: "overview" }), inInputs: true },
    { key: "mod+2", run: () => go({ name: "inbox" }), inInputs: true },
    { key: "mod+,", run: () => go({ name: "settings" }), inInputs: true },
    { key: "escape", run: back },
    { key: "mod+[", run: back, inInputs: true },
  ]);

  return (
    <Show when={state.loaded} fallback={<div class="boot"><Loading /></div>}>
      <Show when={!state.loadError} fallback={<div class="boot"><p class="meta">Tower 无法启动：{state.loadError}</p></div>}>
        <div class="shell">
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
        <Toasts />
      </Show>
    </Show>
  );
}
