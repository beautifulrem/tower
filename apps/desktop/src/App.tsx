/** Application shell: sidebar, title bar and the current view. */
import { For, Match, Show, Suspense, Switch, lazy, onCleanup, onMount } from "solid-js";

import { listen } from "@tauri-apps/api/event";
import { openPath, openUrl } from "@tauri-apps/plugin-opener";

import { TitleBar, Toasts } from "./components/Chrome";
import { Sidebar } from "./components/Sidebar";
import { Button, Empty, IconButton, Loading } from "./components/ui";
import { api } from "./lib/api";
import { useKeys } from "./lib/keys";
import { activityOpen, openActivity, openPalette, openShortcuts, paletteOpen, shortcutsOpen, toggleActivity, togglePalette, toggleShortcuts } from "./lib/layers";
import { useMenu } from "./lib/menu";
import { type Route, back, go, route } from "./lib/nav";
import { t, withLater } from "./lib/i18n";
import { prewarmReviews } from "./lib/prewarm";
import { act, init, state, toast } from "./lib/store";
import { Inbox } from "./views/Inbox";
import { Overview } from "./views/Overview";
import { pickProject } from "./components/Demo";

/**
 * The contract editor before its chunk and words arrive (measured on a production build: 90–180 ms from the board,
 * up to 400 ms opened cold): the document's shape in the board's ghost language — the masthead's place, three clause
 * heads with their numbers and rules, hollow lines where the fields will be. It shows only past 150 ms, so a fast
 * open never flashes it, and it appears without fading (with reduced motion too).
 */
function ContractSkeleton() {
  const clauses = [
    [72, 100, 100],
    [48, 100],
    [56, 100, 64],
  ];
  return (
    <div class="editor contract-skeleton" role="status" aria-label={t("common.loading")}>
      <div class="editor-main" aria-hidden="true">
        <div class="contract-mast">
          <i class="ghost-bar" style={{ width: "14em" }} />
        </div>
        <For each={clauses}>
          {(fields, i) => (
            <div class="editor-block">
              <header class="clause-head">
                <span class="clause-no num">{String(i() + 1).padStart(2, "0")}</span>
                <i class="ghost-bar" style={{ width: `${fields[0] / 8}em` }} />
                <span class="clause-rule" />
              </header>
              <For each={fields.slice(1)}>{(w) => <i class="ghost-field" style={{ width: `${w}%` }} />}</For>
            </div>
          )}
        </For>
      </div>
    </div>
  );
}

// Views you reach by an action, not at launch, load on first use, with the half of the dictionary they speak:
// start-up stays small and they are local files, so the delay is not perceptible. The goal page is one click from
// every first screen, so it is fetched as soon as the first frame is up rather than on that click.
const GoalPage = lazy(withLater(() => import("./views/GoalPage").then((m) => ({ default: m.GoalPage }))));
const Review = lazy(withLater(() => import("./views/Review").then((m) => ({ default: m.Review }))));
const Settings = lazy(withLater(() => import("./views/Settings").then((m) => ({ default: m.Settings }))));
const ContractEditor = lazy(withLater(() => import("./views/ContractEditor").then((m) => ({ default: m.ContractEditor }))));
// The floating layers too: each opens on a key or a click, so its code comes then. Their keys are bound here.
const CommandPalette = lazy(withLater(() => import("./components/Palette").then((m) => ({ default: m.CommandPalette }))));
const ShortcutSheet = lazy(withLater(() => import("./components/ShortcutSheet").then((m) => ({ default: m.ShortcutSheet }))));
const ActivityPanel = lazy(withLater(() => import("./components/Activity").then((m) => ({ default: m.ActivityPanel }))));

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

/**
 * Start-up failed: say what, offer to try again and to look at the data.
 * Above the words, the title bar's gauge strip with the power off — every
 * reading a dash and the one error lit — so the screen is Tower's own
 * instrument gone dark, not a dialog; no rules line here, nothing runs.
 */
function BootFailed() {
  return (
    <div class="boot">
      <div class="boot-failed">
        <div class="boot-gauges num halt" aria-hidden="true">
          <span class="gauge gauge-errors">
            <span class="gauge-dot down" />
            {t("chrome.errorsShort", { n: 1 })}
          </span>
          <span class="gauge gauge-dead">{t("chrome.runningShort", { n: "—", max: "—" })}</span>
          <span class="gauge gauge-dead">—</span>
          <span class="gauge gauge-dead">
            <span class="gauge-dot" />
            {t("chrome.engine")} <span class="t3">—</span>
          </span>
        </div>
        <Empty title={t("app.bootFailedTitle")} kind="error" poster>
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
              toast("success", t("common.copied"));
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
  // Once the first frame is up: the goal page, and with it the words the on-demand views say.
  onMount(() => requestAnimationFrame(() => setTimeout(() => void GoalPage.preload(), 0)));
  // And the colours of the reviews waiting for you, while the window idles.
  prewarmReviews();

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
      { key: "n", run: () => go({ name: "new" }), desc: () => t("app.newGoal"), hint: "n / mod+n" },
      { key: "mod+n", run: () => go({ name: "new" }), inInputs: true },
      { key: "g", run: nextNeedsYou, desc: () => t("keys.nextNeedsYou"), hint: "g / mod+alt+arrowdown" },
      { key: "mod+alt+arrowdown", run: nextNeedsYou, inInputs: true },
      { key: "mod+1", run: () => go({ name: "overview" }), inInputs: true, desc: () => t("chrome.openOverview") },
      { key: "mod+2", run: () => go({ name: "inbox" }), inInputs: true, desc: () => t("chrome.openInbox") },
      { key: "mod+,", run: () => go({ name: "settings" }), inInputs: true, desc: () => t("chrome.openSettings") },
      { key: "escape", run: back, desc: () => t("keys.back"), hint: "escape / mod+[" },
      { key: "mod+[", run: back, inInputs: true },
      { key: "mod+k", run: togglePalette, inInputs: true, desc: () => t("keys.palette") },
      { key: "?", run: toggleShortcuts, desc: () => t("keys.shortcuts") },
      { key: "mod+shift+l", run: toggleActivity, inInputs: true, desc: () => t("keys.activity") },
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
                  {(r) => (
                    <Suspense fallback={<ContractSkeleton />}>
                      <ContractEditor projectId={r.projectId} draftId={r.draftId} amendId={r.amendId} />
                    </Suspense>
                  )}
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
        <Show when={paletteOpen()}>
          <CommandPalette />
        </Show>
        <Show when={shortcutsOpen()}>
          <ShortcutSheet />
        </Show>
        <Show when={activityOpen()}>
          <ActivityPanel />
        </Show>
        <Toasts />
      </Show>
    </Show>
  );
}
