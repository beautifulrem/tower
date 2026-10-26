# 第 18 轮评审回应：`05`、`06`

以 ADR-144（含补记：`OpeningRef` 带稳定 `id`）为准。每条一行：条目 → 修订位置。

- R18-D5-01 第 1 项（`user_bash` 拿不到令牌）→ `05` §5.3.5 “Run 令牌”改为由 Tower 的 `exec` 实现**自身**注入（`(env ?? bashEnv(getShellEnv()))` + 令牌，不依赖 `spawnHook`、不回落到进程环境）。v1.2.0 核实：`user_bash` 经 `executeBashWithOperations` 调用 `operations.exec` 时不带 `env`（`bash-executor.ts:121`），Pi 自带实现此时回落到 `getShellEnv()`（`tools/bash.ts:115`）。语义：人经 Pi 输入的命令派生的进程同样带令牌、settle 时终止，写入归属登记在 `10`。D38、D50 行补登记；C28a 增加“不改写 env 的 `spawnHook`”一例；C31 增加 RPC `bash` 后台进程含令牌、不含凭据、settle 时被终止。§5.3.5 代码注释同步（R18-D15-01 第 13 项）。
- R18-D5-01 第 2 项（nudge 起点）→ `05` §5.6.5：`tower.run_start` 每个 Tower Run 只写一次（分支上无同一 `runId` 时），重建取本 `runId` 的条目；C37 增加 (b) 同一 Tower Run 内第二个 Pi agent run、(c) 重启、(d) `fork` 后重建。
- R18-D4-01（归因窗口）→ `06` §6.4.3 表前统一写法逐字引用 `03` §3.2.1 的规则（人的改动、窗口起点、去向）；§6.2.3 I6 行改为引用。
- R18-D4-02（硬上限下的验证失败）→ `06` 统一写法、I6 行与 §6.2.4 准入第 f 项：Run 不能开始 → `paused(budget_hard_cap)`、继续目标 `run`、返工证据以 `{id, factId}` 入队；`pending_openings` 注释改为 `OpeningRef[]`。
- R18-D8-01（开场可见、可撤回）→ `06` 新命令 `goal.openings.withdraw{goalId, openingId}`（`HumanDecision{withdraw_opening}`，幂等，允许远程）；`decisions.kind` 的 `CHECK` 加入 `withdraw_opening`；`05` `RunOpening` 注释写明投递消息的 `details.key = OpeningRef.id`。
- R18-D6-01（非 `pause` 目的与并入原因）→ `06` §6.1.4 drain 协议图与 §6.1.6 恢复行：`take_over`/`rewind`/`dependency` 且 `reasons` 非空 → 放弃原目标，`paused(reasons ∪ {human})`，崩溃恢复同一规则；settle 序列中崩溃 → 继续目标 `settle`。
- R18-D6-02 / R18-D11-01（扫描频率、环境读取）→ `06` §6.1.10：只在 settle 终止、重启清理、来源不明写入时扫描；`bg_process_survived` 打开期间每 30 s 重扫、全部退出时以 `obsolete` 自动关闭；环境只在内存中匹配令牌、不记录不传输、只对本用户进程；删除“窗口更小”的断言。
- R18-D14-01 第 1 项（悬空测试编号）→ `05` 新增 C38（多段开场：逐段 `triggerTurn:false`、最后一段 `triggerTurn:true` 或 `prompt(human)`、RPC 逐段 `handled`、失败时未投递条目留在队列）；`14` G35c(p) 所指的“nudge 起点重建”定义为 C37(c)(d)——`05` 不设 C35(g)，请 `14` 改引用。
- R18-D15-01 → 第 6 项：`06` 的 `verifyFrom` 写入点改为引用 `16` §16.1.1 的唯一定义；第 8 项：GitService 行的排除与重试改为引用 `10` §10.1.2；第 10 项：cgroup 粒度改为引用 `10`（每个 Goal 一个）；第 11 项：§6.2.4 准入步骤重新编号为 a–g，预算在 I7 之后；第 5 项（`05` 部分）：静默范围改为“绑定到继续之后开始的那个 Run”；第 13 项见上。

## 人周（按 WBS 行去重）

| WBS 行 | 本轮增量 | 内容 |
|---|---|---|
| W3 Supervisor 核心 | +0.25 | `OpeningRef` 稳定 id 与 `goal.openings.withdraw`、硬上限下的继续目标、归因窗口、非 `pause` 目的的合并规则 |
| W4 进程生命周期 | +0.1 | 按需扫描、`bg_process_survived` 30 s 重扫与自动关闭 |
| W6 Pi 适配器与 tower-goal | +0.2 | `exec` 自身注入令牌（替换 `spawnHook` 注入，净 0）、`tower.run_start` 每 Run 一次 0.05、C28a/C31/C37/C38 0.15 |
| **合计** | **+0.55** | 开场队列的卡片显示与撤回界面属 W11/W13，不计在本表 |

## 需要主干处理

- `10` §10.3.1 归因表：登记人经 Pi 输入的命令（`user_bash`）派生进程的写入归属。
- `14`：G35c(p) 的引用改为 `05` C37(c)(d)；G33d 的 C38 引用现已存在。
- `13`：单次令牌扫描的预算。
