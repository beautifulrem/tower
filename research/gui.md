# Goal-Centric GUI for Pi: frontend stack, performance, and visual design

*Research memo, 2026-10-15. Covers the frontend, performance, and visual-design track for the Goal-centric supervisor GUI over the Pi coding agent. It is a companion to `theory-brainstorm.md`.*

Versions were checked against npm on 2026-10-15 unless noted otherwise. Web-sourced benchmark numbers come from third parties and were measured on a single machine. Treat them as directional and re-measure on our own workloads (§9).

---

## 0. TL;DR (the opinionated answer)

| Layer | Pick | Runner-up / escape hatch |
|---|---|---|
| Desktop shell | **Electron 44.x** (Chromium 152, Node 24.18) | Tauri 3 + CEF runtime once it leaves alpha; native Swift shell + WKWebView (the Raycast 2 pattern) as a Mac-only "premium" fork |
| Hosting Pi | **Pi SDK (`@earendil-works/pi-coding-agent` 1.2.0) in Electron `utilityProcess` "agent hosts"**, talking to the renderer over a direct `MessagePort` | Per-goal `pi --mode rpc` child (uses the user's installed Pi and extensions), selectable in settings |
| Core seam | A shell-agnostic **Supervisor** protocol (snapshot + deltas). It runs over MessagePort in the app and over WebSocket in `serve` mode | Gives a local web server + browser mode almost for free (remote/headless) |
| UI framework | **React 19.3 + React Compiler 1.0**, with an external event-sourced store, selector subscriptions, and rAF-batched commits. Hot text paths bypass React | SolidJS: 1.9 now, or 2.0 once out of RC. Pick it if the team prefers signals over ecosystem |
| Virtualization | **@tanstack/react-virtual 3.14** (core 3.19). Use `anchorTo:'end'` for streaming traces | virtua 0.53 |
| Diff review | **@pierre/diffs 1.5** (Shiki worker pool, virtualization, annotations for inline comments). Diffs computed by `git` in the supervisor | CodeMirror 6 merge (6.12) for "fix it myself" edits; Monaco 0.57 lazy-loaded only for huge single files |
| Highlighting | **Shiki 4.5**, JS regex engine, in a worker, with a curated grammar list and a content-hash cache | highlight.js for tiny inline snippets |
| Terminal | **xterm.js 6.0 + addon-webgl** with node-pty 1.1 in the agent host. WebGL only for *visible* terminals | wterm 0.5 (DOM, accessible, optional libghostty core) and ghostty-web 0.4: watch both, adopt in 2027 if they mature |
| Markdown | **streamdown 2.7** for agent prose. Static mode for finished messages | Hand-rolled block-memoized marked + Shiki |
| Primitives | **Base UI 1.9** (unstyled), cmdk 1.1, tinykeys 4 | React Aria Components 1.22 where a11y is hardest (grids) |
| Styling | **Tailwind 4.3** on top of OKLCH CSS-variable tokens (§6) | Plain CSS modules + the same tokens |
| Fonts | **Inter Variable 4.x** (UI) + **JetBrains Mono** (code) + platform CJK (PingFang SC / Microsoft YaHei UI / Noto Sans CJK SC) | Geist + Geist Mono; Berkeley Mono TX-02 as a paid option |
| Persistence | `node:sqlite` (built into Node 24) in the supervisor: an append-only event log plus projections | better-sqlite3 13 |
| Build/ship | Vite 8 + electron-vite 6, electron-builder 26 + electron-updater 6.8 | Electron Forge 8 |

**Design direction:** a *quiet instrument panel*, in the spirit of "Linear's 2026 calm refresh meets the dark cockpit".
- Warm neutral grays, a dimmer sidebar, and almost no chroma.
- Color is reserved for **status semantics only**. Amber is the color of "Needs You".
- Motion is reserved for **state changes that require the human**. Every other live change is an instant, peripheral text or glyph swap.
- Layout is stable: nothing moves unless the user moved it.
- The UI is keyboard-first, and nothing opened by keyboard animates.
- Facts derived by the harness and claims made by the agent get **visibly different typography** (§6.6), which carries the honesty thesis from `theory-brainstorm.md`.

**Perf budget headline:**
- Cold start ≤ 500 ms to an interactive goal list (M-series Mac).
- Focused-goal event → paint ≤ 16 ms p95.
- Idle footprint ≤ 250 MB.
- 10 streaming agents ≤ 600 MB (excluding tool subprocesses).
- 10k-line diff: first rows ≤ 150 ms.
- 120 fps scroll on ProMotion.

---

## 1. Ground truth about Pi (verified 2026-10-15)

- The repo now lives at `github.com/earendil-works/pi` (`badlogic/pi-mono` redirects). Packages are published under `@earendil-works/*`. `pi-coding-agent` is **1.2.0** and requires **Node ≥ 22.19** (npm `engines`). The monorepo contains `agent, ai, chord, codemode, coding-agent, durable, evals, mcp, telemetry, tui`.
- **pi-web-ui no longer exists.** It was a Lit 3 + `@mariozechner/mini-lit` + Tailwind component kit for chat UIs. Its last version was 0.75.3, and the commit "chore: remove web-ui workspace" removed it on **2026-05-20** (verified via GitHub API). There is nothing official to reuse for a GUI, and nothing forces us onto Lit.
- **pi-tui** is a terminal UI library with differential rendering and is irrelevant for the GUI.
- **Integration surfaces** (from `docs/rpc.md`, `docs/sdk.md`, `docs/json.md`):
  - **SDK.** `createAgentSession()` runs in-process in Node or Bun and exposes `session.subscribe(event => …)`, `prompt / steer / followUp / abort / waitForIdle`, `SessionManager` (JSONL DAG), and `DefaultResourceLoader` (extensions, skills, context files). The CLI's built-in `codemode`, `tool_search` and MCP extensions **are not loaded by default in SDK sessions**. They must be added explicitly.
  - **RPC.** `pi --mode rpc` uses strict LF-delimited JSONL. Don't use Node `readline`: it splits on U+2028/2029. Stdout honors backpressure. There is an exported typed `RpcClient`, and an `./rpc-entry` export.
  - **Event stream.** `agent_start / agent_end / agent_settled`, `turn_*`, `message_start / update / end` (with `text_delta`, `thinking_delta`, `toolcall_delta`, …), `tool_execution_start / update / end` (with `durationMs`), `queue_update`, compaction and retry events.
  - **Extension UI sub-protocol.** `extension_ui_request` comes in two kinds:
    - Blocking dialogs: `select / confirm / input / editor`, with an optional `timeout`.
    - Fire-and-forget calls: `notify / setStatus / setWidget / setTitle`.

    **These dialog requests map directly onto the "Needs You" inbox.** The `timeout` field is the "what happens if you ignore this" default from theory §C8.
- **`@earendil-works/chord`** is new in the monorepo. It describes itself as "objects … in several processes (a server, workers, browser tabs)", where "State is observable JSON. Remote viewers get a snapshot followed by deltas", and links run "in memory, a Node IPC channel, or a WebSocket". That is exactly the supervisor→renderer replication shape we need. **Evaluate it before writing our own** (§3.4). It is young, so keep our protocol thin enough to swap.
- Pi's own binary build uses `bun build --compile`. This matters only if we choose a sidecar shell (Tauri or Electrobun).

---

## 2. Desktop shell

### 2.1 Candidates and current facts

**Electron 44** ([blog](https://www.electronjs.org/blog/electron-44-0), released 2026-08-25; npm latest 44.7.2)
- Ships Chromium 152, Node 24.18.1, V8 15.2. Requires macOS 13+.
- Main now boots from an embedded Node startup snapshot. Framework bundles are V8-code-cached, and sandboxed renderer startup data is pushed ahead of navigation ([PR #51792/#51831](https://github.com/electron/electron/pull/51792)).
- `utilityProcess` + `MessageChannelMain` give renderer↔Node-process channels that **bypass the main process** ([docs](https://www.electronjs.org/docs/latest/tutorial/message-ports)).
- [electron-bench](https://github.com/ZacWalk/electron-bench) numbers:
  - 1 KB JSON over MessagePort: ≈ 0.2 ms p50.
  - 64 KB: 1.5 ms.
  - 1 MB: 21.5 ms.
  - Transferred 1 MB ArrayBuffer: 3.2 ms.
  - Over 10k messages, main-process CPU is ~140 ms with a utility process versus far more with relays.
- Precedents:
  - **Codex app**: Electron 40 + Vite + React, driving the Rust CLI ([teardown](https://www.kitze.io/posts/codex-electron-app-technical-breakdown), [issue #11023](https://github.com/openai/codex/issues/11023)).
  - **Claude Code desktop**: rebuilt around parallel sessions in April 2026 ([MacRumors](https://www.macrumors.com/2026/04/15/anthropic-rebuilds-claude-code-desktop-app/)).
  - **T3 Code**: Electron + React + a Node WS server ([repo](https://github.com/pingdotgg/t3code)).
  - **OpenCode Desktop moved from Tauri to Electron** ([Brendan Allan, Apr 2026](https://dev.to/brendonovich/moving-opencode-desktop-to-electron-4hip)). The quote: "Tauri uses WebKit on macOS and Linux, which not only has worse performance than Chromium when rendering our app, but also has minor inconsistencies with it, especially around styles". They also said the sidecar "impacted startup time, and occasionally just failed". They now run their TS server *inside* Electron's Node.

**Tauri 2.12.x** ([2.12 announcement](https://v2.tauri.app/blog/tauri-2.12/); tauri 2.12.3 on 2026-10-10)
- Uses the system webview: WKWebView, WebView2, or WebKitGTK.
- A Node runtime has to come in as a sidecar ("externalBin"): pkg, Node SEA, or `bun build --compile`. A compiled sidecar adds roughly 20–35 MB compressed ([Tauri Node sidecar guide](https://github.com/tauri-apps/tauri-docs/blob/v2/src/content/docs/learn/sidecar-nodejs.mdx), [codeforreal](https://codeforreal.com/blogs/using-bun-or-deno-as-a-web-server-in-tauri/)).
- IPC:
  - `emit` evals JS source (a 32 KiB chunk becomes ~114 KiB of JS) ([Clavyn #48](https://github.com/CodeAny-inc/Clavyn/issues/48)).
  - `Channel` with raw bodies of ≥1 KB arrives as an ArrayBuffer over the fetch route. Base bridge overhead is ~300 µs ([tauri-conduit bench](https://github.com/userFRM/tauri-conduit/blob/master/BENCHMARKS.md)).
  - An informal benchmark measured 10 MB binary at ~5 ms on macOS versus ~200 ms on Windows ([discussion #11915](https://github.com/orgs/tauri-apps/discussions/11915)).
- Multiple webviews per window (needed for embedded previews) **are still behind the `unstable` feature** ([docs.rs](https://docs.rs/tauri/latest/tauri/), [PR #8280](https://github.com/tauri-apps/tauri/pull/8280)).
- **The WKWebView refresh cap is a real problem.**
  - WebKit's `PreferPageRenderingUpdatesNear60FPSEnabled` clamps rAF to 60 fps on 120 Hz panels.
  - Reports on macOS 27.0.1 show it still applies ([coolapk-desktop #53/#54](https://github.com/daimiaopeng/coolapk-desktop/issues/53)).
  - The only fix toggles a private WebKit preference, which is **not App-Store-safe** ([tauri-plugin-macos-fps](https://github.com/userFRM/tauri-plugin-macos-fps)).
  - There are also macOS 26 stale-frame bugs with backdrop-filter and animations ([wry #1848](https://github.com/tauri-apps/wry/issues/1848)).
  - WebKitGTK renders fonts bolder on Linux.
- **Tauri 3.0 adds an official CEF runtime** (`tauri-runtime-cef` 3.0.0-alpha.5, Sept 2026, [docs](https://v3.tauri.app/develop/cef/)). That removes the WebKit problems at Electron-like size. Today it is alpha.

**Electrobun** ([v1 blog](https://blackboard.sh/blog/electrobun-v1/) 2026-02-06; [2.0 blog](https://blackboard.sh/blog/electrobun-2-0/) 2026-08-21; npm 2.0.2)
- v1: Bun main process, system webview or bundled CEF, ~12 MB bundles, bsdiff updates as small as 14 KB.
- **2.0 dropped Bun as the default** after Anthropic acquired Bun and rewrote it in Rust (Bun 1.4, 2026-08-20). The replacement is "Cottontail", a new JSC+Zig runtime claiming "100% compat with Bun and Node's test suites".
- Swapping out the core runtime six months after 1.0 is exactly the churn a Node-based agent host can't absorb. A practitioner shipped Electron after trying it: "Windows especially became a rabbit hole" ([van Lieshout](https://www.rickvanlieshout.com/posts/2026/wanted-electrobun-shipping-chose-electron/)).

**Native options**
- **Swift/AppKit** gives the best Mac feel. But it is Mac-only, and we would still need a webview for diffs, markdown, and terminals, or else rebuild them natively.
  - Raycast's own answer in 2026 was a hybrid ([Raycast 2.0 deep dive](https://www.raycast.com/blog/a-technical-deep-dive-into-the-new-raycast), 2026-05-14): a Swift/AppKit (macOS) and C#/WPF (Windows) host, a **React UI in WKWebView/WebView2**, a **long-lived Node backend**, and a Rust core. Memory is **350–450 MB** (WebView 120–200 MB, Node 150–200 MB, shell 40 MB).
  - That is Electron-class memory even with a "native" shell. The webview+Node cost is intrinsic, not an Electron tax.
- **GPUI (Zed)** has the highest performance ceiling. However, Zed **paused community-facing GPUI work in Feb 2026**. The crates.io `gpui` is a courtesy snapshot that breaks between Zed releases ([DEV](https://dev.to/dishant0406/gpui-by-zed-the-electron-killer-that-never-left-home-209o)). Longbridge's `gpui-component` / `gpui-kit` 0.7.3 (2026-10-12) is the de-facto ecosystem ([lib.rs](https://lib.rs/crates/gpui-component)). Every component (diff, markdown, terminal) would need rebuilding in Rust, and Pi stays a separate Node process over RPC.
- **egui** is immediate-mode and cannot reach Things/Linear-grade typography.
- **iced / Slint** have thinner rich-text and code-view ecosystems.
- **Dioxus desktop** uses wry, so it inherits Tauri's webview issues.

**Local web server + browser**
- Zero shell cost, and it is great for remote and headless use (T3's `npx t3`, `opencode serve`).
- It loses dock badges, the tray, global shortcuts, OS-level focus awareness, and reliable notifications, and it inherits browser-tab memory and lifecycle (tab discarding, background throttling of timers to 1 Hz).
- Use it as a **secondary mode**, not the product.

### 2.2 Decision matrix

Scores run 1–5 (5 = best). Weights reflect the brief: beauty + speed + many agents + lean.

| Criterion (weight) | Electron 44 | Tauri 2 + Node sidecar | Tauri 3 + CEF (alpha) | Electrobun 2 | Swift/AppKit + WKWebView + Node | GPUI + Pi RPC | Web server + browser |
|---|---|---|---|---|---|---|---|
| Rendering consistency & 120 fps (×3) | **5** Chromium everywhere | 2 WebKit cap/quirks, WebKitGTK | **5** | 3 (CEF opt-in) | 3 (same WebKit cap) | **5** | 4 (user's browser varies) |
| Hosting Pi (Node ≥22.19) (×3) | **5** in-box Node 24 utilityProcess | 3 sidecar binary, extra IPC hop | 3 sidecar | 2 new runtime (Cottontail) | 3 separate Node process | 3 RPC subprocess | **5** |
| Cold start (×2) | 4 (~250–400 ms with snapshot + care) | 4 (window fast, sidecar spawn adds) | 3 | 4 | **5** | **5** | 3 |
| Memory (×2) | 3 | 4 | 3 | 4 | 3 (Raycast: 350–450 MB) | **5** | 3 |
| Bundle size (×1) | 2 (~90–110 MB) | 4 (~30–45 MB) | 2 | 4 | 4 | **5** | **5** |
| Terminals/previews/webviews (×2) | **5** WebContentsView, node-pty in box | 3 multiwebview `unstable` | 4 | 3 | 4 | 2 (build terminal yourself) | 3 (iframes only) |
| Dev velocity & ecosystem (×3) | **5** | 4 | 3 | 3 | 2 | 1 | **5** |
| Auto-update (×1) | 4 electron-updater (blockmap deltas) | 4 plugin-updater | 3 | **5** bsdiff 14 KB | 3 Sparkle | 2 DIY | **5** |
| Cross-platform (×2) | **5** | 4 | 4 | 3 | 1 | 3 | **5** |
| Maturity / risk (×2) | **5** | 4 | 2 | 2 | 4 | 2 | 4 |
| OS integration: notifications, dock badge, tray, global shortcuts (×2) | **5** | **5** | **5** | 4 | **5** | 4 | 1 |
| **Weighted total (max 115)** | **105** | 83 | 80 | 73 | 75 | 76 | 90 |

The web-server row scores well on paper. It loses on the one thing a supervision tool can't lack: reliable OS-level attention channels (dock badge, tray, focus-aware notifications), and background tabs get their timers throttled. That is why it is a secondary mode.

### 2.3 Recommendation

**Electron 44**, kept honest. The "lean" requirement is met by discipline rather than by the shell:
- One renderer for the whole app UI. Separate `WebContentsView`s only for previews.
- `sandbox: true`, `contextIsolation: true`, and no `nodeIntegration`.
- All heavy work runs in `utilityProcess`es. No Node runs in the renderer.
- Code is lazy-loaded per surface: the diff, terminal and markdown bundles are not in the boot path.
- No native modules where Node 24 built-ins suffice (`node:sqlite`).
- The Electron fuses are set: `runAsNode` off, ASAR integrity on, `loadBrowserProcessSpecificV8Snapshot` for main.

Why not Tauri, even though it is "leaner"?
- Our product is a high-frequency rendering app (streams, diffs, terminals) that must be beautiful *identically* on three OSes.
- WebKit's 60 fps clamp, its style divergences, and WebKitGTK are the exact failure modes that pushed OpenCode, the closest analogue (agent CLI + web UI + sidecar), back to Electron in 2026.
- The memory win largely evaporates once a Node sidecar runs anyway (see the Raycast 2 numbers).
- **Revisit when Tauri 3's CEF runtime ships stable.** Keeping the UI as a plain web app plus a shell-agnostic supervisor protocol makes that port a few weeks of work, not a rewrite.

### 2.4 Process architecture

```
┌─────────────── Electron main (thin: windows, menus, tray, dock badge, notifications, updater) ───────────────┐
│   creates MessageChannelMain pairs; never relays hot traffic                                                  │
└───────────────┬───────────────────────────────────────────────┬──────────────────────────────────────────────┘
                │ port A                                         │ port B (per host)
┌───────────────▼────────────────┐                ┌──────────────▼──────────────────────────────────────────────┐
│ Renderer (one, sandboxed)      │◄──MessagePort──│ Supervisor utilityProcess                                    │
│ React UI, store replica        │  frames ≤60/s  │ • event log (node:sqlite, append-only) + projections         │
│ workers: shiki, diff-parse,    │                │ • goal state machine, Needs-You routing, git (diff/worktree) │
│ markdown, search index         │                │ • coalescer: per-stream rAF-cadence batching                 │
└───────────────┬────────────────┘                │ • WS server for `serve` mode (same protocol)                 │
                │ WebContentsView (separate proc) └──────────────┬──────────────────────────────────────────────┘
        dev-server previews                                       │ MessagePort / in-proc
                                          ┌───────────────────────▼───────────────────────────┐
                                          │ Agent host utilityProcess(es)                     │
                                          │ Pi SDK sessions (createAgentSession per goal)     │
                                          │ + our goal extension (report_status, gates)       │
                                          │ + node-pty terminals, @xterm/headless buffers     │
                                          └───────────────────────────────────────────────────┘
```

- **Pi hosting.** Use one agent host per goal by default; it costs about 40–70 MB per Node utility process. Offer "pack N goals per host" for many-goal users.
  - Per-goal isolation matters. Pi extensions run arbitrary code, so a hung or crashed extension should take down one goal, not the fleet.
  - The supervisor restarts a host and resumes from Pi's JSONL session via `SessionManager`.
- **"Use my installed Pi" mode.** Spawn `pi --mode rpc` as the host instead, through the exported `RpcClient`. This respects the user's Pi version, extensions, and settings exactly, which suits Pi's "make it your own" ethos. The supervisor normalizes SDK events and RPC records into one internal event type. They are the same schema (`docs/json.md`).
- **Why not run Pi in Electron main?** Main must stay responsive for window and input plumbing, and a busy agent there stalls everything.
- **Why not in the renderer?** That needs `nodeIntegration`, which is a security and perf hazard.

---

## 3. UI framework and state

### 3.1 The real workload

The bottleneck is **event volume**, not framework diffing:
- Each streaming agent emits ~20–100 `message_update` deltas per second, plus `tool_execution_update` partials.
- At 10 agents that is roughly 500–1000 raw events per second.
- No framework should see that. The supervisor coalesces (§4.6), so the renderer sees ≤ 60 frames/s for the *focused* goal and ≤ 2–4 Hz summaries for background goals. That throttle is also the calm-UI rule (§7).

### 3.2 Benchmarks (js-framework-benchmark-style, 2026)

- **Qwrk run** (2026-09-26, Chromium headless, 5 iterations) ([issue](https://github.com/Srinath10X/qwrk/issues/27)), weighted against vanilla = 1.00:
  - Solid 1.10×
  - Svelte 5 1.12×
  - React 19 1.67×
- **HTML Next PR #173** (2026-10-08, M4 Pro, Chrome 153) ([PR](https://github.com/nextwebwg/html-next/pull/173)) shows the same ordering (React Hooks 19.2 clearly slowest).
- The official leaderboard is at krausest.github.io/js-framework-benchmark.

These benchmarks measure keyed table operations (create/swap/update of 1k–10k rows). Our design never does that at frame rate: lists are virtualized and updates are coalesced. The 1.5× gap at the operation level becomes noise once each frame touches ≤ 50 DOM nodes.

### 3.3 Options

| | React 19.3 + Compiler 1.0 | SolidJS 1.9 / 2.0 RC | Svelte 5.57 | Preact 11 + signals 2.11 | Lit 3.3 |
|---|---|---|---|---|---|
| Fine-grained updates | Via external store + selectors; Compiler removes most memo boilerplate | **Native** (signals, no VDOM) | **Native** (runes) | Signals bypass VDOM for text | Manual (reactive properties per element) |
| Ecosystem for *our* parts | **Best**: streamdown (React), @pierre/diffs React, Base UI, React Aria, cmdk, TanStack | Good (TanStack Solid, OpenCode's Solid UI); streamdown/pierre need vanilla wrappers | Medium | React-compat mostly works; Compiler/Activity don't | Thin; pi-web-ui (Lit) is gone |
| Stability in Oct 2026 | 19.3.1 stable | 1.9.17 stable; **2.0 is RC** (rc.15). Async model and APIs change (`batch` removed, `<Loading>`, `@solidjs/web`) ([RC post](https://github.com/solidjs/solid/discussions/2995)) | Stable | Stable | Stable |
| LLM/agent-assisted dev velocity | **Highest** (most training data) | Medium (1.x vs 2.0 confusion) | Medium | Medium | Low |
| Bundle | ~60 KB gz | ~8 KB | ~15 KB | ~5 KB | ~6 KB |

**Pick React 19.3 + React Compiler.** The rules that make it fast:
1. **One external store, outside React.** It holds a normalized, event-sourced replica of supervisor projections. Components subscribe with `useSyncExternalStore` plus **narrow selectors** (per goal id, per task id). A delta to goal 7 wakes only goal 7's subscribers. Hand-roll it (~150 lines), or use `@tanstack/react-store` 0.11 or Zustand 5 with `subscribeWithSelector`.
2. **Commit at most once per animation frame.** The store applies incoming frames immediately but notifies on `requestAnimationFrame`, with one notify per frame.
3. **Hot text bypasses React.** The live ticker and the currently streaming message tail are written with `node.textContent =` / `appendData` from a store subscription. React owns the structure, not the characters. When a message ends (`message_end`, authoritative), React renders the final markdown once.
4. **`<Activity mode="hidden">`** (React 19.2+) keeps recently visited goal pages warm without rendering them.
5. Off-main-thread work (Shiki, diff parsing, markdown→AST for long messages, trace search indexing) goes in **Web Workers**.

**When to choose Solid instead:** if the team is fluent in signals and accepts wrapping streamdown and @pierre/diffs via their vanilla APIs. Wait for Solid 2.0 final rather than starting on 1.9 and migrating. Svelte 5 is equally capable on perf but buys nothing extra here. Don't use Lit: it was Pi's choice for an embeddable chat widget, and that package is gone.

### 3.4 State management for event-sourced agent state

- **Source of truth.** This is the supervisor's append-only log: raw Pi events plus our harness facts (git, test runs) plus human decisions. **Projections** (goal card, task list, decisions, changes, validation, Needs You queue) are folds over that log, computed **in the supervisor**, not in the renderer. That keeps the UI thin and makes `serve` mode and future mobile clients identical.
- **Replication protocol.**
  - On subscribe, the renderer gets `snapshot(projectionId, version)`, then `delta(projectionId, version, ops[])`.
  - Ops are JSON-patch-like (`set` / `append` / `splice`), plus a special `appendText(path, str)` for streaming text, which is cheap to coalesce.
  - The renderer can request a range (trace pages) on demand. It never holds the full trace.
  - This is exactly what `@earendil-works/chord`'s `replicatedState` and `delta` encoder provide. **Prototype on chord first.** If it fits, we inherit Pi-team-maintained replication over Node IPC and WebSocket. Otherwise keep the same shape hand-rolled.
- **No CRDT needed.** There is a single writer (the supervisor) and many readers. Human actions go back as *commands* (`approve`, `comment`, `steer`) and come back as events. Use optimistic UI only for local echo of the user's own comment text.
- **Persistence.** `node:sqlite` (Node 24, no native build) in the supervisor. One `events` table (append-only, per goal), `projections` snapshots every N events, and Pi's own JSONL session files left untouched as Pi's source of truth for conversation context.

---

## 4. Performance components

### 4.1 Virtualized lists

- **@tanstack/react-virtual 3.14 / virtual-core 3.19.** It is headless and now ships a chat mode:
  - `anchorTo: 'end'` keeps the bottom pinned while the last item grows (streaming).
  - Prepends are key-anchored.
  - A 2026 perf release reports "cold mount at 100k items 5× faster" and "resize storm on 10k items 1.9 s → 1.3 ms" ([blog](https://tanstack.com/blog/tanstack-virtual-perf-and-ios), [chat docs](https://tanstack.com/virtual/latest/docs/chat)).

  Use it for the trace drawer (100k+ events), the Needs You inbox, goal lists, and the diff file list.
- **virtua 0.53** (~3 KB, zero-config dynamic sizing, reverse scroll) is a fine alternative ([repo](https://github.com/inokawa/virtua)). For an independent comparison see [virtuallist.io](https://virtuallist.io/).
- Rules:
  - Rows have estimated heights by type, and you measure once.
  - Use `content-visibility: auto` with `contain-intrinsic-size` for non-virtualized long panels.
  - Never animate the height of virtualized rows.

### 4.2 Diff review (full-screen, inline comments back to the agent)

| Option | Strengths | Weaknesses | Use |
|---|---|---|---|
| **@pierre/diffs 1.5.2** ([diffs.com](https://diffs.com/), [repo](https://github.com/pierrecomputer/pierre/tree/main/packages/diffs)) | Shiki-quality highlighting in a **worker pool** with per-file AST cache; plain rows paint first, colors land later; built-in virtualization; split/stacked; word-level changes; **annotation framework + line selection** (exactly what inline review comments need); vanilla + React | Large single files: worst main-thread stall 438–761 ms vs Monaco 85–129 ms on a 60k-line file ([Orca PR #19008](https://github.com/stablyai/orca/pull/19008)); bundles all grammars by default (~10 MB) unless trimmed; StrictMode worker-pool bug; Vite worker import must use `?worker` | **Primary review surface** |
| CodeMirror 6 merge 6.12 | Small, fast to boot, editable, incremental Lezer parsing; `timeout` option + `chunk.precise` flag | Diff runs on the main thread; degrades on big, very different files ([discuss](https://discuss.codemirror.net/t/codemirror-merge-slow-diff/7005)) | "Fix it myself" inline edit of an agent's hunk (addresses the top Codex-app complaint: no in-app editing ([Verdent](https://www.verdent.ai/guides/codex-app-first-impressions-2026))) |
| Monaco 0.57 diff | Diff in a worker, handles huge files | Multi-MB bundle, slow boot, foreign look; regression where 0.52 is 2× slower than 0.37 ([#4834](https://github.com/microsoft/monaco-editor/issues/4834)) | Lazy fallback for files > ~20k changed lines |
| git-diff-view 0.1.x, react-diff-view 3.3, diff2html 3.4 | Simple | Less maintained or less capable | No |

How to make it fast:
- **Never diff in the renderer.** The supervisor runs `git diff --histogram -M` against the goal's base and parses it into hunks in a worker. It ships per-file hunks lazily (file list first, then files as they scroll into view).
- **Size tiers:**
  - ≤ 3k changed lines: full highlighting.
  - 3k–20k: highlight visible hunks only.
  - > 20k: no syntax color, with a "highlight anyway" button.
  - Generated or lock files: collapsed by default.
- **Trim Shiki** to ~25 grammars and register our own two themes, so we don't use Oniguruma (the JS regex engine is enough), as Crit did ([PR #988](https://github.com/tomasz-tomczyk/crit/pull/988)).
- **Inline comments** are annotations keyed by `(file, side, line, hunkHash)`. "Send to agent" batches them into one `steer` (or `follow_up`) message with code-anchored quotes. A comment is marked *stale* if the hunk hash changes.
- **Review-state memory:** per-file "viewed" checkmarks keyed by content hash, so a re-push only re-opens changed files.

### 4.3 Syntax highlighting

- **Shiki 4.5** in a module worker with the JS engine.
- Warm grammars by tokenizing a short sample once. Cold first-line tokenization can hit Shiki's 500 ms per-line limit ([midgard PR](https://github.com/charliebeckstrand/midgard/pull/1916)).
- Cache by content hash.
- Don't import `bundledLanguages` on the main thread. Vite builds workers without shared chunks, so the grammars ship twice: one project went from 6.6 MB to 14.6 MB ([ziff PR #62](https://github.com/zhowzeng/ziff/pull/62)).
- Reference speeds (speed-highlight bench, M4):
  - highlight.js is ~6–7× faster than Shiki-JS at every file size.
  - Cold start: 19 ms (highlight.js) versus 169 ms (Shiki) ([repo](https://github.com/speed-highlight/core)).

  So use Shiki for diff and file views (accuracy and theme parity) and highlight.js only for tiny inline snippets in the trace if profiling shows a need.
- Tree-sitter (web-tree-sitter 0.27) only matters if we later want structural features (symbol outlines, semantic diff). It is not needed for v1.

### 4.4 Terminal

- **xterm.js 6.0.0** (2025-12-22) removed the canvas renderer, leaving WebGL and DOM.
  - WebGL is about 6× cheaper per frame: 0.73 ms versus 4.54 ms at 120×40.
  - On 300 full redraws: 59 fps with WebGL versus 38 fps with DOM ([n10 PR](https://github.com/notaharness/n10/pull/324), [Clavyn #62](https://github.com/CodeAny-inc/Clavyn/issues/62)).
- **Known hazards in 2026:**
  - **Chromium allows 16 WebGL contexts per page and evicts the oldest.** `WebglAddon.dispose()` doesn't release its context (#6068), so call `WEBGL_lose_context` yourself. Only visible terminals get WebGL. Hidden ones are detached, and their state lives in `@xterm/headless` in the agent host. Reattach by serializing.
  - Glyph-atlas corruption in long sessions was fixed upstream (#5883) but not yet in a stable release. Pin and track it.
  - Check `addon-webgl` 0.19 versus 6.1-beta compatibility claims ([hive-desktop #337](https://github.com/hay-kot/hive-desktop/issues/337)).
- PTYs: **node-pty 1.1** in the agent host, never in main. Bytes flow pty → host → MessagePort as transferred `ArrayBuffer` → terminal. Batch to one write per frame per terminal.
- Watch two alternatives:
  - **ghostty-web 0.4** (Coder): xterm.js-API-compatible, a ~400 KB WASM libghostty-vt core, better Unicode/RTL ([repo](https://github.com/coder/ghostty-web)).
  - **wterm 0.5.4** (Vercel Labs): renders to the **DOM**, so native selection, find and screen readers work. It has a ~26 KB Zig core or an optional libghostty core, and dirty-row rendering ([repo](https://github.com/vercel-labs/wterm)).

  wterm's accessibility story is attractive for the "peek at a terminal" case. Re-evaluate both in 2027.
- **Agent tool output in the trace is not a terminal.** Render `bash` tool output with an ANSI→spans parser inside virtualized rows. Only *interactive* terminals use xterm.

### 4.5 Markdown streaming

- **streamdown 2.7** ([repo](https://github.com/vercel/streamdown)) is a drop-in for react-markdown designed for streaming.
  - `remend` closes unterminated syntax mid-stream.
  - Completed blocks are memoized (a per-block `Block` with deep compare).
  - Since 1.6 it uses a custom renderer, LRU caches, and lazy code/Mermaid/KaTeX ([changelog](https://vercel.com/changelog/streamdown-1-6-is-now-available-to-run-faster-and-ship-less-code)).
  - `mode="static"` is for finished messages.
- Pipe its code blocks through *our* Shiki worker, not its bundled highlighter.
- In the Goal page, agent prose is mostly hidden behind structured state. Streamdown matters most in the trace drawer and in Decisions/Claims.

### 4.6 IPC throughput and the coalescer

- **Transport:** renderer ↔ supervisor over a direct `MessagePort` (structured clone). Expect ~0.2 ms p50 per 1 KB message. Structured clone of plain objects is fine. Don't JSON-stringify twice.
- **Coalescer** in the supervisor, per subscriber:
  - Consecutive `text_delta`s on the same `(message, contentIndex)` merge into one `appendText`.
  - `tool_execution_update` partials collapse to *latest only*.
  - Projection deltas merge per entity.
  - Flush cadence: on `vsync`-ish 16 ms ticks for the **focused goal**, and 250–500 ms for **background goals** (calm rule, §7). Flush immediately for state transitions that change attention level (Needs You, failure, done).
  - Target payload ≤ 8 KB per frame, with large blobs (file contents, terminal bytes) in `ArrayBuffer`s via transfer.
- **SharedArrayBuffer** is not needed. It requires COOP/COEP cross-origin isolation and buys nothing at these rates. Reconsider only for a terminal ring buffer if profiling shows copy cost.
- **Backpressure:** the renderer acks frames. If it falls behind (a hidden window, for example), the supervisor stops sending deltas and sends a fresh snapshot on resume, so it never queues unboundedly.
- With Pi over RPC, read stdout continuously with an LF splitter (not `readline`). Pi honors backpressure, so a stalled reader stalls the agent.

### 4.7 Rendering 10 agents streaming at once

- Overview board: each card subscribes to *its* summary projection only. Updates are ≤ 4 Hz, the ticker is direct-DOM, and there are no per-token renders.
- Focused goal: one streaming surface at 60 Hz (the trace tail or the current task line).
- Hidden goals: no subscription beyond the summary. `<Activity>` keeps the last view.
- Expected main-thread cost: < 2 ms per frame scripting at 10 agents. Verify with the soak test in §9.

### 4.8 Previews

- Use `WebContentsView` (separate renderer process, crash-isolated, own session partition) for dev-server previews. Never use `<webview>`.
- Static HTML artifacts go in sandboxed `<iframe srcdoc>`.
- Throttle offscreen previews with `webContents.setBackgroundThrottling(true)` and `setFrameRate(…)`.

---

## 5. Visual design: what makes the reference apps great

| App | What to steal | What to avoid |
|---|---|---|
| **Linear** (Mar 2026 refresh, [post](https://linear.app/now/behind-the-latest-design-refresh)) | "Calmer, more consistent": sidebar **a few notches dimmer** so content wins; fewer, smaller icons; no colored team-icon backgrounds; **warmer, less saturated grays**; themes generated in a perceptual space (LCH) ([older post](https://linear.app/now/how-we-redesigned-the-linear-ui)); consistent headers/view controls across every object type | Over-reliance on subtle gray-on-gray contrast for status |
| **Raycast** | Keyboard is the interface: every action lists its shortcut inline; density as a feature; **no open animation** for a thing used 100×/day; hairline 1px alpha borders (6–10% white) on dark; avoids `cursor:pointer` and hover highlights to feel native ([deep dive](https://www.raycast.com/blog/a-technical-deep-dive-into-the-new-raycast)) | Heavy 3D keycap styling in marketing |
| **Zed** | Density settings driven by a spacing scale (`ui::Spacing`, compact/comfortable) ([#18078](https://github.com/zed-industries/zed/issues/18078)); a UI sans + a mono with a shared design language (IBM Plex Sans + Lilex) ([PR #36084](https://github.com/zed-industries/zed/pull/36084)); a 200+-token theme system ([Theme Builder](https://zed.dev/blog/theme-builder)) | Gray-on-gray dark themes (users complain) |
| **Things 3** | Typographic hierarchy by **weight** not color; generous whitespace; "each animation is purposeful", e.g. the to-do expanding into a sheet of paper is *spatial*, explaining where you went ([MacStories](https://www.macstories.net/reviews/things-3-beauty-and-delight-in-a-task-manager/)) | Low contrast for presbyopic users (App Store complaints) |
| **Arc** | Sidebar as the spatial home; per-space color; command bar as the main entry point | Novelty animations; color everywhere |
| **Vercel Geist** | Disciplined scale semantics: steps 1–3 bg, 4–6 borders, 7–8 high-contrast bg, 9–10 text; gray for everything by default, color only for meaning ([colors](https://vercel.com/geist/colors)) | Pure black/white contrast extremes |
| **Codex app** | Threads → worktrees → **review queue** as the operating surface ([OpenAI](https://openai.com/index/introducing-the-codex-app/)) | No in-app editing; chat-first framing |
| **Claude Code desktop** (Apr 2026) | Sidebar of sessions filterable by status/project; integrated terminal, editor, **diff viewer rebuilt for large changesets**; auto-archive on PR merge; Verbose/Normal/Summary view modes ([MacRumors](https://www.macrumors.com/2026/04/15/anthropic-rebuilds-claude-code-desktop-app/)) | Still session/chat-centric |
| **Cursor 3 Agents Window** | Separate agent-first window; unified multi-file diff view ([docs](https://cursor.com/docs/agent/agents-window)) | Users asked to **group diffs by agent** because the flat list was "unmanageable" ([forum](https://forum.cursor.com/t/group-diffs-by-agent-in-source-control-panel/149215)). Our Changes are per goal by construction |
| **Conductor** | Workspace = worktree + branch + chat + diff; macOS-only polish ([continuumcode](https://continuumcode.ai/guides/what-is-conductor/)) | — |

**Synthesis for our product:**
1. **Content beats chrome.** The sidebar is dimmer and the board is the brightest surface.
2. **Gray is the default and color means something.** Exactly five status hues. The accent is reserved for focus and selection.
3. **Typography carries hierarchy.** Use weight 400/500/600, size, and the gray step. Avoid boxes, icons, and badges.
4. **Density plus air.** The base size is 13 px, which is dense like Linear and Zed. Breathing room comes from fewer elements, not bigger ones.
5. **Keyboard-first, everywhere.** The palette is the spine.
6. **Motion is a signal, not decoration** (§7).
7. **Stable layout.** Nothing reorders under the user's eyes.

---

## 6. Design tokens (draft v0)

### 6.1 Typography

```css
:root {
  /* UI: Inter 4 variable (opsz axis 14–32). Latin first, then platform CJK. */
  --font-ui: "InterVariable", "Inter", -apple-system, BlinkMacSystemFont, "Segoe UI",
             "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei UI", "Microsoft YaHei",
             "Noto Sans CJK SC", "Noto Sans SC", "Source Han Sans SC", sans-serif;
  /* Code: JetBrains Mono (OFL; Latin/Cyrillic/Greek). CJK falls back to platform fonts. */
  --font-mono: "JetBrains Mono", ui-monospace, "SF Mono", "Cascadia Mono",
               "PingFang SC", "Microsoft YaHei UI", "Noto Sans Mono CJK SC", monospace;

  --font-features-ui: "liga" 1, "calt" 1, "ss02" 1;  /* disambiguation; repeat liga/calt: f-f-s replaces, it doesn't cascade */
  --font-features-num: "liga" 1, "calt" 1, "tnum" 1, "zero" 1;  /* all counters, timers, diff stats */

  /* scale (px): dense app scale, Inter opsz=auto */
  --text-11: 11px;  /* metadata, keycaps */
  --text-12: 12px;  /* ticker, secondary, table cells */
  --text-13: 13px;  /* BASE UI text */
  --text-14: 14px;  /* reading text in trace/decisions; comfortable density base */
  --text-16: 16px;  /* section titles */
  --text-20: 20px;  /* goal title on goal page (opsz 20+, -0.01em) */
  --text-24: 24px;  /* empty states only */
  --leading-ui: 1.45;
  --leading-read: 1.55;
  --weight-regular: 400; --weight-medium: 500; --weight-strong: 600;
  --tracking-small: 0.01em;   /* below 13px, Inter 4 is tight */
}
:lang(zh), :lang(zh-Hans), :lang(ja) {
  --leading-ui: 1.6; --leading-read: 1.75;   /* CJK convention is 1.7–1.8 for body */
  text-autospace: normal;                     /* 1/8em between Han and Latin/digits; Chromium 140+ */
}
```

- **Rationale for Inter.** It is the face of Linear and Raycast, it has tabular figures and disambiguation sets, and its opsz axis covers display sizes. Geist 1.7 is the credible alternative if we want a more "dev-tool" voice.
- **JetBrains Mono** over Berkeley Mono TX-02: it is free, has broader script coverage, and ships the same metrics everywhere. Offer Berkeley Mono as a user setting ([TX-02](https://usgraphics.com/products/berkeley-mono)).
- **PingFang SC has no real semibold.** It is aliased to bold. So UI emphasis uses **500**, which exists in PingFang, YaHei UI, and Noto, rather than 600, wherever text may be Chinese ([Outline PR](https://github.com/outline/outline/pull/13811)).

### 6.2 Color (OKLCH)

The neutral hue is warm (h≈70) with very low chroma, following Linear 2026. Status hues are fixed and meaningful. Values are a starting point. Validate them with APCA: body text ≥ Lc 75, secondary ≥ Lc 60, and non-text status glyphs ≥ Lc 45 against their surface. Radix's 12-step semantics are a good mental model ([Radix scale](https://www.radix-ui.com/colors/docs/palette-composition/understanding-the-scale)).

```css
:root[data-theme="dark"] {
  /* surfaces: elevation by lightness, not shadow */
  --bg-sidebar:   oklch(0.155 0.004 70);   /* dimmer than content (Linear) */
  --bg-app:       oklch(0.180 0.004 70);
  --bg-raised:    oklch(0.205 0.005 70);   /* cards, panels */
  --bg-hover:     oklch(0.235 0.005 70);
  --bg-selected:  oklch(0.265 0.006 70);
  --bg-overlay:   oklch(0.225 0.005 70 / 0.96);  /* palette, menus; + 1 shadow */

  --border-subtle: oklch(1 0 0 / 0.06);
  --border:        oklch(1 0 0 / 0.10);
  --border-strong: oklch(1 0 0 / 0.16);

  --text-1: oklch(0.945 0.003 70);  /* primary */
  --text-2: oklch(0.760 0.005 70);  /* secondary, labels */
  --text-3: oklch(0.580 0.006 70);  /* ticker, metadata, placeholder */
  --text-4: oklch(0.450 0.006 70);  /* disabled, stale facts */

  --accent:       oklch(0.700 0.110 265);  /* focus ring, selection, links; never status */
  --accent-soft:  oklch(0.700 0.110 265 / 0.16);

  /* status: the only chroma in the app */
  --st-attention:  oklch(0.800 0.150 75);   /* NEEDS YOU (amber) */
  --st-running:    oklch(0.720 0.070 240);  /* deliberately low chroma: running is normal */
  --st-success:    oklch(0.760 0.130 155);  /* verified / accepted */
  --st-danger:     oklch(0.680 0.170 25);   /* failed / blocked-by-error / guard tripped */
  --st-idle:       var(--text-3);           /* queued, draft, paused */
  --st-attention-bg: oklch(0.800 0.150 75 / 0.10);
  --st-danger-bg:    oklch(0.680 0.170 25 / 0.10);

  /* diff */
  --diff-add-bg:   oklch(0.760 0.130 155 / 0.10);
  --diff-add-word: oklch(0.760 0.130 155 / 0.26);
  --diff-del-bg:   oklch(0.680 0.170 25 / 0.10);
  --diff-del-word: oklch(0.680 0.170 25 / 0.26);
  --diff-comment:  var(--st-attention);
}
:root[data-theme="light"] {
  --bg-sidebar:  oklch(0.965 0.004 80);
  --bg-app:      oklch(0.992 0.002 80);
  --bg-raised:   oklch(1 0 0);
  --bg-hover:    oklch(0.955 0.004 80);
  --bg-selected: oklch(0.930 0.006 80);
  --bg-overlay:  oklch(1 0 0 / 0.97);
  --border-subtle: oklch(0.20 0.01 70 / 0.06);
  --border:        oklch(0.20 0.01 70 / 0.11);
  --border-strong: oklch(0.20 0.01 70 / 0.18);
  --text-1: oklch(0.230 0.006 70);
  --text-2: oklch(0.430 0.006 70);
  --text-3: oklch(0.560 0.006 70);
  --text-4: oklch(0.690 0.005 70);
  --accent: oklch(0.540 0.150 265);
  --st-attention: oklch(0.660 0.150 65);
  --st-running:   oklch(0.560 0.080 240);
  --st-success:   oklch(0.580 0.130 155);
  --st-danger:    oklch(0.560 0.190 25);
  /* diff/bg tints as dark, alpha ~0.12 / 0.28 */
}
@media (prefers-contrast: more) { /* step every text token one notch toward the extreme, borders +0.06 alpha */ }
```

- Tailwind 4 is OKLCH-native. Map these as `@theme` variables so utilities (`bg-raised`, `text-2`, `border-subtle`) are the only way to color things. Lint against raw colors.
- Use Display-P3 automatically through OKLCH on wide-gamut screens. Keep status chroma moderate so P3 doesn't make amber shout.

### 6.3 Space, radius, elevation, density

```css
:root {
  --space-0: 0; --space-1: 2px; --space-2: 4px; --space-3: 6px; --space-4: 8px;
  --space-5: 12px; --space-6: 16px; --space-7: 24px; --space-8: 32px; --space-9: 48px;
  --radius-xs: 4px; --radius-sm: 6px; --radius-md: 8px; --radius-lg: 12px;  /* lg only for windows/sheets */
  --row-compact: 28px; --row-default: 32px; --row-comfortable: 36px;        /* list rows */
  --card-goal: 72px;  /* board list mode: title / ticker / progress, 3 lines */
  --hairline: 1px;
  --shadow-overlay: 0 8px 24px oklch(0 0 0 / 0.28), 0 0 0 1px var(--border);  /* only overlays get shadows */
  --focus-ring: 0 0 0 2px var(--bg-app), 0 0 0 4px var(--accent);
}
[data-density="compact"]     { --row-default: var(--row-compact); }
[data-density="comfortable"] { --row-default: var(--row-comfortable); --text-13: 14px; }
```

### 6.4 Motion tokens and rules

```css
:root {
  --dur-0: 0ms;        /* keyboard-initiated, palette, list nav, tab switch */
  --dur-1: 100ms;      /* hover/press feedback (opacity only), glyph cross-fade */
  --dur-2: 160ms;      /* drawers, popovers (user-initiated, occasional) */
  --dur-3: 220ms;      /* full-screen diff enter/exit (spatial) */
  --dur-attn: 700ms;   /* ONE-SHOT attention cue, never loops */
  --ease-out: cubic-bezier(0.2, 0.8, 0.2, 1);
  --ease-inout: cubic-bezier(0.4, 0, 0.2, 1);
  /* no ease-in for UI; animate only opacity/transform (+ background-color for attention tint) */
}
@media (prefers-reduced-motion: reduce) { :root { --dur-2: 0ms; --dur-3: 0ms; --dur-attn: 0ms; } }
```

**The motion contract.** The frequency rule follows Emil Kowalski ([You Don't Need Animations](https://emilkowal.ski/ui/you-dont-need-animations), [skills/STANDARDS](https://github.com/emilkowalski/skills/blob/main/skills/review-animations/STANDARDS.md)), adapted to the thesis "motion steals attention":

| Change | Who caused it | Motion |
|---|---|---|
| Palette open, list navigation, go-to-goal, tab switch | User, keyboard | **None** |
| Drawer / trace / diff open | User | ≤ 160–220 ms transform+opacity, ease-out (spatial explanation) |
| Ticker text update, counters, timers, progress segments | Agent, routine | **None.** Instant swap |
| Status glyph change (running → done/failed) | Agent, state change | 100 ms cross-fade of glyph only |
| **Enters Needs You** (dialog request, guard trip, claimed-done awaiting verification, failure) | Agent, needs human | **One** 700 ms amber tint that decays to a steady 6–10% tint, plus a sidebar count. Never loops, never bounces, never shakes |
| New inbox items while the user is reading | Agent | **No reflow.** A "2 new" chip at the top that the user clicks to merge |
| Goal reordering | Never automatic | Only on explicit sort/drag (FLIP ≤ 200 ms) |
| Spinners | — | **Banned** in steady state. Allowed only for user-initiated waits > 400 ms (e.g., "Verifying…" after the user clicked Verify) |

### 6.5 Iconography and status glyphs

- Use one stroke icon set (Lucide), drawn at 14/16 px, and keep icons rare. Text labels are preferred.
- Status glyphs are 8 px shapes, so they read without color (color-blind safe):

| State | Glyph |
|---|---|
| Running | ◐ half-filled circle |
| Needs You | ◆ diamond, amber |
| Verifying | ◌ dotted ring, static |
| Failed / Blocked | ■ square, red |
| Accepted / Verified | ● filled, green |
| Idle / Draft | ○ ring, gray |
| Stale (no signal > N min) | ring with a gap |

  Stale is a *state change*, not an animation.

### 6.6 Facts versus claims (honesty grammar, from theory §C7)

| Kind | Style |
|---|---|
| **Fact** (harness-derived: exit codes, test counts, diff stats, files touched) | `--text-1`, numerals in mono `tnum`, a provenance chip (`@a1b2c3 · 2m`). Greys to `--text-4` with a "stale" glyph when HEAD moves |
| **Claim** (agent-asserted: plan, cause, "done", ETA) | `--text-2`, a 2 px **dashed** left rule in `--border-strong`, prefixed "Agent says". Never green. A claim can only *link* to facts, not borrow their color |
| **Human decision** | `--text-1` with an avatar or initials and a timestamp. Immutable |

This distinction is the single most important visual rule in the product. Get it into the component library on day one.

---

## 7. Calm UI specifics

### 7.1 "Live but not distracting"

- **One-line ticker per goal.**
  - Mono 12 px, `--text-3`, truncated with a middle ellipsis for paths.
  - Content is the *latest harness action*, phrased as a noun phrase, e.g. `edit src/auth/session.ts +12 −3` or `bash pnpm test · 14s`.
  - Update at most once a second, with an instant swap and no typing effect.
  - Elapsed times are coarse (`2m`, `1h`). Never tick seconds in the periphery. Seconds appear only on hover or in the focused goal.
- **Progress without spinners.**
  - A segmented bar of **contract criteria met / total**: facts only, never agent-reported percent ("Unreliable Progress Bar", theory §C5).
  - Plus `tasks 3/7`, `+120 −30`, `✓12 ✗1`.
  - Liveness is a static ◐ glyph plus "last activity 8s ago" text that only changes tier (`now` / `<1m` / `3m` / `stale`).
- **Peripheral activity hairline (optional).** A 1 px, 40 px-wide sparkline of event density over the last 5 minutes on each card, redrawn every 5 s in `--text-4`. It lets you see "busy versus stuck" without reading. Off by default; test it.
- **Focus versus periphery.**
  - The focused goal page streams at 60 Hz in its live region (the current task line and the trace tail if open).
  - The board and sidebar get ≤ 2–4 Hz summaries.
  - The supervisor enforces this (§4.6), not just the UI.
- **Dark cockpit.** When everything is fine, the board should look almost static and gray. Color and motion appear only where an exception is.

### 7.2 Attention ladder (maps to theory §C8 alarm discipline)

| Level | Trigger | Channel |
|---|---|---|
| 0 Ambient | Routine progress | Ticker text, glyph |
| 1 Peripheral | State change not needing the human (done → verifying, retry) | Glyph cross-fade, sidebar counts |
| 2 In-app interrupt | Needs You (dialog, guard, review ready, failure needing a decision) | One-shot amber tint, inbox item, sidebar badge. `aria-live="polite"` announcement |
| 3 OS | Level 2 *and* (app unfocused *or* item not visible), *and* past the breakpoint/flood rules | `Notification` (one per goal, replaces the previous one for the same goal), dock badge = Needs You count, menubar count |
| 4 Sound | High severity only (e.g., a budget hard-stop or destructive-action prompt with a short timeout) | Off by default |

**Implementation in Electron:**
- Notifications:
  - `new Notification({title, body, silent: true})`, with a click that deep-links to the item.
  - Suppress when `BrowserWindow.isFocused()` and the item is visible.
  - Collapse floods ("3 goals need you") per theory §C8.
- Badges:
  - `app.dock.setBadge(String(n))` (macOS), `app.setBadgeCount(n)` (macOS/Linux Unity), and `win.setOverlayIcon()` (Windows taskbar).
  - **Badge counts only Needs You**, never "running".
- **Menubar extra:**
  - A `Tray` with a template image (monochrome). Its title shows the Needs You count only when > 0.
  - Click opens a small frameless popover window listing the top 5 items with one-key actions (approve, open).
  - This is the true "peripheral display" when the main window is hidden.
- **Breakpoint-aware delivery:** hold Level-3 notifications while the user is mid-typing in a review comment (input focus + keystrokes in the last 10 s), unless severity is high.

### 7.3 Animating state transitions without stealing attention

- Animate the *target of attention* only: one element, once.
- Never animate siblings to "make room". Reserve space up front (fixed card heights, a ticker that is always one line).
- Prefer **opacity and tint** over movement. Peripheral vision is far more sensitive to motion than to color, so movement is the expensive channel.
- Use View Transitions (Chromium same-document) only for user-initiated navigation (board → goal page → diff), at ≤ 220 ms.

---

## 8. Accessibility, i18n (Chinese), theming

**Accessibility**
- Base UI / React Aria primitives provide roles and focus management.
- Every action is reachable from the palette with its shortcut displayed.
- Use a visible `--focus-ring` everywhere. Never remove outlines.
- **Live regions:**
  - The ticker is **not** `aria-live`. It would spam screen readers.
  - Needs You arrivals are `polite`. Failures are `assertive` only when they block the user's current task.
- Terminals: enable xterm's `screenReaderMode` on demand. wterm's DOM rendering is the long-term better answer.
- Respect `prefers-reduced-motion` (all non-essential durations go to 0), `prefers-contrast`, and the OS accent color only for `--accent`, never status.
- Minimum hit target is 24×24 px even in compact density.
- Test with VoiceOver and NVDA on the board, inbox, and diff comment flow.

**Chinese / CJK**
- **IME composition is the #1 bug in chat-like apps.** Every Enter-to-submit handler must ignore `event.isComposing` (and `keyCode === 229`) and submit on `compositionend` + Enter only. Add an e2e test that types 中文 via IME and presses Enter to pick a candidate. It must not send.
- Font stack per §6.1: Latin first, then PingFang SC / Microsoft YaHei UI / Noto Sans CJK SC.
  - Don't ship CJK webfonts: 5–10 MB per weight.
  - Use `:lang(zh)` line-height 1.6–1.75.
  - Use `text-autospace: normal`. It is supported in Chromium 140+, so in Electron 44 it just works ([caniuse](https://caniuse.com/mdn-css_properties_text-autospace)). This removes the need for manual spaces between 中文 and English.
- Curly quotes: optionally force “” ‘’ to the CJK font through a `unicode-range` `@font-face` alias (U+2018–201D) so they aren't Latin-narrow in Chinese text ([Chen Hui Jing](https://chenhuijing.com/blog/font-face-fun-times/)).
- Monospace and CJK:
  - The terminal needs `@xterm/addon-unicode11` for correct wide-character widths.
  - Diff and code views tolerate proportional CJK fallback.
  - Offer **Maple Mono NF CN** or **Sarasa Mono SC** as an optional 2:1-width code font for users who write Chinese comments in code.
- Set `lang` on content we know is Chinese (the user's own messages, goal titles detected by script) so `:lang()` rules apply. Agent output stays `lang` unset unless detected.
- Strings: start with a typed message catalog plus `Intl.*` (dates, relative time, plurals). Adopt **Lingui 6** (compile-time, small) when a second UI language is real. Plan zh-Hans as the second locale from day one: avoid fixed-width labels, since Chinese strings are shorter but need more line-height.

**Theming**
- Ship Light, Dark, and System, plus a High-contrast variant generated from the same OKLCH ramps (lightness steps pushed to the extremes).
- User themes override *only* neutrals and accent. Status hues are locked for semantic safety.
- Optional later: import a Pi TUI theme's accent.

---

## 9. Performance budget and how to hold it

| Metric | Budget | How measured |
|---|---|---|
| Cold start → interactive goal list (M1+ Mac) | **≤ 500 ms** p50, ≤ 800 ms p95 | `process launch` → first paint of board with data from cached projection snapshot (perf marks + `app.getAppMetrics`) |
| Warm start / window reopen | ≤ 200 ms | — |
| Main process `whenReady` | ≤ 150 ms | Electron 44 snapshot + V8 code cache; zero `require` before ready |
| Renderer boot JS (parse+exec) | ≤ 120 ms; boot bundle ≤ 250 KB gz | Diff/terminal/markdown/Shiki excluded from the boot chunk |
| Focused-goal event → paint | **≤ 16 ms p95** (≤ 1 frame) | Supervisor timestamp → rAF commit → `performance.mark` after paint |
| Background goal event → paint | ≤ 500 ms (intentional) | Coalescer cadence |
| Keystroke → paint (palette, nav) | ≤ 8 ms p95 | Event timing API |
| Scroll (trace 100k events, diff 10k lines) | 120 fps on ProMotion; scripting ≤ 4 ms/frame; 0 long tasks > 50 ms | Chromium tracing |
| Diff: open 10k-line, 200-file changeset | File list ≤ 100 ms; first visible rows ≤ 150 ms; highlight lands ≤ 400 ms | Off-thread parse + Shiki worker |
| Memory: idle (no agents) | **≤ 250 MB** total (main + renderer + GPU + supervisor) | macOS `footprint` / `app.getAppMetrics()` |
| Memory: per active goal (agent host, excluding tool subprocesses) | ≤ 60 MB (dedicated host) / ≤ 15 MB (packed) | — |
| Memory: 10 streaming agents | **≤ 600 MB** shell + hosts (packed), ≤ 900 MB dedicated | Soak test |
| Renderer heap after 8 h soak | Growth < 10% | Heap snapshots; xterm/Monaco dispose audits |
| IPC frame size | ≤ 8 KB typical; ≤ 1 frame/16 ms focused | Coalescer stats |
| Installer size | ≤ 120 MB (macOS universal ≤ 200 MB) | Trimmed Shiki grammars, no Monaco in boot |

**Tooling and CI**
- A **synthetic agent** emits Pi-schema events at 100 events/s × 10 goals.
- Playwright-for-Electron drives the board, a goal page, and the diff while recording traces.
- Fail CI on budget regressions.
- Run an 8-hour soak weekly.

---

## 10. Open questions and next experiments

1. **chord spike (2 days).** Does `@earendil-works/chord` replicated state over a utilityProcess `ipcLink` deliver snapshot + delta at our rates with acceptable overhead? If yes, adopt it as the supervisor↔renderer protocol.
2. **Host granularity.** Measure Pi SDK session memory and CPU with 10 sessions in one host versus 10 hosts. Decide the default.
3. **@pierre/diffs on our worst cases.** Test lockfile-heavy and 60k-line generated-file changesets, and compare against tiered fallbacks.
4. **WKWebView sanity check.** Even though we chose Electron, build the board in Safari Technology Preview to keep a Tauri 3/CEF or native-shell option honest. Avoid Chromium-only CSS in core components unless it is behind `@supports`.
5. **Calm-UI A/B tests.** Hairline sparkline on or off. Ticker at 1 Hz versus on-change. Measure missed Needs You items and time-to-notice, per theory §C8 metrics.
6. **Solid 2.0 final.** If it ships before we have > 20k lines of UI, re-run the framework decision on our real board (not js-framework-benchmark).

---

## Sources

**Pi**
- https://github.com/earendil-works/pi: README, `packages/coding-agent/docs/{rpc,sdk,json,rpc-extension-ui}.md`, `packages/chord/README.md`
- web-ui removal commit, "chore: remove web-ui workspace" (2026-05-20), via GitHub API

**Shells**
- Electron 44: https://www.electronjs.org/blog/electron-44-0
- Startup PRs: https://github.com/electron/electron/pull/51792 and https://github.com/electron/electron/pull/53134
- MessagePorts: https://www.electronjs.org/docs/latest/tutorial/message-ports
- electron-bench: https://github.com/ZacWalk/electron-bench
- V8 snapshots: https://github.com/RaisinTen/electron-snapshot-experiment
- Tauri 2.12: https://v2.tauri.app/blog/tauri-2.12/
- Tauri CEF: https://v3.tauri.app/develop/cef/ and https://crates.io/crates/tauri-runtime-cef/versions
- Tauri Node sidecar: https://github.com/tauri-apps/tauri-docs/blob/v2/src/content/docs/learn/sidecar-nodejs.mdx
- Tauri IPC:
  - https://github.com/CodeAny-inc/Clavyn/issues/48
  - https://github.com/userFRM/tauri-conduit/blob/master/BENCHMARKS.md
  - https://github.com/orgs/tauri-apps/discussions/11915
- WKWebView fps:
  - https://github.com/userFRM/tauri-plugin-macos-fps
  - https://github.com/daimiaopeng/coolapk-desktop/issues/53
  - https://github.com/tauri-apps/tauri/discussions/8436
  - https://github.com/tauri-apps/wry/issues/1848
- Multiwebview: https://github.com/tauri-apps/tauri/pull/8280
- Benchmarks:
  - https://betterstack.com/community/guides/scaling-nodejs/tauri-vs-electron-vs-deno-vs-electrobun/
  - https://tech-insider.org/tauri-vs-electron-2026/
  - https://www.gethopp.app/blog/tauri-vs-electron
- Electrobun:
  - https://blackboard.sh/blog/electrobun-v1/
  - https://blackboard.sh/blog/electrobun-2-0/
  - https://www.rickvanlieshout.com/posts/2026/wanted-electrobun-shipping-chose-electron/
- Bun 1.4: https://alternativeto.net/news/2026/8/bun-1-4-lands-rust-rewrite-and-zero-external-dependencies-mark-major-milestone-for-devs/
- OpenCode → Electron: https://dev.to/brendonovich/moving-opencode-desktop-to-electron-4hip
- Raycast 2.0: https://www.raycast.com/blog/a-technical-deep-dive-into-the-new-raycast
- GPUI:
  - https://dev.to/dishant0406/gpui-by-zed-the-electron-killer-that-never-left-home-209o
  - https://lib.rs/crates/gpui-component
- Codex app:
  - https://www.kitze.io/posts/codex-electron-app-technical-breakdown
  - https://github.com/openai/codex/issues/11023
  - https://simonwillison.net/2026/Feb/2/introducing-the-codex-app/
- T3 Code: https://github.com/pingdotgg/t3code
- Liquid Glass in Electron:
  - https://github.com/electron/electron/pull/50415
  - https://github.com/Meridius-Labs/electron-liquid-glass

**Frameworks**
- https://github.com/Srinath10X/qwrk/issues/27
- https://github.com/nextwebwg/html-next/pull/173
- Solid 2.0 RC: https://github.com/solidjs/solid/discussions/2995

**Components**
- TanStack Virtual:
  - https://tanstack.com/blog/tanstack-virtual-perf-and-ios
  - https://tanstack.com/virtual/latest/docs/chat
- virtua: https://github.com/inokawa/virtua
- virtuallist.io: https://virtuallist.io/
- @pierre/diffs:
  - https://diffs.com/
  - https://github.com/pierrecomputer/pierre/tree/main/packages/diffs
  - https://github.com/stablyai/orca/pull/19008
  - https://github.com/NextNodeSolutions/syneva/pull/7
  - https://github.com/tomasz-tomczyk/crit/pull/988
- CodeMirror merge:
  - https://discuss.codemirror.net/t/codemirror-merge-slow-diff/7005
  - https://github.com/codemirror/merge/blob/main/CHANGELOG.md
- Monaco: https://github.com/microsoft/monaco-editor/issues/4834
- Replit on CodeMirror: https://blog.replit.com/codemirror
- Shiki and highlighting:
  - https://github.com/speed-highlight/core
  - https://github.com/charliebeckstrand/midgard/pull/1916
  - https://github.com/zhowzeng/ziff/pull/62
- xterm.js 6:
  - https://github.com/xtermjs/xterm.js/releases
  - https://github.com/notaharness/n10/pull/324
  - https://github.com/CodeAny-inc/Clavyn/issues/62
  - https://github.com/hay-kot/hive-desktop/issues/337
- ghostty-web: https://github.com/coder/ghostty-web
- wterm: https://github.com/vercel-labs/wterm
- streamdown:
  - https://github.com/vercel/streamdown
  - https://vercel.com/changelog/streamdown-1-6-is-now-available-to-run-faster-and-ship-less-code

**Design**
- Linear:
  - https://linear.app/now/behind-the-latest-design-refresh
  - https://linear.app/changelog/2026-03-12-ui-refresh
  - https://linear.app/now/how-we-redesigned-the-linear-ui
- Raycast: https://oh-my-design.kr/design-systems/raycast
- Zed:
  - https://github.com/zed-industries/zed/pull/36084
  - https://github.com/zed-industries/zed/issues/18078
  - https://zed.dev/blog/theme-builder
- Things 3: https://www.macstories.net/reviews/things-3-beauty-and-delight-in-a-task-manager/
- Geist: https://vercel.com/geist/colors
- Radix: https://www.radix-ui.com/colors/docs/palette-composition/understanding-the-scale
- Inter:
  - https://rsms.me/inter/
  - https://github.com/rsms/inter/releases/tag/v4.0
- Berkeley Mono: https://usgraphics.com/products/berkeley-mono
- Claude Code desktop: https://www.macrumors.com/2026/04/15/anthropic-rebuilds-claude-code-desktop-app/
- Cursor:
  - https://cursor.com/docs/agent/agents-window
  - https://forum.cursor.com/t/group-diffs-by-agent-in-source-control-panel/149215
- Codex app:
  - https://openai.com/index/introducing-the-codex-app/
  - https://www.verdent.ai/guides/codex-app-first-impressions-2026
- Conductor: https://continuumcode.ai/guides/what-is-conductor/
- Motion:
  - https://emilkowal.ski/ui/you-dont-need-animations
  - https://github.com/emilkowalski/skills/blob/main/skills/review-animations/STANDARDS.md
- Calm tech:
  - https://caseorganic.com/post/principles-of-calm-technology/
  - https://en.wikipedia.org/wiki/Calm_technology
- CJK:
  - https://github.com/outline/outline/pull/13811
  - https://caniuse.com/mdn-css_properties_text-autospace
  - https://chenhuijing.com/blog/font-face-fun-times/
  - https://penchan.co/en/ai/coding/cjk-font-performance/
