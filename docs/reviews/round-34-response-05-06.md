# 第 34 轮评审回应：`05`、`06`

以 ADR-160 为准（以调度互斥取代 ADR-159 的独占窗口及补记 2、3）。每条一行：条目 → 修订位置。

- 撤回（`05`）→ 删除 gate 第 0 步与 `TowerPolicy.secretWindow`、契约测试 C39、§5.3.5 骨架中的 `withPerCallAbort` 包装（customTools 回到 `sandboxedBash`）与 `/tower-abort` RPC 命令；第 1 步不再提“第 0 步除外”。C29 改为：机密只进入验证槽位，在调度互斥成立时运行、期间准入冻结，结束后槽位进程全部终止；`secrets.access` 只在无其他 Agent 活动或 `accept_secret_exposure` 后注入。
- 调度互斥（`06`）→ §6.2 VerifierScheduler 行重写：“Agent 活动”的定义（`running` 含 settle、准备阶段、Scratch、检验服务）、等待、运行期间冻结准入、不参加机会式验证、只在 `claimed`/`verifying` 运行、结束终止槽位进程；等待超过 10 分钟的 Needs-You（`ve:{goalId}:secret_wait`）与三条命令 `verify.secret_wait.keep`/`run_now`/`as_file`；`secretMutex.enabled`；`secrets.access` 的等待或接受风险。§6.2.4 准入写明冻结。
- 撤回（`06`）→ 删除 `SIGSTOP`/`SIGCONT`、`secret_window.*` 事件、挂起不计时、`goal.tool.abort` 命令行、崩溃恢复中的 `SIGCONT` 段、`verify_env_error{stage:"secret_window"}`；`decisions.kind` 的 `CHECK` 删去 `abort_tool_call`、加入 `accept_secret_exposure`。
- R34-D13-01（`baseTip()` 未选择时）→ `06` GitService 行：分叉且尚未选择时返回当前 `baseCommit` 一侧。
- ADR-160 补记 1、2 → `06` §6.4.3 新增 `secrets.access.use_now{goalId, requestId}`（`accept_secret_exposure`），它与 `verify.secret_wait.run_now` 改为仅本机（§6.4.7 禁止远程清单同步）；VerifierScheduler 行写明 `approved_waiting`。`05` §5.6.5 ask 段新增 `secrets.access` 流程：批准后有其他 Agent 活动 → `approved_waiting`，调用在本 Goal 门禁处作为正常 ask 等待，放行后只注入这一次调用。
- 补充：`05` §5.3.5 骨架加入最小的 `execute` 包装 `toolBash`（只把 `toolCallId` 经 `sandboxedOps.withCall` 传给 `exec`，不做中止），与 §5.6.5 的 `secrets.access` 单次注入一致。

## 人周

| 线 | WBS 行 | 本轮增量 | 内容 |
|---|---|---|---|
| Agent | W6 | −0.13 | 删去 gate 第 0 步、C39、单次调用中止与 `/tower-abort` |
| Agent | W9 | −0.03 | 独占窗口编排（标志、等待、挂起）改为调度互斥（复用准入与验证排程，+0.07；删去窗口 −0.1） |
| 系统 | W4 | −0.05 | 删去 `SIGSTOP`/`SIGCONT` 与崩溃恢复步骤 |
| 系统 | W3 | +0.03 | 准入冻结与三条 `verify.secret_wait.*` 命令 |
| **合计** | | **−0.18** | |

## 需要主干处理

- `11` §11.7.0：调度互斥规则；`16`：废弃表登记 ADR-159 独占窗口相关项，登记 `verify.secret_wait.*` 命令、`accept_secret_exposure`、`secretMutex.enabled`。
