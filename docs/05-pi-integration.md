# 05 · Pi 集成：Engine Adapter、tower-goal 扩展与陷阱

> 依赖：`00`（R1、R6、§0.5）、`02`（Run、Claim、Comment、NeedsYouItem、HandoffPacket、TowerEvent）、`03`（I4、I5、I7、§3.4）、`15`（ADR-004、008、009、011、015、016、020、022–027、030、032、033、037）、`16-registry`（枚举与默认值的唯一来源）。
> 本文引用的 Pi API、事件名、类型、标志和行为都附有源码位置。每一项依赖的核实方式（“契约测试验证”或“仅读源码”）见 §5.9 陷阱表的最后一列和 §5.11.1 依赖清单。第 1 轮评审发现过一处误读（压缩专用模型，R1-D2-01），已删除，相关依赖已全部重新核对。

## 5.0 基线与引用约定

| 项 | 值 |
|---|---|
| Pi 版本 | `@earendil-works/pi-coding-agent` **1.2.0（精确）**，即 tag `v1.2.0`（`06a4669`）。阅读的源码是 `research/pi-mono` HEAD `b06c1f2`（2026-10-14，比 v1.2.0 晚 46 个提交，差异见下一行） |
| 路径缩写 | `CA/` = `packages/coding-agent/`，`AG/` = `packages/agent/`，`AI/` = `packages/ai/` |
| 引用格式 | `CA/src/core/agent-session.ts:196-237` 表示文件与行号区间 |
| Token 估算口径 | ADR-032：`ceil(asciiChars/4 + nonAsciiChars/1.5)`，对象为工具声明 JSON 与文本（§5.6.3）。Pi 自己用 chars/4（`compaction.ts:298-310`），只作对照 |
| 发布版 | 源码核实基于 HEAD `b06c1f2`；随应用发布的是 npm 1.2.0（精确）。两者差异见 `research/pi-release-diff.md`（ADR-047）：Tower 依赖的扩展、事件、RPC、压缩语义没有变化；行号与 v1.2.0 相差至多 5 行（第 66 轮抽查多为 v1.2.0 中提前 1–5 行，且不限于 `agent-session.ts`；个别引用已直接按 v1.2.0 书写，如 3529–3553、`session-manager.ts:1815-1865`），引用以符号名为准（ADR-194）。§5.11.1 增加“发布版核实”列 |

术语：**Engine Host** 指承载 Pi 的 Tower 进程（`06` §6.1）。**Run** 指一次 Pi 会话执行（`02` §2.6）。**reqKey**、**claimKey** 等是 tower-goal 自己生成的 ULID，与 Pi 内部 id 无关。

---

## 5.1 集成总览

```
 Supervisor (utilityProcess)                          Engine Host (utilityProcess)
 ┌──────────────────────────────┐   MessagePort     ┌───────────────────────────────────────────┐
 │ EngineManager                │ ◄──────────────► │ pi-sdk:  AgentSessionRuntime ×1（或打包 N 个）│
 │   └ EngineAdapter (proxy)    │  cmd/res/evt/ack  │          + TowerUIContext                  │
 │ Observer / StateMachine / …  │                   │          + tower-goal (inline factory)     │
 └──────────────────────────────┘                   │ pi-rpc:  RpcProcessClient ×N               │
                                                    │          └ spawn `pi --mode rpc …` 子进程   │
                                                    │              + tower-goal (-e 路径)         │
                                                    └───────────────────────────────────────────┘
```

- Supervisor 只依赖 `EngineAdapter`（§5.2）。两种实现位于 Engine Host 内，Supervisor 侧只有一个通用代理，跨 MessagePort 调用它们。
- `tower-goal` 是同一份 `ExtensionFactory` 源码（`CA/src/core/extensions/types.ts:2045`）。SDK 模式通过 `DefaultResourceLoader({extensionFactories})` 注入（`CA/src/core/resource-loader.ts:276-286`）；RPC 模式通过 `-e <path>` 加载（`CA/src/cli/args.ts:186`）。
- tower-goal 只从 `@earendil-works/pi-coding-agent`、`@earendil-works/pi-ai`、`typebox` 导入。Pi 的扩展加载器把这三个包别名到宿主自己的副本（`CA/src/core/extensions/loader.ts:64-107`），所以在 RPC 模式下，扩展使用的 TypeBox 和 pi-ai 就是用户安装的 pi 中的版本。**tower-goal 不得打包这些依赖。**

---

## 5.2 EngineAdapter 接口

### 5.2.1 类型

**ADR-016 约束**：`engine-api` 包**不 import 任何 Pi 类型**。会话条目和树节点用 Tower 中立类型表示；Pi 原始对象只放在不透明字段 `raw` 里，交给 Trace 的 Pi 专用渲染器。Pi 独有的能力通过 `EngineCapabilities` 声明，Supervisor 只按能力分支，不按 adapter 名称分支。v1 只实现 `pi-sdk` 和 `pi-rpc`；`acp`（Zed Agent Client Protocol，用于接入 Claude Code、Codex 等）保留为第三种实现。

```ts
// packages/engine-api/src/adapter.ts  —— 不依赖 @earendil-works/*
export type AdapterKind = "pi-sdk" | "pi-rpc" | "acp";

export interface EngineCapabilities {
  engine: { name: string; version: string };      // {name:"pi", version:"1.2.0"}
  treeNavigation: boolean;        // 同一会话内移动叶子并给放弃的分支生成摘要。pi-sdk: navigateTree；pi-rpc: 扩展命令 /tower-nav（§5.4.4）
  forkSession: boolean;           // 从某个条目分出新会话文件。pi: ✔
  steerQueue: boolean;            // 运行中转向。pi: ✔
  followUpQueue: boolean;         // 停止点投递。pi: ✔
  uiDialogs: boolean;             // 可阻塞的人机对话。pi: ✔（extension UI）
  turnBoundaryHooks: boolean;     // 扩展可在 turn 边界写条目或请求继续。pi: ✔
  toolGate: boolean;              // 工具执行前拦截。pi: ✔（tool_call）
  compactionNotify: boolean;      // 压缩完成后有通知点可补充上下文。pi: ✔（session_compact）。Tower 不接管压缩（ADR-026）
  contextUsage: boolean;          // pi: ✔
  cwdOverrideOnResume: boolean;   // pi-sdk: ✔（SessionManager.open 第 3 参）；pi-rpc: ✘
  settingsWriteGuard: boolean;    // pi-sdk: ✔（§5.3.3）；pi-rpc: ✘（只能靠纪律，§5.4.6）
}

/** 中立的会话条目：足以构建 Trace 树、做回执匹配和 Claim 溯源 */
export interface EngineEntry {
  id: string; parentId: string | null; at: string;
  kind: "message" | "custom" | "custom_message" | "compaction" | "branch_summary" | "model_change" | "other";
  role?: "user" | "assistant" | "toolResult" | "system" | "custom";
  text?: string;                  // user/assistant 文本，截断到 4 KB
  toolCalls?: { id: string; name: string }[];
  toolCallId?: string;            // toolResult
  customType?: string; data?: unknown;   // custom / custom_message（例如 tower.* 条目）
  raw?: unknown;                  // 引擎原始对象，只供 Pi 专用渲染器使用
}
export interface EngineTreeNode { entry: EngineEntry; children: EngineTreeNode[]; label?: string }
export interface ModelRef { provider: string; id: string }

export interface RunSpec {
  goalId: GoalId;
  runId: RunId;
  phase: "shaping" | "running" | "review";   // review = 独立评审 Run（02 §2.6 reason:"review"）
  cwd: string;                    // 主 binding 的卫星根（ADR-008）
  sessionDir: string;             // ~/.tower/goals/<G>/sessions
  sessionId: string;              // 新会话：由首个 RunId 派生，满足 Pi 的 id 规则（session-manager.ts:268）。Run:Session = N:1（§5.8）
  runDir: string;                 // ~/.tower/goals/<G>/runs/<R>（tower-goal.json、policy.json、brief.md …）
  model?: { provider: string; id: string; thinking?: string };
  opening: RunOpening;            // 本 Run 的开场：Tower 的话与人的话分开（ADR-135）
  resources: PiResourcePolicy;    // §5.10
  projectTrust: "trusted" | "untrusted";   // 已求值：Project.trust=trusted 且 .pi/**、.agents/** 相对 baseCommit 未改（ADR-004，§5.9 G2）；
                                           // 只决定是否传入项目的声明性资源，Pi 的项目信任在 M1 恒为假（`11` §11.8.1，ADR-202）
  projectResources?: { skills: string[]; prompts: string[]; themes: string[]; systemPrompt?: string; appendSystemPrompt?: string }; // trusted 时由 Supervisor 枚举（`11` §11.8.1）；
                                           // systemPrompt/appendSystemPrompt 是 base 树中文件的内容，不是路径（ADR-203）
}

export interface ResumeSpec extends Omit<RunSpec, "sessionId" | "opening"> {
  sessionFile: string;            // 要继续的 Pi JSONL
  opening?: RunOpening;           // 例如 tower.resume / tower.rework / tower.handback（§5.8）
}

/** ADR-135/143：由 Tower 发起的回合以 tower.* custom message 开始；只有人亲手写的文字（Goal 描述、转向、回答）以 user 角色出现。
 *  tower 按 Goal.pendingOpenings（OpeningRef[] = {id, decisionId} | {id, factId}，ADR-144）的顺序依次投递，消息 details.key = OpeningRef.id；
 *  队列中组装进本次开场的 id 在 run.started 事件的同一事务中被消费（ADR-145/184：之后撤回该 id 返回 already_delivered，组装之后追加的留给下一个 Run；组装期间撤回返回 E_BUSY，崩溃后按 details.key 对会话去重——唯一时序规则在 06 §6.4.3，ADR-183）：除最后一条外都 triggerTurn:false；最后一条在 human 为空时 triggerTurn:true 开始 run，
 *  否则也 triggerTurn:false，随后以 prompt(human) 开始。 */
export interface RunOpening { tower: TowerMessage[]; human?: EngineInput }
export interface TowerMessage { customType: `tower.${string}`; content: string; details?: unknown }

export interface EngineInput {
  text: string;                   // 已带 Tower 标记行（§5.7.2）
  images?: { mimeType: string; data: string }[];
  towerKeys?: string[];           // 本消息携带的 CommentId / AnswerId，用于回执匹配
}

export type Disposition = "started" | "queued" | "handled";   // 与 Pi 的 PromptDisposition 相同（agent-session.ts:311-312）

export interface RunHandle {
  runId: RunId; goalId: GoalId; hostId: string; adapter: AdapterKind;
  sessionId: string; sessionFile?: string;   // Pi 在第一条 user/assistant 消息之前不创建文件（§5.9 G19）
}

export interface EngineState {                // 字段与 RpcSessionState 对齐（rpc-types.ts:96-109）
  isStreaming: boolean; isCompacting: boolean;
  model?: { provider: string; id: string }; thinkingLevel: string;
  sessionFile?: string; sessionId: string;
  pendingMessageCount: number; messageCount: number;
  leafId: string | null;
}

export interface EngineStats {                // SessionStats（agent-session.ts:343-360）
  tokens: { input: number; output: number; cacheRead: number; cacheWrite: number; total: number };
  costUsd: number;
  contextUsage?: { tokens: number | null; contextWindow: number; percent: number | null };
}

export type UiAnswer =
  | { kind: "option"; optionId: string; text?: string }
  | { kind: "text"; text: string }
  | { kind: "cancel"; reason: "human" | "timeout" | "obsolete" };

export interface EngineAdapter {
  readonly kind: AdapterKind;
  capabilities(): Promise<EngineCapabilities>;

  start(spec: RunSpec): Promise<RunHandle>;
  resume(spec: ResumeSpec): Promise<RunHandle>;

  /** 引擎空闲时启动新的 agent run。流式输出中调用则抛 EBUSY；请改用 steer/followUp。
   *  SDK 实现（D59，ADR-183）：AgentSession.prompt 返回 Promise<void>、在整个 run 结束后才 resolve，处置只经 PromptOptions.preflightResult 回调给出；
   *  因此以该回调 resolve 本 Promise（handled / queued / started），不等待 session.prompt 的 Promise；回调之前 session.prompt 的 rejection 即预检失败
   *  （如认证失败，按 06 F7 ② 处理），回调之后的 rejection 只作为该 run 的错误事件处理。
 *  延迟分支（D59，ADR-184）：扩展与公开的 agent_settled 处理期间（_isEmittingAgentSettled）调用的 prompt 被推迟、立即 resolve 而不回调；
 *  因此适配器只在公开 agent.settled 的监听器返回之后（下一个事件循环）调用 prompt / sendCustomMessage{triggerTurn}，不在监听器内同步调用。 */
  prompt(h: RunHandle, input: EngineInput): Promise<Disposition>;
  /** 在当前 assistant turn 的工具调用结束后、下一次 LLM 请求前投递（agent-session.ts:2232-2247）。 */
  steer(h: RunHandle, input: EngineInput): Promise<Disposition>;
  /** 只在 agent 本将停下时投递（agent-loop.ts:302；agent-session.ts:2249-2263）。 */
  followUp(h: RunHandle, input: EngineInput): Promise<Disposition>;
  /** ADR-135：投递 tower.* custom message。SDK：session.sendCustomMessage(msg, {triggerTurn})（agent-session.ts:2318-2353；空闲且 triggerTurn:true 时开始 run，
   *  并像用户消息一样触发 before_agent_start，types.ts:949-957）。RPC：Tower 把消息写入 runDir/pending/<id>.json 后发送 prompt("/tower-inject <id>")，
   *  tower-goal 注册的命令处理器读取并调用 pi.sendMessage（§5.6.1、D55）。 */
  inject(h: RunHandle, msg: TowerMessage, opts: { triggerTurn: boolean }): Promise<void>;
  /** 中止 run（含重试、压缩、分支摘要），并等待空闲（agent-session.ts:2464-2474）。不清空队列。 */
  abort(h: RunHandle, opts?: { clearQueue?: boolean }): Promise<{ clearedTexts: string[] }>;

  answerUi(h: RunHandle, uiRequestId: string, answer: UiAnswer): Promise<void>;

  getEntries(h: RunHandle, sinceEntryId?: string): Promise<{ entries: EngineEntry[]; leafId: string | null }>;
  getTree(h: RunHandle): Promise<{ tree: EngineTreeNode[]; leafId: string | null }>;
  /** 需要 treeNavigation。只能在空闲时调用；pi 在流式输出时会抛错（agent-session.ts:3998-4005）。 */
  navigate(h: RunHandle, targetEntryId: string, opts?: { summarize?: boolean; label?: string }): Promise<{ cancelled: boolean }>;
  /** 需要 forkSession。parentSession 链接由引擎写入新会话的头部。 */
  fork(h: RunHandle, entryId: string, opts?: { position?: "before" | "at" }): Promise<{ cancelled: boolean; sessionFile?: string }>;
  /** 新开会话，并链接到父会话（ADR-015，用于上下文过长时的交接，§5.8）。 */
  newSession(h: RunHandle, opts: { parentSession?: string; input: EngineInput }): Promise<RunHandle>;

  getState(h: RunHandle): Promise<EngineState>;
  getStats(h: RunHandle): Promise<EngineStats>;
  compact(h: RunHandle, instructions?: string): Promise<void>;
  /** 只改本会话的模型，永远不写全局默认值（§5.9 G5）。 */
  setModel(h: RunHandle, provider: string, modelId: string, thinking?: string): Promise<void>;

  subscribe(h: RunHandle, fn: (e: EngineEventEnvelope) => void): () => void;
  /** 优雅关闭：SDK 走 runtime.dispose()；RPC 先关闭 stdin（退出码 0），超时后 SIGTERM（退出码 143）。 */
  dispose(h: RunHandle, opts?: { graceMs?: number }): Promise<void>;
}
```

### 5.2.2 规范化事件 `TowerEngineEvent`

```ts
export interface EngineEventEnvelope {
  hostId: string; hostEpoch: number;   // Host 每次进程启动 epoch+1
  hostSeq: number;                     // Host 内单调递增；Supervisor 用它做 ack 和去重（06 §6.6.5）
  runId: RunId; at: number;            // Host 时钟，epoch ms
  ev: TowerEngineEvent;
}

export type TowerEngineEvent =
  // ── run 生命周期 ──
  | { t: "run.ready"; sessionId: string; sessionFile?: string; model?: ModelRef; thinking?: string; engineVersion: string }
  | { t: "agent.start" }
  | { t: "agent.end"; willRetry: boolean; lastStopReason?: string; errorMessage?: string }
  | { t: "agent.settled"; aborted: boolean }
  | { t: "turn.start" }
  | { t: "turn.end"; stopReason?: string; toolCallIds: string[] }
  // ── 消息 ──
  | { t: "msg.start"; role: "user" | "assistant" | "custom" | "toolResult" | "system"; text?: string; customType?: string }
  | { t: "msg.delta"; kind: "text" | "thinking" | "toolcall"; contentIndex: number; delta: string; toolName?: string } // 不写日志
  | { t: "msg.end"; role: string; message: unknown; usage?: UsageLite; stopReason?: string }
  // ── 工具 ──
  | { t: "tool.start"; toolCallId: string; parentToolCallId?: string; toolName: string; args: unknown }
  | { t: "tool.update"; toolCallId: string; partial: unknown }   // 只保留最新值，不写日志
  | { t: "tool.end"; toolCallId: string; parentToolCallId?: string; toolName: string; isError: boolean;
      durationMs?: number; content?: unknown; details?: unknown; structuredContent?: unknown }
  // ── 队列、压缩、重试 ──
  | { t: "queue"; steering: string[]; followUp: string[] }
  | { t: "compaction.start"; reason: "manual" | "threshold" | "overflow" }
  | { t: "compaction.end"; reason: string; aborted: boolean; willRetry: boolean; error?: string; tokensBefore?: number }
  | { t: "retry.start"; source: "agent" | "summary"; attempt: number; maxAttempts: number; delayMs: number; error: string }
  | { t: "retry.end"; source: "agent" | "summary"; success: boolean; attempt?: number; finalError?: string }
  // ── 会话数据 ──
  | { t: "entry"; entry: EngineEntry }                           // entry_appended（tower.* 自定义条目等）
  | { t: "session.changed"; sessionFile?: string; sessionId: string; reason: "start" | "resume" | "fork" | "navigate" | "new" } // 合成事件
  | { t: "model.changed"; model?: ModelRef; thinking?: string }  // 合成事件（RPC 没有原生事件）
  | { t: "session.name"; name?: string }
  // ── 扩展 UI ──
  | { t: "ui.request"; uiRequestId: string; method: "select" | "confirm" | "input" | "editor";
      dialog?: TowerDialog; title: string; options?: string[]; timeoutMs?: number }
  | { t: "ui.notify"; level: "info" | "warning" | "error"; message: string }
  | { t: "ui.status"; key: string; text?: string }
  // ── 进程健康 ──
  | { t: "engine.error"; source: "extension" | "adapter" | "stderr"; message: string; extensionPath?: string; event?: string }
  | { t: "engine.exit"; code: number | null; signal: string | null; stderrTail: string }
  | { t: "heartbeat"; rssMb: number; loopLagMs: number };
```

规范化规则：

1. **顺序**：一个 Run 内的事件顺序与 Pi 发出顺序一致。SDK 侧，`session.subscribe` 的监听器是同步调用的（`agent-session.ts:1040-1044`），Host 收到即写入发送队列。RPC 侧按 stdout 行序处理。
2. **`msg.delta`/`tool.update`** 只进入 coalescer（`06` §6.5），不写入 EventLog（`02` §2.13）。
3. **RPC 的 `message_update` 是线上精简形态**：只有 `{type, usage, assistantMessageEvent}`，不带累计消息（`CA/src/modes/json-event.ts:17-61`）。两个 adapter 都只从 `assistantMessageEvent.delta` 生成 `msg.delta`，以 `msg.end.message` 为准。
4. **`session.changed`/`model.changed`** 由 adapter 合成：SDK 在 runtime 替换并重新绑定后合成；RPC 在相关命令返回后执行 `get_state`、比较差异再合成（§5.4.5）。
5. **`summarization_retry_*`**（`agent-session.ts:223-236`）映射为 `retry.*{source:"summary"}`。`summarization_retry_finished` 没有字段（`:236`），来源按最近一次 `summarization_retry_attempt_start` 的 `source` 区分（`:230-235`）：`compaction` 时 `retry.end{success}` 由随后的 `compaction_end`（有无 `errorMessage`）推出（ADR-183）；`branchSummary`（带摘要的树导航，没有 `compaction_end`）时由导航本身的结果推出——`navigateTree` 以 `cancelled:false` 返回即成功，返回 `cancelled`/`aborted` 或摘要失败时抛出（`:4095-4100`）即失败，RPC（M2）下以 `/tower-nav` 的完成确认为准（D55，ADR-184）。
6. **`bash_execution_update`** 属于用户 `!` bash（`agent-session.ts:237`），Tower 从不使用，直接丢弃。
7. **Pi → 中立类型的映射**只在 adapter 内部做（`pi-mapping.ts`）：`SessionEntry` → `EngineEntry`（`type` → `kind`，`message.role` → `role`）；`AgentMessage` → `msg.end.message`，保留为不透明对象。Supervisor 的 Observer 按 `toolCallId` **合并** `tool.start` 与 `tool.end`：参数取自 `tool.start.args`，结果取自 `tool.end` 的 `details`、`structuredContent`、`isError`。`tool_execution_end` 不带参数（`agent-loop.ts:919-928`）。`tool.start.args` 是模型给出的原始参数（`agent-loop.ts:541-549`），**看不到**门禁注入的 `timeout` 以及之后任何处理器的修改。实际执行的输入以 tower-goal 带外记录的 `tower.obs.inputHash` 为准（§5.6.5）。对 `details` 的解释（例如 `edit` 的 `patch`）放在 `observer-pi` 插件里，以后 ACP adapter 会有自己对应的插件。

---

## 5.3 `pi-sdk` 实现（默认）

### 5.3.1 Host 启动序列

**准备阶段时限**（ADR-149/150）：从准入通过到 `run.started` 的步骤顺序以 `10` §10.3.1 为唯一定义。**仓库准备**（镜像、项目锁、fetch、LFS 补齐、卫星 `clone --shared` 与检出）以 `prepare.repoTimeoutMin`（15 分钟）为限，不计入 120 s，失败 → `prepare_failed`（ADR-151）；被 `lfs.fetchexclude` 排除的 LFS 文件在卫星中保持指针（Fact `lfs_excluded{count}`），简报 `brief.md` 中写明“以下 LFS 文件按项目配置未下载，内容是指针：<数量与路径前缀>”，避免 Agent 把指针当成内容（ADR-153）。**依赖物化不阻止 Run**：失败或超过 `prepare.depsTimeoutMin`（15 分钟）时照常进入 `running`，记 Fact `prepare{ok:false}`，开场附安装器日志尾部——注入前经 `11` §11.7 的同一套脱敏（模式匹配，以及覆盖 Tower 知道的全部机密的精确匹配集合：密钥库条目、模型提供商密钥、安装器第 1 阶段从用户级 `~/.npmrc` 读出的注册表认证行（ADR-165/166/167），ADR-150/151/152；Tower 从不接触 git 网络命令的凭据（ADR-157，`06` §6.2 GitService）；这些命令的输出只进诊断日志、从不进入开场）。**120 s 时限**只计 Host 启动与握手（SDK 的会话创建；RPC 的 `get_state` 握手与 `get_commands` 检查；含 Host 启动之前的静态清单计算，其中全局根查询另有 60 s 时限，§5.10，ADR-215）与开场组装与投递（ADR-151）（下文各步自身的超时，如 RPC 握手 20 s，都计入其中）。这些步骤失败或超时 → `paused(prepare_failed)`（`06` §6.2.4；不是 `engine_crash`，不 `autoResume`）。重试从已完成的步骤继续，各步骤幂等（ADR-150）。

```
Supervisor                       Main                         Engine Host (utilityProcess)
    │ host.spawn(goalId) ─────────►│ utilityProcess.fork(host.js)│
    │                              │ MessageChannelMain ────────►│ (port2)
    │◄──────── port1 ──────────────│                             │
    │ cmd:start(RunSpec) ────────────────────────────────────────►│ ① ensure cwd 存在（否则 ENOCWD）
    │                                                             │ ② settings = guarded SettingsManager (§5.3.3)
    │                                                             │ ③ services = createAgentSessionServices({cwd, agentDir,
    │                                                             │      settingsManager（projectTrusted:false）,
    │                                                             │      resourceLoaderOptions:{extensionFactories, 项目声明性资源路径}})
    │                                                             │ ④ runtime = createAgentSessionRuntime(factory,
    │                                                             │      {cwd, agentDir, sessionManager: SessionManager.create(cwd, sessionDir, {id})})
    │                                                             │ ⑤ bind(): session.bindExtensions({uiContext: TowerUIContext,
    │                                                             │      mode:"rpc", commandContextActions, onError}); subscribe
    │◄──────────────────────────── evt run.ready ─────────────────│
    │ cmd:prompt(opening.human) / prompt("/tower-inject <id>") ──►│ session.prompt(text, {source:"rpc"})
    │◄──────────────── evt agent.start / msg.* / tool.* … ────────│
```

- `createAgentSessionServices` 的选项见 `CA/src/core/agent-session-services.ts:37-46`，函数体见 `:135-154`。`createAgentSessionFromServices` 见 `:214-233`。runtime 用法见 `CA/examples/sdk/13-session-runtime.ts`。
- `bindExtensions` 选项见 `agent-session.ts:302-309`（`ExtensionBindings`）。我们传入 `mode: "rpc"`，因为 tower-goal 和用户扩展会用 `ctx.mode === "tui"` 判断是否可用终端组件（`docs/extensions.md` “UI and modes”）。`"rpc"` 正好表示“有对话框、没有终端组件”。
- **人写的文字不经命令分派**（ADR-190）：SDK 下 `opening.human` 以 `session.prompt(text, {source:"rpc", expandPromptTemplates:false})` 发送（`agent-session.ts:316, 2058-2069`），以 `/` 开头的目标描述不会被当作扩展命令执行、也不展开为提示模板，原样作为 user 消息进入会话；只有 Tower 自己的 `/tower-inject <id>` 按默认值分派。
- **MCP 继承用户的 Pi 配置**（ADR-032）。SDK 不会自动加载内置的 MCP、codemode、tool_search 扩展（`CA/docs/sdk.md:116`）。Host 用 `builtin: true` 的命名条目提供这三个扩展的代码：`{name:"mcp", factory: createMcpExtension({createTransport: towerMcpTransport}), builtin: true, replaceable: true}`，codemode、tool-search 同理（不带工厂选项）（工厂导出见 `CA/src/index.ts:410-414`，CLI 的同款登记见 `CA/src/extensions/index.ts:7-14`）。这样它们与 CLI 的行为**完全一致**（清单确认之前与 `riskTier=high` 时这三项都不加载，§5.10，D46；例外是 SDK 下 MCP 的传输由 Tower 提供，stdio 服务器的环境与工作目录与 CLI 不同，§5.3.5，ADR-214；注册 `/mcp` 而取代内置 MCP 的用户扩展启用期间 Tower 不开 Run，§5.3.5“内置 MCP 的来源自检”，ADR-215）：
  - 默认加载；用户 `extensions` 设置里写了 `-builtin:mcp` 就不加载；
  - 用户在 `~/.pi/agent/mcp.json` 里配置了服务器才会连接，没有配置就什么也不做；
  - 它们作为文件型资源参与排序，所以仍排在 inline 的 tower-goal 之前（G32）。
  - CLI 的第四个内置扩展 `llama.cpp` 的工厂没有从包根导出（`CA/src/index.ts` 中找不到），所以 SDK 模式下没有这个扩展；依赖本地 llama.cpp provider 的用户请改用 pi-rpc。这一项列为上游 PR 候选（§5.11.1）。

  Tower 不另设 MCP 开关。MCP 工具的结果一律视为不可信内容，MCP 服务器一律视为“对外通信”能力（`11` §11.8）。契约测试 C21 覆盖。
- **每次替换 runtime 后都要重新绑定**（`newSession` / `switchSession` / `fork`，`agent-session-runtime.ts:196-300`）：先取消旧订阅，再对 `runtime.session` 执行 `bindExtensions` 和 `subscribe`，然后发出 `session.changed`。替换只由 Tower 发起；SDK 下扩展命令经命令上下文请求的重载、新建、分叉、切换与树导航一律被拒绝（§5.3.5 `commandContextActions`，R61-D5-01）；RPC（M2）下 Pi 照常执行它们，M2 的设计要求见 §5.4.5 末段（ADR-190/191）。

### 5.3.2 恢复（resume）与缺失 cwd

```ts
const sm = SessionManager.open(spec.sessionFile, spec.sessionDir, spec.cwd);  // 第 3 个参数 cwdOverride（session-manager.ts:1766-1791）
```

即使会话头记录的 cwd（旧卫星路径）已不存在，也能继续使用这个会话。CLI 遇到这种情况会以退出码 1 退出（`CA/src/main.ts:697-707`）。`runtime.switchSession(path, {cwdOverride})` 同样接受 cwd 覆盖（`agent-session-runtime.ts:196-211`）：先以 `cwdOverride` 打开，再 `assertSessionCwdExists`，所以覆盖到存在的新路径时可以通过。Host 在同一 runtime 内切换会话时用这个参数；跨 Host 恢复则新建 runtime。Supervisor 在恢复前仍要先执行 `GitService.ensureSatellite`（ADR-008）。

### 5.3.3 设置写入防护（guarded settings）

Pi 有多个会写入全局 `~/.pi/agent/settings.json` 的 setter（§5.9 G5）。SDK 模式下，我们从存储层面杜绝这些写入：

```ts
// SettingsStorage 的结构（settings-manager.ts:164-166）：withLock(scope, fn(current) => next | undefined)
class ReadThroughSettingsStorage {
  private overlay = new Map<"global" | "project", string>();
  constructor(private globalPath: string, private projectPath: string, private onSuppressed: (scope: string) => void) {}
  withLock(scope: "global" | "project", fn: (current: string | undefined) => string | undefined): void {
    const current = this.overlay.get(scope) ?? readIfExists(scope === "global" ? this.globalPath : this.projectPath);
    const next = fn(current);
    if (next !== undefined && next !== current) { this.overlay.set(scope, next); this.onSuppressed(scope); }  // 不落盘
  }
}
const settingsManager = SettingsManager.fromStorage(storage, { projectTrusted: false }); // :323-335；M1 恒为假（`11` §11.8.1，ADR-202）
```

- `SettingsManager.fromStorage` 是公开的静态方法。`SettingsStorage` 类型不从包根导出（`CA/src/index.ts:309-322`），所以我们按结构实现这个接口。
- **`globalPath`**（唯一定义，ADR-211/212）：`join(<用户 agentDir>, "settings.json")`——M1 中每个 Run 的 agentDir 都是用户 agentDir（§5.3.6；隔离 agentDir 推迟到 M2，§5.10），与 Pi 自己的 `SettingsManager.create(cwd, agentDir)` 取法相同（`core/settings-manager.ts:308-319`）。Tower 传入自建的 `settingsManager` 时 Pi 不再按 `agentDir` 定位全局设置（`core/agent-session-services.ts:147`），所以必须在这里给出。清单确认之前与 `riskTier=high` 的 Goal 同样读用户设置（`shellPath`、`shellCommandPrefix` 因此与用户一致），只是不加载扩展（§5.10）。
- 每次写入被拦截都会产生 `engine.error{source:"adapter", message:"settings write suppressed: <scope>"}`，在调试面板中可见。契约测试 C10 断言测试期间全局文件的 mtime 不变。
- **`projectTrusted` 必须显式传入 `false`**。`SettingsManager.create` 的默认值是 `true`（`settings-manager.ts:333-335`），也就是说，SDK 在默认情况下信任项目内的 `.pi/` 资源。M1 中它恒为 `false`，Tower 也不传 `resolveProjectTrust`（不传时 Pi 沿用设置管理器的信任状态，`resource-loader.ts:520-528`）。§5.9 G2 的条件判定只决定是否传入 `spec.projectResources`，每次 start/resume 前重新求值（`11` §11.8.1，ADR-202）。

### 5.3.4 `TowerUIContext`

`ExtensionUIContext` 的定义见 `types.ts:149-300`。Pi 的 `noOpUIContext` 不导出（`CA/src/core/extensions/runner.ts:331`），因此我们完整实现该接口，参照 `rpc-mode.ts:136-311` 的空实现写法。

| 方法 | Tower 实现 |
|---|---|
| `select(title, options, opts)` | 生成 `ui.request{method:"select"}`。如果 title 以 `tower:` 开头（§5.6.4），携带解析后的 `dialog`。返回 Supervisor 的应答；`opts.timeout` 或 `opts.signal` 触发时返回 `undefined`，与 RPC 语义一致（`rpc-mode.ts:91-131`） |
| `confirm` | 同上，超时或取消时返回 `false` |
| `input(title, placeholder, opts)` | 同上；**Tower 对话框统一走 `input`**（§5.6.4） |
| `editor` | 同上，不支持超时（与 RPC 一致，`rpc-mode.ts:254-271`）。tower-goal 不使用 |
| `notify` | `ui.notify` |
| `setStatus` | `ui.status`（只转发 `tower.` 前缀的 key，其余丢弃） |
| `setWidget` / `setTitle` / `setEditorText` / `pasteToEditor` | 丢弃 |
| `custom()` | 返回 `undefined`（与 RPC 一致，`rpc-mode.ts:228-231`）。用户扩展里依赖 `custom()` 的功能在 Tower 中不可用，会在“扩展诊断”中列出 |
| `setTheme` | `{success:false}` |
| 其余终端相关方法 | 空实现 |

Pi 会把我们的 UIContext 包装一层，在阻塞对话框前后发出扩展事件 `ui_prompt_start` / `ui_prompt_end`（`runner.ts:573, 593`；类型 `types.ts:1039-1055`）。因此任何扩展（包括用户自己的扩展）发起的对话框都会经过 `TowerUIContext`，并作为 Needs-You 呈现，不会悄悄卡住。

### 5.3.5 Host 骨架

```ts
// engine-host/src/sdk-run.ts（节选）
const extensionFactories: InlineExtension[] = [
  // 内置扩展：builtin 条目，行为与 CLI 一致（遵守用户的 -builtin:* 设置，ADR-032）
  { name: "codemode", factory: createCodemodeExtension(), builtin: true, replaceable: true },
  { name: "tool-search", factory: createToolSearchExtension(), builtin: true, replaceable: true },
  { name: "mcp", factory: createMcpExtension({ createTransport: towerMcpTransport }), builtin: true, replaceable: true },   // R5-D5-02，见 §5.3.5“仍在沙箱之外的路径”
  // tower-goal 必须是数组最后一项：inline 扩展最后加载（resource-loader.ts:781），gate 因此看到最终输入（ADR-024，G32）
  { name: "tower-goal", factory: createTowerGoal({ configPath: join(spec.runDir, "tower-goal.json"), bridge }) },
];
const services = await createAgentSessionServices({
  cwd: spec.cwd, agentDir: userAgentDir, settingsManager, modelRuntime,   // userAgentDir：§5.3.6 唯一定义（ADR-210）；每个 Run 都用它，与 Host 环境的 PI_CODING_AGENT_DIR 是同一个值（§5.3.6 “Pi 运行开关”，ADR-211/212）；§5.10
  resourceLoaderOptions: {
    extensionFactories,
    noExtensions: spec.resources.noExtensions,         // 清单确认之前与 riskTier=high 时为 true（§5.10）：只保留 CLI/inline 扩展，用户扩展、包中的扩展与 builtin 条目（mcp、codemode、tool-search）
                                                       // 都不加载（resource-loader.ts:577-578）；其余情况必须为 false
    noContextFiles: !spec.resources.contextFiles,
    noSkills: !spec.resources.skills,
    // 项目的声明性资源以显式路径传入，不受 Pi 的项目信任控制（resource-loader.ts:276-313, 599-676）；untrusted 时为空（`11` §11.8.1，ADR-202）
    additionalSkillPaths: spec.resources.skills ? spec.projectResources?.skills ?? [] : [],
    additionalPromptTemplatePaths: spec.projectResources?.prompts ?? [],
    additionalThemePaths: spec.projectResources?.themes ?? [],
    // 项目 SYSTEM.md/APPEND_SYSTEM.md 以内容经 override 传入，不经 resolvePromptInput 的“路径或文字”判定（resource-loader.ts:167-182, 659, 671-673；ADR-203）；
    // 与 Pi 信任项目时相同，项目文件取代用户级同名文件、不合并。未给出时 Pi 读用户级 SYSTEM.md（resource-loader.ts:1213-1225）
    systemPromptOverride: spec.projectResources?.systemPrompt !== undefined ? () => spec.projectResources!.systemPrompt : undefined,
    appendSystemPromptOverride: spec.projectResources?.appendSystemPrompt !== undefined ? () => [spec.projectResources!.appendSystemPrompt!] : undefined,
  },   // 不传 resourceLoaderReloadOptions.resolveProjectTrust：Pi 的项目信任沿用 settingsManager 的 false（resource-loader.ts:520-528）
});
// 内置 MCP 的来源自检（唯一定义见下文同名一条，ADR-215）：资源加载已完成（agent-session-services.ts:78, 154），会话尚未创建，
// 内置 MCP 要到 session_start 才连接服务器（extensions/mcp/index.ts:1114），所以在内置 MCP 管理的任何服务器启动之前判定
// （取代者自己的工厂此前已在资源加载中运行，见下文同名一条末句，ADR-216）
const mcpOwner = services.resourceLoader.getExtensions().extensions.find((e) => e.commands.has("mcp"));   // types.ts:2268-2284
if (mcpOwner && mcpOwner.path !== "builtin:mcp") failPrepare({ kind: "mcp_replaced", extension: mcpOwner.path });
// ADR-041：沙箱 bash 以 customTools 注入。工具注册表的写入顺序是“内置 → 扩展工具（扩展之间先注册者胜）→ customTools”，
// customTools 最后写入，压过一切同名定义（agent-session.ts:3529-3553，v1.2.0 行号；runner.ts:636-646）
// R4-D2-01：传入 operations 时 Pi 会忽略 shellPath（v1.2.0 bash.ts:248：options?.operations ?? createLocalBashOperations({shellPath})），
// 所以用户的 shellPath 由 Tower 在构造 sandboxedOps 时自行解析：getShellConfig(shellPath)（CA/src/index.ts:496 导出，utils/shell.ts:67）
const sandboxedOps = createSandboxedBashOperations({                      // Tower 自己的实现：在 Seatbelt / bwrap 包装中启动；环境与 Run 令牌见下方说明（ADR-142/144）
  shell: getShellConfig(settingsManager.getShellPath()),                  //   用户 shell（与内置 bash 同一来源）
  profile: s2Profile(spec),                                               // 11 §11.6.2
});
const sandboxedBash = createBashToolDefinition(spec.cwd, {                 // CA/src/index.ts:343
  operations: sandboxedOps,
  spawnHook: (ctx) => ({ ...ctx, env: bashEnv(ctx.env) }),                // bashEnv 唯一定义在 §5.3.6：白名单过滤；PI_* 只保留 Pi 在 spawnHook 之前重设的五个会话变量，不按前缀（bash.ts:185-206）
  commandPrefix: settingsManager.getShellCommandPrefix(),                 // ADR-066：与内置 bash 取自同一设置（agent-session.ts:3642-3653，发布版 ±≤5）
  exposeSessionEnvironment: true,                                         // 默认即 true（bash.ts:221, 250）
});
// ADR-220（R92-D11-01）：文件工具 read / edit / write 同样以 customTools 注入，Tower 的 operations 把每次文件操作交给在同一 S2 档位中运行的
// 文件辅助进程（按次启动、在档位中执行的系统命令：一次 read 一次启动、write 一次、edit 两次；16 MB / 10 s；规格唯一定义 11 §11.3.1 使用时强制，ADR-221/222）。接口：ReadOperations{readFile, access, detectImageMimeType?}、
// EditOperations{readFile, writeFile, access}、WriteOperations{writeFile, mkdir}（read.ts:48-55、edit.ts:83-90、write.ts:27-32；工厂与类型由 CA/src/index.ts:336-392 导出）
const fileOps = createSandboxedFileOperations({ profile: s2Profile(spec) });  // Tower 自己的实现；S0 下没有档位，在 Host 中直接执行（11 §11.3.1 残余 (iii)；16 MB 上限照样适用，10 s 超时不适用，ADR-222）
// ADR-223：缓存按调用作用域——下面三个定义的 execute 由 Tower 包装，每次调用以 fileOps 新建的 operations 构造该次的工具定义（11 §11.3.1）
const sandboxedFileTools = [
  createReadToolDefinition(spec.cwd, { operations: fileOps.read,            // read.ts:86-92
    autoResizeImages: settingsManager.getImageAutoResize() }),               // ADR-221：与内置 read 取自同一设置（agent-session.ts:3636, 3647；read.ts:65, 90）
  createEditToolDefinition(spec.cwd, { operations: fileOps.edit }),          // edit.ts:143-147
  createWriteToolDefinition(spec.cwd, { operations: fileOps.write }),        // write.ts:44-48
];
// R4-D5-04：customTools 由 runtime 工厂在每次创建会话时传入；newSession / fork / switchSession 都会再次调用工厂
// （agent-session-runtime.ts 中各处 createRuntime(...)），因此工厂内部每次都按当前 cwd 重新构造 sandboxedBash 与 sandboxedFileTools
// R61-D11-01：Tower 支持的 Pi 内置工具是固定白名单（唯一定义 11 §11.3.4 工具来源）。v1.2.0 的其余内置工具（allToolNames，tools/index.ts:96-105；
// powershell 不传 operations 时在本地、不经沙箱执行，tools/powershell.ts:32, 55；grep 直接派生 rg、不经 operations，grep.ts:119-168；
// find、ls 在 M1 的任何阶段都不需要，ADR-220）以 excludeTools 移出注册表：不进入 getAllTools()，
// 用户或可信项目的 defaultTools（sdk.ts:282, 294）、扩展的 setActiveTools（只认已注册的工具，agent-session.ts:1518-1522）与 executeTool
// （:1566-1571）都无法启用它（过滤点 :1541-1545, 3536-3539；reload 沿用同一过滤）。allToolNames 不从包根导出，按固定的 Pi 版本列出，升级时由 C28a 与 lint (T) 核对
const TOWER_BUILTINS = ["read", "bash", "edit", "write"];                        // 生效定义恒为下面 customTools 中的 <sdk:read|bash|edit|write>（ADR-220）
const NON_TOWER_BUILTINS = ["powershell", "grep", "find", "ls"];                 // = v1.2.0 allToolNames − TOWER_BUILTINS
const { session } = await createAgentSessionFromServices({ services, sessionManager, customTools: [sandboxedBash, ...sandboxedFileTools],
  excludeTools: NON_TOWER_BUILTINS });                                           // agent-session-services.ts:61-64, 227-230
// 启动自检（ADR-041/066/220）：生效的 bash、read、edit、write 必须来自 <sdk:…>（customTools 写为 <sdk:name>，agent-session.ts:3529-3553）。
// SDK 下 customTools 必胜，此检查是防 Pi 未来改变优先级的回归保护
for (const name of ["bash", "read", "edit", "write"]) {
  const info = session.getAllTools().find((t) => t.name === name);
  if (info?.sourceInfo.path !== `<sdk:${name}>`) downgradeToS0(`${name} overridden by ${info?.sourceInfo.path}`);
}
// 命令上下文动作（唯一定义，R61-D5-01）：只供扩展命令的处理器使用（types.ts:2239-2259；不传时是返回成功的空操作，runner.ts:553-570）。Pi 的 RPC
// 模式把它们接到真实的重载与 runtime 替换（rpc-mode.ts:322-343），扩展又可以在 Run 中途触发自己的命令（agent-session.ts:2053-2068, 2390-2420）；
// 而静态清单确认、项目信任、来源自检与处理器顺序只在 Run 开始时复核。所以 SDK 下会改变会话的五个动作一律拒绝，整个 Run 中会话只由 Tower 自己
// 替换或导航（§5.3.1 末条、10 §10.8）；每次拒绝记 engine.error{source:"adapter", message:"command action refused: <name>"}（同 §5.3.3）
const refuse = (name: string) => async () => { adapterError(`command action refused: ${name}`); return { cancelled: true }; };
const commandContextActions: ExtensionCommandContextActions = {
  waitForIdle: () => session.waitForIdle(),                                      // 与 RPC 模式相同
  newSession: refuse("newSession"), fork: refuse("fork"), navigateTree: refuse("navigateTree"), switchSession: refuse("switchSession"),
  reload: async () => { adapterError("command action refused: reload"); throw new Error("reload is not available during a Tower run"); },
};   // reload 返回 void，只能以抛错告知；Pi 把它转为 extension_error{extensionPath:"command:<命令名>"}（agent-session.ts:2156-2163），只进诊断（§5.5）
// Tower 自己替换 runtime 后（§5.3.1），本对象随新的 runtime.session 重建再传给 bindExtensions，waitForIdle 不引用旧会话（同 rpc-mode.ts:317-318 先更新 session）
// 第 ⑤ 步：bindExtensions 发出 session_start 并完成 extendResourcesFromExtensions（agent-session.ts:3283-3306）；扩展可以在 session_start 中
// 或之后调用 registerTool，注册后立即刷新注册表（loader.ts:289-300；docs/extensions.md:183，examples/extensions/dynamic-tools.ts）
await session.bindExtensions({ uiContext: TowerUIContext, mode: "rpc", commandContextActions, onError });
// Tower 工具的来源自检（唯一定义，ADR-187/188）：扩展之间先注册者胜（runner.ts:636-646，按扩展在列表中的位置、不按注册时间），inline 的
// tower-goal 排在全部文件型与 builtin 扩展之后（resource-loader.ts:778-781），所以用户扩展注册的同名工具会遮蔽 Tower 工具。在 bindExtensions
// 返回之后执行，session_start 中注册的同名工具也被检出：本阶段要激活的每个 Tower 工具（§5.6.2），生效来源必须是 tower-goal 的
// <inline:tower-goal>（resource-loader.ts:1145）；不符时不开 Run → paused(prepare_failed)（03 §3.2.1），卡片写出注册该名字的扩展。
// Run 中途注册的同名工具由 gate 第 1 步在每次调用时复核（§5.6.5，ADR-188）
const shadowed = towerToolsOfPhase(spec.phase).filter((n) => session.getAllTools().find((t) => t.name === n)?.sourceInfo.path !== "<inline:tower-goal>");
if (shadowed.length > 0) failPrepare({ kind: "tower_tool_shadowed", names: shadowed });
```

`bridge` 只在 SDK 中存在。它是一个进程内对象，通过闭包提供 `readBrief()` / `readSituation()` 等函数。行为与 RPC 下读取文件完全相同，只是省去了 IO。tower-goal 对两者的处理没有分支（§5.6.1）。

**沙箱 bash 的接线与自检**（ADR-041，R2-D5-01）：
- **SDK**：沙箱 bash 由 Host 作为 `customTools` 注入，**不由 tower-goal 注册**。这样，“gate 是最后一个 `tool_call` 处理器”（tower-goal 位于数组末尾）与“沙箱 bash 胜过所有同名定义”（customTools 最后写入）两个要求不再冲突。
- **Run 令牌**（ADR-142/144，取代以 pid、启动时间、进程组识别进程的规则）：每个 Run 生成 128 位随机令牌 `TOWER_RUN_TOKEN`。令牌由 `createSandboxedBashOperations` 的 **`exec` 实现自身**加入环境，**不依赖 `spawnHook`**：`exec(command, cwd, {env?})` 以 `(env ?? bashEnv(getShellEnv()))` 再加令牌构造子进程环境（`getShellEnv` 不在 v1.2.0 包入口导出，Tower 在 Host 内实现等价函数；Host 的环境本身已是白名单，ADR-177）。原因（v1.2.0 核实）：工具路径上 `exec` 收到的是 `spawnHook` 改写后的环境（`tools/bash.ts:178-211`、`364-369`）；但 `user_bash` 路径（`!cmd` 与 RPC `bash`）经 `executeBashWithOperations` 调用 `operations.exec(command, cwd, {onData, signal})`，**不带 `env`、不经 `spawnHook`**（`bash-executor.ts:121`），Pi 自带实现此时回落到完整进程环境（`tools/bash.ts:115`）——Tower 的 `exec` 不回落，两条路径都得到白名单环境与令牌。两条路径使用同一工厂创建的**两个** `BashOperations` 实例（工具路径 `sandboxedOps`、`user_bash` 路径 `userBashOps`，ADR-144 补记 2/147），各自记录自己直接启动的 pid，Tower 据此区分进程树。**语义**：人经 Pi 输入的命令（M2 RPC 才有，SDK 下 Tower 不提供 `!cmd`）派生的进程同样带令牌，视为本 Run 的进程（settle 时一并终止）；其写入的归属登记在 `10` §10.3.1 归因表。命令仍以 `detached` 启动、自成进程组（`tools/bash.ts:112-118`），按组终止不会波及 Host。持久化的只有令牌（`06` `runs.process_token`）。识别、终止与已登记窗口见 `06` §6.1.10。
- **RPC**：tower-goal 在**加载期**用 `pi.registerTool` 注册沙箱 bash（加载期允许 `registerTool`）。`-e` 扩展最先加载，扩展之间又是先注册者胜，所以它会胜出。但加载期调用 `pi.getSettings()` 会抛错（v1.2.0 `loader.ts:158, 178`：加载期 `getSettings` 是 `notInitialized`），所以 shell 与 `commandPrefix` 的解析**推迟**到 `session_start`：从 `pi.getSettings()` 读取 `shellCommandPrefix`/`shellPath`（`types.ts:1772`）。`shellPath` 要先按 Pi 的规则规范化：展开 `~`、取绝对路径，与 `SettingsManager.getShellPath()` 的 `normalizePath` 一致（`settings-manager.ts:971-972`），然后用 `getShellConfig` 构造沙箱 shell。注册的工具定义在 `execute` 中惰性取用这份已解析的配置；`session_start` 之前如果有调用（理论上不会），一律报错并阻断。
- **自检**：Run 开始前读取生效的 `bash` 定义的 `sourceInfo`（`ToolInfo.sourceInfo`，`types.ts:2122-2130`）。
  - **SDK**：用 `session.getAllTools()`，必须是 `<sdk:bash>`；`read`、`edit`、`write` 同样必须是 `<sdk:read>`、`<sdk:edit>`、`<sdk:write>`（ADR-220）。customTools 最后写入，正常情况下必然成立，所以这个自检只是**回归保护**：防止 Pi 将来改变工具优先级。
  - **RPC**：tower-goal 在 `session_start` 中、以及每次 `tool_call` 时调用 `pi.getAllTools()`（`types.ts:1769`），复核 bash 是否仍属于 tower-goal 的扩展路径。在 v1.2.0 的“先注册者胜”规则下（`runner.ts:636-646`），后加载的 `registerTool(bash)` 不可能取代 tower-goal 的 bash，所以这项复核与 SDK 一样**只是回归保护**：防止 Pi 将来改变优先级（R4-D5-03）。结果通过 `appendEntry("tower.selfcheck", …)` 告诉 Host。
  - 不符合时，这个 Goal 的沙箱档位**降为 S0**：UI 能力摘要显示“沙箱被扩展 X 覆盖 → S0”，ADR-022 的 S0 授权路径生效，并记哨兵 `bash_overridden`（severity 2，Needs-You `sentinel`，`11` §11.4，ADR-201）；`read`、`edit`、`write` 的来源不符用同一哨兵与同一文案（ADR-221）。这种情况只可能在 RPC 下出现：SDK 下 customTools 必胜，四个工具的检查都只是回归保护。
  - 契约测试 C28 按适配器分为两条：C28a（SDK：customTools 胜过扩展同名 bash、`powershell` 不在注册表中，fork 和 newSession 之后的会话同样成立）、C28b（RPC：tower-goal 的 bash 胜过后加载的扩展；用桩替换 `getAllTools` 来模拟“Pi 改变了优先级”，复核能检出并降为 S0）。
- **用户 bash 被取代**（ADR-066）：静态清单（§5.10）发现注册名为 `bash` 的用户扩展时，确认卡片上明示“该扩展的 bash 将被 Tower 的沙箱版本取代，在 Tower 中不生效”。
- **文件工具同样被取代**（ADR-220）：`read`、`edit`、`write` 是 Tower 以导出的工厂构造、以 `customTools` 注入的版本，文件操作由 S2 中的文件辅助进程执行（唯一定义 `11` §11.3.1 使用时强制）；注册了这三个名字的用户扩展与 `bash` 一样被取代，注册了 `grep`、`find`、`ls`、`powershell` 的被 `excludeTools` 按名字移出（`agent-session.ts:3536-3539`），静态清单的确认卡片同样明示。RPC（M2）中由 tower-goal 以 `registerTool` 注册这三个工具，随 M2 复审。
- **Tower 工具不可被遮蔽**（ADR-187）：Tower 工具由 tower-goal 注册，不走 `customTools`（gate 与这些工具同在 tower-goal 中，tower-goal 必须是最后一个扩展）。因此 Tower 不改加载顺序，而是在 Run 开始前（`bindExtensions` 返回之后）做来源自检（唯一定义见上方骨架），Run 中途注册的由 gate 第 1 步逐次复核（§5.6.5，ADR-188）：用户扩展注册了同名工具时不开 Run（中途注册时阻断该调用并暂停），进入 `paused(prepare_failed)`，卡片 `启动失败：扩展 <名字> 注册了与 Tower 工具同名的 <工具名>，请在 Pi 设置中禁用该扩展`（中途注册时 Run 已开始，写 `运行已停止：…`，`04` §4.8.11，ADR-189）。静态清单的文本扫描提前标出这类扩展。门禁对被遮蔽的工具仍按来源归 `tool.external`（`11` §11.3.4），自检只是让 Run 不在无法提交的状态下开始。RPC（M2）中 tower-goal 以 `-e` 最先加载、先注册者胜，`session_start` 的同一复核只是回归保护。
- **内置 MCP 的来源自检**（唯一定义，ADR-215；`11` §11.3.4、§11.8.2、T4、T16 引用；与上一条 Tower 工具的来源自检同一模式）：Pi 的内置 MCP 是“可取代”的——另一个扩展注册了它在加载时注册的名字（v1.2.0 中只有命令 `mcp`，`extensions/mcp/index.ts:1260`；MCP 工具在连接之后才注册）时，资源加载略去内置 MCP，只留一条警告（`extensions/index.ts:9-13`、`core/resource-loader.ts:115-150`；Pi 文档：注册 `/mcp` 的扩展取代内置 MCP，Pi 不再读 `mcp.json`、不再连接其中的服务器，`docs/mcp.md:264-266`）。这时 `towerMcpTransport` 不存在，服务器的工作目录与环境由那个扩展决定，下文“stdio 服务器的工作目录”与 `mcpBaseEnv` 都不生效。所以 Host 在资源加载之后、会话创建与 `session_start` 之前（见上方骨架）检查：已加载的扩展中注册命令 `mcp` 的，只能是路径为 `builtin:mcp` 的 Tower 条目（`core/source-info.ts:15`）；用户设置了 `-builtin:mcp` 而没有别的扩展注册它时没有 MCP，照常开 Run。不符时不开 Run → `paused(prepare_failed)`（`03` §3.2.1），卡片 `启动失败：扩展 <名字> 取代了 Pi 内置的 MCP（注册了 /mcp），Tower 对 MCP 服务器的保护在它之下不生效；请在 Pi 设置中禁用该扩展`。静态清单的文本扫描提前标出可能注册 `/mcp` 命令的扩展，确认卡片写“该扩展取代 Pi 内置的 MCP，M1 中不可用：启用期间 Tower 不能启动运行”（§5.10，`00` §0.5.1）。不加载扩展的 Run（清单确认之前、高风险 Goal，§5.10）不受影响。这一检查只针对 Pi 的取代机制；扩展以别的方式自己启动的子进程（含它自己连接的 MCP 服务器）属于 `11` §11.8.2 残余中“用户确认的那段代码的行为”——取代者自己的工厂在资源加载中、这一检查之前就已运行（Pi 只建议工厂“只注册”，`core/extensions/types.ts:2058-2065`），它在工厂中做的事同属这一残余，所以“在任何 MCP 服务器启动之前”只对内置 MCP 管理的服务器成立（ADR-216）。交接与恢复时运行时重建，这一检查（与上一条 Tower 工具的来源自检）随之再跑（C21）：交接时不通过，新会话不创建、Run 停止，按运行中途停止的一种进入 `paused(prepare_failed)`（`03` §3.2.1，`06` F4b），卡片写 `运行已停止：…`，`重试` 是开新的运行（ADR-217）。RPC（M2）随 M2 复审。
- **用户 bash 同样进沙箱**（R4-D2-03）：tower-goal 注册 `pi.on("user_bash", …)`，在 S2 下返回 `{operations: userBashOps}`（与工具路径的 `sandboxedOps` 同一工厂、同一 S2 档位与令牌，但是**另一个实例**，用于区分 `user_bash` 调用的进程树，ADR-147）。处理器结果类型见 `types.ts:1465-1476`，v1.2.0 同；RPC 的 `bash` 命令同样先调用 `emitUserBash`，并把返回的 `operations` 传给 `executeBash`（`rpc-mode.ts:561-582`，v1.2.0 同）。这样在 RPC 下，`!cmd` 和 RPC `bash` 也在 S2 中运行。SDK 下 AgentSession 本身不发 `user_bash`（只有 interactive 与 RPC 模式发，`interactive-mode.ts:7005`、`rpc-mode.ts:562`），而 Tower 的 UI 不提供 `!cmd`，所以 SDK 下这条路径不存在（`00` §0.5.1 能力差异表应写“Tower 不提供 `!cmd`”）。Pi 自带的 sandbox 示例用的是同一机制（`examples/extensions/sandbox/index.ts:229-231`）。**并发**（M2，ADR-146）：v1.2.0 中 `!cmd` 在 Agent 流式输出期间同样执行，只把 `bashExecution` 消息推迟到 `agent_end` 才写入会话（`executeBash` 无流式守卫，`agent-session.ts:3866-3894`；`recordBashResult` 在流式中推入 `_pendingBashMessages`，`3904-3924`），因此 `user_bash` 调用窗口可能与 Agent 工具调用窗口重叠：重叠期间写入的路径记为 `mixedPaths`；窗口内若有**不属于该 `user_bash` 调用进程树**的 Agent 进程仍存活（`sandboxedOps` 已知的直接 pid 及其后代，或令牌扫描得到的其他进程），写入同样记为 `mixedPaths`；只有两者都不成立时才按人的调用窗口归人（`06` §6.1.10，ADR-146/147）。S0 下处理器返回 `undefined`（本地执行）。`user_bash` 处理器出错时，Pi 会阻断该命令而不是回落到本地执行（`docs/extensions.md` “user_bash”），因此出错是安全的。
- **仍在沙箱之外的路径**（ADR-066，T16 的子项）：扩展的 `pi.exec`（`types.ts:1763`）和 MCP 服务器进程。Tower 自己从不使用 `pi.exec`。
  - **主防线**（ADR-081、ADR-089、ADR-096）：卫星工作目录中**没有 `.git`**（S2 禁止在任意深度创建），Host 环境设置 `GIT_CEILING_DIRECTORIES=<全部 wtRoot>`、不含 `GIT_DIR`，并经 `GIT_CONFIG_*`（受保护的配置作用域）注入 `safe.bareRepository=explicit`——仅禁止 `.git` 条目挡不住“裸仓库布局”的目录（`HEAD`+`objects/`+`refs/`），而 ceiling 只限制向上搜索（R7-D11-01）。这些进程在卫星的任何子目录中运行 git 都得到“不是 git 仓库”，读不到任何 Agent 可控的元数据。
  - **同一组 `GIT_CONFIG_*` 注入**：`safe.bareRepository=explicit`（ADR-096，主防线的一部分）；`core.fsmonitor=false`、`core.hooksPath=<Tower 空目录>`（ADR-072 第 4 点，纵深防御）。
  - **这些变量怎样到达子进程**（R5-D5-02，已核实 v1.2.0）：`pi.exec` 用不带 `env` 的 `spawn`，继承 Host 环境（`core/exec.ts:36-46`）。MCP 的默认 stdio 传输是 `{...process.env, ...serverEnv}`（`packages/mcp/src/transports/stdio.ts:94`；默认工厂 `extensions/mcp/runtime.ts:111-121`）。SDK 下 Tower 传入自己的 `createTransport`（`McpExtensionOptions.createTransport`，`extensions/mcp/index.ts:69-73`；它只在内置 MCP 生效时存在，被取代时不开 Run，见上文“内置 MCP 的来源自检”，ADR-215）：stdio 服务器用 `new StdioTransport({…, env: {...mcpBaseEnv, ...serverEnv}, inheritEnv: false})`（`@earendil-works/pi-mcp` 导出），其中 `mcpBaseEnv`（变量只在这里列出，`11` §11.7.1 云 SDK 凭据链一行、T28 与 C21 引用，ADR-231）= 基础白名单（§5.3.6 “Host 环境的变量” ①）+ 本 Host 的 `TMPDIR`（§5.3.6 临时目录一行，ADR-225）+ 代理与 `NODE_EXTRA_CA_CERTS`（同处 ⑤）+ `GIT_CEILING_DIRECTORIES` + `GIT_CONFIG_*`（含 `safe.bareRepository=explicit`），**不含** Host 的云凭据；④ 的包管理器位置变量不在其中，以 `npx` 启动的服务器读包管理器默认位置的配置（你设了 `NPM_CONFIG_USERCONFIG` 等时可能与终端不同；需要时在 `mcp.json` 的 `env` 中写明，如实登记）。**stdio 服务器的工作目录**（唯一定义，ADR-214；`11` §11.8.2、T4、T16 引用）：Pi 的连接以会话的工作目录（卫星）为 `cwd`（`extensions/mcp/index.ts:297`、`:1121`、`:570`），建立连接时把它作为第二个参数传给工厂（`runtime.ts:378`）；默认工厂以它为基准求 spawn 的 `cwd = resolve(cwd, config.cwd ?? ".")`（`runtime.ts:118`；`mcp.json` 的每个 stdio 服务器可写 `cwd`，相对路径相对会话工作目录，`core/mcp-servers.ts:86-87`）。`towerMcpTransport` 不以这个参数求 spawn 的 `cwd`：`config.cwd`（`~` 照常展开）是绝对路径时取它；是相对路径或未写时，以本 Host 的空目录 `~/.tower/mcp-cwd/<hostId>/` 为基准求出（`cwd = resolve(<本 Host 的空目录>, config.cwd ?? ".")`；每个 Host 进程一个，由 Tower 拥有，Host 启动之前新建为空、Host 退出后删除，从不在 Host 之间共享，唯一定义在 `11` §11.3.4“stdio MCP 服务器的空工作目录与相对路径”，ADR-215/216；它在 `~/.tower/**` 之下，三种沙箱都拒绝读写，`11` §11.6.2，沙箱外工具写它属于硬底线，`11` §11.3.3 第 3 条，ADR-214）；结果落在 Agent 可写的位置或 Tower 的数据目录之下（§5.3.6 “Host 环境不引用 Agent 可写的位置”的集合，加上任一 `<wtRoot>` 与 `~/.tower/` 之下的一切——含 Scratch 的工作目录与 `_verify`、`_inspect`、`_human`——本 Host 的空目录本身除外，其子目录不除外；按 `realpath` 比较，大小写不敏感的卷按该卷的规则比较，ADR-215）时不创建传输、抛出错误，Pi 把该服务器记为 `failed` 并带上错误文字（`runtime.ts:377-378`、`:348-351`、`:409-418`），文字为 `MCP 服务器 <名字> 的工作目录在 Tower 的工作区或数据目录之下，Tower 不启动它`，静态清单（§5.10）在该条目旁写同一句；扩展以 `pi.registerMcpServer` 注册的服务器经同一连接与工厂（`extensions/mcp/index.ts:345-363`），规则同样适用，但它们不在 `mcp.json` 中、不出现在静态清单上，只在运行时显示 `failed` 与这句文字（ADR-215）。相对的 `config.cwd`（含 `..`）一律以本 Host 的空目录为基准求出，按求出的目录判定、不按写法（ADR-217/218）：求出空目录本身的（如 `.`、`./`、`x/..`）以它为工作目录；求出其中的子目录的（该目录不存在），按同一句文字不启动；求出空目录之外的，除上述集合之外还不得落在 `11` §11.3.3 第 3 条硬底线之内（如你的主检出），落在其中的同样不启动，文字为 `MCP 服务器 <名字> 的相对工作目录落在受保护的位置，Tower 不启动它；请改写为指向你自己目录的绝对路径，不要指向你的仓库检出`；其余照常启动，与写成绝对路径的同一目录相同，门禁以求出的目录为基准（`11` §11.3.4 (b)）。需要其他工作目录时，请写指向你自己目录（不是你的仓库检出）的绝对路径。理由：包运行器（`npx`、`pnpm dlx`、`bunx`、`uvx`，`11` §11.3.2）按工作目录所在项目的配置与本地依赖决定实际执行哪个程序，卫星由 Agent 写，以它为工作目录会让 Agent 写的代码在沙箱外、无人批准地运行（S2 下；S0 下 Agent 的代码本来就以你的权限运行，见 `11` T23）。基准取空目录而不取主目录：相对路径不会因此扩大到你的整个主目录。服务器得到的 `roots` 仍是卫星：Pi 的连接以会话工作目录单独声明 `roots`（`runtime.ts:364`），与工厂无关，所以以 `roots` 为根的代码智能类服务器不受影响；`args` 中的相对路径（如 `.`）因此指向这个空目录，不再指向卫星；原先依赖会话工作目录的服务器须在 `mcp.json` 中写指向你自己目录的绝对 `cwd`（指向 Tower 的工作区或数据目录之下的不启动，`00` §0.5.1）。HTTP 服务器不涉及工作目录，照常加载。`~/.tower/mcp-cwd/<hostId>/` 不在 `GIT_CEILING_DIRECTORIES` 之下：依赖 git 的服务器在那里运行时可能向上发现你主目录中的仓库（如 dotfiles 仓库），那不是 Agent 可写的位置，与你在终端中从该目录运行 git 相同（ADR-215）。M2 的 RPC 无法替换传输（下文），须保持同一不变式，做法随 M2 复审。配置值的解析要按 Pi 的规则自行实现（D53，B 类）：`command`、`args`、`cwd` 只展开 `~`（恰为 `~` 或以 `~/` 开头的值，`runtime.ts:89-96`、`:116-118`）；`env` 的值解析 `${NAME}` 与 `!cmd`（`core/mcp-servers.ts:84`），不展开 `~`。**HTTP 服务器**（R7-D5-01，已核实 v1.2.0）：工厂签名是 `(entry, cwd, authProvider)`（`extensions/mcp/runtime.ts:59-63`），Pi 的连接对象按服务器构造 `authProvider`——OAuth 服务器取自 Pi 的 MCP OAuth 凭据存储（`createMcpAuthProvider({store: credentials.forServer(…)})`，`runtime.ts:185-195`），配置了 `auth.provider` 的服务器取 Pi 登录 provider 的令牌（`runtime.ts:196-198`），配置了 `Authorization` 头或 `auth` 的服务器不用 OAuth（`usesOAuth`，`runtime.ts:83-88`）——并在建立连接时传给工厂（`runtime.ts:378`）。Tower 的 `towerMcpTransport` 对 HTTP 分支必须**原样透传**第三个参数：`new StreamableHttpTransport({url, headers, authProvider})`（与默认工厂 `runtime.ts:104-109` 相同），否则需要 OAuth 的服务器在 SDK 宿主下失效。`headers` 中的 `$ENV`/命令引用按 Pi 的 `resolveHeadersOrThrow`（`core/resolve-config-value.ts`，未从包入口导出）规则自行解析（D53，B 类）。**RPC 下**无法替换用户 pi 的 MCP 传输：MCP 服务器继承 pi 子进程的完整环境（包括透传的云凭据）。这是 RPC 的残余风险，登记在 `11` T28。这些路径登记为 C 类依赖（§5.11.1 D50、D51），UI 能力摘要中如实列出。

### 5.3.6 Engine Host 环境与 bash 环境（ADR-049、ADR-033、ADR-060、ADR-063、ADR-067、ADR-055）

**两个环境要分开看**（ADR-049）：
- **Host 环境**：Pi 的 provider 在 Host 进程中读取它。
- **bash 环境**：Agent 的命令看到的环境。

默认情况下 bash 会继承 Host 的完整环境（`utils/shell.ts:138-150`；`tools/bash.ts:115, 193`）。Tower 的沙箱 bash 通过 `spawnHook` 改写环境（`bash.ts:186-211`），从 Host 环境中去掉只属于 Host 的变量。**`bashEnv`**（唯一定义，ADR-212；§5.3.5 骨架、C28a、`11` §11.4 与 §11.7.1 引用）：以 Pi 交给 `spawnHook` 的环境为输入——它以整个 Host 环境起步（`getShellEnv()` 展开 `process.env`，`utils/shell.ts:139-150`），只删除并重设五个会话变量（`core/tools/bash.ts:185-206`）——输出只含下表“bash 环境”一列给出的变量，外加这五个会话变量 `PI_SESSION_ID`、`PI_SESSION_FILE`、`PI_PROVIDER`、`PI_MODEL`、`PI_REASONING_LEVEL`；**不按 `PI_*` 前缀保留**，所以 Host 环境中的 Pi 运行开关 `PI_OFFLINE` 与 `PI_CODING_AGENT_DIR` 在这里被去掉。这个机制只覆盖 Tower 的 bash。其他扩展自己派生的子进程（例如 MCP 服务器）仍然继承 Host 环境，这一残余风险登记在 `11` 的威胁表中。

main 在 `utilityProcess.fork` 时显式传入 Host 的 `env`，不继承 main 自己的环境。

**Host 环境不引用 Agent 可写的位置**（唯一定义，ADR-213/214；`06` §6.2.4、`07` §7.4.3、`11` §11.7.1 与 §11.8.2、§5.3.5、§5.10 引用）：Host 进程环境与它的工作目录，以及 Host 为 stdio MCP 服务器选定的工作目录（§5.3.5 “stdio 服务器的工作目录”，ADR-214），都不指向 Agent 可写的位置（任一 Goal 的卫星与 gitdir、`$GS`、`$TMPDIR/tower-<goalId>`，`11` §11.6.2 写允许一行；打包模式下一个 Host 承载多个 Goal，`06` §6.1.1）；每次 `host.spawn` 拼装环境时检查，不只在首次运行时检查。指向这些位置的变量——例如角色 A 的 `NPM_CONFIG_USERCONFIG=$GS/npmrc` 与 `16` §16.8 的其余 A 列变量、Agent 的 `TMPDIR`——只由 `bashEnv` 与 Tower `exec` 的同一白名单加入 Agent 一侧。理由：Host 在沙箱之外运行包管理器——Pi 每次创建会话时，用户级 npm 来源不在 `<agentDir>/npm/` 下就以 `runCommandSync` 运行全局根查询（`core/package-manager.ts:2102-2130`、`:2143-2158`），环境是 Host 的 `process.env`，不传 `cwd`（`:16-33`、`:2752-2765`）；它的结果决定 Host 从哪里加载扩展包，所以它读到的配置不能由 Agent 改写。Host 的包管理器环境因此是**你自己的**：`PATH` 见下表 `PATH` 行；包管理器的位置变量（`NPM_CONFIG_PREFIX`、`NPM_CONFIG_USERCONFIG`、`NPM_CONFIG_GLOBALCONFIG` 的大小写两种写法与 `PNPM_HOME`）取最近一次从登录 shell 读到的值，有值才传入，取值落在 Agent 可写位置之下时不传入；其他会改变全局位置的变量（如没有 `PNPM_HOME` 时 pnpm 所用的 `XDG_DATA_HOME`、pnpm ≥ 11 的 `pnpm_config_*`）不传入，用到它们时 Tower 求出的全局根可能与你的终端不同；包管理器读取的配置文件是你自己的（如 `~/.npmrc`），Agent 不可写（S2 下；S0 下 Agent 的代码本来就以你的权限运行，见 `11` T23）；Host 的工作目录是你的主目录（`fork` 的 `cwd`），所以项目级的包管理器配置不参与这一查询。这些值与 `PI_CODING_AGENT_DIR` 一样在首次运行时读取，之后只在你于设置页选择“重新读取”时更新（不自动重新读取，见下文“首次运行检测”，ADR-209/214），整台机器同一个，不随项目或 Goal 变化（“重新读取”之后、此前启动的 Host 退出之前，新旧两个值同时在用，见下文，ADR-215）；Supervisor 的清单查询用同一环境（§5.10）。

| 来源 | 变量 | Host 环境 | bash 环境 |
|---|---|---|---|
| S2 读允许列表（ADR-082、ADR-091、ADR-100，`11` §11.6.2 为唯一来源） | 不是环境变量，在此一并说明 Agent 能读什么：本 Goal 的卫星与 gitdir、`$GS`、`$SH`、镜像库的 `objects/`、系统路径、垫片目录，以及 Pi 资源（`~/.pi/agent` 指用户 agentDir，见下“用户 agentDir 的取值”）：固定部分 `~/.pi/agent/{skills,prompts}/**`、`~/.pi/agent/{npm,git}/**/{skills,prompts}/**`、`~/.agents/skills/**`、卫星内的 `.pi/**`、`.agents/**`、卫星各祖先目录中的上下文文件（只放行名字集合，比较规则见 `16` §16.1.12“上下文文件名与受保护名字”）；**动态部分**（R8-D2-01）：每个 Run 启动时从用户级 Pi settings 解析出的 `skills`/`prompts` 路径（M1 中项目设置从不读取，ADR-202）（含任意自定义路径，`settings-manager.ts:1108` `getSkillPaths`），以及资源加载完成后（含扩展 `resources_discover` 返回的 `skillPaths`，`core/extensions/types.ts:723-735`；Pi 包清单 `pi.skills` 声明的任意子路径，`package-manager.ts:2241-2250`；临时包）Host 经 `session.resourceLoader.getSkills().skills[].baseDir`（`agent-session.ts:2452`、`resource-loader.ts:433`、`skills.ts:78`；v1.2.0 已核实）枚举到的已启用技能目录，取 `realpath` 后只读加入；`reload` 后重新枚举。排除规则：路径是 `$HOME` 本身或包含 `~/.tower`、`~/.ssh`、`~/.pi/agent/auth.json`、密钥路径表中的路径 → 不加入，技能标“不可用（路径过宽）”；**位于 `~/.pi/agent/extensions/**` 之内的 `baseDir`** 只加入该 `baseDir` 本身，扩展目录的其余文件仍拒绝读；`baseDir` 就是扩展根目录时不加入，技能标“不可用（与扩展配置同目录）”（两者都登记在 `00` §0.5.1）。技能脚本可以在沙箱中执行（写入与网络仍受 S2 限制）；`read` 工具读这些路径归动作类 `read.pi_resources`（silent）。`~/.pi/agent/extensions/**` 本身不在列表中（扩展由 Host 加载，ADR-100）。简报 `tower_goal` 段如实告诉 Agent：沙箱中 `/bin/ps` 等 setuid 二进制不可用（ADR-158），要查看自己的后台进程用 shell 的 `jobs` 或记录 pid；并写明“M1 中不会向你提供任何钥匙串中的机密；需要机密才能运行的检查是 human 标准，由人确认”（ADR-162）。所有运行 Agent 可影响内容的沙箱——Agent、验证器、检验检出——的 Seatbelt 配置拒绝钥匙串服务的查找（`com.apple.SecurityServer` 等 mach 服务，规则唯一在 `11` §11.6.2，ADR-163/164）；这一拒绝取决于 SP6a A8：若 A8 显示它会破坏常用工具，则取消该拒绝，只依赖钥匙串条目的访问控制列表（其他进程读取会触发系统授权提示），因此凭据读取类命令读不到 Tower 的钥匙串条目 | — | — |
| **Host 环境的变量**（唯一定义，ADR-230；`11` §11.7.1 Engine Host 环境一行、`06` §6.2.4 与 §5.3.5 `mcpBaseEnv` 引用） | Host 进程环境只含下列变量，每次 `host.spawn` 拼装，此外一律删除：① **基础白名单**：`PATH`（取值见下 `PATH` 行）、`HOME`、`USER`、`LOGNAME`、`SHELL`、`LANG`、`LC_*`、`TERM`，以及工具链变量 `JAVA_HOME`、`GOPATH`、`NVM_DIR`、`CARGO_HOME`、`RUSTUP_HOME`、`VOLTA_HOME`（与 ④ 中的 `PNPM_HOME` 合为 `16` §16.8 “继承的工具链定位变量”同一组；取值规则与 ④ 相同：取最近一次从登录 shell 读到的值——首次运行记录，设置页“重新读取”替换，见下“首次运行检测”——有值才传入，落在 Agent 可写位置之下时不传入，ADR-231；其他工具链变量不传入，Host 派生的 MCP 服务器与扩展子进程看不到它们，偏严，ADR-230；用户可见的说明见 `00` §0.5.1 与 §5.10 的确认卡片）；② Host 自己的 `TMPDIR`（下一行）；③ Pi 运行开关 `PI_OFFLINE`、`PI_CODING_AGENT_DIR`（下“Pi 运行开关”行）；④ 你的包管理器位置变量 `NPM_CONFIG_PREFIX`、`NPM_CONFIG_USERCONFIG`、`NPM_CONFIG_GLOBALCONFIG`（大小写两种写法）与 `PNPM_HOME`（取值规则见上文“Host 环境不引用 Agent 可写的位置”）；⑤ 代理变量与 `NODE_EXTRA_CA_CERTS`（下“代理”行，ADR-231）；⑥ `GIT_CEILING_DIRECTORIES`（下“git 发现与垫片”行）与 `GIT_CONFIG_COUNT`、`GIT_CONFIG_KEY_0`–`GIT_CONFIG_KEY_2`、`GIT_CONFIG_VALUE_0`–`GIT_CONFIG_VALUE_2`（下 `GIT_CONFIG_*` 行）；⑦ 经首次运行确认的云 SDK 凭据链与 API Key 类 provider 的非机密变量（指向文件的变量、配套变量与配置变量；变量名与取值只以 `11` §11.7.1 “云 SDK 凭据链”一行为准，ADR-227/228）。没有由用户另行放行的一类。按 Goal 或 Run 变化的变量——下文的端口与 Tower 标识——不在 Host 环境中：Host 跨 Run 存活、打包模式下承载多个 Goal（`06` §6.1.1、§6.1.8），它们只经每个 Run 的 `bashEnv`、Tower `exec`、验证器与检验的环境传入（`10` §10.19） | 见左 | ① ✔（其余各类见各行） |
| **临时目录**（唯一定义，ADR-224；`06` §6.1.6 与 §6.6.1、`07` §7.2.2、`09` §9.12.4、`11` §11.3.3 与 §11.7.1 引用） | `TMPDIR` | **每个 Host 进程一个 Tower 拥有的临时目录 `~/.tower/tmp/<hostId>/`**（0700）：Supervisor 在 `host.spawn` 时、Host 进程启动之前把它建为空目录，经 Host 环境的 `TMPDIR` 交给该 Host；该 Host 进程退出（含崩溃）后删除，启动恢复时删除不属于存活 Host 的残留——新建、删除、同一 `hostId` 的后继进程与删除失败时不 spawn，都与本 Host 的 stdio MCP 空目录同一规则（唯一定义在 `11` §11.3.4 (a)，ADR-216/217/218），从不在 Host 之间共享。Pi 的输出文件一律经 `utils/output-files.ts:17-27` 写在 `join(tmpdir(), …)`（`:19`）：bash 截断输出的全文（`core/tools/output-accumulator.ts:249`，前缀 `pi-bash`，`core/tools/bash.ts:424`）、MCP 截断结果的全文与二进制资源（`extensions/mcp/tools.ts:70-71`）、codemode 的溢出文本与图像（`extensions/codemode/execute.ts:338-341, 369`）；Node 的 `os.tmpdir()` 每次调用时读取进程环境，POSIX 上依次取 `TMPDIR`、`TMP`、`TEMP`，都没有时为 `/tmp`（Node 文档；本机 Node v26.10.0 实测），所以这些文件都落在本 Host 的目录中、随它删除。Host 派生的子进程（MCP 服务器、扩展的 `pi.exec`、全局根查询）继承同一 `TMPDIR`。它在 `~/.tower/**` 之下：三种沙箱都拒绝读写（`11` §11.6.2），文件工具、bash 中路径能求出的命令与沙箱外工具读写它属于第 3 条硬底线，先于密钥路径表判定、不出读取凭据卡（`11` §11.3.3 分类的先后，ADR-225）；所以 Pi 工具结果中的 `Full output: <path>` 提示对 Agent 不可用（S2 与 S0 相同，`00` §0.5.1）。删除在 Supervisor 处理完该 Host 已转发的 `tool_execution_end` 之后进行，`07` §7.2.2 对这些调用的复制不因 Host 退出而落空（ADR-225）；打包模式下长寿 Host 的这一目录在它退出之前没有上限（超时命令的全文也留在其中），不在 `13` §13.11.3 的磁盘统计之内（如实保留）。Pi 以 jiti 加载扩展、只设 `moduleCache: false`（`core/extensions/loader.ts:576-579`），jiti 的文件缓存通常落在 `os.tmpdir()` 之下、随本目录删除，所以每次 Host 启动可能都重新转译扩展，开销以 SP2 的 Host 启动测量为准（`14` §14.2）；`hostId` 保持短：它进入 `TMPDIR`，macOS 上 Unix 套接字路径限 104 字节（ADR-225） | **Agent 的临时目录 `$TMPDIR/tower-<goalId>/`**（S2 可写，`11` §11.6.2 写允许一行；取值见 `16` §16.8 角色 A 的 `TMPDIR` 行）：由 `bashEnv` 显式设置、不取 Host 的值，文件辅助进程与 Tower `exec` 同一白名单。本文档集中的 `$TMPDIR` 指你的系统临时目录（main 进程环境中的 `TMPDIR`，macOS 上为 `/var/folders/…/T/`），不是 Host 的 `TMPDIR` |
| 代理（ADR-049、ADR-067） | `HTTPS_PROXY`、`HTTP_PROXY`、`NO_PROXY`、`ALL_PROXY`（大小写两种写法）；`NODE_EXTRA_CA_CERTS`（ADR-231） | Host 与 Supervisor 是 Tower 自己的可信进程，**直接**使用用户代理（ADR-079）：模型请求、`git push`、`gh pr create` 都如此。**模型请求怎样经过代理**（唯一定义，ADR-232/233）：Pi 只在 CLI 的入口安装全局分发器——`configureHttpDispatcher` 以 undici 的 `EnvHttpProxyAgent` 调用 `setGlobalDispatcher`，并以 undici 的 `fetch` 替换全局 `fetch`（`core/http-dispatcher.ts:81-113`），每个入口都**无条件**调用它，调用处只有 `cli/setup.ts:12`、`main.ts:597, 875`、`rpc-entry.ts:11` 与交互模式（`interactive-mode.ts:2063, 5014`）；它不从 `index.ts` 导出，包的 `exports` 只有 `.` 与 `./rpc-entry`——SDK 嵌入的 Host 不经过这些入口，而 Node 的全局 `fetch` 默认不读代理变量（`packages/ai/src` 中只有 Bedrock 自己按代理变量建 agent，`api/bedrock-converse-stream.ts:226-227`）。所以 **Host 启动时总是（不论 Host 环境中有没有代理变量，ADR-233）在任何模型请求与 MCP 连接之前，以 Tower 自己的代码安装与 `configureHttpDispatcher` 相同的分发器**：undici 的 `EnvHttpProxyAgent`（没有代理变量时即直连的 agent），选项与 Pi 相同——`allowH2: false`（只用 HTTP/1.1）、`proxyTunnel: true`、连接尝试时限 `autoSelectFamilyAttemptTimeout` 2 s（Node 默认的 250 ms 会中断高延迟线路上的正常连接，`http-dispatcher.ts:5-6, 86-98`）、`bodyTimeout` 与 `headersTimeout` 取空闲超时，以及吞掉 undici 内部 `error` 事件的同一监听（`:52-79`）；以 `setGlobalDispatcher` 安装，并同样调用 `undici.install()`，使全局 `fetch` 与分发器出自同一份 undici（`:100-112`）。**空闲超时**取你 Pi 设置中的 `httpIdleTimeoutMs`，经 §5.3.3 的受保护设置读取（`settingsManager.getHttpIdleTimeoutMs()`；`projectTrusted:false` 下只取用户设置；未设置时为 Pi 的默认 300 000 ms，`disabled` 为 0、不限时，`settings-manager.ts:900-901`、`http-dispatcher.ts:4, 8-35`），**两处读取**（ADR-234）：分发器在 Host 启动时读一次（Pi 的 CLI 同样在启动时读取，`main.ts:875`），之后的改动从下一个 Host 起生效；Pi 的 SDK 会话另在每次模型请求时读取同一设置作为请求时限（`core/sdk.ts:340-349`，`disabled` 换算为 2147483647，经 `:420-421` 成为厂商 SDK 的 `timeout`，如 `ai/src/api/anthropic-messages.ts:639-643`），读到的是该 Run 在步骤 ② 新建的受保护设置管理器载入时的值（`settings-manager.ts:304`）。所以 Host 存活期间的改动从该 Host 上的下一个 Run 起改变请求时限，分发器仍取 Host 启动时的值，两处时限中先到者起作用（等待响应头时，见下文请求时限的先后；如实登记：例如改为 `disabled` 之后，同一 Host 上的请求仍在 Host 启动时的空闲超时处中断，下一个 Host 起两者一致）。**请求时限的先后**（ADR-235）：SDK 的请求时限取 `options.timeoutMs ?? retry.provider.timeoutMs ?? 空闲超时`（`core/sdk.ts:344-350`）——你设置了 `retry.provider.timeoutMs` 时请求时限取它而不取空闲超时，分发器的空闲超时仍按 Host 启动时的值，等待响应头时同样先到者起作用；响应体开始流入之后只有分发器的 `bodyTimeout` 起作用——厂商 SDK 的 `timeout` 只包住到响应头为止的 `fetch`（Pi 所钉的 `@anthropic-ai/sdk` 0.129.0 `client.js:663-675`），Codex 的 SSE 传输同样只计到响应头（`ai/src/api/openai-codex-responses.ts:398, 409`）（ADR-236）；但 Codex 默认 `transport: "auto"`、走 WebSocket（`:295, 302`），那里 `timeoutMs` 是消息之间的空闲计时，流开始之后仍起作用（`:1392-1403`；ADR-237 更正 “只到响应头”）。**每个 Run 校验会造成重试循环的设置**（ADR-234/235）：Host 启动时读到无效的 `httpIdleTimeoutMs`（`settings-manager.ts:147-156`），与终端中的 `pi` 启动失败相同，Host 启动按 `06` §6.8 F4b 失败；此外适配器在每个 Run 的步骤 ② 之后，从该 Run 的设置管理器读取并校验以下设置，任一无效时该 Run 的准备按 F4b 失败（`prepare_failed`），不开会话：`httpIdleTimeoutMs` 与 `websocketConnectTimeoutMs`——`buildRequestOptions` 每次请求都经同一个 `parseTimeoutSetting` 读取（`core/sdk.ts:340-351`；`settings-manager.ts:147-156, 900-901, 934-936`），无效时抛出 `Invalid <名字> setting: …`，适配器以同一 getter 读取，抛出即无效；getter 接受任意有限的非负数（向下取整，含数字字符串，`http-dispatcher.ts:19-35`），没有上限——`retry.provider.timeoutMs` 未设置时 `httpIdleTimeoutMs` 原样成为请求时限（`core/sdk.ts:346, 350`，只把 0 换算为 2147483647），`websocketConnectTimeoutMs` 用作 Codex 的 WebSocket 连接时限；`retry.provider.timeoutMs`、`retry.provider.maxRetries` 与会话自动重试的 `retry.maxRetries`——Pi 不解析，原样交给厂商 SDK、`retryProviderRequest` 与会话的自动重试（`settings-manager.ts:891-898, 925-932`；`core/sdk.ts:350-352`），适配器要求设置时（JSON `null` 按未设置处理，与 Pi 以 `??` 取值相同；数字字符串的次数不接受，Pi 在比较中会把它转换为数，Tower 比 Pi 严格，如实登记）：`retry.provider.timeoutMs` 为正整数，两项次数为非负整数（ADR-236）；**上限**（三项相同，ADR-237）：`httpIdleTimeoutMs`、`websocketConnectTimeoutMs` 读到的值与 `retry.provider.timeoutMs` 都不得超过 2147483647（前两项的 0 与 `disabled` 仍为不限时），Host 启动时与每个 Run 都校验，超过时按 F4b、卡片原因同 `启动失败：Pi 设置 <名字> 无效`；**不设下限**（ADR-238）：取 1 ms 之类极小的正数时请求同样立即超时、按可重试的错误重试，耗尽后照常按 §5.9 进入 `provider_unavailable` 与探测——与终端中的 `pi` 相同，这是你的设置，Tower 不另判（如实登记）——`retry.provider.timeoutMs` 以 `??` 取值（`core/sdk.ts:350`，0 被保留）、原样成为厂商 SDK 的 `timeout`（`ai/src/api/anthropic-messages.ts:641`，OpenAI 类同），Pi 所钉的 `@anthropic-ai/sdk` 0.129.0 与 `openai` 7.19.0（`packages/ai/package.json`）的 `validatePositiveInteger` 只拒绝非整数（抛出 `timeout must be an integer`）与负数，0 被接受、以 `setTimeout(abort, 0)` 立即中止并报 “Request timed out”（前者 `internal/utils/values.js:48-56`、`client.js:668, 808`，后者 `internal/utils/values.js:47-55`、`client.js:996, 1146`），两种错误文本都命中 Pi 的可重试模式（`ai/src/utils/retry.ts:72-73`），结果正是下述循环；超过 2147483647 时 Node 的定时器按 1 ms 计，同此（厂商 SDK 以 `setTimeout(abort, ms)` 计时，前者 `client.js:668`、后者 `client.js:996`；Pi 自己把不限时换算为 2147483647，`core/sdk.ts:346`），三项都一样；Codex 类 provider 把 0 当作不限时（`ai/src/api/openai-codex-responses.ts:398`；其 `normalizeTimeoutMs` 只拒绝负数与非有限值，`:192-198`），Tower 同样拒绝——要不限时请不设置此项（如实登记）。不做这一校验时 Pi 的行为是：前两项使每次请求在读取时抛出，Pi 的 Agent 把它变成 `stopReason:"error"` 的消息（`packages/agent/src/agent.ts:526-547`），错误文本含 `timeout`、命中 Pi 的可重试模式（不区分大小写，`ai/src/utils/retry.ts:73, 253-258`），重试耗尽后落入 F6、再被 `provider_unavailable` 的探测解除、再失败；非数值的次数使 `retriesRemaining <= 0`（`ai/src/utils/provider-retry.ts:111-125`）或会话自动重试的 `_retryAttempt >= settings.maxRetries`（`core/agent-session.ts:1204`；`:3795` 为 `_retryAttempt > settings.maxRetries`，同样永不成立，ADR-237 更正；压缩与摘要所用的 `retryAssistantCall` 的 `attempt >= maxAttempts` 同此，`ai/src/utils/retry.ts:198, 218`、`core/compaction/compaction.ts:638`，ADR-236 更正引文）永不成立，可重试的错误一直重试。Run 中途设置被重新载入（`settings-manager.ts:498-523`）而变为无效时仍是 Pi 的这些行为（如实登记）；Pi 升级时按 §5.11.1 D63 比对 `buildRequestOptions` 读取的设置。**undici 只有一份**：Tower 的代码引用 Pi 所依赖的那一份（v1.2.0 为 8.10.2），不另装一份；Pi 的 `settings-manager.ts:11` 引入 `http-dispatcher.ts`、后者引入 undici（`:2`），所以 SDK 嵌入的 Host 同样加载它，而 undici 加载时全局分发器尚未设置就装上自己默认的、允许 HTTP/2 的 `Agent`（undici 8.10.2 `lib/global.js:14-16`、`lib/dispatcher/client.js:229-230`），Tower 的安装在其后、在任何请求之前取代它。模型请求与 HTTP 类 MCP 连接因此与终端中的 `pi` 一样：协议、连接时限与空闲超时相同，有代理变量时经过代理、遵守 `NO_PROXY`；Pi 升级时随 §5.11.1 D63 复核，契约测试 C43。Pi 设置中的 `httpProxy`（Pi 只在 CLI 中把它补成 `HTTP_PROXY`、`HTTPS_PROXY`，`main.ts:596, 874`、`http-dispatcher.ts:45-50`）在 Tower 中不读取：代理请设在登录 shell 的环境变量中（如实登记）。**企业 CA**（ADR-231）：TLS 拦截的代理要求 Node 信任企业根证书；Pi 不自己读取任何 CA 设置（v1.2.0 的 `packages/ai/src` 与 `packages/coding-agent/src` 中没有引用），Node 只在进程启动时读取 `NODE_EXTRA_CA_CERTS`，所以它必须在 Host 环境中：取最近一次从登录 shell 读到的值（首次运行记录，与代理一起告知，“重新读取”替换），指向的文件落在 Agent 可写的位置时不传入，首次运行写明 `NODE_EXTRA_CA_CERTS 指向 Tower 的工作区，不传入：经 TLS 拦截代理的模型请求会失败`。它随 ⑤ 进入 `mcpBaseEnv`（§5.3.5）。`SSL_CERT_FILE`、`SSL_CERT_DIR` 不传入：Node 只在以 `--use-openssl-ca` 启动时使用它们，Pi 也不读取 | S2：**只**出现沙箱代理的地址。沙箱代理（sandbox-runtime，固定版本）配置 `network.parentProxy = <静态上游>`；用户只有 PAC 时，按 ADR-079 解析出唯一上游，否则 S2 网络明确失败。上游认证 M1 只支持 Basic。用户代理变量不直接透传给 bash；S0：原样透传。`NODE_EXTRA_CA_CERTS` 不进入 bash（S2 中读不到主目录的 CA 文件，`00` §0.5.1） |
| 凭据 | 按 ADR-049 的凭据类型表处理：API Key 走运行时注入（其非机密配置变量——Azure OpenAI 的端点与版本、Cloudflare 的账号与 gateway id——原样传入 Host 环境、不进入 bash，变量表在 `11` §11.7.1，ADR-228）；云 SDK 凭据链（Pi 经 `ai/src/models.ts:757` 的 `resolveProviderAuth` 调用各 provider 的 `resolve` 判定，如 `ai/src/providers/amazon-bedrock.ts:54-79`、`google-vertex.ts:64-89`，D62；`ai/src/env-api-keys.ts` 只经 `compat.ts:23` 导出，不是 coding agent 的判定路径，ADR-227）由首次运行检测并经用户确认后提供，但**只传指向文件的变量与非机密的配套变量**（ADR-158 补记 2；变量表、AWS 总带 `AWS_PROFILE` 与区域的补齐唯一定义在 `11` §11.7.1 “云 SDK 凭据链”行，ADR-227）：`AWS_PROFILE`/`AWS_SHARED_CREDENTIALS_FILE`/`AWS_CONFIG_FILE`、`GOOGLE_APPLICATION_CREDENTIALS`（只有这几个，ADR-231/232），以及 `AWS_REGION`/`AWS_DEFAULT_REGION`、`GOOGLE_CLOUD_PROJECT`/`GCLOUD_PROJECT`、`GOOGLE_CLOUD_LOCATION`；原始密钥变量（如 `AWS_SECRET_ACCESS_KEY`、`AWS_SESSION_TOKEN`）**从不传入**——用户的配置提供原始变量时（含与 `AWS_PROFILE` 并存），Tower 把它们写入即时投递文件（`~/.tower/run/<hostId>/`，0600，Host 退出即删；只重启 Supervisor 时随存活 Host 保留，`06` §6.1.6，ADR-226；`11` §11.7.0），并以对应的文件变量传其路径（AWS 另传保留的 profile 名 `AWS_PROFILE=tower-<hostId>`；区域在每次 Host 启动时判定，`11` §11.7.1，ADR-228）；OAuth 用 `auth.json`；`auth.json`/`models.json` 中的 `$ENV` 引用先解析出变量名，再按类别处理；工具令牌（如 GitHub 令牌）在 M1 中**不导入**（ADR-165）；私有注册表令牌 Tower 不保存，安装器第 1 阶段每次只从用户级 `~/.npmrc` 读取认证行（`${VAR}` 以登录环境展开；项目 `.npmrc` 的认证行不读取，ADR-167）、以即时投递文件使用（只运行包管理器自身、不执行项目代码，ADR-166）；`VerifyProfile.env.vars` 中不能放机密（编辑时检查并拒绝保存，ADR-166） | 按类别 | **无** |
| 包管理器私有存储（ADR-021、ADR-063） | **唯一表在 `16` §16.8**，本文不重复列出。`bashEnv` 按项目的包管理器及其主版本加入角色 A 的配置：例如 pnpm ≤ 10 用 `npm_config_*`，≥ 11 用 `pnpm_config_*`；`NPM_CONFIG_USERCONFIG` 指向 Tower 为角色 A 生成的副本（`$GS`）。这些变量**不进入 Host 环境**（上文“Host 环境不引用 Agent 可写的位置”，ADR-213）。验证器（角色 V）的配置只存在 `$VS` 中，从不引用 Agent 可写的路径（ADR-061）。非 Node 项目按 ADR-064 设置各生态的私有用户目录 | —（只有你自己的包管理器位置变量，见上文） | ✔ |
| git（ADR-060、ADR-089） | **不设置**任何 `GIT_*` 对象目录变量（R3-D6-01）。Agent 的 git 使用卫星的**分离 gitdir** `<wtRoot>/_gitdirs/<goalId>`（ADR-081：卫星工作目录中没有 `.git`）。gitdir **整体归 Agent、可写**（ADR-089：取消 ADR-081 的写入白名单与 ADR-072 的控制文件保护；`revert`、`rebase`、`stash`、`bisect`、`gc` 都需要写它的内部文件）。安全边界只靠两条不变式：(a) S2 拒绝在卫星工作目录**任意深度**创建名为 `.git` 的条目（`^<卫星>/(.*/)?\.git(/|$)`；Seatbelt 规则中的路径先 `realpath`）；(b) 沙箱外进程不可发现卫星（`GIT_CEILING_DIRECTORIES`）。Tower **从不**读取卫星 gitdir 中的配置、索引或 ref 作为判定依据。gitdir 经 alternates 只读引用 **Tower 的 Project 镜像库** `~/.tower/projects/<projectId>/mirror.git`（ADR-073）。Tower 自己的 git 操作一律由 GitRunner 显式传参：`GIT_CONFIG_NOSYSTEM=1 GIT_CONFIG_GLOBAL=<Tower 最小配置> git --git-dir=<影子目录> --work-tree=<卫星> -c core.fsmonitor=false -c core.hooksPath=/dev/null -c core.sshCommand=false …`，运行在“只允许执行 git”的 OS 沙箱档位中（ADR-071）。Tower **从不在卫星 gitdir 上运行 git**（ADR-100）：seal 说明需要的 Agent 提交信息由 Tower 自行只读解析普通文件——`HEAD` → ref 文件或 `packed-refs` → 提交对象（loose 对象 zlib 解压，或按 `.idx` 在 pack 中定位），单对象 ≤ 1 MB、总计 ≤ 200 个提交，`O_NOFOLLOW`、带超时，不读 config、include、alternates；解析失败则省略。Tower 对卫星与 gitdir 的原始文件操作只有创建、整体删除、整体重建、只读解析提交对象四种，一律 `openat`/`O_NOFOLLOW`、只接受普通文件与目录、在旁路目录构造后 `rename` 原子替换（ADR-089） | — | — |
| `GIT_CONFIG_*`（ADR-096；ADR-072 第 4 点） | `GIT_CONFIG_COUNT=3`、`GIT_CONFIG_KEY_0=safe.bareRepository`、`GIT_CONFIG_VALUE_0=explicit`（主防线的一部分：沙箱外的 git 不隐式使用任何裸仓库，git ≥ 2.38，Tower 最低 2.40）、`GIT_CONFIG_KEY_1=core.fsmonitor`、`GIT_CONFIG_VALUE_1=false`、`GIT_CONFIG_KEY_2=core.hooksPath`、`GIT_CONFIG_VALUE_2=<Tower 空目录>`（后两项为纵深防御） | ✔（因此扩展 `pi.exec` 和 MCP 服务器派生的 git 同样生效） | ✔ |
| 端口（ADR-037、ADR-055） | `TOWER_PORT_BASE`、`PORT`（= base）、`TOWER_PORT_COUNT`（20）；端口段落在 20000–29999。另外还有 `VerifyProfile.env.vars` 中按模板展开的变量（`${port:N}`、`${portBase}`，例如 `DATABASE_URL=postgres://localhost:${port:5}/app`） | —（按 Goal 与 Run 变化，只经每个 Run 的 `bashEnv` 等传入，见上“Host 环境的变量”，ADR-230） | ✔ |
| Tower 标识 | `TOWER_GOAL_ID`、`TOWER_RUN_ID` | —（同上，ADR-230） | ✔ |
| **Pi 运行开关**（唯一定义，ADR-211/212；`11` §11.7.1、§11.8.2 引用） | `PI_OFFLINE=1`；`PI_CODING_AGENT_DIR=<用户 agentDir>`（与传给 `createAgentSessionServices` 的 `agentDir` 是同一个值；M1 中每个 Run 都用用户 agentDir，独立的隔离 agentDir 推迟到 M2，§5.10，ADR-212）。**`PI_OFFLINE`**：Pi 的资源加载在 Host 中自动安装用户设置 `packages` 里未安装、或已安装版本与设置不符的 npm/git 来源——`DefaultResourceLoader.reload()` 无条件调用 `packageManager.resolve()`，不带 `onMissing`（`core/resource-loader.ts:529`），没有 `onMissing` 时 `resolve()` 直接安装（`core/package-manager.ts:1308-1324`，含网络与包的生命周期脚本）；`reload()` 不接受 `onMissing`，SDK 没有对应选项，唯一的开关是这个变量（`:60-63`）。设为 1 后 Pi 在 Tower 中从不安装或更新包：缺失或版本不符的来源跳过、不加载（`:1325-1327`，git 来源 `:1338-1340`），临时 git 来源的刷新、`update` 与更新检查同样受它控制（`:1341`、`:2027`、`:1129`、`:1522`、`:1573`）；静态清单把它们单列为“未安装”（§5.10）。同一开关还关闭 `grep`/`find` 缺少 `rg`/`fd` 时的下载（`utils/tools-manager.ts:361`；Tower 不注册这两个工具，§5.3.5，ADR-220，所以这一项在 Tower 中不起作用）与模型目录的网络刷新（`core/model-runtime.ts:247`、`:859`；Tower 创建 `ModelRuntime` 时本就不传 `allowModelNetwork`，会话服务只做无网络刷新，`:251`、`core/agent-session-services.ts:194`，所以这一项在 Tower 中不改变实际行为：模型列表来自 Pi 内置目录与用户 agentDir 中由你自己的 `pi` 最近一次刷新的结果）。**`PI_CODING_AGENT_DIR`**：Tower 无法显式传入的 `getAgentDir()` 调用都随它解析到同一目录——内置 MCP 扩展的 `mcp.json`（`extensions/mcp/index.ts:1344`）、`mcp-auth.json` 及其锁目录（`extensions/mcp/oauth.ts:147-148`）、`mcp.log`（`index.ts:370`），以及工具二进制目录（`utils/tools-manager.ts:10`，模块加载时求值）；`McpExtensionOptions` 的 `loadConfig`/`credentials`/`logPath`（`index.ts:69-77`）因此不必传入。两项都在 `host.spawn` 时写入 Host 环境（§5.3.1）；它们对所有 Host 相同，不因 Goal、Run、`riskTier` 或清单是否确认而变（这些只决定每个会话的 `noExtensions`，§5.10），所以 Host 环境不因它们变化，打包模式（`06` §6.1.1）中同一 Host 的各 Goal 进程环境一致（ADR-212）；扩展集合（`noExtensions` 与清单哈希）不同的 Run 不在同一 Host 上开会话，见 `06` §6.1.1 打包的分组（ADR-232）。两项都不进入 bash 环境（由上文 `bashEnv` 去掉）与 MCP 的基础环境（§5.3.5 `mcpBaseEnv`）；用户扩展经 `pi.exec` 派生的子进程继承 Host 环境（`core/exec.ts:36-46`），会看到这两项——它若再启动 `pi`，同样离线、使用同一 agentDir，偏保守，不是泄漏 | ✔ | — |
| `PATH`（ADR-085） | 由 Tower 显式构造，不依赖 GUI 进程环境（macOS 从 Dock 启动的应用拿不到 shell 的 PATH）。**Host**（ADR-213/214）：最近一次从登录 shell 读到的 PATH 中的目录（首次运行时读取，之后只在设置页“重新读取”时更新，见下文“首次运行检测”；Agent 可写位置之下的目录与相对路径不收入）→ 系统路径，整台机器同一个值（重新读取之后的过渡见下文“首次运行检测”），所以 Host 中的 `npmCommand`、MCP 服务器与扩展的子进程找到的是最近一次读取时你终端中的同一套工具；其中没有 Node 时，以 `npx`/`node` 启动的 MCP 服务器与扩展的子进程失败（`00` §0.5.1）。**沙箱 bash**：只按 `16` §16.8 角色 A 的 `PATH` 行——最前为 Tower git 垫片目录（ADR-088），其后为 Tower 工具缓存中按 `.nvmrc` → `.node-version` → `volta.node` → `engines.node` → Tower 默认 LTS 选出的 Node 与包管理器（`$SH/tools/…`） | ✔（登录 shell 的目录） | ✔（最前为 git 垫片，其后为 Tower 按项目选出的 Node 与包管理器） |
| git 发现与垫片（ADR-081、ADR-088、ADR-090） | Host：`GIT_CEILING_DIRECTORIES=<全部 wtRoot>`，**不设** `GIT_DIR`/`GIT_WORK_TREE`。沙箱 bash：同样设 `GIT_CEILING_DIRECTORIES=<wtRoot>`（R6-D13-02：绝对路径调用的 git，如 `/usr/bin/git`、内置 git 的工具，在卫星中得到“不是 git 仓库”），**不导出** `GIT_DIR`/`GIT_WORK_TREE`。PATH 首位是 Tower 的 git 垫片（只读、Agent 不可写）；并设 `GIT_EXEC_PATH=<垫片 exec-path>`（ADR-097）：Tower 拥有的目录，内含指向真实 `git-core` 各辅助程序的符号链接，其中 `git` 换成垫片。git 为其派生进程把 exec-path 放在 `PATH` 最前，因此 `rebase -x`、钩子、`!` 别名中再次调用的 `git` 同样经过垫片（若 SP6b 证明不可行，按 ADR-097 备选登记为已知限制）。每次 Run 开始前比对真实 git 可执行文件与 `git --exec-path` 目录的指纹（路径 + 大小 + mtime），变化即重建垫片 exec-path（ADR-105，git 升级后辅助程序集合可能变化）。垫片对每次调用重新判定：① 在卫星工作目录内运行、未显式指定其他仓库、子命令不是 `init`/`clone` → 注入 `GIT_DIR=<wtRoot>/_gitdirs/<goalId>`、`GIT_WORK_TREE=<卫星>`；② **继承来的**、指向某个卫星 gitdir 的 `GIT_DIR`/`GIT_WORK_TREE`（例如 `rebase -x`、`bisect run`、钩子与测试中再次调用 git），视同垫片自己注入的值：子命令为 `init`/`clone`，或当前目录 / `-C` 目标在卫星之外时，**先移除**这两个变量再执行（ADR-090）；③ 只给了 `--work-tree`（或只继承了 `GIT_WORK_TREE`）而没有 gitdir 时，按 ②的规则移除继承值，由 git 自行发现（在卫星内会受 ceiling 限制而失败）；④ 其余原样执行。以绝对路径调用真实 git 且继承了这两个变量的情况无法拦截，但只会作用到本 Goal 自己的卫星（已知限制）。由于不变式 (a)，“在仓库目录树内 `git init` 测试夹具”在 S2 下必然失败（登记在 `00` §0.5.1） | ceiling；`GIT_CONFIG_*` 含 `safe.bareRepository=explicit` | ceiling；不含 `GIT_DIR`；PATH 首位为 git 垫片；`GIT_EXEC_PATH`=垫片 exec-path |

**provider 的 API Key 不进入任何环境**：
- **SDK**（ADR-158：模型提供商密钥不进入任何进程环境）：先 `ModelRuntime.create({authPath, modelsPath})`，再调用 `setRuntimeApiKey(provider, key)`——它只写入 `RuntimeCredentials` 的内存覆盖层，不写回 `auth.json`（v1.2.0 `model-runtime.ts:621-632`，同步过程 `599-619` 只做本地刷新；CLI 的 `--api-key` 走同一路径，`main.ts:831-839`）；用户自己 `auth.json` 中的 OAuth 登录照常读取，并且 Pi 判定该 provider 的凭据来自你的 Pi 配置（`auth.json` 或 `models.json`）时 Tower 不注入导入的密钥（先后的唯一定义在 `11` §11.7.1 模型凭据一行：以不带运行时覆盖的探查运行时的 `checkAuth` 询问，ADR-230/231）。**凭据来源**（唯一定义，ADR-208/212；`11` §11.8.2 引用）：`ModelRuntime` 以 `authPath = join(<用户 agentDir>, "auth.json")`、`modelsPath` 为用户 agentDir 中的 `models.json` 创建，与用户自己的 `pi` 是同一个路径字符串（清单确认之前与 `riskTier=high` 的 Goal 同样如此；M2 若恢复独立的隔离 agentDir，凭据仍取这里，ADR-208）（`core/auth-storage.ts:348-351` 只做 `~` 展开，不取 realpath，`utils/paths.ts:76-100`）。**用户 agentDir 的取值**（唯一定义，ADR-209）：Tower 按 Pi 的同一规则求出后显式传入，不依赖 Host 进程自己的环境（从 Dock 启动时它拿不到 shell 环境）——首次运行读取登录 shell 环境时（见下“首次运行检测”）一并读取 `PI_CODING_AGENT_DIR` 的取值，有值时取它并展开 `~`，否则为 `~/.pi/agent`，与用户终端中 `getAgentDir()` 的结果相同（`config.ts:605-611`，展开即 `normalizePath`，`:588-590`）；`authPath` 与 `modelsPath` 由它拼出后显式传入，Pi 因此不再以 Host 自己的 `getAgentDir()` 求默认值（`core/auth-storage.ts:348`，`core/model-runtime.ts:217-220`）；设置页显示所用路径；之后修改该变量，Tower 不会自动重新读取（已知限制，人可在设置页核对）。**同一个用户 agentDir 用于全部用户级 Pi 资源**（ADR-210/211/212）：每个 Run 传给 `createAgentSessionServices` 的 `agentDir`——Pi 以它定位自动发现的 `extensions/`、`skills/`、`prompts/`、`themes/`、包目录 `npm/`、`git/` 与 `SYSTEM.md`/`APPEND_SYSTEM.md`（`core/agent-session-services.ts:139`、`:148-153`；`core/package-manager.ts:944`、`:2453-2456`；`core/resource-loader.ts:377-388`、`:1219`、`:1233`）；全局 `settings.json` 由 Tower 的 `settingsManager` 按 §5.3.3 `globalPath` 定位；Host 环境的 `PI_CODING_AGENT_DIR`（上表“Pi 运行开关”），Pi 中其余 `getAgentDir()` 调用（内置 MCP 扩展、工具二进制目录）因此得到同一目录；静态扩展清单的枚举根（`11` §11.8.2）；S2 读允许列表中 Pi 资源的固定部分与 `auth.json` 的读拒绝（`11` §11.6.2）。本文与其他文档写作 `~/.pi/agent` 处，均指用户 agentDir（这是它的默认值）。API 密钥照常只经 `setRuntimeApiKey` 写入内存覆盖层；显式传入的 `modelRuntime` 不从 `agentDir` 推出凭据路径（`agent-session-services.ts:139-153`）。理由：Pi 的凭据锁按路径字符串加（`proper-lockfile`，`realpath:false`，`core/auth-storage.ts:130-135`），同一路径才共用一把锁，令牌刷新在锁内复查并落盘，多个进程只刷新一次（`ai/src/auth/resolve.ts:106-114`）；所以人在终端 `/login` 后 Tower 的探测与 Run 读到同一份凭据，“登录后自动继续”在同组有已存活的空闲 Host 时成立（没有时由人重试，`06` §6.1.4 第 5 项，ADR-235），刷新也不会因两把锁或只在内存中而使用户自己的登录失效。M1 不使用内存凭据存储（D57）。然后把 `modelRuntime` 传给 `createAgentSessionServices`（`agent-session-services.ts:37-46`）。Host 进程环境中不含任何密钥，Agent 启动的进程也不继承。
- **RPC**（M2）：ADR-158 起以 0600 的 `auth.json`（隔离 agentDir 中）提供（RPC 的凭据路径随 `PI_CODING_AGENT_DIR` 改变，与用户 `auth.json` 的锁共享须在 M2 复审；M1 的规则见上一条）；以下 ADR-049 的通道保留作历史说明：首选通道是 tower-goal 在 `session_start` 中经 `ctx.ui.input` 发出 `tower:{kind:"credential", provider}`。Host 不弹窗，直接从密钥库取值作答；应答经 stdin 管道传递，不会出现在 `ps` 或环境变量中。tower-goal 拿到后调用 `pi.registerProvider(provider, {apiKey})`（`types.ts:1806-1859`）。Pi 的文档只写明“覆盖 baseUrl”，没有写明“只覆盖 apiKey”，所以这条通道必须先由契约测试 C29 评估：注册后请求是否使用了新密钥、`/login` 的 OAuth 是否不受影响。评估通过才作为 RPC 的默认方式；不通过时，RPC 只使用用户自己的 `auth.json`/`models.json`。无论哪种情况，凭据都不进入 argv 或环境变量。

**首次运行检测**：读取用户登录 shell 的环境（`$SHELL -ilc env`，只取变量名并与 provider 对应，不记录机密的值——`11` §11.7.1 “云 SDK 凭据链”行所列的非机密变量（配套变量、provider 配置变量与指向文件的变量）的值经你确认后记入 Tower 的密钥库，每次 Host 启动从这里取，ADR-228；另取非机密的路径变量 `PI_CODING_AGENT_DIR` 的值以确定用户 agentDir，见上，ADR-209；以及 `PATH`、包管理器位置变量、“Host 环境的变量” ① 的工具链变量与 `NODE_EXTRA_CA_CERTS` 的值，供 Host 环境使用，见上文“Host 环境不引用 Agent 可写的位置”，ADR-213/231），按 ADR-049 的类型表逐类提示：API Key 提示导入密钥库（导入的密钥只在 Pi 判定你的 Pi 配置中没有凭据时使用；判定只在 Host 中求出，首次运行在任何 Host 之前，所以写 `第一次运行时由 Pi 判定：你的 pi 配置中已有凭据时 Tower 用它，导入的密钥只在没有时使用`，之后模型选择器按服务该目标的 Host 的检查写明，`11` §11.7.1，ADR-230/231/232/233）；云 SDK 凭据链提示确认透传；代理变量与 `NODE_EXTRA_CA_CERTS` 自动透传并告知（有 `NODE_EXTRA_CA_CERTS` 时写明 `Tower 的模型请求与 MCP 服务器使用它`）。未导入的 provider 在模型选择器中显示“该凭据只在你的终端中可用，Tower 中不可用”；以头部发送的令牌（`ANTHROPIC_AUTH_TOKEN`）不导入、照此标注，只有原始密钥而没有区域的 AWS 配置在确认卡片上写明区域的差别（两者唯一定义在 `11` §11.7.1，ADR-229）。Tower 不提供 `grep`/`find`/`ls`（§5.3.5，ADR-220），所以不检查 `rg`/`fd`。**读到的路径值**（唯一定义，ADR-214）：`PI_CODING_AGENT_DIR`、收入 Host `PATH` 的目录、包管理器位置变量、① 的工具链变量与 `NODE_EXTRA_CA_CERTS` 显示在设置页引擎组（`04` §4.15），附“重新读取”（`engine.reread_login_shell`，仅本机，`06` §6.4.3）：以同一方式重新运行 `$SHELL -ilc env`，只替换这些值与记入密钥库的上述非机密变量的值（凭据类变量不重新提示，ADR-228），下一次 Host 启动生效——正在运行的 Host 不重启、继续用旧值，打包模式（`06` §6.1.1）下并入它的 Goal 同样用旧值，直到它退出，这期间新旧两个值同时在用（ADR-215）——清单随之在设置页重新计算（时限与失败时的显示同首次运行，§5.10；变化时按 §5.10 重新确认）；Tower 不自动重新读取。读到的 `PATH` 中找不到 `node` 时，首次运行与重新读取都提示“你的终端中没有 Node：以 `npx`/`node` 启动的 MCP 服务器与扩展的子进程在 Tower 中会失败”。

核实方式：`setRuntimeApiKey` 和 bash 环境剥离由契约测试 C26 覆盖（断言 bash 子进程中看不到 API Key 和云凭据）；Host 环境不含密钥、Tower 不把机密放入任何参数或环境由 C29 覆盖；`spawnHook` 由 C28 覆盖。

---

## 5.4 `pi-rpc` 实现（“使用我安装的 pi”）

> 里程碑：`pi-rpc` 在 M2 交付；M1 只有 `pi-sdk`（ADR-059）。

### 5.4.1 启动参数

```
<piBin> --mode rpc
        --session-dir  ~/.tower/goals/<G>/sessions                # args.ts:140
        --session-id   <sid>                    | --session <file> # 新建 | 恢复（args.ts:134-137）
        --no-approve                                               # 恒传：Pi 的项目信任恒为假（args.ts:243-244；`11` §11.8.1，ADR-202）
        [--skill <f> …] [--prompt-template <f> …] [--theme <f> …]  # 项目的声明性资源，复核为 trusted 时（args.ts:193-201）
        [--system-prompt <f>] [--append-system-prompt <f>]         # 同上（args.ts:121-125）
        -e <towerHome>/ext/tower-goal/index.ts                     # args.ts:186
        --tower-config <runDir>/tower-goal.json                    # 扩展通过 registerFlag 注册（types.ts:1692-1708；未知 --flag 透传 args.ts:249-262）
        [--model <provider>/<id>:<thinking>]
        --exclude-tools powershell,grep,find,ls                    # = §5.3.5 NON_TOWER_BUILTINS（args.ts:162；R61-D11-01、ADR-220）
        [--tools read,ask_user,propose_contract]                   # 仅 shaping，与 setActiveTools 双保险
        [--tools read,review_report]                               # 仅 review
        [--no-mcp]                                                 # 用户设置
cwd = 卫星；env = §5.3.6 的白名单环境（含私有存储、端口段）+ §5.3.6 的 Pi 运行开关（PI_OFFLINE=1、PI_CODING_AGENT_DIR=用户 agentDir，与 SDK 同一规则，ADR-211/212）
```

M2 的 RPC 恒传 `--no-approve`，不传 `--approve`。条件成立时才另传上面的资源参数：`Project.trust` 为 trusted，**并且**卫星中的 `.pi/**`、`.agents/**` 相对 `baseCommit` 没有改动（由 GitRunner 在影子上下文中判定，同时检查未跟踪文件，名字按 `16` §16.1.12 的比较规则筛选，不用区分大小写的 pathspec，命令以 `11` §11.8.1 为准；不在卫星的 `.git` 上运行，ADR-060、ADR-204）。传哪些文件、不传时加载什么、如何恢复加载，唯一定义在 `11` §11.8.1（ADR-201、ADR-202）。原因：Agent 写下的代码可以位于 `.pi/extensions/*`，也可以位于项目设置、`mcp.json` 或项目扩展引用的仓库中任意路径；如果 Pi 在下一次 Run 中信任项目，这些代码会以用户权限、在沙箱外执行（`11` T4/T16）。所以项目扩展、项目包与项目 MCP 服务器在 M1 中一概不加载，M2 另做批准设计。SDK 的做法相同：`projectTrusted:false`，资源经 `resourceLoaderOptions` 传入（§5.3.5）。

**加载顺序与 RPC 的适用条件**（G32，ADR-065）：CLI 的 `-e` 路径在所有其他扩展**之前**加载（`resource-loader.ts:577-578`），所以 RPC 模式下 tower-goal 必然是**第一个**扩展，做不到 ADR-024 第 1 条在 SDK 中的“最后加载”。

- **不冻结输入**。Pi 的公开 API 明确要求扩展通过原地修改 `event.input` 来改参数（`types.ts:1455`）。冻结会让按文档写法改参数的扩展每次调用都被阻断；扩展工具或 MCP 工具在 `execute` 中修改自己参数的情况也会抛错（冻结对象就是 `execute` 收到的参数）。ADR-046 的冻结部分因此作废。
- **只保留哈希比对**（§5.6.5 gate 第 8 条）：事后发现，severity 3。
- **适用条件**：只有当用户的扩展集合**不含** `tool_call` 或 `tool_result` 处理器、也**不覆盖** `bash` 时，才允许使用 RPC。RPC 下没有 API 能枚举其他扩展的处理器（`Extension.handlers` 只出现在 SDK 的 `extensionsResult` 中），所以判断**只能依赖静态清单的源码扫描**（§5.10）；bash 的来源另有启动自检（§5.3.5）。
- **内置扩展白名单**（R4-D5-02，按 Pi 版本登记）：v1.2.0 中，内置扩展里只有 `builtin:mcp` 注册了 `tool_call` 处理器（`extensions/mcp/index.ts:1191`）。它只读取 `event.input` 来判断要等待哪个 MCP 服务器就绪，不修改输入，所以列入白名单：`{"builtin:mcp": "1.2.0"}`。codemode、tool-search、llama.cpp 没有注册工具钩子。Pi 版本变化时，白名单必须按新版本源码重新核对（C30(d)）；版本不在白名单中时，视为有拦截型处理器。条件不满足时，该用户必须改用 SDK 适配器，UI 说明原因（列出触发的扩展），不再按风险等级区分。在满足条件的配置下，gate 之后只剩白名单中的只读处理器，哈希比对只是兜底。
- 运行期复核：每次 `tool_call` 用 `pi.getAllTools()` 复核 bash 的来源（§5.3.5）。
- RPC 是 M2 的交付项（ADR-059）。

### 5.4.2 自写 JSONL 客户端 `RpcProcessClient`

不使用内置 `RpcClient`。原因：每个请求固定 30 s 超时（`rpc-client.ts:580-583`），固定用 `node` 启动（`:94`），启动时只 `sleep 100ms`、没有握手（`:133`），也没有应答 `extension_ui_request` 的方法。

| 关注点 | 规则 |
|---|---|
| 分帧 | 只按 `\n` 切行，去掉行尾 `\r`，用 `StringDecoder` 处理多字节字符；**不用 `readline`**，因为它还会在 U+2028/2029 处断行（`CA/src/modes/rpc/jsonl.ts:4-20, 21-58`）。直接复用这段 40 行逻辑 |
| 读取 | stdout 读取**永不暂停**。Pi 每发一个 agent 事件都会等待 stdout drain（`rpc-mode.ts:361-363`），读取端一停，agent 就停。解析后的事件进入 Host 的有界环形缓冲（§5.4.7） |
| 写入 | 单写队列：每条命令先 `JSON.stringify` 再加 `\n`。`write()` 返回 false 时等 `drain` 再写下一条 |
| 关联 | 每条命令带 `id = ULID`，响应回显 `id`。命令是**并发处理**的（`rpc-mode.ts:807-810`），响应可能乱序 |
| 超时 | 按命令设置，而不是统一 30 s：`get_state`/`get_entries`/`get_tree`/`get_session_stats` 10 s；`steer`/`follow_up` 10 s；`prompt` 30 s（到 preflight 为止，`rpc-mode.ts:394-414`）；`abort` 120 s（等到空闲才返回，`:426-429`）；`compact` 600 s；`new_session`/`switch_session`/`fork` 60 s |
| 握手 | 启动后立即发送 `get_state`。收到响应才进入 `ready` 状态；20 s 内没有响应则判定启动失败，把 stderr 尾部带入 `engine.exit`（计入准备阶段 120 s 时限，失败即 `prepare_failed`，§5.3.1，ADR-149） |
| 活性探针 | RPC Host 自己的心跳只能说明 Host 活着，不能说明 pi 子进程活着（G35）。因此 Host 每 5 s 向每个子进程发一次 `get_state{id:"probe-…"}`，并测量响应延迟。`get_state` 是同步处理的，与流式输出并发执行（`rpc-mode.ts:448-464, 807-810`），只有子进程的事件循环被阻塞时才会没有响应。阈值与 `08` §8.6.3 的心跳阈值对齐：最近一次响应距今 > 15 s → 心跳事件标记 `probeLate`（Live Line 断环）；> 30 s → 发出 `heartbeat{probeTimeout:true}`，Supervisor 按 `unresponsive` 处理；> 120 s 且人选择“结束本 Run”→ SIGTERM，再等 5 s 后 SIGKILL。探针请求不排队：上一个探针未返回时不发新的。stdout 背压同样会让探针超时，但 Host 从不停止读取（G7），所以这种情况不会发生 |
| `prompt` 语义 | 响应 `data.disposition ∈ started/queued/handled`。preflight 之后发生的错误只出现在事件流里（`rpc-mode.ts:394-414`）。`handled` 不会产生 run，也不会有 `agent_settled` |
| stderr | 逐行捕获到 `logs/rpc-<runId>.stderr.log`，保留最近 64 KB 用于 `engine.exit` |
| 退出 | 正常退出：关闭 stdin → Pi 走 `shutdown()`，退出码 0（`rpc-mode.ts:802-805, 726-743`）。5 s 后仍未退出则 SIGTERM，退出码 143（`:366-380`）。再过 5 s 则 SIGKILL |
| 版本 | 首次使用前执行 `<piBin> --version`。在支持范围（§5.11）之外的版本：弹出警告，用户确认后先跑一次冒烟契约测试 |

### 5.4.3 应答 `extension_ui_request`

```
pi stdout:  {"type":"extension_ui_request","id":"<uuid>","method":"input","title":"tower:{\"v\":1,...}"}       （unattended=wait 时不带 timeout）
Host:       ui.request{uiRequestId:<uuid>, method:"input", dialog:<解析结果>}  → Supervisor → Needs-You
人回答:      answerUi(h, <uuid>, {kind:"option", optionId:"o2"})
Host stdin: {"type":"extension_ui_response","id":"<uuid>","value":"{\"optionId\":\"o2\"}"}
```

- 应答形状见 `rpc-types.ts:294-297`：`{value}`、`{confirmed}`、`{cancelled:true}`。
- 晚到的应答会被 Pi 丢弃（`rpc-mode.ts:774-779` 只解析仍在等待的请求）。
- **Pi 侧超时或取消时，不会向宿主发送任何消息**（`rpc-mode.ts:101-120`）。为此 tower-goal 在对话框结束（无论以何种方式结束）时都会调用 `appendEntry("tower.ui_resolved", {reqKey, by})`（§5.6.4）。Host 看到这个 `entry` 后关闭对应的 Needs-You。对于不以 `tower:` 开头的对话框（来自用户的其他扩展），在其所属工具调用的 `tool.end` 或 `agent.settled` 时一并关闭。
- `notify` / `setStatus` / `setWidget` / `setTitle` / `set_editor_text` 是即发即忘的消息（`rpc-types.ts:264-287`），不需要应答。

### 5.4.4 命令映射

| EngineAdapter | RPC 命令 | 备注 |
|---|---|---|
| `start` | 启动子进程，用 `--session-id` | `--session-id` 的语义是“打开或创建”：本地已有同 id 的会话就打开，否则新建（`main.ts:435-447`）。Tower 的 sessionId 由新的 RunId 派生，所以实际总是新建；对账时仍以 `get_state.sessionFile` 为准。握手完成后按 `opening` 投递：`tower` 部分经 `/tower-inject <id>`，`human` 部分以 `prompt` 发送（ADR-135）。已知限制（M2，ADR-191）：RPC 的 `prompt`/`steer`/`follow_up` 没有 `expandPromptTemplates` 选项（`rpc-types.ts:22-24`），以 `/` 开头的人写文字经 `prompt` 发送时会被分派为扩展命令或展开为模板，经 `steer`/`follow_up` 发送时扩展命令被拒绝（抛错、不分派，`core/agent-session.ts:2204-2205`），技能命令与模板照常展开（ADR-192 核实）；避免方式是 M2 的设计任务（§5.3.1 只覆盖 SDK） |
| `resume` | 启动子进程，用 `--session <file>` | 若 cwd 缺失，Pi 会以退出码 1 退出（§5.9 G1），因此 Supervisor 必须先确保卫星存在 |
| `prompt` | `prompt`（**不带** `streamingBehavior`） | 若 Host 认为当前处于流式输出，直接返回 EBUSY，交给上层改用 steer 或 followUp |
| `steer` / `followUp` | `steer` / `follow_up` | 引擎空闲时**不会启动 run**（§5.9 G13）。adapter 会在空闲时自动改用 `prompt` |
| `abort` | `abort` → 可选 `clear_queue` | `clear_queue` 返回被清掉的文本（`rpc-types.ts:128-134`） |
| `getEntries` | `get_entries{since}` | 返回**所有分支**的条目，按追加顺序（`rpc-mode.ts:636-647`） |
| `getTree` | `get_tree` | |
| `navigate` | `prompt("/tower-nav <entryId> [--summarize] [--label <l>]")` | RPC 本身没有树导航命令，但扩展命令能拿到 `ExtensionCommandContext.navigateTree`（`types.ts:421-425`）。RPC 模式把它接到 `session.navigateTree`（`rpc-mode.ts:329-337`）。扩展命令在 `prompt` 时立即执行，handler 结束后才返回 disposition `handled`（`agent-session.ts:2065-2073`）；但 handler 抛错时同样返回 `handled`（D55），所以完成以响应之前没有 `command:tower-nav` 的 `extension_error`、且 `get_state` 的叶子已变化为准（ADR-183）。只在空闲时发送；收到响应后 adapter 重新查询 `get_state` 和 `get_entries` |
| `fork` | `position:"before"`（必须是 user 消息）用 `fork{entryId}`；在当前叶子用 `clone`；在任意条目上 `position:"at"` 用 `prompt("/tower-fork <entryId> --at")`，内部调用 `ExtensionCommandContext.fork`（`types.ts:416-419`） | 之后重新查询 `get_state`，并发出 `session.changed` |
| `newSession` | `new_session{parentSession}`（`rpc-types.ts:27`）→ `prompt(input)` | 头部写入 `parentSession`（`agent-session-runtime.ts:236-241`） |
| `getState` / `getStats` | `get_state` + 上次缓存的 `leafId` / `get_session_stats` | `contextUsage` 在 SessionStats 中（`agent-session.ts:4263`） |
| `compact` | `compact` | |
| `setModel` | `set_model` → `set_thinking_level` → `get_state` | `set_model` 只作用于本会话（`setModel` 默认不持久化，`agent-session.ts:2507-2520`） |

### 5.4.5 状态变更后必须重新查询

RPC 不会为会话替换或模型变更发出事件。`rpc-mode.ts:435-442, 603-629` 只在进程内重新绑定。

| 命令完成后 | adapter 动作 |
|---|---|
| `new_session` / `switch_session` / `fork` / `clone` | `get_state`；如果 `sessionFile` 变了，发 `session.changed`，并把 `get_entries` 游标重置为 `undefined` |
| `set_model` / `cycle_model` / `set_thinking_level` | `get_state`，发 `model.changed` |
| 每个 `turn.end` | `get_entries{since: lastEntryId}`，补齐 entry id 映射（评论回执、Claim 的 `piEntryId`） |
| `agent.settled` | `get_state`（核对 `pendingMessageCount`，§5.7.4）+ `get_session_stats`（成本、上下文） |

**Run 中途的会话改变**（**M2**，ADR-190/191）：§5.3.5 的 `commandContextActions` 拒绝只在 SDK（M1）成立。RPC 模式中 Pi 把扩展命令上下文的重载、新建、分叉、切换与树导航接到真实的实现（`rpc-mode.ts:317-350`），Tower 无法替换。M2 的 RPC 模式必须保持 §5.3.5 的会话不变式：Run 进行中会话不被重载或替换（Run 开始时的静态清单确认、项目信任与来源自检只对 Tower 启动的会话成立）。检测机制是 M2 的设计任务，本文档不规定。

### 5.4.6 禁止调用的命令

`set_steering_mode`、`set_follow_up_mode`、`set_auto_compaction`、`set_auto_retry`、`cycle_model`。前四个会写全局设置（`rpc-mode.ts:519-550` → `agent-session.ts:2730-2742, 3279-3280, 3854-3855`）；`cycle_model` 的行为依赖用户的 scoped models，不可预测。`RpcProcessClient` 的类型定义中**不包含**这些命令。

### 5.4.7 RPC Host 的缓冲与降级

- 每个 pi 子进程配一个环形缓冲：最多 20 000 个事件或 32 MB。
- Supervisor 消费速度跟不上时，优先丢弃 `msg.delta`（保留 `msg.end`），其次丢弃 `tool.update`。**生命周期事件、`tool.start/end`、`entry`、`ui.request` 永不丢弃**。
- 如果缓冲里只剩不可丢弃的事件且仍然满了，Host 会暂停把事件转发给 Supervisor（读取 stdout 不暂停），转而写入 `runDir/overflow.jsonl`，再由 Supervisor 补读（`06` §6.6.5）。

### 5.4.8 能力差异

| 能力 | pi-sdk | pi-rpc |
|---|---|---|
| 进程隔离 | 每个 Goal 一个 Host（可打包） | 每个 Goal 一个 pi 子进程 |
| 富 `ask_user` | ✔（`tower:` 对话框载荷，§5.6.4） | ✔（同一载荷；Tower 自己的客户端会解析 `tower:` 载荷，ADR-004、§5.6.4） |
| 树导航（时间线回退，ADR-015） | ✔ `navigateTree` | ✔ 通过扩展命令 `/tower-nav` 实现（需要 tower-goal 已加载） |
| 恢复时覆盖 cwd | ✔ | ✘（必须先恢复卫星） |
| 防止写入全局设置 | ✔ 存储层拦截 | 只靠不调用（§5.4.6） |
| 使用用户的 pi 版本与插件 | 使用 Tower 固定的 Pi 版本，同时加载用户的 `~/.pi/agent` 资源 | ✔ 版本与资源都用用户自己的 |
| 内存（**假设值，待 SP2 实测**，R1-D10-01） | 40–70 MB 每个 Host（gui.md §2.4 的估计）。实际还要加上用户扩展、MCP 客户端、bash 分类器 WASM，可能接近 100 MB。不达标时的 M1 退路见 `06` §6.1.1 | 约 100 MB 每个 Node 子进程（pi.md §12.3） |

---

## 5.5 事件映射：Pi → Tower → Mode

Pi 的事件联合类型见 `agent-session.ts:196-237`，RPC 的四类记录见 `rpc-mode.ts:60-62, 129, 349`。Mode 的封闭集合见 `02` §2.4。

| Pi 事件 / RPC 记录 | TowerEngineEvent | Mode 迁移 | Supervisor 动作 |
|---|---|---|---|
| （准入后：建卫星、装依赖、启动 Host） | —（EngineManager 内部） | `queued` → `preparing`（`02` §2.4） | `waitReason` 清除 |
| （进程就绪 / `run.ready`） | `run.ready` | `preparing` → `thinking` | 记录 `Run.engine`、`sessionId`、`piVersion` |
| `agent_start` | `agent.start` | → `thinking` | 设 `Run.active=true`；启动 stall 计时器 |
| `turn_start` | `turn.start` | — | turn 计数加 1 |
| `message_start{role:"user"}` | `msg.start{text}` | — | 匹配到 Tower 标记行时，回执记为 **delivered**（§5.7） |
| `message_start/end{role:"custom"}` | `msg.start/end{customType}` | — | 前缀为 `tower.` 时，记一条“Tower 注入”事件 |
| `message_update`（text/thinking/toolcall） | `msg.delta` | 若无活跃工具，保持 `thinking` | 更新 Live Line；Accountant 用 `usage` 实时估算成本 |
| `message_end{role:"assistant"}` | `msg.end` | — | 用 `usage` 结算成本；`stopReason=error` 时标记待重试；给已投递但还没有 `seenAtEntry` 的回执写入该属性；如果文本中出现某条评论的 key，就把它推进到 `acknowledged`（定义见 §5.7.3） |
| `tool_execution_start` | `tool.start` | 活跃工具数 +1 → `acting` | Observer 开始跟踪这次调用；Live Line 显示工具名和参数摘要 |
| `tool_execution_update` | `tool.update` | — | 只保留最新值（Live tail） |
| `tool_execution_end` | `tool.end` | 活跃工具数 −1；归零后回到 `thinking` | Observer 生成 Fact；`log` / `submit` / `ask_user` / `propose_contract` 转为 Claim 或状态事件（§5.6.2） |
| `turn_end` | `turn.end` | — | RPC：执行 `get_entries{since}`；等待 `tower.checkpoint` 条目 |
| `agent_end{willRetry:true}` | `agent.end` | → `retrying` | — |
| `agent_end{willRetry:false}` | `agent.end` | 不变（Live Line 显示“收尾中”） | **不算完成**（I4）。此时 before_settle 的 nudge、follow-up 和压缩都还可能继续执行 |
| `auto_retry_start` | `retry.start` | → `retrying` | `attempt == maxAttempts` 时降低健康度 |
| `auto_retry_end{success:true}` | `retry.end` | → `thinking` | — |
| `auto_retry_end{success:false}` | `retry.end` | 不变 | 记一条 Fact `engine_error`；run 随后会 settle |
| `compaction_start` | `compaction.start` | → `compacting` | **暂停** `prompt` 投递（`prompt` 在压缩期间会抛错，§5.9 G12） |
| `compaction_end` | `compaction.end` | 若 run 仍在进行，回到 `thinking`；否则维持当前值 | 记一条 Fact（reason、tokensBefore）；压缩计数加 1，用于返工决策（§5.8） |
| `summarization_retry_*` | `retry.*{source:"summary"}` | 保持 `compacting` | — |
| `queue_update` | `queue` | — | 推进回执：出现在队列 → **queued**；从队列移除且有 user `msg.start` → **delivered**（§5.7） |
| `entry_appended` | `entry` | — | 按 `customType` 分派（§5.6.6） |
| `session_info_changed` / `thinking_level_changed` | `session.name` / `model.changed` | — | 更新 Run 元数据 |
| `agent_settled{aborted}` | `agent.settled` | 没有未决 UI 时 → `settled` | 顺序（ADR-121，`06` §6.1.10）：① **宽限确认**（ADR-025/135，G33）：**连续 2 s** `isStreaming=false` 且 `isCompacting=false`（SDK 直接读；RPC 用 `get_state`）且没有新的 `agent_start`。**宽限失败的唯一定义**（ADR-129/135）：出现 `agent_start` → 不记异常、不终止进程，回到等待下一次 `agent_settled`，有效性在下一次 settle 时按 I4(a) 重新判定，并在同一事务中把 `runs.phase` 写回 `running`（ADR-146）；只出现压缩（`compaction_start`，例如扩展调用 `ctx.compact()`，它不会再发 `agent_settled`，`agent-session.ts:2792, 2903`）→ 等到 `compaction_end` 后**重新开始 2 s 计时**；`post_settle_activity` 只用于进入 `claimed` **之后**的活动；② **终止后台进程**（ADR-115/142）：按 Run 令牌 `TOWER_RUN_TOKEN` 枚举并终止本 Run 的全部进程，等待清空（最多 10 s，随后 SIGKILL）；③ 补做 `agent_bg_done` 检查点，其树即 pin 的树；④ 检查 I4（见下方“settle 判定”）→ **生成 pin 并进入 `claimed`（同一事务，ADR-137）**；最后释放槽位。**settle 序列中进入任何暂停**（外部写入、人暂停、`app_quit` 等，ADR-129/137）：有效提交保留，`continuation={kind:"settle"}`；全部原因解除后**从第 ① 步宽限确认起**重新执行完整序列，不开新 Run。**Host 不存在时**（重启后，ADR-143）：加载会话、不开 Run；引擎空闲即视为宽限满足；按令牌终止残留进程；`agent_bg_done`；I4 以持久化的工具事件判定：成立 → pin 与 `claimed` 同一事务；不成立 → 按下方 settle 判定表（视为非 draining、`outcome = completed`）进入 `paused(idle_without_submit)`，或在守卫成立、配额未用完时开一个 Run 让 tower-goal 在 `agent_before_settle` nudge（ADR-146）。这段等待期 Mode 仍是 `settled`，实况行以 `12` §12.6.4 为准（ADR-126）。**持续监视**（R2-D5-04）：Goal 处于 `claimed`/`verifying` 期间，持续监视 `agent_start`、`compaction_start`、`isStreaming`/`isCompacting`（RPC 每 5 s 通过活性探针的 `get_state` 顺带获取，§5.4.2）。这样也能捕获定时器发起的 `sendUserMessage` 和 settle 之后的 `ctx.compact()`。一旦出现：撤回到 `running`、取消验证（同一事务把 `runs.phase` 写回 `running`，ADR-146），记录 `anomaly{detector:"post_settle_activity"}`；若 settle 时有进程被 Tower 终止，以 `tower.processes_terminated` 告知被终止的命令与原因（ADR-121/129）：run 已在进行时（撤回即意味着新 run 已开始）用 `sendCustomMessage(msg, {triggerTurn:false})` 投递——Pi 在当前 turn 结束时追加到会话（v1.2.0 `agent-session.ts:2318-2353`，流式且 `triggerTurn:false` 走 `_pendingCustomMessages`），RPC 下经 `/tower-inject <id>` 由 tower-goal 以 `pi.sendMessage(msg, {triggerTurn:false})` 投递（`ExtensionAPI.sendMessage`，`core/extensions/types.ts:1731-1734`；通道见 §5.6.1）；`app_quit`/`engine_crash` 后自动恢复时作为恢复 Run 的第一条消息。契约测试 C32。同一 Goal **1 小时内第 2 次**出现时不再撤回，而是 `paused{pauseReason:"post_settle_activity"}`，并生成 Needs-You，选项为：本 Goal 禁用可疑扩展后继续 / 继续 / 放弃。**归因如实标注**：“来源未知；注册了相关钩子的扩展：…”。SDK 下的列表来自 `extensionsResult.extensions[i].handlers` 中含有 `agent_settled`、`agent_end`、`session_compact`、`turn_end` 的扩展；RPC 下来自静态清单的文本扫描（§5.10）。契约测试 C19 覆盖 |
| `extension_ui_request` select/confirm/input/editor | `ui.request` | `dialog.kind=approval` → `blocked_guard`；其余 → `waiting_human` | 创建 Needs-You：`approval` 或 `question`（`02` §2.9） |
| `entry{customType:"tower.ui_resolved"}` | `entry` | 若无其他未决对话框，恢复为对话框之前的 Mode | 关闭对应 Needs-You（resolution.by 取自条目） |
| `extension_ui_request` notify | `ui.notify` | — | 写入 Trace；`error` 级别时 Needs-You 记 severity 1 |
| `extension_error` | `engine.error{source:"extension"}` | — | 只进诊断；tower-goal 的 `tool_call`、`turn_start` 与 `tool_result` 处理器的错误由它经 `bridge` 自报、创建 Needs-You `anomaly{tower_goal_handler_error}`（ADR-239；gate 故障默认阻断，脱敏故障隐去该结果；其余处理器的错误只进诊断，如实登记；唯一定义 §5.6.5 第 6 项，ADR-237/238：Pi v1.2.0 的 `tool_call` 处理器出错不发本事件） |
| Host 进程中未处理的 Promise 拒绝（合成；例如扩展没有 `await` 被拒绝的 `ctx.reload()`，ADR-190） | `engine.error{source:"adapter", message:"unhandled rejection: <摘要>"}` | — | Host 以进程级处理器记录后继续运行，不终止 Host；只进诊断 |
| 进程退出 | `engine.exit` | → `unresponsive` | Run 结果记为 `crashed`；进入恢复流程（`06` §6.8） |
| 心跳超时（合成） | — | → `unresponsive` | 同上，先探测再判定 |
| Observer 检测到循环（合成） | — | → `stalled` | Needs-You `stalled` |
| Accountant 触发软上限（合成） | — | → `budget_capped` | 进入 drain 流程（§5.6.5）→ `paused` |

**settle 判定**（I4，R2-D4-03；有效 submit 的定义见 §5.6.2c，ADR-121/129——任何新的工具调用都意味着一次新的 run，它在 settle 前必然经过 `agent_before_settle` 的常规 nudge，因此不存在“settle 之后才发现提交无效”的情形。Tower 的陈述只以 `tower.*` custom message 出现，Trace 一律标“Tower 注入”；只有人亲手写的转向与回答以 user 角色出现，ADR-135）：I4 中“没有未决 Needs-You”的范围**只包括**本 Run 产生的、`costOfDelay = "agent_blocked"` 的 `question` 和 `approval` 条目。以该 Goal 为 owner 的 `ratify` 聚合条目、非阻断的 `sentinel`、`conflict` 等**不**阻止进入 `claimed`。宽限确认结束时：

| 情况 | 处理 |
|---|---|
| 有效 submit，且没有上述阻断条目 | → `claimed` → pin（`agent_bg_done` 检查点的树，含 submit 之后仅由后台进程产生的变化）→ `verifying` |
| 有效 submit，但存在上述阻断条目 | 正常路径上**不会出现**：`ask_user` 和 gate 的 ask 都在工具执行内部阻塞，问题没有回答，Run 就不会 settle。只有 run 被 abort，或者 Pi 侧的兜底超时触发（§5.6.4，说明 Supervisor 已不可用）时才会出现。此时 pauseReason **按 abort 的原因决定**（R4-D4-04，见下方优先级）：abort 由 `app_quit`、`human`、`budget_soft_cap`/`budget_hard_cap`、`engine_crash` 发起时，保留该原因及其 `autoResume` 语义；**只有**当结束原因是 Pi 侧兜底超时时，才进入 `question_timeout`。无论哪种情况，问题条目都保持打开（记录 `timedOutAt` 仅限 `question_timeout`），人仍可作答。有效提交**保留**：这种暂停发生在 settle 序列中，继续目标为 `settle`（`03` §3.2.1）；人作答并解除暂停后重新执行 settle 序列、进入 `claimed`，答案追加到 `pendingOpenings`，在之后的 Run（自动返工或 `request_changes`）中送达，不为送达答案另开 Run（ADR-176）；未作答就解除暂停（`app_quit`/`engine_crash` 的自动解除、`human`/`budget_*` 的 `resume`）时见下一行。**不存在**“没有活跃 Run、却处于 `running`”的状态 |
| 重跑 settle（继续目标 `settle`）时，上一行的阻塞条目仍未作答（ADR-178，唯一去向） | 这些条目属于**已结束**的 Run，**不再阻塞 `claimed`**：有效提交仍成立 → 同第一行进入 `claimed`（不再暂停，不记 `timedOutAt`）；Needs-You 保持打开，此后的作答追加到 `pendingOpenings`（`06` §6.4.3 `needs_you.answer`），在之后的 Run 中送达 |
| 没有有效 submit，nudge 次数已用完 | `paused{pauseReason:"idle_without_submit"}`（§5.6.5 nudge） |
| 没有有效 submit，**非 draining 且 `outcome = completed`**，nudge 守卫不成立（只有 human 标准、`nudge.max = 0` 等，§5.6.5，ADR-135/138） | 直接 `paused{pauseReason:"idle_without_submit"}`（Needs-You），不 nudge |
| draining 中结束（ADR-138/141） | 按 `Goal.drainingFor.target` 处理（`pause` → 以 `reasons` 中优先级最高者进入 `paused`、其余进入 `alsoApplies`；`take_over`/`rewind`/`dependency`：`reasons` 为空则执行原目标，非空则放弃原目标进入 `paused(reasons ∪ {human})`——规则唯一定义在 `06` §6.1.4 drain 协议与 §6.1.6 恢复行，ADR-144），继续目标按来源写入 |
| `outcome ∈ {aborted, error}`，非 draining | 按 abort 原因（上一行的优先级）或 provider 规则（`provider_unavailable`）；`06` §6.8 F8 中止、数据库中没有 `draining_for` 的 Run 不经本表，按该行由 `06` §6.1.6 的恢复行求出（ADR-233） |
| 问题因 `unattended` 超时而无人回答（§5.6.4，`pause:true`） | `paused{pauseReason:"question_timeout"}` |
| pin 安全检查（ADR-089、ADR-101、ADR-109、ADR-111、ADR-112） | 不再校验 gitdir 控制文件的哈希（`git_control_tampered` 已退役）。**唯一的权威检查** `pinSafetyCheck(baseTree, pinTree)`（ADR-109，取代 ADR-106 的“物化 + 排除”）：Supervisor 在影子中以 `git diff-tree -r --no-renames` 与 `git ls-tree` 读取两个 tree，不物化、不依赖槽位，同一 pin 结果恒定。规则（ADR-111/112）：**仓库形态候选目录** = 在 base tree 或 pin tree 中直接含有名字（按 `10` §10.1.2 的名字比较规则（ADR-120））等于 `head`、`commondir`、`gitdir` 的条目（文件或符号链接）的目录，**根目录同样适用**（ADR-116）；base→pin 的任何增、删、改（含模式变化）条目位于候选目录之内或就是该目录 → `sentinel{detector:"nested_repo", dir}`（覆盖标记文件增删改、`config`/`hooks`/alternates 修改、`objects/`/`refs/` 增删、`commondir` 删除等全部变体；名为 `head` 的目录本身不使父目录成为候选）。对 pin 中**全部**符号链接，在 pin tree 内按 POSIX 语义解析整条链（深度上限 40，环或超限视为逃逸；经过 tree 中不存在的路径分量——如被忽略的依赖目录——或名字等价于 `.git` 的分量也视为逃逸，ADR-116），最终为绝对路径或越出仓库根，**并且**它是新增或改变的链接、或在 base 中解析安全、或 base 中的解析结果与 pin 不同（ADR-124 的 base 豁免：base 中原本就不安全且未变的链接不命中，只在信任提示中列出）→ `sentinel{detector:"symlink_escape"}`。**不排除、只阻断**：severity 3、pin 推导，阻止 Verified 与集成，pin 不变；人可 `override_sentinel`——覆盖绑定 `(detector, 路径, 该路径在 pin 中的对象哈希)`，之后任一变化使覆盖失效并重新阻断；覆盖后 pin 原样进入 seal，trailer `Tower-Override` 记录路径与哈希（ADR-112），或返工让 Agent 删除这些条目。执行位置：`verify()` 的第一步（在缓存命中、仅 artifact、S0、子模块、生态不支持等一切提前返回之前），验收与 seal 时对同一 pin tree 再执行一次；属“永不降级”。卫星侧扫描（ADR-101 早期预警）保留，只用于运行中提示与决定两种检出不写出哪些目录，不作为 Verified 依据。未改动的 base 夹具照常写入两种检出；被改动的夹具目录在覆盖之前不写入（ADR-111），覆盖之后只有纯数据条目（`objects/**` 不含 `objects/info/**`、`refs/**`、`packed-refs`）写出 pin 版本，其余写出 base 版本、base 中没有则不写出（白名单，ADR-124） |

**pauseReason 优先级**（R4-D4-04）：同一时刻有多个暂停原因时，取最高者；顺序唯一定义在 `16` §16.1.1（含 `prepare_failed`、`stalled_timeout`），本文不复述（ADR-183）。卫星丢失按 ADR-084 处理（`10` §10.16.2 情形 E）：不在 `running` 时是叠加态（`satelliteRebuilding`），不改 `pauseReason`、不参与本表；`running` 时进入 `paused(satellite_missing)`；重建失败时 `satellite_missing` 升级为常规原因并参与本表，被覆盖的原因记入持久化的 `alsoApplies`。解除后去哪里一律由持久化的继续目标 `continuation` 与唯一转移函数 `onAllReasonsCleared()` 决定（ADR-134，`03` §3.2.1，`06` §6.4.3）。

**Mode 推导**：本表只说明每个事件改变了 `08` §8.6.1 中的哪个输入变量。Mode 的优先级和推导函数**只在 `08` §8.6.2 定义**，本文不再重复列出；显示防抖规则见 `08` §8.6.5。

**时序注意**：`tool_execution_start` 在 `tool_call` 钩子**之前**发出（`AG/src/agent-loop.ts:541-549, 596-603`）。因此 gate 的 ask 对话框出现时，Mode 已经是 `acting`，由优先级规则覆盖为 `blocked_guard`。

### 5.5.1 Live Line 推导

格式为 `模式 · 动作 · 对象 [· 细节]`，与 `04` 卡片第 2 行和 `08` §8.6.5 一致。动作和对象**由 Harness 从 `tool.start` 的参数和 `tool.end` 推导**（R6、`00` R12）；唯一的例外是 `thinking` 状态下的短语，见下表。“对象”段带有可转向的锚点：点击它会打开转向输入框，并预填锚点（文件:行、命令、失败的测试）。

| 来源事件 | 动作 | 对象（来自 `tool.start.args`） | 细节（随后补全） | 锚点 |
|---|---|---|---|---|
| `tool.start{read}` | 读 | `path`（若有 `offset`，显示为 `path:offset`） | — | fileLine |
| `tool.start{edit}` | 编辑 | `path` | `tool.end` 后从 `details.patch` 统计 `+a −d`，并取 `firstChangedLine`（`edit.ts:70-77`） | fileLine |
| `tool.start{write}` | 写入 | `path` | 收到 `tower.obs` 后显示 `existed ? 覆盖 : 新建`，以及字节数 | file |
| `tool.start{bash}` | 运行 | `command`（第一行，截断到 60 字符；识别出是测试命令时以测试命令显示） | 运行中显示 `· 14s`（由 `tool.update` 计时）；结束后显示 `· exit 1` | command |
| `tool.end{bash}` 识别为测试命令且失败 | 测试失败 | 第一个失败用例（Observer 的测试输出解析器，`07` §7.4.5），例如 `checkout.spec.ts › retries once` | `(3 failing)` | test |
| `tool.start{mcp__s__t}` | 调用 | `s/t` + 第一个字符串参数 | — | — |
| `tool.start{codemode}` | 脚本 | 嵌套调用数，随 `parentToolCallId` 增长 | 最近一次嵌套调用的“动作 · 对象” | — |
| `tool.start{log}` / `submit` / `ask_user` | 记录 / 提交 / 提问 | `kind` + `text` 前 40 字。这部分是 Claim，**以 Claim 字体显示** | — | claim |
| `msg.delta{text}`，且无活跃工具 | （无动作段） | 模型最近一段文本的首句，**按 Claim 语法**（灰色斜体）显示（`08` §8.6.5） | 已经过的秒数 | — |
| `msg.delta{thinking}`，且无活跃工具 | 思考 | 上一个工具的对象（thinking 的内容不显示） | 已经过的秒数 | — |
| `compaction.start` | 压缩 | `reason` | `tokensBefore` | — |
| `retry.start` | 重试 | `attempt/maxAttempts` | `delayMs` 倒计时 | — |
| `ui.request` | 等你 / 审批 | 问题或命令的摘要 | 已等待时长 | needs-you |

- 多个工具并行时，显示最近开始的那一个，并加后缀 `+2`。
- 刷新上限 ≤ 1 次/秒，直接替换，不做打字效果（`04`）。对象字段变化的那一帧立即刷新。
- Live Line 的值属于投影 `goal/<id>/live`（`06` §6.4），**不写入 EventLog**；只有它依据的 `tool.start/end` 写入。

---

## 5.6 `tower-goal` 扩展规格

### 5.6.1 配置与通道

```ts
// <runDir>/tower-goal.json  —— 由 Supervisor 写入；RPC 通过 --tower-config 传入；SDK 通过闭包传入同一路径
interface TowerGoalConfig {
  v: 1;
  goalId: GoalId; runId: RunId; phase: "shaping" | "running" | "review";
  criteriaIds: string[];                         // 用于校验 submit
  shadowGitDir: string;                          // ADR-060：~/.tower/goals/<goalId>/git/<projectId>.git（Agent 不可写）
  files: { brief: string; situation: string; contract: string; policy: string; episodic?: string };  // 相对 runDir
  features: { log: boolean; nudge: { enabled: boolean; max: number }; checkpoints: boolean; gate: boolean };
  ask: { backstopTimeoutSec?: number };          // Pi 侧兜底超时（§5.6.4）
}
```

**通道选择**：只使用 Pi 已公开的接口面，不另开 socket。

| 方向 | 机制 | 理由 |
|---|---|---|
| Host → 扩展（策略） | `policy.json`，原子 rename 写入，内含 `version`。扩展在每次 `tool_call` 时 `stat` 一下，mtime 变了才重新读取（约 20 µs） | 持久、可审计、用户可直接查看；Supervisor 崩溃时 gate 仍能按上一版策略运行 |
| Host → 扩展（简报 / 局势） | `brief.md`、`situation.md`、`contract.md`。在 `before_agent_start` 和 `session_compact` 时读取 | 与 RPC 模式一致；SDK 下 `bridge` 闭包直接返回内存中的副本 |
| Host → 扩展（待投递消息，ADR-135） | `runDir/pending/<id>.json`（原子 rename 写入，`details.key` 去重）。RPC 下 Tower 发送 `prompt("/tower-inject <id>")`：Pi 在 `prompt` 入口先执行扩展命令，**不产生 user 消息**、不经 `input` 钩子，流式中也立即执行（v1.2.0 `agent-session.ts:2060-2068`、`_tryExecuteExtensionCommand` `2141-2163`；RPC `prompt` 直接调用 `session.prompt`，`rpc-mode.ts:394-412`）。tower-goal 以 `pi.registerCommand("tower-inject", …)`（`types.ts:1680`）注册处理器，读取文件后调用 `pi.sendMessage(msg, {triggerTurn})`，删除文件。SDK 下 Host 直接调用 `sendCustomMessage`，不经文件 | 不另开通道；顺序由“收到 `handled` 响应后才发下一条命令”保证（RPC 的 `prompt` 以 `void` 调用，D55 前提） |
| 扩展 → Host（同步询问） | `ctx.ui.input("tower:" + JSON)`（§5.6.4），在 RPC 中就是 `extension_ui_request` | 两种 adapter 都原生支持 |
| 扩展 → Host（检查点请求，ADR-183） | `host.requestCheckpoint` = 与同步询问同一信封的 `ctx.ui.input("tower:" + JSON)`（`kind:"checkpoint"`，带 `piEntryId`），不弹出对话框；Host 转给 Supervisor 的 GitService，回答即检查点结果（§5.6.5 `turn_end`） | 不另开 socket；影子的唯一写者在 Supervisor（`10` §10.7.2） |
| 扩展 → Host（记录） | 工具结果的 `details`（随 `tool.end` 送达），以及 `pi.appendEntry("tower.*")`（产生 `entry_appended`） | 同时写入 Pi 的 JSONL：分支正确、崩溃后可以重放（`06` §6.6.5） |

扩展的 factory 里**不启动**定时器、watcher 或 socket（`CA/docs/extensions.md:58`）。配置在 `session_start` 时读取；`session_shutdown` 时清理，清理操作是幂等的。

### 5.6.2 工具

所有工具 `promptSnippet` 都留空。不提供 snippet 的自定义工具不会出现在系统提示的 “Available tools” 段（`types.ts:586`），而工具声明本身已经包含 description，这样可以省 token。running 阶段不使用 `promptGuidelines`，相应指引已并入 description（§5.6.3）。shaping 阶段只有 `propose_contract` 带一条 guideline；guideline 只在其所属工具活跃时出现（`types.ts:588`；`system-prompt.ts:118-121`）。

激活规则：

| 阶段 | 激活方式 | 活跃工具集 |
|---|---|---|
| `running` | `session_start` 时调用 `pi.setActiveTools(["read","bash","edit","write", ...当前活跃工具中的扩展与 MCP 工具 − propose_contract, ask_user, log?, submit])`（`types.ts:1778`）：内置工具固定为这四个（取自 §5.3.5 的 `TOWER_BUILTINS`），**不读**用户或项目的 `defaultTools` 设置（R61-D11-01） | `read`/`bash`/`edit`/`write`（都是 Tower 注入的 `<sdk:…>`，ADR-220）+ 用户扩展和 MCP 的工具 + 3 个 Tower 工具；`TOWER_BUILTINS` 之外的内置工具已被移出注册表，任何阶段都不会活跃 |
| `shaping` | `setActiveTools(["read","ask_user","propose_contract"])`；RPC 另外传 `--tools`；`tool_call` gate 拒绝其他所有工具 | `read` + 2 个 Tower 工具（塑形 Run 属 M2，ADR-059；查找代码的手段随 M2 设计，ADR-220） |
| `review` | `setActiveTools(["read","review_report"])`；RPC 同样传 `--tools`；gate 拒绝其他所有工具 | `read` + `review_report`（独立评审默认关闭、不在 ADR-059 的 M1 清单中，`07` §7.12；输入已附评审单元的 hunk）（§5.6.2e，`07` §7.12 引用本定义）。没有 `submit`，也没有 nudge |

`propose_contract` 和 `review_report` 设置 `defaultActive: false`（`types.ts:631`），只在各自的阶段激活。

塑形与评审阶段按名字激活 `read`：SDK 下生效的恒为 Tower 注入的 `<sdk:read>`（`customTools` 压过扩展同名定义，§5.3.5，ADR-220），所以 ADR-188 登记的“激活的是扩展版”在 SDK 下不再出现；RPC（M2）随 M2 复审。

#### (a) `ask_user`（running 与 shaping）

```ts
pi.registerTool({
  name: "ask_user",
  label: "Ask human",
  description: "Blocking question to the human. Options 'label: consequence'; '*' = your pick.",
  parameters: Type.Object({
    question: Type.String(),
    options: Type.Optional(Type.Array(Type.String(), { maxItems: 6 })),
  }),
  executionMode: "sequential",                     // 避免并行弹出多个对话框（types.ts:647）
  async execute(toolCallId, p, signal, _onUpdate, ctx): Promise<AgentToolResult<AskUserDetails>> { /* 见下 */ },
});

interface AskUserDetails {
  v: 1; reqKey: string;                            // ULID
  question: string;
  options: { id: string; label: string; consequence?: string; recommended: boolean }[];   // 由 "label: consequence" 和 '*' 解析而来
  answer?: { optionId?: string; text?: string };
  by: "human" | "timeout" | "aborted" | "no_ui";
  defaultApplied?: string;                         // optionId；只在 ADR-023 允许超时默认时出现
}
```

执行流程：

1. 解析 options，生成 `reqKey`，按 §5.6.4 构造对话框载荷 `{kind:"question", …}`。
2. `ctx.hasUI` 为 false（print 或 json 模式）时，返回 `isError:true` 和文本 “No human available”。
3. 按 §5.6.4 调用 `ctx.ui.input`。是否传 Pi 侧超时，扩展从 `policy.json` 读取（`ask.unattended`、`ask.afterSec`、`ask.oneWayDoor`）。
4. 解析应答 JSON `{optionId?, text?}`；不是 JSON 的应答视为自由文本。
5. 应答为 `undefined` 时，按 §5.6.4 的兜底规则处理。
6. 调用 `pi.appendEntry("tower.ui_resolved", {reqKey, by})`。
7. 返回给模型的内容示例：`Human chose "Use Redis lock". Note: keep TTL 24h.`，或 `No answer; pause and wait.`

**持久化**：答案只存在 `details` 中。它属于对话的一部分，随分支变化。Supervisor 根据 `tool.end` 把 Needs-You 标记为已解决，并写入 `HumanDecision{kind:"answer"}`。

#### (b) `log`（仅 running；可用 `features.log=false` 关闭，对应 ADR-009 的实验 E5）

```ts
pi.registerTool({
  name: "log",
  label: "Log",
  description: "Note for your supervisor at meaningful points. evidenceRefs: path:line|tool:<id>|comment:<id>.",
  parameters: Type.Object({
    kind: StringEnum(["plan", "step", "decision", "assumption", "finding", "cause", "risk", "next", "memory"] as const),  // 无 eta（ADR-030）
    text: Type.String(),
    rationale: Type.Optional(Type.String()),                       // ADR-030
    alternatives: Type.Optional(Type.Array(Type.String())),        // ADR-030，主要用于 decision
    confidence: Type.Optional(StringEnum(["low", "medium", "high"] as const)),   // ADR-030；定性，从不显示百分比（02 §2.7）
    evidenceRefs: Type.Optional(Type.Array(Type.String())),        // "src/a.ts:42" | "tool:<callId>" | "comment:<id>" | URL
    proposeSubgoals: Type.Optional(Type.Array(Type.String())),     // 仅在 kind=plan 时有效
    scopeHint: Type.Optional(StringEnum(["user", "project", "goal"] as const)),  // 仅在 kind=memory 时有效（09 §9.3.1）
  }),
  async execute(toolCallId, p): Promise<AgentToolResult<LogDetails>> {
    return { content: [{ type: "text", text: "ok" }], details: toLogDetails(p) };   // 不做阻塞操作，不调用 appendEntry
  },
});

interface LogDetails {
  v: 1; claimKey: string; kind: string; text: string;
  rationale?: string; alternatives?: string[]; confidence?: "low" | "medium" | "high";
  evidenceRefs: ParsedRef[];   // {type:"fileLine"|"trace"|"comment"|"url"|"raw", …}；解析失败的保留为 raw
  proposeSubgoals?: string[]; scopeHint?: "user" | "project" | "goal";
  ignored: string[];           // 与 kind 不匹配的字段（例如 kind=step 却带了 scopeHint），记录下来但不使用
}
```

- Supervisor 收到 `tool.end` 后生成 Claim：`kind` 直接沿用；`provenance` 中记录 `sessionId`、`piEntryId`、`toolCallId`，后两者来自 RPC 的 `get_entries` 或 SDK 的 sessionManager。entry id 只在单个会话文件内唯一，fork 出的文件会保留原来的 id（`session-manager.ts:277-284`；`forkFrom` 原样复制非头部条目，`:1815-1865`，D49），所以凡是引用 Pi 条目的地方（Provenance、`EvidenceRef{type:"trace"}`、检查点映射）都必须同时带上 `sessionId`。`crossCheck` 初始为 `unchecked`，之后由 `07` 的交叉校验器处理。
- `kind=plan` 且带 `proposeSubgoals` 时，生成一条 Needs-You `ratify`（severity 1，见 `03` §3.5）。
- `kind=cause` 生成 Claim `cause`，作为 Goal 页“原因”区块中的“原因”一侧；“症状”一侧来自 Fact（ADR-030）。
- `kind=memory` 生成 Claim `memory`，同时生成 MemoryProposal，进入批准队列（`02` §2.7、`09`）。
- `log` 产生的 Claim 一律是 `author:"worker"`；评审 Run 的意见只来自 `review_report`（§5.6.2e）。
- 返回内容只有一个 `ok`（约 1 token）。

#### (c) `submit`（仅 running）

```ts
pi.registerTool({
  name: "submit",
  label: "Submit",
  description: "Claim done (Tower re-verifies); if blocked, ask_user instead. Items: '<id> met|unmet|unsure: evidence'.",
  parameters: Type.Object({
    summary: Type.String(),
    criteriaSelfAssessment: Type.Array(Type.String()),
    risks: Type.Optional(Type.Array(Type.String())),
  }),
  // 兼容：模型传入 [{id,status,evidence}] 对象数组时，先规范化为字符串再校验（types.ts:597-598）
  prepareArguments: normalizeSubmitArgs,
  async execute(toolCallId, p, _signal, _onUpdate, ctx): Promise<AgentToolResult<SubmitDetails>> {
    const d = toSubmitDetails(p, cfg.criteriaIds, await workspaceFingerprint(ctx.cwd, cfg.shadowGitDir, { mode: "decisive" }));   // 07 §7.3.2；ADR-075：决定性 = 影子索引 + ctime/inode stat 检查（full 只在验收与 seal）
    return { content: [{ type: "text", text: "Submitted for verification. Stop now." }], details: d, terminate: true };
  },
});

interface SubmitDetails {
  v: 1; submitKey: string; summary: string;
  criteria: { id: string; status: "met" | "unmet" | "unsure"; evidence?: string }[];
  unknownIds: string[]; missingIds: string[];      // 与合同对比的结果；不阻止提交，交给 Supervisor 呈现
  risks: string[];
  fingerprint: string;                             // "wt1:<tree>"，只作信息记录（ADR-121：I4 以工具事件判定）
}
```

**有效 submit 规则**（`03` I4，ADR-121，按工具事件判定）：
- **有效** = 本 Run 最后一次 `submit` 之后，本 Run 没有**变更类工具调用**（唯一定义在 `16`，ADR-130：只读白名单之外的任何工具调用，含嵌套调用、MCP 工具、扩展与自定义工具；`bash` 按 `11` 动作分类，“不确定”算变更）（Observer 按 `toolCallId`、`parentToolCallId` 与 `tower.obs` 判定，不比较指纹；嵌套调用由 gate 在 `tool_call` 时记录）。`submit` 之后**仅由后台进程**（开发服务器、watcher、测试运行器）产生的变化不使提交作废：它们进入 settle 时的 `agent_bg_done` 检查点（`author:"agent"`），随 pin 一起被验证与评审。因此 Run 中持续写入的 watcher 不会触发 nudge。
- **pin 的树** = settle 之后 `agent_bg_done` 检查点的树（`06` §6.1.10）。`details.fingerprint`（`submit.execute` 在返回前计算的 `wt1:<tree>`，`07` §7.3.2）只作信息记录：Trace 中显示“submit 之后后台进程又改动了 N 个文件”。Supervisor 记录 `Run.submit = {toolCallId, fingerprint, at}`（`02` §2.6）。
- 需要这条规则的原因：`terminate:true` 只有在整个批次的所有工具结果都带 terminate 时才会生效（`agent-loop.ts:690-691`）。同批的其他调用，以及 submit 之后送达的 follow-up，都可能在 submit 之后继续改动代码（`agent-loop.ts:302`）。
- settle 之前判定无效时，tower-goal 的 `agent_before_settle` 发出一次 `tower.nudge`：“You changed files after submit; call submit again.”，占用同一个 nudge 次数配额（ADR-129：这是唯一的提醒途径）。

#### (d) `propose_contract`（仅 shaping）

```ts
pi.registerTool({
  name: "propose_contract",
  label: "Propose contract",
  description: "Submit the contract draft for human approval. criteria items: '<exec|human|artifact>: title | command or check'. Ends the run.",
  promptGuidelines: ["Explore read-only; ask_user if intent is unclear; then call propose_contract once."],
  defaultActive: false,
  parameters: Type.Object({
    title: Type.String(), purpose: Type.String(), endState: Type.String(),
    constraints: Type.Optional(Type.Array(Type.String())),
    criteria: Type.Array(Type.String()),
    scope: Type.Array(Type.String()),                   // include glob；"!glob" 表示 exclude
    plan: Type.Optional(Type.Array(Type.String())),
    risks: Type.Optional(Type.Array(Type.String())),
    openQuestions: Type.Optional(Type.Array(Type.String())),
  }),
  async execute(_id, p) {
    return { content: [{ type: "text", text: "Draft sent for human review. Stop now." }], details: toContractDraft(p), terminate: true };
  },
});
// details: ContractDraftDetails = { v:1; draftKey; contract: Omit<Contract,"version"|"status"|"ratifiedBy"|"ratifiedAt"> & {draftedBy:"agent"}; parseWarnings: string[] }
```

Supervisor 把草稿放进合同编辑器（`03` §3.4.1）。`exec` 类标准默认 `timeoutSec:600`，由人确认。验证一律在干净环境中进行（`02` 已删除 `cleanEnv`）。

#### (e) `review_report`（仅 review；独立评审 Run 的唯一输出工具，`07` §7.12 引用本定义）

```ts
pi.registerTool({
  name: "review_report",
  label: "Review report",
  description: "Report review findings on the diff against the contract. Each finding needs path:line evidenceRefs. Ends the run.",
  defaultActive: false,
  parameters: Type.Object({
    findings: Type.Array(Type.Object({
      text: Type.String(),
      evidenceRefs: Type.Array(Type.String()),                       // 必须是 path:line（07：fileLine）
      topic: Type.Optional(StringEnum(["constraint", "unrelated", "coverage", "test_weakened", "hotspot"] as const)),  // 07 §7.12 问题 ①–⑤
    })),
    summary: Type.Optional(Type.String()),
  }),
  async execute(_id, p) {
    return { content: [{ type: "text", text: "Review recorded." }], details: toReviewDetails(p), terminate: true };
  },
});
// details: { v:1; reportKey; findings: { text; refs: ParsedRef[]; topic? }[]; summary?; droppedFindings: number /* 没有合法 path:line 的条目 */ }
```

Supervisor 把每条 finding 转成 `Claim{kind:"review_note", author:"reviewer"}`（`02` §2.7），锚定到对应的评审单元或 hunk。没有合法 `path:line` 的 finding 会被丢弃并计数（`07` §7.12 的要求）。

### 5.6.3 模型面预算与 token 估算（ADR-009、ADR-030、ADR-032）

**估算口径**（ADR-032）：所有 Tower 预算门禁统一使用 `est(s) = ceil(asciiChars/4 + nonAsciiChars/1.5)`。对英文，这与 Pi 自己的 chars/4（`compaction.ts:298-310`）一致；对中文更保守（Pi 的口径会低估中文）。估算对象是 `{name, description, parameters}` 的 JSON 加上 guideline 文本。

`log` 按 ADR-030 扩充后（kind 增加 `cause`；新增可选的 `rationale`、`alternatives`、`confidence`、`scopeHint`；删除 `eta`），工具部分已无法放进 ADR-009 原定的 300。为此做了两处取舍：
1. 删除原来单独的 guideline 条目，把“完成时调用 submit、受阻时用 ask_user”并入 `submit` 的 description；
2. 压缩三个工具的 description。

压缩后 running 实测 **329**。ADR-009（第 1 轮修订）据此调整为：常驻总量 ≤ 650；工具 ≤ 350（余量 21）；系统段 ≤ 300，其中意图与终态 ≤ 70、标准标题 ≤ 110、记忆 ≤ 120。

| 项 | 预算 | running 实测 | shaping 实测 | review 实测 |
|---|---|---|---|---|
| `ask_user` 声明 | — | 67 | 67 | — |
| `log` 声明（ADR-030 全部字段） | — | 167 | — | — |
| `submit` 声明（含完成/受阻的指引） | — | 95 | — | — |
| `propose_contract` 声明（含 guideline） | — | — | 192 | — |
| `review_report` 声明 | — | — | — | 134 |
| **工具部分** | **≤ 350** | **329** | **259** | **134** |
| `tower_goal` · 意图与终态（含 Must not / Ask first if） | ≤ 70 | 65 | 38（草稿意图） | 40（评审问题清单引用） |
| `tower_goal` · 验收标准标题 | ≤ 110 | 26 | — | 26 |
| `tower_goal` · 生效记忆（置顶优先，其余按相关性，`09`） | ≤ 120 | 15（中文样例） | — | — |
| `tower_goal` · `More:` 行 | — | 10 | 10 | 10 |
| **`tower_goal` 系统段** | **≤ 300** | **116** | **48** | **76** |
| **常驻增量合计** | **≤ 650** | **445** | **307** | **210** |

- **常驻**指每次 LLM 请求都会带上的内容（工具声明 + 系统段）。系统段内容不变时 Pi 不生成补丁（`system-prompt.ts:217-229`；核实方式：契约测试 C4），不会重复计费。
- **相对 Pi 基线**（ADR-032、ADR-048，R2-D2-05）：Pi 自身的系统提示加工具 < 1000 token，本来就没有 to-do。所以 Tower 常驻的约 +445 token 是**纯增量**，没有替代 Pi 原有的任何开销。是否值得，只能通过测量判断，不能靠论证：实验 E5 用同一批任务做有/无配对（有/无 `log`、有/无 `tower_goal` 系统段），比较 (a) 任务成功率，(b) 每个成功任务的总 token 与成本比 `cost_with / cost_without`，(c) nudge 之后的恢复率。撤回规则按 ADR-048：`log` 在 M1 内部使用期默认开启，公开发布时的默认值由 E5 决定。关闭 `log` 后，工具部分降为 162，常驻约 280。
- **事件性注入**是一次性的 `tower.*` `custom_message`（`display:true`，在 Trace 中标记“Tower 注入”），上限如下：交接包（含人交还时的 `tower.handback`）≤ 300，返工证据 ≤ 400，nudge ≤ 60，`tower.processes_terminated` ≤ 120（被终止的命令与原因，最多 10 条，ADR-121），`tower.satellite_rebuilt` ≤ 60（每次卫星重建一段，由开场组装从 `satellite.recovered` 生成，`16` §16.1.12，ADR-180），压缩后账本块 `tower.ledger` ≤ 150（在 `session_compact` 之后单独发出，ADR-026，§5.6.5）。评论按条计，每条 ≤ 250（Tower 自定，非 ADR 约束）。
- 完整合同、范围细节、其余记忆写入 `contract.md`，系统段末行写 `More: read <path>`，由模型按需 `read`。这与 Pi 的 skill 只放名称和描述、正文按需读取的做法一致（pi.md §7.7）。gate 对这个路径放行读取（§5.6.5）。
- CI 门禁：契约测试 C15 用参考 Goal 和“最大 Goal”（10 条标准、置顶记忆满额、中文记忆）各渲染一次，按上述口径分项计算，任何一项超过预算即失败。

系统段模板（BriefingBuilder 渲染。Pi 会自动加上 `<tower_goal>` 标签，`system-prompt.ts:188-191`，所以文本里不写标签）：

```
G-0142: Fix double charge on retried checkout.
Why: provider timeout + client retry bills twice.
Done: same idempotency key => one charge, original result returned.
Must not: add migrations; change PaymentService API.
Ask first if: payment-SDK change needed.
Criteria: c1 `pnpm test -- checkout` passes; c2 new test covers timeout+retry; c3 `pnpm lint` passes.
Notes: use pnpm; amounts are integer cents.
More: read <goal-data-dir>/contract.md
```

每个分段各自截断，不互相挤占：意图分段先删 Why，再截短 Must not；标准分段先保留全部 id，再按序截短标题；记忆分段按置顶 → 相关性的顺序装满 120 token 为止。范围围栏**不写进系统段**：它由 gate 强制执行，模型越界时会从 block 原因中得知（§5.6.5）。

### 5.6.4 Tower 对话框规格（唯一定义，ADR-023）

本节是 Tower 所有阻塞对话的**唯一规格**，包括 `ask_user`、gate 审批和塑形提问。`08` §8.7 和 `11` §11.4 引用本节，不另行定义。

**方法**：两种 adapter 都只用 `ctx.ui.input(title, undefined, opts)`（`types.ts:157`），不用 `select`、`confirm`、`editor`。理由：`input` 能返回任意字符串；在 RPC 中支持 `timeout`（`rpc-types.ts:255-262`）；`editor` 没有超时（G22）。核实方式：契约测试 C7。

**载荷**：`title = "tower:" + JSON.stringify(dialog)`。（例外：RPC 下的凭据通道 `tower:{kind:"credential", provider}` 复用同一前缀，但由 Host 直接从密钥库应答、不生成 Needs-You，不属于本节的人机对话框；见 §5.3.6、ADR-049。）

```ts
interface TowerDialog {
  v: 1; reqKey: string;                               // tower-goal 生成的 ULID；用于幂等和关闭
  kind: "question" | "approval";                      // 塑形提问也是 question（phase 区分）
  phase: "shaping" | "running";
  goalId: GoalId; runId: RunId; toolCallId?: string;  // approval：被拦截的工具调用
  question: string;                                   // approval：一句话说明“要做什么”
  options: { id: string; label: string; consequence?: string; recommended?: boolean }[];
  allowFreeText: boolean;
  approval?: { actionClass: string; oneWayDoor: boolean; inputHash: string; summary: string };   // 11 §11.1、§5.6.5 gate
}
interface TowerDialogAnswer {                         // input() 的返回值，同为 JSON 字符串
  optionId?: string; text?: string;
  by: "human" | "timeout";                            // timeout 只会由 Supervisor 在 use_defaults 下写入
  pause?: true;                                       // 超时且不允许默认作答 → 扩展回复“暂停等待”，Supervisor 进入 drain
  decisionId?: DecisionId;
}
```

**超时**（Supervisor 计时器是权威）：

| 合同 `unattended` | Pi 侧 `opts.timeout` | Supervisor 行为 |
|---|---|---|
| `"wait"`（默认） | **不传**，永不超时 | 不设计时器；防饿死策略由 `08` 负责（L2 停留 20 min 后升为 L3 一次） |
| `"use_defaults"` | `(afterSec + 60) × 1000`（兜底） | 从 `surfacedAt` 起计时，到 `afterSec` 时按下表的默认项规则应答 |

**默认项安全规则**（由 Supervisor 计算，扩展不参与）：
- `approval`：只能默认**拒绝**；`oneWayDoor` 永不超时（不设计时器，也不传 Pi 侧超时）；
- `question`：`riskTier ≥ standard` 时**不允许**默认作答，超时即应答 `{by:"timeout", pause:true}`；只有 `riskTier = low` 且 Harness 按动作类判定为可逆（只涉及卫星内的文件、不涉及单向门动作类）时，才默认 Agent 推荐的选项。可逆与否不采信 Agent 的说法。

**兜底行为**（Pi 侧超时触发，说明 Supervisor 已不可用）：扩展收到 `undefined`。`approval` 一律按拒绝处理；`question` 一律回复 `No answer; pause and wait.`。扩展从不自行套用 Agent 推荐的选项。收到 abort 信号时记 `by:"aborted"`。无论哪种结束方式，都执行 `appendEntry("tower.ui_resolved", {reqKey, by})`（G21）。

**撤销窗口**（R1-D5-11）：人回答之后，Supervisor 先把答案**保留 5 s**（`answerHoldMs`，可设为 0），再调用 `answerUi`。卡片上显示“5 秒后发送 · 撤销”，并提供“立即发送”。这 5 s 就是**真实的**撤销窗口。一旦 `answerUi` 执行，SDK 中对话框的 Promise 会立即兑现（RPC 中应答写入 stdin 后也会被立即消费，`rpc-mode.ts:766-780`），撤销就不可能了。之后要改主意只能“改判”：以 `timing:"now"` 的转向消息送达，例如“Correction to your question N-…: use option B instead.”。审批一旦送达，工具就已经开始执行，改判只能影响后续动作。`04` F3 和 `12` 的 DecisionCard 已与此对齐（5 s 撤销窗口，送达后只能改判）。

### 5.6.5 钩子

| 事件 | 签名 / 返回 | tower-goal 的行为 |
|---|---|---|
| `session_start` | `types.ts:755-761` | 读取配置；按阶段 `setActiveTools`；从 `ctx.sessionManager.getBranch()` 重建分支内状态（nudge 次数、最后一次 submit、checkpoint 序号；做法见 `docs/extensions.md:236`） |
| `before_agent_start` | 事件 `types.ts:932-957`，结果 `:1496-1500` | ① **每次** run 都设置 `event.systemPromptOptions.sections.tower_goal = readBrief()`（`system-prompt.ts:29-30, 184-186`）。内容不变时，`diffSystemPromptSections` 不生成补丁（`system-prompt.ts:217-229`），所以没有额外 token；内容变化（例如合同修订）时，追加一个 section 补丁。② **返工证据只有一条注入路径**（ADR-138）：开场的 `inject(tower.rework)`（§5.8）。本处只在崩溃恢复时补发：`episodic` 文件存在、当前分支上没有 `details.key` 相同的 `tower.handoff`/`tower.rework` 消息，**且**本次触发不是 `messageType:"custom"` 且 `event.message.details.key` 相同的消息（`_prepareRun` 中 `before_agent_start` 先于触发消息写入会话，按分支去重看不到它，v1.2.0 `agent-session.ts:1885-1935`）时，返回 `{message:{customType:"tower.handoff"或"tower.rework", content, display:true, details:{v:1,key}}}`。同时在本 Tower Run 的第一个 `before_agent_start` 写 `tower.run_start` 条目（nudge 窗口起点，ADR-143/144）。③ 不返回 `systemPrompt`，因为它会替换整个提示词（`docs/extensions.md` “Events and concurrency”） |
| `tool_call` | 事件 `types.ts:1193-1265`，结果 `:1454-1463` | gate，见下文 |
| `tool_result` | 事件 `types.ts:1267-1340`，结果 `:1483-1489` | 观察点，见下文 |
| `turn_start` | `types.ts:1058-1063, 1651`；Pi 在每次模型调用之前等待它（`packages/agent/src/agent-loop.ts:117-118, 146-147, 207`，重试与续跑经 `agent.continue()` 同样经过；`agent.ts:609-610`；`agent-session.ts:1143, 1293-1299`） | SDK（M1，ADR-234）：经 `bridge` 让 Host 读一次 `getRegisteredProviderIds()`，对新列出的 provider 等 `removeRuntimeApiKey` 完成后返回——移除经凭据操作队列异步执行（`core/model-runtime.ts:579-597, 634-640`），只能在被等待的处理器中完成，适配器的事件订阅不被等待（`agent-session.ts:1039-1043`）；SDK 中 tower-goal 最后加载（`resource-loader.ts:781`，本节 `tool_call` gate 一段），用户扩展在同一 `turn_start` 中先于它的注册因此被这次读取看到；`bridge` 失败或移除被拒绝时处理器抛出——Pi 捕获后以 `extension_error` 报告、照常发出请求（`core/extensions/runner.ts:1096-1125`）；tower-goal 在抛出之前自报（下文第 6 项），计入 `06` §6.8 F13，这一次请求可能仍带已注入的密钥，窗口延续到下一次 `turn_start`（如实登记，ADR-235）；每次都出错时按处理器计数，第三次即以 `prepare_failed` 暂停，所以至多三次请求受影响（第 6 项，ADR-239）；读取与注入的规则只按 `11` §11.7.1 |
| `turn_end` | `TurnEndEvent extends BoundaryState`（`types.ts:1065-1072`）；Pi 会等待 handler（`agent-session.ts:847-885, 887-897`），因此 handler 只把任务入队后立即返回 | 检查点（异步执行），见下文 |
| `agent_before_settle` | `types.ts:1028-1030`，结果为 `BoundaryResult` | nudge，见下文 |
| `session_before_compact` | — | **不注册**（ADR-026）。Pi 的默认压缩路径保持不变，包括 streamFn、重试、`summarization_retry_*` 事件和路由解析（`agent-session.ts:2748-2771`） |
| `session_compact` | `types.ts:798-806` | 每次压缩成功后，把 `situation.md` 渲染为 `tower.ledger` 账本块（≤ 150 token，Fact 语法），作为 `display:true` 的自定义消息送入：`pi.sendMessage({customType:"tower.ledger", content, display:true}, {triggerTurn:false})`（ADR-026 第 2 轮修订）。流式输出时，消息进入 `_pendingCustomMessages`，在回合结束、settle 之前或 run 结束时写入，**不触发新回合**；空闲时立即追加（`agent-session.ts:2318-2353（v1.2.0）`，v1.2.0 行号）。**不能**用 `deliverAs:"steer"`：它会让队列非空，`_runAutoCompaction` 随之调用 `agent.continue()`，强行多开一个回合（R2-D5-02）。`tower_goal` 系统段在压缩后依然保留，因为系统提示始终在上下文中（`compaction.md` “What the LLM sees”）。契约测试 C17 覆盖 |
| 命令 `/tower-nav`、`/tower-fork` | `registerCommand`（`types.ts:1680`），handler 拿到 `ExtensionCommandContext` | `await ctx.navigateTree(id, {summarize, label})` 或 `await ctx.fork(id, {position:"at"})`（`types.ts:416-425`）。fork 会替换 runtime，旧的扩展实例随之失效（`docs/extensions.md` “Context and session changes”），所以不再追加条目；完成以响应之前没有对应的 `extension_error`、且 `get_state` 的 `sessionFile`（分叉）或叶子（导航）已变化为准（D55，ADR-183）；导航目标已是当前叶子时 Tower 不发命令、视为已完成（v1.2.0 `navigateTree` 对此直接返回、叶子不变，`agent-session.ts:4002-4007`，ADR-184）。只有 RPC adapter 使用（§5.4.4）。命令名以 `tower-` 开头，避免与用户命令冲突 |
| `input` | 事件 `types.ts:1171-1181` | 只观察，返回 `{action:"continue"}`。如果文本带 Tower 标记行，执行 `appendEntry("tower.receipt", {keys, stage:"accepted", streamingBehavior})`。这样 JSONL 中就有 Pi 已接收的持久凭据，用于崩溃后去重（§5.7.4） |
| `ui_prompt_start/end` | `types.ts:1039-1055` | 不处理。宿主已经通过 UIContext 或 RPC 记录看到这些对话框 |
| `session_shutdown` | `types.ts:824-829` | 清理 `toolCallId → 前像` 的缓存 |

#### `tool_call` gate（自主度矩阵 + 范围围栏 + 停止条件）

分类器、动作类、四级判定（`silent / notify / ask / forbid`）以及授予（grant）的语义，都以 `11` §11.3–11.4 为准。本节只规定 gate 在 Pi 集成层的**机制**：策略从哪里来、怎样询问人、怎样留下记录。

```ts
interface TowerPolicy {          // <runDir>/policy.json，由 Supervisor 把合同和 11 的自主度矩阵编译而成
  v: 1; version: number; mode: "normal" | "draining";
  roots: string[];               // 卫星根（realpath）
  readAllow: string[];           // 例如 runDir、contract.md
  scope: ScopeFence;             // 02 §2.5，原样传入
  autonomy: CompiledAutonomy;    // 11 §11.3 decide() 的输入：动作类 → 级别，含单向门标记
  grants: Grant[];               // 已获得的授予（11 §11.4、§11.5）
  stop: { id: string; kind: "path_touched" | "command_matches"; patterns: string[]; silenced: string[] }[];   // ADR-139：M1 只有这两种在 gate 中求值；由 Supervisor 按 06 goals.stop_condition_silences 编译：scope=run 的对象进入 silenced，scope=until_amend 的条件整条省略
  ask: { unattended: "wait" | "use_defaults"; afterSec?: number };   // §5.6.4；只用于决定是否传 Pi 侧兜底超时
  sandbox: "S0" | "S1" | "S2";   // 11；S0 时执行 Agent 代码需要 Goal 级授权（ADR-022）
  s0Granted: boolean;            // Goal.s0Grant === "granted"（02 §2.4）；S0 授权是 Goal 的状态，不是 grants 中的 Grant，不经 applyGrants；
                                 // s0Grant 变化（授权、拒绝、11 §11.2 的失效）的同一事务之后 Supervisor 重写 policy.json（ADR-182）
  scriptDigest: Record<string, { file: string; mtimeMs: number; size: number; bodySha: string }>;   // 名称与 11、14、16 统一
                                 // 预算好的脚本体哈希（package.json scripts、Makefile 目标等），键为 "npm:test" 之类
}
```

判定流程（每次调用；目标 p95 ≤ 5 ms（与 `11` §11.4 一致）、p99 ≤ 15 ms（本节补充，`11` 只定 p95），不含 ask 的等待时间）：

1. Tower 自己的工具（`ask_user`、`log`、`submit`、`propose_contract`、`review_report`）与内置的 codemode 容器、`tool_search` 直接放行——按注册来源判定，不按名字（`11` §11.3.4 工具来源，ADR-186）。**Tower 工具名的来源复核**（ADR-188）：调用名是上述 Tower 工具名、但调用时 `pi.getAllTools()` 中该名字的生效来源不是 `<inline:tower-goal>`（Run 中途有扩展注册了同名工具，Pi 允许在 `session_start` 之后乃至其他扩展的 `tool_call` 处理器中注册，`docs/extensions.md:183`；gate 是最后一个处理器，看到的是调用前的最终注册表）时，返回 `{block:true, reason, terminate:true}`，`appendEntry("tower.selfcheck", {kind:"tower_tool_shadowed", names})`；Supervisor 据此以 `drainingFor={target:"pause", reasons:["prepare_failed"]}` 开始 drain，卡片写出注册该名字的扩展（与 Run 开始前的自检同一原因，但写 `运行已停止`，`04` §4.8.11，ADR-189）。这类调用不会出现审批卡。gate 不能关闭（ADR-176，与 `16` §16.6 一致），没有“`features.gate=false` 时放行”的分支。这一步在阶段检查与第 2 步的 draining 分支之前返回：塑形、评审阶段或 drain 中被调用的 `tool_search` 仍会改变可见的工具集，codemode 容器仍会启动；但被加载的工具与容器内的嵌套调用照常逐次经过本钩子，阶段之外的工具与 drain 中的调用照常被拒绝，不越权（ADR-187）。
2. 若 `policy.mode === "draining"`，返回 `{block:true, reason:"Tower is pausing this run; stop and wait.", terminate:true}`。暂停、预算硬上限、退出应用都走这个分支（`06` §6.1.4）。
3. 如果 bash 调用没有设 `timeout`，就修改 `event.input` 注入 `timeout = 1800`（`08` §8.6.3；input 可以原地修改，`types.ts:1250-1255`）。然后 `classify(event)`（`11`）：把调用规范化为效果集合。
   - `read`/`edit`/`write`：路径按 `11` §11.3.1 的求路径与分类（唯一定义；访问时由 S2 强制，同节使用时强制，ADR-220）。`write` 额外把前像（对该求出的路径取：文件是否存在、哈希；Host 按 `10` §10.1.3 的规则读取——逐级不跟随、只接受普通文件、带大小上限与超时，超出或不是普通文件时省略 `prevSha256`，ADR-221）存入 `Map<toolCallId, PreImage>`，供 `tool_result` 使用。
   - bash：命令解析。
   - 白名单之外的 Pi 内置工具（来源以 `builtin:` 开头、但不在 `11` §11.3.4 的 `builtin:` 来源允许表中——允许表只有 `TOWER_BUILTINS` 的 `builtin:<工具名>`（只在回归保护下生效）与 `builtin:codemode`、`builtin:tool-search`、`builtin:mcp`，例如 v1.2.0 的 `powershell`、`grep`、`find`、`ls`，ADR-190/220）：按沙箱外执行，硬底线 forbid（唯一定义 `11` §11.3.4 工具来源）。Host 已以 `excludeTools` 不注册它们（§5.3.5），这一条是纵深防御。
   - 沙箱外工具（按 `getAllTools()` 的 `sourceInfo` 判定，即用户扩展注册的工具、`mcp__*` 与 MCP 资源工具）：一律归 `tool.external`，不读注解（下限 ask，授权按工具名精确匹配），并扫描参数中的路径（唯一定义 `11` §11.3.4，ADR-185/186）。
   - 嵌套的 codemode 调用同样经过本钩子，并带 `parentToolCallId`（`types.ts:1193-1203`）。
4. **停止条件**（ADR-139，在 `decide()` 之前、工具执行之前求值）：对分类结果中的路径与命令，先查静默状态（`Goal.stopConditionSilences`，`06` 列 `stop_condition_silences`，经 `policy.stop[].silenced` 与省略项编译进策略；每次写入后 Supervisor 重新写 `policy.json`），再逐条匹配 `path_touched`/`command_matches` 条件（跳过已静默的对象与条件）。命中 → 返回 `{block:true, reason:"Stop condition <id>: a human must confirm before this.", terminate:true}`，`appendEntry("tower.stop", {conditionId, object, toolCallId})`；Supervisor 据此以 `drainingFor={target:"pause", reasons:["stop_condition"]}` 开始 drain，结束后进入 `paused(stop_condition)`（ADR-138）。另一种 M1 条件不在 gate 中：`no_progress_for` 由 Supervisor 计时器求值（`rework_cycles_over` 已删除，返工上限只由 I6 / `Contract.maxReworkCycles` 定义，ADR-143）；`natural` 只作为注入给模型的文字，模型以 `ask_user` 提问（产生 `question`，不是 `stop_condition`）。**再武装**：人选“继续” → 写入 `stopConditionSilences{conditionId, scope:"run", object}`（绑定到“继续”之后开始的那个 Run，该 Run 结束时清除，ADR-143 补记），`no_progress_for` 计时器重置；“这里不该停” → 写入 `{conditionId, scope:"until_amend"}`，`contract.amend` 时清除（编译时省略该条件）。
5. `decide()` 得到级别：
   - **S0 授权**（ADR-022、ADR-068）：分类结果为 `exec.test`/`exec.build`、`policy.sandbox === "S0"`、且 `policy.s0Granted` 为假（`Goal.s0Grant ≠ granted`）时，级别至少提升为 **ask**，选项为“允许本 Goal 在无沙箱环境中运行测试与构建 / 拒绝”。
     - **运行阶段**：这是门禁 ask，Mode 为 `blocked_guard`，Run **不** drain、Goal **不**暂停。`unattended:"use_defaults"` 时 30 min 后默认拒绝（§5.6.4 的审批默认项规则）；拒绝时这次调用被 block，Agent 收到原因。
     - **批准**：Supervisor 写 `Goal.s0Grant = granted` 并重写 `policy.json`；失效条件只按 `11` §11.2（合同修订、检查点命中 `scope.protected`、远程批准的统一有效期，ADR-182），失效前不再询问。
     - **验证阶段**：不经过本 gate，由 Supervisor 的 `decide()` 处理。没有授权时 `verifying → paused(s0_grant_pending)`；授权后以同一 pin 回到 `verifying`；拒绝授权时同样以同一 pin 重新验证、exec 标准不执行，去向由 `decide()` 判定（无阻断命中且 artifact 标准通过时以“未经机器验证（S0 未授权）”进入 `in_review`，`07` §7.10.3，ADR-188）。
     - S2 下这两类是 `silent`。
   - **silent**：直接放行。
   - **notify**：放行，并 `appendEntry("tower.gate", {toolCallId, class, level:"notify"})`。Supervisor 把它转为 Fact `policy_notify`。
   - **forbid**：返回 `{block:true, reason}`。`reason` 告诉模型这是 Tower 的策略，可以用 `ask_user` 申请（`11` §11.3）。同时 `appendEntry("tower.gate", {…, level:"forbid"})`。
   - **ask**：构造 `kind:"approval"` 的对话框载荷（§5.6.4），带上解析出的程序和参数、命中的动作类、相关合同条款，以及最近一次 `log` 作为 Claim。然后 `await ctx.ui.input(...)`。批准时，如果附带授予，Supervisor 会写入新版本的 `policy.json`。拒绝时返回 block。结束时 `appendEntry("tower.gate", {…, decidedBy})`。等待期间 Mode 为 `blocked_guard`。
   - **`secrets.access`**（ADR-161/162）：M1 中该动作类**照常分类**凭据读取类命令（例如读取钥匙串、云凭据文件），按 `11` 的级别 ask 或 forbid；只有**注入**部分推迟到 M2——M1 中 Agent 的工具调用**从不**获得钥匙串中的机密，需要机密的检查在 M1 中写为 human 标准（带机密的验证标准整体归 M2，ADR-164）；批准后的 `approved_waiting`、`secrets.access.use_now` 与单次调用注入在 M2 重新设计（注入点同为 Tower 的 `exec`）。
   - 只要放行（silent、notify、批准后的 ask），就记录 `approvedInput.set(toolCallId, {hash: sha256(canonicalJSON(event.input)), at})`。两种适配器都**不冻结**输入（ADR-065）。
   - **防泄漏**：被后续处理器阻断的调用不会到达 `tool_result`（`agent-loop.ts:744-756`），对应的 `approvedInput` 条目就留下了。清理规则有两条：在 `turn_end` 时清掉本 turn 的全部 toolCallId；另外任何条目超过 10 min 一律清除。被阻断的调用会以 `tool.end{isError:true}` 出现在事件流中，Supervisor 据此记一条“已批准但被其他扩展阻断”的 Fact。
6. **故障保护**（唯一定义，ADR-237；`06` §6.8 F13 引用）：handler 抛出异常时，Pi 会阻断这次工具调用（`docs/extensions.md:263`）——`emitToolCall` 不捕获（`core/extensions/runner.ts:1249-1267`），`agent-session.ts:667-681` 重新抛出，`packages/agent/src/agent-loop.ts:770-776` 把它变成一条错误的工具结果。但 Pi v1.2.0 **不为 `tool_call` 发 `extension_error`**：只有通用的 `emit` 捕获处理器异常并 `emitError`（`runner.ts:1100-1120`，`turn_start` 走这里），`runner.ts` 与 `agent-session.ts` 中所有 `emitError` 的 `event` 都不是 `tool_call`。所以检测由 tower-goal 自己做：gate（`tool_call`）与 `turn_start` 处理器都以 try/catch 包住自身，出错时先经 `bridge` 报告（Host 转为 `engine.error{source:"extension"}`，生成 Needs-You `anomaly{detector:"tower_goal_handler_error"}`，severity 3，subject 为处理器名；去重键 `an:{goalId}:tower_goal_handler_error`，同一 Goal 合并为一条，`08` §8.4——它针对 Tower 自身的运行过程，按 `07` §7.10.1 的分类规则是 anomaly 而不是 sentinel，ADR-239），再重新抛出，保持 Pi 的阻断与照常发请求；Pi 另发的 `extension_error`（`turn_start`）只进诊断，不重复计数。**`tool_result` 的脱敏处理器相反，不重新抛出**（ADR-238）：Pi v1.2.0 的 `emitToolResult` 对每个处理器 try/catch，出错只 `emitError({event:"tool_result"})`（`runner.ts:1190-1247`，catch 在 `:1223-1232`），没有处理器改动结果时返回 `undefined`（`:1236-1238`），原始结果照常进入模型与会话——对这个事件“抛出”等于放行。所以脱敏处理器同样以 try/catch 包住自身，出错时经 `bridge` 自报（同上，计入同一计数），并**返回**一个隐去原文的结果：`content` 只有 `工具已执行，但结果未能脱敏，已隐去`（写明已执行，免得模型把它当作没有执行而重跑有副作用的命令，ADR-239），`isError: true`，`structuredContent` 与之一致（ADR-004 约束，不含原输出），`details: {}`（Pi 只在处理器返回的 `details` 不是 `undefined` 时替换它，`runner.ts:1206-1209`，否则原 `details` 随结果写入会话文件并进入 `tool.end`，`agent-loop.ts:890, 919-944`；空对象即把它替换为空，ADR-239）；这个结果是不读原结果的常量，所以构造它本身不会再失败。观察点与脱敏在同一处理器中时，这一次的 `tower.obs` 随之缺失，`command_result` 少这一条（占位结果带 `structuredContent`，`structured_content_dropped` 不触发；如实登记，ADR-239）。失败的方向因此是“这一次结果被隐去”，从不是“原文进入模型”（fail-closed）。**计数**（ADR-238；ADR-239 改为按处理器）：按 Goal 与处理器（`tool_call`、`turn_start`、`tool_result` 各一个计数），在 Host 进程内；**只由同一处理器的一次正常完成清零**，其他处理器正常完成不影响它（Pi v1.2.0 中每个 turn 都经过 `turn_start` 与 `turn_end`，被阻断或抛出的 gate 调用是立即结果、不经 `tool_result`，`packages/agent/src/agent-loop.ts:600-613, 744-776`——按 Goal 合计、任一处理器完成即清零时，持续失败的单个处理器几乎到不了 3 次）；新的 Host 进程从 0 开始。同一处理器连续 3 次出错时，Supervisor 进入 drain 流程并以 `prepare_failed`（运行中途停止的一种，卡片 `运行已停止 · 扩展 tower-goal 连续出错`，`03` §3.2.1；不在启动时自动解除，交还即解除）暂停该 Goal，不会在 gate、`turn_start` 或脱敏持续失效的情况下继续运行——`turn_start` 一支因此至多三次请求受影响（本节 `turn_start` 一行）。`bridge` 本身失败时自报也可能失败，这一次不计数（M1 的 `bridge` 是 Host 进程内的对象，这时 Host 本身多半已按 `06` §6.8 F4 处理；如实登记）。**其余处理器**（`before_agent_start`、`input`、`turn_end`、`agent_before_settle` 等）出错时不自报，Pi 的 `extension_error` 只进诊断（§5.5）：这一次可能缺少简报段与 `tower.run_start`、回执、检查点请求或 nudge，如实登记为已知缺口——它们都不放行机密，也不越过 gate。
7. **处理器顺序**（ADR-024 第 1 条，G32）：
   - **SDK**：tower-goal 是 `extensionFactories` 的最后一项，inline 扩展又在所有扩展之后加载（`resource-loader.ts:781`），所以 gate 是最后一个 `tool_call` 处理器，看到的就是最终输入。Host 启动后检查 `extensionsResult.extensions`：tower-goal 必须排在最后，而且其后没有任何扩展的 `handlers` 含有 `tool_call`（`types.ts:2268-2284`）。检查不通过就拒绝启动 Run。契约测试 C20 覆盖。
   - **RPC**：`-e` 扩展最先加载（`resource-loader.ts:577-578`），**做不到**最后。依靠适用条件（只在没有拦截型扩展时可用）和第 8 条哈希比对（事后发现）（§5.4.1，ADR-065）。
8. **输入比对**（ADR-024 第 2 条，R4-D5-01）：只对 **Tower 注入的 `<sdk:read>`、`<sdk:edit>`、`<sdk:write>` 与 `<sdk:bash>`**（回归保护下为对应的 `builtin:<name>`）做比对（按来源，不按名字，`11` §11.3.4 工具来源；覆盖了内置工具名的扩展工具不参与，ADR-187/220）。gate 放行时保存输入的**深拷贝**和哈希；到 `tool_result` 时，对这些工具重新计算 `sha256(canonicalJSON(event.input))`，与放行时的哈希比较。在 v1.2.0 中，同一个参数对象依次传给 `tool_call`、`execute` 和 `tool_result`（`agent-session.ts:659-700`；`agent-loop.ts:727-760, 832-834`），所以扩展工具和 MCP 工具在 `execute` 中修改自己的参数**是允许的**，它们不参与比对，以免误报。内置工具不会修改自己的参数（edit 的规范化发生在 `structuredClone` 之前，`edit.ts:103-134`、`validation.ts:318-320`；C30 断言）。对参与比对的工具，哈希不一致即产生 severity 3 的哨兵 `input_mutated_after_gate`（附放行时深拷贝与执行时输入的差异），Supervisor 立即走 drain 流程。SDK 下 gate 是最后一个处理器，这种情况不应出现，只作防御；RPC 下它是兜底检测。契约测试 C22 与 C30 覆盖。
9. **延迟预算与测量**（R1-D11-08）：热路径上**不启动任何子进程**。
   - 脚本体是否被改过，查 `policy.scriptDigest`：`stat` 文件，mtime 和 size 都没变就直接用预算好的 `bodySha`；变了就只读这一个文件、重新计算哈希（典型 package.json < 0.2 ms）。
   - `scriptDigest` 由 Supervisor 在每次 Run 启动时，以及每个检查点之后（在 git worker 中）重新计算，并写入 `policy.json`。
   - bash 解析：M1 用正则分类器（ADR-038），M2 换成 tree-sitter-bash WASM，单次解析约 1 ms。
   - 每次判定记录 `gate.decide_us`（按动作类分桶的直方图），进入 `06` §6.7 的 `system` 主题。CI 用 2000 条真实命令语料做基准测试，p95 > 5 ms 或 p99 > 15 ms 即失败。

bash 的分类是尽力而为的启发式。真正的隔离来自卫星克隆以及 `11` 的沙箱选项，这一点在 UI 中如实说明。事后检测（每个检查点的路径差集）在 `11` §11.4 末尾。

#### `tool_result` 观察点

Observer 在 Supervisor 中运行，输入是 `tool.end`。两个 adapter 发出的 `tool.end` 相同，其中带有 `details` 和 `structuredContent`（`AG/src/agent-loop.ts:919-928`）。

**来源分级**（ADR-024 第 3 条，R1-D5-06）：`tool.end` 已经经过所有扩展的 `tool_result` 处理器（`runner.ts:1190-1247`）。用户扩展（M1 中不加载项目扩展，`11` §11.8.1）可以改写 `content`、`isError`、`details`、`structuredContent`，也就能伪造退出码。所以由 `tool.end` 派生的 `command_result`、`files_touched` 带 `via:"pi_extension_chain"`，只用于“观测到 O/M”这一轨（ADR-020）和交叉校验，**不能单独让任何东西变绿**。验收依据 `criterion_check` 只由验证器在 Pi 之外直接执行产生。`files_touched` 和 `diffstat` 的权威来源是 git 检查点，不是工具事件。

扩展的 `tool_result` 只做三件事：补全 Pi 留下的歧义、标准化结果，以及 gate 第 8 条的输入比对。

**带外记录**（R2-D5-03）：后续的 `tool_result` 处理器可以整体替换 `details`（`runner.ts:1206-1209`）。在 RPC 中，tower-goal 的 `tool_result` 又是**第一个**运行的（G32）。所以 Tower 的观察结果**不写进 `details`**，改为 `pi.appendEntry("tower.obs", {toolCallId, inputHash, …下表内容})`。custom 条目不在任何扩展的改写范围之内，并且与该调用的 toolResult 条目同在会话树上。Observer 把 `tool.start` + `tool.end` + `tower.obs` 三者按 `toolCallId` 合并。即便如此，这些内容仍然只算观测轨（ADR-024 第 3 条）。

**ADR-004 约束**：任何改写 bash 结果 `content` 的 `tool_result` handler，都必须同时返回改写后的 `structuredContent`，否则 Pi 会丢弃它（`types.ts:1478-1489`），退出码随之丢失。tower-goal 的观察点不改结果，只写带外的 `tower.obs` 条目。密钥脱敏会改 `content`（`11` §11.7），因此脱敏 handler 必须同时返回脱敏后的 `structuredContent`（`details` 同样返回脱敏后的值，`11` §11.7.1 脱敏一行，ADR-239）；在 RPC 中，脱敏 handler 不是最后一个 `tool_result` 处理器（G32），后续扩展看到的是脱敏之后的内容，但它们可以再改，这一点登记在 `11`。运行时检测规则：如果 `bash` 的 `tool.end` 带有 `isError` 或输出，却没有 `structuredContent`，也没有 `tower.obs.exitCode`，就产生 Fact `anomaly{detector:"structured_content_dropped"}`（分类以 `16` §16.1 为准） 并告警（`07` §7.2）。

| 工具 | 补全内容（写入 `tower.obs` 条目，不改动 Pi 的结果） | 依据 |
|---|---|---|
| `bash` | `{exitCode, timedOut, aborted, wallSec}`。正常结束时取 `structuredContent.exit_code`（`bash.ts:55-62, 391-408`）；超时或中止时 Pi 抛出的是 Error 文本（`bash.ts:375-379`），没有 structuredContent，由扩展从文本中识别 | Observer 不再需要解析错误文本 |
| `write` | `{path, existed, prevSha256?, newSha256, bytes}`。前像来自 `tool_call` 阶段的缓存。原始 `details` 为 `undefined`（`write.ts:87`；`types.ts:1305-1308`） | 区分新建文件和覆盖已有文件，测试完整性哨兵依赖这一点 |
| `edit` | 不做处理。Pi 已经提供 `details.patch`，即 unified diff（`edit.ts:70-77`） | — |
| 其他 | 不做处理 | — |

`tool_result` 的修改会持久化到 toolResult 消息里，所以是分支正确的。核实方式：结果改写语义由契约测试 C12 验证，`structuredContent` 被丢弃的行为由 C27 验证。它也会出现在 `tool_execution_end.result` 中，因为 afterToolCall 先执行，之后才发出事件（`agent-loop.ts:870-892, 919-928`）。权威 diff 一律来自 git（§5.9 G3、G4）。

#### `turn_end` 检查点

算法、ref 命名、成本分级和降级规则都以 `10` §10.7 的 `captureCheckpoint` 为准；**影子的唯一写者是 Supervisor 的 GitService**（`10` §10.7.2，ADR-183），扩展不在 Host 中执行它。本节只规定扩展怎样发出请求、结果怎样写回 Pi：

```ts
pi.on("turn_end", (event, ctx) => {
  if (!cfg.features.checkpoints || !turnMaybeMutated(event.toolResults)) return;   // 宁可多做：见下方预筛规则
  // ADR-071：每次影子操作前，GitRunner 先用自身的文件遍历（不经 git）扫描卫星中嵌套的 .git（目录或文件指针），
  // 以 :(exclude) pathspec 排除；影子索引中已有 gitlink 时先 update-index --force-remove。gitlink 永不进入影子索引
  // captureCheckpoint 内部比较树：与上一个 cp 的 tree 相同（指纹未变）→ 不新建（03 §3.4.2，10 §10.7.1 第 5 步）
  const piEntryId = ctx.sessionManager.getLeafId();  // 同步取 turn_end 时刻的叶子（10 §10.7.1）；toolResult 已追加，叶子即本 turn 最后一条
  // 10 §10.7.2：异步，不阻塞下一 turn；请求经 Host 通道交给 Supervisor，由 GitService 持该卫星的 wtLock 按到达顺序执行（唯一写者，ADR-183）
  cpQueue.enqueue(async () => {
    const cp = await host.requestCheckpoint({ goalId: cfg.goalId, runId: cfg.runId, piEntryId });
    // GitService 经 GitRunner（ADR-060）：--git-dir=<影子> --work-tree=<卫星> + 加固的 -c 与 GIT_CONFIG_NOSYSTEM/GLOBAL；从不读卫星的 .git、config、index、hooks
    if (cp.created) pi.appendEntry("tower.checkpoint",
      { v: 1, n: cp.n, commit: cp.commit, tree: cp.tree, head: cp.head, piEntryId, sessionId: ctx.sessionManager.getSessionId(), runId: cfg.runId, ms: cp.ms });
  });
  // 不返回 entries：检查点条目在异步完成时追加，并显式记录 piEntryId，不依赖它在树上的位置
});
```

- **预筛规则 `turnMaybeMutated`**（R1-D5-12，宁可多做检查点）：本 turn（含 `tool_call` 钩子看到的带 `parentToolCallId` 的嵌套调用）中没有任何**变更类工具调用**（唯一定义在 `16`，ADR-130：只读白名单之外的任何工具调用，含嵌套调用、MCP 工具、扩展与自定义工具；`bash` 按 `11` 动作分类，“不确定”算变更）时才跳过；只读白名单本身也以 `16` 为准，本文不复述。其余情况都调用 `captureCheckpoint`。嵌套调用不出现在 transcript 里（`types.ts:383-394`），所以由 gate 在 `tool_call` 时按 turn 做标记（`turnDirty = true`）。即使预筛判为“可能改动”，只要指纹（树）没变，`captureCheckpoint` 也不会新建提交（`10` §10.7.1 第 5 步），因此多调用一次的代价只是一次 `add -A + write-tree`。契约测试 C25 覆盖嵌套 codemode 调用的情形。
- 两种 adapter 都由 tower-goal 触发，因为只有扩展级 `TurnEndEvent` 带 `messageEntryId`（`03` §3.4.2）。
- 映射关系是“检查点 ↔ Pi 条目”一一对应（ADR-015，`10` §10.7.1 第 7 步）：`piEntryId` 写在条目数据里，`tower.checkpoint` 本身也作为 custom 条目挂在会话树上。所以只读 JSONL 就能重建这张映射，用于 Tower 事件库丢失时的恢复——限定：settle 时等待超过 5 s 的条目可能晚于 `agent.settled` 追加或缺失（Host 已退出时），这些检查点的映射以 Tower 事件 `checkpoint.created` 的 `piEntryId` 为准（下一条，ADR-184）。
- 选择异步而非 `turn_end` 同步返回 entries（后者是被等待执行的，`agent-session.ts:887-897`），原因与 `10` §10.7.2 相同：不拖慢 Agent。代价是快照可能混入下一 turn 的早期改动，这对回退和恢复是可以接受的；Verified 状态只依赖验证器生成的 pin（`07` §7.4.1）。
- `agent_settled` 时，扩展会等待 `cpQueue` 清空（最长 5 s）。扩展的 `agent_settled` handler 在公开事件发出**之前**被等待执行（`agent-session.ts:1084-1085`），所以通常最后一个 `tower.checkpoint` 排在 `agent.settled` 之前。超过 5 s 时 settle 照常继续：**已发出**的请求在 Supervisor 的队列中，先于随后的 `agent_bg_done` 检查点与 pin 执行，编号与先后不变；扩展 `cpQueue` 中尚未发出的请求仍在 Host 侧，之后照常发出或随 Host 退出丢弃，它们的改动都包含在随后 `agent_bg_done` 检查点的树中（ADR-184）；该条目可能晚于 `agent.settled` 追加（Host 已退出时不再追加），映射以 Tower 事件 `checkpoint.created` 的 `piEntryId` 为准（唯一定义 `10` §10.7.2，ADR-183）。

#### 压缩后的账本块（ADR-026）

Tower **不接管** Pi 的压缩。初版设计曾在 `session_before_compact` 里调用导出的 `compact()`，这样做绕过了 Pi 默认路径使用的 `streamFn`、重试回调和路由解析（`agent-session.ts:2748-2771`），会造成行为分叉；初版写的“压缩专用模型”回落条件也是误读：`CompactionModelOverride` 只按模型覆盖 `reserveTokens`/`keepRecentTokens`（`core/settings-schema.ts:13-26`）。现在只在 `session_compact` 之后补一条账本消息：

```
[Tower ledger · harness-generated]
G-0142 · contract v2 · verified 1/3 · observed 2/3
Human decisions: D-0311 answer "use Redis lock"; D-0315 forbid edit tests/__snapshots__
Open comments: K-01JABC (must-fix, delivered, not acknowledged)
Last checkpoint: cp/14 (entry 3fa2c1d0) · ledger seq 18234 · details: read <goal-data-dir>/situation.md
```

“verified V/M · observed O/M” 两条轨来自 ADR-020。Supervisor 根据 `session_compact` 事件记录 Fact `compaction{reason, tokensBefore}`。


#### `agent_before_settle` nudge

同时满足以下条件才发 nudge：

- `phase === "running"`；
- `policy.mode !== "draining"`：暂停、预算硬上限、退出应用时，drain 已经用 `terminate:true` 拦截了工具，这时再 nudge 只会多花一次 LLM 调用，而那次调用又会被拦截（R1-D5-08；契约测试 C24）；
- 本 Run 内 gate 没有因为 draining 拦截过任何调用（双保险，防止 `policy.json` 在读取时机上竞争）；
- `event.outcome === "completed"`（`types.ts:970, 1015-1020`）；
- **本 Run 起点之后**没有有效 submit，也没有未决的 `ask_user`（ADR-138/143：起点由 tower-goal 在 `before_agent_start` 以 `pi.appendEntry("tower.run_start", {runId})` 持久化为会话条目，**每个 Tower Run 只写一次**——只在当前分支上还没有同一 `runId` 的条目时写入（ADR-144；一个 Tower Run 可含多个 Pi agent run，例如宽限失败或撤回后的新 run，它们不移动起点）；含 `messageType:"custom"` 触发的 Run；重启与分叉后从当前分支上本 Run `runId` 的 `tower.run_start` 重建；不再锚定最后一条 user 消息）；
- 合同中至少有一条 `exec` 或 `artifact` 标准；
- 本 Run 起点之后的 `tower.nudge` 消息数 < `features.nudge.max`（默认 1）。契约测试 C37。

满足时返回：

```ts
return { continue: true, entries: [...event.entries,
  { type: "custom_message", customType: "tower.nudge", display: true, details: { v: 1 },
    content: "Tower: run is ending without submit. If done, call submit; if blocked, call ask_user; else continue." }] };
```

- 次数从分支条目统计，而不是用内存计数器。这样 Host 重启后或在 fork 的分支上，计数仍然正确，避免死循环（`docs/extensions.md:118` 要求设置防护条件）。
- 追加的 `custom_message` 让上下文的最后一条消息不是 assistant，因此 `canContinue` 为真（`agent-session.ts:1009-1021`）；否则 Pi 不继续：经 `_reportInvalidBoundaryContinuation` 发出扩展错误 `agent_before_settle requested continuation without runnable model context`（原文，`:1030-1035`），并返回 `false`，不抛出异常（`:1992-1993`）。
- 达到上限后，Supervisor 在 `agent.settled` 时把 Goal 转为 `paused{pauseReason:"idle_without_submit"}`（`03` §3.2），并创建 Needs-You `stalled{subtype:"idle_without_submit"}`（severity 2，`costOfDelay: agent_blocked`；`08` §8.6.4），标题为“Agent 未提交即停止”。选项唯一定义在 `03` §3.2.1（ADR-143）：`resume`（可附转向）/ `claim_on_behalf` / `abandon`。

### 5.6.6 持久化与分支正确性

| 数据 | 存放位置 | 是否进入模型上下文 | 是否随分支变化 | Supervisor 读取方式 |
|---|---|---|---|---|
| ask_user 问答、log、submit、propose_contract | 工具结果 `details` | 是（`content` 很短） | 是 | `tool.end`；重放时用 `get_entries` 或读 JSONL |
| 简报 | 系统段 `tower_goal`，以 system 消息的 section 补丁形式写入 transcript | 是 | 是 | `msg.end{role:"system"}`；Trace 标记为“Tower 注入” |
| 交接包、返工证据、nudge、压缩后账本块（`tower.ledger`）、合同修订通知 | `custom_message`，`tower.*`，`display:true` | 是 | 是 | `msg.start/end{role:"custom"}` |
| 评论 / 转向 | user 消息，首行为 Tower 标记 | 是 | 是 | `msg.start{role:"user"}` |
| gate 决策、检查点、UI 结束、接收回执、压缩标记 | `custom` 条目，`tower.*` | 否 | 是（条目在树上） | `entry` |
| Facts、NeedsYou、HumanDecision、Comment 状态、合同 | Tower EventLog | 否 | 否（Goal 级） | — |

- **分支规则**：Tower 视图中的 Claim 只取当前活跃分支（即 `getBranch()` 返回的分支）上的条目。在 SDK 中 `navigate` 回退之后，被放弃分支上的 Claim 标记为 `superseded`，在 UI 中折叠，但不删除，审计历史不可变。
- 前缀约定：`tower.` 前缀为本扩展独占；`v` 字段用于条目格式升级。

---

## 5.7 评论即转向（Comment-as-steering）

### 5.7.1 投递方式

投递时机由 `Comment.timing` 决定（`02` §2.8）。`requiresChange` 不影响投递方式，只影响验收：验收前，`requiresChange` 的评论必须是 `addressed`（只有 ⚙️ 来源：锚定的 hunk 已变），或者被人关闭（`03` §3.4.2）；Agent 的引用只使它进入 `acknowledged`，是说法，不满足这道闸门（ADR-176）。

| `Comment.timing` | Goal / 引擎状态 | 投递方式 |
|---|---|---|
| `now` | 流式输出中，且不在压缩 | `steer`：本 turn 的工具调用结束后、下一次 LLM 请求前送达（`agent-session.ts:2232-2247`；`agent-loop.ts:205, 295`） |
| `now` | 压缩中 | 留在 Tower 队列，`compaction.end` 后立即 `steer`（`prompt` 在压缩期间会抛错，`agent-session.ts:2071-2074`） |
| `now` / `batch` | 引擎空闲，Goal 处于 `running` | `prompt`，启动新的 run |
| `batch` | 流式输出中 | 加入批次。批次窗口为最后一次编辑后 60 s，或人点击“发送批次”。到时合并为**一条** `followUp`，在 agent 本将停下时送达（`agent-loop.ts:302-308`） |
| 任意 | `in_review` | 作为 request_changes 的一部分，成为返工 Run 的初始输入（`03` §3.2） |
| 任意 | `paused` / 无活跃 Run | 留在 Tower 队列（`queued`），下一个开始的 Run——无论由恢复、自动返工还是交还的 `continue_agent` 开出——都把它作为 `opening.human` 的一部分送达（人写的评论是人的话，以 user 角色发送；ADR-212） |

### 5.7.2 消息格式（user 消息）

```
[Tower · comment K-01JABC · now · must-fix]
On src/checkout/retry.ts:42 (hunk 9f3e…):
> if (attempt > 3) return charge(...)
Reviewer: This double-charges when the first call timed out. Reuse the idempotency key.
[/Tower]
```

- 标记行包含唯一的 key，原因有二。一是 Pi 从队列中移除消息时，是对**整段文本做精确匹配**（`agent-session.ts:1125-1139`）。二是 `queue_update` 只携带文本（`:1046-1052`）。
- 标记行中的 `must-fix` 只在 `requiresChange=true` 时出现，提示模型这条必须处理。
- 批次消息里依次排列多段，每段都有自己的标记行。
- 模型可以用 `log{evidenceRefs:["comment:K-01JABC"]}` 声明已回应：评论进入 `acknowledged`，界面显示为说法 `┆ Agent 称已回应`，不满足验收闸门（ADR-176）。

### 5.7.3 回执状态（`02` §2.8 `delivery.state`）

| 状态 | 判定（⚙️ Harness） | 证据 |
|---|---|---|
| `draft` | 只在 UI 中 | — |
| `queued` | Supervisor 已接受命令，并发出 steer / followUp / prompt。Pi 返回 `queued` 或 `started`，或者 `queue` 事件中出现该文本。此外，若 JSONL 中有 `tower.receipt{stage:"accepted"}`，作为持久凭据 | 响应 disposition + `queue` + `entry` |
| `delivered` | `msg.start{role:"user"}` 的文本中含有该 key（同时会看到它从 `queue` 中移除，`agent-session.ts:1123-1141`）。`deliveredAtEntry` 在 turn.end 之后通过 entries 补齐 | user 消息条目的 id |
| （属性）`seenAtEntry` | 不是状态，是 delivered 的附加属性：delivered 之后第一条 `stopReason ∉ {error, aborted}` 的 assistant `msg.end`。它只说明模型带着这条评论生成过回复，**不说明**模型理会了这条评论。UI 显示为“已进入上下文” | assistant 条目的 id |
| `acknowledged` | **唯一定义**（R1-D5-10；`04` F4 引用本定义）：delivered 之后，Agent **显式引用了该评论的 key**。满足以下任一条件即可：(a) 某次 `log` 的 `evidenceRefs` 包含 `comment:<key>`；(b) 某条 assistant 消息的文本包含字面量 `<key>`（例如 `K-01JABC`）。判定是确定性的：只检查引用是否存在，不判断引用内容是否属实。引用本身是 Agent 的行为，所以 UI 显示为“已回应”——说法 `┆ Agent 称已回应`，旁边附上引用的原文，按 Claim 语法显示；它**不满足**验收闸门（ADR-176） | 引用所在的条目 id（`acknowledgedAtEntry`） |
| `addressed` | 可以跳过 `acknowledged` 直接到达。**只有 ⚙️ 一个来源**（ADR-176）：锚定的 hunk 在 delivered 之后的某个 checkpoint 中 contentHash 发生变化，记录 `addressedAtCommit = cp.commit`，UI 显示 `⚙ hunk 已变 @<commit>`（事实）。模型在 `log.evidenceRefs` 中引用该评论只进入 `acknowledged`（说法），不进入本状态。验收闸门（`requiresChange`）只接受本状态或人关闭。**人关闭**（唯一定义，ADR-212；`02` §2.8、`03` §3.4.2、`04` §4.6.3、`06` §6.4.7、`11` §11.9、`16` 引用）= 人以 `comment.edit` 把该评论的 `requiresChange` 改为 `false`（`06` §6.4.3），由 `comment.*` 事件留痕（谁、何时、原值）；回执显示 `你已关闭`，不新增状态或字段。**非 hunk 锚点**（`anchor` 为 `claim`、`criterion`、`contract`、`trace`、`goal`，含 `run.steer` 产生的评论）没有 ⚙️ 来源，**永远不会进入本状态**：其中 `requiresChange` 的只能由人关闭；界面对这类评论不显示“已处理”一步，回执止于 `┆ Agent 称已回应`（ADR-178） | checkpoint |
| `stale` | 投递前锚定的 hunk 已变化（Run 结束时仍未送达的评论保持 `queued`，下一次 Run 开始时随开场送达，§5.7.1；人不想再投递时以 `comment.delete` 删除，ADR-211） | hunkHash 对比 |
| `dropped` | Pi 返回 `handled`（被某个 `input` 处理器吞掉，`agent-session.ts:2213-2219`）；这是唯一来源——`abort` 后被 `clear_queue` 清掉的评论由暂停流程放回队列、保持 `queued`（§5.7.4，ADR-212） | disposition |

### 5.7.4 时序与恢复

```
Human        Supervisor              Host/Adapter               Pi
  │ comment.create(now)     │                    │                        │
  │────────────────────────►│ outbox(K, steer)   │                        │
  │                         │──steer(K…)────────►│──steer────────────────►│ input 钩子 → appendEntry(tower.receipt)
  │                         │◄─disposition queued│◄─response{queued}──────│ queue_update{steering:[…K…]}
  │                         │ state=queued       │◄────────────── entry / queue ───────────│
  │                         │                    │                        │ … tool batch ends …
  │                         │◄────── msg.start{user, "[Tower · comment K …"} ─────────────│
  │                         │ state=delivered    │                        │ queue_update{steering:[]}
  │                         │◄────── msg.end{assistant, stop} ────────────────────────────│
  │                         │ seenAtEntry（属性）│                        │ 仍为 delivered；Agent 引用 key 后才 acknowledged
  │                         │◄────── entry tower.checkpoint (hunk 变化) ──────────────────│
  │                         │ state=addressed(⚙️)│                        │
```

- **outbox 幂等**：Supervisor 中，每条待投递记录对应 `engine_outbox` 表的一行（`06` §6.3），idemKey 为 CommentId。Host 或 Supervisor 重启后，先在 JSONL 中查找带该 key 的 `tower.receipt` 或 user 消息；找到则不重发。
- **引擎在 settle 时队列里仍有消息**：`steer` 与 run 结束发生竞争时，Pi 可能把消息留在队列中，却不再启动 run（`agent-session.ts:2203-2230` 只入队，不启动）。在 `agent.settled` 时，如果 `pendingMessageCount > 0` 且 Goal 仍在 `running`，adapter 执行 `clear_queue` 取回这些文本，再用 `prompt` 一次性发出。
- **暂停或中止**：`abort` 不会清空队列（`agent-session.ts:2464-2474`）。Tower 的暂停流程总是先 `abort`，再 `clear_queue`，把未投递的评论放回 Tower 队列，状态保持 `queued`。

---

## 5.8 尝试、返工与回退：映射到 Pi 会话树（ADR-015、ADR-027）

**基数**（R1-D4-12）：Run 与 Pi 会话文件是 **N:1**。一个会话文件可以承载同一 Goal 的多个 Run（初次运行、返工、恢复、交还都在同一个文件里继续追加）。只有“上下文过长”和 Best-of-N 会产生新的会话文件。所以：
- 会话级的信息（文件路径、对账游标 `lastEntryId`、`parentSession`）存在 `sessions` 表；
- Run 只引用 `sessionId`，并记录自己的起止条目（`firstEntryId`、`lastEntryId`），用于在 Trace 中把属于这个 Run 的区间切出来（`06` §6.3）。

**尝试的边界**（ADR-027）：**一次尝试 = Pi 会话树上的一条分支**。只有回退、分叉、换方案重来才会产生新的尝试，`attempt.n` 只在这时加 1。验证失败后的默认返工沿用当前分支，所以是**同一次尝试的新 Run**。UI 只画真实存在的分支。

| 场景 | 会话操作 | 代码操作（`10`） | Tower 记录 | `attempt.n` |
|---|---|---|---|---|
| 验证失败，自动返工（默认） | **沿用当前分支**：`resume` 后以 `inject(tower.rework, {triggerTurn:true})` 开始返工回合（ADR-135；RPC 经 `/tower-inject`），`tower.rework` 证据（≤ 400 token：失败的标准、输出末尾 30 行、哨兵命中；模板见 `07` §7.10.3）。证据文本发出前经过与 `tool_result` 相同的脱敏器，精确匹配集包含本地密钥文件扫描出的值（`11` §11.7，R5-D8-02） | 不变 | 新 Run，`reason:"rework"`，`parentRunId` 指向上一个 Run，会话文件不变 | 不变 |
| request_changes（评审意见） | 沿用当前分支，评论作为初始输入（§5.7.1） | 不变 | Run `reason:"rework"` | 不变 |
| 人接管与交还（`03` §3.4.2；ADR-081、ADR-094） | `take_over` 可从 `running`（先 drain）、`paused(*)`、`in_review`、`accepted`（未集成）发起，统一进入 `paused(human)` 并记录 `Goal.takeoverFrom`。人不直接在卫星中工作：Tower 创建人工编辑检出 `<wtRoot>/_human/<goalId>`（由影子树物化被跟踪与未忽略的内容，不再整体 CoW 复制卫星；被忽略的依赖目录按需由安装器重建；`pinSafetyCheck(baseTree, T0)` 命中的路径不写出，base 中未改动的仓库形态夹具照常写出，ADR-106/109 + Tower 按模板新建的 gitdir，记录 `Goal.humanCheckout`）；打开前提示 IDE 可能执行仓库中的代码、建议受限模式（T31）。交还时按文件级同步写回卫星（不经 git；`O_NOFOLLOW`，只接受普通文件与目录，ADR-089），随后删除该检出。人选择两种去向之一：**交给 Agent 继续** → `running`，会话沿用当前分支，开场（ADR-135/138）：`tower.handback`（≤ 300 token）只含人改动的文件列表（来自 `author:"human"` 的归因）与“不要回退这些改动”的要求，**不含**人的意图；人写的意图（`human.decision{hand_back}` 的 `note`，延后执行 `pendingHandBack` 时同样从该决定读取）存在时，`tower.handback` 以 `triggerTurn:false` 追加，再以 `prompt` 发送人的文字（user 角色）；不存在时 `tower.handback` 以 `triggerTurn:true` 开场；**直接重新验证** → `verifying`（`verifyOrigin:"human_change"`），不启动 Run（交还的其他参数——接管期间外部写入的处置 `externalResolution`、pin 命中条目的处置 `resolvePinHits`——只影响写回卫星的内容，不进入 Pi 会话，ADR-114/118）；交还的检查点为 `author:"human"`，按 `03` §3.2.1 的归因窗口，失败进入 `paused(human_change_verify_failed)`、不自动返工（ADR-144）。其他出路（ADR-099，命令见 `06` §6.4.3）：`goal.discard_human_edits` 放弃改动，不启动 Run、不注入任何消息；`goal.retry_after_human_change`（`paused(human_change_verify_failed)` 下交给 Agent）与“交给 Agent 继续”同样注入 `tower.handback`；`inspect.bring_back` 把检验检出中的改动带回为 `verifying{human_change}`，不涉及 Pi 会话 | 交还前先做一次检查点（`landmark:"human_edit"`） | 仅“交给 Agent 继续”：Run `reason:"resume"`；`attempt.label = "handback"` | 不变 |
| **上下文过长**（见下表） | `newSession({parentSession: 旧文件, input: 交接包})` | 不变 | Run `reason:"handoff"`，写入 `handoffPacket`；产生新会话文件 | 不变（同一尝试的延续） |
| 人选择“回退到 cp n 重试” | `navigate(cp.piEntryId, {summarize:true})`：在同一个 JSONL 内移动叶子，被放弃的分支生成 `branch_summary`（`agent-session.ts:3994`；`types.ts:847-860`） | `restoreCheckpoint(n)`（`10` §10.8.1） | Run `reason:"rework"`；`attempt.branchFromEntryId = cp.piEntryId`；被放弃分支上的 Claim 标记为 `superseded` | **+1** |
| 人选择“回退到非回合检查点”（`agent_bg_done`、`human_edit`、`external_change_kept` 等；**M2**，M1 只在时间线上显示，ADR-127） | `navigate` 到它之前最近的回合 entry（`{summarize:true}`），并附一条 steer：“代码已回到 <landmark> 时的状态” | `restoreCheckpoint` 到该非回合检查点的树 | 同上 | **+1** |
| 人选择“换方案重来”（从合同批准点重开） | `navigate(<第一条 user 消息的父条目>, {summarize:true})` | `restoreCheckpoint(0)`，即 baseCommit | 同上；`attempt.label = "restart"` | **+1** |
| Best-of-N / “分叉为新 Goal” | 专用 `SessionManager` 实例（`SessionManager.open(源文件, 新会话目录, 新卫星)`）上的 `createBranchedSession(cp.piEntryId)`，生成新文件，头部 `parentSession` 指向原会话、`cwd` 为新卫星（`10` §10.8，ADR-181）；不用 `runtime.fork(…, {position:"at"})`：它会把源 Goal 的运行时切到新会话（`agent-session-runtime.ts:262-350`） | 新卫星（`10` §10.8） | 新 Goal，或者 `kind:"variant"` 的 Run，各自有独立卫星（I7 例外，`03`） | 每个 variant 一个新的 n |

是否“上下文过长”的判断：Supervisor 在开启返工 Run 之前，先通过 `getStats` 读取当前会话的 `contextUsage`（`agent-session.ts:4263, 4267-4299`），以及本会话的压缩次数和模型。

| 条件（任一成立 → **新会话 + 交接包**） | 依据 |
|---|---|
| `contextUsage.percent ≥ 50` | 返工证据和后续工作会把上下文推向压缩阈值（`contextWindow − reserveTokens 16384`，`settings-defaults.ts:11`） |
| `contextUsage.tokens === null`，且本会话已压缩 ≥ 1 次 | 压缩后在下一次响应之前，用量未知（`agent-session.ts:4276-4299`），按“偏高”处理 |
| 本会话压缩次数 ≥ 2 | 摘要是有损的（pi.md §8.3），多次压缩会累积失真 |
| 需要换模型，或换 thinking 档位 ≥ 2 级 | 跨模型复用长上下文，成本高且行为不稳定 |
| `reworkCycles ≥ 2`，且上一轮检测到 `stalled` 或循环 | 换一个干净的上下文，有助于打破固定的错误轨迹 |
| 人在 request_changes 时选择了“重新开始” | 🧑 |
| 合同修订改动了 `criteria` 或 `scope` | 旧上下文里的计划可能已经失效 |

以上都不成立时，按前一张表在同一个会话树上处理。

新会话的流程：

1. Supervisor 生成 `HandoffPacket`（`02` §2.11）。S（situation）和 B（background）完全来自账本（⚙️）；A（assessment）和 R（recommendation）取自上一个 Run 最后的 `log{kind:"risk"|"next"}` 和 `submit.risks`，标为 Claim。
2. 渲染为 `episodic.md`（≤ 300 token），由 `before_agent_start` 注入为 `tower.handoff`。
3. 新会话头部的 `parentSession` 指向上一个会话文件（ADR-015）。SDK：`SessionManager.create(cwd, sessionDir)` 后调用 `newSession({parentSession})`，参照 `agent-session-runtime.ts:236-241` 的写法。RPC：在旧进程上执行 `new_session{parentSession}`，或者新进程启动后先执行同样的命令。同时把 `Run.parentRunId` 写入 Tower。
4. 复述（read-back）：交接消息最后一句要求模型先调用 `log{kind:"plan"}` 复述目标和接下来的步骤。Supervisor 检查复述中引用的 criteria id 和触及的路径，若与合同不符，填入 `readBack.mismatch`，并创建 Needs-You `ratify`（severity 2）。

注意：`navigate` 和 `fork` 都要求引擎处于空闲状态（G26）。UI 发起回退时，先走暂停流程（drain → `abort` → `clear_queue`），再执行会话树操作。

---

## 5.9 Pi 陷阱清单

| # | 陷阱 | 证据 | 缓解 | 核实方式 |
|---|---|---|---|---|
| G1 | 会话记录的 cwd 不存在时，非交互模式以退出码 1 退出 | `CA/src/main.ts:697-707`；`session-cwd.ts:14-33` | 恢复前先 `ensureSatellite`（从影子检查点与分支重建卫星，ADR-060）。SDK 用 `SessionManager.open(…, cwdOverride)`（`session-manager.ts:1766`）。`engine.exit` 的 stderr 里出现 “Stored session working directory does not exist” 时，自动修复一次 | 契约测试 C9 |
| G2 | 项目 trust：RPC 无法弹窗询问，默认 `ask` 等同不信任（`project-trust.ts:73-90`；`docs/security.md` “without an interactive prompt”）；而 SDK 的 `SettingsManager.create` 默认 `projectTrusted=true`（`settings-manager.ts:335`）；信任记录按 cwd 存储，卫星路径继承不到用户已有的决定 | 同左 | Tower 按 **Project 身份**保存 trust（`06` §6.3 `projects.trust`），首次使用时询问。Pi 的项目信任在 M1 恒为假（SDK `projectTrusted:false`，M2 的 RPC `--no-approve`）；条件判定（ADR-004）`trusted` **且** `.pi/**`、`.agents/**` 相对 `baseCommit` 没有改动时，只决定是否以显式路径传入项目的声明性资源（`11` §11.8.1，ADR-202）。默认 `protected` 也包含这两个目录（`02` §2.5） | 契约测试 C11 |
| G3 | `write` 不产生 diff：`details` 为 undefined | `write.ts:87`；`types.ts:1305-1308` | diff 一律以 git 为准（checkpoint 与 base 比较）；`tool_call` 记录前像（§5.6.5） | 契约测试 C12 |
| G4 | `edit` 的 `details.patch` 只覆盖 edit；bash 可以改动任何文件 | `edit.ts:70-77` | `patch` 只用来把 turn 关联到 hunk；Review 的 diff 来自 `git diff --histogram` 对 baseCommit | 契约测试 C12 |
| G5 | 会写全局设置的 setter：RPC 的 `set_steering_mode`、`set_follow_up_mode`、`set_auto_compaction`、`set_auto_retry`；SDK 中带 `persist:true` 的 `setModel`、`setThinkingLevel`，以及 `setCacheWarmingMode` | `rpc-mode.ts:519-550`；`agent-session.ts:2507-2520, 2642-2653, 2730-2742, 3279-3280, 3854-3855, 1441` | RPC 客户端的类型中不包含这些命令；SDK 用存储层拦截（§5.3.3）；契约测试 C10 | 契约测试 C10 |
| G6 | 没有会话切换或模型变更事件（RPC）；SDK 中 runtime 替换后订阅会失效 | `rpc-mode.ts:435-442, 603-629`；`examples/sdk/13-session-runtime.ts` | §5.4.5 的重新查询表；SDK 中统一由 `rebind()` 处理 | SDK：契约测试 C14；RPC：仅读源码 |
| G7 | 背压：Pi 每发一个 agent 事件都等待 stdout drain | `rpc-mode.ts:361-363` | 读取端永不暂停，分级丢弃（§5.4.7）。SDK 的 `session.subscribe` 不被等待（`agent-session.ts:1040-1044`），但 Host 同样设有缓冲上限 | 契约测试 C8 |
| G8 | 内置 `RpcClient`：固定 30 s 超时；固定用 `node` 启动；启动只睡 100 ms；不能应答 UI 请求 | `rpc-client.ts:94, 133, 580-583` | 自写 `RpcProcessClient`（§5.4.2） | 仅读源码（不使用 RpcClient） |
| G9 | 用 `readline` 会在 U+2028/2029 处错误断行 | `jsonl.ts:4-20` | 只按 LF 分帧 | 契约测试 C8 |
| G10 | SDK 不自动加载 MCP、codemode、tool_search | `docs/sdk.md:116` | 以 `builtin:true` 条目提供，行为与 CLI 一致（§5.3.1，ADR-032；清单确认之前与 `riskTier=high` 时以 `noExtensions:true` 不加载，D46） | 契约测试 C21 |
| G11 | 扩展 API 变动频繁：1.2.0 把 `before_agent_start` 改成按 `messageType` 区分的联合类型，并改变了启动期的 busy 语义 | `CHANGELOG.md:29-33` | 固定版本 + 契约测试（§5.11）；tower-goal 处理时显式判断 `messageType` | 类型快照 + 全套契约测试 |
| G12 | 压缩期间 `prompt` 直接抛错，即使正在流式输出 | `agent-session.ts:2071-2074`（检查早于 `:2103` 的流式分支） | 流式中改用 `steer`/`follow_up`；压缩期间在 Tower 内排队 | 契约测试 C2 |
| G13 | 空闲时调用 `steer`/`followUp` 只会入队，不会启动 run | `agent-session.ts:2203-2230` 对比 `:2103-2141` | 空闲时用 `prompt`；settle 时发现队列残留，执行 `clear_queue` 后用 `prompt` 重发（§5.7.4） | 契约测试 C2 |
| G14 | `abort` 不清空 steer / followUp 队列 | `agent-session.ts:2464-2474` | 暂停流程 = `abort` + `clear_queue`，评论放回 Tower 队列 | 契约测试 C2 |
| G15 | 队列按整段文本做精确匹配并移除；文本相同的消息会互相冲突 | `agent-session.ts:1125-1139` | 每条消息带唯一标记行 | 契约测试 C2 |
| G16 | `terminate:true` 必须整批工具结果都带才生效 | `AG/src/agent-loop.ts:690-691` | 有效 submit 规则（§5.6.2c） | 契约测试 C6 |
| G17 | `before_agent_start` 在**每个** run 开始时都会触发 | `agent-session.ts:1890-1899` | 简报放在系统段，不变时差分为空；事件性消息按 key 去重 | 契约测试 C4 |
| G18 | 边界钩子返回的 `entries` 会**替换**已有条目，而不是追加 | `runner.ts:1053-1054` | 总是返回 `[...event.entries, x]` | 契约测试 C3 |
| G19 | 会话文件直到出现第一条 user 或 assistant 消息才创建 | `session-manager.ts:1160-1188` | `sessions.path` 允许暂时不存在（Run 与会话是 N:1，§5.8）；以 `run.ready` 的 `sessionId` 为准 | 契约测试 C9 |
| G20 | JSONL 追加写不做 fsync；崩溃时只跳过坏行，并修复尾部残缺 | `session-manager.ts:616-624, 668, 1187` | Tower 的 Fact 以 EventLog 为准；对账时允许 JSONL 落后（`06` §6.6.5） | 仅读源码 |
| G21 | RPC 对话框因超时或 abort 结束时，不通知宿主 | `rpc-mode.ts:101-120` | 写入 `tower.ui_resolved` 条目；其他来源的对话框在 `tool.end` 或 `agent.settled` 时关闭 | 契约测试 C7 |
| G22 | `editor` 对话框没有超时 | `rpc-mode.ts:254-271` | tower-goal 不使用 `editor` | 契约测试 C7 |
| G23 | 在扩展 factory 中启动定时器或 socket 是不允许的 | `docs/extensions.md:58-60` | 所有资源在 `session_start` 中创建 | 仅读源码（文档约定） |
| G24 | `tool_call` handler 抛异常即阻断工具（这是故障保护）；gate 自身的 bug 会阻断所有工具 | `docs/extensions.md:263` | gate 出错时创建 Needs-You；连续出错则暂停 Goal；gate 单元测试覆盖率要求 100% | 契约测试 C5 |
| G25 | 压缩之后、下一次响应之前，`getContextUsage` 的 tokens 为 null | `agent-session.ts:4276-4299` | 返工决策中把 null 当作偏高处理（§5.8） | 契约测试 C13 |
| G26 | 流式输出中调用 `navigateTree` 会抛错 | `agent-session.ts:3998-4005` | UI 只在 settled 状态下开放时间线回退 | 契约测试 C14 |
| G27 | RPC 进程生命周期：stdin EOF → 0；SIGTERM → 143；SIGHUP → 129 | `rpc-mode.ts:366-380, 802-805` | 按 §5.4.2 的顺序关闭；根据退出码判定 Run 的结果 | 契约测试 C23 |
| G28 | 打包进 Electron 的 asar 后，Pi 依赖 `import.meta.url` 解析资源（docs、codemode 的 worker 和 wasm） | `CA/src/config.ts:14-22, 393-402, 495-520` | electron-builder 设置 `asarUnpack: ["**/node_modules/@earendil-works/**", "**/node_modules/quickjs-wasi/**"]`；打包产物跑冒烟测试 | Tower 打包冒烟测试 |
| G29 | `get_entries` 返回所有分支，按追加顺序排列 | `rpc-mode.ts:636-647` | Trace 用 `parentId` 构建树，按 `leafId` 求出活跃分支 | 契约测试 C9 |
| G30 | `tool_execution_start` 早于 `tool_call` gate | `agent-loop.ts:541-549` | Mode 优先级规则（§5.5） | 契约测试 C5 |
| G31 | 上下文文件不受 trust 控制，始终加载，包括从文件系统根到 cwd 每一级祖先目录中的 AGENTS.md | pi.md §9；`resource-loader.ts:232-274`；加载只看 `noContextFiles`、不看信任见 `:646-653`；`docs/security.md` “Context files…” |卫星默认放在 `<checkoutParent>/.tower-wt.noindex/<repoName>/<goalId>`（ADR-008），它在仓库根以上的祖先链与用户的主检出相同，所以 Agent 看到的上下文文件与用户自己用 Pi 时一致。卫星不在默认位置（人设置的 `worktreeRoot` 或回退到 `~/.tower/worktrees`）时祖先链不同，差异按 `09` §9.11 计算并在简报中提示（ADR-008、ADR-205）。设置中可以关闭（`noContextFiles`） | 仅读源码 |
| G32 | 扩展加载顺序：CLI 的 `-e` 路径**最先**，其后是用户/项目/包里的扩展，内置扩展（`builtin:*`）排在文件型扩展末尾；SDK 的 inline 工厂排在全部之后 | `resource-loader.ts:577-578`（`mergePaths(cli, enabled)`）、`package-manager.ts:979-991`、`resource-loader.ts:781` | SDK：tower-goal 放在 `extensionFactories` 末尾，它就是最后一个；RPC：无法做到最后，改用输入哈希比对兜底（§5.6.5 gate 第 8 条） | 契约测试 C20 |
| G33 | `agent_settled` 发出期间调用的 `prompt`/`sendCustomMessage` 会被推迟，在事件发出后立即执行，从而开始新的 run | `agent-session.ts:2054-2057, 2340-2342, 1090-1098` | ADR-025 的 2 s 宽限确认（§5.5） | 契约测试 C19 |
| G34 | bash 子进程继承 Pi 进程的完整环境 | `utils/shell.ts:138-150`、`tools/bash.ts:115, 193` | Engine Host 以白名单环境启动；provider 凭据用 `ModelRuntime.setRuntimeApiKey` 注入内存，不放进环境变量（§5.3.6） | 契约测试 C26 |
| G35 | RPC 子进程事件循环卡死但不退出时，没有任何信号 | `rpc-mode.ts` 没有心跳 | `get_state` 活性探针（§5.4.2） | 契约测试 C23 |
| G36 | `tool_call` 的 `input` 与 `tool_result` 的 `input` 是同一个参数对象；后面的处理器原地修改后，Pi 不会重新校验 | `agent-session.ts:659-675, 685-700`；`types.ts:1250-1255` | gate 记录输入哈希，到 `tool_result` 时比对（ADR-024） | 契约测试 C22 |

---

## 5.10 尊重 Pi 的设计哲学

| Pi 原则 | Tower 的具体做法 |
|---|---|
| “Adapt Pi to your workflows” | 两种 adapter 都使用用户的 `~/.pi/agent`（`riskTier=high` 的 Goal 与扩展清单尚未确认时同样如此，只是不加载扩展与 MCP，见下表；独立的隔离 agentDir 推迟到 M2，ADR-212）：`auth.json`、`models.json`、settings（只读）、扩展、技能、提示模板、`AGENTS.md`、`mcp.json`。技能在 S2 下照常可用（固定目录 + 每个 Run 由 settings 与 Host 实际枚举的已启用技能 `baseDir` 动态加入；只有“路径过宽”或与扩展根目录重合的技能不可用，见 §5.3.6，ADR-100）：技能目录与上下文文件在读允许列表中，`read` 加载 `SKILL.md` 为 silent（`read.pi_resources`），技能脚本在沙箱中执行，写入与网络受 S2 限制（ADR-091，登记在 `00` §0.5.1；Pi 在系统提示中给出技能绝对路径，并按可用的读取工具要求用 `read` 或 `bash` 加载，读取只能经其他工具时（`indirect`）只写 “Load a skill's file…”，`core/skills.ts:358-371`，ADR-207）。SDK 的 `agentDir` 为用户 agentDir：Tower 按 Pi 的同一规则由 `PI_CODING_AGENT_DIR` 求出后显式传入，并以同一个值写入 Host 环境（§5.3.6“Pi 运行开关”，ADR-210/211；规则见 `CA/src/config.ts:585`、`:605-611`）；RPC（M2）的 pi 子进程取同样的两项（§5.4.1） |
| 只加一个扩展 | Tower 只加载 tower-goal（外加用户选择启用的内置扩展）。用户扩展的工具在 running 阶段照常可用，并经过同一个 gate |
| “看到每个 token” | Trace 默认带“Tower 注入”过滤器，包括：`tower_goal` 段补丁、`tower.*` custom_message、带标记的 user 消息、gate 的 block 原因。另有“查看实际发送给模型的上下文”按钮：SDK 读 `session.messages`，RPC 用 `get_messages`（`rpc-types.ts:71, 233`） |
| 极简工具、不维护 to-do | 3 个工具，常驻增量 ≤ 650 token，其中工具部分实测 329（§5.6.3，ADR-009）；进度来自标准和 Fact，而不是模型维护的任务表 |
| 没有内建权限，交给宿主 | gate 是 Tower 层的策略，可审计（`tower.gate` 条目），不改动 Pi 的工具实现 |
| 可关闭 | 见下表 |

**登录的前提（ADR-178/180，唯一定义）**：Tower 不代管认证，也不提供登录入口。**OAuth 类 provider 需要已安装的 `pi` CLI 完成登录**：在终端启动 `pi`，在交互编辑器中输入 `/login <provider>`（`/login` 只在交互编辑器中处理，§5.11.1 D58），凭据写入用户 agentDir（默认 `~/.pi/agent`，§5.3.6）中的 `auth.json`，Tower 之后读取。**API 密钥类 provider 不需要 CLI**：密钥在 Tower 中配置，只在 Host 内存中提供（`11` §11.7.0）。首次运行（`04` §4.18.1 第 1 步）未检测到可用认证时，以用户登录 shell 的 `PATH` 探测 `pi` CLI 是否存在；认证过期（`06` §6.8 F7）的指引指向同一前提。**这是 Tower 的设计选择，不是 Pi 的约束**（ADR-180）：SDK 宿主可以经 `AgentSession.modelRuntime`（v1.2.0 `agent-session.ts:528`）调用公开的 `ModelRuntime.login(providerId, "oauth", interaction)`（`model-runtime.ts:826-838`，`index.ts:231-237` 导出），Pi 自己的 `/login` 就调用它（`interactive-mode.ts:6327-6348`）。M1 不采用它（方案 (b)）的理由：它要求宿主实现 `AuthInteraction`——`prompt` 的四种提示（`text`/`secret`/`select`/`manual_code`）与 `notify` 的四种事件（`info`/`auth_url`/`device_code`/`progress`，`ai/src/auth/types.ts:119-161`）——并在 Engine Host 与界面之间新增一条双向的登录通道，同时 OAuth 回调由 provider 的登录实现在 Host 进程内处理；而 `pi` CLI 写入同一份凭据存储，Host 在 `prompt` 预检与每次请求时都重新读取凭据（`ai/src/models.ts:683-692`、`ai/src/auth/resolve.ts:70-81`；`auth.json` 的文件版本变化时 `AuthStorage.read` 重新加载，`core/auth-storage.ts:402-448`），不需要重启 Host。方案 (b) 在 M2 随 `serve` 的界面通道一起复审。

每个 Goal 或 Project 可设置的开关（Tower 设置，写入 `tower-goal.json` 或 `RunSpec.resources`）：

| 开关 | 默认 | 说明 |
|---|---|---|
| `briefInjection` | on | 关闭后不注入 `tower_goal` 段；验收标准仍由 Harness 执行 |
| `logTool` | on | 实验 E5 |
| `nudge.max` | 1 | 0 = 关闭 |
| `checkpoints` | on | 关闭后改为 Supervisor 在 settle 时补做快照，turn 与 hunk 的对应关系会变粗 |
| `gate` | on | **不可关闭**（任何 `riskTier`，ADR-176；与 `16` §16.6 一致）：它承载单向门的人批准（`11` §11.1），不是可调的特性 |
| 用户扩展与 MCP（`11` §11.8.2，R2-D11-01） | 按 `riskTier` 和“首次加载清单确认”决定 | **静态清单，确认之前不加载、不执行任何扩展或包的代码**（Pi 的包自动安装由 Host 环境的 `PI_OFFLINE=1` 关闭，§5.3.6“Pi 运行开关”，ADR-211）。Supervisor 只读文件系统和配置文件，不 import 任何模块（唯一的子进程是下述包管理器的只读全局根查询，ADR-212）：枚举用户 agentDir（§5.3.6，与 Pi 实际加载扩展的目录相同）下的 `extensions/`、用户 `settings.json` 中 `extensions`/`packages` 指向的本地路径、已安装且版本与设置相符的包的目录（判定与查找顺序同 Pi，唯一定义，ADR-212：用户级 npm 来源先查 `<用户 agentDir>/npm/node_modules/<名字>`，不存在时查包管理器的全局根——Pi 在这里以用户设置的 `npmCommand` 同步运行 `root -g`（pnpm 为 `list -g --depth 0 --json`，bun 为 `pm bin -g`），这一步在离线判断之前、不受 `PI_OFFLINE` 控制（`core/package-manager.ts:1321-1324`、`:2102-2129`、`:2143-2158`）；Supervisor 以 §5.3.6 定义的 Host 包管理器环境（你的登录 shell 中的 `PATH` 与包管理器位置变量、你自己的配置文件、主目录为工作目录；整台机器同一个，不含 Agent 可写的位置，ADR-213）与同一 `npmCommand` 运行同一查询：它运行你在 Pi 设置中配置的 `npmCommand`（可以是包装脚本），不执行扩展或包的代码。**查询的时限与失败**（唯一定义，ADR-215；`11` §11.8.2、`13` §13.5、`00` §0.5.1 引用）：Supervisor 的每次查询以 60 s 为限，到时终止该子进程（连同它的进程组），按出错处理；准备被中止（`abandon` 或新到的暂停原因，`10` §10.3.1）时同样终止正在运行的查询的进程组；查询出错或超时时全局根记为“未知”而不是“没有全局根”，不启动 Host；一次清单计算中有一次查询出错或超时之后，其余查询不再运行，依赖全局根的包一律记为“未知”，所以一次计算中最多有一次查询等满 60 s（ADR-216）。在 Run 的准备中，清单计算属于第 ③ 步（Host 启动之前，计入 120 s，其间命令的行为同 ③，`10` §10.3.1）：Run 进入 `paused(prepare_failed)`，卡片 `启动失败：无法确定全局安装的包（全局根查询出错或超过 60 秒）；请检查 Pi 设置中的 npmCommand，或从 packages 中移除未安装的包`。在 Run 之外（首次运行第 1 步的确认卡片，`04` §4.18.1；设置页“重新读取”之后的重新计算，§5.3.6）：卡片对受影响的包写“无法确定是否已全局安装（全局根查询出错或超过 60 秒）”并附 `[重试]`，不列为“未安装”，其余条目照常确认；查询成功之前，需要启动 Host 的 Run 按上一句在准备中停止。这同样阻断不加载扩展的 Run（清单确认之前、高风险 Goal）：Host 中的 Pi 仍以同一命令运行这一查询（下文），清单也只有一份，这是有意的取舍（`00` §0.5.1）。所以只有查询成功、全局根中确实没有的包才列为“未安装”；Host 中的 Pi 用同一环境与同一命令查询，同样找不到它（你在 Host 存活期间的改动除外，见下文）。因为环境相同，Tower 与你在终端中运行的 `pi` 得到同一个全局根（你在某个项目目录中运行 `pi`、而该项目的包管理器配置改变了全局位置时可能不同；用户级的包集合本就与项目无关）。查询次数不固定：npm 的 `root -g` 在每个 `PackageManager` 实例中缓存（`:2102-2116`），pnpm 的 `list -g` 每个包运行一次、不缓存（`:2118-2130`）；在全局根中找到的包同样列出、按目录哈希；版本判定 `:1513-1519`；git 来源只看目录是否存在，安装路径不含 ref（`:1336-1340`、`:2160-2170`），所以“版本不符”只指 npm 的版本范围）、用户级 `mcp.json` 中的服务器条目（M1 中没有项目扩展、项目包与项目 MCP 服务器，`11` §11.8.1），得到路径、内容 SHA-256（包按目录哈希）、MCP 命令行以及可执行文件哈希。`packages` 中列出而未安装或版本不符的来源单列为“未安装：Tower 不安装、不加载；请在你的终端中运行 `pi` 安装（Pi 启动时安装设置中缺失的包），装好后清单变化，按下文重新确认”。另外对源码做文本扫描，标出“可能注册 `tool_call`/`tool_result` 处理器、名为 `bash` 的工具，或与 Pi 内置工具（`read`、`grep`、`find`、`ls`、`edit`、`write`、`powershell`）、Tower 工具（§5.6.2）同名的工具，或注册 `/mcp` 命令”的扩展。扫描是保守的，宁可误报。它用于三处：确认卡片上的提示（含 ADR-066 的“该扩展的 bash 将被 Tower 沙箱版本取代”；同名内置工具写“该扩展的 <工具名> 在 Tower 中不生效（`read`/`bash`/`edit`/`write` 被 Tower 的沙箱版本取代，其余不提供）”（ADR-220），同名 Tower 工具写“启用期间 Tower 不能启动运行”，`00` §0.5.1，ADR-187；注册 `/mcp` 的写“该扩展取代 Pi 内置的 MCP，M1 中不可用：启用期间 Tower 不能启动运行”，§5.3.5，ADR-215）、ADR-065 的 RPC 适用条件，以及 SDK 自检的预期值。清单中有扩展或 MCP 服务器时，确认卡片另写一句（ADR-231）：`扩展与 MCP 服务器只看到 Tower 传入的环境变量：工具链变量只有 JAVA_HOME、GOPATH、NVM_DIR、CARGO_HOME、RUSTUP_HOME、VOLTA_HOME，扩展另看到 PNPM_HOME；mcp.json 的 env 中以 $NAME 引用其他 shell 变量的值解析不出，该服务器不启动，请写字面值`（变量只按 §5.3.6 “Host 环境的变量”；MCP 服务器的环境是 `mcpBaseEnv`，不含 ④，§5.3.5，ADR-232；扩展经 `pi.exec` 的子进程继承 Host 环境，`core/exec.ts:36-46`；`env` 的值在 Host 中解析，`extensions/mcp/runtime.ts:111-113`）。清单在**任何加载之前**展示并确认；与上次确认的不同时，生成 Needs-You `approval`（`owner:global`，ADR-034）。RPC 用同一份静态清单，与用户安装的 Pi 版本无关，因为它根本不加载代码。已加载扩展实际注册的工具和钩子，在第一次真正加载后（`session_start`，SDK 读 `extensionsResult`）记入审计；如果和静态扫描不一致，只告警，不改变已作出的确认。Host 存活期间每次新建会话（暂停后的恢复、上下文交接）Pi 都重新解析包目录、重新运行全局根查询（`core/agent-session-services.ts:148-154`）；因为 Host 环境不引用 Agent 可写的位置（§5.3.6，ADR-213），这时读到的都是你自己拥有、Agent 不可写的位置，结果只会因你自己的改动而变（S2 下；S0 见 `11` T23）——与你在 Host 存活期间改动 `extensions/` 相同，新的代码要到下一次 Host 启动前的清单计算才列出并要求确认（已知限制）。确认之前，以及 `riskTier=high` 的 Goal 默认，都**不加载扩展**（唯一定义，ADR-212）：SDK 以 `noExtensions:true` 启动（`RunSpec.resources.noExtensions`，§5.3.5），只保留 inline 的 tower-goal，用户扩展、包中的扩展与 builtin 的 mcp、codemode、tool-search 都不加载（`core/resource-loader.ts:577-578`）；agentDir、settings、凭据与模型配置仍是用户 agentDir 中的（§5.3.6），技能、提示模板与上下文文件照常加载——它们不是沙箱外代码，技能脚本在沙箱中执行。资源加载仍解析设置中的 `packages`（不安装，可能运行上述只读全局根查询）。独立的隔离 agentDir（`~/.tower/pi-agent/`）推迟到 M2：它在 M1 中保护的只是“不加载沙箱外代码”，这一点由 `noExtensions` 单独提供，而它的代价是每个 Run 的进程级开关不同（Host 重启、打包分组）与隔离 Goal 中 `rg`/`fd`、shell 设置的差异；RPC（M2）的对应做法随 M2 复审。M1 中高风险 Goal 不加载任何扩展与 MCP，没有按条目加回的机制（推迟到 M2，ADR-213）；要用扩展只能降低 `riskTier`（仅本机，`16` §16.5） |
| `skills` / `contextFiles` | on | 对应 `noSkills` / `noContextFiles`。技能文件与上下文文件在 S2 读允许列表中（ADR-091），读取为 silent。用户主检出中**未跟踪**的 `AGENTS.md`/`AGENTS.override.md` 不在卫星中，被 git 忽略后（如加入 `.git/info/exclude`，ADR-205）可经“本地文件”清单（ADR-078）复制进卫星（含机密的本地文件 Tower 不会自动播种到卫星、验证槽位或检验检出；唯一例外是人在打开检验检出时显式选择带上，ADR-165/166） |
| MCP / codemode / tool_search | 继承用户的 Pi 配置（ADR-032；清单确认之前与 `riskTier=high` 时这三项都不加载，D46） | Tower 不另设开关；要关闭，在用户自己的 Pi 设置中写 `-builtin:mcp` 即可 |
| `adapter` | `pi-sdk` | 可改为 `pi-rpc`，即“使用我安装的 pi” |

---

## 5.11 版本固定、升级策略与契约测试

**固定版本**：`@earendil-works/pi-coding-agent`、`pi-agent-core`、`pi-ai` 都固定为 1.2.0（精确）。Pi 在 v1.2.0 之后也开始精确固定内部依赖（`CHANGELOG.md:11`，属于未发布部分，仅供参考）。

**RPC 模式的兼容范围**：`>=1.2.0 <1.3.0` 视为已验证。超出这个范围时：

1. 弹出警告；
2. 在用户机器上，用 faux provider 跑一遍契约测试的 RPC 子集（约 20 s）；
3. 通过则放行，并记住该版本；失败则拒绝启动，并给出差异报告。

**升级流程**：

1. Renovate 发起升级 PR。
2. CI 跑契约测试的全部用例，两种 adapter 都跑。
3. 对“已使用 API 面”做类型快照比对：`engine-host/pi-surface.d.ts` 只 `import type` §5.11.1 表中列出的符号，然后用 `tsc --noEmit` 编译。
4. 人工阅读 CHANGELOG 的 “Breaking Changes” 部分。
5. 合并到 canary 渠道，运行 1 周后发布 stable。

### 5.11.1 Pi 依赖清单（唯一清单；ADR-004 引用本表）

分为三类：**A 公开且有文档**、**B 公开但未文档化或依赖结构**、**C 内部行为**。每一项都对应契约测试；“仅读源码”的项单独列出，并说明为什么无法测试。

“发布版核实”一列（ADR-047）依据 `research/pi-release-diff.md`。“同”表示该文件在 `v1.2.0..HEAD` 之间没有变化；“同，行号 ±≤5”表示引用在发布版中相差至多 5 行（方向不一，见文首“发布版”行），语义不变，以符号名为准（ADR-194）。SP2 用 `npm pack @earendil-works/pi-coding-agent@1.2.0` 的 tarball 运行全部契约测试，作为最终确认。

| # | 依赖 | 类 | 位置 | 契约测试 | 上游 PR 候选 | 发布版核实 |
|---|---|---|---|---|---|---|
| D1 | `createAgentSessionServices` / `createAgentSessionFromServices` / `createAgentSessionRuntime`，以及 runtime 替换后的重新绑定 | A | `agent-session-services.ts:37-46, 135-233`；`examples/sdk/13-session-runtime.ts` | C14 | — | 同 |
| D2 | `DefaultResourceLoader` 的 `extensionFactories`（含 `builtin`/`replaceable`）、`noExtensions`、`noContextFiles`、`noSkills`、`additionalSkillPaths`/`additionalPromptTemplatePaths`/`additionalThemePaths`、`systemPromptOverride`/`appendSystemPromptOverride`（不传 `resolveProjectTrust` 时信任沿用设置管理器，ADR-202；项目系统提示以内容传入，ADR-203） | A | `resource-loader.ts:276-313, 513-528, 599-676`；`docs/sdk.md:112-116` | C11、C20、C21 | — | 同 |
| D3 | `SettingsManager.fromStorage(storage, {projectTrusted})` | A | `settings-manager.ts:323-325` | C10、C11 | — | 同 |
| D4 | `SessionManager.create/open(path, dir, cwdOverride)/newSession({parentSession})` | A | `session-manager.ts:1755-1806` | C9 | — | 同 |
| D5 | `ModelRuntime.create` + `setRuntimeApiKey` | A | `model-runtime.ts:217, 621-632` | C26 | — | 同 |
| D6 | `AgentSession`：`prompt/steer/followUp/abort/clearQueue/navigateTree/getSessionStats/getContextUsage/subscribe/bindExtensions/setModel/compact` | A | `agent-session.ts` 中各方法 | C1、C2、C13、C14 | — | 同，行号 ±≤5 |
| D7 | `AgentSessionEvent` 联合类型 | A | `agent-session.ts:196-237` | C1、C16 | — | 同，行号 ±≤5 |
| D8 | RPC 命令集、四类 stdout 记录、`extension_ui_request/response`、LF 分帧 | A | `rpc-types.ts`；`jsonl.ts`；`docs/rpc*.md` | C7、C8、C23 | 增加会话/模型变更事件；增加 `navigate_tree` 命令；增加轻量的 `ping` 命令 | 同 |
| D9 | CLI 参数：`--mode rpc`、`--session-dir`、`--session-id`、`--session`、`-e`、`--no-approve`、`--skill`/`--prompt-template`/`--theme`/`--system-prompt`/`--append-system-prompt`、`--tools`、`--model`、扩展 flag 透传 | A | `cli/args.ts:96`（`--mode`）、`:119-262` | C9、C11 | — | 同 |
| D10 | 扩展 API：`registerTool`（`promptGuidelines`、`executionMode`、`prepareArguments`、`defaultActive`、结果的 `terminate`）、`registerCommand`、`registerFlag/getFlag`、`appendEntry`、`sendMessage`、`setActiveTools` | A | `types.ts:579-668, 1671-1778` | C3–C6、C17 | — | 同 |
| D11 | 事件：`session_start`、`before_agent_start`（`systemPromptOptions.sections`、`messageType`）、`tool_call`、`tool_result`、`turn_end`、`agent_before_settle`、`agent_settled`、`session_compact`、`input`、`session_shutdown` | A | `types.ts:1597-1664` | C3、C4、C5、C17、C19 | — | 同 |
| D12 | 上下文对象：`ctx.ui.input`、`ctx.sessionManager.getBranch/getLeafId`、`ctx.cwd/mode/hasUI`；命令上下文的 `navigateTree`/`fork` | A | `types.ts:149-450` | C7、C18 | — | 同 |
| D13 | 内置扩展工厂 `createMcpExtension/createCodemodeExtension/createToolSearchExtension` | A | `CA/src/index.ts:410-414` | C21 | 导出 `builtInExtensions` 数组（含 `llama.cpp`），让 SDK 能与 CLI 完全一致 | 同 |
| D14 | 内置工具的结果形状：`edit.details.patch`、`bash.structuredContent.exit_code` 与非零退出时的 `isError`、`write.details` 为 undefined | A（类型）/ C（数值语义） | `edit.ts:70-77`、`bash.ts:55-62, 386-408`、`write.ts:87` | C12 | — | 同 |
| D15 | faux provider（只在测试中使用） | A | `AI/src/providers/faux.ts:62, 704` | 全部 | — | 同 |
| D16 | `SettingsStorage` 的结构（类型未导出，按结构实现） | B | `settings-manager.ts:164-166` | C10 | 导出 `SettingsStorage` 和一个“只读覆盖”实现 | 同 |
| D17 | 完整实现 `ExtensionUIContext`（`noOpUIContext` 未导出） | B | `types.ts:149-300`；`runner.ts:331` | C7、C14 | 导出 `noOpUIContext` 或 `createHeadlessUIContext()` | 同 |
| D18 | 系统提示 `sections` 的差分补丁：内容不变时不产生补丁 | B | `system-prompt.ts:217-229`；`docs/extensions.md` “Prefer changing prompt sections” | C4 | 在文档中写明“内容不变则无补丁” | 同 |
| D19 | `tool_call` 与 `tool_result` 拿到的是同一个参数对象，原地修改后不重新校验 | B | `agent-session.ts:659-700`；`types.ts:1250-1255` | C22 | 增加“最终输入”钩子，或者让策略类扩展可以声明自己最后执行 | 同，行号 ±≤5 |
| D20 | `tool_result` 改写 `content` 但不返回 `structuredContent` 时，后者会被丢弃 | B | `runner.ts:1200-1205` | C27 | — | 同 |
| D21 | `extensionsResult.extensions[i].handlers`，用来检查 gate 之后有没有 `tool_call` 处理器 | B | `types.ts:2268-2284` | C20 | 公开“处理器顺序”查询接口 | 同 |
| D22 | 扩展加载顺序：CLI `-e` 最先，内置扩展在文件型扩展末尾，inline 最后 | C | `resource-loader.ts:577-578, 781`；`package-manager.ts:979-991` | C20 | 加载顺序写进文档，并提供 `priority` 选项 | 同 |
| D23 | steer/followUp 队列按整段文本精确匹配并移除 | C | `agent-session.ts:1121-1141` | C2 | 让 steer/followUp 返回消息 id，并在 `message_start` 中带上这个 id（可以替代我们的标记行） | 同，行号 ±≤5 |
| D24 | `agent_settled` 期间发起的 `prompt`/`sendCustomMessage` 会被推迟执行，从而开始新的 run | C | `agent-session.ts:1078-1100, 2054-2057, 2340-2342` | C19 | `agent_settled` 增加 `final` 保证，或在事件中带 `willContinue` | 同，行号 ±≤5 |
| D25 | 扩展的 `agent_settled` 处理器在公开事件之前被等待执行 | C | `agent-session.ts:1084-1085` | C3 | — | 同，行号 ±≤5 |
| D26 | 压缩期间 `prompt` 抛错；空闲时 steer 不启动 run；`abort` 不清空队列 | C | `agent-session.ts:2071-2074, 2203-2230, 2464-2474` | C2 | — | 同，行号 ±≤5 |
| D27 | `terminate` 只有整批生效 | C | `agent-loop.ts:690-691` | C6 | — | 同 |
| D28 | 会话文件延迟创建；加载时跳过坏行、修复尾部 | C | `session-manager.ts:616-668, 1160-1188` | C9 | — | 同 |
| D29 | RPC 命令并发处理、响应乱序；stdout 背压 | C | `rpc-mode.ts:361-363, 807-810` | C8 | — | 同 |
| D30 | bash 超时或中止时抛出 Error，没有 structuredContent | C | `bash.ts:375-379` | C12 | 超时和中止时也返回 `structuredContent` | 同 |
| D31 | 压缩之后、下一次响应之前，`getContextUsage().tokens` 为 null | C | `agent-session.ts:4276-4299` | C13 | — | 同，行号 ±≤5 |
| D32 | RPC 对话框超时或中止时不通知宿主 | C | `rpc-mode.ts:101-120` | C7 | 增加 `extension_ui_cancelled` 记录 | 同 |
| D33 | bash 子进程继承进程的完整环境 | C | `utils/shell.ts:138-150` | C26 | — | 同 |
| D34 | `navigateTree` 在流式输出时抛错 | C | `agent-session.ts:3998-4005` | C14 | — | 同，行号 ±≤5 |
| D35 | asar 打包后资源路径（`import.meta.url`、codemode 的 worker 与 wasm） | C | `config.ts:14-22, 393-402, 495-520` | Tower 打包冒烟测试 | — | 同 |
| D36 | 扩展 factory 中不得启动定时器、socket 等资源 | 约定 | `docs/extensions.md:58` | 仅读源码（文档约定，无法测试） | — | 同 |
| D37 | `compaction.ts` 的 chars/4 估算 | C | `compaction.ts:298-310` | 不依赖：Tower 用自己的口径（ADR-032） | — | 同 |
| D38 | `createBashToolDefinition(cwd, {operations, spawnHook, commandPrefix, exposeSessionEnvironment})`；`BashOperations`、`BashSpawnHook`（含 `env` 改写，改写后的 `env` 原样传给 `operations.exec`；但 `user_bash` 路径调用 `exec` 时不带 `env`、不经 `spawnHook`，`bash-executor.ts:121`——因此 Run 令牌由 Tower 的 `exec` 自身注入，ADR-144）；传入 `operations` 时 `shellPath` 被忽略（`bash.ts:248`），故用 `getShellConfig(shellPath)` 自行构造；**拒绝约定**（ADR-226）：Tower 的 `exec` 中止时以 `Error("aborted")`、超时时以 `Error("timeout:<秒>")` 拒绝，与 Pi 自己的实现相同（`bash.ts:102, 150, 153`）——Pi 只对这两种拒绝在截断尾部之后加状态行（`bash.ts:374-379`），其他拒绝原样抛出、没有尾部与状态行，`07` §7.2.2 的 `outcome` 推导与截断标签依赖这一约定 | A | `bash.ts:75-94, 115, 178-211, 248-251, 364-369, 374-379, 427-432`；`bash-executor.ts:121`；`utils/shell.ts:67`；`CA/src/index.ts:265, 343, 496` | C28a、C26、C31、C12 | — | 同（`115`、`178-211`、`364-369`、`bash-executor.ts:121` 为 v1.2.0 直接核实） |
| D39 | 同名工具的优先级：内置 → 扩展工具（扩展之间**先注册者胜**）→ SDK `customTools`（**最后写入，压过一切**）；`getAllTools()` 返回 `sourceInfo`（SDK 下为 `<sdk:name>`） | C | `agent-session.ts:3529-3553`、`runner.ts:636-646`、`types.ts:2122-2130` | C28a、C28b（`C-tool-precedence`） | 把优先级写进文档 | 同，行号 ±≤5 |
| D40 | `SessionManager.forkFrom`（静态）、`createBranchedSession`（实例方法：把调用它的实例切换到新文件，新文件头的 `cwd` 取该实例的 cwd，ADR-181）、`listAll` | A | `session-manager.ts:1815, 1632, 1921-1927` | C9、C14 | — | 同 |
| D41 | `parseSessionEntries`（Host 已退出时离线读取 JSONL） | A | `session-manager.ts:355`；`CA/src/index.ts:295` | C9 | — | 同 |
| D42 | RPC `get_messages`（“查看实际上下文”） | A | `rpc-types.ts:71, 233` | C8 | — | 同 |
| D43 | `pi.registerProvider(name, {apiKey})`：RPC 下的凭据通道（ADR-049），也用于测试中注入 faux provider | A（只覆盖 apiKey 的语义未写入文档 → B） | `types.ts:1806-1859` | C29 | 在文档中写明“只覆盖 apiKey”的行为 | 同 |
| D44 | `tool_call` 处理器的 `ctx.signal`（ask 等待期间收到 abort 时取消对话框） | A | `types.ts:351-352` | C7 | — | 同 |
| D45 | `PI_CODING_AGENT_DIR`（SDK Host 的用户 agentDir；RPC 属 M2）与 `PI_OFFLINE`（关闭包的自动安装与更新、`rg`/`fd` 下载；§5.3.6“Pi 运行开关”，ADR-211/212）；用户级 npm 来源在 `<agentDir>/npm/` 下不存在时回落到包管理器的全局根，这一查询不受 `PI_OFFLINE` 控制，以 Host 的 `process.env` 同步运行、不传 `cwd`、没有超时，所以 Host 环境不得引用 Agent 可写的位置（§5.3.6，ADR-213），静态清单按同一顺序、同一环境求包目录（§5.10，ADR-212/213） | A | `config.ts:585`、`:605-611`；`core/package-manager.ts:16-33`、`:60-63`、`:1308-1327`、`:2102-2130`、`:2143-2158`、`:2752-2765`；`core/agent-session-services.ts:148-154`；`utils/tools-manager.ts:10`、`:361`；`extensions/mcp/index.ts:370`、`:1344`；`extensions/mcp/oauth.ts:147-148`；`cli/args.ts:465` | C11、C40 | — | v1.2.0 直接核实 |
| D46 | `noExtensions:true` 的副作用：同时去掉 builtin 条目（mcp、codemode、tool-search） | C | `resource-loader.ts:577-578` | C21 | — | 同 |
| D47 | `tool_call` 处理器抛错时调用被阻断（`runner.emitToolCall` 无 try/catch，由 `_beforeToolCall`/`prepareToolCall` 转为错误结果）；参数修改的公开约定是原地修改 `event.input` | C | `runner.ts:1249-1266`、`agent-session.ts:659-681`、`agent-loop.ts:728-760`、`types.ts:1455` | C5、C30 | — | 同，行号 ±≤5 |
| D48 | `--session-id` 为“打开或创建” | C | `main.ts:435-447` | C9 | — | 同（`main.ts` 的发布版差异只涉及 `inlineApiKey`） |
| D49 | 会话 entry id 只在单个文件内唯一（fork 后保留原 id） | C | `session-manager.ts:277-284`、`:1815-1865`（`forkFrom`） | C14 | — | 同 |
| D50 | `user_bash` 处理器返回 `{operations}` 即可替换 `!cmd` 与 RPC `bash` 命令的执行方式；处理器出错时阻断命令；`executeBashWithOperations` 调用 `operations.exec` 时**不传 `env`**（ADR-144） | A | `types.ts:1465-1476`；`rpc-mode.ts:561-582`；`bash-executor.ts:121`；`docs/extensions.md` “user_bash” | C31 | — | 同 |
| D51 | 扩展的 `pi.exec`（直接派生子进程，不经过沙箱，继承 Host 环境，包括 ADR-072 的 `GIT_CONFIG_COUNT`） | A | `types.ts:1763`；`exec.ts` | C31 | — | 同 |
| D52 | 加载期 `pi.getSettings()` 等是 `notInitialized`（抛错），`registerTool` 允许 | C | v1.2.0 `loader.ts:158-190` | C28b | 文档写明“加载期可用的 API” | 同 |
| D53 | MCP：`McpExtensionOptions.createTransport`；`StdioTransport` 的 `inheritEnv` 语义（默认继承 `process.env`）；`McpTransportFactory` 的第三参数 `authProvider`（HTTP 分支必须透传）；`mcp.json` 中 `command`/`args`/`cwd` 的 `~` 展开与 `env`/`headers` 的 `${NAME}`、`!cmd` 解析规则（由 Tower 按 Pi 的规则重新实现）；内置 MCP 可被注册 `/mcp` 的扩展取代（ADR-215，§5.3.5 来源自检） | A（工厂与传输）/ B（解析规则） | `extensions/mcp/index.ts:69-73, 571, 1260`；`extensions/index.ts:9-13`；`core/resource-loader.ts:115-150`；`core/mcp-servers.ts:84`；`extensions/mcp/runtime.ts:59-63, 83-88, 89-96, 98-121, 185-199, 348-351, 364, 377-378, 409-418`；`extensions/mcp/index.ts:297, 570, 1121`；`core/mcp-servers.ts:86-87`；`packages/mcp/src/transports/stdio.ts:58, 60, 94-96` | C21 | 导出默认传输工厂和 `$ENV` 解析函数 | 同 |
| D54 | `sendCustomMessage`/`pi.sendMessage` 的 `triggerTurn:false`：流式时追加到当前 turn 结束后、空闲时直接追加，均不开新 run（`tower.processes_terminated`，ADR-129） | A | `agent-session.ts:2318-2353`；`core/extensions/types.ts:1731-1734` | C32 | — | v1.2.0 直接核实 |
| D55 | RPC `prompt` 以 `/` 开头时先执行扩展命令、不产生 user 消息、流式中也立即执行；`pi.registerCommand`。**前提**（ADR-138）：同名命令会被 Pi 改名为 `name:1`/`name:2`（`runner.ts:813-845`），届时 `/tower-inject` 会作为 user 消息进入会话——因此**每次注入前**（不只在握手时，ADR-143）以 `get_commands`（`rpc-mode.ts:680-710`，返回 `invocationName` 与 `sourceInfo`）确认名为 `tower-inject` 的命令恰好一个、`source:"extension"` 且 `sourceInfo.path` 为 tower-goal；不满足时终止该 Run 并提示用户禁用注册了同名命令的扩展（不降级为 user 消息）；`prompt` 响应的 `disposition ≠ "handled"` 视为投递失败（终止该 Run，记 `engine.error`）；**`handled` 不等于成功**（M2，ADR-183）：v1.2.0 中扩展命令的 handler 抛错时 Pi 发出 `extension_error{extensionPath:"command:<name>", event:"command"}` 后仍返回 `handled`（`agent-session.ts:2141-2164`），`pi.sendMessage` 的失败只以 `extension_error{extensionPath:"<runtime>", event:"send_message"}` 报告（`:3413-3420`）——因此该命令响应之前收到 `extensionPath = "command:tower-*"` 的 `extension_error` 一律视为失败；注入以随后看到带该 `details.key` 的 `tower.*` 消息（或 `triggerTurn:true` 时的 `agent.start`）为送达确认，导航与分叉以 `get_state` 中叶子或 `sessionFile` 的变化为完成确认；RPC 的 `prompt` 以 `void` 调用，Tower 收到响应后才发下一条命令 | A | `agent-session.ts:2060-2068, 2141-2163`；`rpc-mode.ts:394-412, 680-710`；`runner.ts:813-845`；`core/extensions/types.ts:1680` | C35 | — | v1.2.0 直接核实 |
| D56 | 空闲时 `sendCustomMessage(…, {triggerTurn:true})` 开始 run，并以 `messageType:"custom"` 触发 `before_agent_start` | A | `agent-session.ts:2339-2345`；`core/extensions/types.ts:949-957` | C35 | — | v1.2.0 直接核实 |
| D57 | `ModelRuntime.create({credentials})` 接受任意 `CredentialStore`；pi-ai 导出 `InMemoryCredentialStore`；`setRuntimeApiKey` 只写内存覆盖层、不落盘；`AuthStorage.inMemory()` 存在但未从包入口导出。M1 只依赖 `setRuntimeApiKey`，以及为“运行时注入只在 Pi 判定你的 Pi 配置中没有凭据时进行”所需的 `removeRuntimeApiKey` 与探查运行时的 `ModelRuntime.create({authPath, modelsPath, refreshOnCreate: false})`、`checkAuth(provider)`（`core/runtime-credentials.ts:24-28` 的覆盖先于存储，`11` §11.7.1 模型凭据一行，ADR-230/231；ADR-230 的 `readStoredCredential` 不再使用，它不解析 `$VAR` 与 `!` 命令、不看 `models.json`；判定依赖 `AuthCheck` 的 `type` 与 `source` 标签 `stored credential`、`configured API key`，`core/provider-composer.ts:441, 446, 451`；没有 `models.json` 覆盖的内置 provider，标签来自各 provider 自己的 `resolve`、不经 `provider-composer.ts`——`ai/src/auth/helpers.ts:21`、`ai/src/providers/anthropic.ts:31`、`amazon-bedrock.ts:62, 69`、`google-vertex.ts:72, 85`、`cloudflare-auth.ts:50`，经 `ai/src/models.ts:679-680`——同属复核范围，ADR-232；Pi 升级时随本行复核）：凭据读用户 agentDir 中的 `auth.json`，不使用内存凭据存储（内存存储的 `modify` 只写进程内 `Map`，没有文件与跨进程锁，`ai/src/auth/credential-store.ts:40-56`，§5.3.6，ADR-208） | A | `model-runtime.ts:109-124, 217-218, 485-487, 599-640`；`core/runtime-credentials.ts:24-28`；`ai/src/models.ts:657-692`；`ai/src/auth/credential-store.ts:9`；`ai/src/index.ts:22`；`core/auth-storage.ts:357`；`index.ts:232-236` | C29、C26 | 导出 `AuthStorage` | v1.2.0 直接核实 |
| D58 | 登录只在 Pi 的交互界面中完成（ADR-176，R51-D5-01；SDK 另有公开的 `ModelRuntime.login`，Tower 不用它是设计选择，§5.10，ADR-180）：命令行位置参数作为首条消息交给 `session.prompt`，因此**已认证时** `pi "/login <provider>"` 作为一条普通 user 消息进入会话、不触发登录；**完全没有凭据时**由 `prompt` 预检抛通用的 `No API key found for <provider>`（`agent-session.ts:2118-2131`，`auth-guidance.ts:22-25`）。**已存 OAuth 凭据即视为已配置**，不看是否过期（`ai/src/models.ts:657-664`、`683-692`），预检通过；令牌在请求时刷新（剩余不足 5 分钟即刷新），失败抛 `ModelsError("oauth", "OAuth refresh failed for <provider>", {cause})`（`ai/src/auth/resolve.ts:102-103, 119-143, 169-176`；刷新带 15 s `AbortSignal.timeout`，`:103, :140`），`ModelsError` 把原因文本拼进 `message`：`OAuth refresh failed for <provider>: <原因>`（`ai/src/utils/models-error.ts:5-21`，原因取 `formatThrownValue`，`diagnostics.ts:17-21`），经 `lazyStream` 成为 `stopReason:"error"` 的 assistant 消息、只保留 `message`（`ai/src/api/lazy.ts:4-23, 46-59`），文本不含 `/login`。**是否重试取决于原因文本**（ADR-182 更正 ADR-180 的“Pi 不重试”）：可重试判定是不加锚点、不区分大小写的正则（`ai/src/utils/retry.ts:3-5, 30-75, 253-258`），含 `fetch failed`、`timeout`、`timed? out`、`ENOTFOUND`、`5xx` 等；网络不可用（原因含 `fetch failed`）或刷新超时（原因含 `timeout`）时 `_isRetryableError` 为真（`agent-session.ts:3734-3737`），Pi 先发 `auto_retry_start`（Tower 的 `retry.start{source:"agent"}`），按 `maxRetries: 3` 重试（`settings-defaults.ts:17-19`；`agent-session.ts:1201-1215, 3787-3809`），最终仍失败时 `agent_end{willRetry:false}` 的错误消息同样以该前缀开头；刷新令牌失效等原因不匹配时不重试。**压缩与摘要中的刷新失败**：SDK 的 `createAgentSession` 总是传入自定义 `streamFn`（`sdk.ts:411-431`），因此 `agent.streamFunction !== streamSimple`，摘要请求的认证预取失败被吞掉（`agent-session.ts:590-608`），刷新在摘要请求的 `streamFn` 中再次失败，经 `retryAssistantCall` 按同一正则重试（`retry.ts:192-242`，发 `summarization_retry_*`，Tower 的 `retry.*{source:"summary"}`），最终以 `compaction_end{errorMessage}` 出现，文本为 `<Auto-compaction failed|Context overflow recovery failed|Compaction failed>: Summarization failed: OAuth refresh failed for <provider>…`（`agent-session.ts:2910-2922, 3237-3253`；`compaction/compaction.ts:585-588, 755`），不成为 assistant 消息；`_getRequiredRequestAuth` 中带 “Run '/login …'” 的一支（`agent-session.ts:561-566`）只在 `streamFunction === streamSimple` 时经 `:591` 调用，Tower 的 SDK 宿主走不到。预检中 “Run '/login ${provider}' to re-authenticate” 一支要求 `hasConfiguredAuth` 为假而 `isUsingOAuth` 为真，但 `snapshot.auth` 与 `configuredProviders` 总是同时增删（`model-runtime.ts:342-369`、`393-426`、`910-926`），实际走不到——ADR-179 据它写的“认证失效时预检直接报认证错误”不成立（ADR-180 更正）。`/login` 只在交互编辑器提交时处理；`AgentSession.prompt` 把 `/` 开头的文本先路由给扩展命令（`agent-session.ts:2062-2063`），再展开 `/skill:` 与提示模板（`2090-2095`）。F7 的检测键与指引见 `06` §6.8 F7 | C | `interactive-mode.ts:1231-1233, 3293, 6327-6348`；`agent-session.ts:528, 561-566, 590-608, 1201-1215, 2062-2063, 2118-2131, 2910-2922, 3237-3253, 3734-3737, 3787-3809`；`model-runtime.ts:485-487, 543-553, 826-838`；`ai/src/models.ts:657-664, 683-692`；`ai/src/auth/resolve.ts:102-103, 119-143`；`ai/src/utils/models-error.ts:5-21`；`ai/src/utils/retry.ts:3-5, 30-75, 192-242, 253-258`；`ai/src/api/lazy.ts:46-59`；`sdk.ts:411-431`；`compaction/compaction.ts:585-588, 755`；`settings-defaults.ts:17-19` | C39 | — | v1.2.0 直接核实（ADR-180 复核；重试与压缩路径 ADR-182 复核） |
| D59 | `AgentSession.prompt` 返回 `Promise<void>`，在整个 run 结束后才 resolve；处置（`handled`/`queued`/`started`）只经 `PromptOptions.preflightResult` 回调给出，源码注释为 “Internal hook used by RPC mode”，预检被拒绝时不调用、`prompt` 以 rejection 结束（认证失败、无模型、流式中未给 `streamingBehavior`、压缩进行中——`:2071-2074`；Tower 在压缩期间暂停投递，见 §5.5 `compaction_start` 行与 §5.7.1，ADR-197）。SDK 适配器的 `prompt(): Promise<Disposition>` 以该回调 resolve，不等待 run 结束（§5.2.1，ADR-183）。**延迟分支**（ADR-184）：`_emitAgentSettled` 置 `_isEmittingAgentSettled` 后依次等待扩展 handler、发公开事件（`:1081-1085`），期间调用 `prompt` 只把调用推入 `_deferredSettledActions` 并立即 resolve、不调用 `preflightResult`（`:2054-2057`）；延迟动作在 finally 之后以同一 `options` 重新调用（`:1090-1093`），回调在那时才发生，预检抛错从上一个 run 的 settle 中抛出（`:1875`），到不了原调用者；`sendCustomMessage{triggerTurn}` 同样（`:2340-2342`）。Tower 只在公开 `agent.settled` 的监听器返回之后调用二者（标志在同步的 finally 中复位，`:1086-1088`），不进入该分支 | C | `agent-session.ts:323-324, 2053-2135, 1078-1093, 2054-2057` | C1 | 注释称内部钩子：升级时逐项复核 | v1.2.0 直接核实 |
| D60 | 内置文件工具的路径求值：`resolveToCwd` / `resolveReadPathAsync` 经 `resolvePath` / `normalizePath`（Unicode 空格归一、去掉前导 `@`、展开恰为 `~` 与以 `~/` 开头的值、`file://` 经 `fileURLToPath` 转换、相对 `cwd` 按词法求值；`read` 不存在时另试四个名字变体），`read`/`edit`/`write` 在 `execute` 中才求值，`tool_call` 看到原始参数；这些函数**不导出**，Tower 以固定于 v1.2.0 的移植 `piResolve` 复用（`11` §11.3.1 求路径，ADR-219）；工具把求出的绝对路径交给可替换的 `operations` | C | `utils/paths.ts:7, 76-107`；`core/tools/path-utils.ts:40-118`；`write.ts:65`、`edit.ts:161`、`read.ts:124`；不导出：`package.json` `exports`（只有 `.` 与 `./rpc-entry`）、`src/index.ts:336-392, 490-496` | C41 | 从包入口导出 `resolveToCwd`/`resolveReadPath`，或在 `tool_call` 事件中带上求出的路径 | 同 |
| D61 | 内置文件工具的工厂接受 `options.operations`，求出的绝对路径只经它读写文件内容（ADR-220，`11` §11.3.1 使用时强制）：`ReadOperations{readFile, access, detectImageMimeType?}`、`EditOperations{readFile, writeFile, access}`、`WriteOperations{writeFile, mkdir}`；`operations` 之外只有两处元数据访问：`read` 的名字变体探测（`resolveReadPathAsync` 用 Node 的 `fs.access`）与 `edit`/`write` 的 `withFileMutationQueue` 对路径取 `realpath`（串行化的键，ADR-221）。`read` 整读后截断（2000 行 / 50 KB），`edit` 整读整写（辅助进程的上限据此取，ADR-221）；一次调用依次调用几个操作——`read` 为 `access` → `detectImageMimeType` → `readFile`，`edit` 为 `access` → `readFile` → `writeFile`，`write` 为 `mkdir` → `writeFile`（辅助进程据此把读取与写入各合并为一次启动，ADR-222）；`read` 的 `autoResizeImages` 由选项传入。Pi 的输出文件（bash 截断输出的全文、MCP 截断结果的全文与二进制资源、codemode 的溢出文件）一律经 `utils/output-files.ts:19` 写在 `os.tmpdir()`，即本 Host 的 `TMPDIR`（§5.3.6 临时目录一行，ADR-224）；bash 的全文文件在原始字节数、解码后字节数或行数任一超限时建出，可以在 `finish()` 中才建出（`output-accumulator.ts:64-89, 239-243`），而正常结束与非零退出码时只有截断才在最终的 `details.fullOutputPath` 中给出路径（`bash.ts:342-343`），`structuredContent.full_output_path` 只在超过 1 MB 时出现；超时与中止时工具抛错、没有最终的 `details`，错误文本是截断后的输出加状态行（`:371-388`；状态行在最后，其前是命令自己的输出，截断时两者之间另有一行 “Full output: <path>”）。观察器只按最终 `details` 中的路径复制（`07` §7.2.2）；文件存在而路径不在其中的情形（超时、中止、无退出码与上述 Pi 一侧的边缘）不复制，文件随本 Host 的临时目录删除（ADR-224）。MCP 结果的模型可见文本超过 20 KB 时全文写出 `pi-mcp-*.txt`。工厂与 `*Operations` 类型从包入口导出；以 `customTools` 注入的同名工具的来源为 `<sdk:<名字>>`，压过内置与扩展定义；`grep` 的 `operations` 只有 `isDirectory`/`readFile`，搜索由直接派生的 `rg` 完成，包不住——Tower 因此不提供 `grep`（也不提供 `find`、`ls`） | A | `read.ts:48-55, 86-92, 124-155`、`:127, 129, 135, 155`；`edit.ts:83-90, 143-147, 161-198`；`write.ts:27-32, 44-48, 65-82`、`:78, 82`；`edit.ts:176, 186, 198`；`bash.ts:24, 342-353, 371-396, 424`、`output-accumulator.ts:64-89, 91-118, 239-243, 249`；`extensions/mcp/tools.ts:51, 60-61, 70-71, 183-199`；`extensions/codemode/execute.ts:338-341, 369`；`path-utils.ts:86-118`；`file-mutation-queue.ts:16-26, 33-49`；`read.ts:65, 90, 135, 155`、`truncate.ts:11-12`、`edit.ts:186, 198`；`utils/output-files.ts:17-27`；`utils/mime.ts:3-23`、`src/index.ts:494`；`grep.ts:53-58, 119-168`；`agent-session.ts:3529-3553, 3636, 3647`；`src/index.ts:336-392` | C41、C42 | — | 同 |
| D62 | 云 SDK 凭据的判定（ADR-227，`11` §11.7.1 “云 SDK 凭据链”行）：coding agent 经 `ModelRuntime` 的 `getAuth` → `resolveProviderAuth` → 各 provider 的 `resolve` 判定是否已配置，未配置时 `Provider is not configured: <provider>`；Bedrock 只认存储的凭据、`AWS_BEARER_TOKEN_BEDROCK`、`AWS_PROFILE`、原始密钥对、容器凭据 URI、Web Identity 令牌文件（只有 `AWS_SHARED_CREDENTIALS_FILE` 时为未配置）；环境中有 `AWS_PROFILE` 时区域不回落到 `us-east-1`、也不按模型端点取区域（没有区域、也没有环境 `AWS_PROFILE` 时取标准端点模型的端点区域，ADR-229）；Anthropic 的 `ANTHROPIC_AUTH_TOKEN` 只从进程环境读取并以 Bearer 头部发送；环境中的 `AWS_PROFILE` 与原始密钥对并存时 SDK 配置取原始密钥（只有 `options` 或存储凭据 `env` 中的 profile 优先，ADR-228）；Azure OpenAI 缺端点变量且模型无 `baseUrl` 时抛出，Cloudflare 缺账号（AI Gateway 另缺 gateway id）时为未配置；Vertex 每次以 `fs.access` 检查 ADC 文件（不缓存），并要求 project 与 location 同时存在；`env-api-keys.ts` 只经 `compat.ts:23` 导出，不在这条路径上 | C | `ai/src/models.ts:757`；coding-agent `core/model-runtime.ts:671-676`（未配置时在此抛出）；`ai/src/providers/amazon-bedrock.ts:54-79`；`ai/src/api/bedrock-converse-stream.ts:162-173, 184-205, 215-217, 1202-1209, 1225-1250`；`ai/test/bedrock-endpoint-resolution.test.ts:113-120`；`ai/src/providers/anthropic.ts:28-47`；`ai/src/providers/google-vertex.ts:64-89`；`ai/src/auth/context.ts:30-42`；`ai/src/api/azure-openai-config.ts:32, 74-91, 104`；`ai/src/providers/cloudflare-auth.ts:37-42`；`ai/src/utils/provider-env.ts:45-51` | C29 | 让 Bedrock 的判定也认 `AWS_SHARED_CREDENTIALS_FILE`/`AWS_CONFIG_FILE`（与 SDK 默认链一致） | 同（`bedrock-converse-stream.ts` 在 `v1.2.0..HEAD` 中只改了工具调用参数的解析，+2/−2 行，所引行号不变） |
| D63 | 代理分发器（ADR-232/233，§5.3.6 代理一行）：Pi 只在 CLI 入口（`cli/setup.ts`、`main.ts`、`rpc-entry.ts`、交互模式）无条件调用 `configureHttpDispatcher` 安装 undici 的 `EnvHttpProxyAgent`（`allowH2: false`、`proxyTunnel: true`、连接尝试时限 2 s、空闲超时取 `httpIdleTimeoutMs`、错误监听）并调用 `undici.install()`，它不从包入口导出；`httpProxy` 设置只在 `main.ts` 中补成代理变量；`settings-manager.ts` 引入 `http-dispatcher.ts`，所以 SDK 路径同样加载 undici；`packages/ai/src` 中只有 Bedrock 自己按代理变量建 agent。SDK 嵌入的 Host 由 Tower 总是以相同的选项安装、只用 Pi 所依赖的那一份 undici，Pi 升级时比对两者的选项与 undici 版本；SDK 会话在每次模型请求时另读 `httpIdleTimeoutMs` 作为请求时限（ADR-234），并读 `websocketConnectTimeoutMs` 与 `retry.provider.*`，`retry.provider.timeoutMs` 设置时优先；Pi 升级时比对该函数读取的全部设置，与 §5.3.6 代理一行每个 Run 校验的列表一致（ADR-235）；`retry.provider.timeoutMs` 原样成为厂商 SDK 的 `timeout`，Pi 升级时在它所钉的厂商 SDK 版本上确认 `timeout` 的校验与 0 的处理（v1.2.0 钉 `@anthropic-ai/sdk` 0.129.0、`openai` 7.19.0，ADR-236） | C | `core/http-dispatcher.ts:2-35, 45-50, 52-113`；`core/settings-manager.ts:11, 147-156, 304, 891-901, 925-936`；`core/sdk.ts:340-353, 420-421`；`ai/src/utils/provider-retry.ts:111-125`；`core/agent-session.ts:1204, 3795`；`ai/src/utils/retry.ts:72-73, 198, 218`；`packages/ai/package.json` 的 `@anthropic-ai/sdk` 0.129.0 与 `openai` 7.19.0；内置 MCP 扩展的请求时限取 `mcp.json` 的 `timeout`、默认 60 s（`extensions/mcp/runtime.ts:48, 210-211, 363`，覆盖 `packages/mcp/src/client.ts:38` 的 30 s，ADR-235）；`cli/setup.ts:12`；`main.ts:596-597, 874-875`；`rpc-entry.ts:11`；`interactive-mode.ts:2063, 5014`；`package.json` 的 `undici` 8.10.2；`package.json` 的 `exports`；`ai/src/api/bedrock-converse-stream.ts:226-227`；`packages/mcp/src/transports/streamable-http.ts:211` | C43 | 从包入口导出 `configureHttpDispatcher` | v1.2.0 直接核实 |
| D64 | 扩展注册的 provider（ADR-232，`11` §11.7.1 模型凭据一行，`06` §6.1.1 打包的分组）：会话创建时扩展的 `registerProvider`、`registerNativeProvider` 写进传入的 `modelRuntime`，保留到显式 `unregisterProvider`（会话结束不移除）；`ModelRuntime.create` 只装内置 provider 与 `models.json`，所以探查运行时看不到它们；`getRegisteredProviderIds()` 列出扩展注册的 provider；初次加载之后的注册立即生效、可在命令处理器或事件回调中发生，会话把它直接绑到运行时，Pi 没有 provider 注册的事件（ADR-233）；Pi 在每次模型调用之前等待扩展的 `turn_start` 处理器，适配器的事件订阅不被等待，运行时覆盖的移除经队列异步执行（ADR-234）；缓存预热直接调用运行时、不经 `turn_start`（`core/cache-warmer.ts:330-339`），处理器的异常被 Pi 捕获、请求照常发出（`core/extensions/runner.ts:1096-1125`，ADR-235） | B | `core/agent-session-services.ts:158-181`；`core/model-runtime.ts:217-268, 526-528, 579-597, 634-640, 891-957`；`core/extensions/types.ts:1058-1063, 1814-1817`；`core/agent-session.ts:1039-1043, 1143, 1293-1299, 3496-3505`；`packages/agent/src/agent-loop.ts:117-118, 146-147, 207`；`packages/agent/src/agent.ts:609-610`；`ai/src/models.ts:688` | C44 | — | v1.2.0 直接核实 |

**不再依赖**的项：导出的 `compact()`、`getApiKeyAndHeaders`、`session_before_compact`（ADR-026 删除了压缩接管）；`pi.exec`（检查点由 Supervisor 的 GitService 执行，扩展只发出请求，`10` §10.7.2，ADR-183）。

**升级时的使用方式**：Pi 每次升级时，A 类按类型快照和契约测试判定；B、C 类必须逐项重新读源码并跑对应的测试，再在 PR 描述中逐项勾选。

### 5.11.2 契约测试

使用 Pi 导出的 faux provider（`AI/src/providers/faux.ts:62, 704`，其中 `fauxToolCall` / `fauxProvider`），不调用真实模型。RPC 模式下，通过一个仅用于测试的扩展 `pi.registerProvider` 注入 faux provider。测试运行在独立的 `PI_CODING_AGENT_DIR` 临时目录中。

| ID | 断言 |
|---|---|
| C1 | 事件序列：简单 prompt、带工具调用、重试（faux 先报错后成功）、阈值压缩、中途 abort 这五种情况下，`agent_start…agent_end(willRetry)…agent_settled` 的顺序和字段都符合预期；SDK 适配器的 `prompt()` 在 `agent_start` 之前以 `started` resolve（不等 run 结束），无凭据的 provider 在回调之前 rejection（D59，ADR-183）；在公开 `agent_settled` 监听器返回之后调用的 `prompt()` 总有回调，不落入延迟分支（D59，ADR-184） |
| C2 | 流式输出中 steer → `queue_update` 中出现文本 → user `message_start` → 文本从队列移除；followUp 只在停止点送达；空闲时 steer 不启动 run（锁定 G13）；`clear_queue` 返回文本 |
| C3 | `turn_end` 返回的 entries 会被提交，并产生 `entry_appended`；返回值是替换语义（G18）；`agent_before_settle` 的 continue 只生效一次，且 `canContinue` 规则成立 |
| C4 | `sections` 不变时没有补丁，变化时有补丁；压缩之后系统段仍然存在 |
| C5 | `tool_call` 的 block+reason 会变成错误结果；handler 抛异常会阻断工具；嵌套的 codemode 调用也会经过 `tool_call`，并带 `parentToolCallId`；（ADR-237）handler 抛异常时 Pi 不发 `extension_error`，tower-goal 经 `bridge` 的自报仍使 F13 的计数增加，连续 3 次时 Goal 暂停（§5.6.5 第 6 项）；（ADR-238）`turn_start` 处理器抛出时计数只增加一次（Pi 另发的 `extension_error{event:"turn_start"}` 不计）；`tool_result` 脱敏处理器抛出时模型收到的是 `工具已执行，但结果未能脱敏，已隐去` 的结果（`isError: true`、`structuredContent` 一致、`details` 为空对象），会话文件的 toolResult 消息与 `tool.end` 中都没有原文（含截断的 bash 输出所带的 `details.truncation`），计数增加；（ADR-239）计数按处理器：同一处理器连续 3 次时 Goal 以 `prepare_failed` 暂停，另一处理器的正常完成不清零它——`turn_start` 每次都抛出而 `turn_end` 与 gate 照常完成的一组、gate 每次都抛出而每条助手消息只有一个工具调用的一组，都在该处理器的第三次出错时暂停；每次出错只并入同一条 `an:{goalId}:tower_goal_handler_error`；成功路径上截断的 bash 输出含一个已知机密时，会话文件与 `tool.end` 的 `content`、`details` 中都没有原文（Pi 写在临时文件中的截断全文不在此列，`11` T12） |
| C6 | `terminate`：单独调用 submit 时 run 结束；与其他工具同批时 run 继续（G16） |
| C7 | 扩展 UI over RPC：`input` 超时得到 undefined；应答按 id 关联；晚到的应答被丢弃；`editor` 没有超时 |
| C8 | RPC 分帧：字符串中含 U+2028 不会断行；并发命令的响应乱序；暂停读取会让 agent 停住，恢复读取后继续 |
| C9 | `--session-dir` + `--session-id` 会新建会话；`--session <file>` 能恢复；cwd 缺失时退出码为 1；SDK 用 cwdOverride 能恢复 |
| C10 | 整个测试期间，`settings.json` 的 mtime 不变（G5） |
| C11 | `--no-approve` 和 SDK 的 `projectTrusted:false`（不传 `resolveProjectTrust`）下：项目扩展、项目 `settings.json` 中的 `extensions`/`packages`（含指向 `.pi` 之外的本地路径）、`.pi/mcp.json` 的服务器都不加载、不安装、不启动；用户级扩展与用户级 `mcp.json` 照常；以显式路径传入的技能、提示、主题与以内容传入的 `systemPromptOverride`/`appendSystemPromptOverride` 照常生效（ADR-202/203） |
| C12 | 工具 details 的形状：`edit.patch` 存在；`bash.structuredContent.exit_code` 存在；非零退出时 `isError`；`write` 的 details 为 undefined；超时与中止经 Tower 的 `exec` 时，错误文本以 `Command timed out after <N> seconds` / `Command aborted` 结尾，输出被截断时其前为 `[Showing … Full output: <path>]` 后缀（D38 的拒绝约定，ADR-226） |
| C13 | `get_session_stats.contextUsage` 存在；压缩后 tokens 为 null |
| C14 | SDK 的 `navigateTree`、`fork` 之后重新绑定，事件流不丢失；(b)（R61-D5-01）测试扩展的命令在 Run 中途依次调用 `ctx.reload()`、`ctx.newSession()`、`ctx.fork()`、`ctx.switchSession()`、`ctx.navigateTree()`：第一个抛错并产生 `extension_error{extensionPath:"command:<命令名>"}`，其余返回 `{cancelled:true}`；会话文件、叶子与 tower-goal 实例都不变，没有第二次 `session_start`，每次拒绝各有一条 `command action refused` 的 `engine.error`（§5.3.5） |
| C15 | 参考 Goal 和最大 Goal 的常驻增量分项都不超过 ADR-009 的预算（工具 ≤ 350，系统段 ≤ 300，以及各子项上限，§5.6.3），口径为 ADR-032 的估算；(b)（ADR-185）同一作用域 4 条 60 token 的置顶记忆：常驻 `Notes:` 只含 1 条，其余 3 条排在 `contract.md` 的 `## Memory` 最前，生效记忆面板标 `置顶但未进常驻`；一条 80 token 的置顶记忆总能进入常驻（`09` §9.5.2） |
| C16 | 两种 adapter 对同一份 faux 脚本输出的 `TowerEngineEvent` 序列逐项相等（忽略 hostSeq 和时间戳） |
| C17 | 压缩之后：`tower.ledger` 消息恰好出现一次，位于压缩条目之后；**压缩前后 `agent_start` 次数不变**，没有额外的回合（包括 submit 带 `terminate:true` 之后发生的阈值压缩）；`summarization_retry_*` 事件照常发出（说明 Pi 默认路径没有被改动） |
| C18 | `/tower-nav` 在 RPC 下的效果与 SDK 的 `navigateTree` 一致：叶子位置和 `branch_summary` 条目都相同 |
| C19 | ADR-025：测试扩展在 `agent_settled` 处理器中调用 `pi.sendMessage(..., {triggerTurn:true})` 时，会出现新的 `agent_start`；Tower 的 2 s 宽限确认能捕获它，并把 Goal 从 `claimed` 撤回 |
| C20 | 扩展顺序：SDK 中 tower-goal 位于 `extensionsResult.extensions` 末尾，其后没有 `tool_call` 处理器；RPC 中 `-e` 扩展位于首位（锁定 G32 的现状，Pi 改变顺序时这项测试会失败并提醒我们） |
| C21 | MCP：`mcp.json` 有服务器时连接，没有时不连接；用户设置 `-builtin:mcp` 时 SDK 也不加载；SDK 下 stdio 服务器的环境 = `mcpBaseEnv`（变量只按 §5.3.5；断言其中各项与 Host 的 `TMPDIR` 都在，ADR-231）+ 该服务器 `env` 中声明的变量，**不含** Host 的云凭据（`inheritEnv:false`，§5.3.5）；RPC 下 MCP 服务器继承 pi 子进程的完整环境（残余风险，§5.3.5）；SDK 下需要 OAuth 的 HTTP MCP 服务器（本地 HTTP 桩服务器，返回 401 + `WWW-Authenticate` 挑战并接受预置令牌；`@earendil-works/pi-mcp/testing` 只导出内存传输，不含 OAuth 桩）：Pi 凭据存储中已有令牌时连接成功、令牌刷新生效；无令牌时进入 `needs-auth` 并提示登录，与 Pi 默认工厂行为一致（R7-D5-01）；SDK 下 stdio 服务器的工作目录（ADR-214，§5.3.5）：不写 `cwd`（或写 `.`、`x/..` 这类求出空目录本身的值，ADR-218）的服务器进程的工作目录是本 Host 的 `~/.tower/mcp-cwd/<hostId>/`，写了其他相对 `cwd`（如 `sub`）的不启动、带 §5.3.5 的文字，写了绝对 `cwd`（你自己的目录）的就是该目录；写了含 `..` 的相对 `cwd` 的三组（ADR-217）：求出各 Host 空目录的上一级目录的（`..`）与求出该项目主检出的都不启动、带 §5.3.5 的相应文字，求出你主目录中另一个目录的照常启动、工作目录为该目录；夹具服务器在本 Host 的空目录中留下文件之后，该 Host 退出时目录被删除，下一次 Host 启动时新建为空，新启动的服务器进程看不到那些文件（ADR-215/216）；两个 Goal 的 Host 并发时各用各的目录，后启动的 Host 不删除、不改动先启动的 Host 的目录，先启动的 Host 中已启动的服务器照常可用；Supervisor 重启时只删除不属于存活 Host 的残留目录（ADR-216）；卫星中出现与服务器同名的本地依赖或项目级包管理器配置之后，新会话启动的服务器进程的工作目录与实际执行的程序都不变；`cwd` 落在卫星、`$GS` 或 `~/.tower/` 之下（本 Host 的空目录本身除外）的服务器不启动、状态为 `failed` 并带 §5.3.5 的文字；服务器收到的 `roots` 为卫星；内置 MCP 的来源自检（ADR-215，§5.3.5）：已确认的用户扩展注册 `/mcp` 时，确认卡片出现“该扩展取代 Pi 内置的 MCP，M1 中不可用”，Run 不开始、为 `paused(prepare_failed)`，卡片写出该扩展，没有任何 MCP 服务器进程被启动（夹具取代者的工厂只注册命令、到 `session_start` 才连接；取代者在工厂中自己启动的进程不在此列，§5.3.5，ADR-216）；另一组在上下文交接（新会话）时：夹具扩展以文件标记切换、只在交接重建运行时的那次加载中注册 `/mcp`，自检再跑，新会话不创建，Goal 进入 `paused(prepare_failed)`（ADR-216），卡片写 `运行已停止：…`、`重试` 的说明为“开新的运行”（ADR-217）；资源工具的 `file:` URI（ADR-217，`11` §11.3.4 路径检查 (1)；Pi 的 `read_mcp_resource` 以 `uri` 参数原样交给服务器，`extensions/mcp/resources.ts:72`、`:311-315`）：夹具服务器的资源以 `file:` URI 标识，Agent 以 `file:` URI 读取 `~/.ssh/` 中的私钥文件时出现 `secrets.access` 的审批卡、只有“仅这一次”，以百分号转义写出的、指向该项目主检出中文件的 `file:` URI 被 forbid、不出现审批卡，即使此前已授予该工具“本 Goal 内同类”；`https://` 形状的参数不按路径检查；用户设置 `-builtin:mcp` 而没有别的扩展注册 `/mcp` 时照常开 Run、没有 MCP |
| C22 | 输入比对：测试扩展排在 gate 之后、原地修改 bash 命令时，`tool_result` 中哈希不一致，并产生 `input_mutated_after_gate`；扩展工具不参与比对 |
| C23 | RPC 活性：用测试扩展阻塞 pi 子进程的事件循环 40 s，`get_state` 探针在 30 s 时报告超时；进程退出码语义（0 / 143 / 129）正确 |
| C24 | `policy.mode="draining"` 时，run 结束不触发 nudge |
| C25 | 只有嵌套 codemode 写文件的 turn 也会产生检查点 |
| C26 | `setRuntimeApiKey` 注入的凭据可以用来调用 faux provider；bash 子进程 `env` 中看不到这个凭据；白名单之外的变量也看不到 |
| C27 | 测试扩展改写 bash 的 `content` 但不返回 `structuredContent` 时，后者被丢弃，Tower 产生 `structured_content_dropped` 告警 |
| C28a | `C-tool-precedence`（SDK）：`customTools` 中的 bash 胜过任何扩展注册的同名 bash；`getAllTools()` 中 bash 的 `sourceInfo.path` 为 `<sdk:bash>`；`spawnHook` 改写的环境对子进程生效，其中的 `PI_*` 恰为 `bashEnv` 保留的五个会话变量（§5.3.6，ADR-212）；`commandPrefix`/`shellPath` 与用户设置一致（清单确认之前与 `riskTier=high` 的 Goal 同样如此）；后台命令（`sleep 60 &`）与其子进程的环境中含本 Run 的 `TOWER_RUN_TOKEN`；用一个**不改写 env** 的 `spawnHook` 替身重复一次，令牌仍在（由 `exec` 自身注入，ADR-144）；用户扩展注册名为 `submit` 的工具时，`getAllTools()` 中 `submit` 的来源是该扩展，Tower 工具的来源自检不通过、不开 Run（`paused(prepare_failed)`，§5.3.5，ADR-187）；另一组在 `session_start` 中注册 `submit`，结果相同；再一组在 Run 中途（扩展命令）注册 `submit`，Agent 下一次调用 `submit` 被 gate 阻断、不出现审批卡，Goal 经 drain 进入 `paused(prepare_failed)`（§5.6.5，ADR-188）；Run 中途的那组由测试扩展自己触发命令（`sendUserMessage("/<命令>", {expandPromptTemplates:true})`，`agent-session.ts:2390-2420`），或在 `turn_start` 处理器中注册——SDK 下 Tower 不提供斜杠命令入口；（R61-D11-01）用户与项目设置的 `defaultTools` 都含 `powershell`，另有扩展在 `session_start` 中 `setActiveTools([...当前, "powershell"])`：`getAllTools()` 中没有 `powershell`，三个阶段的活跃工具与 `executeTool` 可调用的工具中都没有它，`running` 的活跃内置工具恰为 `read`/`bash`/`edit`/`write`；以上断言在 Tower 自己的 `newSession` 与 `fork` 之后的会话中同样成立（`excludeTools` 由 runtime 工厂每次传入）；对照组（不传 `customTools` 与 `excludeTools`）中，来源以 `builtin:` 开头、且不是三个 builtin 扩展路径（`builtin:codemode`、`builtin:tool-search`、`builtin:mcp`，`11` §11.3.4 的 `builtin:` 来源允许表，ADR-190）的名字恰为 `TOWER_BUILTINS ∪ NON_TOWER_BUILTINS`，Pi 新增内置工具时这一组失败（§5.3.5） |
| C28b | `C-tool-precedence`（RPC，回归保护）：扩展之间先注册者胜，`-e` 的 tower-goal 胜出；用桩替换 `getAllTools` 模拟“Pi 改变了优先级”时，复核能检出并降为 S0。在 v1.2.0 下，运行期另一扩展的 `registerTool(bash)` **不会**取代 tower-goal 的 bash，测试断言这一点 |
| C31 | 沙箱路径（R4-D2-03）：RPC 下 `!cmd` 和 RPC `bash` 命令经 tower-goal 的 `user_bash` 处理器在 S2 中执行（向沙箱外写文件失败）；处理器抛错时命令被阻断，不回落到本地执行。SDK 下 AgentSession 不发 `user_bash`（只有 interactive 与 RPC 模式发，`interactive-mode.ts:7005`、`rpc-mode.ts:562`），而 Tower 不提供 `!cmd`，所以 SDK 下没有这条路径。`pi.exec` 与 MCP 服务器仍在沙箱外，但继承了 `GIT_CEILING_DIRECTORIES` 与 `GIT_CONFIG_*`：扩展 `pi.exec("git", ["status"])` 在卫星中得到“不是 git 仓库”。Tower 自身从不调用 `pi.exec`（静态检查 tower-goal 源码）；RPC `bash` 命令（ADR-144）：`bash "sleep 60 & env"` 派生的后台进程环境中**含**本 Run 的 `TOWER_RUN_TOKEN`，**不含** Host 的凭据变量（`exec` 以白名单环境构造，不回落到进程环境），settle 时该后台进程被终止 |
| C32 | `tower.processes_terminated` 的投递（ADR-129）：SDK 下 run 进行中调用 `sendCustomMessage(msg, {triggerTurn:false})`，消息在当前 turn 结束后进入会话、下一次 LLM 调用可见，且不开新 run；空闲时同样不开 run；RPC 下 tower-goal 的 `pi.sendMessage(msg, {triggerTurn:false})` 行为相同；自动恢复时它是恢复 Run 的第一条消息 |
| C33 | 变更类工具调用（ADR-130）：`submit` 之后 (a) codemode 中嵌套的 `edit`、(b) MCP 写工具（无 `readOnlyHint`）、(c) 声明 `readOnlyHint:true` 但路径检查不通过的工具，三者都使 `submit` 作废并在 `agent_before_settle` 触发 nudge；`submit` 之后仅由后台 watcher 写文件时 `submit` 仍有效、pin 含该写入 |
| C34 | 宽限窗口与压缩（ADR-135）：`agent_settled` 后 1 s 内扩展调用 `ctx.compact()`——不出现新的 `agent_settled`；Tower 在 `compaction_end` 后重新计时 2 s，随后正常进入 `claimed` |
| C35 | `/tower-inject`（ADR-135，RPC）：`prompt("/tower-inject <id>")` 在空闲与流式中都执行 tower-goal 的命令处理器；会话中**不出现** user 消息，只出现 `tower.*` custom message；`triggerTurn:true` 时开始 run 且触发 `before_agent_start`；同一 `<id>` 重发只投递一次；(e) 另一个扩展也注册 `tower-inject`（握手后才加载，例如 `reload`）：下一次注入前的 `get_commands` 中出现 `tower-inject:1`/`:2`，Tower 终止 Run 并提示；(f) `disposition ≠ handled` 时 Run 终止并记 `engine.error`；(g)（ADR-183）tower-goal 的命令处理器抛错：Pi 发出 `extension_error{extensionPath:"command:tower-inject"}` 后仍返回 `handled`，Tower 把该段按投递失败处理 |
| C36 | SDK 下 `inject`（`sendCustomMessage`）开场的恢复、返工、交还 Run：会话中只有 `tower.*` custom message，**没有** user 消息；交还有人写的文字时恰好一条 user 消息（人的原文），`tower.handback` 中不含该文字 |
| C37 | nudge 窗口（ADR-138）：上一个 Run 已有效 submit，返工 Run（custom 开场）中改动后未再 submit → tower-goal 在 `agent_before_settle` nudge 一次；`nudge.max` 按 Run 计，不跨 Run 累计；(b) 同一 Tower Run 内第二个 Pi agent run（宽限失败后由扩展定时器引起）：不写第二个 `tower.run_start`，前一个 agent run 中的有效 submit 仍在窗口内，不 nudge；(c) Run 进行中重启 Tower：起点从本 `runId` 的 `tower.run_start` 重建；(d) `fork` 后在新分支上重建，窗口不错位（`14` G35c(p) 引用此条） |
| C38 | 多段开场（ADR-143）：`pendingOpenings` 有 3 条且有人写的文字——SDK 下前 3 条依次 `sendCustomMessage(…, {triggerTurn:false})`、随后 `prompt(human)` 开始 run，会话中顺序为 3 条 `tower.*` 后 1 条 user；无人写文字时第 3 条 `triggerTurn:true`；RPC 下每段经 `/tower-inject <id>`，逐段确认送达（`handled` 且没有 `command:tower-inject` 的 `extension_error`、会话中出现带该 `details.key` 的消息，D55，ADR-183）后才发下一段；另以一个抛错的 handler 验证该段按失败处理（M2）；任何一段 `disposition ≠ handled` 时 Run 终止，未投递的条目以原 `id` 重新入队（队列已在 `run.started` 时消费，ADR-145）；投递开始后撤回其中任一 `id` 返回 `already_delivered` |
| C39 | 登录指引（ADR-176/180，D58）：(a) 以**已认证**的 faux provider（faux 只有 API 密钥认证，`ai/src/providers/faux.ts:708`）运行 `pi "/login faux"`，该文本作为首条 user 消息进入会话，不进入登录流程；另以一个没有任何凭据的 API 密钥类 provider 运行同一命令，`prompt` 预检抛 `No API key found for <provider>`、不发出消息，也不进入登录流程；同一 provider 以 `sendCustomMessage{triggerTurn:true}` 开场时不经预检，最终错误为 `No API key for provider: <provider>`，Tower 按 F7 ① 归类（ADR-207）；(b) 交互编辑器中提交 `/login faux` 进入登录流程；(c) 注册一个声明 `auth.oauth`、其 `refresh` 抛错的测试 provider，存入 `expires` 已过的 OAuth 凭据：`prompt` 预检**通过**、user 消息进入会话；随后的 assistant 消息 `stopReason:"error"`、`errorMessage` 以 `OAuth refresh failed for <provider>` 开头且不含 `/login`，`refresh` 抛出的原因文本不含网络或超时字样时 Pi 不自动重试；Tower 据此生成 F7 的 Needs-You（“在终端启动 `pi`，输入 `/login <provider>`”与“重试”；kind 与子类型为 `stalled{engine_error}`，去重键 `st:{goalId}:auth`，`08` §8.4，ADR-206），Goal 进入 `paused(provider_unavailable)`；不进入 F6 的根因合并，也不另有 F6 的条目；(d)（ADR-182）同一测试 provider 的 `refresh` 改为抛 `TypeError("fetch failed")`：Pi 发出 `retry.start{source:"agent"}` 并重试 3 次，期间**不**生成 F7 条目、F6 不开始根因合并；最终 `agent.end{willRetry:false}` 的错误仍以该前缀开头，此时才生成 F7；另以过期凭据触发阈值压缩，`compaction.end` 的 `error` 含 `OAuth refresh failed for <provider>`，按 F7 归类（同一 Goal 已有 F7 条目时按 `st:{goalId}:auth` 并入）；(e)（ADR-207）接 (c)：`provider_unavailable` 的探测以 `ModelRuntime.getAuth` 执行，`refresh` 仍抛错时探测失败、暂停不解除；把 `refresh` 改为成功后，下一次探测解除暂停，条目以 `actionable` 关闭；只有压缩失败而 Run 正常结束时，条目在 Run 结束时以 `obsolete` 关闭；另（ADR-234）以一个只靠导入密钥的 API 密钥类 provider 使 Goal 进入 `paused(provider_unavailable)`（测试端点返回 503 至重试耗尽），服务它的 Host 存活期间：探测在该 Host 中执行，Supervisor 进程中没有 `getAuth` 调用、`auth.json` 的 `!` 命令没有因探测重新执行，端点恢复后下一次探测解除暂停；该 Host 退出之后（ADR-235）：不再探测、没有新起的 Host，端点恢复后 Goal 仍为 `paused(provider_unavailable)`，卡片写 `提供方可能已恢复？[重试]`，`goal.resume` 后照常运行；provider 由扩展以内置 id 覆盖的一遍在 Host 存活期间同样不探测；(f)（ADR-208）接 (a) 中没有凭据的 provider，以 `prompt` 开场：Goal 进入 `paused(prepare_failed)`，收件箱只有一条 `stalled{engine_error}`（`st:{goalId}:auth`），没有 `st:{goalId}:prepare`；该条目不显示 `X`，`needs_you.dismiss` 返回 `E_STATE`；配置密钥后“重试”（`goal.resume`）解除 `prepare_failed`，同一事务关闭该条目（`actionable`）；另以 `riskTier = high`（`noExtensions:true`）的 Goal 重复 (c)(e)：测试 provider 的 `refresh` 改为成功（相当于人在终端 `pi` 中重新登录）后，下一次探测解除暂停，刷新后的凭据写回用户 agentDir 中的 `auth.json`（§5.3.6） |
| C29 | 机密不进入 Agent 可影响的进程（ADR-164，M1 规则唯一定义在 `11` §11.7.0）：(a) SDK 下 Host 进程的环境中不含任何模型提供商密钥（`setRuntimeApiKey` 注入，只在进程内存中，§5.3.6），以 faux provider 发出的请求仍带正确密钥；(b) 云 SDK 凭据只交给 Engine Host（指向文件的变量 / 即时投递文件），Agent、验证器与检验检出的进程环境中都没有；只有原始密钥变量时 Host 环境中有 `AWS_PROFILE` 与 `AWS_SHARED_CREDENTIALS_FILE`，`ModelRuntime` 对 `amazon-bedrock` 的判定不为未配置；`AWS_REGION` 与 `GOOGLE_CLOUD_LOCATION` 原样在 Host 环境中（D62，ADR-227）；`AWS_PROFILE` 与原始密钥并存时 Host 环境中的 `AWS_PROFILE` 为 `tower-<hostId>`、不是你的 profile，`AWS_REGION` 取你的 profile 在配置文件中的区域；`AZURE_OPENAI_BASE_URL` 与 `CLOUDFLARE_ACCOUNT_ID` 原样在 Host 环境中、不在 bash 中（ADR-228）；(c) M1 中**没有任何钥匙串值**进入 Agent、验证器或检验检出进程的环境：对这三类进程运行期间的环境采样，不出现任何钥匙串条目的值；合同编辑器拒绝给 `exec` 标准声明 `env` 机密；(d) 不变式表述为“Tower **不会自动**把机密交给 Agent 可影响的进程”（ADR-166）：机密本地文件不播种到卫星与验证槽位，检验检出只在人打开时显式选择 `withSecrets`（记 `inspect_with_secrets`）才带上；人工编辑检出默认不含，交还时机密本地文件的路径一律不进入 T1、检查点或 seal（ADR-167） |
| C30 | RPC 适用条件与输入比对（ADR-065，R4-D5-01/02）：(a) 静态扫描能识别注册了 `tool_call`/`tool_result`、或覆盖 `bash` 的扩展语料（包括 Pi 自带的 sandbox、permission-gate 等示例和若干真实第三方扩展），对这些配置拒绝 RPC；(b) 在 `execute` 中修改自己参数的扩展工具和 MCP 工具都能正常执行，并且**不产生** `input_mutated_after_gate` 哨兵；内置工具执行后，输入哈希与放行时一致；(c) 在允许的配置下，人为注入一个后加载、修改 bash 输入的处理器，哈希比对能发现它；(d) 默认开启的 `builtin:mcp` 在 RPC 下与 tower-goal 共存：它的 `tool_call` 处理器不修改输入，白名单与当前 Pi 版本一致 |
| C40 | Pi 运行开关与包目录的查找顺序（ADR-211/212，§5.3.6、§5.10）：用户 agentDir 设为非默认目录 D，D 的 `settings.json` 的 `packages` 列出一个未安装的 npm 包与一个已安装但版本与设置不符的 npm 包，D 与默认目录 `~/.pi/agent` 各有一份 `mcp.json`（服务器不同）；以 SDK Host 启动 Run（清单确认之前与确认之后各一次）——Host 进程环境含 `PI_OFFLINE=1` 与 `PI_CODING_AGENT_DIR`=D；没有安装子进程（包管理器的 `install`、`git clone`）、没有对注册表的网络请求，D 与默认目录下都没有新增的 `npm/`、`git/` 内容；未安装的包在 `<D>/npm/` 下不存在，Pi 照 v1.2.0 以设置的包管理器运行只读全局根查询（npm 的 `root -g` 按实例缓存，pnpm 的 `list -g` 每个包一次，`core/package-manager.ts:2102-2130`、`:2151-2158`），测试以 npm 与 pnpm 各跑一遍，记录这些查询并断言全局根查询之外没有包管理器子进程（不限次数，ADR-213）；Host 进程环境与工作目录中没有任何值指向 Agent 可写的位置（`$GS`、卫星、`$TMPDIR/tower-<goalId>`；没有 `NPM_CONFIG_USERCONFIG=$GS/npmrc`），`PATH` 与包管理器位置变量等于最近一次从登录 shell 读到的值（§5.3.6，ADR-213/214）；另一组：Agent 在 S2 中改写 `$GS/npmrc`（加入 `prefix`，指向卫星中它写出的、含一个与未安装包同名且版本相符的包的目录）之后，同一 Host 中新建会话（上下文交接）——全局根与 `extensionsResult` 都不变，该包仍列为“未安装”、不加载；夹具的全局根中没有这两个包时，两个包都不在 `extensionsResult` 中，静态清单把它们列为“未安装”；另一组把版本相符的同名包放进该全局根：确认之后 Pi 加载它，静态清单在确认之前就把它列为已安装并带目录哈希；另一组（ADR-214）把 `npmCommand` 设为先挂起、后返回该全局根的包装脚本：Supervisor 的查询在 60 s 时被终止（脚本及其子进程都不再存在，ADR-215），Host 不启动，Run 为 `paused(prepare_failed)`，没有清单外的扩展被加载；查询出错（脚本以非零状态退出）时同样；首次运行时用同一脚本，确认卡片在 60 s 后对该包显示“无法确定是否已全局安装（全局根查询出错或超过 60 秒）”与 `[重试]`，不把它列为“未安装”；确认之后 MCP 只连接 D 的 `mcp.json` 中的服务器、`mcp.log` 写在 D 中，确认之前不加载 MCP 与任何扩展；两次 Run 的 Host 进程环境中这两项相同；bash 子进程环境中没有这两项；默认目录中的文件 mtime 不变 |
| C41 | 文件工具的路径求值（ADR-219，`11` §11.3.1 求路径，D60）：(a) 一组夹具值——相对路径、`..`、绝对路径、`@x`、`@~/x`、`~`、`~/x`、`~user/x`、`~foo`、`file:///abs`、`file://localhost/abs`、`FILE:///abs`、`file:/abs`、含 `%20` 的 `file://` 值、主机名不是 `localhost` 的与含编码 `/` 的 `file://` 值、含 U+00A0 / U+202F / U+3000 的路径与 `~/` 加 Unicode 空格的组合——在临时主目录与会话 `cwd` 下，Tower 的 `piResolve` 与 Pi 自己的求值逐项相等；Pi 一侧以包入口导出的 `createReadToolDefinition`、`createWriteToolDefinition`、`createEditToolDefinition` 配上只记录路径的 `operations` 执行（D61），读出工具交给 `operations` 的绝对路径，不依赖未导出的模块；Pi 抛错的值在 Tower 一侧为“不能确定”（`opaque`）。(b) 夹具中只存在 AM/PM、NFD、弯引号变体名字的文件：Pi `read` 实际读到的路径在 Tower 判定的候选集合之中——变体探测用的是 Node 的 `fs.access`、不经 `operations`（D61），所以这一组须在临时目录中放真实文件，只记录路径的 `operations` 照常记录探测之后选中的路径。(c) 只写期望，各写法（`~/…`、`@~/…`、`file:///…`、带 Unicode 空格的同一路径）都同样判定：写卫星之外的路径为 `edit.outside_worktree`（各预设 forbid）；读主目录下的凭据文件为 `secrets.access`；读写用户主检出、影子目录或其他 Goal 的卫星为硬底线 forbid、不出现审批卡；`~user/x`、`FILE:///x` 按卫星中的相对路径判定，与 Pi 实际读写的位置相同 |
| C42 | 文件工具的使用时强制（ADR-220，`11` §11.3.1 使用时强制，D61）：SDK 会话中 `getAllTools()` 的 `read`、`edit`、`write` 来源为 `<sdk:read>`、`<sdk:edit>`、`<sdk:write>`，用户扩展注册这三个名字时仍是；注册表中没有 `grep`、`find`、`ls`（扩展注册的同名工具同样被移出）；在 Tower 自己的 `newSession` 与 `fork` 之后同样成立。S2 的 Goal 中，只写期望。(a)–(d) 的换链接都由测试构建中的钩子在分类之后、该次调用的辅助进程启动之前完成（Tower 的 `operations` 在启动辅助进程之前调用它，只存在于测试构建中，ADR-222），所以换法确定地落在分类与访问之间：(a) 一次 `write` 的目标在分类时是卫星中的普通路径（`edit.in_scope`），钩子把其父目录换成指向用户主检出的符号链接——写入失败，主检出不变，记 `sandbox_violation{category:"user_checkout"}`；(b) 同样的换法使 `read` 指向临时主目录下 `~/.ssh` 中的夹具文件——读取失败，内容不进入工具结果，记 `sandbox_violation{category:"credential"}`（severity 2）；(c) `edit` 在读与写之间被换链接（钩子在写入的那次启动之前）——写入不落到卫星之外；(d) 换法改由 Agent 此前启动、仍在运行的后台进程完成（钩子向它发信号并等它换完），结果相同；另一组在调用发出之前就已换好——分类即看到主检出，按 S2 必然拒绝直接返回说明，不出现审批卡、不发生访问、不记 `sandbox_violation`；(e) 对照组：不换链接时同样的读写成功，被拒的工具结果附沙箱解释一行；(f)（ADR-221）分类时已在 S2 读允许列表之外的 `read`（本 Host 临时目录 `~/.tower/tmp/<hostId>/` 中 Pi 的截断输出全文，按第 3 条硬底线，ADR-224）与写上下文文件名的 `edit`——不出现审批卡、直接返回沙箱说明，不发生访问、不记 `sandbox_violation`；`read` 临时主目录中的 `~/.aws/credentials` 夹具（ADR-222）——出现 `secrets.access` 的单向门审批卡，卡上写明 S2 下批准也不会让沙箱允许；拒绝时不发生访问，批准时读取失败、只记 severity 1；`read` 临时主目录下 `Downloads/` 中的 `x.pem` 夹具（ADR-224）——同一张卡，期望同上；（ADR-223/224）`read` 卫星中 base 未跟踪的 `.env` 夹具与 Agent 在本 Run 中写出的 `id_test` 文件——同一张单向门卡，但卡上不写 S2 的那一句，批准后读到内容、不记 `sandbox_violation`；base 中被跟踪的 `id_fixture.pem`——不出卡；`read` 用户主检出中未被跟踪的 `.env`——按第 3 条硬底线直接返回说明、不出卡；回退位置一组（ADR-224）：`<wtRoot>` 在 `~/.tower/worktrees/…` 时，`read` 卫星中的普通文件为 `read.worktree`、不出卡，`read` 其中 base 未跟踪的 `.env` 出与默认位置相同的卡；(g)（ADR-221）读取 17 MB 的文件失败并返回“请用 bash 分段处理”的文字；夹具让辅助进程挂起时 10 s 后该次操作失败、进程已不在，随后的读写照常成功；Host 的图像判定与 Pi 的 `detectSupportedImageMimeType` 在一组夹具（JPEG、PNG 与动画 PNG、GIF、WebP、BMP、截断文件）上逐项相同；（ADR-222）一次 `read` 只启动一个辅助进程、`write` 一个、`edit` 两个，不存在与不可读的文件分别报 `ENOENT` 与 `EACCES`；（ADR-223）`read` 一个目录报 `EISDIR`，`edit` 一个 17 MB 的文件时错误文字中保留“请用 bash 分段处理”，同一批对同一路径的两次 `read` 各启动一个辅助进程；夹具让写入的进程在写到一半时被杀，工具结果写“文件可能已部分写入”。S0 的 Goal 只断言来源与注册表（S0 下不强制，`11` T3 的 S0 评级）与读取 17 MB 的文件同样失败 |
| C43 | 代理分发器（ADR-232，§5.3.6 代理一行，D63）：测试网络中直连被拒绝，Host 环境的 `HTTPS_PROXY` 指向一个记录请求的本地代理；以 `models.json` 中指向本地 HTTPS 测试端点的 OpenAI 兼容 provider 发出模型请求，并连接一个 HTTP 类 MCP 服务器——两者都经过该代理并成功；`NO_PROXY` 列出的主机直连。两种情形——Host 环境中有与没有代理变量——都断言 Tower 的分发器已在第一次请求之前安装（ADR-233）：全局分发器是 `EnvHttpProxyAgent`，选项与 Pi 的 `configureHttpDispatcher` 相同（`allowH2: false`、`proxyTunnel: true`、连接尝试时限 2 s、错误监听），全局 `fetch` 出自同一份 undici，Host 中只加载一份 undici（Pi 所依赖的版本）；分发器取该设置（ADR-234：只在不经 SDK 请求时限的路径上断言）：用户设置 `httpIdleTimeoutMs` 为 5 s 时，一个 10 s 不发响应头的 HTTP 类 MCP 服务器（短于 Tower 经过的 Pi 内置 MCP 扩展的请求时限，默认 60 s，`extensions/mcp/runtime.ts:48, 210-211, 363`，ADR-235）的连接以 undici 的响应头超时失败，设为 20 s 时成功——分发器漏掉该设置而停在默认的 300 s 时前一次成功，测试因此失败；另在 Host 存活期间把该设置改为无效值，下一个 Run 的准备按 F4b 失败、不开会话；`websocketConnectTimeoutMs` 改为无效值、`retry.provider.maxRetries` 改为非数值的两组同样如此（ADR-235）；`retry.provider.timeoutMs` 改为 0 与 1.5 的两组同样如此，卡片写 `启动失败：Pi 设置 retry.provider.timeoutMs 无效`（ADR-236）；`httpIdleTimeoutMs`、`websocketConnectTimeoutMs` 与 `retry.provider.timeoutMs` 各改为 2147483648 的三组、`retry.maxRetries` 改为非数值的一组同样如此（ADR-237）。另断言 v1.2.0 的 `configureHttpDispatcher` 仍不从包入口导出、其 `EnvHttpProxyAgent` 选项与 Tower 的副本相同（不同即失败，提醒按 D63 复核） |
| C44 | 扩展注册的 provider（ADR-232，`11` §11.7.1，D64）：测试扩展以 `registerProvider` 用自己的 `apiKey` 覆盖 faux provider，导入的密钥另有一份——探查运行时的 `checkAuth` 不反映这次覆盖，Host 运行时的 `getRegisteredProviderIds()` 列出它，Tower 不注入、已注入的移除，请求带扩展的密钥；同一 `modelRuntime` 上会话结束、再以 `noExtensions:true` 新建会话之后，覆盖仍在（锁定 Pi 的现状：会话结束不移除，Pi 改变时这项测试失败并提醒复核 `06` §6.1.1 打包的分组）。另一组（ADR-233）：测试扩展初次加载时不注册，在 `turn_end` 事件回调中以 `registerProvider` 只给 faux provider 加一个 `headers`，随后 `unregisterProvider`；断言下一次模型调用之前（tower-goal 的 `turn_start` 处理器，ADR-234）的读取列出它、已注入的密钥被移除，`unregisterProvider` 之后同一 Host 中仍不注入，Host 报告的结论为 “由扩展处理认证” |
