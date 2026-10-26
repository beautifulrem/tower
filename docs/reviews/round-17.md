# 对抗评审 · 第 17 轮

> **评审者**：独立对抗 Agent，未参与写作。
>
> **评审对象**：`README.md`、`docs/00`–`docs/16`（重点是 ADR-137–139、ADR-133 的第 16 轮补记及其落地处）、`reviews/round-16.md`、5 份第 16 轮回应、`round-16-lint.md`。回应文件只作为线索，每条结论都回到正文核对。行号以本轮读到的文件为准。
>
> **核对依据**：
> - Pi 克隆位于 `research/pi-mono`，标签 `v1.2.0`（提交 `06a4669`，“Release v1.2.0”），全部以 `git show v1.2.0:<path>` 读取。
>   - **D55 的三个前提与源码一致**：
>     - **唯一性**：`core/extensions/runner.ts` L814–845 的 `resolveRegisteredCommands()` 在同名时把两者都改名为 `<name>:<n>`；`getCommand()`（L863–864）按 `invocationName` 查找。RPC `get_commands`（`modes/rpc/rpc-mode.ts` L680–710）返回 `invocationName` 与 `sourceInfo`，`SourceInfo.path` 存在（`core/source-info.ts` L6–12）。握手时“恰好一个且来源为 tower-goal”可以判定。
>     - **disposition**：`prompt()` 命中扩展命令时 `await command.handler(…)` 后才 `preflightResult("handled")`（`agent-session.ts` L2060–2068、L2141–2163）；RPC 在 `preflightResult` 时才输出响应（`rpc-mode.ts` L394–412）。
>     - **串行**：`pi.sendMessage` 在运行时绑定为不等待的 `sendCustomMessage(…).catch(…)`（`agent-session.ts` L3413–3420）。`sendCustomMessage` 在第一个 `await` 之前就同步执行了关键动作：`triggerTurn:false` 且空闲时同步 `_appendCustomMessage`；`triggerTurn:true` 时进入 `_startRun`，它同步置 `_isAgentRunActive = true`（L1833）。因此“收到 `handled` 后再发下一条命令”足以保证顺序，也不会被整个 run 阻塞。
>     - **一个未登记的前提**：`registerCommand` 只检查 `assertActive()`（`core/extensions/loader.ts` L303–317），扩展可以在加载之后的任何时刻注册命令，而 `getCommand()` 每次重新解析。握手时的一次性检查因此不能保证之后不冲突。见 R17-D5-01 第 1 项。
>   - **交还开场的顺序成立**：
>     - 空闲时 `sendCustomMessage(…, {triggerTurn:false})` 直接追加（L2346–2352）；
>     - 随后的 `prompt(human)` 以 user 消息开始 run；
>     - `_prepareRun`（L1885–1935）中 `before_agent_start` 先于触发消息写入，ADR-138 的返工证据去重依据成立。
> - `python3 docs/reviews/lint/xref.py --checks rstuvwxyzck` 复跑：0 断链；(r) 0；(s) 8/8；(u) 0；(v) 0（79 条命令）；(w) 0；(x) 0；(w′) 0；(y) 0；(z) 0；(c) 0；(k) 0；(t) 0；退出码 0。
> - `14` §14.3.4 的算术已逐项复核，见 R17-D14-01 末尾的复核说明。WBS、角色合计、余量、日期全部成立。
> - 本轮没有做本机实验。
>
> 本文只在设计层面描述安全问题：缺了哪条不变式或规则、会放进哪一类后果、期望怎样缓解。不包含复现步骤。

---

## 1. 总评

第 16 轮 10 条：已解决 3、部分 7。lint 全过；D55 前提与交还开场与源码一致；排期算术无误。

仍有四个重要缺口：
- 改写与 `pendingHandBack` 会丢弃 `openings`/`adoptedHuman`；
- `drainingFor` 单槽合并违反 `CHECK`，崩溃后外部写入失去保护；
- 进程组判据既漏杀目标进程，又可能误杀无关进程组；
- `rework_cycles_over` 同时映射到两种暂停原因，可被一次点击关掉 I6。

## 2. 评分表

| # | 维度 | 分数 | 一句话理由 |
|---|---|---|---|
| D1 | 原论述契合度 | 100 | 没有可追问的实质问题。`claim` 记“人代为提交”、`settle{adoptedHuman}` 记 `human_change`，Goal 中心与诚实语法没有退化 |
| D2 | Pi 哲学契合度 | 98 | D55 前提与源码一致，仍以扩展命令实现。但 Pi 允许运行时注册命令，握手时的一次性检查不足以保证 `/tower-inject` 不被改名（R17-D5-01 第 1 项） |
| D3 | 论证与证据 | 97 | 三处断言超出设计实际做到的：“drain 中崩溃时 E 不会丢失”在合并更高原因时不成立；“按成员确认覆盖组内未满 5 s 的进程”在常见启动方式下不成立；“期间的决定按顺序作为开场”在交还与改写路径上不成立（R17-D6-01、D6-02、D4-01） |
| D4 | 领域模型与生命周期 | 89 | 继续目标的改写会覆盖载荷，`pendingHandBack` 会清除载荷（R17-D4-01）；`rework_cycles_over` 有两种暂停原因，再武装不可表示（R17-D4-02）；`claim` 在硬上限下自动返工、放弃改动的判据未持久化、`verifyFrom` 写入点不全等边角（R17-D4-03） |
| D5 | Agent 架构与 Pi 集成 | 97 | 命令注册的检查时间与使用时间之间有窗口；`RunOpening` 只能承载一段 Tower 话与一段人的话，多段开场的 `triggerTurn` 与多段人写文字的投递未定义；nudge 起点在 `session_start`/fork 后不重建（R17-D5-01） |
| D6 | 系统架构与可靠性 | 90 | `drainingFor` 的单槽合并与 `CHECK` 冲突，以 `app_quit` 为目的的 drain 崩溃后语义不明，非暂停类 drain 不可表示（R17-D6-01）；进程组判据两个方向都错（R17-D6-02） |
| D7 | 诚实与验证 | 98 | 采纳的人改动可能经 `claim` 以 Agent 内容验证并被自动返工（R17-D4-01 第 1 项）；`verify` 改写为 `verify_new` 时丢掉 `verifyFrom = accepted`，已验收单元被迫全部重看（R17-D4-03 第 3 项） |
| D8 | 注意力与交互 | 97 | `idle_without_submit` 的选项在四份文档中各不相同，其中“要求提交”没有命令、“以 `prompt` 发送一条说明”与 ADR-135 相违；`04` 仍把 draining 映射为 `idle_without_submit`（R17-D8-01） |
| D9 | 视觉设计与美观 | 100 | 没有可追问的实质问题。“暂停中（等待当前步骤结束）”、`扩展预算`/`继续` 分离、“人代为提交”都已落在 `04`/`12` |
| D10 | 性能 | 100 | 没有可追问的实质问题。gate 中的停止条件匹配、按成员枚举进程组都在已登记的预算内 |
| D11 | 安全与自主度 | 100 | 没有可追问的实质问题。本轮新增内容不扩大权限面；进程组误杀属于可靠性问题，归入 R17-D6-02 |
| D12 | 记忆与学习 | 100 | 没有可追问的实质问题。“这里不该停”作为 L9 收窄候选已写入 `09` §9.6.2 |
| D13 | 隔离、git 与并发 | 97 | 较旧 seal 合入与超过 64 条均已闭合。但合入的是**最近一次**验收的 seal 时，Goal 若有人工编辑检出或活跃 Run，转入 `integrated` 违反 `CHECK` 或去向未定义（R17-D13-01） |
| D14 | 路线图与可验证性 | 97 | 日期、WBS 114.55、各线余量全部复核成立。但 E1、E9 的时间窗没有随顺延更新；R17 各项缺少用例（R17-D14-01） |
| D15 | 文档一致性与可执行性 | 94 | `03` 作为唯一来源缺少 `resume` 的改写与 ADR-137 的放弃改动规则；`05` L564 仍是旧的 settle 重入点；`07` 与其他文档对 `settle` 下 `keep` 的写法不一；第 16 轮 #3 残留（R17-D15-01） |
| D16 | 创新与差异化 | 100 | 没有变化，没有可追问的实质问题 |

---

## 3. 第 16 轮条目核验

状态：**已解决** / **部分**（已改，但不完整、有残留或引入新矛盾）/ **未解决**。

| 条目 | 状态 | 备注 |
|---|---|---|
| R16-D4-01 | 部分 | **已落地**：<br>• `run{openings}`（`02` L55，`03` L69，`06` L829、L846、L849–850、L855、L879，`07` L1501，`10` L249–250，`16` L28）；<br>• `paused(sentinel_high)` 中的 `request_changes` 不再直接发 `run.requested`（`06` L879）；<br>• `claim` 目标在 `02` L57、`03` L69/L79/L81/I4、`06` L851、`07` L1463–1465/L1494、`16` L28 中一致；<br>• `verifyFrom` 写入点（`02` L168，`06` L829，`07` L1386，`16` L27），继续目标不再携带 `verifyFrom`。<br>**残留与新问题**：<br>• 改写会覆盖已有载荷，`pendingHandBack` 会清除载荷（R17-D4-01）；<br>• 写入点清单漏掉 `bring_back` 与修订标准（R17-D4-03 第 3 项） |
| R16-D4-02 | 部分 | **已落地**：<br>• pin 与 `claimed` 同一事务（`03` L57、I4，`06` L186，`07` L354，`10` L263）；<br>• `retry_claim` 改写为 `settle`（`06` L848）；<br>• settle 中任何暂停的目标都是 `settle`（`03` L68，`10` L241，`16` L28）；<br>• `budget.extend` 只提高额度（`06` L887，`04` L1374，`08` L490，`12` L417）；<br>• `nested_repo_live` 消失一律加 `human`（`03` L72，G26c(e)、G36g(f)）。<br>**残留**：<br>• `05` L564 仍写“回到 settle 序列的下一步（`agent_bg_done` → I4 → `claimed`）”；<br>• 放弃改动的新规则没有进入唯一来源 `03` L77 与 `16` L31，所需判据也没有持久化（R17-D4-03 第 2 项）；<br>• Host 已退出时 settle 重跑的语义、`06` L101 的 `app_quit` 恢复与 `settle` 目标冲突（R17-D4-03 第 4 项） |
| R16-D5-01 | 已解决 | 五项都已落地：<br>• nudge 起点（`05` L1058，`07` L356，`08` L384，C37）；<br>• 交还开场（`05` L1169，C36）；<br>• 返工证据只有一条注入路径（`05` L918，`07` L1507）；<br>• D55 前提（`05` L1351，C35(e)(f)，已与源码核对）；<br>• 唤醒续跑改用注入（`06` L110）。<br>新发现的命令注册检查窗口与多段开场问题见 R17-D5-01 |
| R16-D6-01 | 部分 | **已落地**：<br>• `drainingFor`（`02` L175，`06` L90–96、DDL L455）；<br>• 放宽后的 `CHECK`（`06` L478–479）；<br>• settle 判定表（`05` L581–583）；<br>• drain 中途的恢复行（`06` L140，`10` L267）；<br>• 用例 G35e。<br>**残留**：<br>• 单槽合并违反 `CHECK`，崩溃后外部写入的保护丢失；<br>• 以 `app_quit` 为目的的 drain 崩溃后语义不明；<br>• 非暂停类 drain 不可表示（R17-D6-01）；<br>• `04` L1401 仍把“正在暂停中”映射为 `idle_without_submit`（R17-D8-01） |
| R16-D6-02 | 部分 | 已改为“按成员确认”（`06` L139、L189，`10` L267，`15` L1049，`16` L328，G35c(j′)）。但判据“启动时间不早于该行写入时间”方向错误：既漏掉 shell 刚派生的子进程，也挡不住 pgid 复用（R17-D6-02）。这条判据出自第 16 轮评审自己的建议，本轮一并更正 |
| R16-D7-01 | 部分 | `run` 目标下的 `tower.external_resolved` 与 `settle{adoptedHuman}` 已落地（`06` L849–850，`10` L249–250）。但两者都会被后续改写或 `pendingHandBack` 丢掉，采纳的人改动仍可能被当作 Agent 内容自动返工（R17-D4-01）；`07` L358、L1480 的写法与其他文档不同（R17-D15-01） |
| R16-D8-01 | 部分 | 求值点、M1 种类、再武装都已写出（`05` L959，`07` L1176–1183，`16` L271–272，`04` L924–926，G41）。但 `rework_cycles_over` 与 I6 冲突，其再武装无法用 `stopConditionSilences` 表示，“本 Run”指向一个已结束的 Run（R17-D4-02） |
| R16-D13-01 | 已解决 | 超过上限改为一次列举，并以 `nested_repo` 阻断（`10` L98，`13` L318，G26d(c)(d)）；较旧 seal 合入不进 `integrated`（`03` L60，`06` L134，`10` L254，`04` L1254，G36c(e)）。**最近一次**验收的 seal 合入时的同类问题是新问题，见 R17-D13-01 |
| R16-D14-01 | 已解决 | 第 16 轮列出的 1–5 项都有用例：G35c(m)、C36、G41、G33c、G35e、G35c(j′)、G36c(e)(f)、G26d(c)(d)、G26c(e)、G33b(d)；补记已写入 ADR-133（`15` L975） |
| R16-D15-01 | 部分 | **已修正**：#1、#2、#4、#6、#7（`16` L127）、#8（`03` L60、`00` L91）、#9、#10（lint 新增 (c)(k)，(z) 已扩展）。<br>**残留**：<br>• #3：`03` L55 仍写“一次提醒后仍停下”；<br>• #5：`05` L564 仍是旧的重入点。<br>见 R17-D15-01 |

**合计**：已解决 3，部分 7，未解决 0。

### 3.1 继续目标的组合推演（`02` `Continuation` × `03` §3.2.1 × `06` §6.4.3 × `07` §7.10.3 × `10` §10.3.1/§10.8.4 × `16` L27–32）

| # | 组合 | 推演 | 结果 | 问题 |
|---|---|---|---|---|
| 1 | running → 人暂停 | 写 `drainingFor{human}` → drain 结束 → `paused(human)`，`run{openings:[]}` | ✓ | — |
| 2 | running 中检测到外部写入，drain 期间人按暂停（或退出、或达硬上限） | 外部写入时写 `externalChange` 与 `drainingFor{external_change}`。`human`/`app_quit`/`budget_hard_cap` 的优先级更高，于是成为 `drainingFor.reason`；`external_change` 要到 drain 结束才进入 `alsoApplies` | ✗ | drain 期间 `externalChange` 非空，但既不在原因集合中，也不是 `drainingFor.reason`，违反 `06` L478 的 `CHECK`（R17-D6-01） |
| 3 | 同 2，drain 中崩溃 | 恢复时进入 `paused(human)` 等原因；`external_change` 没有持久位置 | ✗ | 外部写入的保护丢失，或者恢复事务违反 `CHECK`（R17-D6-01） |
| 4 | OS 关机：以 `app_quit` 为目的的 drain 中途被强制结束 | `06` L140：“以 `draining_for.reason` 进入 `paused`，`app_quit` 只进 `alsoApplies`，**不** `autoResume`” | ✗ | 原因本身就是 `app_quit` 时，规则自相矛盾（R17-D6-01） |
| 5 | `stop_condition` 的 drain 中检测到外部写入 | 两者都在优先级表的“其余”中，没有顺序 | ✗ | 合并结果未定义（R17-D6-01） |
| 6 | running 中 `take_over`、`run.rewind`、依赖回退的 drain 中途崩溃 | 这些 drain 的目的地不是暂停原因，无法写进 `drainingFor`；恢复时按“drain 尚未开始”处理，进入 `paused{app_quit/engine_crash}` 并 `autoResume` | ✗ | 回退意图被改写为继续向前；依赖已回退的 Goal 在失效的 base 上自动恢复（R17-D6-01） |
| 7 | `paused(human_change_verify_failed)` 叠加外部写入；先 `retry_after_human_change`，后 `keep` | `run{[d1]}` → `[d1, k]` → 开场为 `tower.handback`、`tower.external_resolved` | ✓（G33c(a)） | 顺序反过来时，`keep` 先改写为 `verify_new`，随后被覆盖为 `run{[d1]}`。采纳的路径因 `author:"human"` 仍出现在交还说明中，可以接受 |
| 8 | `paused(idle_without_submit)`（在 settle 序列中进入，目标为 `settle`）叠加外部写入：`keep` 后再 `resume` 或 `claim_on_behalf` | `keep` → `settle{adoptedHuman:true}` → `resume` 改写为 `run{openings:[]}`；或者 `claim` 改写为 `claim{d}` | ✗ | `adoptedHuman` 丢失：Agent 不被告知；或者采纳的人改动以 `trigger:"claimed"` 验证，失败后自动返工（R17-D4-01） |
| 9 | `paused(sentinel_high{nested_repo_live})` 叠加外部写入：先 `keep`，再 `resume{note}` | `keep` → `run{[k]}`；`resume` 改写为 `run{openings:[]}` 再追加 note → `[n]` | ✗ | `tower.external_resolved` 丢失（R17-D4-01） |
| 10 | 从 running 接管；交还选 `continue_agent`，保留 `budget_hard_cap`；`keep_both` 之后 `keep`；`budget.extend` 后 `resume{note}` | `pendingHandBack{continue_agent}`；`openings = [k, n]` → `onAllReasonsCleared()` 第 1 步执行 `pendingHandBack`，然后“清除它与继续目标” | ✗ | `k` 与 `n` 都丢失，与 `04` L932 的承诺“期间的决定（你的说明、返工、交还、外部改动的处理）按顺序作为开场”相反（R17-D4-01） |
| 11 | `paused(sentinel_high)` 叠加 `budget_soft_cap`：`request_changes` 后 `resume` | `run{[rc]}` | ✓（G33c(d)） | 之前若有 `keep`，`[k]` 会被覆盖为 `[rc]`（R17-D4-01） |
| 12 | `paused(budget_hard_cap)`：`claim_on_behalf` 后验证失败 | 走 Agent 路径自动返工，Run 在用量已不低于硬上限时启动 | ✗ | 至少一次超出硬上限的 LLM 调用。`04` L1374 写着“验证不消耗模型预算”，与此不符（R17-D4-03 第 1 项） |
| 13 | `retry_claim`；settle 目标的暂停超过 5 分钟（Host 已退出）或应用重启后解除 | 从宽限确认起重跑 | 部分 | 宽限确认需要引擎状态，Host 不在时未定义；`06` L101 让 `app_quit` 恢复“作为 resume Run 入队”（R17-D4-03 第 4 项） |
| 14 | `stop_condition{path_touched}` 后选“继续” | 写入 `scope:"run"`；命中的那个 Run 已在 drain 时结束 | 部分 | 静默实际绑定的是**下一个** Run，`runId` 的取值未定义（R17-D4-02） |
| 15 | 返工次数达到 `rework_cycles_over` | `07` L1180 → `paused(stop_condition)`；`07` L1428–1429、`03` I6、`06` L261 → `paused(verify_failed_limit)` | ✗ | 同一事件两种原因；选“这里不该停”可能取消 I6（R17-D4-02） |
| 16 | 观测到较旧 seal 合入 | 记 `local_merged{current:false}`，`accepted` → `in_review` | ✓（G36c(e)） | — |
| 17 | 观测到**最近一次**验收的 seal 合入，而 Goal 处于有检出的 `paused(human)` 或 `running` | “无论何种非终态 → `integrated`” | ✗ | 违反 `06` L475 的 `CHECK`；活跃 Run 的去向未定义（R17-D13-01） |
| 18 | `accepted` → I2 → `verifying`（`verifyFrom = accepted`）→ 人暂停 → `keep` | `verify` 改写为 `verify_new{human_change}`，`returnTo` 为空 → `verifyFrom = claimed` | 部分 | 已批准单元全部重置为需评审（R17-D4-03 第 3 项） |
| 19 | `inspect.bring_back`、修订验收标准从 `in_review`/`accepted` 进入 `verifying` | 不在“只有这些”的写入点清单中 | ✗ | `verifyFrom` 沿用旧值（R17-D4-03 第 3 项） |
| 20 | 从 `paused(human)` 接管后放弃改动 | 规则要求“接管前的原因集合含 `human`”，但接管后只剩 `takeover_from = 'paused'` | ✗ | 判据不可求值；`03` L77 与 `16` L31 也没有这条规则（R17-D4-03 第 2 项） |
| 21 | `nested_repo_live` 消失且叠加 `provider_unavailable`；`budget.extend` 不 `resume` | 加入 `human`；仍暂停 | ✓（G26c(e)、G33b(d)） | — |

**各文档是否以同一方式陈述模型**：不完全一致，逐处见 R17-D15-01：
- `05` L564 与 ADR-137 的 settle 重入点不同；
- `07` L358、L1480 写“`keep` 不改写 settle 目标，预先记 `verifyOrigin`”，`02`/`03`/`06`/`10`/`16` 写的是 `settle{adoptedHuman:true}`；
- `03` 缺少 `resume` 的四个改写与 ADR-137 的放弃改动规则；
- `10` L758 写“`tower.handback` 的意图取自 `decisionId`”，与 ADR-138 的“`tower.handback` 不含意图”不同；
- `06` L101 的 `app_quit` 恢复与 `settle` 目标冲突；
- `04` L1401 仍把 draining 映射为 `idle_without_submit`。

---

## 4. 追问清单（新增与残留）

编号 `R17-D<维度>-<序号>`。严重度：**阻断** / **重要** / **次要**。

### D4 领域模型与生命周期

**R17-D4-01｜重要**（继续目标的载荷会被覆盖或丢弃）

- **问题**：ADR-137 让载荷随继续目标持久化，但有两类操作会把它抹掉。
  1. **显式改写覆盖已有载荷。** 下列改写都以字面值整体替换继续目标，不保留已有的 `openings` 与 `adoptedHuman`：
     - `goal.resume` 对 `verify_failed_limit`、`idle_without_submit`、`post_settle_activity`、`nested_repo_live` 改写为 `{kind:"run", openings:[]}`（`06` L846）；
     - `retry_after_human_change` 改写为 `{kind:"run", openings:[本决定]}`（`06` L855）；
     - `paused(sentinel_high)` 中的 `request_changes` 改写为 `{kind:"run", openings:[本决定]}`（`06` L879）；
     - `claim_on_behalf` 改写为 `{kind:"claim", decisionId}`（`06` L851）。

     这些命令处理的原因与 `external_change` 都在优先级表的“其余”中，或者优先级更低。外部写入在 `alsoApplies` 中时，人通常先 `keep`，因为 `goal.resume` 对 `external_change` 返回 `E_STATE`。于是：
     - **组合 8**：`idle_without_submit` 在 settle 序列中进入，目标为 `settle`（`03` L68）。`keep` 置 `adoptedHuman`；之后的 `resume` 把它换成 `run{[]}`，Agent 不被告知。若改用 `claim_on_behalf`，采纳的人改动会以 `trigger:"claimed"` 验证，失败后**自动返工**。这正是 R16-D7-01 要消除的后果。
     - **组合 9、11**：`tower.external_resolved` 被后来的 `resume` 或 `request_changes` 清掉。
  2. **`pendingHandBack` 优先执行时清除载荷。**
     - `onAllReasonsCleared()` 第 1 步执行 `pendingHandBack` 后“清除它与继续目标”（`03` L70，`06` L829，`10` L758，`16` L32）。
     - 交还后仍暂停期间，`keep`/`revert` 与带 `note` 的 `resume` 都会把决定追加到 `run.openings`（组合 10），然后被第 1 步整体丢弃，开场只剩 `tower.handback`。
     - `04` L932 却向用户承诺：“期间做出的决定（你的说明、返工、交还、外部改动的处理）按顺序作为下一回合的开场”。
  3. **“按顺序”的含义不明。** `06` L829、`07` L1501、`16` L28 写“按 `openings` 中各决定的顺序组装（`tower.handback`、返工证据、评论、`tower.external_resolved`、人的 note）”。括号里是固定的类型顺序，正文说的是追加顺序，两者在组合 7 的反序情形下不同。
- **为什么重要**：
  - 第 1、2 项都在**静默**丢失人写的转向与“不要回退已采纳的路径”。第 1 项还会让人采纳的改动以 Agent 的名义被自动返工。
  - 这三类后果正是 ADR-137 宣称已经关闭的（R16-D4-01、R16-D7-01），而且结果取决于人按命令的先后顺序。
- **文档位置**：`03` L68–70；`06` L829、L846、L851、L855、L879；`07` L1489–1501；`10` L754–760；`16` L28、L32；`04` L932；`14` G33b、G33c。
- **期望的回答形态**：
  - 规定**改写只换 `kind`，载荷合并**：
    - 改写为 `run` 时，保留已有的 `openings` 并追加本决定；
    - 从 `settle{adoptedHuman:true}` 改写为 `run` 时，把对应的 `keep` 决定转入 `openings`（开场附 `tower.external_resolved`）；
    - 改写为 `claim` 时，若 `adoptedHuman` 为真或 `openings` 中有 `keep`，本次验证记 `human_change`（失败不自动返工）；或者此时拒绝 `claim_on_behalf` 并提示。二选一。
  - `pendingHandBack{continue_agent}` 执行时，把 `continuation.openings` 接在 `tower.handback` 之后；`reverify` 执行时，若 `openings` 非空，则在验证失败的开场中保留它们。
  - 明确组装顺序：按追加顺序，或者按固定类型顺序，二选一。
  - 增加 G33d：
    - (a) 组合 8 的两组；
    - (b) 组合 9；
    - (c) 组合 10，断言开场依次为 `tower.handback`、`tower.external_resolved`、人的 note。

**R17-D4-02｜重要**（`rework_cycles_over` 的两种暂停原因与再武装）

- **问题**：
  1. **同一事件两种去向。**
     - `07` L1180 把 `rework_cycles_over{n}` 写成“返工开始时求值 → 不开返工回合，`paused(stop_condition)`”。`05` L959、`16` L271、`15` L1060 与此相同。
     - `03` I6（L111）、`06` L261、`07` `decide` L1428–1429 与 `03` L82 则规定：返工次数达到 `stopConditions.rework_cycles_over`（默认 3，`16` L434）→ `paused(verify_failed_limit)`。
     - 两条规则在同一时刻求值、读同一个阈值，却给出不同的 `pauseReason`、不同的 Needs-You kind（`stop_condition` 对 `stalled`/`verify_failed_limit`）和不同的出口：
       - `stop_condition` 的“继续”会让“阈值相对当前次数重新计”；
       - `verify_failed_limit` 的 `resume` 则要求“合同已修订或附 `note`”。
  2. **“这里不该停”可能取消 I6。**
     - “这里不该停”使该条件“静默到下一次合同修订”，编译时省略（`05` L959，`06` DDL L454）。
     - 如果 I6 的上限与停止条件读的是同一配置，这一个点击就让返工在下次修订前不设上限。I6 是“违反即为 bug”的不变式（`03` L104）。
  3. **再武装无法表示。**
     - `stopConditionSilences` 只有 `{conditionId, scope:"run"|"until_amend", object?, runId?, decisionId}`（`02` L169–174），没有字段记录“相对哪一次数重新计”。
     - 每一次返工都是一个新 Run（`05` L1167），所以 `scope:"run"` 对 `rework_cycles_over` 没有意义。
  4. **“本 Run”指向一个已结束的 Run。**
     - 停止条件命中后先 drain，命中的那个 Run 随之结束；“继续”时 `resume` 才写 `scope:"run"`，此时没有当前 Run。G41(a) 期望的是**下一个** Run 内静默。
     - `runId` 字段应写哪个值、按什么事件清除，都没有规定。
     - `04` L925 写“静默到本次 Run 结束”，对用户而言那个 Run 已经结束了。
  5. **入口状态。** 若 `rework_cycles_over` 保留为停止条件，它是在 `verifying` 中命中的，继续目标为 `verify{pin}`。“继续”后会以同一个失败的 pin 再验证一次，而 `03` L80 的 `stop_condition` 入口只列了 `running`。
- **为什么重要**：这是不变式 I6 与 ADR-139 之间的直接矛盾，实现者必须二选一。选错一方会让“返工有上限”被一次点击关闭，此时只剩预算上限兜底。
- **文档位置**：`03` L80、L82、L104、L111；`05` L959；`06` L261、L454、L846；`07` L1180、L1183、L1428–1429；`02` L169–174；`04` L924–926；`16` L271–272、L434；`14` G41。
- **期望的回答形态**：
  - 裁决：`rework_cycles_over` **只**是 I6 的阈值，到达时进入 `verify_failed_limit`，不作为 `stop_condition` 求值。从 `07` §7.7.1、`05` L959、`16` L271、ADR-139 的 M1 种类中删去它。或者反过来，删去 I6 的独立判定。
  - 无论哪种，“这里不该停”都不得解除 I6。
  - `scope:"run"` 改为“到下一个开始的 Run 结束”：写入时 `runId` 为空，在下一次 `run.started` 时绑定，并改 `04` L925 的文案。
  - G41 增加 `rework_cycles_over` 一组，以及一组“继续”后由其他原因延迟开 Run 的情形。

**R17-D4-03｜次要**（继续目标的边角组合）

- **问题**：
  1. **硬上限下的 `claim` 会自动开返工 Run。**
     - `claim` 失败时按 Agent 路径自动返工（`07` L1465、L1494；G33c(b) 明确断言“自动返工”）。
     - 准入不检查预算（`06` §6.2.4），Accountant 只在 `msg.end` 后判定超限（`06` L335–339）。因此在 `budget_hard_cap` 下，人点击“按当前状态送去验证”后，若验证失败，系统会自动发起至少一次超出硬上限的 LLM 调用，然后再次停在 `budget_hard_cap`。
     - 卡片却写着“验证不消耗模型预算”（`04` L1374，`06` L339），而硬上限的定义是“没有继续选项”。
  2. **放弃改动的判据没有持久化，也没有进入唯一来源。**
     - ADR-137 规定“接管前的原因集合含 `human`”时保留 `paused(human)`（`06` L856，`07` L1487）。
     - 但接管后 `pause_reason = human`，原来的 `human` 不会在集合 `alsoApplies` 中重复出现，`takeover_from` 只记 `'paused'`（`06` L458），这一判据在放弃时无法求值。
     - 唯一来源 `03` L77 与 `16` L31 只写了 `takeoverFrom = running` 的情形。
  3. **`verifyFrom` 写入点不全。**
     - `07` L1386 声称“只有这些”，但 `inspect.bring_back`（`in_review`/`accepted` → `verifying`，`06` L863）与修订验收标准（`03` §3.4.5）都不在清单中，会沿用旧值。
     - 例如 `accepted` → I2 → `in_review` 之后，`verifyFrom` 仍是 `accepted`，下一次修订标准后的验证会按验收延续判定。
     - 反方向（组合 18）：从 `verify` 改写出的 `verify_new` 一律写 `claimed`，丢掉了此时并不陈旧的 `accepted`/`in_review`，已批准单元全部重置为需评审。
  4. **settle 重跑的前置条件。**
     - `settle` 目标“从宽限确认起重跑”，而宽限确认需要读 `isStreaming`/`isCompacting`（`05` L564）。
     - 暂停超过 5 分钟后 Host 已退出（`06` §6.1.8），应用重启后也没有 Host，此时是重启 Host 还是视为宽限已满足，没有规定。
     - `06` L101 让 `app_quit` 在启动时“作为 `resume` Run 进入 EngineManager 队列”，与 `settle` 目标“不开新 Run”冲突。
     - settle 序列中直接崩溃（没有 drain，`06` L140 的最后一句）时，恢复是否知道 Goal 处于 settle 序列也没有说明。
  5. **`claim` 的 pin 来源。** `07` L1494 写“以 `agent_bg_done` 检查点生成 pin”。但 `budget_hard_cap` 由 drain 结束，`05` L582 的 draining 行没有说明 drain 结束时是否执行进程终止与 `agent_bg_done`。
- **为什么重要**：
  - 第 1 项违反了硬上限的明示语义，而且出自一个声称不花模型预算的按钮；
  - 第 2 项照文实现无法求值；
  - 第 3 项会让验收延续基于陈旧的源状态；
  - 第 4、5 项是实现者必须猜测的分支。
- **文档位置**：`03` L77、L79、L104；`04` L1374；`05` L564、L582；`06` L101、L140、L261、L335–339、L458、L851、L856、L863；`07` L1386、L1465、L1487、L1494；`16` L27、L31；`14` G33c(b)。
- **期望的回答形态**：
  - 准入增加“用量不低于硬上限时不开 Run”的守卫。`claim` 失败且处于硬上限时，进入 `paused(budget_hard_cap)`，返工证据追加到 `openings`。G33c(b) 改为断言不开 Run。
  - `take_over` 时持久化 `takeoverReasons`（或 `takeoverFrom = {state, reasons}`）；`03` L77 与 `16` L31 写入 ADR-137 的规则。
  - `verifyFrom` 写入点补上 `bring_back` 与修订标准；`verify` 改写为 `verify_new` 时 `returnTo` 取当时的 `Goal.verifyFrom`（若 ∈ {`in_review`, `accepted`}）。
  - `settle` 重跑在 Host 不存在时跳过宽限确认，只重做进程终止与 `agent_bg_done`。`06` L101 改为“`app_quit` 解除后经 `onAllReasonsCleared()`”。持久化 settle 阶段（例如 `runs.settle_phase`），供崩溃恢复判断。
  - 写明 drain 结束时是否执行 settle 第 3–4 步；`claim` 在没有 `agent_bg_done` 时先补做。

### D5 Agent 架构与 Pi 集成

**R17-D5-01｜次要**

- **问题**：
  1. **命令注册的检查时间与使用时间之间有窗口**（文首核对）。
     - D55 的唯一性只在 RPC 握手后检查一次（`05` L1351），但 Pi 允许扩展在之后任意时刻 `registerCommand`（`loader.ts` L303–317）。
     - 一旦出现同名注册，下一条 `/tower-inject <id>` 会落入普通 prompt：作为 user 消息开始一次 LLM 回合。`disposition` 检查只能在事后发现。
     - 后果是会话中出现一条不是人写的 user 消息，并多出一次模型调用。
  2. **多段开场无法表示。**
     - `RunOpening` 只有一个 `tower?: TowerMessage` 和一个 `human?: EngineInput`（`05` L100），但 `openings` 可组装出 `tower.handback`、`tower.rework`、`tower.external_resolved` 等多段 Tower 话，以及评论、note 等多段人写文字（`07` L1501）。
     - 以下几点都没有规定：
       - 各段的 `triggerTurn` 如何取，是只有最后一段为 `true`，还是有人写文字时全部为 `false`；
       - RPC 下是否逐段 `/tower-inject` 并逐段等待 `handled`；
       - 多段人写文字是合并为一次 `prompt`，还是第二段改用 `steer`。第二次 `prompt` 会在流式中抛 `EBUSY`（`05` L142）。
  3. **nudge 起点不重建。**
     - `session_start` 只从分支重建 nudge 次数、最后一次 submit 与检查点序号（`05` L917）。
     - “本 Run 起点”只在 `before_agent_start` 时记在内存中；`/tower-fork` 替换 runtime 之后，新扩展实例没有起点。
     - 此外，tower-goal 的起点按 Pi 的 agent run 计，Supervisor I4 的“本 Run”按 Tower Run 计。宽限失败后由扩展定时器引起的新 agent run 会移动前者，不移动后者。
- **为什么重要**：
  - 第 1 项会让诚实语法在一个可预见的条件下失效；
  - 第 2 项照文实现会报错，或者实现者只能自行决定开场形状；
  - 第 3 项会在 fork 之后重复 nudge，或者漏掉 nudge。
- **文档位置**：`05` L95–100、L142、L643、L917–918、L1058、L1351、L1397；`07` L1501。
- **期望的回答形态**：
  - 每次 `/tower-inject` 之前，复用同一串行通道先发一次 `get_commands`（只在 RPC 下，代价是一次往返）。或者登记为已知窗口：Trace 把这种 user 消息标为“Tower 投递失败（非人所写）”。C35 增加“运行中途注册同名命令”一例。
  - `RunOpening` 改为 `{tower: TowerMessage[]; human?: EngineInput}`。规则写为：
    - 人写的多段文字合并为一次 `prompt`，各段之间用 Tower 标记行分隔；
    - Tower 各段一律 `triggerTurn:false`；没有人写文字时，最后一段为 `true`；
    - RPC 下逐段等待 `handled`。
  - 起点写入分支条目（例如 `appendEntry("tower.run_start", {runId})`），`session_start` 时按 `cfg.runId` 重建；起点定义为“本 Tower Run 的第一个 `before_agent_start`”。C37 增加 fork 一例。

### D6 系统架构与可靠性

**R17-D6-01｜重要**（`drainingFor` 只有一个槽位）

- **问题**：
  1. **合并与 `CHECK` 冲突，崩溃后保护丢失。**
     - drain 中的合并规则是：较高的原因成为 `drainingFor.reason`，较低者**在 drain 结束时**才进入 `alsoApplies`（`16` L29，`10` L240，`06` L90）。
     - 优先级表中 `human`、`app_quit`、`budget_hard_cap`、`budget_soft_cap` 都高于 `external_change`（`16` L24）。因此，外部写入引起的 drain 中只要人按暂停、退出，或者达到预算上限：
       - `drainingFor.reason` 被替换，`externalChange` 仍非空，原因集合为空，违反 `06` L478–479 的 `CHECK`，更新被拒；
       - 如果为了满足约束而不持久化，drain 中崩溃时又回到 R16-D6-01 的后果：E 在恢复前的 `safety` 检查点之前没有任何原因字段保护。`10` L267 只说检查点不把 `externalChange.paths` 归入 Agent，没有说恢复后 Goal 是否仍然处于 `external_change`。
     - G35e(c) 只测了 `human` 与 `budget_hard_cap` 的合并，(d) 只测了外部写入单独出现的情形。
  2. **以 `app_quit` 为目的的 drain 崩溃后语义不明。**
     - 退出与 OS 关机本身就走 drain（`06` L86–100），`drainingFor.reason` 为 `app_quit`，关机时强制结束很常见。
     - `06` L140 与 `16` L29 的规则是“以 `drainingFor.reason` 进入暂停，`app_quit`/`engine_crash` 只进 `alsoApplies`，**不** `autoResume`”。原因本身就是 `app_quit` 时，这句话无法执行：
       - 若不自动恢复，就违背了确认框“下次启动时自动继续”（`06` L84）；
       - 若自动恢复，就与规则字面相反。
  3. **“其余”没有顺序。** `stop_condition`、`external_change`、`sentinel_high`（`nested_repo_live`）、`idle_without_submit` 等都在“其余”中（`16` L24），drain 中两者相遇时，谁成为 `drainingFor.reason` 未定义。
  4. **非暂停类 drain 不可表示。**
     - `take_over`（drain 后建检出）、`run.rewind`（drain 后 `navigate` 与恢复）、依赖回退（drain 后回到 `ready`）、`run.fork_goal` 的 drain，目的地都不是 `PauseReason`。
     - 只有 `goal.pause` 写明了 `drainingFor`（`06` L845）。这些 drain 中途崩溃时，按“`draining_for` 为空”处理，进入 `paused{app_quit|engine_crash}` 并 `autoResume`（`06` L140）：
       - 人要求的回退被改写为继续向前；
       - 依赖已回退的 Goal 会在失效的 base 上自动恢复。
- **为什么重要**：
  - 第 1 项是 ADR-138 自身的 DDL 与合并规则不可同时满足，并且恰好重新打开了 ADR-138 要关闭的“来源不明的内容以 Agent 名义进入工作”的口子；
  - 第 2 项影响每一次关机；
  - 第 4 项在崩溃时改写人的显式决定。
- **文档位置**：`06` L84–101、L140、L455、L474–479、L845、L853、L865、L867；`10` L240、L267；`16` L24、L29；`03` L55；`14` G35e。
- **期望的回答形态**：
  - `drainingFor` 改为 `{reason, decisionId?, requestedAt, pending: PauseReason[], intent?: "pause" | "take_over" | "rewind" | "dependency" | "fork"}`；`pending` 在合并时**同一事务**写入。
  - `CHECK` 改为：`external_change` 非空 ⇔ 原因集合、`drainingFor.reason` 或 `drainingFor.pending` 含 `external_change`。
  - 恢复规则改为：
    - `drainingFor.reason = app_quit` 时按 `app_quit` 进入并 `autoResume`；
    - 其他原因按原规则，`pending` 并入 `alsoApplies`；
    - `intent ≠ pause` 时停在 `paused(human)`，提示“上次的<回退/接管/…>未完成”，不 `autoResume`；依赖回退则回到 `ready{dependency}`。
  - 给“其余”定一个全序，或者规定 drain 合并只按“先到者为 reason，后到者进 `pending`”。
  - G35e 增加：
    - (e) 外部写入的 drain 中人暂停，再杀掉 Host；
    - (f) 关机时 drain 被强制结束；
    - (g) 回退的 drain 中崩溃。

**R17-D6-02｜重要**（进程组的成员判据方向错误）

- **问题**：判据是“开机会话相同，且该 pgid 下至少有一个**启动时间不早于该行写入时间**的成员”（`06` L139、L189，`10` L267，`15` L1049，`16` L328）。该行在调用开始、Host 报告 pgid 之后才写入（`10` L267），这个判据两个方向都错。
  1. **漏判。** `sh -c 'vite --watch &'` 这类命令中，shell 在启动后的几毫秒内派生后台子进程。Host 报告 pgid、Supervisor 组提交写入这一行，通常晚于子进程启动。子进程的启动时间早于写入时间，判据不成立，该行被删除，存活者不被终止。这正是 G35c(j′) 要覆盖的情形。
  2. **误判。**
     - POSIX 只保证“组内仍有成员时 pgid 不被复用”。原组全部退出后（短命令很常见），同一数值可以被一个无关的新进程组复用，例如用户终端中的作业，或者其他应用以 `setsid`/`detached` 启动的进程。
     - 新组成员的启动时间都晚于写入时间，判据成立，Tower 会对用户的无关进程组发信号。
     - 行在 Run 结束时才删除（`06` L189），长 Run 中 pid 回绕并不罕见；崩溃重启时同样适用。
     - 第 15 轮的“组长身份匹配”判据能挡住复用，本轮的改动去掉了这层保护。
  - 这条判据出自第 16 轮评审的期望回答形态，是评审方的错误，本轮更正。
- **为什么重要**：第 1 项使 ADR-138 对 R16-D6-02 的修复对目标情形无效；第 2 项会终止不属于 Agent 的进程，属于对用户环境的实际伤害。
- **文档位置**：`06` L139、L189、DDL `bash_process_groups`（L579 起）；`10` L267；`13` L320；`15` L1049；`16` L328；`14` G35c(j)(j′)。
- **期望的回答形态**：缺的不变式是**被终止的成员必须在原组已知仍非空的时段内就已存在**。设计层面可以这样实现：
  - 下界取行中记录的**组长启动时间**，而不是行写入时间；
  - 上界取该组**最近一次被确认非空的时间**：每次 2 s 轮询（`10` L232）或每个 `turn_end` 时更新该行的 `lastSeenNonEmptyAt`，写放大按“仅在变化时更新”控制；
  - 只有启动时间落在 [组长启动时间, `lastSeenNonEmptyAt`] 内的成员才计入，且逐个按 `(bootSession, pid, startTime)` 确认后再发信号；
  - 组内只有区间外的成员时删除该行，并记为已知窗口；
  - G35c 增加：
    - (j″) 原组退出后 pgid 被无关进程组复用，断言不发信号；
    - (j′) 断言子进程启动早于行写入时仍被终止。

### D8 注意力与交互

**R17-D8-01｜次要**

- **问题**：
  1. **`idle_without_submit` 的选项在四份文档中各不相同。**

     | 文档 | 选项 |
     |---|---|
     | `03` L81 | `resume`（附转向）/ `claim_on_behalf` |
     | `04` L1401 | 附转向继续 / 按当前状态送去验证 |
     | `05` L1072 | 继续（以 `prompt` 发送一条说明）/ 回复 / 保持暂停 |
     | `08` L385 | 回复 / 暂停 / 要求提交 |

     - “要求提交”没有对应命令。
     - “以 `prompt` 发送一条说明”若由 Tower 撰写，就与 ADR-135 相违。
     - `05`/`08` 中没有“按当前状态送去验证”。
  2. **`04` L1401 把 draining 映射为 `idle_without_submit`。** 原文是“不满足提醒条件时（例如只有人工标准，**或正在暂停中**）直接进入该暂停”，与 ADR-138 及 `05` L581–582 相反，正是 R16-D6-01 第 1 项的旧行为。
  3. **停止条件“继续”的文案**：见 R17-D4-02 第 4 项。卡片说的“本次 Run”已经结束。
- **为什么重要**：第 1 项是同一张 Needs-You 卡片的出口与命令不对应，实现者无法确定该显示哪些按钮；第 2 项会让用户看到错误的暂停原因。
- **文档位置**：`03` L81；`04` L925、L1401；`05` L1072；`08` L383–385。
- **期望的回答形态**：
  - 以 `03` L81 为准，统一为三项：“附转向继续（`goal.resume{note}`）/ 按当前状态送去验证（`goal.claim_on_behalf`）/ 保持暂停”，并删去“要求提交”与“以 `prompt` 发送一条说明”；
  - `04` L1401 删去“或正在暂停中”；
  - lint (w′) 增加“Needs-You 选项 ↔ 命令”的比对。

### D13 隔离、git 与并发

**R17-D13-01｜次要**（最近一次验收的 seal 合入，而 Goal 有检出或活跃 Run）

- **问题**：
  - 被合入的是**最近一次**验收的 seal 时，规则是“无论 Goal 处于何种非终态 → `integrated`”（`06` L134，`10` L254）。
  - 在 M1，合并由人自己完成。从 `accepted` 接管（检出存在，Goal 为 `paused(human)`）后，人顺手把分支合入本地 base，是很自然的操作。此时 seal 仍是最近一次，Goal 在卫星中也没有“新内容”，因为改动还在检出里。
  - 这时转入 `integrated` 会违反 `06` L475 的 `CHECK`：`human_checkout` 只允许出现在 `paused(human)` 或写回中的 `in_review`/`accepted`。检出中尚未交还的改动也会随 24 h 后的归档而失去入口。
  - 同样，从 `accepted` 经 `request_changes` 进入 `running`，而 Agent 尚未改动文件时，转入 `integrated` 会留下一个活跃 Run，I7 与 Mode 都没有定义。
  - 较旧 seal 的规则已经写了“人工编辑检出与活跃 Run 不变”（`06` L134），最近一次 seal 的规则没有。
- **为什么重要**：违反持久层约束，并且会让人尚未交还的改动失去出路。
- **文档位置**：`03` L60；`06` L134、L475；`10` L254、§10.12；`14` G36c(c)(d)。
- **期望的回答形态**：
  - 把“Goal 此后已有新内容”扩展为：卫星树 ≠ seal 的树、**或** `human_checkout` 非空、**或**有活跃 Run。三者任一成立时，按较旧 seal 的规则处理：只记 `local_merged{current:true}`，提示“base 已含已验收版本；当前仍有未完成的改动”，等交还或 Run 结束后再判定。
  - G36c 增加 (g)：检出存在时合入最近的 seal。

### D14 路线图与可验证性

**R17-D14-01｜次要**

- **问题**：
  1. **实验时间窗没有随顺延更新。**
     - E1 试点写“M1 第 31–33 周（自用期）”（`14` L446），自用期现在是第 33–35 周；
     - E9 写“M1 第 31 周（用 M1 冻结构建）”（`14` L526），而冻结在第 32 周末，第 31 周还没有冻结构建。
     - 两处都滞后两轮。lint 的 M1 日期检查不覆盖实验表。
  2. **R17 各项的新规则没有用例**：
     - 载荷合并（R17-D4-01）；
     - `rework_cycles_over` 的唯一去向（R17-D4-02）；
     - 硬上限下的 `claim`（R17-D4-03）；
     - 多段开场与命令注册窗口（R17-D5-01）；
     - drain 的 `pending` 与非暂停类 drain（R17-D6-01）；
     - 进程组区间判据（R17-D6-02）；
     - 检出存在时合入 seal（R17-D13-01）。
  3. **用例与正文不符**：G33c(b) 断言硬上限下“自动返工”，与 R17-D4-03 第 1 项冲突；G41 没有覆盖 `rework_cycles_over`。
  4. **工时口径（不影响结论）**：
     - 第 16 轮去重表把 07/08/09 回应中的“Agent 0.2”记为 W9“`claim` 的验证路径、`rework_cycles_over`”（`14` L313）；
     - 但 07/08/09 回应中这 0.2 写的是“gate 中停止条件的拒绝、nudge 窗口改锚、唤醒与返工的注入路径”，即 W6 的内容，与 05/06 的 W6 0.45 重叠。
     - 按去重规则应取较大者，W9 的 0.2 是多算的，属于保守方向。
- **复核说明**（不扣分）：
  - **WBS**：各行之和为 114.55，各行“主责”分列之和逐行等于该行人周。第 16 轮增量为：W3 +0.9、W4 +0.15、W6 +0.45、W7 +0.55、W9 +0.2、W12 +0.35、W13 +0.7、W15 +0.1，合计 3.4，与去重表（`14` L308–319）一致；111.15 + 3.4 = 114.55。
  - **角色合计**：Agent 24.7、系统 24.45、桌面 26.0、设计 27.15、安全 12.25，合计 114.55。扣除 M0 先行（0.4/0.1/1.8/3.0/0.5）后乘 1.1，得 26.73 / 26.79 / 26.62 / 26.57 / 12.93（安全按 0.5 人为 25.85 工作周）。
  - **工作周与余量**：第 1–6、9–13、15–32 周共 29 个工作周，减 2 周缓冲为 27。余量为系统 0.21、Agent 0.27、桌面 0.38、设计 0.43、安全 1.15，全部成立。
  - **与第 15 轮的衔接**：上一轮余量 0.2 工作周折合 0.18 人周 ×4，安全 0.59 × 0.5 / 1.1 ≈ 0.27，合计约 1.0；顺延 1 周增加 4 × 0.909 + 0.45 ≈ 4.09，5.10 ≥ 3.4。
  - **日期**：2026-11-09 为周一；第 7–8 周为 12-21 至 01-03；第 14 周自 2027-02-08 起；第 32 周周五为 2027-06-18，第 36 周周五为 2027-07-16；M2 加 14 周至 2027-10-22。全部成立。
  - **增人备选**：26.73 + 26.79 + 26.62 + 26.57 + 12.93 = 119.64 ≤ 5.5T − 2，得 T ≥ 22.12。安全线 0.5 × 22.12 = 11.06，差额约 1.87 ≈ 1.9 人周。24.12 → 25 个工作周 → 第 28 周末（2027-05-21）冻结，M1 = 32 周（至 2027-06-18）。成立。
  - **甘特**：各线 QA 在第 29–30 周结束（第 30 周末累计 27 个工作周），第 31–32 周为完整缓冲。成立。
- **为什么重要**：
  - 第 1 项会让 E1/E9 在错误的构建上执行；
  - 第 2、3 项不满足 rubric 对“可执行验证计划”的要求；
  - 本轮修订若落在系统线，余量只有 0.21 工作周，须按 ADR-136/139 显式选择 ③ + ⑤ 或再顺延，并记 ADR。
- **文档位置**：`14` L111、L116、L125、L313、L446、L526、§14.3.4；`reviews/lint/xref.py`。
- **期望的回答形态**：
  - E1 试点改为第 33–35 周，E9 改为第 33 周；lint 的日期检查扩展到 §14.5 的“时间”行。
  - 用例：G33d（R17-D4-01）；G41(f)(g)（R17-D4-02）；改写 G33c(b)；C35(g)、C38（多段开场）；G35e(e)–(g)；G35c(j″)；G36c(g)。
  - 本轮工时按 WBS 行去重后记入 ADR-133 补记，并顺手更正 W9 0.2 的口径。

### D15 文档一致性与可执行性

**R17-D15-01｜次要**

- **问题**：以下各处均已逐处核对。
  1. **`03` 作为唯一来源，缺少 `06` 已执行的改写。**
     - `goal.resume` 对 `verify_failed_limit`、`idle_without_submit`、`post_settle_activity`、`nested_repo_live` 改写为 `run`（`06` L846），`03` L69、L81–83、L88 都没有写。
     - lint (k) 只检查“`03` 中出现的改写在 `06` 中也有”，不检查反方向。
  2. **ADR-137 的放弃改动规则**不在 `03` L77 与 `16` L31 中（见 R17-D4-03 第 2 项）。
  3. **settle 重入点与 pin 顺序**：
     - `05` L564 仍写“全部原因解除后回到 settle 序列的下一步（`agent_bg_done` → I4 → `claimed`）”，与 ADR-137、`06` L186、`07` L358、`10` L241 的“从宽限确认起”不符（R16-D15-01 #5 的残留）；
     - `05` L564 第 ④ 步与 L578 仍是“`claimed` → pin”的旧顺序。
  4. **`settle` 下 `keep` 的写法**：`07` L358 写“`keep`/`revert` 只解除本原因、不改写该目标；`keep` 时……预先记为 `human_change`”，L1480 写“为 `run`/`settle` 时不改写”。`02` L56、`03` L89、`06` L849、`10` L249、`16` L28 写的是改写为 `settle{adoptedHuman:true}`。
  5. **交还说明是否含意图**：`10` L758 写“注入 `tower.handback`，意图取自 `decisionId`”，与 ADR-138 及 `05` L1169 的“`tower.handback` 不含意图，意图以 user 消息另发”不同。
  6. **`app_quit` 的恢复**：`06` L101 写“作为 `resume` Run 进入 EngineManager 队列”，与 settle 目标及 `06` L137 的“由 `onAllReasonsCleared()` 离开”冲突。
  7. **第 16 轮残留 #3**：`03` L55 仍写 `idle_without_submit` 是“一次提醒后仍停下”，没有写守卫不成立时直接暂停。
  8. **措辞与注释**：
     - ADR-137 写“从宽限确认（第 1 步）”，`07` L358、`10` L241 写“第 2 步”；
     - `06` DDL L450 的注释列出的 `kind` 缺 `claim`；
     - ADR-139 正文仍写“超过 64 条或循环超过 64 次”，与其补记的“不设上限”并存，没有划去。
- **为什么重要**：第 1–6 项都是实现者照抄就会出错的分支，其中第 1、2 项出在被声明为“唯一来源”的 `03` 上。
- **文档位置**：如上。
- **期望的回答形态**：
  - 逐条修正；
  - lint (k) 改为双向比对：`06` §6.4.3 中每个“改写为”也必须出现在 `03` §3.2.1；
  - lint (c) 扩展到 DDL 注释中的 `kind` 列表；
  - 增加一条检查：“settle 重跑起点”的字样在各文档中一致。

---

## 5. 结论

- **是否所有维度为 100：否。**
  - D1、D9、D10、D11、D12、D16 为 100，在这六个维度上没有找到可追问的实质问题。
  - 其余维度在 89–98 之间，最低为 D4（89），其次是 D6（90）与 D15（94）。
- **是否还有可追问的问题：有。**
  - **第 16 轮核验**：共 10 条，已解决 3、部分 7、未解决 0。lint 全部通过；D55 的三个前提与交还开场的顺序与源码一致；排期算术全部成立。
  - **本轮追问**：新增与残留共 **10** 条。
    - 阻断 0；
    - **重要 4**：R17-D4-01、R17-D4-02、R17-D6-01、R17-D6-02；
    - 次要 6：R17-D4-03、D5-01、D8-01、D13-01、D14-01、D15-01。
  - D2、D3、D7 的扣分来自上述条目中的 Pi 事实、断言与诚实后果，不单独编号。
- **设计是否完成：否。**
  - 四个重要项实现时会直接表现为：
    - 人写的转向与“不要回退”的说明在叠加原因下静默丢失，采纳的人改动被当作 Agent 内容自动返工；
    - “返工有上限”与停止条件给出两种去向，且可被一次点击关闭；
    - drain 中再有暂停请求时，DDL 拒绝合并，或者外部写入在崩溃后失去保护；关机时的恢复语义自相矛盾；
    - 进程组判据既漏掉目标进程，又可能终止用户的无关进程。
  - 每一项都可以用一段设计规则关闭：
    - 改写时合并载荷，`pendingHandBack` 执行时并入 `openings`；
    - `rework_cycles_over` 只归 I6；
    - `drainingFor.pending` 与 `intent`；
    - 进程组的成员按 [组长启动时间, 最近确认非空时间] 区间判定。
  - 关闭之前，不宜开工 Supervisor 的暂停出口、drain/恢复与 macOS 进程追踪。其余次要项多为边角组合、接线、文案与用例问题，范围有限。
- **下一轮建议按以下顺序修订**：
  1. 修正进程组判据，增加 G35c(j″)（R17-D6-02，涉及用户环境安全，优先）；
  2. 引入 `drainingFor.pending`/`intent`，修正 `CHECK` 与恢复规则，给“其余”定序，增加 G35e(e)–(g)（R17-D6-01）；
  3. 规定改写时合并载荷、`pendingHandBack` 执行时并入 `openings`，明确组装顺序，增加 G33d（R17-D4-01）；
  4. 裁决 `rework_cycles_over` 的唯一去向，确保 I6 不可被静默，修正 `scope:"run"` 的绑定（R17-D4-02）；
  5. 处理边角组合：准入时的硬上限守卫、持久化 `takeoverReasons`、补全 `verifyFrom` 写入点、settle 重跑的前置条件与阶段持久化、`claim` 的 pin 来源（R17-D4-03）；
  6. 处理多段开场的类型与投递、命令注册窗口、nudge 起点的重建（R17-D5-01）；
  7. 统一 `idle_without_submit` 的选项，修正 `04` L1401（R17-D8-01）；
  8. 处理检出或活跃 Run 存在时最近 seal 的合入（R17-D13-01）；
  9. 更新实验时间窗、补齐用例，完成 D15 清单并把 lint (k) 改为双向（R17-D14-01、R17-D15-01）。

  按 ADR-136/139，本轮修订若超出系统线 0.21、Agent 线 0.27 工作周的余量，须显式选择 ③ + ⑤ 或再顺延，并记 ADR。
