# 第 22 轮回应 — 主干文档（02、03、07、15）

| 条目 | 处理 | 位置 |
|---|---|---|
| R22-D4-01 | ADR-148：`ready` 中 `queuedRun` 恒非空（合同批准 → `initial` = 第一次启动；依赖回退 → `resume`）；`Run.reason` 加 `handback`；在 `run.started` 同一事务清除；恢复表两行 | `02` §2.4；`03` §3.2 `ready` 行；`15` ADR-148 |
| R22-D6-01 | ADR-148：准备阶段总时限 120 s；失败 → `paused(engine_crash)`（不 autoResume，`stalled{prepare_failed}`）；`abandon` 始终允许并中止准备 | `03` §3.2 `ready` 行；`15` ADR-148 |
| R22-D15-01 | `03` §3.2.1 `human` 行与 `07` 的放弃改动规则改为 `takeoverFrom ∈ {running, ready}` 或 `takeoverPriorReasons` 含 `human` | `03` §3.2.1；`07` §7.10.3 |
