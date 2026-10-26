# 第 15 轮评审回应：07 / 08 / 09

本轮依据 ADR-134 – ADR-136，以及 `02`、`03` §3.2.1 的主干修订（`Continuation`、`onAllReasonsCleared()`）。安全相关文字只写到设计层面。

| 条目 / 决策 | 处理 | 位置 |
|---|---|---|
| R15-D4-01 / ADR-134 | 删除 `pendingVerify`、`detectedIn`、`samePin` 式的 resume 描述，改用继续目标与 `onAllReasonsCleared()`。`decide()` 不再返回 resume 目标。s0 行改为“授权只解除本原因”。`keep` 把 `verify`/`review` 改写为 `verify_new{human_change}`，`revert` 不改写。`discard_human_edits` 时继续目标不变，路径并入 `externalChange`。新增“暂停解除后的验证”表：`verify`、`review`、守卫 → `verify_new`；`verify_new{human_change}` 失败不自动返工，`verify_new{agent_bg}` 失败走 Agent 路径。`run`/`settle` 不经验证。说明 `nested_repo_live` 例外 | `07` §7.10.3、§7.4.1（s0 注释） |
| R15-D4-02 / ADR-134 | `revert` 只考察 E 中的路径（E′ ⊆ E）；E 之外的路径按检查点链归因（drain 中的 Agent 写入、settle 序列中的进程刷写都记为 agent）。注明 G36b(h) | `07` §7.10.3、§7.4.1 |
| ADR-134（settle） | settle 序列中检测到外部写入时，继续目标为 `settle` | `07` §7.4.1 |
| ADR-134（costOfDelay） | `external_change` 的 `costOfDelay` 改为按继续目标 `run`/`settle` 判定 | `07` §7.10.1；`08` §8.4 |
| R15-D5-01 / ADR-135 | 宽限条件改为连续 2 s `isStreaming=false` 且 `isCompacting=false`，压缩后重新计时。nudge 守卫不成立时直接 `paused(idle_without_submit)`。Tower 发起的回合以 `tower.*`（`triggerTurn:true`）开始，不以 user 角色出现；返工消息模板同步这一点 | `07` §7.4.1、§7.10.3；`08` §8.6.4 |
| R15-D8-01 / ADR-135 | 去重键 `stc` 改用 `StopCondition.id`（修订时保留原 id）。三个选项各自对应命令。“这里不该停”标为 `false_positive`，由 `09` 消费。新增 L9（停止条件误报 → 候选收窄，只提示不自动修改；M1 只记录） | `08` §8.4、§8.8；`09` §9.6.2 |
| R15-D11-01 / ADR-136 | `~/.ssh/**` 整体属于 `credential`。默认良性条目为 `(credential, write, ~/.ssh/known_hosts)`。`user_config` 按包含式读法。只禁止凭据读取进入良性清单 | `07` §7.10.1 |
| R15-D13-01 / ADR-136 | `worktreeTree` 改为循环 `:(exclude)` 重试；超过 64 条或 64 次 → `verify_env_error{stage:"integrity"}`。被拒路径单独返回，记入 `excludedPaths` | `07` §7.3.2、§7.10.1 |
| R15-D15-01 第 3 项 | `08` L487 改为“观测到合入（M1 只观测本地 base，`local_merged`）” | `08` §8.8 |
| R15-D15-01 第 5 项 | `07` 中的返工注入方式与 `05` 一致（`tower.rework`，`triggerTurn:true`） | `07` §7.10.3 |
| R15-D15-01 其余项 | 不在 `07`/`08`/`09` | — |

## 工时

| 线 | 内容 | 人周 |
|---|---|---|
| 系统（Supervisor/验证） | 把 `decide` 与外部写入出口接到继续目标；守卫与 `verify_new` 路由；`revert` 只考察 E；git 拒绝收录的循环排除 | 0.8 |
| 系统（注意力/学习） | `stc` 键、选项到命令的映射、标注；L9 信号记录 | 0.2 |
| Agent（tower-goal） | 宽限计时改为按 streaming/compacting 计；nudge 守卫不成立时的分支 | 0.2 |
| 合计 | | **1.2** |

## 需要主干修改的地方

1. **`16`**：仍保留已废弃的字段，`02`、`06` 与 `07` 因此不一致。
   - L27：`Goal.resumeTo`。
   - L28：`externalChange.detectedIn`。
   - L31：`Goal.pendingVerify`。
   - L264：事件 `detected{…detectedIn}`。
   - L299：废弃表中写成“改用 `detectedIn`”。
   - 建议改为 `Goal.continuation`，并增加事件 `goal.continuation.set`。
2. **`02`**：`Continuation.verify.verifyFrom` 的取值是 `claimed | verifying`（进入暂停时所在的状态）。它与 `06` `goals.verify_from` 同名，但 `goals.verify_from` 的取值是 `claimed | in_review | accepted`（验证的源状态，验收延续依赖它）。建议给前者改名（如 `enteredFrom`），或在 `02` 中写明两者的区别，并给 `Goal` 补上 `verifyFrom` 字段。
3. **`03` §3.2.1**：守卫改写出 `verify_new` 时，`returnTo` 的取值规则只写在 `07` 中（`review.state`；目标为 `verify` 时为空）。建议在 `03` 中写明。
