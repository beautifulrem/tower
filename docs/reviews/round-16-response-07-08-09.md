# 第 16 轮评审回应：07 / 08 / 09

本轮依据 ADR-137 – ADR-139，以及 `02`、`03` 的主干修订。安全相关文字只写到设计层面。

| 条目 / 决策 | 处理 | 位置 |
|---|---|---|
| R16-D4-01 / R16-D15-01 第 1 项 / ADR-137 | 从继续目标中删除 `verifyFrom`（原 L1379、L1469），改为 `verify{pin}`、`run{openings}`。写明 `verifyFrom` 的写入点，共四处：进入 `claimed`；I2、`retry_verify`、`grant` 从 `in_review`/`accepted` 进入；执行 `verify_new` 时写 `returnTo ?? "claimed"`；`reverify` 时写 `takeoverFrom`。“暂停解除后的验证”表新增 `claim`、`settle` 两行，`verify_new` 改为写 `returnTo ?? "claimed"`。`run` 的开场按 `openings` 组装；有人写的文字时，`tower.*` 先以 `triggerTurn:false` 追加，再以 `prompt` 发出 | `07` §7.10.3 |
| R16-D4-01（`claim_on_behalf`） | `decide` 组合表：`claim` 目标走 `trigger:"claimed"`，失败按 Agent 路径，Trace 记“人代为提交” | `07` §7.10.3 |
| R16-D4-02 / ADR-137 | settle 序列第 6 步：I4、pin、`claimed` 在同一事务。settle 中任何原因进入的暂停都写 `settle` 目标（含 `retry_claim`），恢复时从宽限确认起重跑。`discard_human_edits` 在 `takeoverFrom = running` 或原因中含 `human` 时，保留 `paused(human)`。`nested_repo_live` 条目消失后一律加入 `human` | `07` §7.4.1、§7.10.3 |
| R16-D7-01 / ADR-137 | `run` 目标下 `keep`/`revert`：追加到 `openings`，开场附 `tower.external_resolved{kept, reverted, mixed}`。`settle` 目标下 `keep`：`verifyOrigin` 记为 `human_change`。组合表新增 `claimed × fp_changed_human` 两行，失败不自动返工。验收延续只在 `verifyFrom = accepted` 时适用 | `07` §7.4.1、§7.10.3 |
| R16-D6-02 / R16-D5-01 / ADR-138 | 只有“非 draining 且 `outcome = completed`”时，才适用“守卫不成立 → 直接 `idle_without_submit`”。draining 按 `drainingFor.reason` 处理。nudge 窗口锚定在 Run 起点。唤醒续跑改用 `tower.resume{reason:"wake"}`。返工证据只有一条注入路径 | `07` §7.4.1、§7.10.3；`08` §8.6.4 |
| R16-D8-01 / ADR-139 | 新增停止条件表：M1 的四类条件、各自的求值点与命中动作，`natural` 不产生 `stop_condition`。写明再武装规则（“继续”、修订、“这里不该停”）。在 `08` 中写明 `stc` 条目在再武装后不会重复计数，卡片显示命中对象。在 `09` L9 中写明“这里不该停”使条件静默到下一次修订 | `07` §7.7.1；`08` §8.4、§8.8；`09` §9.6.2 |
| R16-D13-01 第 1 项 / ADR-139 | 超过 64 条或 64 次时不再标为 `verify_env_error`：一次枚举全部会被拒绝的路径并排除，检查点或 pin 照常完成；以 `nested_repo` 阻断并列出全部路径，`running` 中进入 `nested_repo_live` → `paused(sentinel_high)` | `07` §7.3.2、§7.10.1 |
| 第 16 轮补充（git 拒绝收录的唯一定义归 `10`） | `07` 中改为引用 `10` §10.1.2、§10.7.1：一次列出、一次排除，不设上限。删除伪代码中的重试循环与 64 上限，§7.10.1 的 `nested_repo` 行也删去相应文字。保留 `07` 自己的后果：`nested_repo`/`nested_repo_live`、不可覆盖、唯一出口是删除、永不标为 `verify_env_error`。lint `--checks rstuvwxyzck` 退出码 0，各项问题数均为 0 | `07` §7.3.2、§7.10.1 |
| R16-D13-01 第 2 项 / ADR-137 | 合入的是较旧的 seal 时不进入 `integrated`，`ec` 条目不以 `obsolete` 关闭 | `08` §8.8 |
| R16-D15-01 第 6 项 / ADR-137 | `budget` 的出口：`extend_budget` 只提高额度，由 `resume` 解除 | `08` §8.6、§8.8 |
| R16-D15-01 其余项 | 不在 `07`/`08`/`09` | — |

## 工时

| 线 | 内容 | 人周 |
|---|---|---|
| 系统（Supervisor/验证） | `verifyFrom` 写入点；`claim`/`settle` 目标；`openings` 组装与 `external_resolved`；pin 与 `claimed` 同一事务；超限时一次枚举 | 0.9 |
| 系统（注意力/学习） | 停止条件求值点与再武装、`stc` 计数；`budget` 出口 | 0.3 |
| Agent（tower-goal） | gate 中停止条件的拒绝；nudge 窗口改锚；唤醒与返工的注入路径 | 0.2 |
| 合计 | | **1.4** |

## 需要主干修改的地方

1. **`03` L70 与 `02`/ADR-137 不一致**：`03` L70 写“验证的源状态 = `returnTo ?? Goal.verifyFrom`”，ADR-137 与 `02` 写的是 `returnTo ?? "claimed"`（不沿用旧值）。`07` 按 ADR-137 写。
2. **`16` L28** 的 `Continuation` 仍是 `{kind:"run"}`，缺少 `openings`，也没有 `{kind:"claim", decisionId}`。这与 ADR-139 的 lint（字面形状等于 `02`）冲突。
3. （已由 `10` §10.1.2、§10.7.1 的唯一定义关闭。）
4. **`settle` 目标下 `keep` 的标记**：`verifyOrigin = human_change` 在 pin 生成之前就写入。`02`/`06` 应写明这一写入时机，并写明 settle 重跑时不被 `agent_submit` 覆盖。
