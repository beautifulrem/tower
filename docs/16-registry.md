# 16 · 注册表（Registry）

> 本文是 Tower 设计文档的**单一来源**（ADR-039）：标识符与枚举、默认数值与阈值、快捷键、刷新节奏、远程能力矩阵、特性开关、“每个概念在哪里规定”的章节索引，以及包管理器环境变量表（§16.8，ADR-045）。
>
> **使用规则**
> 1. 其他文档只**引用**本文的值，不再重复定义；仍保留的对照表（`07` §7.13、`08` §8.14、`09` §9.13）必须与本文一致，冲突时以本文为准。
> 2. 本文只登记“是什么”，不解释“为什么”。语义、算法与理由留在“所属 §”一列指向的文档；本文与所属文档的**语义**冲突时，以所属文档为准并在下一轮 lint 中修正本文。
> 3. 修改任一标识符或默认值时，先改本文，再改所属文档，并运行一致性 lint（`reviews/round-1-lint.md` 描述的检查：标识符拼写、数值、章节引用、过时术语）。
> 4. 第 1 轮 lint 的 12 个未决冲突已全部裁决（`reviews/round-1-lint.md` §4 的处理记录见 `reviews/round-1-response-spine.md`）；第 2 轮 lint 的改动与未决项见 `reviews/round-2-lint.md`；未来的未决项以 ⚠ 标出并记录在 `reviews/`。
>
> 写入者标记沿用 `02`：🧑 Human · ⚙️ Harness · 🤖 Agent · 🔁 Derived。

---

## 16.1 标识符与枚举

### 16.1.1 Goal 生命周期与原因

| 标识符 | 取值（按顺序） | 所属 § | 备注 |
|---|---|---|---|
| `LifecycleState` | `draft` · `shaping` · `ready` · `running` · `paused` · `claimed` · `verifying` · `in_review` · `accepted` · `integrated` · `archived` · `abandoned` | `02` §2.4；转移 `03` §3.2 | 终态：`archived`、`abandoned`（I1：只有经 🧑 的 `accepted`/`abandoned` 才能到达） |
| `Goal.waitReason`（state=ready） | `slot` · `dependency` · `review_capacity`（`manual` 没有写入路径，ADR-177 删除） | `02` §2.4；准入 `06` §6.2.4 | 资源与端口不足也记为 `slot`，卡片注明“机器资源 / 等待服务端口”；启动闸门（准入检查 h）同样记为 `slot`，卡片注明“等待启动自检”或显示 `清理中 · 残留进程`（`12` §12.6.4、§12.6.5，ADR-224/225）；可写（准入检查 i）的租约与 Project 可达两项同样记为 `slot`，卡片注明“该仓库正被另一个 Tower 使用”“Project 不可达”（`06` §6.2.4；可达按 Goal 判定，ADR-233/235/236）；`review_capacity` 只在阻止模式（M2，E8）下出现（ADR-014/191） |
| `ready` 的入口与出口（ADR-145–151） | **入口**（`ready` 中 `queuedRun` **恒非空**，`06` 以 `CHECK` 保证）：合同批准 → `queuedRun{initial}`；依赖回退 → `{resume}`；任何要开 Run 的转移（自动返工、`request_changes`、`retry_after_human_change`、交还 `continue_agent`、`resume` 与继续目标 `run`）先经过准入（唯一定义 `06` §6.2.4），无执行槽位或依赖未满足时进入 `ready{waitReason}` 并写对应类别，`pendingOpenings` 保留。**准入按 `queuedRun.kind` 判定**：只有 `initial`（该 Goal 的**第一次启动**）受评审余量闸控。**准备阶段**（准入已通过、`run.started` 之前；步骤与计时唯一定义在 `10` §10.3.1，ADR-149/150/151）：准入时写 `Goal.preparingSince`；依次为 ① **仓库准备**——镜像首次建立（含跨卷复制）→ 项目锁 → 远端 fetch → LFS 对象补齐 → `clone --shared` 与检出（含 LFS 内容写出），时限 `prepare.repoTimeoutMin`（15 min），不计入 120 s；检出以完成标记判定，重试时卫星存在而标记缺失则删除工作目录后重新检出（gitdir 与影子保留）；② **依赖物化**，时限 `prepare.depsTimeoutMin`，**不阻止 Run**（失败或超时 → `prepare{ok:false}` 照常进入 `running`）；③ **Host 握手与开场组装**（含 Host 启动之前的静态清单计算，其中全局根查询另有 60 s 时限，`05` §5.10，ADR-215）——**120 s 只计这一步**。① 或 ③ 失败或超时 → `paused(prepare_failed)`（LFS 补齐失败的原因写“LFS 对象缺失：<数量>”），继续目标 `run`，`queuedRun` 保留，不在启动时自动解除、不 `autoResume`，Needs-You `stalled{prepare_failed}`（出口：`resume`——从已完成的步骤继续，路径冲突时先改名重建卫星；`take_over`——仅当检出完成标记存在；`abandon`）。**启动恢复**只对 `state = ready`、`preparingSince` 非空且没有任何暂停原因的 Goal 生效。**准备期间的命令**：① 与 ② 中 `pause` 允许并中止该步骤（→ `paused(human)`，继续目标 `run`，`queuedRun` 保留，已获取的对象重试时复用）；③ 中 `pause` 与 `goal.openings.withdraw` 返回 `E_BUSY`（③ 只读开场队列、不消费，消费点唯一是 `run.started`，`06` §6.4.3，ADR-183）；**`take_over` 要求检出完成标记存在**，否则 `E_STATE`（“工作区尚未建立”，界面不提供“我来改”）；完成标记存在时，准备阶段（① ② ③）中一律返回 `E_BUSY`（与 `06` §6.4.3 `goal.take_over` 相同，ADR-149/182）；**`abandon` 始终允许**并中止准备。进度事件 `prepare.progress`。**准备中途到达其他原因** → 中止准备，以这些原因进入 `paused`，继续目标 `run`，`queuedRun` 保留。**出口**：`run.started` → `running`（`Run.reason` = `queuedRun.kind`）；🧑 `pause` → `paused(human)`，继续目标 `run`，`queuedRun` 保留；🧑 `take_over` → `paused(human)` + 人工编辑检出——**只在检出完成标记存在时提供**（ADR-151）；自 `ready` 接管后放弃改动 → 保持 `paused(human)`，不自动开 Run；🧑 `abandon`。**`ready` 中检测到来源不明的写入**（检出完成标记存在时）→ `paused(external_change)`，继续目标 `run`，`queuedRun` 保留。重启时 `ready` 保持 `ready` 并重新判定准入 | `03` §3.2；`06` §6.1.6、§6.2.4 | |
| `Goal.queuedRun`（ADR-147–151） | `{kind: "initial" \| "resume" \| "rework" \| "handback", decisionId?}`：`ready` 中**恒非空**；准入按它的类别判定（只有 `initial`——该 Goal 的第一次启动——受评审余量闸控）；`run.requested{kind}` 以它发出。**清除点**（ADR-149/151）：`run.started` 的同一事务、`abandon`，以及 Goal **进入 `ready`/`paused` 以外的任何状态**时（例如交还 `reverify` 进入 `verifying`）；`pause`、`take_over`、`external_change`、`prepare_failed` 与准备中崩溃都保留它。`decide()` 选择返工时 `queuedRun` 必然为空（上一次 Run 开始时已清除），因此写入 `rework` 与“自动路径不覆盖”不冲突。写入表见下一行 | `02` §2.4；`03` §3.2；`06` DDL `goals.queued_run`（`CHECK`：`state = 'ready'` ⇒ 非空） | |
| `queuedRun` 的优先规则（ADR-150） | **已保留的 `queuedRun` 优先于写入表**；写入表（下一行）**只在 `queuedRun` 为空时**适用——因此 `prepare_failed` 后重试的首次启动仍是 `initial`，继续受评审余量闸控。**人的显式决定覆盖保留值**：交还 `continue_agent` → `handback`；`request_changes`、`retry_after_human_change` → `rework`。自动路径（继续目标 `run`、`resume`）**不**覆盖 | `03` §3.2；`02` §2.4 | |
| `Goal.preparingSince`（ADR-150） | 时间戳（`06` 列 `goals.preparing_since`）：准入时写入，在 `run.started`、中止或失败时清除（`06` §6.8 F8 的中止除外：保留，ADR-233）；启动恢复只对 `state = ready`、`preparingSince` 非空且没有任何暂停原因的 Goal 生效——已暂停的 Goal（例如人在依赖物化或仓库准备期间暂停）不受影响 | `02` §2.4；`06` §6.1.6；`10` §10.3.1 | |
| 转移 → `queuedRun.kind` / `Run.reason`（唯一写入表，ADR-149） | 合同批准 → `initial`；依赖回退、`resume`、继续目标 `run` → `resume`；自动返工、`request_changes`、`retry_after_human_change` → `rework`；交还 `continue_agent` → `handback`。**只在 `queuedRun` 为空时适用**（优先规则见上一行；人的显式决定 `continue_agent`、`request_changes`、`retry_after_human_change` 覆盖保留值，ADR-150）；转移因准入失败进入 `ready` 时写入 `queuedRun.kind`；**不经排队直接开 Run 时 `Run.reason` 取同一映射**（立即执行的交还记 `handback`）。`kind` 与 `Run.reason` 一一对应 | `02` §2.4、§2.6；`03` §3.2；`06` DDL | |
| `reworkCycles` 的递增点（ADR-147） | 在 `decide()` **选择返工的那一刻**递增——不论随后直接开 Run 还是进入 `ready` 排队；排队中的返工被人 `pause`/`abandon` 时计数不回退。I6（`Contract.maxReworkCycles`）因此不可能被排队绕过 | `03` §3.3 I6；`07` `decide` | |
| `Goal.pauseReason`（state=paused） | `human` · `budget_soft_cap` · `stop_condition` · `idle_without_submit` · `verify_failed_limit` · `sentinel_high` · `human_change_verify_failed` · `app_quit` · `engine_crash` · `satellite_missing` · `verify_env_error` · `s0_grant_pending` · `post_settle_activity` · `question_timeout` · `external_change` · `provider_unavailable` · `budget_hard_cap` · `stalled_timeout`（ADR-183：`use_defaults` 下检测器 escalate 的 `stalled` 条目超时、按默认暂停；条目保持打开，界面以 `⚙ 超时默认` 显示，不写“你”）· `prepare_failed`（来源清单的唯一定义，ADR-239；`02` §2.4、`03` §3.2.1、`06` §6.8 F4b、`08` §8.6.5、`04` §4.8.11、`12` §12.6.5 与 §16.1.7 引用，不另列全集；ADR-149/150/151：`ready` 的准备阶段中仓库准备（镜像、项目锁、fetch、LFS 补齐、卫星检出）失败或超过 `prepare.repoTimeoutMin`，或 Host 握手与开场组装（含清单计算）失败或超过 120 s，含 Host 启动自检不通过与全局根查询出错或超过 60 s（`05` §5.3.5、§5.10，ADR-187/215），`host.spawn` 之前删除本 Host 的 stdio MCP 空目录失败（`11` §11.3.4 (a)，ADR-218），以及读到无效的 Pi 设置（`05` §5.3.6 代理一行，ADR-234/235/236）；以及 `running` 中 Tower 工具被 Run 中途注册的同名扩展工具遮蔽（gate 阻断该调用、drain 后进入，`05` §5.6.5，ADR-188/189），或上下文交接时 Host 的来源自检不通过（`03` §3.2.1，ADR-217），或 tower-goal 的同一处理器连续 3 次出错（按处理器计数，drain 后进入，`05` §5.6.5 第 6 项，ADR-238/239）；依赖物化失败**不**产生它；**不在启动时自动解除**，不 `autoResume`） | `02` §2.4；出口 `03` §3.2.1；文案 `12` §12.6.5 | `autoResume=true` 用于 `app_quit`、`engine_crash`（`06` §6.1.4：启动时只在 `resumeOnLaunch` 打开时解除，已生成条目的 `engine_crash` 除外，`08` §8.6.3）与 `provider_unavailable`（探测 60 s 起指数退避至 10 min，探测不计费，`03` §3.2.1；只在同组已存活的空闲 Host 中探测，没有时由人重试，`06` §6.1.4 第 5 项，ADR-235）。`post_settle_activity`：同一 Goal 1 小时内第 2 次（ADR-025）；`question_timeout`：ADR-023 |
| `pauseReason` 优先级（同时成立时取最高） | `human` > `app_quit` > `budget_hard_cap` > `budget_soft_cap` > `engine_crash` > `prepare_failed`（ADR-149）> `satellite_missing` > `provider_unavailable` > `question_timeout` > `stalled_timeout`（ADR-183）> 其余；被覆盖者记入持久化字段 `Goal.alsoApplies`；最高原因解除后取剩余最高者（ADR-084）；优先级**只决定显示与哪个原因先被处理，不决定解除后的去向**——去向唯一由 `Goal.continuation` 与 `onAllReasonsCleared()` 决定（ADR-134）；**显示**：卡片与实况行显示最高原因，其后以 `· 另有：<原因>` 后缀显示 `alsoApplies` 中优先级最高的一个（多于一个时为 `· 另有 N 项`，`12` §12.6.5）；`satellite_missing` 在非 running 时只是叠加态（`satelliteRebuilding`），不参与本表 | `05` §5.5（R4-D4-04） | abort 引起的暂停按 abort 原因取值，`question_timeout` 只用于 Pi 侧兜底超时；drain 期间到达的请求并入 `Goal.drainingFor.reasons`，drain 结束时按本表取最高者为 `pauseReason`（ADR-141） |
| `pauseReason` 推导来源与交还（ADR-103/104/107，R8-D7-01、R8-D4-01、R9-D7-01、R9-D4-01c） | 交还时解除与保留哪些原因的唯一定义（`03` §3.2.1 `human` 行、`06` `goal.hand_back`、`04` §4.6.7 引用，不复述，ADR-208）。**由 pin 推导，交还时清除**：`verify_failed_limit` · `verify_env_error` · `s0_grant_pending` · `human_change_verify_failed` · `sentinel_high`（当其阻断命中不含下述 run 类阻断时）。**交还即解除**（交还本身是人在场的显式决定）：`human` · `app_quit` · `engine_crash` · `prepare_failed`（交还后的下一次准备重新尝试，ADR-149）· `idle_without_submit` · `question_timeout` · `stalled_timeout`（ADR-183）· `stop_condition` · `post_settle_activity`。**交还时保留**：外部条件仍成立的 `budget_soft_cap` · `budget_hard_cap` · `provider_unavailable` · `external_change` · `satellite_missing`；以及含 **run 类阻断命中**的 `sentinel_high`：`input_mutated_after_gate`（ADR-107/110，只提供“覆盖（写明原因）”与“放弃”，不提供返工）与 `nested_repo_live`（ADR-131，不可覆盖；出口只有 `goal.resume` 附必填转向、`goal.take_over`、`goal.abandon`——写下 `Goal.pendingHandBack` 之后 `goal.take_over` 不可用，`03` §3.2.1，ADR-215——条目消失即解除）。仍有保留原因时 Goal 留在 `paused(<最高者>)` 并写 `Goal.pendingHandBack` | `10` §10.8.4；`03` §3.2.1 | 逐检测器的来源见 §16.1.6 |
| `Goal.s0Grant` | `none` · `pending` · `granted` · `denied` · `denied_timeout`（`use_defaults` 下超时默认拒绝） | `02` §2.4；ADR-077 | 决定 `grant_s0_exec` / `deny_s0_exec`；`denied`/`denied_timeout` → exec 标准不执行，由 `decide()` 判定；无阻断命中且 artifact 标准通过时为 `not_machine_verified{s0_denied, by}`（ADR-188） |
| `Goal.s0GrantExpiresOn`（ADR-179/180） | `run_end` · `next_run_start`；为空 = 不按事件失效（本机批准）。经远程连接批准的 S0 执行授权按 `11` §11.9 远程授权的统一有效期写入：Run 中 → `run_end`，没有 Run 时 → `next_run_start`；到达该事件时 `s0Grant` 回到 `none`（启动恢复把未结束的 Run 判为结束时，同一事务按 `run_end` 处理，`06` §6.1.6），与 `11` §11.2 的其余失效条件（合同修订、检查点命中 `scope.protected`）取先到者（ADR-182）。审批授权没有事件型失效：远程客户端只能选“仅这一次”，`AutonomyMatrix.grants[].expiresOn` 已删除（ADR-180） | `02` §2.4；`06` DDL `goals.s0_grant_expires_on`；`11` §11.9 | 失效后需要时重新申请 |
| `Goal.verifyFrom` | `claimed` · `in_review` · `accepted`：当前或最近一次验证的源状态（ADR-084），持久化（`06` `goals.verify_from`）；`continuation.verify` 不另存源状态而取它。**写入点（唯一定义，ADR-137）**：进入 `claimed` 时（settle 序列中 pin 与 `claimed` 同一事务；`claim` 目标）写 `claimed`；由 I2、`retry_verify`、`grant_s0_exec`、检验带回（`bring_back`）、标准修订从 `in_review`/`accepted` 进入 `verifying` 时写该状态；`paused` 中标准修订把继续目标 `review{state, pin}` 改写为 `verify{pin}` 时，同一事务写 `state`（ADR-180）；守卫把 `verify` 改写为 `verify_new` 时，`returnTo` 取当时的 `verifyFrom`（若 ∈ {`in_review`, `accepted`}，ADR-143 补记 2）；`verify_new` 执行时写 `returnTo`，`returnTo` 为空时写 `claimed`（**不沿用旧值**）；`pendingHandBack.reverify` 的 `returnTo` = `pendingHandBack.returnTo`（交还时由 `takeoverFrom` 取得，若 ∈ {`in_review`, `accepted`}，否则为空，ADR-213）。验收延续（`03` I2）与 `onlyChangedUnits` 据此判定 | `02` §2.4；`03` §3.2.1；`06` DDL；`07` §7.10.3 | |
| `Goal.continuation`（`Continuation`，ADR-134/140） | **纯目标，不携带数据**（字面形状唯一定义在 `02`，lint (c) 比对）：`{kind:"run"}` · `{kind:"settle"}` · `{kind:"claim", decisionId}` · `{kind:"verify", pin}`（`secretPhaseOnly` 随带机密的标准移到 M2，ADR-164）· `{kind:"review", state: "in_review" \| "accepted", pin}` · `{kind:"verify_new", returnTo?}`。**写入**：Goal 从非 `paused` 状态第一次进入 `paused` 时按来源状态写入（`running` 或 `ready`（排队中的 Run，`queuedRun` 保留，ADR-147）→ `run`；settle 序列中由任何原因进入 → `settle`；`claimed`/`verifying` → `verify{pin}`（`claimed` 中总有 pin）；`in_review`/`accepted` → `review`；**例外**：任何开 Run 的转移（含 `in_review`/`accepted` 中的 `request_changes`）在开 Run 前遇到预算硬上限而进入 `paused(budget_hard_cap)` 时写 `run`（`03` §3.2.1，ADR-176）；接管时按 `takeoverFrom`，从 `paused(*)` 接管保持原目标）；从 `running` 进入时先 drain（`Goal.drainingFor`），drain 结束时才写；叠加原因不覆盖。**改写**只换目标、不丢数据，只由 `03` §3.2.1 注明的显式决定（`keep_external_change`：`verify`/`review` → `verify_new`；`override_sentinel`、`retry_verify`、`retry_claim`（→ `settle`）、`claim_on_behalf`（→ `claim`）、`goal.resume` 对 `verify_failed_limit`/`idle_without_submit`/`post_settle_activity`/`nested_repo_live`（→ `run`）、`request_changes`（`sentinel_high` 中，→ `run`）、`revert_external_change`（E 中剩余差异来自存活进程且目标为 `verify`/`review` 时，→ `verify_new`；ADR-181 补登）、`discard_human_edits` 的存活进程分支、`amend_contract` 新增或修改标准而目标为 `review{state, pin}` 时（→ `verify{pin}`，同一 pin，同一事务写 `Goal.verifyFrom = state`，ADR-178/180））；每次写入记事件 `goal.continuation.set`。开场载荷不在这里，见 `Goal.pendingOpenings`。**执行**（唯一转移函数 `onAllReasonsCleared()`）：① `pendingHandBack` 优先，执行后清除它与继续目标（**不**清除 `pendingOpenings`）；② `run` → 开 Run，开场按序消费 `pendingOpenings`（空则 `tower.resume`）；**此时若无执行槽位或依赖未满足 → 进入 `ready{waitReason}`**（`03` 的 `paused → ready` 边），`pendingOpenings` 保留，准入后开 Run（ADR-145）；`settle` → 从宽限确认起重跑 settle 序列（Host 不存在时按 ADR-143）；`claim` → 直接进入 `claimed`，Trace 记“人代为提交”；`verify` → 以该 pin 验证；`review` → 回到 `state`；`verify_new` → 以当前树生成新 pin 验证，`Goal.verifyFrom = returnTo ?? claimed`；③ 守卫：目标为 `verify`/`review` 而当前树 ≠ 目标 pin 的树 → `verify_new`。验证失败是否自动返工**不由目标决定**，见下方“验证失败的去向”行 | `02` §2.4（形状）；`03` §3.2.1（唯一规则）；`06` DDL `goals.continuation` | 已废弃的旧字段见 §16.1.13 |
| `Goal.pendingOpenings`（ADR-140/144） | `OpeningRef[]`，`OpeningRef = {id, decisionId} \| {id, factId}`（`id` 为稳定的条目 id；`factId` 引用验证失败的 Fact，用于返工证据，ADR-144）：自带开场的决定（`resume{note}`、`retry_after_human_change`、`request_changes`、`keep`/`revert` 的 `tower.external_resolved`、交还、继续目标为 `settle` 时的作答（ADR-176）与所属 Run 已结束的阻塞条目的作答（ADR-178））与 Tower 产生的条目（硬上限挡住的返工证据等）按序追加（卫星重建的告知 `tower.satellite_rebuilt` 不经本队列，由开场组装时从事件生成，§16.1.12，ADR-180）；**下一次任何 Run 开始时**（总规则；例如继续目标 `run`、`pendingHandBack.continue_agent`、自动返工、`in_review` 或 `accepted` 中的 `request_changes`）按追加顺序消费组装进本次开场的条目（`run.started{openingIds}`；准备第 ③ 步开始之后追加的留给下一个 Run，时序唯一定义在 `06` §6.4.3，ADR-184），组装为多段开场 `RunOpening = {tower: TowerMessage[], human?}`（ADR-143：`tower` 中的消息依次以 `triggerTurn:false` 追加，最后一条以 `triggerTurn:true` 或以 `prompt(human)` 开始回合）。执行 `pendingHandBack`、继续目标的改写、验证与评审都**不**清空它；**验收（`goal.accept`）也不清空**——条目留在队列，验收后若再开 Run（例如 `request_changes`、接管后 `continue_agent`）就随开场送出；归档与放弃后不再有 Run，条目不送达、轨迹中可查，卡片不再显示该行，撤回返回 `E_STATE`（ADR-187）；复活建的是新 Goal，不携带队列（ADR-186）。**可见、可撤回**（ADR-144）：Goal 卡片与暂停卡片显示“下次运行开场：N 条”，展开可逐条撤回（`goal.openings.withdraw{goalId, openingId}`，记 `HumanDecision{withdraw_opening}`）。**消费时点**：开场在 Run 开始时、与 `run.started` 事件同一事务中被消费（ADR-145）。撤回的结果：条目仍在队列 → 移除，成功；**已被消费** → 返回 `already_delivered`，界面提示“已发送，无法撤回”；已被撤回 → 返回成功（幂等，两个客户端同时撤回同一条不会出错）；Tower 自己产生的条目同样可撤回，撤回后 Agent 不会收到它 | `02` §2.4；`03` §3.2.1；`05` §5.6.3；`06` DDL `goals.pending_openings` | |
| `Goal.takeoverPriorReasons`（ADR-140） | `PauseReason[]`：`take_over` 时持久化的接管前原因集合；`discard_human_edits` 判定是否保留 `paused(human)` **只读它与 `takeoverFrom`**：`takeoverFrom ∈ {running, ready}` 或它含 `human` → 保留 `paused(human)`（ADR-147）；交还或放弃后清除 | `02` §2.4；`03` §3.2.1；`06` DDL `goals.takeover_prior_reasons`；`10` §10.8.4 | |
| 验证失败的去向与**归因窗口**（唯一规则在 `03` §3.2.1，ADR-140/144/145） | **人的改动** = `author:"human"` 的检查点、`mixedPaths` 非空的检查点（`Checkpoint.author` 只有 `agent`/`human`，“mixed”是路径级标注，不是作者值；`mixedPaths` 非空的检查点在 `revert` 之后仍计入），以及 rebase（M2）带入的 base 变化（landmark `rebase` 的检查点；只有这类变化时，失败卡片与状态标签写“包含 base 的变化（rebase）”，不写“你的改动”，ADR-145/146）。M2 中 `!cmd` 与 Agent 工具调用窗口重叠期间写入的路径，以及窗口内有不属于该 `user_bash` 调用进程树的 Agent 进程存活时写入的路径，都记入 `mixedPaths`（`10` §10.3.1 第 2′ 行，ADR-146/147）。**窗口以事件序号界定**：只计入事件序号大于起点事件的检查点；交还第 8 步的 `human_edit` 检查点在 `HumanDecision{hand_back}` 事件之前写入（同一事务内先检查点、后决定），因此不在该交还开启的窗口内——交还后再失败按 Agent 路径自动返工（ADR-145）。**窗口起点** = 以下两者中较晚者：最近一次**通过**的验证的 pin——“通过”只在 `03` §3.2.1 定义（结论标签为已验证或有保留的已验证，含经覆盖哨兵进入 `in_review` 的那次验证，或经验收延续回到 `accepted`；未经机器验证不算，ADR-187）；人最近一次**明确把工作交给 Agent** 的决定（封闭列表只在 `03` §3.2.1 定义：`hand_back{continue_agent}` 等四项，含 `reverify` 模式下置换 `pendingHandBack.mode` 的 `resume`，ADR-217；`claim_on_behalf` **不算**，不移动起点）。没有通过的验证时，起点为 `Binding.boundSeq`（绑定事件的序号，不随 rebase 移动；多仓库 Goal 按仓库分别计算，ADR-146）。窗口内有人的改动 → 不自动返工，`paused(human_change_verify_failed)`；否则按 Agent 路径（`reworkCycles < Contract.maxReworkCycles`；计数在选择返工时递增，见下方“`reworkCycles` 的递增点”行）。Agent 路径的返工因预算已达硬上限不能开始 → `paused(budget_hard_cap)`（`verifying` 失败后的这条入口见 `03` §3.2.1），继续目标 `run`，返工证据以 `{id, factId}` 入 `pendingOpenings`（ADR-144/145）。`verifyOrigin` 只是 Trace 与 Fact 的说明字段 | `03` §3.2.1、§3.3 I6；`07` §7.10.3 | |
| `Binding.boundSeq`（ADR-145/146） | 整数：该 binding **绑定事件**的事件序号，**不随 rebase 移动**（`06` 列 `bindings.bound_seq`）；归因窗口在还没有“通过”的验证时以它为起点；rebase 带入的变化由 landmark `rebase` 的检查点计入窗口。**多仓库 Goal**：窗口按仓库分别计算（各 binding 的 `boundSeq` 与该仓库的检查点），任一仓库窗口内有人的改动即视为有人的改动 | `02` §2.4；`03` §3.2.1；`06` DDL；`07` `decide` | |
| `Goal.drainingFor`（ADR-138/141/144/145） | `{target: "pause" \| "take_over" \| "rewind" \| "dependency", reasons: PauseReason[], decisionIds: DecisionId[], requestedAt}`：drain 开始的**同一事务**中写入（`06` 列 `goals.draining_for`，`CHECK (draining_for IS NULL OR state = 'running')`）；drain 期间到达的暂停请求只**并入** `reasons`（不覆盖、无需排序）；drain 结束时 `pauseReason` = `reasons` 中按本节优先级最高者，其余进入 `alsoApplies`，写继续目标后清除。`externalChange` 非空 ⇔ `pauseReason`/`alsoApplies`/`drainingFor.reasons` 任一含 `external_change`。**崩溃恢复**（唯一规则在 `06` §6.1.6，ADR-141）：`target = pause` → 以 `reasons` 进入 `paused`，其中的 `app_quit`/`engine_crash` 按 `06` §6.1.4 第 5 项在启动时解除（只在 `resumeOnLaunch` 打开时；已有 `stalled` 条目的 `engine_crash` 除外，ADR-207）；只有 `app_quit` 时等同正常的应用退出（按 `resumeOnLaunch` 设置）；`target ∈ {take_over, rewind}` → `paused(human)`，卡片文案“上次的操作未完成，请重新执行”（使用已有的 kind，不新增 Needs-You kind）；`target = dependency` → `ready{waitReason:"dependency"}`。**非 `pause` 目标并入了原因**（ADR-144）：`take_over`/`rewind`/`dependency` 的 drain 期间若有任何暂停原因并入 `reasons`，drain 结束时**放弃原目标**，进入 `paused(reasons ∪ {human})`（人在原因处理后重做接管或回退；依赖回退在离开暂停时重新判定），崩溃恢复同一规则——回退因此不会覆盖未处置的外部写入。**drain 期间只有暂停原因可以并入**；再请求另一个目标（接管、回退）返回 `E_BUSY`（“等待当前步骤结束后重试”）；`run.rewind` 与 `goal.take_over` 一样在 `external_change` 未解除时返回 `E_STATE`（ADR-145）。**settle 序列中崩溃**（无 drain）由 `runs.phase = 'settling'` 识别 → 继续目标 `settle`，按 ADR-143 的 Host 不存在规则执行；否则按 Run 中崩溃 → `run`（ADR-145）。settle 判定表中“nudge 守卫不成立 → 直接 `idle_without_submit`”只适用于非 draining 且 `outcome = completed` | `02` §2.4；`05` §5.5；`06` §6.1.4、§6.1.6、§6.3；`10` §10.3.1 | |
| `Goal.baseChoice`（ADR-158 补记、ADR-159） | `{side: "remote" \| "local", towerTip, userTip, at} \| null`（`06` JSON 列 `goals.base_choice`）：`goal.base.choose` 写入；同一对分叉提交（`towerTip`、`userTip`）仍然存在时，`baseTip()` 对该 Goal 返回所选一侧；任一侧变化即清空并重新判定。只影响 base 前进提示与 `integrated` 观测，不改变 `baseCommit` | `10` §10.1.2；`06` §6.3 |
| `Goal.externalChange` | `{paths, mixedPaths, baselineCps, detections: {at, paths}[]}`：`external_change` 的持久状态（ADR-128/134；检测时所处的状态不在此处，解除后的去向由 `Goal.continuation` 决定）；`06` JSON 列 `goals.external_change`，由事件 `goal.external_change.detected` / `.resolved` 投影（§16.1.12）。重复检测时路径并入 `paths`，`baselineCps` 保持首次检测时的值，元素为检查点或提交（没有对应检查点时为当前 pin 或 `baseCommit`；归因基线唯一定义在 `10` §10.3.1，ADR-211）；`mixedPaths` = drain 期间同一路径也有 Agent 工具写入。**解除**：`keep` · `revert` · 交还 `take_human` · 非终态中观测到合并（`obsolete`）；`take_external`/`keep_both` 不解除。`discard_human_edits` 在本字段已存在时把差异路径并入、基线保持首次值（ADR-134）。`revert` 之后只考察 E 中的路径（ADR-134）。存在时 `goal.take_over` 返回 `E_STATE`。I2 与 `external_change` 的分界唯一定义在 `10` §10.3.1：来源为 Tower 自己的工作、人的显式采纳或存活进程（`agent_bg`）→ I2；来源不明 → `external_change` | `02` §2.4；`03` §3.2.1；`06` DDL；`10` §10.3.1 | 非空 ⇔ `external_change` 是 `pauseReason` 或在 `alsoApplies` 中 |
| `Goal.humanCheckout` | `{path, baseTree, createdAt, syncState: "idle" \| "syncing", written?: string[], targetTree?, rebuiltTree?, params?: {mode?, note?, sealNote?, externalResolution?, resolvePinHits?}}`（形状唯一定义在 `02` §2.4；`rebuiltTree` = 接管期间 Tower 重建卫星所用的树，交还第 6 步以它代替 T0 作比较基准，ADR-178）：人工编辑检出存在期间持久化；`syncing` 表示写回已开始而未完成（正在本进程中执行时为“写回进行中”；在本进程中失败时同一事务退回写回之前的状态、不留下 `syncing`，见 `06` §6.4.3 `inspect.bring_back` 行，ADR-219/220），重启后以 `targetTree`（目标树 T1）幂等续写（ADR-099/176）；`params` 是交还或带回的参数，与 `targetTree` 在写回开始的同一事务中写入，续写与后续步骤只从这里读取（ADR-178）。存在时 `goal.resume` 返回 `E_STATE`，且该 Goal 的自动 rebase 与机会式验证暂停，（M2）合并队列条目标为 `suspended`（保留位置）。`inspect.bring_back` 复用同一 `syncState` 写回机制（来源为检验检出，基线为 pin 树，ADR-105）。`take_over` 源状态 `running`（先 drain）· `ready`（只在检出完成标记存在时，ADR-147/151/152）· `paused(*)` · `in_review` · `accepted`（未集成），一律进入 `paused(human)` 并记 `takeoverFrom`；`Goal.externalChange` 非空时返回 `E_STATE`（先 `keep`/`revert`，ADR-128）。出口：`goal.hand_back`（要求检出存在；交还时只清除由 pin 推导的原因与哨兵，见上方“推导来源与交还”行；仍有保留原因则“交还后仍暂停”并持久化 `pendingHandBack`（选 `take_external` 时 `mode` 为空、不写，ADR-134）；否则二选一：交给 Agent 继续 → `running`，直接重新验证 → `verifying{verifyOrigin:"human_change"}`）· `goal.discard_human_edits`（唯一定义在 `06` §6.4.3；lint U1 的裁决：`takeoverFrom ∈ {in_review, accepted}` 且卫星树等于 pin 树 → 不改写继续目标，由 `onAllReasonsCleared()` 决定去向（通常回到 `takeoverFrom`；接管期间修订标准使继续目标已改写为 `verify{pin}` 时先验证，`10` §10.8.4，ADR-182），（M2）`suspended` 的队列条目恢复原位置；`takeoverFrom ∈ {in_review, accepted}` 但树不等 → 差异按 `10` §10.3.1 的归因表分类（ADR-128/134）：存活进程的写入 → 继续目标改写为 `verify_new`，其余 → 记入 `external_change`（已存在则路径并入、基线保持首次值；否则基线 = 比较基准的检查点（接管以来重建过卫星时为记录重建树的检查点，`10` §10.16.2；否则为当前 pin 的检查点，没有时为 pin 本身，`10` §10.3.1，ADR-182/212）），**不验证**；命令解除 `human`，去向由 `onAllReasonsCleared()` 决定（含接管期间修订标准后被改写的继续目标，`10` §10.8.4）；`takeoverFrom ∈ {running, ready}` 或 `takeoverPriorReasons` 含 `human` → 不解除 `human`，保持 `paused(human)`（ADR-137/140）；不开 Run）· 检出丢失时 `goal.resume`。另：`goal.retry_after_human_change`（`paused(human_change_verify_failed)`，无检出）；`inspect.bring_back`（`in_review`/`accepted` → `verifying{human_change}`，以 pin 树为基线，`HumanDecision{kind:"bring_back_inspection"}`） | `02` §2.4；ADR-094/099；`10` §10.8.3–10.8.4；`04` §4.6.6–4.6.7 | |
| `Goal.takeoverFrom`（`06` 列 `goals.takeover_from`） | `running` · `ready`（ADR-147/151：只在检出完成标记存在时；否则 `take_over` 返回 `E_STATE`“工作区尚未建立”）· `paused` · `in_review` · `accepted`：接管时所在状态，用于写继续目标、判定放弃改动与交还的去向（`06` 的 `CHECK` 含 `ready`） | `02` §2.4；`03` §3.2.1；`10` §10.8.4 | |
| `Goal.pendingHandBack` | `{mode: "continue_agent" \| "reverify", at, decisionId, returnTo?: "in_review" \| "accepted"}`：交还时因保留原因仍处于 `paused` 时持久化人的选择（`mode` 必填；选 `take_external` 时不写）；`returnTo` 在同一事务清除 `takeoverFrom` 之前由它取得（∈ {`in_review`, `accepted`} 时才写），延后执行只读它（ADR-213）；它非空期间 `goal.take_over` 返回 `E_STATE`，先解除剩余的暂停原因（`03` §3.2.1、`06` §6.4.3，ADR-214/215）；它非空期间置灰并返回 `E_STATE` 的只有 `goal.take_over` 与 `goal.claim_on_behalf`，其余命令对继续目标的改写照常写入、但不改变结果，`mode = reverify` 时附转向解除 `nested_repo_live` 的 `goal.resume` 把 `mode` 置为 `continue_agent`——唯一定义在 `03` §3.2.1“`pendingHandBack` 等待期间的选项”（ADR-215/216）；`decisionId` 指向 `HumanDecision{hand_back}`，人写的意图从其 `note` 读取（R9-D4-01b）。**唯一执行入口**：`onAllReasonsCleared()` 第 1 步（ADR-134，取代独立的 `applyPendingHandBack`）——无论最后一个原因由系统事件还是 `goal.resume` 解除；执行时 `reverify` → 以当前树生成新 pin 验证（`verifyOrigin:"human_change"`，不开 Run；`Goal.verifyFrom = pendingHandBack.returnTo ?? claimed`——此时 `takeoverFrom` 已在交还时清除，ADR-137/213），`continue_agent` → `running`（注入 `tower.handback`）；然后清除它与继续目标（**不**清除 `pendingOpenings`，ADR-140）。从 `accepted` 接管并交还后 Goal 离开 `accepted`，合并队列条目移除、再次验收后才重新入队（合并队列属 M2） | `02` §2.4；`06` DDL；ADR-104/108/134；`10` §10.8.4、§10.11 | |
| `Goal.satelliteRebuilding`、`Goal.alsoApplies` | `boolean`；`PauseReason[]`（被更高原因覆盖、仍成立的常规暂停原因）——都持久化；叠加原因不改变 `Goal.continuation` | `02` §2.4；`06` DDL；ADR-084/134 | 原因解除后若仍有其他原因，取其中最高者为新 `pauseReason`；全部为空时调用 `onAllReasonsCleared()` |
| `Goal.shapingIssue`（state=shaping） | `no_proposal` · `crashed` · `budget` · `unresponsive` | `02` §2.4；`03` §3.2 | |
| `Goal.kind` | `code` · `investigation` · `docs` · `ops` | `02` §2.4；`03` §3.6 | 决定 Changes 面板形态 |
| `Goal.riskTier` | `low` · `standard` · `high` | `02` §2.4 | `high` ⇒ `review.viewPolicy ≥ "all"`、计划闸门、默认不加载扩展与 MCP（`noExtensions:true`，`11` §11.8.2，ADR-212）、只能在本机桌面验收（§16.5） |
| `Goal.verifyOrigin`（持久化） | `agent_submit` · `human_change` · `rebase` · `merge_queue` · `manual` · `opportunistic` · `agent_bg`（未解决的 `bg_process_survived` 期间后台写入使卫星树 ≠ pin 后的重新验证，ADR-122） | `02` §2.4；DDL `06` §6.3 | 与 `07` 的 `VerifyTrigger` 一一对应，见下一行；**只作 Trace 与 Fact 的说明，不决定失败去向**（ADR-140，见“验证失败的去向”行） |
| `VerifyTrigger`（验证器运行时） | `claimed` ↔ `agent_submit` · `fp_changed_human` ↔ `human_change` · `fp_changed_agent` ↔ `rebase`（Tower 自动 rebase） · `merge_queue` · `manual` · `opportunistic` · `agent_bg` ↔ `agent_bg`（ADR-122/176） | `07` §7.4.1 | 验证结束时的源状态记为 `verifyFrom ∈ {claimed, in_review, accepted}`（`07` §7.10.3）；它不是 `verifyOrigin`。合同试运行（`contract.trial_criterion` 的 `verify.requested{trial:true}`）不经 `verify(goal, trigger)`，没有 `VerifyTrigger`（ADR-179） |
| `Goal.integrationRevertedSeal`（持久化，ADR-176） | 被撤销合入的 seal（`Sha`）或空：`goal.undo_integrate` 与 Goal 由 `integrated` 回到 `accepted` 同一事务写入；界面据此显示 `reverted` 标记；该 seal 不再触发 `integrated`；Goal 之后以新 seal 被合入时照常判定。**从不清除**，只有再一次 `goal.undo_integrate` 覆盖它（ADR-181）：`integrated` 的唯一条件要求被合入的是最近一次验收的 seal，之后的 seal 与它的 sha 不同，旧值不会阻止合入；重新 seal 表“被撤销的 seal 曾写入 B”一行按分支的写入记录判定（`10` §10.6），写入 `B₀-v<k>` 后旧值不再命中；`reverted` 标记（文字徽章 `已撤销合入 · 需在你的仓库中 revert`，`12` §12.6.2，ADR-194）的显示条件（唯一定义，ADR-182）：该值非空，且撤销之后本 Goal 还没有写入新的 seal（最近一条 `integration.performed` 早于该次撤销）——再次验收写入新 seal、之后合入或归档的 Goal 都不再显示 | `02` §2.4；DDL `06` `goals.integration_reverted_seal`；唯一条件 `10` §10.12 | 撤销后的出口沿用 `accepted`（`03` §3.2），不提供直接复活 |
| 验证结论标签 | `verified` · `verified_qualified` · `not_machine_verified`；写入点只有进入 `in_review`/`accepted` 的 `goal.state_changed`（经覆盖哨兵改写的 `review` 目标进入时同样计算，ADR-187；S0 拒绝不改写继续目标，由 `decide()` 给出；其余转移照写最近一次写入的值，ADR-188） | `07` §7.10.3；视觉 `12` §12.5.2 | 字形 `▲` / `▲*` / `◬`；验收后：已验证 → `●`（绿）/ `●*`，未经机器验证 → `◍`“人工验收”（中性，归档后保持中性，R4-D9-01） |
| `not_machine_verified` 原因 | `human_only`（零机器标准，ADR-031）· `ecosystem_unsupported`（M1 非 Node，ADR-064）· `submodules_unsupported`（ADR-071）· `s0_denied{by: human\|timeout}`（ADR-068/077） | `07` §7.10.3；文案 `12` §12.5.2 | |
| `Freshness` 🔁 | `fresh` · `stale` · `expired` | `02` §2.7；判定 `07` §7.3.3 | |

### 16.1.2 Mode（封闭集合）与推导优先级

推导函数**只在** `08` §8.6.2 定义；事件 → 输入变量的映射在 `05` §5.5；徽章在 `12` §12.6.3；注意力映射在 `08` §8.6.5。下表按**推导优先级从高到低**排列（取第一个成立者）。

| 优先级 | Mode | 徽章（`12`） | 置位条件（`08` §8.6.1） | 基础注意力（`08` §8.6.5） |
|---|---|---|---|---|
| 1 | `unresponsive` | 无响应 `■` | 心跳迟到 > 30 s | 经 `stalled{unresponsive}` 条目，L3；自动“重启并恢复”期间不生成（时机见 `08` §8.6.3） |
| 2 | `waiting_human` | 等你 `◆` | 未决 `ask_user` | `question` 条目，L3 |
| 3 | `blocked_guard` | 等你批准 `◆` | 未决门禁审批 | `approval` 条目 |
| 4 | `budget_capped` | 预算封顶 `◆` | 软上限触发、正在 drain 到回合边界（Run 仍活跃）；drain 后进入 `paused(budget_soft_cap)` | `budget` 条目，L3 |
| 5 | `verifying` | 验证 | 验证器运行中 | L0 |
| 6 | `compacting` | 压缩中 | `compaction_start..end` | L0（频繁压缩 → L1） |
| 7 | `retrying` | 重试 n/m | `auto_retry_start..end` | L0（第 3 次或 > 2 min → L1） |
| 8 | `stalled` | 卡住 `◆` | 检测器 escalate（`07` §7.7.1 S1–S7） | nudge L1；escalate L2；部分子类型 L3 |
| 9 | `acting` | 执行 | 有工具在执行 | L0 |
| 10 | `thinking` | 思考 | Run 活跃 | L0 |
| 11 | `preparing` | 准备中 | worktree / 依赖 / Host 启动 | L0（> 10 min → L1） |
| 12 | `queued` | 排队 | 等槽位 / 依赖 / 评审余量 / 资源 | L0 |
| 13 | `settled` | 已停 | `agent_settled` 且无待办 | L0 |

- `thinking ↔ acting` 显示最短停留 500 ms；异常模式立即显示（`08` §8.6.5）。
- `ready` 中的 Goal 只可能处于 `queued` / `preparing`；`running`/`verifying` 之外的生命周期状态没有 Mode，用 §16.1.1 的原因字段解释。

### 16.1.3 合同与标准

| 标识符 | 取值 | 所属 § |
|---|---|---|
| `Contract.status` | `draft` · `ratified` · `superseded` | `02` §2.5；I3 `03` §3.3 |
| `Contract.draftedBy` | `human` · `agent` | `02` §2.5 |
| exec 标准的 `secretsVia`（**M2**，ADR-164；ADR-158/159；设计起点在 `11` §11.7.0a。M1 中 `exec` 标准的 `env` 字段不可用，合同编辑器拒绝并提供“改为 human 标准”） | `env`（**默认**，ADR-159：以 `<NAME>` 环境变量注入，兼容现有测试，受调度互斥保护，ADR-160）· `file`（可选：即时写入 `~/.tower/run/<deliveryId>/` 的 `0600` 文件，以 `<NAME>_FILE` 传路径，验证器沙箱只放行这一个文件，结束即删除；测试“跳过”计数增加时按 skip 哨兵处理并提示改读 `<NAME>_FILE`）；`env?: string[]` 只写名称 | `02` §2.5；`07`；`11` §11.7.0 |
| `Contract.unattended` | `wait`（默认）· `use_defaults` | `02` §2.5；计时 `08` §8.7.1；对话框 `05` §5.6.4 |
| `Contract.review.viewPolicy` | `all` · `risk_at_least_medium` · `high_risk_only` · `none` | `02` §2.5（`riskTier=high` 下限 `all`） |
| `Criterion.kind` | `exec` · `human` · `artifact` · `subgoal_accepted` | `02` §2.5 |
| `hand_back` 模式 | `continue_agent`（→ `running`，开场按序消费 `pendingOpenings`）· `reverify`（→ `verifying`；交还的检查点为 `author:"human"`，因此失败不自动返工——由归因决定，ADR-140） | `03` §3.2.1；`06` §6.4.3（ADR-094） |
| `VerifyProfile.prefetch` | 人批准的额外预取命令与域名（ADR-093）；内置预取域名：Playwright CDN、Prisma binaries、nodejs.org（headers）、Cypress/Puppeteer 下载源 | `07` §7.4.3 |
| `VerifyProfile.runnerExceptions` | `{package, via: "alias" \| "patch" \| "override" \| "source", baseCommit, decisionId}[]`：base 中已存在、经人确认一次的运行器别名/补丁/覆盖/非注册表来源；`runner_patched` 只对相对 base 新引入或修改的项报出（ADR-105，R8-D7-02） | `07` §7.4.3 |
| 验证导出命令 | `tower verify --export <verifyId>`：把重放包打包为可分享的归档（需显式操作，含脱敏检查；不含本地文件，ADR-174） | `07` §7.4.1 |
| `VerifyProfile.node` | 识别出的 Node 版本与来源（`.nvmrc` / `.node-version` / `volta` / `engines` / 默认 LTS），进入 `depsKey`（ADR-085） | `07` §7.13 |
| `VerifyProfile` 新字段（第 4 轮） | `packageManager?`（仓库无 `packageManager` 字段时人确认的版本）· `prepareTimeoutSec`（默认 600）· `generatedPaths`（生命周期/prepare 允许改动的 node_modules 内路径，默认 `.prisma`、`.cache`、`.vite`） | `07` §7.13 |
| 标准级生态判定 | 每条 exec 标准按其命令判定生态是否受支持；部分受支持 → `verified_qualified`（列出跳过的标准），全部不受支持 → `not_machine_verified{ecosystem_unsupported}` | `07` §7.4.1（R4-D7-03） |
| `VerifyProfile.exposeGit` | `false`（默认）· `true`：验证槽位不含 `.git`；为 `true` 时在槽位中以 pin 初始化一个只含该提交的临时仓库，供需要 git 的测试使用 | `07` §7.13 |
| artifact 检查 `checks[].type` | `exists` · `headings` · `links_internal` · `links_reachable` · `min_words`（`links_reachable` 属 M2、需标准声明 `network`；M1 的合同编辑器在批准时拒绝它，ADR-183） | `02` §2.5；`07` §7.4.9 |
| `verify_env_error.stage` | `install` · `prepare` · `service` · `port` · `sandbox` · `resources`（ADR-054 判为环境）· `integrity`（`verifier_store_tampered`，R4-D7-06）· `exec`（命令链中的程序缺失，exit 127/ENOENT，ADR-085；`install` 阶段的 `missing:"download"` 表示离线安装需要未预取的下载，ADR-093）· `baseline`（flake 的 base 确认只得到无结论的运行，`07` §7.4.6，ADR-239） | `07` §7.4.4、§7.4.3；dedupeKey `08` §8.4 |
| `criterion_check.reason`（开放字符串，已用值） | `introduced_nondeterminism` · `mass_instability` · `links_unchecked` · `links_deferred` | `07` §7.4.6、§7.4.7、§7.4.9 |
| `criterion_check.verdict` | `pass` · `pass_with_preexisting_flakes` · `fail` · `vacuous` · `unparseable` · `pass_mutated` · `timeout` · `hung` · `resource_exceeded` · `error` · `skipped_fail_fast` · `not_run`（**M2**，ADR-164：M1 中标准不能声明机密，`not_run` 不出现；ADR-162/163：机密阶段未进入；`reason` ∈ `other_criteria_failed`（不带机密的标准有失败，走失败路径，界面“因其他标准失败未运行”）· `blocked_by_sentinel`（不带机密的标准全部通过但有阻断哨兵，走 `paused(sentinel_high)`；`override_sentinel` 后继续目标为 `verify{pin, secretPhaseOnly:true}`）；**不计为通过，也不计为失败**；验证缓存从不缓存 `not_run`，`07` §7.4.11.3）（timeout/hung/resource_exceeded 的判别见 ADR-054） | `07` §7.4.7（环境故障不产生 verdict，而是 Fact `verify_env_error`） |
| `ScopeFence.includeOrigin` | `explicit`（人显式设置，优先，ADR-050）· `template`（快速路径模板默认围栏）· `compiled`（由计划中带 `touches` 的步骤编译；每个合同版本编译一次，没有计划或没有任何 `touches` 时不改写 `include`——原为 `compiled` 的同一修订置为 `explicit`，`02` §2.5，ADR-182/183/184） | `02` §2.5 |
| `ScopeFence.allowTestEdits` | `forbid` · `ask` · `allow`（多规则取最严格：forbid > ask > allow） | `02` §2.5；执行 `07` §7.5.5 |
| `StopCondition.kind` | `natural` · `path_touched` · `command_matches` · `no_progress_for`（`rework_cycles_over` 已删除，返工上限只由 I6 与 `Contract.maxReworkCycles` 定义，ADR-143） | `02` §2.5 |
| `Contract.maxReworkCycles`（ADR-143） | 整数，默认 **3**；I6 的返工上限（`verify_failed_limit` 的唯一来源），合同可设定 | `02` §2.5；`03` §3.3 I6 |
| `AutonomyMatrix.preset` | `spike` · `standard` · `prod_hotfix` · `dependency_upgrade` · `investigation` | `02` §2.5；矩阵 `11` §11.2（界面名：spike / 标准修复 / 生产热修 / 依赖升级 / 调研） |
| `AutonomyLevel`（有序） | `silent` < `notify` < `ask` < `forbid` | `02` §2.5；行为 `11` §11.1 |

### 16.1.4 Run、会话与尝试

| 标识符 | 取值 | 所属 § |
|---|---|---|
| `Run.reason` | `shaping` · `initial` · `rework` · `resume` · `handback`（交还 `continue_agent` 开的 Run，与 `queuedRun.kind` 一一对应，ADR-148）· `handoff` · `verify_fix` · `scratch_promote` · `review` | `02` §2.6；DDL `06` §6.3 |
| `Run.outcome` | `settled` · `aborted` · `crashed` · `budget_stopped` · `superseded` | `02` §2.6 |
| `Run.outcomeReason`（开放字符串，已用值） | `submit_effective` · `idle_without_submit` · `human_abort` · `app_quit` · `host_oom` · `disk_full`（`06` §6.8 F8 的 drain，暂停原因仍为 `app_quit`，ADR-231） · `project_unreachable`（`06` §6.1.6 Project 不可达时中止的 Run，暂停原因同样为 `app_quit`，ADR-235） | `02` §2.6；`06` §6.3 |
| `Run.engine.adapter` | `pi-sdk`（默认）· `pi-rpc` | `02` §2.6；ADR-004 |
| `runs.kind`（DDL） | `primary` · `variant`（Best-of-N）· `scratch` | `06` §6.3 |
| `sessions.origin`（DDL） | `new` · `handoff` · `fork` · `variant` · `scratch` | `06` §6.3 |
| 会话引用 | `Run.sessionId`、`Scratch.sessionId`（Pi session id；路径由 `SessionManager` 解析，不存 `sessionPath`） | `02` §2.6、§2.12 |
| 尝试（attempt） | = Pi 会话树上的一条分支；`Run.attempt.n` 只在新分支时递增 | ADR-027；`05` §5.8 |
| tower-goal 阶段 `phase` | `shaping` · `running` · `review` | `05` §5.6.1 |
| **变更类工具调用**（唯一定义，ADR-130） | **只读白名单之外的任何工具调用**，包括嵌套调用（带 `parentToolCallId`）、MCP 工具、扩展或自定义工具。只读白名单 = Tower 注入的 `read`（来源 `<sdk:read>`，回归保护下为 `builtin:read`；按来源，不按名字——覆盖了这个名字的扩展工具不按本项进入白名单（仍可按末项），`11` §11.3.4 工具来源，ADR-187/188/220）、Tower 工具（来源为 tower-goal）中不改工作区的 `ask_user`/`log`/`submit`/`review_report`、内置的 `tool_search`（只改变可见的工具集；来源按 `11` §11.3.4）与 codemode 容器本身（它的嵌套调用逐一按本定义判定，ADR-186），以及声明 `readOnlyHint:true` **且**通过 `11` 路径检查的工具（这里信任注解，而门禁不看注解：两者用途不同——本定义只决定提交是否作废与检查点预筛，不是授权；误信注解时 pin 的树仍含该工具的写入，照常被验证与评审，ADR-187）；`bash`（`<sdk:bash>`）按 `11` 的动作分类判定，分类为“不确定”算变更（白名单之外的 Pi 内置工具不会注册，`11` §11.3.4，ADR-189）。引用者（只引用、不复述）：`03` I4(a)、tower-goal 的 `turnMaybeMutated`、`10` §10.7.1 第 0 步、`07` 的相关句子；契约测试覆盖 `submit` 之后的嵌套 `edit` 与 MCP 写工具 | ADR-121、ADR-130；`05` §5.6 |
| Tower 工具 | running：`ask_user` · `log` · `submit`；shaping：`ask_user` · `propose_contract`；review：`review_report` | ADR-009；`05` §5.6.2 |
| `TowerDialog.kind` | `question` · `approval`（另有 RPC 内部凭据通道 `tower:{kind:"credential"}`：由 Host 直接从密钥库应答，不生成 Needs-You，不是人机对话框；ADR-049、`05` §5.3.6，契约测试 C29） | `05` §5.6.4（唯一规格，ADR-023） |
| `engine_outbox.op` | `prompt` · `steer` · `follow_up` · `answer_ui` · `abort` · `clear_queue` · `navigate` · `fork` | `06` §6.3 |

### 16.1.5 账本：Fact / Claim / HumanDecision

| 标识符 | 取值 | 所属 § |
|---|---|---|
| `Fact` 的归属字段（ADR-159） | `goalId` **可空**；项目级 Fact 带 `projectId`、不带 `goalId`（目前为 `remote_credential_blocked`）。Goal 级 Fact 同时带 `goalId` 与 `projectId` | `02` §2.7；`06` §6.3 |
| `Fact.kind`（32） | `diffstat` · `files_touched` · `command_result` · `criterion_check` · `test_inventory` · `sentinel` · `anomaly` · `flake` · `conflict_forecast` · `budget` · `heartbeat` · `prepare` · `ci_check` · `engine_error` · `policy_notify` · `compaction` · `host_resource` · `sandbox_violation` · `verify_env_error` · `symptom` · `local_merged`（M1：观测到 seal 进入本地 base，`data = {seal, current: boolean}`；`current = false` 即较旧的 seal，不进入 `integrated`，ADR-128/137）· `remote_merged`（M2：远端 PR 合并）· `lfs_excluded`（ADR-153：`data = {count, paths, patterns, source}`——`paths` 至多 200 条，`patterns` 为生效的 include/exclude 模式，`source` ∈ `lfsconfig` · `gitconfig`（模式来自 base 的 `.lfsconfig` 还是用户主检出的 git 配置）；LFS 补齐时被 `lfs.fetchinclude`/`fetchexclude` 排除、在卫星中保持指针的文件数；Agent 简报中说明，附于验证证据，不导致 `prepare_failed`；ADR-154 起所有检出都保持指针）· `lfs_config_ignored`（ADR-154 补记、ADR-155：`data = {keys, reasons}`——被白名单校验拒绝的键与逐键原因（如“不支持的协议”）；来源恒为 base 的 `.lfsconfig`，用户自己 git 配置中的值不做校验；获取成功时显示为提示“◇ 已忽略 LFS 配置：<键>”，`prepare_failed` 卡片在主因之外列出“已忽略 <键>（不支持的协议）”）· `rebase_lfs_failed`（M2，ADR-155、ADR-156：`data = {missing}`——自动 rebase 或冲突解决 Run 写回之前补齐 `newBase` 的 LFS 对象失败时的缺失对象数；本次 rebase 放弃，卫星与 `baseCommit` 保持旧 base，下一轮轮询或下一个空闲点重试，`10` §10.10）· `push_hook_failed`（M2，ADR-155 补记 3：`data = {exitCode, output}`——推送前在用户检出中执行的 `pre-push` 钩子失败，`output` 经 `11` §11.7 脱敏并截断；不推送，卡片显示该输出，`10` §10.12）· `base_diverged`（ADR-156/158：`data = {tower, user, towerFetchedAt, userObservedAt}`——同一远端分支在镜像中 Tower 获取与用户获取的提交分叉；**不自动选择**，`baseCommit` 不变，由人以 `goal.base.choose{side}` 选择观测基准，`10` §10.1.2）· `base_unchanged_nonancestor`（ADR-158：`data = {from, to}`——base 变化但不是前进，不自动采用）· `base_fetch_failed`（ADR-158 补记 2：`data = {remote, error}`——远端 base 的获取失败或超时，含进入 `in_review` 前与 `goal.base.check`；不阻塞，卡片显示“无法获取远端 base”，提示保留到下一次成功获取（ADR-159），`10` §10.1.2）· `remote_credential_blocked`（ADR-158/159：`data = {remote}`，**项目级**，`goalId` 为空——macOS 上远端 URL 或作用于它的认证类配置带凭据，Tower 不执行网络命令；判定规则见下方“远端 URL 的凭据判定”行）· `push_failed`（M2，ADR-158：`data = {stage: "hook" \| "network" \| "auth", exitCode?}`——推送失败，队列条目进入 `awaiting_push`）· `base_advanced`（M1 只提示，ADR-157：`data = {from, to, count}`——`baseTip` 按“前进”的定义前进了 `count` 个提交；不 rebase，`10` §10.1.2、§10.10） | `02` §2.7（`prepare_failed` 是 `prepare{ok:false}` 的口语，不是独立 kind） |
| `Fact.producer`（9） | `observer` · `verifier` · `sentinel` · `detector` · `radar` · `accountant` · `git` · `policy` · `engine` | `02` §2.7；DDL `06` §6.3 |
| `Fact.track` | `verified`（不经 Pi 扩展链，可着绿）· `observed`（永不单独着绿） | `02` §2.7；ADR-020、ADR-024 |
| `events.producer`（事件产生者，≠ Fact.producer） | `sm` · `observer` · `verifier` · `sentinel` · `detector` · `radar` · `accountant` · `router` · `git` · `engine` · `prepare`（Supervisor 的 PrepareService，ADR-152）· `ui` · `timer` · `retention` | `06` §6.3 |
| `TowerEvent.source` | `engine` · `harness` · `human` · `agent_tool` · `system` | `02` §2.13 |
| `Claim.kind` | `plan` · `step` · `decision` · `assumption` · `finding` · `cause` · `risk` · `done` · `next` · `memory` · `review_note`（**无 `eta`**，ADR-030） | `02` §2.7 |
| `log` 工具的 `kind` 参数 | `plan` · `step` · `decision` · `assumption` · `finding` · `cause` · `risk` · `next` · `memory`（`done` 来自 `submit`；`review_note` 来自 `review_report`） | `05` §5.6.2 |
| `Claim.author` | `worker` · `reviewer` | `02` §2.7 |
| `Claim.confidence` | `low` · `medium` · `high`（从不显示百分比） | `02` §2.7；ADR-030 |
| `Claim.crossCheck.status` | `consistent` · `contradicted` · `unbacked` · `unchecked` | `02` §2.7；`07` §7.8 |
| `Claim.crossCheck.strength` | `hard`（danger 色）· `soft`（中性） | `07` §7.8.1 |
| `Claim.ratification` | `pending` · `ratified` · `rejected` | `02` §2.7 |
| `HumanDecision.kind` | `ratify_contract` · `amend_contract` · `approve_action` · `deny_action` · `answer` · `ratify_claim` · `reject_claim` · `accept` · `request_changes` · `abandon` · `resurrect` · `override_sentinel` · `extend_budget` · `override_capacity` · `quarantine_test` · `trust_project` · `ratify_memory` · `edit_memory` · `retire_memory` · `resolve_sync_conflict` · `approve_autonomy_change` · `pause` · `resume` · `take_over` · `hand_back` · `rewind` · `fork` · `start_now` · `snooze` · `dismiss` · `check_human_criterion` · `grant_s0_exec` · `merge_projects` · `approve_docker` · `quick_ratify` · `retry_verify` · `retry_claim` · `claim_on_behalf`（改写继续目标为 `claim{decisionId}`，ADR-137）· `deny_s0_exec`（ADR-077）· `split_project`（ADR-080）· `reject_memory`（`09` §9.3）· `discard_human_edits` · `bring_back_inspection` · `retry_after_human_change`（ADR-099）· `keep_external_change` · `revert_external_change`（命令 `goal.external_change.keep` / `.revert`；保留 = 以 `author:"human"`（`mixedPaths` 记 `mixed`）、landmark `external_change_kept` 的非回合检查点采纳；撤销 = `restorePaths(归因基线, E)`，之后**只考察 E 中的路径**，E 中仍与基线不同者按归因表分类，E 之外的路径按检查点链归因（ADR-134）；两者都只解除 `external_change` 并按 `03` §3.2.1 显式改写继续目标（`keep`：`verify`/`review` → `verify_new`；两者都把决定追加到 `Goal.pendingOpenings`，下一次 Run 的开场附 `tower.external_resolved`，ADR-140），离开 `paused` 只经 `onAllReasonsCleared()`（唯一来源 `03` §3.2.1 `external_change` 行，ADR-134），归因基线只在 `10` §10.3.1 定义（检测前最近的任意检查点；`claimed` 之后即当前 pin 的检查点；无则 pin，再无则 base），ADR-114/122）· `withdraw_opening`（撤回一条排队的开场，命令 `goal.openings.withdraw{goalId, openingId}`；已消费 → `already_delivered`，已撤回 → 成功，ADR-144/145）· `acknowledge_signal` · `mark_benign`（受保护目标沙箱拒绝的出口：知悉 / 良性并可加入项目良性清单，ADR-117）· `approve_local_file`（ADR-167：批准一个本地文件纳入播种，命令 `project.local_files.approve`；仅本机）· `inspect_with_secrets`（ADR-166：人打开检验检出时显式选择带上本地机密文件，命令 `inspect.open{goalId, withSecrets:true}`；仅本机；人发起的例外，`11` T31）· `unmark_secret_file`（ADR-166：取消本地文件的机密标记，命令 `project.local_files.unmark_secret`；仅本机；按文件名判定的不可取消）· `rebuild_satellite`（ADR-176/183：`satellite_missing` 中人发起的重试重建，命令 `goal.rebuild_satellite{goalId}`，重建来源与步骤都与自动重建相同（`10` §10.16.2 情形 E）；只在该原因存在时可用，重建成功的同一事务解除它；不开 Run、不改动 Pi 会话、不改写继续目标，与 `run.rewind` 不同，见 `06` §6.4.3；从更早的检查点重建属 M2）· `lower_risk_tier`（ADR-178：`goal.update_meta` 降低 `riskTier`，仅本机；`detail` 记原值与新值；`riskTier` 是 Goal 的字段，不产生合同版本，**不算合同修订**——读“合同已修订”的规则（`verify_failed_limit` 的 `resume` 条件、`until_amend` 静默、S0 授权的失效条件 (i)（`11` §11.2）、`decisions.contract_version`）都不把它计入）· `accept_secret_exposure`（**M2**，ADR-164：M1 中不产生；ADR-160/161：人接受机密暴露风险——带机密的标准等待过久时的“现在运行”（`verify.secret_wait.run_now`），或 `secrets.access.use_now`；只能在本机执行）。`hand_back` 另带 `handBack.mode`（交还时的选择，`take_external` 时省略；置换交还选择的 `resume` 也只带它，`06` §6.4.3，ADR-217/218）、`handBack.externalResolution`（`take_human` · `take_external` · `keep_both`；只对归因表中“来源不明”的写入要求，存活进程的写入按 `agent_bg` 处理；`take_external` = 放弃改动 + 保留 `external_change`，不记 `human_edit`、不注入 `tower.handback`、`targetTree` 记 T0，ADR-114/128）与 `resolvePinHits`（ADR-118） | `02` §2.7；`03` §3.2.1；命令 `06` §6.4.3；`10` §10.3.1 |
| `HumanDecision.reason.code`（已定义值） | abandon：`contract_unclear` · `wrong_direction` · `superseded` · `not_needed` · `agent_incapable` · `other`；override_sentinel：`intended_change` · `false_positive` · `accept_risk`；ratify_memory：`goal_exception`；resume：`stop_condition_false_positive`（来自 `goal.resume{feedback:"stop_condition_false_positive"}`“这里不该停”，`target.criterionId` = `StopCondition.id`，ADR-135；`outcomeClass:"false_positive"`） | `02` §2.7；`09` §9.4.3 |
| `HumanDecision.target` | `{claimId?, itemId?, criterionId?, reviewUnitId?, memoryId?, proposalId?, factId?, projectId?, checkpointN?, openingId?}`：每种决定只填它涉及的键；`checkpointN` 仅 M2 的“从更早的检查点重建”（`rebuild_satellite`；M1 的 `goal.rebuild_satellite` 只重试、不带它，崩溃续做用同一重建来源，`06` §6.1.6、§6.4.3，ADR-183）；`openingId` 仅 `withdraw_opening`（`OpeningRef.id`，`06` §6.4.3 `goal.openings.withdraw`）；`criterionId` 在 `resume{feedback:"stop_condition_false_positive"}` 中记 `StopCondition.id`。交还的写回目标树是顶层 `targetTree`，不在 `target` 中（ADR-181） | `02` §2.7；`06` §6.4.3 |
| `EvidenceRef.type` | `trace` · `hunk` · `fileLine` · `log` · `artifact` · `url` | `02` §2.7 |

### 16.1.6 哨兵与检测器 id（`Fact.data.detector`、`NeedsYouItem.source.detector`）

严重度、路由、是否阻断 `in_review` 与精度目标只在 `07` §7.10.1 定义；本表只登记 id 与**推导来源**（ADR-103/107，以 `07` §7.10.1 的同名列为准）：**pin** = 只依据 pin 的内容计算（“验证时重判”= 由针对该 pin 的验证重新得出），人工交还与新 pin 会清除并重新判定；**run** = 由运行过程产生，新 pin 无法重新得出。**阻断的 run 类命中有两项**：`input_mutated_after_gate`（sentinel，severity 3）——它按 Goal 作用域保持 open，交还与新 pin 都不清除，须 `override_sentinel`（带结构化原因）处置，Needs-You 不提供返工（ADR-107/110，R9-D7-01、R10-D7-01）；`nested_repo_live`（sentinel，severity 3，ADR-131）——交还时保留，**不可覆盖**，条目从卫星中消失时解除。`sandbox_violation` 为提示性（ADR-110）。其余 run 类命中（`post_settle_activity`、S7 `policy_wall`、循环/停滞、交叉校验、bash 输出中的密钥等）是**提示性**的：不阻止 Verified，进入评审的“运行异常”区块；`post_settle_activity` 保持 ADR-025 的语义（撤回或暂停），不进入 `openSentinels`。带 † 的 id 由本注册表命名（原文只有规则号或描述）。

| 检测器 id | 族（`07`） | 子类型 / 规则 | 所属 § | 推导来源（ADR-103） |
|---|---|---|---|---|
| `test_edit` | 测试完整性 | R-T1 测试文件修改/删除/重命名 | `07` §7.5.2 | pin |
| `skip_added` | 测试完整性 | R-T2 新增 skip/only/xfail | `07` §7.5.2 | pin |
| `assertion_weakened` | 测试完整性 | R-T3：`assertions_removed`、弱化改写对、`expected_value_changed` | `07` §7.5.2 | pin |
| `snapshot_changed` | 测试完整性 | R-T4 快照变更 / `snapshot_update` 命令 | `07` §7.5.2 | pin（文件）/ run（`snapshot_update` 命令） |
| `test_count_drop` | 测试完整性 | R-T5（`source:"runner"` 与 `static` 两档） | `07` §7.5.4 | pin |
| `test_config_changed` | 测试完整性 | R-T6 测试/CI 配置 | `07` §7.5.2 | pin |
| `criterion_def_changed` | 测试完整性 | R-T7 间接定义修改 | `07` §7.5.1–7.5.2 | pin |
| `pass_mutated` | 测试完整性 | R-T8（同名 verdict） | `07` §7.4.5 | pin（验证时重判） |
| `scope_breach` | 范围 | `protected_path` · `out_of_scope` | `07` §7.6.1 | pin |
| `dep_added` | 依赖 | `dep_added` · `dep_major_bump` · `lockfile_drift` | `07` §7.6.2 | pin |
| `config_changed` | 配置 | 一般 · `.env*`/infra · `gate_weakened` · Agent 指令文件 | `07` §7.6.3 | pin |
| `api_changed` | 公共 API（启发式） | 删除/签名变化 · 新增 | `07` §7.6.4 | pin |
| `migration` | 迁移 | 新增迁移 | `07` §7.6.5 | pin |
| `migration_destructive` | 迁移 | 修改已有迁移 · 破坏性 SQL（L4 立即，`08` §8.3.1） | `07` §7.6.5 | pin |
| `secret` | 密钥 | diff 新增行 / 新 `.env` · bash 输出（L4 立即，`08` §8.3.1） | `07` §7.6.6 | pin（diff / 新 `.env`）/ run（bash 输出） |
| `policy_block` | 策略 | `forbid` 拦截记录；sev 1，提示性 | `11` §11.1；`07` §7.10.1 | run |
| `script_modified_then_run` | 策略 | 先改脚本定义再运行（分类为 `opaque`）；sev 2，提示性（阻断由 `criterion_def_changed` 承担） | `11` §11.3.2；`07` §7.10.1 | run |
| `input_mutated_after_gate` | 门禁 | ADR-024 输入哈希不一致 | `05` §5.6.5；`07` §7.10.1 | run（阻断，ADR-107） |
| `sandbox_violation` | 沙箱 | Seatbelt 拒绝、代理拒绝的连接（同名 Fact kind，`11` §11.6.2）；**不阻止 Verified**（ADR-110）；**两级**（ADR-113/125）：目标属于 severity 2 的受保护集合（`credential`（读、写）、`tower_data`、`user_checkout`、`other_satellite`、`user_config`（仅写）；唯一定义见下一行）→ severity 2，Needs-You（`kind:"sentinel"`，L2，`costOfDelay:"none"`），“运行异常”区块置顶，同一 Goal 内按 `(category, op, target)` 去重；其余（含经人批准的调用对批准所列路径的拒绝，`11` §11.6.2 “经批准的目标”，ADR-221）→ severity 1 chip。文案为“可能表明提示注入或越权意图”（ADR-117）；出口：知悉（`acknowledge_signal`，`informative`）/ 这是良性的（`mark_benign`，`false_positive`，可加入项目良性清单）/ 收紧策略 / 放弃 Goal；去重键 `sv:{goalId}:{category}:{op}:{target}`（`08` §8.4）。**项目良性清单默认值**：`(credential, write, ~/.ssh/known_hosts)` 一项（ADR-125/136：`~/.ssh/**` 整体属于 `credential`；ADR-125 只禁止凭据**读取**进入良性清单，写入可以）。**E7 降级默认值**：规则 F：**从 M2 起**，某个 `(category, op, target)` 2 周内 n ≥ 20 且 `false_positive` 比例 > 30% → 默认降为 severity 1（通知用户，可撤销）；`(credential, read, *)` 永不降级。M2 起计入 S7 `policy_wall`；E7 分别统计两级频率 | `11` §11.6.2；`07` §7.10.1 | run（提示） |
| `sandbox_violation` 的字段（唯一定义，ADR-125） | `category` ∈ `credential`（密钥路径表、`~/.ssh/**` **整体**（读与写，含 `known_hosts` 与 `config`，ADR-136）、钥匙串、云凭据文件）· `tower_data`（`~/.tower/**`、镜像、`$VS`、`$TI`，以及 Tower 为 Goal 或为人创建的目录——`<wtRoot>` 中的 `_human/**`（含 `.kept-` 目录）、`_inspect/**`、`_verify/**`、`_stores/**`（`$VS` 即 `_stores/_verifier`）、Tower 自动改名保留的卫星与 gitdir（`<wtRoot>/<goalId>.kept-*/**`、`_gitdirs/<goalId>.kept-*/**`，`10` §10.2，ADR-222），与 `$TMPDIR/tower-*`——**按目标的种类判定，不随 `<wtRoot>` 在默认位置还是回退位置变化**，ADR-201）· `user_checkout`（用户主检出与 `commonDir`）· `other_satellite`（其他 Goal 的卫星与 gitdir）· `user_config`（**判定规则，ADR-131/136，包含式读法**：主目录下名字以 `.` 开头的顶层文件，以及以 `.` 开头的顶层目录**之内的全部内容**（任意深度，如 `~/.gitconfig`、`~/.zshrc`、`~/.npmrc`、`~/.config/**`、`~/.cache/**`、`~/.npm/**`）；macOS 另含 `~/Library/LaunchAgents/**` 与 `~/Library/Preferences/**`；**减去**已归入 `credential` 与 `tower_data` 的路径。判定按“先 `credential`，再 `user_checkout`、`other_satellite`，再 `tower_data`，再 `user_config`，其余 `system`”的顺序取第一个命中者（ADR-198）。判例：`~/.ssh/known_hosts`、`~/.ssh/config` → `credential`；回退位置下其他 Goal 的卫星 `~/.tower/worktrees/<P>.noindex/<id>/x` → `other_satellite`；`~/.tower/x` → `tower_data`；默认位置下 `<checkoutParent>/.tower-wt.noindex/<repoName>/_human/<另一个 Goal>/x`、`…/_stores/<另一个 Goal>/x` 与 `$TMPDIR/tower-<另一个 Goal>/x` → `tower_data`（与回退位置下相同，ADR-201）；`~/.zshrc`、`~/.config/systemd/user/x.service`、`~/.cache/foo/bar` → `user_config`；`~/Library/Caches/x`、`/tmp/x` → `system`。点目录中的缓存写入因此是 severity 2；Tower 已以环境变量把包管理器与工具缓存重定向到自己的目录（`16` §16.8，ADR-063），剩余未被重定向的工具在 M1 中会出现 severity 2 卡片，可一键“这是良性的”；E7 统计其频率与误报，规则 F 从 M2 起降级）· `system`（其余路径与网络）；`op` ∈ `read` · `write` · `exec` · `net`；`target` = 精确到文件的规范化路径（主目录下写作 `~/…`）或网络主机。severity 2 的受保护集合 = `credential`（读、写）、`tower_data`、`user_checkout`、`other_satellite`、`user_config`（仅写）（ADR-125 第 13 轮 lint 补记：写用户级配置会改变用户在 Tower 之外所有仓库中的 git 行为）；良性清单与降级单位 = `(category, op, target)` | `11` §11.6.2；`08` §8.4；`07` §7.10.1 | — | — |
| `bash_overridden`（ADR-201） | 沙箱 | 生效的 `bash` 不是 Tower 的沙箱版本、该 Goal 降为 S0（`11` §11.4；只可能在 RPC 适配器下出现，M2）；severity 2，提示性，Needs-You kind `sentinel`，去重键 `s:{goalId}:bash_overridden`；与 S0 执行授权的 `approval` 是两条 | `11` §11.4；`07` §7.10.1 | run |
| `symlink_escape` | 隔离 | `pinSafetyCheck`（规则唯一定义在 `10` §10.1.2 (b)，ADR-112/116/124）：pin 中**全部**符号链接在 pin tree 内按 POSIX 语义解析整条链（经过的链接，含 base 中未改动的，按其目标继续，深度 ≤ 40）；解析不安全 = 终点为绝对路径或越出仓库根、成环或超限、经过 tree 中不存在的分量、经过名字与 `.git` 等价的分量；命中 = 在 pin 中不安全，且为新增或改变的链接、或在 base 中安全、或解析结果与 base 不同；base 中原本不安全且结果未变的链接豁免（只在信任提示中列出）；sentinel，**severity 3，阻止 Verified 与集成**；不排除；subject = 链接路径，覆盖绑定其 blob 哈希 | `10` §10.1.2；`07` §7.10.1；ADR-109/112 | pin |
| `nested_repo`（subject） | 隔离 | `pinSafetyCheck`：subject 为**仓库形态候选目录**（base 或 pin 中直接含名字（按 `10` §10.1.2 的名字比较规则（ADR-120））为 `head`/`commondir`/`gitdir` 的文件或符号链接的目录）；该目录内或其本身的任何增、删、改即命中（ADR-111）；severity 3，阻止 Verified 与集成；不排除；覆盖绑定该目录的 tree 哈希。**第二个来源（ADR-131/139）**：git 在 `core.protectHFS/NTFS` 下会拒绝收录的路径，`add` 之前一次列出并 `:(exclude)`（不设数量上限，规则唯一定义在 `10` §10.1.2），记入 `Checkpoint.excludedPaths`；subject 为“路径 + 名字”，任一被排除路径仍存在即阻断 Verified，**不可覆盖**，唯一出口是删除 | `10` §10.1.2、§10.7.1；`07` §7.10.1；ADR-109/111/131 | pin |
| `nested_repo_live`（ADR-131） | 隔离 | 卫星 watcher 在 `running` 中发现名字（按 `10` §10.1.2 的比较规则）等价于 `.git` 的新条目；新建目录先加监视、再扫描。以 abort 方式 drain → `paused(sentinel_high)`；severity 3；**不可覆盖**（没有 pin 可绑定），交还时保留；出口 `goal.resume` 附必填转向（要求 Agent 删除）· `goal.take_over`（人删除；写下 `pendingHandBack` 之后不可用，`03` §3.2.1，ADR-215）· `goal.abandon`；条目消失即解除。平台差异：macOS S2 已按名字拒绝 ASCII 大小写变体，Linux S2（M2）全部 `.git` 名字只靠本检测器（`11` T29） | `10` §10.1.2；`03` §3.2.1；`07` §7.10.1 | run（阻断） |
| 阻断哨兵的覆盖绑定（`nested_repo` / `symlink_escape`） | `override_sentinel` 绑定 `(detector, 路径, 该路径在 pin 中的对象哈希)`——目录为 tree 哈希、链接为 blob 哈希；之后任何变化使覆盖失效并重新阻断；seal trailer `Tower-Override: <detector> <路径>@<哈希>`；“删除这些条目”= `goal.request_changes` 并预填 `requiresChange` 评论 | `10` §10.1.2、§10.6；ADR-112 | — | — |
| `flake` | 验证 | `origin: preexisting · introduced · quarantined`；`kind: test · timing`（timing = ADR-054 重跑通过的超时）（Fact kind 同名） | `07` §7.4.6 | pin（验证时重判） |
| anomaly：`loop` · `stall` · `burn_without_progress` · `claim_contradicted` | 异常检测器 | 信号 S1–S7、X1–X8 | `07` §7.7、§7.8 | run |
| anomaly：`post_settle_activity` · `stat_cache_mismatch` · `structured_content_dropped` · `tower_goal_handler_error`（ADR-239） · `verifier_store_tampered`（取代 `depcache_tampered`、`verifier_config_tampered`） | 运行时异常——针对 Tower 自身状态或运行过程（`Fact.kind = "anomaly"`；分类规则见 `07` §7.10.1 表后“sentinel 与 anomaly 的分类规则”） | ADR-025；指纹（ADR-075）；ADR-004 约束 | `05` §5.5、§5.6.5；`07` §7.3.2 | `post_settle_activity`、`structured_content_dropped`：run（sev 2，提示性；`post_settle_activity` 只用于进入 `claimed` **之后**的活动——宽限失败不记异常，ADR-129；其 Needs-You 为 kind `anomaly`，去重键 `an:{goalId}:post_settle_activity`，ADR-128；`structured_content_dropped` 同为 kind `anomaly`，去重键 `an:{goalId}:structured_content_dropped`，ADR-201）；`tower_goal_handler_error`：run（tower-goal 的 `tool_call`、`turn_start` 或 `tool_result` 处理器出错时自报，`05` §5.6.5 第 6 项；sev 3，提示性、不阻止 Verified；Needs-You kind `anomaly`，去重键 `an:{goalId}:tower_goal_handler_error`——同一 Goal 合并为一条，subject 为处理器名并累加次数，ADR-239）；`stat_cache_mismatch`：Tower 状态（sev 2，提示性；决定性使用前先触发 full 重哈希）；`verifier_store_tampered`：pin（验证时重判） |
| anomaly：`bg_process_survived` | 运行时异常——Tower 状态（`Fact.kind = "anomaly"`） | settle 时 SIGTERM 后 10 s 再 SIGKILL 仍有存活的 Agent 进程（ADR-115/121）；**不阻断**；severity 2 Needs-You（kind `anomaly`，去重键 `an:{goalId}:bg_process_survived`；“后台进程在终止后仍存活：<命令>”，选项 `再次终止`（成功 → `actionable`）/ `知悉`（`informative`），ADR-126）；**此后该进程的写入记 `author:"agent"`（附注记），不走 `external_change`；卫星树 ≠ pin 时按 I2 以 `verifyOrigin:"agent_bg"` 重新验证（ADR-122）** | `07` §7.10.1；`10` §10.3.1；ADR-115、ADR-120、ADR-122、ADR-126 | Tower 状态 |
| `Checkpoint.landmarks`（联合类型；`Checkpoint` 只在 `10` §10.7.1 定义，`02` 不定义，与 `06` DDL 一致） | `submit` · `verify_pass` · `verify_fail` · `criteria_flip` · `rework_start` · `human_edit` · `safety` · `agent_bg_done` · `external_change_kept` · `rebase`（M2：合并队列 rebase 写回后的检查点，标出 rebase 带入的 base 变化，ADR-145）；`agent_bg_done`、`external_change_kept` 只出现在非回合检查点（无 `piEntryId`、不写入 Pi 会话、必带 landmark，ADR-118）；`external_change_kept`、`human_edit` 与 settle 第 4 步的 `agent_bg_done` 在树不变时也记只带 landmark 的检查点（ADR-127、ADR-211）。`Checkpoint.author` = `agent` · `human`（`human` 只用于显式的人工决定）；`Checkpoint.externalPaths?`：`running` 中检测到外部写入后 drain 期间的回合检查点里逐路径归为外部的路径（ADR-122），交还 `keep_both` 第 8 步的检查点同样记录（ADR-128）；`keep` 时改记 `human`，`mixedPaths` 中的路径记 `mixed`；`Checkpoint.excludedPaths`（`06` 列 `checkpoints.excluded_paths`，默认 `[]`）：影子 `add` 被 `core.protectHFS/NTFS` 拒绝、以 `:(exclude)` 排除的路径，非空即不可覆盖的 `nested_repo`（ADR-131）；`excludedPaths` 只记 (c) 类，树排除什么以 `10` §10.7.1 第 1 步为准（四类，含不记在这里的本地文件排除集，ADR-207/208） | `10` §10.7.1 | `10` §10.7.1；DDL `06` §6.3 | — |
| sentinel：`runner_tampered`（运行器集合不符：severity 3，阻止 Verified；其他第三方依赖不符：severity 2，验收面板列出，`07` §7.4.3）· `lifecycle_script_changed` · `nested_repo` · `prepare_untracked_output`（槽位 prepare/生命周期脚本在 `generatedPaths` 之外留下未跟踪文件）· `runner_patched`（patches/overrides 涉及运行器相关包，severity 2，ADR-092）| 完整性哨兵——针对 Goal 内容或其执行效果（`Fact.kind = "sentinel"`，`data.detector` 为此 id；不是独立的 Fact kind） | ADR-021/061/062/071/072/085 | `05`、`07` §7.4.3、`10` §10.3.1 | `runner_tampered`、`prepare_untracked_output`：pin（验证时重判）；`lifecycle_script_changed`、`nested_repo`、`runner_patched`：pin |
| 停滞信号 | — | S1 同一失败重复 · S2 编辑-回退振荡 · S3 无新事实 · S4 烧 token 不动 diff · S5 静默工具 · S6 计划反复 · S7 反复撞墙 | `07` §7.7.1 | run |
| 交叉校验规则 | — | X1 声称改了文件 · X2 声称测试通过 · X3 声称运行命令 · X4 step vs 文件 · X5 引用不存在 · X6 完成自评 · X7 声称没改测试 · X8 范围声明 | `07` §7.8.2 | run |

### 16.1.7 Needs-You

| 标识符 | 取值 | 所属 § |
|---|---|---|
| `NeedsYouItem.owner.kind` | `goal` · `scratch` · `project` · `global`（Scratch 只能产生 `question`） | `02` §2.9；ADR-034 |
| `NeedsYouItem.kind`（19） | `question` · `approval` · `review_ready` · `verify_failed` · `sentinel` · `budget` · `stalled` · `ratify` · `conflict` · `verify_env` · `digest` · `backlog` · `flood` · `sync_conflict` · `project_identity` · `anomaly`（Tower 状态与运行过程类异常：`bg_process_survived`，去重键 `an:{goalId}:bg_process_survived`，ADR-126；`post_settle_activity`，去重键 `an:{goalId}:post_settle_activity`，ADR-128；`structured_content_dropped`，去重键 `an:{goalId}:structured_content_dropped`，出口“知悉”→ `informative`，ADR-201；`tower_goal_handler_error`，去重键 `an:{goalId}:tower_goal_handler_error`，出口“知悉”→ `informative`，ADR-239）· `external_change`（ADR-128：severity 2；`costOfDelay` 在继续目标为 `run`/`settle` 时为 `agent_blocked`，否则 `none`；去重键 `ec:{goalId}`，重复检测并入路径；标注 `keep` → `actionable`、`revert` → `false_positive`；只在 `alsoApplies` 中时卡片照常出现并标“当前暂停原因：…”）· `stop_condition`（ADR-133 第 14 轮 lint 补记：合同停止条件命中；severity 2，`costOfDelay:"agent_blocked"`；去重键 `stc:{goalId}:{conditionId}`，`conditionId` = `StopCondition.id`（ADR-135，格式见 §16.1.12）；三个出口：“继续” → `goal.resume`，“修订合同后继续” → `contract.amend` 后 `goal.resume`，“这里不该停” → `goal.resume{feedback:"stop_condition_false_positive"}`；标注“继续”/“修订合同后继续” → `actionable`，“这里不该停” → `false_positive`）· `integration`（ADR-157：severity 2。**M2 推送失败**（pre-push 钩子拒绝、网络、认证）：owner 为 Goal，去重键 `int:{goalId}`；Goal 保持 `accepted`，合并队列条目保持“待推送”；出口“重试推送”“只保留分支”，队列条目为 `awaiting_push`，记 Fact `push_failed`（ADR-158）。**带凭据的远端**（ADR-157 补记；ADR-158 起为 macOS 默认）：owner 为 project，去重键 `int:{projectId}:credential_url`，“请把该远端的凭据移到 credential helper”，“重试”= `project.remote.recheck`；用户改用 helper 后以 `actionable` 关闭；`10` §10.1.2） | `02` §2.9；`06` CHECK；dedupeKey `08` §8.4 |
| `pauseReason` → Needs-You kind（lint (w′)；`12` §12.6.5 带 `◆` 的原因必须有 kind；反之，映射到 kind 的原因在 `12` §12.6.5 须带 `◆` 或在导言中列为例外，ADR-205） | `budget_soft_cap` · `budget_hard_cap` → `budget`（`06` §6.2.5）；`idle_without_submit` → `stalled`（子类型 `idle_without_submit`）；`verify_failed_limit` · `human_change_verify_failed` → `verify_failed`（`07` §7.10 `decide`）；`sentinel_high` → `sentinel`；`stop_condition` → `stop_condition`（ADR-133 第 14 轮 lint 补记）；`verify_env_error` → `verify_env`；`s0_grant_pending` → `approval`（`04` §4.8.5 审批卡，`07` `s0GrantApproval`）；`satellite_missing` → `stalled`（子类型 `satellite_missing`，仅自动重建失败时，去重键 `st:{goalId}:satellite`，`08` §8.4、§8.6.5，ADR-191）；`post_settle_activity` → `anomaly`（ADR-128）；`question_timeout` → `question`（原条目保持打开，`08` §8.7.1）；`stalled_timeout` → `stalled`（子类型为超时的那条 escalate 条目的检测器子类型，原条目保持打开，`08` §8.7.1，ADR-183）；`external_change` → `external_change`（ADR-128）；`engine_crash` → `stalled`（子类型 `crashed` 或 `unresponsive`；自动“重启并恢复”期间不生成，只在 10 分钟内再次崩溃或启动时因 `resumeOnLaunch` 关闭而没有自动解除后生成（因不可达而推迟的解除不生成，ADR-238），重启中的准备失败归 `prepare_failed`/`satellite_missing`，时机唯一定义在 `08` §8.6.3，ADR-204、ADR-205）；`prepare_failed` → `stalled`（子类型 `prepare_failed`，去重键 `st:{goalId}:prepare`，ADR-149；认证预检失败（`06` F7 ②）时是 F7 的条目，不另生成，`08` §8.4，ADR-207）；`provider_unavailable` → `stalled`（子类型 `engine_error`：重试最终失败时是 F6 的条目，并参与 provider 根因合并，`08` §8.6.5；认证过期或没有凭据时是 `06` F7 的条目，去重键 `st:{goalId}:auth`，不参与合并，`08` §8.4，ADR-206）；不生成：`human` · `app_quit` | `08` §8.4、§8.8；`12` §12.6.5 |
| `stalled` 子类型 | `loop`(S1) · `oscillation`(S2) · `no_progress`(S3) · `burn_without_diff`(S4) · `silent`(S5) · `plan_churn`(S6) · `policy_wall`(S7) · `provider_silent` · `unresponsive` · `crashed` · `idle_without_submit` · `prepare_failed`（ADR-148–151；来源只按 §16.1.1 `Goal.pauseReason` 的 `prepare_failed` 一项——`ready` 的准备阶段失败或超时，以及 `running` 中途停止的几种（卡片都写“运行已停止”，`12` §12.6.5），ADR-239；伴随 `paused(prepare_failed)`，不在启动时自动解除、不 `autoResume`；依赖物化失败**不**产生它；去重键 `st:{goalId}:prepare`；选项：重试 `resume`、我来改——仅当检出完成标记存在（ADR-151/152）、放弃；卡片只显示 Tower 生成的摘要，例如缺失对象数与 HTTP 状态类别，不显示 LFS 获取命令的原始输出）· `engine_error` · `satellite_missing`（卫星重建失败，ADR-076）· `human_checkout_lost`（`paused(human)` 中人工编辑检出已不存在，重启时或运行中发现，定义见 `06` §6.1.6，ADR-211/212）· `write_back_failed`（交还或检验带回的写回在本进程中失败，人工编辑检出或检验目录保留，定义见 `06` §6.4.3 `inspect.bring_back` 行，ADR-220） | `08` §8.4、§8.6.3–8.6.5；`06` §6.1.3、§6.1.6、§6.4.3；`10` §10.16.2 |
| `severity`（后果严重度） | `1` 低（攒批）· `2` 中（应用内）· `3` 高（可升系统通知） | `02` §2.9 |
| `level`（投递强度） | `L0` 记录 · `L1` 外围 · `L2` 收件箱 · `L3` 断点打扰 · `L4` 立即 | `08` §8.1；视觉 `12` §12.8 |
| `costOfDelay` | `agent_blocked` · `agent_degraded` · `none` | `02` §2.9 |
| `source.producer` | `agent` · `policy` · `verifier` · `sentinel` · `detector` · `radar` · `accountant` | `02` §2.9 |
| `recommendation.by` | `agent` · `harness` | `02` §2.9 |
| `resolution.by` | `human` · `timeout` · `obsolete` | `02` §2.9 |
| `outcomeClass` | `actionable` · `confirmatory` · `reflexive` · `informative` · `false_positive` · `timeout` · `obsolete` | `02` §2.9；判定 `08` §8.8 |
| `RoutingRuntime.heldReason` | `breakpoint` · `budget` · `flood` · `quiet` · `focus` · `overlay` | `08` §8.2 |
| 用户状态（断点） | `away` · `idle_short` · `busy_elsewhere` · `busy_in_tower_review` · `in_tower` · 粗/中断点 | `08` §8.3.3 |

### 16.1.8 评审与评论

| 标识符 | 取值 | 所属 § |
|---|---|---|
| `ReviewUnit.reviewState` | `unseen` · `viewed` · `approved` · `changes_requested` | `02` §2.8 |
| `ReviewUnit.hunks[].author` | `agent` · `human` · `external` · `mixed`；**推导顺序**（ADR-135，R15-D7-01）：路径在相关检查点的 `Checkpoint.mixedPaths` 中 → `mixed`；否则在 `externalPaths` 中且未经 `keep` → `external`；否则取检查点的 `author`——`human_edit` 检查点只对 `humanPaths` 中的路径取 `author`，其余路径穿透到接管时的检查点（`10` §10.7.1，ADR-184）。`mixed` 不作为“你的改动”，不进入 `Tower-Human-Edit` | `02` §2.8；`10` §10.7.1 |
| `Comment.anchor.type` | `hunk` · `claim` · `criterion` · `contract` · `trace`（轨迹与 Watch 中的事件，`{runId, piEntryId}`，与 `EvidenceRef` 的 `trace` 同键，ADR-180）· `goal` | `02` §2.8 |
| `Comment.timing` | `now`（steer）· `batch`（follow-up） | `02` §2.8；投递 `05` §5.7.1 |
| `Comment.requiresChange` | `true`（必须修复，验收前须 `addressed` 或被人关闭；`addressed` 只有 ⚙️ 来源（锚定的 hunk 已变），Agent 的引用只进入 `acknowledged`，不满足闸门，ADR-176）· `false` | `02` §2.8 |
| `Comment.delivery.state`（7） | `draft` · `queued` · `delivered` · `acknowledged` · `addressed` · `stale` · `dropped` | 唯一定义 `05` §5.7.3；`seenAtEntry` 是 `delivered` 的**属性**，不是状态 |

### 16.1.9 记忆

| 标识符 | 取值 | 所属 § |
|---|---|---|
| `MemoryItem.scope.kind` | `user` · `project` · `goal` · `team`（仅预留，ADR-013） | `02` §2.10；`09` §9.1 |
| `MemoryItem.kind`（8） | `convention` · `preference` · `gotcha` · `fact` · `decision` · `rejected_approach` · `command` · `constraint` | `02` §2.10 |
| `MemoryItem.status` | `proposed` · `active` · `retired`（提议 14 天未处理另记 `expired` 事件） | `02` §2.10；`09` §9.3.3 |
| `MemoryItem.origin` | `human_written` · `agent_proposed` · `mined_steering` · `mined_rework` · `mined_question` · `mined_assumption` · `mined_override` · `mined_inline_edit` · `promoted_from_goal` · `sync_import` · `copied_from_project`（Project 拆分时复制，待复审，ADR-087） | `09` §9.2 |
| `MemoryItem.taint.level` | `none` · `standard` · `high`（默认带污染；字段名 `taint`，不再使用布尔 `tainted`） | `09` §9.2.1 |
| `TaintClass` | `repo_content` · `tool_output` · `fixtures` · `dependency_code` · `registry_fetch` · `web` · `mcp` · `extension_tool` · `pasted_context` · `outside_worktree` | `09` §9.2.1 |
| `MemoryItem.retiredReason` | `obsolete` · `wrong` · `superseded` · `goal_undone` · `exported` · `privacy` | `09` §9.2 |
| `MemoryItem.sensitivity` | `normal` · `private` | `09` §9.2 |
| 学习挖掘源 | L1 转向评论 · L2 重复问题 · L3 返工原因 · L4 被拒绝的假设/决策 · L5 放弃原因 · L6 哨兵覆盖 · L7 人的就地编辑 · L8 重复命令序列 · L9 停止条件误报（挖掘属 M3，M1 只记录信号，ADR-185） | `09` §9.6.2 |

### 16.1.10 动作类（ActionClass，28 类）与自主度

单向门类的自主度下限为 `ask`，永不因超时放行，永不可远程批准（§16.5），不能形成 Goal/项目级授权（`11` §11.2）。

| # | ActionClass | 单向门 | # | ActionClass | 单向门 |
|---|---|---|---|---|---|
| 1 | `read.worktree` | | 14 | `config.change` | |
| 2 | `read.external` | | 15 | `git.local` | |
| 3 | `edit.in_scope` | | 16 | `git.history_rewrite` | |
| 4 | `edit.out_of_scope` | | 17 | `git.branch_escape` | |
| 5 | `edit.protected` | | 18 | `git.push` | ✓ |
| 6 | `edit.tests` | | 19 | `git.pr` | ✓ |
| 7 | `edit.outside_worktree` | ✓ | 20 | `git.merge` | ✓ |
| 8 | `exec.test` | | 21 | `secrets.access`（请求密钥注入归 **M2**，ADR-161；M1 中只用于分类读取凭据的命令） | ✓ |
| 9 | `exec.build` | | 22 | `fs.delete.recoverable` | |
| 10 | `exec.arbitrary` | | 23 | `fs.delete.unrecoverable` | ✓ |
| 11 | `net.registry` | | 24 | `system.change` | ✓ |
| 12 | `net.other` | | 25 | `external.side_effect` | ✓ |
| 13 | `dep.add` | | 26 | `tower.tool` | 永远允许 |
| 28 | `tool.external`（ADR-185/186：沙箱外工具——按注册来源判定——的全部调用，不看注解；各预设 `ask`，下限 ask（`decide()` 先钳到下限，合同中更低的值不生效）；授权只有“仅这一次”与按工具名精确匹配的“本 Goal 内同类”；后者在本 Goal 的不可信内容与对外通信都为真时不提供，`11` §11.3.4，ADR-227） | | 27 | `read.pi_resources` | （ADR-091/100；全部预设 silent。**单一来源**：`~/.pi/agent/{skills,prompts}/**`、`~/.agents/skills/**`；Pi 包（`~/.pi/agent/{npm,git}/**`、临时包 `~/.pi/agent/tmp/**`）中由 `package.json#pi.skills`/`pi.prompts` 声明或按约定的 `skills/`、`prompts/` 目录；每个 Run 启动时从用户 Pi settings 解析出的 `skills`/`prompts` 路径；每个 Run 启动时 Host 实际枚举到的已启用技能 `baseDir`（与 `11` §11.6.2 S2 读允许中的同一集合，含以显式路径传入的项目技能，ADR-204）；扩展经 `resources_discover` 返回的 `skillPaths`——**只加入该技能的 `baseDir` 本身**，扩展目录中的其余文件保持读拒绝，`baseDir` 就是扩展根目录时该技能不可用并登记；以上均取 realpath，路径过宽（`$HOME` 或包含 `~/.tower`、`~/.ssh`、密钥路径）时不加入；卫星内 `.pi/**`、`.agents/**`；卫星祖先目录中的上下文文件（只放行名字集合，比较规则见 §16.1.12“上下文文件名与受保护名字”一行）。`~/.pi/agent/extensions/**` 其余部分不可读；`11` §11.1、§11.6.2） |

- 定义与例子：`11` §11.1；预设矩阵：`11` §11.2；分类器：`11` §11.3（`Certainty = exact · heuristic · opaque`）。

**工具种类 → 动作类**（登记；分类规则唯一定义在 `11` §11.3，本表只列出每种工具落在哪些类，ADR-185；lint (T) 比对 `05` §5.6.5 判定流程与 `11` §11.3.4 点名的工具种类）：

| 工具种类 | 动作类 | 确定度 | 定义 |
|---|---|---|---|
| 文件类工具 `read` / `edit` / `write`（来源 `<sdk:<name>>`：Tower 以 `customTools` 注入，S2 下每次文件操作在 S2 中执行，`11` §11.3.1 使用时强制，ADR-220；回归保护下为 `builtin:<name>`，Goal 降为 S0；来源是扩展时按用户扩展工具，ADR-187） | `read.*` / `edit.*` / `fs.delete.*`，按路径；路径与 Pi 内置文件工具的求法相同（`~`、`file://`、`@`、Unicode 空格，`read` 的名字变体取最严格者，`11` §11.3.1 求路径，ADR-219） | `exact`（依赖清单解析失败为 `heuristic`；路径不能确定地求出时为 `opaque`） | `11` §11.3.1 |
| `bash`（生效来源 `<sdk:bash>`，`05` §5.3.5） | 按命令解析，每个简单命令一类；表外程序 `exec.arbitrary` | 取各简单命令中最差者 | `11` §11.3.2 |
| 白名单之外的 Pi 内置工具（来源以 `builtin:` 开头、但不在 `11` §11.3.4 的 `builtin:` 来源允许表中：允许表只有 `05` §5.3.5 `TOWER_BUILTINS` 的 `builtin:<工具名>` 与 `builtin:codemode`、`builtin:tool-search`、`builtin:mcp`，后三者按各自的行；v1.2.0 为 `powershell`（不经沙箱执行）与 `grep`、`find`、`ls`（Tower 不提供，`grep` 直接派生 `rg`、不经 `operations`，ADR-220）；以后的 Pi 版本新增的内置工具同样归此行，ADR-189/190） | `exec.arbitrary`，带硬底线 forbid（按沙箱外执行，不可授权；Host 以 `excludeTools` 不注册，本行是纵深防御） | `exact` | `11` §11.3.4 工具来源 |
| Tower 工具 `ask_user` / `log` / `submit` / `propose_contract` / `review_report` | `tower.tool`（gate 按来源 tower-goal 直接放行，不按名字；生效来源不是 tower-goal 时不开 Run，`05` §5.3.5，ADR-187；Run 中途才被遮蔽时 gate 阻断该调用并暂停，`05` §5.6.5，ADR-188） | — | `05` §5.6.5 判定流程第 1 步；`11` §11.3.4 工具来源 |
| 用户扩展注册的工具 | `tool.external`（不看注解）；参数路径扫描可另加硬底线或 `secrets.access` | `heuristic`（相对路径参数为 `opaque`） | `11` §11.3.4 |
| MCP 工具 `mcp__<server>__<tool>` | `tool.external`（同用户扩展工具） | 同上 | `11` §11.3.4 |
| MCP 资源工具 `list_mcp_resources` / `list_mcp_resource_templates` / `read_mcp_resource`（内置 mcp 扩展注册，Pi v1.2.0） | `tool.external`（同用户扩展工具；`readOnlyHint` 同样不看，ADR-186） | 同上 | `11` §11.3.4 |
| `tool_search`（来源 `builtin:tool-search`，Pi v1.2.0） | `tower.tool` 级（只把匹配的工具加入下一次可见的集合；被加载的工具照常判定）；来源不是 builtin 时按用户扩展工具 | — | `11` §11.3.4 |
| codemode 嵌套调用 | 容器本身为 `tower.tool` 级（来源 `builtin:codemode`；被取代时按用户扩展工具）；每个嵌套调用按其工具种类逐一判定 | 按嵌套调用 | `11` §11.3.4 |
- S0 下运行测试/构建的 Goal 级授权由 `Goal.s0Grant`（`02` §2.4）表示，**不是**运行时 `Grant`、不经 `applyGrants`；决定为 `HumanDecision{kind:"grant_s0_exec"}`（ADR-022/182），失效条件唯一定义在 `11` §11.2。不存在 `exec.unsandboxed` 类。
- 授权范围：仅这一次 · 本 Goal 同类（单向门除外）（`11` §11.2）；本项目同类 30 天（非单向门）属 M3，随自适应自主度的面板提供列出与撤销（ADR-183）。“本 Goal 同类”（与 M3 的项目级）是运行时 `Grant`（形状与存放的唯一定义在 `02` §2.5：存于该 `approve_action` 决定的 `payload.grant`，按 `expiresAt` 失效，每个 Run 开始时编入 `policy.json`），只能在本机选择，远程客户端只有“仅这一次”（§16.5，ADR-180）；`Contract.autonomy.grants` 只含批准合同时写入的授权，不按事件失效。授权的效果（只把 `ask` 降到 `notify`，不越过 `forbid`）、编入时的排除（撤销、自适应降级、合同收紧过该类）与撤销命令（`autonomy.revoke` 省略 `level`；M1 入口在 Goal 页自主度区块，`04` §4.5）唯一定义在 `11` §11.3.5（ADR-182/183）。一次审批命中多个处于 `ask` 的类时只提供“仅这一次”（ADR-183）。

### 16.1.11 沙箱档位

| 档位 | 机制 | 默认 | 所属 § |
|---|---|---|---|
| `S0` | 仅策略层 + worktree 围栏 | Windows（ADR-018）；SP6 失败的平台；运行 Agent 代码需 ADR-022 授权，“已验证”带“S0 环境”限定 | `11` §11.6.1 |
| `S1` | 工具级路径分类（文件工具的路径；只决定审批分级，S2 下访问由 S2 强制，ADR-220） | 始终开启 | `11` §11.6.1 |
| `S2` | OS 沙箱包裹 bash 子进程与文件工具的文件操作（Seatbelt / bubblewrap+Landlock；文件工具见 `11` §11.3.1 使用时强制，ADR-220） | macOS M1 起、Linux M2 起，均以 SP6 通过为前提（ADR-040 Proposed）。`.git` 禁令按平台不同（ADR-131）：macOS 按名字拒绝 ASCII 大小写变体，残余为非 ASCII 等价变体的 watcher 窗口；Linux 无按名字拒绝，残余为全部 `.git` 名字的 watcher 窗口，Linux 上的强制手段为 M2 决定点 | `11` §11.6.1–11.6.2、T29 |
| `S3` | 微型 VM 承载工具（Gondolin） | 可选，M3 | `11` §11.6.1 |
| `S4` | 整个 Pi 进程进容器/沙箱 | 可选，M3，配合 RPC 适配器 | `11` §11.6.1 |

### 16.1.12 Project、serve 与协议

| 标识符 | 取值 | 所属 § |
|---|---|---|
| `Project.branchPrefix` / `Project.keepAuditLandmarks` | 默认 `"tower"` / `false`（开启后归档时把地标检查点写入用户仓库 `refs/tower/<goalId>/cp/<n>`，180 天后删除） | `02` §2.3；`10` §10.2、§10.6.2 |
| `Project.trust.state` | `trusted` · `untrusted`（默认，首次绑定时询问）。M1 中只决定每个 Run 是否以显式入口传入项目的声明性资源（技能、提示、主题以路径，`SYSTEM.md`/`APPEND_SYSTEM.md` 以内容，ADR-203）；Pi 的项目信任恒为假，项目扩展、项目包与项目 MCP 服务器不论取值都不加载（ADR-202） | `02` §2.3；`11` §11.8.1 |
| 上下文文件名与受保护名字（ADR-203、ADR-204，唯一定义） | **名字集合**取 Pi v1.2.0 的候选清单：`AGENTS.override.md`、`AGENTS.md`、`AGENTS.MD`、`CLAUDE.md`、`CLAUDE.MD`（`core/resource-loader.ts:185`）。Pi 在 agentDir 与从 cwd 到文件系统根的每一级目录中按此顺序以 `existsSync` 取第一个存在的普通文件（跟随符号链接），不受信任控制（`:184-203`、`:232-274`、`:646-653`）；cwd 的子目录中的文件不加载；在大小写不敏感的卷（macOS 默认）上，任何大小写变体都会被当作候选名加载。**`contextFiles(dir)`**（ADR-204）= Pi 以 dir 为 cwd 时加载的文件：agentDir 与从 dir 到根的每一级目录各按上述顺序取第一个存在者，在该目录所在的卷上求值；例外：dir 位于嵌套在主仓库工作区之内的链接 worktree 时，主仓库根中与该 worktree 根所取文件同名的那一个不加载（`:214-230`、`:250-260`；卫星不是链接 worktree，只影响用户检出本身是这种 worktree 时的 `contextFiles(用户检出)`，ADR-205）。`09` §9.11 的“生效上下文”与回退位置的祖先差异（`10` §10.4.3 引用）用它；导出目标在 base 树的根目录按同一候选顺序求值（`09` §9.11，ADR-205）。**比较规则**：凡按名字识别上下文文件或受保护路径之处，名字都按 `10` §10.1.2 的名字比较规则比较（含大小写折叠），与 `.git` 名字同一做法。ADR-204 起这包括 `protected` 的**全部**模式（`02` §2.5 的默认值与 `11` §11.3.3 的补充项，含 `.pi/**`、`.agents/**`、`.mcp.json`、`.envrc`、`.npmrc`、`.husky/**`、`.pnpmfile.cjs`，以及合同中写的模式）与 `07` §7.6.3 的路径集合：模式的每个字面分量与路径的对应分量按该规则比较，通配部分匹配按该规则处理后的分量；`scope.include`/`exclude` 不在此列。**两种写法**：祖先上下文文件的读允许只放行名字集合，不放行祖先目录（含 `$HOME`）中其他形如 `agents*.md` 的文件；`**/AGENTS*.md`、`**/CLAUDE.md` 两个模式按折叠后的 `agents*.md`、`claude.md` 匹配路径的最后一个分量，覆盖名字集合，用于 S2 写拒绝、默认 `protected` 与分类器、每个 Run 的上下文文件复核（`11` §11.8.1）与验收时“给 Agent 的指令文件”的标记（`07` §7.6.3）。Seatbelt `regex` 写为逐字符的 ASCII 大小写类（`.pi`、`.agents` 两个目录名同样）；非 ASCII 等价变体与其余受保护名字不在沙箱规则内，由复核与 `protected` 兜底（`11` §11.6.2） | `11` §11.3.3、§11.6.2、§11.8.1；`02` §2.5；`07` §7.6.1、§7.6.3；`09` §9.11；`10` §10.4.3 |
| `ProjectId` | `hash(canonicalRoot)`；浅克隆 `provisional:<normalizedRemote>` | ADR-028 |
| 分支 / 影子 ref | 用户仓库 Goal 分支 `refs/heads/<prefix>/<goalId>-<slug>`（`prefix` 默认 `tower`，项目设置可改，添加项目时检查 D/F 冲突；只由集成时的 seal 产生；M1 中撤销合入不写用户仓库；撤销草案分支属 M2，`10` §10.12，ADR-193）；卫星工作分支 `tower/<goalId>`（卫星内）；`refs/tower/<goalId>/{cp,pin,seal,abandoned}/<n>` 与交还、带回在写回开始之前保存的 `refs/tower/<goalId>/handback-t1`（每个 Goal 至多一个；写回成功时删除，否则不按时间删除，`06` §6.4.3 `inspect.bring_back` 行“T1 的保留”、`10` §10.3.2，ADR-238/239）只在影子中（landmark 为 `safety` 的检查点同样写为 `cp/<n>`，`10` §10.2，ADR-210）；`refs/tower/<goalId>/base-snapshot`、`refs/tower-live/<goalId>/*`（活跃影子 ref 的副本）与 `refs/tower-retain/<goalId>/<verifyId>`（重放证据）只在镜像中（ADR-083，`10` §10.17.1）；用户仓库默认只含多机租约 `refs/tower/_owner`（`06` §6.1.9），不含 Goal 的 `refs/tower/*`；开启“保留审计地标”时归档阶段写入地标 `refs/tower/<goalId>/cp/<n>`，180 天后删除 | `10` §10.2、§10.6.2；`06` §6.1.9 |
| worktree 根 `<wtRoot>` | 默认 `<checkoutParent>/.tower-wt.noindex/<repoName>`；回退 `Project.worktreeRoot` 或 `~/.tower/worktrees`（同样带 `.noindex` 子目录） | ADR-008；`10` §10.2、§10.4.3 |
| `hello.client` | `desktop` · `web` · `mobile` | `06` §6.4.1 |
| serve 令牌 scope | `read` · `decide` · `full`（配对二维码默认签发 `decide`） | `06` §6.4.7；`11` §11.9 |
| `ProtoError.code` | `E_STALE` · `E_INVALID` · `E_FORBIDDEN` · `E_CONFLICT` · `E_STATE` · `E_BUSY`（目标正在进行中的步骤：drain 期间请求接管或回退；准备阶段的 Host 握手与开场组装中请求 `pause`/`take_over`/`goal.openings.withdraw`（“正在启动，稍后重试”；撤回的唯一时序规则见 `06` §6.4.3，ADR-183；仓库准备与依赖物化中 `pause` 允许并中止该步骤；检出未完成时 `take_over` 返回 `E_STATE`；准备阶段中 `abandon` 始终允许，ADR-148–151；卫星重建进行中（`satellite_rebuilding=1`）再次请求 `goal.rebuild_satellite`，ADR-180；本 Goal 的后台进程终止一轮完成之前请求 `goal.take_over`——冷启动之后的重启清理与 Tower 运行中 Engine Host 退出或挂死之后的一轮相同（`06` §6.1.6，ADR-223/227）；交还或检验带回的写回进行中（`human_checkout.syncState='syncing'`，含 `06` §6.8 F8 待补失败出口列表中的写回，按 `06` §6.4.3 “写回进行中”）时请求会改写该 Goal 的状态、暂停原因、继续目标、开场或 `human_checkout` 的命令，含 `goal.abandon`、`inspect.close` 与 `goal.delete_kept`，唯一定义 `06` §6.4.3 `inspect.bring_back` 行，ADR-218/219/228；`goal.delete_kept` 与同一 Goal 正在本进程中执行的 `goal.take_over`、`inspect.open` 互相返回 `E_BUSY`，`10` §10.2，ADR-229）——稍后重试，不改变状态；界面显示“稍后重试”而非置灰，ADR-145/146/147）· `E_CONFIRM`（ADR-162/163：人输入、会进入模型上下文的文本匹配 `11` §11.7 的机密模式时返回，客户端显示“这看起来像机密，发送后会进入模型上下文”，人确认后以 `confirmSecret: true` 重发，或取消。检查在协议层进行，匹配集合 = 钥匙串中 Tower 持有值的精确匹配 + `11` §11.7.1 的模式（ADR-164）。**带 `confirmSecret?` 参数的命令**（本行是唯一登记处，`02` 不含命令参数，`06` 的命令表与之一致）：`needs_you.answer`（含重新回答）· `run.steer` · `comment.create` / `comment.edit` · `goal.request_changes`（评论）· `goal.hand_back`（交还说明）· `goal.resume`（附言）· `goal.retry_after_human_change`（附言）· `contract.edit_draft` / `contract.amend`（合同文本）· `memory.*` 的编辑（人写的记忆）· `goal.create`（目标描述）；其他会进入模型上下文的人输入文本按同一原则）· `E_ENGINE` · `E_INTERNAL`（含 M1 `goal.accept` 的 seal 或写分支失败：不记决定、状态不变，`detail` 写失败的步骤，`06` §6.4.3，ADR-189；交还与检验带回的写回在本进程中失败：同样不记决定、状态不变，`human_checkout` 退回写回之前的状态，`06` §6.4.3 `inspect.bring_back` 行，ADR-219/220） | `06` §6.4.1 |
| `UserSettings.reviewBacklogMode` | `advisory`（默认）· `blocking`（E8 通过后默认） | `02` §2.14；ADR-014 |
| 积压上限字段 | `UserSettings.reviewBacklogLimitLoc`（`null` = 关）；旧名 `reviewCapacityLocPerDay` 已废弃 | ADR-014 |
| 并发字段 | `UserSettings.maxConcurrentGoals`（唯一名称；不使用 `maxConcurrentRuns`） | `02` §2.14；`06` §6.2.4 |
| `MergeQueueEntry.state` | `waiting` · `rebasing` · `reverifying` · `awaiting_reacceptance` · `integrating` · `awaiting_push`（M2，ADR-158：推送失败后等待人决定，**不占用**该 base 的 FIFO，后续条目照常推进；“重试推送”只对该条目重做推送）· `awaiting_remote`（只用于 M2 的 `push_pr`）· `done` · `failed` · `needs_human` | `10` §10.11 |
| 集成模式 / 策略 | `local_merge`（M2）· `push_pr`（M2，ADR-133 削减 ④′）· `branch_only`（**M1 唯一模式**，只观测本地 base）；`goal.accept` 另接受 `integrate:"none"`——不是集成模式，而是“验收但不合并”：归档并保留分支——从 `in_review` 选它时先按 `branch_only` seal 并写分支（`06` §6.4.3，ADR-187/188）；`ff` · `merge_commit` · `squash`（默认）。非终态中观测到合并 → `integrated`（Fact `local_merged`；M2 另有 `remote_merged`），未解除的 `external_change` 以 `obsolete` 关闭（ADR-128） | `10` §10.11–10.12 |
| `Checkpoint.author` | `agent` · `human`（人工编辑检出交还或就地编辑，ADR-036/081）；`runId` 可空（safety、人工交还） | `10` §10.7.1；DDL `06` §6.3 |
| `Checkpoint.humanPaths` · `Checkpoint.unusable`（ADR-184） | `humanPaths?: string[]`：只在交还第 8 步与检验带回（`10` §10.8.3 第 7 步，ADR-211）的 `human_edit` 检查点上写，即“归为人的路径”（`10` §10.8.4 第 8 步唯一定义）；作者推导与 `Tower-Human-Edit` 只认其中的路径。`unusable: boolean`（默认 false）：情形 G 中对象补不回时置真；重建来源 = `unusable` 为假的最新检查点，没有时 pin，都不可用时 base，接管期间不回退（`10` §10.16.2 情形 E 唯一定义） | `10` §10.7.1、§10.16.2；DDL `06` §6.3 `checkpoints.human_paths`、`checkpoints.unusable` |
| 事件 `goal.external_change.*`（ADR-128） | `goal.external_change.detected{paths, mixedPaths, baselineCps?}`（producer `detector`；重复检测只并入路径，基线不变）· `goal.external_change.resolved{how, decisionId?}`（producer `sm`），`how` ∈ `keep` · `revert` · `take_human` · `obsolete` | `06` §6.3（事件表与 `goals.external_change` 投影）；`02` §2.4；`10` §10.3.1 |
| 事件 `goal.continuation.set`（ADR-134） | `{continuation, by: "enter_paused" \| "decision", decisionId?}`（producer `sm`）：首次进入 `paused` 时（`by:"enter_paused"`）与显式决定改写时（`by:"decision"`）各记一条；离开 `paused` 时由 `onAllReasonsCleared()` 清除，不另记事件 | `06` §6.3；`02` §2.4；`03` §3.2.1 |
| 事件 `goal.base.chosen`（ADR-158 补记） | `{side: "remote" \| "local"}`：由命令 `goal.base.choose` 记录，同时写 `goals.base_choice`；此后以所选一侧作为该 base 的**观测基准**（base 前进提示与 `integrated` 观测），直到下一次分叉；**不改变** `baseCommit`，不触发 rebase 或重新验证（M2 中所选一侧是 `baseCommit` 的后代时按普通的 base 前进处理）。不是 HumanDecision | `10` §10.1.2；`06` §6.4.3 |
| 事件 `agent_proc.kill_requested`（ADR-120/126/176） | `{by: "human"}`：由命令 `process.terminate_again{needsYouId}` 记录（`bg_process_survived` 的“再次终止”）；Supervisor 据此再次终止本 Run 的存活进程（识别规则同 `10` §10.3.1）。不是 HumanDecision，不改变 Goal 状态；`agent_proc.tracked`/`gone` 已随 ADR-142 删除 | `06` §6.3（事件注释）、§6.4.3；`10` §10.3.1 |
| 事件 `project.local_file_secret_detected`（ADR-170/171） | `{projectId, path}`（`source = system`，producer `sm`，⚙️；执行复制的服务把判定结果交给 Supervisor 写入）：复制前的重新判定中内容命中 `secretBy = null` 的条目时记录，同时写 `project_local_files.secret_by = 'content'`（判定时机唯一定义在 `ProjectLocalFile` 行）；文件不可读或不存在时不记录（本应复制的条目不改写分类，只发进程内的 L1 通知，规则唯一定义在 `ProjectLocalFile` 行，ADR-172/173）；同时发出 L1 通知（`08` §8.1：要注意但不需要你决定），不是 HumanDecision | `06` §6.3（`events` 表后的注释）；`10` §10.18 |
| 事件 `project.local_file_unmark_reverted`（ADR-172） | `{projectId, path}`（`source = system`，producer `sm`，⚙️）：复制前的重新判定中，已取消标记的条目内容哈希变化且再次命中机密模式时，Supervisor 清除 `project_local_files.unmarked`，并在同一事务中记录（判定时机唯一定义在 `ProjectLocalFile` 行）；同时发出 L1 通知“`<路径>` 的内容变化后再次命中机密模式，已恢复为机密本地文件”（`08` §8.1），不是 HumanDecision | `06` §6.3（`events` 表后的注释）；`10` §10.18 |
| 事件 `prepare.progress`（ADR-150/151/152） | `{step, done, total, bytes?}`（producer `prepare`，即 Supervisor 的 PrepareService，与 `06` 的事件注释一致；只用于卡片进度，不参与状态判定），`step` ∈ `mirror` · `lock` · `fetch` · `lfs` · `checkout` · `deps` · `handshake`（ADR-151 统一取值）：准备阶段各步骤的进度，供卡片与 Live Line 的 `preparing` 子状态显示 | `06` §6.3（`events` 表后的注释）；`10` §10.3.1；`12` §12.6.4 | |
| 注入 `tower.external_resolved`（ADR-137/140） | `{kept: string[], reverted: string[], mixed: string[]}`（≤ 120 token）：`keep`/`revert` 外部改动的决定追加到 `Goal.pendingOpenings`，下一次任何 Run 开始时作为开场的一段（ADR-140）；要求 Agent 不要回退已采纳的路径，并告知 `mixed` 路径上它自己的编辑已被撤销；Trace 标“Tower 注入” | `05` §5.6.3；`10` §10.3.1 |
| 事件 `satellite.recovered`（ADR-180） | `{tree, checkpointN?, by: "auto" \| "decision"}`（producer `sm`）：卫星重建成功（`10` §10.16.2 情形 E 的自动重建，或 `goal.rebuild_satellite`）的同一事务中记录；`tree` 为重建所用的树，`checkpointN` 为所用检查点（从 pin 或 base 重建时为空；M1 中只会是链上 `unusable` 为假的最新检查点，人选的检查点属 M2，`10` §10.16.2，ADR-183/184）。用途：生成 `tower.satellite_rebuilt` 开场（下一行）；`goal.discard_human_edits` 在人工编辑检出已丢失时以最近一条的 `tree` 为比较基准（`06` §6.4.3） | `10` §10.18、§10.16.2；`06` §6.4.3 |
| 注入 `tower.satellite_rebuilt`（ADR-178/180，唯一定义） | `{checkpointN?}`（≤ 60 token）：**任何 Run 开始时**，自本 Goal 上一次 `run.started` 以来的每条 `satellite.recovered`（自动重建或人发起的重试，不论继续目标）各组装一段，排在 `pendingOpenings` 的各段之前，告知 Agent“工作目录已从检查点 n（或最近一次提交的快照）重建，此后的改动与 Agent 在卫星中的提交历史不在工作目录中”（重建使未解除的外部改动以 `obsolete` 关闭时另加“外部改动随工作目录丢失”，`10` §10.16.2，ADR-183；所用的树不是链上最新的检查点时另加“检查点 n 之后的改动无法恢复”，ADR-184）；与 `tower.processes_terminated` 一样由 Tower 在组装开场时加入，不进入 `Goal.pendingOpenings`、不可撤回；原来写的“自动重建以 `steer` 告知”不成立（Run 已中止），已删除；Trace 标“Tower 注入” | `06` §6.4.3；`03` §3.2.1；`10` §10.16.2 |
| 提示“base 已含较旧版本”（ADR-137） | 观测到较旧的 seal 合入（`local_merged{current:false}`）时：Goal 在 `accepted` → 不经 I2 转为 `in_review`，卡片与评审顶部提示“base 已含较旧版本 <seal 短哈希>；当前内容尚未集成”；其他状态只在 Goal 页显示同一提示 | `10` §10.12；`04` |
| `StopCondition.id`（ADR-135） | 字符串，格式 `sc-<n>`（合同内从 1 递增，与 `Criterion.id` 同规则）；合同版本内稳定，修订合同时未改动的条目保留原 id，新增条目取新编号、删除的编号不复用；Needs-You 去重键 `stc:{goalId}:{id}`；“这里不该停”的决定以 `target.criterionId` 引用它 | `02` §2.5；`08` §8.4 |
| `StopCondition.kind` 在 M1 的求值（ADR-139/143） | M1 实现 `path_touched`、`command_matches`、`no_progress_for`：`path_touched`/`command_matches` 在 gate 中、工具执行**之前**求值，命中即拒绝该调用（返回“停止条件：需要人确认”）、drain、进入 `paused(stop_condition)`；`no_progress_for` 为 Supervisor 计时器。`natural` 只作为注入给模型的文字，模型以 `ask_user` 提问，产生 `question` 而不是 `stop_condition` | `02` §2.5；`05` §5.6.5；`07` |
| `Goal.stopConditionSilences[]`（ADR-139/143，默认再武装规则） | `{conditionId, scope: "run" \| "until_amend", object?, runId?, decisionId}`（`06` 列 `goals.stop_condition_silences`，默认 `[]`）。**“继续”**（`goal.resume`）→ 追加 `scope:"run"`：对本次命中的对象（路径 glob 匹配到的**具体路径**、具体命令）静默；该条目绑定**“继续”之后开始的那个 Run**——`runId` 在该 Run 开始时填入，该 Run 结束时清除（ADR-143 补记）；`no_progress_for` 的计时器重置。**“修订合同后继续”**（`contract.amend` + `goal.resume`）→ 修订本身清除全部 `until_amend` 条目，被修订的条件按新文字求值，未改动的条件保留原 `id`（去重键不变）。**“这里不该停”**（`goal.resume{feedback:"stop_condition_false_positive"}`）→ 追加 `scope:"until_amend"`：该条件静默到下一次合同修订 | `02` §2.4；`06` §6.3、§6.4.3；`03` §3.2.1 |
| `goal.resume` 的 `feedback` 参数（ADR-135） | 取值只有 `stop_condition_false_positive`；只在当前 `pauseReason = stop_condition` 时接受（否则 `E_INVALID`）；记为 `HumanDecision{resume, reason:{code:"stop_condition_false_positive"}}` | `06` §6.4.3；`02` §2.7 |
| `checkpoints.excluded_paths`（DDL）/ `Checkpoint.excludedPaths` | JSON 数组，默认 `[]`；git 在 `core.protectHFS/NTFS` 下会拒绝收录、`add` 之前一次列出并 `:(exclude)` 的路径（ADR-131/139，规则见 `10` §10.1.2）；非空即 `nested_repo`（路径 + 名字，不可覆盖）。本地文件排除集不记在这里，记在检查点与 pin 提交的 `Tower-Local-Exclude` trailer 上（`10` §10.7.1 第 1 步，ADR-207） | `06` §6.3；`10` §10.7.1 |
| `runs.process_token`（DDL，ADR-142） | 每个 Run 一个 128 位随机值 `TOWER_RUN_TOKEN`，由 Tower 的 `BashOperations.exec` 实现自身加入每条命令的环境（不依赖 `spawnHook`；Agent 的 bash 工具与 `user_bash` 都经过它，ADR-144；M2 中归因为人的只有 `user_bash` 调用窗口内、且不与 Agent 工具调用重叠的写入——重叠期间的路径记 `mixedPaths`；环境中的 `TOWER_ORIGIN` 只作诊断，ADR-145/146）、子孙进程继承；**唯一持久化的进程识别信息**（每 Run 一行，不随进程进出写事件）。识别、终止与重启清理的规则唯一定义在 `10` §10.3.1“后台进程的识别”；已登记窗口：不继承环境派生的进程（显式构造环境、`env -i`、经服务管理器启动，已知误判 (b)）；读取其他进程环境的约束见 `11` §11.6.2 | `06` §6.3；`10` §10.3.1；`11` §11.6.2；`13` §13.11.1 |
| `runs.phase`（DDL，ADR-145/146） | `running` · `settling`：settle 序列开始时在同一事务中写 `settling`；settle 序列中**撤回**（宽限内，或 `claimed`/`verifying` 中出现 `agent_start`）时在同一事务中写回 `running`。崩溃恢复据此区分“settle 中崩溃”（→ 继续目标 `settle`）与“Run 中崩溃”（→ `run`）；执行 `settle` 时 I4(a) 判定无有效提交 → 按 settle 判定表进入 `paused(idle_without_submit)` 或 nudge | `06` §6.1.6、§6.3；`05` §5.5；`10` §10.3.1 |
| `engine_outbox.state` / `timers.state`（Supervisor 内部） | `pending` · `sent` · `confirmed` · `failed` · `cancelled`；`armed` · `fired` · `cancelled` | `05` §5.7.4；DDL `06` §6.3 |
| `WorktreeRecord.state`（卫星） | `creating` · `preparing` · `ready` · `in_use` · `sealed` · `rebuilding` · `broken` · `retiring` · `removed` | `10` §10.3 |
| 冲突雷达结果 | `clean` · `overlap_only` · `textual_conflict` · `error` | `10` §10.9.2 |
| 重放命令 | `tower verify --replay <verifyId>`；重放包的路径、内容、保留与“不做近似重放”规则**只以 `07` §7.4.1 为准**（R5-D6-01），本表不复述；镜像保留 ref `refs/tower-retain/<goalId>/<verifyId>` 见 `10` §10.17.1 | ADR-070、ADR-083；`07` §7.4.1 |

### 16.1.13 已废弃的标识符与术语（lint 拒绝）

| 废弃 | 现行 | 依据 |
|---|---|---|
| `reviewCapacityLocPerDay`、“评审能力调速器 / 调速器 / governor” | `reviewBacklogLimitLoc`、“评审积压上限” | ADR-014 |
| `requireAllUnitsViewed` | `review.viewPolicy` | `02` §2.5 |
| `cleanEnv` | 删除：验收依据一律来自验证器干净槽位 | ADR-020；`07` §7.2.4 |
| `Run.sessionPath`、`Scratch.sessionPath` | `sessionId` | `02` §2.6、§2.12 |
| `Claim{kind:"eta"}`、ETA 校准 | 删除 | ADR-030 |
| 布尔 `tainted` | `taint.level` | `09` §9.2.1 |
| `actionable: boolean` | `outcomeClass` | `02` §2.9 |
| 评论 `blocking` 标记 | `requiresChange` | `02` §2.8 |
| 单一 `N/M` 进度 | `已验证 V/M · 观测到 O/M · 人工 h/k` | ADR-020、ADR-052：**M = 机器标准数（exec + artifact）**；human 与 `subgoal_accepted` 标准另列为“人工 h/k”，永不进入 V 或 O |
| “简报 ≤ 400 token”“≤ 600 token” | 常驻 ≤ 650（工具 ≤ 350 + 系统段 ≤ 300） | ADR-009 |
| 默认 `~/.tower/worktrees`、`.tower-wt/` | `.tower-wt.noindex/`（`~/.tower/worktrees` 仅回退） | ADR-008 |
| “Tower 默认不启用 MCP” | 继承用户 Pi 配置 | ADR-032 |
| `@earendil-works/chord`（SP1 chord 原型） | 手写协议 | ADR-005 |
| 不分档的“16 ms”承诺 | 120 Hz ≤ 16 ms p95 · 60 Hz ≤ 33 ms p95 | `13` §13.1 |
| `seen` 作为回执状态 | `delivered` 的属性 `seenAtEntry` | `05` §5.7.3 |
| `G N`（下一件） | `G X` | §16.3 |
| ADR-114 的评审阶段外部 hunk 处置：`goal.review.adopt_external` / `goal.review.revert_external` 命令、`adopt_external_hunks` / `revert_external_hunks` 决定种类、评审单元中待处置的 `author:"external"` 状态 | 外部写入在任何非 `running` 状态都先进入 `paused(external_change)`，以 `keep`/`revert` 处置（ADR-122）；`running` 中逐路径记入 `Checkpoint.externalPaths` | ADR-122 |
| HFS+ 文件名等价为“已知限制” | 名字比较先去除默认可忽略码位，覆盖 HFS+（ADR-120，`10` §10.1.2） | ADR-120 |
| settle 顺序“终止进程 → `agent_bg_done` → 2 s 宽限 → `claimed`”；身份键 `(pid, startTime)` | “2 s 宽限 → 终止并等待 → `agent_bg_done` → `claimed` → pin”（ADR-137 起 pin 与 `claimed` 同一事务）；进程以 Run 令牌识别（ADR-142） | ADR-121、ADR-137、ADR-142 |
| 已覆盖目录的检出写出“git 元数据文件写 base 版本、其余写 pin 版本” | 白名单：只有 `objects/**`（不含 `objects/info/**`）、`refs/**`、`packed-refs` 写 pin 版本，其余写 base 版本或不写出 | ADR-124 |
| “symlink_escape 对 pin 中全部链接命中、无 base 豁免” | base 中原本不安全且解析未变的链接不命中，只列入提示 | ADR-124 |
| I4 有效提交以指纹判定（`Run.submit.fingerprint == settle 时指纹`，“`submit` 之后没有任何改变工作区指纹的工具调用”） | 以工具事件判定：最后一次 `submit` 之后没有变更类工具调用；`submit` 之后仅由后台进程产生的变化进入 `agent_bg_done` 检查点（`03` §3.3 I4） | ADR-121 |
| Supervisor 侧的“提醒回合”（settle 之后发现提交无效时以 `prompt` 开回合、计入 nudge）；`claimed` 的出口“宽限确认失败” | 删除：宽限失败只有一个去向（唯一定义 `05` §5.5：不记异常，回到等待下一次 `agent_settled`）；新的工具调用都经过 `agent_before_settle` 的常规 nudge；Tower 不以 user 角色注入消息 | ADR-129 |
| 以 `resumeTo` 记录 `external_change` 检测时的状态（ADR-122）；其后的 `externalChange.detectedIn {state, pauseReason?, phase?}`（ADR-128）与“按 `detectedIn` 继续”的逐状态枚举 | `Goal.continuation`（首次进入 `paused` 时写入）+ 唯一转移函数 `onAllReasonsCleared()`（`03` §3.2.1） | ADR-128、ADR-134 |
| `Goal.resumeTo`（ADR-084/094：`satellite_missing` 的恢复目标）、DDL `resume_to` | `Goal.continuation`；卫星重建完成只解除 `satellite_missing`，不改写继续目标 | ADR-134 |
| `Goal.pendingVerify {pin, verifyFrom, trigger}`（ADR-084，含第 14 轮的 `human_change`/`agent_bg` 触发）、DDL `pending_verify` | `continuation = {kind:"verify", pin}`（源状态取 `Goal.verifyFrom`）；需要以新树验证时为 `verify_new{returnTo?}`（显式改写或守卫产生；ADR-140 起不带 `origin`） | ADR-134 |
| `applyPendingHandBack()` 作为独立入口；“系统事件与 `goal.resume` 各自判定是否执行 `pendingHandBack`” | `onAllReasonsCleared()` 第 1 步 | ADR-134 |
| `nested_repo_live` 条目消失后“不需要人再操作”（自动恢复） | 是唯一原因时改为 `paused(human)`，由人显式继续 | ADR-134 |
| `revert` 之后“树 ≠ 基线时剩余差异按归因表分类”（比较整棵树） | 只考察 E 中的路径；E 之外的路径按检查点链归因 | ADR-134 |
| macOS“每个 Run 一个进程组 / 每 Run 一行”（`run_process_groups`，ADR-128）；其后的“每个 bash 调用一行”（`bash_process_groups`，ADR-135）与“按组成员确认”（ADR-138） | 不再按进程组识别：每 Run 一个令牌（`runs.process_token`），按环境中的 `TOWER_RUN_TOKEN` 识别 | ADR-135、ADR-138、ADR-142 |
| 默认良性条目 `(system, write, ~/.ssh/known_hosts)`；`credential` = “`~/.ssh/**` 除 `known_hosts`”；`user_config` 只含点目录本身 | `(credential, write, ~/.ssh/known_hosts)`；`~/.ssh/**` 整体为 `credential`；`user_config` 含顶层点目录之内的全部内容 | ADR-136 |
| git 拒绝收录时 `:(exclude)` 只重试一次（第 14 轮）；按失败逐次循环排除、上限 64 条 / 64 次（第 15 轮） | `add` 之前按 `10` §10.1.2 的规则一次列出全部会被拒的路径并一次排除；git 仍拒绝时才兜底重试 | ADR-136、ADR-139 |
| 重新 seal 时直接写入（或覆盖）已有的 Goal 分支 | 顶端仍是 Tower 自己的 seal 才快进更新（CAS；树与说明都相同时复用，`10` §10.6）；否则写入 `B₀-v<k>`，不改写用户的分支 | ADR-136/191 |
| “Tower 不以 user 角色注入任何消息” | Tower 发起的回合以 `tower.*` custom message 开始，Trace 标“Tower 注入”；只有人亲手写的转向与回答以 user 角色出现（`05`） | ADR-135 |
| 评审中“就地修一下”保存后直接按 I2 进入 `verifying` | 保存后是一次外部写入，须在外部改动卡片上确认“采纳为我的改动”（`keep`）（M2 功能） | ADR-122、ADR-134 |
| `paused(sentinel_high)` 中 `request_changes` 直接 `run.requested{rework}`；延后执行时丢失命令自带的开场；其后 ADR-137 的 `run.openings` | `request_changes` 只解除本原因；开场载荷一律追加到 `Goal.pendingOpenings`，下一次任何 Run 开始时消费 | ADR-137、ADR-140 |
| `claim_on_behalf` 改写为人的改动触发的验证（ADR-134 的写法）（失败不自动返工、`trigger:fp_changed_human`） | `{kind:"claim", decisionId}`：直接进入 `claimed`，`trigger:"claimed"`，失败按 Agent 路径，Trace 记“人代为提交” | ADR-137 |
| `budget.extend` 把硬上限提高到用量之上即解除 `budget_hard_cap`（唯一原因时立即开 Run） | `budget.extend` 只提高额度；由 `goal.resume` 解除 | ADR-137 |
| `settle` 目标 = “`agent_bg_done` → I4 → `claimed`”（不含宽限确认）；settle 序列先进入 `claimed`、随后生成 pin；人暂停或 `app_quit` 发生在 settle 序列中时继续目标为 `run` | 从宽限确认起重新执行完整 settle 序列；pin 与 `claimed` 同一事务；settle 序列中任何原因进入的暂停都是 `settle` | ADR-137 |
| `nested_repo_live` 条目消失后只在“唯一原因”时转为 `paused(human)` | 无论是否唯一原因，一律在剩余原因中加入 `human` | ADR-137 |
| 观测到任何已验收 seal 的合入都进入 `integrated` | 只有最近一次验收、且之后无新内容的 seal 才进入 `integrated`；较旧的 seal 只记 `local_merged{current:false}`，`accepted` → `in_review` 并提示 | ADR-137 |
| drain 的目的原因只在内存中；drain 中崩溃 → `paused{app_quit/engine_crash}` + `autoResume` | `Goal.drainingFor` 持久化（ADR-141 起为集合）；恢复按 `06` §6.1.6 的唯一规则 | ADR-138、ADR-141 |
| 继续目标 `settle` 带 `adoptedHuman` 标志；`verify_new` 带 `origin`；以 `verifyOrigin` 决定验证失败是否自动返工 | 继续目标是纯目标（ADR-140）；失败去向由归因决定：自上一个已验证 pin 以来存在 `author:"human"`/`mixed` 检查点 → `human_change_verify_failed`，否则 Agent 路径；`verifyOrigin` 只作说明 | ADR-140 |
| 停止条件 `rework_cycles_over`（及其暂停与再武装） | 返工上限只由 I6 与 `Contract.maxReworkCycles`（默认 3）定义 | ADR-143 |
| `agent_processes` 表、`agent_proc.*` 事件（逐进程持久化“存活 ≥ 5 s”的进程、`gone` 行、每 Goal ≤ 30 条/分钟）；`bash_process_groups` 表 | 只持久化 `runs.process_token` | ADR-142 |
| 以 `(bootSession, pid, startTime)`、pgid 或进程组成员识别 Agent 进程；“`setsid` 脱组且存活 < 5 s”的已登记窗口 | 以环境中的 `TOWER_RUN_TOKEN` 识别（macOS `KERN_PROCARGS2`，Linux cgroup 为主），发信号前再确认；已登记窗口为主动清空环境的进程 | ADR-142 |
| `drainingFor = {reason, decisionId?, requestedAt}`（单一原因，按优先级覆盖） | `{target, reasons[], decisionIds, requestedAt}`，期间到达的请求只并入集合 | ADR-141 |
| 验证失败去向的旧口径：“自上一个已验证 pin 以来存在 `author:"human"` 或 `mixed` 的检查点”（`mixed` 被当作作者值；起点只看已验证 pin，人交还后仍不自动返工） | 归因窗口：人的改动 = `author:"human"` 或 `mixedPaths` 非空的检查点；起点 = 最近一次通过的 pin 与最近一次把工作交给 Agent 的决定中较晚者 | ADR-144 |
| `pendingOpenings: DecisionId[]` | `OpeningRef[]`（`{id, decisionId} \| {id, factId}`），可见、可按 `openingId` 撤回 | ADR-144 |
| 令牌注入依赖 `spawnHook`；Run 令牌的已登记窗口“小于此前的 `setsid` 脱组窗口” | 由 `BashOperations.exec` 自身注入；窗口如实列为不继承环境派生的进程，不作大小比较 | ADR-144 |
| 非 `pause` 目标的 drain 并入原因后仍按原目标执行（接管、回退、依赖回退） | 放弃原目标，进入 `paused(reasons ∪ {human})`；崩溃恢复同一规则 | ADR-144 |
| M2 中以环境值 `TOWER_ORIGIN=human` 把后台进程的写入归为人 | 只把 `user_bash` 调用窗口内的写入归为人；后台进程按存活进程规则记 `agent`；`TOWER_ORIGIN` 只作诊断 | ADR-145 |
| “知悉”`bg_process_survived` 结束存活期间（停止 30 s 扫描、之后的写入不再按第 3 行归为 Agent） | “知悉”只结束打扰；存活期间到存活者全部退出为止 | ADR-145 |
| 撤回开场一律返回成功（含已发送的条目） | 已消费 → `already_delivered`（“已发送，无法撤回”）；已撤回 → 成功 | ADR-145 |
| 归因窗口按“检查点在决定之后”的时间先后界定；没有通过的验证时起点为 base | 按事件序号界定；没有通过的验证时起点为 `Binding.boundSeq` | ADR-145 |
| `Binding.boundSeq` 随 rebase 移动（“绑定或最近一次 rebase”）；macOS 内存上限只采样直接 pid、越过 80% 才扫描；“不做持续的全进程扫描” | `boundSeq` 固定为绑定事件；后代树遍历（每 5 s）+ 最多每 60 s 一次的令牌全扫描（Run 活跃且设有上限时）；“周期性的全进程扫描最多每 60 s 一次” | ADR-146 |
| `queuedRun` 在准入时清除；合同批准进入 `ready` 时 `queuedRun` 为空；准备阶段请求 `abandon` 返回 `E_BUSY`；准备阶段没有时限 | `ready` 中恒非空（批准写 `initial`，依赖回退写 `resume`），在 `run.started` 的同一事务中清除；`abandon` 始终允许并中止准备；准备阶段 120 s，失败 → `paused(engine_crash)`、不 `autoResume`、`stalled{prepare_failed}` | ADR-148 |
| 准备阶段分两个子阶段、依赖物化失败也进入失败出口（ADR-148 补记）；准备阶段失败记为 `paused(engine_crash)`（ADR-148） | 依赖物化不阻止 Run（失败 → `prepare{ok:false}` 照常进入 `running`）；其余步骤失败或超时 → `paused(prepare_failed)`，不自动解除 | ADR-149 |
| LFS 对象“由安装器步骤预取到镜像的 LFS 存储”（ADR-074）；仓库准备（镜像首次建立、跨卷复制、项目锁、fetch）计入 120 s；`queuedRun` 写入表总是覆盖已保留的值 | LFS 在仓库准备中补齐（先 CoW 自用户主检出，缺的由 GitRunner 以用户凭据获取）；仓库准备单独计时（15 min）；已保留的值优先，只有人的显式决定覆盖 | ADR-150 |
| LFS 获取由 GitRunner（git-only 沙箱，网络只到项目远端）执行；卫星检出计入 120 s；`take_over` 只要求“卫星已存在”；`queuedRun` 只在 `run.started` 与 `abandon` 时清除 | 由 Tower 以用户身份在 Agent 沙箱外执行（用户全局配置与 credential helper，网络不限主机，不适用加固清单）；检出计入仓库准备，120 s 只计握手与开场；`take_over` 要求检出完成标记；`queuedRun` 另在进入 `ready`/`paused` 以外的状态时清除 | ADR-151 |
| LFS 获取依赖 git-lfs 从镜像读取 `.lfsconfig` 或仓库级配置；LFS 凭据参与脱敏的精确匹配（ADR-151）；未建成的卫星按“卫星丢失”处理 | LFS 端点由 Tower 按 git-lfs 优先级显式算出并以 `-c` 传入（用户主检出 `lfs.url`/`remote.<name>.lfsurl` → base `.lfsconfig`（`git show`）→ 由远端 URL 推导），镜像的 `HEAD` 与配置不参与；Tower 看不到也不截取 LFS 凭据，命令输出只进诊断日志；只有检出完成标记存在的卫星才适用丢失判定 | ADR-152 |
| `take_over` 的条件写为“卫星已存在” | “检出完成标记存在” | ADR-151、ADR-152 |
| ADR-157 在 macOS 上的说法：“Seatbelt 拒绝对非自身进程树的 `process-info*` 与其他进程的 `kern.procargs2`/`kern.proc` 读取”“观察通道已在沙箱层面关闭”“SP6a A12(a) 是闸门”“对自身进程树的 `ps` 照常可用” | macOS 上无法阻止（实测）；A12(a) 是测量；M1 按闸门失败设计，带凭据的远端默认拒绝；T33 macOS S2 为中 | ADR-158 |
| `baseTip` 分叉时取“获取时间较新”的一方 | 分叉时不自动选择，`baseCommit` 不变，`goal.base.choose{side}` | ADR-158 |
| 推送失败后队列条目“保持待推送”（不在状态枚举中） | `awaiting_push`，不占用该 base 的 FIFO；Fact `push_failed{stage}` | ADR-158 |
| 令牌识别中“读不到环境 → 提示”“`setsid`、双重 fork 都不影响识别”对所有进程成立 | “读到空环境”同样视为无法确认；进程树与令牌取并集；脱离进程树的 Apple 平台二进制是登记窗口 | ADR-158 |
| 经确认的云 SDK 凭据链（含 `AWS_SECRET_ACCESS_KEY` 等原始密钥变量）透传到 Engine Host 进程环境 | 只传指向文件的变量；原始变量写入 `0600` 凭据文件、传路径 | ADR-158 补记 2 |
| “Agent 活动”按组件枚举（Goal、Scratch、检验服务、其他槽位上的标准、存活者）；带机密的标准与其他标准混排、在槽位中等待 | 按原则定义（Tower 启动的、运行 Agent 编写或可影响内容的任何进程），原枚举只是例子；机密阶段的设计（等待不占槽位，先准备后注入，不回写缓存，其他标准失败时不运行）整体属于 **M2**（见 ADR-164 行） | ADR-162 |
| 项目级 Fact `local_file_unreadable`（ADR-172）：本应复制的本地文件不可读或不存在时记 Fact，L1 通知由它产生、随它 `expired` 而消失；验证失败卡片上的“未复制”提示取自该 Fact；验证结果上“记录的本地文件哈希与指纹 `extra`” | 本应复制的条目不可读或不存在时，执行复制的服务发 L1 通知，为进程内状态，按条目去重，不写账本，重启后不保留（唯一定义在 `ProjectLocalFile` 行）；“未复制”提示取自本次验证记录的 `criterion_check.env.localFiles` 中 `not_copied` 的条目（`07` §7.4.1）；`criterion_check` 只按 tree 判新鲜度，指纹不含本地文件（`07` §7.3.2、§7.3.3、§7.4.2；ADR-174） | ADR-173 |
| `fingerprint.extraGlobs`：`07` §7.3.2 指纹的 `extra` 部分（`wt1:${tree}:${extra}`）、§7.10 VerifyProfile 的字段与默认值行；`09` §9.7 提议加入它的学习项 | 指纹为 `wt1:${tree}`（`:weak` 照旧），不含本地文件；已播种文件全部经 `envHash` 进入（`07` §7.4.3），槽位中只会出现已播种文件；`09` §9.7 的学习项改为提议把该文件加入本地文件清单（需批准，经 `project.local_files.add`，加入后按 `ProjectLocalFile` 行判定） | ADR-174 |
| `verify_env_error{stage:"secret_file_unseeded"}`、其 Needs-You（`ve:{goalId}:secret_file_unseeded`）与三个出口；验证器沙箱对未播种路径的“拒绝并报告”规则；SP6a A13；`goal.request_changes` 自 `paused(verify_env_error)` 发起的特例 | 不做自动归类：标准失败一律按普通失败处理（含自动返工）；项目有未播种的机密本地文件时，失败卡片、返工证据与试运行红灯旁附 Claim 语法的提示，并提供“改为 human 标准”（`contract.amend`，唯一定义在 `07` §7.4.1） | ADR-168 |
| `secret_file_unseeded` 以输出文本中出现的文件名判定；安装器第 1 阶段读取项目 `.npmrc` 的认证行；人工编辑检出“不含含密钥的本地文件”而交还未排除人复制进来的机密文件 | 不做自动归类（见 ADR-168 行）；只读用户级 `~/.npmrc`（`${VAR}` 以登录环境展开）；交还时一律排除机密本地文件的路径 | ADR-167 |
| “M1 中没有任何机密进入 Agent 可影响的进程”（ADR-164 的绝对表述）；钥匙串存三类（含私有注册表令牌，ADR-165）；检验检出带上含密钥的本地文件；`dep.add` 的代理安装不经安装器第 1 阶段；MCP 服务器的“显式授予”；项目变量可含机密 | “Tower 不会自动把机密交给 Agent 可影响的进程”，例外为人发起的 `inspect_with_secrets`；钥匙串只存两类，注册表令牌每次从 `npmrc` 读取、不保存；检验检出默认不带机密文件；`dep.add` 走第 1 阶段；MCP 环境只由用户配置；`VerifyProfile.env.vars` 的机密在编辑时拒绝 | ADR-166 |
| 安装器私有目录 `$TI` 下长期保存含令牌的 npmrc；合同可把注册表令牌授予 Agent 可读的 npmrc（ADR-063）；首次运行导入工具令牌（ADR-033）；含密钥的本地文件复制进验证槽位与检验检出 | 注册表认证以即时投递文件只交给安装器第 1 阶段（不执行项目代码，阶段结束即删；令牌来源与“Tower 不保存”见 ADR-166 行）；Agent npmrc 授予与工具令牌导入归 **M2**；含机密的本地文件在 M1 中默认不播种（名称模式判定的不可取消标记） | ADR-165 |
| M1 中的带机密验证标准（ADR-159–163）：`exec` 标准的 `env` 与 `secretsVia`、调度互斥与 `secretMutex.enabled`、机密阶段与整机冻结、`secret_wait` Needs-You 与 `verify.secret_wait.keep` · `run_now` · `as_file`、`HumanDecision{accept_secret_exposure}`、`not_run`（`other_criteria_failed` · `blocked_by_sentinel`）与 `Continuation.verify.secretPhaseOnly`、`verify.slotPrepareTimeoutMin`、验证器对投递文件的逐路径放行 | 整体推迟到 **M2**（设计起点保留在 `11` §11.7.0a 与 `07` §7.4.11）；M1 中标准不能声明机密，需要机密的检查写为 human 标准；`startAgentActivity` 保留为没有冻结的唯一启动点 | ADR-164 |
| 人输入文本的机密检查只覆盖回答、转向、评论、交还说明 | 协议层覆盖所有携带人类自由文本、会进入模型上下文的命令参数（含恢复与重试的附言、合同文本、人写的记忆、目标描述）；匹配集合加入钥匙串中 Tower 持有值的精确匹配 | ADR-164 |
| M1 中的 `secrets.access`：批准卡片、`approved_waiting`、`secrets.access.use_now`、单次调用机密表与 `toolBash` 的 `toolCallId` 包装；经 `spawnHook` 注入单次调用的说法 | 归 **M2**（M2 中重新设计，注入点为 Tower 的 `exec`）；M1 中 Agent 的工具调用从不获得密钥库中的机密；`accept_secret_exposure` 在 M1 中不产生（ADR-164） | ADR-161 |
| “Agent 活动”只含 Goal、Scratch 与检验服务；`baseTip` 分叉未选择时“返回 `baseCommit` 所在的一侧” | “Agent 活动”另含其他验证槽位上的标准与未解决的 `bg_process_survived`，带机密的标准独占整个验证器；`baseTip` 返回 `baseCommit` 本身 | ADR-161 |
| 密钥库“只存在系统钥匙串”与“`~/.tower/secrets.enc`”两种说法并存 | 系统钥匙串为静态存放处；`secrets.enc` 只是钥匙串不可用时的加密回退（`11` §11.7.1） | ADR-161 |
| 独占窗口（ADR-159 及补记 2、3）：tower-goal 工具调用闸门第 0 步及其契约测试；窗口期间对其他 Goal 进程的 `SIGSTOP`/`SIGCONT` 及崩溃恢复中的补发 `SIGCONT` 与重新运行；事件 `secret_window.opened` · `secret_window.closed` · `secret_window.suspended` · `secret_window.resumed`；挂起期间墙钟预算、停滞检测与 Run 耗时不计时 | 调度互斥（ADR-160），本身已随带机密的标准推迟到 **M2**（见 ADR-164 行）；M1 中没有机密进入 Agent 可影响的进程 | ADR-160 |
| 命令 `goal.tool.abort` 与 `HumanDecision{abort_tool_call}`；`secret_window` Needs-You 与 `verify_env_error{stage:"secret_window"}`；项目设置 `secretWindow.enabled` | `verify.secret_wait.keep` · `run_now` · `as_file`、Needs-You `ve:{goalId}:secret_wait`、`secretMutex.enabled`——均为 **M2**（见 ADR-164 行）；M1 中不出现 | ADR-160 |
| 验证器标准的机密默认文件注入（`secretsVia: "file"`，ADR-158） | 带机密的验证标准整体推迟到 **M2**（ADR-164）；M1 中标准不能声明机密，需要机密的检查写为 human 标准 | ADR-159 |
| “Tower 从不把机密放进任何参数或环境”（ADR-158 的绝对表述） | M1 中 Tower 不会自动把机密交给 Agent 可影响的进程（ADR-164/165/166/167）；Tower 自身进程按 `11` §11.7.0 接收：Host 内存中的模型密钥，交给 Engine Host 与安装器第 1 阶段的即时投递文件 | ADR-159 |
| 云 SDK 原始变量写入“Tower 数据目录下的 0600 凭据文件” | 写入即时投递目录 `~/.tower/run/<hostId>/`（备份与 Spotlight 排除，启动时只清除不属于存活 Host 的，`06` §6.1.6） | ADR-159 |
| 远端 base 获取“按 Goal 合并”、非准备时机没有总时限；重启清理按进程树与令牌的并集 | 按（项目镜像，远端，分支）合并、总时限 60 s；重启清理只按令牌，“无法确认”的进程不发信号、不提示 | ADR-159 |
| 验证器机密默认以环境变量注入；模型密钥可经环境传入 Host | 模型密钥只在 Host 内存中；验证器机密整体属于 **M2**（ADR-164） | ADR-158 |
| Tower 的 git 网络命令中的凭据改写（ADR-155/156）：userinfo 剥离与“去掉 userinfo 的 URL + 显式 refspec”、store 文件（`credential.<…>.helper = store --file=`）、按主机改写凭据（`credential.<scheme>://<host>.*`）、写出完整有效配置、`GIT_CONFIG_NOSYSTEM=1`、`insteadOf`/`pushInsteadOf` 的去凭据改写 | 全部撤回：网络命令原样使用用户配置的远端 URL，与用户自己的 `git fetch` 相同；带凭据的远端在 macOS 上不执行网络命令（ADR-158 起为默认，“沙箱层面关闭”的前提已由上方 ADR-158 行废弃） | ADR-157 |
| `baseTip` 分叉时固定取 `refs/tower-remote`；M1 远端引用 base 只在 Goal 准备时获取 | 分叉时取获取时间较新的一方；M1 在四个时机获取并观测 | ADR-157 |
| `pre-push` 需要 git ≥ 2.42，低于时跳过钩子照常推送；推送失败只记 Fact | `--to-stdin` 自 2.40 起可用，无回退；推送失败进入 Needs-You `integration` | ADR-157 |
| URL 凭据写为 `credential.<完整 URL>.*` 并先清空该 URL 上的 helper 列表；所有网络命令无条件设 `GIT_CONFIG_NOSYSTEM`；Run 空闲点的自动 rebase 与 rebase 前 LFS 补齐计入 M1；“base 前移”取 `rev-parse <baseRef>`；`git hook run pre-push` 以管道传标准输入 | 凭据按主机提供、从不清除用户 helper，只有用户名时只写 `username`；`GIT_CONFIG_NOSYSTEM` 只在不 include 全局配置时设；自动 rebase 归 M2；`baseTip`；`--to-stdin` 与 `--ignore-missing` | ADR-156 |
| base 的远端 fetch、轮询与推送在用户检出中执行（`git -C <userCheckout> fetch/push`），更新用户的 `refs/remotes/*` | 全部在镜像中执行，取入 `refs/tower-remote/<r>/<b>`；用户检出只用于读取有效配置 | ADR-155 补记 2 |
| 远端引用 base 的刷新与 M2 轮询写死 `git fetch origin <ref>`；LFS 临时配置中保留 URL 的 userinfo；临时文件位于“Tower 数据目录下”而未指定子目录 | 远端名统一规则；交给 git 的 URL 去掉 userinfo，凭据经 store 文件；`~/.tower/tmp/` 且启动时清空 | ADR-155 |
| LFS 获取的配置以 `-c` 在命令行传入；远端名 = `branch.<base>.remote`，没有则 `origin`；被排除的 LFS 文件只在卫星中保持指针 | 0600 临时配置文件 + `GIT_CONFIG_GLOBAL`，命令行与环境只有路径；远端顺序 `branch.<base>.remote` → `remote.lfsdefault` → 唯一远端 → `origin`；所有检出保持指针 | ADR-154 |
| `.lfsconfig` 的全部键都传给 `git lfs fetch`；来源优先（主检出配置整体优先于 `.lfsconfig`）；镜像 `HEAD` 共享、指向任意 base；准备期间 watcher 监视卫星 | 键白名单、URL 只接受 https 与 ssh；按键解析（键优先）；镜像 `HEAD` 指向 `refs/tower/none`；检出完成标记出现之前不监视 | ADR-153 |
| 拒绝路径超过 64 条 / 循环超过 64 次 → `verify_env_error{stage:"integrity"}` | 不设路径数上限；以已排除的路径完成，以 `nested_repo`（列出全部被排除路径，唯一出口“删除这些条目”）阻断；`running` 中按 `nested_repo_live`；从不标为 `verify_env_error` | ADR-139 |
| `in_review`/`accepted` 中任何指纹变化都按 I2 进入 `verifying`（含来源不明的写入） | 来源不明 → `paused(external_change)`；只有 Tower 自己的工作、人的显式采纳与存活进程（`agent_bg`）走 I2（分界唯一定义 `10` §10.3.1） | ADR-128 |
| “可变更工具（edit / write / bash / 未知自定义工具）”等列举式定义；`readOnlyHint` 单独即可豁免 | “变更类工具调用”唯一定义（§16.1.4）：只读白名单之外的任何工具调用，含嵌套、MCP、扩展工具；`readOnlyHint:true` 还须通过 `11` 路径检查 | ADR-130 |
| `.git` 等价条目在 `running` 中被发现时记 `nested_repo`（可覆盖）；git 拒绝收录“转为 `nested_repo` 命中”而不说明树如何生成 | `nested_repo_live`（run 类、不可覆盖）；拒绝收录 → `add` 前一次列出并 `:(exclude)`、记 `excludedPaths`，`nested_repo` 不可覆盖、唯一出口是删除 | ADR-131、ADR-139 |
| M1 的推送、开 PR、远端轮询（`gh pr view`）、远端合并观测；ADR-059 的“M1 集成 = 仅保留分支 + 推送并开 PR” | M1 只有 `branch_only`，只观测本地 base；推送与 PR 属于 M2 | ADR-133（削减 ④′） |
| 交还 `take_external` 记 `human_edit` 检查点或注入 `tower.handback` | 放弃改动 + 保留 `external_change`；`targetTree` 记 T0 | ADR-128 |
| 沙箱拒绝去重键 `sv:{goalId}:{category}:{targetRoot}`；良性清单与降级单位“(类别, 目标根)” | `sv:{goalId}:{category}:{op}:{target}`；单位 `(category, op, target)`（字段定义见 §16.1.6） | ADR-125 |
| 沙箱拒绝 severity 2 集合不含 `user_config`（写 `~/.gitconfig` 为 severity 1）；以路径枚举（“用户主检出、Tower 数据目录、`~/.ssh`、钥匙串……”）代替类别 | `credential`（读、写）· `tower_data` · `user_checkout` · `other_satellite` · `user_config`（仅写），见 §16.1.6 | ADR-125 第 13 轮 lint 补记 |
| `symlink_escape` 只检查新增或改变的链接；解析经过 tree 中不存在的分量时结论未定义；伪代码不处理仓库根 | pin 中全部链接整链解析；不存在的分量与 `.git` 分量视为逃逸；根目录是候选目录 | ADR-116 |
| 覆盖后的仓库形态目录按 pin 版本写入两种检出 | 白名单写出：`objects/**`（不含 `objects/info/**`）、`refs/**`、`packed-refs` 为 pin 版本，其余为 base 版本（ADR-124 取代 ADR-116 的“git 元数据文件写 base 版本”） | ADR-116、ADR-124 |
| 两种检出的依赖目录中的仓库形态目录“不处理、登记残余” | 物化后名字扫描，命中不写出、列入信任提示 | ADR-116 |
| “撤销外部改动”的目标 = “Run 的最后一个回合检查点”“最近的非外部检查点” | 检测前最近的任意检查点，无则 pin，再无则 base（唯一定义 `10` §10.3.1） | ADR-114 |
| 受保护目标沙箱拒绝是越权意图的“直接证据” | “可能表明”；带出口与良性清单 | ADR-117 |
| settle 时“SIGTERM，5 s 后 SIGKILL”且不等待进程树清空 | 2 s 宽限确认 → 终止全部追踪进程 → 等待清空（10 s）→ `agent_bg_done` → `claimed` → pin（ADR-121 调整后的顺序）；进程以 `TOWER_RUN_TOKEN` 识别（ADR-142，取代 `(pid, 启动时间)`） | ADR-115、ADR-142 |
| 以早期预警结果作为**检查点**树的 `:(exclude)` 集合；检查点树排除大文件 | 检查点树与 pin 树同一定义（只排除 `.git` 与 gitlink），唯一来源 `10` §10.7.1 | R11-D13-01 |
| `pinSafetyCheck` 只检查标记文件本身（ADR-109 规则 a）；符号链接按词法折叠判定；覆盖按 `(detector, subject)` 内容不变即延续 | 候选目录下任何变化（ADR-111）；pin tree 内整链解析（ADR-112）；覆盖绑定对象哈希（ADR-112） | ADR-111/112 |
| 改动的 base 夹具照常写入两种检出（ADR-109 第 5 点的放行） | 在覆盖之前不写出 | ADR-111 |
| `author:"external"`（保留外部改动时的检查点作者） | 保留即 `author:"human"`（人显式采纳，seal 写 `Tower-Human-Edit`） | `10` §10.3.1 |
| 嵌套仓库“从 pin/seal 中排除”（ADR-071/096/101/106 的排除语义）；以早期预警结果作为 pin 的 `:(exclude)` 集合 | `pinSafetyCheck` 不排除、只阻断；pin 由影子 `add -A` 照常生成（只去除 gitlink），早期预警不影响 pin | ADR-109 |
| 在物化的 pin（验证槽位）上以 `git rev-parse` 做嵌套仓库权威检查；“结构变化”按条目存在性判定 | `pinSafetyCheck(baseTree, pinTree)`：只看 tree 对象；候选目录之内的任何变化（ADR-111）与 tree 内整链解析的符号链接逃逸（ADR-112） | ADR-109/111/112 |
| 阻断的 `sandbox_violation`（ADR-107） | 提示性（不阻止 Verified） | ADR-110 |
| 仓库形态目录（含未改动的 base 夹具）一律不写入两种检出 | 只有 `pinSafetyCheck` 命中的路径不写出；未改动的 base 夹具照常写出 | ADR-109 第 5 点 |
| `git_control_tampered`（检测器）、卫星 gitdir 写入白名单、控制文件哈希校验 | 退役：卫星 gitdir 整体归 Agent，安全边界为“沙箱外不可发现 + 任意深度不可创建 `.git`”（ADR-089） | ADR-089 |
| `depcache_tampered`、`verifier_config_tampered` | `verifier_store_tampered` | `07` §7.4.3 |
| `worktree_missing` | `satellite_missing`（ADR-076） | ADR-076 |
| Agent 沙箱 bash 全局导出 `GIT_DIR`/`GIT_WORK_TREE`（spawnHook 设置） | PATH 首位的 Tower git 垫片只对卫星内运行的 git 注入，并剥离继承到卫星外或 `init`/`clone` 的同名变量（ADR-088/090） | ADR-088、ADR-090 |
| 卫星工作目录中的 `.git`（目录或 `gitdir:` 指针文件） | 分离 gitdir `<wtRoot>/_gitdirs/<goalId>`；工作目录内禁止创建 `.git` | ADR-081 |
| 用户仓库中的 `refs/tower/<goalId>/base` 保活 ref | 删除；卫星与影子借用 Tower 镜像库 `mirror.git`（ADR-073） | ADR-073 |
| 决定性指纹 = 全新临时索引（每次） | 影子索引 stat 检查；完整重哈希只在验收与 seal（ADR-075） | ADR-075 |
| 验证 pin 在验证前 fetch 进用户仓库 / 验证器从用户仓库检出 pin | pin 只在影子中；槽位由 `slot-<k>.git` 从影子检出；用户仓库默认只接收集成时的 seal（地标可选） | ADR-073；`10` §10.6.2 |
| `COREPACK_HOME`、经 Corepack 取得包管理器 | Tower 工具缓存 `$SH/tools/<pm>@x.y.z`（按 `dist.integrity` 校验）置于 PATH 首位；`<P>manage_package_manager_versions=false` | R4-D7-02；§16.8.1 |
| “无变化快路径 ≤ 30 ms”“决定性指纹 ≤ 2 s” | 无变化 stat 检查 2 万文件 ≤ 150 ms；完整重哈希按 SP5 实测登记，只在验收与 seal | ADR-075；§16.2.6 |
| 卫星丢失后“从分支重建” | 从情形 E 的重建来源重建（可用的最新检查点 → pin → base；分支随卫星丢失） | ADR-076 |
| `scriptIndex` | `scriptDigest`（脚本体哈希表） | `11` §11.4 |
| `exec.agent_code_s0`、`exec.unsandboxed` | `Goal.s0Grant` + `HumanDecision{kind:"grant_s0_exec"}`（不是运行时 `Grant`，ADR-182） | ADR-022 |
| “主干修订状态”章节 | 删除；未决事项记入 `reviews/` | ADR-039 |
| `session_before_compact` 接管压缩；`deliverAs:"steer"` 投递 `tower.ledger` | 不接管；`session_compact` 后 `sendMessage(…, {triggerTurn:false})` | ADR-026 |
| SDK 下由 tower-goal `registerTool` 注册沙箱 bash | SDK：`customTools` 注入；RPC：tower-goal `registerTool`；两者 `sourceInfo` 自检 | ADR-041 |
| Agent 可写 `<commonDir>/objects`；私有对象目录 `_objects/<goalId>`、`GIT_OBJECT_DIRECTORY`（ADR-044）；linked worktree 附着 | 卫星克隆 + Tower 影子 git 目录；用户仓库对 Agent 完全只读 | ADR-060 |
| `ensureWorktree`、`worktree.*` 事件 | `ensureSatellite`、`satellite.*` 事件 | ADR-060 |
| Goal 工作目录为用户仓库的 linked worktree（`git worktree add`） | 卫星克隆（`git clone --shared --no-checkout`），Tower 经影子 git 目录操作 | ADR-060 |
| Agent 的 git 使用 `GIT_OBJECT_DIRECTORY` / `GIT_ALTERNATE_OBJECT_DIRECTORIES` 私有对象目录、“迁回”公共对象库 | 删除；Agent 的 git 只作用于卫星自己的 `.git` | ADR-060（取代 ADR-044） |
| S2 对 Agent 开放 `$GIT_COMMON_DIR` 下的写入（`refs/heads/tower/<goalId>*`、`logs/`、`worktrees/<name>/**`） | 用户主检出与其 `commonDir` 对 Agent 完全只读 | ADR-060 |
| RPC 门禁对 `event.input` 深度冻结 | 不冻结，只做哈希比对；RPC 只在无拦截型扩展、无 bash 覆盖时可用 | ADR-065（取代 ADR-046 的冻结部分） |
| `PRISMA_ENGINES_CACHE` | 按角色设置 `XDG_CACHE_HOME`（Prisma 无专用变量） | ADR-063；§16.8.1 |
| `npm_config_devdir`（node-gyp） | `npm_package_config_node_gyp_devdir` | ADR-063；§16.8.1 |
| pnpm ≥ 11 使用 `npm_config_store_dir` 等 `npm_config_*` 前缀 | pnpm ≥ 11 → `pnpm_config_*`；pnpm ≤ 10 与 npm → `npm_config_*` | ADR-063；§16.8.1 规则 2 |
| “有保留的已验证（生态未支持）” | “未经机器验证（生态未支持）”（`not_machine_verified{ecosystem_unsupported}`），exec 标准只计入 O | ADR-064 |
| anomaly `fsmonitor_mismatch` | `stat_cache_mismatch`（ADR-060 影子索引） | ADR-060；§16.1.6 |
| 运行阶段 `paused(s0_grant_pending)` | 运行阶段为门禁 `ask`（Mode `blocked_guard`，不暂停）；`paused(s0_grant_pending)` 只在验证阶段 | ADR-068 |
| 参考硬件“8 核” | M1 Pro 10 核（8P + 2E）/ 16 GB（8 核变体结论不变） | ADR-042；`07` §7.4.10、`13` §13.8.3 |
| 验证槽位内存 `min(8 GB, 0.4 × RAM)` | 按项目实测预留 `max(1 GB, 1.3 × p95)` | ADR-042 |
| 机会式验证“每 Goal 每小时 ≤ 10 核分钟” | ≤ 6 次、≤ 50 核分钟 / （Goal·小时） | ADR-042；§16.2.3 |
| 端口段“从 41000 起” | 20000–29999，`bind` 探测 | ADR-055 |
| 包管理器存储“硬链接共享” | 只用 CoW（`clonefile`/reflink），不可 CoW 时完整复制 | ADR-021、ADR-045 |
| M1“16 周”“20 周”“26 周”“29 周”“31 周”“32 周”“33 周”“34 周”“35 周”“36 周”“37 周”“38 周”；增人方案“26 周”“28 周”“29 周”“30 周”“31 周”“33 周”（第 8–11 轮的“30 周”多算 1 周；第 14 轮的“30 周”漏算安全线；第 98 轮越过 130.02 人周的台阶，ADR-226） | **39 个日历周**（2026-11-09 → 2027-08-06；第 5 轮 +6.4 人周顺延 2 周，第 8 轮 +3.0 顺延 1 周，第 9–11 轮经重新分配与削减第 1、2 项不变，第 12 轮 +1.6 顺延 1 周（ADR-119），第 13 轮 +1.7 经改派后不变，第 14 轮 +5.85 执行削减 ④′ 后顺延 1 周（ADR-133），第 15 轮 +3.7、第 16 轮 +3.4 各顺延 1 周，第 17 轮净 +0.85 经改派不变，第 18 轮 +1.6 顺延 1 周（ADR-144），第 19–23 轮在余量内不变，**第 24 轮 +0.78 人周顺延 1 周**（ADR-133 补记，ADR-150），第 25–96 轮在余量内不变，**第 97 轮 +0.04 人周按 ADR-224 写定的规则顺延 1 周**（ADR-225），第 35 周末冻结；逐轮增量、当前余量与增人方案的前提以 `14` §14.3.4 为准，本行不逐轮维护，ADR-224）；加 1 名全栈工程师且由其承担一部分安全线工作（份额见 `14` §14.3.4）时为 **34 周**（至 2027-07-02；第 98 轮由 33 周变为 34 周，ADR-226），否则不缩短 | `14` §14.3.4；ADR-038、ADR-119、ADR-132、ADR-133、ADR-136、ADR-139、ADR-144、ADR-150 |
| 镜像“从不 prune”/“Project 下 Goal 全部归档 30 天（或 180 天）后 `gc --prune=now`” | 只回收不被任何 ref 可达的对象；活跃影子 ref 同步为 `refs/tower-live/*`，证据为 `refs/tower-retain/<goalId>/<verifyId>` | ADR-083；`10` §10.17.1 |
| 卫星 `.git` 控制文件写拒绝（黑名单）；`<卫星>/.git/tower-satellite` 标记；“我来改”直接在卫星中编辑 | gitdir 移至 `<wtRoot>/_gitdirs/<goalId>`、工作目录无 `.git`（之后 ADR-089 让 gitdir 整体归 Agent）；标记在 gitdir 中（仅提示）；人工编辑检出 `_human/<goalId>` | ADR-081/089；`10` §10.1、§10.8.4 |
| 用户主检出对 Agent“只读”；`$VS` 对 A 只读 | 读拒绝（读为允许列表） | ADR-082；`11` §11.6.2 |
| 重放包 `replay/<factId>/`、`tower verify --replay <factId>`、“pin bundle” | `replay/<verifyId>/`、`--replay <verifyId>`、瘦 bundle（规格只在 `07` §7.4.1） | ADR-083 |
| 每次验证的重放包都永久保留、每个重放包都写镜像保留 ref | 只有决定性验证（导致 `in_review`/`accepted` 的验证；只有走到槽位路径的才有重放包，验收与 seal 的完整重哈希没有，ADR-186/187）永久保留并写 `refs/tower-retain/*`；其余保留到 Goal 归档或放弃后 30 天 | ADR-095；`07` §7.4.1 |
| M（V/M、O/M 的分母）含 human 标准 | M = exec + artifact；人工 h/k 另列 | ADR-052 |
| 远程 `contract.ratify` | 远程只允许 `quick_ratify`（四个条件） | ADR-051 |
| “计划步骤不可执行” | 计划按 `02` §2.5 编译为围栏；显式 `scope.include` 优先 | ADR-050 |
| `log` 默认开启依据 ADR-019 规则 (a) | 模型面特性按 ADR-048 准入 | ADR-048 |
| Tower 在卫星 gitdir 上运行 git（`git --git-dir=<卫星 gitdir> log`/`rev-parse`）读取提交信息或 HEAD | Tower 自行只读解析普通文件（`HEAD`、ref、`packed-refs`、提交对象；单对象 ≤ 1 MB、≤ 200 个提交；不读 config/include/alternates） | ADR-100；`10` §10.1.3 |
| `~/.pi/agent/extensions/**` 对 Agent 可读（`read.pi_resources` 含扩展目录） | 扩展目录对 Agent 不可读；改为包内与设置中的技能/提示路径 | ADR-100；`11` §11.1 |
| 对无人工编辑检出的 `paused(human_change_verify_failed)` 使用 `hand_back`（“交给 Agent”） | `goal.retry_after_human_change`；`goal.hand_back` 只在 `humanCheckout` 存在时可用 | ADR-099；`06` §6.4.3 |
| 嵌套 git 调用（`rebase -x`、钩子、`!` 别名）绕过垫片属已知限制 | Agent 侧 `GIT_EXEC_PATH` = 垫片 exec-path，嵌套调用同样经过垫片（备选方案见 ADR-097） | ADR-097；`10` §10.6.1 |
| 卫星侧嵌套仓库扫描作为 Verified 依据；只按固定布局（`HEAD` + `objects/`/`refs/`）判定仓库形态 | 唯一权威检查为 `pinSafetyCheck(baseTree, pinTree)`（`verify()` 第一步，验收与 seal 时复核，ADR-109）；卫星侧扫描只作运行中提示 | ADR-106、ADR-109；`10` §10.1.2 |
| 人工编辑检出 / 检验检出是卫星或 pin 的 CoW 副本 | 由影子树物化被跟踪与未忽略的内容，依赖从 depcache CoW 或由安装器重建；只有 `pinSafetyCheck` 命中的路径不写出 | ADR-106、ADR-109；`10` §10.8.3–10.8.4 |
| `post_settle_activity`、`policy_wall`、循环/停滞阻止 Verified；run 类阻断命中可“返工” | 阻止 Verified 的 run 类命中为 `input_mutated_after_gate`（只提供“覆盖（写明原因）”与“放弃”）与 `nested_repo_live`（不可覆盖，ADR-131）；ADR-110 起 `sandbox_violation` 为提示性 | ADR-107、ADR-110、ADR-131；`07` §7.10.1 |
| `pendingHandBack.noteRef`；`resume` 与系统事件各自判定是否执行 `pendingHandBack` | `pendingHandBack.decisionId`（意图取 `HumanDecision{hand_back}.note`）；唯一触发 = 保留原因全部解除，两条路径同一函数 | ADR-108；`10` §10.8.4 |
| 所有 seal 都写 `Tower-Verified-At` | 只有已验证（含有保留）的写 `Tower-Verified-At`；未经机器验证的写 `Tower-Not-Machine-Verified: <原因>` | ADR-108；`10` §10.6 |
| `$GS/gitconfig`、`$GS/npmrc` 按删除清单净化（去掉 `credential`、`include`、`core.*Command`；删除 `_authToken` 等几个键） | 白名单只保留列明的键，保留的值再经 `10` §10.1.2 的凭据判定剔除（§16.8） | ADR-176 |
| `gate` 只对 `riskTier=high` 的 Goal 不可关闭（其他 Goal 可关闭），`features.gate=false` 时放行 | 门禁不能关闭（任何 `riskTier`、任何入口，§16.6） | ADR-176 |
| 有效提交 + 未答阻塞条目时原提交“视为作废”，作答后提醒 Agent 确认是否仍要提交 | 有效提交保留，作答后经 `settle` 进入 `claimed`，答案在之后的 Run 中送达（`03` I4） | ADR-176 |
| 评论 `addressed` 另有 🤖 来源（`log.evidenceRefs` 引用），可满足 `requiresChange` 的验收闸门 | `addressed` 只有 ⚙️ 来源（锚定的 hunk 已变）；Agent 的引用只进入 `acknowledged`，显示为“Agent 称已回应”，不满足闸门（`05` §5.7.3） | ADR-176 |
| 超时默认显示为 `你 · 默认`（`HumanStamp`） | 系统印章 `⚙ 超时默认`（`12` §12.5.1） | ADR-176 |
| `restorePaths` 完成后才做 `safety` 检查点 | 恢复之前先做 `safety` 检查点（可再撤销），完成后再做一个（`10` §10.8.1） | ADR-176 |
| 交还写回的目标树 T1 由 `human.decision{hand_back\|bring_back_inspection}` 记录，崩溃续写从决定事件读取 | 唯一落点 `human_checkout.targetTree`，与 `syncState='syncing'` 同一事务写入；决定中的 `targetTree` 只作审计 | ADR-176 |
| 撤销合入后由人选择“复活为新 Goal / 放弃” | 留在 `accepted`（`reverted`，`goals.integration_reverted_seal`），出口沿用 `accepted`；被撤销的 seal 不再触发 `integrated` | ADR-176 |
| 降低 `riskTier` 记 `human.decision{amend_contract}`（`reason.code:"lower_risk_tier"`），作为合同修订审计 | 独立的决定种类 `human.decision{lower_risk_tier}`（仅本机），不产生合同版本，不算合同修订（§16.1.5） | ADR-178 |
| 验证器执行阶段可访问合同 `network` 中声明的主机 | 执行阶段网络只来自 `VerifyProfile.env.network`（仅本机）；artifact 标准的 `network` 只供链接检查器（`07` §7.4.4、§7.4.9） | ADR-178 |
| `contract.amend` 的远程规则写作“不放宽的修订”；`project.verify_profile.update` 写作“任何放宽安全的字段仅本机” | §16.5 的两张逐字段封闭表，未列出的字段与方向一律仅本机；`test.quarantine` 仅本机 | ADR-178 |
| Scratch cwd 以 `ls-files --cached --others --exclude-standard` 复制（含未跟踪文件） | 只复制已跟踪文件（`--cached`）；真实检出的读允许残余登记于 T25（`11` §11.6.5） | ADR-178 |
| `## Imported context` 导入 `contextFiles(checkout)` 中缺失的全部文件 | 只导入用户检出之外的祖先目录中的上下文文件（`09` §9.11） | ADR-178 |
| 交还参数（`externalResolution`、`resolvePinHits`、`mode`、`note`、`sealNote`）只在写回之后的 `human.decision{hand_back}` 中 | 与 `targetTree` 在写回开始的同一事务中写入 `human_checkout.params`，续写只从这里读取 | ADR-178 |
| 计划步骤 `✓` = 与事实交叉校验一致 | `✓` = 关联标准由验证器通过；交叉校验一致只显示徽章 `一致 · n 条事实`（`12` §12.5.1） | ADR-178 |
| 评审队列以 `●`/`○` 表示已计入/已看，高风险单元用 `■` | 空心/实心 `✓`；风险字形高 `▪▪`、中 `▪`（`12` §12.12 `ReviewUnit`） | ADR-178 |
| 撤销合入后再次 seal 以被撤销的 seal 为父 | 以当前 `baseCommit` 为父写入 `B₀-v<k>`（`10` §10.6，编号基于原始分支名 `B₀`，ADR-182） | ADR-178 |
| `fingerprint.changed` Fact；在 stop_condition Fact 上记 `false_positive` 标注 | 指纹变化直接触发判定（不是 Fact）；“这里不该停”记为 `HumanDecision{resume}` 的 `reason.code` | ADR-178 |
| `needs_you.dismiss{reason:"not_actionable"}`；`needs_you.dismiss{reason:"obsolete"}`（人的关闭被记成“自动过时”） | `needs_you.dismiss{itemId}`，不带原因：人按 `X` 关闭按 `08` §8.8 该 kind 的“关闭”一格定类，未单列的记 `false_positive`；`obsolete` 只由自动解决产生 | ADR-178/180 |
| 合同试运行是“base 上的一次观测” | “base 上的一次试运行结果”；“观测”专指 Agent 环境中的结果（`12` §12.5.1） | ADR-181 |
| EventLog 中 Host 事件的类型名不带前缀（如 `tool.start/end`） | 存储类型名 = `engine.` + `EngineEvent.t`，`.` 改为 `_`（如 `engine.tool_end`，`06` §6.3）；`tool.end` 等只指线上事件名 | ADR-181 |
| `SessionManager.createBranchedSession(…)` 当作静态方法；在源 Goal 的会话实例或运行时上分叉出新 Goal 的会话 | 对源文件另开专用 `SessionManager` 实例，再调用实例方法 `createBranchedSession`（`10` §10.8） | ADR-181 |
| 交还第 5 步 T1 == B 时“无改动，直接第 8 步”（短路越过第 6 步的外部写入处置）；`06` 以“卫星当前树 ≠ T0”判定外部写入；`take_external` 在人没有改动时仍写 `human_edit` 检查点 | 第 5 步不短路，第 6 步以卫星当前树 ≠ B 照常判定并处置外部写入；`take_external` 任何情况下都不写 `human_edit` 检查点（唯一定义 `10` §10.8.4，`06` §6.4.3 只引用） | ADR-182 |
| 卫星重建调用完整的 `restoreCheckpoint`（含第 0 步对刚检出 base 的卫星做 safety 检查点）；只有人选的重建在 `rename` 之后崩溃时续做 | 重建跳过第 0 步、成功后记录重建树的检查点；自动与人选的重建中途崩溃都续做，`running` 中丢失时 `satellite_missing` 与重建标志同一事务写入（`10` §10.16.2，`06` §6.1.6） | ADR-182 |
| 重新 seal 的例外“或以它为祖先时”；新分支以当前分支 B 为前缀编号（“k 从 2 起取第一个不存在的编号”）；`06` §6.1.6 复述“被合并的是最近一次验收的 seal 时”即进入 `integrated` | 按 `integration.performed` 的写入记录判定；新分支一律为 `B₀-v<k>`，编号基于原始分支名（`10` §10.6）；`integrated` 只引用 `10` §10.12 的唯一条件，每个 seal 只判定一次（判定时机由 ADR-183 改为按状态） | ADR-182 |
| S0 授权是 `Grant{class: exec.test\|exec.build}`，“有效期至合同修订、或 scope.protected 中的测试/构建配置改变为止”却没有写入点；“每个 Goal 至多一次”“每个目标最多问一次”“每个目标一次”“每个 Goal 最多打扰一次”；远程批准的不取合同修订失效 | `Goal.s0Grant`（不是运行时 `Grant`）；失效条件唯一定义在 `11` §11.2（合同修订、检查点命中 `scope.protected`、远程统一有效期，取先到者），失效前不再询问 | ADR-182 |
| “单向门最高只能到 ask 加项目级授权”“单向门最高只能到 ask + 项目级授权”；`applyGrants` 未定义、项目级授权无撤销 | 单向门不能形成授权；`applyGrants` 只把 `ask` 降到 `notify`，不越过 `forbid`，编入时排除被撤销、被降级与合同收紧过的类；`autonomy.revoke` 省略 `level` 撤销授权（`11` §11.3.5） | ADR-182 |
| OAuth 刷新失败“不匹配可重试模式”“不匹配 Pi 的可重试模式”、Pi 一律不重试；F7 在第一条错误消息上判定、不覆盖压缩路径 | 原因文本含网络或超时字样时 Pi 会重试；F7 只在 `agent.end{willRetry:false}` 与 `compaction.end` 的最终错误上判定（`05` §5.11.1 D58，`06` §6.8 F7） | ADR-182 |
| “队列中 ✓ 由空心变实心”；“S0 授权：测试 / 构建 ✓ 你”；图例“异常 / 验证器失败 / 已拒绝”；手机决策卡“Agent 推荐 1 · 推翻记录”；L4 一律另加 `■` | 队列 `◦` → `•`；人的授权用印章语法、不带 `✓`；`■` = 异常、阻断哨兵与门禁拒绝；手机卡片不显示校准记录；单向门审批另加文字标记、不加 `■`（`12` §12.6.2、§12.8） | ADR-182 |
| 验证档案学习的超时“上调且不超过原值 2 倍 → 自动应用” | 一律需批准，经 `contract.amend`（`09` §9.7） | ADR-182 |
| 放弃改动“E = 差异路径，基线 = pin 的检查点”（不看接管期间的重建） | 比较基准与基线只按 `06` §6.4.3 `goal.discard_human_edits` | ADR-182 |
| 安装器第 2、3 阶段“离线，执行项目脚本”；规则 5 的括注“I-prefetch、I-install，运行第三方代码” | 第 2 阶段只运行 Tower 内置预取器、只连已登记的下载域名；第 3 阶段断网、运行 `.pnpmfile.cjs` 与第三方构建脚本（`16` §16.8） | ADR-182 |
| 卡片“允许出现的说法只有两种”（含问题标题）；记忆保留表“证据摘录（≤ 64 KB/条）永久保留” | 只有思考模式的当前步骤以 `┆` 标出；验证日志的保留只按 `07` §7.4.1 重放包规格 | ADR-182 |
| web 可新增 `testPathOverrides.add`；阻塞类 Needs-You 条目可按 `X` 关闭；判别原则比较提交的字段差异 | `testPathOverrides.*` 仅本机；阻塞类条目不提供 `X`、`dismiss` 返回 `E_STATE`（`08` §8.8）；判别原则比较编译后的合同（`16` §16.5） | ADR-182 |
| 正式验证在 exec 标准“全部命中：不取槽位”时直接 `decide()`；Wq > 15 min 时“测试清单（R-T5）只在本次 diff 触及 TestPathSet 时运行” | 正式验证在任何提前返回之前运行 L-c 静态哨兵，有可运行的 exec 标准时总是运行测试清单，缓存只复用标准结果（`07` §7.4.1） | ADR-183 |
| “外部链接检查只在 claimed 时执行”、artifact 检查“运行中不做外部请求”（`claimed` 之外的正式触发记 `deferred` 却判通过） | `links_reachable` 属 M2；每次正式验证执行，只有机会式为 `deferred`，`links_deferred` 不计入 V（`07` §7.4.9） | ADR-183 |
| `goal.rebuild_satellite{goalId, checkpointN}`“从人选的检查点重建”“人选择更早的检查点执行”，成功后把 `settle`/`claim` 改写为 `run`，崩溃后按 `checkpointN` 续做 | M1 只有人发起的重试 `goal.rebuild_satellite{goalId}`：重建来源与自动重建相同、不改写继续目标；更早检查点的重建属 M2（`10` §10.16.2，`06` §6.4.3） | ADR-183 |
| `keep_both`“只在 E 与人改动的路径（T0→T1）不相交时提供”；seal 的 `Tower-Human-Edit`“仅当有 author:"human" 的检查点” | 不相交判定用写回集合（B→T1）；`human_edit` 检查点只把写回集合中 B→T1 等人的显式改动归为人，trailer 只在归为人的路径非空时写（`10` §10.6、§10.8.4） | ADR-183 |
| `integrated` 的判定“每个 seal 只判定一次”（观测按变化触发，不按状态） | `integrated` 按状态判定（base 前进与 Goal 进入 `accepted` 时）；只有“较旧版本”的处理每个 seal 一次；“卫星树”不计 `externalChange.paths`（`10` §10.12） | ADR-183 |
| 接管期间“例如你接管或暂停期间，自己把分支合入了本地 base”……目标照样进入 `integrated` | 接管期间的合入先只记事实，放弃改动回到 `accepted` 时再判定（`04` §4.16） | ADR-183 |
| M1 中产生项目级运行时授权（本项目内同类，30 天）；多类 `ask` 的批准按一类生成授权；排除 (c) 不分先后 | 项目级运行时授权属 M3；M1 只有“本 Goal 内同类”，列在目标页可撤销；多类 `ask` 只提供“仅这一次”；(c) 只排除收紧之前产生的授权（`11` §11.2、§11.3.5） | ADR-183 |
| 分类器“protected 中的路径一律视作 forbid”；`elif` 链在 `protected` 处截断 | 收集全部适用的文件类，`decide` 取最严格者（`11` §11.3.1） | ADR-183 |
| 计划编译在没有计划时把 `include` 编译为空集；`compiled`“由批准的计划编译” | 没有计划或没有 `touches` 时不改写；生成的停止条件为 `plan:<stepId>`、每版本整体重算（`02` §2.5） | ADR-183 |
| 开场组装后仍可撤回；“准备阶段的 Host 握手与开场组装中返回” `E_BUSY` 的复述 | 第 ③ 步只读不消费、撤回返回 `E_BUSY`，消费点只有 `run.started`；`E_BUSY` 以 `16` §16.1.1 `ready` 行为准（`06` §6.4.3） | ADR-183 |
| 扩展在 Host 中执行 `captureCheckpoint`（“检查点改用 node:child_process”）；“一定排在 agent.settled 之前” | 影子的唯一写者是 Supervisor 的 GitService，扩展只发请求；超过 5 s 时条目可能晚于 `agent.settled`（`10` §10.7.2） | ADR-183 |
| RPC 下“prompt 的响应本身就是完成信号”“以 prompt 的响应作为完成信号”（`handled` 即成功） | 响应之前没有对应的 `extension_error`，并以叶子、`sessionFile` 或带 `details.key` 的消息为确认（`05` D55，M2） | ADR-183 |
| `stalled` 的“escalate 超时按默认暂停 → timeout”（没有暂停原因）；`post_settle_activity` 暂停中只有“知悉”；`budget` 条目可“直接关闭” | 暂停原因 `stalled_timeout`，条目保持打开；暂停中的 `post_settle_activity` 为继续 / 重新确认后提交 / 放弃；阻塞类含 drain 中的原因（`08` §8.7.1、§8.8） | ADR-183 |
| reporter 注入“自动（仅影响性能和信息量，不影响判定）”关闭；网络学习“建议在标准中声明所需主机” | 关闭注入需批准，已识别 runner 无计数判 `unparseable`；建议目标为 `VerifyProfile.env.network`（`07` §7.4.5、`09` §9.7） | ADR-183 |
| `07` 安装器“阶段 2、3（离线、执行项目脚本）”；`verifyFrom` 写入点括注“这两处尚未列入” `16`；`goal.hand_back` 中 `take_external`“跳过 ①–③” | 引用 `07` §7.4.3 的阶段定义与 `16` §16.1.1 `Goal.verifyFrom`；`take_external` 只跳过写回与 `human_edit` 检查点（`06` §6.4.3） | ADR-183 |
| 机密文件分类与记忆来源不可信画作 danger `■` | 文字徽章 `机密`、`来源不可信` · `可疑指令`（`12` §12.6.2） | ADR-183 |
| `goal.resume` 的可解除列表没有 `stalled_timeout`；停滞条目在继续之后“保持打开”无关闭规则 | `stalled_timeout` 无条件可由 `resume` 解除；解除的同一事务关闭该条目（`actionable`，放弃为 `informative`）（`06` §6.4.3、`08` §8.8） | ADR-184 |
| 开场队列在 `run.started`“按追加顺序全部消费并清空”“下一次任何 Run 开始时全部消费” | `run.started` 只消费组装进本次开场的 id（`run.started{openingIds}`），第 ③ 步之后追加的留给下一个 Run（`06` §6.4.3） | ADR-184 |
| `anyQualified` ④“供 04 的验收闸要求书面确认”，`04` 验收闸自列“需要确认”清单（未批准的假设、被覆盖的哨兵、`pass_with_preexisting_flakes`、`links_unchecked`） | `04` §4.6 引用 `07` §7.10.3：任一条件成立即需书面确认，另加未批准的假设或决定；条件只在 `07` 枚举（含 ⑪ 计数为估计） | ADR-184 |
| 用户扩展的无注解工具授予“本项目内此工具”授权；Goal 页撤销“撤销本项目该类的运行时授权”“只撤销该项目该类此前产生的全部运行时授权” | 无注解工具给“本 Goal 内同类”（匹配器 = 工具名）；M1 的撤销带 `goalId`，只作用于该 Goal 的运行时授权，不影响合同授权与其他 Goal（`11` §11.3.4、§11.3.5 排除 (b)） | ADR-184 |
| take_human 恢复的路径“沿用 B 中的作者”而 `Checkpoint` 没有载体（作者推导取 `human_edit` 检查点的 `author`） | `Checkpoint.humanPaths` 记录归为人的路径，推导只对其中的路径取 `author`，其余路径穿透到接管时的检查点（`10` §10.7.1） | ADR-184 |
| 重建来源不跳过不可用的检查点（情形 G 的“不可用”没有字段） | `Checkpoint.unusable`；重建来源 = 链上可用的最新检查点，没有时 pin，都不可用时 base，接管期间不回退；接管期间无法重建时放弃 Goal 保留人工编辑检出（`10` §10.16.2、§10.8.4） | ADR-184 |
| 没有计划时“编译是空操作”（`plan:*` 停止条件与编译出的 `include` 都保留） | 规则 (2) 照常整体重算，删空计划即删除全部 `plan:*`；原为 `compiled` 的 `include` 保留并置 `explicit`（`02` §2.5） | ADR-184 |
| 阻塞类条目“只能作答、拒绝或稍后”；`■`“只出现在本行列出的用途中” | “只能作答、拒绝或延后”（`S` 为延后，ADR-183）；`■` 只用于异常与阻断类（`12` §12.6.2） | ADR-184 |
| 无注解的扩展工具与 MCP 工具“无注解 → 首次 ask”，没有动作类与确定度 | 沙箱外工具（按注册来源判定）的全部调用 → `tool.external`（不看注解；`heuristic`，下限 ask：每次 ask，直到“本 Goal 内同类”授权（不可信内容与对外通信都为真时不提供，ADR-227），匹配器 = 工具名、精确匹配；沙箱外工具恒按无沙箱求值，`11` §11.3.4、§11.4） | ADR-185/186 |
| “被覆盖的阻断命中因此总有可重放的证据” | 只有槽位路径的验证有重放包；覆盖决定记录被覆盖的 `factId`，被覆盖的验证不升级、重放包按非永久规则保留；没有可用的重放包时重放结论“不可重放：<原因>”（`07` §7.4.1） | ADR-185/186 |
| 重建来源简写为“从最新的检查点或 pin” | 重建来源 = 可用的最新检查点 → pin → base（`10` §10.16.2 情形 E） | ADR-185 |
| “置顶至多占一半（至少能放一条 80 token）”而上限不计 `Notes:` 前缀；放不下的必选条目进入 `omitted` | 上限 max(budget × 0.5, 2 + 80)；放不下的必选条目全部写入 `contract.md` 并标“置顶但未进常驻”（`09` §9.5.2） | ADR-185 |
| 进程内存预算两处不同：`06` main ≤ 80、Supervisor ≤ 120 MB；`13` main ≤ 60、GPU ≤ 80、Supervisor ≤ 80 MB（四项之和 370 MB，超过空闲总预算 250 MB） | `13` §13.8.1 唯一定义：空闲 main 50、renderer 100、GPU 30、Supervisor 70 MB，和 = 250 MB；`06` 只引用 | ADR-185 |
| `16` §16.2.6、§16.4 的“远端 base fetch 每 5 min”未标里程碑；`stalled`/`stalled_timeout` 出口与 escalate 选项中的“回退”未标 M2 | 远端 base 轮询与回退都属 M2；M1 只在四个时机获取远端 base（`10` §10.1.2） | ADR-185 |
| 人覆盖哨兵时“该 pin 上最近一次以阻断结束的验证在覆盖决定的同一事务中升为决定性并写保留 ref” | 覆盖不升级、不写保留 ref；覆盖决定记录被覆盖的 `factId`，该次验证的重放包按非永久规则保留（`07` §7.4.1、`06` §6.4.3 `sentinel.override`） | ADR-186 |
| 重放证据“只有人在文件系统中手动删除时才可能缺失”；磁盘压力清理排除“可能被升级的两类”；缓存命中后“原日志与原重放包随之升为永久保留” | 只有槽位路径的验证有重放包；清理不设排除；原日志按原验证的保留期保留；没有可用的重放包时结论“不可重放：<原因>”（`07` §7.4.1、`10` §10.3.2） | ADR-186 |
| 验收面板“验收后不会送达”“验收后条目随目标归档，不送达” | 验收不清空开场队列，验收后再开 Run（例如请求修改）时随开场送出；归档或放弃后不再送达（`16` §16.1.1 `Goal.pendingOpenings`） | ADR-186 |
| 沙箱外工具按注解分类：`readOnlyHint: true` 归 `read.external`、`openWorldHint` 另加 `net.other`；codemode、Tower 工具按名字豁免 | 按注册来源判定；沙箱外工具（用户扩展工具、MCP 工具、MCP 资源工具）只归 `tool.external`；codemode、`tool_search` 与 Tower 工具只在来源为 builtin / tower-goal 时豁免（`11` §11.3.4） | ADR-186 |
| `decide()` 中“单向门永不静默”（把 silent 的单向门提到 notify）；下限“合同只能改为 forbid”没有执行点 | `decide()` 的 `floor`：单向门类与 `tool.external` 的矩阵级别先钳到至少 ask，合同中更低的值不生效（`11` §11.3.5） | ADR-186 |
| `idle_without_submit` 的选项“按当前状态视为提交”；`budget` 出口“或停止” | “按当前状态送去验证”（`claim_on_behalf`）；“或放弃”（`03` §3.2.1、`08` §8.8） | ADR-186 |
| 验收延续的旧复述“已批准单元的 contentHash 全部不变、没有新增 hunk、标准再次通过”“全部已批准单元哈希不变、无新增 hunk、标准再次通过” | 引用 `07` §7.10.3 `acceptanceCarriesOver`（含“没有 ⑨ 以外的 `anyQualified` 条件”） | ADR-186 |
| 接管中重建失败一律“只提供放弃目标” | 选项同一般的重建失败（重试重建 / 放弃）；只有接管时的检查点不可用时只提供放弃目标（`04` §4.18.3、`10` §10.16.2） | ADR-186 |
| “记忆提议与学习挖掘从 M2 起才有” | 记忆提议从 M2 起；学习闭环挖掘属 M3（`09` §9.0.1） | ADR-186 |
| Tower 自身预留 0.6 GB（小于 `13` §13.8.1 负载列之和） | 0.65 GB = 四项“负载时”之和（`13` §13.8.3） | ADR-186 |
| 永久重放包包括“验收与 seal 时的完整重哈希验证”；缓存命中要求“原日志与原重放包仍在” | 完整重哈希是指纹闸口，没有重放包、不写保留 ref；命中只要求原验证该标准的完整日志仍在（`07` §7.4.1、§7.4.8） | ADR-187 |
| 归因窗口的“通过”包括“已验证、有保留的已验证或未经机器验证” | 结论标签为已验证或有保留的已验证（含经覆盖哨兵进入 `in_review` 的那次验证，或经验收延续回到 `accepted`）；未经机器验证不算（`03` §3.2.1） | ADR-187 |
| `goal.request_changes` 的守卫只看“唯一的 run 类阻断命中”；交还保留的 run 类阻断“只有一项” | 阻断的 run 类命中有两项，守卫与交还都引用 `16` §16.1.6 的集合 | ADR-187 |
| `08` §8.8 的 `budget` 行把放弃同时列在两栏；`verify_failed` 行“选择任意处置选项”与通用放弃行重叠 | 每个出口只有一个类别；单列的出口以该行为准，通用行只适用于未写到的出口（`08` §8.8） | ADR-187 |
| 工具来源“只有四种来源”；Tower 工具被同名扩展工具遮蔽时只按沙箱外工具逐次审批 | 只有下列来源按各自规则分类；Tower 工具的生效来源不是 tower-goal 时不开 Run（`11` §11.3.4、`05` §5.3.5） | ADR-187 |
| `03` 的 `accepted → archived`（验收但不合并）没有命令或决定种类 | `goal.accept{integrate:"none"}`（`06` §6.4.3） | ADR-187 |
| S0 拒绝（人或 `use_defaults` 下超时）把继续目标改写为 `review{state:"in_review", pin}`：“拒绝 → 继续目标改写为”“人拒绝时不执行机器标准，转到”“拒绝授权时机器标准不执行”，标签固定为 `exec_not_run{s0_denied}` | 授权或拒绝都只解除 `s0_grant_pending`，继续目标 `verify{pin}` 不变；以同一 pin 重新验证，artifact 失败与阻断命中由 `decide()` 判定（`07` §7.10.3） | ADR-188 |
| 从 `in_review` 选 `不合并并归档` 时“不 seal、不在用户仓库写分支”“直接选它时没有分支”“不需要分支的目标：不创建分支” | 先按 `branch_only` seal 并写分支，再归档，分支保留（`06` §6.4.3） | ADR-188 |
| Tower 工具的来源自检在 `bindExtensions`（`session_start`）之前执行，只覆盖加载期注册 | 在 `bindExtensions` 返回之后执行；Run 中途注册的同名工具由 gate 第 1 步逐次复核（`05` §5.3.5、§5.6.5） | ADR-188 |
| `16` §16.3 中 `⇧J` / `⇧K` 登记两行：“跳到下 / 上一个地标”（诊断）与“上 / 下一个地标”（轨迹、诊断） | 一行：轨迹、诊断，下 / 上一个地标，与 `J` / `K` 一致（`16` §16.3） | ADR-188 |
| `11` §11.3.2 标题与 `16` 工具表的 `bash`（及 `powershell`）；`running` 阶段保留“用户默认工具”；门禁把任何 `builtin:<name>` 都按 Pi 内置工具的规则、以 Goal 的沙箱档位求值 | Tower 的内置工具是固定白名单 `TOWER_BUILTINS`，其余内置工具以 `excludeTools` 不注册；万一出现按沙箱外执行、硬底线 forbid；`running` 的内置工具固定为 `read`/`bash`/`edit`/`write`（`11` §11.3.4、`05` §5.3.5、§5.6.2） | ADR-189 |
| SDK 下传给 `bindExtensions` 的 `commandContextActions` 未定义（照抄 RPC 模式接到真实的重载与会话替换，或不传而成为返回成功的空操作） | 会改变会话的五个动作一律拒绝：`reload` 抛错，其余返回 `{cancelled:true}`，各记一条 `engine.error`（`05` §5.3.5） | ADR-189 |
| M1 验收先 `goal.state_changed(→accepted)`，再 seal 并写分支；写入失败时没有去向，从 `accepted` 归档不核对分支 | 先 seal 并写分支，成功后在同一事务记决定、`→accepted` 与 `integration.performed`；失败时不验收、留在 `in_review`；从 `accepted` 归档前核对分支，不在时以最近一次 seal 重写（`06` §6.4.3） | ADR-189 |
| `prepare_failed` 只来自 `ready` 的准备阶段：“准备阶段失败时还没有”`runId`；Run 中途被遮蔽时“Run 中途才注册时卡片相同”（`启动失败`，重试写成从已完成的步骤继续） | 来源另有 `running`；按 Goal 去重、与 `runId` 无关；中途的卡片写 `运行已停止`，重试写“开新的运行”（`08` §8.4、§8.6.5，`04` §4.8.11，`12` §12.6.5） | ADR-189 |
| 评审模式线框底栏 `E 我来改（M2）`；目标页人工编辑面板 `[交还 ⌘↩]` | `E 我来改`（M1；评审中就地编辑 hunk 才是 M2）；`[交还]`，`⌘↩` 不在目标页登记（`16` §16.3） | ADR-189 |
| 白名单之外的 Pi 内置工具界定为“来源为 builtin:<name>、名字不在白名单中”（`11` §11.3.4、`05` §5.6.5 第 3 步、`16` §16.1.10）；C28a 对照组“来源为 builtin: 的名字恰为”两个常量之并 | `builtin:` 来源按允许表判定：`TOWER_BUILTINS` 的 `builtin:<工具名>` 与三个 builtin 扩展的路径 `builtin:codemode`、`builtin:tool-search`、`builtin:mcp`；其余 `builtin:` 来源才是白名单之外的内置工具（`11` §11.3.4）；C28a 对照组排除三个扩展路径（`05` §5.11.2） | ADR-190 |
| `00` §0.5.1 中扩展命令的会话重载、新建、分叉、切换与树导航不执行，不分模式；RPC（M2）下 Run 中途的这些动作没有规则 | M1（SDK）中拒绝；M2 的 RPC 模式下 Pi 照常执行，M2 须保持同一不变式（运行中会话不被重载或替换），检测方式是 M2 的设计任务（`05` §5.4.5） | ADR-190/191 |
| M1 验收重试“按步骤幂等，同 §6.1.6 seal 行”；“M1 中进入 accepted 时总有本次验收的 integration.performed”；`04` §4.16 走查“此时 Tower 生成汇总提交（seal），在你的仓库中创建分支”“之前该分支不存在” | 写后窗口与之后的每次验收按 `10` §10.6 重新 seal 表的识别规则（Tower 自己的 seal，按 sha）复用或快进 Tower 写过的分支；M1 中验收延续同样先写分支，另开 `-v<k>` 或写入失败时不延续；不变式只对经 `goal.accept` 或验收延续进入 `accepted` 成立（`06` §6.4.3） | ADR-190/191 |
| 验收写分支失败行“◇ 未能在你的仓库创建分支” | `■ 未能在你的仓库创建分支：<原因>`（`12` §12.6.2 的 `■` 规则；`04` §4.6.5） | ADR-190 |
| `10` §10.6 重新 seal 表的“未提交的写入”一行：“影子中本 Goal 最近的 seal 没有对应的”`integration.performed`、“该分支记为 W”；“B 的顶端 == P”一行 CAS 失败时“转入下一行”；`06` §6.4.3 写后窗口“pin 与结论未变时复用” | 一条识别规则：分支顶端的 sha 是影子中本 Goal 的某个 seal 即 Tower 自己的 seal（只带 `Tower-Goal` trailer 不算；M1 不签名，ADR-193），在用户仓库 `refs/heads/*` 中名字最后一段为 `<goalId>` 或以 `<goalId>-` 开头的分支中查找；顶端是 Tower 自己的 seal 时树与说明都相同则复用、否则快进；CAS 失败后重读 B，仍等于 P 时按写入失败返回 `E_INTERNAL`，否则重新判定（`10` §10.6） | ADR-191 |
| `05` §5.4.5 的 M2 判别规则：“Run 进行中收到这样的条目”“收到 session_tree 时同样写一条”；`prepare_failed` 六处定义中的“RPC（M2）下 Run 中途的会话改变同样” | M2 的 RPC 模式须保持 `05` §5.3.5 的会话不变式（Run 中不重载、不替换会话）；检测机制是 M2 的设计任务，正文不规定（`05` §5.4.5） | ADR-191 |
| 评审积压的阻止模式在 M1 表面没有里程碑标记：设置树“提示模式 / 阻止模式；可关闭”，§4.4.4 表头“阻止模式（E8 通过后可切换）” | 阻止模式（`review_capacity` 等待、`[⇧↩ 越过一次]`、`capacity.override` / `override_capacity`）属 M2（E8）；M1 只有提示模式（`04` §4.4.4、§4.15，`06` §6.2.4、§6.4.3，`12` §12.6.5） | ADR-191 |
| `10` §10.12 与 `16` `Goal.integrationRevertedSeal` 行以“重新 seal 表首行”指撤销一行；`07` 越界哨兵的去重键 `sentinel:{goal}:out_of_scope`；验证环境故障卡片第 5 行“◇ 验证环境故障” | 按行名引用（“被撤销的 seal 曾写入 B”一行）；`s:{goalId}:out_of_scope`（`08` §8.4）；卡片第 2 行 `◆ 已暂停 · 验证环境故障`（`12` §12.6.5） | ADR-191 |
| `10` §10.6 识别规则“sha 是影子中本 Goal 的某个”seal（启用签名时写进用户分支的提交不在影子中）；签名“在用户仓库上下文中用 git commit-tree -S 的等价流程重做”，未写写进用户分支、`integration.performed.sha` 与 `integrated` 观测用哪个 sha | M1 不签名（ADR-193 撤回 ADR-192 的签名一段）：识别规则仍为 sha 是影子中本 Goal 的某个 seal；写进用户分支的就是 seal，`integration.performed.sha` 记该 seal，`integrated` 观测、撤销记录与 M2 推送都用它；配置要求签名时验收面板如实说明提交未签名（`10` §10.6、§10.12） | ADR-192/193 |
| 重新 seal 的快进、验收延续、归档删除与清理不检查分支是否被检出；`10` §10.6 重新 seal 表那句说明“总是真的” | 检出守卫：要写入、快进或删除的分支正被任一工作树检出时 Tower 不动它——验收返回 `branch_checked_out`（可确认写入新分支 `goal.accept{newBranch:true}`），延续回到 `in_review`，删除跳过并列出（`10` §10.6）；那句说明为真，灾难恢复的一种叠加情形登记在 `10` §10.16.3 | ADR-192 |
| 归档时“已合入才删”（未写判定的是 seal 还是分支顶端）；清理“删除已集成或已放弃 Goal 的”分支与全部 `refs/tower/*`，说明“在用户自己的 git 工具中查看这些提交”是唯一的损失；设置树只有“清理审计地标引用” | 删除条件（`10` §10.3.2 唯一定义）：顶端是 Tower 自己的 seal、已在 base 中、未被检出，以 CAS 删除，其余保留并列出原因；已放弃 Goal 的分支不删；清理不删 `refs/tower/_owner`；`04` §4.15 数据 → 存储中的“清理 Tower 引用” | ADR-192 |
| `05` §5.4.4 RPC 下以 `/` 开头的人写文字不分命令一律“会被分派”；撤销草案分支写死 `tower/<goalId>-revert`；`14` §14.3.5 性能行“与 SP6c 用例表的 P1–P8 是两套编号”；`08` §8.5.5 `backlog` 条目在提示模式下也写“在等开始” | `prompt` 分派或展开，`steer`/`follow_up` 拒绝扩展命令（抛错）、照常展开技能与模板；M1 撤销合入不写用户仓库，由 Tower 生成撤销分支属 M2（ADR-193）；`13` 的 P1–P9 与 SP6c 是两套编号（lint (M) 核对）；“在等开始”只在阻止模式（M2） | ADR-192 |
| `10` §10.6 签名一段：在用户仓库上下文以 seal 为模板生成签名提交 S′、去掉签名头后比对、`encoding` 头不同时 `E_INTERNAL{step:"seal"}`；首次 seal 以 `update-ref <B₀> S′ ""` 写入；P 是签名提交时先经镜像本地 fetch；归档前重写“以对应的影子 seal 重新签名”；`integration.performed.sha` “签名时为签名后的提交”；`04` §4.6.5 “启用提交签名的项目行为相同”；`14` K12 “集成时沿用用户 git 签名配置” | M1 中 Tower 从不调用用户的签名程序，写入的就是 seal（不签名），识别规则为 sha 是影子中本 Goal 的某个 seal；`commit.gpgSign` 为真时验收面板写“Tower 写入的提交未签名；需要签名的提交请在合并前自行签名”；签名属 M2（`10` §10.6，`00` §0.5.1） | ADR-193 |
| `10` §10.12 撤销合入“生成 `git revert -m 1`/`git revert <squash>` 草案提交在新分支”、已存在时加 `-<k>`、写入失败返回 `E_INTERNAL` 不撤销；`03` “Tower 生成 revert 提交草案”；`14` G40 “人合并 revert 草案” | M1 中撤销不写用户仓库：只记状态与被撤销的 seal，Goal 页写出要由人完成的撤销（快进合入时撤销整个 seal 段 `git revert <S₁ 的父>..<seal>`（ADR-194） / `-m 1` / 撤销对应的 squash 或改写后的提交）；由 Tower 生成撤销分支与撤销 PR 属 M2（`10` §10.12） | ADR-193 |
| `10` §10.6 检出守卫只看各工作树的当前分支（进行中的 rebase / bisect 中该工作树显示为分离 HEAD）；`goal.accept{newBranch:true}` 后“面板说明改为同一句‘正被检出’”；`04` §4.6.5 验收延续“成功时”一律写“已更新本地分支”；`10` §10.6.2 与 ADR-192 “‘仅保留分支’……的分支一律不删”；存储面板“清理全部已归档” | 另加进行中操作守卫：任一工作树有进行中的 rebase、merge、cherry-pick、revert、am 或 bisect 时这一次不写不删（`step = repo_busy`，延续回到 `in_review`，删除跳过并列出）；`newBranch` 后写“按你的选择写入新分支”；只在实际写入时写“已更新本地分支”；“验收但不合并而归档（`integrate:"none"`）的 Goal”；“清理工作目录”（`10` §10.3.2、§10.6、§10.6.2，`04` §4.6.5、§4.15） | ADR-193 |
| `10` §10.12 M1 撤销做法“快进合入时 `git revert <seal>`”；patch-id 判定只写“squash 合并以 patch-id”（比较 seal 自身的差异） | 快进合入时撤销本次合入的整个 seal 段 `git revert <S₁ 的父>..<seal>`（Tower 写出两端的 sha）；非祖先合入（squash、人改写后合入）以整段差异的 patch-id 判定；S₁ 的唯一定义在 `10` §10.12 | ADR-194 |
| `10` §10.6 进行中操作守卫“链接工作树为 `<commonDir>/worktrees/<名>/`”；两个守卫“同一时机”而未定先后；“这一次不在用户仓库中写入或删除任何东西” | 链接工作树直接枚举 `<commonDir>/worktrees/*/`（不从路径推出目录名）；先判进行中操作守卫；“不写入、快进或删除任何分支”，租约与地标 ref 不受影响（`10` L10、§10.6） | ADR-194 |
| `10` §10.3.2 检查点保留“归档 30 天后……其余 ref 删除”；`06` §6.6.4 “只保留地标检查点与 pin”；`16` §16.2.6 “归档 30 天后只留地标”；守卫一段删除跳过后“之后可由清理再删” | 归档或放弃 30 天后只压缩检查点 ref，pin 与 seal ref 保留到影子删除；“可能含你的提交”只在识别规则可判定时给出；影子删除之前可由清理再删（`10` §10.3.2） | ADR-194 |
| `03` §3.2 只在 `accepted` 与 `paused(external_change)` 行有 `→ integrated`；`integrated` 中来源不明的写入没有去向 | 任何非终态 → `integrated`（表下通则，唯一条件与进入时的处理在 `10` §10.12）；`integrated` 中不检测，撤销合入回到 `accepted` 后补一次检测（`10` §10.3.1） | ADR-194 |
| `04` F8 放弃后的撤销条“这是 Tower 本地操作，可真正撤销”（8 秒，`⌘Z`）；`12` `UndoBar`（M1）；`16` §16.3 `⌘Z` 与作用域“撤销条” | 放弃是终态，不提供撤销；误放弃时复活为新 Goal（`04` F8、F9，`06` §6.4.3 `goal.abandon`） | ADR-194 |
| `12` §12.6.2 徽章 `已撤销合入`（M1 中人可能尚未 revert）；`03` §3.5 “基于 G1 分支开始”未标里程碑；`13` §13.9.3 人的决定“提交后 `wal_checkpoint(PASSIVE)`”；`13` §13.13.2 D2 “后台 Goal 摘要节奏 500 ms → 2 s”；`11` §11.6.2 “写全局缓存、遥测、更新检查”为 severity 1；`11` T13 “非回环强制 TLS”；`11` §11.11 对整条事件求哈希；`05` 发布版行号“整体偏移 +1…+5” | `已撤销合入 · 需在你的仓库中 revert`；“基于 G1 分支开始”属 M2；持久性只引用 `06` §6.3（`synchronous=FULL`）；看板卡片数据帧（`16` §16.4）→ 2 s；`system` 类路径举例 `~/Library/Caches/**`，点目录缓存属 `user_config`（severity 2）；非回环须 TLS 或显式确认网络层保护；哈希链按 `06` §6.3 `prev_hash`；行号相差至多 5 行、方向不一，以符号名为准 | ADR-194 |
| `09` §9.12.4 清除一个 Goal 时“用户仓库中若已有 seal 或地标 ref，一并删除”“已推送的分支是否保留由用户选择”；清除全部时“从已知检出中删除” `refs/tower/*` 与按前缀匹配的分支；`06` `privacy.purge` 的 scope 为 goal / run / events，效果只有墓碑化与删除会话 | 清除从不写用户仓库：Tower 写过的分支、地标与租约原样保留并逐条列出，需要删除的先执行“清理 Tower 引用”；清除范围、如实列出的副本与无法删除的副本只按 `09` §9.12.4，`privacy.purge` 的 scope 为 memory / goal / project / all | ADR-195 |
| `11` §11.11、`09` §9.12.1、`16` §16.2.8 审计“保留 1 年”；`11` T24 缓解措施把整个 Tower 数据目录排除 Time Machine 与 Spotlight | 审计永久，不按时间删除，隐私清除只删载荷（`16` §16.2.8 审计保留，与 `02` §2.13、`06` 删除触发器相同）；T24 写明事件库、Goal 数据与数据库备份默认保留在系统备份中，残余风险含未加密的系统备份 | ADR-195 |
| `10` §10.12 本次合入的 seal 段以未记过本地合入事实为停止条件而没有时间锚点，同一次快进合入的较旧 seal 按 (ii) 处理；patch-id 的已知限制只写逐个改写多个 seal 一种；`04` §4.3.2 侧栏“14 天未合入 · 建议归档” | 只计本次观测之前已记的标记，一次观测整体处理，段内的较旧 seal 随段末 seal 处理；判定不到的范围含 base 在改动附近的变化、解决冲突、合成一个提交与部分合入；侧栏写“Tower 14 天未检测到合入” | ADR-195 |
| `10` §10.6 进行中操作守卫把工作树目录已不存在的管理目录也计入并停写全仓库；`10` §10.3.2 保留原因“无法核对：审计数据已过保留期”；`10` §10.6.2 “审计长期保留依赖影子与备份 bundle”；`13` §13.11.3 非永久重放包“磁盘压力时最先删除” | 未锁定且工作树已不存在的条目不停写，附 `git worktree prune` 提示，锁定的照常停写；“无法核对：影子已删除或已过保留期”；审计依赖影子与审计事件；按 `10` §10.3.2 的顺序删除 | ADR-195 |
| `09` §9.12.4 清除一个 Goal 与清除全部无条件删除人工编辑检出与检验检出（清除全部删除整个 `_human`、`_inspect`）；`privacy.purge` 没有状态前提 | 清除只接受已归档或已放弃的 Goal，`project` / `all` 范围内有非终态 Goal 时整笔 `E_STATE`；人工编辑与检验检出从不删除，结果列出路径与原因（`09` §9.12.4） | ADR-196 |
| `09` §9.12.4 删除“数据库中的 Goal 行、账本行与 Goal 记忆”；`06` `decisions_no_update` 无条件拒绝；数据库备份的结果只写最晚过期日期，不说明此前的系统备份快照 | `decisions` 与 Goal 行保留为墓碑（`decisions_no_update` 的唯一例外），其余行按外键顺序删除并逐项列出；结果写明数据库备份过期之前系统备份的新快照同样含有被清除的内容（`09` §9.12.4） | ADR-196 |
| `10` §10.17.1、`04` §4.15、`16` §16.2.6 的“清除早于 N 天的重放包”（“隐私清除语义”，M1）；`10` §10.3.2 “Project 被删除”时“等同隐私清除”地删除重放包与镜像 | 按时间删除重放包属 M2，与“导出并清除早于 N 个月的证据”合并定义；删除 Project 即 `privacy.purge{scope:"project"}`（`09` §9.12.4） | ADR-196 |
| `14` §14.8 团队表各角色的工作包人周（如系统 W3 4.0、W7 13.45，桌面 W15 1.5）；`13` §13.8.3 docker 一行降为 1 个槽位后 11.8 GB；`13` §13.9.3 长期保留部分按年 ≤ 10 GB 不写口径 | §14.8 的人周随 §14.3.4 主责列并由 lint (C) 核对；10.8 GB；按每年约 250 个工作日计 ≤ 10 GB，每天满负荷时 ≤ 14.6 GB | ADR-196 |
| `09` §9.12.4 “清除全部”删除 `~/.tower` 整个目录（回退位置 `~/.tower/worktrees` 中的 `_human`、`_inspect` 随之删除）；`11` §11.6.2 与 §11.6.3 对 `~/.tower/**` 的读拒绝在回退位置下没有例外；`16` §16.3 `⌘⇧O`“在外部编辑器以只读方式查看 worktree（不暂停）” | 回退位置中的 `_human`、`_inspect` 同样不删除，`~/.tower` 中其余内容照删（`09` §9.12.4）；读拒绝只为本 Goal 的允许项与验证器本槽位、`$VS` 逐路径除外（`11` §11.6.2）；删除该键，Tower 的任何入口都不在外部程序中打开卫星（`10` §10.1） | ADR-197 |
| `10` §10.3.1 镜像获取用户分支不带 `--prune`；`09` §9.12.4 用户分支副本只随清除 Project 或清除全部删除；`privacy.purged` 没有载荷，已清除的 Goal 以该 Goal 的任何 `privacy.purged` 事件判定；Goal 墓碑行“只留标识、状态与时间” | 获取带 `--prune`，只作用于 `refs/user/*`；载荷 `{scope, id?, roots?, filesDone?}`，只认 `scope = "goal"` 的事件，文件删除中途崩溃按 `06` §6.1.6 续做；置空人写的文本列，其余列保留 | ADR-197 |
| `03` §3.2.1 软上限出口 `extend_budget` 或 `resume`；`06` §6.2.5 软上限按“超出”触发，扩展后的额度没有存放处；`12` §12.10.4 预算条超出部分“此时必有一条预算类需要你条目”；`03` `verify_failed_limit` “重置返工计数需人确认” | 生效额度 = 当前合同版本与其后 `extend_budget` 决定 payload 的最大值，软上限按跨越触发（`06` §6.2.5）；没有未解决的预算条目时为 text-2；返工计数在 Goal 生命周期内不重置 | ADR-197 |
| `00` R7 “Harness 在运行时强制执行的围栏”中“需要决策的步骤成为停止条件”；`08` §8.3.3 “L3、其他”超时后“只作为 L2 留在收件箱，不再弹出”；粗断点“并触发全局重入简报” | 需要决策的步骤成为注入给 Agent 的 `natural` 停止条件，Tower 不求值、只提醒（`02` §2.5）；15 min 后无视 θ 投递；离开 ≥ 30 min 后另触发应用级重入简报（`08` §8.10.2） | ADR-197 |
| `07` §7.4.10 c = 1 一行 Wq 26 / 79 min、claimed → in_review p95 ≈ 90 min；`13` §13.9.3 与 `16` 事件库“30 天窗口峰值 ≤ 3 GB”；`16` §16.2.3 验证排队降级 10 / 15 / 20 min 三档；`13` “等待内存/CPU 余量”与 D8 的另一准入条件；`04` 线框“预设「生产修复」”；`07` 软矛盾字形 `?` | 27 / 94 min、≈ 105 min；≤ 5 GB（按约 22 个工作日）；10 / 20 min 两档；`06` §6.2.4 步骤 d，卡片注明“机器资源”；“标准修复”；`◇` | ADR-197 |
| `02` §2.2 GoalId “单调递增，本地唯一”（没有分配规则，“清除全部”后从头编号）；`10` §10.3.2、§10.8.3、§10.8.4 按 `<goalId>` 拼路径删除或写出 `_human`、`_inspect`，路径已存在时没有规则 | GoalId 在本机从不复用：取数据库最大编号与 `~/.tower/goal-id-hwm` 高水位的较大者加一，跳过已有同名目录与 `refs/tower/<编号>/` 的编号，“清除全部”保留高水位（`02` §2.2）；以 `<goalId>` 命名的目录只属于一个 Goal，两种检出只以独占方式新建，已存在且仍在使用中时 `E_STATE`、否则先改名保留（第 100 轮起，ADR-228；`10` §10.2） | ADR-198 |
| `11` §11.6.2 回退位置下验证器“只为本槽位与” `$VS` 除外，检验检出没有例外；`11` §11.3.2 “写 `~/.tower/**`”硬底线没有回退例外；`10` §10.4.3 这类规则“各只在一处定义”只列两处；`16` §16.1.6 判定顺序先 `tower_data` 后其余受保护类别；`10` 回退根写作 `~/.tower/worktrees/<projectId>` | 三种沙箱各为自己在默认位置下的允许项逐路径除外（验证器另含 `$SH`，检验检出为本 Goal 的检验目录与 `$VS`、`$SH`），分类器硬底线只为 Agent 的读写项除外，均只按 `11` §11.6.2；`10` §10.4.3 列出两处定义与引用它们的规则；先判 `user_checkout`、`other_satellite` 再判 `tower_data`；回退根为 `~/.tower/worktrees/<projectId>.noindex` | ADR-198 |
| `06` `privacy.purged` 的 `roots` 只在 `project` / `all` 档写入，`project` 档逐 Goal 的事件没有配对的完成事件；`14` G46 “`privacy.purged{scope:"goal"}` 只有一条”、“待批准的提议与以它为对象的” `ratify` 条目已删除；`09` 汇总的 `ratify` 条目不改写；`14` G33f 修订后此前的 `extend_budget` 不再计入，修订编辑器的预算预填没有规定 | `roots` 为 `{projectId, wtRoot}` 列表、各档都写，续做只按事件定位，`project` 档完成时为逐 Goal 的事件各追加 `filesDone`（`06` §6.4.3）；聚合的 `ratify` 条目移除被删除的提议并重算，对象为空时 `obsolete`（`09` §9.12.4）；修订编辑器预填修订前的生效额度，与之相同不算提高（`06` §6.2.5、`16` §16.5） | ADR-198 |
| `02` §2.2 GoalId “单调递增，本机从不复用”，高水位文件无法解析时没有规则；`10` §10.2 两种检出路径已存在时“不写出、不覆盖、不删除、不改名”，本 Goal 自己中断的接管或删除留下的 `_human/<goalId>` 使“我来改”一直返回 `E_STATE`，交还第 8 步与放弃改动删除 H 与清除 `humanCheckout` 的先后没有规定；`09` §9.12.4 “终态 Goal 仍留有的这类目录只有两种”；`06` §6.2.5 扩展并入新版本只由修订编辑器的预填保证（“各字段预填修订前的生效额度，此前的扩展因此并入新版本的合同值”）；`privacy.purge` 只有 `{scope, id?, reason}`，人选择删除受影响会话的选项没有落点；检验检出的临时目录与服务数据目录没有位置 | 本机不复用，高水位丢失时至少不与已有目录、地标同名，文件无法解析时视同缺失（`02` §2.2）；`humanCheckout` 为空而该路径已存在时 Tower 先把它改名为 `_human/<goalId>.kept-<时间>` 再新建，从不自动删除 H 并列出（第 100 轮起，`10` §10.2、§10.8.4，ADR-228）；三种，含改名保留的目录；`contract.amend` 在服务端以提交时的生效额度补齐 `patch` 未给出的预算字段，含预算字段时带 `budgetBase`，不一致时 `E_CONFLICT`，编辑器预填只是显示（`06` §6.2.5）；命令与事件带 `sessionIds`，续做按事件删除（`06` §6.4.3）；`$TMPDIR/tower-inspect-<goalId>/`（`10` §10.8.3 第 3 步） | ADR-199 |
| `06` §6.1.6 “Run 在 drain 中途”一行只在 Run 未结束时触发（`run.ended` 已提交、原目标的事务尚未提交时没有恢复行）；`06` §6.4.3 `privacy.purge` 的会话删除只在 `~/.tower/goals/<goalId>/sessions/` 中定位；`10` §10.8.3 检验的临时目录“关闭检验时随检验目录一并删除”；`09` §9.12.4 “终态 Goal 仍留有的这类目录有三种”；`10` §10.3.2 删除卫星时按名字删除 `humanCheckout` 为空时的残留 `_human/<goalId>/`；`05` §5.6.5 引号中的 “invalid continuation” | 不论 Run 是否已结束（`06` §6.1.6）；含已移入年度归档包的会话，按“清除一个 Goal”同一方式重写归档包（`06` §6.4.3）；第 7 步停止服务时即删除，不随保留的检验目录保留（`10` §10.8.3 第 3 步）；四种，含中断后留下的 `_human/<goalId>`；保留并列出（`10` §10.3.2）；Pi 原文 `agent_before_settle requested continuation without runnable model context`（`05` §5.6.5） | ADR-200 |
| `11` §11.8.1 项目 Pi 配置被改动后的 Needs-You “是否在下一个 Run 中加载？”；`11` §11.4 事后检测命中 `protected` 时按停止条件 `path_touched` 暂停 Run，选项“把这些路径恢复到上一个检查点”，`07` §7.5.5 “由人选择恢复、修订合同或放弃”；`11` §11.8 “运行中若三要素因授权（Grant）而凑齐，产生 Needs-You”；`11` §11.4、`05` §5.3.5 bash 被覆盖降为 S0 时只写“生成 Needs-You（severity 2）”而无 kind；`06` §6.1.6 “Agent 后台进程”与 §6.1.10 只覆盖未结束的 Run（“对每个未结束 Run 的” `process_token`）；`16` §16.1.6 默认位置下 `<wtRoot>` 中 Tower 创建的目录被拒绝访问时落入 `system`；`04` §4.6.7 “我来改”的源状态不含 `ready` | 不提供“加载”，不信任启动不加载项目的任何受信任保护资源（含 base 版本），只显示 `◇` 提示（`11` §11.8.1）；运行中只使 S0 授权失效，命中由验证时的 `scope_breach`/`protected_path` 处理，卡片写明改动已发生（`11` §11.4）；警告在授予该授权的审批卡片上当场显示（`11` §11.8）；哨兵 `bash_overridden`，Needs-You `sentinel`（`16` §16.1.6）；另含有未解决 `bg_process_survived` 的已结束 Run（`06` §6.1.6）；归入 `tower_data`，不随位置变化（`16` §16.1.6）；含 `ready`（工作目录已完成检出时，`04` §4.6.7） | ADR-201 |
| `00` §0.5、§0.5.1 “只在项目被信任且未被 Agent 修改时加载”；`11` §11.8.1 有效信任为真时 Pi 以信任加载项目的全部受信任保护资源，SDK 经 `resolveProjectTrust` 返回该布尔值、RPC 传 `--approve`，理由句“这段代码将在宿主进程中以用户权限运行”只针对 `.pi/extensions/`；`05` §5.4.1 “只有在条件成立时才传”；`05` §5.6.5 “受信任项目的扩展”可改写工具结果，§5.10 静态清单枚举受信任项目的扩展目录；`11` T4 只以“默认 protected；S2 写拒绝；每个 Run 复核信任”缓解代码植入 | M1 中 Pi 的项目信任恒为假（SDK `projectTrusted:false` 且不传回调，M2 的 RPC 恒传 `--no-approve`）：项目扩展、项目包与项目 MCP 服务器不论信任与 base 都不加载，加载推迟到 M2 的批准设计；复核为信任时只以显式路径传入 base 树中的技能、提示、主题与 `SYSTEM.md`/`APPEND_SYSTEM.md` 普通文件（`11` §11.8.1）；`00` 写“相对 base 未被修改” | ADR-202 |
| `11` §11.6.2、`05` S2 读允许列表的动态部分从用户 Pi settings “全局与受信任项目”解析路径；`11` §11.6.2 写拒绝、`02` §2.5 与 `11` §11.3.3 默认 `protected`、`11` §11.8.1 上下文文件复核（pathspec `:(glob)**/AGENTS*.md`、`:(glob)**/CLAUDE.md`）按区分大小写的名字匹配；`09` §9.11 每个目录按 `AGENTS.override.md` → `AGENTS.md` → `CLAUDE.md` 取第一个；`07` §7.6.3 与读允许列表只列 `AGENTS.md`、`AGENTS.override.md`、`CLAUDE.md`；`05` Host 以 `systemPrompt`/`appendSystemPrompt` 传项目 `SYSTEM.md`/`APPEND_SYSTEM.md` 的路径；`04` 信任提示第一组不含 `APPEND_SYSTEM.md` 与 `.agents/skills` | 从用户级 Pi settings 解析（M1 中项目设置从不读取）；上下文文件的名字集合取 Pi v1.2.0 的五个候选名，名字按 `10` §10.1.2 的规则比较，四处防护都按它识别（`16` §16.1.12“上下文文件名”）；复核对完整差异按名字规则筛选；项目系统提示以内容经 `systemPromptOverride`/`appendSystemPromptOverride` 传入（`11` §11.8.1）；第一组补齐 | ADR-203 |
| `16` §16.1.6 `symlink_escape` 一行“pin 中新增或改变的符号链接”、终点为绝对路径或越出仓库根（ADR-112 的旧规则）；`11` §11.8.1 祖先 `.agents/skills` “与 Pi 在信任下的收集范围相同”（走到文件系统根，批准时记录清单与哈希）；`06` §6.1.3、`08` §8.6.3 崩溃时即生成 `stalled{crashed}`，`16` §16.1.7 “一次自动恢复失败后”；`04` §4.8.3 “severity 1 与 ratify 聚合条目进入”稍后分区，`12` §12.8 L1 侧栏 `+n 稍后`；`09` §9.11 导出目标取 `appliesTo.paths` 的公共前缀目录、“已有 AGENTS.md 就用它”；`10` §10.4.3 按 `AGENTS*.md`/`CLAUDE.md` 通配列出祖先文件，“与回退路径祖先中的同类文件比较”；`11` §11.6.2 写拒绝“与 §11.3.3 一致，形成双保险”而 `protected` 的其余名字区分大小写；`10` “大小写不敏感的名字粗筛”“准备中 · 物化依赖”，`12` §12.6.4 “创建工作目录、物化依赖、预取、宿主”；`03` `question_timeout` “或 abort/Pi 侧兜底超时后仍有本 Run 未答的阻塞条目” | `symlink_escape` 写现行规则摘要并引用 `10` §10.1.2 (b)；范围止于最近的含 `.git` 的目录并排除用户级目录，即只有卫星根的 `.agents/skills`；Needs-You 只在自动恢复不进行或失败后生成（`08` §8.6.3）；“稍后”只收 `ratify` 聚合条目（`08` §8.5.1）；导出目标为 Pi 在仓库根加载的候选，祖先差异用 `contextFiles()`（`16` §16.1.12）；`protected` 全部模式按同一名字比较规则（`16` §16.1.12“上下文文件名与受保护名字”）；粗筛引用 `10` §10.1.2；步骤名以 `12` §12.6.4 表格为准；abort 时保留 abort 的原因（I4） | ADR-204 |
| `08` §8.6.3 `engine_crash` 条目“自动恢复不进行或失败”时生成（含 `autoResume` 为假的分支），`06` §6.1.4 启动时一律自动解除 `engine_crash`；`12` §12.6.5 `provider_unavailable` “只在重试耗尽后才有” `stalled` 条目、暂停时写 `◇`；`09` §9.11 导出目标“即 `contextFiles(用户检出)` 中仓库根那一项”，导出后立即询问退役，“导出到 AGENTS.md”列为 M1；`10` §10.4.3 第 3b 步只比较“中仓库根以上的部分”、只在强制回退时计算（人设置 `worktreeRoot` 时不计算）并“以 Tower 注入的形式（Trace 可见）补入简报”，`05` G31 “会计算差异并在系统段中提示”；`00` §0.5.1、`11` §11.6.2、`09` §9.11 建议把未跟踪的 `AGENTS.md` 直接加入“本地文件”清单（“添加项目时建议把它加入”），`project.local_files.add` 不检查路径是否被忽略；`10` §10.3.1 监视候选集“大小写不敏感地名为” `.git` 等；`08` §8.6.3、`04` §4.18.3 的选项“结束本 Run” | 只在 10 分钟内再次崩溃或启动时因 `resumeOnLaunch` 关闭而未解除时生成，重启中的准备失败归 `prepare_failed`/`satellite_missing`；已有该条目的 `engine_crash` 启动时不解除（`08` §8.6.3）；`provider_unavailable` 暂停写 `◆`；导出目标在 base 树上求值，用户本地遮蔽时提示且不提供退役，补丁进入 base 后才询问，整体在 M2（`09` §9.11）；祖先差异以 `09` §9.11 为唯一定义；本地文件只接受被 git 忽略的路径（`git check-ignore`，`16` 的 `ProjectLocalFile` 行）；名字按 `10` §10.1.2 的名字比较规则；选项“放弃” | ADR-205 |
| `10` §10.1.2、`16` `ProjectLocalFile` 行：本地文件是否进入检查点、pin、seal 与 T1 取决于忽略规则，复制前“以 `git check-ignore` 复核它在用户检出中仍被忽略”，不再被忽略时通知“不再被 git 忽略，本次未复制”，`mark_secret` 删除副本时“该路径被 git 忽略，不改变指纹与 diff”；`10` §10.8.3 检验带回“不含播种的本地文件”，§10.8.4 交还只按路径排除机密本地文件；`15` ADR-205 登记的残余（只被未提交的 `.gitignore` 改动忽略的路径）；`08` §8.4、§8.8 与 `16` §16.1.7 没有认证过期（F7）条目的去重键与定类，`12` §12.6.5 `provider_unavailable` 的理由“进入这一暂停时 Pi 的重试已耗尽”，`05` C39 (c)“不生成 F6 的 `stalled{engine_error}`”；`06` §6.1.3“第二次崩溃起改为等待人工处理”；`14` G43 (r)“重启期间显示”；`14` G46 (bg) ADR-197 一组整体计入 M1 补跑；`11` §11.6.2“添加项目时建议先把它加入”；`04` §4.12 的 `搜索 /` 与 `⇧Y 拒绝` | 快照按路径排除本地文件清单中的全部路径，与忽略规则无关（唯一定义 `10` §10.1.2）；复制前改为检查路径在该 Goal 的 base 中是否被跟踪，被跟踪时不复制、也不排除，通知“在这个目标的代码中已被跟踪”；`add` 另拒绝在 base 中被跟踪的路径；F7 的条目为 `stalled{engine_error}`，去重键 `st:{goalId}:auth`，不参与根因合并（`08` §8.4、§8.8）；10 分钟内再次崩溃则不再自动重启；“重启前显示”；G46 (bg) 中依赖子 Goal、待批准提议与 Goal 记忆的部分标为 M2；由“生效上下文”面板提示；`筛选 /`、`⇧Y 驳回` | ADR-206 |
| `10` §10.7.1 第 1 步的检查点树与 pin 树定义写“只排除名为” `.git` 的条目与 gitlink、git 拒绝收录的路径是其唯一例外，命令注释“不再有排除列表”；§10.6 pin 一条“只去除名为” `.git` 的条目、gitlink 与 `excludedPaths`；`07` §7.3.2 `worktreeTree` 只排除 `.git`、gitlink 与拒绝收录的路径；`10` §10.1.2 自称快照排除的唯一定义并列举快照种类，清单在 Goal 进行中变化时影子索引、指纹与归因未定义；`16` `ProjectLocalFile` 行“已有副本”从该 Project “所有活跃卫星”删除并断言不改变指纹与 diff；`06` §6.8 F7 ② 按 F4b 另有 `stalled{prepare_failed}`，`08` §8.4 F7 条目只与 `provider_unavailable` 成对，③ 而 Run 正常结束时没有出口，探测未写是否刷新 OAuth；`09` §9.5.4 M1 的“生效记忆”面板每条带“本 Goal 不适用”按钮而 `goalOverrides` 没有字段与命令；`05` §5.10 技能措辞“并要求用 read 加载”（`core/skills.ts:368-381`）；`08` §8.6.3 的上一次崩溃取上一个以 `crashed` 结束的 Run；`10` §10.8.4 take_human“卫星整体置为” T1，第 7 步“被忽略的文件（依赖目录、.env.local 等）不同步”；`04` §4.6.7“工作目录整体置为”你的副本的树 | 快照排除的四类（`.git` 条目、gitlink、git 拒绝收录的路径、本地文件排除集 L）只在 `10` §10.7.1 第 1 步定义，§10.1.2 只给本地文件的规则，§10.6、`07` 与 `11` §11.8.1 引用；L 按每次快照求值，以 `Tower-Local-Exclude` trailer 记在检查点与 pin 上，比较用记录的 L，清单变化在下一个检查点或 pin 生效、不单独引起 I2 或 `external_change`，已在影子索引中的条目先 `--force-remove`；只在 base 不跟踪该路径的 Goal 中删除副本；② 暂停为 `prepare_failed` 但条目是 F7 的、不另生成，③ 而 Run 正常结束时以 `obsolete` 关闭，探测以 `getAuth` 真正刷新令牌；按钮与 `goalOverrides` 推迟到 M2；按可用的读取工具三种措辞（`:358-371`）；上一次以 `engine_crash` 进入暂停的时间；按写回集合置为 T1，本地文件排除集中的路径不同步 | ADR-207 |
| `10` §10.1.2 移出本地文件清单的文件“作者按收入它的检查点记录”（`running` 中为 `agent`）；`16` `Checkpoint.landmarks` 行“树的唯一例外”“其余情况下检查点树与 pin 树只去除” `.git` 与 gitlink；`05` §5.3.6 隔离 agentDir 改用内存凭据存储、“整个凭据集只在 Host 内存中”，`11` §11.8.2 隔离 agentDir “只链接” `auth.json`、`models.json`；`08` §8.4、§8.6.5 `prepare_failed` 的条目一律为 `stalled{prepare_failed}`，阻塞类条目的判定没有 F7 ② 的例外；`08` §8.3.1 单向门审批只在 severity 3 分支中进入 L4；`06` §6.4.3 没有关闭检验的命令，`04` 运行中的过期行显示 `⇧V`；`03` §3.2 `ready` 行的评审余量闸控与“越过余量”没有 M2 标记，“评审余量只闸控首次启动”；`06` `goal.hand_back` 与 `04` §4.6.7 枚举交还即解除的原因时漏掉 `stalled_timeout`，`03` `human` 行与 `04` §4.18.3 “由运行行为推导的保留”；`14` G42 (g)(t) 的预期“保持 `ready{review_capacity}`”“评审积压已满时仍被闸控”，G33 “扩预算后进入” `verifying`，G26c (a) `E_INVALID`；`04` §4.8.12 “通过”“含有保留与未经机器验证” | 移出清单后首次收入该路径的检查点把它记入 `mixedPaths`，按人的改动计（`10` §10.7.1 第 1 步）；`excludedPaths` 只记 (c) 类，树排除什么以 `10` §10.7.1 第 1 步为准；凭据不隔离，隔离 agentDir 读用户 agentDir 中同一路径的 `auth.json`（`05` §5.3.6）；F7 ② 时条目是 `st:{goalId}:auth`，不可关闭；单向门审批在 §8.3.1 第一行直接为 L4；`inspect.close{modified}`，`⇧V` 只在 `goal.retry_verify` 接受的状态显示；M1 中评审余量不闸控（阻止模式属 M2）；交还时的集合只在 `16` §16.1.1 定义；M1 只有提示模式、依赖与合并队列标 M2，`budget.extend` 后 `resume`，`E_STATE`；未经机器验证不算通过（`03` §3.2.1） | ADR-208 |
| `10` §10.7.1 第 1 步移出清单的路径只在“在上一个检查点记录的 L 中”、不在本次 L 中且出现在本检查点的树中时记入 `mixedPaths`（不作用于 pin；移出时仍被忽略、之后才解除忽略的不触发），并称“它是人的文件”，已知限制的窗口“只在卫星创建到第一个变更回合之间”；交还 T1 的机密路径“base 版本仍在树中”；`04` §4.15.1 “你的文件，可能经 Agent 修改”且只写先移除，`mark_secret` 确认文案“已复制到工作目录的副本将被删除”；`14` G46 (bh)(6) 第八组移出已播种的 `.env.local`（“非机密，已批准”）；`08` §8.3.4 `routeTick` 的洪泛与预算守卫只按 severity 判定，单向门审批会被降为 L2；`06` §6.4.3 与 `16` §16.5 没有人工编辑面板中运行准备步骤那个按钮的命令；`10` §10.8.3 “检验检出存在期间”暂停机会式验证，§10.2 “检验目录存在即按已打开的检验处理”；`06` `goal.hand_back` 粗体“原因清除只限由 pin 推导者”；`05` §5.3.6 以 Host 进程的 `getAgentDir()` 求用户凭据路径；`11` §11.7.0 投递表没有用户自己的 Pi 凭据文件；`14` G33f “在远程客户端上修订合同”“期间在手机上批准”，G32b 的手机一步未标 M2 | 移出清单之后首次进入本 Goal 的快照（检查点或 pin；以最近一个记录的 L 含它的快照之后为准，不论移出时是否仍被忽略）按人的改动记入 `mixedPaths`，pin 时先以同一棵树写 `safety` 检查点；可能是人的文件；窗口含 `ready` 中排队的时间；该路径保留 T0 的版本；移出并让它不再被 git 忽略；副本（含 Agent 对它的修改）将被删除；第八组改用 `config/dev.local.json`，并覆盖 pin 与解除忽略；`overdraw`（severity 3 或基础级别 L4）可透支、不被洪泛压低（`08` §8.3.4）；人工编辑面板的准备命令（第 82 轮推迟到 M2，ADR-210）；检验打开期间（`inspect.opened` 到 `inspect.closed` 或带回），验收或放弃触发的清理同样记 `inspect.closed`；由 pin 推导的原因清除；用户 agentDir 由 Tower 按 Pi 的规则求出并显式传入；投递表补一行；本机修订与本机收件箱批准，手机与远程步骤标 M2 | ADR-209 |
| `10` §10.8.4 第 2 步、`00` §0.5.1、`04` §4.6.7 与 `14` G37 的人工编辑面板按钮“在验证器沙箱中运行准备步骤”，以及 `06` §6.4.3、§6.4.7 与 `16` §16.5 中它的命令（ADR-209）；`10` §10.8.3 与 `04` §4.6.6 检验信任提示的“[打开] [只复制文件] [取消]”与 S0 未授权时的“授权后检验”；`04` §4.15.1 本地文件建议的忽略按钮；`10` §10.1.2 影子 `info/exclude` “在每次 fetch 新 base 时刷新”，`04` §4.15.1 “在 Tower 下一次获取 base 时生效”；`10` §10.3.1 归因基线的括注“settle 第 4 步的 agent_bg_done 检查点，其树 = pin 的树”；`10` §10.7.1 非回合入口“跳过第 0 步与第 7 步”；`10` §10.7.1 第 1 步“运行中的观察器指纹与 Fact 新鲜度”取当时的清单（`in_review` 中也可读作按当前清单变旧）；`12` §12.5.4 “示例为待验收中的目标”；`05` §5.3.5 与 §5.10 的 `agentDir = getAgentDir()`，扩展清单与读允许列表的 `~/.pi/agent` 按 Host 环境或写死求值，§5.10 隔离 agentDir “只链接” `auth.json`、`models.json`；`08` §8.5.3 “透支期间同一 Goal 的其他 severity 2 条目一律只进收件箱”；`10` §10.2、§10.7.2、§10.8.1 与 `16` §16.1.12 的 `safety/<k>` ref；`14` G21 “随后人执行回退、Tower 自动 rebase、检查点”，G46 (bh)(6) 第八组“在 D 与 E 的卡片上各点一次”检查 base 与“刷新之前 D 的检查点不含”，G33d (f) 与 G35c (p) 未标 M2；`06` `inspect.bring_back`、`14` G36c (b) 与 `16` `Goal.pendingHandBack` 的合并队列一步未标 M2 | M1 中 Tower 不在人工编辑检出中运行准备步骤，需要时由人在自己的终端中运行；沙箱内的准备命令推迟到 M2（不能写 H/.git，机密按检验检出的显式开关）；`[打开] [取消]`；需要运行脚本与服务时先关闭检验、经 `s0.grant` 授权、验证完成后再打开；建议条目只有添加；刷新时机：卫星创建或重建与每次 Run 开始，远端与本地 base 相同；该目标下一次开始运行或重建工作区时生效；当前 pin 的检查点 = 树与记录的 L 都等于当前 pin 的最近一个检查点，没有时取 pin 本身；第 7 步只跳过 `appendEntry`，`checkpoint.created` 照常记录；`in_review`/`accepted` 中 Fact 新鲜度用 pin 记录的 L，清单变化不使其变旧；示例为暂停中的目标；同一个用户 agentDir 用于 `agentDir`、静态清单的枚举根与读允许列表；凭据不经链接；（单向门审批除外）；安全快照写为 `cp/<n>`，landmark `safety`；G21 改为“我来改”并交还，回退与自动 rebase 一组标 M2；第八组改为 D 的下一个 Run 开始时刷新，本地与远端 base 各做一遍；G33d (f)、G35c (p) 标 M2；合并队列一步标 M2 | ADR-210 |
| `05` §5.3.6 用户 agentDir 一段的“一律不调用 Host 的 getAgentDir()”与“Pi 以它定位全局 settings.json”，§5.3.5 骨架注释的同一说法，§5.10 “RPC 模式不改动任何环境变量”，§5.4.1 “不改 PI_CODING_AGENT_DIR（保留用户的 ~/.pi/agent）”；`05` §5.10 与 `11` §11.8.2 静态清单只列“已安装包的目录”，未提 Pi 在资源加载时自动安装缺失或版本不符的包（ADR-210）；`10` §10.7.1 第 1 步“同一工作区内容与同一个 L 总得到同一棵树，不依赖索引的历史”，`07` §7.3.2 “与影子索引的历史无关”，`10` §10.1.2 的全新临时索引一律以 `baseCommit` 初始化（含 `full` 闸口），只经 `info/exclude` 忽略的文件“不会进入检查点、pin 与 seal”；`10` §10.7.1 去重例外只含人工决定类入口；`10` §10.8.3 第 7 步与 `06` `inspect.bring_back` 的带回检查点只写作者、不写 landmark 与 `humanPaths`；`04` F4 第 4 步的“在下次运行开始时送达”与“重新发送并继续运行”，`05` §5.7.3 `stale` 的“且人选择不再投递”；`12` §12.6.5 人工编辑实况行的“按钮在目标页人工编辑面板”；`06` §6.1.6 丢失检出的 Needs-You 没有 kind；`06` §6.4.3 的 `goal.rewind`/`goal.fork`、`run.rewind`、`run.fork_goal`，`08` §8.13 的回退与分叉动作，`16` §16.5 回退与分叉一行未标 M2；`14` G21 在 B1 | Host 环境恒设 `PI_OFFLINE=1` 与 `PI_CODING_AGENT_DIR`=本 Run 的 agentDir（`05` §5.3.6“Pi 运行开关”唯一定义，RPC（M2）同此）；全局设置由 `globalPath` = 本 Run 的 agentDir 下的 `settings.json` 定位（§5.3.3）；清单只列已安装且版本相符的包，其余单列为“未安装”，不安装、不加载，提示在终端中运行 `pi`；忽略规则不追溯：已收入影子索引的路径照常留在快照中，`full` 以影子索引此刻收录的树初始化，`stat_cache_mismatch` 后以 `full` 的临时索引取代影子索引（`10` §10.7.1 第 1 步唯一定义）；只经 `info/exclude` 忽略的文件不会新进入快照；settle 第 4 步的 `agent_bg_done` 同样不受去重，回合入口只与上一个回合检查点比较；带回记 landmark `human_edit`，`humanPaths` = 以 T_pin 为基线的写回集合中改动的路径；未送达的评论留在队列，下一次 Run 开始时随开场送达，不需要再发时 `comment.delete`；面板只显示提示；kind `stalled`、子类型 `human_checkout_lost`，去重键 `st:{goalId}:human_checkout`；回退与分叉标 M2；G21 移到 B3 | ADR-211 |
| `05` §5.3.6 Pi 运行开关的“先让该 Host 退出再以新环境启动”与 `PI_CODING_AGENT_DIR`=本 Run 的 agentDir（隔离时为 `~/.tower/pi-agent/`），§5.3.3 `globalPath` 按本 Run 的 agentDir，§5.10 清单确认之前与 `riskTier=high` 以隔离 agentDir 启动，`11` §11.8.2 “默认隔离”，`00` §0.5.1 “默认使用隔离的扩展目录”，`09` §9.11 隔离 Goal “读的是隔离目录”；§5.3.5 骨架注释“白名单过滤，保留 PI_* 会话变量”，`11` §11.4 “环境白名单保留 PI_*”，C28a “并保留 PI_*”；`05` §5.10 与 `11` §11.8.2 清单的包目录只看用户 agentDir 下的 `npm/`、`git/`，“确认之前不加载、不执行任何代码”，C40 与 G46 (bi) “没有包管理器或 git 子进程”；`16` §16.1.14 `checkpoint.created` 的 landmark、作者与路径集合“由 checkpoints 表承载，不进载荷”；`05` §5.7.3 `dropped` 的“且人选择丢弃”；`06` §6.1.6 丢失检出只在重启时检查，再次接管无条件改写 `takeover_from`；`10` §10.16.2 情形 B 的影子索引以 `baseCommit` 初始化，`07` §7.3.2 伪代码在 `full` 之后删除临时索引；`14` B3 含 G11、G19、G21、G23、G33、G35、G35b；评论回执“■ 未送达” | M1 中每个 Run 都用用户 agentDir，Host 环境的两项对所有 Host 相同、不因 Goal 或 Run 而变，Host 不因它们重启；清单确认之前与 `riskTier=high` 只以 `noExtensions:true` 不加载扩展与 MCP，独立的隔离 agentDir 推迟到 M2（`05` §5.10 唯一定义）；`bashEnv` 只保留五个会话变量，不按前缀（`05` §5.3.6 唯一定义）；清单的包目录查找顺序同 Pi、含包管理器的全局根，唯一的子进程是只读全局根查询；`checkpoint.created` 的载荷即 `checkpoints` 行，`in_user_repo` 除外；`dropped` 只有 `handled` 一个来源；人关闭 = `comment.edit` 把 `requiresChange` 改为 `false`；运行中与重启时发现丢失是同一条规则，丢失后再次接管不改写 `takeover_from`；情形 B 以取回的最新可用检查点的树初始化影子索引，`full` 的临时索引由调用方取代影子索引或删除；七个用例移到 B4；`◇ 未送达` | ADR-212 |
| `05` §5.3.6 环境表中包管理器私有存储一行的 Host 列为 ✔ 与“按项目的包管理器及其主版本生成对应角色 A 的配置”，`PATH` 行的 Host 以 Tower 按项目选出的 Node 与包管理器开头，`06` §6.2.4 的 Host 环境拼装含 `16` §16.8 的包管理器环境变量表；`05` §5.10 与 `11` §11.8.2 的清单查询“以 Host 的同一环境”运行、“与安装器第 1 阶段同类”，C40 “唯一的包管理器子进程”，G46 (bi) “引起一次包管理器的只读全局根查询”而夹具未固定全局根；`11` §11.8.2 “合同中可逐项加回”，`16` §16.6 “合同逐项加回”，`05` §5.10 “高风险 Goal 要逐项加回扩展”；`16` §16.1.14 与 `10` §10.8.4 “检查点建立后不再改写”，`checkpoint.created` 的路径集合不设上限，`submit`/`rework_start` 与三个验证类 landmark 没有写入规则；`06` §6.2.1 领域表“可以从 events 完全重建”；`16` `Goal.pendingHandBack` 延后执行的 `reverify` 以已清除的 `takeoverFrom` 为 `returnTo`；`11` §11.7.0 “非隔离模式本来就读它”，`14` K11 “高风险隔离”；`04` §4.18.1 “搜索工具不可用：塑形与评审中只能逐个读文件”；`06` §6.4.3 `comment.*` 三条命令共用 `{goalId, anchor, body, …}`，`comment.delete` 可删除已送达的必须修复评论 | Host 环境与工作目录不引用任何 Agent 可写的位置，角色 A 的包管理器变量只进入 `bashEnv`，Host 的 `PATH` 与包管理器位置变量取首次运行读到的登录 shell 值（`05` §5.3.6 唯一定义）；清单查询用同一环境、运行你配置的 `npmCommand`、限时 10 s，全局根查询之外没有包管理器子进程（不限次数），G46 (bi) 固定夹具的全局根，(bj) 覆盖 Agent 改写 `$GS/npmrc`；M1 中高风险 Goal 没有按条目加回的机制（推迟到 M2），只能降低 `riskTier`；建立后只追加 `landmarks` 的三个验证类值与 `unusable`，超限的路径集合以内容哈希写入 `artifacts/`，landmark 的写入规则在 `10` §10.7.1；可以从 events 重建，三处例外只列在 `06` §6.2.1；`pendingHandBack.returnTo` 在清除 `takeoverFrom` 之前取得；本来就读它；高风险 Goal 不加载扩展；提示文案只在 `05` §5.3.6 定义；`edit`/`delete` 带 `commentId`，`delete` 只删除未送达的评论 | ADR-213 |
| `05` §5.3.5 `towerMcpTransport` 只规定 stdio 服务器的环境，spawn 的工作目录沿用 Pi 默认的会话工作目录（卫星），`11` §11.3.4 “代码智能类 MCP 应以卫星为根运行”，`14` G10 的 MCP git 服务器以卫星为 cwd；`05` §5.3.6 Host `PATH` 取“首次运行时从登录 shell 读到的 PATH 中、经人确认的目录”，路径值“之后修改不会自动重新读取”且没有显示与重新读取的入口，`00` §0.5.1 “首次运行时会提示”；`05` §5.10、`11` §11.8.2、`13` §13.5 的 Supervisor 全局根查询限时 10 s，超时按没有全局根处理；`06` §6.4.3 `goal.take_over` 不看 `pending_hand_back`；`06` §6.2.1 “例外只有以下三处”，`runs` 两处来源都没有的行记为 `crashed`，`sessions`、`watermarks` 与 `question_timeout` 的问题条目未列；`16` §16.1.14 只为 `checkpoint.created` 写 16 KB 的处置，外置文件随 `artifacts/` 备份，“其余列建立后不再改写”；`06` §6.4.3 已送达评论的 `edit` 可改 `body`、`timing` 与 `requiresChange`；`10` §10.3.1 `bg_process_survived` 注记的“同一时间窗内”；`06` §6.2.4 Host 的 `GIT_CEILING_DIRECTORIES=<wtRoot>`；`16` §16.8 A 的 `PATH` “另追加 Engine Host 白名单中的工具链目录” | stdio 服务器的工作目录：绝对 `cwd` 照用，未写时以本 Host 的空目录 `~/.tower/mcp-cwd/<hostId>/` 为基准（相对的只有 `.` 可用，ADR-216），落在 Agent 可写位置之下的不启动，`roots` 仍为卫星（`05` §5.3.5 唯一定义）；路径值取最近一次读取，设置页显示并可重新读取（`engine.reread_login_shell`，仅本机），不自动重新读取；每次 Host 启动时重新判定并提示；查询与 Pi 一样不另设时限，出错或超出准备时限时不启动 Host（`paused(prepare_failed)`）；`pending_hand_back` 非空时 `goal.take_over` 返回 `E_STATE`；例外四处：含 `sessions` 整表、运行时表（`watermarks`、`timers`、`engine_outbox` 原样沿用，`projections` 重新生成），`question_timeout` 的阻塞问题由 `engine.ui_request` 重建，删去两处都没有的分支；路径集合的外置是通则（`06` §6.3 唯一定义，列出四个事件），随 `goals/<G>/` 保留与清除，文件缺失或哈希不符时重建停止；其余由事件承载的列建立后不再改写；送达后的 `edit` 只接受人关闭；该检测器条目打开期间；`<全部 wtRoot>`；工具链变量所指目录下的 `bin`，不追加登录 shell 的 `PATH` | ADR-214 |
| `05` §5.3.5 与 `06` §6.6.1 的 `~/.tower/mcp-cwd/` “从不写入，不清空”“创建时为空，Tower 之后从不写入”，C21 “在启动前后都为空”，`14` G46 (bk) “该目录始终为空”与“工作目录在 Tower 的工作区之下”；`11` §11.3.4 第 (3) 项相对路径“无法确定基准”而一律至少 ask，“按其读写方向”而方向未定义；`05` §5.3.5 与 `11` §11.3.4、§11.8.2、T4、T16 无条件陈述 stdio 服务器的工作目录与环境由 Tower 选定（内置 MCP 被注册 `/mcp` 的扩展取代时不成立）；`05` §5.10、`11` §11.8.2 与 `13` §13.5 的 Supervisor 全局根查询“与 Pi 一样不另设时限”“由同一准备时限兜底”，Run 之外的清单计算没有时限与失败规则；`03` §3.2.1 `human` 行与 `nested_repo_live` 出口列表（`06`、`10`、`16` 引用）不看 `pendingHandBack`，`04` §4.6.7 的接管源状态“任意 `paused(*)`”无例外；`06` §6.2.1 “例外只有以下四处”“重建不复原条目”“唯一不随 Run 失效的是”`question_timeout` 的问题，`projections` 一律重新生成，`meta`、`depcache_entries`、`project_checkouts` 未列；`06` `goal.abandon` “只允许这一种写法”而漏掉 `human_checkout`；`10` §10.7.1 验证类 landmark “由 Supervisor 追加到被验证 pin 的”；`05` §5.3.1 片段 `createMcpExtension()` 不带参数 | 每个 Host 进程一个空目录 `~/.tower/mcp-cwd/<hostId>/`，Host 启动前新建为空、退出后删除（ADR-216）；经 `towerMcpTransport` 启动的 stdio 服务器的相对路径按 `roots` 与用户写的绝对 `cwd` 解析（ADR-216），落在硬底线内即 forbid，沙箱外工具的方向按写处理（`11` §11.3.4 唯一定义）；内置 MCP 的来源自检：注册 `/mcp` 的不是 `builtin:mcp` 时不开 Run（`05` §5.3.5 唯一定义），上述陈述限定为内置 MCP 生效时；查询自有 60 s 时限、到时终止，Run 中属第 ③ 步，Run 之外写“无法确定是否已全局安装”并可重试（`05` §5.10 唯一定义）；`pendingHandBack` 非空时 `take_over` 返回 `E_STATE`，`nested_repo_live` 只剩 `resume` 附转向与 `abandon`，“我来改”置灰；重建按“由事件重放的表”清单，其余一切表原样沿用（含 `needs_you`、`depcache_entries`、`meta`、`project_checkouts`，已过保留期 Goal 的最终快照），`06` §6.2.1 唯一定义；离开 `paused` 时这些列为空，从 `paused(human)` 放弃另清除 `human_checkout`；由 Projector 追加；`createMcpExtension({createTransport: towerMcpTransport})` | ADR-215 |
| `11` §11.3.4、`05` §5.3.5、`06` §6.6.1、`00` §0.5.1 与 C21 中全机一个、每次任一 Host 启动时删除并重建的空工作目录，“其他仍在运行的 Host 中已启动的服务器保留被删除的旧目录为工作目录”，写进其中的东西“都不越过一次 Host 的生命周期”“这个空目录每次 Host 启动前清空”“清空与相对路径的检查使写进空目录或你检出中的东西不影响之后启动的服务器”；未写 `cwd` 的 stdio 服务器的相对路径以空目录为基准解析而一律 forbid，代价只写“以项目根解析相对路径的代码智能类服务器”“相对路径参数一律被拒绝”；`05` §5.3.5 骨架“所以在任何 MCP 服务器启动之前判定”，C21 写了相对 `cwd` 的“相对它求出”；`16` `Goal.pendingHandBack` 与 `04` §4.6.7 “界面上这类选项置灰并显示同一提示”“会改写去向的选项”而未列出，`reverify` 模式下附转向的 `resume` 先验证；`07` §7.4.3 `nested_repo_live` 出口无例外；`06` §6.2.1 “这些表清空后按事件重放”、以列为粒度沿用，墓碑行与重建的做法未定义；`08` `RoutingRuntime` “可由事件重建”；`16` §16.1.14 “不能从事件重建的全部例外见”；`06` F4b 未列 Tower 工具被遮蔽；`goal.abandon` 只列从 `paused` 放弃 | 每个 Host 进程一个空目录 `~/.tower/mcp-cwd/<hostId>/`，Host 启动前新建为空、退出后删除，启动恢复清理残留，从不在 Host 之间共享（`11` §11.3.4 唯一定义）；相对路径以 `roots` 与服务器实际的工作目录为基准，工作目录是空目录时结果仍在其中的不因此 forbid（ADR-217 改写），其余至少 ask，残余写明；相对的 `config.cwd`（含 `..`）以空目录为基准求出，落在 Tower 的工作区、数据目录或硬底线之内的不启动（ADR-217 改写）；在内置 MCP 管理的任何服务器启动之前判定，取代者的工厂属残余；置灰并返回 `E_STATE` 的只有 `goal.take_over` 与 `goal.claim_on_behalf`，`reverify` 模式下附转向解除 `nested_repo_live` 的 `goal.resume` 把 `mode` 置为 `continue_agent`（`03` §3.2.1 唯一定义）；`07` 引用 `03`；以字段为粒度与被重建的库合并，墓碑行原样沿用，写入新库、按外键顺序插入、完成后替换（`06` §6.2.1 唯一定义）；随 `needs_you` 沿用；见 `06` §6.2.1 的两份清单；F4b 补 Tower 工具被遮蔽；从 `running` 放弃另清除 `draining_for` | ADR-216 |
| `11` §11.3.4 (b) “Tower 的空目录不作基准”，未写 `cwd` 的服务器的相对路径只以 `roots` 与绝对 `cwd` 解析，以 `..` 越出空目录、落在硬底线中的结果只 ask，残余仍写“从不跨 Host”；`11` §11.3.3 第 3 条“相对路径不以它为基准”；`05` §5.3.5 “相对的 config.cwd 实际只有 . 可用”“其他相对值求出的都是其中不存在的子目录”，`00` §0.5.1 “写了 . 以外的相对 cwd”的服务器不启动、相对路径“按项目根解析（你写了绝对 cwd 时也按它解析）”，README “按项目根（与你写的绝对 cwd）检查”；`11` §11.3.4 路径检查 (1)(3) 不认 `file:` URI；`03` §3.2.1 归因窗口起点的封闭列表不含置换交还选择的 `resume`，`16` §16.1.1 与 `07` §7.10.3 各自复述该列表；`14` G32 以 `sentinel_high` 检验 `claim_on_behalf` 的 `E_STATE`；ADR-216 的 `runtime.ts:342` 与 stdio 服务器“在该会话中保持 failed”；`11` §11.6.2、T16、T29 中 Host 一侧的 `GIT_CEILING_DIRECTORIES=<wtRoot>` | 相对路径以 `roots` 与服务器实际的工作目录（`05` §5.3.5 求出的绝对、相对或空目录）各解析一次，工作目录是本 Host 空目录时结果仍在其中的不因此 forbid，以 `..` 越出的照常按硬底线判定，残余只剩写进本 Host 空目录（`11` §11.3.4 唯一定义）；第 3 条“以它为基准解析的相对路径只在越出它时按硬底线判定”；相对的 `config.cwd`（含 `..`）以空目录为基准求出，落在 Tower 的工作区、数据目录或硬底线之内的不启动（`05` §5.3.5）；`00` 与 README 改为按项目根与服务器的工作目录检查；`file:` URI 解码后按绝对路径检查，其他 scheme 不视为路径；列表补置换的 `resume`，`16` 与 `07` 引用 `03`；G33 检验 `claim_on_behalf` 的守卫；`:343`，首次连接失败的服务器的工具从未注册；`<全部 wtRoot>` | ADR-217 |
| `04` §4.8.12 归因窗口起点复述三项“交给 Agent 修复（retry_after_human_change）、评审中请求修改”与“上面三个决定之一”，`10` §10.3.1 “retry_after_human_change、request_changes）时窗口起点前移”；`11` §11.3.4 例外只免除第 3 条、本 Host 空目录与回退位置下本 Goal 卫星中的结果按密钥路径表的 `~/.tower/**` 归 `secrets.access`，`10` §10.4.3 “例外只在两处定义”；`11` §11.3.4 (3) 相对路径排除“、~ 或 <scheme>:// 开头的字符串值”，`~` 路径未定义、只按主目录解释；`06` §6.4.3 写回进行中的 `E_BUSY` 只在带回一侧，`goal.abandon` 行无例外，`16` `ProtoError.code` “`abandon` 始终允许”未限定为准备阶段；`05` §5.3.5 不启动时的文字“请写绝对路径”，相对 `cwd` 按写法（`.`、不含 `..` 的其他值）区分，`11` §11.3.4 (b) “未写 cwd 或写 .”；`11` §11.3.4 (b) “按词法规范化，已存在的部分取”`realpath` 一种求值；`11` §11.3.4 (a) 与 ADR-217 “Host 被强杀（含超出内存上限）时”“只在进程正常退出的”`exit` 钩子中终止；`05` §5.3.5 与 D53 的 `runtime.ts:409-416`；`06` §6.2.1 “最后一次写入不是事件的字段”；`04` §4.6.7 的置灰提示“先扩展预算，再继续”，`04` §4.18.3、`12` §12.6.5 与 G33 “提示先扩展预算再继续”；`04` §4.8.11 “原因文字与上面两条启动失败相同” | 窗口起点只引用 `03` §3.2.1 的封闭列表；以本 Host 空目录为基准、仍在其中的结果既不按第 3 条 forbid，也不按 `~/.tower/**` 归 `secrets.access`，回退位置下本 Goal 的卫星工作区对本 Goal 的调用同此（`11` §11.3.4 路径检查 (2) 唯一定义），`10` §10.4.3 列为第三处；以 `~` 开头的值既按 shell 规则展开、又按字面的相对路径各查一次，取更严格者；`human_checkout.syncState='syncing'` 期间（交还或带回）会改写状态或 `human_checkout` 的命令返回 `E_BUSY`，先于前置条件（`06` §6.4.3 `inspect.bring_back` 行唯一定义），`goal.abandon`、`goal.hand_back` 与 `16` 引用；改写为指向你自己目录、不是仓库检出的绝对路径，相对 `cwd` 与例外都按求出的目录判定；词法与按操作系统的方式各求一次；`close()` 与 `exit` 钩子，Host 非正常退出时两者都不运行；`:409-418`；有非事件写入者的字段一律取旧值，列出已知写入者；额度仍不高于已花费时另写先扩展预算；点名 Tower 工具被遮蔽、内置 MCP 被取代两条 | ADR-218 |
| `11` §11.3.1 伪代码只模拟 Pi 路径处理中的 `@` 一项（`resolve(cwd, stripAt(input.path))`），`~`、`file://`、Unicode 空格与 `read` 的名字变体不在其中；`11` §11.3.4 路径检查 (1) “经 realpath 后，落在第 3 条硬底线之内”只有一种求值，(3) 以 `~` 开头而不含 `/` 的值是否算相对路径未写，(2) 的括注“回退位置例外中 Agent 的读写项”，(b) 没有写从一次调用怎样找到连接，(a) “超出内存上限、致命错误”；`11` §11.3.1 密钥路径表“补全影响的是 S0 的分类与技能路径排除”；`06` §6.4.3 写回进行中只按 `syncState` 定义、其他“会改写状态或”`human_checkout` 的命令、“崩溃后由 §6.1.6 续写完成，不需要人的命令解除”，写回在运行中失败没有出口，引用写作两行；`02` §2.4 “syncing = 交还写回进行中”，§2.7 `handBack.mode` 一律取自 `params`；`10` §10.4.3 “其余规则引用后者”；`04` §4.8.12 “上一条所说的决定”；`14` §14.3.5 M1 性能门槛的 CI 场景只列 P1/P2/P5–P8 | 分类所用的路径与 Pi 内置文件工具在 `execute` 中求出的相同（`11` §11.3.1 求路径唯一定义；固定于 v1.2.0 的移植，C41 与 Pi 逐项比对，`05` D60），不能确定地求出时为 `opaque`，`read` 的四个名字变体取最严格者；(1)(3)(b) 共用一条求值：按词法与按操作系统的方式各求一次、取更严格者；不含 `/` 的 `~`、`~foo` 只按 (1)；括注为第一项；按 `namespace.aliases` 关联，取不到时以全部 stdio 服务器的工作目录各解析一次；运行时中止，`close()` 在进程已退出时不按进程组终止；影响 S0 与 S2 下文件工具的分类；写回进行中 = `syncing` 且正在本进程中执行，失败时还原、退回写回之前的状态并返回 `E_INTERNAL`，还原失败或来源已不存在时保留 `syncing`、不返回 `E_BUSY`、可放弃；三行引用；`syncing` 为写回已开始而未完成，置换的 `resume` 恒为 `continue_agent`；第二处；窗口起点一条所说的决定；P1–P9 全部列入 | ADR-219 |
| `11` §11.3.1 只在 `tool_call` 钩子中按 `realpath` 分类、注释“防 worktree 内符号链接指向外部”，密钥路径表的范围注“内置文件工具在 Host 中运行，不在 S2 之内”，求路径一条“只导出工具工厂与类型”、六个工具与 `ls`/`find`/`grep` 的省略路径；`11` §11.6.1 与 `16` §16.1.11 的“工具级写守卫”，T3 以 S1 路径守卫为主防线；`05` §5.3.5 `TOWER_BUILTINS` 含 `grep`/`find`/`ls`，塑形与评审阶段“只读工具 + 2 个 Tower 工具”与 ADR-188 的扩展版激活限制，首次运行检测 `rg`/`fd` 并提示“塑形与评审中只能用”`read`/`ls`，静态清单对同名内置工具写“该工具在 Tower 中每次调用都需要你批准”；`00` §0.5.1 “Agent 改这些文件须用文件工具并经你批准”“代价是多一次批准”；`06` §6.4.3 “还原也失败、或来源目录已不存在”时保留 `syncing`，`goal.discard_human_edits` 的“写回失败后保留的”`syncing` 返回 `E_STATE`，`goal.abandon` 的带回失败一句，`10` §10.8.4 第 6 步的 `syncing` 分支（“上次写回中途崩溃”时跳过本步续写），`04` §4.6.7 “恢复也失败时提示”“可以再次交还或放弃，重启 Tower 后也会自动续写”；还原取 B 中的版本；`16` `E_INTERNAL` 只登记 `goal.accept`；G46 符号链接组只有 (1) 的三种写法；`14` §14.3.5 命令回执与 steer “在 P2 运行中另测” | 文件工具实际访问的位置由访问时的 S2 判定：`read`/`edit`/`write` 以 `customTools` 注入、文件操作由同一档位中的文件辅助进程执行，分类只决定审批分级，S0 下的窗口登记为残余（`11` §11.3.1 使用时强制唯一定义；D61、C42）；受保护位置按字面与 `realpath` 两种形式比较（同节）；S1 为路径分类，T3 以访问时的 S2 为主防线；Tower 不提供 `grep`/`find`/`ls`，塑形与评审只激活 `read`，不检查 `rg`/`fd`，同名内置工具在 Tower 中不生效；上下文文件只能由人在人工编辑检出中修改，代价是 Agent 不能修改它们；写回失败时任何分支都不留下 `syncing`：来源不在时以 T1 重新物化，还原未完成时转入情形 E 的重建，生成 `stalled{write_back_failed}`，交还与带回都可再次执行；续写删除来源目录前比较其与 T1；还原取写回之前最近的检查点；`E_INTERNAL` 补写回失败；G46 补相对路径一次与文件工具一组；命令回执由 P2 夹具另发命令测量，steer 在浸泡的真实 Pi 目标中测量 | ADR-220 |
| `11` §11.3.1 文件辅助进程“每个 Run 一个，由 Tower 启动与终止”、“内存计入该 Goal 的 Engine Host”，上限与超时没有取值；`13` §13.8.1 Engine Host 一行把它写作“只做文件读写的小程序”并计入本行；`11` §11.7.1 残余中 bash 的截断输出全文“指向 $TMPDIR/tower-<goalId>/（随 Goal 清理）”，`07` §7.2.2 “Pi 的临时文件会被清理”；G46 (4) “文件工具改写 docs/agents.md 按 edit.protected 询问，人批准”，(be)(1) “Agent 每次调用扩展版 read 都出现审批卡”；`06` §6.4.3 写回失败的带回出口“此时前置条件都成立”，③ 中仍在的卫星“移到一边、不删除”而不先于置重建标记，② 只还原 written；`10` §10.8.3 删除检验目录时中断“重启时 Tower 直接删除它”；`10` §10.8.4 第 6 步“接管期间它就是第 1 步的检查点 k”；`10` §10.2 “Tower 也不自行改名”而写回失败与续写引用它的改名保留 | 辅助进程是每次文件操作一个的一次性子进程，上限 16 MB、超时 10 s（`11` §11.3.1 使用时强制唯一定义，`16` §16.2.8），内存计入进程树预留（`13` §13.8.3）；全文文件在 Host 的系统临时目录中，S2 下 Agent 读不到，观察器复制为证据之后删除它；S2 必然拒绝的文件工具访问直接 forbid、不出审批卡（`11` §11.3.1），G46 (4) 改为被拒绝、只列 `.NPMRC`，(be)(1) 改为确认卡写不生效、调用的是 `<sdk:read>`；带回重建进行中返回 `E_STATE`、重建树不等于 pin 时经 I2 转入验证；③ 先改名保留卫星、再置重建标记；② 还原整个写回集合；写回成功之后来源目录不删除（第 100 轮起，`10` §10.2 “人的工作现场不自动删除”，ADR-228；此前为删除之前与 T1 比较）；接管期间只用检查点 k，写回失败时 k 不一定是最新的；`10` §10.2 定义 Tower 自动改名保留的两处 | ADR-221 |
| `11` §11.3.1 文件辅助进程“每次文件操作一个的一次性子进程”、“图像检测只取前 4100 字节”，`read` 一次起三个进程而没有开销预算，“反复失败表现为反复失败的工具调用”由 `07` §7.7.1 检测，写入被杀之后的工具结果只写原因，S0 下上限与超时未写；`11` §11.3.1 S2 下文件工具读取凭据按必然拒绝只记 chip，`00` §0.5.1 “Tower 也不为此出审批卡”，`04` §4.10.2 凭据审批卡“且只在批准能起作用的地方出现”，`11` §11.6.2 经批准的目标“且目标在该次批准所列的路径之中时”、“所以这一条实际只作用于 bash”，G46 `~/.aws` 一组“S2 下按必然拒绝直接 forbid、不出现审批卡”；G46 文件工具一组“另一次由后台进程完成同样的换法后再” `read`，C42 (d) 以 `sleep 1` 放到后台换链接；`09` §9.12.4 “终态 Goal 仍留有的这类目录有四种”，“清除全部”与回退位置只保留 `_human` 与 `_inspect`，bash 全文文件“复制为证据之后即删除”只按 `full_output_path`，codemode 的 `execute.ts:340` 写作图像；`10` §10.2 “不经人点击而改名的只有两处”、“而上述两种来源中都没有未交还的改动”；`04` §4.6.7 “原来的工作目录改名保留在” <路径> 无条件；`13` §13.11.1 “交还：一次 add -A 比较”；`06` §6.1.6 卫星丢失一行不排除 `syncing`；`08` §8.4 `write_back_failed` 在“继续”之后不关闭 | 一次 `read` 一次启动、`write` 一次、`edit` 两次，开销预算与回退在 `13` §13.11.1、SP6a A3 测量；M1 不另行检测反复失败；写入中途失败时工具结果写“文件可能已部分写入”；S0 下 16 MB 适用、10 s 不适用（`11` §11.3.1 唯一定义）；读取凭据不论经文件工具还是 bash 都出同一张 `secrets.access` 审批卡，S2 下写明批准也不会让沙箱允许；经批准的目标按字面与 `realpath` 两种形式只认相等（`11` §11.6.2）；G46 与 C42 的换链接由测试构建的钩子在分类之后、辅助进程启动之前完成，调用前已换好的一组按必然拒绝或凭据审批卡；清除从不删除四种 `<goalId>.kept-*` 并列出，两种位置相同；观察器按 `details.fullOutputPath` 与错误文本末尾的路径校验后删除（`07` §7.2.2）；codemode 的 `:340` 为文本溢出、`:369` 为图像；Tower 自动改名保留有三处；`syncing` 的 Goal 不触发卫星丢失一行；`write_back_failed` 随此后的 `goal.resume`/`goal.take_over` 关闭 | ADR-222 |
| `11` §11.3.1 伪代码只在卫星之外一支附加读取凭据（“若命中密钥路径表 → secrets.access”），读取凭据一条的“S2 下这张卡（不论来自文件工具还是 bash）写明”对每张 S2 卡都写同一句，与第 3 条硬底线的先后未写；文件辅助进程的缓存“调用结束或中止时丢弃”而没有按调用作用域，S0 下“读取前按文件大小”判定 16 MB；`07` §7.2.2 观察器超时与中止时“只取 Pi 附在错误文本末尾、状态行之前的”路径、“删除前校验它是”临时目录的直接子项（复制之前不校验），`05` D61 “超时与中止时只在错误文本中”；`08` §8.8 `write_back_failed` 的“你的副本仍在原路径，处置只是确认”与没有命令承载的“知悉”，§8.4 “时以 obsolete 关闭——按这些事件判定”；`06` §6.1.6 卫星丢失一行只排除“运行时 ③ 持 wtLock 期间自己的改名产生的文件系统事件不触发本行”；`13` §13.11.1 预取的“准备中 · 预取”与重启清理“完成前相关 Goal 显示”一句，`07` §7.4.3 “Goal 启动时在 preparing 下”显示预取；`04` §4.6.7 “这类改名保留的目录（副本与原来的工作目录”，§4.15 隐私清除确认框“人工编辑与检验目录，以及数据库备份的过期日期”；S2 对硬链接没有规则 | 读取凭据卫星内外同一规则，伪代码对 `read` 与 `edit` 的读取一侧命中密钥路径表都追加 `secrets.access`；第 3 条硬底线先于例外；卡上的 S2 句子只在求出的读取路径都在 S2 读拒绝范围时写，其余 bash 凭据命令写批准后实际发生什么；无锚定的密钥模式的作用范围由第 96 轮改写（见下一行）；缓存按调用作用域，失败以不带 `code` 的错误抛出，S2 上限在字节流上执行（`11` §11.3.1 唯一定义）；S2 与同范围的沙箱拒绝创建硬链接，SP6a A3 与启动自检探测，未被拒绝时本机不使用 S2（`11` §11.6.2 唯一定义）；观察器复制与删除共用同一次校验（`07` §7.2.2；路径的来源由第 96 轮改写，见下一行）；`write_back_failed` 的“知悉”为 `needs_you.dismiss` → `informative`，不经出口的事件记 `obsolete`（`08` §8.8）；`syncing` 期间的事件都不触发、清除 `syncing` 的事务之后重新判定（`06` §6.1.6）；预取在验证时为 verifying 的 `预取`、Goal 启动时并入 preparing 的 `依赖`；重启清理的显示与命令按 `06` §6.1.6 后台进程一行；`保留的目录` 按 `10` §10.2 所列各处、各状态都显示；确认框列出 `.kept-*` | ADR-223 |
| `11` §11.3.1 密钥路径表“这些无锚定的模式只在卫星工作区中按跟踪状态匹配、在 Pi 资源目录中不论跟踪状态匹配”（跟踪状态没有来源），卡上的 S2 句子中“文件工具的这类调用都是如此”，先后括注“用户主检出与 _human、_inspect 中的 .env 一类不命中密钥路径表”；`~/.tower/**` 一项“沙箱外工具的路径检查中不含本 Host 的 stdio MCP 空目录与回退位置下本 Goal 的卫星工作区”（回退位置下文件工具与 bash 的分类没有除外）；`14` A3 “未跟踪 env 不可读”；`11` §11.6.2 硬链接一行的范围不含安装器、“在不支持写时复制的卷上本会硬链接，这时退回逐文件复制”，`06` §6.7 “完成之前不启动使用沙箱的 Run 与验证”（探测失败没有去向）；`06` §6.1.6 后台进程一行“在清理结束之后才准入”，`12` §12.6.4 “Run 在清理结束之后开始”；`07` §7.2.2 “取该调用最后一次 tool_execution_update 的 details.fullOutputPath”、“两者不同时不取”、“抛错之前还会再发一次”，`05` D61 “未截断时错误文本的末尾就是命令自己的输出”，`11` §11.7.1 残余与 `09` §9.12.4 的 MCP 与 codemode 文件“由系统清理临时目录”、bash 全文“含超时与中止的命令”由观察器删除；`10` §10.2 “不经人点击而改名的只有三处”，`06` §6.4.3 ③ “仍在原位的另一半在重建开始之前按同一规则改名”（一般路径的重建没有写另一半）；`04` §4.6.7 带回一侧的“可处理后再次交还（检验带回为再次带回），或放弃改动” | 无锚定模式在 Agent 写允许范围之外处处匹配并编入 S2（CA 证书包允许清单除外），之内只作分类，卫星的跟踪状态取自 base 树（`11` §11.3.1 唯一定义）；回退位置下本 Goal 的卫星工作区对本 Goal 的一切工具不因 `~/.tower/**` 命中（同处唯一定义，§11.3.4 (2) 与 `10` §10.4.3 引用）；硬链接与钥匙串两行的范围含安装器的安装阶段（钥匙串一行的清单）；pnpm 配置 `clone-or-copy`、不受影响；启动探测按四种档位模板，有结果之前经单一启动点与准入检查 h 等待（`ready{slot}`），出错或超时按未能确认拒绝转入 S0，原因写“本机的沙箱未通过启动自检（硬链接）”，结果翻转时解除 `s0_grant_pending`、重算三要素（`06` §6.2.4、§6.7）；清理结束指终止的一轮完成；每个 Host 进程一个临时目录 `~/.tower/tmp/<hostId>/` 作为 Host 的 `TMPDIR`，与 stdio MCP 空目录同一生命周期，bash 的 `TMPDIR` 由 `bashEnv` 另设（`05` §5.3.6 唯一定义）；观察器只按 `tool_execution_end` 的最终 `details.fullOutputPath` 复制，未复制的文件随 Host 的临时目录删除（`07` §7.2.2）；情形 E 重建之前仍在原位的另一半改名保留、从不删除（`10` §10.16.2 唯一定义，§10.2 四处） | ADR-224 |
| `10` §10.8.4 第 5 步的写回集合只按路径排除本地文件清单中的机密文件与被忽略的路径（人放进人工编辑检出、既不在清单中也不被忽略的凭据形文件写回卫星）；`11` §11.3.1 密钥路径表的作用范围 (ii)“这里名字形如凭据的文件只会由 Agent、它运行的工具或你交还时写入”，§11.8 私有数据“之内名字形如凭据的文件只由 Agent、它运行的工具或你交还时写入”（未计交还与沙箱外工具），S0 下“检查密钥路径表中的路径是否存在且当前用户可读”；§11.3.3 第 3 条“对 bash 由 S2 保证，§11.6.2；对沙箱外工具见”（bash 读取 Host 临时目录中的文件归读取凭据、出单向门卡）；`06` §6.2.4 准入“或收到新请求时重新计算”（不含检查 h 的解除事件），§6.1.6 后台进程一行“存在未结束 Run 的 runs.process_token”与 §6.1.10 崩溃恢复“（未结束的 Run，以及有未解决”（只重启 Supervisor 时也终止存活 Host 中的 Run），§6.7、`11` §11.6.2 与 `13` §13.11.1 的“四种档位模板”与“每次 Tower 启动，后台一次”；`07` §7.2.2 超时、中止的证据仍按全文标注，`04` §4.7.3 日志“读取验证器或命令的完整输出文件”，`16` §16.3 `O` “打开所选输出的完整日志”；`11` §11.6.4 “Tower 每次启动时清空，ADR-155”，`16` §16.2.2 与 `10` §10.1.2 “Supervisor 每次启动时清空该目录”，G44 (c) “重启后 ~/.tower/tmp/ 为空”，`06` §6.6.4 `tmp/` 一行没有存活 Host 的例外；`07` §7.6.6 “只有未跟踪/被忽略的 env 文件与密钥路径表中的路径对 Agent 读拒绝”；`16` §16.2.2 与 `11` §11.7.0 单一启动点“只保证将来能在一处加入调度约束”；`06` §6.4.3 ③ 一半改名成功时“按改名成功处理：置标记、重建”（先置标记、后改名另一半）；`10` §10.16.2 未解除的外部改动“它们的外部内容随旧卫星丢失”（只丢 gitdir 时不成立）；`14` §14.3.4 顺延规则的同步清单“00、14 §14.1 与本节同步”，以及 M1 的 38 周、第 34 周末冻结、2027-07-30 与 M2 的 2027-11-05 | 交还与带回的写回集合另排除名字形如凭据、base 中未跟踪的路径，它们留在人工编辑检出或检验目录中并在结果中列出（`10` §10.8.4 第 5 步唯一定义）；写允许范围之内这类文件由 Agent 与它运行的程序写入，沙箱外工具写入的除外，三要素在加载了沙箱外工具时计私有数据为真，S0 下按显式条目判定（`11` §11.3.1、§11.3.4、§11.8）；文件工具与 bash 求出的路径先判第 3 条硬底线、再查密钥路径表（`11` §11.3.3 唯一定义）；准入在探测有结果与重启清理完成时重算，重启清理的终止范围是 Host 已不存在的 Run，探测结果按本机、开机会话与运行时版本缓存，检验检出与验证器同一档位、探测三种档位（`06` §6.1.6、§6.2.4、§6.7）；超时、中止与无退出码且曾被截断的命令证据标为“截断的输出（尾部）”（`07` §7.2.2）；临时目录的清空都保留存活 Host 的目录；卫星中的 env 文件按密钥路径表的作用范围；单一启动点的唯一约束是启动闸门；先改名另一半、再置标记；M1 为 39 个日历周（第 35 周末冻结，2027-08-06 退出，M2 至 2027-11-12），同步位置以 `14` §14.3.4 为准 | ADR-225 |
| `06` §6.1.6 与 `11` §11.7.0、`16` 即时投递目录一行的启动清理“Supervisor 每次启动时清空它”“Supervisor 每次启动时清空。”“消费进程结束即删；启动时清空”“退出即删除，启动时清空”“Spotlight 排除，启动时清空”（只重启 Supervisor 时删掉存活 Host 的云 SDK 凭据文件）；`06` §6.1.6 drain 一行无条件的“Host 已随 main 退出；Run 已结束时不再写”（Host 存活时没有去向）；后台进程一行的“重启后终止范围的唯一定义”与复述“Supervisor 或 Host 重启后，对”“Supervisor 或 Host 崩溃后重启时”“所列 Run（未结束的 Run 与有未解决”“重启清理（未结束的 Run 与有未解决”“覆盖未结束的 Run 以及有未解决”（Host 崩溃而 Tower 仍在运行时，崩溃 Run 的进程不在范围内）；`06` §6.2.4 准入“或某 Goal 的重启清理完成终止的一轮时重新计算”（不含检查 d、g 的解除事件）；`06` §6.7 探测缓存键止于“Supervisor 所用沙箱运行时的版本）记入自检日志”，“存活 Host 中的沙箱档位与之对应”“两次启动之间结果翻转时”“启动时重算各 Goal 的致命三要素”；`10` §10.8.4 第 5 步“且在该 Goal 的 base 中未被跟踪的路径同样排除”（字面上含被忽略的路径与清单中的文件）；`11` §11.8 私有数据“按能写计，私有数据为真”，§11.3.4 残余“致命三要素在加载了沙箱外工具时把私有数据计为真”，`00` §0.5.1 “所以加载了这类工具的目标在致命三要素中按”，触发率表“仅当 worktree 有未忽略”“仅当有可读”，T7、T26 与 §11.3.4 末句“未加载能写文件系统的沙箱外工具”“是否加载了能写文件系统的沙箱外工具”，§11.3.1 作用范围 (ii) “§11.8 三要素按此计”；`11` §11.3.3 分类的先后“必然拒绝返回文字中的重定向一句”（对 MCP 的全文文件不对路）；`07` §7.2.2 “错误文本带 Full output: 一行”（按子串匹配），`00` §0.5.1 “这些情形下 Pi 不交回全文文件的路径”“它的临时目录（$TMPDIR）下的文件”；`14` W4 第 97 轮摘要“探测结果按本机与开机会话缓存”，增人备选“全部工作超过 130.02 人周”（已越过） | 交给 Engine Host 的即时投递为 `run/<hostId>/`，与 `tmp/<hostId>/`、`mcp-cwd/<hostId>/` 同一生命周期，启动清理只删除不属于存活 Host 的投递（`06` §6.1.6 唯一定义）；drain 一行的崩溃规则限于 Host 已不存在，Host 存活时续做 drain；终止范围含 Host 退出时尚未结束、因而以 crashed 结束的 Run，Tower 运行中 Host 退出或挂死之后先终止一轮（挂死的 Host 先终止，进程树 ∪ 令牌），复述只引用该行；准入在资源预留、端口段释放与内存压力回落时重算；探测缓存键含 Tower 的版本与三种档位模板的哈希，档位按 Run，翻转处理在新结果写入时；写回集合的凭据形排除只针对未被忽略、不在清单中的路径（第 100 轮起副本一律保留、不再按它改名，ADR-228）；沙箱外工具不计入三要素的私有数据，改为一行中性的风险说明（`11` §11.8 唯一定义），触发率表按判定规则推算；T7、T26 按是否加载了沙箱外工具分档；MCP 与 codemode 的全文文件改用“以更窄的参数重新调用”；截断标签按 Pi 的后缀匹配、按是否得到全文推导；增人备选为 34 周（2027-07-02），取整规则见 `14` §14.3.4 | ADR-226 |
| `06` §6.1.6 后台进程一行的第二类“其后尚无新 Run 开始的 Run 的令牌”（没有结束条件：不再开 Run 的 Goal 每次冷启动都再做一轮），“终止后对所属 Goal 补”（一轮什么也没终止时是否补、是否注入未写），§6.1.3 的“对该 Host 中各 Run 的令牌做终止的一轮”（与唯一定义的跨 Goal 并集不同），§6.2.4 准入“某 Goal 的重启清理完成终止的一轮”“探测与重启清理两项是检查 h 的解除事件”（不含运行中的一轮），§6.1.10 扫描频率“只在 settle 终止、重启清理、以及 watcher 检测到来源不明写入时”（漏运行中的一轮），`12` §12.6.4 实况行“重启后清理上一次 Run 的残留进程”（`清理中` 只写给冷启动）；`05` §5.3.6 凭据一行“Pi 在 ai/src/env-api-keys.ts 中读取”（不是 coding agent 的判定路径），`11` §11.7.1 “只把指向文件的变量传到”（只有文件变量时 Pi 判 Bedrock 为未配置，区域与 location 被删除）；`11` §11.3.4 “可以授予按工具名的 Goal 级授权，不需要双确认”（无条件），ADR-226 与第 98 轮回应的“沙箱外工具的每次调用仍逐次 ask”（按工具名授权之后不成立），`00` §0.5.1 “所以合同编辑器对会加载这类工具的目标另显示一行风险说明”（比 `11` §11.8 窄）；`10` §10.8.4 第 5 步“它们是第 0 步的提示请你复制进来”（对人新建的被忽略文件不成立），`04` §4.6.7 “想让这个目标提交其中某个文件，先把它移出本地文件清单”（对凭据形文件无效），`12` §12.12 “名字形如凭据、不在 base 中的新文件以灰字”（不含删除）；`14` G46 (bj) “写明该路径不向 Agent 开放并给出重定向的做法”（对 MCP 全文文件不对），(bl) “另放一个被 git 忽略的 secrets/dev.pem”，(bm) “另一组在手机上对同一合同 quick_ratify”（属 M2 而未标）；`04` §4.15.1 “添加与移除在本机与网页端可用；”（网页端属 M2、机密条目只在本机移除）；§14.1 与结论中的 M3 “2027-12”（由 lint (C) 按 M2 结束日期加 12–14 周核对） | Tower 运行中 Engine Host 退出或挂死之后的一轮只取该 Host 承载的 Run（打包模式下含其上各 Goal），第二类令牌在带其 runId 的 agent_bg_done 检查点写入后移出范围，每一轮完成都补检查点、什么也没终止时不注入，`清理中` 与 `E_BUSY` 对运行中的一轮同样适用，准入与扫描时机列入它（`06` §6.1.6 唯一定义）；Pi 经 models.ts 与各 provider 的 resolve 判定，云 SDK 凭据以文件提供时总带 AWS_PROFILE，区域、项目与 location 原样传入、缺区域时补 us-east-1，原始值没有刷新途径（`11` §11.7.1 唯一定义）；不可信内容与对外通信都为真时 tool.external 不提供按工具名的授权、编入时排除，否则授权选项上方显示风险说明（`11` §11.3.4 唯一定义）；被忽略的文件不交还、留在副本中，副本不自动删除（第 100 轮起，`10` §10.2，ADR-228），凭据形夹具的交还途径如实写出（`10` §10.8.4 第 5 步）；G46 (bj) 按文件类型分写、(bm) 手机一组标 M2；M3 至 2028-02 | ADR-227 |
| `10` §10.2 表中人工编辑检出“交还后删除”，`06` §6.6.1 目录树同句，`04` §4.6.7 “然后删除检出”“确认后删除检出”，`04` §4.6.6 第 6 步“停止服务、回收端口段、删除目录”，`10` §10.8.4 第 2 步“本 Goal 自己的残留可由人移到一边后重新开始”，§10.8.3 第 7 步“删除检验目录时中断”与“按同一删除前比较处理它”，第 5 步“随目录删除，不触发下述改名保留”与人新建的被忽略文件“主检出与工作目录中都没有”，`04` §4.6.7 与 `12` §12.12 的“副本将改名保留”，`13` §13.11.1 “两次求树（求 T1 与删除前比较”（Tower 在交还、放弃、带回与关闭检验之后删除人的副本，并以删除前的比较与写回集合中的触发条件决定去留）；`11` §11.7.1 “Tower 写入的投递文件取写入时所用的 profile 名”（未限定名字，且 `AWS_PROFILE` 与原始密钥并存时与 Pi 不同），`05` §5.3.6 首次运行“只取变量名并与 provider 对应，不记录值”（非机密配置变量的值无处可取），`06` §6.2.4 “云 SDK 凭据只传指向文件的变量”，`11` T33 “云 SDK 凭据只以指向文件的变量传入 Host”；`08` §8.6.1 `hostExpected` 自“本 Supervisor 进程 spawn 了该 Goal 的 Engine Host”起（准备阶段计入看门狗，与 120 s 准备时限相撞）；`10` §10.7.1 第 2 步“settle 的 agent_bg_done 与人工决定类的非回合入口除外”（漏终止一轮补的检查点）；`06` §6.1.6 后台进程一行“已归档、没有卫星的 Goal 不在此类” | Tower 从不自动删除人工编辑检出、检验目录与 `.kept-*`：交还、放弃、带回、关闭与验收或放弃之后它们脱离并原样保留，再次接管或打开检验时先改名，Goal 页与存储面板列出并由人经 `goal.delete_kept`（仅本机）删除，确认框先列出将丢失的内容（`10` §10.2 唯一定义）；写回集合的排除不变，只决定什么进入 T1（`10` §10.8.4 第 5 步）；AWS 原始密钥与 `AWS_PROFILE` 并存时同 Pi 用原始密钥，投递文件用保留的 `tower-<hostId>`，区域在每次 Host 启动时判定，非机密变量的值记入密钥库并随“重新读取”更新，Azure 与 Cloudflare 的配置变量原样传入 Host（`11` §11.7.1 唯一定义）；挂死的计时自准备握手完成起，准备阶段只由 120 s 时限判定（`08` §8.6.3 唯一定义）；第 2 步的去重例外只引用上文，含终止一轮的 `agent_bg_done`；第二类豁免为已归档或没有卫星的 Goal | ADR-228 |
| `04` §4.6.7 写回失败一段“只在写回成功、且副本内容与交还时相同时才删除它”，§4.7.3 证据面表人工编辑检出一行“交还（交给 Agent 继续 / 直接重新验证）时按文件同步写回并删除”与检验目录一行“关闭检验或目标验收 / 放弃时删除”，§16.5 `inspect.close` 一行“删除人在检验目录中的修改”，`06` §6.6.4 卫星一行两种检出的删除时机“（及其引用的 §10.8.3、§10.8.4）定义”（ADR-228 之后仍写 Tower 删除人的副本）；`10` §10.8.3、`04` §4.6.6、`06` §6.4.3 的检验关闭选项“保留目录，稍后决定”（另外两项同样保留目录）；`06` §6.4.3 `inspect.bring_back` 的前置条件检验检出“存在”、写回失败之后“检验目录存在、无”与 `inspect.close` 的“检验目录不存在”（已脱离的目录也满足）；`11` §11.7.1 区域第 ③ 步“这与终端中的 Pi 相同”（只有原始密钥时 Pi 按模型端点取区域）；`11` Engine Host 环境一行“其余一律删除”（漏列 `05` §5.3.6 表中的代理、`GIT_CONFIG_*`、端口与 Tower 标识）；`10` §10.4.4 人的工作现场“合计（逻辑大小）超过 10 GB”（阈值用了仅用于显示的口径），`13` §13.11.3 “实测由 M1 自用期回填（14 E6）”（E6 不计量累积），`06` §6.8 F8 的“清理建议（scratch、旧 worktree）”（不指向人的工作现场）；`08` §8.6.1 `hostExpected` 的“本 Supervisor 进程为该 Goal spawn 的 Engine Host”（不含打包模式中加入的已有 Host）；`11` §11.3.4 代价一段“对该 Goal 不加载 MCP（高风险 Goal 默认如此）” | Tower 从不自动删除人工编辑检出、检验目录与 `.kept-*`，`04`、`06`、`16` 各处只引用 `10` §10.2 “人的工作现场不自动删除”；`inspect.close{modified:"discard"}` 只放弃带回、目录保留；检验关闭的第三个选项为 `[稍后决定是否带回]`；“使用中”只在 `10` §10.2 定义（`humanCheckout.path`、检验打开中、以 `keep` 关闭待处理），带回与关闭检验要求检验目录使用中，`goal.delete_kept` 与进行中的接管、打开检验互相返回 `E_BUSY`；带 `AWS_PROFILE` 时才补 `us-east-1`，只有原始密钥、没有区域时与终端的差别如实登记，以头部发送的令牌在 M1 中不提供（`11` §11.7.1）；Host 环境的其余变量按 `05` §5.3.6 的变量表；阈值按估计独占大小，存储类通知的呈现只在 `08` §8.1 “存储提示”，磁盘压力与磁盘满的建议先列人的工作现场，每周的累积与复审线在 `14` E6；看门狗对加入已有 Host 的 Goal 同样从其准备握手完成起计；出口为把该 Goal 设为高风险 | ADR-229 |
| `11` §11.7.1 少见配置“与终端相同，Tower 传入的变量随之不起作用”（Tower 的运行时注入先于 `pi /login` 存储的凭据，对 bearer 令牌一支不成立）；`11` §11.7.1 模型凭据一行“（ANTHROPIC_IDENTITY_TOKEN_FILE 与配套的 id，anthropic.ts:49-69）同样不提供”（没有理由）；`05` §5.3.6 白名单一行“用户显式放行的变量”（没有定义），`11` §11.7.1 Engine Host 环境一行“变量表中 Host 列为 ✔ 的其余各行”（漏掉 `GIT_CEILING_DIRECTORIES`），`05` §5.3.6 端口与 Tower 标识两行 Host 一列为 ✔；`08` §8.1 存储提示“已查看只是 Supervisor 的进程内状态”（没有协议落点），`08` §8.6.1 `hostExpected` 只在 Host 进程退出时清除；`10` §10.1.2 提交数只沿 `tower-human/<goalId>` 一条分支数、“遇到不在其中的对象”即停，`10` §10.2 确认框的提交数“照常求出，读不出时写”`无法读取`（求值失败没有回落）；`06` §6.4.3 `inspect.close` 的“含已脱离与不存在”；`06` §6.8 F8 的“L3 横幅和清理建议”（F8 没有对应的 Needs-You）；`14` E6 复审线“合计在 4 周内超过 30 GB”（窗口不明），§14.4.1 “只由人逐个删除” | Tower 只在 `auth.json` 中没有该 provider 的存储凭据时注入导入的密钥，用哪份凭据与终端相同，`ANTHROPIC_AUTH_TOKEN` 与 `ANTHROPIC_API_KEY` 并存时如实标注，bearer 令牌与原始密钥并存时只注入令牌，工作负载身份联合推迟到 M2 是范围选择（`11` §11.7.1）；Host 环境的变量只在 `05` §5.3.6 “Host 环境的变量”一行列出（含 `GIT_CEILING_DIRECTORIES`，没有用户放行的一类），端口与 Tower 标识只经每个 Run 的 `bashEnv` 传入；“已查看”是界面状态，条件随 `system` 主题推送，设置入口最多一枚 `◇`；`hostExpected` 在 Run 结束时清除、每个 Run 的 `run.started` 时重新置位；提交数遍历 H/.git 的全部 ref、按已知提交 id 停止，写 `至少 N 个提交` 或 `200+ 个提交`，交还对话框用同一取法；求值失败写 `无法计算，删除前请自行检查` 而删除仍可用；使用中而检验目录已不存在时关闭照常结束检验、带回返回 `E_STATE`；磁盘满是应用级横幅，不是 Needs-You；E6 按每周计量时的存量判定；人的工作现场由人逐行或多选删除 | ADR-230 |
| `11` §11.7.1 模型凭据一行“有存储的凭据（/login 的订阅或密钥）时不调用”（按 `auth.json` 条目是否存在判定：`$VAR` 与 `!` 命令的条目被当作已有凭据，漏了 `models.json` 一层）与“正在进行的 Run 仍用已注入的密钥，下一个 Run 起改用存储的凭据”（打包模式与 Run 中途 `/logout` 时不成立），首次运行与模型选择器的“已有 pi /login 的凭据，Tower 用它”，`05` §5.3.6 SDK 一条“该 provider 有存储的凭据时 Tower 不注入导入的密钥”与首次运行“已有 pi /login 的存储凭据时写明 Tower 用它”，`04` §4.18.1 第 2 步“导入的密钥只在没有存储的凭据时使用”；`06` §6.2.4 准入链拼装 Host 环境时的复述“ADR-055 的端口段与 ${port:N} 模板”（端口不在 Host 环境中）；`05` §5.3.6 ① 工具链变量“取自登录 shell，有值才传入”（首次运行不记录这些值）；`11` §11.7.1 云 SDK 凭据链“Azure 配置目录（AZURE_CONFIG_DIR）等”（Pi 不读取它，列表因“等”而开放）；`05` C21 的“Tower 构造的基础环境”（与 §5.3.5 `mcpBaseEnv` 不一致）；`08` §8.1 存储提示“侧栏收为 48px 细栏时不显示”与“条件解除之后再次成立时重新显示”（不按条件分别记）；`06` §6.4.3 `inspect.open` 的“已存在且仍在使用中”（目录已不存在时照字面会新建第二个检验）；`06` §6.8 F8 的“对活跃 Run 走 drain；数据库切换为只读”（没有暂停原因与解除条件）；`10` §10.1.2 提交数“所以人照 §10.2 自行 repack 之后结果不变”（对以镜像中提交为起点的 ref 偏强）；`14` G46 “交还对话框写 1 个提交”；`06` §6.1.6 “Pi 每次判定凭据都检查该文件是否存在”（引文是 Vertex 的 ADC）；`09` §9.12.4 “检验时带上了本地机密文件的检验目录另注明”（标注没有来源） | 是否注入导入的密钥由 Pi 自己判定：每次 Host 启动与每个 Run 之前以不带运行时覆盖的探查运行时的 `checkAuth` 询问，凭据来自你的 Pi 配置（`auth.json` 的 OAuth 或密钥、`models.json` 的 `apiKey`）时不注入，结果为空或来自环境时注入，检查与注入按 Host 进行，Run 中途 `/logout` 之后的请求按 F7（`11` §11.7.1 唯一定义）；首次运行写 `已有你的 pi 配置中的凭据，Tower 用它`；`06` §6.2.4 只引用 `05` §5.3.6；① 的工具链变量与 `NODE_EXTRA_CA_CERTS` 在首次运行记录、随“重新读取”替换；指向文件的云 SDK 变量只有 AWS 三个与 `GOOGLE_APPLICATION_CREDENTIALS`；MCP 服务器的基础环境只按 `05` §5.3.5 `mcpBaseEnv`；存储提示的“已查看”按四类条件分别记，细栏中设置图标带不含文字的 `◇`；检验仍使用中时 `inspect.open` 按状态返回 `E_STATE`，不论目录是否存在；F8 以 `app_quit` drain、`outcome_reason` 为 `disk_full`，可用空间 ≥ 2 GB 时自动恢复可写与准入（`06` §6.8）；提交数沿全部父提交并从 `worktrees/*/HEAD` 起数，`repack` 之后对 H 起点之后的提交结果不变；交还对话框写 `至少 N 个提交`；Bedrock 的判定只看 `AWS_PROFILE`；`含本地机密文件的副本` 由目录本身求出 | ADR-231 |
| `06` §6.8 F8 解除一句“只有 app_quit 一个原因的 Goal 随之按 §6.1.4 第 5 项解除”与“Supervisor 其间重启时它们保持 paused(app_quit)”（与第 5 项、ADR-207 不一致），`14` G35e (q) “杀死 Supervisor 的一组两个 Goal 保持 paused(app_quit)、不自动继续”，`04` §4.18.3 “运行中的目标卡片 已暂停 · 磁盘已满 · 释放空间后自动恢复”（复述且不带条件）；`12` §12.8 “同一时刻屏幕上至多一个自动出现的覆盖层”（比 `08` §8.10.5 更严，把提示条也算在内）；`05` §5.3.6 代理一行“模型请求经 undici 的 EnvHttpProxyAgent 发出”（Pi CLI 入口上的行为，SDK 嵌入的 Host 中不成立），凭据一行“GOOGLE_APPLICATION_CREDENTIALS、Azure 配置目录等”（Pi 不读取，列表因“等”而开放），Pi 运行开关一行“所以 Host 不因它们重启”（扩展集合不同的 Run 不在同一 Host 上开会话）；`11` §11.7.1 “首次运行与模型选择器对凭据来自你的 Pi 配置的 provider 写明”、`05` §5.3.6 首次运行“Pi 判定该 provider 已有来自你的 Pi 配置的凭据时写明 Tower 用它”、`04` §4.18.1 第 2 步“Pi 判定该提供商已有来自你的 Pi 配置”（没有求值进程，首次运行在任何 Host 之前），`11` §11.7.1 “配了 apiKey 时不注入”（`$VAR` 形式而 Host 中没有该变量时注入）；`10` §10.2 租约只读的条件“且仍在租期内”（过期而未接管的一段没有写），`14` G46 “租约的一组该目录标 另一台 Tower 正在使用”（同一台机器上应为同机写法）；`14` §14.3.4 结论“各线的 QA 都在第 31–32 周结束”（设计线的 QA 延入第 33 周） | 磁盘满的解除对原因含 `app_quit` 且最后一个 Run 的 `outcome_reason` 为 `disk_full` 的暂停中 Goal 按 §6.1.4 第 5 项移除 `app_quit`，集合由数据库求出，只读期间 Supervisor 启动时先复查空间，进行中的验证取消并在解除后以同一 pin 重跑，准备阶段中止并重新准入（`06` §6.8 F8）；卡片的 `自动恢复` 只在 `resumeOnLaunch` 打开且 `app_quit` 是唯一原因时写（`12` §12.6.5）；覆盖层的数量与共存只按 `08` §8.10.5；Host 有代理变量时自己安装读代理变量的分发器，Pi 设置中的 `httpProxy` 不读取（`05` §5.3.6 代理一行）；指向文件的云 SDK 变量只有 AWS 三个与 `GOOGLE_APPLICATION_CREDENTIALS`；打包只合并扩展集合相同的 Goal（`06` §6.1.1 打包的分组）；标注取自 Host 的检查，尚无结论时写 `第一次运行时由 Pi 判定：…`，扩展注册的 provider 不注入（`11` §11.7.1）；租约只读到本机接管为止；G46 的同机一组标 `另一个 Tower 安装正在使用`；设计线的 QA 延入第 33 周约 0.04 周 | ADR-232 |
| `05` §5.3.6 代理一行“Host 环境中有代理变量的，在任何模型请求与 MCP 连接之前”与 C43 “Host 环境中没有代理变量时 Tower 不安装分发器”（Pi 的每个入口都无条件安装，并带固定的选项与空闲超时）；`11` §11.7.1 “Host 的第一个会话创建之后（扩展在此时注册）、第一次请求之前再做一次这一步”（加载之后的注册不在其中）、“只覆盖 baseUrl、依赖 shell 中密钥变量的扩展在 Tower 中判为未配置”（任何以内置 provider 的 id 注册的扩展都如此）、“Supervisor 只在内存中保留最近一次”（标注随最后报告的 Host 翻转），`05` §5.3.6 首次运行与 `04` §4.18.1 第 2 步“之后模型选择器按最近一次 Host 的检查写明”；`06` §6.8 F8 “复查发生过 ENOSPC 的卷”（只读启动的新进程中这一集合为空）与“Supervisor 在此之前重启时按 §6.1.6 的同一规则进入”（Host 存活时没有对应的恢复行）；`12` §12.6.5 “resumeOnLaunch 打开且 app_quit 是唯一的原因”（漏了同样解除的 engine_crash），`04` §4.18.3 应用退出一行“（resumeOnLaunch 打开时；关闭时见第 4 列，ADR-207）”（自写条件）；`12` §12.6.5 叠加原因的示例“另有：预算硬上限”与 `04` §4.6.7 “交还后仍暂停：预算硬上限”（与原因表的写法不同），`14` G35e (q) “多原因的一组卡片写 已暂停 · 磁盘已满、没有”（缺叠加原因的后缀） | Host 启动时总是安装与 Pi 相同的分发器（HTTP/1.1、连接尝试时限 2 s、空闲超时取 `httpIdleTimeoutMs`、`undici.install()`，只用 Pi 所依赖的那一份 undici，`05` §5.3.6 代理一行）；扩展注册的 provider 在每个 Run 的会话创建之后与适配器每次投递之前读取，列出过的在该 Host 退出之前不再注入，结论有第三种 `由扩展处理认证`，标注取服务该目标的 Host 的结论（`11` §11.7.1）；复查 `~/.tower` 与各 `<wtRoot>` 所在卷，只读启动时中止存活 Host 中的 Run、结果由 §6.1.6 “Run 中崩溃” 一行求出，准备步骤的 `ENOSPC` 归 F8（`06` §6.8 F8）；`自动恢复` 的条件为按第 5 项解除之后没有剩余原因（`12` §12.6.5）；`硬预算上限` | ADR-233 |
| `06` §6.1.4 第 5 项鉴权检查“getAuth 没有凭据时返回 undefined 而不抛错”（引的是重载签名；刷新、密钥求值或存储失败时拒绝）且没有写探测的进程；`05` §5.3.6 代理一行的空闲超时“在 Host 启动时读一次，之后的改动从下一个 Host 起生效”（Pi 的 SDK 每次请求另读该设置）与 C43 “一个 40 s 不发响应头的测试端点的请求失败”（分辨不出分发器是否取了该值）；`11` §11.7.1 剩下的窗口“从注册起到下一个投递边界之前”（有更窄的读取点 `turn_start`），`14` G46 (d) 第十组“从注册后的下一个投递边界起不再注入”，第八、九组“第一个 Run 之后模型选择器写”（标注只在模型服务不可用、服务它的 Host 尚未退出时可见）；`06` §6.1.6 “Run 中崩溃” 一行“不论 Host 是否存活都按本行处理”（Host 已不存在时与同行规则冲突），§6.8 F8 “这次 drain 的目标留在 Supervisor 进程内”（进行中的写回、重建与接管没有去向），§6.4.3 “所以 syncing 只存在于本进程中正在写的有限时间内，以及崩溃到重启之间”（F8 的只读期间不成立）；`04` §4.7 “单目标简报、自动诊断”；`12` §12.13.3 横幅一行“出现时 assertive 一次，消失时不播报” | `provider_unavailable` 的探测只在 Host 中运行（同组已存活的空闲 Host，不为探测另起，ADR-235），`getAuth` 拒绝计为失败（`06` §6.1.4 第 5 项）；空闲超时两处读取、Host 存活期间的无效值按 F4b、C43 以 HTTP 类 MCP 的响应头超时断言分发器（`05` §5.3.6）；列表另在 tower-goal 的 `turn_start` 处理器中读取，窗口缩到一次模型调用（`11` §11.7.1）；标注的可见范围如实登记，G46 (d) 在 `为受影响目标切换模型` 中断言；F8 中止的 Run 只在 Host 存活时按 “Run 中崩溃” 一行取 `app_quit`，其进程立即按并集终止（`06` §6.1.6 “Agent 后台进程”一行）；待补失败出口列表（`06` §6.8 F8）；Project 不可达时不判为丢失（`06` §6.1.6，ADR-235）；`诊断视图`；横幅消失时 `polite` 播报 | ADR-234 |
| `06` §6.1.4 第 5 项探测的进程“按正常的 Host 启动路径为探测起一个短时 Host”“每个打包分组至多一个、只存在于一次探测的时长”（专用模式下的分组、自身失败、`!` 命令随每次新起重新执行、扩展以内置 id 覆盖时的误报）与“应用重启后探测从 60 s 重新开始”，`12` §12.6.5 与 `04` §4.18.3 “恢复后提示继续”“恢复网络后提示继续”；`05` §5.3.6 代理一行“两者中较小的起作用”（设置了 `retry.provider.timeoutMs` 时请求时限取它；每次请求另读的 `websocketConnectTimeoutMs` 无效时同一循环）；`06` §6.1.6 按卷名判别的一行“当前不是已挂载的卷”（Run 进行中卷消失、其余恢复行、隐私清除续做、情形 C/F、命令范围与同名卷都未覆盖），§6.8 F8 “复查中求不出剩余空间的卷”按不足计与 `12` §12.8 横幅“挂载它后自动恢复，不再使用该卷时请重启 Tower”，§12.13.3 “后缀追加与消失时”；`10` §10.16.2 情形 C “在最近打开过的目录与 Spotlight”中自动查找、情形 D “运行中的 Goal 不受影响” | 探测只在同组已存活的空闲 Host 中运行，不另起 Host；没有这样的 Host、provider 由扩展注册或 F8 只读期间不自动探测，卡片 `提供方可能已恢复？[重试]`（`06` §6.1.4 第 5 项，ADR-235）；每个 Run 校验会造成重试循环的设置，请求时限的先后如实写明（`05` §5.3.6）；一条 Project 不可达规则（第 108 轮起按 Goal 判定，ADR-236）：必需路径之一不可访问即中止该 Goal 的 Run、不执行其余恢复行、命令返回 `E_STATE`，可达后照常（`06` §6.1.6）；F8 复查不含不可访问的 `<wtRoot>`；情形 C、D 只由人处理（`10` §10.16.2） |
| `06` §6.1.6 Project 不可达一行按 Project 判定（“整个 Project 判为不可达”；多附着点、终态 Goal 的旧克隆与跨检出的连带都未定义），隐私清除一行“整条推迟到可达”（连同 `~/.tower` 中的副本，且对已删除的 Project 判定）；`05` §5.3.6 代理一行“适配器要求设置时为有限的非负数”（`retry.provider.timeoutMs` 的 0 与非整数仍是重试循环）；`06` §6.1.4 第 5 项“Host 的运行时不能代它判定”，`03` §3.2.1、`16` §16.1.1 “服务该 Goal 而仍存活的 Host”与 `04`、`12` “服务该目标的 Host 存活期间”（只是专用模式下的说法）；`04` §4.16 F12 “3 个目标将暂停，下次启动自动恢复”（不看 `resumeOnLaunch`）；`16` §16.2.6 “外接盘未挂载时其 Project 判为不可达”；`10` §10.4.3 “添加项目时计算一次”；`06` §6.2.5 “只在下述对账的差值中出现”与 `11` §11.7.1 “作用于这一次调用与下一次 turn_start 之前 Pi 发出的”压缩、摘要与缓存预热请求（`idle` 模式下预热在 settle 之后继续）；§6.8 F13 “工具被阻断（fail-safe）；连续 3 次则暂停”（`turn_start` 出错时没有工具被阻断）；`10` §10.16.2 情形 D “从远端克隆（normalizedRemote）到新位置并重新附着” | Project 不可达按 Goal 判定：只有必需路径（附着检出、`<wtRoot>`、人工编辑检出；由 ADR-238 改为必需路径只有根，人工编辑检出贡献它所在的 `<wtRoot>`，见下方第 110 轮一行）不可访问的非终态 Goal 冻结，终态 Goal 不冻结；失败先判可达；启动时的解除推迟到可达；清除按 `roots[].wtRoot` 判定根的可访问性；不可达期间允许 `goal.abandon`，绑定处理由 `project.relocate` 发起，重新克隆由你执行（`06` §6.1.6、§6.4.3，ADR-236）；`retry.provider.timeoutMs` 须为正整数且不超过 2147483647（`05` §5.3.6）；探测只在同组已存活的空闲 Host 中运行；退出确认框按 `resumeOnLaunch` 写（`06` §6.1.4 第 2 项）；必需路径不可访问时不判为丢失（`16` §16.2.6）；位置按附着检出计算、记入 `WorktreeRecord`（`10` §10.4.3）；预热用量在 `idle` 模式下可能不进入本 Goal 之后的对账，窗口按模式写明；F13 按处理器区分 | ADR-236 |
| `06` §6.1.6 隐私清除一行与 `09` §9.12.4 的推迟续做（“推迟的根随 30 s 的复查”“重新可访问时 Tower 续做”“数据库在全部完成之后才删除”；推迟期间 Tower 照常使用，续做会删除此后新建的数据），`06` §6.1.6 Project 不可达一行的出口“不可访问的根推迟并列出”与失败先判可达“先对该 Goal 的必需路径做本行的判定”（含验证不读的附着检出）；`13` §13.5 “命令的受理至多推迟约 5 s”（实为约 10 s）与“目标卷挂起时只多占该组一个线程”；`05` §5.3.6 代理一行“Codex 的计时同样只到响应头”（默认走 WebSocket）与 §5.6.5 故障保护“随后 extension_error 会触发一条 Needs-You sentinel”（Pi v1.2.0 的 tool_call 出错不发该事件）；`04` §4.8.11 示例“请先在 Pi 设置中改正再重试”；`03` §3.2.1 “该 Goal 不可达期间只有它可用”；`14` G35e (q) “结果列出推迟的根” | 清除一次完成、从不推迟：确认框列出不可访问的根，你接受后不触碰，记入库外的清除遗留清单只用于列出，重新可访问时由你一键删除（`09` §9.12.4，ADR-237）；`project.relocate` 把旧位置记入 `Project.settings.relocatedFrom`，供列出、删除与清除（`06` §6.4.3）；失败先判可达只判定该操作实际读写的路径（由 ADR-238 改为判定这些路径所在的根，见下方第 110 轮一行）；不可达期间的每一种自动解除都推迟；路径丢失的确认可结束旧路径上的人工编辑检出与检验检出；启动等待至多约 10 s；三项超时设置都不得超过 2147483647；F13 由 tower-goal 自报（`05` §5.6.5） | ADR-237 |
| `06` §6.1.6 Project 不可达一行的必需路径含人工编辑检出本身（“仍按原路径计”）与失败先判可达的叶目录（写回的来源目录与卫星、要物化的目录，验证“与 pin 所在的影子”），把根可访问而目录被删除也判为不可达（`human_checkout_lost`、写回失败 ① 的重新物化与卫星在写回中途消失的分支因此不可达，中断的写回与重建没有续做者）；`06` §6.1.6 ③ 与 `07` §7.4.1 “验证不读的附着检出”；`06` §6.4.3 两行的路径丢失确认“且它是该 Goal 唯一不可访问的必需路径”与 `12` §12.6.5 “只有人工编辑检出或检验检出不可访问时”（不按记录、不看 `syncing`）；不可达期间放弃 `syncing` 的 Goal 使 T1 随影子 gc 回收（第 109 轮回应“只能放弃，检验目录与影子中的检查点都保留”不完整）；`project.relocate` 无条件写入 `relocatedFrom`；`09` §9.12.4 清除遗留清单“只含根的路径与清除时间”而写入次序、列出范围（不限于已没有当前记录的目录）、移除与 `all` 档未写；`06` §6.8 F4 与 `12` §12.6.5 “启动时未自动解除后”；`05` §5.6.5 第 6 项只覆盖 `tool_call` 与 `turn_start`（`tool_result` 的重新抛出等于放行）；`07` §7.4.6 base 上以环境错误结束的运行计为失败 | 必需路径只有根（附着检出与 `<wtRoot>`），根之下的目录按所在的根判定，根可访问而目录不在按已有的丢失与失败分支；失败先判可达按根，判为中断时该 Goal 同时不可达，由 ④ 续做（`06` §6.1.6，ADR-238）；路径丢失确认按记录判定、结束对应记录、`syncing` 时 `E_STATE`；写回中断时放弃先以 `refs/tower/<goalId>/handback-t1` 保存 T1（`06` §6.4.3 `goal.abandon` 行）；`relocatedFrom` 只在 `<wtRoot>` 改变时追加、按 `wtRoot` 去重，迁回时改名保留，合并取并集；清除遗留清单只存 `[{wtRoot, at}]`、先于数据库事务落盘、只列出没有当前记录的目录、可从列表移除（`09` §9.12.4）；`◆` 只在因 `resumeOnLaunch` 关闭而没有自动解除时（`08` §8.6.3）；`tool_result` 脱敏处理器出错时返回隐去原文的结果（`05` §5.6.5）；base 运行的环境错误按无结论、判为 `introduced`、不写台账（`07` §7.4.6） | ADR-238 |
| `handback-t1` 只在放弃时写入（“在写放弃的事务之前，先在影子中写”）、保留到影子删除，确认框“Tower 保留一份（目标页写明如何取回）”而没有期限，写回失败 ① 的物化也失败时“你的改动未能保留在目录中，此后不可恢复”；`06` §6.6.4、`16` §16.2.6 与 `09` §9.12.1 的保留期摘要“30 天后只保留地标检查点、pin 与 seal ref”“只留地标检查点、pin 与 seal ref”（漏了 `handback-t1`）；`06` §6.4.3 `project.relocate` 行“人工编辑检出仍按原路径作为必需路径”；`10` §10.2 “Tower 不经人点击而改名的只有四处”；`10` §10.4.3 位置算法“若可创建且可写”（Tower 可重新建立已被使用过的根）；`05` §5.6.5 第 6 项 F13 的“任一 tower-goal 处理器正常完成一次即清零”与 C5 “任一处理器正常完成一次后计数清零”，自报条目为 `sentinel` 而没有检测器 id；占位结果“工具结果未能脱敏，已隐去”且不替换 `details`，脱敏只改 `content` 与 `structuredContent`；`07` §7.4.1 “准备的文件系统错误同样先判可达”与“准备与服务的文件系统错误”（非零退出不判可达），§7.4.6 的 `flake` Fact 先于失败先判可达写入，无结论的返工消息“base 上的确认未能完成（环境错误），按改动引入处理”；`08` §8.6.5、`06` §6.8 F4b、`16` §16.1.7、`04` §4.8.11 各自列出 `prepare_failed` 的来源（漏 F13）；`14` G35e Run 中卸载一组“`verifying` 的 Goal 没有 `verify.result` 与 Fact” | T1 在写回开始之前由 `refs/tower/<goalId>/handback-t1` 引用，只在写回成功时删除，否则不按时间删除，由你在存储面板删除或随清除删除（确认框列出）；写回失败 ① 的物化也失败时改动仍保存在 Tower 中（`06` §6.4.3 `inspect.bring_back` 行“T1 的保留”、`10` §10.3.2）；保留期只引用 `10` §10.3.2；人工编辑检出所在的旧 `<wtRoot>` 是必需路径；自动改名共五处（含情形 F）；Tower 不重新建立根，新 Goal 从准备开始把将要使用的 `<wtRoot>` 计入必需路径，迁移的新记录与 `satellite_rebuilding=1` 在迁移的事务中写入（`06` §6.1.6、§6.4.3）；写回中断的 Goal 使迁移返回列出它们的 `E_STATE`，界面不提供会被拒绝的动作（`12` §12.6.5）；F13 按处理器计数、只由同一处理器的正常完成清零，自报为 `anomaly{tower_goal_handler_error}`（`an:{goalId}:tower_goal_handler_error`）；占位结果写明已执行并带 `details: {}`，脱敏覆盖 `details`（`05` §5.6.5、`11` §11.7.1）；验证中子进程的任何失败都先判可达，`flake` Fact 在判定之后写，只因无结论而不能通过时记 `verify_env_error{stage:"baseline"}`、不返工（`07` §7.4.1、§7.4.6）；`prepare_failed` 的来源只按 `16` §16.1.1；中断的验证只缺进行中那条标准的 Fact | ADR-239 |

### 16.1.14 事件类型索引（ADR-179）

本表只是**索引**，不是定义：事件的载荷、producer 与写入时机以“定义位置”一列为准；定义处是 `06` §6.3（`events` 表、其中“本文新增的事件类型”注释与“说明”中的离散事件、哈希链规则）与各文档的“本文产生的事件”表（如 `10` §10.18），新增事件类型先写进定义位置，再补本表（lint (i) 比对两者，ADR-180）。保留与哈希链按前缀规定（`engine.*` 可由分层保留删除，`audit.*` 成链），与本表无关。`tower.*` 是开场注入与 Pi 会话条目，不是 EventLog 的事件类型（见本节末行）。

| 前缀 | 事件类型 | 定义位置 |
|---|---|---|
| `goal` | `goal.state_changed`（唯一的状态转移事件；`source = harness`、producer `sm`，I5） | `06` §6.3；`03` §3.2 |
| | `goal.created` · `goal.meta_changed` · `goal.priority_changed` · `goal.dependency_*` | `06` §6.4.3 |
| | `goal.continuation.set{continuation, by, decisionId?}` | `06` §6.3；§16.1.12 |
| | `goal.external_change.detected{paths, mixedPaths, baselineCps?}`（路径集合使载荷超过 16 KB 时按 `06` §6.3“载荷中的路径集合”外置，ADR-214）· `goal.external_change.resolved{how, decisionId?}` | `06` §6.3；`10` §10.3.1；§16.1.12 |
| | `goal.base.chosen{side}` | `06` §6.4.3（`goal.base.choose`）；§16.1.12 |
| `human` | `human.decision{…}`（种类取 §16.1.5 的 `HumanDecision.kind`；`hand_back` 的 `handBack.resolvePinHits` 使载荷超过 16 KB 时按 `06` §6.3“载荷中的路径集合”外置，ADR-215） | `06` §6.4.3；`02` §2.7 |
| `run` | `run.requested{kind}`（准入通过时发出，ADR-179）· `run.started{openingIds}`（本次开场消费的 `OpeningRef.id`，ADR-184）· `run.ended{outcome, reason}` | `06` §6.2.4、§6.1.4 |
| `engine` | `engine.*` 细粒度事件，即 Run 中的 Host 事件，存储类型名 = `engine.` + `EngineEvent.t`（`.` 改为 `_`；唯一规则 `06` §6.3 说明，ADR-181）：`engine.agent_start`/`engine.agent_end`/`engine.agent_settled`、`engine.msg_end`、`engine.tool_start`/`engine.tool_end`、`engine.queue`、`engine.compaction_*`、`engine.retry_*`、`engine.entry`、`engine.ui_request`、`engine.error`、`engine.exit` 等（Host 的 `run.ready` 也是 `EngineEvent`，不是 `run.*` 事件类型，ADR-180）；只写离散事件，不含 `msg.delta`、`tool.update` | `05` §5.2.2（`EngineEvent`）；`06` §6.3 说明、§6.2.2 |
| `verify` | `verify.requested{trial?}`（`trial:true` 的试运行不经 `verify(goal, trigger)`，ADR-179） | `06` §6.4.3；`03` §3.4.1 |
| `fact` / `claim` | `fact.recorded`（`source` 必须为 `harness`）· `claim.recorded` | `02` §2.13；`06` §6.3（`facts.seq` 软引用） |
| `contract` | `contract.drafted` · `contract.draft_edited` · `contract.ratified` · `contract.superseded` | `06` §6.4.3 |
| `needs_you` | `needs_you.resolved` · `needs_you.snoozed` | `06` §6.4.3 |
| `review` / `comment` | `review.unit_marked`；`comment.*`（评论队列与回执） | `06` §6.4.3；`06` §6.2.2、`05` §5.7 |
| `settings` / `project` | `settings.changed` · `project.trust_changed` · `project.local_file_secret_detected{projectId, path}` · `project.local_file_unmark_reverted{projectId, path}` | `06` §6.4.3、§6.3；§16.1.12 |
| `prepare` | `prepare.progress{step, done, total, bytes?}` | `06` §6.3；§16.1.12 |
| `agent_proc` | `agent_proc.kill_requested{by}` | `06` §6.3；§16.1.12 |
| `system` | `system.suspend` · `system.resume{sleptMs}` | `06` §6.1.5 |
| `integration` | `integration.step_started{entryId, step, expected}` · `integration.step_done{entryId, step, observed}` | `06` §6.1.6 |
| `workspace` / `binding` / `mirror` | `workspace.paths_restored{cp, paths, safety}`（`paths` 使载荷超过 16 KB 时按 `06` §6.3“载荷中的路径集合”外置，ADR-214） · `workspace.restored` · `workspace.recovered{case, projectId?, fromCheckpoint, lostWindowMs, unusableCheckpoints?}`（`unusableCheckpoints` 只在情形 G 中写，`checkpoints.unusable` 由它投影，ADR-185；多仓库 Goal 中检查点按仓库编号，`10` §10.13，`projectId` 指明 `fromCheckpoint` 与 `unusableCheckpoints` 属于哪个仓库，ADR-213） · `binding.reattached{from, to}` · `binding.rebased{old, new}` · `mirror.created` · `mirror.fetched` · `mirror.gc{bytesBefore, bytesAfter}` | `10` §10.8.1、§10.16.2、§10.1.1、§10.17.1、§10.18 |
| `satellite` / `checkpoint` | `satellite.created` · `satellite.prepared` · `satellite.removed` · `satellite.recovered{projectId?, tree, checkpointN?, by}`（ADR-180；多仓库 Goal 中带 `projectId`，同上，ADR-213）· `checkpoint.created{projectId, n, runId?, sessionId?, piEntryId?, author, commit, tree, satelliteHead?, landmarks, takenAt, durationMs?, excludedPaths, externalPaths, mixedPaths, humanPaths?}`（唯一定义，ADR-212/213：载荷即 `06` §6.3 `checkpoints` 行建立时的全部列，Projector 只从它写入该行；`piEntryId` 只在回合检查点上。**路径集合超过上限**：载荷会超过 16 KB（`13` §13.9.1）时，非空的路径集合（`excludedPaths`、`externalPaths`、`mixedPaths`、`humanPaths`）按 `06` §6.3“载荷中的路径集合”（唯一定义，ADR-214）以内容哈希整组外置，Projector 与重建按哈希读回整组写入该行；这些集合由当时的归因求出，不能从检查点的树重算，所以不截断。**建立后只追加两列**（列表即全部）：`landmarks` 只追加 `verify_pass`/`verify_fail`/`criteria_flip`（写入规则见 `10` §10.7.1 `landmarks`，重建时由同一组 `fact.recorded` 推出）；`unusable` 投影自 `workspace.recovered`（ADR-185）。其余由事件承载的列建立后不再改写——交还第 7 步与 `safety` 同树时，第 6 步建立该检查点时即带上第 7 步的 landmark 与路径集合（`10` §10.8.4）。`in_user_repo` 不由事件承载，重建时按用户仓库中实际存在的地标 ref 求出（`10` §10.6.2；哪些表与字段由事件重放、哪些沿用，见 `06` §6.2.1 的两份清单，ADR-216）） | `10` §10.18、§10.16.2；§16.1.12 |
| `human_checkout` / `inspect` | `human_checkout.created` · `human_checkout.handed_back{changed, ignoredCommits, skipped, choice, pending}`（`changed`、`skipped` 使载荷超过 16 KB 时按 `06` §6.3“载荷中的路径集合”外置，ADR-214） · `inspect.opened` · `inspect.closed` | `10` §10.18、§10.8.3、§10.8.4 |
| `mergequeue` / `integration` / `backup` / `ports` | `mergequeue.*`（M2）· `integration.performed{mode, strategy, sha, branch, prUrl?}` · `backup.bundled{goalId, bytes, thin}` · `ports.allocated` · `ports.released` | `10` §10.18、§10.11、§10.19 |
| `memory` / `attention` | `memory.injected{runId, piEntryId, items}` · `attention.tuning_applied` | `09` §9.5.4；`08` §8.9.2 |
| `privacy` / `scratch` / `autonomy` / `export` | `privacy.purged` · `scratch.*` · `autonomy.*` · `export.*` | `06` §6.4.3 |
| `watermark` | `watermark.advanced`（只更新水位表，不进入 EventLog） | `06` §6.4.3；`08` §8.10.1 |
| `audit` | `audit.project_merged` · `audit.project_split` · `audit.acceptance_carried` · `audit.repo_lock_taken`（`06` §6.1.9 接管其他机器的仓库锁）· `audit.log_digest{fromSeq, toSeq, count, merkleRoot}` · `audit.retention_purge{goalId, seqRanges, count}` · `audit.user_refs_cleaned`（成链规则 `11` §11.11，M2 计算） | `06` §6.4.3、§6.2.3、§6.3；`10` §10.6.2 |
| `tower`（不是事件类型） | 开场注入（`tower.handback`、`tower.external_resolved`、`tower.satellite_rebuilt`、`tower.resume`、`tower.processes_terminated` 等）与 Pi 会话中的 `tower.*` 条目；在 EventLog 中只以 `engine.*` 的 `entry` 出现 | `05` §5.6、§5.7；§16.1.5、§16.1.12 |

---

## 16.2 默认数值与阈值

列：**值**（单位）· **所属 §**（语义与算法所在处）· **依据**（ADR / 研究 / ⚫ 设计假设）· **回填实验**（`14` §14.5；SP = M0 spike）。证据等级见 `07` §7.14、`08` §8.15。

### 16.2.1 模型面与 token（ADR-009、ADR-032）

| 参数 | 值 | 所属 § | 依据 | 回填 |
|---|---|---|---|---|
| 常驻增量合计 | ≤ 650 token（实测 running 445 / shaping 307 / review 210） | `05` §5.6.3 | ADR-009 | E5、契约测试 C15 |
| 工具声明 + guideline | ≤ 350（实测 329） | `05` §5.6.3 | ADR-009 | C15 |
| `tower_goal` 系统段 | ≤ 300 = 意图与终态 ≤ 70 + 验收标准标题 ≤ 110 + 生效记忆 ≤ 120 | `05` §5.6.3；`09` §9.5.1 | ADR-009 | C15 |
| 关闭 `log` 后常驻 | 工具 162，常驻约 280 | `05` §5.6.3 | 实测 | E5 |
| 事件性注入：交接包（含 `tower.handback`） | ≤ 300 | `05` §5.6.3 | ADR-009 | C15 |
| 事件性注入：返工证据 | ≤ 400（失败标准 + 末尾 30 行 + 哨兵） | `07` §7.10.3 | ADR-009 | C15 |
| 事件性注入：nudge | ≤ 60 | `05` §5.6.3 | ADR-009 | — |
| 压缩后账本块 `tower.ledger` | ≤ 150 | `05` §5.6.5 | ADR-026 | — |
| 单条转向评论 | ≤ 250 | `05` §5.6.3 | Tower 自定 | — |
| token 估算口径 | `ceil(asciiChars/4 + nonAsciiChars/1.5)` | `05` §5.6.3 | ADR-032 | — |
| 单条记忆 `text` | ≤ 80 估算 token（≈ 120 汉字 / 320 ASCII 字符）；DDL 字符上限 320 | `09` §9.2；`06` §6.3 | ADR-032 | — |
| 记忆 `detail` | ≤ 600 字符，只按需 | `09` §9.2 | ⚫ | — |
| 学习起草规则文字 | 目标 ≤ 40，上限 80 token | `09` §9.6.3 | ⚫ | — |
| `ask_user` 选项数 | ≤ 6 | `05` §5.6.2 | ⚫ | — |

### 16.2.2 生命周期、运行与对话框

| 参数 | 值 | 所属 § | 依据 | 回填 |
|---|---|---|---|---|
| `agent_settled` 宽限确认 | 2 s | `03` §3.2；`05` §5.5 | ADR-025 | 契约测试 C19 |
| 准备阶段时限（只计 Host 握手与开场组装，ADR-151；仓库准备（含卫星检出）与依赖物化各有时限） | 120 s；失败或超时 → `paused(prepare_failed)`，不在启动时自动解除，不 `autoResume`，`stalled{prepare_failed}` | `03` §3.2、§3.2.1；`06` §6.2.4；`10` §10.3.1 | ADR-148、ADR-149 | SP5（卫星创建）、SP2（Host 启动） |
| 仓库准备时限 `prepare.repoTimeoutMin`（镜像首次建立含跨卷复制、等待项目锁、远端 fetch、LFS 对象补齐、卫星检出含 LFS 内容写出；不计入 120 s） | 15 min；失败或超时 → `paused(prepare_failed)`；期间 `pause` 允许并中止 | `10` §10.3.1 | ADR-150 | SP5（镜像建立、跨卷复制） |
| LFS 获取的配置（规则，ADR-152/153/154 及其补记） | **键白名单**：从 base 的 `.lfsconfig`（`git show <base>:.lfsconfig`）只取 `lfs.url` · `remote.<name>.lfsurl` · `lfs.<url>.access` · `lfs.fetchinclude` · `lfs.fetchexclude`，其余忽略；URL 值只接受 `https://` 与 `ssh://`（及 scp 式 ssh），拒绝 `file://`、本地路径与其他协议，不合规的值记入诊断日志并忽略。**按键解析**（与 git-lfs 一致）：对每个键，用户主检出 git 配置中的值覆盖 `.lfsconfig` 中的值；端点 = `lfs.url` ?? `remote.<name>.lfsurl` ?? 由远端 URL 推导（键优先，不是来源优先）。**远端名**：见下一行“Tower 的 git 网络命令”（ADR-154 补记、ADR-155）。被拒绝的值记 Fact `lfs_config_ignored{keys, reasons}`（来源恒为 `.lfsconfig`）。临时文件另含所选远端原样的 `remote.<name>.url`，`git lfs fetch` 以该远端名与 base 提交为参数（ADR-155、ADR-157）。**传递方式**：生效的键、`[include] path = <用户的全局配置>` 与在用户主检出上下文中求出的网络认证配置（`credential.*`、`http.*`——含不带 URL 的全局代理与 CA 及 `http.<url>.*`、`url.<base>.insteadOf`、`core.sshCommand`（补记 2）；多值键先清空再按序写出；来自用户自己的配置，不来自仓库内容，ADR-154 补记）写入 `~/.tower/tmp/` 下权限 `0600` 的临时配置文件，以 `GIT_CONFIG_GLOBAL=<该文件路径>` 运行 `git lfs fetch`——命令行与环境中只出现文件路径；命令结束（含失败、超时）即删除。**镜像 `HEAD`** 指向占位引用 `refs/tower/none`，不读镜像中的任何配置。`fetchinclude`/`fetchexclude` 过滤后，“缺失对象”只针对需要的对象；被排除的文件在所有检出（卫星、验证槽位、人工编辑检出、检验检出）中保持指针，记 Fact `lfs_excluded{count, paths, patterns, source}`（`paths` 至多 200 条），附于验证证据，不导致 `prepare_failed`；验证失败卡片提示“项目配置排除了 N 个 LFS 文件”；由白名单校验导致的 `prepare_failed` 卡片写“LFS 配置被拒绝：<键>（不支持的协议）” | `10` §10.1.2、§10.3.1 步骤 1、2a、§10.14；`11` §11.6.4；`05` C29(b) | ADR-151、ADR-152、ADR-153、ADR-154 | G43 |
| Tower 的 git 网络命令（规则，ADR-154/155/157；唯一定义在 `10` §10.1.2） | **适用**：M1 中远端引用 base 的 fetch 与 LFS 获取；M2 中远端 base 的轮询、自动 rebase 前的 LFS 补齐、推送前的 `ls-remote` 与推送。**前提**（ADR-158，取代 ADR-157 在 macOS 上的说法）：macOS 上 Seatbelt 无法阻止 Agent 观察同一用户其他进程的参数（`11` §11.6.2；SP6a A12(a) 是测量）；Linux S2（M2）以 PID 命名空间隔离。**与用户自己的 `git fetch` 相同**：原样使用用户配置的远端 URL（含其中的凭据），照常读取用户的全局与系统配置；ADR-155/156 的凭据改写全部撤回（见废弃表）。**远端名**：base 是 `refs/remotes/<r>/<b>` 时取 `<r>`；否则 `branch.<base>.remote` → `remote.lfsdefault` → 唯一的远端 → `origin`；不硬编码 `origin`。**执行位置**：全部在镜像中执行（`GIT_DIR=<mirror>`），用户主检出只用于读取有效配置，不运行网络命令，也不更新其 `refs/remotes/*`；远端 base 取入 `refs/tower-remote/<r>/<b>`，并记录获取时间。**临时配置文件**：`~/.tower/tmp/`（目录 `0700`、文件 `0600`，不进系统备份，Agent 沙箱读拒绝），以 `GIT_CONFIG_GLOBAL=<路径>` 传入，命令行与环境中只有路径；命令结束即删除，**Supervisor 每次启动时清空其中不属于存活 Host 的内容**（存活 Host 的临时目录 `<hostId>/` 保留，`05` §5.3.6，ADR-224）。内容依次为：`[include]` 用户全局配置；主检出上下文中 `[include]` 带不进来的认证类值（仓库级与按目录生效的值，按 `--show-origin` 求差集，原样写出）；所选远端原样的 `remote.<name>.url`；LFS 获取另加 `.lfsconfig` 白名单键；M2 推送另加 `core.hooksPath=/dev/null`。**带凭据的远端**（macOS 默认，ADR-158）：按“远端 URL 的凭据判定”行判为带凭据的远端不执行任何网络命令，记 Fact `remote_credential_blocked`，显示项目级 Needs-You `integration`（去重键 `int:{projectId}:credential_url`）“请把该远端的凭据移到 credential helper”，“重试”= `project.remote.recheck`。**远端 base 的获取时机**（M1）：获取按（项目镜像，远端，分支）合并，结果分发给所有等待者；非准备时机总时限 60 s，超时即终止并记 `base_fetch_failed`（ADR-159）。时机为 Goal 准备、进入 `in_review` 之前（**不阻塞**，转移只等前 10 s，其余在后台完成，ADR-158/159）、`goal.base.check`（卡片上点“检查 base”，或打开 Goal 详情且距上次获取超过 10 分钟，远程客户端同样计入）；每次获取后进行 base 前进检测（Fact `base_advanced` / `base_unchanged_nonancestor` / `base_diverged`）与 `integrated` 观测；获取失败记 `base_fetch_failed`。**M2 推送目标**：`branch.<seal 分支>.pushRemote` → `remote.pushDefault` → 远端名规则；推送后在用户仓库配置中写 `branch.<seal 分支>.remote/.merge`，代替 `-u`。**`pre-push`**（M2）：项目设置允许时，推送前在用户检出中执行 `git hook run --ignore-missing --to-stdin=<0600 文件> pre-push -- <远端名> <远端 URL>`（git 2.40 起可用，无版本回退）；标准输入中的远端提交取自镜像中的 `ls-remote`，不存在时为全零。**推送失败**（钩子拒绝、网络、认证）：不推送，记 Fact `push_failed{stage, exitCode?}`，Goal 保持 `accepted`，队列条目进入 `awaiting_push`（不占用该 base 的 FIFO，ADR-158）；Needs-You `integration`（severity 2，去重键 `int:{goalId}`）；选项“重试推送”“只保留分支”；钩子失败另记 Fact `push_hook_failed`。输出只进诊断日志，按 `11` §11.7 模式脱敏，含通用模式 `<scheme>://<user>:<secret>@` | `10` §10.1.2、§10.3.1 步骤 1、2a、§10.9.3、§10.10、§10.12；`11` §11.6.2、§11.6.4、§11.7、§11.12 T33；`06` | ADR-154、ADR-155、ADR-156、ADR-157、ADR-158 | G43、SP6a A12、G44、G45 |
| base 的取值 `baseTip(r, b)`（唯一定义在 `10` §10.1.2，ADR-156/157/158） | 远端引用 base 在镜像中有 `refs/tower-remote/<r>/<b>`（Tower 获取，`towerFetchedAt`）与 `refs/user/remotes/<r>/<b>`（镜像观察到其变化的时间 `userObservedAt`，偏新、不用于裁决）两个值：只有一个时取它；有祖先关系时取后代；**分叉时不自动选择**（ADR-158，取代 ADR-157 的“取获取时间较新的一方”）——`baseCommit` 不变，尚未选择时 `baseTip` 返回 `baseCommit` 本身（ADR-160/161），记 Fact `base_diverged{tower, user, towerFetchedAt, userObservedAt}`，由人以 `goal.base.choose{side}` 选择观测基准（事件 `goal.base.chosen`，持久化为 `Goal.baseChoice`，同一对分叉提交仍存在时 `baseTip` 返回所选一侧，ADR-159；不改变 `baseCommit`）；Goal 准备时分叉则取用户检出一侧并同样提示（ADR-158 补记 2 确认）。变化但不是前进 → Fact `base_unchanged_nonancestor{from, to}`。本地分支 base 取 `refs/user/heads/<b>`。“base 前进” = 新值 ≠ `baseCommit` 且 `baseCommit` 是其祖先，记 Fact `base_advanced{from, to, count}`（M1 只提示）。调用方：Goal 准备、base 前进检测、合并队列 Q2（M2）、`integrated` 观测 | `10` §10.1.2（定义）、§10.3.1 步骤 1、§10.9.3、§10.10、§10.11 Q2、§10.12；`06`（引用） | ADR-156、ADR-157、ADR-158 | G45 |
| 远端 URL 与认证配置的凭据判定（唯一定义在 `10` §10.1.2，ADR-158/159） | **判定对象**：所选远端 URL 与适用的 `insteadOf` 替换目标；作用于该远端的以 `!` 开头的内联 `credential.helper`（含 `password=` 或 token 形态）；含 token 形态的 `core.sshCommand`、`http.extraHeader`（ADR-159）。userinfo 含 `:` → 凭据；只有用户名时，匹配 `ghp_` · `gho_` · `ghu_` · `ghs_` · `github_pat_` · `glpat-` 前缀、用户名 `x-access-token`，或长度 ≥ 20 的高熵串（判据同 `11` §11.7 的熵规则）→ 凭据；否则为用户名。判定对象是所选远端 URL 与适用的 `insteadOf` 替换目标。macOS 上命中即不执行网络命令，记 Fact `remote_credential_blocked`，显示项目级 Needs-You `integration`（`int:{projectId}:credential_url`），“重试”= `project.remote.recheck` | `10` §10.1.2；`11` §11.6.2 | ADR-158 | G45 |
| 云 SDK 凭据传入 Host（规则，ADR-049，ADR-158 补记 2） | 只传**指向文件的变量**（`AWS_PROFILE` · `AWS_SHARED_CREDENTIALS_FILE` · `AWS_CONFIG_FILE` · `GOOGLE_APPLICATION_CREDENTIALS`，只有这几个，ADR-231）与**非机密的配套变量**（`AWS_REGION` · `AWS_DEFAULT_REGION` · `GOOGLE_CLOUD_PROJECT`/`GCLOUD_PROJECT` · `GOOGLE_CLOUD_LOCATION`），以及 API Key 类 provider 的非机密配置变量（`AZURE_OPENAI_*` 四个、`CLOUDFLARE_ACCOUNT_ID` · `CLOUDFLARE_GATEWAY_ID`，ADR-228）；以凭据文件提供 AWS 凭据时总带 `AWS_PROFILE`（Pi 不认只有文件变量的环境），与原始密钥并存时同 Pi 用原始密钥，投递文件用保留的 `tower-<hostId>`，区域在每次 Host 启动时判定、都没有且 Host 环境中带 `AWS_PROFILE` 时补 `us-east-1`（只有原始密钥、没有区域时与终端中按模型端点取区域不同，如实登记，ADR-229）；与 `AWS_BEARER_TOKEN_BEDROCK` 并存时只注入令牌、不导入原始密钥，Pi 判定凭据来自你的 Pi 配置（`auth.json` 或 `models.json`）时不注入导入的密钥（ADR-230/231）；原始密钥变量（`AWS_ACCESS_KEY_ID`、`AWS_SECRET_ACCESS_KEY`、`AWS_SESSION_TOKEN` 等）从不传入。有原始变量时，写入即时投递文件 `~/.tower/run/<hostId>/`（ADR-159/226），传其路径与保留的 profile 名。Host 进程环境中没有云密钥；非机密变量的值记入密钥库、随“重新读取”更新，原始值没有刷新途径（已知限制）。唯一定义在 `11` §11.7.1 | `11` §11.7；`05` | ADR-049、ADR-158、ADR-159、ADR-227、ADR-228、ADR-230 | G46 (d) |
| 机密投递表（唯一定义在 `11` §11.7.0，ADR-159/164） | 全部机密的存放、投递与可读者以 `11` §11.7.0 的表为准，其他文档只引用。**M1 规则**（ADR-164/166）：Tower **不会自动**把机密交给 Agent 可影响的进程（Agent、验证器、检验检出）；唯一的例外由人发起（检验检出的 `inspect_with_secrets`）。注册表认证 Tower 不保存，每次从用户级 `~/.npmrc` 读取交给安装器第 1 阶段（ADR-167）；项目变量不能放机密。模型密钥 → Host 内存；云 SDK 凭据 → 指向文件的变量与即时投递文件，只交给 Engine Host；验证器标准的机密 → **M2**（M1 中标准不能声明机密，需要机密的检查写为 human 标准）；`secrets.access` → **M2**；用户配置的 MCP 环境 → 登记的残余（T33）；URL 或 git 配置中的凭据 → macOS 上不执行网络命令。**静态存放**只在系统钥匙串（密钥库），M1 中只存 Tower 自己使用的凭据 | `11` §11.7.0；`06` §6.2.2；`07` | ADR-159、ADR-164 | G46 |
| 钥匙串条目的访问控制（ADR-162/163/164） | **M1 中钥匙串只存两类**（ADR-166，取代 ADR-165 的三类）：模型提供商密钥（进程内存交给 Pi）、云 SDK 凭据（即时投递文件，只交给 Engine Host）；两类各自的非机密配套与配置变量的值随所属条目存放（`11` §11.7.1，ADR-228）。注册表令牌 Tower 不保存：安装器第 1 阶段每次只从用户级 `~/.npmrc` 读取认证行（`${VAR}` 以登录环境展开；项目 `.npmrc` 的认证行不读取，ADR-167），写入即时投递文件（该阶段不执行任何项目代码，阶段结束即删除，第 2、3 阶段不含令牌；`dep.add` 的代理安装同样走第 1 阶段）。工具令牌的导入（ADR-033）与把注册表令牌授予 Agent 可读 npmrc（ADR-063）都属于 M2。条目分类与按 Goal/标准的授权属于 M2。条目以访问控制列表限定为 Tower 自己的代码签名身份；其他进程读取会触发 macOS 授权提示（用户应拒绝）。所有运行 Agent 可影响内容的沙箱另外拒绝钥匙串服务的查找（`11` §11.6.2）；**回退**：若 SP6a A8 显示该拒绝会破坏常用工具，则取消该拒绝，只依赖访问控制列表。`~/.tower/secrets.enc` 只是钥匙串不可用时的加密回退 | `11` §11.6.2、§11.7.1；`14` SP6a A8 | ADR-161、ADR-162、ADR-164、ADR-165、ADR-166 | G46、A8 |
| `ProjectLocalFile` 与本地文件的机密分类（ADR-165 及补记、ADR-166/167/168/169/170/171/172/173/174/175/176） | `{projectId, path, secretBy: "name" \| "content" \| "user" \| null, approved: {decisionId} \| null, unmarked: {contentHash, decisionId} \| null}`（`02` 定义，`06` 表 `project_local_files`）。**清单维护**（ADR-167）：`project.local_files.add` 加入（按名字与内容判定 `secretBy`；**只接受在用户检出中被 git 忽略的路径**（`git check-ignore` 为真，被跟踪的路径不算），否则返回 `E_STATE`，提示“`<路径>` 没有被 git 忽略。先把它加入 `.git/info/exclude`（只在本机生效）或仓库的 `.gitignore`，再加入本地文件清单”，ADR-205；在 `Project.defaultBaseRef` 的当前提交中被跟踪的路径同样返回 `E_STATE`，提示“`<路径>` 在仓库中被跟踪，不是本地文件”，ADR-206；被跟踪的路径在 `check-ignore` 下也不算被忽略，所以先查跟踪，两条都不满足时只报这一条，ADR-207。这项检查只让人自己的 `git status` 与提交不收录个人文件；Tower 的快照不依赖它，见下方“快照”）、`project.local_files.remove` 移除、`project.local_files.approve` 批准纳入播种（记 `HumanDecision{approve_local_file}`，仅本机；清单中不存在的路径返回 `E_STATE`，不隐式加入，ADR-170）；未经批准不播种。**判定时机**（唯一定义，ADR-170/171；`06` VerifierScheduler、`07` §7.4.1、`10`、`11` 引用）：`add` 时，以及**每次复制前**——作用范围是“**任何把本地文件复制出用户检出的地方**”，目前五处：卫星创建或重建、验证槽位、检验检出（含 `inspect_with_secrets` 的普通文件部分）、人工编辑检出（`10` §10.8.4）、验证重放（`07` §7.4.1 重放规格，ADR-174）；今后新增的复制点自动适用（ADR-171）——对清单中**每个**条目按名字与**当前内容**重新判定（名字模式与内容模式同 `add`，`11` §11.7.1），并检查路径在该 Goal 的 base 树中是否被跟踪：被跟踪的条目对这个 Goal 是仓库文件，这次不复制，按下方“不可读或不存在”一条处理（不改写 `secretBy`；本应复制的条目发 L1 通知“`<路径>` 在这个目标的代码中已被跟踪，本次未复制”，ADR-206）。**快照**（ADR-206/207）：清单中的路径不进入检查点、pin、seal、交还的 T1 与人工编辑的差异，在该 Goal 的 base 中被跟踪的除外，与忽略规则的状态无关（规则在 `10` §10.1.2“本地文件按路径排除”，快照排除什么及清单变化何时生效在 `10` §10.7.1 第 1 步）；想让 Goal 提交这样的文件，先 `remove`。**同一份内容**（ADR-171）：每个条目只读一次，读入内存后判定，再把这份内容写出；`unmarked.contentHash` 比较所用的内容哈希也取自这一份；不先判定、再从磁盘复制。验证时，`seeded` 条目在查缓存之前读入一次：`envHash` 中的本地文件项（`07` §7.4.3）、验证结果记录的 `criterion_check.env.localFiles` 与写进槽位的内容都取自这一次读取，不读第二次（`07` §7.4.1 `verify()`，ADR-172/173）；指纹不含本地文件（`07` §7.3.2，ADR-174）。**写出前复核**（ADR-174；`07` §7.4.1 `verify()` 引用）：验证槽位的读取与写出之间可能隔着排队（`07` §7.4.10）。写进槽位之前，按**当前**状态复核读入的每个条目是否仍为 `seeded`，只查清单行，不读文件；有条目已不再 `seeded`（`mark_secret`、`remove`、其他复制点的判定自动改为机密）时，这次不写出任何本地文件，本次验证回到读取一步重新开始（重新读取、重新算 `envHash`、重新查缓存），槽位保留，不重新排队。“查询键 = 槽位内容 = 记录”因此保持不变，`mark_secret` / `remove` 之后不再复制该条目。复核与写出在同一把**按 Project 的本地文件锁**下完成：该 Project 的 `add`、`approve`、`remove`、`mark_secret`、`unmark_secret` 与各复制点的“复核 + 写出”都先取这把锁（Supervisor 进程内的异步互斥，只串行同一 Project 的本地文件操作，不阻塞其他命令）；命令在复制写出期间等待，写出只涉及几个小文件（ADR-175）。`secretBy = null` 的条目内容命中时，Supervisor 写入 `secretBy = "content"`（事件 `project.local_file_secret_detected`，producer `sm`：执行复制的服务把判定结果交给 Supervisor 写入），这次不复制，并按条目原状态如实通知（ADR-172）：原先 `seeded` 的条目为“`<路径>` 现在含有机密形态的内容，已改为机密本地文件，不再复制”，未批准的条目为“`<路径>` 现在含有机密形态的内容，已改为机密本地文件”；`approved` 保留，但按谓词不再使文件 `seeded`。**不可读或不存在**（ADR-171/172/173）：只对**这次本应复制的条目**适用——`seeded` 的条目；`inspect_with_secrets` 时另含 `isSecret` 的条目。这样的条目在用户检出中不可读或不存在时，这次不复制，**不改写** `secretBy`，也不发上述事件；执行复制的服务发一条 L1 通知“`<路径>` 无法读取（或不存在），本次未复制”（ADR-173）。这条通知是**进程内状态**，按条目去重，显示该条目最近一次复制的结果（“已被跟踪”一种文案按 Goal 求值，另一个 Goal 对同一条目复制成功会使它消失，ADR-207），不写账本；之后该条目复制成功、该条目被移出清单，或 `mark_secret` 使条目由非机密变为机密时消失（按转移判断；`inspect_with_secrets` 中产生时已是机密的条目不受此条影响）；Tower 重启后不保留，下一次复制再读不到时重新出现。其他条目（未批准或机密，本来就不复制）缺失时不通知，只在设置页该行显示 `◇ 文件不存在`。只有内容真正命中才写 `content` 并发事件。命中的值加入脱敏器的精确匹配集（`11` §11.7）；已取消标记的条目沿用下方的取消标记规则。**派生谓词**（唯一定义，ADR-169；`06` VerifierScheduler、`07` §7.4.1、`11` 引用）：`isSecret(f) = f.secretBy ≠ null ∧ f.unmarked = null`；`seeded(f) = f.approved ≠ null ∧ ¬isSecret(f)`。只有 `seeded` 的文件复制到上述各复制点（卫星、验证槽位、默认检验检出、人工编辑检出与验证重放，ADR-168/169/171/174）；已取消标记并批准的文件是普通文件，照常播种。**含机密的本地文件**默认不复制到这些地方：文件名匹配 `.env*` · `*.pem` · `*.key` · `*credentials*` · `*.p12` 等模式（`name`），或内容匹配 `11` §11.7.1 的机密模式（`content`），或用户以 `project.local_files.mark_secret` 标记（`user`）。**`mark_secret` 的效果**（唯一定义，ADR-171；`06` 命令表、`02` 引用）：对 `isSecret` 为假的条目（含已取消标记的条目）写 `secretBy = 'user'`，**同时清除 `unmarked`**；对已是 `isSecret` 的条目为幂等的无操作，**不覆盖**已有依据（`name` 保持 `name`，`content` 保持 `content`），因此 `name` 条目仍不可取消标记。**已有副本**（ADR-176）：条目由非机密变为机密时，在同一把按 Project 的本地文件锁下，从该 Project 的活跃卫星（非终态 Goal 的卫星）与人工编辑检出中删除 Tower 复制进去的这份副本，只在 base **不**跟踪该路径的 Goal 中删除；在某个 Goal 的 base 中被跟踪时，那里的文件是仓库文件，从不删除，确认框列出这些 Goal（“以下目标的代码中跟踪了该文件，未改动”，ADR-207）。删除是 Tower 自己的写入，按 ADR-128 归因为 Tower（`10` §10.3.1），不触发 `external_change`；在这些 Goal 中该路径属于本地文件排除集（`10` §10.7.1 第 1 步 (d)），删除不进入它们此后的检查点、pin 与 diff。“这份副本”按路径认定：该路径上的文件也可能是 Agent 在它加入清单之前写下的，Tower 不区分二者，一并删除（取更严格的一侧）；`in_review`/`accepted` 中若当前 pin 记录的 L 不含该路径（例如移出后又加入），删除使指纹变化，按“Tower 自己的工作”经 I2 回到 `verifying`（`03` §3.3，ADR-208）。检验检出与正在运行的验证槽位中的副本不改动，只给出提示“`<路径>` 已标记为机密；打开中的检验检出 / 正在运行的验证仍有它的副本”——验证槽位中的随该次验证结束而删除；检验目录与已脱离的副本不自动删除（`10` §10.2，ADR-228），提示同时列出其中仍有这份副本的目录，需要时由你删除。当前内容（锁内读入的用户检出版本；卫星中的副本与之不同时一并读入）加入脱敏器的精确匹配集（`11` §11.7.1）。确认文案如实写“Agent 可能已经读到过这份内容”（`04` §4.15 本地文件设置页）。**取消标记**：`project.local_files.unmark_secret` 记 `HumanDecision{unmark_secret_file}`（仅本机）；`secretBy = name` 的不可取消（`E_STATE`），`secretBy = null` 的条目没有可取消的标记（`E_STATE`，ADR-170）；取消时确认“该文件将被复制到 Agent 可读的工作目录”；取消标记绑定当时的内容哈希，每次复制前重新扫描（同一份内容），内容变化且再次匹配机密模式时自动恢复：Supervisor 清除 `unmarked`，在同一事务中记录事件 `project.local_file_unmark_reverted{projectId, path}`（`source = system`，producer `sm`），并发 L1 通知“`<路径>` 的内容变化后再次命中机密模式，已恢复为机密本地文件”（ADR-172）。**例外**：人打开检验时可显式带上（`inspect_with_secrets`）。人工编辑检出默认不含这些文件（“此副本不含本地机密文件；需要运行时请自行复制进来”）；**交还时一律排除它们的路径**，不进入 T1、任何检查点或 seal（ADR-167）。依赖它们的检查写为 human 标准。**失败不做自动归类**（ADR-168）：标准失败一律按普通失败处理；项目有 `isSecret` 的条目时，失败卡片、返工证据与试运行红灯旁附 Claim 语法的提示（只列 `isSecret` 的条目，ADR-169），并提供“改为 human 标准”（`contract.amend`）；本次验证有本应复制而未复制的条目（取自本次验证记录的 `criterion_check.env.localFiles` 中 `not_copied` 的条目，不取自显示时的项目级状态，ADR-173）时，失败卡片与返工证据另附一行“未复制”的 Claim，同样不改变 `decide()`（`07` §7.4.1，ADR-172）；合同批准时若项目有机密本地文件，提示“读取这些文件的 exec 标准在 M1 中无法通过” | `11` §11.6.2、§11.6.3、§11.7.0；`10` §10.1.2、§10.3.1、§10.8.3、§10.8.4、§10.16.2；`02`；`06` | ADR-078、ADR-082、ADR-165、ADR-166、ADR-167、ADR-169、ADR-170、ADR-171、ADR-172、ADR-173、ADR-174、ADR-176 | G46 |
| 项目变量 `VerifyProfile.env.vars` 的机密检查（ADR-166） | 值在编辑时（`project.verify_profile.update`）经过机密检查；命中即拒绝保存，返回 `E_INVALID{reason:"secret_in_project_vars"}`（“项目变量会进入 Agent 与验证器的环境，M1 中不能放机密；需要机密的检查请写为 human 标准”），不提供 `confirmSecret` 绕过 | `11` §11.7.0；`06` | ADR-166 | G46 |
| 即时投递目录 `~/.tower/run/<deliveryId>/`（ADR-159） | 目录 `0700`、文件 `0600`；消费进程结束即删除；设置备份排除与 Spotlight 排除标记（xattr）；Supervisor 每次启动时清空其中不属于存活 Host 的投递（交给 Engine Host 的为 `run/<hostId>/`，`06` §6.1.6，ADR-226）。Agent、验证器与检验检出的沙箱都拒绝读取 `~/.tower/**`（回退位置下的逐路径例外只按 `11` §11.6.2，投递目录不在其中）；验证器对投递文件的逐路径放行属于 M2（ADR-164）。M1 中的使用者是交给 Engine Host 的云 SDK 凭据，以及安装器第 1 阶段每次从用户级 `~/.npmrc` 读取的注册表认证（ADR-166/167） | `11` §11.7.0、§11.6.3；`06` | ADR-159 | G46 |
| 调度互斥（`secretMutex`，**M2**，ADR-164；ADR-160/161/162 及补记；设计起点在 `11` §11.7.0a，取代 ADR-159 的独占窗口） | **“Agent 活动”按原则定义**（ADR-162）：Tower 启动的、运行 Agent 编写或可影响内容的任何进程——例如 Agent 的 Run 与后台进程、Goal 的准备、Scratch、验证槽位的准备（含安装器第 3 阶段：pnpmfile 与依赖构建脚本）、服务与测试清单、预热、其他槽位上的任何标准、检验检出的服务、未解决的 `bg_process_survived`。**不属于**的只有 Tower 自身代码：Supervisor、Engine Host、只使用用户配置的 git 网络命令。**规则**：带机密的标准以**机密阶段**运行（见下一行），只在没有任何 Agent 活动时开始，独占整个验证器，运行期间冻结准入（`06` §6.2.4）。**等待超过 10 分钟** → Needs-You（kind `verify_env`，去重键 `ve:{goalId}:secret_wait`，不是 `verify_env_error`；Goal 保持 `verifying`），命令 `verify.secret_wait.keep` · `verify.secret_wait.run_now`（`HumanDecision{accept_secret_exposure}`，跳过等待，其余步骤相同）· `verify.secret_wait.as_file`（在普通槽位流程中运行，不冻结）。**`secrets.access` 归 M2**（ADR-161）。**项目设置** `secretMutex.enabled`（默认 `true`；关闭时不等待，设置页与标准行标注风险）。T33b：互斥开启时 macOS S2 为低，关闭时为中 | `11` §11.7.0；`06` §6.2.2、§6.2.4；`07`；`08`；`13` | ADR-160、ADR-161、ADR-162 | G46 |
| 机密阶段（**M2**，ADR-164；ADR-162/163；设计起点在 `07` §7.4.11.2 与 `11` §11.7.0a） | `verify()` 先在普通槽位中运行全部不带机密的标准，结束后释放槽位。不运行的情形记 `not_run`（`other_criteria_failed` · `blocked_by_sentinel`，见 `criterion_check.verdict` 行）。否则进入机密阶段：不持有槽位地等待“没有 Agent 活动”；“没有 Agent 活动”的判定与冻结是**整机范围**，槽位则取自**该 Goal 所属项目**的验证槽位池（准备配置与项目绑定；判定成立时整机没有其他验证在运行，该池必有空闲槽位，ADR-163 补记）；“判定无活动 → 获取槽位 → 设置冻结”在 Supervisor 单写者线程中一次完成，机密阶段**严格串行**（`run_now` 也不并行）；获取槽位时即冻结准入（在准备之前），在**注入任何机密之前**完成准备；逐个注入并运行；收尾依次为终止槽位全部进程 → 槽位的正常 teardown（服务、容器卷，`07` §7.4.4）→ 释放槽位 → 解除冻结。依赖物化只读使用依赖缓存，构建产物**不回写**。**冻结时长上限** = `verify.slotPrepareTimeoutMin` + 各带机密标准的超时之和。**崩溃恢复**：重启时发现冻结未解除，先终止该槽位进程并 teardown，再解除冻结，机密阶段重新排队 | `07` §7.4.11.2、§7.4.4；`11` §11.7.0；`13` | ADR-162、ADR-163 | G46 |
| 唯一启动点 `startAgentActivity(kind, goalId?)`（ADR-163/164） | Tower 中启动任何 Agent 活动（Run 准入、Scratch、安装器与预热、检验检出与人工编辑检出的准备与生命周期脚本、检验服务、验证槽位的准备与运行）都经过这个函数。**M1 中它没有冻结状态**（ADR-164），唯一的约束是启动闸门：本次启动的硬链接探测有结果之前不启动使用沙箱的活动（`06` §6.2.4，ADR-224/225）；M2 的机密阶段在此冻结准入，排队的请求显示“等待机密验证结束” | `06`；`11` §11.7.0、§11.7.0a | ADR-163、ADR-164 | G46 |
| `verify.slotPrepareTimeoutMin`（**M2**，ADR-164；ADR-163） | 默认 **10**（分钟）：机密阶段槽位准备的时限，也是冻结时长上限的一部分（加上各带机密标准的超时之和） | `07` §7.4.11.2；`13` | ADR-163 | G46 |
| 依赖物化时限 `prepare.depsTimeoutMin`（不计入 120 s） | 15 min；**超过后依赖物化不再阻止 Run**：以 Fact `prepare{ok:false}` 照常进入 `running`，Agent 简报附失败日志尾部 | `10` §10.3.1；`07` §7.4.3 | ADR-149 | SP6c（安装耗时） |
| 返工上限 `Contract.maxReworkCycles` | 3 | `03` §3.3 I6 | ⚫ | E1 日志 |
| `integrated → archived` 宽限 | 24 h | `03` §3.4.4 | ADR-003 | — |
| 搁置：`draft` / `paused`（非 app_quit） / `ready` | 7 天 / 3 天 / 14 天 | `04` §4.3.2 | ADR-029 | E9 |
| 已验收仅保留分支 → 提示归档 | 14 天 | `04` §4.3.2 | ADR-029 | — |
| Scratch 保留 | 7 天（未 pin） | `02` §2.12 | ADR-012 | — |
| 超时默认：Pi 侧兜底 | `afterSec + 60 s`（仅 `use_defaults`） | `05` §5.6.4 | ADR-023 | — |
| `ask` 审批的 `defaultIfIgnored` | 拒绝 @ 30 min（仅 `use_defaults`；单向门永不超时） | `11` §11.1 | ADR-023 | E3 |
| 测试编辑审批 / `stalled` escalate 默认 | 拒绝 / 暂停 @ 1800 s（仅 `use_defaults`） | `07` §7.5.5、§7.7.1 | ADR-023 | E3 |
| 防饿死 | `agent_blocked` 在 L2 > 20 min → 升 L3 一次 | `08` §8.3.4 | ADR-023 | E3 |
| 答案发送前保留（`answerHoldMs`） | 5 s（可设 0）；`04` §4.8.2、`12` DecisionCard 已对齐 | `05` §5.6.4 | ⚫ | — |
| 批次评论窗口 | 最后一次编辑后 60 s | `05` §5.7.1 | ⚫ | — |
| `idle_without_submit` nudge | 每 Run 1 次 | `05` §5.6.5；`08` §8.6.4 | ⚫ | — |
| drain `graceMs` | 8 s（退出 5 s，OS 关机 2 s） | `06` §6.1.4 | ⚫ | — |
| 唤醒后自动续跑窗口 | 120 s 内网络类错误 settle → 自动 `prompt` 一次 | `06` §6.1.5 | ⚫ | — |
| `resumeOnLaunch` | 开 | `06` §6.1.4 | ADR-017 | — |
| `exec` 标准默认超时（Agent 起草时） | `timeoutSec: 600` | `05` §5.6.2 | ⚫ | 学习规则 `09` §9.7 |
| bash 默认 `timeout` 注入 | 1800 s | `08` §8.6.3；`07` §7.13 | ⚫ | E1 |
| Host 退出 | `paused` > 5 min 或进入 `in_review` | `13` §13.5；`06` §6.1.8 | ⚫ | SP2 |
| Host ack 超时 | 10 s | `06` §6.1.8 | ⚫ | — |
| RPC 握手 / 活性探针 | 20 s / 30 s | `05` §5.4.2；`06` §6.1.3 | ⚫ | — |

### 16.2.3 验证与诚实（`07` §7.13 为对照表）

| 参数 | 值 | 所属 § | 依据 | 回填 |
|---|---|---|---|---|
| 机会式验证 | 指纹稳定 ≥ 120 s、距上次 ≥ 10 min、有空闲已预留槽位；每运行中 Goal 每小时 ≤ 6 次、累计 ≤ 50 核分钟（参考项目每次约 17 核分钟，`07` §7.4.10 演算；只在正式验证队列为空且整机 CPU 负载 < 70% 时运行） | `07` §7.2.4；`13` §13.11.2 | ADR-020、ADR-042 | E4、E6、E12 |
| 验证槽位 `pool.size` | 2 / Project；全局 `min(max(1, floor(cores/4)), 内存可容纳数)` | `07` §7.4.2、§7.4.10 | ADR-042 | `13` 测量、E3 |
| M1 验证延迟预算 | claimed → in_review p50 ≤ 10 min、p95 ≤ 20 min（只对参考项目承诺：参考硬件 10 核 / 16 GB、3 Goal） | `07` §7.4.10 | ADR-042 | E3 |
| 验证排队降级 | 预测 Wq p95 > 10 / 20 min 分级 | `07` §7.4.10 | ⚫ | E3 |
| 依赖物化（命中） | ≤ 5 s | `07` §7.4.3 | ⚫ | SP5 |
| depcache 完整性复核 | 每 24 h | `07` §7.4.3 | ⚫ | — |
| 标准超时宽限 | SIGTERM 后 10 s SIGKILL | `07` §7.4.4 | ⚫ | — |
| 静默超时 | `max(120 s, timeoutSec/4)` 无输出且 CPU < 2% → `hung` | `07` §7.4.4 | ⚫ | `13` |
| 验证内存：准入预留 / 杀进程上限 `env.memLimitMb` | 准入预留 `max(1 GB, 1.3 × p95(峰值, 近 20 次))`，无历史时 2 GB；杀进程上限 `env.memLimitMb ?? max(2 GB, 2 × 预留)`，且不超过整机模型余量；超出 → `resource_exceeded`（ADR-054 判别）；macOS 每 2 s 采样 | `07` §7.4.4 | ADR-042 | SP4、`13` |
| `env.network` | `["localhost"]` | `07` §7.13 | ⚫ | — |
| `rerunFailed` / base 确认 | 2 / 5 次；> 10 个不稳定即判失败 | `07` §7.4.6 | ⚫ | 哨兵基准 |
| `flake.quarantineReview` | 30 天 | `07` §7.13 | ⚫ | — |
| `fingerprint.bigFileBytes` | 50 MB | `07` §7.3.2 | ⚫ | `13` |
| 指纹防抖 | edit/write/bash 结束 500 ms；`in_review`/`accepted` 期间文件系统事件触发后 1 s；正常无定时巡检，监视降级时每 60 s decisive（ADR-075、R5-D10-02） | `07` §7.3.2 | ⚫ | SP5 |
| `command_result.outputTail` | 末尾 40 行（掩码后） | `07` §7.2.2 | ⚫ | — |
| `criterion_check.tail` | 失败时末尾 80 行（带机密的标准无此字段） | `07` §7.4.7 | ⚫ | — |
| 返工消息输出尾部 | 30 行 | `07` §7.10.3 | ⚫ | C15 |
| 测试清单 ids 截断 | > 5000 只存哈希 | `07` §7.5.4 | ⚫ | — |
| 改名识别 / 弱化改写配对 | 相似度 ≥ 0.8 / Levenshtein ≥ 0.6 | `07` §7.5.2、§7.5.4 | ⚫ | 哨兵基准 |
| `gate_weakened` | 每 Goal ≥ 3 处或任一配置降级 → sev 2 | `07` §7.6.3 | ⚫ | 哨兵基准 |
| 通用密钥熵（哨兵） | ≥ 3.5 bit/char，值长 ≥ 16 | `07` §7.6.6 | 🟡 gitleaks | 哨兵基准 |
| 脱敏熵（tool_result） | ≥ 4.0 bit/char，长度 ≥ 20 | `11` §11.7 | ⚫ | — |
| `loop.sameFailure`（S1） | nudge 3 / escalate 5 | `07` §7.7.1 | ⚫ | E1 日志 |
| S2 振荡 | 一路径 2 次或合计 3 次 → nudge；再 2 次 → escalate | `07` §7.7.1 | ⚫ | E1 日志 |
| `loop.noProgress`（S3） | 8 回合且 ≥ 10 min；宽限前 10 回合 / 5 min | `07` §7.7.1 | ⚫ | E1 日志 |
| S4 烧 token | `max(60k, 3 × 中位数)` 且 ≥ 10 min；2 倍 → escalate | `07` §7.7.1 | ⚫ | E1 日志 |
| `loop.silentTool`（S5） | 20 min | `07` §7.7.1 | ⚫ | E1 日志 |
| S6 / S7 | 30 min 内 ≥ 3 次 plan 且 Jaccard < 0.5 / 10 min 内 ≥ 3 次 forbid 或沙箱违规 | `07` §7.7.1；`11` §11.1 | ⚫ | E1 日志 |
| `burn.gap` | burn ≥ 0.5 且 burn − progress ≥ 0.4；或 15 min 速率 ≥ 3× 基线；burn ≥ 0.8 且 progress < 0.3 → sev 2 | `07` §7.7.2 | ⚫ | E3 |
| 措辞线索检测器 | 关；开启时阈值 0.7；开启门槛 AUROC ≥ 0.75 且 precision ≥ 0.5 | `07` §7.9 | 🔴 | E1 附属 |
| 独立评审成本上限 | 执行成本 15% 或 $1，取小 | `07` §7.12 | ⚫ | E1 变体 |
| 精度目标 | 0.50–0.99（按检测器） | `07` §7.10.1 | ⚫ | 哨兵基准、E1 |
| TP-actionable 窗口 | 命中后 30 min | `07` §7.11.1 | ⚫ | E1 |
| 自动调节（哨兵；M2 起，豁免提议 M3，ADR-187） | 目标 − 0.15、每周 1 次 | `07` §7.11.3 | ⚫ | E3 |

> 两个熵阈值**有意不同**：哨兵用于**发现**提交中的疑似密钥（宁可多报，结果只是一个 chip）；脱敏会**改写**工具输出（误伤会破坏 Agent 看到的命令结果，如哈希、base64 数据），因此阈值更保守。

### 16.2.4 注意力（`08` §8.14 为对照表）

| 参数 | 值 | 所属 § | 依据 | 回填 |
|---|---|---|---|---|
| 全局打扰预算 `interruptsPerHour` | 6/h（只对 L3/L4 扣令牌），上限 12/h | `08` §8.5.3；`02` §2.14 | ISA-18.2 🟡 | E3（3/h vs 6/h） |
| 令牌桶 `burst` | 3；severity 3 与单向门审批可透支到 −3（`08` §8.3.4 `overdraw`，ADR-209） | `08` §8.5.3 | ⚫ | E3 |
| Goal 桶 | 容量 2；速率 `contract.budget.interruptsPerHour`，未设为 3/h | `08` §8.5.3 | ⚫ | E3 |
| 洪泛 | 全局 10 min 内 > 10（退出 < 5）；单 Goal 10 min 内 > 3，之后 30 min 只进收件箱 | `08` §8.5.2 | ISA-18.2 🟡 | E3 |
| 断点门限 θ | 粗断点 1 / away 0 / idle_short 2 / in_tower 3 / busy_elsewhere 5 / busy_in_tower_review 6 | `08` §8.3.3 | ⚫ | E3 |
| 最长等待 maxHold | blocked sev2 180 s；sev3 30 s；其他 15 min | `08` §8.3.3 | ⚫ | E3（90/180/300 s） |
| 优先级 k、τ | agent_blocked 2.0 / 5 min；agent_degraded 1.0 / 20 min；none 0.3 / 120 min | `08` §8.3.2 | ⚫ | E3 |
| 路由 tick | 15 s（另有事件触发） | `08` §8.3.4 | ⚫ | — |
| 用户离开判定 | 系统空闲 ≥ 300 s | `08` §8.3.3 | ⚫ | E3 |
| 心跳 | 每 5 s；迟到 15 s 显示 text-1 + `◇`；30 s 判定 `unresponsive`；唤醒后宽限 60 s | `08` §8.6.3；`06` §6.1.5 | ⚫ | `13`、E1 日志 |
| 模型静默 | 90 s 提示 `◇`；300 s `stalled{provider_silent}` | `08` §8.6.3 | ⚫ | E1 日志 |
| `preparing` 过长 | > 10 min → L1 | `08` §8.6.5 | ⚫ | SP5 |
| toast 收起 | 8 s | `08` §8.7.2 | ⚫ | — |
| 反射式批准 | 未打开证据且 < 3 s | `08` §8.8 | ⚫ | E7 |
| 精度目标 | 打扰精度 ≥ 0.70；收件箱 ≥ 0.50；作废打扰率 ≤ 0.10 | `08` §8.8 | 🟡 | E3 |
| 自动调节（M2 起生效；M1 只计算并展示精度，ADR-038） | n ≥ 20；interrupt < 0.4 → 降级；inbox < 0.3 → L1；obsolete > 0.3 → maxHold×2；`reflexiveRate ≥ 0.95` → 晋升候选；每来源每周 1 次；sev3 不调 | `08` §8.9.2 | ⚫ | E3 |
| 水位线推进 | 聚焦可见 ≥ 3 s | `08` §8.10.1 | ⚫ | E4 |
| 重入简报 | 离开 ≥ 10 min 或有 sev ≥ 2；应用级离开 ≥ 30 min；≤ 7 行；每行 ≤ 80 显示宽度 | `08` §8.10.2–8.10.4 | Parnin（方向）⚪ / ⚫ | E4 |
| 站会摘要（M2） | 工作日 09:30 / 14:00；≤ 15 行 | `08` §8.11；`02` §2.14 | ⚫ | E3 |
| 覆盖层延迟投递 | 浮层关闭或 10 s 无操作后 | `08` §8.10.5 | ⚫ | — |
| Watch 模式提示 | 持续 30 min 无人工动作 → 一次 L1 | `08` §8.5.7 | *TB* A2 | — |
| 诊断包预计算 | TTL 1 h，≤ 2 MB；渲染 p95 ≤ 300 ms | `08` §8.13.3 | ⚫ | `13` §13.1（P9） |
| 诊断 Trace 窗口 | 锚点前 6 次 + 后 ≤ 20 次工具调用；失败输出末尾 80 行 | `08` §8.13.3 | *TB* B3.1 | E2 |
| 勿扰 / 专注 | 默认关；专注 25/50/90 min，结束迷你简报 ≤ 5 行 | `08` §8.5.4 | ⚫ | — |
| 延后（`S`，`needs_you.snooze{until}`，ADR-183） | 选项 15 min · 1 h（默认）· 4 h · 明天 09:00；阻塞类条目（`08` §8.8）只提供 15 min 与 1 h，上限 1 h。延后的条目留在主列表并标“已延后至 hh:mm”，不进入“稍后”分区；到期后照常路由（含最长等待与防饿死） | `08` §8.3.4 | ⚫ | E3 |
| `lockScreenPrivacy` / `autoTune` / `soundForSeverity3` | 开 / 开（M1 中无效，M2 起生效）/ 关 | `02` §2.14；`08` §8.9.2 | ADR-019、ADR-038 | E3 |

### 16.2.5 评审与调度

| 参数 | 值 | 所属 § | 依据 | 回填 |
|---|---|---|---|---|
| 评审积压上限 `reviewBacklogLimitLoc`（C） | 1500 LOC；`null` = 关；默认提示模式 | ADR-014；`08` §8.5.5；`06` §6.2.4 | ⚫ / SmartBear 🟡（仅展示） | E8 |
| 有效评审下限 | 停留 ≥ `max(5 s, 1.2 s × loc)` 且所有 hunk 进入视口；每 contentHash 计一次 | ADR-014 | ⚫（≈ 3000 LOC/h 略读上限） | E8 |
| `backlog` Needs-You 条件 | 阻止模式（M2）下持续 ≥ 30 min；提示模式下 `H ≤ −C/2`；每天至多一条 | `08` §8.5.5 | ⚫ | E8 |
| 评审批次 | ≤ 400 LOC、≤ 60 min | `08` §8.5.5 | SmartBear 🟡 | E8、E11 |
| 预计评审时长（展示） | 300–500 LOC/h | `08` §8.5.5 | SmartBear 🟡 | E8 |
| `review.unitMaxLoc` | 300 | `02` §2.5 | SmartBear 🟡 | E8 |
| `budget.maxDiffLoc` | `2 × unitMaxLoc × 3`（= 1800） | `02` §2.5 | ⚫ | E8 |
| `maxConcurrentGoals` | 默认 3；范围 1–10；M1 构建封顶 3（ADR-038） | `02` §2.14；`06` §6.2.4 | BCG/HBR 🟡 | E3、E8 |
| 新 Goal 默认风险 | 由围栏建议（⚙️），人决定 | `02` §2.4 | — | — |

### 16.2.6 隔离、git 与资源（`10`、`13`）

| 参数 | 值 | 所属 § | 依据 | 回填 |
|---|---|---|---|---|
| 端口段 | 20000–29999，每段 20 个（`20000 + 20·k`），分配前 `bind` 探测、冲突跳段；注入 `TOWER_PORT_BASE`/`PORT`（= base）/`TOWER_PORT_COUNT`（20）；`VerifyProfile.env.vars` 模板 `${port:N}`、`${portBase}`；添加项目时端口能力试运行，失败 → `ports:"fixed"`、服务并发度 1 | `10` §10.19；`07` §7.4.4 | ADR-037、ADR-055 | SP5 |
| git 最低版本 | ≥ 2.40（低于则雷达降为 `overlap_only`） | `10` §10.1；`06` §6.7 | — | SP5 |
| 分支 slug | ≤ 32 字符 | `10` §10.2 | ⚫ | — |
| `checkpoint.settleWaitSec` | 5 s：settle 时 tower-goal 扩展等待未完成的检查点请求的上限；超时照常继续，映射以 `checkpoint.created.piEntryId` 为准 | `10` §10.7.2；`05` §5.6.5 | ADR-183/184 | — |
| 磁盘预算 | Tower 总占用 ≤ min(30 GB, 卷可用 20%)，含永久重放包与镜像保留对象（ADR-095）；磁盘压力 = 可用 < 10 GB；永久证据 > 10 GB 时 severity 1 提示（导出并清除旧证据属 M2，ADR-195）；永久证据从不自动删除；人的工作现场（已脱离的检出与 `.kept-*`）不计入、从不自动删除，单独计量，估计独占大小 > 10 GB 时 severity 1 提示（`10` §10.2、§10.4.4，ADR-228/229；各存储提示的呈现见 `08` §8.1 “存储提示”）；磁盘满（`06` §6.8 F8）的只读解除：每 30 s 与每次 `goal.delete_kept` 之后复查，`~/.tower` 与各 `<wtRoot>` 所在卷（从数据库读出）可用空间都 ≥ 2 GB，不可访问的 `<wtRoot>` 的卷不在复查集合中，读不出剩余空间的 `<wtRoot>` 计为不可访问（`06` §6.1.6，ADR-235），`~/.tower` 所在卷读不出时这一项按未知计、显示存储提示（ADR-236）；启动时（含只重启 Supervisor）这些卷中任一 < 2 GB 即以只读状态启动，求不出的卷不单独触发（ADR-232/233），只读启动时存活 Host 中的 Run 被中止（ADR-233）；必需路径只有根（附着的检出与 `<wtRoot>`，含人工编辑检出所在的 `<wtRoot>`，ADR-238）——根不可访问时（卷未挂载、被移动、被删除或没有权限）用到它的 Goal 判为不可达，不判为卫星或人工编辑检出丢失、不阻止只读的解除，重新可访问时照常；根可访问而其下的卫星或人工编辑检出被删除时按丢失处理（`06` §6.1.6，按 Goal 判定，ADR-235/236/238）；复查集合另并上本次触发 `ENOSPC` 的卷（进程内，ADR-234）；解除阈值 2 GB 低于磁盘压力的 10 GB，填得快的负载可能多次进入 F8，每次只中止 Run、检查点保留工作（如实登记，ADR-232） | `10` §10.3.2、§10.4.4；`13` §13.11.3；`06` §6.8 | ADR-095、ADR-231、ADR-232 | SP5、E13、G35e |
| `abandoned` worktree 清理 | 7 天无访问 | `10` §10.3.2 | ⚫ | — |
| 检查点保留 | 唯一定义在 `10` §10.3.2 “检查点保留”（哪些 ref 在 30 天时保留、影子何时删除，本表不复述；ADR-194/239） | `10` §10.3.2 | ⚫ | — |
| 检查点降级 | 连续 3 次 > 1 s → 每 3 个回合一次 | `06` §6.8；`10` §10.7.2 | ⚫ | SP5 |
| 指纹 / 检查点预算（ADR-075） | 决定性 = 影子索引 stat 检查：2 万文件无变化 ≤ 150 ms；检查点额外 ≤ 20 ms；完整重哈希只在验收与 seal（参考 2 万文件 2.6–7.2 s，SP5 回填）；`in_review`/`accepted` 期间文件系统事件驱动（监视降级时 60 s 巡检，见下方“文件监视降级”） | `13` §13.1、§13.11.1；`10` §10.1.2 | ADR-075 | SP5 |
| 冲突雷达（**M2**） | 检查点后 60 s 去抖；单次 ≤ 2 s（merge-tree 超时 5 s）；全局 CPU ≤ 2% | `10` §10.9.3；`13` §13.1 | ⚫ | E6 |
| 远端 base 轮询（**M2**；M1 不轮询，只在 `10` §10.1.2“远端 base 的获取时机”的四个时机获取，ADR-185） | M2：每 5 min，失败退避至 30 min | `10` §10.9.3、§10.1.2 | ⚫ | — |
| 合并队列（**M2**） | 并发 1；Q5 总时长 ≤ 15 min，交叉检验 ≤ 5 个 Goal；CAS 重试 ≤ 3 次 | `10` §10.11 | ⚫ | E6 |
| PR 轮询（**M2**，ADR-133） | 前 10 min 每 1 min；之后每 5 min；24 h 后每 30 min | `10` §10.12 | ⚫ | — |
| 备份 bundle | 新检查点 10 min 去抖；`claimed`/`accepted`/退出时必做；完整 bundle > 1 GB 先询问；`abandoned` 保留 30 天 | `10` §10.16.3 | ⚫ | — |
| 锁超时 | `repoLock` 写 60 s；`wtLock` 30 s；陈旧 `index.lock` > 60 s；重试 200 ms / 1 s / 5 s | `10` §10.17 | ⚫ | — |
| 空闲维护 | 无 running Goal 且用户 10 min 无输入 | `10` §10.17 | ⚫ | — |
| 仓库租约 | 每 10 min 续租；他机租约 24 h 内 → 只读 | `06` §6.1.9 | ⚫ | — |
| 资源预留 | 系统与用户应用保留 25% RAM / `max(2, 0.25 cores)`；Tower 0.65 GB（= `13` §13.8.1 四项“负载时”之和）/ 0.5 核；每 Goal：Host（见“Host 内存”）+ 进程树 `p90_g`（无历史 1.2 GB）/ 1 核；每验证槽位 `max(1 GB, 1.3 × p95(验证进程树峰值, 近 20 次))`（无历史 2 GB）/ 2 核；服务 0.5 GB（docker 1 GB）/ 0.5 核；fsmonitor 在 ADR-060 下默认关闭（0；启用时每卫星或槽位 15 MB）；CPU 为软约束 ≤ 1.5 × cores（超出只降槽位数）。参考配置：16 GB = 3 Goal + 2 槽位（超出时槽位自动降为 1） | `13` §13.8.3 | ADR-042 | E6、SP2、SP4 |
| 进程树杀进程上限 | `max(m_kill_v, 1.5 × p90_g, 2 GB)`（`m_kill_v` = 该项目验证器杀进程上限 `max(2 GB, 2 × m_v)`，`m_v` = 验证槽位预留）；`p90_g` 只用于预留 | `13` §13.8.3 | R3-D10-01 | E6 |
| 验证延迟预算（M1） | 参考项目（5 分钟测试套件、峰值 ≤ 2 GB）：claimed → in_review p50 ≤ 10 min、p95 ≤ 20 min；其他项目只展示实测预测 | `07` §7.4.10；`13` §13.8.3 | ADR-042 | E6 |
| 机会式验证 | 仅当正式验证队列为空且有空闲、已预留的槽位；参考配置下预期每 Goal 每 20–25 min 一次（槽位允许约 15–25 min，每小时核心分钟上限把下限压到约 20 min，`13` §13.8.3，ADR-208） | `07` §7.4.10；`13` §13.8.3 | ADR-020、ADR-042、ADR-053 | E4、E12 |
| git 隔离（ADR-060/071–075/081–083/088–090/096/097/100） | 镜像 `~/.tower/projects/<projectId>/mirror.git`（只回收不可达对象；`refs/tower-live/*`、`refs/tower-retain/*`——后者只为永久重放包，ADR-095；`refs/tower-remote/<r>/<b>`——远端引用 base 的远端最新值，ADR-155 补记 2）；卫星工作目录 `<wtRoot>/<goalId>` **无 `.git`**，gitdir `<wtRoot>/_gitdirs/<goalId>`（`clone --shared --no-checkout --separate-git-dir`）**整体归 Agent**（ADR-089），无远端；S2 拒绝在工作目录**任意深度**创建名字在 ASCII 大小写折叠下等于 `.git` 的条目（macOS；正则写为逐字符的大小写类 `^<卫星 realpath>/(.*/)?\.[Gg][Ii][Tt](/|$)`，ADR-123；其余等价变体与 Linux 见 `nested_repo_live`，ADR-131）；Agent bash 不导出 `GIT_DIR`、导出 `GIT_CEILING_DIRECTORIES=<wtRoot>`，PATH 首位的 git 垫片只对卫星内运行的 git 注入 `GIT_DIR`/`GIT_WORK_TREE`，并剥离继承到卫星外或 `init`/`clone` 的同名变量（ADR-088/090，单次开销目标 ≤ 5 ms）；Host 及其派生进程 `GIT_CEILING_DIRECTORIES=<wtRoot>`；Tower 对卫星与 gitdir 的原始文件操作只有创建/整体删除/整体重建，逐级 `O_NOFOLLOW`、只接受普通文件、读取上限 1 MB / 超时 2 s，读 gitdir 只由 Tower 在隔离 worker（读范围仅该 gitdir、无写、无网络、内存 ≤ 256 MB）中自行解析普通文件（HEAD、ref、提交对象；单对象解压后 ≤ 1 MB、总解压 ≤ 32 MB、delta 链深度 ≤ 50、≤ 200 个提交、超时 5 s；不读 config/include/alternates，镜像中的 delta 基对象视为缺失，ADR-100、R8-D11-02）；所有沙箱外 git 环境注入 `safe.bareRepository=explicit`，裸仓库布局计为 `nested_repo`（ADR-096）；Agent 侧 `GIT_EXEC_PATH` = 垫片 exec-path（ADR-097；目录键 = (真实 git realpath, 版本) 的哈希，每个 Run 开始前比对指纹、变化即重建，ADR-105）；seal 提交说明结构与 trailer 集合 `Tower-Goal` · `Tower-Contract` · `Tower-Verified-At`（仅已验证/有保留）或 `Tower-Not-Machine-Verified: <human_only|ecosystem_unsupported|submodules_unsupported|s0_denied>`（ADR-108）· `Tower-Human-Edit`（可选）· `Tower-Override: <detector> <路径>@<哈希>`（可选，ADR-109/112）· `Co-authored-by`（可选）；检查点与 pin 提交上的 trailer 另有 `Tower-Satellite-Head`（只在检查点上）与 `Tower-Local-Exclude`（`10` §10.7.1，不进入 seal；随“保留审计地标”的地标检查点进入用户仓库，ADR-207/208），说明为四段（第 2 段“人的说明”可选；第 3 段“Agent 提交记录”在解析失败时省略，`10` §10.6），Agent 提交信息以引用段放入并剔除 trailer 形态的行（`10` §10.6，ADR-105）；嵌套仓库与符号链接：**唯一权威检查 `pinSafetyCheck(baseTree, pinTree)`**（ADR-109：只看 tree 对象；仓库形态候选目录（含名字（按 `10` §10.1.2 的名字比较规则（ADR-120））为 `head`/`commondir`/`gitdir` 的文件或链接）下的任何增删改 → `nested_repo{dir}`（ADR-111），pin 中**全部**符号链接在 pin tree 内整链解析，越出仓库、成环、经过 tree 中不存在的分量或 `.git` 分量 → `symlink_escape`（ADR-112/116），仓库根本身也是候选目录，均 severity 3、不排除只阻断；`verify()` 第一步，验收与 seal 时复核；覆盖绑定对象哈希，seal 写 `Tower-Override: <detector> <路径>@<哈希>`）；卫星侧为早期预警，两步（ADR-101）：名字粗筛（大小写不敏感匹配 `head`/`.git`，被忽略目录也扫描；所有非终态由文件系统事件增量维护；全量在 Run 开始前、交接/检验前、Tower 写回后、丢事件或监视降级时，以及 S0 下每次 settle 与影子操作前，10 万条目 ≤ 1 s；`10` §10.3.1）+ 只允许执行 git 的沙箱中 `git rev-parse --absolute-git-dir` 确认（`safe.bareRepository=all`，每候选 ≤ 2 s，单次 ≤ 200 个新候选）；预警只用于运行中提示与两种检出；两种检出由影子树物化，`pinSafetyCheck` 未覆盖的命中路径不写出（含被改动的 base 夹具），已覆盖目录按白名单写出（`objects/**` 不含 `objects/info/**`、`refs/**`、`packed-refs` 为 pin 版本，其余为 base 版本，ADR-124），依赖目录物化后名字扫描、命中不写出（ADR-116），未改动的 base 夹具照常写出；名字比较规则唯一定义在 `10` §10.1.2（ADR-120，覆盖 HFS+ 忽略的码位），依赖由 depcache 物化或安装器后台重建；所有沙箱策略路径先取 realpath；人工编辑检出 `<wtRoot>/_human/<goalId>`；检验检出 `<wtRoot>/_inspect/<goalId>`（验证器档位、独立端口段、白名单环境终端）；影子 `~/.tower/goals/<goalId>/git/<projectId>.git`（alternates → 镜像，Agent 不可读写）；用户仓库对 Agent 读写均拒绝（ADR-082）、默认无 `refs/tower/*`，集成时只写 seal 分支 `<prefix>/<goalId>-<slug>`；嵌套 `.git` 扫描排除；GitRunner 只允许执行 git、写范围限定为本次操作所需目录；决定性指纹 = 影子索引 stat 检查 | `10` §10.1–10.3、§10.6.1、§10.7.1、§10.8.1、§10.8.3–10.8.4、§10.17.1；`11` §11.6.2 | ADR-060、ADR-081、ADR-089、ADR-096/097/100 | SP6b G1–G37 |
| Agent 后台进程的识别与终止（ADR-142） | 每 Run 一个令牌（`runs.process_token`），运行中不写任何进程追踪事件；settle 与重启时按令牌枚举，发信号前再确认；SIGTERM 后等待 10 s 再 SIGKILL | `10` §10.3.1；`13` §13.11.1 | ADR-115、ADR-121、ADR-142 | W18 夹具（重启扫描耗时） |
| 可执行或重定向的 git 配置键（唯一定义，ADR-124） | **规则**：值会被 git 当作命令执行、或使 git 读取其他路径的键。**示例清单**：`core.fsmonitor`、`core.hooksPath`、`core.pager`、`core.editor`、`core.sshCommand`、`core.askPass`、`core.worktree`、`sequence.editor`、`diff.external`、`diff.*.textconv`、`merge.*.driver`、`filter.*`、`credential.helper`、`alias.*`、`gpg.program`、`include.path`、`includeIf.*.path`、`url.*.insteadOf`、`extensions.worktreeConfig`、`uploadpack.packObjectsHook`。用途只限覆盖对话框的高亮；两种检出的写出是白名单（`10` §10.1.2），不依赖此清单是否完整 | `10` §10.1.2；`07` §7.3.2；`04` §4.6.2 | ADR-124 | — |
| 不可达对象 prune 宽限（唯一来源） | 影子与镜像相同：`2.weeks.ago`（取代此前 `10`/本表的 `1.hour.ago`，与 `06` §6.6.4 统一，R5-D13-01c）；影子 gc 持 `wtLock`，镜像 gc 每周空闲一次、持 `repoLock` 写锁并先同步 `refs/tower-live/*` | `10` §10.17、§10.17.1；`06` §6.6.4 | ADR-083 | — |
| 镜像增长提示 | 镜像独占大小 > max(2 × 用户 `.git/objects`，用户 `.git/objects` + 5 GB) → 存储面板 severity 1，说明可对已归档或已放弃的 Goal 执行“清除一个 Goal”（`09` §9.12.4）；按时间删除重放包属 M2（ADR-196） | `10` §10.17.1 | ADR-083 | SP5 |
| 文件监视降级 | 丢事件标志（FSEvents `MustScanSubDirs`/`UserDropped`/`KernelDropped`、inotify `IN_Q_OVERFLOW`）→ 立即 decisive；监视建立失败或 inotify 额度不足 → 每 60 s decisive 巡检并标注“监视降级” | `07` §7.3.2；`13` §13.11 | R5-D10-02 | SP5 |
| 后台 git 总预算 | 60 s 窗口 ≤ `0.10 × cores × 60` 核秒；磁盘读 ≤ 50 MB/s；超支 30 s 降级，< 70% 持续 2 min 恢复 | `13` §13.11.2 | ⚫ | SP5、E6 |
| Host 内存 | 目标 ≤ 60 MB（假设值）；软上限 150 MB；`--max-old-space-size=512` | `13` §13.1、§13.8 | ⚫ 假设 | SP2 |
| **Host 粒度回退规则（唯一）** | SP2 在参考负载（含 1 个用户扩展与 1 个 MCP 服务器）下测得独占 Host 稳态 RSS **p95 > 120 MB** → M1 默认改为打包模式，**K = 4**（每个 Host 至多 4 个 Goal，只合并扩展集合相同的 Goal，`06` §6.1.1 打包的分组，ADR-232）；否则默认独占。资源模型中每 Goal 的 Host 预留 = 独占时实测 p95，打包时实测 p95(打包 Host) / K（按满载的 Host 计：分组之后未满的 Host——如单独占一个 Host 的高风险或清单确认之前的 Goal——少记至多 (K−1)/K × p95，每个未满的 Host 约 0.1 GB，由内存压力刹车兜底，如实登记，ADR-233） | `06` §6.1.1；`13` §13.1、§13.8.3 | R2-D10-01 | SP2 |
| Host RSS 动作 | > 150 MB 提示；> 300 MB 或堆 > 400 MB 建议交接 | `13` §13.8.2 | ⚫ | SP2 |

### 16.2.7 性能预算（`13` §13.1 为准，此处只登记关键项）

| 参数 | 值 | 所属 § | 回填 |
|---|---|---|---|
| 冷启动 → 可交互列表 | p50 ≤ 500 ms、p95 ≤ 800 ms（假设；原型 p50 > 700 ms 时改为实测 + 20%） | `13` §13.1 | SP8 |
| 聚焦 Goal 事件 → 绘制 | 120 Hz：p95 ≤ 16 ms；60 Hz：p95 ≤ 33 ms（**分档**） | `13` §13.1；`06` §6.5.3 | P3 |
| Needs-You 产生 → 可见 | p95 ≤ 100 ms | `13` §13.1 | P6 |
| 命令 → 回执 / steer → Pi 队列 | p95 ≤ 50 ms / 200 ms | `13` §13.1 | P2 |
| 按键 → 绘制 | p95 ≤ 8 ms | `13` §13.1 | P5 |
| 事件日志批提交 | 每 50 ms 或 256 条；p99 ≤ 10 ms；单条载荷 ≤ 16 KB | `13` §13.9 | P2 |
| 投影快照 | 每 1000 事件或 60 s | `13` §13.9.3 | P1 |
| IPC 帧 | ≤ 8 KB；背压 inflight > 8 或未确认 > 256 KB | `06` §6.4.5、§6.5.2 | P2 |
| 内存：空闲 / 10 流式 Goal | ≤ 250 MB / 独占 ≤ 900 MB、打包 ≤ 600 MB | `13` §13.1 | E6 |
| 进程内存预算（空闲 / 负载时，ADR-185） | main 50 / 80 MB；renderer 100 / 300 MB；GPU 30 / 150 MB；Supervisor 70 / 120 MB——空闲四项之和 = 250 MB；Engine Host、Verifier Runner、RPC Host（M2）见 `13` | `13` §13.8.1（唯一定义；`06` §6.1 引用） | E6 |
| 过载降级迟滞 | 超阈 2 s 进入，低于 10 s 退出 | `13` §13.13.1 | E6 |
| WebGL 终端 | ≤ 4 个；scrollback 5000 行 | `13` §13.7 | — |
| 运行器完整性复核（ADR-092） | stat 遍历 + 变化文件哈希 ≤ 1 s；ctime 不可信时全量哈希回退 ≤ 3 s | `13` §13.11.1；`07` §7.4.3 | SP5 |
| Agent 侧 git 垫片（ADR-088/090） | 单次额外开销 ≤ 5 ms；> 10 ms 改为 `posix_spawn` 直通 | `13` §13.11.1 | SP5 |
| 文件辅助进程的启动（ADR-222） | 一次 `read` 一次启动、`write` 一次、`edit` 两次；单次额外开销 p95 ≤ 30 ms（⚫）；> 60 ms 时同一批同时等待的读取共用一次启动 | `13` §13.11.1 | SP6a |

### 16.2.8 安全、serve 与数据保留

| 参数 | 值 | 所属 § | 依据 | 回填 |
|---|---|---|---|---|
| 项目级授权有效期（M3，ADR-183） | 30 天 | `11` §11.2 | ⚫ | E7 |
| 单向门双确认 | 按住 1.5 s 或输入目标名（解析不出时输入动作类名，§16.3） | `11` §11.2 | theory §C10 | — |
| 文件工具辅助进程（ADR-221/222） | 按次启动的一次性子进程（启动次数与开销见 §16.2.7）；单次读取的回复与写入的请求 ≤ 16 MB（S0 下同样适用）；每次操作墙钟 ≤ 10 s，超时先杀掉其进程组并等它们退出再报失败（S0 下不适用） | `11` §11.3.1 | ⚫ | E6 |
| 门禁判定开销 | p95 ≤ 5 ms | `11` §11.4 | ⚫ | E7 |
| 致命三要素触发率目标 | S2 下 ≤ 10% 合同；采纳率 < 20% 且触发 > 10% → 复审 | `11` §11.8 | ⚫ | E3、SP7 |
| 自适应自主度晋升 | Wilson 95% 下界 ≥ 0.90（只计 confirmatory）、`distinct_goals ≥ 5`、近 30 天 0 incident；窗口 90 天；1 次 incident 降一级、30 天 2 次重置 | `11` §11.5 | ⚫ | E7 |
| M1 bash 审批率 | S2：≤ 10%（M2 AST ≤ 5%）；S0：≤ 25% | `14` §14.3.5 | ⚫ | SP7、E7 |
| 审计保留（唯一定义，ADR-195） | 永久：`audit.*` 事件不按时间删除（与 `02` §2.13 分层保留相同；`06` §6.3 的删除触发器只允许删除 `engine.*`）；隐私清除只删其载荷，“清除全部”随 `~/.tower` 删除（`09` §9.12.4）；哈希链 M2 | `11` §11.11 | ADR-005、ADR-038 | — |
| serve 监听 | `127.0.0.1:7477`；非回环须 TLS 或网络层保护确认 | `06` §6.4.7 | ADR-013 | — |
| serve 令牌 / 限流 | 256 bit；`cmd` 10/s、`req` 50/s；认证失败 5 次锁 10 min | `06` §6.4.7 | ⚫ | — |
| `engine.*` 细粒度事件 | `archived` 或 `abandoned` 30 天后删除（先写快照） | `06` §6.6.4 | ADR-005、ADR-057 | — |
| 心跳 Fact | 保留 24 h + 转移前后各一条 | `06` §6.6.4 | ⚫ | — |
| 事件库增长预算 | 日增长 ≤ 260 MB（10 并发重度）；30 天窗口峰值 ≤ 5 GB（按约 22 个工作日计；ADR-197）；`archived`/`abandoned` 30 天后删 `engine.*` | `13` §13.9.3 | ADR-005、ADR-057 | E6 |
| Pi JSONL 归档 | 归档 180 天后经确认打包 | `06` §6.6.4 | ⚫ | — |
| 日志 | 14 天或 200 MB | `06` §6.6.4 | ⚫ | — |
| DB 备份 | 7 份日备份 + 4 份周备份 | `06` §6.6.3 | ⚫ | — |
| 诊断包 | 最近 2 h 日志 | `06` §6.7 | ⚫ | — |
| 启动自检 | 磁盘剩余 ≥ 2 GB；WAL > 256 MB 触发截断；硬链接探测合计时限 10 s，结果的缓存见 `06` §6.7 | `06` §6.7、§6.8 | ⚫ | — |
| 安全模式 | Supervisor 10 min 内崩溃 5 次；退避 0.5 → 30 s；renderer 每分钟最多重载 3 次 | `06` §6.1.3、§6.1.7 | ⚫ | P7 |

### 16.2.9 记忆与学习（`09` §9.13 为对照表）

| 参数 | 值 | 所属 § | 回填 |
|---|---|---|---|
| 常驻记忆预算 | 120 token；按需 ≤ 20 条写入 `contract.md`，放不进常驻的必选条目另外全部写入、排在最前并标“置顶但未进常驻”；置顶至多占一半，上限计入 `Notes:` 前缀（max(60, 2 + 80)，总能放下一条 80 token 的条目，ADR-185） | `09` §9.5 | C15、E5 |
| 选择阈值 | score ≥ 0.2；Run 中途不注入 | `09` §9.5.2 | — |
| 每作用域置顶上限 | 5 条 | `09` §9.2 | — |
| 复审周期 | user 180 天 / project 120 天；久未使用 90 天；被反驳 30 天内 ≥ 2 次 | `09` §9.1、§9.4.2 | — |
| 提议上限 | Agent 每 Run 5 条；学习闭环每项目每天 5 条；14 天过期；拒绝抑制 30 天 | `09` §9.3.2–9.3.3 | — |
| 去重 | 三元组 Jaccard ≥ 0.6，或同 `subjectKey` 且 ≥ 0.4；与 AGENTS.md ≥ 0.5 | `09` §9.3.3、§9.11 | — |
| 学习效果评估 | 满 10 个相关 Goal 或 60 天；有效 `P(r1<r0) ≥ 0.9` 且均值 ≤ 0.5·r0；无效果需 15 个；数据不足 120 天 < 10 | `09` §9.6.4 | — |
| 学习起草预算 | $0.50/天 | `09` §9.6.3 | — |
| 记分板 | 90 天窗口；n ≥ 10 才显示；n < 30 显示 Wilson 80% 区间；被推翻率 ≥ 25% 标“偏高” | `09` §9.8 | E1 |
| 抽样深审 | N = 10（风险加权），默认关 | `09` §9.10 | — |
| 同步写出防抖 | 10 s；HMAC 必需；版本向量合并 | `09` §9.12.3 | — |
| depcache 上限 | 20 GB（LRU） | `09` §9.12.1 | SP5 |
| 嵌入方案复审触发 | 单项目 > 1000 条或遗漏召回每月 ≥ 5 次 | `09` §9.5.2 | — |

---

## 16.3 快捷键注册表

**规则**（自 `04` §4.17.1 迁入）：同一作用域内一键一义；跨作用域的同一个键必须语义一致，例外写在“备注”。单字母键只在焦点不在可编辑元素时生效，且都有命令面板等价项（`12` §12.14 第 2 条）。全部可重绑；设置 → 快捷键执行冲突检测（`04` §4.15）。多行输入一律 `⌘↩` 提交、`↩` 换行，IME 合成中的回车不提交（`12` §12.14 第 1 条）。

**作用域**：全局 · 列表（概览看板 / 侧栏列表）· 侧栏 · 目标页 · Watch · 诊断 · 轨迹 · 评审 · 需要你 · 简报 · 合同编辑 · 输入框 · 记忆 · 便笺 · 证据 · 托盘弹窗。

| 键 | 作用域 | 动作 | 里程碑 | 备注 |
|---|---|---|---|---|
| `⌘K` | 全局 | 命令面板 | M1 | |
| `N` / `⌘N` | 全局；`⌘N` 亦用于托盘弹窗 | 新建目标 | M1 | `N` 不用于“驳回” |
| `G` `I` | 全局 | 需要你 | M1 | |
| `G` `X` | 全局 | 下一件最值得看的事 | M1 | 取代 `G N`（`08` §8.5.6） |
| `G` `O` | 全局 | 概览 | M1 | |
| `G` `B` | 全局 | 简报 | M1 | |
| `G` `M` | 全局 | 记忆与学习 | M1 | |
| `G` `S` | 全局 | 便笺 | M2 | |
| `⌘,` | 全局 | 设置 | M1 | |
| `⌘1`…`⌘9` | 全局 | 跳到侧栏第 n 个目标 | M1 | |
| `⌘[` / `⌘]` | 全局 | 后退 / 前进 | M1 | |
| `Esc` | 全局；输入框 | 关闭最上层 / 离开输入框；不丢弃草稿 | M1 | |
| `⌘\` | 全局 | 侧栏展开 / 细栏 | M1 | |
| `F6` / `⇧F6` | 全局 | 区域间移动焦点 | M1 | |
| `⌘⌥D` | 全局 | 切换密度 | M1 | 原 `⌘⇧D` 让给调试面板 |
| `⌘⇧D` | 全局 | 调试面板 | M1 | 定义见 `06` §6.7 |
| `?` | 全局 | 快捷键表 | M1 | |
| `⌘⇧N` | 全局 | 便笺新对话 | M2 | |
| `⌘W` | 全局 | 关闭窗口（不退出） | M1 | ADR-017 |
| `⌘Q` | 全局 | 退出（暂停运行中目标） | M1 | ADR-017 |
| `⌘O` | 托盘弹窗 | 打开 Tower 主窗口 | M1 | `04` §4.13 |
| `/` | 列表、记忆 | 筛选 | M1 | 记忆管理器的筛选见 `04` §4.12（ADR-206） |
| `/` | 诊断 | 在轨迹窗口中搜索 | M1 | 诊断线框 `04` §4.7.2（ADR-187） |
| `.` | 列表、侧栏 | 应用延迟的位置变化 / 合并新条目 | M1 | |
| `J` / `K`（`↓` / `↑`） | 列表、评审、轨迹 | 下 / 上一项 | M1 | |
| `↩` | 列表 | 打开；草稿卡片为快速路径 | M1 | |
| `↩` | Watch | 展开所选输出（被截断的工具输出） | M1 | Watch 线框 `04` §4.5.5（ADR-186） |
| `↩` | 诊断 | 展开所选条目（思考、被截断的输出） | M1 | 诊断线框 `04` §4.7.2（ADR-187） |
| `↩` | 目标页 | 执行顶部“等你”一行的主动作（`[↩ 回答]`） | M1 | 目标页线框 `04` §4.5（ADR-191） |
| `↩` | 托盘弹窗 | 执行所选条目的主动作（回答、诊断、处理、评审） | M1 | `04` §4.13（ADR-191） |
| `⌥↩` | 列表 | 草稿卡片：塑形 | M2 | |
| `⇧↩` | 列表 | 就绪卡片：越过一次评审积压上限 | M2 | 仅阻止模式 |
| `Space` | 列表、需要你 | 速览 / 展开证据 | M1 | |
| `⇧X` | 列表、需要你“稍后” | 多选 | M1 | 不选中 `taint.level ≠ none` 或带“可疑指令”标记的记忆提议 |
| `⌥↑` / `⌥↓` | 列表、侧栏 | 组内调整优先级 | M1 | |
| `⌘⌫` | 列表、目标页 | 放弃（需原因） | M1 | |
| `R` | 目标页 | 评审 | M1 | |
| `W` | 目标页、Watch | 状态视图 ↔ Watch 模式 | M1 | |
| `T` | 目标页、Watch | 接管：诊断视图 | M1 | `08` §8.13.1；Watch 线框 `04` §4.5.5（ADR-185） |
| `⇧T` | 目标页 | 轨迹抽屉 | M1 | |
| `C` | 目标页、评审、轨迹、Watch | 对选中对象批注（锚定转向）；无选中时聚焦转向框 | M1 | |
| `⇧C` | 评审 | 必须修复的评论（`requiresChange`） | M1 | |
| `P` | 目标页、诊断、Watch | 暂停 / 继续 | M1 | |
| `⌘.` | 目标页、Watch、诊断 | 立即中断当前回合 | M1 | |
| `E` | 目标页、诊断、评审 | 我来改：暂停并亲自编辑（M1 在人工编辑检出 `_human/<goalId>` 中用外部编辑器，ADR-081；M2 评审中就地编辑 hunk） | M1 | 修订合同为 `⇧E` |
| `⇧E` | 目标页 | 修订合同 | M1 | |
| `⇧V` | 目标页 | 重新验证 | M1 | 与评审中的 `V` 区分；只在 `goal.retry_verify` 接受的状态（`in_review`、`accepted` 与它列出的三种暂停，`06` §6.4.3）显示，运行中的目标不显示（ADR-208） |
| `Y` / `⇧Y` | 目标页、需要你“稍后”；记忆（M2） | 批准 / 驳回选中的假设、决定或记忆 | M1 | 批量批准排除带污染或可疑指令的提议；记忆的批准从 M2 起（`09` §9.0.1，ADR-191） |
| `O` | 目标页、需要你、证据、Watch、诊断；评审·验收面板的 human 标准行 | 打开证据 / 打开目标；Watch 与诊断中 = 打开所选输出的日志（超时、中止或没有退出码且曾被截断的 Agent 命令为 `截断的输出（尾部）`，`07` §7.2.2，ADR-225；诊断 ADR-187）；在 human 标准行上 = **检验**（打开检验检出，ADR-078、`04` §4.6.6）——同一含义族“打开所选对象的证据或可检验形态”，不冲突 | M1 | Watch 线框 `04` §4.5.5（ADR-186） |
| `⌘⇧T` | 目标页、诊断 | “我来改”：接管为 `paused(human)`，经信任提示后在**人工编辑检出**中打开外部终端/编辑器（ADR-081/094；从不打开卫星） | M1 外部 / M2 内嵌 | |
| `End` | Watch、轨迹 | 恢复跟随尾部 | M1 | |
| `1`…`9` | 需要你 | 选择选项 | M1 | |
| `1`…`7` | 简报 | 跳到对应行 | M1 | `08` §8.10.4 |
| `1`…`7` | 轨迹、诊断 | 切换过滤器 | M1 | 均为“选第 n 个” |
| `⌘↩` | 需要你、合同编辑、验收面板、输入框、评审 | 确认 / 批准 / 验收 / 发送（立即）/ 请求修改 | M1 | 均为“提交当前表单”；例外：单向门审批（`isOneWayDoor`）的批准不响应 `⌘↩`，须按住确认 1.5 s 或输入目标名（解析不出目标名时输入动作类名；`12` §12.12 `DecisionCard` 的单向门确认状态，`11` §11.2，ADR-183/186） |
| `⌥⌘↩` | 输入框 | 攒批发送（follow-up） | M1 | |
| `↩` | 输入框 | 换行 | M1 | |
| `S` | 需要你 | 延后（时长见 §16.2.4；与收件箱的“稍后”分区不是一回事，ADR-183） | M1 | |
| `X` | 需要你 | 不可行动（阻塞类条目不提供，`08` §8.8，ADR-182） | M1 | |
| `M` | 需要你、目标页账本 | 改判已回答的问题 | M1 | |
| `↩` | 简报 | 知道了 | M1 | |
| `]` / `[` | 评审 | 下 / 上一个单元 | M1 | |
| `V` | 评审 | 标记单元已看 | M1 | |
| `A` | 评审 | 批准单元 | M1 | |
| `⌘⇧↩` | 评审 | 验收面板 | M1 | `04` §4.6.5 |
| `U` | 评审 | 并排 / 统一 | M1 | |
| `⇧W` | 评审 | 忽略空白 | M1 | |
| `D` | 评审 | 自上次查看的变化 ↔ 完整 hunk | M1 | |
| `F` | 评审、轨迹 | 单元队列 / 文件树 / 锚点过滤 | M1 | 均为“切换左侧过滤视图” |
| `I` | 评审 | 展开意图与关联标准 | M1 | |
| `⇧J` / `⇧K` | 轨迹、诊断 | 下 / 上一个地标 | M1 | 方向与 `J` / `K` 一致；诊断线框 `04` §4.7.2（ADR-187/188） |
| `B` | 轨迹、诊断 | 最近检查点 | M1 | |
| `Q` | 轨迹、诊断、Watch | 把选中事件引用到转向 | M1 | |
| `⌘⇧R` | 诊断 | 回退到检查点（确认） | M2 | 全局唯一含义（见下） |
| `⌘⇧F` | 诊断 | 从检查点分叉（确认） | M2 | |
| `⌘R` / `⌘⌥R` | 合同编辑 | 试运行选中 / 全部 | M1 | 原 `⌘⇧R`，改为 `⌘⌥R` |
| `Tab` | 合同编辑 | 字段间移动 | M1 | |
| `⌘P` / `⌘⇧G` | 便笺 | 固定 / 升级为目标 | M2 | |

**冲突裁决记录**

| 冲突 | 裁决 | 依据 |
|---|---|---|
| `⌘⇧D`：`04` 密度 vs `06` §6.7 调试面板 | 调试面板保留 `⌘⇧D`；密度改 `⌘⌥D` | R1-D8-02 |
| `G N` vs `G X`（下一件） | `G X`；`08` §8.5.6 已改 | R1-D8-02 |
| `E`：修订合同 vs 我来改 | `E` = 我来改；修订合同 `⇧E` | R1-D8-02 |
| `⌘⇧R`：诊断“回退” vs 合同编辑“试运行全部” | 回退保留 `⌘⇧R`（破坏性动作，与 `⌘⇧F` 分叉成对）；试运行全部改 `⌘⌥R`（与 `⌘⌥D` 同为“⌥ 变体”） | 本注册表（`reviews/round-1-response-04-12.md` 待决项） |
| `⌘O`、`⌘Z` 只出现在线框/流程中 | 补登记，作用域分别为托盘弹窗、撤销条；`⌘Z` 与撤销条随放弃的撤销一并删除（ADR-194） | 本注册表 |

**单向门确认的目标名**（ADR-184；`⌘↩` 行的例外，`11` §11.2“双确认”，`12` §12.12 `DecisionCard`）：输入目标名与按住 1.5 s 是同一确认的两种方式，输入方式同时是按住的无障碍替代。名字由 Harness 从解析结果生成并显示在卡片上（与匹配器同源，不取 Agent 的说法）；解析不出名字时，输入方式改为输入卡片上显示的动作类名（例如 `system.change`），仍是按住的无障碍替代（ADR-185）。

| 动作类（`11` §11.1） | 输入的名字 |
|---|---|
| `git.push` · `git.merge` | 目标分支名 |
| `git.pr` | 目标仓库名（`owner/repo`） |
| `external.side_effect` | 环境名或目标主机名（例如 `prod`、`api.example.com`） |
| `edit.outside_worktree` · `fs.delete.unrecoverable` | 目标路径的最后一段（文件或目录名） |
| `secrets.access` | 凭据文件名或条目名 |
| `system.change` | 被改变的对象名（包名、服务名或命令名） |

---

## 16.4 刷新节奏

本表是 Tower 所有周期性刷新与后台节奏的**单一定义**（自 `13` §13.3.1 迁入；R1-D10-05）。机制见 `06` §6.5（合并器）、§6.4.5（背压）与 `13` §13.3。

| 对象 | 节奏 | 来源 / 说明 |
|---|---|---|
| 聚焦 Goal 的 `goal/<id>`、`goal/<id>/live` 数据帧 | 空闲后首个变化立即；之后 60 Hz 屏 16 ms、120 Hz 屏 8 ms（刷新率由 renderer 在 `hello` 上报） | `06` §6.5.1；`13` §13.3 |
| Watch 模式中未聚焦的 Goal | 250 ms（4 Hz） | `13` §13.3 |
| 看板卡片数据帧（模式或 Live Line 变化） | 250 ms | `06` §6.5.1 |
| 看板卡片数据帧（仅计数类字段） | 500 ms | `06` §6.5.1 |
| 后台 Goal Live Line 的**可见文本**变化 | ≤ 1 Hz（renderer 节流） | `gui.md` §7.1；`05` §5.5.1 |
| Live Line `thinking ↔ acting` 最短停留 | 500 ms | `08` §8.6.5 |
| 相对时间文本（“3m”） | 只在档位变化时更新（now / <1m / 3m / stale） | `gui.md` §7.1 |
| `ledger` / `review` / `timeline`（未聚焦） | 500 ms | `06` §6.5.1 |
| `system` topic | 1 s | `06` §6.5.1 |
| 窗口不可见 | `board`、`inbox` 1 s；`live` 停发 | `06` §6.4.5 |
| 注意力关键变化（新/已解决 Needs-You、生命周期、异常 Mode、验证结果、引擎崩溃、余量过零） | 立即（当前 tick） | `06` §6.5.1 |
| Host 侧预合并窗口 | 10 ms（过载时 100 ms）；`tool_execution_update` ≤ 10 Hz | `13` §13.2、§13.13.2 |
| 活动发丝线（默认关） | 5 s | `gui.md` §7.1 |
| 令牌扫描（后台进程识别） | **周期性的全进程扫描最多每 60 s 一次，且只在 Run 活跃、该 Goal 设有内存上限时**（ADR-146）；其余扫描由事件触发：settle 终止、重启清理与 Engine Host 退出或挂死之后的一轮（范围只以 `06` §6.1.6 为准，ADR-226）、无工具调用覆盖的文件事件批次（2 s 内复用）；存活者未全部退出期间每 **30 s** 一次（“知悉”不停止它），全部退出时以 `obsolete` 自动关闭 | `10` §10.3.1；`13` §13.8.3、§13.11.1；ADR-144、ADR-145、ADR-146 |
| 卫星 watcher 的监视范围（ADR-153） | 只在**检出完成标记存在**之后监视该卫星；准备期间的卫星检出与重试时删除未完成工作目录属于 Tower 自己的写入，不触发 `external_change` 或卫星丢失判定；`ready` 中“来源不明的写入”只在标记存在时才可能成立 | `10` §10.3.1、§10.16 | ADR-152、ADR-153 |
| 终端输出写入 | 每终端每帧一次；降级 D6 时 10 Hz | `13` §13.7、§13.13 |
| AttentionRouter tick | 15 s（另在新条目、状态变化、断点事件时立即） | `08` §8.3.4 |
| Engine Host 心跳 | 5 s；超时判定 30 s；睡眠唤醒后宽限 60 s | `06` §6.1；`08` §8.6.3 |
| 工作区指纹（edit/write/bash 结束） | 防抖 500 ms；`turn_end` 强制；降级时 5 s | `07` §7.3.2；`13` §13.11.2 |
| `in_review` / `accepted` 期间的指纹 | 文件系统事件（FSEvents/inotify）触发后防抖 1 s，decisive；丢事件/溢出 → 立即 decisive；监视降级时退回 60 s decisive 巡检（ADR-075、R5-D10-02） | `07` §7.3.2；`10` §10.6 |
| 检查点 | 每个有变更的 `turn_end`；降级时每 3 个 | `10` §10.7 |
| 机会式验证 | 指纹稳定 ≥ 120 s 且距上次 ≥ 10 min，且正式验证队列为空、有空闲已预留槽位（ADR-042）；超额时间隔 10 → 20 → 40 min | ADR-020、ADR-042；`13` §13.11.2 |
| 冲突雷达（M2） | 检查点后 60 s 去抖；base 前移时 | `10` §10.9.3 |
| 远端 base 轮询（**M2**；M1 只在四个时机获取，`10` §10.1.2，ADR-185） | M2：5 min，失败退避至 30 min | `10` §10.9.3 |
| 备份 bundle | 有新检查点时 10 min 去抖；`claimed`/`accepted`/退出时必做 | `10` §10.16.3 |
| PR 状态轮询（**M2**，ADR-133；M1 的 `branch_only` 在每次镜像 fetch 时观测本地 base） | 前 10 min 每 1 min；之后 5 min；24 h 后 30 min | `10` §10.12 |
| 仓库租约续租 | 10 min | `06` §6.1.9 |
| 进程树 RSS 采样 | 5 s（Goal：macOS 从 Tower `exec` 已知的直接进程出发，以 `proc_listchildpids` 递归遍历**后代树**求和，不是全进程扫描；脱离进程树的后台进程由最多每 60 s 一次的令牌全扫描覆盖；Linux 读 Run 子 cgroup 的内存统计，ADR-146）；2 s（验证器） | `13` §13.8.3；`07` §7.4.4；`10` §10.3.1 |
| 事件日志组提交 | 50 ms 或 256 条（人的决定、注意力关键立即） | `13` §13.9.3 |
| 投影快照 | 每 1000 相关事件或 60 s | `13` §13.9.3 |
| WAL 检查点（空闲定时器） | 30 s（`wal_autocheckpoint = 0`） | `06` §6.3；`13` §13.9.2 |
| 合并器统计 | 10 s | `13` §13.3 |
| 每日任务 | DB 备份、`quick_check`、审计链校验、depcache 完整性复核 | `06` §6.6.3、§6.8；`07` §7.4.3；`11` §11.11 |

---

## 16.5 远程（serve / 手机）能力矩阵

**机制**（监听、令牌、Origin/Host 校验、限流、审计）以 `06` §6.4.7 为准；安全要求以 `11` §11.9 为准；手机 UX 立场见 `04` §4.14。`serve` 在 M2 交付（ADR-038）。

**四条总规则**

1. **单向门审批一律只能在本机桌面批准**（任何 scope、任何客户端）；远程只能拒绝、暂停或“延后到桌面”。
2. **远程验收**（`goal.accept` 经远程连接）必须**同时**满足：① `riskTier ∈ {low, standard}`（`high` 只能在本机桌面验收）；② 全部评审单元都已**有效评审**（ADR-014 的下限），且有效评审发生在 `client:"desktop"` 或 `client:"web"` 上——`mobile` 上的浏览不计入；③ 没有既未 `addressed`（只认 ⚙️ 来源：锚定的 hunk 已变）也未被人关闭的 `requiresChange` 评论（Agent 的引用不算，ADR-176）；④ `human` 类标准都已勾选；⑤ 已验证（V/M）对当前指纹**新鲜**。不满足 → `E_FORBIDDEN{remote_accept}`，提示“请在桌面上验收”。
3. **改变安全边界、验收依据或不可逆的命令只能在本机执行**（下表“仅本机”；字段级规则的命令以下方封闭表为准，未列出的字段一律仅本机，ADR-178）。
4. **未单列的命令**（`06` §6.4.3 中有、下表没有单列的）：按 `06` §6.4.3 的 scope 列与 `06` §6.4.7 的 scope 定义授权（`read` 只读；`decide` 见 §6.4.7；`full` 除禁止远程的命令外均可），web 与 mobile 按同一 scope 授权，手机 UI 可不提供入口。`06` §6.4.3 标为“禁止远程 / 仅本机”的命令必须在下表单列为 ✗（lint (v)）。

**矩阵**（“本机”= 本机桌面 renderer；“web / mobile”= 经 serve 的远程客户端；✓ 允许 · ✓* 有条件 · ✗ 禁止）

| 能力 / 命令 | 最低 scope | 本机 | web | mobile | 条件与备注 |
|---|---|---|---|---|---|
| 订阅、查看、`goal.viewed`、`project.local_files.viewed`、`req`（Trace、diff、产物） | `read` | ✓ | ✓ | ✓ | |
| 回答问题 `needs_you.answer`（question） | `decide` | ✓ | ✓ | ✓ | 远程同样受 ADR-023 默认项规则约束 |
| 批准审批（非单向门） | `decide` | ✓ | ✓ | ✓ | 项目级授权（`autonomy.grant`，M3）仅本机；远程只能选“仅这一次”：经远程连接选择“本 Goal 内同类”（或 M3 的“本项目内同类”）返回 `E_FORBIDDEN`（运行时授权只在本机产生，`11` §11.2，ADR-180；取代 ADR-176 的远程同类授权） |
| S0 执行授权 `s0.grant` / 拒绝 `s0.deny`（ADR-022/077） | `decide` | ✓ | ✓* | ✓* | `s0.deny` 无条件允许；远程批准的 `s0.grant` 按远程授权的统一有效期（唯一定义在 `11` §11.9，ADR-176），并与 `11` §11.2 的其余失效条件取先到者（ADR-182）；本机批准没有统一有效期，其余失效条件同样适用 |
| 拒绝任何审批（含单向门） | `decide` | ✓ | ✓ | ✓ | |
| **批准单向门** | — | ✓ | ✗ | ✗ | 总规则 1；`11` §11.1 |
| 暂停 / 继续 / 中止（`goal.pause`/`resume`、`run.abort`） | `decide` | ✓ | ✓ | ✓ | |
| 检查 base `goal.base.check`（ADR-158） | `decide` | ✓ | ✓ | ✓ | 触发一次网络获取（只写镜像，不改动用户仓库或工作区）；打开详情时的自动触发也计入远程客户端；同一 Goal 并发请求合并为一次 |
| 选择 base 观测基准 `goal.base.choose{side}`（ADR-158） | `decide` | ✓ | ✓ | ✓ | 只影响提示与合入判断，不改动工作区或 `baseCommit` |
| 重新判定远端凭据 `project.remote.recheck`（ADR-158） | `decide` | ✓ | ✓ | ✓ | 只读取用户配置并重试被阻止的获取；不改写用户配置 |
| 本地文件清单 `project.local_files.add`、`project.local_files.remove`（ADR-167） | `full` | ✓ | ✓* | ✗ | 加入时按名字与内容判定 `secretBy`，每次复制前重新判定（ADR-170/171，见 `ProjectLocalFile` 行）；未经 `approve` 不播种；**`remove` 对 `isSecret` 条目仅本机**（ADR-176：移除会去掉该路径按清单生成的读拒绝，等于取消标记，总规则 3）；Scratch 的读拒绝按路径模式生效，不随移除解除（`11` §11.6.5）；手机不提供入口 |
| 批准本地文件 `project.local_files.approve`（ADR-167，`HumanDecision{approve_local_file}`） | — | ✓ | ✗ | ✗ | 仅本机：批准后该文件进入播种范围，改变 Agent 可读的内容（总规则 3）；清单中不存在的路径返回 `E_STATE`，不隐式加入（ADR-170） |
| 本地文件机密标记 `project.local_files.mark_secret`、取消标记 `project.local_files.unmark_secret`（ADR-166；后者记 `HumanDecision{unmark_secret_file}`） | — | ✓ | ✗ | ✗ | 仅本机：取消标记会把文件复制到 Agent 可读的工作目录，标记则改变播种范围，二者都改变安全边界（总规则 3）；`mark_secret` 对非 `isSecret` 条目写 `user` 并清除 `unmarked`，对已是 `isSecret` 的条目为无操作、不覆盖依据（ADR-171，见 `ProjectLocalFile` 行）；`unmark_secret` 对 `secretBy = null` 的条目返回 `E_STATE`（ADR-170） |
| 打开检验检出 `inspect.open`（参数 `{goalId, withSecrets?}`，ADR-166/168/169） | `decide` | ✓ | ✗ | ✗ | **来源状态**（ADR-168/169）：`in_review`、`accepted`，以及 `paused` 中由验证结果导致的原因 `verify_failed_limit`、`human_change_verify_failed`、`sentinel_high`（只限由 `verifying` 进入；detector 为 `nested_repo_live` 时返回 `E_STATE`）；检验对象为该 Goal 最近一次完成的验证的 pin（ADR-169）；其他状态返回 `E_STATE`。检验检出在本机打开终端与编辑器，远程无意义；`withSecrets:true`（记 `HumanDecision{inspect_with_secrets}`）在任何情况下都只能在本机 |
| 关闭检验检出 `inspect.close`（参数 `{goalId, modified?}`，ADR-208） | `decide` | ✓ | ✗ | ✗ | 检验在本机打开，远程无意义；`discard` 只放弃带回、目录保留（`10` §10.2，ADR-228），只在本机确认。语义见 `06` §6.4.3 该行（清理的唯一定义在 `10` §10.8.3 第 7 步） |
| 修改验证配置 `project.verify_profile.update`（ADR-166/167） | `full` | ✓ | ✓* | ✗ | **字段级规则**（ADR-167/178，M2 的 `serve` 才相关）：逐字段的**封闭表**见下方“`VerifyProfile` 的逐字段远程规则”，未列出的字段与方向一律仅本机；手机禁止。`env.vars` 的值经机密检查，命中返回 `E_INVALID`，不可绕过 |
| 带机密的标准继续等待 `verify.secret_wait.keep`（**M2**，ADR-164；ADR-160） | `decide` | ✓ | ✓ | ✓ | 只关闭 Needs-You 条目，标准继续排队 |
| 带机密的标准以文件方式运行 `verify.secret_wait.as_file`（**M2**，ADR-164；ADR-160） | `decide` | ✓ | ✓ | ✓ | 本次以 `secretsVia: "file"` 运行，无需互斥，不增加暴露 |
| **接受机密暴露风险**（**M2**，ADR-164）：`verify.secret_wait.run_now`（ADR-160 及补记 2，`HumanDecision{accept_secret_exposure}`；`secrets.access.use_now` 归 M2，ADR-161） | — | ✓ | ✗ | ✗ | 只能在本机执行：确认文案“其他正在运行的 Agent 可能读到该机密”，属于改变安全边界的决定（总规则 3） |
| 外部改动：撤销（`goal.external_change.revert`） | `decide` | ✓ | ✓ | ✓ | ADR-125 |
| 撤回一条排队的开场（`goal.openings.withdraw`） | `decide` | ✓ | ✓ | ✓ | 允许远程；按 `openingId`；已消费返回 `already_delivered`，已撤回返回成功（ADR-144/145） |
| 外部改动：保留（`goal.external_change.keep`） | `decide` | ✓ | ✓ | ✗ | 采纳为人的改动需要有效评审，手机端禁止（ADR-125） |
| 沙箱拒绝信号：知悉（`signal.acknowledge`）、后台进程：再次终止（`process.terminate_again`） | `decide` | ✓ | ✓ | ✓ | ADR-125/126 |
| **沙箱拒绝信号：这是良性的**（`signal.mark_benign`） | — | ✓ | ✗ | ✗ | 改变项目良性清单，仅本机（ADR-125） |
| 转向与评论（`run.steer`、`comment.*`、`comment.send_batch`） | `decide` | ✓ | ✓ | ✓ | |
| 延后 / 不可行动（`needs_you.snooze`/`dismiss`） | `decide` | ✓ | ✓ | ✓ | `dismiss` 对阻塞类条目返回 `E_STATE`（`08` §8.8，ADR-182） |
| 批准 / 驳回说法（`claim.ratify`/`reject`） | `decide` | ✓ | ✓ | ✓ | |
| 手动开始（`goal.start`） | `decide` | ✓ | ✓ | ✓ | 不含越过积压上限 |
| 批准合同 v1（`contract.ratify`） | `full` | ✓ | ✗ | ✗ | ADR-051：只能在本机桌面执行 |
| 快速路径一键批准（`contract.quick_ratify` → `HumanDecision{kind:"quick_ratify"}`） | `decide` | ✓ | ✓ | ✓ | ADR-051：仅当合同为项目默认预设、`riskTier ≠ high`、无致命三要素警告、未放宽任何自主度或范围 |
| 扩展预算（`budget.extend`） | `decide` | ✓ | ✓ | ✓* | 手机只批“小额”：单次延长 ≤ 当前硬上限（生效额度，`06` §6.2.5）的 20% 且 ≤ US$5；超出需桌面或 Web |
| 勾选人工标准（`criterion.check_human`） | `decide` | ✓ | ✓ | ✓ | |
| 标记评审单元（`review.mark_unit`） | `decide` | ✓ | ✓ | ✓* | mobile 可标记，但**不计入有效评审**（`06` §6.4.7 ②） |
| 请求修改（`goal.request_changes`） | `decide` | ✓ | ✓ | ✓ | |
| **验收**（`goal.accept`） | `decide` | ✓ | ✓* | ✓* | 总规则 2；`high` 仅本机 |
| **覆盖哨兵**（`sentinel.override`） | `decide` | ✓ | ✗ | ✗ | 改变验收依据；`04` §4.14 |
| **隔离不稳定测试**（`test.quarantine`，`HumanDecision{quarantine_test}`） | `decide` | ✓ | ✗ | ✗ | 改变验收依据（此后该测试的失败不计入 `maxFailures`，`07` §7.4.6），与 `sentinel.override` 同类，总规则 3（ADR-178）；`07` §7.4.6 的“隔离该测试”提议在远程客户端只能延后到桌面；解除隔离不放宽，按 `VerifyProfile` 封闭表的 `flakeQuarantine` 行 |
| **越过评审积压上限**（`capacity.override`，M2：仅阻止模式） | `decide` | ✓ | ✗ | ✗ | `06` §6.4.7 |
| **在用户检出中本地合并** | — | ✓ | ✗ | ✗ | 逐次确认、不可授权（`10` §10.12） |
| **批准 docker 服务**（`approve_docker`） | — | ✓ | ✗ | ✗ | 单向门级项目设置（ADR-037） |
| **合并 / 拆分项目**（`project.merge`/`split`） | — | ✓ | ✗ | ✗ | 改变 Project 身份（ADR-080）；`06` §6.4.3 标为禁止远程 |
| 修改 Goal 元数据（`goal.update_meta`，ADR-176/178） | `full` | ✓ | ✓* | ✓* | **字段级规则**：**降低** `riskTier`（`high → standard/low`、`standard → low`）仅本机——`riskTier=high` 决定默认不加载扩展与 MCP、`viewPolicy` 下限与只能在本机验收（§16.1.1 `Goal.riskTier` 行），远程降级会绕过总规则 2；降低时同一事务记 `human.decision{lower_risk_tier}`（独立的决定种类，不算合同修订，§16.1.5，ADR-178）；提高 `riskTier` 与其余字段按 scope；手机 UI 不提供入口 |
| 修订合同（`contract.amend`）、塑形、编辑草稿 | `full` | ✓ | ✓* | ✗ | `contract.amend` 按下方“`Contract` 的逐字段远程规则”**封闭表**（ADR-178）：web 只能按表中列明的方向修改列明的字段，未列出的字段与方向一律仅本机；塑形与编辑草稿不产生版本（批准 v1 仅本机，见上方 `contract.ratify` 行）；手机不修订合同 |
| 新建 / 放弃 / 复活 / 优先级 / 依赖（`goal.create`、`abandon`、`resurrect`、`set_priority`、`*_dependency`） | `full` | ✓ | ✓ | ✓ | |
| 回退 / 分叉（M2，ADR-059）/ 接管 / 交还 / 重建卫星（`run.rewind`、`run.fork_goal`（二者 M2）、`goal.take_over`/`hand_back`、`goal.rebuild_satellite`） | `full` | ✓ | ✓ | ✓ | 权限按 scope；手机 UI 不提供入口（`04` §4.14 只覆盖分诊与决定）；`goal.rebuild_satellite` 只写 Tower 的卫星（不写用户检出），与其他恢复命令同样允许远程（ADR-176） |
| 记忆（`memory.*`）、子目标批准、便笺 | `full` | ✓ | ✓ | ✓ | 带污染的记忆提议仍须逐条确认 |
| 引擎偏好（`engine.set_prefs`）、诊断包（`system.diagnostics`） | `full` | ✓ | ✓* | ✓* | `engine.set_prefs` **字段级规则**（ADR-176，仿 `project.verify_profile.update`）：`adapter`、`resources.checkpoints` 仅本机（改变 Agent 运行时与检查点的安全边界）；`resources.gate` 不可设置（门禁不能关闭，§16.6）；其余字段（`model`、`thinking` 等）按 scope；手机 UI 不提供入口 |
| **仅本机**：`project.set_trust`、`settings.update`、`engine.reread_login_shell`、`settings.set_capacity`、`autonomy.grant`/`revoke`、`export.goal`/`import.goal`、`privacy.purge`、`goal.delete_kept`（ADR-228）、`project.relocate`（ADR-236） | — | ✓ | ✗ | ✗ | 改变安全边界或不可逆（`06` §6.4.7） |

**判别原则（ADR-180，适用于下面两张封闭表）**：“收紧”以字段**缺省值下的判定**为基准——凡可能使原本失败的运行变为通过、使原本执行的检查不再执行（如变为 `skipped`）、或放宽自主度、范围与网络的改动，都属放宽；两个方向都可能放宽，或结果取决于被测代码自身行为（例如网络可达性、时区、`.git` 是否可见、内存上限）的字段，一律仅本机。比较对象是**编译后的合同**（含计划编译对 `scope.include` 与 `stopConditions` 的改写，`02` §2.5）与上一版，不是提交的字段差异：两次各自合规的修订合起来也不能把范围放宽到上一版之外（ADR-182）。修订使致命三要素凑齐时，远程一律返回 `E_FORBIDDEN`（三要素在任何合同修订后重算，唯一定义在 `11` §11.8）。

**`Contract` 的逐字段远程规则（封闭表，ADR-178/180，唯一定义；字段见 `02` §2.5）**：web 只能按“web 允许的方向”修改；其余方向、表中标“仅本机”的字段与**表中未列出的字段**一律只能在本机桌面修订。一次修订中任一字段越出 web 允许的方向，整条修订返回 `E_FORBIDDEN`，提示“请在桌面上修订”。

| 字段 | web 允许的方向 | 仅本机 |
|---|---|---|
| `intent.purpose`、`intent.endState`、`intent.context` | 措辞修改（任何方向；`context` 的修改使致命三要素凑齐时按上方原则拒绝） | — |
| `intent.constraints` | 新增条目 | 删除条目；修改已有条目的措辞（改写可以等同删除，ADR-180） |
| `criteria`（新增） | 新增 `artifact`/`human`/`subgoal_accepted` 标准 | 新增 `exec` 标准（新命令会在验证槽位中运行，并按 `11` §11.3.2 使同名命令被归为 `exec.test`/`exec.build`，改变 Agent 命令的自主度，ADR-180）；新增标准带 `env`/`secretsVia`（M2）；新增 `artifact` 标准带 `network` 或 `links_reachable` 检查 |
| `criteria[].title`、`human` 标准的 `howToCheck` | 措辞修改 | — |
| `criteria[].expect`、`repeat`（`exec`） | 收紧：新增或提高 `minTests`、新增或降低 `maxFailures`、提高 `repeat`、原无 `stdoutMatches` 时新增 | `exitCode` 的任何改动（缺省为 0，`07` §7.4.5 的判定按 `exitCode ?? 0` 比较：新增非零值会让以非零码退出的运行判为通过，ADR-180）；修改或删除 `stdoutMatches`；降低或删除 `minTests`；提高或删除 `maxFailures`；降低 `repeat` |
| `criteria[].command`、`timeoutSec`（`exec`）；`artifactGlob`（`artifact`） | — | 任何改动 |
| `criteria[].checks`（`artifact`） | 新增 `exists`/`headings`/`min_words`/`links_internal` 检查 | 删除或修改检查；新增 `links_reachable`（链接检查器在沙箱外访问文档中的链接，`07` §7.4.9） |
| `criteria[].network`（`artifact`，只供链接检查器，`07` §7.4.9） | — | 任何改动：新增主机或 `["*"]` 放宽网络；删除主机使链接检查变为 `skipped`，结论仍是“有保留的通过”（ADR-180） |
| `criteria[].kind` | — | 任何改写（含 `exec`/`artifact` → `human`：去掉机器验证） |
| 删除标准 | — | 仅本机 |
| `scope.include` | 缩小（同一修订把 `includeOrigin` 置为 `explicit`，这是 web 允许的唯一联动，`02` §2.5，ADR-182） | 扩大 |
| `scope.exclude`、`scope.protected` | 新增条目 | 删除条目 |
| `scope.allowNewDependencies` | `true → false` | `false → true` |
| `scope.allowTestEdits` | 收紧（`allow → ask → forbid`） | 放宽 |
| `scope.includeOrigin` | — | 任何改动（随 `scope.include` 缩小置为 `explicit` 的联动除外；计划删空或不再有 `touches` 时编译把 `compiled` 置为 `explicit`，这只发生在本机修订中——见 `plan` 行，ADR-184） |
| `budget.usdSoft`、`usdHard`、`wallClockSoftMin`、`wallClockHardMin`、`maxDiffLoc` | 降低或不变（比较对象为修订前的生效额度；`patch` 未给出的字段由服务端取生效额度，不算改动，`06` §6.2.5，ADR-198/199） | 提高（远程追加额度用 `budget.extend`，见上方矩阵） |
| `budget.interruptsPerHour` | — | 任何改动（改变本 Goal 打扰人的上限，也就改变人对它的监督，方向不单一，ADR-180） |
| `autonomy.levels` | 收紧（`silent → notify → ask → forbid`） | 放宽 |
| `autonomy.grants` | 删除或缩短 `until` | 新增、延长 |
| `autonomy.preset` | — | 任何改动 |
| `stopConditions` | 新增 | 删除或修改（`plan:` 前缀的条目由计划编译生成、不能单独修订，按 `plan` 行判定，`02` §2.5，ADR-183） |
| `maxReworkCycles` | 降低 | 提高 |
| `plan` | 步骤标题措辞（编译生成的 `plan:<stepId>` 停止条件随标题改变的文本按措辞处理）；把步骤设为 `needsDecision:true`（修订后的合同同样经计划编译，按上方原则比较编译结果，ADR-182/183） | 其余改动（增删步骤、`touches`、`criteriaIds`、取消 `needsDecision`） |
| `review.unitMaxLoc` | 降低 | 提高 |
| `review.viewPolicy` | 提高（`none → high_risk_only → risk_at_least_medium → all`） | 降低 |
| `unattended` | — | 任何改动 |
| `amendmentNote` | 必填（措辞） | — |

`goalId`、`version`、`status`、`ratifiedBy`/`ratifiedAt`、`draftedBy` 由 ⚙️ 写入，不能经命令修改。

**`VerifyProfile` 的逐字段远程规则（封闭表，ADR-178/180，唯一定义；字段见 `07` §7.13）**：同上——未列出的字段与方向一律仅本机。凡能放宽验证、运行命令、压制哨兵，或结果取决于被测代码行为的字段都在“仅本机”一侧。

| 字段 | web 允许的方向 | 仅本机 |
|---|---|---|
| `runners`、`commands`、`prepare`、`setup`、`services`、`teardown`、`integration` | — | 任何改动（在槽位与检验检出中运行的命令；`services[].docker` 另需单向门批准） |
| `packageManager`、`node`、`ports` | — | 任何改动 |
| `exposeGit` | — | 任何改动（`.git` 是否可见会改变被测代码的行为，例如需要仓库的测试被跳过，ADR-180） |
| `prepareTimeoutSec`、`pool.size` | 任何方向（只影响准备时限与槽位数；准备超时记 `verify_env_error`，不产生标准结果——降低时限只会让检查以环境错误告终、不会通过，不属判别原则所说“使原本执行的检查不再执行”的放宽，只影响可用性，ADR-182） | — |
| `env.tz`、`env.memLimitMb` | — | 任何改动（时区改变与时间相关的测试结果；提高内存上限会使原本 `resource_exceeded` 的运行通过，ADR-180） |
| `rerunFailed` | 降低 | 提高（重跑越多，不稳定的失败越容易通过） |
| `generatedPaths` | 删除条目 | 新增条目 |
| `prefetch` | — | 任何改动（删除下载会让依赖它的测试缺数据，结果取决于测试代码，例如被跳过，ADR-180） |
| `env.vars` | — | 任何改动（变量可改变测试行为或注入执行，如 `NODE_OPTIONS`；值另经机密检查） |
| `env.network` | — | 任何改动：新增主机放宽执行阶段网络（验证器执行阶段网络的唯一来源，`07` §7.4.4）；删除主机可能使依赖网络的测试被跳过（ADR-180） |
| `fingerprint.bigFileBytes` | 提高 | 降低（更多文件不进入指纹） |
| `irrelevantGlobs` | 删除条目 | 新增条目（沿用旧结果、不重新验证） |
| `testPathOverrides.add`、`testPathOverrides.remove` | — | 任何改动（测试路径集合决定 `11` §11.3.2 的 `edit.tests` 归类与测试完整性哨兵，两个方向都可能改变范围内外路径的动作类，ADR-182） |
| `runnerExceptions`、`sentinelExceptions` | 删除条目 | 新增、修改（压制哨兵） |
| `flakeQuarantine` | 删除条目（解除隔离） | 新增、修改（同 `test.quarantine`） |

`version`、`learned` 由 ⚙️ 写入，不能经命令修改。

- 手机与桌面共用打扰令牌桶（`08` §8.7.2）。
- 每个远程连接与命令记入审计（`actor = token:<名称>`，`11` §11.11）。

---

## 16.6 特性开关

准入与撤回规则：**监督特性**见 ADR-019（规则 (a)–(c)）；改变模型输入的**模型面特性**（`log` 工具、`tower_goal` 系统段、nudge、交接/返工/账本注入）不适用规则 (a)，按 ADR-048 的三条件准入（在 ADR-009 预算内、Trace 中原样可见、有指定实验与撤回规则）。实验对照与撤回条件见 `14` §14.5.0；设置界面见 `04` §4.15。

| 特性 | 默认 | 开关位置 | 实验 | 依据 |
|---|---|---|---|---|
| `log` 工具（模型面特性） | M1 内部使用期开；公开发布的默认值由 E5 决定 | `features.log`（`05` §5.6.1） | E5 | ADR-048、ADR-009 |
| `tower_goal` 系统段（模型面特性） | 开 | — | E5 配对（有/无系统段） | ADR-048、ADR-009 |
| nudge 与 `idle_without_submit` 提醒（模型面特性） | 开（每 Run 1 次） | `features.nudge`（`05` §5.6.1） | E5 附属指标“nudge 后恢复率” | ADR-048 |
| 评审积压上限 | 开 · 提示模式（`reviewBacklogMode = advisory`） | `UserSettings` | E8 → 通过后默认阻止模式 | ADR-014、ADR-019 |
| 测试完整性哨兵 | 开（静态计数不阻断） | VerifyProfile 例外 | E1 + 哨兵基准 | ADR-019 |
| 声明交叉校验器 | 开（硬/软分级） | — | E1 | ADR-019 |
| 机会式验证 | 开 | — | E6、E12 | ADR-020 |
| 虚假成功短语检测（仅提示） | 关 | — | E1 附属 | ADR-019 |
| 独立评审 Run | 关（所有风险等级） | — | E1 变体 | ADR-019 |
| 冲突雷达 | 开（M2） | — | E6 | ADR-019 |
| 重入简报 | 开 | — | E4 | ADR-019 |
| 攒批摘要 | 开（M2；`04` §4.2.4、`14` §14.3.2） | `digestTimes` | E3 | ADR-019 |
| 活动发丝线 | 关 | — | gui A/B | ADR-019 |
| Watch 模式默认 | 关 | `watchModeByGoal` | 使用日志 | ADR-019 |
| 抽样深审 / predict-then-reveal | 关 | — | 无（opt-in） | ADR-019 |
| 自适应自主度晋升建议 | 关（M3） | — | E7 | ADR-019 |
| 声音（severity 3） | 关 | `soundForSeverity3` | E3 | ADR-019 |
| 检查点 / 门禁 | 开 | `features.checkpoints`、`features.gate`（`05` §5.6.1） | — | 非监督特性；门禁**不能关闭**（任何 `riskTier`、任何入口，ADR-176；`05` §5.10 开关表同），`engine.set_prefs` 写 `resources.gate=false` 返回 `E_INVALID`；`checkpoints` 只能在本机修改（§16.5） |
| 自动调节 | 开（M2 起生效；M1 只计算并展示精度） | `autoTune` | E3 | `08` §8.9.2；ADR-038 |
| 锁屏隐私 | 开 | `lockScreenPrivacy` | — | `08` §8.7.2 |
| 应用重启后自动恢复 | 开 | `resumeOnLaunch` | — | ADR-017 |
| 自动 rebase（Run 空闲点，**M2**，ADR-156；M1 中 base 前进只提示） | `rebasePolicy = auto` | Project 设置 | — | `10` §10.10 |
| 用户扩展与 MCP | 标准/低风险：加载已确认清单；高风险：不加载（`noExtensions:true`，ADR-212） | 只能降低 `riskTier`（仅本机，§16.5）；按条目加回推迟到 M2（ADR-213） | — | `11` §11.8.2；ADR-032（MCP 继承用户 Pi 配置） |
| 共享编译缓存（sccache） | 关 | Project 设置 | — | `10` §10.4.1 |
| 菜单栏每目标字形 | 关 | 设置 | — | `12` §12.8.1 |
| 遥测 | 关 | 设置 → 数据 | — | `14` §14.6 |

---

## 16.7 章节索引：每个概念在哪里规定

| 概念 | 规格所在（权威） | 另见 |
|---|---|---|
| 原则 P1–P10、R1–R12；北极星问题 | `00` §0.2–0.4 | `01` §1.4 |
| 竞品、理论、差异化 | `01` §1.1–1.7 | |
| 领域类型（Project、Goal、Contract、Run、Fact/Claim/Decision、ReviewUnit、Comment、NeedsYouItem、Memory、Handoff、Scratch、Event、UserSettings） | `02` §2.2–2.14 | 本文 §16.1 |
| 生命周期状态机、转移表、不变量 I1–I8 | `03` §3.1–3.3 | `06` §6.2.3 |
| 快速路径与塑形、合同修订矩阵 | `03` §3.4.1、§3.4.5 | `04` §4.10 |
| 界面清单、卡片、目标页、评审、诊断、需要你、简报、设置、流程 F1–F12 | `04` §4.2–4.16 | `12` |
| 快捷键 | 本文 §16.3 | `04` §4.17 |
| EngineAdapter、事件映射、tower-goal 工具与钩子 | `05` §5.2、§5.5、§5.6 | |
| 模型面预算与 token 实测 | `05` §5.6.3 | ADR-009、ADR-032 |
| 对话框规格（唯一） | `05` §5.6.4 | ADR-023 |
| 评论投递与回执（唯一） | `05` §5.7 | `02` §2.8 |
| 尝试与会话树 | `05` §5.8 | ADR-015、ADR-027；`10` §10.8 |
| Pi 依赖清单与契约测试 | `05` §5.11.1–5.11.2 | ADR-004 |
| 进程模型、崩溃、退出、睡眠、恢复、安全模式 | `06` §6.1 | ADR-017 |
| EngineManager 准入与槽位 | `06` §6.2.4 | `13` §13.8.3 |
| DDL | `06` §6.3 | |
| UI 协议、命令集、serve 机制 | `06` §6.4 | 本文 §16.5 |
| 合并器 | `06` §6.5 | 本文 §16.4 |
| 数据目录、迁移、备份、保留 | `06` §6.6 | `09` §9.12 |
| 调试面板与自检 | `06` §6.7 | |
| 故障模式 F1–F27 | `06` §6.8 | |
| 观察器、两轨进度 | `07` §7.2、§7.2.4 | ADR-020 |
| 工作区指纹与新鲜度 | `07` §7.3 | |
| 验证器、槽位、依赖存储、端口、verdict | `07` §7.4 | ADR-021、ADR-037 |
| VerifyProfile（唯一类型） | `07` §7.13 | `09` §9.7 |
| 测试完整性哨兵与其他哨兵 | `07` §7.5–7.6 | 本文 §16.1.6 |
| 异常检测器、交叉校验器 | `07` §7.7–7.8 | |
| 严重度与阻断总表、`decide()`、Verified 的唯一定义 | `07` §7.10.1、§7.10.3 | |
| 注意力阶梯、优先级、去重、洪泛、令牌桶 | `08` §8.1–8.5 | `12` §12.8 |
| Mode 推导（唯一） | `08` §8.6.2 | 本文 §16.1.2 |
| 超时默认、OS 通知、Dock 角标 | `08` §8.7 | |
| 告警精度与 outcomeClass | `08` §8.8 | |
| 重入简报、覆盖层优先级、站会摘要、诊断视图 | `08` §8.10–8.13 | `04` §4.9 |
| 记忆作用域、格式、污染、批准、注入、学习、记分板、同步 | `09` §9.1–9.12 | ADR-011、ADR-035 |
| worktree 位置、生命周期、依赖、检查点、回退 | `10` §10.2–10.8 | ADR-008、ADR-021 |
| 外部写入：归因表、归因基线、`external_change` 的检测与出口、I2 与 `external_change` 的分界 | `10` §10.3.1（规则）；`03` §3.2.1（出口） | `02` §2.4 `Goal.externalChange`；ADR-122/128 |
| 变更类工具调用 | 本文 §16.1.4 | ADR-130 |
| `.git` 名字比较规则、S2 禁令的平台差异、`nested_repo_live`、git 拒绝收录 | `10` §10.1.2 | `11` T29；ADR-120/123/131 |
| 冲突雷达、rebase、合并队列、集成模式 | `10` §10.9–10.12 | |
| 外部删除与备份 bundle | `10` §10.16 | |
| 端口与服务 | `10` §10.19 | ADR-037 |
| 动作类、预设、分类、门禁 | `11` §11.1–11.4 | 本文 §16.1.10 |
| 自适应自主度 | `11` §11.5 | `09` §9.9 |
| 沙箱档位与 S2 配置 | `11` §11.6 | ADR-018、ADR-040 |
| 密钥、提示注入、致命三要素、扩展信任 | `11` §11.7–11.8 | ADR-032、ADR-033 |
| serve 安全要求 | `11` §11.9 | `06` §6.4.7；本文 §16.5 |
| 审计、威胁表 T1–T32 | `11` §11.11–11.12 | |
| 视觉令牌、颜色、诚实语法视觉、字形、动效、菜单栏 | `12` §12.2–12.8 | |
| 组件清单、无障碍、中文规则与术语表 | `12` §12.12–12.14 | |
| 性能预算、数据通路、渲染规则、资源模型、后台预算、降级 | `13` §13.1–13.13 | 本文 §16.2.7 |
| 里程碑、M1 范围与退出标准 | `14` §14.1–14.4 | ADR-038 |
| 实验 E1–E12、特性开关对照、指标、风险 | `14` §14.5–14.7 | 本文 §16.6 |
| 架构决策 | `15` | |
| 未决冲突与评审回应 | `reviews/` | ADR-039 |
| 包管理器 × 环境变量 × 读写 × 继承用户配置 | 本文 §16.8 | ADR-043、ADR-045；`05` §5.3.6、`07` §7.4.3、`10` §10.4、`11` §11.6.2 |

---

## 16.8 包管理器 × 环境变量 × 读写 × 继承用户配置（ADR-045、ADR-061、ADR-063、ADR-064）

本表是 Tower 为 Agent、安装器与验证器设置的包管理器相关环境变量的**唯一来源**；`05` §5.3.6、`07` §7.4.3、`10` §10.4、`11` §11.6.2 只引用。SP6c（M1 第 15–19 周；系统份额计入 W8、Agent 份额计入 W9b）的验收清单 P1–P38 逐行覆盖本表（`14` §14.2）。

**角色**：A = Agent 的 bash（S2 内）；I = Supervisor 安装器（独立沙箱，ADR-021；只为第三方依赖安装并运行其构建脚本，项目自身的生命周期脚本在槽位中针对 pin 执行，ADR-062）。**I 分三个阶段 + 发布（ADR-085/092/093，`07` §7.4.3）**：I-fetch = 带注册表认证（每次只从用户级 `~/.npmrc` 读取，写入即时投递文件，阶段结束即删除；Tower 不保存令牌，`$TI` 下没有令牌，ADR-166/167）、只连注册表、不执行任何代码（pnpm `--ignore-pnpmfile`、禁用生命周期脚本；git 托管依赖在 M1 按“生态未支持”）；I-prefetch = 不带令牌、只连已登记下载域名（`VerifyProfile.prefetch`）、只运行 Tower 内置预取器，写入本次运行的暂存目录、由 Supervisor 校验后发布到 `$SH`（Prisma 引擎在发布 depcache 时由 Supervisor 物化到 `$VS/xdg`）；I-install = 不带令牌、断网，`.pnpmfile.cjs` 与第三方构建脚本只在此阶段运行，**只写本次运行的暂存目录 `$VS/staging/<installRunId>/`**，`$VS` 其余只读、`$TI` 读写拒绝；发布 = Supervisor 在沙箱外校验后原子 `rename` 为 `depcache[depsKey]`，来源记入 Tower 数据库。下表 I 列中凡涉及令牌的只适用于 I-fetch，凡涉及写 `$VS` 的在 I-install 中只指暂存目录；V = 验证器（槽位内，S2，执行阶段禁网；**只执行 run 类命令，绝不执行 install**）。

**路径简写**：`$GS` = `<wtRoot>/_stores/<goalId>`（本 Goal 的 Agent 存储，A 可写）；`$VS` = `<wtRoot>/_stores/_verifier`（验证器存储，只有 I 可写，V 只读，**A 不可读**——ADR-082；`$GS` 的预热由 Tower 复制完成，A 不需要读 `$VS`）；`$SH` = `<wtRoot>/_stores/_shared`（浏览器/引擎缓存与 Tower 工具缓存 `$SH/tools` 等大体积缓存，只有 I 可写）；`$SLOT` = 验证槽位目录（只有 Supervisor 与 V 可写）；`$TI` = `~/.tower/installer/<projectId>/`（安装器私有，A 不可读，`11` §11.6.2 读拒绝 `~/.tower/**`）。

**规则（lint 检查）**：

1. **V 列不得引用任何 A 可写的路径**（`$GS`、卫星、`$TMPDIR/tower-<goalId>`）。V 使用的 npmrc、pnpm 配置、浏览器与引擎缓存都由 I 生成在 `$VS`/`$SH`，**写入时做一次全量内容哈希并设为只读**；每次验证前复核——`$VS` 中的小配置文件做内容哈希，`$SH` 与 depcache 中的大体积缓存只做 stat 快照比对（path、size、mtime、ctime、inode；≤ 200 ms），stat 不一致或距上次全量哈希 > 24 h 时才在后台全量哈希（R5-D10-02，预算见 `13` §13.11.1）；哈希不符 → 按 `07` §7.4.3 的唯一处置：`anomaly{detector:"verifier_store_tampered"}`（severity 3）、删除受影响条目、本次 `verify_env_error{stage:"integrity"}`、由安装器重新生成后自动重试一次（ADR-061）。
2. 只设置**当前包管理器主版本**认识的前缀。版本识别（`07` §7.4.3，R4-D7-02）：`package.json#packageManager` → `devEngines.packageManager` → 都没有时在用户检出中以用户 PATH 探测 `pnpm --version`，写入 `VerifyProfile.packageManager` 并经人确认（确认前该项目 pnpm 标准按“生态未支持”处理）。**锁文件版本不能用于区分 pnpm ≤ 10 与 ≥ 11**（三者都写 `lockfileVersion: '9.0'`）。下表以 `<P>` 表示前缀：**pnpm ≤ 10 → `npm_config_`；pnpm ≥ 11 → `pnpm_config_`**；npm 一律 `npm_config_`（避免 npm 11 对未知配置的警告）。
3. **预热**：`$GS` 首次创建时，从 `$VS` 中与当前 `depsKey` 对应的部分以 CoW 复制（不可 CoW 的卷上完整复制，禁止硬链接），使 Agent 的首次安装不重新下载（R2-D10-02）。预热是**复制**，之后 A 对 `$GS` 的任何改动都不会回流到 `$VS`。
4. **代理**（ADR-067）：A 与 I 的 `HTTPS_PROXY`/`HTTP_PROXY`/`ALL_PROXY`（大小写两种写法；`NO_PROXY` 按需）只指向各自的沙箱代理；用户的企业代理作为沙箱代理的上游，不出现在 A/I 环境中。V 执行阶段禁网，不设代理。
5. **由用户配置生成的副本的总规则**（ADR-178/180，唯一定义）：本节凡是由用户配置生成、供 Tower 之外的代码读取的副本——A、安装器第 2、3 阶段（I-prefetch 只运行 Tower 内置预取器、只连已登记的下载域名；I-install 断网、运行 `.pnpmfile.cjs` 与第三方构建脚本；两者的产物流向验证器与 Agent 可读的存储，`11` §11.7.0）与 V 三种读者（§16.8.1、§16.8.2，以及今后新增的生态行）——一律**白名单**（只保留该行列明的键）→ **URL 中的 userinfo 一律剥除** → 保留的值再经 `10` §10.1.2 的**凭据判定**（命中即剔除该键），按此顺序；新增的生态行自动适用，不必逐行复述，行内只列白名单，每个提到副本的列都写明“规则 5”（lint (p)/(P) 按列检查）。安装器第 1 阶段（I-fetch，不执行任何项目或依赖代码）的配置与即时投递的认证行不是本规则所指的副本，见 npmrc 行。

### 16.8.1 M1：Node.js（pnpm 9/10/11/12、npm 10/11）——完整

**I 列按阶段写（R7-D7-02，lint：I 列每个写权限都必须标注阶段）**：F = I-fetch（带令牌、只连注册表、不执行代码）；P = I-prefetch（无令牌、只连已登记下载域名、只运行 Tower 内置预取器；写入本次运行的暂存目录，由 Supervisor 校验后发布到 `$SH`）；N = I-install（无令牌、断网；**只写本次运行的暂存目录** `$VS/staging/<installRunId>/`，一切共享缓存只读，`$TI` 读写拒绝）。“发布”= Supervisor 在沙箱外校验后原子 `rename`（ADR-092）。

| 工具 / 配置 | 环境变量 | A（值 · 读写） | I（值 · 读写，按阶段） | V（值 · 读写） | 继承用户配置 |
|---|---|---|---|---|---|
| pnpm store | `<P>store_dir` | `$GS/pnpm-store` · 读写 | F：`$VS/pnpm-store` · 读写（只加入按 lockfile integrity 校验过的 tarball）；N：`$VS/pnpm-store` · **只读**（pnpm 版本不支持只读 store 时改用暂存目录内的 CoW 私有副本，随暂存目录丢弃，`07` §7.4.3） | `$VS/pnpm-store` · 只读 | 否 |
| pnpm 副作用缓存 | `<P>side_effects_cache` | 默认 | N：`false`（构建结果不写回 store，R7-D7-02） | —（V 不安装） | 否 |
| pnpm 元数据缓存 | `<P>cache_dir` | `$GS/pnpm-cache` · 读写 | F：`$VS/pnpm-cache` · 读写；N：`$VS/staging/<installRunId>/pnpm-cache` · 读写（丢弃） | `$SLOT/.tmp/pnpm-cache` · 读写（丢弃） | 否 |
| pnpm 状态目录 | `<P>state_dir` | `$GS/pnpm-state` · 读写 | F：`$VS/pnpm-state` · 读写；N：`$VS/staging/<installRunId>/pnpm-state` · 读写（丢弃） | `$SLOT/.tmp/pnpm-state` | 否 |
| pnpm 导入方式 | `<P>package_import_method` | `clone-or-copy` | `clone-or-copy` | —（V 不安装） | 否 |
| 物化后的 store 路径 | （写入 `node_modules/.modules.yaml`） | 改写为 `$GS/pnpm-store`，并删除 `.pnpm-workspace-state-v1.json`；兜底 `<P>confirm_modules_purge=false`（无 TTY 时首次 install 不再因 `ERR_PNPM_ABORTED_REMOVE_MODULES_DIR_NO_TTY` 失败，R4-D7-04） | — | 改写为 `$VS/pnpm-store` | 否 |
| 运行前依赖校验 | `<P>verify_deps_before_run` | `false` | `false` | `false`（V 只执行 run 类命令；物化后改写 `node_modules/.modules.yaml` 中的 store 路径为 `$VS/pnpm-store`，并删除 `.pnpm-workspace-state-v1.json`，ADR-063） | 否 |
| npm 缓存 | `npm_config_cache` | `$GS/npm-cache` · 读写 | F：`$VS/npm-cache` · 读写；N：只读（`npm ci --offline` 只读缓存；若 npm 需写索引则用暂存目录内的 CoW 私有副本） | `$SLOT/.tmp/npm-cache` | 否 |
| 用户级 npmrc（registry、scope、镜像、`ca`、`strict-ssl`） | `NPM_CONFIG_USERCONFIG` | `$GS/npmrc` · 只读：由 `~/.npmrc` 生成的**净化副本**（**白名单**，ADR-176：只保留 `registry`、`@<scope>:registry`、`ca`、`strict-ssl`、`fetch-retries`、`fetch-retry-mintimeout`、`fetch-retry-maxtimeout`、`fetch-timeout`、`save-exact`、`save-prefix`、`engine-strict`、`legacy-peer-deps`、`auto-install-peers`、`audit`、`fund`、`update-notifier`、`progress`、`loglevel`、`color`，其余一律不写——认证行（`//<registry>/:` 开头的全部键、`_authToken`、`_auth`、`_password`、`username`）、代理（`proxy`、`https-proxy`，URL 可带 userinfo）、客户端证书与私钥（`cert`、`key`、`certfile`、`keyfile`、`cafile`）、执行类与路径类（`node-options`、`script-shell`、`shell`、`git`、`init-module`、`onload-script`、`prefix`、`globalconfig`、`userconfig`）都在其外；URL 中的 userinfo 一律剥除，保留下来的值再经 `10` §10.1.2 的凭据判定（token 形态等），命中即剔除该键（规则 5 的顺序：先剥除再判定，ADR-180）；M1 中**不写入任何令牌**。“合同显式授予某个 registry 令牌时写入 Agent 可读副本”属于 **M2**，ADR-063 的这一口径在 M1 撤回，ADR-165） | I-fetch（第 1 阶段）：认证行每次只从用户级 `~/.npmrc` 读取（`${VAR}` 以登录环境展开；项目 `.npmrc` 的认证行不读取，ADR-167），写入即时投递文件 `~/.tower/run/<deliveryId>/npmrc`（`0600`，阶段结束即删除），Tower 不保存令牌；该阶段不执行任何项目代码；第 1 阶段的其余配置在 `$TI/npmrc`（不含认证行，A 与第 2、3 阶段不可读），`$TI` 下没有含令牌的 npmrc（ADR-165/166）。P、N（第 2、3 阶段）：`$VS/npmrc` · 只读——与 V 列同一份净化副本，按规则 5 生成（白名单、userinfo 剥除、凭据判定），不另生成安装器副本（ADR-180） | `$VS/npmrc` · 只读：净化副本（按规则 5：白名单同 A 列、userinfo 剥除、凭据判定；带内容哈希，规则 1） | **是**（按角色生成副本，ADR-063） |
| 项目级 `.npmrc` | — | 卫星工作区内，按 `02` §2.5 为 protected | 读取 pin 中的版本 | 读取 pin 中的版本（Agent 对它的改动若使 `node-options` 等执行类键变化 → 哨兵） | 是（仓库内容） |
| Tower 工具缓存（确切版本的 pnpm / npm） | `PATH` 首位 = `$SH/tools/pnpm@x.y.z/bin`（npm 同理）；不依赖 Corepack（Node ≥ 25 不再随附） | 只读 | F：下载到暂存目录，按 `dist.integrity` 校验后由 Supervisor 发布到 `$SH/tools`；N：只读 | 只读 | 否 |
| Node 运行时（ADR-085） | `$SH/tools/node@x.y.z/bin`；版本按 `.nvmrc` → `.node-version` → `package.json#volta.node` → `engines.node`（满足范围的最新 LTS）→ Tower 默认 LTS，人确认后记入 `VerifyProfile.node`，进入 `depsKey` | 只读 | P：下载到暂存目录，校验 SHASUMS256 签名后由 Supervisor 发布到 `$SH/tools`；N：只读 | 只读 | 否（不使用用户的 nvm/volta 安装，三角色同一 Node，原生模块 ABI 一致） |
| `PATH`（ADR-085） | **由 Tower 显式构造**，不继承 GUI 进程的 `PATH`：`$SH/tools/node@…/bin` : `$SH/tools/<pm>@…/bin` : `<卫星或槽位>/node_modules/.bin` : `/usr/bin:/bin:/usr/sbin:/sbin`（A 另追加 Engine Host 环境中工具链变量（`05` §5.3.6 “Host 环境的变量” ①，如 `CARGO_HOME`、`GOPATH`）所指目录下的 `bin`，只取落在 S2 读允许中的（`11` §11.6.2 只读一行“Tower 显式提供的工具链目录”）；不追加 Host 从登录 shell 读到的 `PATH`（`05` §5.3.6，ADR-214）；**A 的最前面**是 Tower git 垫片目录（只读、A 不可写），垫片只对在卫星工作目录内运行的 git 注入 `GIT_DIR`/`GIT_WORK_TREE`，对卫星外或 `init`/`clone` 的调用剥离继承来的同名变量，A 的环境不导出这两个变量，ADR-088/090；嵌套调用经 `GIT_EXEC_PATH` 垫片 exec-path 同样经过垫片，见下行，ADR-097；I、V 不使用垫片） | 按左构造 | 按左构造（无 `node_modules/.bin`） | 按左构造 | 否 |
| git exec-path（ADR-097） | `GIT_EXEC_PATH` | 垫片 exec-path `<wtRoot>/_stores/_shim/git-core-<版本>/`（只读：指向真实 git-core 各程序的符号链接，`git` 换成垫片），使 git 派生子进程中的嵌套 `git` 也经过垫片 | 不设 | 不设 | 否 |
| git 受保护配置（ADR-096） | `GIT_CONFIG_COUNT/KEY_n/VALUE_n` | Agent 侧不注入（卫星内的 git 归 Agent） | 注入 `safe.bareRepository=explicit`（I 不读卫星） | 注入 `safe.bareRepository=explicit` | 否；沙箱外的 Host、MCP、GitRunner、两种检出终端同样注入（`10` §10.1.2） |
| 用户级 gitconfig（ADR-176，唯一定义） | `GIT_CONFIG_GLOBAL` | `$GS/gitconfig` · 只读：由 `~/.gitconfig`（及 `$XDG_CONFIG_HOME/git/config`）展开 `include` 后生成的**净化副本**，**白名单**：只保留 `user.name`、`user.email`、`core.autocrlf`、`core.eol`、`core.safecrlf`、`core.quotePath`、`core.precomposeUnicode`、`init.defaultBranch`、`color.ui` 与 `color.<slot>.*`、`diff.algorithm`、`diff.renames`、`diff.colorMoved`、`diff.mnemonicPrefix`、`diff.noprefix`、`merge.conflictStyle`、`merge.ff`、`pull.rebase`、`pull.ff`、`rebase.autoStash`、`rebase.autoSquash`、`rebase.updateRefs`、`rerere.enabled`、`log.date`、`status.showUntrackedFiles`，以及不以 `!` 开头的 `alias.*`；其余一律不写——`credential.*`、`include*`/`includeIf*`、`http.*`（含 `extraHeader`）、`url.*.insteadOf`/`pushInsteadOf`、`remote.*`、`core.*Command`、`core.hooksPath`、`core.fsmonitor`、`core.pager`/`pager.*`、`core.editor`/`sequence.editor`、`core.excludesFile`、`diff.external`、`diff.<driver>.*`、`merge.<driver>.*`、`filter.*`、`gpg.*`、`user.signingKey`、`commit.gpgSign`/`tag.gpgSign` 都在其外；保留下来的值中 URL 的 userinfo 一律剥除，再经 `10` §10.1.2 的凭据判定（token 形态等），命中即剔除该键（规则 5 的顺序：白名单 → 剥除 → 判定，ADR-182） | 不设 | 不设 | 是（按白名单生成副本，规则 5，ADR-176） |
| `.pnpmfile.cjs`（ADR-085） | — | 卫星内，protected（变更 → `lifecycle_script_changed`） | I-fetch：`--ignore-pnpmfile`，不执行；I-install：随 stage 执行（无令牌、断网） | 不执行（V 不安装） | 是（仓库内容） |
| `file:` / `link:` 本地路径依赖（ADR-085） | — | 卫星内 | 源目录复制进 stage 并进入 `depsKey`；其构建脚本**不**在 I 中执行 | 其构建脚本按项目生命周期在槽位中针对 pin 执行 | 是（仓库内容） |
| 关闭自切换 | `<P>manage_package_manager_versions=false` | 设 | 设 | 设 | 否 |
| node-gyp 头文件 | `npm_package_config_node_gyp_devdir`（ADR-063） | `$GS/node-gyp` · 读写（CoW 预热自 `$SH/node-gyp`） | P：nodejs.org 头文件下载到暂存目录，校验后发布到 `$SH/node-gyp`；N：只读 | `$SH/node-gyp` · 只读 | 否 |
| Playwright 浏览器 | `PLAYWRIGHT_BROWSERS_PATH` | `$SH/ms-playwright` · 只读 | P：Tower 内置预取器按 lockfile 锁定的 `playwright` 版本下载到暂存目录，校验后发布到 `$SH`，不执行依赖代码（ADR-093）；N：只读 | 只读 | 否 |
| Cypress 二进制 | `CYPRESS_CACHE_FOLDER` | `$SH/cypress` · 只读 | P：同上，发布到 `$SH/cypress`；N：只读 | 只读 | 否 |
| Puppeteer 浏览器 | `PUPPETEER_CACHE_DIR` | `$SH/puppeteer` · 只读 | P：同上，发布到 `$SH/puppeteer`；N：只读 | 只读 | 否 |
| 通用 XDG 缓存（**含 Prisma 引擎**：Prisma 无专用变量，引擎缓存在 `XDG_CACHE_HOME/prisma` 下，ADR-063） | `XDG_CACHE_HOME` | `$GS/xdg` · 读写（首次创建时从 `$SH/prisma` CoW 预热） | P：Prisma 引擎下载到暂存目录，校验后发布到 `$SH/prisma`；N：`$VS/staging/<installRunId>/xdg` · 读写（`$VS/xdg` 只读）；发布 depcache 时由 Supervisor 把 `$SH/prisma` CoW 物化到 `$VS/xdg/prisma` | `$VS/xdg` · 只读 | 否 |
| 临时目录 | `TMPDIR` | `$TMPDIR/tower-<goalId>` · 读写 | I-fetch：`$TI/tmp`；I-prefetch / I-install：`$VS/staging/<installRunId>/.tmp`（I-install 对 `$TI` 读写拒绝，R6-D7-02） | `$SLOT/.tmp` | 否 |
| 构建结果缓存旁路 | `TURBO_FORCE=true`、`NX_SKIP_NX_CACHE=true` | — | — | 设置（`07` §7.4.3 `VerifyEnv.set`） | 否 |

**继承的工具链定位变量**（不改写，只读继承用户值；不在 A 可写路径内）：A 经 Engine Host 白名单继承 `JAVA_HOME`、`GOPATH`、`NVM_DIR`、`PNPM_HOME`、`CARGO_HOME`、`RUSTUP_HOME`、`VOLTA_HOME`（`05` §5.3.6 “Host 环境的变量”，ADR-230；M1 非 Node 项目的 `CARGO_HOME`/`GOPATH` 由 §16.8.2 改写为 `$GS` 下的私有目录）；V 只继承 `NVM_DIR`、`RUSTUP_HOME`、`GOROOT`、`PYENV_ROOT`（`07` §7.4.3 `VerifyEnv.inherit`）。

**安装命令与 stage 内容**：以 `07` §7.4.3 为唯一来源，本表与 `10` §10.4.2 不复述命令（ADR-085：I-fetch 只拉取、I-install 不带令牌且断网；stage 保留 `package.json` 中所有影响解析与构建的字段、项目 `.npmrc`、`.pnpmfile.cjs`、补丁文件（路径取自 `patchedDependencies` 的值）与 `file:` 依赖源目录，它们都进入 `depsKey`；项目自身的生命周期脚本在槽位中针对 pin 执行，ADR-062）。

**私有 registry 与令牌**：A 与 V 只拿到净化副本，因此 A 从私有 registry 新增依赖会失败。`dep.add` 获批后，由 Supervisor 以 I 的身份把新依赖安装进本 Goal 的 `$GS` 并更新 depcache；代理安装同样走安装器第 1 阶段：注册表认证每次只从用户级 `~/.npmrc` 读取（项目 `.npmrc` 的认证行不读取，ADR-167），写入即时投递文件，阶段结束即删除，Tower 不保存令牌，`$TI` 下也没有含令牌的 npmrc（ADR-166）——与“推送是被代理的能力”（`11` §11.6.4）同一原则。第三方依赖构建脚本只在不带令牌、断网的 I-install 中运行，令牌对它们不可见（ADR-085/092；`11` T6）。

**篡改用例**（SP6，ADR-061）：Agent 改写 `$GS/npmrc` 的 `node-options` 或删除净化规则——V 不受影响（V 读 `$VS/npmrc`）；Engine Host 同样不受影响（Host 环境不引用 `$GS`，`05` §5.3.6，ADR-213）；Agent 写 `$VS/**` → S2 拒绝；Agent 改项目 `.npmrc` → protected + 哨兵。

### 16.8.2 M1：非 Node 项目的 Agent 侧（ADR-064）

M1 添加非 Node 项目时提示“M1 不支持该生态的机器验证”。验证器不运行；合同中的 exec 标准只计入观测轨（O），Goal 以“未经机器验证（生态未支持）”进入评审。Agent 侧在 S2 下可用，私有目录如下（I、V 列为空）：

| 生态 | 环境变量（A） | 用户配置继承（只读副本放在 `$GS/<eco>/`） |
|---|---|---|
| Rust | `CARGO_HOME=$GS/cargo`、`CARGO_TARGET_DIR=<卫星>/target` | `~/.cargo/config.toml` 的净化副本（**白名单**，ADR-176/177：只保留 `[source.*]` 的 `registry`/`replace-with`/`directory`、`[registries.*]` 的 `index`、`[net]` 的 `retry`/`git-fetch-with-cli`/`offline`；URL 中的 userinfo 一律剥除，保留的值再经 `10` §10.1.2 的凭据判定，按 §16.8 规则 5 的顺序；`credential-provider`、`token` 等键与 `credentials.toml` **不复制**）——私有 registry 需要凭据的项目在 M1 只能失败并提示 |
| Python（uv） | `UV_CACHE_DIR=$GS/uv-cache`、`UV_PYTHON_INSTALL_DIR=$GS/uv-python`、`UV_TOOL_DIR=$GS/uv-tools`、`UV_TOOL_BIN_DIR=$GS/uv-bin`、`UV_LINK_MODE=copy` | `~/.config/uv/uv.toml` 的净化副本（**白名单**，ADR-177：只保留 `index-url`、`extra-index-url`、`[[index]]` 的 `name`/`url`/`default`、`find-links`、`index-strategy`、`python-preference`、`link-mode`；URL 中的 userinfo 一律剥除，保留的值再经 `10` §10.1.2 的凭据判定，按 §16.8 规则 5 的顺序） |
| Python（pip） | `PIP_CACHE_DIR=$GS/pip-cache`；venv 在卫星内新建 | `PIP_CONFIG_FILE=$GS/pip/pip.conf`（净化副本，**白名单**，ADR-177：只保留 `index-url`、`extra-index-url`、`trusted-host`、`timeout`、`retries`、`find-links`；URL 中的 userinfo 一律剥除，保留的值再经 `10` §10.1.2 的凭据判定，按 §16.8 规则 5 的顺序） |
| Go | `GOPATH=$GS/go`、`GOMODCACHE=$GS/go/pkg/mod`、`GOCACHE=$GS/go-build`、`GOFLAGS=-modcacherw`（使删除 `$GS` 时无需先 `chmod`） | `GOENV=$GS/go/env`（由用户 `go env -w` 文件生成的净化副本，**白名单**，ADR-178：只保留 `GOPROXY`、`GOPRIVATE`、`GONOSUMDB`、`GONOPROXY`、`GOFLAGS`；URL 中的 userinfo 一律剥除，保留的值再经 `10` §10.1.2 的凭据判定，见 §16.8 规则 5；`GOFLAGS` 以左列环境变量为准） |

依赖按 Goal 下载（网络与磁盘成本计入 `13` §13.11 与 `10` §10.4.4）。

### 16.8.3 M2+ 草案：其他生态的验证器侧

| 生态 | V/I 要点 | 已知问题 |
|---|---|---|
| Yarn Berry | `YARN_ENABLE_GLOBAL_CACHE=false` + `YARN_CACHE_FOLDER`（Berry 默认启用全局缓存，此时 `YARN_CACHE_FOLDER` 无效）；`YARN_ENABLE_TELEMETRY=0` | `~/.yarnrc.yml` 从 `$HOME` 读取，需要以按角色的副本覆盖（副本按 §16.8 规则 5：白名单 + URL userinfo 剥除 + 凭据判定；覆盖方式待 SP 验证，ADR-179） |
| Python（uv、Poetry） | V 绝不执行 install（§16.8 角色 V 的定义）：`.venv` 由 I-install 断网生成（`UV_LINK_MODE=clone uv sync --frozen --offline`；Poetry：`POETRY_VIRTUALENVS_IN_PROJECT=true poetry install --no-root --sync`），V 只运行 `uv run --frozen --no-sync`（避免同步时写缓存锁）；I 预取 `UV_PYTHON_INSTALL_DIR` 到 `$VS`。早期草案写作“V：槽位内 sync”，与 V 的定义冲突，已改（ADR-182；`07` §7.4.3、`10` §10.4.2 草案） | `.venv` 含绝对路径，不能 CoW 复制到别的路径：I-install 须在该槽位将使用的同一绝对路径下生成（M2 落地时定） |
| Rust（cargo） | cargo 构建时需要**可写**的 `CARGO_HOME`（`.package-cache` 锁、`registry/src` 解压），因此 V 每槽位 CoW 物化一份可写副本 | `CARGO_HOME` 指向私有目录会丢掉 `~/.cargo/config.toml` 中的镜像与私有 registry；草案同 §16.8.2 的副本方案（白名单 + URL userinfo 剥除 + 凭据判定，§16.8 规则 5，ADR-179），凭据只给 I |
| Go | V：`GOFLAGS=-count=1 -mod=readonly`；`GOMODCACHE` 指向 `$VS` 只读 | 私有模块凭据（`.netrc`、git 凭据）不进 A/V，由 I 拉取 |
