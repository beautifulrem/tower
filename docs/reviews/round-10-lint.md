# 第 10 轮 · 一致性 lint 报告（ADR-039）

日期：2026-10-15 · 范围：`docs/00`–`docs/16`、`README.md` · 依据：`16-registry.md`、`15` ADR-001–110（新增 ADR-109 `pinSafetyCheck`、ADR-110 `sandbox_violation` 提示性；M1 = 32 周，削减顺序第 1、2 项已执行，WBS 98.4 人周）、`reviews/round-10.md` 与第 10 轮回应。原则同前：只做机械修正，设计冲突列入 §4。

## 1. 方法与结果

| 检查 | 结果 |
|---|---|
| 章节引用（`xref.py`） | 2534 处、549 个标题、ADR-001–110：**0 断链** |
| 枚举 / (e) 命令 ↔ kind | `02`/`16` 一致，命令双向 0 缺项；DDL `CHECK` 全部已登记 |
| (a) DDL ↔ 02 | `pendingHandBack.decisionId` 已在 `02`/`06`/`16`/`10` 一致；**`sealNote`（`10` §10.6 第 2 段、`14` G30c）在 `02` `HumanDecision` 与 `06` 命令参数中缺失**（已补） |
| (b)(c) §16.8、I 列、V 列 | 通过 |
| (d)(f) 检测器 id 与分类 | 唯一未登记仍是 `git_control_tampered`（ADR-072 历史正文）；分类 0 错 |
| (g) 垫片 | 一致 |
| (h) `Checkpoint` ↔ DDL | 一致 |
| (j) ADR ↔ `03` ↔ `16` 状态行 | 交还归类在 ADR-103（已含 `post_settle_activity` 交还即解除）、`16`、`10`、`06` 一致——第 9 轮 U1 已落地；`10` §10.8.4 第 4a/8 步仍写阻断 run 类“`input_mutated_after_gate` 与 `sandbox_violation` 两项”（已改为一项） |
| (k) 残留关键词 | 见 §3；修正 12 处 |
| (l) 嵌套仓库时机与处置 | 权威检查已统一为 `pinSafetyCheck`（`verify()` 第一步、验收与 seal 复核、两种检出写出前，`13` §13.11.1 与“永不降级”一致）；早期预警全量时机 `07` §7.3.2 又回到“写回后全量”（已改为引用 `10` §10.3.1） |
| (m) 实况行词表 | 0 处英文模式名示例（`01` 研究引用除外） |
| (n) 检测器 sev / 阻断 / 推导来源 | `16` §16.1.6 的每个 id 在 `07` §7.10.1 有对应行，推导来源 0 处不符；第 9 轮 U2 的 4 个 id 已由作者补行；阻断 run 类只剩 `input_mutated_after_gate`（`07`/`16`/`04`/`10`/`14` G7 一致）；`symlink_escape` severity 3、阻断 Verified 与集成（`07`/`10`/`16` 一致） |
| 数值 / M1 | 32 周 → 2027-06-18，第 28 周末冻结；+1 人 30 周；WBS 98.4；削减顺序第 1、2 项在 `14` 表中标为已执行，`16` 已同步 |
| 本轮要求的废弃项 | `16` §16.1.13 已有四条（作者添加）：nested repo 从 pin 排除；物化 pin 上的检查；阻断的 `sandbox_violation`；仓库形态夹具一律不写入检出。另有我在第 9 轮加的三条“替代”栏已过时（已更新） |

## 2. 改动清单

### 2.1 `pinSafetyCheck` 与检出（ADR-109）

- `06` §6.4.3 `goal.take_over`：“**不物化**早期预警确认的仓库形态目录” → “不写出 `pinSafetyCheck(baseTree, 检查点树)` 命中的路径，base 中未改动的夹具照常写出；依赖 depcache 命中则 CoW，否则由安装器重建”；`human_checkout` 初值补 `syncState:"idle"`。
- `06` §6.4.3 `goal.hand_back`：T1 中“人新建的仓库形态目录……排除并记 `nested_repo`” → “不排除，由随后 pin 的 `pinSafetyCheck` 判定并阻断”。
- `05` §5.8、`07` §7.3.2、`07` §7.4.2：检出中不写出的范围改为“`pinSafetyCheck` 命中路径（以及早期预警确认的、位于被忽略目录中的仓库目录，`10` §10.1.2）”，删去“早期预警确认的 Agent 新造仓库目录”的说法。
- `10` §10.8.3 第 7 步、§10.8.4 `take_over` 引言、交还第 5 步、末尾“仓库形态目录”条：“未复制 / 确认为仓库的目录不复制”（ADR-101 语义）→ “`pinSafetyCheck(baseTree, T0)` 命中路径未写出”。
- `11` T29 缓解与 S0 残余：“嵌套仓库按两步识别并排除……任何确认的仓库目录都不复制” → “`pinSafetyCheck` 不排除只阻断，卫星侧只作提示”。
- `14` §14.2 G3、G10、G27b 的预期：“扫描报 `nested_repo`，该目录不复制 / 从 pin 排除” → “`pinSafetyCheck` 报 `nested_repo`（阻断，pin 原样），该路径不写出”。

### 2.2 `sandbox_violation`（ADR-110）

- `10` §10.8.4 第 4a、8 步：阻断 run 类“两项” → “只有 `input_mutated_after_gate` 一项”，`sandbox_violation` 列入提示性。

### 2.3 seal 与人的说明

- `02` §2.7 `HumanDecision`：补 `sealNote?: string`（仅 `hand_back` / `bring_back_inspection`，与 `note` 分开，`10` §10.6）。
- `06` §6.4.3：`goal.hand_back` 参数补 `sealNote?`；`inspect.bring_back` 参数 `{goalId}` → `{goalId, sealNote?}`。

### 2.4 计划与 ADR 注

- `14` §14.2 SP6b：注明 M1 补跑的执行按削减顺序第 2 项改派安全线；§14.3.4 削减顺序引言中的“系统 23.0、Agent 22.9”标为第 9 轮数值。
- `15` 修订注：ADR-101、ADR-102 ← ADR-109；ADR-103 ← ADR-110；ADR-104 ← ADR-108；ADR-105 ← ADR-108/109（seal 说明与 trailer）。
- `16` §16.1.13：第 9 轮三条废弃行的“替代”栏更新为 ADR-109/110 的现行说法。

## 3. 残留关键词扫描结果（修正后）

| 关键词 | 剩余出现 | 说明 |
|---|---|---|
| nested repo 从 pin 排除 / `:(exclude)` | `14` G9（gitlink 不进入影子索引，仍成立）；`07` §7.3.2 代码只排除名为 `.git` 的条目与 gitlink | 仓库形态内容本身一律不排除 |
| 物化 pin 上的嵌套仓库检查 | 只在 `16` §16.1.13 与 ADR-106 历史正文 | ADR-106 已注 Superseded（部分） |
| 阻断的 `sandbox_violation` | 只在 `16` §16.1.13 与 ADR-107 正文 | ADR-107 已注 Amended by ADR-110 |
| 仓库形态夹具一律不写入 / 未复制 | 0（正文） | 各处为“只不写出 `pinSafetyCheck` 命中路径，未改动的 base 夹具照常写出” |
| `symlink_escape` severity 2 | 0 | — |
| trailer 集合缺 `Tower-Override` | `14` G30（只验证已验证、无覆盖的情形，预期正确）、ADR-105 正文 | `04`/`06`/`10`/`16` 完整 |

## 4. 未解决的冲突

| # | 冲突 | 位置 | 说明 / 建议 |
|---|---|---|---|
| U1 | **人确认保留的外部改动如何归因**：`03` §3.2.1 写“保留时改动归因 `author:"external"`”，`02` §2.8 评审单元的 `author` 含 `"external"` 并称“由检查点链与人编辑事件归因”；但 `Checkpoint.author`（`10` §10.7.1）与 DDL `CHECK` 只有 `agent`/`human`，`10` §10.3.1 的新归因规则（R10-D6-01）也只产出 Agent/Tower/外部候选，不写入检查点。`external` 没有持久化来源 | `02` §2.8、`03` §3.2.1、`10` §10.3.1/§10.7.1、`06` DDL | 需决定：`Checkpoint.author` 加 `external`（并改 DDL），或外部改动在保留时按 `human` 归因并删去 `external` |
| U2 | **`external_change` 的入口状态**：`10` §10.3.1 归因表第 3 行写 `running`/`paused` 中内容确有变化即记 `external_change`；`03` §3.2.1 与 `04` §4.18.3 只写 `running`（暂停 Run）。`paused` 中检测到时是改为 `paused(external_change)`、进入 `alsoApplies`，还是只记 Fact，未定义 | `10` §10.3.1、`03` §3.2.1、`04` §4.18.3 | 由 `03` 定出口与优先级后再同步 `16` §16.1.1 |

第 9 轮 U1（`post_settle_activity` 交还归类）已在 ADR-103 落地；U2（4 个检测器缺 sev/阻断）已由 `07` 补行。

## 5. 复现

```
python3 docs/reviews/lint/xref.py
python3 docs/reviews/lint/xref.py --dump refs.tsv
```

(n) 的判据同第 9 轮；(l) 的判据：`pinSafetyCheck` 的输入、时机、处置只在 `07` §7.3.2 与 `10` §10.1.2 定义，其余文档逐字一致或引用。
