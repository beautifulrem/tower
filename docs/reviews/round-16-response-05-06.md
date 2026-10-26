# 第 16 轮评审回应：`05`、`06`

以 ADR-137..139 为准（主干 `02`、`03` 已改）。每条一行：条目 → 修订位置。

- R16-D4-01 / R16-D7-01（继续目标的载荷与 `claim`，ADR-137）→ `06` §6.4.3 表前统一写法：`run{openings}` 的开场组装顺序、`settle` = 从宽限确认起的完整序列、`claim{decisionId}`、`verifyFrom` 的写入点、`nested_repo_live` 消失一律加入 `human`。逐行：`goal.resume`（附 `note` 或 `verify_failed_limit` 时追加 `openings`）、`goal.retry_after_human_change`、`goal.request_changes`（`paused(sentinel_high)` 中只解除并追加，不直接发 `run.requested`）、`goal.external_change.keep`/`.revert`（`run` 目标追加并附 `tower.external_resolved`；`settle` 目标下 keep 记 `verifyOrigin:"human_change"`）、`goal.claim_on_behalf` → `claim`。
- R16-D4-02 → (1) `06` §6.1.10 与 §6.2.3 I4 行：pin 与 `claimed` 同一事务；(2) `goal.retry_claim` → `settle`（完整序列）；(3) settle 中任何原因的暂停目标都是 `settle`，`goal.pause` 行同步；(4) `goal.discard_human_edits`：接管前已含 `human` 或 `takeover_from = running` 时保持 `paused(human)`；(5) `budget.extend` 只提高额度，§6.2.5 同步；(6) 见上 `nested_repo_live`。
- R16-D13-01 第 2 项（较旧的 seal 合入）→ `06` §6.1.6 `awaiting_remote` 行：只有最近一次验收的 seal 合入才 `integrated`；较旧的只记 `local_merged{seal}`，`accepted` 转 `in_review`。
- R16-D6-01（drain 目的原因，ADR-138）→ `06` §6.3 新列 `draining_for` + `CHECK (draining_for IS NULL OR state='running')`；`external_change` 的 `CHECK` 放宽为含 `draining_for.reason`；§6.1.4 drain 协议图写入与合并；§6.1.6 “Run 在 drain 中途”恢复行（进入 `draining_for.reason`，`app_quit`/`engine_crash` 只进 `also_applies`，不 `autoResume`）；`goal.pause` 以 `drainingFor` 开始 drain。
- R16-D6-02（组长先退出）→ `06` §6.1.10、§6.1.6、`bash_process_groups` DDL：按成员确认身份（`proc_listpgrppids`，启动时间不早于写入时间），无成员时删行。
- R16-D5-01（ADR-138）→ `05` §5.5 settle 表：守卫行限定为“非 draining 且 `outcome = completed`”，新增 draining 与 aborted/error 两行；§5.6.5 nudge 窗口锚定本 Run 起点（`before_agent_start` 记录，含 custom 触发）；§5.8 交还开场（`tower.handback` 不含意图，有人写文字时 `triggerTurn:false` + `prompt`）；`before_agent_start` ② 只在崩溃恢复时补发并按 `messageType:"custom"` + `details.key` 跳过（v1.2.0 `_prepareRun` `agent-session.ts:1885-1935` 核实）；D55 增加前提（`get_commands` 唯一性与来源，`runner.ts:813-845`、`rpc-mode.ts:680-710` 核实；`disposition` 检查；串行发送）；§5.6.1 通道行同步。C35 增加 (e)(f)，新增 C36（SDK 无 user 消息）、C37（nudge 窗口）。`06` §6.1.5 唤醒续跑与 §6.1.3 Host 崩溃恢复改用 `inject`。
- R16-D8-01（停止条件，ADR-139）→ `05` §5.6.5 gate 新增第 4 步：先查 `stopConditionSilences`，再在执行前求值 `path_touched`/`command_matches`，命中即拒绝、以 `drainingFor` drain、进入 `paused(stop_condition)`；再武装规则；`TowerPolicy.stop` 改为按条件编译。`06` §6.3 新列 `stop_condition_silences`（`run` 条目随 Run 结束清除，`until_amend` 条目随 `contract.amend` 清除）；`goal.resume` 与 `contract.amend` 行写入/清除规则。
- R16-D13-01 第 1 项（超过 64）→ `06` GitRunner 行：改为 `nested_repo`（或运行中 `nested_repo_live`），不再 `verify_env_error`。
- R16-D15-01 第 1、4、5、6、9 项 → 已随上述 `goal.pause`、§5.8 交还、`settle`/`retry_claim`、`budget.extend`/§6.2.5、§6.1.5 修正。

## 人周（按 WBS 行去重）

| WBS 行 | 本轮增量 | 内容 |
|---|---|---|
| W3 Supervisor 核心 | +0.5 | `openings` 组装、`claim` 目标、`verifyFrom` 写入点、`draining_for` 与合并、`stop_condition_silences`、较旧 seal 规则 |
| W4 进程生命周期 | +0.15 | drain 中崩溃的恢复、进程组按成员确认 |
| W6 Pi 适配器与 tower-goal | +0.45 | 停止条件在 gate 中求值与再武装、nudge 窗口起点、交还开场、返工单一路径、`get_commands` 前提、C35(e)(f)/C36/C37 |
| W7-core | +0.05 | 超过 64 的处置改为哨兵 |
| **合计** | **1.15** | |

## 需要主干处理

- `16`：登记 `goals.draining_for`、`goals.stop_condition_silences` 字段行与 Fact `local_merged{seal}`；`HumanDecision.kind` 中 `revert` 的旧说明（R16-D15-01 第 7 项）。
- `10` §10.12：较旧 seal 合入的规则。
