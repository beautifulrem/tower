# 第 32 轮回应 — 主干文档（02、15）

| 条目 | 处理 | 位置 |
|---|---|---|
| R32-D11-01 | ADR-158：macOS 上按“闸门失败”设计——A12(a) 改为测量；带凭据 URL 默认被拒并提示改用 helper（含 token 判定规则）；模型密钥以 Pi 的 `setRuntimeApiKey` / `InMemoryCredentialStore` 在内存中提供、不进任何环境；验证器机密默认文件注入（`<NAME>_FILE`），显式 `secretsVia:"env"` 时界面标注并登记 T33b；T33 如实评级（macOS S2 中、Linux S2 低、S0 高）；M2 决定点：专用系统用户 | `15` ADR-158 |
| R32-D6-01 | ADR-158：settle 时按进程树与令牌取并集终止；“环境为空”视为无法确认；脱离进程树的平台二进制登记为窗口，其写入按来源不明处理 | `15` |
| R32-D4-01 | ADR-158：`base_unchanged_nonancestor`、`push_failed`、`remote_credential_blocked`；`base_diverged` 加时间字段 | `02` `Fact.kind` |
| R32-D13-01 | ADR-158：分叉时不自动选择，由人 `goal.base.choose`；进入 `in_review` 前的 fetch 不阻塞（≤ 10 s） | `02`；`15` |
| R32-D8-01 | ADR-158：`goal.base.check`、`project.remote.recheck` | `15` |
| R32-D13-02 | ADR-158（M2）：`awaiting_push`，不占用 base 队列 | `15` |
| R32-D14-01 / D15-01 | ADR-158：M0 退出条件按“测量”改写；其余由作者统一 | `15` |
