# 第 24 轮评审回应：`05`、`06`

以 ADR-150 为准（主干 `02` `preparingSince`、`03` 已改）。每条一行：条目 → 修订位置。

- R24-D13-01 / R24-D6-01（仓库准备与 LFS）→ `06` §6.2.4 准备阶段改为三段：① 仓库准备（镜像首次建立、项目锁、fetch、LFS 补齐）以 `prepare.repoTimeoutMin` 为限、不计入 120 s，失败 → `prepare_failed`（“LFS 对象缺失：<数量>”）；② 依赖物化不阻止 Run；③ 120 s 只计卫星检出、握手、开场；重试从已完成的步骤继续（各步骤幂等）。准入流水线行、F4b 同步。§6.2 GitService 行登记 LFS 补齐：先从用户主检出的 LFS 库 CoW 复制，仍缺的由 GitRunner 在沙箱外以用户的 credential helper 获取，网络只对这一条命令开放，凭据不进入卫星或 Agent 环境。`05` §5.3.1 同步。
- R24-D6-02（恢复判定）→ `06` §6.3 新列 `goals.preparing_since`（准入写入，`run.started`/中止/失败清除）；§6.1.6 “准备阶段中崩溃”行改为只对 `state = 'ready'` 且 `preparing_since` 非空且无任何暂停原因的 Goal 生效。
- R24-D4-01（`queuedRun` 优先规则）→ `06` §6.2.4：保留值优先于写入表；交还 `continue_agent`、`request_changes`、`retry_after_human_change` 覆盖保留值；自动路径不覆盖。
- R24-D11-01（安装器日志尾部的脱敏）→ `06` §6.2.4 与 `05` §5.3.1：注入开场前经 `11` §11.7 的同一套脱敏。
- R24-D15-01 → `06` `goal.hand_back` 行“交还即解除”清单加入 `prepare_failed`。

- ADR-150 补记 → `06` §6.2.4 与 `goal.pause` 行：仓库准备期间 `pause` 中止该步骤（→ `paused(human)`，继续目标 `run`，`queued_run` 保留），`take_over` 返回 `E_BUSY`，`abandon` 允许；events 表后的类型注释加入 `prepare.progress{step: mirror|lock|fetch|lfs|deps, done, total, bytes?}`。

## 人周（按线）

| 线 | WBS 行 | 本轮增量 | 内容 |
|---|---|---|---|
| 系统 | W7-core | +0.3 | LFS 补齐（CoW 复制 + 缺失获取）、仓库准备计时、各准备步骤幂等与断点续做 |
| 系统 | W3 | +0.1 | `preparing_since` 与恢复判定、`queued_run` 优先规则、`prepare_failed` 交还即解除 |
| 安全 | W10 | +0.15 | 沙箱外以用户 credential helper 获取 LFS 对象、单命令网络开放、凭据不进入卫星与 Agent 环境的验证 |
| Agent | W6 | +0.05 | 安装器日志尾部进入开场前的脱敏 |
| **合计** | | **+0.6** | 系统 0.4、安全 0.15、Agent 0.05 |

## 需要主干处理

- `11` §11.7：注入路径清单加入“安装器日志尾部”；LFS 获取的凭据与网络例外登记。
- `16` §16.2.2：`prepare.repoTimeoutMin`（默认 15 分钟）。
