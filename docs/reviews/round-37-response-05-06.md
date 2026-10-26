# 第 37 轮评审回应：`05`、`06`

以 ADR-163 为准。每条一行：条目 → 修订位置。

- R37-D11-01（冻结的单一闸口）→ `06` §6.2.4：`startAgentActivity(kind, goalId?)` 是启动任何 Agent 活动的唯一函数（Run 准入、Scratch、安装器与预热、检验/人工编辑检出的依赖准备与生命周期脚本、检验服务、其他验证槽位的准备与运行），冻结期间排队；VerifierScheduler 行改为经此闸口。
- R37-D6-01（全局且原子、严格串行）→ `06` §6.2.4 与 VerifierScheduler 行：冻结为整机范围；“判定 → 获取槽位 → 设置冻结”与闸口检查都在单写者线程中完成；机密阶段严格串行，`run_now` 只跳过等待非机密活动。
- R37-D6-02（收尾与恢复）→ `06` VerifierScheduler 行：终止进程 → teardown → 释放槽位 → 解除冻结；冻结上限 `verify.slotPrepareTimeoutMin` + 各标准超时；§6.1.6 新增“机密阶段冻结未解除”恢复行（终止并 teardown 后解冻，机密阶段重新排队）。
- R37-D7-01（`not_run`）→ `06` VerifierScheduler 行：`not_run{other_criteria_failed|blocked_by_sentinel}` 不是失败、不缓存；`sentinel.override` 行：`blocked_by_sentinel` 时继续目标改写为 `verify{pin, secretPhaseOnly:true}`；表前统一写法与 `continuation` 列注释同步 `secretPhaseOnly`。
- R37-D11-02（钥匙串查找拒绝）→ `05` §5.3.6：适用于 Agent、验证器、检验检出三类沙箱。
- R37-D11-03（机密输入提示）→ `06` 命令表：`needs_you.answer`（含重新回答）、`run.steer`、`comment.create/edit`、`goal.request_changes`（引用评论）、`goal.hand_back`（`note`/`sealNote`）都加 `confirmSecret?` 并在匹配时返回 `E_CONFIRM`；`ProtoError` 注释同步。
- ADR-163 补记 → `06` §6.2.4 与 VerifierScheduler 行：机密阶段的槽位取自该 Goal 所属项目的验证器池；“整机范围”只指无活动判定与冻结。

## 人周

| 线 | WBS 行 | 本轮增量 | 内容 |
|---|---|---|---|
| 系统 | W3 | +0.08 | `startAgentActivity` 单一闸口（各启动路径改为经它）、整机冻结与单写者原子判定、冻结恢复行、`secretPhaseOnly` 继续目标、五个命令的 `confirmSecret` |
| Agent | W9 | +0.04 | 机密阶段严格串行、收尾顺序、`not_run` 两种原因与不缓存 |
| 安全 | W10 | +0.01 | 钥匙串查找拒绝扩展到验证器与检验检出沙箱 |
| **合计** | | **+0.13** | 系统 0.08 |

## 需要主干处理

- `16`：`Continuation.verify.secretPhaseOnly`、`verify.slotPrepareTimeoutMin`；`02` 命令参数 `confirmSecret`。
