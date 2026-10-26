# 第 18 轮回应 — 主干文档（02、03、15）

| 条目 | 处理 | 位置 |
|---|---|---|
| R18-D4-01 | ADR-144：“人的改动” = `author:"human"` 或 `mixedPaths` 非空的检查点；窗口起点 = 最近一次通过的验证的 pin 与人最近一次明确交给 Agent 的决定中较晚者；交回 Agent 后自动返工恢复 | `03` §3.2.1；`15` ADR-144 |
| R18-D4-02 | ADR-144：硬上限下返工 → `paused(budget_hard_cap)`、目标 `run`；`OpeningRef = {decisionId} \| {factId}` | `02` §2.4；`03` §3.2.1 |
| R18-D5-01 | ADR-144：令牌由 Tower 的 `BashOperations.exec` 自身注入，不依赖 `spawnHook`（`user_bash` 不经 `spawnHook`）；`tower.run_start` 每个 Tower Run 一次 | `15` ADR-144 |
| R18-D6-01 | ADR-144：非 `pause` 目标的 drain 期间有原因并入 → 放弃原目标，进入 `paused(reasons ∪ {human})`；settle 中崩溃 → `settle` | `03` §3.2.1 开头；`15` ADR-144 |
| R18-D6-02 | ADR-144：扫描只在 settle、重启、来源不明写入时进行；`bg_process_survived` 打开期间每 30 s；删除“窗口更小” | `15` ADR-144 |
| R18-D8-01 | ADR-144：开场队列可见、可逐条撤回（`goal.openings.withdraw`、`HumanDecision{withdraw_opening}`） | `02` §2.7；`15` ADR-144 |
| R18-D11-01 | ADR-144：读取环境只在内存中匹配令牌，不记录、不持久化、不传输 | `15` ADR-144 |
| R18-D14-01 / D15-01 | 主干：`03` 补 `takeoverPriorReasons`；其余由各作者处理 | `03` |
