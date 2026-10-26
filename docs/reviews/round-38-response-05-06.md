# 第 38 轮评审回应：`05`、`06`

以 ADR-164 为准（带机密的验证标准整体推迟到 M2）。每条一行：条目 → 修订位置。

- 带机密标准移到 M2 → `06` §6.2 VerifierScheduler 行：机密段改写为 M1 规则（标准不能声明机密，合同编辑器一键改为 human 标准；M1 中不出现 `not_run`）加一句“移到 M2 的机制”清单（机密阶段、互斥与 `secretMutex.enabled`、整机冻结、`secret_wait` 与 `verify.secret_wait.*`、`accept_secret_exposure`、`not_run`/`secretPhaseOnly`、`secretsVia` 与投递文件、验证器沙箱逐路径放行、`secrets.access` 注入）。§6.2.4：`startAgentActivity()` 保留为唯一启动点的架构约定，M1 中没有冻结状态。`verify.secret_wait.*` 三条命令、§6.1.6 冻结恢复行标 M2；`decisions.kind` 中 `accept_secret_exposure` 注明 M2、M1 不写入。
- `secretPhaseOnly` → 从 `sentinel.override` 行、表前统一写法与 `continuation` 列注释中删去（M1 的 `verify` 目标为 `{pin}`）。
- 人输入文本的机密检查（R38-D11-03）→ `06` `ProtoError` 注释写明统一规则与匹配集合（钥匙串值精确匹配 + `11` §11.7 模式）；`confirmSecret?` 加到 `goal.resume`（附言）、`goal.retry_after_human_change`、`contract.edit_draft`、`contract.amend`、`memory.*`（`edit`）、`goal.create`（`intent`），与已有的回答、转向、评论、`request_changes`、交还说明并列。
- C29 → `05`：M1 中没有任何钥匙串值进入 Agent、验证器或检验检出进程的环境；提供商密钥只在 Host 内存，云凭据只交给 Engine Host；简报改为“需要机密的检查是 human 标准”。
- 钥匙串查找拒绝（R38-D11-04）→ `05` §5.3.6：取决于 SP6a A8，若破坏常用工具则取消，只依赖条目 ACL。

## 人周

| 线 | WBS 行 | 本轮增量 | 内容 |
|---|---|---|---|
| Agent | W9 | −0.2 | 机密阶段、互斥、`secret_wait` 与相关用例移到 M2 |
| 系统 | W3 | −0.06 | 整机冻结、冻结恢复、`secretPhaseOnly`、三条命令移到 M2；`confirmSecret` 扩到六个命令 +0.02 |
| 安全 | W10 | −0.03 | 验证器沙箱投递文件放行移到 M2；钥匙串拒绝改为随 A8 结论 |
| **合计（M1）** | | **−0.29** | |

## 需要主干处理

- `16`：废弃表登记 ADR-164 移到 M2 的机制；`02` 命令参数 `confirmSecret` 的完整列表。
