# 第 10 轮评审回应：`05`、`06`

以 ADR-109、ADR-110 为准。每条一行：条目 → 修订位置。

- R10-D13-01（权威检查的时机与排除）→ `05` §5.5 “pin 安全检查”行、`06` §6.2 GitService 行：改为 `pinSafetyCheck(baseTree, pinTree)`（影子中 `diff-tree`/`ls-tree`，不物化、不占槽位），不排除、只阻断；调用点为 `verify()` 第一步（一切提前返回之前）、`goal.accept`、seal 前；`06` `goal.accept` 行与 §6.1.6 seal 恢复行补上复核；覆盖语义 = pin 原样进入 seal 并写 `Tower-Override` trailer。删除物化 pin 检查与排除。
- R10-D7-02（标记条目类型）→ 同上两处：只看普通文件或符号链接；名为 `head` 的目录不触发；`HEAD` 只改内容也触发。
- R10-D7-01（`sandbox_violation`）→ `06` `goal.hand_back`、`goal.request_changes`、`goal.resume` 提示、`sentinel.override` 行：按 ADR-110，run 类阻断只剩 `input_mutated_after_gate`，它是 sentinel，经 `sentinel.override` 处置；`sandbox_violation` 为提示性。
- R10-D6-01（`external_change` 归因）→ `06` §6.2.3 I2 行：工具调用执行中或 Agent 进程树（含后台进程）仍有存活 → 归为 Agent；否则去抖 + stat 确认后才判外部；登记双向已知误差。
- R10-D4-01(a) → `06` `goal.resume` 行已是 ADR-108 的单一触发；`03` L85、L57/L74 需同步（主干）。(b) 不涉及 `05`/`06` 正文。
- R10-D15-01 第 1、8 项中涉及 `05` L572 的部分 → 已随 ADR-109 重写，已知差异改由“标记条目规则不依赖 git 判定”覆盖。

## 需要主干处理

- `03` L85 改为“全部保留原因解除才执行”；`sentinel_high` 行区分 run 类出口。
- `13` §13.11.2、`07` §7.3.2/§7.4.1、`10` L76：统一为 `pinSafetyCheck` 三处调用点。
- `14`：补 `external_change` 归因的两个用例（后台 watcher 不暂停；空闲时外部保存会暂停）。
