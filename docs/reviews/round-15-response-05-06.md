# 第 15 轮评审回应：`05`、`06`

以 ADR-134..136 为准（主干 `02`、`03` 已改）。每条一行：条目 → 修订位置。

- R15-D4-01（继续目标，ADR-134）→ `06` §6.3：`resume_to`、`pending_verify` 两列由 `continuation` JSON 列取代，`CHECK ((continuation IS NULL) = (state <> 'paused'))`；`external_change` 注释去掉 `detectedIn`；新事件 `goal.continuation.set`。§6.4.3 表前新增“暂停出口的统一写法”（解除本原因 + 显式改写；只有 `onAllReasonsCleared()` 离开 `paused`，含守卫与 `nested_repo_live` 例外）；逐行改写 `goal.pause`、`goal.resume`、`goal.retry_verify`、`goal.retry_claim`、`goal.claim_on_behalf`、`goal.external_change.keep`/`.revert`、`goal.take_over`（写继续目标）、`goal.hand_back`（`take_external` 时 `mode` 必须省略、不写 `pending_hand_back`）、`goal.retry_after_human_change`、`goal.discard_human_edits`、`s0.grant`/`s0.deny`、`sentinel.override`、`budget.extend`。§6.1.6 新增 `paused` 恢复行（重启不执行任何动作，直到原因解除）；卫星丢失行与 F14 改用继续目标；§6.1.4 与 `verifying` 恢复行去掉 `pendingVerify`。`05` §5.5 优先级段同步。
- R15-D4-02（revert 后的剩余差异）→ `06` `goal.external_change.revert` 行：只考察 `paths` 中的路径（ADR-134）。
- R15-D6-01 → (1) `05` §5.3.5 新增“进程组策略”（与 Pi bash 相同 `detached`，`tools/bash.ts:112-118`，每次调用上报 pgid）；`06` `run_process_groups` 改为 `bash_process_groups`（每个产生子进程的 bash 调用一行），§6.1.10 与 §6.1.6 同步。(2) §6.2.3 I2 断言限定为 `cause:"fingerprint_changed"` 的转移。(3) §6.1.10：settle 中检测到外部写入只发生在进程树清空之后，下一步唯一为 `agent_bg_done` → I4 → `claimed`。
- R15-D5-01（ADR-135）→ `05` §5.5：宽限为“连续 2 s 不流式且不压缩”，压缩结束后重新计时（C34）；settle 判定表新增“nudge 守卫不成立 → 直接 `idle_without_submit`”；Tower 发起的回合以 `tower.*` custom message 开始，只有人写的文字为 user 角色——`RunSpec.opening`/`ResumeSpec.opening`（`RunOpening{tower?, human?}`）与 `EngineAdapter.inject` 取代 `initialInput`/`resumeInput`，§5.8 返工与交还行同步；RPC 经 `/tower-inject <id>` 扩展命令投递（§5.6.1 新增通道行）。**v1.2.0 核实**：`prompt` 以 `/` 开头时先执行扩展命令、不产生 user 消息、流式中也立即执行（`agent-session.ts:2060-2068, 2141-2163`；`rpc-mode.ts:394-412`；`registerCommand` `types.ts:1680`），空闲时 `sendCustomMessage(triggerTurn:true)` 开始 run 并触发 `before_agent_start`（`agent-session.ts:2339-2345`，`types.ts:949-957`）。新增 D55、D56、C35。
- R15-D7-01（`mixed`）→ `06` `checkpoints.mixed_paths` 列。
- R15-D8-01（`stop_condition` 出口）→ `06` `goal.resume` 参数加 `feedback?: "stop_condition_false_positive"`（按 `stopConditions[].id` 标注）；“修订合同后继续”= `contract.amend` 后 `goal.resume`。
- R15-D13-01（ADR-136）→ `06` `goal.accept` 行加重新 seal 的分支规则；GitRunner 行 `:(exclude)` 改为最多 64 次/64 条的循环。
- R15-D15-01 第 1 项（重复列）→ `checkpoints.external_paths` 只保留一处；第 2 项（`claimed` 分支）→ 继续目标 `verify{verifyFrom:"claimed"}` 覆盖；第 5 项 → `05` §5.8 返工改为 `inject(tower.rework)`；第 8 项 → `05` 的 `sendCustomMessage` 行号改为 v1.2.0 的 `2318-2353`。

## 人周（按 WBS 行去重）

| WBS 行 | 本轮增量 | 内容 |
|---|---|---|
| W3 Supervisor 核心 | +0.5 | `continuation` 列与事件、`onAllReasonsCleared()` 与守卫、命令改写、I2 断言 `cause`（取代分散的 `resumeTo`/`pendingVerify` 逻辑，净增） |
| W6 Pi 适配器与 tower-goal | +0.6 | `RunOpening`/`inject`、`/tower-inject` 命令与待投递文件、宽限的压缩重计时、nudge 守卫行、C34/C35 |
| W4 进程生命周期 | +0.1 | `bash_process_groups` 每次调用一行与恢复（取代每 Run 一行） |
| W7-core | +0.05 | `:(exclude)` 循环与 64 上限 |
| W15 集成 | +0.1 | 重新 seal 的分支规则 |
| **合计** | **1.35** | |

## 需要主干处理

- `16`：登记事件 `goal.continuation.set`、表 `bash_process_groups`、`goal.resume.feedback`；删除 `resumeTo`/`pendingVerify` 的字段行。
- `13`：进程组记录改为每次 bash 调用一行（写入量随调用数而非进程数）。
