# 03 · Goal 生命周期

Goal 有两个正交维度：

- **生命周期状态（LifecycleState）**：Goal 在“从意图到归档”的哪一步。由人的决定与 Harness 事实驱动。
- **运行模式（Mode）**：仅当有 Run 在执行时，引擎此刻在做哪一类事（见 `02` §2.4）。由 Pi 事件推导。

UI 中两者分开显示：卡片左侧字形表示生命周期，Live Line 前缀表示模式。

## 3.1 状态机

图以 §3.2 的转移表为准（表是唯一规格；图只画主要边，`paused` 的各原因出口见 §3.2.1）。

```
            quick_ratify
   ┌────────────────────────────────┐
   │                                ▼
 draft ──draft contract──► shaping ──ratify──► ready ◄──── dependency regression (M2) ────┐
   ▲                         │                  │ start (slot · deps(M2) · backlog(M2))    │
   └──────── back to draft ──┘                  ▼                                          │
                                             running ─────────────────────────────────────┘
                              resume/hand_back ▲  │ │  pause / budget / stop / idle_without_submit / …
                                   ┌───────────┘  │ └────────────────────► paused ──(§3.2.1)──► running / verifying /
                                   │              │ effective submit                              claimed / in_review
                                   │              ▼
                                   │           claimed ──withdraw (ADR-025)──► running
                                   │              │
                                   │              ▼
                                   │          verifying ──fail (no human change in window, rework < limit)──► running
                                   │              │      ──sentinel_high / env error / limit / human change / S0──► paused
                                   │              │ pass
                                   │              ▼
                                   │          in_review ──request_changes──► running
                                   │              │   ▲ ──fingerprint changed by Tower / adopted / agent_bg (I2)──► verifying
                                   │              │   │ ──unknown-source write (ADR-122/128)──► paused(external_change)
                                   │              │   │
                                   │       accept │   │ carry-over fails
                                   │              ▼   │
                                   │          accepted ──content changed (I2, same split)──► verifying / paused(external_change)
                                   │              │ └──accept without merge──────────────► archived
                                   │              ▼
                                   │          integrated ──24h──► archived   （其他非终态同样可进入，见 §3.2 表下）
                                   │              └──revert in grace period──► accepted (reverted)
                                   │
  abandon（任何非终态；写回进行中稍后，06 §6.4.3）──► abandoned   archived / abandoned ──resurrect──► 新 Goal（draft，resurrectedFrom）
```

## 3.2 状态定义与转移表

| 状态 | 含义 | 进入条件 | 退出转移 | 谁触发 |
|---|---|---|---|---|
| `draft` | 只有一句意图 | 新建 Goal / Scratch / 导入会话升级 | → `ready`（🧑 快速路径：一键批准模板生成的最小合同，`quick_ratify`；或在合同编辑器中手写、修改后批准，`contract.ratify`，§3.4.1 第 3–4 步）；→ `shaping`（🧑 起草合同，M2，ADR-038） | 🧑 |
| `shaping` | 澄清中：Agent（只读工具集）起草合同、提问、探索代码（M2，ADR-038） | 🧑 点击“起草合同” | → `ready`（🧑 批准合同 v1）；→ `draft`（🧑 放弃塑形）；塑形 Run 异常时**停留** `shaping` 并设 `shapingIssue`（`no_proposal`：settled 而未调用 `propose_contract`，一次提醒后仍无；`crashed`；`budget`；`unresponsive`），生成 Needs-You，选项：重试 / 改为手写合同 / 回到 draft | 🧑 / 🤖 起草 / ⚙️ |
| `ready` | 合同已批准，等待执行槽位、依赖或评审余量（`waitReason`） | 合同 ratified；或**任何要开 Run 的转移**（继续目标 `run`、自动返工、`request_changes`、`retry_after_human_change`、交还 `continue_agent`、`resume`）遇到无槽位或依赖未满足（ADR-145/146），`pendingOpenings` 保留，并写 `queuedRun{kind}`（已保留的值优先，人的显式决定——交还、`request_changes`、`retry_after_human_change`——覆盖它，ADR-150；`ready` 中恒非空：合同批准 → `initial`（=第一次启动），依赖回退 → `resume`；在 `run.started` 同一事务中清除，`abandon` 或进入 `ready`/`paused` 以外的状态时也清除，ADR-148/151）——准入按类别判定（只有 `initial` 受评审余量闸控，阻止模式，M2），返工的 `reworkCycles` 在 `decide()` 选择返工时即递增（ADR-147） | → `running`（有槽位、依赖满足（依赖属 M2）、评审余量 > 0（阻止模式，M2，ADR-191），⚙️ 自动；或 🧑 手动开始/越过余量（阻止模式，M2））。**M1 中评审余量不闸控**（只有提示模式，`06` §6.2.4）；M2 的阻止模式只闸控**首次启动**，返工、恢复、交还不受其限制（否则会卡住已在评审路径上的 Goal）；→ `paused(human)`（🧑 `pause`，继续目标 `run`）；→ `paused(human)` + 人工编辑检出（🧑 `take_over`，仅当检出完成标记存在；之后放弃改动保持 `paused(human)`，ADR-147）；→ `paused(external_change)`（⚙️ 检出完成标记存在时检测到来源不明的写入，继续目标 `run`，ADR-147）；准入通过至 `run.started` 之间为准备阶段（步骤顺序以 `10` §10.3.1 为准；准入时写 `preparing_since`）：仓库准备（镜像首次建立、项目锁、远端 fetch、LFS 对象补齐、卫星检出）单独以 15 分钟为限、不计入 120 s（ADR-151），LFS 补齐失败 → `paused(prepare_failed)`，这一段中 `pause` 允许并中止（→ `paused(human)`）（ADR-150 及补记）；依赖物化**不阻止 Run**（失败或超过 15 分钟 → 以 Fact `prepare{ok:false}` 照常进入 `running`），期间 `pause` 可中止物化（→ `paused(human)`）；其余步骤（Host 握手、开场组装）合计时限 120 s；重试从已完成的步骤继续（ADR-150），期间 `pause` 返回 `E_BUSY`；`take_over` 在准备中都返回 `E_BUSY`，`abandon` 始终允许并中止准备；仓库准备（含卫星检出与 LFS）失败或超过 15 分钟、握手或开场失败或超过 120 s → `paused(prepare_failed)`（继续目标 `run`，`queuedRun` 保留，不在启动时自动解除、不 `autoResume`）；准备中途到达外部写入或其他暂停原因 → 中止准备，以这些原因进入 `paused`（ADR-149）；→ `abandoned`（ADR-146） | ⚙️ / 🧑 |
| `running` | 有一个活跃 Run | 启动 / 返工 / 恢复 / 交还 | → `claimed`（🤖 有效提交，见 I4；settle 序列见 I4 末段；宽限确认失败时留在 `running` 等待下一次 settle，不记异常，ADR-129）；→ `paused(<reason>)`：🧑 暂停（`human`）、预算软/硬上限（`budget_soft_cap`/`budget_hard_cap`）、停止条件（`stop_condition`）、`idle_without_submit`（settled 而无有效提交，nudge 用完或守卫不成立后停下）、`question_timeout`（`use_defaults` 下问题超时，或 Pi 侧兜底超时后仍有本 Run 未答的阻塞条目；abort 时保留 abort 的原因，见 I4）、`stalled_timeout`（`use_defaults` 下停滞条目超时，ADR-183）、`external_change`、`provider_unavailable`、`prepare_failed`（Run 中途 Tower 工具被遮蔽，或上下文交接时 Host 的来源自检不通过，ADR-188/217）、`engine_crash`、`app_quit`、`satellite_missing`、`sentinel_high`（仅 `nested_repo_live`，ADR-131）——每个原因的入口条件与出口见 §3.2.1；S0 下首次执行 Agent 代码是门禁 ask（Mode `blocked_guard`），**不**暂停（ADR-068）；→ `ready`（**依赖回退**，M2：本 Goal 以另一 Goal 的分支为 base，而该 Goal 的验收失效（I2）或被放弃——⚙️ drain 当前 Run 至回合边界后暂停引擎，`waitReason:"dependency"`；依赖恢复后从同一会话继续） | 🤖 / 🧑 / ⚙️ |
| `paused` | 引擎空闲，Goal 保留上下文；`pauseReason` 说明原因（`02`）；各原因的出口见 §3.2.1 | 见上 | 见 §3.2.1 | 🧑 / ⚙️ |
| `claimed` | Agent 声称完成，尚未验证 | 有效提交 + `agent_settled` + 2 s 宽限确认（ADR-025）+ 终止追踪进程并等待清空 + `agent_bg_done` 检查点 + I4 判定，pin 与进入 `claimed` 同一事务（ADR-115、ADR-121、ADR-137）；或继续目标 `claim`（`claim_on_behalf`） | → `paused(external_change)`（⚙️ 检测到来源不明的写入，写入继续目标，ADR-122/134）；→ `verifying`（⚙️ 自动立即）；→ `running`（⚙️ claimed/verifying 期间出现 `agent_start`/压缩：撤回并记 `post_settle_activity` 异常；宽限确认失败发生在进入 `claimed` 之前，不经此边，见 `05` §5.5，ADR-129）；→ `paused(post_settle_activity)`（1 小时内第 2 次）；→ `paused(human)`（🧑 `pause`：取消待开始的验证，继续目标 `verify{pin}`，ADR-176） | ⚙️ / 🧑 |
| `verifying` | 验证器在验证 pin（`07` `pinCommit`：worktree 内容在影子 ref 上的快照提交）上执行 `exec`/`artifact` 标准 + 哨兵；完整判定函数 `decide(goal, pin, trigger)` 见 `07` | 自动 | → `paused(external_change)`（⚙️ 检测到来源不明的写入，写入继续目标，ADR-122/134）；→ `in_review`（全部机器标准通过且无高严重度哨兵；**零机器标准**的 Goal 以“未经机器验证”进入，不着绿，ADR-031）；→ `paused(verify_env_error)` + Needs-You（服务/端口/安装器故障，≠ 标准失败，不自动返工，ADR-037）；→ `paused(s0_grant_pending)`（S0 下无执行授权，ADR-068；授权或拒绝都以同一 pin 重新验证，拒绝时 exec 标准不执行，由 `07` `decide()` 判定 artifact 标准与阻断命中，ADR-188）；→ `running`（⚙️ 验证期间出现 `agent_start`/压缩：撤回，ADR-025）；→ `paused(post_settle_activity)`（1 小时内第 2 次）；→ `paused(human)`（🧑 在验证中暂停：取消验证，恢复时以同一 pin 重新验证）；应用退出：取消验证但**保持 `verifying`**，下次启动以同一 pin 重跑（`06` §6.1.6）；→ `paused(sentinel_high)` + Needs-You（通过但有高严重度哨兵：选项 覆盖后评审 / 返工 / 放弃；存在未覆盖的 run 类阻断命中（`input_mutated_after_gate`，ADR-110）时**不提供返工**，与 §3.2.1 `sentinel_high` 行、`07` `decide` 相同）；→ `running`（失败、归因窗口内没有人的改动、rework < 上限且预算未达硬上限：⚙️ 以失败证据自动返工，§3.2.1，ADR-140/144）；→ `paused(budget_hard_cap)`（失败、按归因应自动返工但预算已达硬上限：继续目标 `run`，返工证据入队，ADR-144）；→ `paused(human_change_verify_failed)` + Needs-You（失败、归因窗口内有人的改动（含 rebase 带入的变化）：不自动让 Agent 改人改过的代码）；→ `paused(verify_failed_limit)` + Needs-You（失败且达返工上限） | ⚙️ |
| `in_review` | 等待人验收：已验证（全部机器标准通过），或**未经机器验证**（`human_only` / `ecosystem_unsupported` / `submodules_unsupported` / `s0_denied`，ADR-031/064/071/077） | 验证结束 | → `paused(external_change)`（⚙️ 检测到来源不明的写入，写入继续目标，ADR-122/134）；→ `accepted`（🧑 验收，要求 `human` 类标准被勾选、评审单元按合同策略查看；M1 中先 seal 并写分支，写入失败时验收不完成、留在 `in_review`，`06` §6.4.3，ADR-189）；→ `running`（🧑 request changes：评论作为转向）；→ `verifying`（⚙️ 指纹变化，I2；🧑 `retry_verify` 手动重新验证；🧑 `grant_s0_exec` 授权后重新验证；🧑 `inspect.bring_back` 把检验检出中的改动带回，`verifyOrigin:"human_change"`，ADR-099；🧑 `contract.amend`（新增或修改标准）以新标准验证，§3.4.5，ADR-178）；→ `paused(human)`（🧑 `take_over`） | 🧑 / ⚙️ |
| `accepted` | 人已验收 | 🧑 | → `paused(external_change)`（⚙️ 检测到来源不明的写入，写入继续目标，ADR-122/134）；→ `integrated`（⚙️ 观测到**最近一次验收的** seal 合入本地 base（M1；PR 合并为 M2，ADR-133；唯一条件见 `10` §10.12）；判定按状态：在临时条件下观测到的合入，条件解除、Goal 进入 `accepted` 时再次判定，ADR-183；较旧的 seal 被合入而 Goal 此后已有新内容 → 只记 Fact `local_merged`，`accepted` 时转 `in_review` 并提示，ADR-137）；→ `archived`（🧑 “验收但不合并”：`goal.accept{integrate:"none"}`，已写的分支保留；从 `in_review` 选它时按“只保留分支”验收（seal、写分支），在记 `integration.performed` 的同一事务进入 `archived`，`06` §6.4.3，ADR-187/188）；→ `verifying`（⚙️ 合并队列（M2）rebase 后内容变化，I2；🧑 `retry_verify`/`grant_s0_exec`（S0 中验证时 ③ 恒成立，因此 `grant_s0_exec` 之后总是停在 `in_review`，ADR-186）；🧑 `inspect.bring_back`，`verifyOrigin:"human_change"`，ADR-099；🧑 `contract.amend`（新增或修改标准）以新标准验证，§3.4.5，ADR-178；以上验证通过后的去向一律按 I2 的验收延续判据：其余不变 → 回到 `accepted`（M1 中先写分支，失败时不延续，`06` §6.4.3，ADR-190），否则停在 `in_review` 只看变化部分，`07` §7.10.3，ADR-180）；→ `running`（🧑 `request_changes`：评论作为转向）；→ `paused(human)`（🧑 `take_over`）（后两条与 `in_review` 行相同，ADR-176）。带 `reverted` 标记时（宽限期内撤销合入，ADR-176）出口不变 | ⚙️ / 🧑 |
| `integrated` | 改动已进入 base | ⚙️ 观测 | → `archived`（⚙️ 宽限期 24h 后自动）；宽限期内 🧑 “撤销合入”（`goal.undo_integrate`）→ M1 中 Tower 不写你的仓库，只写出要由人完成的撤销（`10` §10.12；生成撤销草案属 M2，ADR-193），Goal 回到 `accepted` 并标记 `reverted`（持久化为 `goals.integration_reverted_seal`；被撤销的 seal 不再触发 `integrated`，唯一条件见 `10` §10.12，ADR-176）；之后的出口沿用 `accepted` 行的现有出口，**不**提供直接复活——需要新 Goal 时先放弃再复活（复活只从 `archived`/`abandoned` 发起） | ⚙️ / 🧑 |
| `archived` | 终态，默认从列表隐藏 | | → resurrect（创建新 Goal） | 🧑 |
| `abandoned` | 终态，保留分支与证据并记录原因 | 🧑 放弃（必须填写原因：进入学习闭环） | → resurrect | 🧑 |

**任何非终态 →（⚙️）`integrated`**（ADR-194）：只在 §3.2 表的 `accepted` 行与 §3.2.1 表的 `external_change` 行写出这条边，其余非终态（`verifying`、`ready`、其他 `paused(*)` 等）同样适用；唯一条件、判定时机与进入时对进行中验证、准备、`queued_run`、暂停相关字段与阻塞类条目的处理只在 `10` §10.12 定义（ADR-195）。`integrated` 中来源不明的写入不触发 `external_change`，撤销合入回到 `accepted` 后补做一次检测（唯一定义 `10` §10.3.1）。

### 3.2.1 `paused` 的入口与出口（按原因）

**离开 `paused` 的唯一规则（ADR-134）**：
- Goal 从非 `paused` 状态第一次进入 `paused` 时写入**继续目标** `continuation`（`02`）：从 `running` 或 `ready`（排队中的 Run，`queuedRun` 保留）→ `run`；从 settle 序列（**任何**原因，含人暂停、`app_quit` 与卫星丢失 `satellite_missing`，ADR-178）→ `settle`；从 `claimed`/`verifying` → `verify{pin}`；从 `in_review`/`accepted` → `review{state, pin}`；**例外**：任何开 Run 的转移在开 Run 前遇到预算硬上限而进入 `paused(budget_hard_cap)` 时一律写 `run`（含 `in_review`/`accepted` 中的 `request_changes`，ADR-176，`16` §16.1.1 同）。从 `running` 进入时先 drain，drain 的目的持久化为 `drainingFor{target, reasons[]}`（ADR-141），drain 期间到达的原因并入 `reasons`；`target = pause` 时 drain 结束以 `reasons` 进入 `paused`；`target ∈ {take_over, rewind, dependency}` 而 `reasons` 非空时**放弃原目标**，进入 `paused(reasons ∪ {human})`（ADR-144）；崩溃恢复同一规则。接管时记 `takeoverPriorReasons`（接管前的原因集合），`discard_human_edits` 只读它判定是否保留 `paused(human)`（ADR-140）。之后叠加的原因（`alsoApplies`）不覆盖它。
- 下表“命令 / 守卫”列中的每个命令只做两件事：**解除本原因**，以及在表中注明时**显式改写**继续目标（例如 `override_sentinel` 改写为 `review`，`claim_on_behalf` 改写为 `claim`，`retry_claim` 改写为 `settle`，`resume` 在原因为 `verify_failed_limit`/`idle_without_submit`/`post_settle_activity`/`nested_repo_live` 时改写为 `run`（其余原因不改写），`request_changes`（`sentinel_high` 中）改写为 `run`，`retry_verify` 在 `verify_failed_limit`/`human_change_verify_failed`/`verify_env_error` 中改写为 `verify{pin}`（同一 pin）或 `verify_new`（`verify_env_error` 只允许同一 pin），`revert_external_change` 在 E 中剩余差异来自存活进程且目标为 `verify`/`review` 时改写为 `verify_new`，`keep_external_change` 把 `verify`/`review` 改写为 `verify_new`，`amend_contract`（新增或修改标准）在继续目标为 `review{state, pin}` 时改写为 `verify{pin}`（同一 pin、新标准，同一事务写 `Goal.verifyFrom = state`，§3.4.5，ADR-178/180）；自带开场的命令——`resume{note}`、`retry_after_human_change`、`request_changes`、`verify_failed_limit` 的 `resume`、`keep`/`revert` 的 `tower.external_resolved`、交还、继续目标为 `settle` 时的作答（ADR-176）与所属 Run 已结束的阻塞条目的作答（ADR-178）——把自己的 `decisionId` 追加到 `Goal.pendingOpenings`（卫星重建的告知 `tower.satellite_rebuilt` 不经此队列，由开场组装时从 `satellite.recovered` 事件生成，`16` §16.1.12，ADR-180），下一次任何 Run 开始时消费组装进开场的条目，ADR-140；只消费组装过的 id，`06` §6.4.3，ADR-184）。下表“出口”列是本原因为最后一个原因时的结果，不是额外的转移。
- **不经 `onAllReasonsCleared()` 离开 `paused` 的出口只有两条**（ADR-195）：进入 `integrated`（原因未解除也离开；进入时清空的字段与关闭的条目只在 `10` §10.12 (i) 定义）与 `abandon`。
- `pauseReason` 与 `alsoApplies` 全部为空时，唯一转移函数 `onAllReasonsCleared()` 离开 `paused`：① `pendingHandBack` 存在 → 执行它（`continue_agent` → `running` 并注入 `tower.handback`；`reverify` → 新 pin 验证），清除它与继续目标（**不**清除 `pendingOpenings`）；② 否则执行继续目标（`run` → 开 Run——无执行槽位或依赖未满足时先进入 `ready{waitReason}`，`pendingOpenings` 保留，准入后开 Run（ADR-145）——开场按序消费 `pendingOpenings`，空则 `tower.resume`；`claim` → 直接进入 `claimed`；`settle` → 从宽限确认起重新执行 settle 序列）；③ **守卫**：目标为 `verify`/`review` 而当前树 ≠ 目标 pin 的树 → 改为 `verify_new{returnTo}`：`returnTo` 取 `review.state`；从 `verify` 改写时取当时的 `Goal.verifyFrom`（若 ∈ {`in_review`, `accepted`}，否则为空；ADR-143 补记）（执行时写 `Goal.verifyFrom = returnTo ?? "claimed"`，不沿用旧值，ADR-137，`07` §7.10.3）。任何路径都不会把与 pin 不同的树送进评审或以旧 pin 验证。
- **`pendingHandBack` 等待期间的选项**（唯一定义，ADR-215/216；`16` `Goal.pendingHandBack`、`06` §6.4.3、`04` §4.6.7 与 §4.8.9 引用）：`pendingHandBack` 非空期间，界面置灰、服务端返回 `E_STATE` 的选项只有两个：`我来改`（`take_over`，见下表 `human` 行）与预算硬上限卡片的 `按当前状态送去验证`（`claim_on_behalf`）——两者都另选去向，而去向已由第 ① 步定为交还时的选择（`claim_on_behalf` 还会不提高预算就解除硬上限）。解除保留原因的命令一律可用：`resume`（含 `nested_repo_live` 的附转向）、`override_sentinel`（被保留的 `input_mutated_after_gate`）、`keep_external_change`/`revert_external_change`、`rebuild_satellite`；它们以及其他命令对继续目标的改写照常写入，但不改变结果，第 ① 步先执行 `pendingHandBack` 并清除继续目标。**唯一例外**：`pendingHandBack.mode = reverify` 时，附转向解除 `nested_repo_live` 的 `resume` 在同一事务把 `pendingHandBack.mode` 置为 `continue_agent`——人的新选择取代交还时的选择（转向照常追加到 `pendingOpenings`，ADR-140；归因窗口的起点随之移到这次 `resume`，与交还时直接选“交给 Agent 继续”相同，见下一条，ADR-217），所以原因全部解除时第 ① 步开 Run 交给 Agent，而不是先以仍含该条目、必然再停在 `sentinel_high` 的树验证。
- **验证失败是否自动返工**（唯一规则，ADR-140/144）：**人的改动** = `author:"human"` 的检查点、`mixedPaths` 非空的检查点，以及 rebase（M2）带入的 base 变化；**窗口起点** = 最近一次**通过**的验证的 pin（“通过”= 该次验证的结论标签为已验证或有保留的已验证（`07` §7.10.3 `label`），且 Goal 因它进入 `in_review`——直接进入，或经覆盖哨兵改写的继续目标 `review` 进入，序号取该次验证——或经验收延续回到 `accepted`；结论为未经机器验证的验证不算通过，ADR-187；没有则 base。窗口以事件序号界定，交还的 `human_edit` 检查点在交还决定之前写入，不在其开启的窗口内，ADR-145）与人最近一次明确把工作交给 Agent 的决定中较晚者——这类决定是封闭列表：`hand_back{continue_agent}`、`retry_after_human_change`、`request_changes`，以及把 `pendingHandBack.mode` 由 `reverify` 置换为 `continue_agent` 的 `resume`（上一条“唯一例外”，ADR-216/217；交还的 `human_edit` 检查点因此不在窗口内）。窗口内有人的改动 → 不自动返工，进入 `paused(human_change_verify_failed)`；否则按 Agent 路径（返工 < `maxReworkCycles`，且预算未达硬上限——已达则 `paused(budget_hard_cap)`，继续目标 `run`，返工证据以 `{factId}` 入队 `pendingOpenings`）。`verifyOrigin` 只作说明，不决定去向。
- 原因被解除而仍有其他原因时，剩余最高者成为 `pauseReason`（`16` §16.1.1 优先级），Goal 保持 `paused`。
- **例外**：`nested_repo_live` 因条目消失而自动解除时，无论是否唯一原因，一律在剩余原因中加入 `human`（“条目已消失，确认后继续”，ADR-137）。`budget.extend` 只提高额度、不解除原因，由 `resume` 解除（ADR-137）。


| `pauseReason` | 入口（来自哪些状态、何种输入） | 出口 | 命令 / 守卫 |
|---|---|---|---|
| `human` | ready、running、claimed、verifying（🧑 `pause`）；已 `paused(*)` 时 🧑 `pause` 按 `16` §16.1.1 的优先级并入（`human` 成为 `pauseReason`，原原因进入 `alsoApplies`），继续目标不变（ADR-176）；ready/running/paused/in_review/accepted（🧑 `take_over`“我来改”，记录 `takeoverFrom`，ADR-094；从 `ready` 接管仅当检出完成标记存在、准备阶段中不允许，见 `ready` 行，ADR-147/149/179；卫星缺失或正在重建（`satelliteRebuilding`）时不允许接管；`external_change` 未解除时不允许接管，须先 keep/revert，ADR-128；`pendingHandBack` 非空时不允许接管（`E_STATE`：先解除剩余的暂停原因，交还随之执行，`06` §6.4.3，ADR-214/215）） | 按本节开头的唯一规则（ADR-134）；继续目标在接管或暂停时按来源状态写入（从 `running`/`ready` 接管 → `run`，从 `in_review`/`accepted` 接管 → `review`，从 `paused(*)` 接管 → 保持原目标） | `resume`：解除 `human`（若暂停于验证：继续目标 `verify` 以同一 pin 重新验证）；接管后 `hand_back`：按 `16` §16.1.1“`pauseReason` 推导来源与交还”的三类解除——由 pin 推导的与交还即解除的解除，外部条件仍成立的与含 run 类阻断命中的 `sentinel_high` 保留（ADR-103、ADR-208），人选择“交给 Agent 继续”或“直接重新验证”——无剩余原因时立即执行，否则记入 `pendingHandBack`，由 `onAllReasonsCleared()` 第 1 步执行（`reverify` → 新 pin，`verifyOrigin:"human_change"`；交还的检查点为 `author:"human"`，窗口内有人的改动，因此失败不自动返工——由归因窗口决定，ADR-144）；交还选 `take_external` 时不写 `pendingHandBack`（ADR-134）；🧑 `discard_human_edits`“放弃改动”：不写回 H；`takeoverFrom ∈ {in_review, accepted}` 且卫星树 ≠ pin 的树时，差异按归因表分类（ADR-128；接管期间 Tower 重建过卫星时以重建所用的树为比较基准，Tower 自己的重建不算外部改动；卫星缺失或正在重建时 `E_STATE`，`06` §6.4.3，ADR-180）：存活进程的写入 → 继续目标改写为 `verify_new`，其余 → 记入 `external_change`（`externalChange` 已存在则路径并入、基线保持首次值，否则 E = 差异路径、基线 = 比较基准的检查点（接管以来重建过卫星时为记录重建树的检查点，`10` §10.16.2；否则为当前 pin 的检查点，没有时为 pin 本身，`10` §10.3.1，ADR-182/212）），**不验证**；然后解除 `human`。`takeoverFrom ∈ {running, ready}` 或 `takeoverPriorReasons` 含 `human` 时**不**解除 `human`（ADR-148）（保持 `paused(human)`，由人显式 `resume`，ADR-099/137/140）；从 `accepted` 接管并交还后离开 `accepted`，再次验收前不重新进入合并队列（合并队列属 M2） |
| `budget_soft_cap` | running（⚙️ 记账达软上限） | → `running` | `extend_budget` 后 `resume`，或直接 `resume`（越过软上限一次：软上限按跨越触发，生效额度与触发规则唯一定义在 `06` §6.2.5，ADR-197） |
| `budget_hard_cap` | running（⚙️ 达硬上限，drain 后）；verifying（⚙️ 验证失败后按归因应自动返工，但返工因硬上限不能开始，继续目标 `run`，返工证据入队，ADR-144）；**任何开 Run 的转移**（含 `in_review`/`accepted` 中的 `request_changes`、`retry_after_human_change`、交还 `continue_agent`、继续目标 `run`）在开 Run 前遇到硬上限（`06` §6.2.5）——继续目标 `run`，是本节开头写入规则的例外（ADR-176） | → `running`；→ `claimed`（`claim_on_behalf`） | `extend_budget`（提高硬上限）后 `resume`；或 🧑 `claim_on_behalf`“按当前状态送去验证”（改写为 `claim`，验证不消耗 LLM 预算；`pendingHandBack` 非空时不可用，见上方“`pendingHandBack` 等待期间的选项”，ADR-216）；或 `abandon` |
| `stop_condition` | running（⚙️ 停止条件命中） | → `running` | `resume`（可附转向） |
| `idle_without_submit` | running（settled 而无有效提交：nudge 已用完，或 nudge 守卫不成立——只适用于非 draining 且 `outcome = completed`，`05` §5.5，ADR-135/138） | → `running`；→ `claimed` | `resume`（附转向）；或 🧑“按当前状态送去验证”（`claim_on_behalf` → 继续目标 `claim`：进入 `claimed`，内容是 Agent 的，失败按归因窗口判定（通常走 Agent 路径，ADR-140/144），Trace 记“人代为提交”，ADR-137）；或 `abandon`。**本行是该原因选项的唯一定义**（`04`、`05`、`08` 引用，ADR-143） |
| `verify_failed_limit` | verifying（失败且返工达上限） | → `running`；→ `verifying` | `resume` 并修订合同或附转向（返工计数在 Goal 生命周期内不重置，此后每次验证失败都回到本原因，ADR-197）；或修订标准后 `retry_verify`（“改为 human 标准”由界面串联两步，§3.4.5，ADR-169） |
| `sentinel_high` | verifying（通过但有高严重度哨兵）；running（⚙️ watcher 发现 `.git` 等价条目：以 abort drain 后进入，detector `nested_repo_live`，run 类、交还时保留、不可覆盖，ADR-131） | → `in_review`；→ `running`；→ `abandoned` | **`nested_repo_live`**：只有 `goal.resume` 附必填转向（要求 Agent 删除该条目）、`take_over`（人删除）与 `abandon`；交还时没有选择删除、本原因保留并写下 `pendingHandBack` 之后，`take_over` 不可用（见 `human` 行），只有 `resume` 附转向与 `abandon`（ADR-215；交还时选了重新验证的，附转向的 `resume` 改为交给 Agent，见上方“`pendingHandBack` 等待期间的选项”，ADR-216）；条目从卫星消失时命中解除。**其余**：`override_sentinel`（结构化原因；对 `nested_repo`/`symlink_escape` 的覆盖绑定对象哈希，ADR-112）→ 评审；或 `request_changes` 返工——但若含未覆盖的 `input_mutated_after_gate`（运行期阻断，ADR-107/110），只提供 `override_sentinel` 与 `abandon` |
| `human_change_verify_failed` | verifying 失败，且归因窗口内有人的改动（`author:"human"` 或 `mixedPaths` 非空的检查点；窗口定义见本节开头，ADR-144）（含 rebase 带入的 base 变化，M2）（ADR-140） | → `running`；→ `verifying`；→ `paused` 保持 | 交给 Agent（`retry_after_human_change`：注入人改动说明，→ `running`；不同于要求人工编辑检出存在的 `hand_back`，ADR-099）；人自己继续修改（`take_over` → 人工编辑检出）后交还；或撤销人的改动（回退到人编辑前的检查点）后 `retry_verify`（**M2**：回退到非回合检查点属于 M2，`06` §6.4.3 `run.rewind`；`run.rewind` 在本节的转移边随 M2 回退一并补上，ADR-179）；或修订标准后 `retry_verify`（“改为 human 标准”同上，§3.4.5，ADR-169） |
| `verify_env_error` | verifying（ADR-037/054 判为环境故障） | → `verifying` | 修好环境后 `retry_verify`：**同一 pin**，不经 `running`（代码未变）。缺少未播种的机密本地文件**不**归为环境故障，按普通失败处理并附提示（ADR-168） |
| `s0_grant_pending` | verifying（S0 且无授权，ADR-068） | → `verifying`（同一 pin） | 只在验证阶段出现（ADR-068）。下次启动的自检由 S0 转回 S2 时由 Tower 解除本原因，以同一 pin 在 S2 中验证（`06` §6.7，ADR-224）。`grant_s0_exec` 或拒绝授权（含 `use_defaults` 下超时）都只解除本原因，以同一 pin 回到 `verifying`；拒绝后的去向只由 `07` `decide()` 判定（无阻断命中且 artifact 标准通过时以“未经机器验证（S0 未授权）”进入 `in_review`，ADR-188） |
| `question_timeout` | running（`use_defaults` 下问题超时；或 Pi 侧兜底超时后仍有未答阻塞条目——abort 时保留 abort 的原因，I4） | → `running`；→ `claimed`（继续目标 `settle`，ADR-176） | 人作答：答案以锚定在原问题上的转向消息（`timing:"now"`）送达，并以 `resume` 恢复会话（`05` §5.6.4）。继续目标为 `settle` 时（有效提交 + 未答阻塞条目，I4）：答案不立即送达，本次作答的决定追加到 `pendingOpenings`，`resume` 后重新执行 settle 序列进入 `claimed`，答案在之后的 Run 中送达（ADR-176） |
| `stalled_timeout` | running（`use_defaults` 下检测器 escalate 的 `stalled` 条目超时，按 `defaultIfIgnored` 暂停；Run 以 abort 方式 drain 到回合边界，`07` §7.7.1、`08` §8.7.1，ADR-183） | → `running` | 处理仍打开的 `stalled` 条目：`resume`（可附转向；无条件解除，`06` §6.4.3 `goal.resume`，ADR-184）、回退（M2）、`take_over` 或 `abandon`；条目保持打开（只记 `timedOutAt`），本原因解除的同一事务关闭（定类见 `08` §8.8），暂停的界面显示 `⚙ 超时默认`，不写“你”（`12` §12.6.5）。交还即解除 |
| `post_settle_activity` | claimed、verifying（1 小时内第 2 次，ADR-025） | → `running`；→ `claimed` | 禁用可疑扩展后 `resume`；或确认工作区已稳定后 `retry_claim`（重新做 ADR-025 宽限确认） |
| `external_change` | **任何状态**（`integrated` 除外，见 §3.2 表下，ADR-194）中检测到来源不明的写入（ADR-122）：running（⚙️ 先 drain，drain 期间外部路径逐路径记 `author:"external"`，同一路径也有 Agent 工具写入则记 `mixed`；settle 序列中检测到时有效提交保留，继续目标为 `settle`，ADR-129/134）；`ready`（检出完成标记存在时，ADR-153）/`claimed`/`verifying`/`in_review`/`accepted`（⚙️ 立即暂停；`verifying` 中取消当前验证）；已 `paused(*)` 时 → 记入 `alsoApplies`（不改变当前 pauseReason 与继续目标）。状态记入 `externalChange{paths, mixedPaths, baselineCps, detections}`（ADR-128，重复检测并入路径，基线保持首次值）。例外：`bg_process_survived` 未解除期间的未归因写入记为 `author:"agent"`（`agent_bg`），不进入本原因 | 按本节开头的唯一规则（ADR-134） | `goal.external_change.keep`（人显式采纳：检查点 `author:"human"`（`mixedPaths` 记 `mixed`）、landmark `external_change_kept`，seal 写 `Tower-Human-Edit`；继续目标为 `verify`/`review` 时改写为 `verify_new`，为 `run`/`settle` 时不变；`tower.external_resolved` 追加到 `pendingOpenings`；采纳产生 `author:"human"` 检查点，之后的验证失败因此不自动返工，ADR-140）；`goal.external_change.revert`（`restorePaths(基线, E)`，基线唯一定义在 `10` §10.3.1；不改写继续目标；之后只考察 **E 中的路径**：仍与基线不同者——只可能来自并发写入——按归因表分类，E 之外的路径不参与判定，ADR-134）；`goal.resume` 对本原因返回 `E_STATE`；本原因未解除时 `take_over` 返回 `E_STATE`；M1 中本地 base 观测到最近一次验收的 seal 已合入且满足 `10` §10.12 的唯一条件（其中“卫星树”不计 `externalChange.paths`，ADR-183）→ `integrated`，本原因以 `obsolete` 关闭（ADR-128/133） |
| `provider_unavailable` | running（provider 重试耗尽 / 离线） | → `running` | `autoResume=true`：探测间隔 60 s 起指数退避至 10 min，成功即恢复（探测不调用模型，只做连接与鉴权检查，不计费；鉴权检查会真正刷新 OAuth 令牌，`06` §6.1.4，ADR-207；探测只在同组已存活的空闲 Host 中运行，没有这样的 Host、provider 由扩展注册或 F8 只读期间不自动恢复，卡片提示人重试，`06` §6.1.4 第 5 项，ADR-235；该 Goal 不可达期间探测跳过，F8 只读期间与不可达期间卡片不带 `[重试]`，`06` §6.1.6 ③、`12` §12.6.5，ADR-236/237）；或人切换模型后 `resume` |
| `app_quit`、`engine_crash` | running（应用退出 / Host 崩溃；`app_quit` 也来自磁盘满与 Project 不可达，`06` §6.8 F8、§6.1.6，ADR-231/233/235） | → `running` | `autoResume`（`engine_crash`：一次自动“重启并恢复”，上一次崩溃后 10 分钟内再次崩溃则不再自动重启；启动时只在 `resumeOnLaunch` 打开时解除，已生成 `stalled` 条目的 `engine_crash` 不在启动时解除，条目时机见 `08` §8.6.3，ADR-205）；🧑 `resume`（`engine_crash` 时即“重启宿主并恢复”）；🧑 `abandon`（该 Goal 不可达期间可用，自动解除推迟到可达；不可达期间可用的命令只按 `06` §6.1.6 ③，ADR-236/237）。**verifying 不进入这两个暂停**：验证不依赖 Engine Host；应用退出时正在进行的验证被取消，Goal 保持 `verifying`，下次启动以同一 pin 重跑（`06` §6.1.6） |
| `prepare_failed` | （来源清单只按 `16` §16.1.1 `Goal.pauseReason` 的 `prepare_failed` 一项，本格列出主要来源，ADR-239）ready 的准备阶段（⚙️ 仓库准备失败或超过 15 分钟——含镜像、LFS 补齐、卫星创建与检出、路径冲突（卫星记 `broken`）；Host 握手或开场组装失败或超过 120 s，含 Host 启动自检不通过（Tower 工具被同名扩展工具遮蔽、内置 MCP 被扩展取代，`05` §5.3.5，ADR-187/215）与清单计算中全局根查询出错或超过 60 s（`05` §5.10，ADR-215），以及 Host 启动或该 Run 准备时读到无效的 Pi 设置（`05` §5.3.6 代理一行，ADR-234/235/236）；ADR-149/150/151）；running（⚙️ Run 中途有扩展注册了与 Tower 工具同名的工具：gate 在调用时阻断并 drain 后进入，`05` §5.6.5，ADR-188；上下文交接时运行时重建、Host 的来源自检不通过，新会话不创建，`05` §5.3.5，ADR-217；tower-goal 的同一处理器连续 3 次出错（按处理器计数）：drain 后进入，`05` §5.6.5 第 6 项，ADR-238——三者都是运行中途停止的一种，重试开新的运行） | 按本节开头的唯一规则（继续目标 `run`，`queuedRun` 保留） | 🧑 `resume`（重试；路径冲突时先改名重建卫星）；🧑 `take_over`（仅当卫星已完成检出，ADR-151）；🧑 `abandon`。**不在启动时自动解除，不 `autoResume`**；Needs-You `stalled{prepare_failed}`（`st:{goalId}:prepare`；认证预检失败时改为认证过期的条目 `st:{goalId}:auth`，`08` §8.4，ADR-207） |
| `satellite_missing` | `running`（卫星工作目录或 gitdir 被外部删除，先 abort；继续目标按本节开头的规则：`run`，settle 序列中为 `settle`，ADR-178）；其他非终态下卫星丢失先是叠加态 `satelliteRebuilding`，**自动重建失败时**才升级进入本原因（继续目标按升级前状态写入，ADR-084/094/134） | 按本节开头的唯一规则（ADR-134） | Tower 自动按重建来源（可用的最新检查点 → pin → base，唯一定义在 `10` §10.16.2 情形 E，ADR-076/184）重建卫星；重建完成即解除本原因（不改写继续目标；守卫保证树 ≠ pin 时先验证）；重建失败 → 升级为常规暂停原因（进入优先级表，`alsoApplies`），同一事务清除 `satelliteRebuilding`（ADR-178），生成 Needs-You；此后 🧑 `goal.rebuild_satellite{goalId}` 重试重建（重建来源与步骤都与自动重建相同；重建进行中 → `E_BUSY`），成功的同一事务解除本原因、不开 Run（与 `run.rewind` 不同，ADR-176）；不改写继续目标（守卫保证树 ≠ pin 时先验证；从更早的检查点重建及其 `settle`/`claim` → `run` 改写属 M2，ADR-183）；无论自动重建还是人发起的重试，下一次任何 Run 的开场都含 `tower.satellite_rebuilt`（“工作目录已从检查点 n 重建”，`16` §16.1.12，ADR-180）；或 `abandon` |

**`pendingHandBack` 与继续目标**（ADR-134，取代 ADR-133 中关于 `pendingVerify` 的一段）：`pendingHandBack` 在 `onAllReasonsCleared()` 第 1 步优先执行，执行后继续目标被清除；交还选 `take_external` 时 `mode` 为空，不写 `pendingHandBack`，继续目标不变（接管时已按 `takeoverFrom` 写入）。

**`nested_repo_live` 的交还出口**（ADR-131/133）：该条目不在人工编辑检出中（git 拒绝收录或运行中命中），交还对话框提供“删除这些条目”勾选项，由 Tower 在卫星中删除（`resolvePinHits` 的 `delete`，记 `author:"human"`），命中随之解除。不勾选时本原因保留，此后的出口见上表 `sentinel_high` 行（写下 `pendingHandBack` 时不再能接管），对话框在取消勾选时写明这一后果（`04` §4.8.9，ADR-215）。

**`pendingHandBack` 非空时（ADR-104/108/134）**：由 `onAllReasonsCleared()` 第 1 步执行（见本节开头），不另设触发函数；人手动 `resume` 只解除它能解除的原因，然后同样经过该函数（`10` §10.8.4，`16` §16.1.1）。

所有出口都写 `HumanDecision` 或系统事件；`retry_verify`、`retry_claim`、`claim_on_behalf` 加入 `02` HumanDecision.kind 与 `16`。

## 3.3 不变量（Invariants）

实现必须在 Supervisor 的状态机中断言以下不变量，违反即为 bug：

1. **I1 归档只来自人的验收或人的放弃。** `archived` 的所有前驱路径都经过 `accepted`（含“验收但不合并”）或 `abandoned`，二者都是 🧑 决定。Agent 无任何路径直接导致归档。（满足 P6 “归档与完成绑定”，同时满足 R2 “完成 ≠ Agent 说完成”。）
2. **I2 Verified 与 Accepted 都会过期。** `in_review` 或 `accepted`（尚未 integrated）期间 workspaceFingerprint 一旦变化，按变化的来源分两路（ADR-128）：来自 Tower 自己的工作（rebase、合并队列的重放，均为 M2）、人的显式采纳（`keep`、交还、`bring_back`）或存活进程（`agent_bg`）→ 状态自动回到 `verifying`；**来源不明 → `paused(external_change)`**（ADR-122，§3.2.1），不先验证；contentHash 变化的评审单元重置为 `unseen`，未变化的保留批准。**验收延续**判据（唯一定义在 `07` §7.10.3 `acceptanceCarriesOver`）：全部已批准单元的 contentHash 不变且无新增 hunk、验收标准再次通过，且本次没有 `anyQualified` ⑨ 以外的条件（ADR-185）→ 自动恢复 `accepted`（记录 `audit.acceptance_carried`）；否则停在 `in_review` 等待人只看变化部分，有保留条件时按验收闸写一句确认。
3. **I3 合同不可变。** `ratified` 合同只能被新版本 `superseded`，修订必须写 `amendmentNote`。验收时记录所依据的合同版本。
4. **I4 Done 信号使用 `agent_settled`，且提交必须“有效”。** Run 完成以 Pi 的 `agent_settled` 为准（`agent_end` 之后仍可能有重试、压缩、steer、follow-up）。**有效提交**（ADR-121）= 本 Run 内存在 `submit` 调用，且最后一次 `submit` 之后本 Run 没有**变更类工具调用**（唯一定义在 `16`，ADR-130）——以工具事件判定，不比较指纹（`submit` 的 `terminate:true` 只在它独占工具批次时才结束本轮，同批其后执行的变更类调用使它作废）。`submit` 之后仅由后台进程产生的变化不使提交作废，它们进入 `agent_bg_done` 检查点并随 pin 一起被验证与评审；**pin 的树** = `agent_bg_done` 检查点的树。`claimed` 需要同时满足：有效提交 且 收到 `agent_settled`（及 ADR-025 宽限确认）且 **本 Run 产生的、`costOfDelay = agent_blocked` 的 question/approval 条目已全部处理**（其他 Needs-You——攒批的 ratify、非阻断哨兵、冲突预测等——不阻止 claimed，它们在评审中呈现）。正常路径上，阻塞条目在工具执行内部等待，Run 不会带着未答条目 settle；只有在 abort 或 Pi 侧兜底超时之后才可能出现“有效提交 + 未答阻塞条目”，此时 Goal 进入 `paused(question_timeout)` 或 abort 原因对应的暂停（条目保持打开）；有效提交保留，继续目标 `settle`（§3.2.1），人作答后经 `settle` 进入 `claimed`，答案在之后的 Run 中送达（ADR-176）；暂停未经作答而解除、重跑 settle 时条目仍未作答的，这些条目属于已结束的 Run，不再阻塞 `claimed`，作答进入开场队列（`05` §5.5，ADR-178）。**例外**：`claim_on_behalf`（人代为提交，§3.2.1）绕过“有效提交 + agent_settled”两项条件，经继续目标 `claim` 直接进入 `claimed`（引擎须已空闲；`verifyFrom = claimed`，验证 `trigger:"claimed"`，失败按归因窗口判定（通常走 Agent 路径，ADR-140/144），ADR-137）。`claimed`/`verifying` 期间持续监视 `isStreaming`、`isCompacting` 与 `agent_start`；出现即按 ADR-025 撤回（1 小时内第 2 次 → `paused(post_settle_activity)`）。若 `submit` 后又有变更类工具调用，该 `submit` 作废，tower-goal 在 `agent_before_settle` 提醒 Agent 重新提交；任何新的工具调用都属于一次新的 run，settle 前必经 `agent_before_settle`，因此有效性总在 settle 时按 I4(a) 判定，不存在 settle 之后才发现无效的情形；Tower 不以 user 角色注入提醒（ADR-129，取代 ADR-121 的提醒回合）。宽限失败 → 留在 `running` 等待下一次 `agent_settled`，不记异常（`05` §5.5 唯一定义）。**settle 顺序**（ADR-121）：`agent_settled` → 2 s 宽限确认 → 终止追踪进程并等待清空（ADR-115）→ `agent_bg_done` 检查点 → I4 → 生成 pin 并进入 `claimed`（同一事务，ADR-137）。
5. **I5 单写者。** 生命周期状态只由 Supervisor 状态机写；UI 与 Agent 只能提交命令/事件。
6. **I6 返工有上限。** `reworkCycles` 达到合同 `maxReworkCycles`（默认 3，ADR-143）时，不再自动返工，转人决策；这本身是一个“合同可能不清晰”的信号。
7. **I7 一个 Goal 同时至多一个活跃 Run**（Best-of-N 实验除外，见 `14`；其子 Run 各有独立的卫星）。机会式验证（ADR-020）不是 Run，不受此限。
8. **I8 依赖无环。** 添加依赖时检测环。

## 3.4 关键流程

### 3.4.1 创建与塑形（Shaping）

1. 🧑 在任意位置按 `N`（或命令面板 “New Goal”）输入一句话意图，可选择仓库（默认最近使用）。
2. Goal 处于 `draft`。🧑 选择：
   - **快速路径**（默认；任何风险等级可用，高风险 Goal 需补计划）：Tower 用模板生成最小合同（意图 + 项目默认验证命令作为 `exec` 标准 + 默认围栏），🧑 一键批准（`quick_ratify`）→ `ready`。一句话中若含“done when …”，其命令直接成为 `exec` 标准。
   - **塑形路径**（标准/高风险；M2，ADR-038）：启动一个 **只读** Shaping Run（Pi 工具集 `read, grep, find, ls` + `ask_user` + `propose_contract`），Agent 探索代码、提出澄清问题（以 Needs-You `question` 出现），并产出合同草案。
3. 合同草案在“合同编辑器”中呈现：每一项可编辑；`exec` 标准可点击“试运行”在当前 base 上执行（`contract.trial_criterion`：不生成 pin、不改变状态，不经 `verify(goal, trigger)`，`06` §6.4.3，ADR-179）。**红灯先行是提示而非闸门**：若全部标准在改动前就已通过，⚙️ 提示“这些标准无法区分改动前后”——对缺陷修复这通常意味着标准无效；对重构（行为不变）、新功能（测试尚未存在）这是正常的，用户可一键确认“这是回归保护标准”。没有可执行标准时，可以只用 `human` 标准（Goal 将以“未经机器验证”进入评审，ADR-031），不强迫用户先写测试。
4. 🧑 批准 → 合同 v1 ratified → `ready`。

> “验收标准在改动前应当失败”这条检查借鉴了测试驱动的红-绿思路，能廉价地发现无效标准。

### 3.4.2 运行

- Supervisor 为每个 binding 创建卫星克隆（分离 gitdir，工作目录中无 `.git`）与工作分支，从 `baseCommit` 出发（ADR-060/081/089）。
- Engine Host 启动 Pi 会话（`--session-dir` 指向 Goal 目录），tower-goal 扩展注入 Goal 简报（合同摘要 + 生效记忆 + 交接包），见 `05`。
- 运行中：
  - 每个回合边界（`turn_end`），若工作区指纹相对上一个检查点变化，tower-goal 扩展（两种适配器下都只有它能看到 entry id）触发异步检查点：在影子 ref `refs/tower/<goalId>/cp/<n>` 上记录工作区快照（不污染分支历史），记录 `检查点 ↔ entry id`。无代码变化的回合不产生检查点；任意 entry 的代码状态 = 会话树路径上最近的带检查点祖先（`10` §10.7.1）。
  - 观察器把工具结果转为 Fact（`command_result`、`files_touched`），哨兵实时检查（围栏、测试文件、依赖）。
  - 人的评论按 `timing` 选择 `steer`（now：下个回合边界生效）或 `follow_up`（batch：Agent 将停下时投递），并回写送达回执；`requiresChange` 的评论在验收前必须为 addressed（只认 ⚙️ 来源：锚定的 hunk 已变；Agent 的引用只是说法，不算，ADR-176）或被人关闭。
  - **人接管与交还**：人可随时暂停 Goal 并亲自修改（Diagnostic 视图 → “我来改”）：人在 Tower 创建的**人工编辑检出** `<wtRoot>/_human/<goalId>` 中工作，不直接进入卫星；交还时 Tower 以文件级同步写回卫星（ADR-081，`10` §10.8.4）。人的编辑被归因为 `author:"human"`；“交还给 Agent”（`paused → running`）时，tower-goal 注入一条交接消息，列出人改动的文件与意图，要求 Agent 不得回退这些改动。

### 3.4.3 声称完成 → 验证 → 评审

1. 🤖 调用 `submit({summary, criteriaSelfAssessment, risks})`。该工具返回 `terminate: true`（仅当它独占工具批次时才结束本轮；是否为“有效提交”以工具事件判定，见 I4）。
2. 收到 `agent_settled` 后 → `claimed` → 立即 `verifying`。
3. 验证器（`07`）：
   - 在 **独立的验证槽位**（干净目录，无 `.git`，`07` §7.4.2）中检出验证 pin（把卫星工作目录的当前内容——包括未提交改动——在影子 ref 上生成的快照提交；分支本身不变）。
   - 依次执行 `exec` 标准（超时、资源上限）、测试完整性哨兵、范围围栏检查、冲突雷达（M2）。
   - 产出 `criterion_check` 等 Fact，均带 `atCommit`。
4. 通过 → `in_review`，生成评审单元（`08`/`04`），Needs-You 生成 `review_ready`（severity 2）。
5. 失败 → 以失败证据（失败的标准、失败用例名与脱敏后的输出摘要、哨兵命中；带密钥的标准只回送用例名，`07`）构造一条 `custom_message` 开启返工 Run（同一 Pi 会话、同一尝试继续，或上下文过长时以交接包开新会话，ADR-027）。

### 3.4.4 验收

- 验收面板列出：验收标准（全部为 Fact，带新鲜度）、`human` 类标准勾选框、评审单元（风险排序，已看/未看）、未批准的假设/决策、哨兵与覆盖记录、成本。
- 🧑 点击 **Accept**：
  - 若存在未看的高风险评审单元，或未勾选的 `human` 标准，按合同 `review` 策略阻止或要求确认。
  - 记录 `HumanDecision{kind:"accept"}`，含合同版本、各单元 contentHash。M1 中先 seal 并写分支，成功后才与转移、`integration.performed` 同一事务记录；顺序与失败的去向只以 `06` §6.4.3 `goal.accept` 行为准（ADR-189/190）。
- 合并方式（🧑 选择，记住项目默认）：**M1 只有“仅保留分支”**（ADR-133：削减 ④′，Tower 不推送、不开 PR，`integrated` 只按本地 base 观测）；M2 增加本地合并到 base（合并队列）与推送分支并开 PR。合并动作本身属于自主度矩阵中的 `git.merge`/`git.push` 类，按矩阵执行。
- 观察到合入 → `integrated` → 24h 宽限期后 `archived`。宽限期内撤销时 M1 不写你的仓库，Goal 页写出要撤销的提交与做法（`10` §10.12；生成撤销草案属 M2，ADR-193），Goal 回到 `accepted`（`reverted`，见 §3.2 `integrated` 行，ADR-176）。

### 3.4.5 合同修订矩阵

合同修订（`amend_contract`）生成新版本（I3）。修订对当前状态的影响：

| 修订内容 \ 当前状态 | `draft`/`shaping` | `ready` | `running` | `paused` | `claimed`/`verifying` | `in_review` | `accepted`（未集成） |
|---|---|---|---|---|---|---|---|
| 意图/终态/约束**文字** | 直接编辑草案（未批准，不产生版本） | 更新简报 | 下一回合边界生效（系统段补丁，`05`）；Agent 收到修订通知 | 恢复时生效 | **不取消验证**（只改措辞不使已提交的工作失效）；通知在下一个 Run 生效 | 不影响验收门槛；评审页显示“合同措辞已修订” | 同左 |
| 新增/修改验收标准 | 同上 | — | 同上；受影响标准的 Fact 变为 `expired` | 受影响 Fact `expired`；修订本身不解除暂停；继续目标为 `review{state, pin}` 时显式改写为 `verify{pin}`（同一 pin、新标准，离开 `paused` 后先验证，不带着失效的标准结果回到评审，§3.2.1，ADR-178；同一事务写 `Goal.verifyFrom = state`，使验证后的去向按原状态判定，ADR-180）。`verify_failed_limit` 时最常见：修订后可 `retry_verify`。**“改为 human 标准”**（`verify_failed` 卡片，只在 `paused(verify_failed_limit)` / `paused(human_change_verify_failed)` 中提供）= 修订生效后界面自动发出 `retry_verify{pin:"same"}`，Goal 回到 `verifying`；修订取消则不发出，Needs-You 保持打开（ADR-169） | 取消并以新标准重新验证 | → `verifying`（新标准）| → `verifying`；通过且其余不变 → 验收延续（I2 判据）|
| 删除验收标准 | 同上 | — | 相关 Fact 归档 | 同左 | 重新判定 | 重新判定（可能仍 `in_review`）| 记录，验收保留 |
| 收紧范围围栏/自主度 | 同上 | — | **立即**下发新 policy（门禁即时生效）；已越界的改动生成哨兵 | 恢复时生效；已越界改动生成哨兵 | 重新跑围栏哨兵 | 同左 | 同左 |
| 放宽范围/自主度/预算 | 同上 | — | 立即下发 | 立即生效（`budget_*` 暂停可据此恢复） | 无影响 | 无影响 | 无影响 |
| 评审策略（`review.viewPolicy`） | 同上 | — | — | — | — | 重新计算验收门槛 | 不追溯 |

`integrated` 中不接受修订，`contract.amend` 返回 `E_STATE`（合入的是已验收的 seal；撤销合入回到 `accepted` 后按上表 `accepted` 列处理，ADR-195）。

**理由**：只有改变“什么算完成”（标准）与“允许做什么”（范围/自主度）的修订会使验证或验收失效；措辞修订不改变判定依据，不应作废已提交的工作。

所有修订都写 `amendmentNote`，Trace 中以“Tower 注入”显示 Agent 收到的修订通知。

### 3.4.6 中间态的崩溃恢复

应用退出或崩溃时处于 `claimed`/`verifying`/集成中间步骤的 Goal，按 `06` §6.1.6 的恢复表处理：验证幂等重做（以同一 pin 重跑；pin 丢失则重建）；集成步骤以影子 ref 记录的阶段标记幂等重做或回滚，启动时先做一致性检查。

### 3.4.7 放弃与复活

- 放弃必须选择原因（合同不清 / 方向错误 / 被其他 Goal 取代 / 不再需要 / Agent 能力不足 / 其他文本），原因进入学习闭环（`09`）。
- 复活从不重开旧 Goal：创建新 Goal，`resurrectedFrom` 指向旧 Goal，旧合同作为新合同的起草输入。审计历史不可变。

## 3.5 Goal 层级与依赖

- **子 Goal**：🤖 可在 shaping 或 running 中通过 `log{kind:"plan", text}` 在计划中提出拆分建议（显示为 Claim，⚙️ 识别其中的子目标条目），以 Needs-You `ratify`（severity 1）呈现，🧑 批准后创建；或 🧑 在 `maxDiffLoc` 超限提示时手动拆分。父 Goal 的验收标准可引用子 Goal：`kind:"subgoal_accepted"`（`02` §2.5，由状态机判定；子 Goal 验收失效或被复活时回到未满足）。
- 侧边栏最多显示两层；更深层在 Goal 页中展开。
- **依赖**：G2 依赖 G1 时，G2 在 `ready` 等待；或 🧑 选择“基于 G1 分支开始”（**M2**，ADR-194；G2 的 baseRef = G1 的 branch，G1 变化时 ⚙️ 提示 G2 rebase；M2 设计时 `10` §10.3.2 的删除条件须补“没有其他非终态 Goal 以它为 base”）。**满足**（`06` §6.2.4 准入引用本条，ADR-188）= G1 已被验收：处于 `accepted` 或 `integrated`，或经二者进入 `archived`（含“验收但不合并”，其分支保留，`06` §6.4.3）；放弃的 Goal 不算满足。以 G1 分支为 base 时（M2）取其最近一次 seal 写入的分支（`10` §10.6）。
- **共享资源冲突**被冲突雷达（M2）视为隐式依赖，建议排序（不自动强制）。

## 3.6 非代码 Goal

| kind | Changes 面板 | 验收标准常见形态 | 证据 |
|---|---|---|---|
| `code` | Diff（评审单元） | `exec` 测试 / 构建 / lint | diff、测试输出 |
| `investigation` | Findings（结论 + 置信度 + 证据） | `human`（“结论是否回答了问题”）+ `artifact`（报告存在且含必需章节） | 日志、查询结果、URL+检索时间 |
| `docs` | 文档 diff + 渲染预览 | `artifact`（内置检查，`07` §7.4.9；链接检查 `links_reachable` 属 M2，ADR-183） | 渲染截图 |
| `ops` | 执行计划 + 实际命令记录 | 全部单向门类动作需审批；`exec` 健康检查 | 命令输出 |

调研类 Goal 的 Finding 可一键“升级为代码 Goal”，Finding 作为新 Goal 合同的背景。
