# 第 12 轮评审回应：`05`、`06`

以 ADR-114..118 为准（主干修改见 `round-12-response-spine.md`）。每条一行：条目 → 修订位置。

- R12-D4-02 / R12-D15-01 第 8、12 项（`external_change` 出口）→ `06` §6.4.3：`goal.external_change.keep` 改为 `author:"human"`、`landmark:"external_change_kept"`，且要求无 `human_checkout`；`goal.external_change.revert` 的目标只引用 `10` §10.3.1，不复述；接管期间的外部写入改由 `goal.hand_back` 的 `externalResolution` 一并处置，记入同一条决定（ADR-114）。
- R12-D7-01（评审阶段的外部写入）→ `06` `goal.external_change.revert` 行收尾说明改为 ADR-114；新增 `goal.review.adopt_external`（`adopt_external_hunks`，`author:"human"` 检查点）与 `goal.review.revert_external`（`revert_external_hunks`，还原为 pin 版本）；`goal.accept` 在存在未处置的 `external` hunk 时返回 `E_STATE`。
- R12-D8-02（交还时处置 pin 命中）→ `06` `goal.hand_back` 参数增加 `resolvePinHits?` 与 `externalResolution?`，事件载荷 `handBack{…}` 与 `02` §2.7 一致；`05` §5.8 接管行注明二者不进入 Pi 会话（ADR-118）。
- R12-D6-01（settle 的终止顺序）→ `06` 新增 §6.1.10（顺序、`(pid, 启动时间)` 身份确认、`agent_proc.*` 事件持久化、崩溃恢复）；§6.1.6 新增恢复行；§6.2.3 I4 行改为 ADR-115 的顺序；§6.3 新表 `agent_processes`；`05` §5.5 `agent_settled` 行先终止后台进程再宽限确认。
- R12-D8-01（受保护目标拒绝的出口）→ `06` 新增 `signal.acknowledge`、`signal.mark_benign`（ADR-117）；§6.3 新表 `project_benign_targets`；§6.2 Sentinels 行改为去重键 `sv:{goalId}:{category}:{targetRoot}`、“可能表明”的措辞、良性清单降级；`sentinel.override` 行注明 `sandbox_violation` 的出口。
- R12-D13-01 / ADR-118（非回合检查点）→ `06` §6.3 新增触发器 `checkpoints_landmark_guard`：landmark 取值 = `10` §10.7.1 联合类型 + `agent_bg_done`、`external_change_kept`。
- R12-D11-01 / R12-D11-02（ADR-116）→ `05` §5.5 与 `06` GitService 行：全部符号链接整链解析，经过 tree 中不存在的分量或 `.git` 分量即视为逃逸；根目录同样是候选目录；覆盖后两种检出中的 git 元数据写出 base 版本；依赖目录物化后做名字扫描。
- 其他：`06` `goal.hand_back` 的“交还即解除”清单加入 `post_settle_activity`，与 `16` L25 一致。

## 需要主干处理

- `10` §10.7.1 L502：landmark 联合类型加入 `agent_bg_done`、`external_change_kept`；`16` 登记同一枚举（lint (s) 三方比对：`06` 触发器、`10` 联合类型、`16`）。
- `16`：登记事件 `agent_proc.tracked`/`agent_proc.gone`、anomaly `bg_process_survived`、命令 `signal.*`、`goal.review.*`、`goal.external_change.*`。
- `14`：G35c 增加“SIGTERM 时刷写输出”“Supervisor 崩溃后重启”两例。
