# 第 18 轮评审回应：07 / 08 / 09

依据 ADR-144 与 `02`、`03` §3.2.1 的主干修订。安全相关文字只写到设计层面。

| 条目 / 决策 | 处理 | 位置 |
|---|---|---|
| R18-D4-01 / ADR-144 | `decide()` 的归因窗口与 `03` 一致：<br>• 人的改动改为 `author:"human"` 或 `mixedPaths` 非空的检查点，删去 `cp.author === "mixed"`。<br>• 窗口起点取以下两者中较晚者：最近一次**通过**的验证的 pin（`lastPassedPin`，没有则 base）；人最近一次把工作交给 Agent 的决定。<br>• 保留 M2 rebase 例外。<br>组合表的失败行与“典型情形”段同步，并写明交回 Agent 后自动返工恢复 | `07` §7.10.3 |
| R18-D4-02 / ADR-144 | 硬上限下的验证失败：进入 `paused(budget_hard_cap)`，继续目标 `run`；返工证据以 `OpeningRef {factId}` 入队。`run` 目标遇硬上限时保持暂停 | `07` §7.10.3 |
| R18-D8-01 / ADR-144 | 开场段落：`OpeningRef = {decisionId} \| {factId}`；“下次运行开场：N 条”的显示与逐条撤回（`goal.openings.withdraw`）；`keep`/`revert` 以 `{decisionId}` 入队。`08` 没有列出 Goal 卡片的组成元素，且该显示不是 Needs-You，因此 `08` 不加 | `07` §7.10.3 |
| R18-D15-01 第 1 项 | 守卫行的 `returnTo`：从 `verify` 改写时取当时的 `Goal.verifyFrom`（∈ {`in_review`, `accepted`}）。`keep` 从 `verify` 改写时同样如此 | `07` §7.10.3 |
| R18-D5-01 / R18-D6-02 / R18-D11-01 / ADR-144 | 令牌由 `BashOperations.exec` 自身注入，`user_bash` 路径同样带令牌。`tower.run_start` 每个 Tower Run 只写一次。扫描只在三个时点进行，加上存活条目打开期间每 30 s 一次。读取其他进程环境只在内存中匹配令牌，不记录、不持久化、不传输，也不对其他用户的进程运行 | `07` §7.4.1 |
| R18-D6-02（`08` L486） | `bg_process_survived`：打开期间每 30 s 重新扫描，存活者全部退出时以 `obsolete` 自动关闭，部分退出时更新列表。标注映射同步：“知悉”只结束打扰，存活期间的归因不变 | `08` §8.4、§8.8 |
| R18-D15-01 其余项 | 都不在 `07`/`08`/`09`：第 5 项“到本 Run 结束”在 `07`/`08` 中已于第 17 轮改为引用 `16`；第 9 项属 `14` | — |

lint `--checks rstuvwxyzck`：退出码 1，只有 (s) 一项——`06` `decisions.kind` CHECK 与 `16` `HumanDecision.kind` 缺少 `withdraw_opening`（`02` 已有），都不在 `07`/`08`/`09`。

## 工时

| 线 | 内容 | 人周 |
|---|---|---|
| 系统（验证/状态机） | 归因窗口（通过的 pin、交给 Agent 的决定）与 `mixedPaths` 判定；硬上限分支改写为继续目标 `run` + `{factId}` | 0.2 |
| 系统（注意力） | 存活条目的 30 s 扫描与自动关闭 | 0.1 |
| Agent（tower-goal） | 无（令牌注入计在 `05`） | 0.0 |
| 合计 | | **0.3** |

## 需要主干修改的地方

1. **`06` `decisions.kind` CHECK 与 `16` `HumanDecision.kind`**：加入 `withdraw_opening`（lint (s) 失败）。
2. **`lastPassedPin` 的“通过”**：`07` 把 `verified`、`verified_qualified`、`not_machine_verified`（无阻断进入 `in_review`）都算作通过。`03` 只写“通过的验证”，是否包含“未经机器验证”需要在 `03` 写明。
