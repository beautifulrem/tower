# 第 11 轮回应 · 主干与跨文档决策

跨文档决策：`15` ADR-111 – ADR-113（ADR-109/110 标注修订）。

| 条目 | 处理 |
|---|---|
| R11-D11-01 改动的 base 夹具进入检出 | ADR-111：候选目录（base 或 pin 中直接含经 NFKC+大小写折叠后为 `head`/`commondir`/`gitdir` 的条目）下的任何变化都阻断；被改动的夹具在覆盖前不写入检出 |
| 标记规则缺口（增 `objects/`、删 `commondir`、Unicode 大小写） | ADR-111 |
| 符号链接字面判断可被组合绕过 | ADR-112：tree 内整链解析 |
| 覆盖绑定路径过宽 | ADR-112：绑定对象哈希，变化即失效 |
| sandbox_violation 信号丢失 | ADR-113 |

## round-11 lint 未决项裁决

| # | 裁决 |
|---|---|
| U1 | 保留外部改动 = 人显式采纳：检查点 `author:"human"`，seal 写 `Tower-Human-Edit`，来源由 `HumanDecision{keep_external_change}` 记录；不设 `author:"external"`（`03`、`04`、`06` DDL、`10` §10.7.1 已同步到 `10` §10.3.1、`14`、`16` 的定义）。评审单元 hunk 的 `external` 归因仍用于“尚未处置的外部改动” |
| 其他 | ADR-038 记录第 11 轮后余量 0.12 周与下一步削减（③+④ 以 `14` 为准：服务 + PR） |
