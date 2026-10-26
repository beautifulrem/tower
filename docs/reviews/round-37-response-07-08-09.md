# 第 37 轮评审回应：07 / 08 / 09

依据 ADR-163。

| 条目 / 决策 | 处理 | 位置 |
|---|---|---|
| R37-D7-01 / ADR-163（`not_run` 的判定语义） | `outcomeOf` 不计入 `not_run`。原因分两种：<br>• `other_criteria_failed`：其他标准已失败 → `fail` → 失败路径；<br>• `blocked_by_sentinel`：其他标准全部通过 → `pass` → `paused(sentinel_high)`。<br>原 L1507/L1529 的问题是“先判失败、后判哨兵”使 `sentinel_high` 永远到不了；`not_run` 不再计为失败后，这一问题随之消失，`decide()` 中加注说明。`verify()` 按两种原因记录。<br>`override_sentinel` → `verify{pin, secretPhaseOnly:true}`：只运行机密阶段，通过后才进入评审。`sentinelItem` 带 `secretPending`，选项文案改为“覆盖并完成验证”。组合表与“暂停解除后的验证”表各加一行。<br>缓存从不缓存 `not_run` | `07` §7.4.1、§7.4.4、§7.10.3 |
| R37-D6-01 / ADR-163（全局、原子、串行） | 机密阶段改为整机范围，删去原 L458–459 的按项目取槽位与按项目冻结。“判定无活动 → 取槽位 → 设置冻结”在 Supervisor 单写者线程中一次完成（`secretPhaseGate`）。机密阶段严格串行，`run_now` 只跳过等待非机密活动，从不与另一个机密阶段并行。`secretMutex` 关闭时仍然串行 | `07` §7.4.1 |
| R37-D6-02 / ADR-163（收尾与恢复） | `finally` 的顺序改为：`killAll` → `teardown`（服务、容器卷，§7.4.4）→ `release` → `unfreeze`。冻结上限 = `verify.slotPrepareTimeoutMin` + Σ 标准超时。崩溃恢复：终止 → teardown → 解冻 → 重新排队 | `07` §7.4.1 |
| R37-D11-01 / ADR-163（冻结的单一闸口） | §7.4.1 与 §7.4.3 改为引用 `startAgentActivity()`，不列举它覆盖的启动路径 | `07` §7.4.1、§7.4.3 |
| R37-D15-01（`07` L367） | `as_file` 改为“只能在等待中做出，另起一次普通槽位流程，不冻结”，与伪代码一致 | `07` §7.4.1 |
| `08` `override_sentinel` | `sentinel` 标注行补充：标注只看覆盖的原因；存在 `blocked_by_sentinel` 时，覆盖后先只运行机密阶段，通过才生成 `review_ready`，失败另成 `verify_failed` 条目 | `08` §8.8 |

`09` 无涉及。lint `--checks rstuvwxyzck`：退出码 0。工时：0.1 人周（单写者闸口、`secretPhaseOnly` 分支、收尾顺序与恢复）。

## 需要主干修改的地方

1. **`02` `Continuation.verify`** 增加可选字段 `secretPhaseOnly?: true`（ADR-163）。lint (c) 比对字面形状，`02`/`16` 需同步。
2. **`16` §16.2** 登记 `verify.slotPrepareTimeoutMin`（默认 10 分钟）；`CriterionCheckData.verdict = "not_run"` 及两个 `reason` 值。
3. **验证槽位池按项目划分**（`07` L516、§7.13 的 `poolSize`）与机密阶段的整机独占并存：`secretPhaseGate` 从“全局验证器”取槽位，需要 `06` §6.2.4 写明它从哪个池取、是否与项目池共享计数。`07` 暂写为“从全局验证器取槽位”。

**补记（ADR-163 补记）**：`07` §7.4.1 的“从全局验证器取槽位”改为“从该 Goal 所在项目的验证器池取槽位”（“无活动”判定通过时任何地方都没有其他验证在运行，必有空闲槽位）；“整机范围”只指“无活动”判定与冻结。上文“需要主干修改的地方”第 3 项随之关闭。
