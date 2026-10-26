# 15 · 架构决策记录（ADR）

格式：背景 → 决策 → 备选与否决理由 → 后果 → 复审触发条件。状态：Accepted / Proposed / Superseded。

---

## ADR-001 Goal 是第一公民，Session 降级为 Trace — Accepted

- **背景**：原论述 P4/P6；Session 列表随 /new 堆积退化；Session 是运行时产物，人拥有的是目标。
- **决策**：持久对象是 Goal（含合同、账本、评审、记忆）；每次执行是 Run，多个 Run 可共享一个 Pi session 文件（Session : Run = 1 : N）；侧边栏只列 Goal 与 Needs-You。
- **否决**：(a) 保留 Session 列表并加标签/文件夹——治标不治本，仍需手动整理；(b) 看板化 Session（Vibe Kanban 式）——单元仍是 Session，且该格式已无护城河（其公司 2026-04 关闭）。
- **后果**：需要自建 Goal 存储与跨会话索引；Pi 的 `SessionManager.listAll` 仅用于导入历史。
- **复审**：若 `pi-durable` 稳定，评估把 Goal 存为 durable 的 storage-wide document（ADR-006）。

## ADR-002 事实 / 声明 / 人的决定三分（诚实语法） — Accepted

- **背景**：Agent 虚报成功、改测试、推理不忠实（`01` §理论）；更好看的摘要会提高信心而不提高准确度。
- **决策**：数据层每个字段标注写入者；UI 层 Fact、Claim、Human 三种视觉语法；Claim 永不为绿；Fact 带新鲜度并会过期。
- **否决**：用 LLM 裁判判定“是否成功”——AUROC ≤ 0.65，不比抛硬币好多少；仅作为辅助评审，不作为状态来源。
- **后果**：所有组件库原语从第一天起区分三种来源；需实现交叉校验器。

## ADR-003 完成三态，归档绑定人的验收 — Accepted

- **决策**：Claimed → Verified → Accepted；只有 Accepted / Abandoned 进入归档（`03` I1）。Verified 随代码变化过期（I2）。
- **否决**：原论述的“Goal 完成自动归档”——会把 Agent 的自我声明当作完成。
- **后果**：引入验证器与评审单元；“自动归档”仍然成立，但触发点是验收后的合入（integrated + 24h 宽限期）。

## ADR-004 引擎：Pi，经 Engine Adapter 接入；默认 SDK 宿主进程，可选 RPC — Accepted（Amended by ADR-202：项目信任一条，M1 中 Pi 的项目信任恒为假）

- **背景**：两份调研给出不同推荐：`research/pi.md` 推荐每 Agent 一个 `pi --mode rpc` 子进程；`research/gui.md` 推荐在 Electron `utilityProcess` 中以 SDK 承载、RPC 为备选。
- **决策**：
  - 定义 `EngineAdapter` 接口（`05` §5.2），Supervisor 只依赖它。
  - **默认实现 `pi-sdk`**：每个 Goal 一个 Engine Host（Electron `utilityProcess`），内部 `createAgentSession`，固定 Pi 版本随 Tower 发布。理由（修订版——初版高估了 SDK 的独占能力，富表单与树导航在 RPC 下也可经扩展实现，见 `05`）：
    1. **版本可控**：Tower 随附并测试固定版本的 Pi；契约测试（`05`）在升级前运行。RPC 模式下 Pi 版本由用户决定，只能做兼容性探测。
    2. **无全局副作用**：SDK 以丢弃写入的设置存储屏蔽全局 settings 写入；RPC 的 `set_steering_mode` 等命令会改用户的全局 `settings.json`，只能避免调用。
    3. **更低开销与更直接的类型**：无 JSONL 编解码与 stdout 背压风险；可直接读取 `SessionManager`。
    4. 隔离性与 RPC 相同（每 Goal 一个进程，崩溃/挂起可杀）。
    5. 用户的 `~/.pi/agent` 扩展、技能、认证照常加载（SDK 默认使用之）；项目信任显式传入（SDK 默认信任项目文件，必须覆盖）。
  - **备选实现 `pi-rpc`（“使用我安装的 pi”）**：spawn 用户安装的 `pi --mode rpc --session-dir <goal> -e <tower-goal> [--approve|--no-approve]`，自写 JSONL 客户端（LF 分帧、持续读 stdout、按 id 关联、能应答 `extension_ui_request`、无 30s 固定超时）。树导航与任意分叉经 tower-goal 注册的扩展命令（`/tower-nav`、`/tower-fork`）实现；富表单以 JSON 编码在 `ctx.ui.input` 中传递。
  - **项目信任（两种适配器一致）**：仅当 `Project.trust.state == "trusted"` **且** worktree 中 `.pi/**`、`.agents/**` 相对 `baseCommit` 未被修改时，才加载项目级 Pi 资源（RPC 传 `--approve`，SDK 经 `resolveProjectTrust`）；否则 `--no-approve`。否则 Agent 可在一次 Run 中写入 `.pi/extensions/*`，使其在下一次 Run 中以用户权限、沙箱外执行（`11` T4/T16）。
  - tower-goal 扩展写成标准 `ExtensionFactory`，两种适配器共用同一份代码（SDK 经 `DefaultResourceLoader({extensionFactories})` 注入，RPC 经 `-e`）。
- **否决**：(a) 在 Electron main 中运行 SDK——阻塞窗口/输入；(b) 在 renderer 中运行——需要 nodeIntegration，安全与性能隐患；(c) 自研 Agent 循环——不是本产品价值所在；(d) 直接基于 `pi-durable`——实验性、API 无通知变更、丢失 CLI 扩展生态。
- **后果**：Tower 必须跟踪 Pi 版本变化。对 Pi 的依赖面压到最小，并按“公开 API / 公开但未文档化 / 内部行为”三类逐项登记，每项对应一个契约测试；**唯一清单见 `05` §5.11.1**（本 ADR 不再重复列举，避免两处不一致）。
- **约束**：任何 `tool_result` 处理器（包括 Tower 的密钥脱敏与用户扩展）改写 bash 结果的 `content` 时，必须同时返回脱敏后的 `structuredContent`，否则退出码丢失、`command_result` Fact 退化；Tower 在运行时检测并告警（`07` §7.2、`11` §11.7）。
- **复审**：Pi 2.x 发布；`pi-durable` 稳定；或 RPC 增加会话/模型变更事件与 JSON Schema。

## ADR-005 Supervisor 单写者 + 事件溯源 + 投影 — Accepted（Amended by ADR-057：`abandoned` 同样分层保留）

- **决策**：Supervisor（`utilityProcess`）是唯一写者：追加式事件日志（`node:sqlite`）+ 投影快照；UI 是只读副本，以“快照 + 增量”协议订阅；人的动作作为命令发回。
- **否决**：CRDT（单写者无需）；在 renderer 中折叠事件（使 `serve` 模式与未来移动端重复实现）。
- **后果**：`serve` 模式（WebSocket）与桌面端共用同一协议。协议手写（快照 + 增量，`06`）；不依赖 `@earendil-works/chord`——Pi 1.2.0 自身已移除对它的依赖（`CA/CHANGELOG.md:81`），说明其稳定性不足以作为基础设施。
- **保留与清除**：分层保留（归档 30 天后删除 `engine.*` 细粒度事件；ADR-057 把同一规则扩展到 `abandoned`，永久保留 Fact/Claim/HumanDecision/状态变化/审计）；隐私清除用墓碑化（载荷表可删，事件行保留元数据与载荷哈希，审计哈希链对载荷哈希成链）。由此接受：已归档 Goal 只能从“快照 + 保留事件”重建（`02` §2.13、`13` §13.9.3）。

## ADR-006 观察 `pi-durable`，Goal 模型与存储解耦 — Accepted

- **决策**：Goal 存储通过 `GoalStore` 接口抽象；v1 实现为 SQLite。若 durable 稳定，评估迁移（其 storage-scope documents ≈ Goal，task graph ≈ 看板，`watch()` ≈ 多客户端）。

## ADR-007 桌面外壳：Electron 44 + React 19（Compiler）— Accepted

- **决策**：见 `research/gui.md` §2–3 的加权矩阵（Electron 105 / Web 90 / Tauri2 83）。
- **否决**：Tauri 2（WKWebView 在 120Hz 下被钳制到 60fps、样式差异、Node sidecar 不稳；OpenCode 2026 年因此迁回 Electron）；GPUI（所有组件需重造，社区工作暂停）；Electrobun（运行时剧烈变动）。
- **约束**：“精简”靠纪律而非外壳——单 renderer、重活全部在 utilityProcess、按界面懒加载、无不必要原生模块。
- **复审**：Tauri 3 CEF 运行时稳定；Solid 2.0 正式版且 UI 代码 < 20k 行。

## ADR-008 每 Goal 每仓库一个工作目录；默认位于用户检出目录的同级隐藏目录 — Accepted（修订；Amended by ADR-060：工作目录为卫星克隆而非 linked worktree）

- **目录名**：带 `.noindex` 后缀使 macOS Spotlight 跳过；同时 `tmutil addexclusion` 排除 Time Machine、Linux 写 `CACHEDIR.TAG`；位于 iCloud/Dropbox/File Provider 同步目录或网络卷时强制回退（`10` §10.4.3）。
- **决策**：worktree 默认位于 `<checkoutParent>/.tower-wt.noindex/<repoName>/<goalId>`（`checkoutParent` = 用户主检出目录的父目录）；分支 `tower/<goalId>-<slug>`；检查点与验证 pin 写入影子 ref `refs/tower/…`，不污染分支历史。`Project.worktreeRoot` 可覆盖。
- **理由**：
  1. **上下文一致**：Pi 从文件系统根到 cwd 逐级加载 `AGENTS.md`/`CLAUDE.md`（`resource-loader.ts:248-271`）。同级目录使 worktree 的祖先链与用户检出目录在仓库根以上完全相同，Agent 在 Tower 中与在用户自己的 Pi 中看到同样的上下文文件；仓库内的 `AGENTS.md` 来自 worktree 自身的检出副本。
  2. **同卷**：与仓库在同一卷上，APFS `clonefile` / reflink 等写时复制与包管理器缓存共享才有效（`10`；硬链接共享已由 ADR-021、ADR-045 禁止）；初版的 `~/.tower/worktrees` 在仓库位于外置卷时全部失效。
  3. **不污染用户仓库**：不放在仓库内部（如 `.claude/worktrees` 式），避免用户在主检出中运行的测试/构建/类型检查扫描到嵌套 worktree。
- **备选**：仓库内嵌套（Pi 对嵌套 linked worktree 有遮蔽处理，`resource-loader.ts:206-229`，但会污染用户工具）；`~/.tower/worktrees`（跨卷与祖先链问题）。
- **后果**：父目录不可写时回退到 `Project.worktreeRoot` 或 `~/.tower/worktrees`，此时 Tower 计算用户检出目录的祖先上下文文件并在简报中提示差异（受项目信任约束）。需处理 Pi “会话 cwd 不存在则退出”的问题——Run 恢复前先确保 worktree 存在（必要时重建，`10`；ADR-076 修订：从影子中最新的检查点或 pin 重建卫星，不从分支）。

## ADR-009 模型面预算：只加 3 个工具；常驻增量 ≤ 650 token，事件性注入单独封顶 — Accepted（修订）

- **背景**：Pi 的极简哲学（系统提示 + 工具定义 < 1000 token）与“to-do 会迷惑模型”的经验。初版“简报 ≤ 400 token”未说明工具声明是否计入，且装不下合同摘要 + 记忆 + 交接包。
- **决策**：
  - 运行期仅注入 `ask_user`、`log`、`submit`；塑形期注入 `ask_user`、`propose_contract`（并限制为只读工具集）。Task/Mode/Changes/Validation 由 Harness 推导。
  - **常驻增量**（每轮都在上下文中）≤ 650 token（第 1 轮修订：加入 ADR-030 的 `log` 字段后工具实测 329）：工具声明 + guideline ≤ 350；`tower_goal` 系统段 ≤ 300 = 意图与终态 ≤ 70 + 验收标准标题 ≤ 110 + 生效记忆 ≤ 120（置顶优先，其余按相关性，`09`）。典型实测合计约 445（`05` §5.6.3）。完整合同不常驻，Agent 按需读取 Goal 数据目录中的 `contract.md`。
  - **事件性注入**（只在特定 Run 出现一次，均在 Trace 中标记“Tower 注入”）：交接包 ≤ 300、返工证据 ≤ 400、提醒/nudge ≤ 60、压缩后账本块 ≤ 150。
  - 系统段内容不变时 Pi 不生成补丁（`system-prompt.ts:217-229`），不重复计费。
- **验证**：A/B（`14` 实验 E5）比较有/无 `log` 工具时的任务成功率与成本；若 `log` 显著伤害成功率，退化为仅从工具调用与 `submit` 推导。

## ADR-010 注意力路由遵循报警管理纪律 — Accepted

- **决策**：Needs-You 每条必须可行动、去重、限流、给出默认动作与延迟代价；度量告警精度并展示给用户（`08`）。
- **否决**：每个工具调用的权限弹窗（93–97% 被直接批准，是典型的滋扰告警）。

## ADR-011 记忆按作用域、带来源、需批准 — Accepted

- **决策**：User / Project / Goal 三层；Agent 只能提议，人批准后生效；注入内容在 Trace 中可见（`09`）。
- **否决**：写入 AGENTS.md（污染用户仓库、与路径绑定）；自动无审核记忆（可被投毒、不可审计）。

## ADR-012 Scratch 通道与 Goal 分离 — Accepted

- **决策**：用过即弃的对话进入 Scratch：不进 Goal 列表、7 天自动清理、不写记忆、不写真实 checkout；可一键升级为 Goal。

## ADR-013 本地优先、单用户 v1，数据模型为团队预留 — Accepted

- **决策**：v1 无云后端；`owner/actor` 字段、`team` 记忆作用域在模型中预留但不实现；`serve` 模式提供远程访问（需令牌，默认仅本机回环）。

## ADR-014 评审积压上限（Review Backlog Limit，原“评审能力调速器”）— Accepted（第 1 轮评审后修订）

- **背景**：R11。生成远快于评审；积压的待审代码会诱发橡皮图章式验收（61% 的 Agent PR 无记录评审）。初版“每日容量 − 今日已评审 − 待审 − 在途”有逻辑缺陷：评审一个单元时 LOC 从“待审”移到“已评审”，余量不变，当天的评审永远不释放余量（R1-D15-03）；“有效评审”系数 0.6 s/行 实为 6000 LOC/h，与所引 SmartBear 500 LOC/h 差 12 倍（R1-D15-02）。
- **决策**：改为 **WIP 上限**（看板式在制品限制，以 LOC 计）：
  - `余量 H = C − P − F`
    - `C` = `reviewBacklogLimitLoc`（默认 1500 ≈ 一天可认真评审的量；可关）
    - `P` = 所有 `in_review` / `accepted 未 integrated` Goal 中**尚未有效评审**的评审单元 LOC
    - `F` = 所有 `running` Goal 当前相对 base 的 diffstat（Fact，在途）
  - 评审一个单元 → P 立即减少 → 余量立即恢复（与 UI 流程 F7 一致）。
  - **有效评审**只是**反点穿下限**，不是质量保证：单元停留 ≥ `max(5 s, 1.2 s × loc)`（≈ 3000 LOC/h 的略读速度上限）且所有 hunk 都进入过视口；每个 `contentHash` 只计一次。不引用 SmartBear 作为该系数的依据；SmartBear 速率只用于“预计评审时长”的展示（对 Agent 代码的适用性由 E8 重新标定）。
  - 余量 ≤ 0 时，调度器不再把 `ready` Goal **首次**推进到 `running`（`waitReason:"review_capacity"`）；返工、恢复、交还不受限制。用户可单次越过（`HumanDecision{kind:"override_capacity"}`）。
  - **默认为“提示模式”**（只显示积压与建议，不阻止启动），E8 通过后才默认切换为“阻止模式”（ADR-019 撤回规则）。
- **数值演算**：C=1500；G1 待审 600、G2 在途 500 → H=400，G3 可启动；用户有效评审 G1 的 300 行 → P=300 → H=700。
- **后果**：`UserSettings.reviewCapacityLocPerDay` 更名为 `reviewBacklogLimitLoc`；“今日已评审 LOC”仍统计，但只用于学习与展示。

## ADR-015 同一 Goal 的多次尝试映射为 Pi 会话树分支 — Accepted（Amended by ADR-027：默认返工沿用当前分支，不开新分支）

- **决策**（经 ADR-027 修订）：回退重试、换方案在可能时使用 Pi 会话树（`navigateTree`/`fork`）而非新建无关会话；验证失败后的默认返工沿用当前分支；放弃的分支带 `branch_summary`。上下文过长时才以交接包开新会话（`parentSession` 链接）。并行 Best-of-N 无法共享一个会话文件，是“在可能时”的例外（各自 fork 出独立会话与 worktree，`10` §10.8）。
- **检查点映射**：每个检查点 ref 恰好对应一个 entry；没有代码变化的回合不产生检查点；任意 entry 的代码状态 = 会话树路径上最近的带检查点祖先（`10` §10.7.1）。

## ADR-016 Engine Adapter 为 ACP 预留 — Proposed

- **决策**：`EngineAdapter` 接口不得泄漏 Pi 专有类型（Pi 专有能力经 `capabilities` 声明）。v1 只实现 Pi；ACP（Zed Agent Client Protocol）作为第三个适配器候选，用于接入 Claude Code / Codex 等。

## ADR-017 应用退出 = 暂停并恢复；v1 无后台守护进程 — Accepted

- **决策**：关闭窗口不等于退出（macOS 留在菜单栏/Dock；Windows/Linux 有活跃 Run 或未决 Needs-You 时最小化到托盘）。显式退出时对活跃 Run 优雅暂停（`pauseReason:"app_quit"`, `autoResume:true`），下次启动自动恢复（`06` §6.1.4）。
- **否决**：后台守护进程 `towerd`——需独立签名与服务注册、三方升级协调、额外本地鉴权攻击面，且“退出了还在花钱”违背直觉。v2 再评估。

## ADR-018 平台范围：macOS 首发；Windows v1 只有策略层、无 OS 沙箱 — Accepted

- **决策**：macOS（Seatbelt 沙箱可选）与 Linux（bubblewrap/landlock）提供 OS 级写入沙箱档位；Windows 在 M3 前只有 `tool_call` 策略层与 worktree 围栏，UI 显式标注“沙箱 S0”，相关残余风险在 `11` 威胁表中标为高。

## ADR-019 特性开关登记 — Accepted（Amended by ADR-048：模型面特性单列）

- **决策**：`00` §0.5 承诺“每个监督特性都附带验证实验与可关闭开关”。以下特性必须有开关，并在 `14` 对应实验。
- **默认开启的准入规则**（回应 R1-D2-04：Pi 的“等特性被证明”）：一个监督特性默认开启，必须同时满足 (a) **不增加模型面**（不改变 Agent 的提示、工具或行为）；(b) **确定性**（不依赖 LLM 判断）或已有外部证据；(c) **风险不对称**：关闭它的最坏后果（例如绿色出现在被改过的测试上）明显重于开启它的成本（误报、少量延迟）。不满足者默认关闭或以“仅提示”形态开启。
- **撤回规则**：对应实验未达 `14` 设定的阈值时，该特性在下一个版本改为默认关闭，并在发布说明中写明。

| 特性 | 默认 | 实验 |
|---|---|---|
| `log` 工具（计划/决策/假设上报） | 开 | E5 |
| 评审积压上限 | 开·**提示模式**（不阻止启动） | E8 → 通过后切为阻止模式 |
| 测试完整性哨兵（各层） | 开（确定性；ImpossibleBench：Claude 作弊 >79% 靠改测试；静态计数不触发阻断，`07`） | E1 + 哨兵基准语料 |
| 声明交叉校验器 | 开（只有“硬矛盾”使用 danger 色；“软矛盾”中性提示，`07` §7.8） | E1 |
| 便宜的虚假成功短语检测（仅提示） | **关**（证据来自客服/AppWorld 领域，未在编码场景评估，R1-D3-01） | E1 附属离线评估 |
| 独立评审 Run（另一模型） | 关（所有风险等级，含 high；`07` 同步） | E1 变体 |
| 冲突雷达 | 开（M2） | E6 性能 + 精度日志 |
| 重入简报 | 开 | E4 |
| 攒批摘要（standup digest） | 开 | E3 |
| 活动发丝线（卡片 sparkline） | 关 | gui A/B |
| Watch 模式默认 | 关 | 使用日志 |
| 抽样深审 / predict-then-reveal（防技能萎缩） | 关 | 无（opt-in） |
| 自适应自主度晋升建议 | 关（M3） | E7 |
| 声音（severity 3） | 关 | E3 |

---

## 第 1 轮对抗评审后的跨文档决策（ADR-020 – ADR-031）

以下决策回应 `reviews/round-1.md`，是各文档修订的唯一依据。

## ADR-020 运行期进度：“已验证”与“观测到”两条轨 — Accepted（R1-D7-01、R1-D1-02、R1-D8-05；Amended by ADR-042（机会式验证只在正式队列为空时运行）、ADR-052（M 只计机器标准）、ADR-053（计入 V 前的守卫））

- **决策**：验收标准进度在所有界面统一显示为两个数：
  - **已验证 V/M**（Fact，绿色语法）：验证器在干净环境中、对当前指纹新鲜通过的 exec/artifact 标准数。
  - **观测到 O/M**（第三种语法“Agent 环境观测”，中性色、空心段、不计入验收）：Agent 在自己 worktree 中运行了与标准命令等价的命令，退出码满足、且结果对当前指纹新鲜。
- **机会式验证**：运行中，当某 Goal 指纹稳定 ≥ 120 s、全局有空闲验证槽位、且距该 Goal 上次机会式验证 ≥ 10 min 时，验证器以最低优先级对当前指纹跑一次 `exec` 标准（不跑哨兵全套），把“观测到”提升为“已验证”。默认开（满足 ADR-019 准入：不增加模型面、确定性；成本由空闲槽位约束）。
- **口径**：卡片、Goal 页、简报、重入简报、燃烧进度检测全部使用 V/M 与 O/M，不再出现单一 N/M。过期结果两轨都不计入。
- **北极星 Q3** 的回答即“已验证 V/M · 观测到 O/M”；E4 度量运行中 Q3 的可答性。

## ADR-021 验证完整性：Tower 私有依赖存储，Agent 不可写验证器依赖 — Accepted（R1-D7-02、R1-D11-02）

- **决策**：
  1. **不使用用户的全局包缓存**。Tower 为 Agent 与验证器设置私有存储（`npm_config_store_dir`/`npm_config_cache`/`UV_CACHE_DIR`/`CARGO_HOME` 等经环境变量指向 Tower 目录；具体变量与前缀以 `16` §16.8 为准，按包管理器主版本区分，ADR-063），用户在 Tower 之外的项目不受任何影响。
  2. **两套存储**：每个 Goal 的 Agent 存储（`<wtRoot>/_stores/<goalId>/`，Agent 可写，污染只影响本 Goal）；**验证器存储**（`<wtRoot>/_stores/_verifier/`，只由 Supervisor 的“安装器”步骤写入，对 Agent 与被测代码只读）。
  3. **安装器**：验证前若 `depsKey` 未命中，由 Supervisor 在独立沙箱中按 lockfile 执行冻结安装（`pnpm install --frozen-lockfile` 等，启用包管理器的完整性校验），生命周期脚本在该沙箱中运行；产物写入只读 depcache。
  4. **只用写时复制**：验证槽位的依赖目录只通过 `clonefile`/reflink 从 depcache 物化；不支持 CoW 的卷上做完整复制，**禁止硬链接**（共享 inode 会让被测代码改到缓存）。
  5. 依赖新增仍受 `dep.add` 动作类审批（`11`）。
- **残余风险**：无 OS 沙箱（S0，Windows 或 Seatbelt 不可用）时，Agent 进程理论上能写任意路径，包括验证器存储——此时“已验证”带“S0 环境”限定标记（`12` 的“有保留的已验证”变体），威胁表登记为高。

## ADR-022 无沙箱时执行 Agent 代码需要按 Goal 授权 — Accepted（R1-D11-01）

- **决策**：`exec.test`/`exec.build` 运行的是 Agent 写的代码，本质上是任意代码执行。
  - **S2（OS 写入沙箱）可用**：`exec.test`/`exec.build` 为 `silent`（代码在沙箱内）。
  - **S0**：首次运行测试/构建命令时生成一条 `approval`（“允许本 Goal 在无沙箱环境中运行测试与构建”），批准后形成 Goal 级 grant，直到合同修订或 `scope.protected` 中的测试配置改变为止；验证器在 S0 下运行 Agent 代码同样需要这一 grant。每个 Goal 最多一次打扰。
  - 威胁表新增此项，S0 残余风险为高并在 UI 能力摘要中显示。

## ADR-023 Tower 对话框的唯一规格 — Accepted（R1-D5-02、R1-D8-01、R1-D8-04）

- **决策**：所有 Tower 发起的阻塞对话（`ask_user`、审批、塑形提问）只用 `ctx.ui.input`，载荷为带 `tower:` 前缀的 JSON（两种适配器一致），规格只在 `05` §5.6.4 定义，`08`、`11` 引用之。
  - **超时**：Supervisor 计时器是权威。`unattended:"wait"`（默认）→ 不传 Pi 侧 timeout，永不超时；`unattended:"use_defaults"` → Supervisor 在 `afterSec` 到期时应答默认项，Pi 侧兜底 timeout = `afterSec + 60 s`。
  - **默认项安全规则**：审批类只能默认拒绝；单向门永不超时；**问题类在 `riskTier ≥ standard` 时不允许超时默认作答**（超时即暂停），仅 `low` 风险且 Harness 判定为可逆（只涉及 worktree 内文件、不涉及单向门动作类）时，才可默认 Agent 推荐项。“可逆”由 Harness 按动作类判定，不取 Agent 的说法。
  - **防饿死**：`costOfDelay:"agent_blocked"` 的条目在 L2 停留超过 20 min 时无视令牌桶升为 L3 一次；仍未处理则在下次重入简报中置顶。

## ADR-024 Tower 门禁的执行位置与输入冻结 — Accepted（R1-D5-01、R1-D5-06；Amended by ADR-041、ADR-046、ADR-065：RPC 不冻结输入，只做哈希比对）

- **决策**：
  1. **SDK**：tower-goal 位于 `extensionFactories` 数组末尾，是最后加载的扩展，其 `tool_call` 门禁看到最终输入；契约测试断言“门禁之后无其他 `tool_call` 处理器”。**RPC**：Pi CLI 的 `-e` 扩展**最先**加载（源码核实，`05` §5.4.1），tower-goal 无法排在末位，只能依赖第 2、3 点；因此高风险 Goal 默认使用 `pi-sdk` 适配器。
  2. 门禁记录被批准输入的哈希；`tool_result` 中比对实际执行输入，不一致 → severity 3 哨兵 `input_mutated_after_gate`。
  3. **验收依据只来自验证器**：`criterion_check` 由验证器在 Pi 之外直接执行产生，不经过任何 Pi 扩展链。`command_result`（来自 `tool.end`，可能被扩展改写）只用于观测轨与交叉校验，在 UI 中属于“观测到”，不能单独让任何东西变绿。
- **后果**：ADR-002 中“Fact 只由 Harness 产生”精确化为：**验收相关 Fact 只由不经 Pi 扩展链的 Harness 组件产生**；经扩展链转述的观测结果标注来源。

## ADR-025 `agent_settled` 之后的宽限确认 — Accepted（R1-D5-04；~~Amended by ADR-115：宽限确认之前先终止后台进程并补 `agent_bg_done` 检查点~~；Amended by ADR-121：先 2 s 宽限确认，再终止后台进程并补 `agent_bg_done` 检查点）

- **决策**：收到 `agent_settled` 后等待 2 s 并确认 `isStreaming=false` 且无新的 `agent_start`，才判定 Run 结束；若在 `claimed`/`verifying` 期间又出现新的 `agent_start`（例如某扩展在 settled 处理器中发起 prompt），立即撤回到 `running`、取消验证，记录 `anomaly{detector:"post_settle_activity"}` 并标出可能的扩展来源。同一 Goal 1 小时内第 2 次出现时不再撤回，而是 `paused(post_settle_activity)` + Needs-You（列出可疑扩展，选项：本 Goal 禁用该扩展后继续 / 继续 / 放弃）。契约测试覆盖。

## ADR-026 不接管 Pi 的压缩 — Accepted（R1-D5-05、R1-D2-01；第 2 轮修订：triggerTurn:false）

- **决策**：Pi 默认压缩路径保持不变（含 streamFn、重试、事件）。Tower 只在 `session_compact` 之后以一条 `display:true` 的 `tower.ledger` 自定义消息（≤ 150 token，Fact 语法，Trace 中标“Tower 注入”）补充账本指针，投递方式为 `pi.sendMessage(msg, {triggerTurn:false})`：流式中进入待写队列、在回合边界或 run 结束时写入，**不触发新回合**（`agent-session.ts:2348-2356`）。`deliverAs:"steer"` 会让 `_runAutoCompaction` 因队列非空而 `continue()`，强行开启额外回合（R2-D5-02）。契约测试 C17 断言“压缩后无额外 `agent_start`”。删除初版中关于 `CompactionModelOverride` 的错误回落条件。

## ADR-027 “尝试”的边界 — Accepted（R1-D5-07）

- **决策**：**尝试（attempt）= Pi 会话树上的一条分支**。只有回退（rewind）、分叉（fork）、换方案重来时才产生新尝试；验证失败后的默认返工沿用当前分支，是**同一尝试的新 Run**。`Run.attempt.n` 只在新分支时递增。UI 的尝试分支只画真实分支。

## ADR-028 Project 身份与多机 — Accepted（R1-D4-08、R1-D1-04；Amended by ADR-058）

- **决策**：
  - `ProjectId = hash(canonicalRoot)`，`canonicalRoot` = `git rev-list --max-parents=0 HEAD` 结果中字典序最小的提交；远端 URL 只是**别名**，增删远端不改变身份。
  - 浅克隆：身份暂记为 `provisional:<normalizedRemote>`，提示用户 `git fetch --unshallow`（或在 Tower 中一键执行）后升级为正式身份并自动合并记录。
  - 身份冲突/变化走“合并 Project”流程：记忆、信任、Goal 归属一并迁移，记录 `audit.project_merged`。
  - **多机**：v1 的 Goal、账本、合同只存在本机，**不承诺**跨机器连续性；可导出/导入 `.towergoal` 包（合同、账本、评审状态、已推送分支引用）。`02` 中“换机器不丢 Goal”的表述删除；`04` §4.20 记为有意偏离（理由：本地优先与 v1 范围；记忆可同步，见 `09`）。

## ADR-029 Goal 列表的老化（防止重演 Session 堆积）— Accepted（R1-D1-03）

- **决策**：侧栏只按状态分组显示需要关注的 Goal；`draft` 7 天未动、`paused`（非 app_quit）3 天未动、`ready` 14 天未启动的 Goal 自动折叠进“搁置”分组（不归档：I1 要求归档必须来自人的决定），每周简报提示“N 个搁置的 Goal：批量放弃 / 保留”。`accepted` 且“仅保留分支”超过 14 天提示归档。设计目标：50 个非终态 Goal 时，侧栏首屏仍只显示 Needs-You + 运行中 + 待验收。

## ADR-030 Cause 字段与 Claim 字段的生产者 — Accepted（R1-D1-01、R1-D4-11）

- **决策**：`log` 的 kind 增加 `cause`；`log` 参数增加可选 `rationale`、`alternatives`、`confidence`（low/medium/high）、`scopeHint`（仅 memory）。删除 `eta` 类 Claim 及 ETA 校准（无生产者、价值低）。Goal 页新增“原因”区块 = **症状**（Fact：首个失败的测试/错误签名，由验证器或观测轨产生）+ **原因**（Claim：`log{kind:"cause"}`，可链接证据）。`05` 重算工具声明 token。

## ADR-031 零机器标准的 Goal 不得显示“已验证” — Accepted（R1-D4-02、R1-D4-03）

- **决策**：Verified 要求至少一条 `exec` 或 `artifact` 标准被验证器执行。只有 `human` 标准的 Goal 从 `claimed` 进入 `in_review` 时显示中性的“未经机器验证”（不着绿、字形不同）。`artifact` 标准由验证器以内置检查执行：文件存在、必需标题/章节、链接可达（离线时跳过并标注）、最小字数；产出 `criterion_check` Fact，新鲜度按 artifact 文件内容哈希。

## ADR-032 MCP 默认值与 token 估算口径 — Accepted（R1-D2-02、R1-D2-03、R1-D12-03）

- **MCP**：继承用户 Pi 配置——用户在 `~/.pi/agent/mcp.json` 配置了服务器则启用（经 codemode/tool_search，与 Pi CLI 一致），未配置则无。MCP 工具结果一律计为“不可信内容”，MCP 服务器一律计为“对外通信”能力（致命三要素判定，`11` §11.8）。`11` 中“Tower 默认不启用 MCP”删除。
- **token 估算**：所有 Tower 预算门禁统一使用保守估算 `ceil(asciiChars/4 + nonAsciiChars/1.5)`（中文约 1.5 字符/token），而非 Pi 的 chars/4（会低估中文）。契约测试 C15 用此口径。
- **相对 Pi 基线的论证**：Pi 自身系统提示 + 工具 < 1000 token；Tower 常驻 ≤ 650 token（典型约 445）的增幅换来的是“去掉 to-do 维护与长对话复述”——进度、模式、改动全部由 Harness 推导，不进模型上下文。若 E5 显示 `log` 无益，删除后常驻增量降至约 280 token（`05` §5.6.3 实测口径）。

## ADR-033 环境变量凭据的迁移 — Accepted（R1-D2-06；Amended by ADR-049；Amended by ADR-165）

- **决策**：Engine Host 以白名单环境启动（`11` §11.7）。首次运行时 Tower 检测用户 shell 环境中的已知 provider 凭据变量（`ANTHROPIC_API_KEY`、`OPENAI_API_KEY` 等）与常见工具令牌（`GITHUB_TOKEN`…），提示“导入到 Tower 密钥库”（macOS Keychain 等）；导入后 provider 凭据经 Pi 的运行时 API key 机制注入 Engine Host（不进入 bash 子进程环境），工具令牌按 MCP 服务器/扩展的显式声明逐项传递。未导入时 UI 明确显示“该凭据仅在你的终端中可用，Tower 中不可用”。

## ADR-034 Needs-You 条目归属扩展 — Accepted（R1-D4-09）

- **决策**：`NeedsYouItem.owner = {kind:"goal", goalId} | {kind:"scratch", scratchId} | {kind:"project", projectId} | {kind:"global"}`。项目级根因合并、洪泛汇总、积压提示属 project/global；`kind` 增加 `digest`、`backlog`、`flood`、`sync_conflict`。`06` DDL 相应调整 CHECK。

## ADR-035 记忆与仓库约定的优先级 — Accepted（R1-D12-02）

- **决策**：仓库中提交的 `AGENTS.md`/`CLAUDE.md`（团队约定）优先于个人的 Project/Goal 记忆。检测到冲突（同 `subjectKey` 或批准时的人工标注）时不静默覆盖：在批准队列提示“与仓库约定冲突：保留约定 / 本 Goal 例外 / 提议修改仓库约定（导出为 AGENTS.md 修改建议）”。注入文本中删除“冲突时听记忆的”。

## ADR-036 分支历史约定 — Accepted（R1-D15-01；seal 说明结构与 trailer 集合 Amended by ADR-105）

- **决策**（经 ADR-060 修订）：Agent 的提交只存在于卫星。人在 Tower 中就地编辑（“我来改”）的改动留在卫星工作区（ADR-081 后：“我来改”在人工编辑检出中进行，交还时以文件级同步写回卫星），由检查点链归因为 `author:"human"`，**Tower 不替人提交**；集成时的 seal 提交（在影子中生成，tree = 已验证 pin 的 tree）以 Tower 身份提交，并带 `Tower-Human-Edit: <goalId>`（列出人改动的文件）与 `Co-authored-by: <用户>` trailer。检查点与验证 pin 只在影子 ref。

## ADR-037 服务与端口隔离 — Accepted（R1-D7-04、R1-D13-02；Amended by ADR-055：端口段改为 20000–29999）

- **决策**：
  - `VerifyProfile` 增加 `services`（启动命令、健康检查、清理命令）、`setup`、`teardown`。
  - **端口分配**：Supervisor 为每个 Goal worktree 与每个验证槽位分配互不重叠的端口段（默认每段 20 个端口；初版“从 41000 起”已由 ADR-055 改为 20000–29999 并加 `bind` 探测），经环境变量 `TOWER_PORT_BASE`/`PORT` 注入；项目需支持端口由环境变量配置——不支持时，Goal 并发度对该项目自动降为 1（同一时刻只有一个 Goal 或验证槽位运行服务），并在项目设置中提示。
  - Docker：验证器与 Agent 默认**不可**访问 docker socket；`services` 中声明 `docker: true` 的项目需人批准（单向门级别的项目设置），并以 compose project name = `tower-<goalId|slot>` 隔离。
  - **验证环境故障 ≠ 标准失败**：服务启动或健康检查失败、端口冲突、安装器失败记为 `verify_env_error`（Fact），不触发自动返工，进入 Needs-You（severity 2）。

## ADR-038 M1 范围收缩 — Accepted（R1-D14-01；Amended by ADR-043、ADR-059、ADR-119、ADR-133）

- **决策**〔当前值：**39 个日历周**，2026-11-09 → 2027-08-06，ADR-133 第 97 轮补记（ADR-225）；以 `14` §14.3.4 为准，顺延时随该节结论的同步清单更新，lint (C) 核对（ADR-226）；下文保留历次演变〕：M1（~~31 个日历周~~，4.5 人；第 2 轮 20 周 → 第 3 轮 26 周 → 第 4 轮 29 周（满足依赖的甘特图、节假日零产出、缓冲在冻结之前）→ 第 5 轮 31 周（ADR-081–085 新增工作 +6.4 人周）→ 第 6 轮维持 31 周（+3.6 人周由桌面、设计、安全线吸收）→ 第 7 轮维持 31 周（再 +3.6 人周，总计 92.9 人周；Agent 线与桌面线恰好满载，冻结前 2 周缓冲仍完整，但**再有任何增量即顺延 ≥ 1 周**，`14` K-风险登记）；→ 第 8 轮顺延至 **32 周**（2027-06-18；新增项均为正确性或安全缺口，无法移到 M2；各线余量 0.6–1.2 周）；~~增加 1 名全栈工程师可为 30 周~~〔更正见下〕；**预先声明的削减顺序**（第 9 轮按约束线重排，ADR-108；第 9 轮 WBS 97.8 人周、系统与 Agent 线余量 ≤ 0.1 周）：① Agent 的 W19 份额改派设计线 → ② SP6b 第二批补跑改派安全线 → ③ 检验检出中的服务启动移到 M2 → ④ “推送并开 PR”降为“仅保留分支”（W8 配置生成改派桌面）→ ⑤ 机会式验证移到 M2（③–⑤ 需修订 ADR-059；第 11 轮按约束线重排，详见 `14` §14.3.4）；**第 10 轮已执行 ① ②**（不需修订 ADR-059），M1 维持 32 周，剩余削减项为 ③–⑤；**第 11 轮后**系统、桌面、Agent、安全四条线余量均为 0.12 周：下一次增量须**同时**执行 ③+④（修订 ADR-059）或顺延 1 周（`14` §14.3.4）〔第 12 轮重算表明 ③+④ 并不释放桌面线，见 ADR-119〕；→ 第 12 轮顺延至 **33 周**（ADR-119）；增加 1 名全栈工程师的估计更正为 29 周（第 8–11 轮多算 1 周）；日期与关键路径以 `14` §14.3.4 为准）只交付闭环最小集：单仓库、≤ 3 并发、合同快速路径（塑形 Run 推迟到 M2）、运行 + Mode + Live Line、验证器（exec 标准 + ADR-021 存储隔离 + 测试完整性哨兵 L-a/L-b）、两轨进度（ADR-020）、评审单元 + 评论转向 + 回执、验收 → “仅保留分支 / 推送并开 PR”（**合并队列推迟到 M2**）、Needs-You（不含自动调节）、重入简报、S2 沙箱（若 SP6 失败则 ADR-022 授权路径）。推迟：bash AST 分类器（M1 用保守正则 + 不确定即 ask）、审计哈希链、冲突雷达、记忆同步、学习挖掘、`serve` 模式、Watch 模式之外的终端集成。工作分解与关键路径见 `14`。

## ADR-039 单一来源注册表 — Accepted（R1-D15-05/07/11、R1-D8-02、R1-D10-05）

- **决策**：新增 `16-registry.md`，作为标识符、枚举、默认数值、快捷键、刷新节奏、远程能力矩阵、动作类的**唯一来源**；其他文档只引用。各文档末尾的“主干修订状态”表删除，未决事项统一记录在 `reviews/` 的回应文件中。

## ADR-040 沙箱默认档位 — Proposed（待 SP6；R1-D15-11；交付里程碑见 ADR-059：macOS S2 为 M1，Linux S2 为 M2）

- **决策**：沙箱档位定义见 `11` §11.6（S0 仅策略层 … S3 微型 VM、S4 整进程容器；`16` §16.1.11）。默认：macOS 与 Linux 在 SP6（Seatbelt / bubblewrap+landlock 可行性 spike）通过后默认 **S2**（OS 级写入沙箱：只可写本 Goal worktree、本 Goal Agent 存储与临时目录）；SP6 失败的平台为 S0 并启用 ADR-022 授权路径；Windows 为 S0（ADR-018）。高风险 Goal 可选 S3（Gondolin 微型 VM）或 S4（容器），均为 M3。
- **复审**：SP6 结论出来后改为 Accepted 并填写实测开销。

---

## 第 2 轮对抗评审后的跨文档决策（ADR-041 – ADR-059）

以下决策回应 `reviews/round-2.md`。

## ADR-041 S2 沙箱 bash 的接线 — Accepted（R2-D5-01，阻断；Amended by ADR-066）

- **事实**（源码核实，`agent-session.ts:3534-3593` `_refreshToolRegistry`）：工具注册表按“内置 → 扩展工具（`runner.getAllRegisteredTools()`，多个扩展同名时**先注册者胜**）→ SDK `customTools`”顺序写入同一个 Map，**`customTools` 最后写入，压过一切同名定义**。
- **决策**：
  - **SDK（默认）**：沙箱 bash（`createBashToolDefinition(worktree, {operations: sandboxedOps, spawnHook})`，v1.2.0 `tools/bash.ts:427`，返回 `ToolDefinition`）以 `customTools` 注入，而不是由 tower-goal 扩展 `registerTool`。tower-goal 仍在 `extensionFactories` 末尾（门禁最后，ADR-024）。两个要求不再冲突。
  - **启动自检（两种适配器）**：Run 开始前，Host 读取生效的 `bash` 定义的 `sourceInfo`：SDK 下必须为 `<sdk:bash>`；RPC 下必须属于 tower-goal 扩展路径。不符 → 该 Goal 的沙箱档位降为 **S0**（UI 能力摘要显示“沙箱被扩展 X 覆盖 → S0”），ADR-022 的 S0 授权路径生效，并生成 Needs-You（severity 2）。
  - 契约测试：`C-tool-precedence`（customTools 胜过扩展同名工具；扩展之间先注册者胜）。

## ADR-042 验证容量与整机内存模型统一 — Accepted（R2-D7-01，阻断）

- **决策**：
  - 验证槽位的内存预留不再用固定 `min(8 GB, 0.4 × RAM)`，改为**按项目实测**：`reserve = max(1 GB, 1.3 × p95(验证进程树峰值 RSS, 最近 20 次))`，首次未知时取 2 GB（JS/TS 参考项目实测值的保守上界，SP4 测量确认）。
  - 参考硬件仍为 16 GB：`3 Goal（各 ≤ 1.2 GB 进程树预算）+ Tower 本体 ≤ 0.6 GB + 2 个验证槽位 × 2 GB ≤ 16 GB × 0.75`（为系统与用户应用保留 25%）。实测项目超出时槽位数自动降为 1，UI 显示该项目的预计验证排队时间。
  - M1 验证延迟预算（claimed → in_review p50 ≤ 10 min、p95 ≤ 20 min）**只对参考项目（5 分钟测试套件、峰值 ≤ 2 GB）承诺**；其他项目展示实测预测而非承诺。
  - 机会式验证只在“正式验证队列为空且有空闲槽位”时运行；预期频率在参考配置下约每 Goal 每 15–25 min 一次（`07` §7.4.10 演算），E4、E12 测量。

## ADR-043 M1 生态范围：仅 Node（pnpm、npm）— Accepted（R2-D14-01、R2-D7-02、R2-D11-03；Amended by ADR-064）

- **决策**：M1 的安装器、depcache、验证器物化、测试清单、私有存储环境变量只支持 **Node.js + pnpm / npm**（JS/TS 测试运行器：vitest、jest、node:test、playwright 仅作为被调用命令）。Yarn Berry、Python（uv/pip）、Rust（cargo）、Go 推迟到 M2+，在 `07` 中保留物化规格草案，在 `14` cut list 中登记。M1 遇到非 Node 项目：允许运行 Goal，但验证器只执行用户命令（无 depcache、无测试清单哨兵），结果以“有保留的已验证（生态未支持）”显示。（ADR-064 修订：M1 中验证器对非 Node 项目不运行，exec 标准只计入 O，以“未经机器验证（生态未支持）”进入评审。）

## ADR-044 Agent 的 git 写入隔离 — Superseded by ADR-060（R2-D11-02；第 3 轮实验证实该方案会使用户仓库出现悬空 ref）

- **决策**：Agent 进程中的 git 使用**私有对象目录**：`GIT_OBJECT_DIRECTORY=<wtRoot>/_objects/<goalId>`、`GIT_ALTERNATE_OBJECT_DIRECTORIES=<commonDir>/objects`（只读）。S2 拒绝写 `<commonDir>/objects/**`；只允许写 `<commonDir>/refs/heads/tower/<goalId>*`、对应 `logs/` 与 worktree 私有的 `<commonDir>/worktrees/<name>/**`。Supervisor（沙箱外）在每个检查点与 seal 前把私有对象**只增不删**地复制进公共对象库（内容寻址，幂等），验证 pin 检出前执行 `git fsck --connectivity-only <pin>`。S0 下无法强制，威胁表 T26 登记为高。

## ADR-045 包管理器环境变量唯一表 — Accepted（R2-D11-03；Amended by ADR-061、ADR-063）

- **决策**：`16` 新增“包管理器 × 环境变量 × 读/写 × 是否继承用户配置”唯一表；`05`、`07`、`10`、`11` 只引用。M1（Node）条目必须包括：pnpm `store-dir`/`cache-dir`/`state-dir`（经 `npm_config_*`）、npm `cache`、`COREPACK_HOME`、node-gyp `npm_config_devdir`、`PLAYWRIGHT_BROWSERS_PATH`/`CYPRESS_CACHE_FOLDER`/`PUPPETEER_CACHE_DIR`/`PRISMA_ENGINES_CACHE`（指向 Tower 共享只读浏览器/引擎缓存，由安装器填充）。（ADR-063 修订：pnpm ≥ 11 用 `pnpm_config_*`；node-gyp 改为 `npm_package_config_node_gyp_devdir`；Prisma 无专用变量，改为按角色设置 `XDG_CACHE_HOME`；用户 npmrc 按角色生成副本。第 4 轮（R4-D7-02）起不依赖 Corepack：确切版本的包管理器由安装器放入 `$SH/tools` 并置于 PATH 首位，`COREPACK_HOME` 不再设置。）**用户配置继承**：用户级 `~/.npmrc`（镜像、私有 registry、令牌）经 `NPM_CONFIG_USERCONFIG` 只读继承，令牌按 ADR-049 处理。SP6 的验收清单逐项覆盖此表。Agent 私有存储首次创建时从验证器存储 CoW 预热（所有支持的生态），避免每个 Goal 重新下载。

## ADR-046 RPC 适配器的门禁加固与适用范围 — Accepted（R2-D5-03；冻结部分 Superseded by ADR-065）

- **事实**（源码核实）：`runner.emitToolCall` 不捕获处理器异常；`AgentSession._beforeToolCall` 将其转为错误，`agent-loop.prepareToolCall` 的 `catch` 返回错误结果——**调用被阻断**。
- **决策**：RPC 下 tower-goal 先加载（`-e` 先于其他扩展），门禁在放行时对 `event.input` **深度冻结**；之后的处理器若尝试修改（ESM/严格模式下抛 `TypeError`）会导致调用被阻断并记 `input_mutated_after_gate` 哨兵。非严格模式代码的静默写入由 `tool_result` 中的哈希比对兜底（事后发现，severity 3）。契约测试覆盖内置工具与冻结输入的兼容性。
- **适用范围**：RPC（“使用我安装的 pi”）在检测到用户扩展注册了 `tool_call`、`tool_result` 处理器或同名 `bash` 时，只允许 `riskTier = low` 的 Goal；其余 Goal 必须用 SDK。威胁表新增 T27。`11` §11.4 改为分适配器描述。

## ADR-047 Pi 事实以发布版为准 — Accepted（R2-D2-01）

- **决策**：固定版本为 npm `1.2.0`（tag `v1.2.0`）。`research/pi-release-diff.md` 记录 HEAD 与发布版差异（12 个核心文件，无一影响 Tower 依赖的扩展、事件、RPC、压缩语义）；`05` §5.11.1 增加“发布版核实”列；SP2 以发布版 tarball 运行全部契约测试作最终确认。

## ADR-048 模型面特性的准入类别 — Accepted（R2-D2-02）

- **决策**：ADR-019 的规则 (a)（不增加模型面）适用于**监督特性**。改变模型输入的特性单列为“模型面特性”：`log` 工具、`tower_goal` 系统段、nudge、交接/返工/账本注入。它们默认开启须同时满足：(1) 在 ADR-009 的 token 预算内；(2) 每次注入在 Trace 中以“Tower 注入”原样可见；(3) 有指定实验与撤回规则（`log` → E5；nudge → E5 附属指标“nudge 后恢复率”；简报 → E5 配对：有/无系统段）。**`log` 在 M1 内部使用期默认开启，公开发布的默认值由 E5 决定**。`16` §16.6 按此重新分类。

## ADR-049 凭据类型与传递方式 — Accepted（R2-D2-04；扩展 ADR-033；Amended by ADR-067、ADR-228、ADR-229、ADR-230、ADR-231）

- **决策**：区分 **Engine Host 进程环境** 与 **Agent bash 子进程环境**：
  | 凭据类型 | 例子 | Host 环境 | bash 环境 |
  |---|---|---|---|
  | API Key | `ANTHROPIC_API_KEY` | 从钥匙串导入后经运行时 API key 注入（不放环境） | 无 |
  | 云 SDK 凭据链 | `AWS_PROFILE`/`AWS_*`、`GOOGLE_APPLICATION_CREDENTIALS`、`GOOGLE_CLOUD_PROJECT` | 首次运行检测并经用户确认后**透传**到 Host（Pi 的 provider 在 Host 内读取） | 无 |
  | OAuth（`/login`） | Claude、Codex、Copilot | Pi 的 `auth.json`（Host 读取） | 无 |
  | 代理 | `HTTPS_PROXY`、`NO_PROXY` | 透传 | 透传 |
  | 配置中的 `$ENV` 引用 | `auth.json`/`models.json` | 首次运行解析出引用的变量名，按上表类别处理 | 无 |
  | 工具令牌 | `GITHUB_TOKEN` | 按 MCP 服务器/扩展的显式声明逐项传递 | 只在合同声明时注入验证器 |
- 〔ADR-228 补记〕API Key 类 provider 另有非机密配置变量（Azure OpenAI 的端点与版本、Cloudflare 的账号与 gateway id）：密钥仍经运行时注入，配置变量原样传入 Host、不进入 bash；变量表与“透传”的现行写法（指向文件的变量与非机密配套变量、原始密钥经即时投递文件）只以 `11` §11.7.1 “云 SDK 凭据链”行为准。
- 〔ADR-229 补记〕以头部发送的令牌（`ANTHROPIC_AUTH_TOKEN`，Pi 只从进程环境读取并以 `Authorization: Bearer` 发送）不属于上表任何一类：它不能放进 Host 环境，运行时注入又只按 API Key 发送，所以 M1 不提供，首次运行标为“只在你的终端中可用”；现行写法只以 `11` §11.7.1 模型凭据一行为准。
- RPC 下 provider 密钥另可经 tower-goal 通过 `ctx.ui.input` 向 Host 取得后调用 `pi.registerProvider(name, {apiKey})`；契约测试评估该通道，通过后作为 RPC 的首选方式。

## ADR-050 计划编译保留；显式范围优先 — Accepted（R2-D4-04）

- **决策**：保留 `02` §2.5 的编译规则。若人在合同中**显式**设置了 `scope.include`，以它为准；计划步骤中超出它的 `touches` 在合同编辑器中标为“计划超出范围”警告，不自动扩大范围。合同编辑器显示“编译后的围栏”预览。`04` 中“计划步骤不可执行”的说法删除。

## ADR-051 远程批准合同的限制 — Accepted（R2-D8-01）

- **决策**：远程（web/mobile）只允许 `quick_ratify`，且仅当：合同为项目默认预设、`riskTier ≠ high`、无致命三要素警告、未放宽任何自主度或范围。其他 `contract.ratify` 只能在本机桌面执行。`16` §16.5 改正。

## ADR-052 Q3 分母的唯一定义 — Accepted（R2-D1-01）

- **决策**：`M` = 机器标准数（`exec` + `artifact`）。`human` 标准另列为“人工 h/k”，**永不进入 V 或 O**，勾选使用 Human 语法（不着绿）。`subgoal_accepted` 计入“人工”一侧（它来自人的验收）。登记于 `16` §16.1；`04`、`07`、`12` 同步。

## ADR-053 机会式验证结果计入 V 的守卫 — Accepted（R2-D7-03）

- **决策**：机会式验证在计入 V 之前执行 L-b 层的廉价静态检查（TestPathSet、标准命令所引用脚本的定义、测试配置相对 base 是否有未处置改动）。存在未处置改动时，该结果以“有保留的已验证”显示且**不计入 V**。

## ADR-054 验证器超时与资源超限的判别 — Accepted（R2-D7-04）

- **决策**：`timeout`/`hung`/`resource_exceeded` 首次出现时，在同一 pin、相同资源限制下重跑一次，并查阅同一标准在 base 上的历史耗时与峰值：
  - 重跑通过 → 计为通过，并记 `flake{kind:"timing"}`；
  - base 上同样超时/超限，或 base 历史耗时已 > 限制的 80% → `verify_env_error`（环境问题，不返工，ADR-037）；
  - base 正常而 pin 两次超时/超限 → **失败**（视为 Agent 引入的死锁/泄漏），触发返工并计次。
  `resource_exceeded` 登记为 verdict 枚举值（`16`），`04`、`06`、`07` 统一引用。

## ADR-055 端口方案修订 — Accepted（R2-D13-01）

- **决策**：
  - 端口段改为 **20000–29999**（低于 macOS 49152–65535 与 Linux 默认 32768–60999 的临时端口范围），每段 20 个；分配前 `bind` 探测，冲突则跳段。
  - `VerifyProfile.env.vars` 支持模板：`${port:N}`（段内第 N 个端口）、`${portBase}`；例如 `DATABASE_URL=postgres://localhost:${port:5}/app`。
  - 添加项目时做一次“端口能力试运行”（以两个不同的端口段启动 services 并检查健康），失败则标记 `ports:"fixed"` 并说明并发度降为 1。

## ADR-056 开源与付费边界 — Proposed（商业假设，M2 检验；R2-D16-01；判定可审计部分已由 ADR-070 独立 Accepted）

- **假设**（与 ADR-070 一致）：开源核心 = 引擎 Adapter、tower-goal 扩展、账本数据格式与导出、**验证器与哨兵的判定逻辑**（保证“用户拥有数据”与“绿色可审计”）；付费 = 桌面应用的体验层（评审单元与风险排序、注意力层、机会式验证的调度与资源管理）与跨机器同步。个人专业用户为“少返工、可审计的验收”的**使用体验**付费，而不是为判定本身付费。
- **M2 检验**（陈述意愿 + 行为指标，`14` §14.4.1）：内测 ≥ 30 名非团队用户中，(a) 陈述付费意愿 ≥ 30%；(b) **行为指标**：付费墙开启后 4 周留存（仍每周使用）≥ 50%，或预付/意向书 ≥ 10%；(c) 返工率相对基线下降 ≥ 20%。(b) 未达标则转向“开源全部 + 团队版”或停止商业化。

## ADR-057 放弃的 Goal 也进入分层保留 — Accepted（R2-D6-01）

- **决策**：`abandoned` 与 `archived` 一样，30 天后删除 `engine.*` 细粒度事件；`13` §13.9.3 的数据库预算按此重算。

## ADR-058 Project 身份固定为首次见到的根 — Accepted（R2-D4-06；修订 ADR-028；Amended by ADR-069；Amended by ADR-080）

- **决策**：`canonicalRoot` 在 Project 首次绑定时确定后**固定**；之后仓库根集合变化（`--allow-unrelated-histories`、`subtree add`）时，新根只作为别名记录，不改变身份。若用户在另一台机器上首次绑定时选出了不同的根，导入 `.towergoal` 或同步记忆时按“根集合有交集 → 同一 Project”合并。

## ADR-059 M1 范围唯一清单 — Accepted（R2-D14-01、R2-D14-02；Amended by ADR-064：生态行；ADR-133：削减 ④′，M1 集成只有“仅保留分支”；Amended by ADR-156）

本表是 M1 范围的唯一来源；`04` §4.2.4 与 `14` §14.3 只引用。

| 能力 | M1 | 推迟到 |
|---|---|---|
| 生态 | Node（pnpm/npm）完整支持；其他生态 Agent 侧可用、验证器不运行，以“未经机器验证（生态未支持）”进入评审（ADR-043，ADR-064 修订） | 其他生态的机器验证：M2 |
| 合同 | 快速路径、合同编辑器、红灯提示、human-only 合同 | 塑形 Run：M2 |
| 记忆 | **人手写**的 User/Project 记忆注入（≤ 120 token 系统段 + `contract.md`） | Agent 提议、批准队列、挖掘、同步：M2–M3 |
| 历史 | — | 导入 Pi 历史（只读视图）：M2 |
| 停滞检测 | S1（同一失败重复）、S5（静默工具）、心跳、`no_progress_for` | S2–S4、S6、S7：M2 |
| 集成 | 仅保留分支（ADR-133 削减 ④′；`integrated` 只按本地 base 观测）；base 前进只提示 | ~~推送并开 PR~~、远端轮询与远端合并观测、本地合并、合并队列、**Run 空闲点的自动 rebase**（ADR-156）：M2 |
| 沙箱 | macOS S2（SP6 通过时）/ S0 + 授权 | Linux：M2；S4：M3 |
| 适配器 | `pi-sdk` | `pi-rpc`：M2 |
| 其他 | 首次运行流程、设置、打包签名公证与自动更新、记账与预算、退出恢复、安全模式、每日备份 | `serve`、审计哈希链、冲突雷达、`.towergoal` 导出导入（M2） |

---

## 第 3 轮对抗评审后的跨文档决策（ADR-060 – ADR-070）

以下决策回应 `reviews/round-3.md`。

## ADR-060 git 隔离重新设计：卫星克隆 + Tower 影子 git 目录 — Accepted（R3-D11-01、R3-D13-01、R3-D13-02，阻断；Supersedes ADR-044，Amends ADR-008；Amended by ADR-071–075；Amended by ADR-081）

- **实验依据**：`research/git-isolation-experiment.md`（植入 `core.fsmonitor` 与 clean filter 均未被触发；用户仓库 `fsck`/`gc`/`log --all` 始终正常）。
- **决策**：
  1. **卫星克隆**：每个 Goal 每个仓库的工作目录不再是用户仓库的 linked worktree，而是 `git clone --shared --no-checkout <userCheckout> <wtRoot>/<goalId>` 后 `checkout -b tower/<goalId> <baseCommit>`。卫星的 `.git`（refs、objects、config、hooks、index）**整个归 Agent 所有**；它通过 alternates 只读引用用户对象库。Agent 的提交、gc、repack 都只影响卫星。位置仍是 `<checkoutParent>/.tower-wt.noindex/<repoName>/<goalId>`（ADR-008 的上下文一致性理由不变）。
  2. **用户仓库对 Agent 完全只读**：S2 拒绝写用户主检出与其 `commonDir` 的一切路径（不再有 ADR-044 的 refs 例外）。不设置 `GIT_OBJECT_DIRECTORY`（删除）。
  3. **Tower 影子 git 目录**：`~/.tower/goals/<goalId>/git/<projectId>.git`（裸库，Agent 不可写，alternates → 用户对象库）。Tower 对工作区的**所有** git 操作（指纹、检查点、验证 pin、seal、diff、评审单元）都以 `GIT_CONFIG_NOSYSTEM=1 GIT_CONFIG_GLOBAL=<Tower 生成的最小配置> git --git-dir=<影子> --work-tree=<卫星> -c core.fsmonitor=false -c core.hooksPath=/dev/null -c core.sshCommand=false …` 执行；**从不**经卫星的 `.git` 发现仓库、从不读卫星的 config/index/hooks。影子配置不定义任何 filter/diff/merge 驱动，因此工作区 `.gitattributes` 无法触发命令。
  4. **索引**：影子目录有自己的索引（Agent 不可写），用于 stat 缓存加速；**决定性指纹**（验证 pin、验收、I2 判定）使用全新临时索引（不信任任何 stat 缓存）。（ADR-075 修订：决定性 = 影子索引 + ctime/inode stat 检查；全新索引的完整重哈希只在验收与 seal。）
  5. **对象与 ref 的顺序**：检查点/pin/seal 先在影子目录写对象并 `update-ref`；需要进入用户仓库时，在**用户仓库**（用户自己的、可信的配置）执行 `git fetch <影子> refs/tower/<goalId>/…:refs/tower/<goalId>/…`——fetch 天然是“先传对象、后更新 ref”。用户仓库中永远不会出现悬空 ref。冲突雷达与 bundle 备份只读用户仓库与影子目录。
  6. **base 保活**：用户仓库保留 `refs/tower/<goalId>/base` 指向 baseCommit，防止用户 `gc --prune` 删掉卫星依赖的对象。（ADR-073 修订：改用 Tower 镜像库，保活 ref 删除。）
  7. **集成**：seal 提交在影子目录生成（tree = 已验证 pin 的 tree），再 fetch 进用户仓库为 `refs/heads/<branchPrefix>/<goalId>-<slug>`（`branchPrefix` 默认 `tower`，Project 级可配置；这是用户仓库中**唯一**常规出现的 Tower ref，审计地标检查点仅在 `keepAuditLandmarks` 开启时于归档时写入，ADR-073 后验证 pin 不进入用户仓库），按集成模式推送或开 PR。Agent 自己的提交历史不直接进入用户仓库；默认把 seal 作为单个提交（提交说明汇总 Agent 的提交信息，经影子目录读取卫星对象——只读对象，不读卫星配置）。保留 Agent 逐个提交的选项推迟到 M2。
- **后果**：`02` 的 `WorkspaceBinding.attach` 改为 `{checkoutPath, commonDir, satellite: true}`；`10`、`11`、`07`、`05`、`06` 中关于 linked worktree、`$GIT_COMMON_DIR` 写允许、私有对象目录的描述全部改写。威胁表新增 T29（git 元数据逃逸，残余风险：低）。SP6 增加攻击用例（fsmonitor、clean filter、`.git` 指针篡改、伪造 index）。

## ADR-061 验证器只读取验证器存储中的配置 — Accepted（R3-D7-01）

- **规则**：`16` §16.8 中 V（验证器）列不得引用任何 A（Agent）可写的路径；验证器使用的 npmrc、pnpm 配置、浏览器与引擎缓存等，都由安装器生成在 `$VS`，带内容哈希，每次验证前复核。lint 检查此规则。SP6 增加篡改用例（Agent 改写自己的 npmrc 的 `node-options`，验证器不受影响）。

## ADR-062 项目自身的生命周期脚本在槽位中针对 pin 执行 — Accepted（R3-D7-02；Amended by ADR-085）

- **决策**：安装器在 stage 中只为**第三方依赖**安装并运行其构建脚本（项目根与 workspace 自身的 `postinstall`/`prepare` 不在 stage 执行）；物化到槽位后，在槽位中针对 pin 依次执行项目自身的生命周期脚本与 `VerifyProfile.prepare`。`depsKey` 只覆盖第三方依赖输入（lockfile、清单的依赖字段、运行时版本、平台、patches）。SP5/SP6 增加 Prisma（`prisma generate`）用例。

## ADR-063 Node 私有存储按包管理器主版本配置 — Accepted（R3-D7-04；修订 ADR-045；Amended by ADR-085；Amended by ADR-165；Amended by ADR-213）

- **决策**：Tower 从 `packageManager` 字段 / lockfile 版本识别包管理器与主版本，按角色（A/V/I）生成配置：
  - **pnpm ≤ 10**：`npm_config_store_dir`/`cache_dir`/`state_dir`；**pnpm ≥ 11**：`pnpm_config_*`（只设对应版本的前缀，避免 npm 11 的未知配置警告）；
  - 用户级 npmrc（registry、auth）经 `NPM_CONFIG_USERCONFIG` 指向 Tower 为该角色生成的**副本**：A 的副本在 `$GS`（**净化副本**：删除 `_authToken`/`_auth`/密码等全部凭据；只有当合同显式授予某个 registry 令牌时，才写入那一个令牌）；V 的副本在 `$VS`（**不含令牌**——验证执行阶段禁网，不需要）；I（安装器）的含令牌副本在 `~/.tower/installer/<projectId>/`（0700，Agent 不可读；`$VS` 对 Agent 只读但可读，不能放令牌）；
  - `verify-deps-before-run=false`（按版本选前缀）；槽位内只执行 run 类命令，绝不执行 install；物化后改写 `.modules.yaml` 的 store 路径并删除 `.pnpm-workspace-state-v1.json`；
  - Prisma：无专用变量，按角色设置 `XDG_CACHE_HOME`（A → `$GS/xdg`，V → `$VS/xdg`，引擎由安装器预取）；node-gyp：`npm_package_config_node_gyp_devdir`；
  - SP6 覆盖 pnpm 9/10/11/12 与 npm 10/11。`16` §16.8.1 按此重写。

## ADR-064 M1 中非 Node 项目的如实行为 — Accepted（R3-D7-03；修订 ADR-043）

- **决策**：M1 添加非 Node 项目时明确提示“M1 不支持该生态的机器验证”。此类项目：
  - **Agent 侧可用**：S2 档位下为该 Goal 设置生态的私有用户目录（`CARGO_HOME`、`UV_CACHE_DIR`/`UV_PYTHON_INSTALL_DIR`、`GOPATH`/`GOMODCACHE`/`GOCACHE`、`PIP_CACHE_DIR` → `$GS/<eco>`；用户的镜像配置以只读副本继承），注册表网络允许；依赖按 Goal 下载（成本计入 `13`）。
  - **验证器不运行**：合同中的 exec 标准只计入观测轨（O），Goal 以“未经机器验证（生态未支持）”进入评审（ADR-031 语法）。不再声称“有保留的已验证”。
  - 首次运行可用性测试的样本改为 Node 为主、另含 1 个非 Node 仓库（检验提示与降级）；SP6 中 `cargo test` 用例只测 Agent 侧。

## ADR-065 RPC 适配器：不冻结输入，只允许“无拦截型扩展”的配置 — Accepted（R3-D5-01；Supersedes ADR-046 的冻结部分；第 5 轮注：扩展之间“先注册者胜”且 tower-goal 以 `-e` 最先加载，运行期 `registerTool` 无法取代其 bash，逐次 `getAllTools()` 复核仅为回归保护）

- **事实**：Pi 公开 API 要求扩展通过原地修改 `event.input` 改参数（`types.ts:1455`）；冻结会让这类扩展的每次调用都被阻断。
- **决策**：RPC 门禁不冻结输入，只保留哈希比对（事后发现，severity 3）。RPC 只在用户的扩展集合**不含** `tool_call`/`tool_result` 处理器、也不覆盖 `bash` 时可用（静态清单 + 启动自检）；否则该用户必须使用 SDK 适配器（UI 说明原因）。不再按风险等级区分。RPC 下每次 `tool_call` 用 `pi.getAllTools()` 复核 bash 来源（运行期 `registerTool` 可能改变注册表）。

## ADR-066 Tower 沙箱 bash 取代用户 bash 覆盖时的显式确认 — Accepted（R3-D2-01；补充 ADR-041；第 4 轮注：传入 `operations` 时 Pi 忽略 `shellPath`，沙箱执行层自行用 `getShellConfig(shellPath)` 构造，`05`；Amended by ADR-212）

- **决策**：
  - 静态清单（`05` §5.10）检测注册名为 `bash` 的用户扩展；确认卡片明示“该扩展的 bash 将被 Tower 沙箱版本取代（在 Tower 中不生效）”。
  - 沙箱 bash 以 `createBashToolDefinition(cwd, {operations, spawnHook, commandPrefix, shellPath, exposeSessionEnvironment: true})` 构造，`commandPrefix`/`shellPath` 取自用户 Pi 设置（与内置 bash 相同来源，`agent-session.ts` `createAllToolDefinitions` 调用处）；`spawnHook` 的环境白名单保留 `PI_*`。
  - SDK 下的启动自检用于防范未来 Pi 改变工具优先级（回归保护），正常运行中不会触发；UI 的“沙箱被扩展覆盖 → S0”状态只在 RPC 下可能出现。契约测试 C28 按适配器拆为两条断言。
  - 用户 bash（`!cmd`、RPC `bash` 命令）与扩展的 `pi.exec` 登记为沙箱外执行路径（C 类依赖、T16 子项）。

## ADR-067 代理链式 — Accepted（R3-D11-02；修订 ADR-049；Amended by ADR-079）

- **决策**：S2 的沙箱代理以用户代理（`HTTPS_PROXY` 等）为上游（链式）；Agent bash 环境中只出现沙箱代理地址，用户代理变量不直接透传给 bash；安装器沙箱同理。SP6 覆盖“企业代理 + S2”。

## ADR-068 `s0_grant_pending` 的唯一语义 — Accepted（R3-D4-01；Amended by ADR-077）

- **决策**：
  - **运行阶段**：S0 首次执行 `exec.test`/`exec.build` 是门禁 `ask`（Mode `blocked_guard`，Run 不 drain），**不是**暂停；`unattended:"use_defaults"` 时 30 min 默认拒绝。
  - **验证阶段**：无授权时 `verifying → paused(s0_grant_pending)`，写入 `decide()`；授权后以同一 pin 回到 `verifying`。
  - **拒绝授权**：机器标准不执行；Goal 以“未经机器验证（S0 未授权）”进入 `in_review`（ADR-031 语法），人可在评审中改为授权后重新验证。

## ADR-069 Project 自动合并只认相同的 canonicalRoot — Accepted（R3-D12-01；修订 ADR-058；Amended by ADR-080）

- **决策**：导入或同步时，只有 `canonicalRoot` 相同才自动视为同一 Project；仅根别名相交时，进入人确认的“合并 Project”流程（ADR-028）。

## ADR-070 判定逻辑可审计 — Accepted（R3-D16-01；修订 ADR-056；Amended by ADR-083、ADR-095：重放包规格与保留）

- **决策**：验证器与哨兵的**判定逻辑源码可见**（开源核心的一部分），规则在 `07` 公开；每次验证产出可复现的验证日志，用户可在本机重放。
- **重放包规格**（R4-D16-01）：`~/.tower/goals/<goalId>/replay/<verifyId>/`，内容 = 验证日志（命令、退出码、环境哈希、Tower 与 Pi 版本、`$VS` 配置哈希）+ pin 的 git bundle（从影子生成，只含 base..pin 的对象）+ lockfile 与 `depsKey`（不复制 depcache：重放时由安装器按 lockfile 重建，并比对 `depsKey`）+ 验证输出（脱敏后）。体积通常为 pin 的增量对象 + 日志（MB 级）。保留：随 Goal 的 Fact 永久保留（归档 30 天后的分层清理不删除重放包；用户可在隐私清除中删除，`02` §2.13）。隐私：只存本机，导出需显式操作。命令：`tower verify --replay <verifyId>`（登记于 `16`），开源核心。输入缺失（例如依赖已从注册表下架、bundle 被删）时报告“不可重放：<缺失项>”，不改变原 Fact。付费边界调整为：桌面应用的体验层（评审单元、注意力层、机会式验证的调度与资源管理）与跨机器同步；判定本身不闭源。

---

## 第 4 轮对抗评审后的跨文档决策（ADR-071 – ADR-080）

以下决策回应 `reviews/round-4.md`。

## ADR-071 嵌套仓库与子模块：影子索引永不含 gitlink；Tower 的 git 进程只允许执行 git — Accepted（R4-D11-01，阻断；Amended by ADR-096：裸仓库布局计为嵌套仓库；ADR-101/102：两步识别与“不复制”处置，不再拒绝交接）

- **决策**：
  1. 每次影子操作之前，Tower 以自身的文件遍历（不经 git）扫描卫星中所有嵌套的 `.git`（目录或文件，含 `.git` 文件指针），把这些路径以 `:(exclude)` pathspec 排除；若影子索引中已有 gitlink，先 `update-index --force-remove`。**gitlink 永不进入影子索引**，git 因此不会进入嵌套仓库启动子进程。
  2. **嵌套仓库**（base 中不存在的）记 Fact `sentinel{detector:"nested_repo"}`，severity 3、阻止 Verified；Agent 被提示改用普通目录。被排除路径在评审中显式列出（不能静默从评审中消失）。
  3. **子模块项目**（base 中有已注册子模块）：M1 中子模块路径同样排除，Goal 以“未经机器验证（子模块未支持）”进入评审（`not_machine_verified` 原因新增 `submodules_unsupported`）；M2 设计子模块支持。
  4. **纵深防御**：Supervisor 的所有 git 子进程（GitRunner）在一个“只允许执行 git”的 OS 沙箱档位中运行（Seatbelt：`process-exec` 只允许 git 与 `git-core` 目录、以及仓库需要时的 `git-lfs`；Linux：bwrap + seccomp 等价规则），因此即使某个配置漏网，filter/fsmonitor/hook 命令也无法启动。S0（Windows）没有这一层，T29 在 S0 下残余风险为中。
  5. SP6b 增加 G9（嵌套仓库 filter / fsmonitor / hooks、`.git` 文件指针、子模块 `.git/modules/*`），在每个支持的 git 版本上回归。

## ADR-072 卫星 `.git` 的控制文件归 Tower 所有 — Superseded（R4-D11-02；ADR-081 移出 gitdir，ADR-089 取消控制文件保护：沙箱外不可发现后不再需要）

- **决策**：
  1. 卫星创建时，Tower 写入模板配置：Agent 身份（`user.name/email`）、无远端（ADR-074）、`core.hooksPath` 指向 Tower 的空目录、不定义任何驱动（LFS 例外见 ADR-074）。
  2. S2 对 `<卫星>/.git/{config, config.worktree, hooks/**, info/**, modules/**}` 以及 `<卫星>/.git` 路径本身（重命名、删除）**写拒绝**。Agent 仍可提交（对象、refs、index、logs 可写）；`git config` 写操作失败——门禁将其归为 `git.branch_escape`（ask），读不受影响。可接受性：Agent 正常工作不需要修改仓库配置；需要时由人批准、由 Tower 代写。
  3. 在任何人工交接（“我来改”、在外部编辑器或终端中打开）之前、每次 settle 时，Tower 校验这些控制文件的内容哈希与嵌套 `.git` 扫描结果；不符 → `sentinel{detector:"git_control_tampered"}`（severity 3），Tower 从模板恢复后再交接。
  4. Engine Host 派生的子进程（用户扩展的 `pi.exec`、MCP 服务器）环境中注入 `GIT_CONFIG_COUNT`/`GIT_CONFIG_KEY_n`/`GIT_CONFIG_VALUE_n`：`core.fsmonitor=false`、`core.hooksPath=<Tower 空目录>`，作为纵深防御。
  5. S0 下第 2 点无法强制：交接前的校验与恢复（第 3 点）仍执行，残余风险登记为高（T29、T16 子项）。SP6b 增加“扩展 `pi.exec("git status")`”与“我来改”用例。

## ADR-073 每个 Project 一个 Tower 镜像库，卫星与影子不再借用用户对象库 — Accepted（R4-D13-01；Amends ADR-060 第 1、3、6 点；Amended by ADR-083）

- **决策**：Tower 为每个 Project 维护 `~/.tower/projects/<projectId>/mirror.git`（裸库，Agent 不可写）：首次以 CoW 复制用户对象库建立（APFS `clonefile` / reflink；不支持 CoW 的卷上为一次性完整复制），之后在需要新 base 时由 Tower 以镜像为上下文 `git fetch <userCheckout>`（读用户仓库，用户自己的配置可信）。**镜像从不 prune**（`gc.pruneExpire=never`；Project 下所有 Goal 归档后才允许 Tower 自己的维护任务清理）。卫星与影子的 alternates 都指向镜像，而不是用户的活动对象库。用户仓库中的 `refs/tower/<goalId>/base` 保活 ref 删除（不再需要）。检查点与 pin 之后无需额外复制：镜像对象不可变，卫星新对象在卫星自身，影子 `add -A` 写入的 blob 若已存在于镜像则复用。`10` 情形 G 与 `06` 的“唯一副本”表述据此改写；SP6b 增加评审者的 cherry-pick + 用户 `gc --prune=now` 用例。

## ADR-074 LFS、部分克隆、浅克隆与卫星远端 — Accepted（R4-D13-02/03/04；Amended by ADR-150）

- **LFS（M1：只读支持）**：检测到 `.gitattributes` 中 `filter=lfs` 且用户**全局**配置定义了 `filter.lfs.*` 时，影子与卫星配置复制这组驱动定义（来自用户全局配置，可信），ADR-071 的 git 沙箱允许执行 `git-lfs`；LFS 对象由安装器步骤预取到镜像的 LFS 存储（网络只允许 LFS 端点），卫星与验证槽位从中 smudge。M1 中 LFS 跟踪的路径默认 protected（修改需 ask，且 Goal 以“有保留”显示）；LFS 写入支持推迟到 M2。
- **部分克隆**（`remote.*.promisor=true`）：M1 不支持，添加项目时提示 `git fetch --refetch` 转为完整克隆。
- **浅克隆**：沿用 ADR-028（provisional 身份），M1 要求先一键 unshallow 才能创建 Goal。
- **卫星远端**：卫星创建后删除 `origin`，不保留任何远端；推送与开 PR 只由 Supervisor 从镜像/影子执行（`git.push`/`git.pr` 为单向门）。Agent 在卫星中执行 `git push <path>` 会被 S2（用户仓库只读）与门禁（单向门 ask）双重拦截。

## ADR-075 决定性指纹的口径与预算 — Accepted（R4-D10-01；Amends ADR-060 第 4 点）

- **决策**：影子自有索引（Agent 不可写）+ `core.trustctime=true`、`core.checkStat=default` 的 stat 检查（含 ctime 与 inode，无特权进程无法伪造）即为**决定性**指纹；全新临时索引的完整重哈希只在两个闸口执行一次：验收（accept）与 seal。`in_review`/`accepted` 期间的 60 s 巡检改为“文件系统事件驱动 + 影子索引 stat 检查”（Supervisor 在沙箱外以 FSEvents/inotify 监视卫星）。预算：无变化的 stat 检查 2 万文件 ≤ 150 ms（实测 100–150 ms）；完整重哈希按 SP5 实测登记（参考：2 万文件 2.6–7.2 s），在验收面板以进度显示，不阻塞 UI。`13`、`16` 中“无变化快路径 ≤ 30 ms”“参考项目 ≤ 2 s”的数字改正。

## ADR-076 “卫星丢失”的唯一定义 — Accepted（R4-D4-01）

- **决策**：`pauseReason` 改名 `satellite_missing`（替代 `worktree_missing`）。入口：任意非终态；检测：操作前检查与文件系统事件。
  - 有活跃 Run 时先 abort（无法 drain），然后进入 `paused(satellite_missing)`，记录 `resumeTo = {state, pauseReason}`。
  - Tower 自动从影子中**最新的检查点或 pin** 重建卫星（不是从分支——分支随卫星丢失），期间显示中性 `◇ 正在重建工作目录`；成功后回到 `resumeTo` 记录的状态与原因（`ready` 回到 `ready`，不绕过闸控；`paused(human)` 回到 `paused(human)`）。
  - `in_review`/`accepted` 下重建后，先比较重建后的树与 pin 的树：相同则不触发 I2。
  - 重建失败 → 保持 `paused(satellite_missing)`，生成 Needs-You（severity 2，琥珀，选项：从更早的检查点重建 / 放弃）。
  - `03`、`04`、`10`、`12`、`16` 同步；无“无 Run 的 running”。

## ADR-077 S0 授权的状态模型 — Accepted（R4-D4-02；Amends ADR-068）

- **决策**：`Goal.s0Grant ∈ {none, pending, granted, denied, denied_timeout}`；决定类型 `grant_s0_exec` / `deny_s0_exec`；`use_defaults` 下超时 → `denied_timeout`，评审标签 `not_machine_verified{reason:"s0_denied", by:"timeout"}`（与人拒绝区分）。`in_review`/`accepted` 行增加 `retry_verify`（手动重新验证）与 `grant_s0_exec` → `verifying`。从 `paused(s0_grant_pending)` 回到 `verifying` 时保留原 `verifyFrom`，验收延续规则照常适用。

## ADR-078 M1 的人工检验路径与本地文件 — Accepted（R4-D8-01、R4-D8-02；Amended by ADR-082；Amended by ADR-165；Amended by ADR-166）

- **检验检出**：评审中按 `O 检验` → Tower 以 CoW 复制 pin 的内容到 `<wtRoot>/_inspect/<goalId>`（独立目录，不是卫星，修改不影响 pin 与 I2），播种本地文件（下条），在该 Goal 的端口段内用 `VerifyProfile.services` 启动依赖服务，并在外部终端/编辑器中打开；人据此勾选 human 标准。M1 交付此最小路径；内嵌预览面板仍为 M2。
- **本地文件清单**：每个 Project 一份、由人批准的“本地文件”清单（被 git 忽略、但运行所需的文件，例如 `.env.local`），Tower 在创建卫星、验证槽位、检验检出时复制；复制前做密钥扫描，含密钥的条目只复制到检验检出与验证槽位（不给 Agent），并在合同的致命三要素判定中计入。
- **被跟踪的 env 文件**（`.env.test`、`.env.development` 等已提交文件）对 Agent 可读（仍做密钥扫描，命中则按密钥处理）；只有未跟踪/被忽略的 env 文件与密钥路径表中的路径读拒绝。`11` 三要素表与 §11.6.2 同步。

## ADR-079 企业代理的机制与支持范围 — Accepted（R4-D11-03；Amends ADR-067；Amended by ADR-232）

- **决策**：
  - 沙箱网络代理（sandbox-runtime）固定版本，配置 `network.parentProxy = <静态上游 URL>`；
  - PAC：Tower 在 Goal 启动时用 PAC 解析模型端点、包注册表、git 托管与 LFS 端点；若全部得到同一个上游则采用，否则 S2 网络明确失败并提示“PAC 规则过于复杂：请设置显式上游，或对该项目使用 S0”；
  - 上游认证：M1 只支持 Basic（URL userinfo）；NTLM/Negotiate 不支持，文档建议使用本机认证代理（如 px、cntlm）并把它设为上游；
  - 残余风险：经 parentProxy 的请求跳过沙箱代理对已解析地址（回环、链路本地、本机 IP）的检查，这项防护交给企业代理——登记为 T30（中）；
  - Engine Host（调用模型）与 Supervisor（`git push`、`gh pr create`）是 Tower 自身的可信进程，直接使用用户代理设置。SP6a 增加“Basic 上游”“PAC 单上游”“PAC 多上游 → 明确失败”三个用例。

## ADR-080 绑定 Project 时根集合或远端不一致需人确认 — Accepted（R4-D12-01；Amends ADR-058、ADR-069；Amended by ADR-087）

- **决策**：绑定一个检出时，若已存在相同 `canonicalRoot` 的 Project，但当前检出的根集合或远端集合与该 Project 记录的不一致（例如 monorepo 与其成员仓库），不自动并入：询问“同一项目 / 新项目”。选择“新项目”时，新身份 = `hash(canonicalRoot, 消歧键)`，消歧键为该检出首次绑定时的规范化远端（无远端时为随机 uuid），记录 `audit.project_split`。`02` §2.3 中“根提交相同 → 同一 Project”的表述改为“根提交相同且根集合、远端一致 → 同一 Project；否则人确认”。

---

## 第 5 轮对抗评审后的跨文档决策（ADR-081 – ADR-087）

以下决策回应 `reviews/round-5.md`。

## ADR-081 卫星 gitdir 移出工作目录；gitdir 写入改为白名单 — Accepted（R5-D11-01，阻断；Amends ADR-060、ADR-072；第 1 点的环境变量方式 Amended by ADR-088：改用 git 垫片；第 3 点白名单 Superseded by ADR-089；嵌套仓库“拒绝交接” Amended by ADR-101）

- **根因**：只要沙箱外有进程以“发现”方式在卫星中运行 git（扩展的 `pi.exec`、MCP git 服务器、用户 IDE），任何 Agent 可写、且被 git 当作仓库元数据读取的文件（`commondir`、`worktrees/*`、`config`、`info/*`…）都可能成为逃逸点；按文件名逐个拒绝（ADR-072 的黑名单）永远补不全。
- **决策**：
  1. **卫星工作目录中没有 `.git`**：卫星以分离 gitdir 创建（`git clone --shared --no-checkout --separate-git-dir=<wtRoot>/_gitdirs/<goalId> …`，随后删除工作目录中的 `.git` 指针文件）。Agent 的沙箱 bash 环境设置 `GIT_DIR=<wtRoot>/_gitdirs/<goalId>`、`GIT_WORK_TREE=<卫星>`，Agent 的 git 照常可用（提交、分支、log、pnpm/vitest 等调用 git 的工具继承该环境）。（ADR-088 修订：不全局导出 `GIT_DIR`，改由沙箱 bash PATH 首位的 Tower git 垫片只对卫星内运行的 git 注入。）
  2. **沙箱外的发现失效**：Host 及其派生进程（用户扩展、MCP 服务器）的环境设置 `GIT_CEILING_DIRECTORIES=<wtRoot>`，并且不含 `GIT_DIR`；它们在卫星中运行 git 时得到“不是 git 仓库”，不会读取任何 Agent 可控的元数据。代价：依赖 git 的用户扩展在 Tower 中看不到仓库——登记在 `00` §0.5.1 能力差异表中。
  3. **S2 写入白名单**：对 `<wtRoot>/_gitdirs/<goalId>` 只允许写 `HEAD`、`ORIG_HEAD`、`FETCH_HEAD`、`MERGE_*`、`CHERRY_PICK_HEAD`、`REVERT_HEAD`、`COMMIT_EDITMSG`、`index`、`*.lock`、`refs/**`、`packed-refs`、`logs/**`、`objects/[0-9a-f][0-9a-f]/**`、`objects/pack/**`、`rebase-merge/**`、`rebase-apply/**`、`sequencer/**`；**其余一律拒绝**（`config`、`config.worktree`、`commondir`、`worktrees/**`、`hooks/**`、`info/**`、`modules/**`、`objects/info/**`、`gitdir`）。S2 同时拒绝在卫星工作目录内创建名为 `.git` 的任何条目（嵌套仓库仍按 ADR-071 处理）。
  4. **“我来改”**：人不直接在卫星中工作。Tower（Agent 已暂停）创建**人工编辑检出** `<wtRoot>/_human/<goalId>`：CoW 复制卫星的工作文件（不含任何 git 元数据）+ 一个由 Tower 按模板新建的 gitdir（index 与 HEAD 由影子生成，等于卫星当前树）。人的 IDE、shell 提示符在其中运行 git 是安全的（元数据全部来自 Tower）。交还时，Tower 以文件级同步把改动写回卫星（不经 git），检查点归因为 `author:"human"`，随后删除人工编辑检出。
  5. ADR-072 的模板配置、交接前与 settle 时的校验仍保留，作为纵深防御；`GIT_CONFIG_*` 注入保留但不再是主防线。
  6. S0 下第 3 点无法强制：Tower 在交接、settle、每次影子操作前扫描卫星中的 `.git` 条目，发现即 severity 3 哨兵并拒绝交接；残余风险为高（T29）。SP6b 增加 G10（`commondir`/`worktrees/*` 重定向 + 沙箱外 git）用例。

## ADR-082 检验检出与本地密钥文件的信任边界 — Accepted（R5-D8-01、R5-D8-02；Amends ADR-078；Amended by ADR-091：Pi 资源目录可读；Amended by ADR-165；Amended by ADR-166；Amended by ADR-224：卫星中 base 未跟踪的凭据形文件只作分类、不再由 S2 读拒绝）

- **检验检出**运行的是 Agent 写的代码（pin 中的项目生命周期脚本与服务），按**验证器的沙箱档位**执行（与验证槽位同一套 S2 写/网络规则；网络按 `VerifyProfile.env.network`）；S0 下需要该 Goal 的 S0 授权（ADR-022/077），未授权则检验检出只复制文件、不执行任何脚本与服务。
- **Agent 读权限收紧**（S2）：Agent 只能读本 Goal 的卫星与其 gitdir、本 Goal 的 Agent 存储 `$GS`、共享只读缓存 `$SH`、Tower 镜像库的 `objects/`（alternates 需要）以及系统路径；**拒绝读**用户主检出、其他 Goal 的卫星、`<wtRoot>/_verify/**`、`<wtRoot>/_inspect/**`、`<wtRoot>/_human/**`、`~/.tower` 中的其他内容。含密钥的本地文件（内容扫描命中者）只复制到验证槽位与检验检出，因此对 Agent 不可读。S0 下无法强制，残余风险为高。

## ADR-083 重放包的唯一规格与镜像保留 — Accepted（R5-D6-01、R5-D13-01；Amends ADR-070、ADR-073；Amended by ADR-095：只有决定性验证永久保留）

- **唯一规格**（`07` §7.4.1 为正文，其他文档只引用）：重放包 = 验证日志 + **瘦 bundle**（base..pin 的对象）+ lockfile/`depsKey` + `$VS` 配置哈希 + 脱敏输出；重放依赖 Tower 镜像库提供 base 的对象。
- **镜像保留**：镜像库为每个仍被保留的证据写保留 ref `refs/tower-retain/<goalId>/<verifyId>`（指向对应 pin 或地标），镜像 gc 只删除不被任何 ref 可达的对象；Project 下全部 Goal 归档后也不 prune 被保留 ref 可达的对象。重放包随 Fact 永久保留，因此对应对象永久保留；用户执行隐私清除时删除重放包与对应保留 ref，之后对象才可被清理。磁盘成本：保留的只是各 pin 相对 base 的增量对象。

## ADR-084 `resumeTo`、`pendingVerify`、`verifyFrom` 的持久化与语义 — Accepted（R5-D4-01、R5-D4-02；Amended by ADR-094：`resumeTo` 增加“叠加态升级”来源；`resumeTo`/`pendingVerify` Superseded by ADR-134 的继续目标）

- **`satellite_missing` 是叠加态，不压过任何已有原因**：Goal 不在 `running` 时（`paused(<任意>)`、`ready`、`claimed`、`in_review`、`accepted`），卫星丢失只设置 `Goal.satelliteRebuilding=true` 并在后台重建，**状态与 pauseReason 都不变**（`verifying` 时取消当前验证、保留 `pendingVerify`，重建后以同一 pin 重跑）。只有 `running` 时才 abort Run 并进入 `paused(satellite_missing)`，此时 `resumeTo={state:"running"}`——`resumeTo` 只记录这一种情况，不再嵌套。重建失败时，叠加态升级为常规暂停原因 `satellite_missing`（进入优先级表）。
- **多个常规暂停原因同时成立**：`Goal.pauseReason` 取优先级最高者，其余记入持久化字段 `Goal.alsoApplies: PauseReason[]`（`02`、`06` DDL）。最高原因被解除时，若 `alsoApplies` 非空，取其中最高者成为新的 `pauseReason`（Goal 保持 `paused`），否则按 `03` §3.2.1 的出口离开 `paused`。
- **`goal.resume` 的守卫**：只对 `03` §3.2.1 中出口包含 `resume` 的原因生效；`budget_hard_cap`（未扩预算）、`sentinel_high`、`human_change_verify_failed`、`verify_env_error`、`s0_grant_pending` 等必须用各自的命令（`extend_budget`、`override_sentinel`、`retry_verify`、`grant_s0_exec`…），`goal.resume` 返回 `E_STATE`。
- `Goal.pendingVerify?: {pin, verifyFrom, trigger}` 与 `verifyFrom` **持久化**（`02`、`06` DDL），用于跨越 `paused(s0_grant_pending)` 与应用重启；验收延续据此判定。

## ADR-085 Node 安装与运行时的补充规则 — Accepted（R5-D7-01..04；Amends ADR-062、ADR-063；Amended by ADR-092：运行器基准改为 lockfile integrity，ADR-093：预取步骤）

- **运行器完整性**：`runner_tampered` 对测试运行器相关包（运行器本体及其直接依赖，数量小）在生命周期脚本之后做**内容哈希**比对（不依赖 stat），与 depcache 清单不符即阻止 Verified。
- **安装器拆分**：带令牌的**拉取**阶段（`pnpm fetch`/`npm ci --ignore-scripts` 等价物，`--ignore-pnpmfile`，不执行任何项目代码）与**不带令牌、断网**的**安装**阶段分开；`.pnpmfile.cjs` 视为项目代码（protected、变更触发 `lifecycle_script_changed`），只在不带令牌的安装阶段运行；`file:` 本地路径依赖的源路径加入 stage，它们自身的构建脚本按项目生命周期脚本在槽位中运行。
- **Node 运行时选择**：按 `.nvmrc` → `.node-version` → `package.json#volta.node` → `engines.node`（取满足范围的最新 LTS）→ Tower 默认 LTS 的顺序确定；Tower 工具缓存安装所需 Node 版本（与 pnpm 相同机制，ADR-063）；V、I、A 的 `PATH` 由 Tower 显式构造，不依赖 GUI 进程环境。运行时版本进入 `depsKey`。
- **缺失程序**：标准命令链中**每个**程序都参与生态判定；执行时 exit 127/ENOENT 记 `verify_env_error{stage:"exec", missing:<program>}`，不计为 Agent 失败。

## ADR-086 大文件不从 pin 与 seal 中排除 — Accepted（R5-D10-01）

- **决策**：`bigFileExcludes` 只用于 advisory 指纹的提速；`full`/decisive 模式（pin、seal、验收重哈希）包含全部文件。超大文件（> 50 MB）在评审单元中以“二进制/大文件”折叠显示，并在合同中提示是否应纳入 LFS。

## ADR-087 Project 身份判定的稳定输入 — Accepted（R5-D12-01；Amends ADR-080）

- **决策**：绑定时的一致性检查不再用随检出分支变化的 `rev-list --max-parents=0 HEAD`，改为：`canonicalRoot` 是否存在于该检出**全部 ref** 的根集合中（`rev-list --max-parents=0 --all`）+ 远端集合比较。消歧键 = 首次绑定时名为 `origin` 的远端（无则字典序最小的远端，无远端则 uuid），**存储**于 `Project.identity.disambiguator`，并写入导出与记忆同步元数据（跨机器对齐拆分出的项目）。旧分支检出不会再误判。
- **拆分后的归属**：已有 Goal 归属其绑定检出的远端与新旧项目匹配的一方；项目记忆复制到双方并标记“继承，待复审”；新项目的信任为 `untrusted`（重新询问）；VerifyProfile 复制后各自演化；均记录 `audit.project_split`。

## ADR-088 Agent 侧 git 垫片：不全局导出 `GIT_DIR` — Accepted（第 5 轮修订提出的副作用；Amends ADR-081 第 1 点；Amended by ADR-090、ADR-097（嵌套调用经垫片 exec-path））

- **问题**：若在 Agent 的 bash 环境中全局导出 `GIT_DIR`/`GIT_WORK_TREE`，Agent 运行的测试或脚本在**其他**目录中执行的 git（`git init <tmp>`、夹具仓库、`git clone` 依赖）也会作用于卫星 gitdir，破坏测试并污染卫星。
- **决策**：Agent 的沙箱 bash 不导出 `GIT_DIR`。Tower 在沙箱 bash 的 `PATH` 最前放一个 `git` 垫片（Tower 自带的小程序，只读、Agent 不可写）：当且仅当（1）调用方没有显式指定 `GIT_DIR`/`--git-dir`/`-C` 到卫星之外，（2）子命令不是 `init`/`clone`，（3）当前目录（或 `-C` 目标）位于卫星工作目录内，且在卫星内向上发现不到其他仓库（嵌套仓库已由 ADR-071 处理）时，才以 `GIT_DIR=<卫星 gitdir> GIT_WORK_TREE=<卫星>` 执行真实 git；其余情况原样执行真实 git。
- **代价**：不经 PATH 中 `git` 可执行文件的 git 实现（libgit2 绑定、isomorphic-git 等）在卫星中看不到仓库——登记在 `00` §0.5.1。SP6b 增加用例：测试中 `git init` 临时仓库不受影响；`vitest --changed`、`pnpm` 的 git 调用正常。

---

## 第 6 轮对抗评审后的跨文档决策（ADR-089 – ADR-095）

以下决策回应 `reviews/round-6.md`。

## ADR-089 卫星 gitdir 完全归 Agent；安全边界只靠“不可发现 + 不可创建 `.git`”；Tower 的原始文件操作防劫持 — Accepted（R6-D13-01、R6-D11-01；Amends ADR-072、ADR-081 第 3 点；Amended by ADR-096（裸仓库布局）、ADR-100（提交信息改为自行解析）、ADR-101（嵌套仓库处置改为“不复制”））

- **事实**（第 6 轮实验）：ADR-081 的 gitdir 写入白名单拦住了 `revert`/`cherry-pick`（`AUTO_MERGE`）、非快进 `merge`、`rebase`（`REBASE_HEAD`）、`stash`（`index.stash.<pid>`）、`bisect` 与 `gc` 的正常写入。白名单无法穷举 git 的内部文件。
- **重新推理**：ADR-081 之后，沙箱外**没有任何进程**会以“发现”方式读取卫星 gitdir（工作目录无 `.git`、`GIT_CEILING_DIRECTORIES`、人用人工编辑检出），Tower 自己只经影子与镜像操作。因此 Agent 写 gitdir 中任何文件都无法影响沙箱外的 git——白名单没有保护到任何东西。
- **决策**：
  1. 卫星 gitdir **整体对 Agent 可写**（取消 ADR-081 第 3 点的白名单与 ADR-072 的控制文件写拒绝/哈希校验）；Tower 不再读取其中的配置、索引或 ref 作为任何判定依据。
  2. 保留并强化两条不变式：(a) S2 拒绝在卫星工作目录**任意深度**创建名为 `.git` 的条目（正则 `^<卫星>/(.*/)?\.git(/|$)`），因此 S2 下不可能出现嵌套仓库；(b) 沙箱外进程环境含 `GIT_CEILING_DIRECTORIES=<全部 wtRoot>`。S0 下 (a) 无法强制，仍由 ADR-071 的扫描 + `nested_repo` 哨兵 + 拒绝交接兜底（T29 S0 残余为高）。
  3. **Tower 对卫星与其 gitdir 的原始文件操作防劫持**：只做三类操作——创建、整体删除、整体重建；全部以 `openat`/`O_NOFOLLOW`、只接受普通文件与目录（拒绝符号链接、FIFO、设备文件）、带超时的方式进行；重建时在旁路目录中构造完毕后以 `rename` 原子替换，不向 Agent 可控的路径内部写入。Tower 读取 Agent 提交信息（用于 seal 说明）时，在 ADR-071 的“只允许执行 git”沙箱中以 `git --git-dir=<卫星 gitdir> log` 只读运行，超时 5 s，失败则省略。
  4. **实验**（`research/git-isolation-experiment.md` 第 6 轮补充）：gitdir 整体可写时 `revert`/`stash`/`rebase --exec`/`gc` 在 Seatbelt 下成功，嵌套 `git init` 与创建 `.git` 被拒绝。**Seatbelt 策略中的路径必须先 `realpath` 规范化**（`/tmp` → `/private/tmp`），否则规则静默失效。
  5. SP6b 用例：`revert`、`cherry-pick`、非快进 `merge`、`rebase -i`、`stash`、`bisect`、`gc --auto` 在 S2 下全部成功；`refs/heads/*` 符号链接与 `HEAD` FIFO 不影响 Tower 的检查点与重建。
- `git_control_tampered` 检测器随之退役（`16` §16.1.13 登记为废弃）；ADR-072 的模板配置仍在卫星创建时写入（作为 Agent 的便利默认值，而非安全边界）。

## ADR-090 git 垫片对继承的 `GIT_DIR` 同样适用规则 — Accepted（R6-D13-02；Amends ADR-088；Amended by ADR-097）

- **决策**：垫片把“环境中继承来的、指向某个卫星 gitdir 的 `GIT_DIR`/`GIT_WORK_TREE`”视同自己注入的值，对每次调用重新判定：子命令为 `init`/`clone`，或当前目录/`-C` 目标在卫星工作目录之外时，**先移除**这两个变量再执行真实 git。因此 `rebase -x`、`bisect run`、钩子与测试中再调用的 `git init <tmp>` 不会作用到卫星。以绝对路径调用真实 git（`/usr/bin/git`）且继承了这两个变量的情况无法拦截——但只会作用到本 Goal 自己的卫星（Agent 自有），不越过沙箱边界；登记为已知限制。SP6b 增加 `rebase -x "git init /tmp/x"` 与 `bisect run` 用例。

## ADR-091 Pi 资源目录与上下文文件对 Agent 可读 — Accepted（R6-D2-01；Amends ADR-082；Amended by ADR-100、ADR-203）

- **决策**：S2 读白名单增加：`~/.pi/agent/{skills,prompts,extensions}/**`、`~/.agents/skills/**`、卫星内的 `.pi/**` 与 `.agents/**`、以及卫星工作目录各祖先目录中的 `AGENTS.md`/`AGENTS.override.md`/`CLAUDE.md`（Pi 上下文文件发现链，`resource-loader.ts`）。技能脚本可在沙箱中执行（执行仍受动作类与 S2 写/网络规则约束）。动作类：读取 Pi 资源目录与上下文文件归 `read.worktree` 同级的 `read.pi_resources`（silent），不再走 `read.external` 的 ask。`00` §0.5.1 增加说明：用户技能在沙箱中运行，写入与网络受 S2 限制。

## ADR-092 测试运行器完整性以 lockfile 完整性为基准；安装阶段不能写他人的 depcache — Accepted（R6-D7-01、R6-D7-02；Amended by ADR-098、ADR-105（`runner_patched` 只报相对 base 的变化）；安装阶段对共享缓存（pnpm store、`$SH`、`$VS/xdg` 等）一律只读，共享缓存只由 Supervisor 运行的预取与发布写入）

- **运行器完整性**：`runner_tampered` 的基准不再是“安装后的内容清单”，而是 lockfile 中运行器相关包的 `integrity`（来自注册表 tarball 的 sha512）：安装器在拉取阶段校验 tarball 并记录其文件哈希，槽位中生命周期脚本之后逐文件比对。`patches/` 或 `pnpm.patchedDependencies`/`overrides`/`resolutions` 若涉及运行器相关包，记 `sentinel{detector:"runner_patched"}`（severity 2，阻止“未保留的已验证”，人可覆盖）。
- **depcache 隔离**：安装阶段（会运行第三方依赖脚本）只对**本次 `depsKey` 的新暂存目录**有写权限；完成后由 Supervisor（沙箱外）校验并以原子 `rename` 发布到 depcache，发布后该条目只读。安装阶段对 `$VS` 的其余部分（其他 depcache 条目、验证器配置）只读。

## ADR-093 二进制下载的预取步骤 — Accepted（R6-D7-03；Amends ADR-085）

- **决策**：在拉取（带令牌）与安装（离线）之间增加**预取**步骤：不带令牌、允许访问已知下载域名（Playwright CDN、Prisma binaries、nodejs.org headers 等）的沙箱中，只运行 Tower 内置的预取命令（不执行项目代码），把浏览器、引擎、Node 头文件放入 `$SH`；安装阶段离线并以环境变量指向这些缓存。项目自定义的下载需在 `VerifyProfile.prefetch` 中由人批准后加入预取步骤；未预取而在离线安装中失败 → `verify_env_error{stage:"install", missing:"download"}`，提示把它加入 prefetch。

## ADR-094 人工编辑检出的信任提示与状态转移 — Accepted（R6-D8-01、R6-D4-01、R6-D4-02；Amended by ADR-099；部分 Superseded by ADR-134）

- **信任提示**：打开人工编辑检出前提示“IDE 打开此目录可能执行仓库中的代码（工作区设置、任务、扩展推荐、direnv 等），Tower 无法沙箱化你的 IDE”，建议使用 IDE 的受限模式（如 VS Code Workspace Trust）。登记为残余风险 T31（中）。
- **转移**：`take_over` 可从 `running`（先 drain）、`paused(*)`、`in_review`、`accepted`（未集成）发起，统一进入 `paused(human)` 并记录 `takeoverFrom`。`hand_back` 时人选择：“交给 Agent 继续” → `running`（交接消息）；“直接重新验证” → `verifying`（`verifyOrigin:"human_change"`，失败不自动返工）。
- **卫星重建失败**（非 running 时的叠加态升级）：从任意非终态进入 `paused(satellite_missing)`，此时 `resumeTo={state: 升级前状态}`（ADR-084 的 `resumeTo` 扩展为两种来源：running 中丢失、叠加态升级），人重建成功后返回该状态；`goal.resume` 按 `03` §3.2.1 分派（`06` 同步）。

## ADR-095 重放包保留策略 — Accepted（R6-D6-01、R6-D16；Amends ADR-070、ADR-083；Amended by ADR-187）

- **决策**：永久保留的重放包只限**决定性验证**：导致 `in_review`/`accepted` 的验证，以及验收与 seal 时的完整重哈希验证；其他验证（机会式、失败后的中间验证）的重放包保留到 Goal 归档后 30 天。镜像保留 ref 只为永久保留的重放包而写。预估：每个 Goal 平均 1–2 个永久重放包，体积为 pin 的增量对象 + 日志（MB 级），纳入 `13` 的 30 GB 磁盘预算。
- **可重放性的诚实说明**：重放时由安装器按 lockfile 重新拉取依赖，因此依赖已从注册表下架或私有注册表不可访问时报告“不可重放：依赖不可获得”；重放包不保证在任何时间点都可执行，保证的是“记录足以审计判定过程，并在依赖可获得时复现”。

---

## 第 7 轮对抗评审后的跨文档决策（ADR-096 – ADR-100）

以下决策回应 `reviews/round-7.md`。

## ADR-096 沙箱外的 git 一律 `safe.bareRepository=explicit` — Accepted（R7-D11-01；Amends ADR-089；扫描部分 Amended by ADR-101、ADR-102）

- **事实**：禁止 `.git` 条目不能阻止 git 把**裸仓库布局**的目录识别为仓库（`GIT_CEILING_DIRECTORIES` 只限制向上搜索）。
- **决策**：Tower 构造的所有沙箱外 git 环境（Engine Host 及其派生进程、GitRunner、人工编辑检出与检验检出的终端）都经 `GIT_CONFIG_COUNT/KEY/VALUE` 注入 `safe.bareRepository=explicit`（git ≥ 2.38 支持；Tower 的最低版本 2.40），从而沙箱外的 git 不会隐式使用任何裸仓库。ADR-071 的嵌套仓库扫描同时把“含 `HEAD`、`objects/`、`refs/` 的目录”视为嵌套仓库（`nested_repo`）。SP6b 增加用例：沙箱外在卫星中放置的裸仓库布局目录内运行 git 得到“不是 git 仓库”。

## ADR-097 git 嵌套调用也经过垫片 — Accepted（R7-D13-01；Amends ADR-088/090）

- **事实**：git 为其派生的进程把自身的 exec-path 置于 `PATH` 最前，`rebase -x`、钩子、`!` 别名中再次调用的 `git` 会绕过 PATH 上的垫片。
- **决策**：Tower 为 Agent 构造一个**垫片 exec-path**：Tower 拥有的目录，内含指向真实 `git-core` 各辅助程序的符号链接，其中 `git` 换成垫片；Agent 的沙箱 bash 设置 `GIT_EXEC_PATH=<垫片 exec-path>`，因此 git 置于 `PATH` 最前的正是垫片所在目录。SP6b G20 改为验证此机制（`rebase -x`、钩子、别名中嵌套调用的 `git init <tmp>` 不作用于卫星）。
- **备选**（若 SP6b 证明不可行）：接受限制——嵌套调用继承卫星 `GIT_DIR`，只影响 Agent 自己沙箱内的测试（例如 `rebase -x` 中创建临时仓库失败），不越过安全边界；`00` §0.5.1 登记，`14` W7-shim 预留 0.5 人周用于备选方案的文档与提示。

## ADR-098 运行器相关包按 lockfile 解析图认定 — Accepted（R7-D7-01；Amends ADR-092；Amended by ADR-105：只报相对 base 的变化）

- **决策**：“运行器相关包”从 lockfile 的**解析结果**（别名展开后的真实包名与版本、含 `npm:` 别名）确定，而不是从 `package.json` 中的名字；覆盖来源包括 `package.json` 的 `overrides`/`resolutions`/`pnpm.*`、`pnpm-workspace.yaml` 的 `overrides`/`catalog`/`packageExtensions`/`patchedDependencies`。这些键与文件进入默认 protected（`02` §2.5）；涉及运行器相关包时记 `runner_patched`。SP6c 增加别名与 workspace overrides 用例。

## ADR-099 “我来改”的全部出路 — Accepted（R7-D4-01、R7-D6-01、R7-D8-01；Amends ADR-094；Amended by ADR-103、ADR-104、ADR-228、ADR-229）

- **放弃改动**（`goal.discard_human_edits`）：若 `takeoverFrom ∈ {in_review, accepted}` 且卫星树仍等于 pin 的树，直接回到 `takeoverFrom`（不触发 I2）；若 `takeoverFrom ∈ {in_review, accepted}` 但卫星树 ≠ pin 的树 → 进入 `verifying`（I2 语义，`verifyOrigin:"manual"`）；接管前为 `running`/`paused(*)` → 回到 `paused(<接管前的原因>)`（接管前为 `running` 时为 `paused(human)`）；均删除人工编辑检出。不会在用户未要求时开 Agent Run。
- **检验带回**（`inspect.bring_back`）：从 `in_review`/`accepted` 出发，以 pin 的树为基线把检验检出中的改动写回卫星，进入 `verifying{verifyOrigin:"human_change"}`；记录 `HumanDecision{kind:"bring_back_inspection"}`。
- **交还时清除过期原因**：`hand_back` 时，`alsoApplies` 中与旧 pin 绑定的原因（`sentinel_high`、`verify_failed_limit`、`verify_env_error`、`s0_grant_pending`、`human_change_verify_failed`）一律清除（新 pin 会重新判定），只保留与 pin 无关的原因（`budget_*`、`app_quit`、`provider_unavailable`）。交还对话框在仍有保留原因时如实显示“交还后仍暂停：<原因>”。
- **接管期间的系统动作**：`humanCheckout` 存在期间暂停对该 Goal 的自动 rebase、机会式验证与合并队列（已在队列中则出队，交还后重新入队）。
- **写回的幂等**：`humanCheckout` 增加 `syncState: "idle" | "syncing"` 与已写清单；重启后对 `syncing` 以目标树幂等续写，不判为“卫星在编辑期间被改动”。检出丢失时恢复选项为 `goal.resume`（不要求检出存在）。
- **命令拆分**：`goal.hand_back`（要求人工编辑检出存在）与 `goal.retry_after_human_change`（用于 `paused(human_change_verify_failed)`，无检出）分开。

## ADR-100 Agent 读权限与 Tower 对卫星 gitdir 的最后一处读取 — Accepted（R7-D2-01、R7-D11-02；Amends ADR-089、ADR-091）

- **Agent 读白名单调整**：增加 Pi 包目录中的资源 `~/.pi/agent/{npm,git}/**/{skills,prompts}/**`（包内技能与提示模板），以及用户 Pi 设置中 `skills`/`prompts` 指定的自定义路径（Run 开始时解析并 realpath）；**移除** `~/.pi/agent/extensions/**`（扩展由 Host 加载，Agent 无需读取，且其中常有配置或密钥）。
- **提交信息读取改为 Tower 自行解析**：seal 说明需要的 Agent 提交信息，不再在卫星 gitdir 上运行 git；Tower 只读解析普通文件：`HEAD` → ref 文件或 `packed-refs` → 提交对象（loose 对象 zlib 解压，或在 pack 中按 `.idx` 定位），带大小上限（单对象 ≤ 1 MB、总计 ≤ 200 个提交）、`O_NOFOLLOW`、超时；不读取 config、include、alternates。解析失败则省略提交信息。至此 Tower 对卫星 gitdir 只有“创建、整体删除、整体重建、只读解析提交对象”四种操作。

---

## 第 8 轮对抗评审后的跨文档决策（ADR-101 – ADR-105）

以下决策回应 `reviews/round-8.md`。

## ADR-101 嵌套仓库识别以 git 自身的判定为准 — Accepted（R8-D11-01；Amends ADR-071、ADR-096；Amended by ADR-106：卫星侧扫描降为早期预警，权威检查在物化 pin 上；ADR-109：权威检查改为 `pinSafetyCheck`，不排除只阻断，检出只不写出命中路径）

- **事实**：git 把一个目录当作仓库的必要条件之一是存在名为 `HEAD` 的条目（普通文件或符号链接），再配合 `objects/`、`refs/` 或 `commondir` 等；按固定布局枚举无法覆盖全部变体。
- **决策**：扫描分两步：(1) **名字粗筛**——在卫星中（被忽略目录也扫描，`O_NOFOLLOW`）找出所有含名为 `HEAD` 条目、或名为 `.git` 条目的目录；(2) **git 确认**——在 ADR-071 的“只允许执行 git”沙箱中，以 `safe.bareRepository=all`、`GIT_CEILING_DIRECTORIES=<该目录父目录>` 在该目录运行 `git rev-parse --absolute-git-dir`，成功即判定为仓库。确认结果的处置统一为：
  - base 中**未跟踪**的仓库目录（Agent 新造）→ `sentinel{detector:"nested_repo"}`（severity 3，阻止 Verified），从影子索引、pin、seal 中排除并在评审中列出；
  - **任何**确认为仓库形态的目录（含 base 中已跟踪且未改动的夹具，ADR-102/106）都**不复制**到人工编辑检出与检验检出中（依赖它们的测试在这两个检出中会失败，以验证器结果为准），并在打开前的信任提示中列出“以下目录未复制：可被 git 识别为仓库”；不再拒绝接管或检验。
- 预算：粗筛只是目录名遍历（S2 下以文件系统事件增量维护，S0 与交接前全量），git 确认只对候选执行；`13` 登记。SP6b 增加 `commondir` 变体与符号链接 `HEAD` 变体用例。

## ADR-102 base 中已跟踪的“仓库形态”测试夹具按普通文件处理 — Accepted（R8-D13-01；Amended by ADR-106：判定收紧为“base 中已是仓库形态且结构未变”；ADR-109：未改动的 base 夹具照常写出到两种检出；ADR-111：任何改动都命中 `nested_repo`、阻断）

- **决策**：若一个确认为仓库形态的目录中的文件**在 base 中已被跟踪**（典型为 git 工具类项目的裸仓库夹具），它们是普通的项目内容：照常进入影子索引、pin、seal 与评审（影子以显式路径 `add` 普通文件，不会把它们当作 gitlink），〔下一句已被 ADR-111 取代：对这类目录下的任何改动都命中 `nested_repo` 并阻断〕~~Agent 对它们的修改同样进入评审~~；只是不复制到人工编辑检出与检验检出（ADR-101）。依赖目录（被忽略的 `node_modules` 等）中的同类目录只影响“不复制”，不产生哨兵。

## ADR-103 交还时只清除可由新 pin 重新推导的原因 — Accepted（R8-D7-01；Amends ADR-099；Amended by ADR-107、ADR-110：阻断类 run 推导只剩 input_mutated_after_gate；`post_settle_activity` 的交还归类见 `16` §16.1.1）

- **决策**：把暂停原因与哨兵分为两类：
  - **由 pin 推导**（新验证会重新判定）：`verify_failed_limit`、`verify_env_error`、`s0_grant_pending`、`human_change_verify_failed`，以及只依据 pin 内容计算的哨兵（测试完整性、范围、依赖、生命周期脚本等）——交还时清除；
  - **由运行行为推导**（新 pin 无法重新判定）：其中**阻断类**只有 `input_mutated_after_gate`（ADR-107/110）——**保留**，仍须人以 `override_sentinel`（带结构化原因）处置，交还不能绕过；`policy_wall`、`post_settle_activity`、`sandbox_violation` 等为提示性，不阻断、交还即解除。
  - **交还即解除**（round-8 lint U1 裁决；交还本身是人在场的显式决定）：`human`、`app_quit`、`engine_crash`、`idle_without_submit`、`question_timeout`（问题条目仍在收件箱中打开）、`stop_condition`。**外部条件仍成立，交还时保留**：`budget_soft_cap`、`budget_hard_cap`、`provider_unavailable`、`external_change`、`satellite_missing`，以及含 run 类阻断命中（自 ADR-110 起只有 `input_mutated_after_gate`；`sandbox_violation` 为提示性）的 `sentinel_high`；`post_settle_activity` 自 ADR-107 起为提示性，交还即解除——交还后“仍暂停”并适用 ADR-104。完整分类以 `16` §16.1.1 为准。

## ADR-104 交还后仍暂停时，人的选择被持久化并在原因解除时执行 — Accepted（R8-D4-01；Amends ADR-099；Amended by ADR-108：唯一触发与 `decisionId`；本条中被取代的句子已就地标注）

- **决策**：`Goal.pendingHandBack?: {mode: "continue_agent" | "reverify", at}`〔字段已被 ADR-108 扩为 `{mode, at, decisionId}`，以 `02` 为准〕。交还时若因保留原因（如 `budget_hard_cap`）仍处于 `paused`，记录人的选择；该原因解除（如扩展预算）时，按 `pendingHandBack.mode` 执行（`reverify` → `verifying`；`continue_agent` → `running`），然后清除字段。~~此期间 `goal.resume` 按 `pendingHandBack` 而不是默认开 Run。~~〔已被 ADR-108 取代：只有唯一触发函数 `applyPendingHandBack` 执行 `pendingHandBack`，判定条件见下〕从 `accepted` 接管并交还后，Goal 离开 `accepted`（进入 `verifying`/`running`），**不**重新入合并队列，直到再次验收。

## ADR-105 第 8 轮的次要修正 — Accepted（R8 次要项；seal 说明 Amended by ADR-108（四段、`Tower-Not-Machine-Verified`）与 ADR-109（`Tower-Override`））

- **检验带回的崩溃恢复**：`inspect.bring_back` 复用 `humanCheckout.syncState` 机制（以检验检出为源、pin 树为基线），并在写回期间暂停该卫星的文件系统事件触发（写回完成后一次性重算指纹），避免与观察器竞争。
- **`runner_patched` 只看相对 base 的变化**：base 中已存在的别名/覆盖不再在每个 Goal 中报出；只在 Goal 引入或修改时报出。
- **seal 提交说明的结构**（第 9 轮定为四段，唯一定义在 `10` §10.6）：① Goal 标题与合同摘要（Tower 生成）；② “人的说明”（可选，交还对话框或其他显式人工决定中人写的说明，原样）；③ “Agent 提交记录”，逐条缩进引用 Agent 提交信息并去除其中任何 trailer 形态的行；④ Tower 的 trailer 块（`Tower-Goal`、`Tower-Contract`、`Tower-Verified-At` 或 `Tower-Not-Machine-Verified`（ADR-108）、`Tower-Human-Edit`（只对显式人工决定，ADR-114）、`Tower-Override`（`<detector> <路径>@<对象哈希>`，ADR-109/112）、`Co-authored-by`）。Agent 文本无法伪造 trailer。
- **垫片目录随 git 升级重建**：每次 Run 开始前比对真实 git 可执行文件与 `git --exec-path` 目录的指纹（路径 + 大小 + mtime），变化即重建垫片 exec-path。

---

## 第 9 轮对抗评审后的跨文档决策（ADR-106 – ADR-108）

以下决策回应 `reviews/round-9.md`。

## ADR-106 权威的嵌套仓库检查在物化的 pin 上、以 git 自身判定执行 — Accepted（R9-D11-01、R9-D13-01；Amends ADR-101、ADR-102；“物化 + 排除”部分 Superseded by ADR-109：改为基于 tree 的确定性检查、不排除只阻断）

- **原则**：真正需要防住的是“Agent 造出的仓库形态目录进入 pin/seal，进而落入用户仓库，被用户自己的 git（未注入 `safe.bareRepository`）发现”。因此权威检查只针对**将要进入 pin 的内容**，并且完全使用 git 自身的判定，而不是按名字推测。
- **权威检查**（决定性）：在验证槽位中物化 pin 之后（即用户最终会得到的内容、同一文件系统、同样的大小写语义），对**相对 base 新增或结构变化的每个目录**，在 ADR-071 的“只允许执行 git”沙箱中以 `safe.bareRepository=all`、`GIT_CEILING_DIRECTORIES=<该目录父目录>` 运行 `git -C <目录> rev-parse --absolute-git-dir`；成功即为仓库形态目录；**此外**，目录中出现 git 标记条目（不区分大小写的 `HEAD`、`commondir`、`gitdir`）也一律视为仓库形态——因为 `commondir`/`gitdir` 可能指向 pin 之外、在用户机器上真实存在的位置，此时 Tower 环境中 git 判为“不是仓库”而用户的 git 会识别。两者任一成立 → `sentinel{detector:"nested_repo"}`（severity 3，pin 推导，阻止 Verified，从 pin/seal 中排除并在评审中列出；合法使用这些文件名的罕见情况由人以 `override_sentinel` 处置）。该检查在 `13` 中属于“永不降级”项。执行时机：每次生成 pin（验证前）、验收时、seal 前——三处都在同一物化树上进行。
- **base 中已跟踪的夹具**（ADR-102 收紧）：只有当该目录在 base 中**已经**被 git 判定为仓库形态、且本 Goal 没有改变其中决定仓库形态的条目（`HEAD`、`commondir`、`gitdir`、`objects/`、`refs/` 的存在性）时，才视为普通夹具；把一个普通的已跟踪目录变成仓库形态属于“结构变化”，走权威检查。
- **逃出仓库的符号链接**：diff 中新增或改动的、目标在仓库之外（绝对路径或 `..` 越出根）的符号链接 → `sentinel{detector:"symlink_escape"}`（severity 2，pin 推导），评审中列出。
- **卫星侧扫描降级为早期预警**：ADR-101 的名字粗筛（大小写不敏感匹配 `head`/`.git`）+ git 确认，只用于（a）运行中尽早提示（每个有变更的回合在检查点时增量执行，S2 下以文件系统事件维护候选集），（b）决定人工编辑检出与检验检出中**不复制**哪些目录（这两个检出改为由影子树物化被跟踪与未忽略的内容，被忽略的依赖目录按需由安装器重建，不再整体 CoW 复制卫星）。Tower 自己的写回（交还、带回）完成后做一次全量扫描。预警结果不作为 Verified 依据。

## ADR-107 “由运行行为推导”的阻断类别收窄 — Accepted（R9-D7-01；Amends ADR-103；Amended by ADR-110：`sandbox_violation` 改为提示性）

- **决策**：由运行行为推导、且**阻止 Verified** 的只有安全相关的两项：`input_mutated_after_gate`、`sandbox_violation`。`post_settle_activity`、`policy_wall`、循环/停滞等运行期异常为**提示性**（不阻止 Verified，进入评审的“运行异常”区块）。对阻断类 run 推导命中，评审与暂停卡片只提供“覆盖（写明原因）”与“放弃”，**不提供“返工”**（返工无法消除它们）。`07` §7.10.1 与 `16` §16.1.6 以此为准。

## ADR-108 第 9 轮的次要修正 — Accepted（R9 次要项；唯一触发函数并入 ADR-134 的 `onAllReasonsCleared()`）

- **seal trailer 如实**：只有已验证（含有保留的已验证）的 Goal 写 `Tower-Verified-At`；未经机器验证的写 `Tower-Not-Machine-Verified: <原因>`（`human_only` / `ecosystem_unsupported` / `submodules_unsupported` / `s0_denied`）。
- **`pendingHandBack` 的唯一触发条件**〔第 12 轮重写〕：唯一触发函数 `applyPendingHandBack` 只有一个判定条件——“交还时保留的原因已全部解除”。它在两处被调用：原因自动解除时（如 `extend_budget`、provider 恢复）与人手动 `resume`（`resume` 先解除当前原因，再调用该函数；若仍有保留原因，函数不执行）。执行时按 `mode` 进入 `verifying` 或 `running`，然后清除字段（`03` §3.2.1 末段为准）。
- **削减顺序按约束线排序**：`14` 中削减顺序以“释放关键路径所在角色线”为准重新排列，并给出每项释放的人周。

---

## 第 10 轮对抗评审后的跨文档决策（ADR-109 – ADR-110）

以下决策回应 `reviews/round-10.md`。

## ADR-109 pin 安全检查改为基于 git tree 的确定性检查，不排除、只阻断 — Accepted（R10-D13-01 及 R10 次要项；Supersedes ADR-106 的“物化 + 排除”部分；Amended by ADR-111、ADR-112）

- **问题**：ADR-106 依赖物化目录（槽位生命周期不匹配）、与早期预警耦合、对命中只能“排除”从而需要重新生成 pin，且被 `verify()` 的若干提前返回路径绕过；标记规则未区分文件与目录，`HEAD` 只改内容也可绕过。
- **决策**：唯一的权威检查 `pinSafetyCheck(baseTree, pinTree)`：
  1. **输入只有两个 tree 哈希**，在影子中以 `git diff-tree -r --no-renames <baseTree> <pinTree>` 与 `git ls-tree` 读取（不物化、不依赖槽位、与执行时机无关；同一 pin 的结果永远相同）。
  2. **规则**（对新增或内容/模式改变的条目）：(a) **普通文件或符号链接**，且文件名（大小写不敏感）为 `HEAD`、`commondir`、`gitdir` → `sentinel{detector:"nested_repo"}`；目录名为 `head` 不触发（git 不会因此把父目录当仓库）；`HEAD` 只改内容同样触发（属于“内容改变”）；(b) 符号链接的目标为绝对路径，或规范化后越出仓库根 → `sentinel{detector:"symlink_escape"}`（含指向 Agent 临时目录的链接）。
  3. **处置：不排除，只阻断**。命中即 severity 3、pin 推导、阻止 Verified 与集成；不修改 pin，因此无需重新生成。人可以 `override_sentinel`（结构化原因），覆盖后 pin 原样进入 seal（显式的人的决定，记录在 seal trailer `Tower-Override: nested_repo`）；或返工让 Agent 删除这些条目——界面上的“删除这些条目”即 `goal.request_changes`，附一条预填的 `requiresChange` 评论（列出命中路径），无需新命令。
  4. **执行位置**：`verify()` 的**第一步**，在一切提前返回（缓存命中、仅 artifact、S0、子模块、生态不支持）之前；验收与 seal 时对同一 pin tree 再次执行（廉价、结果相同，作为防篡改复核）。属于“永不降级”。
  5. 卫星侧扫描（ADR-101/106 的早期预警）保留，仅用于运行中提示。两种检出由影子树物化（被跟踪与未忽略的内容；依赖目录 depcache 命中则 CoW，未命中由安装器重建），对 `pinSafetyCheck` 命中的路径不写出。**base 中未改动的仓库形态夹具照常写出**（取代第 9 轮“一律不复制”的规定）：它们本已存在于用户自己的主检出中，写出不增加用户 git 的暴露面；需要防住的只是 Agent 新造或改动的——经 ADR-111 扩展后，候选目录下的任何变化都是 `pinSafetyCheck` 的命中。
- **SP6b** 的 G34 改写为：对含上述各类条目（大小写变体、只改 `HEAD` 内容、目录名为 `head`、绝对与越界符号链接）的 tree 对，检查结果与预期表逐项一致。

## ADR-110 `sandbox_violation` 为提示性 — Accepted（R10-D7-01；Amends ADR-107；Amended by ADR-113）

- **理由**：一次沙箱拒绝说明边界**起了作用**，被拒绝的动作没有发生，也不进入 diff；按 `07` 的规则，不在 diff 中的问题不阻断。若把拒绝本身当作阻断，普通的遥测、全局缓存写入被拒也会让 Goal 卡住，且用户只能放弃。
- **决策**：`sandbox_violation` 为提示性 Fact（不阻止 Verified），计入评审的“运行异常”区块与 `policy_wall` 检测器（同类拒绝反复出现时提示 Agent 改用 `ask_user`）。阻止 Verified 的运行期哨兵只剩 `input_mutated_after_gate`（它意味着被批准执行的与实际执行的不一致），它是 sentinel，可被 `override_sentinel` 处置。度量：E7 记录 `sandbox_violation` 的频率与类别，用于调整沙箱规则与预设。

---

## 第 11 轮对抗评审后的跨文档决策（ADR-111 – ADR-113）

以下决策回应 `reviews/round-11.md`。

## ADR-111 pinSafetyCheck：仓库形态目录下的任何变化都阻断 — Accepted（R11-D11-01、R11 标记规则项；Amends ADR-109；Amended by ADR-116：根目录为候选、覆盖后写出 base 版 git 元数据、依赖目录名字扫描；ADR-120：名字比较 = 去除默认可忽略码位 → NFKC → 大小写折叠，唯一定义 `10` §10.1.2）

- **问题**：ADR-109 只检查标记文件本身；Agent 修改 base 中已有仓库形态夹具内的 `config`、`hooks/`、`objects/info/alternates`，或增删 `objects/`、`commondir` 等，都能在不触碰标记文件的情况下改变“是否为仓库”或其行为，而这些夹具会写入人工编辑检出与检验检出——正是用户自己的 git 运行的地方。另，标记名匹配只处理了 ASCII 大小写。
- **决策**（仍只基于 base 与 pin 两个 tree，确定、廉价）：
  1. **仓库形态候选目录**：在 base tree **或** pin tree 中，直接含有名字经 Unicode NFKC 规范化 + 大小写折叠后等于 `head`、`commondir` 或 `gitdir` 的条目（文件或符号链接）的目录。
  2. **规则**：对 base→pin 的每个增、删、改（含模式变化）条目，若其路径位于某个候选目录**之内或就是该目录**，记 `sentinel{detector:"nested_repo", dir}`。由此覆盖：标记文件的增删改、`config`/`hooks`/alternates 修改、`objects/` 或 `refs/` 的增删、`commondir` 删除等全部变体。
  3. **未改动的 base 夹具**（目录下无任何变化）不触发，照常写入两种检出（与用户主检出中已有的内容一致）；**被改动**的夹具目录在覆盖之前不写入两种检出。
  4. SP6b G34 增加：夹具内仅修改 `config`、仅增加 `objects/`、仅删除 `commondir`、Unicode 大小写变体（如带变音/全角形式经 NFKC 后为 `head`）。

## ADR-112 符号链接逃逸按 tree 内解析判定；覆盖绑定目录内容 — Accepted（R11 符号链接与覆盖项；Amends ADR-109；Amended by ADR-116：全部符号链接整链解析、缺失分量与 `.git` 分量视为逃逸）

- **符号链接**：对 pin 中新增或改变的每个符号链接，在 pin tree 内按 POSIX 语义解析整条链（链中的符号链接按其在 tree 中的目标继续解析，深度上限 40，环或超限即视为逃逸）；最终路径为绝对路径、或越出仓库根 → `symlink_escape`。仅凭字面判断不再使用。
- **覆盖的绑定**：`override_sentinel` 对 `nested_repo`/`symlink_escape` 的覆盖绑定 `(detector, 路径, 该路径在 pin 中的对象哈希——目录为 tree 哈希、链接为 blob 哈希)`；之后任一变化使覆盖失效并重新阻断，seal trailer `Tower-Override` 记录被覆盖的路径与哈希。

## ADR-113 针对受保护目标的沙箱拒绝提升为 severity 2 — Accepted（R11 sandbox_violation 信号项；Amends ADR-110；Amended by ADR-117：Needs-You 出口、去重键、良性清单与降级规则）

- **决策**：`sandbox_violation` 仍不阻止 Verified；但若被拒绝的目标属于受保护集合（用户主检出、`commonDir`、Tower 数据目录与镜像、`~/.ssh`、钥匙串、云凭据文件、其他 Goal 的卫星），提升为 severity 2 并生成 Needs-You（`kind:"sentinel"`，L2，`costOfDelay:"none"`），在评审“运行异常”区块置顶；同一 Goal 内同类目标去重。其余拒绝保持 severity 1 的提示。E7 分别统计两类频率。

---

## 第 12 轮对抗评审后的跨文档决策（ADR-114 – ADR-120）

以下决策回应 `reviews/round-12.md`。

## ADR-114 外部写入的唯一处置规则 — Accepted（R12-D4-02、R12-D7-01；“评审阶段 hunk 标 external、adopt/revert_external”与“交还第 6 步一并处置”两部分 Superseded by ADR-122）

- **“撤销外部改动”的目标只在 `10` §10.3.1 定义一次**：检测到该外部改动之前、最近的任意检查点（含 `agent_bg_done`、`human_edit` 等非回合检查点）；`03`、`06` 只引用。
- **接管期间的外部写入**：`humanCheckout` 存在时检测到的外部写入，由交还第 6 步的选择（以你的版本覆盖 / 放弃你的改动 / 保留两者）一并处置，记入同一个 `HumanDecision{hand_back}`（附 `externalResolution`），`external_change` 随之解除。
- **评审阶段（`in_review`/`accepted`）的外部写入**：照常按 I2 回到 `verifying`，但对应 hunk 在评审单元中标为 `author:"external"`；验收面板要求对这些 hunk 作出“采纳为我的改动”（→ 以 `author:"human"` 记检查点）或“撤销到 pin”之一，未处置不能验收。
- **`Tower-Human-Edit` 只对显式的人工决定写入**（交还、就地编辑、`keep_external_change`、评审中的“采纳”）；来源不明且未经处置的内容不会以人的名义进入 seal。
- 检查点 landmark 联合类型增加 `external_change_kept`。

## ADR-115 settle 时终止后台进程的顺序与身份确认 — Accepted（R12-D6-01；Amended by ADR-120：`bg_process_survived` 的类别、严重度与出口；ADR-121：顺序改为宽限确认在终止之前、身份键加 `bootSession`；进程识别部分 Superseded by ADR-142；Amended by ADR-138）

- **顺序**：`agent_settled` → 终止本 Run 追踪的**全部**进程（Linux：cgroup 整体终止；macOS：追踪集合含经 `setsid` 脱离的后代）→ **等待进程树清空**（SIGTERM 后最多 10 s，随后 SIGKILL；仍有存活者记 `anomaly{detector:"bg_process_survived"}`，其后的写入按外部写入处理）→ 补做 `agent_bg_done` 检查点 → 2 s 宽限确认（ADR-025）→ `claimed` → 生成 pin。I4 的有效提交以此后的指纹为准。
- **身份确认**：发信号前以 `(pid, 进程启动时间)` 确认身份（macOS `proc_pidinfo`、Linux `/proc/<pid>/stat`），不匹配即不发信号（防 PID 复用）。
- **持久化与崩溃恢复**：追踪集合 `(pid, startTime, runId)` 写入事件日志；Supervisor 或 Host 崩溃后重启时据此确认并终止残留进程；无法确认身份的只生成提示、不发信号。SP6 增加“SIGTERM 时刷写输出”“Supervisor 崩溃后重启”用例。

## ADR-116 符号链接、根目录、覆盖写出与依赖目录 — Accepted（R12-D11-01、R12-D11-02、R12-D13-01；Amends ADR-111、ADR-112；Amended by ADR-124：符号链接 base 豁免、覆盖后写出改为白名单）

- **整链解析的范围**：pin 中**全部**符号链接都做整链解析（基于 tree，代价低），不只新增或改变的；解析经过 tree 中不存在的路径分量（如被忽略的依赖目录、`.git`）时**视为逃逸**（保守）；经过名字等价于 `.git` 的分量一律视为逃逸。
- **根目录是候选目录**：根目录直接含 `HEAD` 类条目时同样适用 ADR-111（伪代码显式处理根）。
- **覆盖之后的写出**：对 `nested_repo` 覆盖后，pin/seal 中保留 Agent 的版本（人的显式决定），但两种检出中该目录内的 git 元数据文件（`config`、`hooks/**`、`info/**`、`objects/info/**`、`commondir`、`gitdir`、`HEAD`）一律写出 **base 版本**（base 中不存在则不写出）；覆盖对话框以 Fact 形式列出被改动的 git 元数据文件，并标出其中可执行或重定向的配置键（`core.fsmonitor`、`core.hooksPath`、`filter.*`、`include*`、`alternates` 等）。
- **依赖目录**：两种检出物化依赖后，对依赖目录做同样的名字扫描，命中的仓库形态目录不写出并在信任提示中列出（采用 `07` 的方案；`10`、`11` T31 同步）。

## ADR-117 受保护目标沙箱拒绝的 Needs-You 出口 — Accepted（R12-D8-01；Amends ADR-113；Amended by ADR-125：`(category, op, target)` 粒度、去重键、凭据读取不入良性清单、规则 F）

- **出口动作与标注**：“知悉”→ `outcomeClass:"informative"`；“这是良性的”→ `false_positive`，并可一键把该目标加入**项目良性清单**（之后同一目标的拒绝为 severity 1）；“收紧策略”→ 打开自主度矩阵；“放弃 Goal”。
- **去重键**：`sv:{goalId}:{category}:{targetRoot}`（`08` §8.4 为准）。
- **措辞**：这类拒绝“可能表明提示注入或越权意图”，不是“直接证据”（常见良性来源：`~/.ssh/known_hosts` 写入、云 SDK 读取凭据配置）。
- **降级规则**：E7 中某类目标在 2 周内 `false_positive` 比例 > 30% → 该类目标默认降为 severity 1（通知用户，可撤销）。G32b 增加良性的 `known_hosts` 用例。

## ADR-118 交还时处置 pin 命中项；非回合检查点 — Accepted（R12-D8-02、R12-D13-01；Amended by ADR-127：回退语义（M2）与去重例外）

- **`goal.hand_back` 增加参数** `resolvePinHits?: {path, action: "delete" | "restore_base"}[]`：交还第 7 步按此删除新增条目或还原为 base 版本，记 `author:"human"`；交还对话框增加对应勾选项。
- **非回合检查点**：`10` §10.7.1 增加“非回合触发”入口（无 `piEntryId`、不写入 Pi 会话、必带 landmark）；landmark 联合类型增加 `agent_bg_done`、`external_change_kept`；回退界面在相邻回合之间显示这类检查点，可被选中回退。

## ADR-119 M1 顺延至 33 周，不执行削减 ③–⑤ — Accepted（R12-D14-01；Amends ADR-038；Amended by ADR-133）

- **背景**：第 12 轮的新增工作（ADR-114–118：外部写入处置、settle 终止顺序与崩溃恢复、交还时处置 pin 命中、全链解析、覆盖写出、非回合检查点、受保护目标信号出口）共 +1.6 人周，而系统、桌面、Agent、安全四条线余量均只有 0.12 周。重算表明 ADR-038 预先声明的“成组执行 ③+④”并不释放桌面线（④ 释放桌面线 1.0，而它要接手 1.1——`14` §14.3.4 为准；本句第 13 轮更正）。
- **备选**：方案 B——成组执行 ③ + ④′（只保留分支、不改派）+ ⑤，并把系统线 0.3 人周改派桌面线，可保持 32 周；代价是检验检出不启动服务、M1 不能推送开 PR、机会式验证推迟，设计线余量只剩 0.01 周。
- **决策**：采用方案 A——**不削减范围，M1 顺延 1 周至 33 个日历周（2026-11-09 → 2027-06-25）**。理由：③–⑤ 都直接影响本产品的核心论点（检验检出是人工验收的主要工具；机会式验证是“监督而不陪跑”的前提），用一周换取闭环完整；方案 B 留下的 0.01 周余量没有意义。
- **后果**：`14` §14.3.4 为日期与各线余量的唯一来源；削减顺序 ③–⑤ 保留为下一次增量的预案；下一次增量仍须在“执行 ③ + ④′ + ⑤（修订 ADR-059）”与“再顺延”之间显式选择，并记 ADR。

## ADR-120 第 12 轮 lint 遗留的三项裁决 — Accepted（round-12-lint U1–U3；U2 中“此后该进程的写入按外部写入处理”Amended by ADR-122：记 `author:"agent"`，按 `agent_bg` 重新验证）

- **U1 名字比较规则（唯一定义在 `10` §10.1.2）**：`HEAD`/`commondir`/`gitdir`/`.git` 的等价比较 = **去除 Unicode 默认可忽略码位（Default_Ignorable_Code_Point，HFS+ 忽略的码位是其子集）→ NFKC → 大小写折叠**。理由：比只做 NFKC + 折叠更保守，代价可忽略（逐名字处理），并覆盖 HFS+ 的忽略规则；因此 HFS+ 不再是已知限制。`07` 伪代码、`05`、`06`、`11`、`16` 只引用 `10`。
- **U2 `bg_process_survived`**：属于 anomaly（Tower 状态），不阻断；生成 severity 2 Needs-You（“后台进程在终止后仍存活：<命令>”，选项 再次终止 / 知悉）；此后该进程的写入按外部写入处理（ADR-114）。登记于 `07` §7.10.1 与 `16`。
- **U3 `decisions.kind`**：与其他枚举列一致，在 `06` DDL 中加 CHECK 约束，取值与 `02` `HumanDecision.kind`、`16` 完全一致（lint (s) 覆盖）。


---

## 第 13 轮对抗评审后的跨文档决策（ADR-121 – ADR-127）

以下决策回应 `reviews/round-13.md`。

## ADR-121 I4 以工具事件判定；settle 顺序调整 — Accepted（R13-D4-01、R13-D6-01；Amends ADR-025、ADR-115；Amended by “提醒回合”Superseded by ADR-129；“变更类工具调用”的定义见 ADR-130；进程识别与写放大部分 Superseded by ADR-142）

- **I4 改写为两部分**：(a) **有效提交** = 最后一次 `submit` 之后，本 Run 没有**变更类工具调用**（`edit`/`write`，以及按 `11` 动作分类不属于只读的 `bash`）——只以工具事件判定，不比较指纹；(b) **pin 的树** = settle 之后、`agent_bg_done` 检查点的树。`submit` 之后**仅由后台进程**产生的变化不使提交作废：它们进入 `agent_bg_done` 检查点（`author:"agent"`，landmark `agent_bg_done`），随 pin 一起被验证与评审。Watcher 在 Run 中持续写入因此不会触发 nudge。
- **settle 之后才发现提交无效**（例如宽限确认窗口内出现变更类工具调用）：nudge 配额未用完 → Tower 以 `prompt` 开一个提醒回合（计入 nudge 次数）；已用完 → `paused(idle_without_submit)`。`05` §5.5 的 settle 判定表补上这一行。
- **新顺序**：`agent_settled` → **2 s 宽限确认**（ADR-025）→ 终止追踪进程并等待清空（ADR-115）→ `agent_bg_done` 检查点 → `claimed` → pin。宽限确认失败时进程尚未被终止。
- **撤回与恢复时告知 Agent**：`claimed`/`verifying` 中撤回到 `running`，或 `app_quit`/`engine_crash` 后自动恢复时，若有进程曾被 Tower 终止，恢复的第一条消息以 `tower.processes_terminated` 注入列出被终止的命令与原因。
- **身份键**：`(bootSession, pid, startTime)`；`bootSession` 在 Linux 为 `/proc/sys/kernel/random/boot_id`，macOS 为 `kern.bootsessionuuid`。开机会话变化时，全部 `tracked` 行直接记为 `gone{how:"reboot"}`，不发信号。
- **写放大**：只持久化存活 ≥ 5 s 的进程（短命进程只在内存中追踪，settle 时一并终止）；`gone` 行在 Run 结束时回收；`13` 给出每个运行中 Goal ≤ 30 事件/分钟的上限，在 W18 夹具中测量。

## ADR-122 外部写入在任何非 running 状态都先暂停、待人决定 — Accepted（R13-D4-02、R13-D4-03、R13-D7-01、R13-D6-01；Supersedes ADR-114 中“评审阶段 hunk 标 external”的部分；Amended by “记 `resumeTo`”改为 `externalChange.detectedIn`，出口接线与 I2 分界见 ADR-128）

- **统一规则**：来源不明的写入（`10` §10.3.1 的检测器给出路径集合 E）在 `running` 之外的任何状态（`claimed`、`verifying`、`in_review`、`accepted`、`paused(*)`）被检测到时，Goal 进入 `paused(external_change)`（已暂停则记入 `alsoApplies`），并记录 `resumeTo` = 检测时的状态。**来源不明的内容不会先被验证或评审，再等人决定。**
  - `goal.external_change.keep` → 以 `author:"human"`、landmark `external_change_kept` 记检查点 → 按 I2 进入 `verifying`（`verifyOrigin:"human_change"`，因为人已显式采纳）；
  - `goal.external_change.revert` → 恢复 E 中各路径到**归因基线**（唯一定义在 `10` §10.3.1：检测前最近的检查点；在 `claimed` 之后即当前 pin 的检查点）→ 树等于基线的树时回到 `resumeTo`，不触发 I2；
  - `verifying` 中检测到：取消当前验证（它验证的 pin 不受影响，但人必须先决定），回到 `resumeTo` 时以同一 pin 重新验证。
- **删除** ADR-114 引入的 `goal.review.adopt_external` / `revert_external` 命令、`adopt_external_hunks` / `revert_external_hunks` 决定种类与评审单元中待处置的 `author:"external"` 状态（登记于 `16` §16.1.13 废弃表）。评审中的就地编辑因此需要一次“采纳为我的改动”确认。由此，外部写入引起的验证失败分支不复存在（R13-D4-03 第 1 项）。
- **按路径恢复**：`10` §10.8.1 增加 `restorePaths(cp, paths)`，对每个路径写出 `cp` 中的版本，`cp` 中不存在则删除，其他路径不动，之后做 `safety` 检查点〔ADR-176 改为恢复之前先做〕。
- **`running` 中的归因隔离**：检测时立即把 E 登记为外部路径集合；drain 期间的回合检查点对 E 中的路径记 `author:"external"`（逐路径归因），不记为 Agent。`keep` 时这些路径改记为 `human`。
- **交还第 6 步（接管期间的外部写入）的树级语义**：
  - `take_human`“以你的版本为准”：先 `safety` 检查点，卫星整体置为 T1（人检出的树），外部写入被丢弃；归因：T0→T1 为 `human`。
  - `take_external`“放弃你的改动”：H 被丢弃，卫星保持现状；外部写入仍然来源不明 → 保留 `external_change`，人必须再 `keep`/`revert`。
  - `keep_both`“合并两者”：只在 E 与人改动的路径不相交时提供；按 T0→T1 写回人的改动，外部写入保留 `external_change`，等待 `keep`/`revert`。
  - 任何选项都**不会**把外部写入记为人的改动；只有 `keep_external_change` 能做到。`02` 中 `ReviewUnit.author` 的注释据此修改。
- **存活进程（`bg_process_survived` 未解决期间）**：该 Goal 中未归因的写入记为 `author:"agent"` 并附 `bg_process_survived` 注记，不走 `external_change`，也不可能被采纳为人的改动；在 `claimed`/`verifying`/`in_review` 中，这些写入使卫星树 ≠ pin → 按 I2 重新生成 pin 并验证（`verifyOrigin:"agent_bg"`）。

## ADR-123 S2 的 `.git` 禁令按等价规则生效；影子上下文启用 git 自带的路径保护 — Accepted（R13-D11-01；Amended by 运行中命中与 git 拒绝收录、平台差异见 ADR-131）

- **S2 规则**：任意深度禁止创建名字在 ASCII 大小写折叠下等于 `.git` 的条目（Seatbelt 正则写为逐字符的大小写类；Linux Landlock 不支持按名字拒绝，由下一条兜底）。
- **其余等价变体**（可忽略码位、NFKC 等价，`10` §10.1.2）由沙箱外的卫星 watcher 兜底：新名字按 ADR-120 规则比较，命中即立即暂停 Run（`sentinel_high`，`nested_repo`，severity 3），条目不被 Tower 修改；登记为 `11` T29 的残余（发现窗口 = watcher 延迟，≤ 2 s；期间沙箱外进程仍有 `GIT_CEILING_DIRECTORIES` 与 `safe.bareRepository=explicit`）。
- **影子上下文**：所有影子与 GitRunner 调用注入 `core.protectHFS=true`、`core.protectNTFS=true`。git 会拒绝把 `.git` 的等价变体加入索引；Tower 把这类拒绝转为 `nested_repo` 命中，而不是失败。
- **用例**：G26 增加大小写变体、可忽略码位变体与 NFKC 变体三例。

## ADR-124 符号链接规则的 base 豁免；覆盖后写出改为白名单 — Accepted（R13-D11-02、R13-D11-04；Amends ADR-116）

- **命中条件**：一个链接在 pin 中解析不安全（越出仓库、经过 tree 中不存在的分量或 `.git` 分量、成环或超深），**并且**满足以下任一条件：它是新增或改变的链接；它在 base 中解析安全；它在 base 中的解析结果与 pin 中不同。base 中原本就不安全、解析结果也没变的链接不命中，只在信任提示中列出，并照常写出到两种检出（ADR-109 第 5 点：它本来就在用户的主检出中）。
- **覆盖后的写出改为白名单**：被覆盖的仓库形态目录中，只有纯数据条目——`objects/**`（不含 `objects/info/**`）、`refs/**`、`packed-refs`——写出 pin 版本；其余一律写出 base 版本，base 中没有则不写出。
- **配置键清单**：唯一定义在 `16`（“值会被 git 当作命令执行、或使 git 读取其他路径的键”，附示例清单，含 `core.fsmonitor`、`core.hooksPath`、`core.pager`、`core.editor`、`core.sshCommand`、`core.askPass`、`core.worktree`、`sequence.editor`、`diff.external`、`diff.*.textconv`、`merge.*.driver`、`filter.*`、`credential.helper`、`alias.*`、`gpg.program`、`include.path`、`includeIf.*.path`、`url.*.insteadOf`、`extensions.worktreeConfig`、`uploadpack.packObjectsHook`）。覆盖对话框列出**全部**被改动的配置键，命中清单的高亮显示——清单不全只影响高亮，不影响写出（写出已是白名单）。
- **用例**：G29 统计符号链接规则在样本仓库上的误报；G34c 增加“base 中已有悬空或越界链接、Goal 不触碰”的对照组；G27e 增加 `config.worktree`。

## ADR-125 沙箱拒绝信号的粒度与远程边界 — Accepted（R13-D11-03；Amends ADR-117；Amended by ADR-131、ADR-136、ADR-201、ADR-221）

- **字段定义**（唯一定义在 `16`）：`category ∈ {credential, tower_data, user_checkout, other_satellite, user_config, system}`；`op ∈ {read, write, exec, net}`；`target` = 精确到文件的规范化路径（主目录下以 `~/` 表示），或网络主机。
- **去重键**：`sv:{goalId}:{category}:{op}:{target}`。**良性清单与降级单位**：`(category, op, target)`。
- **凭据读取**（`category:"credential"`、`op:"read"`）不能加入良性清单，也永不因 `false_positive` 比例被降级。
- **规则 F**（降级）：n ≥ 20 且从 M2 起生效，各处一致。
- **默认良性清单**：保留 `~/.ssh/known_hosts` 写；G32b 的良性对照与 `04` 线框改用一个不在默认清单中的目标（`~/.gitconfig` 写，`user_config`）。
- **远程矩阵**：`signal.mark_benign` 仅本机；`goal.external_change.keep` 手机端禁止（采纳需要有效评审）；`goal.external_change.revert`、`signal.acknowledge`、`process.terminate_again` 允许远程。

## ADR-126 `bg_process_survived` 的注意力闭环；settle 等待期的显示 — Accepted（R13-D8-01、R13-D9-01）

- `bg_process_survived` 的 Needs-You：kind 用已有的 anomaly 类 kind（`16` §16.1.7；没有则新增 `anomaly`），去重键 `an:{goalId}:bg_process_survived`，标注：“再次终止”成功 → `actionable`，“知悉” → `informative`；`04` 增加卡片。
- 删除 `10` 中“停止 Agent 的后台进程后继续”这一无法实现的动作。
- **settle 等待期**：仍是 Mode `settled`，实况行 `已停 · 收尾 · 等待后台进程 <剩余>/<总数>`，唯一定义在 `12` §12.6.4；`05`、`13` 引用。

## ADR-127 非回合检查点的回退语义与去重例外 — Accepted（R13-D13-01；Amends ADR-118；Amended by ADR-211）

- **回退到非回合检查点**：对话侧回到它之前最近的回合 entry（`navigateTree`），代码恢复为该非回合检查点的树，并附一条 steer 说明“代码已回到 <landmark> 时的状态”。M1 在时间线上显示非回合检查点；**选中并回退到它属于 M2**（各文档统一）。
- **去重例外**：§10.7.1 第 2 步不适用于必带 landmark 的人工决定类入口（`external_change_kept`、`human_edit`）：树不变时也记一个只带 landmark 的检查点，引用同一棵树，作者属性按决定记录。

- **第 13 轮补记（ADR-119）**：ADR-121–127 新增 +1.7 人周（WBS 102.6）。以系统线 0.35 人周改派桌面线、安全线 0.3 人周的用例补跑改派设计线吸收，M1 **维持 33 周**；之后安全线余量 0.02、系统线 0.07 工作周。下一次落在这两条线上的增量须在“执行 ③ + ④′ + ⑤（修订 ADR-059）”与“再顺延”之间显式选择并记 ADR（`14` §14.3.4 为准）。

- **第 13 轮 lint 补记（ADR-125）**：severity 2 的受保护目标类别 = `credential`（读/写）、`tower_data`、`user_checkout`、`other_satellite`、`user_config`（**写**）。理由：写用户级配置（如 `~/.gitconfig`）可以改变用户在 Tower 之外所有仓库中的 git 行为，属于持久化的越界写入。G32b 的良性对照因此为：`~/.gitconfig` 写 → severity 2 → `mark_benign` → 之后同一 `(user_config, write, ~/.gitconfig)` 为 severity 1。`16` §16.5 的通则 4（未列出的命令按 `06` 的作用域、web 与手机端相同）予以确认。

---

## 第 14 轮对抗评审后的跨文档决策（ADR-128 – ADR-132）

以下决策回应 `reviews/round-14.md`。

## ADR-128 `external_change` 的持久状态、出口接线与 I2 的分界 — Accepted（R14-D4-01、R14-D4-02、R14-D7-01、R14-D8-01、R14-D13-01、R14-D6-01；Amends ADR-122；“按 `detectedIn` 继续”与 `pendingVerify` 规则 Superseded by ADR-134；部分 Superseded by ADR-142；Amended by ADR-135）

- **独立的持久状态**：`Goal.externalChange?: {paths, mixedPaths, baselineCps, detectedIn: {state, pauseReason?, phase?}, detections: {at, paths}[]}`（`02` 定义，`06` 以 JSON 列 `external_change` 持久化，由事件 `goal.external_change.detected` / `.resolved` 投影）。重复检测时路径并入 `paths`，基线保持首次检测时的值。`resumeTo` 恢复为**只**服务 `satellite_missing`（`16` 原口径不变）；ADR-122 中“记 `resumeTo`”一律改为记 `externalChange.detectedIn`。
- **出口接线**：`keep`/`revert` 都先“解除 `external_change`”，再执行通用的原因解除规则——
  - `external_change` 是当前 `pauseReason` 且 `alsoApplies` 为空：按 `detectedIn` 继续（`running` → 按 `goal.resume` 规则；settle 序列中 → 回到 settle 序列，ADR-129；`verifying` → 以同一 pin 重新验证（revert）或生成新 pin 验证（keep，`verifyOrigin:"human_change"`）；`in_review`/`accepted` → keep 进入 `verifying`，revert 回到 `detectedIn.state`）；
  - 否则：剩余最高原因成为 `pauseReason`；全部保留原因解除时调用 `applyPendingHandBack`（ADR-108）。若 Goal 已有 pin 且 `keep` 使树 ≠ pin，记 `pendingVerify{trigger:"human_change"}`，在离开 `paused` 时执行。`pendingVerify` 的跨越范围加入 `external_change`。
- **`revert` 之后树 ≠ 基线**：剩余差异按归因表分类——存活进程的写入 → `agent_bg`（I2）；其余视为一次新的检测。
- **接管**：`external_change` 未解除时 `goal.take_over` 返回 `E_STATE`（先 `keep`/`revert`）。交还第 6 步只对归因表中“来源不明”的写入要求 `externalResolution`；存活进程的写入按 `agent_bg` 处理。
- **`take_external` 的完整语义**：等于“放弃改动 + 保留 `external_change`”——不记 `human_edit` 检查点，不注入 `tower.handback`，`HumanDecision.targetTree` 记 T0。`keep_both` 的第 8 步检查点对 E 记 `externalPaths`。
- **“放弃改动”中树已改变的分支**：`discard_human_edits` 时若卫星树 ≠ pin 的树，差异按归因表分类：存活进程的写入 → `agent_bg`（I2）；其余 → `paused(external_change)`（E = 差异路径，基线 = pin 的检查点，`detectedIn = takeoverFrom`），**不验证**。
- **I2 改写**：`in_review`/`accepted` 中指纹变化时，若变化来自 Tower 自己的工作（rebase、合并队列）、人的显式采纳（`keep`、交还、`bring_back`）或存活进程（`agent_bg`）→ `verifying`；来源不明 → `paused(external_change)`。§3.1 的图、`06` §6.2.3 与 Projector 断言同步。
- **drain 期间同一路径**：同一路径上既有 Agent 工具写入又有外部写入时记为 `mixed`（`externalChange.mixedPaths`）；卡片注明“撤销会一并撤销 Agent 在这些文件上的编辑”；`keep` 后这些路径记 `mixed`，不记为纯 `human`。
- **注意力登记**：Needs-You kind 新增 `external_change`，severity 2；`costOfDelay` 在 `detectedIn.state = running` 时为 `agent_blocked`，否则 `none`；去重键 `ec:{goalId}`（重复检测时并入路径）；标注 `keep` → `actionable`、`revert` → `false_positive`（检测器精度信号）。`external_change` 只在 `alsoApplies` 中时卡片照常出现，并标“当前暂停原因：…”。`post_settle_activity` 的 Needs-You 归入 kind `anomaly`，去重键 `an:{goalId}:post_settle_activity`。
- **卡片措辞**：“检测到 N 个文件在没有 Agent 工具调用、也没有被追踪的 Agent 进程时被写入——可能来自你的编辑器、其他程序，或未被追踪的 Agent 后台进程”。
- **存活进程期间的误归因**登记为已知误判 (c)：`bg_process_survived` 未解决期间，人在外部编辑器中的保存也会被记为 `author:"agent"`；`paused(*)` 中同样适用，已有 pin 时记 `pendingVerify{trigger:"agent_bg"}`。
- **非终态观测到 PR 合并**：已推送的 seal 在远端被合并时，无论 Goal 处于何种非终态（`paused(*)`、`verifying`），记 Fact `remote_merged` 并进入 `integrated`——被合并的是人已验收的 seal；未解除的 `external_change` 以 `obsolete` 关闭，卫星内容先做 `safety` 检查点，并在集成摘要中列出。
- **macOS 孤儿进程窗口**：每个 Run 启动时持久化其进程组 id（每 Run 一行），重启时确认组长身份后按组终止；`setsid` 脱组且存活 < 5 s 的进程登记为已知窗口，G35c 增加“崩溃前 3 s 启动的后台进程”一例。

## ADR-129 宽限失败只有一个去向；删除 Supervisor 侧的提醒回合 — Accepted（R14-D4-03、R14-D5-01；Amends ADR-121；Amended by ADR-135、ADR-138）

- **宽限失败**（唯一定义在 `05` §5.5）：settle 后 2 s 内出现 `agent_start`/`isStreaming`/`isCompacting` → 不记异常，回到等待下一次 `agent_settled`；有效性在下一次 settle 时按 I4(a) 重新判定。`post_settle_activity` 只用于进入 `claimed` **之后**的活动。`03` 中 `claimed` 的出口删去“宽限确认失败”。
- **删除提醒回合**：任何新的工具调用都意味着一次新的 run，它在 settle 前必然经过 `agent_before_settle`，由 tower-goal 按常规 nudge（守卫与计数不变）。因此不存在“只能在 settle 之后才发现提交无效”的情形；ADR-121 中以 `prompt` 开提醒回合的规则作废，Tower 不以 user 角色注入任何消息。
- **`tower.processes_terminated` 的投递**：run 已在进行时，以 `sendCustomMessage(…, {triggerTurn:false})` 投递（RPC 下由 tower-goal 执行 `pi.sendMessage`）；恢复时作为第一条消息。契约测试 C32 覆盖。
- **settle 序列中检测到外部写入**：有效提交保留；Goal 进入 `paused(external_change)`，`detectedIn = {state:"running", phase:"settling"}`；`keep`/`revert` 之后回到 settle 序列，不开新 Run。

## ADR-130 “变更类工具调用”的唯一定义 — Accepted（R14-D5-02）

- 唯一定义在 `16`：**只读白名单之外的任何工具调用**，包括嵌套调用（带 `parentToolCallId`）、MCP 工具、扩展或自定义工具。声明 `readOnlyHint:true` 且通过 `11` 路径检查的工具可以进入白名单；`bash`/`powershell` 按 `11` 的动作分类判定，“不确定”算变更。
- I4(a)、tower-goal 的 `turnMaybeMutated`、§10.7.1 第 0 步与 `07` 的相关句子只引用它。契约测试覆盖 `submit` 之后的嵌套 `edit` 与 MCP 写工具。

## ADR-131 运行中发现 `.git` 等价条目；git 拒绝收录；平台差异；`user_config` 的判定规则 — Accepted（R14-D4-04、R14-D11-01；Amends ADR-123、ADR-125；Amended by ADR-136、ADR-215）

- **watcher 在 `running` 中命中**：以 abort 方式 drain，进入 `paused(sentinel_high)`，detector `nested_repo_live`（run 类，交还时保留，不可覆盖——没有 pin 可绑定）。出口：`goal.resume` 附必填转向（要求 Agent 删除该条目）；`take_over`（人删除）；`abandon`。条目从卫星中消失时该命中解除。`03` §3.2/§3.2.1 增加这条边。
- **git 拒绝收录**：影子 `add` 因 `protectHFS/NTFS` 失败时，以 `:(exclude)` 排除被拒绝的路径后重试；被排除的路径记入检查点的 `excludedPaths`；只要任一被排除的路径仍存在，就以 `nested_repo`（按“路径 + 名字”绑定）阻断 Verified，不可覆盖，唯一出口是删除。
- **平台差异**：macOS S2 以 Seatbelt 按名字拒绝字面 `.git` 的大小写变体，残余为“非 ASCII 等价变体的 watcher 窗口”。Linux S2（M2）没有按名字拒绝的手段，残余为“全部 `.git` 名字的 watcher 窗口”；watcher 对新建目录先加监视、再扫描其内容，以关闭创建竞态。Linux 上的强制手段（例如 fanotify 预检或挂载命名空间约束）列为 M2 决定点。T29、G26 按平台分列。
- **`user_config` 的判定规则**（唯一定义在 `16`）：主目录下名字以 `.` 开头的顶层文件与目录、`~/.config/**`、macOS 的 `~/Library/LaunchAgents/**` 与 `~/Library/Preferences/**`、Linux 的 `~/.config/autostart/**` 与 `~/.config/systemd/user/**`；减去 `credential` 与 `tower_data`。shell 启动文件因此属于 `user_config`。E7 统计其误报。

## ADR-132 第 14 轮的排期规则 — Accepted（R14-D14-01；Amended by ADR-133）

- G26b、G29 移到 B3（在其依赖的实现之后）；SP6b 补跑工时的归属在 W7 行写出现值。
- 本轮新增工作若超出系统或安全线余量，**先执行削减 ④′**（M1 只保留分支，不推送、不开 PR；修订 ADR-059）：它同时缩小 ADR-128 中“远端合并观测”的范围（M1 只观测本地 base），是对核心论点影响最小的一项；仍不足时再顺延，并记 ADR。

## ADR-133 第 14 轮：执行削减 ④′ 并顺延 1 周至 34 周 — Accepted（R14-D14-01；Amends ADR-038、ADR-059、ADR-119、ADR-132；Amended by ADR-136）

- **工作量**：ADR-128–131 按 WBS 行去重后（同一实现在多份文档中只计一次，取较大估计）净增 +5.85 人周（WBS 107.45），集中在系统线。
- **按 ADR-132 执行削减 ④′**：M1 的集成去向只有“仅保留分支”——Tower 不推送、不开 PR，不轮询远端，`integrated` 只按本地 base 观测；推送、开 PR、远端轮询与远端合并观测移到 M2（与合并队列一起）。ADR-128 的“非终态观测到合并 → `integrated`”在 M1 只针对本地 base。理由：用户自己推送分支的成本很低，而这一项牵涉单向门（推送）、远端凭据与远端状态机，是 M1 中与核心论点距离最远的部分。
- **仍不足**：④′ 之后（即便再加 ③、⑤，最多释放约 3.8 人周）仍无法在 33 周内吸收，**M1 顺延 1 周至 34 个日历周（2026-11-09 → 2027-07-02）**；第 30 周末功能冻结；各线缓冲外余量：系统 0.08、Agent 0.08、设计 0.14、桌面 0.25、安全 0.25 工作周；M2 至 2027-10-08；增 1 人方案 30 周。③、⑤ 不执行（检验检出的服务与机会式验证直接支撑“监督而不陪跑”）。
- **后果**：`14` §14.3.4 为日期与余量的唯一来源；`00` §0.6、`04` 的去向选项、`03` §3.4 的合并方式按 M1“仅保留分支”同步；下一次增量仍须显式在 ③ + ⑤ 与再顺延之间选择并记 ADR。
- **`pendingVerify` 与 `pendingHandBack`**：`continue_agent` 丢弃 `pendingVerify`；`reverify` 以当前树生成新 pin（`03` §3.2.1）。`nested_repo_live` 的交还出口为对话框中的“删除这些条目”（`10` §10.8.4）。

- **第 14 轮 lint 补记（ADR-133 附）**：`paused(stop_condition)` 生成 Needs-You kind **`stop_condition`**（新增，severity 2，`costOfDelay:"agent_blocked"`），去重键 `stc:{goalId}:{conditionId}`；标注：“继续”或“修订合同后继续” → `actionable`，“这里不该停” → `false_positive`（停止条件写得过宽的信号，供 `09` 合同学习使用）。不复用 `stalled`：停止条件是合同中人预先要求的决定点，不是故障。

- **第 15 轮补记（ADR-133 附，按 ADR-136 的排期规则）**：ADR-134–136 与 R15 各项按 WBS 行去重后（同一条目取较大估计，不相加；07/08/09 的 W3 与 05/06 的 W3 是同一项“继续目标与唯一转移函数”，取 0.8）净增 **+3.7 人周**（WBS 111.15）：W3 +0.8、W4 +0.1、W6 +0.6、W7 +0.6、W9 +0.2、W10 +0.05、W12 +0.5、W13 +0.7、W15 +0.15；分配为系统 +0.8、Agent +0.8、桌面 +0.95、设计 +0.85、安全 +0.3。第 14 轮之后的余量合计约 0.61 人周，按 ADR-136 **顺延、不执行 ③、⑤**：**M1 顺延 1 周至 35 个日历周（2026-11-09 → 2027-07-09）**，第 31 周末功能冻结（2027-06-11），第 32–34 周自用，第 35 周退出评审；各线缓冲外余量：系统、Agent、桌面、设计各 0.2，安全 0.59 工作周；各线 QA 在第 28–29 周结束，第 30–31 周为完整的冻结前缓冲。M2 至 2027-10-15。增 1 人方案更正为 **31 周**，前提是新人承担约 2.0 人周的安全线工作（此前的 30 周只计四条全职线，漏算安全线，R15-D14-01）。`14` §14.3.4 仍为日期与余量的唯一来源。

- **第 16 轮补记（ADR-133 附，按 ADR-136/139 的排期规则）**：ADR-137–139 与 R16 各项按 WBS 行去重后（07/08/09 的系统 0.9 与 05/06 的 W3 0.5 是同一项，取 0.9）净增 **+3.4 人周**（WBS 114.55）：W3 +0.9、W4 +0.15、W6 +0.45、W7 +0.55、W9 +0.2、W12 +0.35、W13 +0.7、W15 +0.1；分配为系统 +0.9、Agent +0.85、桌面 +0.75、设计 +0.7、安全 +0.2。第 15 轮之后的余量合计约 1.01 人周，按规则**顺延、不执行 ③、⑤**：**M1 顺延 1 周至 36 个日历周（2026-11-09 → 2027-07-16）**，第 32 周末功能冻结（2027-06-18），第 33–35 周自用，第 36 周退出评审；各线缓冲外余量：系统 0.21、Agent 0.27、桌面 0.38、设计 0.43、安全 1.15 工作周；各线 QA 在第 29–30 周结束，第 31–32 周为完整的冻结前缓冲。M2 至 2027-10-22。增 1 人方案为 **32 周**，前提是新人承担约 1.9 人周的安全线工作。`14` §14.3.4 仍为日期与余量的唯一来源。

- **第 17 轮补记（ADR-133 附，按 ADR-136/143 的排期规则）**：ADR-140–143 以删除与合并为主，按 WBS 行去重、删除项按负数计后净增 **+0.85 人周**（WBS 115.4）：W3 +0.3、W4 −0.3、W6 +0.25、W7 +0.25、W9 −0.1（含更正第 16 轮把 07/08/09 的 Agent 0.2 多算进 W9 的 −0.2）、W12 +0.2、W13 +0.25、W15 +0.05、W18 −0.05。系统线按原线分配需 +0.3、超出余量；W3 中 drain 目的集合与崩溃恢复（0.15）与桌面线的 W4 进程生命周期同属一处，改由桌面线承担。分配为系统 +0.15、Agent +0.15、桌面 +0.05、设计 +0.25、安全 +0.25，五条线均在余量之内：**M1 维持 36 周**（第 32 周末冻结，2027-06-18），不执行 ③、⑤，不顺延；余量：系统 0.05、Agent 0.1、桌面 0.32、设计 0.16、安全 0.6 工作周。增 1 人方案仍为 32 周，前提改为新人承担约 2.1 人周的安全线工作。
- **第 18 轮补记（ADR-133 附，按 ADR-136/143/144 的排期规则）**：ADR-144 与 R18 各项按 WBS 行去重后（07/08 的系统 0.2 与 05/06 的 W3 0.25 是同一项，取 0.25）净增 **+1.6 人周**（WBS 117.0）：W3 +0.25、W4 +0.1、W6 +0.2、W7 +0.4、W10 +0.05、W11 +0.4、W13 +0.2；分配为系统 +0.25、Agent +0.2、桌面 +0.6、设计 +0.2、安全 +0.35。第 17 轮之后的余量合计约 0.85 人周（系统线 0.05 工作周），线间改派不足以吸收，按规则**顺延、不执行 ③、⑤**：**M1 顺延 1 周至 37 个日历周（2026-11-09 → 2027-07-23）**，第 33 周末功能冻结（2027-06-25），第 34–36 周自用，第 37 周退出评审；各线缓冲外余量：系统 0.78、Agent 0.89、桌面 0.67、设计 0.94、安全 0.83 工作周；各线 QA 在第 30–31 周结束，第 32–33 周为完整的冻结前缓冲。M2 至 2027-10-29。增 1 人方案仍为 32 周，前提改为新人承担约 2.3 人周的安全线工作。`14` §14.3.4 仍为日期与余量的唯一来源。
- **第 19 轮补记（ADR-133 附）**：ADR-145 与 R19 各项按 WBS 行去重后（07/08 的系统 0.1 与 05/06 的 W3 0.15 是同一项，取 0.15）净增 **+0.7 人周**（WBS 117.7）：W3 +0.15、W4 +0.1、W6 +0.05、W7 +0.2、W11 +0.12、W13 +0.08；分配为系统 +0.15、Agent +0.05、桌面 +0.22、设计 +0.08、安全 +0.2，逐线都在余量之内：**M1 维持 37 周**（第 33 周末冻结，2027-06-25），不改派、不顺延；余量：系统 0.61、Agent 0.83、桌面 0.42、设计 0.85、安全 0.39 工作周。增 1 人方案仍为 32 周，前提改为新人承担约 2.4 人周的安全线工作。
- **第 20 轮补记（ADR-133 附）**：ADR-146 与 R20 各项按 WBS 行去重后（07 的系统 0.1 与 05/06 的 W3 0.15 是同一项，取 0.15）净增 **+0.52 人周**（WBS 118.22）：W3 +0.15、W4 +0.1、W6 +0.05、W7 +0.15、W11 +0.05、W13 +0.02；分配为系统 +0.15、Agent +0.05、桌面 +0.15、设计 +0.17（SP6b 新增用例由设计线执行，安全线余量留作缓冲）、安全 0，逐线都在余量之内：**M1 维持 37 周**（第 33 周末冻结，2027-06-25），不顺延；余量：系统 0.44、Agent 0.77、桌面 0.26、设计 0.66、安全 0.39 工作周。增 1 人方案仍为 32 周（新人承担约 2.4 人周安全线工作）。
- **第 21 轮补记（ADR-133 附）**：ADR-147 与 R21 各项按 WBS 行去重后（07 的系统 0.05 与 05/06 的 W3 0.1 是同一项，取 0.1）净增 **+0.3 人周**（WBS 118.52）：W3 +0.1、W6 +0.05、W7 +0.1、W11 +0.04、W13 +0.01；分配为系统 +0.1、Agent +0.05、桌面 +0.04、设计 +0.11、安全 0，逐线都在余量之内：**M1 维持 37 周**（第 33 周末冻结，2027-06-25）；余量：系统 0.33、Agent 0.72、桌面 0.21、设计 0.54、安全 0.39 工作周。增 1 人方案仍为 32 周（新人承担约 2.4 人周安全线工作）。
- **第 22 轮补记（ADR-133 附）**：ADR-148 及其补记与 R22 各项按 WBS 行去重后净增 **+0.37 人周**（WBS 118.89）：W3 +0.1、W4 +0.1（准备阶段的两个子阶段）、W7 +0.1、W11 +0.06、W13 +0.01；分配为系统 +0.1、桌面 +0.1、设计 +0.17（界面前端因桌面线余量偏小改由设计线承担），逐线都在余量之内：**M1 维持 37 周**（第 33 周末冻结，2027-06-25）；余量：系统 0.22、Agent 0.72、桌面 0.1、设计 0.36、安全 0.39 工作周。增 1 人方案仍为 32 周（新人承担约 2.3 人周安全线工作），但该方案只剩约 0.02 工作周余量。
- **第 23 轮补记（ADR-133 附）**：ADR-149 与 R23 各项按 WBS 行去重、删除项按负数计后净增 **+0.11 人周**（WBS 119.0）：W3 +0.1、W4 −0.05（撤回两段准备）、W7 +0.05、W11 +0.01；只落在系统与设计线（桌面线余量 0.1），逐线都在余量之内：**M1 维持 37 周**（第 33 周末冻结，2027-06-25）；余量：系统 0.11、Agent 0.72、桌面 0.16、设计 0.29、安全 0.39 工作周。增 1 人方案由 32 周变为 **33 周**（23.01 + 2 > 25 个工作周），前提仍是新人承担约 2.3 人周安全线工作。
- **第 24 轮补记（ADR-133 附，按 ADR-136/150 的排期规则）**：ADR-150 及其补记与 R24 各项按 WBS 行去重后净增 **+0.78 人周**（WBS 119.78）：W3 +0.1、W7 +0.45（系统 0.3、设计 0.15）、W6 +0.05、W10 +0.15、W11 +0.02、W13 +0.01；按 ADR-150 分派为系统 +0.4、Agent +0.05、设计 +0.18、安全 +0.15。系统线余量只有 0.11 工作周，按要求可改派的设计、安全线在本轮分派后合计只余约 0.11 人周，改派不足以吸收 → **M1 顺延 1 周至 38 个日历周（2026-11-09 → 2027-07-30）**，第 34 周末功能冻结（2027-07-02），第 35–37 周自用，第 38 周退出评审；不执行 ③、⑤；余量：系统 0.67、Agent 1.66、桌面 1.16、设计 1.09、安全 1.06 工作周；各线 QA 在第 31–32 周结束，第 33–34 周为完整的冻结前缓冲。M2 至 2027-11-05。增 1 人方案为 33 周（新人承担约 2.4 人周安全线工作）。
- **第 25 轮补记（ADR-133 附）**：ADR-151 与 R25 各项按 WBS 行去重后净增 **+0.24 人周**（WBS 120.02）：W3 +0.05、W7 +0.15（系统 0.05、Agent 0.1——SP6b 用例按要求用 Agent 线的余量）、W6 +0.02、W11 +0.02；分配为系统 +0.1、Agent +0.12、设计 +0.02，逐线都在余量之内：**M1 维持 38 周**（第 34 周末冻结，2027-07-02）；余量：系统 0.56、Agent 1.53、桌面 1.16、设计 1.07、安全 1.06 工作周。增 1 人方案仍为 33 周（新人承担约 2.4 人周安全线工作）。
- **第 26 轮补记（ADR-133 附）**：ADR-152 与 R26 各项按 WBS 行去重后净增 **+0.13 人周**（WBS 120.15）：W7 +0.15（系统 0.05、Agent 0.1——SP6b 用例用 Agent 线的余量）、W10 −0.02；逐线都在余量之内：**M1 维持 38 周**（第 34 周末冻结，2027-07-02）；余量：系统 0.51、Agent 1.42、桌面 1.16、设计 1.07、安全 1.1 工作周。增 1 人方案仍为 33 周（新人承担约 2.3 人周安全线工作）。
- **第 27 轮补记（ADR-133 附）**：ADR-153 与 R27 各项按 WBS 行去重后净增 **+0.18 人周**（WBS 120.33）：W3 +0.02、W7 +0.13（系统 0.05、Agent 0.08——SP6b 用例用 Agent 线的余量）、W6 +0.01、W11 +0.02；逐线都在余量之内：**M1 维持 38 周**（第 34 周末冻结，2027-07-02）；余量：系统 0.43、Agent 1.32、桌面 1.16、设计 1.05、安全 1.1 工作周。增 1 人方案仍为 33 周（新人承担约 2.3 人周安全线工作）。
- **第 28 轮补记（ADR-133 附）**：ADR-154（含其补记与补记 2）与 R28 各项按 WBS 行去重后净增 **+0.18 人周**（WBS 120.51）：W7 +0.15（系统 0.07——LFS 配置经 `0600` 临时文件传入、远端顺序与远端引用、所有检出保持指针、`lfs_config_ignored`、主检出上下文中的认证配置与 `core.sshCommand`；Agent 0.08——SP6b 用例 G43(j)–(q)，用 Agent 线的余量）、W10 +0.02（安全）、W11 +0.01（桌面）；`07` 把 `lfs_excluded` 附于验证证据，0；逐线都在余量之内：**M1 维持 38 周**（第 34 周末冻结，2027-07-02）；余量：系统 0.36、Agent 1.24、桌面 1.15、设计 1.05、安全 1.06 工作周。增 1 人方案仍为 33 周（T ≥ 23.30 工作周，新人承担约 2.3 人周安全线工作）。
- **第 29 轮补记（ADR-133 附）**：ADR-155（含其补记与补记 2）与 R29 各项按 WBS 行去重后净增 **+0.27 人周**（WBS 120.78）：W7 +0.21（系统 0.16——git 网络命令的 URL 去 userinfo 与 store 文件、`~/.tower/tmp/` 与启动清空、远端名统一、rebase 前的 LFS 补齐、带凭据 `insteadOf` 时显式写出有效配置、全部网络命令改在镜像中执行；M2 推送部分计入 M2；Agent 0.05——SP6b 用例 G44 与 SP6a A12(b) 的 M1 补跑，用 Agent 线的余量；A12(a) 在 SP6a 的 M0 工期内）、W10 +0.05（安全）、W11 +0.01（桌面）；逐线都在余量之内：**M1 维持 38 周**（第 34 周末冻结，2027-07-02）；余量：系统 0.18、Agent 1.18、桌面 1.14、设计 1.05、安全 0.95 工作周。系统线余量只剩 0.18 工作周，下一次落在系统线上超过约 0.16 人周（未含 QA）的增量须改派或顺延。增 1 人方案仍为 33 周（T ≥ 23.36 工作周，新人承担约 2.3 人周安全线工作）。
- **第 30 轮补记（ADR-133 附）**：ADR-156 与 R30 各项按 WBS 行去重后净变化 **−0.02 人周**（WBS 120.76）。W7 −0.03：系统 −0.05——rebase 前的 LFS 补齐随自动 rebase 归 M2 −0.1，`baseTip()` +0.03，凭据按主机提供 +0.02；Agent +0.02——G44(a) 移入 M2 −0.01，SP6b 用例 G45 +0.03（含 ADR-156 补记的 G45(e)，增量可忽略）。W11 +0.01（桌面）。**M1 维持 38 周**（第 34 周末冻结，2027-07-02），M1 略为变轻；余量：系统 0.23、Agent 1.16、桌面 1.13、设计 1.05、安全 0.95 工作周。增 1 人方案仍为 33 周（T ≥ 23.36 工作周，新人承担约 2.3 人周安全线工作）。
- **第 31 轮补记（ADR-133 附）**：ADR-157 与 R31 各项按 WBS 行去重后净变化 **−0.03 人周**（WBS 120.73）：
  - W7 −0.09：系统 −0.12——撤回凭据改写机制，新增 M1 远端 base 的四个获取时机与 `base_advanced`，`baseTip` 按获取时间；Agent +0.03——SP6b 用例 G45(c)–(f) 改写与新增，G44(d) 的旧组撤去。
  - W10 +0.04（安全）：05/06 −0.01；SP6a A12(a) 闸门核查 +0.05，在 M0 中执行，但计入安全线。
  - W11 +0.02（桌面）。
  
  **M1 维持 38 周**（第 34 周末冻结，2027-07-02），M1 变轻。余量：系统 0.37、Agent 1.13、桌面 1.10、设计 1.05、安全 0.86 工作周。增 1 人方案仍为 33 周（T ≥ 23.35 工作周）；新人须承担的安全线工作由约 2.3 人周升为约 2.4 人周。
- **第 32 轮补记（ADR-133 附）**：ADR-158（含补记）与 R32 各项按 WBS 行去重后净增 **+0.23 人周**（WBS 120.96），并按 WBS 行的主责线计入：
  - W7 +0.10：系统 0.05——带凭据远端的默认拒绝与判定、`baseTip` 分叉不自动选择、`goal.base.*` 与 `project.remote.recheck`、不阻塞的 `in_review` 前获取；Agent 0.05——SP6b 用例 G35 的 ADR-158 组、G45 改写、G46。
  - W4 +0.03（桌面）：05/06 记为系统，W4 的主责是桌面线。
  - W9 +0.05（Agent）：`07` 记为系统，W9 的主责是 Agent 线。
  - W10 +0.03（安全）。
  - W11 +0.02（桌面）。
  
  M2 的 `awaiting_push` 不计入。ADR-158 补记 2（`base_fetch_failed`、云 SDK 凭据只传文件路径、G46(d)）的增量可忽略，不改变上述数字。逐线都在余量之内：**M1 维持 38 周**（第 34 周末冻结，2027-07-02）；余量：系统 0.31、Agent 1.02、桌面 1.05、设计 1.05、安全 0.8 工作周。增 1 人方案仍为 33 周（T ≥ 23.39 工作周，新人承担约 2.4 人周安全线工作）。
- **第 33 轮补记（ADR-133 附）**：ADR-159（含补记 1–3）与 R33 各项按 WBS 行去重后净增 **+0.55 人周**（WBS 121.51），按 WBS 行的主责线计入：
  - W7 +0.14：系统 0.07——凭据判定扩展、`base_choice`、获取合并与 60 s 时限、重启清理只按令牌；Agent 0.07——SP6b 用例 G46 改写，以及 G45、G35 的 ADR-159 组。
  - W6 +0.13（Agent）：独占窗口的 gate 与单次中止。
  - W9 +0.13（Agent）：05/06 与 `07`/`08` 同一行取较大者 0.1；补记 2/3 的崩溃后重新运行验证 +0.03。
  - W4 +0.05（桌面）：补记 2/3 的 `SIGSTOP`/`SIGCONT`、挂起不计时与崩溃恢复。
  - W10 +0.05（安全）。
  - W11 +0.05（桌面 0.04、设计 0.01）。
  
  合计高于评审估计（0.2–0.3），差额主要是独占窗口在 W6、W9 与 W4 的实现。逐线都在余量之内：**M1 维持 38 周**（第 34 周末冻结，2027-07-02）；余量：系统 0.23、Agent 0.65、桌面 0.95、设计 1.04、安全 0.68 工作周。增 1 人方案仍为 33 周（T ≥ 23.51 工作周，新人承担约 2.4 人周安全线工作）。
- **第 34 轮补记（ADR-133 附）**：ADR-160（含补记）与 R34 各项按 WBS 行去重后净变化 **−0.13 人周**（WBS 121.38），按 WBS 行的主责线计入：
  - 独占窗口撤回：W6 −0.13 与 W9 −0.03（Agent）、W4 −0.05（桌面）。
  - 调度互斥：W3 +0.03（冻结准入，系统）、W10 +0.02（安全）、W11 +0.01（桌面）。
  - W7：系统 +0.01（`baseTip` 未选择时返回 `baseCommit` 一侧）；Agent +0.01（G46 改写）。
  
  **M1 维持 38 周**（第 34 周末冻结，2027-07-02），M1 变轻。余量：系统 0.19、Agent 0.82、桌面 0.99、设计 1.04、安全 0.64 工作周；系统线余量已低于 0.2 工作周，下一次落在系统线上超过约 0.17 人周（未含 QA）的增量须改派或顺延。增 1 人方案仍为 33 周（T ≥ 23.48 工作周，新人承担约 2.4 人周安全线工作）。
- **第 35 轮补记（ADR-133 附）**：ADR-161 与 R35 各项按 WBS 行去重后净变化 **−0.06 人周**（WBS 121.32），按 WBS 行的主责线计入：
  - W6 −0.08（Agent）：`secrets.access` 归 M2。
  - W9 +0.03（Agent）：带机密的标准独占验证器；`07` 的 +0.01 是同一行，不另计。
  - W3 −0.02（系统）。
  - W10 −0.01（安全）。
  - W7 +0.02（Agent，SP6b 用例）。
  
  **M1 维持 38 周**（第 34 周末冻结，2027-07-02），M1 变轻。余量：系统 0.21、Agent 0.85、桌面 0.99、设计 1.04、安全 0.66 工作周。增 1 人方案仍为 33 周（T ≥ 23.47 工作周，新人承担约 2.4 人周安全线工作）。
- **第 36 轮补记（ADR-133 附）**：ADR-162 与 R36 各项按 WBS 行去重后净增 **+0.23 人周**（WBS 121.55），按 WBS 行的主责线计入：
  - W9 +0.1（Agent）：`07` 与 05/06 同一行，取较大者。
  - W3 +0.03（系统）。
  - W10 +0.03（安全）。
  - W11 +0.02（桌面）。
  - W7 +0.05（Agent，SP6b 用例与 A8 测量）。
  
  逐线都在余量之内：**M1 维持 38 周**（第 34 周末冻结，2027-07-02）；余量：系统 0.18、Agent 0.69、桌面 0.97、设计 1.04、安全 0.6 工作周。系统线余量 0.18 工作周：下一次落在系统线上超过约 0.16 人周（未含 QA）的增量须改派或顺延。增 1 人方案仍为 33 周（T ≥ 23.51 工作周，新人承担约 2.4 人周安全线工作）。
- **第 37 轮补记（ADR-133 附）**：ADR-163（含补记）与 R37 各项按 WBS 行去重后净增 **+0.27 人周**（WBS 121.82），按 WBS 行的主责线计入：
  - W3 +0.05（系统）。
  - W9 +0.13（Agent）：`07` 与 05/06 同一行取较大者 0.1；另加由 W3 改派的未闭合冻结恢复 +0.03。
  - W10 +0.02（安全）。
  - W11 +0.03（桌面）。
  - W7 +0.04（Agent，SP6b 用例）。
  
  05/06 估计的 W3 +0.08 本可落在系统线余量（0.18 工作周）之内，但会使余量降到 0.09。为留出余地，按 ADR-136 把其中未闭合冻结的恢复（约 0.03 人周）改派到 Agent 线，与 W9 的机密阶段收尾相邻（主干裁定）。**M1 维持 38 周**（第 34 周末冻结，2027-07-02）；余量：系统 **0.12**、Agent 0.50、桌面 0.94、设计 1.04、安全 0.56 工作周。下一次落在系统线上超过约 0.11 人周（未含 QA）的增量，必须改派到 Agent 或桌面线，或者顺延。增 1 人方案仍为 33 周（T ≥ 23.57 工作周，新人承担约 2.4 人周安全线工作）。
- **第 38 轮补记（ADR-133 附）**：ADR-164 把带机密的验证标准整体推迟到 M2。按 WBS 行去重后净变化 **−0.64 人周**（WBS 121.18），按 WBS 行的主责线计入：
  - W9 −0.4（Agent）：`07`/`08` −0.4 与 05/06 −0.2 同一行，取较大者；第 32–37 轮在本行累计加入约 0.38。
  - W13 −0.05（设计）。
  - W3 −0.06（系统）。
  - W10 −0.03（安全）。
  - W11 −0.01（桌面）。
  - W7 −0.09（Agent，SP6b 用例 G46 的带机密各组移入 M2 组 G46b）。
  
  **M1 维持 38 周**（第 34 周末冻结，2027-07-02），M1 明显变轻。余量：系统 0.19、Agent 1.04、桌面 0.95、设计 1.09、安全 0.62 工作周。增 1 人方案仍为 33 周（T ≥ 23.44 工作周）；新人须承担的安全线工作由约 2.4 人周变为约 2.5 人周：安全线减得比全部工作少，所占比例略升。
- **第 39 轮补记（ADR-133 附）**：ADR-165（含补记）与 R39 各项按 WBS 行去重后净增 **+0.09 人周**（WBS 121.27），按 WBS 行的主责线计入：
  - W8 +0.03（Agent）。
  - W9 +0.03（Agent）：05/06 与 `07` 同一行，取较大者。
  - W10 −0.02（安全）。
  - W11 +0.02（桌面）。
  - W7 +0.03（Agent，SP6b 用例）。
  
  逐线都在余量之内：**M1 维持 38 周**（第 34 周末冻结，2027-07-02）；余量：系统 0.19、Agent 0.94、桌面 0.93、设计 1.09、安全 0.66 工作周。增 1 人方案仍为 33 周（T ≥ 23.46 工作周，新人承担约 2.4 人周安全线工作）。
- **第 40 轮补记（ADR-133 附）**：ADR-166 与 R40 各项按 WBS 行去重后净增 **+0.19 人周**（WBS 121.46），按 WBS 行的主责线计入：
  - W3 +0.05（系统）。
  - W9 +0.04（Agent）。
  - W10 +0.02（安全）。
  - W11 +0.04（桌面 0.03、设计 0.01）。
  - W7 +0.04（Agent，SP6b 用例与 A9）。
  
  系统线的 +0.05 落在余量之内，按 ADR-136 不改派。**M1 维持 38 周**（第 34 周末冻结，2027-07-02）；余量：系统 0.14、Agent 0.85、桌面 0.89、设计 1.08、安全 0.62 工作周。下一次落在系统线上超过约 0.12 人周（未含 QA）的增量须改派或顺延。增 1 人方案仍为 33 周（T ≥ 23.50 工作周，新人承担约 2.4 人周安全线工作）。
- **第 41 轮补记（ADR-133 附）**：ADR-167 与 R41 各项按 WBS 行去重后净增 **+0.17 人周**（WBS 121.63），按 WBS 行的主责线计入：
  - W3 +0.04：系统 0.01；本地文件清单的 add/remove/approve 约 0.03 按 ADR-136 改派到桌面线（主干裁定）。
  - W7-core +0.01（系统）。
  - W9 +0.05（Agent）：05/06 与 `07`/`08` 同一行，取较大者。
  - W10 +0.03（安全，含 SP6a A13 的测量）。
  - W11 +0.01（桌面）。
  - W7 +0.03（Agent，SP6b 用例）。
  
  05/06 估计的系统线 +0.05 本可落在余量（0.14 工作周）之内，但会使余量降到 0.08；为留出余地，改派约 0.03 到桌面线。**M1 维持 38 周**（第 34 周末冻结，2027-07-02）；余量：系统 **0.11**、Agent 0.76、桌面 0.85、设计 1.08、安全 0.56 工作周。下一次落在系统线上超过约 0.10 人周（未含 QA）的增量必须改派或顺延。增 1 人方案仍为 33 周（T ≥ 23.53 工作周，新人承担约 2.5 人周安全线工作）。
- **第 42 轮补记（ADR-133 附）**：ADR-168 撤回 `secret_file_unseeded` 自动归类。按 WBS 行去重后净变化 **−0.13 人周**（WBS 121.50），按 WBS 行的主责线计入：
  - W9 −0.06（Agent）：05/06 与 `07`/`08` 同一行，取较大者。
  - W3 −0.02（系统）。
  - W10 −0.03（安全，含撤回的 SP6a A13）。
  - W11 −0.01（桌面）。
  - W7 −0.01（Agent，SP6b 用例）。
  
  **M1 维持 38 周**（第 34 周末冻结，2027-07-02），M1 变轻。余量：系统 0.14、Agent 0.84、桌面 0.86、设计 1.08、安全 0.62 工作周。增 1 人方案仍为 33 周（T ≥ 23.50 工作周，新人承担约 2.4 人周安全线工作）。
- **第 43–44 轮补记（ADR-133 附）**：ADR-169（第 43 轮，当时未登记）与 ADR-170 按 WBS 行去重后合计净增 **+0.07 人周**（第 43 轮 +0.03、第 44 轮 +0.04；WBS 121.57），按 WBS 行的主责线计入：
  - W3 +0.02：系统 0.01（第 43 轮 `inspect.open` 的来源守卫与检验 pin、派生谓词）；`approve` 不隐式插入、`unmark_secret` 的守卫与 DDL 约束约 0.01 与第 41 轮的本地文件清单命令同属项目设置类命令，按 ADR-136 改派到桌面线（主干裁定）。
  - W9 +0.01（Agent）：每次播种前按名字与当前内容重新判定、写入 `secretBy` 与事件、失败关闭（ADR-170）。
  - W11 +0.02（桌面）：第 43 轮串联 `retry_verify` 与 Needs-You 关闭条件 0.01；第 44 轮建议条目 `[添加]` 先 `add` 后按判定结果 `approve`、重新归类的通知 0.01。
  - W7 +0.02（Agent，SP6b 用例）：第 43 轮 G46(aa)(ab)(ac) 与 (v)(w) 改写；第 44 轮 G46(ad)(ae) 与 (ac) 改写。
  - `10`、`11` 只是改为引用 `16`，0。
  
  第 44 轮的系统线部分若不改派，系统线余量会降到 0.11；按第 44 轮评审“下一次系统线增量应优先改派”，改派约 0.01 到桌面线。**M1 维持 38 周**（第 34 周末冻结，2027-07-02）；余量：系统 **0.12**、Agent 0.81、桌面 0.83、设计 1.08、安全 0.62 工作周。下一次落在系统线上超过约 0.11 人周（未含 QA）的增量须改派或顺延。增 1 人方案仍为 33 周（T ≥ 23.52 工作周，新人承担约 2.4 人周安全线工作）。
- **第 45 轮补记（ADR-133 附）**：第 45 轮相对第 44 轮的增量（ADR-171）按 WBS 行去重后净增 **+0.03 人周**（WBS 121.60），按 WBS 行的主责线计入：
  - W9 +0.01（Agent）：复制前的判定覆盖任何把本地文件复制出用户检出的地方，人工编辑检出调用同一判定；判定与复制用同一次读入的内容；不可读或不存在时不改写分类、事件 producer `sm`。
  - W11 +0.01（桌面）：“无法读取（或不存在），本次未复制”通知的去重与自动消失、`[标记为机密]` 对已取消标记条目的即时效果。
  - W7 +0.01（Agent，SP6b 用例）：G46(af)(ag)(ah)。
  - W3 中 `mark_secret` 清除 `unmarked`、对 `isSecret` 条目为无操作，是同一命令守卫内的改动，不足 0.01，0；`06`、`07`、`10`、`11` 只是改为引用 `16`，0。
  
  分配：Agent +0.02、桌面 +0.01，**不进入系统线**（ADR-136）。**M1 维持 38 周**（第 34 周末冻结，2027-07-02）；余量：系统 **0.12**（0.125，不变）、Agent 0.78、桌面 0.82、设计 1.08、安全 0.62 工作周。下一次落在系统线上超过约 0.11 人周（未含 QA）的增量须改派或顺延。增 1 人方案仍为 33 周（T ≥ 23.52 工作周，新人承担约 2.4 人周安全线工作）。
- **第 46 轮补记（ADR-133 附）**：第 46 轮相对第 45 轮的增量（ADR-172）按 WBS 行去重后净增 **+0.02 人周**（WBS 121.62），按 WBS 行的主责线计入：
  - W9 +0.01（Agent）：复制结果的记录——项目级 Fact `local_file_unreadable` 只对本应复制的条目记录、每个条目一条 `fresh`、成功读取时 `expired`；自动恢复事件 `project.local_file_unmark_reverted`；`envHash` 加入该槽位实际复制的本地文件项，入账哈希与指纹 `extra` 取自复制时的同一次读取。
  - W11 +0.01（桌面）：“无法读取”通知改由 Fact 产生并限定范围、`◇ 文件不存在`、重新归类按条目原状态的文案、自动恢复通知、失败卡片与返工证据的“未复制”提示。
  - W7 中 G46(ah) 补断言与新增 (ai) 不足 0.01，0；`02`、`06`、`10`、`11` 只是登记与引用，0。
  - 算式更正（R46-D14-01，不计工时）：第 45 轮数值下 `14` L400 的加法式应为 127.39（T = 129.39 / 5.5 = 23.53），计入本轮增量后为 28.23 + 28.88 + 28.19 + 27.92 + 14.19 = 127.41（T = 129.41 / 5.5 = 23.53）；依赖链按 W9b = 6.5 为 19.7 工作周，仍短于最长角色线 28.88。
  
  分配：Agent +0.01、桌面 +0.01，**不进入系统线**（ADR-136）。冻结前所需：Agent 25.66 × 1.1 = 28.226 → 28.23，桌面 25.63 × 1.1 = 28.193 → 28.19，其余不变。**M1 维持 38 周**（第 34 周末冻结，2027-07-02）；余量：系统 **0.12**（0.125，不变）、Agent 0.77、桌面 0.81、设计 1.08、安全 0.62 工作周。下一次落在系统线上超过约 0.11 人周（未含 QA）的增量须改派或顺延。增 1 人方案仍为 33 周（T ≥ 23.53 工作周，新人承担约 2.4 人周安全线工作）。
- **第 47 轮补记（ADR-133 附）**：第 47 轮相对第 46 轮的增量（ADR-173）按 WBS 行去重后净增 **+0.01 人周**（WBS 121.63），按 WBS 行的主责线计入：
  - W9 +0.01（Agent）：`verify()` 在查缓存之前读入 `seeded` 条目，缓存查询、槽位写出与 `criterion_check.env.localFiles` 共用这一次读取；“未复制”提示改取本次验证的记录，返工消息模板加这一行；撤回 `local_file_unreadable` Fact、“无法读取”通知改为进程内状态，抵消一部分。
  - W11 中“无法读取”通知改为进程内状态，与第 46 轮的同类改动相抵，0；W7 中 G46(ah)(ai) 改写不足 0.01，0；`02`、`04`、`06`、`10`、`11`、`16` 只是删除与引用，0。
  
  分配：Agent +0.01，**不进入系统线**（ADR-136）。冻结前所需：Agent 25.67 × 1.1 = 28.237 → 28.24，其余不变；`14` L400 的加法式为 28.24 + 28.88 + 28.19 + 27.92 + 14.19 = 127.42（T = 129.42 / 5.5 = 23.53）；依赖链仍为 19.7 工作周。**M1 维持 38 周**（第 34 周末冻结，2027-07-02）；余量：系统 **0.12**（0.125，不变）、Agent 0.76、桌面 0.81、设计 1.08、安全 0.62 工作周。下一次落在系统线上超过约 0.11 人周（未含 QA）的增量须改派或顺延。增 1 人方案仍为 33 周（T ≥ 23.53 工作周，新人承担约 2.4 人周安全线工作）。
- **第 48 轮补记（ADR-133 附）**：第 48 轮相对第 47 轮的增量（ADR-174）按 WBS 行去重后净增 **+0.02 人周**（WBS 121.65），按 WBS 行的主责线计入：
  - W9 +0.01（Agent）：`verify()` 写出前按当前状态复核 `seeded`，有条目不再 `seeded` 时不写出、回到读取一步重新开始；重放作为复制点播种 `seeded` 条目并与 `env.localFiles` 逐条比对；删除 `fingerprint.extraGlobs` 抵消一部分。
  - W11 +0.01（桌面）：项目级本地文件 L1 通知——设置页行 `◇` 与侧栏项目级 `◇`、经 `settings` 主题送达、事件类通知按条目记最后查看序号〔主干补充改为项目级水位 `project.local_files.viewed`，ADR-174/175〕。
  - W7 中 G46(ag) 新增一组、E13 指标注记不足 0.01，0；`04`、`06`、`08`、`09`、`12`、`16` 只是登记与引用，0。
  
  分配：Agent +0.01、桌面 +0.01，**不进入系统线**（ADR-136）。冻结前所需：Agent 25.68 × 1.1 = 28.248 → 28.25，桌面 25.64 × 1.1 = 28.204 → 28.20，其余不变；`14` L400 的加法式为 28.25 + 28.88 + 28.20 + 27.92 + 14.19 = 127.44（T = 129.44 / 5.5 = 23.53）；依赖链仍为 19.7 工作周，第 43–48 轮的增量都不在链上。**M1 维持 38 周**（第 34 周末冻结，2027-07-02）；余量：系统 **0.12**（0.125，不变）、Agent 0.75、桌面 0.80、设计 1.08、安全 0.62 工作周。下一次落在系统线上超过约 0.11 人周（未含 QA）的增量须改派或顺延。增 1 人方案仍为 33 周（T ≥ 23.53 工作周，新人承担约 2.4 人周安全线工作）。

- **第 49 轮补记（ADR-133 附）**：ADR-175 的各项（按 Project 的本地文件锁、重放只写出原记录的路径、项目级水位沿用 3 s 规则与侧栏聚合 `◇`、两处漏改）按 WBS 行逐项不足 0.01，计 **0**；WBS 仍为 121.65，各线数值、余量与 M1 = 38 周不变。

- **第 51 轮补记（ADR-133 附）**：第 50 轮只是措辞补正，0。第 51 轮相对第 50 轮的增量（ADR-176）按 WBS 行去重后净增 **+0.21 人周**（WBS 121.86），按 WBS 行的主责线计入：
  - W3 +0.04（系统 → 桌面）：`03` 补边与开 Run 的转移遇硬上限写 `run`、`human` 并入规则；`integration_reverted_seal` 与 `goal.undo_integrate` 回到 `accepted`；`goal.rebuild_satellite` 的命令、守卫与 HumanDecision 种类；`goal.update_meta` 降低 `riskTier` 的审计记录与 `resources.gate` 拒绝（各 0.01）。字段级远程规则与远程 S0 授权有效期属于 M2 的 `serve`，0。
  - W7-rest +0.04（系统 → 桌面 0.03、安全 0.01）：`goal.rebuild_satellite` 按情形 E 从所选检查点重建 0.02、交还目标树落在 `human_checkout.targetTree` 0.01（桌面）；`restorePaths` 恢复前的 safety 检查点与 `take_human` 写回集合“T0→T1 ∪ E”及其崩溃续写 0.01（安全）。
  - W7 SP6b +0.02（Agent）：G46(ak)–(an)。W8 +0.02（Agent）：`$GS/npmrc`、`$GS/gitconfig` 白名单与凭据剔除。W9 +0.02（Agent）：`mark_secret` 删除已有副本、Tower 写入窗口、提示与精确匹配集。W6 +0.01（Agent）：D58 与 C39。
  - W10 +0.01（安全）：Scratch 的元数据配置读拒绝与按路径模式的机密读拒绝。W11 +0.03（桌面）：`标记为机密` 确认文案与提示、计划步骤的说法字形与 `⚙ 超时默认` 印章、选择检查点重建。W13 +0.01（设计）：`requiresChange` 摘要按来源计数、`satellite_missing` 出口登记。W15 +0.01（桌面）：被撤销的 seal 不再触发 `integrated`。
  - W12 中评论 `addressed` 取消 🤖 来源与“Agent 称已回应”的显示相抵，0；D4-04 删去提醒回合、答案入开场队列，相抵，0；其余为登记、文案与数据清单，0。

  分配：Agent +0.07、桌面 +0.11、设计 +0.01、安全 +0.02；系统线的 0.08 若不改派，冻结前所需为 26.33 × 1.1 = 28.963 → 28.96、余量降到 0.04，因此按 ADR-136 按 WBS 行的其他主责线改派（同第 44 轮），**不进入系统线**。冻结前所需：Agent 25.75 × 1.1 = 28.325 → 28.33，桌面 25.75 × 1.1 = 28.325 → 28.33，设计 25.39 × 1.1 = 27.929 → 27.93，安全 12.92 × 1.1 = 14.212 → 14.21（按 0.5 人计为 28.42），系统不变（28.88）；`14` L400 的加法式为 28.33 + 28.88 + 28.33 + 27.93 + 14.21 = 127.68（T = 129.68 / 5.5 = 23.58）；依赖链仍为 19.7 工作周，第 43–51 轮的增量都不在链上。**M1 维持 38 周**（第 34 周末冻结，2027-07-02）；余量：系统 **0.12**（0.125，不变）、Agent 0.67、桌面 0.67、设计 1.07、安全 0.58 工作周，均为正。下一次落在系统线上超过约 0.11 人周（未含 QA）的增量须改派或顺延。增 1 人方案仍为 33 周（T ≥ 23.58 工作周，安全线 0.5 人完成约 11.79 人周，新人承担约 2.4 人周安全线工作）。

- **第 52 轮补记（ADR-133 附）**：第 52 轮相对第 51 轮的增量（ADR-178）按 WBS 行去重后净增 **+0.16 人周**（WBS 122.02），按 WBS 行的主责线计入：
  - W3 +0.03（系统 → 桌面）：重跑 settle 时未答阻塞条目不再阻塞 `claimed`、无活跃 Run 时作答入开场队列；`goal.rebuild_satellite` 成功后的开场与 `settle → run` 改写、`hand_back` 的卫星守卫；`contract.amend` 修订标准时的 `verifying` 边与 `review → verify{pin}` 改写（各 0.01）。`lower_risk_tier` 替换原审计记录，0。
  - W7-rest +0.04（系统 → 桌面 0.02、安全 0.02）：交还参数随 `targetTree` 写入 `human_checkout.params` 0.01、手动重建中途崩溃按 `checkpointN` 续做 0.01（桌面）；接管期间重建的 `rebuiltTree` 作为交还第 6 步的比较基准与写回集合 0.02（安全）。自动重建失败时清除 `satellite_rebuilding`、settle 序列中丢失写 `settle` 不足 0.01。
  - W7 SP6b +0.03（Agent）：G46(ao)(ap)(aq)、(ak)(an) 补组与 G40(e)，现值合计 4.98 人周。W6 +0.02（Agent）：`tower.satellite_rebuilt` 开场、`## Imported context` 只导入用户检出之外的祖先文件。W8 +0.01（Agent）：Go 的 `$GS/go/env` 白名单、userinfo 剥除与凭据判定。
  - W11 +0.01（桌面）：计划步骤 `✓` 只在关联标准由验证器通过时显示。W15 +0.01（桌面）：撤销合入后再次 seal 以 `baseCommit` 为父写入 `-v<k>`。W16 +0.01（设计）：首次运行检测 `pi` CLI 与登录前提。
  - 逐字段远程封闭表、`test.quarantine` 仅本机与远程 S0 授权卡片属于 M2 的 `serve`，0；Scratch 只复制已跟踪文件属于 M2，0；验证器网络只认 `VerifyProfile.env.network` 是删减，0；字形与文案的替换、登记与 T25 残余，0。

  分配：Agent +0.06、桌面 +0.07、设计 +0.01、安全 +0.02；系统线的 0.07 若不改派，冻结前所需为 26.32 × 1.1 = 28.952 → 28.95、余量降到 0.05，因此按 ADR-136 按 WBS 行的其他主责线改派（同第 51 轮），**不进入系统线**。角色合计：Agent 26.21、系统 26.35、桌面 27.62、设计 28.40、安全 13.44（合计 122.02）。冻结前所需：Agent 25.81 × 1.1 = 28.391 → 28.39，桌面 25.82 × 1.1 = 28.402 → 28.40，设计 25.40 × 1.1 = 27.94，安全 12.94 × 1.1 = 14.234 → 14.23（按 0.5 人计为 28.46），系统不变（28.88）；`14` §14.3.4 的加法式为 28.39 + 28.88 + 28.40 + 27.94 + 14.23 = 127.84（T = 129.84 / 5.5 = 23.61）；依赖链仍为 19.7 工作周，第 43–52 轮的增量都不在链上。**M1 维持 38 周**（第 34 周末冻结，2027-07-02）；余量：系统 **0.12**（0.125，不变）、Agent 0.61、桌面 0.60、设计 1.06、安全 0.54 工作周，均为正。下一次落在系统线上超过约 0.11 人周（未含 QA）的增量须改派或顺延。增 1 人方案仍为 33 周（T ≥ 23.61 工作周，安全线 0.5 人完成约 11.81 人周，新人承担约 2.4 人周安全线工作）。

- **第 52 轮补正（ADR-133 附，ADR-179）**：ADR-179 的各项（措辞、登记、事件类型索引、远程授权的事件型失效字段、文案与线框计数）按 WBS 行逐项不足 0.01，计 **0**（同第 49 轮）；WBS 仍为 122.02，各线数值、余量与 M1 = 38 周不变。

- **第 53 轮补记（ADR-133 附）**：第 53 轮相对第 52 轮的增量（ADR-180）按 WBS 行去重后净增 **+0.12 人周**（WBS 122.14），按 WBS 行的主责线计入：
  - W3 +0.02（系统 → 桌面）：修订标准改写 `review → verify{pin}` 时同一事务写 `verifyFrom` 0.01；`goal.rebuild_satellite` 的 `E_BUSY` 守卫与 `claim → run` 改写 0.01。
  - W7-rest +0.02（系统 → 安全）：交还写回集合统一为 `rebuiltTree ?? T0` → T1 0.01；`discard_human_edits` 的卫星守卫与以重建树为基准的外部改动判定 0.01（外部写入归因一类）。
  - W6 +0.03（Agent）：F7 的两种检测键与 F6 根因合并的排除 0.01、C39 按 v1.2.0 行为重写 0.01、`tower.satellite_rebuilt` 改由开场组装从 `satellite.recovered` 生成 0.01。W8 +0.01（Agent）：安装器第 2、3 阶段改读 `$VS/npmrc`、npmrc 先剥除 userinfo 再判定。W7 SP6b +0.01（Agent）：G46(ak)(an)(ao)(aq) 补组，现值合计 4.99 人周。
  - W10 +0.01（安全）：运行时 `Grant` 存于 `approve_action` 决定并编入 `policy.json`、远程审批只有“仅这一次”。W12 +0.01（设计）：批注锚点 `trace`。W14 +0.01（设计）：任何修订后重算致命三要素并在保存前警告。
  - 远程封闭表的判别原则与逐字段改为仅本机、新增 `exec` 标准仅本机、远程 S0 卡片的两种文案属于 M2 的 `serve`，0；删除 `AutonomyMatrix.grants[].expiresOn` 是删减，0；显示与定类规则的替换（计划步骤徽章、`◇ 可能不一致`、`◦`/`•`、`☐`、`│`、`X` 关闭的定类、F4 文案、校准记录标 M3），0；导出 Markdown 移到 M2，原本不在任何 WBS 行中，0；登记、索引与文案，0。

  分配：Agent +0.05、桌面 +0.02、设计 +0.02、安全 +0.03；系统线的 0.04 若不改派，冻结前所需为 (26.39 − 0.1) × 1.1 = 28.919 → 28.92、余量降到 0.08，因此按 ADR-136 按 WBS 行的其他主责线改派（同第 51、52 轮），**不进入系统线**。角色合计：Agent 26.26、系统 26.35、桌面 27.64、设计 28.42、安全 13.47（合计 122.14）。冻结前所需：Agent 25.86 × 1.1 = 28.446 → 28.45，桌面 25.84 × 1.1 = 28.424 → 28.42，设计 25.42 × 1.1 = 27.962 → 27.96，安全 12.97 × 1.1 = 14.267 → 14.27（按 0.5 人计为 28.54），系统不变（28.88）；`14` §14.3.4 的加法式为 28.45 + 28.88 + 28.42 + 27.96 + 14.27 = 127.98（T = 129.98 / 5.5 = 23.63）；依赖链仍为 19.7 工作周，第 43–53 轮的增量都不在链上。**M1 维持 38 周**（第 34 周末冻结，2027-07-02）；余量：系统 **0.12**（0.125，不变）、Agent 0.55、桌面 0.58、设计 1.04、安全 0.46 工作周，均为正。下一次落在系统线上超过约 0.11 人周（未含 QA）的增量须改派或顺延。增 1 人方案仍为 33 周（T ≥ 23.63 工作周，安全线 0.5 人完成约 11.82 人周，新人承担约 2.45 人周安全线工作）。

- **第 53 轮补正（ADR-133 附，ADR-181）**：ADR-181 的各项中只有链接检查器的目标地址规则是实现工作：W9 +0.02（Agent；先解析后检查、拒绝回环/链路本地/私网/元数据地址并让连接使用检查过的地址 0.01，不自动跟随重定向、逐跳检查与对应测试 0.01；计入 W9a，内置检查不需要槽位，不在依赖链上）。其余各项（倒计时引用、重新 seal 的 B 与 P、`integrationRevertedSeal` 不清除的说明、手动重建续做前移走已存在的卫星、失败后重启不再自动重建、登记与索引、`engine.*` 存储类型名、密钥路径表与 T25/T34、试运行计数与措辞、软矛盾示例、G46 标注、分叉改用专用 `SessionManager` 实例）按 WBS 行逐项不足 0.01，计 0（同第 49 轮）。分配：Agent +0.02，**不进入系统线**（ADR-136）。角色合计：Agent 26.28、系统 26.35、桌面 27.64、设计 28.42、安全 13.47（合计 122.16）。冻结前所需：Agent 25.88 × 1.1 = 28.468 → 28.47，其余不变；`14` §14.3.4 的加法式为 28.47 + 28.88 + 28.42 + 27.96 + 14.27 = 128.00（T = 130.00 / 5.5 = 23.64）；依赖链仍为 19.7 工作周。**M1 维持 38 周**（第 34 周末冻结，2027-07-02）；余量：系统 **0.12**（0.125，不变）、Agent 0.53、桌面 0.58、设计 1.04、安全 0.46 工作周，均为正。增 1 人方案仍为 33 周（T ≥ 23.64 工作周，安全线 0.5 人完成约 11.82 人周，新人承担约 2.45 人周安全线工作）。

- **第 54 轮补记（ADR-133 附）**：第 54 轮相对第 53 轮的增量（ADR-182）按 WBS 行去重后净增 **+0.19 人周**（WBS 122.35），按 WBS 行的主责线计入：
  - W7-rest +0.04（系统 → 安全 0.02、桌面 0.02）：交还第 5 步不短路、`take_external` 任何情况下不写 `human_edit` 检查点 0.01，放弃改动记入 `external_change` 的基线取记录重建树的检查点 0.01（外部写入归因一类 → 安全）；重建跳过 `restoreCheckpoint` 第 0 步并记录重建树的检查点 0.01，自动重建中途崩溃的续做与 `satellite_missing`/重建标志同一事务写入 0.01（→ 桌面）。W3 +0.01（系统 → 桌面）：阻塞类条目的 `needs_you.dismiss` 守卫。W15 +0.01（桌面）：新分支编号基于原始分支名、每个 seal 的合入只判定一次。
  - W6 +0.02（Agent）：F7 只在最终错误与 `compaction.end` 上判定、F6 对带刷新前缀的 `retry.*` 不开始根因合并 0.01，C39(c)(d) 0.01。W9 +0.01（Agent，计入 W9a）：允许范围外的重定向与超过 3 跳按被拒绝计。W8 +0.01（Agent）：`$GS/gitconfig` 先剥除 URL userinfo 再判定。W7 SP6b +0.02（Agent）：G46(ar)–(av) 与 G40(f) 补组，现值合计 5.01 人周。
  - W10 +0.04（安全）：S0 授权的失效写入点、范围外的测试路径同时归两类、`applyGrants` 与编入时的排除、`autonomy.revoke` 省略 `level` 撤销授权，各 0.01。W13 +0.01（设计）：阻塞类条目不显示 `X`。W14 +0.02（设计）：人编辑 `scope.include` 时置 `explicit` 且每个合同版本都执行计划编译 0.01，试运行无结论的显示 0.01。
  - 远程封闭表的派生效果属于 M2 的 `serve`，0；超时学习改为一律需批准属 M2–M3，0；显示、字形、复述改引用、登记、Pi 行为更正、分叉前提（沿用回退的守卫）与 `09` 的口径，0。

  分配：Agent +0.06、桌面 +0.04、设计 +0.03、安全 +0.06；系统线的 0.05 若不改派，冻结前所需为 (26.40 − 0.1) × 1.1 = 28.93、余量降到 0.07，因此按 ADR-136 按 WBS 行的其他主责线改派（同第 51–53 轮），**不进入系统线**。角色合计：Agent 26.34、系统 26.35、桌面 27.68、设计 28.45、安全 13.53（合计 122.35）。冻结前所需：Agent 25.94 × 1.1 = 28.534 → 28.53，桌面 25.88 × 1.1 = 28.468 → 28.47，设计 25.45 × 1.1 = 27.995 → 28.00（恰为 .5，四舍五入进位），安全 13.03 × 1.1 = 14.333 → 14.33（按 0.5 人计为 28.66），系统不变（28.88）；`14` §14.3.4 的加法式为 28.53 + 28.88 + 28.47 + 28.00 + 14.33 = 128.21（T = 130.21 / 5.5 = 23.67）；依赖链仍为 19.7 工作周，第 43–54 轮的增量都不在链上。**M1 维持 38 周**（第 34 周末冻结，2027-07-02）；余量：系统 **0.12**（0.125，不变）、Agent 0.47、桌面 0.53、设计 1.00、安全 0.34 工作周，均为正。下一次落在系统线上超过约 0.11 人周（未含 QA）的增量须改派或顺延。增 1 人方案仍为 33 周（T ≥ 23.67 工作周，安全线 0.5 人完成约 11.84 人周，新人承担约 2.49 人周安全线工作）。

- **第 55 轮补记（ADR-133 附）**：第 55 轮相对第 54 轮的增量（ADR-183）按 WBS 行去重后净增 **+0.10 人周**（WBS 122.45）。本轮以推迟或删除关闭整类问题，推迟的机制在原 WBS 行上计负增量（合计 −0.14），按 WBS 行的主责线计入：
  - W7-rest 净 +0.01：安全 +0.03（`keep_both` 按写回集合判定不相交、写回前存活进程写入先记 `agent_bg_done` 检查点、`human_edit` 检查点归为人的路径与 `Tower-Human-Edit` 条件，各 0.01，外部写入归因一类）；桌面 −0.02（重建时按基线重算未解除的外部改动 +0.01；从更早的检查点重建移到 M2：按所选检查点重建 −0.02、按 `checkpointN` 续做 −0.01）。W3 净 +0.02（系统 → 桌面）：接管期间 keep/revert 守卫、第 ③ 步撤回 `E_BUSY`、阻塞类并入 drain 中的原因、`stalled_timeout` 各 0.01，删去重建后的继续目标改写与 `checkpointN` 校验 −0.02。W11 0：选择检查点的卡片移到 M2（桌面 −0.01），目标页“本 Goal 内同类”授权列表与撤销（设计 +0.01）。W15 +0.01（桌面）：`integrated` 按状态再判定、“卫星树”不计未处置外部写入。
  - W6 +0.03（Agent）：重新组装开场前按 `details.key` 去重、`turn_end` 检查点经 Host 通道请求 Supervisor、SDK 处置取自 `preflightResult`，各 0.01。W9 净 +0.01（Agent）：正式验证总是运行静态哨兵与测试清单（含缓存全命中时的槽位与保留 ref）0.02、`repeat` 0.01、`anyQualified` 0.01、关闭注入后的兜底计数 0.01；`links_reachable` 与链接检查器移到 M2 −0.04。W7 SP6b 0：G46(aw)–(ba) 补组与 (aq) 旧组、`serve` 远程各组、(av) 移到 M2 相抵，现值仍 5.01 人周。
  - W10 净 −0.02（安全）：分类器收集全部文件类 0.01、排除 (c) 按事件序号与多类审批只给“仅这一次” 0.01；项目级运行时授权移到 M3 −0.04。W13 +0.03（设计）：暂停中的 `post_settle_activity` 选项、`S` 延后的时长与上限、单向门确认状态与 `stalled_timeout` 的显示。W14 +0.01（设计）：无计划与无 `touches` 时不改写 `include`、生成的停止条件取稳定 id 并整体重算。
  - RPC 成功信号（D55、C35(g)、C38）、网络学习的建议目标与同步墓碑属 M2–M3，0；字形、复述改引用、登记与行号更正，0。

  分配：Agent +0.04、桌面 0、设计 +0.05、安全 +0.01；系统线的 W3 +0.02 若不改派，冻结前所需为 (26.37 − 0.1) × 1.1 = 28.897 → 28.90、余量降到 0.10，因此按 ADR-136 改派到桌面线（同第 51–54 轮），**不进入系统线**。角色合计：Agent 26.38、系统 26.35、桌面 27.68、设计 28.50、安全 13.54（合计 122.45）。冻结前所需：Agent 25.98 × 1.1 = 28.578 → 28.58，设计 25.50 × 1.1 = 28.05，安全 13.04 × 1.1 = 14.344 → 14.34（按 0.5 人计为 28.68），系统与桌面不变（28.88、28.47）；`14` §14.3.4 的加法式为 28.58 + 28.88 + 28.47 + 28.05 + 14.34 = 128.32（T = 130.32 / 5.5 = 23.69）；依赖链仍为 19.7 工作周，第 43–55 轮的增量都不在链上。**M1 维持 38 周**（第 34 周末冻结，2027-07-02）；余量：系统 **0.12**（0.125，不变）、Agent 0.42、桌面 0.53、设计 0.95、安全 0.32 工作周，均为正（推迟的机制使本轮少增 0.14 人周；不推迟时 Agent、桌面、安全的余量会降到 0.38、0.47、0.22）。下一次落在系统线上超过约 0.11 人周（未含 QA）的增量须改派或顺延。增 1 人方案仍为 33 周（T ≥ 23.69 工作周，安全线 0.5 人完成约 11.85 人周，新人承担约 2.49 人周安全线工作）。

- **第 56 轮补记（ADR-133 附）**：第 56 轮相对第 55 轮的增量（ADR-184）按 WBS 行去重后净增 **+0.09 人周**（WBS 122.54）。每条都是补一个字段、守卫或引用，按 WBS 行的主责线计入：
  - W3 +0.02（系统 → 桌面）：`goal.resume` 无条件解除 `stalled_timeout` 并在同一事务关闭停滞条目 0.01，`run.started` 只消费组装进开场的 id（`openingIds`）0.01。W7-rest +0.02：`Checkpoint.humanPaths` 与作者推导的穿透 0.01（外部写入归因一类 → 安全）；`Checkpoint.unusable`、重建来源回退到可用的检查点 / pin / base、接管期间无法重建时放弃 Goal 保留人工编辑检出 0.01（恢复类 → 桌面）。
  - W6 +0.01（Agent）：`branchSummary` 来源的 `retry.end` 由导航结果推出、只在公开 `agent.settled` 的监听器返回之后调用 `prompt`（D59 的延迟分支）、导航目标已是当前叶子时不发命令。W9 +0.01（Agent，计入 W9b，在依赖链上）：缓存命中的 `criterion_check` 取本次的触发与 pin、只跑测试清单时不启动服务、环境错误返回前等哨兵、覆盖哨兵时把以阻断结束的那次验证升为决定性。W7 SP6b +0.01（Agent）：G46(bb)，现值 5.02 人周。
  - W10 +0.01（安全）：M1 的撤销带 `goalId`、只作用于该 Goal 的运行时授权，排除 (b) 写明合同授权的作用范围。W14 +0.01（设计）：删空计划时删除全部 `plan:*`、原为 `compiled` 的 `include` 置 `explicit` 并提示。
  - 验收闸改为引用 `anyQualified`（含新增 ⑪）、`■` 的措辞与单向门目标名表、`04`/`08`/`12` 的文案、take_human 与第 7 步同树合并、`repeat` 与 ADR-054 的说明、行号与复述更正，按 WBS 行逐项不足 0.01，计 0。

  分配：Agent +0.03、桌面 +0.03、设计 +0.01、安全 +0.02；系统线的 W3 +0.02 若不改派，冻结前所需为 (26.37 − 0.1) × 1.1 = 28.897 → 28.90、余量降到 0.10，因此按 ADR-136 改派到桌面线（同第 51–55 轮），**不进入系统线**。角色合计：Agent 26.41、系统 26.35、桌面 27.71、设计 28.51、安全 13.56（合计 122.54）。冻结前所需：Agent 26.01 × 1.1 = 28.611 → 28.61，桌面 25.91 × 1.1 = 28.501 → 28.50，设计 25.51 × 1.1 = 28.061 → 28.06，安全 13.06 × 1.1 = 14.366 → 14.37（按 0.5 人计为 28.74），系统不变（28.88）；`14` §14.3.4 的加法式为 28.61 + 28.88 + 28.50 + 28.06 + 14.37 = 128.42（T = 130.42 / 5.5 = 23.71）；依赖链 19.71 工作周（第 56 轮只有 W9b 的 +0.01 在链上，仍远短于 28.88）。**M1 维持 38 周**（第 34 周末冻结，2027-07-02）；余量：系统 **0.12**（0.125，不变）、Agent 0.39、桌面 0.50、设计 0.94、安全 0.26 工作周，均为正。下一次落在系统线上超过约 0.11 人周（未含 QA）的增量须改派或顺延。增 1 人方案仍为 33 周（T ≥ 23.71 工作周，安全线 0.5 人完成约 11.86 人周，新人承担约 2.51 人周安全线工作）。

- **第 57 轮补记（ADR-133 附）**：第 57 轮相对第 56 轮的增量（ADR-185）按 WBS 行去重后净增 **+0.05 人周**（WBS 122.59）。每条都是补一条守卫、一个类或一处标记，按 WBS 行的主责线计入：
  - W9 +0.02（Agent，计入 W9b，在依赖链上）：验收延续要求本次没有 ⑨ 以外的 `anyQualified` 条件 0.01；可能被升级的重放包不被磁盘压力清理、缓存命中要求原日志与原重放包仍在 0.01。W6 +0.01（Agent）：`selectMemory` 的必选条目上限计入 `Notes:` 前缀、放不下的必选条目写入 `contract.md` 并标出。W7 SP6b +0.01（Agent）：G46(bc)，现值 5.03 人周。
  - W10 +0.01（安全）：`readOnlyHint` 不为真的沙箱外工具归 `tool.external`（下限 ask、按工具名精确匹配的授权、恒按无沙箱求值）。
  - 进程内存预算的单一定义（只改数值）、M2 标记、`08` §8.8 补齐的出口定类、`workspace.recovered{unusableCheckpoints}`、开场队列在验收前的提示、`humanPaths` 为空时的文案、字形、键位、单向门的确认词、行号与复述更正，按 WBS 行逐项不足 0.01，计 0。

  分配：Agent +0.04、安全 +0.01、桌面 0、设计 0；**没有落在系统线上的增量**（`unusableCheckpoints` 与清理排除都不足 0.01，计 0），不需按 ADR-136 改派。角色合计：Agent 26.45、系统 26.35、桌面 27.71、设计 28.51、安全 13.57（合计 122.59）。冻结前所需：Agent 26.05 × 1.1 = 28.655 → 28.66（恰为 .5，四舍五入进位），安全 13.07 × 1.1 = 14.377 → 14.38（按 0.5 人计为 28.76），系统、桌面、设计不变（28.88、28.50、28.06）；`14` §14.3.4 的加法式为 28.66 + 28.88 + 28.50 + 28.06 + 14.38 = 128.48（T = 130.48 / 5.5 = 23.72）。**依赖链口径统一**（R57 观察 10）：其余各段取第 17 轮的分段值，W9b 取 6.5 加第 17 轮之后 W9 行的全部净增量（10.91 − 10.7 = +0.21，不再区分 W9a 与 W9b，偏保守）= 6.71，链长 3.9 + 3.9 + 4.4 + 6.71 + 1.0 = **19.91** 工作周，仍远短于 28.88。**M1 维持 38 周**（第 34 周末冻结，2027-07-02）；余量：系统 **0.12**（0.125，不变）、Agent 0.34、桌面 0.50、设计 0.94、安全 0.24 工作周，均为正（安全线仍高于约 0.15，不需按 ADR-136 改派）。下一次落在系统线上超过约 0.11 人周（未含 QA）的增量须改派或顺延。增 1 人方案仍为 33 周（T ≥ 23.72 工作周，安全线 0.5 人完成约 11.86 人周，新人承担约 2.52 人周安全线工作）。

- **第 58 轮补记（ADR-133 附）**：第 58 轮相对第 57 轮的增量（ADR-186）按 WBS 行去重后净增 **±0.00 人周**（WBS 122.59 不变）。本轮以删除与收窄为主，按 WBS 行的主责线计入：
  - W9 −0.01（Agent，计入 W9b，在依赖链上）：删除覆盖哨兵时把以阻断结束的验证升为决定性（ADR-184）与磁盘压力清理的两类排除（ADR-185）；被覆盖的验证按非永久规则保留、缓存命中引用的原日志按原验证的保留期保留（第 59 轮更正措辞，ADR-187），没有可用的重放包时报告“不可重放：<原因>”（沿用已有结论）。W9 现值 10.90。W7 SP6b +0.01（Agent）：G46(bd)，现值 5.04 人周；W7 现值 26.61。
  - W10 净 0（安全）：沙箱外工具按注册来源判定、只归 `tool.external`，删去按注解分出的只读与开放世界两支 −0.01；`decide()` 的级别下限钳制（单向门类与 `tool.external` 至少 ask）与合同授权 `pattern` 缺省不匹配 +0.01。
  - 开场队列在验收时保留（只改文案与 `16` 的登记）、接管中重建失败按原因区分出口、P8 进入 M1 退出标准、M2 标记、`08` §8.8 的通用放弃一行、Watch 键位、动效与确认词的说明、Tower 自身预留改为 0.65 GB、复述改引用，按 WBS 行逐项不足 0.01，计 0。

  分配：Agent 0（W9 −0.01 与 W7 SP6b +0.01 相抵）、系统 0、桌面 0、设计 0、安全 0；**没有落在系统线上的增量**，不需按 ADR-136 改派。角色合计不变：Agent 26.45、系统 26.35、桌面 27.71、设计 28.51、安全 13.57（合计 122.59）；冻结前所需不变：Agent 28.66、系统 28.88、桌面 28.50、设计 28.06、安全 14.38（按 0.5 人计为 28.76）；`14` §14.3.4 的加法式仍为 28.66 + 28.88 + 28.50 + 28.06 + 14.38 = 128.48（T = 130.48 / 5.5 = 23.72）。依赖链按第 57 轮统一的口径：W9b = 6.5 + (10.90 − 10.7) = 6.70，链长 3.9 + 3.9 + 4.4 + 6.70 + 1.0 = **19.90** 工作周，仍远短于 28.88。**M1 维持 38 周**（第 34 周末冻结，2027-07-02；退出 2027-07-30）；余量：系统 **0.12**（0.125，不变）、Agent 0.34、桌面 0.50、设计 0.94、安全 0.24 工作周，均为正。下一次落在系统线上超过约 0.11 人周（未含 QA）的增量须改派或顺延。增 1 人方案仍为 33 周（T ≥ 23.72 工作周，安全线 0.5 人完成约 11.86 人周，新人承担约 2.52 人周安全线工作）。

- **第 59 轮补记（ADR-133 附）**：第 59 轮相对第 58 轮的增量（ADR-187）按 WBS 行去重后净增 **+0.04 人周**（WBS 122.63）。每条都是补一条守卫、一处计算或一组用例，按 WBS 行的主责线计入：
  - W3 +0.01（系统 → 桌面）：`goal.accept{integrate:"none"}` 从 `accepted` 归档（不重做闸口、保留分支）与从 `in_review` 同一事务经 `accepted` 归档；`request_changes` 的 run 类守卫与终态 Goal 撤回开场返回 `E_STATE` 不足 0.01。W3 现值 10.04。
  - W6 +0.01（Agent）：Tower 工具的来源自检（生效来源须为 tower-goal，否则 `prepare_failed`）与静态清单标出与内置工具、Tower 工具同名的扩展。W6 现值 9.14。W9 +0.01（Agent，计入 W9b，在依赖链上）：经覆盖哨兵或 S0 拒绝改写的 `review` 目标进入 `in_review` 时按该 pin 的 outcome 计算标签、归因窗口的“通过”只认已验证与有保留的已验证。W9 现值 10.91。W7 SP6b +0.01（Agent）：G46(be)，现值 5.05 人周；W7 现值 26.62。
  - `00` §0.5.1 补两行、完整重哈希不再承诺重放包、缓存命中前提统一、`08` §8.8 的定类、`accept_risk` 的标签、M2/M3 标记、诊断视图键位、合同编辑器的有效级别、空匹配器只给“仅这一次”、复述改引用，按 WBS 行逐项不足 0.01，计 0。

  分配：Agent +0.03、桌面 +0.01、系统 0、设计 0、安全 0；系统线的 W3 +0.01 若不改派，冻结前所需为 (26.36 − 0.1) × 1.1 = 28.886 → 28.89、余量降到 0.11，因此按 ADR-136 改派到桌面线（同第 51–56 轮），**不进入系统线**。角色合计：Agent 26.48、系统 26.35、桌面 27.72、设计 28.51、安全 13.57（合计 122.63）。冻结前所需：Agent 26.08 × 1.1 = 28.688 → 28.69，桌面 25.92 × 1.1 = 28.512 → 28.51，系统、设计、安全不变（28.88、28.06、14.38，安全按 0.5 人计为 28.76）；`14` §14.3.4 的加法式为 28.69 + 28.88 + 28.51 + 28.06 + 14.38 = 128.52（T = 130.52 / 5.5 = 23.73）。依赖链按第 57 轮统一的口径：W9b = 6.5 + (10.91 − 10.7) = 6.71，链长 3.9 + 3.9 + 4.4 + 6.71 + 1.0 = **19.91** 工作周，仍远短于 28.88。**M1 维持 38 周**（第 34 周末冻结，2027-07-02；退出 2027-07-30）；余量：系统 **0.12**（0.125，不变）、Agent 0.31、桌面 0.49、设计 0.94、安全 0.24 工作周，均为正。下一次落在系统线上超过约 0.11 人周（未含 QA）的增量须改派或顺延。增 1 人方案仍为 33 周（T ≥ 23.73 工作周，安全线 0.5 人完成约 11.87 人周，新人承担约 2.51 人周安全线工作）。

- **第 60 轮补记（ADR-133 附）**：第 60 轮相对第 59 轮的增量（ADR-188）按 WBS 行去重后净增 **+0.02 人周**（WBS 122.65）。以删除与一条守卫为主，按 WBS 行的主责线计入：
  - W6 +0.01（Agent）：Tower 工具的来源自检移到 `bindExtensions` 之后；gate 第 1 步对 Tower 工具名逐次复核来源，Run 中途被遮蔽时阻断并暂停为 `prepare_failed`。W6 现值 9.15。W7 SP6b +0.01（Agent）：G46(bf)，现值 5.06 人周；W7 现值 26.63。
  - S0 拒绝不再改写继续目标（删去改写与该路径的专用标签计算，重新验证走 `verify()` 已有的 `denied` 分支；W3、W9），从 `in_review` 选“验收但不合并”改为先按 `branch_only` seal 并写分支（复用已有路径；W3），验收面板的后果说明、其余转移照写 `label`、`decisions.payload` 中的 `integrate`、依赖“满足”的定义、阶段工具集的已知限制、键位去重、M2 标记与复述改引用，按 WBS 行逐项不足 0.01，计 0。W9 现值 10.91 不变。
  - `14` §14.3.4 角色容量表的 Agent 与桌面两行此前停在第 58 轮的值（第 59 轮漏改，R60-D14-01），本轮一并更正；lint 新增 (C) 核对该表。

  分配：Agent +0.02、系统 0、桌面 0、设计 0、安全 0；**没有落在系统线上的增量**，不需按 ADR-136 改派。角色合计：Agent 26.50、系统 26.35、桌面 27.72、设计 28.51、安全 13.57（合计 122.65）。冻结前所需：Agent 26.10 × 1.1 = 28.71，系统、桌面、设计、安全不变（28.88、28.51、28.06、14.38，安全按 0.5 人计为 28.76）；`14` §14.3.4 的加法式为 28.71 + 28.88 + 28.51 + 28.06 + 14.38 = 128.54（T = 130.54 / 5.5 = 23.73）。依赖链按第 57 轮统一的口径：W9b = 6.5 + (10.91 − 10.7) = 6.71，链长 3.9 + 3.9 + 4.4 + 6.71 + 1.0 = **19.91** 工作周，仍远短于 28.88。**M1 维持 38 周**（第 34 周末冻结，2027-07-02；退出 2027-07-30）；余量：系统 **0.12**（0.125，不变）、Agent 0.29、桌面 0.49、设计 0.94、安全 0.24 工作周，均为正。下一次落在系统线上超过约 0.11 人周（未含 QA）的增量须改派或顺延。增 1 人方案仍为 33 周（T ≥ 23.73 工作周，安全线 0.5 人完成约 11.87 人周，新人承担约 2.51 人周安全线工作）。

- **第 61 轮补记（ADR-133 附）**：第 61 轮相对第 60 轮的增量（ADR-189）按 WBS 行去重后净增 **+0.04 人周**（WBS 122.69）。每条都是一行规则、一条守卫或一组用例，按 WBS 行的主责线计入：
  - W6 +0.02（Agent）：Host 以 `excludeTools` 移出白名单之外的 Pi 内置工具、`running` 阶段显式设置内置工具（0.01）；SDK 的 `commandContextActions` 拒绝会改变会话的五个动作（0.01）。W6 现值 9.17。W7 SP6b +0.01（Agent）：G46(bg)，现值 5.07 人周；W7 现值 26.64。
  - W15 +0.01（桌面）：M1 验收先 seal 并写分支，失败时不验收、留在 `in_review`；从 `accepted` 归档前核对分支。W15 现值 0.85。
  - 门禁把白名单之外的内置工具按硬底线 forbid（W10）、`prepare_failed` 来源 `running` 的登记与卡片文案、线框按键提示、M2 标记与已知限制的说明，按 WBS 行逐项不足 0.01，计 0。W9 现值 10.91 不变。

  分配：Agent +0.03、系统 0、桌面 +0.01、设计 0、安全 0；**没有落在系统线上的增量**，不需按 ADR-136 改派。角色合计：Agent 26.53、系统 26.35、桌面 27.73、设计 28.51、安全 13.57（合计 122.69）。冻结前所需：Agent 26.13 × 1.1 = 28.743 → 28.74，桌面 25.93 × 1.1 = 28.523 → 28.52，系统、设计、安全不变（28.88、28.06、14.38，安全按 0.5 人计为 28.76）；`14` §14.3.4 的加法式为 28.74 + 28.88 + 28.52 + 28.06 + 14.38 = 128.58（T = 130.58 / 5.5 = 23.74）。依赖链按第 57 轮统一的口径：W9b = 6.5 + (10.91 − 10.7) = 6.71，链长 3.9 + 3.9 + 4.4 + 6.71 + 1.0 = **19.91** 工作周，仍远短于 28.88。**M1 维持 38 周**（第 34 周末冻结，2027-07-02；退出 2027-07-30）；余量：系统 **0.12**（0.125，不变）、Agent 0.26、桌面 0.48、设计 0.94、安全 0.24 工作周，均为正。下一次落在系统线上超过约 0.11 人周（未含 QA）的增量须改派或顺延。增 1 人方案仍为 33 周（T ≥ 23.74 工作周，安全线 0.5 人完成约 11.87 人周，新人承担约 2.51 人周安全线工作；23.74 + 2 = 25.74 → 26 个工作周）。

- **第 62 轮补记（ADR-133 附）**：第 62 轮相对第 61 轮的增量（ADR-190）按 WBS 行去重后净增 **+0.01 人周**（WBS 122.70）。一条守卫与一处顺序，按 WBS 行的主责线计入：
  - W15 +0.01（桌面）：M1 验收的写后窗口按 `10` §10.6 “未提交的写入”一行复用 Tower 自己未提交写入的分支；M1 中验收延续回到 `accepted` 前先写分支，另开 `-v<k>` 或写入失败时不延续。W15 现值 0.86。
  - G46(bg)(3) 补的两组复用该组已有的夹具（W7 SP6b）、`builtin:` 来源允许表与 C28a 对照组的断言（W10、W6）、人写文字不经命令分派与 Host 记录未处理的拒绝（W6）、验收失败行的字形、`prepare_failed` 重试说明与复述改引用，按 WBS 行逐项不足 0.01，计 0；RPC 下 Run 中途会话改变的规则属 M2，不进 M1 的 WBS。W6 现值 9.17、W7 现值 26.64、W9 现值 10.91 不变。

  分配：Agent 0、系统 0、桌面 +0.01、设计 0、安全 0；**没有落在系统线上的增量**，不需按 ADR-136 改派。角色合计：Agent 26.53、系统 26.35、桌面 27.74、设计 28.51、安全 13.57（合计 122.70）。冻结前所需：桌面 25.94 × 1.1 = 28.534 → 28.53，Agent、系统、设计、安全不变（28.74、28.88、28.06、14.38，安全按 0.5 人计为 28.76）；`14` §14.3.4 的加法式为 28.74 + 28.88 + 28.53 + 28.06 + 14.38 = 128.59（T = 130.59 / 5.5 = 23.74）。依赖链按第 57 轮统一的口径：W9b = 6.5 + (10.91 − 10.7) = 6.71，链长 3.9 + 3.9 + 4.4 + 6.71 + 1.0 = **19.91** 工作周，仍远短于 28.88。**M1 维持 38 周**（第 34 周末冻结，2027-07-02；退出 2027-07-30）；余量：系统 **0.12**（0.125，不变）、Agent 0.26、桌面 0.47、设计 0.94、安全 0.24 工作周，均为正。下一次落在系统线上超过约 0.11 人周（未含 QA）的增量须改派或顺延。增 1 人方案仍为 33 周（T ≥ 23.74 工作周，安全线 0.5 人完成约 11.87 人周，新人承担约 2.51 人周安全线工作；23.74 + 2 = 25.74 → 26 个工作周）。

- **第 63 轮补记（ADR-133 附）**：第 63 轮相对第 62 轮的增量（ADR-191）按 WBS 行去重后净增 **0 人周**（WBS 122.70）。以简化与删除为主，按 WBS 行的主责线计入：
  - W15 0（桌面）：`10` §10.6 重新 seal 表的“未提交的写入”一行与“B 的顶端 == P”一行合为一条按 sha 的识别规则（Tower 自己的 seal），同树时复用、CAS 失败后重读 B；规则比原来更少，不增工时。W15 现值 0.86。
  - G46(bg)(3) 补的组复用该组已有的夹具（W7 SP6b）、诊断视图 300 ms 的预算行与 CI 场景 P9（W18，复用已有的夹具与打点）、去重键与键位登记、`E_INTERNAL` 的 `detail` 步骤码、字形与延续文案，按 WBS 行逐项不足 0.01，计 0；`05` §5.4.5 的 M2 判别规则删除（改为 M2 的设计要求）、评审积压阻止模式补 M2 标记（W13 的 M1 范围本来只有积压提示），都不进 M1 的 WBS。W6 现值 9.17、W7 现值 26.64、W9 现值 10.91 不变。

  分配：Agent 0、系统 0、桌面 0、设计 0、安全 0；**没有落在系统线上的增量**，不需按 ADR-136 改派。角色合计：Agent 26.53、系统 26.35、桌面 27.74、设计 28.51、安全 13.57（合计 122.70）。冻结前所需不变：Agent 28.74、系统 28.88、桌面 28.53、设计 28.06、安全 14.38（按 0.5 人计为 28.76）；`14` §14.3.4 的加法式为 28.74 + 28.88 + 28.53 + 28.06 + 14.38 = 128.59（T = 130.59 / 5.5 = 23.74）。依赖链按第 57 轮统一的口径：W9b = 6.5 + (10.91 − 10.7) = 6.71，链长 3.9 + 3.9 + 4.4 + 6.71 + 1.0 = **19.91** 工作周，仍远短于 28.88。**M1 维持 38 周**（第 34 周末冻结，2027-07-02；退出 2027-07-30）；余量：系统 **0.12**（0.125，不变）、Agent 0.26、桌面 0.47、设计 0.94、安全 0.24 工作周，均为正。下一次落在系统线上超过约 0.11 人周（未含 QA）的增量须改派或顺延。增 1 人方案仍为 33 周（T ≥ 23.74 工作周，安全线 0.5 人完成约 11.87 人周，新人承担约 2.51 人周安全线工作；23.74 + 2 = 25.74 → 26 个工作周）。

- **第 64 轮补记（ADR-133 附）**：第 64 轮相对第 63 轮的增量（ADR-192）按 WBS 行去重后净增 **+0.04 人周**（WBS 122.74）。一条识别规则的签名版、一条检出守卫与一个删除条件，按 WBS 行的主责线计入：
  - W15 +0.04（桌面）：签名在用户仓库上下文以影子 seal 为模板生成并校验、识别规则去掉签名头后比对、`integration.performed.sha` 记写进用户分支的 sha（0.02）；写入、快进与删除分支前的检出守卫与 `goal.accept{newBranch}` 出路（0.01）；归档删除与“清理 Tower 引用”的删除条件、不删 `refs/tower/_owner`（0.01）。W15 现值 0.90。
  - G40 与 G46(bg)(3) 补的组复用已有的夹具（W7 SP6b）、设置树的清理项（W17）、revert 草案分支名、`steer` 的措辞、`backlog` 文案、P 编号说明与 lint (M) 的一项、登记与复述改引用，按 WBS 行逐项不足 0.01，计 0。W6 现值 9.17、W7 现值 26.64、W9 现值 10.91 不变。

  分配：Agent 0、系统 0、桌面 +0.04、设计 0、安全 0；**没有落在系统线上的增量**，不需按 ADR-136 改派。角色合计：Agent 26.53、系统 26.35、桌面 27.78、设计 28.51、安全 13.57（合计 122.74）。冻结前所需：桌面 25.98 × 1.1 = 28.578 → 28.58，Agent、系统、设计、安全不变（28.74、28.88、28.06、14.38，安全按 0.5 人计为 28.76）；`14` §14.3.4 的加法式为 28.74 + 28.88 + 28.58 + 28.06 + 14.38 = 128.64（T = 130.64 / 5.5 = 23.75）。依赖链按第 57 轮统一的口径：W9b = 6.5 + (10.91 − 10.7) = 6.71，链长 3.9 + 3.9 + 4.4 + 6.71 + 1.0 = **19.91** 工作周（W15 不在链上），仍远短于 28.88。**M1 维持 38 周**（第 34 周末冻结，2027-07-02；退出 2027-07-30）；余量：系统 **0.12**（0.125，不变）、Agent 0.26、桌面 0.42、设计 0.94、安全 0.24 工作周，均为正。下一次落在系统线上超过约 0.11 人周（未含 QA）的增量须改派或顺延。增 1 人方案仍为 33 周（T ≥ 23.75 工作周，安全线 0.5 人完成约 11.88 人周（11.875），新人承担约 2.51 人周安全线工作（2.505）；23.75 + 2 = 25.75 → 26 个工作周）。

- **第 65 轮补记（ADR-133 附）**：第 65 轮相对第 64 轮的增量（ADR-193）按 WBS 行去重后净增 **−0.02 人周**（WBS 122.72）。以缩小 Tower 写用户仓库的范围关闭，按 WBS 行的主责线计入：
  - W15 −0.02（桌面）：签名推迟到 M2，删去在用户仓库上下文以影子 seal 为模板生成并校验签名提交、去掉签名头比对与“写进用户分支的 sha”口径（−0.02）；撤销合入时在用户仓库生成撤销提交与草案分支推迟到 M2，M1 只记状态并写出做法（−0.01）；写入与删除前读取各工作树进行中操作状态文件的守卫与 `repo_busy` 出路（+0.01）。W15 现值 0.88。
  - `commit.gpgSign` 为真时的一行说明、复用时不写“已更新本地分支”、`newBranch` 的说明、“验收但不合并而归档”的措辞、存储面板名称（W17）、清理的一个原因、G40 与 G46(bg)(3) 的组（复用已有夹具，W7 SP6b）、lint (z′) 的一节与 Pi 引用行号，按 WBS 行逐项不足 0.01，计 0。W6 现值 9.17、W7 现值 26.64、W9 现值 10.91 不变。

  分配：Agent 0、系统 0、桌面 −0.02、设计 0、安全 0；**没有落在系统线上的增量**，不需按 ADR-136 改派。角色合计：Agent 26.53、系统 26.35、桌面 27.76、设计 28.51、安全 13.57（合计 122.72）。冻结前所需：桌面 25.96 × 1.1 = 28.556 → 28.56，Agent、系统、设计、安全不变（28.74、28.88、28.06、14.38，安全按 0.5 人计为 28.76）；`14` §14.3.4 的加法式为 28.74 + 28.88 + 28.56 + 28.06 + 14.38 = 128.62（T = 130.62 / 5.5 = 23.75）。依赖链按第 57 轮统一的口径：W9b = 6.5 + (10.91 − 10.7) = 6.71，链长 3.9 + 3.9 + 4.4 + 6.71 + 1.0 = **19.91** 工作周（W15 不在链上），仍远短于 28.88。**M1 维持 38 周**（第 34 周末冻结，2027-07-02；退出 2027-07-30）；余量：系统 **0.12**（0.125，不变）、Agent 0.26、桌面 0.44、设计 0.94、安全 0.24 工作周，均为正。下一次落在系统线上超过约 0.11 人周（未含 QA）的增量须改派或顺延。增 1 人方案仍为 33 周（T ≥ 23.75 工作周（130.62 / 5.5 = 23.749），安全线 0.5 人完成约 11.88 人周（11.875），新人承担约 2.51 人周安全线工作（2.505）；23.75 + 2 = 25.75 → 26 个工作周）。

- **第 66 轮补记（ADR-133 附）**：第 66 轮相对第 65 轮的增量（ADR-194）按 WBS 行去重后净增 **+0.01 人周**（WBS 122.73）。五条次要条目各在唯一定义处以一两句规则关闭，按 WBS 行的主责线计入：
  - W15 +0.01（桌面）：本次合入的 seal 段——从 seal 沿父提交回溯求 S₁，快进合入的撤销做法写出 `git revert <S₁ 的父>..<seal>`，非祖先合入（squash、人改写后合入）以整段差异的 patch-id 判定。W15 现值 0.89。
  - 进行中操作守卫改为枚举 `<commonDir>/worktrees/*/` 与两个守卫的先后、seal 与 pin ref 保留到影子删除、`03` 表下的通则与进入 `integrated` 时的处理、`integrated` 中不检测外部写入与撤销合入后补一次检测（复用已有的 stat 检查与归因表第 4 行）、徽章与归档文案、`13`/`11`/`07`/`05` 的措辞与引用、G40 与 G46(bg)(3) 的组（复用已有夹具，W7 SP6b），按 WBS 行逐项不足 0.01，计 0；删去放弃的 8 秒撤销条与 `⌘Z`（在 W11/W13 中未单列）不足 0.01，计 0。W6 现值 9.17、W7 现值 26.64、W9 现值 10.91 不变。

  分配：Agent 0、系统 0、桌面 +0.01、设计 0、安全 0；**没有落在系统线上的增量**，不需按 ADR-136 改派。角色合计：Agent 26.53、系统 26.35、桌面 27.77、设计 28.51、安全 13.57（合计 122.73）。冻结前所需：桌面 25.97 × 1.1 = 28.567 → 28.57，Agent、系统、设计、安全不变（28.74、28.88、28.06、14.38，安全按 0.5 人计为 28.76）；`14` §14.3.4 的加法式为 28.74 + 28.88 + 28.57 + 28.06 + 14.38 = 128.63（T = 130.63 / 5.5 = 23.75）。依赖链按第 57 轮统一的口径：W9b = 6.5 + (10.91 − 10.7) = 6.71，链长 3.9 + 3.9 + 4.4 + 6.71 + 1.0 = **19.91** 工作周（W15 不在链上），仍远短于 28.88。**M1 维持 38 周**（第 34 周末冻结，2027-07-02；退出 2027-07-30）；余量：系统 **0.12**（0.125，不变）、Agent 0.26、桌面 0.43、设计 0.94、安全 0.24 工作周，均为正。下一次落在系统线上超过约 0.11 人周（未含 QA）的增量须改派或顺延。增 1 人方案仍为 33 周（T ≥ 23.75 工作周（130.63 / 5.5 = 23.751），安全线 0.5 人完成约 11.88 人周（11.875），新人承担约 2.51 人周安全线工作（2.505）；23.75 + 2 = 25.75 → 26 个工作周）。

- **第 67 轮补记（ADR-133 附）**：第 67 轮相对第 66 轮的增量（ADR-195）按 WBS 行去重后净增 **+0.03 人周**（WBS 122.76）。一条重要、七条次要条目各在唯一定义处以一两句规则关闭，按 WBS 行的主责线计入：
  - W15 +0.02（桌面）：一次观测整体处理——先以观测之前已记的 `local_merged` 求出各段再判定、段内较旧的 seal 随段末 seal 处理（+0.01）；从 `paused(*)` 进入 `integrated` 时清空暂停相关字段、丢弃交还意图并在集成摘要中列出、以 `obsolete` 关闭阻塞类条目（+0.01）。W15 现值 0.91。
  - W17 +0.01（设计）：隐私清除的删除范围补全为全部 Tower 自有副本（备份 bundle、镜像中该 Goal 的 ref、共享日志与崩溃转储、重写年度会话归档）与结果列表（用户仓库中的 ref、数据库备份的份数与过期日期、无法删除的副本）；不再写用户仓库（删去按前缀删除分支与 `refs/tower/*` 一步）；删除复用已有例程。W17 现值 1.51。
  - `prunable` 工作树不停写与两行提示、patch-id 已知限制与侧栏文案、审计保留与 T24 的口径、卫星重建期间的临时条件、监视建立时的一次 decisive、`integrated` 中 `contract.amend` 返回 `E_STATE`、续租失败的去向、备份 bundle 保留与清理原因的措辞、G40 与 G46(bg)(3) 的组（复用已有夹具，W7 SP6b），按 WBS 行逐项不足 0.01，计 0。W6 现值 9.17、W7 现值 26.64、W9 现值 10.91 不变。

  分配：Agent 0、系统 0、桌面 +0.02、设计 +0.01、安全 0；**没有落在系统线上的增量**，不需按 ADR-136 改派。角色合计：Agent 26.53、系统 26.35、桌面 27.79、设计 28.52、安全 13.57（合计 122.76）。冻结前所需：桌面 25.99 × 1.1 = 28.589 → 28.59，设计 25.52 × 1.1 = 28.072 → 28.07，Agent、系统、安全不变（28.74、28.88、14.38，安全按 0.5 人计为 28.76）；`14` §14.3.4 的加法式为 28.74 + 28.88 + 28.59 + 28.07 + 14.38 = 128.66（T = 130.66 / 5.5 = 23.76）。依赖链按第 57 轮统一的口径：W9b = 6.5 + (10.91 − 10.7) = 6.71，链长 3.9 + 3.9 + 4.4 + 6.71 + 1.0 = **19.91** 工作周（W15、W17 不在链上），仍远短于 28.88。**M1 维持 38 周**（第 34 周末冻结，2027-07-02；退出 2027-07-30）；余量：系统 **0.12**（0.125，不变）、Agent 0.26、桌面 0.41、设计 0.93、安全 0.24 工作周，均为正。下一次落在系统线上超过约 0.11 人周（未含 QA）的增量须改派或顺延。增 1 人方案仍为 33 周（T ≥ 23.76 工作周（130.66 / 5.5 = 23.756），安全线 0.5 人完成约 11.88 人周（11.878），新人承担约 2.50 人周安全线工作（2.502）；23.76 + 2 = 25.76 → 26 个工作周）。

- **第 68 轮补记（ADR-133 附）**：第 68 轮相对第 67 轮的增量（ADR-196）按 WBS 行去重后净增 **+0.02 人周**（WBS 122.78）。一条重要、三条次要条目各在唯一定义处以一两句规则关闭，按 WBS 行的主责线计入：
  - W17 +0.02（设计）：隐私清除的状态前提（只接受已归档或已放弃的 Goal；`project` / `all` 范围内有非终态 Goal 时整笔 `E_STATE` 并列出）与保留并列出人工编辑、检验检出（+0.01）；数据库内的范围——`decisions` 与 Goal 行墓碑化、其余行按外键顺序删除、`decisions_no_update` 的一处例外及其属性测试（由清除例程的负责人完成，复用 W3 已有夹具）、投影快照与 `recovery/` 的重写、记忆清除改写 Run 目录开场文件（+0.01）。W17 现值 1.53。
  - “删除 Project” 改为引用“清除一个 Project”、按时间删除重放包推迟到 M2、`14` §14.8 团队表按现值重算并纳入 lint (C)、租约提示的主机名分支、`12`/`13`/`09` 的措辞与演算、G46(bg)(3) 的组（复用已有夹具，W7 SP6b），按 WBS 行逐项不足 0.01，计 0。W6 现值 9.17、W7 现值 26.64、W9 现值 10.91 不变。

  分配：Agent 0、系统 0、桌面 0、设计 +0.02、安全 0；**没有落在系统线上的增量**，不需按 ADR-136 改派。角色合计：Agent 26.53、系统 26.35、桌面 27.79、设计 28.54、安全 13.57（合计 122.78）。冻结前所需：设计 25.54 × 1.1 = 28.094 → 28.09，Agent、系统、桌面、安全不变（28.74、28.88、28.59、14.38，安全按 0.5 人计为 28.76）；`14` §14.3.4 的加法式为 28.74 + 28.88 + 28.59 + 28.09 + 14.38 = 128.68（T = 130.68 / 5.5 = 23.76）。依赖链按第 57 轮统一的口径：W9b = 6.5 + (10.91 − 10.7) = 6.71，链长 3.9 + 3.9 + 4.4 + 6.71 + 1.0 = **19.91** 工作周（W17 不在链上），仍远短于 28.88。**M1 维持 38 周**（第 34 周末冻结，2027-07-02；退出 2027-07-30）；余量：系统 **0.12**（0.125，不变）、Agent 0.26、桌面 0.41、设计 0.91、安全 0.24 工作周，均为正。下一次落在系统线上超过约 0.11 人周（未含 QA）的增量须改派或顺延。增 1 人方案仍为 33 周（T ≥ 23.76 工作周（130.68 / 5.5 = 23.760），安全线 0.5 人完成约 11.88 人周（11.880），新人承担约 2.50 人周安全线工作（2.500）；23.76 + 2 = 25.76 → 26 个工作周）。

- **第 69 轮补记（ADR-133 附）**：第 69 轮相对第 68 轮的增量（ADR-197）按 WBS 行去重后净增 **+0.04 人周**（WBS 122.82）。两条重要、六条次要条目与评审结论中的观察各在唯一定义处以一两句规则关闭，按 WBS 行的主责线计入：
  - W17 +0.02（设计）：回退位置中的 `_human`、`_inspect` 在“清除全部”中同样保留并列出、`~/.tower` 不作为整体删除，`privacy.purged` 的载荷、先提交数据库再幂等删除文件的顺序与启动时的续做（+0.01）；来源为该 Goal 的待批准记忆提议随清除删除、搜索索引丢弃、派生副本与载荷哈希的列出、墓碑化只更新尚未墓碑化的行（+0.01）。续做的启动检查由清除例程的负责人一并完成，系统线 0。W17 现值 1.55。
  - W5 +0.01（桌面）：生效额度取当前合同版本与其后 `extend_budget` 决定 payload 的最大值，软上限按跨越触发，G33f。W5 现值 2.01。
  - W10 +0.01（安全）：S2 与验证器沙箱对 `~/.tower/**` 读拒绝的回退位置逐路径例外，SP6a A3 回退位置一组。W10 现值 10.47。
  - 镜像获取加 `--prune`（W7-core 一个参数，复用已有夹具）、删除 `⌘⇧O`、`00` R7 改弱、`08` 最长等待一行与三处小出入、`03`/`04`/`05`/`07`/`10`/`11`/`13`/`16` 的措辞与演算，按 WBS 行逐项不足 0.01，计 0。W6 现值 9.17、W7 现值 26.64、W9 现值 10.91 不变。

  分配：Agent 0、系统 0、桌面 +0.01、设计 +0.02、安全 +0.01；**没有落在系统线上的增量**，不需按 ADR-136 改派。角色合计：Agent 26.53、系统 26.35、桌面 27.80、设计 28.56、安全 13.58（合计 122.82）。冻结前所需：桌面 26.00 × 1.1 = 28.600 → 28.60，设计 25.56 × 1.1 = 28.116 → 28.12，安全 13.08 × 1.1 = 14.388 → 14.39（按 0.5 人计为 28.78），Agent、系统不变（28.74、28.88）；`14` §14.3.4 的加法式为 28.74 + 28.88 + 28.60 + 28.12 + 14.39 = 128.73（T = 130.73 / 5.5 = 23.77）。依赖链按第 57 轮统一的口径：W9b = 6.5 + (10.91 − 10.7) = 6.71，链长 3.9 + 3.9 + 4.4 + 6.71 + 1.0 = **19.91** 工作周（W5、W10、W17 不在链上），仍远短于 28.88。**M1 维持 38 周**（第 34 周末冻结，2027-07-02；退出 2027-07-30）；余量：系统 **0.12**（0.125，不变）、Agent 0.26、桌面 0.40、设计 0.88、安全 0.22 工作周，均为正。下一次落在系统线上超过约 0.11 人周（未含 QA）的增量须改派或顺延。增 1 人方案仍为 33 周（T ≥ 23.77 工作周（130.73 / 5.5 = 23.769），安全线 0.5 人完成约 11.89 人周（11.885），新人承担约 2.51 人周安全线工作（14.39 − 11.885 = 2.505）；23.77 + 2 = 25.77 → 26 个工作周）。

- **第 70 轮补记（ADR-133 附）**：第 70 轮相对第 69 轮的增量（ADR-198）按 WBS 行去重后净增 **+0.04 人周**（WBS 122.86）。一条重要、四条次要条目与评审结论中的观察各在唯一定义处以一两句规则关闭，按 WBS 行的主责线计入：
  - W17 +0.02（设计）：GoalId 在本机不复用——编号高水位文件、分配时跳过已有同名目录与 `refs/tower/<编号>/` 的编号、“清除全部”保留高水位，两种检出的独占新建守卫与 G46 一组（+0.01；编号分配原属 W3 系统线，按 ADR-136 改由清除例程的负责人完成，复用 W3 已有夹具，系统线 0）；`privacy.purged` 的 `roots` 各档都写、`project` 档逐 Goal 的完成事件、“彻底忘记”的改写移到事务之前、`ratify` 聚合条目按剩余对象重算（+0.01）。W17 现值 1.57。
  - W10 +0.01（安全）：回退位置的沙箱例外补全验证器的 `$SH` 与检验检出一组、命令分类器硬底线引用同一例外、违规分类的判定顺序，SP6a A3 三项正向运行。W10 现值 10.48。
  - W5 +0.01（桌面）：修订编辑器预填生效额度、远程边界以修订前的生效额度为比较对象，G33f(d)。W5 现值 2.02。
  - `00` R7 末句、`10` 回退目录名、`12`/`16` 的生效额度口径、`08` `ratify` 的一个出口、`15` 的排版，按 WBS 行逐项不足 0.01，计 0。W6 现值 9.17、W7 现值 26.64、W9 现值 10.91 不变。

  分配：Agent 0、系统 0、桌面 +0.01、设计 +0.02、安全 +0.01；**没有落在系统线上的增量**（编号分配已按 ADR-136 改派设计线）。角色合计：Agent 26.53、系统 26.35、桌面 27.81、设计 28.58、安全 13.59（合计 122.86）。冻结前所需：桌面 26.01 × 1.1 = 28.611 → 28.61，设计 25.58 × 1.1 = 28.138 → 28.14，安全 13.09 × 1.1 = 14.399 → 14.40（按 0.5 人计为 28.80），Agent、系统不变（28.74、28.88）；`14` §14.3.4 的加法式为 28.74 + 28.88 + 28.61 + 28.14 + 14.40 = 128.77（T = 130.77 / 5.5 = 23.78）。依赖链按第 57 轮统一的口径：W9b = 6.5 + (10.91 − 10.7) = 6.71，链长 3.9 + 3.9 + 4.4 + 6.71 + 1.0 = **19.91** 工作周（W5、W10、W17 不在链上），仍远短于 28.88。**M1 维持 38 周**（第 34 周末冻结，2027-07-02；退出 2027-07-30）；余量：系统 **0.12**（0.125，不变）、Agent 0.26、桌面 0.39、设计 0.86、安全 0.20 工作周，均为正。下一次落在系统线上超过约 0.11 人周（未含 QA）的增量须改派或顺延。增 1 人方案仍为 33 周（T ≥ 23.78 工作周（130.77 / 5.5 = 23.776），安全线 0.5 人完成约 11.89 人周（0.5 × 23.78），新人承担约 2.51 人周安全线工作（14.40 − 11.89 = 2.51）；23.78 + 2 = 25.78 → 26 个工作周）。

- **第 71 轮补记（ADR-133 附）**：第 71 轮相对第 70 轮的增量（ADR-199）按 WBS 行去重后净增 **+0.03 人周**（WBS 122.89）。三条次要条目与评审结论中的观察各在唯一定义处以一两句规则关闭，按 WBS 行的主责线计入：
  - W5 +0.01（桌面）：`contract.amend` 在服务端以提交时的生效额度补齐 `patch` 未给出的预算字段，`budgetBase` 与生效额度不一致时 `E_CONFLICT`、编辑器重新预填，G33f(e)(f)。W5 现值 2.03。
  - W12 +0.01（桌面）：“我来改”被拒时识别本 Goal 自己的残留、“移到一边并重新开始”与改名后目录的列出、交还与放弃改动先提交事务再删除 H，G46 一组（改名一步原属 W7 系统线，按 ADR-136 改由接管界面的负责人完成，复用 W7 已有夹具，系统线 0）。W12 现值 9.12。
  - W17 +0.01（设计）：“一并删除这些会话”记入 `privacy.purge` 的 `sessionIds` 与同一事务的事件、续做按事件删除，G46 一组。W17 现值 1.58。
  - `02` 编号措辞与高水位无法解析时的处置、`06` 续做按 `seq` 逐条重新判定、`10` 检验临时目录的位置、`11` 一处引用，按 WBS 行逐项不足 0.01，计 0。W6 现值 9.17、W7 现值 26.64、W9 现值 10.91 不变。

  分配：Agent 0、系统 0、桌面 +0.02、设计 +0.01、安全 0；**没有落在系统线上的增量**（改名一步已按 ADR-136 改派桌面线）。角色合计：Agent 26.53、系统 26.35、桌面 27.83、设计 28.59、安全 13.59（合计 122.89）。冻结前所需：桌面 26.03 × 1.1 = 28.633 → 28.63，设计 25.59 × 1.1 = 28.149 → 28.15，Agent、系统、安全不变（28.74、28.88、14.40，安全按 0.5 人计为 28.80）；`14` §14.3.4 的加法式为 28.74 + 28.88 + 28.63 + 28.15 + 14.40 = 128.80（T = 130.80 / 5.5 = 23.78）。依赖链按第 57 轮统一的口径：W9b = 6.5 + (10.91 − 10.7) = 6.71，链长 3.9 + 3.9 + 4.4 + 6.71 + 1.0 = **19.91** 工作周（W5、W17 不在链上，W12 的增量不在 W12b 的 1.0 之内），仍远短于 28.88。**M1 维持 38 周**（第 34 周末冻结，2027-07-02；退出 2027-07-30）；余量：系统 **0.12**（0.125，不变）、Agent 0.26、桌面 0.37、设计 0.85、安全 0.20 工作周，均为正。下一次落在系统线上超过约 0.11 人周（未含 QA）的增量须改派或顺延。增 1 人方案仍为 33 周（T ≥ 23.78 工作周（130.80 / 5.5 = 23.782），安全线 0.5 人完成约 11.89 人周（0.5 × 23.78），新人承担约 2.51 人周安全线工作（14.40 − 11.89 = 2.51）；23.78 + 2 = 25.78 → 26 个工作周）。

- **第 72 轮补记（ADR-133 附）**：第 72 轮相对第 71 轮的增量（ADR-200）按 WBS 行去重后净增 **+0.01 人周**（WBS 122.90）。两条次要条目与评审结论中的观察各在唯一定义处以一句规则关闭，按 WBS 行的主责线计入：
  - W17 +0.01（设计）：“一并删除这些会话”覆盖已移入年度归档包的会话，按“清除一个 Goal”同一方式重写归档包（复用已有的重写例程），G46 一个会话。W17 现值 1.59。
  - `06` §6.1.6 drain 恢复行去掉“Run 未结束”这一触发条件（只少一个条件；G35e(m) 复用 G35e 与 G46 已有夹具）、`10` 检验临时目录在停止服务时删除、删除卫星时保留 `humanCheckout` 为空时的残留、`.kept-` 目录按前缀列出与编号分配跳过、`04` 两处文案、`05` 一处引文，按 WBS 行逐项不足 0.01，计 0。W3、W6（现值 9.17）、W7（现值 26.64）、W9（现值 10.91）不变。

  分配：Agent 0、系统 0、桌面 0、设计 +0.01、安全 0；**没有落在系统线上的增量**。角色合计：Agent 26.53、系统 26.35、桌面 27.83、设计 28.60、安全 13.59（合计 122.90）。冻结前所需：设计 25.60 × 1.1 = 28.16，Agent、系统、桌面、安全不变（28.74、28.88、28.63、14.40，安全按 0.5 人计为 28.80）；`14` §14.3.4 的加法式为 28.74 + 28.88 + 28.63 + 28.16 + 14.40 = 128.81（T = 130.81 / 5.5 = 23.78）。依赖链按第 57 轮统一的口径：W9b = 6.5 + (10.91 − 10.7) = 6.71，链长 3.9 + 3.9 + 4.4 + 6.71 + 1.0 = **19.91** 工作周（W17 不在链上），仍远短于 28.88。**M1 维持 38 周**（第 34 周末冻结，2027-07-02；退出 2027-07-30）；余量：系统 **0.12**（0.125，不变）、Agent 0.26、桌面 0.37、设计 0.84、安全 0.20 工作周，均为正。下一次落在系统线上超过约 0.11 人周（未含 QA）的增量须改派或顺延。增 1 人方案仍为 33 周（T ≥ 23.78 工作周（130.81 / 5.5 = 23.784），安全线 0.5 人完成约 11.89 人周（0.5 × 23.78），新人承担约 2.51 人周安全线工作（14.40 − 11.89 = 2.51）；23.78 + 2 = 25.78 → 26 个工作周）。

- **第 73 轮补记（ADR-133 附）**：第 73 轮相对第 72 轮的增量（ADR-201）按 WBS 行去重后净增 **+0.02 人周**（WBS 122.92）。七条次要条目与评审结论中的观察各在唯一定义处以一两句规则关闭，其中三条以删除或推迟关闭，按 WBS 行的主责线计入：
  - W4 +0.01（桌面）：drain 进行中卫星丢失时先按 drain 恢复行结束 drain、再按叠加态重建，运行时与重启时同一规则，G35e(n)。§6.1.6 恢复表的这一行也可能落在系统线 W3，按 ADR-136 先例由 W4（退出与恢复）的负责人完成，复用 G35e 已有夹具。W4 现值 4.34。
  - W14 +0.01（设计）：运行中因授权凑齐的致命三要素改为在审批卡片的“本 Goal 内同类”选项上当场重算并警告，复用合同的三要素警告组件。W14 现值 2.06。
  - 项目 Pi 配置被改动后不提供“加载”（删去一个选项，改为 `◇` 提示，加载推迟到 M2）、事后检测到 `protected` 写入不再暂停 Run（删去一个暂停分支）、`structured_content_dropped` 与 `bash_overridden`（M2）的注意力登记、`<wtRoot>` 中 Tower 创建的目录归入 `tower_data`（分类表补路径模式，G46(bh) 复用 SP6b 夹具）、重启后终止范围的统一写法、`04` 补 `ready` 源状态，以及评审结论中的观察，按 WBS 行逐项不足 0.01，计 0。W3、W6（现值 9.17）、W7（现值 26.64）、W9（现值 10.91）、W10 不变。

  分配：Agent 0、系统 0、桌面 +0.01、设计 +0.01、安全 0；**没有落在系统线上的增量**。角色合计：Agent 26.53、系统 26.35、桌面 27.84、设计 28.61、安全 13.59（合计 122.92）。冻结前所需：桌面 26.04 × 1.1 = 28.644 → 28.64，设计 25.61 × 1.1 = 28.171 → 28.17，Agent、系统、安全不变（28.74、28.88、14.40，安全按 0.5 人计为 28.80）；`14` §14.3.4 的加法式为 28.74 + 28.88 + 28.64 + 28.17 + 14.40 = 128.83（T = 130.83 / 5.5 = 23.79）。依赖链按第 57 轮统一的口径：W9b = 6.5 + (10.91 − 10.7) = 6.71，链长 3.9 + 3.9 + 4.4 + 6.71 + 1.0 = **19.91** 工作周（W4、W14 不在链上），仍远短于 28.88。**M1 维持 38 周**（第 34 周末冻结，2027-07-02；退出 2027-07-30）；余量：系统 **0.12**（0.125，不变）、Agent 0.26、桌面 0.36、设计 0.83、安全 0.20 工作周，均为正。下一次落在系统线上超过约 0.11 人周（未含 QA）的增量须改派或顺延。增 1 人方案仍为 33 周（T ≥ 23.79 工作周（130.83 / 5.5 = 23.787），安全线 0.5 人完成约 11.90 人周（0.5 × 23.79 = 11.895），新人承担约 2.50 人周安全线工作（14.40 − 11.90 = 2.50）；23.79 + 2 = 25.79 → 26 个工作周）。

- **第 74 轮补记（ADR-133 附）**：第 74 轮相对第 73 轮的增量（ADR-202）按 WBS 行去重后净增 **±0.00 人周**（WBS 122.92）。一条重要条目以推迟关闭（项目扩展、项目包与项目 MCP 服务器推迟到 M2），评审结论中的四条观察各补半句，按 WBS 行的主责线计入：
  - W6（Agent）：Pi 的项目信任恒为假，项目的声明性资源以显式路径传入。枚举复用添加项目时信任提示已有的 base 资源枚举，Host 只多五个选项；同一行删除了 `resolveProjectTrust` 的传递，计 0。W6 现值 9.17。
  - W10（安全）：静态清单不再枚举项目扩展（删除），计 0。
  - `04` 信任提示文案、`00`/README 措辞、G46 (bh) 改写（复用已有夹具）与四条观察，按 WBS 行逐项不足 0.01，计 0。W3、W4（现值 4.34）、W7（现值 26.64）、W9（现值 10.91）不变。

  分配：Agent 0、系统 0、桌面 0、设计 0、安全 0；**没有落在系统线上的增量**。角色合计：Agent 26.53、系统 26.35、桌面 27.84、设计 28.61、安全 13.59（合计 122.92）。冻结前所需不变：Agent 28.74、系统 28.88、桌面 28.64、设计 28.17、安全 14.40（按 0.5 人计为 28.80）；`14` §14.3.4 的加法式为 28.74 + 28.88 + 28.64 + 28.17 + 14.40 = 128.83（T = 130.83 / 5.5 = 23.79）。依赖链按第 57 轮统一的口径：W9b = 6.5 + (10.91 − 10.7) = 6.71，链长 3.9 + 3.9 + 4.4 + 6.71 + 1.0 = **19.91** 工作周，仍远短于 28.88。**M1 维持 38 周**（第 34 周末冻结，2027-07-02；退出 2027-07-30）；余量：系统 **0.12**（0.125，不变）、Agent 0.26、桌面 0.36、设计 0.83、安全 0.20 工作周，均为正。下一次落在系统线上超过约 0.11 人周（未含 QA）的增量须改派或顺延。增 1 人方案仍为 33 周（T ≥ 23.79 工作周，新人承担约 2.50 人周安全线工作；23.79 + 2 = 25.79 → 26 个工作周）。

- **第 75 轮补记（ADR-133 附）**：第 75 轮相对第 74 轮的增量（ADR-203）按 WBS 行去重后净增 **+0.01 人周**（WBS 122.93）。一条次要条目在唯一定义处补名字集合与比较规则，评审结论中的五条观察各补半句，按 WBS 行的主责线计入：
  - W10 +0.01（安全）：上下文文件名按 `16` §16.1.12 的集合与名字比较规则识别。Seatbelt 写拒绝与祖先读允许写成大小写类；上下文文件复核与 `protected` 改为对快照差异按名字规则筛选，复用 `10` §10.1.2 已有的名字比较函数；验收标记引用同一集合；G46 (bh)(3) 复用已有夹具。W10 现值 10.49。
  - W6（Agent）：项目 `SYSTEM.md`/`APPEND_SYSTEM.md` 改以内容经 `systemPromptOverride`/`appendSystemPromptOverride` 传入，同一处改写，计 0。W6 现值 9.17。
  - `09` 一处事实、`04`/`00` 两处文案、复核范围的取舍说明与 M2 备忘，按 WBS 行逐项不足 0.01，计 0。W3、W4（现值 4.34）、W7（现值 26.64）、W9（现值 10.91）不变。

  分配：Agent 0、系统 0、桌面 0、设计 0、安全 +0.01；**没有落在系统线上的增量**。角色合计：Agent 26.53、系统 26.35、桌面 27.84、设计 28.61、安全 13.60（合计 122.93）。冻结前所需：安全 13.10 × 1.1 = 14.41（按 0.5 人计为 28.82），Agent、系统、桌面、设计不变（28.74、28.88、28.64、28.17）；`14` §14.3.4 的加法式为 28.74 + 28.88 + 28.64 + 28.17 + 14.41 = 128.84（T = 130.84 / 5.5 = 23.789 → 23.79）。依赖链按第 57 轮统一的口径：W9b = 6.5 + (10.91 − 10.7) = 6.71，链长 3.9 + 3.9 + 4.4 + 6.71 + 1.0 = **19.91** 工作周（W10 不在链上），仍远短于 28.88。**M1 维持 38 周**（第 34 周末冻结，2027-07-02；退出 2027-07-30）；余量：系统 **0.12**（0.125，不变）、Agent 0.26、桌面 0.36、设计 0.83、安全 0.18 工作周，均为正。下一次落在系统线上超过约 0.11 人周（未含 QA）的增量须改派或顺延。增 1 人方案仍为 33 周（T ≥ 23.79 工作周，安全线 0.5 人完成约 11.90 人周，新人承担约 2.51 人周安全线工作（14.41 − 11.90 = 2.51）；23.79 + 2 = 25.79 → 26 个工作周）。

- **第 76 轮补记（ADR-133 附）**：第 76 轮相对第 75 轮的增量（ADR-204）按 WBS 行去重后净增 **+0.01 人周**（WBS 122.94）。七条次要条目以推广已有的唯一规则、删除一项机制与两句唯一定义关闭，评审结论中的八条观察各补半句，按 WBS 行的主责线计入：
  - W10 +0.01（安全）：`protected` 全部模式与 `07` §7.6.3 路径集合按 `16` §16.1.12 的名字比较规则匹配（复用 `10` §10.1.2 的名字比较函数），信任复核改为对完整差异筛选；`read.pi_resources` 补 Host 枚举的技能 `baseDir`（集合已为 S2 读允许计算）；删除祖先 `.agents/skills` 的记录与重新枚举（抵消一部分）；G46 (bh)(4)(5) 复用已有夹具。W10 现值 10.50。
  - `contextFiles()` 用于导出目标与回退位置的祖先差异（复用“生效上下文”已有的计算）、`engine_crash` 条目时机与“稍后”分区的唯一定义及其引用、`16` 检测器行、`04`/`12` 文案与八条观察，按 WBS 行逐项不足 0.01，计 0。W3、W4（现值 4.34）、W6（现值 9.17）、W7（现值 26.64）、W9（现值 10.91）不变。

  分配：Agent 0、系统 0、桌面 0、设计 0、安全 +0.01；**没有落在系统线上的增量**。角色合计：Agent 26.53、系统 26.35、桌面 27.84、设计 28.61、安全 13.61（合计 122.94）。冻结前所需：安全 13.11 × 1.1 = 14.421 → 14.42（按 0.5 人计为 28.84），Agent、系统、桌面、设计不变（28.74、28.88、28.64、28.17）；`14` §14.3.4 的加法式为 28.74 + 28.88 + 28.64 + 28.17 + 14.42 = 128.85（T = 130.85 / 5.5 = 23.791 → 23.79）。依赖链按第 57 轮统一的口径：W9b = 6.5 + (10.91 − 10.7) = 6.71，链长 3.9 + 3.9 + 4.4 + 6.71 + 1.0 = **19.91** 工作周（W10 不在链上），仍远短于 28.88。**M1 维持 38 周**（第 34 周末冻结，2027-07-02；退出 2027-07-30）；余量：系统 **0.12**（0.125，不变）、Agent 0.26、桌面 0.36、设计 0.83、安全 0.16 工作周，均为正；安全线高于约 0.12 的改派阈值，不按 ADR-136 改派。下一次落在系统线上超过约 0.11 人周（未含 QA）的增量须改派或顺延。增 1 人方案仍为 33 周（T ≥ 23.79 工作周，安全线 0.5 人完成约 11.90 人周，新人承担约 2.52 人周安全线工作（14.42 − 11.90 = 2.52）；23.79 + 2 = 25.79 → 26 个工作周）。

- **第 77 轮补记（ADR-133 附）**：第 77 轮相对第 76 轮的增量（ADR-205）按 WBS 行去重后净增 **+0.01 人周**（WBS 122.95）。五条次要条目以一条守卫、一处唯一定义、推迟一项能力与引用关闭，评审结论中的九条观察各补半句，按 WBS 行的主责线计入：
  - W16 +0.01（设计）：`project.local_files.add` 以 `git check-ignore` 检查路径在用户检出中被忽略，不被忽略时返回 `E_STATE`；每次复制前的重新判定同时复核，不再被忽略的条目这次不复制（复用“不可读或不存在”的通知）；G46 (bh)(6) 复用已有夹具。W16 现值 3.02。
  - `engine_crash` 条目时机改写与启动时不解除已有条目的 `engine_crash`（W4 一条守卫）、`provider_unavailable` 的字形、导出到 AGENTS.md 推迟到 M2（目标改在 base 树上求值）、祖先差异只在 `09` §9.11 定义、lint (w′) 反方向、G43 (r) 与九条观察，按 WBS 行逐项不足 0.01，计 0。W7 中的“多仓库逐仓库回退”（桌面 0.1）属 M3，标为预留，不调减。W3、W4（现值 4.34）、W6（现值 9.17）、W7（现值 26.64）、W9（现值 10.91）、W10（现值 10.50）不变。

  分配：Agent 0、系统 0、桌面 0、设计 +0.01、安全 0；**没有落在系统线上的增量**。角色合计：Agent 26.53、系统 26.35、桌面 27.84、设计 28.62、安全 13.61（合计 122.95）。冻结前所需：设计 25.62 × 1.1 = 28.182 → 28.18，Agent、系统、桌面、安全不变（28.74、28.88、28.64、14.42，安全按 0.5 人计为 28.84）；`14` §14.3.4 的加法式为 28.74 + 28.88 + 28.64 + 28.18 + 14.42 = 128.86（T = 130.86 / 5.5 = 23.793 → 23.79）。依赖链按第 57 轮统一的口径：W9b = 6.5 + (10.91 − 10.7) = 6.71，链长 3.9 + 3.9 + 4.4 + 6.71 + 1.0 = **19.91** 工作周（W16 不在链上），仍远短于 28.88。**M1 维持 38 周**（第 34 周末冻结，2027-07-02；退出 2027-07-30）；余量：系统 **0.12**（0.125，不变）、Agent 0.26、桌面 0.36、设计 0.82、安全 0.16 工作周，均为正；安全线高于约 0.12 的改派阈值，不按 ADR-136 改派。下一次落在系统线上超过约 0.11 人周（未含 QA）的增量须改派或顺延。增 1 人方案仍为 33 周（T ≥ 23.79 工作周，安全线 0.5 人完成约 11.90 人周，新人承担约 2.52 人周安全线工作（14.42 − 11.90 = 2.52）；23.79 + 2 = 25.79 → 26 个工作周）。

- **第 78 轮补记（ADR-133 附）**：第 78 轮相对第 77 轮的增量（ADR-206）按 WBS 行去重后净增 **+0.01 人周**（WBS 122.96）。三条次要条目以一条唯一规则、一行登记与一组测试标注关闭，评审结论中的九条观察各补半句，按 WBS 行的主责线计入：
  - W16 +0.01（设计）：Tower 的每一次快照按路径排除本地文件清单中的全部路径（`10` §10.1.2），复制前改查路径是否在该 Goal 的 base 中被跟踪，`add` 拒绝在 base 中被跟踪的路径；G46 (bh)(6) 新增三组复用已有夹具。排除的落点在 W7-core 的影子 `add`（`:(exclude)` 列表多一组来源），按 ADR-136 改由本地文件清单的负责人完成、复用 W7 已有夹具，系统线 0。W16 现值 3.03。
  - 认证过期（F7）条目在 `08` §8.4、§8.8 的一行登记（沿用已有的子类型 `engine_error`，W13）、`engine_crash` 与启动恢复的措辞、G46 (bg) 的 M2 标注、M1 记忆冲突提示与 `memory.edit` 新建的写明、Pi 引文行号与其余观察，按 WBS 行逐项不足 0.01，计 0。W3、W4（现值 4.34）、W6（现值 9.17）、W7（现值 26.64）、W9（现值 10.91）、W10（现值 10.50）、W13 不变。

  分配：Agent 0、系统 0、桌面 0、设计 +0.01、安全 0；**没有落在系统线上的增量**。角色合计：Agent 26.53、系统 26.35、桌面 27.84、设计 28.63、安全 13.61（合计 122.96）。冻结前所需：设计 25.63 × 1.1 = 28.193 → 28.19，Agent、系统、桌面、安全不变（28.74、28.88、28.64、14.42，安全按 0.5 人计为 28.84）；`14` §14.3.4 的加法式为 28.74 + 28.88 + 28.64 + 28.19 + 14.42 = 128.87（T = 130.87 / 5.5 = 23.794 → 23.79）。依赖链按第 57 轮统一的口径：W9b = 6.5 + (10.91 − 10.7) = 6.71，链长 3.9 + 3.9 + 4.4 + 6.71 + 1.0 = **19.91** 工作周（W16 不在链上），仍远短于 28.88。**M1 维持 38 周**（第 34 周末冻结，2027-07-02；退出 2027-07-30）；余量：系统 **0.12**（0.125，不变）、Agent 0.26、桌面 0.36、设计 0.81、安全 0.16 工作周，均为正；安全线高于约 0.12 的改派阈值，不按 ADR-136 改派。下一次落在系统线上超过约 0.11 人周（未含 QA）的增量须改派或顺延。增 1 人方案仍为 33 周（T ≥ 23.79 工作周，安全线 0.5 人完成约 11.90 人周，新人承担约 2.52 人周安全线工作（14.42 − 11.90 = 2.52）；23.79 + 2 = 25.79 → 26 个工作周）。

- **第 79 轮补记（ADR-133 附）**：第 79 轮相对第 78 轮的增量（ADR-207）按 WBS 行去重后净增 **+0.02 人周**（WBS 122.98）。一条重要、四条次要条目以唯一定义处的改写、一行登记与两组测试关闭，评审结论中的九条观察各补半句，按 WBS 行的主责线计入：
  - W16 +0.01（设计）：本地文件排除集在影子 `add` 之前从影子索引中 `--force-remove`，以 `Tower-Local-Exclude` trailer 记在检查点与 pin 上，I2、`full` 闸口与归因表第 4 行的比较取记录的集合（`10` §10.7.1 第 1 步）；G46 (bh)(6) 第六组复用已有夹具。落点在 W7-core 的影子 `add`，按 ADR-136 改由本地文件清单的负责人完成，系统线 0。W16 现值 3.04。
  - W13 +0.01（设计）：认证预检失败（F7 ②）时以认证过期条目代替 `stalled{prepare_failed}`，只有压缩失败（③）而 Run 正常结束时条目以 `obsolete` 关闭（`08` §8.4、§8.8）。W13 现值 6.89。
  - 快照排除集写进检查点树与 pin 树的唯一定义（文字同步）、`mark_secret` 跳过 base 跟踪该路径的 Goal（复用 ADR-206 的跟踪判定，G46 (bh)(6) 第七组复用夹具）、`provider_unavailable` 的鉴权检查改用 `getAuth`（W6，替换一次调用）、“本 Goal 不适用”推迟到 M2（W11，此前没有单列估计）与九条观察，按 WBS 行逐项不足 0.01，计 0。W3、W4（现值 4.34）、W6（现值 9.17）、W7（现值 26.64）、W9（现值 10.91）、W10（现值 10.50）、W11 不变。

  分配：Agent 0、系统 0、桌面 0、设计 +0.02、安全 0；**没有落在系统线上的增量**。角色合计：Agent 26.53、系统 26.35、桌面 27.84、设计 28.65、安全 13.61（合计 122.98）。冻结前所需：设计 25.65 × 1.1 = 28.215 → 28.22，Agent、系统、桌面、安全不变（28.74、28.88、28.64、14.42，安全按 0.5 人计为 28.84）；`14` §14.3.4 的加法式为 28.74 + 28.88 + 28.64 + 28.22 + 14.42 = 128.90（T = 130.90 / 5.5 = 23.80）。依赖链按第 57 轮统一的口径：W9b = 6.5 + (10.91 − 10.7) = 6.71，链长 3.9 + 3.9 + 4.4 + 6.71 + 1.0 = **19.91** 工作周（W13、W16 不在链上），仍远短于 28.88。**M1 维持 38 周**（第 34 周末冻结，2027-07-02；退出 2027-07-30）；余量：系统 **0.12**（0.125，不变）、Agent 0.26、桌面 0.36、设计 0.78、安全 0.16 工作周，均为正；安全线高于约 0.12 的改派阈值，不按 ADR-136 改派。下一次落在系统线上超过约 0.11 人周（未含 QA）的增量须改派或顺延。增 1 人方案仍为 33 周（T ≥ 23.80 工作周，安全线 0.5 人完成约 11.90 人周，新人承担约 2.52 人周安全线工作（14.42 − 11.90 = 2.52）；23.80 + 2 = 25.80 → 26 个工作周）。

- **第 80 轮补记（ADR-133 附）**：第 80 轮相对第 79 轮的增量（ADR-208）按 WBS 行去重后净增 **+0.04 人周**（WBS 123.02）。十条次要条目以唯一定义处的一句、一条守卫、一个已有字段与一行命令关闭，评审结论中的八条观察各补半句，按 WBS 行的主责线计入：
  - W12 +0.02（设计）：关闭检验的命令 `inspect.close{goalId, modified?}`（停止服务、回收端口、比较与删除或保留目录，产生已登记的 `inspect.closed`）与远程矩阵一行；保留目录后的出口为再次 `inspect.close{modified:"discard"}` 或 `inspect.bring_back`。W12 现值 9.14（设计 7.53）。
  - W13 +0.01（设计）：F7 ② 在 `08` 的 `prepare_failed` 登记、定义与“阻塞类条目不能关闭”判定中的例外，C39 (f)；单向门审批在 `08` §8.3.1 直接为 L4（一条守卫）。W13 现值 6.90。
  - W16 +0.01（设计）：移出本地文件清单后首次收入该路径的检查点把它记入已有的 `mixedPaths`（`10` §10.7.1 第 1 步）；G46 (bh)(6) 第八组复用已有夹具。落点在 W7-core 的检查点写入，按 ADR-136 改由本地文件清单的负责人完成，系统线 0。W16 现值 3.05。
  - 隔离 agentDir 改读用户 agentDir 中的 `auth.json`（W6：与非隔离模式同一次 `ModelRuntime.create`，删去内存存储，计 0）、`⇧V` 按状态显示、`03` 的 M2 标记、交还解除集合改为引用、`14` 用例的改写与 G33f、G36 补进 B4（两组原属 SP6b 的 G1–G38 范围，工时已含在其中，复用已有夹具）、`16` 两处措辞与八条观察，按 WBS 行逐项不足 0.01，计 0。W3、W4（现值 4.34）、W6（现值 9.17）、W7（现值 26.64）、W9（现值 10.91）、W10（现值 10.50）不变。

  分配：Agent 0、系统 0、桌面 0、设计 +0.04、安全 0；**没有落在系统线上的增量**。角色合计：Agent 26.53、系统 26.35、桌面 27.84、设计 28.69、安全 13.61（合计 123.02）。冻结前所需：设计 25.69 × 1.1 = 28.259 → 28.26，Agent、系统、桌面、安全不变（28.74、28.88、28.64、14.42，安全按 0.5 人计为 28.84）；`14` §14.3.4 的加法式为 28.74 + 28.88 + 28.64 + 28.26 + 14.42 = 128.94（T = 130.94 / 5.5 = 23.807 → 23.81）。依赖链按第 57 轮统一的口径：W9b = 6.5 + (10.91 − 10.7) = 6.71，链长 3.9 + 3.9 + 4.4 + 6.71 + 1.0 = **19.91** 工作周（W12、W13、W16 不在链上），仍远短于 28.88。**M1 维持 38 周**（第 34 周末冻结，2027-07-02；退出 2027-07-30）；余量：系统 **0.12**（0.125，不变）、Agent 0.26、桌面 0.36、设计 0.74、安全 0.16 工作周，均为正；安全线高于约 0.12 的改派阈值，不按 ADR-136 改派。下一次落在系统线上超过约 0.11 人周（未含 QA）的增量须改派或顺延。增 1 人方案仍为 33 周（T ≥ 23.81 工作周，安全线 0.5 人完成约 11.91 人周（0.5 × 23.81 = 11.905 → 11.91），新人承担约 2.51 人周安全线工作（14.42 − 11.91 = 2.51）；23.81 + 2 = 25.81 → 26 个工作周）。

- **第 81 轮补记（ADR-133 附）**：第 81 轮相对第 80 轮的增量（ADR-209）按 WBS 行去重后净增 **+0.04 人周**（WBS 123.06）。五条次要条目以唯一定义处的一句改写、一条守卫与一行命令关闭，评审结论中的七条观察各补半句，按 WBS 行的主责线计入：
  - W16 +0.02（设计）：移出清单后首次进入快照的判定回看此前检查点与 pin 已记录的 `Tower-Local-Exclude` trailer，并同时作用于 pin（pin 之前以同一棵树写一个 `safety` 检查点记入已有的 `mixedPaths`，`10` §10.7.1 第 1 步）；G46 (bh)(6) 第八组改写，复用已有夹具。落点在 W7-core 的快照写入，按 ADR-136 改由本地文件清单的负责人完成，系统线 0。首次运行读取 `PI_CODING_AGENT_DIR` 的取值，据此显式传入用户 agentDir 的 `authPath` 与 `modelsPath`（`05` §5.3.6）。W16 现值 3.07。
  - W13 +0.01（设计）：`08` §8.3.4 `routeTick` 的 `overdraw` 守卫（severity 3 或基础级别 L4），单向门审批可透支、不被洪泛压低。W13 现值 6.91。
  - W12 +0.01（设计）：人工编辑面板“运行准备步骤”的命令 `human_checkout.run_prepare`（复用检验检出第 3 步的沙箱档位）与远程矩阵一行。W12 现值 9.15（设计 7.54）。
  - 检验打开期间的条件改写与验收或放弃时的 `inspect.closed`、G33f 与 G32b 的 M2 标记、`11` §11.7.0 投递表一行与七条观察，按 WBS 行逐项不足 0.01，计 0。W3、W4（现值 4.34）、W6（现值 9.17）、W7（现值 26.64）、W9（现值 10.91）、W10（现值 10.50）不变。

  分配：Agent 0、系统 0、桌面 0、设计 +0.04、安全 0；**没有落在系统线上的增量**。角色合计：Agent 26.53、系统 26.35、桌面 27.84、设计 28.73、安全 13.61（合计 123.06）。冻结前所需：设计 25.73 × 1.1 = 28.303 → 28.30，Agent、系统、桌面、安全不变（28.74、28.88、28.64、14.42，安全按 0.5 人计为 28.84）；`14` §14.3.4 的加法式为 28.74 + 28.88 + 28.64 + 28.30 + 14.42 = 128.98（T = 130.98 / 5.5 = 23.814 → 23.81）。依赖链按第 57 轮统一的口径：W9b = 6.5 + (10.91 − 10.7) = 6.71，链长 3.9 + 3.9 + 4.4 + 6.71 + 1.0 = **19.91** 工作周（W12、W13、W16 不在链上），仍远短于 28.88。**M1 维持 38 周**（第 34 周末冻结，2027-07-02；退出 2027-07-30）；余量：系统 **0.12**（0.125，不变）、Agent 0.26、桌面 0.36、设计 0.70、安全 0.16 工作周，均为正；安全线高于约 0.12 的改派阈值，不按 ADR-136 改派。下一次落在系统线上超过约 0.11 人周（未含 QA）的增量须改派或顺延。增 1 人方案仍为 33 周（T ≥ 23.81 工作周，安全线 0.5 人完成约 11.91 人周（0.5 × 23.81 = 11.905 → 11.91），新人承担约 2.51 人周安全线工作（14.42 − 11.91 = 2.51）；23.81 + 2 = 25.81 → 26 个工作周）。
- **第 82 轮补记（ADR-133 附）**：第 82 轮相对第 81 轮的增量（ADR-210）按 WBS 行去重后净增 **+0.01 人周**（WBS 123.07）。重要条目与相关的一条次要条目以删除关闭（准备命令推迟到 M2），检验面板的两个按钮同样删除；其余七条次要条目以唯一定义处的一句改写关闭，评审结论中的观察各补半句或随删除失效，按 WBS 行的主责线计入：
  - W12 −0.01（设计）：人工编辑面板的准备命令 `human_checkout.run_prepare`（第 82 轮删除，推迟到 M2）与远程矩阵一行删除；检验信任提示中的“只复制文件”按钮与 S0 下直接授权再检验的按钮删除（计 0）。W12 现值 9.14（设计 7.53）。
  - W16 +0.02（设计）：用户 agentDir 同样用于非隔离模式的 `agentDir`、静态扩展清单的枚举根与 S2 读允许列表中 Pi 资源的固定部分（`05` §5.3.6；读允许列表一侧只替换路径根，由本行负责人完成，安全线 0）；影子 `info/exclude` 的刷新时机定为卫星创建或重建与每次 Run 开始（`10` §10.1.2；落点在 W7-core，按 ADR-136 由本地文件清单的负责人完成，系统线 0）。W16 现值 3.09。
  - 非回合检查点照常记 `checkpoint.created`、“当前 pin 的检查点”的定义、`in_review` 中 Fact 新鲜度用 pin 记录的 L、`safety` 检查点的 ref 统一、G21/G33d/G35c 的 M2 标注、G46 (bh)(6) 第八组改写（复用已有夹具）与各条观察，按 WBS 行逐项不足 0.01，计 0。W3、W4（现值 4.34）、W6（现值 9.17）、W7（现值 26.64）、W9（现值 10.91）、W10（现值 10.50）、W13（现值 6.91）不变。

  分配：Agent 0、系统 0、桌面 0、设计 +0.01、安全 0；**没有落在系统线与安全线上的增量**。角色合计：Agent 26.53、系统 26.35、桌面 27.84、设计 28.74、安全 13.61（合计 123.07）。冻结前所需：设计 25.74 × 1.1 = 28.314 → 28.31，Agent、系统、桌面、安全不变（28.74、28.88、28.64、14.42，安全按 0.5 人计为 28.84）；`14` §14.3.4 的加法式为 28.74 + 28.88 + 28.64 + 28.31 + 14.42 = 128.99（T = 130.99 / 5.5 = 23.816 → 23.82）。依赖链按第 57 轮统一的口径：W9b = 6.5 + (10.91 − 10.7) = 6.71，链长 3.9 + 3.9 + 4.4 + 6.71 + 1.0 = **19.91** 工作周（W12、W16 不在链上），仍远短于 28.88。**M1 维持 38 周**（第 34 周末冻结，2027-07-02；退出 2027-07-30）；余量：系统 **0.12**（0.125，不变）、Agent 0.26、桌面 0.36、设计 0.69、安全 0.16 工作周，均为正；安全线高于约 0.12 的改派阈值，不按 ADR-136 改派。下一次落在系统线上超过约 0.11 人周（未含 QA）的增量须改派或顺延。增 1 人方案仍为 33 周（T ≥ 23.82 工作周，安全线 0.5 人完成约 11.91 人周（0.5 × 23.82 = 11.91），新人承担约 2.51 人周安全线工作（14.42 − 11.91 = 2.51）；23.82 + 2 = 25.82 → 26 个工作周）。

- **第 83 轮补记（ADR-133 附）**：第 83 轮相对第 82 轮的增量（ADR-211）按 WBS 行去重后净增 **+0.05 人周**（WBS 123.12）。两条重要条目以 Pi 自己的两个环境开关关闭（Host 环境恒设 `PI_OFFLINE=1` 与 `PI_CODING_AGENT_DIR`），七条次要条目以唯一定义处的一句改写、一行登记或删除关闭，评审结论中的观察各补半句，按 WBS 行的主责线计入：
  - W6 +0.02（Agent）：Host 环境的 Pi 运行开关（`05` §5.3.6；agentDir 与存活 Host 不同时重启 Host）、`globalPath` 按本 Run 的 agentDir（§5.3.3）、契约测试 C40。W6 现值 9.19。
  - W10 +0.01（安全）：静态清单把设置中列出而未安装或版本不符的包单列为“未安装”、不加载（`05` §5.10、`11` §11.8.2）；`mcp-auth.json`、`models.json` 补进密钥路径表（`11` §11.3.1）。W10 现值 10.51（安全 7.91）。
  - W13 +0.01（设计）：丢失的人工编辑检出登记为 `stalled` 子类型 `human_checkout_lost`（`08` §8.4、§8.8）。W13 现值 6.92。
  - W16 +0.01（设计）：忽略规则不追溯，`full` 闸口与重置后的影子索引以影子索引此刻收录的树初始化（`10` §10.7.1 第 1 步；落点在 W7-core，按 ADR-136 由本地文件清单的负责人完成，系统线 0）。W16 现值 3.10。
  - settle 的 `agent_bg_done` 不受去重与回合入口只与回合检查点比较、检验带回的 landmark 与 `humanPaths`、评论“未送达”两个按钮删除、回退与分叉与合并队列的 M2 标注、G21 移到 B3（W7 行的补跑现值不变）、G46 (bi)（复用 C40 的夹具）与各条观察，按 WBS 行逐项不足 0.01，计 0。W3、W4（现值 4.34）、W7（现值 26.64）、W9（现值 10.91）、W12（现值 9.14）不变。

  分配：Agent +0.02、系统 0、桌面 0、设计 +0.02、安全 +0.01；**没有落在系统线上的增量**。角色合计：Agent 26.55、系统 26.35、桌面 27.84、设计 28.76、安全 13.62（合计 123.12）。冻结前所需：Agent 26.15 × 1.1 = 28.765 → 28.77，设计 25.76 × 1.1 = 28.336 → 28.34，安全 13.12 × 1.1 = 14.432 → 14.43（按 0.5 人计为 28.86），系统、桌面不变（28.88、28.64）；`14` §14.3.4 的加法式为 28.77 + 28.88 + 28.64 + 28.34 + 14.43 = 129.06（T = 131.06 / 5.5 = 23.829 → 23.83）。依赖链按第 57 轮统一的口径：W9b = 6.5 + (10.91 − 10.7) = 6.71，链长 3.9 + 3.9 + 4.4 + 6.71 + 1.0 = **19.91** 工作周（W6、W10、W13、W16 不在链上），仍远短于 28.88。**M1 维持 38 周**（第 34 周末冻结，2027-07-02；退出 2027-07-30）；余量：系统 **0.12**（0.125，不变）、Agent 0.23、桌面 0.36、设计 0.66、安全 0.14 工作周，均为正；安全线高于约 0.12 的改派阈值，不按 ADR-136 改派（安全线再增 0.02 人周（未含 QA）及以上时余量将低于 0.12，须先改派）。下一次落在系统线上超过约 0.11 人周（未含 QA）的增量须改派或顺延。增 1 人方案仍为 33 周（T ≥ 23.83 工作周，安全线 0.5 人完成约 11.92 人周（0.5 × 23.83 = 11.915 → 11.92），新人承担约 2.51 人周安全线工作（14.43 − 11.92 = 2.51）；23.83 + 2 = 25.83 → 26 个工作周）。

- **第 84 轮补记（ADR-133 附）**：第 84 轮相对第 83 轮的增量（ADR-212）按 WBS 行去重后净增 **+0.03 人周**（WBS 123.15）。独立的隔离 agentDir 推迟到 M2 计负增量，十条次要条目与第 83 轮的部分条目以删除、唯一定义处的一句改写、一条守卫或一行关闭，评审结论中的九条观察各补半句，按 WBS 行的主责线计入：
  - W6 −0.01（Agent）：独立的隔离 agentDir（`~/.tower/pi-agent/`）推迟到 M2（ADR-212）：删去 `isolatedAgentDir` 分支、agentDir 变化时重启 Host 的规则与 C40 的隔离一组，`globalPath` 恒为用户 agentDir；清单确认之前与 `riskTier=high` 只保留已有的 `noExtensions:true`。W6 现值 9.18。
  - W10 +0.01（安全）：静态清单按 Pi 的同一顺序求包目录，含以只读查询求出的包管理器全局根，在那里找到的包同样列出并哈希；C40 与 G46 (bi) 的断言改为“没有安装子进程”（`05` §5.10）。W10 现值 10.52（安全 7.92）。
  - W12 +0.01（设计）：丢失的人工编辑检出在运行中与重启时同一规则，丢失后再次接管不改写 `takeover_from` 与 `takeover_prior_reasons`（`06` §6.1.6、§6.4.3）。落点在 W3 的命令层与 W7-rest，按 ADR-136 由人工编辑检出界面的负责人完成，系统线 0。W12 现值 9.15（设计 7.54）。
  - W16 +0.02（设计）：首次运行按 Pi 的顺序检查 `rg`/`fd` 并提示（`05` §5.3.6）；`checkpoint.created` 的载荷补全为 `checkpoints` 行（`16` §16.1.14；落点在 W3 的投影与 W7-core 的检查点写入，按 ADR-136 由本行负责人完成，系统线 0）。W16 现值 3.12。
  - `bashEnv` 的唯一定义、评论“人关闭”映射到 `comment.edit`、`dropped` 删去人选分支、情形 B 的影子索引初始化与 `07` 伪代码、七个用例从 B3 移到 B4（用例只换批次，W7 行的补跑现值不变）、四处同步与各条观察，按 WBS 行逐项不足 0.01，计 0。W3、W4（现值 4.34）、W7（现值 26.64）、W9（现值 10.91）、W13（现值 6.92）不变。

  分配：Agent −0.01、系统 0、桌面 0、设计 +0.03、安全 +0.01；**没有落在系统线上的增量**。角色合计：Agent 26.54、系统 26.35、桌面 27.84、设计 28.79、安全 13.63（合计 123.15）。冻结前所需：Agent 26.14 × 1.1 = 28.754 → 28.75，设计 25.79 × 1.1 = 28.369 → 28.37，安全 13.13 × 1.1 = 14.443 → 14.44（按 0.5 人计为 28.88），系统、桌面不变（28.88、28.64）；`14` §14.3.4 的加法式为 28.75 + 28.88 + 28.64 + 28.37 + 14.44 = 129.08（T = 131.08 / 5.5 = 23.832 → 23.83）。依赖链按第 57 轮统一的口径：W9b = 6.5 + (10.91 − 10.7) = 6.71，链长 3.9 + 3.9 + 4.4 + 6.71 + 1.0 = **19.91** 工作周（W6、W10、W16 与 W12a 不在链上，W12b 不变），仍远短于 28.88。**M1 维持 38 周**（第 34 周末冻结，2027-07-02；退出 2027-07-30）；余量：系统 **0.12**（0.125，不变）、Agent 0.25、桌面 0.36、设计 0.63、安全 0.12 工作周，均为正；安全线余量降到约 0.12 的改派阈值（29.00 − 28.88 = 0.12），本轮不改派，下一次落在安全线上的增量须先按 ADR-136 改派。下一次落在系统线上超过约 0.11 人周（未含 QA）的增量须改派或顺延。增 1 人方案仍为 33 周（T ≥ 23.83 工作周，安全线 0.5 人完成约 11.92 人周（0.5 × 23.83 = 11.915 → 11.92），新人承担约 2.52 人周安全线工作（14.44 − 11.92 = 2.52）；23.83 + 2 = 25.83 → 26 个工作周）。

- **第 85 轮补记（ADR-133 附）**：第 85 轮相对第 84 轮的增量（ADR-213）按 WBS 行去重后净增 **+0.04 人周**（WBS 123.19）。重要条目以 Host 环境的唯一定义处的一条规则关闭，五条次要条目以删除、唯一定义处的一句改写、一个字段或一行关闭，评审结论中的十一条观察各补半句；系统线与安全线余量都在 0.12 的改派阈值上，落在 W3、W7-core 与 W10 上的部分都按 ADR-136 改派，按 WBS 行的主责线计入：
  - W6 +0.02（Agent）：Host 进程环境与工作目录不引用任何 Agent 可写的位置——角色 A 的包管理器变量只进入 `bashEnv`，Host 的 `PATH` 与包管理器位置变量取首次运行读到的登录 shell 值，工作目录为主目录（`05` §5.3.6）；C40 补环境断言与 Agent 改写 `$GS/npmrc` 的一组，pnpm 的全局根查询不限次数。落点在 W10 的环境白名单，按 ADR-136 由本行负责人完成，安全线 0。W6 现值 9.20。
  - W16 +0.02（设计）：首次运行一并读取登录 shell 的 `PATH` 与包管理器位置变量；静态清单的全局根查询用同一环境、限时 10 s，失败按没有全局根处理；G46 (bj)（`05` §5.10；落点在 W10 的清单，按 ADR-136 由本行负责人完成，安全线 0）。`checkpoint.created` 超过载荷上限的路径集合以内容哈希写入 `artifacts/`，`landmarks` 的写入规则与建立后只追加的两列（`16` §16.1.14、`10` §10.7.1；落点在 W3 的投影与 W7-core 的检查点写入，按 ADR-136 由本行负责人完成，系统线 0）。W16 现值 3.14。
  - 高风险 Goal 的“逐项加回”删除（推迟到 M2）、领域表重建的三处例外（`06` §6.2.1）、`pendingHandBack.returnTo`、`rg`/`fd` 每次 Host 启动重新判定与十一条观察，按 WBS 行逐项不足 0.01，计 0。W3、W4（现值 4.34）、W7（现值 26.64）、W9（现值 10.91）、W10（现值 10.52）、W12（现值 9.15）、W13（现值 6.92）不变。

  分配：Agent +0.02、系统 0、桌面 0、设计 +0.02、安全 0；**没有落在系统线与安全线上的增量**。角色合计：Agent 26.56、系统 26.35、桌面 27.84、设计 28.81、安全 13.63（合计 123.19）。冻结前所需：Agent 26.16 × 1.1 = 28.776 → 28.78，设计 25.81 × 1.1 = 28.391 → 28.39，系统、桌面、安全不变（28.88、28.64、14.44，安全按 0.5 人计为 28.88）；`14` §14.3.4 的加法式为 28.78 + 28.88 + 28.64 + 28.39 + 14.44 = 129.13（T = 131.13 / 5.5 = 23.842 → 23.84）。依赖链按第 57 轮统一的口径：W9b = 6.5 + (10.91 − 10.7) = 6.71，链长 3.9 + 3.9 + 4.4 + 6.71 + 1.0 = **19.91** 工作周（W6、W16 不在链上），仍远短于 28.88。**M1 维持 38 周**（第 34 周末冻结，2027-07-02；退出 2027-07-30）；余量：系统 **0.12**（0.125，不变）、Agent 0.22、桌面 0.36、设计 0.61、安全 0.12 工作周，均为正；系统线与安全线仍在约 0.12 的改派阈值上，下一次落在这两条线上的增量须先按 ADR-136 改派。增 1 人方案仍为 33 周（T ≥ 23.84 工作周，安全线 0.5 人完成约 11.92 人周（0.5 × 23.84 = 11.92），新人承担约 2.52 人周安全线工作（14.44 − 11.92 = 2.52）；23.84 + 2 = 25.84 → 26 个工作周）。

- **第 86 轮补记（ADR-133 附）**：第 86 轮相对第 85 轮的增量（ADR-214）按 WBS 行去重后净增 **+0.07 人周**（WBS 123.26）。重要条目以 MCP 传输工厂的唯一定义处的一句关闭（stdio 服务器的 spawn 工作目录不取卫星，以绝对 `cwd` 或空目录 `~/.tower/mcp-cwd/` 为准），五条次要条目以删除、唯一定义处的一句改写、一条守卫或一条命令关闭，评审结论中的十五条观察各补半句；系统线与安全线余量都在 0.12 的改派阈值上，落在 W3、W7-core 与 W10 上的部分都按 ADR-136 改派，按 WBS 行的主责线计入：
  - W6 +0.02（Agent）：`towerMcpTransport` 求 stdio 服务器的 spawn 工作目录——绝对 `cwd` 照用，其余以空目录 `~/.tower/mcp-cwd/` 为基准，落在 Agent 可写位置之下的不启动，`roots` 仍为卫星（`05` §5.3.5）；C21 补一组，G46 (bk)。落点在 W10 的 MCP 环境白名单，按 ADR-136 由本行负责人完成，安全线 0。W6 现值 9.22。
  - W12 +0.01（设计）：`pending_hand_back` 非空时 `goal.take_over` 返回 `E_STATE`，“我来改”置灰并提示（`06` §6.4.3）。落点在 W3 的命令层，按 ADR-136 由人工编辑检出界面的负责人完成，属 W12a，系统线 0。W12 现值 9.16（设计 7.55）。
  - W16 +0.04（设计）：设置页显示从登录 shell 读到的路径值并提供“重新读取”（`engine.reread_login_shell`，仅本机，`05` §5.3.6），读到的 `PATH` 中没有 Node 时提示；静态清单的全局根查询不另设时限，出错或超出准备时限时不启动 Host（`05` §5.10），C40 补一组；路径集合按内容哈希外置写成通则、扩到另外三个事件（`06` §6.3）。落点在 W10 的清单、W3 的命令层与投影、W7-core 的事件写入，按 ADR-136 由本行负责人完成，安全线与系统线 0。W16 现值 3.18。
  - 领域表重建的四处例外（`06` §6.2.1）、送达后的评论只接受人关闭、`goal.abandon` 的清除列表与十五条观察，按 WBS 行逐项不足 0.01，计 0。W3、W4（现值 4.34）、W7（现值 26.64）、W9（现值 10.91）、W10（现值 10.52）、W13（现值 6.92）不变。

  分配：Agent +0.02、系统 0、桌面 0、设计 +0.05、安全 0；**没有落在系统线与安全线上的增量**。角色合计：Agent 26.58、系统 26.35、桌面 27.84、设计 28.86、安全 13.63（合计 123.26）。冻结前所需：Agent 26.18 × 1.1 = 28.798 → 28.80，设计 25.86 × 1.1 = 28.446 → 28.45，系统、桌面、安全不变（28.88、28.64、14.44，安全按 0.5 人计为 28.88）；`14` §14.3.4 的加法式为 28.80 + 28.88 + 28.64 + 28.45 + 14.44 = 129.21（T = 131.21 / 5.5 = 23.856 → 23.86）。依赖链按第 57 轮统一的口径：W9b = 6.5 + (10.91 − 10.7) = 6.71，链长 3.9 + 3.9 + 4.4 + 6.71 + 1.0 = **19.91** 工作周（W6、W12a、W16 不在链上，W12b 不变），仍远短于 28.88。**M1 维持 38 周**（第 34 周末冻结，2027-07-02；退出 2027-07-30）；余量：系统 **0.12**（0.125，不变）、Agent 0.20、桌面 0.36、设计 0.55、安全 0.12 工作周，均为正；系统线与安全线仍在约 0.12 的改派阈值上，下一次落在这两条线上的增量须先按 ADR-136 改派。增 1 人方案仍为 33 周（T ≥ 23.86 工作周，安全线 0.5 人完成约 11.93 人周（0.5 × 23.86 = 11.93），新人承担约 2.51 人周安全线工作（14.44 − 11.93 = 2.51）；23.86 + 2 = 25.86 → 26 个工作周）。

- **第 87 轮补记（ADR-133 附）**：第 87 轮相对第 86 轮的增量（ADR-215）按 WBS 行去重后净增 **+0.07 人周**（WBS 123.33）。五条次要条目以唯一定义处的一条守卫、一个时限、一句改写或一份清单关闭，第 86 轮部分关闭的 R86-D6-01 随 R87-D6-01 一并关闭，评审结论中的十五条观察各补半句；系统线与安全线余量都在 0.12 的改派阈值上，落在 W3、W4 与 W10 上的部分都按 ADR-136 改派，按 WBS 行的主责线计入：
  - W6 +0.03（Agent）：内置 MCP 的来源自检——已加载的扩展中注册 `/mcp` 的不是 `builtin:mcp` 时不开 Run（`05` §5.3.5）；`~/.tower/mcp-cwd/` 每次 Host 启动前删除并重建，门禁对经 `towerMcpTransport` 启动的 stdio 服务器按其工作目录与 `roots` 解析相对路径（`11` §11.3.4）；C21 与 G46 (bk) 各补一组。落点在 W10 的门禁与 W4 的 Host 启动，按 ADR-136 由本行负责人完成，安全线与桌面线 0。W6 现值 9.25。
  - W12 +0.01（设计）：交还后仍暂停时“我来改”与改写去向的选项置灰，`nested_repo_live` 不勾选删除时提示后果（`03` §3.2.1、`04` §4.6.7）。属 W12a，不在依赖链上。W12 现值 9.17（设计 7.56）。
  - W16 +0.03（设计）：全局根查询自有 60 s 时限并终止子进程，首次运行确认卡的“无法确定”与重试，清单标出注册 `/mcp` 的扩展（`05` §5.10），C40 补一组；领域表重建改为“由事件重放的表”清单加其余一律沿用（`06` §6.2.1）。落点在 W10 的清单与 W3 的投影，按 ADR-136 由本行负责人完成，安全线与系统线 0。W16 现值 3.21。
  - 路径集合通则扩到 `resolvePinHits`、`goal.abandon` 清除 `human_checkout`、`goal.take_over` 守卫在 `03`/`10`/`16` 的同步与十五条观察，按 WBS 行逐项不足 0.01，计 0。W3、W4（现值 4.34）、W7（现值 26.64）、W9（现值 10.91）、W10（现值 10.52）、W13（现值 6.92）不变。

  分配：Agent +0.03、系统 0、桌面 0、设计 +0.04、安全 0；**没有落在系统线与安全线上的增量**。角色合计：Agent 26.61、系统 26.35、桌面 27.84、设计 28.90、安全 13.63（合计 123.33）。冻结前所需：Agent 26.21 × 1.1 = 28.831 → 28.83，设计 25.90 × 1.1 = 28.49，系统、桌面、安全不变（28.88、28.64、14.44，安全按 0.5 人计为 28.88）；`14` §14.3.4 的加法式为 28.83 + 28.88 + 28.64 + 28.49 + 14.44 = 129.28（T = 131.28 / 5.5 = 23.869 → 23.87）。依赖链按第 57 轮统一的口径：W9b = 6.5 + (10.91 − 10.7) = 6.71，链长 3.9 + 3.9 + 4.4 + 6.71 + 1.0 = **19.91** 工作周（W6、W12a、W16 不在链上，W12b 不变），仍远短于 28.88。**M1 维持 38 周**（第 34 周末冻结，2027-07-02；退出 2027-07-30）；余量：系统 **0.12**（0.125，不变）、Agent 0.17、桌面 0.36、设计 0.51、安全 0.12 工作周，均为正；系统线与安全线仍在约 0.12 的改派阈值上，下一次落在这两条线上的增量须先按 ADR-136 改派。增 1 人方案仍为 33 周（T ≥ 23.87 工作周，安全线 0.5 人完成约 11.94 人周（0.5 × 23.87 = 11.935，十进制半进位），新人承担约 2.50 人周安全线工作（14.44 − 11.94 = 2.50）；23.87 + 2 = 25.87 → 26 个工作周）。

- **第 88 轮补记（ADR-133 附）**：第 88 轮相对第 87 轮的增量（ADR-216）按 WBS 行去重后净增 **+0.05 人周**（WBS 123.38）。四条次要条目以唯一定义处的一句改写、一条守卫或两句规则关闭，评审结论中的十四条观察各补半句；系统线与安全线余量都在 0.12 的改派阈值上，落在 W3、W4 与 W10 上的部分都按 ADR-136 改派，按 WBS 行的主责线计入：
  - W6 +0.02（Agent）：每个 Host 进程一个 stdio MCP 空工作目录 `~/.tower/mcp-cwd/<hostId>/`——Host 启动前新建、退出后删除、启动恢复清理残留，从不跨 Host 共享；门禁不以空目录解析相对路径（`11` §11.3.4）；C21 与 G46 (bk) 各补组。落点在 W4 的 Host 启动与退出、W10 的门禁，按 ADR-136 由本行负责人完成，桌面线与安全线 0。W6 现值 9.27。
  - W12 +0.01（设计）：交还后仍暂停时置灰的选项列为两项，`reverify` 模式下 `nested_repo_live` 卡片附转向的文字（`03` §3.2.1、`04` §4.6.7、§4.8.9）。属 W12a，不在依赖链上。W12 现值 9.18（设计 7.57）。
  - W16 +0.02（设计）：重建以字段为粒度合并、墓碑行沿用、写入新库后替换（`06` §6.2.1），G35e 补两组；`claim_on_behalf` 的 `E_STATE` 守卫与 `reverify` 模式下 `resume` 的 `mode` 置换（`06` §6.4.3）；全局根查询在中止准备时终止、首次超时后不再查询（`05` §5.10）。落点在 W3 的投影与命令层、W10 的清单，按 ADR-136 由本行负责人完成，系统线与安全线 0。W16 现值 3.23。
  - 十四条观察（F4b 的入口、`goal.abandon` 从 `running` 放弃、`08`/`16` 的措辞、设置页的卡片位置等），按 WBS 行逐项不足 0.01，计 0。W3、W4（现值 4.34）、W7（现值 26.64）、W9（现值 10.91）、W10（现值 10.52）、W13（现值 6.92）不变。

  分配：Agent +0.02、系统 0、桌面 0、设计 +0.03、安全 0；**没有落在系统线与安全线上的增量**。角色合计：Agent 26.63、系统 26.35、桌面 27.84、设计 28.93、安全 13.63（合计 123.38）。冻结前所需：Agent 26.23 × 1.1 = 28.853 → 28.85，设计 25.93 × 1.1 = 28.523 → 28.52，系统、桌面、安全不变（28.88、28.64、14.44，安全按 0.5 人计为 28.88）；`14` §14.3.4 的加法式为 28.85 + 28.88 + 28.64 + 28.52 + 14.44 = 129.33（T = 131.33 / 5.5 = 23.878 → 23.88）。依赖链按第 57 轮统一的口径：W9b = 6.5 + (10.91 − 10.7) = 6.71，链长 3.9 + 3.9 + 4.4 + 6.71 + 1.0 = **19.91** 工作周（W6、W12a、W16 不在链上，W12b 不变），仍远短于 28.88。**M1 维持 38 周**（第 34 周末冻结，2027-07-02；退出 2027-07-30）；余量：系统 **0.12**（0.125，不变）、Agent 0.15、桌面 0.36、设计 0.48、安全 0.12 工作周，均为正；系统线与安全线仍在约 0.12 的改派阈值上，下一次落在这两条线上的增量须先按 ADR-136 改派。增 1 人方案仍为 33 周（T ≥ 23.88 工作周，安全线 0.5 人完成约 11.94 人周（0.5 × 23.88 = 11.94），新人承担约 2.50 人周安全线工作（14.44 − 11.94 = 2.50）；23.88 + 2 = 25.88 → 26 个工作周）。

- **第 89 轮补记（ADR-133 附）**：第 89 轮相对第 88 轮的增量（ADR-217）按 WBS 行去重后净增 **+0.03 人周**（WBS 123.41）。三条次要条目以唯一定义处的一句改写、一个解码规则或封闭列表中的一项关闭，评审结论中的十二条观察各补半句；系统线与安全线余量都在 0.12 的改派阈值上，落在 W3、W4、W9 与 W10 上的部分都按 ADR-136 改派，按 WBS 行的主责线计入：
  - W6 +0.01（Agent）：门禁以 stdio 服务器实际的工作目录为第二个基准（`05` §5.3.5 求出的绝对、相对或空目录），工作目录是本 Host 空目录时结果仍在其中的不因此 forbid、以 `..` 越出的照常按硬底线判定；相对的 `config.cwd`（含 `..`）落在硬底线之内的不启动；同一 `hostId` 的下一个 Host 进程在上一个进程的目录删除之后才启动（`11` §11.3.4、`05` §5.3.5）；C21 与 G46 (bk) 各补组。落点在 W10 的门禁与 W4 的 Host 启动，按 ADR-136 由本行负责人完成，安全线与桌面线 0。W6 现值 9.28。
  - W16 +0.02（设计）：路径扫描把 `file:` URI 解码后按绝对路径检查（`11` §11.3.4），C21 补一组；归因窗口起点的封闭列表补置换交还选择的 `resume`（`03` §3.2.1），G26c 补失败一支。落点在 W10 的门禁与 W3、W9 的失败去向，按 ADR-136 由本行负责人完成，安全线与系统线 0。W16 现值 3.25。
  - 十二条观察（交接时自检失败的出口、`hostId` 的先后、`bring_back` 期间的 `E_BUSY`、重建中非事件写入的字段与被清除 Goal 的行、界面的置灰提示、Pi 行号等），按 WBS 行逐项不足 0.01，计 0。W3、W4（现值 4.34）、W7（现值 26.64）、W9（现值 10.91）、W10（现值 10.52）、W12（现值 9.18）、W13（现值 6.92）不变。

  分配：Agent +0.01、系统 0、桌面 0、设计 +0.02、安全 0；**没有落在系统线与安全线上的增量**。角色合计：Agent 26.64、系统 26.35、桌面 27.84、设计 28.95、安全 13.63（合计 123.41）。冻结前所需：Agent 26.24 × 1.1 = 28.864 → 28.86，设计 25.95 × 1.1 = 28.545 → 28.55（十进制半进位），系统、桌面、安全不变（28.88、28.64、14.44，安全按 0.5 人计为 28.88）；`14` §14.3.4 的加法式为 28.86 + 28.88 + 28.64 + 28.55 + 14.44 = 129.37（T = 131.37 / 5.5 = 23.885 → 23.89）。依赖链按第 57 轮统一的口径：W9b = 6.5 + (10.91 − 10.7) = 6.71，链长 3.9 + 3.9 + 4.4 + 6.71 + 1.0 = **19.91** 工作周（W6、W16 不在链上，W12b 不变），仍远短于 28.88。**M1 维持 38 周**（第 34 周末冻结，2027-07-02；退出 2027-07-30）；余量：系统 **0.12**（0.125，不变）、Agent 0.14、桌面 0.36、设计 0.45、安全 0.12 工作周，均为正；系统线与安全线仍在约 0.12 的改派阈值上，下一次落在这两条线上的增量须先按 ADR-136 改派。增 1 人方案仍为 33 周（T ≥ 23.89 工作周，安全线 0.5 人完成约 11.95 人周（0.5 × 23.89 = 11.945，十进制半进位），新人承担约 2.49 人周安全线工作（14.44 − 11.95 = 2.49）；23.89 + 2 = 25.89 → 26 个工作周）。

- **第 90 轮补记（ADR-133 附）**：第 90 轮相对第 89 轮的增量（ADR-218）按 WBS 行去重后净增 **+0.03 人周**（WBS 123.44）。三条次要条目以唯一定义处的一句改写或一条共用的守卫关闭，评审结论中的十五条观察各补半句；本轮三条的落点（W10 两条、W3 一条）恰好都在余量为 0.12 的安全线与系统线上，全部按 ADR-136 改派；Agent 线余量 0.14 只高出阈值 0.02，也不加载，按 WBS 行的主责线计入：
  - W16 +0.03（设计）：以本 Host 空目录为基准、仍在其中的结果与回退位置下本 Goal 的卫星工作区不按密钥路径表的 `~/.tower/**` 归 `secrets.access`（`11` §11.3.4 路径检查 (2)）；以 `~` 开头的值按主目录与字面的相对路径各查一次（同处 (1)(3)）；交还与带回共用“写回进行中 → `E_BUSY`”（`06` §6.4.3）；G46 (bk) 与 G31 各补组。落点在 W10 的门禁与 W3 的命令守卫，按 ADR-136 由本行负责人完成，安全线与系统线 0。W16 现值 3.28。
  - 十五条观察（归因窗口起点的旧复述、置换的 `resume` 带 `handBack.mode`、交接时自检失败的副本、`file:` URI 的细节、符号链接与 `..`、相对 `cwd` 的等价写法、先后规则的失败分支、Pi 行号、非事件写入者等），按 WBS 行逐项不足 0.01，计 0。W3、W4（现值 4.34）、W6（现值 9.28）、W7（现值 26.64）、W9（现值 10.91）、W10（现值 10.52）、W12（现值 9.18）、W13（现值 6.92）不变。

  分配：Agent 0、系统 0、桌面 0、设计 +0.03、安全 0；**没有落在系统线与安全线上的增量**。角色合计：Agent 26.64、系统 26.35、桌面 27.84、设计 28.98、安全 13.63（合计 123.44）。冻结前所需：设计 25.98 × 1.1 = 28.578 → 28.58，Agent、系统、桌面、安全不变（28.86、28.88、28.64、14.44，安全按 0.5 人计为 28.88）；`14` §14.3.4 的加法式为 28.86 + 28.88 + 28.64 + 28.58 + 14.44 = 129.40（T = 131.40 / 5.5 = 23.891 → 23.89）。依赖链按第 57 轮统一的口径：W9b = 6.5 + (10.91 − 10.7) = 6.71，链长 3.9 + 3.9 + 4.4 + 6.71 + 1.0 = **19.91** 工作周（W16 不在链上，W12b 不变），仍远短于 28.88。**M1 维持 38 周**（第 34 周末冻结，2027-07-02；退出 2027-07-30）；余量：系统 **0.12**（0.125，不变）、Agent 0.14、桌面 0.36、设计 0.42、安全 0.12 工作周，均为正；安全线余量按已舍入的 14.44 × 2 计（未舍入为 0.114），与历来口径相同；系统线与安全线仍在约 0.12 的改派阈值上，下一次落在这两条线上的增量须先按 ADR-136 改派。增 1 人方案仍为 33 周（T ≥ 23.89 工作周，安全线 0.5 人完成约 11.95 人周（0.5 × 23.89 = 11.945，十进制半进位；未舍入的新人份额约 2.50），新人承担约 2.49 人周安全线工作（14.44 − 11.95 = 2.49）；23.89 + 2 = 25.89 → 26 个工作周）。

- **第 91 轮补记（ADR-133 附）**：第 91 轮相对第 90 轮的增量（ADR-219）按 WBS 行去重后净增 **+0.05 人周**（WBS 123.49）。一条重要条目以唯一定义处的一个求值函数（固定于 v1.2.0 的移植与契约测试）关闭，两条次要条目以一句共用的求值规则与“本进程中”的限定加一个失败出口关闭，评审结论中的十四条观察各补半句；本轮三条的落点（W10 两条、W3 一条）恰好都在余量为 0.12 的安全线与系统线上，全部按 ADR-136 改派；Agent 线余量 0.14 只高出阈值 0.02，D60 的移植虽贴近 W6，也不加载，按 WBS 行的主责线计入：
  - W16 +0.05（设计）：文件工具的分类按 Pi 内置文件工具的同一求法求路径（`11` §11.3.1 求路径；`~`、`file://`、`@`、Unicode 空格与 `read` 的名字变体），由固定于 v1.2.0 的移植实现，C41 与 Pi 逐项比对、D60 登记（0.02）；沙箱外工具路径检查的 (1) 与 (3)(b) 共用“按词法与按操作系统各求一次、取更严格者”（`11` §11.3.4），G46 (bk) 补一组（0.01）；写回进行中限定为本进程中执行，写回失败时还原卫星、退回写回之前的状态并返回 `E_INTERNAL`，还原失败或来源已不存在时保留 `syncing` 而可放弃（`06` §6.4.3），实况行与 G31 各补（0.02）。落点在 W10 的门禁与 W3 的命令守卫，按 ADR-136 由本行负责人完成，安全线与系统线 0。W16 现值 3.33。
  - 十四条观察（写回进行中的命令范围与 `inspect.close`、写回期间的实况行、不含 `/` 的 `~` 值、回退一项的括注、密钥路径表的范围注、“后者”的指代、`00` 的措辞、Pi 措辞与工具到服务器的关联键、空目录删除失败的原因文字、G33 与 G46 的区分力、`04` 两处措辞、M1 性能门槛的 CI 清单、`02` 两处注释），按 WBS 行逐项不足 0.01，计 0。W3、W4（现值 4.34）、W6（现值 9.28）、W7（现值 26.64）、W9（现值 10.91）、W10（现值 10.52）、W12（现值 9.18）、W13（现值 6.92）不变。

  分配：Agent 0、系统 0、桌面 0、设计 +0.05、安全 0；**没有落在系统线与安全线上的增量**。角色合计：Agent 26.64、系统 26.35、桌面 27.84、设计 29.03、安全 13.63（合计 123.49）。冻结前所需：设计 26.03 × 1.1 = 28.633 → 28.63，Agent、系统、桌面、安全不变（28.86、28.88、28.64、14.44，安全按 0.5 人计为 28.88）；`14` §14.3.4 的加法式为 28.86 + 28.88 + 28.64 + 28.63 + 14.44 = 129.45（T = 131.45 / 5.5 = 23.90）。依赖链按第 57 轮统一的口径：W9b = 6.5 + (10.91 − 10.7) = 6.71，链长 3.9 + 3.9 + 4.4 + 6.71 + 1.0 = **19.91** 工作周（W16 不在链上，W12b 不变），仍远短于 28.88。**M1 维持 38 周**（第 34 周末冻结，2027-07-02；退出 2027-07-30）；余量：系统 **0.12**（0.125，不变）、Agent 0.14、桌面 0.36、设计 0.37、安全 0.12 工作周，均为正；安全线余量按已舍入的 14.44 × 2 计（未舍入为 0.114），与历来口径相同；系统线与安全线仍在约 0.12 的改派阈值上，Agent 线在 0.14，下一次落在这三条线上的增量须先按 ADR-136 改派；设计线余量降到 0.37，仍是改派的去处。增 1 人方案仍为 33 周（T ≥ 23.90 工作周，安全线 0.5 人完成约 11.95 人周（0.5 × 23.90 = 11.95；未舍入的新人份额约 2.49），新人承担约 2.49 人周安全线工作（14.44 − 11.95 = 2.49）；23.90 + 2 = 25.90 → 26 个工作周）。

- **第 92 轮补记（ADR-133 附）**：第 92 轮相对第 91 轮的增量（ADR-220）按 WBS 行去重后净增 **+0.16 人周**（WBS 123.65）。三条重要条目以两处结构性改动关闭：文件工具的每次文件操作改在 Goal 的 S2 档位中执行（与沙箱 bash 同一包装），Pi 的 `grep`/`find`/`ls` 从 Tower 删除；写回失败不再留下 `syncing`，还原未完成时转入已有的情形 E 重建。评审结论中的十四条观察各补半句。R92-D11-01 是真实的实现工作（文件辅助进程、三个工具的注入与契约测试，约 0.14 人周），落点在安全线的 W10 与 Agent 线的 W6；两线余量 0.12 与 0.14 都在改派阈值上，系统线（W3 的落点）也是 0.12，全部按 ADR-136 改派。全部改派到设计线会把它的余量压到 0.19，所以按工作性质把辅助进程与 C42 分到负责进程生命周期的桌面线（余量 0.36），其余留在设计线：
  - W4 +0.10（桌面）：每个 Run 一个、在该 Goal 的 S2 档位中启动与终止的文件辅助进程，执行 `ReadOperations`/`EditOperations`/`WriteOperations` 的请求，把沙箱拒绝对应到该文件工具的 `sandbox_violation`（`11` §11.3.1 使用时强制，0.08）；契约测试 C42（0.02）。W4 现值 4.44。
  - W16 +0.05（设计）：三个文件工具以 `customTools` 注入、来源自检扩展到四个工具、`TOWER_BUILTINS` 去掉 `grep`/`find`/`ls`（0.02）；受保护位置按字面与 `realpath` 两种形式比较，G46 两组（0.02）；删除 `rg`/`fd` 的首次运行检测与提示（−0.01）；写回失败不留下 `syncing`、还原未完成时转入情形 E 的重建、来源目录不在时以 T1 重新物化、续写删除前比较来源目录，G31 四组（0.02）。落点在 W6、W10 与 W3，按 ADR-136 由本行负责人完成。W16 现值 3.38。
  - W13 +0.01（设计）：`stalled` 子类型 `write_back_failed` 的去重键与出口分类（`08` §8.4、§8.8）。W13 现值 6.93。
  - 十四条观察（gate 第 3 步的旧复述、`06` 的旧措辞、`E_INTERNAL` 的登记、还原的版本、重试交还的参数、“稍后重试”的按钮清单、写回实况行的先后、`opaque` 的级别、C41 的夹具说明与导出范围、G46 的相对路径一组、性能门槛的两项测量、W16 与 `00` 的措辞、MCP 空目录的原因文字、多仓库目标的 cwd），按 WBS 行逐项不足 0.01，计 0。W3、W6（现值 9.28）、W7（现值 26.64）、W9（现值 10.91）、W10（现值 10.52）、W12（现值 9.18）不变。

  分配：Agent 0、系统 0、桌面 +0.10、设计 +0.06、安全 0；**没有落在系统线、安全线与 Agent 线上的增量**。角色合计：Agent 26.64、系统 26.35、桌面 27.94、设计 29.09、安全 13.63（合计 123.65）。冻结前所需：桌面 26.14 × 1.1 = 28.754 → 28.75，设计 26.09 × 1.1 = 28.699 → 28.70（十进制半进位），Agent、系统、安全不变（28.86、28.88、14.44，安全按 0.5 人计为 28.88）；`14` §14.3.4 的加法式为 28.86 + 28.88 + 28.75 + 28.70 + 14.44 = 129.63（T = 131.63 / 5.5 = 23.933 → 23.93）。依赖链按第 57 轮统一的口径：W9b = 6.5 + (10.91 − 10.7) = 6.71，链长 3.9 + 3.9 + 4.4 + 6.71 + 1.0 = **19.91** 工作周（W4、W13、W16 不在链上，W12b 不变），仍远短于 28.88。**M1 维持 38 周**（第 34 周末冻结，2027-07-02；退出 2027-07-30）；余量：系统 **0.12**（0.125，不变）、Agent 0.14、桌面 0.25、设计 0.30、安全 0.12 工作周，均为正；安全线余量按已舍入的 14.44 × 2 计（未舍入为 0.114），与历来口径相同；系统线与安全线仍在约 0.12 的改派阈值上，Agent 线在 0.14，桌面线与设计线的余量合计由 0.73 降到 0.55，下一次落在任一条线上、超过约 0.2 人周的增量须先评估顺延（见 `14` §14.3.4 结论“下一次增量”）。增 1 人方案仍为 33 周（T ≥ 23.93 工作周，安全线 0.5 人完成约 11.97 人周（0.5 × 23.93 = 11.965，十进制半进位），新人承担约 2.47 人周安全线工作（14.44 − 11.97 = 2.47）；23.93 + 2 = 25.93 → 26 个工作周）。

- **第 93 轮补记（ADR-133 附）**：第 93 轮相对第 92 轮的增量（ADR-221）按 WBS 行去重后净增 **+0.06 人周**（WBS 123.71）。七条次要条目都按“已有限额与已有路径”关闭：文件辅助进程改为每次文件操作一个、在档位中执行的系统命令（内存随之归入已有的进程树预留，不新增内存行），S2 必然拒绝的文件工具访问复用 `hardFloor` 直接 forbid，写回失败处理复用情形 E 的旁路目录与 ADR-199 的 `.kept-<时间>` 命名。落点在安全线的 W10 与系统线的 W3（Agent 线 W6 上只有观察器的一处删除，不足 0.01、计 0；第 94 轮观察 13 改正此前多写的“与 Agent 线的 W6”，与 `14` §14.3.4 增量段及 ADR-221 末段一致），两线余量 0.12 与 Agent 线 0.14 都在改派阈值上，全部按 ADR-136 改派：
  - W4 +0.02（桌面）：辅助进程的单次回复与请求上限 16 MB、每次操作 10 s 超时即杀并等待退出、超出时的工具结果文字，C42 补两组（0.02）；图像类型纯字节判定的移植与比对（0.01）；按 Run 启停与崩溃后的处理不再需要（−0.01）。W4 现值 4.46。
  - W16 +0.03（设计）：S2 必然拒绝的文件工具访问按 forbid、与档位同一份路径数据随 `policy.json` 下发（0.01）；写回失败处理的 ① 经旁路目录物化、③ 先改名保留仍在的卫星、② 还原整个写回集合，删除来源目录之前的比较推广到本进程中的交还与带回，Tower 自动改名保留，G31 两组（0.02）。落点在 W10 与 W3，按 ADR-136 由本行负责人完成。W16 现值 3.41。
  - W13 +0.01（设计）：经批准的调用对批准所列路径的沙箱拒绝只记 severity 1；`write_back_failed` 按事件关闭、出口补放弃 Goal（`08` §8.4、§8.8）。W13 现值 6.94。
  - 观察器复制截断输出之后删除 Pi 的临时文件（一处删除，不足 0.01）与十四条观察（`withFileMutationQueue` 的 `realpath`、前像的读取规则、`autoResizeImages`、降级哨兵的名字、Pi 文档目录、`04` 带回一侧的措辞、`write_back_failed` 的关闭条件、出口与验收组、条目与 ③ 同一事务、重建来源的措辞、带回重建期间、`00` 的措辞、README 与扫描名单、放弃时的询问），按 WBS 行逐项不足 0.01，计 0。W3、W6（现值 9.28）、W7（现值 26.64）、W9（现值 10.91）、W10（现值 10.52）、W12（现值 9.18）不变。

  分配：Agent 0、系统 0、桌面 +0.02、设计 +0.04、安全 0；**没有落在系统线、安全线与 Agent 线上的增量**。角色合计：Agent 26.64、系统 26.35、桌面 27.96、设计 29.13、安全 13.63（合计 123.71）。冻结前所需：桌面 26.16 × 1.1 = 28.776 → 28.78，设计 26.13 × 1.1 = 28.743 → 28.74（十进制半进位），Agent、系统、安全不变（28.86、28.88、14.44，安全按 0.5 人计为 28.88）；`14` §14.3.4 的加法式为 28.86 + 28.88 + 28.78 + 28.74 + 14.44 = 129.70（T = 131.70 / 5.5 = 23.945 → 23.95）。依赖链按第 57 轮统一的口径：W9b = 6.5 + (10.91 − 10.7) = 6.71，链长 3.9 + 3.9 + 4.4 + 6.71 + 1.0 = **19.91** 工作周（W4、W13、W16 不在链上，W12b 不变），仍远短于 28.88。**M1 维持 38 周**（第 34 周末冻结，2027-07-02；退出 2027-07-30）；余量：系统 **0.12**（0.125，不变）、Agent 0.14、桌面 0.22、设计 0.26、安全 0.12 工作周，均为正；安全线余量按已舍入的 14.44 × 2 计（未舍入为 0.114），与历来口径相同。本轮合计 +0.06，低于第 92 轮补记定下的约 0.2 人周的顺延评估线，所以不评估顺延；桌面线与设计线的余量合计由 0.55 降到 0.48，系统线与安全线仍在约 0.12 的改派阈值上，Agent 线在 0.14。增 1 人方案仍为 33 周（T ≥ 23.95 工作周，安全线 0.5 人完成约 11.98 人周（0.5 × 23.95 = 11.975，十进制半进位），新人承担约 2.46 人周安全线工作（14.44 − 11.98 = 2.46）；23.95 + 2 = 25.95 → 26 个工作周）。

- **第 94 轮补记（ADR-133 附）**：第 94 轮相对第 93 轮的增量（ADR-222）按 WBS 行去重后净增 **+0.07 人周**（WBS 123.78）。九条次要条目都按“已有机制、说法改弱为真”关闭：文件辅助进程的开销仿照 git 垫片的“预算 + SP 实测 + 回退”一行，并把一次 `read` 的三次操作合并为一次启动；读取凭据复用 bash 已有的 `secrets.access` 审批卡，不新增信号；写入中途失败与 M1 的反复失败如实写出，不改为临时文件加改名、不扩展 S1；`.kept-*` 并入已有的“人的工作现场”。落点在安全线的 W10、系统线的 W3 与 Agent 线的 W6，三线余量 0.12、0.12、0.14 都在改派阈值上，全部按 ADR-136 改派：
  - W4 +0.03（桌面）：读取合并为一次启动（存在、可读与整份内容由同一个进程交回，`write` 的 `mkdir` 并入写入）与开销预算、回退（0.01）；S0 下 16 MB 上限、写入中途失败的“可能已部分写入”、杀进程组、`ENOENT`/`EACCES` 的对应（0.01）；C42 与 G46 的换链接由测试构建的钩子在分类之后、辅助进程启动之前完成（0.01）。W4 现值 4.49。
  - W16 +0.02（设计）：S2 下文件工具读取凭据照常出 `secrets.access` 审批卡、卡上写明批准也不会让沙箱允许（0.01）；观察器按 `details.fullOutputPath` 与错误文本末尾经校验的路径删除 Pi 的全文文件（0.01）；`syncing` 的 Goal 不触发卫星丢失一行（不足 0.01）。落点在 W10、W6 与 W3，按 ADR-136 由本行负责人完成。W16 现值 3.43。
  - W13 +0.01（设计）：经批准的目标按字面与 `realpath` 两种形式只认相等；`write_back_failed` 随此后的 `goal.resume`/`goal.take_over` 关闭（`08` §8.4）。W13 现值 6.95。
  - W17 +0.01（设计）：清除从不删除四种 `<goalId>.kept-*` 并列出，默认位置与回退位置相同（`09` §9.12.4）。W17 现值 1.60。
  - 十四条观察（进程身份、错误码、`read` 中止、路径数据与基础档、③ 与 ① 的失败分支、交还的求树预算、S0 下的删除、T1 的可达性、改名保留的界面与验收、§10.2 的旧理由、“一律”的范围、`04` 的无条件措辞、补记的落点、`04` 的凭据卡措辞），按 WBS 行逐项不足 0.01，计 0。W3、W6（现值 9.28）、W7（现值 26.64）、W9（现值 10.91）、W10（现值 10.52）、W12（现值 9.18）、W18 不变。

  分配：Agent 0、系统 0、桌面 +0.03、设计 +0.04、安全 0；**没有落在系统线、安全线与 Agent 线上的增量**。角色合计：Agent 26.64、系统 26.35、桌面 27.99、设计 29.17、安全 13.63（合计 123.78）。冻结前所需：桌面 26.19 × 1.1 = 28.809 → 28.81，设计 26.17 × 1.1 = 28.787 → 28.79（十进制半进位），Agent、系统、安全不变（28.86、28.88、14.44，安全按 0.5 人计为 28.88）；`14` §14.3.4 的加法式为 28.86 + 28.88 + 28.81 + 28.79 + 14.44 = 129.78（T = 131.78 / 5.5 = 23.96）。依赖链按第 57 轮统一的口径：W9b = 6.5 + (10.91 − 10.7) = 6.71，链长 3.9 + 3.9 + 4.4 + 6.71 + 1.0 = **19.91** 工作周（W4、W13、W16、W17 不在链上，W12b 不变），仍远短于 28.88。**M1 维持 38 周**（第 34 周末冻结，2027-07-02；退出 2027-07-30）；余量：系统 **0.12**（0.125，不变）、Agent 0.14、桌面 0.19、设计 0.21、安全 0.12 工作周，均为正；安全线余量按已舍入的 14.44 × 2 计（未舍入为 0.114），与历来口径相同。本轮合计 +0.07，低于约 0.2 人周的顺延评估线，所以不评估顺延；桌面线与设计线的余量合计由 0.48 降到 0.40，系统线与安全线仍在约 0.12 的改派阈值上，Agent 线在 0.14。增 1 人方案仍为 33 周（T ≥ 23.96 工作周，安全线 0.5 人完成约 11.98 人周（0.5 × 23.96 = 11.98），新人承担约 2.46 人周安全线工作（14.44 − 11.98 = 2.46）；23.96 + 2 = 25.96 → 26 个工作周）。

- **第 95 轮补记（ADR-133 附）**：第 95 轮相对第 94 轮的增量（ADR-223）按 WBS 行去重后净增 **+0.05 人周**（WBS 123.83）。四条次要条目按“已有机制、说法改弱为真”关闭：硬链接复用 S2 档位已有的写拒绝与 SP6a A3 的“应被拒绝”探测，平台不能保证时复用已有的 S0 与 ADR-022 路径；卫星内的凭据读取复用同一张 `secrets.access` 审批卡；观察器复用 Pi 流式更新中已有的 `details.fullOutputPath`；`write_back_failed` 的“知悉”复用 `needs_you.dismiss`。落点在安全线的 W10 与 Agent 线的 W6，两线余量 0.12、0.14 都在改派阈值上，全部按 ADR-136 改派：
  - W4 +0.02（桌面）：Agent 的 S2 与同范围的沙箱档位拒绝创建硬链接、启动自检的一次探测与未被拒绝时本机不使用 S2 的接线（`11` §11.6.2）。W4 现值 4.51。
  - W16 +0.02（设计）：读取凭据卫星内外同一规则、第 3 条硬底线先于例外、卡上 S2 句子按路径数据加条件，C42 补一组（0.01）；观察器超时与中止时取最后一次流式更新的 `details.fullOutputPath`，复制与删除共用同一次校验（0.01）。落点在 W10 与 W6，按 ADR-136 由本行负责人完成。W16 现值 3.45。
  - W13 +0.01（设计）：`write_back_failed` 的“知悉”为 `needs_you.dismiss` → `informative`，不经出口的事件记 `obsolete`（`08` §8.4、§8.8）。W13 现值 6.96。
  - 十三条观察（按调用的缓存、错误码与上限的落点、回退的按调用语义、情形 E 的触发引用、③ 的部分改名、`syncing` 期间的其他事件、重启清理的顺序与文案、`04` 的两个罕见分支、`保留的目录` 的位置、`12` 的凭据卡措辞、预取的子状态词、设置页的 `.kept-*`、密钥模式的作用范围），按 WBS 行逐项不足 0.01，计 0；SP6a A3 的硬链接一组在 SP6a 已有的天数之内，不计入 WBS。W3、W6（现值 9.28）、W7（现值 26.64）、W9（现值 10.91）、W10（现值 10.52）、W12（现值 9.18）、W17 不变。

  分配：Agent 0、系统 0、桌面 +0.02、设计 +0.03、安全 0；**没有落在系统线、安全线与 Agent 线上的增量**。角色合计：Agent 26.64、系统 26.35、桌面 28.01、设计 29.20、安全 13.63（合计 123.83）。冻结前所需：桌面 26.21 × 1.1 = 28.831 → 28.83，设计 26.20 × 1.1 = 28.82（十进制半进位），Agent、系统、安全不变（28.86、28.88、14.44，安全按 0.5 人计为 28.88）；`14` §14.3.4 的加法式为 28.86 + 28.88 + 28.83 + 28.82 + 14.44 = 129.83（T = 131.83 / 5.5 = 23.969 → 23.97）。依赖链按第 57 轮统一的口径：W9b = 6.5 + (10.91 − 10.7) = 6.71，链长 3.9 + 3.9 + 4.4 + 6.71 + 1.0 = **19.91** 工作周（W4、W13、W16 不在链上，W12b 不变），仍远短于 28.88。**M1 维持 38 周**（第 34 周末冻结，2027-07-02；退出 2027-07-30）；余量：系统 **0.12**（0.125，不变）、Agent 0.14、桌面 0.17、设计 0.18、安全 0.12 工作周，均为正；安全线余量按已舍入的 14.44 × 2 计（未舍入为 0.114），与历来口径相同。本轮合计 +0.05，低于约 0.2 人周的顺延评估线，所以不评估顺延；桌面线与设计线的余量合计由 0.40 降到 0.35，系统线与安全线仍在约 0.12 的改派阈值上，Agent 线在 0.14。增 1 人方案仍为 33 周（T ≥ 23.97 工作周，安全线 0.5 人完成约 11.99 人周（0.5 × 23.97 = 11.985，十进制半进位），新人承担约 2.45 人周安全线工作（14.44 − 11.99 = 2.45）；23.97 + 2 = 25.97 → 26 个工作周）。

- **第 96 轮补记（ADR-133 附）**：第 96 轮相对第 95 轮的增量（ADR-224）按 WBS 行去重后净增 **+0.10 人周**（WBS 123.93）。一条重要条目与五条次要条目按“一条结构性规则关闭一类问题”收敛：回退位置下本 Goal 卫星工作区的除外在密钥路径表中定义一次、对一切工具适用；无锚定密钥模式以 Agent 的写允许范围分两侧；每个 Host 进程一个 Tower 拥有的临时目录，复用 stdio MCP 空目录的同一生命周期；两道启动闸门并入单一启动点与准入；情形 E 的另一半复用 Tower 自动改名保留。系统线与安全线余量 0.12 都在改派阈值上，落在 W3、W7-core 与 W10 上的部分全部按 ADR-136 改派；桌面、设计与 Agent 三线各自吸收到改派阈值为止：
  - W4 +0.04（桌面）：安装器安装阶段的档位拒绝创建硬链接与钥匙串查找、启动探测补该档位（0.01）；探测的 10 s 时限、出错或超时即按未能确认拒绝转入 S0，单一启动点与准入检查 h 的启动闸门，清理结束指终止的一轮（0.02）；每个 Host 进程一个临时目录的新建、删除与启动恢复清理，复用 stdio MCP 空目录的实现（0.01）。落点在 W10、W3 与 W4，按 ADR-136 由本行负责人完成。W4 现值 4.55。
  - W6 +0.01（Agent）：Host 环境的 `TMPDIR` 指向本 Host 的临时目录、`bashEnv` 显式设 Agent 的 `TMPDIR`，观察器只按最终 `details` 复制、校验以 Host 的临时目录为准，G46 (bj) 补组；删去流式更新路径与错误文本对照不足 0.01、计 0。W6 现值 9.29。
  - W16 +0.04（设计）：回退位置下本 Goal 卫星工作区的除外扩到一切工具，C42 (f) 与 G46 (bk) 补组（0.01）；无锚定密钥模式在写允许之外处处匹配并编入 S2、CA 证书包允许清单、写允许之内只作分类且跟踪状态取自 base 树（0.02）；情形 E 重建之前改名保留另一半（0.01）。落点在 W10 与 W7-core，按 ADR-136 由本行负责人完成。W16 现值 3.49。
  - W13 +0.01（设计）：启动自检结果翻转时解除 `s0_grant_pending`（`obsolete`）与重算三要素、S0 卡片的自检原因。W13 现值 6.97。
  - 九条观察（`04` 带回一侧的提示、`清理中` 的先后与可用操作、`00` 的硬链接一行与验证失败卡的提示、D61 与 `07` 的措辞、pnpm 的说法、`$VS` 的括注、`16` 的历史行、探测的档位模板），按 WBS 行逐项不足 0.01，计 0；SP6a A3 的新增组在 SP6a 已有的天数之内，不计入 WBS。W3、W7（现值 26.64）、W9（现值 10.91）、W10（现值 10.52）、W12（现值 9.18）、W17 不变。

  分配：Agent +0.01、系统 0、桌面 +0.04、设计 +0.05、安全 0；**没有落在系统线与安全线上的增量**。角色合计：Agent 26.65、系统 26.35、桌面 28.05、设计 29.25、安全 13.63（合计 123.93）。冻结前所需：Agent 26.25 × 1.1 = 28.875 → 28.88，桌面 26.25 × 1.1 = 28.875 → 28.88，设计 26.25 × 1.1 = 28.875 → 28.88（十进制半进位），系统、安全不变（28.88、14.44，安全按 0.5 人计为 28.88）；`14` §14.3.4 的加法式为 28.88 + 28.88 + 28.88 + 28.88 + 14.44 = 129.96（T = 131.96 / 5.5 = 23.993 → 23.99）。依赖链按第 57 轮统一的口径：W9b = 6.5 + (10.91 − 10.7) = 6.71，链长 3.9 + 3.9 + 4.4 + 6.71 + 1.0 = **19.91** 工作周（W4、W6、W13、W16 不在链上，W12b 不变），仍远短于 28.88。**M1 维持 38 周**（第 34 周末冻结，2027-07-02；退出 2027-07-30）；余量：系统 **0.12**（0.125，不变）、Agent 0.12（0.125）、桌面 0.12（0.125）、设计 0.12（0.125）、安全 0.12 工作周，均为正；安全线余量按已舍入的 14.44 × 2 计（未舍入为 0.114），与历来口径相同。本轮合计 +0.10，低于约 0.2 人周的顺延评估线，没有一条线降到改派阈值之下，所以不顺延；但五条线现在都在阈值上，ADR-223 末段所说的显式选择点已到：按 ADR-136 选择**顺延、不执行 ③、⑤**，并预先写明触发条件——此后任何落在 M1 中的增量（按 WBS 行合计 ≥ 0.01 人周）都使 M1 顺延 1 周至 39 周（2027-08-06，第 35 周末冻结，2027-07-09），记入下一条补记（`14` §14.3.4 结论“下一次增量”）。增 1 人方案仍为 33 周（T ≥ 23.99 工作周，安全线 0.5 人完成约 12.00 人周（0.5 × 23.99 = 11.995，十进制半进位），新人承担约 2.44 人周安全线工作（14.44 − 12.00 = 2.44）；23.99 + 2 = 25.99 → 26 个工作周）。

- **第 97 轮补记（ADR-133 附）**：第 97 轮相对第 96 轮的增量（ADR-225）按 WBS 行去重后净增 **+0.04 人周**（WBS 123.97）。五条次要条目都在已有的唯一定义处各加一句关闭：交还与带回的写回集合排除 base 未跟踪的凭据形路径；文件工具与 bash 的路径分类先判第 3 条硬底线；准入在检查 h 的解除事件时重算、只重启 Supervisor 时的终止范围与探测结果的缓存；截断的超时证据如实标注；临时目录清空写法的复述。
  - W4 +0.01（桌面）：准入在本次启动的探测有结果与某 Goal 的重启清理完成时重算，重启清理的终止范围限于 Host 已不存在的 Run，探测结果按本机、开机会话与运行时版本缓存。落点在 W3，由本行负责人完成。W4 现值 4.56。
  - W11 +0.01（桌面）：超时、中止与无退出码且曾被截断的命令日志标为 `截断的输出（尾部）`，证据副本注明全文未保留。W11 现值 7.87（桌面 5.21）。
  - W16 +0.02（设计）：交还与带回的写回集合排除 base 未跟踪的凭据形路径、其中有这类改动的人工编辑检出改名保留，G46 (bl)（0.01）；文件工具与 bash 的路径分类先判第 3 条硬底线、Host 临时目录不出读取凭据卡，G46 (bj) 补组（0.01）。落点在 W12 与 W10，由本行负责人完成。W16 现值 3.51。
  - R97-D15-01 的复述与 G44 (c) 的断言、十一条观察，按 WBS 行逐项不足 0.01，计 0。W3、W6（现值 9.29）、W7（现值 26.64）、W9（现值 10.91）、W10（现值 10.52）、W12（现值 9.18）、W13（现值 6.97）、W17 不变。

  分配：Agent 0、系统 0、桌面 +0.02、设计 +0.02、安全 0；**没有落在系统线、安全线与 Agent 线上的增量**。角色合计：Agent 26.65、系统 26.35、桌面 28.07、设计 29.27、安全 13.63（合计 123.97）。冻结前所需：桌面 26.27 × 1.1 = 28.897 → 28.90，设计 26.27 × 1.1 = 28.897 → 28.90（十进制半进位），Agent、系统、安全不变（28.88、28.88、14.44，安全按 0.5 人计为 28.88）；`14` §14.3.4 的加法式为 28.88 + 28.88 + 28.90 + 28.90 + 14.44 = 130.00（T = 132.00 / 5.5 = 24.00）。依赖链按第 57 轮统一的口径：W9b = 6.5 + (10.91 − 10.7) = 6.71，链长 3.9 + 3.9 + 4.4 + 6.71 + 1.0 = **19.91** 工作周（W4、W11、W16 不在链上），仍远短于 28.90。**按 ADR-224 写定的规则 M1 顺延 1 周至 39 周**（ADR-136：顺延、不执行 ③、⑤）：第 35 周末冻结（2027-07-09），第 36–38 周自用，第 39 周退出评审（2027-08-06），M2 至 2027-11-12；冻结前可用工作周 32.0，扣去 2 周缓冲后各线容量 30.00。余量：系统 **1.12**（1.125）、Agent 1.12（1.125）、桌面 1.10（1.103）、设计 1.10（1.103）、安全 1.12 工作周，均为正；安全线余量按已舍入的 14.44 × 2 计（未舍入为 1.114），与历来口径相同。ADR-224 预设的规则就此用完，此后的增量回到 ADR-136 的常规规则：先在各线余量之内吸收，某条线降到改派阈值之下且无法改派时顺延至少 1 周、按缺口计（`14` §14.3.4 “顺延的执行与下一次增量”）。增 1 人方案仍为 33 周（T ≥ 24.00 工作周，安全线 0.5 人完成约 12.00 人周（0.5 × 24.00 = 12.00），新人承担约 2.44 人周安全线工作（14.44 − 12.00 = 2.44）；24.00 + 2 = 26.00 → 26 个工作周）；它按工作量计、不随基线顺延，且已没有余地：全部工作超过 130.02 人周时为 34 周，届时随该次增量重算。
- **第 98 轮补记（ADR-133 附）**：第 98 轮相对第 97 轮的增量（ADR-226）按 WBS 行去重后净增 **+0.05 人周**（WBS 124.02）。八条次要条目都在已有的唯一定义处各加一句关闭，或把第 97 轮放得过宽的规则收窄：即时投递的启动清理保留存活 Host 的投递、drain 在 Host 存活时续做；Host 退出或挂死之后先终止一轮；准入在检查 d、g 的解除事件时重算；三要素的私有数据不计沙箱外工具、改为一行风险说明；探测缓存键补 Tower 版本与档位模板哈希；写回集合的凭据形排除限定为未被忽略、不在清单中的路径；ADR-038 的〔当前值〕与 S0 原因的复述。
  - W4 +0.03（桌面）：即时投递按 `hostId` 命名并随存活 Host 保留、drain 续做（0.01）；Host 退出或挂死之后的终止一轮（0.01）；准入在检查 d、g 的解除事件时重算（0.01）。落点在 W3 与 W6，由本行负责人完成。W4 现值 4.59。
  - W14 +0.01（设计）：沙箱外工具不计入三要素的私有数据，合同编辑器一行风险说明，触发率表更新，G46 (bm)。W14 现值 2.07。
  - W16 +0.01（设计）：写回集合的凭据形排除限定为未被忽略、不在清单中的路径，交还对话框一行与带回的提示，G46 (bl) 补组。落点在 W12，由本行负责人完成。W16 现值 3.52。
  - 探测缓存键的两项、S0 原因的复述、ADR-038 的〔当前值〕与 lint、`exec` 的拒绝约定与 C12、终止范围的复述与九条观察，按 WBS 行逐项不足 0.01，计 0。W3、W6（现值 9.29）、W7（现值 26.64）、W9（现值 10.91）、W10（现值 10.52）、W11（现值 7.87）、W12（现值 9.18）、W13（现值 6.97）、W17 不变。

  分配：Agent 0、系统 0、桌面 +0.03、设计 +0.02、安全 0；**没有落在系统线、安全线与 Agent 线上的增量**。角色合计：Agent 26.65、系统 26.35、桌面 28.10、设计 29.29、安全 13.63（合计 124.02）。冻结前所需：桌面 26.30 × 1.1 = 28.930 → 28.93，设计 26.29 × 1.1 = 28.919 → 28.92（十进制半进位），Agent、系统、安全不变（28.88、28.88、14.44，安全按 0.5 人计为 28.88）；`14` §14.3.4 的加法式为 28.88 + 28.88 + 28.93 + 28.92 + 14.44 = 130.05（T = 132.05 / 5.5 = 24.009 → 24.01）。依赖链按第 57 轮统一的口径：W9b = 6.5 + (10.91 − 10.7) = 6.71，链长 3.9 + 3.9 + 4.4 + 6.71 + 1.0 = **19.91** 工作周（W4、W14、W16 不在链上），仍远短于 28.93。按 ADR-136 的常规规则在余量之内吸收，**M1 维持 39 周**（第 35 周末冻结，2027-07-09；退出 2027-08-06；M2 至 2027-11-12）；冻结前可用工作周 32.0，各线容量 30.00。余量：系统 **1.12**（1.125）、Agent 1.12（1.125）、桌面 1.07（1.070）、设计 1.08（1.081）、安全 1.12 工作周，均为正，都远高于改派阈值（约 0.12）；安全线余量按已舍入的 14.44 × 2 计（未舍入为 1.114），与历来口径相同。**增 1 人方案由 33 周变为 34 周**（ADR-226）：T ≥ 24.01 工作周，安全线 0.5 人完成约 12.01 人周（0.5 × 24.01 = 12.005，十进制半进位），新人承担约 2.43 人周安全线工作（14.44 − 12.01 = 2.43）；24.01 + 2 = 26.01 → 27 个工作周（第 1–6、9–13、15–30 周）→ 第 30 周末冻结（2027-06-04），至 2027-07-02。第 97 轮写明它已没有余地（超过 130.02 人周即 34 周），本轮的 130.05 越过了这一台阶；取整规则为 T 先按十进制半进位取到 0.01、再加 2 周缓冲向上取整周（R98 观察 7）。下一个台阶是全部工作超过 135.52 人周（35 周）。
- **第 99 轮补记（ADR-133 附）**：第 99 轮相对第 98 轮的增量（ADR-227）按 WBS 行去重后净增 **+0.04 人周**（WBS 124.06）。七条次要条目都在已有的唯一定义处各加一句关闭：Tower 运行中 Host 退出或挂死之后的终止一轮限于该 Host、第一轮完成即移出范围、`清理中` 与 `E_BUSY` 同样适用；云 SDK 凭据以文件提供时总带 `AWS_PROFILE`、配套变量原样传入；不可信内容与对外通信都为真时 `tool.external` 不提供按工具名的授权；人新建的被忽略文件列出并使副本改名保留；M3 的日期、G46 的两处期望与 §6.1.10 的扫描时机。
  - W4 +0.01（桌面）：运行中的终止一轮的范围、结束条件、闸门与准入唤醒，心跳自重新接上时起计与挂死的定义。落点在 W3，由本行负责人完成。W4 现值 4.60。
  - W14 +0.01（设计）：`tool.external` 按工具名授权的条件、编入时的排除 (d)、授权选项上方的风险说明，G46 (bn)。落点在 W10，由本行负责人完成。W14 现值 2.08。
  - W16 +0.02（设计）：云 SDK 凭据总带 `AWS_PROFILE`、配套变量与区域的补齐，D62、C29 与 G46 (d)（0.01）；人新建的被忽略文件在交还对话框中列出并使副本改名保留、凭据形夹具的交还途径，G46 (bl)（0.01）。落点在 W6 与 W12，由本行负责人完成。W16 现值 3.54。
  - M3 的日期与 lint (C)、G46 (bj)(bm)、§6.1.10 的扫描时机与九条观察，按 WBS 行逐项不足 0.01，计 0。W3、W6（现值 9.29）、W7（现值 26.64）、W9（现值 10.91）、W10（现值 10.52）、W11（现值 7.87）、W12（现值 9.18）、W13（现值 6.97）、W17 不变。

  分配：Agent 0、系统 0、桌面 +0.01、设计 +0.03、安全 0；**没有落在系统线、安全线与 Agent 线上的增量**。角色合计：Agent 26.65、系统 26.35、桌面 28.11、设计 29.32、安全 13.63（合计 124.06）。冻结前所需：桌面 26.31 × 1.1 = 28.941 → 28.94，设计 26.32 × 1.1 = 28.952 → 28.95（十进制半进位，设计线成为最长），Agent、系统、安全不变（28.88、28.88、14.44，安全按 0.5 人计为 28.88）；`14` §14.3.4 的加法式为 28.88 + 28.88 + 28.94 + 28.95 + 14.44 = 130.09（T = 132.09 / 5.5 = 24.016 → 24.02）。依赖链按第 57 轮统一的口径：W9b = 6.5 + (10.91 − 10.7) = 6.71，链长 3.9 + 3.9 + 4.4 + 6.71 + 1.0 = **19.91** 工作周（W4、W14、W16 不在链上），仍远短于 28.95。按 ADR-136 的常规规则在余量之内吸收，**M1 维持 39 周**（第 35 周末冻结，2027-07-09；退出 2027-08-06；M2 至 2027-11-12；M3 至 2028-02，即 M2 之后 12–14 周，本轮更正 `14` §14.1 的过期值）；冻结前可用工作周 32.0，各线容量 30.00。余量：系统 **1.12**（1.125）、Agent 1.12（1.125）、桌面 1.06（1.059）、设计 1.05（1.048）、安全 1.12 工作周，均为正，都远高于改派阈值（约 0.12）；安全线余量按已舍入的 14.44 × 2 计（未舍入为 1.114），与历来口径相同。**增 1 人方案仍为 34 周**：T ≥ 24.02 工作周，安全线 0.5 人完成约 12.01 人周（0.5 × 24.02 = 12.01），新人承担约 2.43 人周安全线工作（14.44 − 12.01 = 2.43），并分担四条全职线各约 4.9 人周的非链上工作（R99 观察 8）；24.02 + 2 = 26.02 → 27 个工作周（第 1–6、9–13、15–30 周）→ 第 30 周末冻结（2027-06-04），至 2027-07-02。下一个台阶仍是全部工作超过 135.52 人周（35 周）。
- **第 100 轮补记（ADR-133 附）**：第 100 轮相对第 99 轮的增量（ADR-228）按 WBS 行去重后净增 **+0.02 人周**（WBS 124.08）。重要条目 R100-D13-01 以删除关闭整类：Tower 从不自动删除人工编辑检出与检验目录，删去删除之前的比较、只为副本去留的写回集合判定、“移到一边并重新开始”与 `moveAside`，改为列出与由人删除；五条次要条目各在已有的唯一定义处加一句。
  - W16 −0.01（设计）：删去删除来源目录之前的第二次求树与比较、只为副本去留的凭据形与被忽略新文件判定（−0.02）；AWS 并存时同 Pi、保留的 profile 名、区域按每次 Host 启动判定、非机密变量的值记入密钥库、Azure 与 Cloudflare 的配置变量，G46 (d) 两组（+0.01）。落点在 W6 与 W12，由本行负责人完成。W16 现值 3.53。
  - W17 +0.01（设计）：存储面板列出人的工作现场、`goal.delete_kept` 与“将丢失的内容”确认框、合计超过 10 GB 的提示。落点在 W11 与 W12，由本行负责人完成。W17 现值 1.61。
  - W19 +0.01（设计）：`tool.external` 审批按是否加载 MCP 分层的埋点与 E3 复审线。W19 现值 3.01。
  - W7 +0.01（系统，W7-rest）：Host 退出或挂死之后、终止一轮完成之前存活者的写入归 `agent_bg`，G35c 补组。W7 现值 26.65（系统 14.11）。
  - W12 0（桌面）：删去“移到一边并重新开始”与 `moveAside`（−0.01），再次接管与打开检验时自动改名、Goal 页的 `删除`（+0.01）。挂死计时的起点（W4）、条件成立时的界面说明（W14）、两处复述与九条观察，按 WBS 行逐项不足 0.01，计 0。W3、W4（现值 4.60）、W6（现值 9.29）、W9（现值 10.91）、W10（现值 10.52）、W11（现值 7.87）、W12（现值 9.18）、W13（现值 6.97）、W14（现值 2.08）不变。

  分配：Agent 0、系统 +0.01、桌面 0、设计 +0.01、安全 0；**没有落在 Agent 线、桌面线与安全线上的增量**。角色合计：Agent 26.65、系统 26.36、桌面 28.11、设计 29.33、安全 13.63（合计 124.08）。冻结前所需：系统 26.26 × 1.1 = 28.886 → 28.89，设计 26.33 × 1.1 = 28.963 → 28.96（十进制半进位，设计线仍最长），Agent、桌面、安全不变（28.88、28.94、14.44，安全按 0.5 人计为 28.88）；`14` §14.3.4 的加法式为 28.88 + 28.89 + 28.94 + 28.96 + 14.44 = 130.11（T = 132.11 / 5.5 = 24.020 → 24.02）。依赖链按第 57 轮统一的口径仍为 **19.91** 工作周（W7-rest、W16、W17、W19 不在链上），远短于 28.96。按 ADR-136 的常规规则在余量之内吸收，**M1 维持 39 周**（第 35 周末冻结，2027-07-09；退出 2027-08-06；M2 至 2027-11-12；M3 至 2028-02）；冻结前可用工作周 32.0，各线容量 30.00。余量：系统 1.11（1.114）、Agent 1.12（1.125）、桌面 1.06（1.059）、设计 1.04（1.037）、安全 1.12 工作周，均为正，都远高于改派阈值（约 0.12）。**增 1 人方案仍为 34 周**：T ≥ 24.02 工作周，新人承担约 2.43 人周安全线工作（14.44 − 12.01 = 2.43），并分担四条全职线的非链上工作；24.02 + 2 = 26.02 → 27 个工作周 → 第 30 周末冻结（2027-06-04），至 2027-07-02。下一个台阶仍是全部工作超过 135.52 人周（35 周）。
- **第 101 轮补记（ADR-133 附）**：第 101 轮相对第 100 轮的增量（ADR-229）按 WBS 行去重后净增 **+0.04 人周**（WBS 124.12）。重要条目 R101-D15-01 把 `04` 三处仍写删除的复述改为引用 `10` §10.2；六条次要条目各在已有的唯一定义处加一句或一行。
  - W17 +0.02（设计）：存储提示的呈现、磁盘压力与 F8 的建议先列人的工作现场、阈值改用估计独占大小（0.01）；影子不在时的删除确认框、按 `<wtRoot>` 扫描列出、清除结果的完整路径与 H 的 git 历史不可用的注明，G46 一组（0.01）。落点在 W11、W12 与 W7-rest，由本行负责人完成。W17 现值 1.63。
  - W19 +0.01（设计）：人的工作现场每周的数目与估计独占合计的计量与 E6 复审线、E3 复审线的分母。W19 现值 3.02。
  - W7 +0.01（系统，W7-rest）：“使用中”的唯一定义与带回、关闭检验的前置条件，`goal.delete_kept` 与进行中的接管、打开检验互相返回 `E_BUSY`，删除确认框的求值上下文（复用 W7-fs 的解析器）。W7 现值 26.66（系统 14.12）。
  - `04` 三处与其余五处复述、Bedrock 区域第 ③ 步与两处差别的登记、以头部发送的令牌的限制（W16，G46 (d) 第七组）与九条观察，按 WBS 行逐项不足 0.01，计 0。W3、W4（现值 4.60）、W6（现值 9.29）、W9（现值 10.91）、W10（现值 10.52）、W11（现值 7.87）、W12（现值 9.18）、W13（现值 6.97）、W14（现值 2.08）、W16（现值 3.53）不变。

  分配：Agent 0、系统 +0.01、桌面 0、设计 +0.03、安全 0；**没有落在 Agent 线、桌面线与安全线上的增量**。角色合计：Agent 26.65、系统 26.37、桌面 28.11、设计 29.36、安全 13.63（合计 124.12）。冻结前所需：系统 26.27 × 1.1 = 28.897 → 28.90，设计 26.36 × 1.1 = 28.996 → 29.00（十进制半进位，设计线仍最长），Agent、桌面、安全不变（28.88、28.94、14.44，安全按 0.5 人计为 28.88）；`14` §14.3.4 的加法式为 28.88 + 28.90 + 28.94 + 29.00 + 14.44 = 130.16（T = 132.16 / 5.5 = 24.029 → 24.03）。依赖链按第 57 轮统一的口径仍为 **19.91** 工作周（W7-rest、W17、W19 不在链上），远短于 29.00。按 ADR-136 的常规规则在余量之内吸收，**M1 维持 39 周**（第 35 周末冻结，2027-07-09；退出 2027-08-06；M2 至 2027-11-12；M3 至 2028-02）；冻结前可用工作周 32.0，各线容量 30.00。余量：系统 1.10（1.103）、Agent 1.12（1.125）、桌面 1.06（1.059）、设计 1.00（1.004）、安全 1.12 工作周，均为正，都远高于改派阈值（约 0.12）。**增 1 人方案仍为 34 周**：T ≥ 24.03 工作周，安全线 0.5 人完成约 12.02 人周（0.5 × 24.03 = 12.015），新人承担约 2.43 人周安全线工作（14.44 − 12.015 = 2.425，十进制半进位），并分担四条全职线的非链上工作；24.03 + 2 = 26.03 → 27 个工作周 → 第 30 周末冻结（2027-06-04），至 2027-07-02。下一个台阶仍是全部工作超过 135.52 人周（35 周）。
- **第 102 轮补记（ADR-133 附）**：第 102 轮相对第 101 轮的增量（ADR-230）按 WBS 行去重后净增 **+0.03 人周**（WBS 124.15）。8 条次要条目各在已有的唯一定义处加一句或一行。
  - W7 +0.02：W7-rest +0.01（系统）——删除确认框与交还对话框的提交数遍历全部 ref、按已知提交 id 停止，求值失败的回落，没有 Goal 行的目录与 `listedAt`，使用中而检验目录已不存在时的关闭与带回，G46 一组；W7-fs +0.01（安全）——交还对话框的 `ignoredCommits` 由隔离 worker 中的同一解析器只读求出。W7 现值 26.68（系统 14.13、安全 5.62）。
  - W16 +0.01（设计）：有 `pi /login` 存储的凭据时不注入导入的密钥、每次 Host 启动与每个 Run 之前检查与移除，首次运行与模型选择器的标注，bearer 令牌与原始密钥并存时只注入令牌，G46 (d) 第八组。落点在 W6，由本行负责人完成。W16 现值 3.54。
  - `hostExpected` 按 Run 清除（W4，G35c 一组）、存储提示的已查看改为界面状态与单枚 `◇`（W11）、Host 环境的变量只在 `05` §5.3.6 一处列出、清除结果补列 `mcp.log` 与十条观察，按 WBS 行逐项不足 0.01，计 0。W3、W4（现值 4.60）、W6（现值 9.29）、W9（现值 10.91）、W10（现值 10.52）、W11（现值 7.87）、W12（现值 9.18）、W13（现值 6.97）、W14（现值 2.08）、W17（现值 1.63）、W19（现值 3.02）不变。

  分配：Agent 0、系统 +0.01、桌面 0、设计 +0.01、安全 +0.01；**没有落在 Agent 线与桌面线上的增量**。角色合计：Agent 26.65、系统 26.38、桌面 28.11、设计 29.37、安全 13.64（合计 124.15）。冻结前所需：系统 26.28 × 1.1 = 28.908 → 28.91，设计 26.37 × 1.1 = 29.007 → 29.01（十进制半进位，设计线仍最长），安全 13.14 × 1.1 = 14.454 → 14.45（按 0.5 人计为 28.90），Agent、桌面不变（28.88、28.94）；`14` §14.3.4 的加法式为 28.88 + 28.91 + 28.94 + 29.01 + 14.45 = 130.19（T = 132.19 / 5.5 = 24.0345 → 24.03）。依赖链按第 57 轮统一的口径仍为 **19.91** 工作周（W7-rest、W7-fs、W16 不在链上），远短于 29.01。按 ADR-136 的常规规则在余量之内吸收，**M1 维持 39 周**（第 35 周末冻结，2027-07-09；退出 2027-08-06；M2 至 2027-11-12；M3 至 2028-02）；冻结前可用工作周 32.0，各线容量 30.00。余量：系统 1.09（1.092）、Agent 1.12（1.125）、桌面 1.06（1.059）、设计 0.99（0.993）、安全 1.10 工作周（1.092），均为正，都远高于改派阈值（约 0.12）。**增 1 人方案仍为 34 周**：T ≥ 24.03 工作周，安全线 0.5 人完成约 12.02 人周（0.5 × 24.03 = 12.015），新人承担约 2.44 人周安全线工作（14.45 − 12.015 = 2.435，十进制半进位），并分担四条全职线的非链上工作；24.03 + 2 = 26.03 → 27 个工作周 → 第 30 周末冻结（2027-06-04），至 2027-07-02。下一个台阶仍是全部工作超过 135.52 人周（35 周）。
- **第 103 轮补记（ADR-133 附）**：第 103 轮相对第 102 轮的增量（ADR-231）按 WBS 行去重后净增 **+0.03 人周**（WBS 124.18）。7 条次要条目各在已有的唯一定义处加一句或一行；其中 R103-D5-01 把 Tower 自己的 `auth.json` 条目检查换成 Pi 自己的判定（`checkAuth`），不新增机制。
  - W16 +0.02（设计）：是否注入导入的密钥改由 Pi 的 `checkAuth` 在不带运行时覆盖的探查运行时中判定，`$VAR` 与 `!` 命令的条目与 `models.json` 一层随之覆盖，检查按 Host 进行与 Run 中途 `/logout` 的去向，G46 (d) 第九组（0.01）；`NODE_EXTRA_CA_CERTS` 进入 Host 环境与 `mcpBaseEnv`、① 的工具链变量在首次运行记录并随“重新读取”替换、封闭列表在 `00` §0.5.1 与静态清单确认卡片上的说明（0.01）。落点在 W6，由本行负责人完成。W16 现值 3.56。
  - W4 +0.01（桌面）：磁盘满的 drain 以 `app_quit` 暂停、`outcome_reason` 为 `disk_full`，写入先于只读切换与写不进时的补写，只读的解除（每 30 s 与每次删除之后复查、可用 ≥ 2 GB），G35e (q)。落点在 W3，由本行负责人完成。W4 现值 4.61。
  - `hostExpected` 重新接上一支只对有进行中 Run 的 Goal 置位（W4，G35c 两组）、`inspect.open` 按状态判定与租约只读时的目录标注（W7-rest，G46 一组）、应用级横幅的视觉（W11）、`06` §6.2.4 的复述与十一条观察，按 WBS 行逐项不足 0.01，计 0。W3、W6（现值 9.29）、W7（现值 26.68）、W9（现值 10.91）、W10（现值 10.52）、W11（现值 7.87）、W12（现值 9.18）、W13（现值 6.97）、W14（现值 2.08）、W17（现值 1.63）、W19（现值 3.02）不变。

  分配：Agent 0、系统 0、桌面 +0.01、设计 +0.02、安全 0；**没有落在 Agent 线、系统线与安全线上的增量**。角色合计：Agent 26.65、系统 26.38、桌面 28.12、设计 29.39、安全 13.64（合计 124.18）。冻结前所需：桌面 26.32 × 1.1 = 28.952 → 28.95，设计 26.39 × 1.1 = 29.029 → 29.03（十进制半进位，设计线仍最长），Agent、系统、安全不变（28.88、28.91、14.45，安全按 0.5 人计为 28.90）；`14` §14.3.4 的加法式为 28.88 + 28.91 + 28.95 + 29.03 + 14.45 = 130.22（T = 132.22 / 5.5 = 24.04）。依赖链按第 57 轮统一的口径仍为 **19.91** 工作周（W4、W16 不在链上），远短于 29.03。按 ADR-136 的常规规则在余量之内吸收，**M1 维持 39 周**（第 35 周末冻结，2027-07-09；退出 2027-08-06；M2 至 2027-11-12；M3 至 2028-02）；冻结前可用工作周 32.0，各线容量 30.00。余量：系统 1.09（1.092）、Agent 1.12（1.125）、桌面 1.05（1.048）、设计 0.97（0.971）、安全 1.10 工作周（1.092），均为正，都远高于改派阈值（约 0.12）。**增 1 人方案仍为 34 周**：T ≥ 24.04 工作周，安全线 0.5 人完成约 12.02 人周（0.5 × 24.04 = 12.02），新人承担约 2.43 人周安全线工作（14.45 − 12.02 = 2.43），并分担四条全职线的非链上工作；24.04 + 2 = 26.04 → 27 个工作周 → 第 30 周末冻结（2027-06-04），至 2027-07-02。本轮 5.5T − 2 = 130.22 恰等于全部工作，第 102 轮的 0.025 人周取整差（R103 观察 11）由向上取整为工作周数吸收，规则不变。下一个台阶仍是全部工作超过 135.52 人周（35 周）。
- **第 104 轮补记（ADR-133 附）**：第 104 轮相对第 103 轮的增量（ADR-232）按 WBS 行去重后净增 **+0.04 人周**（WBS 124.22）。7 条次要条目各在已有的唯一定义处加一句或一行；R104-D5-02 以一条打包的分组约束关闭，不新增机制。
  - W6 +0.02（Agent）：扩展注册的 provider 不注入导入的密钥、打包只合并扩展集合相同的 Goal 与集合变化时换 Host，C44、G46 (d) 第十组（0.01）；Host 启动时安装读代理变量的分发器，C43，G46 (d) CA 一组改为只能经代理出网（0.01）。W6 现值 9.31。
  - W16 +0.01（设计）：首次运行与模型选择器的标注取自 Host 的检查，Host 向 Supervisor 报告检查结论，尚无结论时的写法，G46 (d) 第八、九组的期望。落点在 W6，由本行负责人完成。W16 现值 3.57。
  - W4 +0.01（桌面）：磁盘满的解除对原因含 `app_quit` 且 `outcome_reason` 为 `disk_full` 的 Goal 按 §6.1.4 第 5 项，只读期间 Supervisor 启动时先复查空间，进行中的验证取消并在解除后以同一 pin 重跑，准备阶段中止并重新准入，G35e (q) 四组。落点在 W3，由本行负责人完成。W4 现值 4.62。
  - `12` 覆盖层规则只引用 `08`、卡片 `自动恢复` 的条件与横幅文字（W11）、G46 租约一组的期望与租约过期而未接管的一段（W7-rest）与十二条观察，按 WBS 行逐项不足 0.01，计 0。W3、W7（现值 26.68）、W9（现值 10.91）、W10（现值 10.52）、W11（现值 7.87）、W12（现值 9.18）、W13（现值 6.97）、W14（现值 2.08）、W17（现值 1.63）、W19（现值 3.02）不变。

  分配：Agent +0.02、系统 0、桌面 +0.01、设计 +0.01、安全 0；**没有落在系统线与安全线上的增量**。角色合计：Agent 26.67、系统 26.38、桌面 28.13、设计 29.40、安全 13.64（合计 124.22）。冻结前所需：Agent 26.27 × 1.1 = 28.897 → 28.90，桌面 26.33 × 1.1 = 28.963 → 28.96，设计 26.40 × 1.1 = 29.04（设计线仍最长），系统、安全不变（28.91、14.45，安全按 0.5 人计为 28.90）；`14` §14.3.4 的加法式为 28.90 + 28.91 + 28.96 + 29.04 + 14.45 = 130.26（T = 132.26 / 5.5 = 24.0473 → 24.05）。依赖链按第 57 轮统一的口径仍为 **19.91** 工作周（W4、W6、W16 不在链上），远短于 29.04。按 ADR-136 的常规规则在余量之内吸收，**M1 维持 39 周**（第 35 周末冻结，2027-07-09；退出 2027-08-06；M2 至 2027-11-12；M3 至 2028-02）；冻结前可用工作周 32.0，各线容量 30.00。余量：系统 1.09（1.092）、Agent 1.10（1.103）、桌面 1.04（1.037）、设计 0.96（0.960）、安全 1.10 工作周（1.092），均为正，都远高于改派阈值（约 0.12）。**增 1 人方案仍为 34 周**：T ≥ 24.05 工作周，安全线 0.5 人完成约 12.03 人周（0.5 × 24.05 = 12.025），新人承担约 2.43 人周安全线工作（14.45 − 12.025 = 2.425，十进制半进位），并分担四条全职线的非链上工作；24.05 + 2 = 26.05 → 27 个工作周 → 第 30 周末冻结（2027-06-04），至 2027-07-02。本轮 5.5T − 2 = 130.275，比全部工作多 0.015 人周，由向上取整为工作周数吸收。下一个台阶仍是全部工作超过 135.52 人周（35 周）。
- **第 105 轮补记（ADR-133 附）**：第 105 轮相对第 104 轮的增量（ADR-233）按 WBS 行去重后净增 **+0.03 人周**（WBS 124.25）。4 条次要条目各在已有的唯一定义处加一句或一行；R105-D6-01 沿用 §6.1.6 已有的恢复行，不新增机制。
  - W6 +0.01（Agent）：Host 启动时总是安装与 Pi 相同的分发器（HTTP/1.1、连接尝试时限 2 s、空闲超时取 `httpIdleTimeoutMs`、`undici.install()`），只用 Pi 所依赖的那一份 undici，C43 两种情形。W6 现值 9.32。
  - W16 +0.01（设计）：扩展注册的 provider 的第三种结论 `由扩展处理认证` 与按 Host 的标注，列表在每个 Run 的会话创建之后与适配器每次投递之前读取、列出过即在该 Host 中不再注入，代价一句与 `00` §0.5.1 一行，C44、G46 (d) 第十组。落点在 W6，由本行负责人完成。W16 现值 3.58。
  - W4 +0.01（桌面）：只读启动时中止存活 Host 中的 Run、结果由 §6.1.6 已有的恢复行求出，不写数据库的清理照常执行，复查的卷集合与求不出的卷，准备步骤的 `ENOSPC` 归 F8 与 ③ 只中止该会话，G35e (q) 四组。落点在 W3，由本行负责人完成。W4 现值 4.63。
  - 准入的可写一项（W3）、F8 并入 drain 时的 `outcome_reason`、卡片条件与实况行、横幅与读屏（W11）、覆盖层的去处、打包时的 Host 预留登记与十二条观察，按 WBS 行逐项不足 0.01，计 0。W3、W7（现值 26.68）、W9（现值 10.91）、W10（现值 10.52）、W11（现值 7.87）、W12（现值 9.18）、W13（现值 6.97）、W14（现值 2.08）、W17（现值 1.63）、W19（现值 3.02）不变。

  分配：Agent +0.01、系统 0、桌面 +0.01、设计 +0.01、安全 0；**没有落在系统线与安全线上的增量**。角色合计：Agent 26.68、系统 26.38、桌面 28.14、设计 29.41、安全 13.64（合计 124.25）。冻结前所需：Agent 26.28 × 1.1 = 28.908 → 28.91，桌面 26.34 × 1.1 = 28.974 → 28.97，设计 26.41 × 1.1 = 29.051 → 29.05（十进制半进位，设计线仍最长），系统、安全不变（28.91、14.45，安全按 0.5 人计为 28.90）；`14` §14.3.4 的加法式为 28.91 + 28.91 + 28.97 + 29.05 + 14.45 = 130.29（T = 132.29 / 5.5 = 24.0527 → 24.05）。依赖链按第 57 轮统一的口径仍为 **19.91** 工作周（W4、W6、W16 不在链上），远短于 29.05。按 ADR-136 的常规规则在余量之内吸收，**M1 维持 39 周**（第 35 周末冻结，2027-07-09；退出 2027-08-06；M2 至 2027-11-12；M3 至 2028-02）；冻结前可用工作周 32.0，各线容量 30.00。余量：系统 1.09（1.092）、Agent 1.09（1.092）、桌面 1.03（1.026）、设计 0.95（0.949）、安全 1.10 工作周（1.092），均为正，都远高于改派阈值（约 0.12）。**增 1 人方案仍为 34 周**：T ≥ 24.05 工作周，安全线 0.5 人完成约 12.03 人周（0.5 × 24.05 = 12.025），新人承担约 2.43 人周安全线工作（14.45 − 12.025 = 2.425，十进制半进位），并分担四条全职线的非链上工作；24.05 + 2 = 26.05 → 27 个工作周 → 第 30 周末冻结（2027-06-04），至 2027-07-02。本轮 5.5T − 2 = 130.275，比全部工作少 0.015 人周（T 先舍入所致，R103 观察 11 的同一情形），由向上取整为工作周数吸收：27 个工作周的产能为 5.5 × 25 − 2 = 135.5 人周。下一个台阶仍是全部工作超过 135.52 人周（35 周）。
- **第 106 轮补记（ADR-133 附）**：第 106 轮相对第 105 轮的增量（ADR-234）按 WBS 行去重后净增 **+0.06 人周**（WBS 124.31）。6 条次要条目各在已有的唯一定义处加一句、一行或一条守卫；R106-D6-01 沿用 settle 的终止与 §6.1.6 的终止范围，R106-D6-02 把 F8 已有的进程内 drain 目标扩为待补失败出口列表，不新增状态、原因或表。
  - W6 +0.02（Agent）：`provider_unavailable` 的探测只在 Host 中运行（同组空闲的 Host，或为探测起的短时 Host），`getAuth` 拒绝计为失败，C39 补组，0.01；空闲超时的两处读取、Host 存活期间变为无效时 Run 的准备按 F4b、C43 改以 HTTP 类 MCP 的响应头超时断言分发器，tower-goal 的 `turn_start` 读取，0.01。W6 现值 9.34。
  - W4 +0.03（桌面）：只读启动时中止的 Run 的进程立即按进程树与令牌的并集终止并 `dispose` 会话、终止范围补这一类，0.01；进行中的写回、卫星重建与接管的待补失败出口列表与 `syncing` 不变式，0.01；`<wtRoot>` 所在卷未挂载的守卫与准入检查 i，0.01；G35e (q) 三组。落点在 W3，由本行负责人完成。W4 现值 4.66。
  - W16 +0.01（设计）：标注的可见范围与重报，G46 (d) 第八至十组改在 `为受影响目标切换模型` 中、模型服务不可用之后观察。落点在 W6，由本行负责人完成。W16 现值 3.59。
  - F8 中止判别的收窄、准入检查 i 的短路、实况行、横幅与读屏（W11）、覆盖层一行的生命周期、引文与残留及其余观察，按 WBS 行逐项不足 0.01，计 0。W3、W7、W9（现值 10.91）、W10（现值 10.52）、W11（现值 7.87）、W12（现值 9.18）、W13（现值 6.97）、W14（现值 2.08）、W17（现值 1.63）、W19（现值 3.02）不变。

  分配：Agent +0.02、系统 0、桌面 +0.03、设计 +0.01、安全 0；**没有落在系统线与安全线上的增量**。角色合计：Agent 26.70、系统 26.38、桌面 28.17、设计 29.42、安全 13.64（合计 124.31）。冻结前所需：Agent 26.30 × 1.1 = 28.93，桌面 26.37 × 1.1 = 29.007 → 29.01，设计 26.42 × 1.1 = 29.062 → 29.06（十进制半进位，设计线仍最长），系统、安全不变（28.91、14.45，安全按 0.5 人计为 28.90）；`14` §14.3.4 的加法式为 28.93 + 28.91 + 29.01 + 29.06 + 14.45 = 130.36（T = 132.36 / 5.5 = 24.0655 → 24.07）。依赖链按第 57 轮统一的口径仍为 **19.91** 工作周（W4、W6、W16 不在链上），远短于 29.06。按 ADR-136 的常规规则在余量之内吸收，**M1 维持 39 周**（第 35 周末冻结，2027-07-09；退出 2027-08-06；M2 至 2027-11-12；M3 至 2028-02）；冻结前可用工作周 32.0，各线容量 30.00。余量：系统 1.09（1.092）、Agent 1.07（1.070）、桌面 0.99（0.993）、设计 0.94（0.938）、安全 1.10 工作周（1.092），均为正，都远高于改派阈值（约 0.12）。**增 1 人方案仍为 34 周**：T ≥ 24.07 工作周，安全线 0.5 人完成约 12.04 人周（0.5 × 24.07 = 12.035），新人承担约 2.42 人周安全线工作（14.45 − 12.035 = 2.415，十进制半进位），并分担四条全职线的非链上工作；24.07 + 2 = 26.07 → 27 个工作周 → 第 30 周末冻结（2027-06-04），至 2027-07-02。本轮 5.5T − 2 = 130.385，比全部工作多 0.025 人周。下一个台阶仍是全部工作超过 135.52 人周（35 周）。
- **第 107 轮补记（ADR-133 附）**：第 107 轮相对第 106 轮的增量（ADR-235）按 WBS 行去重后净增 **−0.01 人周**（WBS 124.30）。本轮按收敛规则以删除与简化关闭条目：为探测另起的短时 Host 删除，按卷名判别的一行由一条 Project 不可达规则取代，情形 C 的自动查找删除；不新增状态、暂停原因、表、列、命令或进程。
  - W6 −0.01（Agent）：探测只用同组已存活的空闲 Host，删除为探测另起的 Host 及其分组、上限、自身失败与 `!` 命令重新执行的分支，−0.01；每个 Run 校验会造成重试循环的设置扩到 `websocketConnectTimeoutMs`、`retry.provider.*` 与 `retry.maxRetries`、C43 补两组，不足 0.01。W6 现值 9.33。
  - W4 +0.01（桌面）：Project 不可达一条规则——必需路径之一不可访问即中止该 Project 的 Run 并复用 `app_quit`、不执行其余恢复行、命令返回 `E_STATE`、F8 复查不含不可达的 Project，G35e (q) 两组。落点在 W3，由本行负责人完成。W4 现值 4.67。
  - W7 −0.01（系统）：情形 C 的自动查找删除，被移动的检出改由人迁移（W7-rest，不在依赖链上）。W7 现值 26.67。
  - 实况行的条件、横幅后缀的删除、缓存预热与 `turn_start` 处理器出错的写明、注入前复查、切换模型的对话框、F8 中接管与写回 ① 的两处、网络卷的异步检查与其余观察，按 WBS 行逐项不足 0.01，计 0。W3、W9（现值 10.91）、W10（现值 10.52）、W11（现值 7.87）、W12（现值 9.18）、W13（现值 6.97）、W14（现值 2.08）、W16（现值 3.59）、W17（现值 1.63）、W19（现值 3.02）不变。

  分配：Agent −0.01、系统 −0.01、桌面 +0.01、设计 0、安全 0；**没有落在设计线与安全线上的增量**。角色合计：Agent 26.69、系统 26.37、桌面 28.18、设计 29.42、安全 13.64（合计 124.30）。冻结前所需：Agent 26.29 × 1.1 = 28.919 → 28.92，系统 26.27 × 1.1 = 28.897 → 28.90，桌面 26.38 × 1.1 = 29.018 → 29.02（十进制半进位），设计、安全不变（29.06 仍最长、14.45，安全按 0.5 人计为 28.90）；`14` §14.3.4 的加法式为 28.92 + 28.90 + 29.02 + 29.06 + 14.45 = 130.35（T = 132.35 / 5.5 = 24.0636 → 24.06）。依赖链按第 57 轮统一的口径仍为 **19.91** 工作周（W7 的删除在 W7-rest，W4、W6 不在链上），远短于 29.06。余量只增不减，**M1 维持 39 周**（第 35 周末冻结，2027-07-09；退出 2027-08-06；M2 至 2027-11-12；M3 至 2028-02）；冻结前可用工作周 32.0，各线容量 30.00。余量：系统 1.10（1.103）、Agent 1.08（1.081）、桌面 0.98（0.982）、设计 0.94（0.938）、安全 1.10 工作周（1.092），均为正，都远高于改派阈值（约 0.12）。**增 1 人方案仍为 34 周**：T ≥ 24.06 工作周，安全线 0.5 人完成约 12.03 人周（0.5 × 24.06 = 12.03），新人承担约 2.42 人周安全线工作（14.45 − 12.03 = 2.42），并分担四条全职线的非链上工作；24.06 + 2 = 26.06 → 27 个工作周 → 第 30 周末冻结（2027-06-04），至 2027-07-02。本轮 5.5T − 2 = 130.33，比全部工作少 0.02 人周（T 先舍入所致，R103 观察 11 的同一情形），由向上取整为工作周数吸收：27 个工作周的产能为 5.5 × 25 − 2 = 135.5 人周。下一个台阶仍是全部工作超过 135.52 人周（35 周）。
- **第 108 轮补记（ADR-133 附）**：第 108 轮相对第 107 轮的增量（ADR-236）按 WBS 行去重后净增 **+0.06 人周**（WBS 124.36）。8 条次要条目都在 ADR-235 的唯一定义处细化：Project 不可达改为按 Goal 判定，失败先判可达与启动时的解除推迟写在同一行，可达性检查按挂载点隔离，隐私清除只推迟不可访问的根；新增一条仅本机的命令 `project.relocate`（`10` §10.1.1 已有的迁移与情形 F 由它发起）；不新增状态、暂停原因、事件类型、表、列或进程。
  - W6 +0.01（Agent）：每个 Run 校验的 `retry.provider.timeoutMs` 取正整数且不超过 2147483647（按 Pi 所钉的 `@anthropic-ai/sdk` 0.129.0、`openai` 7.19.0 的 `validatePositiveInteger` 核实）、F4b 的触发与卡片原因、C43 补两组。W6 现值 9.34。
  - W4 +0.02（桌面）：可达性检查按挂载点隔离、放弃挂起的线程另起、`~/.tower` 所在卷读不出时按未知计，0.01；Project 不可达按 Goal 判定、启动时的 `resumeOnLaunch` 解除推迟到可达、不可达期间允许 `goal.abandon`，G35e (q) 四组，0.01。落点在 W3，由本行负责人完成。W4 现值 4.69。
  - W7 +0.03（系统）：文件系统错误失败时先判可达，0.01；`project.relocate`（迁移与改 `worktreeRoot`，重建沿用情形 F），0.01；隐私清除按 `roots[].wtRoot` 只推迟不可访问的根，0.01（W7-rest，不在依赖链上）。W7 现值 26.70，系统份额 14.15。
  - 退出确认框的条件、缓存预热 `idle` 模式与引文的更正、`!` 命令缓存的限定、探测摘要、F13、卡片与实况行的几处、注意力一行、残留与其余观察，按 WBS 行逐项不足 0.01，计 0。W3、W9（现值 10.91）、W10（现值 10.52）、W11（现值 7.87）、W12（现值 9.18）、W13（现值 6.97）、W14（现值 2.08）、W16（现值 3.59）、W17（现值 1.63）、W19（现值 3.02）不变。

  分配：Agent +0.01、系统 +0.03、桌面 +0.02、设计 0、安全 0；**没有落在设计线与安全线上的增量**。角色合计：Agent 26.70、系统 26.40、桌面 28.20、设计 29.42、安全 13.64（合计 124.36）。冻结前所需：Agent 26.30 × 1.1 = 28.93，系统 26.30 × 1.1 = 28.93，桌面 26.40 × 1.1 = 29.04，设计、安全不变（29.06 仍最长、14.45，安全按 0.5 人计为 28.90）；`14` §14.3.4 的加法式为 28.93 + 28.93 + 29.04 + 29.06 + 14.45 = 130.41（T = 132.41 / 5.5 = 24.0745 → 24.07）。依赖链按第 57 轮统一的口径仍为 **19.91** 工作周（W7 的增量在 W7-rest，W4、W6 不在链上），远短于 29.06。按 ADR-136 的常规规则在余量之内吸收，**M1 维持 39 周**（第 35 周末冻结，2027-07-09；退出 2027-08-06；M2 至 2027-11-12；M3 至 2028-02）；冻结前可用工作周 32.0，各线容量 30.00。余量：系统 1.07（1.070）、Agent 1.07（1.070）、桌面 0.96（0.960）、设计 0.94（0.938）、安全 1.10 工作周（1.092），均为正，都远高于改派阈值（约 0.12）。**增 1 人方案仍为 34 周**：T ≥ 24.07 工作周，安全线 0.5 人完成约 12.04 人周（0.5 × 24.07 = 12.035），新人承担约 2.42 人周安全线工作（14.45 − 12.035 = 2.415，十进制半进位），并分担四条全职线的非链上工作；24.07 + 2 = 26.07 → 27 个工作周 → 第 30 周末冻结（2027-06-04），至 2027-07-02。本轮 5.5T − 2 = 130.385，比全部工作少 0.025 人周（T 先舍入所致，R103 观察 11 的同一情形），由向上取整为工作周数吸收：27 个工作周的产能为 5.5 × 25 − 2 = 135.5 人周。下一个台阶仍是全部工作超过 135.52 人周（35 周）。
- **第 109 轮补记（ADR-133 附）**：第 109 轮相对第 108 轮的增量（ADR-237）按 WBS 行去重后净增 **+0.06 人周**（WBS 124.42）。2 条重要、7 条次要条目都在已有的唯一定义处关闭：隐私清除一次完成、不推迟（不可访问的根记入库外的清除遗留清单，只用于列出），`project.relocate` 把旧位置记入 Project 行的 `settings`，失败先判可达只判定该操作实际读写的路径，不可达期间的每一种自动解除都推迟，路径丢失的确认结束旧路径上的人工编辑检出与检验检出，F13 改由 tower-goal 自报；不新增状态、暂停原因、事件类型、表、列、命令或进程（清除遗留清单是 `~/.tower` 中与 `goal-id-hwm` 同类的一个小文件）。
  - W6 +0.01（Agent）：F13 改由 tower-goal 的 `tool_call` 与 `turn_start` 处理器以 try/catch 自报、经 `bridge` 计数，C5 补断言（Pi v1.2.0 的 `emitToolCall` 不发 `extension_error`），0.01；三项超时设置的上限、C43 补组，不足 0.01。W6 现值 9.35。
  - W4 +0.01（桌面）：不可达期间每一种自动解除都推迟（`engine_crash` 的启动解除、`provider_unavailable` 的探测）、不可达期间放弃时清除 `syncing` 的 `human_checkout`，G35e (q) 补组。落点在 W3，由本行负责人完成。W4 现值 4.70。
  - W7 +0.04（系统，W7-rest，不在依赖链上）：清除一次完成与清除遗留清单，0.01；`project.relocate` 记下旧位置、存储面板与清除照常找到旧位置的目录，0.01；路径丢失的确认，0.01；失败先判可达只判定实际读写的路径、登记反向竞争，0.01。W7 现值 26.74，系统份额 14.19。
  - 启动等待与线程内存的写明、迁移的 `E_BUSY` 集合与作用范围的登记、备份 bundle 的选择、情形 D 的克隆说明、卡片与摘要、引文更正与其余观察，按 WBS 行逐项不足 0.01，计 0。W3、W9（现值 10.91）、W10（现值 10.52）、W11（现值 7.87）、W12（现值 9.18）、W13（现值 6.97）、W14（现值 2.08）、W16（现值 3.59）、W17（现值 1.63）、W19（现值 3.02）不变。

  分配：Agent +0.01、系统 +0.04、桌面 +0.01、设计 0、安全 0；**没有落在设计线与安全线上的增量**。角色合计：Agent 26.71、系统 26.44、桌面 28.21、设计 29.42、安全 13.64（合计 124.42）。冻结前所需：Agent 26.31 × 1.1 = 28.941 → 28.94，系统 26.34 × 1.1 = 28.974 → 28.97，桌面 26.41 × 1.1 = 29.051 → 29.05（十进制半进位），设计、安全不变（29.06 仍最长、14.45，安全按 0.5 人计为 28.90）；`14` §14.3.4 的加法式为 28.94 + 28.97 + 29.05 + 29.06 + 14.45 = 130.47（T = 132.47 / 5.5 = 24.0855 → 24.09）。依赖链按第 57 轮统一的口径仍为 **19.91** 工作周（W7 的增量在 W7-rest，W4、W6 不在链上），远短于 29.06。按 ADR-136 的常规规则在余量之内吸收，**M1 维持 39 周**（第 35 周末冻结，2027-07-09；退出 2027-08-06；M2 至 2027-11-12；M3 至 2028-02）；冻结前可用工作周 32.0，各线容量 30.00。余量：系统 1.03（1.026）、Agent 1.06（1.059）、桌面 0.95（0.949）、设计 0.94（0.938）、安全 1.10 工作周（1.092），均为正，都远高于改派阈值（约 0.12）。**增 1 人方案仍为 34 周**：T ≥ 24.09 工作周，安全线 0.5 人完成约 12.05 人周（0.5 × 24.09 = 12.045），新人承担约 2.41 人周安全线工作（14.45 − 12.045 = 2.405，十进制半进位），并分担四条全职线的非链上工作；24.09 + 2 = 26.09 → 27 个工作周 → 第 30 周末冻结（2027-06-04），至 2027-07-02。本轮 5.5T − 2 = 130.495，比全部工作多 0.025 人周。下一个台阶仍是全部工作超过 135.52 人周（35 周）。
- **第 110 轮补记（ADR-133 附）**：第 110 轮相对第 109 轮的增量（ADR-238）按 WBS 行去重后净增 **+0.06 人周**（WBS 124.48）。1 条重要、5 条次要条目都在已有的唯一定义处关闭：必需路径只有根、根之下的目录按所在的根判定（已设计的丢失与失败分支由此可达），失败先判可达按根且判为中断时该 Goal 同时不可达（没有无人续做的中断），写回中断时放弃先保存 T1，路径丢失确认按记录判定，`relocatedFrom` 只在 `<wtRoot>` 改变时写入，清除遗留清单只存 `[{wtRoot, at}]` 并先于事务落盘，`tool_result` 脱敏处理器 fail-closed，base 确认中的环境错误按无结论；不新增状态、暂停原因、事件类型、表、列或命令（新增的只有影子中每个 Goal 至多一个的 ref `refs/tower/<goalId>/handback-t1`，与存储面板“清理工作目录”中的 `从列表移除`）。
  - W6 +0.01（Agent）：`tool_result` 脱敏处理器以 try/catch 包住自身、出错时返回隐去原文的结果而不重新抛出（Pi v1.2.0 的 `emitToolResult` 吞掉异常并放行原结果），F13 计数的复位、第三次以 `prepare_failed` 暂停，C5 补断言，0.01。W6 现值 9.36。
  - W7 +0.05（系统，W7-rest，不在依赖链上）：必需路径只有根与失败先判可达按根，0.01；写回中断时放弃保存 T1（`handback-t1` ref、确认框与目标页的取回说明），0.01；路径丢失确认按记录并结束对应记录、`relocatedFrom` 的写入条件、去重、迁回时改名保留、合并与拆分，0.01；清除遗留清单的内容、写入次序、列出范围、`从列表移除` 与 `all` 档，0.01；flake 的 base 确认中的无结论（复用失败先判可达的同一判定；落点在 W9a，由本行负责人完成，W9 行不变），0.01。W7 现值 26.79，系统份额 14.24。
  - 超时不设下限的登记、引文更正、摘要、卡片与 `◆` 条件的对齐及其余观察，按 WBS 行逐项不足 0.01，计 0。W3、W4（现值 4.70）、W9（现值 10.91）、W10（现值 10.52）、W11（现值 7.87）、W12（现值 9.18）、W13（现值 6.97）、W14（现值 2.08）、W16（现值 3.59）、W17（现值 1.63）、W19（现值 3.02）不变。

  分配：Agent +0.01、系统 +0.05、桌面 0、设计 0、安全 0；**没有落在桌面线、设计线与安全线上的增量**（系统线余量 1.03 → 0.97，仍远高于改派阈值，不需按 ADR-136 改派）。角色合计：Agent 26.72、系统 26.49、桌面 28.21、设计 29.42、安全 13.64（合计 124.48）。冻结前所需：Agent 26.32 × 1.1 = 28.952 → 28.95，系统 26.39 × 1.1 = 29.029 → 29.03（十进制半进位），桌面、设计、安全不变（29.05、29.06 仍最长、14.45，安全按 0.5 人计为 28.90）；`14` §14.3.4 的加法式为 28.95 + 29.03 + 29.05 + 29.06 + 14.45 = 130.54（T = 132.54 / 5.5 = 24.0982 → 24.10）。依赖链按第 57 轮统一的口径仍为 **19.91** 工作周（W7 的增量在 W7-rest，W6 不在链上，W9 行不变），远短于 29.06。按 ADR-136 的常规规则在余量之内吸收，**M1 维持 39 周**（第 35 周末冻结，2027-07-09；退出 2027-08-06；M2 至 2027-11-12；M3 至 2028-02）；冻结前可用工作周 32.0，各线容量 30.00。余量：系统 0.97（0.971）、Agent 1.05（1.048）、桌面 0.95（0.949）、设计 0.94（0.938）、安全 1.10 工作周（1.092），均为正，都远高于改派阈值（约 0.12）。**增 1 人方案仍为 34 周**：T ≥ 24.10 工作周，安全线 0.5 人完成约 12.05 人周（0.5 × 24.10 = 12.05），新人承担约 2.40 人周安全线工作（14.45 − 12.05 = 2.40），并分担四条全职线的非链上工作；24.10 + 2 = 26.10 → 27 个工作周 → 第 30 周末冻结（2027-06-04），至 2027-07-02。本轮 5.5T − 2 = 130.55，比全部工作多 0.01 人周。下一个台阶仍是全部工作超过 135.52 人周（35 周）。
- **第 111 轮补记（ADR-133 附）**：第 111 轮相对第 110 轮的增量（ADR-239）按 WBS 行去重后净增 **+0.06 人周**（WBS 124.54）。1 条重要、6 条次要条目都在已有的唯一定义处关闭：`handback-t1` 在写回开始之前写入、只在写回成功时删除、不按时间删除（T1 在整个 `syncing` 期间被引用，放弃不需要另写），Tower 不重新建立根且新 Goal 从准备开始把 `<wtRoot>` 计入必需路径，迁移的新记录与标志在迁移的事务中写入、写回中断时迁移返回列出这些 Goal 的 `E_STATE` 且界面不提供会被拒绝的动作，F13 按处理器计数并以 `anomaly{tower_goal_handler_error}` 自报，脱敏覆盖 `details`，验证中子进程的失败先判可达、`flake` Fact 在判定之后写、base 确认无结论按环境故障；不新增状态、暂停原因、事件类型、表、列或命令（新增的只有检测器 id `tower_goal_handler_error`、`verify_env_error.stage` 的 `baseline` 与 `goal.delete_kept` 的参数 `handbackT1`）。
  - W6 +0.02（Agent）：F13 按处理器计数、只由同一处理器的正常完成清零，自报改为 `anomaly{tower_goal_handler_error}`（去重键 `an:{goalId}:tower_goal_handler_error`、出口“知悉”），C5 补组，0.01；`tool_result` 脱敏覆盖 `details`、占位结果带 `details: {}` 并写明已执行，C5 补组，0.01。W6 现值 9.38。
  - W7 +0.04（系统，W7-rest，不在依赖链上）：`handback-t1` 在写回开始之前写入、写不成时不开始写回、只在写回成功时删除、不按时间删除，影子删除的推迟、存储面板的列出与删除、清除确认框列出、写入时的 bundle，0.02；Tower 不重新建立根、新 Goal 把将要使用的 `<wtRoot>` 计入必需路径、迁移的新记录与 `satellite_rebuilding=1` 在迁移的事务中写入、新 `<wtRoot>` 的校验、迁移在写回中断时的 `E_STATE` 与界面的出口，0.01；验证中子进程的任何失败先判可达、`flake` Fact 在判定之后写入、只因无结论而不能通过时记 `verify_env_error{stage:"baseline"}`（落点在 W9a，由本行负责人完成，W9 行不变），0.01。W7 现值 26.83，系统份额 14.28。
  - 六处过时措辞、`prepare_failed` 来源改为引用 `16` §16.1.1、保留期摘要改为引用 `10` §10.3.2 与观察 1–9，按 WBS 行逐项不足 0.01，计 0。W3、W4（现值 4.70）、W9（现值 10.91）、W10（现值 10.52）、W11（现值 7.87）、W12（现值 9.18）、W13（现值 6.97）、W14（现值 2.08）、W16（现值 3.59）、W17（现值 1.63）、W19（现值 3.02）不变。

  分配：Agent +0.02、系统 +0.04、桌面 0、设计 0、安全 0；**没有落在桌面线、设计线与安全线上的增量**（系统线余量 0.97 → 0.93，仍高于约 0.9 的改派考虑线，也远高于改派阈值，不需按 ADR-136 改派）。角色合计：Agent 26.74、系统 26.53、桌面 28.21、设计 29.42、安全 13.64（合计 124.54）。冻结前所需：Agent 26.34 × 1.1 = 28.974 → 28.97，系统 26.43 × 1.1 = 29.073 → 29.07（十进制半进位；系统线由此成为最长的一条），桌面、设计、安全不变（29.05、29.06、14.45，安全按 0.5 人计为 28.90）；`14` §14.3.4 的加法式为 28.97 + 29.07 + 29.05 + 29.06 + 14.45 = 130.60（T = 132.60 / 5.5 = 24.1091 → 24.11）。依赖链按第 57 轮统一的口径仍为 **19.91** 工作周（W7 的增量在 W7-rest，W6 不在链上，W9 行不变），远短于 29.07。按 ADR-136 的常规规则在余量之内吸收，**M1 维持 39 周**（第 35 周末冻结，2027-07-09；退出 2027-08-06；M2 至 2027-11-12；M3 至 2028-02）；冻结前可用工作周 32.0，各线容量 30.00。余量：系统 0.93（0.927）、Agent 1.03（1.026）、桌面 0.95（0.949）、设计 0.94（0.938）、安全 1.10 工作周（1.092），均为正，都远高于改派阈值（约 0.12）。**增 1 人方案仍为 34 周**：T ≥ 24.11 工作周，安全线 0.5 人完成约 12.06 人周（0.5 × 24.11 = 12.055），新人承担约 2.40 人周安全线工作（14.45 − 12.055 = 2.395，十进制半进位），并分担四条全职线的非链上工作；24.11 + 2 = 26.11 → 27 个工作周 → 第 30 周末冻结（2027-06-04），至 2027-07-02。本轮 5.5T − 2 = 130.605，比全部工作多 0.005 人周。下一个台阶仍是全部工作超过 135.52 人周（35 周）。
---

## 第 15 轮对抗评审后的跨文档决策（ADR-134 – ADR-136）

以下决策回应 `reviews/round-15.md`。

## ADR-134 暂停的继续目标与唯一转移函数 — Accepted（R15-D4-01、R15-D4-02；Supersedes ADR-128 的“按 `detectedIn` 继续”、`resumeTo`（ADR-084/094）与 `pendingVerify`（ADR-084）的分散规则；Amended by ADR-137、ADR-188、ADR-214、ADR-216）

- **问题根源**：第 12–14 轮为各个暂停原因分别写了“解除后去哪里”（`resumeTo`、`pendingVerify`、`externalChange.detectedIn`、各行枚举），组合时没有唯一答案。
- **继续目标**：`Goal.continuation`，Goal **从非 `paused` 状态第一次进入 `paused` 时**写入，叠加原因不覆盖它，持久化（`06` JSON 列，事件 `goal.continuation.set`）：
  - `{kind:"run"}`：从 `running` 进入（含 Run 中的 `app_quit`/`engine_crash`/`satellite_missing`〔settle 序列中丢失时为 settle，ADR-178〕）；
  - `{kind:"settle"}`：从 settle 序列中进入（ADR-129）——继续 settle 序列，不开新 Run，有效提交保留；
  - `{kind:"verify", pin}`：从 `claimed`/`verifying` 进入（源状态取持久化的 `Goal.verifyFrom`，不另存；第 15 轮补正）（含 `s0_grant_pending`、`verify_env_error`、人在验证中暂停）；
  - `{kind:"review", state: "in_review" | "accepted", pin}`：从 `in_review`/`accepted` 进入（含接管、外部写入）；
  - `{kind:"verify_new", origin, returnTo?}`：只由显式改写产生（见下）。
- **各原因的命令只做两件事**：解除自己；以及在需要时**显式改写**继续目标——
  - `keep_external_change`：目标为 `verify`/`review` → 改写为 `verify_new{origin:"human_change"}`；目标为 `run`/`settle` → 不变（采纳的内容随后进入 Agent 的工作与 pin）；
  - `revert_external_change`：不改写；
  - `override_sentinel`、`s0.deny`、`retry_verify` 等“直接决定去向”的出口：把目标改写为对应的 `review`/`verify`，然后解除本原因；
  - `hand_back`：写 `pendingHandBack`（`mode` 必填）；选 `take_external` 时 `mode` 为空、不写 `pendingHandBack`，目标不变；
  - `discard_human_edits`：解除 `human`；`externalChange` 已存在时差异路径并入、基线保持首次值，目标不变（接管时已按 `takeoverFrom` 写入）；
  - 自动解除（`provider_unavailable` 恢复、卫星重建完成、`nested_repo_live` 条目消失等）：只解除，不改写。
- **唯一转移函数 `onAllReasonsCleared()`**：`pauseReason` 与 `alsoApplies` 全部为空时调用，且只在此处离开 `paused`：
  1. `pendingHandBack` 存在 → 执行它（`continue_agent` → `running`，注入 `tower.handback`；`reverify` → 新 pin 验证，`verifyOrigin:"human_change"`），清除它与继续目标；
  2. 否则执行继续目标：`run` → `run.requested{resume}`；`settle` → 回到 settle 序列；`verify` → 以该 pin 验证；`review` → 回到 `state`；`verify_new` → 以当前树生成新 pin 并验证（失败按 `origin` 决定是否自动返工：`human_change` 不自动返工）；
  3. **守卫**：目标为 `verify`/`review` 而当前树 ≠ 目标 pin 的树时，一律改为 `verify_new`（`origin` 取最近一次有归因的变化来源：人的采纳 → `human_change`，存活进程 → `agent_bg`）——任何路径都不会把与 pin 不同的树送进评审或以旧 pin 验证。
  - `nested_repo_live` 自动解除且是唯一原因时，**不**调用转移函数，改为 `paused(human)`（“条目已消失，确认后继续”），因为条目被谁删除并不清楚。
- **废弃**：`Goal.resumeTo`、`Goal.pendingVerify`、`externalChange.detectedIn` 及 `applyPendingHandBack` 作为独立入口（其逻辑并入第 1 步）。`externalChange` 只保留 `{paths, mixedPaths, baselineCps, detections}`。
- **`revert` 之后的剩余差异**（R15-D4-02）：只考察 **E 中的路径**——`restorePaths(基线, E)` 之后，E 中仍与基线不同的路径（只可能来自并发写入）才按归因表分类；E 之外的路径不参与判定，其归因由检查点链决定（drain 检查点中 Agent 工具写入为 `agent`，settle 序列中被追踪进程的刷写为 `agent`）。
- **用例**：G36g (a)–(f)（`paused(provider_unavailable)` 中检测后自动恢复再 `keep`；`s0_grant_pending` 中 `keep` 后授权；`sentinel_high` 中 `keep` 后覆盖；`take_external` 后 `keep`/`revert`；接管期间检测后放弃改动；`nested_repo_live` 条目在暂停中被删除）；G36b(h)（running 中检测、drain 期间 Agent 改其他文件、`revert` 后回到 `running` 不产生新检测；settle 序列中检测时有进程刷写）。

## ADR-135 Pi 交互的残留裁决 — Accepted（R15-D5-01、R15-D6-01、R15-D7-01、R15-D8-01；Amends ADR-128、ADR-129；macOS 进程组部分 Superseded by ADR-142；Amended by ADR-138、ADR-139）

- **宽限窗口的结束条件**：宽限确认以“连续 2 s `isStreaming=false` 且 `isCompacting=false`”为准，而不只是等待下一次 `agent_settled`——扩展在窗口内触发的手动压缩不会再发 `agent_settled`，压缩结束后重新开始计时。
- **nudge 守卫不满足时**（例如只有 human 标准、或 draining）：settle 时无有效提交 → 直接 `paused(idle_without_submit)`（Needs-You），不 nudge。`05` §5.5 的 settle 判定表补上这一行。
- **Tower 的话不以 user 角色出现**：恢复、返工、交接等由 Tower 发起的回合，以 `sendCustomMessage({customType:"tower.*"}, {triggerTurn:true})` 开始（Trace 标“Tower 注入”）；只有人亲手写的转向与回答以 user 角色出现。RPC 下 Tower 通过 tower-goal 注册的扩展命令（以 `prompt` 发送 `/tower-inject <id>`，由 tower-goal 的命令处理器调用 `pi.sendMessage`）完成同样的注入；`05` 以 v1.2.0 源码核对并登记依赖行。
- **macOS 进程追踪**：Pi 的 bash 让每条命令自成进程组。改为对**每个产生子进程的 bash 工具调用**持久化其进程组 id（每次调用一行，不随进程进出写事件）；重启时确认组长身份后按组终止；`setsid` 脱组且 < 5 s 的进程仍为已登记窗口。`run_process_groups` 表据此改为按工具调用记录。
- **`mixed` 的存放**：`Checkpoint.mixedPaths`（`06` `checkpoints.mixed_paths`）；评审单元以 `author:"mixed"` 显示，不作为“你的改动”。G36b 增加已知误判 (c)（存活进程期间人保存文件）一例。
- **`stop_condition` 的标识与出口**：`Contract.stopConditions[]` 每项有稳定的 `id`（合同版本内不变，修订时保留未改动项的 id），去重键 `stc:{goalId}:{conditionId}` 用它；三个选项：“继续” → `goal.resume`；“修订合同后继续” → `contract.amend` 后 `goal.resume`；“这里不该停” → `goal.resume{feedback:"stop_condition_false_positive"}`。`04` 增加卡片。

## ADR-136 git 与分类的残留裁决 — Accepted（R15-D11-01、R15-D13-01、R15-D14-01；Amends ADR-125、ADR-131、ADR-133；`:(exclude)` 循环重试 Superseded by ADR-139 补记（一次列举））

- **`~/.ssh/**` 整体属于 `credential`**（读与写）；默认良性清单的条目相应写为 `(credential, write, ~/.ssh/known_hosts)`——ADR-125 只禁止凭据**读取**进入良性清单。`user_config` 的规则采用包含式读法：顶层以 `.` 开头的目录**之内**的全部文件都属于它，减去 `credential` 与 `tower_data`。
- **重新 seal**：Goal 再次验收时，若本地分支的顶端仍是上一次的 seal，则新 seal 以它为父提交并更新分支；若顶端已不同（人已推送并在其上提交，或改动过分支），**不改写该分支**，改为创建 `<分支名>-v<n>` 并在验收面板中说明。
- **git 拒绝多条路径**〔已被 ADR-139 补记取代：一次列举，无重试上限〕：~~`:(exclude)` 重试改为循环——每次失败把被拒绝的路径加入排除集合后重试，直到成功；被拒绝路径超过 64 条或循环超过 64 次 → 按基础设施错误处理（`verify_env_error{stage:"integrity"}`，Needs-You）。~~
- **排期**：本轮各项按 WBS 行去重后若超出余量，**顺延**而不执行 ③、⑤（理由同 ADR-133）；结果记入 `14` §14.3.4 与 ADR-133 的补记。ADR-059 的范围表同步 ④′。

---

## 第 16 轮对抗评审后的跨文档决策（ADR-137 – ADR-139）

以下决策回应 `reviews/round-16.md`。

## ADR-137 继续目标的载荷、`claim` 目标与 `verifyFrom` 的写入点 — Accepted（R16-D4-01、R16-D4-02、R16-D7-01、R16-D13-01 第 2 项；Amends ADR-134；`run.openings`、`settle.adoptedHuman` Superseded by ADR-140；Amended by ADR-197、ADR-213）

- **`run` 带载荷**：`{kind:"run", openings: DecisionId[]}`。每个自带开场或返工语义的命令（`resume{note}`、`retry_after_human_change`、`verify_failed_limit` 的 `resume`、`request_changes`、`keep`/`revert` 的结果）在解除本原因时把自己的 `decisionId` **追加**到 `openings`；转移函数执行 `run` 时按顺序组装开场（`tower.handback`、返工证据、`request_changes` 的评论、`tower.external_resolved`、人的 note），没有载荷时为 `tower.resume`。`paused(sentinel_high)` 中的 `request_changes` 同样只解除本原因并追加载荷，不再直接发 `run.requested{rework}`。
- **`claim` 目标**：`claim_on_behalf` 改写为 `{kind:"claim", decisionId}`——转移函数执行时直接进入 `claimed`（引擎须已空闲），`verifyFrom = claimed`，验证 `trigger:"claimed"`，失败按 Agent 路径（内容是 Agent 的，人只是代为提交），Trace 记“人代为提交”。`03` L81、I4 与 `06`/`07`/`16` 统一为此。
- **`settle` 的定义**：从宽限确认（第 1 步）开始重新执行完整 settle 序列，有效提交保留。`retry_claim` 改写为 `settle`；settle 序列中**任何**原因进入的暂停，继续目标都是 `settle`（含人暂停、`app_quit`）。
- **pin 与 `claimed` 同一事务**：settle 序列改为 `agent_bg_done` 检查点 → I4 → 生成 pin 并进入 `claimed`（同一事务）。因此 `claimed` 中总有 pin，`Continuation.verify.pin` 保持必填。
- **`verifyFrom` 的写入点**：进入 `claimed` 时写 `claimed`；由 I2、`retry_verify`、`grant_s0_exec` 从 `in_review`/`accepted` 进入 `verifying` 时写该状态；`verify_new` 执行时写 `returnTo`，`returnTo` 为空时写 `claimed`（不沿用旧值）；`pendingHandBack.reverify` 的 `returnTo` = `takeoverFrom`（若 ∈ {`in_review`, `accepted`}）。继续目标中不另存 `verifyFrom`（`06`/`07` 同步）。
- **放弃改动不得自动开 Run**：`discard_human_edits` 在 `takeoverFrom = running` 或接管前的原因集合含 `human` 时，保留 `paused(human)`。
- **`budget.extend` 只提高额度**，不解除原因；`resume` 解除（`03`/`04` 的写法为准，`06` 同步）。
- **`nested_repo_live` 条目消失**：无论是否唯一原因，一律在剩余原因中加入 `human`。
- **在 `run`/`settle` 目标下 `keep`/`revert`**：`run` 目标的 `openings` 追加该决定，开场附 `tower.external_resolved{kept, reverted, mixed}`（≤ 120 token），要求不要回退已采纳的路径；`settle` 目标下 `keep` 时，本次验证 `verifyOrigin` 记为 `human_change`（失败不自动返工）。
- **观测到较旧的 seal 合入**：若被合入的不是最近一次验收的 seal，且 Goal 此后已有新内容，则只记 Fact `local_merged{seal}`，**不**进入 `integrated`；Goal 在 `accepted` 时转为 `in_review` 并提示“base 已含较旧版本”；人工编辑检出与活跃 Run 不变。

## ADR-138 drain 的目的原因持久化；进程组与 Pi 注入的残留 — Accepted（R16-D6-01、R16-D6-02、R16-D5-01；Amends ADR-115、ADR-129、ADR-135；单值 `drainingFor` Amended by ADR-141；进程组身份 Superseded by ADR-142）

- **`Goal.drainingFor = {reason, decisionId?, requestedAt}`**：drain 开始的同一事务中写入（`06` 列 `draining_for`）。drain 期间再收到暂停请求时按 `16` §16.1.1 的优先级合并：较高者成为 `drainingFor.reason`，较低者在 drain 结束时进入 `alsoApplies`。drain 结束时以 `drainingFor.reason` 进入 `paused`，并写继续目标。
- **CHECK**：`external_change` 列非空 ⇔ 原因集合含 `external_change` **或** `drainingFor.reason = "external_change"`——运行中检测到外部写入时 `externalChange` 可在 drain 开始时立即持久化。
- **drain 中崩溃或退出**：恢复时若有 `drainingFor`，进入该原因，`app_quit`/`engine_crash` 只进入 `alsoApplies`（它们在重启时自动解除），**不**触发 `autoResume`；外部写入不会被恢复前的 `safety` 检查点归入 Agent。
- **settle 判定表**：“nudge 守卫不成立 → 直接 `idle_without_submit`”只适用于**非 draining 且 `outcome = completed`**；draining 按 `drainingFor.reason`，`outcome ∈ {aborted, error}` 按 abort 原因 / provider 规则。
- **进程组身份**：组长可能已退出。身份确认改为“开机会话相同，且该 pgid 下至少有一个启动时间不早于该行写入时间的成员”；macOS 以 `proc_listpgrppids` 枚举成员并逐个确认后 `killpg`；组内无成员时删除该行。
- **nudge 窗口**：锚定**本 Run 的起点**（tower-goal 在 `before_agent_start` 记录起点，含 custom 消息触发的 Run），不再锚定最后一条 user 消息。
- **交还开场**：有人写的文字时，`tower.handback`（只含文件清单与“不得回退”）以 `triggerTurn:false` 追加，再以 `prompt` 发人的文字；没有时 `tower.handback` 以 `triggerTurn:true` 开场。人的意图不在 `tower.handback` 中重复。
- **返工证据只有一条注入路径**：开场的 `inject(tower.rework)`；`before_agent_start` 只在崩溃恢复时补发，且在 `messageType:"custom"` 与 `details.key` 相同时跳过。
- **`/tower-inject` 的前提**（D55）：RPC 握手后以 `get_commands` 确认 `tower-inject` 恰好出现一次且来源属于 tower-goal，否则不启动 Run 并提示；`prompt` 响应的 `disposition ≠ "handled"` 视为投递失败（终止该 Run，记 `engine.error`）；Tower 收到响应后才发下一条命令。C35 增加同名命令一例。
- **唤醒续跑**：`inject(tower.resume{reason:"wake"}, {triggerTurn:true})`，不用 `prompt`。

## ADR-139 停止条件的求值与再武装；超过拒绝上限；用例与 lint — Accepted（R16-D8-01、R16-D13-01 第 1 项、R16-D14-01、R16-D15-01；Amends ADR-135、ADR-136；`rework_cycles_over` 删除见 ADR-143；超过 64 的处理 Superseded by 本条补记（一次列举）；Amended by ADR-143）

- **停止条件的求值点**（M1 实现 `path_touched`、`command_matches`、`no_progress_for`、`rework_cycles_over`；`natural` 只作为注入给模型的文字，模型以 `ask_user` 提问，产生 `question` 而非 `stop_condition`）：
  - `path_touched`/`command_matches`：在 gate 中、工具执行**之前**求值；命中即拒绝该调用（返回“停止条件：需要人确认”），drain，进入 `paused(stop_condition)`；
  - `no_progress_for`：Supervisor 计时器；`rework_cycles_over`：返工开始时求值。
- **再武装**：“继续” → 该条件对本次命中的对象（路径 glob 匹配到的具体路径、具体命令）静默到本 Run 结束，`no_progress_for` 计时器重置，`rework_cycles_over` 的阈值相对当前次数重新计；“这里不该停” → 该条件静默到下一次合同修订。
- **拒绝路径超过 64 条或循环超过 64 次**〔“64”上限已随一次列举取消，见本条补记；“不是 `verify_env_error`”保留〕：不再标为 `verify_env_error`。检查点/pin 以已排除的路径完成，以 `nested_repo`（列出全部被拒绝的路径，唯一出口“删除这些条目”）阻断 Verified；`running` 中按 `nested_repo_live` 进入 `paused(sentinel_high)`。
- **排期**：本轮工作按 WBS 行去重后记入 ADR-133 补记；超出余量时按 ADR-136 顺延，不执行 ③、⑤。
- **lint**：`Continuation` 的字面形状须等于 `02` 的定义；`03` §3.2.1 “命令 / 守卫”列中的每个命令与 `06` §6.4.3 对应行的改写目标一致；(z) 扩展到 `00` 与 `03` §3.2。
- **第 16 轮补记（ADR-139）**：被拒绝路径的处理由“逐次重试”（ADR-136）改为**一次列举**——Tower 先按 `10` §10.1.2 的名字规则列出 git 在 `protectHFS/NTFS` 下会拒绝的全部路径，一次性 `:(exclude)` 后再 `add`（唯一定义在 `10` §10.7.1），因此不存在重试上限；列出的路径全部以 `nested_repo`（运行中为 `nested_repo_live`）阻断。`settle` 目标下 `keep` 置 `Continuation.settle.adoptedHuman`，重跑 settle 后本次验证 `verifyOrigin = human_change`，不被 `agent_submit` 覆盖（`02`）。

---

## 第 17 轮对抗评审后的跨文档决策（ADR-140 – ADR-143）

以下决策回应 `reviews/round-17.md`。本轮的原则：**以删减与合并关闭问题类，而不是为每个组合再加规则。**

## ADR-140 继续目标只表示“去哪里”；开场载荷与“人的改动”另存，由事实推导 — Accepted（R17-D4-01、R17-D4-03 第 1 项；Supersedes ADR-137 的 `run.openings` 与 `settle.adoptedHuman`；Amended by ADR-144）

- **`Continuation` 回到纯目标**：`{kind:"run"}` · `{kind:"settle"}` · `{kind:"claim", decisionId}` · `{kind:"verify", pin}` · `{kind:"review", state, pin}` · `{kind:"verify_new", returnTo?}`。改写只换目标，不携带数据，因此改写不会丢失任何东西。
- **开场载荷独立排队**：`Goal.pendingOpenings: DecisionId[]`——自带开场的决定（`resume{note}`、`retry_after_human_change`、`request_changes`、`keep`/`revert` 的 `tower.external_resolved`、交还）追加到这里；**下一次任何 Run 开始时**（无论由继续目标 `run` 还是 `pendingHandBack` 触发）按追加顺序全部消费并清空。执行 `pendingHandBack` 不清空它。没有 Run 开始的路径（验证、评审）不消费，留到下一次 Run。
- **是否自动返工由归因决定**（取代 `verifyOrigin`/`origin`/`adoptedHuman` 的分支）：验证失败时，若自**上一个已验证 pin**（没有则 base）以来的变化中**存在 `author:"human"` 或 `mixed` 的检查点**（人的采纳、交还、接管编辑），则不自动返工，进入 `paused(human_change_verify_failed)`；否则按 Agent 路径（返工 < 上限）。`verifyOrigin` 只保留为 Trace 与 Fact 的说明字段，不再决定去向。
- **预算**：任何 Run 开始（含自动返工）前检查预算；已达硬上限 → `paused(budget_hard_cap)`，不越过上限。
- **`discard_human_edits` 所需的状态持久化**：`take_over` 时记 `Goal.takeoverPriorReasons`（接管前的原因集合）；“保留 `paused(human)`”的判定只读这个字段与 `takeoverFrom`。

## ADR-141 drain 的目的改为集合；崩溃时保守处理 — Accepted（R17-D6-01；Amends ADR-138；Amended by ADR-144；Amended by ADR-145）

- **`Goal.drainingFor = {target, reasons: PauseReason[], decisionIds}`**，`target ∈ {"pause", "take_over", "rewind", "dependency"}`。drain 期间到达的暂停请求只**并入集合**（不覆盖、无需排序）；drain 结束时 `pauseReason` = 集合中按 `16` §16.1.1 优先级最高者，其余进入 `alsoApplies`。
- **CHECK**：`external_change` 列非空 ⇔ `pause_reason`/`also_applies`/`draining_for.reasons` 任一含 `external_change`。
- **崩溃恢复**（唯一规则）：有 `drainingFor` 时——`target = pause`：以集合进入 `paused`，其中的 `app_quit`/`engine_crash` 在启动时自动解除；若集合中只有 `app_quit`，等同于正常的应用退出（按 `autoResume` 设置）。`target ∈ {take_over, rewind}`：进入 `paused(human)`（人发起的操作中途中断，不自动继续，由人重做）。`target = dependency`：进入 `ready{waitReason:"dependency"}`。
- 接管、回退与依赖回退的 drain 因此都可表示。

## ADR-142 后台进程以 Run 令牌识别 — Accepted（R17-D6-02；Supersedes ADR-115/121/128/135/138 中以 pid、启动时间、进程组识别进程的规则；Amended by ADR-144；Amended by ADR-145；Amended by ADR-146）

- 每个 Run 生成 128 位随机令牌 `TOWER_RUN_TOKEN`，由 Tower 提供的 `BashOperations`（`05` §5.3 `createSandboxedBashOperations`，依赖行 D38：`BashSpawnHook` 可改写 `env`）注入每条命令的环境；子孙进程继承它。**持久化的只有令牌**（每 Run 一行，`06` `runs.process_token`），不再随进程进出写事件或行。
- **识别**：同一用户、同一开机会话中，环境里含该令牌的进程即属于该 Run。macOS 以 `sysctl(KERN_PROCARGS2)` 读取环境，Linux 仍以 cgroup 为主、令牌为辅。settle 时终止与重启后清理都按令牌枚举；对每个进程发信号前再读一次环境确认令牌（防 pid 复用）。
- **已登记窗口**：主动清空环境的进程识别不到（与此前“`setsid` 脱组”窗口同类，范围更小），按已知误判 (b) 处理。
- `bash_process_groups`、`agent_processes` 的逐进程持久化与相关事件删除；`13` 中对应的写入预算随之删除。

## ADR-143 其余残留的合并裁决 — Accepted（R17-D4-02、R17-D4-03、R17-D5-01、R17-D8-01、R17-D13-01；Amends ADR-139）

- **删除停止条件 `rework_cycles_over`**：它与 I6 的返工上限重复。返工上限只由 I6 定义（`verify_failed_limit`），合同可以设定上限值。M1 的停止条件为 `path_touched`、`command_matches`、`no_progress_for`。
- **`settle` 在 Host 不存在时**（重启后）：加载会话、不开 Run；引擎空闲即视为宽限满足；按令牌终止残留进程；`agent_bg_done` 检查点；I4 以持久化的工具事件判定；pin 与 `claimed` 同一事务。
- **`/tower-inject` 的唯一性**：每次注入前都以 `get_commands` 确认（成本可忽略），不只在握手时；不唯一时该次注入改用 SDK 不可用的降级——终止 Run 并提示用户禁用同名命令的扩展。
- **开场为多段**：`RunOpening = {tower: TowerMessage[], human?: string}`，`tower` 中的消息按 `pendingOpenings` 的顺序依次以 `triggerTurn:false` 追加，最后一条以 `triggerTurn:true`（或以 `prompt(human)`）开始回合。
- **nudge 窗口起点**持久化为会话条目（`appendEntry("tower.run_start")`），重启与分叉后从分支上重建。
- **`idle_without_submit` 的选项**唯一定义在 `03` §3.2.1：`resume`（可附转向）、`claim_on_behalf`、`abandon`；`04`、`05`、`08` 引用。
- **`integrated` 的条件**（唯一定义在 `10` §10.12）：被合入的 seal 是最近一次验收的 seal，**且**没有人工编辑检出、没有活跃 Run、卫星树等于该 seal 的树。否则只记 Fact `local_merged`，并按 ADR-137 的“较旧版本”处理。
- **排期**：按 ADR-136 顺延，不执行 ③、⑤；本轮删除项（逐进程持久化、`rework_cycles_over`、`adoptedHuman` 分支）可抵扣的工作量计入。
- **第 17 轮补记（ADR-143）**：停止条件“继续”的静默范围绑定到**“继续”之后开始的那个 Run**（`runId` 在该 Run 启动时填入，Run 结束时清除）。中断的接管或回退在重启后进入 `paused(human)`，卡片说明“上次的操作未完成，请重新执行”；这不是新的 Needs-You 种类（`paused(human)` 本来就不生成 Needs-You），只是暂停原因的说明文案。
- **第 17 轮补记 2（ADR-143）**：守卫把 `verify` 改写为 `verify_new` 时，`returnTo` 取当时的 `Goal.verifyFrom`（若 ∈ {`in_review`, `accepted`}），不重置为 `claimed`——从评审进入的验证被暂停后再恢复，仍按评审来源判定验收延续。`verifyFrom` 的写入点补上 `bring_back` 与标准修订。

---

## 第 18 轮对抗评审后的跨文档决策（ADR-144）

## ADR-144 第 18 轮的合并裁决 — Accepted（R18 全部条目；Amends ADR-140、ADR-141、ADR-142；Amended by ADR-145；Amended by ADR-146）

- **自动返工的归因窗口**（R18-D4-01，唯一定义在 `03` §3.2.1）：
  - **人的改动** = `author:"human"` 的检查点，或 `mixedPaths` 非空的检查点（检查点的 `author` 只有 `agent`/`human`，“mixed”是路径级标注，不是作者值）。
  - **窗口起点** = 以下两者中较晚者：最近一次**通过**的验证的 pin；人最近一次**明确把工作交给 Agent** 的决定（`hand_back{continue_agent}`、`retry_after_human_change`、`request_changes`）。
  - 窗口内有人的改动 → 验证失败不自动返工（`paused(human_change_verify_failed)`）；否则按 Agent 路径。人把工作交回 Agent 之后，自动返工随之恢复。
- **非 `pause` 目标的 drain 期间到达暂停原因**（R18-D6-01）：`take_over`/`rewind`/`dependency` 的 drain 期间若有任何暂停原因并入 `reasons`，drain 结束时**放弃原目标**，Goal 进入 `paused(reasons ∪ {human})`（人需在原因处理后重做接管或回退；依赖回退在离开暂停时重新判定）。崩溃恢复同一规则。回退因此不会覆盖未处置的外部写入。settle 序列中崩溃 → 继续目标 `settle`（按 ADR-143 的 Host 不存在规则执行）。
- **硬上限下的验证失败**（R18-D4-02）：Agent 路径的返工因硬上限不能开始 → 进入 `paused(budget_hard_cap)`，继续目标 `run`；返工证据入队。`pendingOpenings` 的元素改为 `OpeningRef = {decisionId} | {factId}`（返工证据引用验证失败的 Fact）。
- **Run 令牌的注入点**（R18-D5-01）：令牌由 Tower 的 `BashOperations.exec` 实现**自身**加入环境，不依赖 `spawnHook`——v1.2.0 中 `user_bash` 调用 `operations.exec` 时不带 env、不经 `spawnHook`（`bash-executor.ts`），而 `operations` 是 Tower 的实现，两条路径都经过它。`tower.run_start` 每个 **Tower Run** 只写一次（Run 开始时），不随 Pi 内部的 run 重写。
- **进程扫描的频率与预算**（R18-D6-02）：只在 settle 终止、重启清理、以及 watcher 检测到来源不明写入时（用于判断是否处于存活进程期间）扫描，不做持续扫描；`bg_process_survived` 条目打开期间每 30 s 重新扫描，存活者全部退出时以 `obsolete` 自动关闭。删除“窗口更小”的断言，改为如实列出窗口：清空环境的进程。`13` 给出单次扫描的预算。
- **读取其他进程环境的约束**（R18-D11-01）：只在内存中匹配令牌，不记录、不持久化、不传输任何其他环境内容；匹配逻辑不对非本用户的进程运行。
- **开场队列可见、可撤回**（R18-D8-01）：Goal 卡片与暂停卡片显示“下次运行开场：N 条”，展开可逐条撤回（命令 ~~`goal.openings.withdraw{goalId, index}`~~〔已由本条补记更正为 `{goalId, openingId}`〕，撤回记 `HumanDecision{withdraw_opening}`）；Tower 自己产生的条目（返工证据、外部改动说明）同样可撤回，撤回后 Agent 不会收到它。
- **排期**：按 ADR-136 的规则；系统线余量不足时先在线间改派，仍不足则顺延，记入 ADR-133 补记。
- **第 18 轮补记（ADR-144）**：开场队列的元素带入队时分配的稳定 `id`（`OpeningRef = {id, decisionId} | {id, factId}`），撤回命令为 `goal.openings.withdraw{goalId, openingId}`——按 id 撤回，已不存在的 id 返回成功（幂等），两个客户端同时撤回不会误删相邻条目。“人代为提交”（`claim_on_behalf`）不算“把工作交给 Agent”，不重置归因窗口。
- **第 18 轮补记 2（ADR-144）**：`user_bash`（人在会话中直接输入的命令 `!cmd`；M1 不提供，见 `00` §0.5.1）在 M2 中使用**另一个** `BashOperations` 实例，它注入同一 Run 令牌并附加 `TOWER_ORIGIN=human`；该调用窗口内的写入及其后台进程的写入归因为 `author:"human"`（人亲手执行），settle 时这些进程同样被终止。工具路径的实例附加 `TOWER_ORIGIN=agent`。
- **第 18 轮 lint 裁决（ADR-139/144 附）**：U1——一次列举之后仍保留**兜底重试**（Tower 的名字规则漏判、git 仍拒绝某条路径时，把该路径加入排除集合再试），兜底最多 64 次；〔第 19 轮更正：〕超过时停止逐条重试，改为把**全部已拒绝路径的父目录**整体排除后再生成一次树——这一步总能完成，检查点与 pin 照常生成，被排除的目录列入 `excludedPaths` 并以 `nested_repo`（运行中为 `nested_repo_live`）阻断，记 Fact 列出已拒绝路径，**仍不是** `verify_env_error`（`10` §10.1.2 为唯一定义）。U2——不设“rebase 触发”的单独例外：**rebase（M2）带入的 base 变化计为归因窗口内的“人的改动”**（来自人类同事的代码，不是本 Agent 的），因此失败去向仍只由归因窗口决定；`03`、`07` 中“或本次由 rebase 触发”的写法改为引用这一定义。

---

## 第 19 轮对抗评审后的跨文档决策（ADR-145）

## ADR-145 第 19 轮的合并裁决 — Accepted（R19 全部条目；Amends ADR-141、ADR-142、ADR-144；Amended by ADR-146；Amended by ADR-147；Amended by ADR-148；Amended by ADR-187；Amended by ADR-217）

- **归因窗口的次序**（R19-D4-01）：窗口以**事件序号**界定——计入事件序号大于起点事件的检查点。交还第 8 步的 `human_edit` 检查点在 `HumanDecision{hand_back}` 事件**之前**写入（同一事务内先检查点、后决定），因此不在由该交还开启的窗口内。**“通过”**= 验证结果使 Goal 进入 `in_review`（已验证、有保留的已验证、未经机器验证），或验收延续使 Goal 回到 `accepted`；`03`、`07`、`16` 统一为此。
- **settle 中崩溃的识别**（R19-D6-01）：settle 序列开始时在同一事务中写 `runs.phase = 'settling'`，恢复表据此区分“settle 中崩溃”（→ 继续目标 `settle`）与“Run 中崩溃”。**drain 期间再请求另一个目标**（接管、回退）→ 返回 `E_BUSY`（“等待当前步骤结束后重试”），只有暂停原因可以并入。`run.rewind` 在 `external_change` 未解除时返回 `E_STATE`（与 `take_over` 相同）。
- **macOS 的每 Goal 内存上限**（R19-D6-02）：Tower 的 `exec` 知道自己直接启动的命令进程，每 5 s 以 `proc_pidinfo` 采样这些已知 pid（不是全进程扫描）；直接进程的内存之和超过上限的 80% 时，做一次令牌扫描计入后台进程，超过上限按 `13` 处理。“不做持续的全进程扫描”保持成立。
- **离开暂停后需要等待**（R19-D4-02）：`onAllReasonsCleared()` 执行 `run` 目标时若无执行槽位或依赖未满足 → 进入 `ready{waitReason}`，`pendingOpenings` 保留，准入后开 Run。`03` 增加 `paused → ready` 边；`budget_hard_cap` 的入口补上“`verifying` 失败后自动返工因硬上限不能开始”。
- **撤回已发送的开场**（R19-D8-01）：开场在 Run 开始时（`run.started` 事件的同一事务）被消费。撤回一个已消费的 id 返回 `already_delivered`，界面提示“已发送，无法撤回”；撤回一个已撤回的 id 返回成功（幂等）。
- **一致性**（R19-D15-01）：cgroup 为每 Goal 一个父 cgroup、每 Run 一个子 cgroup；“知悉”`bg_process_survived` **不**结束存活进程期间的归因规则，只有存活者全部退出才结束。
- **不信任可被 Agent 设置的环境值来做归因**（R19-D7-01，M2）：`TOWER_ORIGIN` 只用于诊断，不作为归因依据。归因为人的只有 Tower 自己知道的 `user_bash` **调用窗口**内的写入（由哪个 `BashOperations` 实例调用，Tower 在调用时即知）；`user_bash` 启动的后台进程的写入按存活进程规则记为 `agent`。失败卡片对 rebase 带入的变化写“包含 base 的变化（rebase）”，不写“你的改动”。

---

## 第 20 轮对抗评审后的跨文档决策（ADR-146）

## ADR-146 第 20 轮的合并裁决 — Accepted（R20 全部条目；Amends ADR-142、ADR-144、ADR-145；Amended by ADR-147）

- **任何要开 Run 的转移都经过准入**（R20-D4-01）：自动返工、`request_changes`、`retry_after_human_change`、交还 `continue_agent`、`resume` 与继续目标 `run`——无执行槽位或依赖未满足时一律进入 `ready{waitReason}`，`pendingOpenings` 保留，准入后开 Run（准入步骤以 `06` §6.2.4 为唯一定义）。`ready` 中允许 🧑 `pause`（→ `paused(human)`，继续目标 `run`）、`take_over`、`abandon`。
- **`runs.phase` 的复位**（R20-D6-01）：settle 序列中撤回（宽限内或 `claimed`/`verifying` 中出现 `agent_start`）时，在同一事务中把 `runs.phase` 写回 `running`。重启后执行继续目标 `settle` 而 I4(a) 判定无有效提交 → 按 settle 判定表（非 draining、`outcome = completed`）进入 `paused(idle_without_submit)` 或 nudge。
- **macOS 内存上限的采样对象**（R20-D10-01）：每 5 s 从 Tower `exec` 已知的直接进程出发，以 `proc_listchildpids` 递归遍历其**后代树**（不是全进程扫描）求和；脱离进程树的后台进程由**令牌全扫描**覆盖——Run 活跃且 Goal 设有内存上限时最多每 60 s 一次（`13` 预算：1000 进程 ≤ 50 ms）。“不做持续的全进程扫描”改为“全进程扫描最多每 60 s 一次，且只在 Run 活跃时”。G35c(u) 据此改写。
- **M2 `!cmd` 与 Agent 工具调用并发**（R20-D7-01）：`user_bash` 调用窗口与 Agent 工具调用窗口重叠期间写入的路径记为 `mixedPaths`（不记为纯 `human`）；不重叠时才按人的调用窗口归因。失败卡片与状态标签对只有 rebase 变化的情形写“包含 base 的变化（rebase）”。
- **`boundSeq` 不随 rebase 移动**（R20-D4-02）：它固定为 Goal 绑定时的事件序号；rebase 带入的变化由 `rebase` 检查点计入窗口。多仓库 Goal：窗口按仓库分别计算（各 binding 的 `boundSeq` 与该仓库的检查点），任一仓库窗口内有人的改动即视为有人的改动。
- **一致性**（R20-D15-01）：`ProtoError.code` 增加 `E_BUSY`；`06` 增加 `bindings.bound_seq` 列；`03` §3.2 `verifying` 行补上 `→ paused(budget_hard_cap)`（按归因应自动返工而预算已达硬上限）。

---

## 第 21 轮对抗评审后的跨文档决策（ADR-147）

## ADR-147 `ready` 的排队类别与出口；M2 `!cmd` 的剩余归因 — Accepted（R21 全部条目；Amends ADR-145、ADR-146；Amended by ADR-148）

- **排队的 Run 带类别**（R21-D4-02）：`Goal.queuedRun?: {kind: "initial" | "resume" | "rework" | "handback", decisionId?}`——任何要开 Run 的转移因准入失败进入 `ready` 时写入；准入按它的类别判定（只有 `initial` 受评审余量闸控，与 `03` `ready` 行一致），`run.requested{kind}` 在准入通过时以它发出。**`reworkCycles` 在 `decide()` 选择返工的那一刻递增**（不论随后直接开 Run 还是进入 `ready` 排队），I6 因此不可能被排队绕过；排队中的返工被人 `pause`/`abandon` 时计数不回退。
- **`ready` 的出口补全**（R21-D4-01）：
  - `take_over` 只在卫星已存在时提供（Goal 至少运行过一次）；刚批准、从未运行的 `ready` Goal 不显示“我来改”。`06` `takeover_from` 的 CHECK 加入 `ready`。
  - 自 `ready` 接管后放弃改动 → 保持 `paused(human)`（与 `takeoverFrom = running` 相同，不自动开 Run，ADR-137），继续目标 `run`，`queuedRun` 保留。
  - `ready` 中检测到来源不明的写入（卫星已存在时）→ `paused(external_change)`，继续目标 `run`，`queuedRun` 保留；`03` 的入口清单与继续目标写入规则补上 `ready`。
  - **准入已通过、`run.started` 之前**（准备阶段）：`pause`/`take_over`/`abandon` 返回 `E_BUSY`（“正在启动，稍后重试”），准备阶段结束后按 `running` 处理。
- **M2 `!cmd` 期间的 Agent 后台进程**（R21-D7-01）：`user_bash` 窗口内，若有**不属于该 `user_bash` 调用进程树**的 Agent 进程仍存活（Tower 以两个 `BashOperations` 实例各自已知的直接 pid 及其后代区分），该窗口内的写入一律记为 `mixedPaths`；只有没有其他 Agent 进程存活时才归因为人。`05` 中“`user_bash` 返回与工具路径相同的 `sandboxedOps` 实例”的说法改为两个实例（ADR-144 补记 2）。

---

## 第 22 轮对抗评审后的跨文档决策（ADR-148）

## ADR-148 `queuedRun` 的完整生命周期；准备阶段的失败出口 — Accepted（R22 全部条目；Amends ADR-145、ADR-147；补记的“两段准备” Superseded by ADR-149，其余 Amended by ADR-149；Amended by ADR-150）

- **`ready` 中 `queuedRun` 恒非空**（R22-D4-01）：合同批准进入 `ready` 写 `{kind:"initial"}`；依赖回退进入 `ready` 写 `{kind:"resume"}`；其余按 ADR-147。`06` 以 CHECK 保证 `state = 'ready'` ⇒ `queued_run IS NOT NULL`。**`initial` = 该 Goal 的第一次启动**（只有它受评审余量闸控）。`Run.reason` 的 CHECK 加入 `handback`（`queuedRun.kind` 与 `Run.reason` 一一对应）。`queuedRun` 在 **`run.started` 的同一事务**中清除（不是在准入时）；恢复表增加两行：`ready` → 保持 `ready` 并重新判定准入；准备阶段中崩溃（已准入、无 `run.started`）→ 回到 `ready`，`queuedRun` 保留。
- **准备阶段有界且有失败出口**（R22-D6-01）：准备阶段（卫星创建、Host 握手、开场组装）总时限 120 s。失败或超时 → `paused(engine_crash)`，继续目标 `run`，`queuedRun` 保留，**不** `autoResume`（避免重复失败），生成 `stalled{prepare_failed}`，选项：重试（`resume`）、我来改（仅当卫星已存在）、放弃。准备阶段中 `pause`/`take_over` 返回 `E_BUSY`（至多 120 s）；**`abandon` 始终允许**——它中止准备并进入 `abandoned`（与 `03` “任何非终态可放弃”一致）。
- **放弃改动的唯一来源同步**（R22-D15-01）：`03` §3.2.1 `human` 行写为“`takeoverFrom ∈ {running, ready}` 或 `takeoverPriorReasons` 含 `human` 时不解除 `human`”；`07` 同步。
- **第 22 轮补记（ADR-148）**：准备阶段分两段。① **依赖物化**（depcache 命中时 CoW 物化，未命中时由安装器构建）**不计入** 120 s，单独以 `prepare.depsTimeoutMin`（默认 15 分钟，`16` §16.2.2）为限；这一段中 `pause`（中止物化 → `paused(human)`，继续目标 `run`，`queuedRun` 保留）与 `abandon` 都允许，`take_over` 返回 `E_BUSY`；卡片显示 `依赖准备中 · <阶段> · <进度>`。超时或安装器失败 → 同一失败出口（`paused(engine_crash)`、`stalled{prepare_failed}`，原因写明“依赖准备失败”）。② **启动**（卫星创建或复用、Host 握手、开场组装）**总时限 120 s**，规则如本条正文。

---

## 第 23 轮对抗评审后的跨文档决策（ADR-149）

## ADR-149 准备阶段回到原有顺序；启动失败有独立的暂停原因 — Accepted（R23 全部条目；Supersedes ADR-148 补记的“两段准备”，Amends ADR-148；Amended by ADR-150）

- **顺序与时限**（R23-D6-01）：准备阶段的步骤顺序以 `10` §10.3.1 为唯一定义（先创建或复用卫星，再物化依赖，再 Host 握手与开场组装）。**依赖物化不阻止 Run**（恢复原规则）：安装器失败或超过 `prepare.depsTimeoutMin`（15 分钟）→ Goal 以 Fact `prepare{ok:false}` 照常进入 `running`，Agent 简报附失败日志尾部——修复 lockfile 正可能是这个 Goal 的工作。**120 s 时限**只计除依赖物化之外的步骤（卫星创建或复用、Host 握手、开场组装）。依赖物化期间 `pause` 允许并中止物化（→ `paused(human)`，继续目标 `run`），`take_over` 返回 `E_BUSY`，`abandon` 始终允许；其余步骤期间 `pause`/`take_over` 返回 `E_BUSY`。验证器自己的安装器失败仍按 `verify_env_error` 处理，与此无关。
- **新的暂停原因 `prepare_failed`**（R23-D6-01 第 3 项、R23-D6-02）：卫星创建失败（含 `10` §10.3.1 步骤 2 的路径冲突，卫星记 `broken`）、Host 握手失败、开场组装失败或 120 s 超时 → `paused(prepare_failed)`（不是 `engine_crash`），继续目标 `run`，`queuedRun` 保留。它**不在启动时自动解除**，也不 `autoResume`。出口：`resume`（重试；路径冲突时先改名重建卫星）、`take_over`（仅当卫星已存在且可用）、`abandon`。Needs-You 为 `stalled{prepare_failed}`（去重键 `st:{goalId}:prepare`）。优先级登记于 `16` §16.1.1。
- **准备中途到达其他原因**（R23-D6-03）：外部写入或任何系统暂停原因到达时，中止准备，Goal 以这些原因进入 `paused`，继续目标 `run`，`queuedRun` 保留（与 `drainingFor{target:"pause"}` 相同的合并规则）。
- **`queuedRun` 的写入表与清除**（R23-D4-01）：`16` 给出完整的“转移 → `queuedRun.kind`”表（合同批准 → `initial`；依赖回退、`resume`、继续目标 `run` → `resume`；自动返工、`request_changes`、`retry_after_human_change` → `rework`；交还 `continue_agent` → `handback`）；不经排队直接开 Run 时 `Run.reason` 取同一映射（立即执行的交还记 `handback`）。`queuedRun` 只在 `run.started` 与 `abandon` 时清除；`pause`、`take_over`、`external_change`、`prepare_failed` 保留它。`02` `Run.reason` 加入 `handback`。
- **第 23 轮补记（ADR-149）**：`prepare_failed` 归入“交还即解除”一组——交还意味着人在场并显式决定继续，随后的 Run 照常经准入与准备，失败会重新进入 `prepare_failed`。增 1 人备选方案由 32 周改为 **33 周**（本轮之后的余量不足 0.02 工作周，按实记录；`14` §14.3.4）。

---

## 第 24 轮对抗评审后的跨文档决策（ADR-150）

## ADR-150 仓库准备（含 LFS）独立计时；准备的恢复判定；`queuedRun` 的优先规则 — Accepted（R24 全部条目；Amends ADR-074、ADR-148、ADR-149；Amended by ADR-151）

- **仓库准备是准备阶段的第一段，单独计时**（R24-D13-01、R24-D6-01）：镜像首次建立（含跨卷完整复制）、等待项目锁、远端 fetch、**LFS 对象补齐**合称“仓库准备”，以 `prepare.repoTimeoutMin`（默认 15 分钟）为限，**不计入** 120 s。
  - **LFS 补齐**（`10` §10.3.1 步骤 2a，检出之前）：先从用户主检出的 LFS 对象库以 CoW 复制 base 所需的对象到镜像的 LFS 库；仍缺的对象由 Tower 的 GitRunner 在**沙箱外**以用户自己的 git 凭据配置（credential helper）从项目远端获取——凭据从不进入卫星或 Agent 环境，网络只对这一条命令开放。与安装器无关，非 Node 项目同样适用。
  - 补齐失败或超时 → `paused(prepare_failed)`（原因“LFS 对象缺失：<数量>”）——不允许 Agent 在指针文件上工作。
  - 120 s 只计：卫星检出（`clone --shared` 与 checkout）、Host 握手、开场组装。
  - **重试从已完成的步骤继续**：各步骤幂等，已存在且校验通过的镜像、LFS 对象与卫星直接复用。
- **准备中断的恢复判定**（R24-D6-02）：准入时写 `goals.preparing_since`，在 `run.started`、中止或失败时清除。启动恢复只对 **`state = ready` 且 `preparing_since` 非空且没有任何暂停原因** 的 Goal 生效（回到排队）；已暂停的 Goal（人在依赖物化期间暂停、外部写入等）不受影响。
- **`queuedRun` 的优先规则**（R24-D4-01）：已保留的 `queuedRun` 优先于写入表；写入表只在 `queuedRun` 为空时适用——因此 `prepare_failed` 后重试的首次启动仍是 `initial`，继续受评审余量闸控。**人的显式决定覆盖**保留值：交还 `continue_agent` → `handback`，`request_changes`、`retry_after_human_change` → `rework`。自动路径（继续目标 `run`、`resume`）不覆盖。
- **安装器日志尾部的脱敏**（R24-D11-01）：注入 Agent 开场之前，经 `11` §11.7 的同一套脱敏（精确匹配与模式）；`11` §11.7 的注入路径清单加入这一条。
- **一致性**（R24-D15-01、R24-D14-01）：`prepare_failed` 在 `06` 与 `04` 的交还说明中列入“交还即解除”；`14` L392 的“各线可吸收 0.6–0.8 人周”改为按当前余量如实表述。
- **排期**：本轮工作按线分派——用例与文案给设计线，LFS 凭据与网络开放给安全线，其余给系统线；系统线余量不足时按 ADR-136 顺延并记补记。
- **第 24 轮补记（ADR-150）**：仓库准备段（可能长达 15 分钟）中 `pause` **允许**并中止该段（→ `paused(human)`，继续目标 `run`，`queuedRun` 保留；已完成的部分在重试时复用），与依赖物化相同；`take_over` 返回 `E_BUSY`，`abandon` 允许。进度以事件 `prepare.progress{step: "mirror" | "lock" | "fetch" | "lfs" | "deps", done, total, bytes?}` 上报（`06` 事件表、`16` 登记），卡片与实况行据此显示。

---

## 第 25 轮对抗评审后的跨文档决策（ADR-151）

## ADR-151 LFS 获取的执行上下文；检出归入仓库准备；`queuedRun` 的清除点 — Accepted（R25 全部条目；Amends ADR-150；Amended by ADR-152：LFS 凭据精确匹配一句撤回；Amended by ADR-153）

- **LFS 获取的执行上下文**（R25-D13-01）：缺失对象的获取**不**在 GitRunner 的 git-only 沙箱中进行，而是由 Tower 以**用户身份、在 Agent 沙箱之外**执行一条 `git lfs fetch`，作用对象只有 Tower 的镜像：
  - **配置来源**：用户的全局与系统 git 配置（含 credential helper、ssh 配置）照常生效；仓库级配置不读镜像中的任何内容，只由 Tower 从**用户主检出**复制 `remote.<name>.url` 与 `lfs.url`，`.lfsconfig` 取 base 提交中的版本（用户的内容，不是 Agent 的）。`10` §10.1.2 的加固清单**不适用于这条命令**，因为它不处理任何 Agent 可控的内容；清单中写明这一例外。
  - **网络**：不限制主机——LFS batch API 返回的下载地址可能在其他主机（如对象存储），这与用户自己执行 `git lfs pull` 的行为相同。
  - Agent 不能影响这条命令的任何输入（URL、配置、要获取的对象清单都来自 base 与用户主检出），因此放宽网络不扩大 Agent 的能力。
- **检出归入仓库准备**（R25-D6-01）：卫星检出（含 LFS 内容写出）计入仓库准备段（15 分钟），**120 s 只计 Host 握手与开场组装**。检出以完成标记文件判定；重试时若卫星存在而标记缺失，删除工作目录后重新检出（gitdir 与影子保留）。代码块中的步骤顺序改为：仓库准备（镜像 → 项目锁 → fetch → LFS 补齐 → `clone --shared` 与检出）→ 依赖物化 → 握手与开场。
- **接管的守卫**（R25-D4-01）：`take_over` 要求卫星**已完成检出**（完成标记存在）；否则返回 `E_STATE`（“工作区尚未建立”），界面不提供“我来改”。
- **`queuedRun` 的清除点**（R25-D4-02）：`run.started`、`abandon`，以及 Goal **进入 `ready`/`paused` 以外的任何状态**时（例如交还 `reverify` 进入 `verifying`）清除。`decide()` 选择返工时 `queuedRun` 必然为空（上一次 Run 开始时已清除），因此写入 `rework` 与“自动路径不覆盖”不冲突；`07` 加注这一点。
- **脱敏的精确匹配集合**（R25-D11-01）：包括 Tower 知道的全部机密——密钥库条目、模型提供商密钥、安装器的注册表令牌（`$TI`）、LFS 获取期间 credential helper 返回的凭据（只在内存中参与匹配）。
- **一致性**（R25-D15-01）：`prepare_failed` 的定义在 `02`、`03`、`08`、`16` 统一为本条；`prepare.progress.step` 取值统一为 `mirror | lock | fetch | lfs | checkout | deps | handshake`。

---

## 第 26 轮对抗评审后的跨文档决策（ADR-152）

## ADR-152 LFS 获取的配置显式传入；输出不经 Agent；未建成的卫星不算丢失 — Accepted（R26 全部条目；Amends ADR-151；Amended by ADR-153；Amended by ADR-154：配置改由 0600 临时文件传入）

- **LFS 端点显式传入**（R26-D13-01）：镜像是裸仓库，git-lfs 在裸仓库中只从 `HEAD` 读 `.lfsconfig`，而镜像的 `HEAD` 为各 Goal 共享、不对应任何 base。因此 Tower **不依赖** git-lfs 读取 `.lfsconfig`：Tower 自己以 `git show <base>:.lfsconfig` 读取该文件，按 git-lfs 的优先级（用户主检出的 git 配置 `lfs.url` / `remote.<name>.lfsurl` 优先，其次 base 的 `.lfsconfig`，再次由远端 URL 推导）算出有效端点与相关键，全部以命令行 `-c` 显式传给这条 `git lfs fetch`。镜像的 `HEAD` 与其中任何配置都不参与。
- **凭据与输出**（R26-D11-01）：credential helper 返回的凭据在 git、git-lfs 与 helper 之间传递，Tower **看不到也不截取**它们；ADR-151 中“LFS 凭据参与精确匹配”一句撤回，Tower 不插入用户的凭据链。这条命令的标准输出与错误输出**只进入 Tower 的诊断日志**（写入前按模式脱敏 URL 中的 userinfo 与认证头），**从不进入 Agent 的开场或任何 Agent 可读的位置**；`prepare_failed` 卡片只显示 Tower 生成的摘要（缺失对象数、HTTP 状态类别）。SSH 远端同理。
- **未建成的卫星不算丢失**（R26-D4-01）：卫星丢失（`10` §10.16.2 情形 E）、启动检查与 watcher 的“卫星缺失”判定，只适用于**检出完成标记存在**的卫星。标记不存在 = 尚未建成：不生成 `satellite_missing`，重试时按 ADR-151 重新建立；ADR-151 的“删除未完成的工作目录”同样不触发丢失判定。
- 用例与陈旧文字（R26-D14-01、R26-D15-01）由各文档作者按本条修正：`06` 中检出期间的 `pause` 允许（检出属于仓库准备段，ADR-150 补记）；接管条件统一为“检出完成标记存在”；`prepare.progress` 的生产者统一为 Supervisor 的 PrepareService；W10 行按 ADR-151/152 改写；G42(z) 改为从 `paused` 中带 `queuedRun` 交还 `reverify` 起步；补“`prepare_failed` → 接管 → 交还”用例。

---

## 第 27 轮对抗评审后的跨文档决策（ADR-153）

## ADR-153 `.lfsconfig` 键白名单与按键解析；镜像 `HEAD`；准备期间 Tower 自己的写入窗口 — Accepted（R27 全部条目；Amends ADR-151、ADR-152；Amended by ADR-154：配置改由 0600 临时文件传入）

- **键白名单**（R27-D11-01）：Tower 从 base 的 `.lfsconfig` 只取以下键，其余一律忽略：`lfs.url`、`remote.<name>.lfsurl`、`lfs.<url>.access`、`lfs.fetchinclude`、`lfs.fetchexclude`。URL 值只接受 `https://` 与 `ssh://`（及 scp 式 ssh 写法），拒绝 `file://`、本地路径与其他协议；不合规的值记入诊断日志并忽略。这样，以 `-c` 传入的内容不会超出 git-lfs 自己允许 `.lfsconfig` 设置的范围，“这条命令不处理 Agent 可影响的内容”的前提继续成立（base 是用户的内容，白名单再限制其影响面）。
- **按键解析，与 git-lfs 一致**（R27-D13-01）：对每个键，用户主检出的 git 配置中的值覆盖 `.lfsconfig` 中的值；然后端点 = `lfs.url` ?? `remote.<name>.lfsurl` ?? 由远端 URL 推导（键优先，不是来源优先——`.lfsconfig` 中的 `lfs.url` 优先于 git 配置中的 `remote.<name>.lfsurl`）。G43 以当时支持的 git-lfs 版本回归这一解析。
  - **远端名**：base 分支在用户主检出中的上游远端（`branch.<base>.remote`），没有则 `origin`。
  - **镜像 `HEAD`** 指向一个不存在提交的占位引用（`refs/tower/none`），git-lfs 因此不会从镜像读到任何 `.lfsconfig`；所有生效的键都由 `-c` 显式给出。
  - **`fetchinclude`/`fetchexclude`**：“缺失对象”只针对过滤后需要的对象；被排除的文件在卫星中保持指针（与用户自己的检出一致），记 Fact `lfs_excluded{count}` 并在 Agent 简报中说明，不导致 `prepare_failed`。
- **准备期间 Tower 自己的写入窗口**（R27-D4-01）：卫星检出与重试时删除未完成工作目录属于 Tower 自己的写入，watcher 在检出完成标记出现之前**不监视**该卫星；`ready` 中“来源不明的写入”只在标记存在时才可能成立。`03`、`06`、`10` 中“卫星已存在”的写法统一改为“检出完成标记存在”。
- 其余陈旧文字（R27-D15-01）由各文档作者修正：`04`（接管条件、卡片的 HTTP 状态类别）、`12`（卡片文案）、`02`（`takeoverFrom` 注释含 `ready`）、`03`、`10`。

---

## 第 28 轮对抗评审后的跨文档决策（ADR-154）

## ADR-154 LFS 获取的配置不经命令行与环境传递；远端选择与 git-lfs 一致；排除对象在所有检出中的处理 — Accepted（R28 全部条目；Amends ADR-152、ADR-153；Amended by ADR-155）

- **不在命令行或环境中出现可能含凭据的值**（R28-D11-01）：ADR-152/153 的 `-c` 传参改为——Tower 在自己的数据目录下写一个权限 `0600` 的临时配置文件（内容：`[include] path = <用户的全局配置>` 加上白名单键的有效值），以 `GIT_CONFIG_GLOBAL=<该文件路径>` 运行这条 `git lfs fetch`；命令行与环境中只出现文件路径，不出现任何 URL 或键值。命令结束（含失败、超时）即删除该文件。写入前，从用户配置得到的 URL 中的 userinfo（`user:pass@`）原样保留在文件中（这是用户自己的配置），但**不**进入诊断日志与卡片（按模式脱敏）。Agent 沙箱拒绝读取 Tower 数据目录（`11` 既有规则），因此其他 Goal 的 Agent 也读不到该文件。契约测试 C29 增加一例：LFS 获取期间 `ps` 与进程环境中不含任何 URL。
- **远端选择与 git-lfs 一致**（R28-D13-01）：base 分支的 `branch.<base>.remote` → `remote.lfsdefault` → 唯一远端 → `origin`（以支持的 git-lfs 版本为准，G43 回归）。
- **被排除的 LFS 对象在所有检出中一致**：卫星、验证槽位、人工编辑检出与检验检出都从同一个镜像 LFS 库物化，按同一组 `fetchinclude/fetchexclude` 规则——被排除的文件在所有检出中都保持指针，与用户自己的检出一致。验证因此可能因缺少这些文件而失败，这与用户本机的情形相同；验证证据中附 `lfs_excluded` Fact，失败卡片提示“项目配置排除了 N 个 LFS 文件”。
- **被拒绝的配置值在卡片上如实说明**：`prepare_failed` 若由白名单校验导致（例如端点被拒绝后没有可用端点），卡片写“LFS 配置被拒绝：<键>（不支持的协议）”，不写 HTTP 状态类别。
- **措辞**：“Agent 不能影响这条命令的任何输入”改为“这条命令的输入只来自用户主检出的配置与 base 提交，Agent 在卫星中的写入不参与”；“不读镜像中的任何内容”改为“不读镜像中的任何配置（`HEAD` 指向占位引用）”。
- `04` L950 的编辑错误（重试/接管/放弃选项被并入“LFS 已排除”说明）与 G43(c) 的预期（改为 `HTTP 4xx`）由文档作者修正。
- **第 28 轮补记（ADR-154，回答作者提出的三个问题）**：
  1. **base 为远端引用时的远端名**：base 是 `refs/remotes/<r>/<b>`（例如 `upstream/main`）时直接取 `<r>`；否则按 `branch.<base>.remote` → `remote.lfsdefault` → 唯一远端 → `origin`。
  2. **被忽略的值**：任何白名单校验拒绝的值都记 Fact `lfs_config_ignored{keys}`；获取成功时显示为提示（`◇ 已忽略 LFS 配置：<键>`），`prepare_failed` 卡片在主因之外也列出“已忽略 <键>（不支持的协议）”。
  3. **按目录生效的用户配置（`includeIf "gitdir:…"`）**：Tower 在**用户主检出的上下文中**求出与网络认证相关的有效配置——`credential.*`、`http.<url>.*`（代理、CA 等）、`url.<base>.insteadOf`——写入同一个 0600 临时文件，因此按目录选择的 credential helper 与代理同样生效（这些值来自用户自己的配置，不来自仓库内容）。镜像路径上的 `includeIf` 不再影响结果。G43 增加对应用例。
- **第 28 轮补记 2（ADR-154）**：`core.sshCommand` 同样在用户主检出的上下文中求值并写入临时文件——它来自用户自己的配置（含按目录的 `includeIf`），不来自仓库内容，Agent 不能写入其任何来源；这与用户在主检出中执行 `git lfs pull` 时使用的 SSH 密钥一致。无 URL 的 `http.*` 键（全局代理、CA）一并写入，与作者的处理一致。

---

## 第 29 轮对抗评审后的跨文档决策（ADR-155）

## ADR-155 Tower 的 git 网络命令不让 URL 中的凭据出现在任何进程参数中；rebase 的 LFS；远端名统一 — Accepted（R29 全部条目；Amends ADR-154；Amended by ADR-156；凭据改写部分 Superseded by ADR-157）

- **URL 中的凭据**（R29-D11-01）：git 启动 `git-remote-https` 等辅助进程时会把远端 URL 放进它的参数。因此 Tower 运行的**所有** git 网络命令（M1：base 的远端 fetch、LFS 获取；M2：base 轮询、推送）一律：
  - 在 0600 临时配置中把 `remote.<name>.url` 写成**去掉 userinfo 的 URL**；
  - 若用户配置的 URL 含 userinfo，把用户名写为 `credential.<去掉 userinfo 的 URL>.username`，密码写入另一个 0600 文件，并以 `credential.<URL>.helper = store --file=<该文件>` 提供——密码经 stdin 交给 git，任何进程参数与环境中都只有文件路径；
  - 临时文件放在 `~/.tower/tmp/`（目录 0700，Agent 沙箱已拒绝 `~/.tower/**`），命令结束即删；Tower 每次启动清空该目录（崩溃残留）。
  - 工具输出与日志的脱敏增加通用模式 `<scheme>://<user>:<pass>@`（`11` §11.7）；`11` 威胁表登记“同用户进程可见他进程参数”这一类风险及上述缓解；SP6a 增加用例：在上述各命令运行期间对全部进程参数与环境采样，不出现任何密码或 token。
- **rebase 前先补齐新 base 的 LFS 对象**（R29-D13-02）：自动 rebase 在写回卫星之前，对新 base 执行与步骤 2a 相同的 LFS 补齐；补齐失败 → 本次 rebase 放弃（卫星保持旧 base），记 Fact `rebase_lfs_failed{missing}`，下一轮轮询重试；不会让 Agent 或验证在指针文件上工作。
- **远端名统一**（R29-D13-01）：所有为 base 获取远端提交的命令都使用 ADR-154 补记的同一规则（远端引用取其远端名；否则 `branch.<base>.remote` → `remote.lfsdefault` → 唯一远端 → `origin`）；`10` 中硬编码的 `origin` 删除。
- **一致性**（R29-D15-01）：`lfs_config_ignored` 的数据为 `{keys, reasons}`，来源恒为 base 的 `.lfsconfig`（用户自己的 git 配置不做白名单校验），`04`/`12` 的展开文案据此修正；`06` 补上 `core.sshCommand` 与无 URL 的 `http.*`；所有临时配置内容清单加入 `remote.<name>.url`（去掉 userinfo，git-lfs 需要它才能获取）。
- **第 29 轮补记（ADR-155，回答作者的两个问题并确认一处偏离）**：
  - **确认偏离**：base 的 fetch、轮询与推送在用户检出中以“去掉 userinfo 的 URL + 显式 refspec”调用，而不是远端名（仓库级配置会覆盖临时文件，且 `remote.<name>.url` 可多值）；LFS 获取在没有远端的镜像中仍用远端名。采纳。
  - **`insteadOf` 中的凭据**：若用户有效配置中任何 `url.<X>.insteadOf` / `pushInsteadOf` 的替换目标 `<X>` 含 userinfo，Tower **不再 include 用户全局配置**，改为把用户主检出上下文中的有效配置（排除仓库级键）完整写入临时文件，并把这些 `<X>` 改写为去掉 userinfo 的形式、凭据移入 store 文件。T33 的这一残余因此关闭。
  - **M2 推送目标**：`branch.<seal 分支>.pushRemote` → `remote.pushDefault` → base 的远端规则；以 URL 推送后，Tower 在用户仓库配置中显式写入 `branch.<seal 分支>.remote` 与 `.merge`（代替 `-u`）。
- **第 29 轮补记 2（ADR-155）**：为关闭最后一处残余（用户主检出仓库级配置中带凭据的 `insteadOf` 仍对在用户检出中运行的命令生效），Tower 的**所有** git 网络命令一律在**镜像**中执行（镜像没有远端、其配置只含 Tower 写入的内容）：base 的 fetch 与轮询以“去掉 userinfo 的 URL + 显式 refspec”取入镜像；M2 推送同样从镜像以 `<seal 提交>:refs/heads/<seal 分支>` 推送（seal 对象先写入镜像），之后在用户仓库配置中写 `branch.<seal 分支>.remote/.merge`。用户主检出只作为**读取**有效配置的上下文，不再运行任何网络命令。附加的 `GIT_CONFIG_NOSYSTEM=1`（系统级值已写入临时文件）采纳。T33 关闭为“仅剩用户自己系统中其他非 Tower 进程的既有风险”。
- **第 29 轮补记 3（ADR-155，M2）**：从镜像推送不触发用户检出中的钩子。项目设置允许集成步骤运行用户钩子时，Tower 在推送**之前**于用户检出中执行 `git hook run pre-push`（参数为远端名与**去掉 userinfo 的 URL**，标准输入按 git 规范给出本地/远端引用与提交），不需要网络；钩子失败 → 不推送，记 Fact 并显示钩子输出（经 `11` §11.7 脱敏）。

---

## 第 30 轮对抗评审后的跨文档决策（ADR-156）

## ADR-156 凭据按主机提供且不清除用户的 helper；base 的唯一取值函数；自动 rebase 归 M2；pre-push 的正确调用 — Accepted（R30 全部条目；Amends ADR-155；凭据改写部分 Superseded by ADR-157）

- **凭据的作用范围**（R30-D13-01）：从 URL 中剥离出的凭据按**主机**提供，而不是按完整 URL：`credential.<scheme>://<host>.username`，store 文件中的条目为 `<scheme>://<user>:<secret>@<host>`（git-credential-store 按主机匹配，`credential.useHttpPath` 保持默认 false），因此 git 与 git-lfs（其端点路径与仓库 URL 不同）都能使用它。**Tower 从不清除用户的 credential helper 列表**：只有 URL 中带有密码或 token 时，才在用户的 helper 之前**追加**一个 `store --file=<0600 文件>`；URL 只带用户名（Bitbucket、Azure DevOps 的默认克隆 URL）时，只写 `username`，用户自己的 helper 照常工作。~~ADR-155 中“写空值清除列表”的做法仅保留给 `http.extraHeader` 之外的非凭据多值键，凭据 helper 不再清除。~~〔ADR-157 起不再写出用户配置，也不清除任何多值键〕
- **自动 rebase 归 M2**（R30-D14-01）：Run 空闲点的自动 rebase 与合并队列一样属于 M2（ADR-059 范围表据此标注）；M1 中 base 前进只提示，不自动 rebase。ADR-155 的“rebase 前补齐 LFS”随之归 M2，G44(a) 移入 M2 用例组，相应工时从 M1 系统线移出。
- **base 的唯一取值函数**（R30-D13-02）：镜像中同一远端分支可能同时有 Tower 获取的 `refs/tower-remote/<r>/<b>` 与用户最近一次获取的 `refs/user/...`。唯一函数 `baseTip(r, b)`：二者有祖先关系时取后代；分叉时取 Tower 获取的（代表远端当前状态）并记 Fact `base_diverged`。Goal 准备、base 前进检测、合并队列 Q2（M2）与集成观测一律调用它。M2 的自动 rebase 在 LFS 补齐完成后**重新检查**全部前置条件（Goal 状态、base 是否再次前进），不满足则放弃本次 rebase。
- **pre-push 的调用**（R30-D11-01，M2）：`git hook run --ignore-missing --to-stdin=<0600 临时文件> pre-push -- <远端名> <去掉 userinfo 的 URL>`——标准输入经 `--to-stdin` 传入（管道不会到达钩子），没有钩子时 `--ignore-missing` 视为通过；需要 git ≥ 2.42，低于该版本时不运行钩子并在卡片中如实说明“当前 git 版本无法在推送前运行 pre-push 钩子”。钩子失败 → 不推送，Goal 保持 `accepted`，卡片“推送被 pre-push 钩子拒绝”提供“重试推送”与“只保留分支”。
- **一致性**（R30-D15-01）：`06` L239 的凭据写法、`05`/`06` 中“Tower 从不接触凭据”的表述（改为“仅在 URL 中带有凭据时，以 0600 store 文件短暂转交，见 ADR-155/156”）、`06` 数据目录说明中的 `~/.tower/tmp/` 凭据文件、`GIT_CONFIG_NOSYSTEM` 的设置时机（只在不 include 用户全局配置、改为写出完整有效配置时设置）、网络认证是否读取用户检出的仓库级配置（读取，作为“有效配置”的一部分，但只取 ADR-154 补记列出的认证类键）、`11` L379 的 Fact 形状，由各文档作者统一。
- **第 30 轮补记（ADR-156）**：URL 中带有密码或 token 时，一律走“写出完整有效配置 + `GIT_CONFIG_NOSYSTEM=1`”的路径，把 store helper 放在**全部**用户 helper（含系统级）之前——这样取得的凭据与用户直接在主检出中 `git fetch` 时一致（URL 中的凭据优先）。URL 只带用户名或不带凭据时，仍 include 用户全局配置。

---

## 第 31 轮对抗评审后的跨文档决策（ADR-157）

## ADR-157 在沙箱层面阻止观察其他进程，撤回凭据改写机制；远端 base 的观测时机；推送失败的出口 — Accepted（R31 全部条目；Supersedes ADR-155/156 中的凭据改写部分；macOS 部分 Superseded by ADR-158；机密投递部分 Superseded by ADR-159）

- **根因处理**（R31-D13-01）：第 28–31 轮的问题都源于“同用户的 Agent 进程能读到其他进程的参数与环境”。改为在沙箱层面关闭这条通道：
  - macOS S2：Seatbelt 配置拒绝对**非自身进程树**的 `process-info*` 操作，并拒绝 `sysctl` 读取 `kern.procargs2`/`kern.proc` 中其他进程的条目——Agent 进程无法再枚举其他进程的参数与环境；
  - Linux S2（M2）：bwrap 使用独立的 PID 命名空间（`--unshare-pid`），其他进程不可见；
  - SP6a A12(a) 是**闸门**：以实测确认上述拒绝生效。
- **撤回凭据改写**：在上述前提下，Tower 的 git 网络命令（仍在镜像中执行，ADR-155 补记 2）**原样**使用用户主检出中配置的远端 URL（含其中的凭据）并 include 用户的全局与系统配置——与用户自己执行 `git fetch` 完全相同。ADR-155/156 中的 userinfo 剥离、store 文件、写出完整有效配置、`GIT_CONFIG_NOSYSTEM`、按主机改写凭据等机制**全部撤回**（登记于 `16` 废弃表）。保留：命令在镜像中执行、远端名规则、LFS `.lfsconfig` 白名单与按键解析、输出只进诊断日志、通用 URL 凭据脱敏模式。
  - **闸门失败时的预案**：若 SP6a 证明 macOS 上无法拒绝，Tower 对“URL 中带密码或 token 的远端”不执行任何网络命令，改为显示卡片“请把该远端的凭据移到 credential helper”（不再尝试改写用户配置）；不带凭据的远端不受影响。
- **远端 base 的观测时机**（R31-D13-02，M1）：M1 不轮询；Tower 在以下时机对远端引用 base 执行一次 fetch（取入镜像）：Goal 准备、Goal 进入 `in_review` 之前、用户在卡片上点“检查 base”、打开 Goal 详情时（距上次获取超过 10 分钟）。base 前进检测与 `integrated` 观测在每次这样的 fetch 之后进行。`baseTip()` 在分叉时取**获取时间较新**的一方（不再固定取 Tower 获取的），提示文案改为“远端与本地的 <分支> 已分叉，使用较新获取的版本”。
- **事实类型**（R31-D4-01）：`base_advanced{from, to, count}`（M1，只提示）。
- **M2 推送**（R31-D11-01）：`git hook run --to-stdin` 自 git 2.40 起可用（Tower 的最低版本），删除“需要 2.42”与跳过钩子的回退；钩子标准输入中的远端提交取自推送前在镜像中对该远端分支执行的 `ls-remote`（不存在时为全零）。推送失败（钩子拒绝、网络、认证）→ Needs-You kind `integration`（新增，去重键 `int:{goalId}`，severity 2），Goal 保持 `accepted`，合并队列条目（M2）保持“待推送”，选项：重试推送、只保留分支。
- **一致性**（R31-D15-01）：`06` L239、`16` L474、G45(a) 预期、`15` L1312 由作者按本条统一。
- **第 31 轮补记（ADR-157）**：闸门失败预案中的项目级卡片沿用 Needs-You kind `integration`（owner 为 project），去重键 `int:{projectId}:credential_url`；标注：用户改用 helper 后条目以 `actionable` 关闭。
- **第 31 轮补记 2（ADR-157）**：确认作者的处理——用户主检出中**仓库级**与**按目录 `includeIf`** 生效的认证类值（credential helper、代理、`core.sshCommand`）原样写入镜像命令的临时配置（不改写），因为全局 include 无法把它们带入镜像；这样结果才与用户在主检出中执行 `git fetch` 一致。SP6a A12(a) 的闸门检查按安全线 +0.05 人周计入（保守）。

---

## 第 32 轮对抗评审后的跨文档决策（ADR-158）

## ADR-158 macOS 上同用户进程可互相观察：如实按“闸门失败”设计；平台二进制的身份识别；若干闭环 — Accepted（R32 全部条目；Amends ADR-157；Supersedes ADR-157 中“沙箱层面关闭观察通道”在 macOS 上的部分；机密投递部分 Superseded by ADR-159；Amended by ADR-208、ADR-227）

- **事实**（R32-D11-01，评审在 macOS 27 上实测）：Seatbelt 无法阻止沙箱内进程读取同用户其他进程的参数（非 Apple 二进制的环境也可读）；`/bin/ps` 为 setuid，无法在任何 Seatbelt 沙箱内运行。因此 **macOS 上 M1 按“闸门失败”设计**：
  - **SP6a A12(a) 改为测量而非闸门**：记录在支持的 macOS 版本上能否阻止观察；M0 退出条件改为“已运行并记录结论”，不要求通过。Agent 自己的 `ps` 不作为要求（setuid 二进制在沙箱中不可用，`04`/`05` 的简报如实告诉 Agent）。
  - **凭据 URL**：macOS 上默认执行预案——URL 中带凭据的远端，Tower 不执行任何网络命令，显示 `integration` 卡片要求改用 credential helper。**凭据判定**：userinfo 含 `:`（`user:secret`）一律视为凭据；只有用户名时，若匹配已知 token 形态（`ghp_`、`gho_`、`ghu_`、`ghs_`、`github_pat_`、`glpat-`、`x-access-token`、以及长度 ≥ 20 的高熵串）也视为凭据，否则视为用户名。
  - **模型提供商密钥不进入任何环境**：SDK 模式下以 Pi v1.2.0 的 `setRuntimeApiKey`（只写内存层、不落盘）或 `ModelRuntime.create({credentials: new InMemoryCredentialStore()})` 在 Host 内存中提供（`AuthStorage.inMemory()` 不在 v1.2.0 的公开导出中；依赖行 D57 登记于 `05`）；Host 进程环境中不含任何密钥，Agent 启动的进程也不继承。RPC 模式（M2）以 0600 的 `auth.json` 提供。
  - **验证器注入的机密与 `secrets.access`**：默认改为**文件注入**——机密写入 Tower 数据目录下 0600 文件，以 `<NAME>_FILE` 环境变量传路径（Agent 沙箱拒绝读取 `~/.tower/**`）；只有标准显式声明 `secretsVia: "env"` 时才以环境变量注入，此时该标准在界面上标“机密以环境变量注入：运行期间同一用户的其他进程可能读到”，并在 `11` 威胁表中以 T33b 登记（macOS S2：中；缓解：文件注入为默认、验证运行时长有限、脱敏）。
  - **T33 的如实评级**：macOS S2 下“同用户进程观察”为**中**（Tower 自己不再把凭据或密钥放入任何参数或环境；残余来自用户自己的其他进程与显式 `secretsVia:"env"`）；Linux S2（M2，PID 命名空间）为低；S0 为高。所有声称该通道“已关闭”的文字改为此评级。M2 的加固选项：以专用系统用户运行 Agent（登记为 M2 决定点）。
- **平台二进制的身份识别**（R32-D6-01）：Apple 平台二进制（`/bin/bash`、`/bin/sleep` 等）的环境对普通进程不可读且读取不报错，令牌识别对它们失效。规则：
  - Tower 的 `exec` 为每条命令记录直接子进程，settle 时按**进程树**（`proc_listchildpids` 递归）与**令牌**两种方式取并集终止；
  - 脱离进程树且无法读到环境的进程识别不到——这是登记的窗口；其后的写入在 settle 之后按“来源不明的写入”处理（`paused(external_change)`，由人决定），不会被记为 Agent 或人的改动；
  - “环境读取成功但为空”与“读取失败”同样视为“无法确认”。G35 增加 `/bin/sleep` 与 shell 循环的脱离进程用例。
- **一致性闭环**：
  - Fact 类型补齐：`base_unchanged_nonancestor{from, to}`（base 变化但不是前进）、`push_failed{stage, exitCode?}`（M2）、`remote_credential_blocked{remote}`；`base_diverged` 增加 `towerFetchedAt`、`userObservedAt`（R32-D4-01）。
  - **分叉时不自动选择**（R32-D13-01）：用户侧时间戳不可靠，`baseTip()` 在分叉时不改变 Goal 的 `baseCommit`，记 `base_diverged`，卡片提示“远端与本地的 <分支> 已分叉，未自动采用任一版本”，提供“使用远端”“使用本地”两个动作（命令 `goal.base.choose{side}`）。
  - 进入 `in_review` 前的 fetch **不阻塞**：最多等待 10 s，失败或超时记 Fact，照常进入 `in_review`。
  - 命令补齐（R32-D8-01）：`goal.base.check`（“检查 base”与打开详情时的触发共用）、`project.remote.recheck`（预案卡片的“重试”）。
  - M2 队列状态（R32-D13-02）：合并队列条目增加状态 `awaiting_push`（推送失败后），**不占用**该 base 的队列（后续条目可继续）。
  - M0 退出条件与依赖 A12(a) 的用例预期按“测量”改写（R32-D14-01）；`13` 的 5 分钟轮询标为 M2 等陈旧文字（R32-D15-01）由作者统一。
- **第 32 轮补记（ADR-158）**：`goal.base.choose{side}` 只决定此后以哪一侧作为该 base 的**观测基准**（用于 base 前进提示与 `integrated` 观测），直到下一次分叉；**不改变** Goal 的 `baseCommit`、不触发 rebase 或重新验证（M1 没有自动 rebase；M2 中若所选一侧是 `baseCommit` 的后代，按普通的 base 前进进入 rebase 流程）。确认文案据此说明“只影响提示与合入判断，不改动工作区”。
- **第 32 轮补记 2（ADR-158，回答作者的四个问题）**：
  1. **准备时即分叉**（尚无 `baseCommit`）：采用用户本地一侧（与用户自己看到的一致），记 `base_diverged` 并显示两个选择按钮。采纳。
  2. **Fact `base_fetch_failed{remote, error}`**：登记；进入 `in_review` 前的 fetch 失败、“检查 base”失败都记它，`04` 的“无法获取远端 base”提示据此显示。
  3. **云 SDK 凭据**（ADR-049）：Tower 只把**指向文件的**变量传给 Host（`AWS_PROFILE`/`AWS_SHARED_CREDENTIALS_FILE`、`GOOGLE_APPLICATION_CREDENTIALS`、Azure 配置目录等）；原始密钥变量（如 `AWS_SECRET_ACCESS_KEY`）不传——若用户的配置只提供原始变量，Tower 把它们写入 Tower 数据目录下的 0600 凭据文件并传其路径。T33 中这一残余据此关闭。
  4. **工时归属按 WBS 行的主责线**（W4 → 桌面、W9 → Agent）：采纳。

---

## 第 33 轮对抗评审后的跨文档决策（ADR-159）

## ADR-159 机密投递的统一模型 — Accepted（R33 全部条目；Supersedes ADR-158 中关于验证器机密默认文件注入与“Tower 从不把机密放进参数或环境”的表述；Amends ADR-157/158；独占窗口及补记 2、3 Superseded by ADR-160；带机密标准相关的 M1 内容 Superseded by ADR-164（移到 M2）；Amended by ADR-224：启动清空 `~/.tower/tmp/` 时保留存活 Host 的临时目录；Amended by ADR-226：交给 Engine Host 的即时投递按 `hostId` 命名，启动清理保留存活 Host 的投递）

第 28–33 轮的机密问题都源于“按消费者逐个打补丁”。本条以一张表给出**全部**机密的存放、投递与可读者，其他文档只引用（唯一定义在 `11` §11.7）。

- **静态存放**：Tower 持有的机密只存在系统钥匙串（密钥库）中；`~/.tower` 下**没有**长期存放的明文机密。需要以文件交给子进程时，Tower **即时**在 `~/.tower/run/<deliveryId>/`（目录 0700、文件 0600）创建，消费进程结束即删除；该目录设置备份与 Spotlight 排除标记，启动时清空。
- **可读者规则**：Agent 沙箱拒绝 `~/.tower/**`；**验证器沙箱**同样拒绝 `~/.tower/**`，只放行**本次标准**的投递文件（逐路径放行）；Engine Host 与 Supervisor 不在沙箱内。
- **投递表**：

| 机密 | 投递方式 | 暴露窗口与保护 |
|---|---|---|
| 模型提供商密钥 | Host 内存（`setRuntimeApiKey` / `InMemoryCredentialStore`，D57） | 不进入任何参数、环境或文件 |
| 云 SDK 凭据（ADR-049） | 指向文件的变量；原始变量写入即时投递文件 | Host 生命周期内文件存在；Agent 与验证器沙箱不可读 |
| 验证器标准的机密（`env: [NAME]`） | **默认 `env`**（`<NAME>` 环境变量，兼容现有测试）；可选 `secretsVia:"file"` | **独占窗口**：该标准运行期间，其他 Goal 的 Agent **新工具调用暂缓**（tower-goal gate 检查 Supervisor 的标志，正在执行的调用照常结束），标准结束即恢复；窗口 ≤ 标准超时 |
| `secrets.access`（人批准给 Agent 使用的机密） | 注入批准它的 Goal 的**单次**工具调用环境 | 同一独占窗口（该工具调用期间） |
| 用户配置的 MCP 服务器环境（`mcp.json` 的 `env`） | 由用户配置，Tower 不改动 | **残余**：macOS S2 下其他 Agent 可能读到；`mcp.json` 的 `env` 中出现符合机密模式的值时，设置页提示“建议改为由该服务器自己读取钥匙串或文件”；M2 决定点：专用系统用户 |
| URL 或 git 配置中的凭据 | macOS 上不执行相关网络命令（ADR-158） | 判定范围扩展为：远端 URL；含 `password=`/token 形态的内联 `credential.helper`（`!` 开头）；含 token 形态的 `core.sshCommand`、`http.extraHeader` |

  - **独占窗口**是对“同用户进程可互相观察”这一 macOS 事实的直接缓解：机密只在没有其他 Agent 工具进程启动的窗口中存在于环境里。窗口被等待超过 5 分钟（其他 Goal 有长时间运行的工具调用）时，该验证记 `verify_env_error{stage:"secret_window"}`，Needs-You 让人选择“等待 / 中止其他 Goal 的当前调用 / 以 file 方式重试”。项目可关闭独占窗口（设置页标注风险）。
  - **测试读取 `<NAME>` 的兼容性**（R33-D7-01）：默认 `env`，因此不会出现“测试因读不到变量而跳过却显示通过”；`secretsVia:"file"` 时，若该标准的测试在运行中出现“跳过”计数增加，按既有的 skip 哨兵处理，并在标准行提示“该标准以文件注入机密，请确认测试读取 `<NAME>_FILE`”。
- **T33 改写**：Tower 自己不把机密放入**长生命周期**进程的参数或环境；有界的例外只有上表中受独占窗口保护的两项；用户配置的 MCP 环境为登记的残余（macOS S2：中）。
- **其余条目**（R33 次要项）：
  - `goal.base.choose` 持久化为 `goals.base_choice{side, towerTip, userTip, at}`；`baseTip()` 在同一对分叉提交仍然存在时返回所选一侧，任一侧变化即失效并重新判定。
  - 远端 base 的 fetch 按（镜像，引用）合并，总时限 60 s；进入 `in_review` 只等待前 10 s，其余在后台完成并记录结果。
  - 重启清理只处理**令牌已确认**的进程；“无法确认”的进程在重启时不提示、不终止（进程树不持久化，重启后只按令牌）。
  - `Fact.goalId` 可空，项目级 Fact 带 `projectId`（`remote_credential_blocked`）；`base_fetch_failed` 的提示保留到下一次成功获取；`04`/`12` 卡片提示清单补齐。
  - `02`、`08`、`10` 中的陈旧文字由作者统一。
- **第 33 轮补记（ADR-159）**：“中止其他 Goal 的当前调用”只中止**那一次**工具调用（工具返回“被 Tower 中止：机密窗口”，Agent 可以重试），不暂停该 Goal；命令为 `goal.tool.abort{goalId, toolCallId, reason:"secret_window"}`，记 `HumanDecision{abort_tool_call}`。
- **第 33 轮补记 2（ADR-159）**：独占窗口期间，Tower 对**其他 Goal 已识别的全部进程**（进程树 ∪ 令牌，ADR-158）发送 `SIGSTOP`，窗口结束发送 `SIGCONT`——已在运行的开发服务器、watcher 等也在窗口内停住，不能读取机密；Engine Host 与 Tower 自身进程不受影响。代价是这些进程在窗口内（≤ 标准超时）暂停，卡片显示“因机密窗口暂停”。脱离进程树且无法识别的进程不在此列（ADR-158 已登记的窗口）。T33b 据此在 macOS S2 下评为**低**（残余：无法识别的脱离进程、用户自己的其他进程）。设置形状采纳为项目设置 `secretWindow.enabled`（默认 true），等待上限 5 分钟为常量。
- **第 33 轮补记 3（ADR-159）**：被机密窗口挂起的 Goal，其墙钟预算、停滞检测（`no_progress_for`、`stalled`）与 Run 耗时在挂起期间**不计时**；挂起区间作为事件 `secret_window.suspended/resumed` 记录在该 Goal 的时间线上。

---

## 第 34 轮对抗评审后的跨文档决策（ADR-160）

## ADR-160 以“调度互斥”取代独占窗口 — Accepted（R34 全部条目；Supersedes ADR-159 的独占窗口及其补记 2、3：工具调用闸门第 0 步、`SIGSTOP`/`SIGCONT`、挂起计时、`goal.tool.abort`、`secret_window.*` 事件与 Needs-You；Amended by ADR-161：secrets.access 推迟到 M2，Agent 活动含其他验证槽位与存活进程；Amended by ADR-162；Amended by ADR-163；带机密标准相关的 M1 内容 Superseded by ADR-164（移到 M2））

- **原因**：独占窗口在运行中途拦截工具调用，引入了事件顺序竞态、嵌套调用死锁、并发窗口与漏网读者等一连串问题（R34-D11-01、D6-01、D5-01、D4-01）。改为在**调度层**保证互斥，复用已有的准入与验证排程，不在 Run 内部做任何拦截。
- **规则（唯一定义在 `11` §11.7.0，取代原独占窗口一节）**：带机密的验证标准（`env: [...]`，默认以环境变量注入）只在**没有任何其他 Agent 活动**时开始运行：
  - **“Agent 活动”**= 任何 Goal 处于 `running`（含 settle 序列）或准备阶段、任何 Scratch 会话正在运行、任何检验检出的服务正在运行；
  - 条件不满足时，该标准在验证器队列中**等待**；条件满足时开始，并在其运行期间**冻结准入**（`06` §6.2.4：新的 Run、Scratch 与检验服务都不启动，排队等待；已在 `paused` 的 Goal 不受影响）；
  - **持有者自身**：带机密的标准不参加机会式验证（机会式验证发生在持有者 `running` 时）；只在 `claimed`/`verifying`（持有者的 Run 已 settle、进程已按 ADR-115/158 终止）时运行；
  - 标准结束时，验证槽位的全部进程（进程树 ∪ 令牌）被终止，机密随进程消失；脱离且无法识别的进程属 ADR-158 已登记的窗口（R34-D11-02）。
- **等待过久**：等待超过 10 分钟 → Needs-You（kind `verify_env`，去重键 `ve:{goalId}:secret_wait`），三个选项各有命令：
  - “继续等待” → `verify.secret_wait.keep{goalId}`（关闭条目，继续排队）；
  - “现在运行（接受风险）” → `verify.secret_wait.run_now{goalId}`（记 `HumanDecision{accept_secret_exposure}`，不等其他活动结束；界面写明“其他正在运行的 Agent 可能读到该机密”）；
  - “以文件方式运行” → `verify.secret_wait.as_file{goalId}`（本次以 `secretsVia:"file"` 运行，无需互斥）。
  Goal 在等待期间保持 `verifying`，不进入 `paused`。
- **`secrets.access`**（Agent 在自己的工具调用中使用经人批准的机密）：批准卡片如实写明“其他正在运行的 Goal 的 Agent 可能读到”；只在“没有其他 Agent 活动”时自动可用，否则批准后等待或由人选择立即使用（同上的“接受风险”决定）。
- **`baseTip()` 在分叉且尚未选择时**返回 Goal 当前的 `baseCommit` 一侧（即“不变”），只记 `base_diverged`（R34-D13-01）。
- **撤回清单**（登记于 `16` 废弃表）：工具调用闸门第 0 步、C39、`SIGSTOP`/`SIGCONT` 与崩溃恢复中的相应步骤、`secret_window.opened/closed/suspended/resumed` 事件、挂起期间不计时、`goal.tool.abort` 与 `abort_tool_call`、`secret_window` Needs-You 与 `verify_env_error{stage:"secret_window"}`、项目设置 `secretWindow.enabled`（由下条取代）。
- **项目设置**：`secretMutex.enabled`（默认 true）；关闭时带机密的标准不等待，界面标注风险。T33b（macOS S2）在互斥开启时为**低**（残余：用户自己的其他进程、ADR-158 的脱离进程窗口），关闭时为**中**。
- **陈旧文字**（R34-D15-01）由各作者统一。
- **第 34 轮补记（ADR-160）**：`secrets.access` 批准后若有其他 Agent 活动，该请求进入状态 `approved_waiting`（工具调用在门禁处等待，属于持有者自己 Goal 的正常 ask 等待，不是跨 Goal 拦截）；“现在使用（接受风险）”的命令为 `secrets.access.use_now{goalId, requestId}`，记 `HumanDecision{accept_secret_exposure}`。
- **第 34 轮补记 2（ADR-160）**：`verify.secret_wait.run_now` 与 `secrets.access.use_now` 都是“接受机密暴露风险”的决定，**仅本机**（`16` §16.5，与 `signal.mark_benign` 同级）；`keep` 与 `as_file` 允许远程。

---

## 第 35 轮对抗评审后的跨文档决策（ADR-161）

## ADR-161 `secrets.access` 推迟到 M2；“Agent 活动”包含其他验证槽位与存活进程 — Accepted（R35 全部条目；Amends ADR-160；Amended by ADR-162；带机密标准相关的 M1 内容 Superseded by ADR-164（移到 M2））

- **`secrets.access` 移出 M1**（R35-D11-02、R35-D5-01、R35-D4-01）：M1 中 **Agent 的工具调用从不获得密钥库中的机密**；机密只流向验证器标准（ADR-159/160）。需要机密才能运行的端到端检查，以带机密的验证标准表达。`secrets.access` 的动作类、批准卡片、`approved_waiting`、`secrets.access.use_now`、单次调用机密表与 `toolBash` 的 `toolCallId` 包装都归 M2（设计在 M2 中重新给出：请求格式、变量名、允许范围校验、准入冻结与撤回），从 M1 文档中移除或标为 M2；`05` §5.3.5 恢复为未包装的 `sandboxedBash`。`HumanDecision.accept_secret_exposure` 在 M1 只用于 `verify.secret_wait.run_now`。
- **“Agent 活动”的完整定义**（R35-D11-01，唯一定义在 `11` §11.7.0）：任何 Goal 处于 `running`（含 settle）或准备阶段；任何 Scratch 会话正在运行；任何检验检出的服务正在运行；**任何验证槽位正在运行其他标准**（包括其他 Goal 的验证与同一 Goal 的其他标准）；**任何未解决的 `bg_process_survived`**（存活者仍在）。
  - 带机密的标准因此**独占整个验证器**：两个带机密的标准不会同时运行；它等待期间**不占用**验证槽位（其他验证照常进行，它在每个槽位空出时重新判定）；同一 Goal 的验证中，带机密的标准排在所有不带机密的标准**之后**运行。
  - T33b 的残余清单相应更新：用户自己的其他进程、ADR-158 的脱离且无法识别的进程。
- **`baseTip()` 措辞**（R35-D13-01）：分叉且未选择时**返回 `baseCommit` 本身**。
- 其余一致性条目（R35-D15-01）由各作者统一：`02` 的 `NeedsYouItem.owner` 允许 project 与 `integration` 注释、`04` 凭据卡片、密钥库的称呼统一为“系统钥匙串（`secrets.enc` 仅为钥匙串不可用时的加密回退，`11` §11.7.1）”、`13` 中只把 10 分钟卡片用于 `secret_wait`、`16` 废弃表的“新表述”列、`05` C29(c)、注入点统一为 Tower 的 `exec`。
- **第 35 轮补记（ADR-161）**：确认作者的处理——只有 `secrets.access` 的“向 Agent 注入密钥库机密”部分推迟到 M2；该动作类在 M1 中仍用于**分类**凭据读取类命令（如读取 `.env`、`printenv`），按自主度矩阵 forbid/ask，不注入任何机密。

---

## 第 36 轮对抗评审后的跨文档决策（ADR-162）

## ADR-162 “Agent 活动”按原则定义；带机密的标准作为验证的独立阶段；钥匙串访问与机密输入提示 — Accepted（R36 全部条目；Amends ADR-160、ADR-161；Amended by ADR-163；带机密标准相关的 M1 内容 Superseded by ADR-164（移到 M2））

- **按原则定义，不再枚举**（R36-D11-01，唯一定义在 `11` §11.7.0）：**Agent 活动 = Tower 启动的、运行 Agent 编写或可影响内容的任何进程**——Agent 的 Run 与其后台进程、Scratch、验证槽位的准备（含安装器第 3 阶段：pnpmfile 与依赖构建脚本）、服务与测试清单、预热、检验检出的服务、未解决的存活进程。**不属于** Agent 活动的只有 Tower 自身代码：Supervisor、Engine Host、只使用用户配置的 git 网络命令。原枚举改为“例如”。
- **带机密的标准是验证的独立阶段**（R36-D6-01，唯一定义在 `07` §7.4.1）：
  1. `verify()` 先在普通槽位中照常运行全部**不带机密**的标准，结束后释放槽位；
  2. 若其中任一失败（或有阻断哨兵），带机密的标准**不运行**，记为“因其他标准失败未运行”，不等待、不冻结；
  3. 否则进入机密阶段：**不持有槽位**地等待“没有 Agent 活动”；条件满足时获取一个槽位并**立即**开始冻结准入（槽位准备本身也运行 Agent 可影响的内容），**在注入任何机密之前**完成准备（物化依赖、启动服务）；然后逐个注入并运行带机密的标准；结束后终止槽位全部进程、释放槽位、解除冻结；
  4. 该槽位的依赖物化只读使用依赖缓存，机密阶段中产生的任何构建产物**不回写**共享缓存；
  5. `run_now` 跳过“等待无 Agent 活动”，其余步骤相同；`as_file` 在普通槽位流程中运行，不冻结。
  - 冻结时长上限 = 机密阶段的槽位准备时限 + 各带机密标准的超时之和（`13` 据此改写）。
- **钥匙串访问**（R36-D11-02）：Tower 写入钥匙串的条目以访问控制列表限定为 Tower 自己的代码签名身份；其他进程读取会触发 macOS 的授权提示（应拒绝）；Agent 沙箱另外拒绝钥匙串服务的查找；SP6a A8 测量这两点并记录。凭据读取类命令（`secrets.access` 分类）因此读不到 Tower 的钥匙串条目。
- **让 Agent 与人都知道 M1 不提供机密**：Agent 简报写明“M1 中不会向你提供任何密钥库中的机密；需要机密才能运行的检查由验证器的带机密标准执行”；`ask_user` 的回答框中，人输入的文本若匹配机密模式，提示“这看起来像机密，发送后会进入模型上下文”并允许取消。
- 其余一致性条目（R36-D15-01）由各作者统一：`05` L974（只有注入部分推迟到 M2）、`06`/`04`/`12` 的冻结清单加入“其他验证”、`14` §14.4.1 的 M2 范围加入 `secrets.access` 注入、`11` L449 措辞。

---

## 第 37 轮对抗评审后的跨文档决策（ADR-163）

## ADR-163 `not_run` 的判定语义；冻结以单一闸口执行且为全局；机密阶段的收尾与恢复 — Accepted（R37 全部条目；Amends ADR-160、ADR-162；带机密标准相关的 M1 内容 Superseded by ADR-164（移到 M2））

- **`not_run` 不是失败**（R37-D7-01）：`outcomeOf` 不把 `not_run` 计为失败；它有两个原因——`other_criteria_failed`（不带机密的标准有失败，`decide()` 走失败路径）与 `blocked_by_sentinel`（不带机密的标准全部通过但存在阻断哨兵，`decide()` 走 `paused(sentinel_high)`）。人对哨兵 `override_sentinel` 时，继续目标改写为 `verify{pin, secretPhaseOnly:true}`：以同一 pin 只运行机密阶段，通过后才进入评审。验证缓存**从不**缓存 `not_run`。
- **冻结的单一闸口**（R37-D11-01）：Tower 中**启动任何 Agent 活动**（按 ADR-162 的原则定义）都必须经过同一个函数 `startAgentActivity(kind, goalId?)`——Run 准入、Scratch、安装器（含预热）、检验检出与人工编辑检出的依赖准备与生命周期脚本、检验服务、其他验证槽位的准备与运行。冻结期间该函数让请求排队（界面显示“等待机密验证结束”），不存在绕过它的启动路径；`11` §11.7.0 只引用这一闸口，不再列举冻结清单。
- **全局且原子**（R37-D6-01）：冻结与“独占验证器”都是**整机范围**，不分项目。“判定没有 Agent 活动 → 获取槽位 → 设置冻结”在 Supervisor 的单写者线程中**一次完成**；`startAgentActivity` 也在同一线程中检查冻结标志，因此不存在竞态。机密阶段**严格串行**：`run_now` 只跳过“等待非机密的 Agent 活动结束”，**从不**与另一个正在进行的机密阶段并行。
- **收尾与恢复**（R37-D6-02）：机密阶段结束时依次：终止槽位全部进程 → 执行该槽位的正常 teardown（服务、容器卷等，`07` §7.4.4）→ 释放槽位 → 解除冻结。冻结时长上限 = `verify.slotPrepareTimeoutMin`（`16` §16.2，默认 10 分钟）+ 各带机密标准的超时之和。重启时若发现冻结未解除（事件未闭合）：先终止该槽位进程并 teardown，再解除冻结，机密阶段重新排队。
- **钥匙串查找拒绝**（R37-D11-02）：写入 `11` §11.6.2，适用于**所有**运行 Agent 可影响内容的沙箱（Agent、验证器、检验检出），SP6a A8 测量。
- **机密输入提示**（R37-D11-03）：所有由人输入、会进入模型上下文的文本——回答、重新回答、转向、`request_changes` 的评论、交还说明——提交时都经过同一机密模式检查（`E_CONFIRM` + `confirmSecret`）。
- 其余一致性条目（R37-D15-01）由各作者统一：`04` L1099（冻结在获取槽位时开始）、`07` L367 与伪代码一致、`06` 命令表加 `confirmSecret`、`12` 的提示文案与排队标签。
- **第 37 轮补记（ADR-163）**：机密阶段使用**该 Goal 所属项目**的验证槽位池中的槽位（槽位的准备配置与项目绑定）；“整机范围”指的是“没有 Agent 活动”的判定与冻结，而不是槽位池。由于判定成立时整机没有其他验证在运行，该项目的槽位池必然有空闲槽位。

---

## 第 38 轮对抗评审后的跨文档决策（ADR-164）

## ADR-164 带机密的验证标准整体推迟到 M2；M1 中没有任何机密进入 Agent 可影响的进程 — Accepted（R38 全部条目；Supersedes ADR-159–163 中与“带机密的标准”有关的全部 M1 内容；Amended by ADR-165）

- **原因**：第 28–38 轮的安全追问几乎都落在“把机密交给运行 Agent 所写代码的进程”这一面上（独占窗口、调度互斥、冻结闸口、机密阶段、试运行、条目授权……），每一轮的修补都引出新的面。M1 的目标是“最小诚实闭环”，而这一能力不是闭环的必要部分。
- **M1 规则（唯一定义在 `11` §11.7.0）**：
  - 验证标准**不能**声明机密（`exec` 标准的 `env` 字段在 M1 中不可用；合同编辑器拒绝并提示）；Agent 的工具调用也不获得机密（ADR-161）。
  - 需要机密才能运行的检查，在 M1 中写为 **human 标准**——由人在自己的环境中确认并勾选（诚实语法：这是 Human，不是 Fact）；合同编辑器在人试图给 exec 标准加机密时，给出“改为 human 标准”的一键转换。
  - 钥匙串在 M1 中只存放 Tower 自己使用的凭据：模型提供商密钥（进程内存交给 Pi，ADR-158/159）与云 SDK 凭据（即时投递文件，只交给 Engine Host）。这两类从不进入 Agent、验证器或检验检出的进程。
- **随之移到 M2 的机制**（登记于 `16` 废弃表，设计保留为 M2 的起点）：带机密标准的机密阶段（ADR-162/163）、调度互斥与 `secretMutex.enabled`（ADR-160）、整机冻结（保留 `startAgentActivity()` 作为唯一启动点的**架构约定**，但 M1 中它没有冻结状态）、`secret_wait` Needs-You 与 `verify.secret_wait.*` 命令、`accept_secret_exposure`、`not_run{blocked_by_sentinel}` 与 `secretPhaseOnly`（M1 中 `not_run` 不再出现）、`secretsVia`、验证器沙箱对投递文件的逐路径放行、条目分类与授权（R38-D11-02 的期望形态作为 M2 设计输入）。
- **保留在 M1 的**：
  - **人输入文本的机密检查**（R38-D11-03）：协议层对**所有**携带人类自由文本、且会进入模型上下文的命令参数（回答、重新回答、转向、恢复与重试的附言、评论、交还说明、合同文本、人写的记忆）统一检查；匹配集合 = 钥匙串中 Tower 持有值的精确匹配 + `11` §11.7 的模式（URL 凭据、常见 token 前缀、私钥头）；命中返回 `E_CONFIRM`。
  - **沙箱拒绝钥匙串服务查找**（R38-D11-04）：SP6a A8 若显示该拒绝会破坏常用工具，则**取消该拒绝**，只依赖钥匙串条目的访问控制列表（其他进程读取会触发系统授权提示）；由于 M1 中验证器不接触机密，验证器沙箱不受此影响。
  - T33b 在 M1 中不再适用（没有向 Agent 可影响进程投递机密的路径）；T33 的残余为：用户自己配置的 MCP 环境、用户自己的其他进程。
- **其余**（R38-D6-01、D7-01、D10-01、D11-01、D11-05 均属于已移到 M2 的机制，M1 中不再成立）；R38-D15-01 中仍适用的条目（`03` L84 出口列、`12` 的机密输入提示文案）由作者修正。
- **排期**：W9/W10 中机密阶段、互斥、冻结与相关用例的工时移出 M1。

---

## 第 39 轮对抗评审后的跨文档决策（ADR-165）

## ADR-165 让 ADR-164 的不变式真正成立：本地文件、注册表令牌与工具令牌 — Accepted（R39 全部条目；Amends ADR-033、ADR-063、ADR-078、ADR-082、ADR-164；Amended by ADR-166）

- **本地文件中的机密**（R39-D11-01）：M1 的“本地文件”清单（ADR-078/082）区分两类——普通本地文件照常播种到验证槽位与检验检出；**含机密的本地文件**（文件名匹配 `.env*`、`*.pem`、`*.key`、`*credentials*`、`*.p12` 等模式，或用户标记为机密，或内容匹配 `11` §11.7 的机密模式）在 M1 中**不播种**到验证槽位、检验检出或卫星。依赖这些文件才能运行的检查写为 human 标准（与 ADR-164 相同）。本地文件设置页对这类文件显示“M1 中不提供给验证与检验（需要它的检查请写为 human 标准）”，替换原来的“不给 Agent”。ADR-164 的不变式因此成立，T33b 维持“M1 不适用”。
- **注册表令牌**（R39-D11-02）：
  - ADR-063 中“合同可把注册表令牌授予 Agent 可读的 npmrc”在 M1 中**撤回**（没有对应字段、命令与界面），移到 M2，与 `secrets.access` 一并设计。
  - 安装器第 1 阶段（fetch，需要令牌访问私有注册表）只运行包管理器自身、**不执行任何项目代码**（禁用 pnpmfile 与生命周期脚本）；令牌以即时投递文件（`~/.tower/run/<id>/`，0600，阶段结束即删）提供，不再在 `~/.tower/installer/` 下长期保存明文 npmrc。第 2、3 阶段（离线，执行项目脚本）不含令牌。
- **工具令牌**：ADR-033 中导入的工具令牌（如 GitHub 令牌）在 M1 中**不导入**——M1 没有推送与开 PR（ADR-133），Tower 不需要它们；导入移到 M2。钥匙串在 M1 中因此只存：模型提供商密钥、云 SDK 凭据〔ADR-166 更正：注册表令牌不由 Tower 保存，每次从用户 npmrc 读取〕。
- **一致性**（R39-D15-01）由作者统一：`10` L127/L426、`16` 废弃表“新表述”列、M2 材料中的交叉引用改指 `07` §7.4.11、`06` L293、`02` L472。
- **第 39 轮补记（ADR-165）**：按**文件名模式**判定为机密的本地文件不可由用户取消标记（保守）；按内容匹配或用户标记判定的可以取消，取消时确认“该文件将被复制到 Agent 可读的工作目录”。

---

## 第 40 轮对抗评审后的跨文档决策（ADR-166）

## ADR-166 ADR-165 的后续闭环：检验检出的显式选择、缺失机密文件的失败归类、本地文件实体、注册表令牌来源、项目变量 — Accepted（R40 全部条目；Amends ADR-078、ADR-082、ADR-165；Amended by ADR-167、ADR-170、ADR-171、ADR-172、ADR-173；secret_file_unseeded 归类 Superseded by ADR-168）

- **检验检出由人显式选择是否带上机密文件**（R40-D11-01、R40-D8-01）：检验检出默认**不**含机密本地文件（与验证槽位、卫星相同）。打开检验时，若项目有机密本地文件，提供开关“带上本地机密文件（由我自己运行 Agent 的代码）”，默认关闭；打开即记 `HumanDecision{inspect_with_secrets}`（仅本机），界面写明“运行期间 Agent 写的代码会读到这些文件；同一用户的其他进程也可能读到”。这是**人发起的**例外，等同于人在自己机器上运行该分支；ADR-164 的不变式据此表述为“**Tower 不会自动**把机密交给 Agent 可影响的进程”。`11` 威胁表登记为人发起的残余（T31 更新）。需要机密的 human 标准因此可以完成：人在带机密的检验检出中确认后勾选。`10` §10.8.3、`04` 的检验与“我来改”文案、`11` 信任提示据此统一。
- **缺失机密文件导致的失败**（R40-D7-01）：验证或试运行失败时，若输出中出现**未播种的机密本地文件的路径或文件名**（如 `.env.local` 不存在、dotenv 加载失败），该标准记 `verify_env_error{stage:"secret_file_unseeded", files}`——不是 Agent 的失败，不自动返工；Needs-You 建议“改为 human 标准”或“去掉对该文件的依赖”。试运行出现同样情形时不显示“✓ 红灯，可证明完成”，而显示“需要本地机密文件，M1 中无法机器验证”。合同批准时，若项目有机密本地文件，提示“读取这些文件的 exec 标准在 M1 中无法通过”。
- **本地文件实体**（R40-D4-01）：`ProjectLocalFile{projectId, path, secretBy: "name" | "content" | "user" | null, unmarked: {contentHash, decisionId} | null}`（`02` 定义，`06` 表 `project_local_files`）。命令 `project.local_files.mark_secret{path}`、`project.local_files.unmark_secret{path}`（后者记 `HumanDecision{unmark_secret_file}`，仅本机；按文件名判定的不可取消）。取消标记绑定当时的内容哈希；每次播种前重新扫描，内容变化且再次匹配机密模式时自动恢复为机密并通知。
- **注册表令牌的来源**（R40-D11-02）：Tower **不保存**注册表令牌。安装器第 1 阶段每次运行时，从用户的 `~/.npmrc` 与项目 `.npmrc`（只取 `//<registry>/:_authToken` 等认证行，按注册表对应）读取，写入即时投递文件；因此没有刷新问题，钥匙串在 M1 中只存两类（模型提供商密钥、云 SDK 凭据）。`dep.add` 的代理安装同样走第 1 阶段（`16` L1061 改正）。`11` 中 MCP 的“显式授予”删除（MCP 环境由用户配置，属已登记残余）。
- **项目变量**（R40-D11-03）：`VerifyProfile.env.vars` 的值在编辑时经过机密检查；命中时在 M1 中拒绝保存（“项目变量会进入 Agent 与验证器的环境，M1 中不能放机密；需要机密的检查请写为 human 标准”）。
- 其余一致性条目（R40-D15-01）由作者统一。

---

## 第 41 轮对抗评审后的跨文档决策（ADR-167）

## ADR-167 `secret_file_unseeded` 以沙箱记录判定；其出口；本地文件命令；人工编辑检出与机密文件；npmrc 的信任边界 — Accepted（R41 全部条目；Amends ADR-166；secret_file_unseeded 归类 Superseded by ADR-168；Amended by ADR-225）

- **判定依据改为沙箱记录，而不是输出文本**（R41-D7-01）：输出文本来自 Agent 可影响的代码（dotenv 会在文件不存在时仍打印文件名），不能作为归类依据。改为：验证器沙箱对每个**未播种的机密本地文件路径**设置“拒绝并报告”的读取规则；标准失败**且**沙箱报告中记录了对这些路径的读取尝试 → `verify_env_error{stage:"secret_file_unseeded", files}`；否则按普通失败处理（含自动返工）。沙箱报告由内核/沙箱层产生，Agent 无法伪造；Agent 若故意读取该路径，结果只是进入人工决定（不返工、不算通过），不会产生错误的“通过”。试运行同理：有读取尝试时显示“需要本地机密文件，M1 中无法机器验证”，不显示红灯徽标。SP6a 测量 Seatbelt 的报告能力；**回退**：若不可用，则不做自动归类，失败一律按普通失败，卡片在项目有机密本地文件时附提示“若该失败由缺少本地机密文件引起，请改为 human 标准”。G46 增加反例：dotenv 打印文件名但真实断言失败 → 普通失败。
- **`secret_file_unseeded` 的出口**（R41-D4-01）：Goal 进入 `paused(verify_env_error)`，选项与命令：
  - “改为 human 标准” → `contract.amend`，由界面生成把该标准由 `exec` 改为 `human` 的修订（保留描述，原命令写入说明）；按 `03` §3.4.5 的修订矩阵继续（标准变化 → 以新合同重新验证）；
  - “去掉对该文件的依赖” → `goal.request_changes{comment}`（允许自 `paused(verify_env_error)` 发起：解除本原因，继续目标改写为 `run`，评论进入开场）；
  - “重试验证” → `retry_verify`（同一 pin）。
  `03` §3.2.1 的 `verify_env_error` 行补上这两条出口。
- **本地文件命令**（R41-D4-02）：`project.local_files.add{path}`、`project.local_files.remove{path}`、`project.local_files.approve{path}`（记 `HumanDecision{approve_local_file}`；`06` 外键据此修正）；均为本机或 web 可用，`approve` 仅本机。
- **人工编辑检出**（R41-D8-01）：人工编辑检出是人自己的工作副本，默认不含机密本地文件；提示改为“此副本不含本地机密文件；需要运行时请自行复制进来”。**交还时一律排除机密本地文件的路径**（不进入 T1、不进入任何检查点或 seal），无论人是否复制了它们。
- **npmrc 的信任边界**（R41-D11-01）：安装器第 1 阶段只从**用户级** `~/.npmrc` 读取认证行，其中的 `${VAR}` 以用户登录环境展开；**项目 `.npmrc` 中的认证行不读取**（仓库控制的凭据不可信，与 pnpm 自身的行为一致）。
- **`project.verify_profile.update` 的字段级远程规则**（R41-D11-02，M2 的 `serve` 才相关）：`env.network`、`prefetch`、`sentinelExceptions` 及任何放宽安全的字段仅本机；其余字段 web 可用、手机禁止。
- 其余一致性条目（R41-D15-01）由作者统一；`03` L69 顿号与 `07` §7.4.1 交叉引用由主干与对应作者一次性改正。

---

## 第 42 轮对抗评审后的跨文档决策（ADR-168）

## ADR-168 撤回 `secret_file_unseeded` 自动归类，改为如实提示；补齐本地文件批准字段与检验的来源状态 — Accepted（R42 全部条目；Supersedes ADR-166/167 中的 `secret_file_unseeded` 归类与其暂停出口；Amended by ADR-169）

- **原因**（R42-D7-01，评审实测）：沙箱对**不存在**的路径的拒绝规则不会触发（读取直接返回 ENOENT），而未播种的机密文件恰好不存在；另一方面，宽松的加载器（dotenv、Vite、Next 的 env 加载）每次运行都会尝试读取 `.env.local`，读取尝试只是共现，不是因果。任何基于“读取尝试”或“输出文本”的自动归类都会把普通失败误判为环境故障。
- **新规则**（唯一定义在 `07` §7.4.1）：**不做自动归类**。标准失败一律按普通失败处理（含自动返工、返工上限）。当项目存在**未播种的机密本地文件**时：
  - 失败卡片附提示（Claim 语法，不是 Fact）：“本项目有 M1 中不提供给验证的本地机密文件（`<路径>`）；若该失败源于此，请改为 human 标准”，并提供“改为 human 标准”（`contract.amend`，按 `03` §3.4.5 修订矩阵继续）；
  - 返工证据中附同样一行，让 Agent 知道这些文件在验证环境中不存在（Agent 可以让测试不依赖它们，或在 `submit` 中说明）；
  - 试运行的红灯徽标旁附同一提示（“若失败源于缺少本地机密文件，这不是有效红灯”）。
- **撤回**（登记于 `16` 废弃表）：`verify_env_error{stage:"secret_file_unseeded"}`、其 Needs-You（`ve:{goalId}:secret_file_unseeded`）与三个出口、验证器沙箱对未播种路径的“拒绝并报告”规则、SP6a A13、`goal.request_changes` 自 `paused(verify_env_error)` 发起的特例、G46 中依赖该归类的用例。R42-D4-01 随之不再成立。
- **本地文件批准字段**（R42-D15-01）：`ProjectLocalFile.approved: {decisionId} | null`——只有已批准的普通本地文件才会播种。
- **`inspect.open` 的来源状态**：`in_review`、`accepted`，以及 `paused` 中由验证结果导致的原因（`verify_failed_limit`、`human_change_verify_failed`、`sentinel_high`）；检验对象为当前 pin。其他状态返回 `E_STATE`。
- `11` L339 的绝对化措辞改为“Tower 不会自动……”（作者修正）。

---

## 第 43 轮对抗评审后的跨文档决策（ADR-169）

## ADR-169 “改为 human 标准”由界面串联重新验证；本地文件的两个派生谓词；检验 pin 的定义；删去无来源的文件建议 — Accepted（R43 全部条目；Amends ADR-168 的提示触发条件与 `inspect.open` 来源状态；Amended by ADR-170）

- **“改为 human 标准”的后续状态**（R43-D4-01，采用评审方案 A，不改状态机）：
  - 按钮只出现在 `paused(verify_failed_limit)` 与 `paused(human_change_verify_failed)` 的 `verify_failed` 卡片上；自动返工期间（`running`）不提供此按钮，提示只进入返工证据。人随时可以打开合同修订，按 `03` §3.4.5 矩阵 `running` 列处理（只让受影响的 Fact `expired`，不重新验证）。
  - 后果：修订（把失败的 exec 标准改为 human 标准的 `contract.amend`）生效、`contract.amended`（即 `contract.ratified{v+1}`；系统中没有名为 `contract.amended` 的事件，ADR-176）入账后，**界面自动发出 `retry_verify{pin:"same"}`**。这条命令在两个暂停原因中都已允许（`03` §3.2.1），它解除本原因，并把继续目标改写为 `verify{pin}`。Goal 回到 `verifying`，其余 exec 标准照常运行；全部通过后进入 `in_review`，由人勾选该 human 标准。
  - 修订被取消或未生效时，不发出 `retry_verify`，Needs-You 保持打开。
  - 唯一定义写在 `03` §3.4.5 的 `paused` 列注；`04`、`07` 引用。`08` 中该选项的关闭条件为“重新验证开始”（`retry_verify` 被接受），不是“选项被选择”。
  - `06` 的 `contract.amend` 效果列不变：重新验证由界面发出的第二条命令完成，命令层没有隐式行为。
- **本地文件的两个派生谓词**（R43-D15-01 第 1 项，唯一定义在 `16` 的 `ProjectLocalFile` 行；`06` VerifierScheduler、`07` §7.4.1 提示、`11` 引用，不再各写一遍）：
  - `isSecret(f) = f.secretBy ≠ null ∧ f.unmarked = null`；
  - `seeded(f) = f.approved ≠ null ∧ ¬isSecret(f)`。
  - 只有 `seeded` 的文件会被播种到验证槽位、默认检验检出与卫星。失败卡片、返工证据与试运行的提示只列出 `isSecret` 的条目；已取消标记并批准的文件照常播种，**不**出现在提示中。
- **检验 pin**（R43-D15-01 第 2 项）：
  - `inspect.open` 的检验对象为**该 Goal 最近一次完成的验证的 pin**。
  - 来源状态的守卫保证这次验证正是造成当前状态的那一次。`paused(sentinel_high)` 只在由 `verifying` 进入（detector 不是 `nested_repo_live`）时允许；`nested_repo_live` 返回 `E_STATE`，因为此时 Goal 在 `running` 中被打断，最近的 pin 不代表当前工作。
- **本地文件建议的来源**（R43-D15-01 第 3 项）：
  - 删去“最近被测试读取过”（理由同 ADR-168：被忽略的文件在卫星与槽位中不存在，读取不可观测）。
  - 建议只来自用户检出中**被 git 忽略、文件名匹配常见运行时配置模式**（如 `.env*`、`*.local.*`、`config/*.local.json`）的文件。线框文字改为“（被忽略，名称像运行时配置）”。Tower 只建议，不自动加入。

---

## 第 44 轮对抗评审后的跨文档决策（ADR-170）

## ADR-170 每次播种前重新判定机密；`approve` 不隐式加入；`unmarked` 的约束；第 43–44 轮排期补记 — Accepted（R44 全部条目；Amends ADR-166/169 中 `secretBy` 的写入时机；Amended by ADR-171、ADR-172）

- **判定时机**（R44-D11-01 第 1 点，采用评审方案 A；唯一定义在 `16` 的 `ProjectLocalFile` 行，`06` VerifierScheduler、`07` §7.4.1/§7.4.2、`10`、`11` 引用）：
  - **每次播种前**（卫星创建或重建、验证槽位、检验检出）对清单中**每个**条目按名字与**当前内容**重新判定。
  - `secretBy = null` 的条目命中时，Supervisor 写入 `secretBy = "content"`（事件 `project.local_file_secret_detected`，⚙️）。这次不播种，并发通知“`<路径>` 现在含有机密形态的内容，已改为机密本地文件，不再播种”。`approved` 保留，但按谓词不再使文件 `seeded`。
  - 已取消标记的条目沿用原规则：内容哈希变化且再次命中时清除 `unmarked`。
  - 谓词 `isSecret` / `seeded`（ADR-169）不变，`secretBy` 的写入者从“加入时”扩展为“加入时 + 每次播种前”。
  - 扫描命中的值同时加入脱敏器的精确匹配集（`11` §11.7）。
  - 扫描失败（文件不可读）时按命中处理：不播种并通知（失败关闭）。
  - 扫描使用与 `add` 时相同的名字模式与内容模式（`11` §11.7.1）。清单通常只有几个小文件，扫描只在播种时进行，不进入热路径。
- **建议条目与 `approve`**（R44-D11-01 第 2 点）：
  - `project.local_files.approve` 对清单中不存在的路径返回 `E_STATE`，不隐式插入。
  - 界面建议条目的 `[添加]` 先发 `add`，`add` 照常按名字与内容判定。判定结果不是 `isSecret` 时，界面再发 `approve`；是 `isSecret` 时不发，条目显示为“机密本地文件 · M1 不播种”。
- **`unmarked` 的约束**（R44-D11-01 第 3 点）：
  - DDL 增加 `CHECK (unmarked IS NULL OR secret_by IS NOT NULL)`；
  - `unmark_secret` 对 `secretBy = null` 的条目返回 `E_STATE`。
- **用例**（R44-D11-01、R44-D14-01 第 2 点）：
  - G46 加两组：(i) 中已批准的普通本地文件随后写入机密形态的值并触发播种 → 不播种、`secretBy` 变为 `content`、通知人，卫星、槽位、检验检出中都没有该文件；从建议条目 `[添加]` 一个 `.env.*` 文件 → `secretBy = name`，界面不发 `approve`，不播种。
  - G46(ac) 的前提改为返工达上限进入 `paused(verify_failed_limit)`，并在同一项目中放一个 `isSecret` 条目，断言卡片只列出该条目。
- **排期**（R44-D14-01 第 1 点）：第 43 轮（ADR-169）与第 44 轮（ADR-170）的增量合并登记于 `14` §14.3.4 开头与本文件 ADR-133 附记，按 WBS 行与主责线分配，并更新 `14` 的轮次清单。

---

## 第 45 轮对抗评审后的跨文档决策（ADR-171）

## ADR-171 重新判定覆盖所有复制点且判定与复制用同一份内容；`mark_secret` 清除 `unmarked`；不可读不改写分类 — Accepted（R45 全部条目；Amends ADR-166/170；Amended by ADR-172）

- **作用范围**（R45-D11-01，唯一定义在 `16` 的 `ProjectLocalFile` 行）：
  - 判定时机与 `seeded` 的作用范围改写为“**任何把本地文件复制出用户检出的地方**”。列举四处：卫星创建或重建、验证槽位、检验检出（含 `inspect_with_secrets` 的普通文件部分）、**人工编辑检出**（`10` §10.8.4）。今后新增的复制点自动适用，不需要再列。
  - **同一份内容**：每个条目只读一次，读入内存后判定，再把这份内容写出。内容哈希（`unmarked.contentHash` 的比较）也取自这一份。不先判定、再从磁盘复制。
  - `06` VerifierScheduler、`10` §10.8.3/§10.8.4 引用 `16`。人工编辑检出打开前的提示“此副本不含本地机密文件”由此成立。
- **`mark_secret` 的效果**（R45-D4-01，唯一定义在 `16`，`06` 命令表、`02` 注释引用）：
  - 对 `isSecret` 为假的条目：写 `secretBy = 'user'`，**同时清除 `unmarked`**。`unmarked` 的写入者因此增加 `mark_secret`。
  - 对已是 `isSecret` 的条目：幂等的无操作，**不覆盖**已有依据（`name` 保持 `name`，`content` 保持 `content`）。`name` 条目因此仍不可取消标记。
- **不可读与不存在**（R45-D4-02，唯一定义在 `16`）：
  - 清单中的文件在用户检出中不可读或不存在时，这一次不复制，**不改写** `secretBy`。
  - 发一条独立的 L1 通知“`<路径>` 无法读取（或不存在），本次未复制”，按条目去重；之后成功读取时自动消失。
  - 只有内容真正命中时才写 `secretBy = 'content'`，并发 `project.local_file_secret_detected`。该事件的 producer 为 `sm`：执行复制的服务把判定结果交给 Supervisor 写入。
- **用例与排期**（R45-D14-01）：
  - `14` L394 的 28.86 改为“短于最长角色线（28.88）”。
  - G46 加三组：(ad) 的复制点扩展到人工编辑检出；已取消标记的条目被重新标记后不再播种；对 `name` 条目执行 `mark_secret` 后依据仍为 `name`，且 `unmark_secret` 仍返回 `E_STATE`。另加一组：文件不存在时不复制、`secretBy` 不变、显示“无法读取”通知。落地为 G46(af)(ag)(ah)：重新标记与 `name` 条目两种情形合为 (ag)。
  - 增量约 +0.03 人周，按 WBS 行的主责线登记；不进入系统线（ADR-136）。

---

## 第 46 轮对抗评审后的跨文档决策（ADR-172）

## ADR-172 本地文件复制结果的记录：自动恢复事件、未复制 Fact、envHash 与失败提示 — Accepted（R46 全部条目；Amends ADR-170/171；`local_file_unreadable` Fact 与“记录的 `extra`” Superseded by ADR-173）

- **自动恢复的事件**（R46-D6-01 第 1 点）：
  - 播种前的重新判定清除 `unmarked`（内容哈希变化且再次命中）时，在同一事务中记录 `project.local_file_unmark_reverted{projectId, path}`（`source = system`，producer `sm`）。
  - 同时发 L1 通知：“`<路径>` 的内容变化后再次命中机密模式，已恢复为机密本地文件”。
- **“未复制”的载体**（R46-D6-01 第 2 点、R46-D8-01 第 1 点；唯一定义在 `16` 的 `ProjectLocalFile` 行）：
  - 只对**这次本应复制的条目**适用：`seeded` 的条目；`inspect_with_secrets` 时另含 `isSecret` 的条目。
  - 这样的条目不可读或不存在时，记一条项目级 Fact `local_file_unreadable{projectId, path}`，producer 为执行复制的服务（`verifier` 或 `git`）。同一条目只保留一条 `fresh` 的 Fact，下一次成功读取、条目被移出清单或改为机密时 `expired`。L1 通知由这条 Fact 产生，随它失效而消失。
  - 其他条目（未批准或机密，本来就不复制）缺失时不记 Fact、不通知，只在设置页该行显示 `◇ 文件不存在`。
  - 重新判定命中时的通知按条目原状态给出如实文案。原先 `seeded` 的条目写“……已改为机密本地文件，不再复制”；未批准的条目只写“……已改为机密本地文件”。
- **envHash 与同一次读取**（R46-D7-01）：
  - `07` §7.3 的 `envHash` 增加一项：**该槽位实际复制的本地文件 `(path, contentHash)` 列表**；本应复制而未复制的条目以 `(path, "not_copied")` 进入，集合变化也会改变缓存键。机密条目与未批准条目不进入。
  - 哈希取自复制时的同一次读取。验证结果入账时记录的本地文件哈希、指纹的 `extra` 部分，都取自该槽位复制时的那一份（写入 `16` L510 的“同一份内容”）。
- **失败提示**（R46-D8-01 第 2 点，`07` §7.4.1）：
  - 本次验证有本应复制而未复制的文件时，`verify_failed` 卡片与返工证据各附一行 Claim：“本次验证中 `<路径>` 未复制（无法读取或不存在）；若失败源于此，请恢复该文件后重试验证”。
  - 返工证据另写明：该文件在用户检出中，Agent 无法恢复。
  - 这条提示与机密文件提示并列，同样不改变 `decide()` 的去向。
- **排期文字**（R46-D14-01）：
  - `14` L400 的合计按取整值相加（第 45 轮数值下为 127.39；计入本轮增量后为 127.41），T = 23.53，结论不变。
  - 依赖链按 W9b = 6.5 改为 19.7 工作周（`14` L394、L400），仍短于最长角色线 28.88。
  - 本轮增量约 +0.02 人周（W9 Agent、W11 桌面各约 0.01），按第 46 轮登记，不进入系统线。

---

## 第 47 轮对抗评审后的跨文档决策（ADR-173）

## ADR-173 本地文件复制结果按验证记录；撤回 `local_file_unreadable` Fact，“无法读取”通知改为进程内状态；缓存查询与复制共用一次读取 — Accepted（R47 全部条目；Supersedes ADR-172 中的 `local_file_unreadable` Fact 与“记录的 `extra`”；Amended by ADR-174）

- **一次读取，两种用途**（R47-D7-01 第 1 点，`07` §7.4.1 `verify()` 注释为正文）：
  - 验证开始时，先对 `seeded` 条目逐个读入内存，并按 `16` 的规则重新判定。由这份内容算出 `envHash` 的本地文件项，再查同指纹缓存。
  - 未命中时进入槽位，写出的就是这份已读入的内容，不再读第二次。查询键与复制内容因此必然一致，没有“两次读取之间被修改”的分支。
  - 全部命中时不取槽位，记录的仍是这次读入的哈希。
- **记录字段**（R47-D7-01 第 2 点）：
  - `criterion_check.env` 增加 `localFiles: {path, contentHash | "not_copied"}[]`，取自上述读取。只含本应复制的条目，机密与未批准条目不进入。
  - G46(ai) 的断言改为针对该字段。
- **结果是否随本地文件变旧**（R47-D7-01 第 3 点，二选一取后者）：
  - `criterion_check` 的新鲜度只按 tree 比较（`07` §7.3.3 不变），**不使用**指纹的 `extra`。
  - 本地文件的变化只在下一次验证时经 `envHash` 体现：已通过的结果不会因为人修改了用户检出中的本地文件而自动变旧。
  - 指纹的 `extra`（`extraGlobs`）保持 ADR-078 的原义，不与验证结果绑定。删去 `07` L261、L488 与 `16` 中“验证结果上记录的 `extra`”的说法。
- **失败提示的来源**（R47-D8-01）：
  - `verify_failed` 卡片与返工证据中的“本次验证中 `<路径>` 未复制”一行，取自**本次验证**记录的 `localFiles` 中 `not_copied` 的条目，不取自显示时的任何项目级状态。
  - `07` §7.10.3 的返工消息模板加上这一行，并写明 Agent 无法恢复该文件。
- **撤回 `local_file_unreadable` Fact**（R47-D6-01，以删除关闭）：
  - 失效没有持久化的落点；按验证记录的来源已由 `localFiles` 承担；剩下的 L1 通知不需要账本。
  - **新规则**（唯一定义在 `16` 的 `ProjectLocalFile` 行）：本应复制的条目不可读或不存在时，执行复制的服务发一条 L1 通知“`<路径>` 无法读取（或不存在），本次未复制”。这条通知是**进程内状态**，按条目去重，不写账本。
  - 通知消失的条件：之后成功读取该条目；条目被移出清单；`mark_secret` 使条目由非机密变为机密（按转移判断；检验场景中产生时已是机密的条目不受此条影响）。
  - Tower 重启后不保留这条通知，下一次复制再读不到时重新出现。
  - 登记于 `16` 废弃表：`Fact.kind` 回到 32 项，`02`、`06`、`07` §7.3.3 新鲜度表中的这一行删除。
- **排期**：增量约 +0.01 人周（W9 Agent：字段与读取顺序；撤回 Fact 抵消一部分），按第 47 轮登记，不进入系统线。

---

## 第 48 轮对抗评审后的跨文档决策（ADR-174）

## ADR-174 在途验证写出前复核；重放的本地文件；项目级本地文件通知的呈现；删除 `fingerprint.extraGlobs` — Accepted（R48 全部条目；Amends ADR-173；删除 `07` §7.3.2 的 `fingerprint.extraGlobs`；Amended by ADR-175）

- **在途验证写出前复核**（R48-D11-01，唯一定义在 `16` 的 `ProjectLocalFile` 行，`07` §7.4.1 `verify()` 引用）：
  - 写进槽位之前，按**当前**状态复核读入的每个条目是否仍为 `seeded`。这只查清单行，不读文件。
  - 有条目已不再 `seeded`（`mark_secret`、`remove`、自动改为机密）时，这次不写出任何本地文件。本次验证回到读取一步重新开始：重新读取、重新算 `envHash`、重新查缓存。槽位保留，不重新排队。
  - 这样“查询键 = 槽位内容 = 记录”保持不变，`04` 的“此后不再复制”与 `06` 的“此后不自动播种”照字面成立。
  - 复核与写出在同一个 Supervisor 回合内完成，命令层的 `mark_secret` / `remove` 与之串行（单写者）〔ADR-175 改为按 Project 的本地文件锁〕。
- **重放的本地文件**（R48-D7-01，`07` §7.4.1 重放规格）：
  - 重放属于复制点之一，按 `16` 的规则读入、判定、写出 `seeded` 条目，并把当前内容哈希与原验证 `env.localFiles` 逐条比对。
  - 全部一致时，结论照现有分类。有不同、缺失或原记录为 `not_copied` 的条目时，结论写“复现条件不同：本地文件 `<路径>` 已变化或缺失”，不写“复现”。
  - 导出的重放包（`tower verify --export`）不含本地文件。在其他机器上重放、而 `env.localFiles` 非空时，结论同样写“复现条件不同”。
- **项目级本地文件通知的呈现**（R48-D8-01，`08` §8.1 与 `04` 本地文件设置一节）：
  - **位置**：本地文件设置页对应行显示 `◇` 与说明；侧栏底部的设置入口（`04` §4.3.2，项目设置由此进入）显示一枚项目级 `◇`，点击进入该页。不进入收件箱，不计入 Dock 角标与打扰预算。
  - **送达**：ADR-170/172 的两条（`project.local_file_secret_detected`、`project.local_file_unmark_reverted`）由事件投影得到；“无法读取”来自 Supervisor 的进程内状态。三者都经 `settings` 主题（Project 设置）推送，renderer 重新订阅时随快照取得。
  - **消失**：两条事件类通知在人打开本地文件设置页后消失。“已查看”是项目级水位：打开该页时界面发出 `project.local_files.viewed{projectId, seq}`（`read` 能力），更新 `watermarks`（scope `localfiles:<projectId>`），不进入 EventLog，不是 HumanDecision。“无法读取”的消失条件不变（ADR-173）。
- **删除 `fingerprint.extraGlobs`**（R48-D15-01，以删除关闭）：
  - 已播种文件全部进入 `envHash`，槽位中只会出现已播种文件，`extra` 已无消费者。
  - 指纹改为 `` `wt1:${tree}` ``（`:weak` 照旧）。删去 `07` §7.3.2 的 `extra` 计算、§7.10 VerifyProfile 的字段与默认值行。
  - `09` 的学习提议改为“把该文件加入本地文件清单”：仍需批准，经 `project.local_files.add`，加入后按 `16` 的规则判定。
  - 登记于 `16` 废弃表与 lint (d)。
- **用例**：G46(ag) 加在途 `mark_secret` 一组；G46(aj) 覆盖重放的“复现条件不同”与项目级 `◇` 的出现和消失。
- **排期**：增量约 +0.02 人周，删除抵消一部分。分配：W9 Agent +0.01（复核与重放），W11 桌面 +0.01（项目级 `◇`），按第 48 轮登记，不进入系统线。

---

## 第 49 轮对抗评审后的跨文档决策（ADR-175）

## ADR-175 按 Project 的本地文件锁；重放只写出原记录的路径；项目级通知的查看规则与聚合 — Accepted（R49 全部条目；Amends ADR-174）

- **串行机制**（R49-D6-01，唯一定义在 `16` 的 `ProjectLocalFile` 行，`07` `verify()` 引用）：
  - ADR-174 的“同一个 Supervisor 回合”改为**按 Project 的本地文件锁**。这是 Supervisor 进程内的异步互斥，只串行同一 Project 的本地文件操作，不阻塞其他命令。
  - 取这把锁的有：该 Project 的 `add`、`approve`、`remove`、`mark_secret`、`unmark_secret`，以及各复制点的“复核 + 写出”。
  - 复制写出期间到达的命令等待写出完成，写出只涉及几个小文件。等待后命令生效，下一次复制按新状态判定。
- **重放的本地文件集合**（R49-D7-01，`07` 重放规格）：
  - 重放只对原验证 `env.localFiles` 中列出的路径读入、判定、写出（其中当前仍为 `seeded` 的条目）。原验证之后才批准的条目不写出，重放环境的本地文件集合与原验证一致。
  - 当前已不再 `seeded`、因而未写出的条目，也归入“复现条件不同”。
- **项目级通知的查看与聚合**（R49-D8-01，`08` §8.1、`04` §4.3.2/§4.15.1）：
  - 水位推进沿用 §8.10.1 的规则：本地文件设置页在窗口聚焦状态下连续可见 ≥ 3 s 时，界面发出 `project.local_files.viewed`。
  - 推进后侧栏 `◇` 消失；本页的行内说明在这次访问中保持显示，离开本页后才消失。
  - 多个项目同时有通知时，侧栏显示 `◇ N 个项目`，点击进入项目设置列表，有通知的项目带 `◇`。只有一个项目时为 `◇ <项目名>`。
- **漏改**（R49-D15-01）：`12` L326 改为“侧栏底部的设置入口”；`14`、`15` 中“按条目记最后查看序号”的历史文字加注“改为项目级水位”。
- **用例**：G46(aj) 补三组：3 s 规则与行内说明保持、两个项目的聚合显示、重放不写出新批准的条目；另加并发时 `mark_secret` 等待写出完成的一组。
- **排期**：各项都是对既有工作的限定，或沿用既有规则（Goal 水位的 3 s 规则、现有异步互斥），按 WBS 行逐项不足 0.01，计 0。WBS 仍为 121.65，M1 维持 38 周。

---

## 第 51 轮对抗评审（全范围收尾评审）后的跨文档决策（ADR-176）

## ADR-176 全范围收尾评审的十六条：安全边界的远程规则、Agent 可读副本的凭据、生命周期补边与若干一致性 — Accepted（R51 全部条目；Amended by ADR-177、ADR-178、ADR-183）

**安全（重要）**
- **R51-D11-01**：`11` §11.7.0 投递表中注册表认证的来源改为“只限用户级 `~/.npmrc`；项目 `.npmrc` 的认证行不读取（ADR-167）”。
- **R51-D11-02 Agent 可读副本中的凭据**：
  - `$GS/gitconfig` 与 `$GS/npmrc` 的净化由删除清单改为**白名单**，只保留列明的键；另以 `10` §10.1.2 的凭据判定剔除命中的值。
  - Scratch 的读拒绝例外加入仓库元数据中的配置文件，口径与 Goal 的检出读拒绝一致。
  - G46 各补一组。
- **R51-D11-03 改变安全边界的设置只能在本机**：
  - `goal.update_meta` 中**降低** `riskTier` 的部分仅限本机，并作为合同修订记审计；提高风险等级不受限。
  - 策略门禁**不能关闭**：删去 `05` 中“可关闭”的含义，与 `16` 一致。
  - `engine.set_prefs` 中涉及 `gate`、`adapter`、`checkpoints` 的字段仅限本机，按 `project.verify_profile.update` 的字段级写法。
  - 远程选择的 S0 授权按远程授权的统一有效期规则（唯一定义在 `11`）。
  - `project.local_files.remove` 对 `isSecret` 条目仅限本机。
  - Scratch 的读拒绝按路径模式生效，不随条目移出清单而解除。

**本地文件（次要）**
- **R51-D11-04 `mark_secret` 后的已有副本**：
  - 在同一把本地文件锁下，从该 Project 所有活跃卫星与人工编辑检出中删除这份副本。这是 Tower 自己的写入，按 ADR-128 归因，不触发 `external_change`。
  - 检验检出与正在运行的验证槽位给出提示，不改动。
  - 当前内容加入脱敏器精确匹配集。
  - 确认文案如实写“Agent 可能已经读到过这份内容”，`11` T32 的评级理由同步。

**生命周期（次要）**
- **R51-D4-01**：`03` 的 `accepted`、`claimed` 行补上 `06` 命令表允许的边。`budget_hard_cap` 的入口包含任何开 Run 的转移；`human` 暂停在已暂停时按 `16` §16.1.1 的优先级并入，继续目标不变。
- **R51-D4-02 撤销合入**：
  - `reverted` 持久化为 `goals.integration_reverted_seal`；被撤销的 seal 不再触发 `integrated`（`10` 的唯一条件加一项）。
  - 撤销后 Goal 留在 `accepted` 并带 `reverted` 标记，出口沿用 `accepted` 的现有出口；不新增“直接复活”，`03` 与 `06` 的复活守卫不变。
- **R51-D4-03**：新增 `goal.rebuild_satellite{goalId, checkpointN}`，HumanDecision `rebuild_satellite`。
  - 只在 `satellite_missing` 时可用，在重建成功的同一事务中解除本原因。
  - 与 `run.rewind` 不同：它不开 Run，也不改写继续目标。
- **R51-D4-04 有效提交 + 未答阻塞条目**：取方案 (b)。删去“作废”与“提醒是否仍要提交”；作答后经 `settle` 进入 `claimed`，答案在之后的 Run 中送达。

**其余（次要）**
- **R51-D5-01**：F7 文案改为“在终端启动 `pi`，输入 `/login <provider>`”，`05` 依赖表登记。
- **R51-D6-01**：交还写回的目标树 T1 唯一落点为 `human_checkout.targetTree`，与 `syncState='syncing'` 同一事务写入，崩溃续写从这里读取。`02` `HumanDecision` 补 `targetTree?`，只作审计。
- **R51-D7-01**：`full` 与 `decisive` 指纹不一致时，按 I2 与 `external_change` 的分界处理，来源不明者进入 `paused(external_change)`。
- **R51-D7-02 评论的 `addressed`**：验收闸门只接受 ⚙️ 来源的 `addressed`（hunk 已变）或人关闭。🤖 的引用只显示为说法“Agent 称已回应”，不满足闸门；`08` 摘要按来源分开计数。
- **R51-D9-01**：计划步骤与发现中的“Agent 称已完成”用说法字形，只有与 Fact 交叉校验一致时才换成事实样式。超时默认改用系统印章“⚙ 超时默认”，删去“你 · 默认”。
- **R51-D12-01**：`09` 数据清单改为影子检查点 ref 位于 Tower 的 gitdir；开启“保留审计地标”时，地标另写入用户仓库。
- **R51-D13-01**：
  - 撤销外部改动时，在恢复**之前**先做 safety 检查点（记录被撤销的内容），因此可以再撤销。
  - `take_human` 的写回范围为“T0→T1 的差异 ∪ E”，崩溃续写使用同一集合。
- **R51-D15-01**：`16` 补 `agent_proc.kill_requested`，`VerifyTrigger` 补 `agent_bg ↔ agent_bg`；G46 中 `contract.amended` 改为 `contract.ratified{v+1}`。

- **排期**：按第 51 轮登记，按 WBS 行与主责线分配。系统线余量只有 0.12，系统线上的增量按 ADR-136 改派到其他线，M1 维持 38 周。

---

## ADR-177 ADR-176 落地后的补正：其他生态配置副本的白名单、删除 `waitReason:"manual"`、两处登记 — Accepted（R51 作者回报与评审结论中的观察；Amends ADR-176；Amended by ADR-178）

- **其他生态的净化副本**（与 R51-D11-02 同一类）：`16` §16.8.2 的 cargo `config.toml`、uv `uv.toml`、pip `pip.conf` 副本与 `$GS/npmrc`、`$GS/gitconfig` 一样改为**白名单**。只保留列明的键，URL 中的 userinfo 一律剥除，保留的值再经 `10` §10.1.2 的凭据判定。
- **删除 `Goal.waitReason` 的 `manual`**：它没有写入路径。`02`、`06` DDL、`16`、`12` 同步删除。
- **`getShellEnv`**：它不在 v1.2.0 包入口导出，Tower 在 Host 内实现等价函数（`05`）。
- **T33 残余登记**：用户代理变量中写有 Basic 凭据时，会随继承进入 Host 的环境。Tower 不改写它；设置页检测到这种形态时提示改用不带凭据的代理配置。
- **`human_checkout.targetTree`**：沿用该表 JSON 字段的 camelCase 命名，ADR-176 的写法随之改正。
- **排期**：各项不足 0.01，计 0。

---

## 第 52 轮对抗评审（全范围）后的跨文档决策（ADR-178）

## ADR-178 第 52 轮的十六条：生态副本总规则、远程矩阵的封闭字段表、卫星重建的分支、修订引起的验证与诚实语法的收紧 — Accepted（R52 全部条目；Amends ADR-176/177；Amended by ADR-179、ADR-180、ADR-183）

**安全**
- **R52-D11-01（重要）**：
  - `16` §16.8 开头加一条总规则：本节凡是生成 Agent 或验证器可读副本的行，一律白名单 + URL userinfo 剥除 + `10` §10.1.2 凭据判定，今后新增的生态行自动适用。
  - Go 的 `GOENV` 副本按此改写（白名单 `GOPROXY`、`GOPRIVATE`、`GONOSUMDB`、`GONOPROXY`、`GOFLAGS` 中不含凭据的值）。
  - G46(ak) 加 `GOPROXY` 带 userinfo 的一组。
- **R52-D11-02 远程矩阵的封闭表**：
  - `16` §16.5 中 `contract.amend` 与 `project.verify_profile.update` 的远程规则改为**逐字段封闭表**，列明哪些字段 web 可改、按什么方向可改。未列出的字段一律仅限本机。
  - `review.viewPolicy` 降低、`unattended` 任何改动、`maxReworkCycles` 提高、`stopConditions` 删除、exec → human 改写，都只能在本机。
  - `test.quarantine` 仅限本机（它改变验收依据，与 `sentinel.override` 同类）。
  - 验证器执行阶段的网络来源只有 `VerifyProfile.env.network`（仅本机），删去 `07`、`11` 中“合同 `network`”的说法。
- **R52-D11-03 Tower 构造的 Agent 可读副本**：
  - Scratch cwd（M2）只复制已跟踪文件（`--cached`），不复制未跟踪文件。真实检出中被忽略、未列入清单、名字也不匹配模式的文件仍然读允许，登记为 T25 的残余。
  - `contract.md` 的 `## Imported context` 只导入用户检出**之外**的祖先目录中的上下文文件；用户检出内未跟踪的上下文文件按 `11` 走本地文件清单，与“Agent 看不到”一致。

**生命周期**
- **R52-D4-01**：重跑 settle 时阻塞条目仍未作答，这些条目在 Run 结束后不再阻塞 `claimed`（与 ADR-176 的方案 (b) 一致）。Needs-You 保持打开，作答追加到 `pending_openings`，在之后的 Run 中送达。`05` §5.5、`06` 同步。
- **R52-D4-02 卫星丢失与手动重建**：
  - settle 序列中丢失时，继续目标为 `settle`，遵循 `03` 的 settle 规则，不是例外。
  - `rebuild_satellite` 成功后：继续目标为 `run` 时追加一条 `tower.*` 开场“工作目录已从检查点 n 重建”；继续目标为 `settle` 时改写为 `run`，不以旧树套用原提交。
  - 自动重建失败时清除 `satellite_rebuilding`。
  - `06` §6.1.6 加“手动重建中途崩溃”：按持久化的 `checkpointN` 续做。
  - `hand_back` 增加与 `take_over` 相同的卫星守卫。重建写入归为 Tower 自己的写入，不进入交还第 6 步的外部改动判定。
- **R52-D4-03 修订引起的验证**：
  - `03` 的 `in_review`、`accepted` 行补“🧑 `contract.amend`（新增或修改标准）→ `verifying`”，`06` 写明状态效果。
  - 继续目标为 `review{state, pin}` 时，修订标准把它显式改写为 `verify{pin}`（同一 pin、新标准），列入 `03` 与 `16` 的改写清单。
- **R52-D4-04**：降低 `riskTier` 使用独立的决定种类 `lower_risk_tier`（三处登记，仅限本机），不再记为 `amend_contract`，与 I3 和各消费方不冲突。

**其余**
- **R52-D5-01**：取方案 (a)。OAuth 类 provider 需要已安装的 `pi` CLI 完成登录，这一前提写进 `05` §5.10；首次运行检测 CLI 是否存在，F7 指向同一前提。API 密钥类 provider 不需要 CLI。
- **R52-D6-01**：交还参数（`externalResolution`、`resolvePinHits`、`mode`、`note`、`sealNote`）与 `targetTree` 在 ① 的同一事务中写进 `human_checkout`，崩溃续写只从这里读取。
- **R52-D7-01**：非 hunk 锚点的评论没有 ⚙️ 来源，`requiresChange` 的只能由人关闭；界面上对这类评论不显示“已处理”一步。`04` 线框与摘要同步。
- **R52-D7-02**：
  - 计划步骤只在其关联标准（`criteriaIds`）由验证器通过时才显示事实样式 `✓`。否则保留 `┆✓`，交叉校验一致只显示为徽章“一致 · n 条事实”。
  - 规范示例改为结构化断言的硬矛盾（X6：`submit.criteriaSelfAssessment` 与验证器结果）。
  - 软矛盾字形统一为 `12` 的写法，`07` 同步。
- **R52-D8-01**：`12` 的 `CountdownLabel` 直接引用 `08` 计时表的五种情形；“下一件”的理由示例加 `⚙ 规则推荐`。
- **R52-D9-01**：评审队列统一用空心/实心 `✓`；高风险单元换一个不与 danger 冲突的字形，并补中风险字形；诊断时间线的失败命令改用中性字形，进度改为两轨。
- **R52-D13-01**：带 `integration_reverted_seal` 的 Goal 再次 seal 时，按首次 seal 的规则以当前 base 为父，不以被撤销的 seal 为父。
- **R52-D14-01**：G46(an) 的期望改为与 `11` §11.9 一致：远程批准的 S0 授权在该 Run 结束时失效，随后的验证进入 `paused(s0_grant_pending)`；S0 授权卡片如实说明这一后果。
- **R52-D15-01**：登记补齐（`humanCheckout.targetTree`、`target.openingId?`、`06` 指纹变化不称 Fact、`reason.code`）。`not_actionable` 若无去向，从命令参数中删去。

- **排期**：按第 52 轮登记，按 WBS 行与主责线分配；系统线上的增量按 ADR-136 改派，M1 维持 38 周。

---

## ADR-179 第 52 轮的观察与作者回报：措辞、登记、事件类型索引与远程授权的事件型失效 — Accepted（R52 评审结论中的观察与作者回报；Amends ADR-178；Amended by ADR-180、ADR-218）

- **Pi 的措辞**：
  - D58 与 `06` F7 括注改为“`pi /login <provider>` 不触发登录（认证失效时直接报认证错误）”：`prompt` 的预检先于发送（v1.2.0 `agent-session.ts:2118-2131`），认证有效时它才作为一条普通消息进入会话；C39(a) 限定为已认证的 faux provider，并补认证失效的情形。
  - `11` §11.4：`shellPath` 不作为 `createBashToolDefinition` 的参数传入（传入 `operations` 时 Pi 忽略它，`bash.ts:248`），由沙箱执行层用 `getShellConfig(shellPath)` 构造 `operations`（与 `05` §5.3.5 一致）。
- **恢复前 safety 检查点**（`10` §10.8.1 `restorePaths`）：M1 中“可再撤销”的含义是内容保留在影子中（回退到非回合检查点属于 M2）；M2 实现回退时，这个检查点对来源不明的路径记 `externalPaths`，与 drain 期间的回合检查点相同。
- **生命周期**：
  - `03` §3.2.1 `human` 行的接管入口补 `ready`（只在检出完成标记存在时），从 `ready` 接管的继续目标为 `run`。
  - `human_change_verify_failed` 的“回退到人编辑前的检查点”标 M2；`run.rewind` 在 `03` §3.2 的转移边随 M2 回退一并补上。
  - 人工编辑检出丢失时，`goal.resume` 选项的文案按 `takeoverFrom` 显示：`in_review`/`accepted` 为“回到评审”，`running`/`ready` 为“交给 Agent 继续”，`paused` 按保留的继续目标（`06` §6.1.6）。
- **事件**：
  - `16` 新增 §16.1.14 事件类型索引：按前缀列出事件类型与定义位置，只作索引，`06` §6.3 仍是定义处；`tower.*` 注明不是事件类型。
  - `run.requested` 一律在准入通过时发出（`06` §6.2.4，与 `07` §7.10.3 一致）；`06` §6.4.3 “暂停出口的统一写法”中继续目标 `run` 的写法同步。
  - `contract.trial_criterion` 的 `verify.requested{trial:true}` 不经 `verify(goal, trigger)`、没有 `VerifyTrigger`，不生成 pin、不改变状态（`03` §3.4.1、`06` §6.4.3、`16` §16.1.1）。
- **安全登记**：
  - `11` §11.3.1 密钥路径表补 `~/.git-credentials`、`~/.config/git/credentials`、`~/.cargo/credentials.toml`、`~/.cargo/credentials`，`~/.config/gh/**` 注明含 `hosts.yml`。
  - `06` §6.4.7 禁止远程清单补 `project.merge`/`project.split`（`06` §6.4.3 与 `16` §16.5 已是仅本机）。
  - 远程授权的事件型失效：`Goal.s0GrantExpiresOn` 与 `AutonomyMatrix.grants[].expiresOn`，取值 `run_end` · `next_run_start`（`02`、`06` DDL `goals.s0_grant_expires_on`、`16`），规则仍只在 `11` §11.9 定义；本机批准为空。
- **文案与线框**（`04`）：
  - 合同试运行的红灯改为 `◇ 红灯 · 能区分前后`，红灯只说明标准在改动前失败，不证明完成（`07` 同步）。
  - 本地文件表对只做过模式扫描、未命中的条目写 `未检出`，不写“无”。
  - 应用级简报的进度写两轨；账本线框补第二条“无依据”，按“硬矛盾 → 软矛盾 → 无依据”排序，“另有 8 条一致”与表头“全部 12”一致。
- **登记补正**：ADR-134 的 `run` 一项加括注〔settle 序列中丢失时为 settle，ADR-178〕。
- **lint**：`reviews/lint/xref.py` 新增 (p)（`16` §16.8 中副本或净化行须同时出现“白名单”与“凭据判定”）与 (o)（`16` §16.1 中带对象形状的字段行与 `02` 同名类型逐键比较）。
- **排期**：各项按 WBS 行逐项不足 0.01，计 0（同第 49 轮）；`14` §14.3.4 与 ADR-133 第 52 轮补正记同一结论，M1 维持 38 周。

---

## 第 53 轮对抗评审（全范围）后的跨文档决策（ADR-180）

## ADR-180 第 53 轮的十六条：远程封闭表的判别原则、安装器副本纳入规则 5、OAuth 过期按运行期错误识别、重建与交还的基准、运行时授权的存放与若干显示规则 — Accepted（R53 全部条目；Amends ADR-178/179；Amended by ADR-181、ADR-182、ADR-183）

**安全**
- **R53-D11-01（重要）**：`16` §16.5 两张封闭表前加**判别原则**（唯一定义）：“收紧”以字段缺省值下的判定为基准；凡可能使原本失败的运行变为通过、使原本执行的检查不再执行、或放宽自主度、范围与网络的改动都属放宽；两个方向都可能放宽，或结果取决于被测代码自身行为的字段，一律仅本机。逐字段核对两个方向后改为仅本机：`expect.exitCode` 的任何改动（缺省 0，新增非零即放宽）；修改或删除 `stdoutMatches`；新增 `exec` 标准（见 D11-03）；artifact `network` 的任何改动（删除主机使链接检查变为 `skipped` 而结论仍通过）；新增 `links_reachable`、修改已有检查；`intent.constraints` 的措辞修改；`budget.interruptsPerHour`；`VerifyProfile` 的 `exposeGit`、`env.tz`、`env.memLimitMb`、`env.network`、`prefetch`。其余行逐项复核仍成立。G46(ao) 补组。
- **R53-D11-02（重要）**：`16` §16.8 规则 5 的范围改为“由用户配置生成、供 Tower 之外的代码读取的副本”（A、安装器第 2/3 阶段、V），并写明先白名单、再剥除 userinfo、再凭据判定的顺序。安装器第 2、3 阶段不再另有副本，读取与 V 同一份 `$VS/npmrc`（只读）；第 1 阶段（不执行项目或依赖代码）的配置在 `$TI`，认证行即时投递，不属副本。`07` §7.4.3 的位置说法与 `16` 统一。lint (p) 改为逐格检查，新增 (P) 按角色列检查。G46(ak) 补安装器第 3 阶段一组。
- **R53-D11-03**：新增 `exec` 标准仅本机（方案 (b)：删去 web 的这一方向，而不是给分类器加“未确认”状态）。`11` §11.3.2 中“与合同 `exec` 标准命令相等”按展开后的每个简单命令逐个比较，不短路并集。致命三要素在任何合同修订后重算（唯一定义 `11` §11.8）：本机凑齐时显示与批准时相同的警告，远程凑齐时 `E_FORBIDDEN`。`env.tz` 仅本机。
- **R53-D11-04**：删去远程的“本 Goal / 本项目内同类”审批授权（远程审批只有“仅这一次”），因此审批授权不需要事件型失效，删除 ADR-179 写在合同上的 `AutonomyMatrix.grants[].expiresOn`；`Contract.autonomy.grants` 只含批准合同时写入的授权，不按事件失效。运行时 `Grant` 在 `02` §2.5 定义，存于该 `approve_action` 决定的 `payload.grant`（不新增表），每个 Run 开始时编入 `policy.json`。远程授权的统一有效期（`11` §11.9）只剩 S0 授权；启动恢复把未结束的 Run 判为结束时同样按 `run_end` 失效（`06` §6.1.6）。

**生命周期**
- **R53-D4-01**：修订标准把 `review{state, pin}` 改写为 `verify{pin}` 的同一事务写 `Goal.verifyFrom = state`，登记为 `16` §16.1.1 `verifyFrom` 的写入点；`03` `accepted` 行删去“验证通过后回 `in_review`”半句，验证后的去向一律按 I2 的验收延续判据。
- **R53-D4-02**：每次卫星重建成功（自动或人选）在同一事务记 `satellite.recovered{tree, checkpointN?, by}`；下一次任何 Run 开始时，自上一次 `run.started` 以来的每条各组装一段 `tower.satellite_rebuilt`，与 `tower.processes_terminated` 一样由 Tower 在组装开场时加入，不进入 `pendingOpenings`（唯一定义 `16` §16.1.12）。删去“自动重建以 `steer` 告知”（Run 已中止）与 ADR-178 的“`run` 时把决定追加到 `pendingOpenings`”。`goal.rebuild_satellite` 把 `settle` 与 `claim` 都改写为 `run`；守卫加 `satellite_rebuilding=1 → E_BUSY`（`running` 中丢失时自动重建期间同样置该标志）；`02`、`16` 的陈旧注释改正。
- **R53-D13-01**：交还写回集合唯一定义在 `10` §10.8.4 第 7 步：`B→T1` 的差异（`B = humanCheckout.rebuiltTree ?? T0`）∪ E（仅 `take_human`）；第 5 步短路条件为 `T1 == B`；`06` 的 ② 与崩溃续写引用它。`discard_human_edits` 加与 `hand_back` 相同的卫星守卫，并以接管以来最近一次重建所用的树为比较基准（检出已丢失时取 `satellite.recovered.tree`），Tower 自己的重建不算外部改动。

**Pi**
- **R53-D5-01**：在 v1.2.0 源码中逐条核实（引用见 `05` §5.11.1 D58）：已存 OAuth 凭据即视为已配置，预检通过；过期令牌在请求时刷新，失败以 `stopReason:"error"`、`errorMessage` “OAuth refresh failed for <provider>” 的 assistant 消息出现，不含 `/login`，Pi 不重试；预检中带 `/login` 的那一支实际走不到。F7 的检测键改为：运行期该错误文本，或预检的 “No API key found for <provider>”；F6 的根因合并排除这两类；C39 (a)(c) 按此重写（faux 没有 OAuth，(c) 用声明 `auth.oauth` 的测试 provider）。更正 ADR-179 的 D58/F7/C39 措辞。“需要已安装的 `pi` CLI”保留，并在 `05` §5.10 写明它是**设计选择**：SDK 有公开的 `ModelRuntime.login`，M1 不用它是因为它要求宿主实现 `AuthInteraction` 并新增 Host 与界面之间的双向登录通道，而 CLI 写入同一份凭据存储、Host 每次请求都重新读取；方案 (b) 在 M2 复审。

**显示与交互**
- **R53-D7-01**（并关闭 R52-D7-02 的残留）：计划步骤没有表示完成的事实字形；关联标准全部新鲜通过时只加事实徽章 `关联标准通过`；字形优先级 `◆` > `┆▸` > `┆✓` > `○`；X4 不一致改为中性的 `◇ 可能不一致`。唯一定义 `12` §12.5.1。
- **R53-D7-02**（并关闭 R52-D7-01 的残留）：`04` F4 第 3 步写明非 hunk 锚点止于 `┆ Agent 称已回应`、由人关闭；`Comment.anchor` 增加 `{type:"trace", runId, piEntryId}`（与 `EvidenceRef` 的 `trace` 同键）；`14` 的聊天回流比引用 `04` §4.20.1 的定义（`anchor.type ≠ goal`）。
- **R53-D8-01**（并关闭 R52-D15-01 的残留）：`needs_you.dismiss{itemId}` 不带原因；人按 `X` 关闭按 `08` §8.8 该 kind 的“关闭”一格定类，未单列的记 `false_positive`；`obsolete` 只由自动解决产生。
- **R53-D8-02**：远程 S0 卡片按阶段两种文案（验证阶段写“允许（直到本目标下一次运行开始）”）；“每个目标最多问一次”限定为本机批准，`11` §11.2 同步。
- **R53-D9-01**：看板人工标准画 `☐`，图例中 `▫` 不再含“人工待勾选”；评审队列改用 `◦` 已看 / `•` 已计入；`12` §12.6.2 登记 `▪▪`/`▪`、`◦`/`•`、时间线检查点 `│` 与徽章 `关联标准通过`；诊断时间线统一为 `│`。
- **R53-D12-01**：以 ADR-059 与 `14` §14.4 为准：导出 Markdown 属 M2，校准记分板的展示属 M3（M1 只记录）；决策卡的校准记录标 M3、用事实语法；M1 收件箱线框中的记忆提议标 M2。
- **R53-D14-01**：取方案 (a) 先剥除再判定：npmrc 行补剥除一步，G46(ak) 期望改为保留剥除后的 `@corp:registry`，与 Go 一组一致。
- **R53-D15-01**：`16` §16.1.14 补 `10` §10.18 的事件族、`audit.repo_lock_taken`、`claim.recorded`；`fact.recorded` 的定义位置改为 `02` §2.13、`06` §6.3，`run.ready` 归入 `engine` 行；表前写明定义处为 `06` §6.3 与各文档的事件表。`04` §4.14 改为引用两张封闭表；`07` 的 `OpeningRef` 补 `id`。另修正 lint (D) 查出的两处“Tower 数据目录下”（`10`、`16`，改为 `~/.tower/tmp/`）。

- **lint**：`reviews/lint/xref.py` 的 (p) 改为逐格检查；新增 (P)（§16.8 按角色列检查副本，可引用同一行的另一列）、(i)（各文档事件表与 `16` §16.1.14 的覆盖关系）、(D)（`16` §16.1.13 左列被取代的说法在正文中的残留）。全部检查：`--checks rstuvwxyzckdnSeRqpoPiD`。
- **排期**：+0.12 人周，按 WBS 行与主责线分配，系统线部分按 ADR-136 改派到桌面与安全线；`14` §14.3.4 与 ADR-133 第 53 轮补记一致，M1 维持 38 周。

---

## 第 53 轮评审结论中观察的收口（ADR-181）

## ADR-181 第 53 轮评审结论中观察的收口 — Accepted（R53 评审结论中的观察；Amends ADR-180；Amended by ADR-182、ADR-183）

- **倒计时文案**：`04` §4.8.2 `CountdownLabel` 一行与 §4.8.5 S0 卡片说明不再复述文案，改为引用 `08` §8.7.1 倒计时文案表的五种情形（唯一定义），样式见 `12` §12.12。
- **重新 seal 的 B 与 P**（`10` §10.6）：B 是本 Goal 最近一次 seal 写入的分支（首次为 `<prefix>/<goalId>-<slug>`，之后可能是某个 `B-v<k>`），P 是该次写入的 seal，都取自最近一条 `integration.performed`（新增 `branch` 字段，`10` §10.18、`16` §16.1.14）。首行改为“被撤销的 seal 曾写入 B”，按写入记录判定，不按 git 祖先关系；写入 `B-v<k>` 后它成为新的 B，之后的重新 seal 在其上快进或另开分支，不再每次新建分支。B 被用户删除时以 `baseCommit` 为父写入同名分支。
- **`integrationRevertedSeal` 从不清除**（`16` §16.1.1、`02` §2.4）：只有再一次 `goal.undo_integrate` 覆盖它。`integrated` 的唯一条件要求被合入的是最近一次验收的 seal，之后的 seal sha 不同，旧值不会阻止合入；重新 seal 首行按分支写入记录判定，旧值在写入 `B-v<k>` 后不再命中；`reverted` 标记只在 Goal 不处于 `integrated` 时显示。
- **手动重建在 `rename` 之后、提交之前崩溃**（`06` §6.1.6、`10` §10.16.2 E）：续做前把已存在的卫星工作目录与 gitdir 原样移入同一文件系统上的旁路目录，续做成功后删除，不把它当作已完成的重建。
- **失败后的重启**（`06` §6.1.6 卫星丢失行、`10` §10.16.2 E）：已带 `satellite_missing` 且 `satellite_rebuilding=0` 的 Goal（之前的自动或人选重建已失败）重启时不再自动重建；Needs-You 保持打开，由人再选。
- **改写清单补全**（`16` §16.1.1 `Goal.continuation`）：补 `request_changes`（`sentinel_high` 中 → `run`）与 `revert_external_change`（存活进程且目标为 `verify`/`review` → `verify_new`），与 `03` §3.2.1 一致。
- **`engine.*` 存储类型名**（唯一规则 `06` §6.3 说明）：Host 事件写入 EventLog 时 `type` = `engine.` + `EngineEvent.t`，`.` 改为 `_`（`engine.tool_start`、`engine.tool_end`、`engine.msg_end` 等）；已带前缀的 `engine.error`/`engine.exit` 原样存储。`02` §2.13、`16` §16.1.14 同步；正文中的 `tool.start`/`tool.end` 指线上事件名。
- **`HumanDecision.target`**：`16` §16.1.5 单列一行，键与 `02` §2.7 一致（含 `checkpointN`、`openingId`），lint (o) 比较 8 行。
- **密钥路径表**（`11` §11.3.1）：补 §16.8 视为可能含凭据的工具配置——`~/.gitconfig`、`~/.config/git/config`、`~/.cargo/config.toml`、`~/.config/uv/uv.toml`、`~/.config/pip/pip.conf`、`~/.pip/pip.conf`、`~/.yarnrc.yml`、Go env 文件（`go env GOENV`，macOS 默认 `~/Library/Application Support/go/env`），按 `secrets.access` 分类。
- **T25**（`11` §11.12）：读取残余补“未跟踪且未被忽略的文件”；G46(ap) 的期望同步为两类文件在真实检出中都可读。
- **链接检查器的目标地址**（唯一定义 `07` §7.4.9；`11` T34）：先解析后检查，拒绝回环、链路本地、私网、唯一本地、未指定与元数据地址；连接使用检查过的地址；不自动跟随重定向，逐跳检查；被拒绝的链接使该检查为 `skipped`（`address_refused`，按 `links_unchecked` 计入 V 并显示“有保留”）；规则不可由合同或 `VerifyProfile` 关闭。威胁表只写缺失的不变量与危害类别。
- **试运行的计数与措辞**（`04` §4.10.1、§4.10.2，`07` §7.4.1）：计数一律为 `通过数/用例数`（C4 改为 `失败 0/1`）；“base 上的一次观测”改为“base 上的一次试运行结果”，不与 `12` §12.5.1 的“观测”混用。
- **软矛盾示例**（`12` §12.5.4）：改为 X1 能产生的例子（自由文本中“修复 webhook.ts”，而本次运行的改动中没有该文件）。
- **G46**：(an) 的输入构造 `paused(verify_failed_limit)` 的 Goal 并在降级后执行不带 `note` 的 `goal.resume`；(al) 与 (ap) 一样标 M2。
- **Pi `createBranchedSession`**（`10` §10.8、`05` §5.8 表与 §5.11.1 D40）：v1.2.0 中它是实例方法，把调用它的实例切换到新文件，新文件头的 `cwd` 取该实例的 cwd（`session-manager.ts:1632-1748`）；`AgentSessionRuntime.fork` 会把整个运行时切到新会话（`agent-session-runtime.ts:262-350`）。“分叉为新 Goal”与 Best-of-N 改为对源文件另开专用实例 `SessionManager.open(源文件, 新会话目录, 新卫星)` 再调用，用完即弃；每个分叉文件的 `parentSession` 都指向源文件；返回路径在磁盘上不存在时按分叉失败处理。
- **排期**：W9 +0.02（链接检查器地址规则，Agent 线，计入 W9a，不在依赖链上），其余计 0；`14` §14.3.4 与 ADR-133 第 53 轮补正一致：WBS 122.16，Agent 余量 0.53，系统线余量 0.12 不变，M1 维持 38 周。

---

## 第 54 轮对抗评审（全范围）后的跨文档决策（ADR-182）

## ADR-182 交还不短路、重建不做 base 树 safety 检查点、运行时授权与 S0 授权的定义、OAuth 重试时序与若干复述收口 — Accepted（R54 全部条目与评审结论中的观察；Amends ADR-180/181；Amended by ADR-183、ADR-184、ADR-227）

选择原则同 ADR-180：评审给出选项时取更安全、更简单的一个；删除机制与增加机制都能关闭问题时取删除。安全问题只写到设计层面。

**隔离与可靠性**
- **R54-D13-01（重要）**：交还第 5 步**不短路**：T1 == B 只表示人没有改动（写回集合中 B→T1 的部分为空），第 6 步以“卫星当前树 ≠ B”照常判定并处置外部写入；`take_external` 任何情况下都不写第 8 步的 `human_edit` 检查点。唯一定义 `10` §10.8.4 第 5、6、8 步；`06` §6.4.3 `goal.hand_back` 只引用。G46(ar)。
- **R54-D13-02**：卫星重建（情形 E 的自动重建与 `goal.rebuild_satellite`）执行 `restoreCheckpoint` 第 1–6 步，**跳过第 0 步**（不对刚检出 base 的卫星做 safety 检查点、不写 `abandoned`）；成功后以 `landmark:"safety"` 记录重建树的检查点（与链上最新检查点同树时按去重不建），使归因基线、交还第 8 步与崩溃续做都以重建树为准。唯一定义 `10` §10.16.2 情形 E；`10` §10.8.1 第 0 步与 `06` §6.1.6、§6.4.3 引用。G46(as)。
- **R54-D6-01**：§6.1.6 的“卫星重建中途崩溃”行改为覆盖自动与人选两种：`satellite_rebuilding=1` 时先把已 `rename` 到位的卫星移入旁路目录，人选的按 `checkpointN` 续做，其余从最新的检查点或 pin 续做；`running` 中丢失时 `satellite_missing`、继续目标与 `satellite_rebuilding=1` 同一事务写入。唯一定义 `06` §6.1.6；`10` §10.16.2 同步。
- **R54-D13-03**（并关闭 ADR-181 观察 2 的“部分”）：`06` §6.4.3 `goal.accept` 与 §6.1.6 `awaiting_remote` 行不再复述，分别引用 `10` §10.6 重新 seal 表与 `10` §10.12 `integrated` 唯一条件；`10` §10.6 区分原始分支名 B₀（只用于命名）与当前分支 B（只用于快进），新分支一律为 `B₀-v<k>`（k 取第一个既不在用户仓库中、也未被本 Goal 写入过的编号）；本地观测针对本 Goal 写入过的全部分支。G40(f)。

**安全与自主度**
- **R54-D11-01**：判别原则比较**编译后的合同**与上一版；合同的每个新版本都执行一次计划编译；人在任何修订中编辑 `scope.include` 时同一修订置 `includeOrigin = explicit`（web 缩小 `include` 的唯一联动）。`testPathOverrides.add/remove` 改为仅本机（两个方向都可能改变动作类）；分类器中范围外的测试路径同时归 `edit.tests` 与 `edit.out_of_scope`，取最严格者。唯一定义：`16` §16.5 判别原则与封闭表、`02` §2.5 编译注释、`11` §11.3.1。
- **R54-D11-02**：S0 授权由 `Goal.s0Grant` 表示，不是运行时 `Grant`、不经 `applyGrants`；失效条件唯一定义在 `11` §11.2——(i) `contract.amend` 生效（同一事务，`06` §6.4.3 写入点）、(ii) 检查点的变更路径命中 `scope.protected`（与 §11.4 事后检测同一次计算、同一事务）、(iii) 远程批准时的统一有效期，取先到者；失效前不再询问。`16` §16.1.10、§16.5 与 `05` §5.6.5 的 gate（`policy.s0Granted`）同步。G46(at)。
- **R54-D11-03**：`applyGrants` 唯一定义在 `11` §11.3.5：授权只能把 `ask` 降到 `notify`，**不越过 `forbid`**、硬底线与单向门下限；编入 `policy.json` 时排除已过期、被 `autonomy.revoke` 或自适应降级覆盖、以及本 Goal 合同收紧过该类的授权。撤销：`autonomy.revoke{projectId, class, level?}` 省略 `level` 即撤销该项目该类此前的全部运行时授权（不新增命令与决定种类）。单向门“不能形成授权”（`11` §11.5、`09` §9.9 改正）。`02` §2.7 `HumanDecision` 补 `grant?: Grant`。G46(at)。

**Pi 集成**
- **R54-D5-01**：v1.2.0 核实（引用见 `05` §5.11.1 D58）：`ModelsError` 把原因文本拼进 `message`，可重试判定是不加锚点的正则，原因含 `fetch failed`、`timeout` 等时 Pi 按 `maxRetries: 3` 重试；SDK 宿主中压缩与摘要路径的刷新失败经 `retryAssistantCall` 重试后以 `compaction_end{errorMessage}` 出现。更正 ADR-180 的“Pi 不重试”。F7 只在 `agent.end{willRetry:false}` 的最终错误与 `compaction.end` 的错误上判定，F6 对带刷新前缀的 `retry.*` 不开始根因合并；C39 补 (d)。

**注意力、诚实与显示**
- **R54-D8-01**：阻塞类条目（对话框仍在等待的 `question`/`approval`，含 S0 授权；或对应其 Goal 当前暂停原因的条目）不提供 `X`，`needs_you.dismiss` 返回 `E_STATE`，只能作答、拒绝或稍后。唯一定义 `08` §8.8；`06` §6.4.3、`04` §4.8、`16` §16.3、§16.5 引用。
- **R54-D7-01**：允许范围外的重定向目标（`redirect_outside_network`）与第 4 跳仍为重定向（`too_many_redirects`）都按“被拒绝”计：检查为 `skipped`，按 `links_unchecked` 计入 V、显示“有保留”。唯一定义 `07` §7.4.9；`11` T34 同步。G46(av)。
- **R54-D9-01**（并关闭 R53-D9-01 的“部分”）：评审队列 `◦` → `•`（`04` §4.4.4、`12` §12.10.5）；S0 授权状态用人的印章语法、不带 `✓`，超时默认拒绝写 `⚙ 超时默认`；L4 的 `■` 只用于异常与阻断哨兵，单向门审批另加文字标记 `单向门`（`12` §12.6.2 登记）；S0 卡片的“只问一次”改为“失效前不再问”。lint 新增 (g)。
- **R54-D12-01**（并关闭 R53-D12-01 的“部分”）：手机决策卡不显示校准记录；`09` §9.7 的超时学习一律需批准（经 `contract.amend`），不自动写入任何字段。
- **R54-D15-01**（并关闭 R53-D13-01 的“部分”）：`07` §7.10.3、`04` §4.6.7 改为引用 `06` §6.4.3 `goal.discard_human_edits`；放弃改动记入 `external_change` 的基线取比较基准的检查点（重建过时为记录重建树的检查点）；`02` §2.4 `verifyFrom` 注释补写入点并以 `16` §16.1.1 为准；`16` §16.1.1 准备阶段 ①②③ 中 `take_over` 一律 `E_BUSY`；安装器第 2 阶段只运行 Tower 内置预取器、只连已登记的下载域名，第 3 阶段断网（`11` §11.7.0、`16` §16.8 规则 5 括注）。

**评审结论中的观察（R54 结论部分）**
- 倒计时表补 `use_defaults` 下检测器 escalate 的 `stalled`（“30 分钟后 → 暂停”），§8.8 `stalled` 行补 `timeout`，`verify_failed` 行删去没有计时的 `timeout`（`08` §8.7.1、§8.8；`04`、`12` 改为“六种情形”）。
- `reverted` 标记只在撤销之后本 Goal 尚未写入新 seal 时显示，字形为文字徽章 `已撤销合入`（`16` §16.1.1、`12` §12.6.2）；合入观测按变化触发，每个 seal 只判定一次（`10` §10.12），连续撤销后更早的 seal 不会使 `accepted` 降回 `in_review`。
- `prepareTimeoutSec` 一行注明为何不属判别原则所指的放宽（`16` §16.5）。
- 规则 5：gitconfig、Rust、uv、pip 各行写明“规则 5”，gitconfig 补“先剥除 userinfo”一步；§16.8.3 的 uv/Poetry 草案改为由 I-install 生成 `.venv`、V 只运行；lint (p)/(P) 只接受“规则 5”的引用。
- “分叉为新 Goal”与 Best-of-N 要求源 Goal 没有活跃 Run（`06` §6.4.3 `run.fork_goal` 守卫 `E_BUSY`）：v1.2.0 `SessionManager.open` 读入时可能修补源文件（`session-manager.ts:661-669`、`:1029-1046`）。
- `16` §16.1.1 `discard_human_edits` 的去向改为由 `onAllReasonsCleared()` 决定；`04` §4.4.1 卡片上的问题标题不加 `┆`（与 `12` §12.6.4 一致）；`04` 图例 `■` 与 `12` §12.6.2 一致；`04` 注明 M1 线框中的 G-0145 是调研类、只作示意；`09` 的过期复审在 M1 只在记忆管理器中标出，批次投递属 M2，保留表改为引用 `07` §7.4.1 重放包规格；`04` §4.10.2 定义试运行无结论（`vacuous`/`timeout`/`unparseable`/环境错误）的显示，不算红灯。

- **lint**：(p)/(P) 只接受“规则 5”的引用；新增 (g)（`04`/`12` 中 `✓` 与队列、授权，`■` 与审批的配对）；`16` §16.1.13 补登第 54 轮被取代的说法供 (D) 检索。全部检查：`--checks rstuvwxyzckdnSeRqpoPiDg`。
- **排期**：+0.19 人周，按 WBS 行与主责线分配，系统线部分按 ADR-136 改派到桌面与安全线；`14` §14.3.4 与 ADR-133 第 54 轮补记一致：WBS 122.35，余量 系统 0.12、Agent 0.47、桌面 0.53、设计 1.00、安全 0.34，M1 维持 38 周。

## 第 55 轮对抗评审（全范围）后的跨文档决策（ADR-183）

## ADR-183 正式验证总是运行哨兵与测试清单、交还写回与归因只认写回集合、合入按状态判定、开场与影子的单一时序与写者，并把低频机制推迟到 M2/M3 — Accepted（R55 全部条目与评审结论中的观察；Amends ADR-176/178/180/181/182；Amended by ADR-184、ADR-185、ADR-186、ADR-219）

选择原则同 ADR-180，并加一条收敛规则：一个机制不属于 M1 主循环（Goal → 合同 → Agent 运行 → 验证 → 评审 → 验收/集成）、且文中已有更简单的 M1 路径时，优先**推迟或删除**它以关闭整类问题，而不是再补规则；任何安全不变式与 M1 主循环需要的机制都不推迟。安全问题只写到设计层面。

**验证与诚实**
- **R55-D7-01（重要）**：正式验证（一切非 `opportunistic` 的触发）在任何提前返回之前启动 L-c 静态哨兵（纯 base..pin 的 diff 分析，不需要槽位），`decide()` 等它写完；有可运行的 exec 标准时**总是**运行测试清单（R-T5）——exec 标准全部命中缓存时仍取槽位、只跑清单；缓存只复用标准结果，哨兵与清单从不复用。缓存命中的决定性验证同样写保留 ref 与本次重放包，`manifest.json` 列出被复用的 `criterion_check`。删除 Wq > 15 min 时测试清单的降级一档。唯一定义 `07` §7.4.1 `verify()`；§7.2.4、§7.4.8、§7.4.10、§7.5.4 引用。G46(aw)。
- **R55-D7-02**：`links_reachable` 与链接检查器**推迟到 M2**（调研与文档类 Goal 不在 M1，ADR-059；M1 的合同编辑器在批准时拒绝该检查）。M2 的规则一次写定：调用点传入 `trigger`，每次正式验证都执行，只有机会式为 `deferred`；`isVerifiedPass` 按 `criterion_check.data` 判定，`links_deferred` 一律不计入；`links_unchecked` 计入 V 但属 `anyQualified`——未检查的链接永远不是无保留的通过；逐链接判据表（2xx 可达，4xx/5xx、单条 5 s 超时、连接被拒或无解析为不可达，`host_not_in_network` 与 `over_limit` 与原三种同为“被拒绝”，整体离线为 `skipped{offline}`）。唯一定义 `07` §7.4.9；`11` T34 同步。
- **R55-D7-03**：`repeat`：同一槽位连续运行 N 次，全部 `pass` 才是 `pass`，首个非 `pass` 即停；N 次内不适用失败重跑、既有 flaky 宽限与 ADR-054 的“重跑通过”；次数记 `criterion_check.repeat`；`repeat`、`timeoutSec` 进入 `criterionSpecHash` 与过期规则 ①（唯一定义 `07` §7.4.5）。`anyQualified` 的十项条件只在 `07` §7.10.3 枚举（含 Node 版本不同、`runner_patched`、计时 flake、覆盖的哨兵、LFS、验收延续），`12` §12.5.2 只引用并一一对应徽章。
- **R55-D12-01**：关闭 reporter 注入的学习规则改为**需批准**；单次验证内的“无注入重跑”照常，计数改按正则兜底，已识别的 runner 仍得不到计数时判 `unparseable`——零分母保护不因关闭注入失效（唯一定义 `07` §7.4.5 `verdictOf`；`09` §9.7 引用）。

**隔离、git 与并发**
- **R55-D13-01（重要，并关闭 R54-D13-02 的“部分”）**：两项都做——(1) **推迟**“从更早的检查点重建卫星”到 M2：M1 的 `goal.rebuild_satellite{goalId}` 只是人发起的重试，从最新的检查点或 pin 重建，步骤、崩溃续做与继续目标处理都与自动重建相同（删去 ADR-178/180 的 `settle`/`claim` → `run` 改写与按 `checkpointN` 续做）；接管期间 `external_change` 的 keep/revert 返回 `E_STATE`，因此接管期间链上最新的检查点就是接管时的检查点，B = T0。(2) 规则本身也改正：`keep_both` 的不相交判定用第 7 步的**写回集合**（B→T1）；`human_edit` 检查点**归为人的路径** = 写回集合中 B→T1 ∪ resolvePinHits ∪ 勾选删除的 `.git` 等价条目，take_human 恢复的 E 沿用 B 中的作者，keep_both 的 E 记 `externalPaths`。唯一定义 `10` §10.8.4 第 6–8 步与 §10.16.2 情形 E；`06` §6.1.6、§6.4.3，`03` §3.2.1，`02` §2.7，`16` 引用。G46(aq)(ax)。
- **R55-D13-02**：取代 ADR-182 的“每个 seal 只判定一次”：`integrated` 按**状态**判定——每次 base 前进的 fetch，以及 Goal 进入 `accepted`（任何来源）时，最近一次验收的 seal 已在 base 中且四项成立即进入 `integrated`，临时条件下观测到的合入不会让 Goal 停在 `accepted`；“较旧版本”的处理（`accepted` 降回 `in_review`）按变化、每个 seal 只一次。“卫星树”= 卫星当前树中除 `externalChange.paths` 之外的路径。唯一定义 `10` §10.12；`03` §3.2、§3.2.1，`04` §4.16，G36c(g)、G40(f) 同步。G46(ay)。
- **R55-D13-03**：重建成功的同一事务中，`externalChange.paths` 里在重建树中与基线检查点内容相同的路径移出；为空则 `resolved{how:"obsolete"}` 并解除 `external_change`，开场与 Goal 页注明“外部改动随工作目录丢失”；drain 检查点保存了外部内容的照常保留（唯一定义 `10` §10.16.2 情形 E；`16` §16.1.12 同步）。
- **R55-D13-04**：交还第 7 步写回之前，卫星相对 B 有不在 E 中的变化（接管期间只可能来自存活进程）时先记 `author:"agent"`、`agent_bg_done` 检查点，第 8 步的 `human_edit` 检查点因此不收入这些写入（`10` §10.8.4 第 7 步）。G46(ax)。
- **R55-D6-02**：影子（索引、对象、`refs/tower/<goalId>/*`）的**唯一写者**是 Supervisor 的 GitService，持该卫星的 `wtLock` 串行执行、锁内分配编号；tower-goal 扩展不在 Host 中执行 `captureCheckpoint`，只经 Host 通道发出带 `piEntryId` 的请求（与同步询问同一信封）并在收到结果后 `appendEntry`。settle 时最多等 5 s，超时照常继续：请求已排在 Supervisor 队列中、先于 `agent_bg_done` 与 pin 执行；映射以 `checkpoint.created` 的 `piEntryId` 为准。唯一定义 `10` §10.7.2；`05` §5.6.1、§5.6.5，`06` §6.2 引用。
- **R55-D6-01**：开场队列只有一个时序规则：准备第 ③ 步只读队列、组装开场，不消费；消费点只有 `run.started`（收到 `agent.start` 之后）的同一事务；③ 中 `goal.openings.withdraw` 返回 `E_BUSY`；③ 失败、超时或崩溃后重新组装前按 `details.key` 检查会话 JSONL，已写入的 id 在同一事务中视为已消费。唯一定义 `06` §6.4.3“暂停出口的统一写法”；`05` §5.2.1、`07` §7.10.3、`16` §16.1.1 引用。G46(az)。

**领域模型与合同**
- **R55-D4-01**：没有计划时计划编译是空操作；规则 (1) 只在计划非空且至少一个步骤有 `touches` 时执行，只并入有 `touches` 的步骤，没有 `touches` 的步骤在合同编辑器中提示；规则 (2) 生成的停止条件 id 为 `plan:<stepId>`，每版本整体重算（替换、不追加），只由编译产生，远程规则按 `plan` 行判定（标题措辞随之变化按措辞处理）。唯一定义 `02` §2.5；`16` §16.1.3、§16.5，`04` §4.10 同步。G46(ba)。

**注意力与交互**
- **R55-D8-01（并关闭 R54-D8-01 的“部分”）**：阻塞类条目的定义并入 `drainingFor.reasons`（drain 中已生成的 `budget`、`external_change` 条目同样不能关闭），映射给出子类型时按 kind 与子类型判定（观察 8）；删去 `budget` 的“直接关闭”一格。`post_settle_activity` 分为第 1 次（知悉）与暂停中（继续 / 重新确认后提交 / 放弃，没有知悉）两行。`use_defaults` 下停滞超时的默认暂停登记为新暂停原因 **`stalled_timeout`**（`02` §2.4、`06` CHECK、`16` §16.1.1 集合、优先级与交还、§16.1.7 映射、`03` §3.2.1 出口、`12` §12.6.5 文案 `⚙ 超时默认`）：条目保持打开、只记 `timedOutAt`，不定类直到处置（同 `question_timeout`）。唯一定义 `08` §8.7.1、§8.8。G46(az)。
- **R55-D8-02**：`S` 改称**延后**（与收件箱的“稍后”分区区分）：选项 15 min · 1 h（默认）· 4 h · 明天 09:00，阻塞类条目只给 15 min 与 1 h；延后的条目留在主列表标“已延后至 hh:mm”，到期后照常路由（`16` §16.2.4 唯一登记；`06` `needs_you.snooze` 校验 `until`）。单向门审批的批准不响应 `⌘↩`，`DecisionCard` 增加“单向门确认”状态（按住 1.5 s 或输入目标名），`单向门` 标记按 `isOneWayDoor` 显示、不论投递级别（`12` §12.6.2、§12.12，`16` §16.3）。
- **R55-D9-01**：机密文件分类与记忆提议的来源不可信改用文字徽章 `机密`、`来源不可信` · `可疑指令`（`12` §12.6.2 登记），`■` 只在登记的用途中出现；lint (g) 扩展到 `■` 与“机密 / 来源不可信 / 可疑指令 / 文件名”的配对。

**安全与自主度**
- **R55-D11-01**：文件类分类器收集**全部**适用的类（`edit.protected`、`edit.tests`、`edit.out_of_scope`），`decide` 取最严格者；`07` §7.5.5 的“protected 中的路径一律视作 forbid”改为引用 `11`（唯一定义 `11` §11.3.1、§11.3.5）。`allowTestEdits:"allow"` 映射为 `notify`（观察 6）。
- **R55-D11-02（并关闭 R54-D11-03 的“部分”）**：**项目级运行时授权（“本项目内同类”，30 天）推迟到 M3**，与提供列出与撤销的“已获得的自主度”面板一同上线；M1 只有“本 Goal 内同类”，目标页右栏自主度区块列出并可撤销（`autonomy.revoke` 省略 `level`）。排除 (c) 按事件序号只排除收紧**之前**产生的授权；一次审批命中多个处于 `ask` 的类时只提供“仅这一次”。唯一定义 `11` §11.2、§11.3.5；`02` §2.5、§2.7，`04` §4.5、§4.15，`06` §6.4.3，`16` §16.1.10、§16.2.8、§16.5 同步。G46(at)。

**记忆、Pi 集成与一致性**
- **R55-D12-02**：网络学习的建议目标改为 `VerifyProfile.env.network`（仅本机）或 mock；同步墓碑带支配性的版本向量与 HMAC，合并算法中墓碑优先，清除界面说明同步仓库历史中的副本（`09` §9.12.3，M2–M3）。
- **R55-D5-01（M2）**：RPC 下 `handled` 不等于成功：命令响应之前收到 `extensionPath = "command:tower-*"` 的 `extension_error` 即失败；注入以带该 `details.key` 的消息（或 `agent.start`）为送达确认，导航与分叉以叶子或 `sessionFile` 的变化为完成确认；C35(g) 补 handler 抛错（`05` D55、C38、§5.4.4、§5.6.5）。v1.2.0 `agent-session.ts:2141-2164`、`:3413-3420` 核实。
- **R55-D14-01**：G46 中 `serve` 的远程部分（(m) 的远程尝试、(z)、(an)、(ao) 的 web/手机各项）与 (av) 标为 M2，SP6b 行列为 M2 例外；`Tower-Human-Edit` 的写入条件统一为“base..pin 中有作者为 human 的 hunk”（唯一定义 `10` §10.6；`07` §7.10.3、`10` §10.3.1 引用），G46(ar) 的期望改为“`human_edit` 检查点中归为人的路径为空”。
- **R55-D15-01（并关闭 R54-D15-01 的“部分”）**：`06` `goal.hand_back` 改为“`take_external` 不写回、不写 `human_edit` 检查点，删除检出、清除 `human_checkout` 与 `takeover_from`、写决定照常”；`07` §7.10.3 的 `verifyFrom` 写入点改为引用 `16` §16.1.1；`10` §10.8.4 的 `E_BUSY` 改为引用 `16` `ready` 行；`07` §7.4.3 删去“离线、执行项目脚本”括注。旧说法登记于 `16` §16.1.13。

**评审结论中的观察（R55 结论部分）**
- 观察 1：`14` SP6b 行的现值改为 5.01 人周（Agent 1.01），本轮补组与移到 M2 的各组相抵，仍为 5.01。
- 观察 2：`06` F 表 `settings-defaults.ts:20` → `:19`；`05` D9 补 `cli/args.ts:96`（`--mode`）。
- 观察 3：`05` §5.11.1 新增 **D59**（`AgentSession.prompt` 返回 `Promise<void>`、处置只经 `preflightResult` 回调，`agent-session.ts:323-324, 2053-2135`）；SDK 适配器以回调 resolve、以回调之前的 rejection 识别预检失败、不等待 run 结束；C1 补一组。
- 观察 4：对账游标条目在 JSONL 中不存在时从文件开头重扫、按幂等键去重（`06` §6.6.5，v1.2.0 `rpc-mode.ts:640-643`）；`summarization_retry_finished` 无字段，`retry.end{success}` 由随后的 `compaction_end` 推出（`05` §5.2.2）。
- 观察 5：S0 授权失效 (ii) 的粒度是检查点，同一回合内受保护改动之后的测试运行仍用旧授权，登记为已知窗口（受保护改动本身至少 `ask`），不另设门禁时的失效点（`11` §11.2）。
- 观察 6：G46(at)(2) 写明 `ci.yml` 的改动经本机 `ask` 批准；`11` §11.2 注明 `allow` 映射为 `notify`。
- 观察 7：M3 的项目级自主度级别与合同级别在 `decide` 中取较严者（`11` §11.5）。
- 观察 8：阻塞类判定按 kind 与子类型（见 R55-D8-01）。

**推迟到 M2 / M3 与删除**
- **从更早的检查点重建卫星**（`goal.rebuild_satellite{checkpointN}`，ADR-176；及 ADR-178/180 的 `settle`/`claim` → `run` 改写、按 `checkpointN` 续做）→ **M2**。理由：它是接管期间重建后归因与写回问题（R54-D13-02、R55-D13-01）的唯一来源；M1 有自动重建、人发起的重试与放弃这条更简单的路径。`HumanDecision.target.checkpointN` 在 M1 中不写。
- **项目级运行时授权**（“本项目内同类”，30 天，ADR-180/182 的编入与撤销）→ **M3**，与“已获得的自主度”面板同时上线。理由：M1 没有列出与撤销它们的界面（R54-D11-03），而 Goal 级授权已能消除同一 Goal 内的重复审批。
- **`links_reachable` 与链接检查器**（ADR-181/182 的地址与重定向规则）→ **M2**。理由：只服务于调研与文档类 Goal（ADR-059 不在 M1）；规则已按 R55-D7-02 写定，作为 M2 的起点。
- **删除**：Wq > 15 min 时测试清单只在 diff 触及 TestPathSet 时运行的降级档（与 R55-D7-01 的“正式验证总是运行测试清单”冲突）；ADR-182 的“每个 seal 只判定一次”（改为按状态判定，“较旧版本”的处理仍每个 seal 一次）；关闭 reporter 注入的自动学习（改为需批准）；`S` 的“稍后”名称（改为“延后”）。

- **lint**：(d) 的 DELETED 增加三项（从更早的检查点重建、项目级运行时授权、M1 中的“外部链接检查只在 claimed”），旁边须有 M2/M3 标记（DEL_OK 接受 `M3`）；(g) 的 `■` 配对扩展到机密、来源不可信、可疑指令与文件名；`16` §16.1.13 补登第 55 轮被取代的说法（含评审建议的“准备阶段的 Host 握手与开场组装中返回”“阶段 2、3（离线、执行项目脚本）”“这两处尚未列入”）供 (D) 检索。评审建议的 (u′) 未实现：`07` §7.10.3 已改为引用 `16`，没有可比对的复述。全部检查：`--checks rstuvwxyzckdnSeRqpoPiDg`。
- **排期**：+0.10 人周（推迟的机制计 −0.14），按 WBS 行与主责线分配，系统线部分按 ADR-136 改派到桌面线；`14` §14.3.4 与 ADR-133 第 55 轮补记一致：WBS 122.45，余量 系统 0.12、Agent 0.42、桌面 0.53、设计 0.95、安全 0.32，M1 维持 38 周。

## 第 56 轮对抗评审（全范围）后的跨文档决策（ADR-184）

## ADR-184 停滞超时的继续与条目关闭、开场只消费组装过的条目、验收闸引用 `anyQualified`、Goal 级撤销、归为人的路径与不可用检查点的载体、删空计划 — Accepted（R56 全部条目与评审结论中的观察；Amends ADR-182/183；Amended by ADR-185、ADR-186）

选择原则同 ADR-183：每条以一个字段、一条守卫或一处引用关闭，不新增机制；不属于 M1 主循环的分支取更简单的出口（接管期间无法重建时保留人工编辑检出、不提供交还）；安全不变式全部保持。安全问题只写到设计层面。

**条目（R56 追问清单）**
- **R56-D8-01（并关闭 R55-D8-01 的“部分”）**：`goal.resume` 的可解除列表加入 `stalled_timeout`（无条件，不改写继续目标）；解除 `stalled_timeout` 的同一事务关闭该 `stalled` 条目——`resume`、回退或交还 → `actionable`，`abandon` → `informative`；“10 min 内出现进展 → `false_positive`”只适用于 Run 中、未超时的“继续”。唯一定义 `08` §8.8 `stalled` 行；`06` §6.4.3 `goal.resume`、`03` §3.2.1 引用。lint (k) 扩展为 (k′)。G46(bb)(1)。
- **R56-D6-01**：取“留给下一个 Run”：`run.started` 只消费组装进本次开场的 `OpeningRef.id`（事件 `run.started{openingIds}`），准备第 ③ 步开始之后追加的条目留在队列、仍可撤回、在下一个 Run 的开场送达；界面照常把它列在“下次运行开场”中，不显示为已发送。唯一定义 `06` §6.4.3“暂停出口的统一写法”；`06` DDL `pending_openings` 注释、`needs_you.answer`，`02` §2.4、`03` §3.2.1、`04` §4.8.13、`05` §5.2.1、`07` §7.10.3、`16` §16.1.1、§16.1.14 引用。G46(bb)(2)。
- **R56-D7-01**：`04` §4.6 的“需要确认”改为引用 `07` §7.10.3 `anyQualified`（任一条件成立即需一句书面确认，面板逐条列出成立的条件与未执行的标准），另加未批准的假设或决定（`Claim.ratification = "pending"`，不属 `anyQualified`）；条件只在 `07` 枚举。lint 新增 (r‴)。G46(bb)(6)。
- **R56-D11-01（并关闭 R55-D11-02 的“部分”）**：`11` §11.3.4 无注解扩展工具改为“本 Goal 内同类”（匹配器 = 工具名），项目作用域属 M3（(d) 的 DELETED 补“本项目内此工具”）。撤销作用范围只在 `11` §11.3.5 排除 (b) 定义：M1 的 `autonomy.revoke{projectId, class, goalId}`（省略 `level`）只排除该 Goal 中该类在撤销之前产生的运行时 `Grant`，不影响合同 `autonomy.grants` 与其他 Goal；省略 `goalId` 的项目范围撤销、带 `level` 的撤销与自适应降级（M3）排除本项目该类的全部授权（含合同授权）。`06` §6.4.3、`04` §4.5.2（按类撤销，按钮写明范围）、`02` §2.5、`11` §11.2、§11.5、`16` §16.5 同步。G46(at)、(bb)(7)。
- **R56-D13-01**：`Checkpoint.humanPaths?: string[]`（`06` `checkpoints.human_paths`）只在交还第 8 步的 `human_edit` 检查点上写“归为人的路径”；作者推导中该检查点只对其中的路径取 `author`，其余路径（take_human 恢复的 E）穿透到接管时的检查点（B = T0），因此 Agent 的代码不会被记为人的改动，`Tower-Human-Edit` 不因此写入。归因窗口仍按检查点的 `author` 计入（交还是人的显式决定，偏保守）。唯一定义 `10` §10.7.1、§10.8.4 第 8 步；`16` §16.1.8、§16.1.12 引用。G46(bb)(3)。
- **R56-D13-02**：`Checkpoint.unusable`（`06` `checkpoints.unusable`）由情形 G 写入；重建来源 = 链上 `unusable` 为假的最新检查点，没有检查点时 pin，都不可用时 base——固定回退，不是选择检查点（人选的检查点仍属 M2），回退时 Goal 页与下一次开场写明“检查点 n 之后的改动无法恢复”，继续目标照常由守卫处理。**接管期间不回退**（B = T0 恒成立）：接管时的检查点不可用则重建失败，交还与放弃改动照旧返回 `E_STATE`，出口是放弃 Goal——人工编辑检出原样保留在原路径、确认框给出路径，不提供“先交还”。唯一定义 `10` §10.16.2 情形 E、§10.8.4；`06` §6.4.3 `goal.abandon`、`04` §4.18.3、`16` §16.1.12 引用。G46(bb)(4)。
- **R56-D4-01**：取代 ADR-183 的“没有计划时编译是空操作”：规则 (1) 不执行，规则 (2) 照常整体重算——删空计划即删除全部 `plan:*`；计划为空或不再有 `touches` 而 `includeOrigin = compiled` 时，`include` 保留上一版的值、同一修订置为 `explicit`（只发生在本机修订中），编辑器提示。唯一定义 `02` §2.5；`04` §4.10.2、`16` §16.1.3、§16.5 同步。G46(bb)(5)。
- **R56-D14-01**：以阻断结束的验证不是决定性的、不写保留 ref；人 `override_sentinel` 使 Goal 不经重新验证进入 `in_review` 时，该 pin 上最近一次以阻断结束的验证在覆盖的同一事务中升为决定性并写保留 ref（被覆盖的阻断命中总有可重放的证据）。唯一定义 `07` §7.4.1 保留表；`06` §6.4.3 `sentinel.override`、§6.6.4 引用。G46(aw) 改为暂停时不写、覆盖后写。

**评审结论中的观察（R56 结论部分）**
- 观察 1：缓存命中新写的 `criterion_check` 的 `data.trigger` 与 `atCommit` 取本次验证的值（`07` §7.4.8；`verify()` 增 `recordHits`）。
- 观察 2：`todo` 为空的正式验证不启动服务；`envError` 的两处返回先等哨兵；`13` §13.11.1 补静态哨兵一行（槽位之外、不运行项目代码）。
- 观察 3：`05` D59 登记延迟分支（v1.2.0 `agent-session.ts:2054-2057` 推迟并立即 resolve、不回调；`:1081-1093` 扩展 handler 与公开事件期间置标志，延迟动作在 finally 之后以同一 `options` 重调；`:1875` 抛错进入上一个 run 的 settle；`sendCustomMessage` 同样，`:2340-2342`）；SDK 适配器只在公开 `agent.settled` 的监听器返回之后调用 `prompt`/`triggerTurn`；C1 补一组。
- 观察 4：`05` §5.6.5 的“只读 JSONL 就能重建映射”加限定；`05`、`10` §10.7.2 改为只有**已发出**的请求在 Supervisor 队列中（`cpQueue` 中未发出的请求的改动都在随后 `agent_bg_done` 检查点的树中）；行号 `agent-session.ts:1085-1086` 更正为 `:1084-1085`；5 s 登记为 `16` §16.2.6 `checkpoint.settleWaitSec`。
- 观察 5：take_human 时第 6 步的 safety 检查点与第 7 步同树，按去重只建一个，landmarks 为 `[safety, agent_bg_done]`，附注记与 `externalPaths = E`（`10` §10.8.4 第 7 步）。
- 观察 6：人的 note 以 user 角色发送、没有 `details.key`，③ 崩溃窗口内可能重复一次，登记为已知窗口（`06` §6.4.3；G46(az)）。
- 观察 7：`06`、`08` 的“只能作答、拒绝或稍后”改为“延后”；`03` §3.6 `docs` 类改为内置 artifact 检查、链接检查属 M2；`16` §16.5 项目级授权标 M3；`16` `satellite.recovered` 注明 M1 只取可用的最新检查点。
- 观察 8：`12` §12.6.2 `■` 改为“只用于异常与阻断类”，列出验收阻止项、`■ 未送达`、未写出的路径、沙箱被覆盖徽章。
- 观察 9：`anyQualified` 增 ⑪：exec 标准的计数来自正则兜底（`source="regex-summary"`）；`12` §12.5.2 增徽章 `计数为估计`（`07` §7.4.5、§7.10.3）。
- 观察 10：`16` §16.3 增“单向门确认的目标名”表（按动作类；名字由 Harness 从解析结果生成，解析不出时只提供按住）。
- 观察 11：`05` §5.2.2 `summarization_retry_*` 按最近一次 `attempt_start` 的 `source` 区分，`branchSummary` 的 `retry.end` 由 `navigateTree` 的结果推出（v1.2.0 `:230-236`、`:4095-4100`）；`/tower-nav`（M2）导航目标已是当前叶子时不发命令（`navigateTree` 对此直接返回，`:4002-4007`）；`repeat > 1` 时首个超时即停、ADR-054 的判别只针对这一次（`07` §7.4.5）；M2 `secretPhaseOnly` 草图改用 `done()`（`07` §7.4.11.4）。

- **lint**：(k′)：`03` §3.2.1 出口列含 `resume` 的原因必须在 `06` `goal.resume` 的可解除列表中；(d) 的 DELETED 补“本项目内此工具”；`16` §16.1.13 补登第 56 轮被取代的说法（含“只能作答、拒绝或稍后”）供 (D) 检索；新增 (r‴)：单方“只引用本条/本节”的声明，被声称引用方不得另有同主题的枚举。全部检查：`--checks rstuvwxyzckdnSeRqpoPiDgKY`。
- **排期**：+0.09 人周，按 WBS 行与主责线分配，系统线部分按 ADR-136 改派到桌面线；`14` §14.3.4 与 ADR-133 第 56 轮补记一致：WBS 122.54，余量 系统 0.12、Agent 0.39、桌面 0.50、设计 0.94、安全 0.26，依赖链 19.71，增 1 人 128.42 / T 23.71 / 33 周，M1 维持 38 周。

## 第 57 轮对抗评审（全范围）后的跨文档决策（ADR-185）

## ADR-185 验收延续不越过书面确认、待升级的证据不被清理、沙箱外工具的动作类、必选记忆的溢出去向、进程内存预算的单一定义与 M2 标记 — Accepted（R57 全部条目与评审结论中的观察；Amends ADR-183/184；Amended by ADR-186、ADR-187）

选择原则同 ADR-183/184：每条以一个字段、一条守卫、一个类或一处引用关闭，不新增机制；不属于 M1 主循环的分支取更简单的出口或推迟（接管期间重建失败时仍只提供放弃 Goal，“放弃改动后从更早的检查点继续”属 M2）；安全不变式全部保持，沙箱外工具的求值只收紧不放宽。安全问题只写到设计层面。本 ADR 同时修订 ADR-183 的“原日志与原重放包随之升为永久保留”（补命中前提与清理排除）。

**条目（R57 追问清单）**
- **R57-D7-01**：验收延续额外要求本次验证没有 `anyQualified` ⑨ 以外的条件；有任一条（例如从 `accepted` 修订标准后出现 ② 计时 flake、⑥ `runner_patched`、⑪ 兜底计数）→ 不延续，进入 `in_review`，只需重看变化的单元，并按验收闸为成立的条件写一句确认。⑨（本次去向为验收延续）只作标签（徽章“延续验收”），不是确认条件；`anyQualified` 首行改为“①–⑧、⑩、⑪ 任一成立即验收前需书面确认”。不记录“上次确认过的条件”，因此不需要新字段；代价是带固定保留条件（例如 ③ S0 环境）的 Goal 每次从 `accepted` 重新验证都回到 `in_review`、再写一句确认，方向偏保守。唯一定义 `07` §7.10.3 `acceptanceCarriesOver`；`03` I2、`04` §4.6.5、`07` 组合表引用。G46(bc)(1)。
- **R57-D7-02**：`10` §10.3.2 磁盘压力的第二步排除可能被升级的两类：`paused(sentinel_high)` 的 Goal 当前 pin 上最近一次以阻断结束的验证，以及被进行中的验证作为缓存命中引用的原验证。缓存命中要求原日志与原重放包仍在，已被清理则不算命中、照常运行该标准（`07` §7.4.8）。“总有可重放的证据”改为有条件的说法：只有人在文件系统中手动删除时才可能缺失，此时保留 ref 照写，`tower verify --replay` 的结论为“不可重放：重放包已删除”，覆盖与验收不受影响。唯一定义 `07` §7.4.1 保留行；`10` §10.3.2、`13` §13.11.3 引用。G46(bc)(2)。
- **R57-D11-01**：新增动作类 `tool.external`（第 28 类）：沙箱外工具（用户扩展注册的工具、MCP 工具）中 `readOnlyHint` 不为真的调用（含无注解），certainty = `heuristic`，`subjects.tool` = 工具注册名。各预设为 `ask`，级别下限为 ask（合同只能改为 `forbid`），所以每次调用都 ask，直到人授予“本 Goal 内同类”授权；该授权的匹配器 = 工具名、与 `subjects.tool` 精确相等，只放行这一个工具，不与其他类的匹配器共用命名空间；合同把该类设为 `forbid`（或收紧过该类）时授权不生效（`applyGrants` 与排除 (c) 不变）。MCP 工具同一规则，`openWorldHint` 另加 `net.other`。参数路径扫描照常叠加。另：沙箱外工具不在 S2 中运行，`decide` 恒以 `env.sandbox = false` 求值（此前 `sandbox.active` 会让相对路径参数的不透明调用按有沙箱的 `exec.arbitrary` 级别放行，与“至少 ask”不符）。唯一定义 `11` §11.3.4；`11` §11.1、§11.2、§11.3、§11.3.5、§11.4，`02` §2.5，`05` §5.6.5，`04` §4.5.2，`16` §16.1.10（类与“工具种类 → 动作类”表）同步。G46(bc)(3)。
- **R57-D12-01**：`selectMemory` 的必选上限改为 `Math.max(budget * 0.5, 2 + 80)`（计入 `Notes:` 前缀，一条 80 token 的置顶条目总能放下）；放不进常驻的必选条目（置顶与 Goal 作用域）全部写入 `contract.md` 的 `## Memory`、排在最前、不计入 20 条，Goal 页生效记忆的按需组标 `置顶但未进常驻`。唯一定义 `09` §9.5.2；`09` §9.5.1、§9.5.4、`16` §16.2 引用。C15(b)。
- **R57-D10-01**：进程内存预算只在 `13` §13.8.1 定义，分“空闲 / 负载时”两列：main 50 / 80、renderer 100 / 300、GPU 30 / 150、Supervisor 70 / 120 MB，空闲四项之和 = §13.1 的空闲总预算 250 MB（总预算取自 `research/gui.md` 的目标，不改）；Engine Host、Verifier Runner、RPC Host（M2）也移入该表。`06` §6.1 进程表只引用；`16` §16.2 登记。全部为假设值，E6 实测回填时两处一并修改。lint 新增 (A)。
- **R57-D15-01**：“回退”在 M1 规范表中一律标 M2：`03` §3.2.1 `stalled_timeout` 出口、`08` §8.8 `stalled` 行（含 ADR-184 写的“回退或交还”）、`07` §7.7.1 escalate 选项；`12` §12.6.5 的 M1 选项去掉“回退”。`16` §16.2.6 与 §16.4 的“远端 base fetch 每 5 min”改为“远端 base 轮询（M2）”，写明 M1 只在 `10` §10.1.2 的四个时机获取；同表“冲突雷达”补 M2。lint (z) 扩展。

**评审结论中的观察（R57 结论部分）**
- 观察 1：开场队列在目标进入待验收或已验收时仍非空，验收面板显示 `下次运行开场：N 条，验收后不会送达`；人可撤回，或 `请求修改` 让它们随返工运行送出；验收后随目标归档、不送达（`04` §4.8.13）。不新增投递路径。
- 观察 2（取舍的文案）：交还检查点的 `humanPaths` 为空时，`paused(human_change_verify_failed)` 的状态标签写 `已暂停 · 验证未通过 · 包含你的交还决定`，卡片首行说明你接管后没有改动，不写“你的改动”；按决定处理、不自动返工的取舍不变（`04` §4.8.12、`12` §12.6.5）。
- 观察 3（取舍的出口）：不改出口——接管期间重建失败时允许“放弃改动”会让 Goal 离开接管后从更早的检查点继续，属 M2 的“从更早的检查点重建”。只收紧文案：卡片写“接管时的检查点已无法恢复，不能交还或放弃改动；你的编辑仍在 <路径>，放弃目标时原样保留”（`04` §4.18.3）。
- 观察 4：`verify()` 中 `recordHits()` 移到 `writeReplayBundle` 之前（`manifest.json` 要列出命中条目的 `factId`，`07` §7.4.1）。
- 观察 5：`recordHits` 只在以 `done(skipped)` 结束的路径上调用；S0 的两处返回与 `envError` 不记录命中（结局是等待授权、“未经机器验证”或环境错误，不复用 exec 结果），伪代码注释写明。
- 观察 6：情形 G 同一事务记 `workspace.recovered{case:"G", unusableCheckpoints:[n…]}`；`checkpoints.unusable` 是它的投影，`tower doctor --rebuild` 由它恢复（`10` §10.16.2、`06` DDL、`16` §16.1.14）。
- 观察 7：`10` §10.16.2 情形 E 的重建来源简写改为“可用的最新检查点 → pin → base”；`02`、`03`、`04`、`06`、`08`、`14`、`16` 中“从最新的检查点或 pin”的复述改为引用情形 E（`16` §16.1.13 登记）。
- 观察 8：`05` D24、D25、G33 的行号按 v1.2.0 更正为 `agent-session.ts:1078-1100, 2054-2057, 2340-2342`、`:1084-1085`、`:2054-2057, 2340-2342, 1090-1098`（源码核实）。
- 观察 9：单向门目标名解析不出时，输入方式改为输入卡片上显示的动作类名（例如 `system.change`），仍是按住的无障碍替代（`16` §16.3）。
- 观察 10：依赖链口径统一：其余各段取第 17 轮的分段值，W9b 取 6.5 加第 17 轮之后 W9 行的全部净增量（不区分 W9a/W9b，偏保守），链长 19.91 工作周（`14` §14.3.4、ADR-133 第 57 轮补记）。
- 观察 11：`08` §8.8 补齐定类：`budget` 的“按当前状态送去验证”（`claim_on_behalf`）→ `actionable`、“放弃” → `informative`；新增 `stalled` 子类型 `idle_without_submit`（继续 / 送去验证 → `actionable`，放弃 → `informative`）与 `satellite_missing`（重试重建 → `actionable`，放弃 → `informative`）两行。
- 观察 12：`04` §4.18.3 的 `■ 外部改动` 改为琥珀 `◆ 外部改动`，与 §4.8.7、`12` §12.6.2 一致。
- 观察 13：`16` §16.3 键位表中 `T`、`P` 的作用域补 Watch（`04` §4.5.5 线框）。
- 观察 14：`13` §13.5 的 Host 退出时机改为引用 `06` §6.1.8；§13.8.3 的独占 Host 假设值改为 ≤ 0.12 GB（超过即按回退规则改为打包）；后台 git 负载的 CI 场景改名为 P8，P2 只指看板满载。
- 观察 15：`16` §16.1.9 学习挖掘源补 L9；`09` §9.0.1 学习闭环挖掘改为 M3（与 `14` §14.4.2 一致，M1 只记录信号），验证档案学习仍为 M2–M3；`11` §11.1 `tower.tool` 补 `review_report`。

- **lint**：(z) 扩展：在原有的推送 / PR / 远端轮询之外，按一张 M2 能力短语表（回退、分叉、远端 base 轮询、每 N min fetch、冲突雷达、合并队列、就地编辑）检查 `03` §3.2.1、`08` §8.8、`12` §12.6.5、`16` §16.2.6 与 §16.4 的表格行：短语旁 40 字内须有 M2 / M3 标记、否定或历史标记。新增 (A)：`06` §6.1 进程表的内存列只能引用 `13` §13.8.1 或给出与它相同的数值，`13` §13.8.1 “空闲”列中 main、renderer、GPU、Supervisor 之和不得超过 §13.1 的空闲总预算。新增 (T)：`05` §5.6.5 判定流程与 `11` §11.3.4 点名的每种工具（文件类、bash、Tower 工具、用户扩展工具、MCP 工具、codemode）在 `16` §16.1.10 “工具种类 → 动作类”表中有一行，且该行列出的动作类都已登记。`16` §16.1.13 补登第 57 轮被取代的说法供 (D) 检索。全部检查：`--checks rstuvwxyzckdnSeRqpoPiDgKYAT`。
- **排期**：+0.05 人周（W9 +0.02、W6 +0.01、W7 SP6b +0.01 → Agent；W10 +0.01 → 安全；系统线 0）；`14` §14.3.4 与 ADR-133 第 57 轮补记一致：WBS 122.59，余量 系统 0.12、Agent 0.34、桌面 0.50、设计 0.94、安全 0.24，依赖链 19.91（口径统一），增 1 人 128.48 / T 23.72 / 33 周，M1 维持 38 周。

## 第 58 轮对抗评审（全范围）后的跨文档决策（ADR-186）

## ADR-186 重放证据只承诺真实的范围、开场队列在验收后保留、沙箱外工具按来源只归一类且级别下限有唯一执行点、接管中重建失败按原因区分出口与 P8 回到 M1 退出标准 — Accepted（R58 全部条目与评审结论中的观察；Amends ADR-183/184/185；Amended by ADR-187、ADR-215、ADR-217、ADR-218、ADR-227）

选择原则（收敛规则）：前两轮每次修补都新增了机制，其边缘又产生新条目。本轮只用三种办法关闭条目：(1) 把说法改弱但为真；(2) 删除或推迟不属于 M1 主循环的机制；(3) 在已有的唯一定义处加至多一条守卫。不新增状态、事件、表或多分支规则。安全不变式全部保持；拿不准时取更严格的行为。安全问题只写到设计层面。

**条目（R58 追问清单）**
- **R58-D7-01**：收回“只有人手动删除时重放证据才可能缺失”。真实的规则只有三句：**只有走到槽位路径的验证才有重放包**（子模块项目、没有可运行 exec 标准、S0 等待或被拒、环境错误等提前返回的路径不写，这些验证即使是决定性的也没有永久重放包）；**以阻断结束的验证覆盖后也不升级**——`override_sentinel` 的决定记录被覆盖的 `factId`（Fact 随事件永久保留，其 `evidence` 指向该次验证的日志），该次验证的重放包按非永久规则保留；**没有可用的重放包时**（提前返回、已被清理、被引用的原日志已被清理、人手动删除），`tower verify --replay` 的结论为“不可重放：<原因>”，覆盖与验收的判定不受影响。因此删除 ADR-184 的“覆盖时升为决定性并写保留 ref”、ADR-185 的磁盘压力清理两类排除，以及 ADR-183 的“原日志与原重放包随之升为永久保留”（缓存命中的前提“命中时原日志仍在”保留，它只是一条已有的守卫）。不再需要按 `pauseReason` 还是 `alsoApplies` 判定清理排除，第 3 个反例随之消失。唯一定义 `07` §7.4.1 保留行；`07` `verify()` 注释、`06` §6.4.3 `sentinel.override`、§6.6.4 重放包行、`10` §10.3.2、`13` §13.11.3 引用。G46(aw) 改为覆盖后仍不写保留 ref；G46(bc)(2) 改为清理后重放报告“不可重放：重放包已清理”；G46(bd)(2) 补“只有 artifact 标准”。
- **R58-D6-01**：取“保留”（更简单、不新增事件）：验收（`goal.accept`）不清空开场队列；验收后若再开 Run（`request_changes`、接管后 `continue_agent` 等）条目随开场送出；归档与放弃后不再有 Run，条目不送达、轨迹可查；复活建新 Goal、不携带队列。验收面板文案改为 `下次运行开场：N 条，下次运行时送出`。唯一定义 `16` §16.1.1 `Goal.pendingOpenings`；`04` §4.8.13、`06` §6.4.3（触发列表补 `accepted` 中的 `request_changes`，即观察 12）引用。G46(bd)(1)。
- **R58-D11-01**：不推迟到 M2（README 第 8 条承诺用户的 Pi 扩展照常生效，推迟会改动 M1 的产品主张与 `00` §0.5.1 的例外表，范围更大），改为把模型压到一类：
  - **工具来源**（唯一定义 `11` §11.3.4 首条）：门禁按注册来源判定，不按工具名——来源取 Pi `getAllTools()` 的 `sourceInfo.path`（v1.2.0 `core/extensions/types.ts:2122-2130`、`core/agent-session.ts:1498-1510`；扩展工具的来源即注册它的扩展，`core/extensions/loader.ts:289-298`；生效定义的优先级 `runner.ts:637-647`、`agent-session.ts:3529-3553`）。只有 Pi 内置工具、Tower 注入的 `<sdk:bash>`、tower-goal 的 Tower 工具、`builtin:codemode` 与 `builtin:tool-search` 按各自规则分类；**其余一切来源是沙箱外工具**，这就是 `isOutOfSandboxTool` 的定义。被同名扩展取代的 codemode、`tool_search` 或 Tower 工具（Pi `docs/mcp.md:268`、`extensions/index.ts:9-13`）来源随之改变，按沙箱外工具处理；没有任何按名字的豁免（`11` §11.4 钩子首行与 `05` §5.6.5 第 1 步同步改为按来源）。
  - **沙箱外工具只归 `tool.external`**，不看注解（Pi 不核实注解，`types.ts:518-531`；缺省按 MCP 默认值视为非只读、可能触达开放世界，`docs/extensions.md:167`）：删除“`readOnlyHint: true` → `read.external`”与“`openWorldHint` 另加 `net.other`”两支，开放世界工具拿不到授权、只读工具没有匹配器两个缺口随之消失。每次 ask；授权只有“仅这一次”或按工具名精确匹配的“本 Goal 内同类”，不接受模式。参数路径扫描照常叠加；“相对路径”在同处给出一句定义（观察 8）。
  - **Pi 内置扩展的工具**：`tool_search`（来源 `builtin:tool-search`；只在已注册工具的元数据上检索并把匹配的工具加入下一次可见的集合，不执行动作、未声明注解，`extensions/tool-search/tool.ts:200-209, 219-229`）归 `tower.tool` 级，被它加载的工具照常判定；MCP 资源工具 `list_mcp_resources`、`list_mcp_resource_templates`、`read_mcp_resource`（`core/mcp-servers.ts:28-30`、`extensions/mcp/resources.ts:254, 278, 302`，标为只读、名字不以 `mcp__` 开头）是 `builtin:mcp` 注册的沙箱外工具，归 `tool.external`。`16` §16.1.10 “工具种类 → 动作类”表补两行。
  - `11` §11.1、§11.2、§11.3.4、§11.4、T16，`02` §2.5，`05` §5.6.5，`16` §16.1.10 同步。G46(bd)(3)。
- **R58-D11-02**：级别下限的**唯一执行点**是 `decide()` 新增的一行 `floor`：单向门类与 `tool.external` 的矩阵级别先钳到至少 ask、再求授权（授权因此仍能把 `tool.external` 降到 notify，不能降低单向门）；合同中更低的值不生效。删除 `decide()` 中“单向门永不静默”（把 silent 提到 notify）与“非 exact 的单向门提到 ask”两行——单向门恒至少 ask，两行都已多余。“合同只能改为 forbid”改为“合同中更低的值不生效”。合同授权到 `Grant` 的映射写在 `02` §2.5：`actionClass` → `class`、`pattern` → `matcher`；`pattern` 缺省时不匹配任何调用（放宽整类改 `levels`）；`tool.external` 的 `pattern` 是一个工具名；`matches` 中匹配器或主体为空时不匹配。G46(bd)(3) 第二组。
- **R58-D13-01**：接管中重建失败的出口与一般的重建失败相同（重试重建 / 放弃）；只有失败原因是接管时的检查点不可用（判定引用 `10` §10.16.2 情形 E、§10.8.4，不在 `04` 另写）时才写“接管时的检查点已无法恢复……”并只提供放弃目标。唯一定义 `10` §10.8.4；`04` §4.18.3 改为引用。G46(bd)(4)。
- **R58-D14-01**：`14` §14.3.5 M1 退出标准的性能行改为“`13` §13.12.2 的 CI 场景 P1/P2/P5/P6/P7/P8”，注明 P8 即 `13` 负载档位中“M1 验收”的后台 git 总预算另测，与 SP6c 用例表的 P1–P8 是两套编号（不改名，避免改动大量引用）。lint 新增 (M)。

**评审结论中的观察（R58 结论部分）**
- 观察 1：`decide` 中计算 `label` 时的 `anyQualified` 不含 ⑨（⑨ 只由延续结果给出、只作徽章），所以延续回到 `accepted` 的标签为 `verified`（`07` §7.10.3 注释）。不另设命名谓词。
- 观察 2：⑦ 包括按 §7.10.2 第 3 条延续到新 pin 的覆盖（更严格：这类验证不延续验收）。
- 观察 3：`08` §8.8 `budget` 行与 §8.6.1 `budgetCapped` 的“或停止”改为“或放弃”；`03` §3.2.1 `idle_without_submit` 的按钮名改为“按当前状态送去验证”。
- 观察 4：`03` `accepted` 行与 `07` 组合表的 `s0_grant_pending` 行注明：在 S0 中验证时 ③ 恒成立，`grant_s0_exec` 之后总是进入 `in_review`。
- 观察 5：`08` §8.12、`10` §10.11 Q4（M2）、`04` §4.16（M2）的延续判据复述改为引用 `07` §7.10.3 `acceptanceCarriesOver`；旧复述登记到 `16` §16.1.13 供 (D) 检索。
- 观察 6：`13` §13.1 冲突雷达行、§13.10 启动序列的“冲突雷达首轮”、§13.11.1 正式验证行的“合并队列”、`03` `accepted` 行与 `08` §8.12 的“合并队列 rebase”补 M2；lint (z′) 扩展到 `13` §13.1 与 §13.11 的表格（只查冲突雷达与合并队列，`13` 中“回退”多为降级或性能回归的意思）。
- 观察 7（取舍，写明）：`tool.external` 不是单向门——沙箱外工具的效果可能等同单向门，但授权以一个工具名为单位、只能由人在本机显式给出；需要逐次确认的工具，人不授予或把该类设为 `forbid`。写在 `11` §11.3.4 与 T16。不按 `destructiveHint` 区分（不看注解）。
- 观察 8（已知限制，写明）：授权绑定名字而不是实现，MCP 服务器改变工具列表或名字冲突加哈希后缀（Pi `extensions/mcp/tools.ts:78-92`）时授权照样作用于同名工具；Goal 页按类撤销会撤销本 Goal 的全部 `tool.external` 授权（更严格，不新增按工具撤销的入口）；“相对路径”在 `11` §11.3.4 路径检查 (3) 中定义为含 `/` 或等于 `.`、`..`、且不以 `/`、`~`、`<scheme>://` 开头的字符串值。
- 观察 9：`11` §11.2、`16` §16.2.8、`12` §12.6.2 与 §12.12、`04` §4.8.2 的双确认摘要补“解析不出目标名时输入动作类名”；`DecisionCard` 单向门确认状态同时显示动作类 id；`12` §12.13.2 写明按住 1.5 s 与 5 s 倒计时是交互阈值、不是动效；`OpeningQueue` 的 120 ms 改用 `--dur-1`。
- 观察 10：`16` §16.3 `O` 的作用域补 Watch（打开所选输出的完整日志），新增 `↩`（Watch：展开所选输出）一行。
- 观察 11：`13` §13.8.3 与 `16` §16.2.6 的 Tower 自身预留改为 0.65 GB（= §13.8.1 四项“负载时”之和），`07` §7.4.10 的算例同步为 8.25 GB；`13` §13.1“10 个流式 Goal”一行写明独占 Host 在 90–120 MB 之间时会超出 900 MB，该档属 M2 验收，E6 回填时一并对齐（记为已知限制，不改规则）。
- 观察 12：开场消费的触发列表在 `06` §6.4.3 与 `16` §16.1.1 补全（自动返工、`in_review` 或 `accepted` 中的 `request_changes`），与 R58-D6-01 一并处理。
- 观察 13：`08` §8.11 改为“记忆提议从 M2 起，学习闭环挖掘属 M3”；`07` §7.11.4 的 `propose_project_rule` 标 M3（M1 的覆盖只有 `this_hit` 与 `this_goal`）。
- 观察 14：`08` §8.8 增一行通用规则：本表未单列放弃一格的 kind（`verify_env`，`stalled` 的 `crashed`、`engine_error` 子类型——`provider_unavailable` 对应后者）放弃 → `informative`，其余出口按通用 `stalled` 行定类。
- 观察 15：`16` §16.1.4 变更类工具调用的只读白名单补 `tool_search` 与 codemode 容器本身（它的嵌套调用逐一判定）；`tool_search` 的来源按 `11` §11.3.4。

**删除 / 推迟到 M2 / 收窄的说法**
- 删除：覆盖哨兵时“把该 pin 上最近一次以阻断结束的验证升为决定性并写保留 ref”（ADR-184）；磁盘压力清理“排除可能被升级的两类”（ADR-185）；缓存命中后“原日志与原重放包随之升为永久保留”（ADR-183）；`decide()` 的“单向门永不静默”与“非 exact 的单向门提到 ask”两行；沙箱外工具的 `readOnlyHint` → `read.external` 与 `openWorldHint` → `net.other` 两支；Tower 工具与 codemode 按名字的豁免。
- 推迟：`propose_project_rule` 标 M3（此前未标里程碑）；冲突雷达、合并队列在 `13` 与 `03` 中补 M2 标记（不是新推迟，只是补标）。
- 收窄的说法：“被覆盖的阻断命中有可重放的证据，只有手动删除才缺失” → 只有槽位路径的验证有重放包，没有时如实报告“不可重放：<原因>”；“验收后不会送达” → 下次运行时送出；“合同只能改为 forbid” → 合同中更低的值不生效；“接管中重建失败只能放弃目标” → 只在接管时的检查点不可用时。
- 记为已知限制而不新增机制：工具名授权的稳定性与按类撤销（观察 8）；10 个流式 Goal 的独占档内存（观察 11）。

- **lint**：(T) 扩展：按 Pi 版本把内置扩展注册的工具（v1.2.0：`codemode`、`tool_search`、MCP 资源工具）列为必查种类，`16` §16.1.10 表中必须各有一行（清单 `PI_BUILTIN_EXT_TOOLS` 按 Pi 版本维护，对应 `05` §5.3.1 加载的内置扩展）；`11` §11.3.4 的“工具来源”条不是工具种类，跳过。新增 (F)：`02` §2.5 写明“级别下限”的每个类（单向门类按 `isOneWayDoor`），必须出现在 `11` §11.3.5 `decide()` 的 `floor` 行中，且 `floor` 必须作用在 `applyGrants` 的参数上（先钳后授权）。新增 (M)：`13` 负载档位中“M1 验收”所引用的小节（§13.11.2），其在 `13` §13.12.2 中对应的 CI 场景必须出现在 `14` §14.3.5 M1 退出标准的 CI 场景列表中。(z′) 扩展到 `13` §13.1 与 §13.11 的表格（只查冲突雷达、合并队列）。(d) 的 DELETED 补“覆盖时升为决定性 / 可能被升级的两类”与“单向门永不静默”。`16` §16.1.13 补登第 58 轮被取代的说法供 (D) 检索。全部检查：`--checks rstuvwxyzckdnSeRqpoPiDgKYATFM`。
- **排期**：±0.00 人周（W9 −0.01 → Agent，在依赖链上；W7 SP6b +0.01 → Agent；W10 净 0 → 安全；系统线 0）；`14` §14.3.4 与 ADR-133 第 58 轮补记一致：WBS 122.59，余量 系统 0.12、Agent 0.34、桌面 0.50、设计 0.94、安全 0.24，依赖链 19.90，增 1 人 128.48 / T 23.72 / 33 周，M1 维持 38 周。

## 第 59 轮对抗评审（全范围）后的跨文档决策（ADR-187）

## ADR-187 Tower 工具不可被遮蔽、验收但不合并经 `goal.accept{integrate:"none"}`、run 类阻断守卫引用唯一集合、完整重哈希不承诺重放包、覆盖后的标签写入点与“通过”只认已验证、§8.8 每个出口一个类别 — Accepted（R59 全部条目与评审结论中的观察；Amends ADR-095/145/185/186；Amended by ADR-188）

选择原则（收敛规则，同 ADR-186）：只用三种办法关闭条目——(1) 把说法改弱但为真；(2) 删除或推迟不属于 M1 主循环的机制；(3) 在已有的唯一定义处加至多一条守卫、一行或一个字段。不新增状态、事件或表。安全不变式全部保持；拿不准时取更严格的行为。安全问题只写到设计层面。

**条目（R59 追问清单）**
- **R59-D1-01**：`00` §0.5.1 增两行：用户扩展工具、MCP 工具与 MCP 资源工具每次调用都需要批准（可“仅这一次”或按工具名授予本目标内放行），不看注解（依据 `11` §11.3.4）；扩展注册与 Pi 内置工具同名的工具时该工具按沙箱外工具处理，注册与 Tower 工具同名的工具时 Tower 不启动运行（依据 `11` §11.3.4、`05` §5.3.5，与 R59-D5-01 一致）。静态清单的文本扫描（`05` §5.10）同时标出这两类扩展，确认卡片写明后果；`11` §11.8.2 的确认卡片补“每次调用都需要你批准”。
- **R59-D4-01**：取最简单的一致做法——**不新增命令与决定种类**：`goal.accept{integrate:"none"}`（M1 本已接受该值）就是“验收但不合并”，唯一定义在 `06` §6.4.3 `goal.accept` 行：在 `in_review` 中按原闸口验收后同一事务再 `accepted → archived`，不 seal、不写分支；在 `accepted` 中（seal 分支已写、未合入）不重做闸口，只记 `human.decision{accept}`（`integrate:"none"`）与 `accepted → archived`，分支保留；其他状态 `E_STATE`。两条路径都经过 `accepted`，I1 与 `goals_archive_guard` 不变。卫星清理按 `10` §10.3.2（行名改为“验收但不合并”），开场队列不送达（`16` §16.1.1）。`02` §2.7 `HumanDecision.kind` 的 `accept` 注释、`03` `accepted` 行、`06` I1 行、`10` §10.12、`16` §16.1.12 集成模式行（`none` 不是集成模式）、`04` 侧栏 14 天提示、验收面板去向（`不合并并归档`）与第 7 步引用。lint (s) 无新枚举值，(v) 无新命令。G46(be)(4)。
- **R59-D5-01**：Pi v1.2.0 核实：扩展工具“先注册者胜”（`core/extensions/runner.ts:636-646`）；inline 扩展排在全部文件型与 builtin 扩展之后（`core/resource-loader.ts:778-781`，路径 `<inline:<name>>`，`:1145`）；`customTools` 最后写入、压过同名扩展工具（`core/agent-session.ts:3529-3553`）。tower-goal 必须是最后一个扩展（gate 看到最终输入），不能“先加载”；Tower 工具改走 `customTools` 会改变工具来源的定义与 gate 的位置。因此取守卫：**Run 开始前的来源自检**（唯一定义 `05` §5.3.5 Host 骨架，与 `<sdk:bash>` 自检同处）——本阶段要激活的每个 Tower 工具的生效来源必须是 `<inline:tower-goal>`，否则不开 Run，进入已有的 `paused(prepare_failed)`（Host 启动步骤失败），卡片写出注册该名字的扩展。门禁对被遮蔽的工具仍按来源归 `tool.external`（偏严不变）。名字式的“内置工具”统一改为按来源：`16` §16.1.4 变更类工具调用的只读白名单（来源为 `builtin:<name>`；覆盖了这些名字的扩展工具不在白名单中）、`05` §5.6.5 第 8 步输入比对（只比对 `builtin:<name>` 与 `<sdk:bash>`，覆盖内置名的扩展工具不参与，因此不会产生不可返工的 `input_mutated_after_gate`）、`16` §16.1.10 文件类工具行与 Tower 工具行。`03` `prepare_failed` 行、`04` §4.8.11 卡片示例、`11` §11.4“工具被覆盖”引用。C28a 补一组（用户扩展注册 `submit`）；G46(be)(1)。
- **R59-D6-01**：`06` §6.4.3 `goal.request_changes` 的守卫改为“存在任一未解除的阻断 run 类命中（集合只在 `16` §16.1.6 定义：`input_mutated_after_gate`、`nested_repo_live`）时返回 `E_STATE`”，删去“唯一的”。同一枚举错误的另三处一并改为引用：`06` §6.4.3 `goal.hand_back` 的原因清除、`04` §4.6.7 交还对话框的保留项、`04` §4.16 F6 第 5 步。G46(be)(2)。lint 新增 (B)。
- **R59-D7-01**：取删除：`07` §7.4.1 保留行删去“以及验收与 seal 时的完整重哈希验证”，写明完整重哈希是指纹闸口（§7.3.2 `full`），不是 `verify()` 的运行，没有重放包、不写保留 ref；不一致时已有 `anomaly{stat_cache_mismatch}`，一致时不另留证据（验收要求指纹等于决定性验证的 pin，那次验证有重放包时已永久保留）。`06` §6.6.4、`10` §10.17.1 保留 ref 行、`13` §13.11.3、`16` §16.1.13 同步。**缓存命中的前提统一为一种写法**，唯一定义在 `07` §7.4.8 同指纹缓存行：原验证该标准的完整日志（§7.4.4 `verify/<verifyId>/<criterionId>.log`）仍在；原重放包是否仍在不影响命中（清理同时删除两者，ADR-186 的写法即此）。`07` `verify()` 注释与 §7.4.1 改为引用。lint (d) 的 DELETED 补“完整重哈希验证”。
- **R59-D7-02**：**写入点**：`label` 的唯一写入点是进入 `in_review`/`accepted` 的 `goal.state_changed`（`07` §7.10.3 Verified 定义处；`16` §16.1.1 标签行登记），这是正常路径已用的位置，不在决定或 Fact 上另设字段。继续目标 `review{state, pin}` 执行时（覆盖哨兵或 S0 拒绝改写的目标）同一事务按 `decide` 的 `label` 行、以该 pin 最近一次验证的 outcome 计算：覆盖后 ⑦ 成立，`pass` → `verified_qualified`，`no_machine_criteria`/`exec_not_run` → `not_machine_verified`；S0 拒绝为 `exec_not_run{s0_denied}`。徽章、验收闸与 seal trailer 读它，未经机器验证的 Goal 因此不会写 `Tower-Verified-At`。**是否算“通过”**：取更严格、也更简单的一种——归因窗口的“通过”只认结论标签为已验证或有保留的已验证的验证（直接进入 `in_review`，或经覆盖改写的 `review` 目标进入，序号取该次验证；或经验收延续回到 `accepted`）；未经机器验证的验证不算通过（此前的定义把它算作通过）。唯一定义 `03` §3.2.1；`06` §6.4.3 的逐字引用、`07` `decide` 注释（`lastPassedVerifySeq`）与组合表失败行、`16` §16.1.1 归因窗口行改为一致或引用。`06` `sentinel.override`、`s0.deny` 与 `04` §4.16 F6 第 5 步引用。G46(be)(3)。
- **R59-D8-01**：`08` §8.8 表头写明“每个出口只有一个类别：单列的出口以该行为准，通用行只适用于没有写到的出口”。`budget` 行的 actionable 栏删去“或放弃”，`claim_on_behalf` 限定为 `budget_hard_cap`；`verify_failed` 行改为“选择放弃以外的任意处置选项”；增一条通用行：交还或 `goal.resume` 解除条目对应的暂停原因而关闭 → `actionable`（覆盖交还关闭的 `stop_condition`、`idle_without_submit` 等，以及 `provider_unavailable`/`engine_crash` 中换模型后的 `resume`）；`sentinel` 行补 `accept_risk` → `informative`，`07` §7.11.1 的 TP-informative 同步。lint 新增 (O)。

**评审结论中的观察（R59 结论部分）**
- 观察 1：`07` §7.4.10 重项目一行改为 3.6 + 0.65 + 2 × 4.6 = 13.45 GB；公式未计 Host `h` 记为已知差异（参考配置多 3 × 0.12 GB，结论不变，E6 回填时与 `13` §13.8.3 对齐）。
- 观察 2：`07` §7.10.3 开场段的触发列表改为引用 `16` §16.1.1 与 `06` §6.4.3。
- 观察 3：`16` §16.3 `⌘↩` 行补“解析不出目标名时输入动作类名”。
- 观察 4：`14` §14.3.4 与 ADR-133 第 58 轮补记中“缓存命中引用的原日志按非永久规则保留”更正为“按原验证的保留期保留”；`06` §6.6.4 重放包行的非永久列表补“以阻断结束的验证”。
- 观察 5：`03` 正文的合并队列（`human` 行、I2）与冲突雷达（验证步骤）补 M2。
- 观察 6：`07` §7.11.3 标题下写明自动降级从 M2 起、两类豁免提议属 M3；`16` §16.2.3 自动调节行同标。
- 观察 7：`16` §16.3 补诊断视图的 `/`（搜索）、`⇧J`/`⇧K`（跳地标）、`↩`（展开所选条目），`O` 的作用域补诊断。
- 观察 8：⑨ 统一写作“只作徽章”（`07` §7.10.3 两处注释、`04` §4.6.5）。
- 观察 9：`11` §11.3.4 “只有四种来源”改为“只有下列来源”。
- 观察 10：`11` §11.2 矩阵 `tool.external` 行写明合同编辑器在下限为 ask 的格上显示有效级别 `ask`、不提供更低的选项。
- 观察 11：`11` §11.2 写明生成不出匹配器时只提供“仅这一次”（空匹配器不匹配）。
- 观察 12：`16` §16.1.4 写明只读白名单信任 `readOnlyHint` 与门禁不看注解的不对称：前者只决定提交是否作废与检查点预筛，不是授权；误信注解时 pin 的树仍含该写入，照常被验证与评审。
- 观察 13：终态 Goal 不显示“下次运行开场”一行（`04` §4.8.13），`goal.openings.withdraw` 对已归档或放弃的 Goal 返回 `E_STATE`（`06` §6.4.3；`16` §16.1.1）。
- 观察 14：`05` §5.6.5 第 1 步注明来源豁免在阶段检查与 draining 分支之前返回：`tool_search` 仍会改变可见工具集、codemode 容器仍会启动，被加载的工具与嵌套调用照常判定，不越权。
- 观察 15：取舍判断，无改动。

**删除 / 推迟到 M2 / 收窄的说法**
- 删除：完整重哈希“永久保留重放包并写保留 ref”的承诺（ADR-095 的该子句）；缓存命中对原重放包的要求（ADR-185）。
- 推迟或补标：`07` §7.11.3 的自动降级（M2）与豁免提议（M3）、`03` 的合并队列与冲突雷达（M2）——均为补标，不是新推迟。
- 收窄的说法：归因窗口的“通过”不再包括未经机器验证（ADR-145 起的定义）；“只有四种来源” → 下列来源；`budget` 的放弃与 `verify_failed` 的“任意处置选项”各只在一栏。
- 记为已知限制而不新增机制：`07` §7.4.10 公式未计 Host `h`（观察 1）。

- **lint**：新增 (B)：凡在同一行把“run 类阻断”与“唯一 / 只有 / 一项”并用的枚举式断言，其中列出的 run 类阻断 id 必须等于 `16` §16.1.6“阻断的 run 类命中有两项”给出的集合（或改为引用 `16` §16.1.6）。新增 (O)：`08` §8.8 每一行中，同一个带反引号的命令 id 或“放弃”不得同时出现在 actionable 栏与其他栏。(T) 扩展：`05` §5.6.2 列出的每个 Tower 工具名都须出现在 `11` §11.3.4 “工具来源”条或 `05` §5.6.5 第 1 步的 Tower 工具列表中，且 `05` §5.3.5 Host 骨架中有对 `<inline:tower-goal>` 的来源自检。(d) 的 DELETED 补“完整重哈希验证”。`16` §16.1.13 补登第 59 轮被取代的说法供 (D) 检索。评审建议的 (H)（`03` 每条 🧑 转移都有命令或决定种类）不实现：`03` §3.2 中多数 🧑 转移以自然语言写出（“起草合同”“批准合同 v1”等），没有可机械比对的命令名，需要先给全部转移补命令名，代价超出本轮；本轮只把评审点名的 `accepted → archived` 补上命令。评审建议的 (R) 与已有的 (r′)（`--checks` 中的 `R`）同字母，改名为 (B)。全部检查：`--checks rstuvwxyzckdnSeRqpoPiDgKYATFMBO`。
- **排期**：+0.04 人周（W3 +0.01 → 系统改派桌面；W6 +0.01 → Agent；W9 +0.01 → Agent，在依赖链上；W7 SP6b +0.01 → Agent；系统线 0）；`14` §14.3.4 与 ADR-133 第 59 轮补记一致：WBS 122.63，余量 系统 0.12、Agent 0.31、桌面 0.49、设计 0.94、安全 0.24，依赖链 19.91，增 1 人 128.52 / T 23.73 / 33 周，M1 维持 38 周。

## 第 60 轮对抗评审（全范围）后的跨文档决策（ADR-188）

## ADR-188 S0 拒绝经 `decide()` 判定、Tower 工具来源自检覆盖晚注册、验收但不合并保留分支、角色容量表与键位去重 — Accepted（R60 全部条目与评审结论中的观察；Amends ADR-134/187；Amended by ADR-189、ADR-220）

选择原则（收敛规则，同 ADR-186/187）：只用三种办法关闭条目——(1) 把说法改弱但为真；(2) 删除或推迟不属于 M1 主循环的机制；(3) 在已有的唯一定义处加至多一条守卫、一行或一个字段。不新增状态、事件或表。安全不变式全部保持；拿不准时取更严格的行为。安全问题只写到设计层面。

**条目（R60 追问清单）**
- **R60-D7-01（重要）**：取**删除**：`s0.deny`（人拒绝，或 `use_defaults` 下超时由系统写 `denied_timeout`）与授权一样**只解除 `s0_grant_pending`，不改写继续目标**——`verify{pin}` 保持不变（删除 ADR-134 起“拒绝 → 改写为 `review{state:"in_review", pin}`”与 ADR-187 为该路径固定的标签）。离开暂停后以同一 pin 重新验证，`verify()` 走已有的 `denied` 分支（`done({execSkipped:"s0_denied", by})`：重跑 `pinSafetyCheck`、静态哨兵与 artifact 检查，不取槽位），由 `decide()` 判定：artifact 失败 → 按归因的失败去向；未覆盖的阻断命中 → `paused(sentinel_high)`；两者都没有 → `in_review`，标签 `not_machine_verified{s0_denied, by}`。**唯一定义在 `07` §7.10.3 `decide()`**（注释与组合表 S0 两行）；`06` §6.4.3 `s0.deny` 行与 §6.2.3、`03` §3.2 `verifying` 行与 §3.2.1 `s0_grant_pending` 行、`08` §8.7.1 超时行、`05` §5.6.5、`04` §4.8.5 与 §4.18.3、`12` §12.6.6、`16` §16.1.1 `Goal.s0Grant` 行引用它；`07` 继续目标表与 `16` §16.1.1 标签行删去“S0 拒绝改写的目标”。**未采用**：先在 `decide()` 中把阻断命中排在“等待 S0 授权”之前——那样覆盖哨兵会把一个 exec 标准从未运行、也没有 S0 决定的 pin 改写为 `review` 目标送进评审；也未采用“拒绝的同一事务调用 `decide()`”——暂停中另有原因（`alsoApplies`）时，其结果还需另一种继续目标来承载。重新验证走已有路径，不需要新机制，并且另有原因时由 `onAllReasonsCleared()` 照常处理。G46(bf)(1)。
- **R60-D5-01**：Pi v1.2.0 核实：`registerTool` 在加载之后同样可调用，并立即 `runtime.refreshTools()`（`core/extensions/loader.ts:289-300`）；`bindExtensions` 在 `core/agent-session.ts:3304` 发出 `session_start`，`:3306` 完成 `extendResourcesFromExtensions`；`examples/extensions/dynamic-tools.ts:6, 51, 56` 在 `session_start` 中与运行期命令中注册工具；`docs/extensions.md:183`：晚注册的扩展可以在 `tool_call` 处理器中注册工具；`tool_call` 事件只带 `toolName`（`core/agent-session.ts:668-674`），处理器按扩展顺序调用、任一阻断即返回（`core/extensions/runner.ts:1249-1267`）；`getAllTools()` 读 `_toolDefinitions`（`core/agent-session.ts:1498-1510`），`_refreshToolRegistry` 每次重建它，扩展工具按 `getAllRegisteredTools()` 的先注册者胜（`core/agent-session.ts:3520-3553`，`core/extensions/runner.ts:636-646`）。没有“工具列表已最终确定”的事件，所以取两处检查：(a) Run 开始前的来源自检移到 `bindExtensions` 返回之后（`05` §5.3.5 骨架，唯一定义不变），`session_start` 中注册的同名工具因此被检出，不开 Run；(b) gate 第 1 步（`05` §5.6.5）对**调用名是 Tower 工具名**的每次调用，以调用时 `pi.getAllTools()` 中该名字的生效来源复核：不是 `<inline:tower-goal>` 时阻断该调用（`terminate`），经 `appendEntry("tower.selfcheck")` 由 Supervisor 以 `drainingFor{reasons:["prepare_failed"]}` drain 后暂停。gate 是最后一个 `tool_call` 处理器，看到的是调用前的最终注册表。这类调用不会出现审批卡，避免人把同名工具当作 Tower 工具批准。`prepare_failed` 的来源增加 `running`（`03` §3.2.1、`02` §2.4 注释），出口不变。`00` §0.5.1、`11` §11.3.4、`16` §16.1.10、`04` §4.8.11 同步。C28a 补两组（`session_start` 中注册、Run 中途注册）；G46(bf)(2)。审批卡显示来源扩展名的建议不采纳：同名的 Tower 工具名已不会进入审批。
- **R60-D4-01**：取最简单、且不需要新机制的一种：从 `in_review` 以 `goal.accept{integrate:"none"}` 验收时，**先按 `branch_only` 验收**（同一闸口、seal、在用户仓库写分支，与“只保留分支”相同），在 `integration.performed` 的同一事务再 `accepted → archived`，分支保留。两条路径（从 `in_review`、从 `accepted`）因此行为一致：归档时卫星删除、分支保留，已验收的改动总能从用户仓库取回。唯一定义 `06` §6.4.3 `goal.accept` 行；`03` `accepted` 行、`10` §10.3.2 清理表、`16` §16.1.12 集成模式行、`02` §2.7 注释、`04` §4.6.5 去向说明（“同样创建该分支，随后归档并删除工作目录，分支保留”）与第 7 步同步。G46(be)(4) 第一组的期望随之修订。
- **R60-D14-01**：`14` §14.3.4 角色容量表 Agent 行改为 26.48 / 26.08 / 28.69、桌面行 27.72 / 25.92 / 28.51（第 59 轮的值，脚本按 W1–W19 主责拆分求和核对），再计入本轮增量后 Agent 行为 26.50 / 26.10 / 28.71。lint 新增 (C)。
- **R60-D15-01**：`16` §16.3 删去第 59 轮补登的 `⇧J` / `⇧K`（诊断）一行，保留“轨迹、诊断”一行并改为“下 / 上一个地标”，方向与 `J` / `K`（下 / 上一项）一致；`04` §4.7.2 线框只写“⇧J/⇧K 跳地标”，不受影响。lint 新增 (J)。

**评审结论中的观察（R60 结论部分）**
- 观察 1：`07` §7.10.3 `label` 写入点补一句：其余进入 `in_review`/`accepted` 的转移（`goal.accept`、`goal.undo_integrate`、较旧 seal 合入后 `accepted → in_review`）不重新计算，照写最近一次写入的 `label`；`goals` 不另存该列，读取方取最近一次带 `label` 的 `goal.state_changed`。
- 观察 2：`02` §2.7 `HumanDecision` 增一个字段 `integrate?`（仅 `accept`，存 `06` `decisions.payload`）；`06` §6.4.3 写明从 `accepted` 归档时合同版本与各单元 contentHash 沿用上一次验收的值。`02` 中误写的 `human_decisions.payload` 更正为 `decisions.payload`（表名以 `06` DDL 为准）。
- 观察 3：从 `in_review` 选“验收但不合并”现在会写 seal，“最近一次验收的 seal”即本次 seal，`10` §10.12 的判定照常；`06` §6.4.3 写明归档是终态，已合入而未观测到的 Goal 仍以未合并归档；`14` §14.6.1 北极星条件 3 写明只计入 `integrated` 的 Goal。
- 观察 4：`16` §16.1.4 只读白名单的括注改为“覆盖了这些名字的扩展工具不按本项进入白名单（仍可按末项）”。
- 观察 5：`07` §7.10.1 交还一条改为引用 `16` §16.1.6，分别写出两项 run 类阻断的出口。
- 观察 6：`05` §5.6.2 记为已知限制：塑形与评审阶段按名字激活只读工具，扩展覆盖这些名字时激活扩展版，门禁按来源归 `tool.external` 逐次审批，不越权。
- 观察 7：`03` §3.5 定义依赖“满足”：被依赖的 Goal 已被验收（`accepted`、`integrated`，或经二者进入 `archived`，含验收但不合并——其分支保留）；放弃的不算满足；以其分支为 base 时取最近一次 seal 写入的分支。`06` §6.2.4 准入引用它。
- 观察 8：`07` §7.11.1 TP-actionable 补“以交还或 `goal.resume` 解除该命中引起的暂停”，与 `08` §8.8 通用行一致。
- 观察 9：`03` §3.5 冲突雷达补 M2。
- 观察 10：`07` §7.4.8 命中前提写明“原验证”沿引用链取实际运行该标准的那次验证。
- 观察 11：取舍判断，无改动。

**删除 / 推迟到 M2 / 收窄的说法**
- 删除：S0 拒绝改写为 `review` 目标（ADR-134）及其固定标签（ADR-187）；从 `in_review` 验收但不合并时“不 seal、不写分支”（ADR-187）；`16` §16.3 重复的 `⇧J` / `⇧K` 一行。
- 收窄的说法：`00` §0.5.1“Tower 不启动该目标的运行”补上中途注册时的行为（调用时阻断并暂停）。
- 补标：`03` §3.5 冲突雷达（M2），不是新推迟。
- 记为已知限制而不新增机制：阶段工具集按名字激活（观察 6）。
- `16` §16.1.13 补登第 60 轮被取代的说法供 (D) 检索。

- **lint**：新增 (J)（评审建议的 (K)；`K` 已被 (k′) 占用，改名）：`16` §16.3 键位表中同一 (键, 作用域) 只登记一次，`G` 前缀的和弦除外，`（…）` 中的替代键视为同一绑定。新增 (C)：`14` §14.3.4 每个 WBS 行的主责拆分之和等于该行估计、功能合计等于各行之和；角色容量表每行的分配合计等于主责拆分按角色求和，M1 剩余 = 合计 − M0 先行，“+ QA”= 剩余 × 1.1 的十进制半进位，冻结前所需等于它（安全按 0.5 人加倍）；“第 N 轮后……在 A–B 之间”的区间、结论中的缓冲外余量（29.00 − 冻结前所需）、甘特余量格、增人备选的加法式与 T，以及 `15` 最近一次 ADR-133 补记的角色合计与余量，都与该表一致。(T) 再扩展：`05` §5.3.5 骨架中 `<inline:tower-goal>` 来源自检必须位于一次 `bindExtensions(` 调用之后，且 `05` §5.6.5 判定流程第 1 步必须以 `getAllTools()` 对 `<inline:tower-goal>` 逐次复核 Tower 工具名。全部检查：`--checks rstuvwxyzckdnSeRqpoPiDgKYATFMBOJC`。
- **排期**：+0.02 人周（W6 +0.01 → Agent；W7 SP6b +0.01 → Agent；W3、W9 的删除与复用不足 0.01，计 0；系统线 0）；`14` §14.3.4 与 ADR-133 第 60 轮补记一致：WBS 122.65，余量 系统 0.12、Agent 0.29、桌面 0.49、设计 0.94、安全 0.24，依赖链 19.91，增 1 人 128.54 / T 23.73 / 33 周，M1 维持 38 周。

## 第 61 轮对抗评审（全范围）后的跨文档决策（ADR-189）

## ADR-189 Pi 内置工具固定白名单、SDK 命令上下文动作拒绝改变会话、M1 验收先写分支、`prepare_failed` 的运行期来源与线框按键提示 — Accepted（R61 全部条目与评审结论中的观察；Amends ADR-188；Amended by ADR-190、ADR-220）

选择原则（收敛规则，同 ADR-186/187/188）：只用三种办法关闭条目——(1) 把说法改弱但为真；(2) 删除或推迟不属于 M1 主循环的机制；(3) 在已有的唯一定义处加至多一条守卫、一行或一个字段。不新增状态、事件、表、命令或决定种类。安全不变式全部保持；拿不准时取更严格的行为。安全问题只写到设计层面。

**条目（R61 追问清单）**
- **R61-D11-01（重要）**：Pi v1.2.0 核实：内置工具 `allToolNames` 为 `read`/`bash`/`powershell`/`edit`/`write`/`grep`/`find`/`ls`（`core/tools/index.ts:95-105`，`createAllToolDefinitions` 都创建，`:182-191`）；`powershell` 不传 `operations` 时用本地执行实现（`core/tools/powershell.ts:32, 55`），不经沙箱；初始活跃工具取用户或项目的 `defaultTools`，未设置时为 `read/bash/edit/write`（`core/sdk.ts:282, 294`，`core/settings-manager.ts:83`）；`createAgentSessionFromServices` 接受 `tools`/`excludeTools`/`noTools`（`core/agent-session-services.ts:61-64, 227-230`）。`excludeTools` 把名字移出注册表（`core/agent-session.ts:1541-1545`，在 `_refreshToolRegistry` 中同时过滤内置与扩展工具，`:3536-3539`），之后 `setActiveTools` 只能启用已注册的工具（`:1518-1522`），`executeTool` 只调用注册表中的工具（`:1566-1571`），`reload` 沿用同一过滤；`allToolNames` 不从包根导出。`tools` 是允许表，会把用户扩展工具一并移出注册表，所以不用它。取**最简单的安全规则**：Tower 支持的内置工具是固定白名单 `TOWER_BUILTINS` = `read`、`bash`、`edit`、`write`、`grep`、`find`、`ls`（与 `16` §16.1.10 工具表的两行一一对应；`bash` 的生效定义恒为 `<sdk:bash>`）；Host 以 `excludeTools: NON_TOWER_BUILTINS`（v1.2.0 为 `["powershell"]`）创建会话（`05` §5.3.5 骨架，唯一定义在 `11` §11.3.4 工具来源），RPC（M2）同样传 `--exclude-tools`（`cli/args.ts:162`）；`running` 阶段的内置工具显式设置为 `read`/`bash`/`edit`/`write`，不读用户或项目的 `defaultTools`（`05` §5.6.2）。纵深防御：来源为 `builtin:<name>` 而名字不在白名单中的工具（以后的 Pi 版本新增的内置工具同样如此），门禁按沙箱外执行，硬底线 forbid（`exec.arbitrary` 带 `hardFloor`，不可授权，不按 `bash` 的规则、也不以 Goal 的沙箱档位求值）；会执行命令的 Pi 内置工具中只有被 `customTools` 替换的 `bash` 按有沙箱求值。`11` §11.3.2 标题与 `16` 工具表删去“（及 `powershell`）”，`16` §16.1.4 变更类工具调用、`10` §10.7.1 第 0 步同步；`00` §0.5.1 加一行能力差异。C28a 补一组（`defaultTools` 含 `powershell`、扩展 `setActiveTools` 加入它；对照组中 `builtin:` 名字恰为两个常量之并，Pi 新增内置工具时失败）；G46(bg)(1)。未采用另两种：以 `customTools` 注入沙箱版 `powershell`（多一个要维护的沙箱执行器，M1 不需要 PowerShell），以及只把 `builtin:powershell` 归入沙箱外工具逐次审批（工具仍对模型可见，且可授予按名字的放行，弱于不注册）。
- **R61-D5-01**：Pi v1.2.0 核实：`ExtensionCommandContextActions` 含 `waitForIdle`、`newSession`、`fork`、`navigateTree`、`switchSession`、`reload`（`core/extensions/types.ts:2239-2259`）；宿主不传时为返回成功的空操作（`core/extensions/runner.ts:553-570`）；Pi 的 RPC 模式接到真实的重载与 runtime 替换（`modes/rpc/rpc-mode.ts:322-343`）；扩展可经 `sendUserMessage(…, {expandPromptTemplates:true})` 触发自己的命令，流式中也立即执行（`core/agent-session.ts:2053-2068, 2390-2420`）；`reload()` 重读设置与资源、重建扩展运行器并再次发出 `session_start`（`:3685-3721`）；命令处理器抛错时 Pi 发出 `extension_error{extensionPath:"command:<命令名>"}`（`:2156-2163`）。在 `05` §5.3.5 骨架**唯一定义** SDK 的 `commandContextActions`：`waitForIdle` 与 RPC 相同；`newSession`、`fork`、`navigateTree`、`switchSession` 返回 `{cancelled:true}`，`reload`（返回 `void`）抛错；每次拒绝记 `engine.error{source:"adapter", message:"command action refused: <name>"}`（与设置写入被拦截同一写法）。整个 Run 中会话只由 Tower 自己替换或导航（`05` §5.3.1 末条），Run 开始时的静态清单确认、项目信任、来源自检与处理器顺序因此对整个 Run 成立。未采用“视为 Run 边界：drain 后暂停、下一次 Run 重做复核”：需要新的暂停原因或来源，拒绝更简单且更严。`00` §0.5.1 加一行；C14(b)；G46(bg)(2)。
- **R61-D13-01**：取“验收不完成”：M1 中（`branch_only`，以及从 `in_review` 选 `none`）闸口通过后**先** seal 并在用户仓库写分支，成功后才在**同一事务**记 `human.decision{accept}`、`goal.state_changed(→accepted)` 与 `integration.performed`（`none` 时同一事务再 `accepted→archived`）；seal 或写分支失败（前缀冲突、ref 锁、磁盘、仓库不可写等）时命令返回 `E_INTERNAL`（`detail` 写失败的步骤），不记决定，Goal 留在 `in_review`，验收面板显示原因与“重试”，重试复用已写的 seal 与分支（按步骤幂等，`06` §6.1.6 seal 行）；写入期间到达的该 Goal 的其他转移排在本命令的事务之后、按届时的状态处理，所以 `accepted` 与 `integration.performed` 之间不再有窗口。M1 中进入 `accepted` 时因此总有本次验收的 `integration.performed`。从 `accepted` 归档的守卫：最近一条 `integration.performed.branch` 不在用户仓库中时先以该条的 `sha` 重写同名分支，失败同样返回 `E_INTERNAL`、不归档。“已验收的改动总能从用户仓库取回”（ADR-188）因此在失败时仍成立。唯一定义 `06` §6.4.3 `goal.accept` 行；`03` `in_review` 行、`10` §10.2 前缀冲突与 §10.3.2 清理表、`04` §4.6.5 去向说明、`16` §16.1.12 `ProtoError.code` 同步。没有新增 Needs-You：失败发生在人正在操作的验收面板上。G46(bg)(3)。
- **R61-D15-01**：`prepare_failed` 的来源 `running`（ADR-188）补进 `16` §16.1.1 `Goal.pauseReason` 行与 §16.1.7 `stalled` 子类型行、`08` §8.6.5 `preparing` 行（“L2，Run 无法开始或已停止”）与 `06` F4b；`08` §8.4 去重键的理由改为“按 Goal 去重，与是否已有 `runId` 无关”。卡片文案：Run 中途被遮蔽时写 `◆ 运行已停止：扩展 <名字> 注册了与 Tower 工具同名的 <工具名>，请在 Pi 设置中禁用该扩展`，“重试”的说明写“开新的运行”（`04` §4.8.11、`12` §12.6.5）。G46(bg)(4)。
- **R61-D15-02**：`04` §4.6.1 评审模式线框底栏 `E 我来改（M2）` 改为 `E 我来改`（与 `16` §16.3 的 M1 一致；评审中就地编辑 hunk 才是 M2），线框宽度不变；`04` §4.6.7 人工编辑期间目标页顶部的 `[交还 ⌘↩]` 改为 `[交还]`——不在 `16` §16.3 为目标页登记 `⌘↩`，避免与转向输入框的“发送”争用。

**评审结论中的观察（R61 结论部分）**
- 观察 1：`07` §7.10.3 继续目标表 `review` 行写明：`not_machine_verified` 的原因取自该次验证——S0 拒绝后的重新验证命中阻断、再经覆盖进入时为 `s0_denied{by}`；S0 拒绝本身不改写继续目标。
- 观察 2：`11` §11.3.4 工具来源条记为已知窗口：Pi 在 `beforeToolCall` 之前取定要执行的工具（`packages/agent/src/agent-loop.ts:708-730`），同一回合内有扩展注册了覆盖内置名的工具时，这次执行的内置工具按 `tool.external` 判定，方向偏严。
- 观察 3：`12` §12.6.5 的 `◆` 规则注明两处例外：`provider_unavailable` 在重试耗尽前写 `◇`，`nested_repo_live` 的条目是 `sentinel`、以 `■` 表达。
- 观察 4：依赖补 M2 标记：`12` §12.6.5 wait `dependency` 行、`04` §4.3.1 概览与 §4.4.3 列表线框的“就绪 · 依赖 G-0150（M2）”（宽度不变）、`06` §6.4.3 `goal.add_dependency`/`goal.remove_dependency`。以 `04` §4.2.4 与 `14` §14.3.2 为准。
- 观察 5：`00` §0.5 “提供‘使用我安装的 pi’模式”补 M2。
- 观察 6：`04` §4.8.1 需要你线框的解释句改为“合同设为人不在时等待：问题不自动作答”，与 `08` §8.7.1 一致（“不会超时”只取决于 `unattended:"wait"`），宽度不变。
- 观察 7：`11` §11.3.4 codemode 条记为已知限制：任何工具的 `execute` 都有 `ctx.executeTool`（`core/extensions/types.ts:383-394`），已获批准的沙箱外工具可以嵌套调用 Tower 工具；后果限于一次不是由模型发起的 `log` 或 `submit`，提交之后仍由验证裁决，不越权。不加“父调用须为空或来自 codemode”的守卫：它不保护任何不变式。
- 观察 8：`05` C28a 注明 Run 中途注册的触发方式：测试扩展自己以 `sendUserMessage("/<命令>", {expandPromptTemplates:true})` 触发命令，或在 `turn_start` 处理器中注册；SDK 下 Tower 不提供斜杠命令入口。
- 观察 9：取舍判断，无改动。

**删除 / 推迟到 M2 / 收窄的说法**
- 删除：`11` §11.3.2 与 `16` 工具表的“（及 `powershell`）”；`running` 阶段“保留用户默认工具”；`04` 线框中评审 `E` 的“（M2）”与目标页的 `⌘↩` 提示。
- 收窄的说法：工具来源中“Pi 内置工具”收窄为“Tower 白名单中的 Pi 内置工具”；`08` §8.4 去重键的理由。
- 补标（不是新推迟）：依赖（M2）、“使用我安装的 pi”（M2）。
- 记为已知限制而不新增机制：gate 分类对象与实际执行的工具在同一回合内的覆盖注册（观察 2）；非 codemode 发起的嵌套 Tower 工具调用（观察 7）。
- 新增的只有：Host 骨架中的两个常量与 `excludeTools` 参数、`commandContextActions` 的定义（原已传入、未定义）、`goal.accept` 的一处顺序与一条归档守卫。没有新状态、事件、表、命令或决定种类；`E_INTERNAL` 是已有的错误码。
- `16` §16.1.13 补登第 61 轮被取代的说法供 (D) 检索。

- **lint**：(T) 再扩展：`05` §5.3.5 骨架的 `TOWER_BUILTINS` 与 `NON_TOWER_BUILTINS` 必须恰好划分 Pi v1.2.0 `allToolNames`（`PI_BUILTIN_TOOLS`），会话必须以 `excludeTools: NON_TOWER_BUILTINS` 创建；白名单之外的每个名字都在 `11` §11.3.4 工具来源条与 `16` §16.1.10 对应行中点名，白名单中除 `bash` 外的每个名字都在 `11` §11.3.4 以 `builtin:<name>` 点名；`05` §5.6.2 激活表中 `setActiveTools` 的字面量只能是白名单内置工具或 Tower 工具，每个阶段都显式写出内置工具；工具种类表新增“白名单之外的 Pi 内置工具”。新增 (H)（评审建议的 (H)）：`04` 线框中的按键提示（`[K 动作]` 与“K 动作 · …”底栏）的键必须在 `16` §16.3 登记，标 M2/M3 的提示须有该里程碑的行，只登记为 M2/M3 的键须带标记；视图与作用域的比对不实现（线框没有可机械读取的视图名）。(s) 扩展只实现窄形式：`prepare_failed` 的运行期来源在其六处定义（`02`、`03` §3.2.1、`16` 两行、`08` §8.6.5、`06` F4b）都出现；评审建议的一般形式（`02`/`03`/`16` 的来源状态集合相同）不实现：`02` 与 `16` 只对少数原因以自然语言写出来源状态。全部检查：`--checks rstuvwxyzckdnSeRqpoPiDgKYATFMBOJCH`。
- **排期**：+0.04 人周（W6 +0.02 → Agent；W7 SP6b +0.01 → Agent；W15 +0.01 → 桌面；W10 的门禁规则与文字类不足 0.01，计 0；系统线 0）；`14` §14.3.4 与 ADR-133 第 61 轮补记一致：WBS 122.69，余量 系统 0.12、Agent 0.26、桌面 0.48、设计 0.94、安全 0.24，依赖链 19.91，增 1 人 128.58 / T 23.74 / 33 周，M1 维持 38 周。

## 第 62 轮对抗评审（全范围）后的跨文档决策（ADR-190）

## ADR-190 `builtin:` 来源允许表、RPC 下 Run 中途会话改变的规则、M1 验收写后窗口的复用与验收延续先写分支 — Accepted（R62 全部条目与评审结论中的观察；Amends ADR-189；Amended by ADR-191、ADR-192、ADR-220）

选择原则（收敛规则，同 ADR-186/187/188/189）：只用三种办法关闭条目——(1) 把说法改弱但为真；(2) 删除或推迟不属于 M1 主循环的机制；(3) 在已有的唯一定义处加至多一条守卫、一行或一个字段。不新增状态、事件、表、命令或决定种类。安全不变式全部保持；拿不准时取更严格的行为。安全问题只写到设计层面。

**条目（R62 追问清单）**
- **R62-D5-01**：Pi v1.2.0 核实：内置工具在注册表中的来源是 `{path:"builtin:<工具名>", source:"builtin"}`（`core/agent-session.ts:3544`、`:3578-3580`）；Host 经 `extensionFactories` 提供的 `builtin: true` 条目按名字存入（`core/resource-loader.ts:382`），以路径 `builtin:<扩展名>` 加载（`:727-740`），扩展的来源即该路径、`source` 同为 `"builtin"`（`core/extensions/loader.ts:595-602`，`core/source-info.ts:21-22`），扩展注册的工具取扩展的来源（`loader.ts:296-299`）。所以 `codemode`（`extensions/codemode/tool.ts:39`）的来源是 `builtin:codemode`，`tool_search`（`extensions/tool-search/tool.ts:20`）是 `builtin:tool-search`，MCP 工具与资源工具（`extensions/mcp/index.ts:444, 488`）是 `builtin:mcp`；只看前缀或 `source` 无法区分。`11` §11.3.4 工具来源条（唯一定义）改为**允许表**：`builtin:` 来源中只有 `TOWER_BUILTINS` 各名字的 `builtin:<工具名>` 与 `05` §5.3.5 `extensionFactories` 中 `builtin: true` 条目的路径 `builtin:codemode`、`builtin:tool-search`、`builtin:mcp` 按各自的规则与 `16` §16.1.10 工具表中已有的类别判定；其余来源以 `builtin:` 开头的工具才是“白名单之外的 Pi 内置工具”，硬底线 forbid（方向不变）。`05` §5.6.5 第 3 步、`16` §16.1.10 对应行引用同一界定。C28a 对照组只统计来源以 `builtin:` 开头、且不是三个扩展路径的名字；同时注明各断言在 Tower 自己的 `newSession` 与 `fork` 之后同样成立（观察 6）。lint (T) 再扩展。
- **R62-D5-02**：Pi v1.2.0 核实：RPC 模式把命令上下文动作接到 `runtimeHost.newSession`/`fork`/`switchSession`、`session.navigateTree` 与 `session.reload()`（`modes/rpc/rpc-mode.ts:317-350`），Tower 无法替换；`session_start` 带 `reason ∈ startup/reload/new/resume/fork`（`core/extensions/types.ts:755-761`），树导航发出 `session_tree`（`:855`）。ADR-189 的拒绝**只在 SDK（M1）成立**。M2 规则写在 `05` §5.4.5 末段：Tower 自己的会话命令（`new_session`/`switch_session`/`fork`/`clone`、`/tower-fork`、`/tower-nav`）只在 Run 之间发出，Run 中从不发出，也从不请求重载；tower-goal 在 `session_start` 已有的 `tower.selfcheck` 中带上 `reason`，`session_tree` 同样写一条；Run 进行中收到这类条目，或任何一次 `get_state` 的 `sessionFile` 与本 Run 记录的不同，按 Run 中途 Tower 工具被遮蔽的同一出口 drain 后进入 `paused(prepare_failed)`（来源 `running`），下一次 Run 开始时重做全部复核。不用令牌：Tower 的命令都不在 Run 中，Run 中观测到的任何会话改变都不是 Tower 发起的。`prepare_failed` 的六处定义各补“RPC（M2）下 Run 中途的会话改变同样”。`00` §0.5.1 该行改为 M1（SDK）中拒绝、M2 中照常执行但运行中途发生时暂停；`05` §5.3.1 末条加 SDK 限定。未采用静态清单扫描 `ctx.reload` 等调用后禁用 RPC：只靠文本匹配，也挡不住其他扩展以命令触发 `/tower-fork`。（第 63 轮注：本条的 M2 判别规则照字面会把 Tower 自己的会话事件判为外来，已由 ADR-191 删除，改为 M2 的设计要求：保持 `05` §5.3.5 的会话不变式，检测机制在 M2 设计。）
- **R62-D13-01**：(a) **写后窗口**：`06` §6.4.3 `goal.accept` 行（唯一定义）：分支已写而事务未提交（崩溃或数据库写入失败）时不回退分支，Goal 仍在 `in_review`、没有决定；重试与之后的每次验收先按 `10` §10.6 重新 seal 表新增的一行“未提交的写入”判定：影子中本 Goal 最近的 seal 没有对应的 `integration.performed`，且 B₀ 或某个 B₀-v<k> 的顶端等于它 → 该分支记为 W；W 顶端的 seal 与本次要生成的 seal 树与说明都相同（同一 pin、同一结论）时复用（不新建 seal、不写入用户仓库，事务记 `branch = W`），否则以 W 为 B、其顶端为 P 快进。这一行先于其他各行判定，所以不会另开 `-v<k>`，也不会出现不真实的“你的分支已有你的提交”。首次 seal 同样先判定这一行；B₀ 已存在而不是 W 时按命名规则写 B₀-v<k>，不再因非快进而反复失败。`06` §6.1.6 增 M1 行：启动时不检查、不删除也不改写已写的分支，由下一次验收复用；该节末段的“M2 生效”限定为合并队列与 `integrating` 的规则。(b) **验收延续**：取“延续也先写分支”（复用同一步骤），不取改弱：M1 中验收延续回到 `accepted` 前先按 `10` §10.6 重新 seal 表写分支（不记人的决定），成功后在同一事务记转移与 `integration.performed`；重新 seal 表落在另开 `-v<k>` 的行（撤销后，或 B 的顶端 ≠ P，需要在验收面板说明），或写入失败时不延续、进入 `in_review`。ADR-189 的不变式改为“M1 中经 `goal.accept` 或验收延续进入 `accepted` 时，总有一条树等于该次 pin 的树的 `integration.performed`”，从 `accepted` 归档的守卫因此不变，ADR-188 的“已验收的改动总能从用户仓库取回”在延续之后也成立。`07` §7.10.3 延续注释加一行指针。(c) 相邻：`04` §4.6.5 前缀冲突时另有 `[修改分支前缀]`；目标页 `归档（不合并）` 失败时目标页顶部显示同一行与 `[重试]`；`03` `accepted` 行的“分支写入的同一事务”改为“记 `integration.performed` 的同一事务”。G46(bg)(3) 补两组：写分支后、事务提交前终止 Supervisor，重启后先返工再验收；M1 中从 `accepted` 经交还触发验收延续，再归档。（第 63 轮注：“未提交的写入”一行只认最近的 seal、按现算的名字找分支，两次失败或改名后认不出 Tower 写过的分支，“不会另开 `-v<k>`、不会出现不真实的说明”在这些序列下不成立；该行与“B 的顶端 == P”一行已由 ADR-191 的按 sha 识别规则取代，承诺按 ADR-191 成立。）

**评审结论中的观察（R62 结论部分）**
- 观察 1：`08` §8.6.5 `preparing` 行、`06` F4b、`04` §4.8.11 的重试说明各加“运行中途停止的一种写‘开新的运行’”，与 `12` §12.6.5 一致。
- 观察 2：`04` §4.6.5 写分支失败行改用 `■ 未能在你的仓库创建分支：<原因>`（`12` §12.6.2 `■` 规则：异常与阻断、验收阻止项；不是 Needs-You，不用 `◆`）；`12` §12.12 `AcceptPanel` 行补这一状态。
- 观察 3：`04` §4.16 F7 第 4 步改为先 seal 并写分支、成功后才进入 `accepted`，删去“之前该分支不存在”；`03` §3.4.4 记录 accept 一句补顺序并引用 `06` §6.4.3。
- 观察 4：`05` §5.5 事件映射表补一行：Host 进程中未处理的 Promise 拒绝记 `engine.error{source:"adapter"}`，不终止 Host（不含未捕获的同步异常）。
- 观察 5：`00` §0.5.1 白名单一行补“用户扩展注册的同名工具同样不可用：Pi 按名字移除”（`core/agent-session.ts:3536`）。
- 观察 6：`05` §5.3.5 骨架注释：Tower 替换 runtime 后随新的 `runtime.session` 重建 `commandContextActions` 再绑定（同 `rpc-mode.ts:317-318`）；C28a 的 `powershell` 断言覆盖 `newSession` 与 `fork` 之后的会话。
- 观察 7：`05` §5.3.1：SDK 下 `opening.human` 以 `expandPromptTemplates:false` 发送（`core/agent-session.ts:316, 2058-2069`），以 `/` 开头的目标描述原样进入会话；只有 `/tower-inject` 按默认值分派。
- 观察 8：不改。`16` §16.3 已区分 `T`（诊断视图）与 `⌘⇧T`（我来改）。
- 观察 9：取舍判断，无改动。

**删除 / 推迟到 M2 / 收窄的说法**
- 收窄的说法：“白名单之外的 Pi 内置工具”由“来源为 `builtin:<name>`、名字不在白名单中”收窄为“来源以 `builtin:` 开头、不在允许表中”；`00` §0.5.1 的命令动作一行限定为 M1（SDK）；ADR-189 的 `accepted` 不变式限定为经 `goal.accept` 或验收延续进入时（并以延续先写分支使之成立）；`06` §6.1.6 末段的“M2 生效”限定为合并队列与 `integrating` 的规则。
- 补标（不是新推迟）：RPC 下 Run 中途的会话改变（M2）。
- 新增的只有：`11` §11.3.4 的一张允许表（取代原界定）、`10` §10.6 重新 seal 表的一行、`06` §6.1.6 的一行、`goal.accept` 行的一处顺序（延续先写分支）、`05` §5.4.5 的一段 M2 规则（`tower.selfcheck` 带 `reason` 是已有条目上的一个字段）、`05` §5.5 的一行映射与 §5.3.1 的一个参数。没有新状态、事件、表、命令或决定种类；`prepare_failed`、`E_INTERNAL`、`engine.error` 都是已有的。
- `16` §16.1.13 补登第 62 轮被取代的说法供 (D) 检索。

- **lint**：(T) 再扩展（评审建议的 (T)）：`05` §5.3.5 `extensionFactories` 中每个 `builtin: true` 条目的路径 `builtin:<name>` 都必须在 `11` §11.3.4 工具来源条、`05` §5.6.5 第 3 步“白名单之外的 Pi 内置工具”一条与 `16` §16.1.10 对应行中点名（`BUILTIN_EXTENSION_SOURCE_UNNAMED`）。评审建议的 (z′) 扩展不实现：`00` §0.5.1 的哪些行依赖 SDK 骨架无法机械判定；R62-D5-02 已在正文关闭。全部检查：`--checks rstuvwxyzckdnSeRqpoPiDgKYATFMBOJCH`。
- **排期**：+0.01 人周（W15 +0.01 → 桌面；W6、W7 SP6b、W10 的条目与文字类不足 0.01，计 0；R62-D5-02 属 M2；系统线 0）；`14` §14.3.4 与 ADR-133 第 62 轮补记一致：WBS 122.70，余量 系统 0.12、Agent 0.26、桌面 0.47、设计 0.94、安全 0.24，依赖链 19.91，增 1 人 128.59 / T 23.74 / 33 周，M1 维持 38 周。

## 第 63 轮对抗评审（全范围）后的跨文档决策（ADR-191）

## ADR-191 Tower 自己的 seal 按 sha 识别、M2 RPC 会话不变式改为设计要求、评审积压阻止模式标为 M2 — Accepted（R63 全部条目与评审结论中的观察；Amends ADR-190；Amended by ADR-192、ADR-193）

选择原则（收敛规则，同 ADR-186/187/188/189/190）：只用三种办法关闭条目——(1) 把说法改弱但为真；(2) 删除或推迟不属于 M1 主循环的机制；(3) 在已有的唯一定义处加至多一条守卫、一行或一个字段。本轮两条是上一轮新机制的边界情况，**以简化关闭、不加分支**。不新增状态、事件、表、命令或决定种类。安全不变式全部保持；拿不准时取更严格的行为。安全问题只写到设计层面。

**条目（R63 追问清单）**
- **R63-D13-01**：`10` §10.6 重新 seal 表的“未提交的写入”一行（只认影子中**最近的** seal、按现算的名字找分支）与“B 的顶端 == P”一行合为**一条识别规则**（唯一定义在 `10` §10.6）：**Tower 自己的 seal** = sha 是影子中本 Goal 的某个 `refs/tower/<goalId>/seal/<n>`。这些提交都带 `Tower-Goal: <goalId>` trailer，但只带 trailer 不算：用户 amend 或 cherry-pick 后的提交仍带它，若据此快进，新 seal 会在用户的提交之上撤掉用户的改动，所以按用户的提交处理。**B** = 用户仓库中名字最后一段为 `<goalId>` 或以 `<goalId>-` 开头（Tower 为本 Goal 生成的名字，任何前缀与标题）、顶端是 Tower 自己的 seal 的分支，有多条时取 seal 编号最大的一条；没有时取最近一条 `integration.performed` 的 `branch`，仍没有（首次）时为 B₀。只按 Tower 生成的名字查找，不会把人已快进合入了 seal 的 `main` 等分支当作 B。各行：被撤销的 seal 曾写入 B → `B₀-v<k>`（不变）；B 不存在 → 重写（不变）；**B 的顶端是 Tower 自己的 seal（P）** → P 的树与说明都与本次相同时**复用 P**（不新建 seal、不写入，事务记 `branch = B`、`sha = P`；同一 pin 的验收延续因此不再追加树不变的提交），否则快进；CAS 失败时重读 B：仍等于 P（ref 锁等瞬时失败）→ 写入失败、`E_INTERNAL`，重试时按本表重新判定；已不等于 P → 立即重新判定一次；**B 的顶端不是 Tower 自己的 seal** → `B₀-v<k>` 与“你的分支 <B> 已有你的提交”（不变；只在本行显示，所以这句话总是真的）。中途失败、未记账的写入、两次验收之间改前缀或标题、同树延续，都由同一规则处理。`06` §6.4.3 `goal.accept` 写后窗口一句改为引用这条规则（观察 4 的“pin 与结论未变”同时改为“树与说明都相同”）；验收延续一句补“Goal 在 `verifying`，其间到达的转移与写后窗口同上”；`06` §6.1.6 M1 行覆盖验收延续（Goal 在 `verifying`，按 `verifying` 行以同一 pin 重跑后由识别规则复用）。G46(bg)(3) 补第五至七组：返工后第二次验收遇到 ref 锁再重试；`accepted` 中同一 pin 重新验证并延续；重启后改前缀再验收，以及 amend 过 Tower 汇总提交的一组。
- **R63-D5-01**（M2）：删除 ADR-190 写在 `05` §5.4.5 末段的 M2 判别规则（`tower.selfcheck` 带 `reason`、`session_tree` 条目、`get_state.sessionFile` 比对，以及“Run 进行中收到这样的条目”的条件）与 `prepare_failed` 六处定义中的 M2 来源注记（`02` §2.4、`03` §3.2.1、`06` F4b、`08` §8.6.5、`16` 两行）。代之以一句 M2 设计要求：**M2 的 RPC 模式必须保持 `05` §5.3.5 的会话不变式——Run 进行中会话不被重载或替换；检测机制是 M2 的设计任务**。`00` §0.5.1 该行、`05` §5.3.1 的指针同步改弱。M1（SDK）的拒绝不变。
- **R63-D15-01**：评审积压的阻止模式（`review_capacity` 等待、`[⇧↩ 越过一次]`、`capacity.override` / `HumanDecision{override_capacity}`、`backlog` 条目的阻止模式条件）整体属 **M2（E8）**，与 `04` §4.2.4 里程碑表、`16` §16.3、`14` E8 与 W13 一致。M1 表面补标记：`04` §4.15 设置树（“提示模式，阻止模式在 M2（E8）”）、`04` §4.4.4 表头与就绪卡片格、`04` §4.3.3 标题栏一句；`12` §12.6.5 `wait review_capacity` 行与 §12.10.5 积压指示；`06` §6.2.4 准入的阻止模式两行、§6.4.3 `capacity.override` 行；`08` §8.5.5 三行与选项；`16` `waitReason`、`backlog` 条件与远程矩阵行；`02` 两处注释。M1 实现者不交付阻止模式；W13、W17 不变。lint (z′) 按评审 §3.1 扩展。

**评审结论中的观察（R63 结论部分）**
- 观察 1：`05` §5.4.4 `start` 行补 M2 已知限制：RPC 的 `prompt`/`steer`/`follow_up` 没有 `expandPromptTemplates` 选项（`rpc-types.ts:22-24`），以 `/` 开头的人写文字会被分派或展开；避免方式是 M2 的设计任务。
- 观察 2：`10` §10.12 `integrated` 唯一条件中写明“最近一次验收的 seal”即最近一条 `integration.performed` 的 `sha`（含 M1 验收延续写入的）；“仅保留分支”行的快进条件改为“顶端仍是 Tower 自己的 seal”。
- 观察 3：`10` §10.12 撤销一句与 `16` `Goal.integrationRevertedSeal` 行把“重新 seal 表首行”改为按行名引用（“被撤销的 seal 曾写入 B”一行），`B-v<k>` 改为 `B₀-v<k>`。
- 观察 4：并入 R63-D13-01（`06` §6.4.3 的复述改为引用 `10` §10.6，条件是“树与说明都相同”）。
- 观察 5：`07` §7.6.1 越界哨兵的去重键改为 `s:{goalId}:out_of_scope`（`08` §8.4 `s:{goal}:{detector}` 的一例）；`08` §8.4 去重表补 `stalled{satellite_missing}` 一行，键 `st:{goalId}:satellite`（按 Goal，重建失败可以发生在没有 Run 的状态）；`08` §8.6.5 与 `16` §16.1.7 的 `pauseReason` → kind 行引用它。
- 观察 6：`16` §16.3 补两行 `↩`：目标页（执行顶部“等你”一行的主动作）与托盘弹窗（执行所选条目的主动作）；`Y` / `⇧Y` 的作用域把“记忆”标为 M2（`09` §9.0.1）。
- 观察 7：`13` §13.1 补“诊断视图：接管 → 首屏 p95 ≤ 300 ms（诊断包已预计算）”，§13.12.2 补场景 P9；`08` §8.13.3、`16` §16.2.4 对应行引用它。`05` §5.6.5 的 p99 ≤ 15 ms 写明是本节补充（`11` §11.4 只定 p95）；`11` §11.4 骨架注释改为“内存查表（不启动 git 子进程）”，与“判定开销”一条一致。
- 观察 8：`04` §4.18.3 验证环境故障卡片改为第 2 行 `◆ 已暂停 · 验证环境故障`，与 `12` §12.6.5 一致。
- 观察 9：`04` §4.6.5 补验收延续的文案：成功时 `◇ 已更新本地分支 <分支>；如果你已推送过它，远端不会自动更新`；另开 `-v<n>` 或写入失败而回到待验收时分别显示已有的 `◇` 一行或 `■ 未能在你的仓库创建分支：<原因>`；`12` §12.12 `AcceptPanel` 同步。`06` §6.4.3：M1 验收写分支失败时 `E_INTERNAL` 的 `detail` 为 `{step, reason}`，`step` ∈ `prefix_conflict` · `seal` · `write_branch` · `commit`，`[修改分支前缀]` 按 `prefix_conflict` 显示。
- 观察 10：取舍判断，无改动。

**简化 / 删除**
- 删除：`10` §10.6 的“未提交的写入”一行（与“B 的顶端 == P”一行合并为一条识别规则，表少一行）；`05` §5.4.5 的 M2 判别规则（`tower.selfcheck{reason}`、`session_tree` 条目、`sessionFile` 比对与 drain 出口）；`prepare_failed` 六处定义中的 M2 来源注记。
- 改弱为真：`00` §0.5.1 的 M2 一句、`05` §5.3.1 的指针改为“M2 须保持同一不变式，检测方式是 M2 的设计任务”。
- 补标（不是新推迟）：评审积压阻止模式（M2，E8）；RPC 人写文字的命令分派（M2 已知限制）。
- 新增的只有：`10` §10.6 识别规则一句（取代两行）、CAS 失败后重读 B 一句、`08` §8.4 一行去重登记、`16` §16.3 两行键位登记、`13` 一行预算与一个 CI 场景、`E_INTERNAL.detail` 的一个步骤码。没有新状态、事件、表、命令或决定种类；`E_INTERNAL`、`integration.performed`、`Tower-Goal` trailer 都是已有的。
- `16` §16.1.13 补登第 63 轮被取代的说法 4 行供 (D) 检索；lint `DELETED` 增两项（“未提交的写入”一行的措辞、M2 RPC 检测细节；带 M2 标记的提及允许）。

- **lint**：(z′) 扩展（评审建议）：`04` §4.4.4、§4.15，`12` §12.6.5，`06` §6.2.4、§6.4.3 中提到阻止模式、`越过一次`、`capacity.override`、`override_capacity`、`review_capacity` 的每一行都须带 M2 / M3 标记（表格行在整行内，其他行在前 80 / 后 40 字符内；`Z3_SECTIONS`、`Z3_PHRASES`）。评审建议的 (H) 作用域扩展不实现：线框所在的作用域需要按线框标题人工映射，无法可靠地机械判定；观察 6 已在 `16` §16.3 补登。全部检查：`--checks rstuvwxyzckdnSeRqpoPiDgKYATFMBOJCH`。
- **排期**：0 人周（W15 的识别规则取代两行，不增；G46、P9、登记与文案类不足 0.01，计 0；R63-D5-01 删除 M2 规则、R63-D15-01 只改标记，不进 M1 的 WBS；系统线 0）；`14` §14.3.4 与 ADR-133 第 63 轮补记一致：WBS 122.70，余量 系统 0.12、Agent 0.26、桌面 0.47、设计 0.94、安全 0.24，依赖链 19.91，增 1 人 128.59 / T 23.74 / 33 周，M1 维持 38 周。

## 第 64 轮对抗评审（全范围）后的跨文档决策（ADR-192）

## ADR-192 签名下的 seal 识别、被检出分支的守卫、删除分支的条件 — Accepted（R64 全部条目与评审结论中的观察；Amends ADR-190/191；Amended by ADR-193）

选择原则（收敛规则，同 ADR-186/187/188/189/190/191）：只用三种办法关闭条目——(1) 把说法改弱但为真；(2) 删除或推迟不属于 M1 主循环的机制；(3) 在已有的唯一定义处加至多一条守卫、一行或一个字段。本轮三条都出在 Tower 改动用户仓库中 Goal 分支的那一步，各在 `10` 的唯一定义处以一句规则、一条守卫或一个删除条件关闭。不新增状态、事件、表或决定种类；新增的只有 `goal.accept` 的一个可选字段与 `E_INTERNAL.detail.step` 的一个取值。“绝不碰用户的工作现场”与全部安全不变式保持；拿不准时取对用户仓库更保守的行为。安全问题只写到设计层面。

**条目（R64 追问清单）**
- **R64-D13-01**：不取评审建议的“把签名提交写回影子作为 seal”（会使影子中的 seal 与其签名前的形态脱节，并新增一次写回）；取**不增状态的识别规则**：签名在用户仓库上下文进行（`10` §10.6“签名”一段，唯一定义；`10` L656 原写“重做”，影子上下文只允许执行 git，签不了名）——以影子中的 S 为模板，用 S 的树、父提交、作者与提交者（含日期，经 `GIT_AUTHOR_*` / `GIT_COMMITTER_*`）和说明执行 `git commit-tree -S` 得到 S′，S′ 去掉签名头（`gpgsig`、`gpgsig-sha256`）后必须与 S 逐字节相同（git 校验签名时针对的正是这部分），不同则不写入、`E_INTERNAL{step:"seal"}`。**识别规则**（`10` §10.6）改为：去掉签名头后与影子中本 Goal 的某个 seal 逐字节相同的提交即 Tower 自己的 seal（即去掉签名后重新哈希得到该 seal 的 sha；不签名时就是 sha 相同）。写入：首次 seal 以 `update-ref <B₀> S′ ""` 代替 fetch，快进为 `update-ref B S′ P`；P 是签名提交时先以镜像上下文做 §10.3.1 的本地 fetch，影子经 alternates 可见。**sha 的口径**：`integration.performed.sha` 记写进用户分支的 sha（签名时 S′，否则 S，复用时 P）；`10` §10.12 的 `integrated` 观测（`merge-base --is-ancestor <该 sha> <base>`，squash 以 patch-id）、`goals.integration_reverted_seal` 与 M2 推送都用它；`06` §6.4.3 归档前重写在对象已被回收时以对应的影子 seal 重新签名写入。`10` §10.18 事件表、`06` §6.1.6 M1 行与 §6.4.3 写后窗口、`16` §16.1.13 ADR-191 行同步。G40 补 (g)，G46(bg)(3) 补第八组。
- **R64-D13-02**：`10` §10.6 新增**检出守卫**（唯一定义）：Tower 在用户仓库中写入、快进或删除任何分支之前（首次 seal 与重新 seal 表各行的写入、验收延续、从 `accepted` 归档前的重写、归档删除、清理），先读 `git worktree list --porcelain`；该分支是主检出或任一链接工作树的当前分支时不动它。`goal.accept` 返回 `E_INTERNAL{step:"branch_checked_out"}`、不记决定，面板如实写“分支 <B> 正在 <路径> 中被检出，Tower 未改动它”，出路为在该检出中切换后重试，或由人确认 `goal.accept{newBranch:true}` 写入 `B₀-v<k>`（不显示“已有你的提交”）；验收延续不延续、进入 `in_review`；删除跳过并列出。复用一行不写入，不受守卫影响。`10` §10.12 本地合并（M2）的检查注明与守卫同一判定。`06` §6.4.3、`04` §4.6.5、`12` §12.12 `AcceptPanel` 引用；G46(bg)(3) 补第九组（主检出与链接工作树各一次）。
- **R64-D13-03**：`10` §10.3.2 归档删除写出**删除条件**（唯一定义）：对本 Goal 写过的每条分支（`integration.performed.branch` 的各个取值，含改前缀之前的名字），只在顶端是 Tower 自己的 seal（签名版识别规则）、顶端已在 base 中（squash 时为被判定合入的 seal，patch-id）且未被检出时，以 `update-ref -d <分支> <顶端>` 删除；其余保留并在 Goal 页列出原因。`abandoned` 行写明分支一律保留。`10` §10.6.2 “清理 Tower 引用”：只删 `refs/tower/<goalId>/*` 地标与由 `integrated` 归档的 Goal 中满足同一条件的分支，**不删** `refs/tower/_owner`，已放弃、“仅保留分支”与进行中的 Goal 分支一律不删，结果列出未删除的分支与原因；说明改为为真的一句。`04` §4.15 设置树的“数据”一节加入“存储：清理工作目录 · 清理 Tower 引用”（取代“清理审计地标引用”一项），`10` 的位置改为“设置页 → 数据 → 存储”；`10` §10.6.2 表格行同步。G46(bg)(3) 补第十组。

**评审结论中的观察（R64 结论部分）**
- 观察 1：Pi v1.2.0 核实：`core/agent-session.ts:2198-2225` 的 `_queueUserInput` 中，`steer` / `follow_up` 收到以 `/` 开头且是扩展命令的文字时抛错（`:2204-2205`、`_throwIfExtensionCommand` `:2293-2302`：“cannot be queued”），技能命令与提示模板照常展开；`modes/rpc/rpc-mode.ts:416-424` 的 `steer` / `follow_up` 直接调用它们。`05` §5.4.4 `start` 行的 M2 已知限制改为按命令区分。
- 观察 2：`16` §16.1.13 ADR-191 行的新说法改为逐字引用 `10` §10.6（“为 `<goalId>` 或以 `<goalId>-` 开头”），并补签名一句。
- 观察 3：`10` §10.6 识别规则的查找范围写明只查用户仓库 `refs/heads/*`、不含远端跟踪引用；并列规则：同一个 seal 有多条分支时优先最近一条 `integration.performed` 的 `branch`。
- 观察 4：`04` §4.6.5 线框“改写到”改为“写入”。
- 观察 5：不改编号：SP6c 用例表占用 P1–P39，`13` §13.12.2 的任何 P 编号都会与之同号，P1–P8 早已同号（ADR-186 的说明）。`14` §14.3.5 性能行的说明改为“`13` §13.12.2 的 P1–P9 与 SP6c 用例表的 P 编号是两套编号，同号不同义，引用时注明所在表”；lint (M) 增一项：`13` §13.12.2 中与 SP6c 同号的最大编号必须被这句说明覆盖（`P_NUMBER_CLASH_UNNOTED`）。
- 观察 6：`08` §8.5.5 `backlog` 条目文字改为“评审积压：900 LOC 待审”，阻止模式（M2）下另加“，2 个 Goal 在等开始”。
- 观察 7：`10` §10.6 只取对象的 fetch 加 `--no-write-fetch-head`，签名一段同样使用。
- 观察 8：`10` §10.12 revert 草案分支改为 `<prefix>/revert-<goalId>`（项目前缀；不在识别规则的查找模式内，不与 B₀ 重名；已存在时加 `-<k>`），写入失败返回 `E_INTERNAL`、不撤销；`06` §6.4.3 `goal.undo_integrate` 行与 `16` §16.1.12 分支行同步。
- 观察 9：不把 `integration.performed.sha` 并入识别规则（会使“取 seal 编号最大的一条”失去编号）；登记为 `10` §10.16.3 的已知限制：影子在 seal 写入之后、进入 `accepted` 的那次 bundle 完成之前被删除并从更早的 bundle 恢复时，下一次重新 seal 另开 `B₀-v<k>`（方向安全），“已有你的提交”此时不真实；`10` §10.6 那句说明由“总是真的”改为“为真（唯一例外见 §10.16.3）”。
- 观察 10：取舍判断，无改动。

**简化 / 收窄**
- 改弱为真：`10` §10.6 “总是真的”；“清理 Tower 引用”的损失说明；`05` RPC 人写文字一句按命令区分。
- 新增的只有：`10` §10.6 识别规则的一处措辞与“签名”一段、检出守卫一段、§10.3.2 删除条件一句、§10.16.3 一条已知限制；`goal.accept` 的可选字段 `newBranch`；`E_INTERNAL.detail.step` 的取值 `branch_checked_out`；`04` 设置树一项（取代一项）。没有新状态、事件、表或决定种类；`integration.performed`、`E_INTERNAL`、`audit.user_refs_cleaned` 都是已有的。
- `16` §16.1.13 补登第 64 轮被取代的说法 4 行供 (D) 检索。

- **lint**：(M) 增 P 编号重名一项（评审 §3.1 建议）。其余新条目是规则组合与守卫缺失，没有可机械比对的锚点，不新增检查。全部检查：`--checks rstuvwxyzckdnSeRqpoPiDgKYATFMBOJCH`。
- **排期**：+0.04 人周（W15 +0.04 → 桌面：签名与识别 0.02、检出守卫 0.01、删除条件 0.01；G40/G46 组、W17 设置项与文案类不足 0.01，计 0；系统线 0）；`14` §14.3.4 与 ADR-133 第 64 轮补记一致：WBS 122.74，余量 系统 0.12、Agent 0.26、桌面 0.42、设计 0.94、安全 0.24，依赖链 19.91，增 1 人 128.64 / T 23.75 / 33 周，M1 维持 38 周。

## 第 65 轮对抗评审（全范围）后的跨文档决策（ADR-193）

## ADR-193 M1 缩小 Tower 写用户仓库的范围：不签名、撤销不写仓库、进行中操作守卫 — Accepted（R65 全部条目与评审结论中的观察；Amends ADR-191/192；Amended by ADR-194）

选择原则（收敛规则，同 ADR-186/187/188/189/190/191/192）：只用三种办法关闭条目——(1) 把说法改弱但为真；(2) 删除或推迟不属于 M1 主循环的机制；(3) 在已有的唯一定义处加至多一条守卫、一行或一个字段。第 62–65 轮的条目都出在 Tower 写用户仓库的那一步，每补一条规则又带出新的边界。本轮不再逐条补规则，而是**缩小 M1 中 Tower 写用户仓库的范围**：签名与撤销草案推迟到 M2，再以一条整体守卫避开用户进行中的 git 操作。不新增状态、事件、表、命令或决定种类；新增的只有 `E_INTERNAL.detail.step` 的取值 `repo_busy`。“绝不碰用户的工作现场”与全部安全不变式保持；拿不准时取对用户仓库更保守的行为。安全问题只写到设计层面。

**条目（R65 追问清单）**
- **R65-D13-02**（签名的等待、失败与锁）：不补锁、时限与提示，**整段推迟到 M2**。M1 中 Tower 从不调用用户的签名程序，写进用户分支的就是影子中的 seal S（`10` §10.6“签名”一段，唯一定义；取代 ADR-192 的签名一段）。识别规则回到 ADR-191 的“sha 是影子中本 Goal 的某个 seal”；`integration.performed.sha` 记该 seal 的 sha（复用时为 P），`integrated` 观测、`goals.integration_reverted_seal` 与 M2 推送都用它。用户仓库上下文中 `commit.gpgSign` 为真时照常写入不签名的 seal，验收面板如实写“Tower 写入的提交未签名；需要签名的提交请在合并前自行签名”（`04` §4.6.5、`12` §12.12 `AcceptPanel`）；用户自行签名会改写该提交，之后的重新 seal 按“B 的顶端不是 Tower 自己的 seal”另开 `B₀-v<k>`。这是 M1 的已知限制，登记在 `10` L10、§10.6 与 `00` §0.5.1。随之删除：S′ 的生成与校验、“去掉签名头后逐字节相同”的识别扩展、P 为签名提交时的镜像本地 fetch、归档前重写时的重新签名、`step = seal` 中因签名不一致的一支（`seal` 现在只指影子中生成 seal 失败）。`06` §6.1.6 M1 行、§6.4.3 `goal.accept` 行与 GitService 行，`10` §10.12、§10.18，`16` §16.1.13 ADR-191/192 两行的新说法，`14` G40(g)、G46(bg)(3) 第八组（改为“配置 `commit.gpgSign` 时写入不签名的 seal 并显示说明”）与 K12 同步。
- **R65-D13-03**（撤销草案不在写入规则内）：**在用户仓库生成撤销草案推迟到 M2**。M1 中 `goal.undo_integrate` 只在同一事务记 `integrated → accepted` 与 `goals.integration_reverted_seal`，不生成撤销提交、不写任何分支，因此撤销不会因写入失败；Goal 页如实写出要由人完成的撤销（`10` §10.12，唯一定义）：“Tower 没有改动你的仓库。请在你的检出中撤销 <seal 短 sha> 的合入：快进合入时 `git revert <seal>`；以合并提交合入时对该合并提交 `git revert -m 1`；squash 合入时撤销对应的 squash 提交”。`undo_integrate` 本身不依赖撤销分支，所以这是最简单的 M1 行为。`10` L10 与 §10.6.2 的写入列举、`03` §3.2 与 §3.4.4、`06` §6.4.3 `goal.undo_integrate` 行、`16` §16.1.12 分支行、`10` §10.13 部分集成的选项（标 M2）、`14` G40(e)(f)（人自行 revert）同步。
- **R65-D13-01**（守卫漏掉进行中的 rebase / bisect）：不按“目标分支”逐个对齐 git 的判定，取更简单、更保守的**进行中操作守卫**（`10` §10.6，唯一定义，紧接检出守卫；§10.3.2、§10.6.2、`06` §6.4.3、`04` §4.6.5 引用）：同一组写入与删除之前，对 `git worktree list --porcelain` 列出的每个工作树读其 gitdir（主工作树为 `commonDir`，链接工作树为 `<commonDir>/worktrees/<名>/`）中 git 的标准状态文件 `rebase-merge/`、`rebase-apply/`（含 `am`）、`MERGE_HEAD`、`CHERRY_PICK_HEAD`、`REVERT_HEAD`、`sequencer/`、`BISECT_START`；任一存在时这一次不在用户仓库中写入或删除任何东西。`goal.accept`（含 `newBranch:true`）与从 `accepted` 归档前的重写返回 `E_INTERNAL{step:"repo_busy"}`、不记决定，面板写“你的仓库在 <路径> 中有进行中的 <操作>，Tower 这次没有写入；完成或中止后重试”与 `[重试]`；验收延续不延续、进入 `in_review`；删除全部跳过并列出原因。复用一行不写入，不受影响。`07` §7.10.3 延续注释、`12` `AcceptPanel`、`13` §13.11.1 预算行同步；G46(bg)(3) 第九组补“链接工作树中对无关分支的交互式 rebase 停在冲突处”一组，期望 `repo_busy`、延续回到 `in_review`、清理不删、用户随后 `rebase --continue` 成功。
- **R65-D7-01**：`04` §4.6.5 的验收延续只在实际写入分支（快进或新建）时写 `◇ 已更新本地分支 <分支>…`；复用已写的汇总提交时分支没有变化，不显示这一行。
- **R65-D15-01**：`10` §10.6.2 表格行与“清理 Tower 引用”一段的“‘仅保留分支’”改为“验收但不合并而归档（`integrate:"none"`）的 Goal”，与 §10.3.2 的行名一致；ADR-192 R64-D13-03 条的原文是历史记录，本条即其更正。`04` §4.15 的清理说明同步补“不合并而归档的目标的分支”。

**评审结论中的观察（R65 结论部分）**
- 观察 1（守卫与 CAS 之间的竞态）：`10` §10.6 检出守卫补一句已知窗口：读取与 CAS 之间用户恰好检出该分支时拦不住（与 git 自己的 `branch -f` 相同），CAS 保证不覆盖用户移动过的分支。
- 观察 2（`newBranch:true` 的说明可能过时）：`newBranch` 只决定写入新分支、从不改动 B，服务端不要求上一次返回过 `branch_checked_out`；写入后面板写“按你的选择写入新分支 <B₀-v<k>>，<B> 未改动”，不再重复“正被检出”（`10` §10.6、`06` §6.4.3、`04` §4.6.5）。
- 观察 3（M2 恢复行的旧识别规则）：`06` §6.1.6 `integrating：seal 步骤` 行改为引用 `10` §10.6 的识别规则（sha 是影子中本 Goal 的某个 seal；只带 trailer 不算）。
- 观察 4（“只有 fetch 来的 seal”的措辞）：签名推迟后 S′ 不再存在；`10` §10.6 那句与 `11` T5、T26 改为“集成时从影子取来的 seal（先对象后 ref，快进以 CAS），删除只有按条件的 CAS 删除”。
- 观察 5（签名程序的登记）：M1 不运行签名程序，`11` §11.6.4 无需新增例外；M2 设计签名时须在该处登记。
- 观察 6（性能预算）：`13` §13.11.1 “fetch 进用户仓库”一行注明守卫读取为毫秒级、计入本行，M1 没有等待外部程序的步骤。
- 观察 7（`backlog` 出口表）：`08` §8.8 `backlog` 行的“越过”补“（M2：仅阻止模式）”；lint (z′) 纳入 `08` §8.8，该节中裸的“越过”同样须带 M2 / M3 标记。
- 观察 8（存储面板的动作名）：`10` §10.3.2 的“清理全部已归档”改为“清理工作目录”，与 `04` §4.15 一致；`04` 设置树补“清除早于 N 天的重放包”（`10` §10.17.1、`16` 镜像增长提示行）与“导出并清除早于 N 个月的证据”（`13` §13.11.3），均为提示时出现。
- 观察 9（`encoding` 不一致的出路）：随签名推迟到 M2 而不再存在。
- 观察 10（归档前重写的映射）：随签名推迟到 M2 而不再存在；`integration.performed.sha` 就是影子中的 seal，归档前重写直接以它从影子写回（`06` §6.4.3）。
- 观察 11（影子删除后的清理）：`10` §10.3.2 的保留原因补“无法核对：审计数据已过保留期”（影子已删除，识别规则无从判定）。
- 观察 12（Pi 引用范围）：`05` §5.3.5 注释与 D39、`11` §11.3.4 的 `agent-session.ts` 范围改为 3529–3553；`05` §5.4 与 D49 补 `session-manager.ts:1815-1865`（`forkFrom` 原样复制非头部条目）。已对 v1.2.0 核对。
- 观察 13（取舍判断）：无改动。

**推迟到 M2 / 删除**
- 推迟到 M2：为 seal 签名（含 S′ 的生成与校验、去掉签名头的识别扩展、签名的锁、时限、提示与失败去向、归档前的重新签名）；撤销合入时在用户仓库生成撤销提交与撤销草案分支（本地）。撤销 PR 草案本来就在 M2。
- 删除：`step = seal` 中因签名结果不一致的一支；`10` §10.6 中“P 是签名提交时先经镜像本地 fetch”；`goal.undo_integrate` 的写入失败去向（M1 不再写入）。
- 改弱为真：`04` §4.6.5 “已更新本地分支”只在实际写入时显示；`newBranch` 写入后的说明；“仅保留分支”一词的误用。
- 新增的只有：`10` §10.6 进行中操作守卫一段与检出守卫的一句已知窗口、`E_INTERNAL.detail.step` 的取值 `repo_busy`、§10.3.2 的两个保留原因、`00` §0.5.1 一行 M1 限制、`04` 设置树两项提示动作。没有新状态、事件、表、命令或决定种类。
- `16` §16.1.13 补登第 65 轮被取代的说法 3 行，并把 ADR-191/192 两行与 ADR-192 杂项行的新说法改为现行口径；lint `DELETED` 增两项（签名机制、M1 中的撤销草案分支；带 M2 标记的提及允许）。

- **lint**：(d) 增两项 `DELETED`（见上）；(z′) 纳入 `08` §8.8（评审 §3.1 建议）。其余条目是范围收窄与文案，没有新的可机械比对的锚点。全部检查：`--checks rstuvwxyzckdnSeRqpoPiDgKYATFMBOJCH`。
- **排期**：−0.02 人周（W15 −0.02 → 桌面：签名推迟 −0.02、撤销草案推迟 −0.01、进行中操作守卫 +0.01；说明行、文案、G40/G46 组、W17 名称与 lint 不足 0.01，计 0；系统线 0）；`14` §14.3.4 与 ADR-133 第 65 轮补记一致：WBS 122.72，余量 系统 0.12、Agent 0.26、桌面 0.44、设计 0.94、安全 0.24，依赖链 19.91，增 1 人 128.62 / T 23.75 / 33 周，M1 维持 38 周。

## 第 66 轮对抗评审（全范围）后的跨文档决策（ADR-194）

## ADR-194 快进合入撤销整个 seal 段、链接工作树 gitdir 的取法、seal ref 保留到影子删除、`integrated` 的入边与宽限期写入、删除放弃的撤销条 — Accepted（R66 全部条目与评审结论中的观察；Amends ADR-193；Amended by ADR-195）

选择原则（收敛规则，同 ADR-186–193）：只用三种办法关闭条目——(1) 把说法改弱但为真；(2) 删除或推迟不属于 M1 主循环的机制；(3) 在已有的唯一定义处加至多一条守卫、一行或一个字段。本轮五条都是次要：两条出在 ADR-193 的新文字，三条是旧缺口。每条在唯一定义处以一两句规则关闭，其余位置改为引用。不新增状态、事件、表、命令、决定种类或 `step` 取值；删去一个 M1 界面动作（放弃的撤销条与 `⌘Z`）。“绝不碰用户的工作现场”与全部安全不变式保持；拿不准时取对用户仓库更保守的行为。安全问题只写到设计层面。git 语义另在临时仓库中复核：快进合入两个 seal 后 `git revert <S₁ 的父>..<S₂>` 使 base 的树回到合入前；squash 两个 seal 的提交的 patch-id 等于整段差异的 patch-id、不等于最后一个 seal 的；`worktree move` 后管理目录名不变，`<commonDir>/worktrees/*/gitdir` 记录移动后的位置。

**条目（R66 追问清单）**
- **R66-D13-01**（快进合入的撤销只撤销最后一个 seal）：`10` §10.12 的 M1 行定义**本次合入的 seal 段**（唯一定义）：从 seal 沿父提交回溯，父提交是本 Goal 的 seal（§10.6 识别规则）且未记过 `local_merged` 时继续，停下处为 S₁；之前单独合入或被撤销的 seal 已记过 `local_merged`，不在段内；只有一个 seal 时 S₁ 即 seal。撤销一段（`10` §10.12，唯一定义）快进一支改为 `git revert <S₁ 的父>..<seal>`，Tower 写出两端的完整 sha；以合并提交合入时 `-m 1` 不变；squash 或合入的是人改写过的提交时撤销 base 中对应的那个提交（评审结论观察 3）。`14` G40(e) 的做法与新增 (h) 一组（两个 seal 快进合入后照做，期望 base 的树回到合入前，之后 (e) 的期望成立）、`16` §16.1.13 ADR-193 撤销行的新说法同步。
- **R66-D13-02**（链接工作树 gitdir 的 `<名>` 没有来源）：`10` §10.6 进行中操作守卫（唯一定义）写明取法：主工作树为 `commonDir`；链接工作树直接枚举 git 自己的管理目录 `<commonDir>/worktrees/*/`（含移动过、目录已不在而标为 `prunable` 的），不从工作树路径推出目录名；面板中的路径取该目录 `gitdir` 文件记录的位置。只读文件，不运行用户仓库中的命令，偏保守。`14` G46(bg)(3) 第九组补“移动过、另有同名目录的链接工作树中有进行中的 rebase”，期望 `repo_busy` 并给出移动后的路径。
- **R66-D15-01**（seal ref 的保留期短于识别规则对它的依赖）：`10` §10.3.2“检查点保留”（唯一定义）改为：归档或放弃 30 天后只把**检查点** ref 压缩为地标，**pin 与 seal ref 保留到影子删除**（180 天）——它们很小，而识别规则、删除条件与“清理 Tower 引用”都依赖 seal ref。因此影子删除之前清理总能认出 Tower 写过的分支；之后的原因是已有的“无法核对：审计数据已过保留期”。保留原因“顶端不是 Tower 的汇总提交，可能含你的提交”注明只在影子仍在、识别规则可判定时给出；进行中操作守卫的“之后可由清理再删”改为“影子删除之前”。`06` §6.6.4 影子行（改为引用，并与 `10` 一致地保留 pin）、`16` §16.2.6 检查点保留行、`09` §9.12.1 影子检查点 ref 行同步；`10` 的保留期按 `06` 原有口径写作“归档或放弃”。G46(bg)(3) 第十组补“归档时因进行中的操作跳过删除、60 天后清理”一组。
- **R66-D4-01**（`integrated` 的入边与宽限期内的外部写入）：(a) `03` §3.2 表下加一行通则“任何非终态 →（⚙️）`integrated`”，只引用 `10` §10.12；状态图注“其他非终态同样可进入”。`10` §10.12 (i)（唯一定义）补进入时的处理：`verifying` 中的当前验证取消、`ready` 中的准备中止、`queued_run` 按 ADR-151 清除。(b) `10` §10.3.1 第 4 行按状态的处理（唯一定义）加 `integrated` 一条：宽限期内不做来源不明写入的检测、不进入 `external_change`（被合入的已是人验收的 seal，卫星只为撤销保留；归档时这些写入随删除卫星的前提进入 `safety` 检查点，不进入任何 seal）；`goal.undo_integrate` 回到 `accepted` 后立即对卫星做一次 stat 检查，以当前 pin 的检查点为归因基线，有变化的路径按第 4 行作为一次检测处理（→ `paused(external_change)`，继续目标 `review`）。不新增转移：撤销后的暂停沿用 `accepted → paused(external_change)` 一边，`externalChange` 的 `CHECK` 不变，归因不变式保持。`06` §6.4.3 `goal.undo_integrate` 行引用。
- **R66-D4-02**（放弃的 8 秒撤销没有对应的命令）：按收敛规则 (2) **删除**放弃的撤销条：`abandoned` 是终态，没有反向命令；放弃确认框已有必填原因，误放弃时以 `goal.resurrect` 复活为新 Goal（分支、证据与 7 天内的卫星都还在）。不采用客户端延迟发送：8 秒内 `ready` 的 Goal 可能被准入，需要另定义“不被准入”，其他窗口与远程客户端看到的状态也不一致。`04` F8 第 3 步、`06` §6.4.3 `goal.abandon` 行同步；`12` §12.12 删去 `UndoBar`（M1 中再无使用者），`16` §16.3 删去 `⌘Z` 与“撤销条”作用域；`08` 没有引用撤销条，无需改动。

**评审结论中的观察（R66 结论部分）**
- 观察 1（两个守卫的先后）：`10` §10.6 写明先判进行中操作守卫，两者都命中时返回 `repo_busy`；`06` §6.4.3 `goal.accept` 行按同一顺序。
- 观察 2（`10` L10 的写入列举）：补上与 Goal 无关的多机租约 `refs/tower/_owner` 及其 blob；进行中操作守卫的范围写作“不写也不删分支”并以 §10.6 为准，租约与地标 ref 不受影响；守卫一段的“不在用户仓库中写入或删除任何东西”同步改为“不写入、快进或删除任何分支”。
- 观察 3（自行签名后合入）：`10` §10.12 的 patch-id 判定适用于任何非祖先情形（squash、人改写后合入），比较的是本次合入的 seal 段的整段差异——单个 seal 时即 seal 自身，squash 多个 seal 时也能判定；比较 seal 自身的差异会把只 cherry-pick 最后一个 seal 误判为合入，因此不用。逐个改写多个 seal 后再合入时判定不到，Goal 停在 `accepted`，人可选“验收但不合并”（登记为 M1 已知限制）。撤销做法指向 base 中实际的提交（R66-D13-01 条）。G40(h) 补 squash 与自行签名两组。
- 观察 4（“已撤销合入”徽章）：`12` §12.6.2 徽章改为“已撤销合入 · 需在你的仓库中 revert”，显示条件不变（`16` `Goal.integrationRevertedSeal` 行，到写入新 seal 为止）。
- 观察 5（`04` 的归档文案）：`04` F7 第 7 步补“仓库有进行中的 git 操作或该分支名正被检出时同样不归档，显示 §4.6.5 的同名一行”，并注明此路径只在分支已被删除时重写、不提供“写入新分支”。
- 观察 6（Pi 行号的基准）：`05` 文首“发布版”行与 §5.11.1 改为“与 v1.2.0 相差至多 5 行、方向不一，以符号名为准”，“同，行号 +≤5”统一为“±≤5”；已按 v1.2.0 书写的两处标注为 v1.2.0 行号。不逐条改 8 处行号区间（SP2 以 1.2.0 的 tarball 运行契约测试为最终确认）。
- 观察 7（人的决定的持久性）：`13` §13.9.3 改为引用 `06` §6.3 的唯一定义（立即单独提交，`synchronous=FULL`）。
- 观察 8（全局缓存写入的级别）：`11` §11.6.2 与 `07` §7.10.1 的举例改为 `~/Library/Caches/**` 等 `system` 路径，并注明点目录中的缓存属 `user_config`（severity 2），判定只按 `16` 的唯一定义。
- 观察 9（S7 的里程碑标记）：`11` §11.1 `forbid` 行补“（M2）”与 S7 `policy_wall`。未纳入 lint (z′)：“`stalled` 检测”在 M1 的 S1/S5 中同样使用，没有只属于 M2 的锚点。
- 观察 10（性能小出入）：`13` §13.13.2 D2 改为“后台 Goal 的看板卡片数据帧（`16` §16.4：250 ms，仅计数类字段 500 ms）→ 2 s”；`13` §13.8.3 演算表的 Tower 预留改为 0.65 GB 并重算合计与余量（8.8 / 11.3 / 13.8→11.8 / 12.6→8.7 GB，结论不变）；`11` T13 改为“非回环须 TLS 或用户显式确认网络层保护（§11.9）”；`11` §11.11 的哈希链公式改为 `06` §6.3 `prev_hash` 的唯一定义（对元数据与 `payload_hash` 取哈希）。
- 观察 11（卫星清理的复述）：`06` §6.6.4 卫星行改为纯引用 `10` §10.3.2；`10` §10.3.2 删除卫星一行补“ADR-184 的情形（接管期间卫星缺失且无法重建时放弃）H 原样保留、不在此列”。
- 观察 12（“基于 G1 分支开始”）：推迟到 M2（`03` §3.5 标注）；M2 设计时删除条件须补“没有其他非终态 Goal 以它为 base”。
- 观察 13（M1 性能退出与 3 并发上限）：`13` §13.12.2 P2、P5 注明“10 Goal 是以预置数据与合成事件驱动的夹具负载，不经准入”。
- 观察 14（Scratch 的 S0 事后检测）：Scratch 不在 M1；`11` §11.6.5 S0 行注明该哨兵的检测器 id 与 Needs-You 去向在 M2 设计时登记。
- 观察 15（取舍判断）：无改动。

**推迟到 M2 / 删除**
- 推迟到 M2：“基于 G1 分支开始”。
- 删除：放弃的 8 秒撤销条（`UndoBar`）与 `⌘Z`。
- 改弱为真：“可能含你的提交”只在可判定时给出；“之后可由清理再删”限于影子删除之前；`已撤销合入` 徽章写明还需人 revert；守卫范围写作“分支”；Pi 行号的偏移方向；T13 的 TLS 措辞；全局缓存的举例。
- 新增的只有：本次合入的 seal 段一处定义、`10` §10.3.1 `integrated` 一条、`03` 表下一行通则、§10.12 (i) 进入时的一句处理、守卫的 gitdir 取法与先后一句、§10.3.2 一句保留规则。没有新状态、事件、表、命令、决定种类或 `step` 取值。
- `16` §16.1.13 补登第 66 轮被取代的说法，ADR-193 撤销行的新说法改为现行口径。

- **lint**：评审 §3.1 的建议未新增检查：撤销做法与 gitdir 取法要靠 git 语义判断；保留期的比较（建议纳入 (r′)）各处现在都引用 `10` §10.3.2，不再各写一份；`integrated` 的入边由 `03` 表下的通则引用 `10` §10.12，不在 (k) 的比较模式内；撤销条已删除。全部检查：`--checks rstuvwxyzckdnSeRqpoPiDgKYATFMBOJCH`。
- **排期**：+0.01 人周（W15 +0.01 → 桌面：本次合入的 seal 段与整段 patch-id；其余各项按 WBS 行不足 0.01，计 0；系统线 0）；`14` §14.3.4 与 ADR-133 第 66 轮补记一致：WBS 122.73，余量 系统 0.12、Agent 0.26、桌面 0.43、设计 0.94、安全 0.24，依赖链 19.91，增 1 人 128.63 / T 23.75 / 33 周，M1 维持 38 周。

## 第 67 轮对抗评审（全范围）后的跨文档决策（ADR-195）

## ADR-195 隐私清除不写用户仓库并补全 Tower 自有副本、seal 段以观测前的标记为锚、`prunable` 工作树不停写、从暂停进入 `integrated` 的清理、patch-id 限制与审计保留的单一口径 — Accepted（R67 全部条目与评审结论中的观察；Amends ADR-194；Amended by ADR-196）

选择原则（收敛规则，同 ADR-186–194）：只用三种办法关闭条目——(1) 把说法改弱但为真；(2) 删除或推迟不属于 M1 主循环的机制；(3) 在已有的唯一定义处加至多一条守卫、一行或一个字段。本轮八条：一条重要（隐私清除写用户仓库），七条次要；两条出在 ADR-194 的新文字，六条是旧缺口。每条在唯一定义处以一两句规则关闭，其余位置改为引用。不新增状态、事件、表、决定种类或 `step` 取值；`privacy.purge` 的 scope 取值按 `09` 的四档对齐（删去未定义的 `run`、`events`）。“绝不碰用户的工作现场”（`10` 设计基调）与全部安全不变式保持；拿不准时取对用户仓库更保守的行为。安全问题只写到设计层面。

**条目（R67 追问清单）**
- **R67-D13-02**（重要；隐私清除删除用户仓库的分支与 `refs/tower/*`）：`09` §9.12.4 成为清除的**唯一定义**：清除只删除 Tower 自己的数据，**从不写入或删除用户仓库中的任何东西**。Tower 写过的 Goal 分支、地标 `refs/tower/<goalId>/cp/<n>` 与（清除全部时）多机租约 `refs/tower/_owner` 一律原样保留，清除结果逐条列出完整 ref 名与说明“Tower 未改动你的仓库；分支可能含你的提交，需要时请自行删除”；要由 Tower 删除满足删除条件的分支与地标，须在清除**之前**执行“清理 Tower 引用”（`10` §10.6.2，清除之后 Tower 不再有识别所需的 seal ref），确认框写明。`_owner` 取保守做法：列出而不删，并说明再次添加该仓库时会被视为另一台机器的租约（`06` §6.1.9）、没有其他机器使用时可自行 `git update-ref -d`。删去“已推送的分支是否保留由用户选择”（M1 无从判定）与按前缀删除分支。`06` §6.4.3 `privacy.purge` 与 §6.6.4 隐私清除行、`10` 设计基调、§10.3.2 检查点保留、§10.6.2 清理一段改为引用。`14` G46(bg)(3) 第十组补清除两组：清除前后用户仓库的 `for-each-ref`、HEAD、索引与文件都相同。
- **R67-D12-01**（清除的范围不完整）：`09` §9.12.4“清除一个 Goal”按 §9.12.1 的存储清单列全 Tower 自有副本：`goals/<goalId>/` 整个目录（会话、Run 目录、证据与验证日志、重放包、导出包、影子）、备份 bundle、卫星及其 gitdir 与私有存储、`$TMPDIR/tower-<goalId>/`、两种检出、仍载有该 Goal 内容的验证槽位、镜像中该 Goal 的全部 ref（含可能保存人未提交改动的 `base-snapshot`，对象由之后的镜像 gc 在宽限期后删除）、数据库中的 Goal 行与账本行（事件墓碑化）、按名字属于该 Goal 的日志，不能按 Goal 区分的共享日志、诊断包与崩溃转储一并清空，年度会话归档重写。**不改写、如实列出**：日 / 周数据库备份写明份数与最晚过期日期；迁移前备份没有保留期，逐个列出由人选择删除。**无法删除、如实列出**：系统备份中已有的副本、用户仓库中的 ref 与对象、同步目录的 git 历史与自行导出的文件、已发送给模型提供商的内容、系统通知中心中的文本；从该 Goal 提炼并已批准的记忆是独立条目，可逐条彻底忘记。§9.12.1 存储表补 Run 目录、备份 bundle、镜像库、数据库备份与会话归档、全局日志与崩溃转储五行。`06` `privacy.purge` 的 scope 改为 `memory` / `goal` / `project` / `all`，效果只引用 `09`。
- **R67-D11-01**（T24 的缓解措施与唯一定义相反）：`11` T24 改为：`~/.tower` 中可重建的目录排除系统备份、worktree 根目录名带 `.noindex`；事件库、Goal 数据（含会话与影子中的代码）与数据库备份**默认保留**在系统备份中，可在设置中把会话排除（`06` §6.6.1“备份排除”，唯一定义；`10` §10.4.3 的引用节号同步更正）。残余风险补“系统备份未加密时备份中含完整对话与代码，且隐私清除不触及已有的系统备份”，评级仍为中。
- **R67-D15-01**（审计保留期两处矛盾）：取**永久**（与 ADR-005、`02` §2.13 与 `06` 的删除触发器一致，`10` §10.3.2 依赖的“审计日志保留提交哈希”因此始终成立）。`16` §16.2.8“审计保留”行成为唯一定义：`audit.*` 不按时间删除，隐私清除只删其载荷，“清除全部”随 `~/.tower` 删除；`11` §11.11 与 `09` §9.12.1 改为引用，删去“1 年”。
- **R67-D13-01**（seal 段没有时间锚点）：`10` §10.12（唯一定义）的段改为“在**本次合入被观测之前**未记过 `local_merged`”，撤销时按同一锚点求段（只计该次 `local_merged{seal}` 之前已记的），不新增字段。判定时机一段加“**一次观测整体处理**”：一次 fetch 中新观测到合入的各 seal，先以观测之前的标记求出各段，再逐个判定，最后记 Fact；落在本次另一个被合入的 seal 的段内的较旧 seal 随该 seal 处理（一同记 `local_merged`，不按 (ii) 降回 `in_review`、不提示“较旧版本”）。`04` F7 第 6 步注明“单独合入的较旧版本”；G40(h) 补“两个 seal 一次快进合入时 Goal 不经过 `in_review`、没有较旧版本提示”。
- **R67-D13-03**（`prunable` 工作树使全仓库停写且提示无法照做）：`10` §10.6 进行中操作守卫（唯一定义）：工作树已不存在的管理目录（git 的 `prunable`：`gitdir` 记录的位置不存在且没有 `locked` 文件）没有可保护的工作现场，git 自己的 `worktree prune` 与 `gc` 也会删除它，因此**不因它停写**；其中有状态文件时面板与结果附一行“工作树 <路径> 已不存在，但仍记录着进行中的 <操作>；可在仓库中运行 `git worktree prune` 清除该记录”。`locked` 而位置不存在（卷未挂载）时照常停写并写明“已锁定且当前不可访问”。检出守卫不变，路径不存在时附同一行提示。仍只读文件、不运行用户仓库中的命令。G46(bg)(3) 第九组补删除目录与锁定两组。
- **R67-D4-01**（从 `paused(*)` 进入 `integrated` 绕过唯一规则）：`03` §3.2.1 唯一规则处写明不经 `onAllReasonsCleared()` 的出口只有两条：进入 `integrated` 与 `abandon`。`10` §10.12 (i)（唯一定义）补进入时的处理：清空 `pauseReason`、`alsoApplies`、`continuation` 与 `takeoverPriorReasons`，丢弃 `pendingHandBack`（集成摘要列出未执行的交还意图），S0 授权为 `pending` 时置回 `none`；人工编辑检出按已有条件不可能存在（取保守做法：有人工编辑检出时不进入 `integrated`，交还后再判定）；该 Goal 仍打开的阻塞类 Needs-You 条目以 `obsolete` 关闭（`08` §8.8 通用一行举例引用）；`pendingOpenings` 保留（ADR-186）。`03` 表下通则与 `04` F7 第 6 步引用。G40 补 (i)：`accepted` 中同一 pin 重新验证遇环境故障后人合入，期望字段为空、`verify_env` 条目 `obsolete`。
- **R67-D7-01**（patch-id 已知限制写窄、侧栏写“未合入”）：`10` §10.12 的已知限制改为“base 中没有提交与整段差异的 patch-id 相同时判定不到”，并如实列出范围：patch-id 含 diff 上下文，squash 前 base 在改动附近已有变化、合入时解决过冲突、与其他改动合成一个提交、只合入一部分、逐个改写多个 seal。`04` §4.3.2 侧栏改为 `◇ Tower 14 天未检测到合入 · 建议归档`，注明这是 Tower 观测的说法而不是事实（`12` §12.5），悬停说明“已以其他方式合入？选择‘归档（不合并）’”；F7 第 7 步同步。G40(h) 补“base 在改动附近有变化后 squash”一组。

**评审结论中的观察（R67 结论部分）**
- 观察 1（对人的承诺与宽限期）：`00` §0.5.1 外部改动一行与 `04` §4.18.3 错误状态表补“合入后的 24 小时宽限期内不检测，撤销合入时补做一次”（`10` §10.3.1）。
- 观察 2（`03` L65 的引用）：改为“§3.2 表的 `accepted` 行与 §3.2.1 表的 `external_change` 行”。
- 观察 3（卫星重建期间的判定）：`10` §10.12 判定时机把 `satelliteRebuilding` 列为临时条件：只记 Fact、状态不变（不按 (ii) 降回 `in_review`），重建完成时再判定一次。
- 观察 4（`integrated` 中的其他命令）：`contract.amend` 在 `integrated` 中返回 `E_STATE`（`03` §3.4.5 表下一句，`06` 引用）；`goal.abandon` 保持“任何非终态可放弃”，`06` 写明从 `integrated` 放弃只结束 Goal、不撤销合入、分支按 `abandoned` 保留。
- 观察 5（`pendingOpenings` 在撤销合入后）：无改动（ADR-186 已覆盖）。
- 观察 6（Tower 未运行期间对卫星的写入）：`07` §7.3.2 监视一行补“监视建立或重新建立时（含 Tower 启动后）先执行一次 decisive”。
- 观察 7（备份 bundle 的保留）：`10` §10.16.3 写明归档完成后删除（`integrated` 宽限后的归档与验收但不合并的归档相同）、隐私清除时删除；§10.3.2 检查点保留与 §10.6.2 改为“审计依赖影子与审计事件”，不再写依赖 bundle；清理原因改为“无法核对：影子已删除或已过保留期”。
- 观察 8（已放弃 Goal 的非永久证据）：`07` §7.4.1、`06` §6.6.4、`13` §13.11.3、`09` §9.12.1 统一为“归档或放弃后 30 天”。
- 观察 9（租约与用户仓库中的 ref）：`06` §6.1.9 续租的 CAS 失败时重读 `_owner`：不存在 → 重新写入；仍属本机 → 下次照常续租；属于另一个 `installId` → 按已有一行处理。`10` §10.17 “默认没有任何 `refs/tower/*`”补“除多机租约外”；§10.6 的“删除只有 §10.3.2 的 CAS 删除”改为引用设计基调（§10.3.2 / §10.6.2）。
- 观察 10（证据的导出并清除）：`04` §4.15 设置树、`13` §13.11.3 与 `16` §16.2.6 磁盘预算行标注“导出并清除早于 N 个月的证据”属 M2（依赖 `.towergoal` 导出）；`13` 非永久重放包的“磁盘压力时最先删除”改为引用 `10` §10.3.2 的顺序。
- 观察 11（取舍判断）：无改动。

**推迟到 M2 / 删除**
- 推迟到 M2：“导出并清除早于 N 个月的证据”。
- 删除：隐私清除对用户仓库的全部写入（删除 seal / 地标 ref、按前缀删除分支）；“已推送的分支是否保留由用户选择”；`privacy.purge` 的 `run`、`events` 两档。
- 改弱为真：T24 的缓解措施与残余风险；patch-id 判定不到的范围；侧栏“Tower 未检测到合入”；审计保留“永久”取代“1 年”；“审计长期保留依赖影子与备份 bundle”；清理原因“影子已删除或已过保留期”；`00`/`04` 对外部改动的承诺补宽限期例外。
- 新增的只有：`09` §9.12.4 的唯一定义一段与无法删除的副本一段、§9.12.1 五行、`10` §10.12 的时间锚点与一次观测整体处理两句、(i) 的进入处理一句与临时条件一句、§10.6 `prunable` / `locked` 一句、`03` §3.2.1 例外出口一行、`03` §3.4.5 表下一句、`06` §6.1.9 续租失败一句、`07` §7.3.2 一句。没有新状态、事件、表、决定种类或 `step` 取值。
- `16` §16.1.13 补登第 67 轮被取代的说法 4 行。

- **lint**：评审 §3.1 的建议未新增检查：清除对用户仓库的写入现在只有一处唯一定义且为“从不写”，建议的“删除 + refs/heads 须引用删除条件”检查在现文中没有可检对象；存储清单与清除表的覆盖面、段的时间锚点、`prunable` 的出路要靠语义判断；审计保留与 Time Machine 排除各处现在都引用唯一定义（`16` §16.2.8、`06` §6.6.1），不再各写一份，(r′) 无需加组。全部检查：`--checks rstuvwxyzckdnSeRqpoPiDgKYATFMBOJCH`。
- **排期**：+0.03 人周（W15 +0.02 → 桌面：一次观测整体处理与从暂停进入 `integrated` 的清理；W17 +0.01 → 设计：隐私清除的范围补全与结果列表；其余各项按 WBS 行不足 0.01，计 0；系统线 0）；`14` §14.3.4 与 ADR-133 第 67 轮补记一致：WBS 122.76，余量 系统 0.12、Agent 0.26、桌面 0.41、设计 0.93、安全 0.24，依赖链 19.91，增 1 人 128.66 / T 23.76 / 33 周，M1 维持 38 周。

## 第 68 轮对抗评审（全范围）后的跨文档决策（ADR-196）

## ADR-196 隐私清除只作用于终态 Goal 且不删人的检出、数据库内以墓碑闭合、按时间删除重放包推迟到 M2、团队表随 WBS 由 lint 核对 — Accepted（R68 全部条目与评审结论中的观察；Amends ADR-195；Amended by ADR-197）

选择原则（收敛规则，同 ADR-186–195）：只用三种办法关闭条目——(1) 把说法改弱但为真；(2) 删除或推迟不属于 M1 主循环的机制；(3) 在已有的唯一定义处加至多一条守卫、一行或一个字段。本轮四条：一条重要（隐私清除删除人工编辑检出与检验检出），三条次要；三条出在 ADR-195 的新文字，一条是旧缺口（§14.8）。每条在唯一定义处以一两句规则关闭，其余位置改为引用。不新增状态、事件、表、决定种类、`step` 取值或列：`decisions` 的墓碑写在已有的 `payload` 列中，已清除的 Goal 以已有的 `privacy.purged` 事件判定。“绝不碰用户的工作现场”（`10` 设计基调）、“不丢人的改动”与全部安全不变式保持；拿不准时取对人的数据更保守的行为。安全问题只写到设计层面。

**条目（R68 追问清单）**
- **R68-D13-01**（重要；清除无条件删除人工编辑检出与检验检出，对非终态 Goal 没有规则）：`09` §9.12.4（唯一定义）加两条：
  - **状态前提**：`goal` 档只接受终态 Goal（`archived` / `abandoned`，`03` §3.2）；其他状态（含 `integrated` 的宽限期与 `paused(human)`）返回 `E_STATE`，提示先放弃或等待归档——放弃已有对未交还改动的询问（`06` `goal.abandon`）。`project` 与 `all` 档范围内有任何非终态 Goal 时整笔返回 `E_STATE` 并列出这些 Goal（不做部分清除，避免项目级数据删了而 Goal 仍在）。
  - **人的工作现场**：清除**从不删除** `_human/<goalId>/` 与 `_inspect/<goalId>/`。对终态 Goal，它们只可能是 ADR-184 原样保留的 H（“不随 Goal 清理”）或人选择“保留目录，稍后决定”的检验目录（`10` §10.8.3）；结果与用户仓库中的 ref 一样逐条列出路径与原因。“清除全部”同样跳过并列出。
  - `06` `privacy.purge` 行、§6.6.4 隐私清除行、`10` §10.3.2 检查点保留一行改为引用；`04` §4.15 确认框说明同步。
  - **测试**：G46(bg)(3) 第十组补三组——ADR-184 情形的 H 与保留的检验目录在“清除一个 Goal”“清除全部”前后逐文件相同并被列出；`paused(human)` 的 Goal 与其 Project 的清除返回 `E_STATE`，不删除任何东西。
- **R68-D12-01**（清除的定义与 `decisions` 触发器、外键冲突；几类副本未列出）：
  - **数据库中的墓碑**（`09` §9.12.4 一条，唯一定义）：`decisions` 行不删除，只墓碑化——`note`、`reason_detail` 置空，`payload` 改为 `{"tombstone": {reason, at, by}}`，种类、目标、执行者、时间与 `seq` 不变；这是 `06` §6.3 `decisions_no_update` 的唯一例外，写在触发器定义处一个 `WHEN NOT (…)` 守卫中（与 `events_append_only` 的墓碑例外同形），`decisions_no_delete` 不变。Goal 行保留为墓碑行（`title` 改为 `（已清除）`，`abandon_reason` 置空，`labels` 置 `[]`），因此决定、其他 Goal 的 `parent_id` / `resurrected_from` 与 `goal_deps` 的外键仍然成立；已清除的 Goal 不显示、不能复活（`06` `goal.resurrect` 返回 `E_STATE`）。`02` §2.13 墓碑化一条与 `00` 的“不可篡改”各补一句引用。
  - **逐项列出**：“清除一个 Goal”在同一事务内按外键顺序删除合同、绑定、Run、会话、检查点、Fact、Claim、评审单元、评论、`engine_outbox`、计时器、水位、以该 Goal 为 owner 的 Needs-You 条目（含已解决的；`06` §6.6.4 该行补“隐私清除时删除”）与 Goal 记忆；`projections` 中该 Goal 的快照删除、含它的全局快照立即重写，`recovery/last-board.json` 随之重写，`recovery/journal.jsonl`（只在安全模式下写入、正常模式下已重放）清空。“清除一个 Project”另删 Project 行、`project_checkouts`、`project_local_files`、`project_benign_targets`、`depcache_entries`、项目级 Fact 与项目级 Needs-You 条目，目标为该 Project 的决定按墓碑处理。
  - **彻底忘记一条记忆**：Tower 自己写出的 Run 目录开场文件中该条文本改写为 `[已清除的记忆]`（这些文件不是 Pi JSONL）；以它为对象的 Needs-You 条目删除，相关决定按墓碑处理；“一并删除这些会话”只对已归档或放弃的 Goal 提供，进行中 Goal 的会话只列出；数据库备份同样如实列出。
  - **备份期**：取更简单而为真的写法，不新增“立即删除数据库备份”的选项：结果写明“在它们过期之前，系统备份的新快照同样会含有这些内容”；“系统备份”一条补同一句。
  - 排期：触发器的一处例外与其属性测试由清除例程的负责人一并完成（W17，设计），复用 W3 已有夹具，系统线 0。
- **R68-D15-01**（“清除早于 N 天的重放包”与“Project 被删除”引用已不存在的“隐私清除语义”）：
  - “清除早于 N 天的重放包”**推迟到 M2**，与 ADR-195 推迟的“导出并清除早于 N 个月的证据”合并定义。M1 中镜像超出上限的提示改为说明可对已归档或已放弃的 Goal 执行“清除一个 Goal”；Tower 仍不自动删除证据（`10` §10.17.1、§10.3.2 存储面板一段、`04` §4.15、`16` §16.2.6 镜像增长提示行、`13` §13.11.3）。`13` 永久重放包“只能经隐私清除删除”因此在 M1 中成立，补引用 `09` §9.12.4。
  - “Project 被删除”改为“删除 Project”：即 `privacy.purge{scope:"project"}`，状态前提、范围与列出的副本只按 `09` §9.12.4“清除一个 Project”一行（该行补“删除 Project 即本操作”）。
- **R68-D14-01**（§14.8 团队表人周过期）：按 §14.3.4 主责列重算（系统 W3 7.85 / W7 14.10 / W8 4.4；Agent W3 1.5 / W6 9.17 / W7 1.17 / W8 1.18 / W9 10.91 / W10 2.6；桌面补 W3 0.69 与 W12 1.6，W4 4.33、W7 3.86、W11 5.20、W15 0.91、W18 3.0；设计 W7 1.9、W11 2.66、W12 7.51、W13 6.88、W14 2.05、W16 3.01、W17 1.53；安全 W10 7.86、W7-fs 5.61、W8 0.1），每行补“合计”，表头注明数值随 §14.3.4。lint (C) 扩展：§14.8 每个 “W<n>（<数>” 等于该角色在主责列中的份额、有份额的 W 都列出、行合计等于角色合计。

**评审结论中的观察（R68 结论部分）**
- 观察 1（`12` L437 的宽限期例外）：`pause external_change` 一行补“合入后的 24 小时宽限期除外（`10` §10.3.1）”。
- 观察 2（镜像中的用户分支副本）：`09` §9.12.4 镜像一条改为“除仍可经用户分支副本到达的对象外”；“用户仓库”一条补：镜像以 `refs/user/heads/*` 保存用户分支的副本，使 seal 对象在镜像中仍可达，这些副本不随“清除一个 Goal”删除，清除该 Project 或清除全部时随镜像库删除。`10` §10.3.1 的镜像获取命令不带 `--prune`，因此不写“随分支删除后的下一次 gc 回收”。
- 观察 3（“清理 Tower 引用”是全局操作）：清除确认框注明它作用于该仓库中所有 Goal 的地标与分支（检查点仍在各自影子中）。
- 观察 4（“清除全部”之后的租约提示）：`06` §6.1.9 在 `_owner.hostname` 与本机相同时改写提示为“可能是本机此前的安装（如‘清除全部’之后）”，并附 `09` 的手动出路；24 小时规则与接管条件不变（主机名可能重复，不据此自动接管）。
- 观察 5（`13` docker 一行）：降为 1 个槽位后为 10.8 GB（同时去掉该槽位的服务实例与 fsmonitor 份额）。
- 观察 6（`13` “按年 ≤ 10 GB”）：写明按每年约 250 个工作日计，每天都满负荷时 ≤ 14.6 GB。
- 观察 7（`04` 没有隐私清除的入口）：`04` §4.15 设置树“数据”一行补“隐私清除：清除一个目标 / 项目 / 全部”及确认框说明，“记忆”一行补逐条“彻底忘记”，均引用 `09` §9.12.4。
- 观察 8（从 `integrated` 放弃后的字形）：`12` §12.6.1 放弃列表中从 `integrated` 放弃的 Goal 在 `⊘` 旁保留 `◉`（人工验收的为 `◍` + 外环），由状态事件得出，与归档列表同一做法。
- 观察 9（`09` L244 的注释）：改为“置顶优先，至多占一半，但总能放下一条上限 80 token 的条目：上限取 max(一半, 前缀 + 80)”。
- 观察 10（取舍判断）：无改动。

**推迟到 M2 / 删除**
- 推迟到 M2：按时间删除重放包（并入“导出并清除早于 N 个月的证据”）。
- 删除：清除对人工编辑检出与检验检出的删除；“清除全部”对 `_human`、`_inspect` 的删除；`10` §10.3.2 的“Project 被删除”独立定义。
- 改弱为真：数据库备份的过期说明补系统备份快照；镜像对象“随之不可达”补例外；`13` 两处演算；`12` 宽限期例外。
- 新增的只有：`09` §9.12.4 的状态前提、人的工作现场、数据库中的墓碑三条与表中各行的补充；`06` `decisions_no_update` 的一个 `WHEN NOT` 守卫；`06` `goal.resurrect` 一句、§6.1.9 一句；`12` §12.6.1 一句；`04` §4.15 两项。没有新状态、事件、表、决定种类、`step` 取值或列。
- `16` §16.1.13 补登第 68 轮被取代的说法 4 行。

- **lint**：(C) 扩展到 `14` §14.8（上文）。评审 §3.1 的其余建议未新增检查：人工编辑检出的删除现在只有 `10` §10.3.2 “删除卫星时”一处，清除改为从不删除，没有可检对象；`decisions` 与清除的关系已在触发器定义处写明唯一例外；“隐私清除语义”与“等同隐私清除”两个说法已登记在 `16` §16.1.13，由 (D) 检查。全部检查：`--checks rstuvwxyzckdnSeRqpoPiDgKYATFMBOJCH`。
- **排期**：+0.02 人周（W17 +0.02 → 设计：清除的状态前提与保留的检出 +0.01，数据库内的墓碑与逐项范围、触发器例外与属性测试、记忆清除改写开场文件 +0.01；其余各项按 WBS 行不足 0.01，计 0；系统线 0）；`14` §14.3.4 与 ADR-133 第 68 轮补记一致：WBS 122.78，余量 系统 0.12、Agent 0.26、桌面 0.41、设计 0.91、安全 0.24，依赖链 19.91，增 1 人 128.68 / T 23.76 / 33 周，**M1 维持 38 周**。

## 第 69 轮对抗评审（全范围）后的跨文档决策（ADR-197）

## ADR-197 回退位置下的清除与沙箱例外、删除打开卫星的键位、镜像获取带 `--prune`、预算的生效额度与跨越触发、`privacy.purged` 的载荷与续做 — Accepted（R69 全部条目与评审结论中的观察；Amends ADR-196、ADR-137；Amended by ADR-198）

选择原则（收敛规则，同 ADR-186–196）：只用三种办法关闭条目——(1) 把说法改弱但为真；(2) 删除或推迟不属于 M1 主循环的机制；(3) 在已有的唯一定义处加至多一条守卫、一行或一个字段。本轮八条：两条重要（回退位置与“`~/.tower` 整体”规则的冲突；`⌘⇧O` 在外部编辑器中打开卫星），六条次要。两条重要都出在此前没有交叉比对过的边界，不在 ADR-196 的新文字里。每条在唯一定义处以一两句规则关闭，其余位置改为引用。不新增状态、事件类型、表、决定种类、`step` 取值或列：扩展后的预算额度写在 `extend_budget` 决定已有的 payload 中，`privacy.purged` 只定义载荷字段。“绝不碰用户的工作现场”（`10` 设计基调）、“不丢人的改动”与全部安全不变式保持；拿不准时取对人的数据更保守的行为。安全问题只写到设计层面。

**条目（R69 追问清单）**
- **R69-D13-01**（重要；回退位置 `~/.tower/worktrees` 在 `~/.tower` 之内，“清除全部”会删除被保留的人工编辑与检验检出，沙箱的读拒绝与写允许相撞）：
  - **(a) 清除全部**（`09` §9.12.4 “清除全部”一行，唯一定义）：删除 `~/.tower` 中的全部内容，但 `<wtRoot>` 为回退位置时，其中的 `_human/<goalId>/` 与 `_inspect/<goalId>/` 同样不删除——它们与其上级目录留在原路径，`~/.tower` 中除此之外的一切照删，因此 `~/.tower` 不作为整体删除；结果列出这些路径。没有采用“先移出到 `~/.tower` 之外”的做法：移动人正在使用的目录可能打断已打开的编辑器，原路径保留更保守。“人的工作现场”一条改为引用该行。
  - **(b) 沙箱**（`11` §11.6.2 读拒绝一行，唯一定义；§11.6.3 与 `10` §10.4.3 引用）：`<wtRoot>` 回退到 `~/.tower/worktrees/…` 时，对 `~/.tower/**` 的拒绝只为上两行允许项中位于 `<wtRoot>` 之下的那些逐路径除外——本 Goal 卫星的工作区、`_gitdirs/<goalId>`、`_stores/<goalId>/`（读写，与写允许一行相同），`$SH` 与 `_stores/_shim/`（只读）；此外不除外，其他 Goal 的卫星与 gitdir、`_human/**`、`_inspect/**`、`_verify/**`、`$VS` 与其他 Goal 的 `_stores/<id>` 照常拒绝。验证器沙箱只为本槽位（回退时在 `~/.tower/verify/<projectId>/`）与 `$VS` 除外。与写允许一致：写允许的三项都在例外之内，例外不含写允许之外的可写路径。
  - `10` §10.4.3 加一段“回退位置在 `~/.tower` 之内”，只引用上述两处定义。
  - **测试**：G46(bg)(3) 第十组补回退位置一组（ADR-184 的 H 与保留的检验目录，执行“清除全部”）；SP6a A3 补回退位置一组（读写探测，另读同一 `<wtRoot>` 下其他 Goal 的卫星、`_human`、`_inspect`、`_verify`、`$VS`，验证器读另一槽位与 `~/.tower/goals/`）。
- **R69-D11-01**（重要；`16` §16.3 的 `⌘⇧O` 在外部编辑器中打开卫星）：删除该键位（登记于 `16` §16.1.13）。`10` §10.1 的不变式补一句：Tower 的任何入口（含键位）都不在外部程序中打开卫星；在外部程序中打开的只有经影子物化、过滤并有信任提示的人工编辑检出与检验检出。`11` T5 原文“人用人工编辑检出而不打开卫星”因此成立。`04` 正文与线框没有出现该键，(H) 不受影响。
- **R69-D13-02**（次要；镜像获取不带 `--prune`，与保留表相反）：`10` §10.3.1 的镜像获取改为 `git fetch --no-tags --prune <userCheckout> '+refs/heads/*:refs/user/heads/*' '+refs/remotes/*:refs/user/remotes/*'`。`--prune` 只作用于命令行 refspec 的两个目标命名空间，镜像中 Tower 自己的 `refs/tower/*`、`refs/tower-live/*`、`refs/tower-retain/*`、`refs/tower-remote/*` 不在其中，不受影响；git 先删除再写入，因此分支名的目录 / 文件冲突不会使获取一直失败。`10` §10.17.1 保留表一行写明这一点；`09` §9.12.4 “用户仓库”一条改为：你删除这些分支后，下一次镜像获取删除对应副本，对象之后由镜像 gc 回收；仍存在的副本随清除该 Project 或清除全部删除。本条取代 ADR-196 观察 2 中“获取命令不带 `--prune`”的依据。
- **R69-D4-01**（次要；“越过软上限一次”与 `budget.extend` 的额度没有落点；细化 ADR-137）：`06` §6.2.5（唯一规则）加一条：**生效额度** = 当前合同版本的 `Budget` 与该版本批准之后本 Goal 各 `extend_budget` 决定 payload 中同名字段的最大值（`budget.extend` 把提高后的额度写入该决定的 payload，`minutes` 同时加到两项时钟额度上；与 `payload.grant` 同形，决定不可变，不新增列；修订合同后以新版本为准）。软上限按**跨越**触发（本次累加之前低于、之后不低于），因此直接 `resume` 即越过一次，同一额度下不再触发；扩展后再次跨越才触发。硬上限的判定不变。`03` §3.2.1 该行改为“`extend_budget` 后 `resume`，或直接 `resume`”；`12` §12.10.4 预算条超出部分只在有未解决的预算条目时着琥珀，否则 text-2；`14` 新增 G33f。
- **R69-D6-01**（次要；`privacy.purged` 没有载荷，清除中途崩溃没有续做规则）：`06` §6.4.3 `privacy.purge` 行写出载荷 `privacy.purged{scope, id?, roots?, filesDone?}`：`project` 档同一事务中为每个 Goal 追加 `{scope:"goal", id}`；`roots` 为 `project` / `all` 档涉及的各 `<wtRoot>`。**顺序**：数据库部分与不带 `filesDone` 的事件在一个事务内先提交，再执行幂等的文件删除，完成后追加带 `filesDone: true` 的一条；`all` 档最后删除数据库本身。“已清除的 Goal”只认 `scope = "goal"` 且 `id` 为该 Goal 的事件，“彻底忘记”的事件不使任何 Goal 被判为已清除。`06` §6.1.6 加一行：有未配对 `filesDone` 的事件时按 `09` 同一档的清单续做文件删除。对已清除的 Goal 再次执行时只重做文件删除并返回“已清除”。
- **R69-D12-01**（次要；派生到其他对象中的副本没有列出）：`09` §9.12.4（唯一定义）取保守而为真的做法：
  - **一并删除**：来源为本 Goal（`provenance.goalId`）且仍为 `proposed` 的项目或用户记忆提议（不是人批准过的数据），以它们为对象的 Needs-You 条目与相关决定按“彻底忘记”一行处理；渲染进程的搜索索引同时丢弃本 Goal 的条目。
  - **列出**：复活出的新 Goal（`resurrected_from`）与子 Goal（`parent_id`）是独立的 Goal，不改动，逐个列出，可分别清除；项目或全局汇总的 Needs-You 条目（`ratify`、`digest`、`flood`、`backlog`）不改写，列出条数，随其 owner 的清除删除。
- **R69-D7-01**（次要；`00` R7 把决策步骤写成 Harness 强制）：改弱为真：计划步骤声明的路径并集成为 Harness 强制执行的范围围栏；需要决策的步骤成为注入给 Agent 的 `natural` 停止条件——由 Agent 以提问停下，Tower 不求值、不强制，只在 Agent 声明进入该步骤时提醒（`02` §2.5 PlanStep）。没有采用“以 `touches` 生成 `path_touched`”的强制编译：它会在步骤的正常编辑上反复停下，属新机制。
- **R69-D8-01**（次要；“L3、其他”的最长等待与表头、主循环相反）：删去该行后半句，与表头和主循环一致：15 min 后无视 θ 投递，仍受预算约束。`16` §16.2 的“其他 15 min”不变。

**评审结论中的观察（R69 结论部分）**
- 观察 1（删除卫星时的检验目录）：`10` §10.3.2 “删除卫星时”一行写明 `_inspect` 按 §10.8.3 第 7 步先比较，有被修改的文件时先询问。
- 观察 2（被保留的 H 与检验目录）：`09` §9.12.4 的清除结果注明它们不在系统备份中（排除标记仍在），且 H 的 git 对象经 alternates 取自影子与镜像，清除之后其中的 git 命令会失败、文件完整；`11` T24 的“可重建”补这两类的例外。
- 观察 3（`⌘K` 与 F9）：`04` 两处补“不含已清除的目标”；`09` 的判据一句同步写明 `⌘K` 搜索。
- 观察 4（墓碑 Goal 行的措辞）：改为“置空人写的文本列”，标识、状态、时间与 `owner`、`counters` 等非人写的列保留。
- 观察 5（重复墓碑化）：墓碑化只更新尚未墓碑化的行；对已清除的 Goal 再次清除时只重做文件删除并返回“已清除”（`06` §6.4.3）。
- 观察 6（M2 的分叉）：`10` §10.8 “分叉为新 Goal”一行注明 M2 设计时须为跨 Goal 的 `parent_session_id` 与复制的对话写出清除规则。
- 观察 7（`payload_hash` 保留）：`09` §9.12.4 “清除之后仍可能存在的副本”列出；M2 计算哈希链时考虑带密钥哈希。
- 观察 8（“清除全部”未列出）：Electron `userData`（Chromium 缓存与窗口状态）一并删除；钥匙串中 Tower 写入的模型提供商密钥与云 SDK 凭据不是目标内容，不删除，结果列出。
- 观察 9（`07` §7.4.10 排队表）：c = 1 一行按 M/M/1 重算为 Wq 均值 27 min、p95 94 min，claimed → in_review ≈ 25 / ≈ 105 min（与前两行同一口径）；L987 的例子改为 “p95 ≈ 95 min”。不是承诺场景，结论不变。
- 观察 10（两处数值）：`13` §13.9.3 的 30 天窗口峰值按约 22 个工作日重算为 0.85 × 90–260 MB × 22 ≈ 1.7–4.9 GB，预算改为 ≤ 5 GB（`16` 事件库增长预算一行同步）；`16` §16.2.3 验证排队降级改为 10 / 20 min 两档。
- 观察 11（`07` 软矛盾字形）：`?` 改为 `◇`。
- 观察 12（`08` 三处）：`baseLevel` 对 `ratify` 返回 L2（§8.5.1 的专门规则，severity 仍为 1）；粗断点不再写“触发全局重入简报”，以 §8.10.2 的离开 ≥ 30 min 为准；同一 Run 中先后检测到不同子类型的 `stalled`，子类型、选项与 `costOfDelay` 取最近一次检测的。
- 观察 13（检验带回）：`04` §4.6.6 第 6 步在因验证结果而暂停的状态中不显示 `[作为人工改动带回目标]`，改为提示用“我来改”重做。
- 观察 14（`04` 线框的预设名）：两处线框改为 M1 的“标准修复”，摘要改为“push 禁止 · 合并 / 删除 先问”，与 `11` §11.2 一致。
- 观察 15（`13` D8）：D8 写为 `06` §6.2.4 步骤 d 的一种情形，文案统一为“机器资源”。
- 观察 16（`03` 返工计数）：删去“重置返工计数需人确认”，写明计数在 Goal 生命周期内不重置。
- 观察 17（`05` D59）：例举补“压缩进行中”（`agent-session.ts:2071-2074`），`05` 另两处行号同步。
- 观察 18（取舍判断）：无改动。

**推迟到 M2 / 删除**
- 删除：`⌘⇧O`；`00` R7 中决策步骤“由 Harness 强制”的说法；“L3、其他”的“不再弹出”；“重置返工计数需人确认”；`16` 降级表的 15 min 一档（第 55 轮已删，残留）。
- 推迟到 M2：带密钥的载荷哈希（列为考虑项）；分叉为新 Goal 的清除规则（随该功能）。
- 改弱为真：`00` R7；`07` 排队表一行；`13` 数据库窗口峰值；`11` T24 的“可重建”。
- 新增的只有：`09` §9.12.4 “清除全部”一行的回退位置规则、派生副本的处理与列出；`11` §11.6.2 读拒绝一行的回退位置例外；`06` §6.2.5 生效额度与跨越触发一条、`privacy.purge` 行的载荷与顺序、§6.1.6 一行；`10` §10.3.1 的 `--prune` 与 §10.4.3 一段引用；`08` `baseLevel` 一个分支；`14` G33f 与 G46、A3 各一组。没有新状态、事件类型、表、决定种类、`step` 取值或列。
- `16` §16.1.13 补登第 69 轮被取代的说法 5 行。

- **lint**：评审 §3.1 的建议未新增检查：回退位置的两条例外各只有一处定义，其余位置引用；`⌘⇧O` 已删除，被取代的说法由 (D) 检查；`--prune` 与保留表、“L3、其他”与主循环都已改为同一说法。全部检查：`--checks rstuvwxyzckdnSeRqpoPiDgKYATFMBOJCH`。
- **排期**：+0.04 人周（W17 +0.02 → 设计；W5 +0.01 → 桌面；W10 +0.01 → 安全；其余各项按 WBS 行不足 0.01，计 0；系统线 0）；`14` §14.3.4 与 ADR-133 第 69 轮补记一致：WBS 122.82，余量 系统 0.12、Agent 0.26、桌面 0.40、设计 0.88、安全 0.22，依赖链 19.91，增 1 人 128.73 / T 23.77 / 33 周，**M1 维持 38 周**。

## 第 70 轮对抗评审（全范围）后的跨文档决策（ADR-198）

## ADR-198 GoalId 在本机不复用与两种检出的独占新建、回退位置三种沙箱的例外集合、`privacy.purged` 的定位与配对、`ratify` 聚合条目按剩余对象重算、合同修订预填生效额度 — Accepted（R70 全部条目与评审结论中的观察；Amends ADR-197；Amended by ADR-199）

选择原则（收敛规则，同 ADR-186–197）：只用三种办法关闭条目——(1) 把说法改弱但为真；(2) 删除或推迟不属于 M1 主循环的机制；(3) 在已有的唯一定义处加至多一条守卫、一行或一个字段。本轮五条：一条重要（“清除全部”之后 GoalId 从头编号，新 Goal 与被保留的 `_human/<id>`、`_inspect/<id>` 同名），四条次要；重要一条出在 ADR-196/197 留下的后续状态，三条次要是 ADR-197 新规则的边界，一条是两条新规则对同一对象的冲突。每条在唯一定义处以一两句规则关闭，其余位置改为引用。不新增状态、事件类型、表、决定种类、`step` 取值或列：编号高水位是 `~/.tower` 中的一个文件，`roots` 只改为 `{projectId, wtRoot}` 列表、仍是 ADR-197 已有的载荷字段，`ratify` 对象为空时用 `08` §8.8 已有的 `obsolete`。“绝不碰用户的工作现场”（`10` 设计基调）、“不丢人的改动”与全部安全不变式保持；拿不准时取对人的数据更保守的行为（拒绝、不写出、列出）。安全问题只写到设计层面。

**条目（R70 追问清单）**
- **R70-D13-01**（重要；“清除全部”之后编号从头开始，新 Goal 与被保留的目录同名，`10` 的删除与物化规则会删除或覆盖人留下的改动）：
  - **编号不复用**（`02` §2.2 GoalId 一行，分配规则的唯一定义）：取数据库中的最大编号与 `~/.tower/goal-id-hwm` 中的高水位，较大者加一；跳过在该 Goal 各 Project 的 `<wtRoot>` 下已有同名目录（卫星、`_gitdirs/`、`_stores/`、`_human/`、`_inspect/` 之下）或用户仓库中已有 `refs/tower/<编号>/` 的编号；高水位在 `goal.created` 提交之前写入。`02` 没有不可变的实例 id（GoalId 是短号，只有 Run 用 ULID），因此不另造实例标识：编号本身在本机唯一，目录名中的 `<goalId>` 即实例标记。跳过已有名字使高水位丢失（如 `~/.tower` 被手动删除）时同样成立；只读用户仓库的 ref，不写。
  - **“清除全部”保留高水位**（`09` §9.12.4 “清除全部”一行）：该文件只含一个编号、不含目标内容，与 `_human`、`_inspect` 一样保留；回退位置一句同步。`06` §6.6.1 目录树补一行，§6.1.6 续做一行注明照常保留。
  - **只属于一个 Goal 与独占新建**（`10` §10.2 一段，唯一定义）：以 `<goalId>` 命名的目录只可能由该 Goal 创建，§10.3.2 “删除卫星时”、§10.8.3、§10.8.4 按名字删除或写出都以此为前提（三处各补一个引用）；另加一条守卫：`_human/<goalId>` 与 `_inspect/<goalId>` 只以独占方式新建，路径已存在时不写出、不覆盖、不删除、不改名，“我来改”与打开检验返回 `E_STATE` 并列出该路径。这同时关闭了一个旧缺口：本 Goal 此前“保留目录，稍后决定”的检验目录在再次打开检验时会被 pin 覆盖写出。卫星已有同类守卫（§10.3.1 步骤 2）。
  - 没有采用“已存在时改名为带后缀的新路径”：沙箱规则与 `16` §16.8 的路径简写都按 `<goalId>` 拼路径，带后缀会让这些规则多一个变量；编号不复用之后，已存在只剩人为或崩溃造成的情形，拒绝并列出更保守。
  - **测试**：G46(bg)(3) 第十组补一组——保留 H 与检验目录后“清除全部”，再次添加同一仓库并新建 Goal 直到编号超过旧的最大编号，对它们执行“我来改”、打开检验与归档；另一组先删除高水位文件；另对留有保留检验目录的 Goal 再次打开检验。
- **R70-D11-01**（次要；回退位置的例外只为 Agent 补全，验证器缺 `$SH`、检验检出缺本目录，分类器硬底线没有例外，`10` L541 的“各只在一处定义”不成立）：`11` §11.6.2 读拒绝一行的回退例外（唯一定义）改为：三种沙箱各只为**自己在默认位置下的允许项**中、回退后落在 `~/.tower` 之下的那些逐路径除外，权限不变——Agent（与 ADR-197 相同）；验证器 = 本槽位（读写）、`$VS` 与 `$SH`（只读），即 `16` §16.8 V 列引用的路径；检验检出的脚本与服务 = 本 Goal 的检验目录（读写，与其写允许相同）、`$VS` 与 `$SH`（只读）。命令分类器“写 `~/.tower/**`”硬底线（§11.3.2）只为 Agent 的读写项除外，引用同一处。§11.6.3、§11.7 可读者规则与 `16` 即时投递目录一行改为引用。`10` §10.4.3 一段改为列出两处定义（清除全部、沙箱例外）与引用后者的各条规则。例外不含任何沙箱写允许之外的可写路径，其他 Goal 的数据照常拒绝。**测试**：SP6a A3 回退位置一组补三项正向运行（验证器以 `$SH` 中的 Node 执行 `exec` 标准、检验检出执行生命周期脚本与服务、Agent 以相对路径执行写命令）。
- **R70-D6-01**（次要；`goal` 档的事件没有定位信息，`project` 档逐 Goal 的事件从不配对，G46 期望与协议矛盾）：`06` §6.4.3 `privacy.purge` 行（唯一定义）：**定位**——`roots` 改为 `{projectId, wtRoot}` 列表，`goal`、`project`、`all` 三档都写，与删除绑定、Project 行的同一事务写入；文件删除、续做与再次清除只按事件中的 `id` 与 `roots` 定位卫星、`_gitdirs`、`_stores`、备份 bundle、镜像中的 ref 与验证槽位，不读已删除的行。**配对**——`project` 档完成时为范围内每个 Goal 各追加一条 `{scope:"goal", id, filesDone: true}`，因此每条不带 `filesDone` 的事件都有配对，续做行的判据不变；再次清除不追加事件。§6.1.6 续做行同步。G46 的期望改为“不带与带 `filesDone` 的各一条”，另补 `project` 档中途终止的一组。
- **R70-D12-01**（次要；`ratify` 聚合条目同时适用“删除”与“不改写、只列条数”）：`09` §9.12.4 “彻底忘记”一行（唯一定义）：聚合的 `ratify` 条目不整条删除，从其对象中移除被删除的提议，按剩余对象重算“N 项待批准”与证据，对象为空时以 `obsolete` 关闭；“清除一个 Goal”删除待批准提议时同样如此（已引用该行）。“派生到汇总条目中的内容”一条的“不改写”只指 `digest`、`flood`、`backlog`。`08` §8.8 `ratify` 的 `obsolete` 出口补“对象中的提议全部被清除”。`ratify` 的内容本就是由待批准提议集合派生的，按剩余对象重算不需要逐段识别摘录，与 ADR-197 不改写其他汇总条目的理由不冲突。G46 期望同步。
- **R70-D4-01**（次要；合同修订悄悄作废此前的 `extend_budget`，预填生效额度又会被判为放宽）：`06` §6.2.5 生效额度一条（唯一规则）补：修订编辑器的 `Budget` 各字段预填修订前的生效额度，此前的扩展因此并入新版本的合同值，不因修订而失效，人改动的字段以改后的值为准；`16` §16.5 判定预算字段的“降低 / 提高”以修订前的生效额度为比较对象，与之相同不算提高。“修订后以新版本为准”保留。`04` 合同编辑器补一行（字段旁注明“含已批准的扩展”）；`16` §16.5 预算一行改为“降低或不变”。没有采用“修订保留扩展、只有显式改动的字段以新版本为准”：它需要逐字段记录“是否改动”，而预填后新版本本身就记下了生效值。G33f(c) 改写，补 (d)：硬上限扩展后在远程客户端修订合同（只新增一条 `human` 标准）后 `resume`。

**评审结论中的观察（R70 结论部分）**
- 观察 1（`15` 的格式）：ADR-133 第 68 轮与第 69 轮补记之间、第 69 轮补记的“分配：”一段之前各补一个空行。
- 观察 2（回退位置下的违规分类）：`16` §16.1.6 判定顺序改为“先 `credential`，再 `user_checkout`、`other_satellite`，再 `tower_data`，再 `user_config`，其余 `system`”，补一个回退位置的判例；`10` §10.4.3 一段注明。
- 观察 3（“软上限 / 当前硬上限”的口径）：`12` §12.10.4 预算条与 `16` 手机端“单次延长 ≤ 当前硬上限的 20%”各补“生效额度，`06` §6.2.5”。
- 观察 4（“彻底忘记”的续做）：取不新增字段的写法：Run 目录开场文件的改写需要原文，`brief.md` 的 `Notes:` 行不带条目 id，因此这一步在数据库事务**之前**执行（幂等）；事务之前崩溃时记忆仍在，人再次执行即可。`06` §6.4.3 与 `09` “彻底忘记”一行写明。
- 观察 5（回退位置的目录名）：回退 `<wtRoot>` 写为 `~/.tower/worktrees/<projectId>.noindex`（`10` §10.4.3 步骤 3 与 Spotlight 一条，唯一写法），§10.2 命名表、§10.4.3 一段与 `06` §6.6.1 目录树同步；其余 `~/.tower/worktrees/…` 指它。
- 观察 6（`00` R7 末句）：改为“范围围栏由 Harness 强制，决策点至少被注入并提醒；否则‘事前批准计划’反而降低运行中的警惕”。
- 观察 7（取舍判断）：无改动。

**推迟到 M2 / 删除**
- 删除：`02` GoalId 的“本地唯一”（改为本机不复用并写出分配规则）；`10` §10.4.3 “各只在一处定义”的两项列举；`09` 中把 `ratify` 列为“不改写”的汇总条目；G33f(c) 的“此前的 `extend_budget` 不再计入”。
- 推迟到 M2：无。
- 改弱为真：`00` R7 末句；`10` §10.4.3 的规则列举。
- 新增的只有：`02` §2.2 一条分配规则；`10` §10.2 一段与三处引用；`09` “清除全部”一句、“彻底忘记”一句；`06` `privacy.purge` 行的定位、配对与改写顺序，§6.1.6 一句，§6.2.5 一句，§6.6.1 一行；`11` §11.6.2 例外集合的三组与 §11.3.2 一处引用；`08` §8.8 一个出口；`04` 一行；`16` 判定顺序与两处口径；`14` G46、A3 各一组与 G33f(d)。没有新状态、事件类型、表、决定种类、`step` 取值或列。
- `16` §16.1.13 补登第 70 轮被取代的说法 3 行。

- **lint**：评审 §3.1 的建议未新增检查：“`~/.tower/**`”规则的例外现在只在 `11` §11.6.2 定义，其余各行都改为引用并由 `10` §10.4.3 逐条列出；`privacy.purged` 的配对改为“每条不带 `filesDone` 的事件都有同一 `scope`、`id` 的完成事件”，没有剩下需要显式排除的形状；被取代的说法由 (D) 检查。全部检查：`--checks rstuvwxyzckdnSeRqpoPiDgKYATFMBOJCH`。
- **排期**：+0.04 人周（W17 +0.02 → 设计，其中编号分配原属 W3 系统线，按 ADR-136 改由清除例程的负责人完成；W10 +0.01 → 安全；W5 +0.01 → 桌面；其余各项按 WBS 行不足 0.01，计 0；系统线 0）；`14` §14.3.4 与 ADR-133 第 70 轮补记一致：WBS 122.86，余量 系统 0.12、Agent 0.26、桌面 0.39、设计 0.86、安全 0.20，依赖链 19.91，增 1 人 128.77 / T 23.78 / 33 周，**M1 维持 38 周**。

## 第 71 轮对抗评审（全范围）后的跨文档决策（ADR-199）

## ADR-199 本 Goal 自己留下的人工编辑检出可移到一边后重新开始、合同修订的预算并入移到命令层、“一并删除这些会话”记入命令与事件 — Accepted（R71 全部条目与评审结论中的观察；Amends ADR-198；Amended by ADR-200、ADR-221、ADR-228）

选择原则（收敛规则，同 ADR-186–198）：只用三种办法关闭条目——(1) 把说法改弱但为真；(2) 删除或推迟不属于 M1 主循环的机制；(3) 在已有的唯一定义处加至多一条守卫、一行或一个字段。本轮三条都是次要，都是 ADR-198 的修订各自少覆盖了一个入口：守卫没有区分本 Goal 自己的残留，预算并入写在编辑器而不是命令上，“彻底忘记”的续做漏了同一行里人的另一个选择。每条在唯一定义处以一两句规则关闭，其余位置改为引用。不新增状态、事件类型、表、决定种类、`step` 取值或列：新增的只有三个命令参数（`goal.take_over` 的 `moveAside`、`contract.amend` 的 `budgetBase`、`privacy.purge` 的 `sessionIds`）与 `privacy.purged` 已有载荷中的一个字段 `sessionIds`，`E_CONFLICT` 是已有的错误码。“绝不碰用户的工作现场”（`10` 设计基调）、“不丢人的改动”与全部安全不变式保持；拿不准时取对人的数据更保守的行为（只改名、不删除、列出）。安全问题只写到设计层面。

**条目（R71 追问清单）**
- **R71-D13-01**（次要；独占新建的守卫使本 Goal 自己中断的接管或删除留下的 `_human/<goalId>` 永久挡住“我来改”，第 70 轮回应声明的代价不在正文中）：
  - **识别与出口**（`10` §10.2 一段，唯一定义）：`humanCheckout` 为空而 `_human/<goalId>` 存在时，按 ADR-198 编号不复用，在 Tower 自己的流程中只来自本 Goal 中断的接管（物化之后、写入 `humanCheckout` 的事务之前，外部编辑器尚未打开）或中断的删除（改动已写回或已被人放弃）；Tower 不据此判断其中的内容（人或 S0 下的进程也可能写过它）。`E_STATE` 写明这两种来源，并提供“移到一边并重新开始”：由人点击，以 `goal.take_over{moveAside: true}` 重发，Tower 在同一父目录内以不覆盖的方式改名为 `_human/<goalId>.kept-<时间>`，再照常独占新建。改名后的目录 Tower 从不删除、此后不再管理，删除卫星与清除都不认领它，结果与 Goal 页列出其路径；它仍在 `_human/` 之下，Agent 的读写拒绝照旧覆盖它。
  - **代价**（第 70 轮回应承诺写入正文的一句，现写在同一段）：多一次点击；改名后的目录占用磁盘，直到人自行删除。
  - **删除顺序**（`10` §10.8.4 第 8 步与放弃改动、`06` §6.4.3 `goal.hand_back` 与 `goal.discard_human_edits`）：先提交清除 `humanCheckout` 的事务，再删除 H；删除中断时留下的 H 由上一条处理。反过来的顺序会让放弃改动中途中断后、半删除的 H 以 `syncState='idle'` 重新显示“交还”入口（`06` §6.1.6），交还会把缺失的文件当作人的删除写回，因此不取。
  - **没有提供“沿用此目录”**：H 的内容与 gitdir 必须全部由 Tower 从影子树写出（ADR-094/106/109：`pinSafetyCheck` 命中的路径不写出、gitdir 来自 Tower 模板）；已存在的目录无法据此核对，而上述两种来源中都没有未交还的改动，沿用不带来任何好处。
  - **`_inspect/<goalId>` 不需要同一规则**：检验目录存在即按已打开的检验处理，由 `10` §10.8.3 第 7 步的关闭与比较给出丢弃、带回或保留，不会被永久挡住。
  - `04` §4.6.7 补 `E_STATE` 文案与两个选项；`09` §9.12.4 “人的工作现场”改为三种目录；`06` `goal.take_over` 一行补参数与条件。**测试**：G46(bg)(3) 第十组补一组（接管物化中途终止 → 重启 → 再次“我来改”；交还删除 H 中途终止 → 重启 → 再次“我来改”，两组都移到一边，之后归档并清除）。
- **R71-D4-01**（次要；扩展并入新版本只由修订编辑器的预填保证，“改为 human 标准”等由界面直接生成的修订不含预算字段，新版本仍取旧合同值，此前批准的扩展悄悄失效；编辑器打开期间另一处批准的扩展会被旧的预填值撤销）：`06` §6.2.5 生效额度一条（唯一规则）改为**命令层的并入**：`contract.amend` 在服务端生成新版本时，`Budget` 中 `patch` 未给出的字段取提交时的生效额度，给出的字段以 `patch` 为准；`patch` 含预算字段时命令须带 `budgetBase`（客户端预填所依据的生效额度），与提交时的生效额度不同 → `E_CONFLICT`，客户端重新预填，由人确认后重试；编辑器预填只是显示。`16` §16.5 的比较对象不变（修订前的生效额度，与之相同不算提高，低于它即显式降低，远程规则照 §16.5）。`06` `contract.amend` 一行补参数并引用 §6.2.5；`04` 合同编辑器一行与 `16` §16.5 预算一行同步。没有采用 `expect.ver`：Goal 投影在运行中频繁变化，按投影版本比较会产生与预算无关的冲突。**测试**：G33f 补 (e)（硬上限扩展后经“改为 human 标准”修订，新版本的 `usdHard` 等于扩展后的值）与 (f)（编辑器打开期间在手机上批准扩展，保存返回 `E_CONFLICT` 并重新预填）。
- **R71-D6-01**（次要；“彻底忘记”中“一并删除这些会话”的选择与会话清单在命令、事件与续做规则中都没有落点，事务之后无从续做）：`06` §6.4.3 `privacy.purge` 行（唯一定义）：命令加可选参数 `sessionIds`（`{goalId, sessionId}` 列表，只接受界面列出的受影响会话中属于已归档或已放弃 Goal 的，否则 `E_STATE`），原样写入同一事务中不带 `filesDone` 的 `privacy.purged`；会话文件在事务之后与其余文件一起幂等删除，续做只按事件中的 `sessionIds` 定位。§6.1.6 续做行同步；`09` “彻底忘记”一行引用。没有采用“在事务之前删除会话”：与 Tower 其余文件的删除顺序（数据库先提交、文件后幂等删除）保持一致，人的选择因此有持久的落点，可由事件核对。**测试**：G46 补一组（对已归档 Goal 注入过的记忆“彻底忘记”并选择“一并删除这些会话”，文件阶段终止后重启）。

**评审结论中的观察（R71 结论部分）**
- 观察 1（“本机从不复用”的措辞）：`02` §2.2 改为“本机不复用；高水位丢失时至少不与已有目录、地标同名”；`10` §10.2 引用处同步为“本机不复用”。
- 观察 2（高水位文件无法解析）：`02` §2.2 分配规则补半句：该文件不存在或无法解析时视同缺失，只取数据库最大编号，跳过规则照常兜底；高水位在 `goal.created` 提交之前重写（原有）。
- 观察 3（`project` 档的重复续做）：`06` §6.1.6 续做行补一句：按 `seq` 逐条续做，每条执行前重新判定是否已配对，因此 `project` 档续做完成后其逐 Goal 的事件已配对，不再重复执行。
- 观察 4（检验检出的临时目录与服务数据目录）：`10` §10.8.3 第 3 步写出位置 `$TMPDIR/tower-inspect-<goalId>/`（临时目录与服务数据目录都在其中，不在 `~/.tower` 之下，因此不涉及 `11` §11.6.2 的回退例外；关闭检验时随检验目录一并删除）；`11` §11.6.3 检验检出一段引用。
- 观察 5（多机下的编号）：无改动，属已登记的范围限制（ADR-028）。
- 观察 6（取舍判断）：无改动；“已存在时拒绝”的代价按 R71-D13-01 写入正文，预算并入按 R71-D4-01 移到命令层。

**推迟到 M2 / 删除**
- 删除：`02` 的“本机从不复用”；`10` §10.2 的“不改名”（改为 Tower 不自行改名，只在人选择时改名）；`09` “只有两种”；`06` §6.2.5 由编辑器预填完成并入的说法。
- 推迟到 M2：无。
- 改弱为真：`02` GoalId 的不复用说法。
- 新增的只有：`10` §10.2 一段（识别、出口与代价）、§10.8.4 两处删除顺序；`06` `goal.take_over`、`contract.amend`、`privacy.purge` 各一个参数，`privacy.purged` 载荷一个字段，§6.2.5 一句，§6.1.6 两句，`goal.hand_back`、`goal.discard_human_edits` 的删除顺序，§6.6.1 目录树一处注释；`02` 半句；`04` 两段文案；`09` 三处引用（含“清除全部”回退位置一句覆盖移到一边的目录）；`10` §10.8.3 一个路径；`11` 一处引用；`16` §16.5 半句；`14` G46 两组与 G33f (e)(f)。没有新状态、事件类型、表、决定种类、`step` 取值或列。
- `16` §16.1.13 补登第 71 轮被取代的说法 1 行。

- **lint**：评审 §3.1 的建议未新增检查：预算并入现在由命令完成，界面各修订入口无需各自引用；`privacy.purge` 的人选项只有这一处。被取代的说法由 (D) 检查。全部检查：`--checks rstuvwxyzckdnSeRqpoPiDgKYATFMBOJCH`。
- **排期**：+0.03 人周（W5 +0.01 → 桌面；W12 +0.01 → 桌面，其中改名一步原属 W7 系统线，按 ADR-136 改由接管界面的负责人完成，复用 W7 已有夹具；W17 +0.01 → 设计；其余各项按 WBS 行不足 0.01，计 0；系统线 0）；`14` §14.3.4 与 ADR-133 第 71 轮补记一致：WBS 122.89，余量 系统 0.12、Agent 0.26、桌面 0.37、设计 0.85、安全 0.20，依赖链 19.91，增 1 人 128.80 / T 23.78 / 33 周，**M1 维持 38 周**。

## 第 72 轮对抗评审（全范围）后的跨文档决策（ADR-200）

## ADR-200 drain 恢复行不再要求 Run 未结束、“一并删除这些会话”覆盖年度归档包 — Accepted（R72 全部条目与评审结论中的观察；Amends ADR-199；Amended by ADR-201）

选择原则（收敛规则，同 ADR-186–199）：只用三种办法关闭条目——(1) 把说法改弱但为真；(2) 删除或推迟不属于 M1 主循环的机制；(3) 在已有的唯一定义处加至多一条守卫、一行或一个字段。本轮两条都是次要，各是一个窗口或位置被漏掉：drain 恢复行的触发条件漏了 `run.ended` 已提交、原目标尚未完成的窗口；会话删除的定位漏了年度归档包。每条在唯一定义处改一句，其余位置改为引用。不新增状态、事件类型、表、决定种类、`step` 取值、列、命令参数或载荷字段。“绝不碰用户的工作现场”（`10` 设计基调）、“不丢人的改动”与全部安全不变式保持；拿不准时取对人的数据更保守的行为（保留并列出）。安全问题只写到设计层面。

**条目（R72 追问清单）**
- **R72-D6-01**（次要；drain 协议先写 `run.ended` 再执行原目标，接管物化 H 与回退恢复检查点落在这个窗口中；`06` §6.1.6 的 drain 恢复行只在“Run 未结束”时触发，窗口内中断后 Goal 停在没有 Run 的 `running`，“我来改”一直 `E_BUSY`，ADR-199 的“移到一边”到不了）：取评审给出的第一种写法——`06` §6.1.6 “Run 在 drain 中途”一行（唯一规则）的触发条件改为 `goals.draining_for` 非空，不论 Run 是否已结束；Run 已结束时不再写 `run.ended`，恢复动作不变（`take_over`/`rewind` → `paused(reasons ∪ {human})`，由人重做；同一事务清除 `draining_for`）。接管物化中断后 Goal 因此进入 `paused(human)`，再按“我来改”得到 ADR-199 的 `E_STATE` 与“移到一边并重新开始”（`paused(*)` 是 `goal.take_over` 的源状态，不再 `E_BUSY`）。没有采用“`run.ended` 与原目标一并提交”：它要改 `06` §6.1.4 drain 协议的书写顺序及其在 `05`、`16` 中的引用，改动面大于一个触发条件。`10` §10.2 在接管来源处补一句引用。**测试**：G35e 补 (m)（从 `running` 接管，drain 结束之后、接管事务之前终止 → 重启为 `paused(human)` → 再次“我来改”移到一边；回退一组在恢复检查点中途终止 → `paused(human)`）。
- **R72-D12-01**（次要；“一并删除这些会话”只按 `~/.tower/goals/<goalId>/sessions/` 定位，已移入 `db-backups/sessions-<年>.tar.zst` 的会话既不删除也不列出）：取“覆盖归档包”，与“清除一个 Goal”一致——`06` §6.4.3 `privacy.purge` 行（唯一定义）改半句：会话文件在 Goal 目录中或已移入的年度归档包中，后者按 `09` §9.12.4 “清除一个 Goal”同一方式重写该归档包（写新包后原子替换）。续做仍只按事件中的 `sessionIds` 定位；重写是幂等的（包中已没有该会话时不再改动）。`06` §6.1.6 续做行与 `09` “彻底忘记”一行引用。**测试**：G46 “一并删除这些会话”一组补一个已移入年度归档包的会话。

**评审结论中的观察（R72 结论部分）**
- 观察 1（`04` §4.6.7 文案的边界）：文案末尾补半句“若你曾在 Tower 之外移动过它，请先检查其中的内容”。
- 观察 2（保留检验目录后的临时目录）：`10` §10.8.3 第 3 步改为第 7 步停止服务时即删除 `$TMPDIR/tower-inspect-<goalId>/`，人选择“保留目录，稍后决定”时同样删除，不随检验目录保留（服务在第 7 步一律停止，临时目录此后没有用处），因此清除清单无需列出它。
- 观察 3（`.kept-` 目录的记录位置）：不新增字段。`10` §10.2 写明按 `_human/<goalId>.kept-*` 列出；`02` §2.2 的编号分配同样跳过已有这类目录的编号，因此高水位丢失时也不会把旧 Goal 的 `.kept-` 目录列到新 Goal 名下。
- 观察 4（残留 H 在终态 Goal 中的去向）：`09` §9.12.4 “人的工作现场”改为四种，补上接管或删除中断后、人再次“我来改”之前 Goal 已终结时留下的 `_human/<goalId>`。`10` §10.3.2 “删除卫星时”取更保守的一边：`humanCheckout` 为空时留下的 `_human/<goalId>/` 同样保留并列出，Tower 不据此判断其中的内容，与 `10` §10.2 的口径一致。
- 观察 5（修订后的合同差异视图）：`04` 修订时的预算一条补一句：版本差异中预算字段的变化等于两版之间已批准的扩展时，旁注“并入已批准的扩展”。
- 观察 6（`05` §5.6.5 的引号）：已在 `research/pi-mono` v1.2.0 核对，改为原文：`agent-session.ts:1030-1035` `_reportInvalidBoundaryContinuation` 发出扩展错误 `agent_before_settle requested continuation without runnable model context`；`:1992-1993` 在不可继续时调用它并返回 `false`，不抛出异常。
- 观察 7（取舍判断）：无改动。

**推迟到 M2 / 删除**
- 删除：`06` §6.1.6 drain 恢复行的“Run 未结束”条件；`10` §10.8.3 “关闭检验时随检验目录一并删除”；`09` “有三种”；`10` §10.3.2 删除卫星时对 `humanCheckout` 为空时残留的删除；`05` 引号中的概括文本。
- 推迟到 M2：无。
- 新增的只有：`06` §6.1.6 一个触发条件的改写与续做行半句、§6.4.3 半句；`10` §10.2 两处引用、§10.3.2 半句、§10.8.3 一句；`02` §2.2 半句；`09` 两处；`04` 两句文案；`05` 一处引文；`14` G35e (m) 与 G46 一个会话。没有新状态、事件类型、表、决定种类、`step` 取值、列、命令参数或载荷字段。
- `16` §16.1.13 补登第 72 轮被取代的说法 1 行。

- **lint**：评审 §3.1 的建议未新增检查：写出会话文件路径的删除规则只有 `09` “清除一个 Goal”与 `06` `privacy.purge` 两处，后者现引用前者；drain 恢复的触发条件要靠语义判断。被取代的说法由 (D) 检查。全部检查：`--checks rstuvwxyzckdnSeRqpoPiDgKYATFMBOJCH`。
- **排期**：+0.01 人周（W17 +0.01 → 设计；R72-D6-01 只去掉一个触发条件，夹具复用 G35e 与 G46，按 WBS 行不足 0.01，计 0；其余各项不足 0.01，计 0；系统线 0）；`14` §14.3.4 与 ADR-133 第 72 轮补记一致：WBS 122.90，余量 系统 0.12、Agent 0.26、桌面 0.37、设计 0.84、安全 0.20，依赖链 19.91，增 1 人 128.81 / T 23.78 / 33 周，**M1 维持 38 周**。

## 第 73 轮对抗评审（全范围）后的跨文档决策（ADR-201）

## ADR-201 被改动的项目 Pi 配置在 M1 中不加载、事后检测到的 `protected` 写入交给验证时的哨兵、drain 进行中卫星丢失先结束 drain、三类 Needs-You 的登记 — Accepted（R73 全部条目与评审结论中的观察；Amends ADR-200、ADR-125；Amended by ADR-202、ADR-225、ADR-226、ADR-228）

选择原则（收敛规则，同 ADR-186–200）：只用三种办法关闭条目——(1) 把说法改弱但为真；(2) 删除或推迟不属于 M1 主循环的机制；(3) 在已有的唯一定义处加至多一条守卫、一行或一个字段。本轮七条都是次要，都不是 ADR-200 的回归，可归为三类：恢复规则的交叉或口径不一（R73-D6-01、R73-D6-02）；正文生成了条目或给出了选项、登记处或命令表没有对应（R73-D8-01、R73-D11-01、R73-D11-03）；分类或源状态在某一处漏了一类（R73-D11-02、R73-D15-01）。其中三条以删除或推迟关闭：项目 Pi 配置的“加载”选项推迟到 M2，事后检测的运行中暂停删除，运行中三要素的独立 Needs-You 删除、改为授权生效之前的警告。每条在唯一定义处改一两句，其余位置改为引用。不新增状态、事件类型、表、决定种类、Needs-You kind、`step` 取值、列、命令参数或载荷字段；新增的只有一个哨兵 id `bash_overridden`（M2，只登记已有的 severity 2 条目）与 `08` 中已有 kind `anomaly` 的一个去重键。“绝不碰用户的工作现场”（`10` 设计基调）、“不丢人的改动”与全部安全不变式保持；拿不准时取更严格的行为（不加载、保留并列出、终止）。安全问题只写到设计层面。

**条目（R73 追问清单）**
- **R73-D11-03**（次要；Agent 改动项目的 `.pi/`、`.agents/` 后以不信任启动并问“是否在下一个 Run 中加载？”，但判定式没有由人的决定引入的项，“是”没有定义，同意也没有绑定到内容）：取评审给出的第二种写法，并写明“否”加载什么。`11` §11.8.1 每个 Run 启动时复核一条（唯一定义）：
  - **不信任启动加载什么**：Pi 不加载该项目的任何受信任保护资源——`.pi/settings.json`、`mcp.json`、`extensions/`、`skills/`、`prompts/`、`themes/`、`SYSTEM.md`、`APPEND_SYSTEM.md`，以及 cwd 与祖先目录中的 `.agents/skills`——也不加载它们在 baseCommit 中的版本；用户级扩展与 MCP 按 §11.8.2、上下文文件按“上下文文件复核”照常加载。
  - **Pi v1.2.0 依据**（`packages/coding-agent/src/core/`）：资源清单 `trust-manager.ts:30-39`；不信任时项目设置为空 `settings-manager.ts:364-366`；项目扩展、技能、提示、主题与祖先 `.agents/skills` 只在信任时收集 `package-manager.ts:2465-2468`、`:2484-2502`、`:2520-2535`；`SYSTEM.md`、`APPEND_SYSTEM.md` 同 `resource-loader.ts:1214-1215`、`:1228-1229`；信任按整个项目一次判定 `resource-loader.ts:520-524`；CLI `--no-approve` 的说明为“Ignore project-local files for this run”（`cli/args.ts:342`）。这些文件只从 cwd（卫星）读取，Pi 没有“只加载 base 版本”或“只加载某一哈希的内容”的入口。
  - **因此 M1 不提供“加载”**：项目 Pi 配置相对 baseCommit 有改动时（不论来自 Agent 还是人工编辑检出），M1 的任何 Run 都不加载项目配置；能力摘要与 Goal 卡片第 5 行显示 `◇ 项目 Pi 配置已被修改，本 Run 未加载`（列出文件），不生成 Needs-You，因此不需要登记 kind。重新加载只有两条途径：把这些路径改回 baseCommit 的内容（例如在“我来改”中），下一个 Run 的复核即为信任；或改动经验收并入 base（这些路径默认受保护，验证时按 `07` §7.6.1 `protected_path` 列出），之后的 Goal 以新的 baseCommit 照常复核。
  - **推迟到 M2**：人在 Run 之间确认加载，并把确认绑定到所列文件的内容哈希（下一个 Run 启动时逐一比对，不同则作废并重新询问；须同时处理 Run 期间的重载）。
  - 没有采用“只加载 base 中的版本”：在 Pi 的加载方式下无法实现，除非 Tower 改写卫星，那会覆盖 Agent 的工作。没有采用 M1 中按哈希绑定的“是”：它需要新的决定种类、Needs-You kind 与出口，并要在 Host 启动与 Pi 读取之间排除卫星被改写的窗口，超出收敛规则。
  - `05` §5.4.1 引用；`04` 卡片第 5 行补 `◇` 提示。**测试**：G46 (bh)(1)。
- **R73-D11-01**（次要；事后检测到 `protected` 写入时“按合同停止条件 `path_touched` 暂停 Run”，但停止条件只在工具执行前求值，`protected` 不编译为停止条件、没有 `conditionId`，三个出口在命令表与注意力登记中都没有，卡片会断言“该改动没有发生”）：取评审给出的第二种写法“只在 pin 时处理”。`11` §11.4 事后检测一条（唯一定义）：运行中只在记录检查点的同一事务使 S0 授权失效（§11.2 失效条件 (ii)，不变），不暂停 Run、不生成 Needs-You、不记哨兵命中。命中由验证时的 `scope_breach`（`07` §7.6.1，推导来源为 pin，与 `16` §16.1.6 一致）判定：`protected_path` 为 severity 3，阻止进入 `in_review`，按 `07` §7.10.1 生成 Needs-You `sentinel`，出口用已有的哨兵出口；卡片按 pin 中的改动列出路径，写明改动已发生。“恢复这些路径”的命令因此不需要。`04` 停止条件卡片的“该改动没有发生”只用于执行前的拒绝，不变。
- **R73-D6-01**（次要；卫星在 drain 进行中丢失时 `06` §6.1.6 “卫星丢失”与“Run 在 drain 中途”两行都能触发，情形 E 也没有 drain 进行中的分支；照字面实现要么违反 `goals` 的 `CHECK`，要么丢掉人的暂停）：取评审给出的第一种写法，运行时与重启时同一规则。`06` §6.1.6 卫星丢失一行（唯一定义）补一条守卫：`draining_for` 非空时先按“Run 在 drain 中途”一行的结果结束 drain（`pause` → 以 `reasons` 进入 `paused`；`take_over`/`rewind` → 放弃原目标，`paused(reasons ∪ {human})`；`dependency` → 按该行；同一事务清除 `draining_for`；运行时 Run 已 abort，`run.ended` 只写一次），Goal 由此离开 `running`，卫星丢失随后按非 `running` 的叠加态处理。`satellite_missing` 因此不成为暂停原因，人的暂停与 `reasons` 中的 `external_change` 都保留，`CHECK` 成立；没有采用“把 `satellite_missing` 并入 `reasons`”，叠加态已能重建卫星，并入只多一个需要人处理的原因。`10` §10.16.2 情形 E 的 `running` 分支引用。**测试**：G35e (n)。
- **R73-D11-02**（次要；`sandbox_violation` 的类别随 `<wtRoot>` 的位置变化：默认位置下被拒绝访问的 `_human`、`_inspect`、`_verify`、其他 Goal 的 `_stores` 与 `$TMPDIR/tower-*` 落入 `system`，回退位置下为 `tower_data`）：`16` §16.1.6 类别定义（唯一定义）把 `tower_data` 扩为同时包括 Tower 为 Goal 或为人创建的目录——`<wtRoot>` 中的 `_human/**`（含 `.kept-` 目录）、`_inspect/**`、`_verify/**`、`_stores/**` 与 `$TMPDIR/tower-*`——按目标的种类判定，不随位置变化；补默认位置的判例。判定顺序不变（先 `credential`，再 `user_checkout`、`other_satellite`，再 `tower_data`）；本 Goal 自己的允许项不会被拒绝，因此不受影响。只提高告警级别，不放宽任何拒绝。`11` §11.6.2 的类别含义处引用。**测试**：G46 (bh)(2)。
- **R73-D8-01**（次要；三处正文生成 severity 2 的 Needs-You 而没有 kind、去重键与出口定类）：
  - **运行中因授权凑齐的致命三要素**：映射到已有的 `approval`。运行时 `Grant` 只能由人在本机审批卡片上选择“本 Goal 内同类”产生，所以在授权生效之前判定：卡片对该选项重算三个布尔值，由不全为真变为同时为真时在该选项上方显示与批准合同时相同的警告与收紧选项，人坚持时 `approve_action` 的 `note` 记 “trifecta acknowledged”，与 ADR-180 合同修订后的重算同一形式。不另生成 Needs-You；去重与定类按 `approval`。`11` §11.8 第 2 条（唯一定义）；`04` §4.10.2 致命三要素一条引用。
  - **`structured_content_dropped`**：并入已有的 `anomaly`，去重键 `an:{goalId}:structured_content_dropped`（`08` §8.4 补一行），出口“知悉”→ `informative`（`08` §8.8 补一行；Tower 无法补回丢失的退出码，处置在 Tower 之外）；`16` §16.1.7 的 `anomaly` 列表与 §16.1.6 的 anomaly 行补登；`07` §7.10.1 的路由写明 `NY anomaly`。
  - **bash 被扩展覆盖后降为 S0**：登记为哨兵 `bash_overridden`（severity 2，Needs-You `sentinel`，去重键 `s:{goalId}:bash_overridden` 即 `08` §8.4 `s:{goal}:{detector}` 的一例，出口与定类按 `08` §8.8 `sentinel` 一行）；它与 §11.2 的 S0 执行授权 `approval` 是两条，后者在降级后首次运行测试或构建时照常询问。只可能在 RPC 适配器下出现，属 M2。`16` §16.1.6、`07` §7.10.1 各补一行；`11` §11.4（唯一定义）、`05` §5.3.5、`04`、`12` 引用。
- **R73-D6-02**（次要；重启后按令牌终止哪些 Run 的后台进程，`06` 只写未结束的 Run，`10`、`13`、`16` 还包括有未解决 `bg_process_survived` 的 Run）：取“覆盖”，即更严格的一边。`06` §6.1.6 “Agent 后台进程”一行（唯一定义）的触发条件改为“未结束 Run 的令牌，或有未解决 `bg_process_survived` 的已结束 Run 的令牌”；存活者全部终止时存活期间结束，仍打开的条目按 `08` §8.4 以 `obsolete` 关闭。§6.1.10、`10` §10.3.1（扫描时机 ② 与崩溃重启一句）、`13` §13.11.1、`16` §16.4 引用。**测试**：G35c (w)。
- **R73-D15-01**（次要；`04` §4.6.7 漏列 `ready` 作为“我来改”的源状态，默认选项与放弃改动的文案也漏了）：`04` §4.6.7 补 `ready`（工作目录已完成检出时；工作区尚未建立或准备进行中不可用），并注明源状态与守卫以 `10` §10.8.4 为准；交还对话框从 `ready` 发起时默认选中 1；放弃改动写“从 `running` 或 `ready` 接管的回到 `paused(human)`（`ready` 原来的排队类别保留）”。

**评审结论中的观察（R73 结论部分）**
- 观察 1（回退（M2）中途终止后的卫星）：记为 M2 的已知限制。`06` §6.1.6 drain 恢复行写明：回退在恢复检查点中途中断时卫星是新旧混合的树，M2 实现回退时须先以第 0 步的 `safety` 检查点按 `restorePaths` 还原卫星（作为 Tower 自己的写回窗口），再进入 `paused(human)`。`14` G35e 注明各组中涉及回退的部分属 M2、不计入 M1 补跑。
- 观察 2（整理后的检验目录）：`10` §10.8.3 带回一段补一句：删除检验目录时中断，若该 Goal 最近一条 `inspect.opened` 之后已有 `HumanDecision{bring_back_inspection}` 且 `humanCheckout` 为空，重启时直接删除留下的目录，不按已打开的检验处理。T_pin 的记录位置不在本轮改动。
- 观察 3（年度归档包的写者）：`06` §6.6.4 会话保留一行写明三个写者（180 天移入、“清除一个 Goal”、`privacy.purge` 的会话删除）持同一把归档包锁串行，各自在锁内读入当前的包、写新包后原子替换。
- 观察 4（Trace 按需解压的位置）：同一行写明解压到 `~/.tower/tmp/`（启动时清空），关闭 Trace 时删除。
- 观察 5（归档清理的崩溃与 `integrated` 的叠加态）：`10` §10.3.2 `integrated` → `archived` 一行写明 `archived` 转移先提交、三步其后按序幂等执行，重启时对卫星仍在或仍有待删分支的 `archived` Goal 续做；`10` §10.16.2 情形 E 的叠加态列表补 `integrated`（归档前的宽限期）。
- 观察 6（文案中的例子）：`04` §4.6.6 的例子由“自动 rebase”改为“有进程写了工作目录”，与 `10` §10.8.3 一致。
- 观察 7（历史文字）：`14` §14.3.4 依赖链口径句补“第 70–73 轮 0”。
- 观察 8（清除后的审计地标）：取更保守的一边——`09` §9.12.4 写明清除之后 Tower 不再按“归档 180 天后”删除该 Goal 的审计地标，与分支一样由人自行删除；`10` §10.6.2 地标一行引用。
- 观察 9（`app_quit` 的自动解除）：`06` §6.1.6 drain 恢复行改为“按 §6.1.4 第 5 项在启动时自动解除（只在 `resumeOnLaunch` 打开时）”。

**推迟到 M2 / 删除**
- 删除：`11` §11.8.1 “是否在下一个 Run 中加载？”的 Needs-You；`11` §11.4 事后检测命中 `protected` 时的运行中暂停与三个出口；`11` §11.8 运行中三要素的独立 Needs-You；`04` 文案中“自动 rebase”的例子。
- 推迟到 M2：在 Run 之间确认加载被改动的项目 Pi 配置（绑定内容哈希）；回退中途中断的卫星还原（记为已知限制）。
- 新增的只有：`11` §11.8.1 一段（加载什么与恢复途径）、§11.4 两处改写、§11.8 一句、§11.6.2 半句；`16` §16.1.6 类别定义半句与判例、`bash_overridden` 一行、anomaly 行半句，§16.1.7 半句，§16.4 半句；`08` §8.4、§8.8 各一行；`07` §7.10.1 一行与一处路由；`06` §6.1.6 两行的守卫与触发条件、drain 恢复行两处半句，§6.1.10 半句，§6.6.4 一句；`10` §10.3.1 两处引用、§10.3.2 半句、§10.6.2 半句、§10.8.3 一句、§10.16.2 两处；`13`、`05`、`12` 引用；`04` 四处文案；`09` 一句；`14` G35c (w)、G35e (n) 与 M2 注、G46 (bh)。没有新状态、事件类型、表、决定种类、Needs-You kind、`step` 取值、列、命令参数或载荷字段。
- `16` §16.1.13 补登第 73 轮被取代的说法 1 行。

- **lint**：评审 §3.1 的两条建议未新增检查：重启后的终止范围现由 `06` §6.1.6 一行定义，其余四处引用该行；三处无 kind 的 Needs-You 已分别并入 `approval`、`anomaly` 与 `sentinel`，“Needs-You 与 severity 同句须有 kind”的检查在现有正文中误报较多（大量句子描述已登记 kind 的 severity），不机械化。被取代的说法由 (D) 检查。全部检查：`--checks rstuvwxyzckdnSeRqpoPiDgKYATFMBOJCH`。
- **排期**：+0.02 人周（W4 +0.01 → 桌面，按 ADR-136 先例由退出与恢复的负责人完成；W14 +0.01 → 设计；其余各项按 WBS 行不足 0.01，计 0；系统线 0）；`14` §14.3.4 与 ADR-133 第 73 轮补记一致：WBS 122.92，余量 系统 0.12、Agent 0.26、桌面 0.36、设计 0.83、安全 0.20，依赖链 19.91，增 1 人 128.83 / T 23.79 / 33 周，**M1 维持 38 周**。

## 第 74 轮对抗评审（全范围）后的跨文档决策（ADR-202）

## ADR-202 M1 中 Pi 的项目信任恒为假、项目的声明性资源以显式路径传入、项目扩展与包与 MCP 推迟到 M2 — Accepted（R74 全部条目与评审结论中的观察；Amends ADR-201、ADR-004；Amended by ADR-203、ADR-204）

选择原则（收敛规则，同 ADR-186–201）：只用三种办法关闭条目——(1) 把说法改弱但为真；(2) 删除或推迟不属于 M1 主循环的机制；(3) 在已有的唯一定义处加至多一条守卫、一行或一个字段。本轮只有一条重要条目，取评审给出的严格一边，以推迟关闭：M1 不再让 Pi 以信任加载项目，项目扩展、项目包与项目 MCP 服务器整体推迟到 M2。新增的只有 `RunSpec.projectResources` 一个字段（Supervisor 枚举、Host 传给 Pi 的文件列表）。不新增状态、事件类型、表、决定种类、Needs-You kind、`step` 取值、列或命令参数。安全问题只写到设计层面。

**条目（R74 追问清单）**
- **R74-D11-01**（重要；信任复核只比较 `.pi`、`.agents`，而 Pi 在信任下于宿主中、在沙箱外执行的代码可以来自卫星中 Agent 可写、默认也不受保护的其他路径：项目设置引用的本地扩展与包、`mcp.json` 启动的仓库脚本、项目扩展导入的仓库模块与依赖）：
  - **Pi v1.2.0 核实**（`packages/coding-agent/src/`）：
    - **信任不能部分授予**。它是设置管理器上的一个布尔值（`core/settings-manager.ts:469-481`），按整个项目一次判定（`core/resource-loader.ts:520-524`）。
    - **能拦的开关都过宽或过晚**：`extensionsOverride` 在扩展加载之后才过滤（`:596`）；`noExtensions` 去掉全部设置来源的扩展，含用户级与内置的 MCP（`:577-583`）；`disabledBuiltinExtensions:["mcp"]` 同样去掉用户级 MCP。
    - **不信任时的行为**：
      - 项目设置为 `{}`（`settings-manager.ts:364-366`）；
      - 项目扩展、技能、提示、主题与祖先 `.agents/skills` 不收集（`core/package-manager.ts:2465-2468`、`:2484-2502`、`:2520-2535`）；
      - 项目包的安装位置拒绝访问（`package-manager.ts:1781-1785`）；
      - 内置 MCP 只读用户级 `mcp.json`（`extensions/mcp/config.ts:145-149`，信任状态取自 `extensions/mcp/index.ts:1344` → `core/agent-session.ts:3465`）；
      - 项目 `SYSTEM.md`/`APPEND_SYSTEM.md` 改读用户级（`resource-loader.ts:1213-1239`）；
      - 用户与 CLI 扩展照常加载（`:505-511`）；
      - `AGENTS*.md`/`CLAUDE.md` 不受信任控制（`:232-274`、`:646-653`）。
    - **显式入口不受信任控制**：`additionalSkillPaths`、`additionalPromptTemplatePaths`、`additionalThemePaths`、`systemPrompt`、`appendSystemPrompt`（`resource-loader.ts:276-313`、`:599-676`；`core/skills.ts:482-503`；SDK 经 `core/agent-session-services.ts:44`、`:148-154`）。RPC 的对应参数为 `--skill`/`--prompt-template`/`--theme`/`--system-prompt`/`--append-system-prompt`（`cli/args.ts:121-125`、`:193-201`，`main.ts:781-793`）。
    - **显式入口只解析 Markdown 与 JSON**（主题 `modes/interactive/theme/theme.ts:551-555`），不执行代码。
    - 不传 `resolveProjectTrust` 时，Pi 沿用设置管理器的信任状态（`resource-loader.ts:520-528`），也不询问扩展的 `project_trust`。
    - **结论**：Pi 支持部分加载，做法是“信任为假 + 显式路径”，不是部分信任。
  - **规则**（`11` §11.8.1 唯一定义，`05` §5.4.1 引用）：
    - **不变式**：M1 中 Tower 从不让 Pi 在 Engine Host 中或作为其子进程执行来自项目的代码。
    - **Pi 的项目信任恒为假**：SDK `SettingsManager.fromStorage(storage, {projectTrusted:false})`，不传 `resolveProjectTrust`；M2 的 RPC 恒传 `--no-approve`。
    - **ADR-201 的复核保留，只决定是否传入声明性资源**：`Project.trust == trusted`、`.pi`/`.agents` 相对 baseCommit 无变化、祖先目录检查通过。为真时，Tower 按 Pi 的发现规则从 base 的树中枚举技能、提示、主题、`SYSTEM.md`/`APPEND_SYSTEM.md` 与 `.agents/skills`（祖先目录取批准时的清单）。其中的普通文件以显式路径传入；符号链接不传入；被忽略的文件不在 base 的树中，也不传入。由此顺带关闭了评审指出的 S0 下被忽略文件的盲区。
    - **永不加载的**：项目 `settings.json`（含其中的 `extensions`、`packages` 与资源路径）、项目扩展、项目包、`.pi/mcp.json` 的服务器。不论 `Project.trust` 与 base 如何，M1 中都不加载。
    - 本条取代 ADR-201 中“未改动即以信任加载全部项目配置”对会执行代码的资源的部分；ADR-201 对声明性资源的规则（改动后不加载、两条恢复途径、`◇` 提示、M2 的哈希绑定确认）不变。
    - ADR-004 的“项目信任（两种适配器一致）”一条改为：两种适配器都不让 Pi 信任项目；条件判定只决定是否传入声明性资源。
  - **推迟到 M2**：项目扩展、项目包与项目 MCP 服务器的加载，须带显式的批准设计。批准须覆盖它们引用的 `.pi` 之外的代码：本地路径、`mcp.json` 命令行中的仓库脚本、扩展的导入图。
  - **同步**：
    - `11` T4 写明代码路径已关闭，残余只剩指令类，评级仍为低；T16 去掉“受信任项目的 `.pi` 扩展”，补写用户级扩展或 MCP 自己执行卫星文件这一残余，评级不变（中）。
    - `11` §11.8.2 残余补同一句；静态清单只含用户级。
    - `11` 审计行改为“复核的结果及原因与传入的项目资源文件”。
    - `00` §0.5 一处、§0.5.1 一行；`README` 第 8 条；`04` §4.18.1 第 4 步的信任提示文案。
    - `02`、`06` 的 `trust` 注释；`05` §5.2.1、§5.3.1、§5.3.3、§5.3.5、§5.4.1、§5.6.5、§5.9 G2、§5.10、§5.11 D2/D9/C11。
    - `16` §16.1.12 `Project.trust.state` 一行。
    - **测试**：G46 (bh)(1) 改写为：三个 Run 中项目扩展、两个包与 MCP 服务器都不加载；声明性资源随复核加载、不加载、再加载；S0 下被忽略的技能不传入；信任提示分两组。C11 扩充。
  - **没有采用**：
    - “扩大比较范围并如实登记残余”：扩展导入图（含依赖目录）无法静态封闭，残余正落在安全边界最核心的一类。
    - “`noExtensions` + 关闭内置 MCP”：会连用户级扩展与 MCP 一并去掉，违背 ADR-004 第 5 点。
    - “从 base 物化一份声明性资源供加载（连改动后也加载 base 版本）”：技能以相对路径引用目录内其他文件，物化副本与卫星中的不同；且超出收敛规则。

**评审结论中的观察（R74 结论部分）**
- 观察 1（`00` 的措辞）：`00` §0.5、§0.5.1 改为“相对 base 未被修改”，并写明项目扩展、项目包与项目 MCP 服务器在 M1 中不加载。
- 观察 2（运行时卫星丢失时的 drain 结束）：`06` §6.1.6 卫星丢失一行补半句：正常结束 drain 时记录的回合检查点这时无从记录，跳过；重建从影子中可用的最新检查点开始，不丢数据。
- 观察 3（归档续做的范围）：`10` §10.3.2 写明按删除条件保留的分支每次重启都重新判定一次，这是有意的（保留的原因可能已消失）；判定只读，删除以 CAS 守卫，条件仍不满足时照旧保留。
- 观察 4（已结束 Run 的存活者）：`06` §6.1.6 “Agent 后台进程”一行补半句：所属 Goal 已没有卫星时照常终止、跳过 `agent_bg_done` 检查点，不丢数据。

**推迟到 M2 / 删除**
- 删除：M1 中 Tower 让 Pi 信任项目的做法（SDK 的 `resolveProjectTrust` 回调、RPC 的 `--approve`）；静态清单中“受信任项目的 `.pi/extensions/`”的枚举。
- 推迟到 M2：项目扩展、项目包与项目 MCP 服务器的加载及其批准设计。
- 新增的只有：`11` §11.8.1 的不变式与“传入什么”一段（替换原“传递方式”与理由句）；`05` `RunSpec.projectResources` 一个字段与 Host 骨架中的五个显式选项。其余为引用、文案与注释。
- `16` §16.1.13 补登第 74 轮被取代的说法 1 行。

- **lint**：`xref.py` 的 DELETED 补两项，出现时须带 M2 标记（DEL_OK），由 (d) 检查：“Tower 让 Pi 信任项目”的写法（`才传 --approve`、`resolveProjectTrust → true` 等）与“受信任项目的扩展”。被取代的说法由 (D) 检查。评审 §3.1 建议的“信任复核路径集合须相同”未机械化：写出路径集合的句子现为 `11` §11.8.1 与 `05` 的 RunSpec 注释、§5.4.1、G2，`02`、`06` 的注释，都写 `.pi/**`、`.agents/**`；`00` 不再列路径。全部检查：`--checks rstuvwxyzckdnSeRqpoPiDgKYATFMBOJCH`。
- **排期**：±0.00 人周，没有系统线增量。
  - W6（Agent）以显式路径传入声明性资源：枚举复用添加项目时信任提示已有的 base 资源枚举，Host 只多五个选项。
  - 同一行删除了 `resolveProjectTrust` 的传递；W10 的静态清单少了项目扩展的枚举。
  - `04` 文案、G46 (bh)（复用已有夹具）与四条观察，按 WBS 行逐项不足 0.01，计 0。
  - `14` §14.3.4 与 ADR-133 第 74 轮补记一致：WBS 122.92，余量 系统 0.12、Agent 0.26、桌面 0.36、设计 0.83、安全 0.20，依赖链 19.91，增 1 人 128.83 / T 23.79 / 33 周，**M1 维持 38 周**。

## 第 75 轮对抗评审（全范围）后的跨文档决策（ADR-203）

## ADR-203 上下文文件名的集合与比较规则只定义一处、项目系统提示以内容传入 — Accepted（R75 全部条目与评审结论中的观察；Amends ADR-202、ADR-091；Amended by ADR-204）

选择原则（收敛规则，同 ADR-186–202）：只用三种办法关闭条目——(1) 把说法改弱但为真；(2) 删除或推迟不属于 M1 主循环的机制；(3) 在已有的唯一定义处加至多一条守卫、一行或一个字段。本轮只有一条次要条目，取评审给出的第一种写法（定义名字集合与比较规则，三道防护都按它），不取“登记残余”。新增的只有 `16` §16.1.12 一行。不新增状态、事件类型、表、决定种类、Needs-You kind、`step` 取值、列、命令参数或载荷字段。安全问题只写到设计层面。

**条目（R75 追问清单）**
- **R75-D11-01**（次要；上下文文件的 S2 写拒绝、默认 `protected` 与每个 Run 的复核都按区分大小写的名字匹配，窄于 Pi v1.2.0 实际加载的名字集合）：
  - **Pi v1.2.0 核实**（`packages/coding-agent/src/`）：
    - 每个目录的候选为 `AGENTS.override.md`、`AGENTS.md`、`AGENTS.MD`、`CLAUDE.md`、`CLAUDE.MD`，按此顺序以 `existsSync` 取第一个、`statSync` 为普通文件者（跟随符号链接）（`core/resource-loader.ts:184-203`）。同一清单另见 `core/tools/renderers/read.ts:26` 与 `docs/configuration.md:18`。
    - 范围：agentDir，加上从 cwd 到文件系统根的每一级目录，不在含 `.git` 的目录停止；嵌套在主仓库内的链接 worktree 自己的上下文文件遮蔽主仓库的同名文件（`:205-274`）。不受信任控制，`noContextFiles` 才关闭（`:646-653`；`docs/configuration.md:41-47`）。
    - 其他自动加载的指令文件：agentDir 的 `SYSTEM.md`/`APPEND_SYSTEM.md`，项目的只在信任时（`:1213-1239`，M1 中 Pi 的项目信任恒为假）；技能的描述（项目技能在 M1 中只经显式路径）。不再有其他按名字自动加载的指令文件。
    - 在大小写不敏感的卷（macOS 默认）上，`existsSync` 对任何大小写变体都为真。
  - **规则**（`16` §16.1.12“上下文文件名”一行，唯一定义）：
    - **名字集合**取上述候选清单。
    - **比较规则**：按 `10` §10.1.2 的名字比较规则（含大小写折叠），与 `.git` 名字同一做法。`**/AGENTS*.md`、`**/CLAUDE.md` 按折叠后的 `agents*.md`、`claude.md` 匹配路径的最后一个分量，覆盖该集合，不收窄原有的模式。
    - **四处都按它**：S2 写拒绝与祖先上下文文件的读允许（Seatbelt `regex` 写为逐字符的大小写类，`.pi`、`.agents` 两个目录名同样；非 ASCII 等价变体不在沙箱规则内，由复核与 `protected` 兜底，`11` §11.6.2）；默认 `protected` 与分类器（`02` §2.5，`11` §11.3.3）；上下文文件复核（`11` §11.8.1：对快照取完整的 `git diff --name-status`，再按名字规则筛选，不用区分大小写的 pathspec）；验收时“给 Agent 的指令文件”的标记（`07` §7.6.3）。
    - `09` §9.11 的事实句改为引用该行；`11` §11.1 与 `16` §16.1.10 的 `read.pi_resources`、`05` 的 S2 读允许列表同步。
    - `11` T4 写明三道防护按该集合识别，评级不变（低）。
  - **测试**：G46 (bh)(3)：大小写不敏感卷上新建只差大小写的上下文文件（含 `override` 变体）；S2 下被拒绝，S0 下复核列出、验证时 `protected_path` 列出、验收面板标为指令文件。
  - **没有采用**：
    - “在 T4 中登记残余”：名字规则只需在一处定义，四处引用即可；登记残余会让 T4 的三道缓解对 Pi 实际加载的文件失效。
    - “只用 git 的 `:(icase)` pathspec”：它只折叠 ASCII，与 `.git` 名字的比较规则不一致。

**评审结论中的观察（R75 结论部分）**
- 观察 1（残留的“受信任项目”措辞）：`11` §11.6.2 与 `05` 的 S2 读允许列表改为“从用户级 Pi settings 解析出的路径（M1 中项目设置从不读取）”。旧说法登记于 `16` §16.1.13，由 (D) 检查。
- 观察 2（信任提示与限制清单）：`04` §4.18.1 第 4 步第一组补 `APPEND_SYSTEM.md` 与 `.agents/skills`，与 `11` §11.8.1 一致；`00` §0.5.1 那一行补“以符号链接形式存在的项目技能、提示等不加载”。
- 观察 3（复核范围含永不加载的第二组）：保留比较整个 `.pi`、`.agents`，在 `11` §11.8.1 复核一条写明这是有意的保守取舍：比较范围与 `protected`、S2 写拒绝的路径相同，不随 Pi 的发现规则变化，代价只是少传一次声明性资源。没有收窄到第一组的路径：收窄后范围要跟随 Pi 的发现规则，且不减少任何风险。
- 观察 4（M2 的 RPC 设计备忘）：`11` §11.8.1 传递方式补一句：CLI 启动时 `runMigrations(cwd)` 不看信任，把项目 `.pi/commands` 迁移为 `.pi/prompts`（`main.ts:668`，`migrations.ts:257-263`），在沙箱外改写卫星的 `.pi`。M2 的 RPC 适配器须处理；SDK 路径不经过它，M1 不受影响。
- 观察 5（`systemPrompt` 以路径传入时的退化）：
  - **Pi v1.2.0 核实**：`systemPrompt`、`appendSystemPrompt` 经 `resolvePromptInput`：路径存在则读文件，否则把字符串本身当作提示文字（`resource-loader.ts:167-182`、`:657-670`）。所以传路径时文件消失会得到一条路径字符串；传内容时内容若恰好是某个存在的路径，Pi 会读那个文件。`systemPromptOverride`、`appendSystemPromptOverride` 的返回值直接作为结果，不经该判定（`:311-312`、`:659`、`:671-673`），SDK 经 `resourceLoaderOptions` 传入（`core/agent-session-services.ts:44`）。
  - **规则**（`11` §11.8.1“传入什么”，ADR-202 修订）：项目 `SYSTEM.md`/`APPEND_SYSTEM.md` 由 Supervisor 从 base 树读出内容，`RunSpec.projectResources.systemPrompt`/`appendSystemPrompt` 携带内容，Host 经两个 override 交给 Pi。与 Pi 信任项目时相同，项目文件取代用户级同名文件、不合并。内容在 Run 开始时固定，不再读卫星中的文件。M2 的 RPC 参数同样经 `resolvePromptInput`，须传 Tower 自有、Agent 不可写的文件路径。
  - `05` RunSpec 注释、Host 骨架、§5.11 D2 与 C11 同步。

**推迟到 M2 / 删除**
- 删除：上下文文件复核中区分大小写的 pathspec；Host 以 `systemPrompt`/`appendSystemPrompt` 传入项目系统提示的路径。
- 推迟到 M2：RPC 适配器对 `runMigrations` 与 `--system-prompt` 的处理（记入 `11` §11.8.1）。
- 新增的只有：`16` §16.1.12 一行。其余为引用、规则半句、文案与注释。
- `16` §16.1.13 补登第 75 轮被取代的说法 1 行。

- **lint**：评审 §3.1 建议的“列出上下文文件名的句子须与唯一定义相同”以 (d) 的 DELETED 一项实现：正文中不完整的名字清单（`AGENTS.md`/`AGENTS.override.md`/`CLAUDE.md` 三个并列、`AGENTS.override.md` → `AGENTS.md` → `CLAUDE.md` 的顺序写法、`**/AGENTS.md`、`**/AGENTS.override.md` 的并列）出现时须带历史标记。完整清单只写在 `16` §16.1.12 与本 ADR。被取代的说法由 (D) 检查。全部检查：`--checks rstuvwxyzckdnSeRqpoPiDgKYATFMBOJCH`。
- **排期**：+0.01 人周，没有系统线增量。
  - W10 +0.01（安全）：Seatbelt 大小写类、复核与 `protected` 按名字规则筛选（复用 `10` §10.1.2 的名字比较函数）、验收标记引用同一集合、G46 (bh)(3)（复用已有夹具）。
  - W6（Agent）：两个 override 替换两个选项，计 0。其余观察按 WBS 行逐项不足 0.01，计 0。
  - `14` §14.3.4 与 ADR-133 第 75 轮补记一致：WBS 122.93，余量 系统 0.12、Agent 0.26、桌面 0.36、设计 0.83、安全 0.18，依赖链 19.91，增 1 人 128.84 / T 23.79 / 33 周，**M1 维持 38 周**。

## 第 76 轮对抗评审（全范围）后的跨文档决策（ADR-204）

## ADR-204 名字比较规则推广到全部受保护名字、项目技能范围与用户自己运行 Pi 相同、`engine_crash` 条目与“稍后”分区各定一处 — Accepted（R76 全部条目与评审结论中的观察；Amends ADR-203、ADR-202；Amended by ADR-205）

选择原则（收敛规则，同 ADR-186–203）：只用三种办法关闭条目——(1) 把说法改弱但为真；(2) 删除或推迟不属于 M1 主循环的机制；(3) 在已有的唯一定义处加至多一条守卫、一行或一个字段。本轮优先推广已有的唯一规则：`16` §16.1.12“上下文文件名”一行改为“上下文文件名与受保护名字”，同一条比较规则覆盖全部受保护名字，另补 `contextFiles()` 的定义；祖先 `.agents/skills` 的记录与重新枚举删除。新增的只有 `08` 的两句唯一定义（条目时机、“稍后”分区）。不新增状态、事件类型、表、决定种类、Needs-You kind、`step` 取值、列、命令参数或载荷字段。安全问题只写到设计层面。

**Pi v1.2.0 核实**（`packages/coding-agent/src/`，`git show v1.2.0:<path>`）
- 项目 `.agents/skills` 的收集：`core/package-manager.ts:460-472`（`findGitRepoRoot`：从起点向上找第一个含 `.git` 的目录）、`:474-491`（`collectAncestorAgentsSkillDirs`：从 cwd 向上逐级收集，到该目录为止，找不到 `.git` 时走到根）；调用处 `:2464-2468` 只在项目信任时收集，并排除用户级 `~/.agents/skills`；用户级目录作为用户资源另行加载（`:2555-2567`）。`core/trust-manager.ts:185-207`（`hasTrustRequiringProjectResources`）只判定是否需要询问信任，走到根，同样排除用户级目录。
- 技能文件的读取：`core/system-prompt.ts:172-180`，系统提示让模型用 `read`（或 bash）读取技能文件。
- 上下文文件：`core/resource-loader.ts:184-203`（每个目录按候选顺序取第一个 `existsSync` 为真、`statSync().isFile()` 为真的文件）；`:232-274`（`loadProjectContextFiles`：agentDir 加上从 cwd 到根的每一级目录，cwd 的子目录不加载）。

**条目（R76 追问清单）**
- **R76-D11-01、R76-D13-01**（次要；名字比较规则只用于上下文文件；回退位置的祖先差异仍按通配识别）：
  - **规则**（`16` §16.1.12“上下文文件名与受保护名字”，唯一定义）：凡按名字识别上下文文件或受保护路径之处，名字都按 `10` §10.1.2 的名字比较规则比较。范围包括 `protected` 的全部模式（`02` §2.5 默认值与 `11` §11.3.3 补充项，含 `.pi/**`、`.agents/**`、`.mcp.json`、`.envrc`、`.npmrc`、`.husky/**`、`.pnpmfile.cjs`，以及合同中写的模式）与 `07` §7.6.3 的路径集合：模式的字面分量与路径分量按该规则比较，`scope.include`/`exclude` 不在此列。
  - 同一行定义 `contextFiles(dir)`：Pi 以 dir 为 cwd 时加载的文件，每个目录按候选顺序取第一个存在者。`09` §9.11 的“生效上下文”与导出目标、`10` §10.4.3 回退位置的祖先差异都用它。“用到它的四处”改为不计数的写法。
  - 引用同步：`02` §2.5 注释；`11` §11.3.3（导言一句）与 §11.3.1 伪代码；`07` §7.6.1 伪代码、§7.6.3 路径集合与“给 Agent 的指令文件”；`10` §10.4.3 第 3b 步与位置一节的导言；`11` §11.8.1 的信任复核改为对完整差异按同一规则筛出 `.pi`、`.agents` 之下的路径（不再用区分大小写的 pathspec），`05` §5.4.1 同步。
  - `11` §11.6.2 的“双保险”一句改为真：`protected` 按同一规则识别 Seatbelt 写拒绝的四个名字，非 ASCII 等价变体只由 `protected` 与复核识别。
  - **测试**：G46 (bh)(4)：S2 下 bash 新建 `.NPMRC` 不被沙箱拒绝、验证时 `protected_path` 列出；S0 下新建 `.PI/…`、`.NPMRC`，并用文件工具新建 `.Mcp.json`：写入时询问，验证时列出，验收面板把 `.PI/…` 标为指令文件。
  - **没有采用**：“只折叠上下文文件与 `.git`，其余登记残余”。规则只需在一处推广，多出来的只是多报，与 ADR-203 的取舍相同。
- **R76-D5-01**（次要；显式传入的祖先 `.agents/skills` 范围写作“与 Pi 相同”而不同；策略门不认这些路径）：
  - **范围**（`11` §11.8.1，ADR-202 修订）：与用户在自己的检出中运行 Pi 时相同。也就是从 cwd 向上，止于最近的含 `.git` 的目录，排除用户级目录。Run 的 cwd 是主 binding 的卫星根，对应用户检出的仓库根，也就是这一范围的终点，所以第一组只含卫星根自己的 `.agents/skills`。它在 base 树中，由信任复核的差异覆盖。仓库根以上的不传入。
  - **删除**：批准信任时记录各级祖先 `.agents/skills` 及其哈希，以及每个 Run 的重新枚举。用户改动自己的用户级技能不再使复核为不信任，Agent 看到的技能与用户自己运行 Pi 时一致。
  - **读取分类**：`16` §16.1.10 `read.pi_resources` 的单一来源补一项“每个 Run 启动时 Host 实际枚举到的已启用技能 `baseDir`”，与 `11` §11.6.2 S2 读允许中的同一集合（含以显式路径传入的项目技能）；`11` §11.1 同步。经批准的技能被 `read` 读取时不再询问，与 bash 一致。
  - 引文改正为 `package-manager.ts:459-491`、`:2464-2468`、`:2556-2567`，`trust-manager.ts` 只作为“是否询问信任”的出处。
  - **测试**：G46 (bh)(5)。
- **R76-D8-01**（次要；`engine_crash` 的 Needs-You 何时生成）：取“只在自动恢复不进行或失败后生成”，与 `06` §6.8 F4、`16` §16.1.7 原有的写法以及 `provider_unavailable`、`satellite_missing` 的模式一致。唯一定义在 `08` §8.6.3：自动“重启并恢复”进行期间不生成条目，实况行与卡片写 `◇ 将自动重试 1 次`；不进行（10 分钟内重复崩溃、`autoResume` 为假）或失败时生成 `stalled{unresponsive|crashed}`（L3）；恢复成功不生成，所以没有要随自动恢复关闭的条目。`06` §6.1.3 Engine Host 一行与 §6.8 F4、`16` §16.1.7 引用；`12` §12.6.5 该行写 `◇`/`◆`，例外列表补 `engine_crash`。
- **R76-D8-02**（次要；“稍后”分区收什么）：取“只收 `ratify` 聚合条目”，与 `08` §8.5.1“severity 1 从不进入 L2”一致。唯一定义补在 `08` §8.5.1；`04` §4.8.3 改为引用；`12` §12.8 L1 行的侧栏改为“—”，`+n 稍后` 只计 `ratify` 聚合条目。`08` §8.9.2 规则 E（M2）的“从‘稍后’或收件箱中”改为“从批处理通道或收件箱中”。
- **R76-D12-01**（次要；“导出到 AGENTS.md”的目标）：
  - 目标取 Pi 在 Run 的 cwd（主 binding 的仓库根）实际加载的那个文件，即 `contextFiles(用户检出)` 中仓库根那一项，以磁盘上的实际名字写入；没有时新建 `AGENTS.md`。
  - 不再取 `appliesTo.paths` 的公共前缀目录：Pi 不加载 cwd 子目录中的上下文文件（`resource-loader.ts:232-274`），所以条目的路径范围写进文字。
  - 人改选其他文件时提示“Pi 不会自动加载这个文件”，不提供退役。
- **R76-D15-01**（次要；`16` 检测器表 `symlink_escape` 一行是旧规则）：改为现行规则的摘要（全部链接整链解析、四种不安全情形、三种命中条件、base 豁免），并注明唯一定义在 `10` §10.1.2 (b)。旧说法“pin 中新增或改变的符号链接”补进 `16` §16.1.13，由 (D) 检查。

**评审结论中的观察（R76 结论部分）**
- 观察 1（写拒绝的过宽）：`00` §0.5.1 补一行：S2 下 bash 不能写任意深度、折叠后形如 `AGENTS*.md`、`CLAUDE.md` 的文件（含正当用作文档的 `docs/agents.md`）及 `.pi`、`.agents`；格式化工具、文档生成器与 Agent 的 git 操作同样被拒；改它们须用文件工具并经批准；合同放开保护也不解除这条限制。`11` §11.6.2 同句；G46 (bh)(4) 覆盖。
- 观察 2（名字集合与两个模式）：`16` §16.1.12 写明两种写法：祖先上下文文件的读允许只放行名字集合；写拒绝、`protected`、复核与验收标记用两个模式。`11` §11.1、§11.6.2，`16` §16.1.10，`05` 同步。
- 观察 3（复核的改名检测）：`11` §11.8.1 上下文文件复核与信任复核都用 `git diff --name-status --no-renames`，与 `pinSafetyCheck` 相同。
- 观察 4（已清除的归档 Goal）：`10` §10.3.2 续做一句补“已清除的 Goal 除外”。
- 观察 5（`07` §7.10.1 缺两行）：补“给 Agent 的指令文件（合同放开保护后）”severity 2 一行与 `api_changed` “只有新增”severity 1 一行。
- 观察 6（`03` 两处摘要）：L55 补 `prepare_failed`；L55、L91 改为“Pi 侧兜底超时后”，abort 时保留 abort 的原因（I4）。
- 观察 7（准备阶段文案）：删去 `12` §12.6.4 的旧子状态词表，改为引用表格；`10` 的两个示例改用固定步骤名；`12` §12.6.3 写明 `仓库准备中`、`软上限 · 收尾中` 两处徽章字数例外，§12.14 规则 14 引用。
- 观察 8（其他细节）：`04` §4.8.1 线框按 `P` 调整为 G-0150 在 G-0142 之前；`08` §8.13.2 补 `engine_error`、`idle_without_submit`、`prepare_failed`、`satellite_missing` 四行锚点；`06` §6.1.6 “按 `autoResume` 设置”改为 `resumeOnLaunch`；`10` §10.3.1 卫星侧粗筛改为引用 `10` §10.1.2 的名字比较规则。

**推迟到 M2 / 删除**
- 删除：祖先 `.agents/skills` 的批准时清单、哈希与每个 Run 的重新枚举；导出目标的“公共前缀目录”选择；信任复核中区分大小写的 pathspec；`12` 的旧子状态词表。
- 新增的只有 `08` §8.5.1、§8.6.3 两句唯一定义，`16` §16.1.12 一行的推广与 `contextFiles()` 定义，`16` §16.1.10 一项，`00` §0.5.1 一行。其余为引用、摘要与文案。
- `16` §16.1.13 补登第 76 轮被取代的说法 1 行。

- **lint**：`xref.py` 的 DELETED 补一项（ADR-204），由 (d) 检查：对受保护名字 `.pi`、`.agents` 用区分大小写 pathspec 的写法（`-- .pi .agents`），以及用 `AGENTS*.md/CLAUDE.md` 通配识别上下文文件的写法；出现时须带历史标记。评审 §3.1 建议的 `symlink_escape` 旧说法短语由 (D) 检查（`16` §16.1.13 第 76 轮一行）。全部检查：`--checks rstuvwxyzckdnSeRqpoPiDgKYATFMBOJCH`。
- **排期**：+0.01 人周，没有系统线增量。
  - W10 +0.01（安全）：`protected` 全部模式与 `07` §7.6.3 路径集合按同一名字比较函数匹配（复用 `10` §10.1.2 的函数）；信任复核改为对完整差异筛选；`read.pi_resources` 补 Host 枚举的技能 `baseDir`（集合已为 S2 读允许计算）；删除祖先 `.agents/skills` 的记录与重新枚举（抵消一部分）；G46 (bh)(4)(5) 复用已有夹具。
  - `contextFiles()` 用于导出与回退差异（复用“生效上下文”已有的计算）、`08` 两句唯一定义及其引用、`16` 检测器行、`04`/`12` 文案与八条观察，按 WBS 行逐项不足 0.01，计 0。
  - `14` §14.3.4 与 ADR-133 第 76 轮补记一致：WBS 122.94，余量 系统 0.12、Agent 0.26、桌面 0.36、设计 0.83、安全 0.16，依赖链 19.91，增 1 人 128.85 / T 23.79 / 33 周，**M1 维持 38 周**。安全线余量 0.16 高于约 0.12 的改派阈值，不按 ADR-136 改派。

## 第 77 轮对抗评审（全范围）后的跨文档决策（ADR-205）

## ADR-205 `engine_crash` 条目的两种触发、导出目标在 base 树上求值并推迟到 M2、回退祖先差异与本地文件的前提各定一处 — Accepted（R77 全部条目与评审结论中的观察；Amends ADR-204；Amended by ADR-206）

选择原则（收敛规则，同 ADR-186–204）：只用三种办法关闭条目——(1) 把说法改弱但为真；(2) 删除或推迟不属于 M1 主循环的机制；(3) 在已有的唯一定义处加至多一条守卫、一行或一个字段。本轮新增的只有：`08` §8.6.3 唯一定义的改写（两种触发）与 `06` §6.1.4 第 5 项的一条守卫；`16` `ProjectLocalFile` 行的一条守卫（被 git 忽略）；`09` §9.11 两处唯一定义的改写（导出目标、祖先差异）。“导出到 AGENTS.md”整体推迟到 M2。不新增状态、事件类型、表、决定种类、Needs-You kind、`step` 取值、列、命令参数或载荷字段；`E_STATE` 是已有错误码。安全不变式全部保留，取值都取更严格的一侧。安全问题只写到设计层面。

**Pi v1.2.0 核实**（`packages/coding-agent/src/`，`git show v1.2.0:<path>`）
- 嵌套链接 worktree 的遮蔽：`core/resource-loader.ts:214-230`（`findShadowedContextFile`：cwd 位于嵌套在主仓库工作区之内的链接 worktree 时，返回主仓库根中与该 worktree 根所取文件同名的路径；普通仓库、同级 worktree、bare 布局与子模块都不返回）、`:250-260`（加载时跳过该路径）。
- 每个目录的候选与符号链接：`:184-203`（按候选顺序取第一个 `existsSync` 为真、`statSync().isFile()` 为真者；两者都跟随符号链接）。
- `SettingsManager.fromStorage`：`core/settings-manager.ts:323-325`（`projectTrusted` 默认 `true` 在 `:333`）。

**条目（R77 追问清单）**
- **R77-D8-01**（次要；`engine_crash` 唯一定义中的两个分支没有成立条件，与启动时自动解除的关系未定义）：
  - **唯一定义改写**（`08` §8.6.3）：自动“重启并恢复”期间不生成条目。重启解除 `engine_crash` 后照常经准入与准备阶段（`06` §6.2.4）；其中的失败按 `prepare_failed`（Host 握手、开场组装）或 `satellite_missing`（卫星重建）自己的条目处理，不另生成 `stalled{crashed}`。因此删去“失败”分支。
  - 只在两种情形下生成 `stalled{unresponsive|crashed}`：上一次崩溃后 10 分钟内再次崩溃（不再自动重启）；应用启动时因 `resumeOnLaunch` 关闭而没有自动解除。删去“`autoResume` 为假”分支：`engine_crash` 的 `autoResume` 恒为真（`06` §6.1.3），不按次数改写。
  - **启动**（`06` §6.1.4 第 5 项，一条守卫）：已生成该条目的 `engine_crash` 在启动时不自动解除，由人处理。重复崩溃的 Goal 因此不会每次启动再崩一次。
  - 选项“结束本 Run”改为“放弃（`goal.abandon`）”，不处理则保持暂停（Run 已以 `crashed` 结束；评审观察 7）。
  - 引用同步：`06` §6.1.3 Engine Host 一行与 §6.8 F4；`12` §12.6.5 该行与导言；`16` §16.1.7 映射行与 §16.1.2 Mode 表；`04` §4.18.3；`12` §12.4.3 的“推导为 `unresponsive`”一句（观察 7）。
  - **测试**：G43 (r)。
- **R77-D9-01**（次要；`provider_unavailable` 暂停写 `◇` 而条目已存在）：取第一种写法。`12` §12.6.5 该行改为 `◆`：进入这一暂停时 Pi 的重试已耗尽，`stalled{engine_error}` 已存在（`08` §8.6.5、`16` §16.1.7、`06` F6 不变）。导言的例外由三处改为两处（`engine_crash`、`nested_repo_live`）。
  - **lint**：(w′) 补反方向（评审 §3.1）：`16` 映射到某个 kind 的暂停原因，在 `12` §12.6.5 的某一行须带 `◆`，或在该节导言中列为例外。已正向核对：把该行改回 `◇` 时报 `KIND_WITHOUT_DIAMOND provider_unavailable`。
- **R77-D12-01**（次要；导出目标的两种求值；推荐路径不在 M1）：
  - **目标**（`09` §9.11 第 2 步，唯一定义）：取 Run 的 Pi 在 cwd（卫星根）实际加载的那个文件，只在 base 树上求值（`Project.defaultBaseRef` 在镜像中的当前提交）：树根目录按 `16` §16.1.12 的候选顺序与比较规则的第一个普通文件；是符号链接时取链接在仓库内的目标，越出仓库时不导出；没有候选时新建 `AGENTS.md`。
  - 从不取用户检出中未跟踪或被忽略的文件（如个人的 `AGENTS.override.md`）作为目标，所以个人文件不会经补丁进入团队仓库。用户检出根目录另有排在目标之前的候选时，提示“你本地的 `<名字>` 会遮蔽它”，并不提供退役。
  - **退役时机**：补丁进入 base 之后才询问（docs Goal 为 `integrated` 时）；复制补丁时不自动询问，人可手动退役。正在运行的 Goal 不会在合入前失去这些条目。
  - **M1 范围**：ADR-059 的记忆一行没有列出导出，推荐路径依赖的 `kind: docs` Goal 也不在 M1（`14` §14.3.2）。因此“导出到 AGENTS.md”整体在 M2（`09` §9.0.1 两行同步），与导出 Markdown 的处理相同。
  - `16` §16.1.12 的 `contextFiles()` 一句同步：导出目标在 base 树上按同一候选顺序求值，不再写作 `contextFiles(用户检出)`。
- **R77-D13-01**（次要；回退位置的祖先差异 `09`/`10` 三处不一致）：取第一种写法，`09` §9.11 为唯一定义。
  - 何时：卫星不在默认位置（人设置的 `worktreeRoot` 或强制回退）时，每个 Run 开始前计算。
  - 比较什么：两个完整的 `contextFiles()`，仓库根以上的各级按路径、仓库根这一级按名字；没有对应项的即为缺失文件。
  - 去向：用户检出之外的缺失文件，内容快照写入 `contract.md` 的 `## Imported context`（不占常驻预算）；用户检出之内的不导入，面板提示。
  - `10` §10.4.3 第 3b 步只保留引用，第 1 步注明同样适用；`05` G31 改为引用。
- **R77-D13-02**（次要；本地文件清单假定条目被 git 忽略但不检查）：取第一种写法。
  - **守卫**（`16` `ProjectLocalFile` 行，唯一定义）：`project.local_files.add` 只接受在用户检出中被 git 忽略的路径（`git check-ignore` 为真；被跟踪的路径不算），否则返回 `E_STATE`，提示先加入 `.git/info/exclude`（只在本机，影子会复制它，`10` §10.1.2）或 base 中的 `.gitignore`。
  - 每次复制前的重新判定同时复核这一点：不再被忽略的条目这次不复制，按“不可读或不存在”一条处理（不改写 `secretBy`，本应复制的条目发 L1 通知）。已在卫星中的副本不改动，与 ADR-176 只对变为机密的条目删除副本相同；它此后不再被忽略，照常出现在差异中，人在评审中可见。
  - **残余**〔第 78 轮更正：此处登记的残余窄于实际，且已由 ADR-206 关闭——Tower 的每一次快照都按路径排除本地文件清单中的全部路径，不再依赖任何忽略规则，`10` §10.1.2；复制前的 `check-ignore` 复核随之改为“在该 Goal 的 base 中是否被跟踪”〕。
  - 建议同步为“先让 git 忽略它，再加入清单”：`00` §0.5.1、`11` §11.6.2、`09` §9.11、`05` §5.10、`06` 命令表、`14` G46 (ap)。
  - **测试**：G46 (bh)(6)。
- **第 76 轮观察 8 的残留**：`10` §10.3.1 监视候选集一句改为“名字按 §10.1.2 的名字比较规则为 `.git`、…”（即评审观察 7 的第三项）。

**评审结论中的观察（R77 结论部分）**
- 观察 1（Pi 引文）：`05` §5.11.1 D3 改为 `settings-manager.ts:323-325`；`16` §16.1.12 的 `contextFiles()` 补嵌套链接 worktree 的遮蔽例外（`resource-loader.ts:214-230`、`:250-260`），注明卫星不是链接 worktree，只影响 `contextFiles(用户检出)`。
- 观察 2（monorepo 子包）：`00` §0.5.1 补一行已知差异：Agent 的 Pi 总在仓库根运行，子包中的 `AGENTS.md` 与 `.agents/skills` 不加载；`10` §10.14 monorepo 一行引用；`10` §10.13 的 M3 登记补一句：项目技能范围与导出目标同样以“cwd = 主 binding 的仓库根”为前提。
- 观察 3（S0 下被忽略的上下文文件）：`11` §11.12 T4 的残余补一句：S0 下 Agent 新建的、被 git 忽略的上下文文件不进入两种复核、`protected_path` 与指令文件标记，归 T23。
- 观察 4（“全新临时索引”的初值）：`10` §10.1.2 决定性指纹一条写明一律以 `read-tree <baseCommit>` 初始化、不带 stat 信息；`11` §11.8.1 引用。
- 观察 5（“稍后”的措辞）：`08` §8.5.1 补“`ratify` 聚合条目除外”；`04` §4.8.3 改为“其余 severity 1 条目”。
- 观察 6（旧行名）：`09` §9.11、`11` §11.8.1、`14` G46 (bh)(3) 改为“上下文文件名与受保护名字”。
- 观察 7（其他摘要与措辞）：`16` §16.1.2 Mode 表与 `12` §12.4.3 带上自动恢复条件；“结束本 Run”改为“放弃”（见 R77-D8-01）；`10` §10.3.1 监视一句（见上）；`07` §7.6.3 的 `SYSTEM.md`/`APPEND_SYSTEM.md` 改为 `.pi/` 下的两个文件。
- 观察 8（W7 中的 M3 工作）：`14` W7 的“多仓库逐仓库回退（桌面 0.1）”标为 M3 预留，保留在估计中、不调减；桌面甘特与 §14.8 同步标注。
- 观察 9（G46 (bh)(4)）：S0 一组写明 bash 以重定向新建 `.PI/…`、`.NPMRC` 同样按 `edit.protected` 询问（重定向目标按 `11` §11.3.1 分类）；S2 一组写明人批准文件工具的改写，`protected_path` 列出已批准的 `docs/agents.md`，验收面板把它列为指令文件。

**推迟到 M2 / 删除**
- 推迟：“导出到 AGENTS.md”（含 docs Goal 路径与退役询问）。
- 删除：`engine_crash` 条目的“失败”与“`autoResume` 为假”两个分支；`10` §10.4.3 第 3b 步自己的比较范围与去向；`12` §12.6.5 导言中 `provider_unavailable` 的例外。
- `16` §16.1.13 补登第 77 轮被取代的说法 1 行，由 (D) 检查。

- **lint**：(w′) 补反方向（`16` §16.1.7 映射行的说明同步）。全部检查：`--checks rstuvwxyzckdnSeRqpoPiDgKYATFMBOJCH`。
- **排期**：+0.01 人周，没有系统线增量。
  - W16 +0.01（设计）：`local_files.add` 与复制前复核的 `git check-ignore`；G46 (bh)(6) 复用已有夹具。
  - 其余条目与九条观察按 WBS 行逐项不足 0.01，计 0；导出推迟到 M2 计 0。W7 的 0.1 标为 M3 预留，不调减。
  - `14` §14.3.4 与 ADR-133 第 77 轮补记一致：WBS 122.95，余量 系统 0.12、Agent 0.26、桌面 0.36、设计 0.82、安全 0.16，依赖链 19.91，增 1 人 128.86 / T 23.79 / 33 周，**M1 维持 38 周**。安全线余量 0.16 高于约 0.12 的改派阈值，不按 ADR-136 改派。

## 第 78 轮对抗评审（全范围）后的跨文档决策（ADR-206）

## ADR-206 本地文件按路径排除出全部快照、认证过期条目的登记与 G46 (bg) 的里程碑各定一处 — Accepted（R78 全部条目与评审结论中的观察；Amends ADR-205；Amended by ADR-207）

选择原则（收敛规则，同 ADR-186–205）：只用三种办法关闭条目——(1) 把说法改弱但为真；(2) 删除或推迟不属于 M1 主循环的机制；(3) 在已有的唯一定义处加至多一条守卫、一行或一个字段。本轮新增的只有：`10` §10.1.2 一条唯一规则（本地文件按路径排除），它关闭“本地文件是否进入快照取决于哪套忽略规则”这一整类问题，取代 ADR-205 的复制前 `check-ignore` 复核与其登记的残余；`08` §8.4、§8.8 各一行（认证过期条目）；`14` G46 (bg) 的 M2 标注。不新增状态、事件类型、表、决定种类、Needs-You kind、子类型、`step` 取值、列或载荷字段；`E_STATE` 是已有错误码，`memory.edit` 的 `memoryId` 改为可省略（新建）是写明 M1 已有的唯一写入路径。安全不变式全部保留，有取舍时都取更严格的一侧。安全问题只写到设计层面。

**Pi v1.2.0 核实**（`packages/coding-agent/src/`，`git show v1.2.0:<path>`）
- `SettingsStorage` 在 `core/settings-manager.ts:164-166`（此前写作 `:166-168`）。
- `getAgentDir` 在 `config.ts:605-611`，`ENV_AGENT_DIR` 在 `:585`（此前写作 `:585-606`）。
- 上下文文件加载 `core/resource-loader.ts:232-274`（`loadProjectContextFiles`）；`:646-653` 只按 `noContextFiles` 决定是否加载，不看信任。
- 技能提示的措辞在 `core/skills.ts:358-372`（`formatSkillsForPrompt`，按可用的读取工具选择 “Use the read tool…”/“Use bash…”），`core/system-prompt.ts:172-180` 只选择工具名；ADR-204 的 Pi 核实一条按此补出处。

**条目（R78 追问清单）**
- **R78-D13-01**（次要；本地文件的忽略判定在用户检出中求值，与决定检查点、pin、T1 成员的上下文不同；残余登记窄于实际）：取评审的第一种写法，并推广为一条规则。
  - **唯一定义**（`10` §10.1.2“本地文件按路径排除”）：Tower 的每一次快照 `add`（检查点、pin 与 seal、验收与 seal 时的全新临时索引、§10.5 的基线快照、检验带回、交还的 T1 与人工编辑的差异）都对该 Project 本地文件清单中的**全部**路径加 `:(exclude)`，不论条目是否机密、是否批准、复制时的判定如何，与 `.gitignore`、`info/exclude`、`core.excludesFile` 的状态无关。指纹与外部写入判定也不含这些路径；Agent 在这些路径上的写入同样不进入快照，与它们被忽略时相同。被排除的路径不记入 `excludedPaths`，不是检测器。
  - **唯一的例外**：路径在该 Goal 的 base 树中被跟踪时，它对这个 Goal 是仓库文件——不复制，也不排除，Agent 的改动照常进入快照。含机密的本地文件在交还时仍一律排除（ADR-167）。
  - **复制前**（`16` `ProjectLocalFile` 行）：`check-ignore` 复核改为检查路径在该 Goal 的 base 树中是否被跟踪；被跟踪的这次不复制，按“不可读或不存在”一条处理，通知“`<路径>` 在这个目标的代码中已被跟踪，本次未复制”，`envHash` 记 `not_copied`（`07` §7.4.1、§7.4.3）。槽位内容因此不会偏离 pin（评审情形 4）。
  - **`add`**：保留 `check-ignore` 守卫（`E_STATE`），它只让人自己的 `git status` 与提交不收录个人文件，不再承担快照的成员判定；另拒绝在 `Project.defaultBaseRef` 当前提交中被跟踪的路径（“在仓库中被跟踪，不是本地文件”）。提示文案按 `12` §12.14 改写，不再出现“影子”与节号。
  - **人有意提交这样的文件**：先 `project.local_files.remove`，此后它是普通的未跟踪文件，按忽略规则处理（`06` 命令表、`04` §4.15.1 与交还对话框写明）。
  - 评审列出的四种情形（Goal 创建后才忽略并批准、只在当前分支提交的 `.gitignore`、仓库级 `core.excludesFile`、base 中被跟踪）以及卫星重建时的播种，都由这一条覆盖；已进入检查点再被 `mark_secret` 的问题随之不再出现，因为清单中的路径从不进入检查点（第 79 轮更正：加入清单之前已进入检查点的路径不在此列，排除集写进检查点树与 pin 树的唯一定义，清单变化的语义见 ADR-207）。ADR-205 登记的残余因此删除（ADR-205 该条加更正注）。
  - 同步：`10` §10.5 基线快照、§10.8.3 检验带回（原“不含播种的本地文件”）、§10.8.4 第 5 步与人工编辑检出一段；`16` `ProjectLocalFile` 行（`mark_secret` 一句改为引用本规则）；`06` 的 `add`、`remove` 两行；`07` §7.4.1、§7.4.3；`04` §4.6.7、§4.15.1、§4.18.3；`08` §8.1。
  - **测试**：G46 (bh)(6) 新增三组（Goal 创建后才忽略、只靠仓库级 `core.excludesFile`、base 中被跟踪）与“移出清单后有意提交”一组。
- **R78-D8-01**（次要；认证过期（F7）的 Needs-You 没有 kind、去重键与关闭定类）：沿用已登记的 kind 与子类型，不新增子类型。
  - **唯一定义**（`08` §8.4 一行）：F7 的条目是 `stalled{engine_error}`，去重键 `st:{goalId}:auth`（按 Goal：预检失败时还没有 Run），三种检测键与之后的再次失败并入同一条目；级别同 `engine_error`（L2）；不参与 provider 根因合并。Run 因此以 `error` 结束时进入的暂停是 `provider_unavailable`（`05` §5.5），与它成对。
  - **定类**（`08` §8.8 一行）：“重试”（`goal.resume`）→ `actionable`；`provider_unavailable` 的探测成功、暂停自动解除 → `actionable`（Tower 不代管认证，恢复通常是人已在终端登录，无法区分时统一这样计）；“放弃” → `informative`。
  - 同步：`16` §16.1.7 映射行（`provider_unavailable` 一格写出 F6、F7 两种条目）；`12` §12.6.5 的理由改为“进入这一暂停时总有一条 `stalled{engine_error}` 条目”；`06` §6.8 F7 的用户可见一列；`05` C39 (c)(d)。
- **R78-D14-01**（次要；G46 (bg) 的 ADR-197 组前置依赖 M2 对象）：M1 部分保留复活出的新 Goal 与人手写 Project 记忆的“彻底忘记”；依赖子 Goal、待批准记忆提议与 Goal 作用域记忆的部分标为 M2、不计入 M1 补跑，预期结果同步分开。

**评审结论中的观察（R78 结论部分）**
- 观察 1（Pi 引文）：`05` §5.3.3 代码注释与 §5.11.1 D16 改为 `settings-manager.ts:164-166`；G31 改为 `resource-loader.ts:232-274` 并补 `:646-653`；三处 `config.ts:585-606` 改为 `:585`、`:605-611`；技能措辞的出处见上方 Pi 核实。
- 观察 2（嵌套链接 worktree 的读法）：不改动。
- 观察 3（`engine_crash` 的摘要）：`03` §3.2.1 该行补人的出口与启动守卫；`06` §6.1.3 与 F4 写明“10 分钟内再次崩溃”；`06` §6.1.6 `paused` 行与 `16` §16.1.1 的自动恢复带上 `resumeOnLaunch` 与已有条目的例外；G43 (r) 改为“重启前显示”；`08` §8.6.3 写明“上一次崩溃”取账本中上一个以 `crashed` 结束的 Run 的 `run.ended` 时间，跨应用重启保留。
- 观察 4（启动恢复中 `app_quit`/`engine_crash` 二选一）：`06` §6.1.6 “Run 中崩溃”一行写明：应用本身退出、崩溃或被强制终止后的启动取 `app_quit`；main 一直在运行、只有 Supervisor 重启而 Host 已不存在时取 `engine_crash`；“settle 中崩溃”一行引用。`12` §12.6.5 `app_quit` 一行与 `04` §4.18.3 的“启动后自动恢复”带上 `resumeOnLaunch` 条件。
- 观察 5（字形导言）：`12` §12.6.5 导言改为三处例外，补 `satellite_missing`；`08` §8.5.1 首句补“`ratify` 聚合条目除外”。
- 观察 6（M1 记忆的两处空白）：`09` §9.4.3 补 M1 的冲突提示（编辑器列出冲突的约定行、写明仓库约定优先；三个批准队列选项在 M2）；`06` 命令表写明 `memory.edit` 省略 `memoryId` 时新建一条人手写的记忆（M1 唯一的写入路径），`memory.ratify`/`reject` 标 M2，`memory.resolve_sync_conflict` 标 M2–M3。
- 观察 7（“不再被忽略”的通知与记录）：该通知随复制前复核一起改为“已被跟踪”一种文案，是“未复制”通知的另一种文案（`08` §8.1、`04` §4.15.1 同为三条）；消失条件改为“之后复制成功”；`07` 的 `not_copied` 补这一原因，`04` §4.18.3 同；`add` 的拒绝态写进 `04` §4.15.1。
- 观察 8（其他措辞）：`09` §9.11 缺失文件一句改为“`contextFiles(checkout)` 中的项在 `contextFiles(worktree)` 里没有对应项的”，并写明只在卫星一侧的项照常列出；`04` §4.18.1 信任提示写为 `.pi/` 下的两个文件；`04` §4.12 改为 `筛选 /` 与 `⇧Y 驳回`，`16` §16.3 `/` 一行补“记忆”作用域。
- 观察 9（`11` 的建议没有界面落点）：`11` §11.6.2 改为“需要时由人先加入 `info/exclude` 再加入清单”，写明添加项目时不另给建议，卫星不在默认位置时由“生效上下文”面板提示。

**推迟到 M2 / 删除**
- 删除：ADR-205 的复制前 `check-ignore` 复核、“不再被 git 忽略”的通知与登记的残余。
- 推迟：G46 (bg) 中依赖子 Goal、待批准记忆提议与 Goal 作用域记忆的一组（测试标注，能力本身早已在 M2）。
- `16` §16.1.13 补登第 78 轮被取代的说法 1 行，由 (D) 检查。

- **lint**：全部检查 `--checks rstuvwxyzckdnSeRqpoPiDgKYATFMBOJCH`，exit 0。没有新增检查：评审 §3.1 建议的 (w) 扩展（`06` §6.8 F 表中写 Needs-You 的行须有对应的 kind）未实现，本轮由 `08` §8.4 的登记关闭 F7 这一行。
- **排期**：+0.01 人周，没有系统线增量。
  - W16 +0.01（设计）：快照按路径排除本地文件、复制前改查 base 中被跟踪、`add` 拒绝被跟踪的路径、G46 (bh)(6) 新增各组。落点在 W7-core 的影子 `add`，按 ADR-136 改由本地文件清单的负责人完成，系统线 0。
  - 其余两条与九条观察按 WBS 行逐项不足 0.01，计 0。
  - `14` §14.3.4 与 ADR-133 第 78 轮补记一致：WBS 122.96，余量 系统 0.12、Agent 0.26、桌面 0.36、设计 0.81、安全 0.16，依赖链 19.91，增 1 人 128.87 / T 23.79 / 33 周，**M1 维持 38 周**。安全线余量 0.16 高于约 0.12 的改派阈值，不按 ADR-136 改派。

## 第 79 轮对抗评审（全范围）后的跨文档决策（ADR-207）

## ADR-207 快照排除什么只定义一处、清单变化在下一个快照生效、认证过期条目的三条路径与探测各定一处 — Accepted（R79 全部条目与评审结论中的观察；Amends ADR-206；Amended by ADR-208、ADR-234、ADR-235）

选择原则（收敛规则，同 ADR-186–206）：只用三种办法关闭条目——(1) 把说法改弱但为真；(2) 删除或推迟不属于 M1 主循环的机制；(3) 在已有的唯一定义处加至多一条守卫、一行或一个字段。本轮把 Tower 快照排除什么收到 `10` §10.7.1 第 1 步一处（它本来就是检查点树与 pin 树的唯一定义），`10` §10.1.2 只保留本地文件的规则与理由；本地文件排除集的记录用检查点与 pin 提交上的一个 trailer（与已有的 `Tower-Satellite-Head` 同一机制），不新增表、列、事件类型或载荷字段；认证过期条目沿用已有的暂停原因与 kind。不新增状态、事件类型、表、决定种类、Needs-You kind、子类型或 `step` 取值。安全不变式全部保留，有取舍时都取更严格的一侧。安全问题只写到设计层面。

**Pi v1.2.0 核实**（`packages/coding-agent/src/`，`ai` 包另注；`git show v1.2.0:<path>`）
- `checkAuth` 只检查配置是否完整、不刷新 OAuth：`ai/src/models.ts:287`（注释 “without refreshing OAuth”），实现 `:683-692` 读取已存凭据后调用 `checkProviderAuth`；`prompt` 的预检以 `hasConfiguredAuth || checkAuth` 判定（`agent-session.ts:2118-2131`）。
- `getAuth` 会真正刷新：`ai/src/models.ts:303-313`（令牌刷新失败时以 `ModelsError` code `"oauth"` 拒绝），经 `resolveProviderAuth`（`ai/src/auth/resolve.ts:33-44`、`:70-81`）进入 `resolveStoredOAuth`（`:161-191`），令牌在 5 分钟内过期时在凭据存储锁下调用 provider 的 `refresh`（`:119-155`）；SDK 宿主经 `ModelRuntime.getAuth`（`core/model-runtime.ts:555-562`）调用它。
- `sendCustomMessage{triggerTurn:true}` 直接 `_startRun`，不经预检（`agent-session.ts:2339-2344`）；完全没有凭据时 Run 中的错误为 `No API key for provider: <p>`（如 `ai/src/api/anthropic-messages.ts:326`、`google-generative-ai.ts:312`）。
- 自动压缩失败时发出 `compaction_end{errorMessage}` 后 `return false`，Run 不因此结束（`agent-session.ts:3237-3262`）。
- 技能提示的措辞有三种（`core/skills.ts:358-371`）：`read`、`bash` 与只能经其他工具读取时的 `indirect`（“Load a skill's file…”）；ADR-206 的 Pi 核实只列了前两种。

**条目（R79 追问清单）**
- **R79-D13-01**（重要；按路径排除的规则没有进入检查点树与 pin 树的唯一定义，两段“唯一定义”冲突）：
  - **唯一定义**（`10` §10.7.1 第 1 步，现为检查点树、pin 树与 Tower 快照排除什么的唯一定义）：排除且只排除四类——(a) `.git` 条目；(b) gitlink；(c) git 拒绝收录的路径（记入 `excludedPaths`，`nested_repo`）；(d) 本地文件排除集 L = 清单中不在该 Goal 的 base 树中被跟踪的路径（不记入 `excludedPaths`，不是检测器）。§10.5 的基线快照、检验带回、交还的 T1 与人工编辑的差异、`11` §11.8.1 的两种复核同样按本条排除。
  - `10` §10.1.2 改为“规则与理由的唯一定义”，不再列举快照种类，引用 §10.7.1；`10` §10.6 pin 一条与 `07` §7.3.2 `worktreeTree` 引用，`worktreeTree` 增加参数 `local`，其 `add` 加入 `:(exclude)`，gitlink 与 L 的已有索引条目一并移除。
  - `11` §11.8.1 两种复核写明按同一定义排除——与 G46 (bh)(6) 的预期一致，清单中的上下文文件是人的文件，不列为“相对 base 被本 Goal 修改”；`11` T4 残余的理由补上（观察 2）。
  - **lint**：旧的穷尽说法（“只排除名为”“只去除名为”“不再有排除列表”）登记在 `16` §16.1.13 第 79 轮一行，由 (D) 检查它们不在历史之外重现；这就是“排除列表只在一处出现”的检查，没有另加检查项。
- **R79-D13-02**（次要；清单在 Goal 进行中变化时的效果未定义）：唯一定义同上（`10` §10.7.1 第 1 步“L 的求值与记录”）。
  - **索引**：(b) 与 (d) 的条目若已在影子索引中，`add` 之前先 `update-index --force-remove`，与 gitlink 相同；所以 `decisive` 与 `full` 一致，“与影子索引的历史无关”重新成立。
  - **按快照求值、记录在快照上**：新建检查点或 pin 时按当时的清单求值 L，并以 trailer `Tower-Local-Exclude: <路径>` 记在该提交上；与某个检查点或 pin 比较的指纹（I2、`accept` 与 seal 的 `full` 闸口、归因表第 4 行）用该提交记录的 L。所以清单的增删本身不产生 I2、`external_change` 或 `stat_cache_mismatch`，在该 Goal 的下一个检查点或 pin 生效。
  - **后果如实写明**（`10` §10.1.2、`04` §4.15.1、`06` 的 `add`/`remove` 两行）：加入后 Agent 此前写下的该文件从此后的检查点与 pin 中去掉；加入之前已在某个 pin 中的，仍在那份差异中（评审可见），随它的验收进入 seal。移出后它在各活跃 Goal 的下一个检查点或 pin 中作为新文件出现，作者按收入它的检查点记录（`running` 中为 `agent`）；`in_review`/`accepted` 中的 Goal 在下一次生成 pin 之前不受影响。
  - ADR-206 中“清单中的路径从不进入检查点”一句加第 79 轮更正注。
  - **测试**：G46 (bh)(6) 第六组（`in_review` 中加入清单、再返工）。
- **R79-D13-03**（次要；`mark_secret` 的删除不尊重 base 中被跟踪的例外）：`16` `ProjectLocalFile` 行“已有副本”改为只在 base **不**跟踪该路径的 Goal 中删除 Tower 复制进去的副本；base 跟踪该路径的 Goal 中那是仓库文件，从不删除，确认框列出这些 Goal。“不改变指纹与 diff”改为“在这些 Goal 中该路径属于本地文件排除集，删除不进入它们此后的检查点、pin 与 diff”。同步 `06` `mark_secret` 一行、`04` §4.15.1。测试：G46 (bh)(6) 第七组。
- **R79-D8-01**（次要；F7 条目只在路径 ① 上成对，②、③ 与探测未定义）：唯一定义仍为 `08` §8.4 F7 一行。
  - **②**：预检失败时还没有 Run，按 `06` §6.8 F4b 进入 `paused(prepare_failed)`（`03` 的入口状态不变），但条目是 F7 的 `st:{goalId}:auth`，代替 `stalled{prepare_failed}`、不另生成；“重试”（`goal.resume`）解除 `prepare_failed` 时条目同时关闭。同步 `06` F4b 与 F7、`03` `prepare_failed` 行、`16` §16.1.7 映射行、`12` §12.6.5。
  - **③**：只有压缩失败而 Run 没有以 `error` 结束时，Goal 没有暂停，卡片只给登录指引、不给“重试”，该 Run 结束时条目以 `obsolete` 关闭（`08` §8.8 加这一出口）。
  - **探测**（唯一定义在 `06` §6.1.4；`03` `provider_unavailable` 行与 `08` 引用）：鉴权检查调用 `ModelRuntime.getAuth`，与 Run 中的模型请求走同一条认证解析，令牌将过期时真正刷新；不用不刷新的 `checkAuth`〔ADR-234 更正：探测只在 Engine Host 中运行——同组空闲的 Host，或为探测起的短时 Host——从不在 Supervisor 中；`getAuth` 拒绝同样计为失败〕。所以认证过期时探测在人重新登录之前不会成功，不会反复自动解除又失败，`actionable` 的计数不因循环膨胀。取舍：没有改为“认证条目不自动解除”，保留人在终端登录后自动继续。
  - **检测键**（观察 1）：① 另认 `No API key for provider: <provider>`（Run 由 custom message 开场、不经预检时完全没有凭据的情形），不再落到 F6。
  - C39 补 (e)：探测在 `refresh` 仍失败时不解除、改为成功后解除；只有压缩失败时以 `obsolete` 关闭。
- **R79-D12-01**（次要；M1“生效记忆”面板的“本 Goal 不适用”没有字段、命令与事件）：取第二种写法，把按钮与 `goalOverrides` 推迟到 M2（`09` §9.4.3、§9.5.4）；M1 中每条可打开记忆编辑器编辑或退役，与合同冲突时修订合同、编辑或退役这条记忆。复审的“保留”（只顺延 `reviewAfter`）与退役条目的“恢复”（`status` 改回 `active`）写明经 `memory.edit`（`06` 命令表、`09` §9.4.1、§9.4.2）。

**评审结论中的观察（R79 结论部分）**
- 观察 1（Pi 引文与检测文本）：`05` §5.10 改为三种措辞与 `core/skills.ts:358-371`；F7 ① 另认 `No API key for provider: <p>`（见上）；`15` ADR-008 正文的行号属历史，不改。
- 观察 2（按路径排除之后仍以忽略规则为理由的文字）：`10` §10.1.2 忽略规则一条写明只管不在清单中的文件；交还第 7 步改为“被忽略的文件（依赖目录等）与本地文件排除集中的路径不同步”，检验带回改为“本地文件排除集”；`11` T4 残余补本地文件一句；`14` G17 写明 `.env.local` 不在清单中；`16`、`06`、`04` 的“从不进入”补“在该 Goal 的 base 中被跟踪的除外”；`10` §10.8.4 与 `04` §4.6.7 的 take_human 改为“按写回集合置为 T1”。
- 观察 3（`restoreCheckpoint` 第 3 步）：`10` §10.8.1 第 3 步加注，M1 只有重建使用本步、不受影响；M2 的回退、分叉与 rebase 写回复用时须把本地文件排除集从删除集合中去掉。
- 观察 4（“已被跟踪”通知）：`16` 写明通知显示该条目最近一次复制的结果，“已被跟踪”按 Goal 求值；`04` §4.18.3 写明 `not_copied` 不记原因，两种文案由该 Goal 的 base 树推出，结果确定。
- 观察 5（`engine_crash` 的余项）：`08` §8.6.3 “上一次崩溃”改为该 Goal 上一次以 `engine_crash` 进入暂停的时间，应用本身退出或崩溃后启动恢复记为 `crashed` 的 Run 不算；只有 Supervisor 重启的恢复同样算一次启动；`16` `Goal.drainingFor` 的崩溃恢复摘要带上 `resumeOnLaunch` 与已有条目的例外；`04` §4.18.3 应用退出一行第 2 列带上 `resumeOnLaunch` 条件。
- 观察 6（F6/F7 的级别输入）：`08` §8.6.5 `retrying` 行写明 severity 2、`costOfDelay:"agent_degraded"` → L2，F7 沿用；精度统计同组仍是 ADR-206 写明的取舍。
- 观察 7（G46 (bh)(6) 第四组）：`16` 写明 `add` 先查跟踪，两条都不满足时只报“在仓库中被跟踪”；第四组写明 `config/dev.json` 已批准，预期补“先查跟踪”。
- 观察 8（其他标注）：`06` `subgoal.approve` 标 M2。
- 观察 9（base 变化与例外）：`10` §10.10 写明 M2 rebase 使例外翻转的两种情形须在 M2 设计；§10.5 写明基线快照时“在 base 中被跟踪”以用户 HEAD 求值，之后以 `$snap` 求值结果相同。

**推迟到 M2 / 删除**
- 推迟：“本 Goal 不适用”按钮与 `goalOverrides`（`09`）。
- `16` §16.1.13 补登第 79 轮被取代的说法 1 行，由 (D) 检查。

- **lint**：全部检查 `--checks rstuvwxyzckdnSeRqpoPiDgKYATFMBOJCH`，exit 0；没有改动 lint。评审 §3.1 建议的 (r′) 补对没有实现：(r′) 只比较两处都声称一致的条款，§10.1.2 现在只引用 §10.7.1、不再自称快照排除的唯一定义；旧的穷尽说法改由 (D) 拦截。
- **排期**：+0.02 人周，没有系统线增量。
  - W16 +0.01（设计）：本地文件排除集的索引清理、trailer 记录与比较取记录的集合，G46 (bh)(6) 第六组；落点在 W7-core 的影子 `add`，按 ADR-136 改由本地文件清单的负责人完成，系统线 0。
  - W13 +0.01（设计）：F7 ② 与 `prepare_failed` 成对、③ 的 `obsolete` 出口。
  - 其余与九条观察按 WBS 行逐项不足 0.01，计 0。
  - `14` §14.3.4 与 ADR-133 第 79 轮补记一致：WBS 122.98，余量 系统 0.12、Agent 0.26、桌面 0.36、设计 0.78、安全 0.16，依赖链 19.91，增 1 人 128.90 / T 23.80 / 33 周，**M1 维持 38 周**。安全线余量 0.16 高于约 0.12 的改派阈值，不按 ADR-136 改派。

## 第 80 轮对抗评审（全范围）后的跨文档决策（ADR-208）

## ADR-208 移出清单的文件按人的文件归属、隔离 agentDir 共用用户凭据文件、F7 ② 与单向门审批的注意力、检验的关闭命令各定一处 — Accepted（R80 全部条目与评审结论中的观察；Amends ADR-207、ADR-158；Amended by ADR-209、ADR-212、ADR-229）

选择原则（收敛规则，同 ADR-186–207）：只用三种办法关闭条目——(1) 把说法改弱但为真；(2) 删除或推迟不属于 M1 主循环的机制；(3) 在已有的唯一定义处加至多一条守卫、一行或一个字段。本轮复用已有字段 `Checkpoint.mixedPaths` 与已登记事件 `inspect.closed`，新增一条命令 `inspect.close`（M1 界面已有的“关闭检验”动作缺少命令，无法以已有命令表达），删去隔离 agentDir 的内存凭据存储。不新增状态、事件类型、表、列、决定种类、Needs-You kind、子类型或 `step` 取值。安全不变式全部保留，有取舍时都取更严格的一侧。安全问题只写到设计层面。

**Pi v1.2.0 核实**（`packages/coding-agent/src/`，`ai` 包另注；`git show v1.2.0:<path>`）
- 凭据路径与锁：`ModelRuntime.create` 未传 `credentials` 时以 `DefaultAuthStorage.create(options.authPath)` 为凭据存储（`core/model-runtime.ts:218`）；`AuthStorage.create` 只做 `normalizePath`（`core/auth-storage.ts:348-351`），后者只展开 `~` 与 `file://`，不取 realpath（`utils/paths.ts:76-100`）；锁为 `proper-lockfile`，`realpath:false`（`core/auth-storage.ts:130-135`），所以同一路径字符串才共用一把锁。用户自己的 `pi` 取 `join(getAgentDir(), "auth.json")`（`config.ts:605-611`）。
- 刷新在锁内复查并在持锁期间落盘，“concurrent callers and processes refresh only once”；provider 可能轮换刷新令牌（`ai/src/auth/resolve.ts:106-114`）。
- `agentDir` 与凭据相互独立：`createAgentSessionServices` 只在没有传入 `modelRuntime` 时才以 `join(agentDir, "auth.json")` 创建它，`agentDir` 另用于 settings 与资源加载（`core/agent-session-services.ts:139-153`）。
- 内存存储的 `modify` 只写进程内 `Map`，没有文件与跨进程锁（`ai/src/auth/credential-store.ts:14-28`、`:49-53`）。
- `ModelRuntime.getAuth` 的返回类型为 `AuthResult | undefined`（`core/model-runtime.ts:555-556`）；可重试模式数组为 `ai/src/utils/retry.ts:30-108`。

**条目（R80 追问清单）**
- **R80-D7-01**（次要；移出清单的人的文件以 ⚙️ 事实记为 Agent 的作者）：唯一定义在 `10` §10.7.1 第 1 步“L 的求值与记录”之后一段：在上一个检查点记录的 L 中、而不在本次 L 中的路径，若出现在本检查点的树中，记入本检查点的 `mixedPaths`。评审中作者为 `mixed`，按 `03` §3.2.1 计为人的改动，验证失败进入 `paused(human_change_verify_failed)`、不自动返工。`10` §10.1.2、`Checkpoint.mixedPaths` 注释、`06` DDL 与 `project.local_files.remove`、`04` §4.8.12 与 §4.15.1 引用。如实写明的残余：该 Goal 还没有检查点时没有记录可比，这一窗口（卫星创建到第一个变更回合）内移出的路径按收入它的检查点记录。测试：G46 (bh)(6) 第八组。
- **R80-D5-01**（次要；隔离 agentDir 的凭据来源两处矛盾）：唯一定义在 `05` §5.3.6：隔离 agentDir 时凭据不隔离，`ModelRuntime` 仍以用户 agentDir 中的 `auth.json` 与 `models.json` 创建（与非隔离模式和用户自己的 `pi` 同一路径字符串），API 密钥照常只经 `setRuntimeApiKey` 写入内存覆盖层；隔离的只是传给 `createAgentSessionServices` 的 `agentDir`。所以锁共享、刷新落盘，人在终端 `/login` 后隔离 Goal 的探测与 Run 读到同一份凭据，“登录后自动继续”在隔离模式下成立，也不会因两把锁或只在内存中刷新而使用户的登录失效。M1 不再使用内存凭据存储（ADR-158 的这一句被取代）。`11` §11.8.2 “只链接”改为引用；`11` §11.7.0 投递表、`05` C29 (a)、D57、`14` G46 (a) 去掉内存存储。RPC（M2）的凭据路径随 `PI_CODING_AGENT_DIR` 改变，锁共享在 M2 复审。测试：C39 (f) 以隔离 agentDir 重复 (c)(e)。
- **R80-D8-01**（次要；F7 ② 的替换没有传到 `08` 自身）：`08` §8.4 `prepare_failed` 登记行与 §8.6.5 `preparing` 行的定义各加半句“认证预检失败时条目是 F7 的 `st:{goalId}:auth`，不另生成”；§8.8 “阻塞类条目不能关闭”的判定加“`prepare_failed` 由 F7 ② 进入时，对应条目是 `stalled{engine_error}`”，所以这条唯一的条目不可关闭。C39 补 (f)：配对、不可关闭与“重试”后关闭。
- **R80-D8-02**（次要；M1 检验的关闭、丢弃与保留没有命令，运行中的 `⇧V` 没有可用命令）：`06` §6.4.3 新增 `inspect.close{goalId, modified?: "discard" | "keep"}`——它是 `10` §10.8.3 第 7 步清理的命令：停止服务、回收端口段、比较目录与 T_pin；有修改而未带 `modified` 时 `E_STATE` 并列出文件；`keep` 保留目录、检验就此关闭，之后的出口为再次 `inspect.close{modified:"discard"}` 或 `inspect.bring_back`；产生已登记的 `inspect.closed`；不是 HumanDecision（检验目录不是 Goal 的工作区）；仅本机，`16` §16.5 一行。`inspect.open` 的 `E_STATE` 指向这两个出口。`⇧V` 只在 `goal.retry_verify` 接受的状态显示（`16` §16.3、`12` §12.5.1、`04` §4.5.1 线框改为“待重验”）。
- **R80-D8-03**（次要；单向门审批的 L4 分支不可达）：`08` §8.3.1 `baseLevel` 第一行：`approval` 且 `isOneWayDoor` → L4，不论 severity；severity 3 分支只留密钥与破坏性迁移。§8.1 级别表与 §8.3.5 演算表同步；`07` §7.5.5 的 `ask` 行注明单向门审批的级别由 `08` 定。单向门永不超时放行、只能在本机批准，语义不变。
- **R80-D4-01**（次要；`03` 把评审余量闸控写成 M1 的转移）：`03` `ready` 行标“依赖属 M2”“评审余量 > 0（阻止模式，M2）”“越过余量（M2）”，写明 M1 中评审余量不闸控；状态图注 `backlog: M2`；`02` `queuedRun` 注释同步。
- **R80-D4-02**（次要；交还时解除哪些原因三处不一致）：唯一定义为 `16` §16.1.1“`pauseReason` 推导来源与交还”一行（该行写明唯一定义与引用者）。`06` `goal.hand_back` 不再复述集合；`03` `human` 行改为按三类处理；`04` §4.6.7 补“超时默认（`stalled_timeout`）”，§4.18.3 的摘要同步。
- **R80-D14-01**（次要；多组 M1 用例的预期或前提与后续 ADR 冲突，两组不在批次表中）：G42 (a)(g)(t) 改为 M1 提示模式的预期，阻止模式与依赖回退标 M2；G33 改为 `budget.extend` 后 `resume` → `verifying`，与 G33b (d) 一致，合并队列一句标 M2；G35e 的依赖回退部分标 M2；G33e (m) 标 M3；G26c (a) 的错误码改为 `E_STATE`；G33f、G36 补进 B4，SP6b 范围写“G33b–f”。可选的 lint 建议（批次覆盖检查）没有实现，见下。
- **R80-D15-01**（次要；`16` `Checkpoint.landmarks` 行的穷尽说法）：改为“`excludedPaths` 只记 (c) 类，树排除什么以 `10` §10.7.1 第 1 步为准”；旧说法登记在 `16` §16.1.13，由 (D) 拦截。
- **R80-D15-02**（次要；`04` §4.8.12 的“通过”与 ADR-187 相反）：改为“结论为已验证或有保留的已验证，并使目标进入待验收或回到已验收；未经机器验证的结果不算通过”；旧说法登记进 (D)。

**评审结论中的观察（R80 结论部分）**
- 观察 1（地标检查点带出本地文件路径名）：`10` §10.6.2 的警告与 `04` §4.6.5 的说明写明地标的提交说明带 `Tower-Local-Exclude`（路径名、不含内容）；§10.7.1 第 6 步写“地标除外”；第 4 步注明路径按 git 的 C 风格引号转义；`16` §16.2.6 登记检查点与 pin 上的两个 trailer 键。
- 观察 2（探测的边界与引文）：`06` §6.1.4 写明 `getAuth` 返回 `undefined` 时计为失败；“人重新登录之前不会成功”收窄为 OAuth 刷新失败，被吊销的 API 密钥或未到期令牌不经网络校验、按 F6 反复，是 ADR-207 之前已有的 F6 行为；F7 一行的 `retry.ts:30-75` 改为 `:30-108`。
- 观察 3（比较取哪个 L）：`10` §10.7.1 第 1 步写明没有记录可取的比较（`baseCommit` 归因基线、运行中的观察器指纹与 Fact 新鲜度）取当时的清单；settle 的 pin 沿用 `agent_bg_done` 检查点记录的 L，I4(b) 保持成立。
- 观察 4（交还的 T1 的第五类排除）：§10.7.1 “其他快照”一句注明交还另按 §10.8.4 第 5 步排除机密路径（base 版本仍在树中）；§10.8.4 第 5 步的“其余路径”带上 base 中被跟踪的例外。
- 观察 5（`mark_secret` 的“这份副本”）：`16` `ProjectLocalFile` 行写明按路径认定、不区分 Agent 在加入清单前写下的同名文件，一并删除；`in_review`/`accepted` 中 pin 记录的 L 不含该路径时删除经 I2 回到 `verifying`。
- 观察 6（F7 的级别）：`08` §8.6.5 `retrying` 行写明 F7 取 L2 是有意的选择及理由；§8.4 F7 一行改为“① 或 ③ 之后 Run 以 `error` 结束”。
- 观察 7（塑形的 M2 标记）：`03` 草稿行的 `→ shaping`、§3.4.1 塑形路径、`06` `contract.start_shaping` 标 M2；草稿行补手写合同经 `contract.ratify` 进入 `ready` 的边。
- 观察 8（其他措辞与登记）：`16` `Goal.continuation` 的改写清单删去 `s0.deny`；`08` §8.8 的 `intended` 改为 `intended_change`；`06` `goal.resume` 的 `budget_hard_cap` 条件改为“硬上限已高于当前用量”；`08` §8.8 两种 `anomaly` 的“知悉”经 `signal.acknowledge`，`06` 该命令的适用范围同步；`07` §7.2.3 `worktreeTree` 改为新签名；`04` §4.15.1 “下一个检查点或 pin”；`04` §4.6.7、`10` §10.8.4 第 5 步加引 §10.7.1；机会式验证频率在 `16` §16.2.6、`07` §7.2.4 与 §7.4.10 对齐为约 20–25 min（槽位允许 15–25 min，核心分钟上限压到约 20 min）。

**推迟到 M2 / 删除**
- 删除：隔离 agentDir 的内存凭据存储（`05` §5.3.6）。
- 推迟（标注，不是新推迟）：评审余量闸控、依赖与塑形在 `03`、`06` 中补 M2 标记；`14` 中以 M2/M3 能力为前提的用例组标注。
- `16` §16.1.13 补登第 80 轮被取代的说法 1 行，由 (D) 检查。

- **lint**：全部检查 `--checks rstuvwxyzckdnSeRqpoPiDgKYATFMBOJCH`，exit 0；没有改动 lint。评审 §3.1 的三条建议：(D) 补登已以 §16.1.13 新行实现（“树的唯一例外”“其余情况下检查点树与 pin 树只去除”“含有保留与未经机器验证”等；“只去除 `.git` 与 gitlink”含反引号，不在 (D) 的收录形状内，改登记其前半句）；(z′) 补登“评审余量”“越过余量”没有实现——前者在 M1 的提示模式中仍是现行术语，后者只有 4 个汉字，按 (z′) 的规则会误报或不收录，改由 `03` 的显式 M2 标记解决；批次覆盖检查没有实现，本轮以人工核对 SP6b 范围内的编号补齐 G33f、G36。
- **排期**：+0.04 人周，没有系统线增量。
  - W12 +0.02（设计）：`inspect.close` 与远程矩阵一行。
  - W13 +0.01（设计）：F7 ② 在 `08` 中的例外与 C39 (f)；单向门审批 L4 的守卫。
  - W16 +0.01（设计）：移出清单的路径记入 `mixedPaths`；落点在 W7-core 的检查点写入，按 ADR-136 改由本地文件清单的负责人完成，系统线 0。
  - 其余与八条观察按 WBS 行逐项不足 0.01，计 0。
  - `14` §14.3.4 与 ADR-133 第 80 轮补记一致：WBS 123.02，余量 系统 0.12、Agent 0.26、桌面 0.36、设计 0.74、安全 0.16，依赖链 19.91，增 1 人 128.94 / T 23.81 / 33 周（新人约 2.51 人周），**M1 维持 38 周**。安全线余量 0.16 高于约 0.12 的改派阈值，不按 ADR-136 改派。

## 第 81 轮对抗评审（全范围）后的跨文档决策（ADR-209）

## ADR-209 移出清单的路径按已记录的 L 回看并作用于 pin、单向门审批可透支、人工编辑检出的准备命令、检验打开期间各定一处 — Accepted（R81 全部条目与评审结论中的观察；Amends ADR-208；Amended by ADR-210、ADR-214）

选择原则（收敛规则，同 ADR-186–208）：只用三种办法关闭条目——(1) 把说法改弱但为真；(2) 删除或推迟不属于 M1 主循环的机制；(3) 在已有的唯一定义处加至多一条守卫、一行或一个字段。本轮复用已有的 `Tower-Local-Exclude` trailer、`Checkpoint.mixedPaths`、`safety` 非回合检查点与已登记事件 `inspect.opened`/`inspect.closed`，新增一条命令 `human_checkout.run_prepare`（M1 界面已有的按钮没有命令，无法以已有命令表达）。不新增状态、事件类型、表、列、载荷字段、决定种类、Needs-You kind、子类型、landmark 或 `step` 取值。安全不变式全部保留，有取舍时都取更严格的一侧。安全问题只写到设计层面。

**Pi v1.2.0 核实**（`packages/coding-agent/src/`；`git show v1.2.0:<path>`）
- `getAgentDir()` 读取进程自身的 `process.env[ENV_AGENT_DIR]`，有值时 `expandTildePath`，否则 `join(homedir(), CONFIG_DIR_NAME, "agent")`（`config.ts:605-611`）；`ENV_AGENT_DIR` 即 `PI_CODING_AGENT_DIR`（`config.ts:585`）；`expandTildePath` 就是 `normalizePath`（`config.ts:588-590`）。
- `AuthStorage.create(authPath = join(getAgentDir(), "auth.json"))`：只有未传入路径时才调用 `getAgentDir()`（`core/auth-storage.ts:348-351`）；`ModelRuntime.create` 把 `options.authPath` 原样交给 `DefaultAuthStorage.create`，`modelsPath` 缺省为 `join(getAgentDir(), "models.json")`（`core/model-runtime.ts:217-220`）。所以显式传入两个路径时，Host 进程自己的环境不影响凭据路径。

**条目（R81 追问清单）**
- **R81-D7-01**（次要；移出清单的人的文件：`mixed` 的触发条件只覆盖少见的一种情形）：唯一定义仍在 `10` §10.7.1 第 1 步“移出清单的路径的归属”，改为回看已有记录：取本 Goal 最近一个记录的 L 含该路径的检查点或 pin S；本次 L 不含它、它出现在本次快照的树中，且 S 之后本 Goal 的检查点与 pin 的树都没有收入过它——即移出清单之后首次进入本 Goal 的快照，不论移出时它是否仍被忽略——按人的改动记录。检查点记入自身的 `mixedPaths`；pin（settle 的 pin 已由 `agent_bg_done` 检查点处理）先以同一棵树写一个 `safety` 非回合检查点并记入它的 `mixedPaths`，所以归因窗口、评审作者推导与 `Tower-Human-Edit` 的既有规则不变。收入之后不再特殊。`10` §10.1.2、`Checkpoint.mixedPaths` 注释、`06` DDL 与 `project.local_files.remove`、`04` §4.6.4、§4.6.7、§4.15.1 同步，并补“让它不再被 git 忽略”（只经 `info/exclude` 忽略的，在下一次获取 base 时生效）。测试：G46 (bh)(6) 第八组改写。
  - **偏离说明**：派工方向是以 `project.local_files.remove` 的事件或决定（带 seq）为依据。核对后它既不是 HumanDecision，也不产生事件（`06` §6.4.3 该行，`16` §16.1.14 没有对应事件类型），清单行在移除时删除；新增事件违反收敛规则，而每个快照上已记录的 L 就是本 Goal 视角下的移除记录，所以改用 trailer 回看。代价：本 Goal 还没有记录 L 的快照时没有记录可比，这一窗口（卫星创建起，含检出完成后在 `ready` 中排队的时间，到第一个检查点或 pin）继续作为已知限制。
- **R81-D8-01**（次要；单向门审批的 L4 仍受按 severity 判定的预算与洪泛降级）：唯一定义为 `08` §8.3.4 `routeTick` 的一行 `overdraw = severity 3 || baseLevel === 4`，洪泛与预算两处守卫都用它；§8.5.2 的全局与单 Goal 洪泛、§8.5.3 的透支、`16` 令牌桶一行改为引用。§8.1 的“L4 可透支”因此成立；勿扰时段压到 L2 的既有规则（`12` §12.6.2）不变。顺带：`02` §2.14 注明 `soundForSeverity3` 的含义是 L4 提示音。
- **R81-D8-02**（次要；人工编辑面板的“运行准备步骤”没有命令）：`06` §6.4.3 新增 `human_checkout.run_prepare{goalId}`：前置条件 `human_checkout` 非空且 `syncState='idle'`；依赖准备未完成或已在运行 → `E_BUSY`；S0 下未授权 → `E_STATE`；档位同 `10` §10.8.3 第 3 步（验证器档位、`env -i`），写允许换为 H；产物只写在 H 中，交还时按 §10.8.4 第 5 步照常判定；运行中交还或放弃时先终止；不产生新事件类型；不是 HumanDecision。仅本机（执行 Agent 写的代码，总规则 3）：`16` §16.5 单列 ✗，`06` 禁止远程一行补列。`10` §10.8.4 第 2 步、`04` §4.6.7、G37 引用。
- **R81-D13-01**（次要；`keep` 之后“检验已关闭”与“检验检出存在期间”不一致）：`10` §10.8.3 第 7 步定义“检验打开期间”= 从 `inspect.opened` 到其后的 `inspect.closed` 或带回，`keep` 保留的目录不算打开；暂停的机会式验证与自动 rebase 在关闭（含 `keep`）或带回后恢复，保留的目录只是一个文件夹，之后带回仍要求卫星当前树等于 T_pin。由验收或放弃触发的清理同样记 `inspect.closed`。§10.2 的目录守卫、§10.10 的空闲点 rebase 例外、§10.11 合并队列一句同步为“打开期间”或按目录存在处理。
- **R81-D14-01**（次要；G46 (bh)(6) 第八组无法构造，G33f、G32b 的远程步骤进入 M1 批次）：第八组改用已批准、只经 `.git/info/exclude` 忽略的普通本地文件 `config/dev.local.json`，同时覆盖检查点、pin（`in_review` 中 `retry_verify`）与“移出时仍被忽略、之后解除忽略”；G33f (d) 改为本机修订、远程可执行一句标 M2，(f) 改为本机收件箱批准、手机一组标 M2；G32b 的手机一步标 M2；SP6b 行写明这些步骤属 M2。

**评审结论中的观察（R81 结论部分）**
- 观察 1（第一个检查点之前移出）：`10` §10.7.1 的已知限制写明窗口含检出完成后在 `ready` 中排队的时间。
- 观察 2（`PI_CODING_AGENT_DIR`）：`05` §5.3.6 新增“用户 agentDir 的取值”唯一定义：首次运行读取登录 shell 环境时一并读取该变量的取值，按 Pi 的同一规则求出用户 agentDir，并以它拼出 `authPath`、`modelsPath` 显式传入，不依赖 Host 进程自己的环境；设置页显示所用路径；`11` §11.3.1 密钥路径表补该目录下的 `auth.json`。
- 观察 3（投递表的完整性）：`11` §11.7.0 投递表补“用户自己的 Pi 凭据文件”一行：Tower 不持有、不复制，Host 内的 Pi 读写并在锁内落盘，Agent、验证器与检验检出的沙箱不可读。
- 观察 4（两处措辞）：`10` §10.7.1 交还 T1 的机密路径改为“保留 T0 的版本，不做 `--force-remove`”；`10` 与 `04` 把移出的路径称为“可能是人的文件”。
- 观察 5（`mark_secret` 的确认框）：`04` §4.15.1 文案补“（含 Agent 对它的修改）”。
- 观察 6（其他措辞）：`06` `goal.hand_back` 的粗体改为“由 pin 推导的原因清除”；`04` §4.6.4 的 `混合` 补移出清单的来源；`03` 状态图写 `slot · deps(M2) · backlog(M2)`，依赖回退的边与 `running` 行标 M2；`12` §12.5.4 过期示例注明为待验收中的目标；`soundForSeverity3` 见 R81-D8-01。
- 观察 7（trailer 排版）：`10` §10.7.1 第 4 步的伪代码在标题行与 trailer 之间空一行，并注明 pin 相同、Tower 只解析自己写的格式。

**推迟到 M2 / 删除**
- 推迟（标注，不是新推迟）：G33f (d)(f) 与 G32b 中的手机与远程客户端步骤。
- `16` §16.1.13 补登第 81 轮被取代的说法 1 行，由 (D) 检查。

- **lint**：全部检查 `--checks rstuvwxyzckdnSeRqpoPiDgKYATFMBOJCH`，exit 0；没有改动 lint。评审 §3.1 的两条建议（批次中用例的手机/远程步骤要求 M2 标记；按钮文案与 `06` §6.4.3 的对照清单）没有实现，本轮以人工核对关闭 G33f、G32b 与“运行准备步骤”，理由见 `reviews/round-81-lint.md`。
- **排期**：+0.04 人周，没有系统线增量。
  - W16 +0.02（设计）：移出清单路径的回看判定与 pin 前的 `safety` 检查点（落点在 W7-core，按 ADR-136 由本地文件清单的负责人完成，系统线 0）；首次运行读取 `PI_CODING_AGENT_DIR` 的取值。
  - W13 +0.01（设计）：`overdraw` 守卫。
  - W12 +0.01（设计）：`human_checkout.run_prepare` 与远程矩阵一行。
  - 其余与七条观察按 WBS 行逐项不足 0.01，计 0。
  - `14` §14.3.4 与 ADR-133 第 81 轮补记一致：WBS 123.06，余量 系统 0.12、Agent 0.26、桌面 0.36、设计 0.70、安全 0.16，依赖链 19.91，增 1 人 128.98 / T 23.81 / 33 周（新人约 2.51 人周），**M1 维持 38 周**。安全线余量 0.16 高于约 0.12 的改派阈值，不按 ADR-136 改派。

## 第 82 轮对抗评审（全范围）后的跨文档决策（ADR-210）

## ADR-210 人工编辑检出的准备命令与检验面板的两个按钮推迟到 M2、用户 agentDir 用于全部用户级 Pi 资源、当前 pin 的检查点与影子忽略规则的刷新时机各定一处 — Accepted（R82 全部条目与评审结论中的观察；Amends ADR-209；Amended by ADR-211）

选择原则（收敛规则，同 ADR-186–209）：只用三种办法关闭条目——(1) 把说法改弱但为真；(2) 删除或推迟不属于 M1 主循环的机制；(3) 在已有的唯一定义处加至多一条守卫、一行或一个字段。本轮的重要条目与两处按钮条目都出自最近两轮新增的机制，一律取删除或推迟到 M2，不加围栏。复用已有事件 `checkpoint.created`、已有命令 `inspect.close` 与 `s0.grant`、已有的 `Tower-Local-Exclude` trailer。不新增状态、事件类型、表、列、载荷字段、命令、决定种类、Needs-You kind、子类型、landmark 或 `step` 取值；删去一条命令（`human_checkout.run_prepare`）。安全不变式全部保留，有取舍时都取更严格的一侧。安全问题只写到设计层面。

**Pi v1.2.0 核实**（`packages/coding-agent/src/`；`git show v1.2.0:<path>`）
- `createAgentSessionServices`：`agentDir = options.agentDir ? resolvePath(options.agentDir) : getAgentDir()`（`core/agent-session-services.ts:139`）；未传 `modelRuntime` 时才以 `join(agentDir, "auth.json")`/`"models.json"` 创建它（`:140-146`）；`SettingsManager.create(cwd, agentDir)` 与 `DefaultResourceLoader({cwd, agentDir, settingsManager})`（`:147-153`）。
- 全局设置：`SettingsManager.create(cwd, agentDir = getAgentDir())` → `join(agentDir, "settings.json")`（`core/settings-manager.ts:308-319`）。
- 资源加载器把同一个 `agentDir` 交给包管理器（`core/resource-loader.ts:377-388`），并以它定位 `SYSTEM.md`、`APPEND_SYSTEM.md`（`:1219`、`:1233`）；包管理器以 `globalBaseDir = this.agentDir`（`core/package-manager.ts:944`）自动发现 `extensions/`、`skills/`、`prompts/`、`themes/`（`:2453-2456`），包安装在 `npm/`、`git/` 之下（`:2099`、`:2180`）。
- 所以设置、扩展、技能、提示、主题与包都只由传入的 `agentDir` 决定；Tower 显式传入用户 agentDir 后，Host 自己的环境不影响任何一项。

**条目（R82 追问清单）**
- **R82-D11-01**（重要；准备命令的写允许含 H/.git）与 **R82-D11-02**（次要；H 中的机密、回退位置、临时目录）：删除 `human_checkout.run_prepare` 与人工编辑面板的“在验证器沙箱中运行准备步骤”按钮，推迟到 M2。M1 中 Tower 不在人工编辑检出中运行任何准备步骤；面板与信任提示如实写明：生成产物需要时由人在自己的终端中运行，这是在 Tower 沙箱之外、以人的权限运行 Agent 可能改过的代码，是否运行由人判断（`00` §0.5.1 能力差异行、`10` §10.8.4 第 2 步、`04` §4.6.7、G37）。M2 重新引入时的前提写在 `10` §10.8.4 第 2 步：不能写 H/.git，也不能在 H 中任意深度造出名字折叠后为 `.git` 的条目（第 3 步“该 gitdir 的全部内容来自 Tower，Agent 从未可写”）；H 中含机密的本地文件按检验检出的显式开关（`inspect_with_secrets`）处理。`06` §6.4.3 删去该行，§6.4.7 禁止远程一行与 `16` §16.5 删去对应项。lint (d) 的 `DELETED` 登记该命令与按钮名（旁边须有 M2 或历史标记）。两条条目因此不再有对象：H/.git 的不变式不再有 Tower 发起的写入者；机密、回退位置与临时目录三点随命令一起消失。
- **R82-D5-01**（次要；用户 agentDir 只用于凭据）：`05` §5.3.6 “用户 agentDir 的取值”一段补一句（唯一定义）：同一个用户 agentDir 用于全部用户级 Pi 资源，一律不调用 Host 的 `getAgentDir()`——非隔离模式传给 `createAgentSessionServices` 的 `agentDir`、静态扩展清单的枚举根（`11` §11.8.2）、S2 读允许列表中 Pi 资源的固定部分与 `auth.json` 的读拒绝（`11` §11.6.2）；文中写作 `~/.pi/agent` 处均指用户 agentDir（默认值）。Pi 出处见上。因此清单枚举的目录就是 Pi 实际加载扩展的目录，“确认之前不加载、不执行任何代码”仍由构造保证。`05` §5.3.5 Host 骨架改为 `userAgentDir`；§5.10 “Adapt Pi”一行改为引用；§5.10 扩展一行的枚举根改为用户 agentDir，并删去 ADR-208 已取代的“只链接 `auth.json`、`models.json`”；`11` §11.6.2、§11.8.2 与 `04` §4.18.1、`05` §5.10 登录前提（观察 8）写为用户 agentDir。lint (d) 另登记“只链接 + auth.json”的与文件无关的匹配（评审 §3.1 的建议，(D) 收不了含反引号的短语）。
- **R82-D4-01**（次要；清单变化后 `in_review` 中的 Fact）：取 ADR-207 的一侧。唯一定义在 `10` §10.7.1 第 1 步：`in_review`/`accepted` 中 Fact 新鲜度与 I2 一样用当前 pin 记录的 L，清单变化不使这些 Fact 变旧、不回到 `verifying`，在下一次 pin 生效；按当时清单求值的只剩 `running` 中的观察器指纹与 Fact 新鲜度，以及基线为 `baseCommit` 的归因比较。`07` §7.3.3 与 `04` §4.19 的“过期即 I2”补这一句；`10` §10.1.2、`04` §4.15.1 的“不打断正在进行的评审”与 G46 第八组原样成立；`12` §12.5.4 的过期示例换为可达的 `paused(verify_env_error)`。
- **R82-D6-01**（次要；非回合检查点的序号）与 **R82-D13-01**（次要；`claimed` 之后的归因基线）：取“照常记事件、统一定义”的一侧，不改 ADR-209 的 pin 落点。`10` §10.7.1 入口一段：非回合入口跳过第 0 步，第 7 步只跳过 `appendEntry`，`checkpoint.created` 照常记录，归因窗口与 `human_edit` 的先后以它的序号界定。`10` §10.3.1 归因基线：`claimed` 及之后的“当前 pin 的检查点”= 树与记录的 L 都等于当前 pin 的最近一个检查点（settle 的 `agent_bg_done`、ADR-209 的 pin 前 `safety` 都只是例子），没有这样的检查点时取当前 pin 本身、按它记录的 L 比较。于是归因表第 4 行与 I2 用同一个 L，来源不明的改动不会只被一方看到。G46 第八组的 E 补“照常记 `checkpoint.created`”。
- **R82-D8-01**（次要；检验面板的两个按钮没有命令）：`inspect.open` 只有 `{goalId, withSecrets?}`，没有可映射的参数，按收敛规则删除两个按钮。信任提示改为 `[打开] [取消]`（`10` §10.8.3、`04` §4.6.6）；S0 未授权时检验仍只复制文件（由授权状态决定，不是参数），面板写明需要运行脚本与服务时的已有路径：先 `inspect.close`，再 `s0.grant`（在 `in_review`/`accepted` 中授权会重新验证），验证完成后再次 `inspect.open`（`04` §4.6.6）。`04` §4.7.3 证据面一行同步。
- **R82-D13-02**（次要；影子 `info/exclude` 的刷新时机）：唯一定义在 `10` §10.1.2 忽略规则一条：每次卫星创建或重建、每次 Run 开始时从用户仓库重新复制，远端 base 与本地 base 相同；获取或检查 base、验证与 pin 都不刷新。`10` §10.1.2 本地文件一条与 `04` §4.15.1 的用户说明改为“该目标下一次开始运行或重建工作区时生效，待验收的目标在请求返工后生效”。G46 (bh)(6) 第八组改为：人先删去忽略行，E 此后开始 Run 并运行到 `in_review`；移出清单时 D 的影子尚未刷新；D 暂停再继续后的下一个 Run 刷新；本地与远端 base 各做一遍。
- **R82-D14-01**（次要；G21、G33d (f)、G35c (p) 含 M2 步骤）：G21 改为“我来改”并交还（写回卫星）与检查点，回退与自动 rebase 一组标 M2；G33d (f) 的 web 客户端一组、G35c (p) 的分叉一组标 M2（预期格同步）；SP6b 行补列这三组。

**评审结论中的观察（R82 结论部分）**
- 观察 1（机会式 pin）：`10` §10.7.1 第 1 步写明规则同样作用于运行中的机会式 pin，`safety` 检查点与 pin 在同一次 `wtLock` 内以同一棵树写出，其间不重新 `add -A`。
- 观察 2（`safety` 的 ref）：统一为 `cp/<n>`、landmark `safety`：`10` §10.2 ref 表、§10.7.2 唯一写者一段、§10.8.1 第 0 步与 `16` §16.1.12 同步。
- 观察 3、观察 6（准备命令的产物归属与其他边界）：随 R82-D11-01 的删除失效。
- 观察 4：`08` §8.5.3 补“（单向门审批除外）”。
- 观察 5（经交还首次收入的移出路径）：`10` §10.7.1 第 1 步注明 `human_edit` 检查点首次收入时同样记为 `mixed`、不写 `Tower-Human-Edit`，取保守的一侧（ADR-209 “`Tower-Human-Edit` 的既有规则不变”一句以此为准）。
- 观察 7：`07` §7.2.4 `eligible()` 加一行“不在检验打开期间”，引用 `10` §10.8.3 第 7 步。
- 观察 8：见 R82-D5-01。
- 观察 9：`04` §4.15.1 本地文件建议的忽略按钮删除（没有命令与持久化）；`06` `inspect.bring_back`、G36c (b) 与 `16` `Goal.pendingHandBack` 的合并队列一步标 M2。
- 观察 10（环境变量只读一次）：`05` §5.3.6 写明之后修改该变量 Tower 不会自动重新读取，作为已知限制；不新增重新检测的命令。
- 观察 11：`13` §13.11.1 检查点一行注明回看判定按 Goal 增量维护，O(清单大小)，不扫描历史 trailer。

**删除 / 推迟到 M2**
- 删除（推迟到 M2）：`human_checkout.run_prepare` 与人工编辑面板的“在沙箱中运行准备步骤”按钮（ADR-209 新增）；M2 重新引入的前提见 `10` §10.8.4 第 2 步。
- 删除：检验信任提示中的“只复制文件”按钮；S0 未授权时检验面板的直接授权再检验按钮（以 `inspect.close` → `s0.grant` → `inspect.open` 的已有路径代替）；`04` §4.15.1 本地文件建议的忽略按钮。
- 推迟（标注，不是新推迟）：G21 的回退与自动 rebase、G33d (f) 的 web 客户端、G35c (p) 的分叉；`06` `inspect.bring_back`、G36c (b)、`16` `Goal.pendingHandBack` 中的合并队列一步。
- `16` §16.1.13 补登第 82 轮被取代的说法 1 行，由 (D) 检查；lint (d) 的 `DELETED` 补两项。

- **lint**：全部检查 `--checks rstuvwxyzckdnSeRqpoPiDgKYATFMBOJCH`，exit 0。改动 lint 一处：`DELETED` 补“准备命令与按钮名（M2）”与“只链接 + auth.json”两项。评审 §3.1 的另一条建议（批次中用例步骤扫描“回退”“自动 rebase”“fork”“web 端”等关键词）没有实现，本轮以人工核对补标 G21、G33d (f)、G35c (p)，理由见 `reviews/round-82-lint.md`。
- **排期**：+0.01 人周，没有系统线与安全线增量。
  - W12 −0.01（设计）：准备命令与远程矩阵一行删除；检验面板两个按钮删除计 0。
  - W16 +0.02（设计）：用户 agentDir 用于资源加载目录、静态清单与读允许列表（读允许列表一侧只替换路径根，安全线 0）；影子 `info/exclude` 的刷新时机（落点在 W7-core，按 ADR-136 由本地文件清单的负责人完成，系统线 0）。
  - 其余条目与各条观察按 WBS 行逐项不足 0.01，计 0。
  - `14` §14.3.4 与 ADR-133 第 82 轮补记一致：WBS 123.07，余量 系统 0.12、Agent 0.26、桌面 0.36、设计 0.69、安全 0.16，依赖链 19.91，增 1 人 128.99 / T 23.82 / 33 周（新人约 2.51 人周），**M1 维持 38 周**。安全线余量 0.16 高于约 0.12 的改派阈值，不按 ADR-136 改派。

## 第 83 轮对抗评审（全范围）后的跨文档决策（ADR-211）

## ADR-211 Pi 的包自动安装与 agentDir 由 Host 环境的两个 Pi 开关统一、忽略规则不追溯、settle 的 `agent_bg_done` 与检验带回的检查点、未送达评论与丢失检出的出口各定一处 — Accepted（R83 全部条目与评审结论中的观察；Amends ADR-127、ADR-210；Amended by ADR-212）

选择原则（收敛规则，同 ADR-186–210）：只用三种办法关闭条目——(1) 把说法改弱但为真；(2) 删除或推迟不属于 M1 主循环的机制；(3) 在已有的唯一定义处加至多一条守卫、一行或一个字段。两条重要条目都用 Pi 自己的环境开关（`PI_OFFLINE`、`PI_CODING_AGENT_DIR`）关闭，不自建资源加载流程、不向 `createMcpExtension` 逐项传入替代实现。复用已有命令 `comment.create`/`comment.delete`、`goal.take_over`/`goal.resume`/`goal.discard_human_edits`，已有 landmark `human_edit` 与字段 `humanPaths`，已有 Needs-You kind `stalled`（新增一个子类型取值 `human_checkout_lost`，子类型不是登记的三方枚举）。不新增状态、事件类型、表、列、载荷字段、命令、决定种类、Needs-You kind 或 landmark；删去评论“未送达”的两个按钮。安全不变式全部保留，有取舍时都取更严格的一侧。安全问题只写到设计层面。

**Pi v1.2.0 核实**（`packages/coding-agent/src/`；`git show v1.2.0:<path>`）
- 包的自动安装：`createAgentSessionServices` 构造资源加载器后立即 `await resourceLoader.reload(...)`（`core/agent-session-services.ts:148-154`）；`reload()` 无条件 `await this.packageManager.resolve()`，不带 `onMissing`（`core/resource-loader.ts:529`；`loadCurrentExtensionSet` 同，`:681`）；`resolve()` 对全局与项目设置的 `packages` 逐个解析（`core/package-manager.ts:926-942`）。npm 来源未安装或已安装版本不满足设置的范围（`:1323-1324`、`:1513-1519`）、git 来源未安装（`:1338`）时调用 `installMissing`：`PI_OFFLINE` 为真则返回 false 并 `continue`（不加载，`:1309`、`:1326-1327`、`:1339-1340`），否则没有 `onMissing` 时直接 `installParsedSource`（`:1310-1312`），即在 Host 进程中运行 `npm install`（含生命周期脚本）或 `git clone`。`isOfflineModeEnabled()` 只读 `process.env.PI_OFFLINE`（`1`/`true`/`yes`，`:60-63`）；全仓库没有调用方传入 `onMissing`，`ResourceLoader.reload` 也不接受它，SDK 没有等价选项。同一开关还管：临时 git 来源的刷新（`:1341`、`:2027`）、`update`（`:1129`）、npm 批量安装（`:1224`）与更新检查（`:1522`、`:1573`）；`grep`/`find` 缺少 `rg`/`fd` 时从网络下载到 `getBinDir()`（`utils/tools-manager.ts:349-380`，离线时 `:361` 跳过；查找顺序为 agentDir 的 `bin/` 再 `PATH`，`:83-102`）；模型目录的网络刷新（`core/model-runtime.ts:247`、`:859`）。CLI 的 `--offline` 只是设置同一个变量（`main.ts:578-581`；帮助文字 `cli/args.ts:343`、`:465`）。SDK 路径中没有其他安装或更新包、扩展的调用点（`packageManager.install/update` 只由 `package-manager-cli.ts` 调用）。
- `getAgentDir()` 读 `process.env.PI_CODING_AGENT_DIR`（`config.ts:585`、`:605-611`）。SDK 路径上 Tower 无法显式传入的调用：内置 MCP 扩展缺省 `loadConfig` 时 `loadMcpConfig({agentDir: getAgentDir(), …})`（`extensions/mcp/index.ts:1344`），`mcp.log`（`:370`），`McpOAuthCredentialStore` 的 `mcp-auth.json` 与锁目录（`extensions/mcp/oauth.ts:147-148`），这三项可经 `McpExtensionOptions` 的 `loadConfig`/`credentials`/`logPath` 替换（`index.ts:69-77`）；工具二进制目录 `TOOLS_DIR = getBinDir()` 在模块加载时求值（`utils/tools-manager.ts:10`；`utils/shell.ts:139` 同目录）。其余调用点或已由 Tower 显式传参覆盖（`auth-storage.ts:348`、`model-runtime.ts:220`、`models-store` 随 `modelsPath`、`settings-manager.ts:310`、`agent-session-services.ts:139`），或只在交互模式与 CLI 中出现（`crash-log.ts:21` 只被 `interactive-mode.ts` 调用，`keybindings.ts:337`、`migrations.ts`、`package-manager-cli.ts`、`startup-ui.ts`）。
- 全局设置：Tower 传入自建的 `settingsManager` 时 `createAgentSessionServices` 不调用 `SettingsManager.create(cwd, agentDir)`（`core/agent-session-services.ts:147`），全局设置文件由 Tower 的存储决定；Pi 自己的取法是 `join(agentDir, "settings.json")`（`core/settings-manager.ts:308-319`）。
- 所以 ADR-210 的“设置、扩展、技能、提示、主题与包都只由传入的 `agentDir` 决定；Host 自己的环境不影响任何一项”对设置与内置 MCP 扩展不成立，并漏掉了资源加载时的包自动安装；本 ADR 以下列规则取代这一句。

**条目（R83 追问清单）**
- **R83-D11-01**（重要；资源加载时在 Host 中自动安装包）与 **R83-D5-01**（重要；内置 MCP 与全局设置不随传入的 `agentDir`）：唯一定义在 `05` §5.3.6 Host 环境表新增一行“Pi 运行开关”：Host 环境恒设 `PI_OFFLINE=1` 与 `PI_CODING_AGENT_DIR`=本 Run 的 agentDir（非隔离为用户 agentDir，隔离为 `~/.tower/pi-agent/`，与传给 `createAgentSessionServices` 的 `agentDir` 同值）；两项在 `host.spawn` 时写入（工具二进制目录在模块加载时求值），下一个 Run 选定的 agentDir 与存活 Host 不同时先让该 Host 退出再启动；两项不进入 bash 与 MCP 的基础环境。效果：Pi 在 Tower 中从不安装或更新包，设置中缺失或版本不符的包跳过、不加载；MCP 配置、`mcp-auth.json`、`mcp.log` 与工具二进制目录都随本 Run 的 agentDir。`05` §5.3.3 定义 `globalPath` = 本 Run 的 agentDir 下的 `settings.json`（隔离模式不读用户设置，因此也不解析用户的 `packages`）；`05` §5.3.6 用户 agentDir 一段改为如实的范围（删去“一律不调用 Host 的 getAgentDir()”与“Pi 以它定位全局 settings.json”）；§5.3.5 骨架注释、§5.10 Adapt 一行与隔离 agentDir 一句、§5.4.1 RPC（M2）的环境同步。静态清单（`05` §5.10 唯一定义，`11` §11.8.2 引用）只列已安装且版本与设置相符的包，列出而未安装或版本不符的单列为“未安装：Tower 不安装、不加载；请在你的终端中运行 `pi` 安装”，装好后清单变化，按已有规则重新确认；“确认之前不加载、不执行任何代码”括注它依赖的开关。`11` §11.7.1 环境白名单、§11.8.2 清单行、T16 缓解与 §11.7.0 凭据表引用同一定义；`00` §0.5.1 能力差异表补一行（不安装、不更新包；不下载 `rg`/`fd`）。依赖 D45 改写为两项开关（A 类，C11、C40）；契约测试新增 C40；G46 新增 (bi)（复用 C40 的夹具）。没有采用“向 `createMcpExtension` 逐项传入”与“自建资源加载并传 `onMissing:"skip"`”两种取法：前者只解决 MCP，后者需要绕过 `reload()`，二者都比 Pi 自己的开关多一层自建机制。
- **R83-D6-01**（次要；settle 的 `agent_bg_done` 受去重）：取“不受去重”的一侧。`10` §10.7.1 去重例外补一句：settle 第 4 步的 `agent_bg_done` 同样不适用第 2 步（作者照常为 `agent`），每次 settle 都有它的检查点，I4(b) 与 `06` §6.2.3 的 Projector 断言照字面成立；交还第 7 步与 `safety` 同树时仍按 §10.8.4 记在该检查点上（ADR-184 不变）。`16` §16.1.6 landmark 行同步。代价：时间线在每个 Run 末尾都有“后台结束”标记，它本就是 `12` 时间线的已有标签。
- **R83-D7-01**（次要；检验带回的检查点）：唯一定义在 `10` §10.8.3 第 7 步：带回写回后记一个 `author:"human"`、landmark `human_edit` 的非回合检查点，`humanPaths` = 以 T_pin 为基线的写回集合中改动的路径（与 §10.8.4 第 8 步同一取法）。§10.7.1 非回合入口的 `human_edit` 补“检验带回”；§10.3.1 的 `Tower-Human-Edit` 列举补“检验带回”；`10` 检查点字段注释、`16` `Checkpoint.humanPaths` 行与 `06` `inspect.bring_back` 行同步。
- **R83-D8-01**（次要；评论“未送达”的两个按钮）：删除。已有规则（`05` §5.7.1 最后一行、§5.7.4）本就让未送达的评论留在 Tower 队列、下一次 Run 开始时随开场送达；`04` F4 第 4 步改为写明这一点、不另设按钮；`04` §4.6.3 与 §4.18.3、`12` 回执行同步：`■ 未送达` 无需操作，不想再发时 `comment.delete`；`过期` 的 `重新发送` 映射为以原正文预填评论编辑器、确认后 `comment.create`。`05` §5.7.3 `stale` 删去没有命令的“人选择不再投递”。
- **R83-D8-02**（次要；“人工编辑检出已丢失”的 Needs-You 没有 kind）：映射到已有 kind `stalled`，子类型 `human_checkout_lost`（与 `satellite_missing` 同类：Tower 的工作目录不在了），severity 2，`costOfDelay:"none"`，去重键 `st:{goalId}:human_checkout`；出口“再次接管”“继续”→ `actionable`，“放弃改动”→ `informative`（`08` §8.4、§8.8 各一行；`06` §6.1.6 引用）。
- **R83-D13-01**（次要；影子索引的历史影响快照）：取“忽略规则不追溯”。唯一定义在 `10` §10.7.1 第 1 步：已收入影子索引的路径此后即使匹配忽略规则也照常更新、留在之后的快照中（`add -A` 本就如此，与 git 一致），只有 (b)(d) 先 `--force-remove`；验收与 seal 的 `full` 的全新临时索引以影子索引此刻收录的树初始化（不带 stat，全部重新哈希），与 decisive 收录同一组路径，二者只可能在内容上不同；`stat_cache_mismatch` 之后的“清空影子索引”即以这次 `full` 的临时索引取代它。`10` §10.1.2 两条（忽略规则改为“不会新进入”；`11` §11.8.1 两种复核仍以 `baseCommit` 初始化）、§10.7.1 指纹注释、`07` §7.3.2 两处断言同步。没有取“追溯”：它要为由此产生的删除另定归属。
- **R83-D14-01**（次要；G21 在 B1）：G21 移到 B3（第 23 周，依赖 W7-rest 的交还，第 22 周），与 G23 同批；用例只换批次，补跑现值不变。
- **R83-D15-01**（次要）：(a) `12` §12.6.5 人工编辑实况行的括注改为“面板只显示提示，`04` §4.6.7”。(b) `06` §6.4.3 的 `goal.rewind`/`goal.fork`、`run.rewind`、`run.fork_goal` 标 M2（ADR-059）；`16` §16.5 回退与分叉一行、`08` §8.13 诊断视图的回退与分叉动作标 M2；`06` §6.1.6 drain 行的 `rewind` 目标与“回退恢复检查点的中途”标 M2。其余未标的合并队列步骤见观察 7。

**评审结论中的观察（R83 结论部分）**
- 观察 1：`10` §10.8.4 第 2 步的提示补“它能改动 H 中包括 git 元数据在内的任何文件”。
- 观察 2：`04` §4.6.6 S0 检验路径补半句：授权引起的重新验证失败时按归因决定去向（窗口内没有人的改动即自动返工），从已验收出发不延续验收；在其他暂停中授权只记录授权、不改变状态（`06` §6.4.3 `s0.grant`）。
- 观察 3：G46 表头与 SP6b 行的 M2 排除清单补 (al) 与 (au) 的 web 端一组（(au) 的其余部分属 M1，照常运行）。
- 观察 4：`12` §12.5.4 写明同一 `paused(verify_env_error)` 中本次因环境故障未运行的标准显示 `⚠`，其余仍停在旧提交的显示 `⟲`。
- 观察 5：`02` `externalChange.baselineCps` 的元素改为 `CheckpointId | Sha`（没有对应检查点时为当前 pin 或 `baseCommit`）；`16` `Goal.externalChange` 行与 `10` §10.8.1 `restorePaths` 的输入同步。
- 观察 6：`10` §10.7.1 第 2 步：回合入口只与上一个回合检查点比较，`safety` 等非回合检查点不使其后同树的回合去重；`12` §12.12 时间线补 `safety` 的标签“保护快照”；`07` §7.7.1 M2 的振荡检测注明只取回合检查点。
- 观察 7：`16` `Goal.humanCheckout` 行的 `suspended` 两处与 `10` §10.8.3 第 7 步的两处合并队列步骤标 M2。
- 观察 8：工具二进制目录随 R83-D5-01 的开关解决；崩溃日志只在交互模式写，SDK 下不涉及；`mcp-auth.json`、`models.json` 补进 `11` §11.3.1 密钥路径表；`09` §9.11 注明隔离 agentDir 的 Goal 不加载用户级 `AGENTS.md`、`SYSTEM.md`、技能与提示，“生效上下文”面板按实际 agentDir 列出。
- 观察 9（`inspect.bring_back` 的远程规则）：与 `goal.hand_back` 一致，`serve` 属 M2，不改。
- 观察 10：`16` §16.1.14 写明 `checkpoint.created{projectId, n, piEntryId?}`；landmark、作者、`mixedPaths`、`humanPaths` 由 `checkpoints` 表承载。
- 观察 11：`06` `goal.hand_back` 第 ① 步删去“检查点（landmark:human_edit）”，注明 `human_edit` 检查点只在写回后记一次；`inspect.bring_back` 行同理。
- 观察 12：`05` §5.6.5 的“第 8 步”改为“第 7 步”；`06` §6.2.4 `startAgentActivity` 改为“安装器（含两种检出的依赖准备）、检验检出的生命周期脚本”；`00` §0.5.1 与 §0.6 的就地编辑标 M2；`05` §5.4.1 的 RPC 环境随 R83-D5-01 改为同一规则。
- 观察 13（回应文件的表述）：`auth.json` 在三类沙箱中不可读，由 `11` §11.6.2 读允许列表不含它与 §11.7.0 凭据一行保证，正文不改。

**删除 / 推迟到 M2**
- 删除：评论“未送达”的 `在下次运行开始时送达` 与 `重新发送并继续运行` 两个按钮（以已有的队列规则与 `comment.delete` 代替）；`05` §5.7.3 `stale` 中没有命令的“人选择不再投递”。
- 推迟（标注，不是新推迟）：回退与分叉的命令行、远程矩阵一行、诊断视图动作与 drain 中的回退；合并队列的其余三处；G46 (al) 与 (au) 的 web 端一组。
- `16` §16.1.13 补登第 83 轮被取代的说法 1 行，由 (D) 检查。

- **lint**：全部检查 `--checks rstuvwxyzckdnSeRqpoPiDgKYATFMBOJCH`，exit 0；见 `reviews/round-83-lint.md`。
- **排期**：+0.05 人周，没有系统线增量。
  - W6 +0.02（Agent）、W10 +0.01（安全）、W13 +0.01（设计）、W16 +0.01（设计，W7-core 的落点按 ADR-136 改派）；其余条目与各条观察按 WBS 行逐项不足 0.01，计 0。
  - `14` §14.3.4 与 ADR-133 第 83 轮补记一致：WBS 123.12，余量 系统 0.12、Agent 0.23、桌面 0.36、设计 0.66、安全 0.14，依赖链 19.91，增 1 人 129.06 / T 23.83 / 33 周（新人约 2.51 人周），**M1 维持 38 周**。安全线余量 0.14 仍高于约 0.12 的改派阈值，不按 ADR-136 改派。

## 第 84 轮对抗评审（全范围）后的跨文档决策（ADR-212）

## ADR-212 独立的隔离 agentDir 推迟到 M2、`bashEnv` 与包目录的查找顺序、检查点事件的载荷、丢失检出与评论关闭各定一处 — Accepted（R84 全部条目与评审结论中的观察；Amends ADR-211、ADR-208、ADR-066；Amended by ADR-213、ADR-232）

选择原则（收敛规则，同 ADR-186–211）：只用三种办法关闭条目——(1) 把说法改弱但为真；(2) 删除或推迟不属于 M1 主循环的机制；(3) 在已有的唯一定义处加至多一条守卫、一行或一个字段。本轮先判断独立的隔离 agentDir 是否为 M1 所必需（见下），结论是否，把它推迟到 M2，由此关闭 R84-D6-01 与 R84-D5-02 的 (b)(c)。复用已有命令 `comment.edit`、`goal.take_over`、`goal.resume`，已有字段 `Comment.requiresChange`、`goals.takeover_from`，已有事件 `checkpoint.created`（补全载荷，不新增事件类型），已有的 `noExtensions` 资源加载选项。不新增状态、事件类型、表、列、命令、决定种类、Needs-You kind、子类型或 landmark。安全不变式全部保留，有取舍时都取更严格的一侧；安全问题只写到设计层面。

**隔离 agentDir 是否为 M1 所必需（决定）**
- 来历：`riskTier=high` 与清单确认之前以 `~/.tower/pi-agent/` 启动（R2-D11-01，`11` §11.8.2）；ADR-208 让它共用用户凭据文件，ADR-211 让 Host 环境的 `PI_CODING_AGENT_DIR` 随它变化。
- 它在 M1 中保护的只有一项：**确认之前与高风险 Goal 不加载沙箱外代码**（用户扩展、包中的扩展、MCP）。这一项由已有的 `noExtensions:true` 单独提供：v1.2.0 中它使资源加载只保留 CLI/inline 扩展，自动发现的扩展、`packages` 解析出的扩展与 builtin 的 mcp、codemode、tool-search 都不加载（`core/resource-loader.ts:577-578`，`enabledExtensions` 来自 `packageManager.resolve()`，`:529`、`:553`）。Tower 不传 CLI 扩展，inline 只有 tower-goal。
- 隔离目录额外挡掉的是用户的技能、提示模板、上下文文件与 settings——它们不是沙箱外代码（技能脚本在 S2 中执行，`05` §5.3.6 读允许列表），M1 已不读项目扩展、项目包与项目 MCP（ADR-202），也不需要为高风险 Goal 去掉用户自己的说明文件。
- 它的代价正是本轮四条条目：进程级开关随 Run 变化而需要重启 Host、打包模式需要按 agentDir 分组（R84-D6-01）；隔离 Goal 中 `rg`/`fd` 只在空的 `~/.tower/pi-agent/bin` 中查找、用户的 `shellPath`/`commandPrefix` 不生效、`~/.agents/skills` 却照常加载（R84-D5-02）。
- 所以**推迟到 M2**：M1 中每个 Run 的 agentDir 都是用户 agentDir，Host 环境的 `PI_OFFLINE=1` 与 `PI_CODING_AGENT_DIR`=用户 agentDir 对所有 Host 相同；清单确认之前与 `riskTier=high` 只以 `noExtensions:true` 不加载扩展与 MCP（唯一定义 `05` §5.10）。没有采用“打包 Host 按 agentDir 分组、§6.1.8 补退出时机、为隔离 Goal 提供 `rg`/`fd` 与 shell 设置”：那是为一个不必要的机制再补三处机制。

**Pi v1.2.0 核实**（`packages/coding-agent/src/`；`git show v1.2.0:<path>`）
- bash 环境：`resolveSpawnContext` 以 `{...getShellEnv()}` 起步（`getShellEnv()` 展开整个 `process.env` 并把 `getBinDir()` 加到 `PATH` 前面，`utils/shell.ts:139-150`），只删除并重设 `PI_SESSION_ID`、`PI_SESSION_FILE`、`PI_PROVIDER`、`PI_MODEL`、`PI_REASONING_LEVEL`，然后交给 `spawnHook`（`core/tools/bash.ts:185-206`）。所以 Host 环境中的两项一定出现在 `spawnHook` 的输入中。
- 包目录：用户级 npm 来源先算安装路径再判断是否需要安装（`core/package-manager.ts:1321-1324`）；`getNpmInstallPath` 在 `<agentDir>/npm/node_modules/<名字>` 不存在时取 legacy 全局路径（`:2151-2158`），后者经 `getPnpmGlobalPackagePath`（pnpm：`list -g --depth 0 --json`，`:2118-2130`）或 `getGlobalNpmRoot`（`root -g`；bun 为 `pm bin -g`，`:2102-2116`）以 `runNpmCommandSync` 同步运行用户设置的 `npmCommand`（`:1787-1797`、`:1846-1849`），出错时返回 undefined（`:2143-2149`）；全局路径存在且版本相符时照常加载。这一查询在 `installMissing` 的离线判断（`:1309`）之前，不受 `PI_OFFLINE` 控制。git 来源的安装路径不含 ref（`:2160-2170`），只看目录是否存在（`:1336-1340`）。所以 ADR-211 的 C40 断言“没有包管理器子进程”在 v1.2.0 上不成立：未安装的 npm 包必然引起一次只读全局根查询。
- `rg`/`fd`：`getToolPath` 先查 `TOOLS_DIR`（= `getBinDir()`，模块加载时求值），再查 `PATH`（`utils/tools-manager.ts:10`、`:83-102`）；`ensureTool` 离线时不下载（`:361`）；`grep` 找不到时报 “ripgrep (rg) is not available”（`core/tools/grep.ts:119-121`）；交互式 `pi` 启动后会下载两者到 `getBinDir()`（`modes/interactive/interactive-mode.ts:1089-1090`）。
- 模型目录：`ModelRuntime` 以 `process.env.PI_OFFLINE === undefined` 设 `modelNetworkEnabled`（`core/model-runtime.ts:247`），网络刷新还要求 `allowModelNetwork === true`（`:251`），Tower 不传；会话服务只做 `refresh({allowNetwork:false})`（`core/agent-session-services.ts:194`）。
- 扩展子进程：`execCommand` 以不带 `env` 的 `spawn` 启动，继承 Host 环境（`core/exec.ts:36-46`）。
- `~/.agents/skills`：恒按 `getHomeDir()` 求出（`core/package-manager.ts:2464`、`:2555-2567`），与 agentDir 无关。

**条目（R84 追问清单）**
- **R84-D6-01**（次要；进程级开关与打包模式的 Host）：随隔离 agentDir 推迟而关闭。`05` §5.3.6 “Pi 运行开关”（唯一定义）删去“agentDir 不同时先让该 Host 退出”，改为：两项对所有 Host 相同，不因 Goal、Run、`riskTier` 或清单是否确认而变（这些只决定每个会话的 `noExtensions`），Host 不因它们重启，打包 Host 的各 Goal 进程环境一致。`06` §6.1.8 与 `13` §13.5 的退出时机因此不需要新增一条。
- **R84-D5-01**（次要；`bashEnv` “保留 `PI_*`”）：唯一定义在 `05` §5.3.6 表前一段：`bashEnv` 只输出表中“bash 环境”一列给出的变量与五个会话变量，不按前缀保留，Pi 运行开关在这里被去掉；`05` §5.3.5 骨架注释、`11` §11.4 与 §11.7.1、C28a 改为引用。ADR-066 中“`spawnHook` 的环境白名单保留 `PI_*`”以本条为准。
- **R84-D5-02**（次要；隔离 agentDir 下的实际差异）：(b) 与 (c) 随推迟消失——每个 Run 读用户 settings（`globalPath` 恒为用户 agentDir，`05` §5.3.3），`00` §0.5.1、`11` §11.4、C28a 的 shell 设置照字面成立；`09` §9.11 改为每个 Goal 都加载用户级上下文文件、技能与提示，`~/.agents/skills` 恒按 `$HOME` 加载。(a) 对没有运行过交互式 `pi`、`PATH` 中也没有 `rg`/`fd` 的用户仍然成立：取“写明后果并在首次运行提示”，不由 Tower 提供二进制——`05` §5.3.6 “Pi 运行开关”一行写明查找顺序与后果，首次运行检测按同一顺序检查并提示，`00` §0.5.1 一行写给用户。
- **R84-D11-01**（次要；legacy 全局包路径与 C40）：唯一定义在 `05` §5.10 静态清单：包目录的判定与查找顺序同 Pi——用户级 npm 来源先查用户 agentDir 的 `npm/`，不存在时查包管理器的全局根；Supervisor 以 Host 的同一环境与同一 `npmCommand` 运行 Pi 运行的同一只读查询（只运行包管理器自身、不执行包的代码；~~与安装器第 1 阶段同类~~——第 85 轮更正：第 1 阶段的配置在 Agent 不可读的 `$TI`，而当时的 Host 环境含指向 `$GS` 的包管理器配置，二者不同类；查询的环境与它运行的是你配置的 `npmCommand` 以 ADR-213 为准），在那里找到的包同样列出并按目录哈希；git 来源的“版本不符”只指 npm 的版本范围。“确认之前不加载、不执行任何代码”改为“不执行任何扩展或包的代码”，并写明唯一的子进程是这一查询；`11` §11.8.2 清单行同步。D45 补这一依赖。C40 与 G46 (bi) 的断言改为“没有安装子进程（包管理器的 `install`、`git clone`）与注册表请求”，记录并允许一次只读全局根查询，另加一组“全局根中有版本相符的包”：清单在确认之前就列出并哈希它。
- **R84-D6-02**（次要；`checkpoint.created` 的载荷）：取“补全载荷”。唯一定义在 `16` §16.1.14：载荷即 `checkpoints` 行建立时的全部列（`projectId, n, runId?, sessionId?, piEntryId?, author, commit, tree, satelliteHead?, landmarks, takenAt, durationMs?, excludedPaths, externalPaths, mixedPaths, humanPaths?`），Projector 只从它写入该行。检查点建立后不再改写：`10` §10.8.4 第 7 步与 `safety` 同树时，第 6 步建立该检查点时即带上第 7 步的 landmark 与路径集合（判定在第 6 步已可求出；ADR-184 的“记在同一检查点上”不变）。此后只有 `unusable` 投影自 `workspace.recovered`（ADR-185）；信息性的 `in_user_repo` 不由事件承载，重建时按用户仓库中实际存在的地标 ref 求出——`06` §6.2.1 “可以从 `events` 完全重建”一句写明这一例外。
- **R84-D4-01**（次要；丢失检出的两条路径与再次接管）：`06` §6.1.6 人工编辑检出一行（唯一定义）写明同一规则适用于运行中由文件系统事件与操作前检查发现的丢失：清除 `human_checkout`，保留 `takeover_from` 与 `takeover_prior_reasons`；于是“继续”（`goal.resume`）不再被 `human_checkout` 守卫拒绝。`goal.take_over` 加一条守卫：`human_checkout` 为空而 `takeover_from` 非空（检出已丢失）时保留这两项、不改写，只写新的 `human_checkout`。`06` 列注释、`10` §10.8.4 检出丢失一条（改为引用）、`08` §8.4 去重键行、`16` §16.1.7 子类型行同步。
- **R84-D8-01**（次要；评论“人关闭”与 `dropped` 的人选分支）：唯一定义在 `05` §5.7.3：人关闭 = 人以 `comment.edit` 把该评论的 `requiresChange` 改为 `false`，由 `comment.*` 事件留痕，回执显示 `你已关闭`，不新增状态或字段；`02`、`03`、`04`、`06` §6.4.7、`11` §11.9、`16` 的“被人关闭”都指它，`06` §6.4.3 `comment.*` 行与 `04` §4.6.3、F4 第 3 步写明。`dropped` 删去“且人选择丢弃”，只保留 Pi 返回 `handled` 一个来源（`abort` 后清出的评论本就放回队列，§5.7.4）。
- **R84-D13-01**（次要；情形 B 与 `07` 伪代码）：`10` §10.7.1 第 1 步“忽略规则不追溯”（唯一定义）补一句：影子目录被删除后重建（§10.16.2 情形 B）时影子索引以从备份取回的最新可用检查点的树初始化，没有时才以 `baseCommit`；情形 B 一行引用。`07` §7.3.2 `worktreeTree` 伪代码不再在 `full` 之后删除临时索引，而是返回它，由调用方在 `stat_cache_mismatch` 时取代影子索引、否则删除。
- **R84-D14-01** 与 **R83-D14-01** 的剩余部分（次要；B3 中依赖后续实现的用例）：G11、G19、G21、G23、G33、G35、G35b 移到 B4（第 31 周）。核对甘特：交还树级语义与检出依赖准备在桌面线第 23–24 周，继续目标与 `onAllReasonsCleared()` 在系统线第 26–27 周，`external_change` 持久状态在第 25–26 周，Run 令牌识别与后台写入表在桌面线第 27–29 周，都早于第 31 周；B3 只留 G18、G26b、G29、G31，其依赖（系统与安全线第 22 周）不变。B3 的依赖列写明移出的原因；执行线与补跑现值不变。
- **R84-D15-01**（次要）：(a) `16` §16.1.7 `stalled` 子类型表补 `human_checkout_lost`（引用 `06` §6.1.6）；(b) `04` §4.7.2 时间线规则与 `12` §12.12 对齐：四种非回合检查点，`agent_bg_done` = 每次 settle 的后台结束快照，`human_edit` = 交还或检验带回（就地编辑属 M2），补 `safety`（保护快照）；(c) `10` §10.7.1 `Checkpoint.author` 注释补“检验带回”；(d) `06` §6.2.4 准备流程的 Host 环境拼装补 Pi 运行开关（整台机器同一个值，没有重启判断）。

**评审结论中的观察（R84 结论部分）**
- 观察 1：`05` §5.3.6 “Pi 运行开关”写明扩展经 `pi.exec` 派生的子进程继承这两项，偏保守，不是泄漏。
- 观察 2：同一行写明 Tower 本就不做模型目录的网络刷新，`PI_OFFLINE` 在这里不改变实际行为；`00` §0.5.1 写明模型列表来自 Pi 内置目录与用户自己的 `pi` 最近一次刷新。
- 观察 3：`06` §6.4.3 `s0.grant` 行补：`s0_grant_pending` 既不是当前原因也不在 `also_applies` 中时，授权或拒绝只写 `s0_grant` 列，不改变状态与继续目标、不开始验证；`04` §4.6.6 改为“先处理该暂停，之后的验证完成后再打开检验”。
- 观察 4：`06` §6.2.3 I4 的 Projector 断言注明只对经 settle 进入的 `claimed`（`claim_on_behalf` 是 `03` §3.2.1 的例外），pin 的树等于该 Run **最近一个** `agent_bg_done` 检查点的树。
- 观察 5：`05` §5.7.1 写明队列中的评论随下一个开始的 Run 送达，无论由恢复、自动返工还是交还的 `continue_agent` 开出。
- 观察 6：评论回执的 `未送达` 改用 `◇`（无需操作，不是异常）；`12` §12.6.2 `■` 一行删去它、`◇` 一行列入，`04` §4.6.3、F4 与 §4.18.3 同步。
- 观察 7：`06` §6.1.4 drain 一行与 §6.1.6 卫星丢失行、`04` §4.2.2 介入一行、§4.6.7 编辑期间说明与从验收接管一条、§4.16 F12 两处、§4.18.3 应用退出一行、`12` §12.6.4 暂停中一行中的“回退”与合并队列、自动 rebase 标 M2；`04` §4.7.2 诊断线框后注明“尝试 2 / 回退后放弃”是 M2 的情形。
- 观察 8：`03` §3.2.1、`06` §6.4.3 `goal.discard_human_edits`、`10` §10.8.4、`16` `Goal.humanCheckout` 行中基线的“否则为 pin 的检查点”改为“当前 pin 的检查点，没有时为 pin 本身（`10` §10.3.1）”。
- 观察 9：`04` §4.5.2 改动区块的帮助说明加一句固定提示：之后才加入忽略规则、但此前已被收入的文件仍会进入提交。

**删除 / 推迟到 M2**
- 推迟到 M2：独立的隔离 agentDir（`~/.tower/pi-agent/`、骨架中的 `isolatedAgentDir` 与 `spec.resources.isolated`），以及随它存在的 agentDir 变化时重启 Host 的规则、`globalPath` 的隔离分支、C40 的隔离一组、`09` §9.11 的隔离上下文说明；ADR-208 的“隔离 agentDir 的凭据来源”改为“凭据来源”（M2 若恢复隔离 agentDir，凭据仍取用户 agentDir）。lint (d) 新增一项：这些名字只能在 M2 或历史标记旁出现。
- 删除：`05` §5.7.3 `dropped` 中没有命令的“且人选择丢弃”；`07` §7.3.2 伪代码中 `full` 之后的 `rm(index)`。
- 移批（不是推迟）：G11、G19、G21、G23、G33、G35、G35b 从 B3 移到 B4。
- `16` §16.1.13 补登第 84 轮被取代的说法 1 行，由 (D) 检查。

- **lint**：全部检查 `--checks rstuvwxyzckdnSeRqpoPiDgKYATFMBOJCH`，exit 0；(d) 新增隔离 agentDir 一项，(w) 补 `stalled` 子类型须在 `16` §16.1.7 登记的子检查，(z′) 补 “回退” 与 “接管” 同行须带 M2 标记的按行检查（评审 §3.1 的两条建议）；见 `reviews/round-84-lint.md`。
- **排期**：+0.03 人周，没有系统线增量。
  - W6 −0.01（Agent，隔离 agentDir 推迟）、W10 +0.01（安全）、W12 +0.01（设计，W3 与 W7-rest 的落点按 ADR-136 改派）、W16 +0.02（设计，W3 与 W7-core 的落点按 ADR-136 改派）；其余条目与各条观察按 WBS 行逐项不足 0.01，计 0。
  - `14` §14.3.4 与 ADR-133 第 84 轮补记一致：WBS 123.15，余量 系统 0.12、Agent 0.25、桌面 0.36、设计 0.63、安全 0.12，依赖链 19.91，增 1 人 129.08 / T 23.83 / 33 周（新人约 2.52 人周），**M1 维持 38 周**。安全线余量降到约 0.12 的改派阈值，本轮不改派；下一次落在安全线上的增量须先按 ADR-136 改派。

## 第 85 轮对抗评审（全范围）后的跨文档决策（ADR-213）

## ADR-213 Host 环境不引用 Agent 可写的位置、全局根查询的环境、检查点载荷的上限与只追加的列、重建的例外与交还的延后验证各定一处 — Accepted（R85 全部条目与评审结论中的观察；Amends ADR-212、ADR-137、ADR-063；Amended by ADR-214、ADR-215）

选择原则（收敛规则，同 ADR-186–212）：只用三种办法关闭条目——(1) 把说法改弱但为真；(2) 删除或推迟不属于 M1 主循环的机制；(3) 在已有的唯一定义处加至多一条守卫、一行或一个字段。本轮重要条目以 Host 环境的唯一定义处（`05` §5.3.6）的一条规则关闭，没有采用评审 (b) 提出的“每次创建会话后比对清单”的新机制：规则成立之后，Host 存活期间的重新解析只读你自己拥有、Agent 不可写的位置，与你在 Host 存活期间改动 `extensions/` 同类，写为已知限制。复用已有的事件 `checkpoint.created`、`fact.recorded`、`workspace.recovered`、`satellite.recovered`（补可选的 `projectId`），已有的 `goals/<G>/artifacts/` 目录，已有字段 `Goal.pendingHandBack`（补可选的 `returnTo`），已有命令 `comment.edit`/`comment.delete`（写明参数）。不新增状态、事件类型、表、列、命令、决定种类、Needs-You kind、子类型或 landmark。安全不变式全部保留，有取舍时都取更严格的一侧；安全问题只写到设计层面。

**Pi v1.2.0 核实**（`packages/coding-agent/src/`；`git show v1.2.0:<path>`）
- Host 中读取包管理器配置的只有包目录的解析：每次 `createAgentSessionServices` 都新建 `DefaultResourceLoader` 并 `reload()`（`core/agent-session-services.ts:148-154`），`reload()` 无条件调用 `packageManager.resolve()`（`core/resource-loader.ts:529`）；用户级 npm 来源先算安装路径（`core/package-manager.ts:1321-1324`），`getNpmInstallPath` 在 `<agentDir>/npm/node_modules/<名字>` 不存在时调用 `getLegacyGlobalNpmInstallPath`（`:2151-2158`、`:2143-2149`）。
- 这一查询经 `runNpmCommandSync` → `runCommandSync` 同步运行，`env` 取 `getEnv()`，即 Host 的 `process.env`（Linux 上为空时读 `/proc/self/environ`），不传 `cwd`、不设超时（`:16-33`、`:1846-1849`、`:2752-2765`），所以 npm 读到的配置（含 `NPM_CONFIG_USERCONFIG` 所指文件中的 `prefix`）与工作目录都来自 Host 进程。命令取用户级设置的 `npmCommand`（`:1787-1797`）。
- 次数：npm 的 `root -g`（bun 为 `pm bin -g`）按 `npmCommand` 在每个 `PackageManager` 实例中缓存（`:2102-2116`）；pnpm 的 `list -g --depth 0 --json` 每个包运行一次、不缓存（`:2118-2130`），找不到时再落到 `root -g`（`:2145`）。离线时缺失的来源 `installMissing` 返回 false 后直接跳过，不再第二次求路径（`:1309`、`:1325-1327`）。版本判定只读 `package.json`，不运行子进程（`:1513-1519`、`:1538-1549`）。

**条目（R85 追问清单）**
- **R85-D11-01**（重要；全局根查询的环境含 Agent 可写的包管理器配置）：唯一定义在 `05` §5.3.6 新增的一段“Host 环境不引用 Agent 可写的位置”：Host 进程环境与工作目录中没有任何值指向 Agent 可写的位置（本 Goal 的卫星与 gitdir、`$GS`、`$TMPDIR/tower-<goalId>`）；`16` §16.8 的角色 A 变量（含 `NPM_CONFIG_USERCONFIG=$GS/npmrc`）只由 `bashEnv` 与 Tower `exec` 的同一白名单加入 Agent 一侧——环境表“包管理器私有存储”一行的 Host 列改为“—”。Host 的包管理器环境是你自己的：`PATH` 取首次运行时从登录 shell 读到、经人确认的目录（Agent 可写位置之下的目录不收入）再加系统路径（`PATH` 行的 Host 列，Tower 按项目选出的 Node 与包管理器只在 A、I、V 的 `PATH` 中，ADR-085 本就只规定这三者）；包管理器位置变量（`NPM_CONFIG_PREFIX`、`NPM_CONFIG_USERCONFIG`、`NPM_CONFIG_GLOBALCONFIG` 的大小写两种写法与 `PNPM_HOME`）取登录 shell 的值；工作目录为主目录。这些值与 `PI_CODING_AGENT_DIR` 一样在首次运行时读取一次（ADR-209），整台机器同一个。Supervisor 的清单查询用同一环境（`05` §5.10）。`06` §6.2.4 的 Host 环境拼装、`07` §7.4.3、`11` §11.7.1 与 §11.8.2、`16` §16.8 篡改用例、`14` P8 同步。Host 存活期间的新会话照常由 Pi 重新解析，变化只可能来自你自己的改动，在下一次 Host 启动前的清单计算中列出（`05` §5.10、`11` §11.8.2 写明为已知限制）。C40 补两组断言（Host 环境不含指向 Agent 可写位置的值；Agent 改写 `$GS/npmrc` 之后同一 Host 中的新会话全局根与 `extensionsResult` 不变），G46 补 (bj)。ADR-212 中“与安装器第 1 阶段同类”不成立（第 1 阶段的配置在 Agent 不可读的 `$TI`），已在原文标注更正。
- **R85-D11-02**（次要；高风险 Goal “逐项加回扩展”没有机制）：删除。M1 中高风险 Goal 不加载任何扩展与 MCP，没有按条目加回的机制，推迟到 M2；要用扩展只能降低 `riskTier`（仅本机）。`05` §5.10（唯一定义）、`11` §11.8.2、`16` §16.6 特性表、`00` §0.5.1 同步；lint (d) 新增一项。
- **R85-D5-01**（次要；全局根查询的环境与用户终端不同）：随 R85-D11-01 的规则成立：(a) Host 与 Supervisor 用你登录 shell 中的 `PATH`、包管理器位置变量与你自己的配置文件，所以 Tower 与你在终端中运行的 `pi` 得到同一个全局根，“请在你的终端中运行 `pi` 安装”的补救有效；如实写明你在某个项目目录中运行 `pi`、而该项目的包管理器配置改变了全局位置时结果可能不同，用户级的包集合本就与项目无关。(b) 环境整台机器同一个，不随项目或 Goal 变化，清单只有一份。(c) C40 改为“全局根查询之外没有包管理器子进程”，不限次数，npm 与 pnpm 各跑一遍。`05` §5.10 写明运行的是你配置的 `npmCommand`（可以是包装脚本），Supervisor 的查询限时 10 s，失败按没有全局根处理（与 Pi `:2143-2149` 一致）。
- **R85-D6-01**（次要；完整载荷与 16 KB 上限；三个 landmark 只能事后补写）：(a) `16` §16.1.14（唯一定义）：载荷会超过 16 KB 时，非空的路径集合都整组写入 `goals/<G>/artifacts/paths-<sha256>.json`（按内容哈希命名，写入并 `fsync` 之后才追加事件），载荷中换成 `{sha256, count}`，Projector 与重建按哈希读回。没有取“由检查点的树重算”：`mixedPaths`、`externalPaths`、`humanPaths` 由当时的归因求出，`excludedPaths` 是 git 拒绝收录、本就不在树中的路径，都不能从树重算，所以也不截断。`13` §13.9.1 写明这一处置。(b) “建立后不再改写”改为显式列表：建立后只追加两列——`landmarks` 只追加 `verify_pass`/`verify_fail`/`criteria_flip`，`unusable` 投影自 `workspace.recovered`。`10` §10.7.1 `landmarks`（唯一定义）写明写入规则：`submit` 与 `rework_start` 在回合检查点建立时写（本回合含 `submit` 调用；`Run.reason = rework` 的 Run 的第一个回合检查点；本回合没有检查点时不补写）；三个验证类 landmark 在一次验证的全部 `criterion_check` Fact 记录之后，由 Supervisor 追加到被验证 pin 的“当前 pin 的检查点”，重建时由同一组 `fact.recorded` 推出。时间线的验证地标仍以 Fact 为准（`10` §10.8.2）。
- **R85-D6-02**（次要；“领域表可以从 events 完全重建”不成立）：取“收窄断言”。`06` §6.2.1（唯一定义）列出全部三处例外与各自的来源：`checkpoints.in_user_repo` 按用户仓库中的地标 ref 求出；`runs` 中不由 `run.*` 载荷承载的列从被重建的库或最近的 `db-backups/` 逐行沿用，都没有时未结束的 Run 记为 `crashed`、其后台进程不能再按令牌识别；`needs_you` 没有创建事件，重建后由各生产者按状态重新判定生成。没有取“补全 `run.started` 与 Needs-You 的创建事件”：那要给十余列与每种 Needs-You 新增载荷，超出一个字段的修改。
- **R85-D4-01**（次要；延后执行的 `reverify` 丢失 `returnTo`）：`16` §16.1.1 `Goal.pendingHandBack`（唯一定义）补可选字段 `returnTo`：交还写 `pendingHandBack` 时在同一事务清除 `takeoverFrom` 之前由它取得（∈ {`in_review`, `accepted`} 时才写），延后执行只读它，`Goal.verifyFrom = returnTo ?? claimed`。`02` §2.4 的形状与 `verifyFrom` 注释、`06` DDL 注释与 `goal.hand_back`、`10` §10.8.4、`16` `Goal.verifyFrom` 行同步。ADR-137 中“`returnTo` = `takeoverFrom`”的取值时机以本条为准。

**评审结论中的观察（R85 结论部分）**
- 观察 1：`05` §5.3.1 “与 CLI 的行为完全一致”、§5.10 的 MCP / codemode / tool_search 一行与 G10、`00` §0.5.1 各补半句：清单确认之前与 `riskTier=high` 时这三项都不加载（D46）。
- 观察 2：`11` §11.7.0 投递表的“非隔离模式本来就读它”改为“本来就读它”；`14` K11 “高风险隔离”改为“高风险 Goal 不加载扩展”；lint (d) 的隔离 agentDir 一项补“非隔离模式”。
- 观察 3：`05` §5.10 写明运行的是你配置的 `npmCommand`（可以是包装脚本）、Supervisor 的查询限时 10 s 与失败时的清单表现；`13` §13.5 的冷恢复目标旁注明这一查询不在预算内，Pi 中它同步、无超时，由 120 s 的准备时限兜底。
- 观察 4：`rg`/`fd` 的提示文案只在 `05` §5.3.6 “首次运行检测”定义，`04` §4.18.1 引用；每次 Host 启动时按同一顺序重新判定，能力摘要随之更新。
- 观察 5：`06` §6.4.3 `comment.*` 分列三条命令的参数，`edit`/`delete` 带 `commentId`；`delete` 只删除尚未送达的评论，已送达的返回 `E_STATE`，必须修复评论只经“人关闭”退出验收闸门；远程关闭与总规则 3 的关系随 `serve`（M2）复审；`05` §5.7.3 非 hunk 锚点补 `trace`。
- 观察 6：`06` §6.1.6 丢失检出的“再次接管”在 `external_change` 未解除时置灰并提示先采纳或撤销；`goal.discard_human_edits` 的比较基准写明丢失后再次接管的新检出没有 `rebuiltTree` 时同样取 `satellite.recovered`，“接管以来”从第一次接管算起。
- 观察 7：`10` §10.3.1 归因表第 3 行与 §10.8.4 第 7 步的 `bg_process_survived` 注记写明由同一时间窗内的 `anomaly{bg_process_survived}` Fact 推导显示，不存储在检查点上。
- 观察 8：`workspace.recovered` 与 `satellite.recovered` 补可选的 `projectId`（多仓库 Goal 中带，`16` §16.1.14、`10` §10.16.2、§10.18）。
- 观察 9：`07` §7.3.2 `worktreeTree` 的声明返回类型补 `tempIndex?`。
- 观察 10：`04` §4.7.2 与 `12` §12.12：landmarks 为 `[safety, agent_bg_done]` 时显示 `保护快照`，悬停列出两者。
- 观察 11：G46 (bi) 同 C40 固定夹具的全局根，其中没有这两个包。

**删除 / 推迟到 M2**
- 推迟到 M2：高风险 Goal 按已确认条目加回扩展（`11` §11.8.2 “合同中可逐项加回”、`16` §16.6 “合同逐项加回”、`05` §5.10 末句）。lint (d) 新增一项：这一说法只能在 M2 或历史标记旁出现。
- 删除：Host 环境中的角色 A 包管理器变量与按项目选出的 Node、包管理器 `PATH` 前缀（只留在 A、I、V 的环境中）；`comment.delete` 对已送达评论的删除。
- `16` §16.1.13 补登第 85 轮被取代的说法 1 行，由 (D) 检查。

- **lint**：全部检查 `--checks rstuvwxyzckdnSeRqpoPiDgKYATFMBOJCH`，exit 0；(d) 新增“逐项加回”一项、隔离 agentDir 一项补“非隔离模式”，(i) 补一项子检查（评审 §3.1 的第二条建议）；见 `reviews/round-85-lint.md`。
- **排期**：+0.04 人周，没有系统线与安全线增量。
  - W6 +0.02（Agent，W10 的落点按 ADR-136 改派）、W16 +0.02（设计，W10、W3 与 W7-core 的落点按 ADR-136 改派）；其余条目与各条观察按 WBS 行逐项不足 0.01，计 0。
  - `14` §14.3.4 与 ADR-133 第 85 轮补记一致：WBS 123.19，余量 系统 0.12、Agent 0.22、桌面 0.36、设计 0.61、安全 0.12，依赖链 19.91，增 1 人 129.13 / T 23.84 / 33 周（新人约 2.52 人周），**M1 维持 38 周**。系统线与安全线仍在约 0.12 的改派阈值上，下一次落在这两条线上的增量须先按 ADR-136 改派。

## 第 86 轮对抗评审（全范围）后的跨文档决策（ADR-214）

## ADR-214 stdio MCP 服务器的工作目录、全局根查询的时限、登录 shell 路径值的显示与重新读取、交还等待时的再次接管、重建的例外与路径集合的载荷上限各定一处 — Accepted（R86 全部条目与评审结论中的观察；Amends ADR-213、ADR-209、ADR-134；Amended by ADR-215、ADR-216、ADR-218）

选择原则（收敛规则，同 ADR-186–213）：只用三种办法关闭条目——(1) 把说法改弱但为真；(2) 删除或推迟不属于 M1 主循环的机制；(3) 在已有的唯一定义处加至多一条守卫、一行或一个字段。本轮重要条目以 Pi 自己的开关关闭：SDK 下 Tower 本就传入自己的 MCP 传输工厂，工厂自行决定 stdio 服务器的 spawn 工作目录，而服务器的 `roots` 由 Pi 的连接单独声明；所以不推迟 stdio 服务器，也不新增机制。复用已有的 `McpExtensionOptions.createTransport`、`mcp.json` 每个服务器的 `cwd`、`paused(prepare_failed)` 与 120 s 准备时限、`goals/<G>/artifacts/` 的内容哈希文件、`E_STATE`。新增一条命令 `engine.reread_login_shell`（仅本机；R86-D5-01 要求的显示与重新读取）。不新增状态、事件类型、表、列、决定种类、Needs-You kind、子类型或 landmark。安全不变式全部保留，有取舍时都取更严格的一侧；安全问题只写到设计层面。

**Pi v1.2.0 核实**（`packages/coding-agent/src/`；`git show v1.2.0:<path>`）
- 内置 MCP 扩展以会话的 `ctx.cwd` 为 `sessionCwd`（`extensions/mcp/index.ts:297`、`:1121`），把它与传输工厂一起交给每个服务器连接（`:570-571`，工厂可由 `McpExtensionOptions.createTransport` 替换，`:69-73`）。连接以它声明 `roots`（`extensions/mcp/runtime.ts:364`），并把它作为第二个参数调用工厂（`:378`）。
- 默认工厂的 stdio 分支为 `cwd: resolve(cwd, expandHome(config.cwd ?? "."))`（`runtime.ts:118`）；`mcp.json` 的 stdio 服务器配置有 `cwd` 字段，“相对路径相对会话工作目录”（`core/mcp-servers.ts:86-87`）；`StdioTransport` 以 `options.cwd` spawn（`packages/mcp/src/transports/stdio.ts:58`、`:94-96`）。HTTP 分支不涉及工作目录（`runtime.ts:104-109`）。
- 工厂在 `connectOnce` 的 `try` 中调用（`runtime.ts:377-378`），抛出时经 `open()` 的 `connectFailed` 把服务器记为 `failed` 并保存错误文字（`:348-351`、`:409-416`〔第 90 轮更正：应为 `:409-418`，`return new Error(…)` 在 L417〕）；stdio 服务器没有重试（`:343`）。
- 项目级 `.pi/mcp.json` 只在项目被信任时读取（`extensions/mcp/config.ts:145-149`），M1 中 Pi 的项目信任恒为假（ADR-202），所以只有用户级 `mcp.json` 的服务器。
- 全局根查询：`runCommandSync` 同步、无超时（`core/package-manager.ts:2752-2765`），任何异常返回 `undefined`（`:2143-2149`）；资源加载另有 `extensionsOverride`（`core/resource-loader.ts:596`），但它在扩展模块加载之后才运行（`:586`），不能用作“只加载清单中的包”的开关，未采用。

**条目（R86 追问清单）**
- **R86-D11-01**（重要；stdio MCP 服务器以卫星为工作目录在沙箱外启动）：Pi 让工厂决定 spawn 的工作目录，所以取评审的 (a)。唯一定义在 `05` §5.3.5 “stdio 服务器的工作目录”：`towerMcpTransport` 不用会话工作目录：`config.cwd` 为绝对路径时取它；为相对路径或未写时以 Tower 的空目录 `~/.tower/mcp-cwd/` 为基准求出（创建时为空、Tower 之后从不写入；在 `~/.tower/**` 之下，三种沙箱都拒绝读写，沙箱外工具写它列入硬底线，`11` §11.3.3、§11.6.2；`06` §6.6.1 目录布局补一行）；结果落在 Agent 可写的位置之下时不创建传输、抛出错误，Pi 把该服务器记为 `failed`，静态清单在该条目旁写同一句。`roots` 仍为卫星，代码智能类服务器不受影响；`args` 中的相对路径（如 `.`）改为指向这个空目录，原先依赖会话目录的服务器须写指向自己目录的绝对 `cwd`（`00` §0.5.1 如实写明）。基准取空目录而不取主目录（第 86 轮修订中途更正）：以主目录为基准会让以 `.` 配置的服务器能触及整个主目录，空目录更严，同样不是 Agent 可写的位置。HTTP 服务器照常加载。`05` §5.3.6 的规则推广到 “Host 为 stdio MCP 服务器选定的工作目录”。`11` §11.3.4 “以卫星为根运行”改为 “以 `roots` 为根”，§11.8.2 清单行与残余、T4、T16 写明；`14` G10 的夹具改为 `roots`；C21 补一组、G46 补 (bk)，只写期望；`00` §0.5.1 新增一行，README 的例外补半句。RPC（M2）无法替换传输，须保持同一不变式，随 M2 复审。
- **R86-D11-02**（次要；Supervisor 查询限时 10 s 而 Pi 无时限）：删去 Supervisor 自己的 10 s 时限，与 Pi 一样不另设时限，由 120 s 的准备时限兜底；查询出错或在准备时限内没有返回时，全局根记为 “未知” 而不是 “没有全局根”，本次不启动 Host，Run 进入 `paused(prepare_failed)`（`05` §5.10 唯一定义）。所以 “未安装” 只在查询成功、全局根中确实没有时出现，Host 中的 Pi 用同一环境与命令同样找不到它；“10 s 的口径” 因此不再需要。`11` §11.8.2、`13` §13.5、`00` §0.5.1 同步；C40 补一组；lint (d) 新增一项。
- **R86-D5-01**（次要；“经人确认的目录” 没有界面，取值冻结）：删去 “经人确认”。`05` §5.3.6 “首次运行检测”（唯一定义）：读到的 `PI_CODING_AGENT_DIR`、收入 Host `PATH` 的目录与包管理器位置变量显示在设置页引擎组，附 “重新读取”（`engine.reread_login_shell`，仅本机），只替换这些值，下一次 Host 启动生效，清单随之重新计算；Tower 仍不自动重新读取（ADR-209 的限制保留，补上恢复途径）。`00` §0.5.1 改为 “与那时你在终端中运行的 `pi` 找到的相同”。`04` §4.15、`06` §6.4.3 与 §6.4.7、`16` §16.5 同步；lint (d) 新增一项。
- **R86-D4-01**（次要；`pending_hand_back` 非空时再次接管）：取 `E_STATE`。`goal.take_over` 的守卫（`06` §6.4.3 唯一定义）补一项：`pending_hand_back` 非空时返回 `E_STATE`，提示先解除剩余的暂停原因（交还会随之执行），界面上 “我来改” 置灰并显示同一提示。第二次交还因此不会覆盖或残留第一次的选择，`03` §3.2.1 与 `10` §10.8.4 “不会注入 `tower.handback`” 不再有例外。`16` `Goal.pendingHandBack` 引用。
- **R86-D6-01**（次要；重建例外不完整）：`06` §6.2.1（唯一定义）改为 “一切领域写入”、例外四处：(2) 补 `sessions` 整表；删去 “两处都没有的行”——事件与这些行在同一份库中，从 `db-backups/` 恢复时也来自同一份备份（观察 9）；(3) 补 `paused(question_timeout)` 的阻塞问题由进入这一原因时所依据的 `engine.ui_request` 重建，`goal.resume` 的守卫照常判定；(4) 运行时表 `watermarks`、`timers`、`engine_outbox` 从被重建的库原样沿用，`projections` 重新生成。
- **R86-D6-02**（次要；另外三个事件的路径集合没有上限处置）：外置规则写成通则，唯一定义移到 `06` §6.3 “载荷中的路径集合”：任何事件的路径数组字段使载荷会超过 16 KB 时整组按内容哈希外置，不截断；适用的事件列出全部四个（`checkpoint.created`、`goal.external_change.detected`、`workspace.paths_restored`、`human_checkout.handed_back`）。`16` §16.1.14 各行、`13` §13.9.1、`10` §10.8.4 引用；lint (i′) 扩为 “任何文档中带路径数组字段的事件签名都必须在该列表中，列表中的事件在索引行写明 16 KB 与 `06` §6.3”。

**评审结论中的观察（R86 结论部分）**
- 观察 1：`05` §5.3.6 “Agent 不可写” 与 §5.10、`11` §11.8.2 “变化只可能来自你自己的改动” 补 “（S2 下；S0 见 T23）”；集合改为 “任一 Goal 的…”，写明每次 `host.spawn` 时检查。
- 观察 2：`11` §11.8.2 残余补 “已确认的扩展在 Host 进程内改写 `process.env` 或工作目录”，归入用户确认的那段代码的行为。
- 观察 3：`05` §5.3.6 写明 `XDG_DATA_HOME`、pnpm ≥ 11 的 `pnpm_config_*` 等不传入，用到它们时全局根可能与终端不同。
- 观察 4：`10` §10.7.1 `landmarks`：“全部通过” 即每条 `criterion_check` 满足 `isVerifiedPass`；没有 `criterion_check` 或中途取消的验证不追加；追加的三个值数据库层不校验（触发器只在 INSERT 时检查）。
- 观察 5：`16` §16.1.14 “其余列” 改为 “其余由事件承载的列”。
- 观察 6：并入 R86-D6-02 的通则：文件随 `goals/<G>/` 保留与清除（每日备份只含数据库），缺失或哈希不符时重建报错停止、不替换现有的库。
- 观察 7：`06` §6.4.3 `comment.edit` 对已送达的评论只接受 “人关闭”，其余修改返回 `E_STATE`。
- 观察 8：`06` §6.4.3 `goal.abandon` 写明从 `paused` 放弃时清除的五个字段。
- 观察 9：并入 R86-D6-01，删去该分支。
- 观察 10：`05` §5.3.6 的引用改为 `06` §6.2.4；`06` §6.2.4 改为 `<全部 wtRoot>`；`16` §16.8 A 的 `PATH` 写明追加的是工具链变量所指目录下的 `bin`、只取 S2 读允许中的，不追加 Host 的登录 shell `PATH`。
- 观察 11：`13` §13.5 写明 Host 存活期间的同步查询阻塞事件循环，挂起超过心跳阈值时按 `06` §6.1.3 的 Host 心跳超时处理。
- 观察 12：`04` §4.10.2 补 “风险等级” 一条：高风险时写明不加载扩展与 MCP，降低在同一处（`goal.update_meta`，仅本机）。
- 观察 13：`14` 依赖链注改为 “第 70–86 轮 0，ADR-198–214”；G46 标题补 ADR-206/207/211/212/214 与 R78–R79、R83–R86；`00` §0.5.1 的引用补到 ADR-213/214，“首次运行时会提示” 改为每次 Host 启动时重新判定。
- 观察 14：`00` §0.5.1 新增的一行与 `05` §5.3.6 “首次运行检测” 写明登录 shell 中没有 Node 时以 `npx`/`node` 启动的 MCP 服务器与扩展失败，并提示。
- 观察 15：`10` §10.3.1 归因表第 3 行改为 “该检测器条目打开期间（检出到解决）”。
- 评审对第 85 轮限制的限定（“S2 下接受”）：已随观察 1 写入正文。

**删除 / 推迟**
- 删除：Supervisor 全局根查询自己的 10 s 时限；“经人确认的目录”；`runs` “两处都没有的行” 的分支。
- 没有推迟到 M2 的条目（stdio MCP 服务器在 M1 照常启动，只是工作目录不同）。
- `16` §16.1.13 补登第 86 轮被取代的说法 1 行，由 (D) 检查；lint (d) 新增两项。

- **lint**：全部检查 `--checks rstuvwxyzckdnSeRqpoPiDgKYATFMBOJCH`，exit 0；(d) 新增两项，(i′) 扩为路径集合通则（评审 §3.1 第一条建议）；见 `reviews/round-86-lint.md`。
- **排期**：+0.07 人周，没有系统线与安全线增量。
  - W6 +0.02（Agent，W10 的落点按 ADR-136 改派）、W12 +0.01（设计，W3 的落点按 ADR-136 改派，属 W12a）、W16 +0.04（设计，W10、W3 与 W7-core 的落点按 ADR-136 改派）；其余条目与各条观察按 WBS 行逐项不足 0.01，计 0。
  - `14` §14.3.4 与 ADR-133 第 86 轮补记一致：WBS 123.26，余量 系统 0.12、Agent 0.20、桌面 0.36、设计 0.55、安全 0.12，依赖链 19.91，增 1 人 129.21 / T 23.86 / 33 周（新人约 2.51 人周），**M1 维持 38 周**。系统线与安全线仍在约 0.12 的改派阈值上，下一次落在这两条线上的增量须先按 ADR-136 改派。

## 第 87 轮对抗评审（全范围）后的跨文档决策（ADR-215）

## ADR-215 内置 MCP 的来源自检、stdio MCP 空工作目录的清空与相对路径、全局根查询的 60 s 时限、交还等待时接管守卫的同步、重建按“由事件重放的表”清单与其余沿用各定一处 — Accepted（R87 全部条目与评审结论中的观察；Amends ADR-214、ADR-213、ADR-186、ADR-131；Amended by ADR-216）

选择原则（收敛规则，同 ADR-186–214）：只用三种办法关闭条目——(1) 把说法改弱但为真；(2) 删除或推迟不属于 M1 主循环的机制；(3) 在已有的唯一定义处加至多一条守卫、一行或一个字段。复用已有的模式：ADR-187 的 Tower 工具来源自检 → `paused(prepare_failed)`（推广到内置 MCP 的来源）、静态清单的文本扫描与确认卡片提示、`E_STATE` 与置灰、`goals/<G>/artifacts/` 的内容哈希文件。不新增状态、事件类型、表、列、命令、决定种类、Needs-You kind、子类型或 landmark。安全不变式全部保留，有取舍时都取更严格的一侧；安全问题只写到设计层面。

**Pi v1.2.0 核实**（`packages/coding-agent/src/`；`git show v1.2.0:<path>`）
- CLI 把内置 MCP 登记为 `{name:"mcp", …, replaceable:true, builtin:true}`，注释写明注册 `codemode`、`tool_search` 或 `/mcp` 的扩展（如第三方 MCP 扩展）取而代之（`extensions/index.ts:9-13`）。`InlineExtension.replaceable` 的语义：另一个扩展在加载时注册了它同名的工具、命令或标志时略去它，工厂仍会运行（`core/extensions/types.ts:2058-2065`）。
- 资源加载在扩展加载之后调用 `omitReplacedExtensions`（`core/resource-loader.ts:709`、`:785`）：以全部非 `replaceable` 扩展的 `tool:`/`command:`/`flag:` 名字为占用集合，可取代的扩展与之重名即被略去；被略去的是 `builtin:` 路径时只留一条警告，写出取代它的扩展与名字（`:115-150`；前缀 `BUILTIN_PATH_PREFIX = "builtin:"`，`core/source-info.ts:15`）。SDK 以 `builtin:true` 交给资源加载的条目同样以 `builtin:<name>` 加载、同样设置 `replaceable`（`:380-382`、`:727-743`）。
- 内置 MCP 在加载时只注册命令 `mcp`（`extensions/mcp/index.ts:1260`）；MCP 工具在连接之后才注册（`:387-460`），连接在 `session_start` 中开始（`:1114`）。所以在 v1.2.0 中“取代内置 MCP” 等价于另一个已加载的扩展注册了命令 `mcp`。Pi 文档：注册 `/mcp` 的扩展（如 `pi-mcp-adapter`）取代内置 MCP，Pi 不再读 `mcp.json`、不再连接其中的服务器（`docs/mcp.md:264-266`）。
- Host 在会话创建之前即可读到最终的扩展集合：`createAgentSessionServices` 返回的 `resourceLoader`（`core/agent-session-services.ts:78`，`:154` 完成 `reload`）的 `getExtensions().extensions[]` 带 `path` 与 `commands`（`core/extensions/types.ts:2268-2284`）。
- `pi.registerMcpServer` 注册的服务器经同一连接与工厂（`extensions/mcp/index.ts:343-363`）。默认工厂对 `command`、`args`、`cwd` 展开 `~`，对 `env` 的值解析 `${NAME}` 与 `!cmd`（`extensions/mcp/runtime.ts:98-122`，`core/mcp-servers.ts:84`）。

**条目（R87 追问清单）**
- **R87-D11-01**（次要；第三方 MCP 扩展取代内置 MCP 时 Tower 的 stdio 规则不生效）：沿用 ADR-187 的来源自检。唯一定义在 `05` §5.3.5 “内置 MCP 的来源自检”：资源加载之后、会话创建与 `session_start` 之前（因而在任何 MCP 服务器启动之前），已加载的扩展中注册命令 `mcp` 的只能是路径为 `builtin:mcp` 的 Tower 条目（带 `towerMcpTransport`）；否则不开 Run → `paused(prepare_failed)`，卡片写出该扩展。用户设置了 `-builtin:mcp` 而没有别的扩展注册它时没有 MCP，照常开 Run；不加载扩展的 Run 不受影响。静态清单的文本扫描另标出可能注册 `/mcp` 命令的扩展，确认卡片写“该扩展取代 Pi 内置的 MCP，M1 中不可用：启用期间 Tower 不能启动运行”。扩展不经 `/mcp`、自己启动的子进程（含它自己连接的 MCP 服务器）仍属 `11` §11.8.2 残余中“用户确认的那段代码的行为”。`11` §11.3.4 MCP 一条、§11.8.2 清单行与残余、T4、T16 的陈述限定为内置 MCP 生效时；`03` §3.2.1 与 `06` F4b 的 `prepare_failed` 入口、`04` §4.8.11 的卡片示例、`00` §0.5.1 新增一行、README 的例外补半句；D53 补可取代性的引文；C21 补一组，只写期望。RPC（M2）随 M2 复审。
- **R87-D11-02**（次要；空目录的“始终为空”无人执行，相对路径门禁未随“基准已知”更新）：唯一定义在 `11` §11.3.4 “stdio MCP 服务器的空工作目录与相对路径”。(a) `~/.tower/mcp-cwd/` 由 Tower 拥有：Supervisor 每次 `host.spawn` 时、Host 启动之前删除并重建为空目录（删除不跟随符号链接），删去 “Tower 之后从不写入、不清空”；它仍在硬底线（写）之内，三种沙箱都拒绝读写；写进其中的东西不越过一次 Host 的生命周期（打包模式下同一 Host 的其他 Goal 在这期间仍可能受影响，如实写明）。(b) 经 `towerMcpTransport` 启动的 stdio 服务器（含扩展注册的）的工作目录由 Tower 求出，门禁把它们的工具参数中的相对路径分别以该工作目录与 `roots` 为基准解析，任一结果落在硬底线之内即 forbid（例如绝对 `cwd` 在主检出之内时，相对路径的读写与其他对主检出的读写一样 forbid）；沙箱外工具的读写方向门禁无法判定，只禁止写的位置在路径扫描中一律按写处理（偏严）。用户扩展工具与 HTTP 服务器的工具没有已知基准，照旧至少 ask；不含 `/` 的单个文件名仍不当作路径（尽力而为的限制不变，T7/T26）。代价如实写进 `00` §0.5.1：以 `roots` 解析相对路径的代码智能类服务器须写一个指向你自己目录的绝对 `cwd`。`05` §5.3.5 引用并删去旧说法；`06` §6.6.1 目录布局、`11` §11.3.3 第 3 条同步；C21、G46 (bk) 补组。
- **R87-D5-01**（次要；“由 120 s 兜底”没有步骤归属，Run 之外没有规则）：唯一定义在 `05` §5.10 “查询的时限与失败”：Supervisor 的每次全局根查询自有 60 s 时限，到时终止该子进程（连同进程组），按出错处理；出错或超时 → 全局根 “未知”，不启动 Host。Run 中：清单计算属于准备第 ③ 步（Host 启动之前，计入 120 s，其间命令同 ③），失败 → `paused(prepare_failed)`；Run 之外（首次运行第 1 步的确认卡片、设置页“重新读取”之后的重新计算）：受影响的包写“无法确定是否已全局安装（全局根查询出错或超过 60 秒）”并附 `[重试]`，不列为“未安装”，其余条目照常确认。取代 ADR-214 的“与 Pi 一样不另设时限，由 120 s 的准备时限兜底”。`05` §5.3.1、`10` §10.3.1 ③、`06` §6.2.4 流水线与 F4b、`03` §3.2.1 `prepare_failed` 入口、`11` §11.8.2、`13` §13.5、`00` §0.5.1、`04` §4.8.11 与 §4.18.1 同步；C40 补一组。
- **R87-D4-01**（次要；`take_over` 新守卫未同步到转移的唯一来源）：守卫保留。`03` §3.2.1 `human` 行补 “`pendingHandBack` 非空时不允许接管（`E_STATE`）”；`nested_repo_live` 的出口列表（`03` §3.2.1 为唯一来源；`06` Sentinels、`10` §10.1.2、`16` §16.1.1 引用）补 “交还时没有选择删除、本原因保留并写下 `pendingHandBack` 之后，`take_over` 不可用，只有 `resume` 附转向与 `abandon`”；交还对话框取消勾选“删除这些条目”时写明这一后果；`04` §4.6.7 补 “我来改”置灰与提示及源状态的例外，§4.8.9 的 `nested_repo_live` 卡片与交还对话框同步；`06` `goal.take_over` 与 `10` §10.8.4 引用 `03`。
- **R87-D6-01 + R86-D6-01**（次要；重建例外列表第三次不完整）：不再列“例外”，`06` §6.2.1（唯一定义）改为两份清单：(1) **由事件重放的表**（清单即全部）`goals`、`goal_deps`、`contracts`、`facts`、`claims`、`decisions`、`comments`、`runs`、`checkpoints`，其中不由事件载荷承载的列按主键从被重建的库逐行沿用，`checkpoints.in_user_repo` 按实际存在的地标 ref 求出；(2) **其余一切表原样沿用**，逐个写明：`meta`（`install_id` 是仓库租约的身份）、`projects`、`project_checkouts`、`project_local_files`、`project_benign_targets`、`bindings`、`sessions`、`needs_you`（所属 Run 已结束而仍可作答的 `question` 条目与 `question_timeout` 的阻塞问题原样保留，取代“由生产者重新判定”与“同一 Run 中最后一条”）、`review_units`、`memory`、`scratch`、`depcache_entries`（从不清空，避免把 `$VS` 中的条目误记为 `verifier_store_tampered`）、`watermarks`、`timers`、`engine_outbox`、`projections`（已过分层保留期的 Goal 的最终快照原样沿用，其余重新生成）；`retention_guard` 为事务内临时表；`events`/`payloads` 是日志本身。新增的表默认属于 (2)。完整性因此由构造保证，不依赖手工列举；评审 §3.1 建议的差集 lint 不再需要。`16` §16.1.13 第 86 轮一行的新说法列把 `projections` 与沿用的运行时表分开写（观察 12）。

**评审结论中的观察（R87 结论部分）**
- 观察 1：`16` `Goal.pendingHandBack` 写明它非空期间其他命令对继续目标的改写（如 `claim_on_behalf`）不改变结果，界面上这类选项置灰并提示；`04` §4.6.7 同步。
- 观察 2：`06` `goal.abandon` 从 `paused(human)` 放弃时另清除 `human_checkout`（目录按 `10` §10.8.4 保留），“只允许这一种写法” 改为 “DDL 的 CHECK 要求离开 `paused` 时这些列为空”。
- 观察 3：`05` §5.3.5 主防线与 `10` §10.1 的 Host ceiling 写作 `<全部 wtRoot>`；`~/.tower/mcp-cwd/` 不在 ceiling 之下、可能向上发现主目录中的仓库，写明它不是 Agent 可写的位置，不加入 ceiling。
- 观察 4：`05` §5.3.5 与 D53 改为 “`command`、`args`、`cwd` 只展开 `~`；`env` 解析 `${NAME}` 与 `!cmd`，不展开 `~`”。
- 观察 5：`05` §5.3.1 的代码片段改为 `createMcpExtension({createTransport: towerMcpTransport})`。
- 观察 6：`05` §5.3.5 的判定改为按 `realpath`、大小写不敏感的卷按卷的规则比较，集合加上任一 `<wtRoot>` 与 `~/.tower/` 之下的一切（`mcp-cwd` 本身除外，含 Scratch 的工作目录与 `_verify`、`_inspect`、`_human`），文字改为 “Tower 的工作区或数据目录之下”。
- 观察 7：`00` §0.5.1 补 `XDG_DATA_HOME`、`pnpm_config_*` 的限定；“MCP 服务器与扩展” 改为 “MCP 服务器与扩展的子进程”。
- 观察 8：`05` §5.3.6 写明重新读取后正在运行的 Host 不重启、继续用旧值，打包模式下并入它的 Goal 同样用旧值，这期间新旧两个值同时在用（接受混用）；`04` §4.15 同步。
- 观察 9：`05` §5.3.5 写明 `pi.registerMcpServer` 注册的服务器规则同样适用，只在运行时显示 `failed` 与文字，不出现在静态清单上；`11` §11.3.4 的相对路径规则同样覆盖它们。
- 观察 10：`04` §4.18.1 第 1 步与 §4.15 各补一处 Node 提示的引用。
- 观察 11：`11` §11.3.4 在 “以 `roots` 为根” 的建议处写明服务器按 `roots` 在卫星中运行程序仍属 T16 的残余。
- 观察 12：`10` §10.7.1 三个验证类 landmark 统一为 “由 Projector 追加”；`16` §16.1.13 第 86 轮一行分开写 `projections`。
- 观察 13：`05` §5.10 写明查询失败同样阻断不加载扩展的 Run，是有意的取舍（Host 中的 Pi 仍以同一命令运行这一查询，清单只有一份）；`00` §0.5.1 同步。
- 观察 14：`06` §6.3 “载荷中的路径集合” 纳入 `resolvePinHits`（`{path, action}` 数组），适用的事件补 `human.decision`（只有 `hand_back` 的这一个字段）；`16` §16.1.14 `human.decision` 行写明 16 KB 与 `06` §6.3，lint (i′) 照常比对。
- 观察 15：`09` §9.12.4 “清除之后仍可能存在的副本” 补一条：从清除之前的数据库备份恢复后，重建会因缺少路径集合文件而停止并列出它们；对这些 Goal 重新执行清除后再重建。

**删除 / 推迟**
- 删除：`~/.tower/mcp-cwd/` 的 “Tower 之后从不写入、不清空”；全局根查询的 “与 Pi 一样不另设时限，由 120 s 的准备时限兜底”；门禁对相对路径 “无法确定基准” 的一律 ask（对已知工作目录的 stdio 服务器）；重建的 “例外只有以下四处”、`needs_you` 由生产者重新判定、`question_timeout` 问题按 “同一 Run 中最后一条” 重建。
- 没有推迟到 M2 的条目。取代内置 MCP 的扩展在 M1 中不可用（启用期间不开 Run），是更严的一侧。
- `16` §16.1.13 补登第 87 轮被取代的说法 1 行，由 (D) 检查；lint (d) 新增一项。

- **lint**：全部检查 `--checks rstuvwxyzckdnSeRqpoPiDgKYATFMBOJCH`，exit 0；见 `reviews/round-87-lint.md`。
- **排期**：+0.07 人周，没有系统线与安全线增量。
  - W6 +0.03（Agent，W10 与 W4 的落点按 ADR-136 改派）、W12 +0.01（设计，属 W12a）、W16 +0.03（设计，W10 与 W3 的落点按 ADR-136 改派）；其余条目与各条观察按 WBS 行逐项不足 0.01，计 0。
  - `14` §14.3.4 与 ADR-133 第 87 轮补记一致：WBS 123.33，余量 系统 0.12、Agent 0.17、桌面 0.36、设计 0.51、安全 0.12，依赖链 19.91，增 1 人 129.28 / T 23.87 / 33 周（新人约 2.50 人周），**M1 维持 38 周**。系统线与安全线仍在约 0.12 的改派阈值上，下一次落在这两条线上的增量须先按 ADR-136 改派。

## 第 88 轮对抗评审（全范围）后的跨文档决策（ADR-216）

## ADR-216 stdio MCP 空工作目录按 Host 进程分开、相对路径不以空目录为基准、交还等待期间置灰的选项与 `reverify` 下的附转向、重建以字段为粒度与墓碑行沿用各定一处 — Accepted（R88 全部条目与评审结论中的观察；Amends ADR-215、ADR-214、ADR-134；Amended by ADR-217、ADR-218）

选择原则（收敛规则，同 ADR-186–215）：只用三种办法关闭条目——(1) 把说法改弱但为真；(2) 删除或推迟不属于 M1 主循环的机制；(3) 在已有的唯一定义处加至多一条守卫、一行或一个字段。复用已有的模式：Supervisor 管理的按进程目录（`run/<deliveryId>/` 的“消费进程结束即删、启动时清理”）、门禁“至少 ask”的不透明参数、`E_STATE` 与置灰、事件墓碑（`02` §2.13）。不新增状态、事件类型、表、列、命令、决定种类、Needs-You kind、子类型或 landmark。安全不变式全部保留，有取舍时都取更严格的一侧；安全问题只写到设计层面。

**Pi v1.2.0 核实**（`packages/coding-agent/src/`；`git show v1.2.0:<path>`）
- `InlineExtension.replaceable`：“The factory still runs, so it should only register tools, commands, flags, and event handlers”（`core/extensions/types.ts:2058-2065`）——Pi 只建议、不强制；取代者（非 `replaceable` 的用户扩展）的工厂在资源加载中运行（`core/resource-loader.ts:727-743` 一带的加载路径），早于 Host 的来源自检。
- MCP 连接只对 HTTP 服务器重试（`extensions/mcp/runtime.ts:343`，第 89 轮更正，原写 `:342`：`"url" in this.entry.config ? CONNECT_RETRY_DELAYS_MS : []`），首次连接失败的 stdio 服务器的工具从未注册（第 89 轮更正：以参数指明服务器的资源工具仍会经 `getClient()` 重新打开，`runtime.ts:237-243`、`:278-300`，ADR-217〔第 90 轮更正：这只对连接成功过、之后断开的服务器成立；资源工具只到达 `hasResources` 为真的服务器（`extensions/mcp/index.ts:466-471`），该标志在连接成功后才设置（`runtime.ts:391`），所以首次连接失败的服务器不会被资源工具重新打开，ADR-218〕）——R88-D11-01 中共享目录被删除与重建的后果的依据。
- 其余引文沿用 ADR-215，评审已逐条核对为原文。

**条目（R88 追问清单）**
- **R88-D11-01**（次要；全机一个 `~/.tower/mcp-cwd/`，任一 Host 启动时删除并重建，并发 Host 之间共用并互相删除）：取评审的第一种做法。唯一定义仍在 `11` §11.3.4 “stdio MCP 服务器的空工作目录与相对路径” (a)：**每个 Host 进程一个空目录** `~/.tower/mcp-cwd/<hostId>/`，Supervisor 在 `host.spawn` 时、Host 进程启动之前建为空目录（已存在时先删除，不跟随符号链接）并把路径交给该 Host；该 Host 进程退出（含崩溃）后删除，Supervisor 启动恢复时删除不属于存活 Host 的残留。它从不在 Host 之间共享，也从不在其他 Host 启动时被删除或重建，所以别的 Goal 开 Run 不影响本 Host 中正在运行的服务器，删除与重建之间的启动失败窗口随之消失。各 Host 的这一目录都在第 3 条硬底线（写）之内，三种沙箱都拒绝读写。界限改写为“只影响同一 Host 进程中之后启动的服务器（交接与恢复时的新会话；打包模式下含同一 Host 的其他 Goal），不越过该 Host 进程的生命周期”。`05` §5.3.5 `towerMcpTransport` 以本 Host 的空目录为基准；`06` §6.6.1 目录布局与 §6.6.4 清理表、`11` §11.3.3 第 3 条、§11.3.4 路径检查 (1)、§11.8.2、T4、T16，`00` §0.5.1、README 同步；C21 与 G46 (bk) 补并发的一组，只写期望。lint (d) 新增一项。
- **R88-D11-02**（次要；未写 `cwd` 的服务器，任何含 `/` 的字符串参数都解析进空目录而硬 forbid）：取“缩小规则”。`11` §11.3.4 (b)：相对路径以 `roots`（卫星）为基准解析，`mcp.json` 为该服务器写了绝对 `cwd` 时再以该目录为基准；**Tower 的空目录不作基准**，所以 `owner/repo`、分支名、MIME 类型这类参数不会因此被拒绝，与其他相对路径一样至少 ask（ADR-215 之前的行为）。任一结果落在硬底线仍 forbid、不可授权覆盖，绝对路径照旧检查。残余如实写明：一次经人批准的相对路径调用可以写进本 Host 的空目录，按 (a) 只影响同一 Host 进程中之后启动的服务器，Host 退出时删除，从不跨 Host。`00` §0.5.1 的代价改写：不再要求代码智能类服务器写绝对 `cwd`；写明相对路径按项目根（与你写的绝对 `cwd`）解析、受保护位置被拒绝、其余需要批准。G46 (bk) 的 ADR-215 一组改为 `sub/x` 与 `owner/repo` 出现审批卡、主检出中的 `src/a.ts` 仍被 forbid。
- **R88-D4-01**（次要；`pendingHandBack` 期间“会改写去向的选项置灰”没有列出范围，`reverify` 模式下附转向的 `resume` 不让 Agent 运行）：唯一定义移到转移规则的唯一来源 `03` §3.2.1 新增一条“`pendingHandBack` 等待期间的选项”，`16` `Goal.pendingHandBack`、`06` §6.4.3、`04` §4.6.7 与 §4.8.9 引用。置灰并返回 `E_STATE` 的**只有两个**：`我来改`（`goal.take_over`，ADR-214/215）与预算硬上限卡片的 `按当前状态送去验证`（`goal.claim_on_behalf`，本轮补守卫）——两者都另选去向（`claim_on_behalf` 还会不提高预算就解除硬上限）。解除保留原因的命令一律可用：`resume`（含 `nested_repo_live` 的附转向）、`override_sentinel`（被保留的 `input_mutated_after_gate`）、`keep`/`revert`、`rebuild_satellite`，它们对继续目标的改写照常写入、不改变结果。`nested_repo_live` 在 `pendingHandBack.mode = reverify` 时：附转向解除它的 `resume` 在同一事务把 `mode` 置为 `continue_agent`（人的新选择取代交还时的选择；转向照常进入 `pendingOpenings`，ADR-140；不涉及 `verify_new` 的 `returnTo`，ADR-143 不受影响），原因全部解除时开 Run 交给 Agent，不再先以必然停在 `sentinel_high` 的树验证。取代 ADR-215 观察 1 的“这类选项置灰”与 `16` 的“照常写入、但不改变结果”对 `claim_on_behalf` 的适用。`06` `goal.resume`（显式改写一句）与 `goal.claim_on_behalf`（守卫）、`03` `budget_hard_cap` 行与 `sentinel_high` 行、`04` §4.6.7 与 §4.8.9、`07` §7.4.3 `nested_repo_live` 行（改为引用 `03`）、G26c (b) 与 G32 同步。
- **R88-D6-01**（次要；重建正清单中墓碑行无法重放、部分由事件承载的 JSON 列没有字段级规则）：`06` §6.2.1（唯一定义）补两句。(a) **墓碑行**：载荷已墓碑化、无法重放的行——隐私清除留下的 Goal 墓碑行与决定墓碑行（含“彻底忘记”墓碑化的决定，`09` §9.12.4）——从被重建的库原样沿用、不重放，其他行对它们的外键因此成立；投影版本迁移同样沿用，迁移改动这两张表的列时只经迁移对旧行所做的同一列变换。(b) **字段粒度**：清单 (1) 的表按事件重放并以字段为粒度与被重建的库合并——重放只写 Projector 由事件载荷求出的字段（含由事件置空的），其余字段（不由事件载荷承载的列，以及 JSON 列中不由事件载荷承载的键，如 `human_checkout` 的 `syncState`/`written`/`targetTree`/`rebuiltTree`/`params` 与 `counters`）按主键取被重建的库中的值。取代“清空后按事件重放”“按主键逐行沿用”以列为粒度的写法。G35e 补 (o)(p) 两组，只写期望。

**评审结论中的观察（R88 结论部分）**
- 观察 1：`06` F4b 补 “Host 启动自检发现 Tower 工具被同名扩展工具遮蔽（ADR-187）”。
- 观察 2：`05` §5.3.5 骨架注释改为 “在内置 MCP 管理的任何服务器启动之前判定”，“内置 MCP 的来源自检”末句写明取代者的工厂在自检之前已运行、属同一残余；C21 写明夹具取代者的工厂只注册命令、到 `session_start` 才连接。
- 观察 3：C21 补一组：上下文交接时运行时重建、自检再跑，取代者在这次加载中出现时新会话不创建，进入 `paused(prepare_failed)`。
- 观察 4：`05` §5.3.5 写明“本 Host 的空目录本身除外，其子目录不除外”，所以相对的 `config.cwd` 实际只有 `.` 可用，其余按同一句文字不启动、请写绝对路径；C21 改为 `sub` 不启动。
- 观察 5：README 与 `00` §0.5.1 补 `roots` 一侧；`00` 与 `05` 的 “指向 Tower 工作区的不启动” 改为 “工作区或数据目录之下”。
- 观察 6：`00` §0.5.1 写明单个文件名不当作路径、经批准即可写进服务器的工作目录，“不要把 `cwd` 指向你的仓库检出”；“一律被拒绝” 删去。
- 观察 7：`11` §11.3.4 (b) 写明解析结果命中 §11.3.1 密钥路径表的按 (2) 归 `secrets.access`；资源工具以参数指明的服务器取工作目录。
- 观察 8：`05` §5.10 “查询的时限与失败”补：准备被中止时同样终止正在运行的查询的进程组。
- 观察 9：同处补：一次清单计算中有一次查询出错或超时之后，其余查询不再运行、依赖全局根的包一律记为“未知”，最多有一次查询等满 60 s。
- 观察 10：`06` `goal.abandon` 补：从 `running` 放弃时同一事务清除 `draining_for` 与只由其 `reasons` 引起的 `external_change`。
- 观察 11：`06` §6.2.1 补“做法”：写入一份新库、按外键顺序插入、完成后才替换旧库（中途失败时旧库不变）；清单 (1) 中某行由事件产生而旧库中没有该行时，没有来源的非空非事件列无从取值，重建中止并提示从 `db-backups/` 恢复。
- 观察 12：`08` `RoutingRuntime` 改为“存于 `needs_you.routing`，重建时随 `needs_you` 沿用”。
- 观察 13：`16` §16.1.14 `checkpoint.created` 行改为“见 `06` §6.2.1 的两份清单”。
- 观察 14：`04` §4.15 补：重新读取之后清单在设置页重新计算，以 §4.18.1 第 1 步的同一张确认卡片显示，含“无法确定”与 `[重试]`。

**删除 / 推迟**
- 删除：全机一个、每次任一 Host 启动时删除并重建的 `~/.tower/mcp-cwd/`；门禁以空目录为基准解析相对路径（及由此对未写 `cwd` 的服务器一律 forbid）；`00` §0.5.1 “代码智能类服务器须写绝对 `cwd`”的代价；“这类选项置灰”的未列举写法；重建“清空后按事件重放”的列粒度写法。
- 没有推迟到 M2 的条目。
- `16` §16.1.13 补登第 88 轮被取代的说法 1 行，由 (D) 检查；lint (d) 新增一项（全机目录的写法）。

- **lint**：全部检查 `--checks rstuvwxyzckdnSeRqpoPiDgKYATFMBOJCH`，exit 0；见 `reviews/round-88-lint.md`。
- **排期**：+0.05 人周，没有系统线与安全线增量。
  - W6 +0.02（Agent，W4 与 W10 的落点按 ADR-136 改派）、W12 +0.01（设计，属 W12a）、W16 +0.02（设计，W3 与 W10 的落点按 ADR-136 改派）；十四条观察按 WBS 行逐项不足 0.01，计 0。
  - `14` §14.3.4 与 ADR-133 第 88 轮补记一致：WBS 123.38，余量 系统 0.12、Agent 0.15、桌面 0.36、设计 0.48、安全 0.12，依赖链 19.91，增 1 人 129.33 / T 23.88 / 33 周（新人约 2.50 人周），**M1 维持 38 周**。系统线与安全线仍在约 0.12 的改派阈值上，下一次落在这两条线上的增量须先按 ADR-136 改派。

## 第 89 轮对抗评审（全范围）后的跨文档决策（ADR-217）

## ADR-217 门禁以 stdio MCP 服务器实际的工作目录为基准并只检查越出空目录的结果、路径扫描认 `file:` URI、置换交还选择的 `resume` 移动归因窗口的起点各定一处 — Accepted（R89 全部条目与评审结论中的观察；Amends ADR-216、ADR-186、ADR-145；Amended by ADR-218、ADR-219）

选择原则（收敛规则，同 ADR-186–216）：只用三种办法关闭条目——(1) 把说法改弱但为真；(2) 删除或推迟不属于 M1 主循环的机制；(3) 在已有的唯一定义处加至多一条守卫、一行或一个字段。复用已有的模式：门禁对相对路径“以已知基准解析、落在硬底线即 forbid、其余至少 ask”（ADR-215/216）、绝对路径的硬底线与密钥路径检查（§11.3.4 (1)(2)）、归因窗口起点的封闭列表（ADR-140/144/145）、`E_BUSY`（ADR-145/146）、运行中途停止的 `prepare_failed`（ADR-188/190）。不新增状态、事件类型、表、列、命令、决定种类、Needs-You kind、子类型或 landmark。安全不变式全部保留，有取舍时都取更严格的一侧；安全问题只写到设计层面。

**Pi v1.2.0 核实**（`packages/coding-agent/src/`；`git show v1.2.0:<path>`）
- 默认工厂以 `cwd: resolve(cwd, expandHome(config.cwd ?? "."))` 启动 stdio 服务器（`extensions/mcp/runtime.ts:118`），`roots` 另由会话工作目录以 `pathToFileURL(this.cwd).href` 声明（`:364`）——服务器按自己的工作目录解析相对参数，这是 R89-D11-01 的依据；`roots` 本身就是 `file:` URI。
- 资源工具 `read_mcp_resource` 的参数 `uri`（“Resource URI to read”，`extensions/mcp/resources.ts:72`）原样交给服务器的 `readResource`（`:311-315`）——R89-D11-02 的依据。
- MCP 连接只对 HTTP 服务器重试在 `runtime.ts:343`（ADR-216 误写 `:342`，已在 ADR-216 中更正）；`getClient()`（`:237-243`）在客户端未连接时重新打开，`withClient()`（`:278-300`）每次请求都先经它，所以“在该会话中保持 `failed`”只对首次连接失败、工具从未注册的服务器成立。
- stdio 服务器各在自己的进程组（`packages/mcp/src/transports/stdio.ts:100-101`，`detached`），Pi 只在进程的 `exit` 钩子中终止它们（`:43-52`）〔第 90 轮更正：Pi 另在关闭连接时经传输的 `close()` 按进程组终止（`:152-179`）；两者在 Host 非正常退出时都不运行，ADR-218〕——观察 11 的依据。

**条目（R89 追问清单）**
- **R89-D11-01**（次要；ADR-216 把空目录移出解析基准后，以 `..` 越出空目录的相对路径与含 `..` 的相对 `config.cwd` 使硬底线中的位置只 ask，写明的残余不成立）：取评审的第一支。唯一定义 `11` §11.3.4 “stdio MCP 服务器的空工作目录与相对路径” (b)：相对路径以两个基准各解析一次——`roots`（卫星），以及该服务器**实际的工作目录**（`05` §5.3.5 求出的 spawn `cwd`：绝对 `cwd` 照用；相对 `cwd`（含 `..`）以本 Host 的空目录为基准求出；未写时就是本 Host 的空目录）。任一结果落在第 3 条硬底线即 forbid、不可授权覆盖，命中密钥路径表的归 `secrets.access`，其余至少 ask。**唯一的例外**：工作目录是本 Host 的空目录时（未写 `cwd` 或写 `.`），以它为基准求出、仍在该目录之内的结果不因该目录在第 3 条中而 forbid——保留 ADR-216 的取舍，`owner/repo`、分支名仍只 ask；以 `..` 越出它的结果照常判定，落在影子目录、安装器私有目录、其他 Host 的空目录或主检出的 forbid。残余因此成立：经批准的调用只能写进本 Host 的空目录，其他 Host 的空目录都在硬底线之内，从不跨 Host。`05` §5.3.5：相对的 `config.cwd`（含 `..`）一律以本 Host 的空目录为基准求出，求出的目录除原有集合（Agent 可写位置、任一 `<wtRoot>`、`~/.tower/` 之下，本 Host 的空目录本身除外）之外还不得落在第 3 条硬底线之内，否则不启动；其余照常启动，与写成绝对路径的同一目录相同、门禁以它为基准。取代 ADR-216 观察 4 的“相对的 `config.cwd` 实际只有 `.` 可用”与 R88-D11-02 的“Tower 的空目录不作基准”。`11` §11.3.3 第 3 条、`00` §0.5.1、README 同步；C21 补含 `..` 的相对 `cwd` 三组，G46 (bk) 补 `..` 越出空目录的一组，只写期望。
- **R89-D11-02**（次要；路径扫描不认 `file:` URI）：唯一定义 `11` §11.3.4 “沙箱外工具的路径检查” (1)：`file:` URI 按 RFC 8089 取路径部分（`file:///p`、`file://localhost/p`、`file:/p`），解码百分号转义后视为绝对路径，照 (1) 的硬底线与 (2) 的密钥路径表检查；主机部分是其他名字的不是本地路径，视为不透明参数、至少 ask；其他 scheme 的 URI 照旧不视为路径（(3) 的排除只对它们成立）。C21 补一组（资源工具以 `file:` URI 读取密钥文件出现 `secrets.access` 的审批卡、只有“仅这一次”；指向主检出的被 forbid，即使已授予“本 Goal 内同类”）。
- **R89-D4-01**（次要；`reverify` → `continue_agent` 的置换不移动归因窗口的起点）：取“列入”。唯一规则 `03` §3.2.1 “验证失败是否自动返工”：人明确把工作交给 Agent 的决定是封闭列表，补第四项“把 `pendingHandBack.mode` 由 `reverify` 置换为 `continue_agent` 的 `resume`”，以该 `human.decision{resume}` 事件为起点，交还的 `human_edit` 检查点因此不在窗口内——与交还时直接选“交给 Agent 继续”相同，`03` 的“人的新选择取代交还时的选择”与 `04` §4.6.7 的卡片文字因此成立。`16` §16.1.1 与 `07` §7.10.3 不再复述列表，改为引用 `03`；`06` §6.4.3 的逐字引文同步。G26c (b) 的 `reverify` 一组补失败一支：按 Agent 路径自动返工，不进入 `human_change_verify_failed`。

**评审结论中的观察（R89 结论部分）**
- 观察 1：`11` §11.3.4 (a) 写明：路径随 `host.spawn` 的启动参数交给 Host；启动恢复的残留清理在 main 交回存活 Host 的端口之后；`hostId` 跨进程复用，同一 `hostId` 的下一个 Host 进程只在上一个进程确认退出、其目录已删除之后才 spawn，所以退出清理从不删除后继进程的目录（取“先后规则”，不改目录名）。
- 观察 2：`03` §3.2.1 `prepare_failed` 行的 `running` 入口与 `06` F4b 补“上下文交接时运行时重建、Host 的来源自检不通过”；`05` §5.3.5 “内置 MCP 的来源自检”末句写明这时新会话不创建、按运行中途停止进入 `paused(prepare_failed)`；`04` §4.8.11 卡片写 `◆ 运行已停止：…`、`重试` 写“开新的运行”；C21 交接一组补卡片的期望。
- 观察 3：`04` §4.6.7 的 `继续` 按钮改名规则注明 `nested_repo_live` 附说明的 `继续` 例外。
- 观察 4：`04` §4.18.3 硬上限一行与 `12` §12.6.5 `budget_hard_cap` 一行注明 `claim_on_behalf` 在交还后仍暂停期间置灰；`04` §4.6.7 的置灰提示另写 `先扩展预算，再继续`。
- 观察 5：G32 不再检验 `claim_on_behalf`（它在 `sentinel_high` 中本来就不可用）；G33 补“交还后尝试 `claim_on_behalf` → `E_STATE`、置灰并提示先扩展预算”。
- 观察 6：`02` §2.7 `HumanDecision.handBack` 补 `mode?: "continue_agent" | "reverify"`（取自 `Goal.humanCheckout.params`，只在 `take_external` 时省略）。
- 观察 7：`06` §6.2.1 补：被清除 Goal 名下其他表的行已随清除删除、事件载荷已墓碑化，重放跳过这些事件、不重新产生这些行，也不因“由事件产生而旧库中没有该行”中止；迁移改动清单 (1) 中其他行的非事件列时，其值同样来自旧行经同一列变换。
- 观察 8：`06` §6.2.1 补：最后一次写入不是事件的字段同样取被重建的库中的值，例如 §6.1.6 检出丢失时清除 `human_checkout` 不写事件，被重建的库中为 NULL 时取 NULL。
- 观察 9：`06` §6.4.3 `inspect.bring_back` 补：写回进行中，该 Goal 上其他会改写状态或 `human_checkout` 的命令返回 `E_BUSY`。
- 观察 10：ADR-216 的 `runtime.ts:342` 更正为 `:343`，“在该会话中保持 `failed`”限定为首次连接失败的服务器（见上方 Pi 核实）。
- 观察 11：`11` §11.3.4 (a) 登记残余：Host 被强杀（含超出内存上限）时，各在自己进程组中的 stdio 服务器可能比 Host 活得久；stdin 随 Host 关闭、不再收到请求，多数随即退出，其工作目录照常删除，仍在运行的属 §11.8.2 “用户确认的那段代码的行为”。
- 观察 12：`11` §11.6.2、T16、T29 中 Host 一侧的 `GIT_CEILING_DIRECTORIES=<wtRoot>` 改为 `<全部 wtRoot>`（Agent 环境一侧仍为本卫星的 `<wtRoot>`）。

**删除 / 推迟**
- 删除：“Tower 的空目录不作基准”；“相对的 `config.cwd` 实际只有 `.` 可用”；`16` 与 `07` 对归因窗口起点列表的复述；G32 中区分不出守卫的 `claim_on_behalf` 期望。
- 没有推迟到 M2 的条目。
- `16` §16.1.13 补登第 89 轮被取代的说法 1 行，第 88 轮一行的新说法列改为当前说法，由 (D) 检查。

- **lint**：全部检查 `--checks rstuvwxyzckdnSeRqpoPiDgKYATFMBOJCH`，exit 0；见 `reviews/round-89-lint.md`。
- **排期**：+0.03 人周，没有系统线与安全线增量。
  - W6 +0.01（Agent，W4 与 W10 的落点按 ADR-136 改派）、W16 +0.02（设计，W3、W9 与 W10 的落点按 ADR-136 改派）；十二条观察按 WBS 行逐项不足 0.01，计 0。
  - `14` §14.3.4 与 ADR-133 第 89 轮补记一致：WBS 123.41，余量 系统 0.12、Agent 0.14、桌面 0.36、设计 0.45、安全 0.12，依赖链 19.91，增 1 人 129.37 / T 23.89 / 33 周（新人约 2.49 人周），**M1 维持 38 周**。系统线与安全线仍在约 0.12 的改派阈值上，下一次落在这两条线上的增量须先按 ADR-136 改派。

## 第 90 轮对抗评审（全范围）后的跨文档决策（ADR-218）

## ADR-218 本 Host 空目录与回退位置下本 Goal 卫星中的结果不按 `~/.tower/**` 归密钥、以 `~` 开头的值两种解释各查一次、交还与带回共用写回进行中的 `E_BUSY` 各定一处 — Accepted（R90 全部条目与评审结论中的观察；Amends ADR-217、ADR-216、ADR-214、ADR-186、ADR-179；Amended by ADR-219、ADR-224）

选择原则（收敛规则，同 ADR-186–217）：只用三种办法关闭条目——(1) 把说法改弱但为真；(2) 删除或推迟不属于 M1 主循环的机制；(3) 在已有的唯一定义处加至多一条守卫、一行或一个字段。复用已有的模式：门禁对路径“按服务器可能采用的每个基准各查一次、取更严格者”（ADR-217）、密钥路径表（§11.3.1，ADR-179）、回退位置的逐路径例外（ADR-197/198）、`E_BUSY`（ADR-145/146/217）、`HumanDecision.handBack.mode`（ADR-217）。不新增状态、事件类型、表、列、命令、决定种类、Needs-You kind、子类型或 landmark。安全不变式全部保留：硬底线、其他 Goal 的卫星、密钥路径表的其他条目都不变，有取舍时取更严格的一侧；安全问题只写到设计层面。

**Pi v1.2.0 核实**（`packages/coding-agent/src/`；`git show v1.2.0:<path>`）
- `expandHome`（`extensions/mcp/runtime.ts:89-96`）只展开恰为 `~` 与以 `~/` 开头的值（Windows 另有 `~\`）——R90-D11-02 中 `~` 路径的定义依据；D53 补引。
- `connectFailed` 在 `runtime.ts:409-418`（`return new Error(…)` 在 L417）；`05` §5.3.5 与 D53 原写 `:409-416`，已改；ADR-214 中的同一引文加注更正。
- 资源工具只到达 `connection.hasResources` 为真的服务器（`extensions/mcp/index.ts:466-471`），该标志只在连接成功后设置（`runtime.ts:391`）。ADR-216 第 89 轮更正中“资源工具仍会经 `getClient()` 重新打开”只对连接成功过、之后断开的服务器成立，已在 ADR-216 中加注。
- `StdioTransport.close()`（`packages/mcp/src/transports/stdio.ts:152-179`）在关闭连接时按进程组终止服务器；`exit` 钩子（`:43-52`）只在进程正常退出时运行。ADR-217 的“Pi 只在进程正常退出的 `exit` 钩子中终止”漏了前者，已在 ADR-217 中加注；`11` §11.3.4 (a) 改写。
- MCP 工具名经规范化、冲突时加哈希后缀（`extensions/mcp/tools.ts:78-92`）——观察 11 的依据。

**条目（R90 追问清单）**
- **R90-D11-01**（次要；本 Host 空目录与回退位置下本 Goal 卫星中的结果按密钥路径表的 `~/.tower/**` 归 `secrets.access`）：取“例外一并免除”。唯一定义 `11` §11.3.4 “沙箱外工具的路径检查” (2)：密钥路径表的 `~/.tower/**` 一项在路径检查中不含两处由 Tower 拥有、不存放密钥的位置——本 Host 的空目录（每个 Host 进程新建），以及 `<wtRoot>` 回退时本 Goal 的卫星工作区（只对本 Goal 的调用，与默认位置下相同）；表中其他条目（如其中未被 git 跟踪的 `.env`）与第 3 条硬底线照常适用。(b) 的唯一例外随之写明“也不按 `~/.tower/**` 归 `secrets.access`”，`owner/repo`、`sub/x` 是 `tool.external` 的审批卡。§11.3.1 密钥路径表的该项与 `10` §10.4.3（“例外只在三处定义”）引用 (2)；`00` §0.5.1 补“也不当作读取密钥”；G46 (bk) 写明卡片类别，并补回退位置一组。
- **R90-D11-02**（次要；以 `~` 开头的值只按主目录解释，`~` 路径未定义）：唯一定义 `11` §11.3.4 路径检查 (1)(3)：`~` 路径按 shell 的规则展开（恰为 `~` 或以 `~/` 开头的为你的主目录，与 Pi 的 `expandHome` 相同；`~user/…` 为该用户的主目录；无法展开的不作 `~` 路径）；(3) 的相对路径不再排除以 `~` 开头的值——同一个值既按 (1) 展开、又按字面的相对路径以 (b) 的基准各查一次，两种解释的结果都判定、取更严格者，字面一侧使 certainty 为 `opaque`、至少 ask，所以按工具名的 Goal 级授权不再把它降为 `notify`。`00` §0.5.1 同步；G46 (bk) 补一组（按字面解释落在另一个 Host 空目录中的值即使已授权也 forbid，`~/notes.txt` 出现审批卡）。
- **R90-D6-01**（次要；带回写回期间的 `E_BUSY` 与 `goal.abandon` 的“任何非终态可放弃”并存，交还写回没有守卫）：唯一定义 `06` §6.4.3 `inspect.bring_back` 行的“写回进行中”：`human_checkout.syncState='syncing'` 期间，不论交还还是带回，该 Goal 上会改写状态或 `human_checkout` 的命令（含 `goal.abandon`、再次 `goal.hand_back` 或 `inspect.bring_back`、`goal.discard_human_edits`）返回 `E_BUSY`，界面显示“稍后重试”；这一判定先于各命令自己的前置条件（所以这期间 `inspect.bring_back` 返回 `E_BUSY` 而不是 `E_STATE`）；崩溃后由 §6.1.6 续写完成，不需要人的命令解除。`goal.hand_back`、`goal.discard_human_edits`、`goal.abandon` 三行与 `16` §16.1.12 `ProtoError.code` 引用它，后者的“`abandon` 始终允许”限定为准备阶段。G31 补一组。

**评审结论中的观察（R90 结论部分）**
- 观察 1：`04` §4.8.12 与 `10` §10.3.1 的三项复述改为引用 `03` §3.2.1 的封闭列表（`04` 保留面向人的例子，含“交还后仍暂停”期间附说明的 `继续`）；`16` §16.1.13 登记旧写法，由 (D) 检出。
- 观察 2：置换交还选择的 `resume` 在本条 `human.decision{resume}` 上记 `handBack:{mode:"continue_agent"}`（`06` §6.4.3 `goal.resume`；`02` §2.7 注释同步），窗口起点与重建据此识别，不回溯状态。复用已有字段，不新增字段。
- 观察 3：`06` §6.4.3 `goal.hand_back` 产出列与 `16` §16.1.5 `HumanDecision` 的形状副本补 `mode`。
- 观察 4：`03` `running` 行、`02` §2.4、`08` §8.6.5 `prepare_failed` 定义与 §8.13.2 诊断锚点、`16` `PauseReason` 与 `stalled` 子类型、`12` §12.6.5 补“上下文交接时 Host 的来源自检不通过”；`08`、`16` 的子类型一行另补 Host 启动自检（ADR-187/215）。
- 观察 5：`11` §11.3.4 (1)：`file:` 的 scheme 与 `localhost` 不区分大小写；带查询或片段的，去掉与保留各取一次路径、各查一次；`file:` 之后不以 `/` 开头的视为不透明参数。
- 观察 6：`11` §11.3.4 (b)：相对路径按词法规范化与按操作系统的方式（先解析符号链接、再处理其后的 `..`）各求一次，两个结果都判定。
- 观察 7：`05` §5.3.5 不启动的文字改为“请改写为指向你自己目录的绝对路径，不要指向你的仓库检出”；`00` §0.5.1 写明 `owner/repo` 不被拒绝只在默认工作目录下成立；`11` §11.3.4 (b) 末句点名绝对 `cwd` 在主检出时是该限制最直接的情形。
- 观察 8：`05` §5.3.5 相对 `cwd` 与 `11` §11.3.4 (b) 的例外按求出的目录判定，不按写法（`.`、`./`、`x/..` 都求出空目录本身）；C21 同步。
- 观察 9：`11` §11.3.4 (a)：目录删除失败时不 spawn，按 Host 握手失败处理（`06` F4b）；启动恢复以 main 交回的存活 Host 判定；缓存了旧目录绝对路径的残留服务器写入后继进程同名目录的情形登记为 §11.8.2 的残余。
- 观察 10：见上方 Pi 核实；`11` §11.3.4 (a) 的残余条件改为“Host 非正常退出（被信号终止、超出内存上限、致命错误）”。`round-89-response.md`、`round-89-lint.md` 是历史记录，未改。
- 观察 11：`11` §11.3.4 (b)：MCP 工具属于哪个服务器取自 Tower 的工厂为该连接记下的条目，不由工具名反推。
- 观察 12：`06` §6.2.1：首句注明非事件写入者的例外；“最后一次写入不是事件的字段”改为“有非事件写入者的字段一律取被重建的库中的值”，列出已知的唯一写入者（§6.1.6）；`goals` 的重放来源改为“例如”。
- 观察 13：`04` §4.6.7 的置灰提示只在额度仍不高于已花费时另写 `先扩展预算`（与 §4.18.3 `继续` 的置灰条件相同），`04` §4.18.3、`12` §12.6.5、G33 同步；`04` §4.8.11 点名 Tower 工具被遮蔽、内置 MCP 被取代两条。
- 观察 14：`00` §0.5.1 的“打包模式下”一句补“SP2 不达标时打包模式是 M1 的默认”。
- 观察 15：排期的舍入口径不变（安全线余量按已舍入的 14.44 计，新人份额 2.49），在 ADR-133 第 90 轮补记中写明未舍入值。

**删除 / 推迟**
- 删除：`04`、`10` 对归因窗口起点的三项复述；密钥路径表 `~/.tower/**` 对本 Host 空目录与回退位置下本 Goal 卫星的适用；(3) 对以 `~` 开头的值的排除；`goal.abandon` 的无例外写法与 `16` 中无限定的“`abandon` 始终允许”；不启动文字中的“请写绝对路径”。
- 没有推迟到 M2 的条目。
- `16` §16.1.13 补登第 90 轮被取代的说法 1 行，由 (D) 检查。

- **lint**：全部检查 `--checks rstuvwxyzckdnSeRqpoPiDgKYATFMBOJCH`，exit 0；见 `reviews/round-90-lint.md`。
- **排期**：+0.03 人周，没有系统线与安全线增量。
  - W16 +0.03（设计，W3 与 W10 的落点按 ADR-136 改派）；十五条观察按 WBS 行逐项不足 0.01，计 0。
  - `14` §14.3.4 与 ADR-133 第 90 轮补记一致：WBS 123.44，余量 系统 0.12、Agent 0.14、桌面 0.36、设计 0.42、安全 0.12，依赖链 19.91，增 1 人 129.40 / T 23.89 / 33 周（新人约 2.49 人周），**M1 维持 38 周**。系统线与安全线仍在约 0.12 的改派阈值上，下一次落在这两条线上的增量须先按 ADR-136 改派。

## 第 91 轮对抗评审（全范围）后的跨文档决策（ADR-219）

## ADR-219 文件工具按 Pi 内置文件工具的同一求法求路径、路径检查的每种形式都按两种方式求值、写回进行中限定为本进程中执行并给出失败出口各定一处 — Accepted（R91 全部条目与评审结论中的观察；Amends ADR-218、ADR-217、ADR-183；Amended by ADR-220）

选择原则（收敛规则，同 ADR-186–218）：只用三种办法关闭条目——(1) 把说法改弱但为真；(2) 删除或推迟不属于 M1 主循环的机制；(3) 在已有的唯一定义处加至多一条守卫、一行或一个字段。复用已有的模式：Pi 依赖以 `05` §5.11.1 的一行登记、以契约测试锁定（D 类与 C 类）；门禁对路径“按每种可能的解释各查一次、取更严格者”（ADR-217/218）；`E_INTERNAL` 带 `detail` 而不记决定、状态不变（ADR-189 的 `goal.accept`）；§6.1.6 的启动续写。不新增状态、事件类型、表、列、命令、决定种类、Needs-You kind、子类型或 landmark；新增的只有依赖清单一行（D60）、一项契约测试（C41）与实况行表一行。安全不变式全部保留：第 3 条硬底线、`edit.outside_worktree` 在各预设 forbid、密钥路径表都不变，有取舍时取更严格的一侧（不能确定地求出的路径为 `opaque`、至少 ask；两种求值取更严格者；`read` 的名字变体取最严格者）；安全问题只写到设计层面。

**Pi v1.2.0 核实**（`packages/coding-agent/src/`；`git show v1.2.0:<path>`）
- 六个内置文件工具在 `execute` 中才求路径：`core/tools/write.ts:65`、`edit.ts:161`、`ls.ts:83`、`find.ts:111`、`grep.ts:125` 调用 `resolveToCwd`，`read.ts:124` 调用 `resolveReadPathAsync`；`ls`/`find`/`grep` 省略路径时为 `.`。`edit` 的 `prepareArguments`（`edit.ts:103-134`）只整理 `edits`，不动 `path`，所以 `tool_call` 钩子看到的是未经求值的原始参数。
- `resolveToCwd`（`core/tools/path-utils.ts:48-50`）= `resolvePath(…, {normalizeUnicodeSpaces:true, stripAtPrefix:true})`（`utils/paths.ts:103-107`）：`normalizePath`（`:76-101`）依次把 U+00A0、U+2000–U+200A、U+202F、U+205F、U+3000（`:7`）换成普通空格，去掉一个前导 `@`，Windows 上另做 `normalizeWindowsShellPath`，把恰为 `~` 与以 `~/` 开头（Windows 另有 `~\`）的值展开为 `os.homedir()`，把以 `file://` 开头的值经 `fileURLToPath` 转换；之后绝对值按 `path.resolve` 规范化、相对值以 `cwd` 为基准，`..` 都按词法消去。`trim` 未开启。`~user/…` 与 `FILE://…`、`file:/…` 不被转换，按字面的相对路径落在 `cwd` 之下。
- `resolveReadPathAsync`（`path-utils.ts:86-118`）：求出的路径不存在时依次试 AM/PM 前的窄空格（U+202F）、NFD、弯引号（U+2019）、NFD 加弯引号四个变体，替换作用于整条路径。
- 这些函数不从包入口导出：`package.json` 的 `exports` 只有 `.` 与 `./rpc-entry`；`src/index.ts:335-392` 导出 `create*ToolDefinition`、各工具的 `*Operations` 与 `*ToolOptions` 类型，`:490-496` 的 `utils/` 导出不含 `paths.ts`。工具把求出的绝对路径交给可替换的 `operations`（如 `read.ts:69, 92, 124-127`、`write.ts:41, 48, 65, 82`），所以契约测试能以导出的工厂观察 Pi 自己的求值。`v1.2.0..HEAD` 中这些文件没有变化。
- `StdioTransport.close()` 在服务器进程已退出时只结束 stdin、直接返回（`packages/mcp/src/transports/stdio.ts:160-163`），不按进程组终止——观察 8 的依据；`exit` 钩子（`:43-52`）挂在 `process.once("exit")` 上，未捕获的 JS 异常仍会触发它。
- 内置 MCP 注册工具时为每个服务器的工具带上 `namespace`，其 `aliases` 为原始服务器名（`extensions/mcp/index.ts:387-397`，传入在 `:424`）；`getAllTools()` 的 `ToolInfo` 带 `namespace`（`core/extensions/types.ts:2121-2131`）——观察 9 的依据。

**条目（R91 追问清单）**
- **R91-D11-01**（重要；文件工具的分类以字面 `resolve` 求路径，Pi 却展开 `~`、转换 `file://`）：唯一定义 `11` §11.3.1 新增的“求路径”一条，伪代码的 `resolve(cwd, stripAt(input.path))` 改为 `piResolve(input.path || ".", cwd)`：分类所用的路径就是 Pi 内置文件工具在 `execute` 中求出的路径（上方核实的全部步骤）；`read` 对四个名字变体不论是否存在都各判定一次、取最严格者（替换可能改变目录部分，不能以“不改变目录”免除）。Pi 的函数不导出，`piResolve` 是 Tower 固定于 v1.2.0 的移植：`05` §5.11.1 D60 登记行号（C 类，上游候选为导出这些函数或在 `tool_call` 中带上求出的路径），契约测试 C41 在一组夹具（`@`、`@~/`、`~`、`~/`、`~user/`、`~foo`、各种 `file:` 写法、Unicode 空格及其组合、`..`、绝对与省略路径）上，以导出的工具工厂配记录路径的 `operations` 与 Pi 自己的求值逐项比对，并只写期望地检验 `edit.outside_worktree`、`secrets.access` 与硬底线 forbid 在各写法下都成立。移植不能确定地求出路径时（Pi 会抛错的 `file://` 值、取不到主目录）为 `opaque`、至少 ask。`..` 由 `path.resolve` 按词法消去，Pi 交给文件系统的路径中不再有 `..`，所以文件工具只有一种求值。本条只用于这六个工具：bash 按 shell 的展开，沙箱外工具按 §11.3.4。同步：`11` §11.1 `read.external`、`edit.outside_worktree` 的例子补 `file://` 与 `@~/` 写法，§11.3.1 开头的 certainty 句、T3 引用求路径；`16` §16.1.10 工具表文件类工具一行写明同一求法与 `opaque`。
- **R91-D11-02**（次要；“两种方式各求一次”只用于 (b)）：唯一定义 `11` §11.3.4 路径检查新增的“求值”一句，(1)(3) 与 (b) 共用：每个路径——绝对路径、`~` 路径展开后与 `file:` URI 解码后的路径，以及以各基准解析出的相对路径——都按词法规范化 `..` 与按操作系统的方式（先解析符号链接、再处理其后的 `..`）各求一次，最后几段尚不存在时对最长已存在前缀取 `realpath`，两个结果都判定、取更严格者。(1) 的“经 `realpath` 后”与 (b) 的括注改为引用它。G46 (bk) 补一组（已授权的工具以经卫星中符号链接、含 `..` 的绝对路径、`file:` URI 与 `~/` 路径写入，按操作系统的方式落在主检出 → forbid、不出现审批卡）。
- **R91-D6-01**（次要；写回中途的非崩溃失败没有出口）：唯一定义 `06` §6.4.3 `inspect.bring_back` 行的“写回进行中”：`syncState='syncing'` **且这次写回正在本进程中执行**（交还 ① 到 ③、带回、§6.1.6 的启动续写）。**写回在本进程中失败**（文件系统错误、目标目录不可写、卫星中途消失；`10` §10.1.3 的逐路径跳过不算）时：停止写回，把 `written` 中已写的路径还原为写回开始时的版本（交还为 B 中的版本，`take_human` 并入的 E 中路径取第 6 步 safety 检查点中的版本；带回为 T_pin），然后一个事务把 `human_checkout` 退回写回之前的状态（交还 `idle` 并清除 `targetTree`、`written`、`params`；带回清除 `human_checkout`），不写决定、状态不变，命令返回 `E_INTERNAL`（`detail` 写步骤、路径与原因），人工编辑检出或检验目录保留，人可以重试或放弃；启动续写失败时原因显示在 Goal 卡片上。还原也失败、或来源目录已不存在（T1 是人的改动仅剩的副本，不还原）时 `syncing` 保留，但写回已不在进行：不返回 `E_BUSY`，`goal.abandon` 照常可用（同时清除 `human_checkout`），检出仍在时再次交还按 `10` §10.8.4 第 6 步续写，下次启动由 §6.1.6 续写。所以放弃从不被无限期阻断：`E_BUSY` 只在本进程中正在写的有限时间内出现。同步：`06` §6.1.6 的续写引用失败规则；`goal.discard_human_edits`（写回失败后保留的 `syncing` 返回 `E_STATE`）、`goal.abandon`（写回结束或失败后即可放弃；带回失败后保留 `syncing` 时放弃同样清除 `human_checkout`，满足 DDL 的 CHECK）与 `16` §16.1.12 `ProtoError.code` 引用；`16` §16.1.1 与 `02` §2.4 的 `syncing` 改为“写回已开始而未完成”；`10` §10.8.4 检出丢失一条写明续写失败时 `syncing` 保留；`04` §4.6.7 与 `12` §12.6.4 补写回期间与失败的文字；G31 补两组。

**评审结论中的观察（R91 结论部分）**
- 观察 1：“写回进行中”的命令范围改为“会改写该 Goal 的状态、暂停原因、继续目标、开场或 `human_checkout`”，并点名 `sentinel.override`、`goal.openings.withdraw`、`needs_you.answer` 与删除检验目录的 `inspect.close`；接管期间的自动重建等写回结束（都持 `wtLock`）；引用写作三行；`03` §3.1 的 `abandon（任何非终态）` 补“写回进行中稍后”。只看浏览记录、优先级之类的命令不在其中，不因写回而返回 `E_BUSY`。
- 观察 2：`12` §12.6.4 实况行补 `写回中 · 你的改动 · 12/40 个文件` 一行，`04` §4.6.7 补写回期间与失败的提示；G31 补一组（写回期间 `inspect.bring_back` 返回 `E_BUSY` 而不是 `E_STATE`，`inspect.close`、`goal.discard_human_edits` 同样 `E_BUSY`）。
- 观察 3：`11` §11.3.4 (3)：“含 `/` 或等于 `.`、`..`”的条件同样适用于以 `~` 开头的值，`~`、`~foo`、`~1.2.3` 这类只按 (1) 检查（无法展开的不作路径）。
- 观察 4：`11` §11.3.4 (2) 的括注改为“回退位置例外中 Agent 读写项的第一项”。
- 观察 5：`11` §11.3.1 密钥路径表的两处范围注改为“S0 与 S2 下文件工具的分类与技能路径排除”（内置文件工具在 Host 中运行，不在 S2 之内）。
- 观察 6：`10` §10.4.3 “其余规则引用后者”改为“第二处”。
- 观察 7：`00` §0.5.1：空目录中“也不当作读取密钥”补“其中未被 git 跟踪的 `.env` 一类文件照常算作密钥”；`~` 补 `~user/…`；写明以 `~/` 开头的值即使已授权也逐次询问（字面一侧为 `opaque`，对所有沙箱外工具都成立，不只用户扩展与 HTTP 服务器）。
- 观察 8：`11` §11.3.4 (a)：“致命错误”改为“运行时中止”，并写明未捕获的 JS 异常仍会运行 `exit` 钩子；补 `close()` 在服务器进程已退出时不按进程组终止，服务器留下的子进程可能在连接关闭后存活，同属该残余。
- 观察 9：`11` §11.3.4 (b)：从一次调用找到 Tower 为该连接记下的条目，按 `getAllTools()` 中该工具的 `namespace.aliases`（原始服务器名）；取不到时以本 Host 全部 stdio 服务器的工作目录各解析一次（更严）。
- 观察 10：`06` F4b 的检测补“`host.spawn` 之前删除本 Host 的 stdio MCP 空目录失败”，`04` §4.8.11 补原因文字“无法清空 MCP 服务器的工作目录…；请手动删除该目录后重试”。
- 观察 11：G33 补 `budget.extend` 之后先扩展预算的提示消失、`按当前状态送去验证` 仍置灰、`claim_on_behalf` 仍为 `E_STATE`；G46 标题的 ADR 列表补到 219、评审轮次补到 R91。
- 观察 12：`04` §4.8.12 “上一条所说的决定”改为“窗口起点一条所说的决定”；`04` §4.10.2 写明 M1 中 `secrets.access` 只出现在读取凭据的审批卡上。
- 观察 13：`14` §14.3.5 M1 性能门槛的 CI 场景列为 P1–P9 全部；命令 → 回执与 steer → 进入 Pi 队列两项没有专门场景，以 `13` §13.12.3 的打点在 P2 运行中另测。
- 观察 14：`02` §2.4 的 `syncing` 注释补检验带回；§2.7 `mode` 的注释写明“取自 `params`”只对 `hand_back` 成立，置换的 `resume` 恒为 `continue_agent`。

**删除 / 推迟**
- 删除：`11` §11.3.1 伪代码中只模拟 `@` 的 `resolve(cwd, stripAt(input.path))`；(1) 只有一种求值的“经 `realpath` 后”；“写回进行中”只按 `syncState` 的定义与“会改写状态或 `human_checkout`”的范围；“崩溃后由 §6.1.6 续写完成，不需要人的命令解除”作为唯一出口的写法；`11` (a) 的“致命错误”、(2) 的整组括注、密钥路径表“影响的是 S0 的分类”；`10` §10.4.3 的“后者”；`04` 的“上一条所说的决定”；M1 性能门槛只列六个 CI 场景。
- 没有推迟到 M2 的条目。
- `16` §16.1.13 补登第 91 轮被取代的说法 1 行，由 (D) 检查。

- **lint**：全部检查 `--checks rstuvwxyzckdnSeRqpoPiDgKYATFMBOJCH`，exit 0；见 `reviews/round-91-lint.md`。
- **排期**：+0.05 人周，没有系统线、安全线与 Agent 线增量。
  - W16 +0.05（设计，W3 与 W10 的落点按 ADR-136 改派）：求路径的移植与 C41 0.02、共用求值与 G46 (bk) 0.01、写回失败出口与 G31 0.02；十四条观察按 WBS 行逐项不足 0.01，计 0。
  - `14` §14.3.4 与 ADR-133 第 91 轮补记一致：WBS 123.49，余量 系统 0.12、Agent 0.14、桌面 0.36、设计 0.37、安全 0.12，依赖链 19.91，增 1 人 129.45 / T 23.90 / 33 周（新人约 2.49 人周），**M1 维持 38 周**。系统线与安全线仍在约 0.12 的改派阈值上，Agent 线在 0.14，下一次落在这三条线上的增量须先按 ADR-136 改派。

## 第 92 轮对抗评审（全范围）后的跨文档决策（ADR-220）

## ADR-220 文件工具的每次文件操作在 S2 中执行、Pi 的 `grep`/`find`/`ls` 从 Tower 删除、写回失败不留下 `syncing` 而转入情形 E 的重建 — Accepted（R92 全部条目与评审结论中的观察；Amends ADR-219、ADR-190、ADR-189、ADR-188；Amended by ADR-221、ADR-222）

选择原则（收敛规则，同 ADR-186–219）：只用三种办法关闭条目——(1) 把说法改弱但为真；(2) 删除或推迟不属于 M1 主循环的机制；(3) 在已有的唯一定义处加至多一条守卫、一行或一个字段。本轮按指示优先采用**结构性**的关闭——让一整类问题不可能出现——与删除，而不是再加路径检查规则：
- 判定与访问之间的窗口不靠更多的判定关闭，而靠把访问放进已有的边界（S2）；
- 只按一个点分类的目录型工具直接删除；
- “失败而仍在 `syncing`”的长期状态整体消除，复用已有的情形 E 重建。

复用的已有机制：沙箱 bash 的 `customTools` 注入、来源自检与 S2 档位（ADR-041/066）；`excludeTools` 白名单（ADR-189）；`10` §10.16.2 情形 E 的重建；`10` §10.2 的改名保留；`stalled` 子类型（同 ADR-211 的 `human_checkout_lost`）。新增的只有：一个 Tower 自己的 `operations` 实现与其辅助进程、依赖清单一行（D61）、一项契约测试（C42）、一个 `stalled` 子类型（`write_back_failed`）与 `11` §11.3.1 的两条定义。不新增状态、事件类型、表、列、命令、决定种类、Needs-You kind 或 landmark。安全不变式全部保留，有取舍处都取更严格的一侧（文件工具的权限收紧到不超过沙箱 bash；受保护位置按两种形式比较、任一命中即命中）。安全问题只写到设计层面。

**Pi v1.2.0 核实**（`git show v1.2.0:<path>`；`packages/coding-agent/src/` 下，`packages/agent/src/` 另注）
- **工具执行**：`toolExecution` 默认为 `"parallel"`（`packages/agent/src/agent.ts:253`）；只有调用中含 `executionMode:"sequential"` 的工具时才顺序执行（`agent-loop.ts:508-523`）；并行模式先对整批调用逐个 `prepareToolCall`（含 `beforeToolCall`，即 `tool_call` 钩子），之后才并发执行（`:586-648`）。
- **文件工具的 `operations`**：
  - `read`：`ReadOperations{readFile, access, detectImageMimeType?}`（`core/tools/read.ts:48-55`）；工厂 `createReadToolDefinition(cwd, options)` 取 `options.operations ?? default`（`:86-92`）；`execute` 先以 `resolveReadPathAsync` 求路径，再 `ops.access`、`ops.detectImageMimeType`、`ops.readFile`（`:124-155`）。
  - `edit`：`EditOperations{readFile, writeFile, access}`（`edit.ts:83-90`）；工厂 `:143-147`；`execute` 中 `ops.access`、`ops.readFile`、`ops.writeFile`（`:161-198`）。
  - `write`：`WriteOperations{writeFile, mkdir}`（`write.ts:27-32`）；工厂 `:44-48`；`execute` 中 `ops.mkdir(dirname)`、`ops.writeFile`（`:65-82`）。
  - 例外：`read` 的名字变体探测（`path-utils.ts:86-118`）用 Node 的 `fs.access`，不经 `operations`。
  - 三个工厂与 `*Operations`/`*ToolOptions` 类型都从包入口导出（`src/index.ts:336-392`，另有 `withFileMutationQueue`、`truncate*`、`formatSize`）。
- **`customTools` 的来源**：`_refreshToolRegistry` 把 `customTools` 写为 `<sdk:${name}>`，最后写入，压过同名的内置与扩展定义；`customTools` 同样经 `excludeTools` 过滤（`core/agent-session.ts:3529-3553`）。
- **目录型工具**：`grep` 的 `GrepOperations` 只有 `isDirectory`/`readFile`（`grep.ts:53-58`），搜索由 `ensureTool("rg")` 之后直接 `spawn(rgPath, …)` 完成（`:119-168`），`operations` 包不住；`find` 的自定义 `glob` 与 `ls` 的 `exists`/`stat`/`readdir` 可以完全经 `operations`（`find.ts:52-57, 113-125`，`ls.ts:34-41`）。`allToolNames` 为 `read`/`bash`/`powershell`/`edit`/`write`/`grep`/`find`/`ls`（`core/tools/index.ts:96-105`）。
- **各阶段的内置工具**（Tower）：`running` 固定为 `read`/`bash`/`edit`/`write`（ADR-189）；`grep`/`find`/`ls` 只出现在 `shaping`（塑形 Run 属 M2，ADR-059）与 `review`（独立评审默认关闭，不在 ADR-059 的 M1 清单中，`07` §7.12）。所以它们在 M1 中没有用途，删除不破坏任何 M1 能力。

**条目（R92 追问清单）**
- **R92-D11-01**（重要；文件工具在钩子中按 `realpath` 分类，Pi 在之后的 `execute` 中由操作系统重新跟随路径，同一批中的 bash 或后台进程能在两者之间改变卫星中的路径分量）：
  - **唯一定义** `11` §11.3.1 新增的“使用时强制”：文件工具实际访问的位置由访问那一刻的 OS 沙箱判定，分类只决定审批分级。
  - **做法**：Tower 以导出的工厂构造 `read`/`edit`/`write`，与沙箱 bash 一样以 `customTools` 注入，传入自己的 `operations`。S2 下每个文件操作由一个文件辅助进程执行：它与沙箱 bash 同一包装、同一档位，每个 Run 一个，由 Tower 启动与终止，不带 Run 令牌。操作系统在打开时按读写允许列表判定真实路径，换上的符号链接或路径分量不能把访问带出允许范围；被拒绝时工具报错并记 `sandbox_violation`。
  - **后果**：文件工具的权限不超过沙箱 bash。S2 拒绝的访问即使经批准也失败：读允许列表之外的 `read.external`、密钥路径表、卫星中 `.pi`/`.agents`/`AGENTS*.md`/`CLAUDE.md` 的写入。`00` §0.5.1 如实写出：这些上下文文件此后只能由人在“我来改”中修改。
  - **残余**：(i) 改向 S2 允许范围之内另一路径的写入，与 bash 相同，由事后检测与 `scope_breach` 兜底；(ii) `read` 的名字变体探测只透露存在与否；(iii) S0 下没有沙箱，`operations` 在 Host 中直接执行，窗口不封闭。T3 改为“S2：低；S0（含 Windows v1）：高”。
  - **同步**：
    - `05` §5.3.5 骨架：`createSandboxedFileOperations`、`customTools: [sandboxedBash, ...sandboxedFileTools]`，自检扩展到 `bash`/`read`/`edit`/`write` 四个 `<sdk:…>`，不符时降为 S0；另加“文件工具同样被取代”一条，RPC（M2）随 M2 复审。
    - `11` §11.3.4 工具来源：白名单内置工具的生效来源改为 `<sdk:read>`、`<sdk:edit>`、`<sdk:write>`、`<sdk:bash>`，`builtin:<name>` 只在回归保护下生效；注册了内置工具名的扩展工具在 SDK 下不会生效。
    - `11` §11.3.3 第 3 条硬底线、§11.4（同名覆盖、事后检测）、§11.6.1 S1/S2 行、§11.6.2、T3、T26；`05` gate 第 3 步与第 8 步（输入比对改为 Tower 注入的四个 `<sdk:…>`）；`05` §5.10 静态清单的提示；`16` §16.1.4 只读白名单（`<sdk:read>`）、§16.1.10 文件类工具一行、§16.1.11 S1/S2 两行。
    - `05` §5.11.1 新增 D61（A 类），§5.11.2 新增 C42。G46 补文件工具一组（同一批并行的 bash 与后台进程两种换法，期望主检出与凭据夹具都不被访问）。
  - **未采用**：
    - `toolExecution:"sequential"`：只收窄同一批的窗口，后台进程的窗口仍在。
    - Tower 在 `operations` 中自行逐段不跟随地打开（`10` §10.1.3 的做法）：需要在 Tower 中重写一遍 S2 的读写允许列表，是第二份边界定义。
    - 文件辅助进程使用去掉上下文文件名写拒绝的变体档位：分类之后被改向到这些名字的写入会因此绕过 `edit.protected`。
- **R92-D11-02**（重要；`grep`/`find`/`ls` 只按搜索根分类，`grep` 却递归读取整棵子树；受保护位置与求出的路径没有规定在同一规范形式下比较）：
  - **删除**：`TOWER_BUILTINS` 改为 `read`/`bash`/`edit`/`write`，`grep`/`find`/`ls` 并入 `NON_TOWER_BUILTINS`，以 `excludeTools` 移出注册表（RPC 传 `--exclude-tools powershell,grep,find,ls`）；Agent 用沙箱中的 bash 查找文件，bash 的读取由 S2 强制。`grep` 的搜索由直接派生的 `rg` 完成、包不进 `operations`，不能改为“经沙箱 operations 保留”。
  - **阶段**：`shaping` 与 `review` 的激活改为 `read` 加各自的 Tower 工具，两者都不在 M1 中运行；查找代码的手段随 M2 设计。
  - **一并删除**：
    - `rg`/`fd` 的首次运行检测与提示（`05` §5.3.6、`04` §4.18.1、`00` §0.5.1）；
    - 实况行的 `tool.start{grep/find/ls}` 一行；
    - ADR-188 的“塑形与评审阶段激活的是扩展版”：SDK 下 `<sdk:read>` 必胜。
  - **规范形式**：唯一定义 `11` §11.3.1 新增的“比较的规范形式”。受保护位置（第 3 条硬底线位置、密钥路径表的绝对条目）编入 `policy.json` 时取字面与 `realpath` 两种形式，求出的路径以 `p` 与 `real` 两种形式比较，任一命中即按命中；放宽一侧（`worktreeRoots`、Pi 资源目录）只取 `realpath`、只以 `real` 判定在其内。S2 下只影响审批分级，S0 下是分类的一部分。G46 补一组（`~/.aws` 是符号链接时读取凭据归 `secrets.access`）。
  - **同步**：`11` §11.3.1 标题与求路径一条（三个工具、行号）、§11.3.4 白名单之外的内置工具点名 `grep`/`find`/`ls`；`16` §16.1.10 白名单之外一行；`05` D60、C41（去掉三个工厂与“省略路径”）、§5.5.1、§5.6.2；`07` §7.3.2 与 §7.12；`00` §0.5.1 两行。
- **R92-D6-01**（重要；写回失败后保留 `syncing` 的状态与带回一侧的命令、DDL CHECK 及启动续写的删除步骤相撞）：
  - **唯一定义** `06` §6.4.3 `inspect.bring_back` 行的“写回在本进程中失败”。任何分支都不留下 `syncing`：
    - ① 来源目录已不存在时，先以 T1 在原路径重新物化它（交还按 `10` §10.8.4 第 2–3 步，带回按 `10` §10.8.3 第 1 步）；
    - ② 还原已写路径：交还取写回之前最近的检查点（第 6 步 safety 或第 7 步 `agent_bg_done`，没有时为 B），带回为 T_pin；勾选删除的 `.git` 等价条目不还原；
    - ③ 一个事务退回写回之前的状态（交还 `idle`；带回清除 `human_checkout`）。还原没有完成时，同一事务置 `satellite_rebuilding=1`，按情形 E 重建卫星：仍在的卫星先改名保留；接管期间只用检查点 k；带回时为最新检查点 → pin → base；
    - ④ 返回 `E_INTERNAL`，并生成 Needs-You `stalled{write_back_failed}`。
  - **出口**：检出或检验目录保留。交还可再次交还或放弃改动，带回可再次 `inspect.bring_back`（前置条件此时都成立）或关闭检验，放弃都照常可用。所以 `syncing` 只存在于本进程中正在写的时间内与崩溃到重启之间，命令与自动转移从不在“写回已不在进行而 `syncing` 仍在”的状态上执行，DDL 的 CHECK 不变。
  - **续写删除前比较**：`06` §6.1.6 的启动续写完成之后、删除来源目录之前，以临时索引比较它与 T1；不同（崩溃后人仍在改）时不删除，按 `10` §10.2 改名保留并列出。来源目录只在写回成功、且内容仍等于 T1 时删除。
  - **删除**：
    - `10` §10.8.4 第 6 步的 `syncing` 分支（交还命令不再遇到它）；
    - `goal.discard_human_edits` 的“写回失败后保留的 `syncing` 返回 `E_STATE`”；
    - `goal.abandon` 的“带回写回失败后保留 `syncing`”一句；
    - `04` §4.6.7 的“恢复也失败时……重启 Tower 后也会自动续写”。
  - **同步**：`06` §6.1.6 人工编辑检出一行、DDL 注释；`10` §10.8.3 第 7 步、§10.8.4 检出丢失一条；`16` §16.1.1 `Goal.humanCheckout`、§16.1.7 `stalled` 子类型、§16.1.12 `ProtoError.code`；`08` §8.4、§8.8 各一行；`04` §4.6.7；`12` §12.6.4。G31 补四组：还原失败、带回中途删除卫星、崩溃后改动检出再重启、删除检出并让写回失败。

**评审结论中的观察（R92 结论部分）**
- 观察 1：`05` gate 第 3 步改为 `read`/`edit`/`write` 引用 `11` §11.3.1 的求路径；`write` 的前像对求出的路径取。
- 观察 2：`06` §6.1.6 的“写回中途崩溃”与 DDL 注释现在都准确（失败不再留下 `syncing`），各补一句。
- 观察 3：`16` `ProtoError.code` 的 `E_INTERNAL` 补交还与带回的写回失败。
- 观察 4：还原版本取写回之前最近的检查点（第 6 步 safety 或第 7 步 `agent_bg_done`，没有时为 B）；勾选删除的 `.git` 等价条目不还原。
- 观察 5：`10` §10.8.4 第 6 步的 `syncing` 分支随 R92-D6-01 删除，“以 T1 为目标”不再出现；交还的 T1 只有第 5 步本次求出的一个。
- 观察 6：`04` §4.6.7 与 `12` §12.6.4 改为“这期间改动该目标的操作都提示”，点名评审中的 `验收`、`请求返工`、`关闭检验`；“或放弃”改为“或放弃改动”。
- 观察 7：`12` §12.6.4 写明写回期间以实况行为准，取代卡片第二行的 `<状态> · <原因>` 与 `已暂停 · 人工编辑中`。
- 观察 8：`11` §11.3.1 求路径改为“按 `opaque` 判定（`decide` 照常以 `env.sandbox` 求值）”，并写明 Pi 一侧对这些值抛错、不发生读写。
- 观察 9：C41 (b) 注明变体探测经 Node 的 `fs.access`，夹具须放真实文件；`grep` 的 `ensureTool` 随 `grep` 删除不再相关；`11` §11.3.1 的导出范围改为“工具工厂、`*Operations` 与 `*ToolOptions` 类型和少数辅助函数”。
- 观察 10：G46 符号链接组补相对路径一次。
- 观察 11：`14` §14.3.5 写明命令 → 回执由 P2 夹具另发命令测量，steer → 进入 Pi 队列在 8 小时浸泡的真实 Pi 目标中测量，热启动、`whenReady` 与渲染进程启动 JS 在 P1 的同一夹具中另测。
- 观察 12：W16 行补 (3)；`00` §0.5.1 MCP 一行的依据补 ADR-219。
- 观察 13：`04` §4.8.11 的原因文字补“常见原因是上一个服务器留下的子进程仍在运行；请先结束这些进程”。
- 观察 14：`10` §10.13 多仓库目标的 cwd 一条注明它在 `~/.tower/**` 之下，相对路径的分类与 S2 读允许列表随 M3 一并设计。

**删除 / 推迟**
- 删除：
  - Tower 中的 `grep`、`find`、`ls`（`TOWER_BUILTINS` 中的三项、塑形与评审阶段的激活、RPC `--tools` 中的三项、`builtin:grep`/`builtin:find`/`builtin:ls` 来源）；
  - `rg`/`fd` 的首次运行检测、提示与能力摘要项；
  - 实况行的 `tool.start{grep/find/ls}`；ADR-188 的扩展版激活限制；
  - 文件工具在 Host 中、S2 之外访问文件的做法，以及“内置文件工具在 Host 中运行，不在 S2 之内”的说法；
  - “S1 工具级写守卫”作为 T3 的主防线；
  - Agent 经文件工具并经批准修改上下文文件的能力（`00` §0.5.1）；
  - 写回失败后保留 `syncing` 的状态及其全部出口（`goal.discard_human_edits` 的 `E_STATE`、`goal.abandon` 的清除、第 6 步的 `syncing` 分支、“重启后也会自动续写”）。
- 推迟：塑形与评审阶段查找代码的手段随 M2 设计；多仓库目标 cwd 下相对路径的分类随 M3。
- `16` §16.1.13 补登第 92 轮被取代的说法 1 行，由 (D) 检查；lint (d) 的 `DELETED` 补两项（Tower 中的 `grep`/`find`/`ls`、第 6 步的 `syncing` 分支）。

- **lint**：(T) 扩展一项：白名单中每个名字都须在 `11` §11.3.4 工具来源一条中以 `<sdk:<name>>` 点名（Tower 注入的生效来源）。全部检查 `--checks rstuvwxyzckdnSeRqpoPiDgKYATFMBOJCH`，exit 0；见 `reviews/round-92-lint.md`。
- **排期**：+0.16 人周，没有系统线、安全线与 Agent 线增量。
  - W4 +0.10（桌面，从 W10 与 W6 按 ADR-136 改派）：文件辅助进程 0.08、C42 0.02。
  - W16 +0.05、W13 +0.01（设计）。
  - `14` §14.3.4 与 ADR-133 第 92 轮补记一致：WBS 123.65，余量 系统 0.12、Agent 0.14、桌面 0.25、设计 0.30、安全 0.12；依赖链 19.91；增 1 人 129.63 / T 23.93 / 33 周（新人约 2.47 人周）；**M1 维持 38 周**。
  - 系统线、安全线与 Agent 线仍在改派阈值上。桌面线与设计线的余量合计由 0.73 降到 0.55：下一次超过约 0.2 人周的增量须先评估顺延，不再默认由这两条线吸收。

## 第 93 轮对抗评审（全范围）后的跨文档决策（ADR-221）

## ADR-221 文件辅助进程按次启动并取定上限、S2 必然拒绝的文件工具访问不询问、写回失败处理自身可崩溃续做且删除来源目录前一律比较 — Accepted（R93 全部条目与评审结论中的观察；Amends ADR-220、ADR-199、ADR-125；Amended by ADR-222、ADR-223、ADR-224、ADR-228）

选择原则（收敛规则，同 ADR-186–220）：只用三种办法关闭条目——(1) 把说法改弱但为真；(2) 删除或推迟不属于 M1 主循环的机制；(3) 在已有的唯一定义处加至多一条守卫、一行或一个字段。本轮七条都是次要，优先复用已有的限额、路径与命名：
- 辅助进程的内存不另立预算行，而是改为按次启动的一次性子进程，归入已有的进程树预留；
- “必然被拒的审批”复用 `hardFloor`（`decide` 首行），不新增级别或决定种类；
- 写回失败处理的崩溃窗口复用情形 E 的“旁路目录 + `renameat`”与 ADR-199 的 `.kept-<时间>` 命名。

不新增状态、事件类型、表、列、命令、决定种类、Needs-You kind、landmark 或进程常驻。安全不变式全部保留：文件工具的访问仍在访问时由 S2 判定，硬底线、密钥路径表与上下文文件名的写拒绝不变；有取舍处取更严格或更真实的一侧（Pi 的完整输出文件登记为 S2 下不可读，而不是把 Host 的临时目录交给 Agent）。安全问题只写到设计层面。

**Pi v1.2.0 核实**（`git show v1.2.0:<path>`；`packages/coding-agent/src/` 下）
- **`read` 的截断与整读**：`DEFAULT_MAX_LINES = 2000`、`DEFAULT_MAX_BYTES = 50 * 1024`（`core/tools/truncate.ts:11-12`）；`read` 对图像与文本都先 `ops.readFile` 整个文件（`read.ts:135, 155`），之后才取 `offset`/`limit` 并 `truncateHead`。Pi 自身不设文件大小上限。
- **`edit` 整读整写**：`ops.readFile` 之后在内存中替换，再 `ops.writeFile` 整份内容（`edit.ts:186, 198`）；`edit`、`write` 在中止时不从监听器中拒绝，等进行中的文件操作结束（`edit.ts:164-167`、`write.ts:68-71`）。
- **`withFileMutationQueue`**：在 Host 中对求出的路径 `realpath`，只作串行化的键，`ENOENT`/`ENOTDIR` 之外的错误原样抛出；登记队列是模块级单一链（`file-mutation-queue.ts:4-5, 16-26, 33-49`）。
- **输出文件**：`createOutputFilePath` 一律 `join(tmpdir(), …)`，以 `wx`、0600 写出（`utils/output-files.ts:17-34`）；bash 截断时以 “Full output: <path>” 指向它（`bash.ts:343-352`）；MCP 二进制资源与 codemode 图像同一方式写出（`extensions/mcp/tools.ts:71`、`extensions/codemode/execute.ts:340, 369`）；Pi 不删除这些文件（`output-accumulator.ts` 只关闭流）。Pi 没有改变输出目录的选项。
- **图像检测**：`detectSupportedImageMimeType(buffer)` 只看前 4100 字节（`utils/mime.ts:3-23`）；包入口只导出 `detectSupportedImageMimeTypeFromFile`（`src/index.ts:494`），它在调用者进程中直接打开文件。
- **图像缩放**：`ReadToolOptions.autoResizeImages`（`read.ts:65`，默认 `true`，`:90`）；Pi 自己构造内置 `read` 时传入 `settingsManager.getImageAutoResize()`（`agent-session.ts:3636, 3647`）。
- **Pi 文档目录**：系统提示词列出 Pi 安装目录中的 README、docs 与 examples（`system-prompt.ts:162-170`）。

**条目（R93 追问清单）**
- **R93-D5-01**（文件辅助进程的上限与超时没有取值，与 Pi 整读整写相撞；崩溃后的处理未定）：
  - **唯一定义** `11` §11.3.1 使用时强制（取值登记 `16` §16.2.8）：每次文件操作一个一次性子进程——在同一 S2 包装与档位中执行的系统自带命令（`cat`、`head -c 4100`、经 `sh` 重定向写入、`mkdir -p`、`test`），不加载 Pi、不另设运行时或构建目标，完成即退出；图像类型由 Host 对前 4100 字节按 Pi 的纯字节判定求出（`utils/mime.ts:3-23` 移植，包入口只导出在调用者进程中打开文件的 `…FromFile`，`src/index.ts:494`；C42 比对）；单次读取的回复与写入的请求 ≤ 16 MB（按 Host 承受得起的单文件大小取，不按 Pi 截断后的大小），超出时工具结果写“文件超过 16 MB……请用 bash 分段处理”；每次操作 10 s，超时先杀掉并等它退出再报失败，所以报告为失败的写入不会之后落盘。
  - **崩溃**：启动失败、崩溃或回复不合规只使这一次操作失败，工具结果写明原因，不重试；反复失败由 `07` §7.7.1 的循环/停滞检测处理，不另设规则。Pi 的 `edit`/`write` 在中止时也等文件操作结束，settle 终止进程时没有仍在写的辅助进程，不另加停止步骤。
  - 评审期望形态中的“退出或超时后在下一次操作时重启”与“在 settle 第 3 步之前停止”因按次启动而不再需要。
- **R93-D5-02**（Pi 的完整输出文件在 Host 的临时目录，S2 下读不到；`11` L522 与 `05` L465 矛盾）：
  - 取“登记为限制”：Pi 没有改变输出目录的选项，Host 的 `TMPDIR` 在打包模式下由多个 Goal 共用，把它改为 S2 可读会使 Goal 之间互相可见；改为 `~/.tower` 下的目录又会让 Agent 按 Pi 的提示用 bash 读取时产生 `tower_data` 类的 severity 2 告警。
  - `11` §11.7.1 残余一行改为：全文文件在 Host 的系统临时目录（你自己的 `TMPDIR`），S2 下 Agent 读不到（`read` 按 R93-D8-01 直接 forbid，返回的文字说明怎样把输出重定向到 `$TMPDIR` 下再分段查看）；`05` §5.3.6 的唯一定义不变。
  - `07` §7.2.2：观察器把它复制为证据之后删除它（删去不成立的“Pi 的临时文件会被清理”）；MCP 二进制资源与 codemode 图像文件 Pi 与 Tower 都不删除，`09` §9.12.4 如实列出清除不覆盖它们。
  - `00` §0.5.1 内置工具一行写明这些文件读不到。
- **R93-D6-01**（写回失败处理自身的中途崩溃；“改名保留”没有定义）：
  - **唯一定义** `06` §6.4.3 `inspect.bring_back` 行的“写回在本进程中失败”：
    - ① 在同一父目录的旁路目录中物化，完毕后 `renameat` 到原路径；中途崩溃时原路径仍不存在、`syncing` 仍在，`06` §6.1.6 续写之前丢弃旁路目录，续写再失败时重做 ①。
    - ② 还原整个写回集合（当前内容已等于还原目标的跳过，幂等），不只 `written` 中记下的路径。
    - ③ 还原没有完成时，仍在原位的卫星先在事务之前改名保留，再在事务中置 `satellite_rebuilding=1`；改名之后、事务之前崩溃时 `syncing` 仍在，续写因卫星已不在而失败，再进入 ③。`06` §6.1.6 卫星重建中途崩溃一行写明原路径上只可能是重建自己 `rename` 到位的目录，`.kept-*` 不在此列。
    - ④ 的 Needs-You 在 ③ 的同一事务中生成（观察 9）。
  - **唯一定义** `10` §10.2 新增“Tower 自动改名保留”：只有两处——删除来源目录之前的比较不同、写回失败转入重建时仍在的卫星（工作目录与 gitdir 各自改名）——按 `moveAside` 的同一方式改名为 `<原名>.kept-<时间>`；从不删除、不再管理，Goal 页按 `<goalId>.kept-*` 列出，编号分配跳过（`02` §2.2）。§10.2 原句“Tower 也不自行改名”限定为新建时。
  - G31 补一组：① 物化到一半时杀掉 Tower、续写再失败——人的改动不丢、条目写明。
- **R93-D6-02**（“删除前比较”写成一般规则而本进程中的完成步骤不比较；口径未定）：
  - **唯一定义** `10` §10.8.4 第 8 步新增“删除来源目录之前的比较”：删除 H 或检验目录之前，以求 T1 的同一规则（交还为第 5 步；带回为 §10.8.3 第 7 步以 T_pin 为基线的同一取法）对目录重新求树，与 T1 比较树 id；相同才删除，不同按 §10.2 改名保留并列出。本进程中的交还（含 take_external）、带回与启动续写都用这一条；`06` §6.1.6、§6.4.3 两行与 `04` §4.6.7 只引用它。
  - 带回删除检验目录时中断的重启规则改为按同一比较处理（T1 取该决定的 `targetTree`），不再“直接删除”。
  - G31 补一组：交还与带回写回期间在来源目录中再保存一个文件，写回成功后目录改名保留并列出。
- **R93-D8-01**（S2 必然拒绝的访问仍出审批卡；凭据读取批准之后又以 severity 2 告警）：
  - **唯一定义** `11` §11.3.1 新增“S2 必然拒绝的访问不询问”：S2 下，文件工具求出的路径按“比较的规范形式”对照本 Run S2 档位的同一份路径数据（随 `policy.json` 下发）落在读或写的拒绝范围时，该调用带 `hardFloor`（forbid）：不出审批卡、不可授权、不发生访问、不记 `sandbox_violation`，返回给模型的文字说明沙箱不允许并给出替代做法。判定与 S2 不一致时访问仍由 S2 判定。bash 不适用（读写只能启发式求出），审批卡照旧。
  - **唯一定义** `11` §11.6.2 新增“经批准的目标”：被拒绝的访问来自经人批准的工具调用、且目标在该次批准所列的路径之中时，不论类别都记 severity 1 的 chip、不生成 Needs-You，不再以“可能表明提示注入”告警；`07` §7.10.1 与 `16` §16.1.6 引用。凭据读取永不降级、不入良性清单的规则（ADR-125）不变——这一条不是降级，而是批准过的目标不进入 severity 2。
  - `04` §4.10.2 写明凭据审批卡只在批准能起作用的地方出现；C42 补一组（不出现审批卡、不记 `sandbox_violation`）。
- **R93-D10-01**（辅助进程的内存“计入 Engine Host 一行”，但没有测量覆盖它）：
  - 取“并入已有的进程类别”：按 R93-D5-01 改为一次性子进程后，它与 Agent 的工具子进程一样计入 §13.8.3 每个运行中 Goal 的进程树预留 `p90_g`（作为 Tower 直接启动的已知进程被采样，不带 Run 令牌、不被内存上限终止），不计入 Engine Host 一行。SP2、E6、准入模型的 `h` 与打包的 15 MB/Goal 都只量 Host 进程本身，因此不变且完整；`13` §13.8.1 另写明文件工具调用期间 Host 持有整份文件（≤ 16 MB，`edit` 时为其数倍，瞬时）。
  - 没有可合并的常驻沙箱进程：沙箱 bash 每条命令一个进程，没有每个 Goal 常驻的沙箱运行器。代价：每次文件操作多一次进程启动。
- **R93-D14-01**（G46 (4) 的 S2 组与 (be)(1) 的期望与 ADR-220 相反）：(4) 改为文件工具改写 `docs/agents.md` 不出现审批卡、直接被拒绝，`protected_path` 只列 `.NPMRC`；(be)(1) 改为确认卡写“该扩展的 read 在 Tower 中不生效”、Agent 调用的是 `<sdk:read>`，删去扩展版 `read` 的审批卡与“使提交作废”。`~/.aws` 经链接一组补 S2 下直接 forbid，并加 bash 读取、人批准后只记 severity 1 的一次。`16` §16.1.13 登记两处旧期望，由 lint (D) 检查。

**评审结论中的观察（R93 结论部分）**
- 观察 1：`11` §11.3.1 与 D61 写明 `operations` 之外有两处元数据访问（变体探测与 `withFileMutationQueue` 的 `realpath`），残余 (ii) 一并写“只涉及元数据”，并写明打包 Host 中的单一登记链。
- 观察 2：`05` gate 第 3 步的前像按 `10` §10.1.3 读取（超出或不是普通文件时省略 `prevSha256`）。
- 观察 3：`05` §5.3.5 骨架的 `read` 传入 `autoResizeImages: settingsManager.getImageAutoResize()`，与内置 `read` 取自同一设置。
- 观察 4：`05` §5.3.5 自检一条写明文件工具的来源不符用同一哨兵 `bash_overridden` 与同一文案，SDK 下四个工具的检查都只是回归保护。
- 观察 5：`00` §0.5.1 写明 Pi 系统提示词所指的 Pi 文档目录在 S2 下读不到。
- 观察 6：`04` §4.6.7 重建提示补带回的写法“完成后可再次带回或关闭检验”。
- 观察 7：`08` §8.4 `write_back_failed` 改为按条目生成之后的事件关闭，不按 `human_checkout` 是否为空。
- 观察 8：`08` §8.8 出口补“放弃 Goal”；G31 不可写一组补断言出现 `write_back_failed`。
- 观察 9：④ 的 Needs-You 在 ③ 的同一事务中生成（R93-D6-01）。
- 观察 10：`06` §6.4.3 ③ 与 `10` §10.8.4 第 6 步写明写回失败转入的重建只用 k，k 不一定是链上最新的，告知写“检查点 n 的改动未进入工作目录，仍在检查点 n 中”。
- 观察 11：`06` §6.4.3 带回出口写明重建进行中返回 `E_STATE`，重建树不等于 pin 时经 I2 转入验证、回到评审之后才按冲突处理。
- 观察 12：`00` §0.5.1 改为“S2 读允许列表之外的文件”。
- 观察 13：README 补 `read`/`edit`/`write` 被取代与 `grep`/`find`/`ls` 不提供；`05` §5.10 扫描名单补 `powershell`；`04` §4.18.1 确认卡补其他内置工具名的写法。
- 观察 14：`10` §10.8.4 放弃 Goal 的询问在重建进行中把“先交还”置灰并写明原因。

**删除 / 推迟**
- 删除：每个 Run 一个、常驻的文件辅助进程及其启停与崩溃处理；“该 Goal 的文件工具辅助进程计入 Engine Host 一行”；“`full_output_path` 指向 `$TMPDIR/tower-<goalId>/`（随 Goal 清理）”与“Pi 的临时文件会被清理”；S2 下必然被拒的文件工具访问的审批卡；对已批准目标的 severity 2 沙箱告警；写回失败的 ② 只还原 `written`；带回删除检验目录中断时的“直接删除”；G46 的两组旧期望。
- 推迟：无。
- `16` §16.1.13 补登第 93 轮被取代的说法 1 行，由 (D) 检查；`16` §16.2.8 补辅助进程的取值一行。

- **lint**：全部检查 `--checks rstuvwxyzckdnSeRqpoPiDgKYATFMBOJCH`，exit 0；见 `reviews/round-93-lint.md`。
- **排期**：+0.06 人周，没有系统线、安全线与 Agent 线增量。
  - W4 +0.02（桌面）：辅助进程的上限、超时与 C42 两组 0.02，图像类型判定的移植 0.01，常驻启停与崩溃处理不再需要 −0.01。
  - W16 +0.03、W13 +0.01（设计；W10 与 W3 的落点按 ADR-136 改派）。
  - `14` §14.3.4 与 ADR-133 第 93 轮补记一致：WBS 123.71，余量 系统 0.12、Agent 0.14、桌面 0.22、设计 0.26、安全 0.12；依赖链 19.91；增 1 人 129.70 / T 23.95 / 33 周（新人约 2.46 人周）；**M1 维持 38 周**。
  - 本轮低于约 0.2 人周的顺延评估线；桌面线与设计线的余量合计由 0.55 降到 0.48，系统线、安全线与 Agent 线仍在改派阈值上。

## 第 94 轮对抗评审（全范围）后的跨文档决策（ADR-222）

## ADR-222 文件辅助进程的读取合并为一次启动并取定开销预算、读取凭据不论工具都出同一张审批卡、`.kept-*` 并入清除的保留清单且观察器按每种截断情形删除全文文件 — Accepted（R94 全部条目与评审结论中的观察；Amends ADR-221、ADR-220；Amended by ADR-223、ADR-228、ADR-239）

选择原则（收敛规则，同 ADR-186–221）：只用三种办法关闭条目——(1) 把说法改弱但为真；(2) 删除或推迟不属于 M1 主循环的机制；(3) 在已有的唯一定义处加至多一条守卫、一行或一个字段。本轮九条都是次要，优先复用已有机制：
- 辅助进程的开销仿照 git 垫片的“单次预算 + SP 实测 + 超出时的回退”一行（`13` §13.11.1），并把一次 `read` 的三次操作合并为一次启动；
- 读取凭据复用 bash 已有的 `secrets.access` 单向门审批卡，文件工具与 bash 同一规则，不新增信号、级别或决定种类；
- M1 的反复失败与写入中途失败如实写出，不扩展 S1、不改为临时文件加改名；
- `.kept-*` 并入已有的“人的工作现场”（`09` §9.12.4）与 `tower_data`（`16` §16.1.6）。

不新增状态、事件类型、表、列、命令、决定种类、Needs-You kind、landmark 或常驻进程。安全不变式全部保留：文件工具的访问仍在访问那一刻由 S2 判定（合并启动不改变这一点），硬底线、密钥路径表与上下文文件名的写拒绝不变；读取凭据由“只记 chip 的 forbid”改为与 bash 相同的审批卡，访问本身仍被 S2 拒绝，信号更强；经批准的目标只认相等，比“包含”更严；观察器删除前校验路径，校验不过的不删除。安全问题只写到设计层面。

**Pi v1.2.0 核实**（`git show v1.2.0:<path>`；`packages/coding-agent/src/` 下）
- **一次调用的操作顺序**：`read` 依次 `ops.access`、`ops.detectImageMimeType`、`ops.readFile`（`core/tools/read.ts:127, 129, 135/155`），默认 `access` 为 `R_OK`（`:59`）；`edit` 依次 `access`、`readFile`、`writeFile`（`edit.ts:176, 186, 198`），默认 `access` 为 `R_OK | W_OK`（`:95`），失败时把 `error.code` 写进 “Could not edit file”（`:179-181`）；`write` 依次 `mkdir`、`writeFile`（`write.ts:78, 82`）。`read` 在中止时立即拒绝（`read.ts:116-119`）。
- **bash 全文文件**：输出超过 50 KB 或 2000 行时就已建出临时文件（`output-accumulator.ts:72-73, 239-242`，前缀 `pi-bash`，`bash.ts:424`；文件名 `<prefix>-<16 位十六进制><ext>`，`utils/output-files.ts:17-19`）；路径在每种截断情形下都在 `details.fullOutputPath`（`bash.ts:343`）与文本末尾的 “Full output: <path>”（`:348-352`）中；`structuredContent.full_output_path` 只在超过 `STRUCTURED_OUTPUT_MAX_BYTES = 1 MB` 时出现（`:24, 390-396`）；超时、中止与无退出码时抛错、没有 `details` 与 `structuredContent`（`:371-388`）；非零退出码时照常返回 `details`（`:400-406`）。
- **codemode**：`extensions/codemode/execute.ts:340` 是 `spillOutput` 写出的文本溢出文件（`pi-codemode-*.txt`），`:369` 才是图像；MCP 二进制资源在 `extensions/mcp/tools.ts:71`。ADR-221 把 `:340` 写作图像，本轮改正。

**条目（R94 追问清单）**
- **R94-D5-01**（辅助进程规格的三处余项）：**唯一定义** `11` §11.3.1 使用时强制：
  - (1) 改弱为真：**M1 不另行检测反复失败**，每次失败只返回一个错误结果，与 Pi 自己的文件工具报错相同；`07` §7.7.1 的 S1 只看 bash 的退出码。不把 S1 扩到文件工具。
  - (2) 写入在进程启动之后失败时（超时、崩溃、回复不合规，或 Host 崩溃使它读到标准输入的结束）工具结果另写“文件可能已部分写入，请重新读取后再改”；超时杀的是进程组。**不采用**临时文件加改名：改名会把符号链接与硬链接换成普通文件、丢掉文件原有的权限位，被杀时还会把临时文件留在卫星中、进入下一个检查点；Pi 自己的 `fs.writeFile` 同样不原子。
  - (3) S0 下没有辅助进程，`operations` 在 Host 中以 Node 的 `fs` 执行：16 MB 上限适用（读取前按大小、写入按长度判定），10 s 超时不适用。`05` 骨架注释、`00` §0.5.1、`16` §16.2.8 同步。
- **R94-D6-01**（③ 的重启路径与卫星丢失一行的顺序）：`06` §6.1.6 卫星丢失一行补一条排除——`human_checkout.syncState='syncing'` 的 Goal 不触发本行，重启时先由人工编辑检出一行续写，续写因卫星已不在而失败时按 §6.4.3 ③ 转入重建；运行时 ③ 持 `wtLock` 期间自己的改名产生的事件不触发本行，事务提交之后按提交后的状态重新判定（这时已置 `satellite_rebuilding=1`）。所以不出现情形 E 先于续写重建、带回时撞 `goals` CHECK 的顺序。
- **R94-D8-01**（`write_back_failed` 在“继续”路径上不关闭）：`08` §8.4 的关闭事件补“该 Goal 此后成功执行的 `goal.resume` 与 `goal.take_over`”（含检出丢失之后的“继续”“再次接管”，以及人自己删掉副本之后的同一出口），以 `obsolete` 关闭；条目中“你的副本保留在原路径”限定为生成时的情形（`06` §6.4.3 ④）。
- **R94-D10-01**（辅助进程没有开销预算）：
  - **减少启动**（`11` §11.3.1）：`access` 时由一个 `/bin/sh` 先 `test -e`、再 `test -r`（`edit` 另加 `-w`），然后 `exec /bin/cat` 交回整份内容，同一次调用随后的 `detectImageMimeType` 与 `readFile` 直接用这份内容；`write` 的 `mkdir` 只记下目录，由写入的同一个进程 `mkdir -p`。一次 `read` 一次启动、`write` 一次、`edit` 两次（原为三、两、三）。访问仍在该进程打开文件的那一刻由 S2 判定。
  - **预算**（`13` §13.11.1 新增一行，`16` §16.2.7 登记）：单次启动的额外开销 p95 ≤ 30 ms（⚫）；SP6a A3 另测一项回填（测量，不是闸门，在 SP6a 已有的 6 天之内）；超过 60 ms 时回退为同一批并行调用中同时等待启动的读取共用一次启动。`16` §16.2.8 的回填依据由 E7 改为 E6。
- **R94-D11-01**（必然拒绝使文件工具读取凭据只剩 chip）：**唯一定义** `11` §11.3.1 “S2 必然拒绝的访问不询问”加一条例外，取评审方案之外、指示所选的一致规则：**读取凭据不在本条之内**——读取一侧命中密钥路径表、写入一侧（若有）不落在拒绝范围的文件工具调用不带 `hardFloor`，照常归 `secrets.access`，与 bash 读取凭据出同一张单向门审批卡；S2 下这张卡（不论来自哪个工具）写明“S2 下批准也不会让沙箱允许这次读取（M1）”。人拒绝时不发生访问；批准时 S2 照常拒绝，按“经批准的目标”只记 severity 1。ADR-125 的信号因此不因工具而变弱；没有采用评审建议的“forbid 时另记 severity 2 sentinel”，因为那会在 bash 与文件工具之间留下两种告知形态。`04` §4.10.2、`00` §0.5.1、C42 (f)、G46 `~/.aws` 一组同步。
- **R94-D11-02**（经批准的目标的匹配口径）：**唯一定义** `11` §11.6.2 补“匹配口径”：所列路径取批准时求出的字面与 `realpath` 两种形式（与 §11.3.1 比较的规范形式相同），与 `target` 按 `16` §16.1.6 的同一规范化写法比较，任一形式相等即算；只按相等、不按包含，所列为目录时只覆盖对该目录本身的拒绝。G46 `~/.aws` 链接组的期望写明“所列路径的 `realpath` 与 `target` 相等”。另把“这一条实际只作用于 bash”改为真（观察 4）。
- **R94-D12-01**（`.kept-*` 没有同步到清除、目录树与类别）：
  - `09` §9.12.4 “人的工作现场”按名字形状统一保留并列出 `_human/<goalId>.kept-*`、`_inspect/<goalId>.kept-*`、`<wtRoot>/<goalId>.kept-*` 与 `_gitdirs/<goalId>.kept-*`，默认位置与回退位置都如此；“清除一个 Goal”“清除全部”与回退位置的例外都引用这一条，所以回退位置下的“清除全部”不再删除人在写回期间保存的改动；`06` §6.1.6 隐私清除续做一行同步。
  - `06` §6.6 目录树补三类目录；`16` §16.1.6 `tower_data` 补卫星与 gitdir 的 `.kept-*`，不随位置变化（ADR-201）。
  - `10` §10.2 把“清除都不认领它”改为“清除都不删除它（结果列出）”。
- **R94-D12-02**（观察器只删除超过 1 MB 的全文文件）：**唯一定义** `07` §7.2.2 `fullOutput` 注释：路径取 `details.fullOutputPath`（截断的每种情形都有）；超时、中止与无退出码时只取 Pi 附在错误文本末尾、状态行之前的 “Full output: <path>”；删除前校验它是 `os.tmpdir()` 的直接子项、名字为 `pi-bash-<16 位十六进制>.log`，不跟随链接，校验不过的不删除（Agent 输出中伪造的路径因此删不到别处）；S0 下同样删除（观察 7）。`07` 的 `full_output_path` 注释、`11` §11.7.1 残余、`09` §9.12.4 的隐私说明与 D61 随之改为真；残余清单补 codemode 的文本溢出文件，改正 `execute.ts:340`。
- **R94-D14-01**（G46 文件工具组与 C42 (d) 的换链接时序）：取评审的第一种方案——C42 (a)–(d) 与 G46 文件工具组的换链接都由测试构建中的钩子在分类之后、该次调用的辅助进程启动之前完成（Tower 的 `operations` 在启动辅助进程之前调用它，只存在于测试构建中），期望为访问被 S2 拒绝、工具报错、记 `sandbox_violation`（`user_checkout`、`credential`，都是 severity 2）；(d) 改为由仍在运行的后台进程按钩子的信号换链接；另加“调用发出之前就已换好”的一组，期望与唯一定义一致：写入按必然拒绝直接返回说明、不记 `sandbox_violation`，读取凭据出 `secrets.access` 审批卡。两处旧期望登入 `16` §16.1.13。

**评审结论中的观察（R94 结论部分）**
- 观察 1：Host 崩溃时正在写的辅助进程读到标准输入的结束、写完已收到的部分后退出，并入 R94-D5-01 (2) 的同一句。
- 观察 2：`11` §11.3.1 写明先 `test -e` 再 `test -r`/`-w`，分别对应 `ENOENT` 与 `EACCES`（`cat` 被沙箱拒绝同样对应 `EACCES`）。
- 观察 3：`11` §11.3.1 补“`read` 的辅助进程只读，中止后由 10 s 超时收回”。
- 观察 4：`11` §11.3.1 要求同一份路径数据显式包含 Seatbelt 基础档允许读取的系统路径，并如实写出 `read` 的名字变体取最严格者可能挡掉一次本可成功的读取；§11.6.2 的“实际只作用于 bash”改为真。
- 观察 5：`06` §6.4.3 ③ 的改名本身失败时不置标记、不重建，只生成 ④ 的条目并写明工作目录未恢复；① 的 `renameat` 遇到原路径已存在时旁路目录按 `10` §10.2 改名保留并列出（§10.2 由两处改为三处），条目不写“重新建立的”；工作目录与 gitdir 用改名之前取一次的同一时间。
- 观察 6：`13` §13.11.1 人工编辑检出一行改为“交还与检验带回：两次求树（第二次沿用同一临时索引的 stat 缓存）”。
- 观察 7：S0 下观察器同样删除，Pi 截断提示所指的文件随之不在（R94-D12-02）。
- 观察 8：① 也失败时条目写“此后不可恢复”，并写明 T1 只是影子中不被引用的对象、影子 gc 的宽限期之后删除（`16` §16.2.6）。
- 观察 9：`04` §4.6.7 写明目标页右栏末尾的 `保留的目录` 一行；`10` §10.2 写明告知它的是该次结果（交还或带回的成功提示，或 `write_back_failed` 条目）；G31 “还原也失败”一组补断言旧卫星与 gitdir 改名为 `.kept-*` 并列出。
- 观察 10：`10` §10.2 的旧理由改为真：中断的删除若发生在删除前比较之前，其中可能有写回期间保存的改动，它不被删除，移到一边后仍在 `.kept-` 目录中。
- 观察 11：`16` §16.1.13 第 93 轮一行的“一律”限定为“Tower 在写回成功之后删除时（人显式丢弃时不比较）”；ADR-221 标题中的“一律”按此读。
- 观察 12：`04` §4.6.7 改为“原来的工作目录仍在原位时改名保留在 <路径>”。
- 观察 13：ADR-133 第 93 轮补记的落点改为“安全线的 W10 与系统线的 W3”（W6 上只有不足 0.01 的观察器删除），与 `14` §14.3.4 及 ADR-221 末段一致。
- 观察 14：`04` §4.10.2 改为“文件工具与 bash 出同一张卡……文件工具的其他沙箱必然拒绝的读写不出审批卡”，随 R94-D11-01。

**删除 / 推迟**
- 删除：一次 `read` 三次、`edit` 三次、`write` 两次启动；“反复失败由 `07` §7.7.1 处理”；S2 下文件工具读取凭据的 forbid 与只记 chip；“只在批准能起作用的地方出现”；经批准的目标的“之中”（包含）读法与“实际只作用于 bash”；G46 文件工具组“完成换法后再调用”与 C42 (d) 的 `sleep 1` 后台换法；“终态 Goal 仍留有的这类目录有四种”与回退位置下只保留 `_human`、`_inspect`；观察器只按 `full_output_path` 删除；`execute.ts:340` 的“图像”；§10.2 的“只有两处”与“两种来源中都没有未交还的改动”；`04` 的无条件改名路径；`13` 的“交还：一次 `add -A` 比较”。
- 推迟：无。
- `16` §16.1.13 补登第 94 轮被取代的说法 1 行，由 (D) 检查；`16` §16.2.7 补辅助进程的启动一行。

- **lint**：全部检查 `--checks rstuvwxyzckdnSeRqpoPiDgKYATFMBOJCH`，exit 0；见 `reviews/round-94-lint.md`。
- **排期**：+0.07 人周，没有系统线、安全线与 Agent 线增量。
  - W4 +0.03（桌面）：读取合并为一次启动与开销预算 0.01，S0 上限与部分写入的文字 0.01，换链接的测试钩子 0.01。
  - W16 +0.02、W13 +0.01、W17 +0.01（设计；W10、W6 与 W3 的落点按 ADR-136 改派）。
  - `14` §14.3.4 与 ADR-133 第 94 轮补记一致：WBS 123.78，余量 系统 0.12、Agent 0.14、桌面 0.19、设计 0.21、安全 0.12；依赖链 19.91；增 1 人 129.78 / T 23.96 / 33 周（新人约 2.46 人周）；**M1 维持 38 周**。
  - 本轮低于约 0.2 人周的顺延评估线；桌面线与设计线的余量合计由 0.48 降到 0.40，系统线、安全线与 Agent 线仍在改派阈值上。按当前每轮 0.06–0.07 的速度，桌面与设计两线约三轮之后也会降到改派阈值附近，届时须在改派、削减 ③ + ⑤ 与再顺延之间显式选择。

## 第 95 轮对抗评审（全范围）后的跨文档决策（ADR-223）

## ADR-223 S2 拒绝创建硬链接并由启动自检探测、读取凭据卫星内外同一规则且卡上的 S2 句子按路径数据加条件、观察器的全文路径取自流式更新并在复制之前校验、带回一侧的写回失败条目可以“知悉” — Accepted（R95 全部条目与评审结论中的观察；Amends ADR-222、ADR-221；Amended by ADR-224、ADR-225、ADR-227）

选择原则（收敛规则，同 ADR-186–222）：只用三种办法关闭条目——(1) 把说法改弱但为真；(2) 删除或推迟不属于 M1 主循环的机制；(3) 在已有的唯一定义处加至多一条守卫、一行或一个字段。本轮四条都是次要，优先复用已有机制：
- 硬链接复用 S2 档位已有的写拒绝写法与 SP6a A3 的“应被拒绝”探测，平台不能保证时复用已有的 S0 与 ADR-022 授权路径，不新设回退；
- 卫星内的凭据读取复用 ADR-222 的同一张 `secrets.access` 审批卡；
- 观察器复用 Pi 流式更新中已有的 `details.fullOutputPath`，校验复用 ADR-222 的同一条；
- `write_back_failed` 的“知悉”复用 `needs_you.dismiss`（条目不是阻塞类）。

不新增状态、事件类型、表、列、命令、决定种类、Needs-You kind、landmark 或常驻进程。安全不变式全部保留并取更严：S2 与同范围的沙箱拒绝创建硬链接，不按源路径区分；平台做不到时本机不使用 S2，而不是以路径规则不完整的 S2 运行；卫星内的凭据读取由 silent 改为单向门审批卡；第 3 条硬底线先于读取凭据的例外；观察器在复制之前就校验，校验不过的既不复制也不删除；卡上只写为真的后果。安全问题只写到设计层面。

**Pi v1.2.0 核实**（`git show v1.2.0:<path>`；`packages/coding-agent/src/` 下，`packages/agent/src/` 另注）
- **bash 的流式更新**：`emitOutputUpdate` 以累加器的快照发出 `onUpdate({content, details:{truncation, fullOutputPath}})`（`core/tools/bash.ts:282-293`），`finishOutput` 在抛错之前再发一次（`:332`）；`snapshot({persistIfTruncated:true})` 的 `fullOutputPath` 是累加器自己的临时文件路径（`output-accumulator.ts:91-118`）；Agent 循环把它作为 `tool_execution_update` 的 `partialResult` 发出（`packages/agent/src/agent-loop.ts:779-786`）。只有截断时错误文本才附 “Full output: <path>”（`bash.ts:342-353`），超时与中止时错误文本是输出加状态行（`:371-380`）。
- **MCP 截断全文**：模型可见文本的上限 `MCP_OUTPUT_MAX_BYTES = 20 KB`（`extensions/mcp/tools.ts:51`），超出时全文经 `saveToTempFile` 写入 `pi-mcp-*.txt`，路径在 `details.fullOutputPath` 与文本中（`:60-61, 70-71, 183-199`），位置为 `os.tmpdir()`（`utils/output-files.ts:17-19`）。
- **`edit` 的错误文字**：`access` 抛出的错误带 `code` 时只写 “Error code: <code>”（`edit.ts:176-181`）。

**条目（R95 追问清单）**
- **R95-D11-02**（同卷硬链接）：**唯一定义** `11` §11.6.2 新增“硬链接”一行：与钥匙串一行同一范围的沙箱（Agent 的 S2——含文件辅助进程——、验证器、检验检出的服务与生命周期脚本）拒绝创建硬链接，不论源与目标；macOS 以 Seatbelt 的硬链接操作（`file-link`）或等价规则写入档位，确切写法以 SP6a A3 的探测为准；Linux（M2）同列为 M2 决定点。卫星中原有的文件从不硬链接（ADR-021），所以“经链接原地写”只经符号链接到达、由 S2 在打开时判定。影响如实写出：pnpm 的 `auto` 在 APFS 上先写时复制、不受影响，不支持写时复制的卷上退回逐文件复制（变慢、多占磁盘）；git 写对象时退回改名。SP6a A3 补硬链接一组；`06` §6.7 启动自检在后台做一次同样的探测，完成之前不启动使用沙箱的 Run 与验证；创建未被拒绝时本机不使用 S2，各 Goal 走 S0 与 ADR-022 的授权路径（`04` §4.8.5），验证结果带“S0 环境”限定。`11` T3 的残余补一句（沙箱外建立的硬链接不在此列）。
- **R95-D11-01**（读取凭据例外的适用范围）：
  - (1) `11` §11.3.1 伪代码改为一条与卫星内外无关的规则：`read` 或 `edit` 的读取一侧命中密钥路径表 → 追加 `secrets.access`（删去卫星之外一支的括注）；卫星中未跟踪的 `.env` 等因此与 bash 的 `cat .env` 出同一张卡。C42 (f) 补卫星内一组与主检出一组。
  - (2) 同一条写明先后：§11.3.3 第 3 条硬底线先于例外，例外只撤去本条所加的 `hardFloor`，命中第 3 条的调用照常 forbid、不出卡。
  - (3) “卡上的 S2 句子”成为唯一定义：只在求出的读取路径都在 S2 读拒绝范围时写“S2 下批准也不会让沙箱允许这次读取”（文件工具的这类调用都是）；其余 bash 的 `secrets.access`（环境、钥匙串、密码管理器）改写批准后实际发生什么。`04` §4.10.2、`12` §12.12 引用。
- **R95-D12-01**（观察器复制所用的路径）：**唯一定义** `07` §7.2.2 `fullOutput` 注释：超时、中止与无退出码时取该调用最后一次 `tool_execution_update` 的 `details.fullOutputPath`（Agent 伪造不了），错误文本只作对照、不同时不取；复制与删除共用同一次校验与同一次不跟随链接的打开，校验不过的既不复制也不删除。`05` D61 改为真；`11` §11.7.1 残余、`09` §9.12.4 与 `00` §0.5.1 补 MCP 截断结果的全文。
- **R95-D8-01**（带回一侧的 `write_back_failed` 无法关闭）：`08` §8.8 该行的“知悉”接到 `needs_you.dismiss`（条目不对应任何暂停原因，不是阻塞类；检验目录或副本已不在、再次带回与关闭检验都返回 `E_STATE` 时也可用）→ `informative`，“你的副本仍在原路径”改为生成时的限定；`goal.resume`/`goal.take_over` 与 §8.4 所列其他不经出口的事件 → `obsolete`；§8.4 的 `obsolete` 限定为不经本条目出口发生的事件（L495 的先后规则不变）。没有采用“检验目录不在时自动以 `obsolete` 关闭”：① 失败时条目正是告诉人改动已不可恢复的那一条，自动关闭会丢掉这一告知。

**评审结论中的观察（R95 结论部分）**
- 观察 1：`11` §11.3.1 写明缓存按调用作用域——Tower 包装三个工具的 `execute`，每次调用以新的 `operations` 构造该次的工具定义；`05` 骨架注释同步。
- 观察 2：同一条写明 `cat` 的其他失败映射为 Pi 默认实现的错误码（如 `EISDIR`）；超时、启动失败、崩溃、回复不合规与 16 MB 的失败以不带 `code` 的错误抛出；S2 下上限在交回的字节流上执行，S0 下以有上限的读取循环判定（FIFO 在 S0 下没有时限，如实写出）。C42 (g) 补断言。
- 观察 3：`13` §13.11.1 文件辅助进程一行写明回退的按调用语义与 A3 的基线（不经包装的同一命令）；`14` A3 同步。
- 观察 4：`10` §10.16.2 情形 E 的触发处引用 `06` §6.1.6 卫星丢失一行的排除。
- 观察 5：`06` §6.4.3 ③ 只有一半改名成功时按改名成功处理（置标记、重建，另一半在重建之前同样改名）；带回时 ③ 的事务提交之后解除对 I2 的抑制、按提交后的状态重求指纹。
- 观察 6：`06` §6.1.6 卫星丢失一行改为 `syncing` 期间的任何事件都不触发，清除 `syncing` 的事务之后按提交后的状态重新判定。
- 观察 7：`06` §6.1.6 “Agent 后台进程”一行写明它是“在接受 UI 命令之前”的例外：后台执行，完成之前实况行 `清理中 · 残留进程 · <剩余>/<总数>`（`12` §12.6.4 新增一行），该 Goal 的 Run 在清理结束之后才准入，`goal.take_over` 返回 `E_BUSY`；`13` 改为引用。
- 观察 8：`04` §4.6.7 补 ③ 改名失败与 ① 也失败两个分支的提示。
- 观察 9：`04` §4.5.2 右栏与 §4.5.3 写明 `保留的目录` 在各状态都显示；`04` §4.6.7 的范围按 `10` §10.2 所列各处。
- 观察 10：`12` §12.12 改为“注入机密的 `secrets.access` 批准卡片”属 M2，并登记读取凭据卡上的 S2 句子。
- 观察 11：`13` §13.11.1 与 `07` §7.4.3 的预取显示改为验证时 verifying 的 `预取`、Goal 启动时并入 preparing 的 `依赖`。
- 观察 12：`04` §4.15 隐私清除确认框补 `.kept-*` 目录。
- 观察 13：`11` §11.3.1 密钥路径表写明无锚定的模式只在卫星工作区（按跟踪状态）与 Pi 资源目录中匹配，不作用于系统路径、`$SH` 与镜像 `objects/`。

**删除 / 推迟**
- 删除：伪代码中只在卫星之外附加读取凭据的括注；“S2 下这张卡（不论来自哪个工具）”的无条件句；观察器超时与中止时“只取”错误文本末尾的路径、只在删除之前校验；D61 “超时与中止时只在错误文本中”；“你的副本仍在原路径，处置只是确认”与没有命令承载的“知悉”；只对 ③ 自己的改名重新判定；“完成前相关 Goal 显示‘正在清理残留进程’”；`准备中 · 预取`；S0 下“读取前按文件大小”判定上限。
- 推迟：无。
- `16` §16.1.13 补登第 95 轮被取代的说法 1 行，由 (D) 检查。

- **lint**：全部检查 `--checks rstuvwxyzckdnSeRqpoPiDgKYATFMBOJCH`，exit 0；见 `reviews/round-95-lint.md`。
- **排期**：+0.05 人周，没有系统线、安全线与 Agent 线增量。
  - W4 +0.02（桌面；W10 的落点按 ADR-136 改派）：硬链接拒绝、启动自检的探测与本机不使用 S2 的接线。
  - W16 +0.02、W13 +0.01（设计；W10 与 W6 的落点按 ADR-136 改派）。
  - `14` §14.3.4 与 ADR-133 第 95 轮补记一致：WBS 123.83，余量 系统 0.12、Agent 0.14、桌面 0.17、设计 0.18、安全 0.12；依赖链 19.91；增 1 人 129.83 / T 23.97 / 33 周（新人约 2.45 人周）；**M1 维持 38 周**。
  - 本轮低于约 0.2 人周的顺延评估线；桌面线与设计线的余量合计由 0.40 降到 0.35，与 ADR-222 末段的判断相符。按每轮 0.05–0.07 的速度，约两到三轮之后这两条线也会降到改派阈值附近，届时须在改派、削减 ③ + ⑤ 与再顺延之间显式选择。

## 第 96 轮对抗评审（全范围）后的跨文档决策（ADR-224）

## ADR-224 回退位置下卫星工作区的除外对一切工具适用、无锚定密钥模式按写允许范围分两侧、每个 Host 进程一个 Tower 拥有的临时目录、启动闸门并入单一启动点与准入、情形 E 先改名保留另一半 — Accepted（R96 全部条目与评审结论中的观察；Amends ADR-223、ADR-221、ADR-218、ADR-159、ADR-082；Amended by ADR-225、ADR-226）

选择原则（收敛规则，同 ADR-186–223）：只用三种办法关闭条目——(1) 把说法改弱但为真；(2) 删除或推迟不属于 M1 主循环的机制；(3) 在已有的唯一定义处加至多一条守卫、一行或一个字段。本轮六条中四条是“新规则遇上已有规则”，每条都改为**一条结构性规则关闭一类问题**，而不是再补一处例外：
- 回退位置下本 Goal 卫星工作区的除外只在密钥路径表的 `~/.tower/**` 一项定义一次，对本 Goal 的一切工具适用（取代只写给沙箱外工具的那一处）；
- 无锚定密钥模式按 Agent 的写允许范围分两侧：之外处处匹配并编入 S2（只有 CA 证书包允许清单除外），之内只作分类、跟踪状态取自 base 树；
- 每个 Host 进程一个 Tower 拥有的临时目录 `~/.tower/tmp/<hostId>/` 作为 Host 的 `TMPDIR`，复用 stdio MCP 空目录的同一生命周期：Pi 的全部输出文件的删除由目录保证，观察器不再追踪流式更新；
- 两道启动闸门并入已有的单一启动点与准入（`waitReason = slot`，与“机器资源”同形），探测失败与“未被拒绝”同一去向；
- 情形 E 重建之前把仍在原位的另一半按已有的 Tower 自动改名保留移开，从不删除。

不新增状态、事件类型、表、列、命令、决定种类、Needs-You kind、landmark、`wait_reason` 值或常驻进程；新增的是一个按 Host 进程的目录（与已有的 stdio MCP 空目录同一实现）。安全不变式全部保留：回退后权限与默认位置相同；Agent 的三种沙箱与安装器安装阶段都拒绝创建硬链接与钥匙串查找；探测未能确认拒绝时不以路径规则不完整的 S2 运行；Pi 的输出文件对三种沙箱读写都拒绝，并且最迟随 Host 退出删除。取更严的一边：凭据形文件在 Agent 写允许范围之外恢复处处匹配；Host 临时目录列入第 3 条硬底线（读写）；回退位置下 Agent 的其余读写项不除外。唯一放宽的一处见下方 R96-D11-03 (2)，理由如实写出。安全问题只写到设计层面。

**Pi v1.2.0 与 Node 核实**（`git show v1.2.0:<path>`；`packages/coding-agent/src/` 下）
- **Pi 的全部输出文件都经同一个函数写在 `os.tmpdir()`**：`utils/output-files.ts:17-20`（`join(tmpdir(), <prefix>-<16 位十六进制><扩展名>)`，`:19`）、`:23-28`（`writeOutputFile`，0600、`wx`）、`:31-34`（`createOutputFileStream`）。调用者只有：bash 的累加器 `core/tools/output-accumulator.ts:249`（前缀取 `bash.ts:424` 的 `pi-bash`，扩展名 `.log`）、MCP `extensions/mcp/tools.ts:70-71`（`pi-mcp`，截断全文与二进制资源，`:180-199`）、codemode `extensions/codemode/execute.ts:338-341`（溢出文本）与 `:369`（图像）、交互模式的 `core/bash-executor.ts:66`（SDK 宿主不用）。
- **Node 的 `os.tmpdir()`** 每次调用时读取进程环境，POSIX 上依次取 `TMPDIR`、`TMP`、`TEMP`，都没有时为 `/tmp`（Node 文档；本机 Node v26.10.0 实测：`TMPDIR=/tmp/xyz/` 得 `/tmp/xyz`，去掉 `TMPDIR` 而设 `TMP` 得 `TMP` 的值，进程中改写 `process.env.TMPDIR` 后立即生效）。所以 Host 环境的 `TMPDIR` 决定这些文件的位置。
- **bash 的子进程不继承 Host 的 `TMPDIR`**：Pi 以 `getShellEnv()` 的整个 Host 环境起步（`core/tools/bash.ts:193`），再交给 `spawnHook`（`:211`）；Tower 的 `bashEnv` 只输出白名单与 `16` §16.8 角色 A 的变量，`TMPDIR` 显式取 Agent 的 `$TMPDIR/tower-<goalId>/`（`05` §5.3.6）。
- **观察器的路径**：最终 `details` 只在截断时带路径（`bash.ts:342-343`）；临时文件按原始字节数、解码后字节数或行数任一超限建立（`output-accumulator.ts:64-89, 239-243`），可以在 `finish()` 中才建立；超时、中止、无退出码时抛错、没有最终 `details`（`bash.ts:371-388`）。两种 Pi 一侧的边缘与 Host 预合并、背压下的流式更新都不再影响删除。

**条目（R96 追问清单）**
- **R96-D11-01**（重要；回退位置下卫星内的每次读取都归 `secrets.access`）：**唯一定义** `11` §11.3.1 密钥路径表的 `~/.tower/**` 一项：`<wtRoot>` 回退时，本 Goal 的卫星工作区（§11.6.2 回退位置例外中 Agent 读写项的第一项）不因这一项命中，对本 Goal 的一切工具——文件工具的分类、bash 按参数路径的分类、沙箱外工具的路径检查——与默认位置相同；只对本 Goal 的调用，表中其他条目与第 3 条硬底线照常。回退位置下 Agent 的其余读写项（gitdir、`_stores/<goalId>/`、`$SH`、垫片目录）不除外，按路径读取时比默认位置多一次 `secrets.access`（更严，如实写出）。§11.3.4 (2) 只保留本 Host 的 stdio MCP 空目录的定义、引用前者；`10` §10.4.3 的第三处改为这一条；伪代码注释同步。C42 (f) 补回退位置一组（普通文件 `read.worktree`、未跟踪 `.env` 出同一张卡）；G46 (bk) 回退一组补文件工具与 `cat`；SP6a A3 回退位置一组补同样的读取。
- **R96-D11-02**（硬链接与钥匙串两行的范围漏掉安装器的安装阶段）：`11` §11.6.2 钥匙串一行的列举成为“运行 Agent 可影响内容的沙箱”的唯一清单并补入安装器的安装阶段（运行 `.pnpmfile.cjs` 与依赖的构建脚本；断网挡不住本机的进程间通信）；预取阶段只运行 Tower 内置预取器，不在此列。硬链接一行引用该清单。`07` §7.4.3 阶段 3、T7 的缓解措施补一句；SP6a A3 硬链接一组与启动探测补安装阶段的档位。pnpm 在两种角色中都配置 `clone-or-copy`（`16` §16.8），不受影响。
- **R96-D11-03**（无锚定密钥模式的作用范围）：**唯一定义** `11` §11.3.1 密钥路径表“这些无锚定模式的作用范围”：
  - (1) 撤回 ADR-223 在卫星之外的收窄：Agent 写允许范围之外处处匹配、不论跟踪状态，编入 S2 读拒绝与必然拒绝的路径数据；只有 CA 证书包允许清单除外——`/etc/ssl/cert.pem`、`/etc/ssl/certs/**`（macOS 为 `/private/etc/ssl/…`）、Homebrew 的 `<前缀>/etc/ca-certificates/cert.pem` 与 `<前缀>/etc/openssl@*/cert.pem`、`$SH` 中由 Tower 写入的 `cacert.pem`、`cert.pem`、`ca-bundle.pem`；钥匙串文件不在其中；Linux 的清单是 M2 决定点。卫星之外的凭据形文件因此重新归 `secrets.access`（S2 下出带 S2 句子的单向门卡，S0 与沙箱外工具下按单向门询问）。
  - (2) 写允许范围之内（卫星工作区与 gitdir、`_stores/<goalId>/`、Agent 的临时目录）只作分类、不编入 S2；卫星的跟踪状态取自本 Goal 的 base 树（生成 `policy.json` 时列出 base 树中名字命中的被跟踪路径），不取卫星索引、检查点或 pin。所以 Agent 自己写出的 `id_*`、`*.pem` 一类经单向门卡批准即可读，不产生 `sandbox_violation` 与误报的凭据哨兵；Agent 运行的程序读取它们照常成功。**这是对 ADR-078/082 “卫星中未跟踪 env 不可读”的放宽**：卫星中不播种含机密的本地文件（ADR-165），名字形如凭据的未跟踪文件只会由 Agent、它运行的工具或人交还时写入，S2 对它们的读拒绝只拦住 Agent 读自己写的东西，却使依赖 `node_modules` 中 `*.pem` 夹具的测试失败。代价如实写出：名字恰好命中的普通新文件（如 `id_utils.ts`）每次经文件工具或 `cat` 读取都要批准，spike、依赖升级与调研三种预设下被拒绝。卡上的 S2 句子按已有的条件不出现在这类卡上；致命三要素的“私有数据”同步。
- **R96-D6-01**（两道启动闸门不在准入之中）：`06` §6.2.4 单一启动点 `startAgentActivity` 有一道启动闸门：本次启动的硬链接探测有结果之前不启动任何使用沙箱的活动；准入补检查 h（探测有结果、且本 Goal 的重启清理已完成终止的一轮），不满足时 `waitReason = slot`，卡片注明“等待启动自检”或显示 `清理中 · 残留进程`（与检查 d 的“机器资源”同形，不新增 `wait_reason` 值）；启动时自动解除与 `goal.resume` 照常执行，Goal 在 `ready{slot}` 中等待；验证、安装器与检验检出留在各自的队列中（`12` §12.6.5 `等待启动自检`）。`06` §6.7：探测以 Agent、验证器、检验检出与安装阶段四种档位模板各一次，合计 10 s，出错、超时或任一档位无法启动都按“未能确认拒绝”处理，与未被拒绝同一去向（本次启动不使用 S2，不重试，下次启动重新探测）；`13` §13.11.1 补一行。“清理结束”指终止的一轮完成，存活者按 `bg_process_survived` 照常处理、不阻挡准入（`06` §6.1.6 后台进程一行）。
- **R96-D13-01**（只丢了一半的卫星）：**唯一定义** `10` §10.16.2 情形 E 的“另一半”：工作目录与 gitdir 之一仍在原位时，在置 `satelliteRebuilding` 的事务之前（自动重建、人发起的重试与写回失败的 ③ 相同）先按 §10.2 “Tower 自动改名保留”改名为 `<原名>.kept-<时间>`，从不删除（其中可能有未解除的外部写入）；改名失败时不重建、按重建失败升级。所以重建与崩溃续做的原路径上只会有重建自己的目录。§10.2 的“三处”改为四处；`06` §6.4.3 ③ 与 §6.1.6 重建中途崩溃一行改为引用。
- **R96-D12-01**（观察器依赖可合并、可丢弃的流式更新）：**唯一定义** `05` §5.3.6 临时目录一行：每个 Host 进程一个 Tower 拥有的临时目录 `~/.tower/tmp/<hostId>/`，经 Host 环境的 `TMPDIR` 交给 Host，`host.spawn` 时新建、Host 退出后删除、启动恢复时删除不属于存活 Host 的残留，与 stdio MCP 空目录同一规则（`11` §11.3.4 (a)）；`bashEnv` 显式设 Agent 的 `TMPDIR`；它在 `~/.tower/**` 之下，三种沙箱都拒绝读写，并列入第 3 条硬底线（读写）。`07` §7.2.2：观察器只按 `tool_execution_end`（立即转发、永不丢弃）的最终 `details.fullOutputPath` 复制，校验路径是承载本 Run 的 Host 的临时目录的直接子项；超时、中止与无退出码时不复制、全文取错误文本；没有复制的文件随 Host 的临时目录删除。`06` §6.1.6 与 §6.6.1、`10` §10.1.2 的“启动时清空 `~/.tower/tmp/`”保留存活 Host 的目录。隐私残余（`11` §11.7.1、`09` §9.12.4、`00` §0.5.1）改为：MCP 与 codemode 的文件随 Host 退出删除，不再留给系统清理；清除时 Host 仍在运行的写明。D61 改为真。G46 (bj) 补一组。

**评审结论中的观察（R96 结论部分）**
- 观察 1：`06` §6.7 写明探测未通过时 S0 卡片的原因 `本机的沙箱未通过启动自检（硬链接）`（`04` §4.8.5 原因一行），设置页诊断与诊断包列出各档位的结果；两次启动之间由 S0 转回 S2 时 Tower 解除 `s0_grant_pending`（条目 `obsolete`，`08` §8.8 “任意”一行），以同一 pin 在 S2 中验证（`03` §3.2.1 同步）；由 S2 转为 S0 时启动时重算三要素；`14` §14.3.5 写明自用期中某台机器转入 S0 时自转入之日起按 B 列计并通知负责人。
- 观察 2：`00` §0.5.1 补硬链接拒绝一行（`link()` 的测试、`--local` 克隆、硬链接安装模式）；`12` §12.12 验证失败卡对创建硬链接的 `EPERM` 附一句中性说明，不改变失败的判定。
- 观察 3：`04` §4.6.7 带回一侧的首条提示改为“再次带回，或关闭检验”，“以你交还（或带回）时的内容”，“未能恢复，也未重建”一支补下一步。
- 观察 4：`12` §12.6.4 `清理中 · 残留进程` 取代卡片第二行与排队文案，优先于同时出现的 `写回中` 与 `验证中`，清理期间 `放弃`、`暂停` 与打开检验照常可用；`06` §6.1.6 写明双重故障中同一 Goal 先完成终止一轮、再续写。
- 观察 5：D61 改为“状态行在最后，其前是命令自己的输出”，删去“抛错之前还会再发一次”（观察器不再用它）；S2 必然拒绝的返回文字补“MCP 结果与 codemode 写出的全文文件不能这样重定向，需要时以更窄的参数重新调用该工具”。
- 观察 6：`11` §11.6.2 硬链接一行的影响改为引用 `16` §16.8 的 `clone-or-copy`；SP6a A3 的 pnpm 一项改为“按 `clone-or-copy` 复制”。
- 观察 7：`11` §11.3.1 先后的括注改为“影子、`$TI` 与各 Host 临时目录在 `~/.tower/**` 之下；`$VS` 只在回退位置下才是，两种位置下都按第 3 条”。
- 观察 8：`16` §16.1.13 M1 周数一行的替代文字改为“逐轮增量、当前余量与增人前提以 `14` §14.3.4 为准，本行不逐轮维护”。
- 观察 9：`06` §6.7 写明探测以四种档位模板各一次，与 SP6a A3 的硬链接一组相同。

**删除 / 推迟**
- 删除：观察器取“该调用最后一次 `tool_execution_update`”的路径与错误文本对照（lint (d) 登记 DELETED，ADR-224）；无锚定模式“只在卫星工作区中按跟踪状态匹配”的收窄；“由系统清理临时目录”；只写给沙箱外工具的回退位置除外；启动探测“完成之前”而无去向的写法；“在清理结束之后才准入”；`10` §10.2 的“三处”；③ 中另一半的单独规则；A3 的“未跟踪 env 不可读”；`16` §16.1.13 历史行中逐轮的余量。
- 推迟：无。
- `16` §16.1.13 补登第 96 轮被取代的说法 1 行，由 (D) 检查；ADR-223 一行的新说法列中已被取代的两处改为指向本行。

- **lint**：全部检查 `--checks rstuvwxyzckdnSeRqpoPiDgKYATFMBOJCH`，exit 0；脚本的 DELETED 表补一项；见 `reviews/round-96-lint.md`。
- **排期**：+0.10 人周，没有系统线与安全线增量。
  - W4 +0.04（桌面；W10、W3 的落点按 ADR-136 改派）、W6 +0.01（Agent）、W16 +0.04 与 W13 +0.01（设计；W10、W7-core 的落点按 ADR-136 改派）。
  - `14` §14.3.4 与 ADR-133 第 96 轮补记一致：WBS 123.93，余量 系统 0.12、Agent 0.12、桌面 0.12、设计 0.12、安全 0.12；依赖链 19.91；增 1 人 129.96 / T 23.99 / 33 周（新人约 2.44 人周）；**M1 维持 38 周**。
  - 本轮没有一条线降到改派阈值之下，按规则不顺延；但五条线都已在阈值上，没有可改派的余量。ADR-223 末段预告的显式选择在此作出：按 ADR-136 **顺延、不执行 ③、⑤**。触发条件预先写定——此后任何落在 M1 中、按 WBS 行合计 ≥ 0.01 人周的增量都使 M1 顺延 1 周至 39 周（2027-08-06；第 35 周末冻结，2027-07-09），记入下一条补记，`14` §14.1、§14.3.4 与 `00` 同步（`14` §14.3.4 结论“下一次增量”）。

## 第 97 轮对抗评审（全范围）后的跨文档决策（ADR-225）

## ADR-225 交还与带回不写回 base 未跟踪的凭据形路径、文件工具与 bash 的路径分类先判第 3 条硬底线、准入在启动闸门解除时重算且只重启 Supervisor 时不终止存活 Host 中的 Run、截断的超时证据如实标注、临时目录清空写法同步 — Accepted（R97 全部条目与评审结论中的观察；Amends ADR-224、ADR-223、ADR-201、ADR-167；M1 顺延至 39 周；Amended by ADR-226、ADR-228）

选择原则（收敛规则，同 ADR-186–224）：只用三种办法关闭条目——(1) 把说法改弱但为真；(2) 删除或推迟不属于 M1 主循环的机制；(3) 在已有的唯一定义处加至多一条守卫、一行或一个字段。本轮五条都是次要条目，每条在已有的唯一定义处加一句关闭：
- 交还与带回的写回集合（`10` §10.8.4 第 5 步）另排除名字形如凭据、base 中未跟踪的路径，使 ADR-165 的前提对人一侧成为真；沙箱外工具一侧如实登记为残余，三要素按它计；
- 文件工具与 bash 的路径分类先判第 3 条硬底线、再查密钥路径表（`11` §11.3.3），Pi 的 Full output 文件因此直接拒绝、不出读取凭据卡；
- 准入的重算时机加检查 h 的两个解除事件，重启清理的终止范围限于 Host 已不存在的 Run，探测结果按本机与开机会话缓存（`06` §6.1.6、§6.2.4、§6.7）；
- 截断的超时证据标为“截断的输出（尾部）”（`07` §7.2.2）；
- 四处“启动时清空”的复述与 `07` §7.6.6 的复述改为与唯一定义一致。

不新增状态、事件类型、表、列、命令、决定种类、Needs-You kind、landmark、`wait_reason` 值或常驻进程；新增的只有探测结果在自检日志中的一个缓存键。安全不变式全部保留：Tower 不会自动把机密交给 Agent 可影响的进程；回退后权限与默认位置相同；Agent 的三种沙箱与安装器安装阶段都拒绝创建硬链接与钥匙串查找；探测未能确认拒绝时不以路径规则不完整的 S2 运行；Pi 的输出文件对 Agent 读写都拒绝，并且最迟随 Host 退出删除。取更严的一边：写回集合多排除一类路径，人工编辑检出在其中有这类改动时改名保留、不删除；bash 中路径能求出的硬底线读写在 S0 下也直接 forbid（此前为 ask）；三要素在加载了任何沙箱外工具时计私有数据为真（Tower 无法判定它们是否写文件系统）；探测失败的结果不跨 Tower 启动沿用。安全问题只写到设计层面。

**Pi v1.2.0 核实**（`git show v1.2.0:<path>`；`packages/coding-agent/src/` 下）
- `core/tools/bash.ts:342-352`：截断时工具结果文字末尾写 `Full output: <path>`；`:371-381`：超时与中止时错误文本中同样带这一行。R97-D11-02 与 R97-D7-01 的依据。
- `core/tools/output-accumulator.ts:121-138, 245-252` 与 `utils/output-files.ts:31-34`：流式全文文件以 `wx` 打开，打开失败的错误在 `closeTempFile` 之前没有监听者。所以照旧写法删掉存活 Host 的 `TMPDIR` 会使该 Host 的工具调用失败（R97-D15-01 的后果）。
- `core/extensions/loader.ts:576-579`：扩展以 jiti 加载、只设 `moduleCache: false`（jiti 2.7.0，`package.json:57`），文件缓存取 jiti 的默认位置（观察 9）。

**条目（R97 追问清单）**
- **R97-D11-01**（卫星之内放宽的理由漏算两条路径）：**唯一定义** `10` §10.8.4 第 5 步（写回集合）：名字形如凭据（`11` §11.3.1 密钥路径表的无锚定模式，按 `16` §16.1.12 的名字规则比较）、且在该 Goal 的 base 中未被跟踪的路径，与含机密的本地文件同样排除——不进入 T1、不写回卫星，路径保持 T0（带回为 T_pin）中的版本，在交还（或带回）结果中与跳过的路径一同列出；它们留在人工编辑检出或检验目录中：其中有这类路径与 T0（T_pin）不同时，第 8 步删除前的比较按“不同”处理，该目录改名保留、不删除。§10.8.3 带回的排除列举引用它。`11` §11.3.1 作用范围 (ii) 的理由改为“Tower 自己的路径不把真实凭据放进这里”（不播种 + 不写回），沙箱外工具写入的除外；§11.3.4 路径检查一条登记残余（这类工具写进写允许范围的文件不受 S2 约束，Agent 运行的程序可不经分类读到）；§11.8 私有数据限定为“本 Goal 加载了沙箱外工具时除外，按能写计为真”。`00` §0.5.1 沙箱外工具一行补一句。G46 (bl) 补交还与带回各一组。
- **R97-D11-02**（bash 按 Pi 的提示读取全文文件出读取凭据卡）：**唯一定义** `11` §11.3.3 第 3 条的“分类的先后”：文件工具与 bash 中路径能求出的读写（§11.3.2 按参数路径分类的命令与重定向）先判第 3 条硬底线（含各 Host 的临时目录），命中即带 `hardFloor`（forbid、不出卡、不可授权），不再追加 `secrets.access`；返回文字写明该路径不向 Agent 开放、批准也不会改变，Host 临时目录中的另给出重定向的做法；S2 与 S0 相同。§11.3.1 的“先后”与 `05` §5.3.6 临时目录一行引用它；`00` §0.5.1 写明 Pi 的 `Full output: <路径>` 提示不可用。G46 (bj) 补 `cat` 一读。没有采用在 `tool_result` 钩子中改写该行：它改动 Pi 交回的文字，且只对 bash 有效。
- **R97-D6-01**（启动闸门的唤醒与只重启 Supervisor 时的范围）：(1) `06` §6.2.4 准入的重算时机一行加“本次启动的硬链接探测有结果、某 Goal 的重启清理完成终止的一轮”（检查 h 的两个解除事件）。(2) `06` §6.1.6 后台进程一行（终止范围的唯一定义）改为“Host 已不存在的未结束 Run 的令牌，以及未解决 `bg_process_survived` 的令牌”：只重启 Supervisor 时，main 交回的存活 Host 重新接上，其中进行中的 Run 不终止、不显示 `清理中`，检查 h 照常满足；§6.1.10 崩溃恢复同步。`06` §6.7 探测结果连同键（本机、开机会话、Supervisor 所用沙箱运行时的版本）记入自检日志：只重启 Supervisor 时沿用本次结果，存活 Host 的档位与之对应；Tower 再次启动时键相同且上次“已拒绝”的沿用，键不同或上次未能确认拒绝时重新探测（失败不跨启动沿用，保持“下次启动重新探测”）；只重启 Supervisor 而键已不同时新结果只用于此后启动的活动。`13` §13.11.1 同步。G44 (c) 补一组。
- **R97-D7-01**（超时与中止命令的证据标签）：**唯一定义** `07` §7.2.2 `fullOutput` 注释：超时、中止与无退出码时证据只是 Pi 截断后的尾部加状态行；错误文本带 `Full output:` 一行（曾被截断）时，日志视图与 `O` 的标签写“截断的输出（尾部）”，证据副本中该行注明“（全文未保留）”。标签由已有的 `outcome` 与错误文本推导，不新增字段。`04` §4.7.3 日志一行、`16` §16.3 `O` 一行引用；`00` §0.5.1 新增一行并给出重定向的做法。G46 (bj) 补标签的期望。
- **R97-D15-01**（未同步的复述）：(a) `06` §6.6.4 `tmp/` 一行加存活 Host 的例外并补 `tmp/<hostId>/` 一行（与 `mcp-cwd/<hostId>/` 同形）；`06` §6.6.4 Trace 解压一句、`11` §11.6.4、`16` Tower 的 git 网络命令一行、`10` §10.1.2 改为“清空其中不属于存活 Host 的内容”；G44 (c) 改为“除存活 Host 的 `<hostId>/` 之外为空，存活 Host 的目录与其中的文件仍在”。(b) `07` §7.6.6 改为引用 `11` §11.3.1 密钥路径表的作用范围。旧写法登入 `16` §16.1.13。

**评审结论中的观察（R97 结论部分）**
- 观察 1：`12` §12.6.6 S0 徽标的悬停在整机因启动自检转入 S0 时以 `本机的沙箱未通过启动自检（硬链接）` 为首行；`12` §12.12 的硬链接 `EPERM` 说明限定为验证在 S2 中运行时，并写明不支持硬链接的卷上同样返回 `EPERM`、这句不断言失败原因。
- 观察 2：`10` §10.16.2 只丢了 gitdir 时，未解除外部改动的告知改为“外部改动未并入重建的工作目录，保留在 <路径>”；另一半改名失败时 Needs-You 写出路径与“将它移到一边后重试”；`10` §10.2 列出 `_gitdirs/<goalId>.kept-*` 时注明其中是 Agent 写过的 git 元数据。
- 观察 3：`06` §6.4.3 ③ 改为先按情形 E 改名另一半、再在同一事务中置标记；情形 E 的改名持 `wtLock`，`06` §6.1.6 卫星丢失一行排除它产生的文件系统事件。
- 观察 4：`16` `Goal.waitReason` 一行补启动闸门；`12` §12.6.5 补 `就绪 · 等待机器资源` / `就绪 · 等待服务端口` 一行；`16` 与 `11` §11.7.0 单一启动点改为“唯一的约束是启动闸门”；`16` §16.2.8 自检一行补 10 s；`06` §6.4.3 `goal.rebuild_satellite` 补另一半的改名；`04` §4.10.2 改为“写允许范围之内（如工作目录中）”；`11` §11.6.2 改为“卫星中被跟踪的 env 文件除外”。
- 观察 5：`11` §11.3.1 写明工具自带的 CA 包不在清单中、是否以名字规则收入为 M2 决定点；企业代理的 CA 文件读不到一事登入 `00` §0.5.1（M1 不提供加入允许清单的设置）。
- 观察 6：`05` §5.3.6 `mcpBaseEnv` 直接写“含本 Host 的 `TMPDIR`”；`00` §0.5.1 补 MCP 服务器与扩展写在 Host 临时目录中的文件对 Agent 不开放、随 Host 删除，需要保留时在 `mcp.json` 中指定输出目录。
- 观察 7：`11` §11.8 S0 下的私有数据按显式条目判定，无锚定模式不参与（实际上几乎恒为真）。
- 观察 8：`05` §5.3.6 写明临时目录的删除在 Supervisor 处理完该 Host 已转发的 `tool_execution_end` 之后；打包模式下长寿 Host 的这一目录在退出前没有上限、不在 `13` §13.11.3 的统计之内，如实保留。
- 观察 9：`05` §5.3.6 写明扩展的 jiti 文件缓存随 Host 的临时目录删除、每次 Host 启动可能重新转译，`14` SP2 的冷恢复测量包含这部分；`hostId` 保持短（Unix 套接字路径限 104 字节）。
- 观察 10：`06` §6.7、`11` §11.6.2、`13` §13.11.1 与 SP6a A3 改为三种档位模板（检验检出与验证器同一档位）。
- 观察 11：顺延按 ADR-224 的规则执行，`14` §14.3.4 结论写明同步位置（§14.1、本节、§14.5 E1/E9、§14.8、`16` §16.1.13 当前值、ADR-133 补记；`00` 与 README 不引用 M1 日期）；此后的增量回到 ADR-136 的常规规则，顺延写“至少 1 周，按缺口计”；增人备选写明不随基线顺延、已没有余地（合计超过 130.02 人周时为 34 周）。

**删除 / 推迟**
- 删除：写回集合只按清单排除机密文件的写法；“只由 Agent、它运行的工具或你交还时写入”的全称理由；对 bash 的第 3 条硬底线“只由 S2 保证”；准入重算时机中不含检查 h 解除事件的列举；终止范围中“未结束 Run 的令牌”不论 Host 是否存活；“四种档位模板”；超时证据的“完整日志”标签；四处不带存活 Host 例外的清空写法与 G44 (c) 的断言；“只保证将来能在一处加入调度约束”；③ 中先置标记、后改名另一半；ADR-224 预设的“下一次增量即顺延 1 周”规则（已执行，用完）。
- 推迟：工具自带 CA 包的名字规则与企业代理 CA 文件的允许清单（M2 决定点）。
- `16` §16.1.13 补登第 97 轮被取代的说法 1 行，由 (D) 检查；lint (C) 的容量改为从结论推导、M1 周数与日期的旧值补 38 周一组。

- **lint**：全部检查 `--checks rstuvwxyzckdnSeRqpoPiDgKYATFMBOJCH`，exit 0；见 `reviews/round-97-lint.md`。
- **排期**：+0.04 人周，没有系统线、安全线与 Agent 线增量。
  - W4 +0.01 与 W11 +0.01（桌面；W3 的落点由本行负责人完成）、W16 +0.02（设计；W12 与 W10 的落点由本行负责人完成）。
  - 按 ADR-224 写定的规则（M1 中 ≥ 0.01 人周的增量即顺延），按 ADR-136 **顺延、不执行 ③、⑤**：**M1 由 38 周顺延 1 周至 39 周**（2026-11-09 → 2027-08-06；第 35 周末冻结，2027-07-09；第 36–38 周自用，第 39 周退出评审；M2 至 2027-11-12）。冻结前可用工作周 32.0，各线容量 30.00。
  - `14` §14.3.4 与 ADR-133 第 97 轮补记一致：WBS 123.97，余量 系统 1.12、Agent 1.12、桌面 1.10、设计 1.10、安全 1.12；依赖链 19.91；增 1 人 130.00 / T 24.00 / 33 周（新人约 2.44 人周），不随基线顺延，已没有余地。

## 第 98 轮对抗评审（全范围）后的跨文档决策（ADR-226）

## ADR-226 即时投递按 Host 保留且 drain 在 Host 存活时续做、Host 退出或挂死之后先终止一轮、准入在资源释放时重算、三要素不因沙箱外工具计私有数据、探测缓存键含 Tower 版本、写回的凭据形排除限定于未忽略且未登记的路径 — Accepted（R98 全部条目与评审结论中的观察；Amends ADR-225、ADR-224、ADR-201、ADR-159；M1 维持 39 周，增人备选变为 34 周；Amended by ADR-227、ADR-228）

选择原则（收敛规则，同 ADR-186–225）：只用三种办法关闭条目——(1) 把说法改弱但为真；(2) 删除或推迟不属于 M1 主循环的机制；(3) 在已有的唯一定义处加至多一条守卫、一行或一个字段。本轮八条都是次要条目。第 97 轮有两条规则放得过宽、带来了后果，本轮把它们收窄而不是再加规则：三要素的私有数据不再因加载了沙箱外工具而计为真；写回集合的凭据形排除与改名保留只针对未被忽略、不在本地文件清单中的路径。其余各条在已有的唯一定义处各加一句：
- 即时投递目录的启动清理（`06` §6.1.6 检查点写入中途一行）与 drain 一行的 Host 存活分支；
- 终止范围（`06` §6.1.6 “Agent 后台进程”一行）包括 Host 退出时尚未结束、因而以 `crashed` 结束的 Run，Tower 运行中 Host 退出或挂死之后先执行一轮（`06` §6.1.3）；
- 准入的重算时机（`06` §6.2.4）补检查 d、g 的解除事件；
- 探测缓存键（`06` §6.7）补 Tower 版本与档位模板哈希；
- 复述同步：ADR-038 的〔当前值〕、`11` §11.6.2 的 S0 原因、`10` §10.3.1 与 `13`、`16` 的终止范围。

不新增状态、事件类型、表、列、命令、决定种类、Needs-You kind、landmark、`wait_reason` 值或常驻进程；新增的只有合同编辑器上的一行中性说明与探测缓存键的两项。安全不变式全部保留：Tower 不会自动把机密交给 Agent 可影响的进程；回退后权限与默认位置相同；Agent 的三种沙箱与安装器安装阶段都拒绝创建硬链接与钥匙串查找；探测未能确认拒绝时不以路径规则不完整的 S2 运行（缓存键含 Tower 版本与档位模板哈希之后，这一条在 Tower 更新之后同样由探测保证）；Pi 的输出文件对 Agent 读写都拒绝，并且最迟随 Host 退出删除；存活 Host 的即时投递文件仍只有该 Host 可用，三种沙箱照旧拒绝读取 `~/.tower/**`。三要素一项的收窄只改变警告的触发，不放宽任何访问：沙箱外工具的每次调用都 ask，直到人对该工具授予按工具名的授权（〔ADR-227 更正：原句“每次调用仍逐次 ask”在按工具名授权之后不成立；ADR-227 起，不可信内容与对外通信都为真时不提供这一授权〕），路径检查照旧，§11.3.4 的残余照旧登记。安全问题只写到设计层面。

**Pi v1.2.0 核实**（`git show v1.2.0:<path>`；`packages/coding-agent/src/` 下，`packages/ai/src/` 另注）
- `packages/ai/src/env-api-keys.ts:40-44`：显式设置了 `GOOGLE_APPLICATION_CREDENTIALS` 时，每次判定凭据都以 `existsSync` 检查该文件，不缓存。R98-D6-01 的后果成立。〔ADR-227 更正：`:41-44` 只检查显式传入的 `env` 参数，变量只在进程环境中时走 `:59-62` 并缓存；该文件只经 `compat.ts:23` 导出，不是 coding agent 的判定路径。实际路径是 `models.ts:757` 的 `resolveProviderAuth` → `providers/google-vertex.ts:74-76`，经 `auth/context.ts:30-42` 每次 `fs.access`、不缓存，所以结论不变〕
- `core/tools/bash.ts:112-114`：bash 以 `detached: true` 派生（非 Windows），子进程自成进程组，Host 退出时不随之结束。R98-D6-02 的前提成立。
- `core/tools/bash.ts:338-353`：截断时在文字末尾附 `[Showing … Full output: <path>]`；`:372-381`：只有 `ops.exec` 以 `Error("aborted")` 或 `Error("timeout:<N>")` 拒绝时才附状态行，其他拒绝原样抛出；Pi 自己的实现在 `:102, 150, 153` 以同样的两种错误拒绝。观察 2 与观察 9 的依据。
- 更正 ADR-225 Pi 核实中的一句：流式全文文件在 `closeTempFile` 之前没有 `error` 监听者，所以删掉存活 Host 的 `TMPDIR` 更可能使该 Host 进程崩溃，而不只是工具调用失败（观察 6；ADR-225 的结论不变，原文作为历史保留）。

**条目（R98 追问清单）**
- **R98-D6-01**（只重启 Supervisor 时即时投递目录被清空、drain 一行没有 Host 存活的去向）：(a) **唯一定义** `06` §6.1.6 检查点写入中途一行：交给 Engine Host 的投递以该 Host 的 `hostId` 为 `deliveryId`（`run/<hostId>/`），与 `tmp/<hostId>/`、`mcp-cwd/<hostId>/` 同一生命周期（`host.spawn` 之前建立、该 Host 进程退出后删除、同一 `hostId` 的下一个进程在其删除之后才 spawn）；启动清理在 main 交回存活 Host 之后只删除不属于存活 Host 的投递，其余投递（安装器第 1 阶段）一律删除。`06` §6.6.1、`05` §5.3.6 凭据一行、`11` §11.7.0 与 §11.7.1 云 SDK 凭据一行、`16` 即时投递目录一行改为引用。(b) drain 一行的崩溃规则限于 Host 已不存在；Host 存活时重新接上后由 Supervisor 继续这次 drain，从 drain 协议尚未完成的一步续做（Run 未结束时重新 `abort` 并等到 `agent.settled`，随后与正常结束的 drain 相同，写 `run.ended` 并执行原目标），不在 Run 仍活跃时把 Goal 置为 `paused`。G44 (c) 补两组断言。
- **R98-D6-02**（Host 崩溃而 Tower 仍在运行时，崩溃 Run 的进程不在终止范围内）：**唯一定义** `06` §6.1.6 “Agent 后台进程”一行的范围加“各 Goal 最近一个因 Host 退出或挂死而以 `crashed` 结束、其后尚无新 Run 开始的 Run 的令牌”，并写明它也是 Tower 运行中 Host 退出或挂死之后的终止范围。`06` §6.1.3 Engine Host 一行：Host 退出或挂死之后（不论随后是否自动重启），挂死的 Host 先以 SIGKILL 终止（终止之前以其 pid 为根取后代树），再对该 Host 中各 Run 的令牌做终止的一轮（进程树 ∪ 令牌，ADR-158；已退出的 Host 的后代已被收养，只按令牌）并补 `agent_bg_done`；重启经准入，检查 h 等到这一轮完成。`10` §10.3.1 ② 与 L437 的“由此”、§6.1.10 崩溃恢复、检查 h 的注释同步；`10`、`13` §13.11.1、`16` 令牌扫描一行的复述改为只引用（观察 5）。G35c 补 (x)。
- **R98-D6-03**（准入的重算时机缺检查 d 的解除事件）：`06` §6.2.4 的重算时机加“资源预留或端口段释放（验证槽位结束、检验服务停止、`inspect.close` 回收端口段）、内存压力刹车回落到 warn 之下”，并写明有 Goal 因刹车等待时每 30 s 读一次内存压力（压力回落不是事件）。
- **R98-D11-01**（三要素在配置了 MCP 的 Goal 上恒为真）：收窄 ADR-225。**唯一定义** `11` §11.8 私有数据一行：沙箱外工具不改变这一项——它们能否读取本地文件或把凭据写进卫星，Tower 无法判定（不按注解分类，静态清单没有可核实的能力声明），记为“未知”，不计入；只有可核实地标明能读取本地文件或用户数据的沙箱外工具才计为真，M1 中没有这样的来源（M2 决定点）。表下新增“沙箱外工具风险说明”一段（唯一定义）：按静态清单，会加载任何用户扩展（含只注册钩子的）或 MCP 服务器时，合同编辑器在“批准”上方显示一行中性说明；它不是致命三要素警告，不使“批准”不可用、不需要理由、不影响远程 `quick_ratify`，也不计入 E3 的触发率与采纳率。触发率测算表恢复为按判定规则推算的值（私有数据在 S2 下为“仅当被跟踪的 env 文件密钥扫描命中”，ADR-224 之后“未忽略 `.env`”一说不准；用户扩展不改变三项）。§11.3.1 作用范围 (ii)、§11.3.4 路径检查的残余、`00` §0.5.1 沙箱外工具一行、`04` §4.10.2 致命三要素一条同步；T7 与 §11.3.4 末句的分档改为“是否加载了沙箱外工具”（是否写文件系统无法判定，按能写计）。G46 (bm)。
- **R98-D11-02**（探测缓存键不含 Tower 的档位模板）：`06` §6.7 的键加“Tower 的版本与三种档位模板的哈希”，`13` §13.11.1 探测一行同步。同一处补两句（观察 4）：探测进行中 Supervisor 崩溃时本次启动尚无结果，重新探测；档位按 Run 选择，存活 Host 中进行中的 Run 保持它启动时的档位；结果翻转的处理在新结果写入时执行（Tower 启动，或只重启 Supervisor 而键已不同）。
- **R98-D13-01**（写回集合新排除类的保留触发盖住了人按提示复制进来的机密文件）：收窄 ADR-225。**唯一定义** `10` §10.8.4 第 5 步：这一排除与改名保留只针对名字形如凭据、base 中未跟踪、且既不被 git 忽略也不在本地文件清单中的路径；被忽略的路径与清单中的文件（接管提示请人复制进来的副本、`inspect_with_secrets` 复制进检验目录的副本）按本步其余规则排除，随目录删除，不触发保留。`04` §4.6.7 与 `12` §12.12 交还对话框补 `已排除：<路径>（名字形如凭据、不在 base 中；不交还，副本将改名保留）`；`04` “然后删除检出”一句补这类改动时改名保留。`06` §6.4.3 `inspect.bring_back`：只有这类路径与 T_pin 不同时，`E_STATE` 的提示列出它们并写明不会带回。G46 (bl) 补两组。
- **R98-D14-01**（ADR-038 的〔当前值〕仍为 38 周）：`15` ADR-038 决策行的〔当前值〕改为 39 个日历周、2026-11-09 → 2027-08-06，写明以 `14` §14.3.4 为准；`14` §14.3.4 结论的同步清单加入它；lint (C) 读取该标记，核对周数与结论相同、日期等于起点加 M1 周数的周五。
- **R98-D15-01**（`11` L360 的 S0 原因与 `04` §4.8.5、`06` §6.7 不同）：`11` §11.6.2 硬链接一行改为 `04` §4.8.5 原因一行的 `本机的沙箱未通过启动自检（硬链接）`，并写明本机根本没有 OS 沙箱时才是 `本机没有可用的 OS 写入沙箱`。lint (r) 加一项：探测或自检之后写通用原因的，报 CONTRADICT。

**评审结论中的观察（R98 结论部分）**
- 观察 1：`11` §11.3.3 分类的先后如实登记告知强度（直接的读取只记 severity 1 的 `policy_block`，经混淆而由 S2 拒绝的记 severity 2）；M1 不改，按受保护类别升级会重新带回 Host 临时目录的误报。
- 观察 2：`07` §7.2.2 的截断标签按状态行之前的 `[Showing … Full output: <path>]` 后缀匹配，不按子串；标签按是否得到全文推导，正常结束且截断、但全文文件未通过校验或已不在时同样标为截断的尾部。`00` §0.5.1 同步。
- 观察 3：分类的先后对 MCP 与 codemode 的全文文件改用“以更窄的参数重新调用”一句；`00` §0.5.1 写“Agent 环境中的 `$TMPDIR`”；Scratch（M2）的真实检出读允许与本条的关系在 M2 限定；镜像 `objects/` 之外的读取按密钥路径表的 `~/.tower/**` 一项归 `secrets.access`。
- 观察 4：只重启 Supervisor 时，当前 Run 在存活 Host 中进行的 Goal，其旧 Run 的未解决 `bg_process_survived` 令牌同样不在终止范围，存活期间的复查照常（`06` §6.1.6）；探测进行中崩溃、按 Run 的档位、翻转处理的时机见 R98-D11-02；Trace 解压文件在只重启 Supervisor 时同样被清空，Trace 抽屉提示重新打开（`06` §6.6.4）；情形 E 在改名与置标记之间崩溃时告知仍写“随工作目录丢失”、Goal 页照常列出 `.kept-*`，如实登记（`10` §10.16.2）。
- 观察 5：见 R98-D6-02。
- 观察 6：`00` §0.5.1 理由栏改为“Pi 只在错误文本中给出路径、没有最终 `details`，Tower 不从错误文本取路径”；`14` W4 第 97 轮摘要补“运行时版本”；ADR-225 Pi 核实的一句见上方更正。
- 观察 7：`14` §14.3.4 增人备选写明取整规则（T 先按十进制半进位取到 0.01，再加 2 周缓冲向上取整周）。
- 观察 8：`13` §13.11.3 补命令全文副本一行（单个没有上限、不在磁盘压力顺序之内，如实登记，按 E6 实测决定）；`09` §9.12.1 补 `~/.tower/tmp/<hostId>/` 一行（未经脱敏的原文，随 Host 退出删除），命令与验证日志一行写明全文副本没有上限、默认进入系统备份。
- 观察 9：`05` D38 写明 Tower 的 `exec` 以 `Error("aborted")` 与 `Error("timeout:<秒>")` 拒绝的约定；C12 断言超时与中止经 Tower 的 `exec` 时的文字。

**删除 / 推迟**
- 删除：ADR-225 的“本 Goal 加载了沙箱外工具时私有数据为真”；写回集合的凭据形排除对被忽略路径与清单文件也触发改名保留的字面范围；不带存活 Host 例外的即时投递启动清空；drain 一行无条件的“Host 已随 main 退出”；不含 Host 崩溃的终止范围与“Supervisor 或 Host 重启后”的复述；不含检查 d、g 解除事件的重算时机；不含 Tower 版本与档位模板的探测缓存键；`11` §11.6.2 对探测失败写的通用 S0 原因；ADR-038 的 38 周〔当前值〕；“全部工作超过 130.02 人周时为 34 周”（已越过）。
- 推迟：沙箱外工具的可核实能力声明（M2 决定点）；硬底线命中按受保护类别提升告知级别（M1 不改）；命令全文副本的大小上限（按 E6 实测）。
- `16` §16.1.13 补登第 98 轮被取代的说法 1 行，由 (D) 检查；增人方案“33 周”登入 M1 周数一行，当前值改为 34 周。lint (C) 加 ADR-038〔当前值〕的核对，(r) 加 S0 原因一项。

- **lint**：全部检查 `--checks rstuvwxyzckdnSeRqpoPiDgKYATFMBOJCH`，exit 0；见 `reviews/round-98-lint.md`。
- **排期**：+0.05 人周，没有系统线、安全线与 Agent 线增量。
  - W4 +0.03（桌面；W3 与 W6 的落点由本行负责人完成）、W14 +0.01（设计）、W16 +0.01（设计；W12 的落点由本行负责人完成）。
  - 按 ADR-136 的常规规则在余量之内吸收，**M1 维持 39 周**（2026-11-09 → 2027-08-06；第 35 周末冻结，2027-07-09；M2 至 2027-11-12）。
  - `14` §14.3.4 与 ADR-133 第 98 轮补记一致：WBS 124.02，余量 系统 1.12、Agent 1.12、桌面 1.07、设计 1.08、安全 1.12；依赖链 19.91。
  - **增 1 人方案由 33 周变为 34 周**：130.05 / T 24.01 / 27 个工作周，第 30 周末冻结（2027-06-04），至 2027-07-02（新人约 2.43 人周）；下一个台阶是全部工作超过 135.52 人周（35 周）。

## 第 99 轮对抗评审（全范围）后的跨文档决策（ADR-227）

## ADR-227 运行中的终止一轮限于该 Host 且一轮即止、云 SDK 凭据总带 AWS_PROFILE 与配套变量、不可信内容与对外通信都为真时沙箱外工具不按工具名授权、人新建的被忽略文件列出并保留副本、M3 随 M2 顺延 — Accepted（R99 全部条目与评审结论中的观察；Amends ADR-226、ADR-223、ADR-186、ADR-182、ADR-158；M1 维持 39 周，增人备选仍为 34 周；Amended by ADR-228、ADR-231）

选择原则（收敛规则，同 ADR-186–226）：只用三种办法关闭条目——(1) 把说法改弱但为真；(2) 删除或推迟不属于 M1 主循环的机制；(3) 在已有的唯一定义处加至多一条守卫、一行或一个字段。本轮七条都是次要条目，每条只在一处唯一定义落规则，引用处改为引用；“无法判定”时取更严的一边，与 `11` 中 T7/T26、路径扫描与不透明参数的取向一致。
- 运行中的终止一轮（`06` §6.1.6 “Agent 后台进程”一行）：范围、结束条件、`清理中` 与 `E_BUSY`、准入与扫描时机；
- 云 SDK 凭据链（`11` §11.7.1）：AWS 总带 `AWS_PROFILE`，配套变量原样传入，缺区域时补齐；
- 按工具名授权的条件（`11` §11.3.4）：不可信内容与对外通信都为真时 `tool.external` 只有“仅这一次”；
- 写回集合（`10` §10.8.4 第 5 步）：人新建的被忽略文件列出并使副本改名保留；
- 复述与过期值：M3 的日期（lint (C) 核对）、G46 (bj)(bm)、§6.1.10 的扫描时机。

不新增状态、事件类型、表、列、命令、决定种类、Needs-You kind、landmark、`wait_reason` 值或常驻进程；新增的只有审批卡上一行既有的风险说明、编入规则的排除 (d)、Pi 依赖行 D62 与组件清单中的 `ExternalToolNote` 一行。安全不变式全部保留：Tower 不会自动把机密交给 Agent 可影响的进程（云 SDK 凭据仍只以文件路径与非机密配置交给 Engine Host，配套变量不进入 bash）；回退后权限与默认位置相同；Agent 的三种沙箱与安装器安装阶段都拒绝创建硬链接与钥匙串查找；探测未能确认拒绝时不以路径规则不完整的 S2 运行；Pi 的输出文件对 Agent 读写都拒绝，并且最迟随 Host 退出删除；沙箱外工具的级别下限仍为 ask，本轮只收窄何时可以按工具名放行。安全问题只写到设计层面。

**Pi v1.2.0 核实**（`git show v1.2.0:<path>`；`packages/ai/src/` 下）
- `providers/amazon-bedrock.ts:54-79`：Bedrock 的 `resolve` 依次认存储的凭据、`AWS_BEARER_TOKEN_BEDROCK`、`AWS_PROFILE`（存储凭据中的或环境中的）、`AWS_ACCESS_KEY_ID` 与 `AWS_SECRET_ACCESS_KEY`、`AWS_CONTAINER_CREDENTIALS_RELATIVE_URI`/`_FULL_URI`、`AWS_WEB_IDENTITY_TOKEN_FILE`，都没有时返回 `undefined`；只有 `AWS_SHARED_CREDENTIALS_FILE`（或 `AWS_CONFIG_FILE`）时判为未配置。R99-D5-01 (a) 成立。
- `models.ts:757`：`getAuth` 经 `resolveProviderAuth` 调用 provider 的 `resolve`；`:865-866`：没有结果时抛出 `Provider is not configured: <provider>`。
- `api/bedrock-converse-stream.ts:166-167`、`:193-205`、`:1202-1209`：区域依次取 ARN 中的区域、`options.region`、`AWS_REGION`、`AWS_DEFAULT_REGION`、标准端点的区域；环境中没有 `AWS_PROFILE` 时回落到 `us-east-1`，有 `AWS_PROFILE` 时交给 SDK 默认链。所以 Tower 设 `AWS_PROFILE` 之后要补齐区域。
- `providers/google-vertex.ts:64-89`：`:76` 每次以 `ctx.fileExists`（`auth/context.ts:30-42`，`fs.access`，不缓存）检查 ADC 文件；`:78-81` 要求 project（`GOOGLE_CLOUD_PROJECT` 或 `GCLOUD_PROJECT`）与 `GOOGLE_CLOUD_LOCATION` 同时存在。
- `compat.ts:23`：`env-api-keys.ts` 只经它导出，不在 coding agent 的判定路径上；ADR-226 Pi 核实中引的 `env-api-keys.ts:40-44` 已在该处以〔ADR-227 更正〕注明，结论不变。
- `v1.2.0..HEAD` 之间以上文件只有 `bedrock-converse-stream.ts` 改了两行工具调用参数的解析，所引行号不变。

**条目（R99 追问清单）**
- **R99-D5-01**（Bedrock 只以文件变量传入时判为未配置、配套变量被删除、Pi 位置引错）：**唯一定义** `11` §11.7.1 “云 SDK 凭据链”行：Host 环境只有指向文件的变量与非机密的配套变量（`AWS_REGION`、`AWS_DEFAULT_REGION`、`GOOGLE_CLOUD_PROJECT`/`GCLOUD_PROJECT`、`GOOGLE_CLOUD_LOCATION`，原样传入、不进入 bash）；凡以凭据文件提供 AWS 凭据，总带 `AWS_PROFILE`——你设了的取你的值，没设的取 SDK 默认的 `default`，Tower 写入的投递文件取写入的 profile 名；两处都没有区域时补 `AWS_REGION=us-east-1`（与 Pi 在没有 profile 时的回落相同）。`11` §11.7.0 表与 Engine Host 环境一行的例外、`05` §5.3.6 凭据一行（Pi 位置改为 `models.ts` 与 `providers/*` 的 `resolve`）、`16` 云 SDK 凭据一行同步；`05` §5.11.1 新增 D62，C29 (b) 补断言；G46 (d) 第一组改为 “只有 `AWS_PROFILE` 与 `AWS_SHARED_CREDENTIALS_FILE`（另有原样的 `AWS_REGION`）”，补只有文件变量与 Vertex 两组；G46b (d) 同步。
- **R99-D6-01**（运行中 Host 退出之后那一轮的范围、结束条件、闸门与唤醒）：**唯一定义** `06` §6.1.6 “Agent 后台进程”一行：Tower 运行中的一轮只取该 Host 承载的 Run（打包模式下即该 Host 上各 Goal 的 Run，与这些 Goal 有未解决 `bg_process_survived` 的 Run），其他 Host 的 Goal 不受影响；第二类令牌（最近一个因 Host 退出或挂死以 `crashed` 结束的 Run）在带它 `runId` 的 `agent_bg_done` 检查点写入后移出范围——每一轮完成时对范围内每个 Goal 都补这一检查点（不受 `10` §10.7.1 “树相同即不建”的限制），什么也没终止时不注入 `tower.processes_terminated`；已归档的 Goal 不在第二类；`清理中` 与 `goal.take_over` 的 `E_BUSY` 对运行中的一轮同样适用。`06` §6.1.3 Engine Host 一行改为引用该行；§6.2.4 准入的重算时机写 “某 Goal 的重启清理或 Engine Host 退出或挂死之后的一轮完成”；`06` `goal.take_over` 一行、`10` §10.7.1 去重例外、`12` §12.6.4 实况行、`16` `E_BUSY` 一行同步。G35c (x) 补一组。
- **R99-D11-01**（按工具名授权撤掉逐次 ask 的时刻没有告知；ADR-226 的安全论证一句不实；原则的限制未登记）：**唯一定义** `11` §11.3.4 “按工具名授权的条件”：本 Goal 的不可信内容与对外通信都为真时（加载了 MCP 服务器即如此；私有数据对沙箱外工具至少是 “未知”），`tool.external` 不提供 “本 Goal 内同类”，只有 “仅这一次”，每次调用都 ask；已有的这类授权（运行时与合同中的）在这一条件下不编入 `policy.json`（§11.3.5 排除 (d)），条件中途成立时于下一次编入时失效；条件不成立时照常提供，选项上方显示 §11.8 的风险说明并加半句 “授权后该工具的调用不再逐次询问”。理由：私有数据一项对沙箱外工具无法判定，取更严的一边；合同批准处不因此警告（ADR-226 的取舍不变），这一面由逐次 ask 承担，所以在另两项都成立时不让它被撤掉。`11` §11.2、§11.3.4 残余、§11.8 风险说明、T16，`01` §1.4 #9（登记 “警告不覆盖由沙箱外工具提供的私有数据” 与承担它的闸门）、`00` §0.5.1、`02` §2.5、`04` §4.10.2、`12` §12.12（`ExternalToolNote`）、`16` 同步。ADR-226 的 “沙箱外工具的每次调用仍逐次 ask” 在原处以〔ADR-227 更正〕改为 “每次调用都 ask，直到人对该工具授予按工具名的授权”。G46 (bn)。
- **R99-D13-01**（人新建的被忽略文件随副本删除而不列出；凭据形文件的交还途径无效）：**唯一定义** `10` §10.8.4 第 5 步：理由句改为 “通常是……的副本”；H 中被 git 忽略、而卫星工作目录与主检出中都没有同一路径的条目（git 按目录汇报的被忽略目录按整个目录计）没有原件，同样不写回，但交还对话框与交还结果逐条列出，第 8 步删除前的比较按 “不同” 处理，H 改名保留、不删除；检验目录不适用这一条（其中多是运行与构建的产物），带回结果按顶层路径列出并写明随目录删除。`04` §4.6.7 与 `12` §12.12 的交还对话框补一行；`04` 末句写明凭据形、base 未跟踪的文件不能经交还进入目标，需要时让 Agent 在工作目录中生成，或在仓库中提交、之后新建的目标的 base 会含它（没有采用对话框中逐个 “按普通文件交还” 的办法：它要新增一个交还参数，并为凭据形文件新开一条进入卫星的路径）。G46 (bl) 的 “另放” 改为 “从主检出复制进”，补一组。〔ADR-228 更正：按目录判定 “人新建” 在被忽略目录已存在于主检出时漏判；第 100 轮不再修判定，而是删除整类——人工编辑检出与检验目录一律不自动删除，这一判定、逐条列出与 “改名保留” 随之删除，写回集合的排除不变。〕
- **R99-D14-01**（M3 的日期没有随 M2 顺延）：`14` §14.1 M3 一行改为 “12–14 周（至 2028-02，随 M2 顺延）”，§14.3.4 结论写 “M3 在 2028-02（M2 之后 12–14 周，2028-02-04 至 2028-02-18）”；同步清单加入 M3 一行；lint (C) 核对 M2 结束日期等于 M1 结束日期加 14 周、M3 的月份落在 M2 结束日期加 12–14 周之内。
- **R99-D14-02**（G46 (bj) 期望过期、(bm) 手机一组属 M2 未标）：(bj) 按文件类型分写——`pi-bash-*.log` 给出重定向的做法，`pi-mcp-*.txt` 给出 “以更窄的参数重新调用该工具”（ADR-226）；(bm) 的手机一组与其期望标 “（M2）” 并列入表头的 M2 列表；表头补 ADR-225/226/227 与 R97–R99。
- **R99-D15-01**（§6.1.10 的扫描时机漏了运行中的一轮）：`06` §6.1.10 扫描频率的列举加 “Engine Host 退出或挂死之后的一轮”，并写明它与重启清理一样由事件触发，不受 “每 60 s 一次” 与 “只在 Run 活跃时” 的限制。

**评审结论中的观察（R99 结论部分）**
- 观察 1：`08` §8.6.1 定义 `hostExpected`，`lastHeartbeatAt` 以它置位的时刻为起点（重新接上的 Host 自重新接上时起计，持久化的心跳 Fact 只作诊断）；§8.6.3 补 “挂死” 的唯一定义（进程仍在，且自该起点或最后一次心跳起超过 30 s 没有心跳；Supervisor 的退避不计入，睡眠期间冻结、唤醒后 60 s 宽限），`06` §6.1.3 的 SIGKILL 以它为前提。G35c (x) 补只杀 Supervisor 一组。
- 观察 2：`06` §6.1.6：挂死 Host 的后代树中不带令牌的成员（MCP 服务器、扩展的子进程、文件辅助进程）照常终止，不列入任何 Goal 的 `tower.processes_terminated`；范围内每个 Goal 各补一次 `agent_bg_done`（随 R99-D6-01）。
- 观察 3：`11` §11.7.1 登记已知限制：云 SDK 原始值只在首次运行时导入，带有效期的值过期后用它的 Host 的请求以 provider 错误失败（F7 不识别），M1 没有重新导入的入口；有效期短的凭据请改用 profile。
- 观察 4：`11` §11.8 写明远程 `quick_ratify` 的卡片是否列出风险说明随 M2 的手机卡片设计决定（`serve` 属 M2）。
- 观察 5：`11` §11.8 补 “合同之外的重算”：启动自检由 S2 转为 S0 时重算，已批准或运行中的 Goal 变为同时为真时标红并显示 `■ 致命三要素`，不暂停、不另生成 Needs-You；清单确认不是重算时机（两项按 MCP 服务器是否配置判定）。`06` §6.7 引用。
- 观察 6：`06` §6.1.7 安全模式：崩溃前已在进行、Host 仍存活的 drain 照 §6.1.6 续做到 `run.ended` 与原目标（只是收尾，不开 Run）。
- 观察 7：`00` §0.5.1 的风险说明写 “会加载任何用户扩展（含只注册钩子的）或 MCP 服务器”，与 `11` §11.8 一致；`12` §12.12 补 `ExternalToolNote` 的文案与视觉；`06` §6.6.1 目录树补 `goals/<G>/logs/`；`04` §4.6.6 第 6 步补带回只有凭据形改动时的 `E_STATE` 提示（文案只在 `06` §6.4.3）；`12` §12.12 交还对话框的凭据形一行改为 “新建或改过”，人删除 Agent 写出的同类文件同样列出。
- 观察 8：`14` §14.1 与 §14.3.4 的增人备选补 “并分担各线的非链上工作”：5.5T − 2 的模型隐含新人分担四条全职线各约 4.9 人周（新人合计 T − 2 = 22.00 人周）。
- 观察 9：`04` §4.15.1 的 “添加与移除在本机与网页端可用” 补 “网页端属 M2；移除机密条目只在本机，远程能力以 `16` §16.5 为准”。

**删除 / 推迟**
- 删除：后台进程终止范围中没有结束条件的第二类写法与 “该 Host 中各 Run” 的另一种范围；只写给冷启动的 `清理中` 与 `E_BUSY`；不含运行中一轮的准入重算与扫描时机；云 SDK 凭据 “只传指向文件的变量” 与只以 `AWS_SHARED_CREDENTIALS_FILE` 交付原始密钥的写法；`05` 的 “Pi 在 `ai/src/env-api-keys.ts` 中读取”；无条件的 “可以授予按工具名的 Goal 级授权”；ADR-226 的 “每次调用仍逐次 ask”；写回排除理由句中对被忽略路径一概的 “副本”；`04` 中对凭据形文件无效的交还办法；G46 (bj) 的单一期望与 (bm) 未标的手机一组；M3 “至 2027-12”。
- 推迟：云 SDK 原始值的重新导入入口（M1 如实登记为已知限制）；远程 `quick_ratify` 卡片是否列出风险说明（M2）；沙箱外工具的可核实能力声明（仍为 M2 决定点）；上游 PR 候选：Bedrock 的判定也认凭据文件变量（D62）。
- `16` §16.1.13 补登第 99 轮被取代的说法 1 行，由 (D) 检查；lint (C) 加 M2、M3 日期的核对。

- **lint**：全部检查 `--checks rstuvwxyzckdnSeRqpoPiDgKYATFMBOJCH`，exit 0；见 `reviews/round-99-lint.md`。
- **排期**：+0.04 人周，没有系统线、安全线与 Agent 线增量。
  - W4 +0.01（桌面；W3 的落点由本行负责人完成）、W14 +0.01（设计；W10 的落点由本行负责人完成）、W16 +0.02（设计；W6 与 W12 的落点由本行负责人完成）。
  - 按 ADR-136 的常规规则在余量之内吸收，**M1 维持 39 周**（2026-11-09 → 2027-08-06；第 35 周末冻结，2027-07-09；M2 至 2027-11-12；M3 至 2028-02）。
  - `14` §14.3.4 与 ADR-133 第 99 轮补记一致：WBS 124.06，余量 系统 1.12、Agent 1.12、桌面 1.06、设计 1.05、安全 1.12；依赖链 19.91；最长线由桌面（28.93）变为设计（28.95）。
  - **增 1 人方案仍为 34 周**：130.09 / T 24.02 / 27 个工作周，第 30 周末冻结（2027-06-04），至 2027-07-02（新人约 2.43 人周安全线工作，并分担各线约 4.9 人周）；下一个台阶仍是全部工作超过 135.52 人周（35 周）。

## 第 100 轮对抗评审（全范围）后的跨文档决策（ADR-228）

## ADR-228 人的工作现场不自动删除、AWS 并存时同 Pi 且区域按每次 Host 启动判定、挂死计时自准备握手完成起、逐次批准的代价登记并单独度量、终止一轮完成之前的写入归 agent_bg — Accepted（R100 全部条目与评审结论中的观察；Amends ADR-227、ADR-226、ADR-225、ADR-222、ADR-221、ADR-201、ADR-199、ADR-099、ADR-049；M1 维持 39 周，增人备选仍为 34 周；Amended by ADR-229、ADR-230）

选择原则（收敛规则，同 ADR-186–227）：只用三种办法关闭条目——(1) 把说法改弱但为真；(2) 删除或推迟不属于 M1 主循环的机制；(3) 在已有的唯一定义处加至多一条守卫、一行或一个字段。本轮的重要条目 R100-D13-01 用 (2) 关闭**整类**：人工编辑检出的保留与删除自 ADR-193 起约八轮反复产生条目（ADR-199 移到一边、ADR-221 删除前比较、ADR-222 清除时保留、ADR-225/226/227 写回集合中决定副本去留的触发条件），每一轮都在“何时可以安全删除人的副本”上补一个分支。本轮不再判定：Tower 从不自动删除人工编辑检出、检验目录与 `.kept-*`，只结束对它的使用、列出它，由人一键删除。五条次要条目各在已有的唯一定义处加一句。
- 人的工作现场不自动删除（`10` §10.2 新增一段唯一定义，§10.8.3、§10.8.4、`06` §6.1.6、§6.4.3、`04`、`09`、`13` 引用）；
- 云 SDK 凭据链（`11` §11.7.1）：两者并存时同 Pi、保留的 profile 名、区域的判定、记录的值、API Key 类 provider 的配置变量；
- 挂死的定义（`08` §8.6.3）：准备阶段不计入；
- 按工具名授权的条件与取舍（`11` §11.3.4）：条件成立时的显示与代价；
- 归因表第 3 行（`10` §10.3.1）：终止一轮完成之前的写入；
- 复述：`06` §6.2.4 的 Host 环境、`10` §10.7.1 第 2 步。

新增的只有命令 `goal.delete_kept`（仅本机；不是 HumanDecision、不产生事件）、Goal 页与存储面板中的列出与 `删除`、人的工作现场合计超过 10 GB 时的一次 severity 1 提示、审批卡与 Goal 页的两行说明。删去的有：`goal.take_over` 的参数 `moveAside` 与“移到一边并重新开始”、交还与带回之后的删除前比较及“比较不同则改名保留”、写回集合中只为决定副本去留的判定与逐条列出。不新增状态、事件类型、表、列、决定种类、Needs-You kind、landmark、`wait_reason` 值或常驻进程。安全不变式全部保留：Tower 不会自动把机密交给 Agent 可影响的进程（新增传入 Host 的只有非机密的区域、端点、账号与 gateway id，不进入 bash；原始密钥仍只经即时投递文件）；保留的检验目录中由 `inspect_with_secrets` 带上的机密副本对 S2 与验证器沙箱读写均拒绝（ADR-082），存储面板注明；`goal.delete_kept` 只在本机、只接受按名字属于该 Goal 的人的工作现场路径、逐级 `O_NOFOLLOW` 删除；沙箱外工具的级别下限仍为 ask。安全问题只写到设计层面。

**Pi v1.2.0 核实**（`git show v1.2.0:<path>`；`packages/ai/src/` 下）
- `api/bedrock-converse-stream.ts:162-164`：`optionsProfile = options.profile || options.env?.AWS_PROFILE`，`config.profile` 另取环境中的 `AWS_PROFILE`；`:215-217`：`getConfiguredBedrockCredentials(options.env)` 有值且没有 `optionsProfile` 时设 `config.credentials`——环境中的 `AWS_PROFILE` 不阻止取原始密钥，终端中的 Pi 在两者并存时用原始密钥。R100-D5-01 (a) 成立。`:166-167`、`:193-205` 的区域取法同 ADR-227 的核实。
- `api/azure-openai-config.ts:32`（`AZURE_OPENAI_DEPLOYMENT_NAME_MAP`）、`:74-75`（`AZURE_OPENAI_BASE_URL`、`AZURE_OPENAI_RESOURCE_NAME`）、`:87-91`（都没有且模型无 `baseUrl` 时抛出）、`:104`（`AZURE_OPENAI_API_VERSION`，有默认值）。
- `providers/cloudflare-auth.ts:37-42`：`CLOUDFLARE_API_KEY`、`CLOUDFLARE_ACCOUNT_ID`，AI Gateway 另要 `CLOUDFLARE_GATEWAY_ID`，任一缺失返回 `undefined`（未配置）；`:16-28` 按字段先取存储凭据、再取环境。
- `utils/provider-env.ts:45-51`：`getProviderEnvValue` 依次取调用方的 `env`、`process.env`，所以这些变量原样放在 Host 环境中即可被读到。
- `core/package-manager.ts:2102-2130`（coding-agent）：全局根查询以 `runNpmCommandSync` 同步运行，阻塞 Host 的事件循环（R100-D6-01 的前提，评审已核实）。
- 其余 Pi 文件只引用，不改结论。

**条目（R100 追问清单）**
- **R100-D13-01（重要）**（人新建的被忽略文件按整个目录比较，常见布局下随副本删除；Tower 物化的目录使副本例行保留；第 8 步的唯一定义看不到“按不同处理”）：按收敛规则以删除关闭整类，不改判定的粒度。**唯一定义** `10` §10.2 “人的工作现场不自动删除”：交还（含 `take_external`）、放弃改动、放弃 Goal、检验带回、`inspect.close`（不论有无修改与 `modified` 取值）与验收或放弃触发的检验清理都只结束 Tower 对目录的使用，目录与其中的一切原样留在原路径，成为已脱离的副本；同一 Goal 再次接管或打开检验需要这一路径时，按“Tower 自动改名保留”(a) 改名为 `<原名>.kept-<时间>`（(a) 原为“删除来源目录之前的比较不同”）；Goal 页 `保留的目录` 与设置的存储面板按 Goal 列出路径、大小与来源，各带 `删除`（`goal.delete_kept{goalId, paths}`，仅本机；确认框列出与最近检查点不同的文件、被 git 忽略的条目与 H/.git 中人做的提交数；使用中的路径 `E_STATE`，写回进行中 `E_BUSY`）；没有自动、定时或磁盘压力下的删除；人的工作现场不计入 30 GB 预算，单独计量，合计超过 10 GB 时提示一次（`10` §10.4.4、`13` §13.11.3 如实写出量级：每次接管与检验各留一个目录，不删除即约每周 0.5–20 GB）。`10` §10.8.4 第 2、5、8 步与放弃改动、放弃 Goal 两条，§10.8.3 第 7 步，§10.3.2 删除卫星一行，§10.2 两种检出的守卫（使用中返回 `E_STATE`，否则先改名）与表中两行，`06` §6.1.6 人工编辑检出一行（启动续写之后不删除）、§6.4.3 `goal.take_over`（删去 `moveAside`）、`goal.hand_back`、`goal.discard_human_edits`、`inspect.open`、`inspect.bring_back`、`inspect.close` 与新增 `goal.delete_kept` 一行、§6.6.1 目录树，`04` §4.6.6 第 6 步（`[丢弃]` 改为 `[不带回]`，只放弃带回）、§4.6.7 三处与 Goal 页右栏、§4.15 存储，`12` §12.12 交还对话框，`09` §9.12.4，`13` §13.11.1 与 §13.11.3，`16` 磁盘预算一行、`ProjectLocalFile` 的副本提示与远程矩阵同步。写回集合的**排除**不变（含机密的本地文件、凭据形且 base 未跟踪的路径、清单中的文件、被忽略的路径都不进入 T1），只删去为决定副本去留而设的触发与逐条列出：被忽略的文件在交还对话框中以一行灰字说明。G31、G35e (m)、G46（ADR-199 一组与 (bl)）同步，G46 补删除一组。
- **R100-D5-01**（AWS 混用来源、写入的 profile 名、区域的判定、首次运行只取变量名、API Key 类 provider 的非机密配置）：**唯一定义** `11` §11.7.1 “云 SDK 凭据链”行：(a) 环境中 `AWS_PROFILE` 与原始密钥对并存时同终端中的 Pi 用原始密钥（`bedrock-converse-stream.ts:162-164, 215-217`），Tower 写投递文件、不传你的 `AWS_PROFILE`；(b) 投递文件的 profile 名为保留的 `tower-<hostId>`；(c) 区域在每次 `host.spawn` 时判定：记录的 `AWS_REGION`/`AWS_DEFAULT_REGION` → 你设了 `AWS_PROFILE`（或 Tower 传 `default`）时该 profile 在配置文件（记录的 `AWS_CONFIG_FILE`，否则 `~/.aws/config`）中的 `region` → `us-east-1`，与 Pi 的取法相同，之后改的区域在下一次 Host 启动时生效；(d) 该行所列非机密变量的值在首次运行时经确认记入 Tower 的密钥库、随所属条目存放，“重新读取”替换它们（`05` §5.3.6 首次运行检测、`06` `engine.reread_login_shell`、`16` 钥匙串条目一行同步）；(e) Azure OpenAI 的 `AZURE_OPENAI_BASE_URL`、`AZURE_OPENAI_RESOURCE_NAME`、`AZURE_OPENAI_API_VERSION`、`AZURE_OPENAI_DEPLOYMENT_NAME_MAP` 与 Cloudflare 的 `CLOUDFLARE_ACCOUNT_ID`、`CLOUDFLARE_GATEWAY_ID` 原样传入 Host、不进入 bash；“变量 → provider”的对应以各 provider 的 `resolve` 为准（D62）。ADR-049 的类型表据此补一类：API Key 加非机密配置变量（密钥运行时注入，配置变量原样传入 Host）。`11` §11.7.0 表与 Engine Host 环境一行、`05` §5.3.6 凭据一行、D62 与 C29 (b)、`16` 云 SDK 凭据一行同步；G46 (d) 补第五组（并存，含之后改区域）与第六组（Azure 与 Cloudflare，含“重新读取”），第一组的期望改为保留的 profile 名。
- **R100-D6-01**（挂死的计时自 spawn 起，与 120 s 准备时限相撞）：取评审的第一支。**唯一定义** `08` §8.6.3 “挂死”：准备阶段不计入，`hostExpected` 在该 Goal 的准备握手完成（`run.started`）时才置位，之前 Host 启动、会话创建与开场组装中的阻塞只由 120 s 准备时限判定为 `prepare_failed`，不进入 `engine_crash`；§8.6.1 `hostExpected` 一行改为引用。`13` §13.5 与 `05` §5.3.1、`06` F4b 原写法因此成立，不改。G35c (x) 补两组。
- **R100-D8-01**（逐次批准的代价没有登记，也不在度量之内；条件成立时的界面）：`11` §11.3.4 取舍（ADR-186 一段）登记**代价**：配置了 MCP 时加载它的 Goal 上每个沙箱外工具的每次调用都出只有“仅这一次”的卡（`approval`、`agent_blocked`、L3，桶取空后 L2，Agent 阻塞），告警纪律的两个出口都不可用，出口只有逐次批准、`forbid`、对该 Goal 不加载 MCP 或不配置 MCP；这一类单独度量，越过复审线时提前评估 M2 决定点。T10 的缓解注明对这一类不适用。`00` §0.5.1、`01` §1.4 #9、README 第 8 条的例外列表同步。**唯一定义** `11` §11.3.4 “按工具名授权的条件”补条件成立时的显示：审批卡在“仅这一次”上方一行 `本目标有不可信内容与对外通信：外部工具每次调用都需要你批准`；合同编辑器与 Goal 页对按 (d) 不编入的授权显示 `在本目标不生效（不可信内容与对外通信）`，不显示“不再逐次询问”；会使条件成立的授权选项上方加半句。`04` §4.5.2 右栏与 §4.10.2、`12` §12.12 `ExternalToolNote` 同步。`14` §14.3.5 打扰率一行、E3 的指标与阈值另列 `tool.external` 审批（按是否加载 MCP 分层的条数、`reflexiveRate` 与 Agent 阻塞时长），E3 写复审线（中位 > 3 条/小时或反射批准率 > 90%），§14.4.1 登记 M2 决定点“沙箱外工具的可核实能力声明”。G46 (bn) 同步。
- **R100-D13-02**（Host 退出之后、终止一轮完成之前，残留进程的写入按外部写入归因）：`10` §10.3.1 归因表第 3 行加一句：Engine Host 退出或挂死之后（冷启动与 Tower 运行中）、`06` §6.1.6 终止的一轮完成之前，该轮范围内令牌已确认的存活者所在 Goal 的写入归 Agent（`agent_bg`）。G35c (x) 补一组。
- **R100-D15-01**（ADR-227 删除的写法仍留在两处复述中）：`06` §6.2.4 拼装 Host 环境一步改为只引用 `11` §11.7.1；`10` §10.7.1 第 2 步的括注改为引用去重例外，列入 `06` §6.1.6 终止一轮补的 `agent_bg_done`。两处旧写法登入 `16` §16.1.13。

**评审结论中的观察（R100 结论部分）**
- 观察 1：README 第 8 条的例外列表加 “配置了 MCP 服务器时外部工具每次调用都要你批准”。
- 观察 2：随 R100-D13-01 消失——检验目录不再在关闭、验收或放弃时删除，其中被忽略的文件不会丢失，`04` §4.6.6 第 6 步写明这一点。
- 观察 3：`06` §6.1.6 后台进程一行的第二类豁免改为 “已归档或没有卫星的 Goal”，写明 7 天后删除卫星的 `abandoned` 与重建失败的 `satellite_missing`。
- 观察 4：`06` §6.1.6 同一行写明归属：挂死 Host 的后代树中带范围之外 Goal 令牌的成员同样终止，所属 Goal 并入这一轮的范围（补检查点、`清理中`、按需注入）。
- 观察 5：`06` §6.1.6 同一行如实登记：一轮完成与补检查点之间崩溃时再做一轮是幂等的，但“有进程被终止”不持久化，恢复开场可能缺 `tower.processes_terminated`。
- 观察 6：`14` §14.3.5 打扰率一行与 E3 指标注明 “打扰” 的口径同 §14.6.2（每用户每小时 L2+ 条目）。
- 观察 7：`12` §12.6.4 `清理中` 一行改为 “冷启动时只在双重故障中同时出现；Tower 运行中的一轮不阻挡交还，两者经 `wtLock` 串行，也可能同时出现”。
- 观察 8：`11` T33 改为 “云 SDK 的机密只以文件路径传入 Host”；`16` §16.1.13 的 ADR-158 历史行不改（历史文字）；`04` §4.6.7 的两个示例分开（凭据形仍为 `certs/dev.key`，被忽略目录中的新文件改为 `secrets/local.pem`）；`16` 云 SDK 凭据一行补 `GCLOUD_PROJECT`。
- 观察 9：`12` §12.12 `ExternalToolNote` 一行写明合同编辑器 “批准” 上方多行说明的顺序：致命三要素决策块、本地机密文件说明、`ExternalToolNote`。

**删除 / 推迟**
- 删除：Tower 在交还、放弃改动、放弃 Goal、检验带回、`inspect.close` 与验收或放弃时删除人工编辑检出或检验目录；删除来源目录之前的比较（ADR-221 的唯一定义与它在交还、带回、启动续写中的三处使用）及 “比较不同则改名保留”；ADR-226 “随目录删除，不触发下述改名保留” 与凭据形路径 “与 T0 不同时按‘不同’处理”；ADR-227 “人新建的被忽略文件” 的判定、逐条列出与 “副本将改名保留”；ADR-199 的 `E_STATE` + “移到一边并重新开始” 与 `goal.take_over` 的 `moveAside` 参数；ADR-201 “删除检验目录时中断” 的处理；删除卫星时对两种检出的比较、询问与删除；`13` 交还的第二次求树；`11` 的 “Tower 写入的投递文件取写入时所用的 profile 名” 与 “只提供原始变量时”；首次运行 “只取变量名、不记录值”（对非机密配置变量）；挂死计时自 spawn 起；`06` §6.2.4 “云 SDK 凭据只传指向文件的变量”；`10` §10.7.1 第 2 步只列 settle 的去重例外。
- 推迟：沙箱外工具的可核实能力声明（M2 决定点，E3 复审线越过时提前评估）；云 SDK 原始值的重新导入入口（仍为已知限制）。
- `16` §16.1.13 补登第 100 轮被取代的说法 1 行，由 (D) 检查；lint (d) 的 DELETED 补 `moveAside`、删除前比较与 “副本将改名保留” 三项。

- **lint**：全部检查 `--checks rstuvwxyzckdnSeRqpoPiDgKYATFMBOJCH`，exit 0；见 `reviews/round-100-lint.md`。
- **排期**：+0.02 人周（WBS 124.06 → 124.08）：W16 −0.01（删除 −0.02，R100-D5-01 +0.01）、W17 +0.01、W19 +0.01（设计）；W7 +0.01（系统，W7-rest）；W12 0（删除 −0.01、自动改名与 Goal 页 `删除` +0.01，桌面）；其余按 WBS 行不足 0.01。
  - 按 ADR-136 的常规规则在余量之内吸收，**M1 维持 39 周**（2026-11-09 → 2027-08-06；第 35 周末冻结，2027-07-09；M2 至 2027-11-12；M3 至 2028-02）。
  - `14` §14.3.4 与 ADR-133 第 100 轮补记一致：余量 系统 1.11、Agent 1.12、桌面 1.06、设计 1.04、安全 1.12；依赖链 19.91；最长线仍为设计（28.96）。
  - **增 1 人方案仍为 34 周**：130.11 / T 24.02 / 27 个工作周，第 30 周末冻结（2027-06-04），至 2027-07-02（新人约 2.43 人周安全线工作）；下一个台阶仍是全部工作超过 135.52 人周（35 周）。

## 第 101 轮对抗评审（全范围）后的跨文档决策（ADR-229）

## ADR-229 复述只引用人的工作现场的唯一定义、存储提示在 M1 有呈现面且磁盘压力先指向人的工作现场、“使用中”只在一处定义、确认框的求值在加固清单内、Bedrock 区域与头部令牌如实登记 — Accepted（R101 全部条目与评审结论中的观察；Amends ADR-228、ADR-208、ADR-099、ADR-049；M1 维持 39 周，增人备选仍为 34 周；Amended by ADR-230、ADR-231）

选择原则（收敛规则，同 ADR-186–228）：只用三种办法关闭条目——(1) 把说法改弱但为真；(2) 删除或推迟不属于 M1 主循环的机制；(3) 在已有的唯一定义处加至多一条守卫、一行或一个字段。本轮的重要条目 R101-D15-01 是复述未同步：`04` 改为只引用 `10` §10.2 “人的工作现场不自动删除”，lint (d) 补一组严格匹配的措辞。六条次要条目各在已有的唯一定义处加一句或一行；R101-D5-01 的两支都按 (1) 如实登记与终端的差别，没有为求等价新增传递途径。
- 人的工作现场不自动删除（`10` §10.2）：`04` §4.6.7 与 §4.7.3 证据面表、`06` §6.6.4、`16` §16.5 只引用；
- 存储提示（`08` §8.1 新增一段唯一定义）：人的工作现场、磁盘压力、总预算、镜像增长与永久证据的 severity 1 提示在 M1 中的呈现；
- 使用中（`10` §10.2 原有的一句改为唯一定义）：带回与关闭检验的前置条件、`goal.delete_kept` 的串行；
- Tower 执行 git 的唯一加固清单（`10` §10.1.2 加一行）：已脱离副本的求值；
- 云 SDK 凭据链与模型凭据（`11` §11.7.1 两行）：区域第 ③ 步、以头部发送的令牌、少见配置；
- 复述：`06` §6.4.7、§6.6.4、`13` §13.11.3、`11` Engine Host 环境一行、`16` §16.5。

新增的只有：`08` §8.1 的“存储提示”一段（复用项目级 L1 通知的设置入口 `◇`，不新增 Needs-You kind 或渠道）、`10` §10.1.2 表中一行、`14` E6 的累积计量与复审线、§14.4.1 一个 M2 决定点、`goal.delete_kept` 与接管、打开检验之间的 `E_BUSY`。不新增状态、事件类型、表、列、命令、决定种类、Needs-You kind、landmark、`wait_reason` 值或常驻进程。安全不变式全部保留：Tower 不会自动把机密交给 Agent 可影响的进程——原始密钥仍只经即时投递文件，`ANTHROPIC_AUTH_TOKEN` 这类令牌不放进 Host 环境（同一用户的进程可读非 Apple 二进制的环境，`11` T33），所以不提供而不是改为环境传递；沙箱外的 Tower 进程不在 Agent 可控的 git 元数据上运行 git——确认框对 H 只在影子上下文中求工作树、只读解析 H/.git，对卫星的 `.kept-*` 与 `_gitdirs/*.kept-*` 不求 git 信息；Tower 从不自动删除人的工作现场，磁盘压力与磁盘满只把人指到它们；`goal.delete_kept` 仍只在本机，并列入 `06` §6.4.7 的禁止远程清单。安全问题只写到设计层面。

**Pi v1.2.0 核实**（`git show v1.2.0:<path>`；`packages/ai/` 下，另注 coding-agent）
- `src/api/bedrock-converse-stream.ts:167`：`hasAmbientConfiguredProfile` 只看进程环境中的 `AWS_PROFILE`；`:168-173` 与 `:1239-1250`：标准 Bedrock 端点只在既没有配置区域、也没有环境 `AWS_PROFILE` 时固定为模型自己的端点；`:196-205`：区域依次取 ARN 中的区域 → 配置的区域（`:1202-1209`：`options.region`、`AWS_REGION`、`AWS_DEFAULT_REGION`）→ 固定端点时模型端点的区域（`:201`）→ 没有环境 profile 时 `us-east-1`（`:203-204`）；`:184-189`：bearer 令牌取 `options.bearerToken`、`options.apiKey` 或 `AWS_BEARER_TOKEN_BEDROCK`。`test/bedrock-endpoint-resolution.test.ts:97-101`（内置 `eu.*` 的端点为 `eu-central-1`）、`:113-120`（没有区域与 profile 时端点与区域都是 `eu-central-1`）。R101-D5-01 (a) 成立。
- `src/providers/amazon-bedrock.ts:61-79`：判定依次为存储的凭据、`AWS_BEARER_TOKEN_BEDROCK`、存储凭据 `env` 或环境中的 `AWS_PROFILE`、环境中的原始密钥对、容器凭据、Web Identity。原始密钥从不进入 Host 环境，所以以投递文件提供原始密钥时环境中必须有 `AWS_PROFILE`，评审建议的 “不让保留的 profile 计为环境 profile” 在 M1 的 SDK 适配器中没有途径（coding-agent `core/model-runtime.ts:671-675` 的请求级 `env` 由调用方给出，会话路径不传），故取评审的第一种写法。〔ADR-230 更正〕这一理由不完整：存储凭据的 `env` 一支可以不经进程环境给出 profile（`amazon-bedrock.ts:65-70`、`model-runtime.ts:682-685`）；不可取的真实理由是 `ModelRuntime` 只接受一个凭据存储，它同时承担用户 `auth.json` 的 OAuth 刷新与落盘，而文件型 `AuthStorage` 不从包入口导出，Tower 要自己实现 `auth.json` 的读写与跨进程锁（D57 不采用）。结论不变。
- `src/providers/anthropic.ts:28-47`：存储或运行时的密钥以 `apiKey` 发送（`:30-31`）；`ANTHROPIC_AUTH_TOKEN` 经 `ctx.env` 读取、以 `Authorization: Bearer` 头部发送（`:34-40`）；`src/auth/context.ts:23-28`：`ctx.env` 即 `process.env`。coding-agent `core/model-runtime.ts:621-629`（`setRuntimeApiKey` 以 `{type:"api_key", key}` 同步）、`:692`（请求的 `apiKey` 取自判定结果）。R101-D5-01 (b) 成立。
- `src/auth/resolve.ts:70-85`：有存储的凭据时以它为准（观察 8 中 `pi /login` 一支）。
- coding-agent `core/package-manager.ts:2102-2116`：全局根按 `PackageManager` 实例缓存（观察 1 的前提，评审已核实）。

**条目（R101 追问清单）**
- **R101-D15-01（重要）**（`04` 中三处仍写 Tower 删除人的副本）：`04` §4.6.7 写回失败一段的末两句改为 “副本不会被删除（规则只在 `10` §10.2 ……）：写回期间你又在副本中保存的改动留在其中，副本原样留在原路径，并在结果与目标页列出”；§4.7.3 证据面表人工编辑检出与检验目录两行的生命周期列改为 “……之后脱离、原样保留，由你在目标页或存储面板删除（`10` §10.2）”。全文再扫一遍 Tower 删除 `_human`、`_inspect`、副本或检验目录的措辞，正文中只剩这三处，`16` §16.1.13 的历史行不改。三处旧写法登入 `16` §16.1.13 第 101 轮一行，由 (D) 检查；lint (d) 的 DELETED 补一组严格匹配的措辞（“同步写回并删除”“相同时才删除”“交还……后删除……副本”“关闭检验……删除目录”“验收……时删除”“验收后清理检验目录”等）：这些措辞自身含 “删除”，按原规则会把自己当作历史标记，所以改为只认真正的历史标记、并把 “不……删除” 视为现行写法（见 `reviews/round-101-lint.md`）。
- **R101-D10-01**（人的工作现场的提示在 M1 没有呈现面，磁盘压力与磁盘满不指向它，阈值口径与 “仅用于显示” 矛盾，累积不度量）：**唯一定义** `08` §8.1 “存储提示”：不属于任何 Goal 的存储类 severity 1 通知（人的工作现场超过阈值、磁盘压力与总预算、镜像增长、永久证据）复用项目级 L1 通知的呈现——存储面板对应行 `◇` 与说明、侧栏底部设置入口一枚 `◇ 存储`；条件成立期间一直显示，直到人看过存储面板（聚焦可见 ≥ 3 s），解除后再成立时重新显示，已查看状态不持久化、重启后仍成立时再显示一次。没有采用 severity 2 收件箱条目：它需要新的 Needs-You kind 与出口分类，设置入口的 `◇` 已是 M1 中不属于任何 Goal 的通知的现成呈现面（ADR-174/175）。磁盘压力（`10` §10.3.2）与 F8（`06` §6.8）的通知与建议把人的工作现场的合计列在第一条、附存储面板的逐个 `删除`，Tower 的自动回收顺序不变、从不删除它们，并如实写出压力主要来自它们时回收解决不了。阈值改按估计独占大小（`10` §10.4.4：物化完成时的 `statfs` 差值加上之后 `mtime` 更新的文件；改名保留的卫星沿用其记录），逻辑大小仍只用于显示。`14` E6 每周记录每台机器的数目与估计独占合计，复审线为任一机器 4 周内超过 30 GB 或超过 10 GB 的机器达到 1/3，§14.4.1 登记 M2 决定点 “人的工作现场的批量删除”（仍由人确认）。`10` §10.2 代价一句、§10.17.1 镜像增长、`13` §13.11.3 两行、`04` §4.3.2 与 §4.15、`12` §12.6.2 `◇` 一行、`16` 磁盘预算一行同步。
- **R101-D11-01**（确认框的 git 求值不在唯一加固清单中）：`10` §10.1.2 表加一行 “已脱离副本的求值”：人工编辑检出与检验目录中与检查点不同的文件与被忽略的条目在影子上下文中以临时索引求出（与 §10.8.4 第 5 步同一取法，目录自带的 `.git` 排除，不在其上运行 git）；H/.git 中人做的提交数由 §10.1.3 “读取 gitdir” 的同一解析器在隔离 worker 中只读求出（不读 `config`、`include`、`alternates`，只数 H/.git 自己对象库中的提交）；卫星的 `.kept-*` 与 `_gitdirs/*.kept-*` 不求任何 git 信息，只列大小与 “其中的一切随之删除”。§10.1.3 该行注明同一解析器的第三处用途。`10` §10.2 与 `06` §6.4.3 `goal.delete_kept` 一行改为引用。
- **R101-D13-01**（已脱离的副本比影子与记录活得久）：(a) 取登记，不在脱离时重新打包：`10` §10.2 写明影子删除之后 H 中的 git 命令因缺少对象而失败、文件完整，Goal 页与存储面板对这类 H 注明 `git 历史已不可用（文件完整）`，并告诉人如需保留历史可在影子删除前自行 `git repack -a -d` 并删去 alternates（磁盘代价写明）；§10.3.2 检查点保留一条同步。(b) 影子已删除或 Goal 已清除时，确认框写 `无法与检查点比较：其中的一切随之删除` 并列出文件数与大小；提交数只读 H/.git 自己的对象，照常求出，读不出时写 `无法读取`。(c) **列出的来源**：存储面板按每个已知 Project 的 `<wtRoot>` 扫描按名字属于各 Goal 的目录，不依赖 Goal 的其他记录，已清除的 Goal 标 `（已清除）`；清除一个 Project 与清除全部之后不再列出（再次添加同一项目且位置不变时按名字重新列出），`09` §9.12.4 的结果给出完整路径、改写为 “存储面板之后不再列出它们，不需要时请自行删除”，确认框在执行之前同样列出。没有采用清除时留下清单文件：结果与确认框已列出完整路径，清单文件会是 Tower 在清除之后仍保留的又一份记录。
- **R101-D13-02**（“使用中” 只在一处定义）：`10` §10.2 “只属于一个 Goal” 一段中原有的一句改为**唯一定义** “使用中”：`humanCheckout.path`、检验打开中的检验目录，或以 `keep` 关闭待处理的检验目录。`06` §6.4.3 `inspect.bring_back` 的前置条件由 “检验检出存在” 改为 “使用中”（已脱离的检验目录只能 `删除`，带回返回 `E_STATE`），写回失败之后的出口写明失败的带回不结束检验；`inspect.close` 由 “检验目录不存在” 改为 “不在使用中”；`inspect.open`、`goal.take_over` 与 `goal.delete_kept` 的守卫引用它。`goal.delete_kept` 与同一 Goal 正在本进程中执行的 `goal.take_over`、`inspect.open`（从改名到写入 `humanCheckout` 或 `inspect.opened` 的事务）互相返回 `E_BUSY`，与 “写回进行中” 同一写法，不新增锁；`16` `ProtoError.code` 的 `E_BUSY` 同步。G46 补一组。
- **R101-D5-01**（Bedrock 区域第 ③ 步与 Pi 按模型端点取区域不同；`ANTHROPIC_AUTH_TOKEN` 的头部类型）：**唯一定义** `11` §11.7.1 “云 SDK 凭据链” 行：(a) ③ 只在 Host 环境中带 `AWS_PROFILE` 时补 `us-east-1`；只有 `AWS_BEARER_TOKEN_BEDROCK` 时它按 API Key 运行时注入、不补区域，由 Pi 按模型端点取区域，与终端相同。删去 “这与终端中的 Pi 相同” 中不成立的部分，如实登记两处差别：只有 profile 而没有区域时 Tower 补 `us-east-1`；只有原始密钥、没有区域时终端中的 Pi 取模型端点的区域（`eu.*` 为 `eu-central-1`），Tower 只能经投递文件与 `AWS_PROFILE` 提供原始密钥，环境中的 `AWS_PROFILE` 使 Pi 不固定端点，请求发往 `us-east-1`，这类模型在 Tower 中失败——请设区域；首次运行的确认卡片写明这一点。没有采用任务方向中 “不设 `AWS_PROFILE` 与区域”：Pi 的判定只认环境或存储凭据中的 `AWS_PROFILE`、或环境中的原始密钥对（`amazon-bedrock.ts:65-73`），而原始密钥不能进入 Host 环境。(b) `11` §11.7.1 模型凭据一行登记 “以头部发送的令牌” 为已知限制：Pi 只从进程环境读取 `ANTHROPIC_AUTH_TOKEN`，令牌不能放进 Host 环境，运行时注入只按 API Key 发送，所以 M1 不提供；首次运行不导入、模型选择器标 “该凭据只在你的终端中可用，Tower 中不可用”，并提示改用 `ANTHROPIC_API_KEY` 或 `pi /login`；Anthropic 工作负载身份联合同样不提供。没有采用任务方向中 “按 Pi 读取的环境变量传入”：同一用户的进程能读到 Host（非 Apple 二进制）的环境，这会把令牌交给 Agent 可影响的进程。ADR-049 类型表下补〔ADR-229 补记〕。`05` §5.3.6 首次运行与 D62、`16` 云 SDK 凭据一行同步；G46 (d) 补第七组（只有原始密钥、没有区域与 `eu.*` 模型，bearer 令牌带与不带区域，`ANTHROPIC_AUTH_TOKEN`）。
- **R101-D15-02**（五处复述）：`16` §16.5 `inspect.close` 一行改为 “`discard` 只放弃带回、目录保留（`10` §10.2）”；`06` §6.4.7 禁止远程清单列入 `goal.delete_kept`，lint (v) 扩展为同时核对 `06` §6.4.3 中整条命令仅本机的命令都在 §6.4.7 的列举中（24 条，0）；`13` §13.11.3 命令全文副本一行的计入列写明 “计入 Tower 总占用”；`06` §6.6.4 卫星一行改为只写卫星的删除由 `10` §10.3.2 定义，两种检出与 `.kept-*` 引用 `10` §10.2；`11` Engine Host 环境一行补 “以及 `05` §5.3.6 变量表中 Host 列为 ✔ 的其余各行——代理变量、`GIT_CONFIG_*`、端口与 Tower 标识（只以该表为准）”，`05` 白名单一行的基础集合改为引用 `11`。旧写法登入 `16` §16.1.13。

**评审结论中的观察（R101 结论部分）**
- 观察 1：`08` §8.6.3 “准备阶段不计入” 补半句：只对该 Goal 自己成立，打包模式中另一 Goal 的会话创建阻塞共享 Host 时，已置位 `hostExpected` 的 Goal 照常按看门狗处理（运行中的按 F4，准备中的按 F4b）；§8.6.1 `hostExpected` 一行改为 “承载该 Goal 的 Engine Host（为它 spawn 的，或打包模式下它加入的已有 Host）”。
- 观察 2：`10` §10.2 “Tower 自动改名保留” (a) 的结果另提示 `仍打开着它的编辑器与终端请先关闭`，`04` §4.6.7 “上次的副本还在” 与 §4.6.6 第 3 步同步（远程发起的接管同样显示）。
- 观察 3：`14` E3 复审线写明分母（每个用户至少有一个加载了 MCP 的 Goal 在运行的小时）与中位的取法（先对每个用户求，再对用户取中位）；§14.3.5 打扰率一行的 A 列同样注明分层另列。
- 观察 4：`08` §8.5.3 噪声 Goal 的建议对加载了 MCP、审批主要是 `tool.external` 的 Goal 改为指向 `11` §11.3.4 “代价” 所列的出口。
- 观察 5：`10` §10.3.1 已知误判补 (e)：终止一轮完成之前的窗口中可能还没有 `anomaly{bg_process_survived}` Fact，第 3 行的写入没有注记；范围内没有确认存活者的 Goal 照常补 `agent_bg_done`，其间来源不明的外部写入并入作者为 `agent` 的检查点。
- 观察 6：检验关闭的第三个选项改为 `[稍后决定是否带回]`（`10` §10.8.3、`04` §4.6.6、`06` §6.4.3、`09` §9.12.4、`14` 同步）；`04` §4.6.6 第 3 步补 “再次打开时结果列出改名后的路径”（观察 2 的同一句）。
- 观察 7：确认框仍与 “本 Goal 最近检查点” 比较，`10` §10.2 写明早于它的副本会多列出其后的改动、偏保守；按副本对应的检查点比较需要为每个副本记下来源，不做。
- 观察 8：`11` §11.7.1 登记少见配置：`AWS_BEARER_TOKEN_BEDROCK` 按 API Key 运行时注入、区域照 ① 传入且不补；`pi /login` 存储的 Bedrock profile 或令牌优先，与终端相同；改用 profile 之后旧的原始密钥仍按并存优先，写出移除入口；Web Identity（`AWS_WEB_IDENTITY_TOKEN_FILE` 与 `AWS_ROLE_ARN`）、`AWS_BEDROCK_SKIP_AUTH`、`AWS_BEDROCK_FORCE_HTTP1`、`PI_CACHE_RETENTION` 只在终端中生效；Anthropic 工作负载身份联合见 R101-D5-01 (b)。
- 观察 9：`11` §11.3.4 代价一段的出口改为 “把该 Goal 设为高风险（M1 中对单个 Goal 不加载 MCP 的唯一做法，同时也不加载用户扩展、并加计划闸门）”；`14` 增人备选中依赖链的轮次标签改为第 101 轮；`13` §13.11.3 的量级下界改为 0.25 GB；`16` `ProtoError.code` 的 `E_BUSY` 列入 `goal.delete_kept`。

**删除 / 推迟**
- 删除：`04` 中 Tower 交还或关闭检验之后删除副本或检验目录的三处复述；`11` 区域第 ③ 步 “这与终端中的 Pi 相同” 的不成立部分与无条件补 `us-east-1`；`inspect.bring_back` 与 `inspect.close` 以 “目录存在” 为前置条件；“合计（逻辑大小）超过 10 GB”；检验关闭选项 “保留目录，稍后决定”；`11` Engine Host 环境一行的 “其余一律删除”。
- 推迟：人的工作现场的批量删除（M2 决定点，E6 复审线越过时提前评估）；以头部发送的令牌与 Anthropic 工作负载身份联合的提供方式（M1 不提供）。
- `16` §16.1.13 补登第 101 轮被取代的说法 1 行，由 (D) 检查；lint (d) 的 DELETED 补一组严格匹配的措辞，round 100 的 “删除前的比较” 一组同样改为严格匹配（原规则下它被自身的 “删除” 豁免）；lint (v) 扩展到 `06` §6.4.7。

- **lint**：全部检查 `--checks rstuvwxyzckdnSeRqpoPiDgKYATFMBOJCH`，exit 0；见 `reviews/round-101-lint.md`。
- **排期**：+0.04 人周（WBS 124.08 → 124.12）：W17 +0.02、W19 +0.01（设计）；W7 +0.01（系统，W7-rest）；其余按 WBS 行不足 0.01。
  - 按 ADR-136 的常规规则在余量之内吸收，**M1 维持 39 周**（2026-11-09 → 2027-08-06；第 35 周末冻结，2027-07-09；M2 至 2027-11-12；M3 至 2028-02）。
  - `14` §14.3.4 与 ADR-133 第 101 轮补记一致：余量 系统 1.10、Agent 1.12、桌面 1.06、设计 1.00、安全 1.12；依赖链 19.91；最长线仍为设计（29.00）。
  - **增 1 人方案仍为 34 周**：130.16 / T 24.03 / 27 个工作周，第 30 周末冻结（2027-06-04），至 2027-07-02（新人约 2.43 人周安全线工作）；下一个台阶仍是全部工作超过 135.52 人周（35 周）。

## 第 102 轮对抗评审（全范围）后的跨文档决策（ADR-230）

## ADR-230 运行时注入让位于存储的凭据、Host 环境的变量只在一处列出、`hostExpected` 按 Run 清除、存储提示的已查看是界面状态、提交数遍历全部 ref 并按已知提交 id 停止、清除结果补列 `mcp.log` — Accepted（R102 全部条目与评审结论中的观察；Amends ADR-229、ADR-228、ADR-049；M1 维持 39 周，增人备选仍为 34 周；Amended by ADR-231）

选择原则（收敛规则，同 ADR-186–229）：只用三种办法关闭条目——(1) 把说法改弱但为真；(2) 删除或推迟不属于 M1 主循环的机制；(3) 在已有的唯一定义处加至多一条守卫、一行或一个字段。本轮 8 条次要条目都在已有的唯一定义处加一句或一行；其中三条是 ADR-229 修法带出的分支（R102-D13-02、R102-D15-01、R102-D5-01），一条把一处循环的两半定义合为一处（R102-D15-01），一条把没有协议落点的状态改写为界面状态（R102-D8-01）。
- 与 `pi /login` 存储的凭据的先后（`11` §11.7.1 模型凭据一行新增一段唯一定义）：运行时注入只在没有存储凭据时进行；
- Host 环境的变量（`05` §5.3.6 白名单一行改为唯一定义）：逐类列出全部变量，`11` 只引用；端口与 Tower 标识不在 Host 环境中；
- 挂死（`08` §8.6.3，唯一定义不变）：`hostExpected` 按 Goal、按 Run 置位与清除；
- 存储提示（`08` §8.1，唯一定义不变）：已查看是界面状态、推送主题、设置入口最多一枚 `◇`、F8 是应用级横幅；
- Tower 执行 git 的唯一加固清单（`10` §10.1.2 “已脱离副本的求值”一行）：用途扩到交还对话框，提交数的遍历与停止；
- 人的工作现场不自动删除与使用中（`10` §10.2，唯一定义不变）：求值失败的回落、没有 Goal 行的目录、`listedAt`、使用中而检验目录已不存在。

新增的只有：`goal.delete_kept` 的一个字段 `listedAt`、`11` §11.7.1 模型凭据一行的一段先后规则（复用 Pi 已导出的 `readStoredCredential` 与 `removeRuntimeApiKey`）、`09` §9.12.1 一行与“清除之后仍可能存在的副本”一条。不新增状态、事件类型、表、列、命令、决定种类、Needs-You kind、landmark、`wait_reason` 值、锁或常驻进程；存储提示的“已查看”不新增命令（改为界面状态）。安全不变式全部保留：Tower 不会自动把机密交给 Agent 可影响的进程——模型密钥仍只经运行时注入、只在 Host 内存中（不注入时 Pi 读你自己的 `auth.json`，与终端相同），bearer 令牌与原始密钥并存时连投递文件都不写，`ANTHROPIC_AUTH_TOKEN` 仍不放进 Host 环境；沙箱外的 Tower 进程不在 Agent 可控的 git 元数据上运行 git——交还对话框的提交数与删除确认框一样只由隔离 worker 只读解析 H/.git；沙箱外进程不可发现卫星——`GIT_CEILING_DIRECTORIES` 明确列在 Host 环境的唯一定义中；Tower 从不自动删除人的工作现场，`goal.delete_kept` 仍只在本机、由人确认，确认框过期或求值失败时都不静默删除。安全问题只写到设计层面。

**Pi v1.2.0 核实**（`git show v1.2.0:<path>`；`packages/coding-agent/src/` 下，另注 `ai`）
- `core/runtime-credentials.ts:24-28`：`read` 先返回运行时覆盖、再读存储；`:16-18`：`removeRuntimeApiKey`。`core/model-runtime.ts:621-632`、`:634-640`：`setRuntimeApiKey` 与 `removeRuntimeApiKey` 都公开。`ai/src/auth/resolve.ts:27-31`（注释“A stored credential owns the provider: ambient/env is consulted only when nothing is stored”）、`:70-92`。`ai/src/providers/anthropic.ts:30-46`：存储的密钥先于 `ANTHROPIC_AUTH_TOKEN`、`ANTHROPIC_OAUTH_TOKEN`、`ANTHROPIC_API_KEY`；`ai/src/providers/amazon-bedrock.ts:61-64`：存储凭据的 `key` 先于 `AWS_BEARER_TOKEN_BEDROCK`，`:64` 令牌先于 profile 与原始密钥对。`core/auth-storage.ts:497-507`：`readStoredCredential(providerId, authPath)` 同步读一个 provider 的存储凭据，`index.ts:26` 自包入口导出。R102-D5-01 成立。
- `extensions/mcp/index.ts:369-371`：`options.logPath ?? join(getAgentDir(), "mcp.log")`；`extensions/mcp/log.ts:1-5, 43-56`：逐条追加 `notifications/message`，超过 5 MB 时轮转为 `mcp.log.1`。R102-D12-01 成立。
- 观察 1：`ai/src/providers/amazon-bedrock.ts:65-70`（存储凭据带 `env.AWS_PROFILE` 时返回该 `env`）、`core/model-runtime.ts:682-685`（`resolution.env` 并入请求）、`:109-112, 218`（`credentials` 只接受一个 `CredentialStore`）；`package.json` 的 `exports` 只有 `.` 与 `./rpc-entry`，`index.ts` 不导出 `AuthStorage`。观察 2：`core/model-runtime.ts:891`（`registerNativeProvider`）。观察 10：`core/model-runtime.ts:676` 抛出 `Provider is not configured`（`ai/src/models.ts:865-866` 是 pi-ai 自己的请求路径）；`ai/src/providers/anthropic.ts:49-69`（工作负载身份联合只读指向文件的变量与 id）。

**条目（R102 追问清单）**
- **R102-D5-01**（运行时注入的密钥压过 `pi /login` 存储的凭据；ADR-229 新写的 “与终端相同” 对 bearer 一支不成立）：取评审的第一种写法。**唯一定义** `11` §11.7.1 模型凭据一行 “与 `pi /login` 存储的凭据的先后”：Tower 只在你的 `auth.json` 中没有该 provider 的存储凭据时注入导入的密钥——每次 `host.spawn` 与每个 Run 创建会话之前以 `readStoredCredential` 检查，有存储的凭据时不调用 `setRuntimeApiKey`、已注入的以 `removeRuntimeApiKey` 移除，所以用哪份凭据、由谁计费与终端相同；首次运行与模型选择器写明 `已有 pi /login 的凭据，Tower 用它`；Host 运行中的 `/login` 从下一个 Run 起生效（如实写明）。〔ADR-231 更正〕`readStoredCredential` 只看条目是否存在、不解析 `$VAR` 与 `!` 命令、不看 `models.json`，“进行中的 Run 仍用已注入的密钥”在打包模式与 Run 中途 `/logout` 时不成立；改由不带运行时覆盖的探查运行时的 `checkAuth` 判定，检查按 Host 进行，见 ADR-231。`ANTHROPIC_AUTH_TOKEN` 与其他来源并存时：有存储的凭据时两边都用它、不标注；只与 `ANTHROPIC_API_KEY` 并存时如实标注 `你的终端用 ANTHROPIC_AUTH_TOKEN，Tower 用 ANTHROPIC_API_KEY`。`11` §11.7.1 “云 SDK 凭据链” 少见配置一句改为：存储了 Bedrock 的凭据时 Tower 也不注入令牌，用哪份凭据与终端相同，区域仍按 ①–③ 传入、可能不同；`AWS_BEARER_TOKEN_BEDROCK` 与原始密钥对并存时，终端用令牌，Tower 同样只注入令牌、不导入原始密钥、不写投递文件、不设 `AWS_PROFILE`，与终端相同。`05` §5.3.6（SDK 一条、首次运行）、`04` §4.18.1 第 2 步、`16` 云 SDK 凭据一行同步；G46 (d) 补第八组。没有采用第二种写法（“如实登记导入的密钥优先”）：它让同一用户在终端与 Tower 中由不同的账户计费，而 Pi 已导出所需的两个函数，检查只是一次同步读文件。
- **R102-D6-01**（复用的 Host 上该 Goal 新一个 Run 的准备阶段仍计入看门狗）：`08` §8.6.1 `hostExpected` 一行的清除条件改为 “该 Goal 的 Run 结束（`run.ended`），或该 Host 进程退出”，置位改为 “该 Run 的 `run.started`，每个 Run 重新置位”；§8.6.3 “挂死” 的唯一定义补一句：`hostExpected` 按 Goal、按 Run 置位，Host 跨 Run 保留时（暂停不足 5 分钟后继续、返工，`06` §6.1.8）同一 Goal 下一个 Run 的准备阶段同样只由 120 s 准备时限判定。G35c (x) 补一组（复用的 Host 上会话创建阻塞 45 s 不判挂死）。
- **R102-D8-01**（存储提示的 “已查看” 没有协议落点；与项目级 `◇` 并存的排布）：取评审的第三种写法——**“已查看” 改为界面状态**（`08` §8.1 “存储提示”）：条件由 Supervisor 求出，随 `system` 主题（存储占用，`06` §6.4.2）推送；已查看不发命令、不经 Supervisor、不持久化，每个窗口各自记，界面重新加载或 Tower 重启之后条件仍成立时再显示一次。这比复用 `project.local_files.viewed` 一类水位简单：存储提示不是事件，没有序号可记，复用水位要新增一个命令与一个 scope。设置入口最多一枚 `◇`：只有一类时照原样，两者并存时合为 `◇ N 项`（N 为有通知的项目数加 1），点击进入设置，存储面板与有通知的项目各带 `◇`；48px 细栏不显示（`04` §4.1.2）。`04` §4.3.2 侧栏表同步。
- **R102-D11-01**（交还对话框的提交数要读 H/.git，而唯一加固清单的新行只覆盖删除确认框）：`10` §10.1.2 “已脱离副本的求值” 一行的用途扩为 “`goal.delete_kept` 的确认框与交还对话框中被忽略的提交数（`ignoredCommits`）”，两者同一解析器、同一遍历规则（R102-D13-01 (a)），交还时不在 H/.git 上运行 git；§10.1.3 “读取 gitdir” 的用途列举与 §10.8.4 第 5 步同步。G46 的 `core.fsmonitor` 一组补交还对话框的断言。
- **R102-D12-01**（Pi 的内置 MCP 扩展把服务器日志写进用户 agentDir 的 `mcp.log`）：取评审的第一种写法。`09` §9.12.4 “清除之后仍可能存在的副本” 补一条：`mcp.log` 与 `mcp.log.1` 由 Pi 写入、终端与 Tower 共用、不能按 Goal 区分，Tower 不删除，结果列出这两个路径；§9.12.1 存储表补一行。没有采用传 Tower 自有的 `logPath`：那会让 Tower 多一份要管理与清除的日志，而终端中的 `pi` 仍写原位置，清除结果仍要列出它。
- **R102-D13-01**（删除确认框的提交数、求值失败、没有 Goal 行的目录）：(a) `10` §10.1.2 同一行：从 `HEAD`、全部 loose ref 与 `packed-refs`（含人新建的分支与 `refs/stash`）沿父链数提交，遇到 Supervisor 交给 worker 的本 Goal 已知提交 id（数据库中记录的检查点、pin、seal 与 base 的提交）或对象库中没有的对象即停；按提交 id 判定，所以 `repack` 之后结果不变；只在 reflog 中的提交不计入，所以写 `至少 N 个提交` 并列出所在的 ref 名；达到解析器 200 个提交的上限时写 `200+ 个提交`；没有已知 id 时只以对象缺失为界，偏保守。没有采用评审建议的 “以 reflog 第一条取起始检查点”：reflog 是 H/.git 中人与 Agent 代码都能改写的文件，已知 id 来自 Tower 自己的数据库。(b) `10` §10.2：求值的任何一步失败（含磁盘满时临时索引写不出对象、解析超时）时，该部分写 `无法计算，删除前请自行检查`，其余照常列出，删除仍可用、确认按钮写 `仍然删除`——磁盘满时人仍能在 Tower 中释放空间。(c) 没有 Goal 行的目录标 `来源未知（清除全部后遗留）`，删除流程相同；`goal.delete_kept` 对它只校验路径在已知 Project 的 `<wtRoot>` 之下、名字为所列形状，不要求 Goal 行存在。`04` §4.15 存储面板、`06` §6.4.3 `goal.delete_kept` 一行同步；G46 补组。
- **R102-D13-02**（“使用中” 取代 “目录存在” 之后，使用中而目录已不存在的一支）：`10` §10.2 “使用中” 的唯一定义后加一句：使用中而检验目录已不存在时，`inspect.close` 照常成功并结束检验（停止服务、回收端口段，不比较，结果写明 `检验目录已不存在，没有可带回的内容`），`inspect.bring_back` 返回 `E_STATE`（`检验目录已不存在`）。`06` §6.4.3 两行的括注同步（`inspect.close` 改为 “含已脱离的目录”）。
- **R102-D15-01**（Host 白名单的引用过滤漏掉 `GIT_CEILING_DIRECTORIES`，带入 “用户显式放行的变量” 与按 Goal、按 Run 变化的变量）：**唯一定义** `05` §5.3.6 白名单一行改为 “Host 环境的变量”，逐类列出 Host 进程环境中的全部变量（① 基础白名单与七个工具链变量，与 `16` §16.8 同一组；② Host 的 `TMPDIR`；③ Pi 运行开关；④ 包管理器位置变量；⑤ 代理；⑥ `GIT_CEILING_DIRECTORIES` 与 `GIT_CONFIG_*`；⑦ 经确认的云 SDK 与 provider 配置变量，变量名只以 `11` §11.7.1 “云 SDK 凭据链” 一行为准），此外一律删除；删去 “用户显式放行的变量”；端口与 `TOWER_GOAL_ID`/`TOWER_RUN_ID` 两行的 Host 一列改为 “—”，它们只经每个 Run 的 `bashEnv`、Tower `exec`、验证器与检验的环境传入（与 `10` §10.19 一致）。`11` §11.7.1 Engine Host 环境一行改为只引用它，MCP 的基础环境与 §5.3.5 `mcpBaseEnv` 引用其中的 ①，`06` §6.2.4、`16` §16.8 同步。工具链变量由开放列表（“…”）改为与 `16` §16.8 相同的七个，偏严。没有新增评审建议的可选 lint：只剩一处定义，引用不再按列过滤。

**评审结论中的观察（R102 结论部分）**
- 观察 1：**更正 ADR-229 给出的理由**。ADR-229 以 “请求级 `env` 会话路径不传（`model-runtime.ts:671-675`）” 说明 Tower 不能不经进程环境给出 profile，漏了存储凭据的 `env` 一支：自定义 `CredentialStore` 返回带 `env.AWS_PROFILE` 的凭据时 Pi 会用它，区域与终端相同。这条路不可取的真实理由是 `ModelRuntime` 只接受一个凭据存储，它同时承担你的 `auth.json` 中 OAuth 令牌的刷新与落盘，而文件型 `AuthStorage` 不从包入口导出，Tower 要自己实现 `auth.json` 的读写与跨进程锁——D57 不采用的正是这一类。结论不变。`11` §11.7.1 “云 SDK 凭据链” 一行改写依据，ADR-229 的 Pi 核实一条加〔ADR-230 更正〕。
- 观察 2：`11` §11.7.1 模型凭据一行登记 `registerNativeProvider` 这条途径与不采用的理由（要随 Pi 的每个版本维护 Anthropic provider 的副本）。
- 观察 3：`08` §8.1 写明磁盘满（`06` §6.8 F8）是应用级横幅：显示在主窗口顶部直到解除，不是 Needs-You，不经过级别，不计入 Dock 角标与打扰预算，取自 Supervisor 的进程内状态、随 `system` 主题推送；`06` F8 一行改为引用。
- 观察 4：`00` §0.5.1 凭据一行的影响列补 “部分凭据类型只在你的终端中可用，首次运行如实标注（`11` §11.7.1）”。
- 观察 5：`goal.delete_kept` 增一个字段 `listedAt`（确认框求值的时刻）；所列路径上目录的建立时间晚于它时返回 `E_STATE`、界面重新求值；从 `running` 接管时 drain 之后的改名同样先等进行中的 `goal.delete_kept` 结束（`10` §10.2、`06` §6.4.3）。
- 观察 6：`10` §10.4.4 估计独占大小限定在 0 与逻辑大小之间，没有记录时取逻辑大小；合计在每次产生或删除这类目录之后与打开存储面板时求值；`13` §13.11.3 同步。
- 观察 7：`14` E6 复审线写明窗口：任一次每周计量时的存量（M1 中即自用期内任一次计量）；“与对应检查点相同的副本” 的份额不由 E6 度量，属于 M2 决定点自己的数据。
- 观察 8：“逐个 `删除`” 统一为 “由人逐行或多选 `删除`”（`08` §8.1、`10` §10.3.2、`06` §6.8 F8、`14` §14.4.1），M2 的 “一键批量删除” 写明 “不需逐个选择”。
- 观察 9：`09` §9.12.4 的清除结果对带了本地机密文件的检验目录另注明 `含本地机密文件的副本`。
- 观察 10：`11` §11.7.1 与 D62 的抛出位置改为 coding-agent `core/model-runtime.ts:676`；Anthropic 工作负载身份联合写明 “范围选择而不是做不到”（与 Vertex 同类，推迟到 M2）；`14` G46 标题的 ADR 列表补到 ADR-230、轮次补到 R102；`14` W17 的 “F8” 改为 “`06` §6.8 F8”。

**删除 / 推迟**
- 删除：`05` §5.3.6 “用户显式放行的变量”；端口与 Tower 标识的 Host 一列 ✔；`11` Engine Host 环境一行按 “Host 列为 ✔” 的引用过滤与它自己的变量列举；工具链变量的开放列表；`08` §8.1 “已查看只是 Supervisor 的进程内状态”；`hostExpected` 只在 Host 退出时清除；提交数只沿一条分支数、以对象缺失为唯一停止条件；`inspect.close` 把 “不存在” 归入 “不在使用中”；`11` 少见配置中对 bearer 一支不成立的 “与终端相同”。
- 推迟：Anthropic 工作负载身份联合的提供（M2，与 Vertex 同一规则）。
- `16` §16.1.13 补登第 102 轮被取代的说法 1 行，由 (D) 检查。

- **lint**：全部检查 `--checks rstuvwxyzckdnSeRqpoPiDgKYATFMBOJCH`，exit 0；见 `reviews/round-102-lint.md`。
- **排期**：+0.03 人周（WBS 124.12 → 124.15）：W7 +0.02（W7-rest +0.01，系统；W7-fs +0.01，安全）；W16 +0.01（设计）；其余按 WBS 行不足 0.01。
  - 按 ADR-136 的常规规则在余量之内吸收，**M1 维持 39 周**（2026-11-09 → 2027-08-06；第 35 周末冻结，2027-07-09；M2 至 2027-11-12；M3 至 2028-02）。
  - `14` §14.3.4 与 ADR-133 第 102 轮补记一致：余量 系统 1.09、Agent 1.12、桌面 1.06、设计 0.99、安全 1.10；依赖链 19.91；最长线仍为设计（29.01）。
  - **增 1 人方案仍为 34 周**：130.19 / T 24.03 / 27 个工作周，第 30 周末冻结（2027-06-04），至 2027-07-02（新人约 2.44 人周安全线工作）；下一个台阶仍是全部工作超过 135.52 人周（35 周）。

## 第 103 轮对抗评审（全范围）后的跨文档决策（ADR-231）

## ADR-231 是否注入导入的密钥由 Pi 自己判定、Host 环境补企业 CA 变量、重新接上的 Host 只为进行中的 Run 置位、磁盘满以 `app_quit` 暂停并自动解除、打开检验按状态判定、租约下的目录不可删除 — Accepted（R103 全部条目与评审结论中的观察；Amends ADR-230、ADR-229、ADR-227、ADR-049；M1 维持 39 周，增人备选仍为 34 周；Amended by ADR-232、ADR-233、ADR-234）

选择原则（收敛规则，同 ADR-186–230）：只用三种办法关闭条目——(1) 把说法改弱但为真；(2) 删除或推迟不属于 M1 主循环的机制；(3) 在已有的唯一定义处加至多一条守卫、一行或一个字段。本轮另加一条取向：能交给 Pi 自己的逻辑的，不在 Tower 中重写。本轮 7 条次要条目都在已有的唯一定义处加一句或一行；其中四条是 ADR-230 修法带出的分支（R103-D5-01、R103-D6-01、R103-D13-01、R103-D15-01 (a)），R103-D5-01 以删除关闭：删去 Tower 自己的 `auth.json` 条目检查，改问 Pi。
- 与你的 Pi 配置中凭据的先后（`11` §11.7.1 模型凭据一行，唯一定义，原名“与 `pi /login` 存储的凭据的先后”）：改由 Pi 的 `checkAuth` 判定，按 Host 进行；
- Host 环境的变量（`05` §5.3.6，唯一定义不变）：⑤ 加 `NODE_EXTRA_CA_CERTS`，① 的取值与 ④ 同一规则；
- `hostExpected`（`08` §8.6.1，唯一定义不变）：重新接上一支只为有进行中 Run 的 Goal 置位；
- 磁盘满（`06` §6.8 F8，唯一定义）：drain 的原因、写入次序、只读的解除；
- “使用中”（`10` §10.2，唯一定义不变）：`inspect.open` 按状态判定；人的工作现场不自动删除（同处）：租约只读时的标注与删除。

新增的只有：`Run.outcomeReason` 的一个已用值 `disk_full`（开放字符串，`16` §16.1.4）、`12` §12.8 应用级横幅的一条视觉规则、`16` §16.2.6 磁盘预算一行中 F8 解除的阈值（30 s、2 GB）、Host 环境中的一个变量 `NODE_EXTRA_CA_CERTS`、`06` §6.8 F7 运行期的一个检测键。不新增状态、暂停原因、事件类型、表、列、命令、字段、决定种类、Needs-You kind、landmark、`wait_reason` 值、锁或常驻进程；删去 ADR-230 对 `readStoredCredential` 的依赖。安全不变式全部保留：Tower 不会自动把机密交给 Agent 可影响的进程——模型密钥仍只经运行时注入、只在 Host 内存中，Host 环境中仍没有任何模型密钥，探查运行时不带运行时覆盖、不刷新 OAuth、用后丢弃，`$VAR` 与 `!` 命令按你自己的 Pi 配置由 Pi 在 Host 中解析（与终端中的 `pi` 相同，Tower 不另传变量）；Host 环境不引用 Agent 可写的位置——`NODE_EXTRA_CA_CERTS` 与 ① 的工具链变量落在其中时不传入，它不进入 Agent 的 bash；沙箱外的 Tower 进程不在 Agent 可控的 git 元数据上运行 git——提交数的遍历仍由隔离 worker 只读解析；Tower 从不自动删除人的工作现场，且不删除另一个 Tower 安装正在使用的目录。安全问题只写到设计层面。

**Pi v1.2.0 核实**（`git show v1.2.0:<path>`；`packages/coding-agent/src/` 下，另注 `ai`）
- R103-D5-01：`core/model-runtime.ts:109-124, 217-218`（`ModelRuntime.create` 接受 `authPath`、`modelsPath`、`refreshOnCreate`，以 `RuntimeCredentials` 包住文件型存储）、`:485-487`（`checkAuth` 转给 `Models.checkAuth`）、`index.ts:232-236`（`ModelRuntime` 自包入口导出）；`ai/src/models.ts:657-692`（`checkProviderAuth` 与 `checkAuth`：OAuth 条目 `:662-664` 不刷新，其余经 provider 的 `check` 或 `resolveProviderAuth`）、`:649-655`（读不出凭据时抛 `ModelsError("auth")`）；`core/provider-composer.ts:438-456`（组合后的 `check`：有存储凭据时看解析后的 `key`，否则 `models.json` 的 `apiKey`——`!` 命令不执行、`$VAR` 只查变量是否存在——再到 provider 自己的环境判定）、`:457-473`（请求时的同一先后）；`core/auth-storage.ts:442-448`（`read` 以 `resolveConfigValue` 解析 `key`）、`:333-346`（同一 `authPath` 的存储共享读取状态）、`:393-399, 402-440`（在文件锁内读取，读不出且带信号时抛出）；`core/resolve-config-value.ts:88-89`（`$VAR` 只取条目的 `env` 与 `process.env`）、`:145-151`、`:185-216`（`!` 命令以 shell 执行、10 s 时限、结果在进程内缓存）；`core/runtime-credentials.ts:6, 24-28`（覆盖是一张表，`read` 先返回覆盖）；`core/model-runtime.ts:646-657`（`getProviderAuthStatus` 有覆盖时直接返回 `runtime`，`storedProviders` 只看条目是否存在，故不用于此处）、`:658-697`（每次请求重新求凭据）；`ai/src/providers/anthropic.ts:28-47`（存储的 `key` 为空时回落到环境变量）、`ai/src/providers/amazon-bedrock.ts:61-71`。评审所引 `core/auth-storage.ts:497-507`、`:442-447`、`resolve-config-value.ts:88-89, 145-151, 185-196`、`provider-composer.ts:457-473`、`model-runtime.ts:658-697` 均为原文，R103-D5-01 成立。
- R103-D5-02：`core/http-dispatcher.ts:81-100`（模型请求经 undici 的 `EnvHttpProxyAgent`，`setGlobalDispatcher`〔ADR-232 更正：这是 Pi CLI 入口上的行为，`configureHttpDispatcher` 不从包入口导出，SDK 嵌入的 Host 不经过它；Host 自己安装同一做法的分发器，见 ADR-232 R104-D5-03〕）；`packages/ai/src` 与 `packages/coding-agent/src` 中没有 `NODE_EXTRA_CA_CERTS`、`SSL_CERT_FILE`、`SSL_CERT_DIR` 的引用。Node 在进程启动时读取 `NODE_EXTRA_CA_CERTS`，`SSL_CERT_FILE`/`SSL_CERT_DIR` 只在 `--use-openssl-ca` 时使用（Node 文档）。R103-D5-02 成立。
- 观察 1：`extensions/mcp/runtime.ts:111-113`（`mcp.json` 的 `env` 值以 `resolveConfigValueOrThrow` 在 Host 中解析，解析不出即抛出）、`core/exec.ts:36-46`。观察 8：`packages/ai/src` 中没有 `AZURE_CONFIG_DIR`。观察 10：`ai/src/auth/credential-store.ts:40-56`（`modify`）、`agent-session.ts:3993-4000`（`navigateTree` 的流式与压缩检查）、`:2459-2469`（`abort`）、`ai/src/providers/amazon-bedrock.ts:65-70`（Bedrock 判定看 `AWS_PROFILE`）。

**条目（R103 追问清单）**
- **R103-D5-01**（存储凭据的检查把 `$ENV` 与命令形式的条目当作已有凭据、漏了 `models.json` 的密钥一层；进行中的 Run 的描述在打包模式与 `/logout` 时不成立）：不采用评审建议的“按条目形式判定”——那是在 Tower 中重写 Pi 的解析规则。**唯一定义** `11` §11.7.1 模型凭据一行改为“与你的 Pi 配置中凭据的先后”：导入的密钥来自 shell 的环境变量，是 Pi 先后中的最后一层，所以 Tower 只在 **Pi 自己判定**你的 Pi 配置中没有凭据时注入。每次 `host.spawn` 与每个 Run 创建会话之前，Host 新建一个不带运行时覆盖的探查运行时（`ModelRuntime.create({authPath, modelsPath, refreshOnCreate: false})`，同一份 `auth.json`、`models.json`），以 `checkAuth(provider)` 询问、用后丢弃；类型为 `oauth` 或 `source` 为 `stored credential`、`configured API key` 时不注入、已注入的移除，为空或来自环境时注入（Host 环境中没有模型密钥，环境一类的结果只可能来自 Tower 按 ⑦ 传入的变量）。于是 (a) `$VAR` 条目在 Host 中解析不出、判为没有，照 ADR-049 类型表导入该变量并注入，与终端结果相同；`!` 命令的条目在 Host 中以白名单环境执行，得到空值时同样注入（如实写明命令依赖的会话变量在 Tower 中没有）；(b) `models.json` 配了 `apiKey` 时不注入；(c) **范围**写明：每个 Host 一个 `ModelRuntime`，检查与注入按 Host 进行，在 Host 启动与该 Host 上每个 Run 开始时生效，正在进行的 Run 用该 Host 当前求出的凭据——打包模式下另一 Goal 的 Run 开始时的检查同样改变它，从下一次请求起生效；Run 中途 `/logout` 而没有注入时下一次请求由 Pi 判为未配置，按 F7 处理（`06` §6.8 F7 ① 补一个检测键 `Provider is not configured: <provider>`，`core/model-runtime.ts:676` 经 `:705-712` 与 `ai/src/api/lazy.ts:46-59` 成为错误消息），下一个 Run 开始时注入；`models.json` 中以 `!` 开头的 `apiKey` 在请求时执行失败的，以 Pi 自己的错误失败（`core/resolve-config-value.ts:229-238`），如实登记。探查读不出 `auth.json` 时按“没有”处理（观察 7）。首次运行与模型选择器的文案改为 `已有你的 pi 配置中的凭据，Tower 用它`〔ADR-232 更正：标注取自 Host 的检查，首次运行在任何 Host 之前，写 `第一次运行时由 Pi 判定：…`；扩展注册的 provider 不注入〕。`05` §5.3.6（SDK 一条、首次运行、D57）、`04` §4.18.1 第 2 步、`16` 云 SDK 凭据一行同步；ADR-230 的 R102-D5-01 一条加〔ADR-231 更正〕；G46 (d) 补第九组（`$VAR`、`!` 命令、`models.json`、打包模式、Run 中途 `/logout`）。没有用 `getProviderAuthStatus`：它在有运行时覆盖时直接返回 `runtime`，`stored` 一支只看条目是否存在（`model-runtime.ts:646-657`），与 `readStoredCredential` 同样不解析条目。
- **R103-D5-02**（Host 环境的封闭列表没有 CA 证书变量）：取评审的第一种写法。`05` §5.3.6 “Host 环境的变量” ⑤ 与代理一行加 `NODE_EXTRA_CA_CERTS`：Pi 不自己读取 CA 设置，Node 只在进程启动时读取它，所以必须在 Host 环境中；取最近一次从登录 shell 读到的值（首次运行记录，与代理一起告知，“重新读取”替换），指向 Agent 可写位置时不传入并写明原因；随 ⑤ 进入 `mcpBaseEnv`，不进入 bash（S2 一行不变）。`SSL_CERT_FILE`、`SSL_CERT_DIR` 不传入：Node 默认不用、Pi 不读。`00` §0.5.1 S2 一行补“Tower 自己的运行进程不受此限”；G46 (d) 第九组的 CA 一组。
- **R103-D6-01**（重新接上的 Host 在没有 Run 时置位 `hostExpected`）：取评审的写法。`08` §8.6.1 `hostExpected` 一行的第二个置位分支只对在该 Host 上有已过 `run.started`、尚未 `run.ended` 的 Run 的 Goal 置位，其余 Goal（暂停中、准备阶段中）等其下一个 Run 的 `run.started`；§8.6.3 “挂死”一句同步。G35c (x) 补两组（暂停不足 5 分钟后只杀死 Supervisor 再继续、准备阶段中只杀死 Supervisor）。
- **R103-D6-02**（F8 的 drain 去向、只读状态的解除与横幅的定义）：**唯一定义** `06` §6.8 F8 一行：drain 以已有原因 `app_quit` 暂停——磁盘满与应用退出同属 Tower 整体停下、与该 Goal 无关，解除的规则也相同，所以不另设暂停原因（lint (s) 的集合不变）；`run.ended` 的 `outcome_reason` 写 `disk_full`，卡片写 `已暂停 · 磁盘已满 · 释放空间后自动恢复`（`12` §12.6.5）。drain 的写入先于只读切换；写不进时（SQLite 回滚整个事务）不重试，Run 照样被中止，目标留在 Supervisor 进程内、恢复可写时先补写〔ADR-234 更正：它与进行中的写回、卫星重建写不进的失败出口同记入 F8 的待补失败出口列表，解除时先执行〕；Supervisor 其间重启时按 §6.1.6 的同一规则进入 `paused{app_quit 或 engine_crash}`。只读期间会写数据库的命令返回 `E_STATE`，`goal.delete_kept` 照常可用。**解除**：每 30 s 与每次 `goal.delete_kept` 之后复查发生过 `ENOSPC` 的卷，可用空间都 ≥ 2 GB 时恢复可写、撤下横幅、恢复准入，不需要重启；本次由 F8 暂停、只有 `app_quit` 的 Goal 按 §6.1.4 第 5 项解除（只在 `resumeOnLaunch` 打开时）〔ADR-232 更正：解除对原因含 `app_quit`、最后一个 Run 的 `outcome_reason` 为 `disk_full` 的全部暂停中 Goal 按第 5 项移除 `app_quit`，集合由数据库求出；只读期间 Supervisor 启动时先复查空间；进行中的验证与准备阶段另有去向〕〔ADR-233 更正：复查的卷为 `~/.tower` 与各 `<wtRoot>` 所在卷（从数据库读出），求不出的卷按不足计；Supervisor 其间重启时，Run 的结果按 F8 “只读期间 Supervisor 启动” 的规则由 §6.1.6 “Run 中崩溃” 一行求出〕。`12` §12.8 补应用级横幅的视觉（通栏、中性底、`◇`，不用状态色，不计入覆盖层）；`04` §4.18.3 补磁盘满一行；`16` §16.2.6 磁盘预算一行登记阈值；`02`、`06` DDL 注释与 `16` §16.1.4 登记 `disk_full`；G35e (q) 一组。没有新增暂停原因：它要在 `02`、`03`、`06`、`12`、`16` 五处登记并给出新的恢复出口，而它的恢复出口与 `app_quit` 完全相同。
- **R103-D13-01**（使用中而检验目录已不存在时 `inspect.open` 新建第二个检验）：`10` §10.2 “使用中”的唯一定义后补一句：打开检验同样按状态判定，检验仍使用中时不论目录是否存在都返回 `E_STATE`、不新建，界面指向 `inspect.close`。`10` §10.8.3 第 1 步、`06` §6.4.3 `inspect.open` 一行同步；G46 同一组补打开一步。
- **R103-D13-02**（另一个 Tower 安装持有租约时，`<wtRoot>` 中它的目录被标为来源未知并可删除）：`10` §10.2 “列出的来源”补一句：该 Project 因另一个安装的仓库租约（`_owner`，`06` §6.1.9）而只读时，没有本机 Goal 行的这类目录标 `另一台 Tower 正在使用`（`hostname` 与本机相同时写 `另一个 Tower 安装正在使用`），不提供 `删除`，`goal.delete_kept` 返回 `E_STATE`；租约过期并由本机接管之后照常。`06` §6.1.9 只读的范围补 “不删除这些目录”，`06` §6.4.3 `goal.delete_kept` 一行同步；G46 补一组。取“不允许删除”而不取“显式确认后允许”：租约本就要保证 Tower 不破坏另一个安装，接管租约是已有的出口。
- **R103-D15-01**（`06` §6.2.4 的残留复述；① 中工具链变量的取值来源）：(a) `06` §6.2.4 准入链删去括号中 Host 环境变量的复述，只留“变量的完整列表只按 `05` §5.3.6”，旧写法登入 `16` §16.1.13 第 103 轮一行，由 (D) 检查；(b) `05` §5.3.6 ① 的工具链变量取值与 ④ 同一规则（最近一次从登录 shell 读到的值，首次运行记录，“重新读取”替换，有值才传入，落在 Agent 可写位置时不传入），`PNPM_HOME` 只列在 ④；“首次运行检测”的“另取”与设置页列出的值补上 ① 的工具链变量与 `NODE_EXTRA_CA_CERTS`。

**评审结论中的观察（R103 结论部分）**
- 观察 1：封闭的工具链列表对用户可见——`00` §0.5.1 新增一行（只有七个工具链变量；扩展经 `pi.exec` 的子进程可能失败；`mcp.json` 的 `$NAME` 引用解析不出、该服务器不启动，写字面值即可）；`05` §5.10 静态清单在有扩展或 MCP 服务器时，确认卡片另写同一句。
- 观察 2：`listedAt` 取求值开始、第一次读取目录之前的时刻；卷不提供建立时间时改比较目录的 `ctime`（改名与顶层条目的增删都会更新它，偏保守，最多多一次重新求值），不新增字段（`10` §10.2）。
- 观察 3：交还对话框用同一写法（`至少 N 个提交`、`200+ 个提交`，求值失败写 `无法计算`），`ignoredCommits` 取数字或 `null`（`10` §10.1.2）；§10.1.3 “任何失败都省略该信息”注明这一例外；`04` §4.6.7 线框与 G46 同步为 `至少 1 个提交`。
- 观察 4：`含本地机密文件的副本` 由目录本身求出——所属 Project 的机密本地文件清单中任一路径存在于该目录中时注明，不依赖 `inspect_with_secrets` 的记录，`（已清除）`、`来源未知` 与人工编辑检出同样适用（`10` §10.2、`09` §9.12.4）。
- 观察 5：存储提示的“已查看”按四类条件分别记；48px 细栏（含窗口窄于 1100px）中设置图标带不含文字的 `◇`（`08` §8.1、`04` §4.3.2）。
- 观察 6：提交数沿全部父提交、从 `worktrees/*/HEAD` 一并起数，附注标签取所指提交、其他对象跳过，“`repack` 之后不变”限定为 H 起点之后的提交并登记以镜像中提交为起点时偏保守；嵌套仓库在确认框中另列一行；估计独占大小的 `mtime` 扫描只重扫变化的目录、在后台进行，`13` §13.11.3 写明成本与条目数成正比（`10` §10.1.2、§10.4.4）。
- 观察 7：随 R103-D5-01 不再使用 `readStoredCredential`；探查以 Pi 的文件锁读取 `auth.json`，读取失败时 Pi 抛出，Tower 按“没有”处理并注入，到下一次检查为止（如实登记，`11` §11.7.1）。
- 观察 8：`11` §11.7.1 与 `16` 云 SDK 凭据一行删去 `AZURE_CONFIG_DIR` 与“等”；`mcpBaseEnv` 只在 `05` §5.3.5 列出，`11` §11.7.1、T28 与 C21 改为引用（C21 断言 Host 的 `TMPDIR` 在其中）；④ 不进入 `mcpBaseEnv` 的后果如实登记；`16` §16.8 `PATH` 行的指向改为 `05` §5.3.6 ①。
- 观察 9：`06` §6.4.3 `goal.take_over` 一行补 “drain 之后的改名先等进行中的 `goal.delete_kept`”；`09` §9.12.4 的出处改为 `05` §5.3.5 “MCP 继承用户的 Pi 配置”一条与 §5.3.6 “Pi 运行开关”一行。
- 观察 10：四处 Pi 行号改为 `ai/src/auth/credential-store.ts:40-56`（D57）、`agent-session.ts` L3993–4000（`10` §10.8）、`:2459-2469`（`06` §6.1.4 drain 图）、`06` §6.1.6 的引文改为 `ai/src/providers/amazon-bedrock.ts:65-70`。
- 观察 11：`14` §14.3.4 增人备选的取整规则后补一句：T 先舍入时 5.5T − 2 与全部工作可差不到 0.03 人周，由向上取整为工作周数吸收；本轮恰好相等。

**删除 / 推迟**
- 删除：ADR-230 的 `readStoredCredential` 检查与它对 “有存储的凭据” 的判定；“正在进行的 Run 仍用已注入的密钥” 的无条件写法；`06` §6.2.4 Host 环境变量的复述；`11`、`16` 的 `AZURE_CONFIG_DIR` 与开放的 “等”；`11` 与 C21 中 `mcpBaseEnv` 的各自列举；细栏中不显示存储提示。
- 推迟：无。
- `16` §16.1.13 补登第 103 轮被取代的说法 1 行，由 (D) 检查。

- **lint**：全部检查 `--checks rstuvwxyzckdnSeRqpoPiDgKYATFMBOJCH`，exit 0；见 `reviews/round-103-lint.md`。
- **排期**：+0.03 人周（WBS 124.15 → 124.18）：W16 +0.02（设计）；W4 +0.01（桌面）；其余按 WBS 行不足 0.01。
  - 按 ADR-136 的常规规则在余量之内吸收，**M1 维持 39 周**（2026-11-09 → 2027-08-06；第 35 周末冻结，2027-07-09；M2 至 2027-11-12；M3 至 2028-02）。
  - `14` §14.3.4 与 ADR-133 第 103 轮补记一致：余量 系统 1.09、Agent 1.12、桌面 1.05、设计 0.97、安全 1.10；依赖链 19.91；最长线仍为设计（29.03）。
  - **增 1 人方案仍为 34 周**：130.22 / T 24.04 / 27 个工作周，第 30 周末冻结（2027-06-04），至 2027-07-02（新人约 2.43 人周安全线工作）；下一个台阶仍是全部工作超过 135.52 人周（35 周）。

## 第 104 轮对抗评审（全范围）后的跨文档决策（ADR-232）

## ADR-232 标注取自 Host 的检查、打包只合并扩展集合相同的 Goal 且扩展注册的 provider 不注入、Host 自己安装读代理变量的分发器、磁盘满的解除按第 5 项且覆盖验证与准备、覆盖层规则只在 `08`、G46 的同机标注 — Accepted（R104 全部条目与评审结论中的观察；Amends ADR-231、ADR-212、ADR-079；M1 维持 39 周，增人备选仍为 34 周；Amended by ADR-233）

选择原则（收敛规则，同 ADR-186–231）：只用三种办法关闭条目——(1) 把说法改弱但为真；(2) 删除或推迟不属于 M1 主循环的机制；(3) 在已有的唯一定义处加至多一条守卫、一行或一个字段。本轮另守一条取向：用最简单的约束代替新机制。本轮 7 条次要条目都在已有的唯一定义处加一句或一行：R104-D5-01 不另起求值进程，标注只取 Host 已有的检查；R104-D5-02 不在会话结束时注销扩展的 provider，改为一条打包的分组约束；R104-D6-01、R104-D6-02 不新增状态或暂停原因，沿用 §6.1.4 第 5 项、§6.1.6 `verifying` 一行与 `10` §10.3.1 “启动恢复”的已有出口。
- 与你的 Pi 配置中凭据的先后（`11` §11.7.1 模型凭据一行，唯一定义不变）：标注的求值进程、扩展注册的 provider、`!` 命令的同步与失败缓存、`models.json` 的 `$VAR`；
- 打包的分组（`06` §6.1.1，新的唯一定义，取代 `05` §5.3.6 “Pi 运行开关”一行的“Host 不因它们重启”）；
- 模型请求怎样经过代理（`05` §5.3.6 代理一行，新的唯一定义）；
- 磁盘满（`06` §6.8 F8，唯一定义不变）：解除的集合、只读期间的启动、进行中的验证与准备；
- 覆盖层的优先级与互斥（`08` §8.10.5，唯一定义不变）：`12` §12.8 只引用；
- 人的工作现场不自动删除（`10` §10.2，唯一定义不变）：租约只读到本机接管为止。

新增的只有：Host 向 Supervisor 报告的检查结论（每个有导入密钥的 provider 一项，只在 Supervisor 内存中，不持久化）、模型选择器的两种标注文字、Host 启动时安装的代理分发器（Tower 的代码）、`05` §5.11.1 的依赖行 D63、D64 与契约测试 C43、C44、`06` §6.7 自检剩余空间一项覆盖的卷。不新增状态、暂停原因、事件类型、表、列、命令、决定种类、Needs-You kind、landmark、`wait_reason` 值、锁或常驻进程；没有另起求值进程。安全不变式全部保留：Tower 不会自动把机密交给 Agent 可影响的进程——模型密钥仍只经运行时注入、只在 Host 内存中，Host 环境中仍没有任何模型密钥，`auth.json` 中的 `!` 命令只在 Host 中执行，Tower 的其他进程不求值；扩展注册的 provider 不再收到导入的密钥；打包的分组使 `riskTier=high` 与清单确认之前的 Goal 的模型请求从不经过用户扩展的代码，“高风险 Goal 不加载扩展”在模型请求的路径上同样成立；Host 环境不引用 Agent 可写的位置——代理分发器只读 Host 环境中已有的代理变量，不新增变量，`NODE_EXTRA_CA_CERTS` 的排除不变；沙箱外的 Tower 进程不在 Agent 可控的 git 元数据上运行 git；Tower 从不自动删除人的工作现场，也不删除另一个 Tower 安装正在使用的目录（租约过期而未接管的一段同样不删除）。安全问题只写到设计层面。

**Pi v1.2.0 核实**（`git show v1.2.0:<path>`；`packages/coding-agent/src/` 下，另注 `ai`）
- R104-D5-01：`core/resolve-config-value.ts:9-10`（命令结果按进程缓存）、`:88-89`（`$VAR` 取 `process.env`）、`:185-216`（`execSync`，`timeout: 10000`，失败时返回 `undefined`，`:213-214` 不分成败一并缓存）。
- R104-D5-02：`core/agent-session-services.ts:139-146`（传入的 `modelRuntime` 优先）、`:158-181`（会话创建时把扩展的 `registerProvider`、`registerNativeProvider` 写入该运行时）；`core/model-runtime.ts:891-957`（`registerNativeProvider`、`registerProvider`、`unregisterProvider`；会话结束没有调用 `unregisterProvider` 的路径，唯一调用来自扩展 API，`core/agent-session.ts:3504-3505`）、`:217-268`（`create` 只装内置 provider 与 `models.json`）、`:526-528`（`getRegisteredProviderIds()`）；`ai/src/models.ts:688`（未知 provider 的 `checkAuth` 返回 `undefined`）。
- R104-D5-03：`core/http-dispatcher.ts:81-113`（`configureHttpDispatcher`：`EnvHttpProxyAgent`、`setGlobalDispatcher`、`undici.install` 替换全局 `fetch`）、`:45-50`（`applyHttpProxySettings` 以 `??=` 补 `HTTP_PROXY`/`HTTPS_PROXY`）；调用处只有 `cli/setup.ts:12`、`main.ts:597, 875`（`httpProxy` 在 `:596, 874`）、`rpc-entry.ts:11`、`modes/interactive/interactive-mode.ts:2063, 5014`；`index.ts` 不导出它，`package.json` 的 `exports` 只有 `.` 与 `./rpc-entry`；`packages/coding-agent/package.json` 依赖 `undici` 8.10.2；`ai/src/api/bedrock-converse-stream.ts:222-227`（只有 Bedrock 自己按代理变量建 agent）；`packages/mcp/src/transports/streamable-http.ts:214`（HTTP 类 MCP 用全局 `fetch`）。评审所引各处均为原文；评审没有列出的 `rpc-entry.ts:11` 同样调用它，但那是 RPC 子进程的入口，SDK 嵌入不经过它，结论不变。
- 观察：`core/auth-storage.ts:75-79, 81-115`（构造时在锁内同步重读，至多约 200 ms 的忙等，文件不存在时建出 `{}`，观察 2）；`ai/src/providers/amazon-bedrock.ts:48-52, 61-71`、`google-vertex.ts:71-72, 85`（观察 3）；`core/provider-composer.ts:447-449, 467`（观察 6）；`ai/src/auth/helpers.ts:21`、`ai/src/providers/anthropic.ts:31`、`cloudflare-auth.ts:50`、`ai/src/models.ts:679-680`（观察 5）。

**条目（R104 追问清单）**
- **R104-D5-01**（首次运行与模型选择器的标注由哪个进程求出没有写）：取评审的第二种写法，不另起只做检查的进程。**唯一定义** `11` §11.7.1 模型凭据一行补“标注取自 Host 的检查”：判定只在 Host 中求出（`$VAR` 取所在进程的环境，`!` 命令的结果按进程缓存），`auth.json` 中的 `!` 命令只在 Host 中执行；Host 把每次检查的结论（每个有导入密钥的 provider 一项）交给 Supervisor，Supervisor 只在内存中保留最近一次；模型选择器按它写 `已有你的 pi 配置中的凭据，Tower 用它` 或 `Tower 用导入的密钥`〔ADR-233 更正：结论有第三种 `由扩展处理认证`；Supervisor 按 Host 保留，某个目标的标注取服务它的 Host 的结论〕；还没有结论时（首次运行在任何 Host 之前，或 Tower 启动之后还没有 Host 检查过）写 `第一次运行时由 Pi 判定：你的 pi 配置中已有凭据时 Tower 用它，导入的密钥只在没有时使用`。`05` §5.3.6 首次运行、`04` §4.18.1 第 2 步改为这一写法；ADR-231 R103-D5-01 一条加〔ADR-232 更正〕；G46 (d) 第八、九组的期望改写。不取“短时的探查进程”：它要另起一类进程，并在 Host 之外再执行一次你的 `!` 命令（可能再次触发密码管理器的提示）。
- **R104-D5-02**（扩展注册的 provider：探查看不到；跨 Run、跨 Goal 保留）：(a) `11` §11.7.1 补“扩展注册的 provider”：Host 运行时 `getRegisteredProviderIds()` 列出的 provider（扩展新建的，或以同名覆盖内置 provider 的），Tower 不注入、已注入的移除，认证由该扩展自己处理；Host 的第一个会话创建之后、第一次请求之前再做一次这一步；只覆盖 `baseUrl`、依赖 shell 中密钥变量的扩展在 Tower 中判为未配置，按 F7 处理，如实登记〔ADR-233 更正：列表在每个 Run 的会话创建之后与适配器每次投递之前读取，列出过的 provider 在该 Host 退出之前不再注入；代价是以内置 provider 的 id 注册的任何扩展，含只加模型或头部的〕。(b) **唯一定义** `06` §6.1.1 “打包的分组”：只把加载同一扩展集合的 Goal（`noExtensions` 相同，为假时已确认清单的哈希相同）放进同一 Host，`riskTier=high` 与清单确认之前的 Goal 从不与加载用户扩展的 Goal 共用 Host；Host 的扩展集合在第一个会话时确定，之后集合不同的 Run 不在该 Host 上开会话（专用模式下即先让旧 Host 按 §6.1.8 退出）。`05` §5.3.6 “Pi 运行开关”一行的“Host 不因它们重启”改为“Host 环境不因它们变化”并引用该定义；`06` §6.1.1 的代价一句与 `16` Host 粒度回退规则一行同步；`05` §5.11.1 D64、C44；G46 (d) 第十组。不取“会话结束时注销该会话的扩展 provider”：Pi 没有这条路径，Tower 要自己记录并逐个注销，且同一 Host 上并行的会话仍会互相看到。
- **R104-D5-03**（SDK 嵌入的 Host 中代理变量不使模型请求经过代理）：**唯一定义** `05` §5.3.6 代理一行补“模型请求怎样经过代理”：Pi 的 `configureHttpDispatcher` 只在 CLI 入口调用、不从包入口导出，所以 Host 启动时、Host 环境中有代理变量的，在任何模型请求与 MCP 连接之前，以 Tower 自己的代码安装同一做法的分发器（undici 的 `EnvHttpProxyAgent` + `setGlobalDispatcher`，同样替换全局 `fetch`，undici 取 Pi 所依赖的同一版本）〔ADR-233 更正：Host 启动时总是安装，不论有没有代理变量，选项与 Pi 相同——HTTP/1.1、连接尝试时限 2 s、空闲超时取 `httpIdleTimeoutMs`、`undici.install()`——且只用 Pi 所依赖的那一份 undici〕；Pi 设置中的 `httpProxy` 不读取，如实登记（`00` §0.5.1 同一行）。`05` §5.11.1 D63 与契约测试 C43；G46 (d) 第九组的 CA 一组改在只能经代理出网的网络中进行，并连接一个 HTTP 类 MCP 服务器。ADR-231 Pi 核实 R103-D5-02 一条加〔ADR-232 更正〕。不取“在 Host 环境中加入让 Node 读代理变量的开关”：它依赖 Node 版本，且与 Pi 自己的做法不同。
- **R104-D6-01**（F8 的解除只对单一原因的 Goal，与 §6.1.4 第 5 项、ADR-207 不一致；卡片的承诺）：**唯一定义** `06` §6.8 F8 的解除改为：恢复可写之后，原因含 `app_quit`、且最后一个 Run 的 `outcome_reason` 为 `disk_full` 的暂停中 Goal 按 §6.1.4 第 5 项移除 `app_quit`（只在 `resumeOnLaunch` 打开时，剩余原因非空则保持暂停），集合由数据库求出、不依赖 Supervisor 的进程内状态，所以只重启 Supervisor 之后规则相同；只读期间 Supervisor 启动（含只重启 Supervisor，ADR-207）时 §6.7 自检的剩余空间一项对 `~/.tower` 与各 `<wtRoot>` 所在卷检查，不足 2 GB 时以同一只读状态启动，中间状态检查推迟到解除时执行〔ADR-233 更正：只推迟会写数据库的检查；存活 Host 中的 Run 被中止，结果在解除时由 §6.1.6 “Run 中崩溃” 一行求出；不写数据库的清理照常执行〕。`12` §12.6.5 卡片的 `自动恢复` 一段只在 `resumeOnLaunch` 打开且 `app_quit` 是唯一原因时写（`应用退出` 一行同此）；`04` §4.18.3 只引用；`16` §16.2.6 磁盘预算一行登记启动时的检查；G35e (q) 补多原因一组与只写满 `<wtRoot>` 卷的 Supervisor 一组。ADR-231 R103-D6-02 一条加〔ADR-232 更正〕。
- **R104-D6-02**（只读期间进行中的验证与准备阶段没有去向）：`06` §6.8 F8 补“进行中的验证与准备”：进入只读时进行中的验证与应用退出时一样取消，不写 `verify.result` 与任何 Fact，Goal 保持 `verifying`，解除时按 §6.1.6 `verifying` 一行以同一 pin 重跑（与 `retry_verify{same}` 同一语义，不经人）；机会式验证直接丢弃；准备阶段中的 Goal 中止准备、不写数据库、留在 `ready`，解除时按 `10` §10.3.1 “启动恢复”回到排队、重新准入〔ADR-233 更正：准备步骤自己因 `ENOSPC` 失败时同样归 F8、不写 `prepare_failed`；③ 中只中止该 Goal 的会话创建，不终止 Host〕。验证命令自身因 `ENOSPC` 失败、而结论在检测到 `ENOSPC` 之前已经写入的，按标准的失败计，如实登记。G35e (q) 补一组。
- **R104-D8-01**（`12` 的“至多一个自动覆盖层”比 `08` 更严）：取评审的第一种写法。`12` §12.8 改为只引用 `08` §8.10.5 的互斥规则（同一时刻至多一个整页或浮层，提示条可以与之共存），删去“本文只规定”的数量规则，只留被压下的整页或浮层在侧栏顶部以一行入口保留的视觉；应用级横幅一条改为“不是 `08` §8.10.5 中的覆盖层”。
- **R104-D14-01**（G46 租约一组的期望与同机写法相撞）：取评审的第二种写法。G46 的前提写明另一份数据目录在同一台机器上，期望 `另一个 Tower 安装正在使用`；另以测试钩子把 `_owner` 的 `hostname` 改为另一台机器名重做一次，期望 `另一台 Tower 正在使用`，两次都不可删除。

**评审结论中的观察（R104 结论部分）**
- 观察 1：`11` §11.7.1 写明 `!` 命令同步执行、第一次检查时至多阻塞该 Host 的事件循环 10 s（低于 30 s 的挂死判定），失败的结果同样缓存到 Host 退出；`models.json` 中 `!` 形式的 `apiKey` 每次请求都执行、不缓存。
- 观察 2：`11` §11.7.1 写明探查构造的锁内重读（至多约 200 ms）与建出 `{}`，与 Host 自己的运行时相同，不联网、不刷新 OAuth、不加载扩展。
- 观察 3：`11` §11.7.1 “少见配置”登记没有 `key` 只带配置的存储条目（Bedrock 只带 `env.AWS_PROFILE`、Vertex 的存储 ADC 配置）。
- 观察 4：随 R104-D5-01，模型选择器写 `Tower 用导入的密钥`，并在 `11` §11.7.1 写明它包括 `!` 命令在 Tower 中得到空值、而终端中成功的情形，两边可能是不同的账户。
- 观察 5：D57 的复核范围补列没有 `models.json` 覆盖的内置 provider 自己的 `resolve` 给出的标签。
- 观察 6：`11` §11.7.1 写明 `models.json` 的 `apiKey` 写为 `$VAR` 而 Host 环境中没有该变量时判为没有、照 ADR-049 导入并注入。
- 观察 7：`05` §5.3.6 凭据一行删去“Azure 配置目录等”，旧写法登入 `16` §16.1.13 第 104 轮一行；`05` §5.10 的确认卡片把 MCP 服务器与扩展分开写（MCP 服务器看不到 `PNPM_HOME`）。
- 观察 8：`00` §0.5.1 S2 的 CA 一行登记 S0 下 `NODE_EXTRA_CA_CERTS` 不进入 bash、根证书只在钥匙串中的情形，以及“指向 Agent 可写的位置时不传入”。
- 观察 9：`10` §10.2 的只读条件改为“本机尚未接管”，含租约已过期而人尚未确认接管的一段；`06` §6.1.9 同步。
- 观察 10：`12` §12.8 横幅文字改为 `…；释放空间后自动恢复可写`（`resumeOnLaunch` 关闭时同样成立）；`04` §4.18.3 只引用 `12` §12.6.5；`02` §2.6 的举例补 `app_quit`；`16` §16.2.6 登记解除阈值低于磁盘压力、可能多次进入 F8；`06` §6.8 F8 写明只读期间 Host 的事件缓冲有界。
- 观察 11：`14` §14.3.4 结论按工作周精确地写设计线的 QA 延入第 33 周约 0.04 周、余量为第 35 周余下的 0.96 周。
- 观察 12：`04` §4.3.1 补应用级横幅的位置：标题栏之下、侧栏与内容区之上，不是覆盖层、不在 §4.17.3 的层级栈中，`打开存储面板` 在 Tab 次序中位于标题栏之后、侧栏之前。

**删除 / 推迟**
- 删除：F8 解除中“只有一个原因”的限定与“Supervisor 其间重启时保持 `paused(app_quit)`、由人继续”；`12` 自设的覆盖层数量规则；`05` 凭据一行的“Azure 配置目录等”；`05` “Pi 运行开关”一行的“Host 不因它们重启”；首次运行无条件的 `已有你的 pi 配置中的凭据，Tower 用它`；`05` 代理一行把 `EnvHttpProxyAgent` 当作 SDK 嵌入时的行为。
- 推迟：无。
- `16` §16.1.13 补登第 104 轮被取代的说法 1 行，由 (D) 检查。

- **lint**：全部检查 `--checks rstuvwxyzckdnSeRqpoPiDgKYATFMBOJCH`，exit 0；见 `reviews/round-104-lint.md`。
- **排期**：+0.04 人周（WBS 124.18 → 124.22）：W6 +0.02（Agent）；W16 +0.01（设计）；W4 +0.01（桌面）；其余按 WBS 行不足 0.01。
  - 按 ADR-136 的常规规则在余量之内吸收，**M1 维持 39 周**（2026-11-09 → 2027-08-06；第 35 周末冻结，2027-07-09；M2 至 2027-11-12；M3 至 2028-02）。
  - `14` §14.3.4 与 ADR-133 第 104 轮补记一致：余量 系统 1.09、Agent 1.10、桌面 1.04、设计 0.96、安全 1.10；依赖链 19.91；最长线仍为设计（29.04）。
  - **增 1 人方案仍为 34 周**：130.26 / T 24.05 / 27 个工作周，第 30 周末冻结（2027-06-04），至 2027-07-02（新人约 2.43 人周安全线工作）；下一个台阶仍是全部工作超过 135.52 人周（35 周）。

## 第 105 轮对抗评审（全范围）后的跨文档决策（ADR-233）

## ADR-233 Host 总是安装与 Pi 相同的分发器、扩展注册的 provider 在每次投递之前读取且列出即不再注入、标注按 Host 并有第三种结论、只读启动时中止存活 Host 的 Run 并由已有恢复行求出结果、准备步骤的磁盘满归 F8 — Accepted（R105 全部条目与评审结论中的观察；Amends ADR-232、ADR-231；M1 维持 39 周，增人备选仍为 34 周；Amended by ADR-234、ADR-235）

选择原则（收敛规则，同 ADR-186–232）：只用三种办法关闭条目——(1) 把说法改弱但为真；(2) 删除或推迟不属于 M1 主循环的机制；(3) 在已有的唯一定义处加至多一条守卫、一行或一个字段。本轮另守一条取向：沿用 Pi 自己的做法与已有的恢复出口，不另设开关。本轮 4 条次要条目都在已有的唯一定义处加一句或一行：
- 模型请求怎样经过代理（`05` §5.3.6 代理一行，唯一定义不变）：总是安装、选项、空闲超时、单份 undici；
- 与你的 Pi 配置中凭据的先后（`11` §11.7.1 模型凭据一行，唯一定义不变）：扩展注册的 provider 的读取时机与“列出即不再注入”、第三种结论与按 Host 的标注、代价一句；
- 磁盘满（`06` §6.8 F8，唯一定义不变）：只读启动时的存活 Host、恢复行、不写数据库的清理、复查的卷集合、准备步骤的 `ENOSPC` 与 ③。

新增的只有：Host 报告的结论的第三种值（只在 Supervisor 内存中，按 Host 保留）与模型选择器的第三种标注文字 `由扩展处理认证`；Host 内存中“列出过的扩展 provider”集合（随 Host 进程结束）；`06` §6.2.4 准入的检查 i（可写）；`08` §8.10.5 的规则 6；`12` §12.6.4 磁盘满期间的一行实况与 §12.13.3 横幅一行。不新增状态、暂停原因、事件类型、表、列、命令、决定种类、Needs-You kind、landmark、`wait_reason` 值、锁或常驻进程；不订阅、不包装 Pi 的方法。安全不变式全部保留：Tower 不会自动把机密交给 Agent 可影响的进程——模型密钥仍只经运行时注入、只在 Host 内存中，Host 环境中仍没有任何模型密钥；扩展注册的 provider 在一次投递之内的窗口里可能收到已注入的导入密钥，但扩展本就在密钥的信任边界之内（能经 `ctx.modelRegistry` 读取已注入的密钥），Agent 可影响的进程不因此得到它，如实登记；打包的分组不变，高风险 Goal 的模型请求仍不经扩展代码；Host 环境不引用 Agent 可写的位置——分发器只读 Host 环境中已有的代理变量，`httpIdleTimeoutMs` 经受保护的设置读取，不进入环境；只读启动时清理已退出 Host 的即时投递凭据文件提前到启动时，不再推迟；沙箱外的 Tower 进程不在 Agent 可控的 git 元数据上运行 git；Tower 从不自动删除人的工作现场。安全问题只写到设计层面。

**Pi v1.2.0 核实**（`git show v1.2.0:<path>`；`packages/coding-agent/src/` 下，另注 `ai`）
- R105-D5-01：`core/http-dispatcher.ts:4`（`DEFAULT_HTTP_IDLE_TIMEOUT_MS = 300_000`）、`:5-6`（Node 默认 250 ms 的连接尝试时限会中断高延迟线路上的正常连接）、`:8-14`（空闲超时的选项，`disabled` 为 0）、`:19-35`（`parseHttpIdleTimeoutMs`）、`:52-79`（吞掉 undici 内部 `error` 事件的监听与 `Client`/`Pool` 工厂）、`:81-99`（`EnvHttpProxyAgent`：`allowH2: false`、`proxyTunnel: true`、`bodyTimeout`/`headersTimeout`、`autoSelectFamilyAttemptTimeout` 2 s）、`:100-112`（`setGlobalDispatcher` 与 `undici.install`，只在全局 `fetch` 未被替换时安装）；调用处 `cli/setup.ts:12`、`main.ts:597`（默认值）与 `:875`（`settingsManager.getHttpIdleTimeoutMs()`）、`rpc-entry.ts:11`、`modes/interactive/interactive-mode.ts:2063, 5014`，全部无条件；`core/settings-manager.ts:11`（引入 `http-dispatcher.ts`，所以 SDK 路径同样加载 undici）、`:147-156`（值无效时抛出）、`:364-366`（`projectTrusted:false` 时不读项目设置）、`:900-901`（未设置时取默认值）；`packages/coding-agent/package.json` 依赖 `undici` 8.10.2；undici 8.10.2 的 `lib/global.js:14-16`（加载时全局分发器尚未设置就装上默认 `Agent`）、`lib/dispatcher/client.js:229-230`（默认允许 HTTP/2），以本机安装的同一版本核对。
- R105-D5-02：`core/extensions/types.ts:1814-1817`（初次加载时注册排队，此后立即生效，可在命令处理器或事件回调中调用）；`core/agent-session.ts:3496-3505`（会话把扩展的 `registerProvider`、`registerNativeProvider`、`unregisterProvider` 直接绑到 `_modelRuntime`）；`core/model-runtime.ts:891-949`（两种注册只更新快照与可用性，没有可订阅的事件；同名注册合并配置，只给 `models` 或 `headers` 也算注册）、`:526-528`（`getRegisteredProviderIds()`）；`core/model-registry.ts:194-204`（扩展经 `ctx.modelRegistry` 读取已注入的密钥）。评审所引各处均为原文。
- 观察 10：`core/resolve-config-value.ts:185-196`（`execSync`，`timeout: 10000`）、`:221-227`（`resolveConfigValueUncached` 对命令不经缓存）。

**条目（R105 追问清单）**
- **R105-D5-01**（代理分发器只在 Host 环境中有代理变量时安装；选项与空闲超时没有写）：取评审的写法。**唯一定义** `05` §5.3.6 代理一行：Host 启动时**总是**（不论有没有代理变量）在任何模型请求与 MCP 连接之前安装与 `configureHttpDispatcher` 相同的分发器——`EnvHttpProxyAgent`（没有代理变量时即直连的 agent），`allowH2: false`、`proxyTunnel: true`、连接尝试时限 2 s、`bodyTimeout`/`headersTimeout` 取空闲超时、同一错误监听，以 `setGlobalDispatcher` 安装并调用 `undici.install()`；空闲超时取你 Pi 设置中的 `httpIdleTimeoutMs`，经 §5.3.3 的受保护设置读取（默认 300 000 ms，`disabled` 为不限时），Host 启动时读一次，值无效时与终端中的 `pi` 一样启动失败（F4b）〔ADR-234 更正：这只对分发器成立；Pi 的 SDK 另在每次模型请求时从该 Run 的设置管理器读取同一设置作为请求时限，Host 存活期间变为无效时该 Run 的准备按 F4b 失败；C43 改以 HTTP 类 MCP 的响应头超时断言分发器〕；undici 只用 Pi 所依赖的那一份（v1.2.0 为 8.10.2），Tower 的安装在其加载时装上的默认 `Agent` 之后、任何请求之前取代它。D63 的复核范围补选项、空闲超时与 undici 版本；C43 改为两种情形都断言已安装、选项与 Pi 相同、只有一份 undici，并以 `httpIdleTimeoutMs` 30 s 与 `disabled` 各做一次。ADR-232 R104-D5-03 一条加〔ADR-233 更正〕。不取“空闲超时登记为不读取”：它会使在终端中关掉空闲超时、使用慢速本地模型的用户在 Tower 中 300 s 无输出即失败。
- **R105-D5-02**（扩展注册的 provider：标注没有第三种结论；“不注入”只在一个时刻执行；代价一句偏窄）：**唯一定义** `11` §11.7.1 模型凭据一行。(a) **读取时机**：Pi 没有 provider 注册的事件可订阅（核实见上），所以 Host 在每个 Run 的会话创建之后、第一次请求之前，以及适配器每次调用 `prompt`、`steer`、`followUp`、`inject` 之前（Tower 已控制的投递边界）读一次 `getRegisteredProviderIds()`；某个 provider id 在一个 Host 中被列出过一次，Tower 在该 Host 进程退出之前不再为它注入，扩展随后 `unregisterProvider` 也不恢复。剩下的窗口（一次投递之内在事件回调中新注册的覆盖，以及扩展在 `session_start` 中自己发出的请求）如实登记〔ADR-234 更正：另在 tower-goal 的 `turn_start` 处理器中读取，窗口缩到一次模型调用与其后的压缩、摘要请求〕：后果是用哪份凭据、由谁计费与端点，扩展本就在密钥的信任边界之内。(b) **标注**：结论有第三种“由扩展处理认证”，模型选择器写 `由扩展处理认证`；Supervisor 按 Host 保留结论，某个目标的标注取服务它的 Host（正在运行它的，或上一次运行它而仍存活的）的结论，不取各 Host 中最后报告的一次；没有这样的结论时与设置中的默认模型写条件句〔ADR-234 更正：标注因此只在模型服务不可用、服务它的 Host 尚未退出时可见，如实登记，G46 (d) 改在该位置断言；Host 在结论改变与重新接上时重报〕。`05` §5.3.6 首次运行、`04` §4.18.1 第 2 步同步。(c) **代价一句**改为以内置 provider 的 id 注册的任何扩展（`registerProvider` 只给 `baseUrl`、`models` 或 `headers` 的也算，`registerNativeProvider` 同样），`00` §0.5.1 凭据一行补半句（观察 7）。D64 补依据；C44 补“事件回调中只加 `headers`、随后 `unregisterProvider`”一组；G46 (d) 第十组补标注的断言与事件回调一组。ADR-232 R104-D5-01、R104-D5-02 两条加〔ADR-233 更正〕。不取“包装运行时的 `registerProvider` 以得到注册时刻”：那是修改 Pi 的对象，要随 Pi 的每个版本维护，而投递边界已由 Tower 控制。
- **R105-D6-01**（只读状态启动时存活 Host 中的 Run；drain 写入失败而 Host 存活；复查的卷集合与推迟的范围）：**唯一定义** `06` §6.8 F8。(a) **只读启动时**，main 交回的存活 Host 照常接上，Supervisor 让它们中止其中进行中的 Run（`abort`，不写数据库、不 drain），只读期间没有 Run 在运行，事件缓冲有界的一句因此成立。(b) **结果由已有恢复行求出**：存活 Host 中已中止、而数据库中没有它的 `draining_for` 与 `run.ended` 的 Run——只读启动时中止的，以及 drain 写不进之后 Supervisor 重启、Host 仍存活的（正常启动时同样如此）——在解除时（或正常启动的中间状态检查中）按 §6.1.6 “Run 中崩溃”、“settle 中崩溃” 两行处理，与 Host 已不存在时相同〔ADR-234 更正：只在 Host 存活时取 `app_quit`；这些 Run 的进程在只读启动时立即按进程树与令牌的并集终止并 `dispose` 会话，§6.1.6 “Agent 后台进程”一行的范围补这一类〕，原因取 `app_quit`、`outcome_reason` 写 `disk_full`，因此在解除的集合中；`draining_for` 已写进的照 “Run 在 drain 中途” 一行的 Host 存活一支续做。(c) 只推迟会写数据库的中间状态检查；不写数据库的清理照常立即执行——清空不属于存活 Host 的 `tmp/`、`run/`（含已退出 Host 的 `run/<hostId>/` 即时投递凭据文件）与终止残留的后台进程（补检查点推迟到解除）。(d) **复查的卷**为 `~/.tower` 所在卷与各 Project 的 `<wtRoot>` 所在卷（与 §6.7 自检同一集合，Project 与 `<wtRoot>` 从只读的数据库照常读出），取代“发生过 `ENOSPC` 的卷”；复查中求不出剩余空间的卷按不足 2 GB 计，横幅写明该卷（`12` §12.8）；启动自检中求不出的卷不单独触发只读启动。`16` §16.2.6 磁盘预算一行同步，并登记外接盘在只读期间未挂载时只读要到挂载或重启 Tower 才解除。G35e (q) 补“只重启 Supervisor 时某个 Goal 仍在运行”与“只读期间卸载外接测试卷”两组。ADR-231 R103-D6-02、ADR-232 R104-D6-01 两条加〔ADR-233 更正〕。
- **R105-D6-02**（准备阶段本身遇到 `ENOSPC`：F8 与 F4b 的先后；打包 Host 中 ③ 的中止范围）：**唯一定义** `06` §6.8 F8 “进行中的验证与准备”：准备步骤本身因 `ENOSPC` 失败时归 F8（中止准备、Goal 留在 `ready`、`preparing_since` 保留、解除时重新准入），不按 F4b 写 `prepare_failed`，数据库此刻仍可写时也是如此；③ 中只中止该 Goal 的会话创建与开场（开场已发出而 `run.started` 写不进的，以 `abort` 中止该会话的 Run），不终止 Host——打包模式下它由其他 Goal 共用。F4b 一行与 `10` §10.3.1 失败处理各加“因 `ENOSPC` 失败的归 F8”。G35e (q) 准备中的一组另做一遍由准备步骤自己写满，另补 ③ 的打包一组。ADR-232 R104-D6-02 一条加〔ADR-233 更正〕。

**评审结论中的观察（R105 结论部分）**
- 观察 1：`06` §6.8 F8 写明 F8 向进行中的 drain 并入 `app_quit` 时，`run.ended` 的 `outcome_reason` 同样写 `disk_full`。
- 观察 2：`16` Host 粒度回退规则一行登记打包时 `h = p95/K` 按满载的 Host 计、未满的 Host 少记至多 (K−1)/K × p95（约 0.1 GB），由内存压力刹车兜底；不改准入记账。
- 观察 3：`06` §6.2.4 准入补检查 i（可写）：Project 因租约只读时 `waitReason = slot`、卡片注明该仓库正被另一个 Tower 使用；数据库在 F8 的只读状态时不准入、不写数据库，由横幅说明。
- 观察 4：G35e (q) 多原因一组的期望写全为 `已暂停 · 磁盘已满 · 另有：硬预算上限`；`12` §12.6.5 叠加原因的示例与 `04` §4.6.7 的 `预算硬上限` 统一为原因表的 `硬预算上限`。
- 观察 5：`08` §8.10.5 补规则 6，定义被压下的整页或浮层的去处（侧栏顶部一行入口，不自动补弹；规则 2、4、5 不算被压下）；`12` §12.8 只引用，并把 “自动诊断” 改为 “诊断视图”。
- 观察 6：`12` §12.6.4 补一行：`验证已取消（磁盘已满）· 释放空间后以同一 pin 重跑`、`准备已中止（磁盘已满）`。
- 观察 7：`00` §0.5.1 凭据一行补以内置 provider 的 id 注册的扩展的差异（随 R105-D5-02 (c)）。
- 观察 8：`04` §4.18.3 应用退出一行只引用 `12` §12.6.5；`12` §12.6.5 的 `自动恢复` 条件改为按第 5 项解除之后没有剩余原因（含只另有同样解除的 `engine_crash`）。
- 观察 9：`03` §3.2.1 `app_quit` 的来源补磁盘满；`10` §10.3.1（唯一定义）、`02` §2.4、`16` §16.1.1 的 `preparingSince` 注明 F8 的中止保留它。
- 观察 10：`11` §11.7.1 写明 `models.json` 中 `!` 形式的 `apiKey` 每次请求同步执行、至多阻塞 Host 的事件循环 10 s，打包时同一 Host 的其他 Goal 随之推迟。
- 观察 11：`11` §11.7.1 写明模型选择器的位置（设置 › 引擎的默认模型，`04` §4.15；为目标切换模型，`04` §4.18.3）；`12` §12.13.3 读屏表补横幅一行。
- 观察 12：G46 (d) 第九组 CA 一组写明指向 `<wtRoot>` 之下的一次模型请求以 TLS 校验错误失败、按 F6 处理。

**删除 / 推迟**
- 删除：`05` 代理一行与 C43 “有代理变量时才安装”的条件；`11` “Host 的第一个会话创建之后再做一次这一步”与 “Supervisor 只在内存中保留最近一次”；`06` F8 “复查发生过 `ENOSPC` 的卷” 与 “Supervisor 在此之前重启时按 §6.1.6 的同一规则进入”；`12` 卡片条件 “`app_quit` 是唯一的原因”；`04` 应用退出一行自写的条件；`预算硬上限` 的写法。
- 推迟：无。
- `16` §16.1.13 补登第 105 轮被取代的说法 1 行，由 (D) 检查。

- **lint**：全部检查 `--checks rstuvwxyzckdnSeRqpoPiDgKYATFMBOJCH`，exit 0；见 `reviews/round-105-lint.md`。
- **排期**：+0.03 人周（WBS 124.22 → 124.25）：W6 +0.01（Agent）；W16 +0.01（设计）；W4 +0.01（桌面）；其余按 WBS 行不足 0.01。
  - 按 ADR-136 的常规规则在余量之内吸收，**M1 维持 39 周**（2026-11-09 → 2027-08-06；第 35 周末冻结，2027-07-09；M2 至 2027-11-12；M3 至 2028-02）。
  - `14` §14.3.4 与 ADR-133 第 105 轮补记一致：余量 系统 1.09、Agent 1.09、桌面 1.03、设计 0.95、安全 1.10；依赖链 19.91；最长线仍为设计（29.05）。
  - **增 1 人方案仍为 34 周**：130.29 / T 24.05 / 27 个工作周，第 30 周末冻结（2027-06-04），至 2027-07-02（新人约 2.43 人周安全线工作）；下一个台阶仍是全部工作超过 135.52 人周（35 周）。

## 第 106 轮对抗评审（全范围）后的跨文档决策（ADR-234）

## ADR-234 探测只在 Host 中运行、空闲超时的两处读取、扩展 provider 另在 `turn_start` 读取、只读启动时中止的 Run 的进程立即终止、进行中的写回与重建记入待补失败出口列表、卷未挂载不判为丢失 — Accepted（R106 全部条目与评审结论中的观察；Amends ADR-233、ADR-231、ADR-207；M1 维持 39 周，增人备选仍为 34 周；Amended by ADR-235）

选择原则（收敛规则，同 ADR-186–233）：只用三种办法关闭条目——(1) 把说法改弱但为真；(2) 删除或推迟不属于 M1 主循环的机制；(3) 在已有的唯一定义处加至多一条守卫、一行或一个字段。本轮另守一条取向：复用已有的机制——Host 的启动路径、settle 的终止、§6.1.6 的终止范围与恢复行、F8 已有的进程内 drain 目标、准入检查 i——不另设进程、状态或开关。6 条次要条目都在已有的唯一定义处加一句或一行：
- 探测（`06` §6.1.4 第 5 项，唯一定义不变）：进程与 `getAuth` 的拒绝；
- 模型请求怎样经过代理（`05` §5.3.6 代理一行，唯一定义不变）：空闲超时的两处读取与 Host 存活期间的无效值；
- 磁盘满（`06` §6.8 F8，唯一定义不变）：只读启动时中止的 Run 的进程、进行中的写回、重建与接管；
- 与你的 Pi 配置中凭据的先后（`11` §11.7.1，唯一定义不变）：标注的可见范围与重报；
- 启动恢复（`06` §6.1.6）：`<wtRoot>` 所在卷未挂载一行。

新增的只有：`06` §6.1.6 “`<wtRoot>` 所在卷未挂载”一行与卡片注明 `卷未挂载`（`12` §12.6.5 一行，准入检查 i 的一项，`wait_reason` 仍为 `slot`）；Supervisor 进程内的待补失败出口列表（由 F8 已有的进程内 drain 目标扩成）；tower-goal 的 `turn_start` 处理器（`05` §5.6.5 一行）；适配器在 Run 的步骤 ② 之后读一次 `httpIdleTimeoutMs`；为探测起的短时 Host（正常的 Host，同一启动路径）；`12` §12.6.4 一种实况行与横幅的一种开头、两次 `polite` 播报。不新增状态、暂停原因、事件类型、表、列、命令、决定种类、Needs-You kind、landmark、`wait_reason` 值、锁或常驻进程。安全不变式全部保留：Tower 不会自动把机密交给 Agent 可影响的进程——模型密钥仍只经运行时注入、只在 Host 内存中，Host 环境中仍没有任何模型密钥；探测移入 Host 之后，`auth.json` 与 `models.json` 的 `!` 命令、`$VAR` 与导入的密钥仍只在 Host 中求值，Supervisor 不新建运行时、不持有密钥；为探测起的短时 Host 与 Run 的 Host 用同一 Host 环境（不引用 Agent 可写的位置）、同一分发器与注入规则，不加载用户扩展、不建会话、不执行 Agent 代码；扩展注册的 provider 的窗口缩小，不扩大机密的去向（扩展本就在密钥的信任边界之内）；`httpIdleTimeoutMs` 仍经受保护的设置读取，不进入任何环境；只读启动时的终止只发信号、不写数据库，只处理令牌已确认或在进程树中的进程；卷未挂载时 Tower 不删除、不改名、不重建任何目录，人的工作现场不自动删除；沙箱外的 Tower 进程不在 Agent 可控的 git 元数据上运行 git。安全问题只写到设计层面。

**Pi v1.2.0 核实**（`git show v1.2.0:<path>`；`packages/coding-agent/src/` 下，另注 `ai`、`agent`、`mcp`）
- R106-D5-01：`ai/src/models.ts:300-314`（`getAuth` 在 provider 未知或未配置时得到 `undefined`；令牌刷新失败以 `ModelsError` code `oauth`、API 密钥求值或凭据存储失败以 code `auth` 拒绝）；`core/model-runtime.ts:555-562`（运行时的 `getAuth` 转交 `models.getAuth`）、`:621-640`（运行时覆盖只在该运行时的内存中）；`core/agent-session-services.ts:157-180`（初次加载时排队的 provider 注册在建 services 时写入运行时，短时 Host 不建 services 所以没有它们）。
- R106-D5-02：`core/sdk.ts:340-349`（`buildRequestOptions` 每次请求调用 `settingsManager.getHttpIdleTimeoutMs()`，`disabled` 换算为 2147483647，作为 `timeoutMs`）、`:420-421`（`streamFn` 每次请求调用它）；`ai/src/api/anthropic-messages.ts:639-643`（`timeoutMs` 成为厂商 SDK 的 `timeout`）；`core/settings-manager.ts:147-156`（值无效时读取抛出 `Invalid httpIdleTimeoutMs setting: …`）、`:304`（设置在构造时载入内存）、`:498-523`（`reload()` 重新载入）；`packages/agent/src/agent.ts:526-547`（运行中抛出的错误变成 `stopReason:"error"` 的助手消息）；`ai/src/utils/retry.ts:30, 73, 253-258`（可重试模式大小写不敏感地含 `timeout`，所以这一错误文本会被 Pi 重试）；`packages/mcp/src/client.ts:38, 420`（MCP 请求时限默认 30 s）、`packages/mcp/src/transports/streamable-http.ts:211`（取全局 `fetch`）。
- 观察 1：`packages/agent/src/agent-loop.ts:117-118`（首个回合）、`:146-147`（续跑，重试经 `agent.continue()` 同样经过，`core/agent-session.ts:1858-1867`）、`:207`（其后每个回合）在模型调用之前 `await emit({type:"turn_start"})`，`:388-403`（`transformContext`、`getApiKey` 与 `streamFunction` 在其后；SDK 中凭据在 `streamSimple` 内每次请求求出，`core/model-runtime.ts:658-697`）；`packages/agent/src/agent.ts:609-610`（逐个等待监听者）；`core/agent-session.ts:1103, 1143`（先等待扩展事件）、`:1293-1299`（`turn_start` 发给扩展）、`:1039-1043`（公共订阅者同步调用、不被等待）；`core/model-runtime.ts:579-597, 634-640`（`removeRuntimeApiKey` 经按 provider 的凭据操作队列异步执行）；`core/extensions/types.ts:1058-1063, 1651`（`TurnStartEvent`、`on("turn_start")`）。压缩与摘要请求不经 `turn_start`。
- 评审所引其余各处均为原文。

**条目（R106 追问清单）**
- **R106-D5-01**（`provider_unavailable` 的探测在哪个进程运行没有写）：**唯一定义** `06` §6.1.4 第 5 项补“探测在哪个进程运行”：只在 Engine Host 中、从不在 Supervisor 中——该 Goal 所在打包分组中已存活而没有进行中 Run 的 Host；没有时按正常的 Host 启动路径为探测起一个短时 Host（同一 Host 环境与分发器、同一 `host.spawn` 检查与导入密钥的注入），不建会话、不开 Run、不占 Run 槽位，同组共用，本轮探测完成即退出。连接检查因此经 Host 的分发器与 CA 变量，`$VAR`、`!` 命令与导入的密钥都按 Host 的规则求值。`getAuth` 的 `undefined` 与拒绝都计为失败（引文改为 `ai/src/models.ts:300-314`，观察 11）。短时 Host 不加载用户扩展，只由扩展新建的 provider 在其中为未知、探测失败，这类 Goal 只在同组有已加载该扩展而空闲的 Host 时自动解除，否则由人 `继续`（如实登记）。`11` §11.7.1 “只在 Host 中执行”一句引用。C39 补 (e) 的导入密钥一组。ADR-207 R79-D8-01 一条加〔ADR-234 更正〕。不取“Supervisor 中只做连接检查、鉴权推迟到 Run”：它要收窄 `03` 的自动恢复承诺，且 Supervisor 中的连接检查仍要复制 Host 的分发器与 CA；短时 Host 不是 ADR-232 否定的“只做检查的进程”，而是同一个 Host。
- **R106-D5-02**（Pi 的 SDK 每次请求都读 `httpIdleTimeoutMs`）：**唯一定义** `05` §5.3.6 代理一行改写为“两处读取”：分发器在 Host 启动时读一次；Pi 的 SDK 会话每次模型请求另从该 Run 在步骤 ② 新建的设置管理器读取作为请求时限（载入时的值），所以 Host 存活期间的改动从下一个 Run 起改变请求时限、分发器仍取启动时的值，两者中较小的起作用（如实登记）。值无效：Host 启动时读到按 F4b；Host 存活期间变为无效时，适配器在每个 Run 的步骤 ② 之后读一次，抛出时该 Run 的准备按 F4b 失败、不开会话——不做这一读取时 Pi 的每次请求在读取时抛出，错误文本含 `timeout` 而被 Pi 重试，耗尽后落入 F6 并被探测反复解除（核实见上）；Run 中途重新载入而变为无效的仍是 Pi 的这一行为（如实登记）。C43 改为在不经 SDK 请求时限的路径上断言：`httpIdleTimeoutMs` 5 s 时 10 s 不发响应头的 HTTP 类 MCP 服务器的连接以响应头超时失败、20 s 时成功（分发器停在默认 300 s 时前者成功，测试失败），另补 Host 存活期间改为无效值一组。D63 补 SDK 的读取与 `:211`。ADR-233 R105-D5-01 一条加〔ADR-234 更正〕。不取“受保护设置在 Host 存活期间固定返回启动时的值”：那会使 Tower 与终端中 SDK 的请求时限读法不同，且仍要定义启动之后的无效值。
- **R106-D6-01**（只读启动时被中止的 Run 的后台进程没有去向）：**唯一定义** `06` §6.8 F8 “只读启动时”：中止之后随即照 settle 顺序第 3 步按进程树与 Run 令牌的并集终止这些 Run 的全部进程（不写数据库）并 `dispose` 会话；补检查点与存活者的 `bg_process_survived` 推迟到解除。`06` §6.1.6 “Agent 后台进程”一行（终止范围的唯一定义）的第一类补“存活 Host 中已中止、数据库中没有它的 `draining_for` 与 `run.ended` 的 Run”（只读启动时中止的，与 drain 写不进之后 Supervisor 重启而 Host 存活的；Host 存活所以另以进程树取并集），“只重启 Supervisor 时存活 Host 的 Run 不在此列”一句加这一例外。G35e (q) 的只杀死 Supervisor 一组布置一个后台进程。ADR-233 R105-D6-01 一条加〔ADR-234 更正〕。
- **R106-D6-02**（Supervisor 没有重启时进入只读：进行中的写回、卫星重建与接管）：**唯一定义** `06` §6.8 F8 补“进行中的写回、卫星重建与接管”：进入只读时它们在本进程中停止，文件系统上能回退的立即回退（写回照 §6.4.3 失败出口的 ①、②；重建丢弃未完成的旁路目录；接管物化留下的目录不删除，下一次接管改名保留，命令返回 `E_STATE`，从 `running` 接管时 drain 的目标照 F8 并入 `app_quit`、原目标放弃）；要写数据库的失败出口（写回的 ③ 与其 Needs-You、重建失败的事务）与 F8 已有的写不进的 drain 目标一起记入 Supervisor 进程内的**待补失败出口列表**，解除时先按列表执行（按解除时的状态求），再执行推迟的中间状态检查。列表只在进程内：Supervisor 在解除之前重启时，数据库中留下的 `syncing`、`satellite_rebuilding=1`、`draining_for` 由 §6.1.6 对应行作为推迟的中间状态检查在解除时续做。`syncing` 不变式写准确：除本进程正在写与崩溃到重启之间外，还可以在 F8 的只读期间留在数据库中，解除时消除；列表中的写回仍算写回进行中（`goal.delete_kept` 返回 `E_BUSY`）。§6.4.3 “写回进行中”与不变式一句、§6.1.6 人工编辑检出一行同步。G35e (q) 补写回中途写满一组。ADR-231 R103-D6-02 一条加〔ADR-234 更正〕。
- **R106-D7-01**（标注只在服务该目标的 Host 存活时可见，G46 (d) 的期望无处观察）：取较简单而真实的一种——**不新增显示位置**，`11` §11.7.1 如实登记“可见范围”：设置中的默认模型恒写条件句，按目标的标注只出现在 `为受影响目标切换模型`，三种标注只在该目标的模型服务不可用、且服务它的 Host 尚未退出时可见，“两边可能是不同的账户”的告知主要靠首次运行的条件句；Host 在一次读取改变结论时与只重启 Supervisor 后重新接上时重报。`14` G46 (d) 第八至十组改为在这一位置与时机断言（以测试代理使请求返回 503 直到重试耗尽，Host 退出之前观察），删去“第一个 Run 之后”。不取“目标页另设始终可见的一行”：要新增界面位置与 Host 退出后的保留规则，Host 退出后仍只能写“上次运行时”，而本轮的问题是测试无处观察。观察 8 并入：`由扩展处理认证` 只说明 Tower 不注入、不说明认证成功，请求按 F7 失败时以 F7 的条目为准。ADR-233 R105-D5-02 一条加〔ADR-234 更正〕。
- **R106-D13-01**（`<wtRoot>` 所在卷未挂载时启动）：**唯一定义** `06` §6.1.6 新增“`<wtRoot>` 所在卷未挂载”一行，先于卫星丢失与人工编辑检出两行判定（启动检查与运行中的发现相同）：`<wtRoot>` 不存在且其挂载点不存在（M1 macOS：位于 `/Volumes/<卷名>/` 之下而 `/Volumes/<卷名>` 当前不是已挂载的卷）时，该 Project 的 Goal 不触发两行、不重建、不清除 `human_checkout`，状态与原因不变，卡片注明 `卷未挂载`（新的卡片注明，不是暂停原因，lint (s) 的集合不变），要开 Run 的转移经准入检查 i 的新一项在 `ready{slot}` 中等待，触及该卷的命令返回 `E_STATE`；Supervisor 每 30 s 复查，卷重新出现时撤下注明、重新计算准入并照常执行两行的检查。卷已挂载而目录不在时才按丢失处理。`12` §12.6.5 补一行，§12.8 横幅的 “重启 Tower” 一句与 `16` §16.2.6 登记重启之后的结果。G35e (q) 补“卸载后重启 Tower、重新挂载”一组。

**评审结论中的观察（R106 结论部分）**
- 观察 1：扩展注册的 provider 另在 tower-goal 的 `turn_start` 处理器中读取（SDK，经 `bridge`；Pi 在每次模型调用之前等待扩展处理器，重试与续跑同样经过；移除运行时覆盖异步执行，只能在被等待的处理器中完成，适配器的事件订阅不被等待——所以不是“已有处理器”，而是 tower-goal 新注册一个，`05` §5.6.5 一行），窗口缩到一次模型调用与其后的压缩、摘要请求；`11` §11.7.1 改写，D64 补依据，C44 与 G46 (d) 第十组改为下一次模型调用。`00` §0.5.1 一行不涉及窗口，不改。
- 观察 2：`06` §6.1.6 “Run 中崩溃” 一行的 F8 例外收窄为 Host 存活一支（Host 已不存在时照同行的两种情形），并如实登记按可观察状态判别会收入 Supervisor 重启几秒内的其他中止。
- 观察 3：`12` §12.6.4 补 `已中止（磁盘已满）· 释放空间后恢复`（drain 写不进或只读启动时中止的 Goal）；G35e (q) 的 `已暂停 · 磁盘已满 · 释放空间后自动恢复` 限定为 drain 写入成功的一组。
- 观察 4：F8 的 ③ 中止之后由 Host 按进程树与令牌的并集终止这一窗口中派生的进程并 `dispose` 会话；开场已追加在会话文件中时重新准入可能再出现一次（如实登记）。
- 观察 5：F8 的复查集合并上本次触发 `ENOSPC` 的卷（进程内）；`16` §16.2.6 同步。
- 观察 6：准入检查 i 的 F8 一项写明在 a 之前先判、命中即短路。
- 观察 7：F8 写明只读启动时已写入 `draining_for` 的 drain 是推迟的中间状态检查，`app_quit` 不并入，结果为该 drain 自己的目标，`take_over` 在解除时执行。
- 观察 8：并入 R106-D7-01。
- 观察 9：`08` §8.10.5 规则 6 补侧栏一行的生命周期、多个时合为一行与不进入“下一件”；`12` §12.8 横幅在自检不足 2 GB 而未写满时以 `磁盘空间不足 2 GB` 开头，后缀追加与消失时 `polite` 播报，§12.13.3 读屏表同步。
- 观察 10：G35e (q) 的只杀死 Supervisor 一组以测试钩子留下一个已退出 Host 的 `run/<hostId>/` 目录，断言不再恒真。
- 观察 11：D63 引文改为 `streamable-http.ts:211`；`06` §6.1.4 第 5 项改引 `ai/src/models.ts:300-314`；`06` §6.3 `preparing_since` 的 DDL 注释补 F8 例外（与 `02` §2.4 同一写法）；`04` §4.7 “自动诊断”改为“诊断视图”；`14` §14.1 增人一行的 ADR 列表补到 ADR-234；`07` §7.2 缺失程序一段之后补磁盘已满一段，交叉引用 F8。
- 观察 12：F8 写明只读启动时重放的事件与 Host 溢出文件可能写不进，由 Pi JSONL 对账兜底（§6.6.5）。

**删除 / 推迟**
- 删除：`05` 代理一行“在 Host 启动时读一次，之后的改动从下一个 Host 起生效”的单一读取写法与 C43 的 30 s / 40 s / `disabled` 断言；`06` §6.1.4 引重载签名的“没有凭据时返回 `undefined` 而不抛错”；`06` §6.1.6 “不论 Host 是否存活”；F8 “目标留在 Supervisor 进程内”的单独写法（并入待补失败出口列表）；`11` 窗口“到下一个投递边界之前”；`14` G46 (d) “第一个 Run 之后”；`12` 横幅“消失时不播报”；`04` “自动诊断”。
- 推迟：无。
- `16` §16.1.13 补登第 106 轮被取代的说法 1 行，由 (D) 检查。

- **lint**：全部检查 `--checks rstuvwxyzckdnSeRqpoPiDgKYATFMBOJCH`，exit 0；见 `reviews/round-106-lint.md`。
- **排期**：+0.06 人周（WBS 124.25 → 124.31）：W6 +0.02（Agent）；W4 +0.03（桌面）；W16 +0.01（设计）；其余按 WBS 行不足 0.01。
  - 按 ADR-136 的常规规则在余量之内吸收，**M1 维持 39 周**（2026-11-09 → 2027-08-06；第 35 周末冻结，2027-07-09；M2 至 2027-11-12；M3 至 2028-02）。
  - `14` §14.3.4 与 ADR-133 第 106 轮补记一致：余量 系统 1.09、Agent 1.07、桌面 0.99、设计 0.94、安全 1.10；依赖链 19.91；最长线仍为设计（29.06）。
  - **增 1 人方案仍为 34 周**：130.36 / T 24.07 / 27 个工作周，第 30 周末冻结（2027-06-04），至 2027-07-02（新人约 2.42 人周安全线工作）；下一个台阶仍是全部工作超过 135.52 人周（35 周）。

## 第 107 轮对抗评审（全范围）后的跨文档决策（ADR-235）

## ADR-235 探测不另起 Host、每个 Run 校验会造成重试循环的设置、只读期间的实况行按条件写恢复、Project 不可达一条规则取代按卷名判别 — Accepted（R107 全部条目与评审结论中的观察；Amends ADR-234、ADR-233、ADR-207；M1 维持 39 周，增人备选仍为 34 周；Amended by ADR-236）

选择原则（收敛规则，同 ADR-186–234）：只用三种办法关闭条目——(1) 把说法改弱但为真；(2) 删除或推迟不属于 M1 主循环的机制；(3) 在已有的唯一定义处加至多一条守卫、一行或一个字段。本轮另守一条取向：ADR-234 的两个机制——为探测起的短时 Host、按卷名判别的“卷未挂载”一行——各自带出了一串分支（分组与上限、自身失败、`!` 命令重新执行、覆盖 provider 的误报；Run 进行中卷消失、其余恢复行、隐私清除续做、情形 C/F、命令范围、`syncing` 不变式、同名卷与符号链接）。这两类分支**以删除与简化关闭**，不逐条加守卫：
- 探测（`06` §6.1.4 第 5 项，唯一定义不变）：只在同组已存活的空闲 Host 中运行，不另起 Host；不能自动探测时由人在卡片上重试；
- 启动恢复（`06` §6.1.6）：一条 “Project 不可达” 规则取代按卷名判别的一行，必需路径之一不可访问即整体停下，可达后照常；
- 模型请求怎样经过代理（`05` §5.3.6 代理一行，唯一定义不变）：每个 Run 的校验扩到会造成重试循环的全部设置；
- 只读期间的实况行（`12` §12.6.4）：`恢复` 一段按 ADR-232 的条件写。

新增的只有：`06` §6.1.6 “Project 不可达” 一行（取代 “`<wtRoot>` 所在卷未挂载” 一行）与卡片注明 `Project 不可达`（`12` §12.6.5 一行替换，准入检查 i 的一项，`wait_reason` 仍为 `slot`）；`Run.outcomeReason` 的已用值 `project_unreachable`（开放字符串，暂停原因仍为 `app_quit`，同 F8 的 `disk_full`）；卡片文字 `提供方可能已恢复？[重试]`（`goal.resume`）与 `已暂停 · Project 不可达 · 可访问后自动恢复`；Supervisor 内一个做可达性检查的 `worker_thread`（`13` §13.5）。不新增状态、暂停原因、事件类型、表、列、命令、决定种类、Needs-You kind、landmark、`wait_reason` 值、锁或常驻进程。安全不变式全部保留：Tower 不会自动把机密交给 Agent 可影响的进程——模型密钥仍只经运行时注入、只在 Host 内存中，Host 环境中仍没有任何模型密钥；探测仍只在 Host 中求值 `$VAR`、`!` 命令与导入的密钥，Supervisor 不新建运行时、不持有密钥，删除短时 Host 之后不再有任何为探测起的进程；扩展注册的 provider 的窗口不扩大机密的去向（缓存预热请求与已登记的压缩、摘要请求同属一类，扩展本就在密钥的信任边界之内）；Project 不可达时 Tower 不删除、不改名、不重建任何目录，不执行任何丢失处理，人的工作现场不自动删除；沙箱外的 Tower 进程不在 Agent 可控的 git 元数据上运行 git。安全问题只写到设计层面。

**Pi v1.2.0 核实**（`git show v1.2.0:<path>`；`packages/coding-agent/src/` 下，另注 `ai`、`agent`）
- R107-D5-02：`core/sdk.ts:340-353`（`buildRequestOptions` 每次请求调用 `getProviderRetrySettings()`、`getHttpIdleTimeoutMs()` 与 `getWebSocketConnectTimeoutMs()`；请求时限取 `options.timeoutMs ?? providerRetrySettings.timeoutMs ?? effectiveTimeoutMs`，`:350`；`maxRetries`、`maxRetryDelayMs` 取 `retry.provider.*`，`:352-353`）；`core/settings-manager.ts:147-156`（`parseTimeoutSetting` 对无效值抛出 `Invalid <名字> setting: …`）、`:900-901`、`:934-936`（`httpIdleTimeoutMs` 与 `websocketConnectTimeoutMs` 经它读取）、`:925-932`（`getProviderRetrySettings` 不解析，原样返回）、`:891-898`（会话自动重试的 `retry.maxRetries` 同样不解析）；`ai/src/api/anthropic-messages.ts:641, 655-661`（`timeoutMs` 成为厂商 SDK 的 `timeout`，`maxRetries` 交给 `retryProviderRequest`）；`ai/src/utils/provider-retry.ts:111-125`（非数值的 `maxRetries` 使 `retriesRemaining <= 0` 永不成立）；`ai/src/utils/retry.ts:198, 218`（会话自动重试的 `attempt >= maxAttempts` 同此）、`:73`（可重试模式不区分大小写地含 `timeout`）。所以会造成重试循环的设置在 v1.2.0 为 `httpIdleTimeoutMs`、`websocketConnectTimeoutMs`、`retry.provider.timeoutMs`、`retry.provider.maxRetries` 与 `retry.maxRetries`；`retry.provider.maxRetryDelayMs`、`retry.baseDelayMs` 等无效时不使重试无界，不列入。
- 观察 1（缓存预热，**核实：不经 `turn_start`**）：`core/sdk.ts:427-429`（每次会话请求之后 `cacheWarmer.start`）；`core/settings-defaults.ts:60`（默认 `cacheWarming: "streaming"`）；`core/settings-manager.ts:913-917`（只读全局设置）；`core/cache-warmer.ts:296`（按定时器触发）、`:330-339`（直接调用 `this.models.streamSimple`、`maxTokens: 1`，不经 Agent 循环，所以不经 `turn_start`；凭据在这次请求中照常每次求出）、`:342-348`（用量以 `appendUsage("cache_warm", …)` 写入会话）。
- 观察 2：`core/extensions/runner.ts:1096-1125`（`emit` 逐个等待处理器，异常捕获后经 `emitError` 报告、事件继续）；`core/model-runtime.ts:634-640`（`removeRuntimeApiKey` 的队列任务开始时同步删除覆盖，其后才同步状态）。
- 观察 4：`extensions/mcp/runtime.ts:48, 210-211, 363`（内置 MCP 扩展的请求时限取 `mcp.json` 的 `timeout`，默认 60 s）。
- 观察 13：`core/resource-loader.ts:781`（inline 扩展最后加入）。
- 评审所引其余各处均为原文。

**条目（R107 追问清单）**
- **R107-D5-01**（短时探测 Host 的分组、失败分支、`!` 命令的重复执行与覆盖 provider 的误报）：**删除短时探测 Host**。**唯一定义** `06` §6.1.4 第 5 项改写：探测只在该 Goal 所在打包分组（分组键在两种模式下都按扩展集合）中已存活而没有进行中 Run 的 Host 中运行，从不在 Supervisor 中、也不为探测另起 Host；`!` 命令的结果已在该 Host 中缓存，不因探测重新执行。不自动探测的三种情形：没有这样的 Host（专用模式下暂停超过 5 分钟、Host 退出之后；自动解除因此只覆盖第 60 s 与第 180 s 两次探测，应用重启之后同样由人重试，如实登记）；该 provider 在扩展注册的列表中（新建的或以内置 id 覆盖的——认证与端点由扩展决定，Host 的运行时不能代它判定，所以不再有误报，也不再有“只在同组有已加载该扩展的空闲 Host 时自动解除”的分支）；F8 的只读期间。这时卡片写 `提供方可能已恢复？[重试]`（已有的 `goal.resume`），F6 或 F7 的 Needs-You 保持打开。探测不延长 Host 的存活。(a) 的分组与上限、(b) 的自身失败、(c) 的 `!` 命令重新执行都随短时 Host 一起消失，不再需要登记。引用处：`03` §3.2.1 `provider_unavailable` 一行、`08` §8.6.5 一行的 L2 理由、`05` §5.3.6 SDK 一句与 C39 (e)、`11` §11.7.1、`12` §12.6.5、`04` §4.18.3。lint (d) 登记 `short-lived probe Host`。
- **R107-D5-02**（SDK 每次请求读取的其他时限设置与请求时限的先后）：**唯一定义** `05` §5.3.6 代理一行：步骤 ② 之后的校验扩到会造成重试循环的全部设置（见核实）——前两项以 Pi 的 getter 读取、抛出即无效，后三项 Pi 不解析、由适配器要求为有限的非负数（次数为整数）；任一无效时该 Run 的准备按 F4b 失败、不开会话。请求时限的先后如实写明：设置了 `retry.provider.timeoutMs` 时 SDK 的请求时限取它，分发器的空闲超时仍按 Host 启动时的值，两处时限先到者起作用（“两者中较小的起作用”删除）。D63 补比对 `buildRequestOptions` 读取的全部设置；C43 补 `websocketConnectTimeoutMs` 无效与 `retry.provider.maxRetries` 非数值两组。
- **R107-D7-01**（只读期间的实况行无条件写“恢复”）：`12` §12.6.4 改为 `已中止（磁盘已满）`，`· 释放空间后恢复` 只在该 Goal 将随解除自动继续时写——写不进的 drain 目标只是 `app_quit`（或只读启动时中止）、`resumeOnLaunch` 打开、解除之后没有剩余原因，与 §12.6.5 `app_quit` 一行同一条件（ADR-232 的规则）。G35e (q) 补 `resumeOnLaunch` 关闭的一遍。
- **R107-D13-01 与 R107-D13-02**（卷在 Run 进行中消失；卷未挂载一行的覆盖面与判别键）：**以一条规则取代按卷名判别的一行**。**唯一定义** `06` §6.1.6 “Project 不可达” 一行，先于本表其他各行判定：Project 的必需路径（附着的用户检出；有卫星、人工编辑检出或检验目录记录时的 `<wtRoot>`）之一不可访问——`stat`（跟随符号链接）失败或 5 s 内没有结果，或 F8 复查读不出其所在卷的剩余空间——即整个 Project 不可达，不看卷名与挂载布局（`/Volumes/<卷名>` 的判别删除，同名卷与符号链接因此不再落回丢失两行）。① 进行中的 Run 中止（无法 drain），以已有的 `app_quit` 进入 `paused`，`run.ended` 的 `outcome_reason` 写 `project_unreachable`（同 F8 的 `disk_full`，不另设暂停原因）；② 进行中的验证照应用退出取消，准备中止并回到排队，写回、重建、接管物化与隐私清除的文件删除停止、不执行失败出口，数据库中的 `syncing`、`satellite_rebuilding=1` 与不带 `filesDone` 的 `privacy.purged` 原样保留；③ 不可达期间不准入（检查 i）、不执行本表其他各行（只有后台进程的终止与三行未结束 Run 的暂停写入例外）——不判丢失、不重建、不重跑验证、不续做写回与清除、不查找或重新附着另一份克隆——作用于该 Project 或其 Goal 的命令返回 `E_STATE`（`Project 不可达：<路径>`），查询、`goal.pause` 与绑定处理除外；④ 每 30 s 与人发出命令时复查，可达后按启动顺序执行各行（这时目录确实不在的才按丢失处理），并照 F8 解除的规则移除 `outcome_reason` 为 `project_unreachable` 的 `app_quit`。Tower 从不在 Project 不可达时自动执行丢失处理；Project 可达而目录确实不在时的丢失处理不变。`06` §6.4.3 `syncing` 不变式补 “所属 Project 不可达期间”；隐私清除续做一行补 “`roots` 涉及不可达的 Project 时整条推迟”。`10` §10.16.1 补 “每次检测先判 Project 是否可达”；情形 C 改为 “用户主检出不可达” 并删除按项目身份的自动查找（`10` §10.1.1 迁移改由人发起），情形 D 不再写 “运行中的 Goal 不受影响”（Run 随 Project 不可达而中止），其三个选项是不可达期间不受 `E_STATE` 限制的处理；情形 E 补先判可达。`12` §12.6.5 的 `卷未挂载` 一行换为 `Project 不可达`，`app_quit` 一行补 `project_unreachable` 的写法；`04` §4.18.3 补一行；`16` §16.1.4 `outcomeReason`、§16.1.1 `waitReason` 一行与 §16.2.6 同步。G35e (q) 改写重启的一组，补 “Run 中卸载”（运行中、写回中、验证中）与符号链接两组。如实登记：Project 永久不可达时（外接盘不再使用、仓库已删除），人的出口是迁移附着检出、重新克隆或改 `worktreeRoot`，之后照丢失处理；用户检出被删除而卫星完好时，运行中的 Goal 同样中止（此前情形 D 不受影响，取一条规则的简单）；同一路径上出现另一份内容时按其实际内容判定。

**评审结论中的观察（R107 结论部分）**
- 观察 1：缓存预热请求不经 `turn_start`（核实见上）。`11` §11.7.1 的窗口改为 “这一次调用与下一次 `turn_start` 之前的压缩、摘要与缓存预热请求”；`06` §6.2.5 写明预热的用量只以 `usage` 条目写入会话，实时累加看不到，只在对账差值中出现，也不归入 “自身开销”。预热沿用你的设置（不在受保护设置中固定，D2）。
- 观察 2：`05` §5.6.5 `turn_start` 一行写明处理器出错时抛出：Pi 捕获后以 `extension_error` 报告、照常发出请求，计入 F13，这一次请求可能仍带已注入的密钥，窗口延续到下一次 `turn_start`（如实登记）。
- 观察 3：`11` §11.7.1 写明同一 Host 中对同一 provider 的注入与读取、移除串行，注入之前再查一次已列出的集合。
- 观察 4：C43、D63 改引内置 MCP 扩展的请求时限（`mcp.json` 的 `timeout`，默认 60 s）。
- 观察 5：G46 (d) 的测试代理在重试耗尽后拒绝连接，探测因此失败、状态稳定到 Host 退出；写明仍返回 503 时窗口只剩第一次探测之前。
- 观察 6：`04` §4.18.3 `为受影响目标切换模型` 写明对话框每个目标一行、写该目标的标注，确认后发 `engine.set_prefs{goalId, model}` 与 `goal.resume`；`04` §4.18.1 第 2 步改为引用 `11` §11.7.1 “可见范围”。
- 观察 7：F8 写明 `run.ended` 已提交、接管物化处于 ADR-200 的窗口时不并入 `app_quit`，结果为 `paused(reasons ∪ {human})`。
- 观察 8：F8 的待补列表写明写回 ① 本身未完成的，解除时先重做 ①，成功后不再执行 ③。
- 观察 9：短时 Host 删除，`13` §13.5 的 “只在有活跃 Run 时存在” 不再有例外；`16` §16.1.1 `waitReason` 一行补准入检查 i 的两项；`10` §10.16.2 情形 E 补先判可达，`04` §4.18.3 工作目录被外部删除一行补 Project 不可达的例外；`16` §16.1.12 `E_BUSY` 改按 `06` §6.4.3 “写回进行中”；`06` §6.3 `goals` 的 `human_checkout` CHECK 注释补 F8 与 Project 不可达期间；`14` §14.1 M1 一行的历史括注补到第 107 轮，G46 标题的 ADR 列表补到 ADR-235；`04` §4.18.3 与 `12` §12.6.5 的 “恢复后提示继续” 改为按 `06` §6.1.4 第 5 项。
- 观察 10：F8 复查不含不可达 Project 的卷，读不出剩余空间的卷所在的 Project 判为不可达；“求不出的卷按不足计” 与 `12` §12.8 横幅的后缀（及其 `polite` 播报）删除。
- 观察 11：`13` §13.5 写明可达性检查的 `stat` 与剩余空间读取在专用的 `worker_thread` 中执行，5 s 为限、到时按不可访问计，同一路径上一次未返回时不再发起。
- 观察 12：随短时 Host 删除而不再需要。
- 观察 13：`05` §5.6.5 `turn_start` 一行写明 SDK 中 tower-goal 最后加载，用户扩展在同一 `turn_start` 中先于它的注册被这次读取看到。

**删除 / 简化**
- 删除：为探测起的短时 Host 及其全部写法（“每个打包分组至多一个、只存在于一次探测的时长”、不经准入的登记、“只在同组有已加载该扩展而空闲的 Host 时自动解除”）；“应用重启后探测从 60 s 重新开始”；`05` “两者中较小的起作用”；`06` §6.1.6 按卷名判别的一行（`/Volumes/<卷名>` 的挂载判别与 `卷未挂载` 注明）；F8 “复查中求不出剩余空间的卷按不足 2 GB 计” 与 `12` §12.8 横幅的 “无法读取 <路径> 所在卷的剩余空间” 后缀及其播报；`10` §10.16.2 情形 C 按项目身份在最近打开的目录与 Spotlight 中的自动查找、情形 D “运行中的 Goal 不受影响”；`12` §12.6.5 与 `04` §4.18.3 “恢复后提示继续”。
- 简化：探测的适用范围收窄为已存活的 Host，扩展注册的 provider 一律由人重试；卷未挂载的守卫与评审所列七处缺口合为一条 Project 不可达规则。
- 推迟：无。
- `16` §16.1.13 补登第 107 轮被取代的说法 1 行，由 (D) 检查；lint (d) 新增三项 DELETED（`short-lived probe Host`、`volume-name mount heuristic`、`automatic checkout discovery`）。

- **lint**：全部检查 `--checks rstuvwxyzckdnSeRqpoPiDgKYATFMBOJCH`，exit 0；见 `reviews/round-107-lint.md`。
- **排期**：−0.01 人周（WBS 124.31 → 124.30）：W6 −0.01（Agent，删除短时 Host）；W4 +0.01（桌面，Project 不可达规则）；W7 −0.01（系统，删除情形 C 的自动查找）；其余按 WBS 行不足 0.01。
  - 余量只增不减，**M1 维持 39 周**（2026-11-09 → 2027-08-06；第 35 周末冻结，2027-07-09；M2 至 2027-11-12；M3 至 2028-02）。
  - `14` §14.3.4 与 ADR-133 第 107 轮补记一致：余量 系统 1.10、Agent 1.08、桌面 0.98、设计 0.94、安全 1.10；依赖链 19.91；最长线仍为设计（29.06）。
  - **增 1 人方案仍为 34 周**：130.35 / T 24.06 / 27 个工作周，第 30 周末冻结（2027-06-04），至 2027-07-02（新人约 2.42 人周安全线工作）；下一个台阶仍是全部工作超过 135.52 人周（35 周）。

## 第 108 轮对抗评审（全范围）后的跨文档决策（ADR-236）

## ADR-236 Project 不可达按 Goal 判定、失败先判可达、启动时的解除推迟到可达、可达性检查按挂载点隔离、清除只推迟不可访问的根、绑定处理的命令 `project.relocate`、`retry.provider.timeoutMs` 取正整数、退出确认框按条件写 — Accepted（R108 全部条目与评审结论中的观察；Amends ADR-235；M1 维持 39 周，增人备选仍为 34 周；Amended by ADR-237、ADR-238）

选择原则（收敛规则，同 ADR-186–235）：只用三种办法关闭条目——(1) 把说法改弱但为真；(2) 删除或推迟不属于 M1 主循环的机制；(3) 在已有的唯一定义处加至多一条守卫、一行或一个字段。本轮另守一条取向：评审的 8 条中 5 条是 ADR-235 的 “Project 不可达” 一条规则带出的分支，**一律在该规则的唯一定义处细化，不另设平行机制**：
- 判定的单位由 Project 改为 Goal（必需路径只取该 Goal 自己的），终态 Goal 不冻结；
- “失败先判可达” 与 “启动时的 `resumeOnLaunch` 解除推迟到可达” 写在同一行，与 ①②③④ 共用一次判定；
- 可达性检查的线程按挂载点隔离，仍是 ADR-235 的同一个检查；
- 隐私清除的推迟由 “整条” 收窄为 “不可访问的根”，判定只看事件中已有的 `roots`；
- 永久不可达时的出口：允许 `goal.abandon`，绑定处理补一条命令。

新增的只有：`06` §6.4.3 一条仅本机的命令 `project.relocate{projectId, newCheckoutPath?, worktreeRoot?}`（`10` §10.1.1 已有的迁移、§10.16.2 情形 C、D、F 由它发起，事件沿用 `binding.reattached`）；存储提示的一类条件（`~/.tower` 所在卷的剩余空间读不出）；卡片与实况行的几处写法（`启动失败：Pi 设置 <名字> 无效`、`验证已取消（Project 不可达）`、存储面板的 `不可访问`）。不新增状态、暂停原因、事件类型、表、列、决定种类、Needs-You kind、landmark、`wait_reason` 值、锁或常驻进程（按挂载点的 `worker_thread` 在 Supervisor 进程内）。安全不变式全部保留：Tower 不会自动把机密交给 Agent 可影响的进程；路径不可访问时 Tower 对任何 Goal（含终态）都不删除、不改名、不重建、不执行丢失处理，人的工作现场不自动删除（`goal.abandon` 只写数据库，目录留在原处，ADR-228）；`project.relocate` 仅本机、核对 `Project.identity`，不改动用户仓库；清除仍从不写用户仓库。安全问题只写到设计层面。

**Pi v1.2.0 核实**（`git show v1.2.0:<path>`；`packages/coding-agent/src/` 下，另注 `ai`；厂商 SDK 取 Pi 所钉的版本）
- R108-D5-01：`core/sdk.ts:345-350`（`retry.provider.timeoutMs` 以 `??` 取值，0 被保留；不限时换算为 2147483647，`:346`）；`ai/src/api/anthropic-messages.ts:641`、`openai-completions.ts:372`、`openai-responses.ts:180`（原样成为厂商 SDK 的 `timeout`）；`packages/ai/package.json`（钉 `@anthropic-ai/sdk` 0.129.0、`openai` 7.19.0）；`@anthropic-ai/sdk` 0.129.0 `internal/utils/values.js:48-56`（`validatePositiveInteger` 只拒绝非整数——`timeout must be an integer`——与负数，接受 0）、`client.js:808`（校验）、`:663-675`（`setTimeout(abort, ms)` 只包住到响应头为止的 `fetch`）；`openai` 7.19.0 `internal/utils/values.js:47-55`、`client.js:1146`、`:996`（同上）；`ai/src/utils/retry.ts:72-73`（可重试模式含 `timed? out`、`timeout`）；`ai/src/api/openai-codex-responses.ts:192-198, 398, 409`（Codex 只拒绝负数，0 为不限时，计时只到响应头）。
- 观察 1：`core/cache-warmer.ts:16-18`（流式 60 min、空闲 30 min 的上限）、`:19-20`（预计节省至少 US$0.05）、`:245-257`（`onAgentSettled` 只在 `streaming` 模式停止）、`:286-297`（空闲阶段继续定时）；`core/sdk.ts:427-430`（`cacheWarmer.start` 在请求发出之前）。
- 观察 2（**更正 ADR-235 的引文**）：会话自动重试在 `core/agent-session.ts:1204, 3795`（`_retryAttempt >= settings.maxRetries`）；`ai/src/utils/retry.ts:198, 218` 是只由压缩与摘要调用的 `retryAssistantCall`（`core/compaction/compaction.ts:15, 638`）。两处遇到非数值时都不终止，ADR-235 的结论不变。
- 观察 3：`core/resolve-config-value.ts:9-10, 208-216`（`executeCommand` 按进程缓存，`auth.json` 经它）、`:221-231`（`resolveConfigValueUncached`、`resolveConfigValueOrThrow` 不缓存）；`core/provider-composer.ts:466-467`（`models.json` 的 `apiKey` 每次 `resolve` 经后者求值）。
- 评审所引其余各处均为原文。

**条目（R108 追问清单）**
- **R108-D13-01**（多附着点下的必需路径）：**唯一定义** `06` §6.1.6 Project 不可达一行改为**按 Goal 判定**：某个非终态 Goal 的必需路径——它每个 binding 的附着检出、它有未删除的卫星、检验检出或验证目录记录时这些记录所在的 `<wtRoot>`、它的人工编辑检出（`<wtRoot>` 经 `project.relocate` 改变之后仍按原路径计）——之一不可访问，只有该 Goal 冻结；同一 Project 中附着在其他检出、`<wtRoot>` 在别处的 Goal 不受影响。终态 Goal（`integrated`、`archived`、`abandoned`）不判定、不冻结（没有待执行的动作），只在存储面板注明 `不可访问`，对其路径的删除与丢失判定推迟到可访问。①②③④ 的作用对象随之改为该 Goal；作用于该 Goal 的命令返回 `E_STATE`，Project 级命令不受本行限制（要访问的路径不可访问时同样返回该 `E_STATE`）。`10` §10.4.3 的位置选择改为按附着检出计算、记入 `WorktreeRecord`（与 §10.1.1 统一）。引用处：`06` §6.2.4 检查 i、§6.4.3 `syncing` 不变式、§6.8 F8 复查集合；`10` §10.1.1、§10.16.1、§10.16.2 情形 C、E；`04` §4.18.3 两行；`12` §12.6.5；`16` §16.1.1、§16.2.6。
- **R108-D13-02**（操作中途卷消失、早于可达性判定）：同一行补 **失败先判可达**（唯一定义）：写回、验证、卫星重建或接管物化以文件系统错误失败（`ENOSPC` 归 F8），或验证命令以非零退出时，在执行失败出口、写入结论之前先对该 Goal 的必需路径做同一判定；不可访问即按 ② 视为中断——不执行失败出口、不告知 “此后不可恢复”、不清除 `human_checkout`、不写 `verify.result` 与 Fact、不计返工次数——可达后按 ④ 与已有的恢复行续做。引用处：`06` §6.4.3 `inspect.bring_back` 行的写回失败、§6.1.6 卫星丢失一行的重建失败、`07` §7.4.1。G35e (q) 的 “Run 中卸载” 一组补 I/O 错误先到的变体，断言因此有机制保证。
- **R108-D4-01**（启动时不可达、带真正 `app_quit` 的 Goal）：同一行写为**单一规则**：§6.1.4 第 5 项对不可达 Goal 的 `app_quit` 的解除（启动时，或 F8 解除时，不论 `outcome_reason`）推迟，Goal 留在 `paused`、继续目标（`run`、`settle`、`verify`）原样保留；可达时 ④ 执行第 5 项，与不可达期间写入、`outcome_reason` 为 `project_unreachable` 的 `app_quit` 相同（只在 `resumeOnLaunch` 打开时），继续目标随之执行。`12` §12.6.5 的 `app_quit` 一行：该目标当前不可达、解除因此推迟时同样写 `Project 不可达`。
- **R108-D6-01**（单线程排队；`~/.tower` 所在卷读不出）：`13` §13.5 改为**按挂载点隔离**：每个挂载点（按路径在挂载表中的最长前缀，只读挂载表、不访问该路径）一个 `worker_thread`；5 s 从调用开始执行时计，超时的路径按不可访问计、该线程被放弃并另起一个继续其他路径，每个挂载点至多一个被放弃而未退出的线程，再次超时时该挂载点上的路径都按不可访问计。所以一个挂起的挂载只影响它上面的路径。`10` §10.16.1 的存在性检查（`turn_end` 前与 10 分钟的定期检查）经同一组线程。`~/.tower` 所在卷读不出剩余空间时，F8 的这一项**按未知计**：不因此进入只读（启动时同此）、也不因此停在只读，按其余各卷判定，并显示存储提示（`08` §8.1 增一类条件）；它若确实已满，下一次写入的 `ENOSPC` 再进入 F8。
- **R108-D13-03**（永久不可达时的出口；绑定处理没有命令）：③ 的例外加 `goal.abandon`（只写数据库，不访问不可访问的路径；人工编辑检出不可读时不做差异询问，确认框写明目录都留在原处，ADR-228），之后可以清除。`06` §6.4.3 新增仅本机的命令 **`project.relocate{projectId, newCheckoutPath?, worktreeRoot?}`**：核对 `Project.identity`（同添加项目的检查）与 §10.1.1 的路径规则；作用于附着检出不可访问的非终态 Goal 的 binding（没有时作用于全部非终态 Goal，人主动迁移）；`worktreeRoot` 写 `Project.worktreeRoot`；`<wtRoot>` 随之改变的按情形 F 重建；旧目录 Tower 不删除，不可访问的旧卫星中最后一个检查点之后的改动不带过来（确认框写明，如实登记）。情形 D 的三个处理都落到已有的命令或由人完成：定位仓库与重新克隆之后都以 `project.relocate` 重新附着（Tower 不替你克隆）；只保留分支由 Goal 页写出从影子取分支的 git 命令、由你执行（同 `10` §10.12 撤销合入由人完成的做法），之后放弃这些 Goal。`06` §6.4.7 与 `16` §16.5 登记为仅本机（lint (v)）。
- **R108-D12-01**（清除续做的推迟范围与判定对象）：`06` §6.1.6 隐私清除一行补 **不可访问的根**（唯一定义，清除执行时与续做相同）：每个根只按 `roots[].wtRoot` 判定（同一组线程与 5 s，不读 Project 行——`project`、`all` 两档的 Project 行已删除，`roots` 自 ADR-198 起就在事件中）；不可访问的根之下的删除推迟，`~/.tower` 中的副本与可访问的根立即删除；推迟的根随 30 s 的复查续做；全部完成才追加 `filesDone`，`all` 档的数据库最后删除；推迟的根列入清除结果与 `09` §9.12.4 “清除之后仍可能存在的副本”。“整条推迟到可达” 删除。
- **R108-D5-01**（`retry.provider.timeoutMs` 的 0 与非整数；F4b 的触发与卡片原因）：**唯一定义** `05` §5.3.6 代理一行：`retry.provider.timeoutMs` 设置时须为正整数且不超过 2147483647（0 立即中止、非整数抛出 `timeout must be an integer`，两者都命中可重试模式；超过该值时 Node 的定时器按 1 ms 计），两项次数为非负整数（“有限的非负数” 删除）。Codex 类 provider 本把 0 当作不限时，Tower 一律拒绝（不限时请不设置此项，如实登记）。F4b 的触发列表、`03` §3.2.1 与 `16` §16.1.1 `prepare_failed` 补 “读到无效的 Pi 设置”；卡片原因 `启动失败：Pi 设置 <名字> 无效`，`重试` 旁写 “请先在 Pi 设置中改正”（`04` §4.8.11、`12` §12.6.5）。D63 补 “在所钉的厂商 SDK 版本上确认 `timeout` 的校验”，C43 补 0 与 1.5 两组。
- **R108-D7-01**（退出确认框无条件承诺自动恢复）：确认框文字只在 `06` §6.1.4 第 2 项定义（`04` §4.16 F12 引用）：`resumeOnLaunch` 打开时 “下次启动时自动继续”，关闭时 “运行中的下次启动后仍为暂停，需要你点继续；验证中的下次启动时以同一 pin 重新验证”；已在暂停中的 Goal 另起一行（ADR-232 的规则）。

**评审结论中的观察（R108 结论部分）**
- 观察 1：`11` §11.7.1 的窗口改写为：压缩与摘要止于下一次 `turn_start`；缓存预热在默认 `streaming` 模式下止于 settle，`idle` 模式下 settle 之后继续，至多到启动它的请求之后 30 min 或会话 `dispose`。`06` §6.2.5 写明 `idle` 模式下 settle 之后的预热用量只在同一会话之后的某次对账中出现，Goal 进入 `in_review` 或终态后不再出现（金额很小，有节省门槛）。不在受保护设置中固定（D2）。
- 观察 2：`05` §5.3.6 与 D63 改引 `core/agent-session.ts:1204, 3795`（见核实）。
- 观察 3：`06` §6.1.4 第 5 项的 `!` 命令缓存限定为 `auth.json`；`models.json` 中的 `!` 命令每次 `getAuth` 都执行，与每次模型请求相同。
- 观察 4：`03`、`08`、`12`、`04`、`16`、`05` 的探测摘要改为 “同组已存活的空闲 Host”；`06` §6.1.4 删去 “Host 的运行时不能代它判定”。
- 观察 5：F13 一行写明 `tool_call` 出错阻断工具、`turn_start` 出错照常发出请求，两者都计入连续 3 次。
- 观察 6：F8 只读期间与 Goal 不可达期间，`提供方可能已恢复？` 不带 `[重试]`（`06` §6.1.4、`12` §12.6.5）。
- 观察 7：`12` §12.6.5 `app_quit` 一行：条件消失之后因 `resumeOnLaunch` 关闭而仍暂停的，写 `已暂停 · 应用退出`。
- 观察 8：网络卷单次 `stat` 超过 5 s 或唤醒后尚未重连即判为不可达，不做第二次采样、没有唤醒宽限，如实登记于 `06` §6.1.6（不丢工作）。
- 观察 9：`08` §8.1 写明 Project 不可达与应用退出一样只在卡片与实况行上，不是 Needs-You，没有横幅。
- 观察 10：`12` §12.6.5 的追加注明不重复；因不可达取消验证的写 `验证已取消（Project 不可达）`；`04` §4.18.3 改为 “其他受影响的目标”。
- 观察 11：`04` §4.18.3 Project 不可达一行的恢复一栏带 `resumeOnLaunch` 条件，出口列出迁移、重新克隆后迁移、改工作目录位置与放弃后清除。
- 观察 12：`03` §3.2.1 `app_quit` 的来源补 Project 不可达、出口写明不可达期间只有 `abandon`；`16` §16.2.6 改按必需路径表述；`13` §13.5 的 Host 存活写为 “有活跃 Run、以及按 `06` §6.1.8 退出之前”。
- 观察 13：`13` §13.5 写明启动时可达性检查使命令的受理至多推迟约 5 s，冷启动预算不含这段（如实登记）。
- 观察 14：lint (d) 的 ADR-235 三项（`short-lived probe Host`、`volume-name mount heuristic`、`automatic checkout discovery`）改为严格模式（DELETED_STRICT），“不再” 等宽松历史词不再豁免它们。
- 观察 15：`05` §5.3.6 的 “先到者起作用” 限定为等待响应头时；响应体期间只有分发器的 `bodyTimeout`（见核实）。
- 观察 16：G35e (q) 的断言改用 `goal.resume`、`goal.take_over` 与错误文字；不可达期间读写这些路径的后台工作（从附着检出 fetch base、`10` §10.16.1 的定期检查）跳过、只涉及 `~/.tower` 的照常，写在 `06` §6.1.6 ③。

**删除 / 简化**
- 删除：`06` §6.1.6 隐私清除一行的 “`roots` 涉及不可达的 Project 时整条推迟”；Project 不可达一行按整个 Project 判定的写法；`05` §5.3.6 “有限的非负数”；`06` §6.1.4 “Host 的运行时不能代它判定”；`10` §10.4.3 “记入 Project 设置”；`10` §10.16.2 情形 D 由 Tower 克隆与 “从镜像导出” 的写法（改为由你执行、Tower 给出命令）。
- 简化：五条分支都并入 ADR-235 的同一条规则与同一次判定。
- 推迟：无。
- `16` §16.1.13 补登第 108 轮被取代的说法 1 行，由 (D) 检查；lint (d) 的 ADR-235 三项改为严格模式。

- **lint**：全部检查 `--checks rstuvwxyzckdnSeRqpoPiDgKYATFMBOJCH`，exit 0；见 `reviews/round-108-lint.md`。
- **排期**：+0.06 人周（WBS 124.30 → 124.36）：W6 +0.01（Agent，`retry.provider.timeoutMs` 的校验与 F4b 的卡片原因）；W4 +0.02（桌面，按挂载点隔离与按 Goal 判定）；W7 +0.03（系统，失败先判可达、`project.relocate`、清除按根推迟；W7-rest，不在依赖链上）；其余按 WBS 行不足 0.01。
  - 按 ADR-136 的常规规则在余量之内吸收，**M1 维持 39 周**（2026-11-09 → 2027-08-06；第 35 周末冻结，2027-07-09；M2 至 2027-11-12；M3 至 2028-02）。
  - `14` §14.3.4 与 ADR-133 第 108 轮补记一致：余量 系统 1.07、Agent 1.07、桌面 0.96、设计 0.94、安全 1.10；依赖链 19.91；最长线仍为设计（29.06）。
  - **增 1 人方案仍为 34 周**：130.41 / T 24.07 / 27 个工作周，第 30 周末冻结（2027-06-04），至 2027-07-02（新人约 2.42 人周安全线工作）；下一个台阶仍是全部工作超过 135.52 人周（35 周）。

## 第 109 轮对抗评审（全范围）后的跨文档决策（ADR-237）

## ADR-237 清除一次完成不推迟、迁移记下旧位置、路径丢失的确认、不可达期间放弃清除 `syncing`、每一种自动解除都推迟、三项超时设置同一上限、F13 由 tower-goal 自报、失败先判可达只判定实际读写的路径 — Accepted（R109 全部条目与评审结论中的观察；Amends ADR-236；M1 维持 39 周，增人备选仍为 34 周；Amended by ADR-238、ADR-239）

选择原则（收敛规则，同 ADR-186–236）：只用三种办法关闭条目——(1) 把说法改弱但为真；(2) 删除或推迟不属于 M1 主循环的机制；(3) 在已有的唯一定义处加至多一条守卫、一行或一个字段。本轮另守一条取向：**不留任何之后可能删除数据的推迟续做**，不丢你的工作，全部不变式保留。评审的两条重要条目同源——一个保守的 “推迟” 或 “不删除” 因为没有记下推迟或留下了什么，后来变成 “删除过多”（R109-D12-01）或 “永远不删除也不告知”（R109-D13-01）。两条都在已有的唯一定义处关闭：
- 清除一次完成：不可访问的根由你在确认框中接受 “不触碰”，记入库外的一个小清单，只用于列出，Tower 之后从不自动删除；
- 迁移把旧位置记入 Project 行已有的 `settings` JSON，存储面板与清除照常找到它。

新增的只有：`~/.tower/purge-leftovers.json`（清除遗留清单：只含根的路径与清除时间，Tower 自有、在数据库之外，“清除全部”与 `goal-id-hwm` 一样保留它）；`Project.settings` 的两个字段 `relocatedFrom: [{checkoutPath?, wtRoot, at}]` 与 `defaultCheckout`（后者此前只在 `10` §10.1.1 中提到、没有落点）；存储面板的两种标注（`迁移后遗留`、`清除时未删除（当时不可访问）`）与一段确认框文字（`原路径已不可访问，未交还的修改将无法取回`）。不新增状态、暂停原因、事件类型、表、列、命令、决定种类、Needs-You kind、landmark、`wait_reason` 值、锁或进程。安全不变式全部保留：Tower 不会自动把机密交给 Agent 可影响的进程；路径不可访问时 Tower 对任何 Goal 都不删除、不改名、不重建、不执行丢失处理（路径丢失的确认由你发出，只写数据库）；人的工作现场不自动删除（ADR-228）；清除从不写用户仓库，也不再有之后会删除数据的续做；`project.relocate` 仍仅本机。安全问题只写到设计层面。

**Pi v1.2.0 核实**（`git show v1.2.0:<path>`；`packages/coding-agent/src/` 下，另注 `agent`、`ai`；厂商 SDK 取 Pi 所钉的版本）
- R109-D5-02：`core/extensions/runner.ts:1249-1267`（`emitToolCall` 逐个 `await handler(event, ctx)`，没有 try/catch，也不 `emitError`）；`:1096-1125`（通用的 `emit` 捕获处理器异常，以 `event: event.type` 调用 `emitError`，`:1111-1120`；`turn_start` 走这里）；`core/agent-session.ts:667-681`（`_beforeToolCall` 只把异常重新抛出，非 Error 包成 `Extension failed, blocking execution`）；`agent/src/agent-loop.ts:770-776`（`prepareToolCall` 的 catch 把它变成一条错误的工具结果，即 “阻断”）。`runner.ts` 与 `agent-session.ts` 中全部 `emitError` 调用处的 `event` 取值（`register_provider`、`register_virtual_model`、`register_mcp_server`、`message_end`、`tool_result`、`user_bash`、`context`、`context_with_system`、`before_provider_request`、`before_provider_headers`、`before_agent_start`、`resources_discover`、`input`、`turn_end`、`agent_before_settle`、`prepare_loadout`、`command`、`skill_expansion`、`send_message`、`send_user_message`，以及 `emit` 的 `event.type`）都不是 `tool_call`；`tool_call` 只经 `emitToolCall`（`agent-session.ts:663-669`、`runner.ts:1253`）。评审的结论成立。
- R109-D5-01：`core/settings-manager.ts:147-156`（`parseTimeoutSetting` 经 `parseHttpIdleTimeoutMs`，无效才抛出）、`:900-901`、`:934-936`（两个 getter）；`core/http-dispatcher.ts:18-34`（接受数字字符串与任意有限的非负数、向下取整，`disabled` 为 0，没有上限）；`core/sdk.ts:346`（只把 0 换算为 2147483647）、`:350`（`retry.provider.timeoutMs` 未设置时取 `httpIdleTimeoutMs`）、`:351`（`websocketConnectTimeoutMs` 经 getter）；厂商 SDK 的 `setTimeout(abort, ms)`：`@anthropic-ai/sdk` 0.129.0 `client.js:668`、`openai` 7.19.0 `client.js:996`（第 108 轮回应已核对）。
- 观察 10：`core/agent-session.ts:1204` 为 `this._retryAttempt >= settings.maxRetries`，`:3795` 为 `this._retryAttempt > settings.maxRetries`（**更正 ADR-236 与 `05` §5.3.6 的 `>=`**；遇到非数值时两者都不成立，结论不变）；`ai/src/api/openai-codex-responses.ts:192-198`（`normalizeTimeoutMs` 拒绝负数与非有限值）、`:295, 302`（默认 `transport` 为 `"auto"`，非 `sse` 时先走 WebSocket）、`:1392-1403`（WebSocket 上 `idleTimeoutMs` 在每条消息之间计时，流开始之后仍起作用；**更正 ADR-236 “Codex 的计时只到响应头”**，那只对 SSE 传输成立，`:398, 409`）。
- 观察 14：`core/settings-manager.ts:891-898, 925-932`（`retry.maxRetries` 以 `??` 取默认值，JSON `null` 即未设置；`retry.provider.*` 原样返回）。
- 评审所引其余各处均为原文。

**条目（R109 追问清单）**
- **R109-D12-01（重要）**（推迟中的 “清除全部” 在完成时删除此后新建的数据）：**唯一定义**移到 `09` §9.12.4 “不可访问的根”：**清除一次完成、从不推迟**。确认框列出这时不可访问的 `<wtRoot>`（判定只按 `roots[].wtRoot`，同一组线程与 5 s），写明其下 Tower 创建的目录这次不会删除、之后 Tower 也不会自动删除，由你接受后执行；这些根不写入事件的 `roots`，只记入 `~/.tower/purge-leftovers.json`（只用于列出）。执行或崩溃续做中才变为不可访问的根同样不触碰、记入清单、列出。其余在这一次中删除，完成即追加 `filesDone: true`，`all` 档随后删除数据库，应用回到首次运行（`04` §4.18.1）。清单中的根重新可访问时，存储面板把其下 Tower 创建的目录列为 `清除时未删除（当时不可访问）`，由你一键删除（`10` §10.2、§10.3.2 “清理工作目录”），从不自动删除。崩溃之后的续做在接受界面命令之前完成（`06` §6.1.6），所以 `project` 档同样不会删到再次添加的同一项目此后的 `~/.tower` 内容。“`all` 档的数据库在全部完成之后才删除” 的推迟机制删除（lint (d) 登记）。引用处：`06` §6.1.6 隐私清除一行与 Project 不可达一行的出口、§6.4.3 `privacy.purge`；`04` §4.15 存储面板与清除的确认框；`14` G35e (q)。
- **R109-D13-01（重要）**（迁移后旧位置的 Tower 目录脱离追踪）：**唯一定义** `06` §6.4.3 `project.relocate` 行 “旧位置的记录”：同一事务把旧的检出路径与旧 `<wtRoot>` 追加到 `Project.settings.relocatedFrom`（`02` §2.3、`06` §6.3 `projects.settings`），并结束这些 Goal 在旧位置的 `goal`、`verify` 角色 `WorktreeRecord`（`inspect`、`human` 仍在使用的照旧，见 R109-D13-02）。旧 `<wtRoot>` 因此仍是已知位置：`10` §10.2 “列出的来源” 补入它与清除遗留清单中的根——人的工作现场照常列出、可一键删除（ADR-228），Tower 创建、已没有当前记录的卫星、`_gitdirs`、`_stores` 与 `_verify` 槽位列为 `迁移后遗留`，由 “清理工作目录” 删除；清除把旧 `<wtRoot>` 写入 `roots`（`06` §6.4.3 `privacy.purge`、`09` §9.12.4 “清除一个 Goal” 一行）；不可访问时注明 `不可访问`。Tower 不自动删除旧位置的任何目录。
- **R109-D13-02**（旧卷永久丢失时，旧路径上的人工编辑检出与检验检出使 Goal 永远不可达）：`06` §6.1.6 Project 不可达一行 ③ 增一个例外 **路径丢失的确认**（唯一定义）：不可访问的必需路径只有该 Goal 的人工编辑检出或使用中的检验检出时，`goal.discard_human_edits` 与 `inspect.close` 可用，确认框写 `原路径已不可访问，未交还的修改将无法取回`，命令按各自已有的 “检出已丢失”“使用中而目录已不存在” 分支执行、只写数据库；之后该路径不再是必需路径，已验证、待验收的 Goal 因此可以继续。原路径以后重新出现时它是已脱离的副本（`10` §10.2）。`06` §6.4.3 两行与 `10` §10.16.2 情形 D（“人确认原路径不会再出现”的效果）引用。
- **R109-D13-03**（不可达期间放弃 `syncing` 的 `in_review`/`accepted` Goal 违反 CHECK）：`06` §6.4.3 `goal.abandon` 行补：从 `in_review`/`accepted` 放弃而 `human_checkout.syncState='syncing'` 时同一事务清除 `human_checkout`（检验目录按 ADR-228 保留，写回到一半的卫星随 Goal 进入终态、按终态的到期删除处理）。`inspect.bring_back` 行的不变式改为 “……从不在‘写回已不在进行而 `syncing` 仍在’的状态上执行，只有一个例外：该 Goal 不可达期间的 `goal.abandon`，它清除 `human_checkout`”；`project.relocate` 对这样的 Goal 返回 `E_STATE`（`写回未完成：可达后自动续写，或放弃该目标`）。CHECK 不变。
- **R109-D4-01**（`engine_crash` 的启动解除没有随 `app_quit` 推迟）：`06` §6.1.6 ③ 改为一句：对不可达 Goal 的**每一种自动解除**都推迟——`autoResume` 的原因都在内（集合以 `16` §16.1.1 为准）：§6.1.4 第 5 项对 `app_quit`、`engine_crash` 的解除，`provider_unavailable` 的探测不可达期间跳过；④ 可达时执行第 5 项，两种原因相同。`06` §6.1.4 第 5 项、`03` §3.2.1、`12` §12.6.5 `engine_crash` 一行引用。
- **R109-D5-01**（上限只加在一项）：`05` §5.3.6 代理一行写为一处 **上限**：`httpIdleTimeoutMs`、`websocketConnectTimeoutMs` 读到的值与 `retry.provider.timeoutMs` 都不得超过 2147483647（前两项的 0 与 `disabled` 仍为不限时），Host 启动时与每个 Run 都校验，超过时按 F4b，卡片原因同 `启动失败：Pi 设置 <名字> 无效`。C43 补三组超过上限的取值与 `retry.maxRetries` 一组。
- **R109-D5-02**（F13 依赖 Pi 不会发出的 `extension_error`）：**唯一定义** `05` §5.6.5 第 6 项（故障保护）：tower-goal 的 gate（`tool_call`）与 `turn_start` 处理器都以 try/catch 包住自身，出错时先经 `bridge` 报告（Host 转为 `engine.error{source:"extension"}`，Needs-You `sentinel`，severity 3），再重新抛出，保持 Pi 的阻断（`tool_call`）与照常发请求（`turn_start`）；连续 3 次暂停该 Goal。Pi 另发的 `extension_error` 只进诊断、不重复计数。`06` §6.8 F13 的检测列改为 “tower-goal 自报”，`05` §5.5 `extension_error` 一行与 §5.6.5 `turn_start` 一行同步；C5 补断言（处理器抛出时没有 `extension_error`，计数仍增加，连续 3 次时 Goal 暂停）。
- **R109-D7-01**（验证的非零退出按全部必需路径判定；反向竞争未登记）：`06` §6.1.6 的 “失败先判可达” 改为只判定**该操作实际读写的路径**：验证——槽位所在的 `<wtRoot>` 与 pin 所在的影子；写回——来源目录与卫星；重建与接管物化——卫星与要物化的目录。验证不读的附着检出停顿不再使一次真实的失败被丢弃（`07` §7.4.6 的 “绝不能” 因此不受影响）。反方向的竞争（卷短暂停顿使操作失败、判定时卷已恢复）按真实的失败执行失败出口，不丢工作，如实登记为可接受（`06` §6.1.6、`07` §7.4.1 磁盘满一句旁）。`07` §7.4.1 的伪代码在 `recordFact` 之前补这一判定。

**评审结论中的观察（R109 结论部分）**
- 观察 1：`13` §13.5 改为 “至多推迟约 10 s”（同一挂载点要两次超时才判为整体不可访问）；符号链接一句如实改写：两条经链接指向同一个挂起卷的路径先后超时时，链接所在挂载点（常为启动卷）上的全部路径在被放弃的线程退出之前按不可访问计（不丢工作）。
- 观察 2：`13` §13.8.1 Supervisor 一行注明可达性检查的 `worker_thread`（每个挂载点至多两个，各是一个 V8 isolate）未计入，E6 一并测量。数值不变（lint (A) 照查）。
- 观察 3：`project.relocate` 的 `E_BUSY` 补准备中、卫星重建中、接管物化中与验证进行中。
- 观察 4：主动迁移在多附着点时一并改指，写明为如实登记的取舍；不加 `fromCheckoutPath`（新参数不属于本轮必要的修改）。
- 观察 5：迁移本身不开 Run，分叉出的会话供下一次 Run 使用（`10` §10.16.2 情形 F）；`06` §6.4.3 与 `10` §10.1.1 的 “`restoreCheckpoint(最新)`” 改为 “重建来源与步骤按情形 E”；“默认检出” 落到 `Project.settings.defaultCheckout`（`02` §2.3、`06` §6.3），`10` §10.1.1 的选择顺序 (2) 只在它可访问时取。
- 观察 6：`06` §6.1.6 改称 “不判定的 Goal——`integrated`（宽限期内）与终态（`archived`、`abandoned`）”，不再把 `integrated` 称为终态；`project.relocate` 的 “非终态 Goal” 写明不含 `integrated`。
- 观察 7：不可达期间备份 bundle 沿用上一次的瘦或完整选择，没有时取完整 bundle（`06` §6.1.6 ③）。
- 观察 8：情形 D 改为界面写明 “请从你的托管服务克隆（远端为 <别名>）”；`10` §10.16.3 的恢复一行对齐（情形 B 用现有检出，情形 D 用你克隆或定位的新检出）。
- 观察 9：`04` §4.15 存储面板补 `不可访问`、两种遗留标注与 `~/.tower` 所在卷读不出时的 `◇ 存储`，项目设置补 `默认检出` 与 `[迁移…]`（含确认框要点），清除的确认框补不可访问的根；`04` §4.18.3 Project 不可达一行与 `03` §3.2.1 的例外改为引用 `06` §6.1.6 ③；`12` §12.6.5 检查 i 一行列出卡片动作；`04` §4.18.3 离线一行与 `03` §3.2.1 `provider_unavailable` 一行补 “F8 只读期间与不可达期间不带 `[重试]`”（第 108 轮观察 6 的另一半）；`04` §4.8.11 的示例改为引用 `12` §12.6.5 的模板。
- 观察 10：引文更正见上方核实（`05` §5.3.6 两处）。
- 观察 11：`12` §12.6.5 `app_quit` 一行补 **先后**：按当前仍成立的条件取——当前不可达写 `Project 不可达`，否则 F8 仍在只读写 `磁盘已满`，都不成立时按条件消失之后的写法。
- 观察 12：G35e (q) 补 `验证已取消（Project 不可达）` 的实况行、推迟解除时的卡片（`engine_crash` 一组）、`resumeOnLaunch` 关闭时的 `已暂停 · 应用退出`、`~/.tower` 所在卷读不出时按未知计、`integrated` 归档时卫星删除的推迟，以及本轮各条目的组。
- 观察 13：`10` §10.16.2 情形 F 写明：可达卷上的 `<wtRoot>` 被整个删除时判为不可达、不判为卫星丢失；出口为迁到别的位置、你重新建立该目录（之后按情形 E 重建）或放弃，`worktreeRoot: null` 不改变路径时不触发重建。
- 观察 14：`05` §5.3.6 补 JSON `null` 按未设置处理，数字字符串的次数不接受（比 Pi 严格，如实登记）。

**删除 / 简化**
- 删除：隐私清除对不可访问的根的推迟续做（“推迟的根随 30 s 的复查……可访问时续做”“`all` 档的数据库在全部完成之后才删除”，ADR-236），lint (d) 登记 `deferred purge continuation`；F13 对 `tool_call` 的 `extension_error` 依赖；`13` §13.5 “至多推迟约 5 s”。
- 简化：清除的每一档都一次完成；迁移的旧位置并入已有的列出来源与 `roots`，不另设入口。
- 推迟：无。
- `16` §16.1.13 补登第 109 轮被取代的说法 1 行，由 (D) 检查；第 108 轮一行的新栏改为现行写法。

- **lint**：全部检查 `--checks rstuvwxyzckdnSeRqpoPiDgKYATFMBOJCH`，exit 0；见 `reviews/round-109-lint.md`。
- **排期**：+0.06 人周（WBS 124.36 → 124.42）：W6 +0.01（Agent，F13 自报与 C5）；W4 +0.01（桌面，每一种自动解除都推迟、放弃清除 `syncing`、G35e (q)；落点在 W3）；W7 +0.04（系统，W7-rest，不在依赖链上：清除一次完成、迁移记下旧位置、路径丢失的确认、失败先判可达的路径范围）；其余按 WBS 行不足 0.01。
  - 按 ADR-136 的常规规则在余量之内吸收，**M1 维持 39 周**（2026-11-09 → 2027-08-06；第 35 周末冻结，2027-07-09；M2 至 2027-11-12；M3 至 2028-02）。
  - `14` §14.3.4 与 ADR-133 第 109 轮补记一致：余量 系统 1.03、Agent 1.06、桌面 0.95、设计 0.94、安全 1.10；依赖链 19.91；最长线仍为设计（29.06）。
  - **增 1 人方案仍为 34 周**：130.47 / T 24.09 / 27 个工作周，第 30 周末冻结（2027-06-04），至 2027-07-02（新人约 2.41 人周安全线工作）；下一个台阶仍是全部工作超过 135.52 人周（35 周）。

## 第 110 轮对抗评审（全范围）后的跨文档决策（ADR-238）

## ADR-238 必需路径只有根、失败先判可达按根且中断必有续做者、写回中断时放弃先保存 T1、路径丢失确认按记录判定、`relocatedFrom` 只在位置改变时写入、清除遗留清单最小化并先于事务落盘、`tool_result` 脱敏处理器 fail-closed、base 确认中的环境错误按无结论 — Accepted（R110 全部条目与评审结论中的观察；Amends ADR-237、ADR-236；M1 维持 39 周，增人备选仍为 34 周；Amended by ADR-239）

选择原则（收敛规则，同 ADR-186–237）：只用三种办法关闭条目——(1) 把说法改弱但为真；(2) 删除或推迟不属于 M1 主循环的机制；(3) 在已有的唯一定义处加至多一条守卫、一行或一个字段。本轮另守一条取向：**“不可达”只描述你拥有或可能被移除的位置，Tower 自己预期会消失或尚未建成的目录从不因此冻结**；不丢你的工作；全部不变式保留。评审唯一的重要条目来自一个跨越几轮的定义问题：ADR-236 把人工编辑检出本身列为必需路径，ADR-237 又把失败先判可达落到来源目录、卫星与要物化的目录这些叶目录上，而 “不可访问” 按路径本身的 `stat` 判定、包含 “被删除”——于是已设计的丢失与失败分支成为死代码，只有叶目录不在的中断没有续做者，中断的交还只剩丢弃 T1 的出口。本轮在 `06` §6.1.6 的唯一定义处一次关闭：必需路径只有**根**，根之下的目录按所在的根判定。

新增的只有：影子中每个 Goal 至多一个的 ref `refs/tower/<goalId>/handback-t1`（写回中断时放弃该 Goal 保存的 T1，保留到影子删除）；存储面板“清理工作目录”中对清除遗留清单条目的 `从列表移除`（只删清单条目）；`flake` Fact 的 `observations.baseInconclusive`。不新增状态、暂停原因、事件类型、表、列、命令、决定种类、Needs-You kind、landmark、`wait_reason` 值、锁或进程（F13 的第三次暂停沿用已有的 `prepare_failed` 运行中途一支）。安全不变式全部保留：Tower 不会自动把机密交给 Agent 可影响的进程（`tool_result` 脱敏这一层的故障方向改为隐去，而不是放行）；根不可访问时 Tower 对任何 Goal 都不删除、不改名、不重建、不执行丢失处理；人的工作现场与 `.kept-*` 不自动删除（ADR-228）；清除从不写用户仓库，没有之后会删除数据的续做；`project.relocate` 仍仅本机。安全问题只写到设计层面。

**Pi v1.2.0 核实**（`git show v1.2.0:<path>`；`packages/coding-agent/src/` 下）
- R110-D11-01：`core/extensions/runner.ts:1190-1247`（`emitToolResult`）对每个处理器 try/catch（`:1197-1233`，catch 在 `:1223-1233`，只 `emitError({event:"tool_result"})`），没有处理器改动结果时 `:1236-1238` 返回 `undefined`，原始结果照常进入模型与会话；处理器返回 `content` 而不带 `structuredContent` 时 Pi 删除原有的 `structuredContent`（`:1201-1204`）。与 `emitToolCall`（`:1249-1267`，不捕获）相反，对 `tool_result` “捕获、自报、重新抛出” 等于放行。评审的结论成立。
- 观察 10：`core/http-dispatcher.ts` 中 `parseHttpIdleTimeoutMs` 从 L19 开始（`05` §5.3.6 的引文更正为 `:19-34`）；ADR-237 列举的 `emitError` 取值漏了 `emitCacheWarmingDecision`（`runner.ts:1128` 起，`emitError` 在 `:1138-1143`，取 `event.type`）。都不是 `tool_call`，ADR-237 的结论不变。

**条目（R110 追问清单）**
- **R110-D13-01（重要）**（“不可访问” 包含 “被删除” 并被套用到叶目录：丢失与失败分支成为死代码，中断无人续做，中断的交还只剩丢弃 T1 的出口）：
  - **必需路径只有根**（唯一定义 `06` §6.1.6 Project 不可达一行）：附着检出、该 Goal 的卫星、检验检出与验证记录所在的 `<wtRoot>`，以及人工编辑检出所在的 `<wtRoot>`（迁移之后为 `relocatedFrom` 中它所在的旧 `<wtRoot>`）。根之下的目录——卫星、`_gitdirs`、`_stores`、验证槽位、人工编辑检出、检验目录、要物化的目录及其旁路目录——不是必需路径：根可访问而目录不在 = 确实不在，由已有分支处理（`human_checkout_lost`、`syncing` 时以 T1 续写、写回失败的 ① 重新物化与 ②③ 的还原、改名与重建、情形 E）；根不可访问才是不可达。`~/.tower` 中的路径（影子、回退位置的槽位）不在判定之内。“不区分卷未挂载、被移动、被删除” 只对根成立——根被删除或移走与卷未挂载一样由你处理（迁移、重新建立或放弃）。
  - **失败先判可达按根**：验证判槽位所在的 `<wtRoot>`（删去 “pin 所在的影子”）；写回判来源目录与卫星所在的 `<wtRoot>`；重建与接管物化判卫星与要物化的目录所在的 `<wtRoot>`。这些根都是该 Goal 的必需路径，所以**判为中断时该 Goal 同时判为不可达，由 ④ 续做**：`syncing` 与 `satellite_rebuilding=1` 只在该 Goal 不可达期间由这一条留下（另两种已有的留存——崩溃到重启、F8 只读期间——各有续做者），没有无人续做的中断。根可访问时照常执行失败出口，目录不在就是已有的丢失与失败分支。`07` §7.4.1 的伪代码与说明同步，准备与服务的文件系统错误同样先判（观察 4）。
  - **T1 的保留**（唯一定义 `06` §6.4.3 `goal.abandon` 行）：放弃时 `syncState='syncing'`（只在不可达期间可能）——交还或带回的改动还没有写完，T1 可能是它仅剩的副本——在写放弃的事务之前先在影子中写 `refs/tower/<goalId>/handback-t1`（以 T1 为树的提交，幂等，只写 `~/.tower`），它与 pin、seal ref 一样保留到影子删除（`10` §10.3.2），不随影子 gc 回收；确认框写明交还的改动尚未写入、Tower 保留一份、你的副本在何处，目标页列出 `未写完的交还（保存在 Tower 中）` 与取回方式（以只读的 git 命令从影子中导出，由你执行）。`inspect.bring_back` 行的不变式补一句：清除 `targetTree` 而写回没有完成的只有写回失败的 ③（其前 ① 在根可访问而来源目录不在时已重新物化）与这一例外。
  - **更正第 109 轮回应**：`round-109-response.md` “偏离与未决” 中 R109-D13-03 一条写 “这类 Goal 在卷永久丢失时只能放弃（检验目录与影子中的检查点都保留）”。这一说法不完整：T1 不是检查点，ADR-237 之下放弃会使它在影子 gc 的宽限期后被回收，而人工编辑检出可能随卷丢失。本 ADR 以 T1 的保留使这一出口不再丢失交还的改动；旧回应文件不改写，以本条为准。
  - **对齐**：`06` §6.1.6 人工编辑检出一行（`idle` 且目录不存在只在根可访问时）、§6.4.3 `inspect.bring_back` 行的失败段（根不可访问时视为中断，根可访问而来源目录或卫星不在时按本段）；`10` §10.8.4 “检出丢失”；`16` §16.2.6 磁盘预算一行（必需路径只有根）；`04` §4.6.7 写回失败一段、§4.18.3 工作目录被外部删除与 Project 不可达两行；`14` G31 补 “根可访问时删除 `idle` 与 `syncing` 的人工编辑检出”“根可访问时重建失败” 三组，G35e (q) 补 “写回中断后不再挂载并放弃” 一组（各组的期望见该处）。
- **R110-D13-02**（路径丢失确认的条件与 `syncing`）：条件改为按记录写（唯一定义 `06` §6.1.6 ③）：该 Goal 不可访问的必需路径都只因它的 `inspect`、`human` 角色记录或 `human_checkout` 而必需（这些 `<wtRoot>` 中没有它的卫星与验证记录，也不是附着检出），且不在 `syncing`；`goal.discard_human_edits` 与 `inspect.close` 在同一事务中结束对应的 `human`、`inspect` 角色 `WorktreeRecord`，之后这些 `<wtRoot>` 不再是必需路径；`syncing` 时两条命令返回 `E_STATE`（出口为可达后自动续写，或放弃并按 T1 的保留保存），卡片不列出这两项（`12` §12.6.5 检查 i 一行、`04` §4.18.3 同步）。`06` §6.4.3 两行只引用 ③ 的条件，不再复述 “唯一不可访问的必需路径”。
- **R110-D13-03**（`relocatedFrom` 的写入条件）：唯一定义 `06` §6.4.3 `project.relocate` 行 “旧位置的记录” 只对 `<wtRoot>` 确实改变的 Goal 执行（设置了 `worktreeRoot` 或新旧检出同一父目录同名时只改 `attach` 与 `defaultCheckout`，不追加、不结束记录、不重建）；追加按 `wtRoot` 去重（只更新 `at`），与迁移后的新 `<wtRoot>` 相同的条目移除；旧 `<wtRoot>` 仍是其他 Goal 当前位置时同样追加，列出范围只含已没有当前 `WorktreeRecord` 的目录（`10` §10.2 “列出的来源” 为唯一定义），活跃卫星不会被列出。**A → B → A**：情形 F（`10` §10.16.2）在新路径上已有同名工作目录或 gitdir（一半或两者）时，重建之前按 §10.2 “Tower 自动改名保留” 改名为 `.kept-*` 并列出，从不覆盖、也不当作已建成而复用。**合并与拆分**（M1 中已有的命令，`06` §6.4.3 `project.merge`/`split` 行）：合并时保留方的 `relocatedFrom` 取两者的并集，被并入一方不同的 `<wtRoot>` 一并追加，`defaultCheckout` 取保留方的；拆分出的 Project 不继承，旧位置仍记在原 Project 中。`02` §2.3 字段注释同步。
- **R110-D12-01**（清除遗留清单）：唯一定义 `09` §9.12.4 “不可访问的根”。**内容最小化**：`[{wtRoot, at}]`，不存 Project、Goal 或目录名，同一根一条（不采纳评审建议的 `projectId`/`goalId`：列出只需要根，判别靠 “没有当前记录”，多存只多留标识）。**写入次序**：清单先写入并落盘（临时文件、`fsync`、原子改名），再提交清除的数据库事务；执行或续做中才变为不可访问的根同样先记入，再追加 `filesDone`——任何时刻崩溃，未删除的根要么在 `roots` 中、要么在清单中。**列出范围**改为引用 `10` §10.2 的唯一定义：其下 Tower 创建、已没有当前 `WorktreeRecord` 的目录（`09` 与 `04` §4.15 的摘要补回这一限定）。**移除**：其下已没有这类目录时移除；不可访问的条目在 “清理工作目录” 中可 `从列表移除`（只删条目，不触碰磁盘）；`all` 档把这时可访问的清单根与其他根一样处理并移除条目，不可访问的照旧记入。“清除全部” 之后清单中只剩当时不可访问的根，可由你移除（如实登记它们在移除前留在 `~/.tower` 中）。`06` §6.6.1 目录布局补列该文件，备份排除一行写明它与 `goal-id-hwm` 一样不排除。`09` 人的工作现场一段与 `10` §10.2 “列出的来源” 末句补 “清除遗留清单中的根除外”。崩溃续做中变为不可访问的根只由存储面板列出（观察 8）。
- **R110-D11-01**（`tool_result` 脱敏处理器出错时 Pi 放行原文）：唯一定义 `05` §5.6.5 第 6 项补：脱敏处理器以 try/catch 包住自身，出错时经 `bridge` 自报（计入 F13）并**返回**一个隐去原文的常量结果（`content` 只有 `工具结果未能脱敏，已隐去`，`isError: true`，`structuredContent` 与之一致、不含原输出，ADR-004 约束），**不重新抛出**——失败的方向是 “这一次结果被隐去”，从不是 “原文进入模型”。`05` §5.5 `extension_error` 一行列明自报的三个处理器，其余处理器（`before_agent_start`、`input`、`turn_end`、`agent_before_settle` 等）的失败只进诊断，可能缺一次简报段、回执、检查点请求或 nudge，如实登记。C5 补断言；`06` §6.8 F13、`11` §11.7.1 脱敏一行同步。
- **R110-D7-01**（base 确认中的环境错误）：`07` §7.4.6 写明只有运行器报告该用例失败的一次才算 “base 上失败”；检出或物化失败、以文件系统错误结束、运行器没有给出该用例的结果、或该次之后槽位所在的 `<wtRoot>` 判为不可访问的一次是**无结论**：该用例判为 `introduced`（§7.4.6 已选的保守方向），`flake` Fact 记 `baseInconclusive`，**不写入** `flakeLedger`；“基线已坏” 同样只取有结论的运行。

**评审结论中的观察（R110 结论部分）**
- 观察 1：F13 的计数按 Goal、在 Host 进程内，同一 Goal 的任一 tower-goal 处理器正常完成一次即清零，新的 Host 进程从 0 开始；第三次以已有的 `prepare_failed`（运行中途停止的一种，卡片 `运行已停止 · 扩展 tower-goal 连续出错`，不在启动时自动解除，交还即解除）暂停；`bridge` 本身失败时这一次不计数（M1 的 `bridge` 在 Host 进程内，如实登记）。`02` §2.4、`03` §3.2.1、`12` §12.6.5 与 `16` §16.1.1 的 `prepare_failed` 来源同步。
- 观察 2：C5 补 `turn_start` 只计一次（不与 `extension_error{event:"turn_start"}` 重复）与 `tool_result` 一支的断言。
- 观察 3：`05` §5.3.6 登记三项超时不设下限，极小的正数与终端中的 `pi` 一样立即超时、重试、进入 `provider_unavailable`。
- 观察 4：`06` §6.1.6 与 `07` §7.4.1 的 “不写” 收窄为 “该条标准的 Fact 与 `verify.result`”，此前已写下的 Fact 作为已取消验证在该 pin 上的真实观测保留；准备与服务的文件系统错误同样先判可达。
- 观察 5：“验证不读的附着检出” 改为 “验证只在开始前读取的附着检出”，播种时的停顿记为 `not_copied`，属已登记的反方向竞争（`06` §6.1.6、`07` §7.4.1）。
- 观察 6：`12` §12.6.5 `engine_crash` 一行、`06` §6.8 F4 与 `16` §16.1.7 的 `◆` 与条目条件对齐 `08` §8.6.3：只在因 `resumeOnLaunch` 关闭而没有自动解除时，因不可达而推迟的解除不生成条目、不显示 `◆`。
- 观察 7：`04` §4.18.3 Project 不可达一行的恢复栏补路径丢失的确认（含确认框文字），“已结束的目标” 改为 “`integrated`（宽限期内）与已结束的目标”；§4.15 “清理工作目录” 的标签补迁移与清除留下的目录与 `从列表移除`。
- 观察 8：崩溃续做中变为不可访问的根只由存储面板列出，不写 “在结果中列出”（`06` §6.1.6 隐私清除一行、`09` §9.12.4）。
- 观察 9：`13` §13.5 注明符号链接的整组判为不可访问时，受影响的包括这段时间进行中的 Run（按 ① 中止、以 `app_quit` 暂停）。
- 观察 10：引文更正见上方核实。

**删除 / 简化**
- 删除：人工编辑检出本身作为必需路径；失败先判可达中的 “pin 所在的影子” 与对叶目录的判定（改为按根）；路径丢失确认中 “唯一不可访问的必需路径” 的写法。没有删除具名机制，lint (d) 不新增项。
- 简化：已设计的丢失与失败分支重新成为唯一的处理路径；路径丢失确认的条件只在 `06` §6.1.6 ③ 一处；清除遗留清单只存根与时间。
- 推迟：无。
- `16` §16.1.13 补登第 110 轮被取代的说法 1 行，由 (D) 检查。

- **lint**：全部检查 `--checks rstuvwxyzckdnSeRqpoPiDgKYATFMBOJCH`，exit 0；见 `reviews/round-110-lint.md`。
- **排期**：+0.06 人周（WBS 124.42 → 124.48）：W6 +0.01（Agent，`tool_result` 脱敏处理器 fail-closed、F13 计数与 C5）；W7 +0.05（系统，W7-rest，不在依赖链上：必需路径只有根与失败先判可达按根、T1 的保留、路径丢失确认与 `relocatedFrom`、清除遗留清单、base 确认的无结论（落点在 W9a，W9 行不变））；其余按 WBS 行不足 0.01。
  - 按 ADR-136 的常规规则在余量之内吸收（系统线余量 1.03 → 0.97，远高于改派阈值，不改派），**M1 维持 39 周**（2026-11-09 → 2027-08-06；第 35 周末冻结，2027-07-09；M2 至 2027-11-12；M3 至 2028-02）。
  - `14` §14.3.4 与 ADR-133 第 110 轮补记一致：余量 系统 0.97、Agent 1.05、桌面 0.95、设计 0.94、安全 1.10；依赖链 19.91；最长线仍为设计（29.06）。
  - **增 1 人方案仍为 34 周**：130.54 / T 24.10 / 27 个工作周，第 30 周末冻结（2027-06-04），至 2027-07-02（新人约 2.40 人周安全线工作）；下一个台阶仍是全部工作超过 135.52 人周（35 周）。

## 第 111 轮对抗评审（全范围）后的跨文档决策（ADR-239）

## ADR-239 T1 在写回开始之前由 `handback-t1` 引用且不按时间删除、Tower 不重新建立根、迁移的记录先于重建且写回中断时迁移列出原因、F13 按处理器计数并以 anomaly 自报、脱敏覆盖 `details`、验证中子进程的失败先判可达与 base 无结论按环境故障 — Accepted（R111 全部条目与评审结论中的观察；Amends ADR-238、ADR-237、ADR-222；M1 维持 39 周，增人备选仍为 34 周）

选择原则（收敛规则，同 ADR-186–238）：只用三种办法关闭条目——(1) 把说法改弱但为真；(2) 删除或推迟不属于 M1 主循环的机制；(3) 在已有的唯一定义处加至多一条守卫、一行或一个字段，其他文档引用而不复述。本轮另守两条取向：**写回与可达性这一类问题按“类”关闭**——T1 从写回开始之前到写回成功一直被 ref 引用，于是任何出口（失败、中断、放弃、清除之前的任何时刻）都不会使它不被引用，不再逐个出口补“先保存”；根只由 Tower 在从未使用过时建立，于是“根是否存在”只由你决定，不再逐个建立根的步骤补守卫。**界面不提供会被拒绝的动作**。不丢你的工作；人的工作现场与 `.kept-*` 不自动删除（ADR-228 不变）；全部不变式保留。评审唯一的重要条目来自 ADR-238 自己：T1 只在放弃时才被 ref 引用，而影子 gc 在不可达期间照常以 2 周宽限回收，正好在“卷永久丢失、过一段时间才放弃”的主要情形中失效。

新增的只有：检测器 id `tower_goal_handler_error`（F13 自报，kind `anomaly`）；`verify_env_error.stage` 的取值 `baseline`；`goal.delete_kept` 的可选参数 `handbackT1`（删除未写完的交还）。不新增状态、暂停原因、事件类型、表、列、命令、决定种类、Needs-You kind、landmark、`wait_reason` 值、锁或进程。安全不变式全部保留：Tower 不会自动把机密交给 Agent 可影响的进程（脱敏的覆盖面由 `content`、`structuredContent` 扩到 `details`，占位结果也替换 `details`）；根不可访问时 Tower 对任何 Goal 都不删除、不改名、不重建（`project.relocate` 自身在已校验可访问的新根上的重建除外）、不执行丢失处理，也不替你重新建立根；人的工作现场、`.kept-*` 与未写完的交还都不按时间删除；清除从不写用户仓库；`project.relocate` 仍仅本机。安全问题只写到设计层面。

**Pi v1.2.0 核实**（`git show v1.2.0:<path>`；`packages/` 下）
- R111-D11-01：`coding-agent/src/core/extensions/runner.ts:1206-1209`——`emitToolResult` 只在处理器返回的 `details !== undefined` 时替换它，返回值的 `details` 取 `currentEvent.details`（`:1240-1246`），所以不返回 `details` 时原值随结果传下；`core/agent-session.ts:714-720` 传出 `hookResult?.details`，`agent/src/agent-loop.ts:890` 取 `afterResult.details ?? result.details`；`tool_execution_end` 携带这一结果（`:919-928`），`createToolResultMessage` 把 `details` 写进会话中的 toolResult 消息（`:930-944`）；bash 截断时 `details = {truncation, fullOutputPath}`（`coding-agent/src/core/tools/bash.ts:342-343`），`TruncationResult.content` 是截断后的原始输出文本（`core/tools/truncate.ts:15-17`）；`edit` 的 `details` 是 `diff` 与 `patch`（`core/tools/edit.ts:70-77`）。返回 `details: {}` 即把它替换为空对象（`{}` 不是 `undefined`）。评审的结论成立：送往模型的只有 `content` 与 `is_error`，`details` 只进会话文件与 Tower 自己的观测。
- R111-D5-01：被阻断或抛出的 gate 调用是立即结果，经 `emitToolExecutionEnd` 结束而不经 `afterToolCall`（`agent/src/agent-loop.ts:600-613`；`prepareToolCall` 的立即结果在 `:744-776`）；并行模式为默认（`agent/src/agent.ts:253` `toolExecution ?? "parallel"`）。评审的结论成立：按 Goal 合计、任一处理器完成即清零时，持续失败的单个处理器几乎到不了 3 次。
- 观察 9：`runner.ts` 中 `emitToolResult` 的 catch 块为 `:1223-1232`；`core/http-dispatcher.ts` 的 `parseHttpIdleTimeoutMs` 为 `:19-35`。`05` §5.3.6 的引文更正为 `:19-35`、§5.6.5 第 6 项更正为 `:1223-1232`；ADR-238 原文不改写，以本条为准。

**条目（R111 追问清单）**
- **R111-D13-01（重要）**（T1 在 `syncing` 期间不被任何 ref 引用、影子 gc 在不可达期间照常；`handback-t1` 180 天后随影子删除而确认框不写期限；清除时不告知；① 物化失败仍使 T1 丢失）：
  - **写入提前到写回开始之前**（唯一定义改到 `06` §6.4.3 `inspect.bring_back` 行“T1 的保留”；`goal.hand_back`、`goal.abandon` 两行引用）：交还与带回在 T1 写入影子对象库之后、写 `syncing` 的事务之前，先写 `refs/tower/<goalId>/handback-t1`（以 T1 为树的提交；已有时改指）；**写不成时命令返回 `E_INTERNAL`，不写 `syncing`、不开始写回**。所以从写回开始到它成功完成，T1 一直被引用：不论写回在本进程中失败、因不可达中断多久、其间影子 gc 运行多少次，T1 都不被回收，卷回来时续写也不缺对象。
  - **只在写回成功时删除**（交还完成、带回转入 `verifying` 的事务提交之后）。写回失败（①–④，含 ① 的物化也失败）、放弃与其他任何出口都不删除它；**放弃不需要另写**，“放弃时写不成”的情形随之消失。成功提交之后、删除之前崩溃时它留下、照常列出，下一次写回成功时删除或由你删除（如实登记）。
  - **保留与 ADR-228 同一取向**（唯一定义 `10` §10.3.2）：不按时间删除——30 天的压缩与 180 天的影子删除都不删除它，影子中仍有它时影子删除推迟到你删除它；存储面板“人的工作现场”按目标列出 `未写完的交还（保存在 Tower 中）`，带 `删除`（`goal.delete_kept{handbackT1: true}`；`syncing` 时续写还要用它，返回 `E_STATE`）；清除该 Goal 时删除，清除确认框与结果单独列出它（`09` §9.12.4）。
  - **确认框改为真话**：`交还（或带回）的改动尚未写入工作目录：Tower 在影子中保留一份，直到你在存储面板中删除它或清除该目标（目标页写明如何取回）；你的副本留在 <路径>`（`06` §6.4.3 `goal.abandon` 行、`04` §4.6.7）。
  - **① 的物化也失败**：条目写 `你的改动未能保留在目录中，仍保存在 Tower 中（目标页写明如何取回）`，取代 ADR-222 的“此后不可恢复”；交还随后按检出丢失一行处理，该行的条目在有 `handback-t1` 时另写 `最近一次未写完的交还仍保存在 Tower 中`（`06` §6.1.6 人工编辑检出一行）。
  - **不变式改写**（`06` §6.4.3 `inspect.bring_back` 行末段）：清除 `targetTree` 而写回没有完成的仍只有 ③ 与不可达期间的放弃，两者之后 T1 都仍由 `handback-t1` 引用，没有任何出口使 T1 成为不被引用的对象。
  - **备份**（观察 4）：写入它触发一次 bundle（它在 Goal 非终态时写入，所以进入 bundle）；放弃 30 天后 bundle 删除，此后它只在影子中，影子被外部删除时没有第二份，如实登记（`10` §10.16.3）。
  - **复活**（观察 5）：`goal.resurrect` 复活出的新 Goal 不带入它，原目标页的取回方式不变；确认框写 “交还（或带回）”。
  - 同步：`06` §6.1.6 ③ 与“永久不可达时的出口”，§6.6.4 影子两行；`10` §10.2 ref 表、§10.3.2、§10.16.3；`16` §16.1.12 影子 ref 一行、§16.2.6 检查点保留；`09` §9.12.1、§9.12.4；`04` §4.6.7、§4.15、§4.18.3；`14` G31、G35e 补组。lint (d) 登记“放弃时写入、随影子删除”为已删除（严格模式）。
- **R111-D13-02**（Tower 自己会重建缺失的根；情形 F 新根的记录时机）：
  - **Tower 不重新建立根**（唯一定义 `06` §6.1.6 Project 不可达一行；`10` §10.3.1 步骤 2、§10.4.3 位置算法、§10.16.2 情形 F 与 `06` §6.4.3 `project.relocate` 引用）：Tower 只在一个 `<wtRoot>` 中没有任何当前 `WorktreeRecord` 时建立它，只建立 Tower 自己命名的几级（`.tower-wt.noindex/<repoName>`、`worktreeRoot` 下的 `<projectId>`），上级目录（附着检出的父目录、你设置的 `worktreeRoot`）必须已存在且可访问，从不建立；卫星的 `git clone --separate-git-dir` 在根已存在之后执行，所以 git 不会替它建立缺失的上级。其余情形下缺失的根就是不可访问的根，由你重新建立、迁移或放弃。
  - **新 Goal 从准备开始把将要使用的 `<wtRoot>` 计入必需路径**：根缺失或上级目录不存在时它同样判为不可达，准备按 ② 中止、回到排队，卡片注明 `Project 不可达：<路径>`——不另设 `prepare_failed` 来源，复用已有的不可达处理与出口。于是一个新 Goal 不会把其他 Goal 的根从“不可访问”翻成“存在而目录不在”。
  - **迁移的新记录先于重建**（`06` §6.4.3 `project.relocate` 行）：新位置的 `goal` 角色 `WorktreeRecord`（`rebuilding`）与 `satellite_rebuilding=1` 在迁移的同一事务中写入，所以新根从此是该 Goal 的必需路径——重建中途崩溃由“卫星重建中途崩溃”一行续做，新根在重建中变为不可访问时按失败先判可达判为中断、由 ④ 续做。迁移后的每个新 `<wtRoot>` 须可访问或可按上述规则建立，否则 `E_STATE`（`工作目录位置不可访问：<路径>`）。
  - 不采纳评审备选的“只在该位置从未被记录、`relocatedFrom` 或清除遗留清单引用时建立”：判别只取“有没有当前 `WorktreeRecord`”，因为只有当前记录会让其他 Goal 把根当作必需路径；`relocatedFrom` 与清单中的旧根被重新建立时最多使列出多一个空目录，不会误判丢失。显式设置的 `worktreeRoot` 位于你可写的挂载点目录之下而卷未挂载、且该位置上还没有任何当前记录时，Tower 会在挂载点目录中建立它（M1 的 macOS 上 `/Volumes` 只有 root 可写，常见布局不受影响），如实登记。
- **R111-D13-03**（一个写回中断的 Goal 挡住整个 Project 的迁移；迁移重建与 ③ 的关系）：
  - **保留 `E_STATE`，错误文字列出这些 Goal**：`写回未完成：<目标>——可达后自动续写，或先放弃这些目标（交还的改动已保存在 Tower 中）`。不采用“迁移跳过 `syncing` 的 Goal”：迁移作用于该 Project 的一组 binding，`worktreeRoot` 又是 Project 级设置，跳过个别 Goal 就要让同一 Project 的 Goal 有不同的 `<wtRoot>`，并在之后某个时刻补做情形 F，这是新的机制；而 R111-D13-01 之后放弃这个 Goal 不丢失任何东西（T1 已被引用，人工编辑检出留在原处，检查点在影子中），所以出口是真实且无损的。
  - **界面不提供会被拒绝的动作**（`12` §12.6.5 检查 i 一行为唯一定义）：这时卡片与项目设置都不列出迁移，改写 `迁移前先处理写回未完成的目标：<目标>——可访问后自动续写，或放弃它（交还的改动已保存在 Tower 中）`；推而广之，不可达目标的其他 Needs-You 条目中会被 ③ 拒绝的选项同样不列出（条目保留，可访问后恢复原有选项）——例如迁移后旧位置上仍有人工编辑检出、而新根上的重建失败（双重故障）时，`satellite_missing` 条目只列放弃，出口是旧位置可达后重试或放弃，不丢数据，如实登记。
  - **迁移自身的重建不受 ③ “不重建”的限制**（`06` §6.1.6 ③）：新根在迁移时已校验可访问，重建只写新根与 `~/.tower`，照常执行；该 Goal 因旧位置上的人工编辑检出或检验检出仍不可达时同样如此。
- **R111-D5-01**（F13 的复位规则；自报没有检测器 id；`prepare_failed` 来源清单漏列）：
  - **按处理器计数**（唯一定义 `05` §5.6.5 第 6 项）：`tool_call`、`turn_start`、`tool_result` 各一个计数，按 Goal、在 Host 进程内，**只由同一处理器的一次正常完成清零**；同一处理器连续 3 次出错时以 `prepare_failed` 暂停。于是 `turn_start` 持续失败时至多三次请求受影响（`05` L1006 登记的窗口重新有界），gate 与脱敏持续失败时 Goal 在第三次出错时停下。
  - **检测器 id 与分类**：自报改为 `anomaly{detector:"tower_goal_handler_error"}`（按 `07` §7.10.1 的分类规则，针对 Tower 自身运行过程的检测发 anomaly 而不是 sentinel；取代此前的 Needs-You `sentinel`），severity 3、L3、提示性、不阻止 Verified；去重键 `an:{goalId}:tower_goal_handler_error`，同一 Goal 合并为一条（subject 为处理器名、次数累加，只在首次打开时打断）；出口“知悉”→ `informative`（`08` §8.4、§8.8；`16` §16.1.6、§16.1.7；`02` §2.7；`07` §7.10.1；`06` §6.8 F13）。
  - **来源清单只有一处**：`16` §16.1.1 `Goal.pauseReason` 的 `prepare_failed` 一项为唯一定义（补列 `host.spawn` 之前删除 stdio MCP 空目录失败，并写“同一处理器”）；`02` §2.4、`03` §3.2.1、`08` §8.6.5、`06` §6.8 F4b、`16` §16.1.7 改为引用（保留 `running` 一组的提法，lint (s) 照常），`08` §8.13 证据与 `04` §4.8.11 卡片补 F13 一项（观察 7 随之关闭）。
  - C5 补 “同一处理器持续失败、其间其他处理器正常完成” 两组。
- **R111-D11-01**（脱敏不覆盖 `details`）：`11` §11.7.1 脱敏一行（唯一定义）改为改写 `content`、`structuredContent` 与 `details` 中的全部字符串值（`details` 逐层递归）；`05` §5.6.5 第 6 项的占位结果另带 `details: {}`。C5 的 “会话中没有原文” 由此为真，并补 “截断的 bash 输出含已知机密” 一组，断言会话文件的 toolResult 消息与 `tool.end` 的 `content`、`details` 中都没有原文；Pi 写在临时文件中的截断全文仍按 `11` T12 登记，不在此断言之内。
- **R111-D7-01**（`flake` Fact 的写入次序；base 无结论计返工；准备与服务的非零退出不判可达）：
  - **写入次序**（`07` §7.4.1 伪代码）：`runCriterion` 不写 Fact，§7.4.5 的 `flake{kind:"timing"}` 与 §7.4.6 的 `flake` 随结果返回，由调用者在失败先判可达之后写入；判为中断时这些都不写（`06` §6.1.6 ② 的 “不写该条标准的 Fact” 由此对 `flake` 同样成立）。
  - **无结论是环境故障**（`07` §7.4.6）：该标准只因无结论的用例而不能通过时（没有稳定失败、也没有有结论判为 `introduced` 的用例），不产生 `criterion_check`，改记 `verify_env_error{stage:"baseline"}`——不返工、不计次数、不推向 `verify_failed_limit`，与 §7.3 安装器失败、§7.4.5 base 上同样超时同一原则；也不写这些用例的 `flake` Fact。该标准另有真实失败时照常 `fail`，无结论的用例照 ADR-238 记 `introduced` 与 `baseInconclusive`，返工消息把它们与真实失败分开列出。仍从不得出绿色。
  - **准备与服务**：`env.error`、`svc.error` 的任何失败（含生命周期脚本、`VerifyProfile.prepare`、setup 与健康检查以非零退出）都先判可达（`07` §7.4.1，`06` §6.1.6 失败先判可达的定义同步写入 “验证中的子进程”）。
- **R111-D15-01**（六处）：(1) `06` §6.4.3 `project.relocate` 行末句改为 “人工编辑检出与使用中的检验检出所在的旧 `<wtRoot>` 仍是该 Goal 的必需路径”；(2) `10` §10.1.1 “迁移” 改为 “`<wtRoot>` 确实改变时” 并引用唯一定义；(3) `10` §10.2 “Tower 自动改名保留” 改为五处，补 (e) 情形 F；(4) `06` §6.6.4 影子两行、`16` §16.2.6 检查点保留、`09` §9.12.1 影子检查点 ref 只引用 `10` §10.3.2；(5) `14` G35e Run 中卸载一组改为 “没有进行中那条标准的 Fact 与 `verify.result`”；(6) `08` §8.4 `human_checkout_lost` 一行补 “而它所在的 `<wtRoot>` 可访问”。`16` §16.1.13 补登本轮被取代的说法（含近义写法 “人工编辑检出仍按原路径作为必需路径”“只留地标检查点、pin 与 seal ref”“不经人点击而改名的只有四处”等），由 (D) 检查。

**评审结论中的观察（R111 结论部分）**
- 观察 1：`06` §6.1.6 的 `~/.tower` 括注补上 `10` §10.4.3 第 3 步的 `<wtRoot>`（`~/.tower/worktrees/<projectId>.noindex`）及其中的一切，并写明失败先判可达对它们同样不判定。
- 观察 2：接管物化没有恢复行——判为中断时 `goal.take_over` 返回 `E_STATE`（`Project 不可达：<路径>`），接管的事务不写（从 `running` 接管时与 drain 中途崩溃的 `take_over` 一样进入 `paused(human)`），留下的目录按 `10` §10.2 “中断的接管留下的目录”处理，可达后由你再次接管（`06` §6.1.6）。
- 观察 3：占位文字改为 `工具已执行，但结果未能脱敏，已隐去`；观察点与脱敏在同一处理器中时这一次的 `tower.obs` 随之缺失、`command_result` 少一条（占位结果带 `structuredContent`，`structured_content_dropped` 不触发），如实登记（`05` §5.6.5 第 6 项）。
- 观察 4、5：见 R111-D13-01 的备份与复活两项。
- 观察 6：`10` §10.2 “列出的来源” 登记：遗留根之下不属于 Goal 形状的 Tower 目录（`_stores/_shared`、`_stores/_verifier`、`_stores/_shim`、`README`）不列出，条目移除后不再被追踪，由你自行删除。
- 观察 7：随 R111-D5-01 的来源清单改为引用 `16` §16.1.1 关闭。
- 观察 8：`16` §16.1.13 第 108、109 轮两行的现行列补 “由 ADR-238 改为……” 的注记。
- 观察 9：见上方核实。

**删除 / 简化**
- 删除：`handback-t1` 在放弃时才写入、保留到影子删除（随影子 180 天后删除）——lint (d) 登记 DELETED（严格模式）；F13 “任一处理器正常完成即清零”；F13 自报为 Needs-You `sentinel`（改为 anomaly）；写回失败 ① 物化失败时的 “此后不可恢复”；各文档中复述的 `prepare_failed` 来源全集与保留期摘要（改为引用）；准备与服务只在文件系统错误时先判可达的限制。
- 简化：T1 的保护从 “每个出口各自先保存” 变为 “写回期间一直被引用”；根是否存在只由你决定；`prepare_failed` 的来源与影子的保留期各只有一处定义。
- 推迟：无。
- `16` §16.1.13 补登第 111 轮被取代的说法 1 行，由 (D) 检查；事件没有变化，§16.1.14 不变。

- **lint**：全部检查 `--checks rstuvwxyzckdnSeRqpoPiDgKYATFMBOJCH`，exit 0；见 `reviews/round-111-lint.md`。
- **排期**：+0.06 人周（WBS 124.48 → 124.54）：W6 +0.02（Agent：F13 按处理器计数与 `anomaly{tower_goal_handler_error}`，0.01；脱敏覆盖 `details` 与占位结果，0.01）；W7 +0.04（系统，W7-rest，不在依赖链上：`handback-t1` 的写入、删除、保留与列出，0.02；Tower 不重新建立根、迁移记录的次序与写回中断时的 `E_STATE`，0.01；验证中子进程的失败先判可达与 base 无结论按环境故障（落点在 W9a，W9 行不变），0.01）；其余按 WBS 行不足 0.01。
  - 按 ADR-136 的常规规则在余量之内吸收（系统线余量 0.97 → 0.93，仍高于约 0.9 的改派考虑线，远高于改派阈值，不改派；系统线的冻结前所需 29.07 成为最长，设计线 29.06），**M1 维持 39 周**（2026-11-09 → 2027-08-06；第 35 周末冻结，2027-07-09；M2 至 2027-11-12；M3 至 2028-02）。
  - `14` §14.3.4 与 ADR-133 第 111 轮补记一致：余量 系统 0.93、Agent 1.03、桌面 0.95、设计 0.94、安全 1.10；依赖链 19.91。
  - **增 1 人方案仍为 34 周**：130.60 / T 24.11 / 27 个工作周，第 30 周末冻结（2027-06-04），至 2027-07-02（新人约 2.40 人周安全线工作）；下一个台阶仍是全部工作超过 135.52 人周（35 周）。
