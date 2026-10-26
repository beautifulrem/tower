# 第 11 轮评审回应：`05`、`06`

以 ADR-111..113 为准。每条一行：条目 → 修订位置。

- R11-D11-01 / R11-D11-02 / R11-D11-03（仓库形态夹具内的变化、标记名匹配）→ `05` §5.5 “pin 安全检查”行、`06` §6.2 GitService 行：规则改为 ADR-111——候选目录取自 base 或 pin tree（NFKC + 大小写折叠后的 `head`/`commondir`/`gitdir`），候选目录内任何增删改都记 `nested_repo{dir}`；未改动的 base 夹具照常写入两种检出，被改动的在覆盖前不写入。
- 符号链接与覆盖绑定（R11-D11-04 等，ADR-112）→ 同两处：`symlink_escape` 改为在 pin tree 内解析整条链（深度 40）；`06` `sentinel.override` 行：覆盖绑定 `(detector, 路径, 对象哈希)`，验收与 seal 时比对，变化即失效；`Tower-Override` trailer 记录路径与哈希。
- R11-D11-05（`sandbox_violation` 信号，ADR-113）→ `06` §6.2 Sentinels 行：受保护目标的拒绝提升为 severity 2，经 AttentionRouter 生成 Needs-You（`kind:"sentinel"`，L2，`costOfDelay:"none"`），评审中置顶并按目标去重；其余仍为 severity 1。
- R11-D4-02（`external_change` 出口）→ `06` §6.4.3 新增 `goal.external_change.keep`（检查点 `author:"external"`）与 `goal.external_change.revert`（安全检查点 + `restoreCheckpoint` 到检测前最近的检查点），HumanDecision `keep_external_change`/`revert_external_change`；处置后按 `goal.resume` 的规则继续；`goal.resume` 对 `external_change` 改为返回 `E_STATE`；写明与 `in_review`/`accepted` 下 `fp_changed_human` 的区别。
- R11-D4-01 → `06` L779、L810 已与 `07` `decide` 一致（单一触发；存在未覆盖的 `input_mutated_after_gate` 时不提供返工）；需同步的是 `03` 与 ADR-104/108 正文。

## 需要主干处理

- `02` §2.7、`16`：加入 HumanDecision `keep_external_change`、`revert_external_change`；`03` L80 的出口改为这两条命令；`04` L1198 文案改为“保留为外部改动”。
- `03` L57/L74；ADR-104/108 正文（R11-D4-01）。
- `10` §10.7.1：登记 `author:"external"` 检查点（`landmark:"external_change"`）。
