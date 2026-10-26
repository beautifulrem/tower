# 第 21 轮评审回应：`05`、`06`

以 ADR-147 为准（主干 `02` `Goal.queuedRun` 已改）。每条一行：条目 → 修订位置。

- R21-D4-02（排队的 Run 带类别）→ `06` §6.3 新列 `goals.queued_run`；§6.2.4 准入按 `queued_run.kind` 判定，只有 `initial` 受评审余量闸控（第 c 项），通过时以它发 `run.requested{kind}` 并清除；§6.2.3 I6 行：`reworkCycles` 在 `decide()` 选择返工时递增，排队不回退。
- R21-D4-01（`ready` 的出口）→ `06` `takeover_from` 的 `CHECK` 加入 `ready`；`goal.take_over` 自 `ready` 只在卫星已存在时提供；`goal.discard_human_edits` 自 `ready` 接管后保持 `paused(human)`（继续目标 `run`，`queued_run` 保留）；§6.2.3 I2 行：`ready` 中来源不明的写入 → `paused(external_change)`，继续目标 `run`；§6.2.4 与 `goal.pause` 行：准备阶段 `pause`/`take_over`/`abandon` 返回 `E_BUSY`，`ready` 中暂停保留 `queued_run`。
- R21-D7-01（M2 `!cmd` 期间的 Agent 后台进程）→ `05` §5.3.5：`user_bash` 返回另一个实例 `userBashOps`（同一工厂、同一档位与令牌），两个实例各自记录直接 pid；窗口内有不属于该调用进程树的 Agent 进程存活时写入记 `mixedPaths`。`06` §6.1.10 同步。

## 人周

| WBS 行 | 本轮增量 | 内容 |
|---|---|---|
| W3 Supervisor 核心 | +0.1 | `queued_run` 与按类别准入、`reworkCycles` 递增点、`ready` 的接管/放弃/外部写入、准备阶段 `E_BUSY` |
| W6 Pi 适配器与 tower-goal | +0.05 | `userBashOps` 独立实例与进程树区分（M2） |
| **合计** | **+0.15** | |

## 需要主干处理

无（`16` 登记 `goals.queued_run` 列与 `takeover_from` 新取值即可）。
