# 第 14 轮 · 一致性 lint 报告（ADR-039）

日期：2026-10-15 · 范围：`docs/00`–`docs/16`、`README.md` · 依据：`16-registry.md`、`15` ADR-001–133（新增 ADR-128–133；M1 = 34 周，2026-11-09 → 2027-07-02，执行削减 ④′，M1 只保留分支）、`reviews/round-14.md`（R14-D15-01）及 5 份第 14 轮回应。只做机械修正，需要设计裁决的列入 §4。

## 1. 结果

```
$ python3 docs/reviews/lint/xref.py --checks rstuvwxyz ; echo exit=$?
headings=554 adrs=133 section_refs=2830 problems=0
(r) unique-definition contradictions=0
(s) three-way enums: 8/8 consistent
(u) SP6b batch-table disagreements=0
(v) remote-matrix coverage problems=0 (commands in 06 §6.4.3: 79)
(w) Needs-You kind/dedupe/outcome problems=0
(x) default data vs examples: default-benign targets ['~/.ssh/known_hosts']; problems=0
(w′) pauseReason → Needs-You problems=1
NO_KIND	stop_condition	pauseReason has no entry in 16 “pauseReason → Needs-You kind”
(y) cross-column CHECK vs 16 problems=0
(z) push/PR/remote polling presented as M1=0
(t) open markers=0
exit=1
```

**唯一未通过的是 (w′) 的 `stop_condition`**：现有文档没有说明这一暂停原因生成哪一种 Needs-You，属于设计裁决（§4 U1），因此本轮不是完全干净的运行。

| 检查 | 结果 |
|---|---|
| 断链 | 2830 处、554 个标题、ADR-001–133：0 |
| (r) 唯一定义 | 19 个概念，0 处矛盾。含 10/14 作者新增的 4 个：I2 与 `external_change` 的分界、变更类工具调用、`resumeTo` 的来源、宽限失败的去向；M1 日期判据改查 33 周 / 2027-06-25 的残留 |
| (s) 三方枚举 | 8/8 一致（NeedsYouItem.kind 已含 `external_change`） |
| (u)(v)(x)(t) | 0 |
| (w) | 修正前 1 条：`anomaly/post_settle_activity` 被报为“§8.8 无对应行”。实际上 §8.8 有这一行，是 lint 的解析器只认 `sandbox_violation`/`bg_process_survived` 两个名字。已改为通用解析，0 条 |
| **(w′)** 新增 | 17 个 pauseReason 中 16 个已映射（§2.3 的新注册行）；`12` §12.6.5 中带 `◆` 的原因都有 kind；映射到的 kind 在 `08` §8.4/§8.8 都有行。缺 `stop_condition` |
| **(y)** 新增 | `06` 中 8 个表级跨列 `CHECK`，其中 6 个可对应到 `16` 字段行，所用取值都出现在对应行中：`resume_to`、`human_checkout`、`pending_hand_back`、`external_change`、`owner_kind` ×2、`category`。`events.type`/`payload_ref` 与 `contracts.version` 两个属于审计与不变量约束，`16` 没有对应字段行，不在比对范围 |
| **(z)** 新增 | 修正前人工扫描发现 `06`/`10` 中 7 处把推送、PR 或远端轮询写成 M1 或未标 M2（§2.1），修正后 0 |
| 残留扫描 | 未标为历史的“33 周”/2027-06-25：0；`prompt` 提醒回合：0；`external_change` 记 `resumeTo`：0；“宽限确认失败 → running”：0（`03` `running` 行已改为“留在 running 等待下一次 settle，不记异常”）；`destructiveHint` 作为变更判据：0（`11` §11.3.4 只把它列为工具注解之一，变更判据以 `16` §16.1.4 为准） |
| 旧检查 | §16.8 表、实况行、DDL `CHECK` 登记均通过 |

## 2. 修正清单

### 2.1 M1 只保留分支（ADR-133，检查 z）

- **`06` §6.1.6**：
  - 恢复规则末句“这些恢复规则从 M1 起就适用于‘推送并开 PR’路径”→“随‘推送并开 PR’一起在 M2 生效；M1 只有‘仅保留分支’，只观测本地 base”。
  - `awaiting_remote` 行标为 M2，并注明 M1 不会出现这一状态。
- **`06` §6.4.3 `goal.accept`**：`integrate` 取值注明“`local_merge` 与 `push_pr` 为 M2，M1 只接受 `branch_only` 与 `none`”（原文只标了 `local_merge`）。
- **`10` §10.6**：“M1 的‘推送并开 PR / 仅保留分支’”→“M1 的‘仅保留分支’、M2 的‘推送并开 PR’”。
- **`10` §10.11**：“M1 的集成只有‘仅保留分支’与‘推送并开 PR’”→“M1 的集成只有‘仅保留分支’……‘推送并开 PR’同为 M2”。
- **`10` §10.12**：“PR 头被他人推送了新提交”与“撤销 → PR → `gh pr create` revert PR 草案”两处标为 M2。

### 2.2 日期（ADR-133）

- **`14` §14.5.1 E1**：试点 n = 6 的周次“M1 第 30–32 周（自用期）”→“第 31–33 周”。34 周计划为第 30 周末冻结、第 31–33 周自用。
- **`14` §14.5.1 E9**：“M1 第 30 周（用 M1 冻结构建）”→“第 31 周”。

### 2.3 注册表与 `Checkpoint`（任务 4）

- **`Checkpoint` 的定义位置**：`02` 不定义 `Checkpoint`，只有 `10` §10.7.1 定义（含 `excludedPaths`）；`16` 的 `checkpoints.excluded_paths` 行已指向 `10` §10.7.1 与 `06` §6.3。
  - `16` §16.1.6 `Checkpoint.landmarks` 行：说明栏“与 `02`、`06` DDL 一致”→“`Checkpoint` 只在 `10` §10.7.1 定义，`02` 不定义，与 `06` DDL 一致”；所属列由“—”改为“`10` §10.7.1；DDL `06` §6.3”。
  - `10` §10.7.1 中两条注释原写“与 `02`、`06` DDL……一致”，改为“与 `06` DDL、`16` 一致”。
- **`16` §16.1.7 新增行“`pauseReason` → Needs-You kind”**：(w′) 的数据源。映射全部取自已有文档：
  - `budget_*` → `budget`（`06` §6.2.5）；
  - `idle_without_submit` → `stalled`；
  - `verify_failed_limit` · `human_change_verify_failed` → `verify_failed`（`07` `decide` 中的 `verifyFailed`）；
  - `sentinel_high` → `sentinel`；
  - `verify_env_error` → `verify_env`；
  - `s0_grant_pending` → `approval`（`04` §4.8.5 审批卡、`07` `s0GrantApproval`）；
  - `satellite_missing` → `stalled{satellite_missing}`（`08` §8.6.5）；
  - `post_settle_activity` → `anomaly`；
  - `question_timeout` → `question`；
  - `external_change` → `external_change`；
  - `engine_crash` → `stalled{crashed}`（`06` §6.8 F4）；
  - `provider_unavailable` → `stalled{engine_error}`（`08` §8.6.5）；
  - 不生成：`human`、`app_quit`；
  - `stop_condition` 没有依据，未列入（§4 U1）。

### 2.4 lint 工具（`reviews/lint/xref.py`）

- **(w) 解析修正**：`08` §8.4/§8.8 中检测器专属行的检测器名改为通用解析（`` `kind`（`detector` `` 与 `detector = x` 两种写法），不再写死两个名字。
- **新增 (w′)(y)(z)**：判据写在文件头。`--checks w` 同时运行 (w) 与 (w′)。
- **注入验证**：在临时副本中注入了以下两类错误，均被检出：
  - 让 `pending_hand_back` 的 `CHECK` 多允许一个 `claimed` → (y) 报 `claimed ∉ 16 Goal.pendingHandBack`；
  - 在 `04` 中写“M1 的去向：推送并开 PR” → (z) 报出。

## 3. R14-D15-01 清单核验

| # | 内容 | 现状 |
|---|---|---|
| 1 | `03` `claimed` 出口中的“宽限确认失败 → running” | 已关闭（(r) 宽限失败概念 0 矛盾） |
| 2 | I2 “任何未提交改动 → verifying” | 已关闭（(r) I2 概念 0 矛盾） |
| 3 | `resumeTo` 只服务 `satellite_missing` | 已关闭（`16`、`06` DDL、`02` 一致；(y) 通过） |
| 4 | `02` `external_change` 注释 | 已关闭（“任何状态……`10` §10.3.1，ADR-122/128”） |
| 5 | `05` `fingerprint`“用于有效提交判定” | 已关闭（0 处） |
| 6 | “变更类工具调用”四处定义 | 已关闭（唯一定义 `16` §16.1.4，(r) 0） |
| 7 | 宽限失败三种去向 | 已关闭（唯一定义 `05` §5.5） |
| 8 | `03` `external_change` 行出口与接管期间 | 已关闭（ADR-128 接线；`take_over` 在 `external_change` 未解除时返回 `E_STATE`） |
| 9 | `04` “树已改变 → verifying” | 已关闭（`04` §4.6.7 按来源分开） |
| 10 | `14` G35c(h) | 已关闭（回应文件 10-11-13-14） |
| 11 | lint 覆盖 | 本轮关闭：(r) 4 个新概念；(w′) 与 (y) 已写入 `xref.py`；另加 (z) |

### 3.1 连续两轮以上未关闭的条目

无。

## 4. 需要设计裁决的问题（未修改）

| # | 问题 | 位置 | 说明 / 选项 |
|---|---|---|---|
| U1 | **`paused(stop_condition)` 生成哪一种 Needs-You** | 见下 | 没有任何文档写明对应的 kind |

U1 的现有依据：

- `12` §12.6.5 把它显示为 `◆`（需要人决定）；
- `03` §3.2.1 的出口为“`resume`（可附转向）”；
- `07` §7.7 只提到“合同 StopCondition `no_progress_for` 命中 → 直接暂停”；
- 停止条件还包括由门禁检测的“触及 migrations/** 之类”（`05` §5.6.5）。

选项：

- **(a)** 归入 `stalled`，新增子类型 `stop_condition`，沿用 `st:{goal}:{runId}` 的去重与 §8.8 的 stalled 标注；
- **(b)** 新增 kind `stop_condition`，在 `08` §8.4/§8.8 各加一行；
- **(c)** 不生成 Needs-You，只显示卡片状态。若选 (c)，`12` 的 `◆` 需要去掉。

裁决后，在 `16` §16.1.7 的映射行补上这一项，(w′) 即可通过。

## 5. 复现

```
python3 docs/reviews/lint/xref.py --checks rstuvwxyz
```

新增暂停原因时，同时在 `16` §16.1.7 的“`pauseReason` → Needs-You kind”行登记。新增跨列 `CHECK` 时，若它对应 `16` 的某个字段行，就在 `xref.py` 的 `YMAP` 中加一项。

---

## 6. 补记：按 ADR-133 第 14 轮 lint 补记落地 U1 后的复跑

主干对 U1 的裁决是选项 (b)：

- 新增 Needs-You kind `stop_condition`，severity 2，`costOfDelay:"agent_blocked"`；
- 去重键 `stc:{goalId}:{conditionId}`；
- 标注：“继续”与“修订合同后继续” → `actionable`，“这里不该停” → `false_positive`。

### 6.1 修改

- **`02` §2.9 `NeedsYouItem.kind`**：在 `external_change` 之后加 `"stop_condition"`，注释写明严重度、`costOfDelay` 与去重键。
- **`06` §6.3 `needs_you.kind` 的 `CHECK`**：加 `'stop_condition'`，注释同步。
- **`16` §16.1.7**：
  - `NeedsYouItem.kind` 行的计数改为（18），并加 `stop_condition` 条目（严重度、`costOfDelay`、去重键、标注）；
  - “`pauseReason` → Needs-You kind”行加 `stop_condition` → `stop_condition`。
- **`08` §8.4**：新增去重行 `stc:{goalId}:{conditionId}`：同一 Goal 同一停止条件合并为一条，`conditionId` 取合同 `stopConditions` 中的条目 id。
- **`08` §8.8**：新增标注行（“继续”/“修订合同后继续” → `actionable`；“这里不该停” → `false_positive`，供 `09` 合同学习使用）。
- **`07` §7.10.1**：总表只列检测器，不列由暂停原因生成的条目，无需修改。
- **`04`**：grep 没有找到停止条件的 Needs-You 卡片。现有提及分别是 §4.6.7 的“交还即解除”清单、合同编辑器中停止条件的配置与“编译后的围栏”，都与 kind 无关，未改。`12` §12.6.5 的 `◆` 与裁决一致。

### 6.2 复跑结果

```
$ python3 docs/reviews/lint/xref.py --checks rstuvwxyz ; echo exit=$?
headings=554 adrs=133 section_refs=2830 problems=0
(r) unique-definition contradictions=0
(s) three-way enums: 8/8 consistent
(u) SP6b batch-table disagreements=0
(v) remote-matrix coverage problems=0 (commands in 06 §6.4.3: 79)
(w) Needs-You kind/dedupe/outcome problems=1
DUP_PREFIX	st	stop_condition, stalled
(x) default data vs examples: default-benign targets ['~/.ssh/known_hosts']; problems=0
(w′) pauseReason → Needs-You problems=0
(y) cross-column CHECK vs 16 problems=0
(z) push/PR/remote polling presented as M1=0
(t) open markers=0
exit=1
```

(w′) 已通过，U1 已关闭。**但裁决指定的去重键与第 13 轮加入的 (w) 规则冲突**：(w) 要求不同 kind 的去重键前缀互不相同，而 `stalled` 已经使用 `st:{goal}:{runId}`（`08` §8.4）。`stalled` 的 `satellite_missing` 子类型也用 `st:{goal}:satellite`（§8.6.5）。

两个键形状相同（`st:<goal>:<id>`），只要某个 `conditionId` 与某个 `runId` 恰好相同，或有人把 `conditionId` 写成 `satellite`，两种 kind 的条目就会互相合并。

我没有改动主干指定的键，需要再裁决一次：

| # | 选项 | 后果 |
|---|---|---|
| U2-a | 改用独立前缀，例如 `stc:{goalId}:{conditionId}` 或 `cond:{goalId}:{conditionId}`（`sc:` 已被 `sync_conflict` 使用） | 改 `02`/`06`/`08`/`16` 四处与 ADR-133 补记即可，(w) 不必改，运行即通过 |
| U2-b | 保留 `st:`，把去重键的唯一性定义为“前缀 + 第三段的命名空间”，例如要求 `conditionId` 带 `cond-` 前缀，且不得为 `satellite` | 需要在 `02`（`stopConditions` 条目 id 的格式）与 `08` §8.4 写明命名空间规则，并把 (w) 的判据改为比较完整键模板 |

裁决后按所选方案修改并复跑，预计 `exit=0`。

## 7. 主干裁决（DUP_PREFIX）

采用方案 a：`stop_condition` 的去重键改为 `stc:{goalId}:{conditionId}`（02、06、08、15、16 已同步；本报告上文中的旧键文字也被一并替换）。`xref.py --checks rstuvwxyz` exit 0。
