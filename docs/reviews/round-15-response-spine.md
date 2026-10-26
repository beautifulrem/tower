# 第 15 轮回应 — 主干文档（02、03、15）

| 条目 | 处理 | 位置 |
|---|---|---|
| R15-D4-01 | ADR-134：引入持久的继续目标 `Goal.continuation`（首次进入 `paused` 时按来源状态写入，叠加原因不覆盖，只由显式决定改写）与唯一转移函数 `onAllReasonsCleared()`（`pendingHandBack` > 继续目标 > 守卫“树 ≠ pin 时改为 `verify_new`”）；废弃 `resumeTo`、`pendingVerify`、`externalChange.detectedIn` 与独立的 `applyPendingHandBack`；`take_external` 不写 `pendingHandBack`；`discard_human_edits` 并入已有检测、基线保持首次值；`nested_repo_live` 自动解除时改为 `paused(human)` | `02` §2.4（`Continuation`）；`03` §3.2.1 开头、`human`/`external_change`/`satellite_missing` 行、`pendingHandBack` 两段；`15` ADR-134 |
| R15-D4-02 | ADR-134：`revert` 之后只考察 E 中的路径；E 之外按检查点链归因 | `03` §3.2.1 `external_change` 行；`15` ADR-134 |
| R15-D5-01 | ADR-135：宽限以“连续 2 s 非 streaming 且非 compacting”为准；守卫不满足时直接 `idle_without_submit`；Tower 发起的回合以 `sendCustomMessage{triggerTurn:true}`，RPC 经 tower-goal 扩展命令 | `15` ADR-135 |
| R15-D6-01 | ADR-135：macOS 按 bash 工具调用持久化进程组；I2 断言按 ADR-128/134 | `15` ADR-135 |
| R15-D7-01 | ADR-135：`Checkpoint.mixedPaths`；误判 (c) 用例 | `15` ADR-135 |
| R15-D8-01 | ADR-135：`StopCondition.id`（`02`）、三个出口的命令、`04` 卡片 | `02` §2.5；`15` ADR-135 |
| R15-D11-01 | ADR-136：`~/.ssh/**` 整体为 `credential`；默认良性条目 `(credential, write, ~/.ssh/known_hosts)`；`user_config` 包含式读法 | `15` ADR-136 |
| R15-D13-01 | ADR-136：重新 seal 的分支规则；`:(exclude)` 循环重试上限 64 | `15` ADR-136 |
| R15-D14-01 | ADR-059 范围表同步 ④′；其余由 `14` 作者处理；超出余量时顺延 | `15` ADR-059、ADR-136 |
| R15-D15-01 | 主干残留由 lint 与各作者处理 | — |
