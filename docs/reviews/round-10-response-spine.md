# 第 10 轮回应 · 主干与跨文档决策

跨文档决策：`15` ADR-109、ADR-110（ADR-106 部分 Superseded；ADR-107 Amended）。

| 条目 | 处理 |
|---|---|
| R10-D13-01 权威检查与 pin 生成不一致 | ADR-109：`pinSafetyCheck(baseTree, pinTree)` 只基于两个 tree 哈希，确定、廉价；`verify()` 第一步，先于所有提前返回；验收与 seal 对同一 tree 复核；不排除只阻断，覆盖记入 seal trailer |
| 标记规则的文件/目录区分、只改 `HEAD` 内容、临时目录符号链接 | ADR-109 第 2 点 |
| R10-D7-01 sandbox_violation 阻断 | ADR-110：提示性；阻断类运行期哨兵只剩 `input_mutated_after_gate`（可覆盖） |
| round-9 lint U1（ADR-103 自相矛盾） | ADR-103 两处表述统一：阻断类运行期推导只有 `input_mutated_after_gate`，其余提示性、交还即解除 |

## round-10 lint 未决项裁决

| # | 裁决 |
|---|---|
| U1 | `Checkpoint.author` 增加 `"external"`（`10` 接口、`06` DDL）：人确认保留的外部改动 |
| U2 | `external_change` 在已暂停时检测到 → 记入 `alsoApplies`；`03` §3.2.1 入口列已补 |
| 其他 | ADR-038 记录第 10 轮已执行削减 ① ②；`00` §0.5.1 增加检出“准备中”与本地文件说明 |
