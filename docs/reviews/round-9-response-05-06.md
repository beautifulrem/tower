# 第 9 轮评审回应：`05`、`06`

以 ADR-106..108 为准。每条一行：条目 → 修订位置。

- R9-D3-01（“等价”带前提）→ `05` §5.5 嵌套仓库检查行：写明与用户 git 判定一致的前提（同一文件系统与大小写语义、git 版本、判定只依赖树内内容），`commondir`/`gitdir` 指向树外与用户 git 版本更新两种情形登记为已知差异。
- R9-D11-01 / R9-D13-01（识别缺口与时机）→ `05` §5.5 同一行、`06` §6.2 GitService 行：权威检查改为在验证槽位的物化 pin 上执行，覆盖生成 pin、验收、seal 三个闸口（永不降级，ADR-106）；新增 `symlink_escape`；卫星侧扫描降为早期预警（大小写不敏感粗筛，检查点时增量，写回后全量）。`06` §6.2.3 I2 行：卫星监视覆盖全部非终态，`running` 下的事件只服务预警候选集与 `external_change` 线索。
- R9-D13-01(c)（写回与 T1）→ `06` `goal.hand_back` 行：T1 去除 gitlink，人新建的仓库形态目录按新造处置；`inspect.bring_back` 写回后全量预警扫描。两种检出改由影子树物化（`05` §5.8 接管行、`06` `goal.take_over` 行）。
- R9-D13-02（夹具判据）→ `05` §5.5、`06` GitService 行：按 ADR-102 收紧——base 中已是仓库形态且判定条目未变才算夹具。(b) 未改动夹具仍不物化到检出（ADR-106 的现行裁决）。
- R9-D7-01 / R9-D15-01 第 1 项（run 类阻断范围）→ `06` `goal.hand_back` 行：只有 `input_mutated_after_gate`、`sandbox_violation`（ADR-107，以 `07` §7.10.1 为准）；`policy_wall`、`post_settle_activity` 为提示性。`goal.request_changes` 增加守卫（存在 run 类阻断命中 → `E_STATE`，只提供覆盖/放弃）；`goal.resume` 提示同步；`sentinel.override` 写明只适用于 sentinel、不适用于 anomaly。
- R9-D4-01(a)（执行条件统一）→ `06` `goal.resume` 行与原因解除段：唯一触发函数 `applyPendingHandBack`，只在全部保留原因解除时执行；`resume` 只解除当前原因（ADR-108）。
- R9-D4-01(b)（意图文本来源）→ `06` `goal.hand_back` 行、DDL 注释；`05` §5.8：意图取自对应 `human.decision{hand_back}` 的 `note`。
- R9-D4-01(c)（`post_settle_activity`）→ `06` `goal.resume` 行：作为保留原因时，其解除就是人在禁用可疑扩展后 `resume`，随后触发 `applyPendingHandBack`。
- ADR-108（seal trailer）→ `06` §6.1.6 `integrating` 行：`Tower-Verified-At` / `Tower-Not-Machine-Verified`；seal 说明的段落改为引用 `10` §10.6（R9-D15-01 第 4 项的段数之争不在 06 重复）。
- 其他：`goal.take_over` 的合并队列处理对齐 `16` L28（`suspended`，保留位置）。

- 补充（协调者裁决，ADR-106 修订）：物化 pin 中新增/结构变化目录含任何 git 标记条目（大小写不敏感 `HEAD`、`commondir`、`gitdir`）即判为仓库形态，不论 git 判定 → `06` GitService 行、`05` §5.5 嵌套仓库检查行（已知差异只剩用户 git 版本更新一项）。

## 需要主干处理

- `13` §13.11.2：“永不降级”清单加入物化 pin 上的嵌套仓库权威检查。
- `10` §10.6 与 ADR-105：统一 seal 说明的段数（是否包含“人的说明”段）。
