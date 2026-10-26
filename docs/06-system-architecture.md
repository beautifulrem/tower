# 06 · 系统架构：进程、Supervisor、事件日志、协议与持久化

> 依赖：`00`、`02`（领域类型与 TowerEvent）、`03`（状态机与 I1–I8）、`05`（EngineAdapter、tower-goal）、`07`（Observer、Verifier、哨兵）、`08`（AttentionRouter、Mode 推导）、`10`（GitService、检查点、worktree）、`11`（自主度、沙箱、Electron 安全）、`15`（ADR-004/005/006/007/008/013/014/015/016）、`research/gui.md` §2.4、§3.4、§4.6、§9。
> 平台基线：Electron 44（Chromium 152、Node 24.18）、`node:sqlite`、React 19.3。

---

## 6.1 进程模型

### 6.1.1 拓扑

```
┌─────────────────────────────── Electron main（薄） ───────────────────────────────┐
│ 窗口 · 菜单 · 托盘 · Dock 角标 · OS 通知 · powerMonitor · powerSaveBlocker · updater │
│ ProcessManager：唯一能调用 utilityProcess.fork 的地方；负责创建 MessageChannelMain  │
│ 不处理热数据；只收发控制消息（spawn/kill/notify/badge/quit）                          │
└───┬───────────────┬───────────────────┬───────────────────────┬────────────────────┘
    │ctl            │ctl                │ctl (每个 Host 一条)    │ctl
┌───▼──────────┐ portA ┌────────────────▼──────────┐ portB/N ┌──▼──────────────────┐   ┌──────────────────┐
│ Renderer     │◄─────►│ Supervisor (utilityProcess)│◄──────►│ Engine Host × N     │   │ Verifier Runner  │
│ 单个，sandbox │ 帧≤60/s│ 单写者：EventLog+投影       │ evt/cmd │ pi-sdk：每 Goal 一个 │   │ (utilityProcess) │
│ React + store│       │ StateMachine · Observer ·  │  /ack   │   （可打包 K 个）     │   │ 验证槽位池        │
│ 副本 · workers│       │ AttentionRouter · …        │         │ pi-rpc：RPC Host    │◄─►│ 进程组 · 超时 ·   │
└──────┬───────┘       │ ├ git worker（worker_thread）│         │   └ pi 子进程 × K   │   │ 资源上限          │
       │               │ └ WS 服务（serve 模式）      │         │ heartbeat 5 s       │   └──────────────────┘
       │               └────────────────────────────┘         └─────────────────────┘        ▲ portV
  WebContentsView（预览，独立进程）                                                           └── Supervisor
```

| 进程 | 运行内容 | 拥有的状态 | 崩溃域 | 内存预算（唯一定义在 `13` §13.8.1，本表不复述数值，ADR-185） |
|---|---|---|---|---|
| Electron main | 窗口与 OS 集成、ProcessManager、自动更新 | 无业务状态（只有窗口位置等） | 整个应用 | `13` §13.8.1 |
| Renderer | UI；只读的 store 副本；Shiki、diff 解析、markdown 用 Web Worker | 无权威状态 | UI | `13` §13.8.1（含 worker） |
| Supervisor | §6.2 的全部模块；`node:sqlite`；协议服务（MessagePort 和 WebSocket） | **唯一权威状态**（ADR-005） | 只影响状态服务；Run 继续运行（§6.1.3） | `13` §13.8.1 |
| Engine Host（pi-sdk） | 1 个（或打包时 K 个）`AgentSessionRuntime` + tower-goal + TowerUIContext（`05` §5.3） | 进程内的 Pi 会话；Pi JSONL 是对话的权威记录 | 单个 Goal（打包时为 K 个） | `13` §13.8.1（假设值，待 SP2 实测） |
| RPC Host（pi-rpc，M2，ADR-059） | `RpcProcessClient` × K，以及对应的 `pi --mode rpc` 子进程（`05` §5.4） | 无（pi 子进程持有） | 子进程之间隔离 | `13` §13.8.1 |
| Verifier Runner | 在验证槽位中执行 `exec` 标准、解析测试输出、统计测试清单（`07` §7.4） | 无（结果交给 Supervisor） | 一次验证尝试 | `13` §13.8.1 |
| git worker | Supervisor 内的 `worker_thread`；`git` 子进程；解析 diff 和 merge-tree | 无 | 线程可以单独重启 | — |

**为什么所有 utilityProcess 都由 main 创建**：Electron 只允许在 main 进程调用 `utilityProcess.fork`。这还带来一个好处：**Engine Host 是 main 的子进程，而不是 Supervisor 的子进程**。所以 Supervisor 崩溃并重启时，正在运行的 Agent 不受影响（§6.1.3）。main 只负责建立端口，之后所有热数据都直接走 Supervisor ↔ Host、Supervisor ↔ Renderer 的 MessagePort，不经过 main（gui.md §2.1）。

**Host 粒度**：默认每个 Goal 一个专用 Engine Host，理由见 ADR-004：崩溃或挂死可以单独杀掉；用户扩展代码在进程级隔离。设置项“打包模式”允许每个 Host 承载最多 K=4 个 Goal，适合内存紧张的机器。**打包的分组**（唯一定义，ADR-232；`05` §5.3.6、`11` §11.7.1 引用）：只把加载同一扩展集合的 Goal 放进同一 Host——`noExtensions` 相同，且为假时所用的已确认清单的哈希相同（`11` §11.8.2）——所以 `riskTier=high` 与清单确认之前的 Goal（`noExtensions:true`，`05` §5.10）从不与加载用户扩展的 Goal 共用 Host。Host 的扩展集合在它的第一个会话时确定；之后某个 Run 的扩展集合与之不同（清单重新确认、`riskTier` 改变）时，不在该 Host 上开会话，改在集合相符的 Host 上开，没有时新起一个（专用模式下即先让该 Goal 的旧 Host 按 §6.1.8 退出）。理由：扩展注册的 provider 写进 Host 的 `ModelRuntime` 并跨会话保留（`05` §5.11.1 D64），集合不同的会话共用一个 Host 时，不加载扩展的会话的模型请求也会经过另一个会话加载的扩展代码。pi-rpc 模式下，每个 RPC Host 管理最多 K=8 个 pi 子进程，隔离由子进程本身提供。

**内存数字是假设**（R1-D10-01）：60 MB/Host 来自 gui.md 的估计。实际 Host 还要装下 Pi、用户扩展、MCP 客户端和 bash 分类器 WASM，可能接近 100 MB；fsmonitor 在 ADR-060 下默认关闭（M1 计 0；若 SP5 评估后启用，每个卫星或槽位约 15 MB，`13` §13.8.3）。SP2（`14`）实测之前，这些数字只用于设计，不作为验收依据。**M1 退路**（唯一规则登记在 `16`，`13` 与本文只引用；R2-D10-01）：如果 SP2 测得专用 Host 稳态 RSS p95 > **120 MB**，M1 的默认值改为打包模式，**K = 4**。代价是一个 Goal 的扩展崩溃会连带同一 Host 中的其他 Goal，这一点在设置页注明；扩展集合不同的 Goal 不打包在一起（§6.1.1 打包的分组，ADR-232），高风险 Goal 与清单确认之前的 Goal 因此另占 Host，节省的内存随之变小，设置页同一句注明。

**可移植性约束**（为 §6.1.4 的后续守护进程选项留余地）：Supervisor、Engine Host、Verifier Runner 的代码**不得 import `electron`**。平台能力（通知、端口、电源事件）都通过注入的 `Platform` 接口获得，因此这三个模块可以直接跑在普通 Node 24 下（契约测试和 `tower serve --headless` 的原型都依赖这一点）。

### 6.1.2 进程间通道

| 通道 | 载体 | 消息 | 说明 |
|---|---|---|---|
| Renderer ↔ Supervisor | MessagePort（structured clone） | UI 协议（§6.4） | 1 KB 消息约 0.2 ms p50（gui.md §2.1） |
| Supervisor ↔ Engine Host | MessagePort | `{type:"cmd",id,op,args}` / `{type:"res",id,ok,data|error}` / `{type:"evt",hostEpoch,hostSeq,runId,ev}` / `{type:"ack",hostSeq}` / `{type:"hb",rssMb,loopLagMs}` | `ev` 的类型是 `TowerEngineEvent`（`05` §5.2.2）。每 64 个事件或每 250 ms ack 一次 |
| Supervisor ↔ Verifier Runner | MessagePort | `verify.run{goalId,pin,criteria,limits}` → `verify.progress` / `verify.result{verdict}`。verdict 的枚举（含 `timeout`、`hung`、`resource_exceeded`）以 `16` 为准，判别规则见 ADR-054 | 大日志通过路径引用（EvidenceRef `log`）传递，不走 IPC |
| main ↔ 各进程 | `process.parentPort` 控制消息 | `spawn/kill/port-handoff/notify/badge/quit/drain` | 低频 |
| Supervisor ↔ 远程客户端 | WebSocket（JSON） | UI 协议，与 MessagePort 版本相同 | serve 模式（§6.4.7） |

### 6.1.3 崩溃与重启语义

| 进程 | 检测方式 | 立即影响 | 恢复 | 数据风险 |
|---|---|---|---|---|
| Renderer | `render-process-gone` | UI 消失；Run 不受影响 | main 重新加载窗口（每分钟最多 3 次，超过则显示错误页并提供“导出诊断”）；renderer 重新订阅，取得快照 | 无。尚未发出的输入草稿保存在 `sessionStorage` |
| Supervisor | `utilityProcess` 的 `exit` 事件 | UI 显示“重新连接中”；**Engine Host 继续运行**并把事件缓存在自己的环形缓冲里（`05` §5.4.7）；未决的对话框保持等待 | main 按退避重启（0.5→1→2→4→…→30 s）。10 分钟内崩溃 5 次则进入**安全模式**（能力清单见 §6.1.7）。重启后：打开数据库（WAL 自动恢复）→ 校验投影版本 → main 把存活 Host 的新端口交给 Supervisor → 对每个 Host 发 `replay{since: lastAckedSeq}` → 补齐事件 → 再与 Pi JSONL 对账（§6.6.5） | 无。未 ack 的事件会重放。崩溃时正在处理、尚未提交的 UI 命令，由 renderer 用同一个 `cmd.id` 重发（幂等） |
| Engine Host（sdk） | `exit`，或心跳超过 30 s（`08` §8.6.3） | Run 结果记为 `crashed`；Mode 变为 `unresponsive`。只影响 running 的 Goal：验证由 Verifier Runner 执行，与 Host 无关 | Goal 转为 `paused{pauseReason:"engine_crash", autoResume:true}`；Needs-You `stalled{crashed|unresponsive}` 只在 10 分钟内再次崩溃、或启动时因 `resumeOnLaunch` 关闭而未解除时生成（时机唯一定义在 `08` §8.6.3，ADR-204、ADR-205）。若 10 分钟内没有重复崩溃，自动执行一次“重启并恢复”：`ensureSatellite` → 新 Host → `resume`（`05` §5.3.2），以 `inject(tower.resume, {triggerTurn:true})` 开场（ADR-135）。**Host 退出或挂死之后**（不论随后是否自动重启，ADR-226）：挂死的 Host 先以 SIGKILL 终止，终止之前以它的 pid 为根取后代进程树；再按 §6.1.6 “Agent 后台进程”一行做终止的一轮（范围只取该 Host 承载的 Run，打包模式下含该 Host 上的各 Goal；完成之前的 `清理中` 与 `E_BUSY` 同在该行，ADR-227；进程树 ∪ 令牌，ADR-158：挂死的 Host 取上述后代树，已退出的 Host 的后代已被收养，只按令牌，同 `10` §10.3.1 ②），并补 `agent_bg_done` 检查点——Pi 的 bash 以 `detached: true` 派生（`bash.ts:112-114`），这些进程不随 Host 退出；重启（自动，或人发起的继续）经准入，检查 h 使它在这一轮完成之前于 `ready{slot}` 中等待。上一次崩溃后 10 分钟内再次崩溃则不再自动重启，等人处理；重启经准入与准备阶段，其中的失败按 `prepare_failed`/`satellite_missing` 处理 | 正在执行的工具可能只做了一半。恢复前先做一次 `captureCheckpoint`（`landmark=safety`），并在恢复说明中写明“上次中断时正在执行：<工具 · 对象>” |
| pi 子进程（rpc） | 退出码（`05` §5.9 G27）；或 `get_state` 活性探针超过 30 s 没有响应（`05` §5.4.2，G35） | 同上 | 同上。如果 stderr 中出现缺失 cwd 的错误，先重建卫星（ADR-076），再重试一次 | 同上 |
| Verifier Runner | `exit` | 当前验证尝试记为 `verdict: error` | 重启 Runner；按 pin 提交重跑（幂等） | 无。验证槽位在重启后重置 |
| git worker | 线程的 `error` / `exit` | 正在进行的 git 查询失败 | 重启线程，重试一次 | 无。写操作（update-ref）都带旧值校验（`10` §10.7） |
| main | 整个应用退出 | 所有 utilityProcess 随之结束 | 下次启动时 Supervisor 执行启动恢复：把仍处于活跃状态的 Run 记为 `crashed`，按 §6.1.4 的规则自动恢复；中间状态的恢复见 §6.1.6 | 同 Engine Host |

### 6.1.4 应用退出时正在运行的 Goal：**选择“暂停并恢复”**（ADR-017）

**决定**：v1 **不提供**脱离应用的后台守护进程。关闭窗口 ≠ 退出应用：只有显式退出时，才对正在运行的 Run 做优雅暂停；下次启动时自动恢复。

| 方案 | 优点 | 代价 | 结论 |
|---|---|---|---|
| A. 后台守护进程（`towerd`，launchd / systemd / Windows 服务） | 退出 UI 后 Agent 仍继续运行 | 需要单独签名的二进制和服务注册；UI、守护进程、固定 Pi 版本三者的升级要协调；守护进程要有本地鉴权接口（增加攻击面）；支持矩阵翻倍；“退出了它还在花钱”违背直觉 | v2 再评估 |
| **B. 暂停并恢复** | 生命周期与应用一致，不会有看不见的进程在后台花钱；实现只用到已有的 drain 和 resume 机制；关闭窗口时 Agent 照样在跑 | 用户真正退出应用时，Goal 会停下来 | **v1 采用** |

规则：

1. **关闭窗口不等于退出。** macOS 上应用留在菜单栏和 Dock。Windows 和 Linux 上，如果有 Run 在运行或有未决的 Needs-You，关闭最后一个窗口时最小化到托盘（可在设置中改）。
2. **退出**（⌘Q、托盘里的“退出”、`before-quit`）：
   - 没有活跃 Run，也没有正在进行的验证 → 立即退出。
   - 有活跃 Run 或正在验证的 Goal → 确认框（文字的唯一定义，ADR-236；`04` §4.16 F12 引用）：设置 `resumeOnLaunch` 打开时 “3 个 Goal 正在运行或验证。退出会暂停它们，下次启动时自动继续。”，关闭时 “3 个 Goal 正在运行或验证。退出会暂停它们：运行中的下次启动后仍为暂停，需要你点继续；验证中的下次启动时以同一 pin 重新验证。”（第 5 项）；已在暂停中（等待当前步骤结束）的 Goal 另起一行 “G-0147 正在暂停：下次启动仍为暂停，不会自动恢复”（ADR-138/141）。选项为 [暂停并退出] / [取消]，并带“不再询问”。
   - **验证中的 Goal**（R4-D4-03，与 `03` 一致）：取消验证（终止验证进程组、丢弃槽位），Goal **保持 `verifying`**（不进入 `paused(app_quit)`，`03` §3.2.1；验证尝试记录中有 pin，下次启动以同一 pin 重跑，不需要继续目标）。验证不涉及 Run，所以不走 drain。
3. **drain 协议**（与“暂停”和“预算硬上限”共用）：

```
Supervisor                        Engine Host / tower-goal                 Pi
  │ 同一事务写 goals.draining_for{target, reasons[], decisionIds[], requestedAt}（ADR-141）；drain 中再收到的暂停请求只并入 reasons；接管、回退（M2）等其他目标的请求返回 E_BUSY（ADR-145）
  │ policy.json{mode:"draining"} ───► 下次 tool_call 时读到新策略 ──────────► 新工具调用被 block（terminate:true）
  │ 等待正在执行的工具结束（graceMs，默认 8 s，退出时 5 s，OS 关机时 2 s）
  │ abort ───────────────────────────► session.abort() ─────────────────────► 中止 run 并等到空闲（agent-session.ts:2459-2469）
  │ clear_queue ────────────────────► 取回未投递的转向文本 → 放回 Tower 队列（05 §5.7.4）
  │ ◄──────────────────────────────── agent.settled{aborted:true}；最后一个 tower.checkpoint
  │ 事件：run.ended{outcome:"aborted", reason}；target=pause：goal.state_changed → paused{reasons 中优先级最高者}，其余进入 also_applies；take_over/rewind/dependency 且 reasons 非空 → 放弃原目标，paused(reasons ∪ {human})（ADR-144）；reasons 为空 → 执行原目标；清除 draining_for
  │ dispose ────────────────────────► runtime.dispose() / 关闭 stdin
```

4. **OS 关机或注销**（`powerMonitor` 的 `shutdown` 事件，以及 Windows 的 `session-end`）：走同一流程，graceMs 取 2 s。如果进程被强制杀掉，由下次启动的恢复流程兜底（§6.1.3 main 一行）。
5. **下次启动**：如果设置 `resumeOnLaunch` 打开（默认打开），`app_quit`/`engine_crash` 在启动时**自动解除**（该 Goal 不可达时这两种解除与 `provider_unavailable` 的探测都推迟到可达，唯一规则在 §6.1.6 Project 不可达一行，ADR-236/237；它们只出现在运行阶段；已生成 `stalled{crashed|unresponsive}` 条目的 `engine_crash` 除外，它等人处理，`08` §8.6.3，ADR-205）；解除后按统一规则——剩余原因非空则保持 `paused`，否则由 `onAllReasonsCleared()` 执行继续目标（`run` → 进入 EngineManager 队列；`settle` → 重跑 settle 序列，ADR-143 的 Host 不存在规则）（R17-D15-01 第 6 项）。处于 `verifying` 的 Goal（其验证在退出时被取消）在启动时以验证尝试记录中的**同一个 pin** 重跑验证（§6.1.6），不开 Run；Host 崩溃不会取消正在进行的验证。`provider_unavailable` 同样 `autoResume=true`（R3-D4-05，`03` §3.2.1），但它不等启动，而是按探测恢复：探测间隔从 60 s 起指数退避，上限 10 min；探测只做连接与鉴权检查，不调用模型、不计费；**鉴权检查**（唯一定义，ADR-207）调用 Pi 的 `ModelRuntime.getAuth(provider)`，与 Run 中的模型请求走同一条认证解析，存储的 OAuth 令牌将过期时真正刷新（`core/model-runtime.ts:555-562` → `ai/src/models.ts:303-313`、`ai/src/auth/resolve.ts:161-191`），不用只看配置是否完整、不刷新 OAuth 的 `checkAuth`（`ai/src/models.ts:287`）——所以 OAuth 刷新失败（§6.8 F7）时探测在人重新登录之前不会成功，不会反复自动解除又失败；`getAuth` 在 provider 未知或未配置时得到 `undefined`，令牌刷新失败、API 密钥求值（含 `!` 命令）或凭据存储失败时以 `ModelsError` 拒绝（`ai/src/models.ts:300-314`），探测把两者都计为失败（ADR-234）。**探测在哪个进程运行**（唯一定义，ADR-234/235；`11` §11.7.1 引用）：只在 Engine Host 中，从不在 Supervisor 中，也不为探测另起 Host——用该 Goal 所在打包分组（§6.1.1 的分组键，专用模式下同样按扩展集合）中已存活而没有进行中 Run 的 Host（专用模式下即服务该 Goal、尚未按 §6.1.8 退出的 Host）。所以连接检查经 Host 的分发器与 CA 变量，`$VAR`、`!` 命令与导入的密钥都按 Host 的规则求值，与 Run 中的请求相同；`auth.json` 中 `!` 命令的结果已在该 Host 进程中缓存，探测不使它重新执行（`core/resolve-config-value.ts:208-216`）；`models.json` 中以 `!` 写的 `apiKey` 不缓存，每次 `getAuth` 都执行一次，与每次模型请求相同（`core/provider-composer.ts:466-467` → `resolve-config-value.ts:221-231`，`11` §11.7.1，ADR-236）。**不自动探测**（ADR-235）的三种情形：没有这样的 Host（专用模式下暂停超过 5 分钟、该 Host 退出之后即如此，所以自动解除只覆盖此前的探测，按上述退避为第 60 s 与第 180 s 两次，如实登记）；该 provider 在 Host 读到的扩展注册列表中（`11` §11.7.1：扩展新建的，或以内置 provider 的 id 覆盖的——认证与端点由扩展决定）；§6.8 F8 的只读期间（解除要写数据库）。这时不解除 `provider_unavailable`，Goal 卡片写 `提供方可能已恢复？[重试]`（`goal.resume`，`12` §12.6.5），F6 或 F7 的 Needs-You 保持打开，由人重试；F8 只读期间与该 Goal 不可达期间（§6.1.6）`goal.resume` 必然返回 `E_STATE`，卡片不带 `[重试]`（ADR-236）。探测不延长 Host 的存活（§6.1.8 不变）。边界：API 密钥与尚未进入 5 分钟刷新窗口的令牌不经网络校验，被吊销的密钥或令牌会通过探测，之后的请求按 F6 失败、探测再次解除，这是 ADR-207 之前已有的 F6 行为（ADR-208）；探测成功即解除 `provider_unavailable`，按统一规则继续。应用重启之后没有存活的 Host，同样由人重试（如实登记，ADR-235）。`autoResume=true` 的完整原因集合只有这三个，以 `16` §16.1.1 为准。它们占用槽位，但**不受**评审积压上限约束（ADR-014 只限制首次启动）。恢复开场是 `pendingOpenings` 中排队的载荷，没有时为一条 `tower.resume` custom message：“Tower：本 Run 于 <时间> 因应用退出而暂停；工作区位于 cp/<n>；请继续。”；排队中的评论作为 `opening.human`（`05` §5.8）。
6. **复审触发条件**：满足任一条件即重新评估方案 A：每周有 ≥ 30% 的活跃用户在仍有运行中 Goal 时退出；serve 模式的远程使用显著增长；Pi Durable 稳定（ADR-006）。届时 `towerd` 直接复用 Supervisor 和 Engine Host 的代码（得益于 §6.1.1 的可移植性约束）。

### 6.1.5 睡眠与唤醒

| 事件（`powerMonitor`） | Supervisor 动作 |
|---|---|
| `suspend` | 记录事件 `system.suspend`。冻结这些计时器：心跳看门狗、静默计时器（`08` §8.6.3）、Needs-You 的默认动作计时器（`08` §8.7.1）、预算的墙钟计时。人在机器睡眠时无法响应，这段时间不应计入“被忽略” |
| `resume` | 记录事件 `system.resume{sleptMs}`。心跳宽限 60 s；预算墙钟扣除睡眠时长 |
| 唤醒后的网络错误 | 进行中的 LLM 流大概率已断，Pi 会自动重试（默认 `maxRetries: 3`，`settings-defaults.ts:19`）。如果某个 Run 在唤醒后 120 s 内以网络类错误 settle，Supervisor 自动以 `inject(tower.resume{reason:"wake"}, {triggerTurn:true})` 继续一次（ADR-138，不以 user 角色），并记录 Fact `engine_error{recovered:"wake"}` |
| 电源策略 | 有 ≥ 1 个活跃 Run 时，`powerSaveBlocker.start("prevent-app-suspension")`。默认只在接通电源时生效（`powerMonitor.onBatteryPower` 为 false），可在设置中改。这只阻止应用被挂起，不阻止屏幕关闭 |
| `lock-screen` / `unlock-screen` | 交给 AttentionRouter，作为“人不在”的信号（`08` §8.3.3） |

### 6.1.6 启动时对中间状态的恢复（R1-D4-06）

Supervisor 每次启动（包括崩溃后重启）都会在接受 UI 命令之前跑一遍“中间状态检查”。原则是：**以 git 和文件系统的实际状态为准，按步骤幂等重做；无法确定时停下来交给人，绝不猜测着继续。**

**集成日志**：合并队列的每一步，执行前写 `integration.step_started{entryId, step, expected}`，执行后写 `integration.step_done{entryId, step, observed}`。两个事件都在同一个组提交里立即提交（与人的决定同级，`synchronous=FULL`）。恢复时只看“已开始、未完成”的那一步。

| 中断时的状态 | 启动检查 | 恢复动作 |
|---|---|---|
| `verifying`（验证进行中） | 验证尝试没有 `verify.result` | 丢弃槽位（重置为分离 HEAD），按**同一个 pin 提交**重跑。pin 是影子 ref 上的不可变提交，所以重跑是幂等的。如果 pin ref 丢失，从当前指纹重新生成 pin，再重跑。应用退出时取消的验证同样按此重跑 |
| 机会式验证（ADR-020） | 同上 | 直接丢弃，不重跑：下一个空闲窗口会重新触发 |
| 机密阶段冻结未解除（**M2**，ADR-163/164；M1 中没有冻结） | 最后一次冻结事件未闭合 | 先终止该验证槽位的全部进程并执行 teardown，再解除冻结；机密阶段重新排队（从“等待无 Agent 活动”开始） |
| `ready`（ADR-148） | `goals.state='ready'` | 保持 `ready`，按 `queued_run` 重新判定准入（§6.2.4） |
| 准备阶段中崩溃（ADR-148/149/150） | `state = 'ready'` 且 `preparing_since` 非空且没有任何暂停原因 | 清除 `preparing_since`，保持 `ready`，`queued_run` 保留，重新判定准入（不计为准备失败；重试从已完成的步骤继续）。已暂停的 Goal（依赖物化期间人暂停、外部写入、`prepare_failed` 等）不受本行影响 |
| `claimed`（还没开始验证） | 有效 submit 已记录，但没有验证尝试 | 立即进入 `verifying` |
| 验证器的“安装器”步骤（ADR-021、ADR-092） | `$VS/staging/<installRunId>/` 存在但数据库中没有对应的发布记录 | 删除这个暂存目录，下次需要时重新安装。depcache 条目只由 Supervisor 校验后以原子 `rename` 发布（发布记录与 depcache 条目同一事务登记在 `depcache_entries`）；`$VS` 中没有发布记录的 depcache 条目视为不存在并删除，记 `anomaly{detector:"verifier_store_tampered"}`（`07` §7.10.1） |
| 合并队列 `rebasing` | `merge_queue.state='rebasing'`（rebase 是影子中的 `merge-tree` 三方合并，`10` §10.10；卫星中没有 rebase 进行中的 git 状态） | 合并结果尚未写回卫星：丢弃，回到 Q2 重做。写回中途崩溃：按 `10` §10.8.1 恢复到 Q1 之前的安全检查点，再回到 Q2 重做 |
| `reverifying` | 同 `verifying` | 按 rebase 后的 pin 重跑 Q5 |
| `awaiting_reacceptance` | — | 无需恢复，这是等待人的稳定状态 |
| `integrating`：seal 步骤 | 分支顶端是否已是 Tower 自己的 seal（`10` §10.6 的识别规则：sha 是影子中本 Goal 的某个 seal；只带 `Tower-Goal` trailer 不算，ADR-191/193）、且树等于已验证 pin（seal 说明的段落以 `10` §10.6 为准，ADR-105；trailer 块由 Tower 生成，Agent 文本中 trailer 形态的行被去除；已验证（含有保留）的 Goal 写 `Tower-Verified-At: <pin>`，未经机器验证的写 `Tower-Not-Machine-Verified: <原因>`，ADR-108） | 已有就跳过，没有就重做（`10` §10.6）。重做前对 pin tree 再执行 `pinSafetyCheck`（ADR-109）；未覆盖的命中阻止 seal；已覆盖的写 `Tower-Override: <detector> <路径>@<哈希>` trailer（覆盖绑定对象哈希，ADR-112） |
| `integrating`：本地 CAS `update-ref` | 读 base ref：等于 `expected.new` → 视为已完成；等于 `expected.old` → 重做 CAS；其他值 → `attempt+1`，回到 Q2（`10` §10.11 Q6） | — |
| `integrating`：在用户检出中 `merge --ff-only` | 检出 HEAD 等于目标提交 → 已完成；否则重做（git 会拒绝覆盖未提交的改动） | — |
| `integrating`：push | `git ls-remote origin <branch>` 等于本地 sha → 已完成；否则用 `--force-with-lease=<branch>:<lastPushedSha>` 重推 | — |
| `integrating`：开 PR | `gh pr list --head <branch> --json number,state`：已存在则复用，不存在则重新创建 | — |
| `awaiting_remote`（**M2**，ADR-133） | — | 恢复 PR 轮询（`10` §10.12；M1 不推送、不轮询远端，不会出现此状态）。**非终态观测到合并**（ADR-128/137；M1 只观测本地 base）：是否进入 `integrated` 只按 `10` §10.12 的 `integrated` 唯一条件判定（最近一次验收的 seal、不是被撤销的 seal、没有人工编辑检出、没有活跃 Run、卫星树等于该 seal 的树），条件成立与不成立时的效果也只在该处定义，本行不复述（ADR-182） |
| 检查点写入中途（`refs/tower/<G>/cp/<n>` 不存在，但有临时 index） | 清理 `tmp/`（每次启动都清空 `~/.tower/tmp/` 与 `~/.tower/run/` 中不属于存活 Host 的内容，清除崩溃残留的临时配置与机密投递文件，ADR-159；存活 Host 的临时目录 `~/.tower/tmp/<hostId>/` 按 `05` §5.3.6 临时目录一行保留，ADR-224。**即时投递目录的启动清理**（唯一定义，ADR-226；§6.6.1、`05` §5.3.6 凭据一行、`11` §11.7.0 与 `16` 即时投递目录一行引用）：交给 Engine Host 的投递以该 Host 的 `hostId` 为 `deliveryId`（`run/<hostId>/`），与 `tmp/<hostId>/`、`mcp-cwd/<hostId>/` 同一生命周期——`host.spawn` 之前建立，该 Host 进程退出后删除，同一 `hostId` 的下一个 Host 进程在它删除之后才 spawn；启动清理在 main 交回存活 Host 之后只删除不属于存活 Host 的投递，所以只重启 Supervisor 时存活 Host 的云 SDK 凭据文件仍在（Pi 的 Bedrock 判定只看 `AWS_PROFILE`，`ai/src/providers/amazon-bedrock.ts:65-70`，凭据由 AWS SDK 按该 profile 从这一文件读取，ADR-231 更正引文）；其余投递（安装器第 1 阶段）一律删除） | 下一个 turn 会重新做检查点；这一个 turn 的映射退化为“最近的带检查点祖先”（ADR-015） |
| Project 不可达（ADR-235；按 Goal 判定，ADR-236；取代 ADR-234 按卷名判别的一行） | 某个非终态 Goal（`integrated` 除外，见下）的必需路径之一不可访问（ADR-236：按 Goal 判定，不按整个 Project）。**该 Goal 的必需路径**：它每个 binding 的附着检出（`attach.checkoutPath`，`10` §10.1.1）；它有未删除的卫星、检验检出或验证目录记录（`WorktreeRecord`，`10` §10.3）时这些记录所在的 `<wtRoot>`；它有人工编辑检出（`human_checkout`）时该路径所在的 `<wtRoot>`（`<wtRoot>` 经 `project.relocate` 改变之后为 `relocatedFrom` 中它所在的旧 `<wtRoot>`）。**必需路径只有根**（ADR-238）——附着检出与 `<wtRoot>`，你拥有或可能在可移除位置上的目录；根之下的目录——卫星、`_gitdirs`、`_stores`、验证槽位、人工编辑检出、检验目录、要物化的目录及其旁路目录——不是必需路径，按所在的根判定：根可访问而目录不在 = **确实不在**，由已有的丢失与失败分支处理（本表卫星丢失一行、人工编辑检出一行的 `idle` 且目录不存在与续写，§6.4.3 `inspect.bring_back` 行写回失败的 ①–③，`10` §10.16.2 情形 E）；根不可访问才是不可达。`~/.tower` 中的路径（影子、`10` §10.4.3 位置算法第 3 步的 `<wtRoot>` `~/.tower/worktrees/<projectId>.noindex` 及其中的一切，以及位于 `~/.tower` 之内的验证槽位）不在本行判定之内，下文的失败先判可达对它们同样不判定（`~/.tower` 不可访问时 Tower 本身无法运行，ADR-239）。**Tower 不重新建立根**（唯一定义，ADR-239；`10` §10.3.1 步骤 2、§10.4.3 与 §6.4.3 `project.relocate` 引用）：Tower 只在一个 `<wtRoot>` 中没有任何当前 `WorktreeRecord` 时建立它，并且只建立 Tower 自己命名的几级（`10` §10.2 位置表：默认位置的 `.tower-wt.noindex/<repoName>`，`worktreeRoot` 下的 `<projectId>`）；它们的上级——附着检出的父目录、你设置的 `worktreeRoot`——必须已存在且可访问，Tower 从不建立它们（卫星的 `git clone --separate-git-dir` 在根已存在之后执行，所以 git 不会替它建立缺失的上级）。其余情形下缺失的根就是不可访问的根，按本行处理，由你重新建立、迁移或放弃。新 Goal 从准备开始把将要使用的 `<wtRoot>` 计入必需路径（可建立时先按上一句建立），所以它的根缺失或上级目录不存在时它同样判为不可达，准备按 ② 中止、回到排队，卡片注明 `Project 不可达：<路径>`——Tower 不会因为一个新 Goal 而把其他 Goal 的根从“不可访问”变成“存在而目录不在”。同一 Project 中附着在其他检出、`<wtRoot>` 在别处的 Goal 不受影响。**不可访问** = 对该根的 `stat`（跟随符号链接）失败或 5 s 内没有结果（在按挂载点隔离的 `worker_thread` 中执行，`13` §13.5），或 §6.8 F8 复查中读不出其所在卷的剩余空间——不区分卷未挂载、被移动、被删除或没有权限（根被删除或移走与卷未挂载一样由你处理，出口见下方“永久不可达时的出口”），不看卷名与挂载布局。**不判定的 Goal**——`integrated`（宽限期内）与终态（`archived`、`abandoned`，`16` §16.1.1）——不冻结（没有待执行的动作，ADR-237 更正此前把 `integrated` 称为终态的写法）：其路径不可访问时只在存储面板（`04` §4.15）该 Goal 的目录一行注明 `不可访问`，对这些路径的删除与丢失判定（卫星的到期删除、`10` §10.16.2 情形 E）推迟到可访问；隐私清除不推迟（`09` §9.12.4 “不可访问的根”） | **唯一定义；先于本表其他各行判定**（启动检查与运行中的发现——文件系统事件、操作前检查、`10` §10.16.1 的检测——相同；多仓库 Goal 任一 binding 的路径不可访问时同样适用）：该 Goal 判为不可达（Supervisor 进程内，不持久化，启动时重新判定）。① 该 Goal 进行中的 Run 中止（无法 drain，同卫星丢失一行的 abort），以 `app_quit` 进入 `paused`，`run.ended` 的 `outcome_reason` 写 `project_unreachable`（与 §6.8 F8 写 `disk_full` 同一做法，不另设暂停原因），继续目标按 `03` §3.2.1（settle 序列中为 `settle`）；回合检查点无从记录、跳过（可用的最新检查点仍在影子中）；drain 已在进行的照卫星丢失一行“drain 进行中丢失”结束，`reasons` 并入 `app_quit`，`outcome_reason` 同样写 `project_unreachable`。② 该 Goal 进行中的验证照应用退出取消（Goal 保持 `verifying`，机会式验证丢弃），准备照 `10` §10.3.1 中止并回到排队；进行中的写回、卫星重建与接管物化在本进程中停止，不执行各自的失败出口（不改名、不清除 `human_checkout`、不告知不可恢复），数据库中的 `syncing` 与 `satellite_rebuilding=1` 原样保留（隐私清除见下方隐私清除一行）。**失败先判可达**（唯一定义，ADR-236；§6.4.3 `inspect.bring_back` 行、本表卫星丢失一行的重建失败与 `07` §7.4.1 引用）：写回、验证、卫星重建或接管物化以文件系统错误失败（`ENOENT`、`EIO` 等；`ENOSPC` 归 §6.8 F8），或验证中的子进程——标准的命令，以及准备（生命周期脚本、`VerifyProfile.prepare`）与服务（setup、健康检查）——以任何错误或非零退出失败时（ADR-239：卷消失时子进程通常以非零退出，而不是 Tower 自己的文件系统错误码），在执行失败出口、写入结论之前，先对**该操作实际读写的路径所在的根**做本行的判定（ADR-237；ADR-238 改为按根：验证——槽位所在的 `<wtRoot>`（位于 `~/.tower` 之内时不判定，见上）；写回——来源目录与卫星所在的 `<wtRoot>`；卫星重建与接管物化——卫星与要物化的目录所在的 `<wtRoot>`；不含该 Goal 的其他必需路径，如验证只在开始前读取的附着检出）：有不可访问的 → 按 ② 视为中断——不执行失败出口、不告知“此后不可恢复”、不清除 `human_checkout`、不写该条标准的 Fact（含 `flake`，`07` §7.4.6）与 `verify.result`、不计返工次数——可达后由 ④ 与对应的恢复行续做（接管物化没有恢复行：它在写入 `human_checkout` 的事务之前，判为中断时 `goal.take_over` 返回 `E_STATE`（`Project 不可达：<路径>`），接管的事务不写——从 `running` 接管时 drain 已结束，Goal 与 drain 中途崩溃的 `take_over` 一样进入 `paused(human)`——留下的目录按 `10` §10.2 “中断的接管留下的目录”处理，可达后由你再次接管，ADR-239）；这些根都是该 Goal 的必需路径，所以判为中断时该 Goal 同时判为不可达，**没有无人续做的中断**（`syncing` 与 `satellite_rebuilding=1` 只在该 Goal 不可达期间由本条留下，ADR-238）；都可访问 → 照常执行失败出口，目录不在时就是已有的丢失与失败分支（写回中来源目录或卫星被删除、要物化的目录尚未建成）。反方向的竞争（卷短暂停顿使操作以 `EIO` 失败、判定时卷已恢复）按真实的失败照常执行失败出口——验证记为失败并计返工，写回生成 `stalled{write_back_failed}`、人工编辑检出保留——操作确实失败了，不丢工作（如实登记为可接受，ADR-237）。③ 不可达期间：该 Goal 不准入（§6.2.4 检查 i，`ready{slot}`，卡片注明 `Project 不可达`，`12` §12.6.5）；本表其他各行对它都不执行，只有两处例外：“Agent 后台进程”一行的终止照常（只发信号，补检查点推迟到可达），启动时未结束的 Run 按“Run 中崩溃”“settle 中崩溃”“Run 在 drain 中途”三行写出暂停（其中读写路径的一步随继续目标推迟）；所以不判卫星丢失与人工编辑检出丢失、不重建（`project.relocate` 自身在新根上的情形 F 重建除外：新根在迁移时已按 §6.4.3 该行校验可访问，重建只写新根与 `~/.tower`，照常执行，ADR-239）、不重跑验证、不续做写回，也不查找或重新附着另一份克隆（`10` §10.16.2 情形 C）；对它的**每一种自动解除**同样推迟（ADR-237：`autoResume` 的原因都在内，集合以 `16` §16.1.1 为准——§6.1.4 第 5 项在启动时或 §6.8 F8 解除时对 `app_quit`、`engine_crash` 的解除，不论 `outcome_reason`；`provider_unavailable` 的探测不可达期间跳过），Goal 留在 `paused`，继续目标（`run`、`settle`、`verify`）原样保留；对它的后台工作中读写这些路径的——从附着检出 fetch base、`10` §10.16.1 的定期检查——跳过，只涉及 `~/.tower` 的（影子的 `fsck`、备份 bundle——瘦或完整的选择要读附着检出，不可达期间沿用上一次的选择，没有时取完整 bundle，`10` §10.16.3）照常；作用于该 Goal 的命令返回 `E_STATE`（`Project 不可达：<路径>`），只有查询、`goal.pause`、`goal.abandon`（只写数据库，目录留在原处，§6.4.3 该行）与 `project.relocate`（§6.4.3）除外；另一个例外是**路径丢失的确认**（唯一定义，ADR-237；条件按记录写，ADR-238；`10` §10.16.2 情形 D 引用）：该 Goal 不可访问的必需路径都只因它的 `inspect`、`human` 角色记录或 `human_checkout` 而必需（这些 `<wtRoot>` 中没有它的卫星与验证记录，也不是它的附着检出），且 `human_checkout.syncState` 不是 `syncing` 时，`goal.discard_human_edits` 与 `inspect.close` 可用，确认框写 `原路径已不可访问，未交还的修改将无法取回`，命令按 §6.4.3 各行“检出已丢失”“使用中而目录已不存在”的分支执行、不访问该路径，并在同一事务中结束对应的 `human`、`inspect` 角色 `WorktreeRecord`；`syncing` 时两条命令返回 `E_STATE`（`写回未完成：可达后自动续写，或放弃该目标`；交还或带回的改动已在写回开始之前按 §6.4.3 `inspect.bring_back` 行“T1 的保留”保存在影子中，放弃不会丢失它们，ADR-239），卡片这时不列出这两项；之后这些 `<wtRoot>` 不再是它的必需路径（原路径以后重新出现时是已脱离的副本，`10` §10.2），已验证、待验收的 Goal 因此可以继续；Project 级命令不受本行限制，要访问的路径不可访问时同样返回该 `E_STATE`。④ Supervisor 每 30 s（与 §6.8 F8 的复查同一计时）以及人对该 Goal 发出命令时（在返回 `E_STATE` 之前）复查；它的必需路径全部可访问时撤下注明，按本表的启动顺序对它执行各行——这时目录确实不在的才按卫星丢失、人工编辑检出丢失处理——再执行 §6.1.4 第 5 项（**单一规则**，ADR-236：因不可达而推迟的 `app_quit`、`engine_crash` 与不可达期间写入、`outcome_reason` 为 `project_unreachable` 的 `app_quit` 相同——只在 `resumeOnLaunch` 打开时移除，剩余原因非空则保持 `paused`，否则由 `onAllReasonsCleared()` 执行保留的继续目标）。路径一直不可访问时一直如此，Tower 不自动判为丢失；同一路径上出现另一份内容（如同名的另一块盘上有同样的目录布局）时按其实际内容判定（如实登记）；单次 `stat` 超过 5 s（机械盘起转、网络卷短暂停顿）或唤醒后网络卷尚未重连时即判为不可达并中止 Run，不做第二次采样、没有唤醒宽限——不丢工作，`resumeOnLaunch` 打开时可达后至多 30 s 自动继续（如实登记，ADR-236）。**永久不可达时的出口**（ADR-236）：`project.relocate` 改附着检出或 `worktreeRoot`（`10` §10.16.2 情形 C、D、F；受影响的 Goal 中有写回中断而 `syncing` 的时返回 `E_STATE` 并列出这些 Goal，界面这时不提供迁移、改为写出这些 Goal 与它们的出口，§6.4.3 该行，ADR-239）；人工编辑检出或检验检出所在的路径不再回来时，按 ③ 的路径丢失确认结束它们（ADR-237；写回中断而 `syncing` 时除外）；或放弃该 Goal（目录留在原处；写回中断时交还或带回的改动已在写回开始之前按 §6.4.3 `inspect.bring_back` 行“T1 的保留”保存，放弃不需要另写，ADR-239），之后可以清除——清除一次完成，不可访问的根不触碰、列出（`09` §9.12.4） |
| 卫星丢失（ADR-076、ADR-084、ADR-094、ADR-134、ADR-152） | 启动检查或文件系统事件发现**检出完成标记存在**的卫星的工作目录或 `_gitdirs/<goalId>` 不存在（标记不存在 = 尚未建成：不生成 `satellite_missing`，重试时按 ADR-151 重新建立；删除未完成的工作目录同样不触发本行）。**已带 `satellite_missing`**（`pause_reason` 或 `also_applies`）且 `satellite_rebuilding=0` 的 Goal 不触发本行：之前的重建（自动或人发起的重试）已失败，重启不再自动重建，Needs-You 保持打开，由人再选（ADR-181）；`satellite_rebuilding=1` 的 Goal 也不触发本行（重建中途崩溃，见下一行，ADR-182）；`human_checkout.syncState='syncing'` 的 Goal 同样不触发本行（ADR-222）：重启时先由下方人工编辑检出一行续写，续写因卫星已不在而失败时按 §6.4.3 `inspect.bring_back` 行的 ③ 转入重建；运行时 `syncing` 期间的任何文件系统事件（含 ③ 持 `wtLock` 期间自己的改名）都不触发本行；情形 E 改名另一半（持 `wtLock`、在置 `satellite_rebuilding=1` 的事务之前，`10` §10.16.2）产生的文件系统事件同样不触发本行（ADR-225）；清除 `syncing` 的事务（③，或带回转入 `verifying`、交还完成的事务）提交之后按提交后的状态重新判定本行（③ 置了 `satellite_rebuilding=1` 时不触发；其余情形下卫星在这期间被删除的，这时触发，ADR-223） | 有活跃 Run 时先 abort（无法 drain）。**drain 进行中丢失**（`draining_for` 非空，运行时与重启时同一规则，唯一定义，ADR-201）：先按“Run 在 drain 中途”一行的结果结束 drain，再处理丢失——`pause` → 以 `reasons` 进入 `paused`；`take_over`/`rewind`（M2）→ 放弃原目标，进入 `paused(reasons ∪ {human})`；`dependency` → 按该行；同一事务清除 `draining_for`（运行时 Run 已 abort，`run.ended` 照常只写一次；重启时是否写 `run.ended` 按该行）。正常结束 drain 时记录的回合检查点这时无从记录（卫星已不在），跳过；可用的最新检查点仍在影子中，重建从它开始，不丢数据（ADR-202）。Goal 由此离开 `running`，卫星丢失随后按下述非 `running` 的叠加态处理：`satellite_missing` 不成为暂停原因，人的暂停与 `reasons` 中的 `external_change` 都保留，`goals` 的 `CHECK` 成立。以 `10` §10.16.2 情形 E 为唯一定义：不在 `running` 时是叠加态，只设 `satelliteRebuilding=true`，状态与 `pauseReason` 不变（`verifying` 时取消验证，重建后以同一 pin 重跑）；只有 `running` 时先 abort 再进入 `paused{satellite_missing}`（首次进入 `paused` 时按 `03` §3.2.1 写继续目标：`{kind:"run"}`；settle 序列中（`runs.phase='settling'`）为 `{kind:"settle"}`，有效提交保留，ADR-178）——`satellite_missing`、继续目标与 `satellite_rebuilding=1` 在**同一事务**写入，因此不存在“已带 `satellite_missing` 而标志为 0、却从未重建过”的中间状态（ADR-182）。按情形 E 的重建来源（可用的最新检查点 → pin → base）与重建步骤重建卫星（旁路目录构造后原子 `rename`，ADR-089；`restoreCheckpoint` 跳过第 0 步、成功后记录重建树的检查点，唯一定义在 `10` §10.16.2，ADR-182；显示 `◇ 正在重建工作目录`；重建期间 `satellite_rebuilding=1`；成功的同一事务清除它并记 `satellite.recovered{tree, checkpointN?, by:"auto"}`，Agent 由下一次 Run 的开场 `tower.satellite_rebuilt` 得知，`16` §16.1.12，ADR-180；重建中途崩溃不走这里，见下一行）。`in_review`/`accepted` 下重建后，若树与 pin 相同则不触发 I2。**重建失败**（ADR-094；文件系统错误先按 Project 不可达一行的“失败先判可达”，ADR-236）：从任意非终态进入 `paused`——首次进入时按来源状态写 `continuation`（`03` §3.2.1），已暂停则 `satellite_missing` 记入 `also_applies`，继续目标不变；同一事务清除 `satellite_rebuilding`（ADR-178：否则 `goal.resume` 的守卫会挡住其他原因的解除）。生成 Needs-You（severity 2：重试重建（`goal.rebuild_satellite`，重建来源同自动重建，ADR-176/183；从更早的检查点重建属 M2）/ 放弃）。重建成功只解除本原因，不改写继续目标；全部原因解除时由 `onAllReasonsCleared()` 离开 `paused`（其守卫保证树 ≠ pin 时先验证） |
| 卫星重建中途崩溃（自动或人发起的重试，ADR-178/181/182/183） | `satellite_rebuilding=1`（无论卫星目录是否存在） | 丢弃未完成的旁路目录；卫星工作目录或其 gitdir 已存在（崩溃发生在原子 `rename` 之后、提交事务之前）时，先把它们原样移入同一文件系统上的旁路目录，续做成功后删除（不把它当作已完成的重建，ADR-181；重建在置本标记之前已把仍在原位的工作目录或 gitdir 改名保留——`10` §10.16.2 情形 E 的“另一半”，写回失败转入的重建同此，§6.4.3——所以原路径上只可能是重建自己 `rename` 到位的目录，`.kept-*` 不在此列，ADR-221/224）；然后按上一行以同一重建来源从头续做——自动重建与人发起的重试（`goal.rebuild_satellite`）步骤相同，不再按决定中的检查点续做（M1 没有从更早检查点的重建，ADR-183）；成功时记 `by` 为最近一次进入 `satellite_missing` 之后是否有 `human.decision{rebuild_satellite}`（有 → `decision`，否则 `auto`），失败按上一行升级为暂停原因并生成 Needs-You |
| M1 验收或验收延续：写分支之后、事务提交之前（ADR-190/191） | 无专门检查：没有本次的决定、转移与 `integration.performed`；`goal.accept` 时 Goal 仍在 `in_review`，验收延续时仍在 `verifying`（按上方 `verifying` 行以同一 pin 重跑） | 不删除、不改写用户仓库中已写的分支；下一次 `goal.accept` 或验收延续按 `10` §10.6 重新 seal 表的识别规则（Tower 自己的 seal，按 sha；M1 不签名，ADR-193）认出它，树与说明都相同时复用（§6.4.3 `goal.accept` 行） |
| 隐私清除的文件删除中途（ADR-197） | 有不带 `filesDone` 的 `privacy.purged`，且没有同一 `scope`、`id` 带 `filesDone: true` 的一条 | 按 `09` §9.12.4 同一档的清单、只以事件中的 `id` 与 `roots` 定位（ADR-198），幂等续做文件删除（只删 Tower 自有的；“人的工作现场”所列的目录——`_human`、`_inspect` 与各 `<goalId>.kept-*`——与编号高水位照常保留，ADR-222），完成后追加 `filesDone: true`（`project` 档同时为其逐 Goal 的事件各追加一条，§6.4.3 `privacy.purge`）；按 `seq` 逐条续做，每条执行前重新判定是否已配对，因此 `project` 档续做完成后其逐 Goal 的事件已配对，不再重复执行；`memory` 档另按事件中的 `sessionIds` 删除人选择删除的会话文件（ADR-199；含已移入年度归档包的，按 §6.4.3 `privacy.purge` 重写该归档包，ADR-200）；`all` 档在这一次续做的最后删除数据库本身。续做与清除执行时相同，一次完成、从不推迟：这时不可访问的根不触碰，记入清除遗留清单（先于 `filesDone` 写入），之后也不自动删除；续做在接受界面命令之前执行，没有命令结果可以承载，所以只由存储面板列出（唯一定义 `09` §9.12.4 “不可访问的根”，ADR-237/238）；续做在接受界面命令之前完成，所以不会删除此后新建的数据。续做期间该 Goal 已按事件不显示 |
| `paused`（ADR-134） | `goals.state='paused'` | 什么都不执行（`prepare_failed` 不在启动时自动解除，与 `app_quit`/`engine_crash` 不同，ADR-149；后两者也只在 `resumeOnLaunch` 打开时解除，已生成条目的 `engine_crash` 除外，§6.1.4 第 5 项，ADR-205）：`continuation`、`pending_hand_back`、`pause_reason`、`also_applies` 都已持久化；只有在全部原因解除时（人的命令或自动解除，如 `autoResume` 原因的恢复）才由 `onAllReasonsCleared()` 离开 `paused`。重启本身不是解除原因的事件（`app_quit`/`engine_crash` 由 §6.1.4 的 `resumeOnLaunch` 显式解除） |
| 人工编辑检出（ADR-081、ADR-094、ADR-099） | `goals.human_checkout` 非空 | `syncState='syncing'`（交还或检验带回的写回中途崩溃——写回在本进程中失败时不留下 `syncing`，§6.4.3，ADR-220；§6.8 F8 中写不进的失败出口在解除时补写，ADR-234；`state` 为 `paused(human)` 时是交还，为 `in_review`/`accepted` 时是 `inspect.bring_back`，ADR-105）→ 以 `human_checkout.targetTree` 中的目标树 T1（唯一落点：与 `syncState='syncing'` 同一事务写入，树对象此前已写入影子，不依赖人工编辑检出仍存在；`human.decision` 中的 `targetTree` 只作审计，ADR-176；续写与后续步骤需要的交还参数——`externalResolution`、`resolvePinHits`、`mode`、`note`、`sealNote`——同样只从同一事务写入的 `human_checkout.params` 读取，ADR-178）**幂等续写**：写回集合与 `10` §10.8.4 第 7 步相同（`B→T1` 的差异，`B = human_checkout.rebuiltTree ?? T0`；交还选 `take_human` 时并上 `external_change` 的路径 E，ADR-176/180），跳过 `written` 中已写且内容等于 T1 的路径（E 中 T1 不存在的路径以“已不存在”为准），写完其余路径后按对应命令的后续步骤完成（带回时期间仍抑制该 Goal 的 I2 文件事件触发，完成后一次性重算指纹并单一事务转入 `verifying{human_change}`）；续写期间同样是“写回进行中”，续写失败按 §6.4.3 `inspect.bring_back` 行的“写回在本进程中失败”处理（ADR-219/220，不留下 `syncing`；该处 ① 留下的未完成旁路目录在续写之前丢弃，ADR-221）；续写完成之后人工编辑检出或检验目录不删除，原样留作已脱离的副本（`10` §10.2 “人的工作现场不自动删除”、§10.8.4 第 8 步，ADR-228；崩溃之后人在编辑器中又改过的内容因此留在其中）；**不**做“卫星在编辑期间被改动”检查（被改动的是 Tower 自己写了一半的内容，R7-D6-01）。`syncState='idle'` 且目录存在 → 保持 `paused(human)`，重新显示“交还”入口，不做任何同步。`idle` 且目录不存在（所在的 `<wtRoot>` 可访问——根不可访问时先按 Project 不可达一行，ADR-238；重启时检查，或运行中由文件系统事件与操作前检查发现，`10` §10.8.4 引用本行，ADR-212）→ 清除 `human_checkout`，保留 `takeover_from` 与 `takeover_prior_reasons`（Goal 仍为 `paused(human)`；之后的再次接管不改写这两项，§6.4.3 `goal.take_over`），生成 Needs-You（severity 2，kind `stalled`、子类型 `human_checkout_lost`，去重键与出口分类见 `08` §8.4、§8.8，ADR-211）“人工编辑检出已丢失，未交还的改动无法恢复”（影子中有 `handback-t1` 时另写 `最近一次未写完的交还仍保存在 Tower 中（目标页写明如何取回）`，§6.4.3 `inspect.bring_back` 行“T1 的保留”，ADR-239），选项：再次接管（`goal.take_over`；`external_change` 未解除时置灰并提示“先采纳或撤销外部改动”，因为此时该命令返回 `E_STATE`，ADR-213）/ 继续（`goal.resume`，不要求检出存在，执行继续目标；文案按 `takeoverFrom` 显示：`in_review`/`accepted` → “回到评审”，`running`/`ready` → “交给 Agent 继续”，`paused` → 按保留的继续目标取这两者之一，`verify`/`verify_new` 时为“重新验证”，ADR-179）/ 放弃改动（`goal.discard_human_edits`） |
| Agent 后台进程（ADR-142） | **Host 已不存在**的未结束 Run 的 `runs.process_token`；存活 Host 中已中止、数据库中没有它的 `draining_for` 与 `run.ended` 的 Run 的令牌（§6.8 F8：只读启动时中止的，与 drain 写不进之后 Supervisor 重启、Host 仍存活的；Host 存活，所以另以该 Host 记录的进程树取并集，同 `10` §10.3.1 settle 顺序第 3 步，ADR-234）；各 Goal 最近一个因 Host 退出或挂死而以 `crashed` 结束、其后尚无新 Run 开始、且还没有带它的 `runId` 的 `agent_bg_done` 检查点的 Run 的令牌（ADR-226；这一类在它的第一轮完成时即移出范围——那一轮补的检查点带它的 `runId`，之后仍存活的已按下一类处理；已归档或没有卫星的 Goal 不在此类——卫星在 7 天无访问后删除的 `abandoned`、重建失败的 `satellite_missing` 同样如此，它们无处补检查点，ADR-227/228）；或有未解决 `bg_process_survived`（存活期间未结束，`08` §8.4）的已结束 Run 的令牌（**终止范围的唯一定义**：重启后，以及 Tower 运行中 Engine Host 退出或挂死之后——后者在 §6.1.3 Engine Host 一行的“重启并恢复”之前执行一轮，ADR-201/225/226；**Tower 运行中的一轮**（ADR-227）只取**该 Host 承载的 Run**——该 Host 中的 Run（打包模式下即该 Host 上各 Goal 的 Run，§6.1.1）与这些 Goal 有未解决 `bg_process_survived` 的 Run——其他 Host 的 Goal 不在这一轮中、不显示 `清理中`；挂死的 Host 的后代树中不带令牌的成员（MCP 服务器、扩展的子进程、不带 Run 令牌的文件辅助进程，`13` §13.8.3）照常终止，不列入任何 Goal 的 `tower.processes_terminated`；后代树中带范围之外 Goal 令牌的成员（打包模式下此前在该 Host 上运行、现处于 `in_review` 等状态的 Goal 的存活者）同样终止，所属 Goal 随之并入这一轮的范围——补检查点、显示 `清理中`、按需注入 `tower.processes_terminated`（ADR-228）；只重启 Supervisor 时，main 交回的存活 Host 重新接上（§6.1.3），其中进行中的 Run 不在此列（上述已中止的除外，ADR-234）——不终止、不显示 `清理中`，§6.2.4 的检查 h 对它们所属的 Goal 照常满足；这样的 Goal 的旧 Run 有未解决 `bg_process_survived` 时，其令牌同样不在此列，存活期间的复查与归因照常（`10` §10.3.1 ④），ADR-226；本节 §6.1.10、`10` §10.3.1、`13` §13.11.1、`16` §16.4 只引用本行） | 按令牌枚举同一用户、同一开机会话中环境含该令牌的进程（§6.1.10），逐个发信号前再读一次环境确认令牌；每一轮完成时对范围内的每个 Goal 补 `agent_bg_done` 检查点（该 Goal 有上述第二类 Run 时带它的 `runId`，否则 `runId` 照常可空），什么也没终止时同样补（不受 `10` §10.7.1 第 2 步“树相同即不建”的限制，上述第二类据此移出范围，ADR-227；被 init 收养的进程同样处理，释放其占用的端口段；该 Goal 已没有卫星时（例如归档之后）照常终止、跳过检查点，不丢数据，ADR-202）；存活者全部终止时存活期间随之结束，仍打开的 `bg_process_survived` 条目按 `08` §8.4 以 `obsolete` 关闭。只处理**令牌已确认**的进程；读不到环境或环境为空的进程在重启时不提示、不终止（进程树不持久化，重启后只按令牌，ADR-159）。有进程被终止时，该 Goal 随后的恢复开场含 `tower.processes_terminated`，什么也没终止时不注入（ADR-227）；一轮完成与补检查点之间崩溃时，下次冷启动再做一轮（幂等），但“有进程被终止”不持久化，上一轮已终止的进程不再出现，恢复开场可能缺这一条——登记为告知的已知缺口（ADR-228）。本行是上文“在接受 UI 命令之前”的例外（ADR-223）：它在冷启动之后后台执行（`13` §13.11.1 令牌扫描一行）；Tower 运行中 Engine Host 退出或挂死之后的一轮同样适用下述显示与闸门（ADR-227）——完成之前所属 Goal 的实况行为 `清理中 · 残留进程 · <剩余>/<总数>`（`12` §12.6.4），`goal.take_over` 返回 `E_BUSY`（界面显示“稍后重试”）；**清理结束**指终止的一轮完成（逐个发信号、等待清空、到时 `SIGKILL`，§6.1.10），仍存活的按 `bg_process_survived` 照常处理、不再阻挡（ADR-224）。该 Goal 的 Run（启动时自动解除后执行的继续目标与 `goal.resume` 开的 Run）照常经准入，由 §6.2.4 的检查 h 在 `ready{slot}` 中等到清理结束，所以恢复开场总在清理结束之后组装。同一 Goal 既要按上一行续写、又有本行要终止的进程时（双重故障），先完成该 Goal 的终止一轮、再续写，残留进程的写入因此不会并入续写之后的 `human_change` pin（ADR-224） |
| Run 在 drain 中途（ADR-141，唯一规则） | `goals.draining_for` 非空，不论 Run 是否已结束（ADR-200：`run.ended` 已提交、执行原目标的事务尚未提交时——如接管物化 H、回退（M2）恢复检查点的中途——同样适用） | **Host 已不存在时**（main 退出，或只重启 Supervisor 而该 Run 的 Host 已不存在）：Run 已结束时不再写 `run.ended`。按 `draining_for.target`：`pause` → 以 `reasons` 进入 `paused`（优先级最高者为 `pause_reason`，其余进 `also_applies`），其中 `app_quit`/`engine_crash` 按 §6.1.4 第 5 项在启动时自动解除（只在 `resumeOnLaunch` 打开时，ADR-201）；若集合**只有** `app_quit`，等同于正常的应用退出（按 `resumeOnLaunch` 设置，§6.1.4）；`take_over`/`rewind`（M2）→ `paused(reasons ∪ {human})`（人发起的操作中途中断，不自动继续，由人重做；回退因此不会覆盖未处置的外部写入。**M2 的已知限制**（回退在 M1 没有入口，ADR-201）：回退在恢复检查点中途中断时卫星是新旧混合的树，重启后的决定性检查会把 Tower 自己写了一半的路径判为来源不明的写入；M2 实现回退时须在本行先以第 0 步的 `safety` 检查点按 `restorePaths` 还原卫星（作为 Tower 自己的写回窗口），再进入 `paused(human)`）；`dependency` → `reasons` 非空时 `paused(reasons ∪ {human})`、否则 `ready{waitReason:"dependency"}`（ADR-141/144）。恢复前的 `safety` 检查点不把 `external_change.paths` 中的路径归入 Agent。**Host 存活时**（只重启 Supervisor，main 交回该 Host，§6.1.3；ADR-226）：不按上述规则转入暂停——重新接上后由 Supervisor 继续这次 drain，从 §6.1.4 第 3 项 drain 协议尚未完成的一步续做：Run 未结束时重新发 `abort` 并等到 `agent.settled`（期间的事件经 `replay` 补齐），随后与正常结束的 drain 相同，写 `run.ended` 并按 `draining_for.target` 执行原目标（`reasons` 非空时放弃原目标的规则同此）；Run 已结束时只执行原目标。`draining_for` 为空时见下两行 |
| settle 中崩溃（ADR-145） | `draining_for` 为空，未结束 Run 的 `runs.phase = 'settling'` | 进入 `paused{app_quit 或 engine_crash}`（取哪一个见下一行），继续目标 `settle`（启动时自动解除后按 ADR-143 的 Host 不存在规则执行完整 settle 序列，不开 Run）；I4(a) 成立 → pin 与 `claimed`（崩溃前 Run 中仍未作答的阻塞条目属于已结束的 Run，不阻止 `claimed`，保持打开，作答进入 `pending_openings`，`05` §5.5，ADR-178）；不成立 → 按 `05` §5.5 settle 判定表（非 draining、`outcome = completed`）进入 `paused(idle_without_submit)` 或开 Run 以 nudge（ADR-146） |
| Run 中崩溃 | `draining_for` 为空，未结束 Run 的 `runs.phase = 'running'` | 按“Run crashed”处理：`paused{app_quit 或 engine_crash}`，继续目标 `run`，`autoResume` 按原因决定。**取哪一个**（本行与上一行相同，ADR-206）：应用本身（main）退出、崩溃或被强制终止后的启动取 `app_quit`（Host 随 main 退出）；main 一直在运行、只有 Supervisor 重启（§6.1.3）而该 Run 的 Host 已不存在时取 `engine_crash`；§6.8 F8 中止而没有写进 `draining_for` 的 Run 在 Host 存活时按本行处理、取 `app_quit`（ADR-233；Host 已不存在时照上两种情形取，ADR-234）——这一判别按可观察的状态（存活 Host 中已中止、数据库中没有 `draining_for` 与 `run.ended`），Supervisor 重启的几秒内其他来源的中止（扩展的 `ctx.abort()`、卫星丢失的 `abort` 与其暂停写入之间的崩溃）同样落入、卡片写 `磁盘已满`（如实登记，ADR-234）。`resumeOnLaunch` 关闭时两者的差别可见：`app_quit` 没有条目，`engine_crash` 按 `08` §8.6.3 生成条目。本表各行把未结束的 Run 判为结束时（含上两行），同一事务按 `run_end` 使远程批准的 S0 授权失效（`goals.s0_grant_expires_on`，`11` §11.9，ADR-180） |

无法自动判断的情况（例如 base ref 既不是旧值也不是新值，且 Goal 分支已被人手动改过），统一转为 `MergeQueueEntry.state = "needs_human"`，并生成 Needs-You `conflict`（severity 2），附上检查到的实际 ref 值。合并队列本身是 M2 的功能（ADR-038）；上面这些合并队列与 `integrating` 的恢复规则随“推送并开 PR”一起在 M2 生效（ADR-133：M1 只有“仅保留分支”，只观测本地 base；M1 验收的写后窗口见上表 M1 行，ADR-190）。

### 6.1.7 安全模式的能力清单（R1-D6-03）

Supervisor 在 10 分钟内崩溃 5 次后，main 以 `--safe-mode` 重新启动它。安全模式**不运行**以下模块：Projector 的增量投影、Observer、哨兵、Radar、AttentionRouter、调度器准入、验证器。数据库先执行 `PRAGMA quick_check`，结果决定写入方式：

| 能力 | 数据库完好（quick_check 通过） | 数据库损坏或无法打开 |
|---|---|---|
| 查看 Goal 列表、最近状态 | 读最后一份投影快照 | 读 `~/.tower/recovery/last-board.json`（每次写快照时顺带写出的只读副本） |
| 暂停、中止活跃 Run | ✔：EngineManager-lite 直接对存活的 Host 发 drain、`abort`、`clear_queue`（这条路径不依赖其他模块），并写入 `goal.state_changed` 和 `human.decision`；崩溃前已在进行、Host 仍存活的 drain 照 §6.1.6 drain 一行续做到 `run.ended` 与原目标（只是收尾，不开 Run，ADR-227） | ✔：同样直接作用于 Host，但写不进数据库，改为追加到 `~/.tower/recovery/journal.jsonl`（带幂等键）。数据库恢复后由正常模式重放 |
| 回答已在等待中的对话框 | ✘（避免在部分模块缺失的情况下做出决定） | ✘ |
| 启动或恢复 Run、验证、集成 | ✘ | ✘ |
| 导出诊断包、从备份恢复 | ✔ | ✔ |
| 退出安全模式 | 人点击“重试正常启动” | 先从备份恢复（§6.6.3），再重放 journal 和 Pi JSONL |

UI 在安全模式下只显示这张表允许的操作，并提示进入原因（最近 5 次崩溃的堆栈摘要）。

### 6.1.8 Host 的退出协议（R1-D6-04）

Host 在以下情况退出（与 `13` §13.5 一致）：Run 已 settle 且 Goal 进入 `in_review`、`paused` 超过 5 分钟、被人中止、应用退出。退出顺序：

1. 停止接受新命令，回复 `bye{reason}`。
2. 把缓冲区里的事件全部发出，等待 Supervisor 对最后一个 `hostSeq` 的 ack（超时 10 s）。
3. 超时或 Supervisor 不可达时，把尚未 ack 的事件写入 `goals/<G>/runs/<R>/host-<epoch>-unacked.jsonl`（`fsync` 后关闭）。
4. SDK 调用 `runtime.dispose()`；RPC 关闭子进程的 stdin（`05` §5.4.2）。然后退出。

Supervisor 启动或重新连接时，先读入所有 `host-*-unacked.jsonl`（按事件的幂等键去重），读完即删除。最后再以 Pi JSONL 对账兜底（§6.6.5）。

### 6.1.9 多机与共享仓库（R1-D6-06）

v1 **不支持**两台机器上的 Tower 同时操作同一个仓库，例如网络共享盘上的检出（ADR-028：v1 不承诺跨机连续性）。为了让这种情况被**发现**而不是悄悄互相破坏，加一把仓库级的租约锁：

- 首次附着仓库时，Tower 用 `git hash-object -w` 写入 `{installId, hostname, pid, at}`，并 `update-ref refs/tower/_owner <blob> ""`。旧值为空，表示只在 ref 不存在时才写入成功。
- 运行期间每 10 分钟续租一次：用 CAS 把 ref 更新为新的 blob，旧值校验为自己上次写入的 blob。CAS 失败时重读 `_owner`（ADR-195）：ref 已不存在 → 按首次附着重新写入；仍属于本机的 `installId`（如 ref 锁等瞬时失败）→ 下一次照常续租；属于另一个 `installId` → 按下一条处理。
- 发现 `_owner` 属于另一个 `installId`、且续租时间在 24 小时以内：这个 Project 进入**只读**状态，不创建 worktree、不写 `refs/tower/*`、不启动 Run，也不删除其 `<wtRoot>` 中没有本机 Goal 行的目录（标为 `另一台 Tower 正在使用`，`10` §10.2，ADR-231），并生成 Needs-You：“该仓库正被另一台机器上的 Tower 使用”；`_owner` 中的 `hostname` 与本机相同时改写为“该仓库正被另一个 Tower 安装使用，可能是本机此前的安装（如‘清除全部’之后）”，并附 `09` §9.12.4 的手动出路（ADR-196）。超过 24 小时：询问人是否接管，接管记为 `audit.repo_lock_taken`；人确认接管之前，这个 Project 照上一条保持只读，目录照上一条标注、不删除（ADR-232）。
- 同一台机器上的单实例锁（`app.requestSingleInstanceLock()`，F23）仍然保留。


---

### 6.1.10 Agent 进程追踪与 settle 时的终止（ADR-115，R12-D6-01）

Agent bash 派生的进程（含开发服务器、`--watch` 进程等后台进程）由 Supervisor 按 Goal 追踪（判定规则与平台机制以 `10` §10.3.1 为准）。本节只规定顺序、身份与持久化。

- **顺序**（ADR-121；每次 settle）：`agent_settled` → 同一事务写 `runs.phase='settling'`（ADR-145；宽限失败或 `claimed`/`verifying` 中撤回时同一事务写回 `running`，ADR-146）→ **2 s 宽限确认**（ADR-025；失败的唯一定义在 `05` §5.5：不记异常，回到等待下一次 `agent_settled`，进程不被终止，ADR-129）→ 终止本 Run 的**全部**进程（按 Run 令牌识别，见下）→ SIGTERM 后**等待进程树清空**，最多 10 s，随后 SIGKILL；仍有存活者记 `anomaly{detector:"bg_process_survived"}`（其后的未归因写入记为 `author:"agent"` 并附注记，不走 `external_change`，ADR-122）→ 补做 `agent_bg_done` 检查点（`author:"agent"`）→ 判定 I4（§6.2.3）→ **生成 pin 并进入 `claimed`（同一事务**，ADR-137：`claimed` 中总有 pin；pin = `agent_bg_done` 检查点的树；写 `verify_from='claimed'`）。settle 序列中因**任何**原因进入的暂停（人暂停、`app_quit`、外部写入等），继续目标都是 `settle`，解除后从宽限确认起重新执行完整序列（ADR-137）。撤回到 `running`、或 `app_quit`/`engine_crash` 后自动恢复时，若有进程曾被终止，注入 `tower.processes_terminated`（投递方式见 `05` §5.5：run 进行中以 `triggerTurn:false` 追加，恢复时为第一条消息，ADR-129）。settle 序列中检测到外部写入 → `paused(external_change)`，`continuation={kind:"settle"}`（ADR-134/137）。等待期 Mode 仍是 `settled`，实况行以 `12` §12.6.4 为准（ADR-126）。
- **Run 令牌**（ADR-142，取代以 pid、启动时间、进程组识别进程的全部规则）：每个 Run 生成 128 位随机令牌 `TOWER_RUN_TOKEN`，由 Tower 的 `BashOperations.exec` 实现自身注入每条命令的环境，不依赖 `spawnHook`（`05` §5.3.5，D38，ADR-144），子孙进程继承它。**持久化的只有令牌**（`runs.process_token`，每 Run 一个），不再随进程进出写事件或行。
- **识别与终止**：同一用户、同一开机会话中，环境里含该令牌的进程即属于该 Run。**settle 时按进程树与令牌取并集终止**（ADR-158）：Tower 的 `exec` 记录每条命令的直接子进程，以 `proc_listchildpids` 递归得到进程树；Apple 平台二进制（`/bin/bash`、`/bin/sleep` 等）的环境对普通进程不可读且读取不报错，令牌对它们失效，由进程树覆盖。“环境读取成功但为空”与“读取失败”同样视为**无法确认**。脱离进程树且读不到环境的进程识别不到——这是登记的窗口，其后的写入在 settle 之后按“来源不明的写入”处理（`paused(external_change)`）。macOS 以 `sysctl(KERN_PROCARGS2)` 读取各进程环境；Linux 以 cgroup 为主（取值唯一定义在 `10` §10.3.1：每 Goal 一个父 cgroup、每 Run 一个子 cgroup，ADR-145）、令牌为辅。对每个进程发信号前再读一次环境确认令牌（防 pid 复用）。**扫描频率**（ADR-144/146；全进程扫描最多每 60 s 一次，且只在 Run 活跃时）：只在 settle 终止、重启清理、Engine Host 退出或挂死之后的一轮（§6.1.3；与重启清理一样由事件触发，不受“每 60 s 一次”与“只在 Run 活跃时”的限制，ADR-227），以及 watcher 检测到来源不明写入时（判断是否处于存活进程期间）扫描；`bg_process_survived` 期间每 30 s 重新扫描，存活者全部退出时以 `obsolete` 自动关闭该条目；人“知悉”只结束打扰，**不**结束存活期间的扫描与归因规则（ADR-145）。**macOS 每 Goal 内存上限**（ADR-145）：每 5 s 从 `exec` 已知的直接进程出发，以 `proc_listchildpids` 递归遍历其**后代树**、以 `proc_pidinfo` 求内存之和（不是全进程扫描，ADR-146）；脱离进程树的后台进程由令牌全扫描覆盖——Run 活跃且 Goal 设有内存上限时最多每 60 s 一次（`13` 预算：1000 进程 ≤ 50 ms）；超过上限按 `13` 处理。**`user_bash` 的归因**（M2，ADR-145）：Tower 在调用 `exec` 时即知道是哪一个 `BashOperations` 实例（工具或 `user_bash`），只有 `user_bash` 调用窗口内、不与 Agent 工具调用窗口重叠、且**没有不属于该 `user_bash` 调用进程树的 Agent 进程存活**时的写入归人（两个 `BashOperations` 实例各自已知的直接 pid 及其后代区分进程树，`05` §5.3.5）；否则记为 `mixedPaths`（ADR-146/147）；它启动的后台进程的写入按存活进程规则记为 `agent`；环境中的 `TOWER_ORIGIN` 只用于诊断，不作为归因依据。单次扫描预算以 `13` 为准。**环境读取的约束**（ADR-144）：只在内存中匹配令牌，不记录、不持久化、不传输任何其他环境内容；只对本用户的进程运行。
- **已登记窗口**：主动清空自身环境的进程识别不到，其写入按已知误判 (b) 处理（`10` §10.3.1）。
- **崩溃恢复**：Supervisor 重启后，以及 Engine Host 退出或挂死之后（§6.1.3），对 §6.1.6 “Agent 后台进程”一行所列 Run 的 `process_token`（范围只在该行定义，ADR-201/225/226）按上面的规则枚举与终止，并对所属 Goal 补 `agent_bg_done` 检查点；只处理令牌已确认的进程（挂死的 Host 另以它的后代树取并集，§6.1.3），无法确认的不提示、不发信号（§6.1.6，ADR-159）。

## 6.2 Supervisor 模块

### 6.2.1 处理流水线（单写者）

```
UI 命令 ──► CommandBus ──► 鉴权（scope）+ 校验 ──► StateMachine.decide(cmd, view) ──┐
引擎事件 ─► EngineManager ─► Observer / Accountant / Sentinels / Receipts ─────────────┤
计时器 ──► Timers（默认动作、静默检测、宽限期、日程）─────────────────────────────────┤
验证结果 ─► VerifierScheduler ───────────────────────────────────────────────────────┤
                                                                                     ▼
                                     events: TowerEvent[]（带 idemKey、causedBy）
                                                                                     ▼
                     EventLog.append(events)：组提交事务内（13 §13.9.3；人的决定立即单独提交）
                       ├ INSERT events
                       ├ Projector.apply(events) → 更新领域表 / projections（同一事务）
                       └ COMMIT
                                                                                     ▼
                     后效（提交之后执行，失败可重试）：Coalescer 推送增量 · engine_outbox 投递 ·
                       AttentionRouter.route · 写 runDir 文件（brief/policy/situation）· OS 通知
```

- **一切领域写入都经过 `EventLog.append`**（已知的非事件写入者见下文“有非事件写入者的字段”），领域表是事件的**写穿投影**（write-through projection）。**重建**（`tower doctor --rebuild`，投影版本迁移同此；唯一定义，ADR-213/214/215/216，取代“例外列表”的写法）按表分两类，下列两份清单合起来覆盖 §6.3 DDL 的全部表：(1) **由事件重放的表**（清单即全部）：`goals`（例如 `goal.*`、`goal.state_changed`；`pending_hand_back`、`pending_openings` 等列来自 `human.decision` 等事件）、`goal_deps`（`goal.dependency_*`）、`contracts`（`contract.*`）、`facts`（`fact.recorded`）、`claims`（`claim.recorded`）、`decisions`（`human.decision`）、`comments`（`comment.*`）、`runs`（`run.*`）、`checkpoints`（`checkpoint.created` 与之后只追加的两列，`16` §16.1.14，ADR-212/213）。这些表按事件重放，**以字段为粒度**与被重建的库合并（ADR-216）：重放只写 Projector 由事件载荷求出的字段（含由事件置空的）；其余字段按主键取被重建的库中同一行的值——既包括不由任何事件载荷承载的列，例如 `runs` 的 `process_token`、`session_id`、`adapter`、`engine_version`、`attempt_*`、`host_*`、`phase`、`submit_*`、用量，也包括 JSON 列中不由事件载荷承载的键，例如 `goals.human_checkout` 的 `syncState`、`written`、`targetTree`、`rebuiltTree`、`params`（交还或带回的事务直接写入，写回中途崩溃后的续写只读它们，§6.1.6）与 `goals.counters`（`reworkCycles` 在 `decide()` 中递增、没有专门的事件，I6）；`checkpoints.in_user_repo`（信息性）按用户仓库中实际存在的地标 ref 求出。**墓碑行**（ADR-216）：载荷已墓碑化、无法重放的行——隐私清除留下的 Goal 墓碑行与决定墓碑行，含“彻底忘记一条记忆”墓碑化的决定（`09` §9.12.4）——从被重建的库原样沿用，不重放，所以其他行对它们的外键（`parent_id`、`resurrected_from`、`goal_deps`、沿用表中的 `decision_id` 等）仍然成立；投影版本迁移同样沿用它们，迁移改动这两张表的列时，墓碑行只经迁移对旧行所做的同一列变换；迁移改动清单 (1) 中其他行的非事件列时，其值同样来自旧行经同一列变换。被清除 Goal 名下其他表的行（runs、checkpoints、facts、claims、contracts、comments、`goal_deps` 等）已随清除删除、其事件载荷已墓碑化（`09` §9.12.4）：重放跳过载荷已墓碑化的事件，不重新产生这些行，也不因下文“由事件产生而旧库中没有该行”而中止（ADR-217）。**有非事件写入者的字段**一律取被重建的库中的值（ADR-217/218；重建不知道每个字段最后由谁写入）。已知的非事件写入者只有一处：§6.1.6 发现人工编辑检出丢失时清除 `human_checkout`，不写事件——所以 `human_checkout` 取被重建的库中的值，为 NULL 时取 NULL，不由 `human_checkout.created` 重新写出；新增非事件写入者时补入这里。(2) **其余一切表从被重建的库原样沿用**，不清空、不由生产者重新判定，逐个写明：`meta`（其中的 `install_id` 是仓库租约的身份，§6.1.9）；`projects`、`project_checkouts`、`project_local_files`、`project_benign_targets`、`bindings`；`sessions`（没有 `session.*` 事件，`runs.session_id` 以它为外键）；`needs_you`（没有创建事件；所属 Run 已被 abort 或兜底超时而仍可作答的 `question` 条目，`05` §5.5，与 `paused(question_timeout)` 的阻塞问题都原样保留，连同推迟与级别）；`review_units`、`memory`、`scratch`；`depcache_entries`（验证器存储的发布记录，从不清空——清空会让 `$VS` 中的每个 depcache 条目被当作没有来源而记为 `verifier_store_tampered`，`07` §7.4.3）；运行时表 `watermarks`（`watermark.advanced` 只更新它、不进入 EventLog，§6.4.3）、`timers`、`engine_outbox`；`projections`——已过分层保留期的 Goal 的最终快照原样沿用（带原 `ver`；`engine.*` 删除之后它是这些 Goal 唯一完整的快照，§6.6.4），其余快照在重放之后重新生成；`retention_guard` 是事务内的临时表，事务之外恒为空。`events` 与 `payloads` 是事件日志本身，不在两类之中。沿用的行与事件在同一份库中，所以重建时两者总是同时可用；从 `db-backups/` 恢复时两者来自同一份备份。沿用的表本身若已损坏，重建不能修复它，须从 `db-backups/` 恢复。**做法**（ADR-216）：重建写入一份新库，按外键顺序插入（被引用的行先于引用它的行；`decisions_no_delete` 触发器与外键约束因此不必在旧库上放宽），完成后才替换旧库，中途失败时旧库不变；清单 (1) 中某行由事件产生、而被重建的库中没有该行时，没有来源的非空非事件列（如 `runs.process_token`）无从取值，重建中止并提示从 `db-backups/` 恢复。新增的表默认属于 (2)，只有能由事件完整重放时才列入 (1)。
- 后效（side effect）**只在提交之后**执行，而且必须幂等（以 idemKey 去重），这样崩溃后重放不会重复发通知或重复投递转向。
- 整个 Supervisor 在一个 Node 事件循环里串行处理。`node:sqlite` 的 `DatabaseSync` 是同步 API，单个事务目标 p95 < 2 ms。耗时的工作（git、diff 解析、日志解析）放到 git worker 或 Verifier Runner。

### 6.2.2 模块一览

| 模块 | 职责 | 主要输入 | 主要输出 | 详细规格 |
|---|---|---|---|---|
| **GoalStore** | 领域对象读写的门面（ADR-006）：Goal、Contract、Run、Binding、Memory 等 | 投影表 | 查询结果 | 本节 |
| **EventLog** | 追加式事件日志；事务；幂等；按 seq 读取 | 事件 | `events` 表 | §6.3 |
| **Projector** | 把事件折叠为领域表和 `projections`；版本号 = seq | 事件 | 投影 | §6.3 |
| **StateMachine** | 生命周期转移；断言 I1–I8；只有它能产生 `goal.state_changed` | 命令、Fact、引擎事件 | 状态事件 | §6.2.3 |
| **CommandBus** | 命令幂等（`cmd.id`）、scope 鉴权、乐观并发（`expect.ver`） | UI 命令 | 交给 StateMachine 或其他模块 | §6.4.5 |
| **EngineManager** | 槽位调度、Host 生命周期、adapter 代理、心跳、事件 ack 和重放 | 调度请求、Host 事件 | `run.*`、`engine.*` 事件 | §6.2.4 |
| **Observer** | 按 `toolCallId` 合并 `tool.start`（参数）、`tool.end`（结果）和 `tower.obs`（带外记录，含实际执行输入的哈希）→ `command_result`（`track:"observed"`，ADR-024 第 3 条；`tool.start.args` 看不到门禁之后的修改，见 `05` §5.2.2 规则 7）；Claim 生成；Live Line 投影。`files_touched`、`diffstat` 以 git 检查点为准（producer `git`，`track:"verified"`） | 引擎事件、检查点 | Fact、Claim | `07` §7.2；`05` §5.5.1、§5.6.5 |
| **Receipts / CommentRouter** | 评论队列与批次、`engine_outbox`、回执状态机 | 评论命令、`queue`、`msg.start` | `comment.*` 事件 | `05` §5.7 |
| **VerifierScheduler** | 触发验证、槽位池、pin 提交、结果入账。**安装器编排**（`07` §7.4.3 为正文，ADR-085/092/093/165）：① 拉取（**只运行包管理器自身、不执行任何项目代码**——禁用 pnpmfile 与生命周期脚本；私有注册表令牌 Tower **不保存**——每次运行时只从**用户级** `~/.npmrc` 取 `//<registry>/:_authToken` 等认证行（按注册表对应，其中的 `${VAR}` 以用户登录环境展开；**项目 `.npmrc` 中的认证行不读取**——仓库控制的凭据不可信，与 pnpm 自身行为一致，ADR-167），写入即时投递文件 `~/.tower/run/<id>/`（0600），阶段结束即删（ADR-166；`dep.add` 的代理安装同样走第 1 阶段）；只访问注册表；同时按注册表 tarball 计算运行器集合的逐文件哈希基准，写入 `depcache_entries.runner_baseline`）→ ② 预取（不带令牌，只访问已登记下载域名，只运行 Tower 内置预取器与人批准的 `VerifyProfile.prefetch`，产物进 `$SH`）→ ③ 安装（不带令牌、断网，只能写本次的 `$VS/staging/<installRunId>/`）→ ④ 发布（Supervisor 在沙箱外校验 manifest 与运行器基准，原子 `rename` 为 `depcache[depsKey]`，发布后只读，同一事务写发布记录）。运行器相关包被 patch/override/link → `sentinel{detector:"runner_patched"}`。ADR-063 中“合同可把注册表令牌授予 Agent 可读的 npmrc”在 M1 撤回（移到 M2）。**本地文件的播种**（ADR-078/082/165/166；实体 `project_local_files`）：只有满足 `seeded` 的文件播种到验证槽位与检验检出（派生谓词 `isSecret` / `seeded` 唯一定义在 `16` 的 `ProjectLocalFile` 行，ADR-169），未批准的不播种（ADR-168）；**含机密的本地文件**（满足 `isSecret`：判定来源为文件名匹配 `.env*`、`*.pem`、`*.key`、`*credentials*`、`*.p12` 等模式，或用户标记，或内容匹配 `11` §11.7 的机密模式，且未取消标记）**Tower 不会自动**播种到验证槽位、检验检出或卫星；已取消标记并批准的文件照常播种；依赖它们的检查写为 human 标准。**判定时机**（唯一定义在 `16` 的 `ProjectLocalFile` 行，ADR-170）：`add` 时，以及每次复制前按名字与当前内容重新判定每个条目；`secretBy = null` 的条目命中时写入 `secret_by='content'`（事件 `project.local_file_secret_detected`），这次不播种并通知；不可读或不存在时这次不复制、不改写 `secret_by`；其中本应复制的条目由执行复制的服务发“无法读取”的 L1 通知（进程内状态，按条目去重，不写账本，重启后不保留，ADR-173）。作用范围（任何把本地文件复制出用户检出的地方，含人工编辑检出）与“判定与复制用同一次读入的内容”都以 `16` 为准（ADR-171）。被取消标记的文件若内容哈希已变且再次匹配机密模式，自动恢复为机密（清除 `unmarked`，同一事务记事件 `project.local_file_unmark_reverted`，ADR-172）并通知。唯一的人发起例外是检验检出的 `withSecrets`（`inspect.open`）。**未播种的机密本地文件与失败**（ADR-168，唯一定义在 `07` §7.4.1；撤回 ADR-166/167 的 `secret_file_unseeded` 自动归类）：**不做自动归类**，标准失败一律按普通失败处理（含自动返工与返工上限）。项目存在 `isSecret` 的条目时，失败卡片附 Claim 语法的提示“本项目有 M1 中不提供给验证的本地机密文件（`<路径>`）；若该失败源于此，请改为 human 标准”（只列 `isSecret` 的条目）并提供“改为 human 标准”（`contract.amend`；修订生效后界面串联 `retry_verify{pin:"same"}`，`03` §3.4.5，ADR-169）；返工证据中附同样一行；本次验证有本应复制而未复制的本地文件时（取自本次验证记录的 `criterion_check.env.localFiles` 中 `not_copied` 的条目，ADR-173），卡片与返工证据另附一行“未复制”的 Claim（`07` §7.4.1，ADR-172）；试运行的红灯徽标旁附“若失败源于缺少本地机密文件，这不是有效红灯”。**机密**（ADR-164，M1 规则唯一定义在 `11` §11.7.0）：M1 中验证标准**不能**声明机密——`exec` 标准的 `env` 字段不可用，合同编辑器拒绝并提供“改为 human 标准”的一键转换（需要机密的检查由人在自己的环境中确认并勾选）；Agent 的工具调用也不获得机密（ADR-161）。因此 M1 的验证中不会出现 `not_run`。**移到 M2 的机制**（设计保留为 M2 起点，登记于 `16` 废弃表）：带机密标准的机密阶段（先跑普通标准、不持槽等待、取自本项目验证器池的槽位、冻结、注入前准备、收尾顺序，ADR-162/163）、调度互斥与 `secretMutex.enabled`（ADR-160）、整机冻结、`secret_wait` Needs-You 与 `verify.secret_wait.*`、`accept_secret_exposure`、`not_run{other_criteria_failed|blocked_by_sentinel}` 与 `secretPhaseOnly`、`secretsVia` 与 `~/.tower/run/` 的投递文件、验证器沙箱对投递文件的逐路径放行、`secrets.access` 的注入。 | `claimed`、指纹变化 | `criterion_check`、`verify.*` | `07` §7.4 |
| **Sentinels** | 测试完整性、围栏、依赖、配置、密钥。`nested_repo_live`（ADR-131，run 类，交还时保留，**不可覆盖**——没有 pin 可绑定）：卫星 watcher 在 `running` 中发现名字等价于 `.git` 的新条目 → 以 abort 方式 drain，进入 `paused(sentinel_high)`；出口为 `goal.resume`（必填转向，要求 Agent 删除该条目）、`goal.take_over`（人删除；交还后仍保留、`pending_hand_back` 非空时不可用，`03` §3.2.1，ADR-215）、`goal.abandon`；条目从卫星消失时命中自动解除。`sandbox_violation`（提示性，不阻止 Verified，ADR-110）：被拒目标属于 severity 2 的受保护类别（`credential`（读、写）、`tower_data`、`user_checkout`、`other_satellite`、`user_config`（仅写）；唯一定义在 `16` §16.1.6）时提升为 severity 2，交 AttentionRouter 生成 Needs-You（`kind:"sentinel"`、L2、`costOfDelay:"none"`），评审“运行异常”区块置顶；去重键 `sv:{goalId}:{category}:{op}:{target}`（`08` §8.4，ADR-125）；`(category, op, target)` 在 `project_benign_targets` 中则为 severity 1；凭据读取永不降级。这类拒绝**可能**表明提示注入或越权意图，不是直接证据（常见良性来源如 `~/.ssh/known_hosts` 写入）；出口见 `signal.*` 命令（ADR-113/117）；其余拒绝为 severity 1 提示 | 检查点、diff | `sentinel` Fact | `07` §7.5–7.6 |
| **Radar** | 冲突预测（与 base 比较、兄弟 Goal 两两比较） | 检查点、base 前移 | `conflict_forecast` | `10` §10.9 |
| **Accountant** | 每条 assistant `usage` → 成本；预算软上限和硬上限；`budget_capped` | `msg.end.usage`、`getStats` | `budget` Fact、drain 请求 | 本节 |
| **AttentionRouter** | Needs-You 的级别、去重、批处理、打扰预算、渠道、默认动作计时器 | Needs-You 事件、用户状态 | 投递决定、OS 通知 | `08` §8.3–8.7 |
| **BriefingBuilder** | 渲染 `brief.md`、`situation.md`、`contract.md`、`episodic.md`；重入简报、站会摘要 | 合同、记忆、账本 | runDir 文件、`briefing` 投影 | `05` §5.6.3；`08` §8.10 |
| **GitService / GitRunner** | 卫星克隆的生命周期、指纹、diff、检查点、pin、seal、rebase、合并队列（写操作在 git worker 中执行，每个卫星一把锁）。**影子的唯一写者**：影子索引、对象与 `refs/tower/<goalId>/*` 只由本服务在该卫星的锁内写入；Engine Host 中的 tower-goal 扩展不执行 `captureCheckpoint`，只发出检查点请求（唯一定义 `10` §10.7.2，ADR-183）。**自动 rebase 属于 M2**（ADR-156；M1 中 base 前进只提示，不自动 rebase）。M2：rebase 前先补齐新 base 的 LFS 对象（ADR-155，与仓库准备的 LFS 补齐相同）：补齐失败 → 本次 rebase 放弃（卫星保持旧 base），记 Fact `rebase_lfs_failed{missing}`，下一轮轮询重试；补齐完成后**重新检查**全部前置条件（Goal 状态、base 是否再次前进），不满足则放弃本次 rebase。**base 的唯一取值函数 `baseTip(r, b)`**（ADR-156）：镜像中 Tower 获取的 `refs/tower-remote/<r>/<b>` 与用户最近一次获取的 `refs/user/...` 有祖先关系时取后代；分叉时**不自动选择**（ADR-158：用户侧时间戳不可靠）——尚未选择时返回 `baseCommit` 本身（ADR-160/161），不改变 `baseCommit`，记 Fact `base_diverged{towerFetchedAt, userObservedAt}`，卡片提示“远端与本地的 <分支> 已分叉，未自动采用任一版本”，提供“使用远端”“使用本地”（`goal.base.choose{side}`，只决定观测基准，不改动工作区；持久化为 `goals.base_choice`，同一对分叉提交仍存在时 `baseTip()` 返回所选一侧，任一侧变化即失效并重新判定，ADR-159）；base 变化但不是前进时记 `base_unchanged_nonancestor{from, to}`。Goal 准备、base 前进检测、合并队列 Q2（M2）与集成观测一律调用它。ADR-060：所有对工作区的 git 操作都经 **GitRunner**：`GIT_CONFIG_NOSYSTEM=1 GIT_CONFIG_GLOBAL=<Tower 最小配置> git --git-dir=<影子目录> --work-tree=<卫星> -c core.fsmonitor=false -c core.hooksPath=/dev/null -c core.sshCommand=false -c core.protectHFS=true -c core.protectNTFS=true …`（后两项 ADR-123：git 拒绝把 `.git` 的等价变体加入索引）。影子 `add` 的排除与重试规则唯一定义在 `10` §10.1.2（Tower 先按名字规则一次列出排除集合；git 仍拒绝时作为兜底加入排除集合重试，最多 64 次，之后以已排除的路径完成）；被排除的路径记入检查点的 `excluded_paths`；`running` 中发现时按 `nested_repo_live` 进入 `paused(sentinel_high)`（ADR-131/139）；只要任一被排除的路径仍在卫星中，就以 `nested_repo`（按“路径 + 名字”绑定）阻断 Verified，**不可覆盖**，唯一出口是删除。从不经卫星的 `.git` 发现仓库，从不读卫星的 config、index、hooks；影子配置不定义任何 filter、diff、merge 驱动。决定性指纹（pin、I2）= 影子自有索引 + 含 ctime/inode 的 stat 检查；全新临时索引的完整重哈希只在验收与 seal 执行（ADR-075）。只有 seal 需要进入用户仓库：集成时在**用户仓库**中执行 `git fetch <影子目录> <seal>:refs/heads/<prefix>/<goalId>-<slug>`（先传对象、后更新 ref；M1 不签名，写入的就是 seal，`10` §10.6，ADR-193）；检查点和 pin 只保存在影子中（§6.6.4，R4-D13-08）；卫星与影子的 alternates 都指向 Tower 的 **Project 镜像库** `~/.tower/projects/<projectId>/mirror.git`（ADR-073）；需要新 base 时，以镜像为上下文 `git fetch <userCheckout>`（读用户仓库），base 提交一律由 `baseTip()` 选取（见下，ADR-156）。**Tower 的 git 网络命令**（ADR-155 补记 2、ADR-157；M1：base 的远端 fetch、LFS 获取；M2：推送）：一律在**镜像**中执行，**原样**使用用户主检出中配置的远端 URL（含其中的凭据）并 include 用户的全局与系统配置——与用户自己执行 `git fetch` 相同。远端名规则：base 是 `refs/remotes/<r>/<b>` 时取 `<r>`；否则 `branch.<base>.remote` → `remote.lfsdefault` → 唯一远端 → `origin`（不硬编码 `origin`）。base 的 fetch 以显式 refspec 取入镜像。**macOS 上同用户进程可互相观察**（ADR-158：Seatbelt 无法阻止沙箱内进程读取同用户其他进程的参数；SP6a A12(a) 改为测量并记录结论），因此 M1 在 macOS 上默认执行预案：**URL 中带凭据的远端，Tower 不执行任何网络命令**，记 Fact `remote_credential_blocked{remote}`，显示 `integration` 卡片要求改用 credential helper（“重试”= `project.remote.recheck`）。凭据判定：userinfo 含 `:` 一律视为凭据；只有用户名时，匹配已知 token 形态（`ghp_`、`gho_`、`ghu_`、`ghs_`、`github_pat_`、`glpat-`、`x-access-token`、长度 ≥ 20 的高熵串）也视为凭据，否则视为用户名。Linux S2（M2）以独立 PID 命名空间隔离。ADR-155/156 的 userinfo 剥离、store 文件、写出完整有效配置、`GIT_CONFIG_NOSYSTEM`、按主机与 `insteadOf` 改写已全部撤回（登记于 `16` 废弃表）。M2 推送从镜像以 `<seal 提交>:refs/heads/<seal 分支>` 推送（seal 对象先写入镜像），推送目标按 `branch.<seal 分支>.pushRemote` → `remote.pushDefault` → base 的远端规则选取，推送后在用户仓库配置中写入 `branch.<seal 分支>.remote` 与 `.merge`；pre-push 钩子以 `git hook run --ignore-missing --to-stdin=<文件> pre-push`（git ≥ 2.40，Tower 的最低版本）运行，标准输入中的远端提交取自推送前在镜像中的 `ls-remote`（不存在时为全零）；推送失败（钩子拒绝、网络、认证）→ 记 Fact `push_failed{stage, exitCode?}`，Needs-You kind `integration`（severity 2，去重键 `int:{goalId}`），Goal 保持 `accepted`，合并队列条目进入 `awaiting_push`——**不占用**该 base 的队列，后续条目可继续（ADR-158，M2）；选项：重试推送、只保留分支。**远端 base 的观测时机**（M1，ADR-157，不轮询）：Goal 准备、进入 `in_review` 之前（**不阻塞**：最多等待 10 s，失败或超时记 Fact `base_fetch_failed{remote, error}`，照常进入 `in_review`，ADR-158）、用户在卡片上点“检查 base”、打开 Goal 详情且距上次获取超过 10 分钟时（后两者共用命令 `goal.base.check`），对远端引用 base 执行一次 fetch——按（镜像，引用）合并，同一时刻只有一次，总时限 60 s；进入 `in_review` 只等待前 10 s，其余在后台完成并记录结果；`base_fetch_failed` 的提示保留到下一次成功获取（ADR-159）；之后做 base 前进检测（记 Fact `base_advanced{from, to, count}`，只提示）与 `integrated` 观测。镜像只回收不被任何 ref 可达、且超过宽限期的对象（`10` §10.17.1；`refs/tower-live/<goalId>/*` 与 `refs/tower-retain/<goalId>/<verifyId>` 保持可达），用户仓库中**不再**保留 base 保活 ref。**ADR-071**：GitRunner 的每个 git 子进程都运行在“只允许执行 git”的 OS 沙箱档位中（Seatbelt：`process-exec` 只允许 git、`git-core` 目录，以及需要时的 `git-lfs`；Linux：bwrap + seccomp）；**LFS 补齐**（ADR-150/151/152/153/154，仓库准备的一步，检出之前；**不**经 GitRunner 的 git-only 沙箱）：先从用户主检出的 LFS 对象库以 CoW 复制 base 所需的对象到镜像的 LFS 库；仍缺的对象由 Tower 以**用户身份、在 Agent 沙箱之外**执行一条 `git lfs fetch`，作用对象只有 Tower 的镜像。**端点显式传入**（ADR-152/153）：镜像是裸仓库，其 `HEAD` 指向不存在提交的占位引用 `refs/tower/none`，git-lfs 因此不会从镜像读到任何配置或 `.lfsconfig`。Tower 以 `git show <base>:.lfsconfig` 自行读取，**只取白名单键**——`lfs.url`、`remote.<name>.lfsurl`、`lfs.<url>.access`、`lfs.fetchinclude`、`lfs.fetchexclude`，其余忽略；URL 值只接受 `https://` 与 `ssh://`（含 scp 式 ssh 写法），不合规的值记入诊断日志并忽略，并记 Fact `lfs_config_ignored{keys, reasons}`（来源恒为 base 的 `.lfsconfig`，用户自己的 git 配置不做白名单校验，ADR-155）（获取成功时显示提示“◇ 已忽略 LFS 配置：<键>”；`prepare_failed` 卡片在主因之外也列出“已忽略 <键>（不支持的协议）”，ADR-154 补记）。**按键解析**（与 git-lfs 一致）：对每个键，用户主检出 git 配置中的值覆盖 `.lfsconfig` 中的值；然后端点 = `lfs.url` ?? `remote.<name>.lfsurl` ?? 由远端 URL 推导（键优先，不是来源优先）；远端名与 git-lfs 一致（ADR-154 及补记）：base 是 `refs/remotes/<r>/<b>` 时直接取 `<r>`；否则 `branch.<base>.remote` → `remote.lfsdefault` → 唯一远端 → `origin`。**配置不经命令行与环境传递**（ADR-154）：Tower 在 `~/.tower/tmp/` 下写一个权限 `0600` 的临时配置文件（`[include] path = <用户的全局配置>`、用户主检出中配置的 `remote.<name>.url` 原值、白名单键的有效值，以及在**用户主检出的上下文中**求出的网络认证相关有效配置——`credential.*`、`http.<url>.*` 与无 URL 的 `http.*`、`url.<base>.insteadOf`、`core.sshCommand`——使按目录选择的 `includeIf "gitdir:…"` 配置同样生效（ADR-154 补记、ADR-157），以 `GIT_CONFIG_GLOBAL=<该文件路径>` 运行这条命令；命令结束（含失败、超时）即删除该文件。URL 中的凭据不进入诊断日志与卡片（通用 URL 凭据脱敏模式）；Agent 沙箱拒绝读取 Tower 数据目录，其他 Goal 的 Agent 也读不到该文件。**`fetchinclude`/`fetchexclude`**：“缺失对象”只针对过滤后需要的对象；被排除的文件在**所有检出**中保持指针——卫星、验证槽位、人工编辑检出与检验检出都从同一个镜像 LFS 库按同一组规则物化（与用户自己的检出一致）；记 Fact `lfs_excluded{count}`，不导致 `prepare_failed`；验证可能因此失败（与用户本机相同），验证证据附该 Fact，失败卡片提示“项目配置排除了 N 个 LFS 文件”（ADR-154）。用户的全局与系统 git 配置（含 credential helper、ssh 配置）照常生效；网络**不限制主机**（LFS batch API 的下载地址可能在其他主机）。这条命令的输入只来自用户主检出的配置与 base 提交，Agent 在卫星中的写入不参与，因此 `10` §10.1.2 的加固清单不适用于它（清单中登记此例外，ADR-154 措辞）。**凭据与输出**：Tower 从不接触凭据——凭据只在 git、git-lfs 与用户的 helper（或用户自己写在 URL 中）之间使用，Tower 不截取、不改写（ADR-157）；命令的标准输出与错误输出**只进入 Tower 的诊断日志**（写入前按模式脱敏 URL userinfo 与认证头），从不进入 Agent 的开场或任何 Agent 可读的位置；`prepare_failed` 卡片只显示 Tower 生成的摘要（缺失对象数、HTTP 状态类别）；由白名单校验导致时（例如端点被拒绝后没有可用端点）写“LFS 配置被拒绝：<键>（不支持的协议）”，不写 HTTP 状态类别（ADR-154）。与安装器无关，非 Node 项目同样适用；**pin 安全检查**（ADR-109，取代 ADR-106 的“物化 + 排除”）：唯一的权威检查 `pinSafetyCheck(baseTree, pinTree)` 由 GitService 在影子中执行——`git diff-tree -r --no-renames <baseTree> <pinTree>` 与 `git ls-tree`，只读两个 tree，不物化、不占槽位，同一 pin 结果恒定（毫秒级，与 diff 同量级）。规则（ADR-111/112）：**仓库形态候选目录** = 在 base tree 或 pin tree 中直接含有名字（按 `10` §10.1.2 的名字比较规则（ADR-120））等于 `head`、`commondir`、`gitdir` 的条目（文件或符号链接）的目录，**根目录同样适用**（ADR-116）；base→pin 的任何增、删、改（含模式变化）条目位于候选目录之内或就是该目录 → `sentinel{detector:"nested_repo", dir}`（覆盖标记文件增删改、`config`/`hooks`/alternates 修改、`objects/`/`refs/` 增删、`commondir` 删除等全部变体；名为 `head` 的目录本身不使父目录成为候选）。对 pin 中**全部**符号链接，在 pin tree 内按 POSIX 语义解析整条链（深度上限 40，环或超限视为逃逸；经过 tree 中不存在的路径分量——如被忽略的依赖目录——或名字等价于 `.git` 的分量也视为逃逸，ADR-116），最终为绝对路径或越出仓库根，**并且**它是新增或改变的链接、或在 base 中解析安全、或 base 中的解析结果与 pin 不同（ADR-124 的 base 豁免：base 中原本就不安全且未变的链接不命中，只在信任提示中列出）→ `sentinel{detector:"symlink_escape"}`。命中**不排除、只阻断**（severity 3，pin 推导，阻止 Verified 与集成，pin 不变）。调用点三处：VerifierScheduler 的 `verify()` 第一步（在一切提前返回之前）、`goal.accept`、seal 前（同一 pin tree 复核，防篡改）；属 `13` §13.11.2 “永不降级”。**早期预警**（ADR-101，不作为 Verified 依据）：卫星中名字粗筛（大小写不敏感，`O_NOFOLLOW`）+ 沙箱内 git 确认，每个有变更的回合在检查点时增量执行，S2 下由卫星文件系统监视维护候选集（§6.2.3 I2 行），交还与带回完成后全量执行；只用于运行中提示与两种检出。**两种检出由影子树物化**（被跟踪与未忽略的内容；早期预警确认的目录与 `pinSafetyCheck` 命中且未覆盖的目录不写出；未改动的 base 夹具照常写出，ADR-111；对已覆盖的 `nested_repo` 目录只按白名单写出 pin 版本——`objects/**`（不含 `objects/info/**`）、`refs/**`、`packed-refs`——其余一律写出 base 版本，base 中没有则不写出（ADR-124；配置键高亮清单唯一定义在 `16`）；依赖物化后对依赖目录做同样的名字扫描，命中的目录不写出并列入信任提示；被忽略的依赖目录按需由安装器重建）；不再拒绝接管或检验。**ADR-089**：卫星 gitdir 整体归 Agent，Tower 不读取其中的配置、索引或 ref 作任何判定（控制文件校验与 `git_control_tampered` 已退役）；**ADR-100**：Tower 从不在卫星 gitdir 上运行 git；seal 说明（`10` §10.6，ADR-105/108）需要的提交信息由 Tower 自行只读解析（`HEAD` → ref 文件或 `packed-refs` → loose 对象 zlib 解压或按 `.idx` 定位 pack 中的对象；单对象 ≤ 1 MB、总计 ≤ 200 个提交；不读 config、include、alternates；失败则省略）。**ADR-096**：GitRunner 与 Tower 构造的所有沙箱外 git 环境（Host 及其派生进程、MCP 基础环境、人工编辑检出与检验检出的终端）都经 `GIT_CONFIG_*` 注入 `safe.bareRepository=explicit`；`humanCheckout` 存在期间暂停该 Goal 的自动 rebase 与合并队列（均为 M2，ADR-099/156）。Tower 对卫星及其 gitdir 的原始文件操作只有创建、整体删除、整体重建（含人工编辑检出的文件级写回）、只读解析提交对象四种，一律 `openat`/`O_NOFOLLOW`、只接受普通文件与目录、带超时，重建在旁路目录完成后原子 `rename` | 状态事件、命令 | git Fact | `10`；ADR-060、071–075 |
| **PolicyCompiler** | 合同 + 自主度 + 授予 → `policy.json`（带版本号、原子写入） | 合同、授予 | runDir 文件 | `05` §5.6.5；`11` |
| **MemoryService** | 记忆提议和批准、注入选择 | Claim、人的决定 | `memory.*` | `09` |
| **Timers** | 持久化计时器（存在 `timers` 表，重启后恢复）；睡眠期间暂停 | — | 计时事件 | §6.3 |

### 6.2.3 StateMachine 与不变量

```ts
interface StateMachine {
  /** 纯函数：不做 IO；返回要追加的事件，或带 code 的拒绝 */
  decide(input: SmInput, view: GoalView): { events: TowerEvent[] } | { reject: { code: string; message: string } };
}
type SmInput =
  | { kind: "command"; cmd: Command; actor: string }
  | { kind: "engine"; runId: RunId; ev: TowerEngineEvent }
  | { kind: "fact"; fact: Fact }
  | { kind: "timer"; timer: TimerFired };
```

| 不变量（`03` §3.3） | 运行时执行点 | 持久层兜底 |
|---|---|---|
| I1 只有验收或放弃才能归档 | 转移表写死：`archived` 只能从 `integrated`（⚙️ 宽限期后）、`accepted`（🧑 “验收但不合并”，`goal.accept{integrate:"none"}`，§6.4.3）进入；`abandoned` 是终态 | 触发器 `goals_archive_guard`：`state` 被更新为 `archived` 时，`OLD.state` 必须属于 `('accepted','integrated')` |
| I2 Verified 与 Accepted 都会过期 | `in_review` **以及 `accepted`（尚未 integrated）** 期间，Supervisor 在沙箱外用 FSEvents / inotify 监视卫星（ADR-075），事件触发后用影子自有索引做 stat 检查（`core.trustctime=true`、`core.checkStat=default`，2 万文件无变化时 ≤ 150 ms）；指纹变化即触发判定（这不是 Fact，`16` §16.1.5 的 `Fact.kind` 中没有这一种），按变化来源分界（ADR-128，`03` I2）：来自 Tower 自己的工作（rebase、合并队列）、人的显式采纳（`keep`、交还、`bring_back`）或存活进程（`agent_bg`）→ `verifying`；来源不明 → `paused(external_change)`。全新临时索引的完整重哈希只在验收和 seal 两个闸口各执行一次；评审单元 contentHash 变化 → 重置为 `unseen`。验证再次通过后，按 `03` I2 的“验收延续”判据决定：自动回到 `accepted`（记 `audit.acceptance_carried`），或停在 `in_review`（R1-D15-12） | GitService 对卫星存在的**全部非终态**做 `fs.watch` 监听（R9-D13-01）；**检出完成标记出现之前不监视**该卫星——卫星检出与重试时删除未完成工作目录都是 Tower 自己的写入，因此 `ready` 中“来源不明的写入”只在标记存在时才可能成立（ADR-153）：`in_review`/`accepted` 下事件驱动 I2；`running` 等其他状态下事件只用于维护嵌套仓库早期预警的候选集与 `external_change` 的判定，不触发 I2。**`external_change` 归因**（R10-D6-01）：事件发生时若有工具调用正在执行，或 Tower 跟踪的 Agent 进程树（沙箱 bash 派生的全部进程，含后台的开发服务器与 `--watch` 进程）中仍有进程存活，归因为 Agent；否则在 1 s 去抖后以影子索引 stat 检查确认内容确有变化，才判为 `external_change`。检测到外部写入后的状态处理见 `03` §3.2.1 `external_change` 行（ADR-122/128：任何非 running 状态都先暂停——含检出完成标记存在的 `ready`（ADR-153）：→ `paused(external_change)`，继续目标 `run`，`queued_run` 保留，ADR-147；首次进入 `paused` 时按来源状态写 `continuation`，ADR-134；`verifying` 中取消当前验证）；`bg_process_survived` 未解决期间人在外部编辑器中的保存也会被记为 `author:"agent"`（已知误判 (c)，ADR-128）。已知误差：脱离跟踪的守护进程（双 fork/`setsid` 逃出进程树）的写入会被误判为外部改动（多余的暂停，人以 `goal.external_change.keep` 或 `.revert` 处置，二者自动按恢复规则继续，不需要再 `resume`）；`bg_process_survived` 未解决期间的未归因写入记为 `author:"agent"`，在 `claimed`/`verifying`/`in_review` 中使树 ≠ pin 时按 I2 重新生成 pin 并验证（`verifyOrigin:"agent_bg"`，ADR-122）；Agent 进程存活期间的外部编辑会漏判（之后的检查点归因为 Agent）；Tower 自己写回期间（交还、带回）该 Goal 的事件触发暂停，完成后全量重扫一次；事件合并规则见 `10` §10.6、`13` §13.11。Projector 断言（ADR-128/134，限定为**由指纹变化触发**的转移）：带 `cause:"fingerprint_changed"` 的 `in_review`/`accepted` → `verifying` 必须引用一个已知来源（rebase、合并队列、`keep`/`hand_back`/`bring_back` 决定，或 `agent_bg` 注记）；来源不明的指纹变化只能产生 `goal.external_change.detected`。由人的命令（`retry_verify`、`s0.grant`、修订验收标准）或 `onAllReasonsCleared()` 产生的转移带各自的 `cause`，不受此断言约束 |
| I3 合同不可变 | 修订 = 插入新版本 + 把旧版本标为 `superseded`；`amendmentNote` 必填 | 与 §6.3 DDL 完全一致：触发器 `contracts_immutable`（`ratified` 行只允许改为 `superseded`，正文不变），`contracts_superseded_final`，以及 `CHECK (version = 1 OR status = 'draft' OR amendment_note IS NOT NULL)`（草稿可以先不写修订说明，批准时必须写） |
| I4 claimed 的条件 | 顺序见 §6.1.10（ADR-121）：宽限确认 → 终止并等待 → `agent_bg_done` 检查点 → 判定。**(a) 有效 submit** 以工具事件判定：本 Run 最后一次 `submit` 之后没有变更类工具调用（唯一定义在 `16`，ADR-130；`05` §5.6.2c 只引用），不比较指纹；**(b) pin 的树** = `agent_bg_done` 检查点的树，submit 之后仅由后台进程产生的变化随 pin 一起验证与评审。并且没有**本 Run 产生的、`costOfDelay=agent_blocked` 的 question/approval** 条目（R2-D4-03；`ratify`、非阻断哨兵、`conflict` 等不计入）→ 生成 pin 并进入 `claimed`（同一事务，ADR-137）→ `verifying`。提醒只经 `agent_before_settle` 的常规 nudge（ADR-129：不存在“settle 之后才发现提交无效”的情形，Tower 不以 user 角色注入消息）。`claimed`/`verifying` 期间持续监视 `agent_start`、`compaction_start`、`isStreaming`/`isCompacting`：一旦出现就撤回到 `running` 并取消验证；同一 Goal 1 小时内第 2 次出现时，改为 `paused(post_settle_activity)` + Needs-You（ADR-025） | Projector 断言（只对经 settle 进入的 `claimed`；`claim_on_behalf` 不经 `submit` 与 settle，是 `03` §3.2.1 的例外，ADR-212）：`claimed` 事件引用的 `runs.submit_tool_call_id` 之后，本 Run 没有变更类工具事件（`16` 的定义，含嵌套调用）；pin 的 `tree_sha` 等于该 Run 最近一个 `agent_bg_done` 检查点的 `tree_sha`（撤回到 `running` 后再次 settle 时有两个） |
| I5 单写者 | 只有 StateMachine 能产生 `goal.state_changed`；`EventLog.append` 发现 source≠`harness:sm` 时拒绝 | `events` 上的 `CHECK`：`type='goal.state_changed'` 时 `source='harness'` 且 `producer='sm'` |
| I6 返工有上限 | `counters.reworkCycles` 在 `decide()` 选择返工的那一刻递增（不论随后直接开 Run 还是进入 `ready` 排队；排队中的返工被 `pause`/`abandon` 时不回退，ADR-147）。自动返工前比较 `counters.reworkCycles` 与 `Contract.maxReworkCycles`（默认 3，`16` §16.2；`rework_cycles_over` 已删除，ADR-143）；超出 → `paused(verify_failed_limit)` + Needs-You。是否自动返工先按 `03` §3.2.1 的归因窗口判定（ADR-140/144，见 §6.4.3 表前统一写法）；返工因硬上限不能开始 → `paused(budget_hard_cap)`，继续目标 `run`，返工证据以 `{id, factId}` 入队 | — |
| I7 每个 Goal 最多一个活跃 Run | EngineManager 启动前检查 | 部分唯一索引 `runs_one_active`：`UNIQUE(goal_id) WHERE ended_at IS NULL AND kind='primary'`。Best-of-N 的子 Run 用 `kind='variant'`，各自有独立 worktree |
| I8 依赖无环 | `goal.add_dependency` 时用递归 CTE 检查是否可达 | 同一事务内完成 |

**S0 授权在 `decide()` 中的处理**（ADR-068）：运行阶段的 S0 授权是门禁 ask，不经过 StateMachine 的状态转移（Mode 为 `blocked_guard`）。验证阶段由 `decide()` 处理：S0 且没有 `exec.test`/`exec.build` 授权时 `verifying → paused(s0_grant_pending)`；人授权后以同一 pin 回到 `verifying`；人拒绝（或 `use_defaults` 下超时拒绝）时同样以同一 pin 回到 `verifying`，exec 标准不执行，由 `decide()` 判定 artifact 标准与阻断命中：都没有问题时进入 `in_review`，标“未经机器验证（S0 未授权）”（ADR-031 语法；唯一定义在 `07` §7.10.3 `decide()`，ADR-188）。

转移表本身（`03` §3.2）以数据形式定义（`transitions.ts`）。单元测试对每一对（状态 × 输入）穷举，CI 强制 100% 覆盖。生命周期细节以 `02` §2.4 为准：`ready` 带 `waitReason`，`paused` 带 `pauseReason` 和 `autoResume`。`03` 新增的转移（`accepted → verifying`、`paused → in_review`（覆盖后评审）、`verifying → paused(human_change_verify_failed)`）都在转移表中。

### 6.2.4 EngineManager：槽位调度

```ts
interface EngineManagerConfig {
  maxConcurrentGoals: number;         // 取自 UserSettings（02 §2.14），默认 3，范围 1–10（M1 构建封顶 3，ADR-038）
  perProviderMax?: Record<string, number>;   // 例如 { anthropic: 2 }，用于速率限制
  resourceModel: WholeMachineModel;   // 13 §13.8.3 的整机预留模型（内存与 CPU 预留之和），取代“空闲内存 ≥ 1 GB”
  hostMode: "dedicated" | "packed"; packSize: number;  // 默认 dedicated，K=4；SP2 不达标时 M1 默认改为 packed（§6.1.1）
  portRange: { start: number; end: number; blockSize: number };   // ADR-055：20000–29999，每段 20 个；分配前 bind 探测，冲突就跳到下一段
}
interface EngineManager {
  request(goalId: GoalId, reason: Run["reason"]): void;   // 进入队列
  cancel(goalId: GoalId): void;
  pause(goalId: GoalId, reason: PauseReason): Promise<void>;   // drain 协议（§6.1.4）
  adapterFor(runId: RunId): EngineAdapter;                // 05 §5.2
  snapshot(): { running: RunId[]; queue: QueueEntry[]; backlog: BacklogState };   // 评审积压 H/C/P/F（ADR-014）
}
```

**单一启动点 `startAgentActivity(kind, goalId?)`**（ADR-163/164）：Tower 中启动任何 Agent 活动（`11` §11.7.0 的原则定义）都只经过这一个函数——Run 准入（本节）、Scratch、安装器（含预热，以及检验检出与人工编辑检出的依赖准备）、检验检出的生命周期脚本、检验服务、其他验证槽位的准备与运行；不存在绕过它的启动路径。这是架构约定：M1 中它没有冻结状态（机密阶段的整机冻结与排队归 M2，§6.2 VerifierScheduler）；它唯一的启动闸门（ADR-224）：本次启动的硬链接探测（§6.7 自检）有结果之前，不启动任何使用沙箱的活动——Run 经下方准入的检查 h 等待，验证、安装器、检验检出与人工编辑检出的依赖准备留在各自的队列中（与等待槽位相同，实况行见 `12` §12.6.5 “等待启动自检”），有结果后按结果以 S2 或 S0 启动。

**准入**（每当槽位释放、评审余量变化、依赖满足、收到新请求、本次启动的硬链接探测有结果、某 Goal 的重启清理或 Engine Host 退出或挂死之后的一轮完成（§6.1.6，ADR-227）、资源预留或端口段释放（验证槽位结束、检验服务停止、`inspect.close` 回收端口段），或内存压力刹车回落到 warn 之下时重新计算；探测与终止的一轮两项是检查 h 的解除事件（ADR-225/227），预留、端口段与内存压力三项是检查 d、g 的解除事件——有 Goal 因刹车在 `ready{slot}` 中等待时，Supervisor 每 30 s 读一次内存压力，ADR-226）。**本节是一切要开 Run 的转移的唯一闸口**（ADR-146/147）：自动返工、`request_changes`、`retry_after_human_change`、交还 `continue_agent`、`resume` 与继续目标 `run`——不满足时 Goal 进入 `ready{waitReason}`，写 `goals.queued_run={kind, decisionId?}`（`initial`/`resume`/`rework`/`handback`，与 `Run.reason` 一一对应），`pending_openings` 保留；合同批准进入 `ready` 写 `{kind:"initial"}`，依赖回退进入 `ready` 写 `{kind:"resume"}`（`ready` 中恒非空，DDL CHECK，ADR-148）。准入按 `queued_run.kind` 判定，通过时以它发出 `run.requested{kind}`（`run.requested` 一律在准入通过时发出，§6.4.3 各命令行中的 `run.requested{…}` 都指这一条，未通过时只写 `queued_run`，ADR-179）；`queued_run` 在 **`run.started` 的同一事务**中清除（不是在准入时），`goal.abandon` 时以及 Goal 进入 `ready`/`paused` 以外的任何状态时（例如交还 `reverify` 进入 `verifying`）也清除（ADR-151）；`pause`、`take_over`、`external_change`、`prepare_failed` 保留它（ADR-149；完整的“转移 → `queued_run.kind`”表唯一在 `16`；不经排队直接开 Run 时 `Run.reason` 取同一映射）。**优先规则**（ADR-150）：已保留的 `queued_run` 优先于写入表，写入表只在它为空时适用（`prepare_failed` 后重试的首次启动仍是 `initial`，继续受评审余量闸控）；人的显式决定覆盖保留值——交还 `continue_agent` → `handback`，`request_changes`、`retry_after_human_change` → `rework`；自动路径（继续目标 `run`、`resume`）不覆盖。**准备阶段**（准入已通过、`run.started` 之前；步骤顺序唯一定义在 `10` §10.3.1，ADR-149/150）：准入时写 `goals.preparing_since`，在 `run.started`、中止或失败时清除。**① 仓库准备**（镜像首次建立含跨卷完整复制 → 等待项目锁 → 远端 fetch → LFS 对象补齐 → 卫星 `clone --shared` 与检出含 LFS 内容写出，ADR-151）以 `prepare.repoTimeoutMin`（默认 15 分钟）为限，**不计入** 120 s；失败或超时 → `paused(prepare_failed)`（LFS 时原因写“LFS 对象缺失：<数量>”，不允许 Agent 在指针文件上工作；被 `fetchexclude` 排除的对象不算缺失，记 Fact `lfs_excluded{count}`，ADR-153）；其间 `goal.pause` 允许并中止该步骤（→ `paused(human)`，继续目标 `run`，`queued_run` 保留），`goal.take_over` 返回 `E_BUSY`，`goal.abandon` 允许（ADR-150 补记）。进度以事件 `prepare.progress` 报告（`step: mirror | lock | fetch | lfs | checkout | deps | handshake`）。**② 依赖物化**：**依赖物化不阻止 Run**——安装器失败或超过 `prepare.depsTimeoutMin`（15 分钟）→ 照常进入 `running`，记 Fact `prepare{ok:false}`，Agent 简报附失败日志尾部（注入前经 `11` §11.7 的同一套脱敏，ADR-150）；其间 `goal.pause` 允许并中止物化（→ `paused(human)`，继续目标 `run`，`queued_run` 保留），`goal.take_over` 返回 `E_BUSY`。**③ 120 s 时限**只计 Host 握手与开场组装（ADR-151）；检出以卫星中的**完成标记文件**（`checkout.done`）判定，重试时若卫星存在而标记缺失，删除工作目录后重新检出（gitdir 与影子保留；不触发卫星丢失判定，ADR-152）；**重试从已完成的步骤继续**——各步骤幂等，已存在且校验通过的镜像、LFS 对象与卫星直接复用（ADR-150）；其间 `goal.pause`/`goal.take_over` 返回 `E_BUSY`（“正在启动，稍后重试”）。`goal.abandon` 始终允许——中止准备并进入 `abandoned`。仓库准备（含检出）失败或超时、卫星路径冲突（`10` §10.3.1 步骤 2，卫星记 `broken`）、Host 握手失败、开场组装失败或 120 s 超时 → **`paused(prepare_failed)`**（不是 `engine_crash`），继续目标 `run`，`queued_run` 保留，不在启动时自动解除、不 `autoResume`，Needs-You `stalled{prepare_failed}`（去重键 `st:{goalId}:prepare`；出口：`goal.resume` 重试——路径冲突时先改名重建卫星；`goal.take_over`，仅当检出完成标记存在（ADR-152）；`goal.abandon`）。**准备中途到达其他原因**（外部写入或任何系统暂停原因）：中止准备，以这些原因进入 `paused`（与 `draining_for{target:"pause"}` 相同的合并规则），继续目标 `run`，`queued_run` 保留（ADR-149）。`ready` 中允许 `goal.pause`（→ `paused(human)`，继续目标 `run`）、`goal.take_over`、`goal.abandon`：

```
候选 = 队列中的请求，排序键：
  1. 类别：resume / rework / handback / verify_fix（已在运行的 Goal 的延续）  >  initial（该 Goal 的第一次启动，ADR-148）
  2. Goal.priority（人手动设定的顺序；系统从不自动重排）
  3. 入队时间（先到先得）
对每个候选，依次检查：
  a. 槽位：活跃 Run 数 < maxConcurrentGoals，且 provider 计数 < perProviderMax          → 否则 waitReason = slot
  b. 依赖：dependsOn 全部满足（定义 03 §3.5）                                             → 否则 waitReason = dependency
  c. 评审积压上限（ADR-014，第 1 轮修订）：只对 queued_run.kind = initial（首次启动）生效（ADR-147）。
       H = C − P − F
         C = reviewBacklogLimitLoc（默认 1500，可关）
         P = in_review / accepted 未 integrated 的 Goal 中尚未有效评审的单元 LOC
         F = running Goal 相对 base 的 diffstat（在途）
       默认“提示模式”：H ≤ 0 时照常准入，只在卡片和简报中显示积压与建议
       “阻止模式”（M2，E8 通过后才默认开启；M1 只有提示模式，ADR-191）：H ≤ 0 → 不准入，waitReason = review_capacity，卡片显示“等待评审余量”（L1 chip，不进 Needs-You）
       （M2）人可以单次越过（HumanDecision{kind:"override_capacity"}），只对这一个 Goal 的这一次准入有效
  d. 资源：按 13 §13.8.3 的整机预留模型，准入后各项预留之和不超过机器容量（瞬时空闲内存只作额外刹车）；否则 waitReason = slot，卡片注明“机器资源”
  e. I7：没有活跃的 primary Run
  f. 预算（ADR-140/144）：任何 Run 开始（含自动返工、continuation=run、pendingHandBack.continue_agent）前检查；已达硬上限 → paused(budget_hard_cap)，继续目标 run，不越过上限
  g. 端口（ADR-037）：为这个 Goal 的 worktree 分配一段互不重叠的端口（与验证槽位共用同一个分配器）。项目声明不支持经环境变量配置端口时，同一时刻只允许一个 Goal 或验证槽位运行服务；占用时 waitReason = slot
  h. 启动闸门（ADR-224）：本次启动的硬链接探测已有结果（§6.7），且本 Goal 的重启清理已完成终止的一轮（§6.1.6 “Agent 后台进程”一行；Engine Host 退出或挂死之后的一轮同此，§6.1.3，ADR-226）→ 否则 waitReason = slot，
       卡片注明“等待启动自检”或显示 `清理中 · 残留进程`（12 §12.6.4、§12.6.5）；启动时自动解除与 goal.resume 照常执行，Goal 由此在 ready{slot} 中等待；
       只重启 Supervisor 时探测沿用本次启动的结果（§6.7），Run 所在 Host 存活并重新接上的 Goal 不在重启清理的终止范围（§6.1.6），h 对它们照常满足（ADR-225）
  i. 可写（ADR-233）：该 Goal 的 Project 不因仓库租约只读（§6.1.9），它的必需路径都可访问（§6.1.6 Project 不可达一行，按 Goal 判定，ADR-235/236），且数据库不在 F8 的只读状态（§6.8）→ 租约一项 waitReason = slot，
       卡片注明“该仓库正被另一个 Tower 使用”（Needs-You 见 §6.1.9）；可达一项 waitReason = slot，卡片注明“Project 不可达”；F8 一项不写数据库、不准入，Goal 留在原状态，
       由应用级横幅说明（12 §12.8）——F8 一项在 a 之前先判、命中即短路，a–h 中会写 wait_reason 或暂停原因的检查都不执行（ADR-234）
通过（写 goals.preparing_since）→ 仓库准备（镜像 → 项目锁 → fetch → LFS 补齐 → ensureSatellite：clone --shared 与检出、影子 git 目录、完成标记；prepare.repoTimeoutMin，ADR-150/151）→ PolicyCompiler / BriefingBuilder 写 runDir →（需要启动 Host 时）静态清单计算（`05` §5.10；全局根查询 60 s，出错或超时 → prepare_failed，ADR-215）→ 拼装 Host 环境（变量的完整列表只按 `05` §5.3.6 “Host 环境的变量”，本处不复述，ADR-230/231；模型凭据的注入只按 `11` §11.7.1 模型凭据一行；Host 环境不引用任何 Agent 可写的位置，`16` §16.8 的角色 A 包管理器变量（ADR-045/063，按包管理器主版本生成）与按 ADR-085 构造的 A 的 `PATH` 只进入 `bashEnv`（`05` §5.3.6 唯一定义，ADR-213））→ adapter.start/resume → 事件 run.started（同一事务清除 goals.queued_run，ADR-148）。从“通过”到 run.started 为准备阶段：仓库准备含检出单独计时（失败 → prepare_failed）；依赖物化失败或超时不阻止 Run（Fact prepare{ok:false}）；清单计算、握手与开场总时限 120 s，失败或超时 → paused(prepare_failed)；run.started 同一事务清除 preparing_since，见上文准入段（ADR-149/150）
```

- **没有抢占**：高优先级 Goal 不会让正在运行的 Goal 暂停。是否暂停由人决定，这与“系统从不自动重排”（`02` §2.4 `priority`）一致。
- `ready` 状态下排队的 Goal，Mode 为 `queued`（`08` §8.6.1），卡片显示队列位置和阻塞原因（槽位 / 依赖 / 评审余量 / 内存 / 启动自检 / 残留进程 / 该仓库正被另一个 Tower 使用 / Project 不可达）。
- **验证槽位独立管理**（ADR-042）：槽位数由整机预留模型决定（`13` §13.8.3），每个槽位的内存预留按项目实测：`max(1 GB, 1.3 × 最近 20 次验证进程树峰值 RSS 的 p95)`，首次未知时取 2 GB。参考硬件（16 GB）上为 2 个槽位，实测超出时自动降为 1，并显示该项目的预计排队时间。验证不占用 Run 槽位。数值以 `16` §16.2.3 为准。
- P 由 ReviewService 维护。“有效评审”只是防止点穿的下限：单元停留 ≥ `max(5 s, 1.2 s × loc)`，且所有 hunk 都进入过视口；每个 contentHash 只计一次（ADR-014）。评审一个单元后 P 立即减少，余量随之恢复。F 取自 `diffstat` Fact。`backlog` 投影供 UI 和站会摘要使用。
- **机会式验证**（ADR-020、ADR-042、ADR-053）：以最低优先级对 running Goal 跑一次 exec 标准，把“观测到”提升为“已验证”。同时满足以下条件才运行：正式验证队列为空；有空闲的已预留槽位；整机 CPU 负载 < 70%；该 Goal 指纹稳定 ≥ 120 s、距上次 ≥ 10 min；该 Goal 本小时内 ≤ 6 次、累计 ≤ 50 核分钟。超过上限时间隔依次延长为 10 → 20 → 40 min。正式验证到来时立即让出槽位。`humanCheckout` 存在期间不对该 Goal 运行（ADR-099）。结果计入 V 之前先做 ADR-053 的静态检查。它只占用验证槽位，不占用 Run 槽位，也不进入准入流程。数值以 `16` §16.2.3 为准。

**Run 启动时序**：

```
EngineManager      GitService        BriefingBuilder/PolicyCompiler     main            Engine Host
   │ admit(G)：waitReason 清除，Mode=preparing（02 §2.4）                                       │
   │─ensureSatellite─►│ (10 §10.3.1，幂等)      │                           │                  │
   │◄─────ok──────────│                       │                           │                  │
   │──render runDir──────────────────────────►│ brief/situation/contract/policy/tower-goal.json │
   │◄────────────────────────────────────────│                           │                  │
   │──host.spawn──────────────────────────────────────────────────────►│ fork + ports ───►│
   │──cmd:start(RunSpec)────────────────────────────────────────────────────────────────────►│
   │◄──────────────────────────────────────────────────── evt run.ready, agent.start … ───────│
   │ 事件：run.started；goal.state_changed(ready→running)；Mode=thinking
```

### 6.2.5 Accountant

- **实时**：每条 assistant `msg.end.usage.cost.total` 按 `(goalId, runId, provider, model)` 累加。RPC 的 `message_update` 也带 `usage`（`05` §5.2.2 规则 3），用于实时估算，以 `msg.end` 为准。Pi 的缓存预热请求（沿用你的 `cacheWarming` 设置，`11` §11.7.1）的用量只以 `usage` 条目写入会话（`core/cache-warmer.ts:342-348`），没有 `msg.end`，实时累加看不到，也不归入下文的“自身开销”（如实登记，ADR-235）：settle 之前的出现在下述该次对账的差值中；你把 `cacheWarming` 设为 `idle` 时预热在 settle 之后继续（至多到启动它的请求之后 30 min 或会话 `dispose`，`core/cache-warmer.ts:16-18, 245-257, 286-297`），这部分只在同一会话之后的某次对账中出现，Goal 进入 `in_review` 或终态后不再出现（每次预热要求预计节省至少 US$0.05，`:19-20`；如实登记，ADR-236）。
- **对账**：`agent.settled` 时调用 `getStats()`，得到 `SessionStats.cost` 和 tokens。注意它统计的是**会话文件中所有分支**的用量，包括摘要和工具产生的用量（pi.md §9）。差值记为 Fact `budget{reconcileDeltaUsd}`。
- **预算**：
  - **生效额度**（唯一规则，ADR-197）：当前合同版本的 `Budget`，与该版本批准之后本 Goal 各 `extend_budget` 决定 payload 中同名字段，取最大值。`budget.extend` 把提高后的额度写入该决定的 payload（`Budget` 的字段名；`minutes` 同时加到两项时钟额度上），与 `payload.grant` 同形：决定不可变，不新增列。修订合同产生新版本后，以新版本为准。**并入在命令层完成**（ADR-199）：`contract.amend` 在服务端生成新版本时，`Budget` 中 `patch` 未给出的字段取提交时的生效额度，此前的扩展因此并入新版本的合同值，不因修订而失效——“改为 human 标准”等由界面直接生成、不含预算字段的修订同样如此；`patch` 给出的字段以其值为准。`patch` 含预算字段时命令须带 `budgetBase`（客户端预填所依据的生效额度）；它与提交时的生效额度不同（期间批准了新的扩展）→ `E_CONFLICT`，客户端以新的生效额度重新预填，由人确认后重试。修订编辑器的 `Budget` 各字段预填修订前的生效额度，只是显示。`16` §16.5 判定预算字段的“降低 / 提高”时以修订前的生效额度为比较对象：与之相同不算提高，低于它即显式降低，远程规则照 §16.5（ADR-198/199）。下文的软、硬上限都指生效额度。
  - `usdSoft`、`wallClockSoftMin`（扣除睡眠时间）**跨越**（本次累加之前低于生效软上限、之后不低于）→ Mode `budget_capped` → 走 drain 协议 → `paused{pauseReason:"budget_soft_cap"}`，并生成 Needs-You `budget`（severity 2）。按跨越而不是按“超出”触发，因此直接 `resume` 即越过软上限一次，同一额度下不再触发；`budget.extend` 提高软上限后再次跨越才触发（ADR-197）。
  - `usdHard`（或 `wallClockHardMin`）超出 → 同样走 drain，`paused{pauseReason:"budget_hard_cap"}`，没有“继续”选项。出口（`03` §3.2.1）：`budget.extend`（只提高额度）后 `resume`；或 `claim_on_behalf`（按当前状态送去验证，验证不消耗 LLM 预算）；或 `abandon`。
- **自身开销**：验证器的计算时间、压缩和分支摘要的 LLM 用量都单独列出，归为 Tower 自身的开销，不算作 Agent 的花费。

---

## 6.3 持久化：`node:sqlite` DDL

连接参数（Supervisor 启动时设置）：

连接参数与写入路径以 `13` §13.9.2–13.9.3 为准，这里只列出本文依赖的部分：

```sql
PRAGMA journal_mode = WAL;
PRAGMA synchronous = NORMAL;          -- 人的决定和 audit.* 事件提交时临时切到 FULL（13 §13.9.3）
PRAGMA foreign_keys = ON;
PRAGMA busy_timeout = 5000;
PRAGMA wal_autocheckpoint = 0;        -- 由空闲定时器每 30 s 执行 PASSIVE 检查点（13 §13.9.3）
PRAGMA temp_store = MEMORY;
PRAGMA mmap_size = 268435456;
PRAGMA auto_vacuum = INCREMENTAL;     -- 建库时设置；清除和分层保留之后执行 incremental_vacuum
```

**组提交**（`13` §13.9.3）：普通事件每 50 ms 或每 256 条在一个事务中提交。注意力相关的事件和人的决定立即单独提交，并使用 `synchronous=FULL`。我们只接受“断电时可能丢失最近 ≤ 50 ms 的 Harness 事件”，**不接受**丢失人的决定。

```sql
-- ───────────── 元数据 ─────────────
CREATE TABLE meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
-- schema_version, created_at, install_id, last_clean_shutdown

-- ───────────── 事件日志（唯一真相；02 §2.13、ADR-005）─────────────
CREATE TABLE payloads (                           -- 载荷单独存放，可以按隐私要求删除（墓碑化）
  id    INTEGER PRIMARY KEY,
  data  TEXT NOT NULL CHECK (json_valid(data)),   -- ≤ 16 KB（13 §13.9.1）
  bytes INTEGER NOT NULL
) STRICT;

CREATE TABLE events (
  seq             INTEGER PRIMARY KEY,            -- 全局单调递增（rowid 别名）
  v               INTEGER NOT NULL DEFAULT 1,     -- 事件模式版本（用于 upcaster）
  idempotency_key TEXT UNIQUE,                    -- 例如 'eng:<hostId>:<epoch>:<hostSeq>'、'cmd:<cmdId>'、'pi:<sessionId>:<entryId>'
  ts              INTEGER NOT NULL,               -- epoch ms（13 §13.9.2）
  goal_id         TEXT,
  run_id          TEXT,
  source          TEXT NOT NULL CHECK (source IN ('engine','harness','human','agent_tool','system')),
  producer        TEXT NOT NULL,                  -- sm|observer|verifier|sentinel|detector|radar|accountant|router|git|engine|prepare|ui|timer|retention（prepare：PrepareService，ADR-152；这是事件的产生者，不同于 facts.producer）
  type            TEXT NOT NULL,                  -- 例如 'goal.state_changed'
  payload_ref     INTEGER REFERENCES payloads(id),-- 墓碑化之后为 NULL
  payload_hash    BLOB NOT NULL,                  -- sha256(canonicalJSON(payload))；清除之后保留
  caused_by       INTEGER,                        -- 软引用，不设外键：分层保留会删除 engine.* 事件，保留下来的事件可能指向已删除的 seq（R1-D6-01）；查询时视为“已压缩”
  actor           TEXT,                           -- 🧑 命令的执行者（ADR-013 预留）
  prev_hash       BLOB,                           -- 只有 audit.* 事件才有：sha256(prev_hash ‖ canonicalJSON(元数据 + payload_hash))（11 §11.11）
  tombstone       TEXT CHECK (tombstone IS NULL OR json_valid(tombstone)),   -- {reason, at, by}
  CHECK (type <> 'goal.state_changed' OR (source = 'harness' AND producer = 'sm')),   -- I5
  CHECK ((payload_ref IS NULL) = (tombstone IS NOT NULL))
) STRICT;
CREATE INDEX events_goal_seq ON events(goal_id, seq) WHERE goal_id IS NOT NULL;
-- 本文新增的事件类型（登记于 16；全部事件类型的索引见 16 §16.1.14，本节仍是定义处，ADR-179）：goal.continuation.set{continuation, by:'enter_paused'|'decision', decisionId?}（producer=sm，ADR-134）、
--   prepare.progress{step:'mirror'|'lock'|'fetch'|'lfs'|'checkout'|'deps'|'handshake', done, total, bytes?}（producer=prepare，即 Supervisor 的 PrepareService，ADR-152；只用于卡片进度，不参与状态判定）、
--   goal.external_change.detected{paths, mixedPaths, baselineCps?}（producer=detector；重复检测只并入路径）、
--   goal.external_change.resolved{how:'keep'|'revert'|'take_human'|'obsolete', decisionId?}（producer=sm）（ADR-128）；agent_proc.kill_requested{by:'human'}（process.terminate_again）。agent_proc.tracked/gone 已随 ADR-142 删除；
--   project.local_file_secret_detected{projectId, path}（source=system，producer=sm；复制前的重新判定中内容命中 secret_by 为 NULL 的条目时记录，同一事务写 project_local_files.secret_by='content'；不可读或不存在时不记录，ADR-170/171）、
--   project.local_file_unmark_reverted{projectId, path}（source=system，producer=sm；复制前的重新判定中已取消标记的条目内容哈希变化且再次命中机密模式时，与清除 project_local_files.unmarked 同一事务记录，并发 L1 通知，ADR-172）
CREATE INDEX events_run_seq  ON events(run_id, seq)  WHERE run_id IS NOT NULL;
CREATE INDEX events_type_seq ON events(type, seq);
CREATE TRIGGER events_append_only BEFORE UPDATE ON events
WHEN NOT (OLD.payload_ref IS NOT NULL AND NEW.payload_ref IS NULL AND NEW.tombstone IS NOT NULL
          AND NEW.seq = OLD.seq AND NEW.type = OLD.type AND NEW.payload_hash = OLD.payload_hash
          AND NEW.prev_hash IS OLD.prev_hash)
BEGIN SELECT RAISE(ABORT, 'events are append-only; only tombstoning is allowed'); END;

-- 删除只允许分层保留任务执行（ADR-005，R1-D6-02）：同一事务内先写入 retention_guard，再删除，最后清空 guard
CREATE TABLE retention_guard (token TEXT PRIMARY KEY, goal_id TEXT NOT NULL, created_at INTEGER NOT NULL) STRICT;
CREATE TRIGGER events_delete_guard BEFORE DELETE ON events
WHEN NOT (
  OLD.type GLOB 'engine.*'
  AND EXISTS (SELECT 1 FROM retention_guard g WHERE g.goal_id = OLD.goal_id)
  AND EXISTS (SELECT 1 FROM goals WHERE id = OLD.goal_id AND (
        (state = 'archived'  AND archived_at  <= strftime('%Y-%m-%dT%H:%M:%fZ','now','-30 days'))
     OR (state = 'abandoned' AND abandoned_at <= strftime('%Y-%m-%dT%H:%M:%fZ','now','-30 days'))))   -- ADR-057
)
BEGIN SELECT RAISE(ABORT, 'events can only be deleted by retention of archived/abandoned goals (engine.* after 30 days)'); END;

-- ───────────── 项目与 Goal ─────────────
CREATE TABLE projects (
  id TEXT PRIMARY KEY,                            -- P-…；= hash(canonical_root)，拆分出的项目为 hash(canonical_root, disambiguator)（ADR-028、ADR-080、ADR-087）
  canonical_root TEXT NOT NULL,                   -- 首次绑定时确定后固定（ADR-058）；浅克隆时为 'provisional:<normalizedRemote>'
  disambiguator TEXT,                             -- ADR-080/087：拆分出的项目的消歧键（首次绑定时名为 origin 的远端；无则字典序最小的远端；无远端则 uuid）；id = hash(canonical_root, disambiguator)
  root_aliases TEXT NOT NULL DEFAULT '[]',        -- 之后新增的根提交，只作别名（02 §2.3 rootAliases）；自动合并只认相同的 canonical_root（ADR-069）
  remotes TEXT NOT NULL DEFAULT '[]',             -- 别名，不参与身份（ADR-028）
  display_name TEXT NOT NULL, default_base_ref TEXT NOT NULL DEFAULT 'origin/main',
  verify_profile TEXT CHECK (verify_profile IS NULL OR json_valid(verify_profile)),
  -- 与 02 §2.3 Project.trust 同形（R1-D15-05）；有效信任还要求 .pi/**、.agents/** 相对 baseCommit 未改动（ADR-004）；M1 中它只决定是否传入项目的声明性资源，Pi 的项目信任恒为假（11 §11.8.1，ADR-202）
  trust_state TEXT NOT NULL DEFAULT 'untrusted' CHECK (trust_state IN ('trusted','untrusted')),
  trust_decided_at TEXT,                          -- NULL = 尚未询问（首次绑定时询问）
  trust_resources_seen TEXT NOT NULL DEFAULT '[]',-- 决定时看到的 .pi/**、.agents/** 资源哈希清单；变化则重新询问
  worktree_root TEXT,                             -- 覆盖默认 <checkoutParent>/.tower-wt.noindex（ADR-008）
  settings TEXT NOT NULL DEFAULT '{}'             -- 含 02 §2.3 的 branchPrefix（默认 "tower"）、keepAuditLandmarks（默认 false）、defaultCheckout、relocatedFrom（§6.4.3 project.relocate，ADR-237）；
);
CREATE TABLE project_checkouts (project_id TEXT NOT NULL REFERENCES projects(id), path TEXT NOT NULL,
  last_seen_at TEXT NOT NULL, PRIMARY KEY (project_id, path));

CREATE TABLE goals (
  id TEXT PRIMARY KEY,                            -- G-0142
  title TEXT NOT NULL,
  state TEXT NOT NULL CHECK (state IN ('draft','shaping','ready','running','paused','claimed','verifying',
                                       'in_review','accepted','integrated','archived','abandoned')),
  mode TEXT,                                      -- 08 §8.6.2 的派生缓存（含 preparing / verifying，02 §2.4）
  wait_reason TEXT CHECK (wait_reason IN ('slot','dependency','review_capacity')),          -- state=ready
  shaping_issue TEXT CHECK (shaping_issue IN ('no_proposal','crashed','budget','unresponsive')),     -- state=shaping（02 §2.4 Goal.shapingIssue）
  pause_reason TEXT CHECK (pause_reason IN ('human','budget_soft_cap','budget_hard_cap','stop_condition','idle_without_submit',
    'question_timeout','verify_failed_limit','sentinel_high','human_change_verify_failed','app_quit','engine_crash',
    'satellite_missing','verify_env_error','s0_grant_pending','post_settle_activity','external_change','provider_unavailable',
    'prepare_failed','stalled_timeout')),   -- prepare_failed：ADR-149；stalled_timeout：ADR-183
    -- state=paused；与 02 §2.4 / 16 §16.1.1 一致
  auto_resume INTEGER NOT NULL DEFAULT 0,
  continuation TEXT CHECK (continuation IS NULL OR json_valid(continuation)),   -- ADR-134/140：02 Continuation，纯目标：{kind:'run'} · {kind:'settle'} · {kind:'claim', decisionId} · {kind:'verify', pin} · {kind:'review', state, pin} · {kind:'verify_new', returnTo?}；首次进入 paused 时写入，只由显式决定改写；事件 goal.continuation.set
  pending_openings TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(pending_openings)),   -- ADR-140/144：OpeningRef[]（{id, decisionId} | {id, factId}，id 入队时分配）；自带开场的决定与返工证据按序追加，可逐条撤回（goal.openings.withdraw），下一次任何 Run 开始时消费组装进开场的条目（run.started.openingIds；之后追加的留给下一个 Run，时序唯一定义在 §6.4.3，ADR-184；pendingHandBack 不清空它）
  takeover_prior_reasons TEXT CHECK (takeover_prior_reasons IS NULL OR json_valid(takeover_prior_reasons)),   -- ADR-140：take_over 时的原因集合；discard_human_edits 只读它与 takeover_from
  satellite_rebuilding INTEGER NOT NULL DEFAULT 0,  -- ADR-084：叠加态，后台重建卫星，不改 state 与 pause_reason
  also_applies TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(also_applies)),   -- ADR-084：被更高原因覆盖、仍成立的常规暂停原因
  verify_from TEXT,                               -- ADR-084：当前或最近一次验证的 verifyFrom（验收延续据此判定）
  stop_condition_silences TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(stop_condition_silences)),   -- ADR-139：02 Goal.stopConditionSilences [{conditionId, scope:'run'|'until_amend', object?, …}]；scope=run 的条目绑定到“继续”之后开始的那个 Run（run_id 在该 Run 启动时填入），该 Run 结束时清除（ADR-143 补记），until_amend 的条目在 contract.amend 时清除；每次写入后重新编译 policy.json 的 stop[].silenced 与省略项
  draining_for TEXT CHECK (draining_for IS NULL OR json_valid(draining_for)),   -- ADR-141：02 Goal.drainingFor {target:'pause'|'take_over'|'rewind'|'dependency', reasons:PauseReason[], decisionIds, requestedAt}；drain 开始的同一事务写入，期间到达的暂停请求只并入 reasons
  external_change TEXT CHECK (external_change IS NULL OR json_valid(external_change)),   -- ADR-128/134：02 Goal.externalChange {paths, mixedPaths, baselineCps, detections:[{at, paths}]}（detectedIn 已废弃，去向由 continuation 决定）；由 goal.external_change.detected/.resolved 投影；重复检测并入 paths，基线保持首次值
  human_checkout TEXT CHECK (human_checkout IS NULL OR json_valid(human_checkout)),   -- ADR-094/099：{path, baseTree, createdAt, syncState:'idle'|'syncing', written?:string[], targetTree?, rebuiltTree?, params?:{mode?, note?, sealNote?, externalResolution?, resolvePinHits?}}（02 Goal.humanCheckout；rebuiltTree = 接管期间重建卫星所用的树，交还第 6 步的比较基准，ADR-178；targetTree = 写回目标树 T1，params = 交还或带回的参数，二者与 syncState='syncing' 同一事务写入，崩溃续写的唯一来源，ADR-176/178）；非空时 goal.resume 返回 E_STATE；syncing 的恢复见 §6.1.6
  takeover_from TEXT CHECK (takeover_from IN ('ready','running','paused','in_review','accepted')),   -- ADR-094/147：02 Goal.takeoverFrom
  base_choice TEXT CHECK (base_choice IS NULL OR json_valid(base_choice)),   -- ADR-159：goal.base.choose 的持久化 {side, towerTip, userTip, at}；同一对分叉提交仍存在时 baseTip() 返回所选一侧，任一侧变化即失效
  preparing_since TEXT,                           -- ADR-150：02 Goal.preparingSince；准入时写入，run.started / 中止 / 失败时清除（§6.8 F8 的中止除外，ADR-233）；启动恢复的判据
  queued_run TEXT CHECK (queued_run IS NULL OR json_valid(queued_run)),   -- ADR-147：02 Goal.queuedRun {kind:'initial'|'resume'|'rework'|'handback', decisionId?}；要开 Run 的转移因准入失败进入 ready 时写入，准入通过时以它发 run.requested{kind}；在 run.started 的同一事务中清除，abandon 时及进入 ready/paused 以外的任何状态时也清除；pause、take_over、external_change、prepare_failed 保留（ADR-148/149/151）
  pending_hand_back TEXT CHECK (pending_hand_back IS NULL OR json_valid(pending_hand_back)),   -- ADR-104/108/134：{mode:'continue_agent'|'reverify', at, decisionId, returnTo?}（returnTo：交还时在清除 takeover_from 之前取得，ADR-213）；onAllReasonsCleared() 第 1 步优先于 continuation 执行；take_external 时不写；意图文本取自 decisionId 指向的 human.decision{hand_back} 的 note
  s0_grant TEXT NOT NULL DEFAULT 'none' CHECK (s0_grant IN ('none','pending','granted','denied','denied_timeout')),   -- ADR-077
  s0_grant_expires_on TEXT CHECK (s0_grant_expires_on IS NULL OR s0_grant_expires_on IN ('run_end','next_run_start')),   -- ADR-179：02 Goal.s0GrantExpiresOn；远程批准的 S0 授权按事件失效（11 §11.9）；run.ended / run.started 的同一事务中把 s0_grant 置回 'none' 并清除本列（启动恢复把未结束的 Run 判为结束时同样按 run_end 处理，§6.1.6，ADR-180）；本机批准为 NULL
  verify_origin TEXT CHECK (verify_origin IN ('agent_submit','human_change','rebase','merge_queue','manual','opportunistic','agent_bg')),   -- 02 §2.4；ADR-140 起只作说明，不决定失败去向
  integration_reverted_seal TEXT,                 -- ADR-176：02 Goal.integrationRevertedSeal；goal.undo_integrate 与回到 accepted 同一事务写入被撤销的 seal；该 seal 不再触发 integrated（10 §10.12 的唯一条件）
  kind TEXT NOT NULL CHECK (kind IN ('code','investigation','docs','ops')),
  risk_tier TEXT NOT NULL CHECK (risk_tier IN ('low','standard','high')),
  priority REAL NOT NULL,                         -- 人手动排序；用分数便于插入
  parent_id TEXT REFERENCES goals(id),
  contract_version INTEGER,                       -- 当前生效版本
  owner TEXT NOT NULL, labels TEXT NOT NULL DEFAULT '[]',
  counters TEXT NOT NULL DEFAULT '{"reworkCycles":0,"interrupts":0,"costUsd":0,"tokens":0,"wallClockMs":0}',
  engine_prefs TEXT NOT NULL DEFAULT '{}',        -- adapter、model、thinking、resources（05 §5.10）
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
  archived_at TEXT, abandoned_at TEXT, abandon_reason TEXT, resurrected_from TEXT REFERENCES goals(id),
  last_seq INTEGER NOT NULL,                      -- 最近一次影响本 Goal 的事件
  CHECK ((continuation IS NULL) = (state <> 'paused')),
  CHECK (draining_for IS NULL OR state = 'running'),
  CHECK (state <> 'ready' OR queued_run IS NOT NULL),   -- ADR-148：ready 中排队类别恒非空   -- ADR-134：paused 必有继续目标；离开 paused 时由 onAllReasonsCleared() 清除
  CHECK (human_checkout IS NULL OR (state = 'paused' AND pause_reason = 'human')
         OR (state IN ('in_review','accepted') AND json_extract(human_checkout, '$.syncState') = 'syncing')),   -- 后者：inspect.bring_back 的写回已开始而未完成（本进程中进行中，或崩溃后、§6.8 F8 只读期间与 Project 不可达期间待续写，§6.1.6；失败时不留下 syncing，ADR-105/220/234/235）
  CHECK (pending_hand_back IS NULL OR state = 'paused'),
  CHECK ((external_change IS NULL) = NOT (COALESCE(pause_reason, '') = 'external_change' OR instr(also_applies, '"external_change"') > 0
         OR instr(COALESCE(json_extract(draining_for, '$.reasons'), '[]'), '"external_change"') > 0)),   -- ADR-128/141：运行中检测到外部写入时 drain 开始即持久化
  -- takeover_from：随 take_over 写入；hand_back、discard_human_edits、goal.resume 时清除，再次 take_over 时覆盖。人工编辑检出丢失（§6.1.6）时保留，供 discard_human_edits 判断去向；丢失后的再次 take_over 不覆盖（§6.4.3，ADR-212）
);
CREATE INDEX goals_state ON goals(state);
CREATE TRIGGER goals_archive_guard BEFORE UPDATE OF state ON goals
WHEN NEW.state = 'archived' AND OLD.state NOT IN ('accepted','integrated')
BEGIN SELECT RAISE(ABORT, 'I1: archived only from accepted/integrated'); END;

CREATE TABLE goal_deps (goal_id TEXT NOT NULL REFERENCES goals(id), depends_on TEXT NOT NULL REFERENCES goals(id),
  PRIMARY KEY (goal_id, depends_on), CHECK (goal_id <> depends_on));

CREATE TABLE contracts (
  goal_id TEXT NOT NULL REFERENCES goals(id), version INTEGER NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('draft','ratified','superseded')),
  body TEXT NOT NULL CHECK (json_valid(body)),    -- 02 §2.5 Contract 全文
  drafted_by TEXT NOT NULL CHECK (drafted_by IN ('human','agent')),
  ratified_by TEXT, ratified_at TEXT, amendment_note TEXT,
  PRIMARY KEY (goal_id, version),
  CHECK (version = 1 OR status = 'draft' OR amendment_note IS NOT NULL)          -- I3
);
CREATE TRIGGER contracts_immutable BEFORE UPDATE ON contracts
WHEN OLD.status = 'ratified' AND NOT (NEW.status = 'superseded' AND NEW.body = OLD.body)
BEGIN SELECT RAISE(ABORT, 'I3: ratified contract is immutable'); END;
CREATE TRIGGER contracts_superseded_final BEFORE UPDATE ON contracts WHEN OLD.status = 'superseded'
BEGIN SELECT RAISE(ABORT, 'I3: superseded contract is final'); END;

CREATE TABLE bindings (
  goal_id TEXT NOT NULL REFERENCES goals(id), project_id TEXT NOT NULL REFERENCES projects(id),
  base_ref TEXT NOT NULL, base_commit TEXT NOT NULL, branch TEXT NOT NULL,
  worktree_path TEXT,                             -- 卫星克隆路径（ADR-060）
  head_commit TEXT, fingerprint TEXT,
  attach_checkout_path TEXT NOT NULL,             -- 02 §2.4 WorkspaceBinding.attach.checkoutPath（用户主检出，对 Agent 只读）
  attach_common_dir TEXT NOT NULL,                -- attach.commonDir（卫星经 alternates 只读引用其对象库）
  satellite INTEGER NOT NULL DEFAULT 1 CHECK (satellite = 1),   -- ADR-060：工作目录一律是卫星克隆
  shadow_git_dir TEXT NOT NULL,                   -- ~/.tower/goals/<goalId>/git/<projectId>.git（Tower 的影子 git 目录）
  port_base INTEGER,                              -- ADR-037 分配的端口段起点
  bound_seq INTEGER NOT NULL,                     -- 02 Binding.boundSeq（ADR-146）：Goal 绑定该仓库时的事件序号，固定不变，不随 rebase 移动；归因窗口的下界（按仓库分别计算）
  PRIMARY KEY (goal_id, project_id)
);

-- ───────────── Run ─────────────
CREATE TABLE runs (
  id TEXT PRIMARY KEY,                            -- R-<ULID>
  goal_id TEXT NOT NULL REFERENCES goals(id),
  kind TEXT NOT NULL DEFAULT 'primary' CHECK (kind IN ('primary','variant','scratch')),   -- variant = Best-of-N（I7 例外）
  reason TEXT NOT NULL CHECK (reason IN ('shaping','initial','rework','resume','handback','handoff','verify_fix','scratch_promote','review')),   -- handback：ADR-148，与 queued_run.kind 一一对应
  attempt_n INTEGER NOT NULL, attempt_branch_from_entry TEXT, attempt_label TEXT,   -- 02 §2.6 Run.attempt（ADR-015）
  adapter TEXT NOT NULL, engine_version TEXT NOT NULL, model TEXT, thinking TEXT,
  session_id TEXT NOT NULL REFERENCES sessions(id),   -- Run:Session = N:1（05 §5.8，R1-D4-12）
  first_entry_id TEXT, last_entry_id TEXT,        -- 本 Run 在会话树上的区间（用于在 Trace 中切出这个 Run）
  parent_run_id TEXT REFERENCES runs(id), handoff TEXT CHECK (handoff IS NULL OR json_valid(handoff)),
  host_id TEXT, host_epoch INTEGER, last_host_seq INTEGER NOT NULL DEFAULT 0,  -- Host 事件重放游标
  phase TEXT NOT NULL DEFAULT 'running' CHECK (phase IN ('running','settling')),   -- ADR-145/146：settle 序列开始时同一事务写 'settling'；宽限失败或 claimed/verifying 中撤回时同一事务写回 'running'；恢复表据此区分 settle 中崩溃与 Run 中崩溃
  process_token TEXT NOT NULL,                    -- ADR-142：TOWER_RUN_TOKEN（128 位随机），后台进程识别的唯一持久化依据（§6.1.10）
  started_at TEXT NOT NULL, ended_at TEXT,
  outcome TEXT CHECK (outcome IN ('settled','aborted','crashed','budget_stopped','superseded')),
  outcome_reason TEXT,                            -- 02 §2.6，例如 submit_effective / idle_without_submit / human_abort / app_quit / host_oom / disk_full（§6.8 F8）/ project_unreachable（§6.1.6，ADR-235）
  submit_tool_call_id TEXT, submit_fingerprint TEXT, submit_at TEXT,   -- 02 §2.6 Run.submit；I4 以工具事件判定，fingerprint 只作信息（ADR-121）
  usd REAL NOT NULL DEFAULT 0, tokens INTEGER NOT NULL DEFAULT 0
);
CREATE UNIQUE INDEX runs_one_active ON runs(goal_id) WHERE ended_at IS NULL AND kind = 'primary';   -- I7

CREATE TABLE sessions (                           -- Pi 会话文件；多个 Run 共享一个（N:1）
  id TEXT PRIMARY KEY,                            -- Pi sessionId
  goal_id TEXT NOT NULL REFERENCES goals(id),
  path TEXT,                                      -- Pi 在第一条消息之前不创建文件（05 §5.9 G19）
  parent_session_id TEXT REFERENCES sessions(id), -- 交接或 fork 的 parentSession（ADR-015）
  origin TEXT NOT NULL CHECK (origin IN ('new','handoff','fork','variant','scratch')),
  last_entry_id TEXT,                             -- Pi JSONL 对账游标（按会话，不按 Run）
  created_at TEXT NOT NULL, purged_at TEXT        -- 隐私清除时整份删除文件（02 §2.13）
);
CREATE INDEX sessions_goal ON sessions(goal_id);
CREATE INDEX runs_goal ON runs(goal_id, started_at);

CREATE TABLE checkpoints (                        -- 10 §10.7；与 Pi 条目一一映射（ADR-015）
  goal_id TEXT NOT NULL, project_id TEXT NOT NULL REFERENCES projects(id),   -- 多仓库 Goal：每个仓库独立编号（10 §10.13）
  n INTEGER NOT NULL, run_id TEXT REFERENCES runs(id),   -- 可空：safety 与人工交还的检查点不属于任何 Run
  author TEXT NOT NULL DEFAULT 'agent' CHECK (author IN ('agent','human')),   -- 10 §10.7.1 Checkpoint.author（ADR-036/081）
  session_id TEXT, pi_entry_id TEXT, commit_sha TEXT NOT NULL, tree_sha TEXT NOT NULL,   -- 影子目录中的提交与树（ADR-060）
  satellite_head TEXT,                            -- 卫星 HEAD，信息性（10 §10.7.1 Checkpoint.satelliteHead）
  in_user_repo INTEGER NOT NULL DEFAULT 0,        -- 是否已 fetch 进用户仓库（Checkpoint.inUserRepo）
  landmarks TEXT NOT NULL DEFAULT '[]', taken_at TEXT NOT NULL, duration_ms INTEGER,
  excluded_paths TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(excluded_paths)),   -- ADR-131：影子 add 被 core.protectHFS/NTFS 拒绝后以 :(exclude) 排除的路径
  external_paths TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(external_paths)),   -- 10 §10.7.1 Checkpoint.externalPaths（ADR-122/128）：逐路径记 author:'external' 的路径（drain 期间、keep_both）
  mixed_paths TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(mixed_paths)),   -- Checkpoint.mixedPaths（ADR-128/135）：同一路径既有 Agent 工具写入又有外部写入，或移出本地文件清单后首次收入快照（10 §10.7.1 第 1 步；pin 时记在 pin 之前的 safety 检查点上，ADR-208/209）；评审单元显示 author:'mixed'
  human_paths TEXT CHECK (human_paths IS NULL OR json_valid(human_paths)),   -- Checkpoint.humanPaths（ADR-184）：只在 human_edit 检查点上写，归为人的路径；作者推导只对其中的路径取 author（10 §10.7.1）
  unusable INTEGER NOT NULL DEFAULT 0,            -- Checkpoint.unusable（ADR-184）：情形 G 中对象补不回时置 1，投影自 workspace.recovered{case:"G", unusableCheckpoints}（ADR-185）；重建来源跳过它（10 §10.16.2）
  PRIMARY KEY (goal_id, project_id, n)
);
CREATE INDEX checkpoints_entry ON checkpoints(session_id, pi_entry_id);
-- landmarks 是 JSON 数组；取值与 10 §10.7.1 Checkpoint.landmarks 联合类型一致（ADR-114/118 增加 agent_bg_done、external_change_kept；16 登记）
CREATE TRIGGER checkpoints_landmark_guard BEFORE INSERT ON checkpoints
WHEN NOT json_valid(NEW.landmarks) OR EXISTS (SELECT 1 FROM json_each(NEW.landmarks) WHERE value NOT IN
  ('submit','verify_pass','verify_fail','criteria_flip','rework_start','human_edit','safety','agent_bg_done','external_change_kept',
   'rebase'))   -- rebase：M2，合并队列 rebase 写入的检查点
BEGIN SELECT RAISE(ABORT, 'invalid checkpoint landmark'); END;


-- ───────────── 账本：Fact / Claim / Decision ─────────────
CREATE TABLE facts (
  id TEXT PRIMARY KEY, goal_id TEXT REFERENCES goals(id), run_id TEXT REFERENCES runs(id),   -- goal_id 可空（ADR-159）
  project_id TEXT REFERENCES projects(id),        -- 项目级 Fact（如 remote_credential_blocked）带 project_id
  kind TEXT NOT NULL, data TEXT NOT NULL CHECK (json_valid(data)),   -- Fact.kind 取值以 02 §2.7 / 16 为准（例如 prepare、lfs_excluded{count}，ADR-153；base_advanced、base_diverged{towerFetchedAt, userObservedAt}、base_unchanged_nonancestor{from, to}、remote_credential_blocked{remote}、base_fetch_failed{remote, error}、push_failed{stage, exitCode?}（M2），ADR-157/158）
  at_commit TEXT, workspace_fp TEXT, computed_at TEXT NOT NULL,
  producer TEXT NOT NULL CHECK (producer IN ('observer','verifier','sentinel','detector','radar','accountant','git','policy','engine')),   -- 与 02 §2.7 一致
  track TEXT NOT NULL CHECK (track IN ('verified','observed')),   -- 02 §2.7、ADR-020/024：observed = 经 Pi 扩展链转述，永不单独着绿
  evidence TEXT NOT NULL DEFAULT '[]', superseded_by TEXT REFERENCES facts(id),
  seq INTEGER NOT NULL,                           -- 软引用 events.seq（fact.recorded 事件永久保留，见 §6.6.4）
  CHECK (goal_id IS NOT NULL OR project_id IS NOT NULL)   -- ADR-159：每条 Fact 至少属于一个 Goal 或一个 Project
);
CREATE INDEX facts_goal_kind ON facts(goal_id, kind, computed_at);
CREATE INDEX facts_project_kind ON facts(project_id, kind, computed_at) WHERE project_id IS NOT NULL;

CREATE TABLE claims (
  id TEXT PRIMARY KEY, goal_id TEXT NOT NULL REFERENCES goals(id), run_id TEXT NOT NULL REFERENCES runs(id),
  kind TEXT NOT NULL, author TEXT NOT NULL DEFAULT 'worker' CHECK (author IN ('worker','reviewer')),
  text TEXT NOT NULL, rationale TEXT, alternatives TEXT, confidence TEXT,
  evidence_refs TEXT NOT NULL DEFAULT '[]',
  cross_status TEXT NOT NULL DEFAULT 'unchecked' CHECK (cross_status IN ('consistent','contradicted','unbacked','unchecked')),
  cross_strength TEXT CHECK (cross_strength IN ('hard','soft')),   -- 02 §2.7 crossCheck.strength
  cross_reasons TEXT NOT NULL DEFAULT '[]', linked_facts TEXT NOT NULL DEFAULT '[]',
  ratification TEXT CHECK (ratification IN ('pending','ratified','rejected')),
  branch_state TEXT NOT NULL DEFAULT 'active' CHECK (branch_state IN ('active','superseded')),  -- 05 §5.6.6
  session_id TEXT, pi_entry_id TEXT, tool_call_id TEXT, claim_key TEXT UNIQUE,   -- entry id 只在会话内唯一，必须与 session_id 一起使用（R2-D5-05）
  created_at TEXT NOT NULL, seq INTEGER NOT NULL
);
CREATE INDEX claims_goal ON claims(goal_id, created_at);

CREATE TABLE decisions (                          -- 🧑 HumanDecision，不可变
  id TEXT PRIMARY KEY, goal_id TEXT REFERENCES goals(id),
  kind TEXT NOT NULL CHECK (kind IN (
    'ratify_contract','amend_contract','approve_action','deny_action','answer','ratify_claim','reject_claim',
    'accept','request_changes','abandon','resurrect','override_sentinel','extend_budget','override_capacity',
    'quarantine_test','trust_project','ratify_memory','edit_memory','retire_memory','resolve_sync_conflict',
    'approve_autonomy_change','pause','resume','take_over','hand_back','rewind','fork','start_now','snooze',
    'dismiss','check_human_criterion','grant_s0_exec','merge_projects','approve_docker','quick_ratify',
    'retry_verify','retry_claim','claim_on_behalf','deny_s0_exec','split_project','reject_memory',
    'discard_human_edits','bring_back_inspection','retry_after_human_change','keep_external_change',
    'revert_external_change','acknowledge_signal',
    'mark_benign','withdraw_opening','accept_secret_exposure','inspect_with_secrets','unmark_secret_file','approve_local_file',
    'rebuild_satellite','lower_risk_tier')),   -- rebuild_satellite：ADR-176；lower_risk_tier：ADR-178（降低 riskTier，仅本机，不是合同修订）；accept_secret_exposure：M2（ADR-164），M1 中不会写入；02 §2.7 HumanDecision.kind，与 16 §16.1.5 一致（ADR-120；lint (s) 比对）
  target TEXT, reason_code TEXT, reason_detail TEXT, note TEXT, payload TEXT NOT NULL DEFAULT '{}',   -- 02 §2.7 reason
  contract_version INTEGER, actor TEXT NOT NULL, at TEXT NOT NULL, seq INTEGER NOT NULL
);
CREATE TRIGGER decisions_no_update BEFORE UPDATE ON decisions
WHEN NOT (json_extract(OLD.payload, '$.tombstone') IS NULL AND json_type(NEW.payload, '$.tombstone') = 'object'
          AND (SELECT count(*) FROM json_each(NEW.payload)) = 1 AND NEW.note IS NULL AND NEW.reason_detail IS NULL
          AND NEW.id = OLD.id AND NEW.kind = OLD.kind AND NEW.goal_id IS OLD.goal_id AND NEW.target IS OLD.target
          AND NEW.reason_code IS OLD.reason_code AND NEW.contract_version IS OLD.contract_version
          AND NEW.actor = OLD.actor AND NEW.at = OLD.at AND NEW.seq = OLD.seq)
BEGIN SELECT RAISE(ABORT,'decisions are immutable'); END;   -- 唯一例外：隐私清除的墓碑（只置空文本、payload 改为 {tombstone}，范围只按 09 §9.12.4，ADR-196）
CREATE TRIGGER decisions_no_delete BEFORE DELETE ON decisions BEGIN SELECT RAISE(ABORT,'decisions are immutable'); END;

-- ───────────── Needs-You ─────────────
CREATE TABLE needs_you (
  id TEXT PRIMARY KEY,
  owner_kind TEXT NOT NULL CHECK (owner_kind IN ('goal','scratch','project','global')),   -- ADR-034
  owner_id TEXT,                                  -- goalId | scratchId | projectId；global 时为 NULL
  goal_id TEXT GENERATED ALWAYS AS (CASE WHEN owner_kind = 'goal' THEN owner_id END) VIRTUAL,   -- 便于按 Goal 查询
  run_id TEXT,
  kind TEXT NOT NULL CHECK (kind IN ('question','approval','review_ready','verify_failed','sentinel','budget','stalled',
                                     'ratify','conflict','verify_env','digest','backlog','flood','sync_conflict','project_identity','anomaly',
                                     'external_change','stop_condition','integration')),   -- integration：ADR-157（M2 推送失败，去重 int:{goalId}）   -- ADR-034、ADR-037、ADR-080；anomaly：ADR-126（bg_process_survived、post_settle_activity）；external_change：ADR-128（去重 ec:{goalId}）；stop_condition：ADR-133 第 14 轮 lint 补记（去重 stc:{goalId}:{conditionId}）
  severity INTEGER NOT NULL CHECK (severity IN (1,2,3)),
  level INTEGER NOT NULL DEFAULT 0 CHECK (level BETWEEN 0 AND 4), delivered_levels TEXT NOT NULL DEFAULT '[]',
  source TEXT NOT NULL,                           -- {producer, detector?}
  occurrences INTEGER NOT NULL DEFAULT 1, last_seen_at TEXT NOT NULL, snoozed_until TEXT,
  cost_of_delay TEXT NOT NULL, title TEXT NOT NULL,
  options TEXT NOT NULL DEFAULT '[]', recommendation TEXT, evidence TEXT NOT NULL DEFAULT '[]',
  default_if_ignored TEXT, dedupe_key TEXT NOT NULL, root_cause_key TEXT,
  routing TEXT NOT NULL DEFAULT '{}',             -- 08 §8.2 RoutingRuntime
  engine_req TEXT,                                -- {runId, uiRequestId, reqKey}：用于 answerUi
  created_at TEXT NOT NULL, surfaced_at TEXT, resolved_at TEXT,
  resolution TEXT, outcome_class TEXT, seq INTEGER NOT NULL,
  timed_out_at TEXT,                              -- 02 §2.9：question 超时并使 Goal 暂停时记录；条目保持打开
  CHECK ((owner_kind = 'global') = (owner_id IS NULL)),
  CHECK (owner_kind <> 'scratch' OR kind = 'question')   -- 02 §2.12：Scratch 只能产生 question
);
CREATE INDEX needs_you_owner ON needs_you(owner_kind, owner_id) WHERE resolved_at IS NULL;
CREATE UNIQUE INDEX needs_you_open_dedupe ON needs_you(dedupe_key) WHERE resolved_at IS NULL;
CREATE INDEX needs_you_open ON needs_you(severity DESC, created_at) WHERE resolved_at IS NULL;

-- ───────────── 评审与评论 ─────────────
CREATE TABLE review_units (
  id TEXT PRIMARY KEY, goal_id TEXT NOT NULL REFERENCES goals(id),
  hunks TEXT NOT NULL, loc INTEGER NOT NULL, intent TEXT, risk TEXT NOT NULL,
  criteria_ids TEXT NOT NULL DEFAULT '[]', content_hash TEXT NOT NULL,
  review_state TEXT NOT NULL CHECK (review_state IN ('unseen','viewed','approved','changes_requested')),
  first_viewed_at TEXT, dwell_ms INTEGER NOT NULL DEFAULT 0,   -- 08 §8.5.5 的计量
  at_commit TEXT NOT NULL
);
CREATE INDEX review_units_goal ON review_units(goal_id, review_state);

CREATE TABLE comments (
  id TEXT PRIMARY KEY, goal_id TEXT NOT NULL REFERENCES goals(id),
  anchor TEXT NOT NULL, body TEXT NOT NULL,
  timing TEXT NOT NULL CHECK (timing IN ('now','batch')), requires_change INTEGER NOT NULL,   -- 02 §2.8
  delivery_state TEXT NOT NULL CHECK (delivery_state IN ('draft','queued','delivered','acknowledged','addressed','stale','dropped')),
  batch_id TEXT, run_id TEXT, delivered_at_entry TEXT,
  seen_at_entry TEXT,                             -- delivered 的附加属性：之后第一条完成的 assistant 消息（05 §5.7.3）
  acknowledged_at_entry TEXT,                     -- Agent 显式引用评论 key 的条目（05 §5.7.3 的唯一定义）
  addressed_at_commit TEXT, stale_reason TEXT,   -- addressed 只有 ⚙️ 来源（hunk 已变），Agent 的引用记在 acknowledged_at_entry（05 §5.7.3，ADR-176）
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);
CREATE INDEX comments_goal_state ON comments(goal_id, delivery_state);

CREATE TABLE engine_outbox (                      -- 待投递给引擎的输入（05 §5.7.4）
  id TEXT PRIMARY KEY, run_id TEXT, goal_id TEXT NOT NULL,
  op TEXT NOT NULL CHECK (op IN ('prompt','steer','follow_up','answer_ui','abort','clear_queue','navigate','fork')),
  payload TEXT NOT NULL, idem_key TEXT NOT NULL UNIQUE,
  state TEXT NOT NULL CHECK (state IN ('pending','sent','confirmed','failed','cancelled')),
  attempts INTEGER NOT NULL DEFAULT 0, last_error TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);
CREATE INDEX engine_outbox_pending ON engine_outbox(state, created_at) WHERE state IN ('pending','sent');

-- ───────────── 记忆 ─────────────
CREATE TABLE memory (
  id TEXT PRIMARY KEY,
  scope_kind TEXT NOT NULL CHECK (scope_kind IN ('user','project','goal','team')),   -- team 为预留（ADR-013）
  scope_id TEXT,
  kind TEXT NOT NULL CHECK (kind IN ('convention','preference','gotcha','fact','decision','rejected_approach','command','constraint')),
  text TEXT NOT NULL CHECK (length(text) <= 320),   -- 字符硬上限；估算 token ≤ 80 由应用层校验（09 §9.2）。其余扩展字段存放于 ext JSON 列
  ext TEXT NOT NULL DEFAULT '{}',
  tags TEXT NOT NULL DEFAULT '[]',
  status TEXT NOT NULL CHECK (status IN ('proposed','active','retired')),
  author TEXT NOT NULL CHECK (author IN ('human','agent')),
  provenance TEXT NOT NULL, ratified_by TEXT, ratified_at TEXT, review_after TEXT,
  use_count INTEGER NOT NULL DEFAULT 0, last_injected_at TEXT
);
CREATE INDEX memory_scope ON memory(scope_kind, scope_id, status);

-- ───────────── 投影快照与计时器 ─────────────
CREATE TABLE projections (                        -- 冷启动时直接加载的 UI 投影快照（gui.md §9：≤ 500 ms）
  name TEXT NOT NULL, key TEXT NOT NULL, ver INTEGER NOT NULL, data TEXT NOT NULL,
  PRIMARY KEY (name, key)
);
CREATE TABLE timers (
  id TEXT PRIMARY KEY, kind TEXT NOT NULL, ref TEXT NOT NULL,
  fires_at TEXT NOT NULL, awake_ms_remaining INTEGER,     -- 睡眠期间冻结（§6.1.5）
  payload TEXT NOT NULL DEFAULT '{}', state TEXT NOT NULL CHECK (state IN ('armed','fired','cancelled'))
);
CREATE INDEX timers_armed ON timers(fires_at) WHERE state = 'armed';

CREATE TABLE watermarks (user_id TEXT NOT NULL, scope TEXT NOT NULL, seq INTEGER NOT NULL,
  PRIMARY KEY (user_id, scope));                  -- scope = goalId | 'global' | 'digest'（08 §8.10）| 'localfiles:<projectId>'（本地文件事件类通知的已查看水位，08 §8.1，ADR-174）

CREATE TABLE scratch (
  id TEXT PRIMARY KEY, session_id TEXT, cwd TEXT NOT NULL, pinned INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL, promoted_to TEXT REFERENCES goals(id)
);

CREATE TABLE project_local_files (               -- ADR-078/082/165/166：02 ProjectLocalFile
  project_id TEXT NOT NULL REFERENCES projects(id), path TEXT NOT NULL,
  secret_by TEXT CHECK (secret_by IN ('name','content','user')),   -- NULL = 普通本地文件；name 不可取消
  unmarked TEXT CHECK (unmarked IS NULL OR json_valid(unmarked)),   -- {contentHash, decisionId}：取消标记绑定当时的内容哈希
  approved TEXT CHECK (approved IS NULL OR json_valid(approved)),   -- 02 ProjectLocalFile.approved {decisionId}（human.decision{approve_local_file}，ADR-167/168）；NULL = 未批准，不播种
  PRIMARY KEY (project_id, path),
  CHECK (NOT (secret_by = 'name' AND unmarked IS NOT NULL)),
  CHECK (unmarked IS NULL OR secret_by IS NOT NULL)   -- ADR-170：只有带机密标记的条目才能取消标记
);

CREATE TABLE project_benign_targets (            -- ADR-117/125：项目良性清单；命中的受保护目标沙箱拒绝降为 severity 1
  project_id TEXT NOT NULL REFERENCES projects(id),
  category TEXT NOT NULL CHECK (category IN ('credential','tower_data','user_checkout','other_satellite','user_config','system')),
  op TEXT NOT NULL CHECK (op IN ('read','write','exec','net')),
  target TEXT NOT NULL,                           -- 精确到文件的规范化路径（主目录下以 ~/ 表示）或网络主机；字段定义唯一在 16
  decision_id TEXT REFERENCES decisions(id),      -- human.decision{mark_benign}；默认良性清单的条目为 NULL
  created_at TEXT NOT NULL, revoked_at TEXT,
  PRIMARY KEY (project_id, category, op, target),
  CHECK (NOT (category = 'credential' AND op = 'read'))   -- 凭据读取不能标为良性（ADR-125）
);

CREATE TABLE depcache_entries (                  -- ADR-092：depcache 的发布记录（来源）；$VS 中没有记录的条目视为不存在
  project_id TEXT NOT NULL REFERENCES projects(id), deps_key TEXT NOT NULL,
  install_run_id TEXT NOT NULL, inputs_hash TEXT NOT NULL,   -- lockfile、pm/Node 版本、stage 输入的哈希
  runner_baseline TEXT NOT NULL CHECK (json_valid(runner_baseline)),   -- 运行器集合逐文件哈希，来自注册表 tarball（不来自安装产物）
  published_at TEXT NOT NULL,
  PRIMARY KEY (project_id, deps_key)
);
```

说明：

- `events.payload` 中**不包含** `msg.delta` 和 `tool.update`（`02` §2.13）。每个 Run 只写入离散事件：`engine.agent_start`/`engine.agent_end`/`engine.agent_settled`、`engine.msg_end`（仅保存 role、usage、stopReason、pi 条目 id 这些摘要；完整消息在 Pi JSONL 中）、`engine.tool_start`/`engine.tool_end`（`details` 超过 16 KB 的部分截断，保留 EvidenceRef）、`engine.queue`、`engine.compaction_*`、`engine.retry_*`、`engine.entry`（只记 `tower.*`）、`engine.ui_request`。**存储类型名的唯一规则**（ADR-181）：Host 事件写入 EventLog 时 `type` 一律为 `engine.` 加 `EngineEvent.t`（`05` §5.2.2），`t` 中的 `.` 改为 `_`（如 `tool.end` → `engine.tool_end`）；`t` 本身已带前缀的 `engine.error`/`engine.exit` 原样存储。分层保留只按 `type GLOB 'engine.*'` 删除（见下方触发器），不带前缀的类型名不会被保留任务识别。正文其他处的 `tool.start`、`tool.end` 等指 `EngineEvent.t`（线上事件），不是存储类型名。在 10 个 Goal 并发时，这个量级约为每秒几十条（`02` §2.13 的目标）。
- **投影快照**：每个投影每 1000 个相关事件或每 60 s 写一次 `projections`（`13` §13.9.3）。冷启动时先加载快照，再追加快照之后的事件。
- **载荷中的路径集合**（唯一定义，ADR-213/214；`13` §13.9.1、`16` §16.1.14 引用）：事件载荷中的路径数组字段（`paths`、名字以 `Paths` 结尾的字段、`changed`、`skipped`，以及元素带路径的 `resolvePinHits`——`{path, action}` 数组，ADR-215）使载荷会超过 16 KB（`13` §13.9.1）时，这些非空的路径数组都整组写入 `goals/<G>/artifacts/paths-<sha256>.json`（按内容哈希命名，写入并 `fsync` 之后才追加事件），载荷中这些字段换成 `{sha256, count}`，Projector 与重建按哈希读回。不截断：这些集合由当时的归因或检测求出，不能事后重算，截断会让按集合处置的动作（如 `goal.external_change.revert`）只处置一部分。文件随 `goals/<G>/` 保留与清除（每日的 `db-backups/` 只含数据库，§6.6.3）；重建时文件缺失或内容哈希不符，重建报错停止、不替换现有的库，并列出缺失的文件。适用的事件（列表即全部，lint (i′) 比对）：`checkpoint.created`、`goal.external_change.detected`、`workspace.paths_restored`、`human_checkout.handed_back`、`human.decision`（只有 `hand_back` 的 `handBack.resolvePinHits` 一个字段，ADR-215）。
- **完整性**（R1-D6-02）：`UPDATE` 只允许墓碑化，`DELETE` 只允许保留任务删除归档或放弃满 30 天（ADR-057）的 `engine.*` 事件，两者都由触发器强制。哈希链分两层：
  - `audit.*` 事件逐条成链（`prev_hash`，`11` §11.11）；
  - 每日一次写入 `audit.log_digest{fromSeq, toSeq, count, merkleRoot}`，Merkle 根以**该区间全部事件**的 `payload_hash` 为叶子，这条 digest 事件本身也进入审计链。

  于是任何不经过保留任务的删除、对载荷的改动，都会在每日校验或启动校验时暴露。保留任务删除事件前，先追加 `audit.retention_purge{goalId, seqRanges, count}`，校验程序据此把合法删除与篡改区分开。审计哈希链按 ADR-038 推迟到 M2；M1 已经有这些列和触发器，只是还不计算链。
- **派生事件的幂等键**（R1-D6-05）：Observer、哨兵、检测器、AttentionRouter、StateMachine 产生的派生事件，**与源事件在同一个组提交事务中写入**，幂等键为 `derived:<源事件 idempotency_key>:<producer>:<序号>`（序号是同一 producer 对同一源事件的第几条输出）。计时器产生的事件为 `timer:<timerId>:<firesAt>`；UI 命令派生的事件为 `cmd:<cmdId>:<序号>`。重放时源事件冲突即整批跳过，派生事件不会重复。Needs-You 另有 `needs_you_open_dedupe` 唯一索引作为第二道防线。

---

## 6.4 UI 协议

### 6.4.1 帧

```ts
type ClientFrame =
  | { t: "hello"; proto: number; client: "desktop" | "web" | "mobile"; build: string; token?: string }
  | { t: "sub"; topic: Topic; since?: number }              // since = 已有版本，可做增量恢复
  | { t: "unsub"; topic: Topic }
  | { t: "ack"; topic: Topic; ver: number }                  // 已应用（renderer 在 rAF 提交后才 ack）
  | { t: "focus"; goalId: GoalId | null; visible: boolean; watch?: GoalId[] }
  | { t: "cmd"; id: string /* ULID，幂等键 */; name: CommandName; args: unknown; expect?: { topic: Topic; ver: number } }
  | { t: "req"; id: string; name: RequestName; args: unknown }   // 只读按需拉取：trace 分页、diff 文件、产物
  | { t: "ping"; at: number };

type ServerFrame =
  | { t: "welcome"; proto: number; minProto: number; serverBuild: string; schemaHash: string; scopes: Scope[] }
  | { t: "snapshot"; topic: Topic; ver: number; data: unknown }
  | { t: "delta"; topic: Topic; from: number; to: number; ops: Op[] }
  | { t: "result"; id: string; ok: true; seqs: number[] } | { t: "result"; id: string; ok: false; error: ProtoError }
  | { t: "res"; id: string; ok: boolean; data?: unknown; error?: ProtoError }
  | { t: "pong"; at: number; serverAt: number }
  | { t: "bye"; reason: "proto_mismatch" | "auth" | "shutdown" | "overload" };

type Path = (string | number)[];
type Op =
  | ["set", Path, unknown]          // 替换
  | ["merge", Path, object]         // 浅合并
  | ["del", Path]
  | ["ins", Path, number, unknown[]]   // 在 index 处插入
  | ["splice", Path, number, number]   // 删除 count 个
  | ["text", Path, string];            // 追加文本（流式尾部，可合并）

interface ProtoError { code: "E_STALE" | "E_INVALID" | "E_FORBIDDEN" | "E_CONFLICT" | "E_STATE" | "E_BUSY" | "E_CONFIRM" | "E_ENGINE" | "E_INTERNAL";   // E_BUSY（ADR-145/146）：目标正在进行中（例如 drain），稍后重试，不改变状态；E_STATE：须先处理某个原因；E_CONFIRM：需要人再确认一次——协议层对**所有**携带人类自由文本、且会进入模型上下文的命令参数统一检查（回答与重新回答、转向、恢复与重试的附言、评论与 `request_changes`、交还说明、合同文本、人写的记忆）；匹配集合 = 钥匙串中 Tower 持有值的精确匹配 + `11` §11.7 的模式（URL 凭据、常见 token 前缀、私钥头）；带 `confirmSecret:true` 重发才执行（ADR-162/163/164） message: string; detail?: unknown }
```

- **版本**：`ver` 取该投影最近一次变化对应的 EventLog `seq`。`live` 类 topic 使用独立的子序号（`seq * 1000 + k`），因为它们的增量不写入日志。
- 客户端收到 delta 时检查 `from === 本地 ver`；不相等就发 `sub{topic, since: 本地 ver}` 重新同步。服务端能从 `since` 算出差量就发 delta，否则发 snapshot。

### 6.4.2 订阅主题

| Topic | 内容 | 节奏（§6.5） | 典型大小 |
|---|---|---|---|
| `board` | 所有非归档 Goal 的卡片摘要（状态、Mode、Live Line、两轨进度 V/M · O/M（ADR-020）、改动统计、花费、异常徽章、队列原因） | 后台 | 每个 Goal 约 0.5 KB |
| `inbox` | 未决的 Needs-You（已路由，`08`），以及“下一件最值得看的事” | 立即（注意力相关） | — |
| `goal/<id>` | Goal 页：合同（当前版本）、标准与 Fact（含新鲜度）、计划与 Claim、检查点刻度、Run 列表、预算 | 聚焦时按刷新率（`16` §16.4）；否则后台 | — |
| `goal/<id>/live` | Live Line、流式尾部（`text` 操作）、活跃工具、心跳 | 聚焦时按刷新率；Watch 模式中未聚焦的 Goal 为 250 ms（`16` §16.4） | ≤ 8 KB/帧 |
| `goal/<id>/ledger` | Fact、Claim、Decision 列表（分页游标） | 后台 | — |
| `goal/<id>/review` | 评审单元列表与状态；hunk 内容通过 `req diff.file` 按需拉取 | 后台 | — |
| `goal/<id>/timeline` | 检查点、地标、Run 边界 | 后台 | — |
| `briefing` | 重入简报、站会摘要（`08` §8.10–8.11） | 按需 | — |
| `system` | 进程健康、槽位和队列、评审积压（ADR-014）、版本、存储占用、性能计数（§6.7） | 1 Hz | — |
| `settings` | 用户设置、Project 设置；Project 级本地文件通知（ADR-174：两条事件类通知由事件投影得到，“无法读取”取自 Supervisor 的进程内状态；renderer 重新订阅时随快照取得，`08` §8.1） | 变化时 | — |
| `scratch` | Scratch 列表 | 后台 | — |

按需请求（`req`）：

- `trace.page {runId, cursor, dir, filter}`：从 Pi JSONL 读取，并合并 Tower 事件，在 git worker 中完成。
- `diff.file {goalId, file, at}`
- `artifact.get {path}`
- `checkpoint.diff {goalId, projectId, n}`（键与 `checkpoints` 主键一致，`10` §10.13）
- `context.exact {runId}`：查看实际发送给模型的上下文，见 `05` §5.10。

### 6.4.3 命令集（所有人的动作）

所有命令都走 `cmd`，返回 `result` 和产生的事件 seq 列表。

**暂停出口的统一写法**（ADR-134，`03` §3.2.1 为唯一来源）：处理 `paused` 中某个原因的命令只做三件事——**解除本原因**；在 `03` §3.2.1 注明时**显式改写**继续目标（只换目标、不携带数据，写 `goal.continuation.set{by:"decision"}`）；自带开场的决定把 `{decisionId}` **追加到 `pending_openings`**（元素为 `OpeningRef = {id, decisionId} | {id, factId}`，`id` 在入队时分配、稳定不变，返工证据引用验证失败的 Fact，ADR-140/144；人可按 `id` 逐条撤回，`goal.openings.withdraw`）。**任何 Run 开始**（继续目标 `run`、`pendingHandBack.continue_agent`、自动返工、`in_review` 或 `accepted` 中的 `request_changes`；验收不清空队列，`16` §16.1.1，ADR-186）都在 `run.started` 事件的**同一事务**中消费组装进本次开场的条目（ADR-145；只消费组装过的 id，见下，ADR-184）。**开场队列的唯一时序规则（ADR-183）**：准备第 ③ 步（Host 握手与开场组装，`16` §16.1.1 `ready` 行）**只读**队列、按追加顺序组装 `RunSpec.opening`，不消费；**消费点只有一个**——收到 Pi 的 `agent.start` 之后写 `run.started` 的同一事务；第 ③ 步进行中 `goal.openings.withdraw` 返回 `E_BUSY`（与 `pause`、`take_over` 相同），因此组装进开场的条目不会在投递前被撤回；**`run.started` 只消费组装过的 id**（ADR-184）：事件记录本次开场所含的 `OpeningRef.id`（`run.started{openingIds}`），同一事务只从队列移除这些 id——第 ③ 步开始之后才追加的条目（例如上一个 Run 留下的问题在 ③ 中被作答，`needs_you.answer` 的未送达一支）留在队列，照常显示在“下次运行开场”中、可撤回，在下一个 Run 的开场送达；第 ③ 步失败、超时或崩溃时条目仍在队列，下一次组装前按 `details.key`（= `OpeningRef.id`，`05` §5.2.1）检查该会话的 JSONL——已写入会话的 id 在同一事务中视为已消费、不再投递（同一会话中不出现重复的 `tower.*` 开场；人的 note 以 user 角色发送、没有 `details.key`，在 Pi 写入它之后、`run.started` 之前崩溃时可能重复一次，登记为已知窗口，ADR-184）。组装的内容（`tower.handback`、返工证据、评论、`tower.external_resolved`、人的 note；为空时 `tower.resume`；投递见 `05` §5.8），并先检查预算：已达硬上限 → `paused(budget_hard_cap)`，继续目标 `run`，待消费的载荷留在队列（自动返工时返工证据以 `{id, factId}` 入队），ADR-140/144；没有 Run 开始的路径（验证、评审）不消费。剩余原因非空时取最高者为 `pause_reason`；`pause_reason` 与 `also_applies` 全部为空时，由 StateMachine 中唯一的 `onAllReasonsCleared()` 离开 `paused`：① `pending_hand_back` 存在 → 执行它（不清空 `pending_openings`；`continue_agent` 开 Run 时才消费）；② 否则执行 `continuation`（ADR-137）：`run` → 经 §6.2.4 准入，准入通过时发 `run.requested{resume}`（无执行槽位或依赖未满足 → `ready{waitReason}`，`pending_openings` 保留，ADR-145/146/179）；`settle` → 从宽限确认起**重新执行完整 settle 序列**（§6.1.10），有效提交保留；`claim{decisionId}` → 直接进入 `claimed`（引擎须已空闲；Trace 记“人代为提交”）；`verify{pin}` → 以该 pin 验证；`review` → 回到 `state`；`verify_new` → 以当前树生成新 pin 验证；③ 守卫：目标为 `verify`/`review` 而当前树 ≠ 目标 pin 的树 → 改为 `verify_new`。**`verifyFrom` 的写入点**唯一定义在 `16` §16.1.1 `Goal.verifyFrom` 行（ADR-137/143；含 `bring_back`、标准修订与守卫改写的 `returnTo`），继续目标中不另存。**验证失败是否自动返工**（唯一规则在 `03` §3.2.1，此处逐字引用；实现注记在引文之后）：“**人的改动** = `author:"human"` 的检查点、`mixedPaths` 非空的检查点，以及 rebase（M2）带入的 base 变化；**窗口起点** = 最近一次**通过**的验证的 pin（“通过”= 该次验证的结论标签为已验证或有保留的已验证（`07` §7.10.3 `label`），且 Goal 因它进入 `in_review`——直接进入，或经覆盖哨兵改写的继续目标 `review` 进入，序号取该次验证——或经验收延续回到 `accepted`；结论为未经机器验证的验证不算通过，ADR-187；没有则 base。窗口以事件序号界定，交还的 `human_edit` 检查点在交还决定之前写入，不在其开启的窗口内，ADR-145）与人最近一次明确把工作交给 Agent 的决定中较晚者——这类决定是封闭列表：`hand_back{continue_agent}`、`retry_after_human_change`、`request_changes`，以及把 `pendingHandBack.mode` 由 `reverify` 置换为 `continue_agent` 的 `resume`（上一条“唯一例外”，ADR-216/217；交还的 `human_edit` 检查点因此不在窗口内）。窗口内有人的改动 → 不自动返工，进入 `paused(human_change_verify_failed)`；否则按 Agent 路径（返工 < `maxReworkCycles`，且预算未达硬上限——已达则 `paused(budget_hard_cap)`，继续目标 `run`，返工证据以 `{factId}` 入队 `pendingOpenings`）。`verifyOrigin` 只作说明，不决定去向。”实现注记：计入的检查点是 `events.seq` 大于起点事件 `seq` 者；起点不早于 `bindings.bound_seq`（不随 rebase 移动，rebase 带入的变化由 `rebase` 检查点计入）；多仓库 Goal 按仓库分别计算，任一仓库窗口内有人的改动即视为有人的改动（ADR-146）；入队的 `OpeningRef` 带 `id`（ADR-144 补记）；“人的改动”不读取任何可被 Agent 设置的环境值（`TOWER_ORIGIN` 只用于诊断），`user_bash` 只在其调用窗口内的写入归人（ADR-145，见 §6.1.10）。**`nested_repo_live` 条目消失**：无论是否唯一原因，一律解除它并在剩余原因中加入 `human`（ADR-137）。下表各行只写“解除什么、改写什么”，不再各自写去向。`scope` 一列对应 §6.4.7 的远程授权。

| 命令 | 参数 | 产生的主要事件 | scope |
|---|---|---|---|
| `goal.create` | `{title, intent, projectIds, kind?, riskTier?, confirmSecret?}` | `goal.created`；`intent` 匹配机密模式 → `E_CONFIRM`（ADR-164） | full |
| `goal.update_meta` | `{goalId, title?, labels?, kind?, riskTier?}` | `goal.meta_changed`；**降低** `riskTier` 时同一事务另记 `human.decision{lower_risk_tier}`（独立的决定种类，`detail` 记原值与新值；不产生合同版本，**不算合同修订**——不满足“本次暂停后合同已修订”、不清除 `until_amend` 静默、不使 S0 授权失效（`11` §11.2 失效条件 (i) 只由 `contract.amend` 触发），ADR-178/182），进入审计；提高不受限（ADR-176） | full（字段级：降低 `riskTier` 仅本机，`16` §16.5） |
| `goal.set_priority` | `{goalId, before?: GoalId, after?: GoalId}` | `goal.priority_changed` | full |
| `goal.add_dependency` / `goal.remove_dependency`（**M2**，`04` §4.2.4） | `{goalId, dependsOn}` | `goal.dependency_*`（I8） | full |
| `contract.start_shaping`（**M2**，ADR-038） | `{goalId}` | `goal.state_changed(draft→shaping)`、`run.requested{kind:shaping}` | full |
| `contract.use_template` | `{goalId}` | `contract.drafted{by:human}` | full |
| `contract.edit_draft` | `{goalId, version, patch, confirmSecret?}`，带 `expect` | `contract.draft_edited`；`patch` 中人写的文本匹配机密模式 → `E_CONFIRM`（ADR-164） | full |
| `contract.trial_criterion` | `{goalId, criterionId}` | `verify.requested{trial:true}`（`03` §3.4.1）：试运行在当前 base 上执行该标准，**不经** `verify(goal, trigger)`、没有对应的 `VerifyTrigger`（`07` §7.4.1），不生成 pin、不改变 Goal 状态，也不进入 `decide()`；结果只写入合同页与卡片（`04` §4.10.2，ADR-179） | full |
| `contract.ratify` | `{goalId, version}` | `human.decision{ratify_contract}`、`goal.state_changed(→ready)` | full（禁止远程，ADR-051） |
| `contract.quick_ratify` | `{goalId, version}` | `human.decision{quick_ratify}`、`goal.state_changed(→ready)` | decide（远程仅限 ADR-051 的四个条件） |
| `contract.amend` | `{goalId, patch, amendmentNote, budgetBase?, confirmSecret?}` | `human.decision{amend_contract}`、`contract.ratified{v+1}`、`contract.superseded{v}`；新版本 `Budget` 的取值与 `budgetBase` 的 `E_CONFLICT` 只按 §6.2.5 生效额度一条（ADR-199）；清除 `stop_condition_silences` 中 `scope:"until_amend"` 的条目（ADR-139）；`s0_grant = granted` 时同一事务置回 `none` 并清除 `s0_grant_expires_on`（S0 授权的失效，唯一定义在 `11` §11.2，ADR-182）。**状态效果**（`03` §3.4.5 为唯一来源，ADR-178）：新增或修改验收标准时，`in_review`/`accepted` → `verifying`（以新标准验证当前 pin，写 `verify_from`）；`claimed`/`verifying` 取消当前验证并以新标准重新验证；`paused` 中受影响 Fact `expired`、不解除暂停，继续目标为 `review{state, pin}` 时显式改写为 `{kind:"verify", pin}`（同一 pin，写 `goal.continuation.set{by:"decision"}`，并在同一事务写 `verify_from = state`，否则执行时会沿用上一次验证留下的来源状态，`16` §16.1.1 `Goal.verifyFrom`，ADR-180）；`integrated` 中返回 `E_STATE`（`03` §3.4.5，ADR-195）；只改措辞不改变状态。任何修订在生效前重算致命三要素（`11` §11.8，ADR-180）：本机凑齐时显示与批准时相同的警告，远程凑齐时 `E_FORBIDDEN` | full（字段级远程规则：按 `16` §16.5 “`Contract` 的逐字段远程规则”封闭表与其判别原则，未列出的字段与方向仅本机，mobile 禁止，ADR-178/180） |
| `goal.start` | `{goalId}` | `run.requested{initial}` | decide |
| `goal.pause` | `{goalId}` | `human.decision{pause}`。ready（等待准入的 Run，ADR-146/147）：→ `paused{human}`，`continuation={kind:"run"}`，`pending_openings` 与 `queued_run` 保留；准备阶段：仓库准备（含卫星检出，ADR-151/152）与依赖物化期间中止该步骤 → `paused{human}`，继续目标 `run`，`queued_run` 保留；只有 Host 握手与开场组装期间（至多 120 s）返回 `E_BUSY`（ADR-149/150/152）。running：以 `draining_for={target:"pause", reasons:["human"], decisionIds:[本决定]}` 开始 drain（同一事务，ADR-141；drain 中已有则并入 reasons）→ `paused{human}`，`continuation={kind:"run"}`；settle 序列中 → `continuation={kind:"settle"}`（ADR-137）；claimed/verifying：取消验证 → `paused{human}`，`continuation={kind:"verify", pin}`（源状态取 `goals.verify_from`，不另存）。已在 `paused` 时按 `16` §16.1.1 的优先级并入（`human` 成为 `pause_reason`，原原因进入 `also_applies`），继续目标不变（ADR-176） | decide |
| `goal.resume` | `{goalId, note?, feedback?: "stop_condition_false_positive", confirmSecret?}` | `human.decision{resume}`；按上方统一写法：**只解除当前 `pause_reason`**。前置守卫：`human_checkout` 非空 → `E_STATE`（先 `goal.hand_back` 或 `goal.discard_human_edits`）；`satellite_rebuilding=1` 或原因为 `satellite_missing` → `E_STATE`。可由 `resume` 解除的原因与条件（`03` §3.2.1）：`human`；`budget_soft_cap`（越过软上限一次）；`budget_hard_cap`（硬上限已高于当前用量：经 `budget.extend` 或 `contract.amend` 提高，ADR-208）；`stop_condition`；`idle_without_submit`；`verify_failed_limit`（本次暂停后合同已修订或附 `note`）；`question_timeout`（阻塞问题已作答）；`stalled_timeout`（无条件，不改写继续目标——它只从 `running` 进入，继续目标已按 `03` §3.2.1 写入；同一事务关闭该 `stalled` 条目，定类见 `08` §8.8，ADR-184）；`provider_unavailable`；`app_quit`/`engine_crash`；`prepare_failed`（重试准备；路径冲突时先改名重建卫星，ADR-149）；`post_settle_activity`；`sentinel_high` 且命中**只有** `nested_repo_live`（`note` 必填，要求 Agent 删除该条目，ADR-131）。条件不满足或其他原因（`external_change`、其余 `sentinel_high`、`human_change_verify_failed`、`verify_env_error`、`s0_grant_pending`）→ `E_STATE` 并提示对应命令。**停止条件的再武装**（原因为 `stop_condition`，ADR-139）：`resume` 写入 `stop_condition_silences{conditionId, scope:"run", object}`（本次命中的具体路径或命令，静默到“继续”之后开始的那个 Run 结束）；`feedback:"stop_condition_false_positive"` 写入 `{conditionId, scope:"until_amend"}`。**显式改写**：原因为 `verify_failed_limit`、`idle_without_submit`、`post_settle_activity`、`nested_repo_live` 时把继续目标改写为 `{kind:"run"}`（这些原因的出口是返工或继续工作）；其余不改写。原因为 `nested_repo_live` 而 `pending_hand_back` 的 `mode` 为 `reverify` 时，同一事务把它置为 `continue_agent`（`03` §3.2.1“`pendingHandBack` 等待期间的选项”，ADR-216），并在本条 `human.decision{resume}` 上记 `handBack:{mode:"continue_agent"}`，归因窗口的起点与重建据此识别这次置换，不回溯当时的状态（ADR-218）。**载荷**（ADR-140）：附 `note`、或原因为 `verify_failed_limit`（返工语义）时，把本决定追加到 `pending_openings`；`note` 是人写的转向，在 Run 开始时以 user 角色发送（`05` §5.8，ADR-135）。`feedback:"stop_condition_false_positive"`（仅 `stop_condition`，ADR-135）：在本条 `human.decision{resume}` 上写 `reason.code:"stop_condition_false_positive"`、`target.criterionId` = `Contract.stopConditions[].id`（`16` §16.1.5；不存在可写标注的 stop_condition Fact，ADR-178），供 `08` §8.8 精度统计。同时清除残留的 `takeover_from` | decide |
| `goal.openings.withdraw` | `{goalId, openingId}` | `human.decision{withdraw_opening, target:{openingId}}`（ADR-144 补记）：从 `pending_openings` 中移除 `id = openingId` 的条目（含 Tower 自己产生的返工证据与外部改动说明），撤回后 Agent 不会收到它；不改变状态与继续目标。准备第 ③ 步（开场组装）进行中返回 `E_BUSY`（“正在启动，稍后重试”；开场队列的时序规则见上方统一写法，ADR-183）；已被消费（Run 已开始）的 id 返回 `already_delivered`，界面提示“已发送，无法撤回”；已撤回的 id 返回成功（幂等，ADR-145）；Goal 已归档或放弃时返回 `E_STATE`（条目不会送达，`16` §16.1.1，ADR-187）。卡片显示“下次运行开场：N 条”，展开可逐条撤回 | decide（允许远程，ADR-144） |
| `verify.secret_wait.keep`（**M2**，ADR-164） | `{goalId}` | 关闭 `ve:{goalId}:secret_wait` 条目，带机密的标准继续排队等待调度互斥（ADR-160）；不是 HumanDecision | decide |
| `verify.secret_wait.run_now`（**M2**，ADR-164） | `{goalId}` | `human.decision{accept_secret_exposure}`（ADR-160）：不等其他 Agent 活动结束，立即以 `env` 运行该标准；确认文案“其他正在运行的 Agent 可能读到该机密”；M1 中这是该决定的唯一用途（ADR-161） | full（仅本机，与 `signal.mark_benign` 相同，ADR-160 补记 2） |
| `verify.secret_wait.as_file`（**M2**，ADR-164） | `{goalId}` | 本次以 `secretsVia:"file"` 运行该标准，无需互斥（ADR-160）；不是 HumanDecision | decide |
| `secrets.access.use_now`（**M2**，ADR-161） | `{goalId, requestId}` | `human.decision{accept_secret_exposure}`（ADR-160 补记；M1 中该决定只用于 `verify.secret_wait.run_now`）：对处于 `approved_waiting` 的 `secrets.access` 请求（已批准，但有其他 Agent 活动，工具调用在本 Goal 的门禁处等待），不等其他活动结束，立即放行该次工具调用并注入机密；确认文案“其他正在运行的 Agent 可能读到该机密” | full（仅本机，ADR-160 补记 2） |
| `goal.base.check` | `{goalId}` | 对远端引用 base 执行一次 fetch（取入镜像），随后做 base 前进检测与 `integrated` 观测（ADR-157/158）；失败记 Fact `base_fetch_failed{remote, error}`；卡片上的“检查 base”与打开详情（距上次获取超过 10 分钟）共用；不改变状态。不是 HumanDecision | decide（允许远程） |
| `goal.base.choose` | `{goalId, side: "remote" \| "local"}` | 记事件 `goal.base.chosen{side}` 并写 `goals.base_choice{side, towerTip, userTip, at}`（ADR-158 及补记、ADR-159；不是 HumanDecision，不在 `decisions.kind` 中）：`base_diverged` 时决定此后以哪一侧作为该 base 的**观测基准**（用于 base 前进提示与 `integrated` 观测），直到下一次分叉；**不改变** Goal 的 `baseCommit`，不触发 rebase 或重新验证（M2 中若所选一侧是 `baseCommit` 的后代，按普通的 base 前进进入 rebase 流程）。确认文案：“只影响提示与合入判断，不改动工作区” | decide |
| `project.remote.recheck` | `{projectId}` | 重新读取用户主检出中的远端配置并判定是否带凭据（ADR-158）；不再带凭据时关闭 `remote_credential_blocked` 的 `integration` 卡片并重试被阻止的网络命令 | decide |
| `project.local_files.add` | `{projectId, path}` | 把被 git 忽略、运行所需的文件加入本地文件清单（ADR-078/167）；路径在用户检出中不被 git 忽略、或在 base 中被跟踪时返回 `E_STATE`（ADR-205/206，`16` 的 `ProjectLocalFile` 行）；清单中的路径不进入此后的任何快照，在该 Goal 的 base 中被跟踪的除外（`10` §10.1.2 按路径排除，ADR-206；何时生效见 `10` §10.7.1 第 1 步，ADR-207）；加入时按名字与内容判定 `secret_by`，此后每次复制前重新判定（ADR-170/171，判定时机唯一定义在 `16` 的 `ProjectLocalFile` 行）；未经 `approve` 不播种；不是 HumanDecision | full（本机或 web） |
| `project.local_files.remove` | `{projectId, path}` | 从清单移除（ADR-167）；此后该路径不再按路径排除，是普通的未跟踪文件，在各活跃 Goal 的下一个检查点或 pin 生效（人想让 Goal 提交它时先移除，`10` §10.1.2，ADR-206/207）；移出后首次收入它的检查点或 pin 按人的改动计，记入 `mixedPaths`，不论移出时它是否仍被忽略（`10` §10.7.1 第 1 步，ADR-208/209）；已读入、正在排队的验证在写出前复核，不再写出该条目（`16` 的 `ProjectLocalFile` 行，ADR-174）；Scratch 的读拒绝按路径模式生效，不随移除解除（`11` §11.6.5，ADR-176）；不是 HumanDecision | full（本机或 web；`isSecret` 条目时仅本机，ADR-176，`16` §16.5） |
| `project.local_files.approve` | `{projectId, path}` | `human.decision{approve_local_file}`（ADR-167/168）：批准该文件纳入播种；写 `approved={decisionId}`；只有已批准的普通本地文件才播种。前置守卫（ADR-170）：清单中不存在该路径 → `E_STATE`，不隐式插入（界面先发 `add`） | full（仅本机） |
| `project.local_files.mark_secret` | `{projectId, path}` | 把该本地文件标记为机密（ADR-166）：对 `isSecret` 为假的条目（含已取消标记的条目）写 `secret_by='user'` 并清除 `unmarked`，此后不自动播种到验证槽位、检验检出或卫星（已读入、正在排队的验证在写出前复核，同样不写出，ADR-174）；在同一把本地文件锁下从该 Project 的活跃卫星与人工编辑检出中删除已有副本（base 跟踪该路径的 Goal 不删，ADR-207；Tower 自己的写入，按 ADR-128 归因，不触发 `external_change`），检验检出与运行中的验证槽位只提示，当前内容加入脱敏器精确匹配集（ADR-176）；对已是 `isSecret` 的条目为幂等的无操作，不覆盖已有依据（`name` 保持 `name`，`content` 保持 `content`）（唯一定义在 `16` 的 `ProjectLocalFile` 行，ADR-171）；不是 HumanDecision | full（仅本机） |
| `project.local_files.unmark_secret` | `{projectId, path}` | `human.decision{unmark_secret_file}`（ADR-166）：取消机密标记，写 `unmarked={contentHash, decisionId}`（绑定当时的内容哈希）；`secret_by='name'` 的文件不可取消（`E_STATE`）；`secret_by` 为空的条目 → `E_STATE`（ADR-170）；内容变化且再次匹配机密模式时自动恢复 | full（仅本机） |
| `inspect.open` | `{goalId, withSecrets?: boolean}` | 打开检验检出（`10` §10.8.3），检验对象为**该 Goal 最近一次完成的验证的 pin**（ADR-169）。来源状态（ADR-168/169）：`in_review`、`accepted`，以及 `paused` 且原因为 `verify_failed_limit`、`human_change_verify_failed` 或由 `verifying` 进入的 `sentinel_high`（detector 不是 `nested_repo_live`）；`nested_repo_live` 与其他状态返回 `E_STATE`；检验目录 `<wtRoot>/_inspect/<goalId>` 仍在使用中（`10` §10.2 唯一定义；按状态判定，目录已不存在时同样如此，ADR-231）时同样返回 `E_STATE` 并列出该路径，不写入（ADR-198；先 `inspect.close` 或 `inspect.bring_back`，ADR-208）；该 Goal 的 `goal.delete_kept` 正在执行时返回 `E_BUSY`（ADR-229）；已脱离的检验目录先按 `10` §10.2 “Tower 自动改名保留”(a) 改名、不删除，再照常新建（ADR-228）。`withSecrets:true`（默认 false，仅当项目有机密本地文件时提供）→ `human.decision{inspect_with_secrets}`，本次检验检出带上机密本地文件；确认文案“运行期间 Agent 写的代码会读到这些文件；同一用户的其他进程也可能读到”（人发起的例外，ADR-166；`11` T31） | decide；`withSecrets:true` 时仅本机 |
| `project.verify_profile.update` | `{projectId, patch}` | 修改 `VerifyProfile`；`env.vars` 的值经机密检查，命中时**拒绝保存**（`E_INVALID{reason:"secret_in_project_vars"}`：“项目变量会进入 Agent 与验证器的环境，M1 中不能放机密；需要机密的检查请写为 human 标准”，ADR-166），不提供 `confirmSecret` 绕过 | full；字段级远程规则（M2 `serve`，ADR-167/178）：按 `16` §16.5 “`VerifyProfile` 的逐字段远程规则”封闭表，未列出的字段与方向仅本机，手机禁止 |
| `goal.retry_verify` | `{goalId, pin?: "same"\|"new"}` | `human.decision{retry_verify}`。`in_review`/`accepted`：→ `verifying`（`verifyOrigin:"manual"`）。`paused(verify_failed_limit\|human_change_verify_failed\|verify_env_error)`：解除本原因，并把继续目标改写为 `verify{pin}`（`same`）或 `verify_new{}`（`new`；`verify_env_error` 只允许 `same`）（ADR-134/140） | decide |
| `goal.retry_claim` | `{goalId}` | `human.decision{retry_claim}`（`paused(post_settle_activity)`）：解除本原因，继续目标改写为 `{kind:"settle"}`——从宽限确认起重新执行完整 settle 序列（ADR-137） | decide |
| `goal.external_change.keep` | `{goalId, note?}` | `human.decision{keep_external_change}`（语义以 `03` §3.2.1 为唯一来源，ADR-128/134）。前置条件：`external_change` 列非空；`human_checkout` 非空 → `E_STATE`（接管期间的外部写入由交还第 6 步处置，`10` §10.3.1，ADR-183）。① 以 `author:"human"`（`mixed_paths` 记 `mixed`）、`landmark:"external_change_kept"` 记检查点（树不变时也记，ADR-127）；② 写 `goal.external_change.resolved{how:"keep"}`，清空列；③ **显式改写**：继续目标为 `verify`/`review` → `verify_new{returnTo?}`；为 `run`/`settle` → 不变；本决定追加到 `pending_openings`（下一次 Run 开场附 `tower.external_resolved{kept, reverted, mixed}` ≤ 120 token，要求不要回退已采纳的路径）。失败是否自动返工不由此处标记——①的 `author:"human"` 检查点本身就使随后的验证失败进入 `human_change_verify_failed`（ADR-140）；④ 解除 `external_change` | decide（手机端禁止，ADR-125） |
| `goal.external_change.revert` | `{goalId, note?}` | `human.decision{revert_external_change}`。前置条件同 `keep`（`human_checkout` 非空 → `E_STATE`，ADR-183）。① `restorePaths(baselineCps, paths)`（`10` §10.8.1；基线唯一定义在 `10` §10.3.1）：恢复**之前**先做 `safety` 检查点（记录被撤销的内容，可再撤销），完成后再做一个（ADR-176）；② 只考察 **`paths` 中的路径**：仍与基线不同者（只可能来自并发写入）按归因表分类——存活进程的写入 → 继续目标为 `verify`/`review` 时改写为 `verify_new{returnTo?}`，其余记一次新的 `detected`（本原因不解除）；`paths` 之外的路径不参与判定（ADR-134）；③ 否则写 `resolved{how:"revert"}`、清空列、解除 `external_change`；**不改写**继续目标；本决定追加到 `pending_openings`（下一次 Run 开场附 `tower.external_resolved`，ADR-140） | decide（允许远程，ADR-125） |
| `goal.claim_on_behalf` | `{goalId, note}` | `human.decision{claim_on_behalf}`；要求引擎空闲；`pending_hand_back` 非空 → `E_STATE`（`03` §3.2.1“`pendingHandBack` 等待期间的选项”，ADR-216）。`paused(idle_without_submit\|budget_hard_cap)`：解除本原因，继续目标改写为 `{kind:"claim", decisionId}`（ADR-137）：转移函数执行时直接进入 `claimed`（`verify_from='claimed'`，验证 `trigger:"claimed"`），失败按 ADR-140 的归因规则（内容是 Agent 的，人只是代为提交，通常走 Agent 路径），Trace 记“人代为提交” | decide |
| `goal.start_now` | `{goalId}` | `human.decision{start_now}`：跳过队列顺序（不跳过槽位和资源检查） | decide |
| `goal.take_over` | `{goalId, note?}` | `human.decision{take_over}`（ADR-081/094，`03` §3.2.1 `human` 行）。前置守卫（ADR-151）：卫星**已完成检出**（完成标记存在），否则 `E_STATE`（“工作区尚未建立”），界面不提供“我来改”。源状态：`ready`（等待准入的 Run，继续目标 `run`，ADR-146/147；准备阶段中一律返回 `E_BUSY`，ADR-149）、`paused(prepare_failed)`（同上守卫，ADR-149/151）、`running`（先以 `draining_for={target:"take_over", …}` drain，ADR-141；drain 已在进行时返回 `E_BUSY`“等待当前步骤结束后重试”——只有暂停原因可以并入，ADR-145）、`paused(*)`（本 Goal 的后台进程终止一轮完成之前，不论源状态都返回 `E_BUSY`，冷启动与 Tower 运行中都如此，§6.1.6，ADR-223/227）、`in_review`、`accepted`（未集成）；其他状态、`satellite_rebuilding=1`、`satellite_missing`、`human_checkout` 已存在、`external_change` 未解除（先 `keep`/`revert`，ADR-128）、或 `pending_hand_back` 非空（上次交还后仍暂停，提示“上次交还的选择仍在等待：先解除剩余的暂停原因，交还会随之执行”，界面上“我来改”置灰并显示同一提示，`03` §3.2.1 `human` 行，ADR-214/215）→ `E_STATE`。该 Goal 的 `goal.delete_kept` 正在执行时返回 `E_BUSY`（`10` §10.2，ADR-229）。`human_checkout` 为空而 `<wtRoot>/_human/<goalId>` 已存在（已脱离的副本，或中断的接管留下的目录）时不返回 `E_STATE`：先按 `10` §10.2 “Tower 自动改名保留”(a) 改名、不删除，再照常新建，结果列出改名后的路径（ADR-198/228）；从 `running` 接管时这一改名在 drain 之后执行，同样先等进行中的 `goal.delete_kept` 结束（`10` §10.2，ADR-230）。先做一次全量嵌套仓库扫描（ADR-101，见 §6.2 GitService）。创建人工编辑检出 `<wtRoot>/_human/<goalId>`（先对卫星当前内容做检查点，再由该检查点的影子树物化被跟踪与未忽略的内容，`O_NOFOLLOW`，**不写出** `pinSafetyCheck(baseTree, 检查点树)` 命中的路径，base 中未改动的仓库形态夹具照常写出；被忽略的依赖目录 depcache 命中则 CoW、否则由安装器重建，ADR-106/109 + Tower 按模板新建的 gitdir，index 与 HEAD 由影子生成）→ 同一事务：`state=paused`、`pause_reason=human`（原暂停原因按优先级进入 `also_applies`）、`takeover_prior_reasons=<接管前的原因集合>`（ADR-140）、继续目标（从 `running` → `run`，从 `in_review`/`accepted` → `review{state, pin}`，从 `paused(*)` → 保持原目标，ADR-134）、`takeover_from=<源状态>`、`human_checkout={path, baseTree, createdAt, syncState:"idle"}`。**守卫**（ADR-212）：`human_checkout` 为空而 `takeover_from` 非空（检出已丢失，§6.1.6）时，保留已有的 `takeover_from` 与 `takeover_prior_reasons`，不改写，只写新的 `human_checkout`。打开外部编辑器前显示 IDE 信任提示（T31，建议受限模式；列出“以下目录未复制：可被 git 识别为仓库”）。`in_review`/`accepted` 接管时 pin 与评审状态不变，交还写回卫星后才按 I2 失效。`human_checkout` 存在期间暂停该 Goal 的自动 rebase（M2）、机会式验证与合并队列（M2）：已在队列中则条目标为 `suspended`（保留位置，`16` §16.1.1）。**只有 Goal 回到 `accepted` 时才恢复**（ADR-104）：`discard_human_edits` 回到 `accepted` → 条目恢复原位置；`hand_back` 使 Goal 离开 `accepted`（进入 `verifying`/`running`/`paused`），条目移除，再次验收后按普通入队排在队尾 | full |
| `goal.hand_back` | `{goalId, confirmSecret?, mode?: "continue_agent" \| "reverify"（只在 `externalResolution:"take_external"` 时可省略且必须省略，ADR-134）, note?, sealNote?, externalResolution?: "take_human" \| "take_external" \| "keep_both", resolvePinHits?: {path, action: "delete" \| "restore_base"}[]}` | `human.decision{hand_back, targetTree: T1, handBack:{mode, externalResolution, resolvePinHits}}`（`02` §2.7）；`note` 或 `sealNote` 匹配机密模式且未带 `confirmSecret:true` → `E_CONFIRM`（ADR-163）；**接管期间卫星被外部写入**（交还第 6 步发现卫星当前树 ≠ B，`B = human_checkout.rebuiltTree ?? T0`）且其中有归因表中“来源不明”的写入时 `externalResolution` 必填，否则 `E_STATE`（存活进程的写入按 `agent_bg` 处理，不要求选择，ADR-128）；人没有改动（T1 == B）时同样如此——交还不短路，唯一定义在 `10` §10.8.4 第 5 步（ADR-182）；三个选项的树级语义与归因**只在 `10` §10.8.4 第 6 步定义**（ADR-122/128），本行不复述；任何选项都不会把外部写入记为人的改动——外部写入仍在时 `external_change` 保留，等待 `goal.external_change.keep`/`.revert`。`resolvePinHits` 在第 7 步按 `10` §10.1.3 删除新增条目或还原为 base 版本，记 `author:"human"`（ADR-118）；**前置条件：`human_checkout` 非空**（否则 `E_STATE`；写回进行中返回 `E_BUSY`，唯一定义见 `inspect.bring_back` 行，ADR-218）；卫星守卫与 `goal.take_over` 相同：`satellite_rebuilding=1` 或 `satellite_missing`（`pause_reason` 或 `also_applies` 中）→ `E_STATE`（ADR-178）；接管期间 Tower 自己的卫星重建按 `human_checkout.rebuiltTree` 计入，不进入第 6 步的外部改动判定（`10` §10.8.4）。① 影子对人工编辑检出计算目标树 T1（写入影子对象库；**一律排除机密本地文件的路径**——不进入 T1、任何检查点或 seal，无论人是否把它们复制进人工编辑检出，ADR-167；与检查点相同去除 gitlink；人新建的仓库形态条目不排除，由随后 pin 的 `pinSafetyCheck` 判定并阻断，ADR-109，R9-D13-01c；`human_edit` 检查点只在写回之后记一次，`10` §10.8.4 第 8 步），先按 `inspect.bring_back` 行“T1 的保留”在影子中写 `refs/tower/<goalId>/handback-t1`（写不成时返回 `E_INTERNAL`，不写 `syncing`、不开始写回，ADR-239），再在同一事务置 `human_checkout.syncState='syncing'` 并写 `human_checkout.targetTree = T1`（T1 的唯一落点，崩溃续写从这里读取，ADR-176）与 `human_checkout.params = {mode, note, sealNote, externalResolution, resolvePinHits}`（本命令的交还参数；②③ 与崩溃续写只从这里读取，③ 写决定时由它生成，ADR-178）；② 文件级同步写回卫星（写回集合的唯一定义在 `10` §10.8.4 第 7 步：`B→T1` 的差异，`B = human_checkout.rebuiltTree ?? T0`；选 `take_human` 时并上 E，ADR-176/180）（不经 git，`O_NOFOLLOW`，ADR-089），每写完一批路径追加到 `written`；③ 检查点归因 `author:"human"`（`landmark:"human_edit"`）——在同一事务中**先写该检查点、后写 `human.decision{hand_back}` 事件**，因此它的 `seq` 小于交还决定，不在由本次交还开启的归因窗口内（ADR-145）；清除 `human_checkout` 与 `takeover_from`；人工编辑检出不删除，原样留作已脱离的副本（`10` §10.2 “人的工作现场不自动删除”，ADR-228）。**`take_external`** 不写回（②），任何情况下都不写 `human_edit` 检查点（①③ 中的检查点），决定中的 `targetTree` 记 T0；清除 `human_checkout` 与 `takeover_from`（检出同样保留）、写 `human.decision{hand_back}` 照常（`10` §10.8.4 第 6–8 步，ADR-176/182/183）。写回前存活进程写入的归属与 `human_edit` 检查点中归为人的路径只以 `10` §10.8.4 第 7、8 步为准（ADR-183）。**由 pin 推导的原因清除**（ADR-103，`07` §7.10.1 推导来源列）：`also_applies` 中的 `verify_failed_limit`、`verify_env_error`、`s0_grant_pending`、`human_change_verify_failed` 删除；`sentinel_high` 仅当其全部未覆盖的阻断命中都是 pin 类时删除——存在 run 类**阻断**命中时保留；这一类的集合只在 `16` §16.1.6 定义（`input_mutated_after_gate` 与 `nested_repo_live`；`sandbox_violation` 为提示性，ADR-110/187），它们按 Goal 作用域保持打开，新 pin 的 `decide` 仍计入阻断，直到 `override_sentinel`（`nested_repo_live` 不可覆盖，条目删除后解除；交还对话框先列出它们）；`sandbox_violation`、`policy_wall`、`post_settle_activity` 等为提示性，不进入 `openSentinels`。“交还即解除”的原因删除，保留原因保留——两类的集合只在 `16` §16.1.1“`pauseReason` 推导来源与交还”一行定义，本行不复述（ADR-208）；`external_change` 在 `take_human` 丢弃外部写入后解除，其余选项保留（ADR-122）。之后（ADR-134）：`take_external` → 只解除 `human`，不写 `pending_hand_back`，继续目标不变（`external_change` 保留）；其余选项 → 写 `pending_hand_back={mode, at, decisionId, returnTo?}`（`returnTo` 取本事务清除之前的 `takeover_from`，∈ {`in_review`, `accepted`} 时才写，`16` §16.1.1，ADR-213），本决定追加到 `pending_openings`（ADR-140），并解除 `human`，由 `onAllReasonsCleared()` 第 1 步执行——`also_applies` 仍非空时 Goal 保持 `paused`（ADR-104；人写的意图不复制，延后执行时从本条 `human.decision{hand_back}` 的 `note` 读取，R9-D4-01b；交还对话框事先如实显示“交还后仍暂停：<原因>；原因解除后将<继续 Agent / 重新验证>”）；为空时立即执行：`continue_agent` → 经 §6.2.4 准入后 `running`，Run `reason:"handback"`（ADR-149；排队时 `queued_run.kind="handback"`），以 `inject(tower.handback)` 开始（`05` §5.8）；`reverify` → `verifying`（新 pin），不开 Run（`pending_openings` 留到下一次 Run）；失败时因存在 `human_edit` 检查点而进入 `paused(human_change_verify_failed)`、不自动返工（ADR-140 归因规则） | full |
| `goal.retry_after_human_change` | `{goalId, note?, confirmSecret?}` | `human.decision{retry_after_human_change}`（ADR-099 拆分，`02` §2.7；`03` §3.2.1 `human_change_verify_failed` 行“交给 Agent”）。前置条件：`pauseReason='human_change_verify_failed'`，**不要求**人工编辑检出。解除本原因，继续目标改写为 `{kind:"run"}`，本决定追加到 `pending_openings`（ADR-140）；Run 以 `tower.handback` 开场（人改动的文件取自 `author:"human"` 的检查点归因，附失败的验证证据） | full |
| `goal.discard_human_edits` | `{goalId}` | `human.decision{discard_human_edits}`（ADR-099/134；语义以 `03` §3.2.1 `human` 行为唯一来源）。前置条件：`human_checkout` 非空且 `syncState='idle'`（写回进行中返回 `E_BUSY`，`inspect.bring_back` 行，ADR-218/219；写回失败时 `syncState` 已退回 `idle`，ADR-220），或（检出已丢失，§6.1.6）`human_checkout` 为空而 `takeover_from` 非空；该 Goal 满足 §6.1.6 Project 不可达一行 ③ 路径丢失确认的条件时（唯一定义在该处，ADR-237/238：按记录判定，`syncing` 时不满足），经确认按检出已丢失处理（不做差异比较；同一事务结束 `human` 角色的 `WorktreeRecord`）。卫星守卫与 `goal.hand_back` 相同：`satellite_rebuilding=1` 或 `satellite_missing`（`pause_reason` 或 `also_applies` 中）→ `E_STATE`（ADR-180）。卫星不动；判定完成后清除 `human_checkout`、`takeover_from`、`takeover_prior_reasons`，人工编辑检出（若存在）不删除，原样留作已脱离的副本（`10` §10.2，ADR-228）。`takeover_from ∈ {in_review, accepted}` 且卫星树 ≠ pin 的树：**比较基准**为接管以来 Tower 最近一次重建卫星所用的树（`human_checkout.rebuiltTree`；检出已丢失、`human_checkout` 已清除，或丢失后再次接管的新检出没有 `rebuiltTree` 时，取接管以来最近一条 `satellite.recovered` 的 `tree`；“接管以来”从保留的 `takeover_from` 所属的第一次接管算起，ADR-213），没有重建时为 pin 的树——Tower 自己的重建不算外部改动（ADR-180，与交还第 6 步同一原则）；卫星树与基准的差异按 `10` §10.3.1 归因表分类——存活进程的写入 → 继续目标改写为 `verify_new{returnTo: takeover_from}`；其余 → 记入 `external_change`（列已存在则路径并入、基线保持首次值，否则 `paths` = 差异路径、`baselineCps` = 比较基准的检查点——接管以来重建过卫星时为记录重建树的检查点（`10` §10.16.2），否则为当前 pin 的检查点，没有时为 pin 本身，`10` §10.3.1，ADR-182/212），**不验证**。然后解除 `human`——但 `takeover_from ∈ {running, ready}`（自 `ready` 接管时继续目标 `run`、`queued_run` 保留，ADR-147），或 `takeover_prior_reasons` 含 `human`（从 `paused(human)` 接管）时**不**解除（只读这两个持久化字段，ADR-140），保持 `paused(human)`，由人显式 `resume`（ADR-137：放弃改动不得自动开 Run）。继续目标在接管时已按 `takeover_from` 写入（`goal.take_over`），本命令不改写。**从不**开 Agent Run | full |
| `goal.delete_kept` | `{goalId, paths: string[], handbackT1?: true, listedAt}` | 删除人的工作现场中由人选中的目录（唯一定义在 `10` §10.2 “人的工作现场不自动删除”，ADR-228）：只接受该处所列、按名字属于该 Goal 的已脱离人工编辑检出与检验目录及各 `<goalId>.kept-*`；`handbackT1: true` 另删除该 Goal 影子中的 `refs/tower/<goalId>/handback-t1`（`paths` 可为空；保留与删除的唯一定义在 `10` §10.3.2，ADR-239；确认框写 `删除之后 Tower 不再保留这次未写完的交还`；`human_checkout.syncState='syncing'` 时续写还要用它 → `E_STATE`）；路径仍在使用中（`10` §10.2 “使用中”唯一定义）→ `E_STATE`；写回进行中（`inspect.bring_back` 行），或该 Goal 的 `goal.take_over`、`inspect.open` 正在本进程中执行（从改名到写入 `human_checkout` 或 `inspect.opened` 的事务）→ `E_BUSY`，本命令执行期间这两条命令同样返回 `E_BUSY`（ADR-229）；所列路径上目录的建立时间晚于 `listedAt`（确认框求值的时刻）→ `E_STATE`；没有 Goal 行的目录按 `10` §10.2 只校验位置与名字形状（ADR-230），所属 Project 因另一个安装的租约而只读时 → `E_STATE`（ADR-231）。界面先显示将丢失的内容（同处；求值的上下文只按 `10` §10.1.2 “已脱离副本的求值”，影子不在时只有文件级信息），确认后逐级 `O_NOFOLLOW` 删除（`10` §10.1.3），结果列出已删除与未删除的路径及原因。不是 HumanDecision、不产生事件：这些目录不是 Goal 的工作区，删除不改变 Goal 状态、卫星、指纹或证据；Tower 从不自动发出本命令 | full（仅本机） |
| `goal.rewind` / `goal.fork`（M2，ADR-059） | 见下文 `run.rewind`、`run.fork_goal` | `human.decision{rewind|fork}` | full |
| `s0.grant` / `s0.deny` | `{goalId}` | `human.decision{grant_s0_exec\|deny_s0_exec}`；`s0_grant` 列变为 `granted`/`denied`。在 `paused(s0_grant_pending)` 时：授权或拒绝 → 都只解除本原因，继续目标 `verify{pin}` 不变，以同一 pin 验证（ADR-134）；拒绝时该次验证不执行 exec 标准，artifact 失败与阻断命中照常由 `decide()` 判定（唯一定义在 `07` §7.10.3 `decide()`，ADR-188）。在 `in_review`/`accepted` 时授权 → `verifying`（ADR-077）。在其他暂停中（`s0_grant_pending` 既不是 `pause_reason` 也不在 `also_applies` 中）授权或拒绝只写 `s0_grant` 列、不改变状态与继续目标，也不开始验证（ADR-212）。`use_defaults` 下超时由系统写入 `denied_timeout`，按拒绝处理（同上，不改写继续目标），不是人的决定。远程批准的授权按远程授权的统一有效期（唯一定义在 `11` §11.9，ADR-176）：同一事务写 `s0_grant_expires_on`（Run 中批准 → `run_end`，没有 Run 时 → `next_run_start`），到达该事件时在 `run.ended`/`run.started` 的同一事务中把 `s0_grant` 置回 `none` 并清除该列；本机批准不写（ADR-179） | decide（远程批准时有效期受限，`16` §16.5） |
| `test.quarantine` | `{goalId, testId, note}` | `human.decision{quarantine_test}`（`07` §7.4.6） | decide（仅本机：改变验收依据，与 `sentinel.override` 同类，`16` §16.5，ADR-178） |
| `project.approve_docker` | `{projectId}` | `human.decision{approve_docker}`（ADR-037，单向门级项目设置） | full（禁止远程） |
| `project.merge` / `project.split` | `{projectIds}` / `{projectId, checkoutPath}` | `human.decision{merge_projects}` + `audit.project_merged`；拆分为 `human.decision{split_project}` + `audit.project_split`（ADR-028、ADR-069、ADR-080）。旧位置（ADR-238）：合并时保留的 Project 的 `settings.relocatedFrom` 取两者的并集（按 `wtRoot` 去重），被并入一方的 `<wtRoot>` 与保留方不同时一并追加，`defaultCheckout` 取保留方的；拆分出的 Project 不继承 `relocatedFrom` 与 `defaultCheckout`，旧位置仍记在原 Project 中——所以合并与拆分都不使已知位置脱离追踪（列出范围仍只按 `10` §10.2 “列出的来源”） | full（禁止远程） |
| `project.relocate` | `{projectId, newCheckoutPath?, worktreeRoot?: string \| null}`（至少一项；ADR-236） | 绑定处理（`10` §10.1.1 “迁移”与 §10.16.2 情形 C、D、F 的唯一命令）：`newCheckoutPath` 须是可访问的用户检出，按添加项目的同一检查（`10` §10.3.0）其 `Project.identity` 与本 Project 相同，且不在任何 `.tower-wt.noindex/` 或 `worktreeRoot` 之下、不带卫星标记（`10` §10.1.1），否则 `E_STATE`；作用于该 Project 中附着检出不可访问的非终态 Goal（不含 `integrated`，下同）的 binding，没有这样的 binding 时作用于全部非终态 Goal 的 binding（人在项目设置中主动迁移；有多个附着点时附着在其他检出上的 Goal 一并改指、按情形 F 重建，如实登记的取舍），并把它记为“默认检出”（`Project.settings.defaultCheckout`，`02` §2.3）；受影响的 Goal 有活跃 Run、写回进行中、准备中（`10` §10.3.1）、卫星重建中（`satellite_rebuilding=1`）、接管物化中或验证进行中时 `E_BUSY`，`human_checkout.syncState='syncing'` 而写回已不在进行（不可达期间中断的写回）时 `E_STATE`，错误文字列出这些 Goal：`写回未完成：<目标>——可达后自动续写，或先放弃这些目标（交还的改动已保存在 Tower 中）`（ADR-237/239；迁移作用于该 Project 的一组 binding，`worktreeRoot` 又是 Project 级设置，所以不跳过个别 Goal；这时项目设置与卡片都不提供迁移，改为写出这些目标与出口，`12` §12.6.5 检查 i 一行；放弃它们不丢失交还的改动，`inspect.bring_back` 行“T1 的保留”）。`worktreeRoot` 写 `Project.worktreeRoot`（`null` 回到默认位置），作用于全部非终态 Goal。迁移后的每个新 `<wtRoot>` 须可访问，或可按 §6.1.6 “Tower 不重新建立根”建立，否则 `E_STATE`（`工作目录位置不可访问：<路径>`，ADR-239）。每个 binding 更新 `attach`、镜像改从新检出 fetch，记 `binding.reattached{from, to}`；`<wtRoot>` 随之改变的按 `10` §10.16.2 情形 F 在新位置重建卫星（新位置的 `goal` 角色 `WorktreeRecord`（`rebuilding`）与 `satellite_rebuilding=1` 在迁移的同一事务中写入、先于重建开始，所以新根从此是该 Goal 的必需路径——重建中途崩溃按 §6.1.6 “卫星重建中途崩溃”一行续做，新根在重建中变为不可访问时按失败先判可达判为中断、由 ④ 续做，ADR-239；重建来源与步骤按情形 E，接管期间只用接管时的检查点；Pi 会话经 `SessionManager.forkFrom` 迁移，迁移本身不开 Run，分叉出的会话供下一次 Run 使用）。**旧位置的记录**（唯一定义，ADR-237；§6.4.3 `privacy.purge`、`09` §9.12.4 与 `10` §10.2 “列出的来源”引用）：只对 `<wtRoot>` 确实改变的 Goal 执行（ADR-238：设置了 `worktreeRoot`，或新旧检出在同一父目录下同名时 `<wtRoot>` 不变，这时只改 `attach` 与 `defaultCheckout`，不追加、不结束任何记录、不重建）——同一事务把旧的检出路径与旧 `<wtRoot>` 追加到 `Project.settings.relocatedFrom`（`[{checkoutPath?, wtRoot, at}]`，`02` §2.3；按 `wtRoot` 去重，已有同一 `wtRoot` 的条目只更新 `at`；与本次迁移后的新 `<wtRoot>` 相同的条目移除——迁回旧位置时它又是当前位置），并结束这些 Goal 在旧位置的 `goal`、`verify` 角色 `WorktreeRecord`（`inspect`、`human` 角色仍在使用的照旧，旧路径不再回来时按 §6.1.6 ③ 的路径丢失确认结束）；旧位置的目录 Tower 不自动删除，但仍是已知位置：存储面板列出其中 Tower 创建的目录（卫星、`_gitdirs`、`_stores`、`_verify`，标 `迁移后遗留`，可一键删除）与人的工作现场（ADR-228），清除把旧 `<wtRoot>` 写入 `roots`；不可访问时注明 `不可访问`；旧 `<wtRoot>` 仍是其他 Goal 当前的位置时（多附着点）同样追加，其中仍有当前 `WorktreeRecord` 的目录不列为遗留（列出范围只按 `10` §10.2 “列出的来源”），所以活跃的卫星不会被列出或删除；迁回旧位置时新位置上已有的同名目录按 `10` §10.16.2 情形 F 改名保留、从不覆盖或复用（ADR-238）。不可访问的旧卫星中最后一个检查点之后的改动不会带到新位置，确认框写明（如实登记）；人工编辑检出与使用中的检验检出所在的旧 `<wtRoot>` 仍是该 Goal 的必需路径（§6.1.6 Project 不可达一行，ADR-238） | full（仅本机：选择本机路径并改变 seal 的写入目标，§6.4.7） |
| `memory.resolve_sync_conflict` | `{memoryId, choice}` | `human.decision{resolve_sync_conflict}`（`09`；只用于记忆同步，**M2–M3**，ADR-059） | full |
| `inspect.bring_back` | `{goalId, sealNote?}` | `human.decision{bring_back_inspection, targetTree: T1}`（ADR-099/105；`10` §10.8.3 第 7 步）。前置条件：`state ∈ {in_review, accepted}`、检验检出 `<wtRoot>/_inspect/<goalId>` **使用中**（`10` §10.2 唯一定义：检验打开中，或以 `keep` 关闭待处理；已脱离的检验目录——`[不带回]`、没有修改的关闭、验收或放弃触发的清理之后——只能 `删除`，带回返回 `E_STATE`，ADR-229；使用中而目录已不存在时同样返回 `E_STATE`，`10` §10.2，ADR-230）、卫星树等于 pin 的树（以 T_pin 为基线），且无 `human_checkout`。持该卫星的 `wtLock`，并抑制该 Goal 的 I2 文件事件触发；影子对检验检出计算目标树 T1（写入影子对象库），按下文“T1 的保留”先写 `handback-t1`（写不成时返回 `E_INTERNAL`、不开始写回，ADR-239），再在同一事务写 `human_checkout={path:<检验检出>, baseTree:T_pin, createdAt, syncState:'syncing', targetTree:T1, params:{sealNote}}`（T1 与参数的唯一落点，ADR-176/178）；文件级写回卫星（`O_NOFOLLOW`），逐批追加 `written`；写回后记 `author:"human"`、landmark `human_edit` 的检查点，`humanPaths` = 写回集合中改动的路径（`10` §10.8.3 第 7 步，ADR-211）；一次性重算指纹并全量执行嵌套仓库早期预警扫描，**单一事务**清除 `human_checkout` 并转入 `verifying`（新 pin，`verifyOrigin:"human_change"`；I2 不再另行触发 `fp_changed_human`），检验目录不删除，原样留作已脱离的副本（`10` §10.2，ADR-228）。`accepted` 时先出合并队列（不保留位置；合并队列属 M2，M1 中没有这一步）。**写回进行中**（唯一定义，ADR-217/218/219；`goal.hand_back`、`goal.discard_human_edits`、`goal.abandon` 三行与 `16` §16.1.12 `ProtoError.code` 引用）：`human_checkout.syncState='syncing'` 且这次写回正在本进程中执行——交还（`goal.hand_back` 的 ① 到 ③）、本命令的带回（写入 `syncing` 的事务到转入 `verifying` 的事务），或 §6.1.6 的启动续写，以及在 §6.8 F8 待补失败出口列表中的写回（ADR-234）——期间，该 Goal 上其他会改写其状态、暂停原因、继续目标、开场或 `human_checkout` 的命令（如 `goal.abandon`、再次 `goal.hand_back` 或 `inspect.bring_back`、`goal.discard_human_edits`、`goal.request_changes`、`contract.amend`、`goal.accept`、`sentinel.override`、`goal.openings.withdraw`、`needs_you.answer`），以及 `inspect.close`、`goal.delete_kept`，返回 `E_BUSY`，界面显示“稍后重试”；这一判定先于各命令自己的前置条件（所以这期间 `inspect.bring_back` 返回 `E_BUSY`，不按“无 `human_checkout`”返回 `E_STATE`）。接管期间的自动重建（写 `human_checkout.rebuiltTree`）等写回结束再开始（两者都持 `wtLock`）。**T1 的保留**（唯一定义，ADR-238；ADR-239 改为在写回开始之前写入；`goal.hand_back`、`goal.abandon` 两行，§6.1.6 Project 不可达一行与人工编辑检出一行，`10` §10.2、§10.3.2，`09` §9.12.4 与 `04` §4.6.7 引用）：交还与带回在 T1 写入影子对象库之后、写 `syncing` 的事务之前，先在影子中写 `refs/tower/<goalId>/handback-t1`（以 T1 为树的一个提交；已有时改指它；只写 `~/.tower`）；写不成时命令返回 `E_INTERNAL`，不写 `syncing`、不开始写回。所以从写回开始到它成功完成，T1 一直被这个 ref 引用——不论写回在本进程中失败、因不可达中断多久、其间影子 gc 运行多少次（`16` §16.2.6），T1 都不会被回收，续写也不会缺对象。**只有写回成功完成**（交还完成、带回转入 `verifying` 的事务提交之后）时 Tower 删除它；写回失败（下文 ①–④，含 ① 的物化也失败）、放弃与其他任何出口都不删除它，放弃时也不需要另写。之后它只由你删除（存储面板）或随清除该 Goal 删除（清除确认框列出它），不按时间删除——保留与删除的唯一定义在 `10` §10.3.2。成功的事务提交之后、删除之前崩溃时它留下，照常列出，下一次写回成功时删除或由你删除（如实登记）。目标页在 `保留的目录` 一行之后列出 `未写完的交还（保存在 Tower 中）` 与取回方式：以只读的 git 命令从影子中的这个 ref 导出文件，由你执行，Tower 不替你写出（`goal.resurrect` 复活出的新 Goal 不带入它，取回方式不变）。写入它同样触发一次备份 bundle（`10` §10.16.3）。**写回在本进程中失败**（唯一定义，ADR-219/220；文件系统错误、目标目录不可写、卫星在写回中途消失；`10` §10.1.3 逐路径“跳过并在结果中列出”的情形不算失败；先按 §6.1.6 Project 不可达一行的“失败先判可达”判定，来源目录或卫星所在的根不可访问时视为中断、不按本段处理，ADR-236；根可访问而来源目录或卫星已不在时按本段处理，ADR-238）：停止写回，按下列步骤结束，**任何分支都不留下 `syncing`**：① 来源目录已不存在时（所在的根可访问，ADR-238；T1 是人的改动仅剩的副本），先以 T1 重新物化它——交还按 `10` §10.8.4 第 2–3 步（内容取 T1，索引仍取 T0，人看到的仍是相对交接时刻的改动，依赖在后台准备），带回按 `10` §10.8.3 第 1 步（内容取 T1，不重新播种、不执行第 3 步）；物化在同一父目录的旁路目录中完成，完毕后以 `renameat` 改名到原路径（与情形 E 相同；原路径此时已存在则不覆盖，旁路目录按 `10` §10.2 “Tower 自动改名保留”改名并列出，条目不写“重新建立的”，ADR-222），所以中途崩溃留下的只是旁路目录，原路径仍不存在、`syncing` 仍在——§6.1.6 续写之前丢弃该旁路目录，续写再失败时重新执行本步（ADR-221）；② 把整个写回集合（`10` §10.8.4 第 7 步；带回为 §10.8.3 第 7 步的同一取法）还原为写回之前的版本——不只 `written` 中记下的路径：它是批量提交的，崩溃之后续写再失败时，崩溃前已写而未记入的路径同样要还原；当前内容已等于还原目标的路径跳过，所以本步幂等（ADR-221）：交还取写回之前最近的检查点（第 6 步的 safety 或第 7 步的 `agent_bg_done`，都没有时为 B）中的版本，带回为 T_pin 中的版本；对象都在影子中，按同一写回规则写；勾选删除的 `.git` 等价条目不还原（人的显式选择，`10` §10.8.4 第 7 步）；③ 一个事务把 `human_checkout` 退回写回之前的状态（交还：`syncState='idle'`，清除 `targetTree`、`written`、`params`；带回：清除 `human_checkout`），不写决定，Goal 状态不变，并在同一事务中生成 ④ 的 Needs-You（不因此后的崩溃丢失告知，ADR-221）；带回时该事务提交之后解除写回期间对 I2 的抑制，按提交后的状态重新求指纹（卫星停在半写的状态时照常触发 I2，ADR-223）；还原没有完成（还原出错，或卫星已不在）时，仍在原位的卫星先在该事务之前按 `10` §10.2 “Tower 自动改名保留”改名（工作目录与 gitdir 各自改名、不删除；改名之后、事务之前崩溃时 `syncing` 仍在，重启续写因卫星已不在而失败，再进入本步，ADR-221；改名本身失败时不置标记、不重建，只生成 ④ 的条目并写明工作目录未恢复，ADR-222；只有一半改名成功——工作目录与 gitdir 之一已改名——时按改名成功处理：先按情形 E 的“另一半”改名保留仍在原位的一半，再在下述同一事务中置标记、重建（唯一定义在 `10` §10.16.2 情形 E，ADR-223/224/225）），然后同一事务置 `satellite_rebuilding=1`，卫星按 `10` §10.16.2 情形 E 的重建来源与步骤重建（接管期间只用接管时的检查点 k——第 6、7 步若已建更新的检查点 n，告知写“检查点 n 的改动未进入工作目录，仍在检查点 n 中”，不写“无法恢复”；带回时为最新检查点 → pin → base），重建失败按情形 E 升级为 `satellite_missing`；④ 命令返回 `E_INTERNAL`（`detail` 为失败的步骤、路径与原因），界面显示原因；③ 的事务中生成的 Needs-You 为 `stalled`，子类型 `write_back_failed`（severity 2，去重键与出口分类见 `08` §8.4、§8.8），写明交还（或带回）没有完成、生成时你的副本保留在原路径（① 时写明是 Tower 以你交还时的内容重新建立的）、工作目录已恢复或正在重建（条目随之后的事件关闭，`08` §8.4）。启动续写失败时没有命令可回，只有这一条。人工编辑检出或检验目录**保留**，此后由人决定：交还的出口是再次 `goal.hand_back`（重建进行中返回 `E_STATE`，与卫星守卫相同）或 `goal.discard_human_edits`；带回的出口是再次 `inspect.bring_back`（重建进行中卫星树不可求，返回 `E_STATE`；不需要重建或重建树等于 pin 的树时前置条件都成立：检验目录仍在使用中（失败的带回不结束检验）、无 `human_checkout`、卫星树等于 pin 的树；重建树不等于 pin 的树时情形 E 触发 I2、Goal 转入 `verifying`，检验目录保留，回到评审之后再带回按 `10` §10.8.3 第 7 步的冲突处理，ADR-221）或 `inspect.close`；`goal.abandon` 都照常可用。① 的物化也失败时，该条目如实写“你的改动未能保留在目录中，仍保存在 Tower 中（目标页写明如何取回）”（③ 清除 `targetTree` 之后 T1 仍由 `handback-t1` 引用，上文“T1 的保留”；ADR-239 取代 ADR-222 的“此后不可恢复”），交还随后按 §6.1.6 检出丢失一行处理。所以 `syncing` 只存在于本进程中正在写的有限时间内、崩溃到重启之间（由 §6.1.6 在接受命令之前续写），以及 §6.8 F8 的只读期间（解除时消除，唯一定义在 F8，ADR-234）与该 Goal 不可达期间（可达之后由 §6.1.6 人工编辑检出一行续写，唯一定义在 §6.1.6 Project 不可达一行，ADR-235）；命令与自动转移从不在“写回已不在进行而 `syncing` 仍在”的状态上执行，只有一个例外：该 Goal 不可达期间的 `goal.abandon`，它在同一事务中清除 `human_checkout`（`goal.abandon` 行，ADR-237；`project.relocate`、`goal.discard_human_edits` 与 `inspect.close` 对这样的 Goal 返回 `E_STATE`，§6.1.6 ③）；清除 `targetTree` 而写回没有完成的只有本段的 ③ 与这一例外，两者之后 T1 都仍由 `handback-t1` 引用（上文“T1 的保留”，ADR-239），所以没有任何出口使 T1 成为不被引用的对象；所以 DDL 的 CHECK（§6.3 `goals`）只需要允许写回中的 `in_review`/`accepted`。崩溃恢复见 §6.1.6。无改动 → `E_STATE`（提示“检验检出没有改动”；只有 `10` §10.8.4 第 5 步按名字排除的凭据形路径与 T_pin 不同时，提示改为“检验检出中只有名字形如凭据、不在 base 中的文件有改动，它们不会带回：<路径>”，检验目录保留，ADR-226） | full |
| `inspect.close` | `{goalId, modified?: "discard" \| "keep"}` | 关闭检验检出（清理的唯一定义在 `10` §10.8.3 第 7 步，本行是它的命令，ADR-208）：停止服务、回收端口段，以临时索引比较检验目录与 T_pin。没有修改 → 检验结束；有修改而未带 `modified` → `E_STATE` 并列出被修改的文件（界面据此给出 [不带回] [作为人工改动带回目标]（`inspect.bring_back`）[稍后决定是否带回]）；`discard` → 不带回，检验结束；`keep` → 检验就此关闭（服务已停、临时目录已删）而目录仍待处理，卡片显示 `◇ 检验目录有未处理的修改`，之后的出口是再次 `inspect.close{modified:"discard"}`（服务已停时只比较）或 `inspect.bring_back`（照常要求 `in_review`/`accepted` 与该行的前置条件），Goal 被验收或放弃时按第 7 步结束。各情形都不删除目录，结束之后它是已脱离的副本（`10` §10.2 “人的工作现场不自动删除”，ADR-228）。产生事件 `inspect.closed`；不是 HumanDecision：检验目录不是 Goal 的工作区，关闭不改变 Goal 状态、卫星、指纹或证据。检验目录不在使用中（`10` §10.2 唯一定义；含已脱离的目录）→ `E_STATE`（ADR-229）；使用中而目录已不存在时不比较、照常结束检验（同处，ADR-230）；该 Goal 满足 §6.1.6 Project 不可达一行 ③ 路径丢失确认的条件时（唯一定义在该处，ADR-237/238：按记录判定；带回的写回中断而 `syncing` 时不满足，返回 `E_STATE`），经确认按同一分支结束检验（同一事务结束 `inspect` 角色的 `WorktreeRecord`） | decide（仅本机） |
| `criterion.check_human` | `{goalId, criterionId, pass: boolean, note?}` | `human.decision{check_human_criterion}`（`07` human 标准） | decide |
| `run.abort` | `{runId}` | 同 pause，`outcome_reason: human_abort` | decide |
| `run.steer` | `{goalId, text, timing: "now"|"batch", confirmSecret?}` | `comment.created{anchor:goal}` → outbox。`text` 匹配机密模式时返回 `E_CONFIRM{reason:"looks_like_secret"}`，带 `confirmSecret:true` 重发才发送（ADR-163） | decide |
| `run.rewind`（M2，ADR-059；M1 只在时间线上显示检查点） | `{goalId, target: {piEntryId} \| {projectId, checkpointN}, mode: "both"\|"code"\|"conversation"}` | 前置守卫（ADR-145）：`external_change` 未解除 → `E_STATE`（先 `keep`/`revert`，与 `take_over` 相同）；drain 已在进行 → `E_BUSY`。以 `draining_for={target:"rewind", …}` drain（ADR-141）→ `navigate` + `restoreCheckpoint`（`05` §5.8，`10` §10.8）。**多仓库规则以本行为准**（lint U1 裁决；`10` §10.13 尚未收录，需同步）：按 `piEntryId` 回退时，**每个仓库**恢复到会话树路径上该条目最近的、带本仓库检查点的祖先（`10` §10.7.1）；某仓库在该路径上没有任何带检查点的祖先（首次改动发生在该条目之后）→ 恢复到该仓库的 `baseCommit`（R7-D13-02a）。检查点处于降级档位（`10` §10.7.2：每 3 个有变更回合一次）时，恢复点可能早于该条目，回退确认框标注“恢复到第 n 回合的最近快照”。`{projectId, checkpointN}` 只回退单个仓库的代码（`mode:"code"`）。**回退到非回合检查点**（`agent_bg_done`、`human_edit`、`external_change_kept` 等，参数 `{checkpointN}` 指向它；**M2**，M1 只在时间线上显示，ADR-127）：对话侧 `navigate` 到它之前最近的回合 entry，代码恢复为该非回合检查点的树，并附一条 steer“代码已回到 <landmark> 时的状态” | full |
| `run.fork_goal`（M2，ADR-059） | `{goalId, target: {piEntryId} \| {projectId, checkpointN}}`（多仓库 Goal 按 `piEntryId` 取每个仓库的检查点，规则同 `run.rewind`，含回落到 `baseCommit`） | 前置守卫：源 Goal 有活跃 Run → `E_BUSY`（先暂停；打开源会话文件可能修补它，`10` §10.8，ADR-182）。`goal.created{forkedFrom}` | full |
| `comment.create` / `comment.edit` / `comment.delete` | `create`：`{goalId, anchor, body, timing: "now"|"batch", requiresChange, confirmSecret?}`；`edit`：`{goalId, commentId, body?, timing?, requiresChange?, confirmSecret?}`；`delete`：`{goalId, commentId}`（ADR-213） | `comment.*`。`edit` 把 `requiresChange` 由 `true` 改为 `false` 即“人关闭”该评论（唯一定义 `05` §5.7.3，ADR-212）。`delete` 只删除尚未送达的评论；已送达的评论返回 `E_STATE`（“已送达的评论不能删除；不再需要时请关闭”），`edit` 对已送达的评论同样只接受“人关闭”（只带 `requiresChange: false`），改 `body`、`timing` 或把 `requiresChange` 改回 `true` 返回 `E_STATE`（模型看到的是已送达的文本，ADR-214）；所以必须修复评论只经“人关闭”退出验收闸门、留下 `你已关闭` 的回执（ADR-213）。远程端是否保留关闭（`16` §16.5 三端 ✓）与总规则 3 的关系随 `serve`（M2）复审。`create`/`edit` 的 `body` 匹配机密模式时返回 `E_CONFIRM`（评论会经 `request_changes` 或转向进入模型上下文，ADR-163） | decide |
| `comment.send_batch` | `{goalId}` | outbox `follow_up` | decide |
| `needs_you.answer` | `{itemId, optionId?, text?, confirmSecret?}` | `human.decision{answer|approve_action|deny_action}` → `answerUi`（条目所属的 Run 仍活跃时）；没有活跃的 Run 时（继续目标为 `settle`，或条目所属的 Run 已结束、条目不再阻塞 `claimed`）不送达，本决定追加到 `pending_openings`，在之后的 Run 中送达（`03` §3.2.1 `question_timeout` 行，`05` §5.5，ADR-176/178；准备第 ③ 步中追加的不在这次开场中，留给下一个 Run，ADR-184）。（含对已回答条目的重新回答）`text` 匹配 `11` §11.7 的机密模式时，命令返回 `result{ok:false, error:{code:"E_CONFIRM", detail:{reason:"looks_like_secret"}}}` 而不发送；UI 提示“这看起来像机密，发送后会进入模型上下文”，人确认后带 `confirmSecret:true` 重发（ADR-162） | decide |
| `needs_you.snooze` | `{itemId, until}` | `human.decision{snooze}`、`needs_you.snoozed`。`until` 只取 `16` §16.2.4 登记的选项；阻塞类条目（`08` §8.8）的 `until` 不超过登记的上限，否则 `E_INVALID`（ADR-183） | decide |
| `needs_you.dismiss` | `{itemId}`（不带原因：`not_actionable` 已删除，ADR-178；`reason:"obsolete"` 已删除，ADR-180） | 前置守卫：阻塞类条目（对话框仍在等待，或对应其 Goal 当前的暂停原因或 drain 中的待暂停原因；唯一定义在 `08` §8.8）→ `E_STATE`（只能作答、拒绝或延后，ADR-182/183）。`human.decision{dismiss}`、`needs_you.resolved{by:human}`；人按 `X` 关闭按 `08` §8.8 该 kind 的“关闭”一格定类，未单列的记 `false_positive`（`obsolete` 只由自动解决产生），用于精度统计 | decide |
| `claim.ratify` / `claim.reject` | `{claimId, note?}` | `human.decision{ratify_claim|reject_claim}` | decide |
| `subgoal.approve` | `{claimId, titles[]}` | `goal.created{parentId}` × n；子目标属 **M2**（`04` §4.2.4） | full |
| `memory.ratify` / `memory.reject` / `memory.edit` / `memory.retire` | `{memoryId?, …, confirmSecret?}` | `human.decision{ratify_memory|reject_memory|edit_memory|retire_memory}`、`memory.*`；`ratify` / `reject` 属批准队列（**M2**，`09` §9.0.1）；`edit` 省略 `memoryId` 时新建一条人手写的 User / Project 记忆，同样记 `edit_memory`，这是 M1 唯一的记忆写入路径（ADR-206）；复审的“保留”（只顺延 `reviewAfter`）与退役条目的“恢复”（`status` 改回 `active`、清除 `retiredReason`）也经 `edit`（`09` §9.4，ADR-207）；`edit` 中人写的文本匹配机密模式 → `E_CONFIRM`（ADR-164） | full |
| `review.mark_unit` | `{unitId, state, dwellMs}` | `review.unit_marked`（有效评审时减少积压的 P，ADR-014） | decide |
| `goal.accept` | `{goalId, integrate: "local_merge"\|"push_pr"\|"branch_only"\|"none", newBranch?: true}`（`newBranch` 由人在上一次返回 `branch_checked_out` 后确认发出：写入新分支 `B₀-v<k>`、从不改动 B，服务端不要求上一次的返回，`10` §10.6 检出守卫，ADR-192/193；前三个取值同 `10` §10.12 的集成模式，`none` 不是集成模式、见本行；`local_merge` 与 `push_pr` 为 M2，M1 只接受 `branch_only` 与 `none`，ADR-133） | 先对已验证 pin tree 执行 `pinSafetyCheck`（ADR-109，结果应与验证时相同；存在未覆盖的命中 → `E_STATE`）→ `human.decision{accept}`（含合同版本和各评审单元的 contentHash）、`goal.state_changed(→accepted)`。**M1 的顺序与写入失败**（`branch_only`，以及从 `in_review` 选 `none`；ADR-189）：闸口通过后先在 git worker 中 seal 并在用户仓库写分支（`10` §10.6；其间到达的该 Goal 的其他转移排在本命令的事务之后、按届时的状态处理），写入成功后才在**同一事务**中记上述决定与转移以及 `integration.performed`；seal 或写分支失败（分支前缀冲突、ref 锁、磁盘、仓库不可写等）时命令返回 `E_INTERNAL`（`detail` 写失败的步骤与原因），**不记决定，Goal 仍在 `in_review`**，验收面板显示原因与“重试”。**写后窗口**（ADR-190/191）：分支已写而事务未提交（崩溃或数据库写入失败）时不回退分支，没有决定；重试与之后的每次验收都按 `10` §10.6 重新 seal 表判定——表按 sha 认出 Tower 自己写过的分支，树与说明都相同时复用已写的 seal、直接提交事务，否则在该分支上快进；所以只要其间没有人改动该分支，就不另开 `-v<k>`，也不说明“已有你的提交”（启动时不检查，§6.1.6 M1 行）。`E_INTERNAL` 的 `detail` 在这里为 `{step, reason}`，`step` ∈ `prefix_conflict` · `seal` · `write_branch` · `branch_checked_out` · `repo_busy` · `commit`（`04` §4.6.5 按 `prefix_conflict` 显示 `[修改分支前缀]`，ADR-191；按 `branch_checked_out` 显示“正被检出”一行与 `[写入新分支]`，ADR-192；按 `repo_busy` 显示“进行中的 <操作>”一行与 `[重试]`，ADR-193；`seal` 只指影子中生成 seal 失败，M1 不签名）。写分支前一律先过 `10` §10.6 的进行中操作守卫与检出守卫（先判前者，ADR-194）：任一工作树中有进行中的 rebase、merge、cherry-pick、revert、am 或 bisect 时不写入、返回 `repo_busy`；要写的分支正在用户的任一工作树中被检出时不写入、返回 `branch_checked_out`。**验收延续**（`07` §7.10.3）在 M1 中回到 `accepted` 时同样先写分支（按 `10` §10.6 重新 seal 表，不记人的决定；Goal 在 `verifying`，其间到达的转移与写后窗口同上），成功后在同一事务记转移与 `integration.performed`；重新 seal 表落在另开 `B₀-v<k>` 的行（撤销后，或 B 的顶端不是 Tower 自己的 seal）、分支正被检出（检出守卫，ADR-192）、仓库中有进行中的 git 操作（进行中操作守卫，ADR-193），或写入失败时，不延续，进入 `in_review`（只需重看变化的单元，面板写明原因，`04` §4.6.5）。所以 M1 中经 `goal.accept` 或验收延续进入 `accepted` 时，总有一条树等于该次 pin 的树的 `integration.performed`。**`integrate:"none"` 即“验收但不合并”**（`03` `accepted → archived` 的唯一入口，不另设命令与决定种类，ADR-187）：在 `in_review` 中按 `branch_only` 验收（同一闸口、seal、在用户仓库写分支，与“只保留分支”相同），在 `integration.performed` 的同一事务再 `goal.state_changed(accepted→archived)`，分支保留，已验收的改动因此仍可从你的仓库取回（ADR-188）；在 `accepted` 中（seal 分支已写、尚未合入）不重做闸口；**归档前核对分支**（ADR-189）：最近一条 `integration.performed` 的 `branch` 不在用户仓库中（例如已被删除）时，先以该条的 `sha`（影子中的 seal，M1 不签名，ADR-193）从影子重写同名分支，写入失败、正被检出或仓库中有进行中的 git 操作时同样返回 `E_INTERNAL`、不归档；然后只记 `human.decision{accept}`（`integrate:"none"`，记在 `decisions.payload`；合同版本与各单元 contentHash 沿用上一次验收的值，ADR-188）与 `goal.state_changed(accepted→archived)`，分支保留；其他状态 `E_STATE`。归档是终态：人可能已合入而 Tower 尚未观测到，Goal 仍以未合并归档，之后不再判定 `integrated`（北极星只计入合入的 Goal，`14` §14.6.1，ADR-188）。归档后的卫星清理按 `10` §10.3.2，开场队列不再送达（`16` §16.1.1 `Goal.pendingOpenings`）。**重新 seal**（ADR-136/178/181/182，再次验收时）：分支、父提交与 `-v<k>` 的命名只按 `10` §10.6 重新 seal 表（唯一定义；按 `integration.performed` 的写入记录判定，不按 git 祖先关系），本行不复述；不改写用户已改动的分支时在验收面板中说明 | decide（远程须满足 §6.4.7 的条件） |
| `goal.request_changes` | `{goalId, commentIds, fresh?: boolean, confirmSecret?}` | `human.decision{request_changes}`。所引用评论的正文匹配机密模式且未带 `confirmSecret:true` → `E_CONFIRM`（ADR-163）。`in_review`/`accepted`：本决定追加到 `pending_openings`，`run.requested{rework}`。`paused(sentinel_high)` 中（ADR-137/140）：只解除 `sentinel_high`，把继续目标改写为 `{kind:"run"}`、本决定追加到 `pending_openings`（评论与返工证据在开场组装），不直接发 `run.requested`。守卫（ADR-107/110/187）：Goal 存在任一未解除的阻断 run 类命中（集合只在 `16` §16.1.6 定义：未覆盖的 `input_mutated_after_gate`、仍存在的 `nested_repo_live`）时返回 `E_STATE`——返工产生的新 pin 仍会被同一命中阻断；前者的 Needs-You 与暂停卡片只提供“覆盖（写明原因）”与“放弃”，后者的出口只有 `03` §3.2.1 所列三项 | decide |
| `goal.undo_integrate` | `{goalId}` | 只在 `integrated` 的 24 h 宽限期内允许，否则 `E_STATE`。M1 不写用户仓库：不生成撤销提交或分支，Goal 页写出要由人完成的撤销（唯一定义 `10` §10.12，ADR-193；在用户仓库生成撤销草案属 M2）；同一事务 `goal.state_changed(integrated→accepted)` 并写 `integration_reverted_seal = <被撤销的 seal>`（界面显示 `reverted` 标记）；此后该 seal 不再触发 `integrated`；事务之后立即补做一次外部写入检测（宽限期内的写入，`10` §10.3.1，ADR-194）；出口沿用 `accepted` 的现有出口，不提供直接复活（ADR-176） | full |
| `goal.abandon` | `{goalId, reason, text?}` | `human.decision{abandon}`、`goal.state_changed(→abandoned)`。任何非终态可放弃（交还或带回的写回正在本进程中执行时返回 `E_BUSY`，写回结束或失败后即可放弃，唯一定义见 `inspect.bring_back` 行，ADR-218/219）；从 `integrated` 放弃只结束 Goal，不撤销合入，base 中的改动不受影响，分支按 `abandoned` 保留（`10` §10.3.2，ADR-195）；准备阶段中同样允许，先中止准备；清除 `queued_run`（ADR-148/149）；从 `paused` 放弃时同一事务清除 `continuation`、`pending_hand_back`、`pause_reason`、`also_applies` 与 `external_change`，从 `paused(human)` 放弃时另清除 `human_checkout`（目录本身按 `10` §10.8.4 保留）（DDL 的 CHECK 要求离开 `paused` 时这些列为空，与 `integrated` 出口对称，ADR-214/215）；从 `in_review`/`accepted` 放弃而 `human_checkout.syncState='syncing'`（写回因不可达中断而留下，§6.1.6 ②）时同一事务同样清除 `human_checkout`（CHECK 不允许 `abandoned` 带它；检验目录按 ADR-228 保留，写回到一半的卫星随 Goal 进入终态、按终态的到期删除处理，ADR-237）；**写回中断时放弃**（ADR-238/239）：放弃时 `human_checkout.syncState='syncing'`（从 `paused(human)` 或 `in_review`/`accepted` 放弃，只在该 Goal 不可达期间可能）——交还或带回的改动还没有写完，T1 可能是它仅剩的副本（人工编辑检出可能随卷丢失）——T1 已在写回开始之前由 `refs/tower/<goalId>/handback-t1` 引用（唯一定义 `inspect.bring_back` 行“T1 的保留”），放弃不写任何东西、不访问不可访问的路径；确认框写明 `交还（或带回）的改动尚未写入工作目录：Tower 在影子中保留一份，直到你在存储面板中删除它或清除该目标（目标页写明如何取回）；你的副本留在 <路径>`；从 `running` 放弃时同一事务清除 `draining_for`，以及只由其 `reasons` 引起的 `external_change`（同样是 CHECK 的要求，ADR-216）。人工编辑检出中有未交还的改动时先询问；接管期间卫星缺失且无法重建时不询问、H 一律保留在原路径（不删除，确认框给出路径；`10` §10.8.4，ADR-184）。**Goal 不可达时**（§6.1.6 Project 不可达一行，ADR-236）同样允许：只写数据库，不访问不可访问的路径；人工编辑检出不可读时不做差异询问，确认框写明卫星、人工编辑检出与检验检出都留在原处（`10` §10.2 “人的工作现场不自动删除”，ADR-228），卫星的到期删除推迟到可访问。`abandoned` 是终态，没有反向命令，界面也不提供放弃的撤销条（ADR-194）：确认框的必填原因是防误操作的一步，误放弃时以 `goal.resurrect` 复活为新 Goal | full |
| `goal.rebuild_satellite` | `{goalId}`（M1：重试重建；带 `checkpointN` 从更早的检查点重建属 M2，多仓库属 M3，ADR-183） | `human.decision{rebuild_satellite}`（ADR-176）。前置守卫：`satellite_missing` 是 `pause_reason` 或在 `also_applies` 中，否则 `E_STATE`；`satellite_rebuilding=1`（自动重建或另一次重试正在进行——`running` 中丢失时 `satellite_missing` 与该标志在同一事务写入，§6.1.6）→ `E_BUSY`（ADR-180/182）。按情形 E 的重建来源（可用的最新检查点 → pin → base）与重建步骤重建卫星（与自动重建相同，唯一定义在 `10` §10.16.2：§10.3.1 第 2 步 → `restoreCheckpoint` 第 1–6 步（跳过第 0 步）→ 记录重建树的 `safety` 检查点 → 播种 `seeded` 的本地文件 → 重新物化依赖，ADR-182；持该卫星的 `wtLock`），开始时（先按 `10` §10.16.2 情形 E 的“另一半”改名保留仍在原位的一半，ADR-225）同一事务置 `satellite_rebuilding=1`（崩溃续做见 §6.1.6）；成功时在**同一事务**中解除 `satellite_missing` 并清除 `satellite_rebuilding`，`human_checkout` 非空时写 `human_checkout.rebuiltTree`（重建所用的树，`10` §10.8.4 第 6 步），按情形 E 处置未解除的外部改动（ADR-183），并记 `satellite.recovered{tree, checkpointN?, by:"decision"}`——Agent 由下一次任何 Run 的开场 `tower.satellite_rebuilt` 得知（不论继续目标，唯一定义在 `16` §16.1.12，ADR-180）；**不改写继续目标**（与自动重建相同；ADR-178/180 为从更早检查点重建而设的继续目标改写随该能力移到 M2，ADR-183），离开 `paused` 由 `onAllReasonsCleared()` 执行（重建树 ≠ pin 时守卫改为 `verify_new`）；失败时本原因保持、清除 `satellite_rebuilding`，Needs-You 更新失败原因。与 `run.rewind` 不同：不开 Run、不改动 Pi 会话 | full |
| `goal.resurrect` | `{goalId}` | `human.decision{resurrect}`、`goal.created{resurrectedFrom}`。源状态只限 `archived`/`abandoned`（`03` §3.1），其他状态（含带 `reverted` 标记的 `accepted`）→ `E_STATE`（ADR-176）；已隐私清除的 Goal（墓碑行，`09` §9.12.4）同样 → `E_STATE`（ADR-196） | full |
| `signal.acknowledge` | `{needsYouId}` | `human.decision{acknowledge_signal}`（ADR-117）：关闭受保护目标沙箱拒绝的 Needs-You，标注 `outcomeClass:"informative"`；也作为 `bg_process_survived` 的“知悉”（ADR-126），以及 `anomaly` 中 `structured_content_dropped` 与第 1 次 `post_settle_activity` 的“知悉”（`08` §8.8，ADR-208） | decide（允许远程，ADR-125） |
| `process.terminate_again` | `{needsYouId}` | 事件 `agent_proc.kill_requested{by:"human"}`（不是 HumanDecision，不改变 Goal 状态；ADR-120 U2）。该 Needs-You 的 kind 为 `anomaly`，去重键 `an:{goalId}:bg_process_survived`；“再次终止”成功 → 标注 `actionable`，“知悉”（`signal.acknowledge`）→ `informative`（ADR-126）。按该 Run 的 `process_token` 重新枚举（§6.1.10），对每个进程发信号前再读环境确认令牌后发送 SIGKILL；已无含令牌的进程 → 直接关闭条目。仍存活 → 条目保持打开并显示“无法终止，可能需要手动处理”。“知悉”复用 `signal.acknowledge` | decide（允许远程，ADR-125） |
| `signal.mark_benign` | `{needsYouId, scope: "project"}` | `human.decision{mark_benign}`（ADR-117/125）：关闭该 Needs-You，标注 `false_positive`，并把该拒绝的 `(category, op, target)`（取自 Needs-You 引用的 Fact，字段定义唯一在 `16`）写入 `project_benign_targets`；之后同一项目中同一 `(category, op, target)` 的拒绝为 severity 1。凭据读取（`category:"credential"`、`op:"read"`）返回 `E_STATE`，不能标为良性。可在项目设置中撤销（写 `revoked_at`）。“收紧策略”打开自主度矩阵（`autonomy.*` 命令），“放弃 Goal”用 `goal.abandon` | full（仅本机，ADR-125） |
| `sentinel.override` | `{factId, note}` | `human.decision{override_sentinel}`。在 `paused(sentinel_high)` 中：覆盖使该 Goal 不再有未覆盖的阻断命中时，继续目标改写为 `review{state:"in_review", pin}`然后解除 `sentinel_high`（ADR-134；仍有阻断命中则不解除）；进入 `in_review` 时的标签与这次验证是否算“通过”按 `07` §7.10.3 继续目标表与 `03` §3.2.1（ADR-187）；覆盖决定记录被覆盖的 `factId`（Fact 的 `evidence` 指向这次验证的日志），这次验证仍是非决定性的、不写保留 ref，其重放包按非永久规则保留（`07` §7.4.1，ADR-186）。（只适用于 sentinel 类 Fact，不适用于 `nested_repo_live` 与 `excluded_paths` 引起的 `nested_repo`（ADR-131，不可覆盖）、anomaly 与提示性的 `sandbox_violation`（后者的 Needs-You 由 `signal.acknowledge`/`signal.mark_benign` 关闭）。`input_mutated_after_gate` 是 sentinel，以此处置——覆盖后不再计入 `openSentinels`，ADR-110；`nested_repo`/`symlink_escape` 的覆盖绑定 `(detector, 路径, 该路径在 pin 中的对象哈希——目录为 tree、链接为 blob)`，写入 `human.decision{override_sentinel}`；`pinSafetyCheck` 在验收与 seal 时比对绑定，哈希变化即覆盖失效、重新阻断；覆盖有效时 pin 原样进入 seal，`Tower-Override` trailer 记录路径与哈希，ADR-109/112） | decide（禁止远程） |
| `budget.extend` | `{goalId, usdSoft?, usdHard?, minutes?}` | `human.decision{extend_budget}`：**只提高额度**，不解除任何原因（ADR-137）；`paused(budget_soft_cap\|budget_hard_cap)` 由随后的 `goal.resume` 解除（`resume` 对 `budget_hard_cap` 的条件是硬上限已高于当前用量）；额度写入本决定的 payload，生效额度只按 §6.2.5（ADR-197） | decide |
| `capacity.override` | `{goalId}` | **M2**（仅阻止模式，E8；M1 不提供，ADR-191）：`human.decision{override_capacity}`（ADR-014） | decide（禁止远程） |
| `settings.set_capacity` | `{reviewBacklogLimitLoc | null, maxConcurrentGoals?}`（ADR-014） | `settings.changed`（UserSettings，`02` §2.14） | full（禁止远程） |
| `privacy.purge` | `{scope: "memory"|"goal"|"project"|"all", id?, reason, sessionIds?}` | 各档的删除范围、不改写而如实列出的副本与无法删除的副本只按 `09` §9.12.4（唯一定义，ADR-195）；事件按 `02` §2.13 墓碑化（删除 payloads 行、事件行写墓碑、追加 `privacy.purged`），Pi 会话文件整份删除。**从不写用户仓库**：Tower 写过的分支与 ref 原样保留并在结果中列出。状态前提（`goal` 档只接受 `archived` / `abandoned`，否则 `E_STATE`）、保留并列出的人工编辑与检验检出、`decisions` 与 Goal 行的墓碑同样只按 `09`（ADR-196）。**事件载荷与顺序**（ADR-197/198/199）：`privacy.purged{scope, id?, roots?, sessionIds?, filesDone?}`——`scope` 与本命令相同；`id` 为记忆、Goal 或 Project 的 id（`all` 档没有）；`project` 档在同一事务中另为范围内每个 Goal 追加 `{scope:"goal", id, roots}`。**定位**：`roots` 是 `{projectId, wtRoot}` 的列表，`goal`、`project`、`all` 三档都写（`goal` 档为该 Goal 各 binding 的 Project 与 `<wtRoot>`；含该 Project `settings.relocatedFrom` 中的旧 `<wtRoot>`，`project.relocate` 行，ADR-237），与删除绑定、Project 行的同一事务写入；确认时不可访问、经你接受不触碰的根不写入 `roots`，只记入清除遗留清单（`09` §9.12.4 “不可访问的根”）；文件删除、续做与再次清除只按事件中的 `id` 与 `roots` 定位卫星、`_gitdirs`、`_stores`、备份 bundle、镜像中的 ref 与验证槽位，不读已删除的行。数据库部分与不带 `filesDone` 的事件在一个事务内先提交，再执行幂等的文件删除（清单只按 `09`；一次完成、从不推迟，执行中才变为不可访问的根不触碰、记入清除遗留清单，唯一定义 `09` §9.12.4 “不可访问的根”，ADR-237），完成后追加同一 `scope`、`id` 且 `filesDone: true` 的一条；`project` 档完成时另为范围内每个 Goal 各追加一条 `{scope:"goal", id, filesDone: true}`，因此每条不带 `filesDone` 的事件都有配对；`all` 档最后删除数据库本身，不追加。`memory` 档改写 Run 目录开场文件需要原文（`brief.md` 的 `Notes:` 行不带条目 id），因此这一步在事务之前执行，幂等。**会话删除**（ADR-199）：`memory` 档中人选择“一并删除这些会话”时，命令带 `sessionIds`（`{goalId, sessionId}` 列表；只接受界面列出的受影响会话中属于已归档或已放弃 Goal 的，否则 `E_STATE`），并原样写入同一事务中不带 `filesDone` 的事件；会话文件（`~/.tower/goals/<goalId>/sessions/` 中，或已移入的年度归档包 `db-backups/sessions-<年>.tar.zst` 中，§6.6.4；后者按 `09` §9.12.4 “清除一个 Goal” 同一方式重写该归档包，写新包后原子替换，ADR-200）在事务之后与其余文件一起幂等删除，续做只按事件中的 `sessionIds` 定位。“已清除的 Goal”只认 `scope = "goal"` 且 `id` 为该 Goal 的事件，“彻底忘记一条记忆”的事件（`scope = "memory"`）不使任何 Goal 被判为已清除。中途崩溃的续做见 §6.1.6。对已清除的 Goal 再次执行时只按其事件中的 `roots` 重做文件删除并返回“已清除”，不追加事件；墓碑化只更新尚未墓碑化的行 | full（禁止远程） |
| `autonomy.grant` / `autonomy.revoke` | `autonomy.grant`：`{projectId, class, level}`；`autonomy.revoke`：`{projectId, class, goalId?, level?}`（作用范围唯一定义在 `11` §11.3.5 排除 (b)，ADR-184：M1 只有带 `goalId`、省略 `level` 的形式——入口在 Goal 页自主度区块（`04` §4.5），只撤销该 Goal 中该类的运行时授权，不影响合同授权与其他 Goal；省略 `goalId` 的项目范围撤销、带 `level` 的形式与 `autonomy.grant` 属 M3 的自适应自主度，ADR-183） | `human.decision{approve_autonomy_change}`（`11` §11.5）；之后编入 `policy.json` 时按 `11` §11.3.5 排除被撤销的授权，活跃 Run 的 `policy.json` 立即重写 | full（禁止远程） |
| `project.set_trust` | `{projectId, trust}` | `human.decision{trust_project}`、`project.trust_changed` | full（禁止远程，§6.4.7） |
| `engine.set_prefs` | `{goalId?, projectId?, adapter?, model?, thinking?, resources?}` | `settings.changed`；`resources.gate=false` → `E_INVALID`（门禁不能关闭，ADR-176） | full（字段级：`adapter`、`resources.checkpoints` 仅本机，`16` §16.5） |
| `goal.viewed` | `{goalId, seq}` | `watermark.advanced`（不进入 EventLog，只更新 watermarks 表） | read |
| `project.local_files.viewed` | `{projectId, seq}` | 本地文件设置页聚焦可见 ≥ 3 s 时由界面发出（`08` §8.1）：`watermark.advanced`（scope `localfiles:<projectId>`；不进入 EventLog，只更新 watermarks 表）；序号不大于水位的事件类本地文件通知不再计入侧栏 `◇`；本地文件设置页的行内说明在这次访问中保持显示，离开该页后才消失（`08` §8.1，ADR-174/175）；不是 HumanDecision | read |
| `scratch.create` / `scratch.promote` / `scratch.pin` / `scratch.delete` | … | `scratch.*` | full |
| `settings.update` | `{path, value}` | `settings.changed` | full（禁止远程） |
| `engine.reread_login_shell` | `{}` | 设置页“重新读取”：以首次运行的同一方式重新读取登录 shell，只替换 `PI_CODING_AGENT_DIR`、Host `PATH` 的目录、包管理器位置变量与记入密钥库的非机密云 SDK 及 provider 配置变量的值（唯一定义 `05` §5.3.6“首次运行检测”，ADR-214/228）；`settings.changed`，下一次 Host 启动生效 | full（禁止远程） |
| `export.goal` / `import.goal`（M2，ADR-059） | `{goalId, dest}` / `{file}` | `export.*` | full（禁止远程） |
| `system.diagnostics` | — | 生成诊断包（§6.7） | full |

**完整性**（R4-D15-01）：`02` §2.7 `HumanDecision.kind` 中的每个值都至少对应上表的一条命令。`approve_action`、`deny_action`、`answer` 由 `needs_you.answer` 产生；`snooze`、`dismiss` 由 `needs_you.snooze`、`needs_you.dismiss` 产生；`trust_project` 由 `project.set_trust` 产生；`approve_autonomy_change` 由 `autonomy.grant`/`autonomy.revoke` 产生；`deny_s0_exec` 由 `s0.deny` 产生（ADR-077）；`split_project` 由 `project.split` 产生（ADR-080）。CI lint 比对 `HumanDecision.kind` 枚举与本表，缺项即失败。

拒绝语义：

- 状态不允许 → `E_STATE`，例如对 `running` 的 Goal 执行 `goal.accept`。
- `expect.ver` 不匹配 → `E_CONFLICT`。客户端拉取最新版本后，由人确认是否重试，不自动合并。
- 重复的 `cmd.id` 返回第一次的结果，不会重复执行。

### 6.4.4 版本协商

- `proto` 是整数，当前为 1。服务端同时支持 `proto` 和 `proto − 1`。`hello.proto < minProto` 时返回 `bye{proto_mismatch}`，客户端提示更新。桌面端的 renderer 和 Supervisor 总是同一个构建，因此只有 serve 模式会遇到版本不一致。
- 只增不改的变更（新 topic、新字段、新命令）**不升** proto，客户端必须忽略未知字段和未知 op。删除或改变语义时，proto + 1。
- `schemaHash` 是投影类型定义（`engine-api` 与 `ui-protocol` 包）的哈希，用于在调试面板中发现客户端缓存了旧的投影形状。

### 6.4.5 背压与确认

- 服务端为每个订阅者、每个 topic 记录 `sentVer`、`ackedVer` 和未确认帧数 `inflight`。
- **流控**：`inflight > 8` 或未确认字节数 > 256 KB 时，该 topic 停止发送 delta，标记为 `dirty`。等到 ack 追上后，合并为一个 delta（能算出差量时），否则发 snapshot。永远不会无限排队（gui.md §4.6）。
- `live` 类 topic 只保留最新值：dirty 期间的中间状态直接丢弃，`text` 尾部按最后 8 KB 截断后重发。
- 窗口隐藏（`focus.visible=false`）时，所有 topic 改为“最小”节奏：`board` 和 `inbox` 每 1 s 一次，`live` 不发。重新可见时，对订阅中的 topic 补发 snapshot。
- `cmd` 不受流控限制。

### 6.4.6 与 chord 的关系（ADR-005）

ADR-005（修订）：协议手写（约 600 行，含测试），不依赖 `@earendil-works/chord`。Pi 1.2.0 自己也移除了对 chord 的依赖（`CA/CHANGELOG.md:81`）。`ui-protocol` 包与传输层解耦，同一份代码同时跑在 MessagePort 和 WebSocket 上。

### 6.4.7 `serve` 模式（WebSocket）

`serve` 模式在 M2 交付（ADR-038）。**远程能力矩阵**（哪个 scope、哪种客户端可以执行哪条命令）的唯一来源是 `16` §16.5。本节只规定机制，以及本文作出的远程验收决定（R1-D8-03）。

| 项 | 规则 |
|---|---|
| 监听 | 默认 `127.0.0.1:7477`（只监听回环，ADR-013）。要监听非回环地址，必须在设置中显式开启，并且同时满足：配置了 TLS 证书（PEM 路径），或者启用 “SSH 隧道 / Tailscale 等网络层保护”的确认开关 |
| 令牌 | 256 位随机数，存于 `~/.tower/serve/tokens.json`（权限 0600），每个令牌有名称、scope 和创建时间，可单独吊销。浏览器客户端通过 `Sec-WebSocket-Protocol: tower.v1, bearer.<base64url>` 传递；其他客户端在 `hello.token` 中传递。**不放在 URL 查询串里**（避免出现在日志中） |
| scope | `read`：只能订阅。`decide`：回答 Needs-You、审批（单向门除外）、评论、暂停或继续、请求修改，以及**有条件的**验收（见下一行）。`full`：除标注“禁止远程”的命令外都可以执行。各命令的具体归属见 `16` §16.5 的远程能力矩阵 |
| 远程验收（决定） | `goal.accept` 经远程连接执行时，必须**同时**满足以下条件，否则返回 `E_FORBIDDEN{remote_accept}`，并提示“请在桌面上验收”：① `riskTier ∈ {low, standard}`，`high` 一律只能在本机桌面验收；② 全部评审单元都已**有效评审**（ADR-014 的下限），且有效评审发生在 `client:"desktop"` 或 `client:"web"` 上，在 `client:"mobile"` 上的浏览不计入；③ 没有既未 `addressed`（只认 ⚙️ 来源：锚定的 hunk 已变）也未被人关闭的 `requiresChange` 评论（Agent 的引用不算，ADR-176）；④ `human` 类标准都已勾选；⑤ 已验证（V/M）对当前指纹新鲜。理由：远程验收的风险不在于“人在哪里”，而在于“人有没有真正看过 diff”。②把“看过”这件事固定在适合看 diff 的客户端上 |
| 单向门审批 | 无论 scope，一律不能远程批准，只能在本机桌面批准（`11` §11.1） |
| 禁止远程的命令 | `contract.ratify`（远程只允许 `contract.quick_ratify`，ADR-051）、`project.set_trust`、`settings.update`、`engine.reread_login_shell`、`settings.set_capacity`、`autonomy.grant`/`revoke`、`export/import`、`privacy.purge`、`goal.delete_kept`（ADR-228/229）、`project.relocate`（ADR-236）、`capacity.override`、`sentinel.override`、`test.quarantine`（ADR-178）、`signal.mark_benign`（ADR-125）、`verify.secret_wait.run_now` 与 `secrets.access.use_now`（M2）（ADR-160 补记 2）、`project.local_files.mark_secret`/`unmark_secret`/`approve` 与带 `withSecrets:true` 的 `inspect.open`（ADR-166/167）、`inspect.close`（ADR-208），`project.merge`/`project.split`（ADR-179 补列，与 §6.4.3 该行及 `16` §16.5 一致），以及在用户检出中的本地合并与 docker 批准；字段级或按条件仅本机的（ADR-176）：`goal.update_meta` 中降低 `riskTier`、`engine.set_prefs` 的 `adapter`/`resources.checkpoints`、`project.local_files.remove` 对 `isSecret` 条目；`contract.amend` 与 `project.verify_profile.update` 按 `16` §16.5 的逐字段封闭表（ADR-178）；远程批准的 `s0.grant` 有效期按 `11` §11.9 的统一规则；`goal.external_change.keep` 手机端禁止（采纳需要有效评审，ADR-125）。理由：这些操作改变安全边界、验收依据或不可逆，必须在本机桌面上执行。完整清单与按客户端（web / mobile）的细分以 `16` §16.5 为准 |
| 浏览器安全 | 校验 `Origin`（白名单：本机 serve 的静态页面地址和用户添加的地址），校验 `Host` 头（防 DNS rebinding）；拒绝无 `Origin` 的浏览器升级请求 |
| 限流 | 每个令牌：`cmd` 每秒 10 个，`req` 每秒 50 个；超出时返回 `E_FORBIDDEN{rate}`。同一个令牌认证失败 5 次后锁定 10 分钟 |
| 静态资源 | 同一端口提供 Web 版 UI（与 renderer 是同一份代码，按 `client:"web"` 构建）；`Content-Security-Policy` 与 `11` 的 renderer 策略相同 |
| 审计 | 每个远程连接和远程命令都记入 EventLog（`actor = token:<名称>`） |

---

## 6.5 Coalescer（合并器）

Coalescer 位于 Supervisor 中，按“订阅者 × topic”运行。它决定**什么时候发送**以及**怎样把多个变化合并成一帧**（gui.md §4.6、§4.7）。

### 6.5.1 节奏

本表说明合并器的机制分档；全部节奏数值以 `16` §16.4 为准。

| 条件 | 刷新间隔 |
|---|---|
| 聚焦 Goal 的 `goal/<id>` 和 `goal/<id>/live` | 空闲后的首个变化**立即**刷出；之后 60 Hz 屏 16 ms、120 Hz 屏 8 ms（刷新率由 renderer 在 `hello` 中上报） |
| Watch 模式中未聚焦的 Goal | 250 ms |
| 其他 Goal 的 `board` 卡片 | 250 ms（模式或 Live Line 有变化时）/ 500 ms（只有计数类字段变化时） |
| `ledger` / `review` / `timeline`（未聚焦） | 500 ms |
| `system` | 1 s |
| 窗口不可见 | 1 s，`live` 停发（§6.4.5） |
| **立即**（当前 tick 内，不等节奏） | 新的或已解决的 Needs-You；生命周期状态变化；Mode 进入 `waiting_human`、`blocked_guard`、`budget_capped`、`stalled`、`unresponsive`；验证通过或失败；引擎崩溃；评审余量从正变为 ≤ 0（或反过来）。也就是所有**改变注意力级别**的变化（`08` §8.6.5） |

### 6.5.2 合并规则

| 输入 | 合并方式 |
|---|---|
| 同一 `(消息, contentIndex)` 上连续的 `msg.delta` | 拼接成一个 `["text", path, s]` |
| `tool.update` | 只保留最新值（`set`） |
| 同一路径上多次 `set` | 只保留最后一次 |
| `merge` 后又对同一路径 `set` | 只保留 `set` |
| `ins` 后紧跟同一位置的 `splice` | 相互抵消 |
| `ins` 后又对插入项内部 `set` | 改写插入的内容 |
| 帧大小 > 8 KB | 拆成多帧，按顺序发送，每帧带连续的 `from/to` |
| 大块数据（文件内容、终端字节） | 不进帧，改为通过 `req` 引用拉取，或以 `ArrayBuffer` 转移 |

### 6.5.3 性能目标与测量

- 聚焦 Goal 从事件到绘制按刷新率分档（`13` §13.1：120 Hz ≤ 16 ms p95，60 Hz ≤ 33 ms p95）。测量链路：Host 的 `at` → Supervisor 收到 → Coalescer 刷新 → renderer 应用 → rAF 绘制，每段都打 perf mark（§6.7）。
- 10 个 Goal 并发流式输出时，renderer 每帧脚本时间 < 2 ms；IPC 帧中位大小 ≤ 8 KB。

---

## 6.6 数据目录、迁移、备份、保留与崩溃一致性

### 6.6.1 目录布局

`TOWER_HOME` 默认 `~/.tower`（Windows：`%USERPROFILE%\.tower`），可以用环境变量覆盖。Electron 的 `userData` 只存 Chromium 缓存和窗口状态，不存业务数据。

```
~/.tower/
├─ tower.db  tower.db-wal  tower.db-shm      # §6.3
├─ config.json                               # 用户级设置（与 settings 投影双写；DB 为准）
├─ goal-id-hwm                               # GoalId 的编号高水位（02 §2.2，ADR-198）：只含一个编号；“清除全部”保留
├─ purge-leftovers.json                      # 清除遗留清单（09 §9.12.4 “不可访问的根”，ADR-237/238）：只含 [{wtRoot, at}]；“清除全部”保留；不设备份排除（同 goal-id-hwm）
├─ serve/ tokens.json  cert.pem  key.pem      # §6.4.7（0600）
├─ goals/<G>/
│  ├─ sessions/                              # Pi --session-dir（05 §5.4.1）：<ts>_<sessionId>.jsonl
│  ├─ runs/<R>/                              # tower-goal.json、policy.json、brief.md、situation.md、contract.md、episodic.md、overflow.jsonl
│  ├─ logs/                                  # 命令与准备日志：prepare.log（10 §10.4）、观察器复制的命令全文 <toolCallId>.log（07 §7.2.2；单个没有大小上限，13 §13.11.3；保留期 09 §9.12.1，ADR-227 补登）
│  ├─ artifacts/                             # 截图、报告、验证日志（EvidenceRef log/artifact）；超过载荷上限的事件路径集合 paths-<sha256>.json（§6.3“载荷中的路径集合”，ADR-213/214）
│  ├─ git/<projectId>.git                    # Tower 影子 git 目录（ADR-060）：裸库、Agent 不可写、alternates → 镜像库；检查点、pin、seal 写在这里
│  └─ replay/<verifyId>/                     # 重放包（ADR-083；规格只在 07 §7.4.1；重放命令 `tower verify --replay <verifyId>`）
│  └─ export/                                # 导出包
├─ worktrees/<P>.noindex/<G>/                # 只在回退时使用（10 §10.4.3）：默认位置是 <checkoutParent>/.tower-wt.noindex/<repoName>/<goalId>（ADR-008）
├─ verify/<P>/slot-<k>/                      # 仅当 <wtRoot> 回退到 ~/.tower 时使用；默认槽位在 <wtRoot>/_verify/（07 §7.4.2、ADR-008）
├─ scratch/<id>/  {session/, cwd/}           # 02 §2.12；7 天后清理
├─ mcp-cwd/<hostId>/                         # 每个 Host 进程一个 stdio MCP 服务器的空工作目录（05 §5.3.5，ADR-214）：host.spawn 时新建为空、Host 退出后删除，启动恢复时删除不属于存活 Host 的残留，从不在 Host 之间共享（11 §11.3.4 唯一定义，ADR-215/216）；三种沙箱读写都拒绝
├─ ext/tower-goal/                           # 与当前 Tower 版本匹配的扩展源码（RPC 模式 -e 加载）
├─ tmp/                                      # 0700；检查点临时 index、LFS 获取的 0600 临时配置（命令结束即删）；启动时清空（存活 Host 的 <hostId>/ 除外）
│  └─ <hostId>/                              # 每个 Host 进程一个临时目录，即 Host 的 TMPDIR（Pi 的输出文件所在）：host.spawn 时新建、Host 退出后删除（05 §5.3.6 唯一定义，ADR-224）；三种沙箱读写都拒绝
├─ run/<deliveryId>/                         # 0700/0600；机密的即时投递文件（ADR-159/165/166/167：只有两类使用者——云 SDK 原始凭据给 Engine Host、从用户级 `~/.npmrc` 读出的注册表认证行给安装器第 1 阶段；检验检出的机密本地文件直接复制进检验检出，不经此目录），消费进程结束即删；交给 Engine Host 的投递为 `run/<hostId>/`，启动时只清除不属于存活 Host 的投递（§6.1.6 检查点写入中途一行，ADR-226）；备份与 Spotlight 排除
├─ db-backups/ tower-YYYYMMDD.db  pre-migrate-vN.db
├─ goal-bundles/<P>/<G>.bundle        # Tower 自有 git bundle 备份（10 §10.16.3）
├─ diag/                              # 诊断包，TTL 1 小时（08 §8.13、09 §9.12.1）
├─ logs/ supervisor-YYYYMMDD.jsonl  main.log  host-<G>.log  rpc-<R>.stderr.log  verifier.log
├─ projects/<projectId>/mirror.git           # Project 镜像库（ADR-073/083）：裸库，Agent 只读 objects/（alternates 需要）；含保留 ref refs/tower-retain/<goalId>/<verifyId>
├─ recovery/ journal.jsonl  last-board.json  # 安全模式使用（§6.1.7）
└─ crash/                                    # crashReporter 生成的 minidump（只存本地）

<wtRoot> = <checkoutParent>/.tower-wt.noindex/<repoName>/       # ADR-008
├─ <goalId>/                                 # 卫星工作目录（ADR-060/081）：**没有 .git**
├─ _gitdirs/<goalId>/                        # 卫星的分离 gitdir（ADR-081）：整体归 Agent、可写（ADR-089）；Tower 不读取作判定；alternates → 镜像库
├─ _human/<goalId>/                          # 人工编辑检出（ADR-081/106）：由影子树物化（交接检查点 T0），不含仓库形态目录 + Tower 新建的 gitdir；交还、放弃之后脱离保留，从不自动删除；再次接管时改名为同级的 <goalId>.kept-<时间>/（10 §10.2，ADR-228）
├─ _inspect/<goalId>/                        # 人工检验检出（ADR-078/082/106）：由影子树物化 pin 的内容，不含仓库形态目录，按验证器沙箱档位执行脚本与服务；Agent 不可读；关闭、带回之后同样脱离保留（10 §10.2，ADR-228）
├─ <goalId>.kept-<时间>/  _gitdirs/<goalId>.kept-<时间>/  _inspect/<goalId>.kept-<时间>/   # Tower 自动改名保留（10 §10.2，ADR-221/228）：从不自动删除，清除时保留并列出（09 §9.12.4，ADR-222），由人经 goal.delete_kept 删除
├─ _stores/_shared/tools/                    # Tower 工具缓存（ADR-085、16 §16.8）：node@<v>、pnpm@x.y.z、npm@x.y.z，按 dist.integrity 校验；V/I/A 的 PATH 由 Tower 显式构造
├─ _verify/slot-<k>/                         # 验证槽位（07 §7.4.2）
└─ _stores/<goalId>/  _stores/_verifier/     # 私有依赖存储（ADR-021）；_verifier = $VS：depcache/<depsKey>（发布后只读）与 staging/<installRunId>/（安装阶段唯一可写处，ADR-092）
```

**权限、加密与备份**（R1-D11-07）：

| 项 | 规则 |
|---|---|
| 权限 | `~/.tower` 及其下所有目录为 `0700`，文件为 `0600`（创建时设置 `umask 077`）。启动自检发现权限被放宽时，自动收紧并记录一条 Fact。`<wtRoot>` 是用户仓库的同级目录，沿用用户仓库的权限；其中 `_stores/` 设为 `0700` |
| 静态加密 | v1 **不自带**数据库或 JSONL 加密。`node:sqlite` 不支持 SQLCipher；自建加密层会牺牲 Pi 直接读写 JSONL 的能力。因此依赖系统全盘加密：启动自检读取 FileVault、BitLocker 或 LUKS 的状态，未开启时在设置页显示一条持续的警告（severity 1，只提示一次 Needs-You）。这是登记在 `11` 威胁表中的残余风险：笔记本丢失且未开全盘加密时，完整对话与工具输出明文可读 |
| 影子 git 目录与镜像库 | `goals/<G>/git/*.git` 和 `projects/*/mirror.git` 都保留在系统备份中，而且**必须一起**恢复：影子通过 alternates 依赖镜像，单独恢复影子是不完整的（R4-D6-01）。在检查点、pin、seal fetch 进用户仓库之前，影子 + 镜像是这些对象的唯一来源。卫星的 `.git` 中只有 Agent 自己的提交，不作为恢复依据 |
| 备份排除 | 对 `_stores/`（含 `_stores/_shared/tools`）、`_verify/`、`_inspect/`、`_human/`、`tmp/`、`run/`（另加 Spotlight 排除，ADR-159）、`logs/`、`crash/` 设置备份排除（macOS：`tmutil addexclusion`；其他平台写入 `.nobackup` 并在文档中说明）。`tower.db`、`goals/`、`db-backups/` **默认保留**在系统备份中，因为它们是恢复所需的数据。`goal-id-hwm` 与清除遗留清单 `purge-leftovers.json` 同样不排除：前者只含一个编号，后者只含不可访问的根的路径与时间（`09` §9.12.4，ADR-238；系统备份中旧快照里的副本按系统备份自己的保留期过期，如实登记）。设置项“从系统备份中排除对话数据”会把 `goals/*/sessions/` 也加入排除 |
| 云同步 | `TOWER_HOME` 或 `<wtRoot>` 位于 iCloud Drive、Dropbox、OneDrive、Google Drive 等同步目录时，**拒绝**在这里放数据库：SQLite 的 WAL 与同步客户端会互相破坏。此时要求用户换一个位置；worktree 则回退到 `~/.tower/worktrees` |
| 密钥 | Tower 持有的机密只**静态存放**在系统钥匙串中——M1 中只有两类：模型提供商密钥、云 SDK 凭据（私有注册表令牌不保存，每次从用户级 `~/.npmrc` 读取，ADR-166/167）；工具令牌（如 GitHub 令牌）在 M1 中**不导入**（ADR-165，M1 没有推送与开 PR）（ADR-033/159；`secrets.enc` 仅为钥匙串不可用时的加密回退，`11` §11.7.1），写入的条目以访问控制列表限定为 Tower 自己的代码签名身份（其他进程读取会触发 macOS 授权提示，ADR-162；SP6a A8 测量），`~/.tower` 下没有长期存放的明文机密；需要以文件交给子进程时（只有 Engine Host 的云 SDK 原始凭据与安装器第 1 阶段的注册表认证行），即时创建于 `~/.tower/run/<deliveryId>/`（0700/0600），消费进程结束即删除（投递表唯一定义在 `11` §11.7）。脱敏规则（`11` §11.7）作用于日志、事件和诊断包 |

### 6.6.2 迁移

- 版本号存在 `meta.schema_version`。迁移只向前，按编号执行 SQL 文件（`migrations/0001_init.sql`…），每个文件在一个事务内执行。
- 迁移前先执行 `VACUUM INTO db-backups/pre-migrate-v<N>.db`。迁移失败时回滚事务，保留备份，应用进入安全模式并提示用户。
- **防止降级打开**：数据库版本高于当前应用支持的版本时，拒绝写入，以只读模式打开，并提示“请升级 Tower”。
- **事件 payload 演进**：`events.v` 记录 payload 版本。读取路径上注册 upcaster（`(type, v) → v+1`），**从不改写**历史事件。
- **Pi 会话格式**：Pi 在加载时会自己迁移 v1/v2 会话（`CURRENT_SESSION_VERSION = 3`，pi.md §8.1）。Tower 从不直接改写 JSONL。

### 6.6.3 备份与导出

- **每日备份**：首次空闲时执行 `VACUUM INTO db-backups/tower-YYYYMMDD.db`，保留 7 份日备份和 4 份周备份。Pi 的 JSONL 与 worktree 不在备份范围内：JSONL 是追加写，git 有自己的对象库。
- **导出 Goal**（M2，ADR-059）：生成 `.towergoal` 包（zip），内容包括：
  - 该 Goal 的 `events` 子集（JSONL）
  - 领域表的快照
  - `goals/<G>/sessions/*.jsonl` 和 `artifacts/`
  - `git bundle`，包含分支和 `refs/tower/<G>/*`
  - `manifest.json`（版本号、哈希）

  可以选择脱敏：去掉 bash 输出中匹配密钥模式的内容（`07` §7.6.6 的规则）。
- **导入**：校验 manifest → 分配新的 GoalId（旧 id 记录在 `importedFrom`）→ 在新的 seq 区间重放事件 → 解包 bundle。

### 6.6.4 保留与清理

| 对象 | 规则 | 执行者 |
|---|---|---|
| `msg.delta` / `tool.update` | 从不持久化 | — |
| 已归档或已放弃 Goal 的 `engine.*` 细粒度事件 | 归档或放弃 30 天后（ADR-057），先写出最终投影快照，再删除这些事件；Fact、Claim、HumanDecision、状态变化、`audit.*` 永久保留（ADR-005）。此后已归档 Goal 只能从“快照 + 保留事件”重建 | Supervisor 夜间任务，之后执行 `incremental_vacuum` |
| 隐私清除 | `privacy.purge`：范围只按 `09` §9.12.4（ADR-195/196），不写用户仓库，不删人工编辑与检验检出；删除 payloads 行，事件行写入墓碑，`decisions` 与 Goal 行保留为墓碑，审计链按 `payload_hash` 继续可校验；Pi 会话文件整份删除（`02` §2.13 唯一允许的例外形式） | 人发起 |
| 心跳 Fact | 只保留最近 24 h，加上每次状态转移前后各一条 | 同上 |
| Pi JSONL | Goal 存在期间保留。归档 180 天后，在用户确认（批量）后移入 `db-backups/sessions-<年>.tar.zst`；Trace 打开时按需解压到 `~/.tower/tmp/`（启动时清空，存活 Host 的 `<hostId>/` 除外；只重启 Supervisor 时正在打开的解压文件同样被清空，Trace 抽屉提示重新打开、按需再解压，ADR-226），关闭 Trace 时删除。该归档包有三个写者——本行的移入、`09` §9.12.4 “清除一个 Goal”与 `privacy.purge` 的会话删除（§6.4.3）——三者持同一把归档包锁串行执行，各自在锁内读入当前的包、写新包后原子替换，因此后写者不会写回先写者删去的会话（ADR-201） | 同上 |
| Scratch | 7 天无访问且未 pin → 删除（`02` §2.12） | 同上 |
| 卫星（工作目录 + `_gitdirs/<goalId>`）| 卫星的删除时机与前提只在 `10` §10.3.2 定义；`_human/<goalId>`、`_inspect/<goalId>` 与各 `<goalId>.kept-*` 由 Tower 从不自动删除，只由人经 `goal.delete_kept` 删除，规则只在 `10` §10.2 “人的工作现场不自动删除”；本行不复述（ADR-194/228/229） | GitService |
| 影子 git 目录 | 保留期，以及其中哪些 ref 保留多久、影子何时删除，只以 `10` §10.3.2“检查点保留”为唯一来源（本表不复述，ADR-239）。影子的 `gc` 持有该卫星的 `wtLock`；不可达对象的 prune 宽限期以 `16` §16.2.6 为唯一来源（本文不再写具体时长），用来避免与正在进行、对象尚未被引用的检查点赛跑 | GitService |
| 镜像库 | 镜像中的 `refs/tower-live/<goalId>/*`（活跃影子 ref 的副本，每次镜像 gc 前刷新，影子删除时删除）保证影子依赖的对象可达（`10` §10.17.1）；镜像为每个永久保留的证据写保留 ref `refs/tower-retain/<goalId>/<verifyId>`（指向对应的 pin，`07` §7.4.1；只为永久保留的重放包而写，ADR-095），镜像的 `gc` 只删除不被任何 ref 可达的对象，宽限期与影子相同（`16` §16.2.6）。Project 下所有 Goal 都归档或放弃后，也不 prune 被保留 ref 可达的对象。隐私清除时删除对应的重放包与保留 ref，之后对象才可被清理（ADR-083）。镜像 fetch 用强制更新（`10`）产生的不可达对象按上述 gc 回收 | GitService |
| 用户仓库中的 `refs/tower/*` | 规则以 `10` §10.6.2 为准（R4-D13-08）：检查点、pin、seal、安全快照只保存在影子中，`base-snapshot` 只在镜像中，**不**进入用户仓库。用户仓库默认只在集成时得到 seal 分支 `refs/heads/<prefix>/<goalId>-<slug>`（删除时机按 `10` §10.3.2）；开启“保留审计地标”（默认关）时，归档阶段写入地标 `refs/tower/<goalId>/cp/<n>`，180 天后删除。默认情况下用户的 `git log --all` 和 `push --mirror` 看不到 Tower 的内部 ref。唯一的例外是多机租约锁 `refs/tower/_owner`（§6.1.9），它只指向一个很小的 blob | GitService |
| 重放包 | **规格只在 `07` §7.4.1 定义**（ADR-083）：内容为验证日志 + base..pin 的瘦 bundle + lockfile/`depsKey` + `$VS` 配置哈希 + 脱敏输出 + 本次验证的 `env.localFiles`（只有路径与哈希，不含本地文件，ADR-174）。**保留（ADR-095）**：只有走到槽位路径的验证才有重放包；其中决定性验证（导致 `in_review`/`accepted` 的验证；以阻断结束、之后被覆盖的验证不升级，`07` §7.4.1，ADR-186；验收与 seal 的完整重哈希是指纹闸口，没有重放包，ADR-187）的重放包随 Fact 永久保留，并写镜像保留 ref `refs/tower-retain/<goalId>/<verifyId>`；其他验证（机会式、失败后的中间验证、以阻断结束的验证）的重放包在 Goal 归档或放弃后 30 天删除，不写保留 ref。隐私清除时全部删除。目录 `~/.tower/goals/<goalId>/replay/<verifyId>/`；重放命令 `tower verify --replay <verifyId>`；依赖已不可获得、没有重放包或重放包与其引用的日志已被清理时报告“不可重放：<原因>”（重放包不保证随时可执行，ADR-186）。磁盘计入 `13` 的预算（每个 Goal 平均 1–2 个永久包，MB 级） | Supervisor |
| 检查点 ref | 只存在于影子中（见上行）；保留只按 `10` §10.3.2 “检查点保留”（ADR-239） | GitService |
| 验证槽位 | 每次验证前重置，池大小固定 | VerifierScheduler |
| 日志 | 14 天或 200 MB，先到先删 | main / Supervisor |
| `tmp/` | 启动时清空，存活 Host 的 `<hostId>/` 除外（下一行） | Supervisor |
| `tmp/<hostId>/` | Host 进程退出后删除；启动恢复时删除不属于存活 Host 的残留（唯一定义 `05` §5.3.6 临时目录一行，ADR-224） | Supervisor |
| `mcp-cwd/<hostId>/` | Host 进程退出后删除；启动恢复时删除不属于存活 Host 的残留（唯一定义 `11` §11.3.4，ADR-216） | Supervisor |
| Needs-You 已解决条目 | 永久保留（精度统计需要），归档时与 Goal 一起压缩；隐私清除时删除（`09` §9.12.4） | — |

### 6.6.5 崩溃一致性

1. **单写者 + WAL**：所有写入在 `BEGIN IMMEDIATE` 事务中完成（组提交），投影与事件在同一事务里更新。进程崩溃时，未提交的事务不会留下任何痕迹。
2. **幂等键**：
   - 引擎事件：`eng:<hostId>:<epoch>:<hostSeq>`
   - UI 命令：`cmd:<cmdId>`
   - Pi 对账事件：`pi:<sessionId>:<entryId>`
   - tower-goal 产生的 Claim：`claim:<claimKey>`
   - 与具体工具调用绑定的事件（`tool.end` 及其派生的 Fact、Claim、回执）：**实时路径和对账路径都**使用 `tool:<sessionId>:<toolCallId>` 作为源键。这样，同一次工具调用无论从 Host 事件还是从 JSONL 对账进入，都只会落库一次
   - 派生事件：`derived:<源键>:<producer>:<序号>`（见 §6.3 说明）

   重放时 `INSERT … ON CONFLICT(idempotency_key) DO NOTHING`。
3. **Host → Supervisor 的事件 ack**：Host 只在收到 ack 后才丢弃缓冲。Supervisor 只在**提交之后**才 ack。所以任何时刻，事件要么已经提交，要么仍在 Host 的缓冲中。Host 退出时还没有 ack 的事件，会落盘到 `host-<epoch>-unacked.jsonl`，Supervisor 之后补读（§6.1.8）。
4. **对账（Supervisor 启动时，以及 Host 缓冲溢出后）**：对每个仍有非终态 Run 的**会话**，从 `sessions.last_entry_id` 之后读取 Pi JSONL（Run:Session = N:1，所以游标按会话记录）（SDK 直接读；RPC 用 `get_entries{since}`；Host 已退出时用 `parseSessionEntries` 读文件）。游标条目在 JSONL 中不存在时（JSONL 落后于游标，见下；RPC 的 `get_entries{since}` 此时返回 “Entry not found”，v1.2.0 `rpc-mode.ts:640-643`）从文件开头重扫，按事件的幂等键去重（ADR-183）。由此补齐：
   - `log`、`submit`、`ask_user`、`propose_contract` 的工具结果 → Claim 和状态（工具 `details` 是权威记录，`05` §5.6.6）
   - `tower.checkpoint` → checkpoints 表
   - `tower.gate` → 审计记录
   - `tower.receipt` 和带标记的 user 消息 → 评论回执
   - assistant 消息的 `usage` → 成本

   对账产生的事件带 `pi:` 幂等键，与实时路径产生的同一事实不会重复。
5. **outbox**：发给引擎的输入先写入 `engine_outbox`（与产生它的事件在同一事务），然后才发送。启动时，`sent` 状态的记录先到 JSONL 中查找回执（`05` §5.7.4），找到则标为 `confirmed`，否则重发。
6. **runDir 文件**（policy、brief 等）：先写临时文件，再 `rename` 原子替换。内容由数据库状态决定，启动时会重新渲染，因此它们只是缓存。
7. **JSONL 可能落后**：Pi 写 JSONL 不做 fsync（`05` §5.9 G20）。OS 崩溃后，JSONL 可能比 Tower 的事件少几条。对账时以 Tower 事件为准，不删除已有的 Fact，并记一条 Fact `engine_error{kind:"jsonl_lag"}`。

---

## 6.7 Tower 自身的可观测性

| 手段 | 内容 |
|---|---|
| 结构化日志 | 每个进程写 JSONL，字段为 `{ts, level, proc, goalId?, runId?, msg, ...}`；默认级别 `info`。调试面板里可以按 Goal 临时调到 `debug`，10 分钟后自动恢复 |
| 性能标记 | 事件到绘制的链路：`ev.at`（Host）→ `sup.recv` → `sup.commit` → `coal.flush` → `rnd.apply` → `rnd.paint`，每段的直方图（p50/p95/p99）放在 `system` topic。冷启动的标记：`main.ready`、`sup.db_open`、`sup.snapshot_loaded`、`rnd.first_paint_with_data`。对应 gui.md §9 的各项预算 |
| 计数器 | 每秒事件数（按类型）、Coalescer 合并率和帧大小、背压 dirty 次数、事务耗时、WAL 大小、outbox 积压、各 Host 的 RSS 和事件循环延迟、槽位占用、评审积压余量 H、被拦截的设置写入次数（`05` §5.3.3） |
| 调试面板（⌘⇧D） | 进程表（pid、RSS、CPU、事件循环延迟、epoch、最近心跳）；每个 Host 的事件流抽样（最近 200 帧，可暂停）；RPC 原始流量（脱敏）；Pi 版本与扩展诊断（加载顺序、`custom()` 不可用的扩展、`extension_error`）；数据库统计；Coalescer 统计；“重建投影”按钮和“导出诊断包”按钮 |
| 诊断包 | 最近 2 h 的日志、`system` 快照、配置（脱敏）、数据库 schema 与统计（不含内容）、选定 Goal 的事件尾部（可选）。默认去除 prompt 和工具输出正文 |
| 崩溃报告 | Electron `crashReporter` 只写本地 `crash/`。上传需要用户每次确认（`11`） |
| 自检 | 启动时检查：git 版本 ≥ 2.40（与 `10`、`14` 一致；`10` 用到 `merge-tree --write-tree` 等较新的特性）；`node:sqlite` 可用；Pi 版本是否在固定范围内（RPC 模式）；`~/.tower` 与各 Project 的 `<wtRoot>` 所在磁盘剩余空间 ≥ 2 GB（不足时以 §6.8 F8 的只读状态启动，ADR-232；读不出的卷不单独触发，`~/.tower` 所在卷读不出时显示存储提示，F8，ADR-236）；worktree 与仓库在同一卷（`10` §10.4.3）；S2 档位拒绝创建硬链接（规则与回退的唯一定义在 `11` §11.6.2 硬链接一行，ADR-223）：后台的一次探测，以 Agent、验证器（检验检出与之同一档位，`10` §10.8.3）与安装器安装阶段三种档位模板各建一次硬链接（与 SP6a A3 的硬链接一组相同，ADR-224/225）；**结果的缓存**（ADR-225）：结果连同键（本机、开机会话、Supervisor 所用沙箱运行时的版本、Tower 的版本与三种档位模板的哈希，ADR-226）记入自检日志；只重启 Supervisor 时（main 与 Host 存活，§6.1.3）沿用本次启动的结果、不重新探测（本次启动尚无结果——探测进行中 Supervisor 崩溃——时重新探测，ADR-226），存活 Host 中进行中的 Run 的沙箱档位与之对应（档位按 Run 选择，在 Run 启动时按这一结果施加）；Tower 再次启动时键相同且上次结果为“已拒绝”的直接沿用，键不同或上次未能确认拒绝时重新探测；只重启 Supervisor 而键已不同时同样重新探测，新结果只用于此后启动的活动，存活 Host 中进行中的 Run 保持它启动时的档位直到结束；有结果之前不启动使用沙箱的活动（§6.2.4 单一启动点与准入检查 h）；时限合计 10 s，出错、超时或任一档位无法启动都按“未能确认拒绝”处理，与创建未被拒绝相同——本次启动不使用 S2、各 Goal 走 S0 与 ADR-022 的授权路径（不重试；下次启动重新探测），S0 卡片的原因写 `本机的沙箱未通过启动自检（硬链接）`（`04` §4.8.5），设置页诊断与诊断包列出各档位的探测结果。**结果翻转时**（ADR-224；在新结果写入时执行——Tower 启动，或只重启 Supervisor 而键已不同，ADR-226）：由 S0 转回 S2，处于 `paused(s0_grant_pending)` 的 Goal 由 Tower 解除该原因（条目以 `obsolete` 关闭，`08` §8.8 “任意”一行），以同一 pin 在 S2 中重新验证；由 S2 转为 S0，重算各 Goal 的致命三要素（`11` §11.8 对外通信一项的“S2 不可用”；已批准或运行中的 Goal 的显示见该节“合同之外的重算”，ADR-227）。两种转入都写入自检日志与诊断包，自用期内并入 `14` §14.3.5 的自用记录 |

---

## 6.8 故障模式与恢复

| # | 故障 | 检测 | 自动处理 | 人看到什么 | 依据 |
|---|---|---|---|---|---|
| F1 | Renderer 崩溃 | `render-process-gone` | 重新加载并重新订阅 | 短暂白屏后恢复 | §6.1.3 |
| F2 | Supervisor 崩溃 | `exit` | 退避重启；Host 重放；JSONL 对账 | “重新连接中”横幅 | §6.1.3、§6.6.5 |
| F3 | Supervisor 反复崩溃 | 10 分钟内 5 次 | 安全模式（只读，可暂停或中止） | 错误页和诊断包按钮 | §6.1.3 |
| F4 | Engine Host 崩溃或挂死 | `exit` / 心跳 > 30 s | 一次自动“重启并恢复”；10 分钟内再次崩溃则转人工 | 自动恢复期间 `◇ 将自动重试 1 次`；10 分钟内再次崩溃或启动时因 `resumeOnLaunch` 关闭而没有自动解除后 `stalled{crashed\|unresponsive}`，L3（条目时机只按 `08` §8.6.3；因不可达而推迟的解除不生成条目，ADR-238）；重启中的准备失败归 F4b/F14（ADR-204、ADR-205） | `08` §8.6.3 |
| F4b | Run 准备失败（ADR-149/150） | （来源清单的唯一定义是 `16` §16.1.1 `Goal.pauseReason` 的 `prepare_failed` 一项，本格逐项补各来源的失败细节，ADR-239）仓库准备（镜像、项目锁、fetch、LFS 补齐、检出）超过 `prepare.repoTimeoutMin` 或失败（含“LFS 对象缺失”、路径冲突时卫星 `broken`）；Host 握手失败、开场组装失败，或这两步 120 s 内没有 `run.started`；`host.spawn` 之前删除本 Host 的 stdio MCP 空目录失败（`11` §11.3.4 (a)，ADR-218；卡片写出该目录并提示手动删除后重试，`04` §4.8.11，ADR-219）；Host 启动前的清单计算中全局根查询出错或超过 60 s（`05` §5.10）、Host 启动自检发现 Tower 工具被同名扩展工具遮蔽（ADR-187）或内置 MCP 被扩展取代（`05` §5.3.5，ADR-215；`03` §3.2.1 `prepare_failed` 入口，ADR-216）；以及 Run 中途 Tower 工具被同名扩展工具遮蔽（gate 阻断该调用并 drain，`05` §5.6.5，ADR-188/189）、上下文交接时运行时重建而 Host 的来源自检不通过（新会话不创建，`05` §5.3.5，ADR-217）、tower-goal 的同一处理器连续 3 次出错（drain 后进入，`05` §5.6.5 第 6 项，ADR-238/239）；Host 启动或该 Run 的准备时读到无效的 Pi 设置（`05` §5.3.6 代理一行的校验，ADR-234/235/236；卡片写 `启动失败：Pi 设置 <名字> 无效`，`重试` 旁写“请先在 Pi 设置中改正”，`12` §12.6.5）；依赖物化失败**不**属此类（Fact `prepare{ok:false}`，照常运行）；准备步骤因 `ENOSPC` 失败的也不属此类，归 F8（ADR-233） | `paused(prepare_failed)`，继续目标 `run`，`queued_run` 保留，不 `autoResume`、启动时不自动解除 | `stalled{prepare_failed}`（认证预检失败，即 F7 ②，时改为 F7 的条目，不另生成，ADR-207）：重试（`resume`；路径冲突时先改名重建）/ 我来改（仅当检出完成标记存在，ADR-152）/ 放弃；重试从已完成的步骤继续（检出完成标记缺失时重新检出；运行中途停止的一种，重试是开新的运行，界面写“开新的运行”，ADR-190） | §6.2.4 |
| F5 | pi 子进程因缺失 cwd 退出 | stderr 特征 + 退出码 1 | `ensureSatellite` 后重试一次 | 无（成功时）/ Needs-You | `05` G1 |
| F6 | 模型提供方故障或限流 | `retry.*`、`agent.end` 的 errorMessage（F7 的检测键除外：`error`/`errorMessage` 含 `OAuth refresh failed for` 的 `retry.*` 不开始根因合并，ADR-180/182） | Pi 自动重试；最终失败后，按 provider 做根因合并（不含 F7） | `stalled{engine_error}`，合并为一条 | `08` §8.4 |
| F7 | 认证过期（OAuth）或没有凭据 | 三种检测键（v1.2.0 核实，`05` §5.11.1 D58，ADR-180/182）：① **运行期**（OAuth 过期的主要情形：已存凭据时预检通过，令牌在请求时刷新）——**只在** `agent.end{willRetry:false}` 的最终错误上判定：`errorMessage` 以 `OAuth refresh failed for <provider>` 开头（`ai/src/auth/resolve.ts:139-143`，经 `ai/src/api/lazy.ts:46-59` 成为错误消息；原因文本拼在其后，`ai/src/utils/models-error.ts:16-21`），或为 `No API key for provider: <provider>`（完全没有凭据而 Run 由 `tower.*` custom message 开场：`sendCustomMessage{triggerTurn:true}` 直接 `_startRun`、不经 ② 的预检，`agent-session.ts:2339-2344`；文本见 `ai/src/api/anthropic-messages.ts:326` 等各 API 实现，ADR-207），或以 `Provider is not configured: <provider>` 开头（会话中途 Pi 判为未配置，如 Run 中途你在终端 `/logout` 而 Tower 没有注入导入的密钥，`core/model-runtime.ts:676`，经 `:705-712` 与 `ai/src/api/lazy.ts:46-59` 成为错误消息；`11` §11.7.1 模型凭据一行，ADR-231）；③ **压缩与摘要**——`compaction.end` 的 `error` 含 `OAuth refresh failed for <provider>`（前面带 Pi 的 `Auto-compaction failed: Summarization failed:` 等前缀，`agent-session.ts:2910-2922, 3237-3253`）；② **预检**（完全没有凭据）——`prompt` 抛 `No API key found for <provider>`（`agent-session.ts:2118-2131`、`auth-guidance.ts:22-25`）。v1.2.0 核实见 `05` §5.11.1 D58（ADR-182） | ② 没有 Run：按 F4b 进入 `paused(prepare_failed)`，但 Needs-You 是本行的条目，不另生成 `stalled{prepare_failed}`（`08` §8.4，ADR-207）。Tower 不另行重试。原因文本含网络或超时字样（如 `fetch failed`、`timeout`）时 Pi 会按可重试模式先重试（`ai/src/utils/retry.ts:3-5, 30-108`，`maxRetries: 3`），重试进行中（`willRetry:true`、`retry.*`）不生成 F7 条目；不进入 F6 的根因合并 | Needs-You `stalled{engine_error}`（去重键 `st:{goalId}:auth`，级别与定类见 `08` §8.4、§8.8，ADR-206）：“在终端启动 `pi`，输入 `/login <provider>`”，另给“重试”（① 的文本不区分刷新令牌失效与网络不可用；只有 ③ 而 Goal 没有暂停时不给，`08` §8.4，ADR-207）；前提是已安装 `pi` CLI（设计选择，唯一定义在 `05` §5.10，ADR-178/180）；未检测到 CLI 时文案改为“OAuth 类 provider 需要先安装 `pi` CLI 完成登录”；API 密钥类 provider 的 ② 指向 Tower 的密钥设置；Tower 不代管认证；`pi "/login <provider>"` 不触发登录（`05` §5.11.1 D58） | `05` §5.10 |
| F8 | 磁盘满 | `ENOSPC`（数据库、git、JSONL） | 停止准入新 Run；对活跃 Run 走 drain（§6.1.4 第 3 项），原因为 `app_quit`（ADR-231：磁盘满与应用退出同属 Tower 整体停下、与该 Goal 无关，解除的规则也相同，所以不另设暂停原因；`run.ended` 的 `outcome_reason` 写 `disk_full`，卡片据此写原因，`12` §12.6.5）；F8 向进行中的 drain（人的暂停、预算上限等）并入 `app_quit` 时，这次 `run.ended` 的 `outcome_reason` 同样写 `disk_full`（ADR-233）。drain 的写入先于只读切换；写不进时（SQLite 整个事务回滚）不重试：Run 照样被中止，这次 drain 的目标记入下述待补失败出口列表（Supervisor 进程内），恢复可写时先按同一规则补写；Supervisor 在此之前重启时，这些 Run 的结果按下文 “只读期间 Supervisor 启动” 的同一规则求出（ADR-233）。随后数据库切换为只读：会写数据库的命令返回 `E_STATE`（`磁盘已满，数据库只读`），`goal.delete_kept` 不写数据库、照常可用（§6.4.3）。**进行中的验证与准备**（ADR-232）：进入只读时，进行中的验证与应用退出时一样取消——终止槽位中的进程，不写 `verify.result` 与任何 Fact，已求出而未写入的结论丢弃——Goal 保持 `verifying`；机会式验证直接丢弃（§6.1.6 两行）；准备阶段中的 Goal 中止准备（终止当前步骤的进程，同 `10` §10.3.1 准备被中止），不写数据库，留在 `ready`、`preparing_since` 非空。准备步骤本身因 `ENOSPC` 失败时同样归本行，不按 F4b 写 `prepare_failed`（ADR-233：F8 先于 F4b，数据库此刻仍可写时也是如此）；③（Host 握手与开场组装，`10` §10.3.1）中只中止该 Goal 的会话创建与开场——开场已发出而 `run.started` 写不进的，以 `abort` 中止该会话的 Run，由 Host 按进程树与令牌的并集终止这一窗口中派生的进程（令牌尚未随 `run.started` 持久化，不在 §6.1.6 的范围）并 `dispose` 该会话（开场已追加在会话文件中，重新准入时同一开场可能再出现一次，如实登记，ADR-234）——不终止 Host：打包模式下它由其他 Goal 共用，它们的 Run 正由本行 drain。**进行中的写回、卫星重建与接管**（ADR-234）：进入只读时它们在本进程中停止，文件系统上能回退的照各自的失败出口立即回退——写回（交还、检验带回与 §6.1.6 的启动续写）照 §6.4.3 `inspect.bring_back` 行 “写回在本进程中失败” 的 ①、②（还原本身因 `ENOSPC` 未完成的，留到解除时按 ③ 的同一判定处理），卫星重建丢弃未完成的旁路目录（同 §6.1.6 卫星重建中途崩溃一行），接管物化停止、已写出的部分目录不删除（下一次接管按 `10` §10.2 “Tower 自动改名保留”(a) 改名），命令返回 `E_STATE`（从 `running` 接管时 drain 的目标照上文并入 `app_quit`，原目标随之放弃，ADR-144；`run.ended` 已提交、接管物化处于 ADR-200 的窗口时不并入 `app_quit`——这次 `run.ended` 不带 `disk_full`，解除时移除不了它——结果为 `paused(reasons ∪ {human})`，ADR-235）；要写数据库的失败出口——写回的 ③ 与其 Needs-You、重建失败的事务（§6.1.6 卫星丢失一行）——与上文写不进的 drain 目标一起记入 Supervisor 进程内的**待补失败出口列表**。解除时先按这一列表逐项执行（按解除时的状态求，如写回 ② 未完成的照 ③ 改名并重建；① 本身未完成的先重做 ①，成功后不再执行 ③，ADR-235），再执行推迟的中间状态检查与其余规则。列表只在进程内：Supervisor 在解除之前重启时它随之丢失，数据库中留下的 `syncing`、`satellite_rebuilding=1`、`draining_for` 由 §6.1.6 对应行（人工编辑检出 `syncing`、卫星重建中途崩溃、Run 在 drain 中途）作为推迟的中间状态检查在解除时续做。所以 `syncing` 可以在只读期间留在数据库中（写回已停而 `syncing` 仍在），只在只读期间如此，解除时由列表或 §6.1.6 消除；列表中的写回在补写之前仍算写回进行中（§6.4.3，`goal.delete_kept` 对该 Goal 返回 `E_BUSY`），会写数据库的命令本就返回 `E_STATE`。**解除**（ADR-231/232/233）：Supervisor 每 30 s、以及每次 `goal.delete_kept` 完成之后复查 `~/.tower` 所在卷与各可访问的 `<wtRoot>` 所在卷（与 §6.7 自检同一集合；`<wtRoot>` 从只读的数据库照常读出，ADR-233），并上本次触发 `ENOSPC` 的卷（进程内，如 `<wtRoot>` 为回退位置时用户仓库所在的卷；Supervisor 重启后不再包含，ADR-234），可用空间都不少于 2 GB（`16` §16.2.6）时恢复可写、撤下横幅、恢复准入，不需要重启 Tower；不可访问的 `<wtRoot>`（§6.1.6，用到它的 Goal 本就不准入）的卷不在复查集合中，读不出剩余空间的 `<wtRoot>` 按同一行计为不可访问，所以复查不因某个读不出的卷而停在只读（ADR-235）；`~/.tower` 所在卷读不出剩余空间时这一项按未知计（ADR-236）：不因此进入只读（启动时同此，§6.7）、也不因此停在只读——按其余各卷判定，并显示存储提示（`08` §8.1）；它若确实已满，下一次写入的 `ENOSPC` 再按本行进入只读。随后先执行待补失败出口列表（见上）与推迟的中间状态检查（见下），再按启动时的同一组规则处理：原因含 `app_quit`、且最后一个 Run 的 `outcome_reason` 为 `disk_full` 的暂停中 Goal 按 §6.1.4 第 5 项移除 `app_quit`（只在 `resumeOnLaunch` 打开时；剩余原因非空则保持 `paused`，与重启 Tower 的结果相同），这一集合由数据库求出、不依赖 Supervisor 的进程内状态；取消的验证按 §6.1.6 `verifying` 一行以同一个 pin 重跑；中止准备的 Goal 按 `10` §10.3.1 “启动恢复”回到排队、重新准入，从已完成的步骤继续。**只读期间 Supervisor 启动**（含只重启 Supervisor，它同样算一次启动，ADR-207）：§6.7 自检的剩余空间一项对 `~/.tower` 与各 Project 的 `<wtRoot>` 所在卷检查，任一不足 2 GB 时以同一只读状态启动（不准入、横幅、会写数据库的命令返回 `E_STATE`），会写数据库的中间状态检查（§6.1.6，含第 5 项）推迟到解除时执行；都足够时与正常启动相同；求不出剩余空间的卷不单独触发只读启动（ADR-233）。**只读启动时**（ADR-233）：main 交回的存活 Host 照常接上，Supervisor 让它们中止其中进行中的 Run（`abort`，不写数据库、不 drain），随即照 settle 顺序第 3 步按进程树与 Run 令牌的并集终止这些 Run 的全部进程（不写数据库，§6.1.6 “Agent 后台进程”一行，ADR-234）并 `dispose` 其会话，只读期间因此没有 Run 与其后台进程在运行；不写数据库的清理照常立即执行——清空 `~/.tower/tmp/` 与 `run/` 中不属于存活 Host 的内容（含已退出 Host 的 `run/<hostId>/` 即时投递凭据文件，§6.1.6 检查点写入一行），并按 §6.1.6 “Agent 后台进程”一行终止残留的后台进程（补检查点与存活者的 `bg_process_survived` 推迟到解除时）。**这些 Run 的结果**由 §6.1.6 已有的恢复行求出：存活 Host 中已中止、而数据库中没有它的 `draining_for` 与 `run.ended` 的 Run——只读启动时中止的，以及 drain 写不进之后 Supervisor 重启、Host 仍存活的（后者在正常启动时同样如此）——按 “Run 中崩溃”、“settle 中崩溃” 两行处理，与 Host 已不存在时相同，原因取 `app_quit`、`run.ended` 的 `outcome_reason` 写 `disk_full`，因此在上述解除的集合中；`draining_for` 已写进的照 “Run 在 drain 中途” 一行的 Host 存活一支续做——只读启动时这属于推迟的中间状态检查，解除时续做，`app_quit` 不并入，结果为该 drain 自己的目标（如 `paused{human}`，不带 `disk_full`；`take_over` 的目标在解除时执行，ADR-234）。只读启动时 Supervisor 写不进重放的事件，Host 的溢出文件在已满的卷上也可能写不进，由 Pi JSONL 对账兜底（§6.6.5，ADR-234）。验证命令自身因 `ENOSPC` 失败、而结论在 Supervisor 检测到 `ENOSPC` 之前已经写入的，按标准的失败计，不另判别（如实登记）；只读期间 Host 的事件缓冲随之增长，Run 已中止，有界 | 应用级横幅（不是 Needs-You 条目，`08` §8.1 “存储提示”，ADR-230；视觉见 `12` §12.8，ADR-231）和清理建议：第一条是人的工作现场的合计（估计独占大小）与存储面板的入口，由人逐行或多选 `删除`（Tower 不自动删除它们，`10` §10.2，ADR-229），其后为 scratch、旧 worktree | §6.6.4 |
| F9 | 数据库损坏 | `PRAGMA quick_check` 失败（启动时或每日） | 只读打开；提供从最近备份恢复 + 重放 JSONL 对账的选项 | 恢复向导 | §6.6.3 |
| F10 | WAL 持续增长 | WAL > 256 MB | `wal_checkpoint(TRUNCATE)`；排查长时间运行的读事务 | 调试面板 | §6.3 |
| F11 | Host 事件缓冲溢出 | Host 上报 `overflow` | 丢弃可丢弃事件（`05` §5.4.7）；必要时落盘到 `overflow.jsonl` 后补读 | 无 | `05` §5.4.7 |
| F12 | Renderer 跟不上 | inflight > 8 | topic 标记 dirty，追上后发 snapshot | 无 | §6.4.5 |
| F13 | gate 自身出错（及 tower-goal 另两个自报的处理器） | tower-goal 自报（`05` §5.6.5 第 6 项为唯一定义，ADR-237：Pi v1.2.0 的 `tool_call` 处理器出错不发 `extension_error`） | `tool_call` 处理器出错时工具被阻断（fail-safe）；`turn_start` 处理器出错时这一次请求照常发出（`05` §5.6.5 `turn_start` 一行）；`tool_result` 的脱敏处理器出错时这一次结果以隐去原文的结果代替（fail-closed，ADR-238）；三者都由 tower-goal 经 `bridge` 自报；按处理器计数，同一处理器连续 3 次出错则以 `prepare_failed` 暂停 Goal（计数、复位与暂停原因只按 `05` §5.6.5 第 6 项，ADR-239） | Needs-You `anomaly`，检测器 `tower_goal_handler_error`（severity 3，L3；去重键 `an:{goalId}:tower_goal_handler_error`，同一 Goal 合并为一条，`08` §8.4；ADR-239） | `05` §5.6.5 |
| F14 | 用户在外部删除了卫星目录 | 文件系统事件 / 下次 `ensureSatellite` | 按 ADR-076/084 从情形 E 的重建来源（`10` §10.16.2）重建（非 running 时为叠加态）；失败时进入 `paused`，继续目标按来源状态写入（ADR-094/134） | 重建期间显示 `◇ 正在重建工作目录`；失败时为 Needs-You | `10` §10.16；§6.1.6 |
| F15 | 应用退出时有 Run 在运行 | `before-quit` | drain → paused{app_quit, autoResume} | 确认框 | §6.1.4 |
| F16 | 睡眠唤醒后流断开 | `system.resume` + 网络错误 | 自动继续一次 | 无 | §6.1.5 |
| F17 | Pi 版本不兼容（RPC） | `--version` 检查 / 握手 / 冒烟测试 | 拒绝启动该 adapter，建议切换到 pi-sdk | 设置页说明 | `05` §5.11 |
| F18 | 评论与 Run 结束发生竞争，留在 Pi 队列里 | settled 时 `pendingMessageCount > 0` | `clear_queue` 后用 `prompt` 重发 | 回执状态正常推进 | `05` §5.7.4 |
| F19 | 检查点耗时过长 | 连续 3 次 > 1 s | 降级为每 3 个 turn 一次 | 设置页说明 | `10` §10.7.2 |
| F20 | 验证器进程超时、挂死或被内存上限杀死 | Runner 上报 verdict `timeout`/`hung`/`resource_exceeded` | 按 ADR-054 判别：同一 pin、相同限制下重跑一次；重跑通过 → 通过 + `flake{kind:"timing"}`；base 上同样超限或历史耗时 > 限制的 80% → `verify_env_error`（不返工）；base 正常而 pin 两次超限 → 失败，触发返工 | `verify_env_error` 时为 Needs-You（severity 2）；失败时为 `verify_failed` | ADR-054；`07` §7.4.4 |
| F21 | 设置写入被拦截（SDK） | 计数器 | 不落盘 | 调试面板 | `05` §5.3.3 |
| F22 | 时钟跳变（NTP 或手动调整） | 墙钟与单调时钟的差 > 5 s | 计时器按单调时钟重算；事件仍按 seq 排序 | 无 | §6.3 |
| F23 | 同一台机器上两个 Tower 实例同时运行 | 数据库文件锁 + `app.requestSingleInstanceLock()` | 第二个实例把焦点交给第一个后退出 | 无 | — |
| F24 | serve 令牌泄露 | 异常来源 IP 或认证失败锁定 | 令牌单独吊销；所有远程会话断开 | 设置页 | §6.4.7 |
| F25 | 两台机器上的 Tower 操作同一个仓库 | `refs/tower/_owner` 租约（§6.1.9） | 后来者对该 Project 只读 | Needs-You | §6.1.9 |
| F26 | 启动时发现集成或验证停在中间状态 | §6.1.6 的检查 | 按步骤幂等重做；无法判断时转 `needs_human` | 无（或 Needs-You） | §6.1.6 |
| F27 | RPC 模式下门禁之后输入被其他扩展修改 | `tool_result` 输入哈希比对 | severity 3 哨兵 + drain | Needs-You | `05` §5.6.5 |
