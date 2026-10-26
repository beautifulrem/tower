# 第 4 轮 · 一致性 lint 报告（ADR-039）

日期：2026-10-15 · 范围：`docs/00`–`docs/16`、`README.md` · 依据：`16-registry.md`、`15` ADR-001–080（ADR-036/056/063/070 重写；ADR-071–080 新增；`worktree_missing` → `satellite_missing`；用户仓库 base 保活 ref 删除、改用 `mirror.git`；只有 seal 进入用户仓库，pin 从不，地标可选；M1 = 29 个日历周）、`reviews/round-4.md` 与 5 份第 4 轮回应。原则同前：只做机械修正，冲突列入 §4。

## 1. 方法与结果

| 检查 | 做法 | 结果 |
|---|---|---|
| 章节引用解析 | `python3 docs/reviews/lint/xref.py` | 2122 处章节引用、544 个编号标题、ADR-001–080：**0 断链、0 文档号不符** |
| 引用主题匹配 | 与第 3 轮 dump 比对，筛出本轮新增/改动的 224 处，逐条过目 | 1 处过时（`16` §16.8 的 SP6c 时间与用例范围），已改；其余匹配 |
| 枚举 | `16` §16.1 ↔ `02` ↔ `06` DDL `CHECK`（脚本）↔ 用法抽取 + 近似拼写 | 补登记 7 项、DDL 补 1 个 CHECK 值（§2.1–2.2）；无拼写变体 |
| 规则 (a) DDL 列 ↔ `02` 字段 | 第 3 轮脚本 | `needs_you.kind` CHECK 缺 `project_identity`；`02` `Goal.resumeTo` 少 DDL 已有的 `pin`；`Project.branchPrefix`/`keepAuditLandmarks` 无列（已注明存于 `projects.settings`） |
| 规则 (b) 环境变量 ↔ `16` §16.8 | 第 3 轮脚本（84 个变量，排除 git/凭据/测试运行器类） | 未登记的只剩 `COREPACK_HOME`（R4-D7-02 已弃用 Corepack）→ 登记为废弃；`16` §16.8 路径简写中残留“Corepack”已改 |
| 规则 (c) §16.8 V 列 | 逐格检查 V 列 | **通过**：只引用 `$VS`、`$SH`（含 `$SH/tools`）、`$SLOT`、`—`；项目 `.npmrc` 属 pin 内容，已 protected 并由 `lifecycleIndirection`/哨兵覆盖 |
| **新检查 (d)** Fact 名 / 检测器 id ↔ `16` | 抽取 `Fact \`x\``、`x{…}`、`detector:"x"`、`sentinel{…}`/`anomaly{…}`，以及含“哨兵/检测器/Fact”的行内全部反引号 snake 标识符，与 `Fact.kind`（20）和 §16.1.6 比对 | **0 个未登记**（`depcache_tampered`、`verifier_config_tampered`、`fsmonitor_mismatch` 只出现在废弃说明中）；`verify_env_error.stage` 的取值三处不一致，已统一并登记（§2.2） |
| **新检查 (e)** `06` §6.4.3 命令 ↔ `02` `HumanDecision.kind` | 脚本：提取命令表中所有 `human.decision{…}`，与 `02` 的 39 个 kind 双向比对 | 修正前 11 个 kind 在命令表中没有对应的 `human.decision{…}` 事件（命令存在但事件列未写明）；修正后**双向 0 缺项**（§2.3）。另发现记忆“拒绝”没有决定类型（§4 U2） |
| 过时术语 | 先补齐 `16` §16.1.13，再逐项 grep | 修正 10 处残留（§3） |
| 数值 | §16.2 ↔ 所属 §；对照表；M1/M2 日期 | 指纹节奏 3 处不一致（60 s 巡检残留、500 ms vs 1 s 去抖），已改；29 周与日期自洽（2026-11-09 + 29 周 → 2027-05-28；M2 14 周 → 2027-09-03） |
| M1 / M2 标注 | ADR-059（ADR-064 修订）、ADR-074（LFS 只读 M1、写 M2）、ADR-078（人工检验 M1、内嵌预览 M2） | 未发现不一致 |

## 2. 改动清单（文件：之前 → 之后）

### 2.1 `16-registry.md`

- §16.1.1：新增 `Goal.s0Grant`（`none`·`pending`·`granted`·`denied`·`denied_timeout`，ADR-077）与 `Goal.resumeTo`（`{state, pauseReason?, pin?}`，ADR-076）两行。
- §16.1.3：新增 `verify_env_error.stage`（`install`·`prepare`·`service`·`port`·`sandbox`·`resources`·`integrity`）与 `criterion_check.reason`（`introduced_nondeterminism`·`mass_instability`·`links_unchecked`·`links_deferred`）。
- §16.1.5 `HumanDecision.kind`：加 `deny_s0_exec`（ADR-077）、`split_project`（ADR-080）；所属 § 加“命令 `06` §6.4.3”。
- §16.1.12：新增 `Project.branchPrefix` / `Project.keepAuditLandmarks` 行；“分支 / 影子 ref”行缺“所属 §”单元格（表格错列）→ 补 `10` §10.2、§10.6.2；`06` §6.1.9；“用户仓库默认不含任何 `refs/tower/*`” → “默认只含多机租约 `refs/tower/_owner`（`06` §6.1.9），不含 Goal 的 `refs/tower/*`”；地标写作 `refs/tower/<goalId>/cp/<n>`；`WorktreeRecord.state` 的 `recovering` → `rebuilding`（`10` §10.3）。
- §16.1.13 新增废弃项：pin 在验证前 fetch 进用户仓库 / 验证器从用户仓库检出；“无变化快路径 ≤ 30 ms”“决定性指纹 ≤ 2 s”；卫星丢失后“从分支重建”；`COREPACK_HOME` / 经 Corepack 取包管理器。（`worktree_missing`、base 保活 ref、“决定性指纹 = 全新索引”、26 周、`depcache_tampered`、`verifier_config_tampered` 已由主干在本轮登记。）
- §16.2.3 “指纹防抖 / 巡检 500 ms / 60 s” → “edit/write/bash 结束 500 ms；`in_review`/`accepted` 期间文件系统事件触发后 1 s；无定时巡检（ADR-075）”。
- §16.4 “指纹后台巡检 60 s（降级时 300 s）” → “`in_review`/`accepted` 期间的指纹：文件系统事件触发后防抖 1 s，decisive；取代 60 s 定时巡检”。
- §16.8：路径简写“`$SH`（浏览器/引擎/Corepack 等）” → “浏览器/引擎缓存与 Tower 工具缓存 `$SH/tools`”；抬头“SP6c（M1 第 1–3 周）的验收清单 P1–P12” → “SP6c（M1，在 W8 的时间窗内）的验收清单 P1–P20”（`14` §14.2 现为日历第 9–15 周、P1–P20）。

### 2.2 枚举、类型与 DDL

- `06` §6.3 `needs_you.kind` CHECK：加 `'project_identity'`（`02` §2.9、`16` §16.1.7 已是 15 类）。
- `06` §6.3 `projects.settings` 注释：注明含 `branchPrefix`（默认 `"tower"`）、`keepAuditLandmarks`（默认 false）。
- `02` §2.4 `Goal.resumeTo`：`{state, pauseReason?}` → `{state, pauseReason?, pin?}`（`06` DDL `resume_to` 与 `06` §6.1.4 都带 pin）。
- `02` §2.3 `keepAuditLandmarks` 注释：`refs/tower/<goalId>/landmark/*` → `refs/tower/<goalId>/cp/<n>`（只限地标，`10` §10.6.2 为 ref 的所属文档）。
- `07` §7.4.4 `verify_env_error.stage`：`"install"|"prepare"|"service"|"port"|"sandbox"` → 加 `"resources"`（ADR-054，`07` §7.4.10 已用）与 `"integrity"`（R4-D7-06，`07` §7.4.3 已用）；`08` §8.4 `ve:` 键的阶段列表加 `integrity`。

### 2.3 命令表 ↔ HumanDecision（新检查 e）

`06` §6.4.3 事件列补写决定类型：`contract.amend` → `human.decision{amend_contract}`；`goal.pause` → `{pause}`；`needs_you.snooze` → `{snooze}`；`needs_you.dismiss` → `{dismiss}`；`memory.ratify/edit/retire` → `{ratify_memory|edit_memory|retire_memory}`；`goal.resurrect` → `{resurrect}`；`autonomy.grant/revoke` → `{approve_autonomy_change}`；`project.set_trust` → `{trust_project}`；`project.split` → `{split_project}`。“完整性”段删除“需要 `02` 加入该值”，补“`split_project` 由 `project.split` 产生”。

### 2.4 ADR-073/075/076 与“只有 seal 进入用户仓库”的残留

- `05` §5.6.2(c) `submit` 指纹：`{ freshIndex: true }` + 注释“ADR-060 第 4 点：决定性指纹用全新临时索引” → `{ mode: "decisive" }` + “ADR-075：决定性 = 影子索引 + ctime/inode stat 检查（full 只在验收与 seal）”。
- `06` §6.2 GitService 行：“决定性指纹（pin、验收、I2）使用全新的临时索引” → 按 ADR-075 改写；seal 目标 `refs/heads/tower/<goalId>` → `refs/heads/<prefix>/<goalId>-<slug>`。
- `06` §6.6.4“用户仓库中的 `refs/tower/*`”行：“只在需要时临时 fetch、用完即删……`refs/heads/tower/<goalId>`……在 integrated 宽限期结束或放弃时删除” → 以 `10` §10.6.2 为准：seal 分支 `refs/heads/<prefix>/<goalId>-<slug>`（删除时机按 `10` §10.3.2），可选地标 `refs/tower/<goalId>/cp/<n>`（180 天）。
- `10` §10.6.2：补“另有与 Goal 无关的多机租约 `refs/tower/_owner`”（与 `06` §6.1.9、§6.6.4 一致）。
- `07` §7.3.2 与 `10` §10.12：`refs/heads/tower/<goalId>[-<slug>]` → `refs/heads/<prefix>/<goalId>-<slug>`（ADR-060 第 7 点修订、`16` §16.1.12）。
- `10` §10.6：`in_review` 期间文件系统事件“500 ms 去抖” → “1 s 去抖（`07` §7.3.2）”（`07` 是指纹节奏的所属文档）。
- `15` ADR-060 第 4 点、第 6 点：补 ADR-075 / ADR-073 修订注；ADR-008“后果”中“必要时从分支重建”补 ADR-076 修订注；ADR-045 修订注补“第 4 轮起不依赖 Corepack”。

## 3. 过时术语扫描结果（修正后）

| 术语 | 剩余出现 | 说明 |
|---|---|---|
| `worktree_missing` | `15` ADR-076（改名说明） | — |
| base 保活 ref | `10` §10.1、§10.10 的“不再需要”说明；`15` ADR-060 第 6 点（已加修订注） | — |
| pin 进入用户仓库 / 从用户仓库检出 | 0；`07`、`10`、`11` T26 均为“pin 只在影子，槽位从影子检出” | — |
| “决定性指纹 = 全新索引” | `15` ADR-060 第 4 点（已加修订注）；`11` §11.8.1 的 `.pi/.agents` 信任复核用全新索引对两个路径做 diff（不是工作区指纹，保留） | — |
| “≤ 30 ms 快路径”“决定性 ≤ 2 s” | `07` §7.3.2、`13` §13.1 的“不再有/修正”说明 | `13` 中另两处 “≤ 30 ms”“≤ 2 s” 分别是 Trace 分页与冲突雷达，非指纹 |
| 26 周 / 20 周 | `14` §14.3.4 与 `15` ADR-038 的推导；`14` E9“第 26 周”= 29 周计划中自用期第一周 | — |
| `depcache_tampered`、`verifier_config_tampered` | 只在 `16` §16.1.6/§16.1.13 的“取代”说明 | — |
| “从分支重建” | 0（`15` ADR-008 已加修订注） | — |
| Corepack / `COREPACK_HOME` | `07` §7.4.3、`14` P15 的“不依赖 Corepack”说明；`15` ADR-045 原文（已加修订注） | — |
| 60 s 指纹巡检 | `13` §13.11.1、`16` 中的“取代 60 s 巡检”说明 | — |

## 4. 未解决的冲突（未改动设计）

| # | 冲突 | 位置 | 说明 / 建议 |
|---|---|---|---|
| U1 | **应用退出时正在验证的 Goal 的状态**：`03` §3.2.1 写“verifying 不进入 `app_quit`/`engine_crash`；验证被取消，Goal **保持 `verifying`**，下次启动以同一 pin 重跑”；`06` §6.1.4 与 §6.1.6 写“`verifying → paused{app_quit, autoResume, resumeTo:{verifying, pin}}`”。两份第 4 轮回应（主干与 05/06）分别按各自口径落地 | `03` §3.2.1；`06` §6.1.4、§6.1.6 | 重启后的行为相同，差别在退出期间的状态与是否出现在“已暂停”分组、是否计入 `pauseReason` 优先级。需协调者二选一 |
| U2 | **记忆提议被拒绝时没有决定类型**：`06` `memory.reject` 命令存在，`09` §9.3.2 写“拒绝时的原因写入 `reason{code, detail}`”，但 `02` `HumanDecision.kind` 没有 `reject_memory`（`ratify_memory` 带 reason 的写法未定义） | `02` §2.7、`06` §6.4.3、`09` §9.3.2 | 建议新增 `reject_memory`（与 `reject_claim` 对称），或明确 `ratify_memory{reason}` 的拒绝语义；新检查 (e) 只能在此之后完全闭合 |
| U3 | 第 2 轮 U3（`contract.quick_ratify` 命令名由 lint 选定）：本轮 `06` 作者补齐命令时沿用了 `quick_ratify`，可视为已确认；如不同意请在 `06` 改名 | `06` §6.4.3 | 暂按已确认处理 |

第 3 轮的未决项均已落地：U1/U2（pin 只在影子、父提交统一为 `baseCommit`）、U3（Agent 杀进程上限 = `max(m_kill_v, 1.5 × p90_g, 2 GB)`，与验证器上限同口径）、U4（`worktree_missing` 改名为 `satellite_missing`，ADR-076）。

## 5. 复现

```
python3 docs/reviews/lint/xref.py                  # 断链与文档号
python3 docs/reviews/lint/xref.py --dump refs.tsv  # 引用及目标标题
```

检查 (d)(e) 的抽取规则见 §1；(e) 的判据也写在 `06` §6.4.3“完整性”段。
