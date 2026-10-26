# 01 · 调研综述

本文是四份原始调研报告的综合与裁决。原始报告保存在 `research/`，带完整引用：

| 报告 | 内容 |
|---|---|
| `research/landscape.md` | 16 款产品对比、2025–2026 Agent 工程观点、用户抱怨、市场空白 |
| `research/theory-brainstorm.md` | 监督控制 / 情境感知 / 报警管理 / 中断研究等理论，失败模式，35 个点子排名 |
| `research/pi.md` | Pi 源码逐模块调研（调研于 HEAD `b06c1f2`，比 v1.2.0 晚 46 个提交；与 Tower 固定的 **1.2.0（精确）** 的差异见 `research/pi-release-diff.md`，无一影响 Tower 依赖的语义） |
| `research/gui.md` | 桌面外壳、框架、组件、视觉、性能预算 |

证据等级：⚪ 一手来源 · 🟡 二手 · 🔴 未核实（沿用 landscape.md 标注）。

---

## 1.1 原论述四大论点的裁决

| 论点 | 裁决 | 关键证据 | 对设计的影响 |
|---|---|---|---|
| **一、VSCode 三栏是惯性** | **描述正确；“纯惯性”的解释有争议** | Codex app、Claude Code desktop、Cursor 3 Agents Window、VS Code Agents window、Conductor 类工具全部是 Session｜Chat｜Diff ⚪。但 GitHub 明确有意为之（“work the way you already work”）⚪；Cursor 2.0/3、Antigravity 2.0 强推新范式遭强烈反弹（HN 771 分“bait and switch”）⚪ | 新布局必须**明显更好且可逃逸**：Tower 的 Goal 页提供“Watch 模式”（展开实时 Trace 尾部），想看流的人一键可看；绝不强迫。见 `04` |
| **二、中间的流是噪声，全局 State 应为第一公民** | **方向被支持，但有一个重要反例** | 支持：Antigravity Artifacts“以更自然的任务级抽象呈现”⚪；Claude Code 默认折叠工具调用、agent view “peek” 只显示最近输出或待答问题 ⚪；Codex task sidebar ⚪；Linear AIG 要求明确“thinking / waiting / executing / finished”⚪。反例：**2026-02 Claude Code 把读文件折叠成“Read 3 files”，开发者集体反弹**——他们用这些细节来及时打断、补充上下文、省 token ⚪。Pi 作者也把“完全可观测”放在首位 ⚪ | Live Line 必须保留**可转向的细节**（哪个文件、哪条命令、哪个测试失败），不能只是“Working…”；全局 State 从 Trace **推导**并链接回 Trace，而非 Agent 另讲一个故事；Trace 一键可达（R3） |
| **三、Sidebar 应为 Goal；Memory 不应绑定 Session/路径** | **问题被强烈支持；方案正被巨头部分实现（竞争威胁）** | Willison“parallel agent psychosis”丢失整个功能 ⚪；记忆今天都是机器本地 + 路径/仓库键控（Claude auto memory、Codex memories、Pi 按 cwd 分组）⚪。`/goal` 已在 Codex（0.128.0, 2026-04-30）与 Claude Code（2.1.139, 2026-05-11）上线，但**都绑定单一线程/会话**⚪；Codex 由工作模型自评完成，Claude 由小模型只读 transcript 评判、不执行命令 ⚪。**Claude Code Projects（2026-09-17 beta）**已有可选 Goal 字段、多仓库、项目记忆、“Waiting on you”分组；Cursor Projects（2026-09-10）有协调者 Agent ⚪ | Tower 的差异化必须是：(1) Goal 是**唯一的顶层导航对象**，本地优先、引擎中立；(2) **执行式**验证（真正跑命令）而非读 transcript 评判；(3) 可迁移的 Goal/项目记忆。见 §1.3 |
| **四、注意力分配：全屏 Diff、看到所有 Agent；Goal+Task+Changes 足够监督** | **前两点被强烈支持；“足够”被反驳** | Review 是公认瓶颈：Faros 万人研究 PR 评审时间 +91%、PR 体积 +154% 🟡；Devin Review（分组、排序、解释 hunk）广受好评 ⚪。BCG/HBR：自评生产力在约 3 个并行 AI 工具时见顶 ⚪。反驳“足够”：Anthropic 多篇工程文章记录 Agent“自信地夸赞平庸的工作”、过早宣布胜利 ⚪；EMNLP 2026 两万会话研究“不准确的自我报告”占比上升 🟡 | 必须加上**有证据支撑的 Validation**（Fact）与 Needs-You 队列；评审按意图组织；**按人的评审能力限制生成速度**（见 §1.4 新增 R11） |

## 1.2 理论支撑与修正（摘要）

完整内容见 `research/theory-brainstorm.md` §A–B。与设计直接相关的结论：

1. **原论述在“注意力”上正确，在“情境感知”上有风险。** Claude Code 用户批准 93–97% 的单次权限提示，却拒绝 39% 的计划 ⚪ —— 人的真实判断发生在计划/目标层，逐动作盯梢是浪费。但 Endsley & Kiris 发现自动化不损害 L1 感知而损害 **L2 理解**；过程流只提供 L1，所以替代物必须提供 L2（对验收标准的进度）与 L3（预测与不确定性）。→ R4。
2. **Agent 摘要是声明。** 领域标注很重要：
   - 45–48% / 75.8% 的“失败运行被报告为成功”分别来自 tau2（客服对话）与 AppWorld（API 编程任务）的自评轨迹（Advani 2026）——**不是**编码 Agent 的通用测量；
   - 编码领域的直接证据是 ImpossibleBench（Claude 作弊 >79% 靠改测试，ICLR 2026）、Anthropic 长时 harness 文章中的“过早宣布胜利 / 未做端到端测试即标记完成”、EMNLP 2026 两万会话研究（不准确的自我报告占比上升，🟡）；
   - LLM 裁判 AUROC ≤ 0.65、TF-IDF 0.83–0.95 均为**同分布**结果，不能直接迁移到 Tower 场景——因此措辞检测器默认关闭（ADR-019），只在离线评估后才可能启用。
   → R1、ADR-002、测试完整性哨兵。
3. **更好的界面会提高信心而不提高准确度**（Microsoft 2026）；**事前批准计划会降低运行中的审查**（2026 CUA 监督研究）。→ R7（计划编译为运行时围栏）、R10（度量校准）。
4. **接管悬崖**（Bainbridge 1983；人类无法对“很少发生事情”的信息源维持超过半小时的有效注意）。→ R3。
5. **报警管理纪律**（ISA-18.2/EEMUA 191：稳态约每 10 分钟 ≤1 条；每条可行动；度量精度）与 **医疗报警疲劳**（72–99% 告警无需行动）。→ R5、ADR-010。
6. **中断研究**：在粗粒度断点投递中断，恢复快 69%、烦躁少 18%（Iqbal & Bailey）；自动化恢复线索使程序员任务成功率翻倍（Parnin）。→ 断点投递、重入简报。
7. **最接近的先行研究 ParallelPilot（2026）**：环境感知看板使吞吐 +63%，但**未提高控制感与介入成功率**。→ 我们的差异点必须落在“事实/声明分离”与“Goal 生命周期”，而不是看板本身。

## 1.3 竞争格局与 Tower 的定位

```
                 会话为中心 ◄─────────────────────────────► 目标为中心
 云端/厂商绑定   Codex app · Claude desktop          Claude Code Projects · Cursor Projects
                 Devin Desktop · Antigravity          Factory Missions · Augment Intent
 本地/引擎中立   Conductor · Superset · Emdash        ★ Tower（空白象限）
                 Sculptor · T3 Code · pi-gui
```

| 维度 | 现状最佳 | Tower |
|---|---|---|
| 顶层对象 | Projects 中的可选一行 Goal，仍以对话为形 | Goal 是唯一顶层导航对象；Session 降级为 Trace |
| 完成判定 | Codex 自评；Claude 小模型读 transcript；云端产品有 validator 但不透明 | Harness 在干净 worktree **执行**验收标准，产出带提交哈希与新鲜度的 Fact；人验收才归档 |
| 过程呈现 | 在“全量流”与“不透明折叠”之间摇摆 | Mode + 可转向细节的 Live Line；字段从 Trace 推导并可回链；Watch 模式可逃逸 |
| 评审 | Devin Review（独立于 Agent GUI） | 评审单元 ≤300 行，按风险排序，hunk ↔ 决策 ↔ 测试互链，评论即转向（带回执） |
| 注意力 | 按状态分组（Waiting on you） | 按延迟代价 × 严重度排序；限流、去重、断点投递；告警精度自我度量；评审积压上限（ADR-014） |
| 记忆 | 机器本地、路径键控；云端项目记忆 | User / Project（仓库身份）/ Goal 三层，来源可追溯，需批准，可导出/同步 |
| 引擎 | 各自厂商 | Pi 优先（Engine Adapter），为 ACP 等预留 |

**商业风险提示**（landscape §D.9）：薄编排层难以盈利（Vibe Kanban 2026-04 关闭、Terragon 关闭、Crystal 并入 Nimbalyst），厂商正在吸收这一层。Tower 的护城河只能是厂商结构性不愿做的部分：**本地优先、多引擎、用户拥有的 Goal / Validation / Memory 层**。本文档不处理定价；`14` 的风险登记表记录此风险。

## 1.4 由调研引出的设计修订

调研完成后，相对于初版构想做了以下修订（已同步到 `00`、`02`、`03`、`15`）：

| # | 修订 | 来源 |
|---|---|---|
| 1 | **Live Line 保留可转向细节**：格式为 `Mode · 动作 · 对象`（如 `acting · edit · src/checkout.ts +12−3`、`acting · bash · pnpm test checkout (14s)`、`thinking · 正在规划幂等键方案`），而非笼统“工作中” | Claude Code 折叠反弹 |
| 2 | **Watch 模式**：Goal 页可切换为“Live Line + Trace 尾部实时滚动”，供想看流的用户使用；默认关闭；按 Goal 记忆偏好 | “可逃逸”的教训；Pi 的可观测性文化 |
| 3 | **R11 评审积压上限（Review Backlog Limit，原“评审能力调速”，ADR-014）**：以 LOC 计的 WIP 上限（默认 1500，可关）：余量 = 上限 − 尚未有效评审的待审 LOC − 在途 diff。默认只提示；E8 通过后切为阻止模式，余量 ≤ 0 时新 Goal 停在 `ready`（标明“等待评审余量”），而非继续生成更多待审代码 | Zechner“按你的评审能力限制每天生成的代码量”；Faros 评审时间 +91%；SmartBear 评审速率 |
| 4 | **一行 Goal 快速路径**是一等公民：`fix flaky test X; done when pnpm test checkout 连续 5 次通过` 直接生成最小合同，结构按需增长 | Kiro/Spec Kit 的仪式感批评 |
| 5 | **从 Pi 结构化摘要取材**：Pi 压缩摘要已含 Goal / Progress / Key Decisions / Next Steps / Critical Context + 读/改文件列表；Tower **不接管**压缩（ADR-026）：Pi 默认压缩照常进行，压缩后以一条不触发新回合的 `tower.ledger` 消息补充账本指针，使压缩后的上下文与 Tower 账本一致 | Pi `compaction.ts`；OpenAI ExecPlans 同构 |
| 6 | **尝试 = Pi 会话树分支**：回退与换方案产生的尝试映射到 Pi session tree 的分支（`fork`/`navigateTree`），放弃的尝试保留分支摘要；验证失败后的默认返工沿用当前分支，是同一尝试的新 Run（ADR-027） | landscape §D.8（无人做过） |
| 7 | **引擎中立预留 ACP**：EngineAdapter 未来可增加 `acp` 实现（Zed ACP 已被 JetBrains、Devin Desktop、OpenHands 等采用）；v1 只做 Pi | landscape A.2 |
| 8 | **记忆可迁移**：记忆库支持导出为 Markdown 与可选同步目录（git 仓库 / 云盘），不写入用户代码仓库 | landscape §D.4；Beads |
| 9 | **沙箱与“致命三元组”警告由 GUI 负责**（Pi 默认 YOLO）：当 Goal 同时具备私有数据访问 + 不可信内容输入 + 外部通信能力时，合同编辑器给出显式警告。**限制**（ADR-226/227）：沙箱外工具（用户扩展、MCP 服务器）能否读取私有数据 Tower 无法判定，私有数据一项对它们记为“未知”、不触发警告；这一面由沙箱外工具的逐次批准承担——不可信内容与对外通信都为真时（加载了 MCP 服务器即如此），这类工具不能按工具名授权，每次调用都要人批准（`11` §11.3.4、§11.8）；代价与度量登记在 `11` §11.3.4 与 `14` E3（ADR-228） | Willison lethal trifecta；Antigravity 安全事故 |

## 1.5 关于 Pi 的关键事实（摘要）

完整内容见 `research/pi.md`，集成方案见 `05`。

- 仓库已迁至 `earendil-works/pi`（Earendil 2026-04 收购），npm 包 `@earendil-works/pi-coding-agent@1.2.0`，Node ≥ 22.19。官方 `pi-web-ui` 已于 2026-05-20 移除；**无官方 GUI、无 daemon 模式**。
- 1.0 改变了“无 MCP”的立场（经 codemode 沙箱与 `tool_search` 延迟加载）；仍不内建子 Agent / plan mode / 权限 / worktree。
- 对 Tower 最重要的能力：`agent_settled`（真正的完成信号）、`steer`/`follow_up` 队列、`tool_call` 钩子（可阻断/改写）、`agent_before_settle`（可强制继续）、`appendEntry`（持久但不进上下文）、工具结果 `details`（结构化 UI 数据，分支正确）、JSONL 会话树。
- 主要缺口：无 Goal/记忆/worktree/多 Agent；RPC 扩展 UI 仅文本；`write` 工具无 diff；若干 RPC setter 写全局设置；会话 cwd 缺失会退出。
- **`pi-durable`**（实验性）原生具备多会话、任务图、存储级文档、多客户端 watch——中期可能成为 Tower 的底座（ADR-006）。
- 与 Pi 哲学的张力及调和见 `00` §0.5 与 `05`。

## 1.6 默认值的迁移假设

不少默认值借用了其他领域的研究。每一项都显式写出迁移假设与检验它的实验：

| 默认值 | 来源 | 迁移假设 | 风险 | 检验 |
|---|---|---|---|---|
| 并发上限 3 | BCG/HBR：同时使用约 3 个 AI **工具**时自评生产力见顶；ParallelPilot：峰值并发 2.31→3.25；Jellyfish：84% 用户只跑 1–2 个 | 监督并发 Agent 的认知负荷与切换工具相近 | 工具 ≠ Agent；Agent 多为后台运行，可能允许更高并发 | E3 记录并发数 × 告警率 × 评审积压；可调 |
| 打扰预算 6 次/小时（仅 L3/L4） | ISA-18.2/EEMUA 191：全职控制室操作员每 10 分钟 ≤1 条可接受 | 开发者在做其他工作时对**系统级**打断的耐受不高于全职操作员 | 开发者另有主任务，耐受可能更低；因此只对系统通知扣预算，应用内条目不受限 | E3：打扰率 × 响应延迟 × 告警精度 |
| 积压上限 1500 LOC | SmartBear：200–400 LOC/次、≤500 LOC/h（人写代码） | Agent 代码的评审速率与人写代码同量级 | Agent 代码冗余度不同；默认仅提示（ADR-014） | E8 在 Agent 代码上重新标定 |
| 评审单元 ≤300 行 | SmartBear 400 LOC 后检出率骤降 | 同上 | 同上 | E8 |
| 有效评审下限 1.2 s/行 | 无研究依据；工程选择 | 仅用于过滤“点穿”，不代表评审质量 | 可能仍被刻意拖延绕过 | E8 对比计法 |

## 1.7 差异化与护城河（回应第 1 轮评审 R1-D3-03、R1-D16-*）

### 1.7.1 逐项对比

> 核实日期 2026-10-15；单元格证据等级：未标注 = ⚪ 一手文档/产品页；🟡 二手；🔴 未能核实。**否定性单元格**（“否”）的含义是“在其公开文档与发布说明中未发现该能力”（⚪ 级的“未发现”），不排除未公开的实现。本表在 `14` K5 的季度复审中重新核实。

| 能力 | Claude Code（Projects + `/goal` + hooks） | Cursor Projects | Devin / Devin Review | Antigravity | Conductor 类 | Factory Missions | **Tower** |
|---|---|---|---|---|---|---|---|
| 顶层导航对象 | 会话（Projects 内为线程；Goal 为可选一行字段） | Agent 标签 / Project | Session / Space | 会话 + Artifacts | Workspace（worktree） | Mission | **Goal（唯一顶层对象）** |
| 完成由谁判定 | `/goal`：小模型读 transcript，不执行命令；用户可自写 Stop hook 跑测试 | 协调者 Agent | Devin 自跑测试 | Agent + Artifacts | 无 | Validator droid（🟡） | **验证器在 Pi 之外执行验收标准** |
| 验证在哪运行 | 与 Agent 同一环境（hook） | 云端 | 云 VM（同一环境） | 本地同一环境 | — | 云端 | **独立干净槽位 + Agent 不可写的依赖存储（ADR-021）** |
| 结果是否带新鲜度 | 否（未发现）| 否（未发现）| 否（未发现）| 否（未发现）| — | 🔴 未知 | **是：按工作区 tree 指纹，改动即过期** |
| 防改测试 | 否（未发现）| 否（未发现）| 否（未发现）| 否（未发现）| 否（未发现）| 🔴 未知 | **测试完整性哨兵 + 测试清单对比 base** |
| 事实/声明视觉区分 | 否（未发现）| 否（未发现）| 部分（Review 解释 hunk） | Artifacts 皆为 Agent 产出 | 否（未发现）| 🔴 未知 | **三种语法，声明永不着绿** |
| 评审 | diff + 行评论 | diff | 分组、排序、解释 hunk | 评论 Artifacts | diff | PR | **风险排序评审单元 + 评论即转向 + 回执 + 积压上限** |
| 本地优先 | 部分（Projects 为云） | 部分 | 云为主 | 本地 | 是 | 云 | 是 |
| 引擎 | Claude | Cursor | Devin | Gemini | 多 CLI | Droid | Pi（v1），Adapter 预留 ACP |

结论：**单独看任何一列都不是独有的**（本地优先有 Conductor 类，执行式验证有 Devin/Factory 与用户自写 hook）。Tower 的差异在于这些性质的**组合**，且以 Goal 为顶层对象把它们贯通：同一个 Goal 对象上，验收标准 → 干净环境执行 → 带指纹的事实 → 过期 → 评审单元 → 人的验收 → 归档，是一条完整、可审计的链。

### 1.7.2 为什么厂商结构上不太会做（论证，而非断言）

1. **自我评分的激励冲突**：模型厂商的 Agent 产品让同一家的模型（或同一家的小模型）判定完成——把“Agent 说完成”显著降级为声明、在 UI 里永不着绿，等于在自家产品里公开标注自家模型的不可信度。可以做，但与产品营销方向相反。
2. **云沙箱架构**：云端产品的验证与 Agent 在同一 VM，“Agent 不可写的验证依赖”需要额外的隔离层；本地产品没有这层成本也没有这层激励。
3. **单一引擎**：引擎厂商的 GUI 不会以“可替换引擎”为设计前提；Tower 的 Goal/账本/记忆格式与引擎解耦。

这些都**不是**不可复制的壁垒，只是复制的激励较弱。评审意见正确：v1 的护城河主要是先发与专注。

### 1.7.3 会随使用积累的资产

| 资产 | 积累方式 | 迁移性（用户拥有数据） |
|---|---|---|
| 每个项目的 VerifyProfile（服务、端口、命令、flaky 清单） | 每次验证与人工修正 | 可导出；对用户是净收益，对 Tower 是使用越久越好用 |
| 校准记分板（模型 × 项目的声明矛盾率、返工率） | 每个 Goal | 可导出；帮助用户选模型，形成“只有在这里能看到”的观测 |
| 已批准的项目/用户记忆 | 学习闭环 | Markdown 导出；不锁定 |
| 哨兵基准语料（经用户同意的本地标注） | 覆盖/误报决定 | 本地；提升哨兵精度 |
| Goal 账本归档（可审计的交付记录） | 每次验收 | `.towergoal` 导出 |

我们有意不以数据锁定作为护城河（与“本地优先、用户拥有数据”一致）；粘性来自“越用越准的验证与哨兵”。

### 1.7.4 上游情景（R1-D16-03）

| 情景 | 影响 | 应对 |
|---|---|---|
| `pi-durable` 稳定并提供任务图与多客户端 | 降低 Tower 的实现成本 | ADR-006：迁移底层存储，Goal/验证/评审层不变 |
| 某 Pi 扩展实现了“Goal + 测试 hook” | 与 Claude Code `/goal` 同层次：单会话、同环境验证 | Tower 的差异在顶层对象、干净验证、新鲜度、评审与注意力层，而非“有 Goal 字段” |
| Earendil 推出官方 GUI | 直接竞争 | 引擎 Adapter（ACP 预留）使 Tower 不依赖唯一引擎；与官方 GUI 争取互补（Tower 可作为其“监督视图”） |

### 1.7.5 付费假设（R1-D16-04）

一句话假设：**按席位订阅、付费者是同时运行多个 Agent 的个人专业开发者与小团队技术负责人，购买的是“少返工、可审计的验收”**——而不是 Agent 算力（算力费用直接付给模型厂商，Tower 不转售，避开 Vibe Kanban 的 1:100 价值捕获问题）。付费的是桌面体验层（评审单元、注意力层、机会式验证调度）与跨机器同步；**判定逻辑开源、可重放**（ADR-070），以免“闭源判定者”削弱 §1.7.2 第 1 条的论证。M2 验证同时看陈述意愿与行为指标（付费墙后 4 周留存、预付或意向书）以及返工率下降（`14` §14.4.1，ADR-056）。

## 1.8 未解决的分歧（留给验证实验）

| 分歧 | 双方 | 如何裁决 |
|---|---|---|
| 计划/进度文件：有益还是有害 | Manus / Anthropic / OpenAI：复述计划保持注意力；Zechner：to-do 迷惑模型 | 实验 E5（`14`）：有/无 `log` 工具的成功率、成本、轮数 |
| 并发 Goal 数量的甜点 | BCG：~3；ParallelPilot：峰值 2.31→3.25；Yegge：20–30 | 默认并发上限 3（可调），实验 E3 记录告警率与评审积压 |
| Live Line 刷新频率 | 静默（1Hz 档位） vs 每次变化 | `research/gui.md` §10 A/B |
| 是否需要事前计划闸门 | 计划审查高杠杆（39% 拒绝率）vs 事前批准降低运行中警惕 | 仅高风险 Goal 强制；计划编译为运行时围栏；实验 E1 测检出率 |
