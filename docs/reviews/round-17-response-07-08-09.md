# 第 17 轮评审回应：07 / 08 / 09

本轮依据 ADR-140 – ADR-143，以及 `02`、`03` 的主干修订。安全相关文字只写到设计层面。

| 条目 / 决策 | 处理 | 位置 |
|---|---|---|
| R17-D4-01 / ADR-140 | 失败去向改为 `03` §3.2.1 的唯一归因规则。<br>• `decide()` 删去 `agentCaused`，改为 `humanTouched`：自上一个已验证 pin（没有则 base）以来，是否存在 `author:"human"`/`mixed` 检查点。<br>• 返工条件：返工 < `maxReworkCycles`，且预算未达硬上限；已达硬上限时 → `budget_hard_cap`，返工证据进入 `pendingOpenings`。<br>• 组合表把五个按 trigger 区分的失败行合并为一行“按归因”。<br>• 删除所有按 `verifyOrigin`、`verify_new.origin`、`adoptedHuman` 区分的分支；`verifyOrigin` 只作说明。<br>• 继续目标改回纯目标，开场改为 `Goal.pendingOpenings`：多段开场，任何 Run 开始时都消费 | `07` §7.10.3、§7.4.1 |
| R17-D15-01 第 4 项 | `settle` 目标下的 `keep` 与 `03` 一致：不改写目标，不另作标记；采纳产生的 `author:"human"` 检查点使失败不自动返工 | `07` §7.4.1、§7.10.3 |
| R17-D4-03 第 1、2、3 项 | 硬上限下 `claim` 失败不开 Run。放弃改动的判据读 `takeoverPriorReasons`。`verifyFrom` 写入点列全：进入 `claimed`（settle、`claim`、Host 不存在时的 settle）；I2、`retry_verify`、`grant`、`bring_back`、修订标准；`verify_new`；`reverify` | `07` §7.10.3 |
| R17-D4-03 第 4 项 / ADR-143 | Host 不存在时的 settle 重跑写入“暂停解除后的验证”表；原文的“第 2 步”改为“从宽限确认起”（R17-D15-01 第 8 项） | `07` §7.4.1、§7.10.3 |
| R17-D4-02 / ADR-143 | 从 §7.7.1 删去 `rework_cycles_over`（M1 种类与表格中的行）；返工上限只由 I6 / `maxReworkCycles` 定义，停止条件的任何静默都不影响 I6。再武装规则改为引用 `16` `Goal.stopConditionSilences`；`08` 与 `09` L9 同步 | `07` §7.7.1；`08` §8.4、§8.8；`09` §9.6.2 |
| R17-D8-01 / ADR-143 | `idle_without_submit` 的选项改为引用 `03` §3.2.1，删去“回复 / 暂停 / 要求提交” | `08` §8.6.4 |
| R17-D5-01 第 3 项 / ADR-143 | nudge 起点持久化为会话条目 `tower.run_start` | `07` §7.4.1；`08` §8.6.4 |
| R17-D6-01 / ADR-141 | draining 改为按 `drainingFor` 的原因集合处理 | `07` §7.4.1；`08` §8.6.4 |
| R17-D6-02 / ADR-142 | settle 第 3 步与 `bg_process_survived` 改为以 `TOWER_RUN_TOKEN` 识别，删去 `(bootSession, pid, startTime)`。`08` L373 检查的是 Host 进程本身，不属此类，保留 | `07` §7.4.1；`08` §8.4 |
| R17-D15-01 其余项 | 不在 `07`/`08`/`09` | — |

lint `--checks rstuvwxyzck`：退出码 1，只有 (c) 两处，都在 `16` L28（`run.openings`、`settle.adoptedHuman`），见下文第 1 项；`07`/`08`/`09` 无问题。

## 工时（删除计为负）

| 线 | 内容 | 人周 |
|---|---|---|
| 系统（验证/状态机） | 归因判定与硬上限检查 +0.4；删除 `verifyOrigin`/`origin`/`adoptedHuman` 分支 −0.2；补全 `verifyFrom` 写入点 +0.1 | 0.3 |
| 系统（注意力/学习） | 选项改为引用、`stc` 文案 +0.1；删除 `rework_cycles_over` 求值与再武装 −0.1 | 0.0 |
| Agent（tower-goal） | `tower.run_start` 会话条目 +0.1（令牌注入计在 `05`/`06`） | 0.1 |
| 合计 | | **0.4** |

## 需要主干修改的地方

1. **`16` L28**：`Continuation` 仍是 `run{openings}` 与 `settle{adoptedHuman}`，lint (c) 因此失败；应按 ADR-140 改为纯目标。
2. **`16` L27 与 `02` L168**：`verifyFrom` 的写入点缺 `inspect.bring_back` 与修订验收标准（R17-D4-03 第 3 项）。`07` 已列入，`16` 是唯一来源，需要补上。
3. **`16` L272**：
   - 仍含 `rework_cycles_over` 的再武装规则（ADR-143 已删除）。
   - `scope:"run"` 仍写“静默到本 Run 结束”，但命中的那个 Run 已随 drain 结束（R17-D4-02 第 4 项）。建议改为“到下一个开始的 Run 结束”：`runId` 在下一次 `run.started` 时绑定；`06` L454 的注释同步。
4. **`03` L70 的守卫**：从 `verify` 改写出的 `verify_new` 的 `returnTo` 仍为空，因此 `accepted`/`in_review` 的来源会被重置为 `claimed`（R17-D4-03 第 3 项的反方向，组合 18）。是否改为取当时的 `Goal.verifyFrom`，需要主干裁决；`07` 目前按 `03` 写。
