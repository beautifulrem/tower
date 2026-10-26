# 第 14 轮评审回应：07 / 08 / 09

依据 ADR-128 – ADR-132 与 `02`、`03` 的主干修订。安全相关文字只写到设计层面。

| 条目 / 决策 | 处理 | 位置 |
|---|---|---|
| R14-D4-03 / ADR-129 | 宽限失败改为引用 `05` §5.5 的唯一去向（不记异常，等待下一次 settle）；`post_settle_activity` 只用于 `claimed` 之后；删除 Tower 侧提醒回合；`processes_terminated` 的投递方式；settle 序列中检测到外部写入的处理 | `07` §7.4.1 |
| R14-D5-02 / ADR-130 | “变更类工具调用”在 §7.2.1（原 L51）与 I4(a)（原 L342）只引用 `16` 的唯一定义，不再用 `destructiveHint` 或自列工具 | `07` §7.2.1、§7.4.1 |
| R14-D4-04 / R14-D11-01 / ADR-131 | 严重度表新增 `nested_repo_live`（run 类、交还保留、不可覆盖，出口：带必填转向的 resume / take_over / abandon）与 git 拒绝收录的 `nested_repo`（绑定路径 + 名字、不可覆盖、唯一出口删除）；run 类阻断集合与 `openSentinels` 同步 | `07` §7.10.1 |
| ADR-128（Needs-You） | 严重度表新增 `external_change` 行（kind、sev 2、`costOfDelay`、路由；不经 `decide`） | `07` §7.10.1 |
| R14-D4-01 / D4-02 / D7-01 / ADR-128 | §7.10.3：I2 分界（Tower 工作 / 人的显式采纳 / `agent_bg` → verifying；来源不明 → `paused(external_change)`）；`Goal.externalChange` 状态；`keep` → `human_change`（含 `pendingVerify{human_change}`）；`revert` 后剩余差异的分类；`agent_bg` 在 `paused` 中经 `pendingVerify`；放弃人工编辑且树已改变的分支（存活写入 → `agent_bg`，其余 → `external_change`，不验证）；登记已知误判 | `07` §7.10.3 |
| R14-D8-01 / ADR-128 | `08` §8.4：`ec:{goalId}`（并入路径）、`an:{goalId}:post_settle_activity`；`external_change` 只在 `alsoApplies` 时卡片照常出现并标当前原因；卡片措辞与 mixed 路径提示。§8.8：`keep` → actionable、`revert` → false_positive（检测器精度信号）、远端合并关闭 → obsolete；`post_settle_activity` 的标注 | `08` §8.4、§8.8 |
| ADR-131（`user_config`） | `sandbox_violation` 行引用 `16` 的 `user_config` 判定规则，E7 统计其误报 | `07` §7.10.1 |
| R14-D15-01 | 第 6、7 项（变更类工具调用的多处定义、宽限失败的多种去向）在 `07` 中已改为引用唯一定义；其余各项不在 `07`/`08`/`09` | — |

## 工时

本轮 `07`/`08` 的改动都是规格层面的对齐，对应实现的增量估计：

| 线 | 内容 | 人周 |
|---|---|---|
| 系统（Supervisor/验证） | `externalChange` 状态与出口接线、I2 分界、`pendingVerify` 扩展、`discard_human_edits` 分类、`nested_repo_live` 与 git 拒绝收录的处置 | 1.2 |
| 系统（注意力） | 两个新去重键、标注映射、`alsoApplies` 卡片规则 | 0.3 |
| Agent（tower-goal） | 删除提醒回合、`processes_terminated` 投递方式、变更类判定改为引用 `16` | 0.2 |
| 合计 | | **1.7** |

## 需要主干修改的地方

1. **`16` §16.1.6**：登记 `nested_repo_live`（run、sev 3、不可覆盖）与 git 拒绝收录变体；`external_change` 的 Needs-You kind（ADR-128）。
2. **`16` §16.1.7**：确认 `anomaly` kind 已覆盖 `post_settle_activity`。
