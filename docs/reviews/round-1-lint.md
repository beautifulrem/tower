# 第 1 轮 · 一致性 lint 报告（ADR-039）

日期：2026-10-15 · 范围：`docs/00`–`docs/16`、`README.md` · 产出：新建 `docs/16-registry.md`，并对其余文档做外科式修正。

## 1. 方法

| 检查 | 做法 | 结果 |
|---|---|---|
| 章节引用 | 脚本扫描全部 `NN §x.y` 与本文内 `§x.y` 引用（跳过 `gui.md`、`pi.md`、*TB*、*LS*、`T§` 等外部引用），逐一核对目标文档是否存在对应编号标题 | 共约 1250 处引用；修正前 1 处断链（`07` §7.6.7），另发现 1 处“能解析但指错”（`03` → `06` §6.1.4）；修正后 **0 断链** |
| 过时术语 | 逐项 grep：`reviewCapacityLocPerDay`、`requireAllUnitsViewed`、`cleanEnv`、chord、`~/.tower/worktrees` 作默认、`.tower-wt/`、“≤ 400/600 token”、不分档的“16 ms”、`sessionPath`、`actionable` 布尔、评论 `blocking`、`eta`、`tainted`、“MCP 默认关”、调速器/governor、单一 `N/M`、`G N`、`◌` 用作“要注意” | 见 §3；剩余出现均为历史说明或废弃对照表 |
| 标识符拼写 | 抽取各文档中的 `kind:"…"`、`pauseReason`、`Fact \`…\``、`sentinel{…}`、DDL `CHECK` 集合，与 `02` 及注册表比对 | 见 §2 |
| 数值 | 将 `02`、`07`–`15` 中的默认值汇入 `16` §16.2，对重复出现的数值交叉比对 | 见 §2 |
| “主干修订状态” | grep | 不存在（仅 ADR-039 提到其删除） |

## 2. 改动清单（文件：之前 → 之后）

### 新建

- `16-registry.md`：§16.1 标识符与枚举（含 Mode 优先级、哨兵/检测器 id、26 个动作类与单向门标记、S0–S4、废弃标识符表）；§16.2 默认数值与阈值（值 · 所属 § · 依据 · 回填实验）；§16.3 快捷键注册表；§16.4 刷新节奏；§16.5 远程能力矩阵；§16.6 特性开关；§16.7 章节索引。

### 文档地图与阅读顺序

- `00` §0.7：文档地图新增 `16-registry.md` 一行。
- `README.md`：阅读顺序表新增一行 `docs/16-registry.md`。

### 迁移（表格移入注册表，原处改为引用）

- `04` §4.17.1：完整快捷键表 → 一段规则说明 + 引用 `16` §16.3。
- `13` §13.3.1：统一节奏表 → 引用 `16` §16.4；`13` §13.0、§13.11.1 与 `06` §6.4.2 中指向 `13` §13.3.1 的引用改指 `16` §16.4；`06` §6.5.1 注明数值以 `16` §16.4 为准。

### 快捷键冲突

- `04` §4.10.1 线框：`[⌘⇧R 全部]` → `[⌘⌥R 全部]`（`⌘⇧R` 只保留诊断中的“回退”）。
- `08` §8.5.6：`G N` → `G X`。
- 注册表补登记只出现在线框/流程中的 `⌘O`（托盘弹窗）与 `⌘Z`（撤销条）。`⌘⇧D`（调试面板）与 `⌘⌥D`（密度）已在 `04` 中解决，注册表沿用。

### 标识符

- `02` §2.8 `Comment.delivery.state`：含 `"seen"` → 去掉（`05` §5.7.3 为唯一定义：`seenAtEntry` 是 `delivered` 的属性）；`seenAtEntry` 注释注明“属性，不是状态”。
- `05` §5.7.4 时序图：`msg.end` 后 `state=acknowledged` → `seenAtEntry（属性）`，并注明“Agent 引用 key 后才 acknowledged”（与 §5.7.3 一致）。
- `02` §2.12 `Scratch.sessionPath` → `sessionId`；`06` §6.3 DDL `scratch.session_path` → `session_id`。
- `02` §2.7 Fact `sentinel` 注释：`secret_pattern` → `secret`（与 `07` §7.6.6、`08` §8.3.1 一致），清单改指 `16` §16.1.6。
- `06` §6.3 DDL：`goals.pause_reason` CHECK 补 `verify_env_error`、`s0_grant_pending`、`post_settle_activity`（与 `02` §2.4 一致）；`needs_you.kind` CHECK 补 `verify_env`；`routing` 注释 `NeedsYouRouting` → `RoutingRuntime`（`08` §8.2 的实际名称）。
- `06` §6.2.4：`governor: GovernorState` → `backlog: BacklogState`；“`governor` 投影” → “`backlog` 投影”。
- `07` §7.4.1：`hasGrant(goal, "exec.unsandboxed")` → `hasGrant(goal, ["exec.test","exec.build"])`（ADR-022 的授权类；不存在 `exec.unsandboxed` 动作类）。
- `07` §7.6.1：`edit_out_of_scope` → `edit.out_of_scope`。
- `07` §7.10.3：用作“源状态”的 `goal.verifyOrigin ∈ {claimed, in_review, accepted}` → `goal.verifyFrom`（与 `02` 持久化的 `Goal.verifyOrigin`——触发类型——同名异义）；`VerifyTrigger` ↔ `verifyOrigin` 的对应写入 `16` §16.1.1。
- `10` §10.3.1：Fact `prepare_failed` → `prepare{ok:false}`；`13` §13.8.2/§13.8.3：Fact `host_memory_high` / `resource_exceeded` → `host_resource{kind:…}`（`02` 的 `Fact.kind` 中只有 `prepare`、`host_resource`）。
- `11` §11.1、§11.3.2、§11.4：`sentinel{kind:"policy_block" | "scope_breach" | "script_modified_then_run"}` → `sentinel{detector:…}`（`02` §2.7：检测器在 `data.detector`）；`script_modified_then_run` 登记进注册表。
- `11` §11.4：ask 的 `kind:"gate"` 信封 → `kind:"approval"`（`05` §5.6.4 的 `TowerDialog.kind`）。
- `13` §13.8.3：`maxConcurrentRuns` → `maxConcurrentGoals`。
- `12` §12.6.5：补 `verify_env_error`、`s0_grant_pending` 两个暂停原因的文案行。
- `12` §12.14 术语表抬头：“迁入 `16-registry.md` 后以其为准” → “界面中文文案的唯一来源；标识符以 `16` §16.1 为准”。

### 过时术语

- `00` R1：Claim 列举中的“ETA” → “下一步（ADR-030 已删除 ETA 类说法）”。
- `00` §0.4 Q3、`02` §2.5“Task 从哪里来”、`06` §6.4.2 `board`：单一 `N/M` → 两轨 `已验证 V/M · 观测到 O/M`（ADR-020）。
- `00` R11、`01` §1.3 表与 §1.4 #3：“评审余量 / 评审能力调速（每日可评审行数）” → “评审积压上限（ADR-014，WIP 上限，默认提示模式）”。
- `04` §4.3.3、`06` §6.1.4、§6.4.2、§6.4.3、§6.7：“调速器 / 调速器的 R / 调速器余量” → “评审积压上限 / 积压的 P / 积压余量 H”。
- `04` §4.12、F10，`11` §11.8 第 5 点、T22，`09` 抬头：布尔 `tainted` → `taint.level`（`09` §9.2.1 的三级规则）。
- `02` §2.4、`08` §8.6.1：停滞判据“S1–S6” → “S1–S7”（`07` §7.7.1 有 S7）。
- `13` §13.1 IPC 行、§13.2 通路图、§13.3：不分档的“16 ms” → “刷新周期（60 Hz 16 ms、120 Hz 8 ms）”。
- `13` §13.9.2：“`06` 采用 `wal_autocheckpoint = 1000`” → “`06` 已采用 0 + 30 s 空闲定时器”（与 `06` §6.3 DDL 一致）。
- `08` §8.1、§8.5.5、§8.6.3、§8.6.5、§8.14：“要注意”的 `◌` → `◇`（`12` §12.6.2：`◌` 只表示塑形中，R1-D9-04）；§8.1 L4 “托盘脉冲” → “菜单栏数字（无动画）”；菜单栏字形 → L0 `·` / L1 `◇` / L2+ `◆`、不着色（`12` §12.8.1 唯一规格）。

### 数值

- `02` §2.10：单条记忆“约 300 个 ASCII 字符” → 320（80 token × 4，与 `09` §9.2、§9.13 一致）；`06` §6.3 DDL `memory.text` 字符上限 300 → 320（原值会拒绝合法的 80 token 英文条目）。
- `05` §5.8：返工证据“输出尾部 40 行” → “末尾 30 行，模板见 `07` §7.10.3”（`07` 的返工模板与 §7.14 均为 30 行）。
- `09` §9.12.1：影子检查点 ref“随 Goal 归档后 30 天删除” → “归档 30 天后只留地标，180 天后全删”（`10` §10.3.2、`06` §6.6.4）。
- `08` §8.8、`11` §11.5：反射批准率阈值 `> 0.95` → `≥ 0.95`（与 `08` §8.9.2 规则 D、`09` §9.9 一致）。
- `15` ADR-032：关闭 `log` 后常驻“约 250 token” → “约 280 token（`05` §5.6.3 实测口径）”。
- `15` ADR-040：“S4 容器/微 VM”“可选 S4（Gondolin/容器）” → “S3 微型 VM（Gondolin）/ S4 容器”（与 `11` §11.6.1 档位定义一致）。
- `11` T22 残余风险：**低** → **中**（`09` §9.2.1 已上调并要求 `11` 同步；`reviews/round-1-response-07-08-09.md` R1-D12-01）。

### 决策对齐（按 ADR 或任务给定口径）

- `04` §4.4.4“需要你”行：提示模式下“持续 ≥ 30 分钟”生成积压条目 → 提示模式 `H ≤ −C/2`、阻止模式“持续 ≥ 30 分钟”（`08` §8.5.5 是该规则的所属文档，`04` 本已声明“按 `08`”）。
- 远程能力（R1-D8-03）：`04` §4.14（“手机不能验收、只能拒绝审批”）、`06` §6.4.7、`11` §11.9 统一为 `16` §16.5：远程验收仅限 low/standard，且全部单元已在桌面或 Web 上有效评审、无未关闭 `requiresChange` 评论、`human` 标准已勾选、已验证结果新鲜；`high` 与单向门只在本机桌面；非单向门审批可远程批准（`06` 的 `decide` scope）。`06` 的“禁止远程”清单补 `settings.set_capacity`、`autonomy.revoke`、`sentinel.override`、用户检出中的本地合并与 docker 批准（`04` 的 UX 立场；`06` 本身声明逐命令归属由注册表决定）。`11` §11.9 改为引用这些条件。
- `03` §3.4.6：崩溃恢复引用 `06` §6.1.4（应用退出）→ `06` §6.1.6（启动时中间状态恢复表）。
- `07` §7.4.10 等处的“机会式验证”未改；ADR-019 表未列它，注册表 §16.6 以 ADR-020 为依据列入（不是冲突）。

## 3. 过时术语扫描结果

| 术语 | 修正后剩余 | 说明 |
|---|---|---|
| `reviewCapacityLocPerDay` | `15` ADR-014（更名说明） | 历史说明，保留 |
| `requireAllUnitsViewed` | 0 | |
| `cleanEnv` | `02`、`05`、`07`（均为“已删除”说明） | 保留 |
| chord | `06` §6.4.6、`14`（SP1 取消、K1 风险）、`15` ADR-005 | 均为“不依赖”的说明 |
| `~/.tower/worktrees` | 只以“回退”出现（`06`、`07`、`09`、`10`、`15`） | 符合 ADR-008 |
| `.tower-wt/`（无 `.noindex`） | 0 | |
| “≤ 400 token” | `05` §5.8、`07` §7.10.3（返工证据，ADR-009 正确值）；`15` ADR-009 背景 | 不再指简报 |
| “≤ 600 token” | 0 | |
| `sessionPath` / `session_path` | 0（注册表废弃表除外） | |
| `actionable` 布尔 / 评论 `blocking` | 0 | `blocking` 只剩 `07` 中的局部变量名与 `reviewBacklogMode` 取值 |
| `eta` | `02`、`05`、`08`、`09`、`15` 中的“无 eta / 已删除”说明 | |
| `tainted` | 0（注册表废弃表除外） | |
| “MCP 默认关” | 0（`15` ADR-032 中“删除该说法”的记录） | |
| 主干修订状态 | 0 | |

## 4. 未解决的冲突（ADR 未裁决，未改动设计）

| # | 冲突 | 位置 | 说明 / 建议 |
|---|---|---|---|
| U1 | **答案撤销窗口**：`05` §5.6.4 规定发送前保留 5 s（`answerHoldMs`）可撤销；`04` §4.8.2、F3 与 `12` DecisionCard 写“确认即送达、不可撤销”，且 F3 引用的正是 `05` §5.6.4 | `04`、`05`、`12`；两份回应文件（`round-1-response-05-06.md` 与 `-04-12.md`）对 R1-D5-11 的处理相反 | ADR-023 未涉及。需二选一：保留 5 s 窗口（改 `04`/`12`），或删除 `answerHoldMs`（改 `05`） |
| U2 | `pauseReason:"post_settle_activity"` 在 `02` 枚举中（本次已同步到 DDL），但 ADR-025、`03` §3.2、`05` §5.5 都规定“撤回到 `running` + anomaly”，没有任何流程以此原因暂停 | `02` §2.4 | 删除该取值，或定义“反复出现时暂停”的规则 |
| U3 | `question` 在 `riskTier ≥ standard` 下超时 = 暂停（`08` §8.7.1，`05` §5.6.4 `pause:true`），但 `pauseReason` 没有对应取值（`08` 只写“记为等待回答”） | `02` §2.4、`08` §8.7.1 | 建议新增如 `question_timeout`；需 `02` 所有者确认 |
| U4 | `maxConcurrentGoals` 可设范围：`06` §6.2.4 写 1–16，`04` §4.15 写“默认 3，可到 5” | `04`、`06` | ADR-038 只规定 M1 ≤ 3；M2 支持到 10（`14` §14.4.1） |
| U5 | 依赖安装失败的处理：`08` §8.6.5 → `stalled{prepare_failed}`（L2）；`10` §10.3.1 → 不阻止 Run，带 Fact `prepare{ok:false}` 进入 running | `08`、`10` | 需决定准备失败是否打扰人 |
| U6 | 回执界面文案：`04` F4 与 `12` 术语表为“排队 / 已送达 / 已回复 / 已处理”；`05` §5.7.3 为 `seenAtEntry`“已进入上下文”、`acknowledged`“已确认”。“已回复”对应哪个状态不明 | `04`、`05`、`12` | 文案层，需 `12` 所有者裁定 |
| U7 | 手机端“批准小额预算延长”的“小额”无阈值 | `04` §4.14；注册表 §16.5 标 ⚠ | 定义阈值或去掉“小额” |
| U8 | 审批卡上的“本 Goal 内同类”授权能否在远程选择未规定（项目级授权 `autonomy.grant` 明确仅本机） | `06` §6.4.7、`11` §11.2 | 注册表 §16.5 标 ⚠ |
| U9 | `stalled` 子类型只命名了 `loop`、`silent`、`provider_silent`、`unresponsive`、`crashed`、`idle_without_submit`、`prepare_failed`、`engine_error`；S3/S4/S6/S7 escalate 时的子类型未命名 | `07` §7.7.1、`08` §8.4 | 由 `07`/`08` 所有者补全 |
| U10 | 注册表为原文只有规则号的两个检测器命名：`snapshot_changed`（R-T4）、`test_config_changed`（R-T6）（§16.1.6 带 †） | `07` §7.5.2 | 需 `07` 所有者确认或改名 |
| U11 | 密钥熵阈值两处不同：`07` §7.6.6 哨兵 ≥ 3.5 bit/char（≥ 16 字符）；`11` §11.7 脱敏 ≥ 4.0 bit/char（≥ 20 字符） | `07`、`11` | 用途不同，可能是有意的；注册表分两行登记，待确认 |
| U12 | 目录名：`06` §6.6.1 的数据目录布局没有 `10` §10.16.3 使用的 `~/.tower/backup/`（Goal bundle）与 `09` §9.12.1 的 `~/.tower/diag/`；且 `backup/` 与已有的 `backups/`（DB 备份）仅差一个字母 | `06`、`09`、`10` | 建议在 `06` §6.6.1 补全并改名区分 |
