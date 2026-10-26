# 第 17 轮回应 — 主干文档（02、03、15）

本轮原则：以删减与合并关闭问题类（ADR-140–143）。

| 条目 | 处理 | 位置 |
|---|---|---|
| R17-D4-01 | ADR-140：`Continuation` 回到纯目标（去掉 `openings`、`adoptedHuman`、`verify_new.origin`）；开场载荷改为独立队列 `Goal.pendingOpenings`，下一次任何 Run 开始时消费，`pendingHandBack` 不清空它；是否自动返工由“自上一个已验证 pin 以来是否有人/mixed 检查点”决定 | `02` §2.4；`03` §3.2.1 开头、`human_change_verify_failed`/`external_change` 行；`15` ADR-140 |
| R17-D4-02 | ADR-143：删除 `rework_cycles_over`；返工上限只由 I6 / `Contract.maxReworkCycles` 定义 | `02` §2.5；`03` I6；`15` ADR-143 |
| R17-D4-03 | ADR-140：任何 Run 开始前检查预算（含自动返工）；`takeoverPriorReasons` 持久化；ADR-143：Host 不存在时的 `settle` | `02`；`03`；`15` |
| R17-D5-01 | ADR-143：每次注入前 `get_commands`；多段开场；nudge 起点持久化为会话条目 | `15` ADR-143 |
| R17-D6-01 | ADR-141：`drainingFor{target, reasons[]}` 集合合并；CHECK；崩溃恢复唯一规则（`take_over`/`rewind` → `paused(human)`，`dependency` → `ready`） | `02`；`15` ADR-141 |
| R17-D6-02 | ADR-142：后台进程以 Run 令牌（环境变量）识别，取代 pid/启动时间/进程组规则，只持久化令牌 | `15` ADR-142 |
| R17-D8-01 | ADR-143：`idle_without_submit` 的选项唯一定义在 `03` | `15` |
| R17-D13-01 | ADR-143：`integrated` 的条件唯一定义在 `10` §10.12 | `15` |
| R17-D14-01 / D15-01 | 由各作者处理；排期按 ADR-136 | — |
