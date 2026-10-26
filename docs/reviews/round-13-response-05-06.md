# 第 13 轮评审回应：`05`、`06`

以 ADR-121..127 为准（主干 `02`、`03` 已改）。每条一行：条目 → 修订位置。

- R13-D4-01（I4 与后台写入）→ `05` §5.6.2c 改为按工具事件判定（submit 之后无变更类工具调用；仅后台进程的变化进入 `agent_bg_done`，pin = 该检查点的树；fingerprint 只作信息）；§5.5 “settle 判定”新增“settle 之后才发现 submit 无效”行（配额未用完 → `prompt` 开提醒回合；用完 → `idle_without_submit`）；`06` §6.2.3 I4 行与 Projector 断言改为工具事件 + `agent_bg_done` 树；`runs.submit_fingerprint` 注释改为信息性。
- R13-D6-01（顺序、告知、身份）→ `05` §5.5 `agent_settled` 行与 `06` §6.1.10：宽限 2 s → 终止 → 等待 → `agent_bg_done` → I4 → `claimed` → pin；撤回与自动恢复时注入 `tower.processes_terminated`（`05` 注入上限 ≤ 120）；身份键 `(bootSession, pid, startTime)`，开机会话变化 → `gone{how:"reboot"}` 不发信号；§6.1.6 恢复行同步。
- R13-D10-01（写放大）→ `06` §6.1.10 持久化条目与 `agent_processes` DDL：只持久化存活 ≥ 5 s 的进程，主键含 `boot_session`，`gone` 行在 Run 结束时删除，事件上限引用 `13`。
- R13-D4-02 / R13-D4-03 / R13-D7-01（外部写入，ADR-122）→ `06` §6.4.3：删除 `goal.review.adopt_external`/`revert_external` 与 `goal.accept` 的对应拒绝；`goal.external_change.keep`（任何状态；`author:"human"`、`external_change_kept`，树不变也记；检测于 `running` 按 resume 规则，其他状态按 I2 进 `verifying`）与 `.revert`（`restorePaths` 到归因基线，只引用 `10` §10.3.1；回到 `resumeTo`，树等于基线不触发 I2）重写；`goal.hand_back` 第 6 步只引用 `10` §10.8.4，写明任何选项都不把外部写入记为人的改动；§6.2.3 I2 行写明 `verifying` 中检测即取消验证、`bg_process_survived` 期间写入记为 `agent` 并以 `verifyOrigin:"agent_bg"` 重新验证；DDL `verify_origin` 加 `agent_bg`，`decisions.kind` 删去两个 hunk 决定。
- R13-D15-01 第 2 项（`06` L254 “保留后 `resume`”）→ 已改为 keep/revert 自动按恢复规则继续。
- R13-D11-03（ADR-125）→ `06` `project_benign_targets` 改为 `(category, op, target)` 并加 `CHECK`（凭据读取不可标良性）；`signal.mark_benign` 参数与语义同步、仅本机；Sentinels 行去重键 `sv:{goalId}:{category}:{op}:{target}`；§6.4.3 各新命令写明远程规则（`keep` 手机端禁止；`revert`、`signal.acknowledge`、`process.terminate_again` 允许远程）；§6.4.7 禁止远程清单加入 `signal.mark_benign`。
- R13-D8-01（ADR-126）→ `06` `process.terminate_again` 行：kind `anomaly`、去重键 `a:{goalId}:bg_process_survived`、标注映射；DDL `needs_you.kind` 加 `anomaly`；`signal.acknowledge` 兼作“知悉”。
- R13-D9-01 → `05` §5.5 与 `06` §6.1.10 的等待期显示只引用 `12` §12.6.4。
- R13-D13-01（ADR-127）→ `05` §5.8 新增“回退到非回合检查点（M2）”行；`06` `run.rewind` 行同步（navigate 到之前最近的回合 entry + 恢复代码 + steer）。
- 连带（ADR-123/124）→ `06` GitRunner 加 `core.protectHFS`/`core.protectNTFS`；`05` §5.5 与 `06` GitService 行加符号链接的 base 豁免与覆盖后写出白名单。

## 需要主干处理

- `02` §2.9、`16` §16.1.7：`NeedsYouItem.kind` 加 `anomaly`（`06` DDL 已加）。
- `08` §8.4：`a:{goalId}:bg_process_survived` 与 `approval` 的 `a:{goal}:…` 前缀相同，需改前缀（例如 `an:`）。
- `16` §16.5：登记 `goal.external_change.*`、`signal.*`、`process.terminate_again` 的远程规则；删除 `goal.review.*`。
- `13`：登记 `agent_proc.*` 事件上限（每个运行中 Goal ≤ 30/分钟）。
