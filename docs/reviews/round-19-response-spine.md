# 第 19 轮回应 — 主干文档（03、15）

| 条目 | 处理 | 位置 |
|---|---|---|
| R19-D4-01 | ADR-145：窗口以事件序号界定；交还的 `human_edit` 检查点在交还决定之前写入；“通过”含验收延续回到 `accepted` | `03` §3.2.1；`15` ADR-145 |
| R19-D4-02 | ADR-145：`paused → ready{waitReason}` 边（`pendingOpenings` 保留）；`budget_hard_cap` 入口补 `verifying` | `03` §3.2 `ready` 行、§3.2.1 开头与 `budget_hard_cap` 行 |
| R19-D6-01 | ADR-145：`runs.phase = 'settling'` 区分 settle 中崩溃；drain 期间请求另一目标 → `E_BUSY`；`run.rewind` 在 `external_change` 未解除时 `E_STATE` | `15` ADR-145 |
| R19-D6-02 | ADR-145：macOS 内存上限采样已知直接进程，超过 80% 时才做一次令牌扫描 | `15` ADR-145 |
| R19-D7-01 | ADR-145：`TOWER_ORIGIN` 只作诊断；人的归因只限 Tower 已知的 `user_bash` 调用窗口；rebase 变化的卡片措辞 | `15` ADR-145 |
| R19-D8-01 | ADR-145：开场在 `run.started` 同一事务消费；撤回已消费者返回 `already_delivered` | `15` ADR-145 |
| R19-D15-01 | ADR-145：cgroup 父/子层级；“知悉”不结束存活期归因；其余由作者处理 | `15` ADR-145 |
