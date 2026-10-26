# 第 22 轮评审回应：`05`、`06`

以 ADR-148 为准（主干 `03` 已改）。每条一行：条目 → 修订位置。

- R22-D4-01（`queuedRun` 的生命周期）→ `06` §6.3：`CHECK (state <> 'ready' OR queued_run IS NOT NULL)`；`queued_run` 注释改为在 `run.started` 同一事务中清除；`runs.reason` 的 `CHECK` 加入 `handback`（与 `queued_run.kind` 一一对应）。§6.2.4：合同批准写 `{kind:"initial"}`、依赖回退写 `{kind:"resume"}`；排序键把 `initial` 定义为“该 Goal 的第一次启动”；准入后的流水线写明 `run.started` 同一事务清除。§6.1.6 恢复表新增 `ready`（保持并重新判定准入）与“准备阶段中崩溃”（回到 `ready`，`queued_run` 保留）两行。
- R22-D6-01（准备阶段的失败出口）→ `06` §6.2.4：准备阶段总时限 120 s；失败或超时 → `paused(engine_crash)`、继续目标 `run`、`queued_run` 保留、不 `autoResume`、Needs-You `stalled{prepare_failed}`（重试 / 我来改，仅卫星已存在 / 放弃）；准备中 `pause`/`take_over` 返回 `E_BUSY`，`goal.abandon` 始终允许并中止准备；§6.8 新增 F4b；`goal.pause`、`goal.abandon` 行同步。`05` §5.3.1 新增“准备阶段时限”段，RPC 握手行注明计入 120 s。
- R22-D15-01 → 主干已改（`03` §3.2.1），`06` `goal.discard_human_edits` 行在第 21 轮已是“`takeover_from ∈ {running, ready}` 或 `takeover_prior_reasons` 含 `human`”，无需再改。

- ADR-148 补记（准备阶段分两段）→ `06` §6.2.4 准入段与流水线、F4b、`goal.pause`/`goal.take_over`/`goal.abandon` 行：依赖物化以 `prepare.depsTimeoutMin` 为限、可 `pause`（→ `paused(human)`，继续目标 `run`）与 `abandon`、`take_over` 返回 `E_BUSY`；启动段 120 s，`pause`/`take_over` 返回 `E_BUSY`；`prepare_failed` 写明失败段。`05` §5.3.1 同步。

## 人周

| WBS 行 | 本轮增量 | 内容 |
|---|---|---|
| W3 Supervisor 核心 | +0.1 | `queued_run` 的写入点、CHECK 与清除时点、两条恢复行、`handback` 原因 |
| W4 进程生命周期 | +0.1 | 准备阶段两段计时（依赖物化可中止）、失败出口与 `abandon` 中止准备 |
| **合计** | **+0.2** | |

## 需要主干处理

- `08`/`16`：登记 Needs-You `stalled{prepare_failed}` 子类型与其标注映射。
