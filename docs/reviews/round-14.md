# 对抗评审 · 第 14 轮

> **评审者**：独立对抗 Agent，未参与写作。
>
> **评审对象**：`README.md`、`docs/00`–`docs/16`（重点是 ADR-121–127、ADR-119 与 ADR-125 的补记及其落地处）、`reviews/round-13.md`、5 份第 13 轮回应、`round-13-lint.md`。回应文件只作为线索，每条结论都回到正文核对。行号以本轮读到的文件为准。
>
> **核对依据**：
> - Pi 克隆位于 `research/pi-mono`，标签 `v1.2.0`（提交 `06a4669`，“Release v1.2.0”）。本轮逐项核对的 Pi 事实：
>   - **`prompt` 能在 `agent_settled` 之后开新回合**：`core/agent-session.ts` L2053–2057，若在 `agent_settled` 处理器执行期间调用，动作被推迟到发射结束后执行；空闲时 L2133 走 `_startRun({messageType:"user"})`；流式中未给 `streamingBehavior` 时 L2098–2103 抛错。结论：ADR-121 依赖的能力**成立**。但它产生的是一条 `role:"user"` 消息，并且要经过模板展开、`/` 命令与其他扩展的 `input` 处理器（L2060–2091；RPC 文档 `docs/rpc-commands.md` L33–40 的 `disposition: handled|queued|started`）。
>   - **每一次 run 在 settle 之前都会经过 `agent_before_settle`**：`_startRun` L1857–1866 的循环在 `_emitAgentSettled`（L1875）之前调用 `_runBeforeSettleBoundary`（L1978–2000）。由 `prompt` 或 `sendCustomMessage(…, {triggerTurn:true})`（L2318–2345，空闲时 L2344 `_startRun({messageType:"custom"})`，settle 发射期间同样推迟）发起的 run 都适用。
>   - **工具事件足以分类变更类调用**：`tool_call` 带 `toolName`、类型化的 `input`、`toolCallId`、`parentToolCallId`（`core/extensions/types.ts` L1193–1268）；`tool_execution_start/end` 带 `toolName`、`args`、`parentToolCallId`（L1094–1124）。RPC 事件流经 `WithParentToolCallId` 包装后同样携带父 id（`agent-session.ts` L189、L197）。工具作者可以声明 `ToolAnnotations.readOnlyHint` 与 `destructiveHint`（L522–531，注释写明“未经验证”），扩展经 `ToolInfo.annotations` 读取。结论：**信息足够**，问题在于文档对“变更类”的定义没有用上这些信息（R14-D5-02）。
> - `python3 docs/reviews/lint/xref.py --checks rstuvwx` 复跑结果：0 断链；(r) 0；(s) 8/8；(u) 0；(v) 0（79 条命令）；(w) 0；(x) 0；(t) 0；退出码 0。
> - `14` §14.3.4 的算术已逐项复核（见 R14-D14-01 末尾的复核说明）。
> - 本轮没有做本机实验。
>
> 本文只在设计层面描述安全问题：缺了哪条不变式或规则、会放进哪一类后果、期望怎样缓解。不包含复现步骤。

---

## 1. 总评

第 13 轮 15 条：已解决 10，部分 5，未解决 0；lint 全部通过。

本轮问题主要由 ADR-121/122/123 引入。其中 2 个重要项都出在 ADR-122 上：
- “外部写入先暂停”没有和暂停叠加、`pendingHandBack`、接管交还接通。暂停所需的状态（E、归因基线、`resumeTo`）没有持久化位置，DDL 的 `CHECK` 会直接拒绝写入 `resumeTo`。
- “放弃改动”路径仍把来源不明的内容送去验证，I2 的不变式文字也没有改，与 ADR-122 的核心承诺相反。

其余 11 个次要项集中在提醒回合、变更类工具的定义、宽限失败分支和 `running` 中的 `sentinel_high`。

## 2. 评分表

| # | 维度 | 分数 | 一句话理由 |
|---|---|---|---|
| D1 | 原论述契合度 | 100 | 没有可追问的实质问题。本轮全是底层机制，Goal 中心、实况行、完整 diff 评审都没有回退 |
| D2 | Pi 哲学契合度 | 98 | ADR-121 断言宽限窗口内“`agent_before_settle` 已不能再发 nudge”，与 Pi 源码不符（每次 run 都过 before_settle）；提醒回合用 `prompt`（user 消息）而不用 Pi 现成的 custom message 触发回合（R14-D5-01） |
| D3 | 论证与证据 | 97 | ADR-122 “来源不明的内容不会先被验证或评审”在放弃改动路径上不成立（R14-D4-02）；T29 “低（S2）”在 Linux S2 上没有依据（R14-D11-01） |
| D4 | 领域模型与生命周期 | 90 | `external_change` 与暂停叠加、`pendingHandBack`、接管的出口没有闭合，状态没有持久化位置（R14-D4-01）；放弃改动绕过 ADR-122，I2 文字未改（R14-D4-02）；宽限失败三种定义（R14-D4-03）；`running` 中的 `sentinel_high` 没有转移（R14-D4-04） |
| D5 | Agent 架构与 Pi 集成 | 96 | 提醒回合的触发条件、注入方式与 nudge 计数互相矛盾（R14-D5-01）；“变更类工具调用”有四种定义，I4 没有覆盖嵌套、MCP 与自定义工具（R14-D5-02） |
| D6 | 系统架构与可靠性 | 96 | E、归因基线、`resumeTo` 没有持久化；`pendingVerify` 不跨越 `external_change`；macOS 上 ≥ 5 s 持久化阈值留下崩溃恢复的孤儿窗口（R14-D4-01、R14-D6-01） |
| D7 | 诚实与验证 | 95 | 外部改动卡片以 Fact 断言写入者；存活进程期间的全部写入记为 Agent，没有登记为已知误判；`take_external` 后的 `human_edit` 检查点含外部内容，交接消息列出已丢弃的改动（R14-D7-01） |
| D8 | 注意力与交互 | 97 | `external_change` 生成的 Needs-You 没有 kind、严重度、去重键与标注映射，lint (w) 也覆盖不到（R14-D8-01） |
| D9 | 视觉设计与美观 | 100 | 没有可追问的实质问题。收尾等待期的实况行已在 `12` L375 唯一定义，`05`/`08`/`13` 只引用；外部改动卡片与暂停文案完整 |
| D10 | 性能 | 100 | 没有可追问的实质问题。进程追踪事件上限、合并与 W18 测量已落地（`13` L315），占 §13.9 吞吐预算的比例很小 |
| D11 | 安全与自主度 | 96 | Linux S2 无法按名字执行 `.git` 禁令，T29 与 G26 没有区分平台；`user_config` 的成员规则不可操作（R14-D11-01） |
| D12 | 记忆与学习 | 100 | 本轮没有相关变更，没有可追问的实质问题 |
| D13 | 隔离、git 与并发 | 97 | `accepted` 且 PR 已推送时进入 `paused(external_change)`，远端合并没有转移；`restorePaths` 会连带撤销 Agent 在 drain 期间对同一路径的编辑（R14-D13-01） |
| D14 | 路线图与可验证性 | 95 | B2 排在 G26b/G29 的实现之前；SP6b 补跑工时的归属两处写法不一致；本轮新规则缺用例（R14-D14-01）。WBS 与日期算术复核无误 |
| D15 | 文档一致性与可执行性 | 93 | 第 13 轮 D15 的 10 项已关闭；本轮新增 10 处跨文档冲突，lint 都抓不到（R14-D15-01） |
| D16 | 创新与差异化 | 100 | 没有变化，没有可追问的实质问题 |

---

## 3. 第 13 轮条目核验

状态：**已解决** / **部分**（已改，但不完整、有残留，或引入了新矛盾）/ **未解决**。

| 条目 | 状态 | 备注 |
|---|---|---|
| R13-D4-01 | 部分 | I4 已改为以工具事件判定（`03` L96、`05` L755、`06` L256、`07` L342），Projector 断言已同步（`06` L256 末列），G35c(f) 已登记。新增的“settle 之后才发现无效”出口（`05` L569）引入了新问题：触发条件与 Pi 源码不符；用 `prompt` 注入会重置 nudge 计数；宽限失败分支有三种写法（见 R14-D4-03、R14-D5-01） |
| R13-D4-02 | 部分 | `10` L691–696 写出了三个选项的树级语义；`02` L460 已删去“交还”这一来源；G36b(b) 含相交与不相交两组。残留：`take_external`/`keep_both` 之后第 8 步仍以 `author:"human"`、landmark `human_edit` 记录含 E 的树；`take_external` + “交给 Agent 继续”会注入一条列出已丢弃改动的 `tower.handback`（见 R14-D7-01） |
| R13-D4-03 | 已解决 | 失败分支因 ADR-122 消失（`07` L1403–1405 注释）；撤销目标只在 `10` L228 定义；`restorePaths` 在 `10` L589 定义；G36b(c)(d) 已登记。ADR-122 本身引入的新问题见 R14-D4-01/02 |
| R13-D6-01 | 已解决 | 宽限确认已移到终止之前（`10` L245–249、`06` L184）；撤回与恢复时注入 `tower.processes_terminated`（`10` L251，`05` L839 上限 120）；L253 已改为带前提的陈述；归因表第 3 行覆盖 `claimed`/`verifying`（`10` L225）；身份键加入 `bootSession`（`10` L247）；G35c(h)(i) 已登记。G35c(h) 的措辞问题见 R14-D15-01 |
| R13-D7-01 | 已解决 | 外部写入不再走 `human_change_verify_failed`（`12` L402 已加限定）；drain 期间按路径归为外部（`10` L232、L527）；去重例外（`10` L496）；存活进程写入记为 `agent`（`10` L225）。新的归因问题见 R14-D7-01 |
| R13-D8-01 | 已解决 | kind `anomaly`（`16` L170）、去重键 `an:`（`08` L194）、标注（`08` L482）、卡片（`04` §4.8.8）均已落地；无法实现的动作已删除（`10` L255、`04` L871） |
| R13-D9-01 | 已解决 | `12` L375 唯一定义，`12` L352、`05` L554、`08` L391、`13` L314 只引用 |
| R13-D10-01 | 已解决 | ≥ 5 s 才持久化、Run 结束时回收、≤ 30 事件/分钟并按 1 s 合并、W18 测量（`10` L253、`13` L315、`14` W18） |
| R13-D11-01 | 部分 | S2 已按 ASCII 大小写折叠拒绝（`11` L334）；watcher 兜底与 `protectHFS/NTFS` 已加（`10` L92）；G26b、T29 已更新。新问题：(1) watcher 命中时 `running → paused(sentinel_high)` 在 `03` 中不是合法转移；(2) git 拒绝收录后检查点与 pin 的树没有定义（R14-D4-04）；(3) Linux S2 只能靠 watcher，T29/G26 没有区分平台（R14-D11-01） |
| R13-D11-02 | 已解决 | base 豁免已落地（`10` L82 规则 (b)、`05` L573、`07` L1337、`00` L83）；G29 统计了符号链接规则的误报，G34c(h) 是对照组。G29 的排期问题见 R14-D14-01 |
| R13-D11-03 | 已解决 | `category/op/target` 唯一定义在 `16` L152；凭据读取不能标为良性（`06` L719 `CHECK`、L865，`04` L828）；规则 F 各处一致；远程矩阵已加行（`16` L750–751）；U1 已按选项 (a) 裁决。`user_config` 的成员规则见 R14-D11-01 |
| R13-D11-04 | 已解决 | 写出规则改为白名单（`10` L88 附近的“两种检出”段、`00` L83）；配置键的唯一定义在 `16` L523；G27e 已加入 `config.worktree` |
| R13-D13-01 | 已解决 | 回退语义（`10` L496、`05` L1158、`06` `run.rewind`）；里程碑统一为“M1 显示、M2 回退”；去重例外；G39 排在 M2 |
| R13-D14-01 | 部分 | 已完成：SP6b 批次表成为唯一定义（`14` L33–40）；G35c/G36b 移到第 26 周；QA 周次已改正（`14` L31）；W9 的组成已写明（`14` L202）；ADR-119 已更正（`15` L834）。同类问题在新用例上重现：B2（第 15 周）中的 G26b、G29 依赖安全线第 15–22 周才完成的实现（见 R14-D14-01） |
| R13-D15-01 | 已解决 | 第 1–10 项已逐项复核关闭（lint 报告 §3 与正文一致）；(u)–(x) 已写入 `xref.py`。新冲突见 R14-D15-01 |

**合计**：第 13 轮共 15 条。已解决 10，部分 5，未解决 0。

**第 13 轮 lint 未决项**：U1 已按 ADR-125 补记选项 (a) 关闭，复跑全部通过。

---

## 4. 追问清单（新增与残留）

编号 `R14-D<维度>-<序号>`。严重度：**阻断** / **重要** / **次要**。

### D4 领域模型与生命周期

**R14-D4-01｜重要**（ADR-122 引入：`external_change` 与暂停叠加、`pendingHandBack`、接管的接线没有闭合，状态也没有持久化位置）

- **问题**：
  1. **出口与其他暂停原因的组合**：ADR-122 允许在 `paused(*)` 中检测外部写入，此时 `external_change` 进入 `alsoApplies`（`03` L80，`10` L233）。但两个出口仍按“检测于何种状态”二分（`06` L829–830，`10` L238–239）：
     - `keep`：检测于其他状态 → “按 I2 进入 `verifying`”。若检测时处于 `paused(budget_hard_cap)`、`paused(verify_failed_limit)`、`paused(sentinel_high)` 或带 `pendingHandBack` 的暂停，`keep` 会越过当前原因直接验证，也绕过 `applyPendingHandBack`（ADR-108 唯一触发函数）。这与 `14` G33b 的预期（L106：解除最后一个原因时才执行 `continue_agent`）相反。只有“检测于 `running`”一支考虑了剩余原因与 `pending_hand_back`。
     - `revert`：→ “回到 `resumeTo`”。检测于 `paused(X)` 时 `resumeTo={state:"paused"}` 不含原因，回到哪里没有定义；若 X 已在此期间解除，`resumeTo` 已经过时。
  2. **状态没有持久化位置**：
     - `resumeTo` 在 `02` L144 有第三种来源（ADR-122），但 `06` L444 的列注释、L465 的 `CHECK (resume_to IS NULL OR pause_reason = 'satellite_missing' OR …)` 与 `16` L27（“只与 `satellite_missing` 相伴”）都没有改。按现行 DDL，ADR-122 的写入会被拒绝。
     - 它与 `satellite_missing` 共用一个槽位，两者同时存在时（例如 `paused(external_change)` 期间卫星重建失败）会互相覆盖。
     - 外部路径集合 E 与归因基线（检测前最近的检查点）只在 drain 期间的回合检查点上有列（`06` L545 `external_paths`）。非 `running` 状态下检测到的 E、基线检查点编号与重复检测时 E 的累积规则，在 `02` Goal、`06` DDL 与事件表中都没有字段或事件。重启后 `revert` 无从知道恢复哪些路径、恢复到哪里。
  3. **接管时外部写入仍未处置**：`take_over` 允许从任意 `paused(*)` 发起，包括 `paused(external_change)`（`10` L655，`06` `goal.take_over`）。此时：
     - 交接基线 T0 已经包含 E，人工编辑检出以 Agent 代码的面目呈现这些未经处置的内容，没有任何标注；
     - 第 6 步只比较“卫星当前树 ≠ T0”，所以不会触发 `externalResolution`；
     - 交还后 `external_change` 作为保留原因留下。人若随后 `revert`，`restorePaths(基线, E)` 会把人在 H 中对 E 路径所做的编辑一并覆盖，而且没有任何提示。
     - 另外，第 6 步把“卫星 ≠ T0”一律当作外部写入，但接管期间存活进程的写入（归因表第 3 行，`author:"agent"`）同样会使卫星 ≠ T0。`take_external`/`keep_both` “保留 `external_change`”对这类写入没有意义。
  4. `verifying` 中检测到外部写入时“以同一 pin 重新验证”需要 `pendingVerify{pin, verifyFrom, trigger}`，但 `06` L447 只写它跨越 `s0_grant_pending`、人暂停与应用重启，不包括 `external_change`。
- **为什么重要**：ADR-122 把 `external_change` 从“运行中的一种暂停”扩展成“任何状态都会进入的人工决定点”，但出口仍按旧的单一路径设计。按现行文字，实现者无法同时满足 `06` 的命令分派、`06` 的 `CHECK`、ADR-108 的唯一触发函数与 G33b。第 3 项还会在人不知情的情况下丢弃人的工作。
- **文档位置**：`03` §3.2.1 L80；`02` §2.4 L144；`06` §6.3 L444、L447、L465、L545，§6.4.3 L829–830、`goal.take_over`、L834；`10` §10.3.1 L228–239，§10.8.4 L655、L688–696；`16` L25、L27；`14` G33b L106、G36b L111。
- **期望的回答形态**：
  - 把 `keep`/`revert` 改写为“解除 `external_change`，然后执行通用的原因解除规则”：只有当 `external_change` 是当前 `pauseReason` 且 `alsoApplies` 为空时才按检测状态继续；否则剩余最高原因成为 `pauseReason`，并在全部解除时调用 `applyPendingHandBack`。
  - 为外部写入单设持久字段（例如 `Goal.externalChange = {paths, baselineCp, detectedIn: {state, pauseReason?}, detections[]}`），写清 DDL 列与 `CHECK`。`resumeTo` 恢复为只服务 `satellite_missing`，或者明确两者如何并存。同步 `16` L27。
  - `take_over` 在 `external_change` 未处置时返回 `E_STATE`（先 `keep`/`revert`），或者 H 不写出 E 并在信任提示中列出。第 6 步只对归因表第 4 行的写入要求 `externalResolution`。
  - `pendingVerify` 的跨越范围加入 `external_change`。
  - G33b 按新规则改写；G36b 增加：(f) `paused(budget_hard_cap)` 中检测后 `keep`；(g) 从 `paused(external_change)` 接管后交还再 `revert`；(h) `paused(external_change)` 期间重启 Tower 后 `revert`。

**R14-D4-02｜重要**（ADR-122 的核心承诺在“放弃改动”路径上不成立；I2 的不变式没有随之修改）

- **问题**：
  1. 接管期间卫星被外部写入时，人选择“放弃改动”（`goal.discard_human_edits`）：`takeoverFrom ∈ {in_review, accepted}` 且卫星树 ≠ pin 的树 → “按 I2 进入 `verifying`（`verifyOrigin:"manual"`）”（`03` L68、`10` L724、`06` L836、`16` L28、`04` L644）。接管期间卫星发生变化，只能来自外部写入或存活进程，因为自动 rebase、机会式验证与合并队列都已暂停（`10` L655）。因此这一分支实际上就是“把未经处置的外部内容送去验证”。验证通过后，这些内容会进入 `in_review`，并以不属于任何人的方式进入评审与 seal。这正是 ADR-122 第一条要消除的情形（`15` L863：“来源不明的内容不会先被验证或评审，再等人决定”）。`04` L644 还把它写成了面向用户的说明。
  2. **I2 的不变式没有改**：`03` L94 仍写“`in_review` 或 `accepted` 期间 workspaceFingerprint 一旦变化（任何未提交改动…），状态自动回到 `verifying`”；§3.1 的图（L34、L38）与 `06` L254 第一句也是同样写法。`03` §3.3 要求“实现必须在 Supervisor 中断言不变量，违反即为 bug”。按 ADR-122，`in_review` 中来源不明的写入会进入 `paused(external_change)` 而不是 `verifying`，现行 I2 的断言会把正确行为判为 bug。
- **为什么重要**：这是 ADR-122 的立论基础。一个默认可达的出口与一条被断言的不变式都与它相反，实现者只能二选一。
- **文档位置**：`03` §3.1 L34、L38，§3.2.1 L68，§3.3 L94；`06` §6.2.3 L254，§6.4.3 L836；`10` §10.8.4 L724；`04` §4.6.7 L644；`16` L28；`15` ADR-122 L863。
- **期望的回答形态**：
  - `discard_human_edits` 中“卫星树 ≠ pin 的树”的分支改为：按归因表把差异分为存活进程的写入（`agent_bg`，按 I2）与外部写入（进入 `paused(external_change)`，E = 差异路径，基线 = pin 的检查点，`resumeTo = takeoverFrom`）；
  - I2 改写为“指纹变化且变化来自 Tower 的工作、人显式采纳或存活进程 → `verifying`；来源不明 → `paused(external_change)`（ADR-122）”，图、`06` L254 与 Projector 断言同步；
  - G36b 增加 (i)：从 `in_review` 接管、期间外部写入、选择“放弃改动” → `paused(external_change)`，不验证。

**R14-D4-03｜次要**（ADR-121 引入：宽限确认失败的分支有三种定义）

- **问题**：
  1. ADR-121 把宽限确认移到 `claimed` 之前，但宽限确认失败之后去哪里，各处写法不同：
     - `06` L184、`07` L345：“失败即撤回 / 按 ADR-025 撤回”。ADR-025 的撤回会记 `post_settle_activity` 异常，并计入“1 小时内第 2 次 → `paused(post_settle_activity)`”。
     - `10` L246、`05` L569、`14` G35c(g)：“按 `05` §5.5 处理（nudge 回合或 `paused(idle_without_submit)`）”。这里把“宽限失败”等同于“出现变更类工具调用”。
     - `03` L56：`claimed` 的出口中仍列有“宽限确认失败 → `running`”，但按新顺序，宽限失败时 Goal 还没有进入 `claimed`。
  2. 宽限失败的判据是出现 `agent_start`、`isStreaming` 或 `isCompacting`，不要求有工具调用。如果只是压缩或一条不改文件的消息，提交仍然有效，这时应等待下一次 settle，还是记一次异常？没有定义。
  3. settle 序列第 1–4 步之间，Goal 仍处于 `running` 但 Run 已经 settle。这段时间若检测到外部写入，会按 `running` 分支“以 abort 方式 drain”。此时：
     - drain 对象已不存在；
     - 有效提交是否保留没有定义；
     - `keep`/`revert` 之后会“按 `goal.resume` 规则继续”，即为已经提交的 Agent 再开一个 Run。
- **为什么重要**：这是每个 Run 结束都要经过的路径。三种写法会让同一事件分别产生“异常 + 撤回”“nudge/暂停”或“静默等待”，`post_settle_activity` 的计数也会随之不同。
- **文档位置**：`03` L56；`05` §5.5 L554、L569；`06` §6.1.10 L184；`07` §7.4.1 L345、L350；`10` §10.3.1 L232、L246；`14` G35c(g)；`15` ADR-025、ADR-121 L855–856。
- **期望的回答形态**：
  - 在 `05` §5.5 唯一定义宽限失败的处理（建议：不记异常，回到等待下一次 `agent_settled`；有效性在下一次 settle 时按 I4(a) 重新判定），其他文档只引用；
  - `03` L56 删去 `claimed` 出口中的“宽限确认失败”；
  - 写明 settle 序列进行中检测到外部写入时，有效提交保留，`keep`/`revert` 之后回到 settle 序列，不开新 Run；
  - G35c(g) 的预期据此改写。

**R14-D4-04｜次要**（ADR-123 引入：`running` 中的 `sentinel_high` 不是合法转移；git 拒绝收录后树的定义缺失）

- **问题**：
  1. ADR-123 规定：watcher 发现 `.git` 的等价变体时“立即暂停 Run（`paused(sentinel_high)`，`nested_repo`）”（`10` L92、`11` L334、`15` L880、G26b）。但：
     - `03` L54 中 `running` 的出口不含 `sentinel_high`，§3.2.1 L74 中它的入口只有“verifying（通过但有高严重度哨兵）”。
     - 它的出口在 `running` 语境下都不成立：`override_sentinel` → `in_review`，此时没有 pin，也没有验证；`request_changes` 的前置状态是评审。
     - `nested_repo` 在 `07` L1336 中的推导来源是 pin，交还时会被清除（`10` L706）。但这次命中来自运行中的 watcher，不对应任何 pin。
  2. “影子 `add -A` 在 `protectHFS/NTFS` 下拒绝收录并转为 `nested_repo` 命中，检查点与 pin 不失败”（`10` L92、G26b）。但 git 对非法路径的拒绝会让整条 `add` 命令失败，文档没有定义此时如何得到检查点与 pin 的树（排除该路径重试？哪些路径？）。被排除的条目在 pin 中不存在，ADR-112 的覆盖也就无法绑定对象哈希。
- **为什么重要**：这是一道 severity 3 的闸口。命中后 Goal 进入一个没有合法出口的状态；树的定义是 `pinSafetyCheck` 与覆盖绑定的前提。
- **文档位置**：`03` §3.2 L54，§3.2.1 L74；`07` §7.10.1 L1336；`10` §10.1.2 L92，§10.7.1 L499–501，§10.8.4 L706；`11` §11.6.2 L334；`14` G26b L88；`15` ADR-123。
- **期望的回答形态**：
  - 为 watcher 命中选定状态与原因。例如复用 `stop_condition` 类的运行期暂停，新增 `pauseReason` 子类型，或者 drain 后进入 `paused(sentinel_high)` 并写明只有 `request_changes`（以转向恢复 Run）与 `abandon` 两个出口。标为 run 类，交还时保留。
  - 在 §10.7.1 第 1 步写明拒绝后的处理：例如以 `:(exclude)` 排除命中路径后重试，记录被排除的路径，命中按“路径 + 名字”绑定，在这些条目被删除之前阻断 Verified。
  - G26b 增加对两者的断言。

### D5 Agent 架构与 Pi 集成

**R14-D5-01｜次要**（ADR-121 的提醒回合）

- **问题**：
  1. **触发条件与 Pi 不符**：`05` L569 的唯一示例是“宽限确认窗口内出现变更类工具调用”，并断言“`agent_before_settle` 已不能再发 nudge”。但宽限窗口内出现工具调用，说明已经开始了一次新的 run；按 Pi 源码，这次 run 在 settle 之前同样会经过 `agent_before_settle`（`agent-session.ts` L1857–1875）。所以 tower-goal 可以按常规 nudge，Supervisor 侧的提醒回合在这个示例中并不需要。并且在这次 run 进行中调用 `prompt` 会抛错（L2098–2103）。真正“只有 settle 之后才能发现”的情形没有被写出来。
  2. **用 `prompt` 注入的副作用**：
     - `prompt` 产生 `role:"user"` 消息。tower-goal 的 nudge 计数规则是“当前分支上，最后一条 user 消息之后的 `tower.nudge` 数 < max”（`05` L1046）。因此每个提醒回合都会把计数清零，“计入 nudge 次数”与防循环条件都不成立。
     - `05` L839 规定事件性注入是 `tower.*` 的 `custom_message`（Trace 标“Tower 注入”）。user 消息会被呈现为人说的话，这违反了 Fact/Claim/Human 语法。
     - 在 RPC 下，`prompt` 会经过模板展开与其他扩展的 `input` 处理器，可能返回 `disposition:"handled"` 而不开回合（`rpc-commands.md` L33–40）。
  3. **守卫不一致**：tower-goal 的 nudge 有守卫（至少一条 `exec`/`artifact` 标准、非 draining，`05` L1038–1046），Supervisor 侧的提醒没有。只有 human 标准的 Goal 因此会被 Supervisor 提醒，而 tower-goal 有意不提醒。
  4. **`tower.processes_terminated` 的投递**：撤回到 `running` 是因为别的来源已经开始了一次 run（ADR-025）。这时不存在由 Tower 发出的“恢复的第一条消息”，投递方式没有定义（`05` L554、`10` L251）。
- **为什么重要**：nudge 的循环防护是 Pi 扩展文档要求的；以人的身份显示 Tower 的话违反诚实语法。
- **文档位置**：`05` §5.5 L554、L569，§5.6.2c L758，§5.6.5 L1036–1058，§5.7 L839；`03` L96；`07` L350；`10` L246、L251；`15` ADR-121 L855、L857；`14` G35c(g)(h)。
- **期望的回答形态**：
  - 删去这一行，统一为“宽限失败 → 等待下一次 settle，由 tower-goal 在 before_settle nudge”（与 R14-D4-03 一起）；
  - 或者把它限定为可以写清的情形，并改用 Pi 的 custom message 触发回合：SDK 用 `session.sendCustomMessage({customType:"tower.nudge",…}, {triggerTurn:true})`，RPC 由 tower-goal 执行 `pi.sendMessage(…, {triggerTurn:true})`。守卫与计数共用 tower-goal 的同一个函数。
  - `tower.processes_terminated` 在 run 已经进行时以 `triggerTurn:false` 的 custom message 投递（回合结束时写入），在恢复时作为第一条消息。
  - 增加契约测试：settle 之后注入的提醒回合、计数与只有 human 标准的 Goal。

**R14-D5-02｜次要**（“变更类工具调用”有四种定义）

- **问题**：
  - **I4(a)**（`03` L96、`05` L755、`06` L256、`07` L342、ADR-121）：`edit`、`write`，以及按 `11` 不属于只读的 `bash`。
  - **`05` L1015 `turnMaybeMutated`**：只读白名单之外的一切，包括 `codemode`、任何 `mcp__*`、未知或自定义工具，以及带 `parentToolCallId` 的嵌套调用。
  - **`10` L498 第 0 步**：`edit`/`write`/`bash`/未知自定义工具。
  - **`07` L51**：`bash`/`edit`/`write`，或带 `destructiveHint` 的工具。这会漏掉不带 `destructiveHint` 的写工具。
  
  I4 的定义没有覆盖 `powershell`、codemode 的嵌套 `edit`（`parentToolCallId`）、MCP 与扩展工具。后果：
  - `submit` 之后经这些工具写入不会使提交作废，写入进入 landmark 为 `agent_bg_done` 的检查点，在 Trace 中显示为“submit 之后后台进程又改动了 N 个文件”（`05` L756）。这是错误的归因。
  - tower-goal（按分支判定 nudge）与 Supervisor（按 I4 判定 claimed）可能使用不同的集合，结论也就不同。
  
  `05` L750 的注释仍写 `fingerprint` “用于有效提交判定（03 I4）”。
- **为什么重要**：Pi 已提供足够的信息（`ToolAnnotations.readOnlyHint`、`parentToolCallId`，见文首核对）。这是主路径上的定义，应当只有一处。
- **文档位置**：`03` L96；`05` L750、L755–756、L1015；`06` L256；`07` L51、L342；`10` L498；`11` §11.3（动作分类）。
- **期望的回答形态**：
  - 在 `16` 中唯一定义“变更类工具调用” = 只读白名单之外的任何调用（含嵌套调用；带 `readOnlyHint:true` 且通过 `11` 路径检查的工具可以进入白名单；`bash`/`powershell` 按 `11` 分类，“不确定”算变更）；
  - I4、`turnMaybeMutated`、第 0 步与 `07` L51 只引用它；
  - 修正 `05` L750；
  - 增加契约测试：`submit` 之后的嵌套 `edit` 与 MCP 写工具。

### D6 系统架构与可靠性

**R14-D6-01｜次要**

- **问题**：
  1. `10` L253、ADR-121 规定“只持久化存活 ≥ 5 s 的进程”。在 Linux 上，cgroup 跨 Supervisor 崩溃仍然存在，可以整体终止。在 macOS 上，崩溃时存活不足 5 s 的进程（例如崩溃前刚启动的开发服务器）不在持久化集合中：
     - 重启后不会被确认和终止，成为未追踪的孤儿；
     - 之后它的写入在 `claimed` 之后会被判为外部写入，在 `running` 中则落在已知误判 (b) 的范围内。
     
     这个窗口来自本轮的设计选择，不是双重 fork，但没有登记。
  2. E、归因基线与 `pendingVerify` 的持久化缺口见 R14-D4-01 第 2、4 项。
- **为什么重要**：崩溃恢复是 ADR-115 的承诺之一；性能优化不应在没有登记的情况下削弱它。
- **文档位置**：`10` §10.3.1 L253、L255；`06` §6.1.6、§6.1.10；`13` L315；`15` ADR-121 L859。
- **期望的回答形态**：
  - macOS 额外持久化每个 Run 的进程组 id 或会话 id（每 Run 一行，不随进程进出写事件），重启时按组确认并终止；
  - 或者把这个窗口登记为 (c) 类已知误判，并在 G35c 中增加“崩溃前 3 s 启动的后台进程”一例。

### D7 诚实与验证

**R14-D7-01｜次要**

- **问题**：
  1. **卡片断言写入者**：`04` L839 的外部改动卡片以 ⚙（Fact）写“检测到 2 个文件被 **Agent 与 Tower 之外的进程**写入”。但 `10` L255 的已知误判 (b) 承认写入者可能是未被追踪的 Agent 后台进程，并要求卡片注明“可能来自 Agent 启动的后台进程”。卡片没有这一行，Fact 说得比 Tower 所知的更多。ADR-122 自己也要求“文案不推测来源”。
  2. **存活进程期间的写入**：`bg_process_survived` 未解决期间，**全部**未归因写入都记为 `author:"agent"`（`10` L225），其中可能包括人在外部编辑器中的保存。这是与误判 (a) 方向相反的误归因。它没有登记为已知误判，也没有测量（G36b(e) 只测进程本身的写入）。此外，第 3 行没有定义 `paused(*)` 状态下的处理（只列了 `claimed`/`verifying`/`in_review`/`accepted`）。
  3. **交还的副作用**：`take_external`/`keep_both` 之后，第 8 步按 `author:"human"`、landmark `human_edit` 记录检查点（`10` L705），其树相对上一个检查点的差异包含 E。时间线把它标为“你的改动”（`12` L699）。`take_external` 已经丢弃了 H：
     - 选“交给 Agent 继续”时，仍会注入一条 `tower.handback`，列出“人改过的文件、不得回退”（`10` L714–716），而这些改动并未写回；
     - `HumanDecision{hand_back, targetTree: T1}` 记录的是一棵从未生效的树。
  4. 用 `prompt` 注入的提醒以人的身份出现（见 R14-D5-01）。
- **为什么重要**：诚实语法要求 Tower 写下的不多于、也不异于它所知道的。第 1、3 项是本轮新文案与新流程中的直接违例。
- **文档位置**：`04` §4.8.7 L839；`10` §10.3.1 L225、L255，§10.8.4 L692–696、L705、L714–716；`12` L699；`14` G36b(e)。
- **期望的回答形态**：
  - 卡片首行改为“检测到 2 个文件在没有 Agent 工具调用、也没有被追踪的 Agent 进程时被写入”，并按 `10` L255 附上“可能来自未被追踪的 Agent 后台进程”的说明；
  - 把存活进程期间的误归因登记为已知误判 (c)，在 G36b 增加“存活进程期间人保存文件”一例，并补上第 3 行在 `paused(*)` 中的处理；
  - `take_external` 定义为“放弃改动 + 保留 `external_change`”：不记 `human_edit` 检查点，不注入 `tower.handback`，`targetTree` 记为 T0；`keep_both` 的第 8 步检查点对 E 记 `externalPaths`。

### D8 注意力与交互

**R14-D8-01｜次要**（ADR-122 引入）

- **问题**：`external_change` 已成为任何状态都会进入的人工决定点，`04` §4.8.7 也有了 Inbox 卡片，但它的 Needs-You 没有任何登记：
  - `07` §7.10.1 总表没有这一行（severity、路由、`costOfDelay`）；
  - `08` §8.4 没有去重键（重复检测时 E 是合并还是另起一条？）；
  - `08` §8.8 没有标注映射（`keep` 与 `revert` 各记什么？“撤销”比例高，正说明检测器在误判 Agent 自己的进程，是检测器精度的直接信号）；
  - `16` §16.1.7 没有对应的 kind。
  
  lint (w) 只检查 `16` §16.1.6 中登记了的检测器，因此覆盖不到由暂停原因生成的条目。此外，当 `external_change` 只在 `alsoApplies` 中时（例如在 `paused(human)` 或 `paused(budget_hard_cap)` 之下），卡片是否出现也没有定义。`post_settle_activity`（`07` L1342 “NY”）同样没有写 kind，属于同类遗漏。
- **为什么重要**：Needs-You 纪律要求每一条都有 kind、去重、出口与标注。第 13 轮为 `bg_process_survived` 补齐的正是这一点，这次在一个更常见的条目上重现。
- **文档位置**：`04` §4.8.7；`07` §7.10.1 L1342；`08` §8.4、§8.8；`16` §16.1.7 L170；`reviews/lint/xref.py` (w)。
- **期望的回答形态**：
  - 指定 kind（例如沿用 `anomaly`，或新增 `external_change`）、severity 2、`costOfDelay`；
  - 去重键 `ec:{goalId}`，重复检测时把路径并入 E；
  - 标注：`keep` → `actionable`，`revert` → `false_positive`（相对于“需要人决定”）；
  - 规定在 `alsoApplies` 中时卡片照常出现，并标“当前暂停原因：…”；
  - lint (w) 增加“每个 `pauseReason` 生成的 Needs-You 有 kind 与去重行”。

### D11 安全与自主度

**R14-D11-01｜次要**

- **问题**：
  1. **Linux S2 的 `.git` 禁令**：ADR-123 承认 Landlock 不支持按名字拒绝，由 watcher 兜底（`11` L334、`15` L879）。这意味着在 Linux S2（M2）上，连字面的 `.git` 也只能在事后发现，这条不变式在 Linux 上的强度与 S0 相同。但：
     - T29 的“低（S2）”与残余 (a) 只描述了“其余等价变体”的窗口；
     - G26 的预期是“全部被 S2 拒绝”；
     - 都没有区分平台。
     
     watcher 作为唯一机制时，它对新建子目录的覆盖（inotify 需要逐目录添加监视，新目录与其中文件的创建之间存在竞态）也没有说明。可能的后果是：发现窗口内，沙箱外的扩展或 MCP git 进程把 Agent 控制的元数据当作仓库读取。窗口内仍有 `GIT_CEILING_DIRECTORIES` 与 `safe.bareRepository=explicit` 两道防线，但 T29 的评级应当如实反映这一点。
  2. **`user_config` 的成员规则**：它定义为“用户主目录下的其余配置，如 `~/.gitconfig`”（`16` L152）。severity 2 只针对写入。但 shell 启动文件、用户级登录项或启动代理目录、编辑器全局配置等，是否属于 `user_config`？这无法判定，而它们正是持久化越界写入的典型目标。若被归为 `system`，就只是 severity 1 的 chip。这是一类“分类函数不可操作，导致高价值信号被降级”的问题。
- **为什么重要**：T29 是 git 隔离的核心威胁，残余评级必须按平台如实写；severity 2 集合的成员规则决定哪些越界写入会被人看到。
- **文档位置**：`11` §11.6.1 L316、§11.6.2 L334、T29 L549；`10` §10.1.2 L92；`14` G26 L87、G26b L88；`16` L152、L238；`15` ADR-123、ADR-125 补记 L913。
- **期望的回答形态**：
  - T29 按平台分列：macOS S2 的残余为“非 ASCII 等价变体的 watcher 窗口”，Linux S2 为“全部 `.git` 名字的 watcher 窗口”（或者给出 Linux 上的替代强制手段，例如由沙箱外进程预先占位，或使用挂载命名空间层面的约束，作为 M2 的决定点）；
  - G26 写出 Linux 的预期，并说明 watcher 的目录覆盖策略；
  - `user_config` 以可判定的规则定义（例如主目录下以 `.` 开头的文件与目录、`~/.config/**`、平台的登录项与启动代理目录，减去 `credential` 与 `tower_data`），附示例清单，E7 统计其误报。

### D13 隔离、git 与并发

**R14-D13-01｜次要**

- **问题**：
  1. **PR 已推送后的转移**：M1 的“推送并开 PR”在验收后推送 seal，随后轮询 PR 状态，以判定 `integrated`（`10` L858）。ADR-122 让 `accepted` 中任何来源不明的写入都把 Goal 转入 `paused(external_change)`。若这期间 PR 在远端被合并，`03` 只有 `accepted → integrated` 一条边（L59），`paused` 与 `verifying` 都没有这条边。观测结果没有落点，24 h 宽限期与撤销流程也随之失效。这个问题此前就存在于 I2 的 `verifying`，但 ADR-122 扩大了它的触发面。
  2. **drain 期间同一路径的编辑**：`running` 中登记 E 之后，drain 期间的回合检查点按路径把 E 中的路径记为外部（`10` L232）。若 Agent 在 drain 回合中也编辑了 E 中的某个路径，它的编辑会被一并标为外部：`revert` 时被撤销，`keep` 时被记为人。G36b(a) 只测了不同的路径。
  3. `revert` 之后“树等于基线时回到 `resumeTo`”（`10` L239）。不等时（例如期间有存活进程写入）的去向没有写明。
- **为什么重要**：第 1 项会让已经合并的工作在 Tower 中永远停在暂停状态；第 2 项是按路径归因的已知精度边界，应当如实登记。
- **文档位置**：`03` §3.2 L59、L60；`10` §10.3.1 L232、L239，§10.12 L858；`06` §6.1.6 `awaiting_remote` 行；`14` G36b(a)。
- **期望的回答形态**：
  - 规定任何非终态观测到 PR 合并时的处理，例如记录 Fact，并在 `external_change`/`verifying` 解除后直接进入 `integrated`，或者提示人选择；
  - 第 2 项二选一：drain 期间同一路径上既有 Agent 工具写入又有外部写入时记 `mixed`，或者登记为已知误判；
  - 写出 `revert` 后树不等于基线时的去向（按 I2，`verifyOrigin` 视剩余差异的归因而定）。

### D14 路线图与可验证性

**R14-D14-01｜次要**

- **问题**：
  1. **用例排在实现之前**：B2（第 15 周）包含 G26b 与 G29（`14` L38）。G26b 测 ADR-123 的大小写类规则与 watcher 等价变体；G29 统计 ADR-124 base 豁免下的符号链接误报。这两项实现按 W7 的第 13 轮增量属于安全线（L200：“S2 大小写类与 watcher 等价变体、链接 base 豁免（安全 +0.2）”），甘特图把它们排在第 15–22 周（L268：“含 ADR-…/123/124 档位”）。批次表的表头规则是“每批在其依赖的实现完成之后的那一周运行”，因此违反了批次表自己的规则。这与 R13-D14-01 第 2 项是同一类问题。
  2. **SP6b 补跑工时的归属**：SP6b 行写“补跑 1.3 人周计入 W7-rest（安全 1.0、设计 0.3）”（L31）。但 W7 行的 W7-rest 基础描述仍是“SP6b 补跑批次 1.0（系统 8.2）”，第 10 轮只把其中 0.5 改派给安全线（L200）。剩下的 0.5 由系统线还是安全线承担，两处说法不一致；B1–B3 的“执行”列都只写“安全”。
  3. **用例与规则不一致**：G35c(g) 的预期取决于 R14-D4-03 的裁决。G35c(h) 写“`claimed` 中因 I2 撤回到 `running`”，但 I2 不适用于 `claimed`，撤回的原因是 ADR-025 的 `agent_start`。
  4. **本轮新规则缺用例**：
     - `claimed`、`accepted`（含 PR 已推送）中检测到外部写入；
     - `paused(*)` 中检测到后 `keep`/`revert`（含剩余原因与 `pendingHandBack`）；
     - 从 `paused(external_change)` 接管；
     - 接管期间外部写入后“放弃改动”；
     - `paused(external_change)` 期间重启；
     - watcher 在 `running` 中命中 `.git` 等价变体之后的状态与出口；
     - `protectHFS/NTFS` 拒绝之后的检查点与 pin；
     - 提醒回合的契约测试；
     - `submit` 之后的嵌套写入与 MCP 写入；
     - Linux S2 的 G26。
     
     （分别对应 R14-D4-01/02/04、R14-D5-01/02、R14-D11-01、R14-D13-01。）
- **复核说明**（不扣分）：
  - WBS 各行之和为 102.6；本轮增量 +1.7 的分项（W6 +0.25、W3 −0.1、W7 +1.3、W10 +0.1、W12 +0.1、W18 +0.05）与角色分配（系统 +0.35、Agent +0.35、桌面 +0.4、设计 +0.4、安全 +0.2）逐项成立；
  - 五条角色线为 21.85/21.85/23.2/24.3/11.4，扣除 M0 先行后乘 1.1，得 23.6/23.93/23.54/23.43/23.98（安全线按 0.5 人）；
  - 26 个工作周减 2 周缓冲后，余量为 0.4/0.07/0.46/0.57/0.02；
  - 依赖链 3.9 + 3.9 + 4.4 + 6.2 + 1.0 = 19.4；
  - 增人方案的均摊为 96.5/5 = 19.3，第 25 周末为 2027-04-30，M1 至 2027-05-28；
  - 2026-11-09 为周一，第 33 周周五为 2027-06-25。
  
  系统与安全线余量只剩 0.07/0.02 工作周，修复本轮重要项所需的工作量几乎必然落在这两条线上，届时须按 ADR-119 显式选择。
- **为什么重要**：rubric 只承认带验收条件、可执行的验证计划；排在实现之前的用例不可执行，工时归属不一致会使余量的计算失真。
- **文档位置**：`14` §14.2 L31、L33–40、G26 L87、G26b L88、G29 L94、G33b L106、G35c L109、G36b L111，§14.3.4 L190、L200、L264–268。
- **期望的回答形态**：
  - 把 G26b、G29 移到 B3，或者把相应实现提前到第 13 周之前；
  - 统一 SP6b 补跑工时的归属，并在 W7 行写出现值；
  - 修正 G35c(g)(h)；
  - 为上列每条新规则登记用例与通过条件。

### D15 文档一致性与可执行性

**R14-D15-01｜次要**

- **问题**：以下跨文档矛盾与陈旧表述均已逐处核对：
  1. `03` L56：`claimed` 的出口中仍有“宽限确认失败 → `running`”，与 ADR-121 的新顺序不符（见 R14-D4-03）。
  2. `03` L94 的 I2、§3.1 图 L34/L38、`06` L254 第一句：“任何未提交改动 → `verifying`”，与 ADR-122 不符（见 R14-D4-02）。
  3. `16` L27 与 `06` L444、L465：`resumeTo` 只与 `satellite_missing` 相伴，与 `02` L144、ADR-122 不符（见 R14-D4-01）。
  4. `02` L140：`external_change` 的注释仍是“运行中工作区出现……（10 §10.16）”，而它现在适用于任何状态，定义在 §10.3.1。
  5. `05` L750：`fingerprint` “用于有效提交判定”，与 ADR-121 不符（见 R14-D5-02）。
  6. “变更类工具调用”有四处定义（见 R14-D5-02）。
  7. 宽限失败有三种去向（见 R14-D4-03）。
  8. `03` L80 的“出口”列只写“→ `verifying`（keep）”，漏了“检测于 `running` 时 keep → `running`”；同一行与 `10` L234（“人工编辑检出存在时不单独处置”）也没有写明接管期间 `external_change` 是否进入 `alsoApplies`，而 `10` L682 与 `06` L834 都把它当作保留原因处理。
  9. `04` L644 把“树已改变 → `verifying`”写成了面向用户的说明（见 R14-D4-02）。
  10. `14` G35c(h) 的“因 I2 撤回”（见 R14-D14-01）。
  11. lint 抓不到上述各项：(r) 没有 I2 与 ADR-122、`resumeTo` 来源、“变更类工具调用”的唯一定义概念；(w) 不覆盖由暂停原因生成的 Needs-You；没有检查把 DDL `CHECK` 与 `02`/`16` 的字段语义对照。
- **为什么重要**：第 2、3 项会直接导致实现时断言失败与写入被拒，第 6 项决定 I4 的实现。
- **文档位置**：如上。
- **期望的回答形态**：
  - 逐条修正；
  - lint 在 `UNIQUE` 中加入以下概念：“I2 的触发与 `external_change` 的分界”“变更类工具调用”“`resumeTo` 的来源”“宽限失败的去向”；
  - (w) 增加 `pauseReason` → Needs-You 的检查；
  - 新增检查 (y)：DDL 中每个跨列 `CHECK` 引用的取值集合与 `16` 的字段行一致。

---

## 5. 结论

- **是否所有维度为 100：否。**
  - D1、D9、D10、D12、D16 为 100：在这五个维度上没有找到可追问的实质问题。D9、D10 由 98/99 回到 100。
  - 其余维度在 90–98 之间。最低为 D4（90），其次是 D15（93）、D7 与 D14（95）。
- **是否还有可追问的问题：有。**
  - **第 13 轮核验**：共 15 条，已解决 10、部分 5、未解决 0；lint 全部通过，U1 已关闭。
  - **本轮追问**：新增与残留共 **13** 条：
    - 阻断 0；
    - **重要 2**：R14-D4-01、R14-D4-02；
    - 次要 11：R14-D4-03、D4-04、D5-01、D5-02、D6-01、D7-01、D8-01、D11-01、D13-01、D14-01、D15-01。
  - D2、D3 的扣分来自 R14-D5-01、R14-D4-02 与 R14-D11-01 中的事实与论证问题，不单独编号。
- **设计是否完成：否。** 两个重要项都落在 ADR-122 的核心承诺上（“来源不明的内容不会先被验证或评审”），并且会在实现时直接表现为状态机断言失败或 DDL 拒绝写入。它们都可以用设计层面的一到两段规则关闭；关闭之前不宜开工 Supervisor 的状态机与 `external_change` 相关命令。其余次要项大多是本轮修订带来的接线与措辞问题，范围有限。
- **下一轮建议按以下顺序修订**：
  1. 为 `external_change` 设独立的持久状态（E、基线、检测时状态），把 `keep`/`revert` 接到通用的原因解除规则与 `applyPendingHandBack`，并处理接管时尚未处置的外部写入（R14-D4-01）；
  2. 修正“放弃改动”中树已改变的分支，并改写 I2 及其断言（R14-D4-02）；
  3. 唯一定义宽限失败的去向，删除或改造提醒回合（改用 custom message 触发回合，与 tower-goal 共用守卫与计数），并定义 settle 序列进行中检测到外部写入时的处理（R14-D4-03、R14-D5-01）；
  4. 在 `16` 中唯一定义“变更类工具调用”，覆盖嵌套、MCP、自定义与 `powershell` 工具（R14-D5-02）；
  5. 为 watcher 命中的 `.git` 等价变体选定合法的状态与出口，并定义 git 拒绝收录后的树（R14-D4-04）；
  6. 补齐 `external_change` 的注意力登记，修正外部改动卡片与 `take_external` 的语义，登记存活进程期间的误归因（R14-D8-01、R14-D7-01）；
  7. T29/G26 按平台分列，以可判定的规则定义 `user_config`（R14-D11-01）；
  8. 处理 PR 合并与暂停的交叉、drain 期间同一路径的归因、macOS 孤儿进程窗口；调整 B2 排期与补跑工时的归属；完成 D15 清单与 lint 扩展（R14-D13-01、R14-D6-01、R14-D14-01、R14-D15-01）。修订工作量若落在系统或安全线上，按 ADR-119 显式选择削减或顺延。
