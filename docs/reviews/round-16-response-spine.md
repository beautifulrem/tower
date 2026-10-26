# 第 16 轮回应 — 主干文档（00、02、03、15）

| 条目 | 处理 | 位置 |
|---|---|---|
| R16-D4-01 | ADR-137：`run{openings: DecisionId[]}` 按序追加开场载荷；`request_changes` 在 `sentinel_high` 中只解除并追加；`claim_on_behalf` → 新目标 `claim`（进入 `claimed`，失败按 Agent 路径）；`verifyFrom` 写入点；继续目标不另存 `verifyFrom` | `02` §2.4 `Continuation`、`Goal.verifyFrom`；`03` §3.2.1 开头、`budget_hard_cap`/`idle_without_submit` 行、I4；`15` ADR-137 |
| R16-D4-02 | ADR-137：pin 与进入 `claimed` 同一事务；`settle` = 从宽限确认起的完整序列，`retry_claim` → `settle`，settle 中任何暂停 → `settle`；放弃改动在原有 `human` 时保留 `paused(human)`；`budget.extend` 不解除原因；`nested_repo_live` 消失一律加 `human` | `03` §3.2、§3.2.1；`15` ADR-137 |
| R16-D5-01 | ADR-138：nudge 窗口锚定 Run 起点；交还开场；返工证据单一路径；D55 前提（`get_commands` 唯一性、`disposition` 检查、串行）；唤醒续跑用 inject | `15` ADR-138 |
| R16-D6-01 | ADR-138：`Goal.drainingFor` 持久化，合并规则，CHECK 放宽，崩溃恢复不 autoResume；settle 守卫行限定非 draining 且 completed | `02` §2.4；`03` §3.2.1 开头、`idle_without_submit` 行；`15` ADR-138 |
| R16-D6-02 | ADR-138：进程组身份按成员确认 | `15` ADR-138 |
| R16-D7-01 | ADR-137：`run` 目标下 keep/revert 追加 `tower.external_resolved`；`settle` 目标下 keep → `human_change` | `15` ADR-137 |
| R16-D8-01 | ADR-139：停止条件的求值点、M1 种类、再武装 | `15` ADR-139 |
| R16-D13-01 | ADR-139：超过 64 → `nested_repo`/`nested_repo_live`；ADR-137：较旧 seal 合入只记 Fact | `03` §3.2 `accepted` 行；`15` |
| R16-D14-01 | 由 `14` 作者登记用例；排期按 ADR-136 | — |
| R16-D15-01 | 主干项：#2、#3、#6（`03`）、#8（`03` L60、`00` L91）已改；其余由各作者与 lint | `00`、`03` |
