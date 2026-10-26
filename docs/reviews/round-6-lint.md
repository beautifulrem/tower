# 第 6 轮 · 一致性 lint 报告（ADR-039）

日期：2026-10-15 · 范围：`docs/00`–`docs/16`、`README.md` · 依据：`16-registry.md`、`15` ADR-001–095（新增 ADR-089–095；ADR-072 Superseded；M1 = 31 个日历周，+1 人 = 28 周）、`reviews/round-6.md` 与第 6 轮回应。原则同前：只做机械修正（ADR 与登记表优先于文档作者的落地口径），设计冲突列入 §4。

## 1. 方法与结果

| 检查 | 做法 | 结果 |
|---|---|---|
| 章节引用 | `python3 docs/reviews/lint/xref.py` | 2376 处、549 个编号标题、ADR-001–095：**0 断链、0 文档号不符** |
| 引用主题 | 抽取含 ADR-089–095 / R6- 的行中全部 133 处 § 引用，随机抽 70 处逐条比对目标标题 | 无指错（`05` §5.3.6 → `03` §3.4.2 “运行”中确有“人接管与交还”段） |
| 枚举 16 ↔ 02 ↔ 06 DDL ↔ 用法 | 脚本 | `HumanDecision.kind` 在 `02`/`16` 一致；DDL `CHECK` 值全部已登记；`hand_back` 模式在 `06` 与 `16` 不一致（§2.2，已改）；ActionClass `02`/`11`/`16` 均为 27 类、含 `read.pi_resources` |
| DDL ↔ 02（规则 a） | 脚本 | `goals.take_over_from` 与 `02` `Goal.takeoverFrom` 的蛇形名 `takeover_from` 不符（已改）；`human_checkout`、`depcache_entries` 与 `02`/`07` 一致；其余差异为既有的嵌套/展平映射 |
| 环境变量 ↔ §16.8（规则 b） | 脚本 | 未登记项均为 git/凭据/应用变量（`GIT_CONFIG_*`、`GH_TOKEN`、`DATABASE_URL` 等），不属于包管理器表；Playwright 行仍写“I 执行 `playwright install`”，与 ADR-093 预取器不符（已改） |
| V 列（规则 c） | 逐格脚本 | **通过**：V 列不含 `$GS`、卫星、`_gitdirs`、`$TMPDIR/tower-*`；I-install 只写 `$VS/staging/<installRunId>`、`$TI` 拒绝已写入角色说明与 `TMPDIR` 行 |
| (d) Fact 名 / 检测器 id | 脚本 | 唯一未登记：`git_control_tampered`，只出现在 Superseded 的 ADR-072 正文与退役说明中；`runner_patched` 已在 `16` §16.1.6 |
| (e) 命令 ↔ `HumanDecision.kind` | 脚本 | 双向 0 缺项 |
| **(f) sentinel / anomaly 分类** | 按 `07` §7.10.1 规则扫描全部 `sentinel{…}`/`anomaly{…}` | 1 处错误：`06` §6.1.6 中间状态恢复表把 `verifier_store_tampered` 记为 sentinel（已改为 anomaly）；`runner_patched` 各处均为 sentinel |
| **(g) git 垫片（ADR-088/090）** | grep “垫片”、`GIT_DIR` 全部出现 | `05` §5.3.6、`10` §10.6.1、`16` §16.2.6 已含“剥离继承变量”；`16` §16.8 `PATH` 行与 §16.1.13 废弃行只写“注入”（已补 ADR-090） |
| **(h) `Checkpoint` ↔ DDL（含 `projectId`）** | 逐字段 | `10` §10.7.1 与 `06` `checkpoints` 一致，主键 `(goal_id, project_id, n)`——第 5 轮 U1 已落地；`checkpoint.diff {goalId, n}` 缺 `projectId`（已改）；`run.rewind`/`run.fork_goal` 见 §4 U1 |
| 废弃项 | 先补 `16` §16.1.13 再 grep | 见 §3 |
| 数值 | §16.2 ↔ 所属 § | 运行器复核 ≤ 1 s、垫片 ≤ 5 ms 只在 `13`/`07`，`16` §16.2.7 未登记（已补）；威胁表范围 T1–T29 → T1–T32 |
| M1/M2 与日期 | `14` §14.3.4、ADR-038、`16` | 2026-11-09 + 31 周 → 2027-06-11 ✓；第 27 周末冻结、第 28–30 周自用 ✓；+1 人：第 24 周末冻结、28 周至 2027-05-21 ✓；试点 n = 6 的周次未随顺延（已改） |
| 00 §0.5.1 | 对照 ADR-089/090/091 | 夹具 `git init` 在卫星内失败、绝对路径 git、技能在 S2 中运行三行均已存在 |
| ⌘⇧T | `16` §16.3 ↔ `04` | 一致（经信任提示在人工编辑检出中打开，从不打开卫星） |

## 2. 改动清单（文件：之前 → 之后）

### 2.1 分类、DDL 与命令

- `06` §6.1.6 中间状态恢复表“安装器”行：`sentinel{detector:"verifier_store_tampered"}` → `anomaly{…}`（`07` §7.10.1）。
- `06` `goals` DDL：`take_over_from` → `takeover_from`（`02` `Goal.takeoverFrom`）。
- `06` §6.4.2 订阅主题：`checkpoint.diff {goalId, n}` → `{goalId, projectId, n}`（与 `checkpoints` 主键一致）。

### 2.2 `hand_back` 模式（ADR-094）

- `06` §6.4.3 `goal.hand_back`：`mode: "agent" | "verify"` → `"continue_agent" | "reverify"`，正文同步；与 `16` §16.1.3 `hand_back` 模式行一致。

### 2.3 登记表（`16`）

- §16.1.13 新增废弃行：“每次验证的重放包都永久保留、每个重放包都写镜像保留 ref” → 只有决定性验证（ADR-095）。
- §16.1.13 “Agent 沙箱 bash 全局导出 `GIT_DIR`”行与 §16.8 `PATH` 行：补“对卫星外或 `init`/`clone` 的调用剥离继承来的同名变量（ADR-090）”。
- §16.1.13 M1 行依据：“ADR-038 待主干同步” → “ADR-038”（ADR-038 已写 31 周 / 28 周）。
- §16.1.1 `Goal.resumeTo` 备注：与 `06` DDL 的 `CHECK`（允许 `alsoApplies` 中含 `satellite_missing`）对齐。
- §16.2.7 新增两行：运行器完整性复核（≤ 1 s；回退 ≤ 3 s；`13` §13.11.1、`07` §7.4.3）；Agent 侧 git 垫片（≤ 5 ms；> 10 ms 改 `posix_spawn`）。
- §16.8 Playwright 行 I 列：“I 执行 `playwright install`” → “I-prefetch：Tower 内置预取器按 lockfile 版本下载，不执行依赖代码（ADR-093）”。
- §16.7 章节索引：“威胁表 T1–T29” → “T1–T32”。

### 2.4 其他

- `14` §14.5.1 试点 n = 6：“M1 第 26–28 周（自用期）” → “第 28–30 周”。
- `02` `WorkspaceBinding.attach` 注释：补“分离 gitdir 整体归 Agent，工作目录任意深度不可创建 `.git`（ADR-089）”；`AutonomyPolicy.levels` 注释：“ActionClass 共 26 类” → “27 类（含 `read.pi_resources`，ADR-091）”。
- `15` 修订注（只加标头注释，不改决策）：ADR-070、ADR-083 ← ADR-095；ADR-082 ← ADR-091；ADR-084 ← ADR-094；ADR-085 ← ADR-092/093。

## 3. 过时术语扫描结果（修正后）

| 术语 | 剩余出现 | 说明 |
|---|---|---|
| `git_control_tampered` | `15` ADR-072（Superseded）正文、ADR-089；`05`/`06`/`07`/`10`/`11` 中只以“已退役”出现；`16` §16.1.13 | 无现行用法 |
| gitdir 写入白名单 | `10` §10 引言、`11` §11.6.2、T29、`05` §5.3.6、`14` 增量说明 | 全部为“已取消”的历史说明 |
| 控制文件哈希校验 | `11` §11.6.2、T29、`06` GitService、`05` settle 行 | 全部为“取消/退役” |
| “+1 人 26 周” | `14` §14.3.4（作为被否定的旧估算） | 现行 28 周 |
| 每次验证都永久保留重放包 | 0（只在 `16` §16.1.13 废弃表） | `07` §7.4.1、`06` §6.6.4、`10` §10.17.1 均为 ADR-095 口径 |
| `mode:"agent"`/`"verify"`（交还） | 0 | — |

## 4. 未解决的冲突

| # | 冲突 | 位置 | 说明 / 建议 |
|---|---|---|---|
| U1 | **多仓库 Goal 的回退/分叉目标**：检查点按仓库独立编号（`10` §10.13，主键含 `project_id`），但 `run.rewind`/`run.fork_goal` 只带 `checkpointN`，多仓库时有歧义 | `06` §6.4.3、`10` §10.8、§10.13 | 需决定：按共享的 `piEntryId` 同时回退全部仓库，还是参数加 `projectId`（只回退一个仓库会使仓库间不一致）。多仓库是 M3，单仓库不受影响 |
| U2 | **Prisma 引擎的预取位置**：ADR-093、`07` §7.4.3 阶段 2、`10` §10.4 写“浏览器、引擎、Node 头文件放入 `$SH`”；`16` §16.8 的角色说明与 `XDG_CACHE_HOME` 行写 I-prefetch 写 `$VS/xdg`（Prisma 无专用变量，引擎在 XDG 缓存下，ADR-063），V 从 `$VS/xdg` 读 | `15` ADR-093、`07` §7.4.3、`16` §16.8 | 两种都满足 V 列规则。需选一处：把 `XDG_CACHE_HOME`（I、V）改到 `$SH/xdg`，或在 ADR-093/`07` 中写明 Prisma 例外。涉及 ADR 文字，未改 |

第 5 轮未决项：U1（`Checkpoint` 无 `projectId`）已由作者落地（接口与 DDL 均含 `projectId`）；U2（回应文件把 `verifier_store_tampered` 称为 sentinel）——本轮发现 `06` 正文也有同一错误，已改正。

## 5. 复现

```
python3 docs/reviews/lint/xref.py
python3 docs/reviews/lint/xref.py --dump refs.tsv
```

(f) 的判据：`07` §7.10.1 表后的分类规则（sentinel = `nested_repo`、`lifecycle_script_changed`、`runner_tampered`、`prepare_untracked_output`、`runner_patched`；anomaly = `verifier_store_tampered`、`stat_cache_mismatch`、`post_settle_activity`、`structured_content_dropped`、循环/停滞、`claim_contradicted`）。(h) 的判据：`10` §10.7.1 `Checkpoint` 的每个字段在 `06` `checkpoints` 中有同名列、可空性一致，且所有以检查点为键的命令带全主键。
