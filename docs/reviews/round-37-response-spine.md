# 第 37 轮回应 — 主干文档（02、03、15）

| 条目 | 处理 | 位置 |
|---|---|---|
| R37-D7-01 | ADR-163：`not_run` 不计为失败；原因 `other_criteria_failed` / `blocked_by_sentinel`；`override_sentinel` 后以 `verify{pin, secretPhaseOnly:true}` 只运行机密阶段；验证缓存不缓存 `not_run` | `02` `Continuation`；`03` §3.2.1 开头；`15` ADR-163 |
| R37-D11-01 | ADR-163：所有 Agent 活动的启动经单一闸口 `startAgentActivity()`，冻结在该闸口执行，不再列举 | `15` |
| R37-D6-01 | ADR-163：冻结与独占为整机范围；判定、获取槽位、设冻结在 Supervisor 单写者线程中一次完成；机密阶段严格串行，`run_now` 不与另一机密阶段并行 | `15` |
| R37-D6-02 | ADR-163：收尾顺序含 teardown；冻结时长上限 = `verify.slotPrepareTimeoutMin` + 各超时；重启恢复顺序 | `15` |
| R37-D11-02 | ADR-163：钥匙串查找拒绝写入 `11` §11.6.2，适用于所有沙箱 | `15` |
| R37-D11-03 | ADR-163：所有进入模型上下文的人输入文本都做机密模式检查 | `15` |
| R37-D15-01 | 由作者统一 | — |
