# 第 20 轮回应 — 主干文档（02、03、15）

| 条目 | 处理 | 位置 |
|---|---|---|
| R20-D4-01 | ADR-146：任何要开 Run 的转移都经过准入，无槽位/依赖未满足 → `ready{waitReason}`（`pendingOpenings` 保留）；`ready` 中可 `pause`、`take_over`、`abandon` | `03` §3.2 `ready` 行；`15` ADR-146 |
| R20-D4-02 | ADR-146：`boundSeq` 不随 rebase 移动；多仓库按 binding 分别计算 | `02` §2.4；`15` ADR-146 |
| R20-D6-01 | ADR-146：撤回时 `runs.phase` 复位；重启后 `settle` 无有效提交按 settle 判定表 | `15` ADR-146 |
| R20-D7-01 | ADR-146：`!cmd` 窗口与 Agent 工具调用重叠 → `mixedPaths`；只有 rebase 变化时的标签 | `15` ADR-146 |
| R20-D10-01 | ADR-146：macOS 后代树遍历（5 s）+ 令牌全扫描（≤ 每 60 s，仅 Run 活跃时） | `15` ADR-146 |
| R20-D15-01 | ADR-146：`E_BUSY`、`bindings.bound_seq`；`03` `verifying` 行补 `→ paused(budget_hard_cap)` | `03` §3.2；`15` |
