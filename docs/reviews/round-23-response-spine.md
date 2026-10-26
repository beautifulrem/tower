# 第 23 轮回应 — 主干文档（02、03、15）

| 条目 | 处理 | 位置 |
|---|---|---|
| R23-D6-01 | ADR-149：撤回 ADR-148 补记的“两段准备”；步骤顺序以 `10` §10.3.1 为准；依赖物化不阻止 Run（失败 → Fact `prepare{ok:false}` 照常进入 `running`）；120 s 只计卫星、握手、开场；卫星创建失败统一为 `prepare_failed` | `03` §3.2 `ready` 行；`15` ADR-149 |
| R23-D6-02 | ADR-149：新的暂停原因 `prepare_failed`（不在启动时自动解除、不 autoResume），取代借用 `engine_crash` | `02` `PauseReason`；`03` §3.2.1 新行 |
| R23-D6-03 | ADR-149：准备中途到达外部写入或其他暂停原因 → 中止准备，以这些原因进入 `paused`，继续目标 `run` | `03` §3.2 `ready` 行 |
| R23-D4-01 | ADR-149：`Run.reason` 加 `handback`；`queuedRun` 写入表登记于 `16`；只在 `run.started` 与 `abandon` 时清除 | `02` §2.6；`15` ADR-149 |
