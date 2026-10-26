# 第 40 轮评审回应：`05`、`06`

以 ADR-166 为准。每条一行：条目 → 修订位置。

- R40-D4-01（本地文件实体）→ `06` §6.3 新表 `project_local_files`（`secret_by`、`unmarked{contentHash, decisionId}`，`name` 不可取消的 `CHECK`）；§6.4.3 新命令 `project.local_files.mark_secret`、`project.local_files.unmark_secret`（`unmark_secret_file`，仅本机）；VerifierScheduler 行：每次播种前重新扫描，内容变化且再次匹配时自动恢复并通知。
- R40-D11-01 / R40-D8-01（检验检出的显式选择）→ `06` 新命令 `inspect.open{goalId, withSecrets?}`，`withSecrets:true` 记 `inspect_with_secrets`、仅本机；VerifierScheduler 行写明这是唯一的人发起例外；§6.4.7 禁止远程清单同步。`05` C29 增加 (d)：“Tower 不会自动”的不变式表述；§5.10 本地文件说明同步。
- R40-D7-01（缺失机密文件）→ `06` VerifierScheduler 行：输出中出现未播种机密文件的路径或文件名 → `verify_env_error{stage:"secret_file_unseeded", files}`，不自动返工；试运行文案。
- R40-D11-02（注册表令牌来源）→ `06` 安装器第 1 阶段：每次从 `~/.npmrc` 与项目 `.npmrc` 读认证行写入即时投递文件，Tower 不保存；`dep.add` 代理安装同样走第 1 阶段；§6.6.1 “密钥”行改为钥匙串在 M1 只存两类，`run/` 注释同步。`05` §5.3.6 凭据行与 §5.3.1 脱敏集合同步。
- R40-D11-03（项目变量）→ `06` 新命令 `project.verify_profile.update`：`env.vars` 命中机密检查即拒绝保存（`E_INVALID{reason:"secret_in_project_vars"}`，无 `confirmSecret` 绕过）。`05` §5.3.6 凭据行注明。
- DDL → `decisions.kind` 的 `CHECK` 加入 `inspect_with_secrets`、`unmark_secret_file`。

## 人周

| 线 | WBS 行 | 本轮增量 | 内容 |
|---|---|---|---|
| 系统 | W3 | +0.05 | `project_local_files` 表与两条命令、`inspect.open` 的 `withSecrets`、`verify_profile.update` 的拒绝 |
| Agent | W8 | 0 | 注册表令牌改为每次从 npmrc 读取（替换钥匙串存取，量相当） |
| Agent | W9 | +0.04 | 播种前重新扫描与自动恢复、`secret_file_unseeded` 归类 |
| 安全 | W10 | −0.01 | 钥匙串不再存注册表令牌 |
| **合计** | | **+0.08** | 系统 0.05 |

## 需要主干处理

- `16`：命令 `project.local_files.*`、`inspect.open`、`project.verify_profile.update` 的远程规则；`verify_env_error.stage` 取值加入 `secret_file_unseeded`。
