# 第 23 轮评审回应：`05`、`06`

以 ADR-149 为准（取代 ADR-148 补记的“两段准备”；主干 `02`、`03` 已改）。每条一行：条目 → 修订位置。

- R23-D6-01（准备顺序与时限）→ `06` §6.2.4 准备阶段段落重写：顺序引用 `10` §10.3.1；依赖物化不阻止 Run（失败或 15 分钟 → `running` + Fact `prepare{ok:false}`），其间 `pause` 中止物化、`take_over` 返回 `E_BUSY`；120 s 只计卫星、握手与开场，其间 `pause`/`take_over` 返回 `E_BUSY`；`abandon` 始终允许。准入流水线行同步。`05` §5.3.1 “准备阶段时限”段改回此规则，RPC 握手行同步。
- R23-D6-01 第 3 项 / R23-D6-02（`prepare_failed`）→ `06` DDL `pause_reason` 的 `CHECK` 加入 `prepare_failed`；§6.2.4：卫星创建失败（含路径冲突，`broken`）、握手失败、开场失败或 120 s 超时 → `paused(prepare_failed)`（继续目标 `run`，`queued_run` 保留，不在启动时自动解除、不 `autoResume`，`stalled{prepare_failed}`，去重 `st:{goalId}:prepare`）；F4b 重写；§6.1.6 `paused` 行注明 `prepare_failed` 不在启动时解除，“准备阶段中崩溃”行排除已处于 `prepare_failed` 的 Goal；`goal.resume` 可解除 `prepare_failed`（路径冲突时先改名重建），`goal.take_over` 自 `paused(prepare_failed)` 仅当卫星可用。
- R23-D6-03（准备中途到达其他原因）→ `06` §6.2.4：中止准备，以这些原因进入 `paused`（与 `draining_for{target:"pause"}` 同样合并），继续目标 `run`，`queued_run` 保留。
- R23-D4-01（`queuedRun` 的写入与清除）→ `06` §6.2.4 与 `queued_run` 列注释：只在 `run.started` 与 `abandon` 时清除，`pause`/`take_over`/`external_change`/`prepare_failed` 保留；写入表引用 `16`；`goal.abandon` 行写明清除；`goal.hand_back` 行：立即执行的 `continue_agent` 经准入、Run `reason:"handback"`（原写 `resume`）。

## 人周

| WBS 行 | 本轮增量 | 内容 |
|---|---|---|
| W3 Supervisor 核心 | +0.1 | `prepare_failed` 原因与出口、准备中途的原因合并、`queued_run` 清除规则、`handback` 原因 |
| W4 进程生命周期 | −0.05 | 撤回第 22 轮补记的两段计时（依赖物化不再单独计时、不再进入失败出口） |
| **合计** | **+0.05** | |

## 需要主干处理

- `16` §16.1.1：`prepare_failed` 的优先级与“不在启动时自动解除”；`08` §8.4：去重键 `st:{goalId}:prepare`。
