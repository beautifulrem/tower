# 第 35 轮回应 — 主干文档（02、15）

| 条目 | 处理 | 位置 |
|---|---|---|
| R35-D11-01 | ADR-161：“Agent 活动”加入“任何验证槽位正在运行其他标准”与“未解决的 `bg_process_survived`”；带机密的标准独占整个验证器、等待时不占槽位、同一验证中排在最后 | `15` ADR-161 |
| R35-D11-02 / D5-01 / D4-01 | ADR-161：`secrets.access` 整体推迟到 M2——M1 中 Agent 工具调用从不获得密钥库机密，`approved_waiting`、`use_now`、单次调用机密表与 `toolBash` 包装移出 M1 | `02` `HumanDecision.kind` 注释；`15` ADR-161 |
| R35-D13-01 | ADR-161：分叉且未选择时 `baseTip()` 返回 `baseCommit` 本身 | `15` |
| R35-D15-01 | `02` 的 `owner`/`integration` 注释已改（第 4 次提出的残留）；其余由作者统一 | `02` §2.9 |
