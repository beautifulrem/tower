# 第 21 轮评审回应：07 / 08 / 09

依据 ADR-147。

| 条目 / 决策 | 处理 | 位置 |
|---|---|---|
| R21-D4-02 / ADR-147 | `decide()` 选择返工时立即递增 `reworkCycles`，与转移在同一事务；直接开 Run 或进入 `ready` 排队都递增，排队中被 `pause`/`abandon` 时不回退。`ready` 分支写 `queuedRun{kind:"rework"}`，准入通过时才发 `run.requested{rework}`。组合表的失败行同步（原写“`running`（返工 +1）”） | `07` §7.10.3 |
| R21-D7-01 / ADR-147（M2） | 有两种情形时，`user_bash` 窗口内的写入一律记为 `mixedPaths`：窗口与 Agent 工具调用重叠；窗口内有不属于该 `user_bash` 调用进程树的 Agent 进程存活（以两个 `BashOperations` 实例各自已知的直接 pid 及其后代区分）。只有没有其他 Agent 活动时才归因为人。`decide()` 注释与“Human 层归因的来源”段同步 | `07` §7.10.3 |
| R21-D4-01 | `ready` 的出口在 `03`/`06`；`07` 中无对应文字 | — |

lint `--checks rstuvwxyzck`：退出码 0。

## 工时

| 线 | 内容 | 人周 |
|---|---|---|
| 系统（验证/状态机） | 递增时机与 `queuedRun` 写入；`!cmd` 窗口的进程树判定（M2） | 0.05 |
| 合计 | | **0.05** |

## 需要主干修改的地方

没有新增项。
