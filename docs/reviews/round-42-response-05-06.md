# 第 42 轮评审回应：`05`、`06`

以 ADR-168 为准（撤回 `secret_file_unseeded` 自动归类）。每条一行：条目 → 修订位置。

- R42-D7-01（撤回自动归类）→ `06` §6.2 VerifierScheduler 行：删去未播种路径的“拒绝并报告”规则、`secret_file_unseeded` 归类与其三条出口，改为“不做自动归类、一律普通失败”，失败卡片、返工证据与试运行红灯旁附 Claim 语法的提示（唯一定义在 `07` §7.4.1）；`goal.request_changes` 行删去自 `paused(verify_env_error)` 发起的特例。`05` C29 删去 (e)。
- R42-D15-01（本地文件批准字段）→ `06` `project_local_files.approved_decision_id` 改为 `approved` JSON 列（`{decisionId}`，与 `02` 一致）；VerifierScheduler 行：只有已批准的普通本地文件才播种；`project.local_files.approve` 行写 `approved`。
- `inspect.open` 的来源状态 → `06` 命令行：`in_review`、`accepted`、`paused(verify_failed_limit|human_change_verify_failed|sentinel_high)`，检验当前 pin，其他状态 `E_STATE`。

## 人周

| 线 | WBS 行 | 本轮增量 | 内容 |
|---|---|---|---|
| Agent | W9 | −0.06 | 删去拒绝并报告规则与读取记录判定、回退路径；失败提示 +0.01 |
| 系统 | W3 | −0.02 | 删去 `request_changes` 特例与三条出口的接线；`inspect.open` 来源状态守卫 +0.01 |
| 安全 | W10 | −0.01 | 验证器沙箱不再需要拒绝并报告规则 |
| **合计** | | **−0.09** | |

## 需要主干处理

无。
