# 第 14 轮评审回应：`05`、`06`

以 ADR-128..132 为准（主干 `02`、`03` 已改）。每条一行：条目 → 修订位置。

- R14-D4-01（`external_change` 的持久状态与接线）→ `06` §6.3：新列 `goals.external_change`（`02` Goal.externalChange）+ 与原因同生同灭的 `CHECK`；`resume_to` 注释改为只服务 `satellite_missing`（`CHECK` 本就如此）；`pending_verify` 跨越范围加入 `external_change`；事件 `goal.external_change.detected`/`.resolved` 登记于 events 表后的注释；`checkpoints.external_paths`。§6.4.3 `keep`/`revert` 改为“先解除、再按通用规则”，语义只引用 `03` §3.2.1（含 `settling` 回到 settle 序列、已有 pin 时 `pendingVerify`、revert 后剩余差异的分类）；`goal.take_over` 在 `external_change` 未解除时 `E_STATE`；`goal.hand_back` 只对“来源不明”的写入要求 `externalResolution`。
- R14-D4-02（放弃改动与 I2）→ `06` `goal.discard_human_edits` 树已改变分支拆为 `agent_bg` → `verifying` / 其余 → `paused(external_change)`，不验证；§6.2.3 I2 行首句与 Projector 断言按来源分界（ADR-128）。
- R14-D4-03 / R14-D5-01（宽限失败、提醒回合，ADR-129）→ `05` §5.5：宽限失败的唯一定义（不记异常，等下一次 `agent_settled`）；删除“settle 之后才发现 submit 无效 / `prompt` 提醒回合”行，写明 Tower 不以 user 角色注入；`tower.processes_terminated` 以 `sendCustomMessage(…, {triggerTurn:false})` / RPC `pi.sendMessage` 投递、恢复时为第一条消息（v1.2.0 核实：`agent-session.ts:2318-2353`，`ExtensionAPI.sendMessage` `types.ts:1731-1734`）；settle 序列中的外部写入 → `paused(external_change)`，`phase:"settling"`。新增 D54、C32。`06` §6.1.10 与 §6.2.3 I4 行同步。
- R14-D5-02（变更类工具调用，ADR-130）→ `05` §5.6.2c、`turnMaybeMutated`、`SubmitDetails.fingerprint` 注释改为引用 `16` 的唯一定义；`06` I4 行与 Projector 断言同步；新增 C33（submit 后嵌套 `edit`、MCP 写工具、`readOnlyHint` 但路径不通过）。
- R14-D4-04（ADR-131）→ `06` Sentinels 行登记 `nested_repo_live`（run 类、不可覆盖、出口）；`goal.resume` 对仅含该命中的 `sentinel_high` 要求必填转向；`sentinel.override` 排除它与 `excluded_paths` 引起的 `nested_repo`；GitRunner 行加 `:(exclude)` 重试；`checkpoints.excluded_paths` 列。
- R14-D13-01（远端合并）→ `06` §6.1.6 `awaiting_remote` 行：任何非终态观测到远端合并 → `integrated`，`external_change` 以 `obsolete` 关闭（M1 若执行削减 ④′ 只观测本地 base）。
- R14-D6-01（macOS 孤儿窗口）→ `06` §6.1.10 每 Run 进程组条目、§6.3 新表 `run_process_groups`、§6.1.6 恢复行。
- R14-D8-01（注意力登记）→ `06` DDL `needs_you.kind` 加 `external_change`（去重 `ec:{goalId}`）。
- R14-D15-01 第 2、3、5、6、7 项 → 已随上述各条修正。

## 人周

本轮 `05`/`06` 新增的实现工作约 **3.5 人周**（系统线）：`external_change` 持久化与出口接线 1.5；settle 序列、宽限失败、`processes_terminated` 投递与 C32/C33 0.6；变更类工具分类器 0.3；`nested_repo_live` 与 `:(exclude)` 重试 0.5；每 Run 进程组与恢复 0.4；远端合并规则 0.2（执行削减 ④′ 时降为 0.05）。

## 需要主干处理

- `16`：写出“变更类工具调用”的唯一定义条目（ADR-130，`05`/`06` 已引用）；登记事件 `goal.external_change.*` 与 `checkpoints.excluded_paths`/`external_paths` 字段。
- `10` §10.8.4 第 6 步：按 ADR-128 只对“来源不明”的写入提供三个选项。
