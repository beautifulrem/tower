/** Application shell: sidebar, title bar and the current view. */
import { Match, Show, Switch } from "solid-js";

import { CommandPalette, TitleBar, Toasts } from "./components/Chrome";
import { Sidebar } from "./components/Sidebar";
import { Spinner } from "./components/ui";
import { useKeys } from "./lib/keys";
import { type Route, back, go, route } from "./lib/nav";
import { state } from "./lib/store";
import { ContractEditor } from "./views/ContractEditor";
import { GoalPage } from "./views/GoalPage";
import { Inbox } from "./views/Inbox";
import { Overview } from "./views/Overview";
import { Review } from "./views/Review";
import { Settings } from "./views/Settings";

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
  useKeys([
    { key: "n", run: () => go({ name: "new" }) },
    { key: "mod+1", run: () => go({ name: "overview" }), inInputs: true },
    { key: "mod+2", run: () => go({ name: "inbox" }), inInputs: true },
    { key: "mod+,", run: () => go({ name: "settings" }), inInputs: true },
    { key: "escape", run: back },
    { key: "mod+[", run: back, inInputs: true },
  ]);

  return (
    <Show when={state.loaded} fallback={<div class="boot"><Spinner /></div>}>
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
