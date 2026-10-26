# 第 35 轮评审回应：`05`、`06`

以 ADR-161 为准。每条一行：条目 → 修订位置。

- R35-D11-02 / R35-D5-01 / R35-D4-01（`secrets.access` 移到 M2）→ `05` §5.3.5 骨架恢复为未包装的 `sandboxedBash`（删去 `toolBash` 与 `withCall`）；§5.6.5 ask 段的 `secrets.access` 流程改为一行 M2 说明（M1 中 Agent 工具调用从不获得密钥库机密；M2 重新设计，注入点同为 Tower 的 `exec`）。C29(c) 改为：机密只进入验证器标准；M1 中任何 Agent 工具进程的环境里都没有密钥库条目；注入点只有验证器的 `exec`。`06` VerifierScheduler 行的 `secrets.access` 段与 `secrets.access.use_now` 命令行标 M2；`verify.secret_wait.run_now` 写明 M1 中它是 `accept_secret_exposure` 的唯一用途；§6.4.7 禁止远程清单中的 `use_now` 标 M2。
- R35-D11-01（“Agent 活动”的完整定义）→ `06` VerifierScheduler 行：加入“其他验证槽位正在运行标准”与“未解决的 `bg_process_survived`”，因此带机密的标准独占验证器；等待期间不占槽位；同一 Goal 内排在不带机密的标准之后。`05` C29(c) 引用同一定义。
- R35-D13-01（`baseTip()` 措辞）→ `06` GitService 行：分叉且未选择时返回 `baseCommit` 本身。

## 人周

| 线 | WBS 行 | 本轮增量 | 内容 |
|---|---|---|---|
| Agent | W6 | −0.08 | 删去 `secrets.access` 的 M1 流程（`approved_waiting`、`use_now`、单次注入与 `toolBash` 包装） |
| Agent | W9 | +0.03 | “Agent 活动”加入其他槽位与存活进程；等待不占槽位；同 Goal 内排序 |
| 系统 | W3 | −0.02 | `secrets.access.use_now` 命令移出 M1 |
| **合计（M1）** | | **−0.07** | |

## 需要主干处理

无（`11` §11.7.0 已是“Agent 活动”的唯一定义）。
