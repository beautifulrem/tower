# 第 20 轮评审回应：`05`、`06`

以 ADR-146 为准（主干 `03` 已改）。每条一行：条目 → 修订位置。

- R20-D4-01（开 Run 的转移都经准入）→ `06` §6.2.4 写明本节是一切开 Run 转移的唯一闸口（自动返工、`request_changes`、`retry_after_human_change`、交还 `continue_agent`、`resume`、继续目标 `run`），无槽位或依赖未满足 → `ready{waitReason}`，`pending_openings` 保留；`ready` 中允许 `goal.pause`（→ `paused(human)`，继续目标 `run`）、`goal.take_over`（源状态加入 `ready`）、`goal.abandon`；§6.4.3 统一写法改为引用准入。
- R20-D4-02（`boundSeq`）→ `06` `bindings.bound_seq INTEGER NOT NULL`（固定不随 rebase 移动）；统一写法的实现注记：窗口起点不早于 `bound_seq`，多仓库按仓库分别计算。
- R20-D6-01（`runs.phase` 复位与 Host 不存在时 I4 不成立）→ `06` `runs.phase` 注释与 §6.1.10：宽限失败或 `claimed`/`verifying` 中撤回时同一事务写回 `running`；§6.1.6 “settle 中崩溃”行补 I4 不成立分支（settle 判定表：`idle_without_submit` 或开 Run 以 nudge），删去“有效提交保留”的默认。`05` §5.5 宽限失败、持续监视与 Host 不存在的 settle 三处同步。
- R20-D7-01（M2 `!cmd` 并发）→ `05` §5.3.5 “用户 bash”段增加并发说明（v1.2.0 核实：`executeBash` 无流式守卫 `agent-session.ts:3866-3894`，`recordBashResult` 在流式中推迟写入 `3904-3924`；RPC `bash` 直接调用 `session.executeBash`，`rpc-mode.ts:561-582`）；`06` §6.1.10：重叠窗口写入记 `mixedPaths`。
- R20-D10-01（macOS 内存采样）→ `06` §6.1.10：每 5 s 以 `proc_listchildpids` 遍历已知直接进程的后代树；令牌全扫描在 Run 活跃且设有上限时最多每 60 s 一次；“不做持续扫描”的措辞改为“全进程扫描最多每 60 s 一次，且只在 Run 活跃时”。
- R20-D15-01 → 第 1 项：`06` §6.4.1 `ProtoError.code` 加 `E_BUSY` 并写明语义；第 2 项：见 R20-D4-02；第 4 项：见 R20-D7-01。

## 人周

| WBS 行 | 本轮增量 | 内容 |
|---|---|---|
| W3 Supervisor 核心 | +0.15 | 准入作为唯一闸口、`ready` 中的三条命令、`runs.phase` 复位、Host 不存在时 I4 不成立分支、`bound_seq` 与按仓库的窗口、`E_BUSY` |
| W4 进程生命周期 | +0.1 | 后代树遍历与 60 s 令牌全扫描 |
| W6 Pi 适配器与 tower-goal | +0.05 | `!cmd` 重叠窗口记 `mixedPaths`（M2） |
| **合计** | **+0.3** | |

## 需要主干处理

- `16` L264：`ProtoError.code` 加 `E_BUSY`；`02`/`16` 的 `Binding.boundSeq` 已有 DDL 列 `bindings.bound_seq`。
