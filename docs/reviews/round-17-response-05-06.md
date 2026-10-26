# 第 17 轮评审回应：`05`、`06`

以 ADR-140..143 为准（主干 `02`、`03` 已改）。本轮以删除与合并为主。每条一行：条目 → 修订位置。

- R17-D4-01（载荷被覆盖或丢弃，ADR-140）→ `06` §6.3：`continuation` 注释改为纯目标（含 `claim`，R17-D15-01 第 8 项）；新列 `pending_openings`、`takeover_prior_reasons`。§6.4.3 表前统一写法改为“解除 / 改写目标 / 追加 `pending_openings`”，任何 Run 开始都消费并清空、并先检查预算（硬上限 → `budget_hard_cap`），`pendingHandBack` 不清空它；`goal.resume`、`goal.retry_after_human_change`、`goal.request_changes`、`goal.external_change.keep`/`.revert`、`goal.hand_back` 改为追加而非改写 `run`；`retry_verify`、`revert`、`discard_human_edits` 的 `verify_new` 去掉 `origin`。
- R17-D4-03（边角组合）→ 验证失败去向改为归因规则（统一写法与 §6.2.3 I6 行；`verify_origin` 注释改为只作说明）；`keep` 不再写 `settle{adoptedHuman}`（R17-D15-01 第 4 项）；`discard_human_edits` 只读 `takeover_prior_reasons` 与 `takeover_from`；§6.2.4 准入新增预算项 e。
- R17-D4-02（`rework_cycles_over`，ADR-143）→ `05` §5.6.5 gate 第 4 步与再武装删去它；`06` §6.2.3 I6 行改用 `Contract.maxReworkCycles`。
- R17-D6-01（drain 目的为集合，ADR-141）→ `06` `draining_for` 改为 `{target, reasons[], decisionIds, requestedAt}`；`external_change` 的 `CHECK` 改查 `reasons`；§6.1.4 drain 协议图、§6.1.6 “Run 在 drain 中途”改为唯一规则（`pause`/`take_over`/`rewind`/`dependency`；只有 `app_quit` 时等同正常退出）；`goal.pause`、`goal.take_over`、`run.rewind` 写 `target`。`05` §5.5 settle 表的 draining 行同步。
- R17-D6-02（进程识别，ADR-142）→ `05` §5.3.5“进程组策略”改为“Run 令牌”（v1.2.0 核实：`tools/bash.ts:178-211` 的 `BashSpawnContext.env` 经 `spawnHook` 改写后原样传给 `ops.exec`，`364-369`；`user_bash` 同走 `sandboxedOps`），D38 行补充并更新行号，C28a 增加令牌断言。`06` §6.1.10 删去身份键、逐进程持久化、每次调用的进程组三段，改为令牌的识别、终止、已登记窗口与崩溃恢复；§6.3 删除 `agent_processes`、`bash_process_groups` 两表，`runs` 加 `process_token`；事件 `agent_proc.tracked/gone` 删除；§6.1.6 恢复行与 `process.terminate_again` 改按令牌。
- R17-D5-01（ADR-143）→ `05`：`RunOpening.tower` 改为数组（按 `pendingOpenings` 顺序，除最后一条外 `triggerTurn:false`）；D55 改为**每次注入前** `get_commands`，失败即终止 Run 并提示，C35(e) 同步；nudge 窗口起点持久化为 `appendEntry("tower.run_start")`，重启与分叉后从分支重建；§5.5 settle 行写明 Host 不存在时的 settle。
- R17-D8-01（`idle_without_submit` 选项）→ `05` §5.6.5 nudge 段改为引用 `03` §3.2.1（`resume` / `claim_on_behalf` / `abandon`）。
- R17-D15-01 第 3 项 → `05` §5.5：settle 重入从第 ① 步宽限确认起，pin 与 `claimed` 同一事务；第 6 项 → `06` §6.1.4：`app_quit`/`engine_crash` 启动时自动解除后走统一规则，不再“作为 `resume` Run 入队”。

## 人周（按 WBS 行去重，删除计负）

| WBS 行 | 新增 | 删除 | 净值 | 内容 |
|---|---|---|---|---|
| W3 Supervisor 核心 | +0.4 | −0.2 | +0.2 | `pending_openings`、`takeover_prior_reasons`、归因去向、Run 开始的预算检查、drain 集合与恢复规则；删去 `openings`/`adoptedHuman`/`origin` 分支 |
| W4 进程生命周期 | +0.3 | −0.6 | −0.3 | Run 令牌枚举（`KERN_PROCARGS2`/cgroup）；删去逐进程持久化、每次调用进程组、成员确认与相关事件 |
| W6 Pi 适配器与 tower-goal | +0.3 | −0.05 | +0.25 | 多段开场、每次注入前 `get_commands`、`tower.run_start`、Host 不存在时的 settle、令牌注入；删去 `rework_cycles_over` 求值 |
| W18 性能夹具 | — | −0.05 | −0.05 | 进程追踪事件量测量不再需要 |
| **合计** | | | **+0.1** | |

## 需要主干处理

- `13`：删除进程追踪的写入预算（ADR-142）。
- `16`：登记 `runs.process_token`、`goals.pending_openings`、`goals.takeover_prior_reasons`；删除 `agent_proc.tracked/gone`、`bash_process_groups`、`agent_processes`。
- `10` §10.3.1：已知误判 (b) 改为“主动清空环境的进程”。
