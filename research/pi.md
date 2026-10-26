# Pi as the engine for a Goal-centric agent GUI: research report

Date: 2026-10-15. Source studied: `/Volumes/Remi/Project/research/pi-mono`.

All file references are relative to that checkout unless noted. `CA/` = `packages/coding-agent/`, `AG/` = `packages/agent/`, `AI/` = `packages/ai/`, `DU/` = `packages/durable/`.

---

## 0. Snapshot and provenance

| Item | Value |
|---|---|
| Canonical repo | **github.com/earendil-works/pi**. `badlogic/pi-mono` now redirects there (`gh api repos/badlogic/pi-mono` returns `earendil-works/pi`). The clone's `origin` was re-pointed to the new URL. |
| HEAD commit | `b06c1f2cf1dea6af8748ddeee18c23587d2cb7c6`, 2026-10-14 22:23:59 +0200, "feat(ai): use Chat Completions for the kimi-coding..." |
| Latest release tag | `v1.2.0` (commit `06a4669`, 2026-10-13). GitHub release published 2026-10-12T23:03Z. Earlier: v1.1.0 (10-07), v1.0.4 (10-05). Pi 1.0 shipped 2026-10-01. |
| npm package | **`@earendil-works/pi-coding-agent@1.2.0`** (`latest`). There is also a `legacy-node20` dist-tag at 0.74.2. |
| Old package | `@mariozechner/pi-coding-agent@0.73.1`, deprecated: "please use @earendil-works/pi-coding-agent instead going forward". |
| Ownership | Earendil (Armin Ronacher's company) acquired Pi on 2026-04-08. Mario Zechner still leads technical direction. The core is MIT. |
| Runtime | Node >= 22.19, or a standalone Bun-compiled binary. Website and docs: pi.dev. |

**Important drift from what the brief assumed.**
- **`pi-web-ui`, `mom` and `pods` no longer exist in the repo.**
  - `web-ui` was removed in commit b141e1f (2026-05-20). Its last npm release is `@earendil-works/pi-web-ui@0.75.3`.
  - `mom` and `pods` were removed in commit 0ed0d43 (2026-04-30). Chat automation moved to `earendil-works/pi-chat`.
- **MCP is now built in.** Version 0.99.0 / 1.0 reversed the "no MCP" stance; MCP loads as a default built-in extension.
- **There is a new experimental package, `pi-durable`.** It is a multi-conversation, task-graph runtime that matters a lot for this GUI (§11).

---

## 1. Monorepo layout (current)

`packages/*` (all at version 1.2.0):

| Package (npm) | Dir | What it is | Used by coding-agent? |
|---|---|---|---|
| `@earendil-works/pi-ai` | `packages/ai` | Unified LLM API. 42 providers (`AI/src/providers/*.models.ts`), streaming, tool calling with TypeBox, thinking levels, cross-provider handoff, token/cost accounting (`Usage`), OAuth (Claude, Codex, Copilot), a model catalog overlaid from pi.dev, plus image and classifier models. | yes |
| `@earendil-works/pi-agent-core` | `packages/agent` | The stateful `Agent` class and the low-level `agentLoop`. Handles tool execution (parallel or sequential), steering and follow-up queues, and lifecycle hooks. About 2.5k LOC. | yes |
| `@earendil-works/pi-coding-agent` | `packages/coding-agent` | The `pi` CLI: `AgentSession`, sessions, compaction, extensions, skills, prompt templates, themes, packages, and four modes (TUI, print, JSON, RPC). Also the SDK. | n/a |
| `@earendil-works/pi-tui` | `packages/tui` | Terminal UI library with differential rendering. TUI-only. | yes |
| `@earendil-works/pi-codemode` | `packages/codemode` | QuickJS-WASM sandbox where model-written JS can only call injected tools. Backs the `codemode` tool. | yes |
| `@earendil-works/pi-mcp` | `packages/mcp` | Standalone MCP client (stdio and Streamable HTTP, OAuth). | yes (built-in extension) |
| `@earendil-works/pi-durable` | `packages/durable` | **Experimental** durable runtime. It provides conversations, tasks (checkpointed state machines), documents (typed JSON), a task graph, multi-client `watch()`, and SQLite/JSONL/memory/Cloudflare DO storage. Not used by the CLI. | **no** |
| `@earendil-works/chord` | `packages/chord` | Typed host runtime: references, replicated JSON state (snapshot + ops), hot-reloadable plugins, and RPC over JSON links (memory, IPC, WebSocket). Used by durable and env. CA `CHANGELOG.md:81` (1.2.0): "Removed the dependency on `@earendil-works/chord`". | no |
| `@earendil-works/pi-env` | `packages/env` | Remote execution environments for Durable: a Rust daemon deployed over SSH plus an `ExecutionEnv` client. | no |
| `@earendil-works/pi-telemetry` | `packages/telemetry` | Telemetry contracts and typed schemas, with no exporter. | via pi-ai |
| `@earendil-works/pi-evals` | `packages/evals` | Private behavioural evals. | dev only |

Also relevant: `CA/CHANGELOG.md:80` records that **an experimental Pi server, client and protocol stack (`pi-server`, `pi-client`, `pi-protocol`, the `./client` export) was built and then removed before release.** There is no daemon or server mode today. Headless control is stdio RPC or the in-process SDK.

---

## 2. Design philosophy (author statements, with sources)

### 2.1 Original manifesto
Source: Mario Zechner, "What I learned building an opinionated and minimal coding agent", 2025-11-30 — https://mariozechner.at/posts/2025-11-30-pi-coding-agent/

- **Context engineering first.** "I want to inspect every aspect of my interactions with the model." His complaint about other tools is that they inject context behind your back that the UI never shows.
- **Minimal system prompt.** Under about 1000 tokens. The original preamble: "You are an expert coding assistant. You help users with coding tasks by reading files, executing commands, editing code, and writing new files."
- **Minimal toolset.** "These four tools are all you need for an effective coding agent." The four are read, bash, edit and write. His reasoning is that frontier models are already "RL-trained up the wazoo" on what a coding agent is.
- **YOLO by default.** "pi runs in full YOLO mode and assumes you know what you're doing. It has unrestricted access to your filesystem and can execute any command without permission checks or safety rails."
- **No built-in to-dos.** "pi does not and will not support built-in to-dos. In my experience, to-do lists generally confuse models more than they help."
- **No plan mode.** "pi does not and will not have a built-in plan mode."
- **No MCP** (since reversed). "pi does not and will not support MCP."
- **No background bash.** "pi's bash tool runs commands synchronously."
- **No sub-agents.** "pi does not have a dedicated sub-agent tool."
- **Built for alternative UIs.**
  - "Headless operation via JSON streaming and RPC mode."
  - "A simple way to build alternative UIs on top of the agent core."
  - "Tools can return both content blocks for the LLM and separate content blocks for UI rendering."

### 2.2 Current README
`README.md`:
- "Pi is a minimal, extensible agent harness that you can make your own. Adapt Pi to your workflows, not the other way around."
- "Pi ships with powerful defaults but skips features like sub-agents and plan mode. Ask Pi to build what you want, or install a package that does it your way."
- "Pi does not include a built-in permission system for restricting filesystem, process, network, or credential access." The recommended answer is containerization: Gondolin micro-VM, Docker, or OpenShell (`CA/docs/containerization.md`).

### 2.3 Pi 1.0 (2026-10-01)
Source: https://earendil.com/posts/pi-1-0/

- "Pi is known for being minimal. We care about holding that line."
- On adopting features late: "While agentic tooling changes every week, many of the changes do not last... We wait until something has proven itself."
- MCP arrived through **codemode**: MCP tools are, by default, not declared to the model directly. The model calls them from a sandboxed JS interpreter, or loads them on demand with `tool_search`. The Register (2026-10-02) quotes Earendil: "Ultimately what Pi needs is quite similar to what MCP needs: a sandbox to play with in the form of an interpreter."
- On why Durable exists: "There were aspects of Pi that did not fit the shape of how many people wanted to use it... Pi needs to be reachable from different surfaces and support longer-running conversations and tasks." Durable shares Pi's principles, "minimalism and supermalleability".

### 2.4 Pi Durable
Source: https://earendil.com/posts/pi-durable/

- "A harness is storage plus the machinery needed to run one or more conversations with large language models in parallel."
- "It does not replace the Pi coding agent. It is a framework for building any agentic application, coding agents included... Lessons we learn building agentic applications on Pi Durable will flow back into Pi the coding agent."
- "Any number of clients can attach to any conversation in the harness."

### 2.5 Repo docs
`CA/docs/how-pi-works.md` states: "All interfaces use the same agent and session mechanisms." Interactive, print, JSON, RPC and SDK all wrap the same `AgentSession`.

---

## 3. Agent loop architecture

### 3.1 Layers
```
pi-ai  streamSimple(model, context, opts) -> AssistantMessageEventStream
  └─ pi-agent-core  agentLoop()/runLoop()  + class Agent (state, queues, hooks)
       └─ coding-agent  AgentSession (persistence, extensions, compaction, retry, tools, prompt)
            └─ AgentSessionRuntime (replace session: new/switch/fork/import)
                 └─ modes: InteractiveMode | runPrintMode (text/json) | runRpcMode | SDK host
```

### 3.2 Core loop (`AG/src/agent-loop.ts`)
- Entry points: `agentLoop` (L38), `agentLoopContinue` (L71), `runAgentLoop` (L102), `runAgentLoopContinue` (L128). The shared body is `runLoop` (**L163-321**).
- The outer `while(true)` handles follow-ups. The inner loop runs `while (hasMoreToolCalls || pendingMessages.length > 0)`.
- **Steering is polled at three points:**
  1. at run start (L176),
  2. after `prepareNextTurn`, which can be long-running (for example compaction) (L205),
  3. after every turn (L295).
- **Follow-ups are polled** only when the agent would otherwise stop (L302-308).
- Each turn runs these steps:
  1. `prepareNextTurn`
  2. `declareToolChanges` (L333): announces tool loadout diffs to the model as a system message
  3. emit queued messages
  4. `prepareRequest`
  5. `streamAssistantResponse` (L381)
  6. `executeToolCalls` (L508); parallel at L586, sequential at L530
  7. `finishTurn`
  8. `turn_end`
- A `stopReason` of `"error"` or `"aborted"` ends the run immediately (L245-256). A `"length"` stop fails every tool call in that message, because truncated arguments are unsafe (L264-270).
- Tool execution: by default calls are preflighted sequentially and executed in parallel. The persisted toolResult order follows the assistant's source order. If any tool in the batch has `executionMode: "sequential"`, the whole batch runs sequentially.
- `beforeToolCall` can block a call. `afterToolCall` can rewrite the result. `terminate: true` on **all** results in a batch skips the follow-up LLM call (`shouldTerminateToolBatch`, L690).

### 3.3 `Agent` class (`AG/src/agent.ts`)
- `PendingMessageQueue` (L143-174) supports mode `"one-at-a-time" | "all"`.
- Methods:
  - `subscribe(listener)` (L266). Listeners are **awaited** in order.
  - `steer(msg)` (L299), `followUp(msg)` (L304), `clearSteeringQueue`, `clearFollowUpQueue`, `clearAllQueues`, `peekQueuedMessages`.
  - `abort()` (L341): aborts the run's `AbortController`. `waitForIdle()` (L350). `reset()` (L355).
  - `prompt(...)` (L371-383) and `continue()` (L384).
- Hooks are public fields: `beforeToolCall`, `afterToolCall`, `finishTurn`, `prepareRequest`, `prepareNextTurn`, `transformContext`, `convertToLlm`, `getApiKey`, `onPayload`, `onResponse`, `onProviderStreamEvent` (L194-217).
- The transcript owns the system prompt. System messages carry `sections`, `toolsAdded` and `toolsRemoved`, and `agent.state.systemPrompt` is a read-only replay of them (`AG/README.md`, "Agent State").

Core event and tool types (`AG/src/types.ts:516-539`, `424-499`):
```ts
export type AgentEvent =
  | { type: "agent_start" }
  | { type: "agent_end"; messages: AgentMessage[] }
  | { type: "turn_start" }
  | { type: "turn_end"; message: AgentMessage; toolResults: ToolResultMessage[] }
  | { type: "message_start"; message: AgentMessage }
  | { type: "message_update"; message: AgentMessage; assistantMessageEvent: AssistantMessageEvent }
  | { type: "message_end"; message: AgentMessage }
  | { type: "tool_execution_start"; toolCallId: string; toolName: string; args: any }
  | { type: "tool_execution_update"; toolCallId: string; toolName: string; args: any; partialResult: any }
  | { type: "tool_execution_end"; toolCallId: string; toolName: string; result: any; isError: boolean; durationMs?: number };

export interface AgentToolResult<T = JsonValue | undefined> {
  content: (TextContent | ImageContent)[];   // what the model sees
  details: T;                                 // structured data for UI / state reconstruction
  structuredContent?: JsonValue;              // matches outputSchema, for programmatic callers
  usage?: Usage;
  isError?: boolean;
  terminate?: boolean;
}

export interface AgentTool<TParameters extends TSchema = TSchema, TDetails = any> extends Tool<TParameters> {
  label: string;
  prepareArguments?: (args: unknown) => Static<TParameters>;
  outputSchema?: TSchema;
  execute: (toolCallId: string, params: Static<TParameters>, signal?: AbortSignal,
            onUpdate?: AgentToolUpdateCallback<TDetails>) => Promise<AgentToolResult<TDetails>>;
  replay?: "never" | "safe";
  executionMode?: ToolExecutionMode;
}
```
`CustomAgentMessages` (L365) supports declaration merging, so apps can add their own message roles. The coding-agent adds `bashExecution`, `custom`, `branchSummary` and `compactionSummary`; `convertToLlm` maps them.

### 3.4 `AgentSession` (`CA/src/core/agent-session.ts`, 4428 lines)
This class wraps `Agent` with persistence (every message becomes a `SessionManager` entry), extensions, auto-compaction, auto-retry, the bash `!` command, model and thinking management, and prompt-template and skill expansion.

`AgentSessionEvent` (L196-237) is the stream every mode sees:
```ts
export type AgentSessionEvent =
  | WithParentToolCallId<Exclude<AgentEvent, { type: "agent_end" }>>   // tool_execution_* may carry parentToolCallId (nested calls from codemode)
  | { type: "agent_end"; messages: AgentMessage[]; willRetry: boolean }
  | { type: "agent_settled"; aborted: boolean }                         // the real "done" signal
  | { type: "queue_update"; steering: readonly string[]; followUp: readonly string[] }
  | { type: "compaction_start"; reason: "manual" | "threshold" | "overflow" }
  | { type: "entry_appended"; entry: SessionEntry }                     // custom entries, context edits, etc.
  | { type: "session_info_changed"; name: string | undefined }
  | { type: "thinking_level_changed"; level: ThinkingLevel }
  | { type: "compaction_end"; reason; result: CompactionResult | undefined; aborted: boolean; willRetry: boolean; errorMessage?: string }
  | { type: "auto_retry_start"; attempt; maxAttempts; delayMs; errorMessage }
  | { type: "auto_retry_end"; success: boolean; attempt: number; finalError?: string }
  | { type: "summarization_retry_scheduled"; ... } | { type: "summarization_retry_attempt_start"; ... } | { type: "summarization_retry_finished" }
  | { type: "bash_execution_update"; id?: string; delta: string };
```

Key methods:
- **Prompting and queues:**
  - `prompt(text, {images, streamingBehavior: "steer"|"followUp", source, expandPromptTemplates})` (L2058). It **rejects** a prompt sent while streaming unless `streamingBehavior` is set.
  - `steer` / `followUp` return the disposition `"queued" | "handled"`.
  - `clearQueue()` (L2432), `abort()` (L2464; aborts retry, compaction, branch summary and the agent, then waits for idle), `waitForIdle()`.
- **Model and thinking:** `setModel(model, {persist})` (L2507), `setThinkingLevel` (L2642), and cycling.
- **Compaction:** `compact(customInstructions)` (L2794), `setAutoCompactionEnabled`.
- **Session tree and data:** `navigateTree(targetId, {summarize, customInstructions, label})` (L3994), `getSessionStats()` (L4213), `getContextUsage()` (L4267), `exportToHtml`, `exportToJsonl`, `getLastAssistantText`.
- **Extensions and tools:** `bindExtensions(bindings)` (L3288), `reload()` (L3690), `setActiveToolsByName`, `getAllTools`.

`SessionStats` (L343-360):
```ts
{ sessionFile; sessionId; userMessages; assistantMessages; toolCalls; toolResults; totalMessages;
  tokens: { input; output; cacheRead; cacheWrite; total }; cost: number; contextUsage?: ContextUsage }
```

### 3.5 `AgentSessionRuntime` (`CA/src/core/agent-session-runtime.ts`)
- Methods: `switchSession(path)` (L196), `newSession({parentSession, setup, withSession})` (L226), `fork(entryId, {position: "before"|"at"})` (L262), `importFromJsonl` (L359), `dispose`.
- **Each of these tears down and rebuilds the whole `AgentSession` and its extension runtime.** The host must re-subscribe afterwards (`examples/sdk/13-session-runtime.ts`).

---

## 4. Built-in tools (`CA/src/core/tools/`)

- `ToolName = "read" | "bash" | "powershell" | "edit" | "write" | "grep" | "find" | "ls"` (`index.ts:95`).
- **Default active set: read, bash, edit, write** (`createCodingTools`, L195). `createReadOnlyTools` gives read, grep, find and ls.

| Tool | Params (TypeBox) | Behaviour / `details` |
|---|---|---|
| `read` (`read.ts`) | `path`, `offset?`, `limit?` | Text output is truncated to `DEFAULT_MAX_LINES` / `DEFAULT_MAX_BYTES`. Images (jpg/png/gif/webp/bmp) are sent as attachments. |
| `bash` (`bash.ts`) | `command`, `timeout?` (seconds, no default) | Synchronous. Streams via `onUpdate`. The tail is truncated and the full output is saved to a temp file. `details: {truncation?, fullOutputPath?}`. Output schema: `{output, truncated, full_output_path?, exit_code, wall_time_seconds}`. |
| `edit` (`edit.ts`) | `path`, `edits: [{oldText, newText}]` | `details: EditToolDetails = { diff: string; patch: string /* unified */; firstChangedLine?: number }` (L70-77). |
| `write` (`write.ts`) | `path`, `content` | **`details: undefined`.** No diff is produced, so the GUI must compute it (for example with git). |
| `grep` | `pattern`, `path?`, `glob?`, `ignoreCase?`, `literal?`, `context?`, `limit?` (100) | Respects .gitignore. |
| `find` | `pattern` (glob), `path?`, `limit?` (1000) | |
| `ls` | `path?`, `limit?` (500) | |
| `powershell` | | Windows. |

Extension-provided tools that are registered but inactive by default: `codemode` (sandboxed JS) and `tool_search`. MCP tools are named `mcp__<server>__<tool>`.

- **Pluggable operations.** `EditOperations`, `WriteOperations` and `BashOperations` (e.g. `bash.ts:75-94`) let a host redirect file and process effects to SSH, a container or a VM. The Gondolin and `ssh.ts` examples use this.
- **Mutation queue.** `withFileMutationQueue(path, fn)` serialises writes to the same file across parallel tool calls.

### System prompt
- `CA/src/core/system-prompt.ts`. Default preamble: "You are an expert coding assistant operating inside pi, a coding agent harness. You help users by reading files, executing commands, editing code, and writing new files."
- The prompt is built from named sections: preamble, tools, rules, docs, addendum, project_context, skills, cwd, then extension sections. Changes are stored in the transcript as section patches.
- `SYSTEM.md` replaces the base prompt and `APPEND_SYSTEM.md` appends to it, each from either `.pi/` or `~/.pi/agent/`.

---

## 5. Modes and the RPC protocol (critical for the GUI)

### 5.1 Mode selection (`CA/src/main.ts:113-127`)
- `--mode rpc` selects RPC. `--mode json` selects JSON.
- `-p/--print`, or a non-TTY stdin/stdout, selects print.
- Otherwise interactive. The TUI is fullscreen by default (`settings-defaults.ts:62`, `tuiMode: "fullscreen"`).
- `CA/src/rpc-entry.ts` is exported as the `@earendil-works/pi-coding-agent/rpc-entry` subpath.

CLI flags a host will use (`CA/src/cli/args.ts`):
- **Session:** `--session <path|id>`, `--session-id <id>` (created if missing), `--session-dir`, `--no-session`, `--continue`, `--fork`, `--name`.
- **Model:** `--provider`, `--model provider/id:thinking`, `--thinking`.
- **Tools:** `--tools` (allowlist or `+x`/`-x` modifiers), `--exclude-tools`, `--no-tools`.
- **Resources:** `-e/--extension <path>` (repeatable), `--no-extensions`, `--no-mcp`, `--skill`, `--no-context-files`.
- **Prompt:** `--system-prompt`, `--append-system-prompt`.
- **Trust and network:** `--approve` / `--no-approve` (project trust), `--offline`.
- Unknown `--flags` are passed through to extensions (`registerFlag`).

### 5.2 Print and JSON modes (`CA/src/modes/print-mode.ts`, `json-event.ts`)
- Text mode prints the final assistant text.
- JSON mode writes a header `{"type":"session","version":3,"id","timestamp","cwd"}`, then every `AgentSessionEvent` as JSONL.
- No UI context is bound, so `ctx.hasUI === false`, and extension dialogs cannot reach a user.
- The `subagent` example extension drives child `pi --mode json -p --no-session` processes this way.

### 5.3 RPC framing (`CA/src/modes/rpc/`)
- **Strict LF-delimited JSONL** (`jsonl.ts`). It deliberately avoids Node `readline`, which also splits on U+2028/U+2029.
- **Stdout is protocol-only.** Diagnostics go to stderr.
- **Four record families on stdout:**
  1. `{type:"response", command, success, id?, data? | error?}`
  2. session events (the `AgentSessionEvent` union above)
  3. `{type:"extension_ui_request", id, method, ...}`
  4. `{type:"extension_error", extensionPath, event, error}`
- **Correlation:** every command takes an optional `id`, which the response echoes. Commands are handled concurrently (`rpc-mode.ts:808-810`), so responses can arrive out of order.
- **`prompt` response semantics.** The response is emitted once the prompt is accepted, with `data.disposition ∈ "started" | "queued" | "handled"`. Errors after acceptance appear only in the event stream. `agent_settled` is the true completion signal. A `"handled"` disposition produces no run and no `agent_settled`.
- **Backpressure.** The agent awaits stdout drain (`rpc-mode.ts:361`), so a host that stops reading stalls the agent.
- **Lifecycle.** Stdin EOF shuts down with exit 0. SIGTERM exits 143.
- **Wire transform** (`json-event.ts:17-61`, type `JsonAgentSessionEvent`). `message_update` is sent as `{type, usage, assistantMessageEvent}` with no cumulative message and no `partial`. `toolcall_start` gains `id` and `toolName`.
  - `assistantMessageEvent` kinds: `text_start|text_delta|text_end`, `thinking_*`, `toolcall_start|toolcall_delta|toolcall_end`, `done`, `error`. Each carries a `contentIndex`.
  - Rebuild text from the deltas, then replace it with `message_end.message`, which is authoritative.

### 5.4 RPC command set (`CA/src/modes/rpc/rpc-types.ts:20-74`; handlers `rpc-mode.ts:386-718`)

| `type` | Params | Response `data` |
|---|---|---|
| `prompt` | `message`, `images?`, `streamingBehavior?: "steer"\|"followUp"` (required while streaming) | `{disposition}` |
| `steer` / `follow_up` | `message`, `images?` | `{disposition: "queued"\|"handled"}` |
| `abort` | – | (after idle) |
| `clear_queue` | – | `{steering: string[], followUp: string[]}` |
| `new_session` | `parentSession?` | `{cancelled}` |
| `switch_session` | `sessionPath` | `{cancelled}` |
| `fork` | `entryId` (a user message) | `{text, cancelled}` |
| `clone` | – | `{cancelled}` |
| `get_fork_messages` | – | `{messages: {entryId, text}[]}` |
| `get_entries` | `since?` (entry-id cursor) | `{entries: SessionEntry[], leafId}`: all branches, append order |
| `get_tree` | – | `{tree: SessionTreeNode[], leafId}` |
| `get_messages` | – | `{messages: AgentMessage[]}`: active context |
| `get_state` | – | `RpcSessionState` |
| `get_session_stats` | – | `SessionStats` |
| `get_last_assistant_text` | – | `{text}` |
| `set_session_name` | `name` | – |
| `set_model` | `provider`, `modelId` | `Model` (session-only) |
| `cycle_model` / `get_available_models` | – | `{model, thinkingLevel, isScoped}` / `{models}` |
| `set_thinking_level` / `cycle_thinking_level` / `get_available_thinking_levels` | `level` | – / `{level}` / `{levels}` |
| `set_steering_mode` / `set_follow_up_mode` | `mode: "all"\|"one-at-a-time"` | – (**writes global settings.json**) |
| `compact` | `customInstructions?` | `CompactionResult` |
| `set_auto_compaction` / `set_auto_retry` / `abort_retry` | `enabled` | – (the first two **write global settings**) |
| `bash` / `abort_bash` | `command`, `excludeFromContext?` | `BashResult {output, exitCode, cancelled, truncated, fullOutputPath?}` |
| `export_html` | `outputPath?` | `{path}` |
| `get_commands` | – | `{commands: RpcSlashCommand[]}`: extension commands, prompt templates, skills |

```ts
export interface RpcSessionState {   // rpc-types.ts:96-109
  model?: Model<any>; thinkingLevel: ThinkingLevel; isStreaming: boolean; isCompacting: boolean;
  steeringMode: "all" | "one-at-a-time"; followUpMode: "all" | "one-at-a-time";
  sessionFile?: string; sessionId: string; sessionName?: string;
  autoCompactionEnabled: boolean; messageCount: number; pendingMessageCount: number;
}
```

**Not available over RPC:**
- tree navigation (`navigateTree`) and labels; extensions can reach these through command context
- session listing (scan the session directory, or use the SDK's `SessionManager.list` / `listAll`)
- session deletion and reload
- TUI built-ins (`/settings`, `/login`, `/tree`, ...)

**No event announces a session switch or a model change**, so the host must re-query `get_state` / `get_entries`.

### 5.5 Extension UI sub-protocol (`rpc-types.ts:252-297`, `rpc-mode.ts:91-311`, `CA/docs/rpc-extension-ui.md`)
Requests (stdout):
```ts
| {type:"extension_ui_request"; id; method:"select";  title; options: string[]; timeout?}
| {type:"extension_ui_request"; id; method:"confirm"; title; message; timeout?}
| {type:"extension_ui_request"; id; method:"input";   title; placeholder?; timeout?}
| {type:"extension_ui_request"; id; method:"editor";  title; prefill?}
| {type:"extension_ui_request"; id; method:"notify";  message; notifyType?: "info"|"warning"|"error"}
| {type:"extension_ui_request"; id; method:"setStatus"; statusKey; statusText: string|undefined}
| {type:"extension_ui_request"; id; method:"setWidget"; widgetKey; widgetLines: string[]|undefined; widgetPlacement?: "aboveEditor"|"belowEditor"}
| {type:"extension_ui_request"; id; method:"setTitle"; title}
| {type:"extension_ui_request"; id; method:"set_editor_text"; text}
```

Responses (stdin), for select, confirm, input and editor only:
```ts
{type:"extension_ui_response"; id; value: string} | {type:"extension_ui_response"; id; confirmed: boolean} | {type:"extension_ui_response"; id; cancelled: true}
```

Behaviour notes:
- Timeouts are enforced on the Pi side, and late replies are dropped. `editor` has no timeout.
- **Degraded or unavailable in RPC:**
  - `ctx.ui.custom()` returns `undefined`.
  - `setWidget` with a component factory is dropped.
  - Footer, header, working indicator, autocomplete and editor components are no-ops.
  - `getEditorText()` returns `""`.
  - `setTheme` fails.
- The `question.ts` and `questionnaire.ts` examples refuse to run outside the TUI because they use `custom()`.

### 5.6 `RpcClient` (TS, `CA/src/modes/rpc/rpc-client.ts`, exported from the package root)
- It has methods mirroring every command, plus `onEvent`, `waitForIdle` (which waits for `agent_settled`), `promptAndWait` and `collectEvents`.
- **It is not production-grade for a GUI:**
  - It has no method to answer `extension_ui_request`, and `send` is private.
  - Every request has a fixed 30 s timeout.
  - It always spawns `node <cliPath>`, so it cannot drive the Bun binary.
  - Startup is a 100 ms sleep with no handshake.
  - Return types are narrower than the data.
- **Recommendation:** write our own client against `rpc-types.ts` and `json-event.ts`. There are **no JSON Schemas** for the RPC protocol; `CA/schemas/` contains only the settings, models, keybindings and theme schemas.

### 5.7 OSC 7501 program status
`CA/docs/terminal-setup.md:221-233` (added in 1.1.0) defines a terminal escape that reports working, blocked, done, error and idle, aimed at "terminals and agent dashboards". It is a cheap supervision signal if agents run in PTYs.

---

## 6. SDK / in-process embedding (`CA/src/core/sdk.ts`, `CA/docs/sdk.md`)

```ts
import { createAgentSession, SessionManager } from "@earendil-works/pi-coding-agent";
const { session, extensionsResult, modelFallbackMessage } = await createAgentSession({ cwd, sessionManager: SessionManager.create(cwd) });
const off = session.subscribe((e /* AgentSessionEvent */) => { ... });
await session.bindExtensions({ uiContext, mode: "rpc" /*or custom*/, commandContextActions, onError });
await session.prompt("...");   // resolves after the run (incl. retries)
session.dispose();
```

`CreateAgentSessionOptions` (sdk.ts:48-107):
- `cwd`, `agentDir`, `modelRuntime`
- `model`, `thinkingLevel`, `scopedModels`
- `noTools: "all"|"builtin"`, `tools?: string[]` (patterns or `+`/`-`), `excludeTools`, `customTools?: ToolDefinition[]`
- `resourceLoader`, `sessionManager`, `settingsManager`, `sessionStartEvent`

The result is `{session: AgentSession, extensionsResult, modelFallbackMessage?}`.

Other notable value exports (`CA/src/index.ts`):
- Session construction: `AgentSessionRuntime`, `createAgentSessionRuntime`, `createAgentSessionServices`, `createAgentSessionFromServices`.
- Session storage: `SessionManager`, `buildSessionContext`, `buildSessionProjection`, `parseSessionEntries`, `migrateSessionEntries`, `CURRENT_SESSION_VERSION`.
- Configuration and resources: `SettingsManager`, `DefaultResourceLoader`, `loadProjectContextFiles`, `ModelRegistry`, `ModelRuntime`, `DefaultPackageManager`.
- Tools: `createCodingTools`, `createReadOnlyTools`, the `create{Read,Bash,Edit,Write,Grep,Find,Ls,PowerShell}Tool[Definition]` factories, `createLocalBashOperations`, `withFileMutationQueue`, `generateDiffString`, `generateUnifiedPatch`.
- Compaction: `compact`, `generateSummary`, `generateBranchSummary`, `serializeConversation`, `estimateTokens`, `shouldCompact`.
- Extensions: `defineTool`, `ExtensionRunner`, `discoverAndLoadExtensions`, `createEventBus`, `createCodemodeExtension`, `createMcpExtension`, `createToolSearchExtension`.
- Modes: `runRpcMode`, `runPrintMode`, `RpcClient`, `InteractiveMode`, `main`.
- TUI components and theme helpers.

SDK notes:
- **SDK sessions do not auto-load the built-in MCP, codemode and tool-search extensions.** Add them through `DefaultResourceLoader({ extensionFactories })` (sdk.md).
- **Multiple `AgentSession`s per process appear feasible.** There is no `process.chdir`, and each session is bound to its own cwd. Process-global state includes the theme and the fetch dispatcher. Extensions are re-instantiated per session runtime.
- The SDK uses the user's `~/.pi/agent` auth, settings and resources unless overridden.

---

## 7. Extension system (`CA/src/core/extensions/types.ts`, 2304 lines; `CA/docs/extensions.md`)

### 7.1 Discovery and loading
- `loader.ts` loads TypeScript through jiti, so no build step is needed.
- Load order:
  1. `<cwd>/.pi/extensions/` (requires project trust)
  2. `~/.pi/agent/extensions/`
  3. paths in settings or packages
  4. `-e <path>`
- Accepted forms are a `*.ts`/`*.js` file, `dir/index.ts`, or a `package.json` with `"pi": {"extensions": [...]}`.
- Built-ins (`CA/src/extensions/index.ts`): `llama.cpp`, `codemode`, `tool-search` and `mcp`. They load by default and are disabled with `-builtin:<name>`.
- Pi packages install with `pi install npm:…|git:…|./local`. They bundle extensions, skills, prompts and themes, and must declare host packages as `peerDependencies`.

### 7.2 API surface
`export type ExtensionFactory = (pi: ExtensionAPI) => void | Promise<void>`.

Main `ExtensionAPI` members (L1592-1918):
```ts
on(event, handler): () => void
registerTool(def: ToolDefinition)              // L1671
registerCommand(name, { description?, getArgumentCompletions?, handler(args, ctx: ExtensionCommandContext) })
registerShortcut(key, { description?, handler(ctx) }); registerFlag(name, {type, default?, description?}); getFlag(name)
registerMessageRenderer / registerEntryRenderer / registerToolRenderer / registerMarkdownTransformer   // TUI only
sendMessage<T>({customType, content, display, details}, { triggerTurn?, deliverAs?: "steer"|"followUp"|"nextTurn" })  // goes to LLM
sendUserMessage(content, { deliverAs?: "steer"|"followUp" })     // always triggers a turn
appendEntry<T>(customType, data?)              // persisted, NOT sent to LLM; emits entry_appended
setSessionName / getSessionName / setLabel(entryId, label)
exec(cmd, args, opts); getActiveTools(); getAllTools(); setActiveTools(names); getCommands(); getSettings()
setModel(model); getThinkingLevel(); setThinkingLevel(level)
registerProvider(...); unregisterProvider(...); registerVirtualModel(...)
registerMcpServer(name, cfg); unregisterMcpServer(name); getMcpServers()
events: EventBus                               // inter-extension pub/sub
```

**Contexts.**
- `ExtensionContext`: `ui`, `mode: "tui"|"rpc"|"json"|"print"`, `hasUI`, `cwd`, `sessionManager` (read-only), `modelRegistry`, `model`, `isIdle()`, `abort()`, `getContextUsage()`, `compact()`, `getSystemPrompt()`, `shutdown()`.
- `ExtensionToolContext` adds `executeTool(name, args)` for nested calls.
- `ExtensionCommandContext` adds `newSession`, `fork`, `navigateTree`, `switchSession`, `reload` and `waitForIdle`.

### 7.3 Events (handler `(event, ctx) => result | void`)
- **Trust, resources and session lifecycle:**
  - `project_trust`, `resources_discover`
  - `session_start{reason: startup|reload|new|resume|fork}`, `session_info_changed`, `session_shutdown`
  - `session_before_switch` / `session_before_fork` (return `{cancel}`)
  - `session_before_compact` (return `{cancel}` or a custom `{compaction}`), `session_compact`, `session_compact_failed`
  - `session_before_tree` / `session_tree`
  - `mcp_servers_change`
- **Context and provider:**
  - `context` and `context_with_system` (rewrite the messages sent to the LLM)
  - `before_provider_request`, `before_provider_headers`, `after_provider_response`, `provider_stream_event`, `cache_warming_decision`
- **Run lifecycle:**
  - `before_agent_start` (inject a custom message or replace the system prompt), `agent_start`, `agent_end`
  - **`agent_before_settle`** (BoundaryState; can append entries and force `continue: true`), `agent_settled`
  - `turn_start`, **`turn_end`** (same boundary powers)
- **Messages and tools:**
  - `message_start` / `message_update` / `message_end` (`message_end` can replace the message)
  - `tool_execution_start` / `update` / `end`
  - **`tool_call`** (`input` is mutable; return `{block, reason, terminate}`), **`tool_result`** (rewrite `content` / `details` / `isError`)
- **User input and UI:**
  - `user_bash`, **`input`** (`{action: "continue"|"transform"|"handled"}`)
  - `model_select`, `thinking_level_select`
  - `ui_prompt_start` / `ui_prompt_end`

Boundary drafts (L971-1025):
```ts
type SessionBoundaryDraft =
  | { type: "custom"; customType: string; data?: unknown }
  | { type: "custom_message"; customType: string; content: string | (TextContent|ImageContent)[]; display: boolean; details?: unknown }
  | { type: "context_edit"; targetId: string; replacement: {content} | null }
  | { type: "compaction"; summary: string; firstKeptEntryId: string | null; details?: unknown; usage?: Usage };
interface BoundaryState { entries: SessionBoundaryDraft[]; continue: boolean; context: BoundaryContextPreview; outcome: "completed"|"aborted"|"error" }
interface BoundaryResult { entries?: SessionBoundaryDraft[]; continue?: boolean }
```

### 7.4 Custom tools
`ToolDefinition` (L579-668):
- `name`, `label`, `description`, `promptSnippet?`, `promptGuidelines?`
- `parameters: TSchema` (TypeBox; `import { Type } from "typebox"`, `StringEnum` from pi-ai)
- `outputSchema?`, `exposure?: "direct"|"model-only"|"codemode"|"deferred"|"hidden"`, `annotations?: {readOnlyHint, destructiveHint, ...}`
- `defaultActive?`, `executionMode?`
- `execute(toolCallId, params, signal, onUpdate, ctx)`, plus TUI-only `renderCall` / `renderResult`

Registering a tool with a built-in name overrides that built-in (`examples/extensions/tool-override.ts`).

### 7.5 State persistence rules (`CA/docs/extensions.md` L225-238)

| State | Storage |
|---|---|
| Follows the active branch | tool-result `details` (e.g. `todo.ts` rebuilds from `ctx.sessionManager.getBranch()` on `session_start` / `session_tree`) |
| Durable, not in model context | `pi.appendEntry()` → `custom` entry → `entry_appended` event |
| Stored and sent to the model | `pi.sendMessage()` → `custom_message` entry |
| Data outside one session | "External storage" (explicitly the extension's job) |

### 7.6 Example extensions worth reusing (`CA/examples/extensions/`)
- **`todo.ts`**: state lives in tool `details`, which keeps it branch-correct.
- **`plan-mode/`**: `setActiveTools` (read-only), a bash allowlist via `tool_call`, `appendEntry("plan-mode")`, `[DONE:n]` markers, `setWidget`, and `select` → `sendMessage(..., {deliverAs: "followUp"})`.
- **`subagent/`**: spawns `pi --mode json -p --no-session` child processes in single, parallel (max 8, 4 concurrent) and chain modes. Agents are markdown files in `~/.pi/agent/agents`.
- **`permission-gate.ts`, `protected-paths.ts`, `confirm-destructive.ts`, `dirty-repo-guard.ts`, `timed-confirm.ts`**: approval patterns.
- **`git-checkpoint.ts`**: `git stash create` per turn, restored on fork. A model for "Changes" snapshots.
- **`handoff.ts`**: `/handoff <goal>` generates a focused prompt and calls `newSession({parentSession, withSession})`. An alternative to compaction.
- **`structured-output.ts`**: a `defineTool` whose result uses `terminate: true`.
- **`rpc-demo.ts`**, with the host in `examples/rpc-extension-ui.ts`: exercises every RPC UI method.

### 7.7 Skills, prompt templates, themes
- **Skills** follow the Agent Skills spec (`SKILL.md` with name and description frontmatter). Only name, description and path go into the prompt; the body is read on demand. They can be forced with `/skill:name`. Locations: `~/.pi/agent/skills`, `.pi/skills`, `~/.agents/skills`, `.agents/skills` (cwd up to the repo root).
- **Prompt templates** are `.md` files in `prompts/` and become `/name`. They support `$1`, `$@`, `$ARGUMENTS` and `${1:-def}`.
- **Themes** are JSON and apply to the TUI and HTML export only.

---

## 8. Sessions, branching, compaction

### 8.1 Storage (`CA/src/core/session-manager.ts`, 2013 lines; `CA/docs/session-format.md`)
- **Format:** append-only **JSONL**, `CURRENT_SESSION_VERSION = 3`. v1 and v2 files are migrated on load.
- **Header** (L43): `{type:"session", version, id (uuidv7), timestamp, cwd, parentSession?}`.
- **Entries** share `{type, id (8 hex), parentId | null, timestamp}`. Types (L64-183):
  - `message`: an `AgentMessage`. System prompt sections are stored as system messages.
  - `thinking_level_change`, `model_change`
  - `usage`: cost outside the model context, such as cache warming
  - `compaction {summary, firstKeptEntryId, tokensBefore, details?}`
  - `branch_summary {fromId, summary}`
  - `custom {customType, data}`: not sent to the LLM
  - `custom_message {customType, content, display, details}`: sent to the LLM
  - `context_edit {targetId, replacement}`
  - `label {targetId, label}`
  - `session_info {name}`
- **The id/parentId links form a tree.** The leaf is **not persisted**; on load it is the last entry in the file.
- **Location (L590-593):** `~/.pi/agent/sessions/--<cwd with / \ : → ->--/<ISO-timestamp>_<sessionId>.jsonl`.
  - **Sessions are grouped by encoded cwd.**
  - Override with `--session-dir`, `PI_CODING_AGENT_SESSION_DIR`, or the `sessionDir` setting.
  - The agent dir itself can be moved with `PI_CODING_AGENT_DIR`.
- **APIs:**
  - Constructors: `create`, `open`, `continueRecent`, `inMemory`, `forkFrom(sourcePath, targetCwd)`, `findById`.
  - Listing: `list(cwd)`, `listAll()` → `SessionInfo {path, id, cwd, name?, parentSessionPath?, created, modified, messageCount, firstMessage, allMessagesText}`.
  - Tree: `getTree()`, `getBranch()`, `branch(id)`, `branchWithSummary`, `createBranchedSession`.
- **Missing cwd:** if a session's recorded cwd no longer exists, non-interactive modes exit 1 (`session-cwd.ts`, `main.ts:697-709`). This matters if worktrees are deleted while Goals outlive them.

### 8.2 Branching
- **`/tree` (`navigateTree`)** moves the leaf within the same file, with an optional LLM summary of the abandoned branch (`branch_summary`).
- **`/fork`** creates a new file from just before a user message. **`/clone`** copies the active branch into a new file. Both set `parentSession` in the header.

### 8.3 Compaction (`CA/src/core/compaction/`, `CA/docs/compaction.md`)
- **Trigger:** `contextTokens > contextWindow - reserveTokens`. Defaults are `reserveTokens = 16384` and `keepRecentTokens = 20000`.
- **When it runs:** checked between turns and before prompts. On provider overflow, Pi compacts with reason `"overflow"` and retries.
- **Summary format.** The summary prompt (`compaction.ts:507`) **already uses this structure:**
  - `## Goal`
  - `## Constraints & Preferences`
  - `## Progress` (Done / In Progress / Blocked)
  - `## Key Decisions`
  - `## Next Steps`
  - `## Critical Context`
  - Pi then appends `<read-files>` / `<modified-files>`, with `details = {readFiles, modifiedFiles}`.
- **This is free text, produced only when compaction runs. It is not live state.**
- Extensions can replace compaction entirely via `session_before_compact` (`examples/extensions/custom-compaction.ts`).

---

## 9. Context files, settings, models, cost, memory, trust

- **Context files** (`resource-loader.ts:184-273`):
  - In each directory the first match wins, in this order: `AGENTS.override.md`, `AGENTS.md`, `CLAUDE.md`.
  - Search order: the global `~/.pi/agent/AGENTS.md`, then **every ancestor directory from the filesystem root down to cwd**.
  - Worktree-aware shadowing applies.
  - Context files are loaded **regardless of trust**. Disable them with `--no-context-files`.
- **Settings:**
  - Files: `~/.pi/agent/settings.json` (global) deep-merged with `<cwd>/.pi/settings.json` (project, only if trusted). Schema: `https://pi.dev/schemas/settings.schema.json`.
  - Other files in the agent dir: `auth.json`, `models.json`, `mcp.json`, `trust.json`, `keybindings.json`.
  - Key settings: `defaultProvider/Model/ThinkingLevel`, `defaultTools`, `steeringMode`, `followUpMode`, `compaction.*`, `retry.*`, `sessionDir`, `packages`, `extensions`, `skills`, `defaultProjectTrust`, `tuiMode`, `cacheWarming`.
- **Models and auth:**
  - `ModelRegistry` / `ModelRuntime` sit over pi-ai.
  - Credential precedence: `--api-key` > `auth.json` (incl. OAuth from `/login`) > `models.json` > environment variables.
  - Custom providers come from `models.json` or `pi.registerProvider`.
  - Virtual models: an extension-registered router picks the physical model per request.
- **Cost:**
  - Every `AssistantMessage.usage` is a `Usage` (`AI/src/types.ts:451`):
    ```ts
    interface Usage { input; output; cacheRead; cacheWrite; cacheWrite1h?; reasoning?; totalTokens;
      cost: { input; output; cacheRead; cacheWrite; total } }
    ```
  - `getSessionStats()` sums **all branches** in the file, including tool and summarization usage.
  - `usage-totals.ts` breaks cost down per provider/model. `cache-stats.ts` reports cache misses and cache waste.
  - Live usage also rides on every RPC `message_update`.
- **Memory:** **none.** There is no memory subsystem. Persistent knowledge lives only in AGENTS.md files, skills, per-session `custom` entries and compaction summaries, all bound to a path or a session. Cross-session or Goal memory must be ours.
- **Trust:**
  - `project-trust.ts` gates project `.pi/*` resources (settings, mcp, extensions, skills, prompts, themes, SYSTEM.md), not tool power.
  - Decision order: `--approve` / `--no-approve` → extension `project_trust` → `~/.pi/agent/trust.json` → `defaultProjectTrust` (`ask`) → TUI prompt.
  - **In RPC there is no prompt, so `ask` resolves to untrusted.** Project extensions are then silently skipped. A GUI must pass `--approve` or answer trust via a user-level extension.
- **Permissions:** none built in ("does not ask for approval before every tool call", `CA/docs/security.md`). Approval = a `tool_call` hook + `ctx.ui.confirm/select`.

---

## 10. Existing GUI or web components

- **In repo: none.**
  - `pi-web-ui` (Lit web components that ran the agent in the browser) was removed on 2026-05-20.
  - The experimental `pi-server` / `pi-client` was removed before 1.2.0.
  - The only UIs are the TUI (`pi-tui`) and the static HTML session export (`CA/src/core/export-html/`).
- **Ecosystem:**
  - OpenClaw is cited in the README as the real-world integration; it embeds the SDK.
  - Third-party web UIs exist (agegr/pi-web, jmfederico/pi-web, etc.).
  - `earendil-works/pi-review-loop` (`/diff-review`, a native diff window with inline comments and checkpoint-based "since review" diffs) is directly relevant to full-screen diff review and worth studying.
  - `badlogic/pi-subagent` runs subagents in tmux, each with its own JSONL session.

---

## 11. Multi-agent, background, worktrees, approval

- **Coding agent:** no built-in subagents, background tasks, worktrees or approval.
  - "Worktree" appears only in context-file shadowing and footer git detection.
  - Multi-agent = multiple processes (the `subagent` example) or multiple SDK sessions.
  - Bash is synchronous; there is no background bash.
- **pi-durable** (experimental; "The API changes without notice", `DU/README.md:3`; normative spec `DU/docs/spec.md`, 5352 lines) natively has most of what a supervision GUI wants:
  - **Many conversations per harness or storage.** Each conversation has its own agent config (model, tools, instructions, **cwd**) in a `pi.agent` document.
  - **Tasks** are checkpointed state machines (`pi.generation`, `pi.tool`, compaction, custom). Work resumes after a crash.
  - **Task graph:** `harness.taskGraph()` / `watchTaskGraph()` → `TaskGraphNode {id, kind, conversationId, owner?, background, abortRequested, state, conversations}`. The README pitches it "for a task panel".
  - **Owned and background subagents:** a conversation owned by a task; abort cascades unless the work is background. See examples 22 and 23 under `DU/test/examples/`.
  - **Documents:** typed JSON committed atomically with the transcript.
    - Scopes are `"session"` (the whole Session/storage, i.e. cross-conversation), `"conversation"` (latest or rewindable, with fork semantics) and `"task"` (`DU/src/types.ts:57-60`, `DU/src/documents.ts:38-79`).
    - **Storage-wide docs are a natural home for Goals that are decoupled from conversations and folders.**
  - **Multi-client:** `conversation.watch()` gives committed state plus ops, and `viewState()` gives a `ConversationView {conversation, entries, docs}`. `submit({whenBusy: "steer"|"followUp"|"reject", requestId})` is idempotent.
  - **Approval hooks:** `beforeTool: call => ({ block: "Needs approval" })`. Also `onYield` (`{continue: "Keep going."}`), `afterTools`, `beforeCompact`.
  - **Tool result channels:** `output` (model), `structuredOutput` (programs), `details` (UIs).
  - **Storage:** memory, SQLite, JSONL, Cloudflare DO. "One process owns a storage at a time."
  - **No network server is provided.** You forward `watch()` ops yourself; Chord has WebSocket links.
  - **Missing compared with the CLI:** the coding-agent extension ecosystem, skills and prompt-template loading, AGENTS.md discovery, TUI, and RPC.

---

## 12. Assessment for a Goal-centric GUI

### 12.1 What Pi gives us natively

| GUI need | Pi primitive |
|---|---|
| "Current line" runtime status | `message_update` deltas (text, thinking, toolcall), `tool_execution_start/update/end` (with `parentToolCallId`), `queue_update`, `compaction_*`, `auto_retry_*`, `agent_settled`. Throw the stream away after the run; keep only the current line. |
| Changes | `edit` gives `details.patch` (unified diff) and `firstChangedLine`. `write` gives nothing, so use git or a checkpoint extension. For full-screen diffs, compute the diff from git against a per-Goal base. |
| Steering / interruption | `steer`, `follow_up`, `abort`, `clear_queue`, with dispositions. |
| Trace (session = deep inspection) | JSONL tree, `get_entries{since}` cursor, `get_tree`, HTML export. |
| Structured state transport | Tool `details` plus `entry_appended` events from `appendEntry`, both persisted and both visible over RPC. |
| Human-in-the-loop prompts | `extension_ui_request` select / confirm / input / editor over RPC. |
| "Keep going until validated" | `agent_before_settle` / `turn_end` → `{continue: true, entries}`. |
| Cost / tokens | `Usage` per message, `get_session_stats`, `getContextUsage`. |
| Approval | A `tool_call` hook + `ctx.ui.confirm` → GUI dialog. |
| Sandboxing per agent | Pluggable `BashOperations` / `EditOperations` / `WriteOperations`, the Gondolin extension, `pi-env`. |

### 12.2 What is missing (we must build it)

1. **Goals as entities.** Pi has sessions keyed by cwd. It has no Goal, Task, Decision or Validation model, no cross-session index, and no archive or acceptance concept. All of this goes in our own store. A Goal links to N session files and N cwds/worktrees.
2. **Live structured state.** The compaction summary has Goal / Progress / Decisions, but it is lossy free text produced only at compaction. We need explicit, model-emitted events (§12.4).
3. **Memory not bound to session or path.** None exists. Inject our Goal memory through a `before_agent_start` custom message (`display: false`) or a system-prompt section, or through a `context` handler. Do not write it into AGENTS.md.
4. **Multi-agent supervision.** The CLI handles one session per process. Run N `pi --mode rpc` processes, or N SDK sessions in one Node host. Durable has a real task graph but is experimental.
5. **Worktrees.** Not supported. Our orchestrator creates `git worktree` per Goal or agent and launches Pi with that cwd. Beware the missing-cwd exit and that session dirs are keyed by cwd, so use `--session-dir` to group by Goal.
6. **Rich ask_user.** RPC only supports select / confirm / input / editor with string options. Richer forms need our own tool that blocks on a host round-trip (§12.4).
7. **Session-change and model-change events over RPC.** These are absent; re-query after commands.
8. **A protocol schema.** None exists. Generate our own from `rpc-types.ts`, `json-event.ts`, `AgentSessionEvent` and `SessionEntry`.

### 12.3 Integration path: recommendation

| Option | Pros | Cons |
|---|---|---|
| **A. RPC subprocess per agent** (`pi --mode rpc --session-dir <goalDir> --approve -e <our-ext.ts>`) | Stable, documented protocol. Process isolation per agent: a crash or hung tool affects one Goal, and the process can be killed. Works with the standalone binary and any GUI language (Tauri, Swift, Electron). Users keep their own `~/.pi/agent` extensions, skills, auth and packages. Matches the author's intended path ("simple way to build alternative UIs"). | Text-only extension UI. No session-list or tree-navigation commands. Some setters write *global* settings. No change events. One session per process. ~100 MB Node per agent. |
| **B. In-process SDK** (Node/Electron main process or a sidecar) | Full API: `navigateTree`, `SessionManager.listAll`, `customTools` without files, direct `ExtensionUIContext` (we can implement `custom()`-like rich dialogs), many sessions in one process, typed objects. | Ties the GUI host to Node/Bun. No crash isolation between agents. Extension code runs in our process. Must re-bind on every runtime replacement. API churn (1.x is new). |
| **C. Pure extension inside the TUI** | Trivial to ship. | Cannot deliver the full-screen, multi-agent GUI. Rejected as the main path, but our extension is still needed in A and B. |
| **D. pi-durable** | Native multi-conversation, task graph, storage-wide documents (Goals), background subagents, crash recovery, multi-client watch. | Experimental, with API changes without notice. Loses the CLI's extension, skills and AGENTS.md ecosystem. Bigger build. |

**Recommendation:**
- **Hybrid A + our extension.** Build a thin Node **sidecar "supervisor"** that owns the Goal store and spawns one `pi --mode rpc` child per running agent. It injects a single extension (`-e goal-ext.ts`) that adds the structured-state tools and hooks.
- **Why RPC rather than the SDK for the agents themselves:**
  - (1) Isolation and kill-ability are essential for multi-agent supervision.
  - (2) Users' existing Pi config keeps working unchanged.
  - (3) The protocol is the officially supported language-neutral boundary, and all modes share the same `AgentSession`, so there is no feature loss in agent behaviour.
  - (4) The pieces RPC lacks (session listing, tree reading) can be done by the sidecar reading JSONL files directly with the exported `SessionManager` / `parseSessionEntries`. That is SDK use for *read-only* trace inspection, which is cheap and safe.
- **Track pi-durable as the medium-term substrate.** If Earendil stabilises it, its storage-wide documents + task graph + `watch()` map almost one-to-one onto Goals, the supervision board and multi-client steering. Keep our Goal model storage-agnostic so we can migrate.
- **Operational settings for the RPC children:**
  - `--approve` (or a user-level `project_trust` extension).
  - `--session-dir ~/.ourapp/goals/<goalId>/sessions` to decouple sessions from cwd grouping.
  - Never call `set_steering_mode`, `set_follow_up_mode`, `set_auto_compaction` or `set_auto_retry` per agent, because they change global settings. Use per-process settings instead (for example a custom `PI_CODING_AGENT_DIR`, or leave defaults).
  - Drain stdout continuously.
  - Correlate responses by `id`.
  - Treat `agent_settled` as done.

### 12.4 Structured-state signals to add via our extension

All of these are model-callable tools (so the model emits them deliberately) plus hooks. Each tool returns typed `details`, so the GUI gets the data in `tool_execution_end.result.details` and it persists, branch-correctly, in the session. Where state must survive outside the model context, the tool also calls `pi.appendEntry` (emits `entry_appended`).

| Signal | Mechanism |
|---|---|
| `goal_update` (restate goal, acceptance criteria) | Tool. Rarely called; the GUI mostly owns the Goal. Inject the Goal at start via `before_agent_start`. |
| `task_update` (tasks list, status transitions) | Tool, todo.ts pattern: full state in `details` each call. |
| `decision_record` (decision, rationale, alternatives) | Tool → `details` + `appendEntry("goal.decision")`. |
| `ask_user` (question, options, free text) | Tool that awaits `ctx.ui.select` / `input` / `editor` (RPC round-trip). For richer forms, encode JSON in `title` with a `goal-ask:` prefix convention our GUI recognises. Set `executionMode: "sequential"`. |
| `validation_report` (command, result, criteria met) | Tool. Plus an `agent_before_settle` hook that forces `{continue: true}` with a custom message when the Goal requires validation and none was reported. Rate-limit this. |
| `changes` | No tool. Derive from `edit` `details.patch` and git diff. Optionally use `turn_start` checkpoints (git-checkpoint.ts pattern). |
| `current_line` | No tool. Derive from `tool_execution_start` (toolName + args summary) and the latest text delta. |
| approval | `pi.on("tool_call")` → `ctx.ui.confirm` for destructive bash, writes outside the worktree, and similar. |

Sketch, written against the actual API (`ExtensionAPI` in `CA/src/core/extensions/types.ts`; TypeBox import as in `examples/extensions/todo.ts`):
```ts
import { StringEnum } from "@earendil-works/pi-ai";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";

export default function goalExtension(pi: ExtensionAPI) {
  pi.registerFlag("goal-id", { type: "string", description: "GUI goal id" }); // host passes --goal-id <id>
  const goal = () => String(pi.getFlag("goal-id") ?? "");                    // read lazily, after CLI parse
  const goalId = goal();  // (illustrative; prefer calling goal() inside handlers)

  pi.registerTool({
    name: "task_update",
    label: "Tasks",
    description: "Report the current task list for the goal. Send the full list every time.",
    promptGuidelines: ["Call task_update when you start, finish, or re-plan a task."],
    parameters: Type.Object({
      tasks: Type.Array(Type.Object({
        id: Type.String(), title: Type.String(),
        status: StringEnum(["todo", "doing", "done", "blocked"] as const),
      })),
    }),
    async execute(_id, params) {
      return { content: [{ type: "text", text: "ok" }], details: { kind: "goal.tasks", goalId, ...params } };
    },
  });

  pi.registerTool({
    name: "decision_record",
    label: "Decision",
    description: "Record a design decision and its rationale.",
    parameters: Type.Object({ decision: Type.String(), rationale: Type.String(),
                              alternatives: Type.Optional(Type.Array(Type.String())) }),
    async execute(_id, params) {
      pi.appendEntry("goal.decision", { goalId, ...params });     // -> entry_appended on RPC stdout
      return { content: [{ type: "text", text: "recorded" }], details: { kind: "goal.decision", ...params } };
    },
  });

  pi.registerTool({
    name: "ask_user",
    label: "Ask user",
    description: "Ask the human a blocking question. Use only when you cannot proceed safely.",
    executionMode: "sequential",
    parameters: Type.Object({ question: Type.String(), options: Type.Optional(Type.Array(Type.String())) }),
    async execute(_id, p, signal, _onUpdate, ctx) {
      if (!ctx.hasUI) return { content: [{ type: "text", text: "No user available" }], details: {}, isError: true };
      const answer = p.options?.length
        ? await ctx.ui.select(p.question, p.options, { signal })
        : await ctx.ui.input(p.question, undefined, { signal });
      return { content: [{ type: "text", text: answer ?? "(no answer)" }], details: { kind: "goal.ask", ...p, answer } };
    },
  });

  // Inject goal memory (not bound to session/path) at the start of each run.
  pi.on("before_agent_start", async () => ({
    message: { customType: "goal.context", content: await loadGoalBrief(goalId), display: false },
  }));

  // Approval gate.
  pi.on("tool_call", async (event, ctx) => {
    if (event.toolName === "bash" && /\brm\s+-rf\b|git\s+push/.test(String(event.input.command))) {
      const ok = ctx.hasUI && (await ctx.ui.confirm("Approve command?", String(event.input.command)));
      if (!ok) return { block: true, reason: "Rejected by user" };
    }
  });

  // Validation gate before the run settles.
  pi.on("agent_before_settle", async (state) => {
    if (state.outcome === "completed" && needsValidation(goalId)) {
      return { continue: true, entries: [{ type: "custom_message", customType: "goal.validate",
        content: "Run the goal's validation and call validation_report.", display: false }] };
    }
  });
}
```

The signatures in this sketch were checked against `CA/src/core/extensions/types.ts`:
- `select(title, options, opts?: {signal?, timeout?}) → Promise<string|undefined>` (L151)
- `confirm(title, message, opts?) → Promise<boolean>` (L154)
- `input(title, placeholder?, opts?)` (L157)
- `editor(title, prefill?)` (L240)
- `BeforeAgentStartEventResult {message?: Pick<CustomMessage,"customType"|"content"|"display"|"details">; systemPrompt?}` (L1496)
- `getFlag(name): boolean|string|undefined` (L1708)

`loadGoalBrief` and `needsValidation` are our own functions. `event.input` in `tool_call` is narrowed per tool by `isToolCallEventType("bash", event)`; the sketch casts for brevity.

---

## 13. Tensions with the product principles, and how to reconcile them

1. **"Minimal, see every token" vs a heavy GUI.**
   - Pi's core value is context transparency. A GUI that hides the stream conflicts with that, superficially.
   - **Reconcile:** hide the stream *by default*, but keep the trace one click away and lossless. The JSONL tree already gives this (get_entries, HTML export).
   - Keep our injected context small and visible: show the exact `goal.context` message in the trace.
   - Do not add a large system prompt.
2. **"No built-in to-dos / plan mode; to-dos confuse models" vs Task as a first-class panel.**
   - Mario's empirical claim is that to-do tooling can hurt model performance.
   - **Reconcile:**
     - Make the task tool optional and cheap: one tool, full-state replace, guideline "call when starting or finishing".
     - Let the GUI derive Tasks from the human-authored Goal plan rather than forcing the model to micro-manage.
     - Measure with pi-evals-style A/B runs.
     - Plan mode exists as an example extension, which shows the author accepts it as an add-on.
3. **YOLO by default vs supervision and acceptance.** Pi will not gate anything. Approval, sandboxing (worktree, Gondolin, container) and "archive on human acceptance" are entirely our layer. That is consistent with Pi's stance: it expects hosts to add policy.
4. **Session grouped by cwd vs Goals decoupled from folders.**
   - Pi's storage is path-keyed.
   - **Reconcile:** treat Pi sessions as traces. Use `--session-dir` per Goal. Our Goal store references session files and cwds; never infer a Goal from a path.
   - Durable already makes cwd a per-conversation config field, which matches the principle and is a sign of where Pi is heading.
5. **No memory vs memory independent of session or path.** Pi deliberately has none (only AGENTS.md). We own memory and inject it per run (`before_agent_start`, `context`). Keep it auditable in the trace to stay true to Pi's transparency ethos.
6. **Single-session CLI vs multi-agent supervision.**
   - The author rejected built-in sub-agents for the CLI. Earendil instead built Durable for "multiple surfaces, long-running tasks, many conversations".
   - Our supervisor-of-RPC-processes matches the `subagent` example's process-isolation pattern. Durable is the official long-term answer.
7. **Full-screen diff review.**
   - Pi provides patches for `edit` only. `write` has no diff, and bash can change anything.
   - Diff review must be git-based against a per-Goal base commit or worktree, not built from tool events. Use tool events only to annotate which turn touched which hunk.
   - `earendil-works/pi-review-loop` shows the author's own checkpoint-diff approach.
8. **Stability risk.** Pi moves fast: 1.0 → 1.2 in two weeks, the server stack removed, chord dropped, pi-web-ui removed. Pin the version, write our own RPC client from the types, and keep the extension surface we depend on small:
   - `registerTool`
   - `appendEntry`
   - `on("tool_call" | "before_agent_start" | "agent_before_settle")`
   - `ctx.ui.select / confirm / input`

---

## 14. Key file index

| Topic | File |
|---|---|
| Agent loop | `packages/agent/src/agent-loop.ts` (runLoop L163-321) |
| Agent class, queues | `packages/agent/src/agent.ts` (L143-370) |
| Core types | `packages/agent/src/types.ts` (AgentEvent L516, AgentTool L466) |
| AgentSession | `packages/coding-agent/src/core/agent-session.ts` (events L196, stats L343, prompt L2058, navigateTree L3994) |
| Runtime replacement | `packages/coding-agent/src/core/agent-session-runtime.ts` |
| SDK | `packages/coding-agent/src/core/sdk.ts`, `docs/sdk.md`, `examples/sdk/*` |
| Tools | `packages/coding-agent/src/core/tools/*.ts` |
| RPC | `packages/coding-agent/src/modes/rpc/{rpc-mode,rpc-types,rpc-client,jsonl}.ts`, `docs/rpc*.md` |
| JSON events | `packages/coding-agent/src/modes/json-event.ts`, `docs/json.md` |
| Extensions | `packages/coding-agent/src/core/extensions/{types,loader,runner}.ts`, `docs/extensions.md`, `examples/extensions/*` |
| Sessions | `packages/coding-agent/src/core/session-manager.ts`, `docs/session-format.md`, `docs/sessions.md` |
| Compaction | `packages/coding-agent/src/core/compaction/*`, `docs/compaction.md` |
| System prompt | `packages/coding-agent/src/core/system-prompt.ts` |
| Trust | `packages/coding-agent/src/core/project-trust.ts`, `docs/security.md` |
| Durable | `packages/durable/README.md`, `docs/spec.md`, `src/harness/*`, `test/examples/*` |

## Sources (web)
- Mario Zechner, "What I learned building an opinionated and minimal coding agent" (2025-11-30): https://mariozechner.at/posts/2025-11-30-pi-coding-agent/
- Earendil, "Pi 1.0": https://earendil.com/posts/pi-1-0/
- Earendil, "Pi Durable": https://earendil.com/posts/pi-durable/
- The Register, "Pi coding agent pulls a 180 and adds MCP support" (2026-10-02): https://www.theregister.com/ai-and-ml/2026/10/02/pi-coding-agent-pulls-a-180-and-adds-mcp-support/5300678
- Armin Ronacher, "Mario and Earendil" (2026-04-08): https://mitsuhiko.spicytakes.org/post/2026-04-08-mario-and-earendil
- pi.dev changelog, "Pi Has a New Home at Earendil": https://pi.dev/changelog/2026/5/7/pi-has-a-new-home
- Earendil RFCs tagged pi: https://rfc.earendil.com/keyword/pi/
