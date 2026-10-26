# 第 20 轮评审回应：07 / 08 / 09

依据 ADR-146。

| 条目 / 决策 | 处理 | 位置 |
|---|---|---|
| R20-D4-01 / ADR-146 | `decide()` 的自动返工改为经过准入：无执行槽位或依赖未满足时 → `ready{waitReason:"slot"\|"dependency"}`，返工证据留在 `pendingOpenings`，准入后开 Run。组合表的失败行同步。“暂停解除后的验证”表的 `run` 行写明经过准入（`pendingHandBack{continue_agent}` 同此），以及 `ready` 中允许的 `pause`/`take_over`/`abandon` | `07` §7.10.3 |
| R20-D4-02 / ADR-146 | 窗口按 binding 分别计算：用各自的 `boundSeq`（绑定时的事件序号，不随 rebase 移动）与该仓库的检查点，任一仓库有人的改动即算。rebase 变化由 `rebase` 检查点计入 | `07` §7.10.3 |
| R20-D6-01 / ADR-146 | settle 序列中撤回时，同一事务把 `runs.phase` 写回 `running`；重启后执行 `settle` 而无有效提交时，按 settle 判定表进入 `idle_without_submit` 或 nudge | `07` §7.4.1 |
| R20-D7-01 / ADR-146（M2） | `user_bash` 调用窗口与 Agent 工具调用窗口重叠期间写入的路径记为 `mixedPaths`；只有 rebase 变化时，卡片与标签写“包含 base 的变化（rebase）” | `07` §7.10.3 |
| R20-D10-01（`07` L710）/ ADR-146 | 措辞改为：每 5 s 从 `exec` 已知进程遍历后代树；令牌全扫描最多每 60 s 一次，且只在 Run 活跃时。§7.4.1 的扫描时机同步，删去“不做持续的全进程扫描” | `07` §7.4.1、§7.4.3 |
| R20-D15-01 | 各项都不在 `07`/`08`/`09`。第 2 项（`bound_seq` 列）回答了上轮请主干确认的问题 | — |

`08`、`09` 中没有本轮条目涉及的内容。lint `--checks rstuvwxyzck`：退出码 0。

## 工时

| 线 | 内容 | 人周 |
|---|---|---|
| 系统（验证/状态机） | 返工经准入、按仓库计算的窗口 | 0.1 |
| 合计 | | **0.1** |

## 需要主干修改的地方

没有新增项。
