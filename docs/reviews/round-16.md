# 对抗评审 · 第 16 轮

> **评审者**：独立对抗 Agent，未参与写作。
>
> **评审对象**：`README.md`、`docs/00`–`docs/16`（重点是 ADR-134–136、ADR-133 的第 15 轮补记及其落地处）、`reviews/round-15.md`、5 份第 15 轮回应、`round-15-lint.md`。回应文件只作为线索，每条结论都回到正文核对。行号以本轮读到的文件为准。
>
> **核对依据**：
> - Pi 克隆位于 `research/pi-mono`，标签 `v1.2.0`（提交 `06a4669`，“Release v1.2.0”），全部以 `git show v1.2.0:<path>` 读取。
>   - **D55 成立**：
>     - `core/agent-session.ts` L2060–2068：`prompt()` 在 `expandPromptTemplates`（默认 true）且文本以 `/` 开头时，先调用 `_tryExecuteExtensionCommand`（L2141–2163）。
>     - 命中时 `preflightResult("handled")` 并返回：不经 `_runInputHandlers`、不走 `_startRun({messageType:"user"})`，流式中同样先执行。
>     - RPC 的 `prompt` 分支（`modes/rpc/rpc-mode.ts` L394–412）以 `void session.prompt(…)` 调用，响应在 `preflightResult` 时才发出。
>     - `registerCommand` 位于 `core/extensions/types.ts` L1680。
>   - **D56 成立**：
>     - `sendCustomMessage`（L2318）在空闲且 `triggerTurn:true` 时调用 `_startRun({messageType:"custom"})`（L2344）；若正在发射 `agent_settled`，则推迟。
>     - `_startRun` 同步置 `_isAgentRunActive = true`（L1833），随后 `_prepareRun` 发出 `before_agent_start`，其 `BeforeAgentStartCustomEvent` 带 `message`（`types.ts` L950–957）。
>     - `ExtensionAPI.sendMessage` 返回 `void`（L1731），运行时转到 `sendCustomMessage`（L4405）。
>   - **C35 的通过条件与源码一致**，但 D55 有一个未登记的前提，本轮在源码中确认：
>     - `core/extensions/runner.ts` L814–845 的 `resolveRegisteredCommands()`：两个扩展注册同名命令时，**两者都改名**为 `<name>:1`、`<name>:2`，裸名不再存在；`getCommand(name)`（L863–864）因此找不到命令。
>     - 找不到时，`prompt()` 继续走普通路径，`/tower-inject <id>` 这段文本会作为 **user 消息**进入会话。流式中没有 `streamingBehavior` 时则抛错。
>     - 见 R16-D5-01 第 4 项。
>     - RPC 有 `get_commands`（`rpc-mode.ts` L680–690），返回 `invocationName` 与 `sourceInfo`，可以用来检测这种情况。
>   - **其他引用核对无误**：
>     - `ctx.compact()` 只发 `compaction_start`/`compaction_end`（L2792、L2903）；
>     - `tools/bash.ts` L112–118 以 `detached: process.platform !== "win32"` 启动。
> - `python3 docs/reviews/lint/xref.py --checks rstuvwxyz` 复跑结果：
>   - 0 断链；(r) 0；(s) 8/8；(u) 0；(v) 0（79 条命令）；(w) 0；(x) 0；(w′) 0；(y) 0；(z) 0；(t) 0；
>   - 退出码 0。
> - `14` §14.3.4 的算术已逐项复核，见 R16-D14-01 末尾的复核说明。全部成立。
> - 本轮没有做本机实验。
>
> 本文只在设计层面描述安全问题：缺了哪条不变式或规则、会放进哪一类后果、期望怎样缓解。不包含复现步骤。

---

## 1. 总评

第 15 轮 10 条：已解决 4、部分 6、未解决 0。lint 全部通过；D55/D56 与源码一致；35 周排期的算术无误。

ADR-134 用一个持久的继续目标加唯一转移函数，关闭了第 15 轮的五类无去向组合。但统一之后出现三类新缺口：
- **继续目标 `run` 不带载荷**：延后执行时会丢掉 `tower.handback` 与人写的转向；
- **`claim_on_behalf` 的去向与失败语义**：`03` 与 `06`/`07` 互相矛盾；
- **drain 的目的原因没有持久化**：drain 期间崩溃或退出会把“人暂停”“外部写入”变成自动恢复；同时 `running` 中写 `externalChange` 违反 DDL 的 `CHECK`。

以上为 2 个重要项，另有 8 个次要项。

## 2. 评分表

| # | 维度 | 分数 | 一句话理由 |
|---|---|---|---|
| D1 | 原论述契合度 | 100 | 没有可追问的实质问题。继续目标挂在 Goal 上，Goal 中心、事实/声明分离与评审闭环都没有退化 |
| D2 | Pi 哲学契合度 | 98 | D55/D56 核实无误，`/tower-inject` 以扩展命令实现，符合“极简核心 + 扩展”。但 D55 漏登记一个前提：命令名必须在已加载扩展中唯一，否则 Pi 会给两者都改名，文本以 user 消息落入会话（R16-D5-01 第 4 项） |
| D3 | 论证与证据 | 98 | 有三处断言超出了设计实际做到的：“按组终止覆盖未满 5 s 的组内进程”在组长先退出时不成立（R16-D6-02）；“命令处理器在同一 stdin 序列中执行，顺序确定”是有条件的；“Tower 的话不以 user 角色出现”有两处例外（R16-D5-01） |
| D4 | 领域模型与生命周期 | 92 | 继续目标 `run` 没有载荷，`claim_on_behalf` 三处定义冲突，`verifyFrom` 的写入点未定义（R16-D4-01）；另有六个边角组合没有去向或与原则矛盾（R16-D4-02） |
| D5 | Agent 架构与 Pi 集成 | 96 | nudge 的计数窗口仍锚定“最后一条 user 消息”，被 ADR-135 打破；交还开场的 `triggerTurn` 与 §5.2.1 矛盾；`tower.rework` 有两条注入路径；`/tower-inject` 缺少唯一性前提；唤醒后仍以 `prompt` 续跑（R16-D5-01） |
| D6 | 系统架构与可靠性 | 93 | drain 的目的原因没有持久化：崩溃、退出或第二个暂停请求都会改写它，settle 表还把 draining 映射为 `idle_without_submit`，运行中写 `externalChange` 违反 `CHECK`（R16-D6-01）；进程组的组长退出后，组内存活者在重启时不被终止（R16-D6-02） |
| D7 | 诚实与验证 | 98 | 在 `run`/`settle` 目标下 `keep`：Agent 不被告知；`settle` 路径上验证失败会自动返工，可能改动人刚采纳的内容，与“不自动让 Agent 改人改过的代码”相违（R16-D7-01） |
| D8 | 注意力与交互 | 98 | `stop_condition` 的卡片与命令已闭合。但“继续 / 这里不该停”之后同一条件是否再次触发，以及条件在何处求值、命中后怎样 drain，都没有定义（R16-D8-01） |
| D9 | 视觉设计与美观 | 100 | 没有可追问的实质问题。`之后：<继续目标>`、`⚙ Tower 注入`、混合作者、条目消失后的确认卡都已一致地落在 `04`/`12` |
| D10 | 性能 | 100 | 没有可追问的实质问题。每次 bash 调用一行、守卫的指纹比较都在已登记的预算内 |
| D11 | 安全与自主度 | 100 | 没有可追问的实质问题。`~/.ssh/**` 整体为 `credential`，`user_config` 的包含式规则有判定顺序与判例，lint (x) 比对类别。命令名冲突的后果是诚实问题，不是权限扩大，归入 R16-D5-01 |
| D12 | 记忆与学习 | 100 | 没有可追问的实质问题。L9 的消费者已写入 `09` §9.6.2，M1 只记录 |
| D13 | 隔离、git 与并发 | 97 | 超过 64 条被拒路径时仍标为环境错误，而且在 `running` 中没有对应的转移；观测到旧 seal 合入时，若 Goal 已有更新的已采纳内容、活跃 Run 或人工编辑检出，去向未定义（R16-D13-01） |
| D14 | 路线图与可验证性 | 97 | 日期、WBS 111.15、各线余量全部复核成立。ADR-135 的几条新规则与 `claim_on_behalf`/`retry_claim` 的改写没有用例（R16-D14-01） |
| D15 | 文档一致性与可执行性 | 95 | 继续目标的字段形状、`claim_on_behalf`、`idle_without_submit` 的入口、交还开场、`16` 的决定说明都有新旧不一；第 15 轮 #3、#7 仍有残留（R16-D15-01） |
| D16 | 创新与差异化 | 100 | 没有变化，没有可追问的实质问题 |

---

## 3. 第 15 轮条目核验

状态：**已解决** / **部分**（已改，但不完整、有残留或引入新矛盾）/ **未解决**。

| 条目 | 状态 | 备注 |
|---|---|---|
| R15-D4-01 | 部分 | **已落地**：<br>• `Goal.continuation`（`02` L54–59、L151；`06` DDL L449 与 `CHECK` L470；`16` L28）；<br>• 唯一转移函数与守卫（`03` L67–72，`06` L823，`07` L1480–1490，`10` L243–247）；<br>• `take_external` 不写 `pendingHandBack`（`06` L848，`10` L725–727）；<br>• 放弃改动时并入已有检测（`03` L77，`10` L763）；<br>• `nested_repo_live` 消失 → `paused(human)`（`03` L72）；<br>• 用例 G33b、G36e、G36g（`14` L110、L119、L121）。<br>**引入的新矛盾**：<br>• 继续目标的字段形状不一（`06` L839、`07` L1379/L1469 为 `verify{pin, verifyFrom}`，`02`/`03`/`16` 为 `verify{pin}`）；<br>• `claim_on_behalf` 的去向三处不一；<br>• `run` 目标没有载荷。<br>见 R16-D4-01 |
| R15-D4-02 | 已解决 | “只考察 E 中的路径”已落在 `03` L89、`06` L844、`07` L1472、`10` L246、`04` §4.8.7，用例 G36b(h)（`14` L116）。`16` L126 的决定说明仍是旧口径，归入 R16-D15-01 |
| R15-D5-01 | 部分 | **已落地**：<br>• 压缩后重新计时（`05` L564，C34，G35c(l)）；<br>• 守卫不成立的 settle 行（`05` L581）；<br>• `RunOpening`/`inject`（`05` L88–100、L148–151）；<br>• RPC 通道行（`05` L641）。<br>**残留**：<br>• 新 settle 行把 `draining`、`outcome ≠ completed` 也映射为 `idle_without_submit`（R16-D6-01）；<br>• 交还开场与 §5.2.1 矛盾，唤醒后仍以 `prompt` 续跑，命令名唯一性未登记（R16-D5-01） |
| R15-D6-01 | 部分 | **已落地**：<br>• 每次 bash 调用一行 `bash_process_groups`（`05` L371，`06` L188、DDL L574，`10` L263，`13` L320）；<br>• I2 断言收窄为 `cause:"fingerprint_changed"`（`06` L256）；<br>• `settling` 的下一步唯一（`06` L185，`10` L237）。<br>**残留**：组长先退出时的处理会漏掉组内存活者（R16-D6-02） |
| R15-D7-01 | 已解决 | `Checkpoint.mixedPaths` 与 DDL `mixed_paths`（`10` L555–556，`06` `checkpoints`）；作者推导顺序（`10` L556，`16`）；误判 (c) 用例 G36b(i) |
| R15-D8-01 | 已解决 | `StopCondition.id`（`02` L287，`16` L267）；卡片 §4.8.10（`04` L909–925）；三个出口的命令（`08` L196、L487）；`09` L333 的 L9；`08` L488 的 `obsolete` 改为本地 base。新发现的再次触发问题见 R16-D8-01 |
| R15-D11-01 | 已解决 | `16` L154–155：判定顺序、判例表、默认良性条目 `(credential, write, ~/.ssh/known_hosts)`；lint (x) 已覆盖 |
| R15-D13-01 | 部分 | **已落地**：<br>• 重新 seal 的分支规则（`06` L872，`10` §10.12），用例 G40（`14` L122）；<br>• `:(exclude)` 循环（`10` L95、L525，`07` L258）。<br>**残留**：超过上限时仍标为 `verify_env_error`，第 15 轮期望的是以 `nested_repo` 阻断；`running` 中检查点失败的转移未定义（R16-D13-01） |
| R15-D14-01 | 部分 | **已落地**：<br>• G33b 重写、G36f(b)/(b′)、G36b(i)；<br>• 增人 31 周并计入安全线（`14` L311）；<br>• 冻结前缓冲完整（L309）；<br>• ADR-059 表（`15` L398）、ADR-038 当前值（`15` L271）。<br>**残留**：ADR-135 的若干新规则没有用例（R16-D14-01） |
| R15-D15-01 | 部分 | #1、#2、#4、#5、#6、#8 已修正，lint 已扩展 (r)(x)(y)(z)。<br>**残留**：<br>• #3：`03` L60 仍写“/ PR 合并”；<br>• #7：`00` L91 的自相矛盾句原样未改。<br>见 R16-D15-01 |

**合计**：已解决 4，部分 6，未解决 0。

### 3.1 ADR-134 的逐原因推演（`03` §3.2.1 × `06` §6.4.3 × `07` §7.10.3 × `10` §10.3.1/§10.8.4 × `16` L28）

| 原因（进入状态 → 继续目标） | 出口命令与改写 | 结果 | 问题 |
|---|---|---|---|
| `human`（running → `run`；claimed/verifying → `verify`） | `resume` 只解除 | ✓ | — |
| `human`（接管：running → `run`；in_review/accepted → `review`；paused(*) → 保持） | `hand_back` 写 `pendingHandBack`；`take_external` 不写 | ✓（G33b、G36g(d)） | `reverify` 没有 `returnTo`，验收延续的依据不明（R16-D4-01 第 3 项） |
| 同上，`discard_human_edits` | running → 保持 `paused(human)`；in_review/accepted → 分类后解除；paused(*) → 解除 `human` | 部分 | 从 `paused(human)` 接管后放弃改动，会自动开 Run（R16-D4-02 第 4 项） |
| `budget_soft_cap`（`run`） | `resume` / `budget.extend` | ✓ | — |
| `budget_hard_cap`（`run`） | `budget.extend` 即解除；`claim_on_behalf` → `verify_new{human_change}` | 冲突 | `03` 写“extend 后 resume”（R16-D4-02 第 5 项）；`claim_on_behalf` 见 R16-D4-01 第 2 项 |
| `stop_condition`（`run`） | `resume{feedback?}` | ✓ | 同一条件是否再次触发未定义（R16-D8-01） |
| `idle_without_submit`（`run`） | `resume` 改写为 `run`；`claim_on_behalf` | 冲突 | 同上；`03` L55/L81 仍写“一次提醒后” |
| `verify_failed_limit`（`verify`） | `resume` 改写为 `run`；`retry_verify` 改写为 same/new | 部分 | `run` 不带返工语义与人的 `note`（R16-D4-01 第 1 项） |
| `sentinel_high`（verifying → `verify`） | `override` 改写为 `review`，再经守卫 | ✓（G36g(c)） | 返工出口 `request_changes` 不按统一写法，直接 `run.requested{rework}`（R16-D4-01 第 1 项） |
| `sentinel_high{nested_repo_live}`（running → `run`） | `resume` 改写为 `run`；消失且唯一 → `paused(human)` | 部分 | 不是唯一原因时，消失后可能被自动继续（R16-D4-02 第 6 项） |
| `human_change_verify_failed`（`verify`） | `retry_after_human_change` 改写为 `run` | 冲突 | 延后执行时以 `tower.resume` 开场，丢失 `tower.handback`（R16-D4-01 第 1 项） |
| `verify_env_error`、`s0_grant_pending`（`verify`） | `retry_verify{same}`；`grant` 只解除；`deny` 改写为 `review` | ✓（G36g(b)） | — |
| `question_timeout`（`run`） | `resume` | ✓ | — |
| `post_settle_activity`（`verify`） | `resume` 改写为 `run`；`retry_claim` 改写为 `settle` | 冲突 | `settle` 的定义跳过宽限确认，而 `retry_claim` 的本意就是重做宽限（R16-D4-02 第 2 项） |
| `external_change`（任意） | `keep` 把 `verify`/`review` 改写为 `verify_new`；`revert` 不改写 | ✓（G36b、G36g） | `run`/`settle` 下 `keep` 的告知与失败去向（R16-D7-01）；drain 期间的持久化（R16-D6-01） |
| `provider_unavailable`、`satellite_missing`（`run` 或升级前状态） | 自动解除 | ✓（G36g(a)） | — |
| `app_quit`、`engine_crash`（`run`） | `resumeOnLaunch` | 部分 | drain 中途崩溃时改写原因（R16-D6-01）；settle 序列中退出时目标是 `run` 还是 `settle` 未定义（R16-D4-02 第 3 项） |
| `claimed` 中进入（`verify{pin}`） | — | 部分 | pin 在进入 `claimed` 之后才生成，这段窗口内没有 pin 可写（R16-D4-02 第 1 项） |
| 叠加：重启 | `paused` 恢复行（`06` L136） | ✓（G33b、G36f(a)） | — |

---

## 4. 追问清单（新增与残留）

编号 `R16-D<维度>-<序号>`。严重度：**阻断** / **重要** / **次要**。

### D4 领域模型与生命周期

**R16-D4-01｜重要**（ADR-134 统一出口之后，继续目标的语义有三处缺口）

- **问题**：
  1. **继续目标 `run` 没有载荷，延后执行时会丢掉命令自带的开场。**
     - `onAllReasonsCleared()` 对 `run` 只发 `run.requested{resume}`（`06` L823、`07` L1490）。默认开场是 `tower.resume`（`06` L100）。
     - 但以下几条命令都自带开场，或者自带返工语义：
       - `retry_after_human_change`：“Run 以 `inject(tower.handback)` 开始”（`06` L849）；
       - `goal.resume{note}`：“`note` 在 Run 开始时以 user 角色发送”（`06` L840）；
       - `verify_failed_limit` 的 `resume`：本质是返工。
     - 这些命令“只解除本原因”，`alsoApplies` 非空时 Run 被延后，例如接管期间检测到的 `external_change`、预算原因。等到最后一个原因解除，`run` 目标不知道该用哪个开场。
     - 后果是人的改动说明（“不得回退这些改动”）与人写的转向都会丢失。`pendingHandBack` 用 `decisionId` 解决过同样的问题（`02` L162），`run` 目标没有。
     - 另外，`paused(sentinel_high)` 的返工出口是 `request_changes`（`03` L83）。但 `06` L873 只写 `run.requested{rework}`，不按 L823 的统一写法，有剩余原因时会绕过唯一转移函数离开 `paused`。
  2. **`claim_on_behalf` 的去向在三处互相矛盾。**
     - `03` L81 写“→ `claimed`”。`03` I4（L109）写“绕过有效提交与 `agent_settled`，**直接进入 `claimed`**”，随后走 Agent 路径：`trigger:"claimed"`，失败自动返工。
     - `03` L69、`06` L845、`16` L28 写的是改写为 `verify_new{origin:"human_change"}`。按 `07` L1487，这意味着：
       - `trigger` 为 `fp_changed_human`；
       - 失败**不自动返工**，进入 `paused(human_change_verify_failed)`；
       - 而后者的出口 `retry_after_human_change` 会注入一条“人改动的文件”为空的 `tower.handback`。
     - 两种语义的失败去向相反，实现者无法选择。并且后一种把 Agent 的工作标成“由人的改动触发的验证”，与诚实语法冲突：内容来源是 Agent，人只是代为提交。
  3. **`verifyFrom` 的写入点没有定义。**
     - `Continuation.verify` 不另存源状态，取 `Goal.verifyFrom`（`02` L57，`16` L27）；`verify_new` 的源状态是 `returnTo ?? Goal.verifyFrom`。
     - 但 `Goal.verifyFrom` 只定义为“当前或最近一次验证的源状态”（`02` L167），在哪个事件上写入没有规定。G36c(a) 断言暂停于 `claimed` 时 `verifyFrom = claimed`，正文却没有这条规则。
     - 由此产生三个问题：
       - `claim_on_behalf` 从运行类原因改写出的 `verify_new` 没有 `returnTo`，会继承一个陈旧值，可能是数轮之前的 `accepted`/`in_review`。这会影响 `decide` 的验收延续判定，以及 `onlyChangedUnits`（`07` L1435–1437）。
       - `pendingHandBack.reverify` 没有 `returnTo`（`03` L70，`06` L848）。从 `accepted` 接管并交还后，是否适用验收延续不确定。
       - `06` L839 与 `07` L1379/L1469 把 `verifyFrom` 写进了继续目标，与 `02`/`03`/`16` 不一致。
- **为什么重要**：
  - 第 1 项会在叠加原因下静默丢失“不要回退人的改动”，这正是交还消息存在的理由。
  - 第 2 项是同一命令的两种相反失败语义。
  - 第 3 项影响验收延续，即“人已验收的内容是否需要重看”。
  - 三者都在 ADR-134 自称已统一的路径上。
- **文档位置**：`02` L57–59、L162、L167；`03` L69–70、L81、L83、L109；`06` L100、L823、L839–840、L845、L848–849、L873；`07` L1379、L1435–1437、L1469、L1487–1490；`16` L27–28；`14` G36c(a)。
- **期望的回答形态**：
  - `{kind:"run"}` 增加 `{reason: "resume" | "rework" | "handback", decisionId?}`。延后执行时按 `decisionId` 取开场：`tower.handback`、`resume.note`、返工证据或 `request_changes` 的评论。
  - `goal.request_changes` 在 `paused(sentinel_high)` 中按统一写法处理：解除本原因，改写为 `run{rework}`。
  - 裁决 `claim_on_behalf`：建议改写为 `verify_new{origin:"agent_submit", returnTo: undefined}`，源状态固定为 `claimed`，失败走 Agent 路径，Trace 记“人代为提交”。同步改 `03` L81、I4、`06`、`07`、`16`。
  - 规定 `verifyFrom` 的写入点：进入 `claimed` 时写 `claimed`；`verify_new` 的 `returnTo` 为空时源状态取 `claimed`，不取旧值；`reverify` 的 `returnTo` 取 `takeoverFrom ∈ {in_review, accepted}`。
  - 删去 `06`/`07` 继续目标中的 `verifyFrom`。
  - 增加用例：
    - G33c (a)：`human_change_verify_failed` 叠加 `external_change` 时 `retry_after_human_change`，之后 `keep`，断言开场为 `tower.handback`；
    - G33c (b)：`budget_hard_cap` 下 `claim_on_behalf` 失败，断言自动返工；
    - G33c (c)：从 `accepted` 接管并以 `reverify` 交还，断言验收延续。

**R16-D4-02｜次要**（继续目标的六个边角组合）

- **问题**：
  1. **`claimed` 中没有 pin 可写。**
     - settle 序列是先进入 `claimed`、**随后**生成 pin（`10` L259，`06` L185）。
     - 这段窗口内检测到外部写入，或者人暂停，继续目标 `verify{pin}` 的 `pin` 是必填字段（`02` L57），此时无值可写。
     - G36c(a) 只测试了“pin 已生成”的情形。
  2. **`retry_claim` 与 `settle` 的定义冲突。**
     - `06` L842 写 `retry_claim` 改写为 `settle`，“重新做 ADR-025 宽限确认后进入 `claimed`”。
     - 但 L823 定义 `settle` 为“`agent_bg_done` → I4 → `claimed`”，没有宽限确认。
     - 而 `post_settle_activity` 正是因为宽限后又出现活动才暂停的。
  3. **settle 序列中由其他原因进入暂停时，目标是 `run` 还是 `settle` 不确定。**
     - ADR-134 写“从 settle 序列中进入 → `settle`”，`03` L68 同。
     - 但 `06` L839 的 `goal.pause` 只写“running → `run`”；`app_quit` 被归为“含 Run 中的 `app_quit`”的 `run`。
     - 人在“等待后台进程”的 10 s 内暂停或退出时，按 `run` 恢复会丢掉有效提交，并对已提交的 Agent 说“请继续”。
  4. **从 `paused(human)` 接管后放弃改动，会自动开 Run。**
     - 接管时“原原因进入 `alsoApplies`”（`10` L685），而原原因本身就是 `human`，`PauseReason` 是集合。
     - `discard_human_edits` 对 `takeoverFrom = paused` 解除 `human`（`06` L850，`10` L763），于是全部原因清空，`onAllReasonsCleared()` 执行 `run`。
     - 这违反同一段落的承诺“**不会在人未要求时开 Agent Run**”（`10` L763）。
  5. **`budget.extend` 与 `resume` 的关系不一致。**
     - `06` L881：硬上限提高到用量之上即解除 `budget_hard_cap`，唯一原因时立即开 Run。
     - `03` L79、`06` L338、`04` L1371 写的是“扩展预算**后** `resume`”。
     - 人可能只是想先提高额度，再决定是否继续。
  6. **`nested_repo_live` 例外的适用范围太窄。**
     - 例外只在“唯一原因”时生效（`03` L72）。理由是“条目被谁删除并不清楚”，这一理由与是否唯一无关。
     - 叠加 `provider_unavailable` 时，条目消失后若 provider 自动恢复，Goal 会不经人确认就继续。
- **为什么重要**：第 4、5 项违反“不会在人未要求时开 Agent Run”；第 1、2 项的字段或步骤不可实现。
- **文档位置**：`02` L57；`03` L68、L72、L79；`06` L185、L338、L823、L839、L842、L850、L881；`10` L259、L685、L763；`04` L1371；`14` G36c(a)。
- **期望的回答形态**：
  - `Continuation.verify.pin` 改为可选，缺省时以 `agent_bg_done` 检查点生成 pin；
  - 增加 `{kind:"claim"}`，含宽限确认，供 `retry_claim` 使用；或者把宽限确认写进 `settle`；
  - 写明“settle 序列”覆盖 settle 期间进入的**任何**暂停；
  - `take_over` 自 `paused(human)` 时把原 `human` 标为 `human(pause)` 保留，或者规定放弃改动后一律停在 `paused(human)`；
  - 二选一：`budget.extend` 不解除原因、由 `resume` 解除；或者改 `03`/`04` 的文字；
  - `nested_repo_live` 消失时一律在剩余原因中加入 `human`；
  - 各配一条用例。

### D5 Agent 架构与 Pi 集成

**R16-D5-01｜次要**（ADR-135 的落地残留）

- **问题**：
  1. **nudge 的窗口仍锚定“最后一条 user 消息”。**
     - tower-goal 的 nudge 条件是：最后一条 user 消息之后没有有效 submit，且 `tower.nudge` 数小于上限（`05` L1055、L1057）。
     - ADR-135 之后，返工、恢复、交还 Run 都以 `tower.*` custom message 开场，不再产生 user 消息。于是：
       - 上一个 Run 的有效 submit 仍在窗口内，tower-goal 判定“已有提交”而不 nudge。Supervisor 却按“本 Run”（`03` I4）判定没有有效提交，走 `05` L581，直接 `idle_without_submit`。
       - 多个返工 Run 累计的 nudge 数也算在同一个窗口里。
     - 主路径上的“返工后忘记重新提交”因此总是变成 Needs-You。
  2. **交还开场与 §5.2.1 矛盾。**
     - `05` L99 规定：有 `human` 部分时，`tower` 部分以 `triggerTurn:false` 先追加，再以 `prompt` 发人的文字。
     - `05` L1166 却写 `inject(tower.handback, {triggerTurn:true})`，再发 `opening.human`。照此实现，第二步时 run 已在流式中，`prompt` 会抛 `EBUSY`。
     - 另外，人的意图同时出现在 `tower.handback` 正文与 user 消息中，重复了一次。
  3. **`tower.rework` 有两条注入路径。**
     - `05` L916 ②：`before_agent_start` 在 `episodic` 文件存在且分支上没有同 key 消息时，返回 `tower.rework`/`tower.handoff`。
     - §5.8 又以 `inject(tower.rework, {triggerTurn:true})` 开场。
     - 在 `_prepareRun` 中，`before_agent_start` 先于触发消息写入会话（`agent-session.ts` `_prepareRun`）。按“分支上没有同 key”去重时看不到触发消息，同一个 Run 会出现两条返工证据。
  4. **`/tower-inject` 依赖命令名唯一，这一前提没有登记**（文首核对，`runner.ts` L814–845）。
     - 任何已加载的扩展注册了同名命令，两者都会被改名。Tower 发出的文本会作为 user 消息进入会话，流式中则报错。
     - 后果是 Tower 的话以 user 角色出现，正是 ADR-135 要排除的情形。
     - 另外，“命令处理器在同一 stdin 序列中执行，顺序确定”（`05` L641）只在两种条件之一成立时才对：Tower 等到该 `prompt` 的 `handled` 响应后再发下一条命令；或者处理器同步读取文件并同步调用 `sendMessage`。原因是 RPC 的 `prompt` 以 `void` 调用。
  5. **唤醒后的续跑仍以 `prompt` 发出。** `06` §6.1.5 L109 写“Supervisor 自动用 `prompt` 继续一次”，这是 Tower 发起的 user 消息，与 ADR-135 相违。
- **为什么重要**：
  - 第 1 项把一个本可自动处理的常见情形变成人的打扰。
  - 第 2、3 项照文实现会报错，或者重复注入。
  - 第 4、5 项让 Trace 中出现不是人写的 user 消息，违反诚实语法。
- **文档位置**：`05` L99、L641、L916、L1049–1057、L1166、L581；`06` L109；`03` I4 L109；C35 L1394。
- **期望的回答形态**：
  - nudge 的窗口改为“本 Run 的第一个条目之后”。tower-goal 在 `before_agent_start` 记下起点，`messageType:"custom"` 时同样记录，并补契约测试。
  - `05` L1166 改为 `triggerTurn:false` + `prompt(human)`，并删去 `tower.handback` 中的意图正文，或者删去 `opening.human`，二选一。
  - 返工证据只保留一条路径。若保留 `before_agent_start` 路径，则在 `event.messageType === "custom"` 且 `event.message.details.key` 相同时跳过。
  - D55 增加前提：RPC 握手后以 `get_commands` 确认 `tower-inject` 恰好出现一次且 `sourceInfo` 属于 tower-goal，否则不启动 Run；`prompt` 响应的 `disposition ≠ "handled"` 视为投递失败，终止该 Run 并记 `engine.error`；Tower 在收到响应后才发下一条命令。C35 增加同名命令一例。
  - §6.1.5 的续跑改为 `inject(tower.resume{reason:"wake"}, {triggerTurn:true})`。

### D6 系统架构与可靠性

**R16-D6-01｜重要**（drain 的目的原因没有持久化）

- **问题**：从 `running` 进入任何暂停都先 drain（`06` §6.1.4 L86–97），drain 期间 Goal 仍是 `running`。但 drain 的目的原因不是持久状态，于是：
  1. **settle 表把 draining 映射为 `idle_without_submit`。**
     - 新增的 settle 行写：“没有有效 submit，且 nudge 守卫不成立（……`outcome ≠ completed`、draining 等）→ 直接 `idle_without_submit`”（`05` L581）。
     - 人暂停、预算上限、外部写入、`nested_repo_live`、依赖回退、应用退出引起的 drain，都以“无有效提交 + draining”结束。按此行会全部变成 `idle_without_submit`，与 `06` L839 的 `paused{human}`、`goal.take_over` 的“先 drain”，以及 `05` L580 上方那行“按 abort 的原因决定”冲突。
     - provider 重试耗尽（`outcome ≠ completed`）也会落入此行，而不是 `provider_unavailable`。
  2. **drain 中途崩溃或退出会改写原因。**
     - 恢复表只给出 `paused{app_quit 或 engine_crash}` 加 `autoResume`（`06` L139、L64）。
     - 人在 drain 的约 8 s 内（graceMs）退出应用（`06` L84 的确认框同样走 drain），或者 Host 崩溃，结果是：
       - “人暂停”变成下次启动自动恢复；
       - 接管意图丢失；
       - 已检测到的外部写入在恢复前被 `safety` 检查点吸收（`06` L64），之后按 Agent 归因进入工作与 pin。这违反 ADR-122 的“来源不明的内容不会先被验证或评审”。
     - drain 进行中又收到第二个暂停请求（例如先暂停、再退出；人暂停的 drain 中检测到外部写入）时，以哪个为准也没有定义。
  3. **运行中检测外部写入时违反 `CHECK`。**
     - `10` L236 写“检测时**立即**把 E 并入 `externalChange.paths`；Run 以 abort 方式 drain……随后进入 `paused(external_change)`”。
     - 而 `06` L474 要求 `external_change` 列非空当且仅当 `pause_reason`/`also_applies` 含 `external_change`。drain 期间 Goal 是 `running`，`pause_reason` 为空，投影 `goal.external_change.detected` 会被 SQLite 拒绝。
     - 实现者只能二选一：提前写会违反约束；只放在内存里会在崩溃时丢失（第 2 项）。
- **为什么重要**：
  - 第 1 项会让每一次人暂停都显示为“Agent 停下而未提交”，Needs-You 与卡片都会出错。
  - 第 2 项在用户常见的“暂停后马上退出”操作下，违背人的显式决定；外部写入会以 Agent 的名义进入验证。
  - 第 3 项是文档内规则与 DDL 不可同时满足。
- **文档位置**：`05` L578–581；`06` L64、L84–97、L139、L474、L839、L847；`10` L236；`03` L55。
- **期望的回答形态**：
  - 引入持久的 `goals.draining_for = {reason, decisionId?, externalChange?}`，在 drain 开始的同一事务中写入。
  - `CHECK` 改为“`external_change` 非空 ⇔ 原因含 `external_change` **或** `draining_for.reason = 'external_change'`”。
  - drain 结束时以 `draining_for.reason` 进入 `paused`。第二个请求按 `16` §16.1.1 的优先级合并进同一个 drain，较低者进 `alsoApplies`。
  - 恢复表的“Run 在 drain 中途”一行改为：有 `draining_for` 时进入该原因，`app_quit`/`engine_crash` 只作为 `alsoApplies`，不触发 `autoResume`。
  - settle 表的守卫行限定为“非 draining、`outcome = completed`”；`draining` 与 `outcome ∈ {aborted, error}` 回到“按 abort 原因 / provider 规则”。
  - 增加用例：G35e：
    - (a) 暂停后 2 s 内退出，重启后仍是 `paused(human)`，不自动恢复；
    - (b) running 中检测外部写入，在 drain 中杀掉 Host，重启后为 `paused(external_change)`，E 不被记为 Agent；
    - (c) 人暂停的 drain 中触发 `budget_hard_cap`。

**R16-D6-02｜次要**（每次 bash 调用的进程组：组长先退出）

- **问题**：
  - 重启时“`bash_process_groups` 中的每一行：组长身份匹配 → 按组终止；不匹配 → 删除该行”（`06` L138，`10` L263）。
  - 但 Pi 式 `detached` 的组长就是 shell 本身。最常见的后台启动方式是让 shell 把命令放到后台后立即退出，此时组长已不存在，组内存活者仍在原组中。
  - 按现行规则，这一行被删除，存活者不被终止。而这恰恰是 ADR-135 要覆盖的“未满 5 s、未单独持久化”的进程。G35c(j) 的“前者被终止”在这种启动方式下不成立。
  - POSIX 保证：进程组仍有成员时，其 id 不会被复用为新的 pid 或 pgid。所以组长退出并不妨碍安全地按组终止。
- **为什么重要**：这是第 15 轮 R15-D6-01 修复所依赖的机制。漏掉的进程在重启后继续写卫星，会被判为来源不明的外部写入（已知误判 (b) 的一个可避免来源），并且继续占用端口。
- **文档位置**：`05` L371；`06` L138、L188；`10` L263；`13` L320；`14` G35c(j)。
- **期望的回答形态**：
  - 身份确认改为“开机会话相同，且该 pgid 下存在至少一个启动时间不早于该行写入时间的进程”。macOS 以 `proc_listpgrppids` 枚举成员，逐个按 `(bootSession, pid, startTime)` 确认后 `killpg`；组内没有成员时删除该行。
  - G35c(j) 增加“shell 已退出、后台子进程留在原组”的变体。

### D7 诚实与验证

**R16-D7-01｜次要**（在 `run`/`settle` 目标下采纳外部改动）

- **问题**：
  - `keep` 在 `run`/`settle` 目标下不改写目标，“采纳的内容随后进入 Agent 的工作与 pin”（`03` L89，`10` L245，`04` §4.8.7）。但设计中没有任何机制告诉 Agent：这些路径刚刚被人采纳为人的改动。
    - 恢复开场是通用的 `tower.resume`（`06` L100）；`settle` 目标则根本不开 Run。
  - 对比交还：`tower.handback` 明确要求“不要回退这些改动”（`05` L1166）。
  - 结果有二：
    - `run` 目标下，Agent 可能在不知情时覆盖人刚采纳的内容；
    - `settle` 目标下，采纳的内容以 `trigger:"claimed"` 验证，失败按 Agent 路径**自动返工**（`07` L1458）。这正是 `03` L58 与 `07` L1460 要避免的“自动让 Agent 改人改过的代码”。
  - 同样，`revert` 撤销了 `mixedPaths` 上 Agent 的编辑之后，Agent 也不会被告知。
- **为什么重要**：同一类“人的显式采纳”，在交还路径上受保护，在外部改动路径上不受保护；卡片“将作为你的改动写入提交”的承诺会被 Agent 的后续编辑悄悄改写。
- **文档位置**：`03` L58、L89；`04` §4.8.7；`05` L1166；`06` L100；`07` L1458–1460；`10` L245–246。
- **期望的回答形态**：
  - `keep`/`revert` 在 `run` 目标下给下一次开场附加 `tower.external_resolved{kept:[…], reverted:[…], mixed:[…]}`（≤ 120 token），要求“不要回退已采纳的路径”。
  - `settle` 目标下 `keep` 时，把本次验证的 `verifyOrigin` 记为 `human_change`；或者在失败时只对不涉及采纳路径的失败自动返工。二选一后写入 `07` 的组合表。
  - G36b(a) 增加断言。

### D8 注意力与交互

**R16-D8-01｜次要**（停止条件的求值与再触发）

- **问题**：
  - `stop_condition` 卡片有三个出口（`04` §4.8.10，`08` L196），但条件本身的语义未定义：
    - `path_touched`/`command_matches` 在 gate 中命中后是 block、drain 还是放行后暂停（`05` §5.6.5 gate 只列出 `policy.stop` 字段）；
    - `natural` 类怎样被判定为命中；
    - M1 实现哪几类（`07` L1176 只提到 `no_progress_for`）。
  - 更直接的缺口是：选“继续”或“这里不该停”之后，同一条件是否立即再次触发。例如 `path_touched: migrations/**` 在下一次编辑同目录时会再次暂停；`no_progress_for` 在计时器到期后会再次暂停。去重键把这些合并为一张卡，但 Goal 会反复停下。
- **为什么重要**：一个人刚判为误报的条件，若随即再次暂停 Agent，就违反了 Needs-You 纪律中“人的决定应当生效”的要求，标注统计也会被重复计数。
- **文档位置**：`02` L287–292；`04` L909–925；`05` §5.6.5（gate 第 1–4 步）；`07` L1176；`08` L196、L487；`09` L333。
- **期望的回答形态**：
  - 在 `07` 或 `05` 写明每类条件的求值点与命中动作。
  - 规定再武装规则，例如：“继续”只对本次命中的对象（路径或命令）静默到本 Run 结束；“这里不该停”对该条件静默到合同修订。
  - 写明 M1 实现的种类，并加一条用例。

### D13 隔离、git 与并发

**R16-D13-01｜次要**

- **问题**：
  1. **超过上限时的标签与转移**（R15-D13-01 第 2 项的残留）。
     - 超过 64 条或 64 次时“按基础设施错误处理（`verify_env_error{stage:"integrity"}`）”（`10` L95，`07` L1350）。
     - 但 `verify_env_error` 的标准出口是“修好环境后以同一 pin `retry_verify`”（`03` L85），对 Agent 放置的条目无效；其入口也只来自 `verifying`。
     - 运行中的回合检查点同样会失败，而 `running → paused(verify_env_error)` 不在转移表中。
     - 这仍属于“Agent 可控内容导致验证拒绝服务、且原因被误标为环境故障”一类。
  2. **观测到旧 seal 合入时，Goal 已有更新内容。**
     - 规则是“无论 Goal 处于何种非终态……进入 `integrated`”（`10` §10.12，`06` L133），只对未解除的 `external_change` 做 safety 检查点并列入摘要。
     - 在 M1，合并由用户自己完成（④′）。用户合入的可能是**上一次**验收的分支，而 Goal 此后已经离开 `accepted`：交还、`keep`、返工。此时以下几种情形没有去向：
       - Goal 处于 `paused(human)` 且有人工编辑检出：转为 `integrated` 违反 `06` L471 的 `CHECK`；
       - Goal 处于 `running`：有活跃 Run；
       - Goal 处于 `verifying`/`in_review`：已采纳但尚未 seal 的新内容，会随 24 h 后的归档与清理一起消失。
- **为什么重要**：第 1 项让一道 severity 3 闸口退化成人无法照提示处理的故障；第 2 项是 ④′ 之后 M1 的常见操作，可能静默丢掉人已采纳的改动。
- **文档位置**：`03` L60、L85；`06` L133、L471；`07` L1350；`10` L95、L250、§10.12；`14` G26d(c)、G36c(c)(d)。
- **期望的回答形态**：
  - 超过上限时以 `nested_repo`（列出已拒绝的路径，“删除这些条目”为唯一出口）阻断 Verified；`running` 中按 `nested_repo_live` 的路径进入 `paused(sentinel_high)`；不使用 `verify_env_error`。
  - 观测到的 seal 不是**最新**一次验收的 seal，且 Goal 在此之后有新内容时：
    - 记 Fact `local_merged{seal}`；
    - 不进入 `integrated`；
    - 若 Goal 当前在 `accepted`，则不经 I2 直接停在 `in_review`，提示“base 已含较旧版本”；
    - 人工编辑检出与活跃 Run 保持不变。
  - 增加 G36c(e)。

### D14 路线图与可验证性

**R16-D14-01｜次要**

- **问题**：以下规则在正文中有定义，在 `14` 的 G 系列与 `05` 的 C 系列中没有用例：
  1. `05` L581 的“nudge 守卫不成立 → 直接 `idle_without_submit`”；
  2. SDK 下 Tower 发起的 Run 不出现 user 消息、Trace 标“Tower 注入”（C35 只覆盖 RPC）；
  3. `stop_condition` 的三个出口，以及修订合同后去重键不变；
  4. `goal.resume` 对 `verify_failed_limit`/`idle_without_submit`/`post_settle_activity` 的改写、`retry_claim` 改写为 `settle`、`claim_on_behalf` 改写为 `verify_new`；
  5. 本轮 R16-D4-01、D4-02、D5-01、D6-01、D6-02、D13-01 的新规则。
- **复核说明**（不扣分）：
  - **WBS**：各行之和为 111.15，各行的人周与“主责”分列之和逐行相等。第 15 轮增量为：W3 +0.8、W4 +0.1、W6 +0.6、W7 +0.6、W9 +0.2、W10 +0.05、W12 +0.5、W13 +0.7、W15 +0.15，合计 3.7，与去重表（`14` L286–299）逐项一致。
  - **角色合计**：Agent 23.85、系统 23.55、桌面 25.25、设计 26.45、安全 12.05。扣除 M0 先行（0.4/0.1/1.8/3.0/0.5）后乘 1.1，得 25.795 ×4 与 25.41（安全线按 0.5 人）。
  - **工作周**：第 1–6、9–13、15–31 周共 28 个工作周，减 2 周缓冲为 26。余量为四条全职线各 0.2、安全线 0.59，均成立。
  - **与第 14 轮的衔接**：上一轮所需工作周 24.92/24.92/24.75/24.86/24.75，加本轮增量 ×1.1（安全 ×2.2），结果与表一致。上一轮余量折合人周为 0.07/0.07/0.23/0.13/0.11，合计 0.61。顺延 1 周增加 4×0.91 + 0.45 = 4.09，4.70 ≥ 3.7。
  - **日期**：2026-11-09 为周一；第 7–8 周为 12-21 至 01-01，第 14 周为 02-08 至 02-12；第 27 周周五为 2027-05-14，第 31 周周五为 2027-06-11，第 35 周周五为 2027-07-09；M2 加 14 周至 2027-10-15。全部成立。
  - **增人备选**：(4×25.8 + 12.71) = 115.91 ≤ 5.5T − 2，得 T ≥ 21.44。安全线 0.5 × 21.44 ≈ 10.72，差额约 2.0 人周由新人承担。24 个工作周对应第 27 周冻结、M1 = 31 周。成立。
  - **甘特**：各线 QA 在第 28–29 周结束（第 29 周末累计 26 个工作周），第 30–31 周为完整缓冲，与“余量 0.2”一致。
- **为什么重要**：rubric 只承认带验收条件、可执行的验证计划。另外，本轮各项修订若落在系统或 Agent 线上，两线余量各只有 0.2 工作周；按 ADR-136 须显式选择 ③ + ⑤ 或再顺延，并记 ADR。
- **文档位置**：`14` §14.2、§14.3.4；`05` §5.11 C 系列。
- **期望的回答形态**：
  - 为上述 1–5 各加用例，或在现有用例中加分组：
    - 1 → G35c(m)；
    - 2 → C36（SDK）；
    - 3 → G41；
    - 4 → G33c；
    - 5 按各条的期望回答形态。
  - 本轮工作量按 WBS 行去重后记入 ADR-133 补记。

### D15 文档一致性与可执行性

**R16-D15-01｜次要**

- **问题**：以下各处均已逐处核对。
  1. **继续目标的字段形状**：
     - `06` L839 写 `continuation={kind:"verify", pin, verifyFrom}`；
     - `07` L1379、L1469 写 `{kind:"verify", pin, verifyFrom}`；
     - `02` L57、`03` L68、`16` L28 写 `verify{pin}`，源状态不另存。
  2. **`claim_on_behalf`**：`03` L81（→ `claimed`）、I4 L109（直接进入 `claimed`），与 `03` L69、`06` L845、`16` L28（`verify_new`）不一致（见 R16-D4-01）。
  3. **`idle_without_submit` 的入口**：`03` L55、L81 仍写“一次提醒后”，与 ADR-135 的“守卫不成立时直接暂停”不符。
  4. **交还开场**：`05` L1166 与 L99 不一致（见 R16-D5-01）。
  5. **`settle` 与 `retry_claim`**：`06` L823 与 L842 不一致（见 R16-D4-02）。
  6. **`budget_hard_cap` 的出口**：`03` L79、`06` L338、`04` L1371 与 `06` L881 不一致。
  7. **`16` L126 `HumanDecision.kind` 的说明**仍写 `revert`“之后树 ≠ 基线时剩余差异按归因表分类”“再按通用的原因解除规则继续”，即 ADR-128 的旧口径，与 ADR-134 及 `16` L309 自己的废弃行冲突。
  8. **第 15 轮残留**：
     - `03` L60 的 `accepted → integrated` 仍写“/ PR 合并”，没有标 M2（R15-D15-01 #3）；
     - `00` L91 仍是“推送与开 PR **只由 Tower 执行**……由你自己推送”（R15-D15-01 #7，未改）。
  9. **唤醒后续跑**：`06` L109 以 `prompt` 续跑，与 ADR-135 不一致（见 R16-D5-01）。
  10. **lint 覆盖不到上述问题**：
      - (r) 没有比对 `Continuation` 各处的字段形状；
      - (z) 不扫描 `03` 状态表与 `00` 中的“PR”；
      - 没有检查“同一命令在 `03` 出口列与 `06` 命令行中的去向一致”。
- **为什么重要**：第 1、2、4、5 项是实现者照抄就会出错的分支；第 7 项出现在注册表中，而注册表是唯一来源。
- **文档位置**：如上。
- **期望的回答形态**：
  - 逐条修正。
  - lint 增加以下检查：
    - `Continuation` 的字面形状必须等于 `02` L54–59；
    - `03` §3.2.1 “命令 / 守卫”列中出现的每个命令，其改写目标与 `06` §6.4.3 对应行一致；
    - (z) 扩展到 `00` 与 `03` §3.2。

---

## 5. 结论

- **是否所有维度为 100：否。**
  - D1、D9、D10、D11、D12、D16 为 100，在这六个维度上没有找到可追问的实质问题。
  - 其余维度在 92–98 之间。最低为 D4（92），其次是 D6（93）与 D15（95）。
- **是否还有可追问的问题：有。**
  - **第 15 轮核验**：共 10 条，已解决 4、部分 6、未解决 0；lint 全部通过；D55/D56 与源码一致；排期算术全部成立。
  - **本轮追问**：新增与残留共 **10** 条。
    - 阻断 0；
    - **重要 2**：R16-D4-01、R16-D6-01；
    - 次要 8：R16-D4-02、D5-01、D6-02、D7-01、D8-01、D13-01、D14-01、D15-01。
  - D2、D3 的扣分来自 R16-D5-01 第 4 项、R16-D6-02 中的 Pi 事实与断言问题，不单独编号。
- **设计是否完成：否。**
  - 两个重要项实现时会直接表现为三类错误：
    - 叠加原因下静默丢失交还说明与人的转向；
    - `claim_on_behalf` 的失败去向不可确定；
    - drain 期间的人暂停或外部写入，在崩溃或退出后被改写为自动恢复，外部内容以 Agent 的名义进入验证；且现行 DDL 与 `10` 的写入时机不可同时满足。
  - 两项都可以用一段设计规则关闭：
    - 给 `run` 目标加 `{reason, decisionId}`，并统一 `claim_on_behalf` 与 `verifyFrom` 的写入点；
    - 增加持久的 `draining_for`。
  - 关闭之前，不宜开工 Supervisor 的暂停出口与 drain/恢复部分。其余次要项多为边角组合、接线、用例与措辞问题，范围有限。
- **下一轮建议按以下顺序修订**：
  1. 引入 `draining_for`，修正 settle 表的守卫行、drain 中途的恢复行与 `CHECK`，增加 G35e（R16-D6-01）；
  2. 给 `run` 目标加载荷，按统一写法处理 `request_changes`，裁决 `claim_on_behalf`，规定 `verifyFrom` 的写入点，增加 G33c（R16-D4-01）；
  3. 处理六个边角组合：pin 可选、`retry_claim`、settle 期间的暂停、从 `paused(human)` 接管后放弃改动、`budget.extend`、`nested_repo_live`（R16-D4-02）；
  4. 修正 nudge 窗口、交还开场、返工证据的单一路径、`/tower-inject` 的唯一性与响应确认、唤醒续跑（R16-D5-01）；
  5. 修正进程组的组长退出判定（R16-D6-02）；
  6. 处理 `keep`/`revert` 在 `run`/`settle` 下的告知与失败去向（R16-D7-01）；
  7. 定义停止条件的求值点与再武装规则（R16-D8-01）；
  8. 超过上限时改为 `nested_repo`，处理旧 seal 合入（R16-D13-01）；
  9. 补齐用例，完成 D15 清单与 lint 扩展（R16-D14-01、R16-D15-01）。

  按 ADR-136，本轮修订若超出系统或 Agent 线各 0.2 工作周的余量，须显式选择 ③ + ⑤ 或再顺延，并记 ADR。
