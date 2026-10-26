# 第 21 轮回应 — 主干文档（02、03、15）

| 条目 | 处理 | 位置 |
|---|---|---|
| R21-D4-01 | ADR-147：`ready` 中接管只在卫星已存在时提供；之后放弃改动保持 `paused(human)`；`ready` 中来源不明的写入 → `paused(external_change)`（继续目标 `run`）；准备阶段命令返回 `E_BUSY`；`03` 入口清单与继续目标写入规则补上 `ready` | `03` §3.2 `ready` 行、§3.2.1 开头与 `external_change` 行；`15` ADR-147 |
| R21-D4-02 | ADR-147：`Goal.queuedRun{kind}`；准入按类别判定；`reworkCycles` 在 `decide()` 选择返工时递增 | `02` §2.4；`03` §3.2 `ready` 行；`15` ADR-147 |
| R21-D7-01 | ADR-147：`!cmd` 窗口内有不属于该调用进程树的 Agent 进程存活 → `mixedPaths`；`05` 两个实例 | `15` ADR-147 |
