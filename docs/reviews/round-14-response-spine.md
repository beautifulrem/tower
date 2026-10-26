# 第 14 轮回应 — 主干文档（02、03、15）

| 条目 | 处理 | 位置 |
|---|---|---|
| R14-D4-01 | ADR-128：`Goal.externalChange{paths, mixedPaths, baselineCps, detectedIn, detections}` 独立持久化，`resumeTo` 恢复为只服务 `satellite_missing`；keep/revert = 解除本原因 + 通用原因解除规则（含 `applyPendingHandBack`、`pendingVerify{human_change}`）；`external_change` 未解除时禁止接管；`pendingVerify` 跨越 `external_change` | `02` §2.4；`03` §3.2.1 `external_change` 行、`human` 行；`15` ADR-128 |
| R14-D4-02 | ADR-128：I2 按变化来源分两路（Tower 工作 / 显式采纳 / `agent_bg` → `verifying`；来源不明 → `paused(external_change)`），§3.1 图同步；`discard_human_edits` 树已改变的分支按归因表分类，来源不明的不验证 | `03` §3.1、§3.2.1、§3.3 I2；`15` ADR-128 |
| R14-D4-03 | ADR-129：宽限失败唯一定义在 `05` §5.5（不记异常、等待下一次 settle）；`03` `claimed` 出口删去宽限失败；settle 序列中检测到外部写入 → `detectedIn.phase = settling`，keep/revert 后回到 settle 序列 | `03` §3.2、I4；`15` ADR-129 |
| R14-D4-04 | ADR-131：`running → paused(sentinel_high)`（`nested_repo_live`，run 类、不可覆盖，出口 resume+转向 / 接管 / 放弃）；git 拒绝收录 → `:(exclude)` 重试、`excludedPaths`、删除前阻断 | `03` §3.2 `running` 行、§3.2.1 `sentinel_high` 行；`15` ADR-131 |
| R14-D5-01 | ADR-129：删除 Supervisor 侧以 `prompt` 开的提醒回合；Tower 不以 user 角色注入；`tower.processes_terminated` 以 custom message 投递 | `03` I4；`15` ADR-129 |
| R14-D5-02 | ADR-130：“变更类工具调用”唯一定义在 `16`；`03` I4 只引用 | `03` I4；`15` ADR-130 |
| R14-D6-01 | ADR-128：macOS 每 Run 持久化进程组 id；`setsid` 且 < 5 s 的窗口登记 | `15` ADR-128 |
| R14-D7-01 | ADR-128：卡片措辞不断言写入者；存活进程期间的误归因登记为 (c)；`take_external` 不记 `human_edit`、不注入 `tower.handback`、`targetTree = T0` | `15` ADR-128 |
| R14-D8-01 | ADR-128：kind `external_change`、severity 2、`ec:{goalId}`、标注映射；`post_settle_activity` → `anomaly` | `02` `NeedsYouItem.kind`；`15` ADR-128 |
| R14-D11-01 | ADR-131：T29/G26 按平台分列；Linux 强制手段为 M2 决定点；`user_config` 可判定规则 | `15` ADR-131 |
| R14-D13-01 | ADR-128：非终态观测到已推送 seal 被合并 → `integrated`；drain 期间同一路径记 `mixed`；revert 后树 ≠ 基线的去向 | `03` §3.2.1；`15` ADR-128 |
| R14-D14-01 | ADR-132：G26b/G29 移到 B3；超出余量时先执行削减 ④′ | `15` ADR-132 |
| R14-D15-01 | 主干项 1、2、3（`02` 部分）、4、8 已修；其余由各文档作者与 lint 处理 | `02`、`03` |
